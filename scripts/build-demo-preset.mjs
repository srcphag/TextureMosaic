/**
 * Builds `presets/demo-mosaic.json` — a self-contained TextureMosaic preset
 * with all media embedded as Base64 data URLs — mirroring the repository's
 * `public/demo/manifest.json` demo scene (dataset stack + input1 control).
 * Re-run after changing the demo assets:
 *
 *   node scripts/build-demo-preset.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function imageSize(buf, ext) {
  if (ext === '.png') {
    // PNG IHDR: width @ byte 16, height @ byte 20 (big-endian uint32)
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF0/SOF2 marker (0xFFC0 / 0xFFC2)
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (buf[i] === 0xff && buf[i + 1] !== 0xd8 && buf[i + 1] !== 0xd9) {
      i += 2 + buf.readUInt16BE(i + 2);
    } else {
      i += 2;
    }
  }
  return { width: 0, height: 0 };
}

function embedImage(relPath) {
  const abs = path.join(root, relPath);
  const ext = path.extname(relPath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const buf = fs.readFileSync(abs);
  const { width, height } = imageSize(buf, ext);
  return {
    name: path.basename(relPath),
    width,
    height,
    dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
  };
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public/demo/manifest.json'), 'utf8')
);
const stackRel = manifest.stackImages.map((p) =>
  path.join('public', p.replace(/^\.\//, ''))
);
const controlRel = path.join(
  'public',
  manifest.controlImage.replace(/^\.\//, '')
);

const preset = {
  version: 1,
  app: 'TextureMosaic',
  name: 'demo-mosaic',
  createdAt: new Date().toISOString(),
  workingWidth: 1280,
  workingHeight: 720,
  params: {
    gridSizeX: 60,
    gridSizeY: 60,
    subdivMultiplier: 2,
    rotationMode: 1,
    apexX: 0.5,
    apexY: 0.5,
    noiseScale: 6,
    noiseDetail: 4,
    noiseContrast: 1,
    numImages: stackRel.length,
    smoothBlend: 1,
    indexIsNormalized: 1,
    contrast: 1,
    offset: 0,
    animSpeed: 0.15,
    cyclic: 1,
    invertControl: 0,
    satMin: 0,
    satMax: 5,
    maskInfluence: 0,
    invertMask: 0,
    maskMin: 0,
    maskMax: 1,
  },
  slots: {
    control: { mode: 'image', ...embedImage(controlRel) },
    indexMap: { mode: 'noise', name: 'Perlin Noise', width: 256, height: 256 },
    satMap: { mode: 'none', name: '', width: 0, height: 0 },
    mask: { mode: 'none', name: '', width: 0, height: 0 },
  },
  stack: stackRel.map(embedImage),
};

const outDir = path.join(root, 'presets');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'demo-mosaic.json');
fs.writeFileSync(outFile, JSON.stringify(preset, null, 2));
console.log(
  `Wrote ${path.relative(root, outFile)} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB, ${stackRel.length} stack layers)`
);
