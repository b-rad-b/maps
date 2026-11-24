"""Score one brand's white space and write its page data.

usage: python build_brand.py BRAND STAGES_DIR OUT_ROOT
Stage files (Parquet, from Wherobots; see stages.sql): acs8, pop8, roads8, places8, bldg8, brandplaces, fsqplaces, counties, cities.
Writes OUT_ROOT/BRAND/data.js and index.html, and STAGES_DIR/scored_BRAND.parquet.
"""
import json, math, sys
from pathlib import Path
import h3, numpy as np, pandas as pd
from scipy.spatial import cKDTree
from brands import BRANDS, MI

slug, S, OUT = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
B = BRANDS[slug]
HERE = Path(__file__).parent
rd = lambda n: pd.read_parquet(S / f"{n}.parquet")
hx = lambda v: h3.int_to_str(int(v)) if not isinstance(v, str) else v
R_EARTH = 6371008.8

def xyz(lat, lon):
    la, lo = np.radians(np.asarray(lat, float)), np.radians(np.asarray(lon, float))
    return np.c_[np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)]
chord = lambda m: 2 * math.sin(m / R_EARTH / 2)
def centres(cells):
    ll = np.array([h3.cell_to_latlng(c) for c in cells])
    return ll[:, 0], ll[:, 1]

# --- inputs
pop8 = rd("pop8"); pop8["h3"] = pop8.h3.map(hx)             # study-area hexes with their county
acs = rd("acs8"); acs["h3"] = acs.h3.map(hx)                  # people, households, income, education, age per hex
acs = acs.merge(pop8[["h3", "county"]], on="h3")              # keep the study area only
roads = rd("roads8"); roads["h3"] = roads.h3.map(hx)
places = rd("places8"); places["h3"] = places.h3.map(hx)
bldg = rd("bldg8"); bldg["h3"] = bldg.h3.map(hx)
counties = rd("counties").set_index("GEOID")
ST = {"04": "AZ", "06": "CA", "32": "NV", "35": "NM"}

if B.get("places"):                          # a brand-specific pull that already merges Overture and Foursquare
    p = rd(B["places"])
    p["lname"] = p.name.fillna("").str.lower().str.replace("’", "'").str.strip()
    p["lbrand"] = p.brand.fillna("").str.lower().str.strip()
    p["tax"] = p.tax.fillna(""); p["basic_category"] = p.basic_category.fillna("")
else:
    p = None
if p is None:
    p = rd("brandplaces")
    p["lname"] = p.name.fillna("").str.lower().str.strip()
    p["lbrand"] = p.brand.fillna("").str.lower().str.strip()
    p["tax"] = p.tax.fillna("")
    p["basic_category"] = p.basic_category.fillna("")
    # Foursquare Open Source Places fills gaps in Overture's chain coverage. Rows are mapped to the same columns.
    f = rd("fsqplaces")
    fb = f.name.str.lower().str.replace("’", "'")
    f["brand"] = np.select([fb.str.startswith("sprouts farmers"), fb.str.startswith("whole foods market"), fb.str.startswith("trader joe"),
                            fb.str.startswith("natural grocers"), fb.str.startswith("the joint"), fb.str.startswith("optimyze")],
                           ["Sprouts Farmers Market", "Whole Foods Market", "Trader Joe's", "Natural Grocers", "The Joint Chiropractic", "Optimyze"], default="")
    f = f[f.brand != ""].assign(basic_category="", tax="", confidence=1.0, lname=fb.str.strip(), src="fsq")
    f["lbrand"] = f.brand.str.lower()
    p["src"] = "overture"
    p = pd.concat([p, f[["name", "brand", "basic_category", "tax", "confidence", "lon", "lat", "lname", "lbrand", "src"]]], ignore_index=True)
p_all = p
p = p[p.confidence.fillna(1) >= 0.5]
_ = p                                  # the brand's own stores are kept at any confidence
p = p[p.confidence.fillna(1) >= 0.5]

def dedupe(d, m=60, same_brand=False):
    """Overture sometimes has two records for one store: keep one per 60 m (same normalised name)."""
    if not len(d): return d
    d = d.reset_index(drop=True)
    t = cKDTree(xyz(d.lat, d.lon)); drop = set()
    for i, j in sorted(t.query_pairs(chord(m))):
        if i not in drop and (same_brand or d.lname[i][:8] == d.lname[j][:8]): drop.add(j)
    return d.drop(index=list(drop))
