import type { FastifyRequest, FastifyReply } from 'fastify';
import { GetPhotoParamsSchema, GetPhotoQuerySchema } from '../schemas/photo.schema.js';
import type { IPlayService, IImageProcessorService } from '../types.js';

export class PhotoController {
  constructor(
    private readonly playService: IPlayService,
    private readonly imageProcessor: IImageProcessorService
  ) {}

  /**
   * Возвращает ID следующего случайного фото из плейлиста
   */
  public getNext = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const photo = this.playService.getNext();

      if (!photo) {
        reply.status(404).send({ error: 'No photos available' });
        return;
      }

      reply.send(photo);
    } catch (err) {
      reply.status(500).send({ error: 'Internal server error' });
    }
  };

  /**
   * Возвращает бинарный поток изображения, ресайз которого выполняется на лету
   */
  public getPhoto = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // 1. Валидация параметров (id, w, h) через Zod
      const { id } = GetPhotoParamsSchema.parse(req.params);
      const { w, h } = GetPhotoQuerySchema.parse(req.query);

      // 2. Поиск фото в плейлисте
      const photoItem = this.playService.getById(id);
      console.log('[Controller] Found photo:', photoItem); // <-- временно

      if (!photoItem) {
        reply.status(404).send({ error: 'Photo not found' });
        return;
      }

      // 3. Потоковая обработка изображения (ресайз и EXIF)
      const imageStream = await this.imageProcessor.process(photoItem, {
        width: w,
        height: h,
      });

      // 4. Отдача потока с соответствующим типом контента
      reply
        .header('Content-Type', 'image/jpeg')
        .header('Cache-Control', 'public, max-age=3600')
        .send(imageStream);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        reply.status(400).send({ error: 'Invalid parameters', details: err.errors });
        return;
      }

      reply.status(500).send({ error: 'Image processing failed' });
    }
  };
}
