#!/usr/bin/env python3
"""
Load the river-centreline network for the Dart area from OpenStreetMap (Overpass), for the
granular "river stretches" pollution layer. Emits idempotent SQL that loads segments into a temp
table and keeps only those intersecting the loaded Dart parish boundaries (drops neighbouring
catchments). Geometry/clipping is done in PostGIS, so no Python geo deps are needed.

Data © OpenStreetMap contributors (ODbL).

Usage:
    python3 import_rivers.py > /tmp/rivers.sql
    docker run --rm -i --network host postgres:16 psql "$DB_URL" < /tmp/rivers.sql   # local
    docker run --rm -i postgres:16 psql "$PROD_DB_URL" < /tmp/rivers.sql             # prod
"""
import ssl, sys, time, json, urllib.request, urllib.parse

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
import catchment_config

# bbox (south, west, north, east) from the catchment config.
BBOX = tuple(catchment_config.load()["geo"]["bbox"])
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]
# split into lighter queries (the ~2.5k streams alone can time the server out as one request)
GROUPS = ["river|canal|tidal_channel", "stream|ditch|drain"]


def _query(filt):
    q = ('[out:json][timeout:180];'
         f'(way["waterway"~"^({filt})$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}););out geom;')
    last = None
    for attempt in range(4):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(),
                                         headers={"User-Agent": "RiverHub/1.0 (Friends of the Dart)"})
            with urllib.request.urlopen(req, timeout=240, context=_SSL) as r:
                return json.load(r).get("elements", [])
        except Exception as e:  # noqa: BLE001
            last = e
            print(f"-- WARN {ep} ({filt}) attempt {attempt+1}: {e}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    sys.exit(f"Overpass unavailable for {filt}: {last}")


def fetch():
    els = []
    for g in GROUPS:
        els += _query(g)
        time.sleep(2)
    return els


def lit(s):
    return "NULL" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"


def main():
    els = fetch()
    rows = []
    for e in els:
        geom = e.get("geometry") or []
        pts = [(p["lon"], p["lat"]) for p in geom if "lon" in p and "lat" in p]
        if len(pts) < 2:
            continue
        coords = ",".join(f"[{lon},{lat}]" for lon, lat in pts)
        gj = f'{{"type":"LineString","coordinates":[{coords}]}}'
        t = e.get("tags", {})
        rows.append((e.get("id"), t.get("name"), t.get("waterway"), gj))
    print(f"-- {len(rows)} river ways fetched from OSM", file=sys.stderr)

    out = ["-- River Hub: OSM river centrelines for the Dart (clipped to parish boundaries)",
           "-- Data (c) OpenStreetMap contributors (ODbL).", "begin;",
           "create temp table _riv (osm_id bigint, name text, waterway text, geom geometry(LineString,4326)) on commit drop;"]
    B = 200
    for i in range(0, len(rows), B):
        vals = ",\n  ".join(
            f"({osm or 'NULL'},{lit(name)},{lit(ww)},ST_SetSRID(ST_GeomFromGeoJSON({lit(gj)}),4326))"
            for osm, name, ww, gj in rows[i:i + B]
        )
        out.append(f"insert into _riv(osm_id,name,waterway,geom) values\n  {vals};")
    # keep only segments intersecting the Dart parish boundaries; refresh idempotently
    out.append("delete from river_segments;")
    out.append("""insert into river_segments (osm_id, name, waterway, geom)
  select r.osm_id, r.name, r.waterway, r.geom
  from _riv r
  where exists (select 1 from parishes p where p.boundary is not null and ST_Intersects(p.boundary, r.geom));""")
    out.append("select 'river_segments: ' || count(*) from river_segments;")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
