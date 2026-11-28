#!/usr/bin/env python3
"""
Natural Resources Wales's pollution incidents: step `incidents` for "nation": "wales" (WALES-ROLLOUT-PLAN.md
§5). England's incidents come from the EA's weekly cron (/api/cron/pollution-incidents); this is the Welsh
counterpart, run as an import because NRW's file can't be fetched by a script.

Source: NRW "Environmental Pollution Incidents" (NRW_DS116253, OGL v3), one spreadsheet of substantiated,
closed incidents in Wales since March 2016 with a high (category 1 or 2) impact, refreshed about quarterly.
It sits on NRW's ShareFile share, which refuses scripted downloads, so it is copied by hand into the
`import-inputs` release as nrw-incidents.xlsx; scripts/ci/fetch_inputs.sh fetches it into
$NRW_INCIDENTS_XLSX. (Incidents from 2013 to Feb 2016 are in a separate legacy file, not loaded.)

Columns: Event ID, Notification Date and Time (a date), Unitary Authority, Area, Grid Reference, Easting,
Northing, Principal Impact + Category 1, Secondary Impact + Category 2, Pollutant 1 (the type, e.g.
"Sewage Material") and Pollutant 2 (the pollutant, e.g. "Crude Sewage").

Mapping into pollution_incidents (migration 0136): not_id = 1,000,000,000 + event id (NRW's ids overlap
the EA's), source 'nrw-epi', source_ref = event id. An impact on water, land or air sets eil_water /
eil_land / eil_air from its category: "High - Major" and the older "Category 1" are 1, "High -
Significant" and "Category 2" are 2, "Low" is 3. Other impacts (fisheries, amenity…) aren't stored, as
for the EA. "Sewage Material" becomes the EA's "Sewage Materials" so is_sewage is set the same way.

The whole file is loaded (it is all of Wales, ~1,500 rows), NRW rows no longer in it are removed, and
assign_pollution_incidents() then links every incident to the nearest overflow or works within 1 km on
a live river. Running it for several Welsh rivers in one batch just reloads the same rows.

Usage:
    NRW_INCIDENTS_XLSX=… python3 scripts/import_nrw_incidents.py --config config/catchments/teifi.json > /tmp/inc.sql
"""
import os
import sys

import catchment_config  # noqa: F401  (the step runner passes --config; the load is all of Wales)
import wales_common as wc

OFFSET = 1_000_000_000
CATEGORY = {"high - major": 1, "category 1": 1, "high - significant": 2, "category 2": 2, "low": 3}
IMPACT_COL = {"water": "water", "land": "land", "air": "air"}


def text(v):
    return " ".join(str(v).split()) if v is not None else ""


