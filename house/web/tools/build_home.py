"""Compose /home/index.html from the realtime viewer engine + the quiet-lux shell."""
import re, sys, os, shutil, time, subprocess, json

HOUSE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))   # <repo>/house
ROOT = os.path.join(HOUSE, 'web')
SITE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HOUSE, '..', 'public')
V = time.strftime('%Y%m%d%H%M')

tpl = open(os.path.join(HOUSE, 'viewer', 'house_template.html')).read()
js = tpl.split('<script>\nconst DATA = __DATA__;', 1)[1].rsplit('</script>', 1)[0]
js = 'let DATA;' + js


def rep(a, b, n=1):
    global js
    c = js.count(a)
    assert c == n, (a[:70], c)
    js = js.replace(a, b)


rep("""  const stepEl = document.getElementById('load-step');
  const tick = (msg) => new Promise(r => { stepEl.textContent = msg; requestAnimationFrame(() => setTimeout(r, 0)); });
  if (!window.THREE || !THREE.OrbitControls || !THREE.Sky) {
    document.getElementById('loading').innerHTML = '<p class="err">โหลดไลบรารี 3 มิติไม่สำเร็จ ลองรีเฟรชหน้านี้อีกครั้ง</p>';
    return;
  }""", """  const UI = HouseUI;
  let tickN = 0;
  const tick = (msg) => new Promise(r => { UI.progress(0.3 + 0.16 * (++tickN), msg); requestAnimationFrame(() => setTimeout(r, 0)); });
  if (!window.THREE || !THREE.OrbitControls || !THREE.Sky) { UI.fail('The 3D library did not load. Refresh the page to try again.'); return; }
  try {
    UI.progress(0.06, 'Loading the house');
    const res = await fetch('house.json?v=__V__');
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) { UI.fail('The house data did not load. Refresh the page to try again.'); return; }""")
for th, en in (('เตรียมพื้นผิววัสดุ', 'Preparing materials'), ('สร้างฉาก', 'Setting the scene'),
               ('ประกอบตัวบ้าน', 'Assembling the house'), ('จัดแสงและเงา', 'Lighting and shadows')):
    rep("await tick('%s');" % th, "await tick('%s');" % en)
rep("""    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    todOut.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;""",
    """    todOut.textContent = UI.fmtTime(h); UI.setSky(isNight);""")
# views come from the shared list
a = js.index('  const VIEWS = [')
b = js.index('  const tRoof = document.getElementById')
js = js[:a] + """  const VIEWS = UI.VIEWS;
  const markView = UI.buildPlaces(v => goView(v));
""" + js[b:]
rep("    VIEWS.forEach(o => o.btn.classList.toggle('on', o === v));", "    markView(v);")
rep("    if (v.mode === 'orbit') { camera.position.set(...v.cam); orbit.target.set(...v.tgt); orbit.update(); }",
    "    if (v.mode === 'orbit') { camera.position.set(...UI.camFor(v, camera.aspect)); orbit.target.set(...v.tgt); orbit.update(); }")
rep("    if (isSmall()) document.getElementById('sheet').open = false;\n    invalidate();", "    invalidate();")
a = js.index("    help.innerHTML = m === 'walk'")
b = js.index("\n", js.index("      : (coarse ?", a)) + 1
js = js[:a] + """    UI.hint(m === 'walk'
      ? (coarse ? 'Drag to look around. Use the arrows to walk. The stairs work.'
                : 'Drag to look around. Walk with W A S D, hold Shift to hurry. The stairs work.')
      : (coarse ? 'Drag to orbit. Pinch to zoom, two fingers to pan.' : 'Drag to orbit. Right-drag to pan. Scroll to zoom.'));
""" + js[b:]
rep("""    roA.textContent = currentLevel() === 'u' ? 'ชั้นบน' : 'ชั้นล่าง';
    roB.textContent = mode === 'walk' ? `พื้น +${walk.floor.toFixed(2)} ม.` : `กริด ${(p.x).toFixed(1)}, ${(p.z).toFixed(1)}`;""",
    """    roA.textContent = currentLevel() === 'u' ? 'Upper floor' : 'Ground floor';
    roB.textContent = mode === 'walk' ? `Floor +${walk.floor.toFixed(2)} m` : '';""")
# quieter plan: materials washed toward limestone, olive marker
rep("    c.fillStyle = '#6d8a55'; c.fillRect(0, 0, off.width, off.height);",
    "    c.fillStyle = '#c3c6b6'; c.fillRect(0, 0, off.width, off.height);")
rep("      c.fillStyle = `rgb(${srgb(col[0])},${srgb(col[1])},${srgb(col[2])})`;",
    "      const wash = v => Math.round(srgb(v) * 0.55 + 228 * 0.45);\n      c.fillStyle = `rgb(${wash(col[0])},${wash(col[1])},${wash(col[2])})`;")
rep("    pctx.fillStyle = 'rgba(255,255,255,0.35)';", "    pctx.fillStyle = 'rgba(91,98,73,0.28)';")
rep("    pctx.fillStyle = '#ffffff'; pctx.strokeStyle = '#1b2124'; pctx.lineWidth = 2;",
    "    pctx.fillStyle = '#ecebe7'; pctx.strokeStyle = '#5b6249'; pctx.lineWidth = 3;")
rep("""  if (isSmall()) document.getElementById('sheet').open = false;
  goView(VIEWS[0]);
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);""", """  UI.wireChrome();
  goView(VIEWS[0]);
  UI.progress(1, 'Ready');
  window.PV = { camera, orbit, setTime: (h) => setTime(h, true), goView, VIEWS, invalidate, setMode };
  requestAnimationFrame(frame);
  UI.flyIn(camera, orbit, VIEWS[0], invalidate);""")
assert not re.search('[ก-๙]', re.sub(r'//[^\n]*', '', js)), 'thai left'

shell = open(os.path.join(ROOT, 'src/home_shell.html')).read()
page = shell.replace('__SCRIPT__', js.strip()).replace('__V__', V)
os.makedirs(os.path.join(SITE, 'home'), exist_ok=True)
open(os.path.join(SITE, 'home/index.html'), 'w').write(page)
subprocess.run(['python3', os.path.join(HOUSE, 'pave_house.py'), os.path.join(SITE, 'home/house.json')], check=True,
               stdout=subprocess.DEVNULL)
# minify json (it is fetched)
d = json.load(open(os.path.join(SITE, 'home/house.json')))
json.dump(d, open(os.path.join(SITE, 'home/house.json'), 'w'), separators=(',', ':'))
kit = os.path.join(SITE, 'house-kit')
os.makedirs(os.path.join(kit, 'three'), exist_ok=True)
for f in ('house.css', 'ui.js'):
    shutil.copy(os.path.join(ROOT, 'house-kit', f), os.path.join(kit, f))
# three.js r128 files are vendored in public/house-kit/three (committed)
print('built /home', len(page), 'bytes; json', os.path.getsize(os.path.join(SITE, 'home/house.json')))
