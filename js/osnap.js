/**
 * CAD Object Snap (OSNAP) extractor for PDF vector endpoints & corners.
 * Stores points in top-left unrotated PDF point coordinates (matching overlay.js).
 */

export async function extractPageSnapPoints(page, OPS) {
  const vp = page.getViewport({ scale: 1 });
  const pageH = vp.height;
  const opList = await page.getOperatorList();

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const pts = [];
  const seen = new Set();

  const addPt = (x, y) => {
    const px = ctm[0] * x + ctm[2] * y + ctm[4];
    const py = pageH - (ctm[1] * x + ctm[3] * y + ctm[5]);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const key = `${Math.round(px * 2)},${Math.round(py * 2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pts.push({ x: px, y: py });
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stack.push([...ctm]);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform) {
      ctm = mulMat(ctm, args);
    } else if (fn === OPS.constructPath) {
      const [ops, coords] = args;
      let idx = 0;
      for (const subOp of ops) {
        if (subOp === OPS.moveTo || subOp === OPS.lineTo) {
          addPt(coords[idx++], coords[idx++]);
        } else if (subOp === OPS.curveTo) {
          idx += 4;
          addPt(coords[idx++], coords[idx++]);
        } else if (subOp === OPS.curveTo2 || subOp === OPS.curveTo3) {
          idx += 2;
          addPt(coords[idx++], coords[idx++]);
        } else if (subOp === OPS.rectangle) {
          const x = coords[idx++], y = coords[idx++], w = coords[idx++], h = coords[idx++];
          addPt(x, y); addPt(x + w, y); addPt(x + w, y + h); addPt(x, y + h);
        }
      }
    } else if (fn === OPS.moveTo || fn === OPS.lineTo) {
      addPt(args[0], args[1]);
    } else if (fn === OPS.rectangle) {
      const [x, y, w, h] = args;
      addPt(x, y); addPt(x + w, y); addPt(x + w, y + h); addPt(x, y + h);
    }
    if (pts.length >= 12000) break;
  }

  return pts;
}

export function findNearestSnap(pt, snapPoints, thresholdPt) {
  if (!snapPoints || !snapPoints.length) return { pt, snapped: false };
  let best = null;
  let bestD2 = thresholdPt * thresholdPt;
  for (let i = 0; i < snapPoints.length; i++) {
    const sp = snapPoints[i];
    const dx = sp.x - pt.x;
    const dy = sp.y - pt.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = sp;
    }
  }
  return best ? { pt: best, snapped: true } : { pt, snapped: false };
}

function mulMat(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
