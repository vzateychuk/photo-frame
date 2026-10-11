import { ApiClient } from './api/client.js';
import { LayerManager } from './ui/layer-manager.js';
import { SlideshowEngine } from './core/engine.js';
import { startWatchdog } from './core/watchdog.js';
import { clearKey, resolveKey, saveKey } from './config/access-key.js';

function getConfigFromUrl(): {
  intervalMs: number;
  screenWidth: number;
  screenHeight: number;
} {
  const params = new URLSearchParams(window.location.search);
  const intervalMs = Math.max(1000, Number(params.get('interval')) || 5000);
  const dpr = window.devicePixelRatio || 1;
  const physicalWidth = Math.round(screen.width * dpr);
  const physicalHeight = Math.round(screen.height * dpr);
  const screenWidth = Math.max(100, Math.min(3840, Number(params.get('w')) || physicalWidth));
  const screenHeight = Math.max(100, Math.min(2160, Number(params.get('h')) || physicalHeight));
  return { intervalMs, screenWidth, screenHeight };
}

function createSlideshowDOM(): {
  layerA: HTMLImageElement;
  layerB: HTMLImageElement;
} {
  const container = document.createElement('div');
  container.id = 'slideshow-container';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #000;
    overflow: hidden;
  `;

  const layerA = document.createElement('img');
  const layerB = document.createElement('img');

  [layerA, layerB].forEach((layer) => {
    layer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    `;
    container.appendChild(layer);
  });

  document.body.appendChild(container);
  return { layerA, layerB };
}

function showCodePrompt(onSubmit: (code: string) => void, message?: string): void {
  document.getElementById('code-prompt')?.remove();

  const panel = document.createElement('div');
  panel.id = 'code-prompt';
  panel.style.cssText = `
    position: fixed; inset: 0; z-index: 20;
    display: flex; align-items: center; justify-content: center;
    background: #000; color: #fff; font-family: system-ui, sans-serif;
  `;
  panel.innerHTML = `
    <form id="code-form" style="display:flex;flex-direction:column;gap:0.75rem;width:min(20rem,90vw);">
      <p style="margin:0;color:#ccc;text-align:center;"></p>
      <input id="code-input" name="code" autocomplete="off" spellcheck="false"
        style="padding:0.75rem;font-size:1.1rem;border-radius:6px;border:1px solid #444;background:#111;color:#fff;"
        placeholder="код доступа" />
      <button type="submit"
        style="padding:0.7rem;border:none;border-radius:6px;background:#c4a35a;color:#1a1408;font-weight:600;cursor:pointer;">
        Открыть
      </button>
    </form>
  `;
  document.body.appendChild(panel);

  const form = panel.querySelector('#code-form');
  const input = panel.querySelector('#code-input');
  const msg = panel.querySelector('p');
  if (
    !(form instanceof HTMLFormElement) ||
    !(input instanceof HTMLInputElement) ||
    !(msg instanceof HTMLParagraphElement)
  ) {
    return;
  }
  msg.textContent = message ?? 'Введите код';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (value.length === 0) return;
    panel.remove();
    onSubmit(value);
  });
  input.focus();
}

function navigateWithKey(code: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('key', code);
  window.location.href = url.toString();
}

async function requestWakeLock(): Promise<void> {
  if ('wakeLock' in navigator) {
    try {
      await (
        navigator as Navigator & {
          wakeLock: { request: (type: 'screen') => Promise<unknown> };
        }
      ).wakeLock.request('screen');
    } catch {
      /* ignore */
    }
  }
}

function startSlideshow(accessKey: string): void {
  const { intervalMs, screenWidth, screenHeight } = getConfigFromUrl();
  const { layerA, layerB } = createSlideshowDOM();
  const baseUrl = window.location.origin;

  const apiClient = new ApiClient({
    baseUrl,
    intervalMs,
    screenWidth,
    screenHeight,
    accessKey,
  });
  const layerManager = new LayerManager(layerA, layerB);
  const engine = new SlideshowEngine(apiClient, layerManager, intervalMs, {
    onAccessDenied: () => {
      clearKey();
      showCodePrompt(
        navigateWithKey,
        'Код недействителен. Попросите новый у владельца',
      );
    },
  });

  void requestWakeLock();

  document.addEventListener('dblclick', async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        /* ignore */
      }
    }
  });

  saveKey(accessKey);
  void engine.start();
  startWatchdog(engine, { baseUrl });
}

async function main(): Promise<void> {
  const key = resolveKey();
  if (key === null || key === '') {
    showCodePrompt(navigateWithKey);
    return;
  }

  startSlideshow(key);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void main();
  });
} else {
  void main();
}
