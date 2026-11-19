import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import type { PageData } from './labels';

/** Thermal label: 4 x 6 inch, printed at 300 dpi. */
export const LABEL_IN = { w: 4.24, h: 6 };
const DPI = 300;
const W = LABEL_IN.w * DPI;
const H = LABEL_IN.h * DPI;

export type PrintMode = 'sku' | 'sku-desc' | 'none';

type Text = { text: string; size: number; bold: boolean; lineHeight: number };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      if (ctx.measureText(chunk + char).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

const font = (size: number, bold = false) => `${bold ? '700 ' : ''}${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;

function layoutText(ctx: CanvasRenderingContext2D, texts: Text[], width: number, height: number) {
  const pad = 110;
  const maxWidth = width - pad * 2;
  const blocks: { lines: string[]; size: number; bold: boolean; lineHeight: number }[] = [];

  let scaled = texts.map((t) => ({ ...t }));
  for (let attempt = 0; attempt < 12; attempt++) {
    let total = 0;
    blocks.length = 0;
    for (const t of scaled) {
      ctx.font = font(t.size, t.bold);
      const lines = wrap(ctx, t.text, maxWidth);
      const blockHeight = lines.length * t.size * t.lineHeight;
      blocks.push({ lines, size: t.size, bold: t.bold, lineHeight: t.lineHeight });
      total += blockHeight;
    }
    if (total <= height - pad * 2) return { blocks, pad, total, ok: true };
    scaled = scaled.map((t) => ({ ...t, size: t.size * 0.9 }));
    if (scaled.every((t) => t.size < 22)) break;
  }

  const clipped: typeof blocks = [];
  let used = 0;
  for (const b of blocks) {
    const room = Math.max(0, height - pad * 2 - used);
    const fit = Math.floor(room / (b.size * b.lineHeight));
    if (fit <= 0) break;
    const lines = b.lines.slice(0, fit);
    if (lines.length < b.lines.length) {
      const last = lines.length - 1;
      lines[last] = `${lines[last].replace(/[\s,.;:-]+$/, '')}…`;
    }
    clipped.push({ ...b, lines });
    used += lines.length * b.size * b.lineHeight;
  }
  return { blocks: clipped, pad, total: used, ok: false };
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  page: Pick<PageData, 'sku' | 'description' | 'items'>,
  mode: PrintMode,
  top: number,
  height: number,
) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, top, W, height);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, top + 1.5);
  ctx.lineTo(W, top + 1.5);
  ctx.stroke();

  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  const texts: Text[] = [];
  const items = page.items.length
    ? page.items
    : [{ sku: page.sku, description: page.description, qty: 1 }];
  for (const item of items) {
    if (mode === 'sku') {
      texts.push({ text: item.sku || '—', size: 71, bold: true, lineHeight: 1.12 });
    } else {
      if (item.sku) texts.push({ text: item.sku, size: 71, bold: true, lineHeight: 1.15 });
      if (item.description) texts.push({ text: item.description, size: 46, bold: false, lineHeight: 1.22 });
    }
  }

  const { blocks, pad } = layoutText(ctx, texts, W, height);
  let y = top + pad;
  for (const block of blocks) {
    ctx.font = font(block.size, block.bold);
    for (const line of block.lines) {
      ctx.fillText(line, pad, y);
      y += block.size * block.lineHeight;
    }
    y += block.size * 0.18;
  }
  ctx.restore();
}

/** Crisp preview resolution: 636 x 900 (nearly 3x density for 232px cards). */
const OUTPUT_W = 636;
const OUTPUT_H = 900;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapCanvas(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Overlay the SKU block into the blank strip on Amazon's label artwork.
 * Fast, crisp preview with hardware-accelerated JPEG encoding.
 */
export async function composeLabel(page: PageData, mode: PrintMode): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

  const img = await loadImage(page.image);
  const scale = Math.min(OUTPUT_W / img.width, OUTPUT_H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (OUTPUT_W - dw) / 2, (OUTPUT_H - dh) / 2, dw, dh);

  if (mode !== 'none' && !page.isInvoice) {
    const items = page.items.length ? page.items : [{ sku: page.sku, description: page.description, qty: 1 }];
    const itemText = items.map((item) => {
      const title = item.description || '';
      const id = item.asin ? `${item.asin} ( ${item.sku} )` : item.sku;
      return `${title}\n${id} (Qty: ${item.qty || 1})`;
    }).join('\n');

    const x = 26;
    const y = Math.round(OUTPUT_H * 0.762);
    const w = OUTPUT_W - 52;
    const h = Math.round(OUTPUT_H * 0.065);
    const pad = 6;
    const size = mode === 'sku' ? 15 : 12;

    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#111';
    ctx.font = `700 ${size}px Arial, sans-serif`;
    ctx.textBaseline = 'top';

    let cursorY = y + pad;
    for (const block of itemText.split('\n')) {
      const lines = wrapCanvas(ctx, block, w - pad * 2);
      for (const line of lines) {
        if (cursorY + size > y + h - pad) break;
        ctx.fillText(line, x + pad, cursorY);
        cursorY += Math.round(size * 1.05);
      }
    }
    ctx.restore();
  }

  const jpeg = canvas.toDataURL('image/jpeg', 0.88);
  canvas.width = canvas.height = 0;
  return jpeg;
}

function wrapPdfText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function overlayAmazonData(page: PDFPage, data: PageData, mode: PrintMode, font: PDFFont, bold: PDFFont) {
  if (mode === 'none' || data.isInvoice) return;
  const items = data.items.length ? data.items : [{ sku: data.sku, description: data.description, qty: 1 }];
  const width = page.getWidth();
  const boxX = 55;
  const boxWidth = Math.min(510, width - boxX * 2);
  const skuSize = 17;
  const descSize = 11;
  const lineGap = 3;
  const lines: { text: string; size: number; font: typeof font }[] = [];

  for (const item of items) {
    const id = item.asin ? `${item.asin} ( ${item.sku} )` : item.sku;
    if (mode === 'sku') {
      lines.push({ text: id || '—', size: skuSize, font: bold });
    } else {
      if (item.description) {
        for (const text of wrapPdfText(font, item.description, descSize, boxWidth - 16)) {
          lines.push({ text, size: descSize, font });
        }
      }
      lines.push({ text: `${id} (Qty: ${item.qty || 1})`, size: descSize, font: bold });
    }
  }

  const boxHeight = Math.max(38, lines.reduce((height, line) => height + line.size + lineGap, 8));
  const boxY = 172;
  page.drawRectangle({ x: boxX, y: boxY, width: boxWidth, height: boxHeight, color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0), borderWidth: 1 });
  let y = boxY + boxHeight - 8;
  for (const line of lines) {
    y -= line.size;
    page.drawText(line.text, { x: boxX + 8, y, size: line.size, font: line.font, color: rgb(0, 0, 0), maxWidth: boxWidth - 16 });
    y -= lineGap;
  }
}

/** Export original Amazon pages with a PDF-native overlay; never rasterize the final file. */
export async function buildPdf(rows: PageData[], mode: PrintMode = 'sku-desc'): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sourceCache = new Map<Uint8Array, PDFDocument>();
  for (const row of rows) {
    let source = sourceCache.get(row.sourcePdf);
    if (!source) {
      source = await PDFDocument.load(row.sourcePdf);
      sourceCache.set(row.sourcePdf, source);
    }
    const [page] = await doc.copyPages(source, [row.sourcePageIndex]);
    doc.addPage(page);
    overlayAmazonData(page, row, mode, font, bold);
  }
  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}
