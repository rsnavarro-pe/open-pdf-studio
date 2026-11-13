/**
 * Page Organizer (reorder, duplicate, delete) and Bates Numbering / Watermark exporter.
 */
import { state } from './state.js';
import { triggerDownload } from './pdf-tools-org.js';

export async function transformPdfPages(action, pageNum, reloadPreservingFn) {
  if (!state.pdfBytes) return;
  const { PDFDocument } = window.PDFLib;
  const src = await PDFDocument.load(state.pdfBytes);
  const total = src.getPageCount();
  if (action === 'delete' && total <= 1) return;

  // Build 1-based page order mapping
  let order = Array.from({ length: total }, (_, i) => i + 1);
  if (action === 'up' && pageNum > 1) {
    [order[pageNum - 2], order[pageNum - 1]] = [order[pageNum - 1], order[pageNum - 2]];
  } else if (action === 'down' && pageNum < total) {
    [order[pageNum - 1], order[pageNum]] = [order[pageNum], order[pageNum - 1]];
  } else if (action === 'dup') {
    order.splice(pageNum, 0, pageNum);
  } else if (action === 'delete') {
    order.splice(pageNum - 1, 1);
  } else {
    return;
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, order.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  const outBytes = await out.save();

  // Remap markups to new page indices
  const newMarkups = [];
  order.forEach((origPage, idx) => {
    const newPage = idx + 1;
    // Only duplicate markups on the newly inserted copy if action === 'dup' and idx === pageNum
    const matching = state.markups.filter((m) => m.page === origPage);
    for (const m of matching) {
      newMarkups.push({ ...m, id: idx === pageNum && action === 'dup' ? crypto.randomUUID() : m.id, page: newPage });
    }
  });

  const savedMeta = {
    markups: newMarkups,
    unitsPerPt: state.unitsPerPt,
    scaleLabel: state.scaleLabel,
    unit: state.unit,
    takeoffItems: state.takeoffItems,
    activeTakeoffId: state.activeTakeoffId,
    targetPage: action === 'up' ? pageNum - 1 : action === 'down' ? pageNum + 1 : Math.min(pageNum, order.length),
  };

  await reloadPreservingFn(outBytes.buffer, state.pdfName || 'document.pdf', savedMeta);
}

export async function applyBatesAndWatermark(arrayBuffer, baseName, opts, onStatus = () => {}) {
  const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
  const doc = await PDFDocument.load(arrayBuffer);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();

  const wm = (opts.watermark || '').trim();
  const prefix = (opts.batesPrefix || '').trim();
  const startNum = Math.max(1, Number(opts.batesStart) || 1);

  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();
    if (wm) {
      const sz = Math.min(54, Math.max(24, width * 0.065));
      page.drawText(wm, {
        x: width * 0.18,
        y: height * 0.42,
        size: sz,
        font,
        color: rgb(0.56, 0.28, 0.18),
        opacity: 0.18,
        rotate: degrees(32),
      });
    }
    if (prefix || opts.useBates) {
      const label = `${prefix}${String(startNum + idx).padStart(4, '0')}`;
      page.drawText(label, {
        x: Math.max(24, width - label.length * 7 - 24),
        y: 18,
        size: 10,
        font,
        color: rgb(0.17, 0.17, 0.18),
      });
    }
  });

  const outBytes = await doc.save();
  const cleanName = baseName.replace(/\.pdf$/i, '');
  triggerDownload(new Blob([outBytes], { type: 'application/pdf' }), `${cleanName}_stamped.pdf`);
  onStatus(`Exported ${pages.length} page(s) with ${wm ? 'watermark' : ''}${wm && (prefix || opts.useBates) ? ' & ' : ''}${prefix || opts.useBates ? 'Bates numbering' : ''}.`);
}
