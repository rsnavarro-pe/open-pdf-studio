/**
 * Interactive SVG annotation & measurement overlay controller.
 */
import { state, addMarkup, pushHistory, setTool, notify } from './state.js';
import { buildStampPayload } from './stamps.js';
import { nextCountNumber } from './takeoff.js';
import { findNearestSnap } from './osnap.js';
import { renderCurrentPage } from './pdf-engine.js';
import { screenToPdf, pdfToScreen, distPt, hitTestMarkup } from './geometry.js';
import { createSvg, drawMarkupSvg } from './overlay-draw.js';

let svgEl = null;
let scrollerEl = null;
let draft = null;
let panStart = null;
let dragMove = null; // { markup, lastPt, pushed }
let onCalibrateCallback = null;
let activeSnapPt = null;
let wheelRenderTimer = null;
let wheelBaseZoom = null;

export function initOverlay(onCalibrate) {
  svgEl = document.getElementById('overlay-svg');
  scrollerEl = document.getElementById('canvas-scroller');
  onCalibrateCallback = onCalibrate;

  svgEl.addEventListener('pointerdown', onPointerDown);
  svgEl.addEventListener('pointermove', onPointerMove);
  svgEl.addEventListener('pointerup', onPointerUp);
  svgEl.addEventListener('dblclick', onDoubleClick);
  svgEl.addEventListener('contextmenu', onRightClickFinish);
  scrollerEl.addEventListener('wheel', onWheelZoom, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (draft) { draft = null; renderOverlay(); }
      else if (state.activeTool !== 'select') setTool('select');
    }
  });
}

export function isDraftingMulti() {
  return Boolean(draft && draft.multi);
}

function getPdfPointFromEvent(e, applySnap = true) {
  const rect = svgEl.getBoundingClientRect();
  const raw = screenToPdf(e.clientX - rect.left, e.clientY - rect.top, state.zoom, state.rotation, state.pageWidthPt, state.pageHeightPt);
  if (applySnap && state.osnap && !['select', 'pan', 'pen', 'highlight'].includes(state.activeTool)) {
    const res = findNearestSnap(raw, state.snapPoints, 10 / state.zoom);
    activeSnapPt = res.snapped ? res.pt : null;
    return res.pt;
  }
  activeSnapPt = null;
  return raw;
}

function toScreen(pt) {
  return pdfToScreen(pt.x, pt.y, state.zoom, state.rotation, state.pageWidthPt, state.pageHeightPt);
}

function onPointerDown(e) {
  if (!state.pdfBytes) return;
  if (e.button === 1 || (e.button === 0 && state.activeTool === 'pan')) {
    e.preventDefault();
    panStart = { x: e.clientX, y: e.clientY, left: scrollerEl.scrollLeft, top: scrollerEl.scrollTop };
    svgEl.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;

  const tool = state.activeTool;
  const pt = getPdfPointFromEvent(e);

  if (tool === 'select') {
    const pageMarkups = state.markups.filter((m) => m.page === state.currentPage);
    const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(m, pt, 10 / state.zoom));
    state.selectedId = hit ? hit.id : null;
    if (hit) {
      dragMove = { markup: hit, lastPt: pt, pushed: false };
      svgEl.setPointerCapture(e.pointerId);
    }
    notify();
    return;
  }

  if (tool === 'text') {
    const text = window.prompt('Enter annotation text:', 'NOTE: Verify field dimension');
    if (!text) return;
    addMarkup({ id: crypto.randomUUID(), page: state.currentPage, type: 'text', points: [pt], text, color: state.strokeColor, lineWidth: state.lineWidth });
    return;
  }

  if (tool === 'count') {
    const num = nextCountNumber(state.activeTakeoffId);
    addMarkup({ id: crypto.randomUUID(), page: state.currentPage, type: 'count', points: [pt], countNum: num, text: `#${num}`, takeoffItemId: state.activeTakeoffId || '', color: state.strokeColor, lineWidth: state.lineWidth });
    return;
  }

  if (tool === 'stamp') {
    const stampData = buildStampPayload(state.stampType);
    addMarkup({ id: crypto.randomUUID(), page: state.currentPage, type: 'stamp', points: [pt], text: stampData.label, stampData, color: stampData.color || state.strokeColor, lineWidth: state.lineWidth });
    return;
  }

  if (['perimeter', 'area', 'cutout'].includes(tool)) {
    if (!draft) draft = { type: tool, points: [pt, pt], multi: true };
    else { draft.points[draft.points.length - 1] = pt; draft.points.push(pt); }
    renderOverlay();
    return;
  }

  if (tool === 'pen' || tool === 'highlight') {
    draft = { type: tool, points: [pt], freehand: true };
    svgEl.setPointerCapture(e.pointerId);
    renderOverlay();
    return;
  }

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
    const f = state.unitsPerPt || 1;
    coordsEl.textContent = `${(pt.x * f).toFixed(1)}, ${(pt.y * f).toFixed(1)} ${state.unitsPerPt ? state.unit : 'pt'}`;
  }

  if (dragMove) {
    const dx = pt.x - dragMove.lastPt.x;
    const dy = pt.y - dragMove.lastPt.y;
    if (Math.hypot(dx, dy) > 0.5) {
      if (!dragMove.pushed) { pushHistory(); dragMove.pushed = true; }
      dragMove.markup.points = dragMove.markup.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      dragMove.lastPt = pt;
      renderOverlay();
    }
    return;
  }

  if (!draft) {
    if (state.osnap) renderOverlay();
    return;
  }
  if (draft.freehand) {
    const last = draft.points[draft.points.length - 1];
    if (distPt(last, pt) >= 2 / state.zoom) draft.points.push(pt);
  } else {
    draft.points[draft.points.length - 1] = pt;
  }
  renderOverlay();
}

