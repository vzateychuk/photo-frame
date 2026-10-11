const STORAGE_KEY = 'photo-frame.accessKey';

/** Printable ASCII without space (codes 33–126), length 8. */
const KEY_ALPHABET = Array.from({ length: 94 }, (_, i) =>
  String.fromCharCode(33 + i),
).join('');
const KEY_LENGTH = 8;

/**
 * Same rules as backend normalizeKey: String(...), trim edges, validate.
 */
export function normalizeKey(input: unknown): string | null {
  const str = String(input).trim();
  if (str.length !== KEY_LENGTH) return null;
  for (const ch of str) {
    if (ch === ' ' || KEY_ALPHABET.indexOf(ch) === -1) return null;
  }
  return str;
}

/**
 * URL ?key= wins over localStorage.
 * Invalid URL value is still returned raw (no case fold) so the server can deny it.
 */
export function resolveKey(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const fromUrl = params.get('key');
  if (fromUrl !== null && fromUrl !== '') {
    const normalized = normalizeKey(fromUrl);
    return normalized ?? fromUrl.trim();
  }
  if (!storage) return null;
  const saved = storage.getItem(STORAGE_KEY);
  if (saved === null || saved === '') return null;
  return normalizeKey(saved) ?? saved;
}

export function saveKey(
  key: string,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!storage) return;
  const normalized = normalizeKey(key);
  if (normalized) storage.setItem(STORAGE_KEY, normalized);
}

export function clearKey(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  storage?.removeItem(STORAGE_KEY);
}
