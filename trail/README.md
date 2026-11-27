# Senda · personal trail map (PWA)

An installable web app for iPhone (Safari → Share → Add to Home Screen). No build step, no API keys, no accounts.

- **Map:** Protomaps basemap (`../protomaps-southern-arizona/southern-arizona.pmtiles`), hillshade and contours in feet made in the browser from `data/dem.pmtiles` (Terrarium terrain tiles z5–12 for the same box, from Tilezen/AWS: USGS 3DEP + SRTM), Arizona Trail border→Vail with mileage (`data/azt-measured.json`), springs and water points from OpenStreetMap (`data/water.geojson`). OpenStreetMap raster tiles fill in only when the view leaves southern Arizona and the phone is online.
- **Offline:** "More → Save for offline" stores both PMTiles files (≈63 MB) in Cache Storage; the service worker keeps the app shell, fonts and sprites.
- **GPS:** location, compass heading, elevation from the terrain file, ≈AZT mile, distance off trail and next water to the north.
- **Hike log:** import GPX or GeoJSON (Strava, Gaia, any app). Stored only in this browser's IndexedDB. Stats, elevation profile, GPX share, GeoJSON backup.
- **Recording:** screen-on recording with Wake Lock; iOS pauses web apps when the screen locks, so long hikes should be recorded in a native app and imported.
- **Planner:** water by temperature, time and group (adults, 65+, kids, carried kids), sunset, turnaround times, heat and monsoon warnings.
- **English / Spanish** UI.

Personal hike data is never committed here. Rebuild scripts for the terrain file and the Strava seed live in the private project files (`llc/trail-app/`).
