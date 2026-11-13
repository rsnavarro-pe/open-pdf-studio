/**
 * Additional client-side PDF tools inspired by PDFCraft:
 * N-Up layout, Page Numbers/Headers, Grayscale/Flatten, Reverse/Blank pages, Metadata Editor/Stripper.
 */
import { triggerDownload } from './pdf-tools-org.js';

export async function nupPdf(arrayBuffer, baseName, perSheet, onStatus) {
  const { PDFDocument, rgb } = window.PDFLib;
  const src = await PDFDocument.load(arrayBuffer);
  const out = await PDFDocument.create();
  const layouts = {
    2: { cols: 2, rows: 1, w: 792, h: 612 },
    4: { cols: 2, rows: 2, w: 612, h: 792 },
    6: { cols: 3, rows: 2, w: 792, h: 612 },
    9: { cols: 3, rows: 3, w: 612, h: 792 },
  };
  const cfg = layouts[perSheet] || layouts[2];
  const embedded = await out.embedPages(src.getPages());
  const pad = 14;
  const cellW = (cfg.w - pad * (cfg.cols + 1)) / cfg.cols;
  const cellH = (cfg.h - pad * (cfg.rows + 1)) / cfg.rows;

  for (let i = 0; i < embedded.length; i += perSheet) {
    onStatus(`Building ${perSheet}-up sheet ${Math.floor(i / perSheet) + 1}...`);
    const sheet = out.addPage([cfg.w, cfg.h]);
    for (let k = 0; k < perSheet && i + k < embedded.length; k++) {
      const ep = embedded[i + k];
      const col = k % cfg.cols;
      const row = Math.floor(k / cfg.cols);
      const x0 = pad + col * (cellW + pad);
      const y0 = cfg.h - pad - (row + 1) * cellH - row * pad;
      const s = Math.min(cellW / ep.width, cellH / ep.height);
      const dw = ep.width * s;
      const dh = ep.height * s;
      sheet.drawPage(ep, { x: x0 + (cellW - dw) / 2, y: y0 + (cellH - dh) / 2, width: dw, height: dh });
      sheet.drawRectangle({ x: x0, y: y0, width: cellW, height: cellH, borderColor: rgb(0.82, 0.82, 0.82), borderWidth: 0.6 });
    }
  }
  const bytes = await out.save({ useObjectStreams: true });
  const cleanName = baseName.replace(/\.pdf$/i, '');
  triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${cleanName}_${perSheet}up.pdf`);
  onStatus(`Saved ${cleanName}_${perSheet}up.pdf (${out.getPageCount()} sheets).`);
}

export async function addPageNumbers(arrayBuffer, baseName, options, onStatus) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.load(arrayBuffer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const { position = 'bottom-center', format = 'x-of-n', headerText = '' } = options || {};

  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();
    const num = idx + 1;
    const total = pages.length;
    const label = format === 'x' ? `${num}` : (format === 'x-slash-n' ? `${num} / ${total}` : `Page ${num} of ${total}`);
    const tw = font.widthOfTextAtSize(label, 10);
    const margin = 22;
    const y = position.startsWith('top') ? height - margin : margin - 6;
    let x = (width - tw) / 2;
    if (position.endsWith('left')) x = margin;
    if (position.endsWith('right')) x = width - tw - margin;

    page.drawText(label, { x, y, size: 10, font, color: rgb(0.17, 0.17, 0.18) });
    if (headerText.trim()) {
      page.drawText(headerText.trim(), { x: margin, y: height - margin, size: 9, font, color: rgb(0.42, 0.42, 0.44) });
    }
  });

  const bytes = await doc.save({ useObjectStreams: true });
  const cleanName = baseName.replace(/\.pdf$/i, '');
  triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${cleanName}_numbered.pdf`);
  onStatus(`Added page numbers to ${pages.length} page(s).`);
}

export async function transformPdfVisual(arrayBuffer, baseName, mode, onStatus) {
  const { PDFDocument } = window.PDFLib;
  const pdfJsDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  const outDoc = await PDFDocument.create();

  for (let p = 1; p <= pdfJsDoc.numPages; p++) {
    onStatus(`Processing ${mode} page ${p} / ${pdfJsDoc.numPages}...`);
    const page = await pdfJsDoc.getPage(p);
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    if (mode === 'grayscale' || mode === 'invert') {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (mode === 'grayscale') {
          const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
          d[i] = d[i + 1] = d[i + 2] = g;
        } else {
          d[i] = 255 - d[i];
          d[i + 1] = 255 - d[i + 1];
          d[i + 2] = 255 - d[i + 2];
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    const jpgBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
    const jpgImg = await outDoc.embedJpg(await jpgBlob.arrayBuffer());
    const orig = page.getViewport({ scale: 1 });
    outDoc.addPage([orig.width, orig.height]).drawImage(jpgImg, { x: 0, y: 0, width: orig.width, height: orig.height });
  }

  const bytes = await outDoc.save({ useObjectStreams: true });
  const cleanName = baseName.replace(/\.pdf$/i, '');
  triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${cleanName}_${mode}.pdf`);
  onStatus(`Saved ${cleanName}_${mode}.pdf (${pdfJsDoc.numPages} pages).`);
}

export async function reorderOrBlankPdf(arrayBuffer, baseName, mode, onStatus) {
  const { PDFDocument } = window.PDFLib;
  const src = await PDFDocument.load(arrayBuffer);
  const out = await PDFDocument.create();
  const total = src.getPageCount();

  if (mode === 'reverse') {
    const indices = Array.from({ length: total }, (_, i) => total - 1 - i);
    (await out.copyPages(src, indices)).forEach((p) => out.addPage(p));
  } else {
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) {
      out.addPage(p);
      const { width, height } = p.getSize();
      out.addPage([width, height]);
    }
  }

  const bytes = await out.save({ useObjectStreams: true });
  const cleanName = baseName.replace(/\.pdf$/i, '');
  const suffix = mode === 'reverse' ? 'reversed' : 'with_blanks';
  triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${cleanName}_${suffix}.pdf`);
  onStatus(`Saved ${cleanName}_${suffix}.pdf (${out.getPageCount()} pages).`);
}

export async function readPdfMetadata(arrayBuffer) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(arrayBuffer);
  return {
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: doc.getKeywords() || '',
  };
}

export async function editMetadataPdf(arrayBuffer, baseName, meta, onStatus) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.load(arrayBuffer);
  if (meta.action === 'strip') {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
  } else {
    doc.setTitle(meta.title || '');
    doc.setAuthor(meta.author || '');
    doc.setSubject(meta.subject || '');
    const kw = (meta.keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
    doc.setKeywords(kw);
  }
  const bytes = await doc.save({ useObjectStreams: true });
  const cleanName = baseName.replace(/\.pdf$/i, '');
  const suffix = meta.action === 'strip' ? 'sanitized' : 'metadata';
  triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${cleanName}_${suffix}.pdf`);
  onStatus(meta.action === 'strip' ? `Stripped metadata → ${cleanName}_sanitized.pdf.` : `Updated metadata → ${cleanName}_metadata.pdf.`);
}
