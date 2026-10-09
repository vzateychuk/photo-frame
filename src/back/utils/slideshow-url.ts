/** Готовая ссылка на слайд-шоу с фильтром одной или нескольких папок. */
export function buildFolderSlideshowUrl(
  publicBaseUrl: string,
  folderIds: string | readonly string[],
): string {
  const ids = typeof folderIds === 'string' ? [folderIds] : [...folderIds];
  if (ids.length === 0) {
    throw new Error('Нужен хотя бы один идентификатор папки');
  }
  const root = publicBaseUrl.replace(/\/$/, '');
  const url = new URL(`${root}/`);
  url.searchParams.set('folders', ids.join(','));
  return url.toString();
}
