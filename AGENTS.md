# AGENTS.md — LabelCrop

Astro static site (no framework). All processing runs in the browser; nothing is uploaded.

## Commands

- Dev server: `npm run dev` (http://localhost:4321)
- Build: `npm run build` → `dist/`
- Tests: `npm test` (node --test test/*.test.mjs)
- Single test file: `node --test test/amazon-parser.test.mjs`
- Filter tests: `node --test --test-name-pattern="<substring>" test/*.test.mjs`

PowerShell blocks `.ps1` scripts on this machine; invoke CLIs via `cmd /c "..."` (e.g. `cmd /c "wrangler ..."`).

## Deploy (Cloudflare Pages)

Project `labelcrop` already exists. Build first, then:

```
cmd /c "wrangler pages deploy dist --project-name labelcrop --commit-dirty=true"
```

## Structure

- `src/pages/index.astro` — page markup
- `src/styles/app.css` — all styles
- `src/lib/app.ts` — UI wiring, state, download filtering
- `src/lib/labels.ts` — PDF parsing, page classification, preview rendering, `readPdf`, `hydratePreviews`
- `src/lib/compose.ts` — `composeLabel`, `buildPdf` (PDF-native overlay via pdf-lib)
- `src/lib/amazon-parser.mjs` — Amazon invoice SKU/ASIN/description extraction
- `test/amazon-parser.test.mjs` — parser regression tests (only test suite)

## Key invariants

- Labels always export with SKU + description (`buildPdf(..., 'sku-desc')`); invoices export unchanged (`'none'`).
- Download buttons: `labelsPdfBtn`, `invoicesPdfBtn`, `bothPdfBtn`. `buildPdf(rows, mode)`.
- Invoice pages are detected in `readPdf` via invoice keywords; `sourcePageIndex` is 0-based.
- `visibleRows()` returns all rows; invoice cards skip SKU/description inputs.
- Upload flow: `readPdf` → page-selector popup (`showPicker`) → `renderPending` → `refresh` + invoice hydration.
- `composeRows` only composes labels; invoices keep `row.out = row.image`.
- Print CSS lives in `app.css` (`@media print`); `printRoot` removed — downloads only.

## Quirks

- No git repo in this project.
- Astro typechecks on build (`npm run build`); there is no separate typecheck script.
- `icon.ico` is copied to `public/favicon.ico` for the favicon; keep both in sync if the icon changes.
- The sample PDF at `public/samples/sample-labels.pdf` is optional; the "Try a sample" button was removed.
- PDF.js preview resolution: labels 1800px, invoices 320px (readPdf).