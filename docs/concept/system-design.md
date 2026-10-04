# Архитектурный проект MVP: Домашняя веб-фоторамка

Проект описывает реализацию локального сервиса для показа фотографий с Raspberry Pi на экране телевизора через браузер ТВ-приставки. Решение спроектировано с учетом жестких ограничений ресурсов клиента (ТВ-приставка, 2 ГБ ОЗУ, лимит JS-кучи 527 МБ) и требований безопасности (защита исходных файлов, изоляция файловой системы).

## 1. Высокоуровневая архитектура

Система состоит из легковесного бэкенда на Node.js (Fastify) и Vanilla SPA клиента.

* **Backend** отвечает за индексацию файлов в оперативной памяти (только JPEG и PNG), управление случайным порядком воспроизведения и обработку изображений «на лету» (изменение размера, учет EXIF-ориентации) без сохранения результата на диск.


* **Frontend** управляет циклом показа, предзагрузкой следующего кадра и плавным переходом между двумя DOM-слоями.



Взаимодействие разделено на два эндпоинта, что гарантирует сокрытие реальных путей к файлам от клиента:

1. `GET /api/play/next` — сдвигает указатель на сервере и возвращает идентификатор следующего фото.
2. `GET /api/photos/:id` — возвращает бинарный поток подготовленного изображения.

---

## 2. Конфигурация окружения (Fail-Fast)

Приложение жестко валидирует настройки при старте. Если обязательные параметры (например, путь к папке с фото) отсутствуют, процесс немедленно завершается.

```typescript
// src/config/env.config.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['dev', 'prod', 'test']).default('prod'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  // Папка с фото обязательна для запуска сервиса
  PHOTOS_DIR: z.string().min(1, 'ОШИБКА: Путь к директории (PHOTOS_DIR) не задан'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Ошибка инициализации: Неверные переменные окружения');
  console.error(parsedEnv.error.format());
  process.exit(1); 
}

export const config = parsedEnv.data;
export type AppConfig = z.infer<typeof EnvSchema>;

```

---

## 3. Backend (Node.js + Fastify)

Бэкенд использует библиотеку `sharp` для потокового ресайза и нормализации изображений.

### 3.1 Валидация API-запросов (Zod)

Обеспечивает безопасные значения по умолчанию для ширины и высоты, защищая Raspberry Pi от исчерпания памяти при попытке обработать гигантские исходники.

```typescript
// src/schemas/photo.schema.ts
import { z } from 'zod';

export const GetPhotoQuerySchema = z.object({
  w: z.coerce.number().int().min(100).max(3840).default(1920),
  h: z.coerce.number().int().min(100).max(2160).default(1080),
});

export const GetPhotoParamsSchema = z.object({
  id: z.string().min(1, 'ID обязателен'),
});

```

### 3.2 Сигнатуры сервисов и контроллера

```typescript
// src/domain/types.ts
export type PhotoId = string;
export interface PhotoItem {
  readonly id: PhotoId;
  readonly absolutePath: string;
}

// src/services/play.service.ts
export interface IplayService {
  initialize(items: PhotoItem[]): void;
  getNext(): PhotoItem | null;
  getById(id: PhotoId): PhotoItem | null;
}

// src/services/image-processor.service.ts
import type { Readable } from 'stream';
export interface IImageProcessorService {
  process(photo: PhotoItem, dimensions: { width: number, height: number }): Promise<Readable>;
}

// src/controllers/photo.controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify';

export class PhotoController {
  constructor(
    private readonly playService: IplayService,
    private readonly imageProcessor: IImageProcessorService
  ) {}

  public getNext = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Возвращает DTO с ID следующего фото
  };

  public getPhoto = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // 1. Валидация через GetPhotoParamsSchema и GetPhotoQuerySchema
    // 2. Получение PhotoItem из IplayService
    // 3. Обработка через IImageProcessorService (ресайз и EXIF)
    // 4. Отдача потока с заголовком Cache-Control
  };
}

```

---

## 4. Frontend (Vanilla TypeScript)

Фронтенд реализован без тяжелых фреймворков для минимизации нагрузки на TV-браузер.

### 4.1 Клиент и управление UI

```typescript
// src/client/api-client.ts
export class ApiClient {
  constructor(private readonly config: { intervalMs: number, screenWidth: number, screenHeight: number }) {}
  
  /** 
   * Запрашивает ID, при недоступности сервера повторяет попытки с паузой[cite: 1] 
   */
  public async fetchNextPhotoId(): Promise<string>;
  public buildImageUrl(photoId: string): URL;
}

// src/client/layer-manager.ts
export class LayerManager {
  constructor(
    private readonly layerA: HTMLImageElement,
    private readonly layerB: HTMLImageElement
  ) {}

  /** 
   * Загружает изображение в неактивный слой. 
   * При ошибке загрузки отклоняет промис для перехода к следующему кадру[cite: 1].
   */
  public async preloadImage(url: URL): Promise<void>;
  public swapLayers(): void;
  public showMessage(text: string): void;
}

// src/client/slideshow-engine.ts
export class SlideshowEngine {
  constructor(
    private readonly apiClient: ApiClient,
    private readonly layerManager: LayerManager,
    private readonly intervalMs: number
  ) {}

  public async start(): Promise<void>;
  private async loadAndShowNext(): Promise<void>;
  private sleep(ms: number): Promise<void>;
}

```

---

## 5. Инфраструктура и Деплой

Развертывание выполняется через Docker, что гарантирует наличие нужных версий Node.js и системных библиотек на Raspberry Pi.

### 5.1 Dockerfile (Multi-stage)

```dockerfile
# Этап 1: Сборка
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Этап 2: prod
FROM node:20-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

USER node
ENV NODE_ENV=prod
EXPOSE 3000
CMD ["node", "dist/main.js"]

```

### 5.2 Docker Compose

Конфигурация изолирует сервис от возможности модификации исходных фотографий с помощью флага Read-Only (`:ro`) и ограничивает объем логов.

```yaml
version: '3.8'

services:
  photoframe-backend:
    build: .
    container_name: photoframe-service
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=prod
      - PORT=3000
      - HOST=0.0.0.0
      - PHOTOS_DIR=/data/photos
      - LOG_LEVEL=info
    volumes:
      # Монтирование локальной директории в режиме чтения
      - /mnt/samba/photos:/data/photos:ro
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

```

Сведение логики предзагрузки в клиенте и потоковой обработки в бэкенде гарантирует плавность отображения кадров на слабом устройстве, а строгая типизация и валидация на границах систем делают MVP надежным фундаментом для дальнейшего развития.
