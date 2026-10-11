# Photo Frame MVP

Веб-фоторамка для Raspberry Pi. Показывает случайные фотографии из локальной папки в браузере TV-приставки. Гостевой доступ — по коду (`?key=`).

## Стек
- **Backend**: Node.js, Fastify, TypeScript, Zod (валидация конфига), Sharp (обработка фото).
- **Frontend**: Vite, TypeScript (Vanilla, без фреймворков).

## Быстрый старт

1. **Настройка окружения**:
   Скопируйте `.env.example` в `.env` и укажите путь к папке с фотографиями.
   Для управления каталогом и кодами задайте `ADMIN_TOKEN` (не короче 32 символов).
   Без `ADMIN_TOKEN` сервер стартует, но `/api/catalog`, `/api/keys` и страница `/catalog` не регистрируются / недоступны для управления (маршруты API — 404).
   ```env
   PHOTOS_DIR=/path/to/your/photos
   PORT=3000
   HOST=0.0.0.0
   NODE_ENV=development
   ADMIN_TOKEN=replace-with-at-least-32-characters
   PUBLIC_BASE_URL=https://photos.example.com
   ```

2. **Установка зависимостей**:
   ```bash
   npm install
   ```

3. **Запуск в режиме разработки**:
   ```bash
   npm run dev
   ```
   (Запускает одновременно бэкенд с hot-reload и фронтенд-сервер Vite).

4. **Сборка и запуск**:
   ```bash
   npm run build
   npm start
   ```

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/health` | Здоровье сервиса; `version` и `builtAt` |
| `GET` | `/api/catalog` | Список папок (`?q=`); нужен `Authorization: Bearer <ADMIN_TOKEN>` |
| `GET` | `/api/keys` | Список ключей доступа (ADMIN_TOKEN) |
| `POST` | `/api/keys` | Создать ключ: `{ label, folders: "all" \| string[], ttlHours? }` (ADMIN_TOKEN) |
| `DELETE` | `/api/keys/:key` | Отозвать ключ (ADMIN_TOKEN) |
| `GET` | `/api/play/next?key=` | ID следующего фото; нужен действующий ключ |
| `GET` | `/api/photos/:id?key=&w=&h=` | JPEG стрим; нужен ключ; `Cache-Control: private` |

Без верного ключа `play/next` и `photos` отвечают `401 { "error": "access_denied" }`.

### Параметры `/api/photos/:id`
- `key` — код доступа
- `w` — ширина (100–3840, default 1920)
- `h` — высота (100–2160, default 1080)

## Гостевое слайд-шоу

Ссылка вида `https://photos.example.com/?key=K7MQ-2Xa`.  
Без кода страница показывает поле «Введите код». Неверный/истёкший код — сообщение и остановка показа.

## Страница управления `/catalog`

- Development: `http://127.0.0.1:5173/catalog`
- Production: `https://photos.vzateych.uk/catalog`

Ввод `ADMIN_TOKEN` (sessionStorage), поиск папок, создание/отзыв кодов, копирование ссылки `/?key=...`.

```bash
export ADMIN_TOKEN='…'
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" 'http://127.0.0.1:3000/api/catalog?q=vacation' | jq
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"label":"Mom","folders":"all"}' http://127.0.0.1:3000/api/keys | jq
```

## Переменные окружения

| Переменная | Описание | Обязательна | Default |
|------------|----------|-------------|---------|
| `NODE_ENV` | `development` \| `production` \| `test` | Нет | `development` |
| `PORT` | Порт сервера | Нет | `3000` |
| `HOST` | Бинд адрес внутри контейнера | Нет | `0.0.0.0` |
| `PHOTOS_DIR` | Путь к папке с фото | **Да** | — |
| `LOG_LEVEL` | Уровень логов pino | Нет | `info` |
| `PUBLIC_BASE_URL` | База для готовых ссылок с `?key=` | Нет | — |
| `KEYSTORE_FILE` | JSON-хранилище ключей | Нет | `/data/state/keystore.json` |
| `ADMIN_TOKEN` | Секрет управления (мин. 32). Без него админ-маршруты не регистрируются | Нет* | — |

\*Для локальной проверки `/catalog` и `/api/catalog` токен нужно задать и перезапустить сервер.

## Docker

См. [docs/DEPLOYMENT_RASPI.md](docs/DEPLOYMENT_RASPI.md). Порт на хосте привязан к `127.0.0.1:3000` (доступ снаружи — через Nginx). Том `./data/state` — для `keystore.json`.
