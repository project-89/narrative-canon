/**
 * AtlasCloudGenerator — one client for every model we route through Atlas
 * Cloud's unified API (GPT Image 2, Seedream, Seedance 2.0 video, MiniMax H3).
 *
 * API shape (docs.atlascloud.ai, verified 2026-07-31):
 *   POST  /api/v1/model/generateImage   { model, prompt, ... }  -> { data: { id } }
 *   POST  /api/v1/model/generateVideo   { model, prompt, image_url?, duration, ... }
 *   POST  /api/v1/model/uploadMedia     (multipart)             -> hosted url for image inputs
 *   GET   /api/v1/model/prediction/{id} -> { data: { status: 'completed'|'failed'|..., outputs: [url], error? } }
 *   Auth: Authorization: Bearer <ATLASCLOUD_API_KEY>
 *
 * Everything is async-poll; this client polls until terminal and downloads the
 * output so callers get a Buffer like the other generators.
 */

const ATLAS_BASE = process.env.ATLASCLOUD_BASE_URL || 'https://api.atlascloud.ai/api/v1';

/** Atlas model ids are modality-suffixed (live-verified against /models,
 *  2026-07-31): `openai/gpt-image-2/text-to-image`, `bytedance/seedance-2.0/
 *  reference-to-video`, `minimax/h3/image-to-video`, … The registry stores the
 *  BASE id; we append the modality from the actual inputs. Env-pinned ids that
 *  already carry a modality are left untouched. */
function withModality(baseId: string, modality: 'text-to-image' | 'edit' | 'text-to-video' | 'image-to-video' | 'reference-to-video'): string {
  if (/\/(text-to-image|edit|text-to-video|image-to-video|reference-to-video)(-fast|-spicy)?$/.test(baseId)) return baseId;
  return `${baseId}/${modality}`;
}

export interface AtlasImageResult {
  data: Buffer;
  mimeType: string;
  prompt: string;
  model: string;
}

export interface AtlasVideoResult {
  data: Buffer;
  mimeType: string;
  model: string;
  durationSec?: number;
}

export interface AtlasReferenceInput {
  data: Buffer;
  mimeType: string;
  description?: string;
}

/** Mixed-media reference for the H3 `refers` API shape (live spec,
 *  atlascloud.ai/models/minimax/h3/reference-to-video, read 2026-08-05):
 *  `refers: [{ url, type: 'image'|'video'|'audio' }]` — any mix, ≥1 item,
 *  at least one image OR video (audio never alone). Formats: PNG/JPEG/WebP,
 *  MP4/MOV, MP3/WAV. */
export interface AtlasMediaRef {
  data: Buffer;
  mimeType: string;
  kind: 'image' | 'video' | 'audio';
}

/** Atlas takes bare image_url(s) — the API has NO per-image description
 *  field, so the PROMPT is the only channel that can tell the model which
 *  attached image is which. Mirror the Gemini generator's [Image N] contract:
 *  when any input carries a description, append an indexed role manifest so
 *  identity refs cast and style refs stay style-only instead of leaking their
 *  subjects. Callers that bake their own labeling (the sequence composer's
 *  @Image scheme) simply pass no descriptions and nothing is appended. */
function buildImageRoleManifest(inputs: Array<{ description?: string }>, defaultLabel: (i: number) => string): string {
  if (!inputs.some((input) => input.description)) return '';
  const lines = inputs.map((input, i) => `Image ${i + 1}: ${input.description || defaultLabel(i)}`);
  return `\n\n[ATTACHED IMAGES — each has ONE job; Image numbers match attachment order]\n${lines.join('\n')}`;
}

export class AtlasCloudGenerator {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  /** Every Atlas fetch gets a hard timeout. A hung TCP connection on a
   *  timeout-less fetch parks the poller promise FOREVER — the job shows
   *  "pending" while Atlas shows "completed" (the 2026-08-06 triple-stuck
   *  sequence incident). AbortSignal turns a hang into a retryable error. */
  private fetchT(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  }

