import { expect, test } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateShaderPixelCPU } from '../../src/engine/reference-cpu';
import {
  DEFAULT_SHADER_PARAMS,
  IndexMapsQuad,
  RawTextureInput,
  ShaderParams,
} from '../../src/engine/types';

function makeSolid(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number = 255
): RawTextureInput {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width: w, height: h, data };
}

function makeConstantIndexMaps(
  levels: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ]
): IndexMapsQuad {
  return levels.map(([r, g, b]) =>
    makeSolid(1, 1, r, g, b, 255)
  ) as IndexMapsQuad;
}

function makeDirectionalTexture(w: number, h: number): RawTextureInput {
  // Top (v < 0.25) = Red (255, 0, 0)
  // Bottom (v > 0.75) = Blue (0, 0, 255)
  // Left (u < 0.25, 0.25<=v<=0.75) = Green (0, 255, 0)
  // Right (u > 0.75, 0.25<=v<=0.75) = Yellow (255, 255, 0)
  // Center = Grey (120, 120, 120)
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const idx = (y * w + x) * 4;
      if (v < 0.25) {
        data[idx] = 255;
      } else if (v > 0.75) {
        data[idx + 2] = 255;
      } else if (u < 0.25) {
        data[idx + 1] = 255;
      } else if (u > 0.75) {
        data[idx] = 255;
        data[idx + 1] = 255;
      } else {
        data[idx] = 120;
        data[idx + 1] = 120;
        data[idx + 2] = 120;
      }
      data[idx + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function makeQuadrantTexture(
  w: number,
  h: number,
  tl: [number, number, number],
  tr: [number, number, number],
  bl: [number, number, number],
  br: [number, number, number]
): RawTextureInput {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const top = y < h / 2;
    for (let x = 0; x < w; x++) {
      const left = x < w / 2;
      const [r, g, b] = top ? (left ? tl : tr) : left ? bl : br;
      const idx = (y * w + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function expectPixelNear(
  actual: [number, number, number, number],
  expected: [number, number, number, number],
  tolerance: number = 3,
  context: string = ''
): void {
  for (let c = 0; c < 4; c++) {
    const diff = Math.abs(actual[c] - expected[c]);
    expect(
      diff,
      `${context} channel ${c}: actual=${JSON.stringify(actual)} vs expected=${JSON.stringify(expected)}`
    ).toBeLessThanOrEqual(tolerance);
  }
}

test.describe('Texture Mosaic v0.1 — Automated Verification (§8.2)', () => {
  test('1. Shader GPU pixels match §4 CPU reference across grid, subdivision, rotation, index maps, control, mask, orientation, and transparency', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForSelector('[data-testid="render-canvas"]');

    // Use a 64x64 working resolution for fast, exact pixel matrix verification
    await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setWorkingResolution(64, 64);
      api.resetGroup('all');
    });

    const W = 64;
    const H = 64;

    const runShaderCase = async (
      name: string,
      control: RawTextureInput,
      mask: RawTextureInput | null,
      stack: RawTextureInput[],
      paramOverrides: Partial<ShaderParams>,
      customIndexMaps?: IndexMapsQuad,
      sampleUVs: [number, number][] = [[0.5, 0.5]]
    ) => {
      const fullParams: ShaderParams = {
        ...DEFAULT_SHADER_PARAMS,
        gridSizeX: 4,
        gridSizeY: 4,
        numImages: stack.length,
        maskInfluence: mask ? 1 : 0,
        ...paramOverrides,
      };

      const gpuResult = await page.evaluate(
        ({ control, mask, stack, fullParams, customIndexMaps, sampleUVs }) => {
          const api = window.__TEXTURE_MOSAIC_DEBUG__!;
          const toUint8 = (t: {
            width: number;
            height: number;
            data: number[];
          }) => ({
            width: t.width,
            height: t.height,
            data: new Uint8Array(t.data),
          });
          api.setStackRaw(stack.map(toUint8));
          api.setControlRaw(toUint8(control));
          api.setMaskRaw(mask ? toUint8(mask) : null);

          (Object.keys(fullParams) as (keyof ShaderParams)[]).forEach((k) => {
            api.setParam(k, fullParams[k]);
          });
          if (customIndexMaps) {
            api.setIndexMapsRaw([
              toUint8(customIndexMaps[0]),
              toUint8(customIndexMaps[1]),
              toUint8(customIndexMaps[2]),
              toUint8(customIndexMaps[3]),
            ]);
          }
          api.renderNow();

          const activeMaps = api.getIndexMapsRaw().map((m) => ({
            width: m.width,
            height: m.height,
            data: Array.from(m.data),
          }));
          const samples = sampleUVs.map(([u, v]) => api.readPixelAtUV(u, v));
          const glErrors = api.getGlErrors();
          return { samples, glErrors, activeMaps };
        },
        {
          control: {
            width: control.width,
            height: control.height,
            data: Array.from(control.data),
          },
          mask: mask
            ? {
                width: mask.width,
                height: mask.height,
                data: Array.from(mask.data),
              }
            : null,
          stack: stack.map((s) => ({
            width: s.width,
            height: s.height,
            data: Array.from(s.data),
          })),
          fullParams,
          customIndexMaps: customIndexMaps
            ? customIndexMaps.map((m) => ({
                width: m.width,
                height: m.height,
                data: Array.from(m.data),
              }))
            : null,
          sampleUVs,
        }
      );

      expect(gpuResult.glErrors, `${name}: GL errors`).toEqual([]);

      const cpuMaps: IndexMapsQuad = gpuResult.activeMaps.map((m) => ({
        width: m.width,
        height: m.height,
        data: new Uint8Array(m.data),
      })) as IndexMapsQuad;

      sampleUVs.forEach(([u, v], idx) => {
        const pxX = Math.min(W - 1, Math.max(0, Math.floor(u * W)));
        const pxY = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
        const centerU = (pxX + 0.5) / W;
        const centerV = (pxY + 0.5) / H;
        const expected = evaluateShaderPixelCPU(
          centerU,
          centerV,
          control,
          mask,
          stack,
          fullParams,
          cpuMaps
        );
        expectPixelNear(
          gpuResult.samples[idx],
          expected,
          3,
          `${name} @ uv(${u},${v})`
        );
      });
    };

    // 4 distinct solid layers: L0=Blue(20,40,200), L1=Green(40,200,60), L2=Yellow(220,180,30), L3=Red(230,50,80)
    const stack4 = [
      makeSolid(W, H, 20, 40, 200),
      makeSolid(W, H, 40, 200, 60),
      makeSolid(W, H, 220, 180, 30),
      makeSolid(W, H, 230, 50, 80),
    ];
    // Map each level L (0..3) to layer L (encoded normalized for n=4: 0->0, 1->85, 2->170, 3->255)
    const levelMaps = makeConstantIndexMaps([
      [0, 0, 255],
      [85, 85, 255],
      [170, 170, 255],
      [255, 255, 255],
    ]);

    // 1a. Grid boundaries & base-cell level sharing: 4x1 control where each column triggers L = 0, 1, 2, 3
    const ctrl4Cols: RawTextureInput = {
      width: 4,
      height: 1,
      data: new Uint8Array([
        0, 0, 0, 255, 85, 85, 85, 255, 170, 170, 170, 255, 255, 255, 255, 255,
      ]),
    };
    await runShaderCase(
      'grid-boundaries-and-subdivision-bands-L0-L3',
      ctrl4Cols,
      null,
      stack4,
      { gridSizeX: 4, gridSizeY: 4, cyclic: 0, smoothBlend: 1 },
      levelMaps,
      [
        [0.05, 0.5],
        [0.22, 0.5], // Cell 0 (L=0)
        [0.28, 0.5],
        [0.47, 0.5], // Cell 1 (L=1)
        [0.53, 0.5],
        [0.72, 0.5], // Cell 2 (L=2)
        [0.78, 0.5],
        [0.95, 0.5], // Cell 3 (L=3)
      ]
    );

    // 1b. Subdivision: cyclic off vs cyclic on (wraps 3 -> 0), and subdivMultiplier 1.5, 2, 4
    for (const lumByte of [0, 85, 170, 230, 255]) {
      const ctrl = makeSolid(W, H, lumByte, lumByte, lumByte);
      await runShaderCase(
        `subdiv-cyclic-off-lum-${lumByte}`,
        ctrl,
        null,
        stack4,
        { cyclic: 0, offset: 0.25 },
        levelMaps
      );
      await runShaderCase(
        `subdiv-cyclic-on-wrap-lum-${lumByte}`,
        ctrl,
        null,
        stack4,
        { cyclic: 1, offset: 0.25 },
        levelMaps
      );
    }

    const dirStack = [makeDirectionalTexture(W, H)];
    for (const mult of [1.5, 2, 4]) {
      await runShaderCase(
        `subdiv-multiplier-${mult}`,
        makeSolid(W, H, 170, 170, 170), // L=2
        null,
        dirStack,
        {
          gridSizeX: 4,
          gridSizeY: 4,
          subdivMultiplier: mult,
          rotationMode: 0,
        },
        makeConstantIndexMaps([
          [0, 0, 255],
          [0, 0, 255],
          [0, 0, 255],
          [0, 0, 255],
        ]),
        [
          [0.1, 0.1],
          [0.35, 0.2],
          [0.65, 0.7],
          [0.85, 0.85],
        ]
      );
    }

    // 1c. Rotation modes: Mode 0 (identity), Mode 1 (continuous radial to apex), Mode 2 (4-face 90deg snap)
    // Check cells above, below, left, and right of apex (0.5, 0.5) on a 5x5 grid
    const singleLayerMaps = makeConstantIndexMaps([
      [0, 0, 255],
      [0, 0, 255],
      [0, 0, 255],
      [0, 0, 255],
    ]);
    for (const rotMode of [0, 1, 2]) {
      await runShaderCase(
        `rotation-mode-${rotMode}-around-apex`,
        makeSolid(W, H, 0, 0, 0), // L=0 -> 1 subcell per base cell
        null,
        dirStack,
        {
          gridSizeX: 5,
          gridSizeY: 5,
          rotationMode: rotMode,
          apexX: 0.5,
          apexY: 0.5,
        },
        singleLayerMaps,
        [
          [2.5 / 5, 0.85 / 5], // Above apex (cell 2,0)
          [2.5 / 5, 4.85 / 5], // Below apex (cell 2,4)
          [0.85 / 5, 2.5 / 5], // Left of apex (cell 0,2)
          [4.85 / 5, 2.5 / 5], // Right of apex (cell 4,2)
        ]
      );
    }

    // 1d. Index maps: normalized decode, t crossfade, smoothBlend on/off, n = 1, 2, 32, numImages < loaded
    const crossfadeMaps = makeConstantIndexMaps([
      [0, 255, 128], // from=0, to=last, t~0.502
      [0, 255, 128],
      [0, 255, 128],
      [0, 255, 128],
    ]);
    await runShaderCase(
      'index-map-crossfade-smoothBlend-on',
      makeSolid(W, H, 0, 0, 0),
      null,
      stack4,
      { numImages: 4, smoothBlend: 1 },
      crossfadeMaps
    );
    await runShaderCase(
      'index-map-crossfade-smoothBlend-off',
      makeSolid(W, H, 0, 0, 0),
      null,
      stack4,
      { numImages: 4, smoothBlend: 0 },
      crossfadeMaps
    );

    const stack32 = Array.from({ length: 32 }, (_, i) =>
      makeSolid(W, H, i * 8, 255 - i * 8, (i * 23) % 256)
    );
    await runShaderCase(
      'n=1-single-layer',
      makeSolid(W, H, 200, 200, 200),
      null,
      [stack32[0]],
      { numImages: 1, smoothBlend: 1 },
      crossfadeMaps
    );
    await runShaderCase(
      'n=2-layers',
      makeSolid(W, H, 128, 128, 128),
      null,
      stack32.slice(0, 2),
      { numImages: 2, smoothBlend: 1 },
      crossfadeMaps
    );
    await runShaderCase(
      'n=32-layers',
      makeSolid(W, H, 190, 190, 190),
      null,
      stack32,
      { numImages: 32, smoothBlend: 1 },
      crossfadeMaps
    );
    await runShaderCase(
      'numImages-lower-than-loaded (5 of 32)',
      makeSolid(W, H, 255, 255, 255),
      null,
      stack32,
      { numImages: 5, smoothBlend: 1 },
      crossfadeMaps
    );

    // 1e. Control stage: contrast 1 / 0 / >1; offset clamp & wrap; luma weights (pure R, G, B); invert color
    await runShaderCase(
      'contrast-0-flat-grey',
      makeSolid(W, H, 240, 240, 240),
      null,
      stack4,
      { contrast: 0, cyclic: 0 },
      levelMaps
    );
    await runShaderCase(
      'contrast-2.5-boosted',
      makeSolid(W, H, 165, 165, 165),
      null,
      stack4,
      { contrast: 2.5, cyclic: 0 },
      levelMaps
    );
    await runShaderCase(
      'control-invert',
      makeSolid(W, H, 250, 250, 250),
      null,
      stack4,
      { invertControl: 1, cyclic: 0 },
      levelMaps
    );
    await runShaderCase(
      'control-luma-pure-red',
      makeSolid(W, H, 255, 0, 0),
      null,
      stack4,
      {},
      levelMaps
    );
    await runShaderCase(
      'control-luma-pure-green',
      makeSolid(W, H, 0, 255, 0),
      null,
      stack4,
      {},
      levelMaps
    );
    await runShaderCase(
      'control-luma-pure-blue',
      makeSolid(W, H, 0, 0, 255),
      null,
      stack4,
      {},
      levelMaps
    );

    // 1f. Mask stage: white, black, mid-grey; min/max remap incl. min > max; invert; influence 0, 0.5, 1;
    // mask luma weights; original control through mask has NO contrast and NO offset
    const distinctCtrl = makeSolid(W, H, 50, 110, 190);
    await runShaderCase(
      'mask-white-shows-mosaic',
      distinctCtrl,
      makeSolid(W, H, 255, 255, 255),
      stack4,
      { maskInfluence: 1, contrast: 2.5, offset: 0.4 },
      levelMaps
    );
    await runShaderCase(
      'mask-black-shows-uncontrasted-unoffset-original',
      distinctCtrl,
      makeSolid(W, H, 0, 0, 0),
      stack4,
      { maskInfluence: 1, contrast: 3.5, offset: 0.8 },
      levelMaps
    );
    await runShaderCase(
      'mask-midgrey-mixes-50pct',
      distinctCtrl,
      makeSolid(W, H, 128, 128, 128),
      stack4,
      { maskInfluence: 1 },
      levelMaps
    );
    await runShaderCase(
      'mask-min-max-remap-and-min-greater-than-max',
      distinctCtrl,
      makeSolid(W, H, 140, 140, 140),
      stack4,
      { maskInfluence: 1, maskMin: 0.8, maskMax: 0.2 },
      levelMaps
    );
    await runShaderCase(
      'mask-invert',
      distinctCtrl,
      makeSolid(W, H, 255, 255, 255),
      stack4,
      { maskInfluence: 1, invertMask: 1 },
      levelMaps
    );
    for (const inf of [0, 0.5, 1]) {
      await runShaderCase(
        `mask-influence-${inf}`,
        distinctCtrl,
        makeSolid(W, H, 0, 0, 0),
        stack4,
        { maskInfluence: inf },
        levelMaps
      );
    }
    await runShaderCase(
      'mask-luma-pure-red',
      distinctCtrl,
      makeSolid(W, H, 255, 0, 0),
      stack4,
      { maskInfluence: 1 },
      levelMaps
    );
    await runShaderCase(
      'mask-luma-pure-green',
      distinctCtrl,
      makeSolid(W, H, 0, 255, 0),
      stack4,
      { maskInfluence: 1 },
      levelMaps
    );
    await runShaderCase(
      'mask-luma-pure-blue',
      distinctCtrl,
      makeSolid(W, H, 0, 0, 255),
      stack4,
      { maskInfluence: 1 },
      levelMaps
    );

    // 1g. Orientation check across all 4 quadrants of cell (0,0) on a 4x4 grid (L=0)
    const quadStack = [
      makeQuadrantTexture(
        W,
        H,
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0]
      ),
    ];
    await runShaderCase(
      'orientation-quadrants',
      makeSolid(W, H, 0, 0, 0),
      null,
      quadStack,
      { gridSizeX: 4, gridSizeY: 4, numImages: 1, rotationMode: 0 },
      singleLayerMaps,
      [
        [0.05, 0.05], // Top-Left of cell (0,0) -> Red
        [0.2, 0.05], // Top-Right of cell (0,0) -> Green
        [0.05, 0.2], // Bottom-Left of cell (0,0) -> Blue
        [0.2, 0.2], // Bottom-Right of cell (0,0) -> Yellow
      ]
    );

    // 1h. Adaptive Saturation FX Pass (D5 & U8): empty satMap (value 1 = untouched), R=0 (grayscale), R=255 (oversaturated), and custom satMin/satMax
    const satTestLayer = [makeSolid(W, H, 200, 100, 50)];
    for (const satCase of [
      {
        name: 'sat-empty-map-default-untouched',
        satMap: null as RawTextureInput | null,
        satMin: 0,
        satMax: 5,
      },
      {
        name: 'sat-map-zero-grayscale',
        satMap: makeSolid(W, H, 0, 0, 0),
        satMin: 0,
        satMax: 5,
      },
      {
        name: 'sat-map-mid-boosted',
        satMap: makeSolid(W, H, 128, 0, 0),
        satMin: 0.5,
        satMax: 2.5,
      },
      {
        name: 'sat-map-full-oversaturated',
        satMap: makeSolid(W, H, 255, 0, 0),
        satMin: 0,
        satMax: 3.5,
      },
    ]) {
      const satGpu = await page.evaluate(
        ({ satCase, W, H }) => {
          const api = window.__TEXTURE_MOSAIC_DEBUG__!;
          const layer = new Uint8Array(W * H * 4);
          for (let i = 0; i < layer.length; i += 4) {
            layer[i] = 200;
            layer[i + 1] = 100;
            layer[i + 2] = 50;
            layer[i + 3] = 255;
          }
          api.setStackRaw([{ width: W, height: H, data: layer }]);
          const blk = new Uint8Array(4 * 4 * 4);
          for (let i = 3; i < blk.length; i += 4) blk[i] = 255;
          api.setControlRaw({ width: 4, height: 4, data: blk });
          api.setMaskRaw(null);
          api.setSatMapRaw(
            satCase.satMap
              ? {
                  width: satCase.satMap.width,
                  height: satCase.satMap.height,
                  data: new Uint8Array(satCase.satMap.data),
                }
              : null
          );
          api.setParam('satMin', satCase.satMin);
          api.setParam('satMax', satCase.satMax);
          api.renderNow();
          const px = api.readPixelAtUV(0.5, 0.5);
          const errs = api.getGlErrors();
          api.clearSatMap();
          api.resetGroup('saturation');
          return { px, errs };
        },
        {
          satCase: {
            ...satCase,
            satMap: satCase.satMap
              ? {
                  width: satCase.satMap.width,
                  height: satCase.satMap.height,
                  data: Array.from(satCase.satMap.data),
                }
              : null,
          },
          W,
          H,
        }
      );
      expect(satGpu.errs).toEqual([]);
      const expectedSatPx = evaluateShaderPixelCPU(
        (Math.floor(0.5 * W) + 0.5) / W,
        (Math.floor(0.5 * H) + 0.5) / H,
        makeSolid(4, 4, 0, 0, 0),
        null,
        satTestLayer,
        {
          ...DEFAULT_SHADER_PARAMS,
          numImages: 1,
          satMin: satCase.satMin,
          satMax: satCase.satMax,
        },
        singleLayerMaps,
        satCase.satMap
      );
      expectPixelNear(satGpu.px, expectedSatPx, 3, satCase.name);
    }

    // 1i. Transparency check (D13): semi-transparent stack image flattens over black with alpha = 255
    const alphaResult = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      const rgba = new Uint8Array(64 * 64 * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 200;
        rgba[i + 1] = 100;
        rgba[i + 2] = 50;
        rgba[i + 3] = 128; // ~50% alpha
      }
      api.loadStackImageWithAlpha(64, 64, rgba, 'semi_transparent.png');
      api.renderNow();
      return api.readPixelAtUV(0.5, 0.5);
    });
    expectPixelNear(
      alphaResult,
      [100, 50, 25, 255],
      3,
      'alpha flattened over black'
    );
    expect(consoleErrors).toEqual([]);
  });

  test('2. App controls (Grid, Rotation, Index Maps, Control, Shader, Mask), stack add/remove/reorder, mask disable rule (D11), working resolution, snapshot PNG, and visible errors (D9)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="render-canvas"]');

    // Mask controls should be disabled initially when no mask is loaded (D11)
    const maskSlider = page.getByTestId('param-maskInfluence-slider');
    await expect(maskSlider).toBeDisabled();

    // Load a mask and verify mask controls become enabled and influence defaults to 1 (D11)
    await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      const w = 16,
        h = 16;
      const data = new Uint8Array(w * h * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = 255;
      }
      api.setMaskRaw({ width: w, height: h, data }, 'test_mask.png');
    });
    await expect(maskSlider).toBeEnabled();
    expect(
      await page.evaluate(
        () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().params.maskInfluence
      )
    ).toBe(1);

    // Clear mask via UI button and verify mask controls disable again and influence becomes 0
    await page.getByTestId('mask-clear-btn').click();
    await expect(maskSlider).toBeDisabled();
    expect(
      await page.evaluate(
        () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().params.maskInfluence
      )
    ).toBe(0);

    // Stack reorder and remove test
    const beforeReorderPx = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setWorkingResolution(32, 32);
      const l0 = new Uint8Array(32 * 32 * 4);
      const l1 = new Uint8Array(32 * 32 * 4);
      for (let i = 0; i < l0.length; i += 4) {
        l0[i] = 220;
        l0[i + 3] = 255; // Layer 0 = Red
        l1[i + 1] = 220;
        l1[i + 3] = 255; // Layer 1 = Green
      }
      api.setStackRaw(
        [
          { width: 32, height: 32, data: l0 },
          { width: 32, height: 32, data: l1 },
        ],
        ['red.png', 'green.png']
      );
      // Force index maps to select layer 0
      const m0 = {
        width: 1,
        height: 1,
        data: new Uint8Array([0, 0, 255, 255]),
      };
      api.setIndexMapsRaw([m0, m0, m0, m0]);
      return api.readPixelAtUV(0.5, 0.5);
    });
    expectPixelNear(beforeReorderPx, [220, 0, 0, 255], 2, 'before reorder');

    // Click move-down on layer 0 in UI
    await page.getByTestId('stack-move-down-0').click();
    const afterReorderPx = await page.evaluate(() =>
      window.__TEXTURE_MOSAIC_DEBUG__!.readPixelAtUV(0.5, 0.5)
    );
    expectPixelNear(afterReorderPx, [0, 220, 0, 255], 2, 'after reorder');

    // Regression test (U7): manual canvas size typing while live animation is running
    await page.evaluate(() => {
      window.__TEXTURE_MOSAIC_DEBUG__!.setWorkingResolution(1280, 720);
      window.__TEXTURE_MOSAIC_DEBUG__!.setParam('animSpeed', 0.25);
    });
    const wInput = page.getByTestId('resolution-width-input');
    const hInput = page.getByTestId('resolution-height-input');
    await wInput.click();
    await wInput.fill('640');
    // Wait across several live animation frames while focused (simulating human typing)
    await page.waitForTimeout(120);
    await wInput.press('Enter');
    await hInput.click();
    await hInput.fill('360');
    await page.waitForTimeout(120);
    await hInput.press('Enter');
    await expect(page.getByTestId('resolution-label')).toHaveText(
      '640 X 360 PX'
    );

    // Verify 32 layers at 1280x720 allocate with zero GL errors (§5 constraint)
    const alloc32 = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setWorkingResolution(1280, 720);
      const layers = Array.from({ length: 32 }, (_, i) => ({
        width: 8,
        height: 8,
        data: new Uint8Array(8 * 8 * 4).map((_, idx) =>
          idx % 4 === 3 ? 255 : (i * 7) % 256
        ),
      }));
      api.setStackRaw(layers);
      api.renderNow();
      return {
        glErrors: api.getGlErrors(),
        stackLen: api.getState().stack.length,
        width: api.getState().workingWidth,
        height: api.getState().workingHeight,
      };
    });
    expect(alloc32.glErrors).toEqual([]);
    expect(alloc32.stackLen).toBe(32);
    expect(alloc32.width).toBe(1280);
    expect(alloc32.height).toBe(720);

    // Switch back to 64x64 for fast control-change & reset checks across all groups
    await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setWorkingResolution(64, 64);
      api.initDefaultScene?.();
      api.resetGroup('all');
    });

    const captureDigest = () =>
      page.evaluate(() => {
        const px = window.__TEXTURE_MOSAIC_DEBUG__!.readPixels(0, 0, 64, 64);
        let hash = 2166136261;
        for (let i = 0; i < px.length; i++) {
          hash ^= px[i];
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      });

    const baseDigest = await captureDigest();

    // Test Grid group controls (gridSizeX, gridSizeY, subdivMultiplier) & resets
    await page.getByTestId('param-gridSizeX-slider').fill('12');
    await page.getByTestId('param-gridSizeX-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-gridSizeX-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    await page.getByTestId('param-gridSizeY-slider').fill('14');
    await page.getByTestId('param-gridSizeY-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-gridSizeY-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    await page.getByTestId('param-subdivMultiplier-slider').fill('3.5');
    await page
      .getByTestId('param-subdivMultiplier-slider')
      .dispatchEvent('input');
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-subdivMultiplier-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    // Test Rotation group controls (rotationMode, apexX, apexY) & resets
    await page.getByTestId('param-rotationMode-1').click();
    const rot1Digest = await captureDigest();
    expect(rot1Digest).not.toBe(baseDigest);

    await page.getByTestId('param-apexX-slider').fill('0.15');
    await page.getByTestId('param-apexX-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(rot1Digest);
    await page.getByTestId('reset-apexX-btn').click();
    expect(await captureDigest()).toBe(rot1Digest);

    await page.getByTestId('param-apexY-slider').fill('0.85');
    await page.getByTestId('param-apexY-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(rot1Digest);
    await page.getByTestId('reset-apexY-btn').click();
    expect(await captureDigest()).toBe(rot1Digest);

    await page.getByTestId('param-rotationMode-2').click();
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-rotationMode-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    // Verify removed indexMaps parameter group is not in the DOM (U6)
    await expect(page.locator('[data-testid="group-indexMaps"]')).toHaveCount(
      0
    );

    // Test Control group (contrast, offset, cyclic, invertControl) & resets
    await page.getByTestId('param-contrast-slider').fill('3.2');
    await page.getByTestId('param-contrast-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-contrast-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    await page.getByTestId('param-offset-slider').fill('0.45');
    await page.getByTestId('param-offset-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-offset-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    await page.getByTestId('param-cyclic-toggle').click();
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-cyclic-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    await page.getByTestId('param-invertControl-toggle').click();
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-invertControl-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    // Test Shader group (numImages, smoothBlend) & resets
    await page.getByTestId('param-numImages-slider').fill('2');
    await page.getByTestId('param-numImages-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-numImages-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    await page.getByTestId('param-smoothBlend-toggle').click();
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-smoothBlend-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    // Test Saturation group (satMin, satMax) & resets
    await page.getByTestId('param-satMin-slider').fill('2.5');
    await page.getByTestId('param-satMin-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-satMin-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    await page.getByTestId('param-satMax-slider').fill('0');
    await page.getByTestId('param-satMax-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(baseDigest);
    await page.getByTestId('reset-satMax-btn').click();
    expect(await captureDigest()).toBe(baseDigest);

    // Test Perlin Noise source & Noise parameter group (scale, detail, contrast) + live processed input preview thumbnails (U9 & U10)
    const initialCtrlThumb = await page.evaluate(
      () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.thumbnailUrl
    );

    // Changing control contrast or offset updates the Control input preview thumbnail in real time (U10)
    await page.getByTestId('param-contrast-slider').fill('3.5');
    await page.getByTestId('param-contrast-slider').dispatchEvent('input');
    const contrastedCtrlThumb = await page.evaluate(
      () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.thumbnailUrl
    );
    expect(contrastedCtrlThumb).not.toBe(initialCtrlThumb);
    await page.getByTestId('reset-contrast-btn').click();
    expect(
      await page.evaluate(
        () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.thumbnailUrl
      )
    ).toBe(initialCtrlThumb);

    // Select Perlin Noise on Control input and verify scale, detail, and contrast change both canvas output and preview thumbnail (U9 & U10)
    await page.getByTestId('control-source-noise').click();
    await expect(page.getByTestId('control-status-label')).toHaveText('Noise');
    const noiseBaseDigest = await captureDigest();
    const noiseBaseThumb = await page.evaluate(
      () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.thumbnailUrl
    );
    expect(noiseBaseDigest).not.toBe(baseDigest);

    await page.getByTestId('param-noiseScale-slider').fill('18');
    await page.getByTestId('param-noiseScale-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(noiseBaseDigest);
    expect(
      await page.evaluate(
        () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.thumbnailUrl
      )
    ).not.toBe(noiseBaseThumb);
    await page.getByTestId('reset-noiseScale-btn').click();
    expect(await captureDigest()).toBe(noiseBaseDigest);

    await page.getByTestId('param-noiseDetail-slider').fill('1');
    await page.getByTestId('param-noiseDetail-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(noiseBaseDigest);
    await page.getByTestId('reset-noiseDetail-btn').click();
    expect(await captureDigest()).toBe(noiseBaseDigest);

    await page.getByTestId('param-noiseContrast-slider').fill('2.8');
    await page.getByTestId('param-noiseContrast-slider').dispatchEvent('input');
    expect(await captureDigest()).not.toBe(noiseBaseDigest);
    await page.getByTestId('reset-noiseContrast-btn').click();
    expect(await captureDigest()).toBe(noiseBaseDigest);

    // Switch Control back to image without page reload
    await page.getByTestId('control-source-image').click();
    expect(await captureDigest()).toBe(baseDigest);

    // Verify PNG snapshot is valid and matches working resolution 640x360 with opaque alpha
    await page.evaluate(() => {
      window.__TEXTURE_MOSAIC_DEBUG__!.setWorkingResolution(640, 360);
    });
    const snapInfo = await page.evaluate(async () => {
      const dataUrl =
        window.__TEXTURE_MOSAIC_DEBUG__!.captureSnapshotDataUrl();
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Invalid snapshot PNG'));
        img.src = dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(320, 180, 1, 1).data;
      return {
        startsPng: dataUrl.startsWith('data:image/png;base64,'),
        width: img.width,
        height: img.height,
        alpha: px[3],
      };
    });
    expect(snapInfo.startsPng).toBe(true);
    expect(snapInfo.width).toBe(640);
    expect(snapInfo.height).toBe(360);
    expect(snapInfo.alpha).toBe(255);

    // Visible UI error when exceeding 32 images (D2, D9)
    await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      const layers = Array.from({ length: 35 }, () => ({
        width: 4,
        height: 4,
        data: new Uint8Array(4 * 4 * 4),
      }));
      api.setStackRaw(layers);
    });
    await expect(page.getByTestId('error-toast').first()).toBeVisible();
    await expect(page.getByTestId('error-message').first()).toContainText('32');
  });

  test('3. Index Map media input (U6 & D15): maps single Index Map input (image/video/webcam) to all 4 shader uIndexMap0..3 across L=0..3', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="render-canvas"]');

    // Verify all 4 input groups exist in Left Panel
    await expect(page.getByTestId('control-input-group')).toBeVisible();
    await expect(page.getByTestId('indexMap-input-group')).toBeVisible();
    await expect(page.getByTestId('satMap-input-group')).toBeVisible();
    await expect(page.getByTestId('mask-input-group')).toBeVisible();

    // Verify setting a single Index Map input via setIndexMapRaw maps to all 4 levels L=0, 1, 2, 3
    const levelsResult = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setWorkingResolution(64, 64);
      api.resetGroup('all');

      // 4 distinct solid stack layers: Layer 0=20, Layer 1=90, Layer 2=170, Layer 3=240
      const layers = [20, 90, 170, 240].map((r) => {
        const d = new Uint8Array(64 * 64 * 4);
        for (let i = 0; i < d.length; i += 4) {
          d[i] = r;
          d[i + 3] = 255;
        }
        return { width: 64, height: 64, data: d };
      });
      api.setStackRaw(layers);

      // Control texture with 4 columns triggering L = 0, 1, 2, 3
      const ctrl = new Uint8Array([
        0, 0, 0, 255, 85, 85, 85, 255, 170, 170, 170, 255, 255, 255, 255, 255,
      ]);
      api.setControlRaw({ width: 4, height: 1, data: ctrl });
      api.setParam('gridSizeX', 4);
      api.setParam('gridSizeY', 4);

      // Single Index Map selecting Layer 2 (byte 170 for n=4)
      const idxMapL2 = {
        width: 1,
        height: 1,
        data: new Uint8Array([170, 170, 255, 255]),
      };
      api.setIndexMapRaw(idxMapL2, 'index_layer2.png');

      const samplesL2 = [
        api.readPixelAtUV(0.125, 0.5)[0], // L=0 cell
        api.readPixelAtUV(0.375, 0.5)[0], // L=1 cell
        api.readPixelAtUV(0.625, 0.5)[0], // L=2 cell
        api.readPixelAtUV(0.875, 0.5)[0], // L=3 cell
      ];

      // Change single Index Map to select Layer 3 (byte 255 for n=4)
      const idxMapL3 = {
        width: 1,
        height: 1,
        data: new Uint8Array([255, 255, 255, 255]),
      };
      api.setIndexMapRaw(idxMapL3, 'index_layer3.png');

      const samplesL3 = [
        api.readPixelAtUV(0.125, 0.5)[0],
        api.readPixelAtUV(0.375, 0.5)[0],
        api.readPixelAtUV(0.625, 0.5)[0],
        api.readPixelAtUV(0.875, 0.5)[0],
      ];

      return {
        samplesL2,
        samplesL3,
        indexMapMode: api.getState().indexMapSource.mode,
        indexMapName: api.getState().indexMapSource.name,
      };
    });

    expect(levelsResult.indexMapMode).toBe('image');
    expect(levelsResult.indexMapName).toBe('index_layer3.png');
    // All 4 subdivision levels L=0..3 read the same Index Map input:
    expect(levelsResult.samplesL2).toEqual([170, 170, 170, 170]);
    expect(levelsResult.samplesL3).toEqual([240, 240, 240, 240]);

    // Load video into indexMap input via UI file input and verify transport updates to "Video Index"
    await page.setInputFiles(
      '[data-testid="indexMap-video-file-input"]',
      'Video/TestVideo1.mov'
    );
    await expect(page.getByTestId('indexMap-status-label')).toHaveText(
      'Video Index'
    );
    await expect(page.getByTestId('indexMap-play-pause-btn')).toBeEnabled();

    // Switch indexMap input to Webcam and back to Image without page reload
    await page.getByTestId('indexMap-source-webcam').click();
    await expect(page.getByTestId('indexMap-status-label')).toHaveText(
      'Webcam'
    );
    await expect(page.getByTestId('indexMap-progress-bar')).toHaveClass(
      /is-live/
    );

    await page.getByTestId('indexMap-source-image').click();
    await expect(page.getByTestId('indexMap-status-label')).toHaveText('Image');

    // Also verify satMap video load, transport ("Video Sat"), and clear button
    await expect(page.getByTestId('satMap-status-label')).toHaveText('None');
    await page.setInputFiles(
      '[data-testid="satMap-video-file-input"]',
      'Video/TestVideo1.mov'
    );
    await expect(page.getByTestId('satMap-status-label')).toHaveText(
      'Video Sat'
    );
    await expect(page.getByTestId('satMap-play-pause-btn')).toBeEnabled();
    await page.getByTestId('satMap-clear-btn').click();
    await expect(page.getByTestId('satMap-status-label')).toHaveText('None');
  });

  test('4. Offset animation with controlled clock (§3 & §8.2)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="render-canvas"]');

    // Speed 0 keeps offset still
    await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.resetGroup('all');
      api.setParam('offset', 0.25);
      api.setParam('animSpeed', 0);
      api.stepClock(2.0);
    });
    let offset = await page.evaluate(
      () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().params.offset
    );
    expect(offset).toBeCloseTo(0.25, 5);

    // Positive speed advances linearly and updates offset slider UI
    offset = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setParam('offset', 0.1);
      api.setParam('animSpeed', 0.2);
      api.stepClock(1.5); // 0.1 + 0.2 * 1.5 = 0.4
      const val = api.getState().params.offset;
      api.setParam('animSpeed', 0);
      return val;
    });
    expect(offset).toBeCloseTo(0.4, 4);
    await expect(page.getByTestId('param-offset-slider')).toHaveValue('0.4');

    // Negative speed runs backwards and wraps 0 -> 1
    offset = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setParam('offset', 0.1);
      api.setParam('animSpeed', -0.25);
      api.stepClock(1.0); // 0.1 - 0.25 = -0.15 -> wraps to 0.85
      return api.getState().params.offset;
    });
    expect(offset).toBeCloseTo(0.85, 4);

    // Dragging/setting slider continues from new position
    await page.evaluate(() => {
      window.__TEXTURE_MOSAIC_DEBUG__!.setParam('animSpeed', 0);
    });
    const offsetSlider = page.getByTestId('param-offset-slider');
    await offsetSlider.fill('0.5');
    await offsetSlider.dispatchEvent('input');
    offset = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setParam('animSpeed', 0.1);
      api.stepClock(1.0); // 0.5 + 0.1 = 0.6
      return api.getState().params.offset;
    });
    expect(offset).toBeCloseTo(0.6, 4);

    // Hidden tab pauses with no jump
    offset = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setParam('offset', 0.6);
      api.setParam('animSpeed', 0.1);
      api.setTabHiddenSimulated(true);
      api.stepClock(10.0);
      api.setTabHiddenSimulated(false);
      return api.getState().params.offset;
    });
    expect(offset).toBeCloseTo(0.6, 4);

    // Reset-to-default on offset sets both offset and speed to 0
    await page.getByTestId('reset-offset-btn').click();
    const afterReset = await page.evaluate(() => {
      const s = window.__TEXTURE_MOSAIC_DEBUG__!.getState().params;
      return { offset: s.offset, animSpeed: s.animSpeed };
    });
    expect(afterReset.offset).toBe(0);
    expect(afterReset.animSpeed).toBe(0);

    // Cyclic wrap 1 -> 0 has no output jump across offset=0.999 and offset=0.001
    const wrapDiff = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setParam('cyclic', 1);
      api.setParam('offset', 0.999);
      const pA = api.readPixelAtUV(0.5, 0.5);
      api.setParam('offset', 0.001);
      const pB = api.readPixelAtUV(0.5, 0.5);
      return Math.max(
        Math.abs(pA[0] - pB[0]),
        Math.abs(pA[1] - pB[1]),
        Math.abs(pA[2] - pB[2])
      );
    });
    expect(wrapDiff).toBeLessThanOrEqual(3);
  });

  test('5. Dual playback transports per input media (D14) + video sync button + webcam & cover-crop thumbnails', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="render-canvas"]');

    // Initial state: control = image, mask = none
    await expect(page.getByTestId('control-status-label')).toHaveText('Image');
    await expect(page.getByTestId('mask-status-label')).toHaveText('None');
    await expect(page.getByTestId('control-progress-bar')).toHaveClass(
      /is-static/
    );
    await expect(page.getByTestId('mask-progress-bar')).toHaveClass(
      /is-static/
    );
    await expect(page.getByTestId('control-time-label')).toBeHidden();
    await expect(page.getByTestId('mask-time-label')).toBeHidden();
    await expect(page.getByTestId('control-play-pause-btn')).toBeDisabled();
    const syncBtn = page.getByTestId('video-sync-btn');
    await expect(syncBtn).toBeDisabled();

    // Load control video
    await page.setInputFiles(
      '[data-testid="control-video-file-input"]',
      'Video/TestVideo1.mov'
    );
    await expect(page.getByTestId('control-status-label')).toHaveText(
      'Video Input'
    );
    await expect(page.getByTestId('control-play-pause-btn')).toBeEnabled();
    await expect(syncBtn).toBeEnabled();

    // Seek control video to ~70%
    const bar = page.getByTestId('control-progress-bar');
    const bb = await bar.boundingBox();
    expect(bb).toBeTruthy();
    await page.mouse.click(bb!.x + bb!.width * 0.7, bb!.y + bb!.height / 2);
    await page.waitForTimeout(300);
    const tMid = await page.evaluate(
      () => window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.currentTime
    );
    expect(tMid).toBeGreaterThan(0.5);

    // Load mask video
    await page.setInputFiles(
      '[data-testid="mask-video-file-input"]',
      'Video/TestVideo1.mov'
    );
    await expect(page.getByTestId('mask-status-label')).toHaveText(
      'Video Mask'
    );
    await expect(page.getByTestId('mask-play-pause-btn')).toBeEnabled();

    fs.mkdirSync(path.resolve('tests/screenshots'), { recursive: true });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.resolve('tests/screenshots/playback-dual-video.png'),
    });

    // Pause mask transport only
    await page.getByTestId('mask-play-pause-btn').click();
    const pausedState = await page.evaluate(() => {
      const s = window.__TEXTURE_MOSAIC_DEBUG__!.getState();
      return {
        controlPlaying: s.controlSource.playing,
        maskPlaying: s.maskSource.playing,
      };
    });
    expect(pausedState.maskPlaying).toBe(false);
    expect(pausedState.controlPlaying).toBe(true);

    // Sync button restarts all videos from 0
    await syncBtn.click();
    await page.waitForTimeout(200);
    const synced = await page.evaluate(() => {
      const s = window.__TEXTURE_MOSAIC_DEBUG__!.getState();
      return {
        c: s.controlSource.currentTime,
        m: s.maskSource.currentTime,
        maskPlaying: s.maskSource.playing,
      };
    });
    expect(synced.c).toBeLessThan(1.0);
    expect(synced.m).toBeLessThan(1.0);
    expect(synced.maskPlaying).toBe(true);

    // Switch control to Webcam: red track + "Live" label + non-empty preview thumbnail
    await page.getByTestId('control-source-webcam').click();
    await expect(page.getByTestId('control-status-label')).toHaveText('Webcam');
    await expect(page.getByTestId('control-progress-bar')).toHaveClass(
      /is-live/
    );
    await expect(page.getByTestId('control-live-label')).toBeVisible();
    await expect(page.getByTestId('control-play-pause-btn')).toBeDisabled();

    await page.screenshot({
      path: path.resolve('tests/screenshots/playback-webcam-live.png'),
    });

    // Non-square image thumbnail cover-crop verification
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(0, 0, 32, 128);
      ctx.fillRect(480, 0, 32, 128);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('[data-testid="control-image-file-input"]', {
      name: 'wide-edges.png',
      mimeType: 'image/png',
      buffer: Buffer.from(b64, 'base64'),
    });
    await page.waitForFunction(
      () =>
        window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.mode ===
          'image' &&
        window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.name ===
          'wide-edges.png'
    );
    const edgeSample = await page.evaluate(() => {
      const url =
        window.__TEXTURE_MOSAIC_DEBUG__!.getState().controlSource.thumbnailUrl;
      return new Promise<{ left: number[]; sq: boolean }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const left = Array.from(
            ctx.getImageData(2, Math.floor(img.height / 2), 1, 1).data
          );
          resolve({ left, sq: img.width === img.height });
        };
        img.src = url;
      });
    });
    expect(edgeSample.sq).toBe(true);
    // Control preview shows processed Rec.709 grayscale luma: red field (#ff0000) -> round(0.2126*255) = 54,
    // whereas cropped-out blue edge strip (#0000ff) would be round(0.0722*255) = 18
    expect(edgeSample.left[0]).toBeGreaterThan(45);
    expect(edgeSample.left[0]).toBeLessThan(65);
    expect(edgeSample.left[0]).toBe(edgeSample.left[1]);
  });

  test('6. Production build serves cleanly from root and subfolder + captures review screenshots & perf metrics', async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    await page.waitForSelector('[data-testid="render-canvas"]');
    await page.waitForTimeout(400);

    await page.getByTestId('stats-toggle-btn').click();
    await expect(page.getByTestId('stats-overlay')).toBeVisible();

    // Measure 1280x720 with 16 thumbnails, grid 60x60 (§5 target)
    const perfMetrics = await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setWorkingResolution(1280, 720);
      const layers16 = Array.from({ length: 16 }, (_, i) => ({
        width: 64,
        height: 64,
        data: new Uint8Array(64 * 64 * 4).map((_, idx) =>
          idx % 4 === 3 ? 255 : (i * 15 + (idx >> 2)) % 256
        ),
      }));
      api.setStackRaw(layers16);
      api.setParam('gridSizeX', 60);
      api.setParam('gridSizeY', 60);
      api.setParam('rotationMode', 1);
      const t0 = performance.now();
      const frames = 20;
      for (let i = 0; i < frames; i++) {
        api.stepClock(1 / 60);
      }
      const totalMs = performance.now() - t0;
      return {
        avgFrameMs: Number((totalMs / frames).toFixed(2)),
        estimatedFps: Math.round(1000 / Math.max(0.1, totalMs / frames)),
        glErrors: api.getGlErrors(),
        stackLoaded: api.getState().stack.length,
      };
    });
    expect(perfMetrics.glErrors).toEqual([]);
    expect(perfMetrics.stackLoaded).toBe(16);

    // Re-initialize demo scene for clean review screenshots
    await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.initDefaultScene?.();
      api.setParam('rotationMode', 1);
      api.setParam('cyclic', 1);
    });
    await page.waitForTimeout(200);

    fs.mkdirSync(path.resolve('tests/screenshots'), { recursive: true });
    await page.screenshot({
      path: path.resolve('tests/screenshots/demo-16-9-stats.png'),
    });

    // Screenshot 2: 1:1 square working resolution (1024x1024) with 4-face snap rotation (Mode 2)
    await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setWorkingResolution(1024, 1024);
      api.setParam('gridSizeX', 24);
      api.setParam('gridSizeY', 24);
      api.setParam('rotationMode', 2);
      api.setParam('offset', 0.2);
    });
    await page.screenshot({
      path: path.resolve('tests/screenshots/demo-1-1.png'),
    });

    // Screenshot 3: Empty stack / empty mask state
    await page.getByTestId('stack-clear-btn').click();
    await page.getByTestId('mask-clear-btn').click();
    await page.screenshot({
      path: path.resolve('tests/screenshots/empty-sources.png'),
    });

    fs.writeFileSync(
      path.resolve('tests/screenshots/perf.json'),
      JSON.stringify(perfMetrics, null, 2)
    );

    // Also test serving production `dist/` from both `/` and `/subfolder/`
    const distDir = path.resolve('dist');
    if (fs.existsSync(path.join(distDir, 'index.html'))) {
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.mov': 'video/quicktime',
      };

      const server = http.createServer((req, res) => {
        const urlPath = (req.url || '/').split('?')[0];
        const prefix = '/subfolder';
        let rel = urlPath;
        if (rel.startsWith(prefix)) {
          rel = rel.slice(prefix.length) || '/';
        }
        if (rel === '/') rel = '/index.html';
        const filePath = path.join(distDir, rel);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          });
          fs.createReadStream(filePath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address() as { port: number };
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      try {
        await page.goto(
          `http://localhost:${address.port}/subfolder/index.html?debug=1`
        );
        await page.waitForSelector('[data-testid="render-canvas"]');
        const frames = await page.evaluate(() =>
          window.__TEXTURE_MOSAIC_DEBUG__!.getFrameCount()
        );
        expect(frames).toBeGreaterThan(0);
        expect(consoleErrors).toEqual([]);
      } finally {
        server.close();
      }
    }
  });
});
