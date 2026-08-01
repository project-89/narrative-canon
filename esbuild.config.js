import * as esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';

// The studio bundles exactly ONE thing: the API server.
//
// Removed here: the `library-esm` / `library-cjs` / `cli` bundles (entry
// src/index.ts + src/cli.ts) — @narrative/canon was never published to npm, so
// nothing consumed them; and the two `timeline-warfare*` bundles, which now
// live with the prototype (prototypes/timeline-warfare/esbuild.config.js,
// `npm run game`).
const configs = [
  // API Server
  {
    _name: 'api-server',
    entryPoints: ['src/api/server.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/api-server.cjs',
    plugins: [nodeExternalsPlugin()],
  },

  // Browser bundle (for potential web usage) - DISABLED due to Node.js dependencies
  // {
  //   _name: 'browser',
  //   entryPoints: ['src/index.ts'],
  //   bundle: true,
  //   format: 'esm',
  //   platform: 'browser',
  //   target: 'es2020',
  //   outfile: 'dist/narrative-canon.browser.js',
  //   external: ['fs', 'path', 'readline', 'stream', 'util', '@google/generative-ai', 'express', 'mongoose'],
  //   define: {
  //     'process.env.NODE_ENV': '"production"'
  //   },
  // }
];

function toEsbuildConfig(config) {
  const { _name, ...buildConfig } = config;
  return buildConfig;
}

// Build function
async function build() {
  console.log('🔨 Building Narrative Canon bundles...\n');
  
  for (const config of configs) {
    const name = config._name;
    console.log(`📦 Building ${name}...`);
    try {
      await esbuild.build(toEsbuildConfig(config));
      console.log(`✅ ${name} built successfully: ${config.outfile}\n`);
    } catch (error) {
      console.error(`❌ Error building ${name}:`, error);
      process.exit(1);
    }
  }
  
  console.log('🎉 All builds completed successfully!');
}

// Watch mode
async function watch() {
  console.log('👀 Starting watch mode...\n');
  
  const contexts = await Promise.all(
    configs.map(config => esbuild.context(toEsbuildConfig(config)))
  );
  
  await Promise.all(contexts.map(ctx => ctx.watch()));
  
  console.log('📡 Watching for changes...');
}

// Main
const mode = process.argv[2];
if (mode === 'watch') {
  watch();
} else {
  build();
}
