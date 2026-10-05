import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhotoController } from '../../controllers/photo.controller.js';
import type { IPlayService, IImageProcessorService, PhotoItem, PublicPhoto } from '../../types.js';
import { Readable } from 'node:stream';
import { Writable } from 'node:stream';

describe('PhotoController', () => {
  let controller: PhotoController;
  let mockPlayService: vi.Mocked<IPlayService>;
  let mockImageProcessor: vi.Mocked<IImageProcessorService>;
  let mockReply: any;
  let mockRequest: any;
  let responseChunks: Buffer[];

  beforeEach(() => {
    mockPlayService = {
      getNext: vi.fn(),
      getById: vi.fn(),
    };
    mockImageProcessor = {
      process: vi.fn(),
    };

    controller = new PhotoController(mockPlayService, mockImageProcessor);
    responseChunks = [];

    const raw = new Writable({
      write(chunk, _enc, cb) {
        responseChunks.push(Buffer.from(chunk));
        cb();
      },
    });
    // эмулируем HTTP response
    (raw as any).setHeader = vi.fn();
    (raw as any).headersSent = false;
    const origWrite = raw.write.bind(raw);
    (raw as any).write = (chunk: any, encoding?: any, cb?: any) => {
      (raw as any).headersSent = true;
      mockReply.raw.headersSent = true;
      return origWrite(chunk, encoding, cb);
    };
    (raw as any).destroy = vi.fn();

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
    };
  });

  describe('getNext', () => {
    it('should return 200 and the next photo ID when available', async () => {
      const mockPhoto: PublicPhoto = { id: 'photo-123' };
      mockPlayService.getNext.mockReturnValue(mockPhoto);

      await controller.getNext(mockRequest, mockReply);

      expect(mockPlayService.getNext).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(mockPhoto);
    });

    it('should return 404 when no photo is available', async () => {
      mockPlayService.getNext.mockReturnValue(null);

      await controller.getNext(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No photos available' });
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

      await controller.getPhoto(mockRequest, mockReply);

      expect(mockPlayService.getById).toHaveBeenCalledWith(photoId);
      expect(mockImageProcessor.process).toHaveBeenCalledWith(
        mockPhotoItem,
        { width: 1920, height: 1080 },
      );
      expect(mockReply.hijack).toHaveBeenCalled();
      expect(mockReply.raw.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockReply.raw.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
      expect(Buffer.concat(responseChunks).toString()).toBe('fake-jpeg-bytes');
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should return 404 when photo ID is not found', async () => {
      mockRequest.params = { id: 'unknown' };
      mockPlayService.getById.mockReturnValue(null);

      await controller.getPhoto(mockRequest, mockReply);

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

      await controller.getPhoto(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Image processing failed' });
      expect(mockReply.raw.setHeader).not.toHaveBeenCalled();
    });

    it('should return 500 when process() rejects', async () => {
      mockRequest.params = { id: photoId };
      mockPlayService.getById.mockReturnValue(mockPhotoItem);
      mockImageProcessor.process.mockRejectedValue(new Error('Sharp error'));

      await controller.getPhoto(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Image processing failed' });
      expect(mockReply.raw.setHeader).not.toHaveBeenCalled();
    });
  });
});
