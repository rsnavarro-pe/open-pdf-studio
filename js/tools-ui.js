/**
 * UI bindings for the PDF Tools modal (Organize, Optimize, Convert).
 */
import { state } from './state.js';
import { mergePdfs, splitPdf, compressPdf, imagesToPdf, triggerDownload, formatBytes } from './pdf-tools-org.js';
import { pdfToImages, pdfToPptx, pdfToDocx } from './pdf-tools-export.js';
import { runOcrPdf } from './pdf-tools-ocr.js';
import { exportPdfToDxf } from './pdf-to-dxf.js';
import { dxfTextToPdfBytes } from './dxf-to-pdf.js';
import { dwgBytesToPdfBytes } from './dwg-to-pdf.js';
import { loadPdfA } from './pdf-engine.js';
import { initCraftTools } from './tools-craft-ui.js';
import { clearWorkbenchForce } from './workbench-ui.js';

export function initPdfTools() {
  const modal = document.getElementById('tools-modal');
  const statusEl = document.getElementById('tools-status');
  const setStatus = (msg) => { statusEl.textContent = msg; };

  document.getElementById('btn-pdf-tools').addEventListener('click', () => {
    modal.classList.remove('hidden');
  });
  document.getElementById('tools-close').addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Merge PDF
  const mergeModeEl = document.getElementById('tool-merge-mode');
  const mergeParamEl = document.getElementById('tool-merge-param');
  const mergePlaceholders = {
    'page-range': 'Pages from each PDF (e.g. 1-2, 4)',
    'max-pages': 'Max pages per output PDF (e.g. 25)',
    'max-size': 'Max output size in MB (e.g. 5)',
  };
  mergeModeEl.addEventListener('change', () => {
    const ph = mergePlaceholders[mergeModeEl.value];
    mergeParamEl.classList.toggle('hidden', !ph);
    if (ph) { mergeParamEl.placeholder = ph; mergeParamEl.value = ''; }
  });
  document.getElementById('tool-merge-input').addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (files.length < 2) { setStatus('Select at least 2 PDFs to merge.'); return; }
    const opts = { mode: mergeModeEl.value, param: mergeParamEl.value };
    await runSafe(setStatus, () => mergePdfs(files, opts, setStatus));
    e.target.value = '';
  });

  // Split PDF
  const splitModeEl = document.getElementById('tool-split-mode');
  const splitParamEl = document.getElementById('tool-split-param');
  const splitPlaceholders = {
    range: 'Range (e.g. 1-3,5) or blank = all',
    'every-n': 'Pages per file (e.g. 5)',
    'equal-parts': 'Number of parts (e.g. 3)',
    'max-size': 'Max file size in MB (e.g. 2)',
  };
  splitModeEl.addEventListener('change', () => {
    const ph = splitPlaceholders[splitModeEl.value];
    splitParamEl.classList.toggle('hidden', !ph);
    if (ph) { splitParamEl.placeholder = ph; splitParamEl.value = ''; }
  });
  const runSplit = (buf, name) => {
    const opts = { mode: splitModeEl.value, param: splitParamEl.value };
    return runSafe(setStatus, () => splitPdf(buf, name, opts, setStatus));
  };
  document.getElementById('tool-split-current').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runSplit(state.pdfBytes.buffer, state.pdfName);
  });
  document.getElementById('tool-split-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await runSplit(await f.arrayBuffer(), f.name);
    e.target.value = '';
  });

  // Compress PDF
  const presetEl = document.getElementById('tool-compress-preset');
  const qSlider = document.getElementById('tool-compress-quality');
  const sizeInfoEl = document.getElementById('compress-size-info');
  const presetMap = { low: 45, medium: 70, high: 88 };

  const updateCompressInfo = () => {
    const q = Number(qSlider.value);
    document.getElementById('compress-q-val').textContent = `${q}%`;
    const bytes = state.pdfBytes?.byteLength;
    if (!bytes) {
      sizeInfoEl.textContent = 'No open PDF — pick a file to compress.';
      return;
    }
    const estFactor = Math.min(0.95, 0.16 + ((q - 30) / 65) * 0.59);
    const estBytes = Math.round(bytes * estFactor);
    const estPct = Math.round((1 - estFactor) * 100);
    sizeInfoEl.textContent = `Current: ${formatBytes(bytes)} → Est. ~${formatBytes(estBytes)} (−${estPct}%)`;
  };

  document.getElementById('btn-pdf-tools').addEventListener('click', updateCompressInfo);
  presetEl.addEventListener('change', () => {
    if (presetMap[presetEl.value] != null) qSlider.value = String(presetMap[presetEl.value]);
    updateCompressInfo();
  });
  qSlider.addEventListener('input', () => {
    const q = Number(qSlider.value);
    const match = Object.entries(presetMap).find(([, v]) => v === q);
    presetEl.value = match ? match[0] : 'custom';
    updateCompressInfo();
  });
  const runCompress = (buf, name) => runSafe(setStatus, async () => {
    const res = await compressPdf(buf, name, Number(qSlider.value), setStatus);
    if (res?.summary) sizeInfoEl.textContent = `Saved: ${res.summary}`;
  });
  document.getElementById('tool-compress-current').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runCompress(state.pdfBytes.buffer, state.pdfName);
  });
  document.getElementById('tool-compress-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await runCompress(await f.arrayBuffer(), f.name);
    e.target.value = '';
  });

  // Images -> PDF
  document.getElementById('tool-img2pdf-input').addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    await runSafe(setStatus, () => imagesToPdf(files, setStatus));
    e.target.value = '';
  });

  // PDF -> JPG / PNG
  const runPdf2Img = (buf, name) => {
    const fmt = document.getElementById('tool-img-format').value;
    const dpi = Number(document.getElementById('tool-img-dpi').value) || 300;
    return runSafe(setStatus, () => pdfToImages(buf, name, fmt, setStatus, dpi));
  };
  document.getElementById('tool-pdf2img-current').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runPdf2Img(state.pdfBytes.buffer, state.pdfName);
  });
  document.getElementById('tool-pdf2img-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await runPdf2Img(await f.arrayBuffer(), f.name);
    e.target.value = '';
  });

  // PDF -> PPTX / DOCX
  const runOffice = (buf, name) => {
    const fmt = document.getElementById('tool-office-format').value;
    return runSafe(setStatus, () => (fmt === 'pptx'
      ? pdfToPptx(buf, name, setStatus)
      : pdfToDocx(buf, name, setStatus)));
  };
  document.getElementById('tool-pdf2office-current').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runOffice(state.pdfBytes.buffer, state.pdfName);
  });
  document.getElementById('tool-pdf2office-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await runOffice(await f.arrayBuffer(), f.name);
    e.target.value = '';
  });

  // OCR PDF
  const ocrPreview = document.getElementById('ocr-preview');
  const runOcr = (buf, name) => {
    const mode = document.getElementById('tool-ocr-mode').value;
    ocrPreview.classList.add('hidden');
    return runSafe(setStatus, async () => {
      const text = await runOcrPdf(buf, name, mode, setStatus);
      if (text) {
        ocrPreview.value = text;
        ocrPreview.classList.remove('hidden');
      }
    });
  };
  document.getElementById('tool-ocr-current').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runOcr(state.pdfBytes.buffer, state.pdfName);
  });
  document.getElementById('tool-ocr-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await runOcr(await f.arrayBuffer(), f.name);
    e.target.value = '';
  });

  // PDF -> DXF (Single or Drawing Set)
  const runPdf2Dxf = (buf, name) => {
    const scope = document.getElementById('tool-dxf-scope').value;
    return runSafe(setStatus, () => exportPdfToDxf(
      buf, name, scope, state.currentPage, state.unitsPerPt, setStatus,
    ));
  };
  document.getElementById('tool-pdf2dxf-current').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runPdf2Dxf(state.pdfBytes.buffer, state.pdfName);
  });
  document.getElementById('tool-pdf2dxf-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await runPdf2Dxf(await f.arrayBuffer(), f.name);
    e.target.value = '';
  });

  // DWG / DXF -> PDF
  document.getElementById('tool-dxf2pdf-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await runSafe(setStatus, async () => {
      const isDwg = f.name.toLowerCase().endsWith('.dwg');
      let bytes;
      if (isDwg) {
        const res = await dwgBytesToPdfBytes(await f.arrayBuffer(), window.PDFLib, setStatus);
        bytes = res.pdfBytes;
      } else {
        setStatus(`Converting ${f.name} to PDF...`);
        bytes = await dxfTextToPdfBytes(await f.text(), window.PDFLib);
      }
      const outName = f.name.replace(/\.(dwg|dxf)$/i, '') + '.pdf';
      triggerDownload(new Blob([bytes], { type: 'application/pdf' }), outName);
      await loadPdfA(bytes.buffer, outName);
      setStatus(`Converted ${f.name} to ${outName} and opened in studio.`);
    });
    e.target.value = '';
  });

  // Create Blank PDF
  const buildBlank = async (openInStudio) => {
    const size = document.getElementById('tool-blank-size').value;
    const orient = document.getElementById('tool-blank-orient').value;
    const style = document.getElementById('tool-blank-style').value;
    const pages = Math.max(1, Math.min(100, Number(document.getElementById('tool-blank-pages').value) || 1));
    const bytes = await createBlankPdfBytes({ size, orient, style, pages });
    const fileName = `Blank_${size.toUpperCase()}_${pages}p.pdf`;
    if (openInStudio) {
      clearWorkbenchForce();
      await loadPdfA(bytes.buffer.slice(0), fileName);
      modal.classList.add('hidden');
      setStatus(`Opened ${fileName} in Studio.`);
    } else {
      triggerDownload(new Blob([bytes], { type: 'application/pdf' }), fileName);
      setStatus(`Downloaded ${fileName}.`);
    }
  };
  document.getElementById('tool-blank-open')?.addEventListener('click', () => runSafe(setStatus, () => buildBlank(true)));
  document.getElementById('tool-blank-download')?.addEventListener('click', () => runSafe(setStatus, () => buildBlank(false)));

  initCraftTools(setStatus, runSafe, requireOpenPdf);
}

