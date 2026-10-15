/* Salaya House — shared UI behaviour for /home and /home3d */
(function () {
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = () => window.innerWidth <= 760;

  // camera stops (x = plan east, y = up, z = plan south)
  const VIEWS = [
    { g: 'Outside', name: 'Front', lv: '', mode: 'orbit', cam: [7.0, 9.5, 27], tgt: [7, 2.6, 6.0] },
    { g: 'Outside', name: 'Garden corner', lv: '', mode: 'orbit', cam: [4.0, 7.0, 24.0], tgt: [12.5, 1.8, 9.5] },
    { g: 'Outside', name: 'Rear and extension', lv: '', mode: 'orbit', cam: [19, 11, -12], tgt: [7, 2, 0.5] },
    { g: 'Outside', name: 'Ground floor from above', lv: '', mode: 'orbit', cam: [7.4, 31, 7.6], tgt: [7.4, 0, 7.0], roof: false, upper: false },
    { g: 'Ground floor', name: 'Carport', lv: '+0.20', mode: 'walk', at: [2.6, 10.2], look: [4.9, 3.6], from: 2 },
    { g: 'Ground floor', name: 'Front porch', lv: '+0.50', mode: 'walk', at: [9.1, 9.6], look: [8.6, 5.5], from: 2 },
    { g: 'Ground floor', name: 'Living room', lv: '+0.60', mode: 'walk', at: [9.6, 2.6], look: [8.4, 5.6], from: 2 },
    { g: 'Ground floor', name: 'Dining', lv: '+0.60', mode: 'walk', at: [10.4, 3.3], look: [6.6, 0.6], from: 2 },
    { g: 'Ground floor', name: 'Thai kitchen', lv: '+0.60', mode: 'walk', at: [2.05, -0.8], look: [0.4, -1.9], from: 2 },
    { g: 'Ground floor', name: 'Laundry', lv: '+0.60', mode: 'walk', at: [4.9, -0.75], look: [2.9, -1.9], from: 2 },
    { g: 'Ground floor', name: 'Cat room', lv: '+0.60', mode: 'walk', at: [5.0, -1.1], look: [7.2, -1.2], from: 2 },
    { g: 'Ground floor', name: 'Terrace', lv: '+0.50', mode: 'walk', at: [14.6, 3.0], look: [9.5, -1.2], from: 2 },
    { g: 'Ground floor', name: 'Garden', lv: '+0.50', mode: 'walk', at: [13.3, 16.2], look: [13.8, 6.5], from: 2 },
    { g: 'Ground floor', name: 'Multipurpose room', lv: '+0.60', mode: 'walk', at: [11.3, 3.9], look: [13.5, 6.4], from: 2 },
    { g: 'Ground floor', name: 'Stairs', lv: '+0.60', mode: 'walk', at: [5.95, 3.4], look: [5.95, 5.5], from: 2 },
    { g: 'Upper floor', name: 'Main bedroom', lv: '+3.70', mode: 'walk', at: [10.4, 2.2], look: [7.7, 4.9], from: 5.5 },
    { g: 'Upper floor', name: 'Bedroom 2', lv: '+3.70', mode: 'walk', at: [5.0, 4.0], look: [3.3, 6.6], from: 5.5 },
    { g: 'Upper floor', name: 'Upper hall', lv: '+3.70', mode: 'walk', at: [6.1, 2.4], look: [6.0, 5.0], from: 5.5 },
  ];

  // pull orbit views back on tall, narrow screens so the whole house stays in frame
  function camFor(v, aspect) {
    if (!v.cam || aspect >= 1.1) return v.cam;
    const k = Math.min(2.0, Math.pow(1.1 / aspect, 0.75));
    return v.cam.map((c, i) => v.tgt[i] + (c - v.tgt[i]) * k);
  }
  function fmtTime(h) {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
  }
  function setSky(night) { document.documentElement.dataset.sky = night ? 'night' : 'day'; }
  function progress(frac, msg) {
    if (msg) $('load-step').textContent = msg;
    $('load-bar').style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  }
  function fail(msg) {
    $('loading').querySelector('.inner').innerHTML = '<h1>Salaya House</h1><p class="err">' + msg + '</p>';
  }

  function buildPlaces(onPick) {
    const el = $('places');
    let lastG = '';
    for (const v of VIEWS) {
      if (v.g !== lastG) { const h = document.createElement('h2'); h.textContent = v.g; el.appendChild(h); lastG = v.g; }
      const b = document.createElement('button');
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span>${v.name}</span><span class="lv">${v.lv ? v.lv + ' m' : ''}</span>`;
      b.addEventListener('click', () => { onPick(v); if (small()) closePlaces(); });
      v.btn = b; el.appendChild(b);
    }
    return (v) => VIEWS.forEach(o => o.btn.setAttribute('aria-pressed', String(o === v)));
  }
  const bPlaces = $('b-places');
  function closePlaces() { $('places').classList.add('closed'); bPlaces.setAttribute('aria-expanded', 'false'); }
  function wireChrome() {
    if (small()) closePlaces();
    bPlaces.addEventListener('click', () => {
      const open = $('places').classList.toggle('closed') === false;
      bPlaces.setAttribute('aria-expanded', String(open));
      if (open) closeLayers();
    });
    const bl = $('b-layers'), lp = $('layers');
    if (bl && lp) {
      bl.addEventListener('click', () => {
        const open = lp.hidden;
        lp.hidden = !open; bl.setAttribute('aria-expanded', String(open));
        if (open && small()) closePlaces();
      });
      document.addEventListener('pointerdown', (e) => { if (!lp.hidden && !lp.contains(e.target) && e.target !== bl) closeLayers(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayers(); });
    }
    window.addEventListener('resize', () => { if (!small()) $('places').classList.remove('closed'); });
  }
  function closeLayers() { const lp = $('layers'), bl = $('b-layers'); if (lp) lp.hidden = true; if (bl) bl.setAttribute('aria-expanded', 'false'); }

  let hintTimer = 0;
  function hint(html) {
    const el = $('help');
    el.innerHTML = html; el.classList.remove('gone');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.add('gone'), 6500);
  }

  // one orchestrated moment: the camera settles from a high orbit onto the front of the house
  function flyIn(camera, orbit, to, invalidate) {
    const done = () => { document.body.classList.remove('intro'); };
    $('loading').classList.add('done');
    if (reduce) { done(); return; }
    const p0 = new THREE.Vector3(to.cam[0] + 26, to.cam[1] + 26, to.cam[2] + 18), t0 = new THREE.Vector3(to.tgt[0], 0, to.tgt[2] - 2);
    const p1 = new THREE.Vector3(...camFor(to, camera.aspect)), t1 = new THREE.Vector3(...to.tgt);
    const start = performance.now(), dur = 2600;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    let stop = false;
    const cancel = () => { stop = true; };
    window.addEventListener('pointerdown', cancel, { once: true });
    (function step(now) {
      const k = stop ? 1 : ease(Math.min(1, (now - start) / dur));
      camera.position.lerpVectors(p0, p1, k); orbit.target.lerpVectors(t0, t1, k);
      // swing around the house rather than sliding in a straight line
      const a = (1 - k) * 0.9, c = Math.cos(a), s = Math.sin(a);
      const dx = camera.position.x - orbit.target.x, dz = camera.position.z - orbit.target.z;
      camera.position.x = orbit.target.x + dx * c - dz * s; camera.position.z = orbit.target.z + dx * s + dz * c;
      orbit.update(); invalidate();
      if (k < 1) requestAnimationFrame(step); else done();
      if (k > 0.55) document.body.classList.remove('intro');
    })(start);
  }

  window.HouseUI = { VIEWS, camFor, fmtTime, setSky, progress, fail, buildPlaces, wireChrome, hint, flyIn, small, reduce };
})();
