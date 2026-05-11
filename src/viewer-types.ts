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

export type ViewerManifest = {
  layout_path?: string;
  lighting_preset?: string;
  lighting_params?: Record<string, unknown>;
  environment_state?: Record<string, unknown> | null;
  default_selection?: string;
  static_object_descriptions?: Record<string, StaticObjectDescription>;
  summary?: ViewerSummary;
  visual_style?: Record<string, unknown>;
  final_scene: {
    glb_url: string;
    label: string;
  };
  production_steps?: Array<{
    step_id: string;
    title: string;
    glb_url: string;
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

export type SceneJobStatusPayload = {
  job_id: string;
  status: "queued" | "running" | "processing" | "succeeded" | "failed";
  stage?: string;
  progress?: number;
  operations?: Array<{
    name?: string;
    stage: string;
    status?: string;
    progress: number;
    message: string;
    detail?: Record<string, unknown>;
  }>;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
  result?: SceneJobResult;
  trace?: GenerationTrace;
};

export type SceneJobResult = {
  compose_config?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  plan_id?: string;
  layout_path?: string;
  scene_layout_path?: string;
  scene_glb_path?: string;
  viewer_url?: string;
};

export type SceneJobOperation = string | {
  name?: string;
  status?: string;
  message?: string;
  stage?: string;
  progress?: number;
  detail?: Record<string, unknown>;
  timestamp?: string;
};

export type ScenarioDesign = {
  scenario_id: string;
  title_zh: string;
  scenario_type: string;
  enabled?: boolean;
  excluded_reason_zh?: string;
  query: string;
  intent_zh?: string;
  road_section?: Record<string, unknown>;
  edge_context?: Record<string, unknown>;
  region_count?: number;
  scene_region_count?: number;
  region_override_count?: number;
  functional_zone_count: number;
  surface_annotation_count: number;
  surface_role_counts?: Record<string, number>;
  template_patch_operation_count?: number;
  compose_config_patch?: Record<string, unknown>;
  preview_layout_path: string;
  preview_layout_exists?: boolean;
  template_patch?: Record<string, unknown>;
  semantic_edits?: Array<Record<string, unknown>>;
  resolved_defaults?: Array<Record<string, unknown>>;
  warnings?: string[];
  citations?: Array<Record<string, unknown>>;
  annotation?: Record<string, unknown>;
  annotation_summary?: Record<string, unknown>;
  prompt?: string;
  llm_requested?: boolean;
  llm_used?: boolean;
  fallback_reason?: string;
  semantic_parse_method?: string;
};

export type ScenarioDraftVariantPayload = {
  scenario_id: string;
  title_zh?: string;
  scenario_type?: string;
  graph_template_id: string;
  prompt?: string;
  semantic_edits?: Array<Record<string, unknown>>;
  resolved_defaults?: Array<Record<string, unknown>>;
  template_patch?: Record<string, unknown>;
  annotation?: Record<string, unknown>;
  annotation_summary?: Record<string, unknown>;
  citations?: Array<Record<string, unknown>>;
  warnings?: string[];
  llm_requested?: boolean;
  llm_used?: boolean;
  fallback_reason?: string;
  semantic_parse_method?: string;
};

export type ScenarioDesignRunSummary = {
  run_id: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  report_path?: string;
};

export type ScenarioDesignCatalogPayload = {
  schema_version: string;
  graph_template_id: string;
  catalog_path?: string;
  items: ScenarioDesign[];
  runs?: ScenarioDesignRunSummary[];
};

export type ScenarioDesignRunItem = {
  scenario_id: string;
  scenario_type?: string;
  title_zh: string;
  sample_index: number;
  seed: number;
  job_id: string;
  status: string;
  stage?: string;
  progress?: number;
  scene_layout_path?: string;
  scene_glb_path?: string;
  viewer_url?: string;
  summary?: Record<string, unknown>;
  error?: string;
};

export type ScenarioDesignRunPayload = {
  run_id: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  finished_at?: string;
  graph_template_id: string;
  samples_per_scenario: number;
  base_seed: number;
  scenario_count: number;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  manifest_path?: string;
  report_path?: string;
  items: ScenarioDesignRunItem[];
  scenarios?: ScenarioDesign[];
};

export type ScenarioDesignReportPayload = {
  run_id: string;
  status: string;
  report_path: string;
  content: string;
  content_summary?: string;
};

export type KnowledgeSourceKey = "hybrid" | "pdf_rag" | "graph_rag" | "scenario_parameters";

export type KnowledgeSourceStatus = {
  key: KnowledgeSourceKey | string;
  label: string;
  available: boolean;
  description?: string;
  artifact_count?: number;
  item_count?: number;
  artifact_path?: string;
  artifact_dir?: string;
  source_path?: string;
  fingerprint?: string;
  error?: string;
};

export type RagEvidence = {
  chunk_id: string;
  doc_id?: string;
  section_title?: string;
  page_start?: number;
  page_end?: number;
  text?: string;
  source_path?: string;
  score?: number;
  relevance_reason?: string;
  knowledge_source?: KnowledgeSourceKey | string;
  parameter_hints?: Record<string, string>;
};

export type GenerationTraceStageNode = {
  id?: string;
  stage?: string;
  label?: string;
  status?: string;
  progress?: number;
  timestamp?: string;
  children?: Array<Record<string, unknown>>;
};

export type GenerationTrace = {
  schema_version?: string;
  job_id?: string;
  run_id?: string;
  node_id?: string;
  status?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
  provenance?: {
    rag_evidence?: RagEvidence[];
    rag_queries?: string[];
    citations_by_field?: Record<string, string[]>;
    parameter_sources_by_field?: Record<string, string>;
    knowledge_source?: KnowledgeSourceKey | string;
    evidence_count?: number;
  };
  llm_recommendation?: {
    normalized_scene_query?: string;
    design_summary?: string;
    config_patch?: Record<string, unknown>;
    raw_fields?: string[];
    defaulted_fields?: string[];
    overridden_fields?: string[];
    risk_notes?: string[];
    derivation_status?: string;
  };
  process?: {
    current_stage?: string;
    progress?: number;
    growth_tree_node?: Record<string, unknown>;
    stage_tree?: GenerationTraceStageNode[];
    operations?: SceneJobOperation[];
  };
  result?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
};

export type DesignRunSnapshot = {
  payload: SceneJobStatusPayload;
  preset: DesignPreset | null;
  variant: DesignSchemeVariant;
  prompt: string;
  graphTemplateId: string;
};

export type DesignSemanticSummary = {
  skeletonLabel: string;
  skeletonProfile?: string;
  streetFurnitureLabel: string;
  streetFurnitureProfile?: string;
};

// ============================================================================
// Design Presets and Variants
// ============================================================================

export const DESIGN_POLL_INTERVAL_MS = 1500;
export const DESIGN_MAX_POLL_ATTEMPTS = 240;

export const DESIGN_SCHEME_VARIANTS: DesignSchemeVariant[] = [
  { id: "A", name: "Scheme A", densityMod: 1.0, widthMod: 1.0, seed: 42 },
  { id: "B", name: "Scheme B", densityMod: 1.2, widthMod: 0.9, seed: 137 },
  { id: "C", name: "Scheme C", densityMod: 0.8, widthMod: 1.1, seed: 256 },
];

export type DesignPreset = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  prompt: string;
  color?: string;
  configPatch: Record<string, unknown>;
};

export type DesignSchemeVariant = {
  id: string;
  name: string;
  densityMod: number;
  widthMod: number;
  seed: number;
};

export const SKELETON_DESIGN_PROFILE_OPTIONS = [
  { id: "child_friendly_school", label: "儿童友好学校 / Child-Friendly School" },
  { id: "walkable_commercial", label: "步行商业 / Walkable Commercial" },
  { id: "vehicle_access_commercial", label: "车行可达商业 / Vehicle Access Commercial" },
  { id: "transit_priority", label: "公交优先 / Transit Priority" },
  { id: "green_walkable", label: "绿色慢行 / Green Walkable" },
  { id: "quiet_residential", label: "安静居住 / Quiet Residential" },
] as const;

export const STREET_FURNITURE_PROFILE_OPTIONS = [
  { id: "balanced_complete", label: "平衡完整 / Balanced Complete" },
  { id: "pedestrian_friendly", label: "步行友好 / Pedestrian Friendly" },
  { id: "commercial_vitality", label: "商业活力 / Commercial Vitality" },
  { id: "transit_priority", label: "公交优先 / Transit Priority" },
  { id: "park_landscape", label: "公园景观 / Park Landscape" },
  { id: "quiet_residential", label: "安静居住 / Quiet Residential" },
] as const;

// ============================================================================
// Branch Run Types
// ============================================================================

export type BranchRunCreatePayload = {
  prompt: string;
  topk: number;
  rounds: number;
  target_samples?: number;
  search_mode?: "llm_branch" | "pareto" | string;
  early_stop_patience?: number;
  retain_topk_artifacts?: number;
  score_with_rendered_views?: boolean;
  graph_template_id: string;
  knowledge_source: string;
  scene_context: Record<string, unknown>;
  generation_options: Record<string, unknown>;
  preset_id?: string;
  preset_config_patch?: Record<string, unknown>;
  benchmark_id?: string;
  batch_id?: string;
  persist_to_benchmark?: boolean;
  evaluation_weights: Record<string, number>;
};

export type BranchInfluenceRow = {
  id: string;
  group: "knowledge" | "parameters" | "llm_constraints" | string;
  source_type: "rag" | "parameter_triple" | "llm_patch" | "search_patch" | "directive" | "constraint" | string;
  label: string;
  detail?: string;
  field?: string;
  value?: unknown;
  old_value?: unknown;
  unit?: string;
  score?: number | null;
  confidence?: number | null;
  active?: boolean;
  chunk_id?: string;
  source?: string;
  knowledge_source?: string;
  rank?: number;
};

export type BranchRunNode = {
  node_id: string;
  parent_id: string | null;
  depth: number;
  rank: number;
  status: string;
  score: number | null;
  scene_layout_path?: string;
  scene_glb_path?: string;
  artifacts_retained?: boolean;
  artifact_rank?: number | null;
  artifact_paths?: string[];
  can_restore_artifact?: boolean;
  evaluation?: Record<string, unknown>;
  trace?: GenerationTrace;
  config_patch?: Record<string, unknown>;
  llm_candidate_reasoning?: string;
  optimization_directives?: Array<Record<string, unknown>>;
  rejected_edits?: Array<Record<string, unknown>>;
  rag_evidence?: RagEvidence[];
  influence_rows?: BranchInfluenceRow[];
  analysis_features?: BenchmarkAnalysisFeatures;
  preset_id?: string;
  preset_name?: string;
  preset_color?: string;
  error?: string;
};

export type BranchScatterPoint = {
  node_id: string;
  parent_id?: string | null;
  x: number | null;
  y: number | null;
  z?: number | null;
  overall: number | null;
  walkability?: number | null;
  safety?: number | null;
  beauty?: number | null;
  delta_walkability?: number | null;
  delta_safety?: number | null;
  delta_beauty?: number | null;
  delta_overall?: number | null;
  is_pareto_front?: boolean;
  pareto_rank?: number | null;
  dominated_by_count?: number;
  influence_summary?: Array<Pick<BranchInfluenceRow, "id" | "group" | "source_type" | "label" | "active">>;
  depth: number;
  rank: number;
  status: string;
  label?: string;
  preset_id?: string;
  preset_name?: string;
  preset_label?: string;
  preset_color?: string;
  sample_id?: string;
  analysis_features?: BenchmarkAnalysisFeatures;
};

export type BranchRunStatusPayload = {
  run_id: string;
  status: string;
  stage?: string;
  progress?: number;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  prompt?: string;
  topk?: number;
  rounds?: number;
  target_samples?: number | null;
  search_mode?: "llm_branch" | "pareto" | string;
  preset_id?: string;
  preset_name?: string;
  preset_color?: string;
  preset_config_patch?: Record<string, unknown>;
  benchmark_id?: string;
  batch_id?: string;
  persist_to_benchmark?: boolean;
  early_stop_patience?: number | null;
  early_stop_triggered?: boolean;
  early_stop_reason?: string;
  retain_topk_artifacts?: number | null;
  score_with_rendered_views?: boolean;
  retained_artifact_nodes?: string[];
  retained_artifact_count?: number;
  completed_samples?: number;
  attempted_samples?: number;
  graph_template_id?: string;
  best_node_id?: string;
  frontier?: string[];
  pareto_front?: string[];
  pareto_front_size?: number;
  nodes?: BranchRunNode[];
  scatter_points?: BranchScatterPoint[];
  error?: string;
};

export type BenchmarkSample = {
  sample_id: string;
  source?: string;
  run_id?: string;
  node_id?: string;
  parent_id?: string;
  benchmark_id?: string;
  batch_id?: string;
  preset_id: string;
  preset_name?: string;
  preset_label?: string;
  preset_color?: string;
  label?: string;
  prompt?: string;
  graph_template_id?: string;
  knowledge_source?: string;
  scene_layout_path?: string;
  scene_glb_path?: string;
  walkability: number | null;
  safety: number | null;
  beauty: number | null;
  overall: number | null;
  x?: number | null;
  y?: number | null;
  z?: number | null;
  delta_walkability?: number | null;
  delta_safety?: number | null;
  delta_beauty?: number | null;
  delta_overall?: number | null;
  is_pareto_front?: boolean;
  pareto_rank?: number | null;
  dominated_by_count?: number;
  depth?: number;
  rank?: number;
  status?: string;
  influence_rows?: BranchInfluenceRow[];
  config_patch?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
  artifacts_retained?: boolean;
  artifact_rank?: number | null;
  artifact_paths?: string[];
  can_restore_artifact?: boolean;
  analysis_features?: BenchmarkAnalysisFeatures;
  created_at?: string;
};

export type BenchmarkAnalysisFeatures = {
  input?: Record<string, unknown>;
  scene?: Record<string, unknown>;
  derived?: Record<string, unknown>;
  layout_available?: boolean;
  layout_error?: string;
};

export type BenchmarkAnalysisSample = {
  sample_id: string;
  run_id?: string;
  node_id?: string;
  parent_id?: string;
  preset_id: string;
  preset_name?: string;
  preset_label?: string;
  preset_color?: string;
  label?: string;
  scene_layout_path?: string;
  input_features: Record<string, unknown>;
  scene_features: Record<string, unknown>;
  derived_features: Record<string, unknown>;
  layout_available?: boolean;
  layout_error?: string;
  outcome: Record<"walkability" | "safety" | "beauty" | "overall", number | null>;
  delta_outcome?: Record<"walkability" | "safety" | "beauty" | "overall", number | null>;
  meta?: Record<string, unknown>;
};

export type BenchmarkCorrelationMode = "pooled" | "within_preset" | "preset_residual" | "delta";

export type BenchmarkCorrelationRow = {
  mode: BenchmarkCorrelationMode | string;
  preset_id?: string | null;
  feature: string;
  outcome: "walkability" | "safety" | "beauty" | "overall" | string;
  rho: number | null;
  p_value?: number | null;
  n: number;
};

export type BenchmarkCategoricalEffect = {
  feature: string;
  outcome: "walkability" | "safety" | "beauty" | "overall" | string;
  test: string;
  statistic?: number | null;
  p_value?: number | null;
  n: number;
  category_count: number;
  group_means?: Record<string, number>;
};

export type BenchmarkFeatureImportance = {
  outcome: "walkability" | "safety" | "beauty" | "overall" | string;
  feature: string;
  importance: number | null;
  std?: number | null;
  rank: number;
  n: number;
  direction?: number | null;
};

export type BenchmarkAnalysisPayload = {
  samples?: BenchmarkAnalysisSample[];
  correlations?: BenchmarkCorrelationRow[];
  categorical_effects?: BenchmarkCategoricalEffect[];
  feature_importance?: BenchmarkFeatureImportance[];
  summaries?: BenchmarkPresetSummary[];
  total?: number;
  updated_at?: string;
  warnings?: string[];
};

export type BenchmarkPresetSummary = {
  preset_id: string;
  preset_name?: string;
  preset_label?: string;
  preset_color?: string;
  sample_count: number;
  centroid?: Record<string, number | null>;
  ranges?: Record<string, { min: number | null; max: number | null }>;
  top_overall?: number;
  pareto_front_count?: number;
  early_stop_count?: number;
};

export type BenchmarkSamplesPayload = {
  items?: BenchmarkSample[];
  summaries?: BenchmarkPresetSummary[];
  total?: number;
  updated_at?: string;
};

export type BenchmarkBatchStatusPayload = {
  batch_id: string;
  benchmark_id?: string;
  status: string;
  progress?: number;
  current_preset_id?: string;
  children?: Array<BenchmarkPresetSummary & {
    run_id?: string;
    status: string;
    completed_samples?: number;
    attempted_samples?: number;
    early_stop_triggered?: boolean;
    early_stop_reason?: string;
    error?: string;
  }>;
  completed_presets?: number;
  failed_presets?: number;
  error?: string;
};

// ============================================================================
// Generation Steps
// ============================================================================

export type GenerationStep = {
  key: string;
  label: string;
  shortLabel: string;
  progress: number;
  purpose: string;
  detailHint: string;
};

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_GRAPH_TEMPLATE_ID = "hkust_gz_gate";

export const VIEWER_DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "balanced_complete",
    name: "平衡街道",
    nameEn: "Balanced",
    description: "各类使用者平衡",
    prompt: "各类使用者平衡的完整街道，行人、自行车、公交、机动车和谐共处",
    color: "#607D8B",
    configPatch: {
      street_furniture_profile: "balanced_complete",
      street_furniture_profile_source: "manual",
      street_furniture_profile_confidence: 1,
      street_furniture_profile_reasons: ["preset:selected"],
      design_rule_profile: "balanced_complete_street_v1",
      objective_profile: "balanced",
      density: 0.6,
      ped_demand_level: "medium",
      bike_demand_level: "medium",
      transit_demand_level: "medium",
      vehicle_demand_level: "medium",
    },
  },
  {
    id: "pedestrian_friendly",
    name: "步行友好",
    nameEn: "Pedestrian Friendly",
    description: "行人优先，安全舒适",
    prompt: "步行安全，全龄友好的完整街道，安静、安全、舒适",
    color: "#4CAF50",
    configPatch: {
      street_furniture_profile: "pedestrian_friendly",
      street_furniture_profile_source: "manual",
      street_furniture_profile_confidence: 1,
      street_furniture_profile_reasons: ["preset:selected"],
      design_rule_profile: "pedestrian_priority_v1",
      objective_profile: "balanced",
      density: 0.5,
      ped_demand_level: "high",
      bike_demand_level: "medium",
      transit_demand_level: "medium",
      vehicle_demand_level: "low",
    },
  },
  {
    id: "commercial_vitality",
    name: "商业活力",
    nameEn: "Commerce",
    description: "商业活跃，人流密集",
    prompt: "商业活跃的街道，商业设施密集，人流穿梭",
    color: "#FF9800",
    configPatch: {
      street_furniture_profile: "commercial_vitality",
      street_furniture_profile_source: "manual",
      street_furniture_profile_confidence: 1,
      street_furniture_profile_reasons: ["preset:selected"],
      design_rule_profile: "balanced_complete_street_v1",
      objective_profile: "commerce",
      density: 0.9,
      ped_demand_level: "high",
      bike_demand_level: "medium",
      transit_demand_level: "high",
      vehicle_demand_level: "medium",
    },
  },
  {
    id: "transit_priority",
    name: "公交优先",
    nameEn: "Transit",
    description: "公交导向，换乘便利",
    prompt: "公交优先的街道，公交可达性高，换乘便利",
    color: "#2196F3",
    configPatch: {
      street_furniture_profile: "transit_priority",
      street_furniture_profile_source: "manual",
      street_furniture_profile_confidence: 1,
      street_furniture_profile_reasons: ["preset:selected"],
      design_rule_profile: "transit_priority_v1",
      objective_profile: "transit",
      density: 0.85,
      ped_demand_level: "high",
      bike_demand_level: "medium",
      transit_demand_level: "high",
      vehicle_demand_level: "high",
    },
  },
  {
    id: "park_landscape",
    name: "公园景观",
    nameEn: "Greening",
    description: "绿化为主，休闲舒适",
    prompt: "公园景观街道，绿化丰富，自然生态，休闲舒适",
    color: "#8BC34A",
    configPatch: {
      street_furniture_profile: "park_landscape",
      street_furniture_profile_source: "manual",
      street_furniture_profile_confidence: 1,
      street_furniture_profile_reasons: ["preset:selected"],
      design_rule_profile: "pedestrian_priority_v1",
      objective_profile: "greening",
      density: 0.25,
      ped_demand_level: "medium",
      bike_demand_level: "medium",
      transit_demand_level: "low",
      vehicle_demand_level: "low",
    },
  },
  {
    id: "quiet_residential",
    name: "安静居住",
    nameEn: "Quiet Residential",
    description: "住宅区安静，绿树成荫",
    prompt: "安静居住街道，绿树成荫，步行安全，适合全龄",
    color: "#9C27B0",
    configPatch: {
      street_furniture_profile: "quiet_residential",
      street_furniture_profile_source: "manual",
      street_furniture_profile_confidence: 1,
      street_furniture_profile_reasons: ["preset:selected"],
      design_rule_profile: "pedestrian_priority_v1",
      objective_profile: "greening",
      density: 0.35,
      ped_demand_level: "high",
      bike_demand_level: "medium",
      transit_demand_level: "low",
      vehicle_demand_level: "low",
    },
  },
];

