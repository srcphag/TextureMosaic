import { decodeIndexValue, generateIndexMapsForSeed } from './index-maps';
import { IndexMapsQuad, RawTextureInput, ShaderParams } from './types';

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Sample an RGBA8 texture using nearest-neighbor at normalized UV in [0, 1] with CLAMP_TO_EDGE.
 * Returns [r, g, b, a] normalized in [0, 1].
 */
export function sampleNearestRGBA(
  tex: RawTextureInput,
  u: number,
  v: number
): [number, number, number, number] {
  const uc = clamp(u, 0, 1);
  const vc = clamp(v, 0, 1);
  const x = clamp(Math.floor(uc * tex.width), 0, tex.width - 1);
  const y = clamp(Math.floor(vc * tex.height), 0, tex.height - 1);
  const idx = (y * tex.width + x) * 4;
  return [
    tex.data[idx] / 255,
    tex.data[idx + 1] / 255,
    tex.data[idx + 2] / 255,
    tex.data[idx + 3] / 255,
  ];
}

/**
 * Sample an RGBA8 texture using bilinear filtering (`gl.LINEAR`) with `CLAMP_TO_EDGE`
 * at normalized UV. Matches WebGL2 `TEXTURE_2D_ARRAY` linear sampling for stack layers (§4).
 */
export function sampleLinearRGBA(
  tex: RawTextureInput,
  u: number,
  v: number
): [number, number, number, number] {
  const W = tex.width;
  const H = tex.height;
  if (W <= 1 && H <= 1) {
    return [
      tex.data[0] / 255,
      tex.data[1] / 255,
      tex.data[2] / 255,
      tex.data[3] / 255,
    ];
  }
  const tx = u * W - 0.5;
  const ty = v * H - 0.5;

  const ix0 = Math.floor(tx);
  const iy0 = Math.floor(ty);
  const fx = tx - ix0;
  const fy = ty - iy0;

  const x0 = clamp(ix0, 0, W - 1);
  const x1 = clamp(ix0 + 1, 0, W - 1);
  const y0 = clamp(iy0, 0, H - 1);
  const y1 = clamp(iy0 + 1, 0, H - 1);

  const i00 = (y0 * W + x0) * 4;
  const i10 = (y0 * W + x1) * 4;
  const i01 = (y1 * W + x0) * 4;
  const i11 = (y1 * W + x1) * 4;

  const out: [number, number, number, number] = [0, 0, 0, 1];
  for (let c = 0; c < 4; c++) {
    const c00 = tex.data[i00 + c] / 255;
    const c10 = tex.data[i10 + c] / 255;
    const c01 = tex.data[i01 + c] / 255;
    const c11 = tex.data[i11 + c] / 255;
    const top = mix(c00, c10, fx);
    const bot = mix(c01, c11, fx);
    out[c] = mix(top, bot, fy);
  }
  return out;
}

/**
 * Flatten an RGBA8 buffer over solid black (#000000) so alpha is always 255 (Spec D13).
 */
export function flattenOverBlackRGBA(
  rgba: Uint8Array | Uint8ClampedArray
): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    out[i] = Math.round(rgba[i] * a);
    out[i + 1] = Math.round(rgba[i + 1] * a);
    out[i + 2] = Math.round(rgba[i + 2] * a);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Plain-code CPU reference implementation of the §4 Texture Mosaic Shader Contract.
 * Evaluates a single pixel at normalized (u, v) in [0, 1] and returns [R, G, B, A] in 0..255.
 */
