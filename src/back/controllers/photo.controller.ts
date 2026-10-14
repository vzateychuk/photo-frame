import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  GetNextQuerySchema,
  GetPhotoParamsSchema,
  GetPhotoQuerySchema,
  ListFoldersQuerySchema,
} from '../schemas/photo.schema.js';
import type { IPlayService, IImageProcessorService } from '../types.js';
import type { AccessKeyService } from '../keystore/access-key.service.js';
import { MissingPhotoFileError } from '../services/image.service.js';
import type { Readable } from 'node:stream';

export class PhotoController {
  constructor(
    private readonly playService: IPlayService,
    private readonly imageProcessor: IImageProcessorService,
    private readonly accessKeyService: AccessKeyService,
  ) {}

  /**
   * Возвращает ID следующего случайного фото из плейлиста.
   * Требует действующий query `key`; набор папок берётся из записи ключа.
   */
  public getNext = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { key: rawKey } = GetNextQuerySchema.parse(req.query);
      const accessKey = this.accessKeyService.resolve(rawKey);
      if (!accessKey) {
        reply.status(401).send({ error: 'access_denied' });
        return;
      }

      const folderIds = this.accessKeyService.folderIdsFor(accessKey);
      const { photo, unknownFolderIds } = this.playService.getNext(folderIds);

      for (const folderId of unknownFolderIds) {
        req.log.warn({ folderId }, 'Unknown folder id in key scope, skipped');
      }

      if (!photo) {
        reply.status(404).send({ error: 'No photos available' });
        return;
      }

      reply.send(photo);
    } catch (err) {
      if (isZodError(err)) {
        reply.status(400).send({ error: 'Invalid parameters', details: err.issues });
        return;
      }

      reply.status(500).send({ error: 'Internal server error' });
    }
  };

  /**
   * Список папок архива: id, имя, путь из имён, родитель, число фото (включая вложенные).
   * Опциональный query `q` — подстрока имени без учёта регистра.
   * Пути на диске не отдаются.
   */
  public listFolders = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { q } = ListFoldersQuerySchema.parse(req.query);
      const folders =
        q === undefined
          ? this.playService.listFolders()
          : this.playService.listFolders({ query: q });
      reply.send({ folders });
    } catch (err) {
      if (isZodError(err)) {
        reply.status(400).send({ error: 'Invalid parameters', details: err.issues });
        return;
      }
      reply.status(500).send({ error: 'Internal server error' });
    }
  };

  /**
   * Возвращает бинарный поток изображения, ресайз которого выполняется на лету.
   * Требует действующий query `key`; фото вне области ключа → 404.
   * Заголовки ставятся только после первого успешно прочитанного чанка,
   * чтобы при ошибке Sharp можно было отдать JSON 500, а не image/jpeg.
   */
  public getPhoto = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { id } = GetPhotoParamsSchema.parse(req.params);
      const { key: rawKey, w, h } = GetPhotoQuerySchema.parse(req.query);

      const accessKey = this.accessKeyService.resolve(rawKey);
      if (!accessKey) {
        reply.status(401).send({ error: 'access_denied' });
        return;
      }

      if (!this.accessKeyService.isPhotoAllowed(accessKey, id, this.playService)) {
        reply.status(404).send({ error: 'Photo not found' });
        return;
      }

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
    } catch (err: unknown) {
      if (reply.raw.headersSent) {
        reply.raw.destroy();
        return;
      }

      if (isZodError(err)) {
        reply.status(400).send({ error: 'Invalid parameters', details: err.issues });
        return;
      }

      // Нет файла на диске — не ошибка обработки, просто «фото не найдено»
      if (err instanceof MissingPhotoFileError) {
        reply.status(404).send({ error: 'Photo not found' });
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
        reply.raw.setHeader('Cache-Control', 'private, max-age=3600');
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

function isZodError(err: unknown): err is { name: string; issues: unknown } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'ZodError'
  );
}
