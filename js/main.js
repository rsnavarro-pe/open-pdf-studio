/**
 * Open PDF Studio — Main Entry Point & Event Wiring
 */
import {
  state, subscribe, notify, setTool, undo, redo,
  deleteSelectedMarkup, setPresetScale, convertUnit,
} from './state.js';
import {
  loadPdfA, loadPdfB, renderCurrentPage, fitPageWidth,
} from './pdf-engine.js';
import { generateSamplePdfBytes } from './sample-pdf.js';
import { initOverlay } from './overlay.js';
import { exportAnnotatedPdf, exportTakeoffCsv } from './exporter.js';
import { exportPdfToDxf } from './pdf-to-dxf.js';
import { initPdfTools } from './tools-ui.js';
import { initContextMenu } from './context-menu.js';
import { initSearch } from './search.js';
import { bindTakeoffEvents } from './takeoff.js';
import { scheduleAutoSave, restoreLastSession, exportProjectJson, importProjectJson } from './storage.js';
import { initMarkupProps } from './markup-props.js';
import { initSignatureModal } from './signature.js';
import { initWorkbenchUI, recordRecentFile, clearWorkbenchForce } from './workbench-ui.js';
import { renderUI } from './ui.js';

let pendingCalibratePtSpan = 0;
let refreshTakeoffSelectFn = null;

async function init() {
  subscribe(renderUI);
  subscribe(scheduleAutoSave);
  initOverlay(openCalibrateModal);
  bindFileEvents();
  bindToolEvents();
  bindNavigationEvents();
  initMarkupProps();
  bindCompareEvents();
  bindCalibrationModal();
  bindKeyboardShortcuts();
  initPdfTools();
  initSignatureModal();
  initWorkbenchUI(async () => {
    if (!state.pdfBytes) {
      const bytes = await generateSamplePdfBytes(false);
      await loadPdfA(bytes.buffer, 'Sample_FloorPlan_RevA.pdf');
      recordRecentFile('Sample_FloorPlan_RevA.pdf', state.numPages, bytes.byteLength);
    }
  });
  initContextMenu();
  initSearch();
  refreshTakeoffSelectFn = bindTakeoffEvents();
  document.getElementById('btn-osnap').addEventListener('click', () => {
    state.osnap = !state.osnap;
    notify();
  });
  notify();
  await restoreLastSession(loadPdfA, renderCurrentPage, refreshTakeoffSelectFn);
}

function bindFileEvents() {
  document.getElementById('pdf-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearWorkbenchForce();
    const buf = await file.arrayBuffer();
    await loadPdfA(buf, file.name);
    recordRecentFile(file.name, state.numPages, buf.byteLength);
    e.target.value = '';
  });

  document.getElementById('btn-load-sample').addEventListener('click', async () => {
    clearWorkbenchForce();
    const bytes = await generateSamplePdfBytes(false);
    await loadPdfA(bytes.buffer, 'Sample_FloorPlan_RevA.pdf');
    recordRecentFile('Sample_FloorPlan_RevA.pdf', state.numPages, bytes.byteLength);
  });

  document.getElementById('btn-export-pdf').addEventListener('click', exportAnnotatedPdf);
  document.getElementById('btn-export-dxf').addEventListener('click', async () => {
    if (!state.pdfBytes) return;
    const hint = document.getElementById('tool-hint');
    try {
      await exportPdfToDxf(
        state.pdfBytes.buffer,
        state.pdfName || 'drawing.pdf',
        'single',
        state.currentPage,
        state.unitsPerPt,
        (msg) => { hint.textContent = msg; },
      );
    } catch (err) {
      hint.textContent = `DXF export error: ${err?.message || 'Failed'}`;
    }
  });
  document.getElementById('btn-export-csv').addEventListener('click', exportTakeoffCsv);
  document.getElementById('btn-save-project').addEventListener('click', exportProjectJson);
  document.getElementById('project-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importProjectJson(file, refreshTakeoffSelectFn);
    } catch (err) {
      document.getElementById('tool-hint').textContent = `Project load error: ${err?.message || 'Invalid file'}`;
    }
    e.target.value = '';
  });

  // Drag & Drop
  const scroller = document.getElementById('canvas-scroller');
  scroller.addEventListener('dragover', (e) => e.preventDefault());
  scroller.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type === 'application/pdf') {
      await loadPdfA(await file.arrayBuffer(), file.name);
    }
  });
}

