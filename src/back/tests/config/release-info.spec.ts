import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getReleaseInfo } from '../../config/release-info.js';

describe('getReleaseInfo', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'release-info-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads version from package.json and builtAt from BUILD_TIME', () => {
    expect(
      getReleaseInfo({
        cwd: dir,
        env: { BUILD_TIME: '2026-10-10T00:00:00Z' },
        builtAtFile: path.join(dir, 'missing'),
      }),
    ).toEqual({
      version: '1.2.3',
      builtAt: '2026-10-10T00:00:00Z',
    });
  });

  it('reads builtAt from file when BUILD_TIME is absent', () => {
    const builtAtFile = path.join(dir, 'BUILT_AT');
    writeFileSync(builtAtFile, '2026-10-09T23:01:00Z\n');

    expect(
      getReleaseInfo({
        cwd: dir,
        env: {},
        builtAtFile,
      }),
    ).toEqual({
      version: '1.2.3',
      builtAt: '2026-10-09T23:01:00Z',
    });
  });

  it('returns null builtAt when neither env nor file is set', () => {
    expect(
      getReleaseInfo({
        cwd: dir,
        env: {},
        builtAtFile: path.join(dir, 'missing'),
      }),
    ).toEqual({
      version: '1.2.3',
      builtAt: null,
    });
  });
});
