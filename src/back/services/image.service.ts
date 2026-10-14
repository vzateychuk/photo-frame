import sharp from 'sharp';
import { access, constants } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import type { Readable } from 'node:stream';
import type { PhotoItem } from '../types.js';
import type { IImageProcessorService } from '../types.js';

/** Файл есть в плейлисте, но на диске его уже нет. Sharp не запускаем. */
export class MissingPhotoFileError extends Error {
  readonly code = 'ENOENT';

  constructor(
    readonly photoId: string,
    options?: { cause?: unknown },
  ) {
    super(`Photo file missing on disk: ${photoId}`, options);
    this.name = 'MissingPhotoFileError';
  }
}

export class ImageProcessorService implements IImageProcessorService {
  private onError: ((photoId: string, error: Error) => void) | undefined = undefined;

  constructor(options?: { onError?: (photoId: string, error: Error) => void }) {
    this.onError = options?.onError;
  }

  public async process(
    photo: PhotoItem,
    dimensions: { width: number; height: number },
  ): Promise<Readable> {
    // До Sharp: нет файла → onError (убрать id) и MissingPhotoFileError, без пайплайна.
    try {
      await access(photo.path, constants.R_OK);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMissingFileError(error)) {
        this.onError?.(photo.id, error);
        throw new MissingPhotoFileError(photo.id, { cause: error });
      }
      throw error;
    }

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
      console.error('[Sharp Pipeline Error Debug]', {
        path: photo.path,
        message: err.message,
        code: (err as NodeJS.ErrnoException).code,
      });

      // Гонка: файл исчез между access и чтением Sharp — тоже убираем из плейлиста
      if (isMissingFileError(err) && this.onError) {
        this.onError(photo.id, err);
        passThrough.destroy(new MissingPhotoFileError(photo.id, { cause: err }));
        return;
      }

      passThrough.destroy(err);
    });

    pipeline.pipe(passThrough);

    return passThrough;
  }
}

function isMissingFileError(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || error.message.includes('Input file is missing');
}
