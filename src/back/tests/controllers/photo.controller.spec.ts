import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhotoController } from '../../controllers/photo.controller';
import type { IPlayService, IImageProcessorService, PhotoItem, PublicPhoto } from '../../types';
import { Readable } from 'node:stream';

describe('PhotoController', () => {
  let controller: PhotoController;
  let mockPlayService: vi.Mocked<IPlayService>;
  let mockImageProcessor: vi.Mocked<IImageProcessorService>;
  let mockReply: any;
  let mockRequest: any;

  beforeEach(() => {
    // Создаем моки сервисов
    mockPlayService = {
      getNext: vi.fn(),
      getById: vi.fn(),
    };
    mockImageProcessor = {
      process: vi.fn(),
    };

    // Создаем экземпляр контроллера с моками
    controller = new PhotoController(mockPlayService, mockImageProcessor);

    // Мокаем Fastify Reply
    mockReply = {
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };

    // Базовый мок запроса
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
    const mockStream = new Readable();

    it('should return processed image stream for valid ID and params', async () => {
      mockRequest.params = { id: photoId };
      mockRequest.query = { w: '1920', h: '1080' };
      
      mockPlayService.getById.mockReturnValue(mockPhotoItem);
      mockImageProcessor.process.mockResolvedValue(mockStream);

      await controller.getPhoto(mockRequest, mockReply);

      expect(mockPlayService.getById).toHaveBeenCalledWith(photoId);
      expect(mockImageProcessor.process).toHaveBeenCalledWith(
        mockPhotoItem, 
        { width: 1920, height: 1080 }
      );
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockReply.send).toHaveBeenCalledWith(mockStream);
    });

    it('should return 404 when photo ID is not found', async () => {
      mockRequest.params = { id: 'unknown' };
      mockPlayService.getById.mockReturnValue(null);

      await controller.getPhoto(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Photo not found' });
    });

    it('should return 500 when image processing fails', async () => {
      mockRequest.params = { id: photoId };
      mockPlayService.getById.mockReturnValue(mockPhotoItem);
      mockImageProcessor.process.mockRejectedValue(new Error('Sharp error'));

      await controller.getPhoto(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Image processing failed' });
    });
  });
});
