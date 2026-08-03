# Storage recovery — inspect first, preserve evidence

The Studio is a local single-user service, but more than one checkout may point
at the same `DATA_DIR`. Project worlds, the catalog, and the canon sidecar are
therefore coordinated with filesystem ownership, journals, and compare-and-save
checks. A crash should leave evidence to recover from, not permission to guess.

> **The coordination is cooperative.** Locks, tombstones, and journals only
> bind processes that check them — every checkout sharing a `DATA_DIR` must be
> at or after the storage-boundary commits. A checkout running pre-boundary
> code is an unguarded writer that no lock constrains: **stop it before**
> pointing a new-code process at the same data root. Its only cross-version
> protection is one-directional compare-and-save (the new side refuses to
> clobber the old side's write; the old side will clobber the new side's).

## Rules of the warren

1. Confirm the exact `DATA_DIR` and project ID. Never aim a recovery command at
   a broad directory or infer the target from whichever project is active.
2. Pause ordinary writes to that data root during an actual recovery. Do not
   manually delete `.archive-boundary`, a lock owner, or an archive tombstone.
3. Run the matching `inspect` command first. Inspection is read-only and prints
   the operation IDs, hashes, timestamps, and file dispositions the mutating
   command requires.
4. Copy those exact values into the recovery command and give a durable reason.
   If any evidence changes between inspect and recover, the operation refuses.
5. Keep the archive and recovery audit. Successful recovery restores service;
   it does not erase the forensic trail.

## Route the incident

| Symptom | Use |
|---|---|
| A project is archived, partially archived, or blocked by an archive tombstone | `npm run archive:recovery -- inspect <projectId>` |
| Project artifacts exist but creation died before the catalog row was published | `npm run creation:recovery -- inspect <projectId>` |
| A canon commit died between publishing the nit ledger and the world blob | `npm run publication:recovery -- inspect <projectId>` |
| A stale project/catalog publisher remains and no creation/publication journal exists | `npm run lock:recovery -- inspect-project <projectId>` or `inspect-catalog` |
| A project world file is PRESENT but unreadable/invalid, no journal or lock applies, and its `.bak` is the good copy | `npm run world:recovery -- inspect <projectId>` |
| `projects.json` is missing while world/archive evidence remains | Stop. The API now refuses startup. Preserve the entire data root and its `projects.json.bak`; this is explicit catalog recovery, never a virgin-store bootstrap. |

## Guarded workflows

### Recover an archive

```bash
npm run archive:recovery -- inspect PROJECT_ID --data-dir /exact/data/root

npm run archive:recovery -- restore PROJECT_ID \
  --confirm-project PROJECT_ID \
  --tombstone-operation TOMBSTONE_OPERATION_ID \
  --reason "reviewed world, canon, catalog, and archive evidence" \
  --data-dir /exact/data/root
```

Add the exact project/catalog lock operation IDs printed by `inspect` when
stale owners are present. A corrupt tombstone has a separate `quarantine`
workflow requiring its exact SHA-256. Restore validates the archived world,
world backup, nit ledger, and nit backup as one declared four-file journal. It
also proves that the selected world and canon ledger agree before publication.

### Finish an interrupted creation

```bash
npm run creation:recovery -- inspect PROJECT_ID --data-dir /exact/data/root

npm run creation:recovery -- recover PROJECT_ID \
  --confirm-project PROJECT_ID \
  --journal-operation CREATION_OPERATION_ID \
  --project-lock-operation STALE_CREATOR_OPERATION_ID \
  --reason "verified the complete journalled project artifacts" \
  --data-dir /exact/data/root
```

This publishes exactly one catalog row only after the world and optional canon
sidecar pass semantic and cross-file checks. The stale creator operation is
required when `inspect` reports the normal abandoned creator lock; omit that
flag only when inspection proves no owner remains. Recovery never invents an
empty world.

### Settle an interrupted canon/world publication

```bash
npm run publication:recovery -- inspect PROJECT_ID --data-dir /exact/data/root

npm run publication:recovery -- recover PROJECT_ID \
  --confirm-project PROJECT_ID \
  --journal-operation PUBLICATION_OPERATION_ID \
  --project-lock-operation STALE_LOCK_OPERATION_ID \
  --reason "verified the abandoned paired publication" \
  --data-dir /exact/data/root
```

If both files reached disk, recovery completes the pair. If only the ledger
advanced, it restores the exact journalled prior ledger bytes. Canon validation
checks schema, content hashes, parent order, reachability, operation replay,
branch snapshots, and agreement with the latest world acknowledgement.

### Clear an ordinary stale publisher

```bash
npm run lock:recovery -- inspect-project PROJECT_ID --data-dir /exact/data/root

npm run lock:recovery -- recover-project PROJECT_ID \
  --confirm-project PROJECT_ID \
  --operation STALE_LOCK_OPERATION_ID \
  --reason "verified no creation or canon publication journal exists" \
  --data-dir /exact/data/root
```

Use `inspect-catalog` / `recover-catalog` for the catalog lock. Plain unlock is
refused when a creation or publication journal exists; route those incidents to
their transaction-specific tools. Fresh owners are never stolen.

### Promote a world backup over a corrupted primary

```bash
npm run world:recovery -- inspect PROJECT_ID --data-dir /exact/data/root

npm run world:recovery -- recover PROJECT_ID \
  --confirm-project PROJECT_ID \
  --backup-sha256 SHA_PRINTED_BY_INSPECT \
  --reason "primary truncated by disk incident; backup validated" \
  --data-dir /exact/data/root
```

For the incident the other tools don't route: `project_<id>.json` is present
but unreadable or structurally invalid, no journal or lock applies, and the
atomic writer's `.bak` beside it is the good copy. Inspect validates both
files, proves the backup against the canon ledger, and prints the backup's
SHA-256; recover acquires the project boundary, re-proves everything, refuses
if either file moved since inspect, preserves the corrupt primary beside the
audit, and promotes the backup's exact bytes. The `.bak` is never modified. A
healthy primary refuses outright; a backup that disagrees with the canon
ledger is a torn publication and routes to `publication:recovery`; a missing
primary routes to `archive:recovery`.

## Evidence and closeout

- Active ownership and transaction material lives below
  `DATA_DIR/.archive-boundary/`.
- Project archive packages remain below `DATA_DIR/trash/projects/`.
- Recovery decisions are retained below
  `DATA_DIR/.archive-boundary/recoveries/` for archives, creations,
  publications, locks, and world-backup promotions (which also preserve the
  replaced corrupt primary beside their audit).
- Every tool retains a durable recovery audit. Creation, publication, and
  ordinary-lock recovery write `initiated` before mutation. Archive restoration
  remains governed by its adopted tombstone while files are copied, then writes
  a `prepared` audit before the tombstone is removed; a second crash remains
  inspectable through the still-live transaction evidence.

After recovery, run the relevant `inspect` command again, confirm the intended
project is visible, and run `npm run verify`. Do not delete retained archives,
backups, or audits merely to make the directory look clean.
