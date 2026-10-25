import { AnimationClock, advanceOffsetLinear } from './clock';
import {
  makeDemoControlTexture,
  makeDemoIndexMapTexture,
  makeDistinctStackLayers,
  rawTextureToThumbnailUrl,
} from './fixtures';
import { WebGLPipeline } from './gl-pipeline';
import { generatePerlinNoiseTexture } from './noise';
import { SlotPreviewRenderer } from './previews';
import {
  AppError,
  AppState,
  DEFAULT_SHADER_PARAMS,
  DEFAULT_WORKING_HEIGHT,
  DEFAULT_WORKING_WIDTH,
  IndexMapsQuad,
  MAX_STACK_LAYERS,
  MediaSlotTarget,
  MediaSourceState,
  ParamGroup,
  RawTextureInput,
  ShaderParams,
  SourceMode,
} from './types';

const NOISE_TEXTURE_SIZE = 256;

interface StoredSlotMedia {
  imageElement: HTMLImageElement | HTMLCanvasElement | null;
  imageRaw: RawTextureInput | null;
  imageName: string;
  imageBaseRgba: Uint8ClampedArray | null;

  videoElement: HTMLVideoElement | null;
  videoUrl: string | null;
  videoName: string;
  videoBaseRgba: Uint8ClampedArray | null;

  webcamVideo: HTMLVideoElement | null;
  webcamStream: MediaStream | null;
  webcamBaseRgba: Uint8ClampedArray | null;
}

function createEmptySlotMedia(): StoredSlotMedia {
  return {
    imageElement: null,
    imageRaw: null,
    imageName: '',
    imageBaseRgba: null,
    videoElement: null,
    videoUrl: null,
    videoName: '',
    videoBaseRgba: null,
    webcamVideo: null,
    webcamStream: null,
    webcamBaseRgba: null,
  };
}

function createEmptyMediaSourceState(): MediaSourceState {
  return {
    mode: 'none',
    name: '',
    width: 0,
    height: 0,
    thumbnailUrl: '',
    playing: false,
    currentTime: 0,
    duration: 0,
  };
}

export class TextureMosaicEngine {
  public readonly pipeline: WebGLPipeline;
  private readonly clock: AnimationClock = new AnimationClock();
  private readonly previewRenderer: SlotPreviewRenderer =
    new SlotPreviewRenderer(96);

  private state: AppState;
  private listeners: Set<(state: AppState) => void> = new Set();

  private controlMedia: StoredSlotMedia = createEmptySlotMedia();
  private indexMapMedia: StoredSlotMedia = createEmptySlotMedia();
  private satMapMedia: StoredSlotMedia = createEmptySlotMedia();
  private maskMedia: StoredSlotMedia = createEmptySlotMedia();

  private currentNoiseTex: RawTextureInput;
  private currentNoiseBaseRgba: Uint8ClampedArray;

  private activeIndexMaps: IndexMapsQuad;

  private rafId: number | null = null;
  private lastFrameRenderMs = performance.now();
  private lastLivePreviewMs = 0;
  private smoothedFps = 60;
  private smoothedFrameMs = 16.7;
  private nextIdCounter = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.pipeline = new WebGLPipeline(canvas);
    const defaultIdxTex = makeDemoIndexMapTexture(64, 64);
    this.activeIndexMaps = [
      defaultIdxTex,
      defaultIdxTex,
      defaultIdxTex,
      defaultIdxTex,
    ];

    this.currentNoiseTex = generatePerlinNoiseTexture(
      NOISE_TEXTURE_SIZE,
      NOISE_TEXTURE_SIZE,
      DEFAULT_SHADER_PARAMS.noiseScale,
      DEFAULT_SHADER_PARAMS.noiseDetail,
      DEFAULT_SHADER_PARAMS.noiseContrast
    );
    this.currentNoiseBaseRgba =
      this.previewRenderer.captureBaseSquareRGBAFromRaw(this.currentNoiseTex);

    this.state = {
      params: { ...DEFAULT_SHADER_PARAMS },
      workingWidth: DEFAULT_WORKING_WIDTH,
      workingHeight: DEFAULT_WORKING_HEIGHT,
      stack: [],
      controlSource: createEmptyMediaSourceState(),
      indexMapSource: createEmptyMediaSourceState(),
      satMapSource: createEmptyMediaSourceState(),
      maskSource: createEmptyMediaSourceState(),
      hasSatMap: false,
      hasMask: false,
      errors: [],
      statsVisible: false,
      fps: 0,
      frameTimeMs: 0,
      frameCount: 0,
    };

    this.pipeline.uploadIndexMaps(this.activeIndexMaps);

