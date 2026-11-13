/**
 * UI bindings for PDFCraft-inspired tools (N-Up, Page Numbers, Visual Transforms, Reorder/Blanks, Metadata).
 */
import { state } from './state.js';
import {
  nupPdf,
  addPageNumbers,
  transformPdfVisual,
  reorderOrBlankPdf,
  readPdfMetadata,
  editMetadataPdf,
} from './pdf-tools-craft.js';

function bindCurrentAndFile(prefix, handler, setStatus, runSafe, requireOpenPdf) {
  document.getElementById(`${prefix}-current`).addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runSafe(setStatus, () => handler(state.pdfBytes.buffer, state.pdfName));
  });
  document.getElementById(`${prefix}-input`).addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) await runSafe(setStatus, async () => handler(await f.arrayBuffer(), f.name));
    e.target.value = '';
  });
}

export function initCraftTools(setStatus, runSafe, requireOpenPdf) {
  // N-Up Layout
  bindCurrentAndFile('tool-nup', (buf, name) => {
    const perSheet = Number(document.getElementById('tool-nup-count').value);
    return nupPdf(buf, name, perSheet, setStatus);
  }, setStatus, runSafe, requireOpenPdf);

  // Page Numbers & Header
  bindCurrentAndFile('tool-pagenum', (buf, name) => addPageNumbers(buf, name, {
    position: document.getElementById('tool-pagenum-pos').value,
    format: document.getElementById('tool-pagenum-fmt').value,
    headerText: document.getElementById('tool-pagenum-header').value,
  }, setStatus), setStatus, runSafe, requireOpenPdf);

  // Visual Transform (Grayscale / Invert / Flatten)
  bindCurrentAndFile('tool-visual', (buf, name) => {
    const mode = document.getElementById('tool-visual-mode').value;
    return transformPdfVisual(buf, name, mode, setStatus);
  }, setStatus, runSafe, requireOpenPdf);

  // Page Order & Blank Pages
  bindCurrentAndFile('tool-order', (buf, name) => {
    const mode = document.getElementById('tool-order-mode').value;
    return reorderOrBlankPdf(buf, name, mode, setStatus);
  }, setStatus, runSafe, requireOpenPdf);

  // Metadata Inspector / Editor / Stripper
  const loadMeta = async () => {
    if (!state.pdfBytes) return;
    try {
      const m = await readPdfMetadata(state.pdfBytes.buffer);
      document.getElementById('tool-meta-title').value = m.title;
      document.getElementById('tool-meta-author').value = m.author;
      document.getElementById('tool-meta-subject').value = m.subject;
      document.getElementById('tool-meta-keywords').value = m.keywords;
    } catch { /* ignore */ }
  };
  document.getElementById('btn-pdf-tools').addEventListener('click', loadMeta);

  const runMeta = (action) => {
    if (!requireOpenPdf(setStatus)) return;
    return runSafe(setStatus, () => editMetadataPdf(state.pdfBytes.buffer, state.pdfName, {
      action,
      title: document.getElementById('tool-meta-title').value,
      author: document.getElementById('tool-meta-author').value,
      subject: document.getElementById('tool-meta-subject').value,
      keywords: document.getElementById('tool-meta-keywords').value,
    }, setStatus));
  };
  document.getElementById('tool-meta-save').addEventListener('click', () => runMeta('update'));
  document.getElementById('tool-meta-strip').addEventListener('click', () => runMeta('strip'));
}
