import { describe, it, expect } from 'vitest';
import { buildFolderSlideshowUrl } from '../../utils/slideshow-url.js';

describe('buildFolderSlideshowUrl', () => {
  it('builds a slideshow URL with folders query', () => {
    expect(buildFolderSlideshowUrl('https://photos.example.com', 'folder-abc')).toBe(
      'https://photos.example.com/?folders=folder-abc',
    );
  });

  it('strips a trailing slash from the base URL', () => {
    expect(buildFolderSlideshowUrl('https://photos.example.com/', 'id-1')).toBe(
      'https://photos.example.com/?folders=id-1',
    );
  });

  it('joins several folder ids with commas', () => {
    expect(
      buildFolderSlideshowUrl('https://photos.example.com', ['a', 'b']),
    ).toBe('https://photos.example.com/?folders=a%2Cb');
  });
});