  /** Upload a media file (image/video/audio) so it can be referenced by url
   *  in generate calls. */
  async uploadMedia(input: { data: Buffer; mimeType: string }): Promise<string> {
    const form = new FormData();
    const mime = input.mimeType || 'image/jpeg';
    const ext = mime.includes('png') ? 'png'
      : mime.includes('webp') ? 'webp'
      : mime.includes('quicktime') || mime.includes('mov') ? 'mov'
      : mime.includes('mp4') || mime.includes('video') ? 'mp4'
      : mime.includes('wav') ? 'wav'
      : mime.includes('mpeg') && mime.startsWith('audio') ? 'mp3'
      : mime.includes('mp3') ? 'mp3'
      : 'jpeg';
    form.append('file', new Blob([new Uint8Array(input.data)], { type: mime }), `ref.${ext}`);
    const resp = await this.fetchT(`${ATLAS_BASE}/model/uploadMedia`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` }, // browser-style multipart boundary
      body: form as any,
    }, 120_000);
    if (!resp.ok) throw new Error(`AtlasCloud uploadMedia failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
    const json: any = await resp.json();
    // Live-verified response shape (2026-07-31): { code, message, data: { type, download_url } }
    const url = json?.data?.download_url || json?.data?.url || json?.url || json?.data?.outputs?.[0];
    if (!url) throw new Error(`AtlasCloud uploadMedia returned no url: ${JSON.stringify(json).slice(0, 300)}`);
    return url;
  }

  /** One-shot prediction status read — the RECOVERY road: a paid generation
   *  whose server-side poller died (restart) is still retrievable by id. */
  async getPrediction(predictionId: string): Promise<{ status: string; outputUrl?: string; error?: string }> {
    const resp = await this.fetchT(`${ATLAS_BASE}/model/prediction/${encodeURIComponent(predictionId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!resp.ok) throw new Error(`AtlasCloud prediction fetch failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const json: any = await resp.json();
    const status = String(json?.data?.status || 'unknown').toLowerCase();
    return {
      status,
      outputUrl: json?.data?.outputs?.[0],
      ...(json?.data?.error ? { error: String(json.data.error) } : {}),
    };
  }

  /** Download an output URL to a Buffer (public twin of the internal path). */
  async downloadOutput(url: string): Promise<{ data: Buffer; mimeType: string }> {
    return this.download(url, 'video/mp4');
  }

  /** Poll a prediction to terminal state and return its first output URL.
   *  Transient poll failures (network blips, 5xx, timeouts) are tolerated up
   *  to a consecutive cap — a paid generation must not be abandoned because
   *  ONE status read hiccuped. */
  private async pollPrediction(predictionId: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
    const intervalMs = opts.intervalMs ?? 2500;
    const started = Date.now();
    let consecutiveFailures = 0;
    for (;;) {
      let json: any;
      try {
        const resp = await this.fetchT(`${ATLAS_BASE}/model/prediction/${encodeURIComponent(predictionId)}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (!resp.ok) throw new Error(`poll ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        json = await resp.json();
        consecutiveFailures = 0;
      } catch (err: any) {
        consecutiveFailures++;
        if (consecutiveFailures >= 8) throw new Error(`AtlasCloud prediction poll failed ${consecutiveFailures}× in a row (${err?.message || err}) — prediction ${predictionId} may still finish; recover it via its prediction id.`);
        if (Date.now() - started > timeoutMs) throw new Error(`AtlasCloud generation timed out after ${Math.round(timeoutMs / 1000)}s (prediction ${predictionId})`);
        await new Promise((r) => setTimeout(r, intervalMs * 2));
        continue;
      }
      const status = String(json?.data?.status || '').toLowerCase();
      if (status === 'completed' || status === 'succeeded') {
        const out = json?.data?.outputs?.[0];
        if (!out) throw new Error(`AtlasCloud prediction completed with no outputs: ${JSON.stringify(json).slice(0, 300)}`);
        return out;
      }
      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        throw new Error(`AtlasCloud generation failed: ${json?.data?.error || status}`);
      }
      if (Date.now() - started > timeoutMs) throw new Error(`AtlasCloud generation timed out after ${Math.round(timeoutMs / 1000)}s (prediction ${predictionId})`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  private async download(url: string, fallbackMime: string): Promise<{ data: Buffer; mimeType: string }> {
    const resp = await this.fetchT(url, {}, 300_000);
    if (!resp.ok) throw new Error(`AtlasCloud output download failed (${resp.status})`);
    const mime = resp.headers.get('content-type') || fallbackMime;
    const buf = Buffer.from(await resp.arrayBuffer());
    return { data: buf, mimeType: mime.split(';')[0] };
  }

  /** Generate one image. References (if any) are uploaded first and passed as
   *  image_urls; caller is responsible for capability guardrails (e.g. the
   *  Seedance/Seedream no-photoreal-refs rule). */
  async generateImage(opts: {
    model: string;
    prompt: string;
    references?: AtlasReferenceInput[];
    /** "WxH" (e.g. "768x1344") — the param image models actually honor.
     *  Live-verified 2026-07-31: seedream + gpt-image-2 return the exact
     *  pixels; `ratio` and width/height are IGNORED for images. */
    size?: string;
    width?: number;
    height?: number;
    seed?: number;
    negativePrompt?: string;
  }): Promise<AtlasImageResult> {
    const attachedRefs = (opts.references || []).slice(0, 6);
    const refUrls: string[] = [];
    for (const ref of attachedRefs) {
      refUrls.push(await this.uploadMedia(ref));
    }
    const finalPrompt = `${opts.prompt}${buildImageRoleManifest(attachedRefs, (i) => `reference input ${i + 1}`)}`;
    const resolvedImageModel = withModality(opts.model, refUrls.length > 0 ? 'edit' : 'text-to-image');
    const body: any = {
      model: resolvedImageModel,
      prompt: finalPrompt,
      ...(refUrls.length === 1 ? { image_url: refUrls[0] } : {}),
      ...(refUrls.length > 1 ? { image_urls: refUrls } : {}),
      ...(opts.size ? { size: opts.size } : {}),
      ...(opts.width ? { width: opts.width } : {}),
      ...(opts.height ? { height: opts.height } : {}),
      ...(opts.seed != null ? { seed: opts.seed } : {}),
      ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
    };
    console.log(`🗺️  AtlasCloud image [${resolvedImageModel}]: ${finalPrompt.slice(0, 70).replace(/\n/g, ' ')}… (${refUrls.length} refs${finalPrompt !== opts.prompt ? ', role manifest appended' : ''})`);
    const resp = await this.fetchT(`${ATLAS_BASE}/model/generateImage`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) }, 60_000);
    if (!resp.ok) throw new Error(`AtlasCloud generateImage failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
    const json: any = await resp.json();
    const id = json?.data?.id;
    if (!id) throw new Error(`AtlasCloud generateImage returned no prediction id: ${JSON.stringify(json).slice(0, 300)}`);
    const outUrl = await this.pollPrediction(id, { timeoutMs: 5 * 60 * 1000 });
    const dl = await this.download(outUrl, 'image/png');
    return { ...dl, prompt: finalPrompt, model: opts.model };
  }

  /** Generate one video clip. I2V via firstFrame; multi-reference sequences
   *  (Seedance 2.0's "Universal Reference" — cast looks, location, storyboard
   *  blueprint) via references[]. firstFrame, when present, is always the
   *  FIRST image so @Image1 semantics hold. */
  async generateVideo(opts: {
    model: string;
    prompt: string;
    firstFrame?: AtlasReferenceInput;
    references?: AtlasReferenceInput[];
    /** Mixed-media references (H3 `refers` shape): video and/or audio assets
     *  riding alongside the images. Presence of ANY switches the request to
     *  the `refers` array format — H3's full multimodal input (≤9 images,
     *  ≤3 videos, ≤3 audio). Image `references` above are folded in as
     *  refers entries of type 'image', in order, ahead of these. */
    mediaRefs?: AtlasMediaRef[];
    /** H3 resolution knob ('768P' | '2K'); omitted = provider default. */
    resolution?: string;
    /** Fired the moment Atlas returns a prediction id — persist it: it is the
     *  ONLY road back to a paid generation across a server restart
     *  (GET /model/prediction/{id} keeps working after we're gone). */
    onSubmitted?: (predictionId: string) => void;
    durationSec?: number;
    /** Aspect ratio string ("16:9" | "9:16" | "1:1") — REQUIRED by some models
     *  for text-only generation (live-verified: MiniMax H3 t2v rejects without). */
    ratio?: string;
    /** Treat a single image input as an identity REFERENCE (reference-to-video)
     *  rather than a first frame (image-to-video). */
    forceReferenceMode?: boolean;
    width?: number;
    height?: number;
    seed?: number;
    negativePrompt?: string;
  }): Promise<AtlasVideoResult> {
    const inputs: AtlasReferenceInput[] = [
      ...(opts.firstFrame ? [opts.firstFrame] : []),
      ...(opts.references || []),
    ];
    const urls: string[] = [];
    for (const input of inputs) urls.push(await this.uploadMedia(input));
    // REFERS PATH — the H3 API shape. Per the live Atlas spec (2026-08-05),
    // minimax/h3/reference-to-video reads ONLY `refers: [{url, type}]`;
    // `image_urls` is silently IGNORED there ("requires at least one
    // reference image or video" with images attached was exactly this — the
    // Aug 4 success predates the change). So: any video/audio refs, OR an H3
    // call that resolves to reference-to-video, goes through `refers` —
    // images first (preserving <Picture N> order), then videos, then audio.
    const mediaRefs = opts.mediaRefs || [];
    const isH3Model = /minimax[/-]h3/.test(opts.model);
    const resolvesToR2V = urls.length > 1 || (urls.length >= 1 && Boolean((opts as any).forceReferenceMode));
    if (mediaRefs.length > 0 || (isH3Model && resolvesToR2V)) {
      const refers: Array<{ url: string; type: 'image' | 'video' | 'audio' }> = urls.map((u) => ({ url: u, type: 'image' as const }));
      for (const m of mediaRefs) {
        refers.push({ url: await this.uploadMedia(m), type: m.kind });
      }
      if (!refers.some((r) => r.type === 'image' || r.type === 'video')) {
        throw new Error('AtlasCloud refers requires at least one image or video reference — audio cannot be the sole reference.');
      }
      const refersModel = withModality(opts.model, 'reference-to-video');
      const body: any = {
        model: refersModel,
        prompt: opts.prompt,
        refers,
        ...(opts.durationSec ? { duration: Math.round(opts.durationSec) } : {}),
        ...(opts.resolution ? { resolution: opts.resolution } : {}),
        ...(opts.ratio ? { ratio: opts.ratio } : {}),
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      };
      console.log(`🗺️  AtlasCloud video [${refersModel}] refers-mode: ${opts.prompt.slice(0, 70).replace(/\n/g, ' ')}… (${refers.filter((r) => r.type === 'image').length} img, ${refers.filter((r) => r.type === 'video').length} vid, ${refers.filter((r) => r.type === 'audio').length} aud)`);
      const resp = await this.fetchT(`${ATLAS_BASE}/model/generateVideo`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) }, 60_000);
      if (!resp.ok) throw new Error(`AtlasCloud generateVideo (refers) failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
      const json: any = await resp.json();
      const id = json?.data?.id;
      if (!id) throw new Error(`AtlasCloud generateVideo (refers) returned no prediction id: ${JSON.stringify(json).slice(0, 300)}`);
      opts.onSubmitted?.(id);
      const outUrl = await this.pollPrediction(id);
      const dl = await this.download(outUrl, 'video/mp4');
      return { data: dl.data, mimeType: dl.mimeType, model: opts.model, durationSec: opts.durationSec };
    }
    // Same role-manifest contract as generateImage. The first frame, when
    // present, is attachment #1 — its default label says so. H3 speaks its
    // own typed-label grammar (<Picture N>, docs/H3_PROMPTING_GUIDE.md), so
    // its manifest uses native vocabulary instead of the "Image N" phrasing.
    const isH3 = /minimax[/-]h3/.test(opts.model);
    const manifest = !inputs.some((input) => input.description) ? '' : (isH3
      ? `\n\n${inputs.map((input, i) => `<Picture ${i + 1}> is ${input.description || ((opts.firstFrame && i === 0) ? 'the first frame of [Shot 1]' : 'a reference image')}.`).join('\n')}`
      : buildImageRoleManifest(inputs, (i) =>
        (opts.firstFrame && i === 0)
          ? 'OPENING FRAME — the clip begins exactly on this image.'
          : `reference input ${i + 1}`));
    const videoPrompt = `${opts.prompt}${manifest}`;
    // A single image defaults to i2v (first-frame anchoring); callers that
    // mean "this is an IDENTITY reference, not the opening frame" force r2v
    // even with one input (the canvas's wires mean identity).
    let resolvedVideoModel = withModality(opts.model,
      urls.length === 0 ? 'text-to-video'
        : (urls.length === 1 && !(opts as any).forceReferenceMode) ? 'image-to-video'
        : 'reference-to-video');
    // The modality must MATCH the actual inputs. A base id pinned with a
    // modality suffix (env override, or a caller passing the full id) skips
    // withModality's inference — so zero images against a pinned
    // reference-to-video id hard-fails server-side ("requires at least one
    // reference image"). Downgrade to what the inputs can actually satisfy.
    if (urls.length === 0 && /\/(image-to-video|reference-to-video)(-fast|-spicy)?$/.test(resolvedVideoModel)) {
      const downgraded = resolvedVideoModel.replace(/\/(image-to-video|reference-to-video)(-fast|-spicy)?$/, '/text-to-video');
      console.warn(`⚠️  AtlasCloud: ${resolvedVideoModel} requested with ZERO image inputs — downgrading to ${downgraded}`);
      resolvedVideoModel = downgraded;
    }
    const body: any = {
      model: resolvedVideoModel,
      prompt: videoPrompt,
      ...(urls.length === 1 ? { image_url: urls[0] } : {}),
      ...(urls.length > 1 ? { image_urls: urls } : {}),
      ...(opts.durationSec ? { duration: opts.durationSec } : {}),
      ...(opts.ratio ? { ratio: opts.ratio } : {}),
      ...(opts.width ? { width: opts.width } : {}),
      ...(opts.height ? { height: opts.height } : {}),
      ...(opts.seed != null ? { seed: opts.seed } : {}),
      ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
    };
    console.log(`🗺️  AtlasCloud video [${resolvedVideoModel}]: ${videoPrompt.slice(0, 70).replace(/\n/g, ' ')}… (${opts.durationSec || '?'}s${urls.length ? `, ${urls.length} image input(s)` : ''}${videoPrompt !== opts.prompt ? ', role manifest appended' : ''})`);
    const resp = await this.fetchT(`${ATLAS_BASE}/model/generateVideo`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) }, 60_000);
    if (!resp.ok) throw new Error(`AtlasCloud generateVideo failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
    const json: any = await resp.json();
    const id = json?.data?.id;
    if (!id) throw new Error(`AtlasCloud generateVideo returned no prediction id: ${JSON.stringify(json).slice(0, 300)}`);
    opts.onSubmitted?.(id);
    const outUrl = await this.pollPrediction(id); // video: full 10min budget
    const dl = await this.download(outUrl, 'video/mp4');
    return { data: dl.data, mimeType: dl.mimeType, model: opts.model, durationSec: opts.durationSec };
  }
}

export default AtlasCloudGenerator;
