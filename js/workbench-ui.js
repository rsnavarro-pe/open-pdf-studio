/**
 * PdfCraft-inspired Workbench UI: 5 Main Category Dropdown Tabs, Left "All tools" Rail,
 * Dynamic Category Cards, Command Search (⌘K), Pinned Tools, Recent Files & Inspector Drawer.
 */
import { state, setTool, notify } from './state.js';

const RAIL_TOOLS = [
  { id: 'organize', label: 'Organize pages', desc: 'Page grid · Rotate · Delete · Split & Extract', icon: '⊞', color: '#4ade80', cat: 'edit', hubFilter: 'ORGANIZE', hubQ: 'Split' },
  { id: 'comments', label: 'Add comments', desc: 'Sticky note · Highlight · Multi-leader Callout', icon: '💬', color: '#facc15', cat: 'edit', canvasTool: 'callout' },
  { id: 'edit', label: 'Edit a PDF', desc: 'Edit text & fonts · Multi-leader arrows · Clouds', icon: '✎', color: '#ec4899', cat: 'edit', canvasTool: 'text' },
  { id: 'arrow', label: 'Multi-leader Arrow', desc: 'Attach 2+ leader arrow branches to one callout/arrow', icon: '↗', color: '#fb923c', cat: 'edit', canvasTool: 'arrow' },
  { id: 'cloud', label: 'Revision Cloud', desc: 'Scalloped revision cloud with delta tag', icon: '☁', color: '#f87171', cat: 'edit', canvasTool: 'cloud' },
  { id: 'export', label: 'Export a PDF', desc: 'Export pages to PNG, JPG, TIFF, WebP, SVG, PPTX, DOCX', icon: '📤', color: '#818cf8', cat: 'convert', hubFilter: 'CONVERT', hubQ: 'Images' },
  { id: 'create', label: 'Create a PDF', desc: 'Convert Images, DWG/DXF, or Blank sheets to PDF', icon: '📄', color: '#fb7185', cat: 'convert', hubFilter: 'CONVERT', hubQ: 'Images to PDF' },
  { id: 'combine', label: 'Combine files', desc: 'Merge PDFs sequentially, interleaved, or by max size', icon: '⧉', color: '#60a5fa', cat: 'convert', hubFilter: 'ORGANIZE', hubQ: 'Merge' },
  { id: 'compress', label: 'Compress a PDF', desc: 'Low, Medium & High presets with size reduction', icon: '🗜', color: '#fb923c', cat: 'convert', hubFilter: 'OPTIMIZE', hubQ: 'Compress' },
  { id: 'ocr', label: 'Scan & OCR', desc: 'Client-side Tesseract OCR searchable text extraction', icon: '⛶', color: '#34d399', cat: 'convert', hubFilter: 'CONVERT', hubQ: 'OCR' },
  { id: 'printprod', label: 'Use print production', desc: 'N-Up sheet layout, Margin Crop, Grayscale & Invert', icon: '🖨', color: '#818cf8', cat: 'convert', hubFilter: 'ORGANIZE', hubQ: 'N-Up' },
  { id: 'guided', label: 'Use guided actions', desc: 'One-click automated multi-step PDF workflow recipes', icon: '⚡', color: '#6366f1', cat: 'convert', hubFilter: 'SECURITY', hubQ: 'Pipeline' },
  { id: 'fillsign', label: 'Fill & Sign', desc: 'Draw, type, or upload signature & initials on sheet', icon: '✒', color: '#a855f7', cat: 'esign', action: 'sign' },
  { id: 'forms', label: 'Prepare a form', desc: 'Inspect, fill & flatten interactive AcroForm fields', icon: '⌸', color: '#c084fc', cat: 'esign', hubFilter: 'SECURITY', hubQ: 'AcroForm' },
  { id: 'protect', label: 'Protect / Unlock PDF', desc: 'Unlock password PDF, add Watermark & scrub metadata', icon: '🛡', color: '#38bdf8', cat: 'esign', hubFilter: 'SECURITY', hubQ: 'Unlock' },
  { id: 'redact', label: 'Redact a PDF', desc: 'Permanent blackout redaction box over sensitive areas', icon: '▭', color: '#f87171', cat: 'esign', canvasTool: 'redact' },
  { id: 'stamp', label: 'Add a stamp', desc: 'Place Approved, Reviewed, For Construction stamps', icon: '✪', color: '#a78bfa', cat: 'esign', canvasTool: 'stamp' },
  { id: 'measure', label: 'Measure objects', desc: 'Calibrate scale, Distance, Perimeter, Area & Count', icon: '📏', color: '#e879f9', cat: 'measure', canvasTool: 'distance' },
  { id: 'calibrate', label: 'Calibrate scale', desc: 'Set drawing scale from a known dimension or preset', icon: '⌖', color: '#34d399', cat: 'measure', canvasTool: 'calibrate' },
  { id: 'cadconv', label: 'DWG / DXF ↔ PDF', desc: 'Bidirectional AutoCAD DWG/DXF & PDF vector conversion', icon: '📐', color: '#2dd4bf', cat: 'measure', hubFilter: 'CAD', hubQ: 'DXF' },
  { id: 'tables', label: 'Extract tables (CSV)', desc: 'Extract structured schedule & table rows to CSV', icon: '📊', color: '#38bdf8', cat: 'measure', hubFilter: 'CAD', hubQ: 'Tables' },
  { id: 'compare', label: 'Compare files', desc: 'Overlay Red/Teal diff & Side-by-Side revision compare', icon: '⇄', color: '#f472b6', cat: 'measure', action: 'compare' },
];

