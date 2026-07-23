/**
 * Type definitions and constants for the RoadGen3D Viewer.
 * 
 * Extracted from app.ts to improve modularity and maintainability.
 */

// ============================================================================
// Scene and Layout Types
// ============================================================================

export type SceneOption = {
  key: string;
  label: string;
  glbUrl: string;
};

export type ViewerSpatialContext = {
  junction_points_xz?: Array<[number, number]>;
  entrance_points_xz?: Array<[number, number]>;
  bus_stop_points_xz?: Array<[number, number]>;
  fire_points_xz?: Array<[number, number]>;
  poi_points_by_type_xz?: Record<string, Array<[number, number]>>;
  road_half_width_m?: number;
  length_m?: number;
};

export type ViewerPoiExclusionZone = {
  poi_type?: string;
  position_xz?: [number, number];
  radius_m?: number;
  rule_name?: string;
};

export type ViewerSummary = Record<string, unknown> & {
  spatial_context?: ViewerSpatialContext;
  poi_exclusion_zones?: ViewerPoiExclusionZone[];
  osm_geometry?: Record<string, unknown>;
};

export type ViewerLayoutRevision = {
  lineage_id: string;
  revision: number;
  sha256: string;
};

export type SurfaceDiagnosticRole =
  | "context_ground"
  | "carriageway"
  | "curb"
  | "sidewalk"
  | "furnishing"
  | "frontage"
  | "planting"
  | "crossing"
  | "lane_mark"
  | "building";

export type SurfaceDiagnosticPatch = {
  patch_id: string;
  junction_id?: string;
  surface_role?: string;
  strip_kind?: string;
  quadrant_id?: string;
  from_road_id?: number;
  to_road_id?: number;
  rings_xz?: Array<Array<[number, number]>>;
};

export type SurfaceDiagnosticCurbRamp = {
  ramp_id: string;
  center_xz: [number, number];
  outward_axis_xz?: [number, number];
  footprint_xz?: Array<[number, number]>;
  length_along_curb_m?: number;
  run_m?: number;
  rise_m?: number;
  influence_radius_m?: number;
  source_crossing_indices?: number[];
};

export type SurfaceDiagnosticManifest = {
  schema_version: "roadgen3d.surface-diagnostic.v1";
  coordinate_space: "local_xz_m";
  source?: "final_glb_top_faces" | string;
  node_roles: Record<string, SurfaceDiagnosticRole | string>;
  curb_access_ramps?: SurfaceDiagnosticCurbRamp[];
  patch_provenance?: SurfaceDiagnosticPatch[];
  junction_arm_profiles?: Array<Record<string, unknown>>;
  geometry_qa?: Record<string, unknown>;
};


export type ViewerManifest = {
  layout_path?: string;
  layout_revision?: ViewerLayoutRevision;
  instance_name_map?: Record<string, string>;
  context_massing?: {
    editable: false;
    summary?: Record<string, unknown>;
    source?: Record<string, unknown>;
    source_alignment?: Record<string, unknown>;
  };
  lighting_preset?: string;
  lighting_params?: Record<string, unknown>;
  environment_state?: Record<string, unknown> | null;
  default_selection?: string;
  static_object_descriptions?: Record<string, StaticObjectDescription>;
  summary?: ViewerSummary;
  visual_style?: Record<string, unknown>;
  solver_metrics?: Record<string, unknown>;
  surface_diagnostic?: SurfaceDiagnosticManifest;
  final_scene: {
    glb_url: string;
    label: string;
    artifact_id?: string;
  };
  production_steps?: Array<{
    step_id: string;
    title: string;
    glb_url: string;
    artifact_id?: string;
  }>;
  instances?: Record<string, Record<string, unknown>>;
  asset_descriptions?: Record<string, unknown>;
  audio_profile?: Record<string, unknown>;
  comparison_metadata?: ViewerComparisonMetadata;
  spawn_point?: [number, number, number];
  forward_vector?: [number, number, number];
  scene_bounds?: {
    center: [number, number, number];
    size: [number, number, number];
    road_axis: [number, number, number];
  };
  layout_overlay?: {
    bands?: Array<Record<string, unknown>>;
    road_centerlines?: Array<{
      road_id?: string | number;
      points_xz?: Array<[number, number]>;
    }>;
    building_footprints?: Array<Record<string, unknown>>;
    generated_lots?: Array<Record<string, unknown>>;
    building_regions?: Array<Record<string, unknown>>;
    regions?: Array<Record<string, unknown>>;
    derived_regions?: Array<Record<string, unknown>>;
    functional_zones?: Array<Record<string, unknown>>;
    surface_annotations?: Array<Record<string, unknown>>;
    length_m?: number;
    lane_count?: number;
    road_width_m?: number;
  };
};

