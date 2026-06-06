// Hand-written DB types for M1. Regenerate with `supabase gen types typescript`
// once the project is linked, then replace this file.

export type AppRole = "admin" | "volunteer";
export type SiteType = "bathing_water" | "community_designated";
export type TestCategory = "biological" | "chemical" | "physical";
export type SampleCondition = "wet" | "dry";
export type AssetType =
  | "pumping_station"
  | "storm_tank"
  | "sewage_treatment_works"
  | "combined_sewer_overflow";

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export type Profile = {
  id: string;
  organisation_id: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
}

export type WaterBody = {
  id: string;
  organisation_id: string;
  code: string;
  label: string;
  ea_water_body_id: string | null;
  created_at: string;
}

export type Parish = {
  id: string;
  name: string;
  district: string;
  county: string;
  ons_code: string | null;
}

export type TestType = {
  id: string;
  organisation_id: string;
  test_name: string;
  common_name: string | null;
  test_code: string | null;
  category: TestCategory | null;
  subcategory: string | null;
  measurement_type: string | null;
  primary_unit: string | null;
  detection_limit: number | null;
  measurement_range_min: number | null;
  measurement_range_max: number | null;
  regulatory_thresholds: Record<string, unknown> | null;
  threshold_source: string | null;
  health_risk_levels: string | null;
  created_at: string;
}

export type TestSite = {
  id: string;
  organisation_id: string;
  name: string;
  site_code: string | null;
  type: SiteType | null;
  rationale: string | null;
  description: string | null;
  parish_id: string | null;
  // location stored as geography(Point); read back as lat/long via a view/RPC.
  latitude: number | null;
  longitude: number | null;
  what_three_words: string | null;
  tidal: boolean;
  water_body_id: string | null;
  public_or_private: boolean | null;
  land_ownership: string | null;
  sampling_strategy: string | null;
  land_access_permission: boolean | null;
  access_point: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type SitePhoto = {
  id: string;
  site_id: string;
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export type TestResult = {
  id: string;
  organisation_id: string;
  site_id: string;
  test_type_id: string;
  date_collected: string;
  time_collected: string | null;
  person_collecting: string | null;
  organisation_collecting: string | null;
  result: number | null;
  chain_of_custody_path: string | null;
  rainfall: number | null;
  condition: SampleCondition | null;
  other_observations: string | null;
  created_by: string | null;
  created_at: string;
}

export type SewageSystem = {
  id: string;
  organisation_id: string;
  name: string;
  description: string | null;
  notes: string | null;
  created_at: string;
};

export type SewageAsset = {
  id: string;
  organisation_id: string;
  sewage_system_id: string | null;
  asset_name: string;
  asset_unique_id: string | null;
  asset_type: AssetType | null;
  water_body_id: string | null;
  parish_id: string | null;
  storage_capacity: number | null;
  processing_capacity: number | null;
  asset_owner: string | null;
  asset_address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  edm_enabled: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type AssetPermit = {
  id: string;
  organisation_id: string;
  asset_id: string;
  permit_number: string | null;
  permit_start_date: string | null;
  permit_revocation_date: string | null;
  required_processing_volume: number | null;
  required_storage_capacity: number | null;
  created_at: string;
};

export type EdmSnapshot = {
  id: string;
  organisation_id: string;
  asset_id: string;
  outlet_id: string;
  snapshot_date: string;
  status: number | null;
  status_start: string | null;
  latest_event_start: string | null;
  latest_event_end: string | null;
  receiving_water_course: string | null;
  last_updated: string | null;
  longitude: number | null;
  latitude: number | null;
  fetched_at: string;
};

export type RiverGauge = {
  id: string;
  organisation_id: string;
  name: string;
  ea_station_id: string | null;
  ea_measure_flow: string | null;
  ea_measure_level: string | null;
  water_body_id: string | null;
  latitude: number | null;
  longitude: number | null;
  ea_enabled: boolean;
  created_at: string;
};

export type FlowReading = {
  id: string;
  organisation_id: string;
  gauge_id: string;
  reading_date: string;
  flow_m3s: number | null;
  level_m: number | null;
  fetched_at: string;
};

export type RainfallStation = {
  id: string;
  organisation_id: string;
  name: string;
  ea_station_id: string | null;
  ea_measure_rainfall: string | null;
  latitude: number | null;
  longitude: number | null;
  ea_enabled: boolean;
  created_at: string;
};

export type RainfallReading = {
  id: string;
  organisation_id: string;
  station_id: string;
  reading_date: string;
  rainfall_mm: number | null;
  fetched_at: string;
};

// Minimal Database shape for the typed Supabase client.
// Each table needs Row/Insert/Update/Relationships for supabase-js inference.
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      organisations: Table<Organisation>;
      profiles: Table<Profile>;
      water_bodies: Table<WaterBody>;
      parishes: Table<Parish>;
      test_types: Table<TestType>;
      test_sites: Table<TestSite>;
      site_photos: Table<SitePhoto>;
      test_results: Table<TestResult>;
      sewage_systems: Table<SewageSystem>;
      sewage_assets: Table<SewageAsset>;
      asset_permits: Table<AssetPermit>;
      edm_snapshots: Table<EdmSnapshot>;
      river_gauges: Table<RiverGauge>;
      flow_readings: Table<FlowReading>;
      rainfall_stations: Table<RainfallStation>;
      rainfall_readings: Table<RainfallReading>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      site_type: SiteType;
      test_category: TestCategory;
      sample_condition: SampleCondition;
      asset_type: AssetType;
    };
    CompositeTypes: Record<string, never>;
  };
}
