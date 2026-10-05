import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPError, TimeoutError } from 'ky';
import { ApiClient } from '../../api/client.js';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('ApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const createClient = (overrides: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) =>
    new ApiClient({
      baseUrl: 'http://localhost:3000',
      intervalMs: 5000,
      screenWidth: 1920,
      screenHeight: 1080,
      httpOptions: {
        fetch: fetchMock,
        retry: { delay: () => 0 },
      },
      ...overrides,
    });

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  describe('fetchNextPhotoId', () => {
    it('should return photo ID on successful response', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 'test-photo-123' }));

      await expect(createClient().fetchNextPhotoId()).resolves.toBe('test-photo-123');

      const request = fetchMock.mock.calls[0][0] as Request;
      expect(request.url).toBe('http://localhost:3000/api/play/next');
      expect(request.method).toBe('GET');
    });

    it('should retry on network error and succeed', async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(jsonResponse({ id: 'test-photo-123' }));

      await expect(createClient().fetchNextPhotoId()).resolves.toBe('test-photo-123');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should retry on 502 (backend restarting behind nginx)', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, 502))
        .mockResolvedValueOnce(jsonResponse({ id: 'test-photo-123' }));

      await expect(createClient().fetchNextPhotoId()).resolves.toBe('test-photo-123');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should give up after retry limit', async () => {
      fetchMock.mockImplementation(async () => jsonResponse({}, 503));

      await expect(createClient().fetchNextPhotoId()).rejects.toBeInstanceOf(HTTPError);
      expect(fetchMock).toHaveBeenCalledTimes(1 + ApiClient.RETRY_LIMIT);
    });

    it('should not retry on 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'No photos available' }, 404));

      await expect(createClient().fetchNextPhotoId()).rejects.toBeInstanceOf(HTTPError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should time out a hanging request', async () => {
      fetchMock.mockImplementation(
        (_input: Request, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
          }),
      );
      const client = createClient({
        httpOptions: { fetch: fetchMock, timeout: 20, retry: 0 },
      });

      await expect(client.fetchNextPhotoId()).rejects.toBeInstanceOf(TimeoutError);
    });

    it('should abort the request via signal without retrying', async () => {
      fetchMock.mockImplementation(
        (request: Request, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal ?? request.signal;
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
      );
      const controller = new AbortController();

      const promise = createClient().fetchNextPhotoId(controller.signal);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      controller.abort();

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should reject response without id', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await expect(createClient().fetchNextPhotoId()).rejects.toThrow(
        'Invalid response: missing photo ID',
      );
    });
  });

  describe('buildImageUrl', () => {
    it('should build correct URL with default dimensions', () => {
      const url = createClient().buildImageUrl('photo-123');
      expect(url.toString()).toBe('http://localhost:3000/api/photos/photo-123?w=1920&h=1080');
    });

    it('should build URL with custom dimensions', () => {
      const url = createClient({ screenWidth: 1280, screenHeight: 720 }).buildImageUrl('photo-123');
      expect(url.toString()).toBe('http://localhost:3000/api/photos/photo-123?w=1280&h=720');
    });
  });
});
