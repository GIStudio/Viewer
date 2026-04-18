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

// Floating Lane Overlay types
export type FloatingLaneConfig = {
  enabled: boolean;
  height: number;           // 悬浮高度 (m)
  opacity: number;         // 透明度 0-1
  showEdgeLines: boolean;   // 显示边界线
  showLabels: boolean;       // 显示车道标签
  animated: boolean;        // 动画脉冲效果
  colorScheme: "semantic" | "functional" | "safety";
  selectedLaneIndex: number;
  showBuildings: boolean;    // 显示建筑物悬浮层
  showFeatures: boolean;    // 显示地物悬浮层（树木等）
  buildingOpacity: number;   // 建筑物透明度
  featureOpacity: number;    // 地物透明度
};

export type FloatingLaneState = FloatingLaneConfig & {
  visibleLaneKinds: Set<string>;
};

export const FLOATING_LANE_COLORS: Record<string, number> = {
  // 车道类型 - Semantic
  carriageway: 0x3b82f6,    // 蓝色 - 机动车道
  drive_lane: 0x60a5fa,     // 浅蓝
  bike_lane: 0x22c55e,      // 绿色 - 自行车道
  bus_lane: 0xf59e0b,      // 橙色 - 公交专用
  parking_lane: 0x6b7280,   // 灰色

  // 行人区 - Semantic
  clear_path: 0xfaf5e6,     // 米白 - 清晰路径
  furnishing: 0x92400e,     // 棕色 - 设施带
  sidewalk: 0xd4c4a8,      // 浅棕

  // 特殊 - Semantic
  median: 0xf97316,        // 橙红
  greenzone: 0x16a34a,     // 深绿
  buffer: 0x8b5cf6,        // 紫色
  frontage: 0x06b6d4,      // 青色
  shared: 0xa78bfa,        // 薰衣草

  // Building types
  building: 0x8b5cf6,      // 紫色 - 建筑物
  building_residential: 0x6366f1, // 靛蓝 - 住宅
  building_commercial: 0xf43f5e,   // 玫红 - 商业
  building_industrial: 0x78716c,   // 灰棕 - 工业

  // Feature types
  tree: 0x16a34a,         // 深绿 - 树木
  lamp: 0xeab308,         // 黄色 - 路灯
  bench: 0x78350f,        // 深棕 - 长椅
  trash: 0x6b7280,        // 灰色 - 垃圾桶
  bollard: 0xf59e0b,       // 橙色 - 阻车桩
  bus_stop: 0x3b82f6,      // 蓝色 - 公交站

  // 默认
  default: 0x94a3b8,
};

export const FLOATING_LANE_LABELS: Record<string, string> = {
  carriageway: "机动车道",
  drive_lane: "行车道",
  bike_lane: "自行车道",
  bus_lane: "公交专用",
  parking_lane: "停车带",
  clear_path: "人行区",
  furnishing: "设施带",
  sidewalk: "人行道",
  median: "中央分隔带",
  greenzone: "绿化带",
  buffer: "缓冲带",
  frontage: "退缩带",
  shared: "共享街道",
  default: "道路",
  // Building types
  building: "建筑物",
  // Feature types
  tree: "树木",
  lamp: "路灯",
  bench: "长椅",
  trash: "垃圾桶",
  bollard: "阻车桩",
  bus_stop: "公交站",
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
