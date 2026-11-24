-- Stage queries for the brand white-space studies (Wherobots Cloud, Apache Sedona spatial SQL).
-- Each query returns one small aggregate table; build_brand.py reads them as Parquet (<name>.parquet).
-- pop8, places8, roads8, bldg8, counties, cities: the same aggregates as ../coffee-white-space/method/white_space.sql (steps 1, 3, 4, 5).

-- ===== pop8
SELECT ST_H3CellIDs(ST_Point(g.cell_lon, g.cell_lat), 8, false)[0] AS h3, SUM(g.pop) AS pop, FIRST(g.primary_county_geoid) AS county
FROM wherobots_open_data.us_census.population_grid_500m g
JOIN wherobots_open_data.us_census.tiger_county r ON g.primary_county_geoid = r.GEOID
WHERE g.pop > 0 AND (r.STATEFP IN ('04','32','35') OR (r.STATEFP = '06' AND r.COUNTYFP IN ('025','029','037','059','065','071','073','079','083','111')))
GROUP BY 1
;

-- ===== acs8
WITH v AS (
  SELECT geoid,
    SUM(CASE WHEN variable = 'B01003_001' THEN estimate END) AS tpop,
    SUM(CASE WHEN variable = 'B19001_001' THEN estimate END) AS hh,
    SUM(CASE WHEN variable IN ('B19001_014','B19001_015','B19001_016','B19001_017') THEN estimate END) AS hh100,
    SUM(CASE WHEN variable IN ('B19001_016','B19001_017') THEN estimate END) AS hh150,
    SUM(CASE WHEN variable IN ('B15003_022','B15003_023','B15003_024','B15003_025') THEN estimate END) AS ba,
    SUM(CASE WHEN variable IN ('B01001_011','B01001_012','B01001_013','B01001_014','B01001_015','B01001_016','B01001_017','B01001_018','B01001_019',
                               'B01001_035','B01001_036','B01001_037','B01001_038','B01001_039','B01001_040','B01001_041','B01001_042','B01001_043') THEN estimate END) AS a2564
  FROM wherobots_open_data.us_census.acs_5yr_estimates
  WHERE geo_level = 'tract' AND table_id IN ('B01003','B19001','B15003','B01001')
    AND (substr(geoid, -11, 2) IN ('04','32','35','06'))
  GROUP BY geoid
)
SELECT ST_H3CellIDs(ST_Point(g.cell_lon, g.cell_lat), 8, false)[0] AS h3,
       SUM(g.pop) AS pop,
       SUM(g.pop * v.hh / v.tpop) AS hh,
       SUM(g.pop * v.hh100 / v.tpop) AS hh100,
       SUM(g.pop * v.hh150 / v.tpop) AS hh150,
       SUM(g.pop * v.ba / v.tpop) AS ba,
       SUM(g.pop * v.a2564 / v.tpop) AS a2564
FROM wherobots_open_data.us_census.population_grid_500m g
JOIN v ON substr(v.geoid, -11) = g.primary_tract_geoid
WHERE g.pop > 0 AND v.tpop > 0 AND g.state_fips IN ('04','32','35','06')
GROUP BY 1
;

-- ===== places8
SELECT ST_H3CellIDs(geometry, 8, false)[0] AS h3, COUNT(*) AS places
FROM wherobots_open_data.overture_maps_foundation.places_place
WHERE bbox.xmin BETWEEN -121.4 AND -102.9 AND bbox.ymin BETWEEN 31.3 AND 42.1 AND confidence >= 0.5 GROUP BY 1
;

-- ===== roads8
SELECT h3, SUM(km) AS road_km FROM (
  SELECT explode(cells) AS h3, ST_LengthSpheroid(geometry) / 1000.0 / size(cells) AS km FROM (
    SELECT geometry, ST_H3CellIDs(geometry, 8, true) AS cells
    FROM wherobots_open_data.overture_maps_foundation.transportation_segment
    WHERE bbox.xmin BETWEEN -121.4 AND -102.9 AND bbox.ymin BETWEEN 31.3 AND 42.1 AND subtype = 'road' AND class IN ('trunk','primary','secondary'))) GROUP BY h3
;

-- ===== bldg8
SELECT ST_H3CellIDs(ST_Centroid(geometry), 8, false)[0] AS h3, COUNT(*) AS buildings
FROM wherobots_open_data.overture_maps_foundation.buildings_building
WHERE bbox.xmin BETWEEN -121.4 AND -102.9 AND bbox.ymin BETWEEN 31.3 AND 42.1 GROUP BY 1
;

-- ===== brandplaces
SELECT names.primary AS name, brand.names.primary AS brand, basic_category, taxonomy.primary AS tax, confidence, ST_X(geometry) AS lon, ST_Y(geometry) AS lat,
       ST_H3CellIDs(geometry, 8, false)[0] AS h3
FROM wherobots_open_data.overture_maps_foundation.places_place
WHERE bbox.xmin BETWEEN -121.4 AND -102.9 AND bbox.ymin BETWEEN 31.3 AND 42.1 AND (operating_status IS NULL OR operating_status = 'open') AND (
  lower(concat_ws(' ', names.primary, brand.names.primary)) RLIKE 'sprouts|whole foods|trader joe|natural grocers|fresh market|the joint|optimyze'
  OR taxonomy.primary IN ('chiropractic','chiropractor','cryotherapy','iv_hydration','health_spa','health_and_wellness_club','sauna','float_spa','medical_spa')
  OR (basic_category IN ('wellness_service','health_care','sports_and_recreation','lifestyle_services','complementary_and_alternative_medicine')
      AND lower(names.primary) RLIKE 'cryo|cold plunge|plunge|red light|infrared|sauna|float|recovery|hyperbaric|iv drip|iv lounge|iv therapy|hydration|contrast therap|biohack|longevity|chiropract'))
;

-- ===== fsqplaces (Foursquare Open Source Places: a second source for chain stores)
SELECT name, latitude AS lat, longitude AS lon, address, locality, region, date_refreshed, website,
       concat_ws('; ', fsq_category_labels) AS cats
FROM wherobots_open_data.foursquare.places
WHERE country = 'US' AND region IN ('AZ','NV','NM','CA','UT','CO','TX') AND date_closed IS NULL
  AND longitude BETWEEN -121.4 AND -102.9 AND latitude BETWEEN 31.3 AND 42.1
  AND lower(name) RLIKE '^sprouts farmers|^whole foods market|^trader joe|^natural grocers|^the joint chiro|^the joint \\.|^optimyze'
;

-- ===== cities
SELECT names.primary AS name, population, region, ST_X(geometry) AS lon, ST_Y(geometry) AS lat
FROM wherobots_open_data.overture_maps_foundation.divisions_division
WHERE bbox.xmin BETWEEN -121.4 AND -102.9 AND bbox.ymin BETWEEN 31.3 AND 42.1 AND subtype = 'locality' AND country = 'US' AND population >= 40000
;

-- ===== counties
SELECT GEOID, NAME, STATEFP FROM wherobots_open_data.us_census.tiger_county WHERE STATEFP IN ('04','32','35','06')
;
