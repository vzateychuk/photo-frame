import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KEY_ALPHABET,
  KEY_LENGTH,
  generateKey,
  normalizeKey,
} from '../../keystore/access-key.js';

/**
 * Contract: printable ASCII without space (codes 33–126), length 8,
 * case kept as entered. Trim edge spaces, then validate; space inside → invalid.
 */
const EXPECTED_ALPHABET = Array.from({ length: 94 }, (_, i) =>
  String.fromCharCode(33 + i),
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
  it('uses printable ASCII without space (codes 33–126), length 8', () => {
    expect(KEY_ALPHABET).toBe(EXPECTED_ALPHABET);
    expect(KEY_ALPHABET).toHaveLength(94);
    expect(KEY_ALPHABET).not.toContain(' ');
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

  it('draws each character via crypto.randomInt over KEY_ALPHABET', () => {
    const key = generateKey(() => false);

    expect(key).toHaveLength(EXPECTED_LENGTH);
    expect(randomIntMock).toHaveBeenCalledTimes(EXPECTED_LENGTH);
    for (const call of randomIntMock.mock.calls) {
      expect(call[0]).toBe(EXPECTED_ALPHABET.length);
    }
  });

  it('returns 8 characters from KEY_ALPHABET over hundreds of calls', () => {
    const alphabetSet = new Set(EXPECTED_ALPHABET.split(''));
    for (let i = 0; i < 500; i += 1) {
      const key = generateKey(() => false);
      expect(key).toHaveLength(EXPECTED_LENGTH);
      expect(key).not.toContain(' ');
      for (const char of key) {
        expect(alphabetSet.has(char)).toBe(true);
      }
    }
  });

  it('retries until exists returns false', () => {
    // Indices into alphabet: build "AAAAAAAA", then "BBBBBBBB", then "CCCCCCCC".
    const indexA = EXPECTED_ALPHABET.indexOf('A');
    const indexB = EXPECTED_ALPHABET.indexOf('B');
    const indexC = EXPECTED_ALPHABET.indexOf('C');
    let call = 0;
    randomIntMock.mockImplementation(() => {
      call += 1;
      if (call <= EXPECTED_LENGTH) return indexA;
      if (call <= EXPECTED_LENGTH * 2) return indexB;
      return indexC;
    });

    const taken = new Set(['AAAAAAAA', 'BBBBBBBB']);
    const key = generateKey((candidate) => taken.has(candidate));

    expect(key).toBe('CCCCCCCC');
    expect(call).toBe(EXPECTED_LENGTH * 3);
  });
});

describe('normalizeKey', () => {
  it('returns a valid key unchanged (no case fold, no strip of punctuation)', () => {
    expect(normalizeKey('k7mq2xab')).toBe('k7mq2xab');
    expect(normalizeKey('K7MQ2XAB')).toBe('K7MQ2XAB');
    expect(normalizeKey('k7MQ2xAb')).toBe('k7MQ2xAb');
    expect(normalizeKey('K7MQ-2Xa')).toBe('K7MQ-2Xa');
    expect(normalizeKey('Ab_3?xY9')).toBe('Ab_3?xY9');
  });

  it('treats different case as different keys', () => {
    expect(normalizeKey('k7mq2xab')).not.toBe(normalizeKey('K7MQ2XAB'));
  });

  it('trims spaces at the edges, then validates', () => {
    expect(normalizeKey(' k7mq2xab')).toBe('k7mq2xab');
    expect(normalizeKey('k7mq2xab ')).toBe('k7mq2xab');
    expect(normalizeKey('  k7mq2xab  ')).toBe('k7mq2xab');
    // After trim the core is still too short → invalid.
    expect(normalizeKey(' k7mq2xa')).toBeNull();
  });

  it('rejects a key that still contains a space after trimming edges', () => {
    expect(normalizeKey('Ab 3!xY9')).toBeNull();
  });

  it('rejects non-ASCII characters', () => {
    expect(normalizeKey('K7MQ2XAЖ')).toBeNull();
  });

  it('rejects characters outside the alphabet', () => {
    expect(normalizeKey('K7MQ2XA\t')).toBeNull();
    expect(normalizeKey('K7MQ2XA\n')).toBeNull();
  });

  it('rejects wrong length', () => {
    expect(normalizeKey('K7MQ2XA')).toBeNull();
    expect(normalizeKey('K7MQ-2XAB')).toBeNull(); // 9 characters
    expect(normalizeKey('K7MQ2XABC')).toBeNull();
    expect(normalizeKey('')).toBeNull();
  });

  it('coerces non-string input to a string, then validates', () => {
    // null → ordinary string "null" (length 4) → invalid key
    expect(normalizeKey(null as unknown as string)).toBeNull();
    // number → decimal digits as characters; eight digits can be a valid key
    expect(normalizeKey(12345678 as unknown as string)).toBe('12345678');
    expect(normalizeKey(123 as unknown as string)).toBeNull();
  });
});
