import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { renderStageTree as renderG6StageTree, StageNode } from "./g6-visualization";
import { AudioManager } from "./audio-manager";
import { createCompareMode } from "./compare-mode";
import { HistoryScatterPlot, type SceneHistoryEntry } from "./history-scatter-plot";
import { HistoryFrequencyChart } from "./history-frequency-chart";
import { HistoryTrendChart } from "./history-trend-chart";
import { ThreeSystemScorePanel } from "./history-three-system-scores";
import {
  createRadarChart,
  resizeRadarCanvas,
  type SceneCompareState,
  type SceneMetrics,
} from "./scene-compare-radar";
import type {
  ViewerManifest,
  InstanceInfo,
  AssetDescription,
  StaticObjectDescription,
  FloatingLaneConfig,
  FLOATING_LANE_COLORS,
  FLOATING_LANE_LABELS,
  SceneOption,
  RecentLayout,
  DesignPreset,
  SceneJobResult,
  SceneJobStatusPayload,
  SceneJobCreatePayload,
  DesignSchemeVariant,
  BranchRunNode,
  BranchScatterPoint,
  BranchRunStatusPayload,
  SceneJobOperation,
} from "./viewer-types";
import {
  GENERATION_STEPS,
  DESIGN_SCHEME_VARIANTS,
  VIEWER_DESIGN_PRESETS,
  DEFAULT_GRAPH_TEMPLATE_ID,
  PER_LANE_COLORS,
  DESIGN_POLL_INTERVAL_MS,
  DESIGN_MAX_POLL_ATTEMPTS,
} from "./viewer-types";
import {
  requireElement,
  escapeHtml,
  clamp,
  sleep,
  disposeObject,
  asTriplet,
  isFiniteTriplet,
  createTextSprite,
  finiteOrNull,
} from "./viewer-utils";
import {
  loadManifest,
  loadRecentLayouts,
  clearManifestCache,
  clearRecentLayoutsCache,
  apiJson,
  postApiJson,
  updateQueryLayout,
  parseQueryLayoutPath,
  inferSpawnFromBbox,
} from "./viewer-api";
import {
  resolveHitDescriptor,
  buildInfoCardContent,
  formatMetric,
  type HitDescriptor,
} from "./viewer-hit-info";
import {
  sceneBoundsFromBox,
  updateMinimapCamera,
  worldToMinimap,
  drawMinimapOverlay,
  renderMinimap,
  type SceneBounds,
} from "./viewer-minimap";
import {
  exportTopDownMapPng,
  exportTopDownMapSvg,
} from "./viewer-export";
import { API_BASE } from "./sg-constants";
import type { DesktopShell } from "./desktop-shell";

type RecentLayoutsPayload = {
  results?: RecentLayout[];
  error?: string;
};

type GeneratedDesignScheme = {
  id: string;
  name: string;
  layoutPath: string;
  status: "ready" | "failed";
  error?: string;
};

type BranchRunCreatePayload = {
  run_id: string;
  status: string;
  created_at?: string;
};

// Branch types moved to viewer-types.ts

type DesignRunSnapshot = {
  payload: SceneJobStatusPayload;
  preset: DesignPreset | null;
  variant: DesignSchemeVariant;
  prompt: string;
  graphTemplateId: string;
};

type GenerationStep = {
  key: string;
  label: string;
  shortLabel: string;
  progress: number;
  purpose: string;
  detailHint: string;
};

// Constants moved to viewer-types.ts: DEFAULT_GRAPH_TEMPLATE_ID, DESIGN_POLL_INTERVAL_MS, DESIGN_MAX_POLL_ATTEMPTS, DESIGN_SCHEME_VARIANTS, VIEWER_DESIGN_PRESETS

type MovementState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
};


type CameraMode = "first_person" | "third_person" | "frame" | "graph_overlay";

// Forward declaration for currentManifest (defined later in the file)
let currentManifest: ViewerManifest | null = null;

type LightingPresetValues = {
  exposure: number;
  keyLightIntensity: number;
  fillLightIntensity: number;
  warmth: number;
  shadowStrength: number;
};

type LightingState = LightingPresetValues & {
  preset: string;
};

type MinimapBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  center: THREE.Vector3;
  extent: number;
};

// HitDescriptor type moved to viewer-hit-info.ts

const LIGHTING_PRESETS: Record<string, LightingPresetValues> = {
  neutral_studio: {
    exposure: 1.1,
    keyLightIntensity: 1.0,
    fillLightIntensity: 0.55,
    warmth: 0.0,
    shadowStrength: 0.45,
  },
  bright_day: {
    exposure: 1.3,
    keyLightIntensity: 1.2,
    fillLightIntensity: 0.8,
    warmth: -0.1,
    shadowStrength: 0.3,
  },
  overcast: {
    exposure: 1.05,
    keyLightIntensity: 0.75,
    fillLightIntensity: 0.95,
    warmth: -0.15,
    shadowStrength: 0.15,
  },
  golden_hour: {
    exposure: 1.18,
    keyLightIntensity: 1.05,
    fillLightIntensity: 0.48,
    warmth: 0.85,
    shadowStrength: 0.58,
  },
  night_presentation: {
    exposure: 0.82,
    keyLightIntensity: 0.62,
    fillLightIntensity: 0.24,
    warmth: 0.2,
    shadowStrength: 0.72,
  },
};

const LIGHTING_PRESET_LABELS: Record<string, string> = {
  neutral_studio: "Neutral Studio",
  bright_day: "Bright Day",
  overcast: "Overcast",
  golden_hour: "Golden Hour",
  night_presentation: "Night Presentation",
  custom: "Custom",
};

const DEFAULT_LIGHTING_STATE: LightingState = {
  preset: "custom",
  exposure: 1.8,
  keyLightIntensity: 1.7,
  fillLightIntensity: 1.2,
  warmth: 0.6,
  shadowStrength: 0.05,
};

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const AVATAR_HEIGHT_M = 1.7;
const AVATAR_EYE_HEIGHT_M = 1.62;
const THIRD_PERSON_DISTANCE_M = 3.6;
const THIRD_PERSON_VERTICAL_OFFSET_M = 1.1;

const CATEGORY_LABELS: Record<string, string> = {
  bench: "座椅",
  lamp: "路灯",
  tree: "树木",
  trash: "垃圾桶",
  bollard: "隔离桩",
  mailbox: "邮箱",
  hydrant: "消防栓",
  bus_stop: "公交站",
  building: "建筑",
  road: "道路",
  roadway: "道路",
  sidewalk: "人行道",
  marking: "道路标线",
  crossing: "过街区",
  transit: "公交设施",
  landscape: "景观设施",
  scene_object: "场景对象",
};

const FALLBACK_CATEGORY_INTRO: Record<string, string> = {
  bench: "用于停留休憩，通常位于步行活动带。",
  lamp: "用于夜间照明，通常沿步行界面连续布置。",
  tree: "用于遮荫与界面塑造，通常位于路缘或家具带。",
  trash: "用于保持街道整洁，通常布置在停留节点附近。",
  bollard: "用于分隔交通与人行区域，强化安全边界。",
  mailbox: "用于邮政投递，通常靠近停留节点或出入口。",
  hydrant: "用于消防取水，通常靠近机动车或消防可达界面。",
  bus_stop: "用于公交停靠与候车，通常锚定在公交站点附近。",
  building: "用于塑造沿街界面和空间围合。",
};

const CATEGORY_BBOX_COLORS: Record<string, number> = {
  tree: 0x22c55e,
  lamp: 0xeab308,
  bench: 0x92400e,
  trash: 0x6b7280,
  bollard: 0xef4444,
  mailbox: 0x3b82f6,
  hydrant: 0xdc2626,
  bus_stop: 0x8b5cf6,
  building: 0xa78bfa,
  road: 0x64748b,
  roadway: 0x64748b,
  sidewalk: 0x94a3b8,
  marking: 0xfbbf24,
  crossing: 0xfde68a,
  transit: 0x7c3aed,
  landscape: 0x4ade80,
  scene_object: 0x38bdf8,
};

// createTextSprite moved to viewer-utils.ts

// Utility functions moved to viewer-utils.ts: requireElement, escapeHtml, clamp, finiteOrNull, asTriplet, asQuad, isFiniteTriplet

type MetricEntry = { label: string; value: number; max: number };
type LlmStatusEntry = {
  enabled?: boolean;
  available?: boolean;
  source?: string;
  cached?: boolean;
  visual_input?: string;
  reasoning?: string;
  error?: string;
};
type EvaluationResult = {
  walkability: number;
  safety: number | null;
  beauty: number | null;
  overall: number | null;
  evaluation: string;
  suggestions: string[];
  config_patch: Record<string, unknown>;
  llm_status?: {
    safety?: LlmStatusEntry;
    beauty?: LlmStatusEntry;
  };
};
type RenderedEvaluationView = {
  view_id: "pedestrian_forward" | "pedestrian_reverse" | "overview_topdown";
  label: string;
  image_data_url: string;
};
type PresetConfig = { id: string; name: string; description: string; config: Record<string, unknown> };

function metricColor(value: number, max: number): string {
  const ratio = clamp(value / max, 0, 1);
  if (ratio >= 0.8) return "#16a34a";
  if (ratio >= 0.5) return "#eab308";
  return "#dc2626";
}

function renderMetricsBarHtml(entry: MetricEntry): string {
  const percent = Math.round(clamp(entry.value / entry.max, 0, 1) * 100);
  const color = metricColor(entry.value, entry.max);
  return `<div class="viewer-metric-row">
  <div class="viewer-metric-label">${escapeHtml(entry.label)}</div>
  <div class="viewer-metric-value">${entry.value.toFixed(2)}</div>
  <div class="viewer-metric-bar-track"><div class="viewer-metric-bar-fill" style="width:${percent}%;background:${color}"></div></div>
  </div>`;
}

function llmStatusPresentation(entry?: LlmStatusEntry): { label: string; className: string } {
  const source = String(entry?.source || "unavailable").toLowerCase();
  const visualInput = String(entry?.visual_input || "missing").toLowerCase();
  if (visualInput !== "provided" && source !== "disabled") {
    return { label: "N/A · No views", className: "unavailable" };
  }
  if (source === "llm") return { label: "Live · Visual", className: "live" };
  if (source === "cache") return { label: "Cache · Visual", className: "cache" };
  if (source === "disabled") return { label: "Disabled", className: "disabled" };
  return { label: "Unavailable · Visual", className: "unavailable" };
}

function isScoreValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatScore(value: number | null | undefined): string {
  return isScoreValue(value) ? String(Math.round(value)) : "N/A";
}

function hasProvidedVisualInput(entry?: LlmStatusEntry): boolean {
  return Boolean(entry?.available) && String(entry?.visual_input || "").toLowerCase() === "provided";
}

function renderMetricsPanel(summary: Record<string, unknown>): string {
  const layoutMetrics: MetricEntry[] = [
    { label: "重叠率", value: Number(summary.overlap_rate ?? 0), max: 1 },
    { label: "丢弃率", value: Number(summary.dropped_slot_rate ?? 0), max: 1 },
    { label: "间距均匀性", value: Number(summary.spacing_uniformity ?? 0), max: 1 },
    { label: "风格一致性", value: Number(summary.style_consistency ?? 0), max: 1 },
    { label: "均衡度", value: Number(summary.balance_score ?? 0), max: 1 },
  ];
  const complianceMetrics: MetricEntry[] = [
    { label: "合规率", value: Number(summary.compliance_rate_total ?? 0), max: 1 },
    { label: "违规数", value: Number(summary.violations_total ?? 0), max: 100 },
    { label: "可行性", value: Number(summary.avg_feasibility_score ?? 0), max: 1 },
  ];
  const sceneMetrics: MetricEntry[] = [
    { label: "实例数", value: Number(summary.instance_count ?? 0), max: 200 },
    { label: "资产种类", value: Number(summary.unique_asset_count ?? 0), max: 200 },
    { label: "多样性", value: Number(summary.diversity_ratio ?? 0), max: 1 },
  ];
  const groups: Array<{ title: string; metrics: MetricEntry[] }> = [];
  if (layoutMetrics.some(m => m.value > 0)) groups.push({ title: "布局质量", metrics: layoutMetrics });
  if (complianceMetrics.some(m => m.value > 0)) groups.push({ title: "合规性", metrics: complianceMetrics });
  if (sceneMetrics.some(m => m.value > 0)) groups.push({ title: "场景统计", metrics: sceneMetrics });
  return groups.map(g => `<div class="viewer-metrics-group"><div class="viewer-metrics-group-title">${escapeHtml(g.title)}</div>${g.metrics.map(m => renderMetricsBarHtml(m)).join("")}</div>`).join("");
}

const CATEGORY_COLORS: Record<string, number> = {
  bench: 0x4ade80, lamp: 0xfbbf24, trash: 0xf87171, tree: 0x22c55e,
  mailbox: 0x60a5fa, hydrant: 0xef4444, bollard: 0xa78bfa, bus_stop: 0xfb923c,
};

const SYSTEM_NODE_DESCRIPTIONS: Record<string, StaticObjectDescription> = {
  carriageway_arm_: {
    match: "prefix",
    title: "Road Carriageway Arm",
    category: "road",
    intro: "Individual road arm carriageway surface (one per road segment).",
    design_note: "Previously merged into a single unified mesh; now split for easier inspection.",
  },
  carriageway_: {
    match: "prefix",
    title: "Road Carriageway Surface",
    category: "road",
    intro: "Unified carriageway surface across connected road segments.",
    design_note: "May span multiple road arms and junction cores.",
  },
  sidewalk_: {
    match: "prefix",
    title: "Sidewalk Surface",
    category: "sidewalk",
    intro: "Pedestrian sidewalk surface.",
  },
  curb_: {
    match: "prefix",
    title: "Curb Stone",
    category: "landscape",
    intro: "Edge curb separating carriageway from sidewalk.",
  },
  junction_carriageway_core_: {
    match: "prefix",
    title: "Junction Core Surface",
    category: "road",
    intro: "Central intersection junction core surface.",
  },
  junction_crosswalk_: {
    match: "prefix",
    title: "Crosswalk",
    category: "crossing",
    intro: "Pedestrian crossing markings at junction.",
  },
  road_slab: {
    match: "exact",
    title: "Road Surface",
    category: "road",
    intro: "Template-mode road surface slab.",
  },
  context_ground: {
    match: "exact",
    title: "Ground Context",
    category: "scene_object",
    intro: "Surrounding ground plane.",
  },
};


function setError(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.hidden = false;
}

function clearError(element: HTMLElement): void {
  element.textContent = "";
  element.hidden = true;
}

function makeSceneOptions(manifest: ViewerManifest): SceneOption[] {
  const options: SceneOption[] = [
    {
      key: "final_scene",
      label: manifest.final_scene.label,
      glbUrl: manifest.final_scene.glb_url,
    },
  ];
  for (const step of manifest.production_steps ?? []) {
    options.push({
      key: step.step_id,
      label: step.title,
      glbUrl: step.glb_url,
    });
  }
  return options;
}

function makeDirectLayoutLabel(layoutPath: string): string {
  const normalized = layoutPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const tail = parts.slice(-2).join("/");
  return `Direct Layout · ${tail || normalized}`;
}

function compactUiLabel(label: string, maxLength = 54): string {
  if (label.length <= maxLength) {
    return label;
  }

  const normalized = label.replace(/\\/g, "/");
  if (normalized.includes("/")) {
    const parts = normalized.split("/").filter(Boolean);
    const tail = parts.slice(-2).join("/");
    const head = parts[0] ?? "";
    const compactPath = `${head}/.../${tail}`;
    if (compactPath.length <= maxLength) {
      return compactPath;
    }
    if (tail.length + 1 >= maxLength) {
      return `...${tail.slice(-(maxLength - 3))}`;
    }
  }

  const left = Math.max(8, Math.floor((maxLength - 1) / 2));
  const right = Math.max(8, maxLength - left - 1);
  return `${label.slice(0, left)}...${label.slice(-right)}`;
}

// disposeObject moved to viewer-utils.ts

// Export colors moved to viewer-export.ts

function turnLanePatchSvgClass(patch: Record<string, unknown>): string {
  const surfaceRole = String(patch.surface_role ?? "").toLowerCase();
  const stripKind = String(patch.strip_kind ?? "").toLowerCase();
  if (surfaceRole === "bike_lane" || stripKind === "bike_lane") return "bikelane";
  if (surfaceRole === "bus_lane" || stripKind === "bus_lane") return "buslane";
  if (surfaceRole === "parking_lane" || stripKind === "parking_lane") return "parking";
  if (surfaceRole === "furnishing" || stripKind.includes("furnishing") || stripKind.includes("buffer")) return "furnishing";
  if (surfaceRole === "context_ground" || stripKind === "frontage_reserve") return "frontage";
  if (surfaceRole === "sidewalk" || stripKind === "clear_sidewalk") return "sidewalk";
  return "road";
}

// exportTopDownMapEnhanced, exportTopDownSvg moved to viewer-export.ts
// loadManifest, clearManifestCache, loadRecentLayouts moved to viewer-api.ts
// inferSpawnFromBbox, manifestCache, parseQueryLayoutPath moved to viewer-api.ts

function categoryLabel(category: string): string {
  const key = String(category || "").trim().toLowerCase();
  return CATEGORY_LABELS[key] ?? (key || "场景对象");
}

function prettifySource(source: string | undefined): string {
  const value = String(source || "").trim();
  if (!value) {
    return "系统生成";
  }
  return value.replace(/_/g, " ");
}

// formatMetric moved to viewer-hit-info.ts

function collectInstanceMetrics(instanceInfo: InstanceInfo): Array<[string, string]> {
  const metrics: Array<[string, string]> = [
    ["asset_id", String(instanceInfo.asset_id || "").trim()],
    ["placement_group", String(instanceInfo.placement_group || "").trim()],
    ["theme_id", String(instanceInfo.theme_id || "").trim()],
    ["距道路边缘", formatMetric(finiteOrNull(instanceInfo.dist_to_road_edge_m), "m")],
    ["距最近路口", formatMetric(finiteOrNull(instanceInfo.dist_to_nearest_junction_m), "m")],
    ["距最近出入口", formatMetric(finiteOrNull(instanceInfo.dist_to_nearest_entrance_m), "m")],
    ["可行性", formatMetric(finiteOrNull(instanceInfo.feasibility_score), "", 2)],
    ["约束惩罚", formatMetric(finiteOrNull(instanceInfo.constraint_penalty), "", 3)],
  ];
  return metrics.filter((entry) => entry[1] && entry[1] !== "未记录");
}

function buildPlacementReason(instanceInfo: InstanceInfo, category: string): string {
  const anchorPoiType = String(instanceInfo.anchor_poi_type || "").trim();
  const anchorDistance = finiteOrNull(instanceInfo.anchor_distance_m);
  if (anchorPoiType) {
    return `该对象锚定在 ${anchorPoiType} 相关位置，当前距锚点 ${formatMetric(anchorDistance, "m")}。`;
  }
  const source = String(instanceInfo.selection_source || "").trim();
  if (source) {
    return `本对象由 ${prettifySource(source)} 选中，并按当前规则集落位。`;
  }
  return FALLBACK_CATEGORY_INTRO[category] ?? "该对象按当前街道规则自动布置。";
}

