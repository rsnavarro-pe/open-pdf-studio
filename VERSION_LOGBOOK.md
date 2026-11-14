# RSN PDF Studio — Upstream Sync & Versioning Logbook

This logbook tracks bi-weekly upstream checks against open-source PDF & CAD reference repositories (**OpenPDF Studio** and **PDFCraft**), along with all integrated features, architectural improvements, and version releases in **RSN PDF Studio**.

---

## Upstream Reference Sources

| Upstream Project | Primary Scope / Modules Monitored | Sync Cadence |
| :--- | :--- | :--- |
| **OpenPDF Studio** | AEC & Engineering PDF annotations, scale calibration, quantity takeoff (BOQ), multi-leader callouts/arrows, revision clouds, CAD (`.dwg` / `.dxf`) vector conversion, OSNAP vector snapping | Every 2 weeks |
| **PDFCraft** | Dark workbench UI (`All tools`, `Edit`, `Convert`, `E-Sign`, `Measure & CAD`), N-Up multi-page layout, page numbering, grayscale/invert/flatten visual transforms, metadata editor/stripper, AcroForm filler/flattener, table-to-CSV extraction, one-click pipelines | Every 2 weeks |

---

## Release & Integration History

### `v1.4.0` — 2026-11-14 (Baseline Audit, Hardening & Blank PDF Creator)
- **Upstream Alignment:** Full parity audit against PDFCraft workbench patterns and OpenPDF Studio AEC tools.
- **New Features Integrated:**
  - **Create Blank PDF (`CREATE PDF`):** Added support for Letter, Legal, Tabloid (11×17), A4, A3, ARCH D (24×36), and ARCH E (36×48) sheets in Portrait/Landscape with Plain, Engineering Grid, and Lined Note templates (`js/tools-ui.js`, `js/workbench-ui.js`).
  - **Smooth Region Zoom & Zoom History:** Added marquee region zoom (`Z` or `Shift+Drag`), 60fps ease-out cubic zoom-and-pan transitions (`animateZoomTransition`), Zoom Back stack (`#btn-zoom-back`), Fit Whole Page, and offscreen double-buffered rendering (`js/pdf-engine.js`).
  - **Collapsible & Pinnable Properties Drawer:** Added collapse/expand toggle (`»` / `« PROPERTIES`) and pin state persistence for the right inspector panel (`js/workbench-ui.js`).
  - **Drawing-Aware Find & Auto-OCR (`Ctrl+F`):** Added spatial bounding-box highlights on canvas, markup text search, and Tesseract.js OCR fallback for scanned/SHX drawings (`js/search.js`).
  - **Multi-Leader Callouts & Arrows:** Added `+ Leader` support so a single callout or arrow can point to multiple drawing elements (`js/overlay.js`, `js/overlay-draw.js`, `js/exporter.js`).
- **Hardening & Bug Fixes (`bcf74fb`):**
  - Fixed `hexToRgb` parameter handling for Highlight and Sticky Note PDF exports in `js/exporter.js`.
  - Added custom rectangle fill/opacity and arrowhead style (`closed`, `open`, `dot`, `slash`, `both`) rendering to `exportAnnotatedPdf()`.
  - Protected `state.pdfBytes` against `ArrayBuffer` detachment across all PDF/CAD tools using `.slice().buffer`.
  - Fixed order-independent cutout area & volume (`CY` / `m³`) deductions in `js/takeoff.js` and `js/ui.js`.
  - Verified all 33 ES modules (`node --check`), DOM ID bindings (`0` missing IDs), and 10 automated test suites.

---

## Upcoming Bi-Weekly Upstream Sync Log

> **Automated Check Template (Appended Every 2 Weeks):**
> - **Sync Date:** `YYYY-MM-DD`
> - **Target Version:** `v1.x.y`
> - **Upstream Changes Detected (OpenPDF Studio & PDFCraft):**
> - **Features / Fixes Integrated into RSN PDF Studio:**
> - **Verification & Test Suite Status:**
