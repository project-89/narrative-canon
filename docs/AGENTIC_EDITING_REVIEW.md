# Agentic Timeline Editing — Readiness Review

**Date:** 2026-08-06 · **Branch:** `movie-pipeline` · **Scope:** can the chat agent act as a real film editor over the production timeline?

**Verdict in one line:** the *perception* half is largely built and the *CRUD* half is largely built; what's missing is the **clock, the cut primitive, the take shelf, and structured output** — four small-to-medium gaps, not an architecture rewrite. The one deep gap (absolute time for video clips) can be deferred behind a derived-clock read model.

---

## 1. STATE OF PLAY

### What an agent editor can do today, honestly

| Capability | Tool | Status |
|---|---|---|
| See the timeline structure | `list_timeline` (`server.ts:18468` / `24847`) | Works — tracks + items with `order`, `durationSec`, `inSec`/`outSec`, `hasSequenceSlice`, `shotHasVideo` |
| Build a first cut from the script | `auto_populate_timeline` (`18473`/`24889` → `server.ts:6907`) | Works — additive, idempotent, story-order walk of acts→scenes→shots |
| Add / delete tracks | `add_timeline_track`, `delete_timeline_track` | Works (create + cascade delete only) |
| Add / delete / reorder clips | `add_timeline_clip`, `delete_timeline_clip`, `reorder_timeline_clips` | Works |
| Trim a clip (mark in / mark out) | `update_timeline_clip` (`18507`/`24981`) | Works — same PATCH the UI's `I`/`O` keys and drag handles use (`page.tsx:17307-17346`, `3526`) |
| Split a clip | *composed* — `update_timeline_clip` + `add_timeline_clip` | Works, but hand-simulated. The UI's `handleSplitClipAtPlayhead` (`page.tsx:17348-17390`) does exactly these two calls; the agent must do the arithmetic itself |
| Generate a sequence video across shots | `generate_sequence_video` (`17380`/`21802` → `server.ts:10789`) | Works — backend picker, refs strategy, extend-from |
| Targeted video edit (non-destructive) | `edit_video` (`17396`/`21845` → `11225`) | Works — result lands as a new `scene.sequenceTakes` entry |
| Detach / place audio | `extract_audio` (`17406`/`21875` → `11154`) | Works — the *only* tool that can set `startSec` and auto-creates the audio lane |
| Promote a shot take | `promote_video_take` (`~17789`/`22710`; REST twin `server.ts:11985`) | Works — frame-level `videoTakes[]` swap |
| **Watch a take (motion + audio)** | `watch_shot` (`17857`/`22925`) | **Works, and is better than expected** — verified: ≤12MB files attach as native `video/mp4` `inlineData` (`server.ts:22985-22993`), so Gemini perceives real motion *and* the audio track; >12MB falls back to 2-12 sampled JPEGs with sub-second windowing and **no audio** (`22996-23020`) |
| Export the cut | `export_film` (`~22765` → `11947`) | Works; progress only via the coarse `watch_film`/`lastExport` view |

### The honest shape of it

The agent can already **assemble, trim, reorder, generate, and watch**. That is a working editor's loop on paper. What it cannot do is the thing that makes an editor an editor: **look at a specific moment in the cut and change it there.**

Three structural facts explain almost every gap below:

1. **Video items have no absolute time.** They are strictly `order` + `durationSec` (`server.ts:6803-6804` comment: *"Audio items position absolutely (startSec), unlike sequential clips"*). There is no timeline clock, no gaps, no overlaps, no J/L cuts on the video track. The agent cannot say "at 00:47" — it can only say "clip #6, 1.2s in."
2. **The take shelf is invisible to the agent.** `scene.sequenceTakes` is actively written (`server.ts:9221, 10711, 10979, 11295, 11353`) and the UI take-lane renders it, but **no read tool returns it**. The agent can only reuse a `videoUrl` it captured from a job result inside the same conversation. Restart the conversation and the take history is gone from the agent's world.
3. **Perception has no output schema.** `watch_shot` hands Gemini the pixels and asks for prose. Nothing structures the reply into timestamped findings, and nothing writes a verdict back to the record — so a judgment made in turn 3 is unavailable in turn 30.

**Verification note:** I directly confirmed two load-bearing claims against source — the `startSec` omission in `update_timeline_clip`'s body-builder (`server.ts:24986-24993`, which forwards exactly `durationSec/trackId/order/label/sourceVideoUrl/inSec/outSec`) and the `watch_shot` native-video path with `INLINE_VIDEO_LIMIT = 12MB` and whole-second `videoMetadata` rounding (`server.ts:22985-22993`). Remaining citations are inventory-sourced.

