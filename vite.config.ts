import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5174,
    strictPort: false,
    watch: {
      // Large binary/media and data files: excluding them keeps the dev watcher from
      // reload-storming (and crashing) on multi-MB preset JSONs and raw scans.
      ignored: [
        '**/TouchDesigner/**',
        '**/Shaders/**',
        '**/Mesh/**',
        '**/presets/**',
      ],
    },
  },
});
