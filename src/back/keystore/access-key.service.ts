import type { AccessKey, IPlayService, KeyStore, PhotoId } from '../types.js';
import { normalizeKey } from './access-key.js';

export class AccessKeyService {
  constructor(private readonly store: KeyStore) {}

  /**
   * Normalizes the raw key, looks it up, and rejects expired records.
   * Missing, invalid, or expired → null (same outcome for callers).
   */
  resolve(rawKey: unknown): AccessKey | null {
    const key = normalizeKey(rawKey);
    if (key === null) {
      return null;
    }
    const record = this.store.get(key);
    if (!record) {
      return null;
    }
    if (record.expiresAt !== null) {
      const expiresMs = Date.parse(record.expiresAt);
      if (Number.isNaN(expiresMs) || expiresMs < Date.now()) {
        return null;
      }
    }
    return record;
  }

  /**
   * Folder filter for play/next: undefined means the whole archive ('all').
   */
  folderIdsFor(key: AccessKey): readonly string[] | undefined {
    if (key.folders === 'all') {
      return undefined;
    }
    return key.folders;
  }

  /**
   * True when the photo exists and lies inside the key's folder scope
   * (recursive folder union, same rules as PlaylistService.getNext).
   */
  isPhotoAllowed(
    key: AccessKey,
    photoId: PhotoId,
    playService: IPlayService,
  ): boolean {
    if (!playService.getById(photoId)) {
      return false;
    }
    const folderIds = this.folderIdsFor(key);
    return playService.isPhotoInScope(photoId, folderIds);
  }
}
