/**
 * Build for the Timeline Warfare prototype.
 *
 * Split out of the studio's root esbuild.config.js so the studio bundles exactly
 * one thing (the API server) and this prototype owns its own build. Run from the
 * repo root via `npm run game:build`.
 *
 * ESM, because the root package.json sets "type": "module".
 */

import * as esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import { fileURLToPath } from 'url';
import * as path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const at = (p) => path.join(here, p);

const shared = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  plugins: [nodeExternalsPlugin({ packagePath: path.join(here, '../../package.json') })],
  banner: { js: '#!/usr/bin/env node' },
};

const configs = [
  { _name: 'timeline-warfare', entryPoints: [at('src/games/timeline-warfare.ts')], outfile: at('dist/timeline-warfare.cjs'), ...shared },
  { _name: 'timeline-warfare-git', entryPoints: [at('src/games/timeline-warfare-git.ts')], outfile: at('dist/timeline-warfare-git.cjs'), ...shared },
];

console.log('🔨 Building Timeline Warfare (prototype)...');
for (const { _name, ...cfg } of configs) {
  try {
    await esbuild.build(cfg);
    console.log(`✓ ${_name}`);
  } catch (err) {
    console.error(`❌ ${_name}:`, err.message);
    process.exitCode = 1;
  }
}
