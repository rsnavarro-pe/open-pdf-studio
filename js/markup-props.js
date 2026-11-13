/**
 * Live Properties & Style Inspector for selected markups and default tool styles.
 */
import { state, pushHistory, notify, convertUnit, setPresetScale } from './state.js';
import { EMBEDDED_STAMPS } from './stamps.js';

let lastSyncedId = null;

export function getDefaultMarkupStyle(type) {
  const isHi = type === 'highlight' || type === 'note';
  return {
    color: isHi ? state.highlightColor : state.strokeColor,
    fillColor: state.fillColor,
    fillOpacity: state.fillOpacity,
    lineWidth: state.lineWidth,
    lineStyle: state.lineStyle,
    fontFamily: state.fontFamily,
    fontSize: state.fontSize,
    fontBold: state.fontBold,
    fontItalic: state.fontItalic,
    arrowHead: state.arrowHead,
    arrowSize: state.arrowSize,
    cloudArc: state.cloudArc,
  };
}

export function focusPropTextEditor(selectAll = true) {
  const el = document.getElementById('prop-text-content');
  if (!el) return;
  el.focus();
  if (selectAll) el.select();
}

function getSelectedMarkup() {
  if (!state.selectedId) return null;
  return state.markups.find((m) => m.id === state.selectedId) || null;
}

function applyToSelected(mutator) {
  const sel = getSelectedMarkup();
  if (!sel) return;
  if (lastSyncedId !== sel.id) {
    pushHistory();
    lastSyncedId = sel.id;
  }
  mutator(sel);
  notify();
}

export function initMarkupProps() {
  document.getElementById('unit-select').addEventListener('change', (e) => convertUnit(state.unit, e.target.value));
  document.getElementById('preset-scale').addEventListener('change', (e) => setPresetScale(e.target.value));

  const textEl = document.getElementById('prop-text-content');
  textEl.addEventListener('input', () => {
    applyToSelected((m) => { m.text = textEl.value; });
  });

  document.getElementById('prop-font-family').addEventListener('change', (e) => {
    state.fontFamily = e.target.value;
    applyToSelected((m) => { m.fontFamily = state.fontFamily; });
  });
  document.getElementById('prop-font-size').addEventListener('input', (e) => {
    state.fontSize = Math.max(6, Math.min(72, Number(e.target.value) || 13));
    applyToSelected((m) => { m.fontSize = state.fontSize; });
  });
  document.getElementById('prop-font-bold').addEventListener('click', (e) => {
    state.fontBold = !state.fontBold;
    e.currentTarget.classList.toggle('active', state.fontBold);
    applyToSelected((m) => { m.fontBold = state.fontBold; });
  });
  document.getElementById('prop-font-italic').addEventListener('click', (e) => {
    state.fontItalic = !state.fontItalic;
    e.currentTarget.classList.toggle('active', state.fontItalic);
    applyToSelected((m) => { m.fontItalic = state.fontItalic; });
  });

  document.getElementById('prop-color').addEventListener('input', (e) => {
    state.strokeColor = e.target.value;
    applyToSelected((m) => { m.color = state.strokeColor; });
  });
  document.getElementById('prop-fill-color').addEventListener('input', (e) => {
    state.fillColor = e.target.value;
    applyToSelected((m) => { m.fillColor = state.fillColor; });
  });
  document.getElementById('prop-fill-opacity').addEventListener('input', (e) => {
    state.fillOpacity = Number(e.target.value) / 100;
    applyToSelected((m) => { m.fillOpacity = state.fillOpacity; });
  });

  const setHighlightColor = (hex) => {
    state.highlightColor = hex;
    document.getElementById('prop-highlight-color').value = hex;
    document.querySelectorAll('.hi-swatch').forEach((b) => b.classList.toggle('active', b.dataset.color === hex));
    applyToSelected((m) => { if (m.type === 'highlight' || m.type === 'note') m.color = hex; });
  };
  document.getElementById('prop-highlight-color').addEventListener('input', (e) => setHighlightColor(e.target.value));
  document.querySelectorAll('.hi-swatch').forEach((btn) => btn.addEventListener('click', () => setHighlightColor(btn.dataset.color)));

  document.getElementById('prop-width').addEventListener('input', (e) => {
    state.lineWidth = Number(e.target.value) || 2;
    applyToSelected((m) => { m.lineWidth = state.lineWidth; });
  });
  document.getElementById('prop-line-style').addEventListener('change', (e) => {
    state.lineStyle = e.target.value;
    applyToSelected((m) => { m.lineStyle = state.lineStyle; });
  });

  document.getElementById('prop-arrow-head').addEventListener('change', (e) => {
    state.arrowHead = e.target.value;
    applyToSelected((m) => { m.arrowHead = state.arrowHead; });
  });
  document.getElementById('prop-arrow-size').addEventListener('input', (e) => {
    state.arrowSize = Math.max(5, Math.min(32, Number(e.target.value) || 11));
    applyToSelected((m) => { m.arrowSize = state.arrowSize; });
  });
  document.getElementById('prop-cloud-arc').addEventListener('input', (e) => {
    state.cloudArc = Math.max(6, Math.min(36, Number(e.target.value) || 14));
    applyToSelected((m) => { m.cloudArc = state.cloudArc; });
  });

  const stampSel = document.getElementById('prop-stamp');
  stampSel.innerHTML = '';
  for (const s of EMBEDDED_STAMPS) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label;
    stampSel.appendChild(opt);
  }
  stampSel.value = state.stampType;
  stampSel.addEventListener('change', (e) => { state.stampType = e.target.value; });
}

