import path from 'path';

/**
 * One canonical root for every durable studio artifact. Callers may provide an
 * explicit value for tests; production defaults to DATA_DIR, then cwd-local
 * .narrative-data.
 */
export function resolveNarrativeDataDir(
  configured = process.env.DATA_DIR,
  cwd = process.cwd(),
): string {
  const candidate = configured?.trim();
  if (!candidate) return path.resolve(cwd, '.narrative-data');
  return path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(cwd, candidate);
}

export const NARRATIVE_DATA_DIR = resolveNarrativeDataDir();
