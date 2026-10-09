import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildFolderSlideshowUrl,
  resolveSlideshowBaseUrl,
  searchFolders,
} from '../../catalog/folders-api.js';

describe('buildFolderSlideshowUrl', () => {
  it('builds a slideshow URL with one folder id', () => {
    expect(buildFolderSlideshowUrl('https://photos.example.com', ['folder-abc'])).toBe(
      'https://photos.example.com/?folders=folder-abc',
    );
  });

  it('joins several folder ids with commas', () => {
    expect(
      buildFolderSlideshowUrl('https://photos.example.com/', ['id-1', 'id-2']),
    ).toBe('https://photos.example.com/?folders=id-1%2Cid-2');
  });

  it('rejects an empty folder id list', () => {
    expect(() => buildFolderSlideshowUrl('https://photos.example.com', [])).toThrow();
  });
});

describe('resolveSlideshowBaseUrl', () => {
  it('prefers origin from a server slideshowUrl', () => {
    expect(
      resolveSlideshowBaseUrl('http://localhost:5173', [
        {
          id: 'f1',
          name: 'day1',
          parentId: null,
          pathLabel: 'day1',
          photoCount: 1,
          slideshowUrl: 'https://photos.example.com/?folders=f1',
        },
      ]),
    ).toBe('https://photos.example.com');
  });

  it('falls back to the page origin', () => {
    expect(resolveSlideshowBaseUrl('http://localhost:5173/', [])).toBe(
      'http://localhost:5173',
    );
  });
});

describe('searchFolders', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the server for an empty query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchFolders('http://localhost:3000', '   ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests catalog folders with q and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        folders: [
          {
            id: 'f1',
            name: 'day1',
            parentId: 'f0',
            pathLabel: 'vacation / day1',
            photoCount: 4,
            slideshowUrl: 'https://photos.example.com/?folders=f1',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const folders = await searchFolders('http://localhost:3000/', 'day');

    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
    expect(String(requestUrl)).toBe('http://localhost:3000/api/catalog/folders?q=day');
    expect(requestInit).toEqual(
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      }),
    );
    expect(folders).toEqual([
      {
        id: 'f1',
        name: 'day1',
        parentId: 'f0',
        pathLabel: 'vacation / day1',
        photoCount: 4,
        slideshowUrl: 'https://photos.example.com/?folders=f1',
      },
    ]);
  });
});
