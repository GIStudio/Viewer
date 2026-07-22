import "./styles/asset-editor.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { DesktopShell } from "./desktop-shell";
import { VIEWER_LANGUAGE_EVENT, applyViewerTranslations, loadViewerLanguage, translateViewerKey } from "./viewer-i18n";
import type {
  AssetCandidateManifest,
  AssetPreparationState,
  WorkflowController,
} from "./workflow-controller";

/* ── Types ─────────────────────────────────────────────────────────── */

export type AssetRecord = {
  asset_id: string;
  category: string;
  asset_role?: string;
  theme_tags?: string[];
  text_desc?: string;
  mesh_path: string;
  latent_path?: string;
  license?: string;
  source?: string;
  split?: string;
  generator_type?: string;
  mesh_face_count?: number;
  quality_metrics?: { face_count?: number; vertex_count?: number };
  quality_tier?: number;
  scene_eligible?: boolean;
  quality_notes?: string[];
  tags?: string[];
  style_tags?: string[];
  curation_notes?: string;
  scene_exclusion_reason?: string;
  face_count?: number;
  vertex_count?: number;
  // Scale and orientation fields
  scale?: number;
  scale_xyz?: [number, number, number];
  yaw_deg?: number;
  canonical_front?: string; // e.g., "+X", "-Z"
  dimensions_m?: { width?: number; height?: number; depth?: number };
  [key: string]: unknown;
};

export type ManifestInfo = {
  name: string;
  label: string;
  count: number;
  eligibleCount?: number;
  readyCount?: number;
  categoryCounts?: Record<string, number>;
  fingerprint?: string;
  updatedAt?: string;
  warnings?: string[];
};

export const DEFAULT_ASSET_MANIFEST_NAME = "real_assets_manifest.jsonl";
export const FALLBACK_MANIFESTS: ManifestInfo[] = [
  { name: "real_assets_manifest.jsonl", label: "Real assets manifest", count: 0 },
  { name: "real_assets_manifest_v2.jsonl", label: "Real assets manifest v2", count: 0 },
  { name: "objaverse_assets_manifest.jsonl", label: "Objaverse assets manifest", count: 0 },
  { name: "objaverse_tree_assets_manifest.jsonl", label: "Objaverse tree assets manifest", count: 0 },
  { name: "street_furniture/street_furniture_manifest.jsonl", label: "[street_furniture] Street furniture manifest", count: 0 },
  { name: "building/buildings_manifest.jsonl", label: "[building] Buildings manifest", count: 0 },
];
export const ACTIVE_MANIFEST_SESSION_KEY = "roadgen3d:asset-editor-active-manifest";
export const ACTIVE_ASSET_SESSION_KEY_PREFIX = "roadgen3d:asset-editor-active-asset:";

export function readSessionValue(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeSessionValue(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // The live editor still works when session storage is unavailable.
  }
}

export function candidateManifestFromInfo(
  manifest: ManifestInfo,
  priority: number,
  activatedBy: AssetCandidateManifest["activatedBy"],
): AssetCandidateManifest {
  return Object.freeze({
    name: manifest.name,
    label: manifest.label || manifest.name,
    fingerprint: manifest.fingerprint ?? "",
    eligibleCount: Math.max(0, Number(manifest.eligibleCount ?? manifest.count) || 0),
    readyCount: Math.max(0, Number(manifest.readyCount ?? manifest.eligibleCount ?? manifest.count) || 0),
    categoryCounts: Object.freeze({ ...(manifest.categoryCounts ?? {}) }),
    priority,
    activatedBy,
    updatedAt: manifest.updatedAt ?? "",
    warnings: Object.freeze([...(manifest.warnings ?? [])]),
  });
}

export type SceneChildInfo = {
  name: string;
  type: string;
  vertexCount: number;
  faceCount: number;
  uuid: string;
  bbox: { w: number; h: number; d: number };
  isDuplicate: boolean;
  duplicateGroup: number;
};