    document.addEventListener('visibilitychange', () => {
      this.clock.setHidden(document.visibilityState === 'hidden');
      this.ensureLoopState();
    });
  }

  private genId(prefix: string): string {
    return `${prefix}_${this.nextIdCounter++}`;
  }

  private getSlotMedia(target: MediaSlotTarget): StoredSlotMedia {
    if (target === 'control') return this.controlMedia;
    if (target === 'indexMap') return this.indexMapMedia;
    if (target === 'satMap') return this.satMapMedia;
    return this.maskMedia;
  }

  private getSlotSourceState(target: MediaSlotTarget): MediaSourceState {
    if (target === 'control') return this.state.controlSource;
    if (target === 'indexMap') return this.state.indexMapSource;
    if (target === 'satMap') return this.state.satMapSource;
    return this.state.maskSource;
  }

  /**
   * Re-compute the processed preview thumbnail data URL for `target` using the current shader parameters.
   */
  private refreshSlotPreviewThumbnail(
    target: MediaSlotTarget,
    recaptureVideoFrame: boolean = false
  ): void {
    const srcState = this.getSlotSourceState(target);
    const slot = this.getSlotMedia(target);

    if (srcState.mode === 'none') {
      srcState.thumbnailUrl = '';
      return;
    }

    let baseRgba: Uint8ClampedArray | null = null;
    if (srcState.mode === 'noise') {
      baseRgba = this.currentNoiseBaseRgba;
    } else if (srcState.mode === 'image') {
      baseRgba = slot.imageBaseRgba;
    } else if (srcState.mode === 'video') {
      if (recaptureVideoFrame && slot.videoElement && slot.videoElement.readyState >= 2) {
        slot.videoBaseRgba =
          this.previewRenderer.captureBaseSquareRGBAFromElement(
            slot.videoElement,
            slot.videoElement.videoWidth || 320,
            slot.videoElement.videoHeight || 180
          );
      }
      baseRgba = slot.videoBaseRgba;
    } else if (srcState.mode === 'webcam') {
      if (recaptureVideoFrame && slot.webcamVideo && slot.webcamVideo.readyState >= 2) {
        slot.webcamBaseRgba =
          this.previewRenderer.captureBaseSquareRGBAFromElement(
            slot.webcamVideo,
            slot.webcamVideo.videoWidth || 640,
            slot.webcamVideo.videoHeight || 480
          );
      }
      baseRgba = slot.webcamBaseRgba;
    }

    if (baseRgba) {
      srcState.thumbnailUrl = this.previewRenderer.processedRGBAToDataUrl(
        target,
        baseRgba,
        this.state.params
      );
    }
  }

  /**
   * Regenerate the shared Perlin noise texture from current `noiseScale`, `noiseDetail`, `noiseContrast`
   * and re-upload to any slot currently in `'noise'` mode.
   */
  private regenerateNoiseSource(): void {
    const p = this.state.params;
    this.currentNoiseTex = generatePerlinNoiseTexture(
      NOISE_TEXTURE_SIZE,
      NOISE_TEXTURE_SIZE,
      p.noiseScale,
      p.noiseDetail,
      p.noiseContrast
    );
    this.currentNoiseBaseRgba =
      this.previewRenderer.captureBaseSquareRGBAFromRaw(this.currentNoiseTex);

    const targets: MediaSlotTarget[] = [
      'control',
      'indexMap',
      'satMap',
      'mask',
    ];
    for (const target of targets) {
      const src = this.getSlotSourceState(target);
      if (src.mode === 'noise') {
        this.uploadSlotRawToPipeline(target, this.currentNoiseTex);
        this.refreshSlotPreviewThumbnail(target);
      }
    }
  }

  public subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getState();
    for (const fn of this.listeners) {
      fn(snap);
    }
  }

  public getState(): AppState {
    return {
      ...this.state,
      params: { ...this.state.params },
      stack: [...this.state.stack],
      controlSource: { ...this.state.controlSource },
      indexMapSource: { ...this.state.indexMapSource },
      satMapSource: { ...this.state.satMapSource },
      maskSource: { ...this.state.maskSource },
      errors: [...this.state.errors],
    };
  }

  public addError(message: string): void {
    const err: AppError = {
      id: this.genId('err'),
      message,
      timestamp: Date.now(),
    };
    this.state.errors = [err, ...this.state.errors].slice(0, 5);
    this.emit();
  }

  public dismissError(id: string): void {
    this.state.errors = this.state.errors.filter((e) => e.id !== id);
    this.emit();
  }

  public clearErrors(): void {
    this.state.errors = [];
    this.emit();
  }

  public toggleStats(visible?: boolean): void {
    this.state.statsVisible =
      visible !== undefined ? visible : !this.state.statsVisible;
    this.emit();
  }

  public setIndexMapsRaw(maps: IndexMapsQuad): void {
    this.activeIndexMaps = [
      { width: maps[0].width, height: maps[0].height, data: new Uint8Array(maps[0].data) },
      { width: maps[1].width, height: maps[1].height, data: new Uint8Array(maps[1].data) },
      { width: maps[2].width, height: maps[2].height, data: new Uint8Array(maps[2].data) },
      { width: maps[3].width, height: maps[3].height, data: new Uint8Array(maps[3].data) },
    ];
    this.pipeline.uploadIndexMaps(this.activeIndexMaps);
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public getIndexMapsRaw(): IndexMapsQuad {
    const m = this.activeIndexMaps;
    return [
      { width: m[0].width, height: m[0].height, data: new Uint8Array(m[0].data) },
      { width: m[1].width, height: m[1].height, data: new Uint8Array(m[1].data) },
      { width: m[2].width, height: m[2].height, data: new Uint8Array(m[2].data) },
      { width: m[3].width, height: m[3].height, data: new Uint8Array(m[3].data) },
    ];
  }

  /**
   * Initialize default procedural scene (or `?demo=1` scene).
   */
  public initDefaultScene(): void {
    const ctrl = makeDemoControlTexture(256, 256);
    this.setControlRaw(ctrl, 'default_control_gradient.png');

    const idxMap = makeDemoIndexMapTexture(128, 128);
    this.setIndexMapRaw(idxMap, 'default_index_map.png');

    this.clearSatMap();

    const layers = makeDistinctStackLayers(
      6,
      this.state.workingWidth,
      this.state.workingHeight
    );
    this.setStackRaw(
      layers.map((l) => l.tex),
      layers.map((l) => l.name)
    );
  }

  /**
   * Load demo assets from `/demo/manifest.json` if present, or fall back to rich generated demo scene.
   */
  public async loadDemoScene(): Promise<void> {
    this.initDefaultScene();
    this.setParam('animSpeed', 0.15);
    this.setParam('cyclic', 1);
    this.setParam('rotationMode', 1);

    try {
      const resp = await fetch('./demo/manifest.json');
      if (resp.ok) {
        const manifest = (await resp.json()) as {
          controlImage?: string;
          controlVideo?: string;
          indexMapImage?: string;
          indexMapVideo?: string;
          satMapImage?: string;
          maskImage?: string;
          stackImages?: string[];
        };
        if (manifest.stackImages && manifest.stackImages.length > 0) {
          const imgs: { img: HTMLImageElement; name: string }[] = [];
          for (const rel of manifest.stackImages.slice(0, MAX_STACK_LAYERS)) {
            try {
              const img = await this.loadImageFromUrl(rel);
              const name = rel.split('/').pop() || rel;
              imgs.push({ img, name });
            } catch {
              // ignore missing optional demo image
            }
          }
          if (imgs.length > 0) {
            this.replaceStackWithImageElements(imgs);
          }
        }
        if (manifest.controlImage) {
          try {
            const img = await this.loadImageFromUrl(manifest.controlImage);
            this.setSlotImageElement(
              'control',
              img,
              manifest.controlImage.split('/').pop() || 'control.jpg'
            );
          } catch {
            // keep default control
          }
        }
        if (manifest.controlVideo) {
          try {
            await this.setSlotVideoUrl(
              'control',
              manifest.controlVideo,
              manifest.controlVideo.split('/').pop() || 'control.mp4',
              false
            );
          } catch {
            // optional
          }
        }
      }
    } catch {
      // Procedural demo already active
    }
  }

  private loadImageFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  public setParam<K extends keyof ShaderParams>(
    key: K,
    value: ShaderParams[K]
  ): void {
    let v = Number(value);
    if (Number.isNaN(v)) return;

    let regenNoise = false;
    let refreshControlThumb = false;
    let refreshSatThumb = false;
    let refreshMaskThumb = false;

    switch (key) {
      case 'gridSizeX':
      case 'gridSizeY':
        v = Math.max(4, Math.min(240, v));
        break;
      case 'subdivMultiplier':
        v = Math.max(1.5, Math.min(4, v));
        break;
      case 'rotationMode':
        v = Math.max(0, Math.min(2, Math.round(v)));
        break;
      case 'apexX':
      case 'apexY':
        v = Math.max(0, Math.min(1, v));
        break;
      case 'noiseScale':
        v = Math.max(0.5, Math.min(32, v));
        regenNoise = true;
        break;
      case 'noiseDetail':
        v = Math.max(1, Math.min(8, Math.round(v)));
        regenNoise = true;
        break;
      case 'noiseContrast':
        v = Math.max(0, Math.min(4, v));
        regenNoise = true;
        break;
      case 'numImages': {
        const maxImgs = Math.max(1, this.state.stack.length);
        v = Math.max(1, Math.min(maxImgs, Math.round(v)));
        break;
      }
      case 'smoothBlend':
      case 'indexIsNormalized':
        v = v >= 0.5 ? 1 : 0;
        break;
      case 'cyclic':
      case 'invertControl':
        v = v >= 0.5 ? 1 : 0;
        refreshControlThumb = true;
        break;
      case 'contrast':
        v = Math.max(0, Math.min(4, v));
        refreshControlThumb = true;
        break;
      case 'offset':
        v = Math.max(0, Math.min(1, v));
        refreshControlThumb = true;
        break;
      case 'animSpeed':
        v = Math.max(-1, Math.min(1, v));
        this.clock.reset();
        break;
      case 'satMin':
      case 'satMax':
        v = Math.max(0, Math.min(5, v));
        refreshSatThumb = true;
        break;
      case 'maskInfluence':
        v = this.state.hasMask ? Math.max(0, Math.min(1, v)) : 0;
        refreshMaskThumb = true;
        break;
      case 'invertMask':
        v = v >= 0.5 ? 1 : 0;
        refreshMaskThumb = true;
        break;
      case 'maskMin':
      case 'maskMax':
        v = Math.max(0, Math.min(1, v));
        refreshMaskThumb = true;
        break;
    }

    this.state.params[key] = v as ShaderParams[K];

    if (regenNoise) {
      this.regenerateNoiseSource();
    }
    if (refreshControlThumb) {
      this.refreshSlotPreviewThumbnail('control');
    }
    if (refreshSatThumb) {
      this.refreshSlotPreviewThumbnail('satMap');
    }
    if (refreshMaskThumb) {
      this.refreshSlotPreviewThumbnail('mask');
    }

    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public resetParam(key: keyof ShaderParams): void {
    if (key === 'numImages') {
      this.setParam('numImages', Math.max(1, this.state.stack.length));
      return;
    }
    if (key === 'maskInfluence') {
      this.setParam('maskInfluence', this.state.hasMask ? 1 : 0);
      return;
    }
    if (key === 'offset') {
      this.state.params.offset = 0;
      this.state.params.animSpeed = 0;
      this.clock.reset();
      this.refreshSlotPreviewThumbnail('control');
      this.renderNow();
      this.ensureLoopState();
      this.emit();
      return;
    }
    this.setParam(key, DEFAULT_SHADER_PARAMS[key]);
  }

  public resetGroup(group: ParamGroup): void {
    if (group === 'grid' || group === 'all') {
      this.state.params.gridSizeX = DEFAULT_SHADER_PARAMS.gridSizeX;
      this.state.params.gridSizeY = DEFAULT_SHADER_PARAMS.gridSizeY;
      this.state.params.subdivMultiplier =
        DEFAULT_SHADER_PARAMS.subdivMultiplier;
    }
    if (group === 'rotation' || group === 'all') {
      this.state.params.rotationMode = DEFAULT_SHADER_PARAMS.rotationMode;
      this.state.params.apexX = DEFAULT_SHADER_PARAMS.apexX;
      this.state.params.apexY = DEFAULT_SHADER_PARAMS.apexY;
    }
    if (group === 'noise' || group === 'all') {
      this.state.params.noiseScale = DEFAULT_SHADER_PARAMS.noiseScale;
      this.state.params.noiseDetail = DEFAULT_SHADER_PARAMS.noiseDetail;
      this.state.params.noiseContrast = DEFAULT_SHADER_PARAMS.noiseContrast;
      this.regenerateNoiseSource();
    }
    if (group === 'shader' || group === 'all') {
      this.state.params.numImages = Math.max(1, this.state.stack.length);
      this.state.params.smoothBlend = DEFAULT_SHADER_PARAMS.smoothBlend;
      this.state.params.indexIsNormalized =
        DEFAULT_SHADER_PARAMS.indexIsNormalized;
    }
    if (group === 'control' || group === 'all') {
      this.state.params.contrast = DEFAULT_SHADER_PARAMS.contrast;
      this.state.params.offset = 0;
      this.state.params.animSpeed = 0;
      this.state.params.cyclic = DEFAULT_SHADER_PARAMS.cyclic;
      this.state.params.invertControl = DEFAULT_SHADER_PARAMS.invertControl;
      this.clock.reset();
      this.refreshSlotPreviewThumbnail('control');
    }
    if (group === 'animation') {
      this.state.params.offset = 0;
      this.state.params.animSpeed = 0;
      this.clock.reset();
      this.refreshSlotPreviewThumbnail('control');
    }
    if (group === 'saturation' || group === 'all') {
      this.state.params.satMin = DEFAULT_SHADER_PARAMS.satMin;
      this.state.params.satMax = DEFAULT_SHADER_PARAMS.satMax;
      this.refreshSlotPreviewThumbnail('satMap');
    }
    if (group === 'mask' || group === 'all') {
      this.state.params.maskInfluence = this.state.hasMask ? 1 : 0;
      this.state.params.invertMask = DEFAULT_SHADER_PARAMS.invertMask;
      this.state.params.maskMin = DEFAULT_SHADER_PARAMS.maskMin;
      this.state.params.maskMax = DEFAULT_SHADER_PARAMS.maskMax;
      this.refreshSlotPreviewThumbnail('mask');
    }

    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public setWorkingResolution(width: number, height: number): void {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1 ||
      width > 4096 ||
      height > 4096
    ) {
      this.addError('Working resolution must be between 1×1 and 4096×4096.');
      return;
    }
    const w = Math.round(width);
    const h = Math.round(height);
    try {
      this.pipeline.setWorkingResolution(w, h);
      this.state.workingWidth = w;
      this.state.workingHeight = h;

      for (const item of this.state.stack) {
        if (item.sourceElement) {
          item.rgbaData = this.pipeline.coverFitAndFlattenOverBlack(
            item.sourceElement,
            item.width,
            item.height
          );
        } else if (item.rgbaData) {
          item.rgbaData = this.pipeline.coverFitRawAndFlattenOverBlack({
            width: item.width,
            height: item.height,
            data: item.rgbaData,
          });
          item.width = w;
          item.height = h;
        }
      }
      this.syncStackToGPU();
      this.renderNow();
      this.emit();
    } catch (err) {
      this.addError(
        err instanceof Error
          ? err.message
          : 'Failed to change working resolution.'
      );
    }
  }

  private syncStackToGPU(): void {
    const count = Math.max(1, this.state.stack.length);
    this.pipeline.allocateStackArray(count);
    if (this.state.stack.length === 0) {
      this.pipeline.uploadStackLayerRaw(
        0,
        new Uint8Array(this.state.workingWidth * this.state.workingHeight * 4)
      );
      return;
    }
    this.state.stack.forEach((item, index) => {
      if (item.rgbaData) {
        this.pipeline.uploadStackLayerRaw(index, item.rgbaData);
      }
    });
  }

  public setStackRaw(layers: RawTextureInput[], names?: string[]): void {
    if (layers.length > MAX_STACK_LAYERS) {
      this.addError(
        `Maximum stack size is ${MAX_STACK_LAYERS} images. Only the first ${MAX_STACK_LAYERS} were loaded.`
      );
    }
    const capped = layers.slice(0, MAX_STACK_LAYERS);
    this.state.stack = capped.map((tex, i) => {
      const fitted = this.pipeline.coverFitRawAndFlattenOverBlack(tex);
      return {
        id: this.genId('layer'),
        name: names?.[i] ?? `layer_${i + 1}.png`,
        width: this.state.workingWidth,
        height: this.state.workingHeight,
        thumbnailUrl: rawTextureToThumbnailUrl(tex),
        rgbaData: fitted,
      };
    });
    this.state.params.numImages = Math.max(1, this.state.stack.length);
    this.syncStackToGPU();
    this.renderNow();
    this.emit();
  }

  public loadStackImageWithAlpha(
    width: number,
    height: number,
    rgba: Uint8Array,
    name: string = 'alpha_layer.png'
  ): void {
    const tex: RawTextureInput = { width, height, data: rgba };
    this.setStackRaw([tex], [name]);
  }

  private createElementThumbnail(
    el: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    srcW: number,
    srcH: number
  ): string {
    const size = 96;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    if (srcW > 0 && srcH > 0) {
      const scale = Math.max(size / srcW, size / srcH);
      const dw = srcW * scale;
      const dh = srcH * scale;
      ctx.drawImage(el, (size - dw) / 2, (size - dh) / 2, dw, dh);
    }
    return c.toDataURL('image/png');
  }

  public replaceStackWithImageElements(
    items: { img: HTMLImageElement; name: string }[]
  ): void {
    const capped = items.slice(0, MAX_STACK_LAYERS);
    this.state.stack = capped.map(({ img, name }) => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      return {
        id: this.genId('layer'),
        name,
        width: w,
        height: h,
        thumbnailUrl: this.createElementThumbnail(img, w, h),
        rgbaData: this.pipeline.coverFitAndFlattenOverBlack(img, w, h),
        sourceElement: img,
      };
    });
    this.state.params.numImages = Math.max(1, this.state.stack.length);
    this.syncStackToGPU();
    this.renderNow();
    this.emit();
  }

  public async addStackFiles(files: FileList | File[]): Promise<void> {
    const arr = Array.from(files);
    if (arr.length === 0) return;

    const remainingSlots = MAX_STACK_LAYERS - this.state.stack.length;
    if (remainingSlots <= 0) {
      this.addError(
        `Stack already has the maximum of ${MAX_STACK_LAYERS} images.`
      );
      return;
    }

    if (arr.length > remainingSlots) {
      this.addError(
        `Maximum stack size is ${MAX_STACK_LAYERS} images. Added ${remainingSlots} of ${arr.length} selected files.`
      );
    }

    const toLoad = arr.slice(0, remainingSlots);
    const wasAtMaxNumImages =
      this.state.stack.length === 0 ||
      this.state.params.numImages === this.state.stack.length;

    let addedAny = false;
    for (const file of toLoad) {
      if (!file.type.startsWith('image/')) {
        this.addError(
          `Unsupported stack file "${file.name}": must be an image.`
        );
        continue;
      }
      try {
        const img = await this.decodeImageFile(file);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const fitted = this.pipeline.coverFitAndFlattenOverBlack(img, w, h);
        this.state.stack.push({
          id: this.genId('layer'),
          name: file.name,
          width: w,
          height: h,
          thumbnailUrl: this.createElementThumbnail(img, w, h),
          rgbaData: fitted,
          sourceElement: img,
        });
        addedAny = true;
      } catch {
        this.addError(`Failed to decode image "${file.name}".`);
      }
    }

    if (addedAny) {
      if (wasAtMaxNumImages) {
        this.state.params.numImages = this.state.stack.length;
      } else {
        this.state.params.numImages = Math.min(
          this.state.params.numImages,
          this.state.stack.length
        );
      }
      this.syncStackToGPU();
      this.renderNow();
      this.emit();
    }
  }

  public removeStackLayer(index: number): void {
    if (index < 0 || index >= this.state.stack.length) return;
    const wasAll = this.state.params.numImages >= this.state.stack.length;
    this.state.stack.splice(index, 1);
    if (wasAll) {
      this.state.params.numImages = Math.max(1, this.state.stack.length);
    } else {
      this.state.params.numImages = Math.max(
        1,
        Math.min(
          this.state.params.numImages,
          Math.max(1, this.state.stack.length)
        )
      );
    }
    this.syncStackToGPU();
    this.renderNow();
    this.emit();
  }

  public reorderStackLayer(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this.state.stack.length ||
      toIndex < 0 ||
      toIndex >= this.state.stack.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [moved] = this.state.stack.splice(fromIndex, 1);
    this.state.stack.splice(toIndex, 0, moved);
    this.syncStackToGPU();
    this.renderNow();
    this.emit();
  }

  public clearStack(): void {
    this.state.stack = [];
    this.state.params.numImages = 1;
    this.syncStackToGPU();
    this.renderNow();
    this.emit();
  }

  private decodeImageFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Invalid image file: ${file.name}`));
      };
      img.src = url;
    });
  }

  // --- CONTROL, INDEX MAP, SATURATION MAP & MASK SOURCES ---

  public setControlRaw(
    tex: RawTextureInput,
    name: string = 'raw_control.png'
  ): void {
    const baseRgba = this.previewRenderer.captureBaseSquareRGBAFromRaw(tex);
    this.controlMedia.imageRaw = tex;
    this.controlMedia.imageElement = null;
    this.controlMedia.imageName = name;
    this.controlMedia.imageBaseRgba = baseRgba;

    this.pipeline.uploadControlRaw(tex);
    this.state.controlSource = {
      mode: 'image',
      name,
      width: tex.width,
      height: tex.height,
      thumbnailUrl: this.previewRenderer.processedRGBAToDataUrl(
        'control',
        baseRgba,
        this.state.params
      ),
      playing: false,
      currentTime: 0,
      duration: 0,
    };
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public setIndexMapRaw(
    tex: RawTextureInput,
    name: string = 'raw_index_map.png'
  ): void {
    const baseRgba = this.previewRenderer.captureBaseSquareRGBAFromRaw(tex);
    this.indexMapMedia.imageRaw = tex;
    this.indexMapMedia.imageElement = null;
    this.indexMapMedia.imageName = name;
    this.indexMapMedia.imageBaseRgba = baseRgba;

    const copy = {
      width: tex.width,
      height: tex.height,
      data: new Uint8Array(tex.data),
    };
    this.activeIndexMaps = [copy, copy, copy, copy];
    this.pipeline.uploadIndexMapRaw(tex);
    this.state.indexMapSource = {
      mode: 'image',
      name,
      width: tex.width,
      height: tex.height,
      thumbnailUrl: this.previewRenderer.processedRGBAToDataUrl(
        'indexMap',
        baseRgba,
        this.state.params
      ),
      playing: false,
      currentTime: 0,
      duration: 0,
    };
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public setSatMapRaw(
    tex: RawTextureInput | null,
    name: string = 'raw_sat_map.png'
  ): void {
    if (!tex) {
      this.clearSatMap();
      return;
    }
    const baseRgba = this.previewRenderer.captureBaseSquareRGBAFromRaw(tex);
    this.satMapMedia.imageRaw = tex;
    this.satMapMedia.imageElement = null;
    this.satMapMedia.imageName = name;
    this.satMapMedia.imageBaseRgba = baseRgba;

    this.state.hasSatMap = true;
    this.pipeline.uploadSatMapRaw(tex);
    this.state.satMapSource = {
      mode: 'image',
      name,
      width: tex.width,
      height: tex.height,
      thumbnailUrl: this.previewRenderer.processedRGBAToDataUrl(
        'satMap',
        baseRgba,
        this.state.params
      ),
      playing: false,
      currentTime: 0,
      duration: 0,
    };
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public clearSatMap(): void {
    const slot = this.satMapMedia;
    if (slot.videoElement) {
      slot.videoElement.pause();
    }
    if (slot.webcamStream) {
      slot.webcamStream.getTracks().forEach((t) => t.stop());
      slot.webcamStream = null;
    }
    this.state.hasSatMap = false;
    this.state.satMapSource = createEmptyMediaSourceState();
    this.pipeline.uploadSatMapRaw(null);
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public setMaskRaw(
    tex: RawTextureInput | null,
    name: string = 'raw_mask.png'
  ): void {
    if (!tex) {
      this.clearMask();
      return;
    }
    const baseRgba = this.previewRenderer.captureBaseSquareRGBAFromRaw(tex);
    this.maskMedia.imageRaw = tex;
    this.maskMedia.imageElement = null;
    this.maskMedia.imageName = name;
    this.maskMedia.imageBaseRgba = baseRgba;

    const wasEmpty = !this.state.hasMask;
    this.state.hasMask = true;
    if (wasEmpty) {
      this.state.params.maskInfluence = 1;
    }
    this.pipeline.uploadMaskRaw(tex);
    this.state.maskSource = {
      mode: 'image',
      name,
      width: tex.width,
      height: tex.height,
      thumbnailUrl: this.previewRenderer.processedRGBAToDataUrl(
        'mask',
        baseRgba,
        this.state.params
      ),
      playing: false,
      currentTime: 0,
      duration: 0,
    };
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public clearMask(): void {
    const slot = this.maskMedia;
    if (slot.videoElement) {
      slot.videoElement.pause();
    }
    if (slot.webcamStream) {
      slot.webcamStream.getTracks().forEach((t) => t.stop());
      slot.webcamStream = null;
    }
    this.state.hasMask = false;
    this.state.params.maskInfluence = 0; // Spec D11
    this.state.maskSource = createEmptyMediaSourceState();
    this.pipeline.uploadMaskRaw(null);
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  private setSlotImageElement(
    target: MediaSlotTarget,
    img: HTMLImageElement | HTMLCanvasElement,
    name: string
  ): void {
    const w =
      img instanceof HTMLImageElement
        ? img.naturalWidth || img.width
        : img.width;
    const h =
      img instanceof HTMLImageElement
        ? img.naturalHeight || img.height
        : img.height;
    const slot = this.getSlotMedia(target);
    slot.imageElement = img;
    slot.imageRaw = null;
    slot.imageName = name;
    slot.imageBaseRgba =
      this.previewRenderer.captureBaseSquareRGBAFromElement(img, w, h);

    this.activateSlotMode(target, 'image');
  }

  public async loadSlotFile(
    target: MediaSlotTarget,
    file: File
  ): Promise<void> {
    if (file.type.startsWith('image/')) {
      try {
        const img = await this.decodeImageFile(file);
        this.setSlotImageElement(target, img, file.name);
      } catch {
        this.addError(`Unsupported or corrupted image file "${file.name}".`);
      }
      return;
    }

    if (
      file.type.startsWith('video/') ||
      /\.(mp4|mov|webm|ogg|m4v)$/i.test(file.name)
    ) {
      const url = URL.createObjectURL(file);
      try {
        await this.setSlotVideoUrl(target, url, file.name, true, true);
      } catch {
        URL.revokeObjectURL(url);
        this.addError(`Unsupported or unplayable video file "${file.name}".`);
      }
      return;
    }

    this.addError(
      `Unsupported file format "${file.name}". Please select an image or video file.`
    );
  }

  public async setSlotVideoUrl(
    target: MediaSlotTarget,
    url: string,
    name: string,
    activateImmediately: boolean = true,
    revokePreviousBlob: boolean = false
  ): Promise<void> {
    const slot = this.getSlotMedia(target);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true; // Spec D1: loaded video files loop
    video.playsInline = true;
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load video: ${name}`));
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('error', onError);
      video.src = url;
      video.load();
    });

    if (slot.videoElement) {
      slot.videoElement.pause();
    }
    if (
      revokePreviousBlob &&
      slot.videoUrl &&
      slot.videoUrl.startsWith('blob:')
    ) {
      URL.revokeObjectURL(slot.videoUrl);
    }

    // Spec D14: newly loaded videos always start at time 0
    video.currentTime = 0;

    slot.videoElement = video;
    slot.videoUrl = url;
    slot.videoName = name;
    slot.videoBaseRgba =
      this.previewRenderer.captureBaseSquareRGBAFromElement(
        video,
        video.videoWidth || 320,
        video.videoHeight || 180
      );

    if (activateImmediately) {
      this.activateSlotMode(target, 'video');
    }
  }

  public async startSlotWebcam(target: MediaSlotTarget): Promise<boolean> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.addError(
        'Webcam access (getUserMedia) is not supported in this browser.'
      );
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (video.readyState < 2 || video.videoWidth === 0) {
        await new Promise<void>((resolve) => {
          const done = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            video.removeEventListener('loadeddata', done);
            video.removeEventListener('playing', done);
          };
          video.addEventListener('loadeddata', done, { once: true });
          video.addEventListener('playing', done, { once: true });
        });
      }

      const slot = this.getSlotMedia(target);
      if (slot.webcamStream) {
        slot.webcamStream.getTracks().forEach((t) => t.stop());
      }
      slot.webcamStream = stream;
      slot.webcamVideo = video;
      slot.webcamBaseRgba =
        this.previewRenderer.captureBaseSquareRGBAFromElement(
          video,
          video.videoWidth || 640,
          video.videoHeight || 480
        );
      this.activateSlotMode(target, 'webcam');
      return true;
    } catch (err) {
      this.addError(
        `Unable to access webcam: ${
          err instanceof Error ? err.message : 'Permission denied'
        }.`
      );
      return false;
    }
  }

  private uploadSlotElementToPipeline(
    target: MediaSlotTarget,
    el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    w: number,
    h: number
  ): void {
    if (target === 'control') {
      this.pipeline.uploadControlElement(el, w, h);
    } else if (target === 'indexMap') {
      this.pipeline.uploadIndexMapElement(el, w, h);
    } else if (target === 'satMap') {
      this.pipeline.uploadSatMapElement(el, w, h);
    } else {
      this.pipeline.uploadMaskElement(el, w, h);
    }
  }

  private uploadSlotRawToPipeline(
    target: MediaSlotTarget,
    tex: RawTextureInput
  ): void {
    if (target === 'control') {
      this.pipeline.uploadControlRaw(tex);
    } else if (target === 'indexMap') {
      this.activeIndexMaps = [tex, tex, tex, tex];
      this.pipeline.uploadIndexMapRaw(tex);
    } else if (target === 'satMap') {
      this.pipeline.uploadSatMapRaw(tex);
    } else {
      this.pipeline.uploadMaskRaw(tex);
    }
  }

  public activateSlotMode(
    target: MediaSlotTarget,
    mode: SourceMode
  ): boolean {
    const slot = this.getSlotMedia(target);
    const prevState = this.getSlotSourceState(target);

    if (mode === 'noise') {
      if (slot.videoElement) slot.videoElement.pause();
      if (target === 'mask' && !this.state.hasMask) {
        this.state.hasMask = true;
        this.state.params.maskInfluence = 1; // Spec D11
      }
      if (target === 'satMap') {
        this.state.hasSatMap = true;
      }
      this.uploadSlotRawToPipeline(target, this.currentNoiseTex);
      const nextSource: MediaSourceState = {
        mode: 'noise',
        name: 'Perlin Noise',
        width: this.currentNoiseTex.width,
        height: this.currentNoiseTex.height,
        thumbnailUrl: this.previewRenderer.processedRGBAToDataUrl(
          target,
          this.currentNoiseBaseRgba,
          this.state.params
        ),
        playing: false,
        currentTime: 0,
        duration: 0,
      };
      this.applySlotState(target, nextSource);
      return true;
    }

    if (mode === 'image') {
      if (!slot.imageElement && !slot.imageRaw) {
        return false;
      }
      if (slot.videoElement) slot.videoElement.pause();

      let w = 0;
      let h = 0;
      if (slot.imageElement) {
        w =
          slot.imageElement instanceof HTMLImageElement
            ? slot.imageElement.naturalWidth || slot.imageElement.width
            : slot.imageElement.width;
        h =
          slot.imageElement instanceof HTMLImageElement
            ? slot.imageElement.naturalHeight || slot.imageElement.height
            : slot.imageElement.height;
        this.uploadSlotElementToPipeline(target, slot.imageElement, w, h);
      } else if (slot.imageRaw) {
        w = slot.imageRaw.width;
        h = slot.imageRaw.height;
        this.uploadSlotRawToPipeline(target, slot.imageRaw);
      }

      if (target === 'mask' && !this.state.hasMask) {
        this.state.hasMask = true;
        this.state.params.maskInfluence = 1;
      }
      const thumb = slot.imageBaseRgba
        ? this.previewRenderer.processedRGBAToDataUrl(
            target,
            slot.imageBaseRgba,
            this.state.params
          )
        : '';

      const nextSource: MediaSourceState = {
        mode: 'image',
        name: slot.imageName,
        width: w,
        height: h,
        thumbnailUrl: thumb,
        playing: false,
        currentTime: 0,
        duration: 0,
      };
      this.applySlotState(target, nextSource);
      return true;
    }

    if (mode === 'video') {
      if (!slot.videoElement) {
        return false;
      }
      const v = slot.videoElement;
      const w = v.videoWidth || 640;
      const h = v.videoHeight || 360;
      v.play().catch(() => {});
      this.uploadSlotElementToPipeline(target, v, w, h);
      if (target === 'mask' && !this.state.hasMask) {
        this.state.hasMask = true;
        this.state.params.maskInfluence = 1;
      }
      const thumb = slot.videoBaseRgba
        ? this.previewRenderer.processedRGBAToDataUrl(
            target,
            slot.videoBaseRgba,
            this.state.params
          )
        : '';
      const nextSource: MediaSourceState = {
        mode: 'video',
        name: slot.videoName,
        width: w,
        height: h,
        thumbnailUrl: thumb,
        playing: !v.paused,
        currentTime: v.currentTime || 0,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
      };
      this.applySlotState(target, nextSource);
      return true;
    }

    if (mode === 'webcam') {
      if (!slot.webcamVideo) {
        return false;
      }
      if (slot.videoElement) slot.videoElement.pause();
      const v = slot.webcamVideo;
      const w = v.videoWidth || 640;
      const h = v.videoHeight || 480;
      slot.webcamBaseRgba =
        this.previewRenderer.captureBaseSquareRGBAFromElement(v, w, h);
      this.uploadSlotElementToPipeline(target, v, w, h);
      if (target === 'mask' && !this.state.hasMask) {
        this.state.hasMask = true;
        this.state.params.maskInfluence = 1;
      }
      const thumb = this.previewRenderer.processedRGBAToDataUrl(
        target,
        slot.webcamBaseRgba,
        this.state.params
      );
      const nextSource: MediaSourceState = {
        mode: 'webcam',
        name: 'Webcam Live',
        width: w,
        height: h,
        thumbnailUrl: thumb,
        playing: true,
        currentTime: 0,
        duration: 0,
      };
      this.applySlotState(target, nextSource);
      return true;
    }

    if (prevState.mode !== 'none' && target === 'satMap') {
      this.clearSatMap();
      return true;
    }
    if (prevState.mode !== 'none' && target === 'mask') {
      this.clearMask();
      return true;
    }
    return false;
  }

  private applySlotState(
    target: MediaSlotTarget,
    nextSource: MediaSourceState
  ): void {
    if (target === 'control') {
      this.state.controlSource = nextSource;
    } else if (target === 'indexMap') {
      this.state.indexMapSource = nextSource;
    } else if (target === 'satMap') {
      this.state.hasSatMap = nextSource.mode !== 'none';
      this.state.satMapSource = nextSource;
    } else {
      const wasEmpty = !this.state.hasMask;
      this.state.hasMask = nextSource.mode !== 'none';
      if (wasEmpty && this.state.hasMask) {
        this.state.params.maskInfluence = 1; // Spec D11
      }
      this.state.maskSource = nextSource;
    }
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public toggleVideoPlayback(target: MediaSlotTarget): void {
    const slot = this.getSlotMedia(target);
    const sourceState = this.getSlotSourceState(target);
    if (sourceState.mode !== 'video' || !slot.videoElement) return;
    const activeVideo = slot.videoElement;
    if (activeVideo.paused) {
      activeVideo.play().catch(() => {});
    } else {
      activeVideo.pause();
    }
    this.syncVideoTransportState();
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public seekVideoNormalized(
    target: MediaSlotTarget,
    progress01: number
  ): void {
    const slot = this.getSlotMedia(target);
    const activeVideo = slot.videoElement;
    if (
      !activeVideo ||
      !Number.isFinite(activeVideo.duration) ||
      activeVideo.duration <= 0
    ) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, progress01));
    activeVideo.currentTime = clamped * activeVideo.duration;
    this.syncVideoTransportState();
    this.uploadDynamicVideoTextures();
    this.refreshSlotPreviewThumbnail(target, true);
    this.renderNow();
    this.emit();
  }

  public syncVideosToStart(): void {
    let anyVideo = false;
    for (const slot of [
      this.controlMedia,
      this.indexMapMedia,
      this.satMapMedia,
      this.maskMedia,
    ]) {
      if (slot.videoElement) {
        slot.videoElement.currentTime = 0;
        slot.videoElement.play().catch(() => {});
        anyVideo = true;
      }
    }
    if (!anyVideo) return;
    this.syncVideoTransportState();
    this.uploadDynamicVideoTextures();
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  private syncVideoTransportState(): void {
    const targets: MediaSlotTarget[] = [
      'control',
      'indexMap',
      'satMap',
      'mask',
    ];
    for (const target of targets) {
      const src = this.getSlotSourceState(target);
      const slot = this.getSlotMedia(target);
      if (src.mode === 'video' && slot.videoElement) {
        const v = slot.videoElement;
        src.playing = !v.paused && !v.ended;
        src.currentTime = v.currentTime || 0;
        src.duration = Number.isFinite(v.duration) ? v.duration : 0;
      }
    }
  }

  private uploadDynamicVideoTextures(): void {
    const targets: MediaSlotTarget[] = [
      'control',
      'indexMap',
      'satMap',
      'mask',
    ];
    for (const target of targets) {
      const src = this.getSlotSourceState(target);
      const slot = this.getSlotMedia(target);
      if (src.mode === 'video' && slot.videoElement) {
        const v = slot.videoElement;
        if (v.readyState >= 2) {
          this.uploadSlotElementToPipeline(
            target,
            v,
            v.videoWidth || 640,
            v.videoHeight || 360
          );
        }
      } else if (src.mode === 'webcam' && slot.webcamVideo) {
        const v = slot.webcamVideo;
        if (v.readyState >= 2) {
          this.uploadSlotElementToPipeline(
            target,
            v,
            v.videoWidth || 640,
            v.videoHeight || 480
          );
        }
      }
    }
  }

  /**
   * Spec D6: updates every frame while any video/webcam plays
   * or the offset animation speed is not 0; otherwise only when something changes.
   */
  private shouldAnimateLoop(): boolean {
    if (this.clock.isHidden()) return false;
    if (this.state.params.animSpeed !== 0) return true;
    const targets: MediaSlotTarget[] = [
      'control',
      'indexMap',
      'satMap',
      'mask',
    ];
    for (const target of targets) {
      const src = this.getSlotSourceState(target);
      const slot = this.getSlotMedia(target);
      if (
        src.mode === 'video' &&
        slot.videoElement &&
        !slot.videoElement.paused
      ) {
        return true;
      }
      if (src.mode === 'webcam') {
        return true;
      }
    }
    return false;
  }

  private advanceAnimationsByDt(dtSeconds: number): void {
    if (dtSeconds <= 0) return;
    if (this.state.params.animSpeed !== 0) {
      this.state.params.offset = advanceOffsetLinear(
        this.state.params.offset,
        this.state.params.animSpeed,
        dtSeconds
      );
    }
  }

  private ensureLoopState(): void {
    const needed = this.shouldAnimateLoop();
    if (needed && this.rafId === null) {
      this.clock.reset();
      this.lastFrameRenderMs = performance.now();
      const loop = (now: number) => {
        if (!this.shouldAnimateLoop()) {
          this.rafId = null;
          return;
        }
        const dt = this.clock.tick(now);
        this.advanceAnimationsByDt(dt);
        this.uploadDynamicVideoTextures();
        this.syncVideoTransportState();

        // Throttle live preview thumbnail refreshes during RAF to ~6 fps so playback stays smooth
        if (now - this.lastLivePreviewMs >= 160) {
          this.lastLivePreviewMs = now;
          if (this.state.params.animSpeed !== 0) {
            this.refreshSlotPreviewThumbnail('control', true);
          }
          for (const target of [
            'control',
            'indexMap',
            'satMap',
            'mask',
          ] as MediaSlotTarget[]) {
            const src = this.getSlotSourceState(target);
            if (src.mode === 'video' || src.mode === 'webcam') {
              this.refreshSlotPreviewThumbnail(target, true);
            }
          }
        }

        this.renderNow(now);
        this.emit();
        if (this.shouldAnimateLoop()) {
          this.rafId = requestAnimationFrame(loop);
        } else {
          this.rafId = null;
        }
      };
      this.rafId = requestAnimationFrame(loop);
    } else if (!needed && this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Step the animation clock deterministically by `dtSeconds` (for automated tests, §8.2).
   */
  public stepClock(dtSeconds: number): void {
    if (this.clock.isHidden()) return;
    this.clock.reset();
    this.advanceAnimationsByDt(dtSeconds);
    if (this.state.params.animSpeed !== 0 && dtSeconds > 0) {
      this.refreshSlotPreviewThumbnail('control');
    }
    this.uploadDynamicVideoTextures();
    this.renderNow();
    this.ensureLoopState();
    this.emit();
  }

  public setTabHiddenSimulated(hidden: boolean): void {
    this.clock.setHidden(hidden);
    this.ensureLoopState();
  }

  public renderNow(nowMs: number = performance.now()): void {
    const t0 = performance.now();
    this.pipeline.render(this.state.params, this.state.stack.length);
    const renderDuration = performance.now() - t0;

    const elapsedBetweenFrames = Math.max(0.1, nowMs - this.lastFrameRenderMs);
    this.lastFrameRenderMs = nowMs;
    const instantFps = Math.min(240, 1000 / elapsedBetweenFrames);
    this.smoothedFps = this.smoothedFps * 0.8 + instantFps * 0.2;
    this.smoothedFrameMs = this.smoothedFrameMs * 0.8 + renderDuration * 0.2;

    this.state.frameCount += 1;
    this.state.fps = Math.round(this.smoothedFps);
    this.state.frameTimeMs = Number(this.smoothedFrameMs.toFixed(2));
  }

  /**
   * Capture a PNG data URL at the working resolution with guaranteed opaque alpha = 255 (D7, D13).
   */
  public captureSnapshotDataUrl(): string {
    this.renderNow();
    return this.pipeline.canvas.toDataURL('image/png');
  }

  public downloadSnapshotPng(): void {
    const dataUrl = this.captureSnapshotDataUrl();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `texture-mosaic-${this.state.workingWidth}x${this.state.workingHeight}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export { TextureMosaicEngine as TextureStackEngine };
