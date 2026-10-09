# Сводка проекта photo-frame

## 🎯 Назначение
Проект — фоторамка с веб-интерфейсом для загрузки, предпросмотра и управления фотоподборками.

## 📁 Структура

```
/photo-frame/
├── src/back/       # Backend (Fastify) - обработка файлов, API
├── src/frontend/   # Frontend (Vite + Vue?) - UI, компоненты
├── data/           # Хранение фотографий (.gitignore'd)
├── dist/           # Build-вывод
├── docs/           # Документация проекта
├── scripts/        # Утилиты сборки/deploy
├── index.html      # Главная страница
├── vite.config.ts  # Настройки Vite
├── tsconfig.json   # TypeScript конфигурация
└── docker-compose.yml
```

## 🚀 Технологии

### Backend (Node.js)
- **Runtime**: Node.js 20+ + tsx
- **Фреймворк**: Fastify v5.12.5
- **Типизация**: TypeScript v7.0.2 (strict mode)
- **Обработка изображений**: sharp v0.33.5
- **Клиенты HTTP**: ky v2.1.0
- **Валидация**: Zod v4.6.5

### Frontend
- **Build system**: Vite v8.3.2
- **Тесты**: Vitest v5.0.3 (separate frontend/backend configs)
- **DOM эмуляция**: jsdom, @types/node (@types/jsdom)
- **Development server**: tsx watch mode

### Docker
- **Base image**: node:alpine с Node 20.something
- **Port**: 8888 (backend + static serve)

## 💿 Развёртывание

```bash
# Development
npm run dev              # Back + Front в watch-режиме
npm run dev:back         # Только backend
npm run dev:front        # Только frontend

# Production build
npm run build            # Собирает фронт и бэкенд
npm run start            # Запуск из dist/

# Docker
docker-compose up -d     # Развёртывание через docker-compose
```

## 🔑 Ключевые зависимости
- **@fastify/static**: Сервировка статики (фронтенд)
- **dotenv**: Чтение .env
- **pino-pretty**: Логи в консоль

## 📦 Архивы
- `photo-frame-raspi.tar` — образ для Raspberry Pi

## ⚙️ TypeScript намерения
```ts
{
  "target": "ES2022",
  "module": "NodeNext",
  "strict": true,
  "noUncheckedIndexedAccess": true
}
```
