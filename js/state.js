/**
 * Central application state (Single Source of Truth).
 */
export const state = {
  pdfBytes: null,
  pdfName: '',
  numPages: 0,
  currentPage: 1,
  zoom: 1.0,
  rotation: 0, // 0, 90, 180, 270
  pageWidthPt: 0,
  pageHeightPt: 0,

  activeTool: 'select', // select | pan | calibrate | distance | perimeter | area | count | cloud | callout | arrow | rect | text | stamp
  selectedId: null,
  osnap: true,
  snapPoints: [],

  // Style defaults
  strokeColor: '#c0392b',
  fillColor: '#ffffff',
  fillOpacity: 0.12,
  highlightColor: '#facc15',
  lineWidth: 2,
  lineStyle: 'solid', // solid | dashed | dotted
  fontFamily: 'Helvetica', // Helvetica | Courier | Times
  fontSize: 13,
  fontBold: true,
  fontItalic: false,
  arrowHead: 'closed', // closed | open | slash | dot | both
  arrowSize: 11,
  cloudArc: 14,
  stampType: 'RSN APPROVED',
  signatureDataUrl: null,

  // Scale calibration: unitsPerPt (displayUnit per PDF point at zoom=1)
  unit: 'm',
  unitsPerPt: null, // null = uncalibrated (shows px/pt)
  scaleLabel: 'Not Set',

  // Annotations & Measurements: { id, page, type, points:[{x,y}], text?, stamp?, color, lineWidth }
  // Coordinates are stored in unrotated PDF points (72 dpi) so they stay accurate across zoom/rotation!
  markups: [],
  undoStack: [],
  redoStack: [],

  // Revision Comparison
  compare: {
    active: false,
    mode: 'overlay', // overlay | side-by-side
    revBBytes: null,
    revBName: '',
    opacity: 0.6,
  },
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn(state);
}

export function setTool(tool) {
  state.activeTool = tool;
  if (tool !== 'select') state.selectedId = null;
  notify();
}

export function pushHistory() {
  state.undoStack.push(JSON.stringify(state.markups));
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
}

export function addMarkup(markup) {
  pushHistory();
  state.markups.push(markup);
  state.selectedId = markup.id;
  notify();
}

export function deleteSelectedMarkup() {
  if (!state.selectedId) return;
  pushHistory();
  state.markups = state.markups.filter((m) => m.id !== state.selectedId);
  state.selectedId = null;
  notify();
}

export function undo() {
  if (!state.undoStack.length) return;
  state.redoStack.push(JSON.stringify(state.markups));
  state.markups = JSON.parse(state.undoStack.pop());
  state.selectedId = null;
  notify();
}

export function redo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(JSON.stringify(state.markups));
  state.markups = JSON.parse(state.redoStack.pop());
  state.selectedId = null;
  notify();
}

export function clearDocumentState(bytes, name, numPages) {
  state.pdfBytes = bytes;
  state.pdfName = name;
  state.numPages = numPages;
  state.currentPage = 1;
  state.rotation = 0;
  state.markups = [];
  state.undoStack = [];
  state.redoStack = [];
  state.selectedId = null;
  notify();
}

export function setPresetScale(preset) {
  // PDF point = 1/72 inch. 1 inch = 0.0254 m
  const PT_TO_M = 0.0254 / 72;
  const PT_TO_FT = 1 / (72 * 12);
  const unitFactors = { m: 1, cm: 100, mm: 1000, ft: 3.280839895, in: 39.37007874 };

  if (!preset) {
    state.unitsPerPt = null;
    state.scaleLabel = 'Not Set';
    notify();
    return;
  }

  if (preset.startsWith('1:')) {
    const ratio = Number(preset.split(':')[1]);
    const metersPerPt = PT_TO_M * ratio;
    state.unitsPerPt = metersPerPt * unitFactors[state.unit];
    state.scaleLabel = preset;
  } else if (preset === '1/4in=1ft') {
    // 0.25 in on paper = 1 ft real -> 18 pt = 1 ft
    const ftPerPt = 1 / (0.25 * 72);
    state.unitsPerPt = ftPerPt * (state.unit === 'ft' ? 1 : state.unit === 'in' ? 12 : 0.3048 * unitFactors[state.unit]);
    state.scaleLabel = '1/4"=1\'';
  } else if (preset === '1/8in=1ft') {
    const ftPerPt = 1 / (0.125 * 72);
    state.unitsPerPt = ftPerPt * (state.unit === 'ft' ? 1 : state.unit === 'in' ? 12 : 0.3048 * unitFactors[state.unit]);
    state.scaleLabel = '1/8"=1\'';
  } else {
    void PT_TO_FT;
  }
  notify();
}

export function convertUnit(oldUnit, newUnit) {
  if (!state.unitsPerPt || oldUnit === newUnit) {
    state.unit = newUnit;
    notify();
    return;
  }
  const toMeters = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };
  const factor = toMeters[oldUnit] / toMeters[newUnit];
  state.unitsPerPt = state.unitsPerPt * factor;
  state.unit = newUnit;
  notify();
}
