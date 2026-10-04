import { ApiClient } from '../api/client.js';
import { LayerManager } from '../ui/layer-manager.js';

export class SlideshowEngine {
  private readonly apiClient: ApiClient;
  private readonly layerManager: LayerManager;
  private readonly intervalMs: number;
  private running = false;
  private currentTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(apiClient: ApiClient, layerManager: LayerManager, intervalMs: number) {
    this.apiClient = apiClient;
    this.layerManager = layerManager;
    this.intervalMs = intervalMs;
  }

  /**
   * Запускает слайд-шоу. Возвращает промис, который разрешается при остановке.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.loadAndShowNext();

      // Основной цикл
      while (this.running) {
        await this.sleep(this.intervalMs);
        if (!this.running) break;
        await this.loadAndShowNext();
      }
    } catch (error) {
      // Критическая ошибка — показываем сообщение и ждем
      this.layerManager.showMessage(
        `Ошибка: ${error instanceof Error ? error.message : String(error)}\nПерезапуск через 10 сек...`
      );
      await this.sleep(10000);
      if (this.running) {
        await this.start(); // Рекурсивный перезапуск
      }
    }
  }

  /**
   * Останавливает слайд-шоу.
   */
  stop(): void {
    this.running = false;
    if (this.currentTimeoutId) {
      clearTimeout(this.currentTimeoutId);
      this.currentTimeoutId = null;
    }
  }

  /**
   * Выполняет один цикл загрузки и показа следующего кадра.
   * Публичный для тестирования.
   */
  async loadAndShowNext(): Promise<void> {
    // 1. Получаем ID следующего фото (с ретраями внутри ApiClient)
    const photoId = await this.apiClient.fetchNextPhotoId();

    // 2. Строим URL с размерами экрана
    const imageUrl = this.apiClient.buildImageUrl(photoId);

    // 3. Предзагружаем в неактивный слой
    await this.layerManager.preloadImage(imageUrl);

    // 4. Успешная загрузка — скрываем сообщения и меняем слои
    this.layerManager.hideMessage();
    this.layerManager.swapLayers();
  }

  /**
   * Загружает следующий кадр и возвращает true если успешно, false если ошибка загрузки изображения.
   * Используется для тестирования обработки ошибок.
   */
  async tryLoadNext(): Promise<boolean> {
    try {
      await this.loadAndShowNext();
      return true;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.currentTimeoutId = setTimeout(resolve, ms);
    });
  }

  isRunning(): boolean {
    return this.running;
  }
}