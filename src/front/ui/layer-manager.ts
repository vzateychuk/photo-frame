export class LayerManager {
  private readonly layerA: HTMLImageElement;
  private readonly layerB: HTMLImageElement;
  private activeLayer: HTMLImageElement;
  private inactiveLayer: HTMLImageElement;
  private readonly container: HTMLElement;

  constructor(layerA: HTMLImageElement, layerB: HTMLImageElement) {
    this.layerA = layerA;
    this.layerB = layerB;
    this.activeLayer = layerA;
    this.inactiveLayer = layerB;
    this.container = layerA.parentElement!;

    // Начальные стили для кроссфейда
    this.setupLayerStyles();
  }

  private setupLayerStyles(): void {
    [this.layerA, this.layerB].forEach((layer) => {
      layer.style.objectFit = 'contain';
      layer.style.objectPosition = 'center';
      layer.style.backgroundColor = '#000';
      layer.style.transition = 'opacity 1s ease-in-out';
      layer.style.opacity = '0';
      layer.style.zIndex = '0';
    });

    // Первый слой активен
    this.activeLayer.style.opacity = '1';
    this.activeLayer.style.zIndex = '1';
  }

  /**
   * Загружает изображение в неактивный слой.
   * Возвращает промис, который разрешается при успешной загрузке
   * или отклоняется при ошибке.
   */
  async preloadImage(url: URL): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.inactiveLayer.onload = null;
        this.inactiveLayer.onerror = null;
      };

      this.inactiveLayer.onload = () => {
        cleanup();
        resolve();
      };

      this.inactiveLayer.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load image: ${url.toString()}`));
      };

      this.inactiveLayer.src = url.toString();
    });
  }

  /**
   * Плавно меняет активный и неактивный слои (кроссфейд).
   */
  swapLayers(): void {
    // Меняем z-index и opacity
    this.activeLayer.style.opacity = '0';
    this.activeLayer.style.zIndex = '0';

    this.inactiveLayer.style.opacity = '1';
    this.inactiveLayer.style.zIndex = '1';

    // Меняем ссылки
    [this.activeLayer, this.inactiveLayer] = [this.inactiveLayer, this.activeLayer];
  }

  /**
   * Показывает сообщение поверх слоев.
   */
  showMessage(text: string): void {
    // Удаляем старые сообщения
    const existing = this.container.querySelector('.layer-message-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'layer-message-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #fff;
      font-family: system-ui, sans-serif;
      font-size: 1.5rem;
      text-align: center;
      padding: 1rem 2rem;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 8px;
      z-index: 10;
      pointer-events: none;
      white-space: pre-wrap;
    `;
    overlay.textContent = text;

    this.container.appendChild(overlay);
  }

  /**
   * Скрывает сообщение.
   */
  hideMessage(): void {
    const existing = this.container.querySelector('.layer-message-overlay');
    if (existing) {
      existing.remove();
    }
  }

  /**
   * Возвращает текущий активный слой (для тестов/отладки).
   */
  getActiveLayer(): HTMLImageElement {
    return this.activeLayer;
  }
}