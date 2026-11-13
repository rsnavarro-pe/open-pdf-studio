/**
 * Right-click context menu for fast mouse operation on the PDF canvas.
 */
import { state, setTool, undo, deleteSelectedMarkup, notify } from './state.js';
import { renderCurrentPage, fitPageWidth } from './pdf-engine.js';
import { exportAnnotatedPdf } from './exporter.js';
import { exportPdfToDxf } from './pdf-to-dxf.js';
import { hitTestMarkup, screenToPdf } from './geometry.js';
import { isDraftingMulti } from './overlay.js';
import { startAddLeader } from './markup-props.js';

export function initContextMenu() {
  const menu = document.getElementById('ctx-menu');
  const scroller = document.getElementById('canvas-scroller');
  const svg = document.getElementById('overlay-svg');

  const closeMenu = () => menu.classList.add('hidden');

  scroller.addEventListener('contextmenu', (e) => {
    if (!state.pdfBytes || isDraftingMulti()) return;
    e.preventDefault();

    // If right-clicked over a markup, auto-select it
    const rect = svg.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      const pt = screenToPdf(e.clientX - rect.left, e.clientY - rect.top, state.zoom, state.rotation, state.pageWidthPt, state.pageHeightPt);
      const pageMarkups = state.markups.filter((m) => m.page === state.currentPage);
      const hit = [...pageMarkups].reverse().find((m) => hitTestMarkup(m, pt, 10 / state.zoom));
      if (hit) {
        state.selectedId = hit.id;
        notify();
      }
    }

    buildMenuItems(menu, scroller, closeMenu);
    menu.classList.remove('hidden');

    // Keep menu inside viewport
    const mw = menu.offsetWidth || 190;
    const mh = menu.offsetHeight || 300;
    const x = Math.min(e.clientX, window.innerWidth - mw - 8);
    const y = Math.min(e.clientY, window.innerHeight - mh - 8);
    menu.style.left = `${Math.max(4, x)}px`;
    menu.style.top = `${Math.max(4, y)}px`;
  });

  window.addEventListener('click', closeMenu);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
}

function buildMenuItems(menu, scroller, closeMenu) {
  const sel = state.selectedId ? state.markups.find((m) => m.id === state.selectedId) : null;
  const canLeader = Boolean(sel && (sel.type === 'arrow' || sel.type === 'callout'));
  const items = [
    { label: 'Select (V)', action: () => setTool('select') },
    { label: 'Pan (H)', action: () => setTool('pan') },
    { sep: true },
    { label: '+ Add Leader Branch', disabled: !canLeader, action: startAddLeader },
    { sep: true },
    { label: 'Measure Distance (M)', action: () => setTool('distance') },
    { label: 'Measure Area (A)', action: () => setTool('area') },
    { label: 'Revision Cloud (C)', action: () => setTool('cloud') },
    { label: 'Callout (L)', action: () => setTool('callout') },
    { label: 'Stamp Tool', action: () => setTool('stamp') },
    { sep: true },
    { label: 'Zoom In (+)', action: async () => { state.zoom = Math.min(4, +(state.zoom + 0.2).toFixed(2)); await renderCurrentPage(); } },
    { label: 'Zoom Out (-)', action: async () => { state.zoom = Math.max(0.25, +(state.zoom - 0.2).toFixed(2)); await renderCurrentPage(); } },
    { label: 'Fit Width', action: async () => { await fitPageWidth(scroller); } },
    { label: 'Rotate 90°', action: async () => { state.rotation = (state.rotation + 90) % 360; await renderCurrentPage(); } },
    { sep: true },
    { label: 'Undo (Ctrl+Z)', disabled: state.undoStack.length === 0, action: undo },
    { label: 'Delete Selected (Del)', disabled: !state.selectedId, action: deleteSelectedMarkup },
    { sep: true },
    {
      label: 'Export Page to DXF',
      action: () => exportPdfToDxf(state.pdfBytes.buffer, state.pdfName || 'drawing.pdf', 'single', state.currentPage, state.unitsPerPt, (m) => { document.getElementById('tool-hint').textContent = m; }),
    },
    { label: 'Export Annotated PDF', action: exportAnnotatedPdf },
  ];

  menu.innerHTML = '';
  for (const it of items) {
    if (it.sep) {
      const hr = document.createElement('li');
      hr.className = 'ctx-sep';
      menu.appendChild(hr);
      continue;
    }
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'ctx-item';
    btn.textContent = it.label;
    btn.disabled = Boolean(it.disabled);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      closeMenu();
      it.action();
    });
    li.appendChild(btn);
    menu.appendChild(li);
  }
}
