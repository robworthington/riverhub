# Migrations manifest — schema vs instance data

Federation context (see `River Hub - Federation plan.md`, workstream F1): the template must produce
an **org-agnostic schema**. Migrations are append-only history, so FotD-specific data inserts in
early migrations are *not* rewritten — they are classified here instead. All data inserts are
guarded (`where not exists` / `on conflict`) and scoped to the FotD organisation uuid, so on a
fresh instance **without that organisation row they insert nothing** — the full sequence can be
applied verbatim and still yields a clean, empty instance.

Since 0030, no runtime code or function contains a hardcoded organisation: the public-portal RPCs
read `public_org()` from the single-row `app_config` table. **Provisioning a new instance** =
apply all migrations → insert the `organisations` row → insert the `app_config` row pointing at it
(0030 self-seeds `app_config` only when an organisation already exists at migration time).

| Migration | Class | Notes |
|---|---|---|
| 0001_schema | schema | Core tables, org-tagged throughout |
| 0002_rls | schema | RLS + `current_org()` / role helpers |
| 0003_sewage | schema + FotD seed | Tables + demo Mill Hill system/asset (guarded insert, FotD-scoped) |
| 0004_ea | schema + FotD seed | Tables + Dart river gauge / rainfall stations (guarded, FotD-scoped) |
| 0005_boundaries | schema | Parishes table (data loaded by importer, not migration) |
| 0006_heatmap_fn | schema | |
| 0007_edm_history | schema | Snapshot-history model |
| 0008_asset_rain_gauge | schema | |
| 0009_classify_spills_fn | schema | Dry/wet classification (central methodology) |
| 0010_dart_water_bodies | **FotD data** | Dart WFD water-body rows (guarded, FotD-scoped) |
| 0011_asset_attachments | schema | |
| 0012_system_capacity | schema | |
| 0013_water_quality_import | schema + FotD seed | Result-import columns + FotD test types (guarded) |
| 0014_sample_weather_cso | schema | |
| 0015–0026 | schema | Functions, roles, river_segments table, pollution layers |
| 0027_public_portal_rpcs | schema¹ | Public RPCs (pollution/sites) — org literal superseded by 0030 |
| 0028_public_portal_rpcs_b | schema¹ | Public RPCs (spills/councils) + bw_class — superseded by 0030 |
| 0029_river_pollution_perf | schema¹ | River RPC perf rewrite — superseded by 0030 |
| 0030_public_org_config | schema | `app_config` + `public_org()`; recreates all public RPCs org-agnostically |
| 0031_dry_spill_min_duration | schema | `p_min_minutes` arg on dry-spill RPCs |
| 0032_asset_sensitive_waters | schema | `sewage_assets.bathing_water` / `shellfish_water` (populated by importer) |
| 0033_winep_actions | schema | `winep_actions` table (data loaded by `import_winep.py`, not migration) |
| 0034_public_winep_rpcs | schema | Public WINEP RPCs (`public_winep_*`) over `public_org()` |

¹ Still applied in order on fresh instances (harmless); 0030 recreates the functions without the literal.

**Reference data loaded by importers, never by migrations:** parishes/population (ONS), sewage
assets (water-company EDM), annual stats (EA), river segments (OSM), rainfall/river gauges (EA),
test sites/results (group data). See Federation plan §3.2 for the ordered pipeline.
