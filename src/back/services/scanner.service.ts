import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface PhotoItem {
  id: string;
  path: string;
}

export class PhotoScannerService {
  constructor(private readonly rootDir: string) {}

  async scan(): Promise<PhotoItem[]> {
    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(this.rootDir, {
        withFileTypes: true,
        recursive: true,
      });
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }

    return entries
      .filter((entry) => entry.isFile() && /\.(jpe?g|png|gif|webp)$/i.test(entry.name))
      .map((entry) => {
        const fullPath = path.resolve(entry.parentPath, entry.name);
        return {
          id: photoIdFromPath(fullPath),
          path: fullPath,
        };
      });
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
