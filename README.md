# Texture Mosaic v0.1

WebGL2 live shader studio for the **Texture Mosaic** fractal subdivision + per-cell apex rotation GLSL shader (`Shaders/texture_mosaic.frag` / `src/shaders/texture_mosaic_web.frag`), built according to `Specification/texture-mosaic-spec-v0.1.md`.

## Quick Start (3 Commands)

```bash
# 1. Install dependencies
npm install

# 2. Run automated unit + WebGL2 e2e tests
npm test

# 3. Start the local review server
npm run dev
```

- **Local review URL:** `http://localhost:5174/`
- **Demo scene URL:** `http://localhost:5174/?demo=1`
- **Test report & screenshots:** [`tests/REPORT.md`](./tests/REPORT.md)
- **Decisions & custom CSS log:** [`decisions.md`](./decisions.md)