async function createBlankPdfBytes({ size, orient, style, pages }) {
  const { PDFDocument, rgb } = window.PDFLib;
  const sizesPt = {
    letter: [612, 792], legal: [612, 1008], tabloid: [792, 1224],
    a4: [595.28, 841.89], a3: [841.89, 1190.55], archd: [1728, 2592], arche: [2592, 3456],
  };
  const [rawW, rawH] = sizesPt[size] || sizesPt.letter;
  const w = orient === 'landscape' ? Math.max(rawW, rawH) : Math.min(rawW, rawH);
  const h = orient === 'landscape' ? Math.min(rawW, rawH) : Math.max(rawW, rawH);

  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([w, h]);
    if (style === 'grid') {
      const step = 18; // 0.25 in
      for (let x = step; x < w; x += step) {
        const major = Math.round(x / step) % 4 === 0;
        page.drawLine({ start: { x, y: 0 }, end: { x, y: h }, thickness: major ? 0.6 : 0.25, color: rgb(0.82, 0.87, 0.94) });
      }
      for (let y = step; y < h; y += step) {
        const major = Math.round(y / step) % 4 === 0;
        page.drawLine({ start: { x: 0, y }, end: { x: w, y }, thickness: major ? 0.6 : 0.25, color: rgb(0.82, 0.87, 0.94) });
      }
    } else if (style === 'lined') {
      for (let y = h - 54; y > 36; y -= 22) {
        page.drawLine({ start: { x: 36, y }, end: { x: w - 36, y }, thickness: 0.5, color: rgb(0.82, 0.86, 0.92) });
      }
      page.drawLine({ start: { x: 72, y: 36 }, end: { x: 72, y: h - 36 }, thickness: 0.8, color: rgb(0.92, 0.65, 0.65) });
    }
  }
  return doc.save();
}

function requireOpenPdf(setStatus) {
  if (!state.pdfBytes) {
    setStatus('No PDF currently open — click "Pick File" or open a PDF first.');
    return false;
  }
  return true;
}

async function runSafe(setStatus, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err?.message || 'Operation failed.'}`);
  }
}
