// Home-range 3D city map. Reads window.CITY (data.js) and ./texture.jpg.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const C = window.CITY, D = C.dem;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const BASE = 60;                         // block thickness below the lowest ground, metres (scene units)

// ---------- decode terrain
const raw = Uint8Array.from(atob(D.b64), (c) => c.charCodeAt(0));
const q = new Uint16Array(raw.buffer);
const mbits = Uint8Array.from(atob(D.mask), (c) => c.charCodeAt(0));
const inMask = (i, j) => { const k = j * D.W + i; return (mbits[k >> 3] >> (7 - (k & 7))) & 1; };
const Wm = D.W * D.gm, Hm = D.H * D.gm;
const hAt = (i, j) => BASE + q[Math.min(D.H - 1, Math.max(0, j)) * D.W + Math.min(D.W - 1, Math.max(0, i))] * D.step * D.ex;
function heightXY(x, y) {               // local metres (x east, y north) -> scene height
  const fi = (x + Wm / 2) / D.gm - 0.5, fj = (Hm / 2 - y) / D.gm - 0.5;
  const i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j;
  return hAt(i, j) * (1 - a) * (1 - b) + hAt(i + 1, j) * a * (1 - b) + hAt(i, j + 1) * (1 - a) * b + hAt(i + 1, j + 1) * a * b;
}
const P = (x, y, up = 0) => new THREE.Vector3(x, heightXY(x, y) + up, -y);

// ---------- scene
const host = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
host.appendChild(renderer.domElement);
const L = new CSS2DRenderer();
L.setSize(innerWidth, innerHeight);
Object.assign(L.domElement.style, { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' });
host.appendChild(L.domElement);
const scene = new THREE.Scene();
const span = Math.max(Wm, Hm);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 10, span * 10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = 1.25; controls.minDistance = span * 0.12; controls.maxDistance = span * 2.6;
controls.target.set(0, BASE, 0);
const fit = Math.max(1, 1.25 / camera.aspect);
camera.position.set(0, span * 0.95 * fit, span * 1.05 * fit);
scene.add(new THREE.HemisphereLight(0xfff8e8, 0x8a7a60, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-span, span * 1.4, -span * 0.6); scene.add(sun);

// terrain top
const pos = [], uv = [], idx = [];
for (let j = 0; j < D.H; j++) for (let i = 0; i < D.W; i++) {
  const x = -Wm / 2 + (i + 0.5) * D.gm, y = Hm / 2 - (j + 0.5) * D.gm;
  pos.push(x, hAt(i, j), -y); uv.push((i + 0.5) / D.W, 1 - (j + 0.5) / D.H);
}
for (let j = 0; j < D.H - 1; j++) for (let i = 0; i < D.W - 1; i++) {
  if (!(inMask(i, j) && inMask(i + 1, j) && inMask(i, j + 1) && inMask(i + 1, j + 1))) continue;
  const a = j * D.W + i, b = a + 1, c = a + D.W, d = c + 1;
  idx.push(a, c, b, b, c, d);
}
const tg = new THREE.BufferGeometry();
tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
tg.setIndex(idx); tg.computeVertexNormals();
const tex = new THREE.TextureLoader().load('texture.jpg', () => document.documentElement.classList.add('ready'));
tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const ac = document.createElement('canvas'); ac.width = 2048; ac.height = Math.round(2048 * Hm / Wm);
const ax = ac.getContext('2d'); ax.fillStyle = '#000'; ax.fillRect(0, 0, ac.width, ac.height); ax.fillStyle = '#fff'; ax.beginPath();
C.outline.forEach(([x, y], k) => ax[k ? 'lineTo' : 'moveTo']((x + Wm / 2) / Wm * ac.width, (Hm / 2 - y) / Hm * ac.height)); ax.fill();
const alpha = new THREE.CanvasTexture(ac); alpha.flipY = true;
scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ map: tex, alphaMap: alpha, alphaTest: 0.5 })));

