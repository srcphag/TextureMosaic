import { RawTextureInput } from './types';

/**
 * Create a solid color RGBA8 texture.
 */
export function makeSolidTexture(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number = 255
): RawTextureInput {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width, height, data };
}

/**
 * Create a horizontal luminance ramp (x=0 -> 0, x=width-1 -> 255).
 */
export function makeHorizontalRampTexture(
  width: number,
  height: number
): RawTextureInput {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = width > 1 ? Math.round((x / (width - 1)) * 255) : 0;
      const idx = (y * width + x) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

/**
 * Create a radial/wave gradient control map for default/demo display.
 */
export function makeDemoControlTexture(
  width: number,
  height: number
): RawTextureInput {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / Math.max(1, width - 1);
      const dx = u - 0.5;
      const dy = v - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy) * 1.4;
      const wave = 0.5 + 0.5 * Math.sin((u * 2.0 + v * 1.5) * Math.PI * 2);
      const val = Math.max(0, Math.min(1, 0.6 * (1 - dist) + 0.4 * wave));
      const c = Math.round(val * 255);
      const idx = (y * width + x) * 4;
      data[idx] = c;
      data[idx + 1] = c;
      data[idx + 2] = c;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

/**
 * Create a default deterministic RGB index map texture (R=from, G=to, B=t)
 * for the `index map input` slot on startup.
 */
export function makeDemoIndexMapTexture(
  width: number = 128,
  height: number = 128
): RawTextureInput {
  const data = new Uint8Array(width * height * 4);
  let state = 0x12345678;
  const nextRand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.floor(nextRand() * 256);
    const g = (r + 64 + Math.floor(nextRand() * 160)) % 256;
    const b = 180 + Math.floor(nextRand() * 76); // High crossfade t so both smoothBlend=1 and =0 differ clearly
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/**
 * Create a set of distinct colored/patterned stack layers for initial/demo state.
 * Includes a directional top-pointer accent so per-cell apex rotation is visually clear.
 */
export function makeDistinctStackLayers(
  count: number,
  width: number,
  height: number
): { tex: RawTextureInput; name: string }[] {
  const palette: [number, number, number][] = [
    [20, 45, 95],
    [40, 125, 195],
    [80, 210, 230],
    [90, 230, 150],
    [240, 215, 90],
    [245, 130, 70],
    [220, 60, 95],
    [150, 75, 205],
  ];
  const out: { tex: RawTextureInput; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const [r, g, b] = palette[i % palette.length];
    const mod = Math.floor(i / palette.length) * 17;
    const baseR = (r + mod) % 256;
    const baseG = (g + mod * 2) % 256;
    const baseB = (b + mod * 3) % 256;

    const accentR = Math.min(255, baseR + 55);
    const accentG = Math.min(255, baseG + 55);
    const accentB = Math.min(255, baseB + 55);

    const darkR = Math.max(0, baseR - 35);
    const darkG = Math.max(0, baseG - 35);
    const darkB = Math.max(0, baseB - 35);

    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const v = (y + 0.5) / height;
      for (let x = 0; x < width; x++) {
        const u = (x + 0.5) / width;
        const border = u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94;
        // Upward-pointing chevron/triangle in upper half so +Y orientation is visible
        const inChevron =
          v >= 0.16 &&
          v <= 0.65 &&
          Math.abs(u - 0.5) <= (v - 0.14) * 0.55 &&
          Math.abs(u - 0.5) >= (v - 0.28) * 0.55;

        const idx = (y * width + x) * 4;
        if (border) {
          data[idx] = darkR;
          data[idx + 1] = darkG;
          data[idx + 2] = darkB;
        } else if (inChevron) {
          data[idx] = accentR;
          data[idx + 1] = accentG;
          data[idx + 2] = accentB;
        } else {
          data[idx] = baseR;
          data[idx + 1] = baseG;
          data[idx + 2] = baseB;
        }
        data[idx + 3] = 255;
      }
    }
    out.push({
      tex: { width, height, data },
      name: `layer_${String(i + 1).padStart(2, '0')}.png`,
    });
  }
  return out;
}

/**
 * Convert a RawTextureInput into a square PNG thumbnail data URL for UI previews.
 * Cover-crops to keep proportions (crops overflow, like stack layers, D4).
 */
export function rawTextureToThumbnailUrl(
  tex: RawTextureInput,
  maxThumbSize: number = 96
): string {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = tex.width;
  srcCanvas.height = tex.height;
  const sctx = srcCanvas.getContext('2d');
  if (!sctx) return '';
  const imgData = sctx.createImageData(tex.width, tex.height);
  imgData.data.set(tex.data);
  sctx.putImageData(imgData, 0, 0);

  const size = maxThumbSize;
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = size;
  dstCanvas.height = size;
  const dctx = dstCanvas.getContext('2d');
  if (!dctx) return '';
  dctx.fillStyle = '#000000';
  dctx.fillRect(0, 0, size, size);
  if (tex.width > 0 && tex.height > 0) {
    const scale = Math.max(size / tex.width, size / tex.height);
    const dw = tex.width * scale;
    const dh = tex.height * scale;
    dctx.drawImage(srcCanvas, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }
  return dstCanvas.toDataURL('image/png');
}
