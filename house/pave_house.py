"""
บ้าน Pave ปิ่นเกล้า-ศาลายา 95/118 (แบบ PPY-SH202-L) + ส่วนต่อเติม (Shop drawing 2569-09-28)

ไฟล์เดียวใช้ได้สองทาง
  * เปิดใน Blender 4.2–5.x (แท็บ Scripting > Open > Run Script) : สร้างฉากพร้อมวัสดุ แสง กล้อง ใบไม้ หญ้า
      - แผงควบคุม: ในช่อง 3D กด N > แท็บ "Pave"  (เลือกช็อต, เวลา, เรนเดอร์ทุกช็อต, อบแสง)
      - ภาพนิ่ง: เลือกช็อตแล้วกด F12      - วิดีโอ 24 วิ: Render > Render Animation
      - อบแสงสำหรับเว็บ: ปุ่ม "อบแสง + ส่งออก GLB" -> ~/Downloads/pave_out/bake/
  * รันด้วย Python ธรรมดา : python pave_house.py out.json  ส่งออกรูปทรงให้หน้าเว็บ Three.js

พิกัด (เมตร)  x = ไปทางขวาของแปลน (ตะวันออกของแปลน), y = ลงล่างของแปลน (ด้านหน้าบ้าน/ถนน), z = ความสูง
จุด (0,0) = จุดตัดเส้นกริด 1' กับ A ในแปลน A1-01   ระดับ z = 0.00 คือระดับถนนหน้าบ้าน (±0.00 ในแบบ)
เขตที่ดิน x -1.11 .. 15.84 , y -2.60 .. 10.90 (16.95 x 13.50 ม.)
"""

import math

# ---------------------------------------------------------------------------
# ตั้งค่า (แก้ตรงนี้ได้)
# ---------------------------------------------------------------------------
CONFIG = {
    "OUT_DIR": "~/Downloads/pave_out",   # ที่เก็บภาพเรนเดอร์ / ไฟล์อบแสง / GLB / log
    "QUALITY": "preview",                # "preview" ร่างเร็ว | "final" งานจริง 2560x1440 512 samples
    "START_SHOT": "EXT_Front_Hero",      # ช็อตเริ่มต้นหลังรันสคริปต์
    "FOLIAGE": True,                     # ใบไม้/หญ้าแบบอนุภาค (สวยขึ้นมาก แต่หน้าจอช้าลง)
    "BAKE_SCALE": 1.0,                   # 0.5 = อบแสงครึ่งความละเอียด (ทดสอบเร็ว ~4 เท่า)
    "BAKE_SAMPLES": 384,                 # จำนวน sample ตอนอบแสง (ยิ่งมากยิ่งเนียน)
    "BAKE_NIGHT": True,                  # อบชุดกลางคืนเพิ่ม (เวลาเพิ่มเท่าตัว)
    "SAVE_EXR": True,                    # เก็บค่าแสงจริง (.exr) คู่กับ .png ด้วย
    "AUTO_RUN": None,                    # None | "bake" | "render_all" ทำต่ออัตโนมัติหลังสร้างฉาก
}

# ---------------------------------------------------------------------------
# ระดับหลักจากแบบ
# ---------------------------------------------------------------------------
FFL1 = 0.60          # พื้นชั้นล่าง +0.60
FFL2 = 3.70          # พื้นชั้นบน +3.70
CEIL1 = 3.25         # ฝ้าชั้นล่าง
SLAB_B, SLAB_T = 3.30, 3.70
CEIL2 = 6.10         # ฝ้าชั้นบน
EAVE = 6.15          # ระดับชายคา
CARPORT = 0.20       # จอดรถ +0.20
PORCH = 0.50         # เฉลียง +0.50
LAWN = 0.15
EXT_OFF = 0.20       # ระดับในแบบต่อเติม + 0.20 = ระดับแบบบ้าน
SITE = (-1.11, -2.60, 15.84, 10.90)
GARDEN = (11.15, 10.90, 15.84, 17.00)   # สวนยื่นออกไปทางใต้ (ที่ดินรูปตัว L บ้านหลังสุดซอย)

# ---------------------------------------------------------------------------
# วัสดุ: color(linear), roughness, metalness, extra
#   tex = ชื่อเท็กซ์เจอร์ที่หน้าเว็บสร้างเอง, rep = ขนาด 1 ลาย (ม.)
# ---------------------------------------------------------------------------
MATERIALS = {
    "Ext_Wall":     ((0.42, 0.43, 0.43), 0.90, 0.0, {"tex": "plaster", "rep": 2.0}),
    "Ext_Dark":     ((0.24, 0.25, 0.25), 0.85, 0.0, {"tex": "plaster", "rep": 2.0}),
    "Ext_White":    ((0.80, 0.80, 0.78), 0.80, 0.0, {"tex": "plaster", "rep": 2.0}),
    "Siding":       ((0.36, 0.37, 0.37), 0.75, 0.0, {"tex": "siding", "rep": 1.2}),
    "Int_Wall":     ((0.80, 0.78, 0.73), 0.92, 0.0, {"tex": "plaster", "rep": 2.5}),
    "Int_Olive":    ((0.16, 0.19, 0.12), 0.85, 0.0, {"tex": "plaster", "rep": 2.5}),
    "Moulding":     ((0.90, 0.90, 0.88), 0.60, 0.0, {}),
    "Bath_Tile":    ((0.55, 0.56, 0.56), 0.25, 0.0, {"tex": "tile3060", "rep": 1.2}),
    "Bath_Floor":   ((0.20, 0.21, 0.22), 0.35, 0.0, {"tex": "tile3030", "rep": 0.6}),
    "Floor_Tile":   ((0.72, 0.66, 0.56), 0.30, 0.0, {"tex": "tile60", "rep": 1.2}),
    "Tile_Grey":    ((0.36, 0.36, 0.35), 0.35, 0.0, {"tex": "tile60", "rep": 1.6}),
    "Laminate":     ((0.42, 0.30, 0.20), 0.45, 0.0, {"tex": "laminate", "rep": 2.4}),
    "Porch_Tile":   ((0.20, 0.20, 0.21), 0.55, 0.0, {"tex": "tile60", "rep": 1.2}),
    "Concrete":     ((0.46, 0.46, 0.44), 0.90, 0.0, {"tex": "paver", "rep": 2.4}),
    "Paver_Dark":   ((0.22, 0.22, 0.22), 0.90, 0.0, {"tex": "paver", "rep": 2.4}),
    "Stone_Step":   ((0.55, 0.55, 0.53), 0.85, 0.0, {"tex": "concrete", "rep": 1.0}),
    "Grass":        ((0.07, 0.17, 0.035), 1.00, 0.0, {"tex": "grass", "rep": 5.0}),
    "Paving":       ((0.66, 0.53, 0.38), 0.88, 0.0, {"tex": "stone", "rep": 2.4}),
    "Wood_Tile":    ((0.36, 0.20, 0.10), 0.80, 0.0, {"tex": "woodplank", "rep": 2.4}),
    "Pebble":       ((0.62, 0.60, 0.56), 0.90, 0.0, {"tex": "pebble", "rep": 0.8}),
    "Step_Stone":   ((0.20, 0.19, 0.18), 0.60, 0.0, {"tex": "concrete", "rep": 1.0}),
    "Soil":         ((0.06, 0.04, 0.025), 1.00, 0.0, {"tex": "concrete", "rep": 0.6}),
    "Agave":        ((0.09, 0.19, 0.11), 0.55, 0.0, {}),
    "Fence_Wall":   ((0.80, 0.79, 0.76), 0.85, 0.0, {"tex": "plaster", "rep": 2.0}),
    "Metal_White":  ((0.72, 0.72, 0.69), 0.40, 0.5, {"tex": "metalsheet", "rep": 1.0, "uv": "roof"}),
    "Steel_Brown":  ((0.16, 0.075, 0.04), 0.55, 0.5, {}),
    "Solar":        ((0.02, 0.03, 0.07), 0.12, 0.3, {"tex": "solar", "rep": 1.0}),
    "Alu_Silver":   ((0.55, 0.56, 0.58), 0.35, 0.9, {}),
    "Cat_Orange":   ((0.70, 0.30, 0.07), 0.85, 0.0, {"tex": "fabric", "rep": 0.3}),
    "Cat_Grey":     ((0.22, 0.23, 0.25), 0.85, 0.0, {"tex": "fabric", "rep": 0.3}),
    "Cat_White":    ((0.85, 0.84, 0.80), 0.85, 0.0, {}),
    "Cat_Pink":     ((0.85, 0.45, 0.45), 0.60, 0.0, {}),
    "Cat_Eye":      ((0.25, 0.45, 0.05), 0.05, 0.0, {}),
    "Sisal":        ((0.55, 0.43, 0.27), 0.95, 0.0, {"tex": "fabric", "rep": 0.2}),
    "Cat_Carpet":   ((0.62, 0.60, 0.57), 0.95, 0.0, {"tex": "shag", "rep": 0.5}),
    "Toy_Red":      ((0.75, 0.08, 0.05), 0.50, 0.0, {}),
    "Toy_Yellow":   ((0.85, 0.65, 0.05), 0.50, 0.0, {}),
    "Asphalt":      ((0.07, 0.07, 0.075), 0.95, 0.0, {"tex": "asphalt", "rep": 3.0}),
    "Kerb":         ((0.55, 0.55, 0.53), 0.90, 0.0, {"tex": "concrete", "rep": 1.0}),
    "Roof_Tile":    ((0.15, 0.105, 0.085), 0.55, 0.0, {"tex": "rooftile", "rep": 1.0, "uv": "roof"}),
    "Ridge":        ((0.070, 0.058, 0.052), 0.60, 0.0, {}),
    "Soffit":       ((0.80, 0.80, 0.78), 0.85, 0.0, {}),
    "Fascia":       ((0.85, 0.85, 0.83), 0.55, 0.0, {}),
    "Alu_Dark":     ((0.025, 0.027, 0.03), 0.40, 0.7, {}),
    "Glass":        ((0.75, 0.82, 0.85), 0.02, 0.0, {"glass": True}),
    "Glass_Rail":   ((0.70, 0.80, 0.82), 0.02, 0.0, {"glass": True}),
    "Steel_Black":  ((0.02, 0.02, 0.02), 0.45, 0.6, {}),
    "Door_Grey":    ((0.48, 0.53, 0.56), 0.55, 0.0, {}),
    "Door_White":   ((0.85, 0.85, 0.84), 0.45, 0.0, {}),
    "Chrome":       ((0.85, 0.85, 0.86), 0.15, 1.0, {}),
    "Brass":        ((0.75, 0.55, 0.25), 0.25, 1.0, {}),
    "Fence_Panel":  ((0.75, 0.75, 0.73), 0.90, 0.0, {"tex": "concrete", "rep": 2.0}),
    "Pillar_White": ((0.82, 0.82, 0.80), 0.80, 0.0, {}),
    "Wood_Tread":   ((0.55, 0.36, 0.18), 0.45, 0.0, {"tex": "woodgrain", "rep": 1.0}),
    "Deck_Wood":    ((0.30, 0.17, 0.08), 0.55, 0.0, {"tex": "woodgrain", "rep": 1.0}),
    "Steel_Dark":   ((0.06, 0.06, 0.065), 0.50, 0.7, {}),
    "Roof_Metal":   ((0.16, 0.17, 0.18), 0.45, 0.6, {"tex": "metalsheet", "rep": 1.0, "uv": "roof"}),
    "Ceiling":      ((0.86, 0.85, 0.82), 0.95, 0.0, {}),
    "Light_Warm":   ((1.00, 0.86, 0.68), 0.50, 0.0, {"emit": 6.0}),
    "LED_Strip":    ((1.00, 0.80, 0.55), 0.50, 0.0, {"emit": 10.0}),
    # เฟอร์นิเจอร์ (โทนตามรูปบ้านตัวอย่าง)
    "Velvet_Teal":  ((0.015, 0.11, 0.11), 0.80, 0.0, {"tex": "fabric", "rep": 0.5}),
    "Fabric_Beige": ((0.55, 0.48, 0.38), 0.90, 0.0, {"tex": "fabric", "rep": 0.5}),
    "Fabric_Grey":  ((0.30, 0.32, 0.33), 0.90, 0.0, {"tex": "fabric", "rep": 0.5}),
    "Fabric_Navy":  ((0.02, 0.03, 0.10), 0.85, 0.0, {"tex": "fabric", "rep": 0.5}),
    "Fabric_Olive": ((0.10, 0.12, 0.05), 0.85, 0.0, {"tex": "fabric", "rep": 0.5}),
    "Fabric_Pink":  ((0.75, 0.42, 0.40), 0.90, 0.0, {"tex": "fabric", "rep": 0.5}),
    "Linen_White":  ((0.85, 0.85, 0.83), 0.90, 0.0, {"tex": "fabric", "rep": 0.5}),
    "Rug_Shag":     ((0.33, 0.33, 0.34), 1.00, 0.0, {"tex": "shag", "rep": 0.6}),
    "Curtain_Sheer": ((0.88, 0.87, 0.84), 0.95, 0.0, {"sheer": True}),
    "Curtain_Beige": ((0.66, 0.60, 0.50), 0.95, 0.0, {"tex": "fabric", "rep": 0.5}),
    "Marble":       ((0.85, 0.85, 0.84), 0.15, 0.0, {"tex": "marble", "rep": 1.2}),
    "Sage":         ((0.25, 0.30, 0.22), 0.55, 0.0, {}),
    "Black_Matte":  ((0.02, 0.02, 0.02), 0.60, 0.0, {}),
    "Black_Glass":  ((0.01, 0.01, 0.01), 0.05, 0.3, {}),
    "Oak":          ((0.45, 0.30, 0.16), 0.55, 0.0, {"tex": "woodgrain", "rep": 1.0}),
    "Dark_Cabinet": ((0.06, 0.06, 0.06), 0.45, 0.0, {}),
    "White_Gloss":  ((0.88, 0.88, 0.88), 0.20, 0.0, {}),
    "Ceramic":      ((0.92, 0.92, 0.92), 0.10, 0.0, {}),
    "Mirror":       ((0.90, 0.90, 0.90), 0.02, 1.0, {}),
    "Screen":       ((0.01, 0.012, 0.015), 0.10, 0.2, {}),
    "Smoke_Glass":  ((0.55, 0.55, 0.56), 0.08, 0.6, {}),
    "Leaves":       ((0.06, 0.16, 0.03), 0.85, 0.0, {"tex": "leaves", "rep": 0.8}),
    "Leaves_Light": ((0.15, 0.30, 0.05), 0.85, 0.0, {"tex": "leaves", "rep": 0.8}),
    "Bark":         ((0.12, 0.08, 0.05), 0.95, 0.0, {}),
    "Plant_Pot":    ((0.80, 0.80, 0.78), 0.60, 0.0, {}),
    "Tank":         ((0.60, 0.61, 0.62), 0.40, 0.6, {}),
    "Pump_Blue":    ((0.05, 0.15, 0.45), 0.50, 0.0, {}),
    "AC_White":     ((0.85, 0.86, 0.86), 0.40, 0.0, {}),
}

# ---------------------------------------------------------------------------
# ชั้นรูปทรง (Python ล้วน)
# ---------------------------------------------------------------------------
PARTS = {}            # (layer, obj, mat) -> {verts, faces}
LIGHTS = []           # (layer, (x,y,z), watts, kind)
WASHES = []           # ไฟผนังส่องขึ้น-ลง: (x, y, z, nx, ny)
PORTALS = []          # ช่องหน้าต่าง/ประตูภายนอก สำหรับ light portal
LAYER = ["site"]


def layer(name):
    LAYER[0] = name


def _bl(v):
    """พิกัดแปลน -> พิกัด Blender (x, -y, z) ใช้ตัดสินทิศหน้าของพื้นผิว"""
    return (v[0], -v[1], v[2])


def _newell(pts):
    nx = ny = nz = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return (nx / l, ny / l, nz / l)


def _orient(verts, faces, want):
    """กลับลำดับจุดของหน้าให้ด้านหน้า (normal) ชี้ไปทางที่ต้องการ ในพิกัด Blender
    want: ('center', c) ชี้ออกจากจุดศูนย์กลาง | ('dir', v) ชี้ไปทาง v | ('radial', (cx, cy)) ชี้ออกจากแกนตั้ง"""
    if want is None:
        return faces
    out = []
    kind, w = want
    for f in faces:
        pts = [_bl(verts[i]) for i in f]
        n = _newell(pts)
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        cz = sum(p[2] for p in pts) / len(pts)
        if kind == "center":
            c = _bl(w)
            d = (cx - c[0], cy - c[1], cz - c[2])
        elif kind == "radial":
            c = _bl((w[0], w[1], 0.0))
            d = (cx - c[0], cy - c[1], 0.0)
        else:
            d = _bl(w)
        dot = n[0] * d[0] + n[1] * d[1] + n[2] * d[2]
        out.append(tuple(reversed(f)) if dot < 0 else tuple(f))
    return out


def _centroid(verts):
    n = len(verts)
    return (sum(v[0] for v in verts) / n, sum(v[1] for v in verts) / n, sum(v[2] for v in verts) / n)


def _add(obj, mat, verts, faces, want=None):
    key = (LAYER[0], obj, mat)
    p = PARTS.setdefault(key, {"layer": LAYER[0], "obj": obj, "mat": mat, "verts": [], "faces": []})
    faces = _orient(verts, faces, want)
    off = len(p["verts"])
    p["verts"].extend(verts)
    p["faces"].extend(tuple(i + off for i in f) for f in faces)


def poly(obj, mat, pts3, want=("dir", (0, 0, 1))):
    _add(obj, mat, list(pts3), [tuple(range(len(pts3)))], want)


def _m(mats, k):
    return mats if isinstance(mats, str) else mats.get(k, mats.get("all", "Int_Wall"))


def obox(obj, mats, p, d, u0, u1, v0, v1, zb0, zb1, zt0, zt1, skip=()):
    """กล่องตามแนว d (หน่วย) จากจุด p, n = ตั้งฉากด้านซ้าย(x,y)->(-dy,dx)
    mats: str หรือ dict {pos, neg, top, bot, end}"""
    n = (-d[1], d[0])

    def pt(u, v, z):
        return (p[0] + d[0] * u + n[0] * v, p[1] + d[1] * u + n[1] * v, z)
    V = [pt(u0, v0, zb0), pt(u1, v0, zb1), pt(u1, v1, zb1), pt(u0, v1, zb0),
         pt(u0, v0, zt0), pt(u1, v0, zt1), pt(u1, v1, zt1), pt(u0, v1, zt0)]
    faces = [((0, 3, 2, 1), "bot"), ((4, 5, 6, 7), "top"), ((0, 1, 5, 4), "neg"),
             ((1, 2, 6, 5), "end"), ((2, 3, 7, 6), "pos"), ((3, 0, 4, 7), "end")]
    C = _centroid(V)
    for f, k in faces:
        if k in skip:
            continue
        poly(obj, _m(mats, k), [V[i] for i in f], ("center", C))


def box(obj, mat, x0, y0, x1, y1, z0, z1, skip=()):
    obox(obj, mat, (min(x0, x1), min(y0, y1)), (1, 0), 0, abs(x1 - x0), 0, abs(y1 - y0),
         z0, z0, z1, z1, skip)


def prism(obj, mat, pts, zb, zt, side=None, bottom=True, top=True):
    """แท่งจากรูปหลายเหลี่ยม (x,y) ; zb/zt เป็นเลข หรือ ฟังก์ชัน f(x,y)"""
    fb = zb if callable(zb) else (lambda x, y, c=zb: c)
    ft = zt if callable(zt) else (lambda x, y, c=zt: c)
    n = len(pts)
    if top:
        poly(obj, mat, [(x, y, ft(x, y)) for x, y in pts], ("dir", (0, 0, 1)))
    if bottom:
        poly(obj, mat, [(x, y, fb(x, y)) for x, y in reversed(pts)], ("dir", (0, 0, -1)))
    sm = side or mat
    area2 = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sg = 1.0 if area2 > 0 else -1.0
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        out = (sg * (b[1] - a[1]), -sg * (b[0] - a[0]), 0.0)      # ตั้งฉากขอบ ชี้ออกนอกรูป
        poly(obj, sm, [(a[0], a[1], fb(*a)), (b[0], b[1], fb(*b)),
                       (b[0], b[1], ft(*b)), (a[0], a[1], ft(*a))], ("dir", out))


def cyl(obj, mat, cx, cy, rx, ry, z0, z1, seg=24, caps=True, r1x=None, r1y=None):
    """ทรงกระบอก/กรวยตัด (rx,ry ที่ล่าง, r1x,r1y ที่บน)"""
    r1x = rx if r1x is None else r1x
    r1y = ry if r1y is None else r1y
    b = [(cx + rx * math.cos(2 * math.pi * i / seg), cy + ry * math.sin(2 * math.pi * i / seg), z0) for i in range(seg)]
    t = [(cx + r1x * math.cos(2 * math.pi * i / seg), cy + r1y * math.sin(2 * math.pi * i / seg), z1) for i in range(seg)]
    V = b + t
    F = []
    for i in range(seg):
        j = (i + 1) % seg
        F.append((i, j, seg + j, seg + i))
    if caps:
        F.append(tuple(reversed(range(seg))))
        F.append(tuple(range(seg, 2 * seg)))
    _add(obj, mat, V, F, ("center", (cx, cy, (z0 + z1) / 2)) if caps else ("radial", (cx, cy)))


def sphere(obj, mat, cx, cy, cz, rx, ry=None, rz=None, seg=16, rings=10):
    ry = rx if ry is None else ry
    rz = rx if rz is None else rz
    V = []
    for r in range(rings + 1):
        th = math.pi * r / rings
        for s in range(seg):
            ph = 2 * math.pi * s / seg
            V.append((cx + rx * math.sin(th) * math.cos(ph), cy + ry * math.sin(th) * math.sin(ph),
                      cz + rz * math.cos(th)))
    F = []
    for r in range(rings):
        for s in range(seg):
            a = r * seg + s
            b = r * seg + (s + 1) % seg
            F.append((a, b, b + seg, a + seg))
    _add(obj, mat, V, F, ("center", (cx, cy, cz)))


def lathe(obj, mat, cx, cy, prof, seg=24):
    """หมุนรอบแกน z: prof = [(r, z), ...]"""
    V = []
    for r, z in prof:
        for s in range(seg):
            ph = 2 * math.pi * s / seg
            V.append((cx + r * math.cos(ph), cy + r * math.sin(ph), z))
    F = []
    for k in range(len(prof) - 1):
        for s in range(seg):
            a = k * seg + s
            b = k * seg + (s + 1) % seg
            F.append((a, b, b + seg, a + seg))
    _add(obj, mat, V, F, ("radial", (cx, cy)))


def beam3d(obj, mat, a, b, w, h, up=(0, 0, 1)):
    """คานสี่เหลี่ยมจาก a ไป b (3D)"""
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    t = (dx / L, dy / L, dz / L)
    # side = t x up
    sx, sy, sz = t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]
    sl = math.sqrt(sx * sx + sy * sy + sz * sz) or 1
    s = (sx / sl, sy / sl, sz / sl)
    u = (s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0])
    V = []
    for P in (a, b):
        for cs, cu in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            V.append((P[0] + s[0] * cs * w / 2 + u[0] * cu * h / 2,
                      P[1] + s[1] * cs * w / 2 + u[1] * cu * h / 2,
                      P[2] + s[2] * cs * w / 2 + u[2] * cu * h / 2))
    F = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    _add(obj, mat, V, F, ("center", _centroid(V)))


# ---------------------------------------------------------------------------
# ผนัง ช่องเปิด ประตูหน้าต่าง
# ---------------------------------------------------------------------------
DIRS = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0)}


def _frame(p1, p2):
    L = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    d = ((p2[0] - p1[0]) / L, (p2[1] - p1[1]) / L)
    return d, L, (-d[1], d[0])


def side_mats(p1, p2, ext, ext_mat="Ext_Wall", int_mat="Int_Wall"):
    """คืน (pos, neg) โดยด้าน ext ได้ ext_mat"""
    if ext is None:
        return int_mat, int_mat
    d, L, n = _frame(p1, p2)
    e = DIRS[ext]
    return (ext_mat, int_mat) if n[0] * e[0] + n[1] * e[1] > 0 else (int_mat, ext_mat)


def wall(obj, p1, p2, zb, zt, ops=(), t=0.12, pos="Int_Wall", neg="Int_Wall", top="Int_Wall"):
    """ops = [(u0, u1, z_sill, z_head)] ระยะตามแนวผนังจาก p1 ; zt = เลข หรือ (z@p1, z@p2)"""
    d, L, n = _frame(p1, p2)
    zt1, zt2 = (zt, zt) if not isinstance(zt, tuple) else zt

    def z(u):
        return zt1 + (zt2 - zt1) * u / L
    mats = {"pos": pos, "neg": neg, "top": top, "bot": top, "end": "Int_Wall"}
    cur = 0.0
    for u0, u1, zs, zh in sorted(ops):
        if u0 > cur + 1e-6:
            obox(obj, mats, p1, d, cur, u0, -t / 2, t / 2, zb, zb, z(cur), z(u0))
        if zs > zb + 1e-6:
            obox(obj, mats, p1, d, u0, u1, -t / 2, t / 2, zb, zb, zs, zs, skip=("end",))
        obox(obj, mats, p1, d, u0, u1, -t / 2, t / 2, zh, zh, z(u0), z(u1), skip=("end",))
        cur = u1
    if cur < L - 1e-6:
        obox(obj, mats, p1, d, cur, L, -t / 2, t / 2, zb, zb, z(cur), z(L))


