-- River Hub — sample-level weather + CSO-release context (from the FoD samples sheet).
-- Enables wet/dry analysis and "was a CSO discharging at sampling time" context on results.

alter table test_results add column if not exists observed_weather text;     -- raw field note
alter table test_results add column if not exists cso_releasing    boolean;  -- CSO(s) discharging at sample time
alter table test_results add column if not exists cso_release_24h  boolean;  -- CSO(s) discharged within prior 24h
-- (test_results.condition wet/dry already exists; the importer now populates it from observed_weather)
