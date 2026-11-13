/**
 * SVG markup renderer for the interactive overlay.
 */
import {
  distPt, polylineLength, polygonPerimeter, polygonArea,
  formatLength, formatArea, buildRevisionCloudPath,
} from './geometry.js';
import { drawStampSvg } from './stamp-renderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSvg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== '') el.setAttribute(k, String(v));
  }
  return el;
}

export function drawMarkupSvg(svgEl, m, toScreen, state, isSelected, isDraft = false) {
  const pts = m.points.map(toScreen);
  if (!pts.length) return;
  const g = createSvg('g', { opacity: isDraft ? '0.8' : '1' });
  const fallback = (m.type === 'highlight' || m.type === 'note') ? (state.highlightColor || '#facc15') : '#c0392b';
  const stroke = isSelected ? '#0ea5e9' : (m.color || fallback);
  const sw = (m.lineWidth || 2) + (isSelected ? 1.5 : 0);

  if (['distance', 'calibrate', 'arrow', 'callout', 'underline', 'strike'].includes(m.type)) {
    const [a, b] = pts;
    const attrs = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke, 'stroke-width': sw, 'stroke-dasharray': m.type === 'calibrate' ? '5,4' : '' };
    if (m.type === 'arrow' || m.type === 'callout') attrs['marker-end'] = 'url(#arrowhead)';
    g.appendChild(createSvg('line', attrs));

    if (m.type === 'distance' || m.type === 'calibrate') {
      const lenPt = distPt(m.points[0], m.points[1]);
      const lbl = m.type === 'calibrate' ? `${(lenPt * state.zoom).toFixed(0)} px` : formatLength(lenPt, state.unitsPerPt, state.unit);
      drawBadge(g, (a.x + b.x) / 2, (a.y + b.y) / 2 - 8, lbl, stroke);
    } else if (m.type === 'callout' && m.text) {
      drawBadge(g, a.x, a.y - 8, m.text, stroke);
    }
  } else if (m.type === 'perimeter') {
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    g.appendChild(createSvg('path', { d, fill: 'none', stroke, 'stroke-width': sw }));
    const last = pts[pts.length - 1];
    drawBadge(g, last.x, last.y - 10, formatLength(polylineLength(m.points), state.unitsPerPt, state.unit), stroke);
  } else if (m.type === 'area' || m.type === 'cutout') {
    const isCut = m.type === 'cutout';
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    g.appendChild(createSvg('path', {
      d, fill: isCut ? '#ffffff' : stroke, 'fill-opacity': isCut ? '0.65' : '0.18',
      stroke, 'stroke-width': sw, 'stroke-dasharray': isCut ? '6,4' : '',
    }));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const areaPt = polygonArea(m.points);
    const lbl = isCut
      ? `-${formatArea(areaPt, state.unitsPerPt, state.unit)} (Cutout)`
      : `${formatArea(areaPt, state.unitsPerPt, state.unit)} (P: ${formatLength(polygonPerimeter(m.points), state.unitsPerPt, state.unit)})`;
    drawBadge(g, cx, cy, lbl, stroke);
  } else if (m.type === 'pen' || m.type === 'highlight') {
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const isHi = m.type === 'highlight';
    g.appendChild(createSvg('path', {
      d, fill: 'none', stroke,
      'stroke-width': isHi ? 14 * state.zoom : sw,
      'stroke-opacity': isHi ? '0.4' : '1',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  } else if (m.type === 'rect' || m.type === 'redact') {
    const [a, b] = pts;
    const isRed = m.type === 'redact';
    const rx = Math.min(a.x, b.x);
    const ry = Math.min(a.y, b.y);
    const rw = Math.abs(b.x - a.x);
    const rh = Math.abs(b.y - a.y);
    g.appendChild(createSvg('rect', {
      x: rx, y: ry, width: rw, height: rh,
      fill: isRed ? '#111111' : 'none',
      'fill-opacity': isRed ? '0.88' : '1',
      stroke: isRed ? (isSelected ? '#0ea5e9' : '#c0392b') : stroke,
      'stroke-width': sw,
    }));
    if (isRed && rw > 44 && rh > 16) {
      const rt = createSvg('text', { x: rx + rw / 2, y: ry + rh / 2 + 4, 'text-anchor': 'middle', fill: '#fca5a5', 'font-size': 10, 'font-weight': '700' });
      rt.textContent = 'REDACTED';
      g.appendChild(rt);
    }
  } else if (m.type === 'sign') {
    const [a, b] = pts;
    const rx = Math.min(a.x, b.x);
    const ry = Math.min(a.y, b.y);
    const rw = Math.max(24, Math.abs(b.x - a.x));
    const rh = Math.max(16, Math.abs(b.y - a.y));
    const href = m.sigDataUrl || state.signatureDataUrl;
    if (href) {
      g.appendChild(createSvg('image', { href, x: rx, y: ry, width: rw, height: rh, preserveAspectRatio: 'xMidYMid meet' }));
    }
    if (isSelected || isDraft) {
      g.appendChild(createSvg('rect', { x: rx, y: ry, width: rw, height: rh, fill: 'none', stroke: '#0ea5e9', 'stroke-dasharray': '4,3', 'stroke-width': 1.3 }));
    }
  } else if (m.type === 'cloud') {
    const d = buildRevisionCloudPath(pts[0], pts[1], 14 * state.zoom);
    if (d) g.appendChild(createSvg('path', { d, fill: stroke, 'fill-opacity': '0.07', stroke, 'stroke-width': sw }));
  } else if (m.type === 'note') {
    const noteFill = m.color || state.highlightColor || '#facc15';
    const border = isSelected ? '#0ea5e9' : '#2C2C2E';
    const x = pts[0].x - 10;
    const y = pts[0].y - 10;
    const tip = createSvg('title');
    tip.textContent = m.text || 'Sticky Note';
    g.appendChild(tip);
    g.appendChild(createSvg('rect', { x, y, width: 20, height: 20, rx: 3, fill: noteFill, stroke: border, 'stroke-width': isSelected ? 2 : 1.3 }));
    g.appendChild(createSvg('path', { d: `M ${x + 13} ${y} L ${x + 20} ${y + 7} L ${x + 13} ${y + 7} Z`, fill: 'rgba(255,255,255,0.65)', stroke: border, 'stroke-width': 1 }));
    g.appendChild(createSvg('line', { x1: x + 4, y1: y + 11, x2: x + 15, y2: y + 11, stroke: '#2C2C2E', 'stroke-width': 1.2 }));
    g.appendChild(createSvg('line', { x1: x + 4, y1: y + 15, x2: x + 12, y2: y + 15, stroke: '#2C2C2E', 'stroke-width': 1.2 }));
    const raw = (m.text || '').trim();
    if (raw) {
      const preview = isSelected || raw.length <= 34 ? raw : `${raw.slice(0, 32)}…`;
      const bw = Math.min(260, preview.length * 6.4 + 14);
      g.appendChild(createSvg('rect', { x: x + 24, y: y - 1, width: bw, height: 22, rx: 4, fill: '#fffdf5', stroke: border, 'stroke-width': 1 }));
      const nt = createSvg('text', { x: x + 31, y: y + 13, fill: '#2C2C2E', 'font-size': 11, 'font-weight': '600' });
      nt.textContent = preview;
      g.appendChild(nt);
    }
  } else if (m.type === 'text') {
    const t = createSvg('text', { x: pts[0].x, y: pts[0].y, fill: stroke, 'font-size': 13 * state.zoom, 'font-weight': '600' });
    t.textContent = m.text;
    g.appendChild(t);
  } else if (m.type === 'count') {
    const r = Math.max(9, 10 * state.zoom);
    g.appendChild(createSvg('circle', { cx: pts[0].x, cy: pts[0].y, r, fill: stroke, stroke: '#ffffff', 'stroke-width': 1.8 }));
    const t = createSvg('text', { x: pts[0].x, y: pts[0].y + 4, 'text-anchor': 'middle', fill: '#ffffff', 'font-size': 10 * Math.min(1.3, state.zoom), 'font-weight': '700' });
    t.textContent = String(m.countNum || m.text || '1');
    g.appendChild(t);
  } else if (m.type === 'stamp') {
    drawStampSvg(g, pts[0], m.stampData || { kind: 'badge', id: m.text, color: stroke }, state.zoom, createSvg);
  }

  svgEl.appendChild(g);
}

function drawBadge(parent, x, y, text, color) {
  const w = text.length * 6.8 + 12;
  const h = 18;
  parent.appendChild(createSvg('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 3, fill: '#ffffff', stroke: color, 'stroke-width': 1 }));
  const t = createSvg('text', { x, y: y + 4, 'text-anchor': 'middle', fill: '#183b3b', 'font-size': '11', 'font-family': 'Consolas, monospace', 'font-weight': '600' });
  t.textContent = text;
  parent.appendChild(t);
}
