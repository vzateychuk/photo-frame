/**
 * CSV folder ids from ?folders=id1,id2 (trim, drop empties).
 */
export function parseFolderIds(raw: string | null): string[] {
  if (raw === null || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
