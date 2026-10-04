import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../../api/client.js';

describe('ApiClient', () => {
  let client: ApiClient;
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    client = new ApiClient({
      baseUrl,
      intervalMs: 5000,
      screenWidth: 1920,
      screenHeight: 1080,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fetchNextPhotoId', () => {
    it('should return photo ID on successful response', async () => {
      const mockResponse = { id: 'test-photo-123' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.fetchNextPhotoId();

      expect(result).toBe('test-photo-123');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/play/next',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should retry with exponential backoff on network error', async () => {
      const mockResponse = { id: 'test-photo-123' };
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

      const promise = client.fetchNextPhotoId();

      // Fast-forward through retries (baseDelay=1000, maxRetries=3)
      // attempt 0: delay 1000, attempt 1: delay 2000, attempt 2: delay 4000
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);

      const result = await promise;
      expect(result).toBe('test-photo-123');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exceeded', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const promise = client.fetchNextPhotoId();

      // Ждем все ретраи: 1000 + 2000 + 4000 = 7000ms + финальная попытка
      await vi.advanceTimersByTimeAsync(8000);

      await expect(promise).rejects.toThrow('Failed to fetch next photo after 3 retries');
      // 3 ретрая + 1 финальная попытка = 4 вызова
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('should throw on HTTP error (non-ok response)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.fetchNextPhotoId()).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should not retry on 404 error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.fetchNextPhotoId()).rejects.toThrow('HTTP 404: Not Found');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildImageUrl', () => {
    it('should build correct URL with default dimensions', () => {
      const url = client.buildImageUrl('photo-123');
      expect(url.toString()).toBe('http://localhost:3000/api/photos/photo-123?w=1920&h=1080');
    });

    it('should build URL with custom dimensions', () => {
      client = new ApiClient({
        baseUrl: 'http://localhost:3000',
        intervalMs: 5000,
        screenWidth: 1280,
        screenHeight: 720,
      });
      const url = client.buildImageUrl('photo-123');
      expect(url.toString()).toBe('http://localhost:3000/api/photos/photo-123?w=1280&h=720');
    });
  });
});