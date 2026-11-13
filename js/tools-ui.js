/**
 * UI bindings for the PDF Tools modal (Organize, Optimize, Convert).
 */
import { state } from './state.js';
import { mergePdfs, splitPdf, compressPdf, imagesToPdf } from './pdf-tools-org.js';
import { pdfToImages, pdfToPptx, pdfToDocx } from './pdf-tools-export.js';
import { runOcrPdf } from './pdf-tools-ocr.js';

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
  document.getElementById('tool-merge-input').addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (files.length < 2) { setStatus('Select at least 2 PDFs to merge.'); return; }
    await runSafe(setStatus, () => mergePdfs(files, setStatus));
    e.target.value = '';
  });

  // Split PDF
  const runSplit = (buf, name) => {
    const range = document.getElementById('tool-split-range').value;
    return runSafe(setStatus, () => splitPdf(buf, name, range, setStatus));
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
  const qSlider = document.getElementById('tool-compress-quality');
  qSlider.addEventListener('input', () => {
    document.getElementById('compress-q-val').textContent = `${qSlider.value}%`;
  });
  const runCompress = (buf, name) => runSafe(
    setStatus,
    () => compressPdf(buf, name, Number(qSlider.value), setStatus),
  );
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
