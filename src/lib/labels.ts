import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { extractAmazonItems } from './amazon-parser.mjs';

GlobalWorkerOptions.workerSrc = workerUrl;

export const RENDER_DPI = 300;

export type LabelItem = { sku: string; description: string; qty: number; asin?: string };

export type PageData = {
  id: string;
  pageNumber: number;
  items: LabelItem[];
  sku: string;
  description: string;
  /** Cropped label artwork, data URL. */
  image: string;
  sourcePdf: Uint8Array;
  sourcePageIndex: number;
  isInvoice: boolean;
};

export type QuickPageInfo = {
  id: string;
  pageIndex: number;
  pageNumber: number;
  image: string;
  isInvoice: boolean;
  kind: 'label' | 'invoice' | 'unknown';
  orderId?: string;
};

export async function parallelMap<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = new Array(workerCount).fill(0).map(async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function groupLines(items: { str: string; transform: number[] }[]): string[] {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
  for (const item of items) {
    const str = item.str.replace(/\s+/g, ' ').trim();
    if (!str) continue;
    const y = item.transform[5];
    const x = item.transform[4];
    let row = rows.find((r) => Math.abs(r.y - y) < 4);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, str });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim());
}

export function classifyPage(lines: string[]): 'invoice' | 'label' | 'unknown' {
  const isInvoice = lines.some((line) =>
    /tax invoice|bill of supply|cash memo|invoice details|invoice no|invoice date|amount in words|taxable value|authorized signatory/i.test(line),
  );
  if (isInvoice) return 'invoice';

  const isLabel = lines.some((line) =>
    /easy ship|ship to|ship from|awb\b|routing code|standard delivery|shipping label|seller return/i.test(line),
  );
  if (isLabel) return 'label';

  return 'unknown';
}

export function extractOrderId(lines: string[]): string | undefined {
  for (const line of lines) {
    const m = line.match(/\b\d{3}-\d{7}-\d{7}\b/);
    if (m) return m[0];
  }
  return undefined;
}

/** Delete unselected pages by extracting only kept indices into a clean PDF. */
export async function prunePdf(sourcePdf: Uint8Array, keptIndices: number[]): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourcePdf);
  const total = srcDoc.getPageCount();
  if (keptIndices.length === total) {
    return sourcePdf;
  }
  const prunedDoc = await PDFDocument.create();
  const copied = await prunedDoc.copyPages(srcDoc, keptIndices);
  for (const page of copied) {
    prunedDoc.addPage(page);
  }
  return await prunedDoc.save();
}

function cropToContent(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, pad = 8): HTMLCanvasElement {
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const step = 3;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i] < 244 || data[i + 1] < 244 || data[i + 2] < 244) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;

  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw > w * 0.985 && ch > h * 0.985) return canvas;

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d')!.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

async function renderPreviewPage(page: any, crop: boolean, maxDimension = 720): Promise<string> {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, maxDimension / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, background: '#fff' }).promise;
  const output = crop ? cropToContent(canvas, ctx) : canvas;
  const image = output.toDataURL('image/jpeg', 0.85);
  canvas.width = canvas.height = 0;
  return image;
}

/** Render fast lightweight thumbnails for the page picker dialog in parallel. */
export async function readPdfQuick(data: Uint8Array, firstPageNumber = 1): Promise<QuickPageInfo[]> {
  const task = getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const pageIndices = Array.from({ length: doc.numPages }, (_, i) => i + 1);

  const list = await parallelMap(pageIndices, 4, async (n) => {
    const page = await doc.getPage(n);
    const textContent = await page.getTextContent();
    const lines = groupLines(
      textContent.items.filter((i): i is { str: string; transform: number[] } => 'str' in i && Array.isArray((i as any).transform)),
    );
    const kind = classifyPage(lines);
    const isInvoice = kind === 'invoice' || (kind === 'unknown' && n % 2 === 0);
    const orderId = extractOrderId(lines);
    const image = await renderPreviewPage(page, false, 160);
    page.cleanup();

    return {
      id: `p${firstPageNumber + n - 1}-${Math.random().toString(36).slice(2, 7)}`,
      pageIndex: n - 1,
      pageNumber: firstPageNumber + n - 1,
      image,
      isInvoice,
      kind,
      orderId,
    };
  });

  return list;
}

