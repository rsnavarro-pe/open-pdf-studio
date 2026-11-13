/**
 * Native binary .dwg -> Vector PDF converter using @mlightcad/libredwg-web (WASM) + pdf-lib.
 * Supports LINE, LWPOLYLINE, POLYLINE2D, LEADER, CIRCLE, ARC, ELLIPSE, TEXT, MTEXT, and INSERT blocks.
 */

const LIBREDWG_CDN = 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@latest/dist/libredwg-web.js';
const LIBREDWG_WASM_DIR = 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@latest/wasm/';

let cachedLibreDwg = null;

export async function getLibreDwg(wasmDir = LIBREDWG_WASM_DIR, moduleUrl = LIBREDWG_CDN) {
  if (cachedLibreDwg) return cachedLibreDwg;
  const mod = await import(moduleUrl);
  cachedLibreDwg = {
    instance: await mod.LibreDwg.create(wasmDir),
    Dwg_File_Type: mod.Dwg_File_Type,
  };
  return cachedLibreDwg;
}

export async function dwgBytesToPdfBytes(dwgBuffer, PDFLibRef, onStatus = () => {}, opts = {}) {
  onStatus('Loading LibreDWG WebAssembly engine...');
  const { instance, Dwg_File_Type } = await getLibreDwg(opts.wasmDir, opts.moduleUrl);

  onStatus('Parsing binary DWG entities...');
  const dwg = instance.dwg_read_data(new Uint8Array(dwgBuffer), Dwg_File_Type.DWG);
  const db = instance.convert(dwg);
  instance.dwg_free(dwg);

  const blockMap = new Map();
  for (const b of db.tables?.BLOCK_RECORD?.entries || []) {
    if (b?.name) blockMap.set(b.name, b);
  }

  const flat = [];
  expandEntities(db.entities || [], blockMap, [1, 0, 0, 1, 0, 0], flat, 0);

  const bounds = computeBounds(flat, db.header);
  const spanW = Math.max(1e-3, bounds.maxX - bounds.minX);
  const spanH = Math.max(1e-3, bounds.maxY - bounds.minY);

  const pageW = 1224;
  const pageH = 792;
  const margin = 36;
  const scale = Math.min((pageW - margin * 2) / spanW, (pageH - margin * 2) / spanH);
  const offsetX = margin + (pageW - margin * 2 - spanW * scale) / 2;
  const offsetY = margin + (pageH - margin * 2 - spanH * scale) / 2;

  const tx = (x) => offsetX + (x - bounds.minX) * scale;
  const ty = (y) => offsetY + (y - bounds.minY) * scale;

  onStatus(`Rendering ${flat.length} expanded CAD primitives to PDF...`);
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLibRef;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([pageW, pageH]);
  const stroke = rgb(0.1, 0.12, 0.14);

  for (const item of flat) {
    if (item.kind === 'line') {
      page.drawLine({
        start: { x: tx(item.x1), y: ty(item.y1) },
        end: { x: tx(item.x2), y: ty(item.y2) },
        thickness: 0.6,
        color: stroke,
      });
    } else if (item.kind === 'circle') {
      page.drawCircle({
        x: tx(item.x),
        y: ty(item.y),
        size: Math.max(0.5, item.r * scale),
        borderColor: stroke,
        borderWidth: 0.6,
      });
    } else if (item.kind === 'text') {
      const size = Math.min(24, Math.max(3.5, item.height * scale));
      page.drawText(item.text, {
        x: tx(item.x),
        y: ty(item.y),
        size,
        font,
        color: stroke,
        rotate: degrees(item.rotDeg),
      });
    }
  }

  return { pdfBytes: await doc.save(), entityCount: flat.length };
}

