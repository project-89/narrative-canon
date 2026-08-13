import path from 'path';

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Project IDs become filenames in the file-backed studio. Keep that boundary
 * deliberately narrow: IDs are opaque tokens, never paths.
 */
export function assertSafeProjectId(value: unknown): string {
  if (typeof value !== 'string' || !PROJECT_ID_PATTERN.test(value)) {
    throw new Error('Invalid projectId');
  }
  return value;
}

/**
 * Decode a route parameter once and require it to remain a single filename.
 * Express may hand us an encoded slash inside a parameter, so basename() alone
 * is not a sufficient signal: silently rewriting an unsafe name is dangerous.
 */
export function assertSafeFilename(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw new Error('Invalid filename');
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error('Invalid filename encoding');
  }

  if (
    decoded.length === 0 ||
    decoded === '.' ||
    decoded === '..' ||
    decoded.includes('\0') ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    path.basename(decoded) !== decoded
  ) {
    throw new Error('Invalid filename');
  }

  return decoded;
}

/** Resolve a validated filename beneath a known root and verify containment. */
export function resolveSafeChild(root: string, filename: unknown): string {
  const safeName = assertSafeFilename(filename);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, safeName);
  if (path.dirname(resolved) !== resolvedRoot) {
    throw new Error('Resolved path escaped its storage root');
  }
  return resolved;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value?.trim()) {
    return ['http://localhost:3089', 'http://127.0.0.1:3089'];
  }
  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}