---

## 2. THE GAP MAP

Ranked by editorial value — how much an editor's actual working day depends on it.

### Tier 1 — blocks the core loop

| # | Gap | Evidence | Why it matters |
|---|---|---|---|
| **1** | **No timeline clock.** Video items carry no `startSec`; nothing computes cumulative position. The agent cannot address a moment in the cut. | `server.ts:6803-6804`; `list_timeline` returns only `order`/`durationSec` (`24847`) | Every editorial note a human gives is time-addressed ("the beat at 0:42 is dead"). Today the agent must translate that into clip indices by summing durations it was never handed. |
| **2** | **No take discovery.** `scene.sequenceTakes` unreadable by any tool. | written at `9221, 10711, 10979, 11295, 11353`; absent from `list_timeline` | "Use the second take" is unanswerable. Take selection only works if the agent generated the take itself, this session. |
| **3** | **No atomic split.** No `split_timeline_clip`. | UI does it in two calls, `page.tsx:17348-17390` | Splitting is the single most common edit. Composed splits are correct but fragile: if the second call fails, the timeline is left with a silently shortened clip and no replacement. |
| **4** | **`startSec` dropped by `update_timeline_clip`.** The PATCH route accepts it (`6798-6803`); the tool never reads `args.startSec` (**verified**, `24986-24993`). | — | The agent can place audio (via `extract_audio`) but can never move it again. Sound design is one-shot. |

### Tier 2 — blocks fluent work

| # | Gap | Evidence | Why it matters |
|---|---|---|---|
| **5** | **No structured perception output.** `watch_shot` returns prose. | `22925-23035` | Findings can't be diffed, applied, re-checked, or persisted. Every review is a fresh opinion. |
| **6** | **Whole-second windowing on the native-video path.** `videoMetadata: {startOffset: Math.floor(rangeIn), endOffset: Math.ceil(rangeOut)}` (**verified**, `22993`). | — | A 2.4s shot inside a 15s sequence gets watched as a 3-4s window bleeding into its neighbours. Frame-accurate judgment on the *good* (audio-bearing) path is structurally impossible. |
| **7** | **12MB quality cliff.** ≤12MB → native video + audio; >12MB → stills, no audio. | `22985-23020` | Exactly the long sequence-video windows most in need of pacing/audio review are the ones that silently lose audio. No chunking or re-encode strategy exists. |
| **8** | **No take delete.** `DELETE /api/narrative/scenes/:sceneId/takes/:takeId` exists (`9224-9239`); no tool case. | `page.tsx:3608` wires the UI trash | Agent can promote but never prune. The shelf only grows. |
| **9** | **No track mute / hide / rename / reorder.** `PATCH /timeline/tracks/:id` (`6689-6708`) has no tool. | — | Cannot A/B a music bed, cannot solo a lane to review, cannot silence a scratch track before export. |

### Tier 3 — ergonomics and safety

| # | Gap | Evidence |
|---|---|---|
| 10 | No batch / atomic edit path. `PUT /api/narrative/timeline` (`6889-6905`) does wholesale replace with **zero validation** (dangling `trackId`, missing `sourceShotId` all accepted) and has no tool wrapper. Every agent edit is one small mutation with no transaction and no undo. |
| 11 | No verdict persistence — no field like `frame.videoTakes[i].agentVerdict`. |
| 12 | No fps / frame count / timecode ever surfaced. `video-frame-extractor.ts:52` parses duration from ffmpeg's `-i` banner and deliberately avoids ffprobe — but ffprobe *is* already used elsewhere (`server.ts:4105, 11165, 11175`). The agent reasons in seconds, never frames. |
| 13 | No ripple. `POST /items` shifts downstream `order` by +1 on create (`6756-6758`); delete leaves a hole; nothing renumbers. |
| 14 | No markers / chapters / cue points anywhere in the model. |
| 15 | No per-item mute or volume. `detachedFromVideoUrl` (`11200-11203`) is a *documentation convention*, not an enforced flag — nothing stops two audio items claiming the same detach, or the video's `sourceVideoUrl` changing out from under it. |
| 16 | No agent access to `GET /visual/video-frame` (`12231`) — the agent cannot pull a single thumbnail the way the UI filmstrip does. |
| 17 | File uploads have no agent path. Structural (no local filesystem), not a missing wrapper. |
| 18 | **Open question, needs verification:** does `generate-sequence-video` reconcile `scene.sequenceVideo.shotCuts` into per-item `sourceVideoUrl/inSec/outSec`, or is that UI-triggered? If UI-only, an agent calling `generate_sequence_video` gets a take that never appears on the timeline without N manual `update_timeline_clip` calls. This should be traced before building on top of it. |

