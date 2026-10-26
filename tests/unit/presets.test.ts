import { describe, expect, it } from 'vitest';
import {
  dataUrlToBlob,
  listRepoPresets,
  validatePreset,
} from '../../src/engine/presets';
import { DEFAULT_SHADER_PARAMS } from '../../src/engine/types';

function makeValidPreset(): Record<string, unknown> {
  return {
    version: 1,
    app: 'TextureMosaic',
    name: 'unit-test',
    createdAt: new Date().toISOString(),
    workingWidth: 640,
    workingHeight: 360,
    params: { ...DEFAULT_SHADER_PARAMS },
    slots: {
      control: { mode: 'noise', name: 'Perlin Noise', width: 256, height: 256 },
      indexMap: {
        mode: 'noise',
        name: 'Perlin Noise',
        width: 256,
        height: 256,
      },
      satMap: { mode: 'none', name: '', width: 0, height: 0 },
      mask: { mode: 'none', name: '', width: 0, height: 0 },
    },
    stack: [],
  };
}

describe('validatePreset', () => {
  it('accepts a valid minimal preset', () => {
    const preset = validatePreset(makeValidPreset());
    expect(preset.version).toBe(1);
    expect(preset.workingWidth).toBe(640);
    expect(preset.stack).toEqual([]);
  });

  it('rejects non-objects and wrong app marker', () => {
    expect(() => validatePreset(null)).toThrow(/not a valid JSON object/);
    expect(() => validatePreset('nope')).toThrow(/not a valid JSON object/);
    expect(() =>
      validatePreset({ ...makeValidPreset(), app: 'OtherApp' })
    ).toThrow(/not a TextureMosaic preset/);
  });

  it('rejects unsupported versions', () => {
    expect(() => validatePreset({ ...makeValidPreset(), version: 2 })).toThrow(
      /Unsupported preset version/
    );
  });

  it('rejects invalid canvas sizes', () => {
    expect(() =>
      validatePreset({ ...makeValidPreset(), workingWidth: 0 })
    ).toThrow(/invalid canvas size/);
    expect(() =>
      validatePreset({ ...makeValidPreset(), workingHeight: 99999 })
    ).toThrow(/invalid canvas size/);
    expect(() =>
      validatePreset({ ...makeValidPreset(), workingWidth: 'wide' })
    ).toThrow(/invalid canvas size/);
  });

  it('rejects missing params / slots / stack', () => {
    expect(() =>
      validatePreset({ ...makeValidPreset(), params: null })
    ).toThrow(/shader parameters/);
    expect(() => validatePreset({ ...makeValidPreset(), slots: {} })).toThrow(
      /slot "control"/
    );
    expect(() =>
      validatePreset({ ...makeValidPreset(), stack: 'none' })
    ).toThrow(/texture stack/);
  });

  it('rejects slots with invalid mode or missing media payload', () => {
    const bad1 = makeValidPreset();
    (bad1.slots as Record<string, unknown>).control = { mode: 'hologram' };
    expect(() => validatePreset(bad1)).toThrow(/invalid mode/);

    const bad2 = makeValidPreset();
    (bad2.slots as Record<string, unknown>).mask = {
      mode: 'image',
      name: 'm.png',
    };
    expect(() => validatePreset(bad2)).toThrow(/embedded media data/);
  });

  it('rejects stack layers without image data', () => {
    const bad = makeValidPreset();
    bad.stack = [{ name: 'layer.png', width: 4, height: 4 }];
    expect(() => validatePreset(bad)).toThrow(/stack layer #1/);
  });
});

describe('dataUrlToBlob', () => {
  it('decodes a base64 data URL preserving MIME type and bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(bytes.length);
  });

  it('throws on malformed data URLs', () => {
    expect(() => dataUrlToBlob('not-a-data-url')).toThrow(/Malformed/);
  });
});

describe('listRepoPresets', () => {
  it('discovers .json preset files from the repository presets/ folder', () => {
    const entries = listRepoPresets();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.id === 'demo-mosaic')).toBe(true);
    for (const e of entries) {
      expect(e.url).toBeTruthy();
    }
  });
});
