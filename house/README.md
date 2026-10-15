# Salaya House pages

Two static pages served from `public/` (Cloudflare Workers static assets):

- `/home/` — real-time three.js model (live sun, soft shadows, walk mode). Built from `viewer/house_template.html` + `web/src/home_shell.html`.
- `/home3d/` — same house with lighting baked in Blender (Cycles) and replayed in three.js. Built from `web/src/home3d.js` + `web/src/home3d_shell.html`.

Shared UI lives in `web/house-kit/` (copied to `public/house-kit/`).

## Rebuild

```bash
python3 house/web/tools/build_home.py          # -> public/home/
python3 house/web/tools/build_home3d.py        # -> public/home3d/ (needs house/web/home3d from bake_process)
```

## Baked light pipeline

1. In Blender run `house/pave_house.py`, then N panel → Pave → "อบแสง + ส่งออก GLB". EXRs land in `~/Downloads/pave_out/bake/`.
2. `python3 house/web/tools/bake_process.py <exr_dir> house/web/home3d day` (and `night`): rebuilds the same lightmap UVs, denoises (chart-aware à-trous), splits interior/exterior exposure, writes `lm/*.webp`, `geo.bin`, `geo.json`.
3. `python3 house/web/tools/lm_manifest.py house/web/home3d` then `build_home3d.py`.

Needs Python 3 with numpy, Pillow, and ffmpeg (EXR decode).