def ewall(obj, p1, p2, zb, zt, ops=(), ext="S", t=0.15, ext_mat="Ext_Wall", int_mat="Int_Wall"):
    pos, neg = side_mats(p1, p2, ext, ext_mat, int_mat)
    wall(obj, p1, p2, zb, zt, ops, t, pos, neg, top=ext_mat)


def unit(obj, p1, p2, u0, u1, zs, zh, kind="slide", panels=2, t=0.15, ext=None,
         trim=True, frame_mat="Alu_Dark", glass="Glass"):
    """หน้าต่าง/ประตูกระจก ในช่องผนัง
    kind: slide (บานเลื่อน), fix, awning, door_slide, swing (ประตูภายในเปิดค้าง 90°), solid"""
    d, L, n = _frame(p1, p2)
    fw, fd = 0.05, 0.05
    if kind == "swing":
        # วงกบ + บานประตูเปิดค้างฉากกับผนัง (ด้าน pos)
        fbox = lambda a, b, za, zb_, m="Door_White": obox(obj, m, p1, d, a, b, -t / 2 - 0.01, t / 2 + 0.01, za, za, zb_, zb_)
        fbox(u0, u0 + 0.04, zs, zh)
        fbox(u1 - 0.04, u1, zs, zh)
        fbox(u0, u1, zh - 0.04, zh)
        w = u1 - u0 - 0.1
        hx, hy = p1[0] + d[0] * (u0 + 0.05) + n[0] * (t / 2), p1[1] + d[1] * (u0 + 0.05) + n[1] * (t / 2)
        obox(obj, "Door_Grey", (hx, hy), n, 0, w, -0.04, 0.0, zs + 0.01, zs + 0.01, zh - 0.05, zh - 0.05)
        kx, ky = hx + n[0] * (w - 0.08), hy + n[1] * (w - 0.08)
        sphere(obj, "Chrome", kx - d[0] * 0.07, ky - d[1] * 0.07, zs + 1.0, 0.03, seg=10, rings=6)
        sphere(obj, "Chrome", kx + d[0] * 0.03, ky + d[1] * 0.03, zs + 1.0, 0.03, seg=10, rings=6)
        return
    fm = frame_mat

    def fb(a, b, za, zb_, v0=-fd / 2, v1=fd / 2, m=None):
        obox(obj, m or fm, p1, d, a, b, v0, v1, za, za, zb_, zb_)
    fb(u0, u0 + fw, zs, zh)
    fb(u1 - fw, u1, zs, zh)
    fb(u0, u1, zh - fw, zh)
    if kind in ("door_slide", "solid"):
        fb(u0, u1, zs - 0.03, zs + 0.006)          # ธรณีประตูเรียบเสมอพื้น
    else:
        fb(u0, u1, zs, zs + fw)
    width = (u1 - u0 - 2 * fw) / panels
    for i in range(panels):
        a = u0 + fw + i * width
        b = a + width
        off = 0.0
        if kind in ("slide", "door_slide"):
            off = 0.012 if i % 2 else -0.012
            fb(a, a + 0.035, zs + fw, zh - fw, off - 0.015, off + 0.015)
            fb(b - 0.035, b, zs + fw, zh - fw, off - 0.015, off + 0.015)
            fb(a, b, zs + fw, zs + fw + 0.04, off - 0.015, off + 0.015)
            fb(a, b, zh - fw - 0.04, zh - fw, off - 0.015, off + 0.015)
        elif i > 0:
            fb(a - 0.02, a + 0.02, zs + fw, zh - fw)
        if kind == "solid":
            fb(a, b, zs + fw, zh - fw, -0.02, 0.02, "Door_Grey")
        else:
            obox(obj, glass, p1, d, a + 0.01, b - 0.01, off - 0.004, off + 0.004,
                 zs + fw, zs + fw, zh - fw, zh - fw)
        if kind in ("door_slide",) and i in (panels // 2 - 1, panels // 2):
            hx = b - 0.08 if i == panels // 2 - 1 else a + 0.06
            fb(hx, hx + 0.02, zs + 0.85, zs + 1.25, off - 0.04, off + 0.04, "Steel_Black")
    if kind == "awning" and panels == 1:
        pass
    if ext and kind != "solid":
        # จดตำแหน่งช่องแสงไว้ทำ light portal ใน Cycles (ช่วยให้แสงเข้าห้องเนียนเร็ว)
        e = DIRS[ext]
        PORTALS.append({"c": (p1[0] + d[0] * (u0 + u1) / 2, p1[1] + d[1] * (u0 + u1) / 2, (zs + zh) / 2),
                        "w": u1 - u0, "h": zh - zs, "in": (-e[0], -e[1]), "off": t / 2 + 0.03})
    if trim and ext:
        # กรอบปูนสีขาวรอบช่องเปิดด้านนอก
        e = DIRS[ext]
        sgn = 1 if n[0] * e[0] + n[1] * e[1] > 0 else -1
        v0, v1 = (t / 2, t / 2 + 0.035) if sgn > 0 else (-t / 2 - 0.035, -t / 2)
        tw = 0.10
        obox(obj, "Ext_White", p1, d, u0 - tw, u0, v0, v1, zs - tw, zs - tw, zh + tw, zh + tw)
        obox(obj, "Ext_White", p1, d, u1, u1 + tw, v0, v1, zs - tw, zs - tw, zh + tw, zh + tw)
        obox(obj, "Ext_White", p1, d, u0, u1, v0, v1, zh, zh, zh + tw, zh + tw)
        if zs > 0.05 and kind not in ("door_slide",):
            obox(obj, "Ext_White", p1, d, u0, u1, v0, v1 + (0.02 if sgn > 0 else 0), zs - tw, zs - tw, zs, zs)


def curtain(obj, mat, p1, p2, v, z0, z1, folds=None, amp=0.035, open_frac=None):
    """ผ้าม่านแบบจีบ เป็นพื้นผิวคลื่น ห่างผนัง v (ด้าน pos)"""
    d, L, n = _frame(p1, p2)
    folds = folds or max(4, int(L / 0.09))
    V = []
    for i in range(folds * 2 + 1):
        u = L * i / (folds * 2)
        w = v + amp * (1 if i % 2 else -1)
        x, y = p1[0] + d[0] * u + n[0] * w, p1[1] + d[1] * u + n[1] * w
        V.append((x, y, z0))
        V.append((x, y, z1))
    F = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(folds * 2)]
    _add(obj, mat, V, F, ("dir", (n[0], n[1], 0.0)))


def curtain_set(obj, p1, p2, v, z0, z1, sheer=True, side_w=0.45, rod=True):
    """ม่านโปร่ง + ม่านทึบสองข้าง + ราวม่านดำ"""
    d, L, n = _frame(p1, p2)
    if sheer:
        curtain(obj, "Curtain_Sheer", p1, p2, v, z0, z1, amp=0.03)
    a2 = (p1[0] + d[0] * side_w, p1[1] + d[1] * side_w)
    b1 = (p2[0] - d[0] * side_w, p2[1] - d[1] * side_w)
    curtain(obj, "Curtain_Beige", p1, a2, v + 0.08, z0, z1, amp=0.05)
    curtain(obj, "Curtain_Beige", b1, p2, v + 0.08, z0, z1, amp=0.05)
    if rod:
        ext_ = 0.15
        a = (p1[0] - d[0] * ext_ + n[0] * (v + 0.05), p1[1] - d[1] * ext_ + n[1] * (v + 0.05), z1 + 0.06)
        b = (p2[0] + d[0] * ext_ + n[0] * (v + 0.05), p2[1] + d[1] * ext_ + n[1] * (v + 0.05), z1 + 0.06)
        beam3d(obj, "Steel_Black", a, b, 0.025, 0.025)


def downlight(obj, x, y, z, r=0.07, watts=12, lyr=None):
    cyl(obj, "Light_Warm", x, y, r, r, z - 0.006, z, seg=16)
    cyl(obj, "Chrome", x, y, r + 0.015, r + 0.015, z - 0.004, z - 0.001, seg=16, caps=False)
    LIGHTS.append((lyr or LAYER[0], (x, y, z - 0.05), watts, "down"))


# ---------------------------------------------------------------------------
# หลังคา
# ---------------------------------------------------------------------------
def hip_roof(obj, x0, y0, x1, y1, ze, slope, th=0.10, fascia=0.22, mat="Roof_Tile"):
    """หลังคาปั้นหยาบนสี่เหลี่ยม (รวมชายคาแล้ว)"""
    w, dpt = x1 - x0, y1 - y0
    if w >= dpt:
        h = dpt / 2
        zr = ze + h * slope
        ym = (y0 + y1) / 2
        A, B, C, D = (x0, y0, ze), (x1, y0, ze), (x1, y1, ze), (x0, y1, ze)
        R1, R2 = (x0 + h, ym, zr), (x1 - h, ym, zr)
        faces = [(A, B, R2, R1), (C, D, R1, R2), (D, A, R1), (B, C, R2)]
        ridge = (R1, R2)
    else:
        h = w / 2
        zr = ze + h * slope
        xm = (x0 + x1) / 2
        A, B, C, D = (x0, y0, ze), (x1, y0, ze), (x1, y1, ze), (x0, y1, ze)
        R1, R2 = (xm, y0 + h, zr), (xm, y1 - h, zr)
        faces = [(A, B, R1), (B, C, R2, R1), (C, D, R2), (D, A, R1, R2)]
        ridge = (R1, R2)
    for f in faces:
        poly(obj, mat, list(f), ("dir", (0, 0, 1)))
        poly(obj, "Soffit", [(p[0], p[1], p[2] - th) for p in reversed(f)], ("dir", (0, 0, -1)))
    # ครอบสันและครอบตะเข้สัน
    beam3d(obj, "Ridge", (ridge[0][0], ridge[0][1], ridge[0][2] + 0.04),
           (ridge[1][0], ridge[1][1], ridge[1][2] + 0.04), 0.22, 0.10)
    for c, r in ((A, ridge[0]), (D, ridge[0] if w >= dpt else ridge[1]),
                 (B, ridge[1] if w >= dpt else ridge[0]), (C, ridge[1])):
        beam3d(obj, "Ridge", (c[0], c[1], c[2] + 0.04), (r[0], r[1], r[2] + 0.04), 0.20, 0.08)
    # เชิงชาย + รางน้ำสีขาว
    for a, b in ((A, B), (B, C), (C, D), (D, A)):
        beam3d(obj, "Fascia", (a[0], a[1], ze - fascia / 2 + 0.02), (b[0], b[1], ze - fascia / 2 + 0.02),
               0.06, fascia)
    return zr


def gable_roof(obj, xl, xr, xc, yf, yb, ze, zr, th=0.10, mat="Roof_Tile"):
    """หลังคาจั่วสันตามแนว y (ยื่นมาทางหน้าบ้าน yf)"""
    L = [(xl, yf, ze), (xc, yf, zr), (xc, yb, zr), (xl, yb, ze)]
    R = [(xc, yf, zr), (xr, yf, ze), (xr, yb, ze), (xc, yb, zr)]
    for f in (L, R):
        poly(obj, mat, f, ("dir", (0, 0, 1)))
        poly(obj, "Soffit", [(p[0], p[1], p[2] - th) for p in reversed(f)], ("dir", (0, 0, -1)))
    beam3d(obj, "Ridge", (xc, yf, zr + 0.04), (xc, yb, zr + 0.04), 0.22, 0.10)
    # ปั้นลมกรอบสีขาวหนา
    k = (zr - ze) / (xc - xl)
    bw = 0.34
    for xa, sgn in ((xl, 1), (xr, -1)):
        beam3d(obj, "Fascia", (xa, yf + 0.05, ze - 0.10), (xc, yf + 0.05, zr - 0.10), 0.16, bw)
    beam3d(obj, "Fascia", (xl, yf, ze - 0.12), (xl, yb, ze - 0.12), 0.06, 0.22)
    beam3d(obj, "Fascia", (xr, yf, ze - 0.12), (xr, yb, ze - 0.12), 0.06, 0.22)
    return k


# ---------------------------------------------------------------------------
# บันไดไม้ ราวเหล็กดำ
# ---------------------------------------------------------------------------
def stair():
    n_r = 17
    h = (FFL2 - FFL1) / n_r
    steps = []
    # ช่วงแรก ขึ้นไปทางทิศใต้ x 5.45..6.40
    for k in range(1, 5):
        ya = 4.35 + 0.22 * (k - 1)
        steps.append([(5.47, ya), (6.40, ya), (6.40, ya + 0.22), (5.47, ya + 0.22)])
    # ขั้นบันไดเวียน 180° รอบจุด (6.40, 5.23)
    cx, cy = 6.40, 5.23
    xa, xb, yb = 5.47, 7.38, 6.13

    def hit(a):
        dx, dy = math.cos(a), math.sin(a)
        ts = []
        if dx < -1e-9:
            ts.append((xa - cx) / dx)
        if dx > 1e-9:
            ts.append((xb - cx) / dx)
        if dy > 1e-9:
            ts.append((yb - cy) / dy)
        t = min(x for x in ts if x > 0)
        return (cx + dx * t, cy + dy * t)
    corners = [(math.atan2(yb - cy, xa - cx), (xa, yb)), (math.atan2(yb - cy, xb - cx), (xb, yb))]
    for i in range(4):
        a1 = math.pi - i * math.pi / 4
        a2 = math.pi - (i + 1) * math.pi / 4
        pts = [(cx, cy), hit(a1)]
        for ac, pc in corners:
            if a2 < ac < a1:
                pts.append(pc)
        pts.append(hit(a2))
        steps.append(pts)
    # ช่วงที่สอง ขึ้นไปทางทิศเหนือ x 6.40..7.38
    for k in range(8):
        y1 = 5.23 - 0.2225 * k
        steps.append([(6.40, y1 - 0.2225), (7.38, y1 - 0.2225), (7.38, y1), (6.40, y1)])
    steps.append([(6.40, 3.25), (7.38, 3.25), (7.38, 3.45), (6.40, 3.45)])
    for i, pts in enumerate(steps):
        ztop = FFL1 + h * (i + 1)
        prism("Stair", "Ext_White", pts, FFL1, ztop - 0.03, bottom=False)
        # ลูกนอนไม้ยื่นออก 2 ซม.
        prism("Stair_Tread", "Wood_Tread", pts, ztop - 0.03, ztop, bottom=True)
    # ราวบันได: ลูกกรงเหล็กดำ + ราวจับไม้
    def tread_z(y):            # ระดับขั้นช่วงที่สอง ตามแนว y
        k = (5.23 - y) / 0.2225
        return FFL1 + h * (8 + max(0.0, min(9.0, k)))
    x = 6.40
    for i in range(16):
        y = 5.15 - i * 0.12
        if y < 3.30:
            break
        zt = tread_z(y)
        box("Stair_Rail", "Steel_Black", x - 0.012, y - 0.012, x + 0.012, y + 0.012, zt, zt + 0.92)
    beam3d("Stair_Rail", "Wood_Tread", (x, 5.25, tread_z(5.25) + 0.95), (x, 3.25, FFL2 + 0.95), 0.05, 0.045)
    for y in (5.22, 3.27):
        box("Stair_Rail", "Steel_Black", x - 0.025, y - 0.025, x + 0.025, y + 0.025, FFL1 if y > 5 else FFL2, tread_z(y) + 0.97)
    # ราวกันตกชั้นบนรอบช่องบันได
    for (xa_, ya_), (xb_, yb_) in (((5.47, 4.50), (6.40, 4.50)), ((6.40, 3.27), (6.40, 4.50))):
        L = math.hypot(xb_ - xa_, yb_ - ya_)
        nb = int(L / 0.12)
        for j in range(nb + 1):
            px = xa_ + (xb_ - xa_) * j / nb
            py = ya_ + (yb_ - ya_) * j / nb
            box("Stair_Rail", "Steel_Black", px - 0.012, py - 0.012, px + 0.012, py + 0.012, FFL2, FFL2 + 0.95)
        beam3d("Stair_Rail", "Wood_Tread", (xa_, ya_, FFL2 + 0.97), (xb_, yb_, FFL2 + 0.97), 0.05, 0.045)
    # ประตูห้องเก็บของใต้บันได (หน้าทิศตะวันตก)
    box("Stair", "Door_Grey", 6.37, 3.30, 6.40, 4.10, FFL1, FFL1 + 2.0)
    sphere("Stair", "Chrome", 6.35, 4.00, FFL1 + 1.0, 0.03, seg=10, rings=6)


# ---------------------------------------------------------------------------
# ตัวบ้าน ชั้นล่าง
# ---------------------------------------------------------------------------
def house_ground():
    layer("house_g")
    zb, zt = 0.0, SLAB_B
    W = "G_Walls"
    hs, hd = FFL1 + 2.05, FFL1 + 2.05          # ระดับหัววงกบ
    # พื้นชั้นล่าง (ฐาน) และวัสดุผิวพื้นแต่ละห้อง
    gf = [(2.40, -0.50), (6.05, -0.50), (6.05, 0.05), (13.75, 0.05), (13.75, 3.60), (10.85, 3.60),
          (10.85, 6.20), (5.40, 6.20), (5.40, 3.10), (2.40, 3.10)]
    prism("G_Slab", "Ext_Dark", gf, 0.0, FFL1 - 0.01, top=False)
    prism("G_Floor", "Floor_Tile", [(2.40, -0.50), (6.05, -0.50), (6.05, 0.05), (10.85, 0.05), (10.85, 3.60),
                                    (10.85, 6.20), (7.45, 6.20), (7.45, 3.10), (5.30, 3.10), (5.30, 1.60), (2.40, 1.60)],
          FFL1 - 0.02, FFL1, bottom=False)
    prism("G_Floor", "Floor_Tile", [(5.40, 3.10), (6.40, 3.10), (6.40, 6.20), (5.40, 6.20)], FFL1 - 0.02, FFL1, bottom=False)
    prism("G_Floor", "Floor_Tile", [(10.85, 0.05), (13.75, 0.05), (13.75, 3.60), (10.85, 3.60)], FFL1 - 0.02, FFL1, bottom=False)
    prism("G_Floor", "Bath_Floor", [(2.40, 1.60), (5.30, 1.60), (5.30, 3.10), (2.40, 3.10)], FFL1 - 0.06, FFL1 - 0.04, bottom=False)

    # ผนังภายนอก
    ewall(W, (2.40, -0.50), (2.40, 3.10), zb, zt, [(2.35, 2.85, FFL1 + 1.30, FFL1 + 1.95)], ext="W")
    unit(W, (2.40, -0.50), (2.40, 3.10), 2.35, 2.85, FFL1 + 1.30, FFL1 + 1.95, "awning", 1, ext="W")
    k_ops = [(0.70, 1.45, FFL1 + 1.15, hs), (1.85, 2.75, FFL1, hd)]
    ewall(W, (2.40, -0.50), (6.05, -0.50), zb, zt, k_ops, ext="N")
    unit(W, (2.40, -0.50), (6.05, -0.50), 0.70, 1.45, FFL1 + 1.15, hs, "slide", 2, ext="N")
    unit(W, (2.40, -0.50), (6.05, -0.50), 1.85, 2.75, FFL1, hd, "swing", t=0.15)
    box(W, "Ext_Wall", 5.35, -0.58, 6.12, 0.12, zb, zt)                       # เสา
    d_ops = [(0.40, 1.95, FFL1 + 0.45, hs), (2.50, 4.00, FFL1 + 0.45, hs), (5.50, 7.00, FFL1 + 0.45, hs)]
    ewall(W, (6.05, 0.05), (13.75, 0.05), zb, zt, d_ops, ext="N")
    for o in d_ops:
        unit(W, (6.05, 0.05), (13.75, 0.05), o[0], o[1], o[2], o[3], "slide", 2, ext="N")
    ewall(W, (13.75, 0.05), (13.75, 3.60), zb, zt, [(0.25, 1.05, FFL1, hd)], ext="E")
    unit(W, (13.75, 0.05), (13.75, 3.60), 0.25, 1.05, FFL1, hd, "door_slide", 1, ext="E")
    # ห้องนอน 4 -> ห้องอเนกประสงค์: ประตูบานเลื่อนสูงจรดพื้น เดินผ่านได้
    ewall(W, (13.75, 3.60), (10.85, 3.60), zb, zt, [(0.70, 2.20, FFL1, hd)], ext="S")
    unit(W, (13.75, 3.60), (10.85, 3.60), 0.70, 2.20, FFL1, hd, "door_slide", 2, ext="S")
    ewall(W, (10.85, 3.60), (10.85, 6.20), zb, zt, [(0.35, 1.95, FFL1 + 0.45, hs)], ext="E")
    unit(W, (10.85, 3.60), (10.85, 6.20), 0.35, 1.95, FFL1 + 0.45, hs, "slide", 2, ext="E")
    ewall(W, (10.85, 6.20), (5.40, 6.20), zb, zt, [(0.75, 2.65, FFL1, hd)], ext="S")
    unit(W, (10.85, 6.20), (5.40, 6.20), 0.75, 2.65, FFL1, hd, "door_slide", 2, ext="S")
    ewall(W, (5.40, 6.20), (5.40, 3.10), zb, zt, [(2.15, 3.05, FFL1, hd)], ext="W")
    unit(W, (5.40, 6.20), (5.40, 3.10), 2.15, 3.05, FFL1, hd, "door_slide", 2, ext="W")
    ewall(W, (5.40, 3.10), (2.40, 3.10), zb, zt, [], ext="S")

    # ผนังภายใน
    wall(W, (2.45, 1.60), (5.30, 1.60), FFL1, CEIL1, [], 0.10, "Int_Wall", "Bath_Tile")
    wall(W, (5.25, 1.65), (5.25, 3.05), FFL1, CEIL1, [(0.05, 0.85, FFL1, hd)], 0.10, "Int_Wall", "Bath_Tile")
    unit(W, (5.25, 1.65), (5.25, 3.05), 0.05, 0.85, FFL1, hd, "swing", t=0.10)
    box(W, "Bath_Tile", 2.48, 1.66, 2.49, 3.02, FFL1, CEIL1)
    box(W, "Bath_Tile", 2.48, 3.01, 5.20, 3.02, FFL1, CEIL1)
    wall(W, (10.85, 0.10), (10.85, 3.55), FFL1, CEIL1, [(1.60, 2.45, FFL1, hd)], 0.10)
    unit(W, (10.85, 0.10), (10.85, 3.55), 1.60, 2.45, FFL1, hd, "swing", t=0.10)
    wall(W, (7.45, 3.10), (7.45, 6.15), FFL1, CEIL1, [], 0.10)
    wall(W, (6.40, 3.10), (7.45, 3.10), FFL1, CEIL1, [], 0.10)

    # ผนังบัวทาสีเขียวมะกอกครึ่งล่าง + คิ้วบัว (ห้องรับแขก/ทานอาหาร ตามรูปตัวอย่าง)
    for a, b in (((7.51, 3.25), (7.51, 6.10)), ((6.10, 0.12), (10.78, 0.12)), ((10.78, 0.12), (10.78, 3.10))):
        if a[0] == b[0]:
            sx = 1 if a[0] < 9 else -1
            box("G_Wainscot", "Int_Olive", a[0], a[1], a[0] + 0.012 * sx, b[1], FFL1, FFL1 + 0.95)
            box("G_Wainscot", "Moulding", a[0], a[1], a[0] + 0.025 * sx, b[1], FFL1 + 0.95, FFL1 + 0.99)
            box("G_Wainscot", "Moulding", a[0], a[1], a[0] + 0.02 * sx, b[1], FFL1, FFL1 + 0.10)
        else:
            box("G_Wainscot", "Int_Olive", a[0], a[1], b[0], a[1] + 0.012, FFL1, FFL1 + 0.95)
            box("G_Wainscot", "Moulding", a[0], a[1], b[0], a[1] + 0.025, FFL1 + 0.95, FFL1 + 0.99)

    # ฝ้าเพดาน + ฝ้าหลุม (tray) พร้อมไฟซ่อน
    prism("G_Ceiling", "Ceiling", gf, CEIL1, CEIL1 + 0.01, top=False)
    for (x0, y0, x1, y1) in ((6.15, 0.15, 10.75, 3.00), (7.55, 3.20, 10.75, 6.10)):
        box("G_Ceiling", "Ceiling", x0, y0, x1, y0 + 0.45, CEIL1 - 0.15, CEIL1)
        box("G_Ceiling", "Ceiling", x0, y1 - 0.45, x1, y1, CEIL1 - 0.15, CEIL1)
        box("G_Ceiling", "Ceiling", x0, y0, x0 + 0.45, y1, CEIL1 - 0.15, CEIL1)
        box("G_Ceiling", "Ceiling", x1 - 0.45, y0, x1, y1, CEIL1 - 0.15, CEIL1)
        box("G_Ceiling", "LED_Strip", x0 + 0.45, y0 + 0.45, x1 - 0.45, y0 + 0.47, CEIL1 - 0.15, CEIL1 - 0.13)
        for y in (y0 + 0.22, y1 - 0.22):
            for x in (x0 + 1.0, (x0 + x1) / 2, x1 - 1.0):
                downlight("G_Ceiling", x, y, CEIL1 - 0.15)
    for x, y in ((3.3, 0.3), (4.8, 0.3), (3.9, 2.3), (6.9, 3.6), (5.9, 3.6), (12.3, 1.8), (12.3, 0.8), (12.3, 2.8)):
        downlight("G_Ceiling", x, y, CEIL1)

    # ฐานบ้าน (บัวเชิงผนังสีเข้ม)
    for a, b in zip(gf, gf[1:] + gf[:1]):
        pass

    # เฉลียง +0.50 และกรอบซุ้มหน้าบ้าน
    box("G_Porch", "Porch_Tile", 5.45, 6.27, 10.85, 7.15, 0.0, PORCH + 0.03)
    F = "G_PorchFrame"
    box(F, "Ext_Dark", 5.40, 6.27, 5.75, 7.20, 0.0, SLAB_T - 0.15)            # เสาซ้าย
    box(F, "Ext_Dark", 10.60, 6.27, 10.95, 7.20, 0.0, SLAB_T - 0.15)          # เสาขวา
    box(F, "Ext_Dark", 5.40, 6.27, 10.95, 7.20, 3.00, SLAB_T - 0.15)          # คานบน
    box(F, "Ext_White", 5.40, 7.20, 10.95, 7.24, 2.95, SLAB_T - 0.10)
    for x0 in (5.40, 10.91):
        box(F, "Ext_White", x0, 7.20, x0 + 0.04, 7.24, 0.0, 2.95)
    box(F, "Ext_Wall", 5.75, 6.27, 10.60, 7.20, 2.98, 3.00)                     # ฝ้าใต้คาน
    downlight(F, 8.15, 6.75, 2.98)
    downlight(F, 6.40, 6.75, 2.98)

    # โรงจอดรถ: พื้น + พื้นคอนกรีตหลังคา + เสา
    box("G_Carport", "Paving", -0.12, 2.90, 5.40, 6.45, 0.0, CARPORT)
    # ประตูบานเลื่อนจากโรงจอดรถเข้าโถงบันได + ขั้นบันไดขึ้น 3 ขั้น (+0.20 -> +0.60)
    xw = 5.40 - 0.075
    for xa, zt_ in ((xw - 0.56, 0.333), (xw - 0.28, 0.467)):        # บันไดเล็ก 2 ขั้น ลูกตั้ง 13 ซม. ลูกนอน 28 ซม.
        box("G_Carport", "Step_Stone", xa, 3.12, xw, 4.08, CARPORT, zt_ - 0.02)
        box("G_Carport", "Wood_Tread", xa - 0.02, 3.12, xw, 4.08, zt_ - 0.02, zt_)
    C = "G_CarportRoof"
    box(C, "Ext_Dark", -0.15, 2.85, 5.40, 6.48, 2.80, SLAB_T - 0.15)
    box(C, "Ext_Wall", -0.10, 2.90, 5.35, 6.42, 2.78, 2.80)
    box(C, "Ext_White", -0.19, 6.48, 5.40, 6.52, 2.78, SLAB_T - 0.12)
    box(C, "Ext_White", -0.19, 2.85, -0.15, 6.52, 2.78, SLAB_T - 0.12)
    for y0, y1 in ((2.90, 3.85), (5.45, 6.42)):
        box(C, "Ext_Dark", -0.12, y0, 0.15, y1, 0.0, 2.80)
    downlight(C, 1.3, 4.6, 2.78)
    downlight(C, 3.8, 4.6, 2.78)

    # บัวพื้นชั้นสอง (แถบปูนสีขาวรอบอาคาร)
    stair()


