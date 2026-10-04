export interface ApiClientConfig {
  baseUrl: string;
  intervalMs: number;
  screenWidth: number;
  screenHeight: number;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly intervalMs: number;
  private readonly screenWidth: number;
  private readonly screenHeight: number;

  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 1000;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.intervalMs = config.intervalMs;
    this.screenWidth = config.screenWidth;
    this.screenHeight = config.screenHeight;
  }

  /**
   * Получает ID следующего фото с экспоненциальным бэкоффом при ошибках сети.
   * На HTTP ошибки (non-ok) выбрасывает исключение сразу, без ретраев.
   * Ретраи только на сетевые ошибки (fetch rejected).
   */
  async fetchNextPhotoId(): Promise<string> {
    let lastError: Error;

    for (let attempt = 0; attempt < ApiClient.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/play/next`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          // Любая HTTP ошибка — сразу кидаем, без ретраев
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data?.id) {
          throw new Error('Invalid response: missing photo ID');
        }
        return data.id;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // HTTP ошибки (начинаются с "HTTP ") — не ретраим
        if (lastError.message.startsWith('HTTP ')) {
          throw lastError;
        }

        // Сетевая ошибка — ретраим с экспоненциальным бэкоффом
        const delay = ApiClient.BASE_DELAY_MS * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // Последняя попытка (attempt === MAX_RETRIES)
    try {
      const response = await fetch(`${this.baseUrl}/api/play/next`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data?.id) {
        throw new Error('Invalid response: missing photo ID');
      }
      return data.id;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.startsWith('HTTP ')) {
        throw lastError;
      }
      throw new Error(`Failed to fetch next photo after ${ApiClient.MAX_RETRIES} retries: ${lastError!.message}`);
    }
  }

  /**
   * Строит URL для получения изображения с заданными размерами.
   */
  buildImageUrl(photoId: string): URL {
    const url = new URL(`${this.baseUrl}/api/photos/${encodeURIComponent(photoId)}`);
    url.searchParams.set('w', this.screenWidth.toString());
    url.searchParams.set('h', this.screenHeight.toString());
    return url;
  }

  getIntervalMs(): number {
    return this.intervalMs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}