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

export type ViewerManifest = {
  layout_path?: string;
  lighting_preset?: string;
  lighting_params?: Record<string, unknown>;
  default_selection?: string;
  static_object_descriptions?: Record<string, StaticObjectDescription>;
  summary?: Record<string, unknown>;
  final_scene: {
    glb_url: string;
    label: string;
  };
  production_steps?: Array<{
    step_id: string;
    title: string;
    glb_url: string;
  }>;
  instances?: Array<Record<string, unknown>>;
  asset_descriptions?: Record<string, unknown>;
  audio_profile?: Record<string, unknown>;
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
    length_m?: number;
    lane_count?: number;
    road_width_m?: number;
  };
  summary?: Record<string, unknown>;
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
  anchor_distance_m?: number;
  feasibility_score?: number;
  constraint_penalty?: number;
  dist_to_road_edge_m?: number;
  dist_to_nearest_junction_m?: number;
  dist_to_nearest_entrance_m?: number;
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
  };
  patch_overrides: Record<string, unknown>;
  generation_options: {
    preset_id: string;
    random_seed?: number;
  };
};

export type SceneJobStatusPayload = {
  job_id: string;
  status: "queued" | "running" | "processing" | "succeeded" | "failed";
  stage?: string;
  progress?: number;
  operations?: Array<{
    stage: string;
    progress: number;
    message: string;
    detail?: Record<string, unknown>;
  }>;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
  result?: SceneJobResult;
};

export type SceneJobResult = {
  plan_id: string;
  layout_path: string;
  scene_glb_path: string;
  viewer_url?: string;
};

export type DesignRunSnapshot = {
  payload: SceneJobStatusPayload;
  preset: DesignPreset | null;
  variant: DesignSchemeVariant;
  prompt: string;
  graphTemplateId: string;
};

// ============================================================================
// Design Presets and Variants
// ============================================================================

export type DesignPreset = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  prompt: string;
  configPatch: Record<string, unknown>;
};

export type DesignSchemeVariant = {
  id: string;
  name: string;
  densityMod: number;
  widthMod: number;
  seed: number;
};

export type SceneJobResult = {
  scene_layout_path: string;
  scene_glb_path?: string;
  scene_ply_path?: string;
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

// ============================================================================
// Branch Run Types
// ============================================================================

export type BranchRunCreatePayload = {
  prompt: string;
  topk: number;
  rounds: number;
  graph_template_id: string;
  knowledge_source: string;
  scene_context: Record<string, unknown>;
  generation_options: Record<string, unknown>;
  evaluation_weights: Record<string, number>;
};

export type BranchRunNode = {
  node_id: string;
  parent_id: string | null;
  depth: number;
  rank: number;
  status: string;
  score: number | null;
  scene_layout_path?: string;
  evaluation?: Record<string, number>;
  config_patch?: Record<string, unknown>;
  llm_candidate_reasoning?: string;
  optimization_directives?: Array<Record<string, unknown>>;
  rejected_edits?: Array<Record<string, unknown>>;
  rag_evidence?: Array<Record<string, unknown>>;
  error?: string;
};

export type BranchScatterPoint = {
  node_id: string;
  x: number | null;
  y: number | null;
  overall: number | null;
  depth: number;
  rank: number;
  status: string;
};

export type BranchRunStatusPayload = {
  run_id: string;
  status: string;
  stage?: string;
  progress?: number;
  prompt?: string;
  topk?: number;
  graph_template_id?: string;
  best_node_id?: string;
  frontier?: string[];
  nodes?: BranchRunNode[];
  scatter_points?: BranchScatterPoint[];
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
export const DESIGN_POLL_INTERVAL_MS = 2000;
export const DESIGN_MAX_POLL_ATTEMPTS = 90;

export const DESIGN_SCHEME_VARIANTS: DesignSchemeVariant[] = [
  { name: "Scheme A", seed: 42, densityMod: 1.0, widthMod: 1.0 },
  { name: "Scheme B", seed: 137, densityMod: 1.15, widthMod: 0.9 },
  { name: "Scheme C", seed: 256, densityMod: 0.85, widthMod: 1.1 },
];

export const VIEWER_DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "pedestrian_friendly",
    name: "步行友好",
    nameEn: "Pedestrian Friendly",
    description: "行人优先，安全舒适",
    prompt: "步行安全，全龄友好的完整街道，安静、安全、舒适",
    configPatch: {
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
    nameEn: "Commercial Vitality",
    description: "商业活跃，人流密集",
    prompt: "商业活跃的街道，商业设施密集，人流穿梭",
    configPatch: {
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
    nameEn: "Transit Priority",
    description: "公交导向，换乘便利",
    prompt: "公交优先的街道，公交可达性高，换乘便利",
    configPatch: {
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
    nameEn: "Park Landscape",
    description: "绿化为主，休闲舒适",
    prompt: "公园景观街道，绿化丰富，自然生态，休闲舒适",
    configPatch: {
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
    configPatch: {
      design_rule_profile: "pedestrian_priority_v1",
      objective_profile: "greening",
      density: 0.35,
      ped_demand_level: "high",
      bike_demand_level: "medium",
      transit_demand_level: "low",
      vehicle_demand_level: "low",
    },
  },
  {
    id: "balanced_complete",
    name: "平衡街道",
    nameEn: "Balanced Complete",
    description: "各类使用者平衡",
    prompt: "各类使用者平衡的完整街道，行人、自行车、公交、机动车和谐共处",
    configPatch: {
      design_rule_profile: "balanced_complete_street_v1",
      objective_profile: "balanced",
      density: 0.6,
      ped_demand_level: "medium",
      bike_demand_level: "medium",
      transit_demand_level: "medium",
      vehicle_demand_level: "medium",
    },
  },
];

// Generation steps definition
export const GENERATION_STEPS: GenerationStep[] = [
  {
    key: "queued",
    label: "任务排队中",
    shortLabel: "排队",
    progress: 5,
    purpose: "等待后端服务处理生成请求。",
    detailHint: "任务已进入队列，排队等待处理。",
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
    key: "layout_generation",
    label: "布局模式",
    shortLabel: "布局",
    progress: 30,
    purpose: "生成道路网络、交叉口和基础布局结构。",
    detailHint: "Solving road segments, intersections, and cross-sections.",
  },
  {
    key: "constraint_solving",
    label: "约束求解",
    shortLabel: "约束",
    progress: 45,
    purpose: "检查并调整布局以满足设计规则和合规性要求。",
    detailHint: "Applying design rules and compliance checks.",
  },
  {
    key: "asset_composition",
    label: "资产组合",
    shortLabel: "资产",
    progress: 60,
    purpose: "使用 CLIP 语义检索和放置街道家具到场景中。",
    detailHint: "Placing street furniture via semantic retrieval.",
  },
  {
    key: "mesh_generation",
    label: "网格生成",
    shortLabel: "网格",
    progress: 70,
    purpose: "合并所有资产为完整的 3D 场景网格。",
    detailHint: "Merging geometry and computing scene mesh.",
  },
  {
    key: "scene_rendering",
    label: "场景渲染",
    shortLabel: "渲染",
    progress: 80,
    purpose: "应用光照、材质和阴影生成最终场景。",
    detailHint: "Applying lighting, materials, and tone mapping.",
  },
  {
    key: "glb_export",
    label: "GLB 导出",
    shortLabel: "导出",
    progress: 90,
    purpose: "将场景导出为 GLB 格式供 Viewer 加载。",
    detailHint: "Exporting scene.glb and scene_layout.json.",
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
