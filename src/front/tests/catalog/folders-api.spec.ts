import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchFolders } from '../../catalog/folders-api.js';

describe('searchFolders', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the server for an empty query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      searchFolders('http://localhost:3000', '   ', { adminToken: 'a'.repeat(32) }),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests /api/catalog with q and Authorization', async () => {
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
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const folders = await searchFolders('http://localhost:3000/', 'day', {
      adminToken: 'a'.repeat(32),
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
    expect(String(requestUrl)).toBe('http://localhost:3000/api/catalog?q=day');
    expect(requestInit).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: `Bearer ${'a'.repeat(32)}`,
        }),
      }),
    );
    expect(folders).toEqual([
      {
        id: 'f1',
        name: 'day1',
        parentId: 'f0',
        pathLabel: 'vacation / day1',
        photoCount: 4,
      },
    ]);
  });
});
