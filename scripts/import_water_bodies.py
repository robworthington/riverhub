#!/usr/bin/env python3
"""
Load the catchment's WFD river water bodies into the water_bodies taxonomy (federation F3/F6).

The Dart got its water bodies from a hardcoded, Dart-scoped migration (0010); this generalises
that to any catchment via the config's wb_ids. Fetches wb_id + wb_name from the EA WFD river
water-body service and emits idempotent inserts (code = ea_water_body_id = wb_id, label = name),
org-scoped. Run before assign_asset_water_bodies.py, which links assets to these rows by wb id.

Usage:
    python3 import_water_bodies.py [--config config/catchments/<x>.json] > /tmp/wb.sql
    docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/wb.sql
"""
import json, ssl, sys, urllib.parse, urllib.request

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE
WB_SERVICE = "https://environment.data.gov.uk/arcgis/rest/services/EA/WFDRiverWaterBodyCatchmentsCycle2/FeatureServer/0/query"


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    wb_ids = cfg.get("wfd", {}).get("wb_ids", [])
    if not wb_ids:
        sys.exit("catchment config has no wfd.wb_ids")

    where = "wb_id IN ('" + "','".join(wb_ids) + "')"
    params = urllib.parse.urlencode({"where": where, "outFields": "wb_id,wb_name", "returnGeometry": "false", "f": "json"})
    with urllib.request.urlopen(f"{WB_SERVICE}?{params}", timeout=90, context=_SSL) as r:
        rows = json.load(r).get("features", [])
    print(f"-- {len(rows)} of {len(wb_ids)} WFD water bodies resolved for {cfg['river']}", file=sys.stderr)

    out = [f"-- River Hub: WFD water bodies for {cfg['river']} (idempotent, org-scoped).", "begin;"]
    for f in rows:
        a = f["attributes"]
        wb_id, name = a["wb_id"], a.get("wb_name") or a["wb_id"]
        out.append(
            "insert into water_bodies (organisation_id, code, label, ea_water_body_id)\n"
            f"select {q(org)}, {q(wb_id)}, {q(name)}, {q(wb_id)}\n"
            f"where not exists (select 1 from water_bodies where organisation_id = {q(org)} and ea_water_body_id = {q(wb_id)});"
        )
    out.append("commit;")
    out.append(f"select 'water bodies: ' || count(*) from water_bodies where organisation_id = {q(org)};")
    print("\n".join(out))


if __name__ == "__main__":
    main()