export type ViewerComparisonMetadata = {
  preset_id?: string;
  preset_label?: string;
  scenario_id?: string;
  scenario_title?: string;
  graph_template_id?: string;
  skeleton_design_profile?: string;
  street_furniture_profile?: string;
  curated_street_assets_profile?: string;
  furniture_balance_policy?: string;
  prompt?: string;
  variant_id?: string;
  variant_name?: string;
  random_seed?: number;
  density?: number;
  road_width_m?: number;
  lane_count?: number;
  style_preset?: string;
  instance_count?: number;
  production_step_ids?: string[];
};

export type ComparisonItem = {
  scheme_id: string;
  variant_name?: string;
  layout_path: string;
  metadata?: ViewerComparisonMetadata;
};

export type ComparisonGroup = {
  id: string;
  title?: string;
  created_at?: string;
  source?: string;
  items: ComparisonItem[];
};

export type InstanceInfo = {
  instance_id: string;
  stable_id?: string;
  object_names?: string[];
  editable?: boolean;
  asset_id: string;
  category: string;
  placement_group?: string;
  theme_id?: string;
  selection_source?: string;
  position_xyz?: [number, number, number];
  bbox_xz?: [number, number, number, number];
  anchor_poi_type?: string;
  anchor_target_xz?: [number, number];
  anchor_distance_m?: number;
  feasibility_score?: number;
  constraint_penalty?: number;
  dist_to_road_edge_m?: number;
  dist_to_nearest_junction_m?: number;
  dist_to_nearest_entrance_m?: number;
  violated_rules?: string[];
};

export type AssetDescription = {
  asset_id: string;
  category: string;
  text_desc: string;
  source: string;
  asset_role?: string;
};

export type StaticObjectDescription = {
  match: "exact" | "prefix";
  title: string;
  category: string;
  intro: string;
  source?: string;
  design_note?: string;
};

export type FloatingLaneConfig = {
  enabled: boolean;
  showLabels: boolean;
  showSurfaces: boolean;
  showBuildings?: boolean;
  showFeatures?: boolean;
  showPlacementMarkers?: boolean;
  surfaceColor?: string;
  laneOpacity?: number;
  buildingOpacity?: number;
  featureOpacity?: number;
  height?: number;
  colorScheme?: string;
  selectedLaneIndex?: number;
  showEdgeLines?: boolean;
  opacity?: number;
  animated?: boolean;
};

export const FLOATING_LANE_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
];

export const FLOATING_LANE_LABELS = [
  "Drive Lane", "Bus Lane", "Bike Lane", "Parking",
  "Median", "Buffer", "Sidewalk", "Frontage",
];

export const PER_LANE_COLORS: Record<string, string> = {
  drive_lane: "#424a57",
  bus_lane: "#b7483a",
  bike_lane: "#39875a",
  parking_lane: "#a68256",
  median: "#6e7a5f",
  nearroad_buffer: "#c4c4c4",
  nearroad_furnishing: "#b5a28a",
  clear_sidewalk: "#d4d0c8",
  frontage_reserve: "#b7d4e6",
  grass_belt: "#8cb369",
};

export type RecentLayout = {
  id: string;
  label: string;
  layout_path: string;
  created_at: string;
  source?: string;
  scene_layout_path?: string;
  metrics?: Record<string, number>;
  preset_id?: string;
  relative_path?: string;
  updated_at?: string;
  mtime_ms?: number;
};

export type SceneJobCreatePayload = {
  job_id: string;
  status: string;
  draft: {
    normalized_scene_query: string;
    compose_config_patch: Record<string, unknown>;
    citations_by_field: Record<string, string[]>;
    design_summary: string;
    risk_notes: string[];
    parameter_sources_by_field: Record<string, string>;
  };
  scene_context: {
    layout_mode: string;
    aoi_bbox: string | null;
    city_name_en: string | null;
    reference_plan_id: string | null;
    graph_template_id: string;
    scenario_id?: string | null;
    scenario_title?: string | null;
    scenario_design_variant?: Record<string, unknown> | null;
    template_patch?: Record<string, unknown> | null;
  };
  patch_overrides: Record<string, unknown>;
  generation_options: {
    preset_id: string;
    random_seed?: number;
    scenario_id?: string;
    scenario_compose_patch_applied?: boolean;
  };
};
