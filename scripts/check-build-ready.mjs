import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredArtifacts = [
  path.join(repoRoot, 'dist', 'api-server.cjs'),
  path.join(repoRoot, 'ui', '.next', 'BUILD_ID'),
];
const missing = requiredArtifacts.filter(artifact => !fs.existsSync(artifact));

if (missing.length > 0) {
  console.error('Production artifacts are missing. Run `npm run build` before `npm start`.');
  for (const artifact of missing) console.error(`- ${path.relative(repoRoot, artifact)}`);
  process.exit(1);
}

console.log('API and UI production artifacts are ready.');
