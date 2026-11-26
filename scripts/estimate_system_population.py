#!/usr/bin/env python3
"""
Parish-based ONS population estimator (see ../POPULATION-CAPACITY-METHOD.md §2-5).

Pulls Census 2021 resident population to the parish level using the ONS best-fit method
(Output-Area population assigned to the parish whose polygon contains the OA centroid), then
seeds each sewage system's base population P = sum of the distinct parishes its assets fall in.

Pipeline:
  1. Every England & Wales OA centroid (ONS) + Census 2021 usual residents (NOMIS TS001), fetched
     once into a local cache (OA_CACHE, default ~/.cache/riverhub/oa2021.csv); the river's bbox OAs.
  2. Emit idempotent, portable SQL that, in PostGIS:
       - loads the OA points + population into a temp table,
       - sets parishes.census_2021_population = sum of OA pop whose centroid is in the parish,
       - upserts system_assumptions.ons_population = sum of the distinct parishes containing the
         system's geocoded assets (preserving any user-tuned g/low/high/override on conflict),
       - for systems with an overflow outside every parish (unparished London, sea outfalls), replaces
         that with the residents inside the system's works catchment (needs WWCA_DIR).

Usage:
    python3 estimate_system_population.py > /tmp/system_pop.sql
    docker run --rm -i --network host postgres:16 psql "$DB_URL" < /tmp/system_pop.sql

The geometry/point-in-polygon is done in SQL, so no Python geo deps are needed. Re-running it is
the "refresh from ONS" for parish populations; the in-app button recomputes system totals via the
system_ons_population() RPC once parish populations are loaded.
"""
import csv, json, os, sys, ssl, time, urllib.error, urllib.parse, urllib.request

# Public open-data GET endpoints; this Python build lacks a root-cert bundle.
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE

import catchment_config

_CC = catchment_config.load()
_S, _W, _N, _E = _CC["geo"]["bbox"]
BBOX = {"lon_min": _W, "lon_max": _E, "lat_min": _S, "lat_max": _N}

# ONS Output Areas (Dec 2021) EW BFE (V9) — public FeatureServer, carries OA21CD + LAT/LONG
# (population-weighted centroid) directly. Replaced the former Output_Areas_2021_EW_BGC_V2 layer,
# which ONS made token-gated (returns `error 499 Token Required` → silently 0 OAs). See
# NATIONAL-ONBOARDING.md §4. NB this service's layer id is 3 (not 0).
OA_SERVICE = ("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
              "OA_2021_EW_BFE_V9_RUC/FeatureServer/3/query")
# NOMIS Census 2021 TS001 (number of usual residents). C2021_RESTYPE_3=0 -> all usual residents.
NOMIS = ("https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1.data.csv"
         "?geography={codes}&measures=20100&date=latest&C2021_RESTYPE_3=0"
         "&select=GEOGRAPHY_CODE,OBS_VALUE")
# every 2021 OA in England & Wales, 25,000 rows a page
NOMIS_ALL = ("https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1.data.csv"
             "?geography=TYPE150&measures=20100&date=latest&C2021_RESTYPE_3=0"
             "&select=GEOGRAPHY_CODE,OBS_VALUE&recordoffset={offset}")
WWCA_PROVENANCE = "ONS Census 2021 OA centroids inside the works catchment (wastewater catchment areas)"

PROVENANCE = f"ONS Census 2021 OA->parish best-fit centroid ({_CC['river']} bbox)"


def get(url, params=None, tries=6):
    """Fetch with backoff. NOMIS (406/429) and the ONS ArcGIS service (5xx, and a spurious
    {"error": {"code": 400}} body) throttle when several rivers load at once."""
    full = f"{url}?{urllib.parse.urlencode(params)}" if params else url
    for attempt in range(1, tries + 1):
        try:
            with urllib.request.urlopen(full, timeout=120, context=_SSL) as r:
                raw = r.read()
            head = raw[:300].replace(b" ", b"")
            if attempt < tries and head.startswith(b'{"error"') and b'"code":400' in head:
                raise urllib.error.URLError("ArcGIS error 400 (throttled?)")
            return raw
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            code = getattr(e, "code", None)
            if attempt == tries or (code is not None and code not in (406, 429, 500, 502, 503, 504)):
                raise
            wait = min(60, 5 * 2 ** (attempt - 1))
            print(f"-- WARN {e}; retry {attempt}/{tries - 1} in {wait}s", file=sys.stderr)
            time.sleep(wait)