// soil walls along the home-range outline
const sc = document.createElement('canvas'); sc.width = 8; sc.height = 256;
const sx = sc.getContext('2d');
const grd = sx.createLinearGradient(0, 0, 0, 256);
[['#9a8262', 0], ['#7f6749', .25], ['#93795a', .45], ['#6e5840', .7], ['#584634', 1]].forEach(([c, s]) => grd.addColorStop(s, c));
sx.fillStyle = grd; sx.fillRect(0, 0, 8, 256);
const soil = new THREE.CanvasTexture(sc); soil.colorSpace = THREE.SRGBColorSpace;
const wp = [], wuv = [];
const ring = C.outline;
for (let k = 0; k < ring.length - 1; k++) {
  const [x1, y1] = ring[k], [x2, y2] = ring[k + 1];
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / D.gm));
  for (let s = 0; s < steps; s++) {
    const ax = x1 + (x2 - x1) * s / steps, ay = y1 + (y2 - y1) * s / steps;
    const bx = x1 + (x2 - x1) * (s + 1) / steps, by = y1 + (y2 - y1) * (s + 1) / steps;
    const ha = heightXY(ax, ay), hb = heightXY(bx, by);
    wp.push(ax, 0, -ay, bx, 0, -by, ax, ha, -ay, bx, 0, -by, bx, hb, -by, ax, ha, -ay);
    wuv.push(0, 1, 1, 1, 0, 1 - ha / (BASE * 3), 1, 1, 1, 1 - hb / (BASE * 3), 0, 1 - ha / (BASE * 3));
  }
}
const wg = new THREE.BufferGeometry();
wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
wg.computeVertexNormals();
scene.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ map: soil, side: THREE.DoubleSide })));
const shp = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
const bottom = new THREE.Mesh(new THREE.ShapeGeometry(shp), new THREE.MeshBasicMaterial({ color: 0x4a3c2c, side: THREE.DoubleSide }));
bottom.rotation.x = -Math.PI / 2; scene.add(bottom);
// soft ground shadow
const sh = new THREE.Mesh(new THREE.CircleGeometry(span * 0.5, 64), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.045 }));
sh.rotation.x = -Math.PI / 2; sh.position.y = -2; sh.scale.set(1, 0.9, 1); scene.add(sh);

// ---------- labels
function label(cls, html, x, y, up) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.innerHTML = html;
  const o = new CSS2DObject(el); o.position.copy(P(x, y, up)); scene.add(o); return el;
}
C.areas.forEach((a) => label('area', esc(a.n), a.xy[0], a.xy[1], 120));
C.roads.forEach((r) => label('road', esc(r.n), r.xy[0], r.xy[1], 25));
C.water.forEach((w) => label('water', esc(w.n), w.xy[0], w.xy[1], 25));

const pins = C.places.map((p) => {
  const cat = C.categories[p.cat];
  const el = document.createElement('div');
  el.className = 'pin ' + (p.tier === 'Regular stop' ? 'big show' : p.tier === 'Once or twice' ? 'small' : '');
  el.innerHTML = `<span class="dot" style="background:${cat.color}"></span><span class="nm">${esc(p.n)}</span>`;
  el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', p.n);
  el.addEventListener('click', (e) => { e.stopPropagation(); select(p); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(p); });
  const o = new CSS2DObject(el); o.position.copy(P(p.xy[0], p.xy[1], 14)); scene.add(o);
  return { p, el, o };
});

