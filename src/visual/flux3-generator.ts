/**
 * FLUX 3 (Black Forest Labs) — one model across video with synchronized
 * audio. The studio's long-take engine: up to 20s at FHD/24fps in ONE
 * generation, multi-scene cuts that hold, multilingual dialogue with lipsync,
 * timestamped KEYFRAMES (choreograph a shot through pinned stills), video
 * CONTINUATION (v2v — extend an existing clip from its final frames), and
 * DRAFT mode (~1/3 cost preview whose draft_cache bundle reproduces the SAME
 * generation at full quality via draft_enhance — explore cheap, commit once).
 *
 * API shape (docs.bfl.ai/flux_3): async submit → {id, polling_url} → poll
 * until Ready → result.sample is a SIGNED mp4 URL that expires ~2h. We
 * download immediately — both the clip and (for drafts) the draft_cache
 * bundle, because an expired bundle URL means the draft can never be
 * enhanced. Keyframes are FRAMES OF THE CLIP, not identity references —
 * Omni Reference is "coming soon"; until then cast-ref machinery must never
 * feed portraits here (each would literally appear as a frame).
 */

import * as fs from 'fs';

const BFL_BASE = process.env.BFL_API_BASE || 'https://api.bfl.ai';

export interface Flux3VideoResult {
  data: Buffer;
  mimeType: string;
  model: string;
  durationSec?: number;
  /** Base64 .bin bundle downloaded from the draft result — persist it; the
   *  signed URL dies in ~2h and with it the ability to enhance. */
  draftCacheBase64?: string;
  cost?: number;
}

export type Flux3Keyframes = string | string[] | Array<[number, string]>;

export class Flux3Generator {
  constructor(private apiKey: string) {}

  private headers() {
    return { 'x-key': this.apiKey, 'Content-Type': 'application/json' };
  }

  /** Generate a clip. mode is explicit: t2v (prompt only), i2v (keyframes —
   *  1 starts the clip, 2 pin start+end, [seconds, image] pairs pin exact
   *  times), v2v (startVideo continues from its final frames). */
  async generateVideo(opts: {
    mode: 't2v' | 'i2v' | 'v2v';
    prompt: string;
    /** i2v: image URLs or base64 strings (bare base64, no data: prefix). */
    keyframes?: Flux3Keyframes;
    /** v2v: mp4 as http(s) URL or bare base64. */
    startVideo?: string;
    durationSec?: number | 'auto';
    aspectRatio?: string;
    resolution?: 'hd' | 'fhd';
    generateAudio?: boolean;
    draft?: boolean;
  }): Promise<Flux3VideoResult> {
    const body: any = {
      mode: opts.mode,
      prompt: opts.prompt,
      ...(opts.mode === 'i2v' ? { keyframes: opts.keyframes } : {}),
      ...(opts.mode === 'v2v' ? { start_video: opts.startVideo } : {}),
      ...(opts.durationSec !== undefined ? { duration: opts.durationSec } : {}),
      ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
      resolution: opts.resolution || 'hd',
      generate_audio: opts.generateAudio !== false,
      ...(opts.draft ? { draft: true } : {}),
    };
    console.log(`🎞️  FLUX 3 [${opts.mode}${opts.draft ? ' DRAFT' : ''}]: ${opts.prompt.slice(0, 70).replace(/\n/g, ' ')}… (${opts.durationSec ?? 'auto'}s, ${body.resolution})`);
    return this.submitAndCollect(body);
  }

  /** Full-quality render of a prior draft — the SAME generation (mode,
   *  prompt, seed, media all pinned inside the bundle), not a re-roll. */
  async enhanceDraft(draftCacheBase64: string): Promise<Flux3VideoResult> {
    console.log('🎞️  FLUX 3 [draft_enhance]: reproducing a kept draft at full quality');
    return this.submitAndCollect({ mode: 'draft_enhance', draft_cache: draftCacheBase64 });
  }

  private async submitAndCollect(body: any): Promise<Flux3VideoResult> {
    const submit = await fetch(`${BFL_BASE}/v1/flux-3-video`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!submit.ok) {
      throw new Error(`FLUX 3 submit failed (${submit.status}): ${(await submit.text()).slice(0, 300)}`);
    }
    const submitted: any = await submit.json();
    const pollingUrl: string = submitted?.polling_url;
    if (!pollingUrl) throw new Error(`FLUX 3 returned no polling_url: ${JSON.stringify(submitted).slice(0, 200)}`);

    const deadline = Date.now() + 20 * 60 * 1000;
    let result: any;
    for (;;) {
      if (Date.now() > deadline) throw new Error('FLUX 3 generation timed out after 20 minutes');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const poll = await fetch(pollingUrl, { headers: { 'x-key': this.apiKey } });
      if (!poll.ok) throw new Error(`FLUX 3 poll failed (${poll.status}): ${(await poll.text()).slice(0, 200)}`);
      result = await poll.json();
      if (result.status === 'Ready') break;
      if (result.status === 'Error' || result.status === 'Request Moderated' || result.status === 'Content Moderated') {
        throw new Error(`FLUX 3 generation failed: ${result.status}${result.details ? ` — ${JSON.stringify(result.details).slice(0, 200)}` : ''}`);
      }
    }

    const sampleUrl: string = result?.result?.sample;
    if (!sampleUrl) throw new Error(`FLUX 3 Ready but no result.sample: ${JSON.stringify(result).slice(0, 200)}`);
    // Signed URLs expire ~2h — download NOW, never store the URL.
    const clip = await fetch(sampleUrl);
    if (!clip.ok) throw new Error(`FLUX 3 clip download failed (${clip.status})`);
    const data = Buffer.from(await clip.arrayBuffer());

    // Drafts ship a draft_cache bundle URL; download it immediately too or
    // the enhance path dies with the URL.
    let draftCacheBase64: string | undefined;
    const cacheUrl: string | undefined = result?.result?.draft_cache || result?.draft_cache;
    if (typeof cacheUrl === 'string' && /^https?:\/\//.test(cacheUrl)) {
      try {
        const bundle = await fetch(cacheUrl);
        if (bundle.ok) draftCacheBase64 = Buffer.from(await bundle.arrayBuffer()).toString('base64');
        else console.warn(`⚠️ FLUX 3 draft_cache download failed (${bundle.status}) — this draft cannot be enhanced later`);
      } catch (err: any) {
        console.warn(`⚠️ FLUX 3 draft_cache download error: ${err?.message}`);
      }
    }

    return {
      data,
      mimeType: 'video/mp4',
      model: 'flux-3-video',
      ...(typeof result?.result?.duration === 'number' ? { durationSec: result.result.duration } : {}),
      ...(draftCacheBase64 ? { draftCacheBase64 } : {}),
      ...(typeof submitted?.cost === 'number' ? { cost: submitted.cost } : {}),
    };
  }
}

/** Read a local file as the bare-base64 string BFL accepts for media inputs. */
export function fileToBareBase64(filePath: string): string {
  return fs.readFileSync(filePath).toString('base64');
}
