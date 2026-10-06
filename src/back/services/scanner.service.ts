import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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

export class PhotoScannerService {
  constructor(private readonly rootDir: string) {}

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
