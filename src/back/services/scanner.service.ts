import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { PlaylistService } from './playlist.service.js';

export interface PhotoItem {
  id: string;
  path: string;
}

export interface FolderItem {
  id: string;
  path: string;
  name: string;
  parentId: string | null;
}

export interface ScanResult {
  photos: PhotoItem[];
  folders: FolderItem[];
}

/** Минимальный логгер: достаточно метода info со строкой. */
export type ScanLogger = {
  info: (msg: string) => void;
};

export class PhotoScannerService {
  constructor(
    private readonly rootDir: string,
    private readonly logger?: ScanLogger,
  ) {}

  async scan(): Promise<ScanResult> {
    const rootDir = path.resolve(this.rootDir);
    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(rootDir, {
        withFileTypes: true,
        recursive: true,
      });
    } catch (error) {
      if (isNotFoundError(error)) return { photos: [], folders: [] };
      throw error;
    }

    const photos: PhotoItem[] = [];
    const folders: FolderItem[] = [];

    for (const entry of entries) {
      const fullPath = path.resolve(entry.parentPath, entry.name);

      if (entry.isFile() && /\.(jpe?g|png|gif|webp)$/i.test(entry.name)) {
        photos.push({
          id: photoIdFromPath(fullPath),
          path: fullPath,
        });
        continue;
      }

      if (entry.isDirectory()) {
        if (fullPath === rootDir) continue;
        const parentPath = path.dirname(fullPath);
        folders.push({
          id: photoIdFromPath(fullPath),
          path: fullPath,
          name: entry.name,
          parentId: parentPath === rootDir ? null : photoIdFromPath(parentPath),
        });
      }
    }

    return { photos, folders };
  }

  /**
   * Приводит плейлист к диску: добавляет новые фото, убирает отсутствующие,
   * обновляет индекс папок.
   */
  async syncWithPlaylist(playlistService: PlaylistService): Promise<void> {
    this.logger?.info('Syncing photos with disk...');
    const { photos: diskPhotos, folders: diskFolders } = await this.scan();
    const diskIds = new Set(diskPhotos.map((photo) => photo.id));

    const removed = playlistService.removePhotosNotIn(diskIds);
    let added = 0;
    for (const photo of diskPhotos) {
      if (!playlistService.getById(photo.id)) {
        playlistService.addPhoto(photo);
        added += 1;
      }
    }
    // removePhotosNotIn уже сбросил курсоры при удалениях; при только добавлениях — здесь
    if (added > 0 && removed === 0) {
      playlistService.clearScopes();
    }
    const foldersChanged = playlistService.replaceFolders(diskFolders);

    if (added > 0 || removed > 0 || foldersChanged) {
      this.logger?.info(
        `Sync done: +${added} photo(s), -${removed} photo(s), folders=${diskFolders.length}`,
      );
    }
  }

  /**
   * Запускает периодическое сканирование директории для обновления плейлиста.
   * Использует рекурсивный setTimeout, чтобы избежать наложения циклов.
   */
  startAutoScan(playlistService: PlaylistService, intervalMs: number = 600_000): void {
    const run = async () => {
      try {
        await this.syncWithPlaylist(playlistService);
      } catch (err) {
        console.error('[AutoScan Error]', err);
      } finally {
        setTimeout(run, intervalMs);
      }
    };
    setTimeout(run, intervalMs);
  }
}

/** Stable UUID-shaped id from absolute path (same path → same id across restarts). */
export function photoIdFromPath(absolutePath: string): string {
  const hash = createHash('sha256').update(absolutePath).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
