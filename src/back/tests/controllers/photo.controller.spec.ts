import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhotoController } from '../../controllers/photo.controller.js';
import type { IPlayService, IImageProcessorService, PhotoItem, PublicPhoto } from '../../types.js';
import { Readable } from 'node:stream';
import { Writable } from 'node:stream';

describe('PhotoController', () => {
  let controller: PhotoController;
  let mockPlayService: {
    getNext: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    listFolders: ReturnType<typeof vi.fn>;
  };
  let mockImageProcessor: {
    process: ReturnType<typeof vi.fn>;
  };
  let mockReply: {
    send: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    header: ReturnType<typeof vi.fn>;
    hijack: ReturnType<typeof vi.fn>;
    raw: Writable & {
      setHeader: ReturnType<typeof vi.fn>;
      headersSent: boolean;
      destroy: ReturnType<typeof vi.fn>;
    };
  };
  let mockRequest: {
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    log: { warn: ReturnType<typeof vi.fn> };
  };
  let responseChunks: Buffer[];

  beforeEach(() => {
    mockPlayService = {
      getNext: vi.fn(),
      getById: vi.fn(),
      listFolders: vi.fn(),
    };
    mockImageProcessor = {
      process: vi.fn(),
    };

    controller = new PhotoController(
      mockPlayService as unknown as IPlayService,
      mockImageProcessor as unknown as IImageProcessorService,
    );
    responseChunks = [];

    const raw = new Writable({
      write(chunk, _enc, cb) {
        responseChunks.push(Buffer.from(chunk));
        cb();
      },
    }) as Writable & {
      setHeader: ReturnType<typeof vi.fn>;
      headersSent: boolean;
      destroy: ReturnType<typeof vi.fn>;
    };
    raw.setHeader = vi.fn();
    raw.headersSent = false;
    const origWrite = raw.write.bind(raw);
    raw.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
      raw.headersSent = true;
      mockReply.raw.headersSent = true;
      return origWrite(chunk as never, encoding as never, cb as never);
    }) as typeof raw.write;
    raw.destroy = vi.fn();

    mockReply = {
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      hijack: vi.fn(),
      raw,
    };

    mockRequest = {
      params: {},
      query: {},
      log: { warn: vi.fn() },
    };
  });

  describe('getNext', () => {
    it('should return 200 and the next photo ID when available', async () => {
      const mockPhoto: PublicPhoto = { id: 'photo-123' };
      mockPlayService.getNext.mockReturnValue({ photo: mockPhoto, unknownFolderIds: [] });

      await controller.getNext(mockRequest as never, mockReply as never);

      expect(mockPlayService.getNext).toHaveBeenCalledWith(undefined);
      expect(mockReply.send).toHaveBeenCalledWith(mockPhoto);
    });

    it('should pass comma-separated folders query to the play service', async () => {
      mockRequest.query = { folders: 'folder-a,folder-b' };
      mockPlayService.getNext.mockReturnValue({
        photo: { id: 'photo-1' },
        unknownFolderIds: [],
      });

      await controller.getNext(mockRequest as never, mockReply as never);

      expect(mockPlayService.getNext).toHaveBeenCalledWith(['folder-a', 'folder-b']);
    });

    it('should return 404 when no photo is available', async () => {
      mockPlayService.getNext.mockReturnValue({ photo: null, unknownFolderIds: [] });

      await controller.getNext(mockRequest as never, mockReply as never);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No photos available' });
    });

    it('should log and skip unknown folder ids while returning a photo', async () => {
      mockPlayService.getNext.mockReturnValue({
        photo: { id: 'photo-1' },
        unknownFolderIds: ['missing-folder'],
      });

      await controller.getNext(mockRequest as never, mockReply as never);

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        { folderId: 'missing-folder' },
        'Unknown folder id in folders filter, skipped',
      );
      expect(mockReply.send).toHaveBeenCalledWith({ id: 'photo-1' });
      expect(mockReply.status).not.toHaveBeenCalledWith(404);
    });
  });

  describe('listFolders', () => {
    it('should return public folder list', async () => {
      const folders = [
        {
          id: 'f1',
          name: 'vacation',
          parentId: null,
          pathLabel: 'vacation',
          photoCount: 2,
        },
      ];
      mockRequest.query = {};
      mockPlayService.listFolders.mockReturnValue(folders);

      await controller.listFolders(mockRequest as never, mockReply as never);

      expect(mockPlayService.listFolders).toHaveBeenCalledWith();
      expect(mockReply.send).toHaveBeenCalledWith({ folders });
    });

    it('should pass name query to the play service', async () => {
      mockRequest.query = { q: 'day' };
      mockPlayService.listFolders.mockReturnValue([]);

      await controller.listFolders(mockRequest as never, mockReply as never);

      expect(mockPlayService.listFolders).toHaveBeenCalledWith({ query: 'day' });
      expect(mockReply.send).toHaveBeenCalledWith({ folders: [] });
    });
  });

  describe('getPhoto', () => {
    const photoId = 'photo-123';
    const mockPhotoItem: PhotoItem = { id: photoId, path: '/path/to/photo.jpg' };

    it('should set headers only after first chunk and stream image bytes', async () => {
      mockRequest.params = { id: photoId };
      mockRequest.query = { w: '1920', h: '1080' };

      mockPlayService.getById.mockReturnValue(mockPhotoItem);
      mockImageProcessor.process.mockResolvedValue(
        Readable.from([Buffer.from('fake-jpeg-bytes')]),
      );

      await controller.getPhoto(mockRequest as never, mockReply as never);

      expect(mockPlayService.getById).toHaveBeenCalledWith(photoId);
      expect(mockImageProcessor.process).toHaveBeenCalledWith(mockPhotoItem, {
        width: 1920,
        height: 1080,
      });
      expect(mockReply.hijack).toHaveBeenCalled();
      expect(mockReply.raw.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockReply.raw.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
      expect(Buffer.concat(responseChunks).toString()).toBe('fake-jpeg-bytes');
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should return 404 when photo ID is not found', async () => {
      mockRequest.params = { id: 'unknown' };
      mockPlayService.getById.mockReturnValue(null);

      await controller.getPhoto(mockRequest as never, mockReply as never);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Photo not found' });
      expect(mockReply.raw.setHeader).not.toHaveBeenCalled();
    });

    it('should return 500 without image headers when processing fails before data', async () => {
      mockRequest.params = { id: photoId };
      mockPlayService.getById.mockReturnValue(mockPhotoItem);

      const failing = new Readable({
        read() {
          this.destroy(new Error('Sharp error'));
        },
      });
      mockImageProcessor.process.mockResolvedValue(failing);

      await controller.getPhoto(mockRequest as never, mockReply as never);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Image processing failed' });
      expect(mockReply.raw.setHeader).not.toHaveBeenCalled();
    });

    it('should return 500 when process() rejects', async () => {
      mockRequest.params = { id: photoId };
      mockPlayService.getById.mockReturnValue(mockPhotoItem);
      mockImageProcessor.process.mockRejectedValue(new Error('Sharp error'));

      await controller.getPhoto(mockRequest as never, mockReply as never);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Image processing failed' });
      expect(mockReply.raw.setHeader).not.toHaveBeenCalled();
    });
  });
});
