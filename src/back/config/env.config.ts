// src/back/config/env.config.ts
import { z } from 'zod';
import dotenv from 'dotenv';

// Load env variables only when parsing via loadConfig
// No side‑effects on import

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // z.coerce automatically turns env string into number
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'), // 0.0.0.0 for local network access
  // Path to photo directory is mandatory
  PHOTOS_DIR: z.string().min(1, 'ERROR: PHOTOS_DIR is required'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Public base URL for prepared slideshow links. Optional. */
  PUBLIC_BASE_URL: z.string().url().optional(),
  /** Path to the key‑store JSON file. Mandatory, default provided. */
  KEYSTORE_FILE: z.string().default('/data/state/keystore.json'),
  /** Secret token for admin endpoints. Optional, min 32 chars. */
  ADMIN_TOKEN: z.string().min(32).optional(),
  /**
   * Interval between background photo-dir syncs (milliseconds).
   * Default 10 minutes. Min 10 seconds to avoid hammering the disk.
   */
  PHOTO_SCAN_INTERVAL_MS: z.coerce.number().int().min(10_000).default(600_000),
});

export type AppConfig = z.infer<typeof envSchema>;

export const loadConfig = (): AppConfig => {
  // Load .env if present. Tests set process.env explicitly; skip .env so
  // intentional deletes (e.g. ADMIN_TOKEN) are not overwritten.
  if (process.env.NODE_ENV !== 'test') {
    dotenv.config();
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Critical init error: Invalid environment variables');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }
  return parsed.data;
};

// Export a dummy config for tests that only need the schema
// No exported default config

