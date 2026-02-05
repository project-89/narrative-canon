import * as esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';

// Build configurations with names for logging
const configs = [
  // Library bundle (ESM)
  {
    _name: 'library-esm',
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/narrative-canon.esm.js',
    plugins: [nodeExternalsPlugin()],
    sourcemap: true,
  },
  
  // Library bundle (CJS)
  {
    _name: 'library-cjs',
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/narrative-canon.cjs.js',
    plugins: [nodeExternalsPlugin()],
    sourcemap: true,
  },
  
  // CLI tool
  {
    _name: 'cli',
    entryPoints: ['src/cli.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/narrative-canon-cli.js',
    plugins: [nodeExternalsPlugin()],
    banner: {
      js: '#!/usr/bin/env node'
    },
  },
  
  // Timeline Warfare Game (standalone bundle) - Original
  {
    _name: 'timeline-warfare',
    entryPoints: ['src/games/timeline-warfare.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/timeline-warfare.cjs',
    plugins: [nodeExternalsPlugin()],
    banner: {
      js: '#!/usr/bin/env node'
    },
  },

  // Timeline Warfare Git Edition - Uses NarrativeGit for state
  {
    _name: 'timeline-warfare-git',
    entryPoints: ['src/games/timeline-warfare-git.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/timeline-warfare-git.cjs',
    plugins: [nodeExternalsPlugin()],
    banner: {
      js: '#!/usr/bin/env node'
    },
  },

  // API Server
  {
    _name: 'api-server',
    entryPoints: ['src/api/server.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
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

// Build function
async function build() {
  console.log('🔨 Building Narrative Canon bundles...\n');
  
  for (const config of configs) {
    const name = config._name;
    console.log(`📦 Building ${name}...`);
    try {
      // Create clean config without _name
      const buildConfig = { ...config };
      delete buildConfig._name;
      
      await esbuild.build(buildConfig);
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
    configs.map(config => esbuild.context(config))
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