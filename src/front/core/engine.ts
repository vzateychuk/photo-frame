import { ApiClient } from '../api/client.js';
import { AccessDeniedError } from '../api/access-denied-error.js';
import { LayerManager } from '../ui/layer-manager.js';

interface Run {
  readonly controller: AbortController;
  readonly promise: Promise<void>;
}

export class SlideshowEngine {
  private readonly apiClient: ApiClient;
  private readonly layerManager: LayerManager;
  private readonly intervalMs: number;
  private readonly onAccessDenied?: () => void;
  private currentRun: Run | null = null;
  private lastProgressAt = 0;

  /**
   * Сколько кадров подряд можно тихо пропустить, сразу беря следующий.
   * Дальше — пауза (без текста на экране), чтобы не долбить сервер при полном сбое.
   */
  static MAX_CONSECUTIVE_FAILURES = 3;
  /** Срок на весь кадр: запрос id, загрузка и декодирование картинки. */
  static FRAME_TIMEOUT_MS = 30_000;
  /** Пауза удваивается с каждой неудачной попыткой после серии ошибок. */
  static BACKOFF_BASE_MS = 10_000;
  static BACKOFF_MAX_MS = 5 * 60_000;

  constructor(
    apiClient: ApiClient,
    layerManager: LayerManager,
    intervalMs: number,
    options?: { onAccessDenied?: () => void },
  ) {
    this.apiClient = apiClient;
    this.layerManager = layerManager;
    this.intervalMs = intervalMs;
    this.onAccessDenied = options?.onAccessDenied;
  }

  /**
   * Запускает слайд-шоу. Возвращает промис, который разрешается при остановке.
   * Повторный вызов во время работы возвращает промис текущего запуска.
   */
  start(): Promise<void> {
    if (this.currentRun) return this.currentRun.promise;

    const controller = new AbortController();
    this.lastProgressAt = Date.now();
    const promise = this.runLoop(controller.signal).finally(() => {
      if (this.currentRun?.controller === controller) this.currentRun = null;
    });
    this.currentRun = { controller, promise };
    return promise;
  }

  /**
   * Останавливает слайд-шоу. Повторный вызов ничего не делает.
   * Незавершённые запрос, загрузка кадра и таймер текущего запуска отменяются.
   */
  stop(): void {
    const run = this.currentRun;
    if (!run) return;
    this.currentRun = null;
    run.controller.abort();
  }

  isRunning(): boolean {
    return this.currentRun !== null;
  }

  /**
   * Время (Date.now()) последнего показанного кадра, а если кадров ещё не было —
   * время запуска. По нему сторожевой таймер определяет зависание.
   */
  getLastProgressAt(): number {
    return this.lastProgressAt;
  }

  /**
   * Выполняет один цикл загрузки и показа следующего кадра в пределах FRAME_TIMEOUT_MS.
   * Если signal отменён, кадр не переключается.
   */
  async loadAndShowNext(signal?: AbortSignal): Promise<void> {
    const deadline = new AbortController();
    const timeoutId = setTimeout(() => deadline.abort(), SlideshowEngine.FRAME_TIMEOUT_MS);
    const onParentAbort = () => deadline.abort(signal!.reason);
    if (signal?.aborted) onParentAbort();
    signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const photoId = await this.apiClient.fetchNextPhotoId(deadline.signal);
      deadline.signal.throwIfAborted();

      const imageUrl = this.apiClient.buildImageUrl(photoId);
      await this.layerManager.preloadImage(imageUrl, deadline.signal);
      deadline.signal.throwIfAborted();
    } catch (error) {
      if (deadline.signal.aborted && !signal?.aborted) {
        throw new Error(
          `Кадр не загрузился за ${SlideshowEngine.FRAME_TIMEOUT_MS / 1000} сек`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onParentAbort);
    }

    this.layerManager.hideMessage();
    this.layerManager.swapLayers();
    this.lastProgressAt = Date.now();
  }

  /**
   * Загружает следующий кадр и возвращает true если успешно, false если ошибка.
   */
  async tryLoadNext(): Promise<boolean> {
    try {
      await this.loadAndShowNext();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Не удалось показать кадр — сразу следующий, без сообщения на экране
   * (как на бэкенде: битый/пропавший файл не должен мешать слайд-шоу).
   * После MAX_CONSECUTIVE_FAILURES подряд — тихая пауза (backoff), без текста:
   * BACKOFF_BASE_MS, затем вдвое больше, до BACKOFF_MAX_MS.
   * Успешный кадр сбрасывает счётчик. AccessDenied — единственный случай с текстом.
   */
  private async runLoop(signal: AbortSignal): Promise<void> {
    let consecutiveFailures = 0;

    while (!signal.aborted) {
      try {
        await this.loadAndShowNext(signal);
        consecutiveFailures = 0;
        await this.sleep(this.intervalMs, signal);
      } catch (error) {
        if (signal.aborted) break;

        if (error instanceof AccessDeniedError) {
          this.layerManager.clearImages();
          this.layerManager.showMessage(
            'Код недействителен. Попросите новый у владельца',
          );
          this.onAccessDenied?.();
          this.stop();
          break;
        }

        consecutiveFailures += 1;
        if (consecutiveFailures < SlideshowEngine.MAX_CONSECUTIVE_FAILURES) continue;

        const backoffMs = Math.min(
          SlideshowEngine.BACKOFF_BASE_MS *
            2 ** (consecutiveFailures - SlideshowEngine.MAX_CONSECUTIVE_FAILURES),
          SlideshowEngine.BACKOFF_MAX_MS,
        );
        await this.sleep(backoffMs, signal, { wakeOnRecovery: true });
      }
    }
  }

  /**
   * Резолвится по таймеру или сразу при отмене signal.
   * С wakeOnRecovery — также при восстановлении сети и при возврате вкладки на экран.
   */
  private sleep(
    ms: number,
    signal: AbortSignal,
    { wakeOnRecovery = false }: { wakeOnRecovery?: boolean } = {},
  ): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') wake();
      };

      const wake = () => {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', wake);
        if (wakeOnRecovery) {
          window.removeEventListener('online', wake);
          document.removeEventListener('visibilitychange', onVisibilityChange);
        }
        resolve();
      };

      const timeoutId = setTimeout(wake, ms);
      signal.addEventListener('abort', wake, { once: true });
      if (wakeOnRecovery) {
        window.addEventListener('online', wake);
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
    });
  }
}