own = dedupe(p_all[B["own"](p_all)].copy(), 250, True)
comp = dedupe(p[B["comp"](p) & ~B["own"](p)].copy(), B.get("comp_dedupe_m", 60))   # name-prefix match keeps different brands apart
if "own_extra" in B:
    own = pd.concat([own, pd.DataFrame(B["own_extra"])], ignore_index=True)

# --- candidates: 0.3 km+ of arterial in the hex, inside the study area
cty = dict(zip(pop8.h3, pop8.county))
def county_of(c):
    if c in cty: return cty[c]
    for n in h3.grid_disk(c, 2):
        if n in cty: return cty[n]
d = roads[roads.road_km >= 0.3].copy()
d["county"] = d.h3.map(county_of)
d = d[d.county.notna()]
if B["counties"]: d = d[d.county.isin(B["counties"])]
d = d.merge(places, on="h3", how="left").merge(bldg, on="h3", how="left").fillna({"places": 0, "buildings": 0}).reset_index(drop=True)
d["lat"], d["lon"] = centres(d.h3)

# --- trade-area sums within the radius (true distance between hex centres)
R = B["radius_mi"] * MI
tc = cKDTree(xyz(d.lat, d.lon))
alat, alon = centres(acs.h3)
M = tc.sparse_distance_matrix(cKDTree(xyz(alat, alon)), chord(R), output_type="coo_matrix").tocsr()
M.data[:] = 1.0
# a hex's own centre has distance 0 and is dropped by the sparse matrix: add it back
own_idx = pd.Series(np.arange(len(acs)), index=acs.h3.values)
for col in ["pop", "hh", "hh100", "hh150", "ba", "a2564"]:
    v = acs[col].fillna(0).to_numpy()
    d[col + "_r"] = M @ v + d.h3.map(lambda c: v[own_idx[c]] if c in own_idx.index else 0.0).to_numpy()
def count_within(stores):
    if not len(stores): return np.zeros(len(d))
    return np.array([len(x) for x in cKDTree(xyz(stores.lat, stores.lon)).query_ball_point(xyz(d.lat, d.lon), chord(R))], float)
d["inc_share"] = d.hh100_r / d.hh_r.clip(lower=1)
d["ba_share"] = d.ba_r / (d.pop_r * 0.68).clip(lower=1)      # adults 25+ are about 68% of residents
d["inc_pct"] = (100 * d.inc_share).round(); d["ba_pct"] = (100 * d.ba_share).clip(upper=100).round()
d["own_r"] = count_within(own)
d["comp_r"] = count_within(comp)

k, v = B["min_market"]
d = d[d[k] >= v].reset_index(drop=True)

# --- score = demand x openness; class
pr = lambda s: (s.rank(method="min") - 1) / max(len(s) - 1, 1)
d["demand"] = sum(w * pr(d[m]) for m, w in B["demand"].items())
d["openness"] = 1 / (1 + B["w_comp"] * d.comp_r + B["w_own"] * d.own_r)
d["score"] = (100 * d.demand * d.openness).round(1)
d["cls"] = 1
d.loc[(d.own_r == 0) & B["white"](d), "cls"] = 0
d.loc[d.own_r > 0, "cls"] = 2
d.to_parquet(S / f"scored_{slug}.parquet")
n = d.cls.value_counts().reindex([0, 1, 2]).fillna(0).astype(int).tolist()
print(slug, "own", len(own), "comp", len(comp), "candidates", len(d), "white/contested/served", n)

# --- top white-space areas, one per spacing_km, labelled by nearest city
cities = rd("cities").dropna(subset=["population"]).sort_values("population", ascending=False)
ct = cKDTree(xyz(cities.lat, cities.lon))
def label(lat, lon, county):
    dist, i = ct.query(xyz([lat], [lon]))
    km = 2 * math.asin(dist[0] / 2) * R_EARTH / 1000
    nm = cities.name.iloc[i[0]]
    st = ST[counties.loc[county, "STATEFP"]]
    return (nm if km < 10 else f"near {nm}") + f", {st}"
picked = []
for r in d[d.cls == 0].sort_values("score", ascending=False).itertuples():
    if all(h3.great_circle_distance((r.lat, r.lon), (q["lat"], q["lon"]), unit="km") > B["spacing_km"] for q in picked):
        picked.append({"label": label(r.lat, r.lon, r.county), "lat": round(r.lat, 4), "lon": round(r.lon, 4), "score": float(r.score), "h3": r.h3,
                       "vals": {f[1]: int(round(getattr(r, f[1]), -2 if f[2] == 100 else 0)) for f in B["fields"]},
                       "comp": int(r.comp_r)})
    if len(picked) == 15: break
