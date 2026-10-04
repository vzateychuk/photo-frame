import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

export class PhotoScannerService {
  constructor(private readonly rootDir: string) {}

  async scan(): Promise<string[]> {
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
      .filter((entry) => entry.isFile() && /\.(jpe?g|png)$/i.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name));
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
