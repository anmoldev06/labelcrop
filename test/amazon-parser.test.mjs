import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAmazonItems } from '../src/lib/amazon-parser.mjs';

test('extracts SKU and description from Amazon item-description text', () => {
  const result = extractAmazonItems([
    'Ship To Rohit Sharma',
    'Premium Silicone Rubber Gasket Seal for Refrigerator Door',
    '(GSK-FRIDGE-4FT-BLK) (Qty: 2)',
    'Order ID: 408-1122334-5566771',
  ]);

  assert.deepEqual(result, [{
    sku: 'GSK-FRIDGE-4FT-BLK',
    description: 'Premium Silicone Rubber Gasket Seal for Refrigerator Door',
    qty: 2,
  }]);
});

test('handles separate Seller SKU and description rows', () => {
  const result = extractAmazonItems([
    'Item Description: Universal Refrigerator Door Gasket Magnetic Strip',
    'Seller SKU: GSK-UNIV-3M',
    'Qty: 1',
  ]);

  assert.deepEqual(result, [{
    sku: 'GSK-UNIV-3M',
    description: 'Universal Refrigerator Door Gasket Magnetic Strip',
    qty: 1,
  }]);
});

test('does not classify invoice text as a label item without a SKU', () => {
  assert.deepEqual(extractAmazonItems([
    'Tax Invoice',
    'Description HSN Qty Amount',
    'GSTIN 27ABCDE1234F1Z5',
  ]), []);
});

test('extracts the Amazon invoice format used by the supplied label PDF', () => {
  assert.deepEqual(extractAmazonItems([
    '1 Heavy Duty (Black Colour) Door Handle Spring Set, 2 Pieces, for',
    'Modular Door Locks and Flush Handles | B0H876TBN6 (',
    '₹241.53 1 ₹241.53 18% IGST ₹43.47 ₹285.00',
    'BU-N03H-MPYE )',
    'HSN:8302',
  ]), [{
    asin: 'B0H876TBN6',
    sku: 'BU-N03H-MPYE',
    description: 'Heavy Duty (Black Colour) Door Handle Spring Set, 2 Pieces, for Modular Door Locks and Flush Handles',
    qty: 1,
  }]);
});

test('extracts invoices where the ASIN and SKU are on a separate row', () => {
  assert.deepEqual(extractAmazonItems([
    '1 Refrigerator Door Gasket Compatible with Samsung 190 Litre |',
    'Replacement Door Seal | 20 x 43 IN. | Measure Before Ordering |',
    'B0HDLY26FG ( XZ-1EQK-CUIK )',
    'HSN:8418',
    '₹1,080.51 1 ₹1,080.51 18% IGST ₹194.49 ₹1,275.00',
  ]), [{
    asin: 'B0HDLY26FG',
    sku: 'XZ-1EQK-CUIK',
    description: 'Refrigerator Door Gasket Compatible with Samsung 190 Litre | Replacement Door Seal | 20 x 43 IN. | Measure Before Ordering |',
    qty: 1,
  }]);
});

test('keeps descriptions when Amazon places the price row before the ASIN', () => {
  assert.deepEqual(extractAmazonItems([
    '1 Refrigerator Door Gasket Compatible with Whirlpool 215 Litre |',
    'Replacement Door Seal | 50 x 123 cm. | Measure Before Ordering',
    '₹1,258.47 1 ₹1,258.47 18% IGST ₹226.53 ₹1,485.00',
    '| B0HDLH4DM2 ( 8V-NNP9-EGQA )',
    'HSN:8418',
  ]), [{
    asin: 'B0HDLH4DM2',
    sku: '8V-NNP9-EGQA',
    description: 'Refrigerator Door Gasket Compatible with Whirlpool 215 Litre | Replacement Door Seal | 50 x 123 cm. | Measure Before Ordering |',
    qty: 1,
  }]);
});

test('ignores table header fragments like No Amount Rate Type Amount Amount and strips leading serial number', () => {
  assert.deepEqual(extractAmazonItems([
    'Sl. Description Unit Net Tax Tax Tax Total',
    'No Amount Rate Type Amount Amount',
    '1 Kitchen Storage Container Jar Set of 6 | B0XYZ12345 (',
    '₹499.00 1 ₹499.00 18% IGST ₹89.82 ₹588.82',
    'JAR-SET-6PCS )',
    'HSN:3924',
  ]), [{
    asin: 'B0XYZ12345',
    sku: 'JAR-SET-6PCS',
    description: 'Kitchen Storage Container Jar Set of 6',
    qty: 1,
  }]);
});
