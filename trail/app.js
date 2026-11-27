/* Senda: personal trail map PWA. No build step. Data stays on the device (IndexedDB + Cache Storage). */
'use strict';
const BASE_URL = new URL('../protomaps-southern-arizona/southern-arizona.pmtiles', location.href).href;
const DEM_URL = new URL('data/dem.pmtiles', location.href).href;
const DATA_CACHE = 'senda-data-v1';
const FT = 3.28084, MI = 1609.344;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- language ---------- */
let lang = (() => { try { return localStorage.getItem('senda-lang') || (navigator.language || 'en').slice(0, 2); } catch (e) { return 'en'; } })();
if (!I18N[lang]) lang = 'en';
const T = (k, ...a) => { const v = I18N[lang][k] ?? I18N.en[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = T(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((e) => { e.innerHTML = T(e.dataset.i18nHtml); });
  $('#lang').textContent = lang === 'en' ? 'ES' : 'EN';
  netBadge();
  if (lastFix && lastPos) onFix(lastPos);
  if (currentTab !== 'map') openTab(currentTab, true);
}
$('#lang').onclick = () => { lang = lang === 'en' ? 'es' : 'en'; try { localStorage.setItem('senda-lang', lang); } catch (e) {} applyLang(); };

/* ---------- formatting ---------- */
const fmtMi = (m) => (m / MI).toFixed(m < 16 * MI ? 1 : 0);
const fmtFt = (m) => Math.round(m * FT).toLocaleString(lang);
const fmtDur = (s) => { if (s == null || !isFinite(s)) return '–'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} ${T('h')} ${m} ${T('min')}` : `${m} ${T('min')}`; };
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return String(d).slice(0, 10); } };
const fmtTime = (d) => d.toLocaleTimeString(lang === 'es' ? 'es-MX' : 'en-US', { hour: 'numeric', minute: '2-digit' });
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }

/* ---------- geometry ---------- */
function hav(a, b) { const r = Math.PI / 180, la1 = a[1] * r, la2 = b[1] * r, dl = la2 - la1, dn = (b[0] - a[0]) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dn / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); }
function lineStats(coords, times) {
  let d = 0, gain = 0, moving = 0; const prof = [[0, coords[0]?.[2]]];
  // smooth elevation (5-point mean) before summing climb
  const e = coords.map((c, i) => { let s = 0, n = 0; for (let k = Math.max(0, i - 2); k <= Math.min(coords.length - 1, i + 2); k++) if (coords[k][2] != null) { s += coords[k][2]; n++; } return n ? s / n : null; });
  for (let i = 1; i < coords.length; i++) {
    const s = hav(coords[i - 1], coords[i]); d += s;
    if (e[i] != null && e[i - 1] != null && e[i] > e[i - 1]) gain += e[i] - e[i - 1];
    if (times && times[i] && times[i - 1]) { const dt = (times[i] - times[i - 1]) / 1000; if (dt > 0 && dt < 600 && s / dt > 0.3) moving += dt; }
    prof.push([d, coords[i][2]]);
  }
  const elapsed = times && times[0] && times[times.length - 1] ? (times[times.length - 1] - times[0]) / 1000 : null;
  return { distance_m: Math.round(d), gain_m: Math.round(gain), moving_s: times ? Math.round(moving) : null, elapsed_s: elapsed };
}
function bbox(coords) { let a = [180, 90, -180, -90]; for (const c of coords) { a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; } return a; }

/* ---------- storage: IndexedDB for hikes ---------- */
const db = new Promise((res, rej) => { const r = indexedDB.open('senda', 1); r.onupgradeneeded = () => r.result.createObjectStore('hikes', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function tx(mode, fn) { const d = await db; return new Promise((res, rej) => { const t = d.transaction('hikes', mode); const s = t.objectStore('hikes'); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); }
const getAll = () => tx('readonly', (s) => s.getAll());
const putHikes = (arr) => tx('readwrite', (s) => arr.forEach((h) => s.put(h)));
const delHike = (id) => tx('readwrite', (s) => s.delete(id));
let HIKES = [];

/* ---------- PMTiles: from saved copy when present, else over the network ---------- */
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
let offlineSaved = false;
async function openPM(url, name) {
  try {
    const c = await caches.open(DATA_CACHE); const r = await c.match(url);
    if (r) { const b = await r.blob(); offlineSaved = true; return new pmtiles.PMTiles(new pmtiles.FileSource(new File([b], name))); }
  } catch (e) { /* no Cache Storage: fall back to network */ }
  return new pmtiles.PMTiles(url);
}

/* ---------- DEM: contour plugin fetches fake URLs that we answer from the DEM PMTiles ---------- */
const DEM_PREFIX = 'https://dem.senda.invalid/';
let dem = null;
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const u = typeof input === 'string' ? input : input && input.url;
  if (u && u.startsWith(DEM_PREFIX)) {
    const [z, x, y] = u.slice(DEM_PREFIX.length).split(/[/.]/).map(Number);
    return dem.getZxy(z, x, y).then((t) => (t ? new Response(t.data, { headers: { 'Content-Type': 'image/png' } }) : new Response(null, { status: 404 })));
  }
  return nativeFetch(input, init);
};
const demTiles = new Map();
async function elevAt(lon, lat) {
  if (!dem) return null;
  const z = 12, n = 2 ** z, xf = (lon + 180) / 360 * n, yf = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  const x = Math.floor(xf), y = Math.floor(yf), key = `${x}/${y}`;
  let px = demTiles.get(key);
  if (px === undefined) {
    px = null;
    try {
      const t = await dem.getZxy(z, x, y);
      if (t) { const bmp = await createImageBitmap(new Blob([t.data], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0); px = { w: bmp.width, d: g.getImageData(0, 0, bmp.width, bmp.height).data }; }
    } catch (e) { px = null; }
    demTiles.set(key, px);
  }
  if (!px) return null;
  const i = (Math.min(px.w - 1, Math.floor((yf - y) * px.w)) * px.w + Math.min(px.w - 1, Math.floor((xf - x) * px.w))) * 4;
  return px.d[i] * 256 + px.d[i + 1] + px.d[i + 2] / 256 - 32768; // terrarium
}

/* ---------- basemap style ---------- */
const L = basemaps.namedFlavor('light');
const notebook = Object.assign({}, L, {
  background: '#efe8d6', earth: '#efe8d6', water: '#a9c3cf', park_a: '#cdd6ae', park_b: '#c3cfa2', wood_a: '#c9d3ab', wood_b: '#bfcb9f',
  scrub_a: '#dcd9b8', scrub_b: '#d5d3ae', sand: '#e9dfc4', buildings: '#d5c8ab', minor_a: '#fbf7ec', minor_b: '#fbf7ec', minor_casing: '#c2b596',
  minor_service: '#f4eedf', minor_service_casing: '#cfc4a8', major: '#f5e6bb', major_casing_early: '#b5a47d', major_casing_late: '#b5a47d',
  highway: '#eecf8c', highway_casing_early: '#a58f5f', highway_casing_late: '#a58f5f', link: '#f5e6bb', link_casing: '#b5a47d', other: '#efe6d0',
  roads_label_minor_halo: '#efe8d6', roads_label_major_halo: '#efe8d6', city_label_halo: '#efe8d6', state_label_halo: '#efe8d6', subplace_label_halo: '#efe8d6',
});
const here = new URL('.', location.href).href;
const pmBase = new URL('../protomaps-southern-arizona/', location.href).href;
const EMPTY = { type: 'FeatureCollection', features: [] };

function buildStyle(baseKey, demSource) {
  const base = basemaps.layers('protomaps', notebook, { lang: lang === 'es' ? 'es' : 'en' });
  const bgIdx = base.findIndex((l) => l.id === 'background');
  const osm = { id: 'osm-fallback', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.9, 'raster-saturation': -0.35 } };
  const hill = { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#5a4a33', 'hillshade-highlight-color': '#fffaf0', 'hillshade-accent-color': '#5a4a33' } };
  const earthIdx = base.findIndex((l) => l.id === 'earth');
  const layers = [...base.slice(0, bgIdx + 1), osm, ...base.slice(bgIdx + 1)];
  // hillshade goes right above landcover/landuse, below water and roads
  const waterIdx = layers.findIndex((l) => l.id === 'water');
  layers.splice(waterIdx > 0 ? waterIdx : earthIdx + 1, 0, hill);
  const overlays = [
    { id: 'contours', type: 'line', source: 'contours', 'source-layer': 'contours', minzoom: 11, paint: { 'line-color': '#9b7653', 'line-opacity': 0.55, 'line-width': ['match', ['get', 'level'], 1, 1.1, 0.5] } },
    { id: 'contour-labels', type: 'symbol', source: 'contours', 'source-layer': 'contours', minzoom: 13, filter: ['>', ['get', 'level'], 0],
      layout: { 'symbol-placement': 'line', 'text-size': 10, 'text-field': ['concat', ['number-format', ['get', 'ele'], {}], "'"], 'text-font': ['Noto Sans Regular'] },
      paint: { 'text-color': '#7a5a3c', 'text-halo-color': '#efe8d6', 'text-halo-width': 1.5 } },
    { id: 'hikes', type: 'line', source: 'hikes', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['match', ['get', 'kind'], 'walk', '#E69F00', '#0072B2'], 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 14, 3], 'line-opacity': 0.85 } },
    { id: 'azt-casing', type: 'line', source: 'azt', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.85 } },
    { id: 'azt', type: 'line', source: 'azt', paint: { 'line-color': '#222222', 'line-width': 2.6, 'line-dasharray': [2.2, 1.2] } },
    { id: 'sel-casing', type: 'line', source: 'sel', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8 } },
    { id: 'sel', type: 'line', source: 'sel', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D55E00', 'line-width': 4.5 } },
    { id: 'rec', type: 'line', source: 'rec', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#CC79A7', 'line-width': 4 } },
    { id: 'peaks', type: 'symbol', source: 'protomaps', 'source-layer': 'pois', minzoom: 11, filter: ['==', ['get', 'kind'], 'peak'],
      layout: { 'text-field': ['concat', '▲ ', ['coalesce', ['get', 'name'], '']], 'text-size': 11.5, 'text-font': ['Noto Sans Medium'], 'text-anchor': 'top', 'text-offset': [0, -0.4], 'text-optional': true },
      paint: { 'text-color': '#4d4030', 'text-halo-color': '#efe8d6', 'text-halo-width': 1.6 } },
    { id: 'trailheads', type: 'circle', source: 'protomaps', 'source-layer': 'pois', minzoom: 11, filter: ['==', ['get', 'kind'], 'trailhead'],
      paint: { 'circle-radius': 5, 'circle-color': '#009E73', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } },
    { id: 'water-pts', type: 'circle', source: 'water', minzoom: 9, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 6], 'circle-color': '#56B4E9', 'circle-stroke-color': '#1d3f6e', 'circle-stroke-width': 1.2 } },
    { id: 'water-labels', type: 'symbol', source: 'water', minzoom: 13, filter: ['has', 'name'],
      layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Noto Sans Italic'], 'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-optional': true },
      paint: { 'text-color': '#1d3f6e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } },
    { id: 'me-acc', type: 'circle', source: 'me', filter: ['==', ['get', 't'], 'acc'], paint: { 'circle-radius': ['get', 'px'], 'circle-color': '#0072B2', 'circle-opacity': 0.12, 'circle-stroke-color': '#0072B2', 'circle-stroke-opacity': 0.4, 'circle-stroke-width': 1 } },
    { id: 'me-head', type: 'symbol', source: 'me', filter: ['==', ['get', 't'], 'head'], layout: { 'icon-image': 'senda-cone', 'icon-rotate': ['get', 'hd'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    { id: 'me', type: 'circle', source: 'me', filter: ['==', ['get', 't'], 'pt'], paint: { 'circle-radius': 8, 'circle-color': '#0072B2', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } },
  ];
  return {
    version: 8,
    glyphs: pmBase + 'fonts/{fontstack}/{range}.pbf',
    sprite: pmBase + 'sprites/light',
    sources: {
      protomaps: { type: 'vector', url: 'pmtiles://' + baseKey, attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' },
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap (outside southern Arizona)' },
      dem: { type: 'raster-dem', encoding: 'terrarium', tiles: [demSource.sharedDemProtocolUrl], maxzoom: 12, tileSize: 256, attribution: 'Terrain: USGS 3DEP, SRTM (Tilezen)' },
      terrain: { type: 'raster-dem', encoding: 'terrarium', tiles: [demSource.sharedDemProtocolUrl], maxzoom: 12, tileSize: 256 },
      contours: { type: 'vector', tiles: [demSource.contourProtocolUrl({ multiplier: FT, thresholds: { 11: [200, 1000], 12: [100, 500], 13: [40, 200], 15: [20, 200] }, elevationKey: 'ele', levelKey: 'level', contourLayer: 'contours' })], maxzoom: 16 },
      azt: { type: 'geojson', data: EMPTY },
      water: { type: 'geojson', data: here + 'data/water.geojson' },
      hikes: { type: 'geojson', data: EMPTY },
      sel: { type: 'geojson', data: EMPTY },
      rec: { type: 'geojson', data: EMPTY },
      me: { type: 'geojson', data: EMPTY },
    },
    layers: [...layers, ...overlays],
  };
}

/* ---------- map ---------- */
let map, AZT = null;
(async function init() {
  const base = await openPM(BASE_URL, 'basemap.pmtiles');
  dem = await openPM(DEM_URL, 'dem.pmtiles');
  protocol.add(base);
  const demSource = new mlcontour.DemSource({ url: DEM_PREFIX + '{z}/{x}/{y}.png', encoding: 'terrarium', maxzoom: 12, worker: false });
  demSource.setupMaplibre(maplibregl);
  const baseKey = base.source.getKey();
  map = new maplibregl.Map({
    container: 'map', style: buildStyle(baseKey, demSource), attributionControl: false, hash: true, maxPitch: 75, dragRotate: true, pitchWithRotate: true,
    bounds: [[-111.05, 31.3], [-110.3, 32.3]], fitBoundsOptions: { padding: 30 }, maxZoom: 17,
  });
  window.__map = map;
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'imperial' }), 'bottom-left');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Senda · Pensador Solutions · Arizona Trail Association' }), 'bottom-right');
  map.on('dragstart', () => { if (follow) { follow = false; $('#btn-locate').classList.remove('on'); } });
  map.on('zoom', drawMe);
  // 3D terrain: button toggles real relief (1.5x) and tilts; two-finger drag up/down tilts by hand
  let is3D = false;
  const set3D = (on) => {
    is3D = on; $('#btn-3d').classList.toggle('on', on); $('#btn-3d').setAttribute('aria-pressed', String(on));
    if (on) { map.setTerrain({ source: 'terrain', exaggeration: 1.5 }); if (map.getPitch() < 30) map.easeTo({ pitch: 60, duration: 800 }); }
    else { map.setTerrain(null); map.easeTo({ pitch: 0, bearing: 0, duration: 600 }); }
  };
  $('#btn-3d').onclick = () => { try { set3D(!is3D); } catch (e) { toast('3D: ' + e.message, 6000); } };
  map.on('pitchend', () => { if (map.getPitch() > 15 && !is3D) set3D(true); });
  map.on('rotate', () => $('#rose').setAttribute('transform', `rotate(${-map.getBearing()})`));
  $('#north').onclick = () => map.easeTo({ bearing: 0, duration: 500 });
  map.on('load', async () => {
    map.addImage('senda-cone', coneImage(), { pixelRatio: 2 });
    const azt = await (await fetch('data/azt-measured.json')).json();
    AZT = azt; map.getSource('azt').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: azt.map((c) => [c[0], c[1]]) }, properties: {} });
    fetch('data/water.geojson').then((r) => r.json()).then((j) => { WATER = j.features.map((f) => ({ c: f.geometry.coordinates, name: f.properties.name, mile: null })); snapWater(); });
    await refreshHikes();
    restoreRecording();
  });
  map.on('click', 'water-pts', (e) => {
    const f = e.features[0]; const nm = f.properties.name || (lang === 'es' ? 'Punto de agua' : 'Water source');
    new maplibregl.Popup({ offset: 8 }).setLngLat(e.lngLat).setHTML(`<b>${esc(nm)}</b><br><span class="muted">${esc(T('lgWater'))}</span>`).addTo(map);
  });
  map.on('click', 'hikes', (e) => { const id = e.features[0].properties.id; const h = HIKES.find((x) => x.id === id); if (h) { openTab('hikes'); showHike(h); } });
  ['water-pts', 'hikes'].forEach((l) => { map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer')); map.on('mouseleave', l, () => (map.getCanvas().style.cursor = '')); });
  map.once('idle', () => document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
  const COVER = [-111.25, 31.25, -110.1, 32.2];
  const osmVis = () => { const b = map.getBounds(); const inside = b.getWest() >= COVER[0] && b.getEast() <= COVER[2] && b.getSouth() >= COVER[1] && b.getNorth() <= COVER[3]; if (map.getLayer('osm-fallback')) map.setLayoutProperty('osm-fallback', 'visibility', inside || !navigator.onLine ? 'none' : 'visible'); };
  map.on('load', osmVis); map.on('moveend', osmVis);
  netBadge();
})();

function coneImage() {
  const s = 120, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); grd.addColorStop(0, 'rgba(0,114,178,.55)'); grd.addColorStop(1, 'rgba(0,114,178,0)');
  g.fillStyle = grd; g.beginPath(); g.moveTo(s / 2, s / 2); g.arc(s / 2, s / 2, s / 2, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
  return g.getImageData(0, 0, s, s);
}

/* ---------- network / offline badge ---------- */
function netBadge() {
  const b = $('#netbadge'); b.hidden = false;
  if (!navigator.onLine) { b.textContent = T('offline'); b.className = 'badge off'; }
  else { b.textContent = offlineSaved ? T('offlineReady') : T('online'); b.className = 'badge'; }
}
addEventListener('online', netBadge); addEventListener('offline', netBadge);

/* ---------- AZT mileage + water ---------- */
let WATER = [];
function nearestOnAZT(p) {
  if (!AZT) return null;
  let best = null; const k = Math.cos(p[1] * Math.PI / 180);
  for (let i = 1; i < AZT.length; i++) {
    const a = AZT[i - 1], b = AZT[i];
    const ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? -(ax * dx + ay * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy, d2 = x * x + y * y;
    if (!best || d2 < best.d2) best = { d2, mile: a[2] + t * (b[2] - a[2]), pt: [p[0] + x / k, p[1] + y] };
  }
  best.off_m = hav(p, best.pt); return best;
}
function snapWater() { if (!AZT) return setTimeout(snapWater, 300); for (const w of WATER) { const n = nearestOnAZT(w.c); if (n && n.off_m < 800) w.mile = n.mile; } }
function nextWater(mile) { let b = null; for (const w of WATER) if (w.mile != null && w.mile > mile + 0.05 && (!b || w.mile < b.mile)) b = w; return b; }

/* ---------- GPS ---------- */
let watchId = null, follow = false, lastFix = null, lastPos = null, heading = null;
function startGPS() {
  if (watchId != null) return;
  if (!('geolocation' in navigator)) return toast(T('gpsDenied'));
  toast(T('gpsWait'), 2000);
  watchId = navigator.geolocation.watchPosition(onFix, (e) => { if (e.code === 1) { toast(T('gpsDenied'), 6000); stopGPS(); } }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  // compass (iOS asks for permission inside a tap)
  const DOE = window.DeviceOrientationEvent;
  const listen = () => addEventListener('deviceorientation', (e) => { const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null); if (h != null) { heading = h; drawMe(); } }, true);
  if (DOE && typeof DOE.requestPermission === 'function') DOE.requestPermission().then((s) => s === 'granted' && listen()).catch(() => {}); else listen();
}
function stopGPS() { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; follow = false; $('#btn-locate').classList.remove('on'); }
async function onFix(pos) {
  lastPos = pos; const c = pos.coords; lastFix = { lon: c.longitude, lat: c.latitude, acc: c.accuracy, alt: c.altitude, t: pos.timestamp };
  if (follow) map.easeTo({ center: [c.longitude, c.latitude], zoom: Math.max(map.getZoom(), 14), duration: 600 });
  drawMe(); if (pos !== recFix.last) { recFix.last = pos; recFix(pos); }
  $('#hud').hidden = false;
  const e = await elevAt(c.longitude, c.latitude);
  $('#h-elev').textContent = e != null ? `${fmtFt(e)} ${T('ft')}` : c.altitude != null ? `${fmtFt(c.altitude)} ${T('ft')} (GPS)` : '–';
  $('#h-acc').textContent = T('acc', Math.round(c.accuracy * FT));
  const n = nearestOnAZT([c.longitude, c.latitude]);
  const near = n && n.off_m < 3 * MI;
  $('#h-azt-row').hidden = !near; $('#h-water-row').hidden = !near;
  if (near) {
    $('#h-azt').textContent = n.mile.toFixed(1) + (n.off_m > 150 ? ` · ${T('offTrail', n.off_m > 800 ? fmtMi(n.off_m) + ' ' + T('mi') : fmtFt(n.off_m) + ' ' + T('ft'))}` : '');
    const w = nextWater(n.mile);
    $('#h-water').textContent = w ? `${(w.mile - n.mile).toFixed(1)} ${T('mi')}${w.name ? ' · ' + w.name : ''}` : '–';
  }
}
function drawMe() {
  if (!lastFix || !map) return;
  const p = [lastFix.lon, lastFix.lat];
  const mpp = 40075016.686 * Math.cos(lastFix.lat * Math.PI / 180) / (512 * 2 ** map.getZoom());
  const feats = [{ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: { t: 'acc', px: Math.max(8, lastFix.acc / mpp) } }];
  if (heading != null) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: { t: 'head', hd: heading } });
  feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: { t: 'pt' } });
  map.getSource('me')?.setData({ type: 'FeatureCollection', features: feats });
}
$('#btn-locate').onclick = () => {
  if (watchId == null) { startGPS(); follow = true; $('#btn-locate').classList.add('on'); return; }
  if (!follow) { follow = true; $('#btn-locate').classList.add('on'); if (lastFix) map.easeTo({ center: [lastFix.lon, lastFix.lat], zoom: Math.max(map.getZoom(), 14) }); }
  else { follow = false; $('#btn-locate').classList.remove('on'); }
};

/* ---------- recording (screen on) ---------- */
let rec = null, wakeLock = null;
const REC_KEY = 'senda-rec';
async function lockScreen() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (rec && document.visibilityState === 'visible') lockScreen(); });
function saveRec() { try { localStorage.setItem(REC_KEY, JSON.stringify(rec)); } catch (e) {} }
function recFix(pos) {
  if (!rec || rec.paused) return;
  const c = pos.coords; if (c.accuracy > 40) return;
  const p = [+c.longitude.toFixed(6), +c.latitude.toFixed(6), c.altitude != null ? +c.altitude.toFixed(1) : null];
  const last = rec.pts[rec.pts.length - 1];
  if (last && hav(last, p) < Math.max(5, c.accuracy / 2)) return;
  rec.pts.push(p); rec.ts.push(pos.timestamp); saveRec(); drawRec();
}
function drawRec() {
  if (!rec) { map.getSource('rec')?.setData(EMPTY); $('#h-rec-row').hidden = true; return; }
  map.getSource('rec')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: rec.pts.map((p) => [p[0], p[1]]) }, properties: {} });
  const s = rec.pts.length > 1 ? lineStats(rec.pts, rec.ts) : { distance_m: 0 };
  $('#h-rec-row').hidden = false; $('#hud').hidden = false;
  $('#h-rec').textContent = `${fmtMi(s.distance_m)} ${T('mi')} · ${fmtDur((Date.now() - rec.start) / 1000)}`;
}
function restoreRecording() { try { const r = JSON.parse(localStorage.getItem(REC_KEY) || 'null'); if (r && r.pts) { rec = r; $('#btn-rec').classList.add('on'); startGPS(); lockScreen(); drawRec(); toast(T('recResume'), 4000); } } catch (e) {} }
$('#btn-rec').onclick = () => openTab('rec');
function recSheet() {
  const on = !!rec;
  return `<h3>${T('recTitle')}</h3><p class="small muted">${T('recHow')}</p>
  ${on ? `<p><b id="rec-live"></b></p><label class="small muted">${T('recName')}<br><input id="rec-name" style="font-size:16px;padding:7px;border:1px solid #d9d6cc;border-radius:7px;width:100%" value="${esc(rec.name || '')}"></label><br>
    <button class="btn" id="rec-stop">${T('recStop')}</button><button class="btn danger" id="rec-cancel">${T('recCancel')}</button>`
    : `<button class="btn" id="rec-start">${T('recStart')}</button>`}`;
}
function bindRec() {
  $('#rec-start') && ($('#rec-start').onclick = () => { rec = { start: Date.now(), pts: [], ts: [], name: '' }; saveRec(); startGPS(); lockScreen(); follow = true; $('#btn-locate').classList.add('on'); $('#btn-rec').classList.add('on'); drawRec(); closeSheet(); });
  $('#rec-name') && ($('#rec-name').oninput = (e) => { rec.name = e.target.value; saveRec(); });
  $('#rec-live') && ($('#rec-live').textContent = $('#h-rec').textContent);
  $('#rec-stop') && ($('#rec-stop').onclick = async () => {
    if (rec.pts.length > 1) { const h = makeHike(rec.pts, rec.ts, rec.name || `${T('unnamed')} ${fmtDate(rec.start)}`, 'hike', 'recorded'); await putHikes([h]); await refreshHikes(); toast(T('recSaved')); }
    endRec();
  });
  $('#rec-cancel') && ($('#rec-cancel').onclick = endRec);
}
function endRec() { rec = null; try { localStorage.removeItem(REC_KEY); } catch (e) {} try { wakeLock && wakeLock.release(); } catch (e) {} $('#btn-rec').classList.remove('on'); drawRec(); closeSheet(); }
setInterval(() => { if (rec) { drawRec(); const l = $('#rec-live'); if (l) l.textContent = $('#h-rec').textContent; } }, 5000);

/* ---------- hikes: import, list, detail ---------- */
function hikeId(coords, start) { const a = coords[0], b = coords[coords.length - 1]; return `${start || ''}|${a[0].toFixed(4)},${a[1].toFixed(4)}|${b[0].toFixed(4)},${b[1].toFixed(4)}|${coords.length}`; }
function makeHike(coords, times, name, kind, source) {
  const start = times && times[0] ? new Date(times[0]).toISOString() : null;
  const st = lineStats(coords, times);
  return { id: hikeId(coords, start), name, kind, source, start, ...st, bbox: bbox(coords), coords };
}
function parseGPX(text, fname) {
  const x = new DOMParser().parseFromString(text, 'application/xml');
  const out = []; const name = x.querySelector('trk > name, rte > name, metadata > name')?.textContent?.trim() || fname.replace(/\.[^.]+$/, '');
  const type = (x.querySelector('trk > type')?.textContent || '').toLowerCase();
  for (const seg of [...x.querySelectorAll('trkseg'), ...x.querySelectorAll('rte')]) {
    const pts = [...seg.querySelectorAll('trkpt, rtept')]; if (pts.length < 2) continue;
    const coords = [], ts = [];
    for (const p of pts) { const ele = p.querySelector('ele')?.textContent; const t = p.querySelector('time')?.textContent; coords.push([+p.getAttribute('lon'), +p.getAttribute('lat'), ele != null ? +ele : null]); ts.push(t ? Date.parse(t) : null); }
    out.push(makeHike(coords, ts.some(Boolean) ? ts : null, name, /walk/.test(type) ? 'walk' : 'hike', 'gpx'));
  }
  return out;
}
function parseGeoJSON(j) {
  const feats = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : [{ type: 'Feature', geometry: j, properties: {} }];
  const out = [];
  for (const f of feats) {
    const g = f.geometry; if (!g) continue; const p = f.properties || {};
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const c of lines) {
      if (c.length < 2) continue;
      const coords = c.map((v) => [v[0], v[1], v[2] ?? null]);
      const h = makeHike(coords, null, p.name || T('unnamed'), p.kind === 'walk' ? 'walk' : 'hike', p.source || 'geojson');
      if (p.start) { h.start = new Date(p.start).toISOString(); h.id = hikeId(coords, h.start); }
      for (const k of ['distance_m', 'gain_m', 'moving_s', 'elapsed_s']) if (p[k] != null) h[k] = p[k];
      out.push(h);
    }
  }
  return out;
}
$('#file').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = ''; let all = [];
  for (const f of files) {
    const text = await f.text();
    try { all = all.concat(/^\s*[{[]/.test(text) ? parseGeoJSON(JSON.parse(text)) : parseGPX(text, f.name)); } catch (err) { toast(`${f.name}: ${err.message}`); }
  }
  // fill missing elevation from the terrain file
  for (const h of all) if (h.coords.some((c) => c[2] == null)) { for (const c of h.coords) if (c[2] == null) c[2] = await elevAt(c[0], c[1]); Object.assign(h, lineStats(h.coords, null), { moving_s: h.moving_s, elapsed_s: h.elapsed_s }); }
  const have = new Set(HIKES.map((h) => h.id)); const fresh = all.filter((h) => !have.has(h.id));
  await putHikes(fresh); await refreshHikes(); toast(T('imported', fresh.length, all.length - fresh.length), 4500);
  openTab('hikes', true);
  if (fresh.length === 1) showHike(fresh[0]);
};
async function refreshHikes() {
  HIKES = (await getAll()).sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')));
  map?.getSource('hikes')?.setData({ type: 'FeatureCollection', features: HIKES.map((h) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: h.coords.map((c) => [c[0], c[1]]) }, properties: { id: h.id, kind: h.kind } })) });
}
let filt = 'all', selected = null;
function hikesSheet() {
  const list = HIKES.filter((h) => filt === 'all' || h.kind === filt);
  const tot = list.reduce((a, h) => [a[0] + h.distance_m, a[1] + h.gain_m], [0, 0]);
  const seg = ['all', 'hike', 'walk'].map((k) => `<button data-f="${k}" aria-pressed="${filt === k}">${T(k === 'all' ? 'all' : k === 'hike' ? 'hikes' : 'walks')}</button>`).join('');
  return `<h3>${T('hikesTitle')}</h3>
  <div class="seg">${seg}</div>
  <div class="stats"><div class="stat"><b>${list.length.toLocaleString(lang)}</b><span>${T('count')}</span></div><div class="stat"><b>${Math.round(tot[0] / MI).toLocaleString(lang)}</b><span>${T('miles')}</span></div><div class="stat"><b>${fmtFt(tot[1])}</b><span>${T('gain')}</span></div></div>
  <button class="btn" id="imp">${T('importBtn')}</button>${HIKES.length ? `<button class="btn ghost" id="expall">${T('exportAll')}</button>` : ''}
  ${list.length ? `<ul class="list">${list.slice(0, 400).map((h) => `<li data-id="${esc(h.id)}"><div><div class="n">${esc(h.name)}</div><div class="d">${h.start ? fmtDate(h.start) : ''}</div></div><div class="v">${fmtMi(h.distance_m)} ${T('mi')}<br>${fmtFt(h.gain_m)} ${T('ft')}</div></li>`).join('')}</ul>` : `<p class="muted">${T('empty')}</p>`}`;
}
function bindHikes() {
  document.querySelectorAll('.seg button[data-f]').forEach((b) => (b.onclick = () => { filt = b.dataset.f; openTab('hikes', true); }));
  $('#imp') && ($('#imp').onclick = () => $('#file').click());
  $('#expall') && ($('#expall').onclick = () => download('senda-hikes-backup.geojson', JSON.stringify({ type: 'FeatureCollection', features: HIKES.map(toFeature) }), 'application/geo+json'));
  document.querySelectorAll('.list li').forEach((li) => (li.onclick = () => showHike(HIKES.find((h) => h.id === li.dataset.id))));
}
function toFeature(h) { const { coords, bbox: _b, id: _i, ...p } = h; return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords.map((c) => (c[2] != null ? [c[0], c[1], Math.round(c[2] * 10) / 10] : [c[0], c[1]])) }, properties: p }; }
function toGPX(h) {
  const pts = h.coords.map((c) => `<trkpt lat="${c[1]}" lon="${c[0]}">${c[2] != null ? `<ele>${c[2].toFixed(1)}</ele>` : ''}</trkpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Senda" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(h.name)}</name><type>${h.kind}</type><trkseg>${pts}</trkseg></trk></gpx>`;
}
async function download(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function showHike(h) {
  if (!h) return; selected = h;
  map.getSource('sel').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: h.coords.map((c) => [c[0], c[1]]) }, properties: {} });
  map.setPaintProperty('hikes', 'line-opacity', 0.35);
  fitHike(h);
  $('#sheet-body').innerHTML = `<h3>${esc(h.name)}</h3><p class="muted small">${h.start ? fmtDate(h.start) : ''} · ${T(h.kind === 'walk' ? 'kindWalk' : 'kindHike')}</p>
  <div class="stats"><div class="stat"><b>${fmtMi(h.distance_m)}</b><span>${T('distance')} (${T('mi')})</span></div><div class="stat"><b>${fmtFt(h.gain_m)}</b><span>${T('climb')} (${T('ft')})</span></div><div class="stat"><b>${fmtDur(h.moving_s ?? h.elapsed_s)}</b><span>${T(h.moving_s != null ? 'moving' : 'elapsed')}</span></div></div>
  <h4>${T('profile')}</h4>${profileSVG(h)}
  <button class="btn ghost" id="h-fit">${T('fitHike')}</button><button class="btn ghost" id="h-plan">${T('planThis')}</button><button class="btn ghost" id="h-gpx">${T('exportGpx')}</button><button class="btn danger" id="h-del">${T('del')}</button>`;
  $('#sheet').hidden = false; document.body.classList.add('sheet-open');
  $('#h-fit').onclick = () => fitHike(h);
  $('#h-plan').onclick = () => { plan.dist = +(h.distance_m / MI).toFixed(1); plan.climb = Math.round(h.gain_m * FT); savePlan(); openTab('plan'); };
  $('#h-gpx').onclick = () => download((h.name || 'hike').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) + '.gpx', toGPX(h), 'application/gpx+xml');
  let armed = false; $('#h-del').onclick = async (e) => { if (!armed) { armed = true; e.target.textContent = T('confirmDel'); return; } await delHike(h.id); map.getSource('sel').setData(EMPTY); await refreshHikes(); openTab('hikes', true); };
}
function fitHike(h) { const b = h.bbox; const sheetH = $('#sheet').hidden ? 0 : Math.min($('#sheet').offsetHeight, innerHeight * 0.6); map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 90, left: 40, right: 60, bottom: 40 + (innerWidth < 760 ? sheetH : 0) }, maxZoom: 15, duration: 800 }); }
function profileSVG(h) {
  const pr = []; let d = 0; for (let i = 0; i < h.coords.length; i++) { if (i) d += hav(h.coords[i - 1], h.coords[i]); if (h.coords[i][2] != null) pr.push([d / MI, h.coords[i][2] * FT]); }
  if (pr.length < 2) return `<p class="muted small">–</p>`;
  const W = 360, H = 150, m = { l: 44, r: 8, t: 8, b: 24 };
  const xmax = pr[pr.length - 1][0] || 1; let ymin = Math.min(...pr.map((p) => p[1])), ymax = Math.max(...pr.map((p) => p[1]));
  const span = Math.max(100, ymax - ymin); ymin -= span * 0.08; ymax += span * 0.08;
  const X = (v) => m.l + (v / xmax) * (W - m.l - m.r), Y = (v) => H - m.b - ((v - ymin) / (ymax - ymin)) * (H - m.t - m.b);
  const step = (r) => { const s = r / 4, p = 10 ** Math.floor(Math.log10(s)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= s); };
  const ys = step(ymax - ymin), xs = step(xmax); let ticks = '';
  for (let v = Math.ceil(ymin / ys) * ys; v <= ymax; v += ys) ticks += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#d9d6cc"/><text x="${m.l - 4}" y="${Y(v) + 3.5}" text-anchor="end">${Math.round(v).toLocaleString(lang)}</text>`;
  for (let v = 0; v <= xmax + 1e-9; v += xs) ticks += `<text x="${X(v)}" y="${H - 8}" text-anchor="middle">${+v.toFixed(2)}</text>`;
  const path = pr.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  return `<svg class="profile" viewBox="0 0 ${W} ${H}" font-size="10" fill="#5f5f5a" font-family="system-ui,sans-serif" role="img" aria-label="${T('profile')}">${ticks}
  <path d="${path}L${X(xmax)},${H - m.b}L${m.l},${H - m.b}Z" fill="#0072B2" fill-opacity=".14"/><path d="${path}" fill="none" stroke="#0072B2" stroke-width="1.8"/>
  <text x="${m.l}" y="${H - 1}" font-size="9">${T('mi')}</text><text x="2" y="${m.t + 6}" font-size="9">${T('ft')}</text></svg>`;
}

