import path from 'path';
import { resolveNarrativeDataDir } from '../../src/config/runtime-paths';

describe('runtime paths', () => {
  it('defaults all durable studio data beneath cwd', () => {
    expect(resolveNarrativeDataDir(undefined, '/tmp/narrative-studio')).toBe(
      path.resolve('/tmp/narrative-studio/.narrative-data'),
    );
  });

  it('honors an explicit absolute DATA_DIR', () => {
    expect(resolveNarrativeDataDir('/var/tmp/narrative-data', '/ignored')).toBe(
      path.resolve('/var/tmp/narrative-data'),
    );
  });

  it('resolves a relative DATA_DIR from the process cwd', () => {
    expect(resolveNarrativeDataDir('var/studio-data', '/tmp/narrative-studio')).toBe(
      path.resolve('/tmp/narrative-studio/var/studio-data'),
    );
  });
});
