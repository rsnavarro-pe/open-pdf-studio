/**
 * Multi-page PDF & Drawing Text Search (Vector Text + Auto/Manual OCR + Markups + Canvas Highlights).
 */
import { state, notify } from './state.js';
import { getPdfDocA, renderCurrentPage } from './pdf-engine.js';
import { pdfToScreen } from './geometry.js';

let matches = []; // [{ page, rect }]
let matchIdx = -1;
let matchCase = false;
let ocrCache = new Map(); // pageNum -> [{ str, rect }]
let cachedDocRef = null;

export function getSearchHighlights(page) {
  const pageMatches = matches.filter((m) => m.page === page && m.rect);
  const active = matchIdx >= 0 ? matches[matchIdx] : null;
  return {
    rects: pageMatches.map((m) => m.rect),
    activeRect: active && active.page === page ? active.rect : null,
  };
}

export function initSearch() {
  const bar = document.getElementById('search-bar');
  const input = document.getElementById('search-input');
  const statusEl = document.getElementById('search-status');
  const caseBtn = document.getElementById('search-case');
  const ocrBtn = document.getElementById('search-ocr-btn');

  const clearSearch = () => {
    matches = [];
    matchIdx = -1;
    statusEl.textContent = '0 / 0';
    notify();
  };

  const openBar = () => {
    if (!state.pdfBytes) return;
    bar.classList.remove('hidden');
    input.focus();
    input.select();
  };

  document.getElementById('btn-find').addEventListener('click', openBar);
  document.getElementById('search-close').addEventListener('click', () => {
    bar.classList.add('hidden');
    clearSearch();
  });

  caseBtn?.addEventListener('click', async () => {
    matchCase = !matchCase;
    caseBtn.classList.toggle('active', matchCase);
    if (input.value.trim()) await runSearch(input.value, statusEl, false);
  });

  ocrBtn?.addEventListener('click', async () => {
    if (!state.pdfBytes) return;
    await runOcrForPage(state.currentPage, statusEl);
    if (input.value.trim()) await runSearch(input.value, statusEl, false);
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openBar();
    }
  });

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      input.dataset.lastQuery = input.value;
      runSearch(input.value, statusEl, false);
    }, 240);
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!matches.length || input.dataset.lastQuery !== input.value) {
        input.dataset.lastQuery = input.value;
        await runSearch(input.value, statusEl, true);
      } else {
        await stepMatch(e.shiftKey ? -1 : 1, statusEl);
      }
    } else if (e.key === 'Escape') {
      bar.classList.add('hidden');
      clearSearch();
    }
  });

  document.getElementById('search-next').addEventListener('click', async () => {
    if (input.dataset.lastQuery !== input.value) {
      input.dataset.lastQuery = input.value;
      await runSearch(input.value, statusEl, true);
    } else {
      await stepMatch(1, statusEl);
    }
  });

  document.getElementById('search-prev').addEventListener('click', async () => {
    if (input.dataset.lastQuery !== input.value) {
      input.dataset.lastQuery = input.value;
      await runSearch(input.value, statusEl, true);
    } else {
      await stepMatch(-1, statusEl);
    }
  });
}

async function extractVectorItems(page) {
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  const tc = await page.getTextContent();
  const util = window.pdfjsLib?.Util;
  const items = [];
  for (const it of tc.items) {
    const str = (it.str || '').trim();
    if (!str) continue;
    const tx = util ? util.transform(viewport.transform, it.transform) : it.transform;
    const fontH = Math.max(7, Math.hypot(tx[2], tx[3]) || it.height || 10);
    const isVert = Math.abs(tx[1]) > Math.abs(tx[0]) * 1.2;
    const rawW = Math.max(6, it.width || str.length * fontH * 0.55);
    const w = isVert ? fontH : rawW;
    const h = isVert ? rawW : fontH * 1.15;
    const x = tx[4];
    const y = isVert ? tx[5] - rawW : tx[5] - fontH * 0.85;
    items.push({ str, rect: { x, y, w, h } });
  }
  return items;
}

