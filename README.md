# LabelCrop

LabelCrop is an in-browser utility for cropping Amazon Easy Ship shipping labels and pairing product SKU and descriptions from invoices onto thermal label pages.

## Features

- Runs entirely in the client browser using WebAssembly.
- Crops label margins for 4x6 thermal label printing.
- Automatically pairs SKU and item descriptions to labels.
- Allows excluding extra or unneeded pages before processing.
- Supports downloading cropped labels, original invoices, or both.

## Getting Started

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Start the development server with `npm run dev`.
4. Run tests with `npm test`.
5. Build static files using `npm run build`.