function onPointerUp() {
  if (panStart) { panStart = null; return; }
  if (dragMove) {
    const changed = dragMove.pushed;
    dragMove = null;
    if (changed) notify();
    return;
  }
  if (!draft || draft.multi) return;

  if (draft.freehand) {
    const pts = draft.points;
    const type = draft.type;
    draft = null;
    if (pts.length >= 2) {
      addMarkup({ id: crypto.randomUUID(), page: state.currentPage, type, points: pts, color: state.strokeColor, lineWidth: state.lineWidth });
    } else renderOverlay();
    return;
  }

  const [p0, p1] = draft.points;
  const span = distPt(p0, p1);
  const type = draft.type;
  draft = null;
  if (span < 3) { renderOverlay(); return; }
  if (type === 'calibrate') { if (onCalibrateCallback) onCalibrateCallback(span); renderOverlay(); return; }

  let text = '';
  if (type === 'callout') {
    text = window.prompt('Callout label:', 'DETAIL REF') || '';
    if (!text) { renderOverlay(); return; }
  }
  addMarkup({ id: crypto.randomUUID(), page: state.currentPage, type, points: [p0, p1], text, takeoffItemId: state.activeTakeoffId || '', color: state.strokeColor, lineWidth: state.lineWidth });
}

function onDoubleClick(e) {
  if (draft && draft.multi) { finishMultiDraft(); return; }
  if (state.activeTool === 'select' && state.selectedId) {
    const m = state.markups.find((x) => x.id === state.selectedId);
    if (m && (m.type === 'text' || m.type === 'callout')) {
      e.preventDefault();
      const updated = window.prompt('Edit label:', m.text || '');
      if (updated !== null && updated.trim()) {
        pushHistory();
        m.text = updated.trim();
        notify();
      }
    }
  }
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
  if (pts.length < (type === 'perimeter' ? 2 : 3)) { renderOverlay(); return; }
  addMarkup({ id: crypto.randomUUID(), page: state.currentPage, type, points: pts, takeoffItemId: state.activeTakeoffId || '', color: state.strokeColor, lineWidth: state.lineWidth });
}

function onWheelZoom(e) {
  if (!state.pdfBytes || e.shiftKey) return;
  e.preventDefault();

  const stage = document.getElementById('page-stage');
  if (wheelBaseZoom === null) wheelBaseZoom = state.zoom;

  const prevZoom = state.zoom;
  const factor = Math.exp(-e.deltaY * 0.0018);
  const nextZoom = Math.max(0.15, Math.min(6, +(prevZoom * factor).toFixed(3)));
  if (nextZoom === prevZoom) return;

  const rect = scrollerEl.getBoundingClientRect();
  const pointerX = e.clientX - rect.left;
  const pointerY = e.clientY - rect.top;
  const contentX = pointerX + scrollerEl.scrollLeft;
  const contentY = pointerY + scrollerEl.scrollTop;

  state.zoom = nextZoom;
  const previewScale = nextZoom / wheelBaseZoom;
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `scale(${previewScale})`;

  scrollerEl.scrollLeft = contentX * (nextZoom / prevZoom) - pointerX;
  scrollerEl.scrollTop = contentY * (nextZoom / prevZoom) - pointerY;
  document.getElementById('lcd-zoom').textContent = `${Math.round(nextZoom * 100)}%`;

  clearTimeout(wheelRenderTimer);
  wheelRenderTimer = setTimeout(async () => {
    wheelBaseZoom = null;
    stage.style.transform = '';
    await renderCurrentPage();
  }, 120);
}

export function renderOverlay() {
  if (!svgEl) return;
  svgEl.innerHTML = '';
  const defs = createSvg('defs');
  const marker = createSvg('marker', { id: 'arrowhead', markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto' });
  marker.appendChild(createSvg('polygon', { points: '0 0, 10 3.5, 0 7', fill: 'context-stroke' }));
  defs.appendChild(marker);
  svgEl.appendChild(defs);

  for (const m of state.markups.filter((x) => x.page === state.currentPage)) {
    drawMarkupSvg(svgEl, m, toScreen, state, m.id === state.selectedId, false);
  }
  if (draft) {
    drawMarkupSvg(svgEl, { ...draft, color: draft.type === 'calibrate' ? '#287b69' : state.strokeColor, lineWidth: state.lineWidth }, toScreen, state, false, true);
  }
  if (activeSnapPt && state.osnap) {
    const sp = toScreen(activeSnapPt);
    svgEl.appendChild(createSvg('rect', { x: sp.x - 5, y: sp.y - 5, width: 10, height: 10, fill: 'none', stroke: '#90472D', 'stroke-width': 2 }));
  }
}