// ---------- header + about
document.title = `${C.title} · Home-range maps · Pensador Solutions`;
$('header h1').textContent = C.title;
$('header .sub').textContent = `${C.subtitle} · the places we frequented, ${C.years}`;
$('#about .body').innerHTML = `
  <p>This block is our <b>home range</b> in ${esc(C.subtitle.split(',')[0])}: the area that holds 95% of our Foursquare Swarm check-ins from ${esc(C.years)},
  found with the same kernel density method wildlife biologists use for collared animals (fixed Gaussian kernel, ${esc(C.method.h)} m bandwidth).
  The pins are the public places inside it, sized by how often we went.${C.worn ? ' The faint rust lines are our Strava runs and walks, drawn together so the routes we repeated wear in darker; both ends of every track are trimmed.' : ''} Exact dates, visit counts and anywhere private are left out.</p>
  <p><b>Sources:</b> ${C.sources.map(esc).join('; ')}.</p>
  <p><b>Projection:</b> ${esc(C.utm)}, local metres. <b>Heights</b> raised ${D.ex}× so gentle hills read. The scale bar is true at the centre of the view.</p>
  <p><b>Map:</b> Pensador Solutions, ${esc(C.built)}. Built with three.js.</p>`;

// ---------- legend
const cats = Object.entries(C.categories).filter(([k]) => C.places.some((p) => p.cat === k));
$('#legend .body').innerHTML =
  cats.map(([k, c]) => `<div class="row"><span class="dot" style="background:${c.color}"></span>${esc(c.label)}</div>`).join('') +
  `<div class="sep"></div>
   <div class="row"><span class="dot" style="background:#777;width:15px;height:15px"></span>Regular stop (5+ visits)</div>
   <div class="row"><span class="dot" style="background:#777"></span>Now and then (2–4)</div>
   <div class="row"><span class="dot" style="background:#777;width:9px;height:9px"></span>Once or twice</div>
   <div class="sep"></div>
   <div class="row"><span class="sw" style="background:#b8c49a"></span>Parks and green space</div>
   <div class="row"><span class="sw" style="background:#9db8c8"></span>Rivers and ponds</div>
   <div class="row"><span class="sw" style="background:#cfc2a6"></span>Buildings</div>
   <div class="row"><span class="sw" style="background:repeating-linear-gradient(90deg,#5d5548 0 6px,#f4efe2 6px 12px)"></span>Railway</div>
   ${C.worn ? '<div class="row"><span class="sw" style="background:linear-gradient(90deg,transparent 0 3px,#a4573a 3px 7px,transparent 7px 9px,#7a2e0e 9px 13px,transparent 13px)"></span>Our running and walking routes</div>' : ''}
   <div class="row"><span class="sw" style="background:#a08560"></span>Edge of our home range</div>
   <div class="sep"></div><button id="aboutBtn">About this map</button>`;
if (innerWidth <= 700) $('#legend').classList.add('min');
$('#legend h2').addEventListener('click', () => $('#legend').classList.toggle('min'));
$('#aboutBtn').addEventListener('click', () => $('#about').classList.add('open'));
$('#about .x').addEventListener('click', () => $('#about').classList.remove('open'));