function composeInstanceInfoHtml(
  nodeName: string,
  instanceInfo: InstanceInfo,
  assetDescription?: AssetDescription,
): string {
  const category = String(instanceInfo.category || "").trim().toLowerCase();
  const title = categoryLabel(category);
  const subtitleParts = [
    category ? `类别：${categoryLabel(category)}` : "",
    assetDescription?.source ? `来源：${prettifySource(assetDescription.source)}` : "",
  ].filter(Boolean);
  const intro = String(assetDescription?.text_desc || "").trim()
    || FALLBACK_CATEGORY_INTRO[category]
    || "这是场景中的自动生成对象。";
  const metrics = collectInstanceMetrics(instanceInfo);

  return `
    <div class="viewer-card-title">${escapeHtml(title)}</div>
    <div class="viewer-card-subtitle">${escapeHtml(subtitleParts.join(" · ") || `节点：${nodeName}`)}</div>
    <div class="viewer-card-section">${escapeHtml(intro)}</div>
    <div class="viewer-card-section viewer-card-highlight">${escapeHtml(buildPlacementReason(instanceInfo, category))}</div>
    <dl class="viewer-card-metrics">
      ${metrics
        .map(
          ([label, value]) =>
            `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
        )
        .join("")}
    </dl>
  `;
}

function composeInstanceInfoText(
  nodeName: string,
  instanceInfo: InstanceInfo,
  assetDescription?: AssetDescription,
): string {
  const category = String(instanceInfo.category || "").trim().toLowerCase();
  const title = categoryLabel(category);
  const subtitleParts = [
    category ? `类别：${categoryLabel(category)}` : "",
    assetDescription?.source ? `来源：${prettifySource(assetDescription.source)}` : "",
  ].filter(Boolean);
  const subtitle = subtitleParts.join(" · ") || `节点：${nodeName}`;
  const intro = String(assetDescription?.text_desc || "").trim()
    || FALLBACK_CATEGORY_INTRO[category]
    || "这是场景中的自动生成对象。";
  const metrics = collectInstanceMetrics(instanceInfo);
  return [
    title,
    subtitle,
    intro,
    buildPlacementReason(instanceInfo, category),
    ...metrics.map(([label, value]) => `${label}: ${value}`),
  ].filter(Boolean).join("\n");
}

function pointInPolygonRing(x: number, z: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function findZoneForPoint(x: number, z: number, manifest: ViewerManifest): { zone: string; details: string } | null {
  const osm = (manifest.summary ?? {}) as Record<string, unknown>;
  const osmGeom = (osm.osm_geometry ?? {}) as Record<string, unknown>;
  const cwRings = (osmGeom.carriageway_rings ?? []) as number[][][];
  for (let i = 0; i < cwRings.length; i++) {
    if (pointInPolygonRing(x, z, cwRings[i])) {
      return { zone: `Carriageway ${i}`, details: "Inside carriageway surface polygon" };
    }
  }
  const swRings = (osmGeom.sidewalk_rings ?? []) as number[][][];
  for (let i = 0; i < swRings.length; i++) {
    if (pointInPolygonRing(x, z, swRings[i])) {
      return { zone: `Sidewalk ${i}`, details: "Inside sidewalk surface polygon" };
    }
  }
  const junctions = (osmGeom.junction_geometries ?? []) as Array<Record<string, unknown>>;
  for (let i = 0; i < junctions.length; i++) {
    const coreRings = (junctions[i].carriageway_core_rings ?? []) as number[][][];
    for (let r = 0; r < coreRings.length; r++) {
      if (pointInPolygonRing(x, z, coreRings[r])) {
        return { zone: `Junction Core ${i}`, details: `Kind: ${junctions[i].kind ?? "unknown"}` };
      }
    }
  }
  return null;
}

function buildRoadAnalysisHtml(hitPoint: THREE.Vector3, manifest: ViewerManifest): string {
  const summary = (manifest.summary ?? {}) as Record<string, unknown>;
  const osm = (summary.osm_geometry ?? {}) as Record<string, unknown>;
  const rows: string[] = [];

  const zone = findZoneForPoint(hitPoint.x, hitPoint.z, manifest);
  if (zone) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Zone</span><span class="viewer-analysis-value">${escapeHtml(zone.zone)}</span></div>`);
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Details</span><span class="viewer-analysis-value">${escapeHtml(zone.details)}</span></div>`);
  }

  const cwWidth = Number(summary.carriageway_width_m ?? summary.road_width_m ?? 0);
  if (cwWidth > 0) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Carriageway Width</span><span class="viewer-analysis-value">${cwWidth.toFixed(2)} m</span></div>`);
  }
  const rowWidth = Number(summary.row_width_m ?? 0);
  if (rowWidth > 0) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Total Row Width</span><span class="viewer-analysis-value">${rowWidth.toFixed(2)} m</span></div>`);
  }
  const lengthM = Number(summary.length_m ?? 0);
  if (lengthM > 0) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Segment Length</span><span class="viewer-analysis-value">${lengthM.toFixed(1)} m</span></div>`);
  }

  const jCount = (osm.junction_geometries as unknown[] | undefined)?.length ?? 0;
  if (jCount > 0) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Junctions</span><span class="viewer-analysis-value">${jCount}</span></div>`);
  }

  if (rows.length === 0) return "";
  return `<div class="viewer-card-section viewer-analysis-section"><div class="viewer-analysis-title">Road Analysis</div>${rows.join("")}</div>`;
}

function composeStaticInfoHtml(
  nodeName: string,
  description: StaticObjectDescription,
  hitPoint?: THREE.Vector3,
  manifest?: ViewerManifest,
): string {
  const subtitle = [
    `类别：${categoryLabel(description.category)}`,
    description.source ? `来源：${prettifySource(description.source)}` : "来源：系统构件",
  ].join(" · ");
  const analysis = hitPoint && manifest ? buildRoadAnalysisHtml(hitPoint, manifest) : "";
  return `
    <div class="viewer-card-title">${escapeHtml(description.title)}</div>
    <div class="viewer-card-subtitle">${escapeHtml(subtitle)}</div>
    <div class="viewer-card-section">${escapeHtml(description.intro || "这是场景中的基础构件。")}</div>
    <div class="viewer-card-section viewer-card-highlight">${escapeHtml(description.design_note || "用于支撑街道空间组织与交通可读性。")}</div>
    ${analysis}
    <dl class="viewer-card-metrics">
      <div><dt>node</dt><dd>${escapeHtml(nodeName)}</dd></div>
    </dl>
  `;
}

function composeStaticInfoText(nodeName: string, description: StaticObjectDescription): string {
  const subtitle = [
    `类别：${categoryLabel(description.category)}`,
    description.source ? `来源：${prettifySource(description.source)}` : "来源：系统构件",
  ].join(" · ");
  return [
    description.title,
    subtitle,
    description.intro || "这是场景中的基础构件。",
    description.design_note || "用于支撑街道空间组织与交通可读性。",
    `node: ${nodeName}`,
  ].filter(Boolean).join("\n");
}

function composeGenericInfoHtml(nodeName: string): string {
  return `
    <div class="viewer-card-title">场景对象</div>
    <div class="viewer-card-subtitle">未命名规则对象</div>
    <div class="viewer-card-section">当前对象没有更详细的街道说明元数据。</div>
    <dl class="viewer-card-metrics">
      <div><dt>node</dt><dd>${escapeHtml(nodeName)}</dd></div>
    </dl>
  `;
}

function composeGenericInfoText(nodeName: string): string {
  return [
    "场景对象",
    "未命名规则对象",
    "当前对象没有更详细的街道说明元数据。",
    `node: ${nodeName}`,
  ].join("\n");
}

function buildHitDescriptorContent(
  descriptor: HitDescriptor,
  manifest?: ViewerManifest,
): { html: string; text: string } {
  if (descriptor.kind === "instance") {
    return {
      html: composeInstanceInfoHtml(
        descriptor.nodeName,
        descriptor.instanceInfo!,
        descriptor.assetDescription,
      ),
      text: composeInstanceInfoText(
        descriptor.nodeName,
        descriptor.instanceInfo!,
        descriptor.assetDescription,
      ),
    };
  }
  if (descriptor.kind === "static") {
    return {
      html: composeStaticInfoHtml(descriptor.nodeName, descriptor.staticDescription!, descriptor.hitPoint, manifest),
      text: composeStaticInfoText(descriptor.nodeName, descriptor.staticDescription!),
    };
  }
  return {
    html: composeGenericInfoHtml(descriptor.nodeName),
    text: composeGenericInfoText(descriptor.nodeName),
  };
}

async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy is unavailable in this browser.");
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

function resolveInstanceIdFromName(name: string): string | null {
  const match = String(name || "").match(/(inst_\d{4})/i);
  return match ? match[1] : null;
}

function createAvatarFigure(): THREE.Group {
  const avatar = new THREE.Group();
  avatar.name = "viewer_avatar";
  avatar.userData.viewerHelper = true;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#59708c",
    roughness: 0.82,
    metalness: 0.02,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: "#d9a68c",
    roughness: 0.95,
    metalness: 0.0,
  });
  const legMaterial = new THREE.MeshStandardMaterial({
    color: "#374151",
    roughness: 0.88,
    metalness: 0.02,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.58, 6, 12), bodyMaterial);
  torso.position.set(0, 1.0, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  torso.userData.viewerHelper = true;
  avatar.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), accentMaterial);
  head.position.set(0, 1.48, 0);
  head.castShadow = true;
  head.receiveShadow = true;
  head.userData.viewerHelper = true;
  avatar.add(head);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.56, 4, 10), legMaterial);
  leftLeg.position.set(-0.07, 0.42, 0);
  leftLeg.castShadow = true;
  leftLeg.receiveShadow = true;
  leftLeg.userData.viewerHelper = true;
  avatar.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.07;
  rightLeg.userData.viewerHelper = true;
  avatar.add(rightLeg);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 10), bodyMaterial);
  leftArm.position.set(-0.24, 1.03, 0);
  leftArm.rotation.z = Math.PI / 28;
  leftArm.castShadow = true;
  leftArm.receiveShadow = true;
  leftArm.userData.viewerHelper = true;
  avatar.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.24;
  rightArm.rotation.z = -Math.PI / 28;
  rightArm.userData.viewerHelper = true;
  avatar.add(rightArm);

  return avatar;
}

function mountViewer(shell: DesktopShell): Promise<() => void> {
  return mountViewerImpl(shell);
}

async function mountViewerImpl(shell: DesktopShell): Promise<() => void> {
  const root = shell.root;
  shell.setHints([
    "Click to capture mouse, then use WASD to move.",
    "Shift accelerates movement, Esc unlocks the cursor, and R resets the roam state.",
    "Use Tools in the top menu or the right tabs for Evaluate, Compare, History, Presets, and Scene Overlay.",
  ]);
  shell.setLeftSections([
    {
      id: "viewer-recent-layouts",
      title: "Recent Layouts",
      subtitle: "Layout / scene entry",
      content: `
        <div class="desktop-shell-form-stack">
          <label class="desktop-shell-field">
            <span>Recent Result</span>
            <select id="layout-select" class="viewer-select viewer-select-inline" title="Recent Result"></select>
          </label>
          <label class="desktop-shell-field">
            <span>Scene</span>
            <select id="scene-select" class="viewer-select viewer-select-inline" title="Scene"></select>
          </label>
        </div>
      `,
    },
  ]);
  shell.setRightTabs(
    [
      {
        id: "settings",
        label: "Settings",
        content: `
          <aside id="viewer-settings-panel" class="viewer-settings-panel" data-open="false">
            <div class="viewer-settings-header">
              <div>
                <div class="viewer-settings-title">Display Settings</div>
                <div class="viewer-settings-subtitle">Light presets, shadows, and laser pointer</div>
              </div>
              <button id="viewer-settings-close" class="viewer-settings-close" type="button" aria-label="Close settings">×</button>
            </div>
            <div class="viewer-settings-section viewer-settings-section-divider">
              <label class="viewer-settings-label">Language · 语言</label>
              <div class="viewer-lang-switcher">
                <button id="viewer-lang-en" class="viewer-lang-btn" type="button">English</button>
                <button id="viewer-lang-zh" class="viewer-lang-btn" type="button">中文</button>
                <button id="viewer-lang-mixed" class="viewer-lang-btn" type="button">中英混合</button>
              </div>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-settings-label" for="lighting-preset">Lighting Preset</label>
              <select id="lighting-preset" class="viewer-select viewer-select-compact"></select>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-exposure">
                <span>Exposure</span>
                <span id="lighting-exposure-value"></span>
              </label>
              <input id="lighting-exposure" class="viewer-range" type="range" min="0.5" max="2.0" step="0.05" />
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-key">
                <span>Key Light Intensity</span>
                <span id="lighting-key-value"></span>
              </label>
              <input id="lighting-key" class="viewer-range" type="range" min="0.2" max="2.0" step="0.05" />
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-fill">
                <span>Fill Light Intensity</span>
                <span id="lighting-fill-value"></span>
              </label>
              <input id="lighting-fill" class="viewer-range" type="range" min="0.1" max="1.6" step="0.05" />
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-warmth">
                <span>Warmth</span>
                <span id="lighting-warmth-value"></span>
              </label>
              <input id="lighting-warmth" class="viewer-range" type="range" min="-1" max="1" step="0.05" />
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-shadow">
                <span>Shadow Strength</span>
                <span id="lighting-shadow-value"></span>
              </label>
              <input id="lighting-shadow" class="viewer-range" type="range" min="0" max="1" step="0.05" />
            </div>
            <div class="viewer-settings-section viewer-settings-section-divider">
              <label class="viewer-toggle-row" for="third-person-enabled">
                <span>Third Person Camera</span>
                <input id="third-person-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="frame-mode-enabled">
                <span>Frame Mode (Show Boundaries)</span>
                <input id="frame-mode-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="asset-bbox-enabled">
                <span>Asset BBoxes</span>
                <input id="asset-bbox-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="laser-pointer-enabled">
                <span>Laser Pointer</span>
                <input id="laser-pointer-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="graph-overlay-enabled">
                <span>Graph Overlay</span>
                <input id="graph-overlay-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="layout-overlay-enabled">
                <span>Scene Overlay</span>
                <input id="layout-overlay-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="audio-enabled">
                <span>Ambient Audio</span>
                <input id="audio-enabled" type="checkbox" />
              </label>
            </div>
          </aside>
        `,
      },
      {
        id: "design",
        label: "Design",
        content: `
          <aside id="viewer-design-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Design Assistant</div>
                <div class="viewer-slide-panel-subtitle">Generate a scene and load it directly in Viewer</div>
              </div>
              <button id="viewer-design-review-run" class="viewer-design-review-run" type="button" disabled title="重新展开最近一次场景生成步骤">Review Run</button>
              <button id="viewer-design-close" class="viewer-settings-close" type="button" aria-label="Close design assistant">x</button>
            </div>
            <div class="viewer-slide-panel-body viewer-design-body">
              <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-preset">
                <span>Preset</span>
                <button class="viewer-help-icon" type="button" data-help="design-preset" title="了解预设">?</button>
              </label>
              <select id="viewer-design-preset" class="viewer-select viewer-select-compact">
                <option value="__custom__">Custom / LLM-Driven（自定义）</option>
              </select>
              <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-prompt">
                <span>Prompt</span>
                <button class="viewer-help-icon" type="button" data-help="design-prompt" title="了解提示词">?</button>
              </label>
              <textarea id="viewer-design-prompt" class="viewer-design-prompt" rows="5"></textarea>
              <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-count">
                <span>Schemes</span>
                <button class="viewer-help-icon" type="button" data-help="design-schemes" title="了解方案数量">?</button>
              </label>
              <select id="viewer-design-count" class="viewer-select viewer-select-compact">
                <option value="1">Single scheme</option>
                <option value="3">Three variants</option>
              </select>
              <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-template">
                <span>Graph Template</span>
                <button class="viewer-help-icon" type="button" data-help="design-template" title="了解图模板">?</button>
              </label>
              <input id="viewer-design-template" class="viewer-design-input" type="text" value="${DEFAULT_GRAPH_TEMPLATE_ID}" />
              <div id="viewer-design-status" class="viewer-design-status">Ready to generate.</div>
              <div id="viewer-design-result" class="viewer-design-result"></div>
            </div>
            <div class="viewer-slide-panel-footer">
              <button id="viewer-design-branch-run" class="viewer-nav-button viewer-nav-button-secondary" type="button">Branch Run</button>
              <button id="viewer-design-generate" class="viewer-nav-button" type="button">Generate & Load</button>
            </div>
          </aside>
        `,
      },
      {
        id: "evaluate",
        label: "Evaluate",
        content: `
          <aside id="viewer-evaluate-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Design Evaluation</div>
                <div class="viewer-slide-panel-subtitle">AI-driven layout assessment and suggestions</div>
              </div>
              <button id="viewer-evaluate-close" class="viewer-settings-close" type="button" aria-label="Close evaluation">x</button>
            </div>
            <div id="viewer-evaluate-content" class="viewer-slide-panel-body">
              <div class="viewer-evaluate-empty">Click "Run Evaluation" to analyze the current layout.</div>
            </div>
            <div class="viewer-slide-panel-footer">
              <button id="viewer-evaluate-run" class="viewer-nav-button" type="button">Run Evaluation</button>
            </div>
          </aside>
        `,
      },
      {
        id: "compare",
        label: "Compare",
        content: `
          <aside id="viewer-compare-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Layout Comparison</div>
                <div class="viewer-slide-panel-subtitle">Compare two layouts side-by-side</div>
              </div>
              <button id="viewer-compare-close" class="viewer-settings-close" type="button" aria-label="Close comparison">x</button>
            </div>
            <div class="viewer-slide-panel-body">
              <div class="viewer-compare-selectors">
                <div class="viewer-compare-col">
                  <label class="viewer-settings-label" for="compare-layout-a">Layout A</label>
                  <select id="compare-layout-a" class="viewer-select viewer-select-compact"></select>
                </div>
                <div class="viewer-compare-col">
                  <label class="viewer-settings-label" for="compare-layout-b">Layout B</label>
                  <select id="compare-layout-b" class="viewer-select viewer-select-compact"></select>
                </div>
              </div>
              <div id="viewer-compare-results" class="viewer-compare-results"></div>
            </div>
          </aside>
        `,
      },
      {
        id: "history",
        label: "History",
        content: `
          <aside id="viewer-history-analysis-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">📊 History Analysis</div>
                <div class="viewer-slide-panel-subtitle">Scatter plot analysis of scene generation history</div>
              </div>
              <button id="viewer-history-analysis-close" class="viewer-settings-close" type="button" aria-label="Close history">x</button>
            </div>
            <div id="viewer-history-analysis-content" class="viewer-slide-panel-body">
              <div class="viewer-history-tabs">
                <button class="viewer-history-tab" data-tab="scatter" data-active="true">散点图 · Scatter</button>
                <button class="viewer-history-tab" data-tab="frequency">频次图 · Frequency</button>
                <button class="viewer-history-tab" data-tab="trend">趋势图 · Trend</button>
                <button class="viewer-history-tab" data-tab="scores">三系统评分 · Scores</button>
              </div>
              <div id="viewer-history-scatter-plot" class="viewer-history-tab-panel" data-tab="scatter" data-active="true" style="width: 100%;"></div>
              <div id="viewer-history-frequency" class="viewer-history-tab-panel" data-tab="frequency" data-active="false" style="width: 100%;"></div>
              <div id="viewer-history-trend" class="viewer-history-tab-panel" data-tab="trend" data-active="false" style="width: 100%;"></div>
              <div id="viewer-history-scores" class="viewer-history-tab-panel" data-tab="scores" data-active="false" style="width: 100%;"></div>
            </div>
          </aside>
        `,
      },
      {
        id: "presets",
        label: "Presets",
        content: `
          <aside id="viewer-presets-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Scene Presets</div>
                <div class="viewer-slide-panel-subtitle">Pre-configured scene styles. The highlighted card matches the currently loaded scene's generation preset.</div>
              </div>
              <button id="viewer-presets-close" class="viewer-settings-close" type="button" aria-label="Close presets">x</button>
            </div>
            <div id="viewer-presets-grid" class="viewer-presets-grid"></div>
          </aside>
        `,
      },
      {
        id: "floating-lane",
        label: "Floating Lane",
        content: `
          <div id="viewer-floating-lane-panel-host" class="floating-lane-inline-host">
            <div class="desktop-shell-empty-state">Click Floating Lane button to enable overlay controls.</div>
          </div>
        `,
      },
      {
        id: "help",
        label: "Help",
        content: `
          <aside id="viewer-help-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Help · 帮助</div>
                <div class="viewer-slide-panel-subtitle">了解生成流程和各个步骤的详细说明</div>
              </div>
              <button id="viewer-help-close" class="viewer-settings-close" type="button" aria-label="Close help">x</button>
            </div>
            <div id="viewer-help-content" class="viewer-slide-panel-body">
              <div class="viewer-help-section">
                <h3 class="viewer-help-section-title">🚀 场景生成流程</h3>
                <p class="viewer-help-intro">当你点击 "Generate & Load" 后，系统会按照以下步骤生成 3D 街道场景：</p>
                <div class="viewer-help-steps">
                  <div class="viewer-help-step" data-step="queue">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">1</span>
                      <span class="viewer-help-step-title">任务排队中</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="queue">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="queue" hidden>
                      <p>你的生成请求被提交到后端服务后会进入排队状态。系统会按照提交顺序处理每个任务。</p>
                      <p><strong>为什么需要排队？</strong> 场景生成是计算密集型任务，为保证服务质量，系统按序处理而非并行处理。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="context">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">2</span>
                      <span class="viewer-help-step-title">上下文解析</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="context">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="context" hidden>
                      <p>系统会解析你输入的自然语言提示词（Prompt），结合选定的预设（Preset）和图模板（Graph Template），理解你的设计意图并生成可执行的 <code>StreetComposeConfig</code> 配置对象。</p>
                      <p><strong>预设是什么？</strong> 预设是预先配置好的参数组合，例如"步行友好"会降低车流量、增加绿化，"商业活力"会提高密度和商业设施。</p>
                      <p><strong>算法过程：</strong></p>
                      <ul class="viewer-help-list">
                        <li><strong>意图解析：</strong>将自然语言 Prompt 解析为结构化的设计意图，包括目标街道类型、设计规则 profile、客观目标 profile</li>
                        <li><strong>参数合并：</strong>合并 Preset 的配置补丁、Graph Template 的拓扑约束、以及用户手动覆盖的参数</li>
                        <li><strong>需求评估：</strong>根据预设或 LLM 推理得到行人/自行车/公交/车流的需求等级（high/medium/low）</li>
                        <li><strong>上下文构建：</strong>构建包含 layout_mode、graph_template_id、reference_plan_id 等的场景上下文</li>
                        <li><strong>RAG 检索：</strong>从知识库（PDF RAG 或 Graph RAG）中检索相关的设计规则和最佳实践作为引用证据</li>
                      </ul>
                      <p><strong>输出参数：</strong> density、road_width_m、length_m、lane_count、sidewalk_width_m、design_rule_profile、objective_profile 等。</p>
                      <p><strong>在设计面板中查看实时参数：</strong> 生成过程中点击"查看算法详情"按钮，可以看到本次生成实际使用的配置值。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="asset">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">3</span>
                      <span class="viewer-help-step-title">资产加载</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="asset">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="asset" hidden>
                      <p>根据解析出的需求，系统会从资产清单（Manifest）中加载对应的 3D 模型，包括树木、路灯、座椅、公交站等街道家具。</p>
                      <p><strong>资产从哪里来？</strong> 资产存储在 <code>data/real_assets_manifest.jsonl</code> 中，每个资产都有分类、描述和 CLIP 文本嵌入向量用于语义检索。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="layout">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">4</span>
                      <span class="viewer-help-step-title">布局生成</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="layout">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="layout" hidden>
                      <p>系统会根据图模板（Graph Template）生成街道的骨架，包括道路宽度、车道数量、人行道宽度等基础结构。</p>
                      <p><strong>图模板是什么？</strong> 图模板定义了街道的拓扑结构，例如 <code>hkust_gz_gate</code> 是港科大（广州）校门的道路布局模板。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="constraint">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">5</span>
                      <span class="viewer-help-step-title">约束求解</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="constraint">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="constraint" hidden>
                      <p>系统会检查布局是否满足设计规则（Design Rules）和合规性要求，例如人行道最小宽度、车道间距、无障碍通行等。</p>
                      <p><strong>不满足约束怎么办？</strong> 系统会自动调整布局以尝试满足约束，如果无法完全满足，会在结果中标记违规项。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="composition">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">6</span>
                      <span class="viewer-help-step-title">资产组合</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="composition">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="composition" hidden>
                      <p>系统会使用 CLIP 语义检索，将加载的 3D 资产智能地放置到街道场景中，包括放置位置、旋转角度和缩放比例。</p>
                      <p><strong>放置策略是什么？</strong> 系统支持规则策略（Rule-based）和学习策略（Learned policy），会根据资产类别、道路功能区（Strip）和 POI 兴趣点进行布局。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="mesh">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">7</span>
                      <span class="viewer-help-step-title">网格生成</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="mesh">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="mesh" hidden>
                      <p>所有资产放置完成后，系统会将它们合并为完整的 3D 场景网格（Mesh），包括道路铺装、人行道、建筑体块和所有街道家具。</p>
                      <p><strong>这一步做什么？</strong> 将离散的 3D 模型整合为统一的场景几何体，为后续的光照计算和渲染做准备。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="render">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">8</span>
                      <span class="viewer-help-step-title">场景渲染</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="render">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="render" hidden>
                      <p>系统会应用光照、材质、阴影和色调映射（Tone Mapping），生成最终的可视觉化场景。</p>
                      <p><strong>光照从哪里来？</strong> 场景使用三点照明系统：主光源（Key Light）、补光（Fill Light）和环境光（Ambient），配合曝光和色温调节。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="export">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">9</span>
                      <span class="viewer-help-step-title">GLB 导出</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="export">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="export" hidden>
                      <p>渲染完成后，系统会将场景导出为 GLB 格式（Binary glTF），这是一种高效的 3D 场景文件格式。</p>
                      <p><strong>为什么用 GLB？</strong> GLB 格式将所有资源（几何体、材质、纹理）打包为单一文件，便于网络传输和 Three.js 加载。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="organize">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">10</span>
                      <span class="viewer-help-step-title">结果整理</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="organize">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="organize" hidden>
                      <p>最后，系统会生成 <code>scene_layout.json</code> 文件，包含所有资产的放置信息、场景统计数据和生产步骤（Production Steps）。</p>
                      <p><strong>生产步骤是什么？</strong> 生产步骤记录了场景构建的中间过程，你可以在 Viewer 中逐步查看道路基础 → 建筑 → 家具 → 最终预览的各个阶段。</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="viewer-help-section">
                <h3 class="viewer-help-section-title">🎯 Design 面板使用指南</h3>
                <div class="viewer-help-fields">
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Preset（预设）</h4>
                    <p>预设是一组参数的快捷选择，每个预设对应特定的街道设计目标。</p>
                    <ul class="viewer-help-list">
                      <li><strong>步行友好（Pedestrian Friendly）：</strong>行人优先，全龄友好，低车流量，高绿化</li>
                      <li><strong>商业活力（Commercial Vitality）：</strong>商业活跃，人流密集，高设施密度</li>
                      <li><strong>公交优先（Transit Priority）：</strong>公交导向，换乘便利，高公交可达性</li>
                      <li><strong>公园景观（Park Landscape）：</strong>绿化为主，自然生态，休闲舒适</li>
                      <li><strong>安静居住（Quiet Residential）：</strong>住宅区安静环境，绿树成荫</li>
                      <li><strong>平衡街道（Balanced Complete）：</strong>各类使用者平衡的完整街道</li>
                    </ul>
                  </div>
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Prompt（提示词）</h4>
                    <p>用自然语言描述你想要的街道场景。提示词会被系统解析为具体的设计参数。</p>
                    <ul class="viewer-help-list">
                      <li>可以描述功能定位，如"商业步行街"、"住宅区小巷"</li>
                      <li>可以描述氛围感受，如"安静舒适"、"充满活力"</li>
                      <li>可以描述具体特征，如"林荫大道"、"有很多座椅"</li>
                    </ul>
                  </div>
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Schemes（方案数量）</h4>
                    <p>选择生成单个方案还是三个变体（A/B/C）：</p>
                    <ul class="viewer-help-list">
                      <li><strong>Single scheme：</strong>只生成一个方案，速度更快</li>
                      <li><strong>Three variants：</strong>生成 A/B/C 三个变体，各有不同的密度和道路宽度扰动，方便对比选择</li>
                    </ul>
                  </div>
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Graph Template（图模板）</h4>
                    <p>图模板定义了街道的拓扑结构和布局骨架。</p>
                    <ul class="viewer-help-list">
                      <li>默认模板：<code>hkust_gz_gate</code>（港科大广州校门）</li>
                      <li>可以指定其他已配置的模板 ID</li>
                      <li>模板决定了道路数量、车道宽度和基本布局</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div class="viewer-help-section">
                <h3 class="viewer-help-section-title">💡 常见问题</h3>
                <div class="viewer-help-faq">
                  <details class="viewer-help-faq-item">
                    <summary class="viewer-help-faq-question">生成一个场景需要多长时间？</summary>
                    <div class="viewer-help-faq-answer">
                      <p>通常需要 1-5 分钟，具体取决于场景复杂度、资产数量和服务器负载。计算密集型任务包括布局生成、约束求解和资产组合。</p>
                    </div>
                  </details>
                  <details class="viewer-help-faq-item">
                    <summary class="viewer-help-faq-question">为什么生成失败了？</summary>
                    <div class="viewer-help-faq-answer">
                      <p>可能的原因包括：约束冲突无法解决、资产检索失败、模板配置错误等。请查看错误提示，调整预设或提示词后重试。</p>
                    </div>
                  </details>
                  <details class="viewer-help-faq-item">
                    <summary class="viewer-help-faq-question">如何选择最佳方案？</summary>
                    <div class="viewer-help-faq-answer">
                      <p>建议选择"Three variants"生成 A/B/C 三个变体，它们会在密度和道路宽度上有细微差别。加载后可以使用"Evaluate"面板进行 AI 评分对比。</p>
                    </div>
                  </details>
                  <details class="viewer-help-faq-item">
                    <summary class="viewer-help-faq-question">什么是 Production Steps？</summary>
                    <div class="viewer-help-faq-answer">
                      <p>Production Steps 是场景构建的中间过程记录，包括道路基础 → 建筑体块 → POI 上下文 → 家具锚点 → 必需家具 → 可选家具 → 最终预览。你可以在 Viewer 的 Settings 中切换到不同步骤查看。</p>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </aside>
        `,
      },
    ],
    null,
  );
  shell.statusStatusHost.innerHTML = `<div id="viewer-status" class="desktop-shell-inline-status">Loading viewer…</div>`;
  shell.setStatusSummary("Loading viewer…");
  shell.statusActivityHost.innerHTML = `<div class="desktop-shell-log-entry" data-tone="neutral">Viewer shell initialized.</div>`;
  shell.centerStage.innerHTML = `
    <div class="viewer-shell viewer-shell-embedded">
      <div class="viewer-command-hub" hidden>
        <button id="viewer-menu-toggle" type="button" aria-label="Menu" aria-expanded="false">☰</button>
        <div id="viewer-menu-dropdown" hidden></div>
        <button id="viewer-scene-graph-link" type="button">Annotation</button>
        <button id="viewer-asset-editor-link" type="button">Asset Editor</button>
        <button id="viewer-junction-editor-link" type="button">Junction Editor</button>
        <button id="viewer-settings-toggle" type="button" aria-expanded="false">Settings</button>
        <button id="viewer-design-toggle" type="button">Design</button>
        <button id="viewer-compare-toggle" type="button">Compare</button>
        <button id="viewer-presets-toggle" type="button">Presets</button>
        <button id="viewer-evaluate-toggle" type="button">Evaluate</button>
        <button id="viewer-history-analysis-toggle" type="button">History</button>
        <button id="viewer-floating-lane-toggle" type="button">Floating Lane</button>
        <button id="viewer-help-toggle" type="button">Help</button>
        <button id="viewer-export-topdown-map" type="button">Export PNG</button>
        <button id="viewer-export-topdown-svg" type="button">Export SVG</button>
      </div>
      <div id="viewer-canvas" class="viewer-canvas"></div>
      <div id="viewer-design-workspace" class="viewer-design-workspace" hidden></div>
      <button id="viewer-exit-compare3d" class="viewer-exit-compare3d" type="button" hidden>Exit Split View</button>
      <div id="viewer-crosshair" class="viewer-crosshair" hidden></div>
      <div id="viewer-info-card" class="viewer-info-card" hidden></div>
      <div id="viewer-minimap" class="viewer-minimap">
        <div class="viewer-minimap-title">Scene Map</div>
        <div id="viewer-minimap-canvas" class="viewer-minimap-canvas"></div>
        <canvas id="viewer-minimap-overlay" class="viewer-minimap-overlay"></canvas>
      </div>
      <canvas id="viewer-axis-hud" class="viewer-axis-hud"></canvas>
      <div id="viewer-overlay" class="viewer-overlay">Click scene to capture mouse</div>
      <div id="viewer-error" class="viewer-error" hidden></div>
    </div>
  `;

  const canvasHost = requireElement<HTMLElement>(root, "#viewer-canvas");
  const designWorkspaceEl = requireElement<HTMLElement>(root, "#viewer-design-workspace");
  let g6StageGraph: ReturnType<typeof renderG6StageTree> | null = null;
  const statusEl = requireElement<HTMLElement>(root, "#viewer-status");
  const overlayEl = requireElement<HTMLElement>(root, "#viewer-overlay");
  const errorEl = requireElement<HTMLElement>(root, "#viewer-error");
  const layoutSelectEl = requireElement<HTMLSelectElement>(root, "#layout-select");
  const selectEl = requireElement<HTMLSelectElement>(root, "#scene-select");
  const sceneGraphLinkEl = requireElement<HTMLButtonElement>(root, "#viewer-scene-graph-link");
  const assetEditorLinkEl = requireElement<HTMLButtonElement>(root, "#viewer-asset-editor-link");
  
  const menuToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-menu-toggle");
  const menuDropdownEl = requireElement<HTMLElement>(root, "#viewer-menu-dropdown");
  const settingsToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-settings-toggle");
  const settingsPanelEl = requireElement<HTMLElement>(root, "#viewer-settings-panel");
  const settingsCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-settings-close");
  const infoCardEl = requireElement<HTMLElement>(root, "#viewer-info-card");
  const crosshairEl = requireElement<HTMLElement>(root, "#viewer-crosshair");
  const minimapEl = requireElement<HTMLElement>(root, "#viewer-minimap");
  const minimapHost = requireElement<HTMLElement>(root, "#viewer-minimap-canvas");
  const minimapOverlayEl = requireElement<HTMLCanvasElement>(root, "#viewer-minimap-overlay");
  const axisHudEl = requireElement<HTMLCanvasElement>(root, "#viewer-axis-hud");
  const lightingPresetEl = requireElement<HTMLSelectElement>(root, "#lighting-preset");
  const exposureInput = requireElement<HTMLInputElement>(root, "#lighting-exposure");
  const keyInput = requireElement<HTMLInputElement>(root, "#lighting-key");
  const fillInput = requireElement<HTMLInputElement>(root, "#lighting-fill");
  const warmthInput = requireElement<HTMLInputElement>(root, "#lighting-warmth");
  const shadowInput = requireElement<HTMLInputElement>(root, "#lighting-shadow");
  const exposureValueEl = requireElement<HTMLElement>(root, "#lighting-exposure-value");
  const keyValueEl = requireElement<HTMLElement>(root, "#lighting-key-value");
  const fillValueEl = requireElement<HTMLElement>(root, "#lighting-fill-value");
  const warmthValueEl = requireElement<HTMLElement>(root, "#lighting-warmth-value");
  const shadowValueEl = requireElement<HTMLElement>(root, "#lighting-shadow-value");
  const thirdPersonToggleEl = requireElement<HTMLInputElement>(root, "#third-person-enabled");
  const frameModeToggleEl = requireElement<HTMLInputElement>(root, "#frame-mode-enabled");
  const assetBboxToggleEl = requireElement<HTMLInputElement>(root, "#asset-bbox-enabled");
  const laserToggleEl = requireElement<HTMLInputElement>(root, "#laser-pointer-enabled");

  const designToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-design-toggle");
  const designPanelEl = requireElement<HTMLElement>(root, "#viewer-design-panel");
  const designReviewRunEl = requireElement<HTMLButtonElement>(root, "#viewer-design-review-run");
  const designCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-design-close");
  const designPresetEl = requireElement<HTMLSelectElement>(root, "#viewer-design-preset");
  const designPromptEl = requireElement<HTMLTextAreaElement>(root, "#viewer-design-prompt");
  const designCountEl = requireElement<HTMLSelectElement>(root, "#viewer-design-count");
  const designTemplateEl = requireElement<HTMLInputElement>(root, "#viewer-design-template");
  const designBranchRunEl = requireElement<HTMLButtonElement>(root, "#viewer-design-branch-run");
  const designGenerateEl = requireElement<HTMLButtonElement>(root, "#viewer-design-generate");
  const designStatusEl = requireElement<HTMLElement>(root, "#viewer-design-status");
  const designResultEl = requireElement<HTMLElement>(root, "#viewer-design-result");

  const evaluateToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-evaluate-toggle");
  const evaluatePanelEl = requireElement<HTMLElement>(root, "#viewer-evaluate-panel");
  const evaluateCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-evaluate-close");
  const evaluateRunEl = requireElement<HTMLButtonElement>(root, "#viewer-evaluate-run");
  const evaluateContentEl = requireElement<HTMLElement>(root, "#viewer-evaluate-content");

  const compareToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-compare-toggle");
  const comparePanelEl = requireElement<HTMLElement>(root, "#viewer-compare-panel");
  const compareCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-compare-close");
  const compareSelectAEl = requireElement<HTMLSelectElement>(root, "#compare-layout-a");
  const compareSelectBEl = requireElement<HTMLSelectElement>(root, "#compare-layout-b");
  const compareResultsEl = requireElement<HTMLElement>(root, "#viewer-compare-results");
  const exitCompare3dEl = requireElement<HTMLButtonElement>(root, "#viewer-exit-compare3d");

  const historyAnalysisToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-history-analysis-toggle");
  const historyAnalysisPanelEl = requireElement<HTMLElement>(root, "#viewer-history-analysis-panel");
  const historyAnalysisCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-history-analysis-close");
  const historyAnalysisContentEl = requireElement<HTMLElement>(root, "#viewer-history-analysis-content");
  let historyScatterPlot: HistoryScatterPlot | null = null;
  let historyFrequencyChart: HistoryFrequencyChart | null = null;
  let historyTrendChart: HistoryTrendChart | null = null;
  let historyThreeSystemScores: ThreeSystemScorePanel | null = null;
  let historyAnalysisOpen = false;

  const setHistoryAnalysisOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      closeAllSlidePanels();
    }
    historyAnalysisOpen = nextOpen;
    historyAnalysisPanelEl.dataset.open = String(nextOpen);
    if (nextOpen) {
      shell.activateRightTab("history");
      loadAndRenderHistory();
    } else if (!settingsOpen && !designOpen && !evaluateOpen && !compareOpen && !presetsOpen) {
      shell.activateRightTab(null);
    }
  };

  const setupHistoryTabs = () => {
    const tabs = historyAnalysisContentEl.querySelectorAll<HTMLButtonElement>(".viewer-history-tab");
    const panels = historyAnalysisContentEl.querySelectorAll<HTMLElement>(".viewer-history-tab-panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab!;
        tabs.forEach((t) => (t.dataset.active = String(t.dataset.tab === target)));
        panels.forEach((p) => (p.dataset.active = String(p.dataset.tab === target)));
      });
    });
  };

  // 缓存历史数据，避免重复请求
  let cachedHistoryData: SceneHistoryEntry[] | null = null;
  let lastHistoryLoadTime = 0;
  const HISTORY_CACHE_TTL_MS = 60 * 1000; // 1 分钟缓存

  const loadAndRenderHistory = async (forceRefresh = false) => {
    try {
      // 检查缓存是否有效
      const now = Date.now();
      const cacheValid = !forceRefresh && cachedHistoryData !== null && (now - lastHistoryLoadTime) < HISTORY_CACHE_TTL_MS;

      if (cacheValid && cachedHistoryData !== null && cachedHistoryData.length > 0) {
        // 使用缓存数据快速渲染
        await renderHistoryCharts(cachedHistoryData);
        return;
      }

      // 显示加载状态
      historyAnalysisContentEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #64748b;">
          <div style="margin-bottom: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" style="animation: spin 1s linear infinite; vertical-align: middle;">
              <circle cx="12" cy="12" r="10" stroke="#e2e8f0" stroke-width="3" fill="none"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="#3b82f6" stroke-width="3" fill="none" stroke-linecap="round"/>
            </svg>
            <span style="margin-left: 8px;">Loading history data...</span>
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 8px;">Using cached data if available</p>
        </div>
        <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
      `;

      const recentLayouts = await loadRecentLayouts(50, !forceRefresh);
      const scenesWithMetrics: SceneHistoryEntry[] = [];
      const total = recentLayouts.length;
      let loaded = 0;

      for (const layout of recentLayouts) {
        try {
          const manifest = await loadManifest(layout.layout_path, !forceRefresh);
          if (manifest.summary) {
            scenesWithMetrics.push({
              layout_path: layout.layout_path,
              label: layout.label,
              relative_path: layout.relative_path,
              updated_at: layout.updated_at,
              mtime_ms: layout.mtime_ms,
              summary: { ...manifest.summary },
            });
          }
        } catch (e) {
          console.warn(`Failed to load manifest for ${layout.layout_path}:`, e);
        }
        loaded++;

        // 每加载 10 个更新一次进度
        if (loaded % 10 === 0 || loaded === total) {
          historyAnalysisContentEl.querySelector(".loading-progress")?.setAttribute(
            "data-progress",
            `${loaded}/${total}`
          );
        }
      }

      if (scenesWithMetrics.length === 0) {
        historyAnalysisContentEl.innerHTML = `
          <div style="padding: 24px; text-align: center; color: #999;">
            <p>No scene data with metrics found.</p>
            <p style="font-size: 12px; margin-top: 8px;">Generate some scenes first, then return here to analyze the history.</p>
          </div>
        `;
        return;
      }

      // 缓存数据
      cachedHistoryData = scenesWithMetrics;
      lastHistoryLoadTime = Date.now();

      await renderHistoryCharts(scenesWithMetrics);
    } catch (error) {
      console.error("Failed to load history data:", error);
      historyAnalysisContentEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #f5222d;">
          <p>Failed to load history data.</p>
          <p style="font-size: 12px; margin-top: 8px;">${error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      `;
    }
  };

  // 渲染历史图表（可复用）
  const renderHistoryCharts = async (scenesWithMetrics: SceneHistoryEntry[]) => {
    if (scenesWithMetrics.length === 0) return;

    // 初始化图表组件
    if (!historyScatterPlot) {
      historyScatterPlot = new HistoryScatterPlot(
        historyAnalysisContentEl.querySelector<HTMLElement>("#viewer-history-scatter-plot")!
      );
    }

    if (!historyFrequencyChart) {
      historyFrequencyChart = new HistoryFrequencyChart(
        historyAnalysisContentEl.querySelector<HTMLElement>("#viewer-history-frequency")!
      );
    }

    if (!historyTrendChart) {
      historyTrendChart = new HistoryTrendChart(
        historyAnalysisContentEl.querySelector<HTMLElement>("#viewer-history-trend")!
      );
    }

    if (!historyThreeSystemScores) {
      historyThreeSystemScores = new ThreeSystemScorePanel(
        historyAnalysisContentEl.querySelector<HTMLElement>("#viewer-history-scores")!
      );
    }

    await historyScatterPlot.init(scenesWithMetrics);
    await historyFrequencyChart.init(scenesWithMetrics);
    await historyTrendChart.init(scenesWithMetrics);
    await historyThreeSystemScores.init(scenesWithMetrics);

    // Setup tab switching
    setupHistoryTabs();
  };

  const exportTopdownMapEl = requireElement<HTMLButtonElement>(root, "#viewer-export-topdown-map");
  const exportTopdownSvgEl = requireElement<HTMLButtonElement>(root, "#viewer-export-topdown-svg");
  const presetsToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-presets-toggle");
  const presetsPanelEl = requireElement<HTMLElement>(root, "#viewer-presets-panel");
  const presetsCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-presets-close");
  const presetsGridEl = requireElement<HTMLElement>(root, "#viewer-presets-grid");

  const helpToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-help-toggle");
  const helpPanelEl = requireElement<HTMLElement>(root, "#viewer-help-panel");
  const helpCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-help-close");
  const helpContentEl = requireElement<HTMLElement>(root, "#viewer-help-content");

  const graphOverlayToggleEl = requireElement<HTMLInputElement>(root, "#graph-overlay-enabled");

  const layoutOverlayToggleEl = requireElement<HTMLInputElement>(root, "#layout-overlay-enabled");
  const audioToggleEl = requireElement<HTMLInputElement>(root, "#audio-enabled");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f7f6f3");

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
  const audioManager = new AudioManager(camera, scene);

  function applyAudioProfile(): void {
    const profile = currentManifest?.audio_profile;
    if (profile) {
      audioManager.applyProfile(profile);
      if (audioToggleEl.checked) {
        audioManager.play();
      }
    } else {
      audioManager.stop();
    }
  }

  audioToggleEl.addEventListener("change", () => {
    if (audioToggleEl.checked) {
      audioManager.play();
    } else {
      audioManager.stop();
    }
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
  canvasHost.appendChild(renderer.domElement);

  const canvasResizeObserver = new ResizeObserver(() => {
    resizeRenderer();
  });
  canvasResizeObserver.observe(canvasHost);

  const minimapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  minimapRenderer.outputColorSpace = THREE.SRGBColorSpace;
  minimapRenderer.setPixelRatio(1);
  minimapRenderer.shadowMap.enabled = false;
  minimapHost.appendChild(minimapRenderer.domElement);
  const minimapCamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 4000);
  minimapCamera.up.set(0, 0, -1);

  const hemiLight = new THREE.HemisphereLight(0xfafcff, 0xd6d5d0, 0.75);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(18, 30, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 220;
  keyLight.shadow.camera.left = -90;
  keyLight.shadow.camera.right = 90;
  keyLight.shadow.camera.top = 90;
  keyLight.shadow.camera.bottom = -90;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xdfe8ff, 0.45);
  fillLight.position.set(-18, 18, -18);
  scene.add(fillLight);

  const controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(camera);

  const avatarFigure = createAvatarFigure();
  avatarFigure.visible = false;
  scene.add(avatarFigure);

  const loader = new GLTFLoader();

  const compareMode = createCompareMode({
    scene,
    camera,
    renderer,
    loader,
    getCurrentRoot: () => currentRoot,
    flashStatus,
    setStatus,
    compareResultsEl,
    exitCompare3dEl,
    escapeHtml,
    compactUiLabel,
    disposeObject,
    loadManifest,
    compareSelectAEl,
    compareSelectBEl,
    getLang: () => currentLang,
  });

  const raycaster = new THREE.Raycaster();
  const clock = new THREE.Clock();
  const eventController = new AbortController();
  const { signal } = eventController;
  let animationFrameId = 0;
  let destroyed = false;
  const moveState: MovementState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };

  const laserBeamGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const laserBeam = new THREE.Line(
    laserBeamGeometry,
    new THREE.LineBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.95 }),
  );
  laserBeam.visible = false;
  laserBeam.userData.viewerHelper = true;
  scene.add(laserBeam);

  const laserHitDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff5a4f }),
  );
  laserHitDot.visible = false;
  laserHitDot.userData.viewerHelper = true;
  scene.add(laserHitDot);

  let currentRoot: THREE.Object3D | null = null;
  let currentLayoutPath = "";
  let currentSpawn = new THREE.Vector3(0, 1.65, 0);
  let currentForward = new THREE.Vector3(1, 0, 0);
  let currentAvatarPosition = new THREE.Vector3(0, Math.max(0, 1.65 - AVATAR_EYE_HEIGHT_M), 0);
  let currentCameraMode: CameraMode = "first_person";
  let currentSceneBounds: MinimapBounds | null = null;
  let currentLaserHitPoint: THREE.Vector3 | null = null;
  let currentLaserCopyText = "";
  let flyAnimation: { startPos: THREE.Vector3; targetPos: THREE.Vector3; startTime: number; duration: number } | null = null;
  let settingsOpen = false;
  let resumeRoamAfterSettingsClose = false;
  let statusResetHandle: number | null = null;
  let designOpen = false;
  let designIsGenerating = false;
  let branchRunIsGenerating = false;
  let lastBranchRunSnapshot: BranchRunStatusPayload | null = null;
  let selectedBranchNodeId: string | null = null;
  let lastDesignRunSnapshot: DesignRunSnapshot | null = null;
  let evaluateOpen = false;
  let compareOpen = false;
  let presetsOpen = false;
  let helpOpen = false;
  let graphOverlayActive = false;
  const graphOverlayMarkers: THREE.Object3D[] = [];
  const optionsByKey = new Map<string, SceneOption>();
  const recentLayoutsByPath = new Map<string, RecentLayout>();

  // 语言状态
  type LangMode = "en" | "zh" | "mixed";
  let currentLang: LangMode = (localStorage.getItem("viewer-lang") as LangMode) || "en";

  const lightingState: LightingState = {
    ...DEFAULT_LIGHTING_STATE,
  };

  function setStatus(message: string): void {
    if (statusResetHandle !== null) {
      window.clearTimeout(statusResetHandle);
      statusResetHandle = null;
    }
    statusEl.textContent = message;
    shell.setStatusSummary(message);
    shell.pushActivity(message, "neutral");
  }

  function flashStatus(message: string, durationMs = 1800): void {
    const restoreText = statusEl.textContent || "";
    if (statusResetHandle !== null) {
      window.clearTimeout(statusResetHandle);
    }
    statusEl.textContent = message;
    shell.setStatusSummary(message);
    shell.pushActivity(message, "success");
    statusResetHandle = window.setTimeout(() => {
      statusEl.textContent = restoreText;
      shell.setStatusSummary(restoreText);
      statusResetHandle = null;
    }, durationMs);
  }

  function applyLightingState(): void {
    const warmthT = clamp((lightingState.warmth + 1) * 0.5, 0, 1);
    const coolKey = new THREE.Color("#f5fbff");
    const warmKey = new THREE.Color("#ffd8a8");
    const coolFill = new THREE.Color("#e7f0ff");
    const warmFill = new THREE.Color("#ffe9cd");
    const coolSky = new THREE.Color("#f8fbff");
    const warmSky = new THREE.Color("#fff1d9");
    const keyColor = new THREE.Color().lerpColors(coolKey, warmKey, warmthT);
    const fillColor = new THREE.Color().lerpColors(coolFill, warmFill, warmthT * 0.65);
    const skyColor = new THREE.Color().lerpColors(coolSky, warmSky, warmthT * 0.55);

    renderer.toneMappingExposure = lightingState.exposure;
    keyLight.color.copy(keyColor);
    fillLight.color.copy(fillColor);
    hemiLight.color.copy(skyColor);
    hemiLight.groundColor.set("#d5d0cb");

    keyLight.intensity = lightingState.keyLightIntensity * (0.85 + lightingState.shadowStrength * 0.45);
    fillLight.intensity = lightingState.fillLightIntensity * (1.0 - lightingState.shadowStrength * 0.25);
    hemiLight.intensity = 0.35 + lightingState.fillLightIntensity * (0.42 - lightingState.shadowStrength * 0.12);
    keyLight.shadow.radius = 2 + (1 - lightingState.shadowStrength) * 8;
    keyLight.shadow.normalBias = 0.01 + (1 - lightingState.shadowStrength) * 0.03;
  }

  function syncLightingUi(): void {
    lightingPresetEl.value = lightingState.preset;
    exposureInput.value = lightingState.exposure.toString();
    keyInput.value = lightingState.keyLightIntensity.toString();
    fillInput.value = lightingState.fillLightIntensity.toString();
    warmthInput.value = lightingState.warmth.toString();
    shadowInput.value = lightingState.shadowStrength.toString();
    exposureValueEl.textContent = lightingState.exposure.toFixed(2);
    keyValueEl.textContent = lightingState.keyLightIntensity.toFixed(2);
    fillValueEl.textContent = lightingState.fillLightIntensity.toFixed(2);
    warmthValueEl.textContent = lightingState.warmth.toFixed(2);
    shadowValueEl.textContent = lightingState.shadowStrength.toFixed(2);
    crosshairEl.hidden = !laserToggleEl.checked;
    applyLightingState();
  }

  function setSettingsOpen(nextOpen: boolean, restoreRoam = false): void {
    settingsOpen = nextOpen;
    settingsPanelEl.dataset.open = nextOpen ? "true" : "false";
    settingsToggleEl.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    if (nextOpen) {
      shell.activateRightTab("settings");
    } else if (!designOpen && !evaluateOpen && !compareOpen && !presetsOpen && !historyAnalysisOpen) {
      shell.activateRightTab(null);
    }
    if (nextOpen) {
      if (controls.isLocked) {
        resumeRoamAfterSettingsClose = true;
        controls.unlock();
      }
      return;
    }
    const shouldRestoreRoam = restoreRoam || resumeRoamAfterSettingsClose;
    resumeRoamAfterSettingsClose = false;
    if (shouldRestoreRoam) {
      controls.lock();
    }
  }

  function toggleSettingsShortcut(): void {
    if (settingsOpen) {
      setSettingsOpen(false, true);
      return;
    }
    setSettingsOpen(true);
  }

  function updateCanvasSlideOpenState(): void {
    const anyOpen = designOpen || evaluateOpen || compareOpen || presetsOpen;
    canvasHost.dataset.slideOpen = anyOpen ? "true" : "false";
  }

  function closeAllSlidePanels(): void {
    if (settingsOpen) setSettingsOpen(false);
    if (designOpen) {
      designOpen = false;
      designPanelEl.dataset.open = "false";
    }
    if (evaluateOpen) {
      evaluateOpen = false;
      evaluatePanelEl.dataset.open = "false";
    }
    if (compareOpen) {
      compareOpen = false;
      comparePanelEl.dataset.open = "false";
    }
    if (presetsOpen) {
      presetsOpen = false;
      presetsPanelEl.dataset.open = "false";
    }
    if (graphOverlayActive) {
      clearGraphOverlay();
      graphOverlayActive = false;
    }
    if (layoutOverlayToggleEl.checked) {
      layoutOverlayToggleEl.checked = false;
      floatingLaneConfig.enabled = false;
      clearFloatingLaneOverlay();
    }
    shell.activateRightTab(null);
    updateCanvasSlideOpenState();
  }

  function setDesignOpen(nextOpen: boolean): void {
    if (nextOpen) {
      closeAllSlidePanels();
      populateDesignPresets();
    }
    designOpen = nextOpen;
    designPanelEl.dataset.open = nextOpen ? "true" : "false";
    if (nextOpen) {
      shell.activateRightTab("design");
    } else if (!settingsOpen && !evaluateOpen && !compareOpen && !presetsOpen && !historyAnalysisOpen) {
      shell.activateRightTab(null);
    }
    updateCanvasSlideOpenState();
  }

  function setEvaluateOpen(nextOpen: boolean): void {
    if (nextOpen) closeAllSlidePanels();
    evaluateOpen = nextOpen;
    evaluatePanelEl.dataset.open = nextOpen ? "true" : "false";
    if (nextOpen) {
      shell.activateRightTab("evaluate");
    } else if (!settingsOpen && !designOpen && !compareOpen && !presetsOpen && !historyAnalysisOpen) {
      shell.activateRightTab(null);
    }
    updateCanvasSlideOpenState();
  }

  function setCompareOpen(nextOpen: boolean): void {
    if (nextOpen) {
      closeAllSlidePanels();
      populateCompareSelectors();
    }
    compareOpen = nextOpen;
    comparePanelEl.dataset.open = nextOpen ? "true" : "false";
    if (nextOpen) {
      shell.activateRightTab("compare");
    } else if (!settingsOpen && !designOpen && !evaluateOpen && !presetsOpen && !historyAnalysisOpen) {
      shell.activateRightTab(null);
    }
    updateCanvasSlideOpenState();
  }

  function setPresetsOpen(nextOpen: boolean): void {
    if (nextOpen) {
      closeAllSlidePanels();
      populatePresetsGrid();
    }
    presetsOpen = nextOpen;
    presetsPanelEl.dataset.open = nextOpen ? "true" : "false";
    if (nextOpen) {
      shell.activateRightTab("presets");
    } else if (!settingsOpen && !designOpen && !evaluateOpen && !compareOpen && !historyAnalysisOpen && !helpOpen) {
      shell.activateRightTab(null);
    }
    updateCanvasSlideOpenState();
  }

  function setHelpOpen(nextOpen: boolean): void {
    if (nextOpen) {
      closeAllSlidePanels();
    }
    helpOpen = nextOpen;
    helpPanelEl.dataset.open = nextOpen ? "true" : "false";
    if (nextOpen) {
      shell.activateRightTab("help");
    } else if (!settingsOpen && !designOpen && !evaluateOpen && !compareOpen && !historyAnalysisOpen && !presetsOpen) {
      shell.activateRightTab(null);
    }
    updateCanvasSlideOpenState();
  }

  /* ── Graph Overlay ──────────────────────────────────────────── */

  function clearGraphOverlay(): void {
    for (const marker of graphOverlayMarkers) {
      scene.remove(marker);
      if (marker instanceof THREE.Mesh) {
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
      }
      if (marker instanceof THREE.Sprite) {
        marker.material.map?.dispose();
        marker.material.dispose();
      }
    }
    graphOverlayMarkers.length = 0;
  }

  function buildGraphOverlay(): void {
    clearGraphOverlay();
    if (!currentRoot || !currentManifest) return;

    const instances = currentManifest.instances;
    if (!instances) return;

    for (const [instanceId, info] of Object.entries(instances)) {
      const category = String(info.category || "").trim().toLowerCase();
      const color = CATEGORY_COLORS[category] ?? 0x38bdf8;

      // Find the matching node in the scene
      let targetNode: THREE.Object3D | null = null;
      currentRoot.traverse((child) => {
        if (!child.name) return;
        const match = resolveInstanceIdFromName(child.name);
        if (match === instanceId) targetNode = child;
      });
      if (!targetNode) continue;

      const bbox = new THREE.Box3().setFromObject(targetNode);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      if (size.length() < 0.01) continue;

      // Colored sphere marker at instance center
      const markerGeo = new THREE.SphereGeometry(Math.max(0.25, size.length() * 0.08), 12, 12);
      const markerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(center);
      marker.position.y = bbox.max.y + 0.6;
      marker.userData.isGraphOverlayHelper = true;
      scene.add(marker);
      graphOverlayMarkers.push(marker);

      // Vertical line from object to marker
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(center.x, bbox.max.y, center.z),
        new THREE.Vector3(center.x, bbox.max.y + 0.6, center.z),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const line = new THREE.Line(lineGeo, lineMat);
      line.userData.isGraphOverlayHelper = true;
      scene.add(line);
      graphOverlayMarkers.push(line);

      // Label sprite showing instance id and category
      const labelText = `${instanceId}\n${categoryLabel(category)}`;
      const label = createTextSprite(labelText, color);
      label.position.set(center.x, bbox.max.y + 1.4, center.z);
      label.userData.isGraphOverlayHelper = true;
      scene.add(label);
      graphOverlayMarkers.push(label);
    }

    // Switch camera mode to graph_overlay
    currentCameraMode = "graph_overlay";
    // Position camera for top-down overview
    if (currentSceneBounds) {
      const overviewHeight = currentSceneBounds.extent * 2.5;
      camera.position.set(
        currentSceneBounds.center.x,
        overviewHeight,
        currentSceneBounds.center.z,
      );
      camera.lookAt(currentSceneBounds.center.x, 0, currentSceneBounds.center.z);
    }
  }

  /* ── Floating Lane Overlay ─────────────────────────────────── */

  // Floating lane colors - HDR style (bright, saturated)
  const FLOATING_COLORS: Record<string, number> = {
    carriageway: 0x3b82f6,   // Blue
    drive_lane: 0x60a5fa,    // Light blue
    bike_lane: 0x22c55e,    // Green
    bus_lane: 0xf59e0b,     // Orange
    parking_lane: 0x6b7280,  // Gray
    clear_path: 0xfaf5e6,    // Cream
    furnishing: 0x92400e,    // Brown
    sidewalk: 0xd4c4a8,     // Tan
    median: 0xf97316,       // Orange-red
    greenzone: 0x16a34a,    // Dark green
    buffer: 0x8b5cf6,       // Purple
    frontage: 0x06b6d4,     // Cyan
    shared: 0xa78bfa,       // Lavender
    default: 0x94a3b8,
  };

  // Safety color scheme
  const SAFETY_COLORS: Record<string, number> = {
    carriageway: 0xef4444,   // Red - dangerous
    bike_lane: 0x22c55e,    // Green - safe
    clear_path: 0x22c55e,   // Green - safe
    sidewalk: 0x22c55e,     // Green - safe
    furnishing: 0xeab308,   // Yellow - caution
    default: 0x94a3b8,
  };

  // Lane kind labels
  const LANE_LABELS: Record<string, string> = {
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
  };

  // Floating lane overlay state
  let floatingLaneObjects: THREE.Object3D[] = [];
  let floatingLaneConfig: FloatingLaneConfig = {
    enabled: false,
    height: 0.5,
    opacity: 0.5,
    showEdgeLines: true,
    showLabels: true,
    animated: false,
    colorScheme: "semantic",
    selectedLaneIndex: -1,
    showBuildings: true,
    showFeatures: true,
    showPlacementMarkers: true,
    buildingOpacity: 0.4,
    featureOpacity: 0.6,
  };
  let visibleLaneKinds: Set<string> = new Set([
    "carriageway", "drive_lane", "clear_path", "furnishing", "sidewalk",
  ]);
  let floatingLaneAnimTime = 0;

  function getFloatingLaneColor(kind: string): number {
    const colors = floatingLaneConfig.colorScheme === "safety" ? SAFETY_COLORS : FLOATING_COLORS;
    return colors[kind] ?? colors["default"] ?? 0x94a3b8;
  }

  function getTurnLaneFloatingKind(patch: Record<string, unknown>): string {
    const surfaceRole = String(patch.surface_role ?? "").toLowerCase();
    const stripKind = String(patch.strip_kind ?? "").toLowerCase();
    if (surfaceRole === "bike_lane" || stripKind === "bike_lane") return "bike_lane";
    if (surfaceRole === "bus_lane" || stripKind === "bus_lane") return "bus_lane";
    if (surfaceRole === "parking_lane" || stripKind === "parking_lane") return "parking_lane";
    if (surfaceRole === "furnishing" || stripKind.includes("furnishing") || stripKind.includes("buffer")) return "furnishing";
    if (surfaceRole === "context_ground" || stripKind === "frontage_reserve") return "frontage";
    if (surfaceRole === "sidewalk" || stripKind === "clear_sidewalk") return "sidewalk";
    return "carriageway";
  }

  function clearFloatingLaneOverlay(): void {
    for (const obj of floatingLaneObjects) {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          (obj.material as THREE.Material).dispose();
        }
      }
      if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
      if (obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }
    floatingLaneObjects.length = 0;
    floatingLaneConfig.selectedLaneIndex = -1;
    updateAxisHud(); // Hide HUD when overlay is cleared
  }

  function createFloatingLaneLabel(kind: string, x: number, y: number, z: number, customLabel?: string): THREE.Sprite {
    const label = customLabel ?? LANE_LABELS[kind] ?? LANE_LABELS["default"];
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    roundRect(ctx, 0, 0, 256, 64, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4, 1, 1);
    sprite.position.set(x, y, z);
    sprite.userData.isFloatingLane = true;
    sprite.userData.laneLabel = label;
    return sprite;
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ─── Axis HUD Drawing ────────────────────────────────────────────────────────

  function updateAxisHud(): void {
    const ctx = axisHudEl.getContext("2d");
    if (!ctx) return;

    // Setup high DPI
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = 200;
    const displayHeight = 60;
    axisHudEl.width = Math.round(displayWidth * dpr);
    axisHudEl.height = Math.round(displayHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Only show when floating lane overlay is enabled
    if (!floatingLaneConfig.enabled) return;

    // Background panel
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    roundRect(ctx, 0, 0, displayWidth, displayHeight, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Get camera heading angle (0° = North = +Z in world space)
    const forward = cameraForwardHorizontal();
    const headingRad = Math.atan2(forward.x, forward.z);
    let headingDeg = (-headingRad * 180 / Math.PI + 360) % 360;

    // Compass circle
    const compassX = 35;
    const compassY = 30;
    const compassRadius = 22;

    // Compass background
    ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
    ctx.beginPath();
    ctx.arc(compassX, compassY, compassRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw compass tick marks and labels
    const directions = [
      { angle: 0, label: "N", color: "#ef4444" },      // North - red
      { angle: 90, label: "E", color: "#ffffff" },    // East
      { angle: 180, label: "S", color: "#ffffff" },   // South
      { angle: 270, label: "W", color: "#ffffff" },   // West
    ];

    // Draw tick marks
    for (let i = 0; i < 36; i++) {
      const tickAngle = (i * 10 - headingDeg) * Math.PI / 180 - Math.PI / 2;
      const isMajor = i % 9 === 0;
      const tickLen = isMajor ? 6 : 3;
      const x1 = compassX + Math.cos(tickAngle) * (compassRadius - tickLen);
      const y1 = compassY + Math.sin(tickAngle) * (compassRadius - tickLen);
      const x2 = compassX + Math.cos(tickAngle) * compassRadius;
      const y2 = compassY + Math.sin(tickAngle) * compassRadius;
      ctx.strokeStyle = isMajor ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw direction labels
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const dir of directions) {
      const labelAngle = (dir.angle - headingDeg) * Math.PI / 180 - Math.PI / 2;
      const labelX = compassX + Math.cos(labelAngle) * (compassRadius - 12);
      const labelY = compassY + Math.sin(labelAngle) * (compassRadius - 12);
      ctx.fillStyle = dir.color;
      ctx.fillText(dir.label, labelX, labelY);
    }

    // Center dot
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(compassX, compassY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Heading angle text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${headingDeg.toFixed(0)}°`, 70, 22);

    // Heading label
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "11px sans-serif";
    ctx.fillText("HEADING", 70, 42);

    // Scene center info
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`X: ${currentSceneBounds ? currentSceneBounds.center.x.toFixed(1) : "N/A"}`, 195, 18);
    ctx.fillText(`Z: ${currentSceneBounds ? currentSceneBounds.center.z.toFixed(1) : "N/A"}`, 195, 32);
  }

  function buildPolygonShape(points: number[][]): THREE.Shape {
    const shape = new THREE.Shape();
    if (points.length < 3) return shape;
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i][0], points[i][1]);
    }
    shape.closePath();
    return shape;
  }

  function buildFloatingLaneOverlay(): void {
    clearFloatingLaneOverlay();
    if (!currentManifest?.layout_overlay) {
      updateAxisHud(); // Update HUD even when no overlay
      return;
    }

    // Update axis HUD when overlay is enabled
    updateAxisHud();

    const overlay = currentManifest.layout_overlay;

    // Get OSM geometry for carriageway rings (road polygons)
    const summary = (currentManifest.summary ?? {}) as Record<string, unknown>;
    const osmGeom = (summary.osm_geometry ?? {}) as Record<string, unknown>;
    const carriagewayRings = (osmGeom.carriageway_rings ?? []) as number[][][];
    const sidewalkRings = (osmGeom.sidewalk_rings ?? []) as number[][][];
    const junctions = (osmGeom.junction_geometries ?? []) as Array<Record<string, unknown>>;

    const height: number = floatingLaneConfig.height ?? 0;
    if (floatingLaneConfig.height === undefined) {
      console.warn("floatingLaneConfig.height is undefined, using 0");
    }

    // ShapeGeometry is defined in XY plane; rotation.x = -PI/2 maps Shape(x,y) → World(x,0,-y).
    // Pre-negate Z so that after rotation, world Z matches the data Z.
    const toShapeXY = (point: number[]): number[] => [point[0], -point[1]];

    // ========== 1. Render road polygons using carriagewayRings ==========
    if (carriagewayRings.length > 0) {
      for (const ring of carriagewayRings) {
        if (ring.length < 3) continue;
        const shapeRing = ring.map(p => toShapeXY(p));
        const shape = buildPolygonShape(shapeRing);
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
          color: FLOATING_COLORS.carriageway,
          transparent: true,
          opacity: floatingLaneConfig.opacity! * 0.7,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, height!, 0);
        mesh.userData.isFloatingLane = true;
        mesh.userData.overlayType = "road";
        scene.add(mesh);
        floatingLaneObjects.push(mesh);

        // Add edge lines for road polygon
        if (floatingLaneConfig.showEdgeLines) {
          const edgeMaterial = new THREE.LineBasicMaterial({
            color: FLOATING_COLORS.carriageway,
            transparent: true,
            opacity: floatingLaneConfig.opacity! * 0.9,
          });
          const points: THREE.Vector3[] = [];
          for (const point of ring) {
            const yPos = height !== undefined ? height : 0;
            points.push(new THREE.Vector3(point[0], yPos, point[1]));
          }
          points.push(points[0].clone()); // close the loop
          const edgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
          const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
          edgeLine.userData.isFloatingLane = true;
          scene.add(edgeLine);
          floatingLaneObjects.push(edgeLine);
        }
      }
    }

    // ========== 2. Render sidewalk rings ==========
    if (floatingLaneConfig.showEdgeLines && sidewalkRings.length > 0) {
      for (const ring of sidewalkRings) {
        if (ring.length < 3) continue;
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: FLOATING_COLORS.sidewalk,
          transparent: true,
          opacity: floatingLaneConfig.opacity! * 0.8,
        });
        const points: THREE.Vector3[] = [];
        for (const point of ring) {
          points.push(new THREE.Vector3(point[0], height!, point[1]));
        }
        points.push(points[0].clone());
        const edgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
        edgeLine.userData.isFloatingLane = true;
        scene.add(edgeLine);
        floatingLaneObjects.push(edgeLine);
      }
    }

    // ========== 3. Render junctions from junction_geometries ==========
    for (const junction of junctions) {
      const coreRings = (junction.carriageway_core_rings ?? []) as number[][][];
      for (const ring of coreRings) {
        if (ring.length < 3) continue;
        const shapeRing = ring.map(p => toShapeXY(p));
        const shape = buildPolygonShape(shapeRing);
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
          color: FLOATING_COLORS.carriageway,
          transparent: true,
          opacity: floatingLaneConfig.opacity! * 0.75,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, height!, 0);
        mesh.userData.isFloatingLane = true;
        mesh.userData.overlayType = "junction";
        scene.add(mesh);
        floatingLaneObjects.push(mesh);

        // Edge lines for junction
        if (floatingLaneConfig.showEdgeLines) {
          const edgeMaterial = new THREE.LineBasicMaterial({
            color: FLOATING_COLORS.carriageway,
            transparent: true,
            opacity: floatingLaneConfig.opacity! * 0.9,
          });
          const points: THREE.Vector3[] = [];
          for (const point of ring) {
            points.push(new THREE.Vector3(point[0], height!, point[1]));
          }
          points.push(points[0].clone());
          const edgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
          const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
          edgeLine.userData.isFloatingLane = true;
          scene.add(edgeLine);
          floatingLaneObjects.push(edgeLine);
        }
      }

      const turnLanePatches = (junction.turn_lane_patches ?? []) as Array<Record<string, unknown>>;
      for (const [patchIndex, patch] of turnLanePatches.entries()) {
        const rings = (patch.rings ?? []) as number[][][];
        const color = getFloatingLaneColor(getTurnLaneFloatingKind(patch));
        for (const [ringIndex, ring] of rings.entries()) {
          if (ring.length < 3) continue;
          const shapeRing = ring.map((point) => toShapeXY(point));
          const shape = buildPolygonShape(shapeRing);
          const geometry = new THREE.ShapeGeometry(shape);
          const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: floatingLaneConfig.opacity! * 0.42,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(0, height + 0.012, 0);
          mesh.userData.isFloatingLane = true;
          mesh.userData.overlayType = "junction-turn-lane";
          mesh.userData.surfaceId = patch.patch_id ?? `turn_lane_${patchIndex}_${ringIndex}`;
          scene.add(mesh);
          floatingLaneObjects.push(mesh);

          if (floatingLaneConfig.showEdgeLines) {
            const edgeMaterial = new THREE.LineBasicMaterial({
              color,
              transparent: true,
              opacity: floatingLaneConfig.opacity! * 0.8,
            });
            const points: THREE.Vector3[] = [];
            for (const point of ring) {
              points.push(new THREE.Vector3(point[0], height + 0.012, point[1]));
            }
            points.push(points[0].clone());
            const edgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
            edgeLine.userData.isFloatingLane = true;
            edgeLine.userData.overlayType = "junction-turn-lane-edge";
            scene.add(edgeLine);
            floatingLaneObjects.push(edgeLine);
          }
        }
      }

      const surfacePatchCollections = [
        {
          patches: (junction.lane_surface_patches ?? []) as Array<Record<string, unknown>>,
          kind: "lane" as const,
        },
        {
          patches: (junction.merged_surface_patches ?? []) as Array<Record<string, unknown>>,
          kind: "merged" as const,
        },
      ];

      for (const collection of surfacePatchCollections) {
        for (const [patchIndex, patch] of collection.patches.entries()) {
          const rings = (patch.rings ?? []) as number[][][];
          for (const [ringIndex, ring] of rings.entries()) {
            if (ring.length < 3) continue;
            const shapeRing = ring.map((point) => toShapeXY(point));
            const shape = buildPolygonShape(shapeRing);
            const geometry = new THREE.ShapeGeometry(shape);
            const color =
              collection.kind === "merged"
                ? 0x8b5cf6
                : patch.flow === "outbound"
                  ? 0xdc2626
                  : 0x2563eb;
            const material = new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: floatingLaneConfig.opacity! * (collection.kind === "merged" ? 0.35 : 0.28),
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(0, height + 0.01, 0);
            mesh.userData.isFloatingLane = true;
            mesh.userData.overlayType = `junction-${collection.kind}`;
            mesh.userData.surfaceId = patch.surface_id ?? `${collection.kind}_${patchIndex}_${ringIndex}`;
            scene.add(mesh);
            floatingLaneObjects.push(mesh);

            if (floatingLaneConfig.showEdgeLines) {
              const edgeMaterial = new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: floatingLaneConfig.opacity! * 0.75,
              });
              const points: THREE.Vector3[] = [];
              for (const point of ring) {
                points.push(new THREE.Vector3(point[0], height + 0.01, point[1]));
              }
              points.push(points[0].clone());
              const edgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
              const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
              edgeLine.userData.isFloatingLane = true;
              scene.add(edgeLine);
              floatingLaneObjects.push(edgeLine);
            }
          }
        }
      }
    }

    // ========== 4. Render bands as rectangles (always, with per-lane carriageway split) ==========
    {
      const bandHeight = height + 0.02; // Slight offset above OSM polygons to avoid z-fighting

      // --- Compute road extent and center from actual scene geometry ---
      let roadMinX: number;
      let roadMaxX: number;
      let roadCenterZ = 0; // Lateral offset: band z_center_m is relative to road center

      if (carriagewayRings.length > 0) {
        // Use actual carriageway ring bounds for positioning
        let ringMinX = Infinity, ringMaxX = -Infinity;
        let ringMinZ = Infinity, ringMaxZ = -Infinity;
        for (const ring of carriagewayRings) {
          for (const point of ring) {
            ringMinX = Math.min(ringMinX, point[0]);
            ringMaxX = Math.max(ringMaxX, point[0]);
            ringMinZ = Math.min(ringMinZ, point[1]);
            ringMaxZ = Math.max(ringMaxZ, point[1]);
          }
        }
        // Also include junction rings in extent
        for (const junctionObj of junctions) {
          const coreRings = (junctionObj.carriageway_core_rings ?? []) as number[][][];
          for (const ring of coreRings) {
            for (const point of ring) {
              ringMinX = Math.min(ringMinX, point[0]);
              ringMaxX = Math.max(ringMaxX, point[0]);
              ringMinZ = Math.min(ringMinZ, point[1]);
              ringMaxZ = Math.max(ringMaxZ, point[1]);
            }
          }
        }
        roadMinX = ringMinX;
        roadMaxX = ringMaxX;
        roadCenterZ = (ringMinZ + ringMaxZ) / 2;
      } else if (currentManifest?.scene_bounds) {
        // Use scene bounds for positioning
        const sb = currentManifest.scene_bounds;
        roadMinX = sb.center[0] - sb.size[0] / 2;
        roadMaxX = sb.center[0] + sb.size[0] / 2;
        roadCenterZ = sb.center[2];
      } else {
        // Fallback: overlay.length_m centered at origin (template mode)
        const halfLen = (overlay.length_m || 100) / 2;
        roadMinX = -halfLen;
        roadMaxX = halfLen;
        roadCenterZ = 0;
      }

      const laneCount = Math.max(1, overlay.lane_count ?? 1);
      const roadCenterX = (roadMinX + roadMaxX) / 2;
      const length = roadMaxX - roadMinX;

      const addSolidEdgeLine = (x1: number, z1: number, x2: number, z2: number, color: number, opacity: number) => {
        const edgeLineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        const points = [new THREE.Vector3(x1, bandHeight, z1), new THREE.Vector3(x2, bandHeight, z2)];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, edgeLineMat);
        line.userData.isFloatingLane = true;
        scene.add(line);
        floatingLaneObjects.push(line);
      };

      const addDashedEdgeLine = (x1: number, z1: number, x2: number, z2: number, opacity: number) => {
        const dashMat = new THREE.LineDashedMaterial({
          color: 0xffffff,
          transparent: true,
          opacity,
          dashSize: 1.5,
          gapSize: 1.0,
        });
        const points = [new THREE.Vector3(x1, bandHeight, z1), new THREE.Vector3(x2, bandHeight, z2)];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, dashMat);
        line.computeLineDistances();
        line.userData.isFloatingLane = true;
        scene.add(line);
        floatingLaneObjects.push(line);
      };

      for (let bandIdx = 0; bandIdx < overlay.bands.length; bandIdx++) {
        const band = overlay.bands[bandIdx];
        if (!band.width_m || !Number.isFinite(band.width_m)) continue;
        if (!visibleLaneKinds.has(band.kind) && band.kind !== "default") continue;

        // Band z_center_m is relative to road center; offset by roadCenterZ for world position
        const bandZ = roadCenterZ + (band.z_center_m ?? 0);

        const isSelected = floatingLaneConfig.selectedLaneIndex === bandIdx;
        const baseOpacity = isSelected
          ? Math.min(floatingLaneConfig.opacity! * 1.5, 0.9)
          : floatingLaneConfig.opacity! * (floatingLaneConfig.animated ? 0.7 + 0.3 * Math.sin(floatingLaneAnimTime * 3) : 1);

        // --- Carriageway: split into per-lane sub-lanes ---
        if (band.kind === "carriageway" && laneCount > 0) {
          const laneWidth = band.width_m / laneCount;
          const zStart = bandZ - band.width_m / 2;

          for (let i = 0; i < laneCount; i++) {
            const laneZCenter = zStart + laneWidth * (i + 0.5);
            const laneColor = PER_LANE_COLORS[i % PER_LANE_COLORS.length];

            const planeGeo = new THREE.PlaneGeometry(length, laneWidth);
            const planeMat = new THREE.MeshBasicMaterial({
              color: laneColor,
              transparent: true,
              opacity: baseOpacity * 0.7,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const planeMesh = new THREE.Mesh(planeGeo, planeMat);
            planeMesh.rotation.x = -Math.PI / 2;
            planeMesh.position.set(roadCenterX, bandHeight, laneZCenter);
            planeMesh.userData.isFloatingLane = true;
            planeMesh.userData.bandIndex = bandIdx;
            planeMesh.userData.bandKind = "drive_lane";
            planeMesh.userData.laneIndex = i;
            planeMesh.userData.overlayType = "lane";
            scene.add(planeMesh);
            floatingLaneObjects.push(planeMesh);

            // Edge lines for each lane
            if (floatingLaneConfig.showEdgeLines) {
              const laneLeftZ = laneZCenter - laneWidth / 2;
              const laneRightZ = laneZCenter + laneWidth / 2;

              if (i === 0) {
                // Outer boundary (first lane left edge) — solid
                addSolidEdgeLine(roadMinX, laneLeftZ, roadMaxX, laneLeftZ, isSelected ? 0xffffff : (laneColor as unknown as number), baseOpacity * 0.9);
              }
              if (i === laneCount - 1) {
                // Outer boundary (last lane right edge) — solid
                addSolidEdgeLine(roadMinX, laneRightZ, roadMaxX, laneRightZ, isSelected ? 0xffffff : (laneColor as unknown as number), baseOpacity * 0.9);
              }
              if (i > 0) {
                // Inter-lane boundary — dashed white
                addDashedEdgeLine(roadMinX, laneLeftZ, roadMaxX, laneLeftZ, baseOpacity * 0.7);
              }
            }

            // Per-lane label
            if (floatingLaneConfig.showLabels) {
              const labelSprite = createFloatingLaneLabel(
                "drive_lane",
                roadCenterX,
                bandHeight + 1.5,
                laneZCenter,
                `车道 ${i + 1}`,
              );
              labelSprite.userData.isFloatingLane = true;
              labelSprite.userData.bandIndex = bandIdx;
              labelSprite.userData.laneIndex = i;
              scene.add(labelSprite);
              floatingLaneObjects.push(labelSprite);
            }
          }

          // End-cap lines for carriageway outer boundaries
          if (floatingLaneConfig.showEdgeLines) {
            const cwLeftZ = zStart;
            const cwRightZ = zStart + band.width_m;
            addSolidEdgeLine(roadMinX, cwLeftZ, roadMinX, cwRightZ, isSelected ? 0xffffff : (PER_LANE_COLORS[0] as unknown as number), baseOpacity * 0.9);
            addSolidEdgeLine(roadMaxX, cwLeftZ, roadMaxX, cwRightZ, isSelected ? 0xffffff : (PER_LANE_COLORS[0] as unknown as number), baseOpacity * 0.9);
          }

          // Selection glow covers entire carriageway
          if (isSelected) {
            const glowGeo = new THREE.PlaneGeometry(length + 0.5, band.width_m + 0.5);
            const glowMat = new THREE.MeshBasicMaterial({
              color: PER_LANE_COLORS[0],
              transparent: true,
              opacity: 0.2,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const glowMesh = new THREE.Mesh(glowGeo, glowMat);
            glowMesh.rotation.x = -Math.PI / 2;
            glowMesh.position.set(roadCenterX, bandHeight - 0.01, bandZ);
            glowMesh.userData.isFloatingLane = true;
            scene.add(glowMesh);
            floatingLaneObjects.push(glowMesh);
          }
        } else {
          // --- Non-carriageway band: render as single rectangle ---
          const baseColor = getFloatingLaneColor(band.kind);
          const planeGeo = new THREE.PlaneGeometry(length, band.width_m);
          const planeMat = new THREE.MeshBasicMaterial({
            color: baseColor,
            transparent: true,
            opacity: baseOpacity * 0.7,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const planeMesh = new THREE.Mesh(planeGeo, planeMat);
          planeMesh.rotation.x = -Math.PI / 2;
          planeMesh.position.set(roadCenterX, bandHeight, bandZ);
          planeMesh.userData.isFloatingLane = true;
          planeMesh.userData.bandIndex = bandIdx;
          planeMesh.userData.bandKind = band.kind;
          planeMesh.userData.overlayType = "band";
          scene.add(planeMesh);
          floatingLaneObjects.push(planeMesh);

          // Edge lines
          if (floatingLaneConfig.showEdgeLines) {
            const halfWidth = band.width_m / 2;
            const leftZ = bandZ - halfWidth;
            const rightZ = bandZ + halfWidth;

            addSolidEdgeLine(roadMinX, leftZ, roadMaxX, leftZ, isSelected ? 0xffffff : baseColor, baseOpacity * 0.9);
            addSolidEdgeLine(roadMinX, rightZ, roadMaxX, rightZ, isSelected ? 0xffffff : baseColor, baseOpacity * 0.9);
            addSolidEdgeLine(roadMinX, leftZ, roadMinX, rightZ, isSelected ? 0xffffff : baseColor, baseOpacity * 0.9);
            addSolidEdgeLine(roadMaxX, leftZ, roadMaxX, rightZ, isSelected ? 0xffffff : baseColor, baseOpacity * 0.9);
          }

          // Label
          if (floatingLaneConfig.showLabels) {
            const labelSprite = createFloatingLaneLabel(
              band.kind,
              roadCenterX,
              bandHeight + 1.5,
              bandZ,
            );
            labelSprite.userData.isFloatingLane = true;
            labelSprite.userData.bandIndex = bandIdx;
            scene.add(labelSprite);
            floatingLaneObjects.push(labelSprite);
          }

          // Selection glow
          if (isSelected) {
            const glowGeo = new THREE.PlaneGeometry(length + 0.5, band.width_m + 0.5);
            const glowMat = new THREE.MeshBasicMaterial({
              color: baseColor,
              transparent: true,
              opacity: 0.2,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const glowMesh = new THREE.Mesh(glowGeo, glowMat);
            glowMesh.rotation.x = -Math.PI / 2;
            glowMesh.position.set(roadCenterX, bandHeight - 0.01, bandZ);
            glowMesh.userData.isFloatingLane = true;
            scene.add(glowMesh);
            floatingLaneObjects.push(glowMesh);
          }
        }
      }
    }

    // ========== 5. Render buildings as floating overlays ==========
    if (floatingLaneConfig.showBuildings) {
      for (let i = 0; i < overlay.building_footprints.length; i++) {
        const fp = overlay.building_footprints[i];
        const pts = fp.polygon_xz;
        if (!Array.isArray(pts) || pts.length < 3) continue;

        const shape = buildPolygonShape(pts.map(p => [p[0], -p[1]]));
        const geometry = new THREE.ShapeGeometry(shape);
        const landUseType = fp.land_use_type?.toLowerCase() ?? "";
        const colorKey = landUseType.includes("residential") ? "building_residential"
          : landUseType.includes("commercial") ? "building_commercial"
          : landUseType.includes("industrial") ? "building_industrial"
          : "building";
        const baseColor = FLOATING_COLORS[colorKey] ?? FLOATING_COLORS.building;

        const material = new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: floatingLaneConfig.buildingOpacity,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, height!, 0);
        mesh.userData.isFloatingLane = true;
        mesh.userData.overlayType = "building";
        mesh.userData.buildingIndex = i;
        scene.add(mesh);
        floatingLaneObjects.push(mesh);

        // Building edge lines
        if (floatingLaneConfig.showEdgeLines) {
          const edgeMaterial = new THREE.LineBasicMaterial({
            color: baseColor,
            transparent: true,
            opacity: floatingLaneConfig.buildingOpacity! * 1.2,
          });
          const points: THREE.Vector3[] = [];
          for (const point of pts) {
            points.push(new THREE.Vector3(point[0], height!, point[1]));
          }
          points.push(points[0].clone());
          const edgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
          const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
          edgeLine.userData.isFloatingLane = true;
          scene.add(edgeLine);
          floatingLaneObjects.push(edgeLine);
        }

        // Building label at centroid
        if (floatingLaneConfig.showLabels && fp.centroid_xz) {
          const labelSprite = createFloatingLaneLabel(
            "building",
            fp.centroid_xz[0],
            height + 2,
            fp.centroid_xz[1]
          );
          labelSprite.userData.isFloatingLane = true;
          labelSprite.userData.buildingIndex = i;
          scene.add(labelSprite);
          floatingLaneObjects.push(labelSprite);
        }
      }
    }

    // ========== 6. Render features (trees, lamps, etc.) ==========
    const instances = currentManifest.instances;
    if (floatingLaneConfig.showFeatures && instances) {
      const featureCategories = ["tree", "lamp", "bench", "trash", "bollard", "bus_stop"];
      for (const [id, info] of Object.entries(instances)) {
        const instanceInfo = info as InstanceInfo;
        if (!instanceInfo.position_xyz) continue;
        const category = String(instanceInfo.category || "").toLowerCase();
        if (!featureCategories.includes(category)) continue;

        const x = instanceInfo.position_xyz[0];
        const z = instanceInfo.position_xyz[2];
        const baseColor = FLOATING_COLORS[category] ?? FLOATING_COLORS.default;

        // Feature marker (small circle/disc)
        const radius = category === "tree" ? 1.5 : 0.5;
        const geometry = new THREE.CircleGeometry(radius, 16);
        const material = new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: floatingLaneConfig.featureOpacity,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, height!, z);
        mesh.userData.isFloatingLane = true;
        mesh.userData.overlayType = "feature";
        mesh.userData.featureCategory = category;
        scene.add(mesh);
        floatingLaneObjects.push(mesh);

        // Feature label
        if (floatingLaneConfig.showLabels) {
          const labelSprite = createFloatingLaneLabel(
            category,
            x,
            height + 1,
            z
          );
          labelSprite.userData.isFloatingLane = true;
          labelSprite.userData.featureCategory = category;
          scene.add(labelSprite);
          floatingLaneObjects.push(labelSprite);
        }
      }
    }

    // ========== 7. Render placement markers (absorbed from Layout Overlay) ==========
    if (floatingLaneConfig.showPlacementMarkers && instances) {
      const markerGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8);
      for (const info of Object.values(instances)) {
        const category = String(info.category || "").trim().toLowerCase();
        const color = CATEGORY_COLORS[category] ?? 0x38bdf8;
        const markerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        if (info.position_xyz) {
          marker.position.set(
            info.position_xyz[0],
            (info.position_xyz[1] || 0) + 0.6,
            info.position_xyz[2],
          );
        }
        marker.userData.isFloatingLane = true;
        marker.userData.overlayType = "marker";
        scene.add(marker);
        floatingLaneObjects.push(marker);

        const label = createTextSprite(category, color);
        label.position.set(marker.position.x, marker.position.y + 1.2, marker.position.z);
        label.userData.isFloatingLane = true;
        scene.add(label);
        floatingLaneObjects.push(label);
      }
    }
  }

  function updateFloatingLaneOverlay(deltaTime: number): void {
    if (!floatingLaneConfig.enabled) return;
    if (floatingLaneConfig.animated) {
      floatingLaneAnimTime += deltaTime;
      buildFloatingLaneOverlay();
    }
  }

  function createFloatingLaneControlPanel(): void {
    const panelId = "floating-lane-panel";
    if (document.getElementById(panelId)) return;

    const panelHost = requireElement<HTMLElement>(root, "#viewer-floating-lane-panel-host");
    panelHost.innerHTML = "";

    const panel = document.createElement("div");
    panel.id = panelId;
    panel.className = "floating-lane-panel";
    panel.innerHTML = `
      <div class="flp-section">
        <label>Controls</label>
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-enabled" ${floatingLaneConfig.enabled ? "checked" : ""}>
          Enable Overlay
        </label>
      </div>
      <div class="flp-slider-group">
        <label>Height: <span id="flp-height-val">${floatingLaneConfig.height.toFixed(1)}m</span></label>
        <input type="range" id="flp-height" min="0.1" max="3" step="0.1" value="${floatingLaneConfig.height}">
      </div>
      <div class="flp-slider-group">
        <label>Road Opacity: <span id="flp-opacity-val">${(floatingLaneConfig.opacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.opacity}">
      </div>
      <div class="flp-section">
        <label>Visible Elements</label>
        <div class="flp-checkboxes-row">
          <label class="flp-checkbox">
            <input type="checkbox" id="flp-buildings" ${floatingLaneConfig.showBuildings ? "checked" : ""}>
            Buildings
          </label>
          <label class="flp-checkbox">
            <input type="checkbox" id="flp-features" ${floatingLaneConfig.showFeatures ? "checked" : ""}>
            Features (Trees)
          </label>
        </div>
      </div>
      <div class="flp-slider-group" id="flp-building-opacity-group">
        <label>Building Opacity: <span id="flp-building-opacity-val">${(floatingLaneConfig.buildingOpacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-building-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.buildingOpacity}">
      </div>
      <div class="flp-slider-group" id="flp-feature-opacity-group">
        <label>Feature Opacity: <span id="flp-feature-opacity-val">${(floatingLaneConfig.featureOpacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-feature-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.featureOpacity}">
      </div>
      <div class="flp-section">
        <label>Visible Lane Types</label>
        <div class="flp-checkboxes" id="flp-lane-kinds">
          ${["carriageway", "drive_lane", "bike_lane", "bus_lane", "clear_path", "furnishing", "sidewalk", "greenzone"].map(kind => `
            <label class="flp-checkbox">
              <input type="checkbox" data-kind="${kind}" ${visibleLaneKinds.has(kind) ? "checked" : ""}>
              ${LANE_LABELS[kind] || kind}
            </label>
          `).join("")}
        </div>
      </div>
      <div class="flp-section">
        <label>Color Scheme</label>
        <select id="flp-color-scheme">
          <option value="semantic" ${floatingLaneConfig.colorScheme === "semantic" ? "selected" : ""}>Semantic</option>
          <option value="functional" ${floatingLaneConfig.colorScheme === "functional" ? "selected" : ""}>Functional</option>
          <option value="safety" ${floatingLaneConfig.colorScheme === "safety" ? "selected" : ""}>Safety</option>
        </select>
      </div>
      <div class="flp-checkboxes-row">
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-edges" ${floatingLaneConfig.showEdgeLines ? "checked" : ""}>
          Edge Lines
        </label>
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-labels" ${floatingLaneConfig.showLabels ? "checked" : ""}>
          Labels
        </label>
      </div>
      <label class="flp-checkbox">
        <input type="checkbox" id="flp-animated" ${floatingLaneConfig.animated ? "checked" : ""}>
        Animated Pulse
      </label>
      <div class="flp-hint">Press L to toggle | Use carriagewayRings</div>
    `;

    panelHost.appendChild(panel);

    // Add event listeners (no close button in inline mode)
    document.getElementById("flp-enabled")?.addEventListener("change", (e) => {
      floatingLaneConfig.enabled = (e.target as HTMLInputElement).checked;
      layoutOverlayToggleEl.checked = floatingLaneConfig.enabled;
      if (floatingLaneConfig.enabled) {
        buildFloatingLaneOverlay();
      } else {
        clearFloatingLaneOverlay();
      }
    });

    document.getElementById("flp-height")?.addEventListener("input", (e) => {
      floatingLaneConfig.height = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById("flp-height-val")!.textContent = `${floatingLaneConfig.height.toFixed(1)}m`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-opacity")?.addEventListener("input", (e) => {
      floatingLaneConfig.opacity = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById("flp-opacity-val")!.textContent = `${(floatingLaneConfig.opacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-color-scheme")?.addEventListener("change", (e) => {
      floatingLaneConfig.colorScheme = (e.target as HTMLSelectElement).value as "semantic" | "functional" | "safety";
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-edges")?.addEventListener("change", (e) => {
      floatingLaneConfig.showEdgeLines = (e.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-labels")?.addEventListener("change", (e) => {
      floatingLaneConfig.showLabels = (e.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-animated")?.addEventListener("change", (e) => {
      floatingLaneConfig.animated = (e.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-buildings")?.addEventListener("change", (e) => {
      floatingLaneConfig.showBuildings = (e.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-features")?.addEventListener("change", (e) => {
      floatingLaneConfig.showFeatures = (e.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-building-opacity")?.addEventListener("input", (e) => {
      floatingLaneConfig.buildingOpacity = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById("flp-building-opacity-val")!.textContent = `${(floatingLaneConfig.buildingOpacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-feature-opacity")?.addEventListener("input", (e) => {
      floatingLaneConfig.featureOpacity = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById("flp-feature-opacity-val")!.textContent = `${(floatingLaneConfig.featureOpacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-lane-kinds")?.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.dataset.kind) {
        if (target.checked) {
          visibleLaneKinds.add(target.dataset.kind);
        } else {
          visibleLaneKinds.delete(target.dataset.kind);
        }
        buildFloatingLaneOverlay();
      }
    });

    if (!floatingLaneConfig.enabled) {
      panel.style.display = "none";
    }
  }

  function toggleFloatingLaneOverlay(): void {
    floatingLaneConfig.enabled = !floatingLaneConfig.enabled;
    if (floatingLaneConfig.enabled) {
      buildFloatingLaneOverlay();
      createFloatingLaneControlPanel();
      shell.activateRightTab("floating-lane");
      const panel = document.getElementById("floating-lane-panel");
      if (panel) panel.style.display = "block";
    } else {
      clearFloatingLaneOverlay();
      const panel = document.getElementById("floating-lane-panel");
      if (panel) panel.style.display = "none";
      if (!settingsOpen && !designOpen && !evaluateOpen && !compareOpen && !presetsOpen && !historyAnalysisOpen) {
        shell.activateRightTab(null);
      }
    }
  }

  function selectFloatingLane(bandIndex: number): void {
    if (floatingLaneConfig.selectedLaneIndex === bandIndex) {
      floatingLaneConfig.selectedLaneIndex = -1;
    } else {
      floatingLaneConfig.selectedLaneIndex = bandIndex;
    }
    buildFloatingLaneOverlay();
  }

  function resizeRenderer(): void {
    const width = Math.max(1, canvasHost.clientWidth);
    const height = Math.max(1, canvasHost.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);

    const minimapWidth = Math.max(1, minimapHost.clientWidth);
    const minimapHeight = Math.max(1, minimapHost.clientHeight);
    minimapRenderer.setSize(minimapWidth, minimapHeight);
    const dpr = Math.min(window.devicePixelRatio, 2);
    minimapOverlayEl.width = Math.max(1, Math.round(minimapWidth * dpr));
    minimapOverlayEl.height = Math.max(1, Math.round(minimapHeight * dpr));
    minimapOverlayEl.style.width = `${minimapWidth}px`;
    minimapOverlayEl.style.height = `${minimapHeight}px`;
  }

  function cameraForwardHorizontal(): THREE.Vector3 {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) {
      return currentForward.clone().setY(0).normalize();
    }
    return forward.normalize();
  }

  function updateAvatarTransform(): void {
    avatarFigure.position.copy(currentAvatarPosition);
    avatarFigure.visible = currentCameraMode === "third_person";
    const forward = cameraForwardHorizontal();
    if (forward.lengthSq() > 1e-6) {
      avatarFigure.rotation.y = Math.atan2(forward.x, forward.z);
      currentForward.copy(forward);
    }
  }

  function syncCameraRig(): void {
    updateAvatarTransform();
    const headTarget = currentAvatarPosition.clone().add(new THREE.Vector3(0, AVATAR_EYE_HEIGHT_M, 0));
    const forward = cameraForwardHorizontal();
    if (currentCameraMode === "third_person") {
      camera.position
        .copy(headTarget)
        .add(new THREE.Vector3(0, THIRD_PERSON_VERTICAL_OFFSET_M, 0))
        .add(forward.multiplyScalar(-THIRD_PERSON_DISTANCE_M));
      return;
    }
    camera.position.copy(headTarget);
  }

  function resetView(): void {
    currentAvatarPosition.set(
      currentSpawn.x,
      Math.max(0, currentSpawn.y - AVATAR_EYE_HEIGHT_M),
      currentSpawn.z,
    );
    camera.position.copy(currentSpawn);
    const target = currentSpawn.clone().add(currentForward);
    camera.lookAt(target);
    syncCameraRig();
  }

  function updateOverlay(): void {
    overlayEl.hidden = controls.isLocked;
  }

  function clearInfoCard(): void {
    infoCardEl.innerHTML = "";
    infoCardEl.hidden = true;
    currentLaserCopyText = "";
  }

  function setInfoCardContent(htmlContent: string): void {
    infoCardEl.innerHTML = htmlContent;
    // Append metrics dashboard after the info card content
    if (currentManifest?.summary) {
      const metricsDiv = document.createElement("div");
      metricsDiv.id = "viewer-metrics-dashboard";
      metricsDiv.className = "viewer-metrics-dashboard";
      metricsDiv.innerHTML = renderMetricsPanel(currentManifest.summary as Record<string, unknown>);
      infoCardEl.appendChild(metricsDiv);
    }
    infoCardEl.hidden = false;
  }

  async function copyCurrentLaserTargetDetails(): Promise<void> {
    if (!laserToggleEl.checked) {
      flashStatus("Laser pointer is off.");
      return;
    }
    const text = currentLaserCopyText.trim();
    if (!text) {
      flashStatus("No laser target to copy.");
      return;
    }
    try {
      await writeTextToClipboard(text);
      flashStatus("Copied laser target details.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clipboard copy failed.";
      flashStatus(message);
    }
  }

  function handleKey(event: KeyboardEvent, active: boolean): void {
    if (
      active
      && !event.repeat
      && event.code === "KeyC"
      && (event.ctrlKey || event.metaKey)
      && !event.altKey
      && !isEditableTarget(event.target)
      && laserToggleEl.checked
    ) {
      event.preventDefault();
      void copyCurrentLaserTargetDetails();
      return;
    }
    switch (event.code) {
      case "KeyW":
        moveState.forward = active;
        break;
      case "KeyS":
        moveState.backward = active;
        break;
      case "KeyA":
        moveState.left = active;
        break;
      case "KeyD":
        moveState.right = active;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        moveState.sprint = active;
        break;
      case "KeyR":
        if (active) {
          resetView();
        }
        break;
      case "KeyP":
        if (active && !event.repeat) {
          toggleSettingsShortcut();
        }
        break;
      case "KeyL":
        if (active && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
          toggleFloatingLaneOverlay();
        }
        break;
      case "Digit1":
      case "Digit2":
      case "Digit3":
      case "Digit4":
      case "Digit5":
      case "Digit6":
      case "Digit7":
      case "Digit8":
      case "Digit9":
        if (active && !event.repeat && floatingLaneConfig.enabled) {
          const laneIndex = parseInt(event.code.replace("Digit", "")) - 1;
          if (currentManifest?.layout_overlay && laneIndex < currentManifest.layout_overlay.bands.length) {
            selectFloatingLane(laneIndex);
          }
        }
        break;
      case "Escape":
        if (active && floatingLaneConfig.selectedLaneIndex >= 0) {
          floatingLaneConfig.selectedLaneIndex = -1;
          buildFloatingLaneOverlay();
        }
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function configureSceneObjectShadows(rootObject: THREE.Object3D): void {
    rootObject.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) {
          if (material && "depthWrite" in material && material.transparent) {
            material.depthWrite = false;
          }
        }
      } else if (mesh.material && "depthWrite" in mesh.material && mesh.material.transparent) {
        mesh.material.depthWrite = false;
      }
    });
  }

  function sceneBoundsFromBox(box: THREE.Box3): MinimapBounds {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.z) * 0.58 + 6;
    return {
      minX: center.x - extent,
      maxX: center.x + extent,
      minZ: center.z - extent,
      maxZ: center.z + extent,
      center,
      extent,
    };
  }

  function sceneBoundsFromManifest(box: THREE.Box3, manifest: ViewerManifest | null): MinimapBounds {
    const fallback = sceneBoundsFromBox(box);
    const bounds = manifest?.scene_bounds;
    const center = asTriplet(bounds?.center);
    const size = asTriplet(bounds?.size);
    if (!center || !size) {
      return fallback;
    }
    const extent = Math.max(size[0], size[2]) * 0.5;
    if (!(extent > 0)) {
      return fallback;
    }
    const paddedExtent = Math.max(extent + 4, fallback.extent);
    return {
      minX: center[0] - paddedExtent,
      maxX: center[0] + paddedExtent,
      minZ: center[2] - paddedExtent,
      maxZ: center[2] + paddedExtent,
      center: new THREE.Vector3(center[0], center[1], center[2]),
      extent: paddedExtent,
    };
  }

  function updateMinimapCamera(bounds: MinimapBounds, box: THREE.Box3): void {
    currentSceneBounds = bounds;
    minimapCamera.left = -bounds.extent;
    minimapCamera.right = bounds.extent;
    minimapCamera.top = bounds.extent;
    minimapCamera.bottom = -bounds.extent;
    minimapCamera.near = 0.1;
    minimapCamera.far = Math.max(500, box.max.y - box.min.y + bounds.extent * 8);
    minimapCamera.position.set(bounds.center.x, box.max.y + bounds.extent * 2.2 + 10, bounds.center.z);
    minimapCamera.lookAt(bounds.center.x, 0, bounds.center.z);
    minimapCamera.updateProjectionMatrix();
  }

  function worldToMinimap(x: number, z: number): { x: number; y: number } | null {
    if (!currentSceneBounds) {
      return null;
    }
    const width = minimapOverlayEl.clientWidth;
    const height = minimapOverlayEl.clientHeight;
    if (width <= 0 || height <= 0) {
      return null;
    }
    const u = clamp((x - currentSceneBounds.minX) / (currentSceneBounds.maxX - currentSceneBounds.minX), 0, 1);
    const v = clamp((z - currentSceneBounds.minZ) / (currentSceneBounds.maxZ - currentSceneBounds.minZ), 0, 1);
    return {
      x: u * width,
      y: v * height,
    };
  }

  function drawMinimapOverlay(): void {
    const ctx = minimapOverlayEl.getContext("2d");
    if (!ctx) {
      return;
    }
    const width = minimapOverlayEl.width;
    const height = minimapOverlayEl.height;
    const cssWidth = minimapOverlayEl.clientWidth;
    const cssHeight = minimapOverlayEl.clientHeight;
    ctx.clearRect(0, 0, width, height);
    if (!currentSceneBounds || cssWidth <= 0 || cssHeight <= 0) {
      return;
    }

    const dpr = width / Math.max(cssWidth, 1);
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = "rgba(15, 23, 42, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);

    const camPos = worldToMinimap(currentAvatarPosition.x, currentAvatarPosition.z);
    if (camPos) {
      const arrowForward = cameraForwardHorizontal();
      const arrow = new THREE.Vector2(arrowForward.x, arrowForward.z);
      if (arrow.lengthSq() > 1e-6) {
        arrow.normalize();
      }
      const arrowLength = 18;
      const tipX = camPos.x + arrow.x * arrowLength;
      const tipY = camPos.y + arrow.y * arrowLength;
      ctx.fillStyle = "#1f4ed8";
      ctx.beginPath();
      ctx.arc(camPos.x, camPos.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1f4ed8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(camPos.x, camPos.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.fillStyle = "#1f4ed8";
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (currentLaserHitPoint) {
      const hitPoint = worldToMinimap(currentLaserHitPoint.x, currentLaserHitPoint.z);
      if (hitPoint) {
        ctx.fillStyle = "#ff5a4f";
        ctx.strokeStyle = "rgba(255, 90, 79, 0.25)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(hitPoint.x, hitPoint.y, 5.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hitPoint.x, hitPoint.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function renderMinimap(): void {
    if (!currentRoot || !currentSceneBounds) {
      return;
    }
    minimapRenderer.render(scene, minimapCamera);
    drawMinimapOverlay();
  }

  function staticDescriptionForNode(nodeName: string): StaticObjectDescription | null {
    const descriptions = currentManifest?.static_object_descriptions ?? {};
    for (const [pattern, description] of Object.entries(descriptions)) {
      if (!description) {
        continue;
      }
      if (description.match === "exact" && nodeName === pattern) {
        return description;
      }
      if (description.match === "prefix" && nodeName.startsWith(pattern)) {
        return description;
      }
    }
    // Fallback to system node descriptions
    for (const [prefix, description] of Object.entries(SYSTEM_NODE_DESCRIPTIONS)) {
      if (description.match === "exact" && nodeName === prefix) {
        return description;
      }
      if (description.match === "prefix" && nodeName.startsWith(prefix)) {
        return description;
      }
    }
    return null;
  }

  function resolveHitDescriptor(object: THREE.Object3D, hitPoint?: THREE.Vector3): HitDescriptor | null {
    let cursor: THREE.Object3D | null = object;
    const names: string[] = [];
    while (cursor) {
      if (cursor.name) {
        names.push(cursor.name);
      }
      cursor = cursor.parent;
    }

    for (const nodeName of names) {
      const instanceId = resolveInstanceIdFromName(nodeName);
      if (!instanceId) {
        continue;
      }
      const instanceInfo = currentManifest?.instances?.[instanceId];
      if (instanceInfo) {
        return {
          kind: "instance",
          nodeName,
          instanceId,
          instanceInfo,
          assetDescription: currentManifest?.asset_descriptions?.[instanceInfo.asset_id],
          hitPoint,
        };
      }
      return { kind: "generic", nodeName, hitPoint };
    }

    for (const nodeName of names) {
      const description = staticDescriptionForNode(nodeName);
      if (description) {
        return {
          kind: "static",
          nodeName,
          staticDescription: description,
          hitPoint,
        };
      }
    }

    const nodeName = names[0];
    return nodeName ? { kind: "generic", nodeName } : null;
  }

  function updateLaserPointer(): void {
    if (!laserToggleEl.checked || !currentRoot) {
      laserBeam.visible = false;
      laserHitDot.visible = false;
      currentLaserHitPoint = null;
      clearInfoCard();
      return;
    }

    const origin = camera.position.clone();
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    raycaster.set(origin, direction.normalize());
    raycaster.far = 220;

    const intersections = raycaster
      .intersectObject(currentRoot, true)
      .filter((hit) => !(hit.object.userData && hit.object.userData.viewerHelper));

    const hit = intersections[0];
    const beamEnd = hit ? hit.point.clone() : origin.clone().add(direction.multiplyScalar(120));
    const positions = (laserBeam.geometry as THREE.BufferGeometry).getAttribute("position");
    positions.setXYZ(0, origin.x, origin.y, origin.z);
    positions.setXYZ(1, beamEnd.x, beamEnd.y, beamEnd.z);
    positions.needsUpdate = true;
    laserBeam.visible = true;

    if (!hit) {
      laserHitDot.visible = false;
      currentLaserHitPoint = null;
      clearInfoCard();
      return;
    }

    currentLaserHitPoint = hit.point.clone();
    laserHitDot.visible = true;
    laserHitDot.position.copy(hit.point);

    // Check if clicked on a floating lane
    if (hit.object.userData.isFloatingLane && typeof hit.object.userData.bandIndex === "number") {
      selectFloatingLane(hit.object.userData.bandIndex);
      const bandKind = hit.object.userData.bandKind || "unknown";
      const bandLabel = LANE_LABELS[bandKind] || bandKind;
      setInfoCardContent(`<div class="hit-descriptor"><strong>${bandLabel}</strong><br>Click again to deselect</div>`);
      return;
    }

    const descriptor = resolveHitDescriptor(hit.object, hit.point.clone());
    if (!descriptor) {
      clearInfoCard();
      return;
    }
    const content = buildHitDescriptorContent(descriptor, currentManifest ?? undefined);
    currentLaserCopyText = content.text;
    setInfoCardContent(content.html);
  }

  async function loadScene(option: SceneOption): Promise<void> {
    clearError(errorEl);
    setStatus(`Loading ${option.label}…`);
    if (controls.isLocked) {
      controls.unlock();
    }

    if (currentRoot) {
      scene.remove(currentRoot);
      disposeObject(currentRoot);
      currentRoot = null;
    }
    // Clear existing frame helpers and asset bbox helpers
    scene.traverse((child) => {
      if (child.userData.isFrameHelper || child.userData.isAssetBboxHelper) {
        scene.remove(child);
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
    });

    applyAudioProfile();

    clearInfoCard();
    currentLaserHitPoint = null;
    laserHitDot.visible = false;
    laserBeam.visible = false;

    const gltf = await loader.loadAsync(option.glbUrl);
    currentRoot = gltf.scene;
    configureSceneObjectShadows(currentRoot);
    scene.add(currentRoot);

    // Create bounding box helpers for top-level children (assets)
    if (frameModeToggleEl.checked && currentRoot) {
      currentRoot.children.forEach((child, index) => {
        const bbox = new THREE.Box3().setFromObject(child);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        // Only show frames for objects with meaningful size
        if (size.length() > 0.1) {
          const helper = new THREE.BoxHelper(child, 0x00ff00);
          helper.userData.isFrameHelper = true;
          helper.visible = true;
          scene.add(helper);
        }
      });
    }

    // Create per-asset bounding box helpers with asset_id labels
    if (assetBboxToggleEl.checked && currentRoot) {
      const instances = currentManifest?.instances;
      currentRoot.traverse((child) => {
        if (!child.name) return;
        const instanceId = resolveInstanceIdFromName(child.name);
        if (!instanceId) return;

        const instanceInfo = instances?.[instanceId];
        const category = instanceInfo?.category?.trim().toLowerCase() ?? "";
        const assetId = instanceInfo?.asset_id?.trim() ?? instanceId;
        const color = CATEGORY_BBOX_COLORS[category] ?? 0x38bdf8;

        const bbox = new THREE.Box3().setFromObject(child);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        if (size.length() > 0.01) {
          const helper = new THREE.BoxHelper(child, color);
          helper.userData.isAssetBboxHelper = true;
          helper.userData.assetInstanceId = instanceId;
          helper.userData.assetCategory = category;
          helper.visible = true;
          scene.add(helper);

          // Add text label showing asset_id above the bounding box
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          const label = createTextSprite(assetId, color);
          label.position.set(center.x, bbox.max.y + 0.5, center.z);
          label.userData.isAssetLabel = true;
          scene.add(label);
        }
      });
    }

    const bbox = new THREE.Box3().setFromObject(currentRoot);
    const spawn = inferSpawnFromBbox(bbox, currentManifest ?? {
      layout_path: "",
      final_scene: { label: "Final Scene", glb_url: option.glbUrl },
      production_steps: [],
      default_selection: "final_scene",
    });
    currentSpawn = spawn.position;
    currentForward = spawn.forward;
    updateMinimapCamera(sceneBoundsFromManifest(bbox, currentManifest), bbox);
    resetView();
    const params = currentManifest?.lighting_params;
    if (params) {
      lightingState.preset = currentManifest?.lighting_preset || "custom";
      lightingState.exposure = params.exposure as number;
      lightingState.keyLightIntensity = params.keyLightIntensity as number;
      lightingState.fillLightIntensity = params.fillLightIntensity as number;
      lightingState.warmth = params.warmth as number;
      lightingState.shadowStrength = params.shadowStrength as number;
    } else {
      const presetKey = currentManifest?.lighting_preset;
      if (presetKey && LIGHTING_PRESETS[presetKey]) {
        lightingState.preset = presetKey;
        Object.assign(lightingState, LIGHTING_PRESETS[presetKey]);
      }
    }
    syncLightingUi();
    setStatus(`Viewing ${option.label}`);

    // 清除 manifest 缓存，确保 History Analysis 重新加载最新数据
    clearManifestCache();
  }

  function populateRecentLayoutOptions(layouts: RecentLayout[], selectedPath: string): void {
    recentLayoutsByPath.clear();
    layoutSelectEl.innerHTML = "";
    for (const layout of layouts) {
      recentLayoutsByPath.set(layout.layout_path, layout);
      const optionEl = document.createElement("option");
      optionEl.value = layout.layout_path;
      optionEl.textContent = compactUiLabel(layout.label);
      optionEl.title = layout.label;
      layoutSelectEl.appendChild(optionEl);
    }
    if (selectedPath && !recentLayoutsByPath.has(selectedPath)) {
      const optionEl = document.createElement("option");
      optionEl.value = selectedPath;
      const directLabel = makeDirectLayoutLabel(selectedPath);
      optionEl.textContent = compactUiLabel(directLabel);
      optionEl.title = directLabel;
      layoutSelectEl.appendChild(optionEl);
    }
    layoutSelectEl.disabled = layoutSelectEl.options.length === 0;
    if (selectedPath) {
      layoutSelectEl.value = selectedPath;
      const selectedLayout = recentLayoutsByPath.get(selectedPath);
      layoutSelectEl.title = selectedLayout?.label ?? makeDirectLayoutLabel(selectedPath);
    }
  }

  function populateDesignPresets(): void {
    designPresetEl.innerHTML = "";
    
    // Add custom/LLM-driven option first
    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "Custom / LLM-Driven（自定义）";
    designPresetEl.appendChild(customOption);
    
    // Add all presets
    for (const preset of VIEWER_DESIGN_PRESETS) {
      const optionEl = document.createElement("option");
      optionEl.value = preset.id;
      optionEl.textContent = `${preset.nameEn} / ${preset.name}`;
      optionEl.title = preset.description;
      designPresetEl.appendChild(optionEl);
    }
    
    // Default to custom (LLM-driven)
    designPresetEl.value = "__custom__";
  }

  function selectedDesignPreset(): DesignPreset | null {
    const selectedId = designPresetEl.value;
    if (selectedId === "__custom__") {
      return null; // No preset, let LLM drive
    }
    return VIEWER_DESIGN_PRESETS.find((preset) => preset.id === selectedId) ?? null;
  }

  function updateDesignStatus(message: string, tone: "neutral" | "success" | "warning" | "error" = "neutral"): void {
    designStatusEl.textContent = message;
    designStatusEl.dataset.tone = tone;
    shell.pushActivity(message, tone);
    shell.setStatusSummary(message);
  }

  function configForDesignVariant(
    configPatch: Record<string, string | number>,
    variant: DesignSchemeVariant,
  ): Record<string, string | number> {
    const density = Number(configPatch.density ?? 0.6);
    const roadWidth = Number(configPatch.road_width_m ?? 13.5);
    return {
      ...configPatch,
      density: Math.max(0.1, Math.min(1.5, density * variant.densityMod)),
      road_width_m: Math.max(5.0, Math.min(30.0, roadWidth * variant.widthMod)),
    };
  }

  function renderGeneratedDesignSchemes(schemes: GeneratedDesignScheme[]): void {
    if (schemes.length === 0) {
      designResultEl.innerHTML = "";
      return;
    }
    designResultEl.innerHTML = `
      <div class="viewer-design-schemes">
        ${schemes.map((scheme) => `
          <button
            class="viewer-design-scheme"
            type="button"
            data-layout-path="${escapeHtml(scheme.layoutPath)}"
            ${scheme.status === "failed" ? "disabled" : ""}
          >
            <span>
              <strong>${escapeHtml(scheme.name)}</strong>
              <small>${scheme.status === "ready" ? escapeHtml(scheme.layoutPath) : escapeHtml(scheme.error || "Generation failed")}</small>
            </span>
            <em>${scheme.status === "ready" ? "Load" : "Failed"}</em>
          </button>
        `).join("")}
      </div>
    `;
  }

  async function submitDesignJob(
    preset: DesignPreset | null,
    prompt: string,
    graphTemplateId: string,
    variant: DesignSchemeVariant,
  ): Promise<SceneJobCreatePayload> {
    // If no preset selected (Custom/LLM-Driven), pass empty configPatch
    // so backend will call LLM to derive all parameters
    const configPatch = preset ? configForDesignVariant(preset.configPatch, variant) : {};
    return postApiJson<SceneJobCreatePayload>("/api/scene/jobs", {
      draft: {
        normalized_scene_query: prompt,
        compose_config_patch: configPatch,
        citations_by_field: {},
        design_summary: prompt,
        risk_notes: [],
        parameter_sources_by_field: {},
      },
      scene_context: {
        layout_mode: "graph_template",
        aoi_bbox: null,
        city_name_en: null,
        reference_plan_id: null,
        graph_template_id: graphTemplateId,
      },
      patch_overrides: {},
      generation_options: {
        preset_id: preset?.id ?? "custom",
        random_seed: variant.seed,
      },
    });
  }

  const GENERATION_STEPS: GenerationStep[] = [
    {
      key: "queued",
      label: "任务排队中",
      shortLabel: "排队",
      progress: 5,
      purpose: "任务已经进入后端 job service。当前后端是单 worker 流程，通常不会真正长时间排队。",
      detailHint: "这里记录 job id、提交时间和即将使用的 preset/template。",
    },
    {
      key: "context_resolving",
      label: "上下文解析",
      shortLabel: "上下文",
      progress: 15,
      purpose: "把 prompt、preset、graph template 或外部道路上下文合并成可生成的 StreetComposeConfig。",
      detailHint: "重点看 layout_mode、graph_template_id/reference_plan_id，以及本次方案改动的需求等级和规则 profile。",
    },
    {
      key: "asset_loading",
      label: "资产加载",
      shortLabel: "资产",
      progress: 25,
      purpose: "加载对象 manifest、建筑资产、地面材质、天空环境和检索索引。",
      detailHint: "后端会回传 object_asset_count、building_asset_count 等数量，用来判断素材池是否足够。",
    },
    {
      key: "layout_generation",
      label: "布局生成",
      shortLabel: "布局",
      progress: 40,
      purpose: "把道路图和设计目标转成主题分段、街道断面 program 与候选布局方案。",
      detailHint: "这里能看到 theme_segment_count、道路宽度、密度、行人/自行车/公交/车流需求等参数。",
    },
    {
      key: "constraint_solving",
      label: "约束求解",
      shortLabel: "约束",
      progress: 50,
      purpose: "使用 design_rule_profile 和布局 solver 检查断面、设施带、间距、可通行空间等约束。",
      detailHint: "它不是 LLM 评价，而是规则/求解器层面对空间参数的约束计算。",
    },
    {
      key: "asset_composition",
      label: "资产组合",
      shortLabel: "组合",
      progress: 65,
      purpose: "把求解得到的 slot plan 转成具体资产摆放：树、灯、座椅、站亭、建筑等都在这里落位。",
      detailHint: "重点看 total_slots、placed_slots、placement_count；它回答“放了多少，放到哪里”。",
    },
    {
      key: "mesh_generation",
      label: "网格生成",
      shortLabel: "网格",
      progress: 75,
      purpose: "生成或组装 Three.js 可导出的几何网格，包括道路表面、建筑体块和资产实例。",
      detailHint: "这里的 mesh 不是 LLM 直接生成，而是由布局、资产和几何函数组合出来的 3D 数据。",
    },
    {
      key: "glb_export",
      label: "GLB 导出",
      shortLabel: "导出",
      progress: 88,
      purpose: "把场景几何序列化为 GLB/PLY 文件，供 Viewer 直接加载。",
      detailHint: "这是文件导出步骤；如果 export_format 是 glb，就会产出最终 3D 模型文件。",
    },
    {
      key: "scene_rendering",
      label: "场景渲染",
      shortLabel: "渲染",
      progress: 95,
      purpose: "在导出 GLB 后生成 presentation views、top-down 图和 production steps，供评估和对比页面使用。",
      detailHint: "所以导出后仍需要渲染：Viewer 加载 3D，评价/报告还需要 2D 视图和过程图。",
    },
    {
      key: "finalizing",
      label: "结果整理",
      shortLabel: "整理",
      progress: 99,
      purpose: "写入 scene_layout.json、summary、metrics、render paths 和最终加载入口。",
      detailHint: "这是必要步骤；Viewer 实际加载的是 layout manifest，而不是只加载一个裸 GLB。",
    },
  ];

  function getStepIndex(stage: string): number {
    return GENERATION_STEPS.findIndex((step) => step.key === stage);
  }

  function stepForStage(stage: string): GenerationStep {
    return GENERATION_STEPS.find((step) => step.key === stage) ?? GENERATION_STEPS[0]!;
  }

  function isOperationObject(
    operation: SceneJobOperation,
  ): operation is {
    name?: string;
    status?: string;
    message?: string;
    stage?: string;
    progress?: number;
    detail?: Record<string, unknown>;
    timestamp?: string;
  } {
    return typeof operation === "object" && operation !== null;
  }

  function latestOperationForStage(payload: SceneJobStatusPayload, stage: string): {
    message?: string;
    progress?: number;
    detail?: Record<string, unknown>;
  } | null {
    const operations = payload.operations ?? [];
    for (let index = operations.length - 1; index >= 0; index -= 1) {
      const operation = operations[index];
      if (!isOperationObject(operation)) continue;
      if (operation.stage === stage) {
        return {
          message: operation.message || operation.name || operation.status,
          progress: operation.progress,
          detail: operation.detail,
        };
      }
    }
    return null;
  }

  function formatDesignDetailKey(key: string): string {
    const labels: Record<string, string> = {
      graph_template_id: "图模板",
      reference_plan_id: "参考方案",
      layout_mode: "布局模式",
      object_asset_count: "对象资产",
      building_asset_count: "建筑资产",
      theme_segment_count: "主题分段",
      total_slots: "资产槽位",
      placed_slots: "已放置槽位",
      placement_count: "最终放置",
      export_format: "导出格式",
      production_step_count: "过程产物",
      layout_path: "布局文件",
      error: "错误",
    };
    return labels[key] ?? key.replace(/_/g, " ");
  }

  function formatDesignDetailValue(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map((item) => formatDesignDetailValue(item)).join(", ");
    }
    if (value && typeof value === "object") {
      return JSON.stringify(value);
    }
    if (value === null || value === undefined || value === "") {
      return "未提供";
    }
    return String(value);
  }

  function renderDesignDetailList(detail: Record<string, unknown> | undefined, limit = 6): string {
    const entries = Object.entries(detail ?? {}).filter(([, value]) => value !== undefined && value !== "");
    if (entries.length === 0) {
      return `<div class="viewer-design-workspace-muted">等待后端返回该阶段的具体数据。</div>`;
    }
    return `
      <dl class="viewer-design-detail-list">
        ${entries.slice(0, limit).map(([key, value]) => `
          <div>
            <dt>${escapeHtml(formatDesignDetailKey(key))}</dt>
            <dd>${escapeHtml(formatDesignDetailValue(value))}</dd>
          </div>
        `).join("")}
      </dl>
    `;
  }

  function isCoreDiagnosticStage(stage: string): boolean {
    return stage === "context_resolving" || stage === "layout_generation" || stage === "constraint_solving" || stage === "asset_composition";
  }

  function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  function asRecords(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  }

  function renderDiagnosticKeyValues(record: Record<string, unknown>, limit = 24): string {
    const entries = Object.entries(record).filter(([, value]) => value !== undefined && value !== "");
    if (entries.length === 0) return `<div class="viewer-design-workspace-muted">暂无数据。</div>`;
    return `
      <dl class="viewer-design-diagnostic-kv">
        ${entries.slice(0, limit).map(([key, value]) => `
          <div>
            <dt>${escapeHtml(formatDesignDetailKey(key))}</dt>
            <dd>${escapeHtml(formatDesignDetailValue(value))}</dd>
          </div>
        `).join("")}
      </dl>
    `;
  }

  function renderDiagnosticTable(
    rows: Array<Record<string, unknown>>,
    columns: Array<[string, string]>,
    emptyText = "暂无记录。",
  ): string {
    if (rows.length === 0) return `<div class="viewer-design-workspace-muted">${escapeHtml(emptyText)}</div>`;
    return `
      <div class="viewer-design-diagnostic-table-wrap">
        <table class="viewer-design-diagnostic-table">
          <thead>
            <tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                ${columns.map(([key]) => `<td>${escapeHtml(formatDesignDetailValue(row[key]))}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDiagnosticSection(title: string, body: string): string {
    return `
      <section class="viewer-design-diagnostic-section">
        <h4>${escapeHtml(title)}</h4>
        ${body}
      </section>
    `;
  }

  function renderLayoutDiagnostic(detail: Record<string, unknown>): string {
    const streetProgram = asRecord(detail.street_program);
    return [
      renderDiagnosticSection("算法与输入", renderDiagnosticKeyValues({
        ...asRecord(detail.algorithm),
        ...asRecord(detail.config_parameters),
      })),
      renderDiagnosticSection(
        "主题分段",
        renderDiagnosticTable(asRecords(detail.theme_segments), [
          ["theme_id", "ID"],
          ["theme_name", "主题"],
          ["x_start_m", "起点 m"],
          ["x_end_m", "终点 m"],
          ["length_m", "长度 m"],
          ["dominant_poi_types", "主导 POI"],
          ["design_rule_profile", "规则"],
        ]),
      ),
      renderDiagnosticSection("生成的街道 Program", renderDiagnosticKeyValues({
        cross_section_type: streetProgram.cross_section_type,
        lane_count: streetProgram.lane_count,
        road_width_m: streetProgram.road_width_m,
        sidewalk_width_m: streetProgram.sidewalk_width_m,
        row_width_m: streetProgram.row_width_m,
        width_expanded: streetProgram.width_expanded,
        width_reallocation_reason: streetProgram.width_reallocation_reason,
        poi_fit_feasible: streetProgram.poi_fit_feasible,
        furniture_requirements: streetProgram.furniture_requirements,
        throughput_requirements: streetProgram.throughput_requirements,
        design_goals: streetProgram.design_goals,
      })),
      renderDiagnosticSection(
        "断面功能带",
        renderDiagnosticTable(asRecords(streetProgram.bands), [
          ["name", "名称"],
          ["kind", "类型"],
          ["side", "侧向"],
          ["width_m", "宽度 m"],
          ["z_center_m", "中心 z"],
          ["allowed_categories", "允许资产"],
        ]),
      ),
    ].join("");
  }

  function renderConstraintDiagnostic(detail: Record<string, unknown>): string {
    const solver = asRecord(detail.solver_summary);
    return [
      renderDiagnosticSection("Solver 与规则", renderDiagnosticKeyValues({
        ...asRecord(solver.algorithm),
        active_constraints: solver.active_constraints,
        rule_evaluation_counts: solver.rule_evaluation_counts,
      })),
      renderDiagnosticSection("求解结果指标", renderDiagnosticKeyValues(asRecord(solver.metrics))),
      renderDiagnosticSection(
        "功能带求解结果",
        renderDiagnosticTable(asRecords(solver.band_solutions), [
          ["band_name", "功能带"],
          ["band_kind", "类型"],
          ["side", "侧向"],
          ["width_m", "宽度"],
          ["min_width_m", "最小"],
          ["max_width_m", "最大"],
          ["slack_m", "余量"],
          ["active_constraint_names", "约束"],
        ]),
      ),
      renderDiagnosticSection(
        "被拦截/未满足的规则",
        renderDiagnosticTable(asRecords(solver.flagged_rule_evaluations), [
          ["rule_name", "规则"],
          ["status", "状态"],
          ["mode", "模式"],
          ["score", "分数"],
          ["explanation", "说明"],
        ], "没有发现失败规则。"),
      ),
      renderDiagnosticSection(
        "求解器修改与冲突",
        `${renderDiagnosticTable(asRecords(solver.edits), [
          ["action", "动作"],
          ["target", "目标"],
          ["before", "之前"],
          ["after", "之后"],
          ["reason", "原因"],
        ], "没有 solver edit。")}
        ${renderDiagnosticTable(asRecords(solver.conflicts), [
          ["rule_name", "规则"],
          ["severity", "严重性"],
          ["affected_target", "对象"],
          ["message", "说明"],
        ], "没有 unresolved conflict。")}`,
      ),
      renderDiagnosticSection("Slot Plan 汇总", renderDiagnosticKeyValues(asRecord(solver.slot_plan_summary))),
      renderDiagnosticSection(
        "分主题方案",
        renderDiagnosticTable(asRecords(solver.zone_programs), [
          ["theme_id", "主题 ID"],
          ["theme_name", "主题"],
          ["design_rule_profile", "规则"],
          ["cross_section_type", "断面"],
          ["slot_count", "slot"],
          ["backend_used", "Program"],
          ["solver_backend_used", "Solver"],
        ]),
      ),
    ].join("");
  }

  function renderCompositionDiagnostic(detail: Record<string, unknown>): string {
    const blockerSummary = asRecord(detail.blocker_summary);
    return [
      renderDiagnosticSection("资产落位算法", renderDiagnosticKeyValues(asRecord(detail.algorithm))),
      renderDiagnosticSection("Slot 与落位进度", renderDiagnosticKeyValues({
        ...asRecord(detail.slot_plan_summary),
        ...asRecord(detail.placement_progress),
        category_slot_counts: detail.category_slot_counts,
      })),
      renderDiagnosticSection("拦截器结果", renderDiagnosticKeyValues({
        blocked_reason_counts: blockerSummary.blocked_reason_counts,
        search_tier_counts: blockerSummary.search_tier_counts,
        category_status_counts: blockerSummary.category_status_counts,
      })),
      renderDiagnosticSection(
        "未落位样例",
        renderDiagnosticTable(asRecords(blockerSummary.unplaced_samples), [
          ["slot_id", "Slot"],
          ["category", "类别"],
          ["theme_id", "主题"],
          ["side", "侧向"],
          ["band_name", "功能带"],
          ["failure_reason", "拦截原因"],
          ["blocked_reason_counts", "过滤统计"],
        ], "当前没有未落位样例。"),
      ),
      renderDiagnosticSection("锚点与平衡修复", renderDiagnosticKeyValues({
        anchor_resolution_summary: detail.anchor_resolution_summary,
        balance_repair_summary: detail.balance_repair_summary,
        composition_pass_report: detail.composition_pass_report,
      })),
    ].join("");
  }

  function renderContextResolvingDiagnostic(detail: Record<string, unknown>): string {
    // Backend actually passes simple fields like reference_plan_id, graph_template_id, layout_mode etc.
    // from _emit_progress calls in design_runtime.py
    const layoutMode = String(detail.layout_mode || detail.layoutMode || "graph_template");
    
    return [
      renderDiagnosticSection("阶段说明", renderDiagnosticKeyValues({
        stage: "context_resolving",
        message: detail.message || "解析设计意图和构建场景上下文",
        layout_mode: layoutMode,
      })),
      renderDiagnosticSection("图模板 / 参考方案", renderDiagnosticKeyValues({
        graph_template_id: detail.graph_template_id || detail.graphTemplateId || "hkust_gz_gate",
        reference_plan_id: detail.reference_plan_id || detail.referencePlanId,
      })),
      renderDiagnosticSection("设计意图", renderDiagnosticKeyValues({
        normalized_scene_query: detail.normalized_scene_query || detail.sceneQuery || detail.scene_query,
        design_summary: detail.design_summary || detail.designSummary,
        target_street_type: detail.target_street_type || detail.targetStreetType,
        objective_profile: detail.objective_profile || detail.objectiveProfile,
        design_rule_profile: detail.design_rule_profile || detail.designRuleProfile,
      })),
      renderDiagnosticSection("需求参数", renderDiagnosticKeyValues({
        density: detail.density,
        ped_demand_level: detail.ped_demand_level || detail.pedDemandLevel,
        bike_demand_level: detail.bike_demand_level || detail.bikeDemandLevel,
        transit_demand_level: detail.transit_demand_level || detail.transitDemandLevel,
        vehicle_demand_level: detail.vehicle_demand_level || detail.vehicleDemandLevel,
        road_width_m: detail.road_width_m || detail.roadWidthM,
        length_m: detail.length_m || detail.lengthM,
        lane_count: detail.lane_count || detail.laneCount,
        sidewalk_width_m: detail.sidewalk_width_m || detail.sidewalkWidthM,
      })),
      renderDiagnosticSection("配置补丁", renderDiagnosticKeyValues(asRecord(detail.config_patch || detail.configPatch || detail.compose_config_patch || detail.composeConfigPatch), 20)),
      renderDiagnosticSection("RAG 引用证据", (() => {
        const citationsField = detail.citations_by_field || detail.citationsByField;
        const citationsRecord = asRecord(citationsField);
        const citationKeys = Object.keys(citationsRecord);
        const totalCitations = citationKeys.reduce((sum, key) => {
          const value = citationsRecord[key];
          if (Array.isArray(value)) return sum + value.length;
          if (typeof value === "string" && value) return sum + 1;
          return sum;
        }, 0);
        
        const knowledgeSource = String(detail.knowledge_source || detail.knowledgeSource || "graph_rag");
        const evidenceCount = Number(detail.evidence_count || detail.evidenceCount || totalCitations);
        
        if (evidenceCount === 0) {
          return renderDiagnosticKeyValues({
            citations_count: 0,
            knowledge_source: knowledgeSource,
            status: "RAG 检索未返回结果或已禁用",
          });
        }
        
        // Build citation details
        const citationDetails = citationKeys.map((key) => {
          const value = citationsRecord[key];
          const count = Array.isArray(value) ? value.length : (value ? 1 : 0);
          return `${key}: ${count} 条引用`;
        }).join("\n");
        
        return renderDiagnosticKeyValues({
          citations_count: evidenceCount,
          knowledge_source: knowledgeSource,
          status: evidenceCount > 0 ? "✅ RAG 检索成功" : "❌ 无引用",
          citation_details: citationDetails || "无详细引用",
        });
      })()),
    ].join("");
  }

  function renderStageDiagnosticContent(stage: string, detail: Record<string, unknown>): string {
    if (stage === "context_resolving") return renderContextResolvingDiagnostic(detail);
    if (stage === "layout_generation") return renderLayoutDiagnostic(detail);
    if (stage === "constraint_solving") return renderConstraintDiagnostic(detail);
    if (stage === "asset_composition") return renderCompositionDiagnostic(detail);
    return renderDiagnosticSection("Detail", renderDiagnosticKeyValues(detail, 80));
  }

  function openDesignStageDiagnostic(stage: string): void {
    const snapshot = lastDesignRunSnapshot;
    if (!snapshot) return;
    const step = stepForStage(stage);
    const operation = latestOperationForStage(snapshot.payload, stage);
    const detail = operation?.detail ?? {};
    const modal = document.createElement("div");
    modal.className = "viewer-design-diagnostic-modal";
    modal.innerHTML = `
      <div class="viewer-design-diagnostic-backdrop" data-design-modal-close="true"></div>
      <article class="viewer-design-diagnostic-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(step.label)} algorithm detail">
        <header class="viewer-design-diagnostic-header">
          <div>
            <span>${escapeHtml(step.shortLabel)}</span>
            <h3>${escapeHtml(step.label)} · 算法详情</h3>
            <p>${escapeHtml(operation?.message || step.detailHint)}</p>
          </div>
          <button class="viewer-settings-close" type="button" data-design-modal-close="true" aria-label="Close diagnostic">x</button>
        </header>
        <div class="viewer-design-diagnostic-body">
          ${renderStageDiagnosticContent(stage, detail)}
        </div>
      </article>
    `;
    designWorkspaceEl.appendChild(modal);
  }

  function closeDesignStageDiagnostic(): void {
    designWorkspaceEl.querySelector(".viewer-design-diagnostic-modal")?.remove();
  }

  function renderDesignImprovementSummary(
    preset: DesignPreset | null,
    variant: DesignSchemeVariant,
    prompt: string,
    graphTemplateId: string,
  ): string {
    const configPatch = preset?.configPatch ?? {};
    const config = configForDesignVariant(configPatch, variant);
    const presetLabel = preset ? `${preset.nameEn} / ${preset.name}` : "Custom / LLM-Driven";
    
    const items = [
      ["预设", presetLabel],
      preset ? ["设计规则", config.design_rule_profile] : null,
      preset ? ["目标 profile", config.objective_profile] : null,
      preset ? ["密度", config.density] : ["密度", "LLM 自动推导"],
      preset ? ["道路宽度", config.road_width_m ? `${config.road_width_m} m` : undefined] : ["道路宽度", "LLM 自动推导"],
      preset ? ["行人需求", config.ped_demand_level] : ["行人需求", "LLM 自动推导"],
      preset ? ["自行车需求", config.bike_demand_level] : ["自行车需求", "LLM 自动推导"],
      preset ? ["公交需求", config.transit_demand_level] : ["公交需求", "LLM 自动推导"],
      preset ? ["车流需求", config.vehicle_demand_level] : ["车流需求", "LLM 自动推导"],
      ["图模板", graphTemplateId],
      ["随机种子", variant.seed],
    ].filter((item): item is [string, string | number] => item !== null && item[1] !== undefined && item[1] !== "");
    
    return `
      <section class="viewer-design-workspace-panel">
        <div class="viewer-design-workspace-panel-title">本次方案实际改了什么</div>
        <p class="viewer-design-workspace-copy">${escapeHtml(prompt)}</p>
        <div class="viewer-design-improvement-grid">
          ${items.map(([label, value]) => `
            <div class="viewer-design-improvement-item">
              <span>${escapeHtml(String(label))}</span>
              <strong>${escapeHtml(formatDesignDetailValue(value))}</strong>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderDesignStageTree(payload: SceneJobStatusPayload, currentStage: string, failed: boolean): void {
    const currentIndex = Math.max(0, getStepIndex(currentStage));
    
    // Prepare stage nodes data for G6
    const stageNodes: StageNode[] = GENERATION_STEPS.map((step, index) => {
      const operation = latestOperationForStage(payload, step.key);
      const state =
        failed && index === currentIndex
          ? "failed"
          : index < currentIndex || step.key === "succeeded"
            ? "completed"
            : index === currentIndex
              ? "active"
              : "pending";
      const percent = typeof operation?.progress === "number" ? operation.progress : step.progress;
      
      return {
        id: step.key,
        label: `${step.label} · ${Math.round(percent)}%`,
        status: state,
        progress: percent,
        stepNumber: index + 1,
      };
    });

    // Destroy previous G6 graph if exists
    if (g6StageGraph) {
      g6StageGraph.destroy();
      g6StageGraph = null;
    }

    // Create container for G6
    const containerId = "viewer-g6-stage-tree";
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      container.style.width = "100%";
      container.style.height = "500px";
      container.style.background = "#fafbfc";
      container.style.borderRadius = "8px";
      container.style.border = "1px solid #e2e8f0";
      
      // Insert before stage cards
      const stageCards = designWorkspaceEl.querySelector(".viewer-design-stage-cards");
      if (stageCards && stageCards.parentNode) {
        stageCards.parentNode.insertBefore(container, stageCards);
      } else {
        designWorkspaceEl.appendChild(container);
      }
    }

    // Render G6 tree
    g6StageGraph = renderG6StageTree(`#${containerId}`, stageNodes, (nodeId) => {
      openDesignStageDiagnostic(nodeId);
    });
  }

  function renderDesignStageCards(payload: SceneJobStatusPayload, currentStage: string, failed: boolean): string {
    const currentIndex = Math.max(0, getStepIndex(currentStage));
    return `
      <div class="viewer-design-stage-grid">
        ${GENERATION_STEPS.map((step, index) => {
          const operation = latestOperationForStage(payload, step.key);
          const state =
            failed && index === currentIndex
              ? "failed"
              : index < currentIndex || step.key === "succeeded"
                ? "completed"
                : index === currentIndex
                  ? "active"
                  : "pending";
          const percent = typeof operation?.progress === "number" ? operation.progress : step.progress;
          return `
            <article class="viewer-design-stage-card" data-state="${state}">
              <div class="viewer-design-stage-head">
                <span>${escapeHtml(step.shortLabel)}</span>
                <strong>${escapeHtml(step.label)}</strong>
                <em>${Math.round(percent)}%</em>
              </div>
              <p>${escapeHtml(step.purpose)}</p>
              <div class="viewer-design-stage-hint">${escapeHtml(operation?.message || step.detailHint)}</div>
              ${renderDesignDetailList(operation?.detail, state === "active" ? 8 : 3)}
              ${isCoreDiagnosticStage(step.key) ? `
                <button class="viewer-design-stage-detail-button" type="button" data-design-stage-detail="${escapeHtml(step.key)}">
                  查看算法详情
                </button>
              ` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderDesignWorkspace(
    payload: SceneJobStatusPayload,
    preset: DesignPreset | null,
    variant: DesignSchemeVariant,
    prompt: string,
    graphTemplateId: string,
  ): void {
    lastDesignRunSnapshot = { payload, preset, variant, prompt, graphTemplateId };
    designReviewRunEl.disabled = false;
    const { progress, message, stage } = describeDesignJobProgress(payload);
    const failed = payload.status === "failed";
    const step = stepForStage(stage);
    const presetLabel = preset ? `${preset.nameEn}` : "Custom";
    designWorkspaceEl.hidden = false;
    minimapEl.hidden = true; // Hide minimap when design workspace is visible
    designWorkspaceEl.innerHTML = `
      <div class="viewer-design-workspace-shell">
        <header class="viewer-design-workspace-header">
          <div>
            <span class="viewer-design-workspace-kicker">${escapeHtml(variant.name)} · ${escapeHtml(presetLabel)}</span>
            <h2>Design Run</h2>
            <p>${escapeHtml(message)}</p>
          </div>
          <div class="viewer-design-workspace-progress">
            <strong>${Math.round(clamp(progress, 0, 100))}%</strong>
            <span>${escapeHtml(step.label)}</span>
          </div>
        </header>
        <div class="viewer-design-workspace-progressbar" aria-label="Generation progress">
          <div style="width:${clamp(progress, 0, 100)}%"></div>
        </div>
        <div class="viewer-design-workspace-layout">
          ${renderDesignImprovementSummary(preset, variant, prompt, graphTemplateId)}
          <section class="viewer-design-workspace-panel">
            <div class="viewer-design-workspace-panel-title">场景生长树</div>
            <div id="viewer-g6-stage-tree"></div>
          </section>
          <section class="viewer-design-workspace-panel">
            <div class="viewer-design-workspace-panel-title">当前阶段在做什么</div>
            <h3>${escapeHtml(step.label)}</h3>
            <p class="viewer-design-workspace-copy">${escapeHtml(step.purpose)}</p>
            <div class="viewer-design-stage-hint">${escapeHtml(step.detailHint)}</div>
            ${renderDesignDetailList(latestOperationForStage(payload, stage)?.detail, 10)}
          </section>
        </div>
        ${renderDesignStageCards(payload, stage, failed)}
      </div>
    `;
    
    // Render G6 stage tree after DOM is updated
    requestAnimationFrame(() => {
      renderDesignStageTree(payload, stage, failed);
    });
  }

  function hideDesignWorkspace(): void {
    designWorkspaceEl.hidden = true;
    minimapEl.hidden = false; // Show minimap when design workspace is hidden
    designWorkspaceEl.innerHTML = "";
  }

  function reviewLastDesignRun(): void {
    if (!lastDesignRunSnapshot) return;
    renderDesignWorkspace(
      lastDesignRunSnapshot.payload,
      lastDesignRunSnapshot.preset,
      lastDesignRunSnapshot.variant,
      lastDesignRunSnapshot.prompt,
      lastDesignRunSnapshot.graphTemplateId,
    );
    flashStatus("Design generation steps reopened.");
  }

  function branchNodes(payload: BranchRunStatusPayload): BranchRunNode[] {
    return [...(payload.nodes ?? [])].sort((a, b) => a.depth - b.depth || b.score! - a.score! || a.rank - b.rank);
  }

  function selectedBranchNode(payload: BranchRunStatusPayload): BranchRunNode | null {
    const nodes = branchNodes(payload);
    if (selectedBranchNodeId) {
      const selected = nodes.find((node) => node.node_id === selectedBranchNodeId);
      if (selected) return selected;
    }
    if (payload.best_node_id) {
      const best = nodes.find((node) => node.node_id === payload.best_node_id);
      if (best) return best;
    }
    return nodes[0] ?? null;
  }

  function formatBranchScore(value: unknown): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
    return `${Math.round(value)}`;
  }

  function renderBranchTree(payload: BranchRunStatusPayload, selectedId: string | null): string {
    const nodes = branchNodes(payload);
    if (nodes.length === 0) return `<div class="viewer-design-workspace-muted">等待分支节点生成。</div>`;
    const bestId = payload.best_node_id ?? "";
    return `
      <div class="viewer-branch-tree">
        ${nodes.map((node) => `
          <button
            class="viewer-branch-node"
            data-branch-node="${escapeHtml(node.node_id)}"
            data-depth="${escapeHtml(String(node.depth))}"
            data-status="${escapeHtml(node.status)}"
            data-selected="${node.node_id === selectedId ? "true" : "false"}"
            type="button"
          >
            <span>D${node.depth} · #${node.rank}</span>
            <strong>${escapeHtml(node.node_id)}${node.node_id === bestId ? " · Best" : ""}</strong>
            <small>${escapeHtml(node.status)} · score ${escapeHtml(formatBranchScore(node.score))}</small>
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderBranchScatter(payload: BranchRunStatusPayload, selectedId: string | null): string {
    const points = payload.scatter_points ?? [];
    if (points.length === 0) {
      return `<div class="viewer-design-workspace-muted">等待评价结果生成散点图。</div>`;
    }
    const plotWidth = 540;
    const plotHeight = 320;
    const padding = 34;
    const scaleX = (value: number | null | undefined) => padding + (clamp(Number(value ?? 0), 0, 100) / 100) * (plotWidth - padding * 2);
    const scaleY = (value: number | null | undefined) => plotHeight - padding - (clamp(Number(value ?? 0), 0, 100) / 100) * (plotHeight - padding * 2);
    return `
      <div class="viewer-branch-scatter-wrap">
        <svg class="viewer-branch-scatter" viewBox="0 0 ${plotWidth} ${plotHeight}" role="img" aria-label="Branch evaluation scatter plot">
          <line x1="${padding}" y1="${plotHeight - padding}" x2="${plotWidth - padding}" y2="${plotHeight - padding}" />
          <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${plotHeight - padding}" />
          <text x="${plotWidth / 2}" y="${plotHeight - 7}">Walkability</text>
          <text x="10" y="20">Overall</text>
          ${points.map((point) => {
            const radius = point.status === "succeeded" ? 7 + clamp(Number(point.overall ?? 50), 0, 100) / 28 : 6;
            return `
              <circle
                class="viewer-branch-point"
                data-branch-node="${escapeHtml(point.node_id)}"
                data-status="${escapeHtml(point.status)}"
                data-selected="${point.node_id === selectedId ? "true" : "false"}"
                cx="${scaleX(point.x)}"
                cy="${scaleY(point.y)}"
                r="${radius}"
              />
              <text class="viewer-branch-point-label" x="${scaleX(point.x) + 9}" y="${scaleY(point.y) - 8}">D${point.depth}</text>
            `;
          }).join("")}
        </svg>
      </div>
    `;
  }

  function renderBranchNodeDetail(node: BranchRunNode | null): string {
    if (!node) return `<div class="viewer-design-workspace-muted">选择一个分支节点查看细节。</div>`;
    const evaluation = asRecord(node.evaluation);
    return `
      <div class="viewer-branch-detail">
        <div class="viewer-branch-detail-actions">
          ${node.scene_layout_path ? `
            <button class="viewer-design-stage-detail-button" type="button" data-branch-load="${escapeHtml(node.scene_layout_path)}">Load Scene</button>
          ` : ""}
        </div>
        ${renderDiagnosticSection("评价结果", renderDiagnosticKeyValues({
          status: node.status,
          score: node.score,
          walkability: evaluation.walkability,
          safety: evaluation.safety,
          beauty: evaluation.beauty,
          overall: evaluation.overall,
          error: node.error,
        }))}
        ${renderDiagnosticSection("LLM 候选与实际参数", `
          <p class="viewer-design-workspace-copy">${escapeHtml(node.llm_candidate_reasoning || "无 LLM reasoning。")}</p>
          ${renderDiagnosticKeyValues(asRecord(node.config_patch), 28)}
        `)}
        ${renderDiagnosticSection("Rule-Based 优化方向", renderDiagnosticTable(asRecords(node.optimization_directives), [
          ["directive_id", "Directive"],
          ["target_metric", "目标"],
          ["direction", "方向"],
          ["allowed_fields", "允许字段"],
          ["risk", "风险"],
        ], "该节点尚未生成优化方向。"))}
        ${renderDiagnosticSection("LLM 修改拦截", renderDiagnosticTable(asRecords(node.rejected_edits), [
          ["field", "字段"],
          ["value", "LLM 值"],
          ["reason", "拦截原因"],
        ], "没有被拦截的修改。"))}
        ${renderDiagnosticSection("RAG 证据", renderDiagnosticTable(asRecords(node.rag_evidence), [
          ["chunk_id", "Chunk"],
          ["section_title", "章节"],
          ["score", "相关度"],
          ["knowledge_source", "来源"],
        ], "该节点没有直接 RAG 证据。"))}
      </div>
    `;
  }

  function renderBranchWorkspace(payload: BranchRunStatusPayload): void {
    lastBranchRunSnapshot = payload;
    const selected = selectedBranchNode(payload);
    selectedBranchNodeId = selected?.node_id ?? selectedBranchNodeId;
    const progress = Math.round(clamp(Number(payload.progress ?? 0), 0, 100));
    designWorkspaceEl.hidden = false;
    minimapEl.hidden = true;
    designWorkspaceEl.innerHTML = `
      <div class="viewer-design-workspace-shell">
        <header class="viewer-design-workspace-header">
          <div>
            <span class="viewer-design-workspace-kicker">Branch Run · Top-${escapeHtml(String(payload.topk ?? 3))} · ${escapeHtml(payload.graph_template_id ?? DEFAULT_GRAPH_TEMPLATE_ID)}</span>
            <h2>Design Evolution</h2>
            <p>${escapeHtml(payload.prompt ?? designPromptEl.value.trim())}</p>
          </div>
          <div class="viewer-design-workspace-progress">
            <strong>${progress}%</strong>
            <span>${escapeHtml(payload.stage || payload.status)}</span>
          </div>
        </header>
        <div class="viewer-design-workspace-progressbar" aria-label="Branch run progress">
          <div style="width:${progress}%"></div>
        </div>
        <div class="viewer-branch-layout">
          <section class="viewer-design-workspace-panel">
            <div class="viewer-design-workspace-panel-title">分支树</div>
            ${renderBranchTree(payload, selected?.node_id ?? null)}
          </section>
          <section class="viewer-design-workspace-panel">
            <div class="viewer-design-workspace-panel-title">评价散点图</div>
            ${renderBranchScatter(payload, selected?.node_id ?? null)}
          </section>
          <section class="viewer-design-workspace-panel">
            <div class="viewer-design-workspace-panel-title">节点详情</div>
            ${renderBranchNodeDetail(selected)}
          </section>
        </div>
      </div>
    `;
  }

  function renderBranchRunResults(payload: BranchRunStatusPayload): void {
    const readyNodes = branchNodes(payload).filter((node) => node.status === "succeeded" && node.scene_layout_path);
    if (readyNodes.length === 0) {
      designResultEl.innerHTML = `<div class="viewer-design-workspace-muted">No branch scene is ready yet.</div>`;
      return;
    }
    designResultEl.innerHTML = `
      <div class="viewer-design-schemes">
        ${readyNodes.map((node) => `
          <button class="viewer-design-scheme" type="button" data-layout-path="${escapeHtml(node.scene_layout_path || "")}">
            <span>
              <strong>D${node.depth} · #${node.rank} · ${escapeHtml(node.node_id)}</strong>
              <small>score ${escapeHtml(formatBranchScore(node.score))} · ${escapeHtml(node.scene_layout_path || "")}</small>
            </span>
            <em>Load</em>
          </button>
        `).join("")}
      </div>
    `;
  }

  async function waitForBranchRun(runId: string): Promise<BranchRunStatusPayload> {
    for (let attempt = 0; attempt < DESIGN_MAX_POLL_ATTEMPTS; attempt += 1) {
      const payload = await apiJson<BranchRunStatusPayload>(`/api/design/branch-runs/${encodeURIComponent(runId)}`);
      const progress = Math.round(clamp(Number(payload.progress ?? 0), 0, 100));
      updateDesignStatus(`Branch run: ${payload.stage || payload.status} (${progress}%)`);
      renderBranchWorkspace(payload);
      renderBranchRunResults(payload);
      if (payload.status === "succeeded") return payload;
      if (payload.status === "failed") throw new Error(payload.error || "Branch run failed.");
      await sleep(DESIGN_POLL_INTERVAL_MS);
    }
    throw new Error("Branch run timed out.");
  }

  async function runBranchGeneration(): Promise<void> {
    if (branchRunIsGenerating || designIsGenerating) return;
    const prompt = designPromptEl.value.trim() || selectedDesignPreset()?.prompt || "Generate a walkable complete street.";
    const graphTemplateId = designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
    branchRunIsGenerating = true;
    designBranchRunEl.disabled = true;
    designGenerateEl.disabled = true;
    selectedBranchNodeId = null;
    updateDesignStatus("Submitting branch run...");
    designResultEl.innerHTML = "";
    try {
      const created = await postApiJson<BranchRunCreatePayload>("/api/design/branch-runs", {
        prompt,
        topk: 3,
        rounds: 2,
        graph_template_id: graphTemplateId,
        knowledge_source: "graph_rag",
        scene_context: {
          layout_mode: "graph_template",
          graph_template_id: graphTemplateId,
        },
        generation_options: {},
        evaluation_weights: {
          walkability: 0.4,
          safety: 0.3,
          beauty: 0.3,
        },
      });
      const payload = await waitForBranchRun(created.run_id);
      lastBranchRunSnapshot = payload;
      renderBranchWorkspace(payload);
      renderBranchRunResults(payload);
      const best = branchNodes(payload).find((node) => node.node_id === payload.best_node_id);
      if (best?.scene_layout_path) {
        clearRecentLayoutsCache();
        clearManifestCache();
        await loadLayoutSelection(best.scene_layout_path);
        const recent = await loadRecentLayouts(50, false);
        populateRecentLayoutOptions(recent, best.scene_layout_path);
      }
      updateDesignStatus("Branch run complete.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Branch run failed.";
      updateDesignStatus(message, "error");
      designResultEl.innerHTML = `<div class="viewer-design-error">${escapeHtml(message)}</div>`;
      setError(errorEl, message);
    } finally {
      branchRunIsGenerating = false;
      designBranchRunEl.disabled = false;
      designGenerateEl.disabled = false;
    }
  }

  function renderDesignSteps(payload: SceneJobStatusPayload, currentStage: string, failed: boolean = false): string {
    const currentIndex = getStepIndex(currentStage);
    const steps = GENERATION_STEPS.map((step, idx) => {
      let stateClass = "";
      let iconSvg = "";
      const operation = latestOperationForStage(payload, step.key);

      if (idx < currentIndex) {
        // 已完成的步骤
        stateClass = "completed";
        iconSvg = `<svg viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2"><path d="M2 6l3 3 5-5"/></svg>`;
      } else if (idx === currentIndex && !failed) {
        // 当前活跃步骤
        stateClass = "active";
      } else if (idx === currentIndex && failed) {
        // 失败步骤
        stateClass = "failed";
        iconSvg = `<svg viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2"><path d="M3 3l6 6M9 3l-6 6"/></svg>`;
      }

      return `<div class="viewer-design-step ${stateClass}">
        <div class="viewer-design-step-indicator">${iconSvg}</div>
        <span>
          <strong>${step.label}</strong>
          <small>${escapeHtml(operation?.message || step.detailHint)}</small>
        </span>
      </div>`;
    });

    return `<div class="viewer-design-steps">${steps.join("")}</div>`;
  }

  function describeDesignJobProgress(payload: SceneJobStatusPayload): { progress: number; message: string; stage: string } {
    let progress = 10;
    let message = "Waiting for generation...";
    let stage = "queued";

    if (payload.status === "queued") {
      progress = 5;
      message = "Generation job queued...";
      stage = "queued";
    } else if (payload.status === "running" || payload.status === "processing") {
      stage = payload.stage || "processing";
      const stageProgress: Record<string, number> = {
        context_resolving: 15,
        asset_loading: 25,
        layout_generation: 40,
        constraint_solving: 50,
        asset_composition: 65,
        mesh_generation: 75,
        glb_export: 88,
        scene_rendering: 95,
        finalizing: 99,
      };
      progress = stageProgress[stage] ?? 50;
      message = `Generating: ${stage.replace(/_/g, " ")}`;
    } else if (payload.status === "succeeded") {
      progress = 100;
      message = "Generation complete. Loading scene...";
      stage = "finalizing";
    } else if (payload.status === "failed") {
      progress = 0;
      message = payload.error || "Generation failed.";
      stage = payload.stage || "processing";
    }

    if (typeof payload.progress === "number" && payload.progress > 0) {
      progress = Math.round(payload.progress);
    }

    const currentOp = payload.operations?.[payload.operations.length - 1];
    if (typeof currentOp === "string" && currentOp.trim()) {
      message = currentOp;
    } else if (currentOp && typeof currentOp === "object") {
      message = currentOp.message || currentOp.name || currentOp.status || message;
    }

    return { progress, message, stage };
  }

  async function waitForDesignJob(
    jobId: string,
    preset: DesignPreset | null,
    variant: DesignSchemeVariant,
    prompt: string,
    graphTemplateId: string,
  ): Promise<SceneJobResult> {
    for (let attempt = 0; attempt < DESIGN_MAX_POLL_ATTEMPTS; attempt += 1) {
      const payload = await apiJson<SceneJobStatusPayload>(`/api/scene/jobs/${encodeURIComponent(jobId)}`);
      const { progress, message, stage } = describeDesignJobProgress(payload);
      updateDesignStatus(`${message} (${progress}%)`);
      renderDesignWorkspace(payload, preset, variant, prompt, graphTemplateId);
      
      const isFailed = payload.status === "failed";
      designResultEl.innerHTML = `
        <div class="viewer-design-progress" aria-label="Generation progress">
          <div style="width:${clamp(progress, 0, 100)}%"></div>
        </div>
        ${renderDesignSteps(payload, stage, isFailed)}
      `;
      
      if (payload.status === "succeeded" && payload.result) {
        return payload.result;
      }
      if (payload.status === "failed") {
        throw new Error(payload.error || "Generation job failed.");
      }
      await sleep(DESIGN_POLL_INTERVAL_MS);
    }
    throw new Error("Generation timed out.");
  }

  async function runDesignGeneration(): Promise<void> {
    if (designIsGenerating) return;
    const preset = selectedDesignPreset();
    const prompt = designPromptEl.value.trim() || (preset?.prompt ?? "");
    const graphTemplateId = designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
    const variants = designCountEl.value === "3" ? DESIGN_SCHEME_VARIANTS : [DESIGN_SCHEME_VARIANTS[0]];
    const generatedSchemes: GeneratedDesignScheme[] = [];
    designIsGenerating = true;
    designGenerateEl.disabled = true;
    designReviewRunEl.disabled = lastDesignRunSnapshot === null;
    updateDesignStatus("Submitting generation job...");
    designResultEl.innerHTML = "";
    designWorkspaceEl.hidden = false;
    minimapEl.hidden = true; // Hide minimap when design workspace is visible
    const presetLabel = preset ? `${preset.nameEn} / ${preset.name}` : "Custom / LLM-Driven";
    designWorkspaceEl.innerHTML = `
      <div class="viewer-design-workspace-shell">
        <header class="viewer-design-workspace-header">
          <div>
            <span class="viewer-design-workspace-kicker">${escapeHtml(presetLabel)} · ${escapeHtml(graphTemplateId)}</span>
            <h2>Design Run</h2>
            <p>正在提交生成任务。</p>
          </div>
          <div class="viewer-design-workspace-progress">
            <strong>0%</strong>
            <span>准备提交</span>
          </div>
        </header>
        ${renderDesignImprovementSummary(preset, variants[0]!, prompt, graphTemplateId)}
      </div>
    `;
    setStatus("Submitting design generation job...");

    try {
      for (const variant of variants) {
        updateDesignStatus(`Submitting ${variant.name}...`);
        try {
          const createPayload = await submitDesignJob(preset, prompt, graphTemplateId, variant);
          updateDesignStatus(`${variant.name}: job ${createPayload.job_id} submitted.`);
          const result = await waitForDesignJob(createPayload.job_id, preset, variant, prompt, graphTemplateId);
          if (!result.scene_layout_path) {
            throw new Error("Generation finished without a scene_layout_path.");
          }
          generatedSchemes.push({
            id: variant.id,
            name: variant.name,
            layoutPath: result.scene_layout_path,
            status: "ready",
          });
          renderGeneratedDesignSchemes(generatedSchemes);
        } catch (err) {
          const message = err instanceof Error ? err.message : `${variant.name} generation failed.`;
          generatedSchemes.push({
            id: variant.id,
            name: variant.name,
            layoutPath: "",
            status: "failed",
            error: message,
          });
          renderGeneratedDesignSchemes(generatedSchemes);
          if (variants.length === 1) {
            throw err;
          }
        }
      }
      const firstReady = generatedSchemes.find((scheme) => scheme.status === "ready");
      if (!firstReady) {
        throw new Error("No schemes were generated successfully.");
      }
      clearRecentLayoutsCache();
      clearManifestCache();
      await loadLayoutSelection(firstReady.layoutPath);
      const recent = await loadRecentLayouts(50, false);
      populateRecentLayoutOptions(recent, firstReady.layoutPath);
      renderGeneratedDesignSchemes(generatedSchemes);
      hideDesignWorkspace();
      updateDesignStatus(`${generatedSchemes.filter((scheme) => scheme.status === "ready").length}/${variants.length} schemes generated.`, "success");
      flashStatus(`${firstReady.name} loaded in Viewer.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Design generation failed.";
      updateDesignStatus(message, "error");
      designResultEl.innerHTML = `<div class="viewer-design-error">${escapeHtml(message)}</div>`;
      setError(errorEl, message);
    } finally {
      designIsGenerating = false;
      designGenerateEl.disabled = false;
      designReviewRunEl.disabled = lastDesignRunSnapshot === null;
    }
  }

  // 从manifest创建场景选项
  function makeSceneOptionsFromManifest(manifest: ViewerManifest, layoutPath: string): SceneOption[] {
    const options: SceneOption[] = [];
    
    // 添加production_steps场景
    if (manifest.production_steps) {
      for (const step of manifest.production_steps) {
        options.push({
          key: step.step_id,
          label: `${step.title} (${layoutPath.split('/').pop()})`,
          glbUrl: step.glb_url,
        });
      }
    }
    
    // 添加final_scene
    if (manifest.final_scene) {
      options.push({
        key: "final_scene",
        label: `Final Scene (${layoutPath.split('/').pop()})`,
        glbUrl: manifest.final_scene.glb_url,
      });
    }
    
    return options;
  }

  function populateSceneOptions(manifest: ViewerManifest): SceneOption[] {
    optionsByKey.clear();
    selectEl.innerHTML = "";
    const options = makeSceneOptions(manifest);
    for (const option of options) {
      optionsByKey.set(option.key, option);
      const optionEl = document.createElement("option");
      optionEl.value = option.key;
      optionEl.textContent = compactUiLabel(option.label, 42);
      optionEl.title = option.label;
      selectEl.appendChild(optionEl);
    }
    selectEl.disabled = options.length === 0;
    const selectedOption = options.find((option) => option.key === selectEl.value) ?? options[0];
    selectEl.title = selectedOption?.label ?? "";
    
    return options;
  }

  async function loadLayoutSelection(layoutPath: string): Promise<void> {
    clearError(errorEl);
    setStatus("Loading scene set…");
    currentLayoutPath = layoutPath;
    currentManifest = await loadManifest(layoutPath);
    const options = populateSceneOptions(currentManifest);
    if (options.length === 0) {
      throw new Error("No viewable GLB entries were found in this scene layout.");
    }
    const defaultKey = optionsByKey.has(currentManifest.default_selection as string)
      ? currentManifest.default_selection
      : options[0]?.key ?? "";
    selectEl.value = defaultKey;
    selectEl.title = optionsByKey.get(defaultKey)?.label ?? "";
    updateQueryLayout(layoutPath);
    await loadScene(optionsByKey.get(defaultKey) ?? options[0]);
    // Refresh metrics panel
    updateMetricsPanel();
    // Reset graph overlay if active
    if (graphOverlayActive) {
      graphOverlayToggleEl.checked = false;
      graphOverlayActive = false;
      clearGraphOverlay();
      currentCameraMode = thirdPersonToggleEl.checked ? "third_person" : "first_person";
      syncCameraRig();
    }
    // Reset layout overlay if active
    if (layoutOverlayToggleEl.checked) {
      layoutOverlayToggleEl.checked = false;
      floatingLaneConfig.enabled = false;
      clearFloatingLaneOverlay();
    }
    applyAudioProfile();
  }

  /* ── Evaluate ────────────────────────────────────────────── */

  function renderEvaluationCameraToDataUrl(
    renderCamera: THREE.Camera,
    width = 960,
    height = 540,
  ): string {
    const captureRenderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    captureRenderer.setSize(width, height!, false);
    captureRenderer.setPixelRatio(1);
    captureRenderer.outputColorSpace = renderer.outputColorSpace;
    captureRenderer.toneMapping = renderer.toneMapping;
    captureRenderer.toneMappingExposure = renderer.toneMappingExposure;
    captureRenderer.shadowMap.enabled = renderer.shadowMap.enabled;
    captureRenderer.shadowMap.type = renderer.shadowMap.type;
    const bgColor = scene.background instanceof THREE.Color ? scene.background : new THREE.Color("#f7f6f3");
    captureRenderer.setClearColor(bgColor);
    captureRenderer.render(scene, renderCamera);
    const dataUrl = captureRenderer.domElement.toDataURL("image/png");
    captureRenderer.dispose();
    return dataUrl;
  }

  function currentEvaluationForward(): THREE.Vector3 {
    const forward = currentForward.clone().setY(0);
    if (forward.lengthSq() > 1e-6) {
      return forward.normalize();
    }
    const cameraForward = cameraForwardHorizontal();
    if (cameraForward.lengthSq() > 1e-6) {
      return cameraForward.normalize();
    }
    return new THREE.Vector3(1, 0, 0);
  }

  function makePedestrianEvaluationCamera(direction: 1 | -1): THREE.PerspectiveCamera {
    const bbox = currentRoot ? new THREE.Box3().setFromObject(currentRoot) : null;
    const eye = currentSpawn.clone();
    if (!Number.isFinite(eye.x) || !Number.isFinite(eye.y) || !Number.isFinite(eye.z)) {
      eye.set(0, AVATAR_EYE_HEIGHT_M, 0);
    }
    const groundY = bbox ? bbox.min.y : 0;
    eye.y = Math.max(eye.y, groundY + AVATAR_EYE_HEIGHT_M);

    const forward = currentEvaluationForward().multiplyScalar(direction);
    const target = eye.clone().add(forward.multiplyScalar(12));
    target.y = eye.y - 0.05;

    const renderCamera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 2000);
    renderCamera.position.copy(eye);
    renderCamera.lookAt(target);
    renderCamera.updateProjectionMatrix();
    return renderCamera;
  }

  function makeOverviewEvaluationCamera(width = 960, height = 540): THREE.OrthographicCamera {
    if (!currentRoot) {
      throw new Error("No scene root available for top-down evaluation view.");
    }
    const bbox = new THREE.Box3().setFromObject(currentRoot);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxExtent = Math.max(size.x, size.z);
    if (!Number.isFinite(maxExtent) || maxExtent <= 0) {
      throw new Error("Scene bounds are too small for evaluation screenshots.");
    }
    const padding = maxExtent * 0.18;
    const viewSize = maxExtent + padding * 2;
    const aspect = width / height;
    const halfHeight = viewSize / 2;
    const halfWidth = halfHeight * aspect;
    const renderCamera = new THREE.OrthographicCamera(
      -halfWidth,
      halfWidth,
      halfHeight,
      -halfHeight,
      0.1,
      5000,
    );
    renderCamera.position.set(center.x, center.y + size.y * 0.5 + viewSize * 1.2, center.z);
    renderCamera.lookAt(center.x, center.y, center.z);
    renderCamera.updateProjectionMatrix();
    return renderCamera;
  }

  async function captureEvaluationViews(): Promise<RenderedEvaluationView[]> {
    if (!currentRoot) {
      throw new Error("No scene loaded for visual evaluation.");
    }
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const views: RenderedEvaluationView[] = [
      {
        view_id: "pedestrian_forward",
        label: "Pedestrian forward view",
        image_data_url: renderEvaluationCameraToDataUrl(makePedestrianEvaluationCamera(1)),
      },
      {
        view_id: "pedestrian_reverse",
        label: "Pedestrian reverse view",
        image_data_url: renderEvaluationCameraToDataUrl(makePedestrianEvaluationCamera(-1)),
      },
      {
        view_id: "overview_topdown",
        label: "Overview top-down view",
        image_data_url: renderEvaluationCameraToDataUrl(makeOverviewEvaluationCamera()),
      },
    ];
    return views.every((view) => view.image_data_url.startsWith("data:image/")) ? views : [];
  }

  function renderEvaluationViewsPreview(views: RenderedEvaluationView[]): string {
    const complete = views.length === 3;
    if (!complete) {
      return `
        <div class="viewer-evaluate-views" data-state="missing">
          <div class="viewer-evaluate-views-header">
            <span>Rendered views</span>
            <strong>0 / 3 captured</strong>
          </div>
          <div class="viewer-evaluate-views-note">Safety and Beauty will stay N/A until Viewer captures all three visual inputs.</div>
        </div>
      `;
    }
    return `
      <div class="viewer-evaluate-views" data-state="provided">
        <div class="viewer-evaluate-views-header">
          <span>Rendered views</span>
          <strong>${views.length} / 3 captured</strong>
        </div>
        <div class="viewer-evaluate-view-grid">
          ${views.map((view) => `
            <figure class="viewer-evaluate-view-card">
              <img src="${view.image_data_url}" alt="${escapeHtml(view.label)}" />
              <figcaption>${escapeHtml(view.label)}</figcaption>
            </figure>
          `).join("")}
        </div>
      </div>
    `;
  }

  function enforceVisualEvaluationAvailability(result: EvaluationResult): EvaluationResult {
    const safetyHasVisual = hasProvidedVisualInput(result.llm_status?.safety);
    const beautyHasVisual = hasProvidedVisualInput(result.llm_status?.beauty);
    return {
      ...result,
      safety: safetyHasVisual ? result.safety : null,
      beauty: beautyHasVisual ? result.beauty : null,
      overall: safetyHasVisual && beautyHasVisual ? result.overall : null,
    };
  }

  async function runEvaluation(): Promise<void> {
    if (!currentLayoutPath) {
      evaluateContentEl.innerHTML = `<div class="viewer-evaluate-empty">No layout loaded.</div>`;
      return;
    }
    evaluateContentEl.innerHTML = `<div class="viewer-evaluate-loading">Capturing evaluation views...</div>`;
    evaluateRunEl.disabled = true;

    try {
      setStatus("Capturing evaluation views...");
      let renderedViews: RenderedEvaluationView[] = [];
      try {
        renderedViews = await captureEvaluationViews();
      } catch (captureError) {
        console.warn("Visual evaluation screenshots failed:", captureError);
        renderedViews = [];
      }
      if (renderedViews.length === 3) {
        evaluateContentEl.innerHTML = `
          <div class="viewer-evaluate-loading">Running visual evaluation from 3 rendered views...</div>
          ${renderEvaluationViewsPreview(renderedViews)}
        `;
        setStatus("Running visual evaluation from captured views...");
      } else {
        evaluateContentEl.innerHTML = `
          <div class="viewer-evaluate-loading">Visual capture unavailable. Requesting walkability with Safety/Beauty as N/A...</div>
          ${renderEvaluationViewsPreview(renderedViews)}
        `;
        setStatus("Visual evaluation unavailable; requesting walkability only.");
      }

      const response = await fetch(`${API_BASE}/api/design/evaluate/unified`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout_path: currentLayoutPath,
          rendered_views: renderedViews,
        }),
      });

      // Handle empty response or non-JSON responses
      const text = await response.text();
      if (!text) {
        throw new Error("Server returned empty response");
      }

      let result: EvaluationResult | { error?: string };
      try {
        result = JSON.parse(text) as EvaluationResult | { error?: string };
      } catch {
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(
          (result && "error" in result ? result.error : "Evaluation failed") as string,
        );
      }
      const evalResult = enforceVisualEvaluationAvailability(result as EvaluationResult);
      renderEvaluationResult(evalResult, renderedViews);
      flashStatus(
        renderedViews.length === 3
          ? "Visual evaluation complete."
          : "Walkability complete; visual scores unavailable.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Evaluation request failed.";
      evaluateContentEl.innerHTML = `<div class="viewer-evaluate-error">${escapeHtml(message)}</div>`;
      setStatus(`Evaluation failed: ${message}`);
    } finally {
      evaluateRunEl.disabled = false;
    }
  }

  function renderEvaluationResult(result: EvaluationResult, renderedViews: RenderedEvaluationView[] = []): void {
    const overallScore = result.overall;
    const hasOverall = isScoreValue(overallScore);
    const scorePercent = hasOverall ? Math.round(clamp(overallScore, 0, 100)) : 0;
    const scoreColor = hasOverall ? metricColor(overallScore, 100) : "#94a3b8";
    const safetyStatus = llmStatusPresentation(result.llm_status?.safety);
    const beautyStatus = llmStatusPresentation(result.llm_status?.beauty);
    evaluateContentEl.innerHTML = `
      <div class="viewer-evaluate-score">
        <div class="viewer-evaluate-score-ring" style="--score-color:${scoreColor};--score-percent:${scorePercent}">
          <span>${hasOverall ? scorePercent : "N/A"}</span>
        </div>
        <div class="viewer-evaluate-score-label">Visual Overall Score</div>
      </div>
      <div class="viewer-evaluate-score-grid">
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Walkability</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.walkability)}</div>
        </div>
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Visual Safety</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.safety)}</div>
        </div>
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Visual Beauty</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.beauty)}</div>
        </div>
      </div>
      ${renderEvaluationViewsPreview(renderedViews)}
      <div class="viewer-evaluate-section">
        <div class="viewer-metrics-group-title">Visual LLM Status</div>
        <div class="viewer-evaluate-llm-status">
          <div class="viewer-evaluate-llm-row">
            <span class="viewer-evaluate-llm-label">Safety Visual LLM</span>
            <span class="viewer-evaluate-llm-pill ${safetyStatus.className}">${safetyStatus.label}</span>
          </div>
          <div class="viewer-evaluate-llm-row">
            <span class="viewer-evaluate-llm-label">Beauty Visual LLM</span>
            <span class="viewer-evaluate-llm-pill ${beautyStatus.className}">${beautyStatus.label}</span>
          </div>
        </div>
      </div>
      <div class="viewer-evaluate-section">
        <div class="viewer-metrics-group-title">Evaluation Summary</div>
        <div class="viewer-evaluate-text">${escapeHtml(result.evaluation)}</div>
      </div>
      ${result.suggestions.length > 0 ? `
        <div class="viewer-evaluate-section">
          <div class="viewer-metrics-group-title">Suggestions</div>
          <ul class="viewer-evaluate-suggestions">
            ${result.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${Object.keys(result.config_patch).length > 0 ? `
        <div class="viewer-evaluate-section">
          <div class="viewer-metrics-group-title">Suggested Config Patch</div>
          <pre class="viewer-evaluate-config">${escapeHtml(JSON.stringify(result.config_patch, null, 2))}</pre>
        </div>
      ` : ""}
    `;
  }

  function populateCompareSelectors(): void {
    const layouts = Array.from(recentLayoutsByPath.values());
    const optionsHtml = layouts
      .map(l => `<option value="${escapeHtml(l.layout_path)}">${escapeHtml(compactUiLabel(l.label))}</option>`)
      .join("");
    compareSelectAEl.innerHTML = optionsHtml;
    compareSelectBEl.innerHTML = optionsHtml;
    // Default: current layout as A
    if (currentLayoutPath) {
      compareSelectAEl.value = currentLayoutPath;
      // Default B to a different layout if available
      const other = layouts.find(l => l.layout_path !== currentLayoutPath);
      if (other) compareSelectBEl.value = other.layout_path;
    }
  }

  function flyCameraTo(x: number, y: number, z: number, durationMs = 900): void {
    if (flyAnimation) return;
    flyAnimation = {
      startPos: camera.position.clone(),
      targetPos: new THREE.Vector3(x, y, z),
      startTime: performance.now(),
      duration: durationMs,
    };
    if (controls.isLocked) {
      controls.unlock();
    }
  }

  function minimapToWorld(mx: number, my: number): { x: number; z: number } | null {
    if (!currentSceneBounds) return null;
    const width = minimapOverlayEl.clientWidth;
    const height = minimapOverlayEl.clientHeight;
    if (width <= 0 || height <= 0) return null;
    const u = clamp(mx / width, 0, 1);
    const v = clamp(my / height, 0, 1);
    return {
      x: currentSceneBounds.minX + u * (currentSceneBounds.maxX - currentSceneBounds.minX),
      z: currentSceneBounds.minZ + v * (currentSceneBounds.maxZ - currentSceneBounds.minZ),
    };
  }

  /* ── Presets ────────────────────────────────────────────── */

  const BUILTIN_PRESETS: PresetConfig[] = [
    {
      id: "urban_downtown",
      name: "Urban Downtown",
      description: "Dense urban core with mixed-use streetscape, heavy pedestrian flow",
      config: { density: "high", style: "modern", road_type: "arterial", furniture_level: "full" },
    },
    {
      id: "residential_quiet",
      name: "Quiet Residential",
      description: "Low-density residential street with trees and minimal furniture",
      config: { density: "low", style: "suburban", road_type: "local", furniture_level: "minimal" },
    },
    {
      id: "waterfront_promenade",
      name: "Waterfront Promenade",
      description: "Scenic waterfront walkway with benches, lamps, and landscape",
      config: { density: "medium", style: "scenic", road_type: "promenade", furniture_level: "moderate" },
    },
    {
      id: "commercial_strip",
      name: "Commercial Strip",
      description: "Busy commercial street with bus stops, signage, and heavy furniture",
      config: { density: "high", style: "commercial", road_type: "collector", furniture_level: "full" },
    },
    {
      id: "park_pathway",
      name: "Park Pathway",
      description: "Green park pathway with scattered trees and landscape elements",
      config: { density: "low", style: "natural", road_type: "path", furniture_level: "light" },
    },
    {
      id: "transit_corridor",
      name: "Transit Corridor",
      description: "Transit-oriented corridor with bus stops, shelters, and wide sidewalks",
      config: { density: "high", style: "transit", road_type: "arterial", furniture_level: "full" },
    },
  ];

  function populatePresetsGrid(): void {
    const activePresetId = (currentManifest?.summary as Record<string, unknown> | undefined)?.preset_id as string | undefined || null;
    presetsGridEl.innerHTML = BUILTIN_PRESETS.map(preset => {
      const isActive = activePresetId && activePresetId === preset.id;
      return `
      <button class="viewer-preset-card${isActive ? " viewer-preset-card--active" : ""}" data-preset-id="${escapeHtml(preset.id)}" type="button">
        <div class="viewer-preset-name">${escapeHtml(preset.name)}</div>
        <div class="viewer-preset-desc">${escapeHtml(preset.description)}</div>
        ${isActive ? `<div class="viewer-preset-badge">Currently viewing</div>` : ""}
      </button>
    `;
    }).join("");
  }

  async function applyPreset(presetId: string): Promise<void> {
    const preset = BUILTIN_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setStatus(`Generating scene with preset: ${preset.name}...`);
    presetsOpen = false;
    presetsPanelEl.dataset.open = "false";

    try {
      const response = await fetch("./api/design/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: preset.id, config: preset.config }),
      });
      const text = await response.text();
      if (!text) {
        throw new Error("Server returned empty response");
      }
      let result: { layout_path?: string; error?: string };
      try {
        result = JSON.parse(text) as { layout_path?: string; error?: string };
      } catch {
        throw new Error(`Invalid JSON: ${text.substring(0, 100)}`);
      }
      if (!response.ok) {
        throw new Error(result.error ?? "Scene generation failed.");
      }
      if (result.layout_path) {
        await loadLayoutSelection(result.layout_path);
        // Refresh recent layouts list
        const recent = await loadRecentLayouts();
        populateRecentLayoutOptions(recent, result.layout_path);
        flashStatus(`Preset "${preset.name}" applied successfully.`);
      } else {
        throw new Error("No layout_path returned from generation.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preset generation failed.";
      setError(errorEl, message);
      flashStatus("Preset generation failed");
    }
  }

  /* ── Metrics Panel in Info Card ──────────────────────────── */

  function updateMetricsPanel(): void {
    const metricsHost = document.getElementById("viewer-metrics-dashboard");
    if (!metricsHost) return;
    const summary = currentManifest?.summary;
    if (!summary) {
      metricsHost.innerHTML = "";
      return;
    }
    metricsHost.innerHTML = renderMetricsPanel(summary as Record<string, unknown>);
  }

  renderer.domElement.addEventListener(
    "click",
    () => {
      if (!settingsOpen && !controls.isLocked) {
        controls.lock();
      }
    },
    { signal },
  );

  sceneGraphLinkEl.addEventListener(
    "click",
    () => {
      window.location.hash = "#scene-graph";
    },
    { signal },
  );

  assetEditorLinkEl.addEventListener(
    "click",
    () => {
      window.location.hash = "#asset-editor";
    },
    { signal },
  );

  const junctionEditorLinkEl = requireElement<HTMLButtonElement>(root, "#viewer-junction-editor-link");
  junctionEditorLinkEl.addEventListener(
    "click",
    () => {
      window.location.hash = "#junction-editor";
    },
    { signal },
  );

  exportTopdownMapEl.addEventListener("click", () => {
    exportTopDownMapPng(scene, currentRoot);
    menuDropdownEl.hidden = true;
    menuToggleEl.setAttribute("aria-expanded", "false");
  }, { signal });

  exportTopdownSvgEl.addEventListener("click", () => {
    exportTopDownMapSvg(scene, currentRoot);
    menuDropdownEl.hidden = true;
    menuToggleEl.setAttribute("aria-expanded", "false");
  }, { signal });

  menuToggleEl.addEventListener("click", () => {
    const willOpen = menuDropdownEl.hidden;
    menuDropdownEl.hidden = !willOpen;
    menuToggleEl.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }, { signal });

  document.addEventListener("click", (event) => {
    if (!menuDropdownEl.hidden && !menuToggleEl.contains(event.target as Node) && !menuDropdownEl.contains(event.target as Node)) {
      menuDropdownEl.hidden = true;
      menuToggleEl.setAttribute("aria-expanded", "false");
    }
  }, { signal });

  settingsToggleEl.addEventListener("click", () => {
    if (settingsOpen) {
      setSettingsOpen(false);
    } else {
      closeAllSlidePanels();
      setSettingsOpen(true);
    }
  }, { signal });
  settingsCloseEl.addEventListener("click", () => setSettingsOpen(false), { signal });

  // 语言切换
  const langEnBtn = requireElement<HTMLButtonElement>(root, "#viewer-lang-en");
  const langZhBtn = requireElement<HTMLButtonElement>(root, "#viewer-lang-zh");
  const langMixedBtn = requireElement<HTMLButtonElement>(root, "#viewer-lang-mixed");

  function updateLangButtons() {
    langEnBtn.classList.toggle("viewer-lang-btn-active", currentLang === "en");
    langZhBtn.classList.toggle("viewer-lang-btn-active", currentLang === "zh");
    langMixedBtn.classList.toggle("viewer-lang-btn-active", currentLang === "mixed");
  }

  function t(en: string, zh: string): string {
    switch (currentLang) {
      case "zh": return zh;
      case "mixed": return `${en} · ${zh}`;
      default: return en;
    }
  }

  function updatePanelTexts() {
    // History Analysis 面板
    const historyPanel = root.querySelector<HTMLElement>("#viewer-history-analysis-panel");
    if (historyPanel) {
      const titleEl = historyPanel.querySelector<HTMLElement>(".viewer-slide-panel-title");
      const subtitleEl = historyPanel.querySelector<HTMLElement>(".viewer-slide-panel-subtitle");
      if (titleEl) {
        titleEl.textContent = t("📊 History Analysis", "📊 历史分析");
      }
      if (subtitleEl) {
        subtitleEl.textContent = t("Scatter plot analysis of scene generation history", "场景生成历史的散点图分析");
      }
    }

    // Layout Comparison 面板
    const comparePanel = root.querySelector<HTMLElement>("#viewer-compare-panel");
    if (comparePanel) {
      const titleEl = comparePanel.querySelector<HTMLElement>(".viewer-slide-panel-title");
      const subtitleEl = comparePanel.querySelector<HTMLElement>(".viewer-slide-panel-subtitle");
      if (titleEl) {
        titleEl.textContent = t("Layout Comparison", "布局对比");
      }
      if (subtitleEl) {
        subtitleEl.textContent = t("Compare two layouts side-by-side", "对比两个布局的配置、指标和地物差异");
      }
    }
  }

  function setLang(lang: LangMode) {
    currentLang = lang;
    localStorage.setItem("viewer-lang", lang);
    updateLangButtons();
    updatePanelTexts();
  }

  langEnBtn.addEventListener("click", () => setLang("en"), { signal });
  langZhBtn.addEventListener("click", () => setLang("zh"), { signal });
  langMixedBtn.addEventListener("click", () => setLang("mixed"), { signal });
  updateLangButtons();
  updatePanelTexts();

  shell.setMenuActions({
    "file-load-layout": () => {
      root.querySelector<HTMLElement>(".desktop-shell")?.classList.remove("desktop-shell-left-collapsed");
      layoutSelectEl.focus();
    },
    "file-export-png": () => exportTopdownMapEl.click(),
    "file-export-svg": () => exportTopdownSvgEl.click(),
    "view-reset-view": () => resetView(),
    "view-language-en": () => langEnBtn.click(),
    "view-language-zh": () => langZhBtn.click(),
    "view-language-mixed": () => langMixedBtn.click(),
    "tools-open-settings": () => {
      if (settingsOpen) {
        setSettingsOpen(false);
      } else {
        closeAllSlidePanels();
        setSettingsOpen(true);
      }
    },
    "tools-open-design": () => setDesignOpen(!designOpen),
    "tools-open-evaluate": () => setEvaluateOpen(!evaluateOpen),
    "tools-open-compare": () => setCompareOpen(!compareOpen),
    "tools-open-history": () => setHistoryAnalysisOpen(!historyAnalysisOpen),
    "tools-open-presets": () => setPresetsOpen(!presetsOpen),
    "tools-open-floating-lane": () => {
      shell.activateRightTab("floating-lane");
      if (!floatingLaneConfig.enabled) {
        toggleFloatingLaneOverlay();
      }
      createFloatingLaneControlPanel();
    },
    "help-shortcuts": () => {
      shell.setBottomOpen(true);
      root.querySelector<HTMLButtonElement>('[data-shell-status-tab="hints"]')?.click();
    },
  });

  root.querySelector<HTMLButtonElement>('[data-shell-tab="settings"]')?.addEventListener("click", () => {
    setSettingsOpen(true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="design"]')?.addEventListener("click", () => {
    setDesignOpen(true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="evaluate"]')?.addEventListener("click", () => {
    setEvaluateOpen(true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="compare"]')?.addEventListener("click", () => {
    setCompareOpen(true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="history"]')?.addEventListener("click", () => {
    setHistoryAnalysisOpen(true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="presets"]')?.addEventListener("click", () => {
    setPresetsOpen(true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="floating-lane"]')?.addEventListener("click", () => {
    if (!floatingLaneConfig.enabled) {
      toggleFloatingLaneOverlay();
    }
    createFloatingLaneControlPanel();
    shell.activateRightTab("floating-lane");
  }, { signal });

  designToggleEl.addEventListener("click", () => setDesignOpen(!designOpen), { signal });
  designReviewRunEl.addEventListener("click", reviewLastDesignRun, { signal });
  designCloseEl.addEventListener("click", () => setDesignOpen(false), { signal });
  designPresetEl.addEventListener("change", () => {
    const preset = selectedDesignPreset();
    // Only auto-fill prompt if a real preset is selected (not custom)
    if (preset && designPromptEl.value === "") {
      designPromptEl.value = preset.prompt;
    }
  }, { signal });
  designGenerateEl.addEventListener("click", () => void runDesignGeneration(), { signal });
  designBranchRunEl.addEventListener("click", () => void runBranchGeneration(), { signal });
  designWorkspaceEl.addEventListener("click", (event) => {
    const target = event.target as Element;
    const loadButton = target.closest<HTMLElement>("[data-branch-load]");
    const loadPath = loadButton?.dataset.branchLoad?.trim();
    if (loadPath) {
      void (async () => {
        await loadLayoutSelection(loadPath);
        const recent = await loadRecentLayouts(50, false);
        populateRecentLayoutOptions(recent, loadPath);
        flashStatus("Branch node scene loaded.");
      })();
      return;
    }
    const branchNodeButton = target.closest<HTMLElement>("[data-branch-node]");
    const branchNodeId = branchNodeButton?.dataset.branchNode?.trim();
    if (branchNodeId && lastBranchRunSnapshot) {
      selectedBranchNodeId = branchNodeId;
      renderBranchWorkspace(lastBranchRunSnapshot);
      return;
    }
    if (target.closest("[data-design-modal-close]")) {
      closeDesignStageDiagnostic();
      return;
    }
    const detailButton = target.closest<HTMLButtonElement>("[data-design-stage-detail]");
    const stage = detailButton?.dataset.designStageDetail?.trim();
    if (stage) {
      openDesignStageDiagnostic(stage);
    }
    // Handle stage tree node clicks
    const stageTreeNode = target.closest<HTMLButtonElement>("[data-design-stage]");
    const treeStage = stageTreeNode?.dataset.designStage?.trim();
    if (treeStage) {
      openDesignStageDiagnostic(treeStage);
    }
  }, { signal });
  designResultEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-layout-path]");
    const layoutPath = button?.dataset.layoutPath?.trim();
    if (!layoutPath) return;
    void (async () => {
      await loadLayoutSelection(layoutPath);
      const recent = await loadRecentLayouts(50, false);
      populateRecentLayoutOptions(recent, layoutPath);
      flashStatus("Selected generated scheme loaded.");
    })();
  }, { signal });

  evaluateToggleEl.addEventListener("click", () => setEvaluateOpen(!evaluateOpen), { signal });
  evaluateCloseEl.addEventListener("click", () => setEvaluateOpen(false), { signal });
  evaluateRunEl.addEventListener("click", () => void runEvaluation(), { signal });

  compareToggleEl.addEventListener("click", () => setCompareOpen(!compareOpen), { signal });
  compareCloseEl.addEventListener("click", () => setCompareOpen(false), { signal });
  compareSelectAEl.addEventListener("change", () => void compareMode.runComparison(), { signal });
  compareSelectBEl.addEventListener("change", () => void compareMode.runComparison(), { signal });

  historyAnalysisToggleEl.addEventListener("click", () => setHistoryAnalysisOpen(!historyAnalysisOpen), { signal });
  historyAnalysisCloseEl.addEventListener("click", () => setHistoryAnalysisOpen(false), { signal });

  presetsToggleEl.addEventListener("click", () => setPresetsOpen(!presetsOpen), { signal });
  presetsCloseEl.addEventListener("click", () => setPresetsOpen(false), { signal });
  presetsGridEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>("[data-preset-id]");
    if (card?.dataset.presetId) {
      void applyPreset(card.dataset.presetId);
    }
  }, { signal });

  // Help panel toggle and close
  helpToggleEl.addEventListener("click", () => setHelpOpen(!helpOpen), { signal });
  helpCloseEl.addEventListener("click", () => setHelpOpen(false), { signal });

  // Help icons in Design panel - click to open Help panel
  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    
    // Handle help icon clicks in Design panel
    const helpIcon = target.closest<HTMLButtonElement>(".viewer-help-icon");
    if (helpIcon && helpIcon.dataset.help) {
      event.preventDefault();
      event.stopPropagation();
      setHelpOpen(true);
      // Optionally scroll to the relevant section
      return;
    }

    // Handle help step detail buttons
    const detailBtn = target.closest<HTMLButtonElement>(".viewer-help-step-detail-btn");
    if (detailBtn && detailBtn.dataset.detail) {
      event.preventDefault();
      const contentEl = helpContentEl.querySelector<HTMLElement>(`[data-detail-content="${detailBtn.dataset.detail}"]`);
      if (contentEl) {
        const isHidden = contentEl.hasAttribute("hidden");
        // Toggle this content and hide all others
        helpContentEl.querySelectorAll<HTMLElement>("[data-detail-content]").forEach((el) => {
          el.setAttribute("hidden", "");
        });
        if (isHidden) {
          contentEl.removeAttribute("hidden");
        }
      }
      return;
    }
  }, { signal });

  // Floating Lane Overlay toggle
  const floatingLaneToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-floating-lane-toggle");
  floatingLaneToggleEl.addEventListener("click", () => {
    toggleFloatingLaneOverlay();
  }, { signal });

  minimapOverlayEl.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!currentSceneBounds) {
        return;
      }
      const rect = minimapOverlayEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const nz = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const worldX = currentSceneBounds.minX + nx * (currentSceneBounds.maxX - currentSceneBounds.minX);
      const worldZ = currentSceneBounds.minZ + nz * (currentSceneBounds.maxZ - currentSceneBounds.minZ);
      flyCameraTo(worldX, Math.max(0, currentSpawn.y - AVATAR_EYE_HEIGHT_M), worldZ);
    },
    { signal },
  );

  for (const [presetKey, presetLabel] of Object.entries(LIGHTING_PRESET_LABELS)) {
    const optionEl = document.createElement("option");
    optionEl.value = presetKey;
    optionEl.textContent = presetLabel;
    lightingPresetEl.appendChild(optionEl);
  }

  lightingPresetEl.addEventListener(
    "change",
    () => {
      const nextPreset = lightingPresetEl.value;
      const presetValues = LIGHTING_PRESETS[nextPreset];
      if (!presetValues) {
        return;
      }
      lightingState.preset = nextPreset;
      Object.assign(lightingState, presetValues);
      syncLightingUi();
    },
    { signal },
  );

  exposureInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.exposure = Number(exposureInput.value);
      syncLightingUi();
    },
    { signal },
  );
  keyInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.keyLightIntensity = Number(keyInput.value);
      syncLightingUi();
    },
    { signal },
  );
  fillInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.fillLightIntensity = Number(fillInput.value);
      syncLightingUi();
    },
    { signal },
  );
  warmthInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.warmth = Number(warmthInput.value);
      syncLightingUi();
    },
    { signal },
  );
  shadowInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.shadowStrength = Number(shadowInput.value);
      syncLightingUi();
    },
    { signal },
  );
  thirdPersonToggleEl.addEventListener(
    "change",
    () => {
      currentCameraMode = thirdPersonToggleEl.checked ? "third_person" : "first_person";
      syncCameraRig();
    },
    { signal },
  );
  laserToggleEl.addEventListener(
    "change",
    () => {
      crosshairEl.hidden = !laserToggleEl.checked;
      if (!laserToggleEl.checked) {
        clearInfoCard();
        laserBeam.visible = false;
        laserHitDot.visible = false;
        currentLaserHitPoint = null;
      }
    },
    { signal },
  );
  function removeAssetBboxHelpers(): void {
    scene.traverse((child) => {
      if (child.userData.isAssetBboxHelper || child.userData.isAssetLabel) {
        scene.remove(child);
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
        if (child instanceof THREE.Sprite) {
          child.material.map?.dispose();
          child.material.dispose();
        }
      }
    });
  }

  function createAssetBboxHelpers(): void {
    if (!currentRoot || !currentManifest) return;

    removeAssetBboxHelpers();
    const instances = currentManifest.instances;
    currentRoot.traverse((child) => {
      const name = child.name || "";
      const instanceId = resolveInstanceIdFromName(name);
      if (!instanceId) return;
      const instanceInfo = instances?.[instanceId];
      if (!instanceInfo) return;
      const category = String(instanceInfo.category || "").trim().toLowerCase();
      const assetId = String(instanceInfo.asset_id || "").trim() || instanceId;
      const color = CATEGORY_BBOX_COLORS[category] ?? 0x38bdf8;

      const bbox = new THREE.Box3().setFromObject(child);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      if (size.length() > 0.01) {
        const helper = new THREE.BoxHelper(child, color);
        helper.userData.isAssetBboxHelper = true;
        helper.userData.assetInstanceId = instanceId;
        helper.userData.assetCategory = category;
        helper.visible = true;
        scene.add(helper);

        // Add text label showing asset_id above the bounding box
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const label = createTextSprite(assetId, color);
        label.position.set(center.x, bbox.max.y + 0.5, center.z);
        label.userData.isAssetLabel = true;
        scene.add(label);
      }
    });
  }

  function updateAssetBboxHelpers(): void {
    scene.traverse((child) => {
      if (child.userData.isAssetBboxHelper && child instanceof THREE.BoxHelper) {
        child.update();
      }
    });
  }

  assetBboxToggleEl.addEventListener(
    "change",
    () => {
      if (assetBboxToggleEl.checked) {
        createAssetBboxHelpers();
      } else {
        removeAssetBboxHelpers();
      }
    },
    { signal },
  );

  frameModeToggleEl.addEventListener(
    "change",
    async () => {
      // Reload current scene to apply/remove frame helpers
      const currentOption = optionsByKey.get(selectEl.value);
      if (currentOption && currentRoot) {
        await loadScene(currentOption);
      }
    },
    { signal },
  );
  assetBboxToggleEl.addEventListener(
    "change",
    async () => {
      // Reload current scene to apply/remove asset bbox helpers
      const currentOption = optionsByKey.get(selectEl.value);
      if (currentOption && currentRoot) {
        await loadScene(currentOption);
      }
    },
    { signal },
  );
  assetBboxToggleEl.addEventListener(
    "change",
    async () => {
      const currentOption = optionsByKey.get(selectEl.value);
      if (currentOption && currentRoot) {
        await loadScene(currentOption);
      }
    },
    { signal },
  );

  graphOverlayToggleEl.addEventListener(
    "change",
    () => {
      if (graphOverlayToggleEl.checked) {
        graphOverlayActive = true;
        buildGraphOverlay();
        flashStatus("Graph overlay enabled - top-down view");
      } else {
        graphOverlayActive = false;
        clearGraphOverlay();
        currentCameraMode = thirdPersonToggleEl.checked ? "third_person" : "first_person";
        syncCameraRig();
        flashStatus("Graph overlay disabled");
      }
    },
    { signal },
  );

  layoutOverlayToggleEl.addEventListener(
    "change",
    () => {
      floatingLaneConfig.enabled = layoutOverlayToggleEl.checked;
      const flpEnabledEl = document.getElementById("flp-enabled") as HTMLInputElement | null;
      if (flpEnabledEl) flpEnabledEl.checked = layoutOverlayToggleEl.checked;
      if (floatingLaneConfig.enabled) {
        buildFloatingLaneOverlay();
        flashStatus("Scene overlay enabled");
      } else {
        clearFloatingLaneOverlay();
        flashStatus("Scene overlay disabled");
      }
    },
    { signal },
  );

  const handleControlsLock = () => updateOverlay();
  const handleControlsUnlock = () => updateOverlay();
  controls.addEventListener("lock", handleControlsLock);
  controls.addEventListener("unlock", handleControlsUnlock);

  window.addEventListener("resize", resizeRenderer, { signal });
  window.addEventListener("keydown", (event) => handleKey(event, true), { signal });
  window.addEventListener("keyup", (event) => handleKey(event, false), { signal });
  layoutSelectEl.addEventListener(
    "change",
    async () => {
      const nextLayoutPath = layoutSelectEl.value.trim();
      if (!nextLayoutPath || nextLayoutPath === currentLayoutPath) {
        return;
      }
      try {
        await loadLayoutSelection(nextLayoutPath);
        layoutSelectEl.title = recentLayoutsByPath.get(nextLayoutPath)?.label ?? makeDirectLayoutLabel(nextLayoutPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load scene layout.";
        setError(errorEl, message);
        setStatus("Scene layout load failed");
      }
    },
    { signal },
  );
  selectEl.addEventListener(
    "change",
    async () => {
      const nextOption = optionsByKey.get(selectEl.value);
      if (!nextOption) {
        return;
      }
      try {
        selectEl.title = nextOption.label;
        await loadScene(nextOption);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load GLB.";
        setError(errorEl, message);
        setStatus("Scene load failed");
      }
    },
    { signal },
  );

  function animate(): void {
    if (destroyed) {
      return;
    }
    const delta = clock.getDelta();

    if (flyAnimation) {
      const elapsed = performance.now() - flyAnimation.startTime;
      const t = Math.min(elapsed / flyAnimation.duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(flyAnimation.startPos, flyAnimation.targetPos, ease);
      if (t >= 1) {
        flyAnimation = null;
      }
    } else if (controls.isLocked) {
      const moveSpeed = moveState.sprint ? 8.5 : 4.5;
      const forwardAxis = Number(moveState.forward) - Number(moveState.backward);
      const sideAxis = Number(moveState.right) - Number(moveState.left);
      const forward = cameraForwardHorizontal();
      const right = new THREE.Vector3().crossVectors(forward, UP_AXIS).normalize();
      if (forwardAxis !== 0) {
        currentAvatarPosition.addScaledVector(forward, forwardAxis * moveSpeed * delta);
      }
      if (sideAxis !== 0) {
        currentAvatarPosition.addScaledVector(right, sideAxis * moveSpeed * delta);
      }
      currentAvatarPosition.y = Math.max(0, currentSpawn.y - AVATAR_EYE_HEIGHT_M);
      syncCameraRig();
    }

    updateAssetBboxHelpers();
    updateLaserPointer();
    updateFloatingLaneOverlay(delta);

    const didRenderCompare = compareMode.renderCompare3dFrame();
    if (!didRenderCompare) {
      renderer.render(scene, camera);
    }

    renderMinimap();
    animationFrameId = requestAnimationFrame(animate);
  }
  try {
    syncLightingUi();
    const requestedLayoutPath = parseQueryLayoutPath();
    const recentLayouts = await loadRecentLayouts();
    const initialLayoutPath = requestedLayoutPath ?? recentLayouts[0]?.layout_path ?? "";
    if (!initialLayoutPath) {
      throw new Error(
        "No recent scene layouts were found. Generate a scene first or open the viewer with ?layout=/abs/path/to/scene_layout.json.",
      );
    }
    populateRecentLayoutOptions(recentLayouts, initialLayoutPath);
    resizeRenderer();
    await loadLayoutSelection(initialLayoutPath);
    animate();
    updateOverlay();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize viewer.";
    setError(errorEl, message);
    setStatus("Viewer unavailable");
  }

  return () => {
    destroyed = true;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    eventController.abort();
    controls.removeEventListener("lock", handleControlsLock);
    controls.removeEventListener("unlock", handleControlsUnlock);
    if (controls.isLocked) {
      controls.unlock();
    }
    clearGraphOverlay();
    clearFloatingLaneOverlay();
    renderer.dispose();
    minimapRenderer.dispose();
  };
}

export { mountViewer };
