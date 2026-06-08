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
  census_2021_population: number | null;
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
  eu_bwid: string | null;
  os_grid_ref: string | null;
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
  result_qualifier: string;
  chain_of_custody_path: string | null;
  rainfall: number | null;
  condition: SampleCondition | null;
  observed_weather: string | null;
  cso_releasing: boolean | null;
  cso_release_24h: boolean | null;
  other_observations: string | null;
  source: string | null;
  source_ref: string | null;
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
  rainfall_station_id: string | null;
  actual_capacity_m3d: number | null;
  actual_capacity_source: string | null;
  eir_ref: string | null;
  eir_requested_on: string | null;
  eir_received_on: string | null;
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
  permit_doc_path: string | null;
  permit_url: string | null;
  permit_dwf_m3d: number | null;
  permit_fft_m3d: number | null;
  permit_pe: number | null;
  created_at: string;
};

export type SystemAssumptions = {
  system_id: string;
  organisation_id: string;
  ons_population: number | null;
  ons_calculated_at: string | null;
  ons_source: string | null;
  population_override: number | null;
  g_lhd: number;
  low_variation_pct: number;
  high_variation_pct: number;
  infiltration_m3d: number;
  trade_effluent_m3d: number;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type SystemCapacity = {
  system_id: string;
  organisation_id: string;
  g_lhd: number;
  low_variation_pct: number;
  high_variation_pct: number;
  infiltration_m3d: number;
  trade_effluent_m3d: number;
  ons_population: number | null;
  ons_calculated_at: string | null;
  ons_source: string | null;
  population_override: number | null;
  notes: string | null;
  updated_at: string;
  effective_population: number | null;
  pop_low: number | null;
  pop_high: number | null;
  demand_low_m3d: number | null;
  demand_central_m3d: number | null;
  demand_high_m3d: number | null;
};

export type AssetPhoto = {
  id: string;
  asset_id: string;
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type EdmSnapshot = {
  id: string;
  organisation_id: string;
  asset_id: string;
  outlet_id: string;
  snapshot_date: string;
  captured_at: string;
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

export type SpillEvent = {
  id: string;
  organisation_id: string;
  asset_id: string;
  outlet_id: string;
  event_start: string;
  event_end: string | null;
  ongoing: boolean;
  duration_minutes: number | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type EdmAnnualStat = {
  id: string;
  organisation_id: string;
  asset_id: string | null;
  outlet_id: string;
  year: number;
  spill_count: number | null;
  total_duration_hours: number | null;
  reporting_pct: number | null;
  site_name: string | null;
  source: string;
  created_at: string;
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
      system_assumptions: Table<SystemAssumptions>;
      asset_photos: Table<AssetPhoto>;
      edm_snapshots: Table<EdmSnapshot>;
      river_gauges: Table<RiverGauge>;
      flow_readings: Table<FlowReading>;
      rainfall_stations: Table<RainfallStation>;
      rainfall_readings: Table<RainfallReading>;
      spill_events: Table<SpillEvent>;
      edm_annual_stats: Table<EdmAnnualStat>;
    };
    Views: {
      system_capacity_v: { Row: SystemCapacity; Relationships: [] };
    };
    Functions: {
      parish_heat: {
        Args: { p_type: string | null; p_from: string | null; p_to: string | null };
        Returns: {
          parish_id: string;
          parish_name: string;
          mean_result: number;
          n: number;
          geojson: string;
        }[];
      };
      system_ons_population: {
        Args: { p_system: string };
        Returns: number;
      };
      classify_spills: {
        Args: { p_window: number; p_threshold: number };
        Returns: {
          spill_event_id: string;
          asset_id: string;
          asset_name: string | null;
          system_name: string | null;
          event_start: string;
          event_end: string | null;
          ongoing: boolean;
          duration_minutes: number | null;
          weather_class: "dry" | "wet" | "unknown";
          max_rain: number | null;
          flow_m3s: number | null;
        }[];
      };
    };
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
