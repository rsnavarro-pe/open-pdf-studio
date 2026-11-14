/**
 * PDF.js wrapper for loading, rendering pages, and generating thumbnails.
 */
import { state, clearDocumentState, notify } from './state.js';
import { extractPageSnapPoints } from './osnap.js';
import { transformPdfPages } from './page-org.js';
import { pdfToScreen } from './geometry.js';

const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

let pdfDocA = null;
let pdfDocB = null;
let activeRenderTask = null;
let renderSeq = 0;
let snapCache = new Map();
const zoomHistory = [];

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
  clearDocumentState(new Uint8Array(arrayBuffer).slice(), fileName, pdfDocA.numPages);
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
  const seq = ++renderSeq;
  const page = await pdfDocA.getPage(state.currentPage);
  if (seq !== renderSeq) return;
  const unrotated = page.getViewport({ scale: 1, rotation: 0 });
  state.pageWidthPt = unrotated.width;
  state.pageHeightPt = unrotated.height;

  const viewport = page.getViewport({ scale: state.zoom, rotation: state.rotation });
  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('page-stage');

  // Update stage/CSS size immediately so layout & scroll anchoring stay exact without clearing canvas
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  stage.style.width = `${viewport.width}px`;
  stage.style.height = `${viewport.height}px`;

  if (activeRenderTask) {
    try { activeRenderTask.cancel(); } catch (_) { /* ignore */ }
  }

  // Double-buffer onto an offscreen canvas so the visible canvas NEVER flashes blank while rendering
  const dpr = window.devicePixelRatio || 1;
  const offCanvas = document.createElement('canvas');
  offCanvas.width = Math.max(1, Math.floor(viewport.width * dpr));
  offCanvas.height = Math.max(1, Math.floor(viewport.height * dpr));
  const offCtx = offCanvas.getContext('2d');
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  activeRenderTask = page.render({ canvasContext: offCtx, viewport });
  try {
    await activeRenderTask.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.error(err);
    return;
  }
  if (seq !== renderSeq) return;

  // Atomic same-frame swap: resize + drawImage synchronously before browser repaints
  canvas.width = offCanvas.width;
  canvas.height = offCanvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(offCanvas, 0, 0);

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
  state.zoom = Math.max(0.25, Math.min(12, availW / vp.width));
  await renderCurrentPage();
}

export async function fitWholePage(scrollerEl) {
  if (!pdfDocA) return;
  const page = await pdfDocA.getPage(state.currentPage);
  const vp = page.getViewport({ scale: 1, rotation: state.rotation });
  const availW = Math.max(240, scrollerEl.clientWidth - 48);
  const availH = Math.max(240, scrollerEl.clientHeight - 48);
  state.zoom = Math.max(0.15, Math.min(12, Math.min(availW / vp.width, availH / vp.height)));
  await renderCurrentPage();
}

export function hasZoomHistory() {
  return zoomHistory.length > 0;
}

function animateZoomTransition(targetZoom, targetMidPt, scrollerEl, exactScroll = null, durationMs = 220) {
  return new Promise((resolve) => {
    const stage = document.getElementById('page-stage');
    const canvas = document.getElementById('pdf-canvas');
    const svg = document.getElementById('overlay-svg');
    const lcdZoom = document.getElementById('lcd-zoom');
    if (!stage || !canvas || !scrollerEl) { state.zoom = targetZoom; resolve(); return; }

    const startZoom = state.zoom;
    const startSL = scrollerEl.scrollLeft;
    const startST = scrollerEl.scrollTop;
    const isSwap = state.rotation % 180 === 90;
    const baseW = isSwap ? state.pageHeightPt : state.pageWidthPt;
    const baseH = isSwap ? state.pageWidthPt : state.pageHeightPt;

    // Precompute final scroll position at targetZoom
    let endSL = startSL;
    let endST = startST;
    if (exactScroll) {
      endSL = exactScroll.scrollLeft;
      endST = exactScroll.scrollTop;
    } else if (targetMidPt) {
      stage.style.width = `${baseW * targetZoom}px`;
      stage.style.height = `${baseH * targetZoom}px`;
      const spEnd = pdfToScreen(targetMidPt.x, targetMidPt.y, targetZoom, state.rotation, state.pageWidthPt, state.pageHeightPt);
      const stRect = stage.getBoundingClientRect();
      const scRect = scrollerEl.getBoundingClientRect();
      endSL = Math.max(0, startSL + (stRect.left + spEnd.x) - (scRect.left + scrollerEl.clientWidth / 2));
      endST = Math.max(0, startST + (stRect.top + spEnd.y) - (scRect.top + scrollerEl.clientHeight / 2));
      stage.style.width = `${baseW * startZoom}px`;
      stage.style.height = `${baseH * startZoom}px`;
    }

    if (svg) svg.style.transformOrigin = '0 0';
    const t0 = performance.now();

    const step = (now) => {
      const rawT = Math.min(1, (now - t0) / durationMs);
      const ease = 1 - Math.pow(1 - rawT, 3); // smooth ease-out cubic
      const curZoom = startZoom + (targetZoom - startZoom) * ease;

      stage.style.width = `${baseW * curZoom}px`;
      stage.style.height = `${baseH * curZoom}px`;
      canvas.style.width = `${baseW * curZoom}px`;
      canvas.style.height = `${baseH * curZoom}px`;
      if (svg) svg.style.transform = `scale(${curZoom / startZoom})`;
      scrollerEl.scrollLeft = startSL + (endSL - startSL) * ease;
      scrollerEl.scrollTop = startST + (endST - startST) * ease;
      if (lcdZoom) lcdZoom.textContent = `${Math.round(curZoom * 100)}%`;

      if (rawT < 1) {
        requestAnimationFrame(step);
      } else {
        if (svg) svg.style.transform = '';
        state.zoom = targetZoom;
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

export async function popZoomHistory(scrollerEl) {
  if (!zoomHistory.length || !pdfDocA) return;
  const prev = zoomHistory.pop();
  await animateZoomTransition(prev.zoom, null, scrollerEl, prev, 200);
  await renderCurrentPage();
  if (scrollerEl) {
    scrollerEl.scrollLeft = prev.scrollLeft;
    scrollerEl.scrollTop = prev.scrollTop;
  }
}

export async function zoomToRegion(p0, p1, scrollerEl) {
  if (!pdfDocA || !scrollerEl) return;
  const dx = Math.abs(p1.x - p0.x);
  const dy = Math.abs(p1.y - p0.y);
  if (dx < 6 || dy < 6) return;

  zoomHistory.push({ zoom: state.zoom, scrollLeft: scrollerEl.scrollLeft, scrollTop: scrollerEl.scrollTop });
  if (zoomHistory.length > 20) zoomHistory.shift();

  const isSwap = state.rotation % 180 === 90;
  const regW = isSwap ? dy : dx;
  const regH = isSwap ? dx : dy;
  const availW = Math.max(200, scrollerEl.clientWidth - 36);
  const availH = Math.max(200, scrollerEl.clientHeight - 36);
  const targetZoom = Math.max(0.25, Math.min(12, Math.min(availW / regW, availH / regH) * 0.94));
  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };

  await animateZoomTransition(targetZoom, mid, scrollerEl, null, 220);
  const finalSL = scrollerEl.scrollLeft;
  const finalST = scrollerEl.scrollTop;
  await renderCurrentPage();
  scrollerEl.scrollLeft = finalSL;
  scrollerEl.scrollTop = finalST;
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
