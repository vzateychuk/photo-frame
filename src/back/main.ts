// src/back/main.ts
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { buildPublicApp } from './app.js';
import { getReleaseInfo } from './config/release-info.js';
import { PhotoScannerService } from './services/scanner.service.js';
import { PlaylistService } from './services/playlist.service.js';
import { ImageProcessorService } from './services/image.service.js';
import { PhotoController } from './controllers/photo.controller.js';

const bootstrap = async () => {
  const { server, config } = await buildPublicApp();
  try {
    await server.listen({ port: config.PORT, host: config.HOST });
    server.log.info(`Сервер запущен в режиме: ${config.NODE_ENV}`);
    server.log.info(`Слушаем директорию с фото: ${path.resolve(config.PHOTOS_DIR)}`);
    server.log.info(`API: http://${config.HOST}:${config.PORT}/api/play/next`);
  } catch (err) {
    server.log.fatal({ err }, 'Ошибка при запуске сервера');
    process.exit(1);
  }
};

bootstrap();