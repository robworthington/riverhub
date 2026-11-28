#!/usr/bin/env python3
"""
Natural Resources Wales's National Environment Programme (NEP) for a Welsh catchment: step `winep` for
"nation": "wales" (WALES-ROLLOUT-PLAN.md §5). The NEP is Wales's equivalent of England's WINEP: the
environmental improvements, investigations and monitoring the water companies must deliver in AMP8
(PR24, 2025–2030).

Source: DataMapWales WFS `geonode:nrw_national_environment_plan` (3,126 actions, OGL v3). Each action
has a point (the outlet, works or site), a WFD water body id, an NRW driver code (`W_…`), a type
(WQ, DrWPA, Fish, …), a purpose (Investigation / Monitoring / Action / No deterioration) and an
indicative completion date. The completion date field is spelt `compleation_date` in the source (and
is empty for every row so far), so the indicative date is used when it is missing.

Rows go into the same `winep_actions` table as WINEP, with source 'nrw_nep_pr24' and cycle 'PR24', so
every page that lists improvement actions shows them. A row is kept for the river when its water body
is one of the river's, or its point is within 150 m of the river's outline, or it links to one of
one of the river's outlets. Links: an overflow action (type WQ, intermittent) goes to the nearest outlet
within 250 m (else a place-name match within 2 km); a works action (type WQ, continuous) to the works group
of the nearest treatment works within 500 m; catchment-wide and other actions to the water body only.

`unique_id` is not unique in the source (743 repeats: one id covers several outlets), so the action
component is a short stable hash of the row's name, driver and grid reference.

Driver labels: NRW's codes are England's with a `W_` prefix where they match (W_U_MON3 → U_MON3), so the
English label snapshot (winep_driver_codes.json) is used first; Welsh-only codes get a plain label built
from the code's parts ("Storm overflows: investigation"). Every action also carries NRW's own description.

  python3 scripts/import_nep.py --config config/catchments/teifi.json > /tmp/nep.sql
"""
import hashlib
import json
import os
import re
import sys

import catchment_config
import wales_common as wc

LAYER = "geonode:nrw_national_environment_plan"
SOURCE = "nrw_nep_pr24"
CYCLE = "PR24"
OUTLINE_BUFFER_M = 150
ASSET_RADIUS_M = 250
NAME_RADIUS_M = 2000
DRIVER_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "winep_driver_codes.json")

# Parts of NRW driver codes, for the codes England doesn't share. Longest match first.
THEMES = [
    ("U_O", "Storm overflows", "Urban Waste Water Treatment Regulations"),
    ("U", "Urban waste water", "Urban Waste Water Treatment Regulations"),
    ("HR_P", "Habitats sites, phosphorus", "Habitats Regulations"),
    ("HR_AMM", "Habitats sites, ammonia", "Habitats Regulations"),
    ("HR_MWQ", "Habitats sites, marine water quality", "Habitats Regulations"),
    ("HR", "Habitats sites", "Habitats Regulations"),
    ("WFD_WRHMWB", "Water resources in a heavily modified water body", "Water Framework Directive"),
    ("WFD_WRFLOW", "River flows", "Water Framework Directive"),
    ("WFD_PG", "Phosphorus", "Water Framework Directive"),
    ("WFD_PD", "Phosphorus", "Water Framework Directive"),
    ("WFD_P", "Phosphorus", "Water Framework Directive"),
    ("WFD_AMM", "Ammonia", "Water Framework Directive"),
    ("WFD_BOD", "Organic pollution (BOD)", "Water Framework Directive"),
    ("WFD_CHEM", "Chemicals", "Water Framework Directive"),
    ("WFD_GW", "Groundwater", "Water Framework Directive"),
    ("WFD_SHELL", "Shellfish waters", "Shellfish Waters"),
    ("WFD_NTAL", "Nutrients", "Water Framework Directive"),
    ("WFD_MINOR", "Minor works", "Water Framework Directive"),
    ("WFD", "Water quality", "Water Framework Directive"),
    ("DRWPA", "Drinking water protected area", "Drinking Water Protected Areas"),
    ("FISHMIT", "Fish: mitigation", "Fish passage and screening"),
    ("FISH", "Fish passage and screening", "Fish passage and screening"),
    ("EEL", "Eels", "Eels"),
    ("SSSI", "Sites of Special Scientific Interest", "Sites of Special Scientific Interest (SSSI)"),
    ("BIOD", "Biodiversity", "Biodiversity"),
    ("ZERO", "Net zero", "Net zero"),
]
KINDS = [("NDIMP", "improvement to prevent deterioration"), ("NDINV", "investigation to prevent deterioration"),
         ("ND", "prevent deterioration"), ("INV", "investigation"), ("IMP", "improvement"), ("MON", "monitoring")]


