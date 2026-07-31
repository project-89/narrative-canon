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

export class AtlasCloudGenerator {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  /** Upload an image so it can be referenced by url in generate calls. */
  async uploadMedia(input: AtlasReferenceInput): Promise<string> {
    const form = new FormData();
    const ext = input.mimeType?.includes('png') ? 'png' : 'jpeg';
    form.append('file', new Blob([new Uint8Array(input.data)], { type: input.mimeType }), `ref.${ext}`);
    const resp = await fetch(`${ATLAS_BASE}/model/uploadMedia`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` }, // browser-style multipart boundary
      body: form as any,
    });
    if (!resp.ok) throw new Error(`AtlasCloud uploadMedia failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
    const json: any = await resp.json();
    const url = json?.data?.url || json?.url || json?.data?.outputs?.[0];
    if (!url) throw new Error(`AtlasCloud uploadMedia returned no url: ${JSON.stringify(json).slice(0, 300)}`);
    return url;
  }

  /** Poll a prediction to terminal state and return its first output URL. */
  private async pollPrediction(predictionId: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
    const intervalMs = opts.intervalMs ?? 2500;
    const started = Date.now();
    for (;;) {
      const resp = await fetch(`${ATLAS_BASE}/model/prediction/${encodeURIComponent(predictionId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!resp.ok) throw new Error(`AtlasCloud prediction poll failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
      const json: any = await resp.json();
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
    const resp = await fetch(url);
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
    width?: number;
    height?: number;
    seed?: number;
    negativePrompt?: string;
  }): Promise<AtlasImageResult> {
    const refUrls: string[] = [];
    for (const ref of (opts.references || []).slice(0, 6)) {
      refUrls.push(await this.uploadMedia(ref));
    }
    const body: any = {
      model: opts.model,
      prompt: opts.prompt,
      ...(refUrls.length === 1 ? { image_url: refUrls[0] } : {}),
      ...(refUrls.length > 1 ? { image_urls: refUrls } : {}),
      ...(opts.width ? { width: opts.width } : {}),
      ...(opts.height ? { height: opts.height } : {}),
      ...(opts.seed != null ? { seed: opts.seed } : {}),
      ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
    };
    console.log(`🗺️  AtlasCloud image [${opts.model}]: ${opts.prompt.slice(0, 70).replace(/\n/g, ' ')}… (${refUrls.length} refs)`);
    const resp = await fetch(`${ATLAS_BASE}/model/generateImage`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`AtlasCloud generateImage failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
    const json: any = await resp.json();
    const id = json?.data?.id;
    if (!id) throw new Error(`AtlasCloud generateImage returned no prediction id: ${JSON.stringify(json).slice(0, 300)}`);
    const outUrl = await this.pollPrediction(id, { timeoutMs: 5 * 60 * 1000 });
    const dl = await this.download(outUrl, 'image/png');
    return { ...dl, prompt: opts.prompt, model: opts.model };
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
    durationSec?: number;
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
    const body: any = {
      model: opts.model,
      prompt: opts.prompt,
      ...(urls.length === 1 ? { image_url: urls[0] } : {}),
      ...(urls.length > 1 ? { image_urls: urls } : {}),
      ...(opts.durationSec ? { duration: opts.durationSec } : {}),
      ...(opts.width ? { width: opts.width } : {}),
      ...(opts.height ? { height: opts.height } : {}),
      ...(opts.seed != null ? { seed: opts.seed } : {}),
      ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
    };
    console.log(`🗺️  AtlasCloud video [${opts.model}]: ${opts.prompt.slice(0, 70).replace(/\n/g, ' ')}… (${opts.durationSec || '?'}s${urls.length ? `, ${urls.length} image input(s)` : ''})`);
    const resp = await fetch(`${ATLAS_BASE}/model/generateVideo`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`AtlasCloud generateVideo failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
    const json: any = await resp.json();
    const id = json?.data?.id;
    if (!id) throw new Error(`AtlasCloud generateVideo returned no prediction id: ${JSON.stringify(json).slice(0, 300)}`);
    const outUrl = await this.pollPrediction(id); // video: full 10min budget
    const dl = await this.download(outUrl, 'video/mp4');
    return { data: dl.data, mimeType: dl.mimeType, model: opts.model, durationSec: opts.durationSec };
  }
}

export default AtlasCloudGenerator;
