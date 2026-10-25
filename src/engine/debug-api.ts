import { TextureMosaicEngine } from './state';
import { TextureMosaicDebugAPI } from './types';

export function installDebugAPI(
  engine: TextureMosaicEngine
): TextureMosaicDebugAPI {
  const api: TextureMosaicDebugAPI = {
    getState: () => engine.getState(),
    setParam: (key, value) => engine.setParam(key, value),
    resetParam: (key) => engine.resetParam(key),
    resetGroup: (group) => engine.resetGroup(group),
    initDefaultScene: () => engine.initDefaultScene(),
    setWorkingResolution: (w, h) => engine.setWorkingResolution(w, h),
    setControlRaw: (tex, name) => engine.setControlRaw(tex, name),
    setIndexMapRaw: (tex, name) => engine.setIndexMapRaw(tex, name),
    setMaskRaw: (tex, name) => engine.setMaskRaw(tex, name),
    setStackRaw: (layers, names) => engine.setStackRaw(layers, names),
    setIndexMapsRaw: (maps) => engine.setIndexMapsRaw(maps),
    getIndexMapsRaw: () => engine.getIndexMapsRaw(),
    loadStackImageWithAlpha: (w, h, rgba, name) =>
      engine.loadStackImageWithAlpha(w, h, rgba, name),
    removeStackLayer: (index) => engine.removeStackLayer(index),
    reorderStackLayer: (from, to) => engine.reorderStackLayer(from, to),
    clearMask: () => engine.clearMask(),
    stepClock: (dt) => engine.stepClock(dt),
    setTabHiddenSimulated: (hidden) => engine.setTabHiddenSimulated(hidden),
    renderNow: () => engine.renderNow(),
    readPixels: (x, y, w, h) => engine.pipeline.readPixelsTopDown(x, y, w, h),
    readPixelAtUV: (u, v) => {
      const { width, height } = engine.pipeline.getWorkingResolution();
      const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
      const buf = engine.pipeline.readPixelsTopDown(x, y, 1, 1);
      return [buf[0], buf[1], buf[2], buf[3]];
    },
    getFrameCount: () => engine.getState().frameCount,
    getGlErrors: () => engine.pipeline.drainGlErrors(),
    triggerError: (message) => engine.addError(message),
    clearErrors: () => engine.clearErrors(),
    captureSnapshotDataUrl: () => engine.captureSnapshotDataUrl(),
  };

  window.__TEXTURE_MOSAIC_DEBUG__ = api;
  window.__TEXTURE_STACK_DEBUG__ = api;
  return api;
}
