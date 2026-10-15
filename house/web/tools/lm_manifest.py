import os, json, sys
from PIL import Image
import numpy as np
d = sys.argv[1]
lm = os.path.join(d, 'lm')
out = {'variants': [], 'groups': {}}
for f in sorted(os.listdir(lm)):
    if not f.endswith('.webp'): continue
    g, v = f[:-5].rsplit('_', 1)
    out['groups'].setdefault(g, [])
    if v not in out['groups'][g]: out['groups'][g].append(v)
for v in ('day', 'night'):
    if out['groups'] and all(v in vs for vs in out['groups'].values()):
        out['variants'].append(v)
for v in out['variants']:
    p = os.path.join(lm, 'lawn_%s.webp' % v)
    if os.path.exists(p):
        a = np.asarray(Image.open(p).convert('RGB')).reshape(-1, 3).astype(float)
        a = a[a.sum(1) > 30]
        out['lawn_' + v] = [round(x / 255, 4) for x in np.median(a, 0)]
json.dump(out, open(os.path.join(d, 'lm.json'), 'w'))
print(out)
