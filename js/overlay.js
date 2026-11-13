/**
 * Interactive SVG annotation & measurement overlay controller.
 */
import { state, addMarkup, setTool, notify } from './state.js';
import { buildStampPayload } from './stamps.js';
import { drawStampSvg } from './stamp-renderer.js';
import {
  screenToPdf, pdfToScreen, distPt, polylineLength,
  polygonPerimeter, polygonArea, formatLength, formatArea,
  buildRevisionCloudPath, hitTestMarkup,
} from './geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
let svgEl = null;
let scrollerEl = null;
let draft = null; // { type, points, isDragging }
let panStart = null;
let onCalibrateCallback = null;

export function initOverlay(onCalibrate) {
  svgEl = document.getElementById('overlay-svg');
  scrollerEl = document.getElementById('canvas-scroller');
  onCalibrateCallback = onCalibrate;

  svgEl.addEventListener('pointerdown', onPointerDown);
  svgEl.addEventListener('pointermove', onPointerMove);
  svgEl.addEventListener('pointerup', onPointerUp);
  svgEl.addEventListener('dblclick', onDoubleClick);
  svgEl.addEventListener('contextmenu', onRightClickFinish);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (draft) {
        draft = null;
        renderOverlay();
      } else if (state.activeTool !== 'select') {
        setTool('select');
      }
    }
  });
}

export function isDraftingMulti() {
  return Boolean(draft && draft.multi);
}

function getPdfPointFromEvent(e) {
  const rect = svgEl.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  return screenToPdf(px, py, state.zoom, state.rotation, state.pageWidthPt, state.pageHeightPt);
}

function toScreen(pt) {
  return pdfToScreen(pt.x, pt.y, state.zoom, state.rotation, state.pageWidthPt, state.pageHeightPt);
}

function onPointerDown(e) {
  if (!state.pdfBytes || e.button !== 0) return;
  const tool = state.activeTool;

  if (tool === 'pan') {
    panStart = { x: e.clientX, y: e.clientY, left: scrollerEl.scrollLeft, top: scrollerEl.scrollTop };
    svgEl.setPointerCapture(e.pointerId);
    return;
  }

  const pt = getPdfPointFromEvent(e);

  if (tool === 'select') {
    const pageMarkups = state.markups.filter((m) => m.page === state.currentPage);
    const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(m, pt, 10 / state.zoom));
    state.selectedId = hit ? hit.id : null;
    notify();
    return;
  }

  if (tool === 'text') {
    const text = window.prompt('Enter annotation text:', 'NOTE: Verify field dimension');
    if (!text) return;
    addMarkup({
      id: crypto.randomUUID(),
      page: state.currentPage,
      type: 'text',
      points: [pt],
      text,
      color: state.strokeColor,
      lineWidth: state.lineWidth,
    });
    return;
  }

  if (tool === 'stamp') {
    const stampData = buildStampPayload(state.stampType);
    addMarkup({
      id: crypto.randomUUID(),
      page: state.currentPage,
      type: 'stamp',
      points: [pt],
      text: stampData.label,
      stampData,
      color: stampData.color || state.strokeColor,
      lineWidth: state.lineWidth,
    });
    return;
  }

  // Multi-point tools: perimeter, area
  if (tool === 'perimeter' || tool === 'area') {
    if (!draft) {
      draft = { type: tool, points: [pt, pt], multi: true };
    } else {
      draft.points[draft.points.length - 1] = pt;
      draft.points.push(pt);
    }
    renderOverlay();
    return;
  }

  // Two-point drag/click tools: calibrate, distance, cloud, callout, arrow, rect
  draft = { type: tool, points: [pt, pt], isDragging: true };
  svgEl.setPointerCapture(e.pointerId);
  renderOverlay();
}

function onPointerMove(e) {
  if (!state.pdfBytes) return;

  if (panStart) {
    scrollerEl.scrollLeft = panStart.left - (e.clientX - panStart.x);
    scrollerEl.scrollTop = panStart.top - (e.clientY - panStart.y);
    return;
  }

  const pt = getPdfPointFromEvent(e);
  const coordsEl = document.getElementById('lcd-coords');
  if (coordsEl) {
    const factor = state.unitsPerPt || 1;
    const suffix = state.unitsPerPt ? state.unit : 'pt';
    coordsEl.textContent = `${(pt.x * factor).toFixed(1)}, ${(pt.y * factor).toFixed(1)} ${suffix}`;
  }

  if (!draft) return;
  draft.points[draft.points.length - 1] = pt;
  renderOverlay();
}

function onPointerUp(e) {
  if (panStart) {
    panStart = null;
    return;
  }
  if (!draft || draft.multi) return;

  const p0 = draft.points[0];
  const p1 = draft.points[1];
  const span = distPt(p0, p1);
  const type = draft.type;
  draft = null;

  if (span < 3) {
    renderOverlay();
    return;
  }

  if (type === 'calibrate') {
    if (onCalibrateCallback) onCalibrateCallback(span);
    renderOverlay();
    return;
  }

  let text = '';
  if (type === 'callout') {
    text = window.prompt('Callout label:', 'DETAIL REF') || '';
    if (!text) { renderOverlay(); return; }
  }

  addMarkup({
    id: crypto.randomUUID(),
    page: state.currentPage,
    type,
    points: [p0, p1],
    text,
    color: state.strokeColor,
    lineWidth: state.lineWidth,
  });
}

