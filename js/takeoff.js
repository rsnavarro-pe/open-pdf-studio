/**
 * Quantity Takeoff & Bill of Quantities (BOQ) engine.
 */
import { state, notify } from './state.js';
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
    if (!['distance', 'perimeter', 'area', 'count'].includes(m.type)) continue;
    const key = m.takeoffItemId && map.has(m.takeoffItemId) ? m.takeoffItemId : `unassigned-${m.type}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: `General ${m.type}`,
        trade: 'General',
        tool: m.type,
        unitCost: 0,
        depth: 0,
        color: m.color || '#2C2C2E',
        qty: 0,
        unitLabel: m.type === 'count' ? 'EA' : m.type === 'area' ? `${u}²` : u,
        volOrWall: 0,
        extCost: 0,
        hits: 0,
      });
    }

    const row = map.get(key);
    row.hits += 1;
    let delta = 0;
    if (m.type === 'count') delta = 1;
    else if (m.type === 'distance' && m.points.length >= 2) delta = distPt(m.points[0], m.points[1]) * factor;
    else if (m.type === 'perimeter') delta = polylineLength(m.points) * factor;
    else if (m.type === 'area') delta = polygonArea(m.points) * factor * factor;

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