xr = S / f"xstreets_{slug}.json"          # optional: cross streets for the picks (see cross_streets.py)
if xr.exists():
    xs = json.loads(xr.read_text())
    for q in picked:
        x = xs.get(q["h3"])
        if isinstance(x, dict):
            if x.get("at"): q["at"] = x["at"]
            if x.get("city"): q["label"] = x["city"] + q["label"][-4:]
(S / f"top_{slug}.json").write_text(json.dumps(picked, indent=1))
for q in picked: print(" ", q["label"], q.get("at", ""), q["score"], q["vals"], "comp", q["comp"])

# --- page data
clist = sorted(d.county.unique()); cidx = {g: i for i, g in enumerate(clist)}
cnames = [f"{counties.loc[g, 'NAME']} County, {ST[counties.loc[g, 'STATEFP']]}".replace("Carson City County", "Carson City") for g in clist]
rnd = lambda x, f: int(round(x / f) * f)
cells = [[r.h3, float(r.score), int(r.cls), cidx[r.county], int(r.own_r), int(r.comp_r), int(round(r.road_km * 10))]
         + [rnd(getattr(r, f[1]), f[2]) for f in B["fields"]] for r in d.itertuples()]
# stores inside (or within the radius of) the mapped area
lat0, lat1, lon0, lon1 = d.lat.min() - .1, d.lat.max() + .1, d.lon.min() - .1, d.lon.max() + .1
inb = lambda s: s[(s.lat.between(lat0, lat1)) & (s.lon.between(lon0, lon1))]
stores = [[round(r.lon, 5), round(r.lat, 5), 1, r.name] for r in inb(own).itertuples()] + \
         [[round(r.lon, 5), round(r.lat, 5), 0, r.name] for r in inb(comp).itertuples()]
names = sorted({s[3] for s in stores}); ni = {x: i for i, x in enumerate(names)}
for s in stores: s[3] = ni[s[3]]
metros = [["Phoenix", -112.0, 33.48, 9.6], ["Tucson", -110.93, 32.25, 10.2], ["Las Vegas", -115.17, 36.14, 10], ["Albuquerque", -106.62, 35.1, 10.2],
          ["Los Angeles", -118.2, 34.03, 9.2], ["Inland Empire", -117.35, 34.0, 9.6], ["San Diego", -117.1, 32.8, 9.8], ["Reno", -119.8, 39.53, 10.6]]
if B.get("metros"):
    metros = B["metros"]
elif B["counties"]:
    metros = [["Scottsdale", -111.9, 33.58, 10.8], ["East Valley", -111.75, 33.36, 10.6], ["West Valley", -112.3, 33.55, 10.6],
              ["North Phoenix", -112.07, 33.68, 10.8], ["Central Phoenix", -112.05, 33.49, 11]]
meta = {k: B[k] for k in ["title", "short", "brand", "concept", "comp_label", "comp_short", "demand_text", "min_text", "white_text", "contested_text", "area_text", "home"]}
meta.update(radius_mi=B["radius_mi"], n=n, n_own=len(inb(own)), n_comp=len(inb(comp)), fields=[f[0] for f in B["fields"]],
            field_keys=[f[1] for f in B["fields"]], field_pct=[f[1].endswith("_pct") for f in B["fields"]], metros=metros, local=bool(B["counties"]),
            w_comp=B["w_comp"], w_own=B["w_own"])
(OUT / slug).mkdir(parents=True, exist_ok=True)
(OUT / slug / "data.js").write_text("window.WS=" + json.dumps({"meta": meta, "cells": cells, "counties": cnames, "stores": stores, "names": names, "top": picked},
                                                               separators=(",", ":"), ensure_ascii=False) + ";\n")
html = (HERE / "page.html").read_text().replace("{{TITLE}}", B["short"]).replace("{{DESC}}", f"{B['title']} An independent public-data study of {B['area_text']}: Overture Maps and Census data scored into H3 hexagons with Wherobots (Apache Sedona) and drawn in 3D with deck.gl. Not affiliated with {B['brand']}.")
(OUT / slug / "index.html").write_text(html)
print(" data.js", (OUT / slug / "data.js").stat().st_size)
