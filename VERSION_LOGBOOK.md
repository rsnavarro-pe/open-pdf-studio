# RSN PDF Studio — Upstream Sync & Versioning Logbook

This logbook tracks bi-weekly upstream checks against open-source PDF & CAD reference repositories (**OpenPDF Studio** and **PDFCraft**), along with all integrated features, architectural improvements, and version releases in **RSN PDF Studio**.

---

## Upstream Reference Sources

| Upstream Project | GitHub Repository | Primary Scope / Modules Monitored | Sync Cadence |
| :--- | :--- | :--- | :--- |
| **Open PDF Studio** | `OpenAEC-Foundation/open-pdf-studio` | AEC & Engineering PDF annotations, scale calibration, quantity takeoff (BOQ), multi-leader callouts/arrows, revision clouds, CAD (`.dwg` / `.dxf`) vector conversion, OSNAP vector snapping | Every 2 weeks (1st & 15th) |
| **PdfCraft** | `storytold/pdfcraft` (`PDFCraftTool/pdfcraft`) | Dark workbench UI (`All tools`, `Edit`, `Convert`, `E-Sign`, `Measure & CAD`), N-Up multi-page layout, page numbering, grayscale/invert/flatten visual transforms, metadata editor/stripper, AcroForm filler/flattener, table-to-CSV extraction, one-click pipelines | Every 2 weeks (1st & 15th) |

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

## Bi-Weekly Upstream Sync Log

### Sync #1 — 2026-11-14 (`v1.4.0` Verification & Upstream Baseline)
- **Sync Date:** `2026-11-14`
- **Target Version:** `v1.4.0`
- **Upstream Changes Detected:**
  - **`storytold/pdfcraft` (`v2026.11.08`):** Non-destructive byte preservation on save, deep undo history, workbench category navigation (`All tools`, `Edit`, `Convert`, `E-Sign`), and fallback font handling.
  - **`OpenAEC-Foundation/open-pdf-studio` (`v2026.45.0`):** CAD vector DWG/DXF import & export with scale preservation, drawing-aware OCR text search, AEC callouts/stamps/clouds, and direct plan scaling.
- **Features / Fixes Integrated into RSN PDF Studio:**
  - Non-destructive `ArrayBuffer` cloning (`.slice().buffer`) across all PDF/CAD tools so underlying document bytes are never mutated or detached in memory.
  - Full 5-category dropdown workbench header (`All tools ▾`, `Edit ▾`, `Convert ▾`, `E-Sign ▾`, `Measure & CAD ▾`), collapsible/pinnable Properties drawer, smooth 60fps region zoom, Blank PDF creator (including ARCH D & ARCH E engineering sheets), and multi-leader callouts/arrows.
- **Verification & Test Suite Status:** All 33 ES modules (`node --check`) and 10 automated test suites passed.

---

> **Automated Check Template (Appended Every 2 Weeks on the 1st & 15th):**
> - **Sync Date:** `YYYY-MM-DD`
> - **Target Version:** `v1.x.y`
> - **Upstream Changes Detected (`OpenAEC-Foundation/open-pdf-studio` & `storytold/pdfcraft`):**
> - **Features / Fixes Integrated into RSN PDF Studio:**
> - **Verification & Test Suite Status:**
