// Generates a realistic Amazon Easy Ship style label PDF for local testing.
// Run: node scripts/make-sample-labels.mjs
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/samples/sample-labels.pdf');

const doc = await PDFDocument.create();
const helv = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const ink = rgb(0, 0, 0);
const grey = rgb(0.45, 0.45, 0.45);

const y = (page, top) => page.getHeight() - top;

function line(page, str, x, top, size = 9, font = helv, color = ink) {
  page.drawText(str, { x, y: y(page, top), size, font, color });
}

function box(page, x, top, w, h, width = 1, color = ink) {
  page.drawRectangle({ x, y: y(page, top + h), width: w, height: h, borderColor: color, borderWidth: width });
}

function barcode(page, x, top, w, h) {
  let cursor = x;
  let i = 0;
  while (cursor < x + w - 2) {
    const bar = 1 + (i * 7) % 3;
    page.drawRectangle({ x: cursor, y: y(page, top + h), width: bar, height: h, color: ink });
    cursor += bar + 2 + (i % 4);
    i++;
  }
}

/** Amazon Easy Ship label page: label artwork in the top half, blank paper below. */
function a4Label(order) {
  const page = doc.addPage([595.28, 841.89]);
  box(page, 28, 28, 539, 330, 1.2);

  line(page, 'amazon', 44, 62, 18, bold);
  line(page, 'Easy Ship', 44, 78, 11, helv);
  line(page, `Order ID: ${order.orderId}`, 44, 100, 10, bold);
  line(page, 'Ship to:', 44, 122, 8, bold, grey);
  line(page, order.customer, 44, 136, 11, bold);
  line(page, order.address1, 44, 152, 9);
  line(page, order.address2, 44, 166, 9);
  line(page, `Phone: ${order.phone}`, 44, 182, 9);

  barcode(page, 44, 220, 250, 60);
  line(page, `AWB: ${order.awb}`, 44, 294, 9, bold);

  line(page, 'Ship from:', 330, 122, 8, bold, grey);
  line(page, 'AP Electro Parts', 330, 136, 10, bold);
  line(page, 'Plot 12, Industrial Estate', 330, 150, 9);
  line(page, 'Pune, MH 411018', 330, 164, 9);

  // Item row, Amazon style: "Title (SKU) (Qty: n)"
  const item = order.items[0];
  line(page, `${item.title} (${item.sku}) (Qty: ${item.qty})`, 44, 320, 9.5);
  if (order.items[1]) {
    const second = order.items[1];
    line(page, `${second.title} (${second.sku}) (Qty: ${second.qty})`, 44, 336, 9.5);
  }
  line(page, `Order date: ${order.date}`, 330, 320, 9);
  return page;
}

function a4Invoice(order) {
  const page = doc.addPage([595.28, 841.89]);
  line(page, 'Tax Invoice', 44, 60, 16, bold);
  line(page, 'AP Electro Parts · GSTIN 27ABCDE1234F1Z5', 44, 78, 8.5, helv, grey);
  line(page, `Invoice No: INV-${order.orderId.slice(-6)}`, 44, 110, 9.5);
  line(page, `Order ID: ${order.orderId}`, 44, 124, 9.5);
  line(page, 'Bill to', 44, 152, 8.5, bold, grey);
  line(page, order.customer, 44, 166, 10, bold);
  line(page, order.address1, 44, 180, 9);
  line(page, order.address2, 44, 194, 9);

  let top = 240;
  line(page, 'Description', 44, top, 9, bold);
  line(page, 'HSN', 330, top, 9, bold);
  line(page, 'Qty', 400, top, 9, bold);
  line(page, 'Amount', 460, top, 9, bold);
  page.drawLine({ start: { x: 44, y: y(page, top + 6) }, end: { x: 550, y: y(page, top + 6) }, thickness: 0.8 });

  const perPage = 12;
  order.items.slice(0, perPage).forEach((item, index) => {
    const rowTop = top + 24 + index * 26;
    for (const [text, x] of [
      [item.title, 44],
      ['3926', 330],
      [String(item.qty), 400],
      [`${item.amount}`, 460],
    ]) {
      const clipped = text.length > 46 ? `${text.slice(0, 46)}…` : text;
      line(page, clipped, x, rowTop, 8.5);
    }
  });
  line(page, 'Total', 400, top + 24 + perPage * 26 + 20, 9, bold);
  return page;
}

/** 4x6 thermal label that fills the whole page. */
function thermalLabel(order) {
  const page = doc.addPage([288, 432]);
  box(page, 8, 8, 272, 416, 1);
  line(page, 'amazon', 20, 36, 14, bold);
  line(page, `Order ID: ${order.orderId}`, 20, 56, 7.5, bold);
  line(page, 'Ship to:', 20, 74, 7, bold, grey);
  line(page, order.customer, 20, 86, 8.5, bold);
  line(page, order.address1, 20, 98, 7.5);
  line(page, order.address2, 20, 110, 7.5);
  barcode(page, 20, 150, 240, 52);
  line(page, `AWB: ${order.awb}`, 20, 218, 7.5, bold);
  line(page, `${order.items[0].title} (${order.items[0].sku}) (Qty: ${order.items[0].qty})`, 20, 300, 7.5);
  return page;
}

const orders = [
  {
    orderId: '408-1122334-5566771',
    awb: 'AWB7745182934',
    date: '27 Oct 2026',
    customer: 'Rohit Sharma',
    address1: 'B-704, Sunshine Residency, Andheri East',
    address2: 'Mumbai, MH 400069',
    phone: '+91 98200 11223',
    items: [
      {
        title: 'Premium Silicone Rubber Gasket Seal for Refrigerator Door, 4 Feet Length, Black',
        sku: 'GSK-FRIDGE-4FT-BLK',
        qty: 2,
        amount: '748.00',
      },
    ],
  },
  {
    orderId: '408-9988776-1122334',
    awb: 'AWB7745182941',
    date: '27 Oct 2026',
    customer: 'Neha Verma',
    address1: 'Flat 21, Green Meadows, Sector 44',
    address2: 'Gurugram, HR 122003',
    phone: '+91 98110 44556',
    items: [
      { title: 'Washing Machine Inlet Hose 1.5m', sku: 'WM-HOSE-15M', qty: 1, amount: '399.00' },
      { title: 'Drain Pipe Extension', sku: 'WM-DRAIN-EXT', qty: 1, amount: '249.00' },
    ],
  },
  {
    orderId: '408-5544332-7788990',
    awb: 'AWB7745182958',
    date: '27 Oct 2026',
    customer: 'Arjun Nair',
    address1: '22/5, Lake View Road, Kakkanad',
    address2: 'Kochi, KL 682030',
    phone: '+91 90000 77881',
    items: [
      {
        title: 'Universal Refrigerator Door Gasket Magnetic Strip Cut-to-Size 3 Metre',
        sku: 'GSK-UNIV-3M',
        qty: 1,
        amount: '899.00',
      },
    ],
  },
];

// Cover page, then label + invoice pairs (invoice pages carry no item/SKU text).
const cover = doc.addPage([595.28, 841.89]);
line(cover, 'Amazon Easy Ship — Shipping Labels', 44, 80, 16, bold);
line(cover, 'Generated for testing. 3 orders, 7 pages.', 44, 104, 10, helv, grey);

for (const order of orders) {
  a4Label(order);
  a4Invoice(order);
}
thermalLabel(orders[0]);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await doc.save());
console.log(`wrote ${out}`);