export type AssetEditorState = {
  manifestName: string;
  manifestCatalog: ManifestInfo[];
  currentManifest: ManifestInfo | null;
  assets: AssetRecord[];
  filteredAssets: AssetRecord[];
  selectedAssetId: string | null;
  selectedAssetIds: Set<string>;
  selectedObjects: Set<string>;
  scaleValue: number;
  renderMode: "solid" | "wireframe";
  searchQuery: string;
  categoryFilter: string;
  qualityTierFilter: string;
  eligibilityFilter: string;
  sceneChildren: SceneChildInfo[];
  selectionMode: boolean;
  selectedMeshes: Set<THREE.Mesh>;
  originAutoAlignEnabled: boolean;
  dragMoveMode: boolean;
  // Pagination state
  totalAssets: number;
  loadedOffset: number;
  hasMoreAssets: boolean;
  isLoadingMore: boolean;
  // Scale and orientation state
  yawValue: number;
  frontDirection: string;
  modelDimensions: DimensionRecord | null;
  originalDimensions: DimensionRecord | null;
};

export function createAssetEditorState(): AssetEditorState {
  return {
    manifestName: "", manifestCatalog: [], currentManifest: null, assets: [], filteredAssets: [],
    selectedAssetId: null, selectedAssetIds: new Set(), selectedObjects: new Set(), scaleValue: 1,
    renderMode: "solid", searchQuery: "", categoryFilter: "", qualityTierFilter: "", eligibilityFilter: "",
    sceneChildren: [], selectionMode: false, selectedMeshes: new Set(),
    originAutoAlignEnabled: localStorage.getItem("roadgen3d.assetEditor.originAutoAlign") === "true",
    dragMoveMode: false, totalAssets: 0, loadedOffset: 0, hasMoreAssets: false, isLoadingMore: false,
    yawValue: 0, frontDirection: "+Z", modelDimensions: null, originalDimensions: null,
  };
}

/* ── Helpers ───────────────────────────────────────────────────────── */

