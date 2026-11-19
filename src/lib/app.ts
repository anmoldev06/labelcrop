import { hydratePreviews, prunePdf, readPdf, readPdfQuick, parallelMap, type PageData } from './labels';
import { composeLabel, buildPdf } from './compose';

type Row = PageData & { out: string };

const state = {
  rows: [] as Row[],
  busy: false,
  nextPage: 1,
};

type PendingFile = {
  id: string;
  file: File;
  data: Uint8Array;
  totalPages: number;
};

type PendingPageItem = {
  id: string;
  fileIndex: number;
  originalPageIndex: number;
  pageNumber: number;
  image: string;
  isInvoice: boolean;
  kind: 'label' | 'invoice' | 'unknown';
};

let pendingFiles: PendingFile[] = [];
let pendingPages: PendingPageItem[] = [];
let pendingChecked = new Set<string>();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const drop = $('drop');
const input = $<HTMLInputElement>('file');
const grid = $('grid');
const results = $('results');
const status = $('status');
const summary = $('summary');
const labelsPdfBtn = $<HTMLButtonElement>('labelsPdfBtn');
const invoicesPdfBtn = $<HTMLButtonElement>('invoicesPdfBtn');
const bothPdfBtn = $<HTMLButtonElement>('bothPdfBtn');
const picker = $<HTMLDivElement>('picker');
const pickerGrid = $<HTMLDivElement>('pickerGrid');
const pickerRenderBtn = $<HTMLButtonElement>('pickerRender');
const pickerCancelBtn = $<HTMLButtonElement>('pickerCancel');
const pickerSelectAllBtn = $<HTMLButtonElement>('pickerSelectAll');
const pickerDeselectAllBtn = $<HTMLButtonElement>('pickerDeselectAll');

function visibleRows(): Row[] {
  return state.rows.slice();
}

function setStatus(text: string, tone: 'info' | 'error' = 'info') {
  status.textContent = text;
  status.dataset.tone = tone;
}

async function composeRows(rows: Row[]) {
  const labels = rows.filter((row) => !row.isInvoice);
  await parallelMap(labels, 4, async (row) => {
    row.out = await composeLabel(row, 'sku-desc');
  });
  for (const row of rows) {
    if (row.isInvoice && !row.out) row.out = row.image;
  }
}

function field(label: string, value: string, multiline: boolean, onInput: (v: string) => void) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  const el = document.createElement(multiline ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
  el.value = value;
  if (multiline) (el as HTMLTextAreaElement).rows = 2;
  else (el as HTMLInputElement).type = 'text';
  el.addEventListener('input', () => onInput(el.value));
  wrap.append(span, el);
  return wrap;
}

