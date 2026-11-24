"""Turn the Wherobots stage outputs into data.js and basemap.js for the deck.gl page.

The heavy work (every Overture place, road segment and building in the study area, plus the
Census 500 m grid, aggregated to H3 resolution 8) runs in Wherobots; see white_space.sql and
white_space_notebook.ipynb. The k-ring market and competition sums and the score are small
enough to finish here, and they follow white_space.sql step for step.

usage: python build_page.py STAGES_DIR BASE_DIR OUT_DIR
"""
import json, math, re, sys
from pathlib import Path
import h3, pandas as pd

S, BASE, OUT = map(Path, sys.argv[1:4])
rd = lambda n: pd.read_parquet(S / f"{n}.parquet")
hx = lambda v: h3.int_to_str(int(v)) if not isinstance(v, str) else v

pop = rd("pop8"); pop["h3"] = pop.h3.map(hx)
places = rd("places8"); places["h3"] = places.h3.map(hx)
roads = rd("roads8"); roads["h3"] = roads.h3.map(hx)
bldg = rd("bldg8"); bldg["h3"] = bldg.h3.map(hx)
shops = rd("shops"); shops["h3"] = shops.h3.map(hx)
counties = rd("counties")

BRANDS = [("Dutch Bros", r"dutch bro"), ("Starbucks", r"starbucks"), ("Black Rock Coffee Bar", r"black rock coffee"),
          ("7 Brew", r"7 brew|seven brew"), ("Dunkin", r"dunkin"), ("Scooter's Coffee", r"scooter.?s coffee"),
          ("The Human Bean", r"human bean")]
def brand(nm):
    for b, p in BRANDS:
        if re.search(p, nm): return b
shops["brand"] = shops.nm.map(brand)
# keep food-and-coffee categories only (drops offices, distributors, stores that merely mention a brand)
shops = shops[shops.basic_category.fillna("coffee_shop").isin(
    ["coffee_shop", "cafe", "fast_food_restaurant", "casual_eatery", "food_and_drink", "restaurant", "food_service"])]
# Overture sometimes has two records for one store: drop same-brand points within 60 m
shops = shops.sort_values(["brand", "lat"]).reset_index(drop=True)
keep, seen = [], {}
for r in shops.itertuples():
    near = [q for q in seen.get((r.brand, r.h3), [])]
    if any(h3.great_circle_distance((r.lat, r.lon), q, unit="m") < 60 for q in near):
        continue
    for n in h3.grid_disk(r.h3, 1):
        seen.setdefault((r.brand, n), []).append((r.lat, r.lon))
    keep.append(r.Index)
shops = shops.loc[keep]
print("shops", len(shops), shops.brand.value_counts().to_dict())

MI1, MI2 = 1609.344, 3218.688
centre = {}
def cc(c):
    if c not in centre: centre[c] = h3.cell_to_latlng(c)
    return centre[c]
def dist(a, b): return h3.great_circle_distance(cc(a), cc(b), unit="m")

# 6. market: people whose 500 m grid cell lies within 2 miles (hex centre to hex centre; ring 5 then a distance check)
pop_by = dict(zip(pop.h3, pop["pop"]))
market = {}
for c, p in pop_by.items():
    for n in h3.grid_disk(c, 5):
        if dist(c, n) <= MI2:
            market[n] = market.get(n, 0.0) + p

# 7. competition: drive-thru coffee within 1 and 2 miles (true distance from the store to the hex centre)
dt1, dt2, du2 = {}, {}, {}
for c, b, la, lo in zip(shops.h3, shops.brand, shops.lat, shops.lon):
    for n in h3.grid_disk(c, 5):
        m = h3.great_circle_distance((la, lo), cc(n), unit="m")
        if m <= MI2:
            dt2[n] = dt2.get(n, 0) + 1
            if b == "Dutch Bros": du2[n] = du2.get(n, 0) + 1
        if m <= MI1:
            dt1[n] = dt1.get(n, 0) + 1

# county for every hex: own, else the most common county within ring 2
cty = dict(zip(pop.h3, pop.county))
def county_of(c):
    if c in cty: return cty[c]
    for n in h3.grid_disk(c, 2):
        if n in cty: return cty[n]

# 8. candidates: on an arterial (0.3 km+ in the hex) with 10,000+ people within 2 miles
d = roads[roads.road_km >= 0.3].copy()
d["pop_2mi"] = d.h3.map(market).fillna(0)
d = d[d.pop_2mi >= 10000]
d = d.merge(places, on="h3", how="left").merge(bldg, on="h3", how="left").fillna({"places": 0, "buildings": 0})
d["dt_1mi"] = d.h3.map(dt1).fillna(0).astype(int)
d["dt_2mi"] = d.h3.map(dt2).fillna(0).astype(int)
d["dutch_2mi"] = d.h3.map(du2).fillna(0).astype(int)
d["county"] = d.h3.map(county_of)
d = d[d.county.notna()]

