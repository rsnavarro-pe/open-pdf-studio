/**
 * Native PDF Vector & Text -> ASCII DXF (AutoCAD R2000/AC1015 compatible) exporter.
 * Supports color/lineweight preservation, scanned-PDF raster fallback, and multi-page grid assembly.
 */
import { triggerDownload } from './pdf-tools-org.js';
import { extractRasterDxfEntities } from './dxf-raster.js';

export async function exportPdfToDxf(arrayBuffer, baseName, scope, currentPage, unitsPerPt, onStatus = () => {}) {
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  const cleanName = baseName.replace(/\.pdf$/i, '');
  const scale = unitsPerPt || 1;

  if (scope === 'single') {
    onStatus(`Extracting DXF geometry from page ${currentPage}...`);
    const page = await doc.getPage(currentPage);
    const dxf = await pdfPageToDxf(page, window.pdfjsLib.OPS, scale, onStatus);
    triggerDownload(new Blob([dxf], { type: 'application/dxf' }), `${cleanName}_page_${currentPage}.dxf`);
    onStatus(`Exported page ${currentPage} to ${cleanName}_page_${currentPage}.dxf.`);
    return;
  }

  if (scope === 'grid') {
    const dxf = await exportPagesGridDxf(doc, window.pdfjsLib.OPS, scale, onStatus);
    triggerDownload(new Blob([dxf], { type: 'application/dxf' }), `${cleanName}_grid.dxf`);
    onStatus(`Exported ${doc.numPages} pages as a single DXF grid (${cleanName}_grid.dxf).`);
    return;
  }

  const zip = new window.JSZip();
  for (let p = 1; p <= doc.numPages; p++) {
    onStatus(`Extracting DXF for sheet ${p} / ${doc.numPages}...`);
    const page = await doc.getPage(p);
    const dxf = await pdfPageToDxf(page, window.pdfjsLib.OPS, scale, onStatus);
    zip.file(`${cleanName}_sheet_${String(p).padStart(2, '0')}.dxf`, dxf);
  }
  triggerDownload(await zip.generateAsync({ type: 'blob' }), `${cleanName}_dxf_set.zip`);
  onStatus(`Exported ${doc.numPages} DXF sheets to ${cleanName}_dxf_set.zip.`);
}

async function exportPagesGridDxf(doc, OPS, scale, onStatus) {
  const cols = Math.ceil(Math.sqrt(doc.numPages));
  const gap = 36 * scale;
  const allLines = [], allPolys = [], allTexts = [];
  let maxExtW = 0, maxExtH = 0;

  let curX = 0, curY = 0, rowMaxH = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    onStatus(`Assembling grid sheet ${p} / ${doc.numPages}...`);
    const page = await doc.getPage(p);
    const ext = await extractPageDxfData(page, OPS, scale, onStatus);

    ext.lines.forEach((l) => allLines.push({ ...l, a: { x: l.a.x + curX, y: l.a.y - curY }, b: { x: l.b.x + curX, y: l.b.y - curY } }));
    ext.polylines.forEach((pl) => allPolys.push({ ...pl, pts: pl.pts.map((pt) => ({ x: pt.x + curX, y: pt.y - curY })) }));
    ext.texts.forEach((t) => allTexts.push({ ...t, x: t.x + curX, y: t.y - curY }));

    maxExtW = Math.max(maxExtW, curX + ext.w);
    maxExtH = Math.max(maxExtH, curY + ext.h);
    rowMaxH = Math.max(rowMaxH, ext.h);

    if (p % cols === 0) { curX = 0; curY += rowMaxH + gap; rowMaxH = 0; }
    else { curX += ext.w + gap; }
  }
  return buildDxfAscii(maxExtW, maxExtH, allLines, allPolys, allTexts);
}

export async function pdfPageToDxf(page, OPS, scale = 1, onStatus = () => {}) {
  const data = await extractPageDxfData(page, OPS, scale, onStatus);
  return buildDxfAscii(data.w, data.h, data.lines, data.polylines, data.texts);
}

