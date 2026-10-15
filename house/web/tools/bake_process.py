"""Turn Blender lightmap bakes (EXR) into web-ready lightmaps + geometry for /home3d.

usage: python3 bake_process.py <exr_dir> <out_dir> [variant=day] [groups...]

- rebuilds the exact geometry + lightmap UV layout from pave_house.py (deterministic)
- chart-aware edge-avoiding a-trous denoise (guides: chart id, normal, luminance)
- interior/exterior exposure split, filmic tone map, sRGB, dither, gutter dilation
- writes <out>/lm/<group>_<variant>.webp and (once) <out>/geo.bin + geo.json
"""
import sys, os, json, math, subprocess, time
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
import pave_house as P

EXR_DIR, OUT = sys.argv[1], sys.argv[2]
VARIANT = sys.argv[3] if len(sys.argv) > 3 else 'day'
ONLY = set(sys.argv[4:])
MAXW = 2048

# materials that read as "inside the house" -> lifted exposure (eye adapted to the room)
INTERIOR = {'Int_Wall', 'Int_Olive', 'Moulding', 'Floor_Tile', 'Laminate', 'Bath_Tile', 'Bath_Floor', 'Ceiling',
            'Tile_Grey', 'Door_White', 'Wood_Tread', 'LED_Strip', 'Light_Warm', 'Chrome', 'AC_White'}
INTERIOR_GROUPS = {'furn_g', 'furn_u'}
EXT_GROUP_EXTERIOR = {'Ext_Wall', 'Ext_Dark', 'Steel_Brown', 'Alu_Dark'}
GAIN_IN = 7.0 if VARIANT == 'day' else 3.4
GAIN_OUT = 0.95 if VARIANT == 'day' else 6.0


