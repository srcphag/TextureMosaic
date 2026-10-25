import { describe, expect, it } from 'vitest';
import {
  evaluateShaderPixelCPU,
  flattenOverBlackRGBA,
} from '../../src/engine/reference-cpu';
import { AnimationClock, advanceOffsetLinear } from '../../src/engine/clock';
import {
  IndexMapController,
  computeIndexMapSize,
  decodeIndexValue,
  encodeNormalizedLayerByte,
  generateIndexMapsForSeed,
} from '../../src/engine/index-maps';
import {
  DEFAULT_SHADER_PARAMS,
  IndexMapsQuad,
  RawTextureInput,
  ShaderParams,
} from '../../src/engine/types';
import { makeSolidTexture } from '../../src/engine/fixtures';

function makeParams(overrides: Partial<ShaderParams> = {}): ShaderParams {
  return { ...DEFAULT_SHADER_PARAMS, ...overrides };
}

/**
 * Helper to create a 4-level index map quad where each level L has a constant (fromByte, toByte, tByte)
 * so we can isolate level selection L = 0, 1, 2, 3 or specific index decoding.
 */
function makeConstantLevelIndexMaps(
  levels: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ]
): IndexMapsQuad {
  return levels.map(([r, g, b]) =>
    makeSolidTexture(1, 1, r, g, b, 255)
  ) as IndexMapsQuad;
}