// Generation steps definition
export const GENERATION_STEPS: GenerationStep[] = [
  {
    key: "queued",
    label: "任务提交",
    shortLabel: "提交",
    progress: 5,
    purpose: "任务已经提交到后端 job service，等待 worker 接手执行。",
    detailHint: "任务已提交，正在等待后端 worker 接手。",
  },
  {
    key: "context_resolving",
    label: "上下文解析",
    shortLabel: "上下文",
    progress: 15,
    purpose: "把 prompt、preset、graph template 或外部道路上下文合并成可生成的 StreetComposeConfig。",
    detailHint: "Resolving road graph, POI, and placement context.",
  },
  {
    key: "asset_loading",
    label: "资产加载",
    shortLabel: "资产",
    progress: 25,
    purpose: "加载对象 manifest、建筑资产、地面材质、天空环境和检索索引。",
    detailHint: "Loading object and building asset inventories.",
  },
  {
    key: "layout_generation",
    label: "布局生成",
    shortLabel: "布局",
    progress: 40,
    purpose: "生成道路网络、交叉口和基础布局结构。",
    detailHint: "Solving road segments, intersections, and cross-sections.",
  },
  {
    key: "constraint_solving",
    label: "约束求解",
    shortLabel: "约束",
    progress: 50,
    purpose: "检查并调整布局以满足设计规则和合规性要求。",
    detailHint: "Applying design rules and compliance checks.",
  },
  {
    key: "asset_composition",
    label: "资产组合",
    shortLabel: "组合",
    progress: 65,
    purpose: "使用 CLIP 语义检索和放置街道家具到场景中。",
    detailHint: "Placing street furniture via semantic retrieval.",
  },
  {
    key: "mesh_generation",
    label: "网格生成",
    shortLabel: "网格",
    progress: 75,
    purpose: "合并所有资产为完整的 3D 场景网格。",
    detailHint: "Merging geometry and computing scene mesh.",
  },
  {
    key: "glb_export",
    label: "GLB 导出",
    shortLabel: "导出",
    progress: 88,
    purpose: "将场景导出为 GLB 格式供 Viewer 加载。",
    detailHint: "Exporting scene.glb and scene_layout.json.",
  },
  {
    key: "scene_rendering",
    label: "场景渲染",
    shortLabel: "渲染",
    progress: 95,
    purpose: "应用光照、材质和阴影生成最终场景。",
    detailHint: "Applying lighting, materials, and tone mapping.",
  },
  {
    key: "finalizing",
    label: "结果整理",
    shortLabel: "整理",
    progress: 96,
    purpose: "写入 scene_layout.json、summary、metrics、render paths 和最终加载入口。",
    detailHint: "Writing final scene layout payload.",
  },
  {
    key: "evaluation",
    label: "自动评价",
    shortLabel: "评估",
    progress: 99,
    purpose: "读取刚写出的 scene_layout.json 并计算统一评价。",
    detailHint: "Evaluating generated scene.",
  },
  {
    key: "succeeded",
    label: "生成完成",
    shortLabel: "完成",
    progress: 100,
    purpose: "场景已成功生成并准备加载到 Viewer。",
    detailHint: "Scene generation completed.",
  },
];
