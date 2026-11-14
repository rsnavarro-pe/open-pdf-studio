/**
 * Deterministic UI rendering from central state.
 */
import { state, notify } from './state.js';
import {
  distPt, polylineLength, polygonPerimeter, polygonArea,
  formatLength, formatArea,
} from './geometry.js';
import { renderOverlay } from './overlay.js';
import { renderComparison } from './compare.js';
import { computeBoqRows } from './takeoff.js';
import { syncPropsCardFromState } from './markup-props.js';
import { isWorkbenchForced } from './workbench-ui.js';

const TOOL_HINTS = {
  select: 'Click to select, drag to move, or double-click text/callout to edit.',
  pan: 'Click and drag to pan the drawing.',
  calibrate: 'Click and drag between two points of a known dimension.',
  distance: 'Click and drag to measure a straight-line distance.',
  perimeter: 'Click points to trace a polyline; double-click or right-click to finish (Esc to cancel).',
  area: 'Click polygon vertices; double-click or right-click to finish (Esc to cancel).',
  cutout: 'Click polygon vertices to subtract an opening from Area; double-click or right-click to finish.',
  count: 'Click to drop numbered count pins for the active takeoff item.',
  cloud: 'Click and drag to draw a revision cloud.',
  callout: 'Click and drag from label origin to target arrow.',
  arrow: 'Click and drag to draw a leader arrow.',
  rect: 'Click and drag to draw a rectangle.',
  pen: 'Click and drag to draw freehand.',
  highlight: 'Click and drag to highlight (choose colors in Highlight / Note palette).',
  underline: 'Click and drag across text to draw a straight underline.',
  strike: 'Click and drag across text to draw a straight strikethrough line.',
  note: 'Click anywhere on the sheet to place a sticky note comment (double-click to edit).',
  redact: 'Click and drag a box to blackout/redact confidential content on export.',
  sign: 'Click (or click-drag to size) on the sheet to place your signature or image.',
  text: 'Click anywhere on the sheet to place a text note.',
  stamp: 'Click anywhere on the sheet to place the selected stamp.',
};

export function renderUI() {
  const hasDoc = Boolean(state.pdfBytes);
  const showBench = !hasDoc || isWorkbenchForced();
  document.getElementById('drop-zone').classList.toggle('hidden', !showBench);
  document.getElementById('page-stage').classList.toggle('hidden', showBench || (state.compare.active && state.compare.mode === 'side-by-side'));
  document.getElementById('btn-home-workbench')?.classList.toggle('active', showBench);

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === state.activeTool);
  });

  // Action buttons
  document.getElementById('btn-export-pdf').disabled = !hasDoc;
  document.getElementById('btn-export-dxf').disabled = !hasDoc;
  document.getElementById('btn-export-csv').disabled = !hasDoc || state.markups.length === 0;
  document.getElementById('btn-export-boq').disabled = !hasDoc || state.markups.length === 0;
  document.getElementById('btn-save-project').disabled = !hasDoc;
  document.getElementById('btn-find').disabled = !hasDoc;
  document.getElementById('btn-osnap').classList.toggle('active', state.osnap);
  document.getElementById('btn-undo').disabled = state.undoStack.length === 0;
  document.getElementById('btn-redo').disabled = state.redoStack.length === 0;
  document.getElementById('btn-delete-selected').disabled = !state.selectedId;
  document.getElementById('btn-prev-page').disabled = !hasDoc || state.currentPage <= 1;
  document.getElementById('btn-next-page').disabled = !hasDoc || state.currentPage >= state.numPages;

  // LCD Readouts & Status
  document.getElementById('lcd-scale').textContent = state.scaleLabel;
  document.getElementById('lcd-zoom').textContent = `${Math.round(state.zoom * 100)}%`;
  document.getElementById('page-indicator').textContent = hasDoc
    ? `Page ${state.currentPage} / ${state.numPages}`
    : 'Page 0 / 0';
  document.getElementById('tool-hint').textContent = TOOL_HINTS[state.activeTool] || '';

  // Thumbnails highlight
  document.querySelectorAll('.thumb-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.page) === state.currentPage);
  });

  // Compare UI
  document.getElementById('compare-bar').classList.toggle('hidden', !state.compare.active);
  document.getElementById('btn-compare-toggle').classList.toggle('active', state.compare.active);

  renderMarkupsInspector();
  renderTakeoffSummary();
  syncPropsCardFromState();
  renderOverlay();
  renderComparison();
}

function renderMarkupsInspector() {
  const listEl = document.getElementById('markups-list');
  document.getElementById('markup-count').textContent = String(state.markups.length);

  if (!state.markups.length) {
    listEl.innerHTML = '<p class="empty-hint">No markups or measurements yet.</p>';
    return;
  }

  listEl.innerHTML = '';
  for (const m of state.markups) {
    const item = document.createElement('div');
    item.className = `markup-item${m.id === state.selectedId ? ' selected' : ''}`;

    let detail = m.text || m.type;
    if (m.type === 'distance' && m.points.length >= 2) {
      detail = formatLength(distPt(m.points[0], m.points[1]), state.unitsPerPt, state.unit);
    } else if (m.type === 'perimeter') {
      detail = formatLength(polylineLength(m.points), state.unitsPerPt, state.unit);
    } else if (m.type === 'area') {
      detail = formatArea(polygonArea(m.points), state.unitsPerPt, state.unit);
    }

    item.innerHTML = `
      <div>
        <strong style="color:${m.color}">${m.type.toUpperCase()}</strong>
        <div class="markup-meta">${escapeHtml(detail)}</div>
      </div>
      <span class="markup-meta">P${m.page}</span>
    `;
    item.addEventListener('click', () => {
      state.selectedId = m.id;
      notify();
    });
    listEl.appendChild(item);
  }
}

function renderTakeoffSummary() {
  let totalDist = 0, totalPerim = 0, totalArea = 0, totalCount = 0;

  for (const m of state.markups) {
    if (m.type === 'distance' && m.points.length >= 2) totalDist += distPt(m.points[0], m.points[1]);
    else if (m.type === 'perimeter') totalPerim += polylineLength(m.points);
    else if (m.type === 'area') { totalArea += polygonArea(m.points); totalPerim += polygonPerimeter(m.points); }
    else if (m.type === 'cutout') { totalArea = Math.max(0, totalArea - polygonArea(m.points)); }
    else if (m.type === 'count') totalCount += 1;
  }

  document.getElementById('sum-distance').textContent = formatLength(totalDist, state.unitsPerPt, state.unit);
  document.getElementById('sum-perimeter').textContent = formatLength(totalPerim, state.unitsPerPt, state.unit);
  document.getElementById('sum-area').textContent = formatArea(totalArea, state.unitsPerPt, state.unit);
  document.getElementById('sum-count').textContent = `${totalCount} EA`;

  const { rows, grandTotal } = computeBoqRows();
  const boqEl = document.getElementById('boq-list');
  boqEl.innerHTML = '';
  for (const r of rows) {
    if (r.hits === 0) continue;
    const div = document.createElement('div');
    div.className = 'boq-row';
    const qtyStr = r.tool === 'count' ? `${r.qty} EA` : `${r.qty.toFixed(2)} ${r.unitLabel}`;
    div.innerHTML = `
      <span class="boq-row-name" style="color:${r.color}">${escapeHtml(r.name)}</span>
      <span class="boq-row-meta">${qtyStr} | $${r.extCost.toFixed(2)}</span>
    `;
    boqEl.appendChild(div);
  }
  document.getElementById('boq-grand-total').textContent = `$${grandTotal.toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
