# Photo Frame — Архитектура и руководство разработчика

## 1. Общая архитектура

```
┌─────────────┐     HTTP/JSON      ┌─────────────┐
│  Frontend   │ ◄─────────────────► │  Backend    │
│  (Vite SPA) │   /api/play/next   │  (Fastify)  │
└─────────────┘                    └──────┬──────┘
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                        ┌────────────┐          ┌────────────┐
                        │ Playlist   │          │ Image      │
                        │ Service    │          │ Processor  │
                        └────────────┘          │ (Sharp)    │
                                                └──────┬─────┘
                                                       │
                                          ┌────────────┴────────────┐
                                          ▼                         ▼
                                    ┌─────────┐               ┌─────────┐
                                    │  FS     │               │  Stream │
                                    │ (photos)│               │ (HTTP)  │
                                    └─────────┘               └─────────┘
```

- **Backend**: Node.js + Fastify, TypeScript (ESM)
- **Frontend**: Vanilla TS + Vite (без фреймворков)
- **Коммуникация**: 2 REST эндпоинта, бинарный стрим для фото

---

## 2. Backend — детали реализации

### 2.1 Конфигурация (`src/back/config/env.config.ts`)

Fail-fast валидация через Zod при старте:

```typescript
EnvSchema = z.object({
  NODE_ENV: z.enum(['development','production','test']).default('development'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  PHOTOS_DIR: z.string().min(1),           // обязателен
  LOG_LEVEL: z.enum([...]).default('info'),
});
```

При ошибке — `process.exit(1)` с понятным сообщением.

### 2.2 Сканирование (`src/back/services/scanner.service.ts`)

- `PhotoScannerService.scan()` — рекурсивный `fs.readdir` с `withFileTypes: true`
- Фильтр: только `.jpg`, `.jpeg`, `.png` (case-insensitive)
- Возвращает `PhotoItem[]`: `{ id: UUID, path: absolutePath }`
- Пути делаются абсолютными через `path.resolve()` — критично для Sharp

### 2.3 Плейлист (`src/back/services/playlist.service.ts`)

- `PlaylistService` — in-memory, инициализируется при старте
- Fisher-Yates shuffle при загрузке и при завершении цикла
- `getNext()` → `PublicPhoto { id }` (путь не утекает)
- `getById(id)` → `PhotoItem { id, path }` для процессора

### 2.4 Обработка изображений (`src/back/services/image.service.ts`)

```typescript
ImageProcessorService.process(photo, {width, height}) → Promise<Readable>
```

Pipeline Sharp:
1. `sharp(photo.path)` — чтение файла
2. `.rotate()` — авто-поворот по EXIF
3. `.resize({ fit: 'inside', withoutEnlargement: true })` — вписываем в box, не апскейлим
4. `.jpeg({ quality: 80, mozjpeg: true })` — оптимизация
5. Результат через `PassThrough` → корректный `Readable` для Fastify

Обработка ошибок: `pipeline.on('error')` → `passThrough.destroy(err)`

### 2.5 Контроллер (`src/back/controllers/photo.controller.ts`)

**`GET /api/play/next`**
- `playService.getNext()` → `{ id }` или 404 если пусто

**`GET /api/photos/:id`**
1. Валидация: `GetPhotoParamsSchema` (id), `GetPhotoQuerySchema` (w, h)
2. `playService.getById(id)` → `PhotoItem` или 404
3. `imageProcessor.process(item, {w, h})` → `Readable`
4. **Стриминг в ответ:**
   ```typescript
   reply.raw.setHeader('Content-Type', 'image/jpeg');
   reply.raw.setHeader('Cache-Control', 'public, max-age=3600');
   await new Promise((resolve, reject) => {
     imageStream.pipe(reply.raw);
     imageStream.on('end', resolve);
     imageStream.on('error', reject);
     reply.raw.on('close', () => { imageStream.destroy(); resolve(); });
   });
   ```
5. Ошибки Zod → 400, ошибки процессинга → 500

### 2.6 Роуты (`src/back/main.ts`)

```typescript
server.get('/health', ...);
server.get('/api/play/next', photoController.getNext);
server.get('/api/photos/:id', photoController.getPhoto);
```

---

## 3. API Контракт

### `GET /health`
```json
{ "status": "ok", "timestamp": "2024-..." }
```

### `GET /api/play/next`
**Response 200:**
```json
{ "id": "uuid-v4" }
```
**Response 404:**
```json
{ "error": "No photos available" }
```

