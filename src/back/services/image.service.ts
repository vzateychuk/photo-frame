import sharp from 'sharp';
import { PassThrough } from 'node:stream';
import type { Readable } from 'node:stream';
import type { PhotoItem } from '../types.js';
import type { IImageProcessorService } from '../types.js';

export class ImageProcessorService implements IImageProcessorService {

  public async process(
    photo: PhotoItem,
    dimensions: { width: number, height: number }
  ): Promise<Readable> {

    // failOn: 'error' — пропускаем libjpeg-warning от Samsung JPEG
    // («Invalid SOS parameters for sequential JPEG»), но по-прежнему
    // падаем на truncated / реальных ошибках декодера.
    // Вход: JPEG/PNG/GIF/WebP (по magic bytes, не по расширению); выход всегда JPEG.
    const pipeline = sharp(photo.path, { failOn: 'error' })
      .rotate() // EXIF Orientation
      .resize({
        width: dimensions.width,
        height: dimensions.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80, mozjpeg: true });

    const passThrough = new PassThrough();
    
    pipeline.on('error', (err) => {
      console.error('[Sharp Pipeline Error]', photo.path, err.message);
      passThrough.destroy(err);
    });
    
    pipeline.pipe(passThrough);
    
    return passThrough;
  }
}