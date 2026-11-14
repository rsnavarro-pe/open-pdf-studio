/**
 * Interactive SVG annotation & measurement overlay controller.
 */
import { state, addMarkup, pushHistory, setTool, notify } from './state.js';
import { buildStampPayload } from './stamps.js';
import { nextCountNumber } from './takeoff.js';
import { findNearestSnap } from './osnap.js';
import { renderCurrentPage } from './pdf-engine.js';
import { screenToPdf, pdfToScreen, distPt, hitTestMarkup } from './geometry.js';
import { createSvg, drawMarkupSvg, createWheelZoomHandler } from './overlay-draw.js';
import { getDefaultMarkupStyle, focusPropTextEditor } from './markup-props.js';
import { getSearchHighlights } from './search.js';

let svgEl = null;
let scrollerEl = null;
let draft = null;
let panStart = null;
let dragMove = null; // { markup, lastPt, pushed }
let onCalibrateCallback = null;
let activeSnapPt = null;
let leaderPreviewPt = null;

export function initOverlay(onCalibrate) {
  svgEl = document.getElementById('overlay-svg');
  scrollerEl = document.getElementById('canvas-scroller');
  onCalibrateCallback = onCalibrate;

  svgEl.addEventListener('pointerdown', onPointerDown);
  svgEl.addEventListener('pointermove', onPointerMove);
  svgEl.addEventListener('pointerup', onPointerUp);
  svgEl.addEventListener('dblclick', onDoubleClick);
  svgEl.addEventListener('contextmenu', onRightClickFinish);
  scrollerEl.addEventListener('wheel', createWheelZoomHandler(scrollerEl, state, renderOverlay, renderCurrentPage), { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.addingLeaderToId) {
        state.addingLeaderToId = null;
        leaderPreviewPt = null;
        notify();
      } else if (draft) { draft = null; renderOverlay(); }
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
  if (applySnap && state.osnap && !['select', 'pan', 'pen', 'highlight', 'underline', 'strike', 'note'].includes(state.activeTool)) {
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

  if (state.addingLeaderToId) {
    const target = state.markups.find((m) => m.id === state.addingLeaderToId && m.page === state.currentPage);
    state.addingLeaderToId = null;
    leaderPreviewPt = null;
    if (target) {
      pushHistory();
      target.points.push(pt);
      const hint = document.getElementById('tool-hint');
      if (hint) hint.textContent = `Added leader #${target.points.length - 1} to ${target.type.toUpperCase()}. Drag blue handles to adjust.`;
      notify();
      return;
    }
  }

  if (tool === 'select') {
    const pageMarkups = state.markups.filter((m) => m.page === state.currentPage);
    const curSel = state.selectedId ? pageMarkups.find((m) => m.id === state.selectedId) : null;
    if (curSel) {
      const vIdx = curSel.points.findIndex((v) => distPt(v, pt) <= 9 / state.zoom);
      if (vIdx >= 0) {
        dragMove = { markup: curSel, lastPt: pt, vertexIdx: vIdx, pushed: false };
        svgEl.setPointerCapture(e.pointerId);
        return;
      }
    }
    const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(m, pt, 10 / state.zoom));
    state.selectedId = hit ? hit.id : null;
    if (hit) {
      dragMove = { markup: hit, lastPt: pt, vertexIdx: null, pushed: false };
      svgEl.setPointerCapture(e.pointerId);
    }
    notify();
    return;
  }

  if (tool === 'text' || tool === 'note') {
    const presetTxt = (document.getElementById('prop-text-content')?.value || '').trim();
    const defTxt = tool === 'note' ? 'Review comment' : 'NOTE: Verify dimension';
    const id = crypto.randomUUID();
    addMarkup({ id, page: state.currentPage, type: tool, points: [pt], text: presetTxt || defTxt, ...getDefaultMarkupStyle(tool) });
    state.selectedId = id;
    notify();
    focusPropTextEditor(true);
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
      if (dragMove.vertexIdx != null) {
        dragMove.markup.points[dragMove.vertexIdx] = { x: pt.x, y: pt.y };
      } else {
        dragMove.markup.points = dragMove.markup.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
      dragMove.lastPt = pt;
      renderOverlay();
    }
    return;
  }

  if (!draft) {
    if (state.addingLeaderToId) {
      leaderPreviewPt = pt;
      renderOverlay();
      return;
    }
    if (state.osnap) renderOverlay();
    return;
  }
  if (draft.freehand) {
    const last = draft.points[draft.points.length - 1];
    if (distPt(last, pt) >= 2 / state.zoom) draft.points.push(pt);
  } else if (draft.type === 'underline' || draft.type === 'strike') {
    draft.points[draft.points.length - 1] = { x: pt.x, y: draft.points[0].y };
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
      addMarkup({ id: crypto.randomUUID(), page: state.currentPage, type, points: pts, ...getDefaultMarkupStyle(type) });
    } else renderOverlay();
    return;
  }

  const [p0, p1] = draft.points;
  const span = distPt(p0, p1);
  const type = draft.type;
  draft = null;
  if (type === 'sign') {
    if (!state.signatureDataUrl) { renderOverlay(); return; }
    const endPt = span < 8 ? { x: p0.x + 130, y: p0.y + 52 } : p1;
    addMarkup({ id: crypto.randomUUID(), page: state.currentPage, type: 'sign', points: [p0, endPt], text: 'Signature', sigDataUrl: state.signatureDataUrl, ...getDefaultMarkupStyle('sign') });
    return;
  }
  if (span < 3) { renderOverlay(); return; }
  if (type === 'calibrate') { if (onCalibrateCallback) onCalibrateCallback(span); renderOverlay(); return; }

  const presetTxt = (document.getElementById('prop-text-content')?.value || '').trim();
  const text = type === 'callout' ? (presetTxt || 'DETAIL REF') : (type === 'cloud' ? presetTxt : '');
  const id = crypto.randomUUID();
  addMarkup({ id, page: state.currentPage, type, points: [p0, p1], text, takeoffItemId: state.activeTakeoffId || '', ...getDefaultMarkupStyle(type) });
  if (type === 'callout') {
    state.selectedId = id;
    notify();
    focusPropTextEditor(true);
  }
}

