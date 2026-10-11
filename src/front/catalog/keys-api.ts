export interface AccessKeyRecord {
  readonly key: string;
  readonly label: string;
  readonly folders: 'all' | string[];
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly url?: string;
}

function authHeaders(adminToken: string): HeadersInit {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };
}

function jsonAuthHeaders(adminToken: string): HeadersInit {
  return {
    ...authHeaders(adminToken),
    'Content-Type': 'application/json',
  };
}

export async function listKeys(
  baseUrl: string,
  adminToken: string,
  signal?: AbortSignal,
): Promise<AccessKeyRecord[]> {
  const root = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${root}/api/keys`, {
    headers: authHeaders(adminToken),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`Список ключей: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { keys?: unknown };
  if (!Array.isArray(data.keys)) {
    throw new Error('Некорректный ответ: нет keys');
  }
  return data.keys as AccessKeyRecord[];
}

export async function createKey(
  baseUrl: string,
  adminToken: string,
  body: {
    label: string;
    folders: 'all' | string[];
    ttlHours?: number;
  },
): Promise<AccessKeyRecord> {
  const root = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${root}/api/keys`, {
    method: 'POST',
    headers: jsonAuthHeaders(adminToken),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Создание ключа: HTTP ${response.status}`);
  }
  return (await response.json()) as AccessKeyRecord;
}

export async function deleteKey(
  baseUrl: string,
  adminToken: string,
  key: string,
): Promise<void> {
  const root = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${root}/api/keys/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: authHeaders(adminToken),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Удаление ключа: HTTP ${response.status}`);
  }
}

export function buildKeySlideshowUrl(baseUrl: string, key: string): string {
  const root = baseUrl.replace(/\/$/, '');
  const url = new URL(`${root}/`);
  url.searchParams.set('key', key);
  return url.toString();
}
