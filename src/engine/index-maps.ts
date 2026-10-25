import { IndexMapsQuad, RawTextureInput } from './types';

export const MAX_INDEX_MAP_DIM = 1024;

/**
 * Deterministic 32-bit PRNG (Mulberry32) returning uniform floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compute the fine-grid resolution for subdivision level L (0..3):
 * fineGrid = gridSize * (subdivMultiplier ^ L), capped at MAX_INDEX_MAP_DIM (§3 "Index maps").
 */
export function computeIndexMapSize(
  gridSizeX: number,
  gridSizeY: number,
  subdivMultiplier: number,
  level: 0 | 1 | 2 | 3
): { width: number; height: number } {
  const factor = Math.pow(Math.max(1, subdivMultiplier), level);
  const width = Math.min(
    MAX_INDEX_MAP_DIM,
    Math.max(1, Math.round(Math.max(1, gridSizeX) * factor))
  );
  const height = Math.min(
    MAX_INDEX_MAP_DIM,
    Math.max(1, Math.round(Math.max(1, gridSizeY) * factor))
  );
  return { width, height };
}

/**
 * Encode an integer layer index `0 .. n-1` into a normalized byte `0 .. 255`
 * matching `uIndexIsNormalized = 1.0` in `texture_mosaic_web.frag`.
 */
export function encodeNormalizedLayerByte(
  layerIdx: number,
  numImages: number
): number {
  const n = Math.max(1, Math.floor(numImages));
  if (n <= 1) return 0;
  const clamped = Math.max(0, Math.min(n - 1, Math.round(layerIdx)));
  return Math.round((clamped / (n - 1)) * 255);
}

/**
 * Decode a normalized [0..1] channel value into an integer layer index `0 .. n-1`,
 * matching `decodeIndex()` in `texture_mosaic_web.frag`.
 */
export function decodeIndexValue(
  raw01: number,
  numImages: number,
  indexIsNormalized: number = 1
): number {
  const n = Math.max(1, Math.floor(numImages));
  const norm = indexIsNormalized >= 0.5 ? 1 : 0;
  const scaled = raw01 + (raw01 * (n - 1) - raw01) * norm;
  const idx = Math.floor(scaled + 0.5);
  return Math.max(0, Math.min(n - 1, idx));
}

/**
 * Generate a single level's deterministic RGBA8 index map for a given seed.
 * R = normalized `fromIdx`, G = normalized `toIdx`, B = crossfade `t` (0..255), A = 255.
 */
export function generateLevelIndexMap(
  seed: number,
  level: 0 | 1 | 2 | 3,
  gridSizeX: number,
  gridSizeY: number,
  subdivMultiplier: number,
  numImages: number,
  t01: number = 1.0
): RawTextureInput {
  const { width, height } = computeIndexMapSize(
    gridSizeX,
    gridSizeY,
    subdivMultiplier,
    level
  );
  const n = Math.max(1, Math.floor(numImages));
  const tByte = Math.round(Math.max(0, Math.min(1, t01)) * 255);
  const levelSeed =
    (Math.imul(seed >>> 0, 2654435761) ^
      Math.imul((level + 1) >>> 0, 2246822519)) >>>
    0;
  const rng = mulberry32(levelSeed);

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const toIdx = Math.floor(rng() * n);
    const fromIdx =
      n <= 1 ? 0 : (toIdx + 1 + Math.floor(rng() * (n - 1))) % n;
    data[i] = encodeNormalizedLayerByte(fromIdx, n);
    data[i + 1] = encodeNormalizedLayerByte(toIdx, n);
    data[i + 2] = tByte;
    data[i + 3] = 255;
  }

  return { width, height, data };
}

/**
 * Generate all 4 subdivision level index maps (L = 0..3) deterministically from `seed`.
 */
export function generateIndexMapsForSeed(
  seed: number,
  gridSizeX: number,
  gridSizeY: number,
  subdivMultiplier: number,
  numImages: number,
  t01: number = 1.0
): IndexMapsQuad {
  return [
    generateLevelIndexMap(
      seed,
      0,
      gridSizeX,
      gridSizeY,
      subdivMultiplier,
      numImages,
      t01
    ),
    generateLevelIndexMap(
      seed,
      1,
      gridSizeX,
      gridSizeY,
      subdivMultiplier,
      numImages,
      t01
    ),
    generateLevelIndexMap(
      seed,
      2,
      gridSizeX,
      gridSizeY,
      subdivMultiplier,
      numImages,
      t01
    ),
    generateLevelIndexMap(
      seed,
      3,
      gridSizeX,
      gridSizeY,
      subdivMultiplier,
      numImages,
      t01
    ),
  ];
}

/**
 * Manages the 4 per-level index maps and their `0 -> 1` crossfade transition (Spec D15 & §3).
 */
export class IndexMapController {
  private maps: IndexMapsQuad;
  private transitionActive = false;
  private transitionElapsed = 0;
  private transitionDuration = 1;
  private transitionProgress = 1;