export function qs<T extends HTMLElement>(parent: ParentNode, sel: string): T {
  const el = parent.querySelector<T>(sel);
  if (!el) throw new Error(`Required element not found: ${sel}`);
  return el;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const CANONICAL_FRONT_ALIASES: Record<string, string> = {
  "+x": "+X",
  "x+": "+X",
  x: "+X",
  positive_x: "+X",
  pos_x: "+X",
  plus_x: "+X",
  right: "+X",
  "-x": "-X",
  "x-": "-X",
  negative_x: "-X",
  neg_x: "-X",
  minus_x: "-X",
  left: "-X",
  "+z": "+Z",
  "z+": "+Z",
  z: "+Z",
  positive_z: "+Z",
  pos_z: "+Z",
  plus_z: "+Z",
  front: "+Z",
  forward: "+Z",
  "-z": "-Z",
  "z-": "-Z",
  negative_z: "-Z",
  neg_z: "-Z",
  minus_z: "-Z",
  back: "-Z",
  backward: "-Z",
};

export const FRONT_AXIS_YAW_DEG: Record<string, number> = {
  "+Z": 0,
  "+X": 90,
  "-Z": 180,
  "-X": 270,
};
export type OrientationPolicy = "face_road" | "face_traffic" | "free";

export function normalizeYawDeg(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return ((base % 360) + 360) % 360;
}

export function normalizeCanonicalFront(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "+Z";
  const key = raw.toLowerCase().replace(/\s+/g, "_").replace(/^axis_/, "").replace(/_axis$/, "");
  return CANONICAL_FRONT_ALIASES[key] ?? "+Z";
}

export function rotateLocalDirection(frontDirection: string, yawDeg: number): THREE.Vector3 {
  const directions: Record<string, THREE.Vector3> = {
    "+X": new THREE.Vector3(1, 0, 0),
    "-X": new THREE.Vector3(-1, 0, 0),
    "+Z": new THREE.Vector3(0, 0, 1),
    "-Z": new THREE.Vector3(0, 0, -1),
  };
  const local = (directions[normalizeCanonicalFront(frontDirection)] ?? directions["+Z"]).clone();
  local.applyAxisAngle(new THREE.Vector3(0, 1, 0), (normalizeYawDeg(yawDeg) * Math.PI) / 180);
  return local.normalize();
}

export function orientationPolicyForAsset(asset: AssetRecord | undefined): OrientationPolicy {
  const category = String(asset?.category ?? "").trim().toLowerCase();
  if (category === "traffic_sign" || category === "sign" || category.endsWith("_sign")) return "face_traffic";
  if (["tree", "lamp", "bollard", "hydrant", "sky_dome"].includes(category)) return "free";
  return "face_road";
}

export function targetYawForPreviewPolicy(policy: OrientationPolicy, frontDirection: string): number {
  if (policy === "face_traffic") return 270; // RHT preview sign faces oncoming +T traffic, i.e. world -X
  if (policy === "free") return FRONT_AXIS_YAW_DEG[normalizeCanonicalFront(frontDirection)] ?? 0;
  return 0; // preview road is drawn along +/-X, with the nearest road edge toward +Z
}

export function finalPreviewYawForPolicy(policy: OrientationPolicy, frontDirection: string, assetYawOffsetDeg: number): number {
  const front = normalizeCanonicalFront(frontDirection);
  return normalizeYawDeg(
    targetYawForPreviewPolicy(policy, front)
    - (FRONT_AXIS_YAW_DEG[front] ?? 0)
    + assetYawOffsetDeg,
  );
}

export function signedYawDeltaDeg(a: number, b: number): number {
  return ((normalizeYawDeg(a - b) + 540) % 360) - 180;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function parseTagInput(value: string): string[] {
  return Array.from(new Set(asStringArray(value)));
}

export function formatTagInput(value: unknown): string {
  return asStringArray(value).join(", ");
}

export function shortId(assetId: string): string {
  if (assetId.length > 36) return assetId.slice(0, 12) + "..." + assetId.slice(-6);
  return assetId;
}

export function isSceneEligible(asset?: AssetRecord | null): boolean {
  return asset?.scene_eligible !== false;
}

export function categoryBadgeClass(cat: string): string {
  const map: Record<string, string> = {
    tree: "badge-tree",
    lamp: "badge-lamp",
    bench: "badge-bench",
    sign: "badge-sign",
    car: "badge-car",
    building: "badge-building",
  };
  return map[cat] ?? "badge-default";
}

export function tierColor(tier: number | undefined): string {
  if (tier === undefined || tier === null) return "#9ca3af";
  if (tier >= 4) return "#16a34a";
  if (tier >= 3) return "#2563eb";
  if (tier >= 2) return "#d97706";
  return "#dc2626";
}

export const DIMENSION_STORE_DECIMALS = 4;
export const DIMENSION_DISPLAY_DECIMALS = 2;
export const DIMENSION_DUP_KEY_DECIMALS = 4;
export const DEFAULT_SCALE_BAR_LENGTH = 5;
export const DEFAULT_SCALE_BAR_TICK_INTERVAL = 0.5;
export const SCALE_BAR_SMALL_MAX = 5; // 0.5m tick
export const SCALE_BAR_MEDIUM_MAX = 30; // 1m tick
export const DIMENSION_AUTOSAVE_DELAY_MS = 800;
export const CURATION_AUTOSAVE_DELAY_MS = 800;
export const ORIGIN_AUTO_FIX_EPSILON_M = 0.01;

export type DimensionRecord = {
  width: number;
  height: number;
  depth: number;
};

export function formatDimension(
  value: number | null | undefined,
  decimals: number = DIMENSION_DISPLAY_DECIMALS,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0.00";
  return roundTo(value, decimals).toFixed(decimals);
}

export function getRangeSourceLabel(profileMeta: Pick<CategoryDimensionValidation, "source" | "sampleCount">): string {
  if (profileMeta.source === "static") return "模板范围";
  if (profileMeta.source === "inferred") {
    return `自动推断（${profileMeta.sampleCount} 条样本）`;
  }
  return "默认范围（已使用通用规则）";
}

export function getViolationDirectionLabel(direction: "too-small" | "too-large"): string {
  return direction === "too-small" ? "偏小" : "偏大";
}

export type DimensionAxisRange = {
  min: number;
  max: number;
};

export type CategoryDimensionProfile = {
  name: string;
  width: DimensionAxisRange;
  height: DimensionAxisRange;
  depth: DimensionAxisRange;
};

export type CategoryDimensionRule = {
  keys: string[];
  profile: CategoryDimensionProfile;
};

export type CategoryDimensionViolation = {
  axis: "width" | "height" | "depth";
  axisLabel: "W" | "H" | "D";
  direction: "too-small" | "too-large";
  value: number;
  expectedMin: number;
  expectedMax: number;
};

export type CategoryDimensionValidation = {
  profile: CategoryDimensionProfile;
  violations: CategoryDimensionViolation[];
  suggestedScale: number;
  isWithinRange: boolean;
  feasible: boolean;
  source: "static" | "inferred" | "default";
  sampleCount: number;
};

export const CATEGORY_DIMENSION_RULES: CategoryDimensionRule[] = [
  {
    keys: ["tree", "vegetation", "plant"],
    profile: {
      name: "Tree",
      width: { min: 0.2, max: 12 },
      height: { min: 1, max: 25 },
      depth: { min: 0.2, max: 12 },
    },
  },
  {
    keys: ["lamp", "light", "streetlight"],
    profile: {
      name: "Lamp",
      width: { min: 0.05, max: 8 },
      height: { min: 0.4, max: 18 },
      depth: { min: 0.05, max: 8 },
    },
  },
  {
    keys: ["bench", "seat", "chair"],
    profile: {
      name: "Bench/Seat",
      width: { min: 0.3, max: 8 },
      height: { min: 0.25, max: 2 },
      depth: { min: 0.4, max: 6 },
    },
  },
  {
    keys: ["sign", "traffic"],
    profile: {
      name: "Sign",
      width: { min: 0.3, max: 25 },
      height: { min: 0.2, max: 10 },
      depth: { min: 0.05, max: 6 },
    },
  },
  {
    keys: ["car", "vehicle", "truck", "bus", "van", "vanity"],
    profile: {
      name: "Vehicle",
      width: { min: 0.8, max: 12 },
      height: { min: 1, max: 4 },
      depth: { min: 1.5, max: 16 },
    },
  },
  {
    keys: ["building", "house", "office", "tower", "wall"],
    profile: {
      name: "Building",
      width: { min: 1, max: 200 },
      height: { min: 1, max: 250 },
      depth: { min: 1, max: 200 },
    },
  },
];

export const DEFAULT_CATEGORY_DIMENSION_PROFILE: CategoryDimensionProfile = {
  name: "General",
  width: { min: 0.1, max: 100 },
  height: { min: 0.1, max: 100 },
  depth: { min: 0.1, max: 100 },
};

export type CategoryDimensionInferenceRecord = {
  width: number[];
  height: number[];
  depth: number[];
};

export const MIN_CATEGORY_SAMPLES_FOR_INFERENCE = 3;

export const inferredCategoryProfiles = new Map<string, CategoryDimensionProfile>();
export const inferredCategoryProfileCounts = new Map<string, number>();

export const inferAxisRange = (values: number[], minPercent = 0.1, maxPercent = 0.9): DimensionAxisRange | null => {
  if (values.length < 2) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const valueAt = (p: number) => {
    const index = Math.min(Math.max(p * (n - 1), 0), n - 1);
    const lo = Math.floor(index);
    const hi = Math.min(lo + 1, n - 1);
    const ratio = index - lo;
    return sorted[lo] * (1 - ratio) + sorted[hi] * ratio;
  };
  const min = valueAt(minPercent);
  const max = valueAt(maxPercent);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0 || min <= 0) return null;
  return {
    min: Math.max(0.01, roundTo(min * 0.8, 3)),
    max: roundTo(max * 1.2, 3),
  };
};

export const inferCategoryProfileName = (category: string): string => {
  const normalized = (category ?? "").trim();
  if (!normalized) return "Unknown";
  return normalized
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-") || "Unknown";
};

export function rebuildCategoryProfiles(assets: AssetRecord[]) {
  const grouped = new Map<string, CategoryDimensionInferenceRecord>();
  for (const asset of assets) {
    const dims = getAssetDimensions(asset);
    const cat = normalizeCategory(asset.category);
    if (!dims || !cat) continue;
    const rec = grouped.get(cat) ?? { width: [], height: [], depth: [] };
    rec.width.push(dims.width);
    rec.height.push(dims.height);
    rec.depth.push(dims.depth);
    grouped.set(cat, rec);
  }

  inferredCategoryProfiles.clear();
  inferredCategoryProfileCounts.clear();
  for (const [cat, rec] of grouped) {
    if (rec.width.length < MIN_CATEGORY_SAMPLES_FOR_INFERENCE) continue;

    const width = inferAxisRange(rec.width);
    const height = inferAxisRange(rec.height);
    const depth = inferAxisRange(rec.depth);
    if (!width || !height || !depth) continue;
    inferredCategoryProfiles.set(cat, {
      name: inferCategoryProfileName(cat),
      width,
      height,
      depth,
    });
    inferredCategoryProfileCounts.set(cat, rec.width.length);
  }
}

export function getCategoryProfileMeta(category?: string): {
  profile: CategoryDimensionProfile;
  source: CategoryDimensionValidation["source"];
  sampleCount: number;
} {
  const categoryKey = normalizeCategory(category);
  const compactCategoryKey = normalizeCategoryToken(category);
  for (const rule of CATEGORY_DIMENSION_RULES) {
    for (const key of rule.keys) {
      const compactRuleKey = key.replace(/\s+/g, "");
      if (categoryKey.includes(key) || compactCategoryKey.includes(compactRuleKey)) {
        return { profile: rule.profile, source: "static", sampleCount: Number.MAX_SAFE_INTEGER };
      }
    }
  }
  if (categoryKey && inferredCategoryProfiles.has(categoryKey)) {
    return {
      profile: inferredCategoryProfiles.get(categoryKey)!,
      source: "inferred",
      sampleCount: inferredCategoryProfileCounts.get(categoryKey) ?? 0,
    };
  }
  if (compactCategoryKey) {
    for (const [profileKey, profile] of inferredCategoryProfiles) {
      if (compactCategoryKey.includes(profileKey.replace(/\s+/g, ""))) {
        return {
          profile,
          source: "inferred",
          sampleCount: inferredCategoryProfileCounts.get(profileKey) ?? 0,
        };
      }
    }
  }
  return { profile: DEFAULT_CATEGORY_DIMENSION_PROFILE, source: "default", sampleCount: 0 };
}

export function getCategoryDimensionProfile(category?: string): CategoryDimensionProfile {
  return getCategoryProfileMeta(category).profile;
}

export function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function getObjectBoundingBox(target: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(target);
}

export function getDimensionsFromObject(target: THREE.Object3D): DimensionRecord | null {
  const box = getObjectBoundingBox(target);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z)) {
    return null;
  }
  return {
    width: roundTo(size.x, DIMENSION_STORE_DECIMALS),
    height: roundTo(size.y, DIMENSION_STORE_DECIMALS),
    depth: roundTo(size.z, DIMENSION_STORE_DECIMALS),
  };
}

