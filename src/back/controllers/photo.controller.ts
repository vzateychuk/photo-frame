import type { FastifyRequest, FastifyReply } from 'fastify';
import { GetPhotoParamsSchema, GetPhotoQuerySchema } from '../schemas/photo.schema.js';
import type { IPlayService, IImageProcessorService } from '../types.js';
import type { Readable } from 'node:stream';

export class PhotoController {
  constructor(
    private readonly playService: IPlayService,
    private readonly imageProcessor: IImageProcessorService
  ) { }

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
   * Возвращает бинарный поток изображения, ресайз которого выполняется на лету.
   * Заголовки ставятся только после первого успешно прочитанного чанка,
   * чтобы при ошибке Sharp можно было отдать JSON 500, а не image/jpeg.
   */
  public getPhoto = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { id } = GetPhotoParamsSchema.parse(req.params);
      const { w, h } = GetPhotoQuerySchema.parse(req.query);

      const photoItem = this.playService.getById(id);

      if (!photoItem) {
        reply.status(404).send({ error: 'Photo not found' });
        return;
      }

      const imageStream = await this.imageProcessor.process(photoItem, {
        width: w,
        height: h,
      });

      await this.streamImage(imageStream, reply);
    } catch (err: any) {
      if (reply.raw.headersSent) {
        reply.raw.destroy();
        return;
      }

      if (err?.name === 'ZodError') {
        reply.status(400).send({ error: 'Invalid parameters', details: err.errors });
        return;
      }

      reply.status(500).send({ error: 'Image processing failed' });
    }
  };

  private streamImage(imageStream: Readable, reply: FastifyReply): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let headersSent = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        imageStream.off('data', onFirstData);
        imageStream.off('error', onError);
        imageStream.off('end', onEndBeforeHeaders);
        reply.raw.off('close', onClose);
        reply.raw.off('finish', onFinish);

        if (err) reject(err);
        else resolve();
      };

      const onError = (err: Error) => {
        imageStream.destroy();
        if (headersSent) {
          reply.raw.destroy();
          finish();
          return;
        }
        finish(err);
      };

      const onClose = () => {
        imageStream.destroy();
        finish();
      };

      const onFinish = () => finish();

      const onEndBeforeHeaders = () => {
        if (!headersSent) {
          finish(new Error('Empty image stream'));
        }
      };

      const onFirstData = (chunk: Buffer | string) => {
        imageStream.off('data', onFirstData);
        imageStream.off('end', onEndBeforeHeaders);

        reply.hijack();
        reply.raw.setHeader('Content-Type', 'image/jpeg');
        reply.raw.setHeader('Cache-Control', 'public, max-age=3600');
        headersSent = true;

        reply.raw.write(chunk);
        imageStream.pipe(reply.raw);
        reply.raw.on('finish', onFinish);
      };

      imageStream.once('data', onFirstData);
      imageStream.once('end', onEndBeforeHeaders);
      imageStream.on('error', onError);
      reply.raw.on('close', onClose);
    });
  }
}
