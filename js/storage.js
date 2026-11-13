/**
 * Auto-save session persistence (IndexedDB) + .rsn.json Project Export/Import.
 */
import { state, notify } from './state.js';
import { triggerDownload } from './pdf-tools-org.js';

const DB_NAME = 'rsn_pdf_studio_db';
const STORE = 'sessions';
const KEY = 'latest';
let saveTimer = null;
let isRestoring = false;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function scheduleAutoSave() {
  if (isRestoring || !state.pdfBytes) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSessionNow, 600);
}

async function saveSessionNow() {
  if (!state.pdfBytes) return;
  try {
    const db = await openDb();
    const payload = {
      pdfBytes: state.pdfBytes,
      pdfName: state.pdfName,
      currentPage: state.currentPage,
      zoom: state.zoom,
      rotation: state.rotation,
      unit: state.unit,
      unitsPerPt: state.unitsPerPt,
      scaleLabel: state.scaleLabel,
      markups: state.markups,
      takeoffItems: state.takeoffItems,
      activeTakeoffId: state.activeTakeoffId,
      savedAt: Date.now(),
    };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(payload, KEY);
  } catch (err) {
    console.warn('Auto-save skipped:', err);
  }
}

export async function restoreLastSession(loadPdfAFn, renderPageFn, refreshTakeoffFn) {
  try {
    const db = await openDb();
    const saved = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!saved?.pdfBytes) return false;

    isRestoring = true;
    const buf = saved.pdfBytes.buffer ? saved.pdfBytes.buffer.slice(0) : new Uint8Array(saved.pdfBytes).buffer;
    await loadPdfAFn(buf, saved.pdfName || 'Restored.pdf');

    state.currentPage = Math.min(saved.currentPage || 1, state.numPages || 1);
    state.zoom = saved.zoom || 1.0;
    state.rotation = saved.rotation || 0;
    state.unit = saved.unit || 'm';
    state.unitsPerPt = saved.unitsPerPt ?? null;
    state.scaleLabel = saved.scaleLabel || 'Not Set';
    state.markups = Array.isArray(saved.markups) ? saved.markups : [];
    if (Array.isArray(saved.takeoffItems)) state.takeoffItems = saved.takeoffItems;
    state.activeTakeoffId = saved.activeTakeoffId || '';

    document.getElementById('unit-select').value = state.unit;
    if (refreshTakeoffFn) refreshTakeoffFn();
    await renderPageFn();
    isRestoring = false;
    notify();
    document.getElementById('tool-hint').textContent = `Restored last session (${state.pdfName}).`;
    return true;
  } catch (err) {
    isRestoring = false;
    console.warn('Session restore skipped:', err);
    return false;
  }
}

export function exportProjectJson() {
  const payload = {
    app: 'RSN PDF Studio',
    version: 1,
    pdfName: state.pdfName,
    unit: state.unit,
    unitsPerPt: state.unitsPerPt,
    scaleLabel: state.scaleLabel,
    markups: state.markups,
    takeoffItems: state.takeoffItems,
    activeTakeoffId: state.activeTakeoffId,
    exportedAt: new Date().toISOString(),
  };
  const base = (state.pdfName || 'project').replace(/\.pdf$/i, '');
  triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${base}.rsn.json`);
}

export async function importProjectJson(file, refreshTakeoffFn) {
  const data = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.markups)) {
    throw new Error('Invalid .rsn.json project file.');
  }
  state.unit = data.unit || state.unit;
  state.unitsPerPt = data.unitsPerPt ?? state.unitsPerPt;
  state.scaleLabel = data.scaleLabel || state.scaleLabel;
  state.markups = data.markups;
  if (Array.isArray(data.takeoffItems)) state.takeoffItems = data.takeoffItems;
  state.activeTakeoffId = data.activeTakeoffId || '';
  document.getElementById('unit-select').value = state.unit;
  if (refreshTakeoffFn) refreshTakeoffFn();
  notify();
  document.getElementById('tool-hint').textContent = `Loaded project: ${file.name} (${state.markups.length} markups).`;
}
