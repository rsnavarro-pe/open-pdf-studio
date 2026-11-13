/**
 * Pure geometry, scale conversion, AEC revision cloud path, and hit-testing utilities.
 */

export function distPt(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineLength(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distPt(points[i - 1], points[i]);
  }
  return total;
}

export function polygonPerimeter(points) {
  if (!points || points.length < 2) return 0;
  let total = polylineLength(points);
  if (points.length >= 3) {
    total += distPt(points[points.length - 1], points[0]);
  }
  return total;
}

export function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

export function formatLength(ptLen, unitsPerPt, unit) {
  if (!Number.isFinite(ptLen)) return '0.00';
  if (!unitsPerPt) return `${ptLen.toFixed(1)} pt`;
  return `${(ptLen * unitsPerPt).toFixed(2)} ${unit}`;
}

export function formatArea(ptArea, unitsPerPt, unit) {
  if (!Number.isFinite(ptArea)) return '0.00';
  if (!unitsPerPt) return `${ptArea.toFixed(0)} pt²`;
  const val = ptArea * unitsPerPt * unitsPerPt;
  return `${val.toFixed(2)} ${unit}²`;
}

/**
 * Convert viewport canvas coordinates (px) -> unrotated PDF points (72 dpi).
 */
export function screenToPdf(px, py, zoom, rotation, pageW, pageH) {
  const x = px / zoom;
  const y = py / zoom;
  switch (rotation % 360) {
    case 90:
      return { x: y, y: pageH - x };
    case 180:
      return { x: pageW - x, y: pageH - y };
    case 270:
      return { x: pageW - y, y: x };
    default:
      return { x, y };
  }
}

/**
 * Convert unrotated PDF points -> viewport canvas coordinates (px).
 */
export function pdfToScreen(ptX, ptY, zoom, rotation, pageW, pageH) {
  let x = ptX;
  let y = ptY;
  switch (rotation % 360) {
    case 90:
      x = pageH - ptY;
      y = ptX;
      break;
    case 180:
      x = pageW - ptX;
      y = pageH - ptY;
      break;
    case 270:
      x = ptY;
      y = pageW - ptX;
      break;
    default:
      break;
  }
  return { x: x * zoom, y: y * zoom };
}

/**
 * Generate an SVG path string for an AEC Revision Cloud around two corner points.
 */
export function buildRevisionCloudPath(p1, p2, arcSize = 16) {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 4 || h < 4) return '';

  const perimeter = [
    ...segmentPoints(minX, minY, maxX, minY, arcSize),
    ...segmentPoints(maxX, minY, maxX, maxY, arcSize),
    ...segmentPoints(maxX, maxY, minX, maxY, arcSize),
    ...segmentPoints(minX, maxY, minX, minY, arcSize),
  ];

  if (perimeter.length < 2) return '';
  let d = `M ${perimeter[0].x.toFixed(1)} ${perimeter[0].y.toFixed(1)}`;
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i];
    const b = perimeter[(i + 1) % perimeter.length];
    const r = Math.max(4, distPt(a, b) * 0.55);
    d += ` A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d + ' Z';
}

function segmentPoints(x1, y1, x2, y2, step) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const count = Math.max(1, Math.round(len / step));
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
  return pts;
}

/**
 * Hit-test a PDF point against a markup with a tolerance in PDF points.
 */
export function hitTestMarkup(markup, pt, tol = 8) {
  const pts = markup.points || [];
  if (!pts.length) return false;

  if (pts.length === 1) {
    return distPt(pts[0], pt) <= Math.max(tol, 24);
  }

  if (['rect', 'cloud', 'redact', 'sign'].includes(markup.type) && pts.length >= 2) {
    const minX = Math.min(pts[0].x, pts[1].x) - tol;
    const maxX = Math.max(pts[0].x, pts[1].x) + tol;
    const minY = Math.min(pts[0].y, pts[1].y) - tol;
    const maxY = Math.max(pts[0].y, pts[1].y) + tol;
    return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
  }

  if (markup.type === 'arrow' || markup.type === 'callout') {
    if (distPt(pts[0], pt) <= Math.max(tol, 18)) return true;
    for (let i = 1; i < pts.length; i++) {
      if (pointToSegmentDist(pt, pts[0], pts[i]) <= tol) return true;
    }
    return false;
  }

  for (let i = 1; i < pts.length; i++) {
    if (pointToSegmentDist(pt, pts[i - 1], pts[i]) <= tol) return true;
  }
  if ((markup.type === 'area' || markup.type === 'cutout') && pts.length >= 3) {
    if (pointInPolygon(pt, pts)) return true;
  }
  return false;
}

function pointToSegmentDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distPt(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distPt(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function pointInPolygon(pt, vs) {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
