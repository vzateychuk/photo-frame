// src/backend/main.ts
import Fastify from 'fastify';
import { config } from './config/env.config.js'; // Важно: в Pure ESM расширение .js обязательно

const bootstrap = async () => {
  // Инициализация Fastify с настроенным Pino логгером
  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'dev'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
                colorize: true,
              },
            },
          }
        : {}),
    },
  });

  // Базовый health-check роут
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  try {
    // Слушаем HOST:PORT
    await server.listen({
      port: config.PORT,
      host: config.HOST,
    });
    
    server.log.info(`Фоторамка запущена в режиме: ${config.NODE_ENV}`);
    server.log.info(`Слушаем директорию с фото: ${config.PHOTOS_DIR}`);
  } catch (err) {
    server.log.fatal({ err }, 'Ошибка при запуске сервера');
    process.exit(1);
  }
};

bootstrap();