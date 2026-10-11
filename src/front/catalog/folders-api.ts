export interface CatalogFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly pathLabel: string;
  readonly photoCount: number;
  readonly slideshowUrl?: string;
}

export interface SearchFoldersOptions {
  readonly signal?: AbortSignal;
  readonly adminToken: string;
}

/**
 * Запрашивает папки по подстроке имени: GET /api/catalog with Bearer token.
 */
export async function searchFolders(
  baseUrl: string,
  query: string,
  options: SearchFoldersOptions,
): Promise<CatalogFolder[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const root = baseUrl.replace(/\/$/, '');
  const url = new URL(`${root}/api/catalog`);
  url.searchParams.set('q', trimmed);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${options.adminToken}`,
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`Поиск папок не удался: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { folders?: unknown };
  if (!Array.isArray(data.folders)) {
    throw new Error('Некорректный ответ сервера: нет списка папок');
  }

  return data.folders.map(parseFolder);
}

function parseFolder(value: unknown): CatalogFolder {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Некорректная запись папки');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id === '') {
    throw new Error('Некорректная запись папки: нет id');
  }
  if (typeof record.name !== 'string') {
    throw new Error('Некорректная запись папки: нет name');
  }
  if (typeof record.pathLabel !== 'string') {
    throw new Error('Некорректная запись папки: нет pathLabel');
  }
  if (typeof record.photoCount !== 'number') {
    throw new Error('Некорректная запись папки: нет photoCount');
  }
  const parentId =
    record.parentId === null || typeof record.parentId === 'string'
      ? record.parentId
      : null;
  const slideshowUrl =
    typeof record.slideshowUrl === 'string' && record.slideshowUrl !== ''
      ? record.slideshowUrl
      : undefined;

  return {
    id: record.id,
    name: record.name,
    parentId,
    pathLabel: record.pathLabel,
    photoCount: record.photoCount,
    ...(slideshowUrl === undefined ? {} : { slideshowUrl }),
  };
}
