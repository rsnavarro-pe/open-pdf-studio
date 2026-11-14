/**
 * PdfCraft-inspired Workbench UI: Left "All tools" Rail, Top Category Filter,
 * Command Search (⌘K), Pinned Tools, Recent Files, and Theme / Home Toggles.
 */
import { state, setTool, notify } from './state.js';

const RAIL_TOOLS = [
  { id: 'export', label: 'Export a PDF', icon: '📤', color: '#818cf8', cat: 'convert', hubTab: 'pdf-to-img' },
  { id: 'fillsign', label: 'Fill & Sign', icon: '✒', color: '#a855f7', cat: 'esign', action: 'sign' },
  { id: 'edit', label: 'Edit a PDF', icon: '✎', color: '#ec4899', cat: 'edit', canvasTool: 'text' },
  { id: 'create', label: 'Create a PDF', icon: '📄', color: '#fb7185', cat: 'convert', hubTab: 'img-to-pdf' },
  { id: 'combine', label: 'Combine files', icon: '⧉', color: '#60a5fa', cat: 'convert', hubTab: 'merge' },
  { id: 'organize', label: 'Organize pages', icon: '⊞', color: '#4ade80', cat: 'edit', hubTab: 'org-pages' },
  { id: 'comments', label: 'Add comments', icon: '💬', color: '#facc15', cat: 'edit', canvasTool: 'callout' },
  { id: 'ocr', label: 'Scan & OCR', icon: '⛶', color: '#34d399', cat: 'convert', hubTab: 'ocr-pdf' },
  { id: 'protect', label: 'Protect a PDF', icon: '🛡', color: '#38bdf8', cat: 'esign', hubTab: 'security' },
  { id: 'redact', label: 'Redact a PDF', icon: '▭', color: '#f87171', cat: 'esign', canvasTool: 'redact' },
  { id: 'compress', label: 'Compress a PDF', icon: '🗜', color: '#fb923c', cat: 'convert', hubTab: 'compress' },
  { id: 'forms', label: 'Prepare a form', icon: '⌸', color: '#c084fc', cat: 'esign', hubTab: 'forms-pdf' },
  { id: 'stamp', label: 'Add a stamp', icon: '✪', color: '#a78bfa', cat: 'esign', canvasTool: 'stamp' },
  { id: 'printprod', label: 'Use print production', icon: '🖨', color: '#818cf8', cat: 'convert', hubTab: 'craft-suite' },
  { id: 'measure', label: 'Measure objects', icon: '📏', color: '#e879f9', cat: 'measure', canvasTool: 'distance' },
  { id: 'cadconv', label: 'DWG / DXF ↔ PDF', icon: '📐', color: '#2dd4bf', cat: 'measure', hubTab: 'dwg-to-pdf' },
  { id: 'compare', label: 'Compare files', icon: '⇄', color: '#f472b6', cat: 'measure', action: 'compare' },
  { id: 'guided', label: 'Use guided actions', icon: '⚡', color: '#6366f1', cat: 'convert', hubTab: 'pipeline-pdf' },
  { id: 'tables', label: 'Extract tables (CSV)', icon: '📊', color: '#38bdf8', cat: 'convert', hubTab: 'tables-pdf' },
];

const PIN_KEY = 'rsn_pdf_pinned_tools_v1';
const RECENT_KEY = 'rsn_pdf_recent_files_v1';
let activeTopCat = 'all';
let searchQuery = '';
let forceShowWorkbench = false;

export function isWorkbenchForced() { return forceShowWorkbench; }
export function clearWorkbenchForce() { forceShowWorkbench = false; }

export function initWorkbenchUI(ensurePdfLoadedFn) {
  renderRailList(ensurePdfLoadedFn);
  renderPinnedTools(ensurePdfLoadedFn);
  renderRecentFiles(ensurePdfLoadedFn);

  // Top category tabs
  document.querySelectorAll('.craft-top-tab[data-top-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTopCat = btn.dataset.topCat || 'all';
      document.querySelectorAll('.craft-top-tab[data-top-cat]').forEach((b) => b.classList.toggle('active', b === btn));
      const badge = document.getElementById('craft-rail-filter-badge');
      if (badge) badge.textContent = btn.textContent;
      // Switch left sidebar to All tools tab
      const allTab = document.querySelector('.tab-btn[data-tab="alltools"]');
      if (allTab) allTab.click();
      renderRailList(ensurePdfLoadedFn);
    });
  });

  // Home Workbench toggle
  document.getElementById('btn-home-workbench')?.addEventListener('click', () => {
    forceShowWorkbench = !forceShowWorkbench;
    notify();
  });

  // Command search (⌘K)
  const searchEl = document.getElementById('global-cmd-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      searchQuery = searchEl.value.trim().toLowerCase();
      const allTab = document.querySelector('.tab-btn[data-tab="alltools"]');
      if (allTab && !allTab.classList.contains('active')) allTab.click();
      renderRailList(ensurePdfLoadedFn);
    });
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchEl.focus();
        searchEl.select();
      }
    });
  }

  // Recommended cards with canvasTool
  document.querySelectorAll('[data-wb-tool]').forEach((card) => {
    card.addEventListener('click', async () => {
      await ensurePdfLoadedFn();
      forceShowWorkbench = false;
      setTool(card.dataset.wbTool);
    });
  });

  // Dismiss hero banner
  document.getElementById('btn-dismiss-banner')?.addEventListener('click', () => {
    document.getElementById('craft-hero-banner')?.classList.add('hidden');
  });

  // Theme toggle
  document.getElementById('btn-theme-toggle')?.addEventListener('click', (e) => {
    const isDark = document.body.classList.toggle('craft-dark');
    e.currentTarget.textContent = isDark ? '☀' : '☾';
  });

  // Pin a tool button
  document.getElementById('btn-pin-tool')?.addEventListener('click', () => {
    const pins = getPinnedIds();
    const next = RAIL_TOOLS.find((t) => !pins.includes(t.id));
    if (next) {
      pins.push(next.id);
      localStorage.setItem(PIN_KEY, JSON.stringify(pins));
      renderPinnedTools(ensurePdfLoadedFn);
    }
  });

  // Clear recent
  document.getElementById('btn-clear-recent')?.addEventListener('click', () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify([]));
    renderRecentFiles(ensurePdfLoadedFn);
  });
}