function onDoubleClick(e) {
  if (draft && draft.multi) { finishMultiDraft(); return; }
  if (state.activeTool === 'select' && state.selectedId) {
    const m = state.markups.find((x) => x.id === state.selectedId);
    if (m && ['text', 'callout', 'note', 'cloud'].includes(m.type)) {
      e.preventDefault();
      focusPropTextEditor(true);
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

export function renderOverlay() {
  if (!svgEl) return;
  svgEl.innerHTML = '';

  for (const m of state.markups.filter((x) => x.page === state.currentPage)) {
    drawMarkupSvg(svgEl, m, toScreen, state, m.id === state.selectedId, false);
  }
  const { rects: hiRects, activeRect } = getSearchHighlights(state.currentPage);
  for (const r of hiRects) {
    const p1 = toScreen({ x: r.x, y: r.y });
    const p2 = toScreen({ x: r.x + r.w, y: r.y + r.h });
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.max(6, Math.abs(p2.x - p1.x));
    const h = Math.max(6, Math.abs(p2.y - p1.y));
    const isAct = activeRect && r === activeRect;
    svgEl.appendChild(createSvg('rect', {
      x: x - 2, y: y - 2, width: w + 4, height: h + 4, rx: 2,
      fill: isAct ? 'rgba(249, 115, 22, 0.34)' : 'rgba(250, 204, 21, 0.30)',
      stroke: isAct ? '#ea580c' : '#eab308',
      'stroke-width': isAct ? 2.5 : 1.2,
    }));
  }
  if (draft) {
    drawMarkupSvg(svgEl, { ...draft, color: draft.type === 'calibrate' ? '#287b69' : state.strokeColor, lineWidth: state.lineWidth }, toScreen, state, false, true);
  }
  if (state.addingLeaderToId && leaderPreviewPt) {
    const target = state.markups.find((m) => m.id === state.addingLeaderToId && m.page === state.currentPage);
    if (target && target.points.length >= 1) {
      const a = toScreen(target.points[0]);
      const b = toScreen(leaderPreviewPt);
      svgEl.appendChild(createSvg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: target.color || state.strokeColor, 'stroke-width': 2, 'stroke-dasharray': '5,4' }));
    }
  }
  if (activeSnapPt && state.osnap) {
    const sp = toScreen(activeSnapPt);
    svgEl.appendChild(createSvg('rect', { x: sp.x - 5, y: sp.y - 5, width: 10, height: 10, fill: 'none', stroke: '#90472D', 'stroke-width': 2 }));
  }
}
