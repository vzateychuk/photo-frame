import { describe, it, expect, afterEach } from 'vitest';
import { envSchema, loadConfig } from '../../config/env.config.js';
import type { AppConfig } from '../../config/env.config.js';

/** Minimal valid env object for schema.safeParse (not process.env). */
const baseEnv = {
  PHOTOS_DIR: '/data/photos',
};

describe('envSchema', () => {
  it('is exported for tests without process.exit on import', () => {
    expect(envSchema).toBeDefined();
    expect(typeof envSchema.parse).toBe('function');
    expect(typeof envSchema.safeParse).toBe('function');
  });

  it('parses a minimal valid object', () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PHOTOS_DIR).toBe('/data/photos');
    }
  });

  it('defaults KEYSTORE_FILE to /data/state/keystore.json', () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.KEYSTORE_FILE).toBe('/data/state/keystore.json');
    }
  });

  it('accepts a custom KEYSTORE_FILE', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      KEYSTORE_FILE: '/tmp/keys.json',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.KEYSTORE_FILE).toBe('/tmp/keys.json');
    }
  });

  it('allows missing PUBLIC_BASE_URL', () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PUBLIC_BASE_URL).toBeUndefined();
    }
  });

  it('accepts a valid PUBLIC_BASE_URL', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      PUBLIC_BASE_URL: 'https://photos.example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PUBLIC_BASE_URL).toBe('https://photos.example.com');
    }
  });

  it('rejects an invalid PUBLIC_BASE_URL', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      PUBLIC_BASE_URL: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('allows missing ADMIN_TOKEN', () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ADMIN_TOKEN).toBeUndefined();
    }
  });

  it('accepts ADMIN_TOKEN of at least 32 characters', () => {
    const token = 'a'.repeat(32);
    const result = envSchema.safeParse({
      ...baseEnv,
      ADMIN_TOKEN: token,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ADMIN_TOKEN).toBe(token);
    }
  });

  it('rejects ADMIN_TOKEN shorter than 32 characters', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      ADMIN_TOKEN: 'too-short-token',
    });
    expect(result.success).toBe(false);
  });

  it('does not define ADMIN_PORT or ADMIN_HOST', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      ADMIN_PORT: '3001',
      ADMIN_HOST: '127.0.0.1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('ADMIN_PORT');
      expect(result.data).not.toHaveProperty('ADMIN_HOST');
    }
  });

  it('fails when PHOTOS_DIR is missing', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('defaults PHOTO_SCAN_INTERVAL_MS to 10 minutes', () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PHOTO_SCAN_INTERVAL_MS).toBe(600_000);
    }
  });

  it('accepts a custom PHOTO_SCAN_INTERVAL_MS', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      PHOTO_SCAN_INTERVAL_MS: '60000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PHOTO_SCAN_INTERVAL_MS).toBe(60_000);
    }
  });

  it('rejects PHOTO_SCAN_INTERVAL_MS below 10 seconds', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      PHOTO_SCAN_INTERVAL_MS: '9999',
    });
    expect(result.success).toBe(false);
  });
});

describe('loadConfig', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('loads config from process.env without requiring a prior module-level parse', () => {
    process.env.PHOTOS_DIR = '/tmp/photos';
    process.env.NODE_ENV = 'development';
    process.env.PORT = '3000';
    process.env.HOST = '127.0.0.1';
    process.env.LOG_LEVEL = 'info';
    process.env.PUBLIC_BASE_URL = 'https://example.com';
    process.env.KEYSTORE_FILE = '/tmp/keystore.json';
    process.env.ADMIN_TOKEN = 'a'.repeat(32);
    delete process.env.ADMIN_PORT;
    delete process.env.ADMIN_HOST;

    const cfg: AppConfig = loadConfig();

    expect(cfg).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      HOST: '127.0.0.1',
      PHOTOS_DIR: '/tmp/photos',
      LOG_LEVEL: 'info',
      PUBLIC_BASE_URL: 'https://example.com',
      KEYSTORE_FILE: '/tmp/keystore.json',
      ADMIN_TOKEN: 'a'.repeat(32),
    });
  });

  it('applies KEYSTORE_FILE default when the variable is unset', () => {
    process.env.PHOTOS_DIR = '/tmp/photos';
    delete process.env.KEYSTORE_FILE;
    delete process.env.ADMIN_TOKEN;
    delete process.env.PUBLIC_BASE_URL;

    const cfg = loadConfig();
    expect(cfg.KEYSTORE_FILE).toBe('/data/state/keystore.json');
  });
});
