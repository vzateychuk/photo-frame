import { describe, it, expect } from 'vitest';
import { parseFolderIds } from '../../config/folders.js';

describe('parseFolderIds', () => {
  it('returns empty list when param is missing or blank', () => {
    expect(parseFolderIds(null)).toEqual([]);
    expect(parseFolderIds('')).toEqual([]);
    expect(parseFolderIds('   ')).toEqual([]);
  });

  it('parses a single id', () => {
    expect(parseFolderIds('folder-a')).toEqual(['folder-a']);
  });

  it('parses comma-separated ids and trims spaces', () => {
    expect(parseFolderIds('a, b,c ')).toEqual(['a', 'b', 'c']);
  });

  it('drops empty segments', () => {
    expect(parseFolderIds('a,,b,')).toEqual(['a', 'b']);
  });
});
