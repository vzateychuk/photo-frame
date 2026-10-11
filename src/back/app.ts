// src/back/app.ts
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';

import { getReleaseInfo } from './config/release-info.js';
import { loadConfig } from './config/env.config';
import type { AppConfig } from './config/env.config';
import { PhotoScannerService } from './services/scanner.service.js';
import { PlaylistService } from './services/playlist.service.js';
import { ImageProcessorService } from './services/image.service.js';
import crypto from 'crypto';
import { PhotoController } from './controllers/photo.controller.js';

import type { FastifyRequest, FastifyReply } from 'fastify';

export const buildPublicApp = async (): Promise<{
  server: import('fastify').FastifyInstance;
  config: AppConfig;
}> => {
  const config = loadConfig();
  const release = getReleaseInfo();

  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            colorize: true,
          },
        },
      }),
    },
  });

  // Scan photos directory
  const photosDir = path.resolve(config.PHOTOS_DIR);
  const scanner = new PhotoScannerService(photosDir);
  const { photos, folders } = await scanner.scan();

  if (photos.length === 0) {
    server.log.warn(`В директории ${photosDir} не найдено фото (JPEG/PNG/GIF/WebP)`);
  } else {
    server.log.info(`Найдено фото: ${photos.length}, папок: ${folders.length}`);
  }

  const playlistService = new PlaylistService();
  playlistService.load(photos, folders);
  const imageProcessor = new ImageProcessorService();
  const photoController = new PhotoController(
    playlistService,
    imageProcessor,
    config.PUBLIC_BASE_URL
  );

  // Routes
  server.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: release.version,
      builtAt: release.builtAt,
    };
  });

  server.get('/api/play/next', photoController.getNext);
  server.get('/api/catalog/folders', photoController.listFolders);
  server.get('/api/photos/:id', photoController.getPhoto);

  // Protected catalog endpoint (requires ADMIN_TOKEN)
  if (config.ADMIN_TOKEN) {
    const authPreHandler = async (req: FastifyRequest, reply: FastifyReply) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || typeof authHeader !== 'string') {
        reply.code(401).send();
        return;
      }
      const [type, token] = authHeader.split(' ');
      if (type !== 'Bearer' || !token) {
        reply.code(401).send();
        return;
      }
      const tokenBuf = Buffer.from(token);
      const expectedBuf = Buffer.from(config.ADMIN_TOKEN);
      // Length check first to avoid timingSafeEqual throwing on length mismatch
      if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        reply.code(401).send();
        return;
      }
      // OK, proceed to handler
    };
    server.get('/api/catalog', { preHandler: authPreHandler }, photoController.listFolders);
  }

  // Static files in production
  if (config.NODE_ENV === 'production') {
    const __filename = new URL(import.meta.url).pathname;
    const __dirname = path.dirname(__filename);
    await server.register(fastifyStatic, {
      root: path.join(__dirname, '../public'),
      prefix: '/',
      decorateReply: false,
    });
  }

  return { server, config };
};
