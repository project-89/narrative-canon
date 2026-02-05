---
# PROJECT 89 DOCUMENT METADATA
doc_id: repository-agents-guide-001
version: 1.0.0
last_updated: 2025-09-16
status: draft
author: Codex
contributors: []

# DOCUMENT RELATIONSHIPS
parent_docs:
  - doc_id: repository-guidelines-001
    relationship: complements
child_docs: []
related_docs:
  - doc_id: contributing-guide-001
    relationship: complements
  - doc_id: style-guide-001
    relationship: informs

# CONTENT CLASSIFICATION
domain: operations
sub_domain: collaboration
keywords: agents, contributor, workflow, guidelines

# SYNCHRONIZATION
last_sync: 2025-09-16
sync_notes: Initial publish
---

# Repository Guidelines

## Project Structure & Module Organization
Core canon lives in numbered directories (`00_core`–`09_metamind`), each mirroring governance, lore, economics, production, community, intelligence, operations, alliances, and meta-architecture streams. Active briefs and updates sit in `context/`, while persistent indices stay in `INDEX.md` and `DOCUMENTATION.md`. Interactive tooling and agents ship from `tools/`, the documentation portal runs under `docs/`, and the Proxim8 pipeline spans `04_production/proxim8-pipeline/{server,client,shared}`. Use `experiments/` for sandbox R&D and coordinate before touching archival material.

## Build, Test, and Development Commands
Run `npm install` in the workspace you modify. `npm run dev` inside `docs/` serves the portal on :3089; `npm run build && npm start` produces deployable exports. Within the pipeline folders, use `npm run dev` for live reloads and `npm run build` before handoffs. Always run `npm run lint` and the targeted test suite (e.g., `npm test`, `npm run test:v2:suite`) prior to pushing.

## Coding Style & Naming Conventions
Follow the narrative tone rules in `STYLE_GUIDE.md`. Keep JS/TS at 2-space indentation, prefer descriptive hyphenated filenames (`mission-brief-alpha.md`), and reserve PascalCase for TypeScript classes. Linting is enforced by repository ESLint and Tailwind configs; preserve the metadata block above every new document exactly as formatted here.

## Testing Guidelines
Jest powers pipeline validation; colocate specs as `*.test.ts` and rely on the built-in Mongo memory server. Disable flakey suites by renaming to `*.disabled` only after coordinating, and re-enable with a linked ticket. For documentation edits, run `npm run lint` in `docs/` and regenerate shared taxonomies with the appropriate `tools/` scripts when copy touches cross-document references.

## Commit & Pull Request Guidelines
Write present-tense commits with scoped prefixes (`docs:`, `pipeline:`, `ops:`) and list touched document IDs plus sync notes in the body. Pull requests should link the relevant mission or timeline issue, summarize expected human impact, document validation commands, and attach screenshots or transcripts for UI or narrative shifts.

## Agent Workflow Tips
Begin each work session by reviewing `context/` briefs and `logs/` for live mission signals. Capture emerging patterns in `AGENT_BBS_DEMO.md` derivatives, then socialize before propagating into numbered directories. Stage external-collaborator drafts in `05_community/` or `08_alliances/`, logging final agreements under `07_operations/` to keep compliance trails auditable.
