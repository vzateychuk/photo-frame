import path from 'node:path';
import type {
  FolderId,
  FolderItem,
  ListFoldersOptions,
  PhotoItem,
  PlayNextResult,
  PublicFolder,
  PublicPhoto,
} from '../types.js';

export type { PhotoItem, PublicPhoto } from '../types.js';

interface PlaylistCursor {
  playlist: PhotoItem[];
  currentIndex: number;
}

export class PlaylistService {
  private photos: PhotoItem[] = [];
  private folders: FolderItem[] = [];
  private folderById = new Map<FolderId, FolderItem>();
  private scopes = new Map<string, PlaylistCursor>();

  /**
   * Загружает фото и папки в память и сбрасывает плейлисты.
   */
  load(photos: PhotoItem[], folders: FolderItem[] = []): void {
    this.photos = [...photos];
    this.folders = [...folders];
    this.folderById = new Map(folders.map((folder) => [folder.id, folder]));
    this.scopes.clear();
  }

  /** @deprecated Используйте load(). Оставлено для совместимости тестов. */
  loadPhotos(photos: PhotoItem[]): void {
    this.load(photos, []);
  }

  /**
   * Возвращает следующее фото из плейлиста.
   * Без folderIds — весь архив. С folderIds — объединение выбранных папок
   * и всех вложенных, без дублей. Неизвестные ID пропускаются и возвращаются
   * в unknownFolderIds (только при первом обращении к этому набору).
   */
  getNext(folderIds?: readonly FolderId[]): PlayNextResult {
    const resolved = this.resolveScope(folderIds);
    let cursor = this.scopes.get(resolved.scopeKey);
    let unknownFolderIds: FolderId[] = [];

    if (!cursor) {
      unknownFolderIds = resolved.unknownFolderIds;
      if (resolved.photos.length === 0) {
        return { photo: null, unknownFolderIds };
      }
      cursor = { playlist: shuffle(resolved.photos), currentIndex: 0 };
      this.scopes.set(resolved.scopeKey, cursor);
    }

    if (cursor.currentIndex >= cursor.playlist.length) {
      cursor.playlist = shuffle(cursor.playlist);
      cursor.currentIndex = 0;
    }

    const photoItem = cursor.playlist[cursor.currentIndex];
    cursor.currentIndex += 1;
    const photo: PublicPhoto | null = photoItem ? { id: photoItem.id } : null;
    return { photo, unknownFolderIds };
  }

  getById(id: string): PhotoItem | null {
    return this.photos.find((p) => p.id === id) ?? null;
  }

  /**
   * Публичный каталог папок без путей на диске.
   * С `query` — только папки, в чьём имени есть подстрока (без учёта регистра);
   * число фото считается только для отобранных папок.
   */
  listFolders(options?: ListFoldersOptions): PublicFolder[] {
    const query = options?.query?.trim().toLowerCase();
    const matched =
      query === undefined || query === ''
        ? this.folders
        : this.folders.filter((folder) => folder.name.toLowerCase().includes(query));

    return matched.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      pathLabel: this.folderPathLabel(folder),
      photoCount: this.photos.filter((photo) => isPathInside(folder.path, photo.path)).length,
    }));
  }

  private folderPathLabel(folder: FolderItem): string {
    const parts: string[] = [folder.name];
    let parentId = folder.parentId;
    while (parentId !== null) {
      const parent = this.folderById.get(parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      parentId = parent.parentId;
    }
    return parts.join(' / ');
  }

  private resolveScope(folderIds?: readonly FolderId[]): {
    photos: PhotoItem[];
    scopeKey: string;
    unknownFolderIds: FolderId[];
  } {
    if (!folderIds || folderIds.length === 0) {
      return { photos: [...this.photos], scopeKey: '', unknownFolderIds: [] };
    }

    const uniqueIds = [...new Set(folderIds)];
    const knownFolderIds: FolderId[] = [];
    const unknownFolderIds: FolderId[] = [];
    const folderPaths: string[] = [];

    for (const id of uniqueIds) {
      const folder = this.folderById.get(id);
      if (!folder) {
        unknownFolderIds.push(id);
        continue;
      }
      knownFolderIds.push(id);
      folderPaths.push(folder.path);
    }

    if (knownFolderIds.length === 0) {
      return {
        photos: [],
        scopeKey: `unknown:${scopeKey(uniqueIds)}`,
        unknownFolderIds,
      };
    }

    const seen = new Set<string>();
    const photos: PhotoItem[] = [];
    for (const photo of this.photos) {
      if (seen.has(photo.id)) continue;
      if (folderPaths.some((folderPath) => isPathInside(folderPath, photo.path))) {
        seen.add(photo.id);
        photos.push(photo);
      }
    }

    return {
      photos,
      scopeKey: scopeKey(knownFolderIds),
      unknownFolderIds,
    };
  }
}

function scopeKey(folderIds: readonly FolderId[]): string {
  return [...new Set(folderIds)].sort().join(',');
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

/** True if filePath is inside folderPath (file itself, not the folder path). */
export function isPathInside(folderPath: string, filePath: string): boolean {
  const relative = path.relative(folderPath, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
