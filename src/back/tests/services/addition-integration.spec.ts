import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaylistService } from '../../services/playlist.service.js';
import { PhotoScannerService } from '../../services/scanner.service.js';
import type { PhotoItem } from '../../types.js';
import fs from 'node:fs/promises';

// Mock для файловой системы, чтобы не создавать реальные файлы в тестах
vi.mock('node:fs/promises');

describe('Photo Addition Integration', () => {
  let playlistService: PlaylistService;
  let scannerService: PhotoScannerService;

  beforeEach(() => {
    vi.clearAllMocks();
    playlistService = new PlaylistService();
    // Мы передадим playlistService в scannerService в реализации
    scannerService = new PhotoScannerService('/mock/dir');
  });

  it('should add a new photo to playlist without clearing other photos', () => {
    const photo1: PhotoItem = { id: '1', path: '/photos/1.jpg' };
    const photo2: PhotoItem = { id: '2', path: '/photos/2.jpg' };
    
    playlistService.loadPhotos([photo1]);
    
    // Метод addPhoto еще не реализован
    // @ts-ignore
    playlistService.addPhoto(photo2);

    expect(playlistService.getById('1')).toBeDefined();
    expect(playlistService.getById('2')).toBeDefined();
  });

  it('should automatically discover and add new photos during auto-scan', async () => {
    const initialPhotos: PhotoItem[] = [
      { id: '1', path: '/mock/dir/1.jpg' }
    ];
    playlistService.loadPhotos(initialPhotos);

    // Эмулируем состояние диска: сначала одно фото, потом два
    const mockFiles = [
      { name: '1.jpg', isFile: () => true, isDirectory: () => false, parentPath: '/mock/dir' },
      { name: '2.jpg', isFile: () => true, isDirectory: () => false, parentPath: '/mock/dir' },
    ];

    (fs.readdir as any).mockResolvedValue(mockFiles);

    // Метод startAutoScan еще не реализован
    // @ts-ignore
    await scannerService.syncWithPlaylist(playlistService);

    expect(playlistService.getById('1')).toBeDefined();
    expect(playlistService.getById('2')).toBeDefined();
  });
});