async function runOcrForPage(pageNum, statusEl) {
  const doc = getPdfDocA();
  if (!doc || !window.Tesseract) return [];
  if (cachedDocRef !== doc) {
    ocrCache = new Map();
    cachedDocRef = doc;
  }
  if (ocrCache.has(pageNum)) return ocrCache.get(pageNum);

  statusEl.textContent = `OCR P${pageNum}...`;
  const page = await doc.getPage(pageNum);
  const ocrScale = 2.0;
  const vp = page.getViewport({ scale: ocrScale, rotation: 0 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

  const res = await window.Tesseract.recognize(canvas, 'eng');
  const words = (res?.data?.words || [])
    .filter((w) => (w.text || '').trim())
    .map((w) => ({
      str: w.text.trim(),
      rect: {
        x: w.bbox.x0 / ocrScale,
        y: w.bbox.y0 / ocrScale,
        w: Math.max(6, (w.bbox.x1 - w.bbox.x0) / ocrScale),
        h: Math.max(6, (w.bbox.y1 - w.bbox.y0) / ocrScale),
      },
    }));
  ocrCache.set(pageNum, words);
  return words;
}

function findMatchesInItems(items, query, pageNum) {
  if (!items.length) return [];
  let text = '';
  const runs = [];
  for (const it of items) {
    if (text.length) text += ' ';
    const start = text.length;
    text += it.str;
    runs.push({ start, end: text.length, rect: it.rect });
  }
  const haystack = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  const found = [];
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    const endIdx = idx + needle.length;
    const hitRuns = runs.filter((r) => r.end > idx && r.start < endIdx);
    if (hitRuns.length) {
      const minX = Math.min(...hitRuns.map((r) => r.rect.x));
      const minY = Math.min(...hitRuns.map((r) => r.rect.y));
      const maxX = Math.max(...hitRuns.map((r) => r.rect.x + r.rect.w));
      const maxY = Math.max(...hitRuns.map((r) => r.rect.y + r.rect.h));
      found.push({ page: pageNum, rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } });
    }
    idx = endIdx;
  }
  return found;
}

async function runSearch(query, statusEl, allowAutoOcr = true) {
  const q = (query || '').trim();
  const doc = getPdfDocA();
  if (cachedDocRef !== doc) { ocrCache = new Map(); cachedDocRef = doc; }
  matches = [];
  matchIdx = -1;

  if (!q || !doc) {
    statusEl.textContent = '0 / 0';
    notify();
    return;
  }

  statusEl.textContent = 'Searching...';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    let items = await extractVectorItems(page);
    const charCount = items.reduce((s, it) => s + it.str.length, 0);
    if (ocrCache.has(p)) {
      items = items.concat(ocrCache.get(p));
    } else if (charCount < 12 && allowAutoOcr && p === state.currentPage) {
      const ocrItems = await runOcrForPage(p, statusEl);
      items = items.concat(ocrItems);
    }
    matches.push(...findMatchesInItems(items, q, p));
  }

  // Also search user markups/annotations text
  const needle = matchCase ? q : q.toLowerCase();
  for (const m of state.markups) {
    if (!m.text || !m.points?.length) continue;
    const txt = matchCase ? m.text : m.text.toLowerCase();
    if (txt.includes(needle)) {
      const pt = m.points[0];
      matches.push({ page: m.page, rect: { x: pt.x - 16, y: pt.y - 10, w: 32, h: 20 } });
    }
  }

  if (!matches.length) {
    statusEl.textContent = 'No matches (try OCR)';
    notify();
    return;
  }
  await stepMatch(1, statusEl);
}

async function stepMatch(delta, statusEl) {
  if (!matches.length) return;
  matchIdx = (matchIdx + delta + matches.length) % matches.length;
  const hit = matches[matchIdx];
  statusEl.textContent = `${matchIdx + 1} / ${matches.length} (P${hit.page})`;
  if (state.currentPage !== hit.page) {
    state.currentPage = hit.page;
    await renderCurrentPage();
  } else {
    notify();
  }
  scrollMatchIntoView(hit.rect);
}

function scrollMatchIntoView(rect) {
  const scroller = document.getElementById('canvas-scroller');
  if (!scroller || !rect) return;
  const sp = pdfToScreen(rect.x + rect.w / 2, rect.y + rect.h / 2, state.zoom, state.rotation, state.pageWidthPt, state.pageHeightPt);
  scroller.scrollTo({
    left: Math.max(0, sp.x - scroller.clientWidth / 2),
    top: Math.max(0, sp.y - scroller.clientHeight / 2),
    behavior: 'smooth',
  });
}
