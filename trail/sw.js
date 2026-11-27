/* Senda service worker: keeps the app shell, fonts, sprites and small data available with no signal.
   The two large .pmtiles files are saved separately (Cache Storage "senda-data-v1") by the app's "Save for offline" button. */
const SHELL = 'senda-shell-v3';
const PRECACHE = ['./', 'index.html', 'app.css', 'app.js', 'i18n.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png',
  'vendor/maplibre-contour.min.js', 'data/azt-measured.json', 'data/water.geojson',
  '../protomaps-southern-arizona/vendor/maplibre-gl.js', '../protomaps-southern-arizona/vendor/maplibre-gl.css',
  '../protomaps-southern-arizona/vendor/pmtiles.js', '../protomaps-southern-arizona/vendor/basemaps.js',
  '../protomaps-southern-arizona/sprites/light.json', '../protomaps-southern-arizona/sprites/light.png',
  '../protomaps-southern-arizona/sprites/light@2x.json', '../protomaps-southern-arizona/sprites/light@2x.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('senda-shell') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('.pmtiles') || req.headers.has('range')) return;
  const codeFirst = req.mode === 'navigate' || /\/trail\/(app\.(js|css)|i18n\.js|index\.html)?$/.test(url.pathname);
  const fresh = fetch(req, codeFirst ? { cache: 'no-cache' } : {}).then((res) => { if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return res; });
  // network first for pages and app code (so updates arrive), cache first for fonts/sprites/vendor
  e.respondWith(codeFirst ? fresh.catch(() => caches.match(req, { ignoreSearch: true })) : caches.match(req, { ignoreSearch: true }).then((hit) => hit || fresh));
});
