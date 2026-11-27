# Web GIS portfolio · Pensador Solutions

One real question per web GIS platform. Live at https://b-rad-b.github.io/maps/

| Folder / link | Platform | Status |
|---|---|---|
| `azt-border-to-vail/` | MapLibre GL JS | Live |
| `azt-border-to-patagonia/` | MapLibre GL JS | Live |
| `home-ranges/ealing/` | three.js | Live |
| `home-ranges/` | three.js + Python pipeline (home-range atlas, 49 places) | Live |
| `home-ranges/rita-ranch/` | three.js (public-data neighborhood map) | Live |
| `protomaps-southern-arizona/` | Protomaps / PMTiles + MapLibre GL JS (self-hosted basemap, no key) | Live |
| `trail/` | MapLibre GL JS + PMTiles PWA (Senda: offline trail map, hike log, desert planner) | Live |
| `coffee-white-space/` | Wherobots (Apache Sedona) + deck.gl | Live |
| `white-space/optimyze/`, `the-joint/`, `sprouts/` | Wherobots + deck.gl (brand recipes) | Live |
| Drive-thru coffee site selection | CARTO Builder | Building |
| Change Watch | ArcGIS Online / Experience Builder | Next |
| Beaver survey planning map | Felt | Planned |
| Historic route story | Mapbox | Planned |
| Drive the shortlist | Google Maps Platform | Planned |
| 80-acre land map | QGIS → qgis2web / Leaflet | Planned |

Self-hosted pieces are static folders with no build step (MapLibre GL JS 4.7.1, Lato, data bundled in the folder). Hosted-platform pieces (CARTO, ArcGIS Online, Felt) are linked from cards on the landing page. Browser API keys, when a piece needs one, are restricted to this site's URLs.

Home-range maps (`home-ranges/`) share one three.js app in `home-ranges/_lib/` (three.js 0.169 and IM Fell fonts vendored, MIT/OFL). Each city folder holds `index.html`, `data.js` and `texture.jpg`, built by `build_city.py` in the private project files from a city config, Swarm check-ins and Overture Maps. Only public places, a 3-level visit tier and the 95% home-range outline are published; no check-in points, dates, counts or core areas.

Coffee white space (`coffee-white-space/`) is a static deck.gl 9.1 page (deck.gl and h3-js vendored, MIT/Apache-2.0) with a bundled basemap (no tiles, no keys). The analysis ran in Wherobots Cloud; the SQL, notebook and method are in `coffee-white-space/method/`.

Brand white-space studies (`white-space/`) reuse the coffee pipeline as recipes: one shared deck.gl app in `white-space/_lib/`, one `data.js` per brand. They are independent public-data studies and are not affiliated with the brands. See `white-space/README.md`.
