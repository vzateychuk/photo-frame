import type { Readable } from 'node:stream';

export type PhotoId = string;
export type FolderId = string;

export interface PhotoItem {
  readonly id: PhotoId;
  readonly path: string;
}

export interface FolderItem {
  readonly id: FolderId;
  readonly path: string;
  readonly name: string;
  readonly parentId: FolderId | null;
}

export interface PublicPhoto {
  readonly id: PhotoId;
}

export interface PublicFolder {
  readonly id: FolderId;
  readonly name: string;
  readonly parentId: FolderId | null;
  readonly photoCount: number;
}

export interface PlayNextResult {
  readonly photo: PublicPhoto | null;
  readonly unknownFolderIds: readonly FolderId[];
}

export interface IPlayService {
  getNext(folderIds?: readonly FolderId[]): PlayNextResult;
  getById(id: PhotoId): PhotoItem | null;
  listFolders(): PublicFolder[];
}

export interface IImageProcessorService {
  process(photo: PhotoItem, dimensions: { width: number; height: number }): Promise<Readable>;
}
