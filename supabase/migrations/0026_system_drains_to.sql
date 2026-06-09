-- River Hub — note where a system's flows go when it has no works of its own.
-- Many "systems" are upstream clusters of CSOs / pumping stations that drain to a treatment
-- works in another catchment (e.g. Dartington -> Totnes). This flags that rather than the
-- system reading as "missing an STW".
alter table sewage_systems add column if not exists drains_to text;
