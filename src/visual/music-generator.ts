/**
 * music-generator — one continuous MUSIC BED for a film (V6's easiest, most
 * valuable slice, per Michael: a single track over the cut hides the per-clip
 * audio seams). MusicGen via Replicate (same plumbing as Seedance). MusicGen
 * caps ~30s, so beds are prompted as SEAMLESS LOOPS and the export mux loops
 * them under the film's full duration.
 */
import * as fs from "fs";
import * as path from "path";

const REPLICATE_API = "https://api.replicate.com/v1";

export async function generateMusicBed(opts: {
  prompt: string;
  durationSec?: number; // ≤30 (MusicGen cap); the mux loops it
  outputDir: string;
}): Promise<{ fileName: string; filePath: string }> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) throw new Error("REPLICATE_API_TOKEN not set");
  const duration = Math.max(8, Math.min(opts.durationSec ?? 30, 30));

  // meta/musicgen is version-pinned on the predictions endpoint (the
  // model-scoped route 404s for it).
  const MUSICGEN_VERSION = "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";
  const create = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: MUSICGEN_VERSION,
      input: {
        prompt: `${opts.prompt} Seamless loop, no fade in or out, consistent level throughout.`,
        duration,
        model_version: "stereo-large",
        output_format: "mp3",
        normalization_strategy: "loudness",
      },
    }),
  });
  if (!create.ok) throw new Error(`MusicGen create failed: ${await create.text()}`);
  const pred: any = await create.json();

  const pollUrl = pred?.urls?.get || `${REPLICATE_API}/predictions/${pred.id}`;
  const t0 = Date.now();
  let output: string | undefined;
  while (Date.now() - t0 < 6 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 4000));
    const poll = await fetch(pollUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    const st: any = await poll.json();
    if (st.status === "succeeded") { output = Array.isArray(st.output) ? st.output[0] : st.output; break; }
    if (st.status === "failed" || st.status === "canceled") throw new Error(`MusicGen ${st.status}: ${st.error || ""}`);
  }
  if (!output) throw new Error("MusicGen timed out");

  const audio = await fetch(output);
  if (!audio.ok) throw new Error(`MusicGen download failed: ${audio.status}`);
  const buf = Buffer.from(await audio.arrayBuffer());
  if (!fs.existsSync(opts.outputDir)) fs.mkdirSync(opts.outputDir, { recursive: true });
  const fileName = `music_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`;
  const filePath = path.join(opts.outputDir, fileName);
  fs.writeFileSync(filePath, buf);
  return { fileName, filePath };
}
