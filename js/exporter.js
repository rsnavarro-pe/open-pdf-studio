/**
 * Export annotated PDF (via pdf-lib) and CSV takeoff report.
 */
import { state } from './state.js';
import { drawStampPdf } from './stamp-renderer.js';
import {
  distPt, polylineLength, polygonPerimeter, polygonArea,
  formatLength, formatArea, buildRevisionCloudPath,
} from './geometry.js';

export async function exportAnnotatedPdf() {
  if (!state.pdfBytes) return;
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.load(state.pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();

  for (const m of state.markups) {
    const page = pages[m.page - 1];
    if (!page) continue;
    const { height } = page.getSize();
    const color = hexToRgb(m.color || '#c0392b', rgb);
    const sw = m.lineWidth || 2;
    const toPdfY = (y) => height - y;

    if (['distance', 'arrow', 'callout'].includes(m.type) && m.points.length >= 2) {
      const [a, b] = m.points;
      page.drawLine({
        start: { x: a.x, y: toPdfY(a.y) },
        end: { x: b.x, y: toPdfY(b.y) },
        thickness: sw,
        color,
      });
      const label = m.type === 'distance'
        ? formatLength(distPt(a, b), state.unitsPerPt, state.unit)
        : (m.text || '');
      if (label) {
        page.drawText(label, {
          x: m.type === 'callout' ? a.x : (a.x + b.x) / 2,
          y: toPdfY(m.type === 'callout' ? a.y : (a.y + b.y) / 2) + 6,
          size: 10, font, color,
        });
      }
    } else if (m.type === 'perimeter' && m.points.length >= 2) {
      drawPoly(page, m.points, toPdfY, sw, color, false);
      const last = m.points[m.points.length - 1];
      page.drawText(formatLength(polylineLength(m.points), state.unitsPerPt, state.unit), {
        x: last.x, y: toPdfY(last.y) + 6, size: 10, font, color,
      });
    } else if ((m.type === 'area' || m.type === 'cutout') && m.points.length >= 3) {
      drawPoly(page, m.points, toPdfY, sw, color, true);
      const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length;
      const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length;
      const prefix = m.type === 'cutout' ? '-' : '';
      page.drawText(`${prefix}${formatArea(polygonArea(m.points), state.unitsPerPt, state.unit)}`, { x: cx - 20, y: toPdfY(cy), size: 10, font, color });
    } else if ((m.type === 'pen' || m.type === 'highlight') && m.points.length >= 2) {
      const isHi = m.type === 'highlight';
      const hiColor = isHi ? hexToRgb(m.color || '#facc15') : color;
      for (let i = 1; i < m.points.length; i++) {
        page.drawLine({
          start: { x: m.points[i - 1].x, y: toPdfY(m.points[i - 1].y) },
          end: { x: m.points[i].x, y: toPdfY(m.points[i].y) },
          thickness: isHi ? 14 : sw,
          color: hiColor,
          opacity: isHi ? 0.35 : 1,
        });
      }
    } else if ((m.type === 'rect' || m.type === 'redact') && m.points.length >= 2) {
      const [a, b] = m.points;
      const isRed = m.type === 'redact';
      page.drawRectangle({
        x: Math.min(a.x, b.x),
        y: toPdfY(Math.max(a.y, b.y)),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
        color: isRed ? rgb(0, 0, 0) : undefined,
        borderColor: isRed ? rgb(0, 0, 0) : color,
        borderWidth: isRed ? 0 : sw,
      });
    } else if (m.type === 'sign' && m.points.length >= 2 && m.sigDataUrl) {
      const [a, b] = m.points;
      const pngImg = await doc.embedPng(m.sigDataUrl);
      page.drawImage(pngImg, {
        x: Math.min(a.x, b.x),
        y: toPdfY(Math.max(a.y, b.y)),
        width: Math.max(10, Math.abs(b.x - a.x)),
        height: Math.max(10, Math.abs(b.y - a.y)),
      });
    } else if (m.type === 'cloud' && m.points.length >= 2) {
      const svgPath = buildRevisionCloudPath(m.points[0], m.points[1], 14);
      if (svgPath) {
        page.drawSvgPath(svgPath, { x: 0, y: height, borderColor: color, borderWidth: sw });
      }
    } else if (m.type === 'note' && m.points.length >= 1) {
      const p = m.points[0];
      const py = toPdfY(p.y);
      const noteCol = hexToRgb(m.color || '#facc15');
      page.drawRectangle({ x: p.x - 8, y: py - 8, width: 16, height: 16, color: noteCol, borderColor: rgb(0.17, 0.17, 0.18), borderWidth: 1 });
      if (m.text) {
        page.drawText(m.text, { x: p.x + 12, y: py - 4, size: 10, font, color: rgb(0.17, 0.17, 0.18) });
      }
    } else if (m.type === 'text' && m.points.length >= 1) {
      page.drawText(m.text || '', { x: m.points[0].x, y: toPdfY(m.points[0].y), size: 12, font, color });
    } else if (m.type === 'count' && m.points.length >= 1) {
      const p = m.points[0];
      page.drawCircle({ x: p.x, y: toPdfY(p.y), size: 9, color, borderColor: rgb(1, 1, 1), borderWidth: 1.2 });
      page.drawText(String(m.countNum || 1), { x: p.x - 3, y: toPdfY(p.y) - 3.5, size: 9, font, color: rgb(1, 1, 1) });
    } else if (m.type === 'stamp' && m.points.length >= 1) {
      const stamp = m.stampData || { kind: 'badge', id: m.text || 'APPROVED', color: m.color };
      drawStampPdf(page, m.points[0], stamp, font, rgb, hexToRgb);
    }
  }

  const outBytes = await doc.save();
  const base = (state.pdfName || 'document').replace(/\.pdf$/i, '');
  downloadBlob(new Blob([outBytes], { type: 'application/pdf' }), `${base}_annotated.pdf`);
}

export function exportTakeoffCsv() {
  const rows = [['ID', 'Page', 'Type', 'Value / Text', 'Color']];
  state.markups.forEach((m, idx) => {
    let val = m.text || '';
    if (m.type === 'distance' && m.points.length >= 2) {
      val = formatLength(distPt(m.points[0], m.points[1]), state.unitsPerPt, state.unit);
    } else if (m.type === 'perimeter') {
      val = formatLength(polylineLength(m.points), state.unitsPerPt, state.unit);
    } else if (m.type === 'area') {
      val = `${formatArea(polygonArea(m.points), state.unitsPerPt, state.unit)} | P=${formatLength(polygonPerimeter(m.points), state.unitsPerPt, state.unit)}`;
    }
    rows.push([idx + 1, m.page, m.type, `"${val.replace(/"/g, '""')}"`, m.color]);
  });

  const csv = rows.map((r) => r.join(',')).join('\n');
  const base = (state.pdfName || 'takeoff').replace(/\.pdf$/i, '');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${base}_takeoff.csv`);
}

function drawPoly(page, pts, toPdfY, sw, color, close) {
  for (let i = 1; i < pts.length; i++) {
    page.drawLine({
      start: { x: pts[i - 1].x, y: toPdfY(pts[i - 1].y) },
      end: { x: pts[i].x, y: toPdfY(pts[i].y) },
      thickness: sw, color,
    });
  }
  if (close && pts.length >= 3) {
    page.drawLine({
      start: { x: pts[pts.length - 1].x, y: toPdfY(pts[pts.length - 1].y) },
      end: { x: pts[0].x, y: toPdfY(pts[0].y) },
      thickness: sw, color,
    });
  }
}

function hexToRgb(hex, rgbFn) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return rgbFn(0.75, 0.22, 0.17);
  return rgbFn(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
