# Brand white-space studies

Independent, public-data studies of where a specific brand still has room to grow. None of them is affiliated with, or commissioned by, the brand named. Each one is the kind of map a franchisor's development team, or a franchisee choosing a territory, would look at before a broker search starts.

| Folder | Question | Area |
|---|---|---|
| `sprouts/` | Where could the next Sprouts go? | Arizona, Nevada, New Mexico, Southern California |
| `the-joint/` | Where is there room for another walk-in chiropractic clinic? | Same four-state area |
| `optimyze/` | Where should the next recovery studio go in metro Phoenix? | Maricopa and Pinal counties, Arizona |

The first study, `../coffee-white-space/`, used the same pipeline for a hypothetical drive-thru coffee brand.

## How it works

1. **Aggregate in Wherobots Cloud** (Apache Sedona spatial SQL, smallest runtime). `_lib/stages.sql` holds the queries. Each one reads the Wherobots Open Data catalog in place and returns one table at H3 resolution 8 (about 0.74 km² per hexagon):
   - `pop8`: Census 2020 population from the 500 m grid.
   - `acs8`: households, households earning $100K+ and $150K+, adults with a bachelor's degree, and adults aged 25 to 64. These come from American Community Survey 2020–2024 tract estimates, spread over the 500 m grid cells in proportion to population.
   - `places8`, `roads8`, `bldg8`: Overture places, arterial road kilometres and building footprints per hexagon.
   - `brandplaces`: every Overture place that could be one of the brands, or one of their competitors.
   - `fsqplaces`: the same chains from Foursquare Open Source Places. Overture alone had 20 of Arizona's roughly 50 Sprouts stores under that name, so the two sources are merged and records of one brand within 250 m of each other count as one store.
2. **Score each brand** with `_lib/build_brand.py` and the recipe in `_lib/brands.py`:
   - Candidate hexagons have at least 0.3 km of arterial road and a minimum market within the trade radius.
   - Trade-area sums use true distance between hexagon centres (3 miles for all three brands).
   - **Demand** is a weighted sum of percentile ranks. The weights are in the recipe and on each page's legend.
   - **Openness** = 1 / (1 + w × competitors within the radius + 1 × the brand's own stores within the radius).
   - **Score** = 100 × demand × openness.
   - **Class:** *already here* (the brand has a store within the radius), *white space* (no store of the brand, and competitors at or below the recipe's threshold) or *contested* (the rest).
3. **Name the picks.** `_lib/cross_streets.py` asks Wherobots for the two main roads in each top hexagon and the city it falls in.
4. **Draw it.** `_lib/app.js` is one deck.gl page shared by every brand folder. Each folder holds only `index.html` and `data.js`. The basemap and the deck.gl and h3-js libraries are shared with `../coffee-white-space/`.

## Brand recipes

| | Sprouts | The Joint | Optimyze |
|---|---|---|---|
| Own stores | Sprouts Farmers Market (Overture + Foursquare) | The Joint Chiropractic (Overture + Foursquare) | The three studios (Overture + Foursquare) |
| Competitors | Whole Foods, Trader Joe's, Natural Grocers | Every other chiropractor | Cryotherapy, sauna, float, IV and recovery studios |
| Demand | Households $100K+ (30%), share of households $100K+ (20%), share of adults with a degree (20%), people (15%), arterial road (15%) | Adults 25–64 (45%), places in the hexagon (25%), households $100K+ (15%), arterial road (15%) | Adults with a degree (25%) and their share (15%), households $150K+ (25%), adults 25–64 (20%), arterial road (15%) |
| Minimum market | 40,000 people within 3 mi | 25,000 adults 25–64 within 3 mi | 20,000 adults 25–64 within 3 mi |
| White space when | No Sprouts and at most one competitor within 3 mi | No clinic within 3 mi and at most 2 other chiropractors per 10,000 working-age adults | No Optimyze and at most two recovery studios within 3 mi |

## Limits

- **Store lists come from Overture and Foursquare open data and can still be incomplete or out of date.** A missing store shows up as false white space, and a closed one hides real white space. Check any area against the brand's own store locator before acting on it.
- Competitors are matched by Overture category and by name. The recovery-studio list is the least certain: the category is new and labelled inconsistently.
- Income, education and age are tract-level survey estimates spread by population, so they blur at the edges of tracts.
- Population is the 2020 Census. Fast-growing edges have more people now than shown.
- Scores rank hexagons against each other within one study. They are not sales forecasts, and scores from two studies can't be compared.
- A 3-mile circle stands in for a drive-time trade area. A site study would use real drive times, parcels, zoning, traffic counts, co-tenants and a visit.

Pensador Solutions, Tucson, Arizona, November 2026.
