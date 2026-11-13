/**
 * ASCII DXF -> Native Vector PDF converter (via pdf-lib).
 * Supports LINE, LWPOLYLINE, CIRCLE, ARC, and TEXT entities.
 */

export async function dxfTextToPdfBytes(dxfText, PDFLibRef) {
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLibRef;
  const parsed = parseDxf(dxfText);

  const minX = parsed.extMin.x;
  const minY = parsed.extMin.y;
  const width = Math.max(100, parsed.extMax.x - minX);
  const height = Math.max(100, parsed.extMax.y - minY);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([width, height]);
  const stroke = rgb(0.12, 0.14, 0.16);

  const sx = (x) => x - minX;
  const sy = (y) => y - minY;

  for (const ent of parsed.entities) {
    if (ent.type === 'LINE') {
      page.drawLine({
        start: { x: sx(ent.x1), y: sy(ent.y1) },
        end: { x: sx(ent.x2), y: sy(ent.y2) },
        thickness: 1,
        color: stroke,
      });
    } else if (ent.type === 'LWPOLYLINE' && ent.pts.length >= 2) {
      for (let i = 1; i < ent.pts.length; i++) {
        page.drawLine({
          start: { x: sx(ent.pts[i - 1].x), y: sy(ent.pts[i - 1].y) },
          end: { x: sx(ent.pts[i].x), y: sy(ent.pts[i].y) },
          thickness: 1,
          color: stroke,
        });
      }
      if (ent.closed && ent.pts.length >= 3) {
        page.drawLine({
          start: { x: sx(ent.pts[ent.pts.length - 1].x), y: sy(ent.pts[ent.pts.length - 1].y) },
          end: { x: sx(ent.pts[0].x), y: sy(ent.pts[0].y) },
          thickness: 1,
          color: stroke,
        });
      }
    } else if (ent.type === 'CIRCLE') {
      page.drawCircle({
        x: sx(ent.x),
        y: sy(ent.y),
        size: ent.r,
        borderColor: stroke,
        borderWidth: 1,
      });
    } else if (ent.type === 'TEXT' && ent.text) {
      const safe = ent.text.replace(/[^\x20-\x7E]/g, '').trim();
      if (!safe) continue;
      page.drawText(safe, {
        x: sx(ent.x),
        y: sy(ent.y),
        size: Math.max(4, ent.height || 10),
        font,
        color: stroke,
        rotate: degrees(ent.rot || 0),
      });
    }
  }

  return await doc.save();
}

export function parseDxf(dxfText) {
  const raw = dxfText.replace(/\r\n/g, '\n').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    pairs.push([raw[i].trim(), raw[i + 1].trim()]);
  }

  const extMin = { x: 0, y: 0 };
  const extMax = { x: 842, y: 595 };
  const entities = [];

  let section = '';
  let headerVar = '';
  let cur = null;

  const flushEntity = () => {
    if (cur) entities.push(cur);
    cur = null;
  };

  for (const [code, val] of pairs) {
    if (code === '0' && val === 'SECTION') { section = ''; continue; }
    if (code === '2' && !section) { section = val; continue; }
    if (code === '0' && val === 'ENDSEC') { flushEntity(); section = ''; continue; }

    if (section === 'HEADER') {
      if (code === '9') { headerVar = val; continue; }
      if (headerVar === '$EXTMIN') {
        if (code === '10') extMin.x = Number(val);
        if (code === '20') extMin.y = Number(val);
      } else if (headerVar === '$EXTMAX') {
        if (code === '10') extMax.x = Number(val);
        if (code === '20') extMax.y = Number(val);
      }
      continue;
    }

    if (section === 'ENTITIES') {
      if (code === '0') {
        flushEntity();
        if (['LINE', 'LWPOLYLINE', 'CIRCLE', 'TEXT'].includes(val)) {
          cur = { type: val, pts: [], closed: false };
        }
        continue;
      }
      if (!cur) continue;

      if (cur.type === 'LINE') {
        if (code === '10') cur.x1 = Number(val);
        if (code === '20') cur.y1 = Number(val);
        if (code === '11') cur.x2 = Number(val);
        if (code === '21') cur.y2 = Number(val);
      } else if (cur.type === 'LWPOLYLINE') {
        if (code === '70') cur.closed = (Number(val) & 1) === 1;
        if (code === '10') cur.pts.push({ x: Number(val), y: 0 });
        if (code === '20' && cur.pts.length) cur.pts[cur.pts.length - 1].y = Number(val);
      } else if (cur.type === 'CIRCLE') {
        if (code === '10') cur.x = Number(val);
        if (code === '20') cur.y = Number(val);
        if (code === '40') cur.r = Number(val);
      } else if (cur.type === 'TEXT') {
        if (code === '10') cur.x = Number(val);
        if (code === '20') cur.y = Number(val);
        if (code === '40') cur.height = Number(val);
        if (code === '50') cur.rot = Number(val);
        if (code === '1') cur.text = val;
      }
    }
  }
  flushEntity();
  return { extMin, extMax, entities };
}