def sql_lit(s):
    return "'" + s.replace("'", "''") + "'"


# Every England & Wales OA (code, lon, lat, BNG easting/northing, residents), fetched once and cached
# (~95 ONS pages + 8 NOMIS pages). The works-catchment method needs OAs far outside one river's bbox
# (a London works serves millions), which per-river fetching can't do at a sane request count.
OA_CACHE = os.path.expanduser(os.environ.get("OA_CACHE", "~/.cache/riverhub/oa2021.csv"))


def national_oas():
    if os.path.exists(OA_CACHE):
        with open(OA_CACHE) as f:
            return [(r["code"], float(r["lon"]), float(r["lat"]), float(r["e"]), float(r["n"]), int(r["pop"]))
                    for r in csv.DictReader(f)]
    print(f"-- building OA cache {OA_CACHE} (one-off, a few minutes)", file=sys.stderr)
    pts, offset = {}, 0
    while True:
        d = json.loads(get(OA_SERVICE, {"where": "1=1", "outFields": "OA21CD,LAT,LONG,BNG_E,BNG_N",
                                        "orderByFields": "FID", "returnGeometry": "false",
                                        "resultOffset": offset, "resultRecordCount": 2000, "f": "json"}))
        if d.get("error"):
            sys.exit(f"OA service error from {OA_SERVICE}: {d['error']}")
        feats = d.get("features", [])
        for ft in feats:
            a = ft["attributes"]
            pts[a["OA21CD"]] = (float(a["LONG"]), float(a["LAT"]), float(a["BNG_E"]), float(a["BNG_N"]))
        if len(feats) < 2000:
            break
        offset += 2000
    pop, offset = {}, 0
    while True:
        lines = get(NOMIS_ALL.format(offset=offset)).decode("utf-8", "replace").splitlines()[1:]
        for line in lines:
            parts = [x.strip().strip('"') for x in line.split(",")]
            if len(parts) >= 2 and parts[0]:
                pop[parts[0]] = int(float(parts[1]))
        if len(lines) < 25000:
            break
        offset += 25000
    rows = [(c, *pts[c], pop[c]) for c in pts if c in pop]
    if len(rows) < 150000:
        sys.exit(f"OA cache build got only {len(rows)} OAs with population (ONS {len(pts)}, NOMIS {len(pop)})")
    os.makedirs(os.path.dirname(OA_CACHE), exist_ok=True)
    with open(OA_CACHE + ".tmp", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code", "lon", "lat", "e", "n", "pop"])
        w.writerows(rows)
    os.replace(OA_CACHE + ".tmp", OA_CACHE)
    return rows


def works_catchment_extent(local_oas):
    """BNG bbox covering every WWCA works catchment of this company that reaches the river's bbox.
    The river bbox in BNG comes from its own OAs' eastings/northings (no projection library needed)."""
    wdir = os.environ.get("WWCA_DIR")
    if not wdir:
        return None
    import shapefile  # pyshp (importer venv); the parish method works without it
    from import_sewage_systems import company_key
    ckey = company_key(_CC["company"]["name"])
    pad = 2000
    e0 = min(o[3] for o in local_oas) - pad; e1 = max(o[3] for o in local_oas) + pad
    n0 = min(o[4] for o in local_oas) - pad; n1 = max(o[4] for o in local_oas) + pad
    sf = shapefile.Reader(os.path.join(wdir, "catchments_consolidated"))
    ci = [f[0] for f in sf.fields[1:]].index("company")
    box = None
    for i, rec in enumerate(sf.iterRecords()):
        if rec[ci] != ckey:
            continue
        x0, y0, x1, y1 = sf.shape(i).bbox
        if x1 < e0 or x0 > e1 or y1 < n0 or y0 > n1:
            continue
        box = [x0, y0, x1, y1] if box is None else [min(box[0], x0), min(box[1], y0), max(box[2], x1), max(box[3], y1)]
    return box


def _insert(table, rows):
    for i in range(0, len(rows), 500):
        vals = ",\n  ".join(f"({sql_lit(c)},{p},ST_SetSRID(ST_Point({lon},{lat}),4326))"
                            for (c, lon, lat, p) in rows[i:i + 500])
        print(f"insert into {table}(code,pop,geom) values\n  {vals};")


def main():
    allo = national_oas()
    inbox = [o for o in allo if BBOX["lon_min"] <= o[1] <= BBOX["lon_max"] and BBOX["lat_min"] <= o[2] <= BBOX["lat_max"]]
    if not inbox:
        sys.exit(f"0 OAs in the catchment bbox {BBOX} — check the bbox.")
    print(f"-- {len(inbox)} OA centroids in {_CC['river']} bbox", file=sys.stderr)
    rows = [(c, lon, lat, p) for (c, lon, lat, _e, _n, p) in inbox]
    print(f"-- total residents across bbox OAs: {sum(r[3] for r in rows)}", file=sys.stderr)
    box = works_catchment_extent(inbox)
    wide = []
    if box:
        wide = [(c, lon, lat, p) for (c, lon, lat, e, n, p) in allo
                if box[0] <= e <= box[2] and box[1] <= n <= box[3]]
        print(f"-- {len(wide)} OAs within the works catchments reaching the river", file=sys.stderr)

    print("-- River Hub: parish census population + system base population P")
    print("-- Generated by scripts/estimate_system_population.py. Idempotent; re-run to refresh.")
    print("begin;")
    print("create temp table _oa (code text primary key, pop int, geom geometry(Point,4326)) "
          "on commit drop;")
    _insert("_oa", rows)
    print("create index on _oa using gist (geom);")

    # parish census population = sum of OA pop whose centroid falls in the parish polygon
    print("""
update parishes p set census_2021_population = sub.pop
from (
  select pa.id, coalesce(sum(o.pop),0) as pop
  from parishes pa
  join _oa o on ST_Contains(pa.boundary, o.geom)
  where pa.boundary is not null
  group by pa.id
) sub
where p.id = sub.id;""")

    # system base population P = sum of distinct parishes containing the system's geocoded assets
    print(f"""
insert into system_assumptions (system_id, organisation_id, ons_population, ons_calculated_at, ons_source)
select s.id, s.organisation_id,
  (select coalesce(sum(pp.census_2021_population),0)::int
     from (
       select distinct p.id, p.census_2021_population
       from parishes p
       join sewage_assets a
         on a.sewage_system_id = s.id
        and a.latitude is not null and a.longitude is not null
        and ST_Contains(p.boundary, ST_SetSRID(ST_Point(a.longitude,a.latitude),4326))
       where p.census_2021_population is not null
     ) pp),
  now(), {sql_lit(PROVENANCE)}
from sewage_systems s
on conflict (system_id) do update
  set ons_population    = excluded.ons_population,
      ons_calculated_at = excluded.ons_calculated_at,
      ons_source        = excluded.ons_source;""")

    # Works-catchment population for systems the parish method can't see: any system with an overflow
    # outside every parish (London is unparished; sea outfalls lie beyond parish polygons). P = residents
    # whose OA centroid lies inside the system's own works catchment (wastewater_catchments, loaded by the
    # systems step), which is the population the works actually serves.
    if wide:
        org = sql_lit(_CC["org_id"]) + "::uuid"
        print("create temp table _oaw (code text primary key, pop int, geom geometry(Point,4326)) on commit drop;")
        _insert("_oaw", wide)
        print("create index on _oaw using gist (geom);")
        print(f"""
with unparished as (
  select distinct s.id, s.catchment_identifier
  from sewage_systems s
  join sewage_assets a on a.sewage_system_id = s.id
   and a.latitude is not null and a.longitude is not null
  where s.organisation_id = {org} and s.catchment_identifier is not null
    and not exists (select 1 from parishes p
                    where ST_Contains(p.boundary, ST_SetSRID(ST_Point(a.longitude,a.latitude),4326)))
), wpop as (
  select u.id, coalesce(sum(o.pop),0)::int as pop
  from unparished u
  join wastewater_catchments c on c.organisation_id = {org} and c.identifier = u.catchment_identifier
  left join _oaw o on ST_Contains(c.geom, o.geom)
  group by u.id
)
update system_assumptions sa
   set ons_population = w.pop, ons_calculated_at = now(), ons_source = {sql_lit(WWCA_PROVENANCE)}
  from wpop w
 where sa.system_id = w.id and w.pop > 0;""")
        print(f"select 'works-catchment population: ' || count(*) || ' systems' from system_assumptions sa "
              f"join sewage_systems s on s.id = sa.system_id where s.organisation_id = {org} "
              f"and sa.ons_source = {sql_lit(WWCA_PROVENANCE)};")
    print("commit;")


if __name__ == "__main__":
    main()
