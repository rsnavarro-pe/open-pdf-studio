/**
 * Generates a realistic 2-page AEC architectural floor plan PDF (Rev A & Rev B)
 * using pdf-lib so the studio can be tested immediately without external files.
 */

export async function generateSamplePdfBytes(isRevB = false) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Page 1: Landscape A3-ish architectural sheet (842 x 595 pt)
  const p1 = doc.addPage([842, 595]);
  drawTitleBlock(p1, bold, font, isRevB ? 'REV B - UPDATED LAYOUT' : 'REV A - BASE FLOOR PLAN', 'A-101');
  drawGrid(p1, font);

  // Outer building shell (10.00 m x 6.00 m at 1:50 -> 567 pt x 340 pt approx)
  const x0 = 120, y0 = 140, w = 500, h = 300;
  p1.drawRectangle({ x: x0, y: y0, width: w, height: h, borderColor: rgb(0.1, 0.15, 0.15), borderWidth: 3 });

  // Interior partition walls
  p1.drawLine({ start: { x: x0 + 220, y: y0 }, end: { x: x0 + 220, y: y0 + h }, thickness: 2, color: rgb(0.15, 0.2, 0.2) });
  p1.drawLine({ start: { x: x0 + 220, y: y0 + 160 }, end: { x: x0 + w, y: y0 + 160 }, thickness: 2, color: rgb(0.15, 0.2, 0.2) });

  // Room labels
  p1.drawText('OFFICE 101', { x: x0 + 60, y: y0 + 150, size: 12, font: bold, color: rgb(0.1, 0.2, 0.2) });
  p1.drawText('CONFERENCE 102', { x: x0 + 290, y: y0 + 220, size: 12, font: bold, color: rgb(0.1, 0.2, 0.2) });
  p1.drawText('LAB / MEP 103', { x: x0 + 290, y: y0 + 75, size: 12, font: bold, color: rgb(0.1, 0.2, 0.2) });

  // Known calibration dimension line at bottom: 10.00 m
  const dimY = y0 - 30;
  p1.drawLine({ start: { x: x0, y: dimY }, end: { x: x0 + w, y: dimY }, thickness: 1, color: rgb(0.15, 0.45, 0.4) });
  p1.drawLine({ start: { x: x0, y: dimY - 6 }, end: { x: x0, y: dimY + 6 }, thickness: 1.5, color: rgb(0.15, 0.45, 0.4) });
  p1.drawLine({ start: { x: x0 + w, y: dimY - 6 }, end: { x: x0 + w, y: dimY + 6 }, thickness: 1.5, color: rgb(0.15, 0.45, 0.4) });
  p1.drawText('10.00 m (CALIBRATION REF)', { x: x0 + 175, y: dimY - 14, size: 10, font: bold, color: rgb(0.15, 0.45, 0.4) });

  if (isRevB) {
    // Rev B changes: relocated door/partition & added equipment pad
    p1.drawRectangle({ x: x0 + 380, y: y0 + 30, width: 90, height: 60, borderColor: rgb(0.75, 0.2, 0.2), borderWidth: 2 });
    p1.drawText('NEW AHU PAD', { x: x0 + 390, y: y0 + 55, size: 9, font: bold, color: rgb(0.75, 0.2, 0.2) });
    p1.drawLine({ start: { x: x0 + 110, y: y0 }, end: { x: x0 + 110, y: y0 + 140 }, thickness: 2, color: rgb(0.75, 0.2, 0.2) });
  }

  // Page 2: Site / Detail Sheet
  const p2 = doc.addPage([842, 595]);
  drawTitleBlock(p2, bold, font, isRevB ? 'REV B - STRUCTURAL DETAIL' : 'REV A - STRUCTURAL DETAIL', 'S-201');
  p2.drawRectangle({ x: 140, y: 180, width: 260, height: 220, borderColor: rgb(0.1, 0.15, 0.15), borderWidth: 2 });
  p2.drawCircle({ x: 270, y: 290, size: 55, borderColor: rgb(0.1, 0.35, 0.35), borderWidth: 2 });
  p2.drawText('FOUNDATION PIER DETAIL A', { x: 185, y: 155, size: 11, font: bold, color: rgb(0.1, 0.2, 0.2) });

  return await doc.save();
}

function drawTitleBlock(page, bold, font, subtitle, sheetNo) {
  const { rgb } = window.PDFLib;
  page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: rgb(0.2, 0.25, 0.25), borderWidth: 1.5 });
  page.drawRectangle({ x: 618, y: 24, width: 200, height: 80, borderColor: rgb(0.2, 0.25, 0.25), borderWidth: 1.5 });
  page.drawText('RSN PDF STUDIO - SAMPLE', { x: 626, y: 84, size: 9, font: bold, color: rgb(0.1, 0.25, 0.25) });
  page.drawText(subtitle, { x: 626, y: 66, size: 8, font, color: rgb(0.3, 0.35, 0.35) });
  page.drawText(`SHEET: ${sheetNo}`, { x: 626, y: 40, size: 12, font: bold, color: rgb(0.15, 0.45, 0.4) });
}

function drawGrid(page, font) {
  const { rgb } = window.PDFLib;
  const cols = ['A', 'B', 'C', 'D'];
  cols.forEach((lbl, i) => {
    const x = 120 + i * 166;
    page.drawLine({ start: { x, y: 120 }, end: { x, y: 480 }, thickness: 0.5, color: rgb(0.75, 0.8, 0.8) });
    page.drawCircle({ x, y: 492, size: 10, borderColor: rgb(0.4, 0.5, 0.5), borderWidth: 1 });
    page.drawText(lbl, { x: x - 3.5, y: 488, size: 9, font, color: rgb(0.2, 0.3, 0.3) });
  });
}
