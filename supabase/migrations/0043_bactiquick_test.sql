-- River Hub — support multi-value field tests (Bactiquick) in a single test_results row.
-- Two sample-event context columns (like rainfall/condition already are) + one qualitative class
-- column for tests whose device reports a band (Bactiquick Low/Medium/High). See the test-type
-- analysis note. `result` still holds the numeric measurement (Bactiquick score), so existing
-- charts/stats/heatmap keep working unchanged.
alter table test_results add column if not exists temperature_c numeric;   -- water temp at collection (°C)
alter table test_results add column if not exists salinity_ppt  numeric;   -- salinity (ppt)
alter table test_results add column if not exists result_class  text;      -- device-reported band, e.g. 'Low'|'Medium'|'High'

-- Seed the Bactiquick test type for this instance's organisation (idempotent).
-- Bactiquick (Molendotech / Univ. of Plymouth): rapid Gram-negative endotoxin, score in ERU with a
-- device traffic light (Green=Low / Orange=Medium / Red=High, aligned to EA bathing-water bands).
-- The rating is recorded as read from the device (reported_class), NOT derived. single_reference=50
-- draws the ~50 ERU sufficient/poor pivot as a reference line on the score chart. Range: min 1, open cap.
insert into test_types (organisation_id, test_name, common_name, test_code, category, subcategory,
                        measurement_type, primary_unit, measurement_range_min, measurement_range_max,
                        regulatory_thresholds, threshold_source, health_risk_levels)
select public_org(), 'Bactiquick', 'Bactiquick endotoxin (rapid)', 'BACTIQUICK', 'biological', 'endotoxin',
       'score', 'ERU', 1, null,
       jsonb_build_object(
         'single_reference', 50,
         'reference_label', '≈50 ERU pivot (sufficient/poor, ±7.5)',
         'reported_class', true,
         'risk_lights', jsonb_build_object('Low', 'green', 'Medium', 'orange', 'High', 'red')),
       'Molendotech Bactiquick — device-reported traffic light (aligned to EA bathing-water bands)',
       'Green = Low, Orange = Medium, Red = High'
where public_org() is not null
  and not exists (select 1 from test_types where organisation_id = public_org() and test_name = 'Bactiquick');