def main():
    import openpyxl
    path = os.path.expanduser(os.environ.get("NRW_INCIDENTS_XLSX", ""))
    if not path or not os.path.isfile(path):
        sys.exit("NRW_INCIDENTS_XLSX is not set to NRW's Environmental Pollution Incidents spreadsheet")
    rows = list(openpyxl.load_workbook(path, read_only=True, data_only=True).active.iter_rows(values_only=True))
    head = [text(h).lower() for h in rows[0]]
    col = {name: head.index(name) for name in head}
    need = ["event id", "notification date and time", "easting", "northing", "principal impact", "category 1",
            "secondary impact", "category 2", "pollutant 1", "pollutant 2"]
    missing = [n for n in need if n not in col]
    if missing:
        sys.exit(f"NRW incidents file has changed: missing columns {missing}")

    out_rows, sewage = [], 0
    for r in rows[1:]:
        g = lambda name: r[col[name]] if name in col else None  # noqa: E731
        eid = text(g("event id"))
        if not eid.isdigit():
            continue
        eil = {"water": None, "land": None, "air": None}
        for imp, cat in (("principal impact", "category 1"), ("secondary impact", "category 2")):
            target = IMPACT_COL.get(text(g(imp)).lower())
            c = CATEGORY.get(text(g(cat)).lower())
            if target and c and (eil[target] is None or c < eil[target]):
                eil[target] = c
        ptype, pollutant = text(g("pollutant 1")), text(g("pollutant 2"))
        types = ["Sewage Materials" if ptype == "Sewage Material" else ptype] if ptype else []
        sewage += types == ["Sewage Materials"]
        out_rows.append({
            "id": OFFSET + int(eid), "ref": eid, "at": text(g("notification date and time"))[:19] or None,
            "e": g("easting"), "n": g("northing"), "ngr": text(g("grid reference")) or None,
            "area": text(g("area")) or None, "county": text(g("unitary authority")) or None,
            "eil": eil, "types": types, "pollutants": [pollutant] if pollutant else [],
        })
    if len(out_rows) < 500:
        sys.exit(f"only {len(out_rows)} incidents read — the file looks truncated; nothing loaded")
    print(f"-- {len(out_rows)} NRW incidents, {sewage} involving sewage", file=sys.stderr)

    def num(v):
        try:
            return str(int(float(v)))
        except (TypeError, ValueError):
            return "null"

    def arr(xs):
        return "array[" + ",".join(wc.q(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"

    out = ["-- River Hub: NRW Environmental Pollution Incidents (NRW_DS116253, OGL v3). Idempotent.", "begin;",
           "create temp table _inc(not_id integer, ref text, occurred_at timestamp, easting integer, northing integer, "
           "ngr text, area text, county text, eil_water smallint, eil_land smallint, eil_air smallint, "
           "pollutant_types text[], pollutants text[]) on commit drop;"]
    vals = []
    for x in out_rows:
        e = x["eil"]
        vals.append("(" + ",".join([
            str(x["id"]), wc.q(x["ref"]), wc.q(x["at"]), num(x["e"]), num(x["n"]), wc.q(x["ngr"]), wc.q(x["area"]),
            wc.q(x["county"]), *(str(e[k]) if e[k] else "null" for k in ("water", "land", "air")),
            arr(x["types"]), arr(x["pollutants"])]) + ")")
    for i in range(0, len(vals), 500):
        out.append("insert into _inc values " + ",".join(vals[i:i + 500]) + ";")
    out.append("""insert into pollution_incidents as p (not_id, source, source_ref, occurred_at, easting, northing, ngr,
    geom, region, area, county, eil_water, eil_land, eil_air, pollutant_types, pollutants, is_sewage, loaded_at)
  select not_id, 'nrw-epi', ref, occurred_at, easting, northing, ngr,
    case when easting is not null and northing is not null
      then ST_Transform(ST_SetSRID(ST_MakePoint(easting, northing), 27700), 4326)::geography end,
    'Wales', area, county, eil_water, eil_land, eil_air, pollutant_types, pollutants,
    'Sewage Materials' = any(pollutant_types), now()
  from _inc
  on conflict (not_id) do update set
    source = excluded.source, source_ref = excluded.source_ref, occurred_at = excluded.occurred_at,
    easting = excluded.easting, northing = excluded.northing, ngr = excluded.ngr, geom = excluded.geom,
    region = excluded.region, area = excluded.area, county = excluded.county, eil_water = excluded.eil_water,
    eil_land = excluded.eil_land, eil_air = excluded.eil_air, pollutant_types = excluded.pollutant_types,
    pollutants = excluded.pollutants, is_sewage = excluded.is_sewage, loaded_at = excluded.loaded_at;""")
    out.append("delete from pollution_incidents where source = 'nrw-epi' and not_id not in (select not_id from _inc);")
    out.append("select 'incidents (EA and NRW) linked to a live river: ' || assign_pollution_incidents();")
    out.append("select 'NRW incidents: ' || count(*) || ', sewage with a serious impact on water: ' || "
               "count(*) filter (where is_sewage and eil_water in (1, 2)) from pollution_incidents where source = 'nrw-epi';")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
