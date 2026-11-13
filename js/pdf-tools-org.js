/**
 * Client-side PDF Organize, Optimize, and Image-to-PDF tools.
 */

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function mergePdfs(files, onStatus) {
  const { PDFDocument } = window.PDFLib;
  const merged = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    onStatus(`Merging ${i + 1}/${files.length}: ${files[i].name}...`);
    const bytes = await files[i].arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }
  const out = await merged.save({ useObjectStreams: true });
  triggerDownload(new Blob([out], { type: 'application/pdf' }), 'merged_document.pdf');
  onStatus(`Merged ${files.length} PDFs (${merged.getPageCount()} pages).`);
}

export async function splitPdf(arrayBuffer, baseName, rangeText, onStatus) {
  const { PDFDocument } = window.PDFLib;
  const src = await PDFDocument.load(arrayBuffer);
  const total = src.getPageCount();
  const cleanName = baseName.replace(/\.pdf$/i, '');

  const indices = parsePageRanges(rangeText, total);
  if (indices) {
    onStatus(`Extracting ${indices.length} page(s)...`);
    const outDoc = await PDFDocument.create();
    const pages = await outDoc.copyPages(src, indices);
    pages.forEach((p) => outDoc.addPage(p));
    const bytes = await outDoc.save();
    triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${cleanName}_extracted.pdf`);
    onStatus(`Extracted ${indices.length} page(s) to ${cleanName}_extracted.pdf.`);
    return;
  }

  // Split every page into a ZIP
  const zip = new window.JSZip();
  for (let i = 0; i < total; i++) {
    onStatus(`Splitting page ${i + 1} / ${total}...`);
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(src, [i]);
    single.addPage(page);
    zip.file(`${cleanName}_page_${i + 1}.pdf`, await single.save());
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${cleanName}_split_pages.zip`);
  onStatus(`Split ${total} pages into ${cleanName}_split_pages.zip.`);
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
