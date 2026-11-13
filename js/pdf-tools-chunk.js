/**
 * Shared chunking & size-splitting helpers for PDF Merge and Split tools.
 */

export async function saveSubset(srcDoc, indices) {
  const { PDFDocument } = window.PDFLib;
  const out = await PDFDocument.create();
  const pages = await out.copyPages(srcDoc, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
}

export async function chunkByGroups(srcDoc, groups, prefix, onStatus, plainIndex = false) {
  const chunks = [];
  for (let i = 0; i < groups.length; i++) {
    onStatus(`Building part ${i + 1} / ${groups.length}...`);
    const name = plainIndex ? `${prefix}_${i + 1}.pdf` : `${prefix}_part_${i + 1}.pdf`;
    chunks.push({ name, bytes: await saveSubset(srcDoc, groups[i]) });
  }
  return chunks;
}

export async function chunkByMaxSize(srcDoc, indices, maxMb, prefix, onStatus) {
  const maxBytes = maxMb * 1024 * 1024;
  const chunks = [];
  let current = [];
  let lastBytes = null;

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    onStatus(`Packing page ${i + 1}/${indices.length} (target ≤ ${maxMb} MB)...`);
    current.push(idx);
    const bytes = await saveSubset(srcDoc, current);
    if (bytes.byteLength > maxBytes && current.length > 1) {
      current.pop();
      chunks.push({ name: `${prefix}_part_${chunks.length + 1}.pdf`, bytes: lastBytes });
      current = [idx];
      lastBytes = await saveSubset(srcDoc, current);
    } else {
      lastBytes = bytes;
    }
  }
  if (lastBytes) {
    chunks.push({ name: `${prefix}_part_${chunks.length + 1}.pdf`, bytes: lastBytes });
  }
  return chunks;
}

export async function exportChunks(chunks, zipBaseName, onStatus, triggerDownload) {
  if (!chunks.length) throw new Error('No output pages produced.');
  if (chunks.length === 1) {
    triggerDownload(new Blob([chunks[0].bytes], { type: 'application/pdf' }), chunks[0].name);
    onStatus(`Saved ${chunks[0].name} (${(chunks[0].bytes.byteLength / 1024).toFixed(0)} KB).`);
    return;
  }
  const zip = new window.JSZip();
  chunks.forEach((c) => zip.file(c.name, c.bytes));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipName = `${zipBaseName}.zip`;
  triggerDownload(zipBlob, zipName);
  onStatus(`Exported ${chunks.length} PDFs into ${zipName}.`);
}

export function groupEveryN(indices, n) {
  const groups = [];
  for (let i = 0; i < indices.length; i += n) groups.push(indices.slice(i, i + n));
  return groups;
}

export function groupEqualParts(indices, parts) {
  const groups = [];
  const base = Math.floor(indices.length / parts);
  const rem = indices.length % parts;
  let offset = 0;
  for (let i = 0; i < parts; i++) {
    const size = base + (i < rem ? 1 : 0);
    groups.push(indices.slice(offset, offset + size));
    offset += size;
  }
  return groups;
}

export function parsePositiveInt(val, label) {
  const n = Number.parseInt(String(val || '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) throw new Error(`Enter a valid ${label} (≥ 1).`);
  return n;
}

export function parsePositiveFloat(val, label) {
  const n = Number.parseFloat(String(val || '').trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Enter a valid ${label} (> 0).`);
  return n;
}