# ---------------------------------------------------------------------------
# ตัวบ้าน ชั้นบน
# ---------------------------------------------------------------------------
def house_upper():
    layer("house_u")
    W = "U_Walls"
    zb, zt = SLAB_T, EAVE
    hs = FFL2 + 2.05
    # พื้นโครงสร้าง (เว้นช่องบันได)
    slab = [[(2.40, -0.55), (5.45, -0.55), (5.45, 6.25), (2.40, 6.25)],
            [(5.45, 0.05), (13.75, 0.05), (13.75, 3.25), (5.45, 3.25)],
            [(7.45, 3.25), (13.75, 3.25), (13.75, 3.65), (7.45, 3.65)],
            [(5.45, 3.25), (6.40, 3.25), (6.40, 4.50), (5.45, 4.50)],
            [(7.45, 3.65), (10.95, 3.65), (10.95, 6.25), (7.45, 6.25)]]
    for s in slab:
        prism("U_Slab", "Ext_White", s, SLAB_B, SLAB_T - 0.01)
    # แถบคิ้วปูนรอบพื้นชั้นสอง
    band = [(2.33, -0.62), (5.52, -0.62), (5.52, -0.02), (13.82, -0.02), (13.82, 3.72), (11.02, 3.72),
            (11.02, 6.32), (2.33, 6.32)]
    prism("U_Band", "Ext_White", band, SLAB_B + 0.10, SLAB_B + 0.25)
    # ผิวพื้นลามิเนต / ห้องน้ำ
    lam = [(2.40, -0.55), (5.45, -0.55), (5.45, 0.05), (7.45, 0.05), (7.45, 2.05), (10.95, 2.05),
           (10.95, 0.05), (13.75, 0.05), (13.75, 3.65), (10.95, 3.65), (10.95, 6.25), (2.40, 6.25)]
    prism("U_Floor", "Laminate", [(2.40, -0.55), (5.45, -0.55), (5.45, 6.25), (2.40, 6.25)], SLAB_T - 0.01, FFL2, bottom=False)
    prism("U_Floor", "Laminate", [(5.45, 2.05), (7.45, 2.05), (7.45, 3.25), (5.45, 3.25)], SLAB_T - 0.01, FFL2, bottom=False)
    prism("U_Floor", "Laminate", [(5.45, 3.25), (6.40, 3.25), (6.40, 4.50), (5.45, 4.50)], SLAB_T - 0.01, FFL2, bottom=False)
    prism("U_Floor", "Laminate", [(7.45, 0.05), (10.95, 0.05), (10.95, 6.25), (7.45, 6.25)], SLAB_T - 0.01, FFL2, bottom=False)
    prism("U_Floor", "Laminate", [(10.95, 1.85), (13.75, 1.85), (13.75, 3.65), (10.95, 3.65)], SLAB_T - 0.01, FFL2, bottom=False)
    prism("U_Floor", "Bath_Floor", [(5.45, 0.05), (7.45, 0.05), (7.45, 2.05), (5.45, 2.05)], SLAB_T - 0.01, FFL2 - 0.04, bottom=False)
    prism("U_Floor", "Bath_Floor", [(10.95, 0.05), (13.75, 0.05), (13.75, 1.85), (10.95, 1.85)], SLAB_T - 0.01, FFL2 - 0.04, bottom=False)

    # ผนังภายนอก
    ewall(W, (2.40, -0.55), (5.45, -0.55), zb, zt, [(0.70, 2.20, FFL2 + 0.80, hs)], ext="N")
    unit(W, (2.40, -0.55), (5.45, -0.55), 0.70, 2.20, FFL2 + 0.80, hs, "slide", 2, ext="N")
    ewall(W, (5.45, -0.55), (5.45, 0.05), zb, zt, [], ext="E")
    n_ops = [(0.85, 1.35, FFL2 + 1.30, hs), (3.40, 4.60, FFL2 + 0.80, hs)]
    ewall(W, (5.45, 0.05), (13.75, 0.05), zb, zt, n_ops, ext="N")
    unit(W, (5.45, 0.05), (13.75, 0.05), 0.85, 1.35, FFL2 + 1.30, hs, "awning", 1, ext="N")
    unit(W, (5.45, 0.05), (13.75, 0.05), 3.40, 4.60, FFL2 + 0.80, hs, "slide", 2, ext="N")
    e_ops = [(0.55, 1.05, FFL2 + 1.30, hs), (2.10, 2.80, FFL2 + 0.80, hs)]
    ewall(W, (13.75, 0.05), (13.75, 3.65), zb, zt, e_ops, ext="E", ext_mat="Siding")
    unit(W, (13.75, 0.05), (13.75, 3.65), 0.55, 1.05, FFL2 + 1.30, hs, "awning", 1, ext="E")
    unit(W, (13.75, 0.05), (13.75, 3.65), 2.10, 2.80, FFL2 + 0.80, hs, "fix", 1, ext="E")
    ewall(W, (13.75, 3.65), (10.95, 3.65), zb, zt, [], ext="S", ext_mat="Siding")
    ewall(W, (10.95, 3.65), (10.95, 6.25), zb, zt, [(0.80, 1.60, FFL2 + 0.80, hs)], ext="E")
    unit(W, (10.95, 3.65), (10.95, 6.25), 0.80, 1.60, FFL2 + 0.80, hs, "slide", 2, ext="E")
    s_ops = [(0.70, 2.65, FFL2, hs), (4.10, 4.80, FFL2 + 0.60, EAVE - 0.25), (6.65, 7.85, FFL2 + 0.50, hs)]
    ewall(W, (10.95, 6.25), (2.40, 6.25), zb, zt, s_ops[:1], ext="S", ext_mat="Siding", t=0.15)
    unit(W, (10.95, 6.25), (2.40, 6.25), 0.70, 2.65, FFL2, hs, "door_slide", 2, ext="S")
    # ช่วงซ้ายของผนังทิศใต้เป็นปูนสีเทา (แยกเพื่อเปลี่ยนวัสดุ)
    ewall(W, (7.45, 6.25), (2.40, 6.25), zb, zt, [(o[0] - 3.50, o[1] - 3.50, o[2], o[3]) for o in s_ops[1:]], ext="S")
    unit(W, (7.45, 6.25), (2.40, 6.25), 0.60, 1.30, FFL2 + 0.60, EAVE - 0.25, "fix", 1, ext="S")
    unit(W, (7.45, 6.25), (2.40, 6.25), 3.15, 4.35, FFL2 + 0.50, hs, "slide", 2, ext="S")
    w_ops = [(1.00, 2.40, FFL2 + 0.80, hs), (4.45, 5.85, FFL2 + 0.80, hs)]
    ewall(W, (2.40, 6.25), (2.40, -0.55), zb, zt, w_ops, ext="W")
    for o in w_ops:
        unit(W, (2.40, 6.25), (2.40, -0.55), o[0], o[1], o[2], o[3], "slide", 2, ext="W")

    # ผนังภายใน
    zi = CEIL2
    wall(W, (5.45, 0.05), (5.45, 6.20), zb, zi, [(2.05, 2.85, FFL2, hs), (3.25, 4.05, FFL2, hs)], 0.10)
    unit(W, (5.45, 6.20), (5.45, 0.05), 6.15 - 2.85, 6.15 - 2.05, FFL2, hs, "swing", t=0.10)
    unit(W, (5.45, 0.05), (5.45, 6.20), 3.25, 4.05, FFL2, hs, "swing", t=0.10)
    wall(W, (2.45, 2.95), (5.40, 2.95), zb, zi, [], 0.10)
    wall(W, (5.50, 2.05), (7.40, 2.05), zb, zi, [(1.05, 1.85, FFL2, hs)], 0.10, "Int_Wall", "Bath_Tile")
    unit(W, (7.40, 2.05), (5.50, 2.05), 0.05, 0.85, FFL2, hs, "swing", t=0.10)
    wall(W, (7.45, 0.10), (7.45, 6.20), zb, zi, [(2.00, 2.85, FFL2, hs)], 0.10)
    unit(W, (7.45, 6.20), (7.45, 0.10), 6.10 - 2.85, 6.10 - 2.00, FFL2, hs, "swing", t=0.10)
    wall(W, (10.95, 0.10), (10.95, 1.85), zb, zi, [], 0.10, "Bath_Tile", "Int_Wall")
    wall(W, (11.00, 1.85), (13.70, 1.85), zb, zi, [(1.20, 1.95, FFL2, hs)], 0.10, "Int_Wall", "Bath_Tile")
    unit(W, (13.70, 1.85), (11.00, 1.85), 0.75, 1.50, FFL2, hs, "swing", t=0.10)
    for x0, y0, x1, y1 in ((5.50, 0.10, 7.40, 2.00), (11.00, 0.10, 13.70, 1.80)):
        box(W, "Bath_Tile", x0, y0, x1, y0 + 0.01, FFL2, CEIL2)
        box(W, "Bath_Tile", x1 - 0.01, y0, x1, y1, FFL2, CEIL2)
        box(W, "Bath_Tile", x0, y0, x0 + 0.01, y1, FFL2, CEIL2)

    # ฝ้าชั้นบน
    up = [(2.40, -0.55), (5.45, -0.55), (5.45, 0.05), (13.75, 0.05), (13.75, 3.65), (10.95, 3.65), (10.95, 6.25), (2.40, 6.25)]
    prism("U_Ceiling", "Ceiling", up, CEIL2, CEIL2 + 0.01, top=False)
    x0, y0, x1, y1 = 7.60, 2.30, 10.80, 6.10
    for bx in ((x0, y0, x1, y0 + 0.40), (x0, y1 - 0.40, x1, y1), (x0, y0, x0 + 0.40, y1), (x1 - 0.40, y0, x1, y1)):
        box("U_Ceiling", "Ceiling", bx[0], bx[1], bx[2], bx[3], CEIL2 - 0.15, CEIL2)
    for x in (8.4, 10.0):
        for y in (2.5, 5.9):
            downlight("U_Ceiling", x, y, CEIL2 - 0.15)
    for x, y in ((3.9, 1.2), (3.9, 4.6), (6.4, 1.0), (6.4, 2.7), (9.2, 1.0), (12.3, 1.0), (12.3, 2.8), (5.9, 3.9)):
        downlight("U_Ceiling", x, y, CEIL2)

    # ระเบียงห้องนอนใหญ่ ราวกระจก
    box("U_Balcony", "Porch_Tile", 7.45, 6.32, 10.70, 6.95, SLAB_B, FFL2 - 0.05)
    box("U_Balcony", "Ext_White", 7.45, 6.95, 10.70, 7.00, SLAB_B, FFL2 + 0.05)
    for x0, x1 in ((7.50, 8.55), (8.60, 9.65), (9.70, 10.65)):
        box("U_Balcony", "Glass_Rail", x0, 6.90, x1, 6.92, FFL2 + 0.08, FFL2 + 1.02)
    box("U_Balcony", "Steel_Black", 7.45, 6.88, 10.70, 6.94, FFL2 + 1.02, FFL2 + 1.06)
    box("U_Balcony", "Steel_Black", 10.66, 6.32, 10.70, 6.94, FFL2 + 0.05, FFL2 + 1.06)
    box("U_Balcony", "Glass_Rail", 10.67, 6.35, 10.69, 6.88, FFL2 + 0.08, FFL2 + 1.02)
    for x in (7.47, 8.575, 9.675):
        box("U_Balcony", "Steel_Black", x - 0.02, 6.88, x + 0.02, 6.94, FFL2 + 0.05, FFL2 + 1.06)
    # กันสาดคอนกรีตหน้าบันได
    box("U_Canopy", "Ext_White", 5.40, 6.27, 7.45, 7.30, SLAB_T - 0.15, SLAB_T - 0.05)

    # คอมเพรสเซอร์แอร์
    for x, y in ((10.25, -0.35),):
        box("U_AC", "AC_White", x, y - 0.15, x + 0.75, y + 0.15, LAWN + 0.15, LAWN + 0.70)


def gable_face():
    """หน้าจั่วด้านหน้า (ไม้ฝาตั้งสีเทา + ปูน) และหลังคาทั้งหมด"""
    layer("roof")
    R = "Roof"
    slope = 0.68
    zr = hip_roof(R, 1.50, -1.45, 11.85, 7.15, EAVE, slope)
    hip_roof(R, 10.05, -0.85, 14.65, 4.55, EAVE, slope)
    # จั่วหน้า: สันตามแนว y เหนือห้องนอนใหญ่/ระเบียง
    xl, xr, xc = 5.05, 11.45, 8.25
    zg = 8.45
    gable_roof(R, xl, xr, xc, 7.10, 2.6, EAVE - 0.02, zg)
    # ผนังหน้าจั่วสามเหลี่ยม
    k = (zg - EAVE) / (xc - xl)
    ym = 6.25

    def tri(xa, xb, mat):
        za = EAVE + (xa - xl) * k if xa <= xc else zg - (xa - xc) * k
        zb_ = EAVE + (xb - xl) * k if xb <= xc else zg - (xb - xc) * k
        pts = [(xa, ym, EAVE - 0.05), (xb, ym, EAVE - 0.05), (xb, ym, zb_ - 0.22), (xa, ym, za - 0.22)]
        if xa < xc < xb:
            pts.insert(3, (xc, ym, zg - 0.22))
        poly(R, mat, pts, ("dir", (0, 1, 0)))
        poly(R, "Ext_Wall", [(p[0], p[1] - 0.12, p[2]) for p in reversed(pts)], ("dir", (0, -1, 0)))
    tri(5.45, 7.45, "Ext_Wall")
    tri(7.45, 11.05, "Siding")
    # เสากรอบหน้าจั่วสีขาว (ต่อจากชั้นล่างขึ้นไปถึงชายคา)
    for x0 in (5.40, 10.90):
        box(R, "Ext_White", x0, 6.20, x0 + 0.20, 6.45, SLAB_T - 0.15, EAVE)
    # ไม้ฝาบนผนังชั้นบนช่วงหน้าจั่ว (แทนปูน) แค่ผิวด้านนอก
    return zr


# ---------------------------------------------------------------------------
# ส่วนต่อเติม (แปลง พิกัดแบบต่อเติม ซม. -> พิกัดบ้าน)
# ---------------------------------------------------------------------------
def E(x_cm, y_cm):
    return (round(x_cm / 100.0 - 1.11, 3), round(y_cm / 100.0 - 2.50, 3))


def extension():
    layer("ext")
    N = "X_Walls"
    F_K = 0.40 + EXT_OFF          # ครัว/ห้องเก็บของ = 0.60
    F_T = PAVE                    # เทอเรส = ระดับพื้นกระเบื้องสวน
    F_M = FFL1                    # ห้องอเนกประสงค์ = ระดับตัวบ้าน
    C_K = F_K + 2.50

    def kz(y):                    # ใต้หลังคาครัวต่อเติม ลาดลงทิศเหนือ
        return 3.42 + 0.05 * (y + 0.0)
    x0, x1, xs, xc = 0.09, 8.09, 2.34, 5.30
    yn, ys, yst = -2.20, -0.50, 1.70
    # พื้น
    kitchen = [(x0, yn), (x1, yn), (x1, 0.0), (6.05, 0.0), (6.05, ys), (x0, ys)]
    storage = [(x0, ys), (xs, ys), (xs, yst), (x0, yst)]
    prism("X_Floor", "Floor_Tile", kitchen, 0.0, F_K, side="Ext_Dark")
    prism("X_Floor", "Floor_Tile", storage, 0.0, F_K, side="Ext_Dark")
    prism("X_Ceiling", "Ceiling", kitchen, C_K, C_K + 0.01, top=False)
    prism("X_Ceiling", "Ceiling", storage, C_K, C_K + 0.01, top=False)
    # ผนังภายนอก
    wn = ((x0, yn), (x1, yn))
    ewall(N, *wn, 0.0, kz(yn), [], ext="N", t=0.10, ext_mat="Ext_White")
    ww = ((x0, yn), (x0, yst))
    d3 = (0.75, 1.65, F_K, F_K + 1.95)
    ewall(N, *ww, 0.0, (kz(yn), kz(yst)), [d3], ext="W", t=0.10, ext_mat="Ext_White")
    unit(N, *ww, *d3, "door_slide", 1, t=0.10, ext="W")
    we = ((x1, yn), (x1, 0.0))
    d1 = (0.20, 2.00, F_K, F_K + 2.00)
    ewall(N, *we, 0.0, (kz(yn), kz(0.0)), [d1], ext="E", t=0.10, ext_mat="Ext_White")
    unit(N, *we, *d1, "door_slide", 2, t=0.10, ext="E")
    wi = ((x0, ys), (xs, ys))
    d4 = (1.30, 2.10, F_K, F_K + 2.00)
    wall(N, *wi, F_K, C_K, [d4], 0.10)
    unit(N, *wi, *d4, "swing", t=0.10)
    wsw = ((x0, yst), (xs, yst))
    w3 = (0.85, 1.55, F_K + 1.80, F_K + 2.30)
    ewall(N, *wsw, 0.0, kz(yst), [w3], ext="S", t=0.10, ext_mat="Ext_White")
    unit(N, *wsw, *w3, "awning", 1, t=0.10, ext="S")
    # ผนังกั้นใหม่: ครัวไทย | ซักรีด | ห้องน้องแมว (ประตูบานเลื่อนกระจกทั้งสองจุด)
    pk = ((xs, yn + 0.05), (xs, ys))
    dk = (0.30, 1.20, F_K, F_K + 2.05)
    wall(N, *pk, F_K, C_K, [dk], 0.10)
    unit(N, *pk, *dk, "door_slide", 1, t=0.10)
    # หลังคาเมทัลชีท (L-shape) + รางน้ำ + เสา
    roof = [(-0.11, -2.28), (8.17, -2.28), (8.17, 0.03), (6.05, 0.03), (6.05, -0.50), (2.34, -0.50),
            (2.34, 2.85), (-0.11, 2.85)]
    layer("ext_roof")
    prism("X_Roof", "Roof_Metal", roof, lambda x, y: kz(y), lambda x, y: kz(y) + 0.06, side="Fascia")
    box("X_Roof", "Fascia", -0.11, -2.40, 8.17, -2.28, kz(-2.28) - 0.12, kz(-2.28) + 0.04)
    layer("ext")
    box(N, "Steel_Dark", -0.11, 2.70, 0.01, 2.82, PAVE, kz(2.82))

    # ---------- ครัวไทย ----------
    K = "X_Kitchen"
    box(K, "Dark_Cabinet", 0.14, -2.15, 2.24, -1.55, F_K + 0.10, F_K + 0.82)
    box(K, "Black_Matte", 0.16, -2.13, 2.22, -1.60, F_K, F_K + 0.10)
    box(K, "Marble", 0.14, -2.15, 2.26, -1.53, F_K + 0.82, F_K + 0.86)
    for xd in (0.64, 1.14, 1.64):
        box(K, "Steel_Black", xd - 0.004, -1.548, xd + 0.004, -1.545, F_K + 0.12, F_K + 0.80)
    box(K, "Black_Glass", 0.30, -2.05, 1.00, -1.65, F_K + 0.86, F_K + 0.866)           # เตาแก๊ส 2 หัว
    for bx in (0.48, 0.82):
        cyl(K, "Steel_Black", bx, -1.85, 0.09, 0.09, F_K + 0.866, F_K + 0.885, seg=16)
    box(K, "Chrome", 1.40, -2.05, 2.05, -1.65, F_K + 0.855, F_K + 0.862)              # ซิงก์
    lathe(K, "Chrome", 1.72, -2.08, [(0.015, F_K + 0.86), (0.015, F_K + 1.15), (0.012, F_K + 1.18)], seg=8)
    box(K, "Chrome", 0.30, -2.15, 1.00, -1.70, F_K + 1.75, F_K + 1.85)                 # ฮู้ด
    box(K, "Chrome", 0.50, -2.15, 0.80, -1.95, F_K + 1.85, C_K)
    box(K, "Oak", 1.15, -2.15, 2.24, -1.90, F_K + 1.45, F_K + 1.48)                     # ชั้นวางเครื่องปรุง
    box(K, "Oak", 1.15, -2.15, 2.24, -1.90, F_K + 1.80, F_K + 1.83)
    for i, xx in enumerate((1.25, 1.45, 1.65, 1.90, 2.10)):
        cyl(K, ("Toy_Red", "Plant_Pot", "Toy_Yellow", "Plant_Pot", "Toy_Red")[i], xx, -2.03, 0.04, 0.04,
            F_K + 1.48, F_K + 1.48 + 0.12 + 0.04 * (i % 2), seg=10)
    # ท่อฮู้ดทะลุฝ้าและหลังคา + หมวกครอบกันฝน
    box(K, "Chrome", 0.55, -2.13, 0.75, -1.97, C_K, kz(-2.05) + 0.55)
    box(K, "Chrome", 0.47, -2.21, 0.83, -1.89, kz(-2.05) + 0.06, kz(-2.05) + 0.12)
    cyl(K, "Chrome", 0.65, -2.05, 0.20, 0.20, kz(-2.05) + 0.62, kz(-2.05) + 0.66, seg=16)
    cyl(K, "Chrome", 0.65, -2.05, 0.20, 0.20, kz(-2.05) + 0.66, kz(-2.05) + 0.76, seg=16, r1x=0.02, r1y=0.02)
    for dx, dy in ((-0.08, -0.06), (0.08, -0.06), (-0.08, 0.06), (0.08, 0.06)):
        box(K, "Chrome", 0.65 + dx - 0.006, -2.05 + dy - 0.006, 0.65 + dx + 0.006, -2.05 + dy + 0.006, kz(-2.05) + 0.55, kz(-2.05) + 0.62)

    # ---------- ห้องซักรีด: เครื่องซักผ้าฝาหน้า + เครื่องอบผ้าฝาหน้า ----------
    L = "X_Laundry"
    for i, xw in enumerate((2.56, 3.19)):
        front_loader(L, xw, xw + 0.60, -2.15, F_K, dryer=(i == 1))
    box(L, "Marble", 2.50, -2.17, 3.85, -1.50, F_K + 0.86, F_K + 0.89)                 # ท็อปวางของบนเครื่อง
    box(L, "White_Gloss", 2.50, -2.17, 3.85, -1.85, F_K + 1.60, F_K + 2.30)             # ตู้แขวน
    cyl(L, "Fabric_Beige", 3.60, -1.10, 0.22, 0.17, F_K, F_K + 0.45, seg=18, caps=False, r1x=0.25, r1y=0.19)
    cyl(L, "Fabric_Beige", 3.60, -1.10, 0.22, 0.17, F_K, F_K + 0.01, seg=18)

    # ---------- ห้องเก็บของ: ชั้นเปิดโล่ง ไม่มีบาน ----------
    open_shelves(K, 0.16, -0.43, 0.56, 1.63, F_K, "y")
    open_shelves(K, 0.60, 1.22, 2.27, 1.63, F_K, "x")

    # ---------- ห้องน้องแมว ----------
    cat_room(xc, x1, yn, ys, F_K)

    # ไฟ
    for x, y in ((1.20, -1.30), (3.80, -1.30), (6.10, -1.20), (7.40, -1.20)):
        downlight("X_Ceiling", x, y, C_K)
    downlight("X_Ceiling", 1.24, 0.64, C_K, r=0.16)
    for y in (-1.73, 0.65):
        box(N, "Light_Warm", 0.02, y - 0.07, 0.04, y + 0.07, F_K + 1.70, F_K + 1.90)
    # แท็งก์น้ำ + ปั๊ม
    layer("site")
    lathe("Tank", "Tank", -0.51, -1.85, [(0.0, PAVE), (0.45, PAVE + 0.02), (0.48, PAVE + 0.15), (0.48, PAVE + 1.15),
                                         (0.42, PAVE + 1.28), (0.2, PAVE + 1.34), (0.0, PAVE + 1.35)], seg=28)
    box("Tank", "Pump_Blue", -0.95, -1.35, -0.70, -1.05, PAVE, PAVE + 0.30)

    # ---------- เทอเรส (พื้นกระเบื้องต่อเนื่องกับสวน ระดับเดียวกัน) ----------
    layer("ext")
    T = "X_Terrace"
    lounge_set(T, 11.5, -1.0, F_T)

    # ---------- ห้องอเนกประสงค์ ----------
    M = "X_Multi"
    mx0, mx1, my0, my1 = 10.85, 13.75, 3.60, 6.60
    C_M = F_M + 2.50

    def mz(y):
        return 3.42 - 0.06 * (y - 3.60)
    room = [(mx0 + 0.05, my0), (mx1, my0), (mx1, my1), (mx0 + 0.05, my1)]
    prism(M, "Tile_Grey", room, 0.0, F_M, side="Ext_Dark")        # กระเบื้องเทาเข้ม 80x80 ต่างจากพื้นนอกบ้าน
    prism("X_Ceiling", "Ceiling", room, C_M, C_M + 0.01, top=False)
    w2 = (0.05, 2.95, F_M, F_M + 2.00)
    ewall(M, (mx1, my0), (mx1, my1), 0.0, (mz(my0), mz(my1)), [w2], ext="E", t=0.10, ext_mat="Ext_White")
    unit(M, (mx1, my0), (mx1, my1), *w2, "fix", 3, t=0.10, ext="E")
    d2 = (0.025, 2.875, F_M, F_M + 2.00)
    ewall(M, (mx0, my1), (mx1, my1), 0.0, mz(my1), [d2], ext="S", t=0.10, ext_mat="Ext_White")
    unit(M, (mx0, my1), (mx1, my1), *d2, "door_slide", 4, t=0.10, ext="S")
    ewall(M, (mx0, 6.20), (mx0, my1), 0.0, mz(my1), [], ext="W", t=0.15)
    layer("ext_roof")
    prism("X_Roof", "Roof_Metal", [(10.81, my0), (13.77, my0), (13.77, 6.72), (10.81, 6.72)],
          lambda x, y: mz(y), lambda x, y: mz(y) + 0.06, side="Fascia")
    box("X_Roof", "Ext_White", 13.77, my0, 13.82, 6.77, C_M, 3.47)
    box("X_Roof", "Ext_White", 10.81, 6.72, 13.82, 6.77, C_M, 3.47)
    layer("ext")
    for x in (11.52, 12.97):
        for y in (4.33, 5.84):
            downlight("X_Ceiling", x, y, C_M)
    # เฟอร์นิเจอร์ห้องอเนกประสงค์ (มุมนั่งเล่น/ทำงาน)
    sofa(M, 11.0, 4.10, 11.85, 6.10, F_M, "Fabric_Beige", facing="E")
    rug(M, 11.7, 4.2, 13.3, 6.0, F_M, "Rug_Shag")
    coffee_round(M, 12.5, 5.1, F_M, 0.45)
    plant(M, 13.45, 3.90, F_M, 1.3)



