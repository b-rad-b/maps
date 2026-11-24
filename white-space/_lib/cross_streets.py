"""Name the two main roads and the city at each top pick (Overture segments and divisions via Wherobots).
usage: python cross_streets.py BRAND STAGES_DIR   (needs WHEROBOTS_API_KEY)"""
import json, os, sys
from pathlib import Path
from wherobots.db import connect
from wherobots.db.region import Region
from wherobots.db.runtime import Runtime
slug, S = sys.argv[1], Path(sys.argv[2])
top = json.loads((S / f"top_{slug}.json").read_text())
xf = S / f"xstreets_{slug}.json"
out = json.loads(xf.read_text()) if xf.exists() else {}
out = {k: v for k, v in out.items() if isinstance(v, dict)}
top = [t for t in top if t["h3"] not in out]
with connect(api_key=os.environ["WHEROBOTS_API_KEY"], runtime=Runtime.TINY, region=Region.AWS_US_WEST_2, wait_timeout=900) as conn:
    cur = conn.cursor()
    for t in top:
        cur.execute(f"""
          SELECT names.primary AS name, class, SUM(ST_LengthSpheroid(ST_Intersection(geometry, hex))) AS m
          FROM wherobots_open_data.overture_maps_foundation.transportation_segment,
               (SELECT ST_H3ToGeom(ST_H3CellIDs(ST_Point({t['lon']}, {t['lat']}), 8, false))[0] AS hex) h
          WHERE bbox.xmin BETWEEN {t['lon'] - .02} AND {t['lon'] + .02} AND bbox.ymin BETWEEN {t['lat'] - .02} AND {t['lat'] + .02}
            AND subtype = 'road' AND class IN ('trunk','primary','secondary') AND names.primary IS NOT NULL
            AND ST_Intersects(geometry, hex)
          GROUP BY 1, 2 ORDER BY m DESC LIMIT 2""")
        r = cur.fetchall()
        names = [n for n in r["name"].tolist()]
        cur.execute(f"""
          SELECT names.primary AS name, ST_Area(geometry) AS a FROM wherobots_open_data.overture_maps_foundation.divisions_division_area
          WHERE bbox.xmin <= {t['lon']} AND bbox.xmax >= {t['lon']} AND bbox.ymin <= {t['lat']} AND bbox.ymax >= {t['lat']}
            AND subtype = 'locality' AND ST_Contains(geometry, ST_Point({t['lon']}, {t['lat']})) ORDER BY a LIMIT 1""")
        c = cur.fetchall()
        out[t["h3"]] = {"at": " & ".join(names), "city": c["name"].iloc[0] if len(c) else None}
        print(t["label"], "|", out[t["h3"]], flush=True)
xf.write_text(json.dumps(out, indent=1))
