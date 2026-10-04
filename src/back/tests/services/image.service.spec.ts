   import { describe, it, expect, beforeEach } from 'vitest';
   import { ImageProcessorService } from '../../services/image.service.js';
   import type { PhotoItem } from '../../types.js';
   import { Readable } from 'node:stream';
   import path from 'node:path';

   describe('ImageProcessorService', () => {
     let service: ImageProcessorService;
     const fixturesDir = path.join(__dirname, '..', 'fixtures');
     const validPhotoPath = path.join(fixturesDir, 'valid.jpg');
     const corruptedPhotoPath = path.join(fixturesDir, 'corrupted.jpg');

     beforeEach(() => {
       service = new ImageProcessorService();
     });

     // Вспомогательная функция: читает поток до конца, возвращает буфер или выбрасывает ошибку
     const consumeStream = (stream: Readable): Promise<Buffer> => {
       return new Promise((resolve, reject) => {
         const chunks: Buffer[] = [];
         stream.on('data', (chunk) => chunks.push(chunk));
         stream.on('end', () => resolve(Buffer.concat(chunks)));
         stream.on('error', reject);
       });
     };

     it('should return a readable stream for a valid image', async () => {
       const photo: PhotoItem = { id: '1', path: validPhotoPath };
       const stream = await service.process(photo, { width: 100, height: 100 });

       expect(stream).toBeInstanceOf(Readable);

       // Обязательно потребляем поток, чтобы убедиться, что нет ошибок
       const data = await consumeStream(stream);

       expect(data.length).toBeGreaterThan(0);
     });

     it('should reject when file does not exist', async () => {
       const photo: PhotoItem = { id: '2', path: '/non/existent/path.jpg' };
       const stream = await service.process(photo, { width: 100, height: 100 });

       // Ошибка произойдет при чтении, а не при создании
       await expect(consumeStream(stream)).rejects.toThrow();
     });

     it('should reject for corrupted image files', async () => {
       const photo: PhotoItem = { id: '3', path: corruptedPhotoPath };
       const stream = await service.process(photo, { width: 100, height: 100 });

       await expect(consumeStream(stream)).rejects.toThrow();
     });
   });