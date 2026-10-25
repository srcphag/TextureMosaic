import { RawTextureInput } from './types';

/**
 * Deterministic 256-entry permutation table for classic Improved Perlin Noise.
 */
const PERM: Uint8Array = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 0x9e3779b9;
  for (let i = 255; i > 0; i--) {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const j = ((t ^ (t >>> 14)) >>> 0) % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
  }
  return perm;
})();

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad2D(hash: number, x: number, y: number): number {
  switch (hash & 7) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}

/**
 * Evaluate 2D Perlin noise at (x, y), returning a value in approximately [-1, 1].
 */
export function perlin2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];

  const x1 = lerp(grad2D(aa, xf, yf), grad2D(ba, xf - 1, yf), u);
  const x2 = lerp(grad2D(ab, xf, yf - 1), grad2D(bb, xf - 1, yf - 1), u);

  return lerp(x1, x2, v);
}

/**
 * Evaluate multi-octave fBm Perlin noise at normalized UV in [0, 1] with
 * scale (base frequency), detail (octaves 1..8), and contrast (0..4 around 0.5).
 * Returns normalized grayscale value in [0, 1].
 */
export function evaluatePerlinPixel(
  u: number,
  v: number,
  scale: number,
  detail: number,
  contrast: number
): number {
  const octaves = Math.max(1, Math.min(8, Math.round(detail)));
  const baseFreq = Math.max(0.5, Math.min(32, scale));
  const cont = Math.max(0, Math.min(4, contrast));

  let total = 0;
  let amplitude = 1;
  let maxAmplitude = 0;
  let freq = baseFreq;

  for (let o = 0; o < octaves; o++) {
    // Offset each octave slightly so octave origins don't align at (0,0)
    const nx = u * freq + o * 17.31;
    const ny = v * freq + o * 31.17;
    total += perlin2D(nx, ny) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= 0.5;
    freq *= 2.0;
  }

  // Normalize from [-1, 1] to [0, 1]
  const normalized = Math.max(
    0,
    Math.min(1, (total / Math.max(1e-5, maxAmplitude)) * 0.65 + 0.5)
  );
  // Apply contrast around 0.5
  return Math.max(0, Math.min(1, (normalized - 0.5) * cont + 0.5));
}

/**
 * Generate a deterministic RGBA8 Perlin noise texture controlled by scale, detail, and contrast.
 */
export function generatePerlinNoiseTexture(
  width: number,
  height: number,
  scale: number,
  detail: number,
  contrast: number
): RawTextureInput {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const data = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const val = evaluatePerlinPixel(u, v, scale, detail, contrast);
      const byte = Math.round(val * 255);
      const idx = (y * w + x) * 4;
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }

  return { width: w, height: h, data };
}
