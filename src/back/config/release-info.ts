import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ReleaseInfo {
  /** Версия из package.json */
  readonly version: string;
  /** Время сборки образа (UTC, ISO 8601), если известно */
  readonly builtAt: string | null;
}

/**
 * Сведения о сборке для /health.
 * builtAt: переменная BUILD_TIME или файл /app/BUILT_AT (пишет Dockerfile).
 */
export function getReleaseInfo(
  options: {
    cwd?: string;
    builtAtFile?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): ReleaseInfo {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const builtAtFile = options.builtAtFile ?? '/app/BUILT_AT';

  let version = '0.0.0';
  try {
    const raw = readFileSync(path.join(cwd, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version !== '') {
      version = parsed.version;
    }
  } catch {
    // оставляем 0.0.0
  }

  const fromEnv = env.BUILD_TIME?.trim();
  if (fromEnv) {
    return { version, builtAt: fromEnv };
  }

  try {
    const fromFile = readFileSync(builtAtFile, 'utf8').trim();
    return { version, builtAt: fromFile === '' ? null : fromFile };
  } catch {
    return { version, builtAt: null };
  }
}
