/**
 * composeShotGrid — composite a run of shot stills into ONE numbered storyboard
 * grid image. Used as Seedance's @Image1 blueprint (Workflow B), and as a
 * face-scan mitigation: faces rendered as small grid panels read as elements,
 * not clear portraits, so they slip past Seedance's image-scan more often than
 * full-frame stills do.
 *
 * Pure sharp — no API calls. The server resolves shot image URLs to buffers and
 * hands them in, in shot order.
 */
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

export interface GridPanel {
  buffer: Buffer;
  /** Panel number / shot order shown in the corner. */
  label?: string;
}

/**
 * Lay panels out in a grid (≤4 columns), each in a 16:9 cell with a numbered
 * badge, on a black background. Returns the saved filename + path.
 */
export async function composeShotGrid(
  panels: GridPanel[],
  outputDir: string,
  opts: { cellWidth?: number; gap?: number } = {},
): Promise<{ fileName: string; filePath: string; width: number; height: number }> {
  if (panels.length === 0) throw new Error("composeShotGrid: no panels");
  const cellW = opts.cellWidth ?? 480;
  const cellH = Math.round((cellW * 9) / 16);
  const gap = opts.gap ?? 6;
  const cols = Math.min(4, panels.length);
  const rows = Math.ceil(panels.length / cols);
  const width = cols * cellW + (cols + 1) * gap;
  const height = rows * cellH + (rows + 1) * gap;

  // Resize each panel into its cell (cover crop), collect composite ops.
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < panels.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const left = gap + c * (cellW + gap);
    const top = gap + r * (cellH + gap);
    let cell: Buffer;
    try {
      cell = await sharp(panels[i].buffer)
        .resize(cellW, cellH, { fit: "cover", position: "attention" })
        .toBuffer();
    } catch {
      // Unreadable image → a flat dark cell keeps the grid aligned.
      cell = await sharp({ create: { width: cellW, height: cellH, channels: 3, background: { r: 20, g: 22, b: 28 } } }).png().toBuffer();
    }
    composites.push({ input: cell, left, top });
  }

  // Number badges as one SVG overlay (top-left of each cell).
  const badges = panels.map((p, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = gap + c * (cellW + gap) + 6;
    const y = gap + r * (cellH + gap) + 6;
    const text = p.label ?? String(i + 1);
    const w = 14 + text.length * 9;
    return `<rect x="${x}" y="${y}" width="${w}" height="22" rx="4" fill="black" fill-opacity="0.6"/>` +
      `<text x="${x + 7}" y="${y + 16}" font-family="sans-serif" font-size="14" font-weight="700" fill="#ffffff">${text}</text>`;
  }).join("");
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${badges}</svg>`);
  composites.push({ input: svg, left: 0, top: 0 });

  const base = sharp({ create: { width, height, channels: 3, background: { r: 8, g: 10, b: 14 } } });
  const out = await base.composite(composites).png().toBuffer();

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `shotgrid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`;
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, out);
  return { fileName, filePath, width, height };
}
