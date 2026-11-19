# 🏷️ LabelCrop

**Fast, in-browser Amazon shipping label cropper and thermal printing tool.**  
*Crop Amazon Easy Ship and Buy Shipping labels, pair SKU and item descriptions from tax invoices, and export 4x6 thermal PDFs — 100% locally on your machine.*

[Live Application Demo](https://labelcrop-16p.pages.dev) • [Key Features](#key-features) • [Workflow](#workflow-overview) • [Project Structure](#project-structure) • [Local Setup](#local-setup)

---

## Overview

Amazon seller downloads bundle multi-order shipments into A4 PDF files with mixed shipping labels, tax invoices, and occasional summary pages. Preparing these files for 4x6 thermal label printers typically involves repetitive manual cropping and copying SKUs.

**LabelCrop** automates this workflow directly inside your browser:

- **100% In-Browser Privacy**: Documents are parsed locally via WebAssembly and Web Workers. No files or order details ever leave your device.
- **Auto-Cropped Labels**: Detects content boundaries and trims excess margins for 4x6 inch thermal labels at 300 DPI.
- **Automated SKU and Description Pairing**: Matches invoices to labels using Amazon Order IDs and overlays item details cleanly at the base of each label.
- **Physical Page Pruning**: Uncheck extra cover sheets or cancelled orders in the page picker; LabelCrop cleanly excises them from the document structure so the pairing stays synchronized.
- **Native Vector Export**: Downloaded PDFs use vector operations from `pdf-lib` instead of rasterized images, ensuring sharp barcode edges for thermal barcode scanners.

---

## Key Features

- **Local-First Security**: Zero server uploads, zero remote logging, and zero data leakage risks.
- **Accurate Document Matching**: Pairs labels and invoices via Amazon Order ID detection (`\d{3}-\d{7}-\d{7}`) with sequential fallback.
- **Header and Number Filtering**: Removes invoice table artifacts (such as `"No Amount Rate Type Amount Amount"`) and leading row numbers (`1 `, `01 `) from product titles.
- **Multi-Core Parallel Rendering**: Processes pages concurrently using browser worker pools for responsive previewing of large PDF files.
- **Three Download Modes**:
  - **Labels Only**: Thermal-ready 4x6 labels with product title and SKU overlay.
  - **Invoices Only**: Original untouched invoice pages for tax and bookkeeping records.
  - **Download Both**: Combined alternating sequence of labels and invoices.

---

## Workflow Overview

```
[ Upload Amazon PDF ]
        │
        ▼
[ Parallel Page Thumbnails & Type Classification ]
        │
        ▼
[ Page Selector Modal: Exclude Unwanted Sheets ]
        │
        ▼
[ Clean Document Pruning via pdf-lib ]
        │
        ▼
[ Extract Order IDs, ASINs, SKUs & Descriptions ]
        │
        ▼
[ Pair Invoices with Matching Shipping Labels ]
        │
        ▼
[ Vector-Native PDF Assembly ]
        │
 ┌──────┴──────────────────────┬──────────────────────┐
 ▼                             ▼                      ▼
[ Labels with SKU Overlay ]   [ Invoices Only ]      [ Combined Sequence ]
```

---

## Project Structure

```
labelcrop/
├── public/
│   ├── favicon.ico           # Web icon
│   └── samples/              # Test sample label documents
├── src/
│   ├── pages/
│   │   └── index.astro       # User interface and modal dialogs
│   ├── styles/
│   │   └── app.css           # Modern styles and thermal print media rules
│   └── lib/
│       ├── amazon-parser.mjs # Invoice text parsing and noise cleaning
│       ├── labels.ts         # PDF parsing, worker thumbnailing, and pruning
│       ├── compose.ts        # Canvas label compositing and vector PDF creation
│       └── app.ts            # Client state management and user actions
├── test/
│   └── amazon-parser.test.mjs# Test suite for Amazon invoice parser
├── astro.config.mjs          # Astro bundler settings
└── package.json
```

---

## Tech Stack

- **Astro**: Static frontend architecture and asset bundling.
- **pdf-lib**: In-memory vector PDF manipulation, page pruning, and text overlays.
- **pdfjs-dist**: PDF parsing, text stream extraction, and fast canvas preview generation.
- **Cloudflare Pages**: Global static hosting.

---

## Local Setup

### Prerequisites

- Node.js (version 18 or newer)
- npm

### Installation & Run

1. **Clone the repository**:
   ```bash
   git clone https://github.com/anmoldev06/labelcrop.git
   cd labelcrop
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:4321` in your browser.

4. **Run parser tests**:
   ```bash
   npm test
   ```

5. **Build production files**:
   ```bash
   npm run build
   ```

---

## License

This project is open-source under the MIT License.
