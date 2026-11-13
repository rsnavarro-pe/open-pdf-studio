/**
 * PDF.js wrapper for loading, rendering pages, and generating thumbnails.
 */
import { state, clearDocumentState, notify } from './state.js';
import { extractPageSnapPoints } from './osnap.js';

const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

let pdfDocA = null;
let pdfDocB = null;
let activeRenderTask = null;
let snapCache = new Map();

export function initPdfEngine() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
  }
}

export async function loadPdfA(arrayBuffer, fileName) {
  initPdfEngine();
  const copy = new Uint8Array(arrayBuffer).slice();
  const loadingTask = window.pdfjsLib.getDocument({ data: copy });
  pdfDocA = await loadingTask.promise;
  snapCache = new Map();
  clearDocumentState(new Uint8Array(arrayBuffer), fileName, pdfDocA.numPages);
  await renderCurrentPage();
  await renderAllThumbnails();
}

export async function loadPdfB(arrayBuffer, fileName) {
  initPdfEngine();
  const copy = new Uint8Array(arrayBuffer).slice();
  const loadingTask = window.pdfjsLib.getDocument({ data: copy });
  pdfDocB = await loadingTask.promise;
  state.compare.revBBytes = new Uint8Array(arrayBuffer);
  state.compare.revBName = fileName;
  notify();
}

export function getPdfDocA() {
  return pdfDocA;
}

export function getPdfDocB() {
  return pdfDocB;
}

export async function renderCurrentPage() {
  if (!pdfDocA) return;
  const page = await pdfDocA.getPage(state.currentPage);
  const unrotated = page.getViewport({ scale: 1, rotation: 0 });
  state.pageWidthPt = unrotated.width;
  state.pageHeightPt = unrotated.height;

  const viewport = page.getViewport({ scale: state.zoom, rotation: state.rotation });
  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('page-stage');

  if (activeRenderTask) {
    try { activeRenderTask.cancel(); } catch (_) { /* ignore */ }
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  stage.style.width = `${viewport.width}px`;
  stage.style.height = `${viewport.height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  activeRenderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await activeRenderTask.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.error(err);
  }
  if (!snapCache.has(state.currentPage) && window.pdfjsLib?.OPS) {
    snapCache.set(state.currentPage, await extractPageSnapPoints(page, window.pdfjsLib.OPS));
  }
  state.snapPoints = snapCache.get(state.currentPage) || [];
  notify();
}

export async function fitPageWidth(scrollerEl) {
  if (!pdfDocA) return;
  const page = await pdfDocA.getPage(state.currentPage);
  const vp = page.getViewport({ scale: 1, rotation: state.rotation });
  const availW = Math.max(300, scrollerEl.clientWidth - 48);
  state.zoom = Math.max(0.25, Math.min(4, availW / vp.width));
  await renderCurrentPage();
}

export async function renderAllThumbnails() {
  const container = document.getElementById('thumbnails-list');
  container.innerHTML = '';
  if (!pdfDocA) return;

  for (let p = 1; p <= pdfDocA.numPages; p++) {
    const page = await pdfDocA.getPage(p);
    const vp = page.getViewport({ scale: 0.22 });
    const item = document.createElement('div');
    item.className = `thumb-item${p === state.currentPage ? ' active' : ''}`;
    item.dataset.page = String(p);

    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    const label = document.createElement('div');
    label.className = 'thumb-label';
    label.textContent = `Page ${p}`;

    item.appendChild(canvas);
    item.appendChild(label);
    item.addEventListener('click', async () => {
      state.currentPage = p;
      await renderCurrentPage();
    });
    container.appendChild(item);
  }
}
