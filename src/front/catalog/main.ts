import {
  buildFolderSlideshowUrl,
  resolveSlideshowBaseUrl,
  searchFolders,
  type CatalogFolder,
} from './folders-api.js';

const SEARCH_DEBOUNCE_MS = 250;

function main(): void {
  const queryInput = document.getElementById('folder-query');
  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results');
  const selectionEl = document.getElementById('selection');
  const selectionListEl = document.getElementById('selection-list');
  const selectionCountEl = document.getElementById('selection-count');
  const urlPreviewEl = document.getElementById('url-preview');
  const copyButton = document.getElementById('copy-link');
  const clearButton = document.getElementById('clear-selection');

  if (
    !(queryInput instanceof HTMLInputElement) ||
    !(statusEl instanceof HTMLParagraphElement) ||
    !(resultsEl instanceof HTMLUListElement) ||
    !(selectionEl instanceof HTMLElement) ||
    !(selectionListEl instanceof HTMLUListElement) ||
    !(selectionCountEl instanceof HTMLElement) ||
    !(urlPreviewEl instanceof HTMLParagraphElement) ||
    !(copyButton instanceof HTMLButtonElement) ||
    !(clearButton instanceof HTMLButtonElement)
  ) {
    throw new Error('На странице каталога нет нужных элементов');
  }

  const pageOrigin = window.location.origin;
  /** Выбранные папки сохраняются между поисками. */
  const selectedById = new Map<string, CatalogFolder>();
  let lastSearchFolders: CatalogFolder[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeController: AbortController | undefined;

  const setStatus = (text: string, kind: '' | 'error' | 'ok' = ''): void => {
    statusEl.textContent = text;
    statusEl.className = kind === '' ? 'status' : `status ${kind}`;
  };

  const currentSlideshowUrl = (): string | null => {
    if (selectedById.size === 0) return null;
    const selected = [...selectedById.values()];
    const baseUrl = resolveSlideshowBaseUrl(pageOrigin, [
      ...selected,
      ...lastSearchFolders,
    ]);
    return buildFolderSlideshowUrl(
      baseUrl,
      selected.map((folder) => folder.id),
    );
  };

  const refreshSelectionPanel = (): void => {
    const selected = [...selectedById.values()];
    selectionListEl.replaceChildren();

    for (const folder of selected) {
      const item = document.createElement('li');
      item.className = 'selection-item';

      const label = document.createElement('span');
      label.className = 'selection-path';
      label.textContent = folder.pathLabel;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost';
      remove.textContent = 'Убрать';
      remove.addEventListener('click', () => {
        selectedById.delete(folder.id);
        refreshSelectionPanel();
        renderFolders(lastSearchFolders);
      });

      item.append(label, remove);
      selectionListEl.append(item);
    }

    const count = selected.length;
    selectionCountEl.textContent =
      count === 0 ? 'Ничего не выбрано' : `Выбрано папок: ${count}`;

    const slideshowUrl = currentSlideshowUrl();
    urlPreviewEl.textContent = slideshowUrl ?? 'Выберите одну или несколько папок';
    copyButton.disabled = slideshowUrl === null;
    clearButton.disabled = count === 0;
    selectionEl.hidden = false;
  };

  const toggleFolder = (folder: CatalogFolder): void => {
    if (selectedById.has(folder.id)) {
      selectedById.delete(folder.id);
    } else {
      selectedById.set(folder.id, folder);
    }
    refreshSelectionPanel();
    renderFolders(lastSearchFolders);
  };

  const renderFolders = (folders: CatalogFolder[]): void => {
    lastSearchFolders = folders;
    resultsEl.replaceChildren();

    for (const folder of folders) {
      const selected = selectedById.has(folder.id);
      const item = document.createElement('li');
      item.className = selected ? 'folder-row selected' : 'folder-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected;
      checkbox.setAttribute('aria-label', `Выбрать ${folder.pathLabel}`);
      checkbox.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleFolder(folder);
      });

      const meta = document.createElement('div');
      meta.className = 'folder-meta';

      const path = document.createElement('div');
      path.className = 'folder-path';
      path.textContent = folder.pathLabel;

      const count = document.createElement('div');
      count.className = 'folder-count';
      count.textContent = `фото: ${folder.photoCount}`;

      meta.append(path, count);
      item.append(checkbox, meta);
      item.addEventListener('click', () => {
        toggleFolder(folder);
      });
      resultsEl.append(item);
    }
  };

  const runSearch = async (rawQuery: string): Promise<void> => {
    activeController?.abort();
    const trimmed = rawQuery.trim();

    if (trimmed.length === 0) {
      lastSearchFolders = [];
      resultsEl.replaceChildren();
      setStatus('Введите часть названия папки');
      return;
    }

    const controller = new AbortController();
    activeController = controller;
    setStatus('Ищем…');

    try {
      const folders = await searchFolders(pageOrigin, trimmed, controller.signal);
      if (controller.signal.aborted) return;

      if (folders.length === 0) {
        lastSearchFolders = [];
        resultsEl.replaceChildren();
        setStatus('Ничего не найдено');
        return;
      }

      renderFolders(folders);
      refreshSelectionPanel();
      setStatus(`Найдено: ${folders.length}`);
    } catch (err) {
      if (controller.signal.aborted) return;
      lastSearchFolders = [];
      resultsEl.replaceChildren();
      const message = err instanceof Error ? err.message : 'Ошибка поиска';
      setStatus(message, 'error');
    }
  };

  copyButton.addEventListener('click', async () => {
    const slideshowUrl = currentSlideshowUrl();
    if (slideshowUrl === null) return;
    try {
      await navigator.clipboard.writeText(slideshowUrl);
      setStatus('Ссылка скопирована в буфер обмена', 'ok');
    } catch {
      setStatus('Не удалось скопировать. Выделите ссылку вручную.', 'error');
    }
  });

  clearButton.addEventListener('click', () => {
    selectedById.clear();
    refreshSelectionPanel();
    renderFolders(lastSearchFolders);
    setStatus('Выбор очищен');
  });

  queryInput.addEventListener('input', () => {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      void runSearch(queryInput.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  refreshSelectionPanel();
  setStatus('Введите часть названия папки');
  queryInput.focus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