async function extractPageDxfData(page, OPS, scale, onStatus) {
  const vp = page.getViewport({ scale: 1 });
  const opList = await page.getOperatorList();
  const textContent = await page.getTextContent();

  const lines = [], polylines = [], texts = [];
  let gs = { ctm: [1, 0, 0, 1, 0, 0], aci: 7, lw: 25 };
  const stack = [];
  let subpaths = [], curSub = [];

  const pushPt = (x, y) => {
    const p = applyMatrix(gs.ctm, x, y);
    curSub.push({ x: p.x * scale, y: p.y * scale });
  };
  const finishSub = (close = false) => {
    if (curSub.length >= 2) subpaths.push({ pts: curSub, closed: close, aci: gs.aci, lw: gs.lw });
    curSub = [];
  };
  const commitPath = (closeAll = false) => {
    finishSub(closeAll);
    for (const sp of subpaths) {
      if (sp.pts.length === 2 && !sp.closed) lines.push({ a: sp.pts[0], b: sp.pts[1], aci: sp.aci, lw: sp.lw });
      else if (sp.pts.length >= 2) polylines.push(sp);
    }
    subpaths = [];
  };

  const handleConstructPath = (ops, args) => {
    let idx = 0;
    for (const subOp of ops) {
      if (subOp === OPS.moveTo) { finishSub(false); pushPt(args[idx++], args[idx++]); }
      else if (subOp === OPS.lineTo) { pushPt(args[idx++], args[idx++]); }
      else if (subOp === OPS.curveTo || subOp === OPS.curveTo2 || subOp === OPS.curveTo3) {
        const p0 = curSub[curSub.length - 1] || { x: 0, y: 0 };
        const p1 = subOp === OPS.curveTo2 ? p0 : transformScaled(gs.ctm, args[idx++], args[idx++], scale);
        const p2 = subOp === OPS.curveTo3 ? transformScaled(gs.ctm, args[idx], args[idx + 1], scale) : transformScaled(gs.ctm, args[idx++], args[idx++], scale);
        const p3 = transformScaled(gs.ctm, args[idx++], args[idx++], scale);
        sampleCubic(p0, p1, p2, p3, 16).forEach((pt) => curSub.push(pt));
      } else if (subOp === OPS.closePath) { finishSub(true); }
      else if (subOp === OPS.rectangle) {
        finishSub(false);
        const x = args[idx++], y = args[idx++], w = args[idx++], h = args[idx++];
        pushPt(x, y); pushPt(x + w, y); pushPt(x + w, y + h); pushPt(x, y + h);
        finishSub(true);
      }
    }
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i], args = opList.argsArray[i];
    if (fn === OPS.save) stack.push({ ...gs, ctm: [...gs.ctm] });
    else if (fn === OPS.restore) gs = stack.pop() || { ctm: [1, 0, 0, 1, 0, 0], aci: 7, lw: 25 };
    else if (fn === OPS.transform) gs.ctm = mulMatrix(gs.ctm, args);
    else if (fn === OPS.setLineWidth) gs.lw = ptToDxfWeight(args[0]);
    else if (fn === OPS.setStrokeRGBColor) gs.aci = rgbToAci(args[0], args[1], args[2]);
    else if (fn === OPS.setStrokeGray) gs.aci = rgbToAci(args[0] * 255, args[0] * 255, args[0] * 255);
    else if (fn === OPS.constructPath) handleConstructPath(args[0], args[1]);
    else if (fn === OPS.moveTo) { finishSub(false); pushPt(args[0], args[1]); }
    else if (fn === OPS.lineTo) pushPt(args[0], args[1]);
    else if (fn === OPS.rectangle) handleConstructPath([OPS.rectangle], args);
    else if (fn === OPS.closePath) finishSub(true);
    else if ([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(fn)) {
      commitPath(fn === OPS.closeStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke);
    } else if (fn === OPS.endPath) { subpaths = []; curSub = []; }
  }

  for (const item of textContent.items) {
    const str = (item.str || '').trim();
    if (!str) continue;
    const [a, b, , , tx, ty] = item.transform;
    texts.push({ x: tx * scale, y: ty * scale, height: Math.max(1, Math.hypot(a, b) * scale), rot: (Math.atan2(b, a) * 180) / Math.PI, text: str, aci: 7 });
  }

  // Fallback for scanned PDFs with zero native vector paths
  if (!lines.length && !polylines.length) {
    const raster = await extractRasterDxfEntities(page, scale, onStatus);
    lines.push(...raster.lines);
    if (!texts.length) texts.push(...raster.texts);
  }

  return { w: vp.width * scale, h: vp.height * scale, lines, polylines, texts };
}

function buildDxfAscii(extW, extH, lines, polylines, texts) {
  const out = [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015',
    '9', '$EXTMIN', '10', '0.0', '20', '0.0', '30', '0.0',
    '9', '$EXTMAX', '10', extW.toFixed(4), '20', extH.toFixed(4), '30', '0.0',
    '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  ];
  for (const l of lines) {
    out.push('0', 'LINE', '8', l.layer || 'PDF_VECTORS', '62', String(l.aci ?? 7), '370', String(l.lw ?? 25),
      '10', l.a.x.toFixed(4), '20', l.a.y.toFixed(4), '30', '0.0',
      '11', l.b.x.toFixed(4), '21', l.b.y.toFixed(4), '31', '0.0');
  }
  for (const poly of polylines) {
    out.push('0', 'LWPOLYLINE', '8', 'PDF_VECTORS', '62', String(poly.aci ?? 7), '370', String(poly.lw ?? 25),
      '90', String(poly.pts.length), '70', poly.closed ? '1' : '0');
    poly.pts.forEach((p) => out.push('10', p.x.toFixed(4), '20', p.y.toFixed(4)));
  }
  for (const t of texts) {
    out.push('0', 'TEXT', '8', t.layer || 'PDF_TEXT', '62', String(t.aci ?? 7),
      '10', t.x.toFixed(4), '20', t.y.toFixed(4), '30', '0.0',
      '40', t.height.toFixed(4), '50', t.rot.toFixed(3), '1', t.text.replace(/\r?\n/g, ' '));
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}

function rgbToAci(r, g, b) {
  const n = (v) => (v <= 1 && (r <= 1 && g <= 1 && b <= 1) ? v * 255 : v);
  const R = n(r), G = n(g), B = n(b);
  if (Math.max(R, G, B) - Math.min(R, G, B) < 30) return R < 80 || R > 210 ? 7 : 8;
  if (R >= G && R >= B) return G > 160 ? 2 : B > 140 ? 6 : 1;
  if (G >= R && G >= B) return B > 160 ? 4 : 3;
  return R > 140 ? 6 : 5;
}

function ptToDxfWeight(pt) {
  const mm100 = (Number(pt) || 0.7) * 35.2778;
  const std = [0, 9, 15, 25, 35, 50, 70, 100];
  return std.reduce((best, cur) => (Math.abs(cur - mm100) < Math.abs(best - mm100) ? cur : best), 25);
}

function mulMatrix(m1, m2) {
  return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3], m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
}
function applyMatrix(m, x, y) { return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }; }
function transformScaled(m, x, y, s) { const p = applyMatrix(m, x, y); return { x: p.x * s, y: p.y * s }; }
function sampleCubic(p0, p1, p2, p3, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, mt = 1 - t;
    pts.push({ x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x, y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y });
  }
  return pts;
}
