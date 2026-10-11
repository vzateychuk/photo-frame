import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { AccessKey, KeyStore } from '../types.js';

interface KeyStoreFile {
  version: 1;
  keys: AccessKey[];
}

/**
 * JSON-file KeyStore. Loads once into memory; persists on add/remove
 * via a temp file + rename in the same directory.
 */
export class JsonKeyStore implements KeyStore {
  private readonly keys = new Map<string, AccessKey>();

  private constructor(private readonly filePath: string) {}

  static load(filePath: string): JsonKeyStore {
    const store = new JsonKeyStore(filePath);
    store.loadFromDisk();
    return store;
  }

  list(): AccessKey[] {
    return [...this.keys.values()];
  }

  get(key: string): AccessKey | null {
    return this.keys.get(key) ?? null;
  }

  add(record: AccessKey): void {
    this.keys.set(record.key, record);
    this.persist();
  }

  remove(key: string): boolean {
    const existed = this.keys.delete(key);
    if (existed) {
      this.persist();
    }
    return existed;
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const raw = readFileSync(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as KeyStoreFile;
    for (const record of parsed.keys ?? []) {
      this.keys.set(record.key, record);
    }
  }

  private persist(): void {
    const dir = path.dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    const payload: KeyStoreFile = {
      version: 1,
      keys: this.list(),
    };
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
    renameSync(tempPath, this.filePath);
  }
}
