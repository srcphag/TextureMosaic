import { TextureMosaicEngine } from '../engine/state';
import { fetchPresetJson, listRepoPresets } from '../engine/presets';
import {
  AppState,
  DEFAULT_WORKING_HEIGHT,
  DEFAULT_WORKING_WIDTH,
  MediaSlotTarget,
  ShaderParams,
  TextureMosaicPresetV1,
} from '../engine/types';

function formatTimeMMSS(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const MEDIA_GLYPH_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <rect x="3" y="4" width="18" height="16" />
  <circle cx="8.5" cy="9.5" r="1.5" />
  <path d="M21 15l-5-5L5 20" />
</svg>`;

export function mountTextureMosaicUI(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  engine: TextureMosaicEngine
): void {
  canvas.className = 'ts-render-canvas';
  canvas.setAttribute('data-testid', 'render-canvas');

  root.innerHTML = `
    <!-- ERROR TOAST CONTAINER (Spec D9) -->
    <div class="toast-container" data-testid="error-container"></div>

    <!-- HIDDEN FILE INPUTS -->
    <input type="file" accept="image/*" style="display:none" data-testid="control-image-file-input" />
    <input type="file" accept="video/*,.mov,.mp4,.webm" style="display:none" data-testid="control-video-file-input" />
    <input type="file" accept="image/*" style="display:none" data-testid="indexMap-image-file-input" />
    <input type="file" accept="video/*,.mov,.mp4,.webm" style="display:none" data-testid="indexMap-video-file-input" />
    <input type="file" accept="image/*" style="display:none" data-testid="satMap-image-file-input" />
    <input type="file" accept="video/*,.mov,.mp4,.webm" style="display:none" data-testid="satMap-video-file-input" />
    <input type="file" accept="image/*" style="display:none" data-testid="mask-image-file-input" />
    <input type="file" accept="video/*,.mov,.mp4,.webm" style="display:none" data-testid="mask-video-file-input" />
    <input type="file" accept="image/*" multiple style="display:none" data-testid="stack-file-input" />
    <input type="file" accept=".json,application/json" style="display:none" data-testid="preset-file-input" />

    <!-- LEFT PANEL: INPUTS (Figma 10:479) -->
    <aside class="ts-panel-inputs" data-testid="panel-inputs">
      <div class="ts-section-heading">
        <span class="ts-section-title">Inputs</span>
      </div>

      <!-- 1. CONTROL INPUT -> uControl -->
      <section class="ts-source-block" data-testid="control-input-group">
        <div class="ts-block-header">
          <span class="ts-field-label">control input</span>
        </div>
        <div class="ts-source-grid">
          <div class="ts-source-buttons">
            <button type="button" class="button" data-testid="control-source-webcam">webcam</button>
            <button type="button" class="button" data-testid="control-source-video">video file</button>
            <button type="button" class="button" data-testid="control-source-image">image file</button>
            <button type="button" class="button" data-testid="control-source-noise">noise</button>
          </div>
          <div class="ts-source-preview" data-testid="control-thumbnail-box" title="Click to load control image or video">
            <div class="ts-empty-glyph">${MEDIA_GLYPH_SVG}</div>
            <span class="ts-empty-label">add image</span>
          </div>
        </div>
      </section>

      <!-- 2. INDEX MAP INPUT -> uIndexMap0..3 -->
      <section class="ts-source-block" data-testid="indexMap-input-group">
        <div class="ts-block-header">
          <span class="ts-field-label">index map input</span>
        </div>
        <div class="ts-source-grid">
          <div class="ts-source-buttons">
            <button type="button" class="button" data-testid="indexMap-source-webcam">webcam</button>
            <button type="button" class="button" data-testid="indexMap-source-video">video file</button>
            <button type="button" class="button" data-testid="indexMap-source-image">image file</button>
            <button type="button" class="button" data-testid="indexMap-source-noise">noise</button>
          </div>
          <div class="ts-source-preview" data-testid="indexMap-thumbnail-box" title="Click to load index map image or video">
            <div class="ts-empty-glyph">${MEDIA_GLYPH_SVG}</div>
            <span class="ts-empty-label">add image</span>
          </div>
        </div>
      </section>

      <!-- 3. SATURATION MAP INPUT -> uSatMap (FX stage) -->
      <section class="ts-source-block" data-testid="satMap-input-group">
        <div class="ts-block-header">
          <span class="ts-field-label">saturation map</span>
          <button type="button" class="ts-reset-inline" data-testid="satMap-clear-btn" title="Clear saturation map">clear</button>
        </div>
        <div class="ts-source-grid">
          <div class="ts-source-buttons">
            <button type="button" class="button" data-testid="satMap-source-webcam">webcam</button>
            <button type="button" class="button" data-testid="satMap-source-video">video file</button>
            <button type="button" class="button" data-testid="satMap-source-image">image file</button>
            <button type="button" class="button" data-testid="satMap-source-noise">noise</button>
          </div>
          <div class="ts-source-preview" data-testid="satMap-thumbnail-box" title="Click to load saturation map image or video">
            <div class="ts-empty-glyph">${MEDIA_GLYPH_SVG}</div>
            <span class="ts-empty-label">add image</span>
          </div>
        </div>
      </section>

      <!-- 4. MASK INPUT -> uMask -->
      <section class="ts-source-block" data-testid="mask-input-group">
        <div class="ts-block-header">
          <span class="ts-field-label">mask input</span>
          <button type="button" class="ts-reset-inline" data-testid="mask-clear-btn" title="Remove mask">clear</button>
        </div>
        <div class="ts-source-grid">
          <div class="ts-source-buttons">
            <button type="button" class="button" data-testid="mask-source-webcam">webcam</button>
            <button type="button" class="button" data-testid="mask-source-video">video file</button>
            <button type="button" class="button" data-testid="mask-source-image">image file</button>
            <button type="button" class="button" data-testid="mask-source-noise">noise</button>
          </div>
          <div class="ts-source-preview" data-testid="mask-thumbnail-box" title="Click to load mask image or video">
            <div class="ts-empty-glyph">${MEDIA_GLYPH_SVG}</div>
            <span class="ts-empty-label">add image</span>
          </div>
        </div>
      </section>

      <!-- 5. TEXTURE STACK INPUT (Figma 8:413) -->
      <section class="ts-source-block" data-testid="stack-input-group" style="flex:1; min-height:0;">
        <div class="ts-block-header">
          <span class="ts-field-label">texture input</span>
          <span class="ts-field-count" data-testid="stack-count-label">0 files</span>
        </div>
        <div class="ts-header-actions" style="justify-content: space-between;">
          <button type="button" class="button ts-btn-small" data-testid="stack-add-btn">+ add images</button>
          <button type="button" class="button ts-btn-small" data-testid="stack-clear-btn">clear</button>
        </div>
        <div class="ts-stack-container" data-testid="stack-list"></div>
      </section>
    </aside>

    <!-- CENTER PANEL: STAGE + PLAYBACK (Figma 2:106, 5:175, 10:629) -->
    <main class="ts-panel-stage" data-testid="panel-stage">
      <header class="ts-section-heading">
        <div style="display:flex; align-items:baseline; gap:12px;">
          <span class="ts-section-title">TextureMosaic v0.1</span>
          <span class="ts-section-meta" data-testid="resolution-label">1280 X 720 PX</span>
        </div>
        <div class="ts-header-actions">
          <button type="button" class="button ts-btn-small" data-testid="stats-toggle-btn">stats</button>
          <button type="button" class="button ts-btn-small" data-testid="reset-all-btn">reset all</button>
          <button type="button" class="button is-primary ts-btn-small" data-testid="snapshot-btn">snapshot png</button>
        </div>
      </header>

      <div class="ts-canvas-stage" data-testid="canvas-stage">
        <div class="ts-stats-overlay" data-testid="stats-overlay" style="display:none;"></div>
      </div>

      <footer class="ts-playback" data-testid="playback-actions">
        <div class="ts-transports">
          <!-- CONTROL INPUT TRANSPORT (D14) -->
          <div class="ts-transport" data-testid="control-transport">
            <div class="progress ts-progress-clickable is-static" data-testid="control-progress-bar">
              <div class="progress-bar" data-testid="control-progress-fill" style="width: 0%;"></div>
            </div>
            <div class="ts-transport-row">
              <div class="ts-transport-left">
                <button type="button" class="ts-media-btn" data-testid="control-play-pause-btn" title="Play / Pause control video" disabled>▶</button>
                <span class="ts-field-label" data-testid="control-status-label">Image</span>
              </div>
              <div class="ts-time-display" data-testid="control-time-label" style="display:none;">
                <span class="ts-time-current" data-testid="control-time-current">00:00</span>
                <span class="ts-time-total">/ <span data-testid="control-time-duration">00:00</span></span>
              </div>
              <span class="ts-live-label" data-testid="control-live-label" style="display:none;">Live</span>
            </div>
          </div>

          <!-- INDEX MAP INPUT TRANSPORT (D14) -->
          <div class="ts-transport" data-testid="indexMap-transport">
            <div class="progress ts-progress-clickable is-static" data-testid="indexMap-progress-bar">
              <div class="progress-bar" data-testid="indexMap-progress-fill" style="width: 0%;"></div>
            </div>
            <div class="ts-transport-row">
              <div class="ts-transport-left">
                <button type="button" class="ts-media-btn" data-testid="indexMap-play-pause-btn" title="Play / Pause index map video" disabled>▶</button>
                <span class="ts-field-label" data-testid="indexMap-status-label">Image</span>
              </div>
              <div class="ts-time-display" data-testid="indexMap-time-label" style="display:none;">
                <span class="ts-time-current" data-testid="indexMap-time-current">00:00</span>
                <span class="ts-time-total">/ <span data-testid="indexMap-time-duration">00:00</span></span>
              </div>
              <span class="ts-live-label" data-testid="indexMap-live-label" style="display:none;">Live</span>
            </div>
          </div>

          <!-- SATURATION MAP INPUT TRANSPORT (D14) -->
          <div class="ts-transport" data-testid="satMap-transport">
            <div class="progress ts-progress-clickable is-static" data-testid="satMap-progress-bar">
              <div class="progress-bar" data-testid="satMap-progress-fill" style="width: 0%;"></div>
            </div>
            <div class="ts-transport-row">
              <div class="ts-transport-left">
                <button type="button" class="ts-media-btn" data-testid="satMap-play-pause-btn" title="Play / Pause saturation map video" disabled>▶</button>
                <span class="ts-field-label" data-testid="satMap-status-label">None</span>
              </div>
              <div class="ts-time-display" data-testid="satMap-time-label" style="display:none;">
                <span class="ts-time-current" data-testid="satMap-time-current">00:00</span>
                <span class="ts-time-total">/ <span data-testid="satMap-time-duration">00:00</span></span>
              </div>
              <span class="ts-live-label" data-testid="satMap-live-label" style="display:none;">Live</span>
            </div>
          </div>

          <!-- MASK INPUT TRANSPORT (D14) -->
          <div class="ts-transport" data-testid="mask-transport">
            <div class="progress ts-progress-clickable is-static" data-testid="mask-progress-bar">
              <div class="progress-bar" data-testid="mask-progress-fill" style="width: 0%;"></div>
            </div>
            <div class="ts-transport-row">
              <div class="ts-transport-left">
                <button type="button" class="ts-media-btn" data-testid="mask-play-pause-btn" title="Play / Pause mask video" disabled>▶</button>
                <span class="ts-field-label" data-testid="mask-status-label">None</span>
              </div>
              <div class="ts-time-display" data-testid="mask-time-label" style="display:none;">
                <span class="ts-time-current" data-testid="mask-time-current">00:00</span>
                <span class="ts-time-total">/ <span data-testid="mask-time-duration">00:00</span></span>
              </div>
              <span class="ts-live-label" data-testid="mask-live-label" style="display:none;">Live</span>
            </div>
          </div>
        </div>
      </footer>
    </main>

    <!-- RIGHT PANEL: PARAMETERS (Figma 10:478 + Spec §3 Groups) -->
    <aside class="ts-panel-params" data-testid="panel-parameters">
      <div class="ts-section-heading">
        <span class="ts-section-title">Parameters</span>
      </div>

      <!-- PRESETS (full-scene JSON save / export / import) -->
      <section class="ts-param-group" data-testid="group-presets">
        <div class="ts-block-header">
          <span class="ts-field-label">presets</span>
          <div class="ts-header-actions">
            <button type="button" class="ts-reset-inline" data-testid="preset-import-btn" title="Import a preset .json file from disk">import</button>
            <button type="button" class="ts-reset-inline" data-testid="preset-export-btn" title="Export the current scene as a .json preset file">export</button>
          </div>
        </div>

        <div class="ts-control-split">
          <span class="ts-control-prefix">preset</span>
          <select class="ts-control-input ts-preset-select" data-testid="preset-select"></select>
        </div>

        <div class="ts-control-split">
          <span class="ts-control-prefix">name</span>
          <input type="text" class="ts-control-input" data-testid="preset-name-input" value="preset_01" spellcheck="false" />
        </div>
        <div class="ts-toggle-row">
          <button type="button" class="button" data-testid="preset-save-btn" title="Save the full scene (parameters + embedded media) as a preset">save preset</button>
        </div>
      </section>

      <!-- WORKING RESOLUTION / CANVAS SIZE (Figma 4:118) -->
      <section class="ts-param-group" data-testid="group-resolution">
        <div class="ts-block-header">
          <span class="ts-field-label">canvas size</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-resolution-btn" title="Reset resolution to 1280×720">rst</button>
        </div>
        <div class="ts-dual-controls">
          <div class="ts-control-split">
            <span class="ts-control-prefix">x</span>
            <input type="number" min="1" max="4096" step="1" class="ts-control-input" data-testid="resolution-width-input" value="1280" />
          </div>
          <div class="ts-control-split">
            <span class="ts-control-prefix">y</span>
            <input type="number" min="1" max="4096" step="1" class="ts-control-input" data-testid="resolution-height-input" value="720" />
          </div>
        </div>
      </section>

      <!-- GRID GROUP (Spec §3 Grid) -->
      <section class="ts-param-group" data-testid="group-grid">
        <div class="ts-block-header">
          <span class="ts-field-label">grid</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-group-grid-btn" title="Reset grid controls">rst all</button>
        </div>

        <div class="ts-dual-controls">
          <!-- grid size x -->
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">grid x</span>
              <input type="number" min="4" max="240" step="1" class="ts-control-input" data-testid="param-gridSizeX-input" value="60" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="4" max="240" step="1" class="ts-slider" data-testid="param-gridSizeX-slider" value="60" />
              <button type="button" class="ts-reset-inline" data-testid="reset-gridSizeX-btn" title="Reset grid size x">↺</button>
            </div>
          </div>

          <!-- grid size y -->
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">grid y</span>
              <input type="number" min="4" max="240" step="1" class="ts-control-input" data-testid="param-gridSizeY-input" value="60" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="4" max="240" step="1" class="ts-slider" data-testid="param-gridSizeY-slider" value="60" />
              <button type="button" class="ts-reset-inline" data-testid="reset-gridSizeY-btn" title="Reset grid size y">↺</button>
            </div>
          </div>
        </div>

        <!-- subdiv multiplier -->
        <div class="ts-control-box">
          <div class="ts-control-split">
            <span class="ts-control-prefix">subdiv mult</span>
            <input type="number" min="1.5" max="4" step="0.05" class="ts-control-input" data-testid="param-subdivMultiplier-input" value="2" />
          </div>
          <div class="ts-slider-row">
            <input type="range" min="1.5" max="4" step="0.05" class="ts-slider" data-testid="param-subdivMultiplier-slider" value="2" />
            <button type="button" class="ts-reset-inline" data-testid="reset-subdivMultiplier-btn" title="Reset subdiv multiplier">↺</button>
          </div>
        </div>
      </section>

      <!-- ROTATION GROUP (Spec §3 Rotation) -->
      <section class="ts-param-group" data-testid="group-rotation">
        <div class="ts-block-header">
          <span class="ts-field-label">rotation</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-group-rotation-btn" title="Reset rotation controls">rst all</button>
        </div>

        <!-- rotation mode (0 = off, 1 = radial, 2 = 4-face snap) -->
        <div class="ts-mode-row" data-testid="param-rotationMode-group">
          <button type="button" class="button is-primary" data-testid="param-rotationMode-0" title="0: Off">off</button>
          <button type="button" class="button" data-testid="param-rotationMode-1" title="1: Continuous Radial to Apex">radial</button>
          <button type="button" class="button" data-testid="param-rotationMode-2" title="2: 4-Face 90° Snap">4-face</button>
          <button type="button" class="ts-reset-inline" data-testid="reset-rotationMode-btn" title="Reset rotation mode">↺</button>
        </div>

        <div class="ts-dual-controls">
          <!-- apex x -->
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">apex x</span>
              <input type="number" min="0" max="1" step="0.01" class="ts-control-input" data-testid="param-apexX-input" value="0.5" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="0" max="1" step="0.01" class="ts-slider" data-testid="param-apexX-slider" value="0.5" />
              <button type="button" class="ts-reset-inline" data-testid="reset-apexX-btn" title="Reset apex x">↺</button>
            </div>
          </div>

          <!-- apex y -->
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">apex y</span>
              <input type="number" min="0" max="1" step="0.01" class="ts-control-input" data-testid="param-apexY-input" value="0.5" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="0" max="1" step="0.01" class="ts-slider" data-testid="param-apexY-slider" value="0.5" />
              <button type="button" class="ts-reset-inline" data-testid="reset-apexY-btn" title="Reset apex y">↺</button>
            </div>
          </div>
        </div>
      </section>

      <!-- PERLIN NOISE GROUP (Spec §3 Noise) -->
      <section class="ts-param-group" data-testid="group-noise">
        <div class="ts-block-header">
          <span class="ts-field-label">noise</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-group-noise-btn" title="Reset noise controls">rst all</button>
        </div>

        <div class="ts-dual-controls">
          <!-- noise scale -->
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">scale</span>
              <input type="number" min="0.5" max="32" step="0.5" class="ts-control-input" data-testid="param-noiseScale-input" value="6" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="0.5" max="32" step="0.5" class="ts-slider" data-testid="param-noiseScale-slider" value="6" />
              <button type="button" class="ts-reset-inline" data-testid="reset-noiseScale-btn" title="Reset noise scale">↺</button>
            </div>
          </div>

          <!-- noise detail -->
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">detail</span>
              <input type="number" min="1" max="8" step="1" class="ts-control-input" data-testid="param-noiseDetail-input" value="4" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="1" max="8" step="1" class="ts-slider" data-testid="param-noiseDetail-slider" value="4" />
              <button type="button" class="ts-reset-inline" data-testid="reset-noiseDetail-btn" title="Reset noise detail">↺</button>
            </div>
          </div>
        </div>

        <!-- noise contrast -->
        <div class="ts-control-box">
          <div class="ts-control-split">
            <span class="ts-control-prefix">contrast</span>
            <input type="number" min="0" max="4" step="0.05" class="ts-control-input" data-testid="param-noiseContrast-input" value="1" />
          </div>
          <div class="ts-slider-row">
            <input type="range" min="0" max="4" step="0.05" class="ts-slider" data-testid="param-noiseContrast-slider" value="1" />
            <button type="button" class="ts-reset-inline" data-testid="reset-noiseContrast-btn" title="Reset noise contrast">↺</button>
          </div>
        </div>
      </section>

      <!-- ANIMATION (Figma 10:470) -->
      <section class="ts-param-group" data-testid="group-animation">
        <div class="ts-block-header">
          <span class="ts-field-label">animation</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-animSpeed-btn" title="Reset speed to 0">rst</button>
        </div>
        <div class="ts-control-box">
          <div class="ts-control-split">
            <span class="ts-control-prefix">speed</span>
            <input type="number" min="-1" max="1" step="0.05" class="ts-control-input" data-testid="param-animSpeed-input" value="0" />
          </div>
          <div class="ts-slider-row">
            <input type="range" min="-1" max="1" step="0.01" class="ts-slider" data-testid="param-animSpeed-slider" value="0" />
          </div>
        </div>
        <div class="ts-toggle-row">
          <button type="button" class="button" data-testid="video-sync-btn" title="Restart all videos from the beginning" disabled>⟲ sync videos</button>
        </div>
      </section>

      <!-- INPUT / CONTROL CONTROLS (Figma 2:86 + Spec §3 Control group) -->
      <section class="ts-param-group" data-testid="group-control">
        <div class="ts-block-header">
          <span class="ts-field-label">control</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-group-control-btn" title="Reset control parameters">rst all</button>
        </div>

        <!-- contrast -->
        <div class="ts-control-box">
          <div class="ts-control-split">
            <span class="ts-control-prefix">contrast</span>
            <input type="number" min="0" max="4" step="0.05" class="ts-control-input" data-testid="param-contrast-input" value="1" />
          </div>
          <div class="ts-slider-row">
            <input type="range" min="0" max="4" step="0.01" class="ts-slider" data-testid="param-contrast-slider" value="1" />
            <button type="button" class="ts-reset-inline" data-testid="reset-contrast-btn" title="Reset contrast">↺</button>
          </div>
        </div>

        <!-- offset -->
        <div class="ts-control-box">
          <div class="ts-control-split">
            <span class="ts-control-prefix">offset</span>
            <input type="number" min="0" max="1" step="0.01" class="ts-control-input" data-testid="param-offset-input" value="0" />
          </div>
          <div class="ts-slider-row">
            <input type="range" min="0" max="1" step="0.005" class="ts-slider" data-testid="param-offset-slider" value="0" />
            <button type="button" class="ts-reset-inline" data-testid="reset-offset-btn" title="Reset offset & speed">↺</button>
          </div>
        </div>

        <!-- cyclic toggle -->
        <div class="ts-toggle-row">
          <button type="button" class="button" data-testid="param-cyclic-toggle">cyclic</button>
          <button type="button" class="ts-reset-inline" data-testid="reset-cyclic-btn" title="Reset cyclic">↺</button>
        </div>

        <!-- invert color toggle -->
        <div class="ts-toggle-row">
          <button type="button" class="button" data-testid="param-invertControl-toggle">invert color</button>
          <button type="button" class="ts-reset-inline" data-testid="reset-invertControl-btn" title="Reset invert color">↺</button>
        </div>
      </section>

      <!-- SHADER CONTROLS (Figma 8:360 + Spec §3 Shader group) -->
      <section class="ts-param-group" data-testid="group-shader">
        <div class="ts-block-header">
          <span class="ts-field-label">shader</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-group-shader-btn" title="Reset shader controls">rst all</button>
        </div>

        <!-- num images -->
        <div class="ts-control-box">
          <div class="ts-control-split">
            <span class="ts-control-prefix">num images</span>
            <input type="number" min="1" max="32" step="1" class="ts-control-input" data-testid="param-numImages-input" value="1" />
          </div>
          <div class="ts-slider-row">
            <input type="range" min="1" max="32" step="1" class="ts-slider" data-testid="param-numImages-slider" value="1" />
            <button type="button" class="ts-reset-inline" data-testid="reset-numImages-btn" title="Reset num images to all">↺</button>
          </div>
        </div>

        <!-- smooth blend -->
        <div class="ts-toggle-row">
          <button type="button" class="button is-primary" data-testid="param-smoothBlend-toggle">smooth blend</button>
          <button type="button" class="ts-reset-inline" data-testid="reset-smoothBlend-btn" title="Reset smooth blend">↺</button>
        </div>
      </section>

      <!-- SATURATION FX CONTROLS (Spec §3 Saturation / FX group) -->
      <section class="ts-param-group" data-testid="group-saturation">
        <div class="ts-block-header">
          <span class="ts-field-label">saturation</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-group-saturation-btn" title="Reset saturation controls">rst all</button>
        </div>

        <div class="ts-dual-controls">
          <!-- min saturation -->
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">min</span>
              <input type="number" min="0" max="5" step="0.05" class="ts-control-input" data-testid="param-satMin-input" value="0" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="0" max="5" step="0.05" class="ts-slider" data-testid="param-satMin-slider" value="0" />
              <button type="button" class="ts-reset-inline" data-testid="reset-satMin-btn" title="Reset min saturation">↺</button>
            </div>
          </div>

          <!-- max saturation -->
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">max</span>
              <input type="number" min="0" max="5" step="0.05" class="ts-control-input" data-testid="param-satMax-input" value="5" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="0" max="5" step="0.05" class="ts-slider" data-testid="param-satMax-slider" value="5" />
              <button type="button" class="ts-reset-inline" data-testid="reset-satMax-btn" title="Reset max saturation">↺</button>
            </div>
          </div>
        </div>
      </section>

      <!-- MASK CONTROLS (Figma 8:384 + Spec §3 Mask group) -->
      <section class="ts-param-group" data-testid="group-mask">
        <div class="ts-block-header">
          <span class="ts-field-label">mask</span>
          <button type="button" class="ts-reset-inline" data-testid="reset-group-mask-btn" title="Reset mask controls">rst all</button>
        </div>

        <!-- mask influence -->
        <div class="ts-control-box">
          <div class="ts-control-split">
            <span class="ts-control-prefix">influence</span>
            <input type="number" min="0" max="1" step="0.05" class="ts-control-input" data-testid="param-maskInfluence-input" value="0" />
          </div>
          <div class="ts-slider-row">
            <input type="range" min="0" max="1" step="0.01" class="ts-slider" data-testid="param-maskInfluence-slider" value="0" />
            <button type="button" class="ts-reset-inline" data-testid="reset-maskInfluence-btn" title="Reset mask influence">↺</button>
          </div>
        </div>

        <!-- mask min & max (Figma 10:458) -->
        <div class="ts-dual-controls">
          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">min</span>
              <input type="number" min="0" max="1" step="0.05" class="ts-control-input" data-testid="param-maskMin-input" value="0" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="0" max="1" step="0.01" class="ts-slider" data-testid="param-maskMin-slider" value="0" />
              <button type="button" class="ts-reset-inline" data-testid="reset-maskMin-btn" title="Reset mask min">↺</button>
            </div>
          </div>

          <div class="ts-control-box">
            <div class="ts-control-split">
              <span class="ts-control-prefix">max</span>
              <input type="number" min="0" max="1" step="0.05" class="ts-control-input" data-testid="param-maskMax-input" value="1" />
            </div>
            <div class="ts-slider-row">
              <input type="range" min="0" max="1" step="0.01" class="ts-slider" data-testid="param-maskMax-slider" value="1" />
              <button type="button" class="ts-reset-inline" data-testid="reset-maskMax-btn" title="Reset mask max">↺</button>
            </div>
          </div>
        </div>

        <!-- invert mask -->
        <div class="ts-toggle-row">
          <button type="button" class="button" data-testid="param-invertMask-toggle">invert mask</button>
          <button type="button" class="ts-reset-inline" data-testid="reset-invertMask-btn" title="Reset invert mask">↺</button>
        </div>
      </section>
    </aside>
  `;

  const q = <T extends HTMLElement>(testId: string): T => {
    const el = root.querySelector(`[data-testid="${testId}"]`);
    if (!el) throw new Error(`Missing UI element [data-testid="${testId}"]`);
    return el as T;
  };

  // Mount canvas inside stage
  const canvasStage = q<HTMLDivElement>('canvas-stage');
  canvasStage.appendChild(canvas);

  const stackFileInput = q<HTMLInputElement>('stack-file-input');

  // Wire all 4 media slots ('control', 'indexMap', 'satMap', 'mask') uniformly (D1 & D14)
  const bindMediaSlotUI = (target: MediaSlotTarget) => {
    const imgInput = q<HTMLInputElement>(`${target}-image-file-input`);
    const vidInput = q<HTMLInputElement>(`${target}-video-file-input`);

    q<HTMLButtonElement>(`${target}-source-image`).addEventListener(
      'click',
      () => {
        if (!engine.activateSlotMode(target, 'image')) {
          imgInput.click();
        }
      }
    );
    q<HTMLButtonElement>(`${target}-source-video`).addEventListener(
      'click',
      () => {
        if (!engine.activateSlotMode(target, 'video')) {
          vidInput.click();
        }
      }
    );
    q<HTMLButtonElement>(`${target}-source-webcam`).addEventListener(
      'click',
      () => {
        if (!engine.activateSlotMode(target, 'webcam')) {
          engine.startSlotWebcam(target);
        }
      }
    );
    q<HTMLButtonElement>(`${target}-source-noise`).addEventListener(
      'click',
      () => {
        engine.activateSlotMode(target, 'noise');
      }
    );
    q<HTMLDivElement>(`${target}-thumbnail-box`).addEventListener(
      'click',
      () => {
        const s = engine.getState();
        const src =
          target === 'control'
            ? s.controlSource
            : target === 'indexMap'
              ? s.indexMapSource
              : target === 'satMap'
                ? s.satMapSource
                : s.maskSource;
        if (src.mode === 'video') {
          vidInput.click();
        } else {
          imgInput.click();
        }
      }
    );

    imgInput.addEventListener('change', async () => {
      if (imgInput.files?.[0]) {
        await engine.loadSlotFile(target, imgInput.files[0]);
        imgInput.value = '';
      }
    });
    vidInput.addEventListener('change', async () => {
      if (vidInput.files?.[0]) {
        await engine.loadSlotFile(target, vidInput.files[0]);
        vidInput.value = '';
      }
    });

    q<HTMLButtonElement>(`${target}-play-pause-btn`).addEventListener(
      'click',
      () => {
        engine.toggleVideoPlayback(target);
      }
    );
    q<HTMLDivElement>(`${target}-progress-bar`).addEventListener(
      'click',
      (e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (rect.width > 0) {
          const p = (e.clientX - rect.left) / rect.width;
          engine.seekVideoNormalized(target, p);
        }
      }
    );
  };

  bindMediaSlotUI('control');
  bindMediaSlotUI('indexMap');
  bindMediaSlotUI('satMap');
  bindMediaSlotUI('mask');

  q<HTMLButtonElement>('satMap-clear-btn').addEventListener('click', () => {
    engine.clearSatMap();
  });
  q<HTMLButtonElement>('mask-clear-btn').addEventListener('click', () => {
    engine.clearMask();
  });

  // Wire Stack buttons
  q<HTMLButtonElement>('stack-add-btn').addEventListener('click', () => {
    stackFileInput.click();
  });
  q<HTMLButtonElement>('stack-clear-btn').addEventListener('click', () => {
    engine.clearStack();
  });
  stackFileInput.addEventListener('change', async () => {
    if (stackFileInput.files && stackFileInput.files.length > 0) {
      await engine.addStackFiles(stackFileInput.files);
      stackFileInput.value = '';
    }
  });

  // Wire Stage Header & Sync
  q<HTMLButtonElement>('snapshot-btn').addEventListener('click', () => {
    engine.downloadSnapshotPng();
  });
  q<HTMLButtonElement>('stats-toggle-btn').addEventListener('click', () => {
    engine.toggleStats();
  });
  q<HTMLButtonElement>('reset-all-btn').addEventListener('click', () => {
    engine.resetGroup('all');
  });
  q<HTMLButtonElement>('video-sync-btn').addEventListener('click', () => {
    engine.syncVideosToStart();
  });

  // Wire Presets (full-scene JSON save / export / import + repo dropdown)
  const presetSelect = q<HTMLSelectElement>('preset-select');
  const presetNameInput = q<HTMLInputElement>('preset-name-input');
  const presetFileInput = q<HTMLInputElement>('preset-file-input');
  const repoPresets = listRepoPresets();
  const sessionPresets = new Map<string, TextureMosaicPresetV1>();
  let sessionPresetCounter = 1;

  const populatePresetSelect = (selectedValue?: string) => {
    presetSelect.innerHTML = '';
    if (repoPresets.length === 0 && sessionPresets.size === 0) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'no presets available';
      presetSelect.appendChild(empty);
      presetSelect.disabled = true;
      return;
    }
    presetSelect.disabled = false;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— select preset —';
    presetSelect.appendChild(placeholder);
    for (const entry of repoPresets) {
      const opt = document.createElement('option');
      opt.value = `repo:${entry.id}`;
      opt.textContent = entry.name;
      presetSelect.appendChild(opt);
    }
    for (const [id, preset] of sessionPresets) {
      const opt = document.createElement('option');
      opt.value = `session:${id}`;
      opt.textContent = preset.name;
      presetSelect.appendChild(opt);
    }
    presetSelect.value = selectedValue ?? '';
  };
  populatePresetSelect();

  presetSelect.addEventListener('change', async () => {
    const value = presetSelect.value;
    if (!value) return;
    try {
      if (value.startsWith('repo:')) {
        const id = value.slice(5);
        const entry = repoPresets.find((e) => e.id === id);
        if (!entry) return;
        const json = await fetchPresetJson(entry.url);
        if (await engine.importPresetObject(json)) {
          presetNameInput.value = entry.name;
        }
      } else if (value.startsWith('session:')) {
        const preset = sessionPresets.get(value.slice(8));
        if (!preset) return;
        if (await engine.importPresetObject(preset)) {
          presetNameInput.value = preset.name;
        }
      }
    } catch (err) {
      engine.addError(
        err instanceof Error ? err.message : 'Failed to load preset.'
      );
    }
  });

  const saveCurrentSceneToSession = async (): Promise<void> => {
    const name = presetNameInput.value.trim() || `preset_${sessionPresetCounter}`;
    const preset = await engine.exportPresetObject(name);
    const id = `p${sessionPresetCounter++}`;
    sessionPresets.set(id, preset);
    populatePresetSelect(`session:${id}`);
  };

  q<HTMLButtonElement>('preset-save-btn').addEventListener('click', async () => {
    await saveCurrentSceneToSession();
    await engine.downloadPresetJson(presetNameInput.value.trim() || 'preset_01');
  });
  q<HTMLButtonElement>('preset-export-btn').addEventListener(
    'click',
    async () => {
      await engine.downloadPresetJson(
        presetNameInput.value.trim() || 'preset_01'
      );
    }
  );
  q<HTMLButtonElement>('preset-import-btn').addEventListener('click', () => {
    presetFileInput.click();
  });
  presetFileInput.addEventListener('change', async () => {
    const file = presetFileInput.files?.[0];
    presetFileInput.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      if (await engine.importPresetObject(json)) {
        const preset = json as TextureMosaicPresetV1;
        const name =
          typeof preset.name === 'string' && preset.name.trim()
            ? preset.name
            : file.name.replace(/\.json$/i, '');
        presetNameInput.value = name;
        const id = `p${sessionPresetCounter++}`;
        sessionPresets.set(id, { ...preset, name });
        populatePresetSelect(`session:${id}`);
      }
    } catch {
      engine.addError(`"${file.name}" is not valid JSON.`);
    }
  });

  // Wire Working Resolution (U7 fix: preserve user typing during live animation frames, apply on Enter or change)
  const resWInput = q<HTMLInputElement>('resolution-width-input');
  const resHInput = q<HTMLInputElement>('resolution-height-input');
  const applyResolutionChange = () => {
    const curState = engine.getState();
    const w = parseInt(resWInput.value, 10);
    const h = parseInt(resHInput.value, 10);
    engine.setWorkingResolution(
      Number.isFinite(w) ? w : curState.workingWidth,
      Number.isFinite(h) ? h : curState.workingHeight
    );
  };
  resWInput.addEventListener('change', applyResolutionChange);
  resHInput.addEventListener('change', applyResolutionChange);
  resWInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyResolutionChange();
      resWInput.blur();
    }
  });
  resHInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyResolutionChange();
      resHInput.blur();
    }
  });
  q<HTMLButtonElement>('reset-resolution-btn').addEventListener('click', () => {
    engine.setWorkingResolution(DEFAULT_WORKING_WIDTH, DEFAULT_WORKING_HEIGHT);
  });

  // Wire Slider + Numeric Input parameters
  const bindContinuousParam = (key: keyof ShaderParams) => {
    const numEl = q<HTMLInputElement>(`param-${key}-input`);
    const sliderEl = q<HTMLInputElement>(`param-${key}-slider`);
    const resetBtn = q<HTMLButtonElement>(`reset-${key}-btn`);

    sliderEl.addEventListener('input', () => {
      engine.setParam(key, parseFloat(sliderEl.value));
    });
    numEl.addEventListener('input', () => {
      const v = parseFloat(numEl.value);
      if (!Number.isNaN(v)) {
        engine.setParam(key, v);
      }
    });
    numEl.addEventListener('change', () => {
      const v = parseFloat(numEl.value);
      if (!Number.isNaN(v)) {
        engine.setParam(key, v);
      }
    });
    resetBtn.addEventListener('click', () => {
      engine.resetParam(key);
    });
  };

  bindContinuousParam('gridSizeX');
  bindContinuousParam('gridSizeY');
  bindContinuousParam('subdivMultiplier');
  bindContinuousParam('apexX');
  bindContinuousParam('apexY');
  bindContinuousParam('noiseScale');
  bindContinuousParam('noiseDetail');
  bindContinuousParam('noiseContrast');
  bindContinuousParam('animSpeed');
  bindContinuousParam('contrast');
  bindContinuousParam('offset');
  bindContinuousParam('numImages');
  bindContinuousParam('satMin');
  bindContinuousParam('satMax');
  bindContinuousParam('maskInfluence');
  bindContinuousParam('maskMin');
  bindContinuousParam('maskMax');

  // Wire Rotation Mode (0, 1, 2) + Reset
  for (const mode of [0, 1, 2] as const) {
    q<HTMLButtonElement>(`param-rotationMode-${mode}`).addEventListener(
      'click',
      () => {
        engine.setParam('rotationMode', mode);
      }
    );
  }
  q<HTMLButtonElement>('reset-rotationMode-btn').addEventListener(
    'click',
    () => {
      engine.resetParam('rotationMode');
    }
  );

  // Wire Boolean Toggle parameters
  const bindToggleParam = (key: keyof ShaderParams) => {
    const btn = q<HTMLButtonElement>(`param-${key}-toggle`);
    const rst = q<HTMLButtonElement>(`reset-${key}-btn`);
    btn.addEventListener('click', () => {
      const cur = engine.getState().params[key];
      engine.setParam(key, cur >= 0.5 ? 0 : 1);
    });
    rst.addEventListener('click', () => {
      engine.resetParam(key);
    });
  };

  bindToggleParam('cyclic');
  bindToggleParam('invertControl');
  bindToggleParam('smoothBlend');
  bindToggleParam('invertMask');

  // Wire Group Reset buttons
  q<HTMLButtonElement>('reset-group-grid-btn').addEventListener('click', () => {
    engine.resetGroup('grid');
  });
  q<HTMLButtonElement>('reset-group-rotation-btn').addEventListener(
    'click',
    () => {
      engine.resetGroup('rotation');
    }
  );
  q<HTMLButtonElement>('reset-group-noise-btn').addEventListener(
    'click',
    () => {
      engine.resetGroup('noise');
    }
  );
  q<HTMLButtonElement>('reset-group-control-btn').addEventListener(
    'click',
    () => {
      engine.resetGroup('control');
    }
  );
  q<HTMLButtonElement>('reset-group-shader-btn').addEventListener(
    'click',
    () => {
      engine.resetGroup('shader');
    }
  );
  q<HTMLButtonElement>('reset-group-saturation-btn').addEventListener(
    'click',
    () => {
      engine.resetGroup('saturation');
    }
  );
  q<HTMLButtonElement>('reset-group-mask-btn').addEventListener('click', () => {
    engine.resetGroup('mask');
  });

  let lastWorkingWidth = 0;
  let lastWorkingHeight = 0;
  let lastStackSignature = '';
  let lastControlThumbSig = '';
  let lastIndexMapThumbSig = '';
  let lastSatMapThumbSig = '';
  let lastMaskThumbSig = '';
  let lastErrorsSig = '';
  let dragSourceIndex: number | null = null;

  const syncSlotPreview = (
    box: HTMLDivElement,
    source: AppState['controlSource'],
    thumbTestId: string,
    defaultEmptyLabel: string
  ) => {
    if (source.mode === 'none' || !source.thumbnailUrl) {
      box.classList.remove('is-loaded');
      box.innerHTML = `
        <div class="ts-empty-glyph">${MEDIA_GLYPH_SVG}</div>
        <span class="ts-empty-label">${defaultEmptyLabel}</span>
      `;
    } else {
      box.classList.add('is-loaded');
      const existingImg = box.querySelector(
        `[data-testid="${thumbTestId}"]`
      ) as HTMLImageElement | null;
      const existingBadge = box.querySelector(
        '.ts-preview-badge'
      ) as HTMLSpanElement | null;
      if (existingImg && existingBadge) {
        existingImg.src = source.thumbnailUrl;
        existingImg.alt = source.name;
        existingBadge.textContent = source.name;
      } else {
        box.innerHTML = `
          <img src="${source.thumbnailUrl}" alt="${source.name}" data-testid="${thumbTestId}" />
          <span class="ts-preview-badge">${source.name}</span>
        `;
      }
    }
  };

  const updateUI = (state: AppState) => {
    // 1. Resolution (only overwrite input .value when resolution changed in state or when input is not focused)
    q<HTMLSpanElement>('resolution-label').textContent =
      `${state.workingWidth} X ${state.workingHeight} PX`;
    const resChanged =
      state.workingWidth !== lastWorkingWidth ||
      state.workingHeight !== lastWorkingHeight;
    lastWorkingWidth = state.workingWidth;
    lastWorkingHeight = state.workingHeight;

    if (resChanged || document.activeElement !== resWInput) {
      resWInput.value = String(state.workingWidth);
    }
    if (resChanged || document.activeElement !== resHInput) {
      resHInput.value = String(state.workingHeight);
    }

    // 2. Control, Index Map, Saturation Map & Mask source button active states & thumbnails
    const setActiveBtn = (testId: string, active: boolean) => {
      q<HTMLButtonElement>(testId).classList.toggle('is-primary', active);
    };
    const syncSlotButtons = (
      prefix: MediaSlotTarget,
      mode: AppState['controlSource']['mode']
    ) => {
      setActiveBtn(`${prefix}-source-webcam`, mode === 'webcam');
      setActiveBtn(`${prefix}-source-video`, mode === 'video');
      setActiveBtn(`${prefix}-source-image`, mode === 'image');
      setActiveBtn(`${prefix}-source-noise`, mode === 'noise');
    };

    syncSlotButtons('control', state.controlSource.mode);
    syncSlotButtons('indexMap', state.indexMapSource.mode);
    syncSlotButtons('satMap', state.satMapSource.mode);
    syncSlotButtons('mask', state.maskSource.mode);

    const ctrlSig = `${state.controlSource.mode}:${state.controlSource.name}:${state.controlSource.thumbnailUrl}`;
    if (ctrlSig !== lastControlThumbSig) {
      lastControlThumbSig = ctrlSig;
      syncSlotPreview(
        q<HTMLDivElement>('control-thumbnail-box'),
        state.controlSource,
        'control-thumbnail',
        'add image'
      );
    }

    const idxSig = `${state.indexMapSource.mode}:${state.indexMapSource.name}:${state.indexMapSource.thumbnailUrl}`;
    if (idxSig !== lastIndexMapThumbSig) {
      lastIndexMapThumbSig = idxSig;
      syncSlotPreview(
        q<HTMLDivElement>('indexMap-thumbnail-box'),
        state.indexMapSource,
        'indexMap-thumbnail',
        'add image'
      );
    }

    const satSig = `${state.satMapSource.mode}:${state.satMapSource.name}:${state.satMapSource.thumbnailUrl}`;
    if (satSig !== lastSatMapThumbSig) {
      lastSatMapThumbSig = satSig;
      syncSlotPreview(
        q<HTMLDivElement>('satMap-thumbnail-box'),
        state.satMapSource,
        'satMap-thumbnail',
        'add image'
      );
    }

    const maskSig = `${state.maskSource.mode}:${state.maskSource.name}:${state.maskSource.thumbnailUrl}`;
    if (maskSig !== lastMaskThumbSig) {
      lastMaskThumbSig = maskSig;
      syncSlotPreview(
        q<HTMLDivElement>('mask-thumbnail-box'),
        state.maskSource,
        'mask-thumbnail',
        'add image'
      );
    }

    // 3. Stack list & count
    q<HTMLSpanElement>('stack-count-label').textContent =
      `${state.stack.length} ${state.stack.length === 1 ? 'file' : 'files'}`;

    const stackSig =
      state.stack.map((s) => `${s.id}:${s.name}`).join('|') +
      `#n=${state.params.numImages}`;
    if (stackSig !== lastStackSignature) {
      lastStackSignature = stackSig;
      const stackContainer = q<HTMLDivElement>('stack-list');
      stackContainer.classList.toggle('is-loaded', state.stack.length > 0);

      if (state.stack.length === 0) {
        stackContainer.innerHTML = `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:24px 0; text-align:center;">
            <div class="ts-empty-glyph">${MEDIA_GLYPH_SVG}</div>
            <span class="ts-empty-label" data-testid="stack-empty-state">no stack images loaded</span>
          </div>
        `;
      } else {
        const grid = document.createElement('div');
        grid.className = 'ts-stack-grid';

        state.stack.forEach((item, index) => {
          const isActiveLayer = index < state.params.numImages;
          const card = document.createElement('div');
          card.className = `ts-stack-item ${
            isActiveLayer ? 'is-active-layer' : 'is-inactive-layer'
          }`;
          card.draggable = true;
          card.setAttribute('data-testid', `stack-item-${index}`);
          card.setAttribute('data-layer-name', item.name);
          card.title = `#${index + 1} ${item.name}`;

          card.innerHTML = `
            <img src="${item.thumbnailUrl}" alt="${item.name}" />
            <span class="ts-stack-index">#${index + 1}</span>
            <div class="ts-stack-actions">
              <button type="button" class="ts-stack-mini-btn" data-testid="stack-move-up-${index}" title="Move earlier" ${
                index === 0 ? 'disabled' : ''
              }>◀</button>
              <button type="button" class="ts-stack-mini-btn" data-testid="stack-move-down-${index}" title="Move later" ${
                index === state.stack.length - 1 ? 'disabled' : ''
              }>▶</button>
              <button type="button" class="ts-stack-mini-btn is-remove" data-testid="stack-remove-${index}" title="Remove image">✕</button>
            </div>
          `;

          card.addEventListener('dragstart', (e) => {
            dragSourceIndex = index;
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
            }
          });
          card.addEventListener('dragover', (e) => {
            e.preventDefault();
            card.classList.add('is-drag-over');
          });
          card.addEventListener('dragleave', () => {
            card.classList.remove('is-drag-over');
          });
          card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('is-drag-over');
            const from =
              dragSourceIndex ??
              parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
            dragSourceIndex = null;
            if (from >= 0 && from !== index) {
              engine.reorderStackLayer(from, index);
            }
          });

          card
            .querySelector(`[data-testid="stack-move-up-${index}"]`)
            ?.addEventListener('click', (e) => {
              e.stopPropagation();
              engine.reorderStackLayer(index, index - 1);
            });
          card
            .querySelector(`[data-testid="stack-move-down-${index}"]`)
            ?.addEventListener('click', (e) => {
              e.stopPropagation();
              engine.reorderStackLayer(index, index + 1);
            });
          card
            .querySelector(`[data-testid="stack-remove-${index}"]`)
            ?.addEventListener('click', (e) => {
              e.stopPropagation();
              engine.removeStackLayer(index);
            });

          grid.appendChild(card);
        });

        stackContainer.innerHTML = '';
        stackContainer.appendChild(grid);
      }
    }

    // 4. Sync Parameter Values
    const syncSliderAndInput = (
      key: keyof ShaderParams,
      decimals: number,
      maxOverride?: number
    ) => {
      const val = state.params[key];
      const numEl = q<HTMLInputElement>(`param-${key}-input`);
      const sliderEl = q<HTMLInputElement>(`param-${key}-slider`);
      if (maxOverride !== undefined) {
        numEl.max = String(maxOverride);
        sliderEl.max = String(maxOverride);
      }
      const formatted =
        decimals === 0
          ? String(Math.round(val))
          : Number(val.toFixed(decimals)).toString();
      if (document.activeElement !== numEl) {
        numEl.value = formatted;
      }
      if (document.activeElement !== sliderEl) {
        sliderEl.value = String(val);
      }
    };

    const maxLoaded = Math.max(1, state.stack.length);
    syncSliderAndInput('gridSizeX', 0);
    syncSliderAndInput('gridSizeY', 0);
    syncSliderAndInput('subdivMultiplier', 2);
    syncSliderAndInput('apexX', 2);
    syncSliderAndInput('apexY', 2);
    syncSliderAndInput('noiseScale', 2);
    syncSliderAndInput('noiseDetail', 0);
    syncSliderAndInput('noiseContrast', 2);
    syncSliderAndInput('animSpeed', 2);
    syncSliderAndInput('contrast', 2);
    syncSliderAndInput('offset', 3);
    syncSliderAndInput('numImages', 0, maxLoaded);
    syncSliderAndInput('satMin', 2);
    syncSliderAndInput('satMax', 2);
    syncSliderAndInput('maskInfluence', 2);
    syncSliderAndInput('maskMin', 2);
    syncSliderAndInput('maskMax', 2);

    const rotMode = Math.round(state.params.rotationMode);
    setActiveBtn('param-rotationMode-0', rotMode === 0);
    setActiveBtn('param-rotationMode-1', rotMode === 1);
    setActiveBtn('param-rotationMode-2', rotMode === 2);

    setActiveBtn('param-cyclic-toggle', state.params.cyclic >= 0.5);
    setActiveBtn(
      'param-invertControl-toggle',
      state.params.invertControl >= 0.5
    );
    setActiveBtn('param-smoothBlend-toggle', state.params.smoothBlend >= 0.5);
    setActiveBtn('param-invertMask-toggle', state.params.invertMask >= 0.5);

    // 5. Mask Controls Disabled State (Spec D11)
    const maskGroup = q<HTMLElement>('group-mask');
    const maskDisabled = !state.hasMask;
    maskGroup.classList.toggle('is-disabled', maskDisabled);
    const maskInteractiveIds = [
      'param-maskInfluence-input',
      'param-maskInfluence-slider',
      'reset-maskInfluence-btn',
      'param-maskMin-input',
      'param-maskMin-slider',
      'reset-maskMin-btn',
      'param-maskMax-input',
      'param-maskMax-slider',
      'reset-maskMax-btn',
      'param-invertMask-toggle',
      'reset-invertMask-btn',
      'reset-group-mask-btn',
    ];
    for (const id of maskInteractiveIds) {
      q<HTMLInputElement | HTMLButtonElement>(id).disabled = maskDisabled;
    }

    // 6. Playback transports — one per input media (Control, Index Map, Sat Map, Mask — D14)
    const renderTransport = (
      prefix: MediaSlotTarget,
      source: AppState['controlSource'],
      videoLabel: string
    ) => {
      const bar = q<HTMLDivElement>(`${prefix}-progress-bar`);
      const fill = q<HTMLDivElement>(`${prefix}-progress-fill`);
      const btn = q<HTMLButtonElement>(`${prefix}-play-pause-btn`);
      const statusLabel = q<HTMLSpanElement>(`${prefix}-status-label`);
      const timeLabel = q<HTMLDivElement>(`${prefix}-time-label`);
      const timeCur = q<HTMLSpanElement>(`${prefix}-time-current`);
      const timeDur = q<HTMLSpanElement>(`${prefix}-time-duration`);
      const liveLabel = q<HTMLSpanElement>(`${prefix}-live-label`);

      bar.classList.remove('is-static', 'is-live');
      fill.style.width = '0%';

      if (source.mode === 'video') {
        statusLabel.textContent = videoLabel;
        btn.disabled = false;
        btn.textContent = source.playing ? '❚❚' : '▶';
        timeLabel.style.display = 'flex';
        liveLabel.style.display = 'none';
        timeCur.textContent = formatTimeMMSS(source.currentTime);
        timeDur.textContent = formatTimeMMSS(source.duration);
        const pct =
          source.duration > 0
            ? Math.min(100, (source.currentTime / source.duration) * 100)
            : 0;
        fill.style.width = `${pct.toFixed(1)}%`;
      } else if (source.mode === 'webcam') {
        bar.classList.add('is-live');
        statusLabel.textContent = 'Webcam';
        btn.disabled = true;
        btn.textContent = '▶';
        timeLabel.style.display = 'none';
        liveLabel.style.display = 'inline';
      } else {
        bar.classList.add('is-static');
        statusLabel.textContent =
          source.mode === 'image'
            ? 'Image'
            : source.mode === 'noise'
              ? 'Noise'
              : 'None';
        btn.disabled = true;
        btn.textContent = '▶';
        timeLabel.style.display = 'none';
        liveLabel.style.display = 'none';
      }
    };

    renderTransport('control', state.controlSource, 'Video Input');
    renderTransport('indexMap', state.indexMapSource, 'Video Index');
    renderTransport('satMap', state.satMapSource, 'Video Sat');
    renderTransport('mask', state.maskSource, 'Video Mask');

    q<HTMLButtonElement>('video-sync-btn').disabled = !(
      state.controlSource.mode === 'video' ||
      state.indexMapSource.mode === 'video' ||
      state.satMapSource.mode === 'video' ||
      state.maskSource.mode === 'video'
    );

    // 7. Stats Overlay (§8.2)
    const statsEl = q<HTMLDivElement>('stats-overlay');
    statsEl.style.display = state.statsVisible ? 'block' : 'none';
    if (state.statsVisible) {
      statsEl.innerHTML = `
        <div><strong>FPS:</strong> ${state.fps}</div>
        <div><strong>FRAME:</strong> ${state.frameTimeMs} ms</div>
        <div><strong>GRID:</strong> ${Math.round(state.params.gridSizeX)}×${Math.round(state.params.gridSizeY)} (×${state.params.subdivMultiplier})</div>
        <div><strong>LAYERS:</strong> ${state.params.numImages} / ${state.stack.length}</div>
        <div><strong>RES:</strong> ${state.workingWidth}×${state.workingHeight}</div>
      `;
    }

    // 8. Error Toasts (Spec D9)
    const errSig = state.errors.map((e) => e.id).join('|');
    if (errSig !== lastErrorsSig) {
      lastErrorsSig = errSig;
      const errContainer = q<HTMLDivElement>('error-container');
      errContainer.innerHTML = '';
      for (const err of state.errors) {
        const toast = document.createElement('div');
        toast.className = 'toast is-danger';
        toast.setAttribute('data-testid', 'error-toast');
        toast.innerHTML = `
          <div style="flex:1;">
            <div class="toast-title">Error</div>
            <div class="toast-message" data-testid="error-message">${err.message}</div>
          </div>
          <button type="button" class="toast-close" data-testid="error-dismiss-btn" title="Dismiss">✕</button>
        `;
        toast
          .querySelector('[data-testid="error-dismiss-btn"]')
          ?.addEventListener('click', () => {
            engine.dismissError(err.id);
          });
        errContainer.appendChild(toast);
      }
    }
  };

  engine.subscribe(updateUI);
}

export { mountTextureMosaicUI as mountTextureStackUI };