// ---------- card
const order = C.places.slice().sort((a, b) => a.cat.localeCompare(b.cat) || a.n.localeCompare(b.n));
let cur = null;
function select(p) {
  cur = p;
  pins.forEach((x) => x.el.classList.toggle('sel', x.p === p));
  const cat = C.categories[p.cat], k = order.indexOf(p);
  const gm = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.n + ' ' + p.ll[0] + ',' + p.ll[1])}`;
  $('#card').innerHTML = `
    <div class="nav"><span><button data-d="-1" aria-label="Previous place">‹</button> ${k + 1} of ${order.length} <button data-d="1" aria-label="Next place">›</button></span>
      <button class="close" aria-label="Close">Back to the map ×</button></div>
    <h2>${esc(cat.label)}</h2>
    <h3>${esc(p.n)}</h3>
    <div class="meta">${esc(p.area ? p.area + ' ward' : '')}${p.addr ? ' · ' + esc(p.addr.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())) : ''}</div>
    ${p.d ? `<p>${esc(p.d)}</p>` : ''}
    <div class="tags"><span class="tag">${esc(p.tier)}</span></div>
    <a class="go" href="${gm}" target="_blank" rel="noopener">Open in Google Maps <span>↗</span></a>
    <div class="listing">${p.listed ? 'Still listed in Overture Maps places (November 2026).' : 'Not in current Overture Maps listings. It may have closed or changed its name.'}</div>`;
  $('#card').classList.add('open'); document.body.classList.add('carding');
  $('#card .close').onclick = () => { $('#card').classList.remove('open'); document.body.classList.remove('carding'); pins.forEach((x) => x.el.classList.remove('sel')); history.replaceState(null, '', location.pathname); };
  $('#card').querySelectorAll('[data-d]').forEach((b) => b.onclick = () => select(order[(k + +b.dataset.d + order.length) % order.length]));
  history.replaceState(null, '', '#place=' + p.id);
  const t = P(p.xy[0], p.xy[1]);
  flyTo(t);
}
let fly = null;
function flyTo(t) { fly = { from: controls.target.clone(), to: t, k: 0 }; }

// ---------- compass + scale bar (scale is true at the centre of the view)
const comp = $('#compass');
comp.innerHTML = `<svg viewBox="-50 -50 100 100" aria-label="North arrow"><g id="rose">
  <circle r="30" fill="none" stroke="#2f2a22" stroke-width="1"/><circle r="26" fill="none" stroke="#2f2a22" stroke-width=".5"/>
  <path d="M0 -40 L7 0 L0 6 L-7 0Z" fill="#2f2a22"/><path d="M0 40 L7 0 L0 -6 L-7 0Z" fill="#f3eee0" stroke="#2f2a22"/>
  <text y="-42" text-anchor="middle" font-size="15" font-family="FellSC,serif" fill="#2f2a22">N</text></g></svg>`;
const rose = comp.querySelector('#rose');
const nice = [50, 100, 200, 250, 500, 1000, 2000];
function updateHud() {
  rose.setAttribute('transform', `rotate(${THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())})`);
  const d = camera.position.distanceTo(controls.target);
  const mpp = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight;  // metres per px at centre
  const m = nice.filter((n) => n / mpp <= 140).pop() || 50;
  $('#scale').innerHTML = `${m >= 1000 ? m / 1000 + ' km' : m + ' m'}<div class="bar" style="width:${(m / mpp).toFixed(0)}px"></div><small>at centre of view · heights ×${D.ex}</small>`;
}

// ---------- decluttering: names for regular stops, all names when zoomed in
function declutter() {
  const close = camera.position.distanceTo(controls.target) < span * 0.45;
  pins.forEach(({ p, el }) => el.classList.toggle('show', close || p.tier === 'Regular stop'));
  const taken = [...document.querySelectorAll('.lbl.area')].map((e) => e.getBoundingClientRect());
  const rank = { 'Regular stop': 0, 'Now and then': 1, 'Once or twice': 2 };
  pins.slice().sort((a, b) => (b.p === cur) - (a.p === cur) || rank[a.p.tier] - rank[b.p.tier]).forEach(({ p, el }) => {
    if (!el.classList.contains('show') && p !== cur) return;
    const nm = el.querySelector('.nm'); nm.style.visibility = 'hidden'; nm.style.display = 'block';
    const r = nm.getBoundingClientRect(); nm.style.display = ''; nm.style.visibility = '';
    const hit = taken.some((t) => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top);
    if (hit && p !== cur) el.classList.remove('show'); else taken.push(r);
  });
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); L.setSize(innerWidth, innerHeight);
});
let n = 0;
(function tick() {
  if (fly) {
    fly.k = Math.min(1, fly.k + 0.04); const e = 1 - Math.pow(1 - fly.k, 3);
    const nt = fly.from.clone().lerp(fly.to, e); camera.position.add(nt.clone().sub(controls.target)); controls.target.copy(nt);
    if (fly.k >= 1) fly = null;
  }
  controls.update(); renderer.render(scene, camera); L.render(scene, camera);
  if (n++ % 6 === 0) { updateHud(); declutter(); }
  requestAnimationFrame(tick);
})();
const m = location.hash.match(/^#place=(\d+)/);
if (m && C.places[+m[1]]) select(C.places[+m[1]]);
setTimeout(() => document.documentElement.classList.add('ready'), 8000);
window.__map = { scene, camera, controls, select };