function openHubTab(tabId) {
  const modal = document.getElementById('pdf-tools-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const btn = modal.querySelector(`.tools-tab[data-ptab="${tabId}"]`);
  if (btn) btn.click();
}

async function triggerRailTool(t, ensurePdfLoadedFn) {
  if (t.hubTab) {
    openHubTab(t.hubTab);
    return;
  }
  await ensurePdfLoadedFn();
  forceShowWorkbench = false;
  if (t.action === 'sign') {
    document.getElementById('btn-sign-tool')?.click();
  } else if (t.action === 'compare') {
    state.compare.active = true;
    notify();
  } else if (t.canvasTool) {
    setTool(t.canvasTool);
  }
}

function renderRailList(ensurePdfLoadedFn) {
  const listEl = document.getElementById('craft-rail-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const filtered = RAIL_TOOLS.filter((t) => {
    const matchCat = activeTopCat === 'all' || t.cat === activeTopCat;
    const matchQ = !searchQuery || t.label.toLowerCase().includes(searchQuery);
    return matchCat && matchQ;
  });
  for (const t of filtered) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'craft-rail-item';
    btn.innerHTML = `<span class="craft-rail-ico" style="color:${t.color}">${t.icon}</span><span>${t.label}</span>`;
    btn.addEventListener('click', () => triggerRailTool(t, ensurePdfLoadedFn));
    listEl.appendChild(btn);
  }
}

function getPinnedIds() {
  try { const raw = localStorage.getItem(PIN_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return ['measure', 'comments', 'combine', 'compress', 'cadconv'];
}

function renderPinnedTools(ensurePdfLoadedFn) {
  const el = document.getElementById('craft-pinned-list');
  if (!el) return;
  const ids = getPinnedIds();
  el.innerHTML = '';
  if (!ids.length) {
    el.innerHTML = '<span class="craft-list-sub">Pin your favorite tools here for quick access.</span>';
    return;
  }
  for (const id of ids) {
    const t = RAIL_TOOLS.find((x) => x.id === id);
    if (!t) continue;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'craft-pill';
    pill.innerHTML = `<span style="color:${t.color};margin-right:5px">${t.icon}</span>${t.label} <span data-unpin="${t.id}" style="opacity:0.55;margin-left:6px" title="Unpin">×</span>`;
    pill.addEventListener('click', (ev) => {
      if (ev.target.dataset?.unpin) {
        const next = getPinnedIds().filter((x) => x !== t.id);
        localStorage.setItem(PIN_KEY, JSON.stringify(next));
        renderPinnedTools(ensurePdfLoadedFn);
        return;
      }
      triggerRailTool(t, ensurePdfLoadedFn);
    });
    el.appendChild(pill);
  }
}

export function recordRecentFile(name, pages, byteLen) {
  try {
    const list = getRecentFiles().filter((r) => r.name !== name);
    const sizeStr = byteLen >= 1048576 ? `${(byteLen / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(byteLen / 1024))} KB`;
    list.unshift({ name, pages: pages || 1, size: sizeStr, path: `/Local Workspace/${name}` });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
    renderRecentFiles();
  } catch { /* ignore */ }
}

function getRecentFiles() {
  try { const raw = localStorage.getItem(RECENT_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return [{ name: 'Sample_FloorPlan_RevA.pdf', pages: 1, size: '18 KB', path: '/Studio Samples/Sample_FloorPlan_RevA.pdf' }];
}

function renderRecentFiles(ensurePdfLoadedFn) {
  const el = document.getElementById('craft-recent-list');
  if (!el) return;
  const list = getRecentFiles();
  if (!list.length) {
    el.innerHTML = '<p class="craft-list-sub">No recent PDF files.</p>';
    return;
  }
  el.innerHTML = '';
  for (const r of list) {
    const row = document.createElement('div');
    row.className = 'craft-recent-item';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:#f87171;font-size:16px">📄</span>
        <div>
          <strong style="font-size:12.5px;color:var(--accent-dark);display:block">${r.name}</strong>
          <span style="font-size:11px;color:var(--text-muted)">${r.path}</span>
        </div>
      </div>
      <span class="mono" style="font-size:11px;color:var(--text-muted)">${r.pages} page${r.pages > 1 ? 's' : ''} · ${r.size}</span>
    `;
    row.addEventListener('click', () => {
      if (r.name.includes('Sample_FloorPlan') && ensurePdfLoadedFn) {
        forceShowWorkbench = false;
        ensurePdfLoadedFn();
      } else {
        document.getElementById('pdf-file-input')?.click();
      }
    });
    el.appendChild(row);
  }
}