export function getAssetDimensions(asset?: AssetRecord | null): DimensionRecord | null {
  if (!asset?.dimensions_m) return null;
  const { width, height, depth } = asset.dimensions_m;
  if (
    typeof width !== "number" || !Number.isFinite(width)
    || typeof height !== "number" || !Number.isFinite(height)
    || typeof depth !== "number" || !Number.isFinite(depth)
  ) {
    return null;
  }
  return {
    width,
    height,
    depth,
  };
}

export function normalizeCategory(category?: string): string {
  return (category ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeCategoryToken(category?: string): string {
  return normalizeCategory(category).replace(/\s+/g, "");
}

export function validateCategoryDimension(
  dims: DimensionRecord | null,
  category?: string,
): CategoryDimensionValidation {
  const profileMeta = getCategoryProfileMeta(category);
  const profile = profileMeta.profile;
  if (!dims) {
    return {
      profile,
      violations: [],
      suggestedScale: 1,
      isWithinRange: false,
      feasible: false,
      source: profileMeta.source,
      sampleCount: profileMeta.sampleCount,
    };
  }

  const violations: CategoryDimensionViolation[] = [];
  const axisMap: Array<{ axis: "width" | "height" | "depth"; label: "W" | "H" | "D"; value: number; range: DimensionAxisRange }> = [
    { axis: "width", label: "W", value: dims.width, range: profile.width },
    { axis: "height", label: "H", value: dims.height, range: profile.height },
    { axis: "depth", label: "D", value: dims.depth, range: profile.depth },
  ];

  let minScale = 1;
  let maxScale = Number.POSITIVE_INFINITY;
  for (const item of axisMap) {
    if (!Number.isFinite(item.value) || item.value <= 0) continue;
    if (item.value < item.range.min) {
      violations.push({
        axis: item.axis,
        axisLabel: item.label,
        direction: "too-small",
        value: item.value,
        expectedMin: item.range.min,
        expectedMax: item.range.max,
      });
      minScale = Math.max(minScale, item.range.min / item.value);
    } else if (item.value > item.range.max) {
      violations.push({
        axis: item.axis,
        axisLabel: item.label,
        direction: "too-large",
        value: item.value,
        expectedMin: item.range.min,
        expectedMax: item.range.max,
      });
      maxScale = Math.min(maxScale, item.range.max / item.value);
    }
  }

  const hasViolation = violations.length > 0;
  const withinRange = !hasViolation;
  const feasible = minScale <= maxScale;
  let suggestedScale = 1;
  if (hasViolation) {
    if (feasible) {
      if (minScale > 1) {
        suggestedScale = minScale;
      } else if (maxScale < 1) {
        suggestedScale = maxScale;
      }
    } else {
      suggestedScale = Number.isFinite(maxScale)
        ? Math.sqrt(minScale * maxScale)
        : minScale;
    }
  }

  return {
    profile,
    violations,
    suggestedScale: Number.isFinite(suggestedScale) ? roundTo(suggestedScale, 4) : 1,
    isWithinRange: withinRange,
    feasible,
    source: profileMeta.source,
    sampleCount: profileMeta.sampleCount,
  };
}

export function formatCategoryRangeLine(profile: CategoryDimensionProfile): string {
  return `W ${formatDimension(profile.width.min)}-${formatDimension(profile.width.max)} · H ${formatDimension(profile.height.min)}-${formatDimension(profile.height.max)} · D ${formatDimension(profile.depth.min)}-${formatDimension(profile.depth.max)} m`;
}

export type ScaleBarConfig = {
  length: number;
  tickInterval: number;
  majorTickInterval: number;
};

export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return step > 0 ? step : 0;
  const safeStep = Math.round(step * 1e6) / 1e6;
  return Math.max(step, Math.ceil((value - 1e-9) / safeStep) * safeStep);
}

export function makeScaleBarConfig(maxDimension: number): ScaleBarConfig {
  const dim = Number.isFinite(maxDimension) ? maxDimension : 0;
  if (dim <= SCALE_BAR_SMALL_MAX) {
    const length = Math.max(1, roundToStep(dim, 0.5));
    return {
      length,
      tickInterval: 0.5,
      majorTickInterval: 0.5,
    };
  }
  if (dim <= SCALE_BAR_MEDIUM_MAX) {
    return {
      length: Math.max(1, roundToStep(dim, 1)),
      tickInterval: 1,
      majorTickInterval: 1,
    };
  }
  return {
    length: roundToStep(dim, 5),
    tickInterval: 5,
    majorTickInterval: 5,
  };
}

export function formatScaleLabel(value: number): string {
  if (!Number.isFinite(value)) return "0m";
  if (value % 1 === 0) return `${value}m`;
  return `${roundTo(value, 1)}m`;
}

export function disposeScaleBar(group: THREE.Group) {
  group.traverse((obj) => {
    const line = obj as THREE.Line;
    if ((line as THREE.Line).isLine) {
      if (line.geometry) line.geometry.dispose();
      const material = line.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    }
    if (obj instanceof CSS2DObject) {
      obj.element.remove();
    }
  });
}

export function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const maybeObject = obj as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (maybeObject.geometry) {
      maybeObject.geometry.dispose();
    }
    const material = maybeObject.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else {
      material?.dispose?.();
    }
    if (obj instanceof CSS2DObject) {
      obj.element.remove();
    }
  });
}

