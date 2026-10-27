# Texture Mosaic — Technical Decisions

Status: v0.1 · 2026-10-25
New project spec. Modeled on `texture-stack-spec-v0.7.md` (TextureStack). The tech stack and architecture are **not decided here**: the agent decides them and records each choice in §6. The UI is defined by a Figma file and a premade CSS library (§7).

Reference files:
- `texture_mosaic.frag` — TouchDesigner shader. **Source of truth** for the mosaic behavior.
- `texture_mosaic_web.frag` — WebGL2 port of it. Reference implementation for the app.
- `saturation_control_pixel.glsl` (`src/shaders/fx_saturation.frag`) — WebGL2 port of the Adaptive Saturation Control FX pass.
- The **TextureStack** project (same repository family) — reference implementation for the app architecture, testing harness, Figma UI (`TextureStack` Figma file) and `letieu/terminal.css` library. Reuse its structure where it applies.

---

## 1. Goal

A web interface that runs the Texture Mosaic GLSL shader live. The canvas is split into a **base grid** of cells. A **control map** (video, webcam or image) picks, per base cell, a subdivision level `L` (0–3) using its luminance: each base cell subdivides into `factor × factor` sub-cells where `factor = multiplier^L`. Each sub-cell shows one thumbnail from an image **stack**, chosen by a per-level **index map** (`R = from`, `G = to`, `B = crossfade t`), optionally rotated per cell toward an **apex** point. An optional **mask** (video or image) mixes the original control image back in. The result goes through an **Adaptive Saturation Control FX stage** driven by an optional **saturation map** (`0 → min sat`, `1 → max sat`, empty = `1.0` untouched) and is drawn on a canvas. The web app is deployed and published on Netlify.

It is an artistic tool. The agent proves it works. The user judges how it looks and feels.

## 2. Decision status

| Area | Status |
|---|---|
| Behavior, inputs, controls (§3) | Decided |
| Shader logic and uniforms (§4) | Decided |
| Constraints (§5) | Decided |
| Tech stack, architecture, libraries, project structure, build, test tooling (§6) | **Decided by the agent** |
| UI: Figma and CSS library (§7) | Decided by the user |
| Testing split and done rule (§8) | Decided |
| Open questions (§10) | **Decided by the user** |

---

## 3. Behavior

Pipeline: **control source** (switch video/image/webcam/noise) + **index map source** (switch video/image/webcam/noise, mapped to all 4 `uIndexMap0..3`) + **stack** (n thumbnail images) + **mask source** (switch video/image/webcam/noise, optional) + **saturation map source** (switch video/image/webcam/noise, optional) + **UI controls** → mosaic shader → FX saturation stage → render canvas.

