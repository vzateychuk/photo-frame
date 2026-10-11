import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonKeyStore } from '../../keystore/json-key-store.js';
import type { AccessKey } from '../../types.js';

describe('JsonKeyStore', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'photo-frame-keystore-'));
    filePath = path.join(tempDir, 'keystore.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads as empty when the file is missing', () => {
    const store = JsonKeyStore.load(filePath);

    expect(store.list()).toEqual([]);
    expect(existsSync(filePath)).toBe(false);
  });

  it('persists add to disk and reloads', () => {
    const store = JsonKeyStore.load(filePath);
    const record: AccessKey = {
      key: 'k7mq2Xab',
      label: 'test',
      folders: 'all',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
    };

    store.add(record);

    expect(store.get('k7mq2Xab')).toEqual(record);
    expect(existsSync(filePath)).toBe(true);

    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as {
      version: number;
      keys: AccessKey[];
    };
    expect(onDisk.version).toBe(1);
    expect(onDisk.keys).toEqual([record]);

    const reloaded = JsonKeyStore.load(filePath);
    expect(reloaded.list()).toEqual([record]);
  });

  it('removes a key and persists the change', () => {
    const store = JsonKeyStore.load(filePath);
    store.add({
      key: 'k7mq2Xab',
      label: 'test',
      folders: 'all',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
    });

    expect(store.remove('k7mq2Xab')).toBe(true);
    expect(store.get('k7mq2Xab')).toBeNull();
    expect(store.remove('k7mq2Xab')).toBe(false);

    const reloaded = JsonKeyStore.load(filePath);
    expect(reloaded.list()).toEqual([]);
  });
});
