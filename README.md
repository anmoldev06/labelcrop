# LabelCrop

LabelCrop is a browser-based utility designed for e-commerce sellers using Amazon Easy Ship and Buy Shipping. It processes shipping labels and tax invoices locally on your machine, cropping labels to standard thermal formats and overlaying product details without transmitting sensitive customer data.

## Why LabelCrop?

Amazon label PDFs usually combine A4 shipping labels, tax invoices, and occasional summary sheets into a single document. Printing these directly on 4x6 thermal printers can be inefficient. LabelCrop solves this workflow locally:

- **Local Execution**: All PDF manipulation and rendering run in the browser through WebAssembly and Web Workers. No files leave your device.
- **Automated Cropping**: Strips margins from shipping labels to fit 4x6 thermal dimensions at 300 DPI.
- **SKU and Description Extraction**: Reads product information from the invoice table and pairs it with the matching label using Amazon Order IDs.
- **Selective Page Exclusion**: Allows deselecting unwanted summary or blank pages prior to final rendering and re-indexes the document.
- **Flexible Export**: Choose between downloading labels with product details, original tax invoices, or both in sequence.

## Architecture

```
├── public/
│   ├── favicon.ico
│   └── samples/
├── src/
│   ├── pages/
│   │   └── index.astro
│   ├── styles/
│   │   └── app.css
│   └── lib/
│       ├── amazon-parser.mjs   # Text extraction and noise filtering
│       ├── labels.ts           # PDF page parsing, classification, and pruning
│       ├── compose.ts          # Preview canvas rendering and PDF overlay
│       └── app.ts              # Browser state and event handling
├── test/
│   └── amazon-parser.test.mjs  # Parser verification tests
├── astro.config.mjs
└── package.json
```

## Setup and Commands

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run local development**:
   ```bash
   npm run dev
   ```

3. **Run tests**:
   ```bash
   npm test
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```
