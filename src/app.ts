import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type SceneOption = {
  key: string;
  label: string;
  glbUrl: string;
};

type RecentLayout = {
  layout_path: string;
  label: string;
  relative_path?: string;
  updated_at?: string;
  mtime_ms?: number;
};

type RecentLayoutsPayload = {
  results?: RecentLayout[];
  error?: string;
};

type SceneBounds = {
  center: [number, number, number];
  size: [number, number, number];
  road_axis: [number, number, number];
};

type InstanceInfo = {
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

type AssetDescription = {
  asset_id: string;
  category: string;
  text_desc?: string;
  source?: string;
  asset_role?: string;
};

type StaticObjectDescription = {
  match: "exact" | "prefix";
  title: string;
  category: string;
  source?: string;
  intro?: string;
  design_note?: string;
};

type SummaryMetrics = {
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

type ViewerManifest = {
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
};

type MovementState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
};

type LayoutBand = {
  name: string;
  kind: string;
  side: string;
  width_m: number;
  z_center_m: number;
  allowed_categories?: string[];
};

type BuildingFootprint = {
  footprint_id: string;
  polygon_xz: number[][];
  centroid_xz: number[];
  target_height_m: number;
  land_use_type?: string;
  height_class?: string;
};

type LayoutOverlayData = {
  bands: LayoutBand[];
  building_footprints: BuildingFootprint[];
  length_m: number;
};

type CameraMode = "first_person" | "third_person" | "frame" | "graph_overlay";


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

type HitDescriptor =
  | {
      kind: "instance";
      nodeName: string;
      instanceId: string;
      instanceInfo: InstanceInfo;
      assetDescription?: AssetDescription;
    }
  | {
      kind: "static";
      nodeName: string;
      staticDescription: StaticObjectDescription;
    }
  | {
      kind: "generic";
      nodeName: string;
    };

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

function createTextSprite(text: string, color: number = 0xffffff): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontSize = 64;
  ctx.font = `bold ${fontSize}px monospace`;
  const textWidth = ctx.measureText(text).width;
  canvas.width = Math.ceil(textWidth) + 20;
  canvas.height = fontSize + 16;

  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const colorHex = "#" + color.toString(16).padStart(6, "0");
  ctx.fillStyle = colorHex;
  ctx.textBaseline = "top";
  ctx.fillText(text, 10, 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: true });
  const sprite = new THREE.Sprite(material);
  sprite.userData.isAssetLabel = true;
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(aspect * 1.2, 1.2, 1);
  return sprite;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required viewer element: ${selector}`);
  }
  return element;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOrNull(value: unknown): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function asTriplet(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const items = value.map((entry) => finiteOrNull(entry));
  if (items.some((entry) => entry === null)) {
    return null;
  }
  return [items[0] ?? 0, items[1] ?? 0, items[2] ?? 0];
}

function asQuad(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }
  const items = value.map((entry) => finiteOrNull(entry));
  if (items.some((entry) => entry === null)) {
    return null;
  }
  return [items[0] ?? 0, items[1] ?? 0, items[2] ?? 0, items[3] ?? 0];
}

function isFiniteTriplet(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => Number.isFinite(item));
}

type MetricEntry = { label: string; value: number; max: number };
type EvaluationResult = { evaluation: string; score: number; suggestions: string[]; config_patch: Record<string, unknown> };
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

function comparisonDiffArrow(a: number, b: number): string {
  if (b > a) return `<span style="color:#16a34a">&#9650; ${(b - a).toFixed(3)}</span>`;
  if (b < a) return `<span style="color:#dc2626">&#9660; ${(a - b).toFixed(3)}</span>`;
  return `<span style="color:#94a3b8">-</span>`;
}

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

function disposeObject(root: THREE.Object3D): void {
  root.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (!("geometry" in mesh) || !mesh.geometry) {
      return;
    }
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      }
      material.dispose();
    }
  });
}