/* ---------- planner ---------- */
const PLAN_KEY = 'senda-plan';
let plan = (() => { try { return Object.assign({ dist: 4, climb: 600, temp: 85, date: '', start: '07:00', adult: 2, older: 0, child: 0, toddler: 0 }, JSON.parse(localStorage.getItem(PLAN_KEY) || '{}')); } catch (e) { return { dist: 4, climb: 600, temp: 85, date: '', start: '07:00', adult: 2, older: 0, child: 0, toddler: 0 }; } })();
function savePlan() { try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch (e) {} }
function sunset(date, lat, lon) {
  // NOAA-style sunrise equation; returns a Date for sunset
  const r = Math.PI / 180, jd = date.getTime() / 864e5 + 2440587.5, n = Math.round(jd - 2451545.0 + 0.0008);
  const Js = n - lon / 360, M = (357.5291 + 0.98560028 * Js) % 360, C = 1.9148 * Math.sin(M * r) + 0.02 * Math.sin(2 * M * r) + 0.0003 * Math.sin(3 * M * r);
  const lam = (M + C + 180 + 102.9372) % 360, Jt = 2451545 + Js + 0.0053 * Math.sin(M * r) - 0.0069 * Math.sin(2 * lam * r);
  const dec = Math.asin(Math.sin(lam * r) * Math.sin(23.4397 * r)), w = Math.acos((Math.sin(-0.833 * r) - Math.sin(lat * r) * Math.sin(dec)) / (Math.cos(lat * r) * Math.cos(dec)));
  return new Date((Jt + w / (2 * Math.PI) - 2440587.5) * 864e5);
}
function computePlan() {
  const t = plan.temp, rate = t < 70 ? 0.4 : t < 85 ? 0.6 : t < 95 ? 0.8 : t < 105 ? 1.0 : 1.25;
  const pace = Math.min(plan.adult ? 2.5 : 9, plan.older ? 2.0 : 9, plan.toddler ? 2.0 : 9, plan.child ? 1.3 : 9) || 2.5;
  const hours = (plan.dist / pace + (plan.climb / 1000) * 0.5 * (2.5 / pace)) * 1.1;
  const people = plan.adult + plan.older, w = { adult: 1, older: 1, child: 0.6, toddler: 0.4 };
  const liters = Object.keys(w).reduce((s, k) => s + plan[k] * w[k] * rate * hours, 0) * 1.2;
  const day = plan.date ? new Date(plan.date + 'T12:00:00') : new Date();
  const c = map ? map.getCenter() : { lat: 32.0, lng: -110.7 }, ss = sunset(day, c.lat, c.lng);
  const [hh, mm] = (plan.start || '07:00').split(':').map(Number); const st = new Date(day); st.setHours(hh, mm, 0, 0);
  const half = new Date(st.getTime() + hours * 1800e3), latest = new Date(ss.getTime() - 45 * 60e3), hard = new Date(st.getTime() + (latest - st) / 2);
  return { rate, pace, hours, liters, perAdult: rate * hours * 1.2, ss, st, half, hard, finish: new Date(st.getTime() + hours * 3600e3), tooLong: st.getTime() + hours * 3600e3 > latest.getTime(), month: day.getMonth() + 1, people };
}
function planSheet() {
  const stepper = (k) => `<div class="stepper"><button data-k="${k}" data-d="-1" aria-label="−">−</button><b>${plan[k]}</b><button data-k="${k}" data-d="1" aria-label="+">+</button></div>`;
  return `<h3>${T('planTitle')}</h3>
  <div class="form">
    <label>${T('pDist')}<input type="number" inputmode="decimal" step="0.1" min="0" id="p-dist" value="${plan.dist}"></label>
    <label>${T('pClimb')}<input type="number" inputmode="numeric" step="50" min="0" id="p-climb" value="${plan.climb}"></label>
    <label>${T('pTemp')}<input type="number" inputmode="numeric" step="1" id="p-temp" value="${plan.temp}"></label>
    <label>${T('pStart')}<input type="time" id="p-start" value="${plan.start}"></label>
    <label style="grid-column:1/-1">${T('pDate')}<input type="date" id="p-date" value="${plan.date || new Date().toLocaleDateString('en-CA')}"></label>
  </div>
  <h4>${T('pWho')}</h4>
  <div class="people"><span>${T('adult')}</span>${stepper('adult')}<span>${T('older')}</span>${stepper('older')}<span>${T('child')}</span>${stepper('child')}<span>${T('toddler')}</span>${stepper('toddler')}</div>
  <div id="p-out"></div>`;
}
function renderPlan() {
  const r = computePlan(), o = $('#p-out'); if (!o) return;
  const warn = [];
  if (plan.temp >= 100) warn.push(T('tooHot')); else if (plan.temp >= 90) warn.push(T('hot'));
  if (r.month >= 7 && r.month <= 9) warn.push(T('monsoon'));
  if (r.tooLong) warn.push(T('tooLong'));
  const turn = r.half < r.hard ? r.half : r.hard;
  o.innerHTML = `<div class="result">
    <div class="muted small">${T('waterNeed')}</div><div class="big">${r.liters.toFixed(1)} L</div>
    <div class="small">${r.perAdult.toFixed(1)} L ${T('perPerson')} (${lang === 'es' ? 'adulto' : 'adult'}) · ${T('bottles', Math.ceil(r.liters))}</div>
    <div class="stats" style="margin-top:10px"><div class="stat"><b>${fmtDur(r.hours * 3600)}</b><span>${T('totalTime')}</span></div><div class="stat"><b>${fmtTime(turn)}</b><span>${T('turnBy')}</span></div><div class="stat"><b>${fmtTime(r.ss)}</b><span>${T('sunset')}</span></div></div>
    <div class="small muted">${T('turnBy')}: ${fmtTime(r.half)} (${T('halfTime')}) · ${fmtTime(r.hard)} (${T('daylightLimit')}). ${T('finish')} ${fmtTime(r.finish)}</div>
  </div>${warn.map((w) => `<div class="warnbox">${w}</div>`).join('')}<p class="small muted">${T('planNote')}</p>`;
}
function bindPlan() {
  const num = (id, k) => ($(id).oninput = (e) => { plan[k] = +e.target.value || 0; savePlan(); renderPlan(); });
  num('#p-dist', 'dist'); num('#p-climb', 'climb'); num('#p-temp', 'temp');
  $('#p-start').oninput = (e) => { plan.start = e.target.value; savePlan(); renderPlan(); };
  $('#p-date').oninput = (e) => { plan.date = e.target.value; savePlan(); renderPlan(); };
  document.querySelectorAll('.stepper button').forEach((b) => (b.onclick = () => { const k = b.dataset.k; plan[k] = Math.max(0, plan[k] + +b.dataset.d); b.parentElement.querySelector('b').textContent = plan[k]; savePlan(); renderPlan(); }));
  renderPlan();
}

