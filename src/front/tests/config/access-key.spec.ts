import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeKey,
  resolveKey,
  saveKey,
  clearKey,
} from '../../config/access-key.js';

describe('normalizeKey', () => {
  it('keeps case and punctuation', () => {
    expect(normalizeKey('k7MQ-2Xa')).toBe('k7MQ-2Xa');
  });

  it('trims edges and rejects inner spaces', () => {
    expect(normalizeKey(' k7mq2xab ')).toBe('k7mq2xab');
    expect(normalizeKey('Ab 3!xY9')).toBeNull();
  });
});

describe('resolveKey', () => {
  let storage: Storage;

  beforeEach(() => {
    const map = new Map<string, string>();
    storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    };
  });

  it('prefers URL key over storage', () => {
    saveKey('AAAAAAAA', storage);
    expect(resolveKey('?key=BBBBBBBB', storage)).toBe('BBBBBBBB');
  });

  it('falls back to storage', () => {
    saveKey('CCCCCCCC', storage);
    expect(resolveKey('', storage)).toBe('CCCCCCCC');
  });

  it('returns raw invalid URL key without case fold', () => {
    expect(resolveKey('?key=short', storage)).toBe('short');
  });
});

describe('saveKey / clearKey', () => {
  it('stores normalized key and clears it', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as Storage;

    saveKey('  k7mq2xab  ', storage);
    expect(resolveKey('', storage)).toBe('k7mq2xab');
    clearKey(storage);
    expect(resolveKey('', storage)).toBeNull();
  });
});