describe('Shader Contract (§4) — CPU Reference Implementation', () => {
  it('1. Grid & Subdivision: cell boundaries land on gridSize divisions and base cells share subdivision level L', () => {
    // 4 layers corresponding to L=0 (R=20), L=1 (R=80), L=2 (R=160), L=3 (R=240)
    const stack: RawTextureInput[] = [
      makeSolidTexture(8, 8, 20, 0, 0),
      makeSolidTexture(8, 8, 80, 0, 0),
      makeSolidTexture(8, 8, 160, 0, 0),
      makeSolidTexture(8, 8, 240, 0, 0),
    ];
    // Level L index map selects layer L (encoded normalized for n=4: 0->0, 1->85, 2->170, 3->255)
    const maps = makeConstantLevelIndexMaps([
      [0, 0, 255],
      [85, 85, 255],
      [170, 170, 255],
      [255, 255, 255],
    ]);

    // Control texture 4x1 where column 0 = L0 (lum 0), col 1 = L1 (lum 0.33), col 2 = L2 (lum 0.67), col 3 = L3 (lum 1.0)
    const ctrlData = new Uint8Array([
      0, 0, 0, 255, 85, 85, 85, 255, 170, 170, 170, 255, 255, 255, 255, 255,
    ]);
    const ctrl: RawTextureInput = { width: 4, height: 1, data: ctrlData };

    const params = makeParams({
      gridSizeX: 4,
      gridSizeY: 4,
      numImages: 4,
      cyclic: 0,
      smoothBlend: 1,
    });

    // Cell 0 covers u in [0, 0.25), Cell 1 in [0.25, 0.5), Cell 2 in [0.5, 0.75), Cell 3 in [0.75, 1.0)
    // Verify boundary precision around u = 0.25, 0.5, 0.75 and that all pixels inside a base cell share its level
    for (const u of [0.01, 0.12, 0.249]) {
      expect(
        evaluateShaderPixelCPU(u, 0.5, ctrl, null, stack, params, maps)[0]
      ).toBe(20);
    }
    for (const u of [0.251, 0.37, 0.499]) {
      expect(
        evaluateShaderPixelCPU(u, 0.5, ctrl, null, stack, params, maps)[0]
      ).toBe(80);
    }
    for (const u of [0.501, 0.62, 0.749]) {
      expect(
        evaluateShaderPixelCPU(u, 0.5, ctrl, null, stack, params, maps)[0]
      ).toBe(160);
    }
    for (const u of [0.751, 0.88, 0.99]) {
      expect(
        evaluateShaderPixelCPU(u, 0.5, ctrl, null, stack, params, maps)[0]
      ).toBe(240);
    }
  });

  it('2. Subdivision: cyclic on wraps L=3 -> L=0, and subdivMultiplier (1.5, 2, 4) scales fine cell count', () => {
    const stack: RawTextureInput[] = [
      makeSolidTexture(4, 4, 10, 0, 0),
      makeSolidTexture(4, 4, 90, 0, 0),
      makeSolidTexture(4, 4, 170, 0, 0),
      makeSolidTexture(4, 4, 250, 0, 0),
    ];
    const maps = makeConstantLevelIndexMaps([
      [0, 0, 255],
      [85, 85, 255],
      [170, 170, 255],
      [255, 255, 255],
    ]);

    // With cyclic = 1: s = fract(lum + offset) * 4.
    // lum = 0.8 -> s = 3.2 -> L = 3 (R=250)
    // lum = 0.8 + offset 0.25 = 1.05 -> fract = 0.05 -> s = 0.2 -> L = 0 (R=10)
    const ctrl = makeSolidTexture(2, 2, 204, 204, 204); // 204/255 = 0.8
    const pxL3 = evaluateShaderPixelCPU(
      0.5,
      0.5,
      ctrl,
      null,
      stack,
      makeParams({ numImages: 4, cyclic: 1, offset: 0 }),
      maps
    );
    const pxWrapL0 = evaluateShaderPixelCPU(
      0.5,
      0.5,
      ctrl,
      null,
      stack,
      makeParams({ numImages: 4, cyclic: 1, offset: 0.25 }),
      maps
    );
    expect(pxL3[0]).toBe(250);
    expect(pxWrapL0[0]).toBe(10);

    // Check subdivMultiplier 1.5, 2, 4 at L=2 (white control -> L=3 or lum=0.67 -> L=2)
    // Create a horizontal strip stack layer: left half Red (200), right half Green (200)
    const halfTexData = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const idx = (y * 16 + x) * 4;
        halfTexData[idx] = x < 8 ? 200 : 0;
        halfTexData[idx + 1] = x < 8 ? 0 : 200;
        halfTexData[idx + 3] = 255;
      }
    }
    const halfLayer: RawTextureInput = {
      width: 16,
      height: 16,
      data: halfTexData,
    };
    const l1Ctrl = makeSolidTexture(1, 1, 85, 85, 85); // L=1
    for (const mult of [1.5, 2, 4]) {
      // With gridSize=1, L=1 -> factor = mult.
      // At u = 0.2 / mult, subLocalU = 0.2 (< 0.5 -> Red).
      // At u = 0.8 / mult, subLocalU = 0.8 (> 0.5 -> Green).
      const p = makeParams({
        gridSizeX: 1,
        gridSizeY: 1,
        subdivMultiplier: mult,
        numImages: 1,
      });
      const leftPx = evaluateShaderPixelCPU(
        0.2 / mult,
        0.5,
        l1Ctrl,
        null,
        [halfLayer],
        p,
        maps
      );
      const rightPx = evaluateShaderPixelCPU(
        0.8 / mult,
        0.5,
        l1Ctrl,
        null,
        [halfLayer],
        p,
        maps
      );
      expect(leftPx[0]).toBe(200);
      expect(rightPx[1]).toBe(200);
    }
  });

  it('3. Rotation: mode 0 identity, mode 1 continuous radial to apex, mode 2 4-face 90deg snap', () => {
    // Stack layer with 4 distinct edges:
    // Top (v < 0.25): Red (255, 0, 0)
    // Bottom (v > 0.75): Blue (0, 0, 255)
    // Left (u < 0.25, 0.25<=v<=0.75): Green (0, 255, 0)
    // Right (u > 0.75, 0.25<=v<=0.75): Yellow (255, 255, 0)
    const W = 32,
      H = 32;
    const dirData = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W;
        const idx = (y * W + x) * 4;
        if (v < 0.25) {
          dirData[idx] = 255; // Top = Red
        } else if (v > 0.75) {
          dirData[idx + 2] = 255; // Bottom = Blue
        } else if (u < 0.25) {
          dirData[idx + 1] = 255; // Left = Green
        } else if (u > 0.75) {
          dirData[idx] = 255;
          dirData[idx + 1] = 255; // Right = Yellow
        }
        dirData[idx + 3] = 255;
      }
    }
    const dirLayer: RawTextureInput = { width: W, height: H, data: dirData };
    const blkCtrl = makeSolidTexture(2, 2, 0, 0, 0); // L = 0 -> factor = 1
    const maps = makeConstantLevelIndexMaps([
      [0, 0, 255],
      [0, 0, 255],
      [0, 0, 255],
      [0, 0, 255],
    ]);

    // Mode 0 (off): single cell (grid 1x1), top of cell (0.5, 0.1) is Red, bottom (0.5, 0.9) is Blue
    const m0Top = evaluateShaderPixelCPU(
      0.5,
      0.1,
      blkCtrl,
      null,
      [dirLayer],
      makeParams({ gridSizeX: 1, gridSizeY: 1, rotationMode: 0 }),
      maps
    );
    const m0Bot = evaluateShaderPixelCPU(
      0.5,
      0.9,
      blkCtrl,
      null,
      [dirLayer],
      makeParams({ gridSizeX: 1, gridSizeY: 1, rotationMode: 0 }),
      maps
    );
    expect(m0Top.slice(0, 3)).toEqual([255, 0, 0]);
    expect(m0Bot.slice(0, 3)).toEqual([0, 0, 255]);

    // Mode 1 (continuous radial) & Mode 2 (4-face snap) on a 3x3 grid with apex at center (0.5, 0.5):
    // - Cell above apex (col 1, row 0, fineUV = (0.5, 1/6)): dirToApex = (0, +0.333) -> targetUp = (0, +1) (identity: bottom of cell v_local=0.85 -> sampleV=0.85 -> Blue)
    // - Cell below apex (col 1, row 2, fineUV = (0.5, 5/6)): dirToApex = (0, -0.333) -> targetUp = (0, -1) (180deg flip: bottom of cell v_local=0.85 -> sampleV=0.15 -> Red)
    // - Cell left of apex (col 0, row 1, fineUV = (1/6, 0.5)): dirToApex = (+0.333, 0) -> targetUp = (+1, 0) (90deg: right of cell u_local=0.85, v_local=0.5 -> sampleV=0.85 -> Blue)
    // - Cell right of apex (col 2, row 1, fineUV = (5/6, 0.5)): dirToApex = (-0.333, 0) -> targetUp = (-1, 0) (right of cell u_local=0.85, v_local=0.5 -> sampleV=0.15 -> Red)
    for (const mode of [1, 2]) {
      const p = makeParams({
        gridSizeX: 3,
        gridSizeY: 3,
        rotationMode: mode,
        apexX: 0.5,
        apexY: 0.5,
      });
      // Above apex: cell (1, 0), subLocal = (0.5, 0.85) -> u = 1.5/3, v = 0.85/3
      const abovePx = evaluateShaderPixelCPU(
        1.5 / 3,
        0.85 / 3,
        blkCtrl,
        null,
        [dirLayer],
        p,
        maps
      );
      // Below apex: cell (1, 2), subLocal = (0.5, 0.85) -> u = 1.5/3, v = 2.85/3
      const belowPx = evaluateShaderPixelCPU(
        1.5 / 3,
        2.85 / 3,
        blkCtrl,
        null,
        [dirLayer],
        p,
        maps
      );
      // Left of apex: cell (0, 1), subLocal = (0.85, 0.5) -> u = 0.85/3, v = 1.5/3
      const leftPx = evaluateShaderPixelCPU(
        0.85 / 3,
        1.5 / 3,
        blkCtrl,
        null,
        [dirLayer],
        p,
        maps
      );
      // Right of apex: cell (2, 1), subLocal = (0.85, 0.5) -> u = 2.85/3, v = 1.5/3
      const rightPx = evaluateShaderPixelCPU(
        2.85 / 3,
        1.5 / 3,
        blkCtrl,
        null,
        [dirLayer],
        p,
        maps
      );

      expect(abovePx.slice(0, 3)).toEqual([0, 0, 255]); // Blue
      expect(belowPx.slice(0, 3)).toEqual([255, 0, 0]); // Red (flipped 180)
      expect(leftPx.slice(0, 3)).toEqual([0, 0, 255]); // Blue (+X rotated to +Y)
      expect(rightPx.slice(0, 3)).toEqual([255, 0, 0]); // Red (+X rotated to -Y)
    }
  });

  it('4. Index maps: normalized decode, t crossfade, smoothBlend on/off, n = 1, 2, 32, and numImages < loaded', () => {
    const stack32: RawTextureInput[] = Array.from({ length: 32 }, (_, i) =>
      makeSolidTexture(2, 2, i * 8, 255 - i * 8, 0)
    );
    const blkCtrl = makeSolidTexture(2, 2, 0, 0, 0); // L = 0

    // Index map with from = layer 1 (byte 85 for n=4) and to = layer 3 (byte 255 for n=4), t = 128 (~0.502)
    const mapHalfT = makeConstantLevelIndexMaps([
      [85, 255, 128],
      [85, 255, 128],
      [85, 255, 128],
      [85, 255, 128],
    ]);

    // Smooth blend OFF -> shows `from` (layer 1: R = 8)
    const hardPx = evaluateShaderPixelCPU(
      0.5,
      0.5,
      blkCtrl,
      null,
      stack32,
      makeParams({ numImages: 4, smoothBlend: 0 }),
      mapHalfT
    );
    expect(hardPx[0]).toBe(8);

    // Smooth blend ON -> mix(layer 1 [R=8], layer 3 [R=24], 128/255) = 16
    const smoothPx = evaluateShaderPixelCPU(
      0.5,
      0.5,
      blkCtrl,
      null,
      stack32,
      makeParams({ numImages: 4, smoothBlend: 1 }),
      mapHalfT
    );
    expect(Math.abs(smoothPx[0] - 16)).toBeLessThanOrEqual(1);

    // n = 1 always clamps to layer 0 (R = 0)
    const px1 = evaluateShaderPixelCPU(
      0.5,
      0.5,
      blkCtrl,
      null,
      stack32,
      makeParams({ numImages: 1, smoothBlend: 1 }),
      mapHalfT
    );
    expect(px1[0]).toBe(0);

    // n = 32 with R=255, G=255, B=255 -> selects layer 31 (R = 31 * 8 = 248)
    const mapMax = makeConstantLevelIndexMaps([
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
    ]);
    const px32 = evaluateShaderPixelCPU(
      0.5,
      0.5,
      blkCtrl,
      null,
      stack32,
      makeParams({ numImages: 32, smoothBlend: 1 }),
      mapMax
    );
    expect(px32[0]).toBe(248);

    // Roundtrip check for encodeNormalizedLayerByte & decodeIndexValue across all 32 layers
    for (let i = 0; i < 32; i++) {
      const b = encodeNormalizedLayerByte(i, 32);
      expect(decodeIndexValue(b / 255, 32, 1)).toBe(i);
    }
  });

  it('5. Control & Mask: BT.709 luma weights, contrast, invert, and un-contrasted original through black mask', () => {
    const stack = [
      makeSolidTexture(2, 2, 10, 10, 10),
      makeSolidTexture(2, 2, 80, 80, 80),
      makeSolidTexture(2, 2, 160, 160, 160),
      makeSolidTexture(2, 2, 240, 240, 240),
    ];
    const maps = makeConstantLevelIndexMaps([
      [0, 0, 255],
      [85, 85, 255],
      [170, 170, 255],
      [255, 255, 255],
    ]);

    // Pure green (luma 0.7152 -> s = 2.145 -> L = 2 -> R=160) vs pure blue (luma 0.0722 -> s = 0.216 -> L = 0 -> R=10)
    const greenCtrl = makeSolidTexture(2, 2, 0, 255, 0);
    const blueCtrl = makeSolidTexture(2, 2, 0, 0, 255);
    expect(
      evaluateShaderPixelCPU(
        0.5,
        0.5,
        greenCtrl,
        null,
        stack,
        makeParams({ numImages: 4 }),
        maps
      )[0]
    ).toBe(160);
    expect(
      evaluateShaderPixelCPU(
        0.5,
        0.5,
        blueCtrl,
        null,
        stack,
        makeParams({ numImages: 4 }),
        maps
      )[0]
    ).toBe(10);

    // Black mask shows un-contrasted, un-offset original control
    const ctrl = makeSolidTexture(2, 2, 80, 120, 160);
    const blackMask = makeSolidTexture(2, 2, 0, 0, 0);
    const px = evaluateShaderPixelCPU(
      0.5,
      0.5,
      ctrl,
      blackMask,
      stack,
      makeParams({
        numImages: 4,
        contrast: 3.5,
        offset: 0.7,
        maskInfluence: 1.0,
      }),
      maps
    );
    expect(px).toEqual([80, 120, 160, 255]);
  });

  it('6. Transparency: flattens transparent pixels over black with alpha 255 (D13)', () => {
    const rgba = new Uint8Array([200, 100, 50, 128, 255, 255, 255, 0]);
    const flat = flattenOverBlackRGBA(rgba);
    expect(flat[0]).toBe(Math.round((200 * 128) / 255));
    expect(flat[1]).toBe(Math.round((100 * 128) / 255));
    expect(flat[2]).toBe(Math.round((50 * 128) / 255));
    expect(flat[3]).toBe(255);
    expect(flat[4]).toBe(0);
    expect(flat[5]).toBe(0);
    expect(flat[6]).toBe(0);
    expect(flat[7]).toBe(255);
  });
});