export function makeReferenceLabel(text: string, color: string): CSS2DObject {
  const div = document.createElement("div");
  div.className = "ae-ruler-label";
  div.style.color = color;
  div.style.fontWeight = "700";
  div.textContent = text;
  return new CSS2DObject(div);
}

export function createRoadReferenceGroup(box?: THREE.Box3, policy: OrientationPolicy = "face_road"): THREE.Group {
  const group = new THREE.Group();
  group.name = "road_orientation_reference";

  const bounds = box && !box.isEmpty()
    ? box.clone()
    : new THREE.Box3(new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 2, 1));
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const tangentSpan = Math.max(size.x, 1);
  const horizontalSpan = Math.max(size.x, size.z, 1);
  const sidePadding = clampNumber(tangentSpan * 0.12, 0.8, 6);
  const roadLength = Math.max(5.2, tangentSpan + sidePadding * 2);
  const roadWidth = clampNumber(horizontalSpan * 0.06, 0.55, 4);
  const modelToRoadGap = clampNumber(horizontalSpan * 0.12, 0.8, 8);
  const roadY = Math.max(0.01, bounds.min.y + 0.01);
  const roadZ = bounds.max.z + modelToRoadGap + roadWidth * 0.5;
  const roadMinX = center.x - roadLength * 0.5;
  const roadMaxX = center.x + roadLength * 0.5;
  const arrowHeadLength = clampNumber(roadLength * 0.035, 0.18, 2.2);
  const arrowHeadWidth = clampNumber(arrowHeadLength * 0.45, 0.08, 1.2);
  const trafficArrowLength = Math.max(1.2, roadLength * 0.34);
  const trafficArrowOffset = Math.max(roadWidth * 0.24, 0.16);
  const labelY = roadY + clampNumber(Math.max(size.y * 0.04, horizontalSpan * 0.025), 0.28, 2.4);

  const roadMat = new THREE.MeshBasicMaterial({
    color: 0x263241,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
  });
  const roadPlane = new THREE.Mesh(new THREE.PlaneGeometry(roadLength, roadWidth), roadMat);
  roadPlane.rotation.x = -Math.PI / 2;
  roadPlane.position.set(center.x, roadY, roadZ);
  group.add(roadPlane);

  const roadLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(roadMinX, roadY + 0.03, roadZ),
      new THREE.Vector3(roadMaxX, roadY + 0.03, roadZ),
    ]),
    new THREE.LineBasicMaterial({ color: 0xf4c542 }),
  );
  group.add(roadLine);

  const normalStartZ = bounds.max.z + modelToRoadGap * 0.15;
  const normalLength = Math.max(0.8, roadZ - normalStartZ);
  const targetArrowLength = Math.max(0.8, roadLength * 0.32);
  const targetArrowZ = normalStartZ + normalLength * 0.48;
  const targetArrow =
    policy === "face_traffic"
      ? new THREE.ArrowHelper(
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(center.x + targetArrowLength * 0.5, roadY + 0.12, targetArrowZ),
        targetArrowLength,
        0x00ff88,
        arrowHeadLength,
        arrowHeadWidth,
      )
      : new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(center.x, roadY + 0.12, normalStartZ),
        normalLength,
        0x00ff88,
        arrowHeadLength,
        arrowHeadWidth,
      );

  // Right-hand traffic: +T uses the lane on its right side (-Z), while -T uses
  // the opposite lane (+Z). The labels make that convention visible in preview.
  group.add(
    new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(center.x - roadLength * 0.42, roadY + 0.08, roadZ - trafficArrowOffset),
      trafficArrowLength,
      0x4aa3ff,
      arrowHeadLength,
      arrowHeadWidth,
    ),
    new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(center.x + roadLength * 0.42, roadY + 0.08, roadZ + trafficArrowOffset),
      trafficArrowLength,
      0xff9f43,
      arrowHeadLength,
      arrowHeadWidth,
    ),
    targetArrow,
  );

  const forwardLabel = makeReferenceLabel("RHT +T", "#4aa3ff");
  forwardLabel.position.set(center.x - roadLength * 0.18, labelY, roadZ - roadWidth * 0.72);
  const reverseLabel = makeReferenceLabel("RHT -T", "#ff9f43");
  reverseLabel.position.set(center.x + roadLength * 0.18, labelY, roadZ + roadWidth * 0.72);
  const normalLabel = makeReferenceLabel(policy === "face_traffic" ? "Face traffic" : "Face road", "#00ff88");
  normalLabel.position.set(
    policy === "face_traffic" ? center.x : center.x + Math.min(roadLength * 0.04, 1.2),
    labelY,
    targetArrowZ,
  );
  const trafficRuleLabel = makeReferenceLabel("RHT", "#f4c542");
  trafficRuleLabel.position.set(center.x, labelY + clampNumber(horizontalSpan * 0.015, 0.18, 1.0), roadZ);
  group.add(forwardLabel, reverseLabel, normalLabel, trafficRuleLabel);

  return group;
}

