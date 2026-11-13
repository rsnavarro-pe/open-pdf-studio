/**
 * Client-side Raster-to-Vector & OCR-to-DXF fallback for scanned PDFs.
 * Traces dark edge runs into DXF LINE segments and optionally extracts OCR TEXT.
 */

export async function extractRasterDxfEntities(page, scale = 1, onStatus = () => {}) {
  if (typeof document === 'undefined') return { lines: [], texts: [] };

  const renderScale = 1.5;
  const vp = page.getViewport({ scale: renderScale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  onStatus('No native vectors found — tracing scanned image to DXF...');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const lines = traceEdgeRuns(img, canvas.width, canvas.height, renderScale, scale);

  const texts = [];
  if (window.Tesseract) {
    onStatus('Running OCR on scanned sheet for DXF TEXT...');
    const worker = await window.Tesseract.createWorker('eng', 1);
    try {
      const { data } = await worker.recognize(canvas);
      for (const w of data.words || []) {
        const str = (w.text || '').replace(/[^\x20-\x7E]/g, '').trim();
        if (!str || !w.bbox) continue;
        const x = (w.bbox.x0 / renderScale) * scale;
        const y = ((canvas.height - w.bbox.y1) / renderScale) * scale;
        const h = Math.max(2, ((w.bbox.y1 - w.bbox.y0) / renderScale) * scale * 0.8);
        texts.push({ x, y, height: h, rot: 0, text: str, layer: 'PDF_OCR_TEXT', aci: 7 });
      }
    } finally {
      await worker.terminate();
    }
  }

  return { lines, texts };
}

function traceEdgeRuns(img, w, h, renderScale, outScale) {
  const d = img.data;
  const isDark = (x, y) => {
    const i = (y * w + x) * 4;
    return d[i + 3] > 128 && (d[i] + d[i + 1] + d[i + 2]) / 3 < 150;
  };

  const lines = [];
  const step = 2; // sample every 2px for crisp speed & compact DXF
  const toPtX = (px) => (px / renderScale) * outScale;
  const toPtY = (py) => ((h - py) / renderScale) * outScale;

  // Horizontal dark runs
  for (let y = 1; y < h - 1; y += step) {
    let runStart = -1;
    for (let x = 1; x < w - 1; x += step) {
      const dark = isDark(x, y) && (!isDark(x, y - 1) || !isDark(x, y + 1));
      if (dark && runStart < 0) runStart = x;
      else if (!dark && runStart >= 0) {
        if (x - runStart >= 6) {
          lines.push({ a: { x: toPtX(runStart), y: toPtY(y) }, b: { x: toPtX(x), y: toPtY(y) }, aci: 7, lw: 15, layer: 'PDF_RASTER_VECTORS' });
        }
        runStart = -1;
      }
    }
  }

  // Vertical dark runs
  for (let x = 1; x < w - 1; x += step) {
    let runStart = -1;
    for (let y = 1; y < h - 1; y += step) {
      const dark = isDark(x, y) && (!isDark(x - 1, y) || !isDark(x + 1, y));
      if (dark && runStart < 0) runStart = y;
      else if (!dark && runStart >= 0) {
        if (y - runStart >= 6) {
          lines.push({ a: { x: toPtX(x), y: toPtY(runStart) }, b: { x: toPtX(x), y: toPtY(y) }, aci: 7, lw: 15, layer: 'PDF_RASTER_VECTORS' });
        }
        runStart = -1;
      }
    }
  }

  return lines;
}