export function evaluateShaderPixelCPU(
  u: number,
  v: number,
  controlTex: RawTextureInput,
  maskTex: RawTextureInput | null,
  stackLayers: RawTextureInput[],
  params: ShaderParams,
  indexMaps?: IndexMapsQuad
): [number, number, number, number] {
  const loadedCount = Math.max(stackLayers.length, 1);
  const n = Math.max(Math.min(Math.floor(params.numImages), loadedCount), 1);

  const gridX = Math.max(1e-4, params.gridSizeX);
  const gridY = Math.max(1e-4, params.gridSizeY);

  // --- 1. Base Tile Calculation ---
  const baseGridU = u * gridX;
  const baseGridV = v * gridY;
  const baseCellX = Math.floor(baseGridU);
  const baseCellY = Math.floor(baseGridV);
  const baseLocalU = fract(baseGridU);
  const baseLocalV = fract(baseGridV);

  // --- 2. Subdivision Level Lookup (control stage) ---
  const controlU = (baseCellX + 0.5) / gridX;
  const controlV = (baseCellY + 0.5) / gridY;
  const [cellR, cellG, cellB] = sampleNearestRGBA(
    controlTex,
    controlU,
    controlV
  );

  const invCtrl = params.invertControl >= 0.5 ? 1 : 0;
  const ctrlR = invCtrl ? 1.0 - cellR : cellR;
  const ctrlG = invCtrl ? 1.0 - cellG : cellG;
  const ctrlB = invCtrl ? 1.0 - cellB : cellB;

  const contR = clamp((ctrlR - 0.5) * params.contrast + 0.5, 0.0, 1.0);
  const contG = clamp((ctrlG - 0.5) * params.contrast + 0.5, 0.0, 1.0);
  const contB = clamp((ctrlB - 0.5) * params.contrast + 0.5, 0.0, 1.0);
  const lum = contR * LUMA_R + contG * LUMA_G + contB * LUMA_B;

  let L: 0 | 1 | 2 | 3;
  if (params.cyclic > 0.5) {
    const s = fract(lum + params.offset) * 4.0;
    L = (((Math.floor(s) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  } else {
    const s = clamp(lum + params.offset, 0.0, 1.0) * 3.0;
    L = clamp(Math.floor(s + 0.5), 0, 3) as 0 | 1 | 2 | 3;
  }

  const factor = Math.pow(params.subdivMultiplier, L);

  // --- 3. Sub-Cell Local & Global Position ---
  const subCellX = Math.floor(baseLocalU * factor);
  const subCellY = Math.floor(baseLocalV * factor);
  const subLocalU = fract(baseLocalU * factor);
  const subLocalV = fract(baseLocalV * factor);
  const levelGridX = gridX * factor;
  const levelGridY = gridY * factor;
  const fineCellX = baseCellX * factor + subCellX;
  const fineCellY = baseCellY * factor + subCellY;
  const fineU = (fineCellX + 0.5) / levelGridX;
  const fineV = (fineCellY + 0.5) / levelGridY;

  // --- 4. Apex Rotation Matrix ---
  let sampleU = subLocalU;
  let sampleV = subLocalV;
  const rotMode = Math.round(params.rotationMode);
  if (rotMode > 0) {
    const dirX = params.apexX - fineU;
    const dirY = params.apexY - fineV;
    let targetUpX = 0.0;
    let targetUpY = 1.0;

    if (rotMode === 1) {
      const dist = Math.hypot(dirX, dirY);
      if (dist > 0.0001) {
        targetUpX = dirX / dist;
        targetUpY = dirY / dist;
      }
    } else if (rotMode === 2) {
      if (Math.abs(dirX) > Math.abs(dirY)) {
        targetUpX = Math.sign(dirX);
        targetUpY = 0.0;
      } else {
        targetUpX = 0.0;
        targetUpY = Math.sign(dirY);
      }
    }

    const targetRightX = targetUpY;
    const targetRightY = -targetUpX;
    const centeredU = subLocalU - 0.5;
    const centeredV = subLocalV - 0.5;
    sampleU = centeredU * targetRightX + centeredV * targetRightY + 0.5;
    sampleV = centeredU * targetUpX + centeredV * targetUpY + 0.5;
  }

  // --- 5. Index Lookup & Sampling ---
  const maps =
    indexMaps ??
    generateIndexMapsForSeed(
      1,
      params.gridSizeX,
      params.gridSizeY,
      params.subdivMultiplier,
      n,
      1.0
    );
  const idxSample = sampleNearestRGBA(maps[L], fineU, fineV);

  const fromIdx = decodeIndexValue(
    idxSample[0],
    n,
    params.indexIsNormalized ?? 1
  );
  const toIdx = decodeIndexValue(
    idxSample[1],
    n,
    params.indexIsNormalized ?? 1
  );
  const t = clamp(idxSample[2], 0.0, 1.0);

  const fetchLayer = (idx: number): [number, number, number] => {
    if (stackLayers.length === 0) return [0, 0, 0];
    const safeIdx = clamp(idx, 0, stackLayers.length - 1);
    const [r, g, b] = sampleLinearRGBA(stackLayers[safeIdx], sampleU, sampleV);
    return [r, g, b];
  };

  const [fromR, fromG, fromB] = fetchLayer(fromIdx);
  const [toR, toG, toB] = fetchLayer(toIdx);

  const mosaicR = params.smoothBlend < 0.5 ? fromR : mix(fromR, toR, t);
  const mosaicG = params.smoothBlend < 0.5 ? fromG : mix(fromG, toG, t);
  const mosaicB = params.smoothBlend < 0.5 ? fromB : mix(fromB, toB, t);

  // --- 6. Mask ---
  let mRaw = 1.0;
  if (maskTex) {
    const [mR, mG, mB] = sampleNearestRGBA(maskTex, u, v);
    mRaw = mR * LUMA_R + mG * LUMA_G + mB * LUMA_B;
  }

  const lo = Math.min(params.maskMin, params.maskMax);
  const hi = Math.max(params.maskMin, params.maskMax);
  let mask = clamp((mRaw - lo) / Math.max(hi - lo, 1e-5), 0.0, 1.0);

  if (params.invertMask >= 0.5) {
    mask = 1.0 - mask;
  }

  const influence = maskTex ? clamp(params.maskInfluence, 0.0, 1.0) : 0.0;
  const m = mix(1.0, mask, influence);

  // --- 7. Original control image (without contrast or offset) mixed with mosaic ---
  const [origR, origG, origB] = sampleNearestRGBA(controlTex, u, v);
  const outR = mix(origR, mosaicR, m);
  const outG = mix(origG, mosaicG, m);
  const outB = mix(origB, mosaicB, m);

  return [
    clamp(Math.round(outR * 255), 0, 255),
    clamp(Math.round(outG * 255), 0, 255),
    clamp(Math.round(outB * 255), 0, 255),
    255,
  ];
}

/**
 * Render an entire image buffer on the CPU using the §4 reference algorithm.
 */
export function renderShaderBufferCPU(
  width: number,
  height: number,
  controlTex: RawTextureInput,
  maskTex: RawTextureInput | null,
  stackLayers: RawTextureInput[],
  params: ShaderParams,
  indexMaps?: IndexMapsQuad
): Uint8Array {
  const maps =
    indexMaps ??
    generateIndexMapsForSeed(
      1,
      params.gridSizeX,
      params.gridSizeY,
      params.subdivMultiplier,
      Math.max(1, Math.min(Math.floor(params.numImages), Math.max(1, stackLayers.length))),
      1.0
    );
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const [r, g, b, a] = evaluateShaderPixelCPU(
        u,
        v,
        controlTex,
        maskTex,
        stackLayers,
        params,
        maps
      );
      const idx = (y * width + x) * 4;
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = a;
    }
  }
  return out;
}