function bindToolEvents() {
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    if (btn.id === 'btn-sign-tool') return;
    btn.addEventListener('click', () => {
      clearWorkbenchForce();
      setTool(btn.dataset.tool);
    });
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    });
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-delete-selected').addEventListener('click', deleteSelectedMarkup);
}

function bindNavigationEvents() {
  document.getElementById('btn-prev-page').addEventListener('click', async () => {
    if (state.currentPage > 1) { state.currentPage--; await renderCurrentPage(); }
  });
  document.getElementById('btn-next-page').addEventListener('click', async () => {
    if (state.currentPage < state.numPages) { state.currentPage++; await renderCurrentPage(); }
  });
  document.getElementById('btn-zoom-in').addEventListener('click', async () => {
    state.zoom = Math.min(4, +(state.zoom + 0.2).toFixed(2));
    await renderCurrentPage();
  });
  document.getElementById('btn-zoom-out').addEventListener('click', async () => {
    state.zoom = Math.max(0.25, +(state.zoom - 0.2).toFixed(2));
    await renderCurrentPage();
  });
  document.getElementById('btn-zoom-fit').addEventListener('click', async () => {
    await fitPageWidth(document.getElementById('canvas-scroller'));
  });
  document.getElementById('btn-rotate').addEventListener('click', async () => {
    state.rotation = (state.rotation + 90) % 360;
    await renderCurrentPage();
  });
}

function bindCompareEvents() {
  document.getElementById('btn-compare-toggle').addEventListener('click', () => {
    state.compare.active = !state.compare.active;
    notify();
  });
  document.getElementById('btn-compare-close').addEventListener('click', () => {
    state.compare.active = false;
    notify();
  });
  document.getElementById('rev-b-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await loadPdfB(await file.arrayBuffer(), file.name);
    e.target.value = '';
  });
  document.getElementById('btn-sample-rev-b').addEventListener('click', async () => {
    const bytes = await generateSamplePdfBytes(true);
    await loadPdfB(bytes.buffer, 'Sample_FloorPlan_RevB.pdf');
  });
  document.getElementById('compare-mode-select').addEventListener('change', (e) => {
    state.compare.mode = e.target.value;
    notify();
  });
  document.getElementById('compare-opacity').addEventListener('input', (e) => {
    state.compare.opacity = Number(e.target.value) / 100;
    notify();
  });
}

function openCalibrateModal(ptSpan) {
  pendingCalibratePtSpan = ptSpan;
  document.getElementById('cal-px-readout').textContent = `${(ptSpan * state.zoom).toFixed(1)} px (${ptSpan.toFixed(1)} pt)`;
  document.getElementById('cal-unit').value = state.unit;
  document.getElementById('cal-real-value').value = '';
  document.getElementById('calibrate-modal').classList.remove('hidden');
  document.getElementById('cal-real-value').focus();
}

function bindCalibrationModal() {
  const modal = document.getElementById('calibrate-modal');
  document.getElementById('cal-cancel').addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('cal-apply').addEventListener('click', () => {
    const val = Number(document.getElementById('cal-real-value').value);
    const unit = document.getElementById('cal-unit').value;
    if (!Number.isFinite(val) || val <= 0 || pendingCalibratePtSpan <= 0) return;

    state.unit = unit;
    state.unitsPerPt = val / pendingCalibratePtSpan;
    state.scaleLabel = `Cal (${val}${unit})`;
    document.getElementById('unit-select').value = unit;
    document.getElementById('preset-scale').value = '';
    modal.classList.add('hidden');
    setTool('distance');
  });
}

function bindKeyboardShortcuts() {
  const map = { v: 'select', h: 'pan', m: 'distance', p: 'perimeter', a: 'area', k: 'count', c: 'cloud', l: 'callout', t: 'text' };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelectedMarkup(); return; }
    const tool = map[e.key.toLowerCase()];
    if (tool) setTool(tool);
  });
}

init();