describe('Index Maps Generator & Transition Controller (§3 D15 & §8.2)', () => {
  it('generates identical maps for the same seed and different maps for different seeds', () => {
    const m1a = generateIndexMapsForSeed(42, 16, 16, 2, 8, 1.0);
    const m1b = generateIndexMapsForSeed(42, 16, 16, 2, 8, 1.0);
    const m2 = generateIndexMapsForSeed(43, 16, 16, 2, 8, 1.0);

    for (let lvl = 0; lvl < 4; lvl++) {
      expect(Array.from(m1a[lvl].data)).toEqual(Array.from(m1b[lvl].data));
    }
    expect(Array.from(m1a[0].data)).not.toEqual(Array.from(m2[0].data));
  });

  it('computes level resolutions gridSize * mult^L and animates B channel 0 -> 1 on shuffle', () => {
    expect(computeIndexMapSize(10, 8, 2, 0)).toEqual({ width: 10, height: 8 });
    expect(computeIndexMapSize(10, 8, 2, 3)).toEqual({ width: 80, height: 64 });

    const ctrl = new IndexMapController(1, 8, 8, 2, 6);
    expect(ctrl.isTransitionActive()).toBe(false);

    // Start 2.0s transition to seed 2
    ctrl.startTransitionToSeed(2, 8, 8, 2, 6, 2.0);
    expect(ctrl.isTransitionActive()).toBe(true);
    expect(ctrl.getMaps()[0].data[2]).toBe(0); // B = 0 at t=0

    ctrl.step(1.0); // 50%
    expect(ctrl.isTransitionActive()).toBe(true);
    expect(Math.abs(ctrl.getMaps()[0].data[2] - 128)).toBeLessThanOrEqual(1);

    ctrl.step(1.0); // 100%
    expect(ctrl.isTransitionActive()).toBe(false);
    expect(ctrl.getMaps()[0].data[2]).toBe(255);
  });
});

