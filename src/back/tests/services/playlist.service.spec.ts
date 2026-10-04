import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaylistService } from '../../services/playlist.service.js';

describe('PlaylistService', () => {
  let service: PlaylistService;
  const mockPhotos = [
    { id: '1', path: '/photos/1.jpg' },
    { id: '2', path: '/photos/2.jpg' },
    { id: '3', path: '/photos/3.jpg' },
  ];

  beforeEach(() => {
    service = new PlaylistService();
  });

  it('should return null if playlist is empty', () => {
    expect(service.getNext()).toBeNull();
  });

  it('should return every photo exactly once per cycle without repetitions', () => {
    service.loadPhotos(mockPhotos);
    
    const results = [];
    for (let i = 0; i < mockPhotos.length; i++) {
      results.push(service.getNext()?.id);
    }

    // Проверяем, что все ID уникальны (нет повторов внутри цикла)
    const uniqueIds = new Set(results);
    expect(uniqueIds.size).toBe(mockPhotos.length);
    
    // Проверяем, что все оригинальные ID присутствуют в выдаче
    const originalIds = mockPhotos.map(p => p.id);
    expect(results).toEqual(expect.arrayContaining(originalIds));
  });

  it('should reshuffle and repeat when the list is exhausted', () => {
    service.loadPhotos(mockPhotos);
    
    // Exhaust the first cycle
    for (let i = 0; i < 3; i++) service.getNext();
    
    // Get the first item of the second cycle
    const next = service.getNext();
    expect(next).toBeDefined();
    expect(next?.id).toBeDefined();
  });

  it('should not expose the real file path to the client', () => {
    service.loadPhotos(mockPhotos);
    const item = service.getNext();
    
    // The service should return an object that contains the ID but not the path
    // depending on how getNext is designed. 
    // Based on the task: "Клиент никогда не должен получать реальные пути к файлам"
    expect(item).not.toHaveProperty('path');
    expect(item).toHaveProperty('id');
  });
});
