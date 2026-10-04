export interface PhotoItem {
  id: string;
  path: string;
}

export interface PublicPhoto {
  id: string;
}

export class PlaylistService {
  private photos: PhotoItem[] = [];
  private playlist: PhotoItem[] = [];
  private currentIndex = 0;

  /**
   * Загружает список фотографий в память и инициализирует первый плейлист
   */
  loadPhotos(photos: PhotoItem[]): void {
    this.photos = [...photos];
    this.shuffleAndReset();
  }

  /**
   * Возвращает следующее фото из плейлиста.
   * Если список исчерпан, перемешивает его заново и начинает с начала.
   */
  getNext(): PublicPhoto | null {
    if (this.photos.length === 0) {
      return null;
    }

    if (this.currentIndex >= this.playlist.length) {
      this.shuffleAndReset();
    }

    const photo = this.playlist[this.currentIndex];
    this.currentIndex++;

    // Возвращаем только публичные данные (без пути к файлу)
    return { id: photo!.id };
  }

  /**
   * Возвращает полную информацию о фото по ID (включая путь к файлу).
   * Используется для получения файла для обработки.
   */
  getById(id: string): PhotoItem | null {
    return this.photos.find(p => p.id === id) ?? null;
  }

  private shuffleAndReset(): void {
    // Копируем массив для перемешивания, чтобы не менять исходный список всех фото
    this.playlist = [...this.photos];
    
    // Алгоритм Фишера-Йейтса для честного перемешивания
    for (let i = this.playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.playlist[i];
      this.playlist[i] = this.playlist[j]!;
      this.playlist[j] = temp!;
    }
    
    this.currentIndex = 0;
  }
}
