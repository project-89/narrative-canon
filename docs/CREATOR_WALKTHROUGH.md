# Creator Walkthrough — a new production, end to end

**What this is:** the manual flow for taking a brand-new project from empty
world to exported film, working *with* the studio agent, with a test
checkpoint at every phase. It encodes everything the 2026-08-06/07 battle
runs proved — where the pipeline is strong, where to verify, and which
gestures are load-bearing.

**Standing rules (learned the hard way):**

- **Creative control defaults to HUMAN.** Paid generations become amber
  approval cards (header badge + inline in chat). Nothing spends until you
  click. Flip to auto per-project only for deliberate autonomous runs.
- **Never trust a turn's prose — trust its tool calls.** The agent can
  narrate work it didn't do. The system stamps "SYSTEM CHECK: ZERO tool
  calls" on such replies; if you see it, re-issue the ask as a short
  imperative ("Do X now with tool calls").
- **Small imperative directives execute; grand multi-step directives get
  narrated.** One phase, one ask.
- **Image/video evidence beats text everywhere.** Every reference you attach
  is a vote; a deck that disagrees with itself produces drift. The whole
  flow below exists to make the deck unanimous.

---

## Phase 1 — World: cast, places, chronology

Tell the agent the premise, then have it create (directly, skip review):

- **Characters with dramatic anatomy** — each needs a *wound*, a *want*, and
  a *need* in its description. These aren't decoration; they're what the
  Story room binds beats to.
- **Location entities** for every place shots will live. A location that
  exists only in prose gets reinvented every render.
- **Canon events** in story-time order (`chronologyIndex`) — the spine the
  beats will claim.

**Test checkpoint:** open the World rail — every entity present? Ask the
agent to `validate_chronology`; try `world_state_at` mid-timeline. Then ask
it a question with a wrong premise ("didn't X die before Y?") — it should
correct you from the chronology, not agree.

## Phase 2 — Look: lock the style, then make the whole deck speak it

1. Save the style with a **strong visualPrompt** (medium, technique,
   palette, "never photoreal" if stylized) and **set it as default** (or on
   the production). *Verify it stuck* — the run that skipped this rendered
   an entire anime on a realism fallback prompt. A single saved style now
   auto-resolves, but check `list_styles` shows it default anyway.
2. Render **base portraits/location refs** (backend by intent: gpt-image
   obeys style text; nano-banana anchors identity).
3. Run **`generate_styled_cast`** — one approval card per character:
   style-transfers of each canonical ref. Approve or re-roll per character.
   For main cast, prefer a **model sheet** (multi-view, wardrobe locked,
   neutral background). Crop out anything the model invents (a vehicle in a
   turnaround becomes a "fact").

**Test checkpoint:** lay all approved refs side by side (cast + locations).
One visual language? If any ref argues with the set, re-roll it *now* —
inconsistency here is inherited by every video.

## Phase 3 — Shape: the dramaturgy

Hook, logline, beats — each beat **bound to a chronology event**
(`bind_beat_to_event`; re-pointing a bound beat requires `rebind:true`).
Then `promote_beat_to_scene` so scenes are born linked.

**Test checkpoint:** `get_dramaturgy` — every beat bound? Scenes carry
event links? Give each scene a real title (promotion can leak prose as
titles) and **set each scene's location entity** — unset locations mean no
location ref rides the video runs.

## Phase 4 — Scenes and shots

Author shot lists with the discipline the video model needs:

- **2–3s shots** for pace; H3 camera verbs (crash zoom, whip pan, speed
  ramp, tracking, handheld).
- **Name the participants on every shot** — an unnamed "her" invites a new
  character (a backstop now auto-declares the on-screen subject, but named
  is better).
- **Name the props**: "bicycle" every time, or the model picks its prior
  (motorcycle).
- Dialogue as `Name: 'line'` / `Name (V.O.): 'line'` on the shot.

**Test checkpoint:** read two adjacent scenes' shot lists aloud — do they
cut? Is anything visually ambiguous? Fix text now; text is free.

## Phase 5 — The reel (the motion bible) — per scene

1. `generate_reference_reel(sceneId, notes)` — approval card. The 15s reel
   is deliberately non-narrative: each cast member in their styled ref doing
   neutral motion, a location beat, the grade. **`notes` is the
   scene-wardrobe lever** ("no jacket, dawn light").
2. When it renders, **watch it like a casting director** (clip inspector →
   Scene reel → ▶, or ask the agent). Every character on-sheet? Right
   props? Right style?
3. `approve_reference_reel` — or reject with what's wrong and re-roll.
   **Never approve unwatched:** every take in the scene inherits the reel,
   mistakes included.

**Why this works:** the generator's evidence hierarchy is video > images >
text. The approved reel puts curated canon in the strongest channel.

## Phase 6 — Motion

- **Prompt density is per-model.** H3 composes at `compact` density by
  default — labels stripped, fields folded into prose, ~100 words/shot (the
  published sweet spot for MiniMax). `promptDensity: "full"` keeps the whole
  crew sheet (the profile for Seedance-class models). `dryRun: true` returns
  the composed prompt free — audit it before spending.
- **Overflow returns a chunk plan, not just a refusal.** When a run would
  blow H3's 7000-char cap, the 400 carries `chunkPlan`: exact shotIds,
  durations, and measured prompt chars per chunk. Run each chunk as its own
  generation, chaining chunk k+1 with `extendFromVideoUrl` = chunk k's take.
- First run of a scene: shots chunked to ≤15s, `refsStrategy: no-shots` —
  the reel auto-attaches (`reelAttached: true` in the result; verify it).
- Later chunks: chain with `referenceVideoUrl` from a take **that you have
  QA'd** — a referenced take's content is inherited with high fidelity,
  drift included. Only chain from clean takes.
- Sound: the composer now requests discrete diegetic sound only (the old
  room-tone default was the hum). Authored `sfx` on shots ride verbatim.

**Test checkpoint per take:** watch it (lane ▶ / screening room). Judge
identity against the sheet, style against the pin, audio floor. Record a
verdict (`record_take_verdict`) — verdicts persist and gate what can be
chained from. Jobs that stall recover automatically (watchdog); cut maps
are detection-refined on completion.

## Phase 7 — The cut

`list_timeline` (the derived clock), lanes as filmstrips (click = preview,
never a mutation), `apply_cut_plan` for edits (atomic, snapshotted),
`revert_timeline` to undo, `compare_takes` for A/B. `watch_cut` gives the
agent frame-accurate join review — ask for its verdict with timestamps.

## Phase 8 — Score and export

`compose_score` (free local synth — write the movements against the arc),
then `export_film`. Verify duration/streams; audio lanes are preview-only
in export (known gap) — the score + sequence audio mux is what ships.

---

## Known gaps to expect (current state)

- Entity pages don't yet show styled refs or "reels featuring this entity"
  (reel UI lives in the clip inspector only).
- Locations: styled-ref preference in sequence decks not yet wired (cast
  only); set scene locations manually after promote.
- H3 in-process pollers die (every run) — the watchdog recovers within ~4
  min; treat "pending past 10 min" as recovered-by-watchdog, not failure.
- Seedance 2.5 (30s / 50 refs / 10 video refs / ~3min extendable) is on
  Atlas and unintegrated — the reel concept scales up dramatically there.
