/**
 * Client-side Convert-from-PDF tools: PDF -> JPG/PNG, PowerPoint (.pptx), Word (.docx).
 */
import { triggerDownload } from './pdf-tools-org.js';

export async function pdfToImages(arrayBuffer, baseName, format, onStatus) {
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  const cleanName = baseName.replace(/\.pdf$/i, '');
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';

  if (doc.numPages === 1) {
    onStatus(`Rendering page 1 to ${ext.toUpperCase()}...`);
    const blob = await renderPageBlob(doc, 1, mime, 2.0);
    triggerDownload(blob, `${cleanName}_page_1.${ext}`);
    onStatus(`Exported ${cleanName}_page_1.${ext}.`);
    return;
  }

  const zip = new window.JSZip();
  for (let p = 1; p <= doc.numPages; p++) {
    onStatus(`Rendering page ${p} / ${doc.numPages} to ${ext.toUpperCase()}...`);
    const blob = await renderPageBlob(doc, p, mime, 2.0);
    zip.file(`${cleanName}_page_${p}.${ext}`, blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${cleanName}_${ext}_pages.zip`);
  onStatus(`Exported ${doc.numPages} pages to ${cleanName}_${ext}_pages.zip.`);
}

export async function pdfToPptx(arrayBuffer, baseName, onStatus) {
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  const cleanName = baseName.replace(/\.pdf$/i, '');
  const pptx = new window.PptxGenJS();

  for (let p = 1; p <= doc.numPages; p++) {
    onStatus(`Building slide ${p} / ${doc.numPages}...`);
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const slide = pptx.addSlide();
    slide.addImage({ data: dataUrl, x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'contain', w: 10, h: 5.625 } });
  }

  await pptx.writeFile({ fileName: `${cleanName}.pptx` });
  onStatus(`Exported ${doc.numPages} slide(s) to ${cleanName}.pptx.`);
}

export async function pdfToDocx(arrayBuffer, baseName, onStatus) {
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  const cleanName = baseName.replace(/\.pdf$/i, '');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = window.docx;
  const children = [];

  for (let p = 1; p <= doc.numPages; p++) {
    onStatus(`Extracting text from page ${p} / ${doc.numPages}...`);
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent();
    children.push(new Paragraph({
      text: `Page ${p}`,
      heading: HeadingLevel.HEADING_2,
    }));

    // Group items by approximate Y line
    const lines = groupTextByLine(textContent.items);
    for (const line of lines) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }

  const wordDoc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(wordDoc);
  triggerDownload(blob, `${cleanName}.docx`);
  onStatus(`Exported text from ${doc.numPages} page(s) to ${cleanName}.docx.`);
}

async function renderPageBlob(doc, pageNum, mime, scale) {
  const page = await doc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return await new Promise((res) => canvas.toBlob(res, mime, 0.92));
}

function groupTextByLine(items) {
  const lines = [];
  let currentY = null;
  let buf = [];
  for (const item of items) {
    const str = item.str;
    if (!str) continue;
    const y = Math.round(item.transform[5]);
    if (currentY !== null && Math.abs(y - currentY) > 4) {
      if (buf.length) lines.push(buf.join(' '));
      buf = [];
    }
    currentY = y;
    buf.push(str);
  }
  if (buf.length) lines.push(buf.join(' '));
  return lines;
}
