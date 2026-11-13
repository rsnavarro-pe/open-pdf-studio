/**
 * Client-side PDF Organize, Optimize, and Image-to-PDF tools.
 */
import {
  saveSubset,
  chunkByGroups,
  chunkByMaxSize,
  exportChunks,
  groupEveryN,
  groupEqualParts,
  parsePositiveInt,
  parsePositiveFloat,
} from './pdf-tools-chunk.js';

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function mergePdfs(files, options, onStatus) {
  if (typeof options === 'function') { onStatus = options; options = {}; }
  const { mode = 'sequential', param = '' } = options || {};
  const { PDFDocument } = window.PDFLib;
  const merged = await PDFDocument.create();
  const docs = [];

  for (let i = 0; i < files.length; i++) {
    onStatus(`Loading ${i + 1}/${files.length}: ${files[i].name}...`);
    docs.push(await PDFDocument.load(await files[i].arrayBuffer()));
  }

  if (mode === 'interleave') {
    const maxLen = Math.max(...docs.map((d) => d.getPageCount()));
    for (let p = 0; p < maxLen; p++) {
      for (const src of docs) {
        if (p < src.getPageCount()) {
          const [page] = await merged.copyPages(src, [p]);
          merged.addPage(page);
        }
      }
    }
  } else if (mode === 'page-range') {
    if (!(param || '').trim()) throw new Error('Enter a page range (e.g. 1-2, 4).');
    for (const src of docs) {
      const indices = parsePageRanges(param, src.getPageCount());
      if (indices?.length) {
        (await merged.copyPages(src, indices)).forEach((p) => merged.addPage(p));
      }
    }
    if (!merged.getPageCount()) throw new Error('No pages matched that range.');
  } else {
    for (const src of docs) {
      (await merged.copyPages(src, src.getPageIndices())).forEach((p) => merged.addPage(p));
    }
  }

  const allIndices = merged.getPageIndices();
  if (mode === 'max-pages') {
    const n = parsePositiveInt(param, 'max pages per output PDF');
    const chunks = await chunkByGroups(merged, groupEveryN(allIndices, n), 'merged', onStatus);
    return exportChunks(chunks, 'merged_by_pages', onStatus, triggerDownload);
  }
  if (mode === 'max-size') {
    const mb = parsePositiveFloat(param, 'max size in MB');
    const chunks = await chunkByMaxSize(merged, allIndices, mb, 'merged', onStatus);
    return exportChunks(chunks, 'merged_by_size', onStatus, triggerDownload);
  }

  const out = await merged.save({ useObjectStreams: true });
  const outName = mode === 'interleave' ? 'merged_interleaved.pdf' : 'merged_document.pdf';
  triggerDownload(new Blob([out], { type: 'application/pdf' }), outName);
  onStatus(`Merged ${files.length} PDFs (${merged.getPageCount()} pages) into ${outName}.`);
}

export async function splitPdf(arrayBuffer, baseName, options, onStatus) {
  const opts = typeof options === 'string' ? { mode: 'range', param: options } : (options || {});
  const { mode = 'range', param = '' } = opts;
  const { PDFDocument } = window.PDFLib;
  const src = await PDFDocument.load(arrayBuffer);
  const total = src.getPageCount();
  const cleanName = baseName.replace(/\.pdf$/i, '');
  const allIndices = src.getPageIndices();

  if (mode === 'every-n') {
    const n = parsePositiveInt(param, 'pages per file');
    const chunks = await chunkByGroups(src, groupEveryN(allIndices, n), cleanName, onStatus);
    return exportChunks(chunks, `${cleanName}_split_${n}p`, onStatus, triggerDownload);
  }
  if (mode === 'equal-parts') {
    const parts = Math.min(total, parsePositiveInt(param, 'number of parts'));
    const chunks = await chunkByGroups(src, groupEqualParts(allIndices, parts), cleanName, onStatus);
    return exportChunks(chunks, `${cleanName}_${parts}_parts`, onStatus, triggerDownload);
  }
  if (mode === 'max-size') {
    const mb = parsePositiveFloat(param, 'max size in MB');
    const chunks = await chunkByMaxSize(src, allIndices, mb, cleanName, onStatus);
    return exportChunks(chunks, `${cleanName}_by_size`, onStatus, triggerDownload);
  }
  if (mode === 'odd-even') {
    const odd = allIndices.filter((i) => i % 2 === 0);
    const even = allIndices.filter((i) => i % 2 === 1);
    const chunks = [];
    if (odd.length) chunks.push({ name: `${cleanName}_odd_pages.pdf`, bytes: await saveSubset(src, odd) });
    if (even.length) chunks.push({ name: `${cleanName}_even_pages.pdf`, bytes: await saveSubset(src, even) });
    return exportChunks(chunks, `${cleanName}_odd_even`, onStatus, triggerDownload);
  }

  const indices = parsePageRanges(param, total);
  if (indices) {
    onStatus(`Extracting ${indices.length} page(s)...`);
    triggerDownload(new Blob([await saveSubset(src, indices)], { type: 'application/pdf' }), `${cleanName}_extracted.pdf`);
    onStatus(`Extracted ${indices.length} page(s) to ${cleanName}_extracted.pdf.`);
    return;
  }

  const chunks = await chunkByGroups(src, allIndices.map((i) => [i]), `${cleanName}_page`, onStatus, true);
  return exportChunks(chunks, `${cleanName}_split_pages`, onStatus, triggerDownload);
}