| # | Decision |
|---|---|
| D1 | Control, index map, saturation map, and mask each have their own video/image/webcam/noise switch. Switching does not reload the page. Loaded video files loop. |
| D2 | The stack is an ordered list of thumbnail images: add many, remove, reorder. Order = layer index. Maximum 32. |
| D3 | `num images` defaults to all loaded images and can be lowered. The shader only uses the first n. |
| D4 | One **working resolution** for the whole app (default 1280×720, selectable). Stack images are cover-fitted to it when loaded. Control, mask, saturation map, and index maps are sampled in normalized UV, so they stretch to the canvas. |
| D5 | The FX stage runs the **Adaptive Saturation Control** pass (`fx_saturation.frag`, ported from `saturation_control_pixel.glsl`), feeding the mosaic pass FBO output into `uScene` (input 0) and the saturation map into `uSatMap` (input 1). Pass-through is removed. When no saturation map is loaded, a neutral fallback (`51/255 = 0.2`, where `mix(0, 5, 0.2) = 1.0`) leaves saturation at `1.0` (no change). |
| D6 | Live render: updates every frame while any video/webcam plays or the offset animation speed is not 0; otherwise only when something changes. |
| D7 | PNG snapshot at working resolution. |
| D8 | All controls update in real time, are grouped (Grid / Rotation / Noise / Control / Shader / Saturation / Mask), and each has reset-to-default. Input preview thumbnails show the **processed** signal in real time (Control: grayscale level-driving signal with invert/contrast/luminance/offset; Saturation map: `mix(min, max, r)` multiplier; Mask: remapped `m` factor with min/max/invert/influence; Noise slots: current Perlin noise). |
| D9 | Errors (unsupported file, shader failure, no GPU support, too many images) are visible in the UI, never only in the console. |
| D10 | The look of the UI is defined by the Figma file (§7). |
| D11 | With no mask loaded, the mask controls are disabled and the app sets `uMaskInfluence = 0`. When a mask is loaded, influence defaults to 1. |
| D12 | The offset can be animated in v1: one linear animation with a single speed control (see "Offset animation" below). |
| D13 | The output is always opaque. Images with transparency are flattened over black when loaded, and the shader outputs alpha 1. The PNG snapshot has no transparency. |
| D14 | The bottom playback bar has one transport per input (control, index map, saturation map, mask): video shows play/pause, progress and time; webcam shows a red track and `Live`; image/empty shows a static grey track. A **sync** button (Parameters column) restarts all loaded videos from 0; newly loaded videos always start at time 0. |
| D15 | The **index map input** (video/image/webcam) is bound to all 4 shader index map samplers (`uIndexMap0..uIndexMap3`). Per fine cell, RGB = `(fromIdx, toIdx, t)`, all normalized 0..1 (`uIndexIsNormalized = 1` in the app). A default procedural index map is loaded on startup so the mosaic renders out of the box until the user loads an image, video, or webcam into the index map input. |

### Parameters

| UI name | Uniform / app name | Type | Range | Default | Description |
|---|---|---|---|---|---|
| grid size x | `uGridSize.x` | float | 4..240 | 60 | Base grid columns |
| grid size y | `uGridSize.y` | float | 4..240 | 60 | Base grid rows |
| subdiv multiplier | `uSubdivMultiplier` | float | 1.5..4 | 2 | Size contrast between L0 and L3 (`factor = mult^L`) |
| rotation mode | `uRotationMode` | int | 0/1/2 | 0 | 0 = off, 1 = continuous radial to apex, 2 = 4-face 90° snap |
| apex x | `uApexUV.x` | float | 0..1 | 0.5 | Apex center X (UV) |
| apex y | `uApexUV.y` | float | 0..1 | 0.5 | Apex center Y (UV) |
| noise scale | `noiseScale` (app) | float | 0.5..32 | 6 | Perlin noise base frequency |
| noise detail | `noiseDetail` (app) | int | 1..8 | 4 | Perlin noise fBm octave count |
| noise contrast | `noiseContrast` (app) | float | 0..4 | 1 | Perlin noise contrast around 0.5 |
| num images | `uNumImages` | int | 1..loaded | all | Thumbnails in use |
| smooth blend | `uSmoothBlend` | float 0/1 | 0/1 | 1 | `mix(from, to, t)` (1) vs hard switch showing `from` (0) |
| contrast | `uContrast` | float | 0..4 | 1 | Control contrast before the level lookup; 0 = flat grey |
| offset | `uOffset` | float | 0..1 | 0 | Added to control luminance; driven by speed animation |
| cyclic | `uCyclic` | float 0/1 | 0/1 | 0 | Levels wrap 0→1→2→3→0 (1) or clamp (0) |
| invert color | `uInvertControl` | float 0/1 | 0/1 | 0 | Invert control RGB before contrast |
| min sat | `uMinSaturation` | float | 0..5 | 0 | Saturation multiplier where saturation map = 0 (0 = grayscale, 1 = unchanged) |
| max sat | `uMaxSaturation` | float | 0..5 | 5 | Saturation multiplier where saturation map = 1 (>1 = oversaturated) |
| mask influence | `uMaskInfluence` | float | 0..1 | 1 (0 with no mask) | 0 = mask ignored, 1 = fully applied |
| invert mask | `uInvertMask` | float 0/1 | 0/1 | 0 | Flip the mask |
| mask min | `uMaskMin` | float | 0..1 | 0 | Mask values at or below this become 0 |
| mask max | `uMaskMax` | float | 0..1 | 1 | Mask values at or above this become 1 |

