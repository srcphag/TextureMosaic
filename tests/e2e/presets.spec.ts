import { expect, test } from '@playwright/test';

test.describe('TextureMosaic — Full-Scene JSON Presets', () => {
  test('repo presets appear in the dropdown and load from the repo', async ({
    page,
  }) => {
    await page.goto('/');
    const select = page.locator('[data-testid="preset-select"]');
    await expect(select).toBeVisible();

    // The repository `presets/demo-mosaic.json` must be auto-discovered.
    const demoOption = select.locator('option', { hasText: 'demo-mosaic' });
    await expect(demoOption).toHaveCount(1);

    // Select it: full scene (params + 25 stack layers + control image) loads.
    await select.selectOption({ label: 'demo-mosaic' });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const s = window.__TEXTURE_MOSAIC_DEBUG__!.getState();
          return {
            rot: s.params.rotationMode,
            cyclic: s.params.cyclic,
            layers: s.stack.length,
            controlMode: s.controlSource.mode,
            w: s.workingWidth,
            h: s.workingHeight,
          };
        })
      )
      .toEqual({
        rot: 1,
        cyclic: 1,
        layers: 25,
        controlMode: 'image',
        w: 1280,
        h: 720,
      });

    // Selecting a preset syncs the name input.
    await expect(
      page.locator('[data-testid="preset-name-input"]')
    ).toHaveValue('demo-mosaic');
  });

  test('save → reset → import round-trip restores params, resolution, stack and media', async ({
    page,
  }) => {
    await page.goto('/');

    const before = await page.evaluate(async () => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.setParam('gridSizeX', 123);
      api.setParam('gridSizeY', 45);
      api.setParam('rotationMode', 2);
      api.setParam('satMin', 1.5);
      api.setParam('contrast', 2.25);
      api.setWorkingResolution(640, 360);
      api.renderNow();
      return {
        preset: await api.exportPreset('roundtrip'),
        state: api.getState(),
        px: api.readPixelAtUV(0.5, 0.5),
      };
    });

    // Mutate the scene so the import must actually restore it.
    await page.evaluate(() => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.resetGroup('all');
      api.setWorkingResolution(1280, 720);
      api.clearErrors();
    });

    const after = await page.evaluate(
      async (preset) => {
        const api = window.__TEXTURE_MOSAIC_DEBUG__!;
        const ok = await api.importPreset(preset);
        api.renderNow();
        return { ok, state: api.getState(), px: api.readPixelAtUV(0.5, 0.5) };
      },
      before.preset as unknown as Record<string, unknown>
    );

    expect(after.ok).toBe(true);
    expect(after.state.workingWidth).toBe(640);
    expect(after.state.workingHeight).toBe(360);
    expect(after.state.params.gridSizeX).toBe(123);
    expect(after.state.params.gridSizeY).toBe(45);
    expect(after.state.params.rotationMode).toBe(2);
    expect(after.state.params.satMin).toBeCloseTo(1.5, 5);
    expect(after.state.params.contrast).toBeCloseTo(2.25, 5);
    expect(after.state.stack.length).toBe(before.state.stack.length);
    expect(after.state.controlSource.mode).toBe(
      before.state.controlSource.mode
    );
    expect(after.state.indexMapSource.mode).toBe(
      before.state.indexMapSource.mode
    );
    // PNG-embedded media is lossless → identical rendered pixels.
    for (let c = 0; c < 4; c++) {
      expect(
        Math.abs(after.px[c] - before.px[c]),
        `pixel channel ${c}`
      ).toBeLessThanOrEqual(3);
    }
  });

  test('importing an invalid JSON preset shows an error toast and keeps the scene', async ({
    page,
  }) => {
    await page.goto('/');

    const ok = await page.evaluate(async () => {
      const api = window.__TEXTURE_MOSAIC_DEBUG__!;
      api.clearErrors();
      return api.importPreset({ hello: 'world' });
    });
    expect(ok).toBe(false);

    await expect(
      page.locator('[data-testid="error-toast"]').first()
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="error-message"]').first()
    ).toContainText(/not a TextureMosaic preset/i);
  });

  test('save button adds the preset to the dropdown', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="preset-name-input"]').fill('my-look');
    // Prevent the browser download from interrupting the test.
    await page.evaluate(() => {
      const orig = HTMLAnchorElement.prototype.click;
      (window as unknown as { __restoreClick: () => void }).__restoreClick =
        () => {
          HTMLAnchorElement.prototype.click = orig;
        };
      HTMLAnchorElement.prototype.click = () => {};
    });
    await page.locator('[data-testid="preset-save-btn"]').click();
    await expect(
      page.locator('[data-testid="preset-select"] option', {
        hasText: 'my-look',
      })
    ).toHaveCount(1);
    await page.evaluate(() =>
      (window as unknown as { __restoreClick: () => void }).__restoreClick()
    );
  });
});
