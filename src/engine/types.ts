export const MAX_STACK_LAYERS = 32;
export const DEFAULT_WORKING_WIDTH = 1280;
export const DEFAULT_WORKING_HEIGHT = 720;

export type SourceMode = 'none' | 'image' | 'video' | 'webcam' | 'noise';

export type MediaSlotTarget = 'control' | 'indexMap' | 'satMap' | 'mask';

export type ParamGroup =
  | 'grid'
  | 'rotation'
  | 'noise'
  | 'shader'
  | 'control'
  | 'saturation'
  | 'mask'
  | 'animation'
  | 'all';

export interface ShaderParams {
  /** Base grid columns 4..240 (default: 60) -> uGridSize.x */
  gridSizeX: number;
  /** Base grid rows 4..240 (default: 60) -> uGridSize.y */
  gridSizeY: number;
  /** Size contrast between L0 and L3: factor = mult^L, 1.5..4 (default: 2) -> uSubdivMultiplier */
  subdivMultiplier: number;
  /** 0 = off, 1 = continuous radial to apex, 2 = 4-face 90deg snap (default: 0) -> uRotationMode */
  rotationMode: number;
  /** Apex center X in UV 0..1 (default: 0.5) -> uApexUV.x */
  apexX: number;
  /** Apex center Y in UV 0..1 (default: 0.5) -> uApexUV.y */
  apexY: number;
  /** Perlin noise base frequency / scale 0.5..32 (default: 6) */
  noiseScale: number;
  /** Perlin noise octave count / detail 1..8 (default: 4) */
  noiseDetail: number;
  /** Perlin noise contrast around 0.5, 0..4 (default: 1) */
  noiseContrast: number;
  /** 1..loaded (default: all loaded images, min 1) -> uNumImages */
  numImages: number;
  /** 0 = hard switch (from only), 1 = mix(from, to, t) (default: 1) -> uSmoothBlend */
  smoothBlend: number;
  /** 1 = normalized 0..1 index maps (app default), 0 = raw integer indices -> uIndexIsNormalized */
  indexIsNormalized: number;
  /** 0..4, 1 = unchanged, 0 = flat grey (default: 1) -> uContrast */
  contrast: number;
  /** 0..1 luminance offset (default: 0) -> uOffset */
  offset: number;
  /** -1..1 full sweeps per second (default: 0) */
  animSpeed: number;
  /** 0 = clamp, 1 = cyclic wrap 0->1->2->3->0 (default: 0) -> uCyclic */
  cyclic: number;
  /** 0 = normal, 1 = invert control RGB before contrast/luma (default: 0) -> uInvertControl */
  invertControl: number;
  /** 0..5 saturation multiplier where satMap = 0 (default: 0) -> uMinSaturation */
  satMin: number;
  /** 0..5 saturation multiplier where satMap = 1 (default: 5) -> uMaxSaturation */
  satMax: number;
  /** 0..1 mask influence (default: 0 when no mask, 1 when mask loaded) -> uMaskInfluence */
  maskInfluence: number;
  /** 0 = normal, 1 = invert mask (default: 0) -> uInvertMask */
  invertMask: number;
  /** 0..1 mask min remap threshold (default: 0) -> uMaskMin */
  maskMin: number;
  /** 0..1 mask max remap threshold (default: 1) -> uMaskMax */
  maskMax: number;
}

export const DEFAULT_SHADER_PARAMS: Readonly<ShaderParams> = {
  gridSizeX: 60,
  gridSizeY: 60,
  subdivMultiplier: 2,
  rotationMode: 0,
  apexX: 0.5,
  apexY: 0.5,
  noiseScale: 6,
  noiseDetail: 4,
  noiseContrast: 1,
  numImages: 1,
  smoothBlend: 1,
  indexIsNormalized: 1,
  contrast: 1,
  offset: 0,
  animSpeed: 0,
  cyclic: 0,
  invertControl: 0,
  satMin: 0,
  satMax: 5,
  maskInfluence: 0,
  invertMask: 0,
  maskMin: 0,
  maskMax: 1,
};

export interface StackLayerItem {
  id: string;
  name: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  /** Pre-flattened (opaque RGBA8) cover-fitted pixel buffer at working resolution */
  rgbaData?: Uint8Array;
  /** Original drawable source so re-fitting on working resolution change stays crisp */
  sourceElement?: HTMLImageElement | HTMLCanvasElement;
}

export interface MediaSourceState {
  mode: SourceMode;
  name: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  playing: boolean;
  currentTime: number;
  duration: number;
}

export interface AppError {
  id: string;
  message: string;
  timestamp: number;
}

export interface AppState {
  params: ShaderParams;
  workingWidth: number;
  workingHeight: number;
  stack: StackLayerItem[];
  controlSource: MediaSourceState;
  indexMapSource: MediaSourceState;
  satMapSource: MediaSourceState;
  maskSource: MediaSourceState;
  hasSatMap: boolean;
  hasMask: boolean;
  errors: AppError[];
  statsVisible: boolean;
  fps: number;
  frameTimeMs: number;
  frameCount: number;
}

export interface RawTextureInput {
  width: number;
  height: number;
  /** RGBA8 row-major top-to-bottom (4 bytes per pixel) */
  data: Uint8Array | Uint8ClampedArray;
}

export type IndexMapsQuad = [
  RawTextureInput,
  RawTextureInput,
  RawTextureInput,
  RawTextureInput,
];

export interface TextureMosaicDebugAPI {
  getState(): AppState;
  setParam<K extends keyof ShaderParams>(key: K, value: ShaderParams[K]): void;
  resetParam(key: keyof ShaderParams): void;
  resetGroup(group: ParamGroup): void;
  initDefaultScene(): void;
  activateSlotMode(target: MediaSlotTarget, mode: SourceMode): boolean;
  setWorkingResolution(width: number, height: number): void;
  setControlRaw(tex: RawTextureInput, name?: string): void;
  setIndexMapRaw(tex: RawTextureInput, name?: string): void;
  setSatMapRaw(tex: RawTextureInput | null, name?: string): void;
  setMaskRaw(tex: RawTextureInput | null, name?: string): void;
  setStackRaw(layers: RawTextureInput[], names?: string[]): void;
  setIndexMapsRaw(maps: IndexMapsQuad): void;
  getIndexMapsRaw(): IndexMapsQuad;
  loadStackImageWithAlpha(
    width: number,
    height: number,
    rgba: Uint8Array,
    name?: string
  ): void;
  removeStackLayer(index: number): void;
  reorderStackLayer(fromIndex: number, toIndex: number): void;
  clearSatMap(): void;
  clearMask(): void;
  stepClock(dtSeconds: number): void;
  setTabHiddenSimulated(hidden: boolean): void;
  renderNow(): void;
  readPixels(x?: number, y?: number, width?: number, height?: number): Uint8Array;
  readPixelAtUV(u: number, v: number): [number, number, number, number];
  getFrameCount(): number;
  getGlErrors(): number[];
  triggerError(message: string): void;
  clearErrors(): void;
  captureSnapshotDataUrl(): string;
}

declare global {
  interface Window {
    __TEXTURE_MOSAIC_DEBUG__?: TextureMosaicDebugAPI;
    __TEXTURE_STACK_DEBUG__?: TextureMosaicDebugAPI;
  }
}
