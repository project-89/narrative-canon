import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { acquireProjectBoundaryLock } from '../../src/storage/project-archive-boundary';
import {
  inspectProjectWorldRecovery,
  recoverProjectWorldFromBackup,
} from '../../src/storage/project-world-recovery';

const PROJECT_ID = 'world_recovery_target';

function validWorld(marker: string) {
  return {
    entities: [{ id: `ent_${marker}`, name: marker, type: 'character' }],
    relationships: [],
    commits: [],
    branches: [],
    interactions: [],
  };
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

describe('project world recovery', () => {
  let dataDir: string;
  let primary: string;
  let backup: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-recovery-'));
    primary = path.join(dataDir, `project_${PROJECT_ID}.json`);
    backup = `${primary}.bak`;
    fs.writeFileSync(path.join(dataDir, 'projects.json'), JSON.stringify([{ id: PROJECT_ID, name: 'Target' }]));
    fs.writeFileSync(primary, JSON.stringify(validWorld('good'), null, 2));
    fs.copyFileSync(primary, backup);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function corruptPrimary(): void {
    const bytes = fs.readFileSync(primary);
    fs.writeFileSync(primary, bytes.subarray(0, Math.floor(bytes.length / 2)));
  }

  it('refuses outright while the primary is healthy', () => {
    const inspection = inspectProjectWorldRecovery(dataDir, PROJECT_ID);
    expect(inspection.recoverable).toBe(false);
    expect(inspection.blockers.join(' ')).toContain('healthy');
    expect(() => recoverProjectWorldFromBackup(dataDir, PROJECT_ID, {
      confirmProjectId: PROJECT_ID,
      backupSha256: sha256(backup),
      reason: 'test',
    })).toThrow(/healthy/);
  });

  it('promotes the exact inspected backup bytes over a corrupted primary and preserves the trail', () => {
    corruptPrimary();
    const corruptBytes = fs.readFileSync(primary);

    const inspection = inspectProjectWorldRecovery(dataDir, PROJECT_ID);
    expect(inspection.recoverable).toBe(true);
    expect(inspection.primary.valid).toBe(false);
    expect(inspection.backup.valid).toBe(true);
    expect(inspection.backup.sha256).toBe(sha256(backup));
    expect(inspection.backupCanonCoherent).toBe(true);

    const backupShaBefore = sha256(backup);
    const result = recoverProjectWorldFromBackup(dataDir, PROJECT_ID, {
      confirmProjectId: PROJECT_ID,
      backupSha256: inspection.backup.sha256!,
      reason: 'jest: promote backup over truncated primary',
    });

    // The primary is byte-identical to the inspected backup.
    expect(sha256(primary)).toBe(backupShaBefore);
    expect(JSON.parse(fs.readFileSync(primary, 'utf8')).entities[0].id).toBe('ent_good');
    // The good .bak was NEVER touched — promotion must not route through the
    // .bak-rotating writer, or the corrupt primary would have replaced it.
    expect(sha256(backup)).toBe(backupShaBefore);
    // Audit is durable and complete; the corrupt primary is preserved beside it.
    const audit = JSON.parse(fs.readFileSync(path.join(dataDir, result.auditFile), 'utf8'));
    expect(audit.state).toBe('complete');
    expect(audit.projectId).toBe(PROJECT_ID);
    expect(audit.backupSha256).toBe(backupShaBefore);
    const preserved = fs.readFileSync(path.join(dataDir, result.corruptPrimaryPreservedAt));
    expect(preserved.equals(corruptBytes)).toBe(true);
    // The recovery boundary was released.
    expect(fs.existsSync(path.join(dataDir, '.archive-boundary', 'locks', 'projects', `${PROJECT_ID}.lock`))).toBe(false);
  });

  it('refuses when the echoed evidence does not match the current backup', () => {
    corruptPrimary();
    expect(() => recoverProjectWorldFromBackup(dataDir, PROJECT_ID, {
      confirmProjectId: PROJECT_ID,
      backupSha256: 'a'.repeat(64),
      reason: 'test',
    })).toThrow(/Backup changed from/);
    // The corrupt primary is untouched by a refused recovery.
    expect(() => JSON.parse(fs.readFileSync(primary, 'utf8'))).toThrow();
  });

  it('refuses confirmation and reason omissions', () => {
    corruptPrimary();
    const sha = sha256(backup);
    expect(() => recoverProjectWorldFromBackup(dataDir, PROJECT_ID, {
      confirmProjectId: 'someone_else',
      backupSha256: sha,
      reason: 'test',
    })).toThrow(/confirmation must exactly equal/);
    expect(() => recoverProjectWorldFromBackup(dataDir, PROJECT_ID, {
      confirmProjectId: PROJECT_ID,
      backupSha256: sha,
      reason: '   ',
    })).toThrow(/operator reason/);
  });

  it('refuses while a live owner holds the project boundary', () => {
    corruptPrimary();
    const lock = acquireProjectBoundaryLock(dataDir, PROJECT_ID, 'publish');
    try {
      const inspection = inspectProjectWorldRecovery(dataDir, PROJECT_ID);
      expect(inspection.recoverable).toBe(false);
      expect(inspection.blockers.join(' ')).toContain('live publish owner');
      expect(() => recoverProjectWorldFromBackup(dataDir, PROJECT_ID, {
        confirmProjectId: PROJECT_ID,
        backupSha256: sha256(backup),
        reason: 'test',
      })).toThrow(/blocked/);
    } finally {
      lock.release();
    }
  });

  it('refuses when the backup itself is not a valid world', () => {
    corruptPrimary();
    fs.writeFileSync(backup, '{"entities": "not-an-array"}');
    const inspection = inspectProjectWorldRecovery(dataDir, PROJECT_ID);
    expect(inspection.recoverable).toBe(false);
    expect(inspection.blockers.join(' ')).toContain('backup is not a valid world');
  });

  it('routes a backup that references missing canon history to publication recovery', () => {
    // The backup acknowledges a canon revision but no nit ledger exists —
    // the torn-publication shape world recovery must NOT paper over.
    const world = validWorld('canonful');
    (world.commits as any[]).push({ id: 'c1', nitHash: 'b'.repeat(64), branch: 'main' });
    fs.writeFileSync(backup, JSON.stringify(world, null, 2));
    corruptPrimary();
    const inspection = inspectProjectWorldRecovery(dataDir, PROJECT_ID);
    expect(inspection.recoverable).toBe(false);
    expect(inspection.backupCanonCoherent).toBe(false);
    expect(inspection.blockers.join(' ')).toContain('publication recovery');
  });

  it('refuses a missing primary (that is archive recovery, not world recovery)', () => {
    fs.rmSync(primary);
    const inspection = inspectProjectWorldRecovery(dataDir, PROJECT_ID);
    expect(inspection.recoverable).toBe(false);
    expect(inspection.blockers.join(' ')).toContain('missing, not corrupted');
  });
});
