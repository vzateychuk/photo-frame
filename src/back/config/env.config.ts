// src/back/config/env.config.ts
import { z } from 'zod';
import dotenv from 'dotenv';

// Загружаем переменные из .env файла в process.env
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['dev', 'prod', 'test']).default('dev'),
  // z.coerce автоматически приведет строку из env к числу
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'), // 0.0.0.0 для доступа в локальной сети
  // Путь к директории с фото строго обязателен, без него сервис не имеет смысла[cite: 1]
  PHOTOS_DIR: z.string().min(1, 'ОШИБКА: Переменная PHOTOS_DIR не задана'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Критическая ошибка инициализации: Невалидные переменные окружения');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1); // Fail-Fast: роняем процесс до старта сервера
}

// Экспортируем только валидированную и типизированную конфигурацию
export const config: AppConfig = parsedEnv.data;

// Экспортируем тип для потенциального использования в DI контейнере
export type AppConfig = z.infer<typeof envSchema>;