function onDoubleClick() {
  finishMultiDraft();
}

function onRightClickFinish(e) {
  if (!draft || !draft.multi) return;
  e.preventDefault();
  e.stopPropagation();
  finishMultiDraft();
  setTool('select');
}

function finishMultiDraft() {
  if (!draft || !draft.multi) return;
  const pts = draft.points.slice(0, -1);
  const type = draft.type;
  draft = null;
  if (pts.length < (type === 'area' ? 3 : 2)) {
    renderOverlay();
    return;
  }
  addMarkup({
    id: crypto.randomUUID(),
    page: state.currentPage,
    type,
    points: pts,
    color: state.strokeColor,
    lineWidth: state.lineWidth,
  });
}

export function renderOverlay() {
  if (!svgEl) return;
  svgEl.innerHTML = '';

  // Arrowhead marker
  const defs = createSvg('defs');
  const marker = createSvg('marker', {
    id: 'arrowhead', markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto',
  });
  marker.appendChild(createSvg('polygon', { points: '0 0, 10 3.5, 0 7', fill: 'context-stroke' }));
  defs.appendChild(marker);
  svgEl.appendChild(defs);

  const pageMarkups = state.markups.filter((m) => m.page === state.currentPage);
  for (const m of pageMarkups) {
    drawMarkup(m, m.id === state.selectedId);
  }
  if (draft) {
    drawMarkup({
      ...draft,
      color: draft.type === 'calibrate' ? '#287b69' : state.strokeColor,
      lineWidth: state.lineWidth,
    }, false, true);
  }
}

function drawMarkup(m, isSelected, isDraft = false) {
  const pts = m.points.map(toScreen);
  const g = createSvg('g', { opacity: isDraft ? '0.8' : '1' });
  const stroke = isSelected ? '#0ea5e9' : (m.color || '#c0392b');
  const sw = (m.lineWidth || 2) + (isSelected ? 1.5 : 0);

  if (m.type === 'distance' || m.type === 'calibrate' || m.type === 'arrow' || m.type === 'callout') {
    const [a, b] = pts;
    const lineAttrs = {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke, 'stroke-width': sw,
      'stroke-dasharray': m.type === 'calibrate' ? '5,4' : '',
    };
    if (m.type === 'arrow' || m.type === 'callout') lineAttrs['marker-end'] = 'url(#arrowhead)';
    g.appendChild(createSvg('line', lineAttrs));

    if (m.type === 'distance' || m.type === 'calibrate') {
      const lenPt = distPt(m.points[0], m.points[1]);
      const label = m.type === 'calibrate'
        ? `${(lenPt * state.zoom).toFixed(0)} px`
        : formatLength(lenPt, state.unitsPerPt, state.unit);
      drawBadge(g, (a.x + b.x) / 2, (a.y + b.y) / 2 - 8, label, stroke);
    } else if (m.type === 'callout' && m.text) {
      drawBadge(g, a.x, a.y - 8, m.text, stroke);
    }
  } else if (m.type === 'perimeter') {
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    g.appendChild(createSvg('path', { d, fill: 'none', stroke, 'stroke-width': sw }));
    const lenPt = polylineLength(m.points);
    const last = pts[pts.length - 1];
    drawBadge(g, last.x, last.y - 10, formatLength(lenPt, state.unitsPerPt, state.unit), stroke);
  } else if (m.type === 'area') {
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    g.appendChild(createSvg('path', { d, fill: stroke, 'fill-opacity': '0.18', stroke, 'stroke-width': sw }));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const areaPt = polygonArea(m.points);
    const perimPt = polygonPerimeter(m.points);
    drawBadge(g, cx, cy, `${formatArea(areaPt, state.unitsPerPt, state.unit)} (P: ${formatLength(perimPt, state.unitsPerPt, state.unit)})`, stroke);
  } else if (m.type === 'rect') {
    const [a, b] = pts;
    g.appendChild(createSvg('rect', {
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
      fill: 'none', stroke, 'stroke-width': sw,
    }));
  } else if (m.type === 'cloud') {
    const d = buildRevisionCloudPath(pts[0], pts[1], 14 * state.zoom);
    if (d) g.appendChild(createSvg('path', { d, fill: stroke, 'fill-opacity': '0.07', stroke, 'stroke-width': sw }));
  } else if (m.type === 'text') {
    const t = createSvg('text', { x: pts[0].x, y: pts[0].y, fill: stroke, 'font-size': 13 * state.zoom, 'font-weight': '600' });
    t.textContent = m.text;
    g.appendChild(t);
  } else if (m.type === 'stamp') {
    const stamp = m.stampData || { kind: 'badge', id: m.text, color: stroke };
    drawStampSvg(g, pts[0], stamp, state.zoom, createSvg);
  }

  svgEl.appendChild(g);
}

function drawBadge(parent, x, y, text, color) {
  const padX = 6;
  const w = text.length * 6.8 + padX * 2;
  const h = 18;
  parent.appendChild(createSvg('rect', {
    x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 3,
    fill: '#ffffff', stroke: color, 'stroke-width': 1,
  }));
  const t = createSvg('text', {
    x, y: y + 4, 'text-anchor': 'middle', fill: '#183b3b',
    'font-size': '11', 'font-family': 'Consolas, monospace', 'font-weight': '600',
  });
  t.textContent = text;
  parent.appendChild(t);
}

function createSvg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== '') el.setAttribute(k, String(v));
  }
  return el;
}
