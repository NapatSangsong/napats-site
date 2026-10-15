(async function () {
  const UI = HouseUI;
  if (!window.THREE || !THREE.OrbitControls) { UI.fail('The 3D library did not load. Refresh the page to try again.'); return; }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const isSmall = () => window.innerWidth < 600;
  const tick = (f, msg) => new Promise(r => { UI.progress(f, msg); requestAnimationFrame(() => setTimeout(r, 0)); });

  // ------------------------------------------------------------------ data
  let META, GEO, PLAN, LM;
  try {
    UI.progress(0.04, 'Loading the house');
    const get = async (u, kind) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return kind === 'bin' ? r.arrayBuffer() : r.json(); };
    [META, GEO, PLAN, LM] = await Promise.all([get('geo.json?v=__V__'), get('geo.bin?v=__V__', 'bin'), get('/home/house.json?v=__V__'), get('lm.json?v=__V__')]);
  } catch (e) { UI.fail('The house did not load. Refresh the page to try again.'); console.error(e); return; }

  // ------------------------------------------------------------------ surface detail (same procedural textures as the live model)
  await tick(0.3, 'Preparing materials');
/*__GENS__*/

  // ------------------------------------------------------------------ renderer
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let dirty = true;
  const invalidate = () => { dirty = true; };
  for (const t of Object.values(T)) t.map.anisotropy = Math.min(8, maxAniso);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.08, 900);
  const SKY = {
    day: { top: new THREE.Color('#8fa9bf'), mid: new THREE.Color('#c9d4da'), hor: new THREE.Color('#e3e1da'), fog: new THREE.Color('#d6d9d4') },
    night: { top: new THREE.Color('#05070c'), mid: new THREE.Color('#0b1018'), hor: new THREE.Color('#1a1e24'), fog: new THREE.Color('#0d1015') },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: SKY.day.top.clone() }, mid: { value: SKY.day.mid.clone() }, hor: { value: SKY.day.hor.clone() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vD;
      void main(){ float y = max(vD.y, 0.0);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y)); c = mix(c, top, smoothstep(0.15, 0.75, y));
        if (vD.y < 0.0) c = hor;
        gl_FragColor = linearToOutputTexel(vec4(c, 1.0)); }`,
  });
  const skyBox = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
  scene.add(skyBox);
  scene.fog = new THREE.Fog(SKY.day.fog.clone(), 120, 620);

  // reflections for glass come from this sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  function buildEnv() {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat.clone()));
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: night ? 0x050607 : 0x6f7466 }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = -1.6; es.add(gnd);
    const rt = pmrem.fromScene(es, 0.02);
    if (scene.environment) scene.environment.dispose?.();
    scene.environment = rt.texture;
  }

  // ------------------------------------------------------------------ lightmaps
  await tick(0.42, 'Loading the rendered light');
  const loader = new THREE.TextureLoader();
  const variants = LM.variants.length ? LM.variants : ['day'];
  const LMTEX = {};
  const blank = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255]), 1, 1);
  blank.needsUpdate = true;
  function loadLm(g, v) {
    return new Promise(res => {
      if (!(LM.groups[g] || []).includes(v)) return res(blank);
      loader.load(`lm/${g}_${v}.webp?v=__V__`, t => {
        t.flipY = true; t.anisotropy = Math.min(8, maxAniso);
        t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        res(t);
      }, undefined, () => res(blank));
    });
  }
  const groupsUsed = [...new Set(META.buckets.map(b => b.g))].filter(g => g !== 'glass');
  let done = 0;
  await Promise.all(groupsUsed.map(async g => {
    LMTEX[g] = { day: await loadLm(g, 'day') };
    UI.progress(0.42 + 0.4 * (++done / groupsUsed.length));
  }));
  const hasNight = variants.includes('night');

  // ------------------------------------------------------------------ materials
  await tick(0.84, 'Assembling the house');
  const BAKED_VS = `
    attribute vec2 lmuv; varying vec2 vLm; varying vec3 vPos; varying vec3 vN;
    #include <fog_pars_vertex>
    void main(){ vLm = lmuv; vPos = position; vN = normal;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const BAKED_FS = `
    uniform sampler2D lm; uniform sampler2D lm2; uniform float mixN;
    uniform sampler2D detail; uniform float detailOn; uniform float rep; uniform float roofMode; uniform float detailMean;
    uniform float gain; uniform float sat; uniform vec3 wb;
    varying vec2 vLm; varying vec3 vPos; varying vec3 vN;
    #include <fog_pars_fragment>
    vec2 uvFor(vec3 p, vec3 n){
      vec3 a = abs(n);
      if (roofMode > 0.5 && a.y > 0.3 && a.y < 0.98) { float k = 1.0 / a.y; return a.x > a.z ? vec2(p.z, p.x * k) / rep : vec2(p.x, p.z * k) / rep; }
      if (a.y >= a.x && a.y >= a.z) return vec2(p.x, p.z) / rep;
      if (a.x >= a.z) return vec2(p.z, p.y) / rep;
      return vec2(p.x, p.y) / rep;
    }
    void main(){
      vec3 c = texture2D(lm, vLm).rgb;
      if (mixN > 0.0) c = mix(c, texture2D(lm2, vLm).rgb, mixN);
      vec3 lin = pow(c, vec3(2.2));
      if (detailOn > 0.5) {
        float d = texture2D(detail, uvFor(vPos, normalize(vN))).r / detailMean;
        lin *= mix(1.0, clamp(d, 0.35, 1.8), 0.9);
      }
      float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
      lin = mix(vec3(l), lin, sat) * wb;
      lin *= gain;
      vec3 over = max(lin - 0.8, 0.0);
      lin = min(lin, vec3(0.8)) + 0.2 * (1.0 - exp(-over / 0.2));
      gl_FragColor = linearToOutputTexel(vec4(lin, 1.0));
      #include <fog_fragment>
    }`;
  const SAT = { Grass: 0.74, Leaves: 0.82, Leaves_Light: 0.82, Agave: 0.85 };
  const bakedMats = [];
  // a group whose bake has not arrived yet falls back to simple shading so the page still reads well
  const fallbackLights = new THREE.Group();
  fallbackLights.add(new THREE.HemisphereLight(0xdfe7ee, 0x6b6a5c, 0.9));
  const fbSun = new THREE.DirectionalLight(0xfff1de, 0.9); fbSun.position.set(-20, 30, 25); fallbackLights.add(fbSun);
  scene.add(fallbackLights);
  function bakedMaterial(b) {
    const d = META.mats[b.m] || {};
    if (!(LM.groups[b.g] || []).includes('day')) {
      const c = new THREE.Color(...(d.c || [0.6, 0.6, 0.6]));
      return new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, emissive: d.emit ? c : 0x000000 });
    }
    const t = d.tex && T[d.tex];
    const L = LMTEX[b.g] || { day: blank };
    const m = new THREE.ShaderMaterial({
      // textures are attached after merge(): merge() clones uniform values, and a cloned texture is never uploaded
      uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        mixN: { value: 0 }, detailOn: { value: t ? 1 : 0 }, detailMean: { value: t ? t.mean : 1 },
        rep: { value: d.rep || 1 }, roofMode: { value: d.uv === 'roof' ? 1 : 0 },
        gain: { value: 1 }, sat: { value: SAT[b.m] ?? (b.in ? 0.95 : 0.86) },
        wb: { value: b.in ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(1.045, 1.0, 0.9) },
      }]), { lm: { value: L.day }, lm2: { value: L.night || L.day }, detail: { value: t ? t.map : blank } }),
      vertexShader: BAKED_VS, fragmentShader: BAKED_FS, fog: true, side: THREE.DoubleSide,
    });
    m.userData = { interior: !!b.in, group: b.g };
    bakedMats.push(m);
    return m;
  }
  function glassMaterial(b) {
    const d = META.mats[b.m] || { c: [0.6, 0.65, 0.68] };
    const c = new THREE.Color(d.c[0], d.c[1], d.c[2]);
    if (d.sheer) return new THREE.MeshBasicMaterial({ color: new THREE.Color(0.86, 0.84, 0.8), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    return new THREE.MeshStandardMaterial({ color: c.multiplyScalar(0.25), roughness: 0.04, metalness: 0.0, transparent: true,
      opacity: b.m === 'Glass_Rail' ? 0.2 : 0.14, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.25 });
  }

  // ------------------------------------------------------------------ meshes
  const meshes = [];
  for (const b of META.buckets) {
    const n = b.n, o = b.o;
    const pos = new Float32Array(GEO, o, n * 3);
    const nrm = new Int8Array(GEO, o + n * 12, n * 4);
    const lmuv = new Uint16Array(GEO, o + n * 16, n * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(nrm, 4), 3, 0, true));
    geo.setAttribute('lmuv', new THREE.BufferAttribute(lmuv, 2, true));
    geo.computeBoundingSphere();
    const glassy = b.g === 'glass';
    const mesh = new THREE.Mesh(geo, glassy ? glassMaterial(b) : bakedMaterial(b));
    const [roof, upper, ext, furn, walk, collide] = b.f;
    mesh.userData = { roof: !!roof, upper: !!upper, ext: !!ext, furn: !!furn, walk: !!walk, collide: !!collide && !glassy, mat: b.m };
    if (glassy) mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh); meshes.push(mesh);
  }
  const by = f => meshes.filter(f);
  const G_ROOF = by(m => m.userData.roof), G_UPPER = by(m => m.userData.upper);
  const G_EXT = by(m => m.userData.ext), G_FURN = by(m => m.userData.furn);
  const GROUND = by(m => m.userData.walk), COLLIDE = by(m => m.userData.collide);
  const CANOPY = by(m => m.userData.roof || m.userData.mat === 'Ceiling' || m.userData.mat === 'Soffit');
  let GROUND_V = GROUND, COLLIDE_V = COLLIDE;

  // ground to the horizon + a quiet ring of village trees (not part of the bake)
  const lawnC = LM.lawn_day ? new THREE.Color().setRGB(...LM.lawn_day.map(v => Math.pow(v, 2.2))) : new THREE.Color(0.2, 0.4, 0.12);
  { const l = lawnC.getHSL({}); lawnC.setHSL(l.h, l.s * 0.74, l.l * 0.97); }
  const far = new THREE.Mesh(new THREE.CircleGeometry(700, 64), new THREE.MeshBasicMaterial({ color: lawnC, fog: true }));
  far.rotation.x = -Math.PI / 2; far.position.set(7.4, -0.03, 7.2); scene.add(far);
  const ringMats = [new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), new THREE.MeshBasicMaterial({ color: 0x2d2620, fog: true })];
  const rnd = (s => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; })(77);
  {
    const crown = new THREE.IcosahedronGeometry(1, 2);
    const cols = [], P = crown.attributes.position;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); const k = 0.55 + 0.45 * (y * 0.5 + 0.5); cols.push(0.07 * k, 0.12 * k, 0.05 * k); }
    crown.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const N = 70, im = new THREE.InstancedMesh(crown, ringMats[0], N * 2);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), ringMats[1], N);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = 30 + rnd() * 50;
      const x = 7.4 + Math.cos(a) * r, z = 7.2 + Math.sin(a) * r, h = 5 + rnd() * 6, cr = 2 + rnd() * 1.6;
      for (let j = 0; j < 2; j++) {
        p.set(x + (rnd() - 0.5) * cr, h * 0.72 + (rnd() - 0.3) * cr * 0.6, z + (rnd() - 0.5) * cr);
        s.set(cr * (0.8 + rnd() * 0.3), cr * 0.75, cr * (0.8 + rnd() * 0.3));
        M.compose(p, q, s); im.setMatrixAt(i * 2 + j, M);
      }
      p.set(x, h * 0.32, z); s.set(1, h * 0.64, 1); M.compose(p, q, s); trunk.setMatrixAt(i, M);
    }
    scene.add(im, trunk);
  }

  // ------------------------------------------------------------------ light state: afternoon / evening, eye adaptation
  let night = false, mixN = 0, mixTarget = 0;
  const adapt = { inside: 0, target: 0 };
  function applyGains() {
    const k = adapt.inside;
    const gIn = 0.62 + 0.38 * k, gOut = 1.0 + 0.8 * k;      // looking out from a room the garden reads bright
    for (const m of bakedMats) {
      m.uniforms.gain.value = m.userData.interior ? gIn : gOut;
      m.uniforms.mixN.value = mixN;
    }
  }
  function setLight(n) {
    night = n; mixTarget = n ? 1 : 0;
    if (n && !hasNight) return;
    const S = n ? SKY.night : SKY.day;
    skyMat.uniforms.top.value.copy(S.top); skyMat.uniforms.mid.value.copy(S.mid); skyMat.uniforms.hor.value.copy(S.hor);
    scene.fog.color.copy(S.fog);
    far.material.color.copy(n ? new THREE.Color(0.004, 0.006, 0.004) : lawnC);
    ringMats[0].color.setScalar(n ? 0.08 : 1); ringMats[1].color.set(n ? 0x050504 : 0x2d2620);
    UI.setSky(n);
    document.getElementById('l-day').setAttribute('aria-pressed', String(!n));
    document.getElementById('l-night').setAttribute('aria-pressed', String(n));
    buildEnv(); invalidate();
  }
  const lDay = document.getElementById('l-day'), lNight = document.getElementById('l-night');
  if (!hasNight) {
    lNight.disabled = true; lNight.title = 'The evening render is still baking';
    lNight.style.opacity = 0.45;
  }
  lDay.addEventListener('click', () => setLight(false));
  lNight.addEventListener('click', async () => {
    if (!hasNight) return;
    for (const g of groupsUsed) if (!LMTEX[g].night) {
      LMTEX[g].night = await loadLm(g, 'night');
      for (const m of bakedMats) if (m.userData.group === g) m.uniforms.lm2.value = LMTEX[g].night;
    }
    setLight(true);
  });

  // ------------------------------------------------------------------ controls (same as the live model)
  const orbit = new THREE.OrbitControls(camera, canvas);
  orbit.enableDamping = true; orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.49; orbit.minDistance = 1.0; orbit.maxDistance = 90;
  const walk = { x: 0, z: 0, yaw: 0, pitch: 0, floor: 0 };
  let mode = 'orbit';
  const keys = {};
  const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
  function floorAt(x, z, from) {
    ray.set(new THREE.Vector3(x, from, z), DOWN); ray.far = from + 2;
    const hit = ray.intersectObjects(GROUND_V, false)[0];
    return hit ? hit.point.y : null;
  }
  const dirTmp = new THREE.Vector3(), oTmp = new THREE.Vector3();
  function blocked(x, z, dx, dz) {
    const len = Math.hypot(dx, dz); if (!len) return false;
    dirTmp.set(dx / len, 0, dz / len);
    for (const h of [0.4, 1.2]) {
      oTmp.set(x, walk.floor + h, z); ray.set(oTmp, dirTmp); ray.far = len + 0.25;
      if (ray.intersectObjects(COLLIDE_V, false).length) return true;
    }
    return false;
  }
  function placeWalk(x, z, tx, tz, from) {
    walk.x = x; walk.z = z; walk.yaw = Math.atan2(-(tx - x), -(tz - z)); walk.pitch = -0.04;
    const f = floorAt(x, z, from); walk.floor = f === null ? 0.15 : f;
    camera.position.set(x, walk.floor + 1.6, z);
  }
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (mode !== 'walk') return; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (mode !== 'walk' || !drag) return;
    walk.yaw -= (e.clientX - drag.x) * 0.0042;
    walk.pitch = Math.max(-1.25, Math.min(1.25, walk.pitch - (e.clientY - drag.y) * 0.0042));
    drag = { x: e.clientX, y: e.clientY }; invalidate();
  });
  for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { drag = null; });
  canvas.addEventListener('wheel', e => {
    if (mode !== 'walk') return;
    e.preventDefault(); camera.fov = Math.max(35, Math.min(80, camera.fov + e.deltaY * 0.02)); camera.updateProjectionMatrix(); invalidate();
  }, { passive: false });
  const KEYMAP = { KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's', KeyA: 'a', ArrowLeft: 'a', KeyD: 'd', ArrowRight: 'd' };
  window.addEventListener('keydown', e => {
    if (mode !== 'walk' || e.target.tagName === 'INPUT') return;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.key === 'Shift') keys.run = true;
  });
  window.addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; if (e.key === 'Shift') keys.run = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  document.querySelectorAll('#pad button').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { keys[k] = true; b.setPointerCapture(e.pointerId); e.preventDefault(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { keys[k] = false; });
  });
  function stepWalk(dt) {
    const f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0), s = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    if (f || s) {
      const sp = (keys.run ? 3.4 : 1.6) * dt, sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw);
      let dx = (-sy * f + cy * s) * sp, dz = (-cy * f - sy * s) * sp;
      if (blocked(walk.x, walk.z, dx, dz)) {
        if (!blocked(walk.x, walk.z, dx, 0)) dz = 0; else if (!blocked(walk.x, walk.z, 0, dz)) dx = 0; else dx = dz = 0;
      }
      if (dx || dz) {
        const nf = floorAt(walk.x + dx, walk.z + dz, walk.floor + 0.5);
        if (nf !== null && nf - walk.floor < 0.45 && walk.floor - nf < 0.6) { walk.x += dx; walk.z += dz; walk.floor = nf; }
      }
    }
    const ty = walk.floor + 1.6;
    const settling = Math.abs(ty - camera.position.y) > 0.002;
    camera.position.set(walk.x, camera.position.y + (ty - camera.position.y) * Math.min(1, dt * 9), walk.z);
    camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
    if (f || s || settling) invalidate();
  }

  // ------------------------------------------------------------------ places, modes, layers
  const VIEWS = UI.VIEWS;
  const markView = UI.buildPlaces(v => goView(v));
  const tRoof = document.getElementById('t-roof'), tUpper = document.getElementById('t-upper'),
        tExt = document.getElementById('t-ext'), tFurn = document.getElementById('t-furn');
  function goView(v) {
    markView(v);
    if (v.roof === false) tRoof.checked = false;
    if (v.upper === false) tUpper.checked = false;
    if (v.mode === 'walk') { tRoof.checked = true; tUpper.checked = true; }
    applyToggles();
    setMode(v.mode, true);
    if (v.mode === 'orbit') { camera.position.set(...UI.camFor(v, camera.aspect)); orbit.target.set(...v.tgt); orbit.update(); }
    else placeWalk(v.at[0], v.at[1], v.look[0], v.look[1], v.from);
    checkInside(true);
    invalidate();
  }
  const pad = document.getElementById('pad');
  function setMode(m, quiet) {
    if (m === 'walk' && mode !== 'walk' && !quiet) {
      const t = orbit.target, inSite = t.x > -1 && t.x < 15.7 && t.z > -2.5 && (t.z < 10.8 || (t.x > 11.2 && t.z < 16.9));
      if (inSite) placeWalk(t.x, t.z, t.x + (t.x - camera.position.x), t.z + (t.z - camera.position.z), 2);
      else placeWalk(9.1, 9.6, 8.6, 5.5, 2);
    }
    if (m === 'orbit' && mode === 'walk' && !quiet) {
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      orbit.target.copy(camera.position).addScaledVector(dir, 4);
      camera.fov = isSmall() ? 62 : 55; camera.updateProjectionMatrix();
    }
    mode = m; orbit.enabled = m === 'orbit'; invalidate();
    canvas.classList.toggle('walking', m === 'walk');
    document.getElementById('m-orbit').setAttribute('aria-pressed', String(m === 'orbit'));
    document.getElementById('m-walk').setAttribute('aria-pressed', String(m === 'walk'));
    pad.hidden = !(m === 'walk' && coarse);
    UI.hint(m === 'walk'
      ? (coarse ? 'Drag to look around. Use the arrows to walk. The stairs work.'
                : 'Drag to look around. Walk with W A S D, hold Shift to hurry. The stairs work.')
      : (coarse ? 'Drag to orbit. Pinch to zoom, two fingers to pan.' : 'Drag to orbit. Right-drag to pan. Scroll to zoom.'));
  }
  document.getElementById('m-orbit').addEventListener('click', () => setMode('orbit'));
  document.getElementById('m-walk').addEventListener('click', () => setMode('walk'));
  function applyToggles() {
    for (const m of meshes) m.visible = true;
    if (!tRoof.checked) G_ROOF.forEach(m => m.visible = false);
    if (!tUpper.checked) G_UPPER.forEach(m => m.visible = false);
    if (!tFurn.checked) G_FURN.forEach(m => m.visible = false);
    if (!tExt.checked) G_EXT.forEach(m => m.visible = false);
    GROUND_V = GROUND.filter(m => m.visible); COLLIDE_V = COLLIDE.filter(m => m.visible);
    invalidate();
  }
  [tRoof, tUpper, tExt, tFurn].forEach(t => t.addEventListener('change', applyToggles));

  // inside a room? (something solid overhead) -> eyes adapt over ~0.8 s
  let lastCheck = 0;
  // inside = a ceiling overhead and an indoor floor underfoot (eaves over the terrace do not count)
  const INDOOR_FLOOR = new Set(['Floor_Tile', 'Tile_Grey', 'Laminate', 'Bath_Floor', 'Wood_Tread', 'Rug_Shag']);
  function checkInside(now) {
    const p = camera.position;
    ray.set(p, UP); ray.far = 7;
    let hit = ray.intersectObjects(CANOPY.filter(m => m.visible), false).length > 0;
    if (hit) {
      ray.set(p, DOWN); ray.far = 4;
      const f = ray.intersectObjects(GROUND_V, false)[0];
      hit = !!f && INDOOR_FLOOR.has(f.object.userData.mat);
    }
    adapt.target = hit ? 1 : 0;
    if (now === true) { adapt.inside = adapt.target; applyGains(); }
  }

  // ------------------------------------------------------------------ plan inset
  const planC = document.getElementById('plan'), pctx = planC.getContext('2d');
  const PB = { x0: -1.5, x1: 16.2, z0: -2.9, z1: 17.4 };
  const planImgs = {};
  const sc = Math.min(planC.width / (PB.x1 - PB.x0), planC.height / (PB.z1 - PB.z0));
  const ox = (planC.width - (PB.x1 - PB.x0) * sc) / 2, oy = (planC.height - (PB.z1 - PB.z0) * sc) / 2;
  const toPlan = (x, z) => [ox + (x - PB.x0) * sc, oy + (z - PB.z0) * sc];
  const fromPlan = (px, py) => [(px - ox) / sc + PB.x0, (py - oy) / sc + PB.z0];
  const srgb = c => Math.round(255 * Math.min(1, Math.pow(c, 1 / 2.2)));
  function drawPlanBase(level) {
    const off = document.createElement('canvas'); off.width = planC.width; off.height = planC.height;
    const c = off.getContext('2d');
    c.fillStyle = '#c3c6b6'; c.fillRect(0, 0, off.width, off.height);
    const ymax = level === 'u' ? 5.2 : 2.6, ymin = level === 'u' ? 3.2 : -1;
    const items = [];
    for (const p of PLAN.parts) {
      if (['Lawn', 'Trees'].includes(p.o) || p.l === 'roof' || p.l === 'ext_roof') continue;
      if (level === 'g' && (p.l === 'house_u' || p.l === 'furn_u')) continue;
      const col = PLAN.mats[p.m].c;
      for (const poly of p.p) {
        let hmax = -9, hmin = 99, area = 0;
        for (let k = 0; k < poly.length; k++) {
          const i = poly[k] * 3, j = poly[(k + 1) % poly.length] * 3;
          hmax = Math.max(hmax, p.v[i + 1]); hmin = Math.min(hmin, p.v[i + 1]);
          area += p.v[i] * p.v[j + 2] - p.v[j] * p.v[i + 2];
        }
        if (Math.abs(area) < 1e-4 || hmax > ymax || hmin < ymin) continue;
        items.push([hmax, p, poly, col]);
      }
    }
    items.sort((a, b) => a[0] - b[0]);
    for (const [, p, poly, col] of items) {
      const wash = v => Math.round(srgb(v) * 0.55 + 228 * 0.45);
      c.fillStyle = `rgb(${wash(col[0])},${wash(col[1])},${wash(col[2])})`;
      c.beginPath();
      poly.forEach((i, k) => { const [x, y] = toPlan(p.v[i * 3], p.v[i * 3 + 2]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.closePath(); c.fill();
    }
    planImgs[level] = off;
  }
  const fwd = new THREE.Vector3();
  function currentLevel() {
    const y = mode === 'walk' ? walk.floor : orbit.target.y;
    return y > (mode === 'walk' ? 2.4 : 3.4) ? 'u' : 'g';
  }
  function drawPlan() {
    pctx.drawImage(planImgs[currentLevel()], 0, 0);
    const p = mode === 'walk' ? camera.position : orbit.target;
    camera.getWorldDirection(fwd);
    const [px, py] = toPlan(p.x, p.z), a = Math.atan2(fwd.z, fwd.x);
    pctx.fillStyle = 'rgba(91,98,73,0.28)';
    pctx.beginPath(); pctx.moveTo(px, py); pctx.arc(px, py, 30, a - 0.55, a + 0.55); pctx.closePath(); pctx.fill();
    pctx.fillStyle = '#ecebe7'; pctx.strokeStyle = '#5b6249'; pctx.lineWidth = 3;
    pctx.beginPath(); pctx.arc(px, py, 6.5, 0, Math.PI * 2); pctx.fill(); pctx.stroke();
  }
  planC.addEventListener('click', e => {
    const r = planC.getBoundingClientRect();
    const [x, z] = fromPlan((e.clientX - r.left) * planC.width / r.width, (e.clientY - r.top) * planC.height / r.height);
    if (mode === 'walk') {
      const fl = floorAt(x, z, currentLevel() === 'u' ? 5.5 : 2.4); if (fl === null) return;
      walk.x = x; walk.z = z; walk.floor = fl;
    } else {
      const d = new THREE.Vector3(x, orbit.target.y, z).sub(orbit.target);
      orbit.target.add(d); camera.position.add(d);
    }
    invalidate();
  });
  const roA = document.getElementById('ro-a'), roB = document.getElementById('ro-b');
  function readout() {
    roA.textContent = currentLevel() === 'u' ? 'Upper floor' : 'Ground floor';
    roB.textContent = mode === 'walk' ? `Floor +${walk.floor.toFixed(2)} m` : '';
  }

  // ------------------------------------------------------------------ loop (draws only when something changed)
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    if (mode !== 'walk') camera.fov = w < 600 ? 62 : 55;
    camera.updateProjectionMatrix(); invalidate();
  }
  window.addEventListener('resize', resize);
  orbit.addEventListener('change', () => invalidate());
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'walk') stepWalk(dt); else orbit.update();
    if (dirty && now - lastCheck > 200) { lastCheck = now; checkInside(); }
    const da = adapt.target - adapt.inside, dm = mixTarget - mixN;
    if (Math.abs(da) > 0.002 || Math.abs(dm) > 0.002) {
      adapt.inside += da * Math.min(1, dt * 3.2);
      mixN += dm * Math.min(1, dt * 2.6);
      if (Math.abs(mixTarget - mixN) < 0.003) mixN = mixTarget;
      applyGains(); dirty = true;
    }
    if (dirty) {
      renderer.render(scene, camera);
      dirty = false;
      drawPlan(); readout();
    }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) invalidate(); });

  await tick(0.96, 'Almost there');
  drawPlanBase('g'); drawPlanBase('u');
  resize();
  setLight(false);
  applyGains();
  UI.wireChrome();
  goView(VIEWS[0]);
  UI.progress(1, 'Ready');
  window.PV = { camera, orbit, goView, VIEWS, invalidate, setMode, setLight, renderer, scene };
  requestAnimationFrame(frame);
  UI.flyIn(camera, orbit, VIEWS[0], invalidate);
})();
