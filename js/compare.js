/**
 * Revision Comparison Engine: Overlay Diff (Red/Teal tint) and Side-by-Side view.
 */
import { state } from './state.js';
import { getPdfDocA, getPdfDocB } from './pdf-engine.js';

export async function renderComparison() {
  const pageStage = document.getElementById('page-stage');
  const sbsStage = document.getElementById('side-by-side-stage');
  const compareCanvas = document.getElementById('compare-canvas');

  if (!state.compare.active) {
    compareCanvas.classList.add('hidden');
    sbsStage.classList.add('hidden');
    if (state.pdfBytes) pageStage.classList.remove('hidden');
    return;
  }

  const docA = getPdfDocA();
  const docB = getPdfDocB();
  if (!docA) return;

  if (state.compare.mode === 'side-by-side') {
    pageStage.classList.add('hidden');
    sbsStage.classList.remove('hidden');
    await renderSingleToCanvas(docA, 'sbs-canvas-a');
    if (docB) {
      await renderSingleToCanvas(docB, 'sbs-canvas-b');
    } else {
      clearCanvas('sbs-canvas-b', 'Load Rev B PDF or click "Use Sample Rev B"');
    }
    return;
  }

  // Overlay mode
  sbsStage.classList.add('hidden');
  pageStage.classList.remove('hidden');

  if (!docB) {
    compareCanvas.classList.add('hidden');
    return;
  }

  const pageNum = Math.min(state.currentPage, docB.numPages);
  const pageB = await docB.getPage(pageNum);
  const vp = pageB.getViewport({ scale: state.zoom, rotation: state.rotation });
  const dpr = window.devicePixelRatio || 1;

  compareCanvas.width = Math.floor(vp.width * dpr);
  compareCanvas.height = Math.floor(vp.height * dpr);
  compareCanvas.style.width = `${vp.width}px`;
  compareCanvas.style.height = `${vp.height}px`;
  compareCanvas.style.opacity = String(state.compare.opacity);
  compareCanvas.classList.remove('hidden');

  const ctx = compareCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  await pageB.render({ canvasContext: ctx, viewport: vp }).promise;

  // Apply teal/cyan tint to Rev B pixels so differences against Rev A stand out clearly
  tintCanvas(compareCanvas, [0, 140, 130]);
}

async function renderSingleToCanvas(doc, canvasId) {
  const canvas = document.getElementById(canvasId);
  const pageNum = Math.min(state.currentPage, doc.numPages);
  const page = await doc.getPage(pageNum);
  const vp = page.getViewport({ scale: Math.min(state.zoom, 1.1), rotation: state.rotation });
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
}

function clearCanvas(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  canvas.width = 480;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8faf9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#5a6866';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

function tintCanvas(canvas, [tr, tg, tb]) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (lum < 235) {
      d[i] = tr;
      d[i + 1] = tg;
      d[i + 2] = tb;
    } else {
      d[i + 3] = 0; // transparent background
    }
  }
  ctx.putImageData(img, 0, 0);
}
