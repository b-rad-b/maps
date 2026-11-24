# Web GIS portfolio · Pensador Solutions

One real question per web GIS platform. Live at https://b-rad-b.github.io/maps/

| Folder / link | Platform | Status |
|---|---|---|
| `azt-border-to-vail/` | MapLibre GL JS | Live |
| `azt-border-to-patagonia/` | MapLibre GL JS | Live |
| `home-ranges/ealing/` | three.js | Live |
| Drive-thru coffee site selection | CARTO Builder | Building |
| Change Watch | ArcGIS Online / Experience Builder | Next |
| Beaver survey planning map | Felt | Planned |
| Historic route story | Mapbox | Planned |
| Drive the shortlist | Google Maps Platform | Planned |
| Coffee white space, US Southwest | Wherobots + deck.gl | Planned |
| 80-acre land map | QGIS → qgis2web / Leaflet | Planned |

Self-hosted pieces are static folders with no build step (MapLibre GL JS 4.7.1, Lato, data bundled in the folder). Hosted-platform pieces (CARTO, ArcGIS Online, Felt) are linked from cards on the landing page. Browser API keys, when a piece needs one, are restricted to this site's URLs.

Home-range maps (`home-ranges/`) share one three.js app in `home-ranges/_lib/` (three.js 0.169 and IM Fell fonts vendored, MIT/OFL). Each city folder holds `index.html`, `data.js` and `texture.jpg`, built by `build_city.py` in the private project files from a city config, Swarm check-ins and Overture Maps. Only public places, a 3-level visit tier and the 95% home-range outline are published; no check-in points, dates, counts or core areas.
