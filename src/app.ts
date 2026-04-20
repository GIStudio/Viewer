import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
} from "./viewer-types";
import { PER_LANE_COLORS } from "./viewer-types";

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

type HitDescriptor =
  | {
      kind: "instance";
      nodeName: string;
      instanceId: string;
      instanceInfo: InstanceInfo;
      assetDescription?: AssetDescription;
      hitPoint?: THREE.Vector3;
    }
  | {
      kind: "static";
      nodeName: string;
      staticDescription: StaticObjectDescription;
      hitPoint?: THREE.Vector3;
    }
  | {
      kind: "generic";
      nodeName: string;
      hitPoint?: THREE.Vector3;
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

// Enhanced export colors for top-down view
const EXPORT_COLORS = {
  carriageway: "#424a57",
  drive_lane: "#424a57",
  bus_lane: "#b7483a",
  bike_lane: "#39875a",
  parking_lane: "#a68256",
  median: "#6e7a5f",
  nearroad_buffer: "#c4c4c4",
  nearroad_furnishing: "#b5a28a",
  clear_sidewalk: "#d4d0c8",
  sidewalk: "#d4d0c8",
  frontage_reserve: "#b7d4e6",
  grass_belt: "#8cb369",
  shared_street: "#c9b896",
  colored_pavement: "#e8dcc8",
  zebra_stripe: "#ffffff",
  zebra_stripe_dark: "#424a57",
};

function exportTopDownMapEnhanced(scene: THREE.Scene, root: THREE.Object3D | null): void {
  if (!root) {
    alert("No scene loaded. Please load a layout first.");
    return;
  }
  const bbox = new THREE.Box3().setFromObject(root);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.z);
  if (!isFinite(maxExtent) || maxExtent <= 0) {
    alert("Scene bounds are too small to export.");
    return;
  }

  const padding = maxExtent * 0.15;
  const viewSize = maxExtent + padding * 2;

  const camera = new THREE.OrthographicCamera(
    -viewSize / 2,
    viewSize / 2,
    viewSize / 2,
    -viewSize / 2,
    0.1,
    5000,
  );
  camera.position.set(center.x, center.y + size.y * 0.5 + viewSize * 1.2, center.z);
  camera.lookAt(center.x, center.y, center.z);
  camera.updateProjectionMatrix();

  const resolution = 4096;
  const exportRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  exportRenderer.setSize(resolution, resolution);
  exportRenderer.setPixelRatio(1);
  exportRenderer.outputColorSpace = THREE.SRGBColorSpace;
  exportRenderer.shadowMap.enabled = false;
  exportRenderer.toneMapping = THREE.NoToneMapping;
  const bgColor = scene.background instanceof THREE.Color ? scene.background : new THREE.Color("#f7f6f3");
  exportRenderer.setClearColor(bgColor);
  exportRenderer.clear();
  exportRenderer.render(scene, camera);

  // Get the rendered canvas
  const canvas = exportRenderer.domElement;
  const ctx = canvas.getContext("2d")!;

  // Calculate scale
  const pixelsPerUnit = resolution / viewSize;
  const scaleBarLength = Math.pow(10, Math.floor(Math.log10(maxExtent))) / 4;
  const scaleBarPixels = scaleBarLength * pixelsPerUnit;

  // Add legend in bottom-right corner
  const legendWidth = 280;
  const legendHeight = 220;
  const legendX = resolution - legendWidth - 40;
  const legendY = resolution - legendHeight - 40;

  // Draw legend background
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 8);
  ctx.fill();
  ctx.stroke();

  // Legend title
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("图例 Legend", legendX + 15, legendY + 28);

  // Legend items
  const legendItems = [
    { color: EXPORT_COLORS.drive_lane, label: "机动车道 Drive Lane" },
    { color: EXPORT_COLORS.clear_sidewalk, label: "人行道 Sidewalk" },
    { color: EXPORT_COLORS.bike_lane, label: "自行车道 Bike Lane" },
    { color: EXPORT_COLORS.bus_lane, label: "公交专用道 Bus Lane" },
    { color: EXPORT_COLORS.median, label: "中央分隔带 Median" },
    { color: EXPORT_COLORS.grass_belt, label: "绿化带 Green Belt" },
    { color: EXPORT_COLORS.nearroad_furnishing, label: "路缘设施带 Furnishing" },
  ];

  let legendItemY = legendY + 55;
  for (const item of legendItems) {
    // Color box
    ctx.fillStyle = item.color;
    ctx.fillRect(legendX + 15, legendItemY - 12, 20, 14);
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX + 15, legendItemY - 12, 20, 14);
    // Label
    ctx.fillStyle = "#333333";
    ctx.font = "12px sans-serif";
    ctx.fillText(item.label, legendX + 45, legendItemY);
    legendItemY += 22;
  }

  // Draw zebra crossing pattern (example pattern)
  ctx.fillStyle = "#333333";
  ctx.font = "12px sans-serif";
  ctx.fillText("斑马线 Zebra Crossing", legendX + 15, legendItemY + 5);
  const zebraY = legendItemY + 15;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? EXPORT_COLORS.zebra_stripe_dark : EXPORT_COLORS.zebra_stripe;
    ctx.fillRect(legendX + 15 + i * 5, zebraY, 5, 15);
  }

  // Draw scale bar
  const scaleBarX = 40;
  const scaleBarY = resolution - 50;

  // Scale bar background
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(scaleBarX - 10, scaleBarY - 35, 180, 45, 6);
  ctx.fill();
  ctx.stroke();

  // Scale bar line
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(scaleBarX, scaleBarY);
  ctx.lineTo(scaleBarX + scaleBarPixels, scaleBarY);
  ctx.stroke();

  // End ticks
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(scaleBarX, scaleBarY - 8);
  ctx.lineTo(scaleBarX, scaleBarY + 8);
  ctx.moveTo(scaleBarX + scaleBarPixels, scaleBarY - 8);
  ctx.lineTo(scaleBarX + scaleBarPixels, scaleBarY + 8);
  ctx.stroke();

  // Scale label
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  const scaleLabel = scaleBarLength >= 100 ? `${scaleBarLength.toFixed(0)}m` : `${scaleBarLength.toFixed(0)}m`;
  ctx.fillText(scaleLabel, scaleBarX + scaleBarPixels / 2, scaleBarY - 15);
  ctx.textAlign = "left";

  // North arrow in top-left
  const northX = 60;
  const northY = 60;
  const arrowSize = 30;

  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(northX, northY, 35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // North arrow
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.moveTo(northX, northY - arrowSize);
  ctx.lineTo(northX - arrowSize * 0.4, northY + arrowSize * 0.5);
  ctx.lineTo(northX, northY + arrowSize * 0.2);
  ctx.lineTo(northX + arrowSize * 0.4, northY + arrowSize * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", northX, northY - arrowSize - 8);
  ctx.textAlign = "left";

  canvas.toBlob((blob) => {
    if (!blob) {
      alert("Failed to generate image.");
      exportRenderer.dispose();
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.download = `road_scene_topdown_${timestamp}.png`;
    a.click();
    URL.revokeObjectURL(url);
    exportRenderer.dispose();
  }, "image/png");
}

function exportTopDownSvg(scene: THREE.Scene, root: THREE.Object3D | null): void {
  if (!root) {
    alert("No scene loaded. Please load a layout first.");
    return;
  }
  if (!currentManifest?.layout_overlay) {
    alert("No layout overlay data available. Please load a scene with layout data.");
    return;
  }

  const bbox = new THREE.Box3().setFromObject(root);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.z);
  if (!isFinite(maxExtent) || maxExtent <= 0) {
    alert("Scene bounds are too small to export.");
    return;
  }

  const overlay = currentManifest.layout_overlay;

  // Calculate scale: 1 unit in scene = pixels in SVG
  const padding = maxExtent * 0.15;
  const viewSize = maxExtent + padding * 2;
  const pixelsPerUnit = 2048 / viewSize;
  const width = 2048;
  const height = 2048;

  // Get the full road extent from scene bounding box
  const roadMinX = center.x - size.x / 2;
  const roadMaxX = center.x + size.x / 2;
  const roadMinZ = center.z - size.z / 2;
  const roadMaxZ = center.z + size.z / 2;

  // Coordinate conversion: scene to SVG
  // Scene: X is along road, Z is lateral, Y is up
  // SVG: X is horizontal, Y is vertical
  const toSvgX = (sceneX: number) => (sceneX - center.x + viewSize / 2) * pixelsPerUnit;
  const toSvgY = (sceneZ: number) => (viewSize / 2 - (sceneZ - center.z)) * pixelsPerUnit;
  const toSvgSize = (s: number) => s * pixelsPerUnit;

  // Collect junction and crosswalk data from manifest summary
  const summary = (currentManifest.summary ?? {}) as Record<string, unknown>;
  const osmGeom = (summary.osm_geometry ?? {}) as Record<string, unknown>;
  const junctions = (osmGeom.junction_geometries ?? []) as Array<Record<string, unknown>>;
  const carriagewayRings = (osmGeom.carriageway_rings ?? []) as number[][][];
  const sidewalkRings = (osmGeom.sidewalk_rings ?? []) as number[][][];

  // Build SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title>Road Scene Top-Down Map</title>
  <defs>
    <style>
      .road { fill: ${EXPORT_COLORS.drive_lane}; stroke: #333; stroke-width: 1; }
      .sidewalk { fill: ${EXPORT_COLORS.clear_sidewalk}; stroke: #999; stroke-width: 0.5; }
      .bikelane { fill: ${EXPORT_COLORS.bike_lane}; stroke: #267a4a; stroke-width: 0.5; }
      .buslane { fill: ${EXPORT_COLORS.bus_lane}; stroke: #8a2a1a; stroke-width: 0.5; }
      .median { fill: ${EXPORT_COLORS.median}; stroke: #555; stroke-width: 0.5; }
      .furnishing { fill: ${EXPORT_COLORS.nearroad_furnishing}; stroke: #8a7050; stroke-width: 0.5; }
      .greenzone { fill: ${EXPORT_COLORS.grass_belt}; stroke: #6a9050; stroke-width: 0.5; }
      .parking { fill: ${EXPORT_COLORS.parking_lane}; stroke: #7a6240; stroke-width: 0.5; }
      .buffer { fill: ${EXPORT_COLORS.nearroad_buffer}; stroke: #888; stroke-width: 0.5; }
      .frontage { fill: ${EXPORT_COLORS.frontage_reserve}; stroke: #8ab4c6; stroke-width: 0.5; }
      .shared { fill: ${EXPORT_COLORS.shared_street}; stroke: #a99876; stroke-width: 0.5; }
      .building { fill: #b8b8c8; stroke: #808090; stroke-width: 1; }
      .tree { fill: #5a9a4a; stroke: #3a7a3a; stroke-width: 1; }
      .lamp { fill: #f0d040; stroke: #b0a020; stroke-width: 0.5; }
      .bench { fill: #8a6040; stroke: #5a4030; stroke-width: 0.5; }
      .crosswalk { fill: url(#zebraPattern); }
      .junction { fill: ${EXPORT_COLORS.drive_lane}; stroke: #333; stroke-width: 1; opacity: 0.9; }
      .legend-bg { fill: rgba(255,255,255,0.95); stroke: #ccc; stroke-width: 1; }
      .legend-title { font: bold 16px sans-serif; fill: #1a1a1a; }
      .legend-item { font: 12px sans-serif; fill: #333; }
      .scalebar { stroke: #1a1a1a; stroke-width: 3; fill: none; }
      .scale-tick { stroke: #1a1a1a; stroke-width: 2; }
      .scale-label { font: bold 14px sans-serif; fill: #1a1a1a; text-anchor: middle; }
      .north-arrow { fill: #1a1a1a; }
      .north-label { font: bold 14px sans-serif; fill: #1a1a1a; text-anchor: middle; }
    </style>
    <pattern id="zebraPattern" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="5" height="10" fill="${EXPORT_COLORS.zebra_stripe_dark}"/>
      <rect x="5" y="0" width="5" height="10" fill="${EXPORT_COLORS.zebra_stripe}"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f7f6f3"/>`;

  // 1. Draw road bands - only if no carriageway_rings available
  // Use carriagewayRings from osm_geometry for accurate polygon shapes
  const hasCarriagewayRings = carriagewayRings.length > 0;

  if (!hasCarriagewayRings) {
    // Fallback: draw bands as rectangles (less accurate)
    const bandKindToClass: Record<string, string> = {
      carriageway: "road",
      drive_lane: "road",
      bus_lane: "buslane",
      bike_lane: "bikelane",
      parking_lane: "parking",
      median: "median",
      nearroad_buffer: "buffer",
      nearroad_furnishing: "furnishing",
      clear_sidewalk: "sidewalk",
      sidewalk: "sidewalk",
      frontage_reserve: "frontage",
      grass_belt: "greenzone",
      shared_street_surface: "shared",
      colored_pavement: "sidewalk",
    };

    for (const band of overlay.bands) {
      if (!band.width_m || !Number.isFinite(band.width_m)) continue;
      const x1 = toSvgX(roadMinX);
      const x2 = toSvgX(roadMaxX);
      const y = toSvgY(band.z_center_m);
      const h = toSvgSize(band.width_m);
      const cssClass = bandKindToClass[band.kind] || "road";
      const bandWidth = x2 - x1;
      svg += `\n  <rect x="${x1}" y="${y - h/2}" width="${bandWidth}" height="${h}" class="${cssClass}"/>`;
    }
  }

  // 1.5. Draw junctions from manifest data
  // Junction carriageway cores
  for (const junction of junctions) {
    const coreRings = (junction.carriageway_core_rings ?? []) as number[][][];
    for (const ring of coreRings) {
      if (ring.length < 3) continue;
      const points = ring.map(p => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(" ");
      svg += `\n  <polygon points="${points}" class="junction"/>`;
    }
    // Crosswalk patches from junction
    const crosswalkPatches = (junction.crosswalk_patches ?? []) as Array<Record<string, unknown>>;
    for (const patch of crosswalkPatches) {
      const rings = (patch.rings ?? []) as number[][][];
      for (const ring of rings) {
        if (ring.length < 3) continue;
        const points = ring.map(p => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(" ");
        svg += `\n  <polygon points="${points}" class="crosswalk"/>`;
      }
    }
    // Sidewalk corner patches
    const sidewalkPatches = (junction.sidewalk_corner_patches ?? []) as Array<Record<string, unknown>>;
    for (const patch of sidewalkPatches) {
      const rings = (patch.rings ?? []) as number[][][];
      for (const ring of rings) {
        if (ring.length < 3) continue;
        const points = ring.map(p => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(" ");
        svg += `\n  <polygon points="${points}" class="sidewalk" opacity="0.8"/>`;
      }
    }
    // Nearroad corner patches (furnishing)
    const nearroadPatches = (junction.nearroad_corner_patches ?? []) as Array<Record<string, unknown>>;
    for (const patch of nearroadPatches) {
      const rings = (patch.rings ?? []) as number[][][];
      for (const ring of rings) {
        if (ring.length < 3) continue;
        const points = ring.map(p => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(" ");
        svg += `\n  <polygon points="${points}" class="furnishing" opacity="0.8"/>`;
      }
    }
    // Frontage corner patches
    const frontagePatches = (junction.frontage_corner_patches ?? []) as Array<Record<string, unknown>>;
    for (const patch of frontagePatches) {
      const rings = (patch.rings ?? []) as number[][][];
      for (const ring of rings) {
        if (ring.length < 3) continue;
        const points = ring.map(p => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(" ");
        svg += `\n  <polygon points="${points}" class="frontage" opacity="0.8"/>`;
      }
    }
    // Check generation_mode for debugging/visibility toggle
    const generationMode = junction.generation_mode as string | undefined;
    if (generationMode) {
      console.debug(`[Junction ${junction.junction_id}] generation_mode: ${generationMode}`);
    }
  }

  // 1.6. Draw carriageway rings from OSM geometry (non-junction roads)
  for (const ring of carriagewayRings) {
    if (ring.length < 3) continue;
    const points = ring.map(p => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(" ");
    svg += `\n  <polygon points="${points}" class="road"/>`;
  }

  // 1.7. Draw sidewalk rings from OSM geometry
  for (const ring of sidewalkRings) {
    if (ring.length < 3) continue;
    const points = ring.map(p => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(" ");
    svg += `\n  <polygon points="${points}" class="sidewalk"/>`;
  }

  // 2. Draw building footprints
  for (const fp of overlay.building_footprints) {
    const pts = fp.polygon_xz;
    if (!Array.isArray(pts) || pts.length < 3) continue;
    const points = pts.map(p => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(" ");
    svg += `\n  <polygon points="${points}" class="building"/>`;
  }

  // 3. Draw furniture instances
  const instances = currentManifest.instances;
  if (instances) {
    const categoryToClass: Record<string, string> = {
      tree: "tree",
      lamp: "lamp",
      bench: "bench",
      trash: "bench",
      bollard: "lamp",
      bus_stop: "lamp",
    };

    for (const [id, info] of Object.entries(instances)) {
      const instanceInfo = info as InstanceInfo;
      if (!instanceInfo.position_xyz) continue;
      const x = toSvgX(instanceInfo.position_xyz[0]);
      const y = toSvgY(instanceInfo.position_xyz[2]);
      const category = String(instanceInfo.category || "").toLowerCase();
      const cssClass = categoryToClass[category] || "lamp";
      // Draw as small circle for furniture
      svg += `\n  <circle cx="${x}" cy="${y}" r="4" class="${cssClass}"/>`;
    }
  }

  // 4. Draw legend
  const legendX = width - 300;
  const legendY = height - 280;
  const legendW = 280;
  const legendH = 260;

  svg += `
  <!-- Legend -->
  <rect x="${legendX}" y="${legendY}" width="${legendW}" height="${legendH}" rx="8" class="legend-bg"/>
  <text x="${legendX + 15}" y="${legendY + 25}" class="legend-title">图例 Legend</text>`;

  const legendItems = [
    { class: "road", label: "机动车道 Drive Lane" },
    { class: "sidewalk", label: "人行道 Sidewalk" },
    { class: "bikelane", label: "自行车道 Bike Lane" },
    { class: "buslane", label: "公交专用道 Bus Lane" },
    { class: "median", label: "中央分隔带 Median" },
    { class: "greenzone", label: "绿化带 Green Belt" },
    { class: "furnishing", label: "路缘设施带 Furnishing" },
    { class: "parking", label: "停车带 Parking" },
  ];

  let itemY = legendY + 55;
  for (const item of legendItems) {
    svg += `
  <rect x="${legendX + 15}" y="${itemY - 12}" width="20" height="14" class="${item.class}" stroke="#999" stroke-width="0.5"/>
  <text x="${legendX + 45}" y="${itemY}" class="legend-item">${item.label}</text>`;
    itemY += 24;
  }

  // Zebra crossing example
  svg += `
  <text x="${legendX + 15}" y="${itemY + 5}" class="legend-item">斑马线 Zebra Crossing</text>
  <rect x="${legendX + 15}" y="${itemY + 15}" width="60" height="15" class="crosswalk" rx="2"/>`;

  // Scale bar
  const scaleBarX = 50;
  const scaleBarY = height - 70;
  const scaleBarLength = Math.pow(10, Math.floor(Math.log10(maxExtent))) / 4;
  const scaleBarPixels = scaleBarLength * pixelsPerUnit;

  svg += `
  <!-- Scale Bar -->
  <rect x="${scaleBarX - 10}" y="${scaleBarY - 50}" width="200" height="55" rx="6" class="legend-bg"/>
  <line x1="${scaleBarX}" y1="${scaleBarY}" x2="${scaleBarX + scaleBarPixels}" y2="${scaleBarY}" class="scalebar"/>
  <line x1="${scaleBarX}" y1="${scaleBarY - 10}" x2="${scaleBarX}" y2="${scaleBarY + 10}" class="scale-tick"/>
  <line x1="${scaleBarX + scaleBarPixels}" y1="${scaleBarY - 10}" x2="${scaleBarX + scaleBarPixels}" y2="${scaleBarY + 10}" class="scale-tick"/>
  <text x="${scaleBarX + scaleBarPixels / 2}" y="${scaleBarY - 18}" class="scale-label">${scaleBarLength.toFixed(0)}m</text>`;

  // North arrow
  const northX = 80;
  const northY = 80;
  const arrowSize = 25;

  svg += `
  <!-- North Arrow -->
  <circle cx="${northX}" cy="${northY}" r="45" class="legend-bg"/>
  <polygon points="${northX},${northY - arrowSize} ${northX - arrowSize * 0.4},${northY + arrowSize * 0.5} ${northX},${northY + arrowSize * 0.2} ${northX + arrowSize * 0.4},${northY + arrowSize * 0.5}" class="north-arrow"/>
  <text x="${northX}" y="${northY - arrowSize - 12}" class="north-label">N</text>`;

  svg += "\n</svg>";

  // Download SVG
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `road_scene_topdown_${timestamp}.svg`;
  a.click();
  URL.revokeObjectURL(url);
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
  const text = await response.text();
  if (!text) {
    throw new Error("Server returned empty response");
  }
  let payload: ViewerManifest | { error?: string };
  try {
    payload = JSON.parse(text) as ViewerManifest | { error?: string };
  } catch {
    throw new Error(`Invalid JSON: ${text.substring(0, 100)}`);
  }
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
  const text = await response.text();
  if (!text) {
    return [];
  }
  let payload: RecentLayoutsPayload;
  try {
    payload = JSON.parse(text) as RecentLayoutsPayload;
  } catch {
    throw new Error(`Invalid JSON: ${text.substring(0, 100)}`);
  }
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
      html: composeStaticInfoHtml(descriptor.nodeName, descriptor.staticDescription, descriptor.hitPoint, manifest),
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
      <div class="scene-page-topbar viewer-header-compact">
        <div class="viewer-header-left">
          <button id="viewer-menu-toggle" class="viewer-hamburger" type="button" aria-label="Menu" aria-expanded="false">☰</button>
          <div class="viewer-header-brand">
            <div class="scene-page-kicker viewer-header-kicker">Viewer</div>
            <h1 class="scene-page-title viewer-header-title">3D Road Viewer</h1>
          </div>
        </div>
        <div class="viewer-header-controls">
          <select id="layout-select" class="viewer-select viewer-select-inline" title="Recent Result"></select>
          <!-- 原始场景选择器（隐藏，保持向后兼容） -->
          <select id="scene-select" class="viewer-select viewer-select-inline" title="Scene" style="display: none;"></select>
          <!-- 场景对比选择器（隐藏，逻辑已迁移到 Compare 面板） -->
          <div id="scene-compare-controls" class="scene-compare-controls" style="display: none;">
            <div class="scene-compare-group">
              <select id="layout-a-select" class="viewer-select viewer-select-inline viewer-select-layout" title="Layout A"></select>
              <select id="scene-a-select" class="viewer-select viewer-select-inline viewer-select-scene" title="Scene A"></select>
            </div>
            <div class="scene-compare-group">
              <select id="layout-b-select" class="viewer-select viewer-select-inline viewer-select-layout" title="Layout B"></select>
              <select id="scene-b-select" class="viewer-select viewer-select-inline viewer-select-scene" title="Scene B"></select>
            </div>
            <button id="reset-scene-mode" class="viewer-btn-reset" type="button" title="Clear Scene B">✕</button>
          </div>
          <!-- 雷达图容器（隐藏，逻辑已迁移到 Compare 面板） -->
          <div id="scene-radar-container" style="display: none;">
            <button id="close-scene-radar" class="viewer-settings-close" type="button">x</button>
            <canvas id="scene-radar-canvas-a"></canvas>
            <canvas id="scene-radar-canvas-b"></canvas>
            <span id="scene-a-label"></span>
            <span id="scene-b-label"></span>
          </div>
          <button id="viewer-compare-toggle" class="viewer-btn-scene-compare" type="button" title="Open comparison panel">⚖️ Compare</button>
        </div>
        <div class="viewer-header-actions">
          <button id="viewer-settings-toggle" class="viewer-settings-toggle" type="button" aria-expanded="false">Settings</button>
        </div>
        <div id="viewer-menu-dropdown" class="viewer-menu-dropdown" hidden>
          <div class="viewer-menu-help">Click to capture mouse · WASD move · Shift sprint · Esc unlock · R reset · P panel · Ctrl/Cmd+C copy target</div>
          <div class="viewer-menu-buttons">
            <button id="viewer-scene-graph-link" class="viewer-nav-button viewer-menu-button" type="button">Annotation</button>
            <button id="viewer-asset-editor-link" class="viewer-nav-button viewer-menu-button" type="button">Asset Editor</button>
            <button id="viewer-junction-editor-link" class="viewer-nav-button viewer-menu-button" type="button">Junction Editor</button>
            <button id="viewer-compare-toggle" class="viewer-nav-button viewer-menu-button" type="button">Compare</button>
            <button id="viewer-presets-toggle" class="viewer-nav-button viewer-menu-button" type="button">Presets</button>
            <button id="viewer-evaluate-toggle" class="viewer-nav-button viewer-menu-button" type="button">Evaluate</button>
            <button id="viewer-history-analysis-toggle" class="viewer-nav-button viewer-menu-button" type="button">📊 History</button>
            <button id="viewer-floating-lane-toggle" class="viewer-nav-button viewer-menu-button" type="button">Floating Lane</button>
            <button id="viewer-export-topdown-map" class="viewer-nav-button viewer-menu-button" type="button">Export PNG</button>
            <button id="viewer-export-topdown-svg" class="viewer-nav-button viewer-menu-button" type="button">Export SVG</button>
          </div>
        </div>
      </div>
      <div id="viewer-canvas" class="viewer-canvas"></div>
      <!-- 双场景对比雷达图容器 -->
      <div id="scene-radar-container" class="scene-radar-container" hidden>
        <div class="scene-radar-header">
          <div class="scene-radar-title">Metrics Comparison</div>
          <button id="close-scene-radar" class="viewer-btn-icon" type="button" title="Close radar view">✕</button>
        </div>
        <div class="scene-radar-body">
          <div class="scene-radar-panel">
            <div class="scene-radar-label" id="scene-a-label">Scene A</div>
            <canvas id="scene-radar-canvas-a" class="scene-radar-canvas"></canvas>
          </div>
          <div class="scene-radar-divider"></div>
          <div class="scene-radar-panel">
            <div class="scene-radar-label" id="scene-b-label">Scene B</div>
            <canvas id="scene-radar-canvas-b" class="scene-radar-canvas"></canvas>
          </div>
        </div>
      </div>
      <button id="viewer-exit-compare3d" class="viewer-exit-compare3d" type="button" hidden>Exit Split View</button>
      <div id="viewer-crosshair" class="viewer-crosshair" hidden></div>
      <div id="viewer-info-card" class="viewer-info-card" hidden></div>
      <div id="viewer-minimap" class="viewer-minimap">
        <div class="viewer-minimap-title">Scene Map</div>
        <div id="viewer-minimap-canvas" class="viewer-minimap-canvas"></div>
        <canvas id="viewer-minimap-overlay" class="viewer-minimap-overlay"></canvas>
      </div>
      <canvas id="viewer-axis-hud" class="viewer-axis-hud"></canvas>
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
  
  // 场景对比相关元素
  const sceneCompareControls = requireElement<HTMLElement>(root, "#scene-compare-controls");
  const layoutASelectEl = requireElement<HTMLSelectElement>(root, "#layout-a-select");
  const sceneASelectEl = requireElement<HTMLSelectElement>(root, "#scene-a-select");
  const layoutBSelectEl = requireElement<HTMLSelectElement>(root, "#layout-b-select");
  const sceneBSelectEl = requireElement<HTMLSelectElement>(root, "#scene-b-select");
  const resetSceneModeBtn = requireElement<HTMLButtonElement>(root, "#reset-scene-mode");
  const sceneRadarContainer = requireElement<HTMLElement>(root, "#scene-radar-container");
  const closeSceneRadarBtn = requireElement<HTMLButtonElement>(root, "#close-scene-radar");
  const sceneRadarCanvasA = requireElement<HTMLCanvasElement>(root, "#scene-radar-canvas-a");
  const sceneRadarCanvasB = requireElement<HTMLCanvasElement>(root, "#scene-radar-canvas-b");
  const sceneALabel = requireElement<HTMLElement>(root, "#scene-a-label");
  const sceneBLabel = requireElement<HTMLElement>(root, "#scene-b-label");
  
  const menuToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-menu-toggle");
  const menuDropdownEl = requireElement<HTMLElement>(root, "#viewer-menu-dropdown");
  const settingsToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-settings-toggle");
  const settingsPanelEl = requireElement<HTMLElement>(root, "#viewer-settings-panel");
  const settingsCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-settings-close");
  const infoCardEl = requireElement<HTMLElement>(root, "#viewer-info-card");
  const crosshairEl = requireElement<HTMLElement>(root, "#viewer-crosshair");
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
    historyAnalysisOpen = nextOpen;
    historyAnalysisPanelEl.dataset.open = String(nextOpen);
    if (nextOpen) {
      loadAndRenderHistory();
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

  const loadAndRenderHistory = async () => {
    try {
      const recentLayouts = await loadRecentLayouts(50);
      const scenesWithMetrics: SceneHistoryEntry[] = [];

      for (const layout of recentLayouts) {
        try {
          const manifest = await loadManifest(layout.layout_path);
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

  const exportTopdownMapEl = requireElement<HTMLButtonElement>(root, "#viewer-export-topdown-map");
  const exportTopdownSvgEl = requireElement<HTMLButtonElement>(root, "#viewer-export-topdown-svg");
  const presetsToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-presets-toggle");
  const presetsPanelEl = requireElement<HTMLElement>(root, "#viewer-presets-panel");
  const presetsCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-presets-close");
  const presetsGridEl = requireElement<HTMLElement>(root, "#viewer-presets-grid");

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
  let evaluateOpen = false;
  let compareOpen = false;
  let presetsOpen = false;
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

  function updateCanvasSlideOpenState(): void {
    const anyOpen = evaluateOpen || compareOpen || presetsOpen;
    canvasHost.dataset.slideOpen = anyOpen ? "true" : "false";
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
      floatingLaneConfig.enabled = false;
      clearFloatingLaneOverlay();
    }
    updateCanvasSlideOpenState();
  }

  function setEvaluateOpen(nextOpen: boolean): void {
    if (nextOpen) closeAllSlidePanels();
    evaluateOpen = nextOpen;
    evaluatePanelEl.dataset.open = nextOpen ? "true" : "false";
    updateCanvasSlideOpenState();
  }

  function setCompareOpen(nextOpen: boolean): void {
    if (nextOpen) {
      closeAllSlidePanels();
      populateCompareSelectors();
    }
    compareOpen = nextOpen;
    comparePanelEl.dataset.open = nextOpen ? "true" : "false";
    updateCanvasSlideOpenState();
  }

  function setPresetsOpen(nextOpen: boolean): void {
    if (nextOpen) {
      closeAllSlidePanels();
      populatePresetsGrid();
    }
    presetsOpen = nextOpen;
    presetsPanelEl.dataset.open = nextOpen ? "true" : "false";
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

    const height = floatingLaneConfig.height;

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
          opacity: floatingLaneConfig.opacity * 0.7,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, height, 0);
        mesh.userData.isFloatingLane = true;
        mesh.userData.overlayType = "road";
        scene.add(mesh);
        floatingLaneObjects.push(mesh);

        // Add edge lines for road polygon
        if (floatingLaneConfig.showEdgeLines) {
          const edgeMaterial = new THREE.LineBasicMaterial({
            color: FLOATING_COLORS.carriageway,
            transparent: true,
            opacity: floatingLaneConfig.opacity * 0.9,
          });
          const points: THREE.Vector3[] = [];
          for (const point of ring) {
            points.push(new THREE.Vector3(point[0], height, point[1]));
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
          opacity: floatingLaneConfig.opacity * 0.8,
        });
        const points: THREE.Vector3[] = [];
        for (const point of ring) {
          points.push(new THREE.Vector3(point[0], height, point[1]));
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
          opacity: floatingLaneConfig.opacity * 0.75,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, height, 0);
        mesh.userData.isFloatingLane = true;
        mesh.userData.overlayType = "junction";
        scene.add(mesh);
        floatingLaneObjects.push(mesh);

        // Edge lines for junction
        if (floatingLaneConfig.showEdgeLines) {
          const edgeMaterial = new THREE.LineBasicMaterial({
            color: FLOATING_COLORS.carriageway,
            transparent: true,
            opacity: floatingLaneConfig.opacity * 0.9,
          });
          const points: THREE.Vector3[] = [];
          for (const point of ring) {
            points.push(new THREE.Vector3(point[0], height, point[1]));
          }
          points.push(points[0].clone());
          const edgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
          const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
          edgeLine.userData.isFloatingLane = true;
          scene.add(edgeLine);
          floatingLaneObjects.push(edgeLine);
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
              opacity: floatingLaneConfig.opacity * (collection.kind === "merged" ? 0.35 : 0.28),
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
                opacity: floatingLaneConfig.opacity * 0.75,
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
          ? Math.min(floatingLaneConfig.opacity * 1.5, 0.9)
          : floatingLaneConfig.opacity * (floatingLaneConfig.animated ? 0.7 + 0.3 * Math.sin(floatingLaneAnimTime * 3) : 1);

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
                addSolidEdgeLine(roadMinX, laneLeftZ, roadMaxX, laneLeftZ, isSelected ? 0xffffff : laneColor, baseOpacity * 0.9);
              }
              if (i === laneCount - 1) {
                // Outer boundary (last lane right edge) — solid
                addSolidEdgeLine(roadMinX, laneRightZ, roadMaxX, laneRightZ, isSelected ? 0xffffff : laneColor, baseOpacity * 0.9);
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
            addSolidEdgeLine(roadMinX, cwLeftZ, roadMinX, cwRightZ, isSelected ? 0xffffff : PER_LANE_COLORS[0], baseOpacity * 0.9);
            addSolidEdgeLine(roadMaxX, cwLeftZ, roadMaxX, cwRightZ, isSelected ? 0xffffff : PER_LANE_COLORS[0], baseOpacity * 0.9);
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
        mesh.position.set(0, height, 0);
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
            opacity: floatingLaneConfig.buildingOpacity * 1.2,
          });
          const points: THREE.Vector3[] = [];
          for (const point of pts) {
            points.push(new THREE.Vector3(point[0], height, point[1]));
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
        mesh.position.set(x, height, z);
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

    const panel = document.createElement("div");
    panel.id = panelId;
    panel.className = "floating-lane-panel";
    panel.innerHTML = `
      <div class="flp-header">
        <span class="flp-title">Scene Overlay</span>
        <button class="flp-close" id="flp-close-btn">&times;</button>
      </div>
      <div class="flp-content">
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-enabled" ${floatingLaneConfig.enabled ? "checked" : ""}>
          Enable Overlay
        </label>
        <div class="flp-slider-group">
          <label>Height: <span id="flp-height-val">${floatingLaneConfig.height.toFixed(1)}m</span></label>
          <input type="range" id="flp-height" min="0.1" max="3" step="0.1" value="${floatingLaneConfig.height}">
        </div>
        <div class="flp-slider-group">
          <label>Road Opacity: <span id="flp-opacity-val">${(floatingLaneConfig.opacity * 100).toFixed(0)}%</span></label>
          <input type="range" id="flp-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.opacity}">
        </div>
        <div class="flp-section">
          <label>Visible Elements:</label>
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
          <label>Building Opacity: <span id="flp-building-opacity-val">${(floatingLaneConfig.buildingOpacity * 100).toFixed(0)}%</span></label>
          <input type="range" id="flp-building-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.buildingOpacity}">
        </div>
        <div class="flp-slider-group" id="flp-feature-opacity-group">
          <label>Feature Opacity: <span id="flp-feature-opacity-val">${(floatingLaneConfig.featureOpacity * 100).toFixed(0)}%</span></label>
          <input type="range" id="flp-feature-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.featureOpacity}">
        </div>
        <div class="flp-section">
          <label>Visible Lane Types:</label>
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
          <label>Color Scheme:</label>
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
      </div>
    `;

    document.body.appendChild(panel);

    // Add event listeners
    document.getElementById("flp-close-btn")?.addEventListener("click", () => {
      floatingLaneConfig.enabled = false;
      clearFloatingLaneOverlay();
      panel.style.display = "none";
    });

    document.getElementById("flp-enabled")?.addEventListener("change", (e) => {
      floatingLaneConfig.enabled = (e.target as HTMLInputElement).checked;
      layoutOverlayToggleEl.checked = floatingLaneConfig.enabled;
      if (floatingLaneConfig.enabled) {
        buildFloatingLaneOverlay();
        panel.style.display = "block";
      } else {
        clearFloatingLaneOverlay();
        panel.style.display = "none";
      }
    });

    document.getElementById("flp-height")?.addEventListener("input", (e) => {
      floatingLaneConfig.height = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById("flp-height-val")!.textContent = `${floatingLaneConfig.height.toFixed(1)}m`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-opacity")?.addEventListener("input", (e) => {
      floatingLaneConfig.opacity = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById("flp-opacity-val")!.textContent = `${(floatingLaneConfig.opacity * 100).toFixed(0)}%`;
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
      document.getElementById("flp-building-opacity-val")!.textContent = `${(floatingLaneConfig.buildingOpacity * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-feature-opacity")?.addEventListener("input", (e) => {
      floatingLaneConfig.featureOpacity = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById("flp-feature-opacity-val")!.textContent = `${(floatingLaneConfig.featureOpacity * 100).toFixed(0)}%`;
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
      const panel = document.getElementById("floating-lane-panel");
      if (panel) panel.style.display = "block";
    } else {
      clearFloatingLaneOverlay();
      const panel = document.getElementById("floating-lane-panel");
      if (panel) panel.style.display = "none";
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
      lightingState.exposure = params.exposure;
      lightingState.keyLightIntensity = params.keyLightIntensity;
      lightingState.fillLightIntensity = params.fillLightIntensity;
      lightingState.warmth = params.warmth;
      lightingState.shadowStrength = params.shadowStrength;
    } else {
      const presetKey = currentManifest?.lighting_preset;
      if (presetKey && LIGHTING_PRESETS[presetKey]) {
        lightingState.preset = presetKey;
        Object.assign(lightingState, LIGHTING_PRESETS[presetKey]);
      }
    }
    syncLightingUi();
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
    
    // 填充场景对比选择器
    populateLayoutSelectors();
    
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
      floatingLaneConfig.enabled = false;
      clearFloatingLaneOverlay();
    }
    applyAudioProfile();
    
    // 填充对比选择器
    populateLayoutSelectors();
    // 默认设置Layout A
    layoutASelectEl.value = layoutPath;
    await loadLayoutAndPopulateScenes(layoutPath, sceneASelectEl, true);
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
    exportTopDownMapEnhanced(scene, currentRoot);
    menuDropdownEl.hidden = true;
    menuToggleEl.setAttribute("aria-expanded", "false");
  }, { signal });

  exportTopdownSvgEl.addEventListener("click", () => {
    exportTopDownSvg(scene, currentRoot);
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

  evaluateToggleEl.addEventListener("click", () => setEvaluateOpen(!evaluateOpen), { signal });
  evaluateCloseEl.addEventListener("click", () => setEvaluateOpen(false), { signal });
  evaluateRunEl.addEventListener("click", () => void runEvaluation(), { signal });

  compareToggleEl.addEventListener("click", () => setCompareOpen(!compareOpen), { signal });
  compareCloseEl.addEventListener("click", () => setCompareOpen(false), { signal });
  compareSelectAEl.addEventListener("change", () => void compareMode.runComparison(), { signal });
  compareSelectBEl.addEventListener("change", () => void compareMode.runComparison(), { signal });

  historyAnalysisToggleEl.addEventListener("click", () => setHistoryAnalysisOpen(!historyAnalysisOpen), { signal });
  historyAnalysisCloseEl.addEventListener("click", () => setHistoryAnalysisOpen(false), { signal });

  // ==================== 场景对比功能 ====================
  
  // 存储每个layout的manifest
  const layoutManifests = new Map<string, ViewerManifest>();
  
  const sceneCompareState: SceneCompareState = {
    mode: "single",
    sceneA: null,
    sceneB: null,
    metricsA: null,
    metricsB: null,
  };

  // 填充Layout选择器（使用已有的recentLayouts数据）
  function populateLayoutSelectors() {
    const layouts = Array.from(recentLayoutsByPath.values());
    
    // Layout A
    layoutASelectEl.innerHTML = "";
    layouts.forEach((layout) => {
      const option = document.createElement("option");
      option.value = layout.layout_path;
      option.textContent = compactUiLabel(layout.label, 35);
      option.title = layout.label;
      layoutASelectEl.appendChild(option);
    });
    layoutASelectEl.disabled = layouts.length === 0;
    
    // Layout B (带一个默认的空选项)
    layoutBSelectEl.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "— Clear —";
    layoutBSelectEl.appendChild(emptyOption);
    
    layouts.forEach((layout) => {
      const option = document.createElement("option");
      option.value = layout.layout_path;
      option.textContent = compactUiLabel(layout.label, 35);
      option.title = layout.label;
      layoutBSelectEl.appendChild(option);
    });
    layoutBSelectEl.disabled = layouts.length === 0;
    layoutBSelectEl.value = ""; // 默认清空
  }

  // 加载Layout的manifest并填充Scene选择器
  async function loadLayoutAndPopulateScenes(layoutPath: string, sceneSelectEl: HTMLSelectElement, isLayoutA: boolean) {
    try {
      let manifest = layoutManifests.get(layoutPath);
      if (!manifest) {
        manifest = await loadManifest(layoutPath);
        layoutManifests.set(layoutPath, manifest);
      }
      
      const scenes = makeSceneOptionsFromManifest(manifest, layoutPath);
      
      sceneSelectEl.innerHTML = "";
      scenes.forEach((scene) => {
        const option = document.createElement("option");
        option.value = scene.key;
        option.textContent = compactUiLabel(scene.label, 30);
        option.title = scene.label;
        sceneSelectEl.appendChild(option);
      });
      sceneSelectEl.disabled = scenes.length === 0;
      
    } catch (error) {
      console.error(`Failed to load manifest for ${layoutPath}:`, error);
      sceneSelectEl.innerHTML = "";
      sceneSelectEl.disabled = true;
    }
  }

  // Layout A 选择变化
  layoutASelectEl.addEventListener("change", async () => {
    const layoutPath = layoutASelectEl.value;
    if (layoutPath) {
      await loadLayoutAndPopulateScenes(layoutPath, sceneASelectEl, true);
      updateSplitView();
    }
  }, { signal });

  // Layout B 选择变化
  layoutBSelectEl.addEventListener("change", async () => {
    const layoutPath = layoutBSelectEl.value;
    if (layoutPath) {
      await loadLayoutAndPopulateScenes(layoutPath, sceneBSelectEl, false);
      updateSplitView();
    } else {
      // 清空Scene B
      sceneBSelectEl.innerHTML = "";
      sceneBSelectEl.disabled = true;
      updateSplitView();
    }
  }, { signal });

  // Scene A 选择变化
  sceneASelectEl.addEventListener("change", () => {
    updateSplitView();
  }, { signal });

  // Scene B 选择变化
  sceneBSelectEl.addEventListener("change", () => {
    updateSplitView();
  }, { signal });

  // 清除Layout B和Scene B，返回单屏
  resetSceneModeBtn.addEventListener("click", () => {
    layoutBSelectEl.value = "";
    sceneBSelectEl.innerHTML = "";
    sceneBSelectEl.disabled = true;
    sceneCompareState.sceneB = null;
    sceneCompareState.metricsB = null;
    layoutManifests.clear(); // 清除缓存的manifest
    updateSplitView();
  }, { signal });

  // 更新分屏状态
  function updateSplitView() {
    const layoutA = layoutASelectEl.value;
    const sceneA = sceneASelectEl.value;
    const layoutB = layoutBSelectEl.value;
    const sceneB = sceneBSelectEl.value;
    
    // 如果Layout B为空或Scene B未选择，或与A完全相同，单屏模式
    const isSameScene = layoutA === layoutB && sceneA === sceneB && layoutA && sceneA;
    
    if (!layoutB || !sceneB || isSameScene) {
      sceneCompareState.mode = "single";
      sceneCompareState.sceneA = sceneA;
      sceneCompareState.sceneB = null;
      resetSceneModeBtn.hidden = true;
      
      // 加载单场景
      if (layoutA && sceneA) {
        const manifest = layoutManifests.get(layoutA);
        if (manifest) {
          const scenes = makeSceneOptionsFromManifest(manifest, layoutA);
          const sceneOption = scenes.find(s => s.key === sceneA);
          if (sceneOption) {
            loadScene(sceneOption);
            enableSingleView();
          }
        }
      }
    } else {
      // 不同场景，分屏模式
      sceneCompareState.mode = "dual";
      sceneCompareState.sceneA = `${layoutA}::${sceneA}`;
      sceneCompareState.sceneB = `${layoutB}::${sceneB}`;
      resetSceneModeBtn.hidden = false;
      
      // 更新雷达图标签
      sceneALabel.textContent = `${compactUiLabel(layoutASelectEl.selectedOptions[0]?.label || "", 20)} / ${sceneA}`;
      sceneBLabel.textContent = `${compactUiLabel(layoutBSelectEl.selectedOptions[0]?.label || "", 20)} / ${sceneB}`;
      
      // 启用分屏模式
      enableSplitView();
      
      // 加载Scene A（左侧）
      const manifestA = layoutManifests.get(layoutA);
      if (manifestA) {
        const scenesA = makeSceneOptionsFromManifest(manifestA, layoutA);
        const sceneOptionA = scenesA.find(s => s.key === sceneA);
        if (sceneOptionA) {
          loadSceneA(sceneOptionA);
        }
      }
      
      // 加载Scene B（右侧）
      const manifestB = layoutManifests.get(layoutB);
      if (manifestB) {
        const scenesB = makeSceneOptionsFromManifest(manifestB, layoutB);
        const sceneOptionB = scenesB.find(s => s.key === sceneB);
        if (sceneOptionB) {
          loadSceneB(sceneOptionB);
        }
      }
    }
  }

  // 启用单屏模式
  function enableSingleView() {
    // 移除分屏class
    const shell = canvasHost.closest(".viewer-shell");
    if (shell) {
      shell.classList.remove("split-view");
    }
    
    canvasHost.style.display = "";
    canvasHost.style.width = "100%";
    // 隐藏分屏canvas
    const canvasB = document.getElementById("viewer-canvas-b");
    if (canvasB) {
      (canvasB as HTMLElement).style.display = "none";
    }
    
    // 调整renderer大小回全屏
    setTimeout(() => {
      renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
    }, 100);
  }

  // 启用分屏模式
  function enableSplitView() {
    // 检查是否已经有第二个canvas
    let canvasB = document.getElementById("viewer-canvas-b") as HTMLElement;
    if (!canvasB) {
      // 创建第二个canvas容器
      canvasB = document.createElement("div");
      canvasB.id = "viewer-canvas-b";
      canvasB.className = "viewer-canvas viewer-canvas-b";
      canvasHost.parentElement?.insertBefore(canvasB, canvasHost.nextSibling);
    }
    
    // 添加分屏class
    const shell = canvasHost.closest(".viewer-shell");
    if (shell) {
      shell.classList.add("split-view");
    }
    
    canvasB.style.display = "";
    
    // 调整renderer大小以适应半屏
    setTimeout(() => {
      const width = canvasHost.clientWidth;
      const height = canvasHost.clientHeight;
      renderer.setSize(width, height);
    }, 100);
  }

  // 加载Scene A（左侧视口）
  async function loadSceneA(option: SceneOption): Promise<void> {
    // 复用现有的loadScene逻辑，但渲染到左半屏
    await loadScene(option);
  }

  // 加载Scene B（右侧视口）
  async function loadSceneB(option: SceneOption): Promise<void> {
    // TODO: 实现Scene B的加载和渲染
    // 目前简单实现：创建第二个renderer和scene
    const canvasB = document.getElementById("viewer-canvas-b");
    if (!canvasB) return;
    
    console.log("Loading Scene B:", option.label);
    // 这里需要实现独立的Scene B渲染
    // 为了快速验证，暂时只显示提示信息
    setStatus(`Split View: Scene A loaded, Scene B (dual viewport) coming soon...`);
  }

  // 关闭雷达图
  closeSceneRadarBtn.addEventListener("click", () => {
    sceneRadarContainer.hidden = true;
  }, { signal });

  presetsToggleEl.addEventListener("click", () => setPresetsOpen(!presetsOpen), { signal });
  presetsCloseEl.addEventListener("click", () => setPresetsOpen(false), { signal });
  presetsGridEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>("[data-preset-id]");
    if (card?.dataset.presetId) {
      void applyPreset(card.dataset.presetId);
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
