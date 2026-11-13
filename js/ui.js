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

const TOOL_HINTS = {
  select: 'Click any markup or measurement to select it.',
  pan: 'Click and drag to pan the drawing.',
  calibrate: 'Click and drag between two points of a known dimension.',
  distance: 'Click and drag to measure a straight-line distance.',
  perimeter: 'Click points to trace a polyline; double-click or right-click to finish (Esc to cancel).',
  area: 'Click polygon vertices; double-click or right-click to finish (Esc to cancel).',
  cloud: 'Click and drag to draw a revision cloud.',
  callout: 'Click and drag from label origin to target arrow.',
  arrow: 'Click and drag to draw a leader arrow.',
  rect: 'Click and drag to draw a rectangle.',
  text: 'Click anywhere on the sheet to place a text note.',
  stamp: 'Click anywhere on the sheet to place the selected stamp.',
};

export function renderUI() {
  const hasDoc = Boolean(state.pdfBytes);
  document.getElementById('drop-zone').classList.toggle('hidden', hasDoc);
  document.getElementById('page-stage').classList.toggle('hidden', !hasDoc || (state.compare.active && state.compare.mode === 'side-by-side'));

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === state.activeTool);
  });

  // Action buttons
  document.getElementById('btn-export-pdf').disabled = !hasDoc;
  document.getElementById('btn-export-dxf').disabled = !hasDoc;
  document.getElementById('btn-export-csv').disabled = !hasDoc || state.markups.length === 0;
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
  let totalDist = 0;
  let totalPerim = 0;
  let totalArea = 0;

  for (const m of state.markups) {
    if (m.type === 'distance' && m.points.length >= 2) {
      totalDist += distPt(m.points[0], m.points[1]);
    } else if (m.type === 'perimeter') {
      totalPerim += polylineLength(m.points);
    } else if (m.type === 'area') {
      totalArea += polygonArea(m.points);
      totalPerim += polygonPerimeter(m.points);
    }
  }

  document.getElementById('sum-distance').textContent = formatLength(totalDist, state.unitsPerPt, state.unit);
  document.getElementById('sum-perimeter').textContent = formatLength(totalPerim, state.unitsPerPt, state.unit);
  document.getElementById('sum-area').textContent = formatArea(totalArea, state.unitsPerPt, state.unit);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
