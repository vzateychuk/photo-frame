import { describe, it, expect, beforeEach } from 'vitest';
import { ImageProcessorService } from '../../services/image.service.js';
import type { PhotoItem } from '../../types.js';
import { Readable } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  // Файл с расширением .jpg, но по содержимому — PNG (Sharp определяет формат по magic bytes)
  const validPhotoPath = path.join(fixturesDir, 'valid.jpg');
  const corruptedPhotoPath = path.join(fixturesDir, 'corrupted.jpg');
  // Опциональная фикстура: оригинальный Samsung JPEG с SOS-warning (в .gitignore)
  const samsungSosPath = path.join(fixturesDir, 'samsung-sos-warning.jpg');

  beforeEach(() => {
    service = new ImageProcessorService();
  });

  const consumeStream = (stream: Readable): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  };

  it('should return a readable JPEG stream for a valid image', async () => {
    const photo: PhotoItem = { id: '1', path: validPhotoPath };
    const stream = await service.process(photo, { width: 100, height: 100 });

    expect(stream).toBeInstanceOf(Readable);

    const data = await consumeStream(stream);
    expect(data.length).toBeGreaterThan(0);
    expect((await sharp(data).metadata()).format).toBe('jpeg');
  });

  it('should accept PNG input and emit JPEG', async () => {
    const photo: PhotoItem = { id: 'png', path: validPhotoPath };
    const data = await consumeStream(
      await service.process(photo, { width: 64, height: 64 }),
    );
    const meta = await sharp(data).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeLessThanOrEqual(64);
    expect(meta.height).toBeLessThanOrEqual(64);
  });

  it('should reject when file does not exist', async () => {
    const photo: PhotoItem = { id: '2', path: '/non/existent/path.jpg' };
    const stream = await service.process(photo, { width: 100, height: 100 });

    await expect(consumeStream(stream)).rejects.toThrow();
  });

  it('should reject for corrupted image files', async () => {
    const photo: PhotoItem = { id: '3', path: corruptedPhotoPath };
    const stream = await service.process(photo, { width: 100, height: 100 });

    await expect(consumeStream(stream)).rejects.toThrow();
  });

  it.skipIf(!fs.existsSync(samsungSosPath))(
    'should process Samsung JPEG with Invalid SOS warning (failOn: error)',
    async () => {
      // Без failOn: 'error' Sharp падает с VipsJpeg: Invalid SOS parameters...
      await expect(
        sharp(samsungSosPath).resize(100).jpeg().toBuffer(),
      ).rejects.toThrow(/Invalid SOS parameters/);

      const photo: PhotoItem = { id: 'samsung', path: samsungSosPath };
      const data = await consumeStream(
        await service.process(photo, { width: 100, height: 100 }),
      );
      expect(data.length).toBeGreaterThan(0);
      expect((await sharp(data).metadata()).format).toBe('jpeg');
    },
  );
});