const CAT_LABELS = { all: 'All tools', edit: 'Edit', convert: 'Convert', esign: 'E-Sign', measure: 'Measure & CAD' };
const PIN_KEY = 'rsn_pdf_pinned_tools_v1';
const RECENT_KEY = 'rsn_pdf_recent_files_v1';
const INSPECTOR_PIN_KEY = 'rsn_pdf_inspector_pinned_v1';

let activeTopCat = 'all';
let searchQuery = '';
let forceShowWorkbench = false;
let inspectorCollapsed = false;
let inspectorPinned = localStorage.getItem(INSPECTOR_PIN_KEY) !== 'false';

export function isWorkbenchForced() { return forceShowWorkbench; }
export function clearWorkbenchForce() { forceShowWorkbench = false; }
export function isInspectorCollapsed() {
  if (inspectorPinned) return inspectorCollapsed;
  return inspectorCollapsed && !state.selectedId;
}

export function closeAllDropdowns() {
  document.querySelectorAll('.craft-dd-wrap.open').forEach((w) => w.classList.remove('open'));
}

export function openHubWithFilter(filter = 'all', query = '') {
  closeAllDropdowns();
  const modal = document.getElementById('tools-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const pill = modal.querySelector(`.hub-filter-btn[data-filter="${filter}"]`) || modal.querySelector('.hub-filter-btn[data-filter="all"]');
  if (pill) pill.click();
  const sEl = document.getElementById('tools-search');
  if (sEl) {
    sEl.value = query;
    sEl.dispatchEvent(new Event('input'));
  }
}

export function initWorkbenchUI(ensurePdfLoadedFn) {
  renderCategoryViews(ensurePdfLoadedFn);
  renderPinnedTools(ensurePdfLoadedFn);
  renderRecentFiles(ensurePdfLoadedFn);

  const selectCategory = (cat, toggleDropdownWrap = null) => {
    activeTopCat = cat;
    document.querySelectorAll('.craft-top-tab[data-top-cat]').forEach((b) => {
      b.classList.toggle('active', b.dataset.topCat === cat);
    });
    const badge = document.getElementById('craft-rail-filter-badge');
    if (badge) badge.textContent = CAT_LABELS[cat] || 'All';
    const allTab = document.querySelector('.tab-btn[data-tab="alltools"]');
    if (allTab && !allTab.classList.contains('active')) allTab.click();
    renderCategoryViews(ensurePdfLoadedFn);

    if (toggleDropdownWrap) {
      const wasOpen = toggleDropdownWrap.classList.contains('open');
      closeAllDropdowns();
      if (!wasOpen) toggleDropdownWrap.classList.add('open');
    }
  };

  // 5 Main Category Tabs -> switch category AND toggle dropdown menu
  document.querySelectorAll('.craft-top-tab[data-top-cat]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); selectCategory(btn.dataset.topCat || 'all', btn.closest('.craft-dd-wrap')); });
  });

  // Switch-category items inside "All tools" dropdown
  document.querySelectorAll('[data-switch-cat]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetTab = document.querySelector(`.craft-top-tab[data-top-cat="${btn.dataset.switchCat}"]`);
      selectCategory(btn.dataset.switchCat, targetTab?.closest('.craft-dd-wrap'));
    });
  });

  // File & Export dropdown toggle
  document.querySelector('[data-file-dd="toggle"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = e.currentTarget.closest('.craft-dd-wrap');
    const wasOpen = wrap.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) wrap.classList.add('open');
  });

  // Any [data-open-hub] button anywhere in header/dropdowns/welcome
  document.querySelectorAll('[data-open-hub]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openHubWithFilter(btn.dataset.openHub || 'all', btn.dataset.hubQ || ''); });
  });

  // Welcome Home action inside dropdown
  document.querySelectorAll('[data-wb-action="home"]').forEach((btn) => {
    btn.addEventListener('click', () => { closeAllDropdowns(); forceShowWorkbench = true; notify(); });
  });

  // Close dropdowns on outside click or Escape
  window.addEventListener('click', () => closeAllDropdowns());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllDropdowns(); });
  document.querySelectorAll('.craft-dd-menu').forEach((menu) => menu.addEventListener('click', () => closeAllDropdowns()));

  document.getElementById('btn-home-workbench')?.addEventListener('click', () => { forceShowWorkbench = !forceShowWorkbench; notify(); });
  const syncPinBtn = () => {
    const pb = document.getElementById('btn-pin-inspector');
    if (pb) pb.classList.toggle('active', inspectorPinned);
  };
  syncPinBtn();
  document.getElementById('btn-toggle-inspector')?.addEventListener('click', () => { inspectorCollapsed = !inspectorCollapsed; notify(); });
  document.getElementById('btn-collapse-inspector')?.addEventListener('click', () => { inspectorCollapsed = true; notify(); });
  document.getElementById('inspector-collapsed-rail')?.addEventListener('click', () => { inspectorCollapsed = false; notify(); });
  document.getElementById('btn-pin-inspector')?.addEventListener('click', () => {
    inspectorPinned = !inspectorPinned;
    localStorage.setItem(INSPECTOR_PIN_KEY, String(inspectorPinned));
    if (inspectorPinned) inspectorCollapsed = false;
    else inspectorCollapsed = true;
    syncPinBtn();
    notify();
  });

  const searchEl = document.getElementById('global-cmd-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => { searchQuery = searchEl.value.trim().toLowerCase(); renderCategoryViews(ensurePdfLoadedFn); });
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchEl.focus(); searchEl.select(); }
    });
  }

  document.getElementById('btn-dismiss-banner')?.addEventListener('click', () => document.getElementById('craft-hero-banner')?.classList.add('hidden'));
  document.getElementById('btn-theme-toggle')?.addEventListener('click', (e) => {
    e.currentTarget.textContent = document.body.classList.toggle('craft-dark') ? '☀' : '☾';
  });

  document.getElementById('btn-pin-tool')?.addEventListener('click', () => {
    const pins = getPinnedIds();
    const next = RAIL_TOOLS.find((t) => !pins.includes(t.id));
    if (next) { localStorage.setItem(PIN_KEY, JSON.stringify([...pins, next.id])); renderPinnedTools(ensurePdfLoadedFn); }
  });

  document.getElementById('btn-clear-recent')?.addEventListener('click', () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify([]));
    renderRecentFiles(ensurePdfLoadedFn);
  });
}