/** Render only the pages that were intentionally kept out of the first pass. */
export async function hydratePreviews(pages: PageData[]): Promise<void> {
  const groups = new Map<Uint8Array, PageData[]>();
  for (const page of pages) {
    if (!page.image) groups.set(page.sourcePdf, [...(groups.get(page.sourcePdf) ?? []), page]);
  }
  for (const [sourcePdf, group] of groups) {
    const task = getDocument({ data: new Uint8Array(sourcePdf.slice()) });
    const doc = await task.promise;
    await parallelMap(group, 4, async (pageData) => {
      const page = await doc.getPage(pageData.sourcePageIndex + 1);
      pageData.image = await renderPreviewPage(page, false, 300);
      page.cleanup();
    });
  }
}

export async function readPdf(file: File | ArrayBuffer | Uint8Array, firstPageNumber = 1): Promise<PageData[]> {
  const data = file instanceof Uint8Array
    ? file
    : file instanceof ArrayBuffer
      ? new Uint8Array(file)
      : new Uint8Array(await file.arrayBuffer());

  const sourcePdf = new Uint8Array(data.slice(0));
  const task = getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const pageIndices = Array.from({ length: doc.numPages }, (_, i) => i + 1);

  // Extract text and metadata in parallel
  const metadata = await parallelMap(pageIndices, 4, async (n) => {
    const page = await doc.getPage(n);
    const textContent = await page.getTextContent();
    const lines = groupLines(
      textContent.items.filter((i): i is { str: string; transform: number[] } => 'str' in i && Array.isArray((i as any).transform)),
    );
    const kind = classifyPage(lines);
    const isInvoice = kind === 'invoice' || (kind === 'unknown' && n % 2 === 0);
    const items = isInvoice ? (extractAmazonItems(lines) as LabelItem[]) : [];
    const orderId = extractOrderId(lines);
    page.cleanup();
    return { lines, items, isInvoice, orderId };
  });

  // Pair each label with its invoice:
  // First match by Amazon Order ID (e.g. 408-XXXXXXX-XXXXXXX)
  const invoiceByOrderId = new Map<string, LabelItem[]>();
  for (const m of metadata) {
    if (m.isInvoice && m.orderId && m.items.length > 0 && !invoiceByOrderId.has(m.orderId)) {
      invoiceByOrderId.set(m.orderId, m.items);
    }
  }

  for (let n = 0; n < metadata.length; n++) {
    const current = metadata[n];
    if (current.isInvoice) continue;

    let items: LabelItem[] | undefined;
    if (current.orderId && invoiceByOrderId.has(current.orderId)) {
      items = invoiceByOrderId.get(current.orderId);
    }
    // Fallback: next page if it is an invoice
    if ((!items || items.length === 0) && metadata[n + 1]?.isInvoice && metadata[n + 1].items.length > 0) {
      items = metadata[n + 1].items;
    }

    if (items && items.length > 0) {
      current.items = items.map((item) => ({ ...item }));
    }
  }

  // Render previews in parallel (labels at 720px cropped, invoices at 280px)
  const pages = await parallelMap(metadata, 4, async (meta, n) => {
    const { items, isInvoice } = meta;
    const page = await doc.getPage(n + 1);
    const image = isInvoice
      ? await renderPreviewPage(page, false, 280)
      : await renderPreviewPage(page, true, 720);
    page.cleanup();

    return {
      id: `p${firstPageNumber + n}-${Math.random().toString(36).slice(2, 7)}`,
      pageNumber: firstPageNumber + n,
      items,
      sku: items.map((i) => i.sku).filter(Boolean).join(', '),
      description: items.map((i) => i.description).filter(Boolean).join(' | '),
      image,
      sourcePdf,
      sourcePageIndex: n,
      isInvoice,
    };
  });

  return pages;
}