function expandEntities(entities, blockMap, m, out, depth) {
  if (depth > 6) return;
  for (const e of entities) {
    if (!e || e.isVisible === false) continue;

    if (e.type === 'INSERT') {
      const blk = blockMap.get(e.name);
      if (blk?.entities?.length) {
        const bm = buildInsertMatrix(e, blk.basePoint);
        expandEntities(blk.entities, blockMap, mulMat(m, bm), out, depth + 1);
      }
      if (e.attribs?.length) expandEntities(e.attribs, blockMap, m, out, depth + 1);
    } else if (e.type === 'LINE' && e.startPoint && e.endPoint) {
      const a = applyMat(m, e.startPoint.x, e.startPoint.y);
      const b = applyMat(m, e.endPoint.x, e.endPoint.y);
      out.push({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE2D' || e.type === 'LEADER') && e.vertices?.length >= 2) {
      const pts = e.vertices.map((v) => applyMat(m, v.x ?? v.point?.x ?? 0, v.y ?? v.point?.y ?? 0));
      for (let i = 1; i < pts.length; i++) {
        out.push({ kind: 'line', x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y });
      }
      if (e.type !== 'LEADER' && (e.flag & 1) === 1 && pts.length >= 3) {
        out.push({ kind: 'line', x1: pts[pts.length - 1].x, y1: pts[pts.length - 1].y, x2: pts[0].x, y2: pts[0].y });
      }
    } else if (e.type === 'CIRCLE' && e.center && e.radius > 0) {
      const c = applyMat(m, e.center.x, e.center.y);
      const rScale = Math.hypot(m[0], m[1]);
      out.push({ kind: 'circle', x: c.x, y: c.y, r: e.radius * rScale });
    } else if (e.type === 'ARC' && e.center && e.radius > 0) {
      let start = e.startAngle || 0;
      let end = e.endAngle || 0;
      if (end <= start) end += Math.PI * 2;
      sampleParametric(16, start, end, (a) => applyMat(m, e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a)), out);
    } else if (e.type === 'ELLIPSE' && e.center && e.majorAxisEndPoint) {
      const mx = e.majorAxisEndPoint.x, my = e.majorAxisEndPoint.y;
      const ratio = e.axisRatio || 1;
      const nx = -my * ratio, ny = mx * ratio;
      let start = e.startAngle ?? 0;
      let end = e.endAngle ?? Math.PI * 2;
      if (end <= start) end += Math.PI * 2;
      sampleParametric(24, start, end, (t) => applyMat(m, e.center.x + Math.cos(t) * mx + Math.sin(t) * nx, e.center.y + Math.cos(t) * my + Math.sin(t) * ny), out);
    } else if ((e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTRIB') && e.text) {
      const pt = e.type === 'MTEXT' ? e.insertionPoint : e.startPoint;
      if (!pt) continue;
      const clean = cleanCadText(e.text);
      if (!clean) continue;
      const p = applyMat(m, pt.x, pt.y);
      const mRot = Math.atan2(m[1], m[0]);
      const rotDeg = (((e.rotation || 0) + mRot) * 180) / Math.PI;
      out.push({ kind: 'text', x: p.x, y: p.y, height: (e.textHeight || 1) * Math.hypot(m[0], m[1]), rotDeg: Number.isFinite(rotDeg) ? rotDeg : 0, text: clean });
    }
  }
}

function sampleParametric(steps, start, end, ptFn, out) {
  let prev = ptFn(start);
  for (let i = 1; i <= steps; i++) {
    const cur = ptFn(start + ((end - start) * i) / steps);
    out.push({ kind: 'line', x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y });
    prev = cur;
  }
}

function buildInsertMatrix(ins, base = { x: 0, y: 0 }) {
  const sx = ins.xScale || 1, sy = ins.yScale || 1;
  const r = ins.rotation || 0;
  const c = Math.cos(r), s = Math.sin(r);
  const ix = ins.insertionPoint?.x || 0, iy = ins.insertionPoint?.y || 0;
  const bx = base?.x || 0, by = base?.y || 0;
  const a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
  return [a, b, cc, d, ix - (a * bx + cc * by), iy - (b * bx + d * by)];
}

function mulMat(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMat(m, x, y) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function cleanCadText(raw) {
  return String(raw)
    .replace(/\\P/g, ' ')
    .replace(/\{\\[^;]+;([^}]*)\}/g, '$1')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function computeBounds(items, header) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const it of items) {
    if (it.kind === 'line') { add(it.x1, it.y1); add(it.x2, it.y2); }
    else if (it.kind === 'circle') { add(it.x - it.r, it.y - it.r); add(it.x + it.r, it.y + it.r); }
    else if (it.kind === 'text') { add(it.x, it.y); }
  }
  if (!Number.isFinite(minX) && header?.EXTMIN && header?.EXTMAX) {
    return { minX: header.EXTMIN.x, minY: header.EXTMIN.y, maxX: header.EXTMAX.x, maxY: header.EXTMAX.y };
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
}
