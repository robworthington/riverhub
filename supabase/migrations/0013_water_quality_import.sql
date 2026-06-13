-- River Hub — water-quality bulk import (Friends of the Dart sampling sheet)
-- Adds site identity/geo fields, a result qualifier, an idempotent import key, and the
-- intestinal enterococci test type. See the FoD samples + locations Google Sheet.

-- Site identity + geolocation provenance
alter table test_sites add column if not exists eu_bwid     text;  -- EU bathing water ID (EUBWID)
alter table test_sites add column if not exists os_grid_ref text;  -- e.g. SX7327470574

-- Result qualifier (= measured, < below detection limit, > above range) + import provenance
alter table test_results add column if not exists result_qualifier text not null default '=';
alter table test_results add column if not exists source            text;     -- e.g. 'fod_sheet'
alter table test_results add column if not exists source_ref        text;     -- deterministic natural key

-- Idempotent re-import: non-null source_ref unique; pre-existing manual rows keep NULL (nulls distinct).
create unique index if not exists test_results_source_ref_uniq on test_results (source_ref);

-- Intestinal enterococci (needed alongside E. coli for EA bathing-water context)
insert into test_types
  (organisation_id, test_name, common_name, test_code, category, subcategory,
   measurement_type, primary_unit, regulatory_thresholds, threshold_source, health_risk_levels)
select '00000000-0000-0000-0000-000000000001',
  'Intestinal enterococci (culture)', 'Intestinal enterococci', NULL, 'biological', 'Bacteria',
  'Quantitative', 'CFU/100mL',
  '{"single_reference": 200, "reference_label": "EA \"Good\" boundary (coastal, 95th pct)"}'::jsonb,
  'Bathing Water Regs 2013 / rcBWD 2006/7/EC', 'Green/Amber/Red'
where not exists (
  select 1 from test_types
  where organisation_id='00000000-0000-0000-0000-000000000001'
    and test_name='Intestinal enterococci (culture)'
)
-- guard: no-op on a fresh (non-FotD) instance where this org doesn't exist (federation F1/F6)
and exists (select 1 from organisations where id = '00000000-0000-0000-0000-000000000001');

-- Single E. coli reference line (per the chosen "single reference line" approach): 500 cfu/100ml.
update test_types
   set regulatory_thresholds = regulatory_thresholds
       || '{"single_reference": 500, "reference_label": "EA \"Good/Sufficient\" boundary"}'::jsonb
 where organisation_id='00000000-0000-0000-0000-000000000001'
   and test_name in ('E. coli (culture)', 'E. coli (Petrifilm)');