def clean_code(code):
    return re.sub(r"\s+", "", code or "") or None


def driver(code, english):
    """(label, obligation) for an NRW driver code."""
    if not code:
        return None, None
    base = re.sub(r"\(.*\)$", "", code)
    stripped = base[2:] if base.upper().startswith("W_") else base
    hit = english.get(stripped)
    if hit:
        return hit.get("label"), hit.get("obligation")
    tokens = stripped.upper().split("_")
    joined = "_".join(tokens)
    theme = next(((t, o) for pfx, t, o in THEMES if joined == pfx or joined.startswith(pfx + "_")), None)
    if not theme:
        return None, None
    last = re.sub(r"\d.*$", "", tokens[-1])
    nd = "ND" in tokens[:-1]
    kind = next((k for pfx, k in KINDS if last.startswith(pfx)), None)
    if nd and kind in ("improvement", "investigation"):
        kind += " to prevent deterioration"
    return (f"{theme[0]}: {kind}" if kind else theme[0]), theme[1]


def component(p):
    key = "|".join(str(p.get(k) or "").strip() for k in ("action_name", "driver_code_primary", "ngr"))
    return hashlib.sha1(key.encode()).hexdigest()[:8]


def day(v):
    return (v or "")[:10] or None


def main():
    cfg = catchment_config.load()
    org = wc.q(cfg["org_id"]) + "::uuid"
    english = json.load(open(DRIVER_JSON))
    wb_ids = set(cfg.get("wfd", {}).get("wb_ids") or [])
    s, w, n, e = cfg["geo"]["bbox"]
    pad = 0.03   # ~2 km, so outlets near the bbox edge still find actions just outside it
    feats = wc.wfs(LAYER, bbox=(w - pad, s - pad, e + pad, n + pad))
    print(f"-- {len(feats)} NEP actions in the {cfg['river']} bbox", file=sys.stderr)

    cols = ("action_id text, comp text, company text, dcode text, dlabel text, doblig text, name text, "
            "descr text, kind text, purpose text, scale text, ea_wb text, wb_type text, due date, "
            "lon float, lat float")
    out = [f"-- River Hub: NRW National Environment Programme (PR24) for {cfg['river']}. OGL v3. Idempotent:",
           "-- natural-key upsert (ids kept so winep_asset_links survive) + delete of this river's stale NEP rows.",
           "begin;", f"create temp table _n({cols}) on commit drop;"]
    unlabelled = set()
    for f in feats:
        p = f["properties"]
        g = f.get("geometry") or {}
        lon, lat = (g.get("coordinates") or [None, None])[:2]
        code = clean_code(p.get("driver_code_primary"))
        label, oblig = driver(code, english)
        if code and not label:
            unlabelled.add(code)
        purpose = (p.get("perpose") or "").strip().capitalize() or None
        out.append("insert into _n values (" + ", ".join([
            wc.q(p.get("unique_id")), wc.q(component(p)), wc.q((p.get("water_company") or "").strip()),
            wc.q(code), wc.q(label), wc.q(oblig), wc.q((p.get("action_name") or "").strip()),
            wc.q((p.get("action_description") or "").strip()), wc.q(p.get("type_")), wc.q(purpose),
            wc.q(p.get("schema_type")), wc.q((p.get("waterbody_id") or "").strip() or None),
            wc.q(p.get("waterbody_type")),
            wc.q(day(p.get("compleation_date")) or day(p.get("indicative_comp_date"))),
            "null" if lon is None else repr(lon), "null" if lat is None else repr(lat),
        ]) + ");")
    if unlabelled:
        print(f"-- no label for driver codes: {', '.join(sorted(unlabelled))}", file=sys.stderr)

    wb_list = ", ".join(wc.q(x) for x in sorted(wb_ids)) or "null"
    pt = "ST_SetSRID(ST_MakePoint(n.lon, n.lat), 4326)"
    out.append(f"""
create temp table _nm on commit drop as
select n.*,
  (select wb.id from water_bodies wb where wb.organisation_id = {org} and wb.ea_water_body_id = n.ea_wb limit 1)
    as water_body_id,
  -- overflow actions (water-quality type, intermittent discharges): the nearest outlet, else a name match
  case when n.kind = 'WQ' and (n.scale ilike '%intermittent%' or n.scale ilike 'cso%') then coalesce(
    (select sa.id from sewage_assets sa
      where sa.organisation_id = {org} and sa.latitude is not null and n.lon is not null
        and ST_DWithin(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude), 4326)::geography, {pt}::geography, {ASSET_RADIUS_M})
      order by ST_Distance(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude), 4326)::geography, {pt}::geography)
      limit 1),
    -- the first word of NRW's name (usually the place) in the asset name, within 2 km
    (select sa.id from sewage_assets sa
      where sa.organisation_id = {org} and sa.latitude is not null and n.lon is not null and n.name <> ''
        and ST_DWithin(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude), 4326)::geography, {pt}::geography, {NAME_RADIUS_M})
        and lower(sa.asset_name) like '%' || lower(split_part(regexp_replace(n.name, '[^A-Za-z ]', ' ', 'g'), ' ', 1)) || '%'
        and length(split_part(regexp_replace(n.name, '[^A-Za-z ]', ' ', 'g'), ' ', 1)) >= 4
      order by ST_Distance(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude), 4326)::geography, {pt}::geography)
      limit 1)) end as asset_id,
  -- treatment works actions (continuous discharges): the works group of the nearest treatment works within 500 m
  case when n.kind = 'WQ' and n.scale ilike 'continuous%' then
    (select sa.sewage_system_id from sewage_assets sa
      where sa.organisation_id = {org} and sa.asset_type = 'sewage_treatment_works' and sa.latitude is not null
        and n.lon is not null and sa.sewage_system_id is not null
        and ST_DWithin(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude), 4326)::geography, {pt}::geography, 500)
      order by ST_Distance(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude), 4326)::geography, {pt}::geography)
      limit 1) end as works_system_id,
  (n.ea_wb in ({wb_list})) as in_wb,
  (n.lon is not null and exists (select 1 from catchment_boundaries b where b.organisation_id = {org}
     and ST_DWithin(b.geom::geography, {pt}::geography, {OUTLINE_BUFFER_M}))) as in_outline
from _n n;

alter table _nm add column system_id uuid;
update _nm m set system_id = m.works_system_id;
update _nm m set system_id = sa.sewage_system_id from sewage_assets sa where sa.id = m.asset_id;
create temp table _keep on commit drop as
  select distinct on (action_id, comp) * from _nm
  where in_wb or in_outline or asset_id is not null or system_id is not null
  order by action_id, comp;

select 'NEP kept: ' || count(*) || ' (water body ' || count(*) filter (where in_wb)
       || ', outline ' || count(*) filter (where in_outline) || ', outlet ' || count(*) filter (where asset_id is not null)
       || '); linked to an outlet ' || count(*) filter (where asset_id is not null)
       || ', to works ' || count(*) filter (where system_id is not null) from _keep;

insert into winep_actions
  (organisation_id, cycle, action_id, action_component, water_company, driver_code, driver_label,
   driver_obligation, action_name, action_description, aim, action_type, spatial_scale,
   ea_water_body_id, wb_type, water_body_id, asset_id, sewage_system_id, completion_date,
   latitude, longitude, source)
select {org}, {wc.q(CYCLE)}, action_id, comp, company, dcode, dlabel, doblig, name, descr, purpose, kind, scale,
       ea_wb, wb_type, water_body_id, asset_id, system_id, due, lat, lon, {wc.q(SOURCE)}
from _keep
on conflict (organisation_id, cycle, action_id, action_component) do update set
  water_company = excluded.water_company, driver_code = excluded.driver_code, driver_label = excluded.driver_label,
  driver_obligation = excluded.driver_obligation, action_name = excluded.action_name,
  action_description = excluded.action_description, aim = excluded.aim, action_type = excluded.action_type,
  spatial_scale = excluded.spatial_scale, ea_water_body_id = excluded.ea_water_body_id, wb_type = excluded.wb_type,
  water_body_id = excluded.water_body_id, asset_id = excluded.asset_id, sewage_system_id = excluded.sewage_system_id,
  completion_date = excluded.completion_date, latitude = excluded.latitude, longitude = excluded.longitude,
  source = excluded.source;

delete from winep_actions wa
 where wa.organisation_id = {org} and wa.source = {wc.q(SOURCE)}
   and not exists (select 1 from _keep k where k.action_id = wa.action_id and k.comp = wa.action_component);

select 'winep_actions now (NEP): ' || count(*) from winep_actions where organisation_id = {org} and source = {wc.q(SOURCE)};
commit;""")
    print("\n".join(out))


if __name__ == "__main__":
    main()
