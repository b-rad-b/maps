-- Coffee drive-thru white space, US Southwest
-- Wherobots Cloud (Apache Sedona spatial SQL), Overture Maps + US Census 500 m population grid.
-- Run top to bottom in one session. Every step is a temp view; the last SELECT is the result.
-- Study area: Arizona, Nevada, New Mexico and the ten Southern California counties.

-- 0. Study area as county GEOIDs and a bounding box for fast Overture pruning
CREATE OR REPLACE TEMP VIEW region AS
SELECT GEOID, NAME, STATEFP FROM wherobots_open_data.us_census.tiger_county
WHERE STATEFP IN ('04','32','35')
   OR (STATEFP = '06' AND COUNTYFP IN ('025','029','037','059','065','071','073','079','083','111'));

CREATE OR REPLACE TEMP VIEW bb AS SELECT -121.4 AS xmin, 31.3 AS ymin, -102.9 AS xmax, 42.1 AS ymax;

-- 1. People: 500 m Census grid cells -> H3 resolution 8 (about 0.74 km2 per hex)
CREATE OR REPLACE TEMP VIEW pop8 AS
SELECT ST_H3CellIDs(ST_Point(g.cell_lon, g.cell_lat), 8, false)[0] AS h3,
       SUM(g.pop) AS pop, FIRST(g.primary_county_geoid) AS county
FROM wherobots_open_data.us_census.population_grid_500m g
JOIN region r ON g.primary_county_geoid = r.GEOID
WHERE g.pop > 0
GROUP BY 1;
CACHE TABLE pop8;

-- 2. Drive-thru coffee: the same seven chains as the Pima County study, matched on name or brand
CREATE OR REPLACE TEMP VIEW shops AS
SELECT id,
       CASE WHEN nm RLIKE 'dutch bro'          THEN 'Dutch Bros'
            WHEN nm RLIKE 'starbucks'          THEN 'Starbucks'
            WHEN nm RLIKE 'black rock coffee'  THEN 'Black Rock Coffee Bar'
            WHEN nm RLIKE '7 brew|seven brew'  THEN '7 Brew'
            WHEN nm RLIKE 'dunkin'             THEN 'Dunkin'
            WHEN nm RLIKE 'scooter.?s coffee'  THEN 'Scooter''s Coffee'
            WHEN nm RLIKE 'human bean'         THEN 'The Human Bean' END AS brand,
       ST_H3CellIDs(geometry, 8, false)[0] AS h3,
       ST_X(geometry) AS lon, ST_Y(geometry) AS lat
FROM (
  SELECT id, geometry, basic_category,
         lower(concat_ws(' ', names.primary, brand.names.primary)) AS nm
  FROM wherobots_open_data.overture_maps_foundation.places_place, bb
  WHERE bbox.xmin BETWEEN bb.xmin AND bb.xmax AND bbox.ymin BETWEEN bb.ymin AND bb.ymax
    AND (operating_status IS NULL OR operating_status = 'open')
) p
WHERE nm RLIKE 'dutch bro|starbucks|black rock coffee|7 brew|seven brew|dunkin|scooter.?s coffee|human bean'
  AND COALESCE(basic_category, 'coffee_shop') IN ('coffee_shop','cafe','fast_food_restaurant','casual_eatery','food_and_drink','restaurant','food_service');
CACHE TABLE shops;

-- Shops just over the study-area line are kept on purpose: they still compete for edge hexes.

-- 3. Daytime activity: every Overture place (shops, offices, schools, clinics...) per hex
CREATE OR REPLACE TEMP VIEW places8 AS
SELECT ST_H3CellIDs(geometry, 8, false)[0] AS h3, COUNT(*) AS places
FROM wherobots_open_data.overture_maps_foundation.places_place, bb
WHERE bbox.xmin BETWEEN bb.xmin AND bb.xmax AND bbox.ymin BETWEEN bb.ymin AND bb.ymax
  AND confidence >= 0.5
GROUP BY 1;

-- 4. Access: kilometres of arterial road (trunk, primary, secondary) per hex.
--    Each segment's length is split evenly across the hexes it touches.
CREATE OR REPLACE TEMP VIEW roads8 AS
SELECT h3, SUM(km) AS road_km FROM (
  SELECT explode(cells) AS h3, ST_LengthSpheroid(geometry) / 1000.0 / size(cells) AS km
  FROM (
    SELECT geometry, ST_H3CellIDs(geometry, 8, true) AS cells
    FROM wherobots_open_data.overture_maps_foundation.transportation_segment, bb
    WHERE bbox.xmin BETWEEN bb.xmin AND bb.xmax AND bbox.ymin BETWEEN bb.ymin AND bb.ymax
      AND subtype = 'road' AND class IN ('trunk','primary','secondary')
  )
) GROUP BY h3;

