/**
 * Renders structured embedded stamps into SVG (viewport) and pdf-lib (PDF export).
 */
import { SHOP_REVIEW_LINES } from './stamps.js';

export function drawStampSvg(g, pos, stamp, zoom, createSvg) {
  const color = stamp.color || '#90472D';
  if (stamp.kind === 'badge') {
    const box = createSvg('g', { transform: `translate(${pos.x}, ${pos.y}) rotate(-8)` });
    const txt = stamp.id || stamp.label;
    const w = (txt.length * 9 + 20) * zoom;
    const h = 26 * zoom;
    box.appendChild(createSvg('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 4, fill: 'none', stroke: color, 'stroke-width': 2.5 }));
    const t = createSvg('text', { x: 0, y: 4 * zoom, 'text-anchor': 'middle', fill: color, 'font-size': 12 * zoom, 'font-weight': '700' });
    t.textContent = txt;
    box.appendChild(t);
    g.appendChild(box);
    return;
  }

  const box = createSvg('g', { transform: `translate(${pos.x}, ${pos.y}) scale(${zoom})` });

  if (stamp.kind === 'text_block') {
    let y = 0;
    for (const line of stamp.lines || []) {
      const sz = line.size || 12;
      const t = createSvg('text', {
        x: 0, y,
        'text-anchor': stamp.center ? 'middle' : 'start',
        fill: line.color || color,
        'font-size': sz,
        'font-weight': line.bold ? '700' : '400',
      });
      t.textContent = line.text;
      box.appendChild(t);
      y += sz * 1.28;
    }
    g.appendChild(box);
    return;
  }

  if (stamp.kind === 'company_block') {
    drawCompanyBlockSvg(box, color, createSvg);
  } else if (stamp.kind === 'shop_review') {
    drawShopReviewSvg(box, stamp.checked, color, createSvg);
  }
  g.appendChild(box);
}

function drawCompanyBlockSvg(box, color, createSvg) {
  box.appendChild(createSvg('rect', { x: 0, y: 0, width: 240, height: 175, fill: '#fff', 'fill-opacity': '0.92', stroke: color, 'stroke-width': 2 }));
  box.appendChild(createSvg('rect', { x: 3, y: 3, width: 234, height: 169, fill: 'none', stroke: color, 'stroke-width': 0.8 }));
  box.appendChild(createSvg('rect', { x: 170, y: 6, width: 62, height: 48, fill: 'none', stroke: color, 'stroke-width': 0.8 }));
  addSvgText(box, 12, 20, 'COMPANY NAME', 11, color, true, createSvg);
  addSvgText(box, 201, 27, 'COMPANY', 7, color, true, createSvg, 'middle');
  addSvgText(box, 201, 36, 'LOGO', 7, color, true, createSvg, 'middle');
  const opts = ['APPROVED', 'APPROVED AS CORRECTED', 'REVISE AND RESUBMIT', 'REJECTED', 'FOR INFORMATION ONLY'];
  opts.forEach((lbl, i) => {
    const ry = 32 + i * 14;
    box.appendChild(createSvg('rect', { x: 12, y: ry - 7, width: 8, height: 8, fill: 'none', stroke: color, 'stroke-width': 1.1 }));
    addSvgText(box, 25, ry, lbl, 7.5, color, true, createSvg);
  });
  box.appendChild(createSvg('line', { x1: 12, y1: 105, x2: 228, y2: 105, stroke: color, 'stroke-width': 1 }));
  addSvgText(box, 120, 128, 'DISCLAIMER', 7, color, false, createSvg, 'middle');
  box.appendChild(createSvg('line', { x1: 12, y1: 150, x2: 228, y2: 150, stroke: color, 'stroke-width': 1 }));
  addSvgText(box, 12, 164, 'BY', 7.5, color, true, createSvg);
  addSvgText(box, 130, 164, 'DATE', 7.5, color, true, createSvg);
}

function drawShopReviewSvg(box, checked, color, createSvg) {
  box.appendChild(createSvg('rect', { x: 0, y: 0, width: 250, height: 200, fill: '#fff', 'fill-opacity': '0.94', stroke: color, 'stroke-width': 2.2 }));
  addSvgText(box, 125, 16, 'SHOP DRAWING / SUBMITTAL REVIEW', 10.5, color, true, createSvg, 'middle');
  box.appendChild(createSvg('line', { x1: 10, y1: 21, x2: 240, y2: 21, stroke: color, 'stroke-width': 1.2 }));

  const boxes = [
    { key: 'NO_EX', label: 'NO EXCEPTIONS TAKEN', x: 12, y: 34 },
    { key: 'FURNISH', label: 'FURNISH W/ CHANGES NOTED', x: 125, y: 34 },
    { key: 'REJECTED', label: 'REJECTED', x: 12, y: 48 },
    { key: 'REVISE', label: 'REVISE AND RESUBMIT', x: 125, y: 48 },
  ];
  for (const b of boxes) {
    box.appendChild(createSvg('rect', { x: b.x, y: b.y - 7, width: 8, height: 8, fill: 'none', stroke: color, 'stroke-width': 1.2 }));
    if (b.key === checked) {
      addSvgText(box, b.x + 1.5, b.y, 'X', 7.5, '#111', true, createSvg);
    }
    addSvgText(box, b.x + 12, b.y, b.label, 6.8, color, false, createSvg);
  }

  SHOP_REVIEW_LINES.forEach((ln, idx) => {
    addSvgText(box, 10, 66 + idx * 8.8, ln, 6.5, color, false, createSvg);
  });

  box.appendChild(createSvg('line', { x1: 10, y1: 174, x2: 145, y2: 174, stroke: color, 'stroke-width': 1.2 }));
  box.appendChild(createSvg('line', { x1: 155, y1: 174, x2: 240, y2: 174, stroke: color, 'stroke-width': 1.2 }));
  addSvgText(box, 10, 186, 'Signed', 8, color, false, createSvg);
  addSvgText(box, 155, 186, 'Date', 8, color, false, createSvg);
}

function addSvgText(parent, x, y, text, size, fill, bold, createSvg, anchor = 'start') {
  const t = createSvg('text', { x, y, fill, 'font-size': size, 'font-weight': bold ? '700' : '400', 'text-anchor': anchor });
  t.textContent = text;
  parent.appendChild(t);
}

export function drawStampPdf(page, pt, stamp, font, rgbFn, hexToRgbFn) {
  const { height } = page.getSize();
  const toY = (y) => height - y;
  const color = hexToRgbFn(stamp.color || '#90472D', rgbFn);

  if (stamp.kind === 'badge') {
    const txt = stamp.id || stamp.label;
    const w = txt.length * 8 + 18;
    page.drawRectangle({ x: pt.x - w / 2, y: toY(pt.y) - 12, width: w, height: 24, borderColor: color, borderWidth: 2 });
    page.drawText(txt, { x: pt.x - w / 2 + 9, y: toY(pt.y) - 4, size: 11, font, color });
    return;
  }

  if (stamp.kind === 'text_block') {
    let dy = 0;
    for (const line of stamp.lines || []) {
      const sz = line.size || 12;
      const c = line.color ? hexToRgbFn(line.color, rgbFn) : color;
      const safe = String(line.text || '').replace(/[^\x20-\x7E]/g, '');
      const x = stamp.center ? pt.x - (safe.length * sz * 0.27) : pt.x;
      if (safe) page.drawText(safe, { x, y: toY(pt.y + dy), size: sz, font, color: c });
      dy += sz * 1.28;
    }
    return;
  }

  if (stamp.kind === 'company_block') {
    page.drawRectangle({ x: pt.x, y: toY(pt.y + 175), width: 240, height: 175, borderColor: color, borderWidth: 2 });
    page.drawRectangle({ x: pt.x + 170, y: toY(pt.y + 54), width: 62, height: 48, borderColor: color, borderWidth: 0.8 });
    page.drawText('COMPANY NAME', { x: pt.x + 12, y: toY(pt.y + 20), size: 11, font, color });
    const opts = ['APPROVED', 'APPROVED AS CORRECTED', 'REVISE AND RESUBMIT', 'REJECTED', 'FOR INFORMATION ONLY'];
    opts.forEach((lbl, i) => {
      const ry = pt.y + 32 + i * 14;
      page.drawRectangle({ x: pt.x + 12, y: toY(ry + 1), width: 8, height: 8, borderColor: color, borderWidth: 1 });
      page.drawText(lbl, { x: pt.x + 25, y: toY(ry), size: 7.5, font, color });
    });
    page.drawLine({ start: { x: pt.x + 12, y: toY(pt.y + 105) }, end: { x: pt.x + 228, y: toY(pt.y + 105) }, thickness: 1, color });
    page.drawText('DISCLAIMER', { x: pt.x + 95, y: toY(pt.y + 128), size: 7, font, color });
    page.drawLine({ start: { x: pt.x + 12, y: toY(pt.y + 150) }, end: { x: pt.x + 228, y: toY(pt.y + 150) }, thickness: 1, color });
    page.drawText('BY', { x: pt.x + 12, y: toY(pt.y + 164), size: 7.5, font, color });
    page.drawText('DATE', { x: pt.x + 130, y: toY(pt.y + 164), size: 7.5, font, color });
    return;
  }

  if (stamp.kind === 'shop_review') {
    page.drawRectangle({ x: pt.x, y: toY(pt.y + 200), width: 250, height: 200, borderColor: color, borderWidth: 2 });
    page.drawText('SHOP DRAWING / SUBMITTAL REVIEW', { x: pt.x + 25, y: toY(pt.y + 16), size: 10.5, font, color });
    page.drawLine({ start: { x: pt.x + 10, y: toY(pt.y + 21) }, end: { x: pt.x + 240, y: toY(pt.y + 21) }, thickness: 1.2, color });
    const boxes = [
      { key: 'NO_EX', label: 'NO EXCEPTIONS TAKEN', x: 12, y: 34 },
      { key: 'FURNISH', label: 'FURNISH W/ CHANGES NOTED', x: 125, y: 34 },
      { key: 'REJECTED', label: 'REJECTED', x: 12, y: 48 },
      { key: 'REVISE', label: 'REVISE AND RESUBMIT', x: 125, y: 48 },
    ];
    for (const b of boxes) {
      page.drawRectangle({ x: pt.x + b.x, y: toY(pt.y + b.y + 1), width: 8, height: 8, borderColor: color, borderWidth: 1.2 });
      if (b.key === stamp.checked) page.drawText('X', { x: pt.x + b.x + 1.5, y: toY(pt.y + b.y), size: 7.5, font, color: rgbFn(0, 0, 0) });
      page.drawText(b.label, { x: pt.x + b.x + 12, y: toY(pt.y + b.y), size: 6.8, font, color });
    }
    SHOP_REVIEW_LINES.forEach((ln, idx) => {
      page.drawText(ln, { x: pt.x + 10, y: toY(pt.y + 66 + idx * 8.8), size: 6.5, font, color });
    });
    page.drawLine({ start: { x: pt.x + 10, y: toY(pt.y + 174) }, end: { x: pt.x + 145, y: toY(pt.y + 174) }, thickness: 1.2, color });
    page.drawLine({ start: { x: pt.x + 155, y: toY(pt.y + 174) }, end: { x: pt.x + 240, y: toY(pt.y + 174) }, thickness: 1.2, color });
    page.drawText('Signed', { x: pt.x + 10, y: toY(pt.y + 186), size: 8, font, color });
    page.drawText('Date', { x: pt.x + 155, y: toY(pt.y + 186), size: 8, font, color });
  }
}
