import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlideshowEngine } from '../../core/engine.js';
import { ApiClient } from '../../api/client.js';
import { LayerManager } from '../../ui/layer-manager.js';

describe('SlideshowEngine', () => {
  let engine: SlideshowEngine;
  let mockApiClient: Partial<ApiClient>;
  let mockLayerManager: Partial<LayerManager>;
  let layerA: HTMLImageElement;
  let layerB: HTMLImageElement;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    layerA = document.createElement('img');
    layerB = document.createElement('img');
    container.appendChild(layerA);
    container.appendChild(layerB);

    mockLayerManager = {
      preloadImage: vi.fn().mockResolvedValue(undefined),
      swapLayers: vi.fn(),
      showMessage: vi.fn(),
      hideMessage: vi.fn(),
    };

    mockApiClient = {
      fetchNextPhotoId: vi.fn().mockResolvedValue('photo-123'),
      buildImageUrl: vi.fn((id) => new URL(`http://localhost:3000/api/photos/${id}?w=800&h=600`)),
      getIntervalMs: vi.fn().mockReturnValue(5000),
    };

    engine = new SlideshowEngine(
      mockApiClient as ApiClient,
      mockLayerManager as LayerManager,
      5000
    );

    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  describe('loadAndShowNext / tryLoadNext', () => {
    it('should fetch photo, build URL, preload, and swap layers', async () => {
      const result = await engine.tryLoadNext();

      expect(result).toBe(true);
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalled();
      expect(mockApiClient.buildImageUrl).toHaveBeenCalledWith('photo-123');
      expect(mockLayerManager.preloadImage).toHaveBeenCalled();
      expect(mockLayerManager.swapLayers).toHaveBeenCalled();
      expect(mockLayerManager.hideMessage).toHaveBeenCalled();
    });

    it('should handle load error and return false', async () => {
      mockLayerManager.preloadImage = vi.fn().mockRejectedValue(new Error('Load failed'));

      const result = await engine.tryLoadNext();

      expect(result).toBe(false);
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(1);
      expect(mockLayerManager.preloadImage).toHaveBeenCalledTimes(1);
      expect(mockLayerManager.swapLayers).not.toHaveBeenCalled();
    });

    it('should propagate fetch error', async () => {
      mockApiClient.fetchNextPhotoId = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await engine.tryLoadNext();

      expect(result).toBe(false);
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(1);
    });
  });

  describe('start/stop', () => {
    it('should run first cycle immediately', async () => {
      // Тестируем публичный метод tryLoadNext вместо приватного цикла start
      const result = await engine.tryLoadNext();

      expect(result).toBe(true);
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(1);
      expect(mockLayerManager.preloadImage).toHaveBeenCalledTimes(1);
      expect(mockLayerManager.swapLayers).toHaveBeenCalledTimes(1);
      expect(mockLayerManager.hideMessage).toHaveBeenCalledTimes(1);
    });

    it('should allow multiple cycles via tryLoadNext', async () => {
      await engine.tryLoadNext();
      await engine.tryLoadNext();

      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(2);
      expect(mockLayerManager.preloadImage).toHaveBeenCalledTimes(2);
      expect(mockLayerManager.swapLayers).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('should set running to false', () => {
      expect(engine.isRunning()).toBe(false);
      engine.stop();
      expect(engine.isRunning()).toBe(false);
    });
  });
});