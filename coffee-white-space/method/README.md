# Method: coffee drive-thru white space, US Southwest

**Question.** A hypothetical regional drive-thru coffee brand wants to grow across Arizona, Nevada, New Mexico and Southern California. Where are there lots of people and a major road, but no Dutch Bros and hardly any other drive-thru coffee?

**Why Wherobots.** The inputs are every Overture place, arterial road segment and building footprint in four states, plus the Census population grid. That's tens of millions of geometries. Apache Sedona in Wherobots Cloud reads them in place from its Open Data catalog and aggregates them into H3 hexagons with spatial SQL, so nothing has to be downloaded. The whole scan runs in minutes on the smallest runtime.

**Why deck.gl.** It draws about 17,600 extruded H3 hexagons on the GPU, with no tile server and no basemap service. The page is static files on GitHub Pages.

## Files

| File | What it is |
|---|---|
| `white_space.sql` | The full pipeline in Sedona spatial SQL, steps 0 to 9, ending in one scored table |
| `white_space_notebook.ipynb` | The same steps as a Wherobots notebook, plus a GeoParquet export |
| `build_page.py` | Turns the Wherobots outputs into `../data.js` and `../basemap.js` for the page |

## Inputs (all public)

| Input | Source | Used for |
|---|---|---|
| Population | US Census 2020 on a 500 m grid (`wherobots_open_data.us_census.population_grid_500m`) | People within 2 miles |
| Places | Overture Maps `places_place`, release 2026-11-18 | Activity (places per hex) and drive-thru coffee stores |
| Roads | Overture `transportation_segment`, trunk, primary and secondary classes | Arterial km per hex (access) |
| Buildings | Overture `buildings_building` | Built fabric (buildings per hex) |
| Boundaries | Census TIGER counties (Wherobots) and 2023 cartographic boundaries | Study area, labels, basemap |

The study area is all of Arizona, Nevada and New Mexico, plus Imperial, Kern, Los Angeles, Orange, Riverside, San Bernardino, San Diego, San Luis Obispo, Santa Barbara and Ventura counties in California.

## Steps

1. **Grid.** H3 resolution 8, about 0.74 km² per hexagon, which is a few blocks across. Each 500 m Census cell is assigned to the hex under its centre.
2. **Drive-thru coffee.** The seven chains from the Pima County study are matched by name or brand: Dutch Bros, Starbucks, Black Rock Coffee Bar, 7 Brew, Dunkin', Scooter's Coffee and The Human Bean. Only food and coffee categories are kept. Same-brand records within 60 m of each other are merged. That leaves 5,945 stores, 501 of them Dutch Bros. Stores just outside the study area are kept, because they still compete for hexes near the edge.
3. **Activity, access, fabric.** For each hex: places with confidence ≥ 0.5, kilometres of arterial road (each segment's length split across the hexes it touches), and building footprints.
4. **Market.** People within 2 miles, measured from hex centre to hex centre: a k-ring of 5 is expanded, then trimmed to 3,219 m.
5. **Competition.** Drive-thru coffee stores within 1 and 2 miles of the hex centre, using true distance from each store, with Dutch Bros counted separately.
6. **Candidates.** A hex is a candidate if it has at least 0.3 km of arterial road and at least 10,000 people within 2 miles. That gives 17,640 hexes.
7. **Score (0 to 100) = demand × openness.**
   - Demand is a weighted sum of percentile ranks: people within 2 mi 55%, arterial km 20%, places 15%, buildings 10%.
   - Openness = 1 / (1 + 0.25 × other chains within 2 mi + 1 × Dutch Bros within 2 mi). Four other chains cut a score in half, and so does a single Dutch Bros.
8. **Market class** (the color on the map):
   - **White space:** no Dutch Bros and at most one other chain within 2 miles (2,233 hexes).
   - **Saturated:** a Dutch Bros, or 4 or more chains, within 2 miles (12,737 hexes).
   - **Contested:** everything else (2,670 hexes).

## What it found

- Drive-thru coffee is crowded. About 72% of busy-road hexes in the four states have a Dutch Bros or four-plus chains within 2 miles.
- The white space that's left falls into two kinds of places:
  - Dense, older, lower-income neighbourhoods the chains have skipped, such as west Glendale and Maryvale in metro Phoenix, Sunrise Manor in Las Vegas, and Inglewood, Compton and National City in Southern California. These have the most people per hex.
  - The newest edges of growing metros, such as east Mesa and San Tan Valley, and the edges of Tucson. These are the stores of tomorrow, but they have fewer people today.
- In the top list, Altadena's count comes from the 2020 Census, before the January 2025 Eaton Fire destroyed much of its housing. A real study would check current occupancy there first.

## The zoomed-in case study

The Pima County study (the CARTO piece on the portfolio hub) goes one level deeper for the Tucson metro. It works parcel by parcel, with zoning, ADOT traffic counts, LODES commuter flows and an AM-side check, and ends in a 10-site shortlist. This regional scan is the step before that: it picks which metros, and which parts of them, deserve the parcel-level work. The top Pima County white-space hex scores 43, and the county has 149 white-space hexes, mostly around the metro's edges, where the newer subdivisions are.

## Limits

- Overture can't tell whether a store has a drive-thru. Every Starbucks counts, including walk-in-only stores near campuses and downtowns, so central areas can look more saturated than they are for a drive-thru concept.
- Chains are matched by name, so independent drive-thru stands, which are common in Tucson and Albuquerque, aren't counted.
- Population is the 2020 Census. Fast-growing edges have more people now than shown.
- Scores rank hexes against each other. They are not sales forecasts.
- Arterial length stands in for traffic. The parcel-level study uses real AADT counts.

## Check

The full `white_space.sql` was run end to end in Wherobots on a Tiny runtime, and it produced the same 17,640 candidate hexes as the page. The market split is slightly different (2,197 white space, 2,559 contested, 12,884 saturated) because the SQL doesn't merge duplicate store records, which `build_page.py` does. The mean score difference is 0.9 points.

## Re-running

- In Wherobots Cloud, open `white_space_notebook.ipynb` and run all cells on a Tiny runtime.
- From a script, use the Spatial SQL API: `pip install wherobots-python-dbapi`, connect with an API key, and run the stage queries.
- `build_page.py STAGES_DIR BASE_DIR ..` rebuilds the page data from the stage outputs (Parquet). The stages are `pop8`, `shops`, `places8`, `roads8`, `bldg8`, `counties`, `cities` and `freeways`.

Hypothetical client, public data only. Pensador Solutions, Tucson, Arizona, November 2026.
