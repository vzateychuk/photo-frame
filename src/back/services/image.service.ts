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

    const pipeline = sharp(photo.path)
      .rotate()
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