### Index map input

- The **index map input** (`webcam` / `video file` / `image file`) is mapped to all four shader index map uniforms (`uIndexMap0`, `uIndexMap1`, `uIndexMap2`, `uIndexMap3`), sampled with `NEAREST` at `fineUV`.
- Per fine cell, RGB = `(fromIdx, toIdx, t)`, all normalized 0..1 (`uIndexIsNormalized = 1` in the app): `fromIdx`/`toIdx` are stack layer indices scaled by `1/(n-1)`, `t` is the crossfade factor (`B` channel).
- On initial load, a default RGB noise/gradient index map image is preloaded into the index map slot so all stack layers and `smooth blend` work out of the box; the user can replace it with any image, video, or live webcam feed.

### Offset animation

Same as TextureStack: the app moves `uOffset` over time in a straight line. App-level control, shader does not change.

| UI name | Name | Type | Range | Default | Description |
|---|---|---|---|---|---|
| speed | `animSpeed` | float | -1..1 | 0 | Full 0→1 sweeps per second. 0 = no animation, negative runs backwards |

Rules: linear, wraps 1→0 (and 0→1 backwards); with `cyclic` on the level sequence wraps 0→1→2→3→0 seamlessly; the offset slider shows the current value and dragging it continues the animation from there; speed 0 freezes the offset; time comes from real elapsed time (tab hidden = pause, no jump on return); reset sets offset and speed to 0.

---

## 4. Shader contract

The behavior below is fixed and matches `texture_mosaic.frag`. Whatever API the agent chooses, the output must match `texture_mosaic_web.frag`. UV origin is **top-left** (row 0 = top) everywhere (shader, uploads, readbacks).

**Algorithm, per pixel**

1. Base tile: `baseGridUV = uv · gridSize`, `baseCellId = floor(baseGridUV)`, `baseLocalUV = fract(baseGridUV)`.
2. Level lookup: sample control at `controlUV = (baseCellId + 0.5) / gridSize`. Optional invert, then contrast per channel `c = clamp((control − 0.5) · contrast + 0.5, 0, 1)`, then `lum = dot(c, (0.2126, 0.7152, 0.0722))`.
   - **Cyclic off:** `L = clamp(floor(clamp(lum + offset, 0, 1) · 3 + 0.5), 0, 3)`.
   - **Cyclic on:** `L = floor(fract(lum + offset) · 4) mod 4`.
3. Sub-cells: `factor = multiplier^L`; `subCellId = floor(baseLocalUV · factor)`; `subLocalUV = fract(baseLocalUV · factor)`; `fineCellId = baseCellId · factor + subCellId`; `fineUV = (fineCellId + 0.5) / (gridSize · factor)`.
4. Apex rotation: with `rotation mode` off, `sampleUV = subLocalUV`. Mode 1: rotate so the cell's +Y points toward `apexUV` (continuous). Mode 2: snap to the dominant axis (N/S/E/W). See `texture_mosaic_web.frag` step 4 for the exact matrix.
5. Index lookup & sampling: sample the level-`L` index map at `fineUV`; decode `from = clamp(floor(R · (n−1) + 0.5), 0, n−1)`, `to` likewise, `t = clamp(B, 0, 1)`. Sample stack layers `from` and `to` at `sampleUV`. Mosaic = `mix(from, to, t)` when `smooth blend` is on, else `from` only.
6. Mask: same as TextureStack — `m_raw` = luminance of the mask pixel, remap with `lo/hi = min/max(maskMin, maskMax)`, invert, `m = mix(1, mask, clamp(influence, 0, 1))`.
7. `original` = `(control at uv).rgb`, **without** contrast or offset. Mosaic pass output RGB = `mix(original.rgb, mosaic.rgb, m)`, alpha = 1. Mask white shows the mosaic, mask black shows the original control image.
8. **FX Saturation pass (`fx_saturation.frag`):** samples the mosaic FBO (`uScene`) and the saturation map (`uSatMap.r`, or `51/255 = 0.2` when empty). Computes `satAmount = mix(uMinSaturation, uMaxSaturation, maskValue)`, perceptual luminance `luma = dot(srcColor.rgb, (0.2126, 0.7152, 0.0722))`, and outputs `clamp(mix(vec3(luma), srcColor.rgb, satAmount), 0, 1)` with alpha = 1.