---

## 3. THE MULTIMODAL UNLOCK

### The good news first

The hard part is done. `src/llm/gemini.ts` already carries native video end-to-end: `ImagePart` (`gemini.ts:46-54`) declares `mimeType: 'video/mp4'` with optional `videoMetadata: {startOffset, endOffset, fps}`; tool results returning `_imageParts` are stripped of base64 before the `functionResponse` is serialized and the media is re-queued as a separate user turn (`gemini.ts:516-593`); a `hasVideo` flag (`545`) switches the framing text to *"WATCH the video (motion AND audio)"*. There is no model-specific gating in the adapter — video rides on whatever the selected Gemini model supports (`gemini-3.1-pro-preview-customtools` is the agentic default, `src/config/models.ts:23-100`).

So: **we do not need to build a perception pipeline. We need to build the addressing system around it.**

### How the agent should SEE the timeline — three surfaces, not one

Different editorial questions need different resolutions. One tool cannot serve all three.

**Surface A — the manifest (cheap, always first).**
A derived timeline clock. No schema change: compute `startSec` for video items as the running sum of `durationSec` over `order` on each track, and return it alongside the existing fields plus `sourceVideoUrl`, `detachedFromVideoUrl`, `takeCount`, and — critically — the mapping *timeline second → (clipId, source video, source second)*.

```
clip c4  [00:18.0 → 00:22.4]  shot sh_7  src seq_a1.mp4 @ 6.2–10.6  takes:3
clip c5  [00:22.4 → 00:24.9]  shot sh_8  src seq_a1.mp4 @ 10.6–13.1 takes:3  ← CUT
```

This is the single highest-leverage change in the document. It costs nothing (pure derivation), changes no data model, and it is what turns "clip #5" into "00:22.4" — the vocabulary every human editorial note is written in.

**Surface B — the cut sheet (the frame-accurate one).**
The inventory's most under-exploited asset is `extractFrameAtCached` (`video-frame-extractor.ts:142`): deterministic filename cache keyed on (video basename, **centisecond** timestamp, width), so repeat requests serve the cached JPEG with no ffmpeg invocation. The UI filmstrip already leans on it via `GET /visual/video-frame` (`server.ts:12231`), sampling one frame per shot-cut midpoint (commits `16025c7`, `74acbaf`).

Point the same machinery at **cut boundaries instead of midpoints**. For each cut in a span, sample four frames: `out−0.20`, `out−0.04`, `in+0.04`, `in+0.20`. Attach them as labelled image parts with their exact timestamps in the label. This is precisely the evidence needed to detect the failure modes that matter — dead/frozen frames at handles, a cut landing mid-gesture, a continuity break across the join — and it is **free, sub-second-precise, and cached**. `extractFrames` already accepts an explicit `timestamps[]` array at centisecond rounding (`video-frame-extractor.ts:88`), so this needs no new extraction code, only a new caller and a labelling convention.

**Surface C — native video (motion + audio, the verdict pass).**
Keep `watch_shot`'s native path, but fix its two limits:

- *Sub-second windows.* Stop relying on `videoMetadata` offsets, which round to whole seconds (`22993`). Instead **pre-cut the window with ffmpeg** (`-ss <in> -to <out>`, re-encode) into the same deterministic cache, then attach that file natively with no `videoMetadata` at all. This gets frame-accurate windowing *and* keeps audio — today those two properties are mutually exclusive (accurate windowing exists only on the audio-less stills fallback, `22996-23020`).
- *The 12MB cliff.* Once windows are pre-cut, most windows fall under the limit naturally. For genuinely long spans, chunk into ≤12MB segments and attach them as sequential parts rather than silently degrading to stills. The current failure is silent — the agent gets no signal that it just lost the audio track.

Add `fps` and `frameCount` to whatever `getVideoMeta()` returns. ffprobe is already a dependency in this codebase (`server.ts:4105, 11165, 11175`); `video-frame-extractor.ts` avoids it by design for duration only. Surfacing fps lets the agent speak in frames and lets us honestly claim frame-accuracy rather than "seconds, bounded by `-ss` seek accuracy and the model's visual time estimate."

