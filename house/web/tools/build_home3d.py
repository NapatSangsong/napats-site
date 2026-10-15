"""Compose /home3d/index.html (+ copy geometry, lightmaps) into the site's public folder."""
import sys, os, shutil, time, re

HOUSE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))   # <repo>/house
ROOT = os.path.join(HOUSE, 'web')
SITE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HOUSE, '..', 'public')
V = time.strftime('%Y%m%d%H%M')

tpl = open(os.path.join(HOUSE, 'viewer', 'house_template.html')).read()
a = tpl.index('  function rng(seed)')
b = tpl.index('  for (const k of Object.keys(gens)) T[k] = gens[k]();') + len('  for (const k of Object.keys(gens)) T[k] = gens[k]();')
gens = tpl[a:b]
ma = gens.index('  function makeTex(size, fn, opts = {}) {')
mb = gens.index('  const frac = x =>')
gens = gens[:ma] + """  function makeTex(size, fn) {
    const cm = document.createElement('canvas');
    cm.width = cm.height = size;
    const im = cm.getContext('2d').createImageData(size, size);
    const out = [1, 0];
    let sum = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      fn(x / size, y / size, out, x, y);
      const i = (y * size + x) * 4, L = Math.max(0, Math.min(255, out[0] * 255));
      im.data[i] = im.data[i + 1] = im.data[i + 2] = L; im.data[i + 3] = 255; sum += L;
    }
    cm.getContext('2d').putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(cm); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return { map: t, mean: Math.max(0.05, sum / (size * size) / 255) };
  }
""" + gens[mb:]
gens = re.sub(r"\n\s*await tick\('[^']*'\);", '', gens)
gens = gens.replace('const S = coarse ? 256 : 512;', 'const S = coarse ? 256 : 512;')

js = open(os.path.join(ROOT, 'src/home3d.js')).read().replace('/*__GENS__*/', gens).replace('__V__', V)
shell = open(os.path.join(ROOT, 'src/home3d_shell.html')).read()
page = shell.replace('__SCRIPT__', js.strip()).replace('__V__', V)
dst = os.path.join(SITE, 'home3d')
os.makedirs(os.path.join(dst, 'lm'), exist_ok=True)
open(os.path.join(dst, 'index.html'), 'w').write(page)
src = os.path.join(ROOT, 'home3d')
for f in ('geo.bin', 'geo.json', 'lm.json'):
    shutil.copy(os.path.join(src, f), os.path.join(dst, f))
for f in os.listdir(os.path.join(dst, 'lm')):
    os.remove(os.path.join(dst, 'lm', f))
for f in os.listdir(os.path.join(src, 'lm')):
    shutil.copy(os.path.join(src, 'lm', f), os.path.join(dst, 'lm', f))
kit = os.path.join(SITE, 'house-kit')
for f in ('house.css', 'ui.js'):
    shutil.copy(os.path.join(ROOT, 'house-kit', f), os.path.join(kit, f))
print('built /home3d', len(page), 'bytes')
