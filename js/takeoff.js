/**
 * Quantity Takeoff & Bill of Quantities (BOQ) engine.
 */
import { state, notify, setTool } from './state.js';
import { distPt, polylineLength, polygonArea, polygonPerimeter } from './geometry.js';
import { triggerDownload } from './pdf-tools-org.js';

export const DEFAULT_TAKEOFF_ITEMS = [
  { id: 'to-curb', name: 'Curb & Gutter', trade: 'Sitework', tool: 'perimeter', unitCost: 35, depth: 0, color: '#90472D' },
  { id: 'to-pave', name: 'Concrete Slab / Paving', trade: 'Sitework', tool: 'area', unitCost: 8.5, depth: 0.15, color: '#1f6f5b' },
  { id: 'to-pipe', name: 'Storm / Utility Line', trade: 'Utilities', tool: 'distance', unitCost: 65, depth: 0, color: '#2563eb' },
  { id: 'to-inlet', name: 'Drainage Inlet / Fixture', trade: 'Utilities', tool: 'count', unitCost: 2400, depth: 0, color: '#7c3aed' },
];

export function initTakeoffState() {
  if (!state.takeoffItems) {
    state.takeoffItems = DEFAULT_TAKEOFF_ITEMS.map((x) => ({ ...x }));
    state.activeTakeoffId = '';
  }
}

export function addTakeoffItem(item) {
  initTakeoffState();
  const created = { id: `to-${Date.now()}`, ...item };
  state.takeoffItems.push(created);
  state.activeTakeoffId = created.id;
  state.strokeColor = created.color;
  notify();
  return created;
}

export function nextCountNumber(takeoffItemId) {
  return state.markups.filter(
    (m) => m.type === 'count' && (m.takeoffItemId || '') === (takeoffItemId || ''),
  ).length + 1;
}

export function computeBoqRows() {
  initTakeoffState();
  const factor = state.unitsPerPt || 1;
  const u = state.unitsPerPt ? state.unit : 'pt';
  const map = new Map();

  for (const item of state.takeoffItems) {
    map.set(item.id, {
      ...item,
      qty: 0,
      unitLabel: item.tool === 'count' ? 'EA' : item.tool === 'area' ? `${u}²` : u,
      volOrWall: 0,
      extCost: 0,
      hits: 0,
    });
  }

  for (const m of state.markups) {
    if (!['distance', 'perimeter', 'area', 'cutout', 'count'].includes(m.type)) continue;
    const isCut = m.type === 'cutout';
    const effType = isCut ? 'area' : m.type;
    const key = m.takeoffItemId && map.has(m.takeoffItemId) ? m.takeoffItemId : `unassigned-${effType}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: `General ${effType}`,
        trade: 'General',
        tool: effType,
        unitCost: 0,
        depth: 0,
        color: m.color || '#2C2C2E',
        qty: 0,
        unitLabel: effType === 'count' ? 'EA' : effType === 'area' ? `${u}²` : u,
        volOrWall: 0,
        extCost: 0,
        hits: 0,
      });
    }

    const row = map.get(key);
    if (!isCut) row.hits += 1;
    let delta = 0;
    if (m.type === 'count') delta = 1;
    else if (m.type === 'distance' && m.points.length >= 2) delta = distPt(m.points[0], m.points[1]) * factor;
    else if (m.type === 'perimeter') delta = polylineLength(m.points) * factor;
    else if (m.type === 'area') delta = polygonArea(m.points) * factor * factor;
    else if (m.type === 'cutout') delta = -polygonArea(m.points) * factor * factor;

    row.qty += delta;
    if (row.depth > 0) {
      if (m.type === 'area') row.volOrWall += delta * row.depth;
      else if (m.type === 'perimeter' || m.type === 'distance') row.volOrWall += delta * row.depth;
      else if (m.type === 'count') void polygonPerimeter;
    }
    row.extCost = row.qty * (Number(row.unitCost) || 0);
  }

  const rows = [...map.values()].filter((r) => r.hits > 0 || state.takeoffItems.some((i) => i.id === r.id));
  const grandTotal = rows.reduce((s, r) => s + r.extCost, 0);
  return { rows, grandTotal, unit: u };
}

export function exportBoqCsv() {
  const { rows, grandTotal, unit } = computeBoqRows();
  const lines = [['Item', 'Trade', 'Measure Type', 'Count', 'Quantity', 'Unit', 'Depth/Height', 'Vol / Wall Area', 'Unit Cost ($)', 'Extended Cost ($)']];

  for (const r of rows) {
    if (r.hits === 0) continue;
    const vwLabel = r.depth > 0 ? `${r.volOrWall.toFixed(2)} ${r.tool === 'area' ? `${unit}³` : `${unit}²`}` : '-';
    lines.push([
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.trade}"`,
      r.tool,
      r.hits,
      r.qty.toFixed(2),
      r.unitLabel,
      r.depth > 0 ? r.depth : '-',
      vwLabel,
      (Number(r.unitCost) || 0).toFixed(2),
      r.extCost.toFixed(2),
    ]);
  }
  lines.push(['"GRAND TOTAL"', '', '', '', '', '', '', '', '', grandTotal.toFixed(2)]);

  const base = (state.pdfName || 'takeoff').replace(/\.pdf$/i, '');
  triggerDownload(new Blob([lines.map((l) => l.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' }), `${base}_BOQ.csv`);
}

export function bindTakeoffEvents() {
  initTakeoffState();
  const sel = document.getElementById('takeoff-item-select');
  const refreshSelect = () => {
    sel.innerHTML = '<option value="">-- General Measurement --</option>';
    for (const item of state.takeoffItems) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} (${item.tool})`;
      sel.appendChild(opt);
    }
    sel.value = state.activeTakeoffId || '';
  };
  refreshSelect();

  sel.addEventListener('change', () => {
    state.activeTakeoffId = sel.value;
    const item = state.takeoffItems.find((x) => x.id === sel.value);
    if (item) {
      state.strokeColor = item.color;
      document.getElementById('prop-color').value = item.color;
      setTool(item.tool);
    }
  });

  document.getElementById('btn-export-boq').addEventListener('click', exportBoqCsv);

  const modal = document.getElementById('takeoff-modal');
  document.getElementById('btn-add-takeoff-item').addEventListener('click', () => {
    document.getElementById('to-name').value = '';
    modal.classList.remove('hidden');
    document.getElementById('to-name').focus();
  });
  document.getElementById('to-cancel').addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('to-save').addEventListener('click', () => {
    const name = document.getElementById('to-name').value.trim();
    if (!name) return;
    const created = addTakeoffItem({
      name,
      trade: document.getElementById('to-trade').value.trim() || 'General',
      tool: document.getElementById('to-tool').value,
      depth: Number(document.getElementById('to-depth').value) || 0,
      unitCost: Number(document.getElementById('to-cost').value) || 0,
      color: document.getElementById('to-color').value || '#90472D',
    });
    refreshSelect();
    document.getElementById('prop-color').value = created.color;
    modal.classList.add('hidden');
    setTool(created.tool);
  });
  return refreshSelect;
}