export function syncPropsCardFromState() {
  const badge = document.getElementById('prop-target-badge');
  const textEl = document.getElementById('prop-text-content');
  if (!badge || !textEl) return;

  const sel = getSelectedMarkup();
  if (!sel) {
    lastSyncedId = null;
    badge.textContent = 'Defaults';
    if (document.activeElement !== textEl) textEl.value = '';
    return;
  }

  badge.textContent = `Selected: ${sel.type.toUpperCase()}`;
  if (document.activeElement !== textEl) {
    textEl.value = sel.text || '';
  }
  if (sel.color) document.getElementById('prop-color').value = sel.color;
  if (sel.fillColor) document.getElementById('prop-fill-color').value = sel.fillColor;
  if (sel.fillOpacity != null) document.getElementById('prop-fill-opacity').value = Math.round(sel.fillOpacity * 100);
  if (sel.lineWidth) document.getElementById('prop-width').value = sel.lineWidth;
  if (sel.lineStyle) document.getElementById('prop-line-style').value = sel.lineStyle;
  if (sel.fontFamily) document.getElementById('prop-font-family').value = sel.fontFamily;
  if (sel.fontSize) document.getElementById('prop-font-size').value = sel.fontSize;
  if (sel.fontBold != null) document.getElementById('prop-font-bold').classList.toggle('active', Boolean(sel.fontBold));
  if (sel.fontItalic != null) document.getElementById('prop-font-italic').classList.toggle('active', Boolean(sel.fontItalic));
  if (sel.arrowHead) document.getElementById('prop-arrow-head').value = sel.arrowHead;
  if (sel.arrowSize) document.getElementById('prop-arrow-size').value = sel.arrowSize;
  if (sel.cloudArc) document.getElementById('prop-cloud-arc').value = sel.cloudArc;
}

export function getFontStack(family) {
  if (family === 'Courier') return 'Consolas, "Courier New", monospace';
  if (family === 'Times') return 'Georgia, "Times New Roman", serif';
  return 'Aptos, Calibri, Arial, sans-serif';
}

export function getDashArray(style, sw = 2) {
  if (style === 'dashed') return `${sw * 3.5},${sw * 2}`;
  if (style === 'dotted') return `${sw},${sw * 1.8}`;
  return '';
}

export function drawArrowHeadSvg(g, fromPt, tipPt, style, sizePx, color, sw, createSvg) {
  const dx = tipPt.x - fromPt.x;
  const dy = tipPt.y - fromPt.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const s = Math.max(6, sizePx);
  const w = s * 0.44;
  const bx = tipPt.x - ux * s;
  const by = tipPt.y - uy * s;

  if (style === 'dot') {
    g.appendChild(createSvg('circle', { cx: tipPt.x, cy: tipPt.y, r: s * 0.35, fill: color }));
  } else if (style === 'slash') {
    const sx = (ux + px) * (s * 0.55);
    const sy = (uy + py) * (s * 0.55);
    g.appendChild(createSvg('line', { x1: tipPt.x - sx, y1: tipPt.y - sy, x2: tipPt.x + sx, y2: tipPt.y + sy, stroke: color, 'stroke-width': sw + 0.5 }));
  } else if (style === 'open') {
    const d = `M ${bx + px * w} ${by + py * w} L ${tipPt.x} ${tipPt.y} L ${bx - px * w} ${by - py * w}`;
    g.appendChild(createSvg('path', { d, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  } else {
    const pts = `${tipPt.x},${tipPt.y} ${bx + px * w},${by + py * w} ${bx - px * w},${by - py * w}`;
    g.appendChild(createSvg('polygon', { points: pts, fill: color }));
  }
}
