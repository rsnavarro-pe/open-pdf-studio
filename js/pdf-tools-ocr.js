/**
 * Client-side OCR via Tesseract.js + PDF.js + pdf-lib.
 * Supports Searchable PDF (invisible word-aligned text layer) and Text (.txt) export.
 */
import { triggerDownload } from './pdf-tools-org.js';

export async function runOcrPdf(arrayBuffer, baseName, mode, onStatus) {
  if (!window.Tesseract) {
    throw new Error('Tesseract.js failed to load. Check your internet connection.');
  }

  const cleanName = baseName.replace(/\.pdf$/i, '');
  const pdfJsDoc = await window.pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer).slice(),
  }).promise;

  let currentPageIdx = 1;
  const totalPages = pdfJsDoc.numPages;

  onStatus('Initializing OCR engine (eng)...');
  const worker = await window.Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onStatus(`OCR Page ${currentPageIdx}/${totalPages}: ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  try {
    const scale = 2.0;
    const textPages = [];
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const outPdf = mode === 'pdf' ? await PDFDocument.load(arrayBuffer) : null;
    const font = outPdf ? await outPdf.embedFont(StandardFonts.Helvetica) : null;
    const pdfPages = outPdf ? outPdf.getPages() : [];

    for (let p = 1; p <= totalPages; p++) {
      currentPageIdx = p;
      onStatus(`Rendering page ${p}/${totalPages} for OCR...`);
      const page = await pdfJsDoc.getPage(p);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

      const { data } = await worker.recognize(canvas);
      textPages.push(`--- Page ${p} ---\n${(data.text || '').trim()}`);

      if (outPdf && pdfPages[p - 1] && Array.isArray(data.words)) {
        embedInvisibleWords(pdfPages[p - 1], data.words, scale, font);
      }
    }

    if (mode === 'pdf') {
      const outBytes = await outPdf.save();
      triggerDownload(new Blob([outBytes], { type: 'application/pdf' }), `${cleanName}_searchable.pdf`);
      onStatus(`OCR complete: saved ${cleanName}_searchable.pdf (${totalPages} pages).`);
      return textPages.join('\n\n');
    }

    const fullText = textPages.join('\n\n');
    triggerDownload(new Blob([fullText], { type: 'text/plain;charset=utf-8' }), `${cleanName}_ocr.txt`);
    onStatus(`OCR complete: extracted text from ${totalPages} page(s).`);
    return fullText;
  } finally {
    await worker.terminate();
  }
}

function embedInvisibleWords(pdfPage, words, scale, font) {
  const { height } = pdfPage.getSize();
  for (const w of words) {
    const safe = (w.text || '').replace(/[^\x20-\x7E]/g, '').trim();
    if (!safe || !w.bbox) continue;
    const boxH = Math.max(6, (w.bbox.y1 - w.bbox.y0) / scale);
    const x = w.bbox.x0 / scale;
    const y = height - w.bbox.y1 / scale;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    pdfPage.drawText(safe, {
      x,
      y,
      size: Math.min(48, Math.max(6, boxH * 0.85)),
      font,
      opacity: 0,
    });
  }
}
