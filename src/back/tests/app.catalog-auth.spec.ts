import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildPublicApp } from '../app.js';

const ADMIN_TOKEN = 'a'.repeat(32);

async function startApp(env: {
  adminToken?: string;
}): Promise<{
  app: FastifyInstance;
  tempDir: string;
  previousEnv: NodeJS.ProcessEnv;
}> {
  const previousEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'photo-frame-catalog-auth-'));
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

  if (env.adminToken === undefined) {
    delete process.env.ADMIN_TOKEN;
  } else {
    process.env.ADMIN_TOKEN = env.adminToken;
  }

  const { server } = await buildPublicApp();
  return { app: server, tempDir, previousEnv };
}

async function stopApp(ctx: {
  app: FastifyInstance;
  tempDir: string;
  previousEnv: NodeJS.ProcessEnv;
}): Promise<void> {
  await ctx.app.close();
  rmSync(ctx.tempDir, { recursive: true, force: true });
  process.env = { ...ctx.previousEnv };
}

describe('GET /api/catalog with ADMIN_TOKEN', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let previousEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    ({ app, tempDir, previousEnv } = await startApp({ adminToken: ADMIN_TOKEN }));
  });

  afterAll(async () => {
    await stopApp({ app, tempDir, previousEnv });
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { authorization: `Bearer ${'b'.repeat(32)}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when Bearer token length differs from ADMIN_TOKEN', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { authorization: 'Bearer short-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when Authorization is not Bearer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { authorization: ADMIN_TOKEN },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with correct Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('folders');
    expect(Array.isArray(res.json().folders)).toBe(true);
    expect(res.json().folders.length).toBeGreaterThan(0);
  });

  it('supports ?q= filter with correct Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog?q=vacation',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('folders');
    expect(Array.isArray(res.json().folders)).toBe(true);
    for (const folder of res.json().folders) {
      expect(String(folder.name).toLowerCase()).toContain('vacation');
    }
  });
});

describe('GET /api/catalog when ADMIN_TOKEN is unset', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let previousEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    ({ app, tempDir, previousEnv } = await startApp({ adminToken: undefined }));
  });

  afterAll(async () => {
    await stopApp({ app, tempDir, previousEnv });
  });

  it('does not expose /api/catalog (route not registered)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    // Plan: do not register the route when ADMIN_TOKEN is missing.
    expect(res.statusCode).toBe(404);
  });
});
