import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LayerManager } from '../../ui/layer-manager.js';

describe('LayerManager', () => {
  let layerManager: LayerManager;
  let layerA: HTMLImageElement;
  let layerB: HTMLImageElement;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    layerA = document.createElement('img');
    layerB = document.createElement('img');
    layerA.style.position = 'absolute';
    layerB.style.position = 'absolute';
    layerA.style.top = '0';
    layerA.style.left = '0';
    layerA.style.width = '100%';
    layerA.style.height = '100%';
    layerB.style.top = '0';
    layerB.style.left = '0';
    layerB.style.width = '100%';
    layerB.style.height = '100%';
    container.appendChild(layerA);
    container.appendChild(layerB);

    layerManager = new LayerManager(layerA, layerB);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  describe('preloadImage', () => {
    it('should load image into inactive layer and resolve on load', async () => {
      const url = new URL('http://test.com/image.jpg');
      const promise = layerManager.preloadImage(url);

      layerB.onload?.(new Event('load'));

      await expect(promise).resolves.toBeUndefined();
      expect(layerB.src).toBe(url.toString());
    });

    it('should reject on image load error', async () => {
      const url = new URL('http://test.com/broken.jpg');
      const promise = layerManager.preloadImage(url);

      layerB.onerror?.(new Event('error'));

      await expect(promise).rejects.toThrow('Failed to load image');
    });

    it('should load into currently inactive layer', async () => {
      // Изначально inactive = layerB
      const p1 = layerManager.preloadImage(new URL('http://test.com/1.jpg'));
      layerB.onload?.(new Event('load'));
      await p1;
      expect(layerB.src).toContain('1.jpg');

      // После swapLayers: active=layerB, inactive=layerA
      layerManager.swapLayers();

      // Следующая загрузка должна идти в layerA
      const p2 = layerManager.preloadImage(new URL('http://test.com/2.jpg'));
      layerA.onload?.(new Event('load'));
      await p2;
      expect(layerA.src).toContain('2.jpg');
    });
  });

  describe('swapLayers', () => {
    it('should swap active/inactive layers with crossfade', () => {
      layerA.style.opacity = '1';
      layerB.style.opacity = '0';
      layerA.style.zIndex = '1';
      layerB.style.zIndex = '0';

      layerManager.swapLayers();

      expect(layerA.style.opacity).toBe('0');
      expect(layerB.style.opacity).toBe('1');
      expect(layerA.style.zIndex).toBe('0');
      expect(layerB.style.zIndex).toBe('1');
    });
  });

  describe('showMessage', () => {
    it('should create and show message overlay', () => {
      layerManager.showMessage('Test message');

      const overlay = container.querySelector('.layer-message-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.textContent).toBe('Test message');
    });

    it('should remove existing message before showing new one', () => {
      layerManager.showMessage('First');
      layerManager.showMessage('Second');

      const overlays = container.querySelectorAll('.layer-message-overlay');
      expect(overlays.length).toBe(1);
      expect(overlays[0].textContent).toBe('Second');
    });
  });
});