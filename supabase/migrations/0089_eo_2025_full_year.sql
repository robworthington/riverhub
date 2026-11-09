-- River Hub — EIR26209 emergency-overflow data: 2025 is a complete year.
-- 0070 loaded 2025 as partial (year-to-date), but South West Water's figures come from its 2025
-- EO annual return, so they cover the whole year. Clearing the flag makes 2025 the "last full year"
-- in public_eo_summary / public_eo_rows and drops the "ytd" label on the emergency-overflows page.
update eo_annual_spills
set partial_year = false
where source = 'EIR26209' and year = 2025 and partial_year;
