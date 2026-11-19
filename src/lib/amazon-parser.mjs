const clean = (value) => value.replace(/\s+/g, ' ').replace(/^[\s:–—-]+|[\s:–—-]+$/g, '').trim();

export function cleanDescription(value) {
  let text = clean(value);
  // Remove table header split leftovers like "No Amount Rate Type Amount Amount"
  text = text.replace(/^(?:no\s+amount\s+rate[\w\s]*|description\s+qty[\w\s]*|sl\.?\s*no\.?[\w\s]*)\s*/i, '');
  // Remove leading row serial number (e.g. "1 ", "1. ", "01 ")
  text = text.replace(/^\d+[\s.)-]+\s*/, '');
  return clean(text);
}

const ASIN = /B[A-Z0-9]{9}/;

function isNoise(line) {
  return /^(ship to|ship from|order id|awb|invoice|tax invoice|gstin|hsn|sold by|bill to|date|amazon|easy ship|delivery|return|weight|dimension|sl\.|no price|amount in words|for .*:|authorized signatory|whether tax|payment transaction|total:|\*|customers desirous|please note|page \d|no\s+amount\b|rate\s+type\b|unit\s+price|tax\s+rate|net\s+amount|tax\s+type|tax\s+amount|total\s+amount)/i.test(line);
}

function isPriceLine(line) {
  return /₹/.test(line);
}

export function extractAmazonItems(input) {
  const lines = input.map((line) => clean(String(line))).filter(Boolean);
  const items = [];

  // Format A: "Title (SKU) (Qty: n)" on one line (description must be non-empty).
  const ITEM_ROW = /^(.+?)\(\s*([A-Za-z0-9][A-Za-z0-9_. /-]{0,119}?)\s*\)\s*\(\s*(?:Qty|QTY)\s*[:.]?\s*(\d+)\s*\)/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ITEM_ROW);
    if (m && clean(m[1])) items.push({ description: cleanDescription(m[1]), sku: clean(m[2]), qty: Number(m[3]) || 1 });
  }
  if (items.length) return items;

  // Format A2: description on previous line(s), then "(SKU) (Qty: n)" on its own line.
  let pendingDescription = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const suffix = line.match(/^\(\s*([A-Za-z0-9][A-Za-z0-9_. /-]{0,119}?)\s*\)\s*\(\s*(?:Qty|QTY)\s*[:.]?\s*(\d+)\s*\)/i);
    if (suffix && pendingDescription) {
      items.push({ description: cleanDescription(pendingDescription), sku: clean(suffix[1]), qty: Number(suffix[2]) || 1 });
      pendingDescription = '';
      continue;
    }
    const descRow = line.match(/^(?:item\s+)?description\s*[:#-]?\s*(.+)$/i);
    if (descRow) { pendingDescription = descRow[1]; continue; }
    const skuRow = line.match(/^(?:seller\s+)?SKU(?:\s*ID)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9_. /-]{0,119})$/i);
    if (skuRow) {
      const qtyMatch = lines[i + 1]?.match(/(?:Qty|QTY)\s*[:.]?\s*(\d+)/i);
      items.push({ description: cleanDescription(pendingDescription), sku: clean(skuRow[1]), qty: qtyMatch ? Number(qtyMatch[1]) : 1 });
      pendingDescription = '';
      i++;
      continue;
    }
    if (!isNoise(line) && !isPriceLine(line)) pendingDescription = pendingDescription ? pendingDescription + ' ' + line : line;
    else pendingDescription = '';
  }
  if (items.length) return items;

  // Format B0: Amazon sometimes puts the price row before the ASIN/SKU row.
  // Walk backward from the ASIN so the price row does not erase the product
  // description.
  for (let i = 0; i < lines.length; i++) {
    const asinMatch = lines[i].match(ASIN);
    if (!asinMatch) continue;
    const parens = [...lines[i].matchAll(/\(\s*([A-Za-z0-9][A-Za-z0-9_. /-]{0,119}?)\s*\)/g)];
    let sku = parens.length ? clean(parens.at(-1)[1]) : '';
    if (!sku) {
      const closing = lines[i].match(/^([A-Za-z0-9][A-Za-z0-9_. /-]{0,119}?)\s*\)$/);
      if (closing) sku = clean(closing[1]);
    }
    if (!sku) continue;

    const beforeAsin = lines[i].slice(0, asinMatch.index).replace(/[|]+$/g, '').trim();
    const descriptionParts = beforeAsin ? [beforeAsin] : [];
    for (let j = i - 1; j >= 0 && descriptionParts.length < 6; j--) {
      const candidate = lines[j];
      if (/^description\b|^description qty\b|^sl\.?\s*no\b|^no\s+amount\b/i.test(candidate)) break;
      if (isPriceLine(candidate)) continue;
      if (isNoise(candidate)) break;
      descriptionParts.unshift(candidate);
    }
    const priceLine = lines.slice(Math.max(0, i - 3), i + 3).find(isPriceLine);
    const qtyMatch = priceLine?.match(/₹[\d,]+\.\d{2}\s+(\d+)\s+₹/);
    items.push({
      description: cleanDescription(descriptionParts.join(' ').replace(/\s*\|\s*/g, ' | ')),
      sku,
      qty: qtyMatch ? Number(qtyMatch[1]) || 1 : 1,
      asin: asinMatch[0],
    });
  }
  if (items.length) return items;

  // Format B: Amazon invoice. Description spans lines until a line containing "| ASIN (",
  // then SKU appears in parentheses on the following non-price line.
  let descriptionLines = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const pipeIndex = line.indexOf('|');
    const asinMatch = line.match(ASIN);

    if (asinMatch) {
      const beforePipe = pipeIndex >= 0
        ? line.slice(0, pipeIndex)
        : line.slice(0, asinMatch.index);
      const description = cleanDescription([...descriptionLines, beforePipe].join(' '));
      const asin = asinMatch[0];

      let sku = '';
      const inlineParens = [...line.matchAll(/\(\s*([A-Za-z0-9][A-Za-z0-9_. /-]{0,119}?)\s*\)/g)];
      if (inlineParens.length) sku = clean(inlineParens.at(-1)[1]);
      let j = i + 1;
      while (j < lines.length && !sku) {
        const candidate = lines[j];
        const paren = candidate.match(/\(\s*([A-Za-z0-9][A-Za-z0-9_. /-]{0,119}?)\s*\)/);
        const closing = candidate.match(/^([A-Za-z0-9][A-Za-z0-9_. /-]{0,119}?)\s*\)$/);
        if (paren) sku = clean(paren[1]);
        else if (closing) sku = clean(closing[1]);
        if (sku) { j++; break; }
        if (isPriceLine(candidate) || isNoise(candidate)) { j++; continue; }
        j++;
        if (j - i > 4) break;
      }

      let qty = 1;
      const priceLine = lines.slice(i, i + 3).find(isPriceLine);
      if (priceLine) {
        const qtyMatch = priceLine.match(/₹[\d,]+\.\d{2}\s+(\d+)\s+₹/);
        if (qtyMatch) qty = Number(qtyMatch[1]) || 1;
      }

      if (sku) items.push({ description, sku, qty, asin });

      descriptionLines = [];
      i = j;
      continue;
    }

    if (!isNoise(line) && !isPriceLine(line)) {
      if (/^sl\.|^no price|^hsn:|^no\s+amount\b/i.test(line)) descriptionLines = [];
      else descriptionLines.push(line);
    } else {
      descriptionLines = [];
    }
    i++;
  }

  return items;
}
