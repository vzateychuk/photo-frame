import { describe, it, expect, vi, afterEach } from 'vitest';
import { createKey, listKeys, deleteKey, buildKeySlideshowUrl } from '../../catalog/keys-api.js';

describe('keys-api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists keys with Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [{ key: 'AAAAAAAA', label: 't' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const keys = await listKeys('http://localhost:3000', 'a'.repeat(32));
    expect(keys).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/keys');
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${'a'.repeat(32)}`,
      }),
    );
  });

  it('creates a key via POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          key: 'BBBBBBBB',
          label: 'Mom',
          folders: 'all',
          url: 'https://example.com/?key=BBBBBBBB',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const created = await createKey('http://localhost:3000', 'a'.repeat(32), {
      label: 'Mom',
      folders: 'all',
      ttlHours: 24,
    });
    expect(created.key).toBe('BBBBBBBB');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
  });

  it('deletes a key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteKey('http://localhost:3000', 'a'.repeat(32), 'AAAAAAAA');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('DELETE');
    expect(String(url)).toContain('/api/keys/AAAAAAAA');
    // Fastify rejects empty body when Content-Type is application/json (HTTP 400).
    expect((init as RequestInit).headers).not.toEqual(
      expect.objectContaining({ 'Content-Type': 'application/json' }),
    );
  });

  it('encodes special characters in delete URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteKey('http://localhost:3000', 'a'.repeat(32), 'QSikl+#P');
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:3000/api/keys/QSikl%2B%23P');
  });

  it('builds slideshow url with key', () => {
    expect(buildKeySlideshowUrl('https://photos.example.com', 'K7MQ-2Xa')).toBe(
      'https://photos.example.com/?key=K7MQ-2Xa',
    );
  });
});
