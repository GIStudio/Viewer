export type SceneBounds = {
  center: [number, number, number];
  size: [number, number, number];
  road_axis: [number, number, number];
};

export type InstanceInfo = {
  instance_id: string;
  asset_id: string;
  category: string;
  placement_group?: string;
  theme_id?: string;
  selection_source?: string;
  position_xyz?: [number, number, number] | number[];
  bbox_xz?: [number, number, number, number] | number[];
  anchor_poi_type?: string;
  anchor_distance_m?: number | null;
  feasibility_score?: number | null;
  constraint_penalty?: number | null;
  dist_to_road_edge_m?: number | null;
  dist_to_nearest_junction_m?: number | null;
  dist_to_nearest_entrance_m?: number | null;
};

export type AssetDescription = {
  asset_id: string;
  category: string;
  text_desc?: string;
  source?: string;
  asset_role?: string;
};

export type StaticObjectDescription = {
  match: "exact" | "prefix";
  title: string;
  category: string;
  source?: string;
  intro?: string;
  design_note?: string;
};

export type SummaryMetrics = {
  overlap_rate?: number | null;
  dropped_slot_rate?: number | null;
  spacing_uniformity?: number | null;
  style_consistency?: number | null;
  balance_score?: number | null;
  compliance_rate_total?: number | null;
  violations_total?: number | null;
  avg_feasibility_score?: number | null;
  instance_count?: number | null;
  unique_asset_count?: number | null;
  diversity_ratio?: number | null;
  rule_satisfaction_rate?: number | null;
  topology_validity?: number | null;
  cross_section_feasibility?: number | null;
  latency_ms_total?: number | null;
  latency_ms_per_instance?: number | null;
  design_rule_profile?: string | null;
  program_generator_used?: string | null;
  layout_solver_used?: string | null;
  [key: string]: unknown;
};

export type AudioProfile = {
  ambient: {
    traffic: number;
    nature: number;
    urban: number;
    transit: number;
  };
  point_sources: Array<{
    type: string;
    position: [number, number, number];
    radius_m: number;
  }>;
};

export type LayoutBand = {
  name: string;
  kind: string;
  side: string;
  width_m: number;
  z_center_m: number;
  allowed_categories?: string[];
};

export type BuildingFootprint = {
  footprint_id: string;
  polygon_xz: number[][];
  centroid_xz: number[];
  target_height_m: number;
  land_use_type?: string;
  height_class?: string;
};

export type LayoutOverlayData = {
  bands: LayoutBand[];
  building_footprints: BuildingFootprint[];
  length_m: number;
};

export type LightingPresetValues = {
  exposure: number;
  keyLightIntensity: number;
  fillLightIntensity: number;
  warmth: number;
  shadowStrength: number;
};

export type ViewerManifest = {
  layout_path: string;
  summary?: SummaryMetrics | null;
  final_scene: {
    label: string;
    glb_url: string;
  };
  production_steps: Array<{
    step_id: string;
    title: string;
    glb_url: string;
  }>;
  default_selection: string;
  spawn_point?: [number, number, number];
  forward_vector?: [number, number, number];
  scene_bounds?: SceneBounds;
  instances?: Record<string, InstanceInfo>;
  asset_descriptions?: Record<string, AssetDescription>;
  static_object_descriptions?: Record<string, StaticObjectDescription>;
  layout_overlay?: LayoutOverlayData | null;
  audio_profile?: AudioProfile | null;
  lighting_preset?: string;
  lighting_params?: LightingPresetValues;
};
