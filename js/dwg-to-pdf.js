/**
 * Native binary .dwg -> Vector PDF converter using @mlightcad/libredwg-web (WASM) + pdf-lib.
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

  const entities = (db.entities || []).filter((e) => e && e.isVisible !== false);
  const bounds = computeBounds(entities, db.header);
  const spanW = Math.max(1e-3, bounds.maxX - bounds.minX);
  const spanH = Math.max(1e-3, bounds.maxY - bounds.minY);

  // Fit onto Tabloid Landscape (1224 x 792 pt = 17" x 11") with 36 pt margin
  const pageW = 1224;
  const pageH = 792;
  const margin = 36;
  const scale = Math.min((pageW - margin * 2) / spanW, (pageH - margin * 2) / spanH);
  const offsetX = margin + (pageW - margin * 2 - spanW * scale) / 2;
  const offsetY = margin + (pageH - margin * 2 - spanH * scale) / 2;

  const tx = (x) => offsetX + (x - bounds.minX) * scale;
  const ty = (y) => offsetY + (y - bounds.minY) * scale;

  onStatus(`Rendering ${entities.length} CAD entities to PDF...`);
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLibRef;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([pageW, pageH]);
  const stroke = rgb(0.1, 0.12, 0.14);

  for (const e of entities) {
    if (e.type === 'LINE' && e.startPoint && e.endPoint) {
      page.drawLine({
        start: { x: tx(e.startPoint.x), y: ty(e.startPoint.y) },
        end: { x: tx(e.endPoint.x), y: ty(e.endPoint.y) },
        thickness: 0.6,
        color: stroke,
      });
    } else if (e.type === 'LWPOLYLINE' && e.vertices?.length >= 2) {
      for (let i = 1; i < e.vertices.length; i++) {
        page.drawLine({
          start: { x: tx(e.vertices[i - 1].x), y: ty(e.vertices[i - 1].y) },
          end: { x: tx(e.vertices[i].x), y: ty(e.vertices[i].y) },
          thickness: 0.6,
          color: stroke,
        });
      }
      if ((e.flag & 1) === 1 && e.vertices.length >= 3) {
        const last = e.vertices[e.vertices.length - 1];
        page.drawLine({
          start: { x: tx(last.x), y: ty(last.y) },
          end: { x: tx(e.vertices[0].x), y: ty(e.vertices[0].y) },
          thickness: 0.6,
          color: stroke,
        });
      }
    } else if (e.type === 'CIRCLE' && e.center && e.radius > 0) {
      page.drawCircle({
        x: tx(e.center.x),
        y: ty(e.center.y),
        size: Math.max(0.5, e.radius * scale),
        borderColor: stroke,
        borderWidth: 0.6,
      });
    } else if (e.type === 'ARC' && e.center && e.radius > 0) {
      drawArc(page, e, tx, ty, scale, stroke);
    } else if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.text) {
      const pt = e.type === 'TEXT' ? e.startPoint : e.insertionPoint;
      if (!pt) continue;
      const clean = cleanCadText(e.text);
      if (!clean) continue;
      const size = Math.min(24, Math.max(3.5, (e.textHeight || 1) * scale));
      const rotDeg = ((e.rotation || 0) * 180) / Math.PI;
      page.drawText(clean, {
        x: tx(pt.x),
        y: ty(pt.y),
        size,
        font,
        color: stroke,
        rotate: degrees(Number.isFinite(rotDeg) ? rotDeg : 0),
      });
    }
  }

  return { pdfBytes: await doc.save(), entityCount: entities.length };
}

function drawArc(page, e, tx, ty, scale, stroke) {
  let start = e.startAngle || 0;
  let end = e.endAngle || 0;
  if (end <= start) end += Math.PI * 2;
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a1 = start + ((end - start) * i) / steps;
    const a2 = start + ((end - start) * (i + 1)) / steps;
    page.drawLine({
      start: { x: tx(e.center.x + e.radius * Math.cos(a1)), y: ty(e.center.y + e.radius * Math.sin(a1)) },
      end: { x: tx(e.center.x + e.radius * Math.cos(a2)), y: ty(e.center.y + e.radius * Math.sin(a2)) },
      thickness: 0.6,
      color: stroke,
    });
  }
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

function computeBounds(entities, header) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const e of entities) {
    if (e.startPoint) add(e.startPoint.x, e.startPoint.y);
    if (e.endPoint) add(e.endPoint.x, e.endPoint.y);
    if (e.insertionPoint) add(e.insertionPoint.x, e.insertionPoint.y);
    if (e.center && Number.isFinite(e.radius)) {
      add(e.center.x - e.radius, e.center.y - e.radius);
      add(e.center.x + e.radius, e.center.y + e.radius);
    }
    if (e.vertices) e.vertices.forEach((v) => add(v.x, v.y));
  }
  if (!Number.isFinite(minX) && header?.EXTMIN && header?.EXTMAX) {
    return { minX: header.EXTMIN.x, minY: header.EXTMIN.y, maxX: header.EXTMAX.x, maxY: header.EXTMAX.y };
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
}