# ---------------------------------------------------------------------------
# ห้องซักรีด / ห้องแมว / หลังคาโรงรถต่อเติม + โซลาร์
# ---------------------------------------------------------------------------
def disc_y(obj, mat, cx, y, cz, r, seg=28):
    """แผ่นกลมตั้งฉากแกน y (หันไป +y)"""
    V = [(cx + r * math.cos(2 * math.pi * i / seg), y, cz + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    _add(obj, mat, V, [tuple(reversed(range(seg)))], ("dir", (0, 1, 0)))


def front_loader(obj, x0, x1, yb, z, dryer=False):
    """เครื่องซักผ้า/อบผ้าฝาหน้า กว้าง 60 ลึก 60 สูง 85 หันหน้าไป +y"""
    yf = yb + 0.60
    box(obj, "White_Gloss", x0 + 0.005, yb, x1 - 0.005, yf, z, z + 0.85)
    box(obj, "Black_Glass", x0 + 0.03, yf, x1 - 0.03, yf + 0.004, z + 0.74, z + 0.82)      # แผงควบคุม
    cx = (x0 + x1) / 2
    cyl_ring = 0.215
    disc_y(obj, "Chrome", cx, yf + 0.006, z + 0.42, cyl_ring)
    disc_y(obj, "Black_Glass" if not dryer else "Smoke_Glass", cx, yf + 0.012, z + 0.42, cyl_ring - 0.04)
    sphere(obj, "Chrome", x1 - 0.12, yf + 0.01, z + 0.78, 0.025, 0.012, 0.025, seg=12, rings=6)
    box(obj, "Black_Matte", x0 + 0.03, yf - 0.02, x1 - 0.03, yf, z, z + 0.05)


def _ell(obj, mat, cx, cy, cz, rx, ry, rz, yaw, seg=14, rings=8):
    """ทรงรีหมุนรอบแกนตั้ง"""
    c, s_ = math.cos(yaw), math.sin(yaw)
    V = []
    for r in range(rings + 1):
        th = math.pi * r / rings
        for k in range(seg):
            ph = 2 * math.pi * k / seg
            lx, ly, lz = rx * math.sin(th) * math.cos(ph), ry * math.sin(th) * math.sin(ph), rz * math.cos(th)
            V.append((cx + lx * c - ly * s_, cy + lx * s_ + ly * c, cz + lz))
    F = []
    for r in range(rings):
        for k in range(seg):
            a = r * seg + k
            b = r * seg + (k + 1) % seg
            F.append((a, b, b + seg, a + seg))
    _add(obj, mat, V, F, ("center", (cx, cy, cz)))


def cat(obj, cx, cy, z, yaw, coat="Cat_Orange", pose="sit", size=1.0):
    """น้องแมว low-poly: pose = sit (นั่ง), loaf (หมอบ), sleep (นอนขด)"""
    k = size
    c, s_ = math.cos(yaw), math.sin(yaw)

    def P(lx, ly):              # local (x=หน้า, y=ซ้าย) -> world
        return cx + lx * c - ly * s_, cy + lx * s_ + ly * c

    if pose == "sleep":
        _ell(obj, coat, cx, cy, z + 0.07 * k, 0.17 * k, 0.15 * k, 0.07 * k, yaw)
        hx, hy = P(0.08 * k, 0.07 * k)
        _ell(obj, coat, hx, hy, z + 0.09 * k, 0.065 * k, 0.07 * k, 0.055 * k, yaw + 0.6)
        for side in (-1, 1):
            ex, ey = P(0.11 * k, (0.07 + 0.035 * side) * k)
            poly(obj, coat, [(ex - 0.02 * k, ey, z + 0.12 * k), (ex + 0.02 * k, ey, z + 0.12 * k), (ex, ey, z + 0.17 * k)])
        # หางพันรอบตัว
        pts = [P(0.17 * k * math.cos(a), 0.15 * k * math.sin(a)) for a in [-2.6 + 0.35 * i for i in range(9)]]
        for a_, b_ in zip(pts, pts[1:]):
            beam3d(obj, coat, (a_[0], a_[1], z + 0.03 * k), (b_[0], b_[1], z + 0.03 * k), 0.035 * k, 0.035 * k)
        return
    sit = pose == "sit"
    # ลำตัว
    bx, by = P(-0.02 * k, 0)
    if sit:
        _ell(obj, coat, bx, by, z + 0.13 * k, 0.11 * k, 0.09 * k, 0.14 * k, yaw)
        cx2, cy2 = P(0.06 * k, 0)
        _ell(obj, "Cat_White", cx2, cy2, z + 0.15 * k, 0.05 * k, 0.06 * k, 0.09 * k, yaw)   # อก
        hz = z + 0.32 * k
        hx, hy = P(0.04 * k, 0)
        for side in (-1, 1):                                                                 # ขาหน้า
            fx, fy = P(0.08 * k, 0.04 * side * k)
            cyl(obj, "Cat_White", fx, fy, 0.022 * k, 0.022 * k, z, z + 0.14 * k, seg=8)
    else:
        _ell(obj, coat, bx, by, z + 0.09 * k, 0.19 * k, 0.10 * k, 0.09 * k, yaw)
        hz = z + 0.17 * k
        hx, hy = P(0.19 * k, 0)
        for side in (-1, 1):
            fx, fy = P(0.20 * k, 0.045 * side * k)
            _ell(obj, "Cat_White", fx, fy, z + 0.02 * k, 0.05 * k, 0.025 * k, 0.02 * k, yaw)
    # หัว
    _ell(obj, coat, hx, hy, hz, 0.075 * k, 0.085 * k, 0.07 * k, yaw)
    mx, my = P(0.06 * k + (hx - cx) * c + (hy - cy) * s_ - 0.0, 0)
    mx, my = hx + 0.055 * k * c, hy + 0.055 * k * s_
    _ell(obj, "Cat_White", mx, my, hz - 0.025 * k, 0.035 * k, 0.045 * k, 0.03 * k, yaw)     # ปาก
    nx_, ny_ = hx + 0.088 * k * c, hy + 0.088 * k * s_
    sphere(obj, "Cat_Pink", nx_, ny_, hz - 0.005 * k, 0.009 * k, seg=8, rings=5)          # จมูก
    for side in (-1, 1):
        # ตา
        ex = hx + 0.062 * k * c - 0.035 * side * k * s_
        ey = hy + 0.062 * k * s_ + 0.035 * side * k * c
        sphere(obj, "Cat_Eye", ex, ey, hz + 0.015 * k, 0.016 * k, seg=10, rings=6)
        sphere(obj, "Black_Glass", ex + 0.008 * k * c, ey + 0.008 * k * s_, hz + 0.015 * k, 0.009 * k, 0.009 * k, 0.012 * k, seg=8, rings=5)
        # หู (สามเหลี่ยม + ด้านในชมพู)
        bxl = hx - 0.01 * k * c - 0.05 * side * k * s_
        byl = hy - 0.01 * k * s_ + 0.05 * side * k * c
        bxr = hx - 0.01 * k * c - 0.015 * side * k * s_
        byr = hy - 0.01 * k * s_ + 0.015 * side * k * c
        tx = hx - 0.015 * k * c - 0.045 * side * k * s_
        ty = hy - 0.015 * k * s_ + 0.045 * side * k * c
        zb_ = hz + 0.045 * k
        poly(obj, coat, [(bxl, byl, zb_), (bxr, byr, zb_), (tx, ty, zb_ + 0.065 * k)])
        poly(obj, "Cat_Pink", [(bxl + 0.004 * c, byl + 0.004 * s_, zb_ + 0.005 * k),
                               (bxr + 0.004 * c, byr + 0.004 * s_, zb_ + 0.005 * k),
                               (tx + 0.004 * c, ty + 0.004 * s_, zb_ + 0.05 * k)])
    # หาง
    if sit:
        pts = [P(-0.10 * k + 0.13 * k * math.sin(a), 0.09 * k * math.cos(a) + 0.05 * k) for a in [0.0, 0.5, 1.0, 1.5, 2.0, 2.4]]
        for a_, b_ in zip(pts, pts[1:]):
            beam3d(obj, coat, (a_[0], a_[1], z + 0.02 * k), (b_[0], b_[1], z + 0.02 * k), 0.032 * k, 0.032 * k)
    else:
        t0, t1, t2 = P(-0.20 * k, 0), P(-0.28 * k, 0.06 * k), P(-0.26 * k, 0.16 * k)
        beam3d(obj, coat, (t0[0], t0[1], z + 0.06 * k), (t1[0], t1[1], z + 0.03 * k), 0.03 * k, 0.03 * k)
        beam3d(obj, coat, (t1[0], t1[1], z + 0.03 * k), (t2[0], t2[1], z + 0.03 * k), 0.03 * k, 0.03 * k)


def cat_tree(obj, cx, cy, z):
    """คอนโดแมว 3 ชั้น เสาเชือกป่าน + กล่องบ้าน + เบาะบนสุด"""
    box(obj, "Cat_Carpet", cx - 0.30, cy - 0.30, cx + 0.30, cy + 0.30, z, z + 0.05)
    for (dx, dy, h) in ((-0.18, -0.18, 1.25), (0.18, 0.18, 0.85), (0.20, -0.20, 1.55)):
        cyl(obj, "Sisal", cx + dx, cy + dy, 0.045, 0.045, z + 0.05, z + h, seg=12)
    box(obj, "Cat_Carpet", cx - 0.30, cy - 0.30, cx + 0.05, cy + 0.05, z + 0.40, z + 0.75)         # กล่องบ้าน
    disc_y(obj, "Black_Matte", cx - 0.125, cy + 0.051, z + 0.56, 0.09)
    box(obj, "Cat_Carpet", cx - 0.05, cy - 0.05, cx + 0.32, cy + 0.32, z + 0.85, z + 0.89)       # ชั้นกลาง
    box(obj, "Cat_Carpet", cx - 0.32, cy - 0.32, cx + 0.02, cy + 0.02, z + 1.25, z + 1.29)       # ชั้นบน
    cyl(obj, "Cat_Carpet", cx + 0.20, cy - 0.20, 0.22, 0.22, z + 1.55, z + 1.60, seg=24)          # เบาะบนสุด
    cyl(obj, "Cat_Carpet", cx + 0.20, cy - 0.20, 0.22, 0.22, z + 1.60, z + 1.66, seg=24, caps=False)
    sphere(obj, "Toy_Red", cx + 0.25, cy + 0.30, z + 0.72, 0.03, seg=8, rings=5)
    beam3d(obj, "Linen_White", (cx + 0.25, cy + 0.30, z + 0.85), (cx + 0.25, cy + 0.30, z + 0.75), 0.005, 0.005)


def open_shelves(obj, x0, y0, x1, y1, z, along, levels=(0.08, 0.50, 0.92, 1.34, 1.76), h=2.0):
    """ชั้นวางเหล็กดำ + แผ่นไม้ แบบเปิดโล่ง พร้อมกล่องเก็บของ"""
    import random
    rnd = random.Random(int(x0 * 100 + y0 * 10))
    for px in (x0 + 0.02, x1 - 0.02):
        for py in (y0 + 0.02, y1 - 0.02):
            box(obj, "Steel_Black", px - 0.015, py - 0.015, px + 0.015, py + 0.015, z, z + h)
    for lv in levels:
        box(obj, "Oak", x0, y0, x1, y1, z + lv, z + lv + 0.025)
        L = (y1 - y0) if along == "y" else (x1 - x0)
        t = 0.06
        while t < L - 0.35:
            w = rnd.uniform(0.28, 0.42)
            hh = rnd.uniform(0.18, 0.30)
            m = rnd.choice(("Fabric_Beige", "Linen_White", "Fabric_Grey", "Oak"))
            if along == "y":
                box(obj, m, x0 + 0.04, y0 + t, x1 - 0.04, y0 + t + w, z + lv + 0.025, z + lv + 0.025 + hh)
            else:
                box(obj, m, x0 + t, y0 + 0.04, x0 + t + w, y1 - 0.04, z + lv + 0.025, z + lv + 0.025 + hh)
            t += w + rnd.uniform(0.04, 0.12)


def cat_room(xa, xb, yn, ys, z):
    """ห้องน้องแมว (x xa..xb, y yn..0): คอนโด ชั้นปีนผนัง ที่นอน กระบะทราย ชามข้าว ของเล่น และน้องแมว 3 ตัว
    เว้นทางเดินหน้าประตูบานเลื่อนจากห้องซักรีด (ผนังทิศตะวันตก) และประตู D1 ออกเทอเรส (ผนังทิศตะวันออก)"""
    C = "X_CatRoom"
    rug(C, xa + 0.75, yn + 0.75, xb - 0.55, -0.35, z, "Linen_White")
    tx, ty = xa + 1.00, yn + 0.35                       # คอนโดแมวชิดผนังทิศเหนือ
    cat_tree(C, tx, ty, z)
    # ชั้นปีนบนผนังทิศเหนือ ไล่ระดับขึ้นไปทางตะวันออก + ชั้นนอนเล่นบนสุด
    for x, h in ((xa + 1.55, 0.60), (xa + 1.95, 0.95), (xa + 2.35, 1.30)):
        box(C, "Oak", x - 0.17, yn + 0.05, x + 0.17, yn + 0.32, z + h, z + h + 0.03)
        box(C, "Steel_Black", x - 0.01, yn + 0.05, x + 0.01, yn + 0.20, z + h - 0.12, z + h)
    box(C, "Oak", xa + 2.15, yn + 0.05, xb - 0.08, yn + 0.40, z + 1.65, z + 1.68)
    box(C, "Cat_Carpet", xa + 2.20, yn + 0.08, xb - 0.12, yn + 0.37, z + 1.68, z + 1.70)
    # กระบะทรายแบบมีฝา (มุมตะวันตกเฉียงเหนือ)
    box(C, "White_Gloss", xa + 0.08, yn + 0.05, xa + 0.55, yn + 0.50, z, z + 0.40)
    disc_y(C, "Black_Matte", xa + 0.315, yn + 0.501, z + 0.18, 0.11)
    # ที่นอนกลมแบบโดนัท
    bx, by = xb - 0.70, -0.45
    cyl(C, "Fabric_Grey", bx, by, 0.32, 0.32, z, z + 0.14, seg=28, r1x=0.30, r1y=0.30)
    cyl(C, "Linen_White", bx, by, 0.24, 0.24, z + 0.06, z + 0.09, seg=24)
    # ชามข้าว ชามน้ำ
    box(C, "Oak", xa + 0.95, -0.32, xa + 1.35, -0.10, z, z + 0.06)
    for dx in (-0.09, 0.09):
        cyl(C, "Ceramic", xa + 1.15 + dx, -0.21, 0.07, 0.07, z + 0.06, z + 0.11, seg=16, r1x=0.08, r1y=0.08)
    # ของเล่น
    sphere(C, "Toy_Yellow", xa + 1.75, -0.95, z + 0.035, 0.035, seg=10, rings=6)
    sphere(C, "Toy_Red", xa + 2.05, -0.65, z + 0.03, 0.03, seg=10, rings=6)
    # น้องแมว
    cat(C, tx + 0.20, ty - 0.20, z + 1.62, math.radians(160), "Cat_Orange", "loaf", 0.9)   # บนยอดคอนโด
    cat(C, xa + 1.55, -1.05, z, math.radians(200), "Cat_Grey", "sit")                    # นั่งหันมาทางประตู
    cat(C, bx, by, z + 0.09, 0.4, "Cat_Orange", "sleep", 0.9)                           # หลับในที่นอน
    cat(C, xa + 2.55, yn + 0.22, z + 1.70, math.radians(250), "Cat_White", "loaf", 0.85)  # บนชั้นบนสุด


def solar_panel(obj, x0, y0, x1, y1, zf, lift=0.10):
    """แผงโซลาร์เซลล์ วางขนานหลังคา zf(y) = ผิวหลังคา"""
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    prism(obj, "Solar", pts, lambda x, y: zf(y) + lift, lambda x, y: zf(y) + lift + 0.035, side="Alu_Silver")
    for xx in (x0 + 0.25, x1 - 0.25):
        box(obj, "Alu_Silver", xx - 0.02, y0 + 0.1, xx + 0.02, y1 - 0.1, zf((y0 + y1) / 2) + 0.01, zf((y0 + y1) / 2) + lift)


def carport_extension():
    """หลังคาเมทัลชีทชุดเดียวกันคลุมลานจอดรถถึงรั้ว และยื่นคลุมหน้าบ้าน ระดับเดียวกันทั้งแผ่น
    ลานจอดรถมีเสาที่แนวรั้ว ส่วนหน้าบ้านยื่นลอยไม่มีเสา พร้อมแผงโซลาร์"""
    layer("ext_roof")
    R = "X_CarportRoof"
    ys0, yp0, yp1, yf = 6.52, 7.24, 8.45, 10.78

    def rz(y):                                     # ผิวหลังคา ลาดลงทางหน้าบ้าน
        return 3.50 - 0.11 * (y - ys0)
    shape = [(-0.20, ys0), (5.40, ys0), (5.40, yp0), (10.95, yp0), (10.95, yp1), (5.40, yp1), (5.40, yf), (-0.20, yf)]
    prism(R, "Metal_White", shape, lambda x, y: rz(y), lambda x, y: rz(y) + 0.05, side="Steel_Brown")
    box(R, "Steel_Brown", -0.20, yf, 5.40, yf + 0.12, rz(yf) - 0.15, rz(yf) + 0.06)              # รางน้ำหน้า
    box(R, "Steel_Brown", 5.40, yp1, 10.95, yp1 + 0.12, rz(yp1) - 0.15, rz(yp1) + 0.06)
    box(R, "Steel_Brown", -0.24, ys0, -0.20, yf + 0.12, rz(yf) - 0.15, rz(ys0) + 0.06)
    for i in range(4):                                                                           # แผงโซลาร์
        x0 = 0.05 + i * 1.18
        solar_panel(R, x0, 6.70, x0 + 1.13, 8.98, rz)
    for i in range(2):
        x0 = 0.25 + i * 2.33
        solar_panel(R, x0, 9.12, x0 + 2.28, 10.25, rz)
    for i in range(2):
        x0 = 5.75 + i * 2.40
        solar_panel(R, x0, 7.30, x0 + 2.28, 8.40, rz)
    layer("ext")
    S = "X_CarportPosts"
    for x in (-0.15, 2.62, 5.32):
        box(S, "Steel_Brown", x - 0.05, yf - 0.10, x + 0.05, yf, CARPORT - 0.05, rz(yf))
    for x, y in ((1.30, 8.50), (3.80, 8.50), (1.30, 10.0), (3.80, 10.0)):
        downlight(S, x, y, rz(y) - 0.01)
    for x in (6.9, 9.4):
        downlight(S, x, 7.85, rz(7.85) - 0.01)


# ---------------------------------------------------------------------------
# เฟอร์นิเจอร์
# ---------------------------------------------------------------------------
def sofa(obj, x0, y0, x1, y1, z, mat, facing="E"):
    """โซฟาสามที่นั่ง: แนวพนักพิงอยู่ด้านตรงข้าม facing"""
    if facing in ("E", "W"):
        back_x = (x0, x0 + 0.20) if facing == "E" else (x1 - 0.20, x1)
        box(obj, mat, x0, y0 + 0.08, x1, y1 - 0.08, z + 0.10, z + 0.42)
        box(obj, mat, back_x[0], y0 + 0.08, back_x[1], y1 - 0.08, z + 0.42, z + 0.85)
        box(obj, mat, x0, y0, x1, y0 + 0.16, z + 0.10, z + 0.62)
        box(obj, mat, x0, y1 - 0.16, x1, y1, z + 0.10, z + 0.62)
        n = 3
        for i in range(n):
            ya = y0 + 0.16 + i * (y1 - y0 - 0.32) / n
            yb = ya + (y1 - y0 - 0.32) / n - 0.01
            cx0 = back_x[1] if facing == "E" else x0
            cx1 = x1 if facing == "E" else back_x[0]
            box(obj, mat, cx0, ya, cx1, yb, z + 0.42, z + 0.50)
        for (yy) in (y0 + 0.4, y1 - 0.4):
            px = back_x[1] + 0.08 if facing == "E" else back_x[0] - 0.08
            box(obj, "Fabric_Grey", px - 0.06, yy - 0.22, px + 0.06, yy + 0.22, z + 0.50, z + 0.88)
        for xx in (x0 + 0.05, x1 - 0.05):
            for yy in (y0 + 0.05, y1 - 0.05):
                cyl(obj, "Brass", xx, yy, 0.015, 0.015, z, z + 0.10, seg=8)
    else:
        back_y = (y0, y0 + 0.20) if facing == "S" else (y1 - 0.20, y1)
        box(obj, mat, x0 + 0.08, y0, x1 - 0.08, y1, z + 0.10, z + 0.42)
        box(obj, mat, x0 + 0.08, back_y[0], x1 - 0.08, back_y[1], z + 0.42, z + 0.85)
        box(obj, mat, x0, y0, x0 + 0.16, y1, z + 0.10, z + 0.62)
        box(obj, mat, x1 - 0.16, y0, x1, y1, z + 0.10, z + 0.62)
        box(obj, mat, x0 + 0.16, y0, x1 - 0.16, y1, z + 0.42, z + 0.50)


def rug(obj, x0, y0, x1, y1, z, mat):
    box(obj, mat, x0, y0, x1, y1, z, z + 0.025, skip=("bot",))


def coffee_round(obj, cx, cy, z, r):
    cyl(obj, "Black_Glass", cx, cy, r, r, z + 0.40, z + 0.43, seg=32)
    cyl(obj, "Steel_Black", cx, cy, 0.03, 0.03, z, z + 0.40, seg=8)
    cyl(obj, "Steel_Black", cx, cy, r * 0.6, r * 0.6, z, z + 0.02, seg=24)


def plant(obj, cx, cy, z, h):
    cyl(obj, "Plant_Pot", cx, cy, 0.16, 0.16, z, z + 0.35, seg=16, r1x=0.20, r1y=0.20)
    cyl(obj, "Bark", cx, cy, 0.02, 0.02, z + 0.3, z + h * 0.6, seg=6)
    for i in range(6):
        a = i * 1.1
        sphere(obj, "Leaves_Light", cx + 0.15 * math.cos(a), cy + 0.15 * math.sin(a), z + h * (0.55 + 0.07 * (i % 3)),
               0.20, 0.20, 0.16, seg=10, rings=6)


def chair(obj, cx, cy, z, face, mat="Fabric_Navy"):
    """เก้าอี้ทานอาหารบุผ้าสีเข้ม face=ทิศที่หันหน้า (N/S/E/W)"""
    fx, fy = DIRS[face]
    s = 0.23
    box(obj, mat, cx - s, cy - s, cx + s, cy + s, z + 0.44, z + 0.50)
    bx, by = cx - fx * (s - 0.03), cy - fy * (s - 0.03)
    if fx == 0:
        box(obj, mat, cx - s, by - 0.03, cx + s, by + 0.03, z + 0.50, z + 0.95)
    else:
        box(obj, mat, bx - 0.03, cy - s, bx + 0.03, cy + s, z + 0.50, z + 0.95)
    for dx in (-s + 0.03, s - 0.03):
        for dy in (-s + 0.03, s - 0.03):
            box(obj, "Black_Matte", cx + dx - 0.015, cy + dy - 0.015, cx + dx + 0.015, cy + dy + 0.015, z, z + 0.44)


def bar_stool(obj, cx, cy, z):
    cyl(obj, "Fabric_Olive", cx, cy, 0.20, 0.20, z + 0.68, z + 0.76, seg=16)
    box(obj, "Fabric_Olive", cx - 0.18, cy + 0.12, cx + 0.18, cy + 0.17, z + 0.76, z + 1.00)
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        beam3d(obj, "Brass", (cx + 0.18 * math.cos(ang), cy + 0.18 * math.sin(ang), z),
               (cx + 0.12 * math.cos(ang), cy + 0.12 * math.sin(ang), z + 0.68), 0.02, 0.02)
    cyl(obj, "Brass", cx, cy, 0.17, 0.17, z + 0.28, z + 0.30, seg=16, caps=False)


def pendant_cone(obj, cx, cy, zc, zb):
    cyl(obj, "Steel_Black", cx, cy, 0.004, 0.004, zb + 0.22, zc, seg=6, caps=False)
    lathe(obj, "White_Gloss", cx, cy, [(0.17, zb), (0.15, zb + 0.10), (0.06, zb + 0.20), (0.03, zb + 0.24)], seg=20)
    cyl(obj, "Light_Warm", cx, cy, 0.12, 0.12, zb + 0.005, zb + 0.01, seg=16)
    LIGHTS.append((LAYER[0], (cx, cy, zb - 0.05), 20, "pendant"))


def globe_chandelier(obj, cx, cy, zc, zb):
    cyl(obj, "Brass", cx, cy, 0.006, 0.006, zb, zc, seg=6, caps=False)
    beam3d(obj, "Brass", (cx - 0.55, cy, zb), (cx + 0.55, cy, zb), 0.025, 0.025)
    for i, dx in enumerate((-0.55, -0.30, -0.05, 0.20, 0.45)):
        dz = (0.0, -0.12, 0.08, -0.08, 0.04)[i]
        beam3d(obj, "Brass", (cx + dx, cy, zb), (cx + dx + 0.05, cy, zb + dz - 0.02), 0.012, 0.012)
        sphere(obj, "Smoke_Glass", cx + dx + 0.05, cy, zb + dz - 0.10, 0.09, seg=14, rings=8)
    LIGHTS.append((LAYER[0], (cx, cy, zb - 0.2), 40, "pendant"))


def bed(obj, x0, y0, x1, y1, z, head="W", frame="Fabric_Olive", cover="Linen_White", throw="Fabric_Grey"):
    """เตียง หัวเตียงอยู่ทิศ head"""
    box(obj, frame, x0, y0, x1, y1, z + 0.08, z + 0.35)
    box(obj, "Linen_White", x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, z + 0.35, z + 0.55)
    if head in ("W", "E"):
        hx = (x0 - 0.08, x0) if head == "W" else (x1, x1 + 0.08)
        box(obj, frame, hx[0], y0 - 0.25, hx[1], y1 + 0.25, z, z + 1.25)
        # ผ้าห่มคลุม 2/3 ปลายเตียง
        cx0, cx1 = (x0 + (x1 - x0) * 0.30, x1 + 0.03) if head == "W" else (x0 - 0.03, x1 - (x1 - x0) * 0.30)
        box(obj, cover, cx0, y0 - 0.03, cx1, y1 + 0.03, z + 0.30, z + 0.60)
        tx0, tx1 = (x1 - 0.55, x1 + 0.04) if head == "W" else (x0 - 0.04, x0 + 0.55)
        box(obj, throw, tx0, y0 - 0.04, tx1, y1 + 0.04, z + 0.58, z + 0.63)
        px = x0 + 0.25 if head == "W" else x1 - 0.25
        n = 2 if (y1 - y0) > 1.3 else 1
        for i in range(n):
            yc = y0 + (y1 - y0) * (i + 0.5) / n
            box(obj, "Linen_White", px - 0.12, yc - 0.33, px + 0.12, yc + 0.33, z + 0.55, z + 0.72)
            box(obj, "Fabric_Beige", px - 0.18, yc - 0.30, px - 0.06, yc + 0.30, z + 0.55, z + 0.85)
    else:
        hy = (y0 - 0.08, y0) if head == "N" else (y1, y1 + 0.08)
        box(obj, frame, x0 - 0.25, hy[0], x1 + 0.25, hy[1], z, z + 1.25)
        cy0, cy1 = (y0 + (y1 - y0) * 0.30, y1 + 0.03) if head == "N" else (y0 - 0.03, y1 - (y1 - y0) * 0.30)
        box(obj, cover, x0 - 0.03, cy0, x1 + 0.03, cy1, z + 0.30, z + 0.60)
        py = y0 + 0.25 if head == "N" else y1 - 0.25
        n = 2 if (x1 - x0) > 1.3 else 1
        for i in range(n):
            xc = x0 + (x1 - x0) * (i + 0.5) / n
            box(obj, "Linen_White", xc - 0.33, py - 0.12, xc + 0.33, py + 0.12, z + 0.55, z + 0.72)


def nightstand(obj, cx, cy, z, lamp=True):
    box(obj, "Black_Glass", cx - 0.25, cy - 0.22, cx + 0.25, cy + 0.22, z + 0.05, z + 0.55)
    if lamp:
        lathe(obj, "Chrome", cx, cy, [(0.07, z + 0.55), (0.05, z + 0.60), (0.03, z + 0.85)], seg=12)
        cyl(obj, "Linen_White", cx, cy, 0.18, 0.18, z + 0.85, z + 1.10, seg=20, caps=False)
        LIGHTS.append((LAYER[0], (cx, cy, z + 0.95), 8, "lamp"))


def wardrobe(obj, x0, y0, x1, y1, z, h=2.3, mat="White_Gloss"):
    box(obj, mat, x0, y0, x1, y1, z, z + h)
    w = x1 - x0 if (x1 - x0) > (y1 - y0) else y1 - y0
    n = max(2, int(w / 0.5))
    for i in range(1, n):
        if (x1 - x0) > (y1 - y0):
            xx = x0 + w * i / n
            fy = y1 if y1 - y0 < 1 else y0
            box(obj, "Steel_Black", xx - 0.003, y0 - 0.002, xx + 0.003, y1 + 0.002, z + 0.05, z + h - 0.05)
        else:
            yy = y0 + w * i / n
            box(obj, "Steel_Black", x0 - 0.002, yy - 0.003, x1 + 0.002, yy + 0.003, z + 0.05, z + h - 0.05)


def tv_set(obj, x0, y0, x1, y1, z, facing="E", tv_w=1.25):
    """ตู้ทีวีสีเขียว sage ท็อปหินอ่อน + ทีวี"""
    box(obj, "Sage", x0, y0, x1, y1, z + 0.08, z + 0.50)
    box(obj, "Marble", x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01, z + 0.50, z + 0.53)
    if facing in ("E", "W"):
        cy = (y0 + y1) / 2
        cx = (x0 + x1) / 2
        box(obj, "Steel_Black", cx - 0.04, cy - 0.15, cx + 0.04, cy + 0.15, z + 0.53, z + 0.56)
        box(obj, "Screen", cx - 0.025, cy - tv_w / 2, cx + 0.025, cy + tv_w / 2, z + 0.62, z + 0.62 + tv_w * 0.58)
        box(obj, "Steel_Black", cx - 0.005, cy - 0.03, cx + 0.005, cy + 0.03, z + 0.53, z + 0.65)
    else:
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2
        box(obj, "Screen", cx - tv_w / 2, cy - 0.025, cx + tv_w / 2, cy + 0.025, z + 0.62, z + 0.62 + tv_w * 0.58)
        box(obj, "Steel_Black", cx - 0.03, cy - 0.005, cx + 0.03, cy + 0.005, z + 0.53, z + 0.65)


def toilet(obj, cx, cy, z, face):
    fx, fy = DIRS[face]
    bx, by = cx - fx * 0.25, cy - fy * 0.25
    if fx == 0:
        box(obj, "Ceramic", bx - 0.20, by - 0.09, bx + 0.20, by + 0.09, z + 0.40, z + 0.80)
    else:
        box(obj, "Ceramic", bx - 0.09, by - 0.20, bx + 0.09, by + 0.20, z + 0.40, z + 0.80)
    cyl(obj, "Ceramic", cx + fx * 0.05, cy + fy * 0.05, 0.19 if fx == 0 else 0.25, 0.25 if fx == 0 else 0.19,
        z, z + 0.42, seg=20, r1x=0.20 if fx == 0 else 0.27, r1y=0.27 if fx == 0 else 0.20)


def basin(obj, x0, y0, x1, y1, z):
    box(obj, "Oak", x0, y0, x1, y1, z + 0.45, z + 0.82)
    box(obj, "Marble", x0, y0, x1, y1, z + 0.82, z + 0.85)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    cyl(obj, "Ceramic", cx, cy, 0.22, 0.17, z + 0.85, z + 0.97, seg=20)
    lathe(obj, "Chrome", cx, cy - 0.12 if (y1 - y0) < (x1 - x0) else cy, [(0.012, z + 0.85), (0.012, z + 1.08)], seg=8)


def mirror_round(obj, cx, cy, z, r, face):
    fx, fy = DIRS[face]
    if fx == 0:
        cyl_y(obj, cx, cy, z, r, fy)
    else:
        cyl_x(obj, cx, cy, z, r, fx)


def cyl_x(obj, cx, cy, cz, r, fx, seg=32):
    """แผ่นกลมตั้งฉากแกน x (กระจกเงา) + ขอบ"""
    for rr, mat, dx in ((r, "Brass", 0.02), (r * 0.82, "Mirror", 0.03)):
        V = [(cx + fx * dx, cy + rr * math.cos(2 * math.pi * i / seg), cz + rr * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        _add(obj, mat, V, [tuple(range(seg))], ("dir", (fx, 0, 0)))


def cyl_y(obj, cx, cy, cz, r, fy, seg=32):
    for rr, mat, dy in ((r, "Brass", 0.02), (r * 0.82, "Mirror", 0.03)):
        V = [(cx + rr * math.cos(2 * math.pi * i / seg), cy + fy * dy, cz + rr * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        _add(obj, mat, V, [tuple(range(seg))], ("dir", (0, fy, 0)))


def frame_art(obj, x0, y0, x1, y1, z0, z1):
    box(obj, "Black_Matte", x0, y0, x1, y1, z0, z1)
    if x1 - x0 < y1 - y0:
        xm = x0 if x0 > 9 else x1
        box(obj, "Linen_White", min(x0, x1) - 0.004 if x0 > 9 else x1, y0 + 0.04, (x0 if x0 > 9 else x1 + 0.004), y1 - 0.04, z0 + 0.04, z1 - 0.04)


def lounge_set(obj, cx, cy, z):
    for dx in (-0.9, 0.9):
        box(obj, "Oak", cx + dx - 0.35, cy - 0.35, cx + dx + 0.35, cy + 0.35, z + 0.20, z + 0.35)
        box(obj, "Linen_White", cx + dx - 0.33, cy - 0.33, cx + dx + 0.33, cy + 0.33, z + 0.35, z + 0.45)
        box(obj, "Oak", cx + dx - 0.35, cy - 0.40 if dx < 0 else cy + 0.35, cx + dx + 0.35, cy - 0.35 if dx < 0 else cy + 0.40, z + 0.20, z + 0.70)
        for ex in (-0.3, 0.3):
            for ey in (-0.3, 0.3):
                box(obj, "Oak", cx + dx + ex - 0.025, cy + ey - 0.025, cx + dx + ex + 0.025, cy + ey + 0.025, z, z + 0.20)
    cyl(obj, "Oak", cx, cy, 0.35, 0.35, z + 0.38, z + 0.42, seg=24)
    cyl(obj, "Oak", cx, cy, 0.04, 0.04, z, z + 0.38, seg=8)
    plant(obj, cx + 1.8, cy - 0.6, z, 1.1)


def furniture_ground():
    layer("furn_g")
    z = FFL1
    G = "G_Furniture"
    # ห้องรับแขก
    sofa(G, 9.95, 3.85, 10.78, 5.95, z, "Velvet_Teal", facing="W")
    rug(G, 8.30, 3.95, 10.05, 5.85, z, "Rug_Shag")
    box(G, "Black_Glass", 8.85, 4.45, 9.45, 5.35, z + 0.36, z + 0.40)
    box(G, "Chrome", 8.86, 4.46, 9.44, 5.34, z, z + 0.36)
    box(G, "Fabric_Beige", 8.40, 4.55, 8.80, 5.25, z, z + 0.42)
    box(G, "Fabric_Grey", 8.38, 4.70, 8.82, 5.10, z + 0.42, z + 0.44)
    tv_set(G, 7.53, 4.05, 7.93, 5.85, z, facing="E")
    cyl(G, "Ext_White", 10.55, 3.65, 0.22, 0.22, z + 0.55, z + 0.58, seg=20)
    cyl(G, "Ext_White", 10.55, 3.65, 0.06, 0.15, z, z + 0.55, seg=16, r1x=0.05, r1y=0.05)
    plant(G, 10.55, 6.00, z, 1.2)
    curtain_set(G, (10.75, 3.75), (10.75, 5.75), 0.0, z + 0.05, z + 2.35)
    curtain_set(G, (10.75, 6.10), (7.80, 6.10), 0.0, z + 0.05, z + 2.35)
    for y in (3.40, 4.00):
        box(G, "Black_Matte", 10.77, y, 10.79, y + 0.45, z + 1.45, z + 2.05)
        box(G, "Linen_White", 10.765, y + 0.04, 10.77, y + 0.41, z + 1.49, z + 2.01)
    # ทานอาหาร
    tx, ty = 8.55, 1.55
    cyl(G, "Marble", tx, ty, 1.05, 0.52, z + 0.74, z + 0.77, seg=40)
    for dx in (-0.6, 0.6):
        beam3d(G, "Black_Matte", (tx + dx - 0.25, ty, z), (tx + dx, ty, z + 0.74), 0.06, 0.5)
        beam3d(G, "Black_Matte", (tx + dx + 0.25, ty, z), (tx + dx, ty, z + 0.74), 0.06, 0.5)
    for dx in (-0.5, 0.5):
        chair(G, tx + dx, ty - 0.75, z, "S")
        chair(G, tx + dx, ty + 0.75, z, "N")
    chair(G, tx - 1.30, ty, z, "E")
    chair(G, tx + 1.30, ty, z, "W")
    globe_chandelier(G, tx, ty, CEIL1 - 0.15, z + 1.75)
    lathe(G, "Smoke_Glass", tx, ty, [(0.0, z + 0.77), (0.06, z + 0.78), (0.08, z + 0.85), (0.05, z + 0.98), (0.04, z + 1.0)], seg=16)
    for i in range(7):
        a = i * 0.9
        sphere(G, "Leaves_Light", tx + 0.1 * math.cos(a), ty + 0.1 * math.sin(a), z + 1.10 + 0.05 * (i % 3), 0.11, seg=8, rings=5)
    for x0, x1 in ((6.45, 7.95), (8.55, 10.00)):
        curtain_set(G, (x0, 0.18), (x1, 0.18), 0.0, z + 0.05, z + 2.35)
    # pantry island สีเขียว sage + เก้าอี้บาร์
    box(G, "Sage", 6.20, 0.55, 6.80, 1.85, z + 0.05, z + 0.90)
    box(G, "Marble", 6.15, 0.50, 6.95, 1.90, z + 0.90, z + 0.94)
    for y in (0.85, 1.55):
        bar_stool(G, 7.20, y, z)
    for y in (0.85, 1.55):
        pendant_cone(G, 6.55, y, CEIL1, z + 1.75)
    # ครัวเดิม (ชิดผนังห้องน้ำ) เคาน์เตอร์ + ตู้แขวนสีเข้ม
    box(G, "Dark_Cabinet", 2.50, 0.95, 5.20, 1.55, z + 0.10, z + 0.82)
    box(G, "Marble", 2.48, 0.93, 5.22, 1.55, z + 0.82, z + 0.86)
    box(G, "Dark_Cabinet", 2.50, 1.20, 5.20, 1.55, z + 1.45, z + 2.25)
    box(G, "Black_Glass", 2.70, 1.03, 3.30, 1.43, z + 0.86, z + 0.866)
    box(G, "Chrome", 3.90, 1.03, 4.70, 1.43, z + 0.858, z + 0.864)
    box(G, "Chrome", 2.60, 1.20, 3.40, 1.55, z + 1.30, z + 1.45)
    box(G, "Chrome", 5.40, 0.0, 6.00, 0.65, z, z + 1.85)            # ตู้เย็น
    box(G, "Dark_Cabinet", 2.50, -0.42, 3.05, 0.15, z, z + 2.25)
    # ห้องน้ำ 3
    toilet(G, 3.95, 2.75, z, "N")
    basin(G, 4.45, 2.55, 5.10, 3.00, z)
    box(G, "Mirror", 4.50, 2.985, 5.05, 2.99, z + 1.10, z + 1.80)
    # ห้องนอน 4 / ห้องทำงาน
    box(G, "Oak", 13.10, 1.50, 13.68, 3.10, z + 0.72, z + 0.75)
    box(G, "Oak", 13.10, 1.52, 13.68, 1.56, z, z + 0.72)
    box(G, "Oak", 13.10, 3.04, 13.68, 3.08, z, z + 0.72)
    chair(G, 12.75, 2.30, z, "E", "Fabric_Grey")
    box(G, "Screen", 13.50, 2.05, 13.52, 2.55, z + 0.80, z + 1.10)
    rug(G, 11.30, 0.70, 12.90, 2.30, z, "Fabric_Beige")
    sphere(G, "Fabric_Navy", 11.70, 0.70, z + 0.35, 0.40, 0.40, 0.30, seg=16, rings=8)
    coffee_round(G, 12.20, 1.30, z, 0.28)
    wardrobe(G, 10.93, 2.65, 11.55, 3.52, z, 2.2, "Oak")
    plant(G, 13.45, 0.35, z, 1.2)


def furniture_upper():
    layer("furn_u")
    z = FFL2
    U = "U_Furniture"
    # ห้องนอนใหญ่: หัวเตียงชิดผนังทิศตะวันตก
    bed(U, 7.60, 3.95, 9.70, 5.75, z, head="W")
    nightstand(U, 7.82, 3.55, z)
    nightstand(U, 7.82, 6.00, z)
    cyl_x(U, 7.52, 4.85, z + 1.85, 0.42, 1)
    for yy in (3.30, 6.0):
        for zz in ((z + 0.25, z + 0.95), (z + 1.15, z + 2.30)):
            pass
    # คิ้วบัวผนังหัวเตียง
    for (ya, yb_) in ((3.40, 4.05), (5.65, 6.15)):
        for zz in ((z + 0.25, z + 0.95), (z + 1.15, z + 2.30)):
            box(U, "Moulding", 7.51, ya, 7.52, ya + 0.02, zz[0], zz[1])
            box(U, "Moulding", 7.51, yb_ - 0.02, 7.52, yb_, zz[0], zz[1])
            box(U, "Moulding", 7.51, ya, 7.52, yb_, zz[0], zz[0] + 0.02)
            box(U, "Moulding", 7.51, ya, 7.52, yb_, zz[1] - 0.02, zz[1])
    rug(U, 9.55, 3.80, 10.40, 5.90, z, "Rug_Shag")
    box(U, "White_Gloss", 10.45, 4.10, 10.88, 5.60, z, z + 0.50)
    box(U, "Screen", 10.62, 4.40, 10.66, 5.30, z + 0.60, z + 1.12)
    # มุมพักผ่อน
    rug(U, 8.30, 0.40, 10.30, 1.90, z, "Rug_Shag")
    sphere(U, "Fabric_Navy", 9.90, 0.75, z + 0.38, 0.45, 0.45, 0.33, seg=18, rings=8)
    coffee_round(U, 9.10, 1.20, z, 0.35)
    plant(U, 8.10, 0.35, z, 1.3)
    curtain_set(U, (8.80, 0.18), (10.15, 0.18), 0.0, z + 0.05, z + 2.35)
    curtain_set(U, (10.25, 6.12), (8.25, 6.12), 0.0, z + 0.05, z + 2.35)
    # walk-in closet: ตู้กระจกเงา
    box(U, "Mirror", 11.05, 3.00, 13.65, 3.55, z, z + 2.30)
    box(U, "White_Gloss", 13.20, 2.05, 13.65, 2.95, z, z + 0.80)
    # ห้องน้ำ 1
    toilet(U, 11.45, 0.45, z, "S")
    basin(U, 12.20, 0.12, 13.10, 0.60, z)
    box(U, "Mirror", 12.25, 0.115, 13.05, 0.12, z + 1.10, z + 1.85)
    box(U, "Glass", 13.10, 0.10, 13.11, 1.20, z, z + 2.00)
    lathe(U, "Chrome", 13.45, 0.30, [(0.012, z), (0.012, z + 2.05)], seg=8)
    cyl(U, "Chrome", 13.45, 0.45, 0.12, 0.12, z + 2.05, z + 2.06, seg=16)
    # ห้องน้ำ 2
    toilet(U, 5.95, 1.55, z, "E")
    basin(U, 6.20, 0.12, 7.00, 0.58, z)
    box(U, "Mirror", 6.25, 0.115, 6.95, 0.12, z + 1.10, z + 1.80)
    # ห้องนอน 2 (เด็ก ชมพู)
    bed(U, 2.55, 4.15, 4.55, 5.25, z, head="W", frame="Fabric_Pink", cover="Linen_White", throw="Fabric_Pink")
    nightstand(U, 2.78, 3.75, z)
    wardrobe(U, 4.75, 3.05, 5.38, 4.80, z, 2.3)
    box(U, "Oak", 2.50, 5.70, 3.80, 6.15, z + 0.72, z + 0.75)
    chair(U, 3.15, 5.45, z, "S", "Fabric_Pink")
    rug(U, 3.0, 4.0, 4.6, 5.6, z, "Linen_White")
    # ห้องนอน 3
    bed(U, 3.10, -0.45, 4.70, 1.55, z, head="N", frame="Fabric_Grey", cover="Linen_White", throw="Fabric_Navy")
    nightstand(U, 2.75, -0.20, z)
    wardrobe(U, 2.50, 2.25, 4.60, 2.88, z, 2.3)
    box(U, "Oak", 4.75, 0.40, 5.38, 1.80, z + 0.72, z + 0.75)
    # โถงชั้นบน: โคมแขวน
    pendant_cone(U, 5.95, 3.90, CEIL2, z + 1.9)


# ---------------------------------------------------------------------------
# บริบท: สนาม ทางรถ รั้ว ต้นไม้ ถนน
# ---------------------------------------------------------------------------
PAVE = 0.50       # พื้นกระเบื้องรอบบ้าน = ระดับเทอเรส (ไม่มีขั้นลด)


def planter(x0, y0, x1, y1, h=PAVE + 0.45, t=0.07):
    """กระบะต้นไม้ปูนสีขาว + ดิน"""
    P = "Planter"
    box(P, "Ext_White", x0, y0, x1, y0 + t, PAVE, h)
    box(P, "Ext_White", x0, y1 - t, x1, y1, PAVE, h)
    box(P, "Ext_White", x0, y0 + t, x0 + t, y1 - t, PAVE, h)
    box(P, "Ext_White", x1 - t, y0 + t, x1, y1 - t, PAVE, h)
    box(P, "Soil", x0 + t, y0 + t, x1 - t, y1 - t, PAVE, h - 0.07, skip=("bot",))
    return h - 0.07


def agave(cx, cy, z, size=0.75, seed=1):
    """ต้นอากาเว่: ใบแหลมยาวแผ่ออกเป็นดาว"""
    import random
    rnd = random.Random(seed)
    n = 15
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.15, 0.15)
        inner = i % 3 == 0
        el = math.radians(rnd.uniform(62, 78) if inner else rnd.uniform(28, 55))
        L = size * (0.65 if inner else rnd.uniform(0.85, 1.05))
        w = 0.035 + 0.025 * size
        dx, dy = math.cos(a), math.sin(a)
        px, py = -dy, dx
        tip = (cx + dx * L * math.cos(el), cy + dy * L * math.cos(el), z + L * math.sin(el))
        mid = (cx + dx * L * 0.45 * math.cos(el), cy + dy * L * 0.45 * math.cos(el), z + L * 0.45 * math.sin(el) + 0.03)
        b1 = (cx + px * w * 0.5, cy + py * w * 0.5, z)
        b2 = (cx - px * w * 0.5, cy - py * w * 0.5, z)
        m1 = (mid[0] + px * w, mid[1] + py * w, mid[2])
        m2 = (mid[0] - px * w, mid[1] - py * w, mid[2])
        poly("Plants", "Agave", [b1, m1, tip, m2, b2])


def shrub(cx, cy, z, r=0.2):
    for i, (dx, dy, k) in enumerate(((0, 0, 1.0), (0.12, 0.05, 0.75), (-0.1, 0.08, 0.7), (0.02, -0.12, 0.7))):
        sphere("Plants", "Leaves_Light" if i % 2 else "Leaves", cx + dx * r * 4, cy + dy * r * 4, z + r * 0.6 * k,
               r * k, r * k, r * 0.75 * k, seg=10, rings=6)


def wall_light(x, y, z, nx, ny):
    """โคมผนังทรงลูกบาศก์สีดำ ส่องขึ้น-ลง"""
    L = "Wall_Lights"
    s_, d = 0.065, 0.10
    if nx:
        x0 = x if nx > 0 else x - d
        box(L, "Steel_Black", x0, y - s_, x0 + d, y + s_, z - s_, z + s_)
        box(L, "Light_Warm", x0 + 0.01, y - s_ + 0.01, x0 + d - 0.01, y + s_ - 0.01, z - s_ - 0.003, z - s_)
        box(L, "Light_Warm", x0 + 0.01, y - s_ + 0.01, x0 + d - 0.01, y + s_ - 0.01, z + s_, z + s_ + 0.003)
    else:
        y0 = y if ny > 0 else y - d
        box(L, "Steel_Black", x - s_, y0, x + s_, y0 + d, z - s_, z + s_)
        box(L, "Light_Warm", x - s_ + 0.01, y0 + 0.01, x + s_ - 0.01, y0 + d - 0.01, z - s_ - 0.003, z - s_)
        box(L, "Light_Warm", x - s_ + 0.01, y0 + 0.01, x + s_ - 0.01, y0 + d - 0.01, z + s_, z + s_ + 0.003)
    WASHES.append((x, y, z, nx, ny))


def tree(cx, cy, h, r, mat="Leaves", base=LAWN):
    cyl("Trees", "Bark", cx, cy, 0.09, 0.09, base, base + h * 0.55, seg=8, r1x=0.06, r1y=0.06)
    import random
    rnd = random.Random(int(cx * 100 + cy * 10))
    for i in range(9):
        a = rnd.random() * 6.28
        d = rnd.random() * r * 0.55
        zz = base + h * (0.55 + rnd.random() * 0.35)
        rr = r * (0.45 + rnd.random() * 0.3)
        sphere("Trees", mat if i % 3 else "Leaves_Light", cx + d * math.cos(a), cy + d * math.sin(a), zz, rr, rr, rr * 0.8, seg=12, rings=7)


def site():
    layer("site")
    x0, y0, x1, y1 = SITE
    gx0, gy0, gx1, gy1 = GARDEN
    # พื้นหญ้ารอบนอก (ไม่มีถนน)
    prism("Lawn", "Grass", [(x0 - 14, y0 - 14), (x1 + 14, y0 - 14), (x1 + 14, gy1 + 14), (x0 - 14, gy1 + 14)],
          -0.08, 0.0, bottom=False)
    # ที่ดินตัว L: พื้นกระเบื้องแผ่นใหญ่ระดับเดียวกับเทอเรส (เว้นลานจอดรถ)
    pave = [(x0, y0), (x1, y0), (x1, gy1), (gx0, gy1), (gx0, y1), (5.40, y1), (5.40, 6.45),
            (-0.12, 6.45), (-0.12, y1), (x0, y1)]
    prism("Paving", "Paving", pave, 0.0, PAVE, bottom=False)
    # ลานจอดรถ ปูกระเบื้องเต็มพื้นที่ ต่อจากโรงจอดรถถึงประตูรั้ว ไม่มีหญ้า
    drive = [(-0.12, 6.45), (5.40, 6.45), (5.40, y1), (-0.12, y1)]
    prism("Drive", "Paving", drive, -0.02, CARPORT)                                       # ระดับเดียวกับโรงจอดรถ ตลอดถึงประตูรั้ว
    # รั้วหน้าบ้าน: เสาขาว + ลูกกรงเหล็กดำ + ประตูรั้วเลื่อนหน้าลานจอด
    F = "Fence_Front"
    posts = [-1.11, 5.45, 8.30, gx0]
    for px in posts:
        box(F, "Pillar_White", px - 0.15, y1 - 0.30, px + 0.15, y1, 0.0, 1.75)
        box(F, "Pillar_White", px - 0.18, y1 - 0.33, px + 0.18, y1 + 0.03, 1.75, 1.82)
    for a, b in zip(posts[1:-1], posts[2:]):
        box(F, "Pillar_White", a + 0.15, y1 - 0.22, b - 0.15, y1 - 0.08, 0.0, PAVE + 0.10)
        bars(F, a + 0.15, b - 0.15, y1 - 0.15, PAVE + 0.10, 1.55)
    bars(F, -0.96, 5.30, y1 - 0.15, 0.06, 1.55, gate=True)
    # รั้วสวนด้านตะวันตก (หันออกปลายซอย) แบบเดียวกับรั้วหน้า
    gposts = [y1, 13.0, 15.0, gy1]
    for py in gposts:
        box(F, "Pillar_White", gx0 - 0.15, py - 0.15, gx0 + 0.15, py + 0.15, 0.0, 1.75)
        box(F, "Pillar_White", gx0 - 0.18, py - 0.18, gx0 + 0.18, py + 0.18, 1.75, 1.82)
    for a, b in zip(gposts, gposts[1:]):
        box(F, "Pillar_White", gx0 - 0.07, a + 0.15, gx0 + 0.07, b - 0.15, 0.0, PAVE + 0.10)
        bars_y(F, a + 0.15, b - 0.15, gx0, PAVE + 0.10, 1.55)
    # ผนังรั้วปูนเรียบสีขาว: ซ้าย บน ขวา(ยาวถึงสุดสวน) และท้ายสวน
    S = "Fence_Side"
    walls = ((x0, y0, x0, y1 - 0.3), (x1, y0, x1, gy1), (x0, y0, x1, y0), (gx0 + 0.15, gy1, x1, gy1))
    for xa, ya, xb, yb in walls:
        if xa == xb:
            box(S, "Fence_Wall", xa - 0.05, ya, xa + 0.05, yb, 0.0, 2.0)
            box(S, "Fence_Wall", xa - 0.07, ya, xa + 0.07, yb, 2.0, 2.06)
        else:
            box(S, "Fence_Wall", xa, ya - 0.05, xb, ya + 0.05, 0.0, 2.0)
            box(S, "Fence_Wall", xa, ya - 0.07, xb, ya + 0.07, 2.0, 2.06)
    # กระบะต้นไม้: ยาวตามแนวเทอเรสด้านบนและด้านขวาจนถึงต้นไม้ใหญ่ + รอบสวนท้าย
    beds = [
        (8.30, -2.55, 15.15, -2.08),        # ตามแนวเทอเรสด้านเหนือ
        (15.15, -2.55, 15.79, 9.20),        # ตามแนวเทอเรสด้านตะวันออก ยาวถึงต้นไม้ใหญ่
        (15.15, 11.10, 15.79, 16.95),       # สวนท้าย ด้านตะวันออก
        (11.35, 16.35, 15.15, 16.95),       # สวนท้าย ด้านใต้
        (5.70, 10.02, 8.15, 10.55),         # รั้วหน้า
        (8.45, 10.02, 11.00, 10.55),
        (-1.06, 6.60, -0.40, 10.55),        # ข้างลานจอด
    ]
    seed = 1
    for bx0, by0, bx1, by1 in beds:
        zt = planter(bx0, by0, bx1, by1)
        long_x = (bx1 - bx0) > (by1 - by0)
        L = (bx1 - bx0) if long_x else (by1 - by0)
        n = max(1, int(L / 0.85))
        for i in range(n):
            t = (i + 0.5) / n
            cx = bx0 + (bx1 - bx0) * t if long_x else (bx0 + bx1) / 2
            cy = (by0 + by1) / 2 if long_x else by0 + (by1 - by0) * t
            if i % 2 == 0:
                agave(cx, cy, zt, 0.58, seed)
            else:
                shrub(cx, cy, zt, 0.16)
            seed += 1
    # ลดความแข็งของพื้น: โซนกระเบื้องลายไม้ใต้มุมนั่งเล่น + แถบกรวดขาวหน้ากระบะต้นไม้
    W = "Paving_Accent"
    for zx0, zy0, zx1, zy1 in ((9.80, -1.95, 13.20, -0.05), (12.10, 12.05, 14.80, 14.05)):
        box(W, "Wood_Tile", zx0, zy0, zx1, zy1, PAVE - 0.01, PAVE + 0.006, skip=("bot",))
    for px0, py0, px1, py1 in ((8.30, -2.08, 15.15, -1.86), (14.93, -1.86, 15.15, 9.20),
                               (11.35, 16.13, 15.15, 16.35), (14.93, 11.10, 15.15, 16.13),
                               (5.70, 9.80, 8.15, 10.02), (8.45, 9.80, 11.00, 10.02)):
        box(W, "Pebble", px0, py0, px1, py1, PAVE - 0.01, PAVE + 0.012, skip=("bot",))
    # ต้นไม้ใหญ่ (กระบะใหญ่ที่ปลายแนวกระถาง)
    zt = planter(14.15, 9.20, 15.79, 11.10)
    tree(14.95, 10.15, 5.0, 1.8, base=zt)
    tree(12.40, 15.30, 3.6, 1.3, base=planter(11.70, 14.60, 13.10, 16.00))
    lounge_set("Garden_Set", 13.4, 13.0, PAVE)
    # ไฟผนังส่องขึ้น-ลงบนรั้ว
    for y in (-1.2, 0.6, 2.4, 4.2, 6.0, 7.8, 12.2, 14.0, 15.8):
        wall_light(x1 - 0.05, y, 1.45, -1, 0)
    for y in (3.6, 5.0, 6.4, 7.8, 9.2):
        wall_light(x0 + 0.05, y, 1.45, 1, 0)
    for x in (9.4, 11.4, 13.4):
        wall_light(x, y0 + 0.05, 1.45, 0, 1)
    for x in (12.2, 14.0):
        wall_light(x, gy1 - 0.05, 1.45, 0, -1)


def bars_y(obj, ya, yb, x, z0, z1):
    box(obj, "Steel_Black", x - 0.025, ya, x + 0.025, yb, z0, z0 + 0.05)
    box(obj, "Steel_Black", x - 0.025, ya, x + 0.025, yb, z1 - 0.05, z1)
    box(obj, "Steel_Black", x - 0.02, ya, x + 0.02, yb, z1 - 0.25, z1 - 0.21)
    n = int((yb - ya) / 0.11)
    for i in range(1, n):
        y = ya + (yb - ya) * i / n
        box(obj, "Steel_Black", x - 0.01, y - 0.01, x + 0.01, y + 0.01, z0, z1)


def bars(obj, xa, xb, y, z0, z1, gate=False):
    box(obj, "Steel_Black", xa, y - 0.025, xb, y + 0.025, z0, z0 + 0.05)
    box(obj, "Steel_Black", xa, y - 0.025, xb, y + 0.025, z1 - 0.05, z1)
    box(obj, "Steel_Black", xa, y - 0.02, xb, y + 0.02, z1 - 0.25, z1 - 0.21)
    n = int((xb - xa) / 0.11)
    for i in range(1, n):
        x = xa + (xb - xa) * i / n
        box(obj, "Steel_Black", x - 0.01, y - 0.01, x + 0.01, y + 0.01, z0, z1)
    if gate:
        for x in (xa + 0.02, (xa + xb) / 2, xb - 0.02):
            box(obj, "Steel_Black", x - 0.03, y - 0.03, x + 0.03, y + 0.03, z0, z1)


# ---------------------------------------------------------------------------
# รวม
# ---------------------------------------------------------------------------
def build_geometry():
    PARTS.clear()
    LIGHTS.clear()
    WASHES.clear()
    PORTALS.clear()
    site()
    house_ground()
    house_upper()
    gable_face()
    extension()
    carport_extension()
    furniture_ground()
    furniture_upper()
    return PARTS


# ---------------------------------------------------------------------------
# กลุ่มสำหรับอบแสง (bake) + UV แผนที่แสง (lightmap) แบบคำนวณเอง ให้ผลเหมือนกันทุกเครื่อง
# ---------------------------------------------------------------------------
NO_BAKE_MATS = {"Glass", "Glass_Rail", "Curtain_Sheer"}
BAKE_GROUPS = {                 # ชื่อกลุ่ม: ขนาดภาพ (px)
    "lawn": 2048, "site": 4096, "plants": 2048, "house_g": 4096, "house_u": 4096,
    "roofs": 2048, "ext": 2048, "furn_g": 2048, "furn_u": 2048,
}


def group_of(key):
    lyr, obj, mat = key
    if mat in NO_BAKE_MATS:
        return "glass"
    if obj == "Lawn":
        return "lawn"
    if obj in ("Trees", "Plants") or mat in ("Leaves", "Leaves_Light", "Agave", "Bark"):
        return "plants"
    if lyr in ("roof", "ext_roof"):
        return "roofs"
    if lyr == "site":
        return "site"
    return lyr


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _norm(a):
    l = math.sqrt(_dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


def _charts(part, cos_lim=0.80):
    """แบ่งหน้าเป็นชิ้น (chart) ตามหน้าที่ติดกันและหันทางใกล้กัน แล้วฉายลงระนาบ"""
    V, F = part["verts"], part["faces"]
    N = [_newell([_bl(V[i]) for i in f]) for f in F]
    q = lambda v: (round(v[0], 4), round(v[1], 4), round(v[2], 4))
    edge_faces = {}
    for fi, f in enumerate(F):
        for k in range(len(f)):
            a, b = q(V[f[k]]), q(V[f[(k + 1) % len(f)]])
            e = (a, b) if a < b else (b, a)
            edge_faces.setdefault(e, []).append(fi)
    nbr = [[] for _ in F]
    for fl in edge_faces.values():
        if 1 < len(fl) <= 4:
            for x in fl:
                for y in fl:
                    if x != y:
                        nbr[x].append(y)
    seen = [False] * len(F)
    charts = []
    for seed in range(len(F)):
        if seen[seed]:
            continue
        ns = N[seed]
        members, stack = [], [seed]
        seen[seed] = True
        while stack:
            fi = stack.pop()
            members.append(fi)
            for nb in nbr[fi]:
                if not seen[nb] and _dot(N[nb], ns) > cos_lim:
                    seen[nb] = True
                    stack.append(nb)
        members.sort()
        ref = (0.0, 0.0, 1.0) if abs(ns[2]) < 0.95 else (1.0, 0.0, 0.0)
        t1 = _norm(_cross(ref, ns))
        t2 = _cross(ns, t1)
        loops = []
        for fi in members:
            pts = []
            for vi in F[fi]:
                p = _bl(V[vi])
                pts.append((_dot(p, t1), _dot(p, t2)))
            loops.append((fi, pts))
        xs = [x for _, pts in loops for x, _ in pts]
        ys = [y for _, pts in loops for _, y in pts]
        charts.append({"loops": loops, "x0": min(xs), "y0": min(ys),
                       "w": max(xs) - min(xs), "h": max(ys) - min(ys)})
    return charts


def _shelf(rects, S):
    """วางสี่เหลี่ยมแบบชั้นวาง คืนตำแหน่ง หรือ None ถ้าไม่พอ"""
    order = sorted(range(len(rects)), key=lambda i: (-rects[i][1], -rects[i][0], i))
    pos = [None] * len(rects)
    x = y = shelf_h = 0
    for i in order:
        w, h = rects[i]
        if w > S:
            return None
        if x + w > S:
            y += shelf_h
            x, shelf_h = 0, 0
        if y + h > S:
            return None
        pos[i] = (x, y)
        x += w
        shelf_h = max(shelf_h, h)
    return pos


def lightmap_uvs(keys, size, margin=3):
    """คำนวณ UV แผนที่แสงของทั้งกลุ่ม คืน {key: [[(u, v) ต่อจุด] ต่อหน้า]} และสเกล px/ม."""
    charts = []
    for key in keys:
        for ch in _charts(PARTS[key]):
            ch["key"] = key
            charts.append(ch)
    area = sum(max(c["w"], 0.003) * max(c["h"], 0.003) for c in charts)
    lo, hi = 1.0, math.sqrt(size * size / max(area, 1e-6)) * 1.2
    best = None

    def rects_for(sc):
        out = []
        for c in charts:
            w = int(math.ceil(c["w"] * sc)) + 2 * margin
            h = int(math.ceil(c["h"] * sc)) + 2 * margin
            c["rot"] = h > w
            out.append((h, w) if c["rot"] else (w, h))
        return out
    for _ in range(22):
        mid = (lo + hi) / 2
        pos = _shelf(rects_for(mid), size)
        if pos is None:
            hi = mid
        else:
            lo, best = mid, (mid, pos)
    if best is None:
        best = (lo, _shelf(rects_for(lo), size))
    sc, _ = best
    pos = _shelf(rects_for(sc), size)
    result = {k: [None] * len(PARTS[k]["faces"]) for k in keys}
    for c, (px, py) in zip(charts, pos):
        for fi, pts in c["loops"]:
            uv = []
            for x, y in pts:
                lx, ly = (x - c["x0"]) * sc, (y - c["y0"]) * sc
                if c["rot"]:
                    lx, ly = ly, lx
                uv.append(((px + margin + lx) / size, (py + margin + ly) / size))
            result[c["key"]][fi] = uv
    return result, sc


def bake_layout(scale=1.0):
    """ทุกกลุ่ม: {group: {"size": px, "keys": [...], "uv": {...}, "ppm": px/ม.}}"""
    groups = {}
    for key in PARTS:
        g = group_of(key)
        if g == "glass":
            continue
        groups.setdefault(g, []).append(key)
    out = {}
    for g, keys in groups.items():
        size = max(256, int(BAKE_GROUPS.get(g, 2048) * scale))
        uv, sc = lightmap_uvs(keys, size)
        out[g] = {"size": size, "keys": keys, "uv": uv, "ppm": sc}
    return out


def export_json(path):
    import json
    build_geometry()
    mats = {}
    for k, (c, r, m, ex) in MATERIALS.items():
        mats[k] = {"c": [round(v, 4) for v in c], "r": r, "m": m, **ex}
    parts = []
    for (lyr, obj, mat), p in PARTS.items():
        if mat not in MATERIALS:
            raise KeyError(mat)
        # three.js: (x, z, y)
        v = []
        for x, y, z in p["verts"]:
            v += [round(x, 3), round(z, 3), round(y, 3)]
        parts.append({"l": lyr, "o": obj, "m": mat, "v": v, "p": [list(f) for f in p["faces"]]})
    lights = [{"l": l, "p": [round(pos[0], 3), round(pos[2], 3), round(pos[1], 3)], "w": w, "k": k}
              for l, pos, w, k in LIGHTS]
    washes = [[round(x, 3), round(z, 3), round(y, 3), nx, ny] for x, y, z, nx, ny in WASHES]
    data = {"mats": mats, "parts": parts, "lights": lights, "washes": washes}
    s = json.dumps(data, separators=(",", ":"))
    with open(path, "w") as f:
        f.write(s)
    return len(s)




# ===========================================================================
# ชั้น Blender  (ทดสอบ API กับ Blender 4.2 – 5.2)
# ===========================================================================
import os
import time
import json

try:
    import bpy
    from mathutils import Vector, Euler
except ImportError:
    bpy = None

LOG = []


def log(*a):
    msg = " ".join(str(x) for x in a)
    print("[PAVE]", msg)
    LOG.append(time.strftime("%H:%M:%S ") + msg)


def _set(o, attr, val):
    """ตั้งค่าแบบไม่ล้มถ้า property ไม่มีในเวอร์ชันนั้น"""
    try:
        setattr(o, attr, val)
        return True
    except Exception:
        return False


def _sock(node, names):
    for nm in names if isinstance(names, (list, tuple)) else [names]:
        if nm in node.inputs:
            return node.inputs[nm]
    return None


def _setin(node, names, val):
    s = _sock(node, names)
    if s is not None:
        try:
            s.default_value = val
        except Exception:
            pass
    return s


def out_dir():
    d = os.path.expanduser(CONFIG["OUT_DIR"])
    os.makedirs(d, exist_ok=True)
    return d


# ---------------------------------------------------------------------------
# วัสดุ (procedural PBR บน UV หน่วยเมตร)
# ---------------------------------------------------------------------------
SMOOTH_MATS = {"Leaves", "Leaves_Light", "Ceramic", "Smoke_Glass", "Tank", "Plant_Pot", "Bark", "Chrome", "Brass",
               "Mirror", "Cat_Orange", "Cat_Grey", "Cat_White", "Cat_Pink", "Cat_Eye", "Toy_Red", "Toy_Yellow",
               "Sisal", "Fabric_Grey", "Linen_White"}
BRICK = {   # tex: (กว้าง, สูง, เยื้อง, ร่อง, สีร่อง)
    "tile60": (0.6, 0.6, 0.0, 0.0025, (0.60, 0.58, 0.54)),
    "tile3060": (0.3, 0.6, 0.0, 0.002, (0.70, 0.70, 0.68)),
    "tile3030": (0.3, 0.3, 0.0, 0.003, (0.70, 0.70, 0.70)),
    "paver": (1.2, 0.6, 0.0, 0.006, (0.12, 0.12, 0.12)),
    "stone": (1.2, 0.6, 0.5, 0.002, (0.52, 0.45, 0.36)),
    "laminate": (1.2, 0.2, 0.37, 0.0012, (0.10, 0.07, 0.05)),
    "woodplank": (1.2, 0.2, 0.37, 0.0018, (0.08, 0.05, 0.03)),
    "rooftile": (0.333, 0.333, 0.5, 0.004, (0.03, 0.02, 0.02)),
    "solar": (0.166, 0.166, 0.0, 0.004, (0.45, 0.47, 0.50)),
}


class _NT:
    """ตัวช่วยต่อโหนด"""

    def __init__(self, mat):
        self.nt = mat.node_tree
        self.x = -1200

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        node.location = (self.x, len(self.nt.nodes) * -40)
        self.x += 15
        for k, v in props.items():
            _set(node, k, v)
        return node

    def link(self, a, b):
        if a is not None and b is not None:
            self.nt.links.new(a, b)


def _mix_color(T, blend, fac, a, b):
    """ผสมสี ใช้โหนด Mix รุ่นใหม่ (ระบุ socket ด้วย identifier) ถ้าไม่มีใช้ MixRGB รุ่นเก่า"""
    try:
        m = T.n("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        ins = {s.identifier: s for s in m.inputs}
        outs = {s.identifier: s for s in m.outputs}
        ins["Factor_Float"].default_value = fac
        T.link(a, ins["A_Color"])
        T.link(b, ins["B_Color"])
        return outs["Result_Color"]
    except Exception:
        m = T.n("ShaderNodeMixRGB", blend_type=blend)
        m.inputs[0].default_value = fac
        T.link(a, m.inputs[1])
        T.link(b, m.inputs[2])
        return m.outputs[0]


def make_material(name, spec):
    color, rough, metal, ex = spec
    mname = "PV_" + name
    mat = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
    _set(mat, "use_nodes", True)
    nt = mat.node_tree
    nt.nodes.clear()
    T = _NT(mat)
    out = T.n("ShaderNodeOutputMaterial")
    out.location = (600, 0)
    bsdf = T.n("ShaderNodeBsdfPrincipled")
    bsdf.location = (250, 0)
    _setin(bsdf, "Base Color", (*color, 1))
    _setin(bsdf, "Roughness", rough)
    _setin(bsdf, "Metallic", metal)
    mat.diffuse_color = (*color, 1)
    surf = bsdf.outputs[0]

    tc = T.n("ShaderNodeTexCoord")
    uv = tc.outputs["UV"]
    tex = ex.get("tex")

    # ---- พื้นผิวโปร่ง/พิเศษ ----
    if ex.get("glass"):
        _setin(bsdf, ["Transmission Weight", "Transmission"], 1.0)
        _setin(bsdf, "IOR", 1.5)
        _setin(bsdf, "Roughness", 0.0)
        lp = T.n("ShaderNodeLightPath")
        tr = T.n("ShaderNodeBsdfTransparent")
        mix = T.n("ShaderNodeMixShader")
        T.link(lp.outputs["Is Shadow Ray"], mix.inputs[0])       # แสงแดดลอดกระจกเข้าห้องได้
        T.link(surf, mix.inputs[1])
        T.link(tr.outputs[0], mix.inputs[2])
        T.link(mix.outputs[0], out.inputs["Surface"])
        mat.diffuse_color = (*color, 0.25)
        _set(mat, "surface_render_method", "BLENDED")
        _set(mat, "blend_method", "BLEND")
        return mat
    if ex.get("sheer"):
        _setin(bsdf, ["Sheen Weight", "Sheen"], 0.4)
        tr = T.n("ShaderNodeBsdfTranslucent")
        _setin(tr, "Color", (*color, 1))
        mix1 = T.n("ShaderNodeMixShader")
        _setin(mix1, "Fac", 0.35)
        T.link(surf, mix1.inputs[1])
        T.link(tr.outputs[0], mix1.inputs[2])
        trn = T.n("ShaderNodeBsdfTransparent")
        mix2 = T.n("ShaderNodeMixShader")
        _setin(mix2, "Fac", 0.55)                                  # ม่านโปร่งแสง 55%
        T.link(mix1.outputs[0], mix2.inputs[1])
        T.link(trn.outputs[0], mix2.inputs[2])
        T.link(mix2.outputs[0], out.inputs["Surface"])
        _set(mat, "surface_render_method", "BLENDED")
        _set(mat, "blend_method", "BLEND")
        return mat
    if "emit" in ex:
        _setin(bsdf, ["Emission Color", "Emission"], (*color, 1))
        _setin(bsdf, "Emission Strength", ex["emit"])
        bsdf.name = "PV_BSDF"
        T.link(surf, out.inputs["Surface"])
        mat["pv_emit"] = ex["emit"]
        return mat
    if name in ("Fabric_Beige", "Fabric_Grey", "Fabric_Navy", "Fabric_Olive", "Fabric_Pink", "Linen_White",
                "Velvet_Teal", "Curtain_Beige", "Rug_Shag", "Cat_Carpet", "Cat_Orange", "Cat_Grey", "Cat_White"):
        _setin(bsdf, ["Sheen Weight", "Sheen"], 0.6 if name != "Velvet_Teal" else 1.0)
        _setin(bsdf, ["Specular IOR Level", "Specular"], 0.25)
    if name in ("Leaves", "Leaves_Light", "Agave"):
        _setin(bsdf, ["Subsurface Weight", "Subsurface"], 0.15)
    if name in ("Ceramic", "White_Gloss", "Marble", "Floor_Tile", "Tile_Grey"):
        _setin(bsdf, ["Coat Weight", "Clearcoat"], 0.25 if name in ("Floor_Tile", "Tile_Grey") else 0.5)
        _setin(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.06)

    col_out = None
    height = None
    bump_str, bump_dist = 0.08, 0.004
    if tex in BRICK:
        bw, bh, off, mort, mcol = BRICK[tex]
        br = T.n("ShaderNodeTexBrick", offset=off, offset_frequency=2, squash=1.0, squash_frequency=2)
        T.link(uv, br.inputs["Vector"])
        _setin(br, "Scale", 1.0)
        _setin(br, "Brick Width", bw)
        _setin(br, "Row Height", bh)
        _setin(br, "Mortar Size", mort)
        _setin(br, "Mortar Smooth", 0.2)
        _setin(br, "Bias", 0.0)
        dark = 0.80 if tex in ("laminate", "woodplank", "rooftile", "stone") else 0.94
        _setin(br, "Color1", (*color, 1))
        _setin(br, "Color2", (color[0] * dark, color[1] * dark, color[2] * dark, 1))
        _setin(br, "Mortar", (*mcol, 1))
        col_out, height = br.outputs["Color"], br.outputs["Fac"]
        bump_str = {"rooftile": 0.9, "stone": 0.25, "paver": 0.35, "solar": 0.1}.get(tex, 0.18)
        if tex in ("laminate", "woodplank"):
            wv = T.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X")
            T.link(uv, wv.inputs["Vector"])
            _setin(wv, "Scale", 18.0)
            _setin(wv, "Distortion", 7.0)
            _setin(wv, "Detail", 4.0)
            col_out = _mix_color(T, "MULTIPLY", 0.25, col_out, wv.outputs["Color"])
        if tex == "stone":                                         # ผิวทรายกันลื่น + ลายหินเบาๆ
            nz = T.n("ShaderNodeTexNoise")
            T.link(uv, nz.inputs["Vector"])
            _setin(nz, "Scale", 2.2)
            _setin(nz, "Detail", 6.0)
            col_out = _mix_color(T, "OVERLAY", 0.12, col_out, nz.outputs["Color"])
            grit = T.n("ShaderNodeTexNoise")
            T.link(uv, grit.inputs["Vector"])
            _setin(grit, "Scale", 420.0)
            mh = T.n("ShaderNodeMath", operation="MULTIPLY_ADD")
            T.link(height, mh.inputs[0])
            mh.inputs[1].default_value = 1.0
            T.link(grit.outputs["Fac"], mh.inputs[2])
            height = mh.outputs[0]
    elif tex in ("siding", "metalsheet"):
        wv = T.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X",
                 wave_profile="SAW" if tex == "siding" else "SIN")
        T.link(uv, wv.inputs["Vector"])
        period = 0.10 if tex == "siding" else 0.25
        _setin(wv, "Scale", (2 * math.pi / 20.0) / period)
        ramp = T.n("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (color[0] * 0.75, color[1] * 0.75, color[2] * 0.75, 1)
        ramp.color_ramp.elements[1].color = (*color, 1)
        ramp.color_ramp.elements[1].position = 0.06 if tex == "siding" else 0.5
        T.link(wv.outputs["Fac"], ramp.inputs["Fac"])
        col_out, height = ramp.outputs["Color"], wv.outputs["Fac"]
        bump_str, bump_dist = (0.5, 0.006) if tex == "siding" else (0.6, 0.02)
    elif tex in ("woodgrain", "marble"):
        wv = T.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Y" if tex == "woodgrain" else "DIAGONAL")
        T.link(uv, wv.inputs["Vector"])
        _setin(wv, "Scale", 9.0 if tex == "woodgrain" else 0.9)
        _setin(wv, "Distortion", 8.0 if tex == "woodgrain" else 14.0)
        _setin(wv, "Detail", 6.0)
        ramp = T.n("ShaderNodeValToRGB")
        if tex == "woodgrain":
            ramp.color_ramp.elements[0].color = (color[0] * 0.65, color[1] * 0.62, color[2] * 0.6, 1)
            ramp.color_ramp.elements[1].color = (*color, 1)
        else:
            ramp.color_ramp.elements[0].color = (*color, 1)
            ramp.color_ramp.elements[0].position = 0.86
            ramp.color_ramp.elements[1].color = (color[0] * 0.55, color[1] * 0.55, color[2] * 0.56, 1)
        T.link(wv.outputs["Fac"], ramp.inputs["Fac"])
        col_out, height = ramp.outputs["Color"], wv.outputs["Fac"]
        bump_str = 0.05
    elif tex == "pebble":
        vo = T.n("ShaderNodeTexVoronoi", feature="F1")
        T.link(uv, vo.inputs["Vector"])
        _setin(vo, "Scale", 38.0)
        _setin(vo, "Randomness", 0.9)
        ramp = T.n("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (*color, 1)
        ramp.color_ramp.elements[1].color = (color[0] * 0.35, color[1] * 0.35, color[2] * 0.35, 1)
        T.link(vo.outputs["Distance"], ramp.inputs["Fac"])
        col_out = ramp.outputs["Color"]
        inv = T.n("ShaderNodeMath", operation="SUBTRACT")
        inv.inputs[0].default_value = 1.0
        T.link(vo.outputs["Distance"], inv.inputs[1])
        height = inv.outputs[0]
        bump_str, bump_dist = 0.8, 0.01
    elif tex:
        sc = {"grass": 40.0, "leaves": 12.0, "shag": 180.0, "fabric": 220.0, "asphalt": 60.0,
              "concrete": 5.0, "plaster": 3.0}.get(tex, 8.0)
        k = {"grass": (0.6, 1.4), "leaves": (0.6, 1.5), "shag": (0.7, 1.25), "plaster": (0.95, 1.03),
             "concrete": (0.85, 1.1), "fabric": (0.88, 1.08)}.get(tex, (0.85, 1.12))
        nz = T.n("ShaderNodeTexNoise")
        T.link(uv, nz.inputs["Vector"])
        _setin(nz, "Scale", sc)
        _setin(nz, "Detail", 8.0)
        _setin(nz, "Roughness", 0.55)
        ramp = T.n("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (color[0] * k[0], color[1] * k[0], color[2] * k[0], 1)
        ramp.color_ramp.elements[1].color = (min(1, color[0] * k[1]), min(1, color[1] * k[1]), min(1, color[2] * k[1]), 1)
        T.link(nz.outputs["Fac"], ramp.inputs["Fac"])
        col_out = ramp.outputs["Color"]
        fine = T.n("ShaderNodeTexNoise")
        T.link(uv, fine.inputs["Vector"])
        _setin(fine, "Scale", sc * 12)
        height = fine.outputs["Fac"]
        bump_str = {"plaster": 0.04, "shag": 0.5, "grass": 0.4, "fabric": 0.15}.get(tex, 0.08)
    if col_out is not None:
        T.link(col_out, bsdf.inputs["Base Color"])
    if height is not None:
        bump = T.n("ShaderNodeBump")
        _setin(bump, "Strength", bump_str)
        _setin(bump, "Distance", bump_dist)
        T.link(height, bump.inputs["Height"])
        T.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # ความด้าน-เงาไม่สม่ำเสมอเล็กน้อย ให้ดูเป็นวัสดุจริง
    if metal < 0.9 and name not in ("Mirror", "Screen", "Black_Glass"):
        rn = T.n("ShaderNodeTexNoise")
        T.link(uv, rn.inputs["Vector"])
        _setin(rn, "Scale", 1.6)
        mr = T.n("ShaderNodeMapRange")
        _setin(mr, "To Min", max(0.02, rough - 0.07))
        _setin(mr, "To Max", min(1.0, rough + 0.07))
        T.link(rn.outputs["Fac"], mr.inputs[0])
        T.link(mr.outputs[0], bsdf.inputs["Roughness"])
    # ใบไม้: โปร่งแสงเล็กน้อย
    if name in ("Leaves", "Leaves_Light"):
        tr = T.n("ShaderNodeBsdfTranslucent")
        _setin(tr, "Color", (color[0] * 1.4, color[1] * 1.4, color[2] * 0.8, 1))
        mix = T.n("ShaderNodeMixShader")
        _setin(mix, "Fac", 0.25)
        T.link(surf, mix.inputs[1])
        T.link(tr.outputs[0], mix.inputs[2])
        surf = mix.outputs[0]
    T.link(surf, out.inputs["Surface"])
    return mat


def make_leaf_material(name, c1, c2):
    """วัสดุใบไม้สำหรับอนุภาค: สีสุ่มต่อใบด้วย Object Info > Random"""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    _set(mat, "use_nodes", True)
    nt = mat.node_tree
    nt.nodes.clear()
    T = _NT(mat)
    out = T.n("ShaderNodeOutputMaterial")
    bsdf = T.n("ShaderNodeBsdfPrincipled")
    oi = T.n("ShaderNodeObjectInfo")
    ramp = T.n("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*c1, 1)
    ramp.color_ramp.elements[1].color = (*c2, 1)
    T.link(oi.outputs["Random"], ramp.inputs["Fac"])
    T.link(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    _setin(bsdf, "Roughness", 0.55)
    _setin(bsdf, ["Specular IOR Level", "Specular"], 0.35)
    tr = T.n("ShaderNodeBsdfTranslucent")
    T.link(ramp.outputs["Color"], tr.inputs["Color"])
    mix = T.n("ShaderNodeMixShader")
    _setin(mix, "Fac", 0.3)
    T.link(bsdf.outputs[0], mix.inputs[1])
    T.link(tr.outputs[0], mix.inputs[2])
    T.link(mix.outputs[0], out.inputs["Surface"])
    mat.diffuse_color = (*c1, 1)
    return mat


# ---------------------------------------------------------------------------
# สร้าง mesh ต่อกลุ่ม (กลุ่มเดียวกับที่ใช้อบแสง) พร้อม UV 2 ชุด
# ---------------------------------------------------------------------------
GROUP_LABEL = {"lawn": "สนามรอบนอก", "site": "บริเวณบ้าน", "plants": "ต้นไม้", "house_g": "บ้าน ชั้นล่าง",
               "house_u": "บ้าน ชั้นบน", "roofs": "หลังคา", "ext": "ส่วนต่อเติม", "furn_g": "เฟอร์นิเจอร์ ชั้นล่าง",
               "furn_u": "เฟอร์นิเจอร์ ชั้นบน", "glass": "กระจกและม่าน"}


def _uv_metric(v, n, mode):
    x, y, z = v
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if mode == "roof" and 0.3 < az < 0.98:
        k = 1.0 / az
        return (y, x * k) if ax > ay else (x, y * k)
    if az >= ax and az >= ay:
        return (x, y)
    if ax >= ay:
        return (y, z)
    return (x, z)


def bl_coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def build_group_object(g, keys, mats, lm=None):
    verts, faces, mat_idx, smooth = [], [], [], []
    uv0, uv1 = [], []
    slots = []
    for key in keys:
        p = PARTS[key]
        mname = key[2]
        if mname not in slots:
            slots.append(mname)
        si = slots.index(mname)
        off = len(verts)
        V = [_bl(v) for v in p["verts"]]
        verts.extend(V)
        mode = MATERIALS[mname][3].get("uv", "box")
        lmf = lm["uv"][key] if lm else None
        for fi, f in enumerate(p["faces"]):
            faces.append(tuple(i + off for i in f))
            mat_idx.append(si)
            smooth.append(mname in SMOOTH_MATS)
            n = _newell([V[i] for i in f])
            for i in f:
                uv0.extend(_uv_metric(V[i], n, mode))
            if lmf:
                for u, v in lmf[fi]:
                    uv1.extend((u, v))
    me = bpy.data.meshes.new("PV_" + g)
    me.from_pydata(verts, [], faces)
    for mname in slots:
        me.materials.append(mats[mname])
    me.polygons.foreach_set("material_index", mat_idx)
    me.polygons.foreach_set("use_smooth", smooth)
    l0 = me.uv_layers.new(name="UVMap")
    l0.data.foreach_set("uv", uv0)
    if lmf is not None or lm:
        l1 = me.uv_layers.new(name="Lightmap")
        l1.data.foreach_set("uv", uv1)
        _set(l0, "active_render", True)
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new("PV_" + g, me)
    bl_coll("PV " + GROUP_LABEL.get(g, g)).objects.link(ob)
    ob["pv_group"] = g
    return ob


def bl_purge():
    """ล้างฉากเดิม (เฉพาะของสคริปต์นี้ + วัตถุทั้งหมดในฉาก)"""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.particles):
        for it in list(blk):
            if it.users == 0 or it.name.startswith("PV_"):
                try:
                    blk.remove(it)
                except Exception:
                    pass
    try:
        bpy.context.scene.timeline_markers.clear()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# ใบไม้ หญ้า (อนุภาค) และแนวต้นไม้รอบนอก  — ใช้ตอนเรนเดอร์เท่านั้น
# ---------------------------------------------------------------------------
def _mesh_obj(name, verts, faces, mat, coll):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    me.update()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def make_leaf(name, L, W, mat, coll):
    """ใบไม้ 1 ใบ ชี้ไปตามแกน +X (แกนที่อนุภาคหันตามผิว)"""
    pts = [(0, 0), (0.2, 0.42), (0.5, 0.5), (0.8, 0.32), (1.0, 0.0), (0.8, -0.32), (0.5, -0.5), (0.2, -0.42)]
    V = [(x * L, y * W, -0.15 * L * (x - 0.5) ** 2) for x, y in pts]
    return _mesh_obj(name, V, [tuple(range(len(V)))], mat, coll)


def make_grass_clump(name, mat, coll):
    import random
    R = random.Random(7)
    V, F = [], []
    for i in range(11):
        a = R.random() * 6.283
        r = R.random() * 0.03
        L = 0.07 + R.random() * 0.09
        w = 0.004 + R.random() * 0.003
        lean = 0.25 + R.random() * 0.35
        bx, by = r * math.cos(a), r * math.sin(a)
        px, py = -math.sin(a) * w, math.cos(a) * w
        tip = (L, by + math.sin(a) * L * lean, bx + math.cos(a) * L * lean)
        k = len(V)
        V += [(0, by + px, bx + py), (0, by - px, bx - py), tip]
        F.append((k, k + 1, k + 2))
    return _mesh_obj(name, V, F, mat, coll)


def add_instances(ob, inst, count, size, size_rand=0.4, rot_rand=0.5, seed=1, viewport=8):
    mod = ob.modifiers.new("PV_scatter_%s" % inst.name, "PARTICLE_SYSTEM")
    ps = mod.particle_system
    st = ps.settings
    st.name = "PV_ps_" + inst.name
    for k, v in (("type", "HAIR"), ("use_advanced_hair", True), ("count", int(count)), ("hair_length", 0.1),
                 ("emit_from", "FACE"), ("distribution", "RAND"), ("use_emit_random", True),
                 ("render_type", "OBJECT"), ("instance_object", inst), ("particle_size", size),
                 ("size_random", size_rand), ("use_rotations", True), ("rotation_mode", "NOR"),
                 ("rotation_factor_random", rot_rand), ("phase_factor_random", 1.0),
                 ("display_percentage", viewport), ("use_rotation_instance", False)):
        _set(st, k, v)
    ps.seed = seed
    return mod


def build_foliage(objs):
    """ใบไม้บนพุ่มต้นไม้/พุ่มไม้ หญ้าบนสนามรอบนอก และแนวต้นไม้ไกลๆ"""
    coll = bl_coll("PV ใบไม้และหญ้า (เรนเดอร์)")
    assets = bl_coll("PV _assets", coll)
    leaf_mat = make_leaf_material("PV_LeafCard", (0.035, 0.09, 0.015), (0.10, 0.17, 0.03))
    grass_mat = make_leaf_material("PV_GrassBlade", (0.04, 0.11, 0.015), (0.11, 0.20, 0.035))
    leaf = make_leaf("PV_leaf", 0.11, 0.05, leaf_mat, assets)
    leaf_big = make_leaf("PV_leaf_far", 0.30, 0.14, leaf_mat, assets)
    clump = make_grass_clump("PV_grass", grass_mat, assets)
    for o in (leaf, leaf_big, clump):
        # ห้ามปิด hide_render ของต้นแบบ ไม่งั้นใบไม้/หญ้าที่ก๊อปจากมันจะหายไปด้วย -> ซ่อนไว้ใต้ดินแทน
        o.location = (0.0, 0.0, -300.0)
        o.hide_set(True)
    # ตัวปล่อยใบไม้ = ทรงพุ่มเดิม (ผิวใบ Leaves) ซ่อนตอนเรนเดอร์ แต่ทรงพุ่มทึบในกลุ่ม plants ยังอยู่เป็นเนื้อใบด้านใน
    keys = [k for k in PARTS if k[2] in ("Leaves", "Leaves_Light")]
    if keys:
        em = build_group_object("foliage_emit", keys, {k[2]: bpy.data.materials["PV_" + k[2]] for k in keys})
        coll.objects.link(em)
        for c in list(em.users_collection):
            if c != coll:
                c.objects.unlink(em)
        area = sum(p.area for p in em.data.polygons)
        add_instances(em, leaf, area * 110, 1.0, 0.45, 0.6, seed=3)
        _set(em, "show_instancer_for_render", False)
        em["pv_render_only"] = True
    # หญ้าบนสนามรอบนอก
    lawn = objs.get("lawn")
    if lawn:
        add_instances(lawn, clump, 160000, 1.0, 0.5, 0.15, seed=11, viewport=2)
    # แนวต้นไม้ไกลๆ (เรนเดอร์เท่านั้น ไม่อบแสง)
    import random
    R = random.Random(77)
    V, F = [], []
    TV, TF = [], []
    for i in range(46):
        a = R.random() * 6.283
        r = 24 + R.random() * 30
        cx, cy = 7.4 + math.cos(a) * r, 7.2 + math.sin(a) * r
        h = 5 + R.random() * 6
        cr = 1.8 + R.random() * 1.5
        for j in range(3):
            ox, oy, oz = R.uniform(-0.6, 0.6) * cr, R.uniform(-0.6, 0.6) * cr, R.uniform(-0.3, 0.3) * cr
            k = len(V)
            seg, rings = 10, 6
            for rr in range(rings + 1):
                th = math.pi * rr / rings
                for s in range(seg):
                    ph = 2 * math.pi * s / seg
                    V.append(_bl((cx + ox + cr * math.sin(th) * math.cos(ph), cy + oy + cr * math.sin(th) * math.sin(ph),
                                  h * 0.7 + oz + cr * 0.85 * math.cos(th))))
            for rr in range(rings):
                for s in range(seg):
                    q0 = k + rr * seg + s
                    q1 = k + rr * seg + (s + 1) % seg
                    F.append((q0, q0 + seg, q1 + seg, q1))
        k = len(TV)
        for z in (0, h * 0.6):
            for s in range(6):
                TV.append(_bl((cx + 0.15 * math.cos(s * 1.047), cy + 0.15 * math.sin(s * 1.047), z)))
        for s in range(6):
            TF.append((k + s, k + (s + 1) % 6, k + 6 + (s + 1) % 6, k + 6 + s))
    gv = [(7.4 + 420 * math.cos(i * math.pi / 32), -(7.2 + 420 * math.sin(i * math.pi / 32)), -0.03) for i in range(64)]
    gd = _mesh_obj("PV_ground_far", gv, [tuple(range(64))], bpy.data.materials["PV_Grass"], coll)
    gd["pv_render_only"] = True
    crowns = _mesh_obj("PV_ring_crowns", V, F, bpy.data.materials["PV_Leaves"], coll)
    for p in crowns.data.polygons:
        p.use_smooth = True
    _mesh_obj("PV_ring_trunks", TV, TF, bpy.data.materials["PV_Bark"], coll)
    add_instances(crowns, leaf_big, sum(p.area for p in crowns.data.polygons) * 14, 1.0, 0.5, 0.6, seed=5, viewport=5)
    for nm in ("PV_ring_crowns", "PV_ring_trunks"):
        bpy.data.objects[nm]["pv_render_only"] = True


# ---------------------------------------------------------------------------
# แสง: ท้องฟ้า แดด ไฟในบ้าน ไฟผนัง light portal
# ---------------------------------------------------------------------------
def _quat_to(vec_bl, track="-Z", up="Y"):
    return Vector(vec_bl).normalized().to_track_quat(track, up)


def build_world():
    sc = bpy.context.scene
    world = sc.world or bpy.data.worlds.new("PV_World")
    sc.world = world
    _set(world, "use_nodes", True)
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.name = "PV_BG"
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.name = "PV_SKY"
    for st in ("MULTIPLE_SCATTERING", "NISHITA", "SINGLE_SCATTERING", "HOSEK_WILKIE"):
        if _set(sky, "sky_type", st):
            break
    _set(sky, "sun_disc", False)
    _set(sky, "air_density", 1.0)
    _set(sky, "aerosol_density", 1.4)
    _set(sky, "dust_density", 1.4)
    _set(sky, "ozone_density", 1.0)
    _set(sky, "altitude", 20.0)
    _set(sky, "ground_albedo", 0.25)
    # ใต้เส้นขอบฟ้า: Sky Texture เป็นสีดำ -> ผสมเป็นสีพื้นดินจางๆ
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mr.inputs[0])
    _setin(mr, "From Min", -0.06)
    _setin(mr, "From Max", 0.0)
    _setin(mr, "To Min", 1.0)
    _setin(mr, "To Max", 0.0)
    _set(mr, "clamp", True)
    try:
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        ins = {s.identifier: s for s in mx.inputs}
        outs = {s.identifier: s for s in mx.outputs}
        nt.links.new(mr.outputs[0], ins["Factor_Float"])
        nt.links.new(sky.outputs[0], ins["A_Color"])
        ins["B_Color"].default_value = (0.10, 0.12, 0.085, 1.0)
        res = outs["Result_Color"]
    except Exception:
        mx = nt.nodes.new("ShaderNodeMixRGB")
        nt.links.new(mr.outputs[0], mx.inputs[0])
        nt.links.new(sky.outputs[0], mx.inputs[1])
        mx.inputs[2].default_value = (0.10, 0.12, 0.085, 1.0)
        res = mx.outputs[0]
    nt.links.new(res, bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


def build_lights():
    coll = bl_coll("PV แสง")
    sun = bpy.data.lights.new("PV_Sun", "SUN")
    sun.angle = math.radians(1.2)
    so = bpy.data.objects.new("PV_Sun", sun)
    coll.objects.link(so)
    # ไฟดาวน์ไลท์/โคม (เปิดตอนกลางคืน)
    for i, (lyr, (x, y, z), w, kind) in enumerate(LIGHTS):
        lt = bpy.data.lights.new("PV_Lamp_%d" % i, "SPOT" if kind == "down" else "POINT")
        lt.shadow_soft_size = 0.04 if kind == "down" else 0.08
        if kind == "down":
            lt.spot_size = math.radians(115)
            lt.spot_blend = 0.65
        lt.color = (1.0, 0.80, 0.58)
        lt["pv_watts"] = {"down": 14.0, "pendant": 22.0, "lamp": 10.0}.get(kind, 12.0)
        ob = bpy.data.objects.new("PV_Lamp_%d" % i, lt)
        ob.location = _bl((x, y, z + (0.04 if kind == "down" else 0.0)))
        coll.objects.link(ob)
        ob["pv_night"] = True
    # ไฟผนังส่องขึ้น-ลง
    for i, (x, y, z, nx, ny) in enumerate(WASHES):
        for j, up in enumerate((1, -1)):
            lt = bpy.data.lights.new("PV_Wash_%d_%d" % (i, j), "SPOT")
            lt.spot_size = math.radians(36)
            lt.spot_blend = 0.7
            lt.shadow_soft_size = 0.015
            lt.color = (1.0, 0.78, 0.52)
            lt["pv_watts"] = 9.0
            ob = bpy.data.objects.new(lt.name, lt)
            ob.location = _bl((x + nx * 0.07, y + ny * 0.07, z + up * 0.075))
            ob.rotation_euler = (math.pi if up > 0 else 0.0, 0, 0)
            coll.objects.link(ob)
            ob["pv_night"] = True
    # light portal ที่หน้าต่าง/ประตูภายนอก ช่วยให้ภาพภายในเนียนเร็วขึ้นใน Cycles
    for i, P in enumerate(PORTALS):
        lt = bpy.data.lights.new("PV_Portal_%d" % i, "AREA")
        lt.shape = "RECTANGLE"
        lt.size = max(0.1, P["w"] - 0.06)
        lt.size_y = max(0.1, P["h"] - 0.06)
        ok = _set(lt.cycles, "is_portal", True) if hasattr(lt, "cycles") else False
        if not ok:
            bpy.data.lights.remove(lt)
            continue
        ob = bpy.data.objects.new(lt.name, lt)
        cx, cy, cz = P["c"]
        ix, iy = P["in"]
        ob.location = _bl((cx - ix * P["off"], cy - iy * P["off"], cz))
        ob.rotation_euler = _quat_to(_bl((ix, iy, 0.0)), "-Z", "Y").to_euler()
        coll.objects.link(ob)


def sun_vector(h):
    """ทิศดวงอาทิตย์ (พิกัด Blender, ชี้ไปหาดวงอาทิตย์) — สูตรเดียวกับหน้าเว็บ"""
    t = (h - 6.2) / 12.2
    el = math.sin(math.pi * max(-0.08, min(1.08, t))) * math.radians(72)
    az = math.pi * max(-0.1, min(1.1, t))
    v3 = (math.cos(az), math.sin(el), 0.45 * math.sin(az) + 0.15)     # หน้าเว็บ: x, ขึ้น, ใต้
    v = Vector((v3[0], -v3[2], v3[1])).normalized()                   # Blender: x, เหนือ, ขึ้น
    if h > 18.6 or h < 6.1:
        v.z = min(v.z, -0.06)
    return v


def set_time(h):
    sc = bpy.context.scene
    v = sun_vector(h)
    night = v.z < 0.02
    el = math.asin(max(-1.0, min(1.0, v.z)))
    rz = math.atan2(v.x, -v.y)
    so = bpy.data.objects.get("PV_Sun")
    if so:
        so.rotation_euler = Euler((math.pi / 2 - el, 0.0, rz))
        day = max(0.0, min(1.0, v.z * 5))
        so.data.energy = 0.0 if night else 4.2 * day
        warm = max(0.0, min(1.0, 1 - v.z * 2.2))
        so.data.color = (1.0, 0.95 - 0.22 * warm, 0.88 - 0.38 * warm)
    w = sc.world
    if w and w.node_tree:
        sky = w.node_tree.nodes.get("PV_SKY")
        bg = w.node_tree.nodes.get("PV_BG")
        if sky:
            _set(sky, "sun_elevation", max(el, -0.05))
            _set(sky, "sun_rotation", rz)
        if bg:
            bg.inputs["Strength"].default_value = 0.012 if night else 0.32
    for ob in bpy.data.objects:
        if ob.get("pv_night") and ob.type == "LIGHT":
            ob.data.energy = ob.data.get("pv_watts", 10.0) if night else 0.0
    for m in bpy.data.materials:
        if "pv_emit" in m and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    _setin(n, "Emission Strength", m["pv_emit"] * (1.6 if night else 0.25))
    sc["pv_hour"] = h
    return night


# ---------------------------------------------------------------------------
# กล้อง: ภาพนิ่งแบบสถาปัตย์ (two-point perspective) + ช็อตเคลื่อนไหว
# ---------------------------------------------------------------------------
SHOTS = {
    # ชื่อ: (ตำแหน่ง(แปลน), เป้า(แปลน), เลนส์ mm, เวลา, exposure, two-point, f-stop/None)
    "EXT_Front_Hero":   ((2.0, 23.5, 1.70), (7.8, 4.5, 3.6), 24, 16.75, 0.0, True, None),
    "EXT_Aerial":       ((24.0, 27.0, 16.0), (7.4, 6.0, 1.5), 30, 10.0, 0.0, False, None),
    "EXT_Garden":       ((15.0, 16.4, 1.60), (11.5, 3.5, 2.4), 20, 17.2, 0.0, True, None),
    "EXT_Terrace":      ((14.75, -0.75, 1.65), (8.5, -1.0, 1.5), 18, 9.5, 0.2, True, None),
    "INT_Living":       ((10.45, 3.2, 1.85), (7.6, 5.6, 1.6), 16, 15.0, 1.4, True, None),
    "INT_Dining":       ((10.5, 3.0, 1.85), (6.4, 0.6, 1.7), 16, 15.0, 1.4, True, None),
    "INT_Kitchen_Thai": ((2.15, -0.70, 1.95), (0.6, -1.9, 1.5), 16, 11.0, 1.3, True, None),
    "INT_Laundry_Cat":  ((2.6, -0.80, 1.85), (7.8, -1.4, 1.5), 18, 15.0, 1.3, True, None),
    "INT_Master":       ((10.5, 2.0, 5.15), (7.6, 4.9, 4.8), 16, 15.0, 1.3, True, None),
    "DETAIL_Cat":       ((5.35, -1.60, 0.95), (6.81, -1.06, 0.86), 55, 15.0, 1.4, False, 2.2),
    "NIGHT_Front":      ((2.0, 23.5, 1.70), (7.8, 4.5, 3.6), 24, 19.6, 1.2, True, None),
}


def arch_camera(name, loc, tgt, lens, two_point, fstop, coll):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.sensor_width = 36
    cam.clip_start = 0.05
    cam.clip_end = 600
    ob = bpy.data.objects.new(name, cam)
    L, Tg = Vector(_bl(loc)), Vector(_bl(tgt))
    ob.location = L
    d = Tg - L
    if two_point:
        yaw = math.atan2(-d.x, d.y)
        ob.rotation_euler = Euler((math.pi / 2, 0.0, yaw))
        dist = math.hypot(d.x, d.y) or 1.0
        cam.shift_y = max(-0.6, min(0.6, lens * (d.z / dist) / 36.0))
    else:
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if fstop:
        cam.dof.use_dof = True
        cam.dof.focus_distance = d.length
        cam.dof.aperture_fstop = fstop
        cam.dof.aperture_blades = 7
    coll.objects.link(ob)
    return ob


def build_cameras():
    coll = bl_coll("PV กล้องภาพนิ่ง")
    for name, (loc, tgt, lens, hour, expo, tp, fs) in SHOTS.items():
        ob = arch_camera(name, loc, tgt, lens, tp, fs, coll)
        ob["pv_hour"] = hour
        ob["pv_exposure"] = expo
    build_animation()


def _anim_cam(name, coll, keys_loc, keys_tgt, lens):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.clip_start = 0.05
    ob = bpy.data.objects.new(name, cam)
    tg = bpy.data.objects.new(name + "_target", None)
    coll.objects.link(ob)
    coll.objects.link(tg)
    for f, p in keys_loc:
        ob.location = _bl(p)
        ob.keyframe_insert("location", frame=f)
    for f, p in keys_tgt:
        tg.location = _bl(p)
        tg.keyframe_insert("location", frame=f)
    con = ob.constraints.new("TRACK_TO")
    con.target = tg
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    return ob


def build_animation():
    """วิดีโอ 24 วินาที 4 ช็อต ตัดต่อด้วย marker (Render > Render Animation ได้ทั้งคลิป)"""
    sc = bpy.context.scene
    coll = bl_coll("PV กล้องวิดีโอ")
    shots = []
    pts = []
    for i in range(7):                                  # A: บินรอบบ้าน
        a = math.radians(-35 + i * 10)
        pts.append((1 + i * 30, (7.4 + 25 * math.sin(a), 6.0 + 25 * math.cos(a), 14 - i * 0.5)))
    shots.append(("A_Aerial", 1, _anim_cam("ANIM_A_Aerial", coll, pts, [(1, (7.4, 6.0, 1.5)), (180, (7.6, 5.0, 2.0))], 30)))
    shots.append(("B_Front", 181, _anim_cam("ANIM_B_Front", coll, [(181, (6.4, 22.0, 1.7)), (360, (8.5, 12.4, 1.7))],
                                             [(181, (8.0, 6.0, 2.6)), (360, (8.5, 6.2, 1.9))], 24)))
    shots.append(("C_Living", 361, _anim_cam("ANIM_C_Living", coll, [(361, (10.4, 2.3, 1.75)), (540, (9.4, 4.7, 1.70))],
                                              [(361, (7.8, 5.6, 1.4)), (540, (7.6, 1.6, 1.5))], 18)))
    shots.append(("D_Cat", 541, _anim_cam("ANIM_D_Cat", coll, [(541, (4.6, -0.55, 1.45)), (720, (6.0, -1.0, 1.10))],
                                           [(541, (7.4, -1.8, 1.3)), (720, (6.85, -1.06, 0.9))], 24)))
    for nm, f, ob in shots:
        m = sc.timeline_markers.new(nm, frame=f)
    VIDEO_CUTS[:] = [(nm, ob.name) for nm, f, ob in shots]
    sc.frame_start, sc.frame_end = 1, 720
    sc.render.fps = 30


VIDEO_CUTS = []


def video_mode(on):
    """ผูกกล้องวิดีโอกับ marker เฉพาะตอนจะเรนเดอร์วิดีโอ (ถ้าผูกค้างไว้ ภาพนิ่งทุกช็อตจะใช้กล้องวิดีโอ)"""
    sc = bpy.context.scene
    cams = dict(VIDEO_CUTS)
    for m in sc.timeline_markers:
        m.camera = bpy.data.objects.get(cams.get(m.name, "")) if on else None
    if on:
        sc.frame_set(1)
        first = bpy.data.objects.get(VIDEO_CUTS[0][1]) if VIDEO_CUTS else None
        if first:
            sc.camera = first
        set_time(16.5)
        sc.view_settings.exposure = 0.3
        log("โหมดวิดีโอ: Render > Render Animation")


def use_shot(name):
    sc = bpy.context.scene
    video_mode(False)
    ob = bpy.data.objects.get(name)
    if not ob:
        log("ไม่พบกล้อง", name)
        return
    sc.camera = ob
    set_time(float(ob.get("pv_hour", 15.0)))
    sc.view_settings.exposure = float(ob.get("pv_exposure", 0.0))
    try:
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                area.spaces[0].region_3d.view_perspective = "CAMERA"
    except Exception:
        pass
    log("ช็อต", name, "เวลา", ob.get("pv_hour"), "exposure", ob.get("pv_exposure"))


# ---------------------------------------------------------------------------
# ตั้งค่าเรนเดอร์
# ---------------------------------------------------------------------------
def render_settings(quality=None):
    sc = bpy.context.scene
    q = quality or CONFIG["QUALITY"]
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    final = q == "final"
    for k, v in (("samples", 512 if final else 96), ("use_adaptive_sampling", True),
                 ("adaptive_threshold", 0.012 if final else 0.04), ("use_denoising", True),
                 ("denoiser", "OPENIMAGEDENOISE"), ("denoising_prefilter", "ACCURATE"),
                 ("max_bounces", 10), ("diffuse_bounces", 5), ("glossy_bounces", 4),
                 ("transmission_bounces", 8), ("transparent_max_bounces", 16),
                 ("caustics_reflective", False), ("caustics_refractive", False),
                 ("sample_clamp_indirect", 6.0), ("blur_glossy", 1.0), ("use_light_tree", True),
                 ("filter_width", 1.3)):
        _set(cy, k, v)
    sc.render.resolution_x, sc.render.resolution_y = (2560, 1440) if final else (1920, 1080)
    sc.render.resolution_percentage = 100 if final else 50
    _set(sc.render, "use_persistent_data", True)
    _set(sc.render, "film_transparent", False)
    vs = sc.view_settings
    for vt in ("AgX", "Filmic"):
        if _set(vs, "view_transform", vt):
            break
    for look in ("AgX - Medium High Contrast", "Medium High Contrast", "AgX - Base Contrast", "None"):
        if _set(vs, "look", look):
            break
    # ใช้การ์ดจอ
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dt in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            try:
                prefs.compute_device_type = dt
                prefs.get_devices()
                if any(d.type == dt for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = True
                    cy.device = "GPU"
                    log("ใช้การ์ดจอ", dt)
                    break
            except Exception:
                continue
    except Exception:
        pass
    sc.unit_settings.system = "METRIC"


def render_all_shots():
    d = os.path.join(out_dir(), "renders")
    os.makedirs(d, exist_ok=True)
    sc = bpy.context.scene
    for name in SHOTS:
        use_shot(name)
        sc.render.filepath = os.path.join(d, name + ".png")
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        log("เรนเดอร์", name, "%.0f วินาที" % (time.time() - t0))
    _write_log()


# ---------------------------------------------------------------------------
# อบแสง (bake) + ส่งออกสำหรับหน้าเว็บ
# ---------------------------------------------------------------------------
def _render_only(show):
    for ob in bpy.data.objects:
        if ob.get("pv_render_only"):
            ob.hide_render = not show
        for mod in ob.modifiers:
            if mod.type == "PARTICLE_SYSTEM":
                mod.show_render = show
                mod.show_viewport = show


def _bake_one(ob, img, samples):
    sc = bpy.context.scene
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.hide_set(False)
    ob.hide_render = False
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for slot in ob.material_slots:
        nt = slot.material.node_tree
        node = nt.nodes.get("PV_BAKE") or nt.nodes.new("ShaderNodeTexImage")
        node.name = "PV_BAKE"
        node.image = img
        node.location = (600, 300)
        for n in nt.nodes:
            n.select = False
        node.select = True
        nt.nodes.active = node
    uvl = ob.data.uv_layers
    uvl.active = uvl["Lightmap"]
    _set(uvl["UVMap"], "active_render", True)
    sc.cycles.samples = samples
    _set(sc.cycles, "use_adaptive_sampling", False)
    bk = sc.render.bake
    for k, v in (("margin", 6), ("margin_type", "EXTEND"), ("use_clear", True), ("target", "IMAGE_TEXTURES"),
                 ("use_selected_to_active", False), ("use_pass_direct", True), ("use_pass_indirect", True),
                 ("use_pass_diffuse", True), ("use_pass_glossy", False), ("use_pass_transmission", False),
                 ("use_pass_emit", True)):
        _set(bk, k, v)
    try:
        bpy.ops.object.bake(type="COMBINED", pass_filter={"EMIT", "DIRECT", "INDIRECT", "DIFFUSE"},
                            margin=6, margin_type="EXTEND", use_clear=True, target="IMAGE_TEXTURES",
                            uv_layer="Lightmap")
    except TypeError:
        bpy.ops.object.bake(type="COMBINED", pass_filter={"EMIT", "DIRECT", "INDIRECT", "DIFFUSE"}, margin=6)


def bake_all():
    """อบแสงทุกกลุ่ม -> ไฟล์ภาพ EXR (ค่าแสงจริง) + PNG (ผ่านสีแบบเรนเดอร์) และ GLB สำหรับเว็บ"""
    sc = bpy.context.scene
    d = os.path.join(out_dir(), "bake")
    os.makedirs(d, exist_ok=True)
    render_settings("final")
    _set(sc.cycles, "use_denoising", False)
    _render_only(False)
    variants = [("day", 15.5, 0.0)] + ([("night", 19.8, 1.0)] if CONFIG["BAKE_NIGHT"] else [])
    groups = [ob for ob in bpy.data.objects if ob.get("pv_group") and ob["pv_group"] != "glass"
              and "Lightmap" in ob.data.uv_layers]
    t_all = time.time()
    for vname, hour, expo in variants:
        set_time(hour)
        sc.view_settings.exposure = expo
        for ob in groups:
            g = ob["pv_group"]
            size = int(ob.get("pv_size", 2048))
            img = bpy.data.images.get("PV_bake_%s_%s" % (g, vname))
            if img:
                bpy.data.images.remove(img)
            img = bpy.data.images.new("PV_bake_%s_%s" % (g, vname), size, size, alpha=False, float_buffer=True)
            t0 = time.time()
            try:
                _bake_one(ob, img, CONFIG["BAKE_SAMPLES"])
            except Exception as e:
                log("อบแสงไม่สำเร็จ", g, vname, e)
                continue
            exr = os.path.join(d, "%s_%s.exr" % (g, vname))
            png = os.path.join(d, "%s_%s.png" % (g, vname))
            if CONFIG.get("SAVE_EXR", True):
                try:                                       # ค่าแสงจริง (half float, ZIP) ไว้ปรับโทนภายหลัง
                    ims = sc.render.image_settings
                    ims.file_format = "OPEN_EXR"
                    _set(ims, "color_depth", "16")
                    _set(ims, "exr_codec", "ZIP")
                    _set(ims, "color_mode", "RGB")
                    img.save_render(exr, scene=sc)
                except Exception as e:
                    log("บันทึก EXR ไม่ได้", e)
            try:
                sc.render.image_settings.file_format = "PNG"
                _set(sc.render.image_settings, "color_mode", "RGB")
                _set(sc.render.image_settings, "color_depth", "8")
                _set(sc.render.image_settings, "color_management", "FOLLOW_SCENE")
                img.save_render(png, scene=sc)
            except Exception as e:
                log("บันทึก PNG ไม่ได้", e)
            log("อบแสง %-8s %-5s %dpx  %.0f วินาที" % (g, vname, size, time.time() - t0))
    manifest = {"version": 1, "groups": {ob["pv_group"]: {"size": int(ob.get("pv_size", 2048)),
                                                          "ppm": float(ob.get("pv_ppm", 0))} for ob in groups},
                "variants": [v[0] for v in variants], "samples": CONFIG["BAKE_SAMPLES"],
                "blender": str(bpy.app.version_string)}
    with open(os.path.join(d, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    try:
        export_glb(d, groups)
    except Exception as e:
        log("ส่งออก GLB ไม่สำเร็จ", e)
    _render_only(True)
    set_time(15.5)
    render_settings()
    log("อบแสงเสร็จทั้งหมด %.1f นาที -> %s" % ((time.time() - t_all) / 60, d))
    _write_log()


def export_glb(d, groups):
    """GLB หนึ่งไฟล์: ทุกกลุ่มใช้ภาพอบแสงกลางวันเป็นสี (UV = Lightmap) + กระจกเป็นวัสดุจริง"""
    sc = bpy.context.scene
    tmp = []
    for ob in groups:
        g = ob["pv_group"]
        png = os.path.join(d, "%s_day.png" % g)
        if not os.path.exists(png):
            continue
        me = ob.data.copy()
        me.name = "PVX_" + g
        if "UVMap" in me.uv_layers:
            me.uv_layers.remove(me.uv_layers["UVMap"])
        me.materials.clear()
        mat = bpy.data.materials.new("PVX_baked_" + g)
        _set(mat, "use_nodes", True)
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            nt.nodes.clear()
            outm = nt.nodes.new("ShaderNodeOutputMaterial")
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
            nt.links.new(bsdf.outputs[0], outm.inputs["Surface"])
        im = nt.nodes.new("ShaderNodeTexImage")
        im.image = bpy.data.images.load(png, check_existing=True)
        nt.links.new(im.outputs["Color"], bsdf.inputs["Base Color"])
        _setin(bsdf, "Roughness", 1.0)
        _setin(bsdf, ["Specular IOR Level", "Specular"], 0.0)
        me.materials.append(mat)
        me.polygons.foreach_set("material_index", [0] * len(me.polygons))
        o2 = bpy.data.objects.new("PVX_" + g, me)
        sc.collection.objects.link(o2)
        tmp.append(o2)
    glass = bpy.data.objects.get("PV_glass")
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in tmp + ([glass] if glass else []):
        o.hide_set(False)
        o.select_set(True)
    path = os.path.join(d, "pave_house_baked.glb")
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_image_format="JPEG",
              export_jpeg_quality=90, export_cameras=False, export_lights=False, export_animations=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True)
    for o in tmp:
        m = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(m)
    log("ส่งออก GLB", path)


def _write_log():
    try:
        with open(os.path.join(out_dir(), "pave_log.txt"), "a") as f:
            f.write("\n".join(LOG) + "\n")
        LOG.clear()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# แผงควบคุมในแถบข้าง 3D Viewport (กด N > แท็บ Pave)
# ---------------------------------------------------------------------------
def register_ui():
    class PAVE_OT_shot(bpy.types.Operator):
        bl_idname = "pave.shot"
        bl_label = "ไปที่ช็อต"
        bl_options = {"REGISTER", "UNDO"}
        name: bpy.props.StringProperty()

        def execute(self, context):
            use_shot(self.name)
            return {"FINISHED"}

    class PAVE_OT_bake(bpy.types.Operator):
        bl_idname = "pave.bake"
        bl_label = "อบแสง + ส่งออก GLB"

        def execute(self, context):
            bake_all()
            self.report({"INFO"}, "อบแสงเสร็จ ดูไฟล์ใน " + os.path.join(out_dir(), "bake"))
            return {"FINISHED"}

    class PAVE_OT_render_all(bpy.types.Operator):
        bl_idname = "pave.render_all"
        bl_label = "เรนเดอร์ภาพนิ่งทุกช็อต"

        def execute(self, context):
            render_all_shots()
            return {"FINISHED"}

    class PAVE_OT_video(bpy.types.Operator):
        bl_idname = "pave.video"
        bl_label = "ตั้งกล้องวิดีโอ 4 ช็อต"

        def execute(self, context):
            video_mode(True)
            return {"FINISHED"}

    class PAVE_OT_quality(bpy.types.Operator):
        bl_idname = "pave.quality"
        bl_label = "คุณภาพ"
        q: bpy.props.StringProperty()

        def execute(self, context):
            CONFIG["QUALITY"] = self.q
            render_settings(self.q)
            return {"FINISHED"}

    class PAVE_PT_panel(bpy.types.Panel):
        bl_label = "Pave 95/118"
        bl_idname = "PAVE_PT_panel"
        bl_space_type = "VIEW_3D"
        bl_region_type = "UI"
        bl_category = "Pave"

        def draw(self, context):
            lay = self.layout
            col = lay.column(align=True)
            col.label(text="ภาพนิ่ง (กด F12 เพื่อเรนเดอร์)")
            for nm in SHOTS:
                col.operator("pave.shot", text=nm).name = nm
            lay.separator()
            lay.prop(context.scene, "pave_hour", text="เวลา (ชม.)")
            row = lay.row(align=True)
            row.operator("pave.quality", text="ร่างเร็ว").q = "preview"
            row.operator("pave.quality", text="งานจริง").q = "final"
            lay.separator()
            lay.operator("pave.render_all", icon="RENDER_STILL")
            lay.operator("pave.bake", icon="TEXTURE")
            lay.operator("pave.video", icon="SEQUENCE")
            lay.label(text="แล้วกด Render > Render Animation")

    def _hour_update(self, context):
        set_time(self.pave_hour)

    for cls in (PAVE_OT_shot, PAVE_OT_bake, PAVE_OT_render_all, PAVE_OT_video, PAVE_OT_quality, PAVE_PT_panel):
        old = getattr(bpy.types, cls.__name__, None)
        if old is not None:
            try:
                bpy.utils.unregister_class(old)
            except Exception:
                pass
        bpy.utils.register_class(cls)
    bpy.types.Scene.pave_hour = bpy.props.FloatProperty(name="เวลา", min=6.0, max=21.0, default=16.75,
                                                       update=_hour_update)


# ---------------------------------------------------------------------------
def blender_main():
    t0 = time.time()
    build_geometry()
    layout = bake_layout(CONFIG["BAKE_SCALE"])
    bl_purge()
    mats = {n: make_material(n, spec) for n, spec in MATERIALS.items()}
    groups = {}
    for key in PARTS:
        groups.setdefault(group_of(key), []).append(key)
    objs = {}
    for g, keys in groups.items():
        ob = build_group_object(g, keys, mats, layout.get(g))
        if g in layout:
            ob["pv_size"] = layout[g]["size"]
            ob["pv_ppm"] = layout[g]["ppm"]
        objs[g] = ob
    build_world()
    build_lights()
    if CONFIG["FOLIAGE"]:
        try:
            build_foliage(objs)
        except Exception as e:
            log("สร้างใบไม้/หญ้าไม่สำเร็จ (ข้ามไป)", e)
    build_cameras()
    render_settings()
    try:
        register_ui()
    except Exception as e:
        log("สร้างแผงควบคุมไม่สำเร็จ", e)
    use_shot(CONFIG["START_SHOT"])
    log("สร้างฉากเสร็จ %d กลุ่ม %d ชิ้น %.1f วินาที" % (len(objs), len(PARTS), time.time() - t0))
    _write_log()
    if CONFIG["AUTO_RUN"] == "bake":
        bake_all()
    elif CONFIG["AUTO_RUN"] == "render_all":
        render_all_shots()


if __name__ == "__main__" and bpy is not None:
    blender_main()

if __name__ == "__main__" and bpy is None:
    import sys
    n = export_json(sys.argv[1] if len(sys.argv) > 1 else "pave_house.json")
    print("exported", n, "bytes,", len(PARTS), "parts,", len(LIGHTS), "lights")
