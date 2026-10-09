// src/back/main.ts
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config/env.config.js';
import { getReleaseInfo } from './config/release-info.js';
import { PhotoScannerService } from './services/scanner.service.js';
import { PlaylistService } from './services/playlist.service.js';
import { ImageProcessorService } from './services/image.service.js';
import { PhotoController } from './controllers/photo.controller.js';

const bootstrap = async () => {
  // Инициализация Fastify
  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development'
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

  // 1. Сканируем папку с фото при старте
  const photosDir = path.resolve(config.PHOTOS_DIR);
  const scanner = new PhotoScannerService(photosDir);
  const { photos, folders } = await scanner.scan();

  if (photos.length === 0) {
    server.log.warn(`В директории ${photosDir} не найдено фото (JPEG/PNG/GIF/WebP)`);
  } else {
    server.log.info(`Найдено фото: ${photos.length}, папок: ${folders.length}`);
  }

  // 2. Инициализируем сервисы
  const playlistService = new PlaylistService();
  playlistService.load(photos, folders);

  const imageProcessor = new ImageProcessorService();
  const photoController = new PhotoController(playlistService, imageProcessor);

  const release = getReleaseInfo();

  // 3. Регистрируем роуты
  server.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: release.version,
      builtAt: release.builtAt,
    };
  });

  // API для плейлиста (опциональный ?folders=id1,id2)
  server.get('/api/play/next', photoController.getNext);

  // Каталог папок (id без путей на диске)
  server.get('/api/catalog/folders', photoController.listFolders);

  // API для получения изображения
  server.get('/api/photos/:id', photoController.getPhoto);

  // 4. Статические файлы фронтенда (только в production)
  if (config.NODE_ENV === 'production') {
    const __filename = new URL(import.meta.url).pathname;
    const __dirname = path.dirname(__filename);
    await server.register(fastifyStatic, {
      root: path.join(__dirname, '../public'),
      prefix: '/',
      decorateReply: false,
    });
  }

  // 5. Запуск сервера
  try {
    await server.listen({
      port: config.PORT,
      host: config.HOST,
    });

    server.log.info(`Сервер запущен в режиме: ${config.NODE_ENV}`);
    server.log.info(`Слушаем директорию с фото: ${photosDir}`);
    server.log.info(`API: http://${config.HOST}:${config.PORT}/api/play/next`);
  } catch (err) {
    server.log.fatal({ err }, 'Ошибка при запуске сервера');
    process.exit(1);
  }
};

bootstrap();