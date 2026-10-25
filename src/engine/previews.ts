import { MediaSlotTarget, RawTextureInput, ShaderParams } from './types';

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function fract(v: number): number {
  return v - Math.floor(v);
}

/**
 * Evaluate the grayscale level-driving signal (0..255) for a Control input pixel (r, g, b in 0..1).
 * Matches Step 2 of `texture_mosaic_web.frag` (invert -> contrast -> Rec.709 luma -> offset clamp/wrap).
 */
export function evaluateControlPreviewByte(
  r01: number,
  g01: number,
  b01: number,
  params: Pick<
    ShaderParams,
    'invertControl' | 'contrast' | 'offset' | 'cyclic'
  >
): number {
  const inv = params.invertControl >= 0.5;
  const cr = inv ? 1.0 - r01 : r01;
  const cg = inv ? 1.0 - g01 : g01;
  const cb = inv ? 1.0 - b01 : b01;

  const contR = clamp((cr - 0.5) * params.contrast + 0.5, 0.0, 1.0);
  const contG = clamp((cg - 0.5) * params.contrast + 0.5, 0.0, 1.0);
  const contB = clamp((cb - 0.5) * params.contrast + 0.5, 0.0, 1.0);
  const lum = contR * LUMA_R + contG * LUMA_G + contB * LUMA_B;

  const signal =
    params.cyclic >= 0.5
      ? fract(lum + params.offset)
      : clamp(lum + params.offset, 0.0, 1.0);
  return clamp(Math.round(signal * 255), 0, 255);
}

/**
 * Evaluate the normalized grayscale saturation multiplier preview (0..255) for a Saturation Map pixel.
 * Maps `mix(satMin, satMax, r01)` in [0..5] to [0..255] so 0 = black (grayscale) and 5 = white (max saturation).
 */
export function evaluateSatMapPreviewByte(
  r01: number,
  params: Pick<ShaderParams, 'satMin' | 'satMax'>
): number {
  const maskVal = clamp(r01, 0.0, 1.0);
  const satAmount = params.satMin + (params.satMax - params.satMin) * maskVal;
  const norm = clamp(satAmount / 5.0, 0.0, 1.0);
  return clamp(Math.round(norm * 255), 0, 255);
}

/**
 * Evaluate the effective mask factor `m` (0..255) for a Mask input pixel (r, g, b in 0..1).
 * Matches Step 6 of `texture_mosaic_web.frag` (luma -> min/max remap -> invert -> influence mix).
 */
export function evaluateMaskPreviewByte(
  r01: number,
  g01: number,
  b01: number,
  params: Pick<
    ShaderParams,
    'maskMin' | 'maskMax' | 'invertMask' | 'maskInfluence'
  >
): number {
  const mRaw = r01 * LUMA_R + g01 * LUMA_G + b01 * LUMA_B;
  const lo = Math.min(params.maskMin, params.maskMax);
  const hi = Math.max(params.maskMin, params.maskMax);
  let mask = clamp((mRaw - lo) / Math.max(hi - lo, 1e-5), 0.0, 1.0);
  if (params.invertMask >= 0.5) {
    mask = 1.0 - mask;
  }
  const m = 1.0 + (mask - 1.0) * clamp(params.maskInfluence, 0.0, 1.0);
  return clamp(Math.round(m * 255), 0, 255);
}

/**
 * Transform an RGBA8 buffer in-place or into a new Uint8ClampedArray to show the real-time
 * processed preview for the given slot (`control`, `indexMap`, `satMap`, `mask`).
 */
export function processSlotPreviewRGBA(
  target: MediaSlotTarget,
  srcRgba: Uint8Array | Uint8ClampedArray,
  params: ShaderParams
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcRgba.length);
  if (target === 'indexMap') {
    for (let i = 0; i < srcRgba.length; i += 4) {
      out[i] = srcRgba[i];
      out[i + 1] = srcRgba[i + 1];
      out[i + 2] = srcRgba[i + 2];
      out[i + 3] = 255;
    }
    return out;
  }

  for (let i = 0; i < srcRgba.length; i += 4) {
    const r01 = srcRgba[i] / 255;
    const g01 = srcRgba[i + 1] / 255;
    const b01 = srcRgba[i + 2] / 255;
    let v = 0;
    if (target === 'control') {
      v = evaluateControlPreviewByte(r01, g01, b01, params);
    } else if (target === 'satMap') {
      v = evaluateSatMapPreviewByte(r01, params);
    } else {
      v = evaluateMaskPreviewByte(r01, g01, b01, params);
    }
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Cover-crop a RawTextureInput or DOM drawable element into a square `size x size` RGBA8 buffer,
 * apply the slot's real-time parameter processing, and return a PNG data URL.
 */
export class SlotPreviewRenderer {
  private readonly size: number;
  private readonly rawCanvas: HTMLCanvasElement;
  private readonly rawCtx: CanvasRenderingContext2D;
  private readonly srcCanvas: HTMLCanvasElement;
  private readonly srcCtx: CanvasRenderingContext2D;

  constructor(size: number = 96) {
    this.size = size;
    this.rawCanvas = document.createElement('canvas');
    this.rawCanvas.width = size;
    this.rawCanvas.height = size;
    const rctx = this.rawCanvas.getContext('2d', { willReadFrequently: true });
    if (!rctx) throw new Error('Failed to create preview 2D context');
    this.rawCtx = rctx;

    this.srcCanvas = document.createElement('canvas');
    const sctx = this.srcCanvas.getContext('2d');
    if (!sctx) throw new Error('Failed to create source preview 2D context');
    this.srcCtx = sctx;
  }

  public captureBaseSquareRGBAFromElement(
    el: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    srcW: number,
    srcH: number
  ): Uint8ClampedArray {
    const size = this.size;
    const ctx = this.rawCtx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    if (srcW > 0 && srcH > 0) {
      const scale = Math.max(size / srcW, size / srcH);
      const dw = srcW * scale;
      const dh = srcH * scale;
      ctx.drawImage(el, (size - dw) / 2, (size - dh) / 2, dw, dh);
    }
    return new Uint8ClampedArray(ctx.getImageData(0, 0, size, size).data);
  }

  public captureBaseSquareRGBAFromRaw(
    tex: RawTextureInput
  ): Uint8ClampedArray {
    if (tex.width <= 0 || tex.height <= 0) {
      return new Uint8ClampedArray(this.size * this.size * 4);
    }
    this.srcCanvas.width = tex.width;
    this.srcCanvas.height = tex.height;
    const imgData = this.srcCtx.createImageData(tex.width, tex.height);
    imgData.data.set(tex.data);
    this.srcCtx.putImageData(imgData, 0, 0);
    return this.captureBaseSquareRGBAFromElement(
      this.srcCanvas,
      tex.width,
      tex.height
    );
  }

  public processedRGBAToDataUrl(
    target: MediaSlotTarget,
    baseSquareRgba: Uint8ClampedArray,
    params: ShaderParams
  ): string {
    const processed = processSlotPreviewRGBA(target, baseSquareRgba, params);
    const imgData = this.rawCtx.createImageData(this.size, this.size);
    imgData.data.set(processed);
    this.rawCtx.putImageData(imgData, 0, 0);
    return this.rawCanvas.toDataURL('image/png');
  }
}
