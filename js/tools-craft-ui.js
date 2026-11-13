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
import {
  cropPdfPages,
  extractTablesToCsv,
  runWorkflowPipeline,
  unlockPdf,
  inspectPdfFormFields,
  fillOrFlattenPdfForm,
} from './pdf-tools-extra.js';
import { applyBatesAndWatermark } from './page-org.js';

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
  // Bates & Watermark
  bindCurrentAndFile('tool-bates', (buf, name) => applyBatesAndWatermark(buf, name, {
    watermark: document.getElementById('tool-wm-text').value,
    batesPrefix: document.getElementById('tool-bates-prefix').value,
    batesStart: document.getElementById('tool-bates-start').value,
    useBates: Boolean(document.getElementById('tool-bates-prefix').value.trim() || !document.getElementById('tool-wm-text').value.trim()),
  }, setStatus), setStatus, runSafe, requireOpenPdf);

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

  // Crop / Trim Margins
  bindCurrentAndFile('tool-crop', (buf, name) => {
    const marginPt = Number(document.getElementById('tool-crop-margin').value) || 18;
    const scope = document.getElementById('tool-crop-scope').value;
    return cropPdfPages(buf, name, marginPt, scope, state.currentPage, setStatus);
  }, setStatus, runSafe, requireOpenPdf);

  // Extract Tables to CSV
  bindCurrentAndFile('tool-tables', (buf, name) => extractTablesToCsv(buf, name, setStatus), setStatus, runSafe, requireOpenPdf);

  // One-Click Workflow Pipelines
  bindCurrentAndFile('tool-pipeline', (buf, name) => {
    const pipe = document.getElementById('tool-pipeline-select').value;
    return runWorkflowPipeline(buf, name, pipe, setStatus);
  }, setStatus, runSafe, requireOpenPdf);

  // Unlock Password-Protected PDF
  bindCurrentAndFile('tool-unlock', (buf, name) => {
    const pw = document.getElementById('tool-unlock-pw').value;
    return unlockPdf(buf, name, pw, setStatus);
  }, setStatus, runSafe, requireOpenPdf);

  // AcroForm Inspector, Filler & Flattener
  const formArea = document.getElementById('tool-form-fields');
  const loadFormFields = async (buf) => {
    if (!buf) return;
    try {
      const list = await inspectPdfFormFields(buf);
      formArea.value = list.map((f) => `${f.name} = ${f.value}`).join('\n');
      formArea.placeholder = list.length ? '' : 'No interactive AcroForm fields detected in this PDF.';
    } catch (_) { /* ignore */ }
  };
  document.getElementById('btn-pdf-tools').addEventListener('click', () => loadFormFields(state.pdfBytes?.buffer));
  document.getElementById('tool-form-fill').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runSafe(setStatus, () => fillOrFlattenPdfForm(state.pdfBytes.buffer, state.pdfName, formArea.value, false, setStatus));
  });
  document.getElementById('tool-form-flatten').addEventListener('click', () => {
    if (!requireOpenPdf(setStatus)) return;
    runSafe(setStatus, () => fillOrFlattenPdfForm(state.pdfBytes.buffer, state.pdfName, formArea.value, true, setStatus));
  });
}
