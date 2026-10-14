// src/back/app.ts
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import crypto from 'crypto';

import { getReleaseInfo } from './config/release-info.js';
import { loadConfig } from './config/env.config.js';
import type { AppConfig } from './config/env.config.js';
import { PhotoScannerService } from './services/scanner.service.js';
import { PlaylistService } from './services/playlist.service.js';
import { ImageProcessorService } from './services/image.service.js';
import { PhotoController } from './controllers/photo.controller.js';
import { JsonKeyStore } from './keystore/json-key-store.js';
import { AccessKeyService } from './keystore/access-key.service.js';
import { generateKey } from './keystore/access-key.js';
import { CreateKeyBodySchema } from './schemas/photo.schema.js';
import { buildKeySlideshowUrl } from './utils/key-url.js';
import type { AccessKey } from './types.js';

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
  const scanner = new PhotoScannerService(photosDir, server.log);
  const { photos, folders } = await scanner.scan();


  if (photos.length === 0) {
    server.log.warn(`В директории ${photosDir} не найдено фото (JPEG/PNG/GIF/WebP)`);
  } else {
    server.log.info(`Найдено фото: ${photos.length}, папок: ${folders.length}`);
  }

  const playlistService = new PlaylistService();
  playlistService.load(photos, folders);

  const imageProcessor = new ImageProcessorService({
    onError: (photoId) => {
      playlistService.removePhoto(photoId);
    },
  });

  const keyStore = JsonKeyStore.load(config.KEYSTORE_FILE);
  const accessKeyService = new AccessKeyService(keyStore);
  const photoController = new PhotoController(
    playlistService,
    imageProcessor,
    accessKeyService,
  );

  // Фоновая сверка с диском: новые фото, удалённые id, папки
  server.log.info(
    `Автоскан фото: каждые ${config.PHOTO_SCAN_INTERVAL_MS} мс (${Math.round(config.PHOTO_SCAN_INTERVAL_MS / 60_000)} мин)`,
  );
  scanner.startAutoScan(playlistService, config.PHOTO_SCAN_INTERVAL_MS);


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
  server.get('/api/photos/:id', photoController.getPhoto);

  // Protected catalog and keys endpoints (requires ADMIN_TOKEN)
  if (config.ADMIN_TOKEN) {
    const adminToken = config.ADMIN_TOKEN;
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
      const expectedBuf = Buffer.from(adminToken);
      // Length check first to avoid timingSafeEqual throwing on length mismatch
      if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        reply.code(401).send();
        return;
      }
      // OK, proceed to handler
    };

    server.get('/api/catalog', { preHandler: authPreHandler }, photoController.listFolders);

    const withUrl = (record: AccessKey) => {
      const base = config.PUBLIC_BASE_URL;
      return {
        ...record,
        url: base === undefined ? undefined : buildKeySlideshowUrl(base, record.key),
      };
    };

    server.get('/api/keys', { preHandler: authPreHandler }, async (_req, reply) => {
      reply.send({ keys: keyStore.list().map(withUrl) });
    });

    server.post('/api/keys', { preHandler: authPreHandler }, async (req, reply) => {
      const parsed = CreateKeyBodySchema.safeParse(req.body);
      if (!parsed.success) {
        reply.status(400).send({ error: 'Invalid parameters', details: parsed.error.issues });
        return;
      }

      const { label, folders, ttlHours } = parsed.data;

      if (Array.isArray(folders)) {
        const knownIds = new Set(playlistService.listFolders().map((folder) => folder.id));
        const unknown = folders.filter((id) => !knownIds.has(id));
        if (unknown.length > 0) {
          reply.status(400).send({
            error: 'Unknown folder ids',
            details: { unknownFolderIds: unknown },
          });
          return;
        }
      }

      const key = generateKey((candidate) => keyStore.get(candidate) !== null);
      const createdAt = new Date().toISOString();
      const expiresAt =
        ttlHours === undefined
          ? null
          : new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

      const record: AccessKey = {
        key,
        label,
        folders,
        createdAt,
        expiresAt,
      };
      keyStore.add(record);
      reply.status(201).send(withUrl(record));
    });

    server.delete<{ Params: { key: string } }>(
      '/api/keys/:key',
      { preHandler: authPreHandler },
      async (req, reply) => {
        const removed = keyStore.remove(req.params.key);
        if (!removed) {
          reply.status(404).send({ error: 'Key not found' });
          return;
        }
        reply.status(204).send();
      },
    );
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
    // /catalog → /catalog/ (index.html from Vite multi-page build)
    server.get('/catalog', async (_req, reply) => reply.redirect('/catalog/'));
  }

  return { server, config };
};
