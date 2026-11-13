/**
 * PDF.js wrapper for loading, rendering pages, and generating thumbnails.
 */
import { state, clearDocumentState, notify } from './state.js';
import { extractPageSnapPoints } from './osnap.js';
import { transformPdfPages } from './page-org.js';

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
  loadingTask.onPassword = (updatePassword, reason) => {
    const pw = window.prompt(reason === 2 ? 'Incorrect password. Try again:' : 'This PDF is password-protected. Enter password:');
    if (pw !== null) updatePassword(pw);
  };
  pdfDocA = await loadingTask.promise;
  snapCache = new Map();
  clearDocumentState(new Uint8Array(arrayBuffer), fileName, pdfDocA.numPages);
  await renderCurrentPage();
  await renderAllThumbnails();
  await renderBookmarksOutline();
}

export async function reloadPdfPreserving(arrayBuffer, fileName, meta) {
  await loadPdfA(arrayBuffer, fileName);
  state.markups = meta.markups || [];
  state.unitsPerPt = meta.unitsPerPt ?? null;
  state.scaleLabel = meta.scaleLabel || 'Not Set';
  state.unit = meta.unit || state.unit;
  if (meta.takeoffItems) state.takeoffItems = meta.takeoffItems;
  state.activeTakeoffId = meta.activeTakeoffId || '';
  state.currentPage = Math.max(1, Math.min(meta.targetPage || 1, state.numPages));
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

    const actions = document.createElement('div');
    actions.className = 'thumb-actions';
    const btns = [
      { text: '↑', title: 'Move Up', act: 'up', dis: p === 1 },
      { text: '↓', title: 'Move Down', act: 'down', dis: p === pdfDocA.numPages },
      { text: 'Dup', title: 'Duplicate Page', act: 'dup', dis: false },
      { text: 'Del', title: 'Delete Page', act: 'delete', dis: pdfDocA.numPages <= 1 },
    ];
    for (const b of btns) {
      const btn = document.createElement('button');
      btn.className = 'thumb-btn';
      btn.textContent = b.text;
      btn.title = b.title;
      btn.disabled = b.dis;
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await transformPdfPages(b.act, p, reloadPdfPreserving);
      });
      actions.appendChild(btn);
    }

    item.appendChild(canvas);
    item.appendChild(label);
    item.appendChild(actions);
    item.addEventListener('click', async () => {
      state.currentPage = p;
      await renderCurrentPage();
    });
    container.appendChild(item);
  }
}

export async function renderBookmarksOutline() {
  const listEl = document.getElementById('bookmarks-list');
  if (!listEl || !pdfDocA) return;
  listEl.innerHTML = '';

  const entries = [];
  const outline = await pdfDocA.getOutline().catch(() => null);

  async function walk(items, depth = 0) {
    for (const it of items || []) {
      let pageNum = 1;
      try {
        const dest = typeof it.dest === 'string' ? await pdfDocA.getDestination(it.dest) : it.dest;
        if (Array.isArray(dest) && dest[0]) {
          pageNum = (await pdfDocA.getPageIndex(dest[0])) + 1;
        }
      } catch (_) { /* fallback to page 1 */ }
      entries.push({ title: it.title || `Section`, page: pageNum, depth });
      if (it.items?.length) await walk(it.items, depth + 1);
    }
  }

  if (outline?.length) {
    await walk(outline, 0);
  } else {
    for (let p = 1; p <= pdfDocA.numPages; p++) {
      const page = await pdfDocA.getPage(p);
      const tc = await page.getTextContent().catch(() => ({ items: [] }));
      const firstLine = tc.items.map((x) => (x.str || '').trim()).find((s) => s.length >= 3) || `Sheet ${p}`;
      entries.push({ title: firstLine.slice(0, 42), page: p, depth: 0 });
    }
  }

  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'markup-item';
    row.style.paddingLeft = `${8 + e.depth * 12}px`;
    row.innerHTML = `<div class="markup-item-head"><span>${e.title}</span><span class="mono">P.${e.page}</span></div>`;
    row.addEventListener('click', async () => {
      state.currentPage = e.page;
      await renderCurrentPage();
    });
    listEl.appendChild(row);
  }
}
