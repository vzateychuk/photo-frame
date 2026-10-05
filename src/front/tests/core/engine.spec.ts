import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlideshowEngine } from '../../core/engine.js';
import { ApiClient } from '../../api/client.js';
import { LayerManager } from '../../ui/layer-manager.js';

type Mock = ReturnType<typeof vi.fn>;

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('SlideshowEngine', () => {
  let mockApiClient: { fetchNextPhotoId: Mock; buildImageUrl: Mock; getIntervalMs: Mock };
  let mockLayerManager: { preloadImage: Mock; swapLayers: Mock; showMessage: Mock; hideMessage: Mock };
  const engines: SlideshowEngine[] = [];

  const createEngine = (intervalMs = 60_000) => {
    const engine = new SlideshowEngine(
      mockApiClient as unknown as ApiClient,
      mockLayerManager as unknown as LayerManager,
      intervalMs,
    );
    engines.push(engine);
    return engine;
  };

  beforeEach(() => {
    mockLayerManager = {
      preloadImage: vi.fn().mockResolvedValue(undefined),
      swapLayers: vi.fn(),
      showMessage: vi.fn(),
      hideMessage: vi.fn(),
    };
    mockApiClient = {
      fetchNextPhotoId: vi.fn().mockResolvedValue('photo-123'),
      buildImageUrl: vi.fn(
        (id: string) => new URL(`http://localhost:3000/api/photos/${id}?w=800&h=600`),
      ),
      getIntervalMs: vi.fn().mockReturnValue(5000),
    };
  });

  afterEach(() => {
    engines.splice(0).forEach((engine) => engine.stop());
  });

  describe('loadAndShowNext / tryLoadNext', () => {
    it('should fetch photo, build URL, preload, and swap layers', async () => {
      const result = await createEngine().tryLoadNext();

      expect(result).toBe(true);
      expect(mockApiClient.buildImageUrl).toHaveBeenCalledWith('photo-123');
      expect(mockLayerManager.preloadImage).toHaveBeenCalled();
      expect(mockLayerManager.hideMessage).toHaveBeenCalled();
      expect(mockLayerManager.swapLayers).toHaveBeenCalled();
    });

    it('should return false on load error without swapping', async () => {
      mockLayerManager.preloadImage.mockRejectedValue(new Error('Load failed'));

      expect(await createEngine().tryLoadNext()).toBe(false);
      expect(mockLayerManager.swapLayers).not.toHaveBeenCalled();
    });

    it('should return false when fetch fails', async () => {
      mockApiClient.fetchNextPhotoId.mockRejectedValue(new Error('Network error'));

      expect(await createEngine().tryLoadNext()).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('repeated start() returns the same promise and runs a single loop', async () => {
      const engine = createEngine();

      const p1 = engine.start();
      const p2 = engine.start();
      const p3 = engine.start();

      expect(p2).toBe(p1);
      expect(p3).toBe(p1);

      await vi.waitFor(() => expect(mockLayerManager.swapLayers).toHaveBeenCalledTimes(1));
      expect(engine.start()).toBe(p1);
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(1);

      engine.stop();
      await p1;
    });

    it('stop() during interval wait ends the loop without waiting for the timer', async () => {
      const engine = createEngine(60_000);
      const runPromise = engine.start();

      await vi.waitFor(() => expect(mockLayerManager.swapLayers).toHaveBeenCalledTimes(1));
      engine.stop();

      // Интервал 60 с больше testTimeout: тест пройдёт, только если сон прерван
      await runPromise;
      expect(engine.isRunning()).toBe(false);
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(1);
    });

    it('passes the run signal down and aborts it on stop()', async () => {
      const engine = createEngine();
      mockLayerManager.preloadImage.mockImplementation(
        (_url: URL, signal: AbortSignal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
      );

      const runPromise = engine.start();
      await vi.waitFor(() => expect(mockLayerManager.preloadImage).toHaveBeenCalledTimes(1));

      const signal = mockLayerManager.preloadImage.mock.calls[0][1] as AbortSignal;
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledWith(signal);
      expect(signal.aborted).toBe(false);

      engine.stop();
      await runPromise;

      expect(signal.aborted).toBe(true);
      expect(mockLayerManager.swapLayers).not.toHaveBeenCalled();
      expect(mockLayerManager.showMessage).not.toHaveBeenCalled();
    });

    it('stale load that ignores cancellation does not swap, message or schedule after stop()', async () => {
      const engine = createEngine();
      const pendingLoad = deferred();
      mockLayerManager.preloadImage.mockReturnValue(pendingLoad.promise);

      const runPromise = engine.start();
      await vi.waitFor(() => expect(mockLayerManager.preloadImage).toHaveBeenCalledTimes(1));

      engine.stop();
      pendingLoad.resolve();
      await runPromise;

      expect(mockLayerManager.swapLayers).not.toHaveBeenCalled();
      expect(mockLayerManager.hideMessage).not.toHaveBeenCalled();
      expect(mockLayerManager.showMessage).not.toHaveBeenCalled();
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(1);
    });

    it('fast stop() → start() leaves exactly one active loop', async () => {
      const engine = createEngine();
      const staleLoad = deferred();
      mockLayerManager.preloadImage
        .mockReturnValueOnce(staleLoad.promise)
        .mockResolvedValue(undefined);

      const firstRun = engine.start();
      await vi.waitFor(() => expect(mockLayerManager.preloadImage).toHaveBeenCalledTimes(1));

      engine.stop();
      const secondRun = engine.start();
      expect(secondRun).not.toBe(firstRun);

      await vi.waitFor(() => expect(mockLayerManager.swapLayers).toHaveBeenCalledTimes(1));

      // Загрузка первого запуска завершается уже после рестарта
      staleLoad.resolve();
      await firstRun;

      expect(mockLayerManager.swapLayers).toHaveBeenCalledTimes(1);
      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(2);
      expect(engine.isRunning()).toBe(true);
      expect(engine.start()).toBe(secondRun);

      engine.stop();
      await secondRun;
    });

    it('stop() is safe to call before start and repeatedly', async () => {
      const engine = createEngine();
      expect(() => engine.stop()).not.toThrow();

      const runPromise = engine.start();
      expect(engine.isRunning()).toBe(true);

      engine.stop();
      expect(() => engine.stop()).not.toThrow();
      expect(engine.isRunning()).toBe(false);
      await runPromise;
    });
  });

  describe('error recovery', () => {
    it('skips a failed frame and loads the next without showing a message', async () => {
      const engine = createEngine();
      mockLayerManager.preloadImage
        .mockRejectedValueOnce(new Error('Failed to load image'))
        .mockResolvedValue(undefined);

      const runPromise = engine.start();
      await vi.waitFor(() => expect(mockLayerManager.swapLayers).toHaveBeenCalledTimes(1));
      engine.stop();
      await runPromise;

      expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(2);
      expect(mockLayerManager.showMessage).not.toHaveBeenCalled();
    });

    it('shows message and pauses after consecutive failures, then continues', async () => {
      const originalDelay = SlideshowEngine.BACKOFF_BASE_MS;
      SlideshowEngine.BACKOFF_BASE_MS = 40;

      try {
        const engine = createEngine();
        mockLayerManager.preloadImage.mockRejectedValue(new Error('Failed to load image: x'));

        let fetchesBeforeMessage = 0;
        mockLayerManager.showMessage.mockImplementation(() => {
          fetchesBeforeMessage = mockApiClient.fetchNextPhotoId.mock.calls.length;
          mockLayerManager.preloadImage.mockResolvedValue(undefined);
        });

        const runPromise = engine.start();
        await vi.waitFor(() => expect(mockLayerManager.swapLayers).toHaveBeenCalledTimes(1));

        expect(mockLayerManager.showMessage).toHaveBeenCalledTimes(1);
        expect(mockLayerManager.showMessage).toHaveBeenCalledWith(
          expect.stringContaining('Повтор через'),
        );
        expect(fetchesBeforeMessage).toBe(SlideshowEngine.MAX_CONSECUTIVE_FAILURES);
        expect(mockApiClient.fetchNextPhotoId).toHaveBeenCalledTimes(
          SlideshowEngine.MAX_CONSECUTIVE_FAILURES + 1,
        );

        engine.stop();
        await runPromise;
      } finally {
        SlideshowEngine.BACKOFF_BASE_MS = originalDelay;
      }
    });
  });
});
