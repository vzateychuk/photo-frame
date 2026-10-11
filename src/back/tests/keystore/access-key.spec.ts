import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KEY_ALPHABET,
  KEY_LENGTH,
  generateKey,
  normalizeKey,
} from '../../keystore/access-key.js';

/** Printable ASCII (codes 32–126), as required by the access-key contract. */
const EXPECTED_ALPHABET = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(32 + i),
).join('');
const EXPECTED_LENGTH = 8;

const actualRandomInt = vi.hoisted(() => ({
  fn: null as null | ((maxExclusive: number) => number),
}));

const randomIntMock = vi.hoisted(() =>
  vi.fn((maxExclusive: number) => {
    if (!actualRandomInt.fn) {
      throw new Error('actual randomInt is not available');
    }
    return actualRandomInt.fn(maxExclusive);
  }),
);

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  actualRandomInt.fn = actual.randomInt as (maxExclusive: number) => number;
  return {
    ...actual,
    randomInt: randomIntMock,
    default: {
      ...(actual as object),
      randomInt: randomIntMock,
    },
  };
});

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  actualRandomInt.fn = actual.randomInt as (maxExclusive: number) => number;
  return {
    ...actual,
    randomInt: randomIntMock,
    default: {
      ...(actual as object),
      randomInt: randomIntMock,
    },
  };
});

describe('KEY_ALPHABET and KEY_LENGTH', () => {
  it('uses printable ASCII (codes 32–126), length 8', () => {
    expect(KEY_ALPHABET).toBe(EXPECTED_ALPHABET);
    expect(KEY_ALPHABET).toHaveLength(95);
    expect(KEY_LENGTH).toBe(EXPECTED_LENGTH);
  });
});

describe('generateKey', () => {
  beforeEach(() => {
    randomIntMock.mockReset();
    randomIntMock.mockImplementation((maxExclusive: number) => {
      if (!actualRandomInt.fn) {
        throw new Error('actual randomInt is not available');
      }
      return actualRandomInt.fn(maxExclusive);
    });
  });

  it('returns 8 characters from KEY_ALPHABET over hundreds of calls', () => {
    const alphabetSet = new Set(EXPECTED_ALPHABET.split(''));
    for (let i = 0; i < 500; i += 1) {
      const key = generateKey(() => false);
      expect(key).toHaveLength(EXPECTED_LENGTH);
      for (const char of key) {
        expect(alphabetSet.has(char)).toBe(true);
      }
    }
  });

  it('retries until exists returns false', () => {
    // Indices into alphabet: build "AAAAAAAA" then "BBBBBBBB".
    const indexA = EXPECTED_ALPHABET.indexOf('A');
    const indexB = EXPECTED_ALPHABET.indexOf('B');
    let call = 0;
    randomIntMock.mockImplementation(() => {
      call += 1;
      return call <= EXPECTED_LENGTH ? indexA : indexB;
    });

    const taken = new Set(['AAAAAAAA']);
    const key = generateKey((candidate) => taken.has(candidate));

    expect(key).toBe('BBBBBBBB');
    expect(call).toBe(EXPECTED_LENGTH * 2);
  });
});

describe('normalizeKey', () => {
  it('returns a lowercase key unchanged', () => {
    expect(normalizeKey('k7mq2xab')).toBe('k7mq2xab');
  });

  it('returns an uppercase key unchanged', () => {
    expect(normalizeKey('K7MQ2XAB')).toBe('K7MQ2XAB');
  });

  it('returns a mixed-case key unchanged', () => {
    expect(normalizeKey('k7MQ2xAb')).toBe('k7MQ2xAb');
  });

  it('accepts printable ASCII punctuation within length 8', () => {
    expect(normalizeKey('K7MQ-2Xa')).toBe('K7MQ-2Xa');
    expect(normalizeKey('Ab 3!xY9')).toBe('Ab 3!xY9');
  });

  it('treats different case as different keys', () => {
    expect(normalizeKey('k7mq2xab')).not.toBe(normalizeKey('K7MQ2XAB'));
  });

  it('rejects non-ASCII characters', () => {
    expect(normalizeKey('K7MQ2XAЖ')).toBeNull();
  });

  it('rejects wrong length', () => {
    expect(normalizeKey('K7MQ2XA')).toBeNull();
    expect(normalizeKey('K7MQ-2XAB')).toBeNull(); // 9 characters
    expect(normalizeKey('K7MQ2XABC')).toBeNull();
    expect(normalizeKey('')).toBeNull();
  });
});
