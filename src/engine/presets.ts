import {
  RawTextureInput,
  SerializedSlotMedia,
  SerializedStackLayer,
  TextureMosaicPresetV1,
} from './types';

export const PRESET_VERSION = 1;

/* ---------------------------------------------------------------------------
 * Repository preset discovery (Vite import.meta.glob)
 *
 * Every `.json` file inside the repository `presets/` folder is automatically
 * indexed at dev/build time (no manual manifest). The JSON payload itself is
 * fetched lazily via its `?url` only when the preset is selected, so large
 * Base64-embedded media does not slow down the initial page load.
 * ------------------------------------------------------------------------- */

const repoPresetUrls = import.meta.glob('../../presets/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface RepoPresetEntry {
  /** Stable id derived from the file path (e.g. `demo-mosaic`). */
  id: string;
  /** Display name (file name without extension). */
  name: string;
  /** Servable URL of the raw JSON asset. */
  url: string;
}

export function listRepoPresets(): RepoPresetEntry[] {
  return Object.entries(repoPresetUrls)
    .map(([path, url]) => {
      const file = path.split('/').pop() ?? path;
      const id = file.replace(/\.json$/i, '');
      return { id, name: id, url };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchPresetJson(url: string): Promise<unknown> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch preset file (${resp.status}).`);
  }
  return resp.json();
}

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

const VALID_MODES = ['none', 'image', 'video', 'webcam', 'noise'];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateSlotMedia(slot: unknown, label: string): SerializedSlotMedia {
  if (typeof slot !== 'object' || slot === null) {
    throw new Error(`Preset slot "${label}" is missing or invalid.`);
  }
  const s = slot as Record<string, unknown>;
  if (typeof s.mode !== 'string' || !VALID_MODES.includes(s.mode)) {
    throw new Error(`Preset slot "${label}" has an invalid mode.`);
  }
  if (
    (s.mode === 'image' || s.mode === 'video' || s.mode === 'webcam') &&
    typeof s.dataUrl !== 'string'
  ) {
    throw new Error(
      `Preset slot "${label}" (${s.mode}) is missing its embedded media data.`
    );
  }
  return s as unknown as SerializedSlotMedia;
}

/**
 * Validate a parsed JSON value as a `TextureMosaicPresetV1`.
 * Throws `Error` with a human-readable message when invalid.
 */
export function validatePreset(json: unknown): TextureMosaicPresetV1 {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Preset file is not a valid JSON object.');
  }
  const p = json as Record<string, unknown>;
  if (p.app !== 'TextureMosaic') {
    throw new Error('This JSON file is not a TextureMosaic preset.');
  }
  if (p.version !== PRESET_VERSION) {
    throw new Error(
      `Unsupported preset version "${String(p.version)}" (expected ${PRESET_VERSION}).`
    );
  }
  if (
    !isFiniteNumber(p.workingWidth) ||
    !isFiniteNumber(p.workingHeight) ||
    p.workingWidth < 1 ||
    p.workingHeight < 1 ||
    p.workingWidth > 4096 ||
    p.workingHeight > 4096
  ) {
    throw new Error('Preset has an invalid canvas size.');
  }
  if (typeof p.params !== 'object' || p.params === null) {
    throw new Error('Preset is missing its shader parameters.');
  }
  if (typeof p.slots !== 'object' || p.slots === null) {
    throw new Error('Preset is missing its input media slots.');
  }
  const slots = p.slots as Record<string, unknown>;
  validateSlotMedia(slots.control, 'control');
  validateSlotMedia(slots.indexMap, 'indexMap');
  validateSlotMedia(slots.satMap, 'satMap');
  validateSlotMedia(slots.mask, 'mask');
  if (!Array.isArray(p.stack)) {
    throw new Error('Preset is missing its texture stack.');
  }
  for (let i = 0; i < p.stack.length; i++) {
    const layer = p.stack[i] as Record<string, unknown>;
    if (
      typeof layer !== 'object' ||
      layer === null ||
      typeof layer.dataUrl !== 'string'
    ) {
      throw new Error(`Preset stack layer #${i + 1} is missing image data.`);
    }
  }
  return p as unknown as TextureMosaicPresetV1;
}

/* ---------------------------------------------------------------------------
 * Media (de)serialization helpers
 * ------------------------------------------------------------------------- */

/** Draw an image/canvas/video element to an offscreen canvas and encode as PNG data URL. */
export function elementToPngDataUrl(
  el: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  width: number,
  height: number
): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for preset export.');
  ctx.drawImage(el, 0, 0, w, h);
  return c.toDataURL('image/png');
}

/** Encode a raw RGBA8 pixel buffer as a PNG data URL. */
export function rawTextureToPngDataUrl(tex: RawTextureInput): string {
  const c = document.createElement('canvas');
  c.width = tex.width;
  c.height = tex.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for preset export.');
  const imgData = ctx.createImageData(tex.width, tex.height);
  imgData.data.set(tex.data);
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL('image/png');
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read media blob.'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URL in preset.');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mimeMatch = /^data:([^;,]+)/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode embedded image.'));
    img.src = dataUrl;
  });
}

export type { SerializedSlotMedia, SerializedStackLayer, TextureMosaicPresetV1 };
