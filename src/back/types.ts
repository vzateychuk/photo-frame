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
  /** Имена от корня архива до этой папки, через « / ». */
  readonly pathLabel: string;
  readonly photoCount: number;
}

export interface ListFoldersOptions {
  /** Подстрока имени папки без учёта регистра. */
  readonly query?: string;
}

export interface PlayNextResult {
  readonly photo: PublicPhoto | null;
  readonly unknownFolderIds: readonly FolderId[];
}

export interface IPlayService {
  getNext(folderIds?: readonly FolderId[]): PlayNextResult;
  getById(id: PhotoId): PhotoItem | null;
  listFolders(options?: ListFoldersOptions): PublicFolder[];
}

export interface IImageProcessorService {
  process(photo: PhotoItem, dimensions: { width: number; height: number }): Promise<Readable>;
}
