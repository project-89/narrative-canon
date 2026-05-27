/**
 * Sanity check: run the v1 migrator against every project file in
 * .narrative-data/ and report which validate cleanly.
 *
 * Run: npx tsx scripts/validate-format-against-live.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  migrateStudioProjectToV1,
  validateNarrative,
  formatIssues,
} from '../src/git/format';

const DATA_DIR = path.join(process.cwd(), '.narrative-data');
const PROJECTS_INDEX = path.join(DATA_DIR, 'projects.json');

function loadProjectsIndex(): any[] {
  if (!fs.existsSync(PROJECTS_INDEX)) return [];
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_INDEX, 'utf-8'));
  } catch {
    return [];
  }
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`No .narrative-data directory at ${DATA_DIR}`);
    process.exit(1);
  }

  const projects = loadProjectsIndex();
  const projectMetaById = new Map(projects.map((p: any) => [p.id, p]));

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith('project_') && f.endsWith('.json'));

  if (files.length === 0) {
    console.log('No project files found.');
    return;
  }

  let okCount = 0;
  let failCount = 0;
  const failures: Array<{ file: string; issues: string[] }> = [];

  for (const file of files) {
    const fullPath = path.join(DATA_DIR, file);
    let raw: any;
    try {
      raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    } catch (err: any) {
      console.log(`✗ ${file} — failed to parse: ${err.message}`);
      failCount++;
      continue;
    }

    // Derive projectId from filename
    const projectIdMatch = file.match(/^project_(.+)\.json$/);
    const projectId = projectIdMatch ? projectIdMatch[1] : 'unknown';
    const projectMeta = projectMetaById.get(projectId);

    let migrated;
    try {
      migrated = migrateStudioProjectToV1(raw, { projectMeta });
    } catch (err: any) {
      console.log(`✗ ${file} — migration threw: ${err.message}`);
      failCount++;
      continue;
    }

    const result = validateNarrative(migrated);
    if (result.ok) {
      const m = result.value;
      console.log(
        `✓ ${file.padEnd(50)} ` +
          `entities=${m.entities.length} ` +
          `relationships=${m.relationships.length} ` +
          `scenes=${m.scenes.length} ` +
          `frames=${m.scenes.reduce((acc, s) => acc + (s.frames?.length || 0), 0)} ` +
          `assets=${countAssets(m)} ` +
          `scratchpad=${m.scratchpad?.documents.length || 0}`
      );
      okCount++;
    } else {
      const lines = formatIssues(result.errors);
      console.log(`✗ ${file} — ${result.errors.length} issue(s):`);
      for (const line of lines.slice(0, 5)) console.log(`    ${line}`);
      if (lines.length > 5) console.log(`    ... and ${lines.length - 5} more`);
      failures.push({ file, issues: lines });
      failCount++;
    }
  }

  console.log(`\nSummary: ${okCount} ok, ${failCount} failed`);
  if (failures.length > 0) process.exit(2);
}

function countAssets(n: any): number {
  let total = 0;
  for (const e of n.entities) total += (e.references?.length || 0) + (e.variations?.length || 0);
  for (const s of n.scenes) {
    total += s.references?.length || 0;
    for (const f of s.frames || []) total += f.references?.length || 0;
  }
  return total;
}

main();