-- 5. Built fabric: Overture building footprints per hex (tens of millions of polygons)
CREATE OR REPLACE TEMP VIEW bldg8 AS
SELECT ST_H3CellIDs(ST_Centroid(geometry), 8, false)[0] AS h3, COUNT(*) AS buildings
FROM wherobots_open_data.overture_maps_foundation.buildings_building, bb
WHERE bbox.xmin BETWEEN bb.xmin AND bb.xmax AND bbox.ymin BETWEEN bb.ymin AND bb.ymax
GROUP BY 1;

-- Hex centres, used for true-distance checks after each k-ring expansion
CREATE OR REPLACE TEMP VIEW centre AS
SELECT h3, ST_Centroid(ST_H3ToGeom(array(h3))[0]) AS c FROM (
  SELECT h3 FROM pop8 UNION SELECT h3 FROM roads8
);

-- 6. Market: people within 2 miles (ring 5, then a 3,219 m centre-to-centre check)
CREATE OR REPLACE TEMP VIEW market AS
SELECT k.n AS h3, SUM(k.pop) AS pop_2mi
FROM (SELECT h3, explode(ST_H3KRing(h3, 5, false)) AS n, pop FROM pop8) k
JOIN centre a ON a.h3 = k.h3
JOIN centre b ON b.h3 = k.n
WHERE ST_DistanceSphere(a.c, b.c) <= 3218.688
GROUP BY k.n;

-- 7. Competition: drive-thru coffee within 1 and 2 miles, store point to hex centre
CREATE OR REPLACE TEMP VIEW comp AS
SELECT k.n AS h3,
       SUM(CASE WHEN ST_DistanceSphere(k.pt, b.c) <= 1609.344 THEN 1 ELSE 0 END) AS dt_1mi,
       COUNT(*) AS dt_2mi,
       SUM(CASE WHEN k.brand = 'Dutch Bros' THEN 1 ELSE 0 END) AS dutch_2mi
FROM (SELECT brand, ST_Point(lon, lat) AS pt, explode(ST_H3KRing(h3, 5, false)) AS n FROM shops) k
JOIN centre b ON b.h3 = k.n
WHERE ST_DistanceSphere(k.pt, b.c) <= 3218.688
GROUP BY k.n;

-- 8. Candidate hexes: at least 0.3 km of arterial in the hex and 10,000+ people within 2 miles
CREATE OR REPLACE TEMP VIEW cand AS
SELECT m.h3, m.pop_2mi,
       COALESCE(p.pop, 0) AS pop, r.road_km,
       COALESCE(pl.places, 0) AS places, COALESCE(b.buildings, 0) AS buildings,
       COALESCE(c.dt_1mi, 0) AS dt_1mi, COALESCE(c.dt_2mi, 0) AS dt_2mi, COALESCE(c.dutch_2mi, 0) AS dutch_2mi,
       COALESCE(p.county, nb.county) AS county
FROM market m
JOIN roads8 r ON r.h3 = m.h3
LEFT JOIN pop8 p ON p.h3 = m.h3
LEFT JOIN places8 pl ON pl.h3 = m.h3
LEFT JOIN bldg8 b ON b.h3 = m.h3
LEFT JOIN comp c ON c.h3 = m.h3
LEFT JOIN (SELECT n AS h3, FIRST(county) AS county
           FROM (SELECT explode(ST_H3KRing(h3, 2, false)) AS n, county FROM pop8) GROUP BY n) nb ON nb.h3 = m.h3
WHERE m.pop_2mi >= 10000 AND r.road_km >= 0.3;
CACHE TABLE cand;

-- 9. Score 0-100 = demand x openness.
--    demand: percentile ranks of people within 2 mi (55%), arterial km (20%), places (15%), buildings (10%)
--    openness: 1 / (1 + 0.25 x other drive-thru coffee within 2 mi + 1 x Dutch Bros within 2 mi)
--    market: white space = no Dutch Bros and at most one other chain within 2 mi;
--            saturated = a Dutch Bros or 4+ chains within 2 mi; contested = the rest.
CREATE OR REPLACE TEMP VIEW scored AS
SELECT *,
  ROUND(100 * (0.55 * PERCENT_RANK() OVER (ORDER BY pop_2mi)
             + 0.20 * PERCENT_RANK() OVER (ORDER BY road_km)
             + 0.15 * PERCENT_RANK() OVER (ORDER BY places)
             + 0.10 * PERCENT_RANK() OVER (ORDER BY buildings))
            / (1 + 0.25 * (dt_2mi - dutch_2mi) + 1.0 * dutch_2mi), 1) AS score,
  CASE WHEN dutch_2mi = 0 AND dt_2mi <= 1 THEN 'white space'
       WHEN dutch_2mi > 0 OR dt_2mi >= 4  THEN 'saturated'
       ELSE 'contested' END AS market
FROM cand;

SELECT s.h3, s.score, s.market, s.pop_2mi, s.pop, s.road_km, s.places, s.buildings,
       s.dt_1mi, s.dt_2mi, s.dutch_2mi, s.county AS county_geoid, r.NAME AS county, r.STATEFP AS state_fips
FROM scored s LEFT JOIN region r ON r.GEOID = s.county