function inferSpawnFromBbox(
  bbox: THREE.Box3,
  manifest: ViewerManifest,
): { position: THREE.Vector3; forward: THREE.Vector3 } {
  if (isFiniteTriplet(manifest.spawn_point) && isFiniteTriplet(manifest.forward_vector)) {
    return {
      position: new THREE.Vector3(
        manifest.spawn_point[0],
        manifest.spawn_point[1],
        manifest.spawn_point[2],
      ),
      forward: new THREE.Vector3(
        manifest.forward_vector[0],
        manifest.forward_vector[1],
        manifest.forward_vector[2],
      ).normalize(),
    };
  }

  const center = bbox.getCenter(new THREE.Vector3());
  return {
    position: new THREE.Vector3(center.x, 1.65, center.z),
    forward: new THREE.Vector3(1, 0, 0),
  };
}

function parseQueryLayoutPath(): string | null {
  const search = new URLSearchParams(window.location.search);
  const layoutPath = search.get("layout") ?? "";
  return layoutPath.trim() || null;
}

async function loadManifest(layoutPath: string): Promise<ViewerManifest> {
  const response = await fetch(`./api/layout?path=${encodeURIComponent(layoutPath)}`);
  const payload = (await response.json()) as ViewerManifest | { error?: string };
  if (!response.ok) {
    throw new Error(
      payload && "error" in payload
        ? String(payload.error ?? "Failed to load scene layout.")
        : "Failed to load scene layout.",
    );
  }
  return payload as ViewerManifest;
}

async function loadRecentLayouts(limit = 20): Promise<RecentLayout[]> {
  const response = await fetch(`./api/recent-layouts?limit=${encodeURIComponent(String(limit))}`);
  const payload = (await response.json()) as RecentLayoutsPayload;
  if (!response.ok) {
    throw new Error(String(payload?.error ?? "Failed to discover recent scene layouts."));
  }
  return Array.isArray(payload?.results) ? payload.results : [];
}

function updateQueryLayout(layoutPath: string): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("layout", layoutPath);
  window.history.replaceState({}, "", nextUrl.toString());
}

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

function formatMetric(value: number | null | undefined, unit: string, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "未记录";
  }
  return `${value.toFixed(digits)}${unit}`;
}

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

