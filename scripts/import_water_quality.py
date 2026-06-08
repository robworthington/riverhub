#!/usr/bin/env python3
"""
Friends of the Dart water-quality importer.

Reads the FoD Google Sheet (public): the `samples` tab (one lab result per row) and the
locations tab (site coordinates), and emits idempotent, portable SQL that:
  1. upserts test_sites (geolocated from the locations tab by normalised name; sites with no
     coordinate are still created and reported so coordinates can be added later),
  2. assigns each geolocated site to a parish by PostGIS point-in-polygon,
  3. upserts test_results for E. coli and intestinal enterococci, preserving the qualifier
     (= / < / >) and mapping the Collection column to a test type + collecting organisation.

Re-running is safe: results dedupe on a deterministic source_ref; sites match on name.

Usage:
    python3 import_water_quality.py > /tmp/wq.sql
    docker run --rm -i --network host postgres:16 psql "$DB_URL" < /tmp/wq.sql   # local
    docker run --rm -i postgres:16 psql "$PROD_DB_URL" < /tmp/wq.sql             # prod
"""
import ssl, sys, csv, io, re, urllib.request, urllib.parse, collections

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
SID = "1VtHhOAKAEms_M_7VZYkoQ1mMB5wBCa1Za1zXktLL9EI"
LOCATIONS_GID = "557535287"
ORG = "00000000-0000-0000-0000-000000000001"

# typo fixes applied during name normalisation
ALIAS = {"darlington": "dartington", "marble": "mardle", "torbyran": "torbryan",
         "villlage": "village", "broadhemston": "broadhempston"}
# normalised sample label -> normalised location key (for names that don't match directly)
SAMPLE_TO_LOC = {
    "totnes upstream (below the weir)": "totnes upstream",
    "tripes copse": "tripe's copse stream",
    "torbryan": "torbryan stream",
    "broadhempston us": "broadhempston stw us",
    "broadhempston ds": "broadhempston stw ds",
}

TT_ECOLI_CULTURE = "E. coli (culture)"
TT_ECOLI_PETRI = "E. coli (Petrifilm)"
TT_IE_CULTURE = "Intestinal enterococci (culture)"


def fetch(params):
    url = f"https://docs.google.com/spreadsheets/d/{SID}/gviz/tq?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120, context=_SSL) as r:
        return r.read().decode("utf-8", "replace")


