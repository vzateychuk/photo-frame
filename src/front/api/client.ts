import ky, { HTTPError, type KyInstance, type Options } from 'ky';
import { AccessDeniedError } from './access-denied-error.js';

export interface ApiClientConfig {
  baseUrl: string;
  intervalMs: number;
  screenWidth: number;
  screenHeight: number;
  /** Guest access key for play/photos. */
  accessKey?: string | null;
  /** Переопределение настроек ky поверх дефолтов (для тестов). */
  httpOptions?: Options;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly intervalMs: number;
  private readonly screenWidth: number;
  private readonly screenHeight: number;
  private readonly accessKey: string | null;
  private readonly http: KyInstance;

  static readonly REQUEST_TIMEOUT_MS = 10_000;
  static readonly RETRY_LIMIT = 2;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.intervalMs = config.intervalMs;
    this.screenWidth = config.screenWidth;
    this.screenHeight = config.screenHeight;
    this.accessKey = config.accessKey ?? null;

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
    const searchParams =
      this.accessKey !== null && this.accessKey !== ''
        ? { key: this.accessKey }
        : undefined;

    try {
      const data = await this.http
        .get('api/play/next', {
          ...(signal ? { signal } : {}),
          ...(searchParams ? { searchParams } : {}),
        })
        .json<{ id?: unknown }>();
      if (typeof data?.id !== 'string' || data.id === '') {
        throw new Error('Invalid response: missing photo ID');
      }
      return data.id;
    } catch (err) {
      if (err instanceof HTTPError && err.response.status === 401) {
        throw new AccessDeniedError();
      }
      throw err;
    }
  }

  /**
   * Строит URL для получения изображения с заданными размерами.
   */
  buildImageUrl(photoId: string): URL {
    const url = new URL(`${this.baseUrl}/api/photos/${encodeURIComponent(photoId)}`);
    url.searchParams.set('w', this.screenWidth.toString());
    url.searchParams.set('h', this.screenHeight.toString());
    if (this.accessKey !== null && this.accessKey !== '') {
      url.searchParams.set('key', this.accessKey);
    }
    return url;
  }

  getIntervalMs(): number {
    return this.intervalMs;
  }
}