function composeStaticInfoHtml(nodeName: string, description: StaticObjectDescription): string {
  const subtitle = [
    `类别：${categoryLabel(description.category)}`,
    description.source ? `来源：${prettifySource(description.source)}` : "来源：系统构件",
  ].join(" · ");
  return `
    <div class="viewer-card-title">${escapeHtml(description.title)}</div>
    <div class="viewer-card-subtitle">${escapeHtml(subtitle)}</div>
    <div class="viewer-card-section">${escapeHtml(description.intro || "这是场景中的基础构件。")}</div>
    <div class="viewer-card-section viewer-card-highlight">${escapeHtml(description.design_note || "用于支撑街道空间组织与交通可读性。")}</div>
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

function buildHitDescriptorContent(descriptor: HitDescriptor): { html: string; text: string } {
  if (descriptor.kind === "instance") {
    return {
      html: composeInstanceInfoHtml(
        descriptor.nodeName,
        descriptor.instanceInfo,
        descriptor.assetDescription,
      ),
      text: composeInstanceInfoText(
        descriptor.nodeName,
        descriptor.instanceInfo,
        descriptor.assetDescription,
      ),
    };
  }
  if (descriptor.kind === "static") {
    return {
      html: composeStaticInfoHtml(descriptor.nodeName, descriptor.staticDescription),
      text: composeStaticInfoText(descriptor.nodeName, descriptor.staticDescription),
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

function mountViewer(root: HTMLElement): Promise<() => void> {
  return mountViewerImpl(root);
}

async function mountViewerImpl(root: HTMLElement): Promise<() => void> {
  root.innerHTML = `
    <div class="viewer-shell">
      <div class="scene-page-topbar">
        <div>
          <div class="scene-page-kicker">Viewer / 3D Viewer</div>
          <h1 class="scene-page-title">3D Road Viewer</h1>
          <p class="scene-page-subtitle">Navigate through road scenes with WASD movement, inspect assets, and explore detailed urban environments.</p>
          <div class="viewer-controls-group">
            <div class="viewer-controls">
              <label class="viewer-label" for="layout-select">Recent Result</label>
              <select id="layout-select" class="viewer-select"></select>
            </div>
            <div class="viewer-controls">
              <label class="viewer-label" for="scene-select">Scene</label>
              <select id="scene-select" class="viewer-select"></select>
            </div>
          </div>
        </div>
        <div class="scene-page-actions">
          <div class="viewer-help">
            Click to capture mouse · WASD move · Shift sprint · Esc unlock · R reset · P panel · Ctrl/Cmd+C copy target
          </div>
          <button
            id="viewer-scene-graph-link"
            class="viewer-nav-button"
            type="button"
          >
            Annotation
          </button>
          <button
            id="viewer-asset-editor-link"
            class="viewer-nav-button"
            type="button"
          >
            Asset Editor
          </button>
          <button id="viewer-presets-toggle" class="viewer-nav-button" type="button">
            Presets
          </button>
          <button id="viewer-compare-toggle" class="viewer-nav-button" type="button">
            Compare
          </button>
          <button id="viewer-evaluate-toggle" class="viewer-nav-button" type="button">
            Evaluate
          </button>
          <button id="viewer-settings-toggle" class="viewer-settings-toggle" type="button" aria-expanded="false">
            Settings
          </button>
        </div>
      </div>
      <div id="viewer-canvas" class="viewer-canvas"></div>
      <div id="viewer-crosshair" class="viewer-crosshair" hidden></div>
      <div id="viewer-info-card" class="viewer-info-card" hidden></div>
      <div id="viewer-minimap" class="viewer-minimap">
        <div class="viewer-minimap-title">Scene Map</div>
        <div id="viewer-minimap-canvas" class="viewer-minimap-canvas"></div>
        <canvas id="viewer-minimap-overlay" class="viewer-minimap-overlay"></canvas>
      </div>
      <aside id="viewer-settings-panel" class="viewer-settings-panel" data-open="false">
        <div class="viewer-settings-header">
          <div>
            <div class="viewer-settings-title">Display Settings</div>
            <div class="viewer-settings-subtitle">Light presets, shadows, and laser pointer</div>
          </div>
          <button id="viewer-settings-close" class="viewer-settings-close" type="button" aria-label="Close settings">
            ×
          </button>
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
            <span>Layout Overlay</span>
            <input id="layout-overlay-enabled" type="checkbox" />
          </label>
        </div>
      </aside>
      <div id="viewer-status" class="viewer-status">Loading viewer…</div>
      <div id="viewer-overlay" class="viewer-overlay">Click scene to capture mouse</div>
      <div id="viewer-error" class="viewer-error" hidden></div>
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
      <aside id="viewer-presets-panel" class="viewer-slide-panel" data-open="false">
        <div class="viewer-slide-panel-header">
          <div>
            <div class="viewer-slide-panel-title">Scene Presets</div>
            <div class="viewer-slide-panel-subtitle">Quick-start scene generation configurations</div>
          </div>
          <button id="viewer-presets-close" class="viewer-settings-close" type="button" aria-label="Close presets">x</button>
        </div>
        <div id="viewer-presets-grid" class="viewer-presets-grid"></div>
      </aside>
    </div>
  `;

  const canvasHost = requireElement<HTMLElement>(root, "#viewer-canvas");
  const statusEl = requireElement<HTMLElement>(root, "#viewer-status");
  const overlayEl = requireElement<HTMLElement>(root, "#viewer-overlay");
  const errorEl = requireElement<HTMLElement>(root, "#viewer-error");
  const layoutSelectEl = requireElement<HTMLSelectElement>(root, "#layout-select");
  const selectEl = requireElement<HTMLSelectElement>(root, "#scene-select");
  const sceneGraphLinkEl = requireElement<HTMLButtonElement>(root, "#viewer-scene-graph-link");
  const assetEditorLinkEl = requireElement<HTMLButtonElement>(root, "#viewer-asset-editor-link");
  const settingsToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-settings-toggle");
  const settingsPanelEl = requireElement<HTMLElement>(root, "#viewer-settings-panel");
  const settingsCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-settings-close");
  const infoCardEl = requireElement<HTMLElement>(root, "#viewer-info-card");
  const crosshairEl = requireElement<HTMLElement>(root, "#viewer-crosshair");
  const minimapHost = requireElement<HTMLElement>(root, "#viewer-minimap-canvas");
  const minimapOverlayEl = requireElement<HTMLCanvasElement>(root, "#viewer-minimap-overlay");
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

  const presetsToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-presets-toggle");
  const presetsPanelEl = requireElement<HTMLElement>(root, "#viewer-presets-panel");
  const presetsCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-presets-close");
  const presetsGridEl = requireElement<HTMLElement>(root, "#viewer-presets-grid");

  const graphOverlayToggleEl = requireElement<HTMLInputElement>(root, "#graph-overlay-enabled");

  const layoutOverlayToggleEl = requireElement<HTMLInputElement>(root, "#layout-overlay-enabled");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f7f6f3");

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
  canvasHost.appendChild(renderer.domElement);

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
  let currentManifest: ViewerManifest | null = null;
  let currentLayoutPath = "";
  let currentSpawn = new THREE.Vector3(0, 1.65, 0);
  let currentForward = new THREE.Vector3(1, 0, 0);
  let currentAvatarPosition = new THREE.Vector3(0, Math.max(0, 1.65 - AVATAR_EYE_HEIGHT_M), 0);
  let currentCameraMode: CameraMode = "first_person";
  let currentSceneBounds: MinimapBounds | null = null;
  let currentLaserHitPoint: THREE.Vector3 | null = null;
  let currentLaserCopyText = "";
  let settingsOpen = false;
  let resumeRoamAfterSettingsClose = false;
  let statusResetHandle: number | null = null;
  let evaluateOpen = false;
  let compareOpen = false;
  let presetsOpen = false;
  let graphOverlayActive = false;
  const graphOverlayMarkers: THREE.Object3D[] = [];
  const optionsByKey = new Map<string, SceneOption>();
  const recentLayoutsByPath = new Map<string, RecentLayout>();

  const lightingState: LightingState = {
    ...DEFAULT_LIGHTING_STATE,
  };

  function setStatus(message: string): void {
    if (statusResetHandle !== null) {
      window.clearTimeout(statusResetHandle);
      statusResetHandle = null;
    }
    statusEl.textContent = message;
  }

  function flashStatus(message: string, durationMs = 1800): void {
    const restoreText = statusEl.textContent || "";
    if (statusResetHandle !== null) {
      window.clearTimeout(statusResetHandle);
    }
    statusEl.textContent = message;
    statusResetHandle = window.setTimeout(() => {
      statusEl.textContent = restoreText;
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

  function closeAllSlidePanels(): void {
    if (settingsOpen) setSettingsOpen(false);
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
      clearLayoutOverlay();
    }
  }

  function setEvaluateOpen(nextOpen: boolean): void {
    if (nextOpen) closeAllSlidePanels();
    evaluateOpen = nextOpen;
    evaluatePanelEl.dataset.open = nextOpen ? "true" : "false";
  }

  function setCompareOpen(nextOpen: boolean): void {
    if (nextOpen) {
      closeAllSlidePanels();
      populateCompareSelectors();
    }
    compareOpen = nextOpen;
    comparePanelEl.dataset.open = nextOpen ? "true" : "false";
  }

  function setPresetsOpen(nextOpen: boolean): void {
    if (nextOpen) {
      closeAllSlidePanels();
      populatePresetsGrid();
    }
    presetsOpen = nextOpen;
    presetsPanelEl.dataset.open = nextOpen ? "true" : "false";
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

  /* ── Layout Overlay ──────────────────────────────────────────── */

  const BAND_COLORS: Record<string, number> = {
    carriageway: 0x424a57,
    drive_lane: 0x424a57,
    bus_lane: 0xb7483a,
    bike_lane: 0x39875a,
    parking_lane: 0xa68256,
    median: 0x6e7a5f,
    nearroad_buffer: 0x989898,
    furnishing: 0x7e6547,
    clear_paths: 0xebe0ce,
    clear_sidewalk: 0xebe0ce,
    sidewalk: 0xebe0ce,
    frontage_reserve: 0xb7d4e6,
  };

  const layoutOverlayObjects: THREE.Object3D[] = [];

  function clearLayoutOverlay(): void {
    for (const obj of layoutOverlayObjects) {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
      if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    }
    layoutOverlayObjects.length = 0;
  }

  function buildLayoutOverlay(): void {
    clearLayoutOverlay();
    if (!currentManifest?.layout_overlay) return;

    const overlay = currentManifest.layout_overlay;
    const lengthM = overlay.length_m || 0;

    // 1. Bands — semi-transparent colored planes at ground level
    for (const band of overlay.bands) {
      if (!band.width_m || !Number.isFinite(band.width_m)) continue;
      const planeGeo = new THREE.PlaneGeometry(lengthM, band.width_m);
      const planeMat = new THREE.MeshBasicMaterial({
        color: BAND_COLORS[band.kind] ?? 0x666666,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const planeMesh = new THREE.Mesh(planeGeo, planeMat);
      planeMesh.rotation.x = -Math.PI / 2;
      planeMesh.position.set(lengthM / 2, 0.05, band.z_center_m ?? 0);
      planeMesh.userData.isLayoutOverlay = true;
      scene.add(planeMesh);
      layoutOverlayObjects.push(planeMesh);
    }

    // 2. Building footprints — extruded semi-transparent 3D blocks
    for (const fp of overlay.building_footprints) {
      const pts = fp.polygon_xz;
      if (!Array.isArray(pts) || pts.length < 3) continue;
      try {
        const shape = new THREE.Shape();
        shape.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          shape.lineTo(pts[i][0], pts[i][1]);
        }
        shape.closePath();
        const extrudeSettings = { depth: fp.target_height_m || 6, bevelEnabled: false };
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xa78bfa,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = 0.05;
        mesh.userData.isLayoutOverlay = true;
        scene.add(mesh);
        layoutOverlayObjects.push(mesh);
      } catch {
        // Skip invalid polygon shapes
      }
    }

    // 3. Placement markers — colored cylinders with category labels
    const instances = currentManifest.instances;
    if (instances) {
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
        marker.userData.isLayoutOverlay = true;
        scene.add(marker);
        layoutOverlayObjects.push(marker);

        const label = createTextSprite(category, color);
        label.position.set(marker.position.x, marker.position.y + 1.2, marker.position.z);
        label.userData.isLayoutOverlay = true;
        scene.add(label);
        layoutOverlayObjects.push(label);
      }
    }
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
    return null;
  }

  function resolveHitDescriptor(object: THREE.Object3D): HitDescriptor | null {
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
        };
      }
      return { kind: "generic", nodeName };
    }

    for (const nodeName of names) {
      const description = staticDescriptionForNode(nodeName);
      if (description) {
        return {
          kind: "static",
          nodeName,
          staticDescription: description,
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

    const descriptor = resolveHitDescriptor(hit.object);
    if (!descriptor) {
      clearInfoCard();
      return;
    }
    const content = buildHitDescriptorContent(descriptor);
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
      if (child.userData.isLayoutOverlay) {
        scene.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
        if (child instanceof THREE.Sprite) {
          child.material.map?.dispose();
          child.material.dispose();
        }
      }
    });
    
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
    applyLightingState();
    setStatus(`Viewing ${option.label}`);
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
    const defaultKey = optionsByKey.has(currentManifest.default_selection)
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
      clearLayoutOverlay();
    }
  }

  /* ── Evaluate ────────────────────────────────────────────── */

  async function runEvaluation(): Promise<void> {
    if (!currentLayoutPath) {
      evaluateContentEl.innerHTML = `<div class="viewer-evaluate-empty">No layout loaded.</div>`;
      return;
    }
    evaluateContentEl.innerHTML = `<div class="viewer-evaluate-loading">Evaluating layout...</div>`;
    evaluateRunEl.disabled = true;

    try {
      const response = await fetch("./api/design/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout_path: currentLayoutPath }),
      });
      const result = (await response.json()) as EvaluationResult | { error?: string };
      if (!response.ok) {
        throw new Error(
          (result && "error" in result ? result.error : "Evaluation failed") as string,
        );
      }
      const evalResult = result as EvaluationResult;
      renderEvaluationResult(evalResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Evaluation request failed.";
      evaluateContentEl.innerHTML = `<div class="viewer-evaluate-error">${escapeHtml(message)}</div>`;
    } finally {
      evaluateRunEl.disabled = false;
    }
  }

  function renderEvaluationResult(result: EvaluationResult): void {
    const scorePercent = Math.round(clamp(result.score, 0, 1) * 100);
    const scoreColor = metricColor(result.score, 1);
    evaluateContentEl.innerHTML = `
      <div class="viewer-evaluate-score">
        <div class="viewer-evaluate-score-ring" style="--score-color:${scoreColor};--score-percent:${scorePercent}">
          <span>${scorePercent}</span>
        </div>
        <div class="viewer-evaluate-score-label">Overall Score</div>
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

  /* ── Compare ────────────────────────────────────────────── */

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

  async function runComparison(): Promise<void> {
    const pathA = compareSelectAEl.value;
    const pathB = compareSelectBEl.value;
    if (!pathA || !pathB) {
      compareResultsEl.innerHTML = `<div class="viewer-evaluate-empty">Select two layouts to compare.</div>`;
      return;
    }
    compareResultsEl.innerHTML = `<div class="viewer-evaluate-loading">Loading layouts for comparison...</div>`;

    try {
      const [manifestA, manifestB] = await Promise.all([
        loadManifest(pathA),
        loadManifest(pathB),
      ]);
      renderComparisonResults(manifestA, manifestB);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load layouts for comparison.";
      compareResultsEl.innerHTML = `<div class="viewer-evaluate-error">${escapeHtml(message)}</div>`;
    }
  }

  function renderComparisonResults(a: ViewerManifest, b: ViewerManifest): void {
    const summaryA = (a.summary ?? {}) as Record<string, unknown>;
    const summaryB = (b.summary ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(summaryA), ...Object.keys(summaryB)]);
    // Filter to numeric metric keys
    const metricKeys = Array.from(keys).filter(k => {
      const va = summaryA[k];
      const vb = summaryB[k];
      return (Number.isFinite(Number(va)) || Number.isFinite(Number(vb)));
    }).sort();

    let html = `<div class="viewer-compare-table-wrap"><table class="viewer-compare-table">
      <thead><tr><th>Metric</th><th>Layout A</th><th>Layout B</th><th>Diff</th></tr></thead><tbody>`;

    for (const key of metricKeys) {
      const va = Number(summaryA[key] ?? 0);
      const vb = Number(summaryB[key] ?? 0);
      const diff = comparisonDiffArrow(va, vb);
      html += `<tr>
        <td class="viewer-compare-metric-label">${escapeHtml(key)}</td>
        <td>${va.toFixed(3)}</td>
        <td>${vb.toFixed(3)}</td>
        <td>${diff}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;

    // PNG thumbnails — scene.glb sits next to preview.png in each iteration directory
    const toPreviewUrl = (glbUrl: string) => glbUrl.replace(/%2F[^%]*\.glb$/i, "%2Fpreview.png").replace(/\/[^/]*\.glb$/i, "/preview.png");
    const imgA = a.final_scene?.glb_url ? toPreviewUrl(a.final_scene.glb_url) : "";
    const imgB = b.final_scene?.glb_url ? toPreviewUrl(b.final_scene.glb_url) : "";
    html += `<div class="viewer-compare-images">
      <div class="viewer-compare-col">
        <div class="viewer-compare-thumb-label">${escapeHtml(compactUiLabel(a.layout_path))}</div>
        ${imgA ? `<img class="viewer-compare-thumb" src="${escapeHtml(imgA)}" alt="Layout A" />` : "<div class='viewer-compare-no-img'>No preview</div>"}
      </div>
      <div class="viewer-compare-col">
        <div class="viewer-compare-thumb-label">${escapeHtml(compactUiLabel(b.layout_path))}</div>
        ${imgB ? `<img class="viewer-compare-thumb" src="${escapeHtml(imgB)}" alt="Layout B" />` : "<div class='viewer-compare-no-img'>No preview</div>"}
      </div>
    </div>`;

    compareResultsEl.innerHTML = html;
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
    presetsGridEl.innerHTML = BUILTIN_PRESETS.map(preset => `
      <button class="viewer-preset-card" data-preset-id="${escapeHtml(preset.id)}" type="button">
        <div class="viewer-preset-name">${escapeHtml(preset.name)}</div>
        <div class="viewer-preset-desc">${escapeHtml(preset.description)}</div>
      </button>
    `).join("");
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
      if (!response.ok) {
        const errPayload = (await response.json()) as { error?: string };
        throw new Error(errPayload.error ?? "Scene generation failed.");
      }
      const result = (await response.json()) as { layout_path?: string };
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

  settingsToggleEl.addEventListener("click", () => {
    if (settingsOpen) {
      setSettingsOpen(false);
    } else {
      closeAllSlidePanels();
      setSettingsOpen(true);
    }
  }, { signal });
  settingsCloseEl.addEventListener("click", () => setSettingsOpen(false), { signal });

  evaluateToggleEl.addEventListener("click", () => setEvaluateOpen(!evaluateOpen), { signal });
  evaluateCloseEl.addEventListener("click", () => setEvaluateOpen(false), { signal });
  evaluateRunEl.addEventListener("click", () => void runEvaluation(), { signal });

  compareToggleEl.addEventListener("click", () => setCompareOpen(!compareOpen), { signal });
  compareCloseEl.addEventListener("click", () => setCompareOpen(false), { signal });
  compareSelectAEl.addEventListener("change", () => void runComparison(), { signal });
  compareSelectBEl.addEventListener("change", () => void runComparison(), { signal });

  presetsToggleEl.addEventListener("click", () => setPresetsOpen(!presetsOpen), { signal });
  presetsCloseEl.addEventListener("click", () => setPresetsOpen(false), { signal });
  presetsGridEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>("[data-preset-id]");
    if (card?.dataset.presetId) {
      void applyPreset(card.dataset.presetId);
    }
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
      currentAvatarPosition.set(worldX, currentAvatarPosition.y, worldZ);
      syncCameraRig();
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
      if (layoutOverlayToggleEl.checked) {
        buildLayoutOverlay();
        flashStatus("Layout overlay enabled");
      } else {
        clearLayoutOverlay();
        flashStatus("Layout overlay disabled");
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
    if (controls.isLocked) {
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
    renderer.render(scene, camera);
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
    clearLayoutOverlay();
    renderer.dispose();
    minimapRenderer.dispose();
  };
}

export { mountViewer };