**Rules**

- With `n = 1` every cell shows layer 0.
- All images and videos share the same orientation (no flipped sources).
- No transparency: flattened over black on load, output alpha always 1 (D13).
- Texture filtering on control, mask and index maps is NEAREST (cell-precise lookups); stack layers use LINEAR. Filtering must not change the pixel tests (§8.2).
- The stack is stored as one `TEXTURE_2D_ARRAY` at the working resolution (same reason as TextureStack: no dynamic sampler indexing in WebGL2).

---

## 5. Constraints

- Runs fully in the browser. No media is uploaded anywhere.
- Starts as a local app; then deployed as a **static site on Netlify**. No server code.
- Desktop Chrome and Firefox. Safari best effort.
- Target 30 fps or more at 1280×720 with 16 thumbnails, grid 60×60, and two playing videos on a mid-range laptop.
- 32 thumbnails at 1280×720 must allocate with no errors (about 118 MB).
- Shader code lives in its own file, not inside code strings.

## 6. Delegated to the agent

The agent decides: language, graphics API, build tool, project structure, dependencies, test tooling, the Netlify configuration. The UI approach is **not** delegated (§7).

**Rules for deciding**

1. Decide before building, and record it in the log below: the choice, the reason, and the alternatives considered.
2. Satisfy §3 to §5. Do not change the behavior to fit a tool. If a tool forces a change, tell the user.
3. Prefer few dependencies, mainstream and maintained tools, and a setup one person can run with three commands: install, run, review.
4. Do not lock the shader contract (§4) into a framework. The shader logic must stay portable.
5. Only ask the user about decisions that change what they see or do. Everything else is logged.
6. Reusing the TextureStack project structure (raw WebGL2 + `TEXTURE_2D_ARRAY`, TypeScript + Vite + Vitest + Playwright, CPU reference implementation, debug API, Figma + `terminal.css` UI) is allowed and encouraged.

**Decision log** (the agent fills in the empty rows)

| Decision | Choice | Why | Alternatives considered |
|---|---|---|---|
| Language | TypeScript 5 (strict ES2022 modules) | Type-safe shader uniform/parameter contracts, CPU reference math, and debug API; reuses the proven TextureStack setup. | Plain JavaScript (weaker guarantees on uniform/state contracts), Rust/WASM (unnecessary build complexity). |
| Graphics API | Raw WebGL2 (`#version 300 es` + `TEXTURE_2D_ARRAY` + 4 `TEXTURE_2D` index maps + FBO FX pass) | Directly runs `Shaders/texture_mosaic_web.frag` without framework lock-in (§6 Rule 4); `TEXTURE_2D_ARRAY` avoids dynamic sampler array indexing limits in WebGL2 and handles 32 layers at 1280×720 (~118 MB). | Three.js / Babylon.js / Regl (extra bundle weight and abstraction over a 2-pass fullscreen pipeline), WebGPU (narrower browser support), WebGL1 (no `sampler2DArray`). |
| Build tool | Vite 6 | Fast dev server, native `?raw` GLSL file imports (§5 standalone shader files), zero-config static production build (`dist/`) for Netlify. | Webpack, Parcel, Rollup, esbuild standalone. |
| Project structure | Modular separation: `src/shaders/` (GLSL files), `src/engine/` (`gl-pipeline.ts`, `index-maps.ts`, `state.ts`, `reference-cpu.ts`, `clock.ts`, `fixtures.ts`, `debug-api.ts`, `types.ts`), `src/ui/` (`app-ui.ts`, `terminal.css`, `styles.css`), `tests/` (`unit/`, `e2e/`, `REPORT.md`) | Keeps engine/shader/index-map state decoupled from the swappable UI (§7 Rule 3) and reuses the TextureStack architecture (§6 Rule 6). | Single-file bundle (hard to unit-test CPU reference and index-map generator), React/Vue component tree (unnecessary runtime dependency for a Vanilla + `terminal.css` UI). |
| Test tooling | Vitest (unit: CPU reference shader, deterministic PRNG/index maps, transition & offset clocks) + Playwright Chromium WebGL2 (e2e: GPU vs CPU pixel parity, controls, index transitions, media/webcam, static build, perf) | Fast deterministic unit tests plus real browser WebGL2 pixel readback, media transport, and UI verification in headless Chromium. | Jest (slower ESM integration), Cypress (heavier runner). |
| Netlify configuration | `netlify.toml` building `npm run build` → `dist/`, Node 22, security headers, `Permissions-Policy: camera=(self)` for webcam, immutable `/assets/*` caching | Reproducible zero-server static deploy with HTTPS webcam permission header and relative asset paths. | Manual drag-and-drop deploy (less reproducible, no custom headers). |
| Hosting | Netlify (static) | Decided by the user | |
| CSS library | `letieu/terminal.css` (`https://github.com/letieu/terminal.css`) | Decided by the user (`UI/CSS Library.md` & §7) | |

