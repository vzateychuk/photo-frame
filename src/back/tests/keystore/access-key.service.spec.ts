import { describe, it, expect, beforeEach } from 'vitest';
import { AccessKeyService } from '../../keystore/access-key.service.js';
import type { AccessKey, KeyStore } from '../../types.js';

class MemoryKeyStore implements KeyStore {
  private readonly map = new Map<string, AccessKey>();

  list(): AccessKey[] {
    return [...this.map.values()];
  }

  get(key: string): AccessKey | null {
    return this.map.get(key) ?? null;
  }

  add(record: AccessKey): void {
    this.map.set(record.key, record);
  }

  remove(key: string): boolean {
    return this.map.delete(key);
  }
}

describe('AccessKeyService', () => {
  let store: MemoryKeyStore;
  let service: AccessKeyService;

  beforeEach(() => {
    store = new MemoryKeyStore();
    service = new AccessKeyService(store);
  });

  it('resolves a valid non-expired key', () => {
    const record: AccessKey = {
      key: 'k7mq2Xab',
      label: 'ok',
      folders: 'all',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
    };
    store.add(record);

    expect(service.resolve('k7mq2Xab')).toEqual(record);
    expect(service.resolve('  k7mq2Xab  ')).toEqual(record);
  });

  it('returns null for a missing key', () => {
    expect(service.resolve('k7mq2Xab')).toBeNull();
  });

  it('returns null for an invalid key shape', () => {
    expect(service.resolve('short')).toBeNull();
    expect(service.resolve('')).toBeNull();
  });

  it('returns null for an expired key', () => {
    store.add({
      key: 'k7mq2Xab',
      label: 'expired',
      folders: 'all',
      createdAt: '2020-01-01T00:00:00.000Z',
      expiresAt: '2020-01-02T00:00:00.000Z',
    });

    expect(service.resolve('k7mq2Xab')).toBeNull();
  });

  it('folderIdsFor returns undefined for all and the list otherwise', () => {
    expect(
      service.folderIdsFor({
        key: 'k7mq2Xab',
        label: 'all',
        folders: 'all',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
      }),
    ).toBeUndefined();

    expect(
      service.folderIdsFor({
        key: 'k7mq2Xab',
        label: 'scoped',
        folders: ['f1', 'f2'],
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
      }),
    ).toEqual(['f1', 'f2']);
  });
});
