// Hand-written DB types for M1. Regenerate with `supabase gen types typescript`
// once the project is linked, then replace this file.

export type AppRole = "admin" | "volunteer";
export type SiteType = "bathing_water" | "community_designated";
export type TestCategory = "biological" | "chemical" | "physical";
export type SampleCondition = "wet" | "dry";

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      site_type: SiteType;
      test_category: TestCategory;
      sample_condition: SampleCondition;
    };
    CompositeTypes: Record<string, never>;
  };
}