Feedback decisions from the review (§8.3) go in a separate file, `decisions.md`.

---

## 7. UI: Figma and CSS library

**Source of truth:** the Figma file is the visual reference. The CSS library provides the base components. For v1 the TextureStack Figma layout (Inputs left / Canvas + playback center / Parameters right) is the reference until a dedicated Texture Mosaic Figma exists.

**Rules** (same as TextureStack)

1. The Figma wins visually. The library provides the base components. Custom CSS only where the library lacks something, and each case is logged.
2. Figma variables (colors, spacing, type) become CSS custom properties. Layer names become component names.
3. **The UI must be swappable.** Logic and state live apart from presentation. Every control and button has a stable `data-testid`, so tests keep working when the UI is replaced.
4. Every component state in the Figma is implemented: default, hover, active, disabled, error, plus the empty and loaded states of the stack list and the thumbnails.

**Two phases**

1. **Engine phase:** the agent builds the app with a plain functional UI using the library's default look. It gets all automated tests and the behavior review. Aesthetics are not reviewed yet.
2. **UI pass** (when the Figma is ready): the agent maps the Figma to components and tokens, then hands over a review build. The user compares it side by side with the Figma.

---

## 8. Testing

### 8.1 Who checks what

| Agent verifies (automated) | The user judges (manual) |
|---|---|
| Code checks and build | Look of the UI, compared with the Figma |
| Shader pixels are correct | Look of the output: cell edges, subdivision feel, rotation, mask edges |
| Every control does what §3 says | Feel of sliders, shuffle transition, source switching |
| Sources, stack, index maps, mask logic | Fit with the creative workflow, using real media |
| Error handling | Smoothness on their own machine |
| Production build serves correctly, as on Netlify | |

### 8.2 What the agent must verify

Pixel checks use a small tolerance (about ±2 to 3 out of 255).

- **Shader**, compared with a plain-code CPU reference implementation of §4:
  - Grid: cell boundaries land exactly on `gridSize` divisions; pixels inside one base cell share its subdivision level.
  - Subdivision: control luminance bands give `L = 0, 1, 2, 3` (cyclic off), cyclic on wraps 3 → 0; `subdiv multiplier` 1.5, 2, 4.
  - Rotation: mode 0 is identity; mode 1 rotates each cell's +Y toward the apex (check cells left/right/above/below the apex); mode 2 snaps to N/S/E/W.
  - Index maps: normalized decode (`from`/`to` rounding and clamping), `t` crossfade, `smooth blend` on/off, `n = 1, 2, 32`, `num images` lower than loaded.
  - Control: contrast 1 / 0 / >1; offset clamp and wrap; luma weights (pure R, G, B); invert color.
  - Mask: white, black, mid-grey; min/max remap incl. min > max; invert; influence 0 / 0.5 / 1; mask luminance weights; the original control through the mask has no contrast and no offset.
  - Orientation of images and videos (top-left origin), no graphics errors after each case.
  - Transparency: a stack image with transparent pixels gives opaque output (alpha 255), flattened over black.
