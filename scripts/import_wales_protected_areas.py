#!/usr/bin/env python3
"""
Natural Resources Wales's protected areas for a Welsh catchment: the `pa-shellfish`, `pa-bathing`,
`pa-sssi` and `pa-nature` steps for "nation": "wales" (WALES-ROLLOUT-PLAN.md §5). The English steps read
Natural England and the EA, which stop at the border.

Source: DataMapWales WFS (OGL v3), queried by the catchment bbox, one layer per designation:

  step          designation    layer                                          id / name
  pa-sssi       sssi           inspire-nrw:NRW_SSSI                           sssi_code / sssi_name
  pa-nature     sac            inspire-nrw:NRW_SAC                            Site_code / SAC_name
                spa            inspire-nrw:NRW_SPA                            SPA_code / SPA_Name
                ramsar         inspire-nrw:NRW_RAMSAR                         RAM_code / RAM_name
                mcz            geonode:nrw_mpa_mcz (Skomer is Wales's one)    mcz_code / mcz_name
  pa-bathing    bathing_water  geonode:nrw_bathing_waters (points)            bathing_water_id / name
  pa-shellfish  shellfish_pa   geonode:shellfish_waters_protected_area        name (the layer has no id)

Rows go into `protected_areas` with the same designations as England's, so the map layers and the
priority-site pages show them unchanged; `source` is 'nrw-<designation>'. Welsh names (`enw`) go into
attrs.name_cy. Bathing waters carry NRW's latest classification in attrs.classification, as the EA's do.
Polygons are simplified to ~20 m (outer rings only), as the English SSSI import does. The SODRP flag
follows England's: everything but shellfish waters.

There is no Welsh drinking water protected area layer on DataMapWales, so `pa-ogc` stays skipped.

When setup_catchment.py runs it, SETUP_STEP names the step and only that step's designations are
loaded; run by hand it loads them all.
Usage:
    python3 scripts/import_wales_protected_areas.py --config config/catchments/teifi.json > /tmp/wpa.sql
"""
import json, os, sys

import catchment_config
import wales_common as wc

SIMPLIFY_DEG = 0.0002   # ~20 m, as import_sssi.py

# designation -> (layer, id field, name field, SODRP high priority)
LAYERS = {
    "sssi": ("inspire-nrw:NRW_SSSI", "sssi_code", "sssi_name", True),
    "sac": ("inspire-nrw:NRW_SAC", "Site_code", "SAC_name", True),
    "spa": ("inspire-nrw:NRW_SPA", "SPA_code", "SPA_Name", True),
    "ramsar": ("inspire-nrw:NRW_RAMSAR", "RAM_code", "RAM_name", True),
    "mcz": ("geonode:nrw_mpa_mcz", "mcz_code", "mcz_name", True),
    "bathing_water": ("geonode:nrw_bathing_waters", "bathing_water_id", "name", True),
    "shellfish_pa": ("geonode:shellfish_waters_protected_area", "name", "name", False),
}
STEPS = {
    "pa-sssi": ["sssi"],
    "pa-nature": ["sac", "spa", "ramsar", "mcz"],
    "pa-bathing": ["bathing_water"],
    "pa-shellfish": ["shellfish_pa"],
}


def clean(v):
    return v.strip() if isinstance(v, str) else v   # NRW's older layers pad text fields with spaces


def geometry_sql(g):
    if g["type"] == "Point":
        x, y = g["coordinates"][:2]
        return f"ST_SetSRID(ST_MakePoint({round(x, 6)}, {round(y, 6)}), 4326)"
    simple = wc.simplify_geometry(g, SIMPLIFY_DEG)
    if not simple["coordinates"]:
        simple = wc.simplify_geometry(g, 0)   # a site smaller than the tolerance keeps its own outline
    if not simple["coordinates"]:
        return None
    return f"ST_Multi(ST_CollectionExtract({wc.geojson_sql(simple)}, 3))"


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    step = os.environ.get("SETUP_STEP")
    designations = STEPS.get(step) or [d for ds in STEPS.values() for d in ds]
    s, w, n, e = cfg["geo"]["bbox"]
    orgl = wc.q(org) + "::uuid"

    out = [f"-- River Hub: NRW protected areas ({', '.join(designations)}) for {cfg['river']} (OGL v3). Idempotent.",
           "begin;",
           "create temp table _pa(designation text, source_id text, name text, sodrp boolean, geom geometry, "
           "attrs jsonb) on commit drop;"]
    for desig in designations:
        layer, id_f, name_f, sodrp = LAYERS[desig]
        feats = wc.wfs(layer, bbox=(w, s, e, n))
        kept = 0
        for f in feats:
            p, g = f["properties"], f.get("geometry")
            sid, name = clean(p.get(id_f)), clean(p.get(name_f))
            if not sid and p.get("sssi_id"):
                sid = f"nrw-{p['sssi_id']}"   # a few recent SSSIs have no code yet in NRW's layer
            if not g or not sid:
                continue
            geom = geometry_sql(g)
            if geom is None:
                continue
            attrs = {"name_cy": clean(p.get("enw"))}
            if desig == "bathing_water":
                attrs.update(classification=clean(p.get("classification")),
                             year_designated=clean(p.get("year_of_designation")),
                             local_authority=clean(p.get("local_authority")))
            attrs = {k: v for k, v in attrs.items() if v}
            out.append(f"insert into _pa values ('{desig}', {wc.q(sid)}, {wc.q(name)}, {'true' if sodrp else 'false'}, "
                       f"{geom}, {wc.q(json.dumps(attrs, ensure_ascii=False))}::jsonb);")
            kept += 1
        print(f"-- {desig}: {kept} in the {cfg['river']} bbox ({layer})", file=sys.stderr)

    desig_list = ",".join(f"'{d}'" for d in designations)
    out.append(f"delete from protected_areas where organisation_id = {orgl} and designation in ({desig_list});")
    # one row per (designation, id): a site split across several features is collected into one
    out.append(f"""insert into protected_areas (organisation_id, designation, source_id, name, sodrp_high_priority,
    geom, attrs, source)
  select {orgl}, designation, source_id, max(name), bool_or(sodrp),
    case when count(*) = 1 then (array_agg(geom))[1] else ST_Multi(ST_CollectionExtract(ST_Collect(geom), 3)) end,
    (array_agg(attrs))[1], 'nrw-' || designation
  from _pa group by designation, source_id;""")
    out.append(f"select designation, count(*) from protected_areas where organisation_id = {orgl} "
               f"and designation in ({desig_list}) group by designation order by designation;")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