export async function compressPdf(arrayBuffer, baseName, qualityPercent, onStatus) {
  const { PDFDocument } = window.PDFLib;
  const pdfJsDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  const outDoc = await PDFDocument.create();
  const quality = Math.max(0.3, Math.min(0.95, qualityPercent / 100));
  const scale = quality < 0.6 ? 1.2 : 1.5;

  for (let p = 1; p <= pdfJsDoc.numPages; p++) {
    onStatus(`Compressing page ${p} / ${pdfJsDoc.numPages} (${qualityPercent}% quality)...`);
    const page = await pdfJsDoc.getPage(p);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    const jpgBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    const jpgBytes = await jpgBlob.arrayBuffer();
    const jpgImg = await outDoc.embedJpg(jpgBytes);
    const origVp = page.getViewport({ scale: 1 });
    const outPage = outDoc.addPage([origVp.width, origVp.height]);
    outPage.drawImage(jpgImg, { x: 0, y: 0, width: origVp.width, height: origVp.height });
  }

  const outBytes = await outDoc.save({ useObjectStreams: true });
  const ratio = ((1 - outBytes.byteLength / arrayBuffer.byteLength) * 100).toFixed(1);
  const cleanName = baseName.replace(/\.pdf$/i, '');
  triggerDownload(new Blob([outBytes], { type: 'application/pdf' }), `${cleanName}_compressed.pdf`);
  onStatus(`Compressed PDF saved (${ratio}% size change, ${(outBytes.byteLength / 1024).toFixed(0)} KB).`);
}

export async function imagesToPdf(files, onStatus) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onStatus(`Converting image ${i + 1}/${files.length}: ${file.name}...`);
    const buf = await file.arrayBuffer();
    const lower = file.name.toLowerCase();

    let embedded;
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      embedded = await doc.embedJpg(buf);
    } else if (lower.endsWith('.png')) {
      embedded = await doc.embedPng(buf);
    } else if (lower.endsWith('.tif') || lower.endsWith('.tiff')) {
      const pngBytes = await tiffToPngBytes(buf);
      embedded = await doc.embedPng(pngBytes);
    } else {
      continue;
    }

    const page = doc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }

  const out = await doc.save();
  triggerDownload(new Blob([out], { type: 'application/pdf' }), 'images_converted.pdf');
  onStatus(`Converted ${doc.getPageCount()} image(s) to PDF.`);
}

async function tiffToPngBytes(arrayBuffer) {
  const ifds = window.UTIF.decode(arrayBuffer);
  window.UTIF.decodeImage(arrayBuffer, ifds[0]);
  const rgba = window.UTIF.toRGBA8(ifds[0]);
  const canvas = document.createElement('canvas');
  canvas.width = ifds[0].width;
  canvas.height = ifds[0].height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(canvas.width, canvas.height);
  imgData.data.set(rgba);
  ctx.putImageData(imgData, 0, 0);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  return await blob.arrayBuffer();
}

function parsePageRanges(text, maxPages) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const set = new Set();
  for (const part of trimmed.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const start = Math.max(1, Number(m[1]));
    const end = Math.min(maxPages, Number(m[2] || m[1]));
    for (let p = start; p <= end; p++) set.add(p - 1);
  }
  return set.size ? [...set].sort((a, b) => a - b) : null;
}
