export interface CatalogFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly pathLabel: string;
  readonly photoCount: number;
  /** Готовая ссылка с сервера (из PUBLIC_BASE_URL), если задана. */
  readonly slideshowUrl?: string;
}

/**
 * Запрашивает папки по подстроке имени у бэкенда.
 * Пустой запрос не ходит на сервер: полный каталог на этой странице не нужен.
 */
export async function searchFolders(
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<CatalogFolder[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const root = baseUrl.replace(/\/$/, '');
  const url = new URL(`${root}/api/catalog/folders`);
  url.searchParams.set('q', trimmed);

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
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

/**
 * Готовая ссылка на слайд-шоу с фильтром папок.
 * Несколько id → `?folders=id1,id2` (как ждёт страница слайд-шоу).
 */
export function buildFolderSlideshowUrl(
  baseUrl: string,
  folderIds: readonly string[],
): string {
  if (folderIds.length === 0) {
    throw new Error('Нужен хотя бы один идентификатор папки');
  }
  const root = baseUrl.replace(/\/$/, '');
  const url = new URL(`${root}/`);
  url.searchParams.set('folders', folderIds.join(','));
  return url.toString();
}

/** База для ссылки: из `slideshowUrl` сервера, иначе origin страницы. */
export function resolveSlideshowBaseUrl(
  pageOrigin: string,
  folders: readonly CatalogFolder[],
): string {
  for (const folder of folders) {
    if (folder.slideshowUrl) {
      return new URL(folder.slideshowUrl).origin;
    }
  }
  return pageOrigin.replace(/\/$/, '');
}
