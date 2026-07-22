# How It All Works — the Narrative Studio, in plain language

*A layman's guide to the whole system: what it is, how the pieces fit, how
stories get planned, made, and tracked, and how other things will plug into
it. No jargon required. (Last updated 2026-07-22 — after T0+T1 shipped.)*

---

## The one-sentence version

**You keep one living story-world, and everything else — films, comics,
episodes, and eventually games and social accounts — is a different way of
telling what's true in that world.**

---

## 1. The world is the center of everything

When you open the studio and pick a project, you're really picking a
**world**: a place with its own people, locations, history, and visual
style. Everything in a world is shared:

- **Characters and places** (the "entities") — each with an album of
  reference images ("looks": Aria in armor, Aria in street clothes) so every
  picture of them, in any medium, looks like the same person.
- **The visual style** — locked by pinned reference images, so a film frame
  and a comic panel from the same world share one aesthetic.
- **The lore** — notes, world bibles, and story documents.
- **Your taste** — the studio remembers what you liked and rejected, and
  what prompting actually worked, and uses both on every future generation.

## 2. Productions: the tellings

Inside a world you create **productions** — one per deliverable:

> *FABLE (a film) · FABLE — The Comic (a comic) · Episode 3 (a short)*

The switcher in the header (next to the story switcher) is how you move
between them. Each production owns its own scenes, script, and editing
timeline — but they all draw on the same cast, style, and history. That's
the magic: issue #7 of your comic stays consistent with issue #1 AND with
the film, because they're all rendering the same underlying world.

Every production also has an **autonomy dial**:

- **direct** — you drive, the AI assists (the default).
- **review** — the AI produces, you approve at each step.
- **autonomous** — the AI runs alone within a budget and reports back.

Different productions can sit at different settings simultaneously.

## 3. Arcs: planning stories bigger than one film

An **arc** is a long-range intention — a claim about where the world is
going that can span many productions:

> *"Aria discovers the pattern, and it costs her James." — spanning the
> film, comic issues #2–#4, and a future episode.*

Arcs track which characters they involve, the end-states you're steering
toward, which productions advance them, and how much has actually been
delivered into the story so far (`canonProgress`). Ask the agent to
`create_arc`, link productions to it, and update its progress as things
ship. Arcs are how the system remembers *intent* — the gap between what you
planned and what you've made is always visible.

## 4. The ledger: the world's memory (version control for stories)

Every time you **commit** in the studio, the system quietly writes an entry
in the world's ledger: exactly *what changed* in the story since last time —
"Aria added", "scene 4's dialogue updated", "these scenes reordered" — as
typed, checksummed operations, with who made them and when. Highlights:

- The **first commit of a world is its genesis** — everything it contains,
  recorded as history.
- **Nothing phantom**: if nothing story-visible changed, no entry appears.
  Renders, timeline scrubs, and other production busywork never pollute it.
- Each **branch** of your story keeps its own chain (what-if branches don't
  contaminate the main history).
- Ask the agent `get_canon_log` any time: "what changed in this world
  lately?" gets a real, precise answer.

This ledger is the foundation everything later builds on: automatic
reactions to changes (hooks), the review inbox (the Canon rail), merging
divergent story branches, and letting outside systems safely contribute.

## 5. Making things: the pipelines

**Films** (the mature pipeline): style → story → world → storyboard →
shots → video (Veo) → editing timeline → one MP4. The AI can direct
autonomously (`dream_film`): brief in the evening, film by morning, with a
budget cap and a morning report.

**Comics** (new): pick scenes → the system writes a panel-by-panel brief
from each scene's shots (action, exact dialogue, captions, sound effects) →
generates each as a **complete comic page** — lettering drawn into the art,
speech balloons and all — using the characters' reference images, your style
pins, and the previous page for continuity → you keep / reject / redo each
page (redos keep the old version and accept notes like "fix panel 2's
lettering") → export a print-ready PDF. The first comic ever made this way
is FABLE's own, sitting in your FABLE project now.

**Everything is triple-exposed**: whatever the AI can do with a tool, you
can do in the UI, and (soon) external systems can do through an API. No
capability is agent-only or human-only.

## 6. Review: you are the editor-in-chief

The system is built so that scale never removes you from the loop unless you
choose it:

- Generations arrive as **drafts/candidates**; you keep, reject, or redo.
- AI-proposed story changes arrive as **proposals** that wait for your
  yes/no — and they now survive restarts, so the queue is never silently
  lost.
- Autonomous runs write **morning reports** of what they did and kept.
- Coming next (T3): the **Canon rail** — one inbox showing everything that
  happened overnight across all productions, with the story-diff of each
  change, and merge / bounce / fork-into-arc buttons.

## 7. Connecting from outside (the roadmap from here)

The world is becoming a hub other systems plug into:

- **T2 — feeding the world**: upload a document, a book, or a *session
  recording* (a D&D night, a writers' meeting) — the system transcribes,
  extracts who/what/where, deduplicates against your existing cast, and
  appends it to the world as reviewable proposals. Campaign one night,
  comic issue the next morning.
- **T3 — reactions and publishing**: hooks watch the ledger and act —
  "when the day's events are committed, render tonight's comic page";
  "when this production exports, post the teaser through the connector."
  Publishing stays human-gated with retraction paths; the autonomy dial
  finally gets enforced per production.
- **T5 — the open door**: the studio's tools served over MCP so *external*
  AI agents (a game master bot, a co-writer's assistant) become citizens:
  they query the world, propose events, and lock character/location details
  — with identity and permissions.
- **T6 — the living network**: character-agents run social accounts as
  their characters, knowing only what their character canonically knows;
  their posts are events in the world; and when two storylines contradict,
  the contradiction surfaces as a *story beat* to be woven in — in this
  mythos, a glitch in the timeline is content.

## 8. Where things live (for the curious)

| Thing | Where |
|---|---|
| A world's data | `.narrative-data/project_<id>.json` (auto-backed-up, crash-safe writes) |
| The story ledger | `.narrative-data/nit/<projectId>.json` |
| Background jobs | `.narrative-data/jobs/` (survive restarts) |
| Renders & videos | `.narrative-data/generated-images/`, `generated-videos/` |
| Exports (MP4s, comic PDFs) | `.narrative-data/exports/` |
| The deep design docs | `docs/TRANSMEDIA_INTEGRATION_REVIEW.md` (§9 is the architecture), `docs/TRANSMEDIA_ROADMAP.md` (the vision), `docs/STATE.md` (live status) |

---

*The code is the key. The narrative is the door. The world remembers.*
