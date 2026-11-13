/**
 * Phase 1–4 PDFCraft-inspired tools:
 * - Crop / Trim Page Margins
 * - Extract PDF Tables / Structured Text to CSV
 * - One-Click Multi-Step Workflow Pipelines
 */
import { triggerDownload } from './pdf-tools-org.js';

export async function cropPdfPages(arrayBuffer, baseName, marginPt, scope, currentPage, onStatus) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(arrayBuffer);
  const pages = doc.getPages();
  const m = Math.max(0, Number(marginPt) || 0);
  if (m <= 0) throw new Error('Enter a crop margin greater than 0 pt.');

  const targets = scope === 'current'
    ? [pages[Math.max(0, Math.min(pages.length - 1, (currentPage || 1) - 1))]]
    : pages;

  targets.forEach((p, idx) => {
    onStatus(`Cropping page ${idx + 1} / ${targets.length} by ${m} pt...`);
    const { x, y, width, height } = p.getMediaBox();
    const nw = Math.max(72, width - m * 2);
    const nh = Math.max(72, height - m * 2);
    p.setCropBox(x + m, y + m, nw, nh);
    p.setMediaBox(x + m, y + m, nw, nh);
  });

  const out = await doc.save({ useObjectStreams: true });
  const cleanName = baseName.replace(/\.pdf$/i, '');
  triggerDownload(new Blob([out], { type: 'application/pdf' }), `${cleanName}_cropped.pdf`);
  onStatus(`Cropped ${targets.length} page(s) by ${m} pt → ${cleanName}_cropped.pdf.`);
}

export async function extractTablesToCsv(arrayBuffer, baseName, onStatus) {
  const pdfJsDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  const csvRows = [['Page', 'Row', 'Col_1', 'Col_2', 'Col_3', 'Col_4', 'Col_5', 'Col_6']];

  for (let p = 1; p <= pdfJsDoc.numPages; p++) {
    onStatus(`Scanning tables/schedules on page ${p} / ${pdfJsDoc.numPages}...`);
    const page = await pdfJsDoc.getPage(p);
    const tc = await page.getTextContent();
    const rowMap = [];

    for (const item of tc.items) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let row = rowMap.find((r) => Math.abs(r.y - y) <= 4.5);
      if (!row) {
        row = { y, cells: [] };
        rowMap.push(row);
      }
      row.cells.push({ x, str });
    }

    rowMap.sort((a, b) => b.y - a.y);
    rowMap.forEach((r, rIdx) => {
      r.cells.sort((a, b) => a.x - b.x);
      if (r.cells.length >= 2) {
        csvRows.push([p, rIdx + 1, ...r.cells.map((c) => c.str)]);
      }
    });
  }

  if (csvRows.length <= 1) throw new Error('No multi-column table rows detected in this PDF.');
  const csvText = csvRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const cleanName = baseName.replace(/\.pdf$/i, '');
  triggerDownload(new Blob([csvText], { type: 'text/csv;charset=utf-8' }), `${cleanName}_tables.csv`);
  onStatus(`Extracted ${csvRows.length - 1} table rows to ${cleanName}_tables.csv.`);
}

export async function runWorkflowPipeline(arrayBuffer, baseName, pipelineId, onStatus) {
  const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
  const cleanName = baseName.replace(/\.pdf$/i, '');

  if (pipelineId === 'submittal') {
    onStatus('Pipeline [1/2]: Applying FOR REVIEW watermark & page numbers...');
    const doc = await PDFDocument.load(arrayBuffer);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    pages.forEach((page, i) => {
      const { width, height } = page.getSize();
      page.drawText('FOR REVIEW', {
        x: width * 0.22,
        y: height * 0.42,
        size: Math.min(width, height) * 0.09,
        font,
        color: rgb(0.56, 0.28, 0.18),
        opacity: 0.16,
        rotate: degrees(32),
      });
      const lbl = `Page ${i + 1} of ${pages.length}`;
      page.drawText(lbl, { x: width - 95, y: 16, size: 9.5, font, color: rgb(0.17, 0.17, 0.18) });
    });
    onStatus('Pipeline [2/2]: Optimizing object streams...');
    const bytes = await doc.save({ useObjectStreams: true });
    triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${cleanName}_submittal_ready.pdf`);
    onStatus(`Workflow complete → ${cleanName}_submittal_ready.pdf (${pages.length} pages).`);
    return;
  }

  if (pipelineId === 'sanitize') {
    const pdfJsDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
    const outDoc = await PDFDocument.create();
    for (let p = 1; p <= pdfJsDoc.numPages; p++) {
      onStatus(`Pipeline: Flattening page ${p} / ${pdfJsDoc.numPages}...`);
      const page = await pdfJsDoc.getPage(p);
      const vp = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
      const img = await outDoc.embedJpg(await blob.arrayBuffer());
      const orig = page.getViewport({ scale: 1 });
      outDoc.addPage([orig.width, orig.height]).drawImage(img, { x: 0, y: 0, width: orig.width, height: orig.height });
    }
    outDoc.setTitle(''); outDoc.setAuthor(''); outDoc.setSubject(''); outDoc.setKeywords([]); outDoc.setCreator(''); outDoc.setProducer('');
    const bytes = await outDoc.save({ useObjectStreams: true });
    triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${cleanName}_sanitized_flat.pdf`);
    onStatus(`Workflow complete → ${cleanName}_sanitized_flat.pdf (flattened & metadata stripped).`);
  }
}