function render() {
  const rows = visibleRows();
  grid.replaceChildren();
  results.hidden = rows.length === 0;

  const labelCount = rows.filter((r) => !r.isInvoice).length;
  const invoiceCount = rows.filter((r) => r.isInvoice).length;
  const missing = rows.filter((r) => !r.isInvoice && !r.sku.trim()).length;
  const parts = [`${labelCount} label${labelCount === 1 ? '' : 's'}`, `${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`];
  if (missing) parts.push(`${missing} without a detected SKU`);
  summary.textContent = parts.join(' · ');

  for (const row of rows) {
    const card = document.createElement('article');
    card.className = 'card';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb';
    let img: HTMLImageElement | null = null;
    if (row.out) {
      img = document.createElement('img');
      img.src = row.out;
      img.alt = `${row.isInvoice ? 'Invoice' : 'Label'} page ${row.pageNumber}`;
      thumbWrap.append(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'thumb-placeholder';
      placeholder.textContent = 'Loading invoice…';
      thumbWrap.append(placeholder);
    }

    const head = document.createElement('div');
    head.className = 'card-head';
    const page = document.createElement('span');
    page.className = 'page';
    page.textContent = `${row.isInvoice ? 'Invoice' : 'Label'} · Page ${row.pageNumber}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      state.rows = state.rows.filter((r) => r.id !== row.id);
      refresh(true);
    });
    head.append(page, remove);

    const body = document.createElement('div');
    body.className = 'card-body';
    if (row.isInvoice) {
      const note = document.createElement('p');
      note.className = 'invoice-note';
      note.textContent = 'Original invoice page — exported unchanged.';
      body.append(note);
    } else {
      if (!row.sku.trim()) {
        const warn = document.createElement('p');
        warn.className = 'warn';
        warn.textContent = 'No SKU found — type it in.';
        body.append(warn);
      }
      let timer = 0;
      const update = (patch: Partial<PageData>) => {
        Object.assign(row, patch);
        if (row.items.length) {
          const skus = row.sku.split(',').map((value) => value.trim()).filter(Boolean);
          const descriptions = row.description.split('|').map((value) => value.trim());
          row.items = row.items.map((item, index) => ({
            ...item,
            sku: skus[index] ?? (patch.sku !== undefined && row.items.length === 1 ? row.sku : item.sku),
            description: descriptions[index] ?? (patch.description !== undefined && row.items.length === 1 ? row.description : item.description),
          }));
        }
        window.clearTimeout(timer);
        timer = window.setTimeout(async () => {
          row.out = await composeLabel(row, 'sku-desc');
          if (img) img.src = row.out;
        }, 120);
      };
      body.append(
        field('SKU', row.sku, false, (v) => update({ sku: v })),
        field('Description', row.description, true, (v) => update({ description: v })),
      );
    }

    card.append(thumbWrap, head, body);
    grid.append(card);
  }

  const labels = state.rows.filter((row) => !row.isInvoice);
  const invoices = state.rows.filter((row) => row.isInvoice);
  labelsPdfBtn.disabled = labels.length === 0 || state.busy;
  invoicesPdfBtn.disabled = invoices.length === 0 || state.busy;
  bothPdfBtn.disabled = labels.length === 0 || invoices.length === 0 || state.busy;
  if (rows.length === 0) setStatus('');
  else setStatus(`${rows.length} page${rows.length === 1 ? '' : 's'} ready · 300 dpi`);
}

async function refresh(recompose: boolean) {
  const rows = visibleRows();
  if (recompose) {
    state.busy = true;
    await composeRows(rows);
    state.busy = false;
  }
  render();
}

async function addFiles(files: File[]) {
  if (!files.length || state.busy) return;
  state.busy = true;
  setStatus('Reading PDF preview…');
  try {
    pendingFiles = [];
    pendingPages = [];
    pendingChecked.clear();

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      const buffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(buffer);
      const quickPages = await readPdfQuick(fileBytes, 1);

      pendingFiles.push({
        id: `file-${fIdx}`,
        file,
        data: fileBytes,
        totalPages: quickPages.length,
      });

      for (const qp of quickPages) {
        const id = `f${fIdx}-p${qp.pageIndex}`;
        pendingPages.push({
          id,
          fileIndex: fIdx,
          originalPageIndex: qp.pageIndex,
          pageNumber: qp.pageNumber,
          image: qp.image,
          isInvoice: qp.isInvoice,
          kind: qp.kind,
        });
        pendingChecked.add(id);
      }
    }

    if (!pendingPages.length) {
      state.busy = false;
      setStatus('No pages found in PDF.', 'error');
      return;
    }

    showPicker();
  } catch (error) {
    console.error(error);
    setStatus('Could not read that PDF. Make sure it is an Amazon label file exported as PDF.', 'error');
    state.busy = false;
  }
}

function updatePickerButton() {
  const count = pendingChecked.size;
  pickerRenderBtn.textContent = `Render selected (${count})`;
  pickerRenderBtn.disabled = count === 0;
}

function showPicker() {
  pickerGrid.replaceChildren();

  for (const page of pendingPages) {
    const card = document.createElement('label');
    card.className = 'picker-card';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = pendingChecked.has(page.id);
    cb.addEventListener('change', () => {
      if (cb.checked) pendingChecked.add(page.id);
      else pendingChecked.delete(page.id);
      updatePickerButton();
    });

    const thumb = document.createElement('div');
    thumb.className = 'picker-thumb';
    const img = document.createElement('img');
    img.src = page.image;
    img.alt = `Page ${page.pageNumber}`;
    img.loading = 'lazy';
    thumb.append(img);

    const meta = document.createElement('span');
    meta.className = 'picker-meta';
    const labelKind = page.kind === 'invoice' ? 'Invoice' : page.kind === 'label' ? 'Label' : (page.isInvoice ? 'Invoice' : 'Label');
    meta.textContent = `${labelKind} · Page ${page.pageNumber}`;

    card.append(cb, thumb, meta);
    pickerGrid.append(card);
  }

  updatePickerButton();
  picker.hidden = false;
  state.busy = false;
  setStatus('Select pages to render, or uncheck pages to delete.');
}

async function renderPending() {
  picker.hidden = true;
  if (pendingChecked.size === 0) {
    pendingFiles = [];
    pendingPages = [];
    state.busy = false;
    setStatus('No pages selected.');
    return;
  }

  state.busy = true;
  setStatus('Pruning & rendering pages…');

  try {
    const collected: PageData[] = [];

    for (let fIdx = 0; fIdx < pendingFiles.length; fIdx++) {
      const pFile = pendingFiles[fIdx];
      const keptPages = pendingPages.filter((p) => p.fileIndex === fIdx && pendingChecked.has(p.id));
      const keptIndices = keptPages.map((p) => p.originalPageIndex).sort((a, b) => a - b);

      if (keptIndices.length === 0) continue;

      // PRUNE PDF: Physically delete unselected pages from the PDF so remaining pages are contiguous
      const cleanPdfBytes = await prunePdf(pFile.data, keptIndices);

      // Read and process the clean, pruned PDF in parallel
      const rows = await readPdf(cleanPdfBytes, state.nextPage);
      state.nextPage += rows.length;
      collected.push(...rows);
    }

    pendingFiles = [];
    pendingPages = [];
    pendingChecked.clear();

    if (!collected.length) {
      state.busy = false;
      setStatus('No pages rendered.');
      return;
    }

    const newRows: Row[] = collected.map((p) => ({ ...p, out: '' }));
    state.rows.push(...newRows);

    setStatus('Rendering label overlays…');
    await composeRows(state.rows);

    state.busy = false;
    render();

    const labelCount = state.rows.filter((r) => !r.isInvoice).length;
    const invoiceCount = state.rows.filter((r) => r.isInvoice).length;
    setStatus(`${labelCount} label${labelCount === 1 ? '' : 's'} + ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'} ready · 300 dpi`);
  } catch (error) {
    console.error(error);
    state.busy = false;
    setStatus('Could not render. Make sure it is an Amazon label PDF.', 'error');
  }
}

async function downloadPdf(kind: 'labels' | 'invoices' | 'both') {
  const labels = state.rows.filter((row) => !row.isInvoice);
  const invoices = state.rows.filter((row) => row.isInvoice);
  const rows = kind === 'labels' ? labels : kind === 'invoices' ? invoices : state.rows;
  if (!rows.length) return;
  const button = kind === 'labels' ? labelsPdfBtn : kind === 'invoices' ? invoicesPdfBtn : bothPdfBtn;
  button.disabled = true;
  setStatus('Building PDF…');
  try {
    const blob = await buildPdf(rows, kind === 'invoices' ? 'none' : 'sku-desc');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `amazon-${kind}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    setStatus(`${rows.length} page${rows.length === 1 ? '' : 's'} exported`);
  } finally {
    button.disabled = false;
  }
}

input.addEventListener('change', () => {
  const files = Array.from(input.files ?? []);
  input.value = '';
  void addFiles(files);
});

for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (event) => {
    event.preventDefault();
    drop.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, (event) => {
    event.preventDefault();
    drop.classList.remove('over');
  });
}
drop.addEventListener('drop', (event) => {
  const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  void addFiles(files);
});
drop.addEventListener('click', (event) => {
  if (event.target !== input && !(event.target as HTMLElement).closest('button')) input.click();
});
drop.addEventListener('keydown', (event) => {
  if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') {
    event.preventDefault();
    input.click();
  }
});

labelsPdfBtn.addEventListener('click', () => void downloadPdf('labels'));
invoicesPdfBtn.addEventListener('click', () => void downloadPdf('invoices'));
bothPdfBtn.addEventListener('click', () => void downloadPdf('both'));
pickerRenderBtn.addEventListener('click', () => void renderPending());
pickerCancelBtn.addEventListener('click', () => {
  picker.hidden = true;
  pendingFiles = [];
  pendingPages = [];
  pendingChecked.clear();
  state.busy = false;
  setStatus('Cancelled.');
});
pickerSelectAllBtn.addEventListener('click', () => {
  pendingChecked = new Set(pendingPages.map((p) => p.id));
  pickerGrid.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    cb.checked = true;
  });
  updatePickerButton();
});
pickerDeselectAllBtn.addEventListener('click', () => {
  pendingChecked.clear();
  pickerGrid.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
  updatePickerButton();
});
$('clearBtn').addEventListener('click', () => {
  state.rows = [];
  state.nextPage = 1;
  refresh(false);
});
