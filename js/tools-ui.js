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
import { applyBatesAndWatermark } from './page-org.js';

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
    return runSafe(setStatus, () => pdfToImages(buf, name, fmt, setStatus));
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

  // Bates & Watermark
  const runBates = (buf, name) => runSafe(setStatus, () => applyBatesAndWatermark(buf, name, {
    watermark: document.getElementById('tool-wm-text').value,
    batesPrefix: document.getElementById('tool-bates-prefix').value,
    batesStart: document.getElementById('tool-bates-start').value,
    useBates: Boolean(document.getElementById('tool-bates-prefix').value.trim() || !document.getElementById('tool-wm-text').value.trim()),
  }, setStatus));
  document.getElementById('tool-bates-current').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runBates(state.pdfBytes.buffer, state.pdfName);
  });
  document.getElementById('tool-bates-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await runBates(await f.arrayBuffer(), f.name);
    e.target.value = '';
  });
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
