import { describe, it, expect, beforeEach } from 'vitest';
import { PlaylistService, isPathInside } from '../../services/playlist.service.js';
import type { FolderItem, PhotoItem } from '../../types.js';

describe('PlaylistService', () => {
  let service: PlaylistService;
  const mockPhotos: PhotoItem[] = [
    { id: '1', path: '/photos/1.jpg' },
    { id: '2', path: '/photos/2.jpg' },
    { id: '3', path: '/photos/3.jpg' },
  ];

  beforeEach(() => {
    service = new PlaylistService();
  });

  it('should return null if playlist is empty', () => {
    expect(service.getNext()).toEqual({ photo: null, unknownFolderIds: [] });
  });

  it('should return every photo exactly once per cycle without repetitions', () => {
    service.loadPhotos(mockPhotos);

    const results = [];
    for (let i = 0; i < mockPhotos.length; i++) {
      results.push(service.getNext().photo?.id);
    }

    const uniqueIds = new Set(results);
    expect(uniqueIds.size).toBe(mockPhotos.length);

    const originalIds = mockPhotos.map((p) => p.id);
    expect(results).toEqual(expect.arrayContaining(originalIds));
  });

  it('should reshuffle and repeat when the list is exhausted', () => {
    service.loadPhotos(mockPhotos);

    for (let i = 0; i < 3; i++) service.getNext();

    const next = service.getNext();
    expect(next.photo).toBeDefined();
    expect(next.photo?.id).toBeDefined();
  });

  it('should not expose the real file path to the client', () => {
    service.loadPhotos(mockPhotos);
    const item = service.getNext().photo;

    expect(item).not.toHaveProperty('path');
    expect(item).toHaveProperty('id');
  });

  describe('folder filter', () => {
    const vacation: FolderItem = {
      id: 'folder-vacation',
      path: '/photos/vacation',
      name: 'vacation',
      parentId: null,
    };
    const day1: FolderItem = {
      id: 'folder-day1',
      path: '/photos/vacation/day1',
      name: 'day1',
      parentId: 'folder-vacation',
    };
    const work: FolderItem = {
      id: 'folder-work',
      path: '/photos/work',
      name: 'work',
      parentId: null,
    };
    const scopedPhotos: PhotoItem[] = [
      { id: 'root', path: '/photos/root.jpg' },
      { id: 'v1', path: '/photos/vacation/a.jpg' },
      { id: 'd1', path: '/photos/vacation/day1/b.jpg' },
      { id: 'w1', path: '/photos/work/c.jpg' },
    ];

    beforeEach(() => {
      service.load(scopedPhotos, [vacation, day1, work]);
    });

    it('should include nested photos for a parent folder', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 2; i++) {
        ids.add(service.getNext(['folder-vacation']).photo!.id);
      }
      expect(ids).toEqual(new Set(['v1', 'd1']));
    });

    it('should exclude sibling folders', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1; i++) {
        ids.add(service.getNext(['folder-work']).photo!.id);
      }
      expect(ids).toEqual(new Set(['w1']));
    });

    it('should union multiple folders without duplicates', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 3; i++) {
        ids.add(service.getNext(['folder-vacation', 'folder-day1']).photo!.id);
      }
      expect(ids).toEqual(new Set(['v1', 'd1']));
    });

    it('should skip unknown folder ids and play from known ones', () => {
      const first = service.getNext(['folder-vacation', 'missing']);
      expect(first.unknownFolderIds).toEqual(['missing']);
      expect(['v1', 'd1']).toContain(first.photo!.id);

      const second = service.getNext(['folder-vacation', 'missing']);
      expect(second.unknownFolderIds).toEqual([]);
      expect(['v1', 'd1']).toContain(second.photo!.id);
    });

    it('should return no photos when all folder ids are unknown', () => {
      expect(service.getNext(['missing-a', 'missing-b'])).toEqual({
        photo: null,
        unknownFolderIds: ['missing-a', 'missing-b'],
      });
    });

    it('should list folders with recursive photo counts, path labels, and without disk paths', () => {
      const folders = service.listFolders();
      expect(folders).toEqual(
        expect.arrayContaining([
          {
            id: 'folder-vacation',
            name: 'vacation',
            parentId: null,
            pathLabel: 'vacation',
            photoCount: 2,
          },
          {
            id: 'folder-day1',
            name: 'day1',
            parentId: 'folder-vacation',
            pathLabel: 'vacation / day1',
            photoCount: 1,
          },
          {
            id: 'folder-work',
            name: 'work',
            parentId: null,
            pathLabel: 'work',
            photoCount: 1,
          },
        ]),
      );
      folders.forEach((folder) => {
        expect(folder).not.toHaveProperty('path');
      });
    });

    it('should filter folders by name substring without regard to case', () => {
      expect(service.listFolders({ query: 'DAY' })).toEqual([
        {
          id: 'folder-day1',
          name: 'day1',
          parentId: 'folder-vacation',
          pathLabel: 'vacation / day1',
          photoCount: 1,
        },
      ]);
    });

    it('should return an empty list when no folder name matches the query', () => {
      expect(service.listFolders({ query: 'missing' })).toEqual([]);
    });
  });
});

describe('isPathInside', () => {
  it('detects nested files and rejects siblings', () => {
    expect(isPathInside('/photos/vacation', '/photos/vacation/a.jpg')).toBe(true);
    expect(isPathInside('/photos/vacation', '/photos/vacation/day1/b.jpg')).toBe(true);
    expect(isPathInside('/photos/vacation', '/photos/work/c.jpg')).toBe(false);
    expect(isPathInside('/photos/vacation', '/photos/vacation')).toBe(false);
  });
});