/* ---------- more: offline, install, about ---------- */
async function moreSheet() {
  let used = '';
  try { const e = await navigator.storage.estimate(); used = T('storage', (e.usage / 1048576).toFixed(0) + ' MB'); } catch (e) {}
  return `<h3>${T('offlineTitle')}</h3><p class="small">${T('offlineDesc')}</p>
  <p class="small"><b>${offlineSaved ? T('saved') : T('notSaved')}</b> <span class="muted">${used}</span></p>
  <div class="bar" id="dl-bar" hidden><i></i></div><p class="small muted" id="dl-msg"></p>
  ${offlineSaved ? `<button class="btn danger" id="off-rm">${T('removeOffline')}</button>` : `<button class="btn" id="off-save">${T('saveOffline')}</button>`}
  <h4>${T('installTitle')}</h4><p class="small">${T('installHow')}</p>
  <h4>${T('aboutTitle')}</h4><p class="small">${T('aboutBody')}</p><p class="small muted">${T('privacy')}</p>
  <p class="small muted" data-i18n-html="sources">${T('sources')}</p>`;
}
function bindMore() {
  $('#off-save') && ($('#off-save').onclick = saveOffline);
  $('#off-rm') && ($('#off-rm').onclick = async () => { await caches.delete(DATA_CACHE); offlineSaved = false; netBadge(); openTab('more', true); });
}
async function saveOffline() {
  const btn = $('#off-save'); btn.disabled = true; $('#dl-bar').hidden = false; $('#dl-msg').textContent = T('downloading');
  try { navigator.storage && navigator.storage.persist && (await navigator.storage.persist()); } catch (e) {}
  const files = [BASE_URL, DEM_URL]; let total = 0, got = 0; const sizes = [];
  for (const u of files) { const h = await nativeFetch(u, { method: 'HEAD' }); sizes.push(+h.headers.get('content-length') || 32e6); }
  total = sizes.reduce((a, b) => a + b, 0);
  try {
    const cache = await caches.open(DATA_CACHE);
    for (const u of files) {
      const res = await nativeFetch(u, { cache: 'no-store' }); const rd = res.body.getReader(); const parts = [];
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; $('#dl-bar i').style.width = (100 * got / total).toFixed(1) + '%'; }
      await cache.put(u, new Response(new Blob(parts), { headers: { 'Content-Type': 'application/octet-stream' } }));
    }
    offlineSaved = true; $('#dl-msg').textContent = T('reload'); netBadge();
  } catch (e) { $('#dl-msg').textContent = e.message; btn.disabled = false; }
}