### The review → edit loop

```
1. READ      read_timeline(withClock: true)
             → manifest: every clip's [startSec, endSec] and its source-video window

2. PERCEIVE  watch_cut(fromSec, toSec)          ← cut sheet, cached, free, sub-second
             or watch_span(fromSec, toSec)      ← native pre-cut video + audio
             → Gemini sees labelled frames/video with exact timestamps

3. PROPOSE   model emits a CUT PLAN as structured JSON, not prose:
             { ops: [
                 { op: "trim",  clipId: "c4", outSec: 10.34, reason: "holds 0.3s on a dead frame" },
                 { op: "split", clipId: "c7", atSec: 3.10 },
                 { op: "swap_take", sceneId: "s2", shotId: "sh_9", takeIndex: 1,
                   reason: "take 1 lands the head turn on the line" }
             ]}

4. APPLY     apply_cut_plan(ops, dryRun?)
             → snapshot first (the PUT /timeline replace path, server.ts:6889, already
               backs the UI's undo/redo), validate every op, apply as one unit,
               return the new manifest

5. RE-WATCH  watch_cut over the same span
             → confirm or revert to the snapshot
```

The loop's integrity depends on step 4 being **atomic and reversible**. Today it is neither: each mutation is a separate PATCH, and the only snapshot mechanism (`PUT /timeline`) has zero validation and no tool wrapper. A half-applied cut plan is a corrupted timeline with no undo. That is the safety argument for building `apply_cut_plan` before, not after, giving the agent more editing power.

### What this architecture explicitly does *not* need

- No new video pipeline — `gemini.ts` already carries native mp4 with audio.
- No new frame extractor — `extractFrameAtCached` is already deterministic and cached.
- No absolute-time schema migration to get started — the derived clock (Surface A) gives the agent time addressing while video items stay order-based. Real `startSec` on video items is only required when we want gaps, overlaps, and J/L cuts.

---

## 4. THE ROADMAP

Ordered so each step ships value standing alone. Effort: **S** ≤ half a day, **M** 1-3 days, **L** ≥ a week.

### Phase 0 — one-line fixes (do these first, today)

**0.1 — `update_timeline_clip` forwards `startSec`** · **S**
`server.ts:24986-24993`, add `if (typeof startSec === 'number') body.startSec = startSec;` and the schema param at `18507`. The endpoint already accepts it (`6798-6803`).
*Unlocks:* the agent can reposition audio in time — sound design stops being one-shot. Closes a verified gap for one line of code.

**0.2 — `update_timeline_track(trackId, name?, muted?, hidden?, order?)`** · **S**
Wraps the existing `PATCH /timeline/tracks/:id` (`6689-6708`).
*Unlocks:* mute a scratch lane before export, solo a lane for review, A/B a music bed.

### Phase 1 — the clock and the shelf (the foundation)

**1.1 — `list_timeline` returns a derived clock** · **S**
Add per-video-item computed `startSec`/`endSec` (running sum of `durationSec` by `order`), plus raw `sourceVideoUrl`, `detachedFromVideoUrl`, and `takeCount`. No schema change, no migration.
*Unlocks:* time-addressed editorial language. **Prerequisite for everything in Phase 3.** Highest value-per-hour item in this document.

**1.2 — `list_takes(sceneId?, shotId?)`** · **S**
Returns `scene.sequenceTakes` (`9221, 10711, 10979, 11295, 11353`) and `frame.videoTakes` — index, url, duration, createdAt, prompt/instruction, which is active.
*Unlocks:* take selection as a real operation instead of a same-conversation memory trick. Also makes `promote_video_take` (`22710`) usable without having generated the take yourself.

**1.3 — `delete_take(sceneId, takeId)`** · **S**
Wraps `DELETE /api/narrative/scenes/:sceneId/takes/:takeId` (`9224-9239`).
*Unlocks:* pruning. Pairs with 1.2 — you cannot curate a shelf you cannot read or clear.

**1.4 — `split_timeline_clip(clipId, atSec)`** · **S/M**
Server-side port of `handleSplitClipAtPlayhead` (`page.tsx:17348-17390`): shrink in place, insert the second half sharing `sourceVideoUrl` with the complementary `inSec`. One atomic endpoint, one tool.
*Unlocks:* the most common edit becomes a single reliable call instead of two-call arithmetic that can half-fail.