describe('Offset Animation Clock (§3 & §8.2)', () => {
  it('keeps offset still at speed 0, advances linearly for >0, and wraps backwards for <0', () => {
    expect(advanceOffsetLinear(0.35, 0, 5.0)).toBeCloseTo(0.35, 6);
    expect(advanceOffsetLinear(0.2, 0.25, 1.0)).toBeCloseTo(0.45, 6);
    expect(advanceOffsetLinear(0.8, 0.5, 1.0)).toBeCloseTo(0.3, 6);
    expect(advanceOffsetLinear(0.1, -0.3, 1.0)).toBeCloseTo(0.8, 6);
    const d1 = advanceOffsetLinear(0, 0.15, 2.0);
    const d2 = advanceOffsetLinear(0, 0.3, 2.0);
    expect(d2).toBeCloseTo(d1 * 2, 6);
  });

  it('pauses when tab is hidden with no jump on return', () => {
    const clock = new AnimationClock();
    expect(clock.tick(1000)).toBe(0);
    expect(clock.tick(1500)).toBeCloseTo(0.5, 5);

    clock.setHidden(true, 1600);
    expect(clock.tick(5000)).toBe(0);

    clock.setHidden(false, 8000);
    expect(clock.tick(8200)).toBeCloseTo(0.2, 5);
  });
});
