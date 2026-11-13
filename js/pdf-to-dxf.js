/**
 * Native PDF Vector & Text -> ASCII DXF (AutoCAD R2000/AC1015 compatible) exporter.
 * Extracts lines, polylines, rectangles, Bezier curves, and text via PDF.js.
 */
import { triggerDownload } from './pdf-tools-org.js';

export async function exportPdfToDxf(arrayBuffer, baseName, scope, currentPage, unitsPerPt, onStatus) {
  const doc = await window.pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer).slice(),
  }).promise;
  const cleanName = baseName.replace(/\.pdf$/i, '');
  const scale = unitsPerPt || 1; // 1 = PDF points if uncalibrated

  if (scope === 'single') {
    onStatus(`Extracting vector geometry from page ${currentPage}...`);
    const page = await doc.getPage(currentPage);
    const dxf = await pdfPageToDxf(page, window.pdfjsLib.OPS, scale);
    triggerDownload(new Blob([dxf], { type: 'application/dxf' }), `${cleanName}_page_${currentPage}.dxf`);
    onStatus(`Exported page ${currentPage} to ${cleanName}_page_${currentPage}.dxf.`);
    return;
  }

  const zip = new window.JSZip();
  for (let p = 1; p <= doc.numPages; p++) {
    onStatus(`Extracting DXF for sheet ${p} / ${doc.numPages}...`);
    const page = await doc.getPage(p);
    const dxf = await pdfPageToDxf(page, window.pdfjsLib.OPS, scale);
    zip.file(`${cleanName}_sheet_${String(p).padStart(2, '0')}.dxf`, dxf);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${cleanName}_dxf_set.zip`);
  onStatus(`Exported ${doc.numPages} DXF sheets to ${cleanName}_dxf_set.zip.`);
}

export async function pdfPageToDxf(page, OPS, scale = 1) {
  const vp = page.getViewport({ scale: 1 });
  const opList = await page.getOperatorList();
  const textContent = await page.getTextContent();

  const lines = [];
  const polylines = [];
  const texts = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let subpaths = [];
  let curSub = [];

  const pushPt = (x, y) => {
    const p = applyMatrix(ctm, x, y);
    curSub.push({ x: p.x * scale, y: p.y * scale });
  };

  const finishSub = (close = false) => {
    if (curSub.length >= 2) {
      subpaths.push({ pts: curSub, closed: close });
    }
    curSub = [];
  };

  const commitPath = (closeAll = false) => {
    finishSub(closeAll);
    for (const sp of subpaths) {
      if (sp.pts.length === 2 && !sp.closed) {
        lines.push([sp.pts[0], sp.pts[1]]);
      } else if (sp.pts.length >= 2) {
        polylines.push(sp);
      }
    }
    subpaths = [];
  };

  const handleConstructPath = (ops, args) => {
    let idx = 0;
    for (const subOp of ops) {
      if (subOp === OPS.moveTo) {
        finishSub(false);
        pushPt(args[idx++], args[idx++]);
      } else if (subOp === OPS.lineTo) {
        pushPt(args[idx++], args[idx++]);
      } else if (subOp === OPS.curveTo) {
        const p0 = curSub[curSub.length - 1] || { x: 0, y: 0 };
        const p1 = transformScaled(ctm, args[idx++], args[idx++], scale);
        const p2 = transformScaled(ctm, args[idx++], args[idx++], scale);
        const p3 = transformScaled(ctm, args[idx++], args[idx++], scale);
        sampleCubic(p0, p1, p2, p3, 16).forEach((pt) => curSub.push(pt));
      } else if (subOp === OPS.curveTo2) {
        const p0 = curSub[curSub.length - 1] || { x: 0, y: 0 };
        const p2 = transformScaled(ctm, args[idx++], args[idx++], scale);
        const p3 = transformScaled(ctm, args[idx++], args[idx++], scale);
        sampleCubic(p0, p0, p2, p3, 16).forEach((pt) => curSub.push(pt));
      } else if (subOp === OPS.curveTo3) {
        const p0 = curSub[curSub.length - 1] || { x: 0, y: 0 };
        const p1 = transformScaled(ctm, args[idx++], args[idx++], scale);
        const p3 = transformScaled(ctm, args[idx++], args[idx++], scale);
        sampleCubic(p0, p1, p3, p3, 16).forEach((pt) => curSub.push(pt));
      } else if (subOp === OPS.closePath) {
        finishSub(true);
      } else if (subOp === OPS.rectangle) {
        finishSub(false);
        const x = args[idx++], y = args[idx++], w = args[idx++], h = args[idx++];
        pushPt(x, y);
        pushPt(x + w, y);
        pushPt(x + w, y + h);
        pushPt(x, y + h);
        finishSub(true);
      }
    }
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stack.push([...ctm]);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform) {
      ctm = mulMatrix(ctm, args);
    } else if (fn === OPS.constructPath) {
      handleConstructPath(args[0], args[1]);
    } else if (fn === OPS.moveTo) {
      finishSub(false);
      pushPt(args[0], args[1]);
    } else if (fn === OPS.lineTo) {
      pushPt(args[0], args[1]);
    } else if (fn === OPS.rectangle) {
      handleConstructPath([OPS.rectangle], args);
    } else if (fn === OPS.closePath) {
      finishSub(true);
    } else if (
      fn === OPS.stroke || fn === OPS.closeStroke ||
      fn === OPS.fill || fn === OPS.eoFill ||
      fn === OPS.fillStroke || fn === OPS.eoFillStroke ||
      fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke
    ) {
      const closeAll = fn === OPS.closeStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
      commitPath(closeAll);
    } else if (fn === OPS.endPath) {
      subpaths = [];
      curSub = [];
    }
  }

  for (const item of textContent.items) {
    const str = (item.str || '').trim();
    if (!str) continue;
    const [a, b, , , tx, ty] = item.transform;
    const h = Math.max(1, Math.hypot(a, b) * scale);
    const rot = (Math.atan2(b, a) * 180) / Math.PI;
    texts.push({ x: tx * scale, y: ty * scale, height: h, rot, text: str });
  }

  return buildDxfAscii(vp.width * scale, vp.height * scale, lines, polylines, texts);
}

function buildDxfAscii(extW, extH, lines, polylines, texts) {
  const out = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1015',
    '9', '$EXTMIN', '10', '0.0', '20', '0.0', '30', '0.0',
    '9', '$EXTMAX', '10', extW.toFixed(4), '20', extH.toFixed(4), '30', '0.0',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];

  for (const [a, b] of lines) {
    out.push(
      '0', 'LINE', '8', 'PDF_VECTORS',
      '10', a.x.toFixed(4), '20', a.y.toFixed(4), '30', '0.0',
      '11', b.x.toFixed(4), '21', b.y.toFixed(4), '31', '0.0',
    );
  }

  for (const poly of polylines) {
    out.push(
      '0', 'LWPOLYLINE', '8', 'PDF_VECTORS',
      '90', String(poly.pts.length),
      '70', poly.closed ? '1' : '0',
    );
    for (const p of poly.pts) {
      out.push('10', p.x.toFixed(4), '20', p.y.toFixed(4));
    }
  }

  for (const t of texts) {
    out.push(
      '0', 'TEXT', '8', 'PDF_TEXT',
      '10', t.x.toFixed(4), '20', t.y.toFixed(4), '30', '0.0',
      '40', t.height.toFixed(4),
      '50', t.rot.toFixed(3),
      '1', t.text.replace(/\r?\n/g, ' '),
    );
  }

  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}

function mulMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMatrix(m, x, y) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function transformScaled(m, x, y, scale) {
  const p = applyMatrix(m, x, y);
  return { x: p.x * scale, y: p.y * scale };
}

function sampleCubic(p0, p1, p2, p3, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return pts;
}
