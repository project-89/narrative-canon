import path from 'path';
import {
  assertSafeFilename,
  assertSafeProjectId,
  isLoopbackHost,
  parseAllowedOrigins,
  resolveSafeChild,
} from '../../src/security/local-boundary';

describe('local API filesystem boundary', () => {
  test.each(['demo', 'project_1785564683279_721c481a', 'world-01', 'world.v2'])(
    'accepts opaque project id %s',
    projectId => expect(assertSafeProjectId(projectId)).toBe(projectId),
  );

  test.each(['../secret', '..%2Fsecret', '/tmp/secret', 'project id', '', '.'])('rejects project id %s', projectId => {
    expect(() => assertSafeProjectId(projectId)).toThrow('Invalid projectId');
  });

  test.each(['frame.png', 'shot-01.webp', 'export_final.mp4'])('accepts filename %s', filename => {
    expect(assertSafeFilename(filename)).toBe(filename);
  });

  test.each(['../secret.json', '..%2Fsecret.json', '%2Fetc%2Fpasswd', 'nested/file.png', 'nested\\file.png', '%00.png'])(
    'rejects traversal filename %s',
    filename => expect(() => assertSafeFilename(filename)).toThrow(),
  );

  it('resolves validated children beneath their root', () => {
    const root = path.resolve('/tmp/narrative-generated');
    expect(resolveSafeChild(root, 'frame.png')).toBe(path.join(root, 'frame.png'));
  });
});

describe('local API network boundary', () => {
  test.each(['localhost', '127.0.0.1', '::1', '[::1]'])('recognizes loopback host %s', host => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  test.each(['0.0.0.0', '192.168.1.50', 'studio.example'])('rejects non-loopback host %s', host => {
    expect(isLoopbackHost(host)).toBe(false);
  });

  it('uses local studio origins by default and parses an explicit allowlist', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:3089', 'http://127.0.0.1:3089']);
    expect(parseAllowedOrigins('https://studio.example, http://localhost:3089 ')).toEqual([
      'https://studio.example',
      'http://localhost:3089',
    ]);
  });
});
