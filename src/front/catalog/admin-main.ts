import { searchFolders, type CatalogFolder } from './folders-api.js';
import {
  clearAdminToken,
  loadAdminToken,
  saveAdminToken,
} from './admin-token.js';
import {
  buildKeySlideshowUrl,
  createKey,
  deleteKey,
  listKeys,
  type AccessKeyRecord,
} from './keys-api.js';

const SEARCH_DEBOUNCE_MS = 250;

function main(): void {
  const tokenGate = el('token-gate', HTMLElement);
  const adminApp = el('admin-app', HTMLElement);
  const tokenInput = el('admin-token', HTMLInputElement);
  const saveTokenBtn = el('save-token', HTMLButtonElement);
  const clearTokenBtn = el('clear-token', HTMLButtonElement);
  const tokenStatus = el('token-status', HTMLParagraphElement);
  const labelInput = el('key-label', HTMLInputElement);
  const ttlInput = el('ttl-hours', HTMLInputElement);
  const queryInput = el('folder-query', HTMLInputElement);
  const searchStatus = el('search-status', HTMLParagraphElement);
  const folderResults = el('folder-results', HTMLUListElement);
  const selectionSummary = el('selection-summary', HTMLParagraphElement);
  const createBtn = el('create-key', HTMLButtonElement);
  const useAllBtn = el('use-all', HTMLButtonElement);
  const createStatus = el('create-status', HTMLParagraphElement);
  const createdUrl = el('created-url', HTMLParagraphElement);
  const refreshKeysBtn = el('refresh-keys', HTMLButtonElement);
  const keysStatus = el('keys-status', HTMLParagraphElement);
  const keysList = el('keys-list', HTMLUListElement);

  const pageOrigin = window.location.origin;
  const selectedById = new Map<string, CatalogFolder>();
  let useAllFolders = true;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeController: AbortController | undefined;

  const setStatus = (
    node: HTMLParagraphElement,
    text: string,
    kind: '' | 'error' | 'ok' = '',
  ): void => {
    node.textContent = text;
    node.className = kind === '' ? 'status' : `status ${kind}`;
  };

  const refreshSelectionSummary = (): void => {
    if (useAllFolders) {
      selectionSummary.textContent = 'Область: весь архив';
      return;
    }
    selectionSummary.textContent = `Область: папок выбрано ${selectedById.size}`;
  };

  const requireToken = (): string | null => {
    const token = loadAdminToken();
    if (!token) {
      showGate('Сначала сохраните токен');
      return null;
    }
    return token;
  };

  const showGate = (message?: string): void => {
    adminApp.hidden = true;
    tokenGate.hidden = false;
    if (message) setStatus(tokenStatus, message, 'error');
  };

  const showApp = async (): Promise<void> => {
    tokenGate.hidden = true;
    adminApp.hidden = false;
    await reloadKeys();
  };

  const renderFolders = (folders: CatalogFolder[]): void => {
    folderResults.replaceChildren();
    for (const folder of folders) {
      const selected = selectedById.has(folder.id);
      const item = document.createElement('li');
      item.className = 'folder-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected;
      checkbox.addEventListener('change', () => {
        useAllFolders = false;
        if (checkbox.checked) selectedById.set(folder.id, folder);
        else selectedById.delete(folder.id);
        refreshSelectionSummary();
      });
      const meta = document.createElement('div');
      meta.innerHTML = `<div class="folder-path"></div><div class="muted"></div>`;
      const path = meta.querySelector('.folder-path');
      const count = meta.querySelector('.muted');
      if (path) path.textContent = folder.pathLabel;
      if (count) count.textContent = `фото: ${folder.photoCount}`;
      item.append(checkbox, meta);
      folderResults.append(item);
    }
  };

  const runSearch = async (raw: string): Promise<void> => {
    const token = requireToken();
    if (!token) return;
    activeController?.abort();
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      folderResults.replaceChildren();
      setStatus(searchStatus, 'Введите часть названия');
      return;
    }
    const controller = new AbortController();
    activeController = controller;
    setStatus(searchStatus, 'Ищем…');
    try {
      const folders = await searchFolders(pageOrigin, trimmed, {
        signal: controller.signal,
        adminToken: token,
      });
      if (controller.signal.aborted) return;
      renderFolders(folders);
      setStatus(
        searchStatus,
        folders.length === 0 ? 'Ничего не найдено' : `Найдено: ${folders.length}`,
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Ошибка поиска';
      setStatus(searchStatus, message, 'error');
      if (message.includes('401')) {
        clearAdminToken();
        showGate('Токен отклонён (401). Введите снова.');
      }
    }
  };

  const reloadKeys = async (): Promise<void> => {
    const token = requireToken();
    if (!token) return;
    setStatus(keysStatus, 'Загрузка…');
    try {
      const keys = await listKeys(pageOrigin, token);
      renderKeys(keys, token);
      setStatus(keysStatus, keys.length === 0 ? 'Ключей пока нет' : `Ключей: ${keys.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка';
      setStatus(keysStatus, message, 'error');
      if (message.includes('401')) {
        clearAdminToken();
        showGate('Токен отклонён (401). Введите снова.');
      }
    }
  };

  const renderKeys = (keys: AccessKeyRecord[], token: string): void => {
    keysList.replaceChildren();
    for (const record of keys) {
      const item = document.createElement('li');
      item.className = 'key-row';
      const meta = document.createElement('div');
      meta.style.flex = '1';
      const title = document.createElement('div');
      title.className = 'key-label';
      title.textContent = `${record.label} · ${record.key}`;
      const details = document.createElement('div');
      details.className = 'muted';
      const scope =
        record.folders === 'all' ? 'весь архив' : `папок: ${record.folders.length}`;
      const expiry = record.expiresAt
        ? `до ${new Date(record.expiresAt).toLocaleString()}`
        : 'бессрочно';
      details.textContent = `${scope} · ${expiry}`;
      const urlLine = document.createElement('p');
      urlLine.className = 'url-preview';
      urlLine.textContent =
        record.url ?? buildKeySlideshowUrl(pageOrigin, record.key);
      meta.append(title, details, urlLine);

      const actions = document.createElement('div');
      actions.className = 'row';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'Копировать';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(urlLine.textContent ?? '');
          setStatus(keysStatus, 'Ссылка скопирована', 'ok');
        } catch {
          setStatus(keysStatus, 'Не удалось скопировать', 'error');
        }
      });
      const revokeBtn = document.createElement('button');
      revokeBtn.type = 'button';
      revokeBtn.className = 'ghost';
      revokeBtn.textContent = 'Отозвать';
      revokeBtn.addEventListener('click', async () => {
        try {
          await deleteKey(pageOrigin, token, record.key);
          setStatus(keysStatus, 'Ключ отозван', 'ok');
          await reloadKeys();
        } catch (err) {
          setStatus(
            keysStatus,
            err instanceof Error ? err.message : 'Ошибка удаления',
            'error',
          );
        }
      });
      actions.append(copyBtn, revokeBtn);
      item.append(meta, actions);
      keysList.append(item);
    }
  };

  saveTokenBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (token.length < 32) {
      setStatus(tokenStatus, 'Токен не короче 32 символов', 'error');
      return;
    }
    saveAdminToken(token);
    setStatus(tokenStatus, 'Токен сохранён в sessionStorage', 'ok');
    void showApp();
  });

  clearTokenBtn.addEventListener('click', () => {
    clearAdminToken();
    tokenInput.value = '';
    showGate('Токен очищен');
  });

  useAllBtn.addEventListener('click', () => {
    useAllFolders = true;
    selectedById.clear();
    folderResults.querySelectorAll('input[type="checkbox"]').forEach((node) => {
      if (node instanceof HTMLInputElement) node.checked = false;
    });
    refreshSelectionSummary();
  });

  createBtn.addEventListener('click', async () => {
    const token = requireToken();
    if (!token) return;
    const label = labelInput.value.trim();
    if (label.length === 0) {
      setStatus(createStatus, 'Укажите подпись', 'error');
      return;
    }
    if (!useAllFolders && selectedById.size === 0) {
      setStatus(createStatus, 'Выберите папки или «Весь архив»', 'error');
      return;
    }
    const ttlRaw = ttlInput.value.trim();
    const ttlHours = ttlRaw === '' ? undefined : Number(ttlRaw);
    if (ttlHours !== undefined && (!Number.isInteger(ttlHours) || ttlHours < 1)) {
      setStatus(createStatus, 'Срок должен быть целым числом ≥ 1', 'error');
      return;
    }

    setStatus(createStatus, 'Создаём…');
    try {
      const record = await createKey(pageOrigin, token, {
        label,
        folders: useAllFolders ? 'all' : [...selectedById.keys()],
        ...(ttlHours === undefined ? {} : { ttlHours }),
      });
      const url = record.url ?? buildKeySlideshowUrl(pageOrigin, record.key);
      createdUrl.hidden = false;
      createdUrl.textContent = url;
      try {
        await navigator.clipboard.writeText(url);
        setStatus(createStatus, 'Код создан, ссылка скопирована', 'ok');
      } catch {
        setStatus(createStatus, 'Код создан — скопируйте ссылку вручную', 'ok');
      }
      await reloadKeys();
    } catch (err) {
      setStatus(
        createStatus,
        err instanceof Error ? err.message : 'Ошибка создания',
        'error',
      );
    }
  });

  refreshKeysBtn.addEventListener('click', () => {
    void reloadKeys();
  });

  queryInput.addEventListener('input', () => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void runSearch(queryInput.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  refreshSelectionSummary();
  const existing = loadAdminToken();
  if (existing) {
    tokenInput.value = existing;
    void showApp();
  } else {
    showGate();
  }
}

function el<T extends Element>(id: string, ctor: abstract new (...args: never[]) => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof ctor)) {
    throw new Error(`Missing #${id}`);
  }
  return node;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
