import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PhotoScannerService, photoIdFromPath } from '../../services/scanner.service.js';
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

  it('should recursively find jpeg, png, gif and webp files', async () => {
    const subdir = path.join(rootDir, 'subdir');
    await fs.mkdir(subdir);
    await Promise.all([
      fs.writeFile(path.join(rootDir, 'photo1.jpg'), ''),
      fs.writeFile(path.join(rootDir, 'photo2.png'), ''),
      fs.writeFile(path.join(rootDir, 'anim.gif'), ''),
      fs.writeFile(path.join(rootDir, 'shot.webp'), ''),
      fs.writeFile(path.join(rootDir, 'notes.txt'), ''),
      fs.writeFile(path.join(subdir, 'photo3.jpeg'), ''),
      fs.writeFile(path.join(subdir, 'photo4.PNG'), ''),
      fs.writeFile(path.join(subdir, 'photo5.GIF'), ''),
      fs.writeFile(path.join(subdir, 'photo6.WEBP'), ''),
      fs.writeFile(path.join(subdir, 'readme.md'), ''),
    ]);

    const photos = await service.scan();

    expect(photos).toHaveLength(8);
    const paths = photos.map(p => p.path);
    expect(paths).toContain(path.join(rootDir, 'photo1.jpg'));
    expect(paths).toContain(path.join(rootDir, 'photo2.png'));
    expect(paths).toContain(path.join(rootDir, 'anim.gif'));
    expect(paths).toContain(path.join(rootDir, 'shot.webp'));
    expect(paths).toContain(path.join(subdir, 'photo3.jpeg'));
    expect(paths).toContain(path.join(subdir, 'photo4.PNG'));
    expect(paths).toContain(path.join(subdir, 'photo5.GIF'));
    expect(paths).toContain(path.join(subdir, 'photo6.WEBP'));
    expect(paths).not.toContain(path.join(rootDir, 'notes.txt'));
    expect(paths).not.toContain(path.join(subdir, 'readme.md'));
    photos.forEach(p => {
      expect(p.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(p.id).toBe(photoIdFromPath(p.path));
    });
  });

  it('should assign the same id for the same path across scans', async () => {
    await fs.writeFile(path.join(rootDir, 'stable.jpg'), 'same-bytes');

    const first = await service.scan();
    const second = await service.scan();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]!.id).toBe(second[0]!.id);
    expect(first[0]!.id).toBe(photoIdFromPath(first[0]!.path));
  });

  it('should assign different ids for different paths', async () => {
    await Promise.all([
      fs.writeFile(path.join(rootDir, 'a.jpg'), 'same-bytes'),
      fs.writeFile(path.join(rootDir, 'b.jpg'), 'same-bytes'),
    ]);

    const photos = await service.scan();
    const ids = new Set(photos.map((p) => p.id));

    expect(photos).toHaveLength(2);
    expect(ids.size).toBe(2);
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

describe('photoIdFromPath', () => {
  it('should return a deterministic UUID-shaped id', () => {
    const id = photoIdFromPath('/data/photos/vacation/img.jpg');
    expect(id).toBe(photoIdFromPath('/data/photos/vacation/img.jpg'));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(id).not.toBe(photoIdFromPath('/data/photos/vacation/other.jpg'));
  });
});
