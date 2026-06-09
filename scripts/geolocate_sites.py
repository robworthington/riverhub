#!/usr/bin/env python3
"""
Geolocate test_sites that are missing coordinates, by matching their names against the FoD
locations tab (aggressive normalisation: strip survey numbering "1.", "Buoy"/"Pontoon" suffixes,
the OML->Old Mill Leat abbreviation, typos, and a few explicit aliases). Updates lat/long in
place (no new sites, no result changes) and re-assigns parish by PostGIS point-in-polygon
(+ nearest-parish fallback <=2 km).

Usage:
    # feed the ungeocoded site names (one per line) on stdin:
    docker run --rm -i --network host postgres:16 psql "$DB_URL" -t -A \
      -c "select name from test_sites where organisation_id='00000000-0000-0000-0000-000000000001' and latitude is null" \
      | python3 scripts/geolocate_sites.py > /tmp/geo.sql
    docker run --rm -i --network host postgres:16 psql "$DB_URL" < /tmp/geo.sql
"""
import ssl, sys, csv, io, re, urllib.request, urllib.parse

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
SID = "1VtHhOAKAEms_M_7VZYkoQ1mMB5wBCa1Za1zXktLL9EI"
LOCATIONS_GID = "557535287"
ORG = "00000000-0000-0000-0000-000000000001"

ALIAS = {"darlington": "dartington", "marble": "mardle", "torbyran": "torbryan",
         "villlage": "village", "broadhemston": "broadhempston"}
SAMPLE_TO_LOC = {
    "stoke gabriel downstream": "stoke gabriel",
    "stoke gabriel": "stoke gabriel",
    "ambrook confluence us": "ambrook us",
    "torbryan #2": "torbryan stream",
    "torbryan": "torbryan stream",
}


def norm(s):
    s = (s or "").lower().strip()
    s = re.sub(r",?\s*dart estuary$", "", s)
    s = re.sub(r"^\d+\.\s*", "", s)            # "1. Steamer Quay" -> "steamer quay"
    s = re.sub(r"\s+(buoy|pontoon)$", "", s)    # "Bow Creek Buoy" -> "bow creek"
    s = re.sub(r"\boml\b", "old mill leat", s)  # OML abbreviation
    s = re.sub(r"\s+", " ", s).strip()
    for a, b in ALIAS.items():
        s = s.replace(a, b)
    return s


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    locs = {}
    for r in csv.reader(io.StringIO(urllib.request.urlopen(
            f"https://docs.google.com/spreadsheets/d/{SID}/gviz/tq?" + urllib.parse.urlencode({"tqx": "out:csv", "gid": LOCATIONS_GID}),
            timeout=90, context=_SSL).read().decode("utf-8", "replace"))):
        if len(r) > 11 and r[9].strip():
            try:
                lat, lon = float(r[10]), float(r[11])
            except (ValueError, IndexError):
                continue
            locs[norm(r[9])] = (lat, lon, r[15].strip() if len(r) > 15 else "")

    names = [ln.strip() for ln in sys.stdin if ln.strip()]
    matched, unmatched = [], []
    for name in names:
        n = norm(name)
        n = SAMPLE_TO_LOC.get(n, n)
        if n in locs:
            matched.append((name, locs[n]))
        else:
            unmatched.append(name)

    print(f"-- geolocate: {len(matched)} matched, {len(unmatched)} still need coordinates", file=sys.stderr)
    for u in unmatched:
        print(f"--   no coords: {u}", file=sys.stderr)

    print("begin;")
    for name, (lat, lon, osgr) in matched:
        print(f"update test_sites set latitude={lat}, longitude={lon}"
              f"{f', os_grid_ref={lit(osgr)}' if osgr else ''} "
              f"where organisation_id={lit(ORG)} and name={lit(name)} and latitude is null;")
    # (re)assign parish for any newly-geolocated sites
    print(f"""
update test_sites t set parish_id = p.id
from parishes p
where t.organisation_id={lit(ORG)} and t.parish_id is null
  and t.latitude is not null and p.boundary is not null
  and ST_Contains(p.boundary, ST_SetSRID(ST_Point(t.longitude, t.latitude), 4326));
update test_sites t set parish_id = nn.pid
from (
  select t2.id sid,
    (select p.id from parishes p where p.boundary is not null
       order by p.boundary <-> ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326) limit 1) pid,
    (select ST_Distance(p.boundary::geography, ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326)::geography)
       from parishes p where p.boundary is not null
       order by p.boundary <-> ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326) limit 1) dist
  from test_sites t2
  where t2.organisation_id={lit(ORG)} and t2.parish_id is null and t2.latitude is not null
) nn
where t.id = nn.sid and nn.dist < 2000;""")
    print("commit;")


if __name__ == "__main__":
    main()
