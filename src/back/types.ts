import type { Readable } from 'node:stream';

export type PhotoId = string;

export interface PhotoItem {
  readonly id: PhotoId;
  readonly path: string;
}

export interface PublicPhoto {
  readonly id: PhotoId;
}

export interface IPlayService {
  getNext(): PublicPhoto | null;
  getById(id: PhotoId): PhotoItem | null;
}

export interface IImageProcessorService {
  process(photo: PhotoItem, dimensions: { width: number, height: number }): Promise<Readable>;
}