### `GET /api/photos/:id?w=1920&h=1080`
- `id` — UUID из `/api/play/next`
- `w` — ширина (100–3840, default 1920)
- `h` — высота (100–2160, default 1080)

**Response 200:** `Content-Type: image/jpeg`, бинарный поток
**Response 400:** невалидные параметры
**Response 404:** фото не найдено
**Response 500:** ошибка обработки

---

## 4. Frontend — детали (`src/front/`)

### Архитектура классов
- `ApiClient` — запросы к бэкенду, retry с backoff при ошибках сети
- `LayerManager` — два `<img>` слоя, crossfade через CSS `opacity` + `transition`
- `SlideshowEngine` — цикл: `fetchNextId` → `preload` → `swap` → `sleep(interval)`

### Ключевые моменты
- Предзагрузка: показан слой А, загружается в слой Б → swap
- Ошибка загрузки фото → skip → следующий
- Интервал смены: `?interval=5000` (мс), default 5000
- Wake Lock API — попытка удержать экран (HTTPS only)

### Точка входа
`src/front/main.ts` → инициализация движка, монтирование в `#app`

---

## 5. Тестирование

```bash
npm test          # vitest, все тесты
npm run test:ui   # с UI
```

### Покрытие
- `playlist.service.spec.ts` — shuffle, цикличность, не утечка путей
- `scanner.service.spec.ts` — рекурсивный скан, фильтры, ошибки FS
- `photo.schema.spec.ts` — Zod схемы: defaults, coercion, границы, ошибки
- `photo.controller.spec.ts` — моки сервисов, 200/404/500, валидация
- `image.service.spec.ts` — интеграция с real fixtures (valid/corrupted)

### Фикстуры
`src/back/tests/fixtures/` — `valid.jpg`, `corrupted.jpg`

---

## 6. Сборка и запуск

### Development
```bash
npm run dev        # tsx watch (back) + vite (front) параллельно
npm run dev:back   # только бэкенд
npm run dev:front  # только фронтенд
```

### Production
```bash
npm run build      # vite build (front → dist/public) + tsc (back → dist/back)
npm start          # node dist/back/main.js
```

### Docker
```dockerfile
# Multi-stage: builder → runner (node:20-alpine)
# COPY --from=builder /app/dist ./dist
# USER node, EXPOSE 3000
```

```yaml
# docker-compose.yml
volumes:
  - /host/photos:/data/photos:ro   # read-only!
environment:
  PHOTOS_DIR: /data/photos
```

---

## 7. Переменные окружения

| Переменная | Описание | Default |
|------------|----------|---------|
| `NODE_ENV` | `development` \| `production` \| `test` | `development` |
| `PORT` | Порт сервера | `3000` |
| `HOST` | Бинд адрес | `0.0.0.0` |
| `PHOTOS_DIR` | **Обязательно** — папка с фото | — |
| `LOG_LEVEL` | pino level | `info` |

---

## 8. Известные ограничения / TODO

- Нет авто-обновления индекса (только рестарт)
- Нет кэша ресайза (нагрузка на CPU при каждом запросе)
- Форматы: только JPEG/PNG (HEIC, WebP, видео — позже)
- Аутентификация/авторизация — нет (локальная сеть)
- Фронтенд: нет UI настроек, только query params

---

## 9. Полезные команды для отладки

```bash
# Прогон тестов с покрытием
npx vitest run --coverage

# Проверить конкретный файл
npx vitest run src/back/tests/services/image.service.spec.ts

# TypeScript проверка без.emit
npx tsc --noEmit

# Линт (если настроен)
npm run lint

# Запуск бэкенда с дебагом в VS Code
# F5 → "Debug Backend (tsx)"
```

---

## 10. Структура исходников (кратко)

```
src/
├── back/
│   ├── config/env.config.ts       # Zod config
│   ├── controllers/photo.controller.ts
│   ├── schemas/photo.schema.ts    # Zod API schemas
│   ├── services/
│   │   ├── scanner.service.ts     # FS scan
│   │   ├── playlist.service.ts    # Shuffle, getNext, getById
│   │   └── image.service.ts       # Sharp pipeline → Readable
│   ├── types.ts                   # Interfaces (IPlayService, IImageProcessorService)
│   ├── main.ts                    # Bootstrap, routes
│   └── tests/                     # Unit tests
└── front/
    ├── main.ts                    # Entry
    ├── api/                       # ApiClient
    ├── core/                      # SlideshowEngine, LayerManager
    └── ui/                        # DOM helpers
```

---

*Документ актуален на момент коммита `c773527`.*