async function triggerRailTool(t, ensurePdfLoadedFn) {
  closeAllDropdowns();
  if (t.hubFilter) {
    openHubWithFilter(t.hubFilter, t.hubQ || '');
    return;
  }
  await ensurePdfLoadedFn();
  forceShowWorkbench = false;
  if (t.action === 'sign') document.getElementById('btn-sign-tool')?.click();
  else if (t.action === 'compare') { state.compare.active = true; notify(); }
  else if (t.canvasTool) setTool(t.canvasTool);
}

function renderCategoryViews(ensurePdfLoadedFn) {
  const listEl = document.getElementById('craft-rail-list');
  const recGrid = document.getElementById('craft-rec-grid');
  const recTitle = document.getElementById('craft-rec-title');

  const filtered = RAIL_TOOLS.filter((t) => {
    const matchCat = activeTopCat === 'all' || t.cat === activeTopCat;
    const matchQ = !searchQuery || t.label.toLowerCase().includes(searchQuery) || t.desc.toLowerCase().includes(searchQuery);
    return matchCat && matchQ;
  });

  if (listEl) {
    listEl.innerHTML = '';
    for (const t of filtered) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'craft-rail-item';
      btn.innerHTML = `<span class="craft-rail-ico" style="color:${t.color}">${t.icon}</span><span>${t.label}</span>`;
      btn.addEventListener('click', () => triggerRailTool(t, ensurePdfLoadedFn));
      listEl.appendChild(btn);
    }
  }

  if (recTitle) {
    recTitle.textContent = activeTopCat === 'all' ? 'Recommended tools' : `${CAT_LABELS[activeTopCat]} tools`;
  }
  if (recGrid) {
    recGrid.innerHTML = '';
    const cards = activeTopCat === 'all' && !searchQuery ? filtered.slice(0, 5) : filtered;
    for (const t of cards) {
      const card = document.createElement('div');
      card.className = 'craft-rec-card';
      card.innerHTML = `<div class="craft-rec-head"><span class="craft-ico" style="color:${t.color}">${t.icon}</span><strong>${t.label}</strong></div><p>${t.desc}</p><span class="craft-use-link">Use now</span>`;
      card.addEventListener('click', () => triggerRailTool(t, ensurePdfLoadedFn));
      recGrid.appendChild(card);
    }
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
  el.innerHTML = ids.length ? '' : '<span class="craft-list-sub">Pin your favorite tools here for quick access.</span>';
  for (const id of ids) {
    const t = RAIL_TOOLS.find((x) => x.id === id);
    if (!t) continue;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'craft-pill';
    pill.innerHTML = `<span style="color:${t.color};margin-right:5px">${t.icon}</span>${t.label} <span data-unpin="${t.id}" style="opacity:0.55;margin-left:6px" title="Unpin">×</span>`;
    pill.addEventListener('click', (ev) => {
      if (ev.target.dataset?.unpin) {
        localStorage.setItem(PIN_KEY, JSON.stringify(getPinnedIds().filter((x) => x !== t.id)));
        renderPinnedTools(ensurePdfLoadedFn);
      } else triggerRailTool(t, ensurePdfLoadedFn);
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
  el.innerHTML = list.length ? '' : '<p class="craft-list-sub">No recent PDF files.</p>';
  for (const r of list) {
    const row = document.createElement('div');
    row.className = 'craft-recent-item';
    row.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><span style="color:#f87171;font-size:16px">📄</span><div><strong style="font-size:12.5px;color:var(--accent-dark);display:block">${r.name}</strong><span style="font-size:11px;color:var(--text-muted)">${r.path}</span></div></div><span class="mono" style="font-size:11px;color:var(--text-muted)">${r.pages} page${r.pages > 1 ? 's' : ''} · ${r.size}</span>`;
    row.addEventListener('click', () => {
      if (r.name.includes('Sample_FloorPlan') && ensurePdfLoadedFn) { forceShowWorkbench = false; ensurePdfLoadedFn(); }
      else document.getElementById('pdf-file-input')?.click();
    });
    el.appendChild(row);
  }
}