  constructor(
    seed: number = 1,
    gridSizeX: number = 60,
    gridSizeY: number = 60,
    subdivMultiplier: number = 2,
    numImages: number = 1
  ) {
    this.maps = generateIndexMapsForSeed(
      seed,
      gridSizeX,
      gridSizeY,
      subdivMultiplier,
      numImages,
      1.0
    );
  }

  public getMaps(): IndexMapsQuad {
    return this.maps;
  }

  public setCustomMaps(maps: IndexMapsQuad): void {
    this.maps = [
      {
        width: maps[0].width,
        height: maps[0].height,
        data: new Uint8Array(maps[0].data),
      },
      {
        width: maps[1].width,
        height: maps[1].height,
        data: new Uint8Array(maps[1].data),
      },
      {
        width: maps[2].width,
        height: maps[2].height,
        data: new Uint8Array(maps[2].data),
      },
      {
        width: maps[3].width,
        height: maps[3].height,
        data: new Uint8Array(maps[3].data),
      },
    ];
    this.transitionActive = false;
    this.transitionProgress = 1;
  }

  public isTransitionActive(): boolean {
    return this.transitionActive;
  }

  public getTransitionProgress(): number {
    return this.transitionProgress;
  }

  /**
   * Regenerate maps deterministically without a transition (e.g., on seed, grid size,
   * subdivMultiplier, or numImages change — Spec §3 "Index maps").
   */
  public regenerateImmediate(
    seed: number,
    gridSizeX: number,
    gridSizeY: number,
    subdivMultiplier: number,
    numImages: number
  ): IndexMapsQuad {
    this.transitionActive = false;
    this.transitionElapsed = 0;
    this.transitionProgress = 1;
    this.maps = generateIndexMapsForSeed(
      seed,
      gridSizeX,
      gridSizeY,
      subdivMultiplier,
      numImages,
      1.0
    );
    return this.maps;
  }

  /**
   * Trigger a shuffle transition to `nextSeed` over `transitionSeconds` (Spec D15 & §3).
   * Swaps roles so the old visible selection becomes `from` (R) and the new seed's
   * selection becomes `to` (G), ramping `t` (B) from 0 -> 1 over `transitionSeconds`.
   */
  public startTransitionToSeed(
    nextSeed: number,
    gridSizeX: number,
    gridSizeY: number,
    subdivMultiplier: number,
    numImages: number,
    transitionSeconds: number
  ): IndexMapsQuad {
    const n = Math.max(1, Math.floor(numImages));
    if (transitionSeconds <= 0) {
      return this.regenerateImmediate(
        nextSeed,
        gridSizeX,
        gridSizeY,
        subdivMultiplier,
        numImages
      );
    }

    const nextMaps = generateIndexMapsForSeed(
      nextSeed,
      gridSizeX,
      gridSizeY,
      subdivMultiplier,
      numImages,
      0.0
    );

    for (let lvl = 0 as 0 | 1 | 2 | 3; lvl < 4; lvl = (lvl + 1) as 0 | 1 | 2 | 3) {
      const oldMap = this.maps[lvl];
      const newMap = nextMaps[lvl];
      const len = Math.min(oldMap.data.length, newMap.data.length);
      for (let i = 0; i < len; i += 4) {
        const oldT = oldMap.data[i + 2] / 255;
        // Current dominant selection before shuffle becomes the new `from` (R)
        const prevVisibleByte = oldT >= 0.5 ? oldMap.data[i + 1] : oldMap.data[i];
        let nextToByte = newMap.data[i + 1];
        if (n >= 2 && nextToByte === prevVisibleByte) {
          const prevIdx = decodeIndexValue(prevVisibleByte / 255, n, 1);
          nextToByte = encodeNormalizedLayerByte((prevIdx + 1) % n, n);
        }
        newMap.data[i] = prevVisibleByte;
        newMap.data[i + 1] = nextToByte;
        newMap.data[i + 2] = 0; // Start crossfade at t = 0
        newMap.data[i + 3] = 255;
      }
    }

    this.maps = nextMaps;
    this.transitionActive = true;
    this.transitionElapsed = 0;
    this.transitionDuration = transitionSeconds;
    this.transitionProgress = 0;
    return this.maps;
  }

  /**
   * Advance an active index-map transition by `dtSeconds`.
   * Returns true if the maps were updated.
   */
  public step(dtSeconds: number): boolean {
    if (!this.transitionActive || dtSeconds <= 0) {
      return false;
    }
    this.transitionElapsed += dtSeconds;
    const progress = Math.min(
      1,
      this.transitionElapsed / Math.max(1e-5, this.transitionDuration)
    );
    this.transitionProgress = progress;
    const tByte = Math.round(progress * 255);

    for (let lvl = 0; lvl < 4; lvl++) {
      const data = this.maps[lvl].data;
      for (let i = 2; i < data.length; i += 4) {
        data[i] = tByte;
      }
    }

    if (progress >= 1) {
      this.transitionActive = false;
      this.transitionProgress = 1;
    }
    return true;
  }
}
