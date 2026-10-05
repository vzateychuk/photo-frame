import ky, { type KyInstance, type Options } from 'ky';

export interface ApiClientConfig {
  baseUrl: string;
  intervalMs: number;
  screenWidth: number;
  screenHeight: number;
  /** Переопределение настроек ky поверх дефолтов (для тестов). */
  httpOptions?: Options;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly intervalMs: number;
  private readonly screenWidth: number;
  private readonly screenHeight: number;
  private readonly http: KyInstance;

  static readonly REQUEST_TIMEOUT_MS = 10_000;
  static readonly RETRY_LIMIT = 2;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.intervalMs = config.intervalMs;
    this.screenWidth = config.screenWidth;
    this.screenHeight = config.screenHeight;

    // Повторы: сетевые ошибки, таймауты и 408/413/429/500/502/503/504
    // (дефолтный список ky). 404 «нет фото» не повторяется.
    // Долгую недоступность сервера обрабатывает SlideshowEngine.
    this.http = ky
      .create({
        baseUrl: `${this.baseUrl}/`,
        timeout: ApiClient.REQUEST_TIMEOUT_MS,
        retry: { limit: ApiClient.RETRY_LIMIT, retryOnTimeout: true },
        headers: { Accept: 'application/json' },
      })
      .extend(config.httpOptions ?? {});
  }

  async fetchNextPhotoId(signal?: AbortSignal): Promise<string> {
    const data = await this.http
      .get('api/play/next', signal ? { signal } : {})
      .json<{ id?: unknown }>();
    if (typeof data?.id !== 'string' || data.id === '') {
      throw new Error('Invalid response: missing photo ID');
    }
    return data.id;
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
}
