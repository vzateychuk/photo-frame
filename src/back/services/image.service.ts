   import sharp from 'sharp';
   import type { Readable } from 'node:stream';
   import type { PhotoItem } from '../types';
   import { IImageProcessorService } from '../types';

   export class ImageProcessorService implements IImageProcessorService {
     public async process(
       photo: PhotoItem,
       dimensions: { width: number, height: number }
     ): Promise<Readable> {
       // sharp() возвращает Duplex поток (Readable + Writable),
       // который сразу начинает работу при чтении.
       // Ошибки (файл не найден, битый формат) всплывут в событии 'error' этого потока.
       const pipeline = sharp(photo.path)
         .rotate()
         .resize({
           width: dimensions.width,
           height: dimensions.height,
           fit: 'inside',
           withoutEnlargement: true,
         })
         .jpeg({ quality: 80, mozjpeg: true });

       return pipeline as unknown as Readable;
     }
   }