def is_interior(g, mat):
    if g in INTERIOR_GROUPS:
        return mat not in ('Plant_Pot',) or True
    if g == 'ext':
        return mat not in EXT_GROUP_EXTERIOR
    if g in ('house_g', 'house_u'):
        return mat in INTERIOR
    return False


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ---------------------------------------------------------------- geometry helpers
def newell(V):
    n = [0.0, 0.0, 0.0]
    for i in range(len(V)):
        a, b = V[i], V[(i + 1) % len(V)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    L = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
    return [n[0] / L, n[1] / L, n[2] / L]


def earclip(pts2):
    """triangulate a simple polygon (list of (x,y)); returns index triples"""
    n = len(pts2)
    if n < 3:
        return []
    if n == 3:
        return [(0, 1, 2)]
    area = sum(pts2[i][0] * pts2[(i + 1) % n][1] - pts2[(i + 1) % n][0] * pts2[i][1] for i in range(n))
    idx = list(range(n)) if area > 0 else list(range(n))[::-1]
    tris = []

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def inside(p, a, b, c):
        return cross(a, b, p) >= -1e-12 and cross(b, c, p) >= -1e-12 and cross(c, a, p) >= -1e-12

    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        m = len(idx)
        ear = False
        for k in range(m):
            i0, i1, i2 = idx[(k - 1) % m], idx[k], idx[(k + 1) % m]
            a, b, c = pts2[i0], pts2[i1], pts2[i2]
            if cross(a, b, c) <= 1e-14:
                continue
            if any(inside(pts2[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((i0, i1, i2))
            idx.pop(k)
            ear = True
            break
        if not ear:          # degenerate: fan the rest
            for k in range(1, len(idx) - 1):
                tris.append((idx[0], idx[k], idx[k + 1]))
            return tris
    tris.append(tuple(idx))
    return tris


def tri_face(V3, n):
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if az >= ax and az >= ay:
        p2 = [(v[0], v[1]) for v in V3]
    elif ax >= ay:
        p2 = [(v[1], v[2]) for v in V3]
    else:
        p2 = [(v[0], v[2]) for v in V3]
    if len(V3) == 4:
        return [(0, 1, 2), (0, 2, 3)]
    return earclip(p2)


# ---------------------------------------------------------------- flags (same rules as the realtime viewer)
WALKABLE = {'Floor_Tile', 'Tile_Grey', 'Wood_Tile', 'Pebble', 'Step_Stone', 'Laminate', 'Bath_Floor', 'Porch_Tile', 'Concrete',
            'Paver_Dark', 'Grass', 'Stone_Step', 'Wood_Tread', 'Asphalt', 'Kerb', 'Rug_Shag', 'Paving'}
NOCOLLIDE = {'Glass', 'Curtain_Sheer', 'Curtain_Beige', 'Light_Warm', 'LED_Strip', 'Ceiling', 'Roof_Tile', 'Ridge', 'Soffit',
             'Fascia', 'Roof_Metal', 'Door_Grey', 'Door_White', 'Alu_Dark', 'Chrome', 'Brass', 'Smoke_Glass', 'Rug_Shag', 'Grass', 'Bark',
             'Agave', 'Leaves', 'Leaves_Light', 'Soil'}
FURN_SKIP = {'Floor_Tile', 'Ext_White', 'Ext_Wall', 'Ext_Dark', 'Glass', 'Alu_Dark', 'Int_Wall'}


def flags_of(l, o, mt):
    roof = l in ('roof', 'ext_roof') or o in ('U_Ceiling', 'X_Ceiling')
    upper = l in ('house_u', 'furn_u', 'roof') or o == 'G_Ceiling'
    ext = l in ('ext', 'ext_roof') or o in ('Yard', 'Tank')
    furn = l in ('furn_g', 'furn_u') or (o in ('X_Kitchen', 'X_Multi') and mt not in FURN_SKIP)
    walk = mt in WALKABLE
    collide = (not walk) and mt not in NOCOLLIDE and not roof and o not in (
        'Stair', 'Stair_Tread', 'Lawn', 'Road', 'Drive', 'Trees', 'Plants', 'Planter')
    return (roof, upper, ext, furn, walk, collide)


# ---------------------------------------------------------------- image helpers
def decode_exr(path, S):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', '-'],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.float32).reshape(3, S, S)
    return np.stack([a[2], a[0], a[1]], -1).astype(np.float32)


def shift(a, dy, dx, fill=0):
    """a shifted so out[y,x] = a[y+dy, x+dx]"""
    H, W = a.shape[:2]
    out = np.full_like(a, fill)
    ys, ye = max(0, -dy), min(H, H - dy)
    xs, xe = max(0, -dx), min(W, W - dx)
    out[ys:ye, xs:xe] = a[ys + dy:ye + dy, xs + dx:xe + dx]
    return out


def lum(c):
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def denoise(rgb, chart, nrm, iters=5, sig_l=0.30, sig_n=0.06):
    valid = chart > 0
    H = np.array([1 / 16, 1 / 4, 3 / 8, 1 / 4, 1 / 16], np.float32)
    # firefly clamp against same-chart 3x3 mean
    acc = np.zeros_like(rgb)
    wsum = np.zeros(chart.shape, np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            same = (shift(chart, dy, dx) == chart) & valid
            acc += shift(rgb, dy, dx) * same[..., None]
            wsum += same
    mean = acc / np.maximum(wsum, 1)[..., None]
    L, Lm = lum(rgb), lum(mean)
    hot = (L > 3.0 * Lm + 0.02) & (wsum > 2)
    # texels Blender never wrote (exact zero on seams between faces of one chart)
    hole = valid & (L <= 1e-7) & (Lm > 1e-4)
    rgb = np.where((hot | hole)[..., None], mean, rgb)
    for _ in range(2):
        L = lum(rgb)
        acc[:] = 0
        wsum[:] = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                same = (shift(chart, dy, dx) == chart) & valid & (shift(L, dy, dx) > 1e-7)
                acc += shift(rgb, dy, dx) * same[..., None]
                wsum += same
        hole = valid & (L <= 1e-7) & (wsum >= 3)
        rgb = np.where(hole[..., None], acc / np.maximum(wsum, 1)[..., None], rgb)
    cur = rgb
    for it in range(iters):
        step = 1 << it
        gl = np.log(lum(cur) + 2e-4)
        acc = np.zeros_like(cur)
        wsum = np.zeros(chart.shape, np.float32)
        for j, ky in enumerate(H):
            dy = (j - 2) * step
            for i, kx in enumerate(H):
                dx = (i - 2) * step
                if dy == 0 and dx == 0:
                    w = np.full(chart.shape, ky * kx, np.float32) * valid
                    acc += cur * w[..., None]
                    wsum += w
                    continue
                c2 = shift(chart, dy, dx)
                same = (c2 == chart) & valid
                if not same.any():
                    continue
                n2 = shift(nrm, dy, dx)
                dn = np.clip(1.0 - (nrm * n2).sum(-1), 0, 2)
                w = (ky * kx) * same * np.exp(-dn / sig_n) * np.exp(-np.abs(shift(gl, dy, dx) - gl) / (sig_l * (1 + 0.35 * it)))
                w = w.astype(np.float32)
                acc += shift(cur, dy, dx) * w[..., None]
                wsum += w
        cur = np.where(valid[..., None], acc / np.maximum(wsum, 1e-8)[..., None], 0).astype(np.float32)
    return cur


def aces(x):
    return np.clip(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


def to_srgb(c):
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.maximum(c, 1e-8), 1 / 2.4) - 0.055)


def dilate(img, valid, n=24):
    img = img.copy()
    v = valid.copy()
    for _ in range(n):
        if v.all():
            break
        acc = np.zeros_like(img)
        cnt = np.zeros(v.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            vv = shift(v, dy, dx, False)
            acc += shift(img, dy, dx) * vv[..., None]
            cnt += vv
        grow = (~v) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][..., None]
        v = v | grow
    if not v.all():
        img[~v] = img[v].mean(0)
    return img


# ---------------------------------------------------------------- main
P.build_geometry()
LAY = P.bake_layout(1.0)
os.makedirs(os.path.join(OUT, 'lm'), exist_ok=True)


def group_faces(g):
    """per face: uv poly, 3D verts (three.js coords x, up, south), normal, material, chart id"""
    faces = []
    for key in LAY[g]['keys']:
        p = P.PARTS[key]
        U = LAY[g]['uv'][key]
        for fi, f in enumerate(p['faces']):
            V = [(p['verts'][i][0], p['verts'][i][2], p['verts'][i][1]) for i in f]
            faces.append({'key': key, 'uv': U[fi], 'V': V, 'n': newell(V), 'mat': key[2]})
    # charts = faces connected through identical uv vertices
    parent = list(range(len(faces)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    seen = {}
    for i, f in enumerate(faces):
        for (u, v) in f['uv']:
            k = (round(u * 1e6), round(v * 1e6))
            if k in seen:
                ra, rb = find(i), find(seen[k])
                if ra != rb:
                    parent[ra] = rb
            else:
                seen[k] = i
    roots = {}
    for i, f in enumerate(faces):
        f['chart'] = roots.setdefault(find(i), len(roots) + 1)
    return faces


def process_group(g):
    S = LAY[g]['size']
    W = min(S, MAXW)
    exr = os.path.join(EXR_DIR, '%s_%s.exr' % (g, VARIANT))
    if not os.path.exists(exr):
        log('skip (no exr)', g)
        return
    t0 = time.time()
    faces = group_faces(g)
    rgb = decode_exr(exr, S)
    if S > W:
        k = S // W
        rgb = rgb.reshape(W, k, W, k, 3).mean((1, 3))
    # guide rasters
    fid = Image.new('I', (W, W), 0)
    d = ImageDraw.Draw(fid)
    for i, f in enumerate(faces):
        d.polygon([(u * W - 0.5, (1 - v) * W - 0.5) for u, v in f['uv']], fill=i + 1)
    fid = np.array(fid, np.int32)
    valid = fid > 0
    chart_of = np.array([0] + [f['chart'] for f in faces], np.int32)
    nrm_of = np.array([[0, 1, 0]] + [f['n'] for f in faces], np.float32)
    gain_of = np.array([1.0] + [GAIN_IN if is_interior(g, f['mat']) else GAIN_OUT for f in faces], np.float32)
    chart = chart_of[fid]
    nrm = nrm_of[fid]
    log(g, 'decoded', S, '->', W, 'faces', len(faces), 'charts', chart_of.max(), '%.0fs' % (time.time() - t0))
    den = denoise(rgb, chart, nrm)
    log(g, 'denoised %.0fs' % (time.time() - t0))
    lin = den * gain_of[fid][..., None]
    out = to_srgb(aces(lin * 0.9))
    out = dilate(out.astype(np.float32), valid)
    rng = np.random.default_rng(7)
    out8 = np.clip(out * 255 + rng.random(out.shape, np.float32) - 0.5, 0, 255).astype(np.uint8)
    path = os.path.join(OUT, 'lm', '%s_%s.webp' % (g, VARIANT))
    Image.fromarray(out8).save(path, 'WEBP', quality=88, method=6)
    log(g, 'saved', path, os.path.getsize(path) // 1024, 'KB', '%.0fs' % (time.time() - t0))


def write_geometry():
    """triangulated buckets per (group, material, flags) with lightmap uv; glass included (no lightmap)"""
    buckets = {}
    groups = {}
    for key in P.PARTS:
        groups.setdefault(P.group_of(key), []).append(key)
    for g, keys in groups.items():
        lm = LAY.get(g)
        for key in keys:
            p = P.PARTS[key]
            l, o, mt = key
            fl = flags_of(l, o, mt)
            bk = (g, mt) + fl
            b = buckets.setdefault(bk, {'pos': [], 'nrm': [], 'uv': []})
            U = lm['uv'][key] if lm else None
            for fi, f in enumerate(p['faces']):
                V = [(p['verts'][i][0], p['verts'][i][2], p['verts'][i][1]) for i in f]
                n = newell(V)
                for t in tri_face(V, n):
                    for k in t:
                        b['pos'].extend(V[k])
                        b['nrm'].extend((round(n[0] * 127), round(n[1] * 127), round(n[2] * 127), 0))
                        if U:
                            u, v = U[fi][k]
                            b['uv'].extend((min(65535, max(0, round(u * 65535))), min(65535, max(0, round(v * 65535)))))
                        else:
                            b['uv'].extend((0, 0))
    blob = bytearray()
    man = []
    for bk, b in sorted(buckets.items()):
        n = len(b['pos']) // 3
        if n == 0:
            continue
        g, mt = bk[0], bk[1]
        ent = {'g': g, 'm': mt, 'f': [int(x) for x in bk[2:]], 'n': n, 'o': len(blob),
               'in': int(is_interior(g, mt))}
        blob += np.array(b['pos'], np.float32).tobytes()
        blob += np.array(b['nrm'], np.int8).tobytes()
        blob += np.array(b['uv'], np.uint16).tobytes()
        man.append(ent)
    mats = {}
    for k, (c, r, m, ex) in P.MATERIALS.items():
        mats[k] = {'c': [round(v, 4) for v in c], 'r': r, 'm': m, **{kk: vv for kk, vv in ex.items()}}
    with open(os.path.join(OUT, 'geo.bin'), 'wb') as fh:
        fh.write(blob)
    with open(os.path.join(OUT, 'geo.json'), 'w') as fh:
        json.dump({'buckets': man, 'mats': mats, 'groups': {g: {'size': LAY[g]['size']} for g in LAY}}, fh)
    log('geometry', len(man), 'buckets', len(blob) // 1024, 'KB')


if __name__ == '__main__':
    if VARIANT == 'day' and not ONLY:
        write_geometry()
    for g in LAY:
        if ONLY and g not in ONLY:
            continue
        process_group(g)