- **App:** source switching (image/video/webcam), stack add / remove / reorder, every control changes the output and reset restores it, mask controls disabled with no mask (D11), working-resolution change, snapshot is a valid opaque PNG of the right size, errors are visible, no console errors on load, playback transports and sync (D14).
- **Index maps:** same seed gives identical maps (deterministic), different seed changes the output, shuffle animates `t` 0 → 1 over the transition duration (controlled clock), grid size or `num images` change regenerates without a transition.
- **Offset animation**, with a controlled clock: speed 0 still; positive speed advances linearly and wraps; negative runs backwards; doubling speed doubles rate; slider follows; drag continues; hidden tab pauses with no jump; reset sets offset and speed to 0; cyclic level wrap 3 → 0 has no output jump.
- **Serving:** production build loads over HTTP as a static site (root and subfolder), no missing files or console errors.
- **Performance:** measure and report only; never fails the build.

**Support the app must provide for testing:** debug access in test builds only (read/set parameters, load media, read pixels, frame counter, graphics errors, inject index maps), a controllable clock, deterministic generated fixtures, a demo scene (`?demo=1`), and a toggleable stats overlay (fps, frame time, layers, resolution) in the review build.

### 8.3 The user's review

Same as TextureStack: after the agent tests pass, the agent starts a **review build** and hands over the URL, a short summary and `tests/REPORT.md` with screenshots. The user rates each area **Keep**, **Tweak** or **Rework** (Look / Output / Feel / Flow / Machine). Feedback in chat is enough. For each Tweak or Rework the agent writes the decision in `decisions.md`, updates this document, adds tasks, and adds a regression test if the feedback was about behavior.

### 8.4 Flow and rules

1. Agent builds, runs all automated checks, fixes failures.
2. Agent writes `tests/REPORT.md`: what passed, screenshots, performance numbers, known limitations.
3. Agent hands over the review build. The user reviews.
4. Agent applies feedback through this document, and the loop repeats.

- A step is **done** only when the automated checks pass **and** the user accepts the review.
- The agent never edits or removes a test to make it pass without writing why in the report.
- Any shader change also updates the reference implementation and its tests.
- A bug found by the user gets a failing test first, then the fix.
- Anything that cannot be verified without a real GPU goes under "Not verified" in the report.

---

## 9. Build order, future features, out of scope

**Suggested order** (each step ends with the agent test report and the user's review):
1. Shader running with hardcoded grid + index maps, with its tests.
2. Thumbnail stack and `num images`.
3. Control source, subdivision levels, and the control controls (contrast, offset, cyclic, offset animation).
4. Index-map generation (seed, shuffle, transition).
5. Rotation modes and apex.
6. Mask source and mask controls.
7. FX stage, snapshot, reset-to-default.
8. UI pass from the Figma.
9. Netlify deploy.

**Future features** (not in v1, but v1 must not block them):
- **Video recording** of the live output (canvas must stay capturable at working resolution).
- Custom index maps loaded from images, and artist-authored masks per level.

**Out of scope for v1:** FX content, saving / loading projects, multi-user, mobile layout, audio.

---

## 10. Open questions (Resolved 2026-10-25)

- **Q1.** Grid size range: is 4..240 (default 60×60) a good range, or should it go coarser/finer?
  - **Resolved:** Keep `4..240` (default `60×60`) as written in §3.
- **Q2.** Index-map generation beyond uniform random: value-noise clusters? radial gradients toward the apex?
  - **Resolved:** Keep v1 seeded uniform-random index-map generation as written in §3.
- **Q3.** Should the apex position be draggable on the canvas?
  - **Resolved:** Sliders and numeric inputs only in the Parameters panel for v1.
- **Q4.** Should index-map transitions also trigger automatically at an interval, or only on `shuffle` / seed change?
  - **Resolved:** Only on manual `shuffle` or `seed` change in v1.
- **Q5.** Netlify: which account and site name? Custom domain?
  - **Resolved:** Deployed to https://texturemosaic.netlify.app (team `src.phag`, project `texturemosaic`). No custom domain yet; static build verified locally and live.
