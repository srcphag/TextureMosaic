# Texture Mosaic — Decisions & Custom CSS Log

## User Clarifications (2026-10-25)

| # | Area | Decision |
|---|---|---|
| U1 | Build Flow (§9) | Build Steps 1–8 continuously into a single complete, tested review build with the Figma / `terminal.css` UI and `tests/REPORT.md`, then hand over for user review. |
| U2 | Grid Range & Index Maps (§10 Q1, Q2, Q4) | Keep §3 v1 defaults: `grid size x/y` range `4..240` (default `60×60`), seeded uniform-random index-map generation, and crossfade transition triggered manually on `shuffle` or `seed` change. |
| U3 | Apex Interaction (§10 Q3) | Control `apex x` and `apex y` via the Parameters panel sliders and numeric inputs only in v1. |
| U4 | Netlify Deploy (§10 Q5 & §9 Step 9) | Prepare `netlify.toml` and verify the static production build locally first; deploy to Netlify in Step 9 after local review. |
| U5 | Inherited TextureStack Decisions (D1–D15) | Retain shared working resolution (`1280×720` default, cover-fitted stack layers flattened over black), dual input playback transports with webcam `Live` red track and image/none static grey track, `⟲ sync videos` button in the Parameters column, and square cover-cropped source preview thumbnails. |
| U6 | 3 Media Inputs (`uControl`, `uIndexMap*`, `uMask`) & Remove Index-Map Generator Controls (review Rework, 2026-10-25) | The Inputs panel has 3 `webcam` / `video file` / `image file` media inputs: **control input** (`uControl`), **index map input** (mapped to all 4 shader `uIndexMap0..3`), and **mask input** (`uMask`). Removed the procedural `index maps` parameter group (`seed`, `transition duration`, `shuffle`) from the Parameters panel. Bottom playback bar shows 3 transports (Control left, Index Map center, Mask right), and `⟲ sync videos` syncs all 3 slots. |
| U7 | Manual Canvas Size Input Fix (review Bugfix, 2026-10-25) | `updateUI()` previously overwrote `resolution-width-input` and `resolution-height-input` on every animation frame while live rendering was active, preventing manual typing. Fixed by only syncing input `.value` when `workingWidth` / `workingHeight` changes and preserving user edits while focused, plus applying on `Enter` or `change`. Added regression test. |

## Custom CSS Additions Log (§7 Rule 1)

`letieu/terminal.css` v0.0.4 provides base terminal variables, typography, `.button`, `.control`, `.input`, `.progress`, `.toast`, `.tag`, and `.title`. The following custom rules are added in `src/ui/styles.css` where `terminal.css` lacks a component required by the Figma prototype and Spec §3:

1. **App 3-column studio grid (`Desktop - 1:1` / `16:9` layout):** Fixed left `Inputs` column (`319px`), flexible center `Canvas` + `Playback actions` stage, and fixed right `Parameters` column (`270px`, scrollable for all 6 parameter groups) matching the Figma frames (`1:2`, `10:701`, `10:1053`).
2. **Prefix + Input / Slider composite control (`.ts-control-box`, `.ts-control-split`, `.ts-slider`):** `terminal.css` `.control` only wraps a bare text `.input`. Added the Figma split prefix box (`border-right: 1px solid var(--ts-border)`) plus synchronized range slider + numeric readout and individual reset button.
3. **Segmented / Mode selector row (`.ts-mode-row`):** 3-way selector buttons for `rotation mode` (`0: off`, `1: radial`, `2: 4-face`) using `terminal.css` `.button` states.
4. **Source Thumbnail & Empty State Box (`.ts-source-preview`):** Square preview container (`118×118` in Figma) with empty-state bordered dropzone (`add image` glyph + cyan label from Figma node `10:1229`) and loaded cover-cropped thumbnail preview.
5. **Stack Thumbnail Strip & Drag-Reorder Items (`.ts-stack-container`, `.ts-stack-item`):** 3-column scrollable thumbnail grid with active layer badge, drag-over indicator, reorder buttons, and remove button.
6. **Stats Overlay (`.ts-stats-overlay`):** Toggleable monospace HUD overlay (`fps`, `frame time`, `layers`, `grid`, `resolution`) required by §8.2.
7. **Dual playback transports (`.ts-transports`, `.ts-transport`, track variants `.progress.is-live` / `.is-static`) and sync button:** Two side-by-side transport blocks (control / mask) with per-media track coloring (red `#ef2828` webcam `Live`, light grey `#d9d9d9` static image/none) from the Figma "Progress Bar" frame (D14).
