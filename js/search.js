/**
 * Multi-page PDF text search (Ctrl+F / Find).
 */
import { state } from './state.js';
import { getPdfDocA, renderCurrentPage } from './pdf-engine.js';

let matches = []; // [{ page, snippet }]
let matchIdx = -1;

export function initSearch() {
  const bar = document.getElementById('search-bar');
  const input = document.getElementById('search-input');
  const statusEl = document.getElementById('search-status');

  const openBar = () => {
    if (!state.pdfBytes) return;
    bar.classList.remove('hidden');
    input.focus();
    input.select();
  };

  document.getElementById('btn-find').addEventListener('click', openBar);
  document.getElementById('search-close').addEventListener('click', () => {
    bar.classList.add('hidden');
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openBar();
    }
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!matches.length || input.dataset.lastQuery !== input.value) {
        await runSearch(input.value, statusEl);
        input.dataset.lastQuery = input.value;
      } else {
        await stepMatch(e.shiftKey ? -1 : 1, statusEl);
      }
    } else if (e.key === 'Escape') {
      bar.classList.add('hidden');
    }
  });

  document.getElementById('search-next').addEventListener('click', async () => {
    if (input.dataset.lastQuery !== input.value) {
      await runSearch(input.value, statusEl);
      input.dataset.lastQuery = input.value;
    } else {
      await stepMatch(1, statusEl);
    }
  });

  document.getElementById('search-prev').addEventListener('click', async () => {
    if (input.dataset.lastQuery !== input.value) {
      await runSearch(input.value, statusEl);
      input.dataset.lastQuery = input.value;
    } else {
      await stepMatch(-1, statusEl);
    }
  });
}

async function runSearch(query, statusEl) {
  const q = (query || '').trim().toLowerCase();
  const doc = getPdfDocA();
  matches = [];
  matchIdx = -1;

  if (!q || !doc) {
    statusEl.textContent = '0 / 0';
    return;
  }

  statusEl.textContent = 'Searching...';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const full = tc.items.map((it) => it.str).join(' ');
    const lower = full.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(q, idx)) !== -1) {
      matches.push({ page: p });
      idx += q.length;
    }
  }

  if (!matches.length) {
    statusEl.textContent = 'No matches';
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
  }
}
