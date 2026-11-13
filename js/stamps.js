/**
 * Embedded Stamp Catalog & Dynamic Token Resolver for RSN PDF Studio.
 */

export const EMBEDDED_STAMPS = [
  { id: 'RSN APPROVED', label: 'RSN Approved (Badge)', kind: 'badge', color: '#90472D' },
  { id: 'RSN REVIEWED', label: 'RSN Reviewed (Badge)', kind: 'badge', color: '#2C2C2E' },
  { id: 'DATE_STAMP', label: 'Date Stamp (dd/mm/yyyy)', kind: 'text_block', color: '#d61f1f', lines: [{ text: '&[dd]/&[mm]/&[yyyy]', size: 11, bold: true }] },
  {
    id: 'FOR_DISCUSSION', label: 'For Discussion (Ronnie S. Navarro)', kind: 'text_block', color: '#8b1a1a',
    lines: [
      { text: 'For Discussion', size: 18, bold: true },
      { text: 'by Ronnie S. Navarro on &[Date] &[Time]', size: 8.5, color: '#2C2C2E' },
    ],
  },
  {
    id: 'FOR_REVIEW_GREEN', label: 'For Review (Green + Timestamp)', kind: 'text_block', color: '#7a9e24',
    lines: [
      { text: 'For Review', size: 19, bold: true },
      { text: '&[Date] &[Time]', size: 9, color: '#2C2C2E' },
    ],
  },
  {
    id: 'INVOICE_APPROVAL', label: 'Dept of Public Services — Invoice Approval', kind: 'text_block', color: '#8b1a1a', center: true,
    lines: [
      { text: 'Department of Public Services', size: 10, bold: true },
      { text: 'Invoice Payment Approval', size: 13, bold: true },
      { text: 'by Ronnie S. Navarro on &[Date] &[Time]', size: 8, color: '#2C2C2E' },
      { text: '(not valid without signature)', size: 7.5, color: '#2C2C2E' },
    ],
  },
  {
    id: 'AFC_REVISED', label: 'Approved for Construction + Revised Print', kind: 'text_block', color: '#111111', center: true,
    lines: [
      { text: 'APPROVED FOR CONSTRUCTION', size: 14, bold: true },
      { text: 'PLEASE VERIFY ALL DIMENSIONS ON SITE', size: 8, bold: true },
      { text: 'AND REPORT ANY DISCREPANCIES', size: 8, bold: true },
      { text: 'REVISED PRINT', size: 14, bold: true },
      { text: 'DESTROY ALL PRINTS OF PREVIOUS ISSUE', size: 8, bold: true },
    ],
  },
  {
    id: 'AFC_STANDARD', label: 'Approved for Construction', kind: 'text_block', color: '#111111', center: true,
    lines: [
      { text: 'APPROVED FOR CONSTRUCTION', size: 14, bold: true },
      { text: 'PLEASE VERIFY ALL DIMENSIONS ON SITE', size: 8, bold: true },
      { text: 'AND REPORT ANY DISCREPANCIES', size: 8, bold: true },
    ],
  },
  { id: 'COORDINATION', label: 'COORDINATION', kind: 'text_block', color: '#111111', center: true, lines: [{ text: 'COORDINATION', size: 16, bold: true }] },
  {
    id: 'EXISTING_CONDITIONS', label: 'Existing Conditions', kind: 'text_block', color: '#111111', center: true,
    lines: [
      { text: 'THIS DRAWING PROVIDES', size: 8.5, bold: true },
      { text: 'EXISTING CONDITIONS', size: 15, bold: true },
    ],
  },
  {
    id: 'NOT_FOR_CONSTRUCTION', label: 'Not For Construction (Estimating)', kind: 'text_block', color: '#111111', center: true,
    lines: [
      { text: 'NOT FOR CONSTRUCTION', size: 14, bold: true },
      { text: 'THIS DRAWING PROVIDED ONLY FOR', size: 7.5, bold: true },
      { text: 'ESTIMATING PURPOSES', size: 13, bold: true },
    ],
  },
  {
    id: 'RECORD_DRAWING', label: 'Record Drawing', kind: 'text_block', color: '#111111', center: true,
    lines: [
      { text: 'RECORD', size: 16, bold: true },
      { text: 'DRAWING REFLECTS ALL', size: 8, bold: true },
      { text: 'APPROVED REVISIONS', size: 8, bold: true },
    ],
  },
  { id: 'COMPANY_REVIEW', label: 'Company Submittal Review Block', kind: 'company_block', color: '#d61f1f' },
  { id: 'SHOP_FURNISH', label: 'Shop Drawing — Furnish w/ Changes Noted', kind: 'shop_review', checked: 'FURNISH', color: '#d61f1f' },
  { id: 'SHOP_NO_EX', label: 'Shop Drawing — No Exceptions Taken', kind: 'shop_review', checked: 'NO_EX', color: '#d61f1f' },
  { id: 'SHOP_REJECTED', label: 'Shop Drawing — Rejected', kind: 'shop_review', checked: 'REJECTED', color: '#d61f1f' },
  { id: 'SHOP_REVISE', label: 'Shop Drawing — Revise and Resubmit', kind: 'shop_review', checked: 'REVISE', color: '#d61f1f' },
];

export function resolveStampTokens(str) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return String(str)
    .replace(/&\[dd\]/g, dd)
    .replace(/&\[mm\]/g, mm)
    .replace(/&\[yyyy\]/g, yyyy)
    .replace(/&\[Date\]/g, dateStr)
    .replace(/&\[Time\]/g, timeStr);
}

export function buildStampPayload(stampId) {
  const def = EMBEDDED_STAMPS.find((s) => s.id === stampId) || EMBEDDED_STAMPS[0];
  const payload = { ...def };
  if (payload.lines) {
    payload.lines = payload.lines.map((l) => ({ ...l, text: resolveStampTokens(l.text) }));
  }
  return payload;
}

export const SHOP_REVIEW_LINES = [
  'Review is only for purpose of general coordination and',
  'conformance with the design intent shown in contract',
  'documents. Review does not relieve subcontractor and or',
  'supplier of responsibility for full coordination, accuracy',
  'of information such as dimension or quantities, full',
  'compliance with the contract documents, installation',
  'instructions nor performance of equipment and / or',
  'systems being supplied. Any deviation or substitution',
  'must be submitted and approved prior to delivery. Review',
  'or acceptance of a specific item shall not indicate',
  'approval of an assembly of which the item is a component.',
];