def norm(s):
    s = (s or "").lower().strip()
    s = re.sub(r",?\s*dart estuary$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    for a, b in ALIAS.items():
        s = s.replace(a, b)
    return s


def collection_to(coll):
    """Return (organisation_collecting, [(test_type, qualifier_col, count_col), ...])."""
    c = (coll or "").strip()
    if c.lower().startswith("fod petri"):
        return "Friends of the Dart", [(TT_ECOLI_PETRI, 8, 9)]
    org = "Environment Agency" if c == "EA" else "Friends of the Dart"
    # culture collections carry both E. coli and intestinal enterococci
    return org, [(TT_ECOLI_CULTURE, 8, 9), (TT_IE_CULTURE, 6, 7)]


_MON = {m: f"{i:02d}" for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def parse_dt(sample_time, date_str):
    """Return (date 'YYYY-MM-DD', time 'HH:MM:SS' or None)."""
    st = (sample_time or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?", st)
    if m:
        y, mo, d, hh, mm, ss = m.groups()
        tm = f"{int(hh):02d}:{mm}:{ss or '00'}" if hh is not None else None
        return f"{y}-{mo}-{d}", tm
    # fallback to the display Date column, e.g. "7 May 24"
    m = re.match(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2,4})", (date_str or "").strip())
    if m and m.group(2).lower() in _MON:
        d, mon, y = int(m.group(1)), _MON[m.group(2).lower()], m.group(3)
        y = y if len(y) == 4 else f"20{y}"
        return f"{y}-{mon}-{d:02d}", None
    return None, None


def lit(s):
    return "NULL" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"


def main():
    # ---- locations: normalised name -> (display, lat, lon, osgr) ----
    locs = {}
    for r in csv.reader(io.StringIO(fetch({"tqx": "out:csv", "gid": LOCATIONS_GID}))):
        if len(r) > 11 and r[9].strip():
            try:
                lat, lon = float(r[10]), float(r[11])
            except (ValueError, IndexError):
                continue
            osgr = r[15].strip() if len(r) > 15 else ""
            locs[norm(r[9])] = (r[9].strip(), lat, lon, osgr)
    print(f"-- {len(locs)} geolocated locations", file=sys.stderr)

    # ---- samples ----
    rows = list(csv.reader(io.StringIO(fetch({"tqx": "out:csv", "sheet": "samples"}))))[1:]
    print(f"-- {len(rows)} sample rows", file=sys.stderr)

    # canonicalise each raw label -> site dict
    sites = {}  # canonical_name -> {eu_bwid counter, tidal yes/total, lat, lon, osgr}
    label_to_site = {}
    for r in rows:
        raw = (r[2] if len(r) > 2 else "").strip()
        if not raw:
            continue
        n = norm(raw)
        n = SAMPLE_TO_LOC.get(n, n)
        if n in locs:
            disp, lat, lon, osgr = locs[n]
        else:
            disp = re.sub(r"\s+", " ", raw).strip()  # keep readable label; no coords
            lat = lon = None
            osgr = ""
        label_to_site[raw] = disp
        s = sites.setdefault(disp, {"bwid": collections.Counter(), "yes": 0, "tot": 0,
                                    "lat": lat, "lon": lon, "osgr": osgr})
        if lat is not None:
            s["lat"], s["lon"], s["osgr"] = lat, lon, osgr
        bw = (r[0] if len(r) > 0 else "").strip()
        if bw:
            s["bwid"][bw] += 1
        s["tot"] += 1
        if (r[3] if len(r) > 3 else "").strip().lower() == "yes":
            s["yes"] += 1

    geolocated = sum(1 for s in sites.values() if s["lat"] is not None)
    print(f"-- {len(sites)} distinct sites ({geolocated} geolocated, "
          f"{len(sites)-geolocated} need coordinates)", file=sys.stderr)

    # ---- emit SQL ----
    out = []
    out.append("-- River Hub: Friends of the Dart water-quality import (generated; idempotent)")
    out.append("begin;")
    out.append("create temp table _site (name text primary key, eu_bwid text, tidal boolean, "
               "lat double precision, lon double precision, osgr text) on commit drop;")
    vals = []
    for name, s in sites.items():
        bwid = s["bwid"].most_common(1)[0][0] if s["bwid"] else None
        tidal = "true" if s["tot"] and s["yes"] * 2 >= s["tot"] else "false"
        lat = s["lat"] if s["lat"] is not None else "NULL"
        lon = s["lon"] if s["lon"] is not None else "NULL"
        vals.append(f"({lit(name)},{lit(bwid)},{tidal},{lat},{lon},{lit(s['osgr'])})")
    for i in range(0, len(vals), 200):
        out.append("insert into _site(name,eu_bwid,tidal,lat,lon,osgr) values\n  "
                   + ",\n  ".join(vals[i:i+200]) + ";")

    # insert new sites
    out.append(f"""
insert into test_sites (organisation_id, name, type, tidal, eu_bwid, os_grid_ref, latitude, longitude)
select '{ORG}', s.name,
       case when s.eu_bwid is not null then 'bathing_water' else 'community_designated' end::site_type,
       coalesce(s.tidal,false), s.eu_bwid, nullif(s.osgr,''), s.lat, s.lon
from _site s
where not exists (select 1 from test_sites t where t.organisation_id='{ORG}' and t.name=s.name);""")
    # update geo/identity on existing matched-by-name sites
    out.append(f"""
update test_sites t set
  eu_bwid     = coalesce(t.eu_bwid, s.eu_bwid),
  os_grid_ref = coalesce(t.os_grid_ref, nullif(s.osgr,'')),
  tidal       = s.tidal,
  latitude    = coalesce(t.latitude, s.lat),
  longitude   = coalesce(t.longitude, s.lon)
from _site s
where t.organisation_id='{ORG}' and t.name=s.name;""")
    # assign parish by point-in-polygon
    out.append(f"""
update test_sites t set parish_id = p.id
from parishes p
where t.organisation_id='{ORG}' and t.parish_id is null
  and t.latitude is not null and t.longitude is not null
  and p.boundary is not null
  and ST_Contains(p.boundary, ST_SetSRID(ST_Point(t.longitude, t.latitude), 4326));""")
    # nearest-parish fallback for points not inside any polygon (e.g. tidal estuary sites),
    # capped at 2 km so we never attach a site to a far-away parish.
    out.append(f"""
update test_sites t set parish_id = nn.pid
from (
  select t2.id sid,
    (select p.id from parishes p where p.boundary is not null
       order by p.boundary <-> ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326) limit 1) pid,
    (select ST_Distance(p.boundary::geography,
            ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326)::geography)
       from parishes p where p.boundary is not null
       order by p.boundary <-> ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326) limit 1) dist
  from test_sites t2
  where t2.organisation_id='{ORG}' and t2.parish_id is null and t2.latitude is not null
) nn
where t.id=nn.sid and nn.dist < 2000;""")

    # ---- results ----
    res_vals = []
    skipped = 0
    for r in rows:
        raw = (r[2] if len(r) > 2 else "").strip()
        if not raw or raw not in label_to_site:
            continue
        site = label_to_site[raw]
        coll = (r[1] if len(r) > 1 else "").strip()
        org_coll, analytes = collection_to(coll)
        date, tm = parse_dt(r[4] if len(r) > 4 else "", r[5] if len(r) > 5 else "")
        if not date:
            skipped += 1
            continue
        for tt, qi, ci in analytes:
            q = (r[qi] if len(r) > qi else "").strip() or "="
            cnt = (r[ci] if len(r) > ci else "").strip()
            if not re.match(r"^\d+(\.\d+)?$", cnt):
                continue  # no value for this analyte on this row
            ref = f"fod|{site}|{date}|{tm or ''}|{coll}|{tt}"
            res_vals.append(
                f"('{ORG}',(select id from test_sites where organisation_id='{ORG}' and name={lit(site)} limit 1),"
                f"(select id from test_types where organisation_id='{ORG}' and test_name={lit(tt)} limit 1),"
                f"{lit(date)},{lit(tm)},{lit(org_coll)},{cnt},{lit(q)},'fod_sheet',{lit(ref)})"
            )
    print(f"-- {len(res_vals)} result rows ({skipped} rows skipped: unparseable date)", file=sys.stderr)

    cols = ("organisation_id, site_id, test_type_id, date_collected, time_collected, "
            "organisation_collecting, result, result_qualifier, source, source_ref")
    for i in range(0, len(res_vals), 200):
        out.append(f"insert into test_results ({cols}) values\n  "
                   + ",\n  ".join(res_vals[i:i+200])
                   + "\non conflict (source_ref) do update set "
                     "result=excluded.result, result_qualifier=excluded.result_qualifier, "
                     "site_id=excluded.site_id, test_type_id=excluded.test_type_id, "
                     "organisation_collecting=excluded.organisation_collecting, "
                     "time_collected=excluded.time_collected;")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
