-- Phase 1 workstream E — make the live EDM sync feed-driven from the DB instead of a hardcoded
-- SWW ArcGIS URL. The National Storm Overflow Hub is a directory of per-company APIs that all share
-- the standardised EDM outlet schema (the same schema SWW's NEH_outlets_PROD feed uses), so onboarding
-- a non-SWW river becomes a config change: set that company's feed URL on its org.
--
-- EA Annual Return history (the regulatory import path) is unaffected — this is only the live feed.

alter table organisations add column if not exists edm_feed_url  text;
-- Adapter selector. 'arcgis_edm' = an ArcGIS FeatureServer query endpoint returning the standard EDM
-- outlet attributes (Id, status, statusStart, latestEventStart, latestEventEnd, receivingWaterCourse,
-- lastUpdated, longitude, latitude). Room for other kinds later where a company's feed differs.
alter table organisations add column if not exists edm_feed_kind text not null default 'arcgis_edm';

-- Backfill the existing South West Water instances (Dart, Teign) with the SWW standardised feed, so
-- their live sync is unchanged. No-op for any org already configured or on a DB without SWW orgs.
update organisations
set edm_feed_url = 'https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query'
where edm_feed_url is null and company_name = 'South West Water';
