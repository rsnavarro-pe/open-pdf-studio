/**
 * Electronic Signature & Image Stamp modal (Draw, Type, or Upload with optional white-bg removal).
 */
import { state, notify } from './state.js';

export function initSignatureModal() {
  const modal = document.getElementById('sign-modal');
  const canvas = document.getElementById('sign-pad');
  if (!modal || !canvas) return;
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasStrokes = false;

  const clearPad = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes = false;
  };

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    hasStrokes = true;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = getPos(e);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = document.getElementById('sign-ink-color').value || '#183b3b';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });

  window.addEventListener('pointerup', () => { drawing = false; });

  document.getElementById('btn-sign-tool').addEventListener('click', () => {
    modal.classList.remove('hidden');
  });
  document.getElementById('sign-cancel').addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  document.getElementById('sign-clear').addEventListener('click', clearPad);

  // Type signature onto pad
  document.getElementById('sign-type-btn').addEventListener('click', () => {
    const txt = (document.getElementById('sign-type-input').value || '').trim();
    if (!txt) return;
    clearPad();
    ctx.fillStyle = document.getElementById('sign-ink-color').value || '#183b3b';
    ctx.font = 'italic 600 42px Georgia, "Times New Roman", serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 24, canvas.height / 2);
    hasStrokes = true;
  });

  // Upload signature or image/logo onto pad
  document.getElementById('sign-upload-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = await loadFileAsImage(f);
    clearPad();
    const scale = Math.min((canvas.width - 16) / img.width, (canvas.height - 16) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    if (document.getElementById('sign-remove-bg').checked) {
      stripWhiteBackground(ctx, canvas.width, canvas.height);
    }
    hasStrokes = true;
    e.target.value = '';
  });

  document.getElementById('sign-apply').addEventListener('click', () => {
    if (!hasStrokes) return;
    state.signatureDataUrl = canvas.toDataURL('image/png');
    state.activeTool = 'sign';
    modal.classList.add('hidden');
    notify();
  });
}

function stripWhiteBackground(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) d[i + 3] = 0;
  }
  ctx.putImageData(imgData, 0, 0);
}

export function loadFileAsImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}