# 9. score: demand index x openness.
#    demand (0-1) = 55% people within 2 mi, 15% places in hex, 10% buildings in hex, 20% arterial km in hex (percentile ranks)
#    openness = 1 / (1 + 0.25 x other drive-thru coffee within 2 mi + 1 x Dutch Bros within 2 mi)
pr = lambda s: (s.rank(method="min") - 1) / (len(s) - 1)
d["demand"] = 0.55 * pr(d.pop_2mi) + 0.15 * pr(d.places) + 0.10 * pr(d.buildings) + 0.20 * pr(d.road_km)
d["openness"] = 1 / (1 + 0.25 * (d.dt_2mi - d.dutch_2mi) + 1.0 * d.dutch_2mi)
d["score"] = (100 * d.demand * d.openness).round(1)
d["market"] = 1
d.loc[(d.dutch_2mi == 0) & (d.dt_2mi <= 1), "market"] = 0
d.loc[(d.dutch_2mi > 0) | (d.dt_2mi >= 4), "market"] = 2
print("candidates", len(d), d.market.value_counts().sort_index().to_dict())

cn = counties.set_index("GEOID")
ST = {"04": "AZ", "06": "CA", "32": "NV", "35": "NM"}
clist = sorted(d.county.unique())
cidx = {g: i for i, g in enumerate(clist)}
cnames = [f"{cn.loc[g, 'NAME']} County, {ST[cn.loc[g, 'STATEFP']]}" if g in cn.index else "" for g in clist]
cnames = [c.replace("Carson City County", "Carson City") for c in cnames]
d.to_parquet(S / "scored.parquet")

cells = [[r.h3, float(r.score), int(r.market), int(round(r.pop_2mi, -2)), int(r.dt_1mi), int(r.dt_2mi), int(r.dutch_2mi),
          int(round(r.road_km * 10)), int(r.places), int(r.buildings), cidx[r.county]] for r in d.itertuples()]

# top white-space hexes: best per ~5-mile area, nearest city name for a label
cities = rd("cities").dropna(subset=["population"]).sort_values("population", ascending=False)
def near_city(lat, lon):
    best, bd = None, 1e9
    for r in cities.itertuples():
        dd = (r.lat - lat) ** 2 + ((r.lon - lon) * math.cos(math.radians(lat))) ** 2
        if dd < bd: best, bd = r, dd
    km = math.sqrt(bd) * 111
    return best.name if km < 12 else f"near {best.name}"
ws = d[d.market == 0].sort_values("score", ascending=False)
picked = []
for r in ws.itertuples():
    lat, lon = h3.cell_to_latlng(r.h3)
    if all(h3.great_circle_distance((lat, lon), (p["lat"], p["lon"]), unit="km") > 8 for p in picked):
        st = ST[cn.loc[r.county, "STATEFP"]]
        picked.append({"label": f"{near_city(lat, lon)}, {st}", "lat": round(lat, 4), "lon": round(lon, 4),
                       "score": float(r.score), "pop": int(round(r.pop_2mi, -2)), "h3": r.h3})
    if len(picked) == 15: break
# known caveats a reader should see next to a pick
CAVEATS = {"Altadena": "2020 Census count; much of Altadena burned in the January 2025 Eaton Fire"}
for p in picked:
    for k, v in CAVEATS.items():
        if k in p["label"]: p["note"] = v
for p in picked: print(p)

bl = [b for b, _ in BRANDS]
sh = [[round(r.lon, 5), round(r.lat, 5), 1 if r.brand == "Dutch Bros" else 0, bl.index(r.brand)] for r in shops.itertuples()]
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "data.js").write_text("window.WS=" + json.dumps({"cells": cells, "counties": cnames, "shops": sh, "brands": bl, "top": picked},
                                                      separators=(",", ":")) + ";\n")

# basemap: states, study area, county lines, freeways, city labels
gj = lambda f: json.loads((BASE / f).read_text())
states = gj("states.geojson")
lab = {"AZ": [-111.7, 34.4], "NM": [-106.1, 34.5], "NV": [-116.8, 39.2], "CA": [-119.6, 36.9], "UT": [-111.6, 39.3],
       "CO": [-105.6, 38.9], "TX": [-104.6, 31.6], "OR": [-120.5, 42.6]}
names = {f["properties"]["STUSPS"]: f["properties"]["NAME"] for f in states["features"]}
state_labels = [{"t": names[k].upper(), "p": v} for k, v in lab.items() if k in names] + [{"t": "MEXICO", "p": [-110.5, 30.3]}, {"t": "Pacific Ocean", "p": [-120.3, 33.2]}]
fw = rd("freeways")
from shapely import wkt as W
feats = []
for g in fw.wkt:
    geom = W.loads(g)
    coords = [[round(x, 3), round(y, 3)] for x, y in geom.coords]
    if len(coords) >= 2: feats.append(coords)
freeways = {"type": "Feature", "properties": {}, "geometry": {"type": "MultiLineString", "coordinates": feats}}
ci = []
for r in cities.itertuples():  # largest first; a city is demoted if a bigger label sits close by
    rank = 1 if r.population >= 400000 else 2 if r.population >= 120000 else 3
    for q in ci:
        dkm = h3.great_circle_distance((r.lat, r.lon), (q["p"][1], q["p"][0]), unit="km")
        if q["r"] <= rank and dkm < (70 if rank == 1 else 25 if rank == 2 else 8):
            rank += 1
    if rank <= 3:
        ci.append({"t": r.name, "p": [round(r.lon, 3), round(r.lat, 3)], "r": rank})
base = {"states": states, "area": gj("area.geojson"), "counties": gj("counties.geojson"), "freeways": freeways,
        "stateLabels": state_labels, "cities": ci}
(OUT / "basemap.js").write_text("window.BASE=" + json.dumps(base, separators=(",", ":")) + ";\n")
print({f: (OUT / f).stat().st_size for f in ["data.js", "basemap.js"]})
