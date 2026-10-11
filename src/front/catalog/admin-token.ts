const STORAGE_KEY = 'photo-frame.adminToken';

export function loadAdminToken(
  storage: Storage | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
): string | null {
  const value = storage?.getItem(STORAGE_KEY);
  return value && value.length > 0 ? value : null;
}

export function saveAdminToken(
  token: string,
  storage: Storage | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
): void {
  storage?.setItem(STORAGE_KEY, token);
}

export function clearAdminToken(
  storage: Storage | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
): void {
  storage?.removeItem(STORAGE_KEY);
}
