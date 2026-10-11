import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildPublicApp } from '../app.js';
import type { AppConfig } from '../config/env.config.js';

describe('buildPublicApp', () => {
  let tempDir: string;
  let app: FastifyInstance;
  let config: AppConfig;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'photo-frame-app-'));
    // Minimal JPEG-like file so the scanner finds at least one photo.
    writeFileSync(path.join(tempDir, 'test.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    process.env.PHOTOS_DIR = tempDir;
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.HOST = '127.0.0.1';
    process.env.LOG_LEVEL = 'error';
    process.env.PUBLIC_BASE_URL = 'https://example.com';
    process.env.KEYSTORE_FILE = path.join(tempDir, 'keystore.json');
    process.env.ADMIN_TOKEN = 'a'.repeat(32);

    const result = await buildPublicApp();
    app = result.server;
    config = result.config;
  });

  afterAll(async () => {
    await app.close();
    rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...previousEnv };
  });

  it('returns config loaded for this process', () => {
    expect(config.PHOTOS_DIR).toBe(tempDir);
    expect(config.KEYSTORE_FILE).toBe(path.join(tempDir, 'keystore.json'));
    expect(config.ADMIN_TOKEN).toBe('a'.repeat(32));
    expect(config.PUBLIC_BASE_URL).toBe('https://example.com');
  });

  it('serves GET /health without listen', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ok',
    });
    expect(res.json()).toHaveProperty('timestamp');
    expect(res.json()).toHaveProperty('version');
    expect(res.json()).toHaveProperty('builtAt');
  });

  it('keeps open GET /api/catalog/folders', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalog/folders' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('folders');
    expect(Array.isArray(res.json().folders)).toBe(true);
  });

  it('registers GET /api/play/next', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/play/next' });

    // Must be a registered route (not 404/405 from missing route).
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).not.toBe(405);
  });

  it('registers GET /api/photos/:id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/photos/nonexistent-id',
    });

    // Route exists; unknown id → application 404, not "route missing".
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: expect.any(String) });
  });
});