### Phase 2 — perception with structure

**2.1 — `watch_cut(fromSec, toSec)` — the cut sheet** · **M**
Uses the Phase-1 clock to resolve the span to clips, then `extractFrameAtCached` (`video-frame-extractor.ts:142`) at `out−0.20 / out−0.04 / in+0.04 / in+0.20` around each boundary. Labelled with exact timestamps. Free after first call (deterministic cache), sub-second precise.
*Unlocks:* dead-frame and continuity detection at the joins — the specific defects sequence-video generation produces most.

**2.2 — Frame-accurate native windows** · **M**
Replace `watch_shot`'s whole-second `videoMetadata` (`22993`) with an ffmpeg pre-cut into the deterministic cache, attached natively. Chunk to ≤12MB segments instead of falling back to audio-less stills (`22996-23020`), and when a fallback *does* happen, say so loudly in the returned `message`.
*Unlocks:* motion + audio judgment on exactly the window in question, not a second-rounded neighbourhood. Removes the silent audio-loss cliff.

**2.3 — Expose `fps` / `frameCount` / timecode** · **S**
`getVideoMeta()` via ffprobe (already in-tree at `server.ts:4105, 11165, 11175`), surfaced in every watch tool's return.
*Unlocks:* the agent talks in frames. Makes "frame-accurate" an honest claim.

**2.4 — Cut-plan output schema** · **M**
Define the `ops` JSON contract (§3 step 3) and instruct on it in the watch tools' `message` field, where `watch_shot` already carries its editorial prompt (`22997`).
*Unlocks:* perception output becomes machine-applicable rather than prose to be re-parsed by hand each turn.

### Phase 3 — the loop closes

**3.1 — `apply_cut_plan(ops[], dryRun?)`** · **M**
Validates every op against the current timeline, snapshots via the existing `PUT /timeline` path (`6889-6905`), applies as one unit, returns the new manifest. **Add the validation `PUT /timeline` currently lacks** — referential integrity on `trackId`/`sourceSceneId`/`sourceShotId`, and the `durationSec === outSec − inSec` invariant the server does not enforce today.
*Unlocks:* atomic, reversible editing. Turns a review into one apply. This is the safety gate — it should land before the agent's editing power grows further.

**3.2 — `revert_timeline(snapshotId)`** · **S** (given 3.1)
*Unlocks:* real undo for the agent, matching what the UI already has.

**3.3 — Verdict persistence** · **M**
Field on the take record (`frame.videoTakes[i].verdict`, `scene.sequenceTakes[i].verdict`) written by a `record_take_verdict` tool.
*Unlocks:* judgments survive the conversation; takes become comparable across sessions; an audit trail for why a cut is the way it is.

**3.4 — `compare_takes(sceneId, shotId, takeIndices[])`** · **M/L**
Attaches N takes (or N cut sheets) in one call for a comparative verdict, then optionally promotes the winner.
*Unlocks:* "which take is best" in one turn instead of N turns of separately-reasoned `watch_shot` calls.

### Phase 4 — the deep change

**4.1 — Absolute time for video items** · **L**
Give video items `startSec` and make the timeline a real time model: gaps, overlaps, J/L cuts, ripple insert/delete/trim, and bulk shift. Requires a migration path from `order`-based items, a UI rewrite of the sequential-stack rendering, and export-assembly changes.
*Unlocks:* everything an NLE does that this one currently cannot. **Deliberately last** — the derived clock (1.1) buys the agent time-addressing without it, and nothing in Phases 0-3 depends on it.

**4.2 — Markers / chapters** · **M**
No model support today. Natural once 4.1 lands.

### Sequencing rationale

Phases 0 and 1 are eight small items totalling perhaps three days, and they convert the agent from "can mutate a timeline" to "can discuss and address a timeline." Phase 2 is where Gemini's existing video perception finally gets pointed at the right frames. Phase 3 makes the loop safe enough to trust unsupervised. Phase 4 is the only item that touches the data model, and it is deferred precisely because the derived clock makes it non-blocking.

**Before Phase 2, verify gap #18** — whether `generate-sequence-video` reconciles `shotCuts` onto timeline items server-side or only via the UI. If it is UI-only, an agent-generated sequence never reaches the timeline without manual per-shot `update_timeline_clip` calls, and that reconciliation belongs in Phase 1 as a blocker.
