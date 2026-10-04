import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PhotoScannerService } from '../../services/scanner.service.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('PhotoScannerService', () => {
  let rootDir: string;
  let service: PhotoScannerService;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-scanner-'));
    service = new PhotoScannerService(rootDir);
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('should recursively find only jpeg and png files', async () => {
    const subdir = path.join(rootDir, 'subdir');
    await fs.mkdir(subdir);
    await Promise.all([
      fs.writeFile(path.join(rootDir, 'photo1.jpg'), ''),
      fs.writeFile(path.join(rootDir, 'photo2.png'), ''),
      fs.writeFile(path.join(rootDir, 'notes.txt'), ''),
      fs.writeFile(path.join(subdir, 'photo3.jpeg'), ''),
      fs.writeFile(path.join(subdir, 'photo4.PNG'), ''),
      fs.writeFile(path.join(subdir, 'readme.md'), ''),
    ]);

    const photos = await service.scan();

    expect(photos).toHaveLength(4);
    expect(photos).toContain(path.join(rootDir, 'photo1.jpg'));
    expect(photos).toContain(path.join(rootDir, 'photo2.png'));
    expect(photos).toContain(path.join(subdir, 'photo3.jpeg'));
    expect(photos).toContain(path.join(subdir, 'photo4.PNG'));
    expect(photos).not.toContain(path.join(rootDir, 'notes.txt'));
    expect(photos).not.toContain(path.join(subdir, 'readme.md'));
  });

  it('should handle empty directory', async () => {
    const photos = await service.scan();
    expect(photos).toEqual([]);
  });

  it('should return empty array if root directory does not exist', async () => {
    service = new PhotoScannerService(path.join(rootDir, 'missing'));
    const photos = await service.scan();
    expect(photos).toEqual([]);
  });

  it('should ignore directories during final filter', async () => {
    await fs.mkdir(path.join(rootDir, 'folder'));
    const photos = await service.scan();
    expect(photos).toEqual([]);
  });
});
