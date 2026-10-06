import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { randomUUID } from 'crypto';

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
      .filter((entry) => entry.isFile() && /\.(jpe?g|png|gif)$/i.test(entry.name))
      .map((entry) => {
        const fullPath = path.resolve(entry.parentPath, entry.name);
        return {
          id: randomUUID(),
          path: fullPath,
        };
      });
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
