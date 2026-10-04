import { ApiClient } from './api/client.js';
import { LayerManager } from './ui/layer-manager.js';
import { SlideshowEngine } from './core/engine.js';

/**
 * Парсит параметры URL для конфигурации.
 */
function getConfigFromUrl(): { intervalMs: number; screenWidth: number; screenHeight: number } {
  const params = new URLSearchParams(window.location.search);
  const intervalMs = Math.max(1000, Number(params.get('interval')) || 5000);
  const screenWidth = Math.max(100, Math.min(3840, Number(params.get('w')) || screen.width));
  const screenHeight = Math.max(100, Math.min(2160, Number(params.get('h')) || screen.height));
  return { intervalMs, screenWidth, screenHeight };
}

/**
 * Создает DOM структуру для слайд-шоу.
 */
function createSlideshowDOM(): { layerA: HTMLImageElement; layerB: HTMLImageElement; container: HTMLDivElement } {
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
  return { layerA, layerB, container };
}

/**
 * Запрашивает Wake Lock для предотвращения засыпания экрана.
 */
async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if ('wakeLock' in navigator) {
    try {
      const sentinel = await (navigator as any).wakeLock.request('screen');
      console.log('[Wake Lock] Acquired');
      sentinel.addEventListener('release', () => console.log('[Wake Lock] Released'));
      return sentinel;
    } catch (err) {
      console.warn('[Wake Lock] Failed:', err);
    }
  }
  return null;
}

/**
 * Точка входа фронтенда.
 */
async function main(): Promise<void> {
  const { intervalMs, screenWidth, screenHeight } = getConfigFromUrl();
  const { layerA, layerB } = createSlideshowDOM();

  // Базовый URL бэкенда — текущий origin
  const baseUrl = window.location.origin;

  const apiClient = new ApiClient({ baseUrl, intervalMs, screenWidth, screenHeight });
  const layerManager = new LayerManager(layerA, layerB);
  const engine = new SlideshowEngine(apiClient, layerManager, intervalMs);

  // Wake Lock (best effort)
  await requestWakeLock();

  // Полноэкранный режим по двойному клику (опционально)
  document.addEventListener('dblclick', async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (err) {
        console.warn('[Fullscreen] Failed:', err);
      }
    }
  });

  // Запуск
  console.log('[PhotoFrame] Starting slideshow', { intervalMs, screenWidth, screenHeight });
  await engine.start();
}

// Запуск при готовности DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}