/* ---------- tabs and sheet ---------- */
let currentTab = 'map';
async function openTab(tab, keep) {
  currentTab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === (tab === 'rec' ? 'map' : tab))));
  if (tab === 'map') return closeSheet();
  const body = $('#sheet-body');
  if (tab === 'hikes') { body.innerHTML = hikesSheet(); bindHikes(); }
  if (tab === 'plan') { body.innerHTML = planSheet(); bindPlan(); }
  if (tab === 'more') { body.innerHTML = await moreSheet(); bindMore(); }
  if (tab === 'rec') { body.innerHTML = recSheet(); bindRec(); }
  $('#sheet').hidden = false; document.body.classList.add('sheet-open'); if (!keep) $('#sheet').scrollTop = 0;
}
function closeSheet() { if (map && selected) { map.getSource('sel').setData(EMPTY); map.setPaintProperty('hikes', 'line-opacity', 0.85); selected = null; } $('#sheet').hidden = true; document.body.classList.remove('sheet-open'); currentTab = 'map'; document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === 'map'))); }
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => (b.dataset.tab === currentTab && b.dataset.tab !== 'map' ? closeSheet() : openTab(b.dataset.tab))));
$('#sheet-close').onclick = closeSheet;
$('#legend-h').onclick = () => $('#legend').classList.toggle('min');
if (innerWidth >= 760) $('#legend').classList.remove('min');
applyLang();

/* ---------- service worker (app shell offline) ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
