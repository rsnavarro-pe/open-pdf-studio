/**
 * SVG markup renderer for the interactive overlay.
 */
import {
  distPt, polylineLength, polygonPerimeter, polygonArea,
  formatLength, formatArea, buildRevisionCloudPath,
} from './geometry.js';
import { drawStampSvg } from './stamp-renderer.js';
import { getFontStack, getDashArray, drawArrowHeadSvg } from './markup-props.js';

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
  const dash = m.type === 'calibrate' ? '5,4' : getDashArray(m.lineStyle || 'solid', sw);
  const fillCol = m.fillColor || '#ffffff';
  const fillOp = m.fillOpacity != null ? String(m.fillOpacity) : '0.12';
  const fontFam = getFontStack(m.fontFamily || state.fontFamily);
  const fSize = (m.fontSize || state.fontSize || 13) * state.zoom;
  const fWeight = (m.fontBold ?? true) ? '700' : '400';
  const fStyle = m.fontItalic ? 'italic' : 'normal';
  const arrStyle = m.arrowHead || state.arrowHead || 'closed';
  const arrSize = (m.arrowSize || state.arrowSize || 11) * state.zoom;

  if (['distance', 'calibrate', 'arrow', 'callout', 'underline', 'strike'].includes(m.type)) {
    const [a, b] = pts;
    if (m.type === 'callout') {
      for (let i = 1; i < pts.length; i++) {
        const tip = pts[i];
        const kneeX = a.x + (tip.x >= a.x ? 20 * state.zoom : -20 * state.zoom);
        const knee = { x: kneeX, y: a.y };
        g.appendChild(createSvg('polyline', { points: `${a.x},${a.y} ${knee.x},${knee.y} ${tip.x},${tip.y}`, fill: 'none', stroke, 'stroke-width': sw, 'stroke-dasharray': dash }));
        drawArrowHeadSvg(g, knee, tip, arrStyle, arrSize, stroke, sw, createSvg);
      }
      const lbl = m.text || 'CALLOUT';
      const bw = Math.max(46, lbl.length * (fSize * 0.58) + 16);
      const bh = fSize + 10;
      const bx = b.x >= a.x ? a.x - bw : a.x;
      g.appendChild(createSvg('rect', { x: bx, y: a.y - bh / 2, width: bw, height: bh, rx: 3, fill: fillCol, 'fill-opacity': '0.96', stroke, 'stroke-width': Math.max(1.2, sw * 0.8) }));
      const ct = createSvg('text', { x: bx + bw / 2, y: a.y + fSize * 0.34, 'text-anchor': 'middle', fill: m.color || '#2C2C2E', 'font-family': fontFam, 'font-size': fSize, 'font-weight': fWeight, 'font-style': fStyle });
      ct.textContent = lbl;
      g.appendChild(ct);
    } else if (m.type === 'arrow') {
      for (let i = 1; i < pts.length; i++) {
        const tip = pts[i];
        g.appendChild(createSvg('line', { x1: a.x, y1: a.y, x2: tip.x, y2: tip.y, stroke, 'stroke-width': sw, 'stroke-dasharray': dash }));
        drawArrowHeadSvg(g, a, tip, arrStyle, arrSize, stroke, sw, createSvg);
        if (arrStyle === 'both' && i === 1) drawArrowHeadSvg(g, tip, a, 'closed', arrSize, stroke, sw, createSvg);
      }
    } else {
      g.appendChild(createSvg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke, 'stroke-width': sw, 'stroke-dasharray': dash }));
      if (m.type === 'distance' || m.type === 'calibrate') {
        drawArrowHeadSvg(g, a, b, 'slash', 8 * state.zoom, stroke, sw, createSvg);
        drawArrowHeadSvg(g, b, a, 'slash', 8 * state.zoom, stroke, sw, createSvg);
        const lenPt = distPt(m.points[0], m.points[1]);
        const lbl = m.type === 'calibrate' ? `${(lenPt * state.zoom).toFixed(0)} px` : formatLength(lenPt, state.unitsPerPt, state.unit);
        drawBadge(g, (a.x + b.x) / 2, (a.y + b.y) / 2 - 10, lbl, stroke);
      }
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
      fill: isRed ? '#111111' : fillCol,
      'fill-opacity': isRed ? '0.88' : fillOp,
      stroke: isRed ? (isSelected ? '#0ea5e9' : '#c0392b') : stroke,
      'stroke-width': sw, 'stroke-dasharray': isRed ? '' : dash,
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
    const arcPx = Math.max(6, (m.cloudArc || state.cloudArc || 14) * state.zoom);
    const d = buildRevisionCloudPath(pts[0], pts[1], arcPx);
    if (d) g.appendChild(createSvg('path', { d, fill: m.fillColor || stroke, 'fill-opacity': fillOp, stroke, 'stroke-width': sw, 'stroke-dasharray': dash }));
    if (m.text && m.text.trim()) {
      const tx = Math.min(pts[0].x, pts[1].x) + 14;
      const ty = Math.min(pts[0].y, pts[1].y) - 6;
      g.appendChild(createSvg('polygon', { points: `${tx},${ty - 14} ${tx - 11},${ty + 4} ${tx + 11},${ty + 4}`, fill: '#ffffff', stroke, 'stroke-width': 1.5 }));
      const dt = createSvg('text', { x: tx, y: ty + 2, 'text-anchor': 'middle', fill: stroke, 'font-size': 9.5, 'font-weight': '700' });
      dt.textContent = m.text.trim().slice(0, 5);
      g.appendChild(dt);
    }
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
    const txt = m.text || '';
    if ((m.fillOpacity ?? 0) > 0.02) {
      const tw = Math.max(32, txt.length * (fSize * 0.56) + 12);
      g.appendChild(createSvg('rect', { x: pts[0].x - 5, y: pts[0].y - fSize, width: tw, height: fSize + 8, rx: 3, fill: fillCol, 'fill-opacity': fillOp, stroke: isSelected ? '#0ea5e9' : 'none', 'stroke-width': 1 }));
    }
    const t = createSvg('text', { x: pts[0].x, y: pts[0].y, fill: m.color || stroke, 'font-family': fontFam, 'font-size': fSize, 'font-weight': fWeight, 'font-style': fStyle });
    t.textContent = txt;
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

  if (isSelected && !['pen', 'highlight'].includes(m.type)) {
    for (const p of pts) {
      g.appendChild(createSvg('circle', { cx: p.x, cy: p.y, r: 4.5, fill: '#ffffff', stroke: '#0ea5e9', 'stroke-width': 2 }));
    }
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

export function createWheelZoomHandler(scrollerEl, state, renderOverlay, renderCurrentPage) {
  let wheelRenderTimer = null;
  let wheelRaf = null;
  let pendingWheel = null;

  return function onWheelZoom(e) {
    if (!state.pdfBytes || e.shiftKey) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 32;
    else if (e.deltaMode === 2) dy *= 400;
    dy = Math.max(-90, Math.min(90, dy));

    if (pendingWheel) {
      pendingWheel.dy = Math.max(-120, Math.min(120, pendingWheel.dy + dy));
      pendingWheel.clientX = e.clientX;
      pendingWheel.clientY = e.clientY;
    } else {
      pendingWheel = { dy, clientX: e.clientX, clientY: e.clientY };
    }
    if (wheelRaf) return;

    wheelRaf = requestAnimationFrame(() => {
      wheelRaf = null;
      if (!pendingWheel) return;
      const { dy: d, clientX, clientY } = pendingWheel;
      pendingWheel = null;

      const stage = document.getElementById('page-stage');
      const canvas = document.getElementById('pdf-canvas');
      const prevZoom = state.zoom;
      const nextZoom = Math.max(0.15, Math.min(6, +(prevZoom * Math.exp(-d * 0.0022)).toFixed(4)));
      if (nextZoom === prevZoom) return;

      const stageRect = stage.getBoundingClientRect();
      const relX = clientX - stageRect.left;
      const relY = clientY - stageRect.top;
      const newW = (state.rotation % 180 === 90 ? state.pageHeightPt : state.pageWidthPt) * nextZoom;
      const newH = (state.rotation % 180 === 90 ? state.pageWidthPt : state.pageHeightPt) * nextZoom;

      state.zoom = nextZoom;
      stage.style.width = `${newW}px`;
      stage.style.height = `${newH}px`;
      canvas.style.width = `${newW}px`;
      canvas.style.height = `${newH}px`;
      renderOverlay();

      const ratio = nextZoom / prevZoom;
      const newStageRect = stage.getBoundingClientRect();
      scrollerEl.scrollLeft += (newStageRect.left + relX * ratio) - clientX;
      scrollerEl.scrollTop += (newStageRect.top + relY * ratio) - clientY;
      document.getElementById('lcd-zoom').textContent = `${Math.round(nextZoom * 100)}%`;

      clearTimeout(wheelRenderTimer);
      wheelRenderTimer = setTimeout(async () => {
        const sl = scrollerEl.scrollLeft;
        const st = scrollerEl.scrollTop;
        await renderCurrentPage();
        scrollerEl.scrollLeft = sl;
        scrollerEl.scrollTop = st;
      }, 220);
    });
  };
}
