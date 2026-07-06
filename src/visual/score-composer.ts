/**
 * score-composer — AGENTIC MIDI-STYLE COMPOSITION. The agent writes music as
 * NOTE EVENTS (notation — language, not black-box audio) and this renders them
 * deterministically: breathing pads + decaying piano, the palette proven on
 * FABLE's score. Infinitely revisable: change the events, re-render, same
 * everything else.
 */
import * as fs from "fs";
import * as path from "path";

export interface NoteEvent {
  voice: "pad" | "piano";
  note: string;      // e.g. "Db3", "F#5"
  t: number;         // start seconds
  dur?: number;      // pads only (piano rings ~5s); default 8
  gain?: number;     // 0..1.5, default 1 (pad) / 0.6 (piano)
  pan?: number;      // 0(L)..1(R), default 0.5
}

const SR = 44100;

function freqOf(n: string): number {
  const m = n.match(/^([A-G])(b|#)?(-?\d)$/);
  if (!m) throw new Error(`bad note: ${n}`);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const s = base[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return 440 * Math.pow(2, (s - 9) / 12 + (parseInt(m[3], 10) - 4));
}

export function renderScore(events: NoteEvent[], durationSec: number, outWavPath: string): void {
  const N = Math.floor(SR * durationSec);
  const L = new Float64Array(N), R = new Float64Array(N);
  for (const e of events) {
    const f = freqOf(e.note);
    const pan = e.pan ?? 0.5;
    if (e.voice === "pad") {
      const dur = e.dur ?? 8, gain = (e.gain ?? 1) * 0.22;
      const a = Math.min(4, dur * 0.35), r = Math.min(6, dur * 0.4);
      for (let i = 0; i < dur * SR; i++) {
        const t = i / SR, gt = e.t + t; if (gt < 0 || gt >= durationSec) continue;
        const env = t < a ? t / a : t > dur - r ? Math.max(0, (dur - t) / r) : 1;
        const vib = 1 + 0.0025 * Math.sin(2 * Math.PI * 0.18 * t);
        const s = (Math.sin(2 * Math.PI * f * vib * t) + 0.35 * Math.sin(2 * Math.PI * 2 * f * t) + 0.12 * Math.sin(2 * Math.PI * 3 * f * t)) * env * gain;
        const idx = Math.floor(gt * SR); L[idx] += s * (1 - pan); R[idx] += s * pan;
      }
    } else {
      const gain = (e.gain ?? 0.6) * 0.16, dur = 5;
      for (let i = 0; i < dur * SR; i++) {
        const t = i / SR, gt = e.t + t; if (gt < 0 || gt >= durationSec) continue;
        const env = Math.exp(-t * 1.6) * Math.min(1, t * 200);
        const s = (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 3) + 0.2 * Math.sin(2 * Math.PI * 4 * f * t) * Math.exp(-t * 6)) * env * gain;
        const idx = Math.floor(gt * SR); L[idx] += s * (1 - pan); R[idx] += s * pan;
      }
    }
  }
  const pcm = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const il = Math.max(0, i - 900);
    pcm.writeInt16LE(Math.round(Math.tanh(L[i] + R[il] * 0.12) * 30000), i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(R[i] + L[il] * 0.12) * 30000), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  const dir = path.dirname(outWavPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outWavPath, Buffer.concat([h, pcm]));
}
