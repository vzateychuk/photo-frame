import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildPublicApp } from '../app.js';
import { buildKeySlideshowUrl } from '../utils/key-url.js';

const ADMIN_TOKEN = 'a'.repeat(32);

async function startApp(): Promise<{
  app: FastifyInstance;
  tempDir: string;
  previousEnv: NodeJS.ProcessEnv;
}> {
  const previousEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'photo-frame-keys-'));
  const albumDir = path.join(tempDir, 'Vacation');
  mkdirSync(albumDir);
  writeFileSync(
    path.join(albumDir, 'shot.jpg'),
    Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  );

  process.env.PHOTOS_DIR = tempDir;
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
  process.env.HOST = '127.0.0.1';
  process.env.LOG_LEVEL = 'error';
  process.env.PUBLIC_BASE_URL = 'https://example.com';
  process.env.KEYSTORE_FILE = path.join(tempDir, 'keystore.json');
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;

  const { server } = await buildPublicApp();
  return { app: server, tempDir, previousEnv };
}

describe('GET/POST/DELETE /api/keys and play with access key', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let previousEnv: NodeJS.ProcessEnv;
  let folderId: string;
  let photoId: string;
  let createdKey: string;

  beforeAll(async () => {
    ({ app, tempDir, previousEnv } = await startApp());

    const catalog = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    folderId = catalog.json().folders[0].id as string;

    // Create a key scoped to the whole archive so play/next can return a photo.
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { label: 'guest', folders: 'all' },
    });
    expect(createRes.statusCode).toBe(201);
    createdKey = createRes.json().key as string;

    const nextRes = await app.inject({
      method: 'GET',
      url: `/api/play/next?key=${encodeURIComponent(createdKey)}`,
    });
    expect(nextRes.statusCode).toBe(200);
    photoId = nextRes.json().id as string;
  });

  afterAll(async () => {
    await app.close();
    rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...previousEnv };
  });

  it('returns 401 for GET /api/keys without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/keys' });
    expect(res.statusCode).toBe(401);
  });

  it('lists keys with url from PUBLIC_BASE_URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/keys',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { keys: Array<{ key: string; url?: string }> };
    expect(body.keys.length).toBeGreaterThan(0);
    const match = body.keys.find((k) => k.key === createdKey);
    expect(match?.url).toBe(buildKeySlideshowUrl('https://example.com', createdKey));
  });

  it('POST creates a key with ttlHours and sets expiresAt', async () => {
    const before = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {
        label: 'day pass',
        folders: [folderId],
        ttlHours: 24,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      key: string;
      expiresAt: string | null;
      folders: string[] | 'all';
      url?: string;
    };
    expect(body.folders).toEqual([folderId]);
    expect(body.expiresAt).not.toBeNull();
    const expiresMs = Date.parse(body.expiresAt!);
    expect(expiresMs).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 5000);
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000 + 5000);
    expect(body.url).toContain('?key=');
  });

  it('play/next without key returns 401 access_denied', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/play/next' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'access_denied' });
  });

  it('play/next with valid key returns a photo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/play/next?key=${encodeURIComponent(createdKey)}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('id');
  });

  it('photos without key returns 401 access_denied', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/photos/${photoId}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'access_denied' });
  });

  it('DELETE removes the key and play/next then returns 401', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { label: 'temp', folders: 'all' },
    });
    const tempKey = createRes.json().key as string;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/keys/${encodeURIComponent(tempKey)}`,
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(del.statusCode).toBe(204);

    const next = await app.inject({
      method: 'GET',
      url: `/api/play/next?key=${encodeURIComponent(tempKey)}`,
    });
    expect(next.statusCode).toBe(401);
    expect(next.json()).toEqual({ error: 'access_denied' });
  });
});
