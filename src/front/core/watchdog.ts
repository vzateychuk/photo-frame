import type { SlideshowEngine } from './engine.js';

export interface WatchdogOptions {
  baseUrl: string;
  /** Сколько можно работать без единого показанного кадра, прежде чем перезагрузить страницу. */
  stallTimeoutMs?: number;
  checkIntervalMs?: number;
  healthTimeoutMs?: number;
  reload?: () => void;
}

/**
 * Последняя линия обороны от зависаний, которые движок сам не отлавливает
 * (утечки памяти WebView, повисший декодер, странное состояние после сна приставки).
 *
 * Если показ запущен, страница видна и нового кадра не было дольше stallTimeoutMs,
 * перезагружает страницу. Перед перезагрузкой проверяет /health: страницу отдаёт тот же
 * сервер, и перезагрузка при недоступной Pi оставила бы браузер на странице ошибки
 * без JS, то есть без автоматического восстановления. Пока сервер недоступен,
 * восстановлением занимается сам движок.
 *
 * Возвращает функцию остановки сторожевого таймера.
 */
export function startWatchdog(engine: SlideshowEngine, options: WatchdogOptions): () => void {
  const {
    baseUrl,
    stallTimeoutMs = 15 * 60_000,
    checkIntervalMs = 60_000,
    healthTimeoutMs = 5_000,
    reload = () => window.location.reload(),
  } = options;

  let checking = false;

  const check = async () => {
    if (checking || !engine.isRunning() || document.visibilityState === 'hidden') return;
    if (Date.now() - engine.getLastProgressAt() < stallTimeoutMs) return;

    checking = true;
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(healthTimeoutMs),
      });
      if (response.ok && engine.isRunning()) {
        console.warn('[Watchdog] No new frame for too long, reloading page');
        reload();
      }
    } catch {
      // Сервер недоступен — перезагрузка только навредит, ждём следующей проверки
    } finally {
      checking = false;
    }
  };

  const intervalId = setInterval(() => void check(), checkIntervalMs);
  return () => clearInterval(intervalId);
}