/* ── API ───────────────────────────────────────────────────────────── */

export async function fetchManifests(): Promise<ManifestInfo[]> {
  const res = await fetch("/api/asset-manifests");
  if (!res.ok) throw new Error(`Failed to fetch manifests: ${res.status}`);
  const data = await res.json();
  return data.manifests ?? [];
}

export type ManifestAssetsResponse = {
  assets: AssetRecord[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  manifest?: ManifestInfo;
};

export async function fetchManifestAssets(
  name: string,
  offset: number = 0,
  limit: number = 100,
  eligibility: "all" | "eligible" | "disabled" = "all",
): Promise<ManifestAssetsResponse> {
  const res = await fetch(
    `/api/asset-manifest?name=${encodeURIComponent(name)}&offset=${offset}&limit=${limit}&eligibility=${eligibility}`,
  );
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  const data = await res.json();
  return {
    assets: (data.assets ?? []).map((asset: AssetRecord) => ({
      ...asset,
      canonical_front: normalizeCanonicalFront(asset.canonical_front),
      yaw_deg: normalizeYawDeg(asset.yaw_deg ?? 0),
    })),
    total: data.total ?? 0,
    offset: data.offset ?? offset,
    limit: data.limit ?? limit,
    hasMore: data.hasMore ?? false,
    manifest: data.manifest ?? undefined,
  };
}

export async function saveAssetMetadata(
  manifestName: string,
  assetId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const res = await fetch("/api/asset-manifest/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest_name: manifestName, asset_id: assetId, updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Save failed: ${res.status}`);
  }
}

export async function bulkSaveAssetMetadata(
  manifestName: string,
  updates: Record<string, unknown>,
  options: { assetIds?: string[]; scope?: "selected" | "all" },
): Promise<{ updatedCount: number; missingAssetIds: string[] }> {
  const res = await fetch("/api/asset-manifest/bulk-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      manifest_name: manifestName,
      asset_ids: options.assetIds ?? [],
      scope: options.scope ?? "selected",
      updates,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Bulk save failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    updatedCount: Number(data.updated_count ?? 0),
    missingAssetIds: Array.isArray(data.missing_asset_ids) ? data.missing_asset_ids.map(String) : [],
  };
}

export async function deleteAssetRecord(
  manifestName: string,
  assetId: string,
): Promise<void> {
  const res = await fetch("/api/asset-manifest/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest_name: manifestName, asset_id: assetId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Delete failed: ${res.status}`);
  }
}

export async function createAssetRecords(
  manifestName: string,
  assets: Array<{ asset_id: string; record: AssetRecord; glb_base64: string }>,
): Promise<AssetRecord[]> {
  const res = await fetch("/api/asset-manifest/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest_name: manifestName, assets }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Create failed: ${res.status}`);
  }
  const data = await res.json();
  return (data.assets ?? []) as AssetRecord[];
}

export async function splitAssetWithBackendAuto(
  manifestName: string,
  assetId: string,
): Promise<{
  assets: AssetRecord[];
  created_count: number;
  cluster_count: number;
  output_dir: string;
  actual_method: string;
  fallback_reason: string | null;
}> {
  const res = await fetch("/api/asset-manifest/split-selected", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      manifest_name: manifestName,
      asset_id: assetId,
      method: "auto",
      projection_margin: 0.03,
    }),
  });
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ?? data?.error ?? `Backend split failed: ${res.status}`;
    throw new Error(message);
  }
  return {
    assets: (data.assets ?? []) as AssetRecord[],
    created_count: Number(data.created_count ?? 0),
    cluster_count: Number(data.cluster_count ?? 0),
    output_dir: String(data.output_dir ?? ""),
    actual_method: String(data.actual_method ?? data.method ?? "auto"),
    fallback_reason: data.fallback_reason ? String(data.fallback_reason) : null,
  };
}

export async function saveNormalizedAssetMesh(
  manifestName: string,
  assetId: string,
  glbBase64: string,
  updates: Record<string, unknown>,
): Promise<AssetRecord> {
  const res = await fetch("/api/asset-manifest/normalize-mesh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest_name: manifestName, asset_id: assetId, glb_base64: glbBase64, updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Normalize failed: ${res.status}`);
  }
  const data = await res.json();
  return data.asset as AssetRecord;
}
