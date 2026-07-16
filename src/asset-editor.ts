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

type AssetRecord = {
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

type ManifestInfo = {
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

const DEFAULT_ASSET_MANIFEST_NAME = "real_assets_manifest.jsonl";
const FALLBACK_MANIFESTS: ManifestInfo[] = [
  { name: "real_assets_manifest.jsonl", label: "Real assets manifest", count: 0 },
  { name: "real_assets_manifest_v2.jsonl", label: "Real assets manifest v2", count: 0 },
  { name: "objaverse_assets_manifest.jsonl", label: "Objaverse assets manifest", count: 0 },
  { name: "objaverse_tree_assets_manifest.jsonl", label: "Objaverse tree assets manifest", count: 0 },
  { name: "street_furniture/street_furniture_manifest.jsonl", label: "[street_furniture] Street furniture manifest", count: 0 },
  { name: "building/buildings_manifest.jsonl", label: "[building] Buildings manifest", count: 0 },
];
const ACTIVE_MANIFEST_SESSION_KEY = "roadgen3d:asset-editor-active-manifest";
const ACTIVE_ASSET_SESSION_KEY_PREFIX = "roadgen3d:asset-editor-active-asset:";

function readSessionValue(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeSessionValue(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // The live editor still works when session storage is unavailable.
  }
}

function candidateManifestFromInfo(
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

type SceneChildInfo = {
  name: string;
  type: string;
  vertexCount: number;
  faceCount: number;
  uuid: string;
  bbox: { w: number; h: number; d: number };
  isDuplicate: boolean;
  duplicateGroup: number;
};

type AssetEditorState = {
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

/* ── Helpers ───────────────────────────────────────────────────────── */

function qs<T extends HTMLElement>(parent: ParentNode, sel: string): T {
  const el = parent.querySelector<T>(sel);
  if (!el) throw new Error(`Required element not found: ${sel}`);
  return el;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CANONICAL_FRONT_ALIASES: Record<string, string> = {
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

const FRONT_AXIS_YAW_DEG: Record<string, number> = {
  "+Z": 0,
  "+X": 90,
  "-Z": 180,
  "-X": 270,
};
type OrientationPolicy = "face_road" | "face_traffic" | "free";

function normalizeYawDeg(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return ((base % 360) + 360) % 360;
}

function normalizeCanonicalFront(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "+Z";
  const key = raw.toLowerCase().replace(/\s+/g, "_").replace(/^axis_/, "").replace(/_axis$/, "");
  return CANONICAL_FRONT_ALIASES[key] ?? "+Z";
}

function rotateLocalDirection(frontDirection: string, yawDeg: number): THREE.Vector3 {
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

function orientationPolicyForAsset(asset: AssetRecord | undefined): OrientationPolicy {
  const category = String(asset?.category ?? "").trim().toLowerCase();
  if (category === "traffic_sign" || category === "sign" || category.endsWith("_sign")) return "face_traffic";
  if (["tree", "lamp", "bollard", "hydrant", "sky_dome"].includes(category)) return "free";
  return "face_road";
}

function targetYawForPreviewPolicy(policy: OrientationPolicy, frontDirection: string): number {
  if (policy === "face_traffic") return 270; // RHT preview sign faces oncoming +T traffic, i.e. world -X
  if (policy === "free") return FRONT_AXIS_YAW_DEG[normalizeCanonicalFront(frontDirection)] ?? 0;
  return 0; // preview road is drawn along +/-X, with the nearest road edge toward +Z
}

function finalPreviewYawForPolicy(policy: OrientationPolicy, frontDirection: string, assetYawOffsetDeg: number): number {
  const front = normalizeCanonicalFront(frontDirection);
  return normalizeYawDeg(
    targetYawForPreviewPolicy(policy, front)
    - (FRONT_AXIS_YAW_DEG[front] ?? 0)
    + assetYawOffsetDeg,
  );
}

function signedYawDeltaDeg(a: number, b: number): number {
  return ((normalizeYawDeg(a - b) + 540) % 360) - 180;
}

function asStringArray(value: unknown): string[] {
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

function parseTagInput(value: string): string[] {
  return Array.from(new Set(asStringArray(value)));
}

function formatTagInput(value: unknown): string {
  return asStringArray(value).join(", ");
}

function shortId(assetId: string): string {
  if (assetId.length > 36) return assetId.slice(0, 12) + "..." + assetId.slice(-6);
  return assetId;
}

function isSceneEligible(asset?: AssetRecord | null): boolean {
  return asset?.scene_eligible !== false;
}

function categoryBadgeClass(cat: string): string {
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

function tierColor(tier: number | undefined): string {
  if (tier === undefined || tier === null) return "#9ca3af";
  if (tier >= 4) return "#16a34a";
  if (tier >= 3) return "#2563eb";
  if (tier >= 2) return "#d97706";
  return "#dc2626";
}

const DIMENSION_STORE_DECIMALS = 4;
const DIMENSION_DISPLAY_DECIMALS = 2;
const DIMENSION_DUP_KEY_DECIMALS = 4;
const DEFAULT_SCALE_BAR_LENGTH = 5;
const DEFAULT_SCALE_BAR_TICK_INTERVAL = 0.5;
const SCALE_BAR_SMALL_MAX = 5; // 0.5m tick
const SCALE_BAR_MEDIUM_MAX = 30; // 1m tick
const DIMENSION_AUTOSAVE_DELAY_MS = 800;
const CURATION_AUTOSAVE_DELAY_MS = 800;
const ORIGIN_AUTO_FIX_EPSILON_M = 0.01;

type DimensionRecord = {
  width: number;
  height: number;
  depth: number;
};

function formatDimension(
  value: number | null | undefined,
  decimals: number = DIMENSION_DISPLAY_DECIMALS,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0.00";
  return roundTo(value, decimals).toFixed(decimals);
}

function getRangeSourceLabel(profileMeta: Pick<CategoryDimensionValidation, "source" | "sampleCount">): string {
  if (profileMeta.source === "static") return "模板范围";
  if (profileMeta.source === "inferred") {
    return `自动推断（${profileMeta.sampleCount} 条样本）`;
  }
  return "默认范围（已使用通用规则）";
}

function getViolationDirectionLabel(direction: "too-small" | "too-large"): string {
  return direction === "too-small" ? "偏小" : "偏大";
}

type DimensionAxisRange = {
  min: number;
  max: number;
};

type CategoryDimensionProfile = {
  name: string;
  width: DimensionAxisRange;
  height: DimensionAxisRange;
  depth: DimensionAxisRange;
};

type CategoryDimensionRule = {
  keys: string[];
  profile: CategoryDimensionProfile;
};

type CategoryDimensionViolation = {
  axis: "width" | "height" | "depth";
  axisLabel: "W" | "H" | "D";
  direction: "too-small" | "too-large";
  value: number;
  expectedMin: number;
  expectedMax: number;
};

type CategoryDimensionValidation = {
  profile: CategoryDimensionProfile;
  violations: CategoryDimensionViolation[];
  suggestedScale: number;
  isWithinRange: boolean;
  feasible: boolean;
  source: "static" | "inferred" | "default";
  sampleCount: number;
};

const CATEGORY_DIMENSION_RULES: CategoryDimensionRule[] = [
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

const DEFAULT_CATEGORY_DIMENSION_PROFILE: CategoryDimensionProfile = {
  name: "General",
  width: { min: 0.1, max: 100 },
  height: { min: 0.1, max: 100 },
  depth: { min: 0.1, max: 100 },
};

type CategoryDimensionInferenceRecord = {
  width: number[];
  height: number[];
  depth: number[];
};

const MIN_CATEGORY_SAMPLES_FOR_INFERENCE = 3;

const inferredCategoryProfiles = new Map<string, CategoryDimensionProfile>();
const inferredCategoryProfileCounts = new Map<string, number>();

const inferAxisRange = (values: number[], minPercent = 0.1, maxPercent = 0.9): DimensionAxisRange | null => {
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

const inferCategoryProfileName = (category: string): string => {
  const normalized = (category ?? "").trim();
  if (!normalized) return "Unknown";
  return normalized
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-") || "Unknown";
};

function rebuildCategoryProfiles(assets: AssetRecord[]) {
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

function getCategoryProfileMeta(category?: string): {
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

function getCategoryDimensionProfile(category?: string): CategoryDimensionProfile {
  return getCategoryProfileMeta(category).profile;
}

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function getObjectBoundingBox(target: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(target);
}

function getDimensionsFromObject(target: THREE.Object3D): DimensionRecord | null {
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

function getAssetDimensions(asset?: AssetRecord | null): DimensionRecord | null {
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

function normalizeCategory(category?: string): string {
  return (category ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeCategoryToken(category?: string): string {
  return normalizeCategory(category).replace(/\s+/g, "");
}

function validateCategoryDimension(
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

function formatCategoryRangeLine(profile: CategoryDimensionProfile): string {
  return `W ${formatDimension(profile.width.min)}-${formatDimension(profile.width.max)} · H ${formatDimension(profile.height.min)}-${formatDimension(profile.height.max)} · D ${formatDimension(profile.depth.min)}-${formatDimension(profile.depth.max)} m`;
}

type ScaleBarConfig = {
  length: number;
  tickInterval: number;
  majorTickInterval: number;
};

function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return step > 0 ? step : 0;
  const safeStep = Math.round(step * 1e6) / 1e6;
  return Math.max(step, Math.ceil((value - 1e-9) / safeStep) * safeStep);
}

function makeScaleBarConfig(maxDimension: number): ScaleBarConfig {
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

function formatScaleLabel(value: number): string {
  if (!Number.isFinite(value)) return "0m";
  if (value % 1 === 0) return `${value}m`;
  return `${roundTo(value, 1)}m`;
}

function disposeScaleBar(group: THREE.Group) {
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

function disposeObjectTree(root: THREE.Object3D) {
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

function replaceScaleBar(scene: THREE.Scene, current: THREE.Group, config?: ScaleBarConfig): THREE.Group {
  disposeScaleBar(current);
  if (current.parent) {
    current.parent.remove(current);
  }
  const targetConfig = config ?? {
    length: DEFAULT_SCALE_BAR_LENGTH,
    tickInterval: DEFAULT_SCALE_BAR_TICK_INTERVAL,
    majorTickInterval: DEFAULT_SCALE_BAR_TICK_INTERVAL,
  };
  return createScaleBar(scene, targetConfig);
}

function makeReferenceLabel(text: string, color: string): CSS2DObject {
  const div = document.createElement("div");
  div.className = "ae-ruler-label";
  div.style.color = color;
  div.style.fontWeight = "700";
  div.textContent = text;
  return new CSS2DObject(div);
}

function createRoadReferenceGroup(box?: THREE.Box3, policy: OrientationPolicy = "face_road"): THREE.Group {
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

async function fetchManifests(): Promise<ManifestInfo[]> {
  const res = await fetch("/api/asset-manifests");
  if (!res.ok) throw new Error(`Failed to fetch manifests: ${res.status}`);
  const data = await res.json();
  return data.manifests ?? [];
}

type ManifestAssetsResponse = {
  assets: AssetRecord[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  manifest?: ManifestInfo;
};

async function fetchManifestAssets(
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

async function saveAssetMetadata(
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

async function bulkSaveAssetMetadata(
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

async function deleteAssetRecord(
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

async function createAssetRecords(
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

async function splitAssetWithBackendAuto(
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

async function saveNormalizedAssetMesh(
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

/* ── Three.js Preview ──────────────────────────────────────────────── */

type PreviewContext = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  animId: number;
  currentModel: THREE.Group | null;
  bboxHelper: THREE.Box3Helper | null;
  gridHelper: THREE.GridHelper;
  wireframeMaterial: THREE.MeshBasicMaterial;
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  selectionBox: SelectionBox | null;
  selectionHelper: SelectionHelper | null;
  // Scale bar and orientation
  labelRenderer: CSS2DRenderer;
  scaleBarGroup: THREE.Group | null;
  frontArrow: THREE.ArrowHelper | null;
  roadReferenceGroup: THREE.Group | null;
};

type SelectionBox = {
  startPoint: THREE.Vector2;
  endPoint: THREE.Vector2;
  isSelecting: boolean;
  domElement: HTMLElement;
};

type SelectionHelper = {
  element: HTMLDivElement;
  startPoint: THREE.Vector2;
  pointTopLeft: THREE.Vector2;
  pointBottomRight: THREE.Vector2;
  isDown: boolean;
  enabled: boolean;
};

/* ── Scale Bar Helper ──────────────────────────────────────────────── */

function createScaleBar(scene: THREE.Scene, config: ScaleBarConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = "scaleBar";

  const length = config.length;
  const tickInterval = config.tickInterval;
  const majorTickInterval = config.majorTickInterval;
  const tickHeight = 0.1;
  const majorTickHeight = 0.2;
  const majorEvery = Math.max(1, Math.round(majorTickInterval / tickInterval));
  const totalTicks = Math.max(0, Math.round(length / tickInterval));
  const yBase = 0.01;
  const baseline = new THREE.Vector3(0, yBase, 0);

  const axisDefs: Array<{
    key: "x" | "y" | "z";
    color: number;
    dir: THREE.Vector3;
    tickDir: THREE.Vector3;
    label: string;
    labelOffset: THREE.Vector3;
    tickLabelOffset: THREE.Vector3;
  }> = [
    {
      key: "x",
      color: 0xff5555,
      dir: new THREE.Vector3(1, 0, 0),
      tickDir: new THREE.Vector3(0, 0, -1),
      label: "X",
      labelOffset: new THREE.Vector3(0.25, 0, -0.18),
      tickLabelOffset: new THREE.Vector3(0, 0, -0.15),
    },
    {
      key: "y",
      color: 0x55ff55,
      dir: new THREE.Vector3(0, 1, 0),
      tickDir: new THREE.Vector3(-1, 0, 0),
      label: "Y",
      labelOffset: new THREE.Vector3(-0.22, 0.18, 0.08),
      tickLabelOffset: new THREE.Vector3(-0.15, 0, 0),
    },
    {
      key: "z",
      color: 0x55aaff,
      dir: new THREE.Vector3(0, 0, 1),
      tickDir: new THREE.Vector3(0, 1, 0),
      label: "Z",
      labelOffset: new THREE.Vector3(0, 0.28, 0.15),
      tickLabelOffset: new THREE.Vector3(0, 0.15, 0),
    },
  ];

  const addRulerLabel = (text: string, position: THREE.Vector3, color = "#ffffff") => {
    const labelDiv = document.createElement("div");
    labelDiv.className = "ae-ruler-label";
    labelDiv.textContent = text;
    labelDiv.style.cssText = `
      color: ${color};
      font-family: "SF Mono", "Roboto Mono", monospace;
      font-size: 11px;
      font-weight: 600;
      background: rgba(0, 0, 0, 0.6);
      padding: 2px 4px;
      border-radius: 3px;
      white-space: nowrap;
    `;
    const label = new CSS2DObject(labelDiv);
    label.position.copy(position);
    group.add(label);
  };

  const addAxis = (axis: (typeof axisDefs)[number]) => {
    const axisEnd = baseline.clone().add(axis.dir.clone().multiplyScalar(length));
    const axisLineGeometry = new THREE.BufferGeometry().setFromPoints([baseline, axisEnd]);
    const axisLineMaterial = new THREE.LineBasicMaterial({ color: axis.color, linewidth: 2 });
    const axisLine = new THREE.Line(axisLineGeometry, axisLineMaterial);
    group.add(axisLine);

    for (let i = 0; i <= totalTicks; i += 1) {
      const axisValue = roundTo(i * tickInterval, 2);
      const isMajor = i % majorEvery === 0;
      const height = isMajor ? majorTickHeight : tickHeight;
      const value = Math.min(length, axisValue);
      const position = baseline.clone().add(axis.dir.clone().multiplyScalar(value));

      const tickStart = position.clone();
      const tickEnd = tickStart.clone().add(axis.tickDir.clone().multiplyScalar(height));
      const tickGeometry = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd]);
      const tickMaterial = new THREE.LineBasicMaterial({ color: axis.color });
      const tick = new THREE.Line(tickGeometry, tickMaterial);
      group.add(tick);

      if (isMajor && value > 0) {
        addRulerLabel(
          formatScaleLabel(value),
          position.clone().add(axis.tickLabelOffset).add(axis.tickDir.clone().multiplyScalar(height)),
          `rgb(${(axis.color >> 16) & 255}, ${(axis.color >> 8) & 255}, ${axis.color & 255})`,
        );
      }
    }

    addRulerLabel(
      axis.label,
      axisEnd.clone().add(axis.labelOffset),
      `rgb(${(axis.color >> 16) & 255}, ${(axis.color >> 8) & 255}, ${axis.color & 255})`,
    );
  };

  axisDefs.forEach(addAxis);

  addRulerLabel("0", baseline.clone().add(new THREE.Vector3(0, 0, -majorTickHeight - 0.15)), "#ffffff");

  scene.add(group);
  return group;
}

function createPreviewScene(container: HTMLElement): PreviewContext {
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 400;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2a2e);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 1000);
  camera.position.set(3, 2, 3);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.5, 0);
  controls.update();

  const ambient = new THREE.HemisphereLight(0xddeeff, 0x8899aa, 1.2);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  const gridHelper = new THREE.GridHelper(10, 20, 0x555555, 0x333333);
  scene.add(gridHelper);

  // CSS2D Renderer for labels
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  // Scale bar
  const scaleBarGroup = createScaleBar(scene, {
    length: DEFAULT_SCALE_BAR_LENGTH,
    tickInterval: DEFAULT_SCALE_BAR_TICK_INTERVAL,
    majorTickInterval: DEFAULT_SCALE_BAR_TICK_INTERVAL,
  });

  // Front direction arrow (initially hidden)
  const frontArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1), // +Z direction
    new THREE.Vector3(0, 0, 0),
    1, // length
    0x00ff88, // color
    0.2, // head length
    0.1, // head width
  );
  frontArrow.visible = false;
  scene.add(frontArrow);

  const roadReferenceGroup = createRoadReferenceGroup();
  scene.add(roadReferenceGroup);

  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    wireframe: true,
  });

  const selectionHelper = createSelectionHelper(container);

  const ctx: PreviewContext = {
    renderer,
    scene,
    camera,
    controls,
    animId: 0,
    currentModel: null,
    bboxHelper: null,
    gridHelper,
    wireframeMaterial,
    originalMaterials: new Map(),
    selectionBox: null,
    selectionHelper,
    labelRenderer,
    scaleBarGroup,
    frontArrow,
    roadReferenceGroup,
  };

  function animate() {
    ctx.animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();

  const onResize = () => {
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 400;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  };
  const resizeObs = new ResizeObserver(onResize);
  resizeObs.observe(container);

  return ctx;
}

function loadModelIntoPreview(
  ctx: PreviewContext,
  glbUrl: string,
): Promise<{ model: THREE.Group; children: SceneChildInfo[] }> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        // Remove previous model
        if (ctx.currentModel) {
          ctx.scene.remove(ctx.currentModel);
          ctx.currentModel.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).geometry.dispose();
            }
          });
        }
        if (ctx.bboxHelper) {
          ctx.scene.remove(ctx.bboxHelper);
          ctx.bboxHelper = null;
        }
        ctx.originalMaterials.clear();

        const model = gltf.scene;
        ctx.currentModel = model;
        ctx.scene.add(model);

        // Center model
        const box = getObjectBoundingBox(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += size.y / 2;

        // Fit camera
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 1.8;
        ctx.camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
        ctx.controls.target.set(0, size.y / 2, 0);
        ctx.controls.update();

        // Analyze children
        const children = analyzeChildren(model);
        resolve({ model, children });
      },
      undefined,
      (err) => reject(err),
    );
  });
}

function analyzeChildren(model: THREE.Group): SceneChildInfo[] {
  const children: SceneChildInfo[] = [];
  const meshGroups = new Map<string, number[]>();

  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry;
      const vCount = geom.attributes.position ? geom.attributes.position.count : 0;
      const fCount = geom.index ? geom.index.count / 3 : vCount / 3;

      const size = getDimensionsFromObject(mesh) ?? { width: 0, height: 0, depth: 0 };

      const info: SceneChildInfo = {
        name: mesh.name || `unnamed_${children.length}`,
        type: mesh.type,
        vertexCount: vCount,
        faceCount: Math.round(fCount),
        uuid: mesh.uuid,
        bbox: { w: size.width, h: size.height, d: size.depth },
        isDuplicate: false,
        duplicateGroup: -1,
      };
      children.push(info);

      // Duplicate key: vertex count + rounded bbox
      const key = `${vCount}|${size.width.toFixed(DIMENSION_DUP_KEY_DECIMALS)}|${size.height.toFixed(DIMENSION_DUP_KEY_DECIMALS)}|${size.depth.toFixed(DIMENSION_DUP_KEY_DECIMALS)}`;
      if (!meshGroups.has(key)) meshGroups.set(key, []);
      meshGroups.get(key)!.push(children.length - 1);
    }
  });

  // Mark duplicates
  let groupIdx = 0;
  for (const indices of meshGroups.values()) {
    if (indices.length > 1) {
      for (const idx of indices) {
        children[idx].isDuplicate = true;
        children[idx].duplicateGroup = groupIdx;
      }
      groupIdx++;
    }
  }

  return children;
}

function toggleWireframe(ctx: PreviewContext, enabled: boolean) {
  if (!ctx.currentModel) return;
  ctx.currentModel.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (enabled) {
        ctx.originalMaterials.set(mesh, mesh.material as THREE.Material | THREE.Material[]);
        mesh.material = ctx.wireframeMaterial;
      } else {
        const orig = ctx.originalMaterials.get(mesh);
        if (orig) mesh.material = orig;
      }
    }
  });
}

function toggleBbox(ctx: PreviewContext, show: boolean) {
  if (!ctx.currentModel) return;
  if (show) {
    if (ctx.bboxHelper) ctx.scene.remove(ctx.bboxHelper);
    const box = getObjectBoundingBox(ctx.currentModel);
    ctx.bboxHelper = new THREE.Box3Helper(box, 0x00ff88);
    ctx.scene.add(ctx.bboxHelper);
  } else {
    if (ctx.bboxHelper) {
      ctx.scene.remove(ctx.bboxHelper);
      ctx.bboxHelper = null;
    }
  }
}

function zoomToFit(ctx: PreviewContext) {
  if (!ctx.currentModel) return;
  const box = getObjectBoundingBox(ctx.currentModel);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 1.8;
  ctx.camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
  ctx.controls.target.copy(center);
  ctx.controls.update();
}

function applyScale(ctx: PreviewContext, factor: number) {
  if (!ctx.currentModel) return;
  ctx.currentModel.scale.setScalar(factor);
  zoomToFit(ctx);
}

function applyYaw(ctx: PreviewContext, yawDeg: number) {
  if (!ctx.currentModel) return;
  // Normalize yaw to [0, 360)
  const normalizedYaw = normalizeYawDeg(yawDeg);
  ctx.currentModel.rotation.y = (normalizedYaw * Math.PI) / 180;
}

function replaceRoadReferenceGroup(ctx: PreviewContext, policy: OrientationPolicy = "face_road") {
  if (ctx.roadReferenceGroup) {
    disposeObjectTree(ctx.roadReferenceGroup);
    if (ctx.roadReferenceGroup.parent) {
      ctx.roadReferenceGroup.parent.remove(ctx.roadReferenceGroup);
    }
  }
  const box = ctx.currentModel ? getObjectBoundingBox(ctx.currentModel) : undefined;
  ctx.roadReferenceGroup = createRoadReferenceGroup(box, policy);
  ctx.scene.add(ctx.roadReferenceGroup);
}

function updateFrontArrow(ctx: PreviewContext, frontDirection: string, yawDeg: number = 0) {
  if (!ctx.frontArrow) return;
  const dir = rotateLocalDirection(frontDirection, yawDeg);
  if (ctx.currentModel) {
    const box = getObjectBoundingBox(ctx.currentModel);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const horizontalSpan = Math.max(size.x, size.z, 1);
      const distances: number[] = [];
      if (Math.abs(dir.x) > 1e-4) {
        distances.push((dir.x > 0 ? box.max.x - center.x : center.x - box.min.x) / Math.abs(dir.x));
      }
      if (Math.abs(dir.z) > 1e-4) {
        distances.push((dir.z > 0 ? box.max.z - center.z : center.z - box.min.z) / Math.abs(dir.z));
      }
      const positiveDistances = distances.filter((value) => Number.isFinite(value) && value > 0);
      const edgeDistance = positiveDistances.length > 0 ? Math.min(...positiveDistances) : horizontalSpan * 0.5;
      const outsidePadding = clampNumber(horizontalSpan * 0.08, 0.6, 8);
      const length = Math.max(1.2, edgeDistance + outsidePadding);
      const headLength = clampNumber(length * 0.12, 0.2, 2.5);
      const headWidth = clampNumber(headLength * 0.45, 0.1, 1.4);
      center.y = box.max.y + clampNumber(Math.max(size.y * 0.05, horizontalSpan * 0.025), 0.35, 3);
      ctx.frontArrow.position.copy(center);
      ctx.frontArrow.setLength(length, headLength, headWidth);
    }
  }
  ctx.frontArrow.setDirection(dir);
  ctx.frontArrow.visible = true;
}

function getModelDimensions(ctx: PreviewContext): DimensionRecord | null {
  if (!ctx.currentModel) return null;
  return getDimensionsFromObject(ctx.currentModel);
}

function getBottomCenterOffset(target: THREE.Object3D): THREE.Vector3 | null {
  const box = getObjectBoundingBox(target);
  if (box.isEmpty()) return null;
  const bottomCenter = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    box.min.y,
    (box.min.z + box.max.z) / 2,
  );
  return bottomCenter;
}

function needsBottomCenterOriginFix(offset: THREE.Vector3 | null): offset is THREE.Vector3 {
  return Boolean(offset && offset.length() > ORIGIN_AUTO_FIX_EPSILON_M);
}

function alignBottomCenterToOrigin(target: THREE.Object3D, offset: THREE.Vector3): void {
  target.position.sub(offset);
  target.updateMatrixWorld(true);
}

function exportGlb(scene: THREE.Object3D): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        resolve(result as ArrayBuffer);
      },
      (error) => reject(error),
      { binary: true },
    );
  });
}

function triggerDownload(data: ArrayBuffer, filename: string) {
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function arrayBufferToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function collectModelMeshes(model: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes.push(child as THREE.Mesh);
    }
  });
  return meshes;
}

function splitMergedMeshByConnectivity(
  mesh: THREE.Mesh,
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): THREE.Mesh[] {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  if (!position || position.count < 6) return [mesh];

  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  if (triangleCount <= 1 || triangleCount > 250_000) return [mesh];

  const parents = Array.from({ length: triangleCount }, (_, triangleIndex) => triangleIndex);
  const firstTriangleByVertex = new Map<string, number>();
  const find = (triangleIndex: number): number => {
    while (parents[triangleIndex] !== triangleIndex) {
      parents[triangleIndex] = parents[parents[triangleIndex]];
      triangleIndex = parents[triangleIndex];
    }
    return triangleIndex;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents[rootB] = rootA;
  };
  const sourceVertexIndex = (triangleIndex: number, corner: number): number => (
    index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner
  );
  const sourceMaterialIndexByTriangle = Array.from({ length: triangleCount }, () => 0);
  for (const group of geometry.groups) {
    const firstTriangle = Math.floor(group.start / 3);
    const lastTriangle = Math.ceil((group.start + group.count) / 3);
    for (let triangleIndex = firstTriangle; triangleIndex < lastTriangle && triangleIndex < triangleCount; triangleIndex += 1) {
      sourceMaterialIndexByTriangle[triangleIndex] = group.materialIndex ?? 0;
    }
  }
  const vertexKey = (vertexIndex: number): string => (
    `${position.getX(vertexIndex).toFixed(5)},${position.getY(vertexIndex).toFixed(5)},${position.getZ(vertexIndex).toFixed(5)}`
  );

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const key = vertexKey(sourceVertexIndex(triangleIndex, corner));
      const firstTriangle = firstTriangleByVertex.get(key);
      if (firstTriangle === undefined) {
        firstTriangleByVertex.set(key, triangleIndex);
      } else {
        union(triangleIndex, firstTriangle);
      }
    }
  }

  const trianglesByComponent = new Map<number, number[]>();
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const root = find(triangleIndex);
    const triangles = trianglesByComponent.get(root) ?? [];
    triangles.push(triangleIndex);
    trianglesByComponent.set(root, triangles);
  }
  if (trianglesByComponent.size <= 1) return [mesh];

  const attributesToCopy = ["position", "normal", "uv", "uv2", "color"].filter((name) => Boolean(geometry.attributes[name]));
  const components: THREE.Mesh[] = [];
  let componentIndex = 1;

  for (const triangles of trianglesByComponent.values()) {
    if (triangles.length === 0) continue;
    const componentGeometry = new THREE.BufferGeometry();
    for (const attributeName of attributesToCopy) {
      const source = geometry.attributes[attributeName] as THREE.BufferAttribute;
      const values: number[] = [];
      for (const triangleIndex of triangles) {
        for (let corner = 0; corner < 3; corner += 1) {
          const vertexIndex = sourceVertexIndex(triangleIndex, corner);
          for (let item = 0; item < source.itemSize; item += 1) {
            values.push(source.getComponent(vertexIndex, item));
          }
        }
      }
      componentGeometry.setAttribute(
        attributeName,
        new THREE.Float32BufferAttribute(values, source.itemSize),
      );
    }
    if (!componentGeometry.attributes.normal) {
      componentGeometry.computeVertexNormals();
    }
    if (Array.isArray(mesh.material)) {
      let groupStart = 0;
      let activeMaterialIndex = sourceMaterialIndexByTriangle[triangles[0]] ?? 0;
      for (let localTriangleIndex = 1; localTriangleIndex < triangles.length; localTriangleIndex += 1) {
        const materialIndex = sourceMaterialIndexByTriangle[triangles[localTriangleIndex]] ?? 0;
        if (materialIndex !== activeMaterialIndex) {
          componentGeometry.addGroup(groupStart, localTriangleIndex * 3 - groupStart, activeMaterialIndex);
          groupStart = localTriangleIndex * 3;
          activeMaterialIndex = materialIndex;
        }
      }
      componentGeometry.addGroup(groupStart, triangles.length * 3 - groupStart, activeMaterialIndex);
    }

    const component = new THREE.Mesh(componentGeometry, originalMaterials?.get(mesh) ?? mesh.material);
    component.name = `${mesh.name || "component"}_${componentIndex}`;
    component.matrix.copy(mesh.matrixWorld);
    component.matrix.decompose(component.position, component.quaternion, component.scale);
    component.updateMatrixWorld(true);
    components.push(component);
    componentIndex += 1;
  }

  return components.length > 1 ? components : [mesh];
}

function collectAutoSplitUnits(
  model: THREE.Object3D,
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): THREE.Mesh[] {
  const meshes = collectModelMeshes(model);
  if (meshes.length !== 1) return meshes;
  return splitMergedMeshByConnectivity(meshes[0], originalMaterials);
}

function meshWorldBox(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(mesh);
}

function footprintGap(a: THREE.Box3, b: THREE.Box3): number {
  const gapX = Math.max(0, Math.max(b.min.x - a.max.x, a.min.x - b.max.x));
  const gapZ = Math.max(0, Math.max(b.min.z - a.max.z, a.min.z - b.max.z));
  return Math.hypot(gapX, gapZ);
}

function clusterMeshesByFootprint(meshes: THREE.Mesh[]): THREE.Mesh[][] {
  if (meshes.length <= 1) return meshes.map((mesh) => [mesh]);

  const entries = meshes.map((mesh) => {
    const box = meshWorldBox(mesh);
    const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    return { mesh, box, footprint };
  });
  const sortedFootprints = entries
    .map((entry) => entry.footprint)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianFootprint = sortedFootprints[Math.floor(sortedFootprints.length / 2)] ?? 1;
  const globalBox = new THREE.Box3();
  entries.forEach((entry) => globalBox.union(entry.box));
  const globalFootprint = Math.max(globalBox.max.x - globalBox.min.x, globalBox.max.z - globalBox.min.z);
  const mergeGap = Math.max(0.25, medianFootprint * 0.35, globalFootprint * 0.02);
  const parents = entries.map((_, index) => index);

  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents[rootB] = rootA;
  };

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (footprintGap(entries[i].box, entries[j].box) <= mergeGap) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, THREE.Mesh[]>();
  entries.forEach((entry, index) => {
    const root = find(index);
    const cluster = clusters.get(root) ?? [];
    cluster.push(entry.mesh);
    clusters.set(root, cluster);
  });

  return Array.from(clusters.values()).sort((a, b) => {
    const aCenter = new THREE.Box3().setFromObject(a[0]).getCenter(new THREE.Vector3());
    const bCenter = new THREE.Box3().setFromObject(b[0]).getCenter(new THREE.Vector3());
    return aCenter.x - bCenter.x || aCenter.z - bCenter.z;
  });
}

function cloneTextureForGlbExport(texture: THREE.Texture): THREE.Texture {
  const image = texture.image as CanvasImageSource | { width?: number; height?: number } | undefined;
  const width = Number((image as { width?: number } | undefined)?.width ?? 0);
  const height = Number((image as { height?: number } | undefined)?.height ?? 0);
  if (!image || width <= 0 || height <= 0) {
    return texture.clone();
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return texture.clone();
    ctx.drawImage(image as CanvasImageSource, 0, 0, width, height);

    const cloned = new THREE.CanvasTexture(canvas);
    cloned.name = texture.name;
    cloned.mapping = texture.mapping;
    cloned.channel = texture.channel;
    cloned.wrapS = texture.wrapS;
    cloned.wrapT = texture.wrapT;
    cloned.magFilter = texture.magFilter;
    cloned.minFilter = texture.minFilter;
    cloned.anisotropy = texture.anisotropy;
    cloned.format = texture.format;
    cloned.type = texture.type;
    cloned.colorSpace = texture.colorSpace;
    cloned.flipY = texture.flipY;
    cloned.generateMipmaps = texture.generateMipmaps;
    cloned.premultiplyAlpha = texture.premultiplyAlpha;
    cloned.unpackAlignment = texture.unpackAlignment;
    cloned.offset.copy(texture.offset);
    cloned.repeat.copy(texture.repeat);
    cloned.center.copy(texture.center);
    cloned.rotation = texture.rotation;
    cloned.matrix.copy(texture.matrix);
    cloned.matrixAutoUpdate = texture.matrixAutoUpdate;
    cloned.userData = { ...texture.userData };
    cloned.needsUpdate = true;
    return cloned;
  } catch {
    return texture.clone();
  }
}

function makeMaterialExportable(material: THREE.Material): THREE.Material {
  const cloned = material.clone();
  const textureSlots = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "emissiveMap",
    "aoMap",
    "alphaMap",
    "bumpMap",
    "displacementMap",
    "lightMap",
    "specularMap",
    "envMap",
  ];
  const record = cloned as unknown as Record<string, unknown>;
  for (const slot of textureSlots) {
    const value = record[slot];
    if (value instanceof THREE.Texture) {
      record[slot] = cloneTextureForGlbExport(value);
    }
  }
  cloned.needsUpdate = true;
  return cloned;
}

function cloneExportMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  return Array.isArray(material)
    ? material.map((item) => makeMaterialExportable(item))
    : makeMaterialExportable(material);
}

function cloneObjectForGlbExport(
  target: THREE.Object3D,
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): THREE.Object3D {
  const cloned = target.clone(true);
  const sourceMeshes = collectModelMeshes(target);
  const clonedMeshes = collectModelMeshes(cloned);
  for (let i = 0; i < clonedMeshes.length; i += 1) {
    const sourceMesh = sourceMeshes[i];
    const clonedMesh = clonedMeshes[i];
    if (!sourceMesh || !clonedMesh) continue;
    clonedMesh.material = cloneExportMaterial(originalMaterials?.get(sourceMesh) ?? sourceMesh.material);
  }
  return cloned;
}

function buildClusterExport(
  meshes: THREE.Mesh[],
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): {
  scene: THREE.Scene;
  group: THREE.Group;
  dimensions: DimensionRecord | null;
  faceCount: number;
  vertexCount: number;
} {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const clusterBox = new THREE.Box3();
  let faceCount = 0;
  let vertexCount = 0;

  for (const mesh of meshes) {
    const box = meshWorldBox(mesh);
    clusterBox.union(box);
    const position = mesh.geometry.attributes.position;
    const vertices = position ? position.count : 0;
    vertexCount += vertices;
    faceCount += Math.round(mesh.geometry.index ? mesh.geometry.index.count / 3 : vertices / 3);
  }

  const center = clusterBox.getCenter(new THREE.Vector3());
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const clone = mesh.clone(false);
    clone.geometry = mesh.geometry.clone();
    clone.material = cloneExportMaterial(originalMaterials?.get(mesh) ?? mesh.material);
    clone.matrix.copy(mesh.matrixWorld);
    clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
    clone.position.sub(center);
    group.add(clone);
  }

  scene.add(group);
  return {
    scene,
    group,
    dimensions: getDimensionsFromObject(group),
    faceCount,
    vertexCount,
  };
}

function makeUniqueSubAssetId(parentId: string, startIndex: number, existingIds: Set<string>): string {
  let index = startIndex;
  let assetId = `${parentId}-sub-${index}`;
  while (existingIds.has(assetId)) {
    index += 1;
    assetId = `${parentId}-sub-${index}`;
  }
  return assetId;
}

function makeUniqueAssetId(baseId: string, existingIds: Set<string>): string {
  let assetId = baseId;
  let index = 2;
  while (existingIds.has(assetId)) {
    assetId = `${baseId}-${index}`;
    index += 1;
  }
  return assetId;
}

function buildSubAssetRecord(
  parent: AssetRecord,
  assetId: string,
  subIndex: number,
  dimensions: DimensionRecord | null,
  faceCount: number,
  vertexCount: number,
): AssetRecord {
  return {
    ...parent,
    asset_id: assetId,
    mesh_path: "",
    latent_path: undefined,
    split: `sub-${subIndex}`,
    source: parent.source ?? "asset_editor_split",
    text_desc: `${parent.text_desc ?? parent.category ?? "asset"} (auto split sub ${subIndex})`,
    scale: 1,
    yaw_deg: 0,
    dimensions_m: dimensions ?? undefined,
    face_count: faceCount,
    mesh_face_count: faceCount,
    quality_metrics: {
      ...(parent.quality_metrics ?? {}),
      face_count: faceCount,
      vertex_count: vertexCount,
    },
    parent_asset_id: parent.asset_id,
  };
}

function sphereCandidateScore(mesh: THREE.Mesh): number {
  const box = meshWorldBox(mesh);
  const size = box.getSize(new THREE.Vector3());
  const dims = [size.x, size.y, size.z].filter((value) => Number.isFinite(value) && value > 0);
  if (dims.length !== 3) return Number.POSITIVE_INFINITY;
  const minDim = Math.min(...dims);
  const maxDim = Math.max(...dims);
  const ratioPenalty = maxDim / minDim - 1;
  if (ratioPenalty > 0.35) return Number.POSITIVE_INFINITY;
  const position = mesh.geometry.attributes.position;
  const vertexBonus = position ? Math.min(0.2, position.count / 50000) : 0;
  return ratioPenalty - vertexBonus - maxDim * 0.001;
}

function pickSkySphereCandidate(meshes: THREE.Mesh[]): THREE.Mesh | null {
  const candidates = meshes
    .map((mesh) => ({ mesh, score: sphereCandidateScore(mesh) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score);
  return candidates[0]?.mesh ?? null;
}

function createProceduralSkyDomeExport(): {
  scene: THREE.Scene;
  dimensions: DimensionRecord;
  faceCount: number;
  vertexCount: number;
} {
  const radius = 100;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#7fb7ff");
    gradient.addColorStop(0.45, "#cfe9ff");
    gradient.addColorStop(1, "#fff1d2");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const geometry = new THREE.SphereGeometry(radius, 64, 32);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    fog: false,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = "procedural_sky_dome";

  const scene = new THREE.Scene();
  scene.add(dome);
  return {
    scene,
    dimensions: { width: radius * 2, height: radius * 2, depth: radius * 2 },
    faceCount: geometry.index ? Math.round(geometry.index.count / 3) : 0,
    vertexCount: geometry.attributes.position?.count ?? 0,
  };
}

function buildSkyDomeRecord(
  parent: AssetRecord,
  assetId: string,
  dimensions: DimensionRecord | null,
  faceCount: number,
  vertexCount: number,
  mode: "extracted" | "procedural",
): AssetRecord {
  return {
    ...parent,
    asset_id: assetId,
    category: "sky_dome",
    mesh_path: "",
    latent_path: undefined,
    source: mode === "extracted" ? "asset_editor_sky_dome_extract" : "asset_editor_sky_dome_procedural",
    split: mode === "extracted" ? "sky-dome" : undefined,
    text_desc: mode === "extracted"
      ? `${parent.text_desc ?? parent.category ?? "asset"} (extracted sky dome)`
      : "Procedural gradient sky dome generated in Asset Editor",
    tags: Array.from(new Set([...(parent.tags ?? []), "sky", "sky_dome", mode])),
    scene_eligible: true,
    scale: 1,
    yaw_deg: 0,
    dimensions_m: dimensions ?? undefined,
    face_count: faceCount,
    mesh_face_count: faceCount,
    quality_metrics: {
      ...(parent.quality_metrics ?? {}),
      face_count: faceCount,
      vertex_count: vertexCount,
    },
    origin_alignment: "center",
    parent_asset_id: parent.asset_id,
  };
}

/* ── Selection Box (Rectangle Selection) ──────────────────────────── */

function createSelectionHelper(container: HTMLElement): SelectionHelper {
  const element = document.createElement("div");
  element.style.cssText = `
    position: absolute;
    border: 2px dashed #00a8ff;
    background: rgba(0, 168, 255, 0.1);
    pointer-events: none;
    display: none;
    z-index: 100;
  `;
  container.style.position = "relative";
  container.appendChild(element);

  return {
    element,
    startPoint: new THREE.Vector2(),
    pointTopLeft: new THREE.Vector2(),
    pointBottomRight: new THREE.Vector2(),
    isDown: false,
    enabled: false,
  };
}

function updateSelectionBox(
  helper: SelectionHelper,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
) {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  helper.element.style.left = `${x}px`;
  helper.element.style.top = `${y}px`;
  helper.element.style.width = `${width}px`;
  helper.element.style.height = `${height}px`;
  helper.element.style.display = "block";

  helper.pointTopLeft.set(x, y);
  helper.pointBottomRight.set(x + width, y + height);
}

function hideSelectionBox(helper: SelectionHelper) {
  helper.element.style.display = "none";
  helper.isDown = false;
}

function getMeshesInSelectionArea(
  ctx: PreviewContext,
  helper: SelectionHelper,
): THREE.Mesh[] {
  if (!ctx.currentModel) return [];

  const rect = ctx.renderer.domElement.getBoundingClientRect();
  const selectedMeshes: THREE.Mesh[] = [];

  ctx.currentModel.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;

    // Get mesh bounding box center in screen space
    const box = getObjectBoundingBox(mesh);
    const center = box.getCenter(new THREE.Vector3());
    center.project(ctx.camera);

    const screenX = (center.x * 0.5 + 0.5) * rect.width;
    const screenY = (-center.y * 0.5 + 0.5) * rect.height;

    // Check if center is within selection box
    if (
      screenX >= helper.pointTopLeft.x &&
      screenX <= helper.pointBottomRight.x &&
      screenY >= helper.pointTopLeft.y &&
      screenY <= helper.pointBottomRight.y
    ) {
      selectedMeshes.push(mesh);
    }
  });

  return selectedMeshes;
}

function highlightMesh(ctx: PreviewContext, mesh: THREE.Mesh, highlighted: boolean) {
  if (highlighted) {
    if (!ctx.originalMaterials.has(mesh)) {
      ctx.originalMaterials.set(mesh, mesh.material as THREE.Material | THREE.Material[]);
    }
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.5,
    });
    mesh.material = highlightMaterial;
  } else {
    const original = ctx.originalMaterials.get(mesh);
    if (original) {
      mesh.material = original;
    }
  }
}

function deleteSelectedMeshes(ctx: PreviewContext, meshes: THREE.Mesh[]): number {
  let deletedCount = 0;
  for (const mesh of meshes) {
    if (mesh.parent) {
      mesh.parent.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
      deletedCount++;
    }
  }
  ctx.originalMaterials.clear();
  return deletedCount;
}

/* ── Toast ─────────────────────────────────────────────────────────── */

function showToast(root: HTMLElement, message: string, type: "success" | "error" = "success") {
  let container = root.querySelector(".ae-toast-container") as HTMLDivElement;
  if (!container) {
    container = document.createElement("div");
    container.className = "ae-toast-container";
    root.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `ae-toast ae-toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("ae-toast-show"), 10);
  setTimeout(() => {
    toast.classList.remove("ae-toast-show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ── Main Mount ────────────────────────────────────────────────────── */

export function mountAssetEditor(shell: DesktopShell, workflow?: WorkflowController): () => void {
  const root = shell.root;
  const state: AssetEditorState = {
    manifestName: "",
    manifestCatalog: [],
    currentManifest: null,
    assets: [],
    filteredAssets: [],
    selectedAssetId: null,
    selectedAssetIds: new Set(),
    selectedObjects: new Set(),
    scaleValue: 1,
    renderMode: "solid",
    searchQuery: "",
    categoryFilter: "",
    qualityTierFilter: "",
    eligibilityFilter: "",
    sceneChildren: [],
    selectionMode: false,
    selectedMeshes: new Set(),
    originAutoAlignEnabled: localStorage.getItem("roadgen3d.assetEditor.originAutoAlign") === "true",
    dragMoveMode: false,
    totalAssets: 0,
    loadedOffset: 0,
    hasMoreAssets: false,
    isLoadingMore: false,
    yawValue: 0,
    frontDirection: "+Z",
    modelDimensions: null,
    originalDimensions: null,
  };
  let previewCtx: PreviewContext | null = null;
  let destroyed = false;
  let currentLanguage = loadViewerLanguage();
  const languageController = new AbortController();
  const shellRoot = root.querySelector<HTMLElement>(".desktop-shell");
  if (shell.mode === "legacy_dual") shellRoot?.classList.add("desktop-shell-left-pinned");
  const leftPinButton = root.querySelector<HTMLButtonElement>("[data-shell-left-pin]");
  if (leftPinButton) {
    leftPinButton.setAttribute("aria-pressed", "true");
    leftPinButton.textContent = translateViewerKey(currentLanguage, "shell.pinned") ?? "Pinned";
    leftPinButton.title = translateViewerKey(currentLanguage, "shell.unpinLeft") ?? "Unpin left sidebar";
  }

  // Build the unified header
  shell.setHints([
    { key: "assetEditor.hints.pickManifest" },
    { key: "assetEditor.hints.centerWorkspace" },
    { key: "assetEditor.hints.rightInspector" },
  ]);
  shell.setLeftSections([
    {
      id: "asset-library",
      title: "资产库",
      subtitle: "清单、筛选与检查",
      content: `
        <div class="desktop-shell-form-stack ae-library-controls">
          <label class="desktop-shell-field">
            <span data-i18n-key="assetEditor.manifest">Manifest</span>
            <select id="ae-manifest-select" class="ae-manifest-select" title="Manifest" data-i18n-title-key="assetEditor.manifest">
              <option value="">-- Select Manifest --</option>
            </select>
            <button id="ae-use-manifest-for-generation" class="ae-action-btn ae-btn-primary" type="button" disabled data-i18n-key="professional.assets.useManifest">Add to candidate repository</button>
            <span id="ae-generation-manifest-status" class="desktop-shell-field-note" data-i18n-key="professional.assets.useManifestHint">Select and inspect a manifest, then confirm it as the 3D preparation branch.</span>
          </label>
          <input id="ae-search" type="text" placeholder="Search assets..." class="ae-search-input" />
          <select id="ae-category-filter" class="ae-filter-select">
            <option value="">All Categories</option>
          </select>
          <select id="ae-tier-filter" class="ae-filter-select">
            <option value="">All Tiers</option>
            <option value="5">T5 — Excellent</option>
            <option value="4">T4 — Good</option>
            <option value="3">T3 — Production</option>
            <option value="2">T2 — Moderate</option>
            <option value="1">T1 — Low-poly</option>
            <option value="0">T0 — Unusable</option>
          </select>
          <select id="ae-eligibility-filter" class="ae-filter-select">
            <option value="">All Eligibility</option>
            <option value="eligible">Enabled for generation</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div class="asset-gallery-panel asset-gallery-panel-shell">
          <div class="ae-gallery-stats" id="ae-gallery-stats"></div>
          <div class="ae-bulk-toolbar" id="ae-bulk-toolbar">
            <button id="ae-select-filtered-btn" class="ae-bulk-btn" type="button">Select Filtered</button>
            <button id="ae-clear-selection-btn" class="ae-bulk-btn" type="button" disabled>Clear</button>
            <span class="ae-bulk-spacer"></span>
            <button id="ae-enable-selected-btn" class="ae-bulk-btn ae-bulk-btn-safe" type="button" disabled>Enable Selected</button>
            <button id="ae-disable-selected-btn" class="ae-bulk-btn ae-bulk-btn-danger" type="button" disabled>Disable Selected</button>
            <button id="ae-disable-filtered-btn" class="ae-bulk-btn ae-bulk-btn-danger" type="button" disabled>Disable Filtered</button>
            <button id="ae-disable-manifest-btn" class="ae-bulk-btn ae-bulk-btn-danger" type="button" disabled>Disable Manifest</button>
          </div>
          <div class="ae-asset-table-wrap">
            <table class="ae-asset-table">
              <thead>
                <tr>
                  <th class="ae-select-cell"><input id="ae-select-all-filtered" type="checkbox" aria-label="Select all filtered assets" /></th>
                  <th>Asset</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Tier</th>
                  <th>Source</th>
                  <th>Faces</th>
                </tr>
              </thead>
              <tbody id="ae-gallery-grid"></tbody>
            </table>
          </div>
          <div class="ae-load-more-section" id="ae-load-more-section" style="display:none;">
            <button id="ae-load-more-btn" class="ae-load-more-btn" type="button">Load More</button>
            <span id="ae-load-more-info" class="ae-load-more-info"></span>
          </div>
        </div>
      `,
      open: true,
    },
    {
      id: "asset-candidates",
      title: "候选仓库",
      subtitle: "用于 02 场景生成",
      content: `
        <section class="ae-candidate-repository" aria-labelledby="ae-candidate-repository-title">
          <header>
            <span>01B / CANDIDATE REPOSITORY</span>
            <h3 id="ae-candidate-repository-title">本次候选资产仓库</h3>
            <p>这些资产会进入检索池，但不保证出现在最终场景中。</p>
          </header>
          <div id="ae-candidate-repository-summary" class="ae-candidate-summary" role="status"></div>
          <div id="ae-candidate-repository-list" class="ae-candidate-list"></div>
        </section>
      `,
    },
  ]);
  shell.setRightTabs(
    [
      {
        id: "metadata",
        label: "Metadata",
        content: `
          <section class="ae-info-section" id="ae-info-section">
            <h3 class="ae-section-title">Asset Information</h3>
            <div class="ae-info-grid" id="ae-info-grid"></div>
          </section>
        `,
      },
      {
        id: "objects",
        label: "Objects",
        content: `
          <section class="ae-objects-section" id="ae-objects-section" style="display:none;">
            <h3 class="ae-section-title">Scene Objects <span id="ae-dup-count" class="ae-dup-badge" style="display:none;"></span></h3>
            <div class="ae-object-list" id="ae-object-list"></div>
          </section>
        `,
      },
      {
        id: "export",
        label: "Export",
        content: `
          <div class="ae-actions-bar ae-actions-bar-shell">
            <button id="ae-save-btn" class="ae-action-btn ae-btn-primary" disabled>Save</button>
            <button id="ae-export-btn" class="ae-action-btn">Export GLB</button>
            <span class="ae-actions-sep"></span>
            <div class="ae-scale-group">
              <label class="ae-scale-label">Scale:</label>
              <input id="ae-scale-input" type="number" class="ae-scale-input" value="1" min="0.01" max="100" step="0.1" />
            </div>
            <div class="ae-orientation-group">
              <label class="ae-yaw-label">Yaw (°):</label>
              <input id="ae-yaw-input" type="number" class="ae-yaw-input" value="0" min="-180" max="360" step="1" />
            </div>
            <div class="ae-front-group">
              <label class="ae-front-label">Front:</label>
              <select id="ae-front-select" class="ae-front-select">
                <option value="+X">+X</option>
                <option value="-X">-X</option>
                <option value="+Z" selected>+Z</option>
                <option value="-Z">-Z</option>
              </select>
            </div>
            <div id="ae-orientation-status" class="ae-orientation-status">Road +T/-T: ±X · Face road: +Z</div>
            <span class="ae-actions-sep"></span>
            <button id="ae-remove-dups-btn" class="ae-action-btn ae-btn-warning" disabled>Remove Duplicates</button>
            <button id="ae-auto-split-records-btn" class="ae-action-btn ae-btn-secondary" disabled>Auto Split Records</button>
            <button id="ae-backend-split-btn" class="ae-action-btn ae-btn-primary" disabled>Backend Auto Split</button>
            <button id="ae-extract-sky-btn" class="ae-action-btn ae-btn-secondary" disabled>Extract Sky Dome</button>
            <button id="ae-split-btn" class="ae-action-btn ae-btn-secondary" disabled>Split Selected</button>
          </div>
        `,
      },
    ],
    "metadata",
  );
  shell.statusStatusHost.innerHTML = `<div class="desktop-shell-inline-status" data-i18n-key="assetEditor.status.ready">Asset editor ready.</div>`;
  shell.setStatusSummary({ key: "assetEditor.status.ready" });
  shell.centerStage.innerHTML = `
    <div class="asset-editor-shell-stage">
      <div id="ae-empty-state" class="ae-empty-state">
        <div class="ae-empty-icon">&#9881;</div>
        <strong id="ae-empty-title">正在连接真实 3D 资产检查器</strong>
        <p id="ae-empty-message">正在恢复资产清单并加载首个可检查模型。</p>
      </div>
      <div class="ae-detail-content" id="ae-detail-content" style="display:none;">
        <div class="ae-preview-section">
          <div class="ae-preview-toolbar">
            <button id="ae-mode-solid" class="ae-toolbar-btn active" title="Solid render">Solid</button>
            <button id="ae-mode-wire" class="ae-toolbar-btn" title="Wireframe">Wire</button>
            <span class="ae-toolbar-sep"></span>
            <button id="ae-toggle-bbox" class="ae-toolbar-btn" title="Bounding box">BBox</button>
            <button id="ae-zoom-fit" class="ae-toolbar-btn" title="Zoom to fit">Fit</button>
            <span class="ae-toolbar-sep"></span>
            <button id="ae-toggle-select" class="ae-toolbar-btn" title="Rectangle selection mode">Select</button>
            <button id="ae-delete-selected" class="ae-toolbar-btn ae-btn-danger" title="Delete selected objects" disabled>Delete</button>
            <span class="ae-toolbar-sep"></span>
            <button id="ae-delete-record" class="ae-toolbar-btn ae-btn-danger" title="Delete this asset from manifest" disabled>Del Record</button>
          </div>
          <div class="ae-preview-canvas" id="ae-preview-canvas"></div>
        </div>
      </div>
      <div id="ae-detail-panel" hidden></div>
      <button id="ae-back-btn" type="button" hidden>Back to Viewer</button>
    </div>
  `;

  /* ── DOM refs ──────────────────────────────────────────────────── */
  const manifestSelect = qs<HTMLSelectElement>(root, "#ae-manifest-select");
  const useManifestBtn = qs<HTMLButtonElement>(root, "#ae-use-manifest-for-generation");
  const generationManifestStatus = qs<HTMLElement>(root, "#ae-generation-manifest-status");
  const candidateRepositorySummary = qs<HTMLElement>(root, "#ae-candidate-repository-summary");
  const candidateRepositoryList = qs<HTMLElement>(root, "#ae-candidate-repository-list");
  const backBtn = qs<HTMLButtonElement>(root, "#ae-back-btn");
  const searchInput = qs<HTMLInputElement>(root, "#ae-search");
  const categoryFilter = qs<HTMLSelectElement>(root, "#ae-category-filter");
  const tierFilter = qs<HTMLSelectElement>(root, "#ae-tier-filter");
  const eligibilityFilter = qs<HTMLSelectElement>(root, "#ae-eligibility-filter");
  const galleryStats = qs<HTMLDivElement>(root, "#ae-gallery-stats");
  const galleryGrid = qs<HTMLTableSectionElement>(root, "#ae-gallery-grid");
  const selectAllFiltered = qs<HTMLInputElement>(root, "#ae-select-all-filtered");
  const selectFilteredBtn = qs<HTMLButtonElement>(root, "#ae-select-filtered-btn");
  const clearSelectionBtn = qs<HTMLButtonElement>(root, "#ae-clear-selection-btn");
  const enableSelectedBtn = qs<HTMLButtonElement>(root, "#ae-enable-selected-btn");
  const disableSelectedBtn = qs<HTMLButtonElement>(root, "#ae-disable-selected-btn");
  const disableFilteredBtn = qs<HTMLButtonElement>(root, "#ae-disable-filtered-btn");
  const disableManifestBtn = qs<HTMLButtonElement>(root, "#ae-disable-manifest-btn");
  const detailPanel = qs<HTMLDivElement>(root, "#ae-detail-panel");
  const emptyState = qs<HTMLDivElement>(root, "#ae-empty-state");
  const emptyTitle = qs<HTMLElement>(root, "#ae-empty-title");
  const emptyMessage = qs<HTMLElement>(root, "#ae-empty-message");
  const detailContent = qs<HTMLDivElement>(root, "#ae-detail-content");
  const previewCanvas = qs<HTMLDivElement>(root, "#ae-preview-canvas");
  const infoGrid = qs<HTMLDivElement>(root, "#ae-info-grid");
  const objectSection = qs<HTMLDivElement>(root, "#ae-objects-section");
  const objectList = qs<HTMLDivElement>(root, "#ae-object-list");
  const dupCount = qs<HTMLSpanElement>(root, "#ae-dup-count");
  const saveBtn = qs<HTMLButtonElement>(root, "#ae-save-btn");
  const scaleInput = qs<HTMLInputElement>(root, "#ae-scale-input");
  const exportBtn = qs<HTMLButtonElement>(root, "#ae-export-btn");
  const removeDupsBtn = qs<HTMLButtonElement>(root, "#ae-remove-dups-btn");
  const autoSplitRecordsBtn = qs<HTMLButtonElement>(root, "#ae-auto-split-records-btn");
  const backendSplitBtn = qs<HTMLButtonElement>(root, "#ae-backend-split-btn");
  const extractSkyBtn = qs<HTMLButtonElement>(root, "#ae-extract-sky-btn");
  const splitBtn = qs<HTMLButtonElement>(root, "#ae-split-btn");
  const modeSolid = qs<HTMLButtonElement>(root, "#ae-mode-solid");
  const modeWire = qs<HTMLButtonElement>(root, "#ae-mode-wire");
  const toggleBboxBtn = qs<HTMLButtonElement>(root, "#ae-toggle-bbox");
  const zoomFitBtn = qs<HTMLButtonElement>(root, "#ae-zoom-fit");
  const toggleSelectBtn = qs<HTMLButtonElement>(root, "#ae-toggle-select");
  const deleteSelectedBtn = qs<HTMLButtonElement>(root, "#ae-delete-selected");
  const deleteRecordBtn = qs<HTMLButtonElement>(root, "#ae-delete-record");
  const loadMoreSection = qs<HTMLDivElement>(root, "#ae-load-more-section");
  const loadMoreBtn = qs<HTMLButtonElement>(root, "#ae-load-more-btn");
  const loadMoreInfo = qs<HTMLSpanElement>(root, "#ae-load-more-info");
  const yawInput = qs<HTMLInputElement>(root, "#ae-yaw-input");
  const frontSelect = qs<HTMLSelectElement>(root, "#ae-front-select");
  const orientationStatus = qs<HTMLDivElement>(root, "#ae-orientation-status");

  shell.setMenuActions({
    "file-load-layout": () => manifestSelect.focus(),
    "file-save-context": () => saveBtn.click(),
    "view-reset-view": () => zoomFitBtn.click(),
    "help-shortcuts": () => {
      shell.setBottomOpen(true);
      shell.setHints([
        { key: "assetEditor.hints.orbit" },
        { key: "assetEditor.hints.selection" },
        { key: "assetEditor.hints.export" },
      ]);
    },
  });
  applyViewerTranslations(root, currentLanguage);

  function updateOrientationStatus() {
    const asset = state.assets.find((a) => a.asset_id === state.selectedAssetId);
    const policy = orientationPolicyForAsset(asset);
    const front = normalizeCanonicalFront(state.frontDirection);
    const targetYaw = targetYawForPreviewPolicy(policy, front);
    const finalYaw = finalPreviewYawForPolicy(policy, front, state.yawValue);
    const currentFrontYaw = normalizeYawDeg((FRONT_AXIS_YAW_DEG[front] ?? 0) + state.yawValue);
    const delta = signedYawDeltaDeg(currentFrontYaw, targetYaw);
    const targetLabel = policy === "face_traffic" ? "face traffic (RHT)" : policy === "free" ? "free" : "face road";
    orientationStatus.textContent = `Policy: ${policy} · Target: ${targetLabel} (${Math.round(targetYaw)}°) · Final yaw: ${Math.round(finalYaw)}° · Δ ${Math.round(delta)}°`;
  }

  /* ── Navigation ────────────────────────────────────────────────── */
  backBtn.addEventListener("click", () => {
    window.location.hash = "";
  });

  /* ── Manifest loading ──────────────────────────────────────────── */
  function candidateManifests(): readonly AssetCandidateManifest[] {
    const preparation = workflow?.getSnapshot().assetPreparation;
    return preparation?.mode === "candidate_manifests" ? preparation.manifests : [];
  }

  function setCandidateManifests(manifests: readonly AssetCandidateManifest[]): void {
    if (!workflow) return;
    if (!manifests.length) {
      workflow.setAssetPreparation(null);
      return;
    }
    workflow.setAssetPreparation(Object.freeze({
      mode: "candidate_manifests",
      manifests: Object.freeze(manifests.map((manifest, priority) => Object.freeze({ ...manifest, priority }))),
    }));
  }

  function activateManifest(manifest: ManifestInfo, activatedBy: AssetCandidateManifest["activatedBy"]): void {
    if (!workflow) return;
    const current = [...candidateManifests()];
    const existingIndex = current.findIndex((item) => item.name === manifest.name);
    const next = candidateManifestFromInfo(
      manifest,
      existingIndex >= 0 ? existingIndex : current.length,
      existingIndex >= 0 ? current[existingIndex].activatedBy : activatedBy,
    );
    if (existingIndex >= 0) current.splice(existingIndex, 1, next);
    else current.push(next);
    setCandidateManifests(current);
  }

  function refreshCandidateSummaries(catalog: readonly ManifestInfo[]): void {
    if (!workflow) return;
    const current = candidateManifests();
    if (!current.length) return;
    const refreshed = current.map((candidate, priority) => {
      const manifest = catalog.find((item) => item.name === candidate.name);
      if (!manifest) {
        return Object.freeze({
          ...candidate,
          priority,
          readyCount: 0,
          warnings: Object.freeze([...(candidate.warnings ?? []), "Manifest is no longer available"]),
        });
      }
      return candidateManifestFromInfo(manifest, priority, candidate.activatedBy);
    });
    setCandidateManifests(refreshed);
  }

  function syncManifestCandidateStatus(): void {
    const active = candidateManifests().some((item) => item.name === state.manifestName);
    useManifestBtn.disabled = !state.manifestName || !workflow;
    useManifestBtn.textContent = active ? "已在候选仓库中" : "加入候选仓库";
    generationManifestStatus.textContent = state.currentManifest
      ? `${state.currentManifest.label} · ${state.currentManifest.readyCount ?? 0} 可用 / ${state.currentManifest.eligibleCount ?? 0} 候选`
      : "选择资产清单后可加入候选仓库";
    generationManifestStatus.dataset.tone = active ? "success" : "neutral";
  }

  function renderCandidateRepository(): void {
    const manifests = [...candidateManifests()];
    const readyCount = manifests.reduce((sum, item) => sum + item.readyCount, 0);
    const eligibleCount = manifests.reduce((sum, item) => sum + item.eligibleCount, 0);
    candidateRepositorySummary.innerHTML = manifests.length
      ? `<strong>${manifests.length} 个清单 · ${readyCount.toLocaleString()} 个可用候选</strong><span>${eligibleCount.toLocaleString()} 个已启用记录；候选资产不保证被最终使用。</span>`
      : `<strong>尚未建立候选仓库</strong><span>在资产库中加入清单，或新建、导入、拆分、启用一个资产。</span>`;
    candidateRepositoryList.innerHTML = manifests.map((manifest, index) => {
      const categories = Object.entries(manifest.categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => `<span>${escapeHtml(category)} ${Number(count).toLocaleString()}</span>`)
        .join("");
      const warnings = (manifest.warnings ?? []).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
      return `
        <details class="ae-candidate-manifest" data-manifest-name="${escapeHtml(manifest.name)}">
          <summary>
            <span class="ae-candidate-priority">${String(index + 1).padStart(2, "0")}</span>
            <span><strong>${escapeHtml(manifest.label)}</strong><small>${manifest.readyCount.toLocaleString()} 可用 / ${manifest.eligibleCount.toLocaleString()} 候选</small></span>
            <span class="ae-candidate-source">${manifest.activatedBy === "asset_write" ? "自动加入" : "手动加入"}</span>
          </summary>
          <div class="ae-candidate-manifest-body">
            <div class="ae-candidate-categories">${categories || "<span>无支持类别</span>"}</div>
            ${warnings ? `<ul class="ae-candidate-warnings">${warnings}</ul>` : ""}
            <div class="ae-candidate-assets" data-candidate-assets>展开后加载候选资产明细…</div>
            <div class="ae-candidate-actions">
              <button type="button" data-candidate-action="up" ${index === 0 ? "disabled" : ""}>提高优先级</button>
              <button type="button" data-candidate-action="down" ${index === manifests.length - 1 ? "disabled" : ""}>降低优先级</button>
              <button type="button" data-candidate-action="inspect">在检查器中打开</button>
              <button type="button" data-candidate-action="remove">移除</button>
            </div>
          </div>
        </details>
      `;
    }).join("");
    syncManifestCandidateStatus();

    candidateRepositoryList.querySelectorAll<HTMLDetailsElement>(".ae-candidate-manifest").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (!details.open || details.dataset.assetsLoaded === "true") return;
        const name = details.dataset.manifestName ?? "";
        const host = details.querySelector<HTMLElement>("[data-candidate-assets]");
        if (!name || !host) return;
        details.dataset.assetsLoaded = "true";
        host.textContent = "正在读取候选资产…";
        void fetchManifestAssets(name, 0, 500, "eligible")
          .then((response) => {
            host.innerHTML = response.assets.length
              ? `<ol>${response.assets.map((asset) => `<li><code>${escapeHtml(asset.asset_id)}</code><span>${escapeHtml(asset.category || "unknown")}</span></li>`).join("")}</ol>`
              : "此清单没有已启用资产。";
          })
          .catch((error) => {
            host.textContent = `候选明细读取失败：${String(error)}`;
          });
      });
      details.querySelectorAll<HTMLButtonElement>("[data-candidate-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const name = details.dataset.manifestName ?? "";
          const index = candidateManifests().findIndex((item) => item.name === name);
          if (index < 0) return;
          const action = button.dataset.candidateAction;
          if (action === "inspect") {
            void loadManifest(name, true);
            shell.sidebar.activate("asset-library");
            return;
          }
          const next = [...candidateManifests()];
          if (action === "remove") next.splice(index, 1);
          if (action === "up" && index > 0) [next[index - 1], next[index]] = [next[index], next[index - 1]];
          if (action === "down" && index < next.length - 1) [next[index + 1], next[index]] = [next[index], next[index + 1]];
          setCandidateManifests(next);
        });
      });
    });
  }

  async function loadManifest(name: string, autoSelectAsset: boolean): Promise<void> {
    const manifest = state.manifestCatalog.find((item) => item.name === name) ?? null;
    state.manifestName = name;
    state.currentManifest = manifest;
    manifestSelect.value = name;
    writeSessionValue(ACTIVE_MANIFEST_SESSION_KEY, name);
    state.selectedAssetId = null;
    state.selectedAssetIds.clear();
    state.selectedObjects.clear();
    state.assets = [];
    state.loadedOffset = 0;
    state.hasMoreAssets = false;
    showTranslatedEmptyState("assetEditor.empty.loading.title", "assetEditor.empty.loading.message", manifest?.label ?? name);
    syncManifestCandidateStatus();
    try {
      const response = await fetchManifestAssets(name, 0, 100);
      state.assets = response.assets;
      state.totalAssets = response.total;
      state.loadedOffset = response.offset + response.assets.length;
      state.hasMoreAssets = response.hasMore;
      state.currentManifest = response.manifest ?? manifest;
      if (response.manifest) {
        const catalogIndex = state.manifestCatalog.findIndex((item) => item.name === name);
        if (catalogIndex >= 0) state.manifestCatalog.splice(catalogIndex, 1, response.manifest);
      }
      rebuildCategoryProfiles(state.assets);
      updateCategoryFilter();
      applyFilters();
      updateLoadMoreSection();
      syncManifestCandidateStatus();
      if (!state.assets.length) {
        showTranslatedEmptyState("assetEditor.empty.manifest.title", "assetEditor.empty.manifest.message");
        return;
      }
      if (autoSelectAsset) {
        const rememberedId = readSessionValue(`${ACTIVE_ASSET_SESSION_KEY_PREFIX}${name}`);
        const preferred = state.assets.find((asset) => asset.asset_id === rememberedId)
          ?? state.assets.find((asset) => isSceneEligible(asset) && Boolean(asset.mesh_path))
          ?? state.assets[0];
        if (preferred) await selectAsset(preferred.asset_id);
      }
    } catch (err) {
      showTranslatedEmptyState("assetEditor.empty.loadFailed.title", "assetEditor.empty.manifest.message", String(err));
      showToast(root, `Failed to load manifest: ${err}`, "error");
    }
  }

  async function initManifests() {
    try {
      const manifests = await fetchManifests();
      state.manifestCatalog = manifests.length ? manifests : FALLBACK_MANIFESTS;
      refreshCandidateSummaries(state.manifestCatalog);
      for (const m of state.manifestCatalog) {
        const opt = document.createElement("option");
        opt.value = m.name;
        opt.textContent = `${m.label} (${m.readyCount ?? m.count} ready / ${m.count})`;
        manifestSelect.appendChild(opt);
      }
      const remembered = readSessionValue(ACTIVE_MANIFEST_SESSION_KEY);
      const candidateName = candidateManifests()[0]?.name ?? "";
      const preferred = [remembered, candidateName, DEFAULT_ASSET_MANIFEST_NAME]
        .find((name) => state.manifestCatalog.some((manifest) => manifest.name === name && manifest.count > 0))
        ?? state.manifestCatalog.find((manifest) => manifest.count > 0)?.name
        ?? state.manifestCatalog[0]?.name;
      renderCandidateRepository();
      if (preferred) await loadManifest(preferred, true);
      else showTranslatedEmptyState("assetEditor.empty.none.title", "assetEditor.empty.none.message");
    } catch (err) {
      showTranslatedEmptyState("assetEditor.empty.unavailable.title", "assetEditor.empty.none.message", String(err));
      showToast(root, `Failed to load manifests: ${err}`, "error");
    }
  }

  async function refreshManifestAfterWrite(autoActivate: boolean): Promise<void> {
    if (!state.manifestName) return;
    try {
      const catalog = await fetchManifests();
      if (catalog.length) state.manifestCatalog = catalog;
      const updated = state.manifestCatalog.find((item) => item.name === state.manifestName);
      if (updated) {
        state.currentManifest = updated;
        if (autoActivate) activateManifest(updated, "asset_write");
        else refreshCandidateSummaries(state.manifestCatalog);
      }
      renderCandidateRepository();
    } catch (error) {
      showToast(root, `候选仓库刷新失败: ${String(error)}`, "error");
    }
  }

  manifestSelect.addEventListener("change", () => {
    const name = manifestSelect.value;
    if (name) void loadManifest(name, true);
  });

  useManifestBtn.addEventListener("click", () => {
    if (!workflow || !state.currentManifest) return;
    activateManifest(state.currentManifest, "manual");
    shell.setStatusSummary({ key: "professional.assets.manifestReady" });
    showToast(root, "清单已加入候选仓库；生成时仍会根据场景需求选择资产。");
  });

  const unsubscribeCandidateWorkflow = workflow?.subscribe(renderCandidateRepository);

  /* ── Load More ─────────────────────────────────────────────────── */
  function updateLoadMoreSection() {
    if (state.hasMoreAssets) {
      loadMoreSection.style.display = "";
      loadMoreBtn.disabled = state.isLoadingMore;
      loadMoreInfo.textContent = `Loaded ${state.assets.length} of ${state.totalAssets.toLocaleString()} assets`;
    } else {
      loadMoreSection.style.display = "none";
    }
  }

  loadMoreBtn.addEventListener("click", async () => {
    if (!state.manifestName || state.isLoadingMore || !state.hasMoreAssets) return;
    
    state.isLoadingMore = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading...";
    
    try {
      const response = await fetchManifestAssets(state.manifestName, state.loadedOffset, 100);
      state.assets = [...state.assets, ...response.assets];
      state.loadedOffset += response.assets.length;
      state.hasMoreAssets = response.hasMore;
      
      rebuildCategoryProfiles(state.assets);
      updateCategoryFilter();
      applyFilters();
      updateLoadMoreSection();
    } catch (err) {
      showToast(root, `Failed to load more: ${err}`, "error");
    } finally {
      state.isLoadingMore = false;
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = "Load More";
    }
  });

  /* ── Category filter ───────────────────────────────────────────── */
  function updateCategoryFilter() {
    const currentValue = state.categoryFilter || categoryFilter.value;
    const cats = new Set<string>();
    for (const a of state.assets) {
      cats.add(a.category || "unknown");
    }
    categoryFilter.innerHTML = `<option value="">All Categories (${cats.size})</option>`;
    for (const cat of Array.from(cats).sort()) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categoryFilter.appendChild(opt);
    }
    if (currentValue && Array.from(categoryFilter.options).some((option) => option.value === currentValue)) {
      categoryFilter.value = currentValue;
    }
  }

  /* ── Filters ───────────────────────────────────────────────────── */
  function applyFilters() {
    const q = state.searchQuery.toLowerCase();
    const cat = state.categoryFilter;
    const tier = state.qualityTierFilter;
    const eligibility = state.eligibilityFilter;

    state.filteredAssets = state.assets.filter((a) => {
      const aCat = a.category || "unknown";
      if (q) {
        const text = [
          a.asset_id,
          a.category,
          a.text_desc ?? "",
          ...(a.tags ?? []),
          ...(a.style_tags ?? []),
          ...(a.theme_tags ?? []),
          a.curation_notes ?? "",
          a.scene_exclusion_reason ?? "",
        ].join(" ").toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (cat && aCat !== cat) return false;
      if (tier && String(a.quality_tier) !== tier) return false;
      if (eligibility === "eligible" && !isSceneEligible(a)) return false;
      if (eligibility === "disabled" && isSceneEligible(a)) return false;
      return true;
    });

    for (const assetId of Array.from(state.selectedAssetIds)) {
      if (!state.assets.some((asset) => asset.asset_id === assetId)) {
        state.selectedAssetIds.delete(assetId);
      }
    }
    renderGallery();
  }

  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value;
    applyFilters();
  });
  categoryFilter.addEventListener("change", () => {
    state.categoryFilter = categoryFilter.value;
    applyFilters();
  });
  tierFilter.addEventListener("change", () => {
    state.qualityTierFilter = tierFilter.value;
    applyFilters();
  });
  eligibilityFilter.addEventListener("change", () => {
    state.eligibilityFilter = eligibilityFilter.value;
    applyFilters();
  });

  /* ── Gallery rendering ─────────────────────────────────────────── */
  function filteredAssetIds(): string[] {
    return state.filteredAssets.map((asset) => asset.asset_id);
  }

  function updateBulkControls() {
    const selectedCount = state.selectedAssetIds.size;
    const filteredIds = filteredAssetIds();
    const filteredCount = filteredIds.length;
    const selectedFilteredCount = filteredIds.filter((assetId) => state.selectedAssetIds.has(assetId)).length;
    const allFilteredSelected = filteredCount > 0 && selectedFilteredCount === filteredCount;
    const someFilteredSelected = selectedFilteredCount > 0 && selectedFilteredCount < filteredCount;

    selectAllFiltered.checked = allFilteredSelected;
    selectAllFiltered.indeterminate = someFilteredSelected;
    selectAllFiltered.disabled = filteredCount === 0;
    selectFilteredBtn.disabled = filteredCount === 0;
    clearSelectionBtn.disabled = selectedCount === 0;
    enableSelectedBtn.disabled = selectedCount === 0 || !state.manifestName;
    disableSelectedBtn.disabled = selectedCount === 0 || !state.manifestName;
    disableFilteredBtn.disabled = filteredCount === 0 || !state.manifestName;
    disableManifestBtn.disabled = !state.manifestName || state.totalAssets === 0;

    const selectedText = selectedCount > 0 ? ` · ${selectedCount.toLocaleString()} selected` : "";
    galleryStats.dataset.selectedText = selectedText;
  }

  function applyBulkUpdatesToLoadedAssets(assetIds: Set<string> | null, updates: Record<string, unknown>) {
    for (const asset of state.assets) {
      if (assetIds !== null && !assetIds.has(asset.asset_id)) continue;
      Object.assign(asset, updates);
    }
    const activeAsset = getActiveAsset();
    if (activeAsset) {
      updateEligibleToolbar(activeAsset);
      renderInfoPanel(activeAsset);
    }
    rebuildCategoryProfiles(state.assets);
    updateCategoryFilter();
    applyFilters();
  }

  async function updateAssetEligibilityBatch(
    assetIds: string[],
    eligible: boolean,
    reason: string,
  ) {
    if (!state.manifestName || assetIds.length === 0) return;
    const uniqueIds = Array.from(new Set(assetIds));
    const updates = {
      scene_eligible: eligible,
      scene_exclusion_reason: eligible ? "" : reason,
    };
    try {
      const result = await bulkSaveAssetMetadata(state.manifestName, updates, {
        assetIds: uniqueIds,
        scope: "selected",
      });
      applyBulkUpdatesToLoadedAssets(new Set(uniqueIds), updates);
      await refreshManifestAfterWrite(eligible);
      showToast(root, `${eligible ? "Enabled" : "Disabled"} ${result.updatedCount.toLocaleString()} assets`);
    } catch (err) {
      showToast(root, `Bulk update failed: ${err}`, "error");
    }
  }

  async function disableCurrentManifest() {
    if (!state.manifestName) return;
    const total = state.totalAssets || state.assets.length;
    const ok = window.confirm(
      `Disable every asset in this manifest?\n\nManifest: ${state.manifestName}\nAssets: ${total.toLocaleString()}\n\nThis writes scene_eligible=false to the manifest JSONL.`,
    );
    if (!ok) return;
    const updates = {
      scene_eligible: false,
      scene_exclusion_reason: "disabled_by_manifest_bulk",
    };
    try {
      const result = await bulkSaveAssetMetadata(state.manifestName, updates, { scope: "all" });
      applyBulkUpdatesToLoadedAssets(null, updates);
      state.selectedAssetIds.clear();
      await refreshManifestAfterWrite(false);
      showToast(root, `Disabled ${result.updatedCount.toLocaleString()} assets in ${state.manifestName}`);
    } catch (err) {
      showToast(root, `Manifest disable failed: ${err}`, "error");
    }
  }

  function renderGallery() {
    galleryGrid.innerHTML = "";
    
    // Show loaded count vs total count
    const loadedText = state.totalAssets > state.assets.length
      ? `${state.assets.length.toLocaleString()} / ${state.totalAssets.toLocaleString()}（已加载）`
      : `${state.assets.length.toLocaleString()}（全部）`;
    const catCount = state.assets.reduce((acc, a) => {
      acc.add(a.category || "unknown");
      return acc;
    }, new Set<string>()).size;
    const catSuffix = state.totalAssets > state.assets.length ? "（部分加载）" : "（完整加载）";
    const selectedText = state.selectedAssetIds.size > 0 ? ` / ${state.selectedAssetIds.size.toLocaleString()} 已选择` : "";
    galleryStats.textContent = `${state.filteredAssets.length} 个展示 / ${loadedText} 资产 / ${catCount} 类别 ${catSuffix}${selectedText}`;

    for (const asset of state.filteredAssets) {
      const row = document.createElement("tr");
      row.className = [
        "ae-asset-row",
        asset.asset_id === state.selectedAssetId ? "active" : "",
        state.selectedAssetIds.has(asset.asset_id) ? "selected" : "",
        isSceneEligible(asset) ? "" : "disabled",
      ].filter(Boolean).join(" ");
      row.dataset.assetId = asset.asset_id;

      const fCount = asset.face_count ?? asset.mesh_face_count ?? 0;
      const vCount = asset.vertex_count ?? asset.quality_metrics?.vertex_count ?? 0;
      const tier = asset.quality_tier;
      const eligible = isSceneEligible(asset);
      const cat = asset.category || "unknown";

      row.innerHTML = `
        <td class="ae-select-cell">
          <input class="ae-asset-select" type="checkbox" data-asset-id="${escapeHtml(asset.asset_id)}" ${state.selectedAssetIds.has(asset.asset_id) ? "checked" : ""} aria-label="Select ${escapeHtml(asset.asset_id)}" />
        </td>
        <td>
          <button class="ae-asset-id-button" type="button" data-asset-id="${escapeHtml(asset.asset_id)}" title="${escapeHtml(asset.asset_id)}">${escapeHtml(shortId(asset.asset_id))}</button>
          <div class="ae-asset-desc">${escapeHtml(String(asset.text_desc ?? ""))}</div>
        </td>
        <td><span class="ae-card-category ${categoryBadgeClass(cat)}">${escapeHtml(cat)}</span></td>
        <td><span class="ae-eligibility-pill ${eligible ? "eligible" : "disabled"}">${eligible ? "Enabled" : "Disabled"}</span></td>
        <td><span class="ae-card-tier" style="color:${tierColor(tier)}">${tier !== undefined ? `T${tier}` : "T?"}</span></td>
        <td><span class="ae-table-muted">${escapeHtml(String(asset.source ?? ""))}</span></td>
        <td><span class="ae-table-mono" title="${vCount.toLocaleString()} vertices">${fCount.toLocaleString()}f</span></td>
      `;

      row.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".ae-asset-select")) return;
        void selectAsset(asset.asset_id);
      });
      const checkbox = row.querySelector<HTMLInputElement>(".ae-asset-select");
      checkbox?.addEventListener("change", () => {
        if (checkbox.checked) {
          state.selectedAssetIds.add(asset.asset_id);
        } else {
          state.selectedAssetIds.delete(asset.asset_id);
        }
        renderGallery();
      });
      galleryGrid.appendChild(row);
    }
    updateBulkControls();
  }

  selectAllFiltered.addEventListener("change", () => {
    const ids = filteredAssetIds();
    if (selectAllFiltered.checked) {
      ids.forEach((assetId) => state.selectedAssetIds.add(assetId));
    } else {
      ids.forEach((assetId) => state.selectedAssetIds.delete(assetId));
    }
    renderGallery();
  });

  selectFilteredBtn.addEventListener("click", () => {
    filteredAssetIds().forEach((assetId) => state.selectedAssetIds.add(assetId));
    renderGallery();
  });

  clearSelectionBtn.addEventListener("click", () => {
    state.selectedAssetIds.clear();
    renderGallery();
  });

  enableSelectedBtn.addEventListener("click", () => {
    void updateAssetEligibilityBatch(Array.from(state.selectedAssetIds), true, "");
  });

  disableSelectedBtn.addEventListener("click", () => {
    void updateAssetEligibilityBatch(Array.from(state.selectedAssetIds), false, "disabled_by_asset_editor_bulk");
  });

  disableFilteredBtn.addEventListener("click", () => {
    const ids = filteredAssetIds();
    const ok = window.confirm(`Disable ${ids.length.toLocaleString()} currently loaded filtered assets?`);
    if (!ok) return;
    void updateAssetEligibilityBatch(ids, false, "disabled_by_asset_editor_filtered");
  });

  disableManifestBtn.addEventListener("click", () => {
    void disableCurrentManifest();
  });

  /* ── Asset selection ───────────────────────────────────────────── */
  async function selectAsset(assetId: string) {
    state.selectedAssetId = assetId;
    if (state.manifestName) {
      writeSessionValue(`${ACTIVE_ASSET_SESSION_KEY_PREFIX}${state.manifestName}`, assetId);
    }
    state.selectedObjects.clear();
    if (previewCtx) {
      clearMeshSelection();
    } else {
      state.selectedMeshes.clear();
    }
    updateDeleteButtonState();
    state.sceneChildren = [];

    // Load existing scale, yaw, and front direction from asset record
    const asset = state.assets.find((a) => a.asset_id === assetId);
    state.scaleValue = asset?.scale ?? 1;
    state.yawValue = normalizeYawDeg(asset?.yaw_deg ?? 0);
    state.frontDirection = normalizeCanonicalFront(asset?.canonical_front ?? "+Z");
    state.modelDimensions = getAssetDimensions(asset);

    scaleInput.value = String(state.scaleValue);
    yawInput.value = String(state.yawValue);
    frontSelect.value = state.frontDirection;
    updateOrientationStatus();

    // Update gallery selection
    galleryGrid.querySelectorAll(".ae-asset-row").forEach((el) => {
      el.classList.toggle("active", (el as HTMLElement).dataset.assetId === assetId);
    });

    if (!asset) return;

    emptyState.style.display = "none";
    detailContent.style.display = "";
    saveBtn.disabled = false;
    deleteRecordBtn.disabled = false;

    // Render info
    renderInfoPanel(asset);
    refreshDimensionValidationPanel(getAssetDimensions(asset));

    // Init Three.js preview if needed
    if (!previewCtx) {
      previewCtx = createPreviewScene(previewCanvas);
    }

    // Load GLB
    const meshPath = asset.mesh_path;
    if (meshPath) {
      const glbUrl = `/api/file?path=${encodeURIComponent(meshPath)}`;
      try {
        const { children } = await loadModelIntoPreview(previewCtx, glbUrl);
        if (state.originAutoAlignEnabled) {
          await autoFixAssetOriginIfNeeded(previewCtx, asset);
        } else {
          updateOriginAlignmentPanel();
        }
        state.sceneChildren = children;
        renderObjectList();
        updateActionButtons();

        // Compute and store model dimensions
        const dims = getModelDimensions(previewCtx);
        if (dims) {
          // Store native GLB dimensions as the base for proportional scaling
          state.originalDimensions = {
            width: dims.width,
            height: dims.height,
            depth: dims.depth,
          };
        if (state.scaleValue !== 1) {
          applyScale(previewCtx, state.scaleValue);
        }
          refreshModelDimensionsFromScene(previewCtx);
        }

        // Apply existing yaw from asset record
        if (state.yawValue !== 0) {
          applyYaw(previewCtx, state.yawValue);
          refreshModelDimensionsFromScene(previewCtx);
        }

        // Show the front direction after the selected category's preview policy is applied.
        updateFrontArrow(
          previewCtx,
          state.frontDirection,
          finalPreviewYawForPolicy(orientationPolicyForAsset(asset), state.frontDirection, state.yawValue),
        );
      } catch (err) {
        showTranslatedEmptyState("assetEditor.empty.modelFailed.title", "assetEditor.empty.choose.message", `${asset.asset_id} · ${String(err)}`);
        showToast(root, `Failed to load GLB: ${err}`, "error");
      }
    }
  }

  let currentEmptyTranslation: { titleKey: string; messageKey: string; detail: string } | null = null;

  function showTranslatedEmptyState(titleKey: string, messageKey: string, detail = ""): void {
    currentEmptyTranslation = { titleKey, messageKey, detail };
    const title = translateViewerKey(currentLanguage, titleKey) ?? titleKey;
    const message = [detail, translateViewerKey(currentLanguage, messageKey) ?? messageKey]
      .filter(Boolean)
      .join(" · ");
    showEmptyState(title, message, false);
  }

  function showEmptyState(
    title: string = translateViewerKey(currentLanguage, "assetEditor.empty.choose.title") ?? "Choose an inspectable asset",
    message: string = translateViewerKey(currentLanguage, "assetEditor.empty.choose.message") ?? "Select a record from the asset library.",
    clearTranslation = true,
  ) {
    if (clearTranslation) currentEmptyTranslation = null;
    emptyState.style.display = "";
    emptyTitle.textContent = title;
    emptyMessage.textContent = message;
    detailContent.style.display = "none";
    saveBtn.disabled = true;
    deleteRecordBtn.disabled = true;
    updateEligibleToolbar(null);
  }

  /* ── Dimensions display ──────────────────────────────────────────── */
  function updateDimensionsDisplay(dims: DimensionRecord | null) {
    const wInput = document.getElementById("ae-dim-w") as HTMLInputElement | null;
    const hInput = document.getElementById("ae-dim-h") as HTMLInputElement | null;
    const dInput = document.getElementById("ae-dim-d") as HTMLInputElement | null;
    const slider = document.getElementById("ae-dims-slider") as HTMLInputElement | null;
    if (!dims) return;
    if (wInput) { wInput.value = formatDimension(dims.width); wInput.disabled = false; }
    if (hInput) { hInput.value = formatDimension(dims.height); hInput.disabled = false; }
    if (dInput) { dInput.value = formatDimension(dims.depth); dInput.disabled = false; }
    if (slider) slider.disabled = false;
  }

  function getActiveAsset(): AssetRecord | null {
    return state.assets.find((asset) => asset.asset_id === state.selectedAssetId) ?? null;
  }

  function formatOriginVector(offset: THREE.Vector3 | null): string {
    if (!offset) return "等待模型加载后检测。";
    return `X ${formatDimension(offset.x)}m · Y ${formatDimension(offset.y)}m · Z ${formatDimension(offset.z)}m`;
  }

  function getOriginStatusText(offset: THREE.Vector3 | null): string {
    if (!offset) return "尚未检测资产底部中心。";
    if (needsBottomCenterOriginFix(offset)) {
      return "底部中心未对准场景原点，可能导致悬浮或水平偏移。";
    }
    return "底部中心已对准场景原点。";
  }

  function updateOriginAlignmentPanel() {
    const offset = previewCtx?.currentModel ? getBottomCenterOffset(previewCtx.currentModel) : null;
    const needsFix = needsBottomCenterOriginFix(offset);
    const status = document.getElementById("ae-origin-status");
    const offsetText = document.getElementById("ae-origin-offset");
    const autoToggle = document.getElementById("ae-origin-auto-align") as HTMLInputElement | null;
    const alignBtn = document.getElementById("ae-align-origin-btn") as HTMLButtonElement | null;
    const dragBtn = document.getElementById("ae-drag-move-toggle") as HTMLButtonElement | null;

    if (status) {
      status.textContent = getOriginStatusText(offset);
      status.className = `ae-dim-range-status ${needsFix ? "warn" : "ok"}`;
    }
    if (offsetText) {
      offsetText.textContent = `Bottom center: ${formatOriginVector(offset)}`;
    }
    if (autoToggle) {
      autoToggle.checked = state.originAutoAlignEnabled;
    }
    if (alignBtn) {
      alignBtn.disabled = !previewCtx?.currentModel || !state.selectedAssetId || !needsFix;
    }
    if (dragBtn) {
      dragBtn.textContent = state.dragMoveMode ? "Drag Move: On" : "Drag Move: Off";
      dragBtn.classList.toggle("active", state.dragMoveMode);
    }
  }

  async function saveCurrentModelOrigin(
    ctx: PreviewContext,
    asset: AssetRecord,
    updates: Record<string, unknown>,
    toastMessage: string,
    bakeCurrentScale: boolean = false,
  ): Promise<AssetRecord> {
    if (!ctx.currentModel || !state.manifestName) return asset;
    if (bakeCurrentScale) {
      clearDimensionAutosaveTimer();
      pendingDimensionAutosave = null;
      dimensionAutosaveVersion += 1;
      if (dimensionAutosaveInFlight) {
        await new Promise<void>((resolve) => {
          const startedAt = performance.now();
          const waitUntilIdle = () => {
            if (!dimensionAutosaveInFlight || performance.now() - startedAt > 2000) {
              resolve();
              return;
            }
            window.setTimeout(waitUntilIdle, 50);
          };
          waitUntilIdle();
        });
      }
    }
    const dims = getModelDimensions(ctx);
    const currentOffset = getBottomCenterOffset(ctx.currentModel);
    const glbData = await exportGlb(cloneObjectForGlbExport(ctx.currentModel, ctx.originalMaterials));
    const normalizedAsset = await saveNormalizedAssetMesh(
      state.manifestName,
      asset.asset_id,
      arrayBufferToBase64(glbData),
      {
        dimensions_m: dims ?? undefined,
        origin_alignment: "bottom-center",
        origin_bottom_center_current_m: currentOffset
          ? {
              x: roundTo(currentOffset.x, DIMENSION_STORE_DECIMALS),
              y: roundTo(currentOffset.y, DIMENSION_STORE_DECIMALS),
              z: roundTo(currentOffset.z, DIMENSION_STORE_DECIMALS),
            }
          : undefined,
        origin_saved_at: new Date().toISOString(),
        ...updates,
        ...(bakeCurrentScale
          ? {
              scale: 1,
              origin_baked_scale: state.scaleValue,
            }
          : {}),
      },
    );

    Object.assign(asset, normalizedAsset);
    if (bakeCurrentScale) {
      state.scaleValue = 1;
      scaleInput.value = "1.0000";
      syncSliderToScale(1);
    }
    if (dims) {
      state.modelDimensions = dims;
      state.originalDimensions = { ...dims };
    }
    renderInfoPanel(asset);
    refreshDimensionValidationPanel(dims);
    updateOriginAlignmentPanel();
    showToast(root, toastMessage);
    return asset;
  }

  async function autoFixAssetOriginIfNeeded(
    ctx: PreviewContext,
    asset: AssetRecord,
    bakeCurrentScale: boolean = false,
  ): Promise<boolean> {
    if (!ctx.currentModel || !state.manifestName) return false;
    const offset = getBottomCenterOffset(ctx.currentModel);
    if (!needsBottomCenterOriginFix(offset)) return false;

    alignBottomCenterToOrigin(ctx.currentModel, offset);
    await saveCurrentModelOrigin(
      ctx,
      asset,
      {
        origin_bottom_center_before_m: {
          x: roundTo(offset.x, DIMENSION_STORE_DECIMALS),
          y: roundTo(offset.y, DIMENSION_STORE_DECIMALS),
          z: roundTo(offset.z, DIMENSION_STORE_DECIMALS),
        },
        origin_fix_m: {
          x: roundTo(-offset.x, DIMENSION_STORE_DECIMALS),
          y: roundTo(-offset.y, DIMENSION_STORE_DECIMALS),
          z: roundTo(-offset.z, DIMENSION_STORE_DECIMALS),
        },
        origin_fixed_at: new Date().toISOString(),
        origin_fix_mode: "auto-align",
      },
      "已自动修复资产原点并保存",
      bakeCurrentScale,
    );
    return true;
  }

  type DimensionAutosaveSnapshot = {
    version: number;
    manifestName: string;
    assetId: string;
    scale: number;
    dimensions: DimensionRecord;
  };

  let dimensionAutosaveTimer: number | null = null;
  let dimensionAutosaveVersion = 0;
  let dimensionAutosaveInFlight = false;
  let pendingDimensionAutosave: DimensionAutosaveSnapshot | null = null;
  type CurationAutosaveSnapshot = {
    version: number;
    manifestName: string;
    assetId: string;
    updates: Record<string, unknown>;
  };

  let curationAutosaveTimer: number | null = null;
  let curationAutosaveVersion = 0;
  let curationAutosaveInFlight = false;
  let pendingCurationAutosave: CurationAutosaveSnapshot | null = null;

  function clearDimensionAutosaveTimer() {
    if (dimensionAutosaveTimer !== null) {
      window.clearTimeout(dimensionAutosaveTimer);
      dimensionAutosaveTimer = null;
    }
  }

  function queueDimensionAutosaveRetry() {
    clearDimensionAutosaveTimer();
    dimensionAutosaveTimer = window.setTimeout(() => {
      dimensionAutosaveTimer = null;
      void flushDimensionAutosave();
    }, DIMENSION_AUTOSAVE_DELAY_MS);
  }

  function scheduleDimensionAutosave() {
    if (destroyed || !state.selectedAssetId || !state.modelDimensions) return;
    const manifestName = manifestSelect.value;
    if (!manifestName) return;

    pendingDimensionAutosave = {
      version: ++dimensionAutosaveVersion,
      manifestName,
      assetId: state.selectedAssetId,
      scale: state.scaleValue,
      dimensions: {
        width: state.modelDimensions.width,
        height: state.modelDimensions.height,
        depth: state.modelDimensions.depth,
      },
    };

    queueDimensionAutosaveRetry();
  }

  async function flushDimensionAutosave() {
    if (destroyed || !pendingDimensionAutosave) return;
    if (dimensionAutosaveInFlight) {
      queueDimensionAutosaveRetry();
      return;
    }

    const snapshot = pendingDimensionAutosave;
    pendingDimensionAutosave = null;
    dimensionAutosaveInFlight = true;

    try {
      await saveAssetMetadata(snapshot.manifestName, snapshot.assetId, {
        scale: snapshot.scale,
        dimensions_m: snapshot.dimensions,
      });

      if (!destroyed && snapshot.version === dimensionAutosaveVersion) {
        const asset = state.assets.find((item) => item.asset_id === snapshot.assetId);
        if (asset) {
          asset.scale = snapshot.scale;
          asset.dimensions_m = { ...snapshot.dimensions };
        }
        renderGallery();
        showToast(root, "尺寸已自动保存");
      }
    } catch (err) {
      if (!destroyed) {
        showToast(root, `尺寸自动保存失败: ${err}`, "error");
      }
    } finally {
      dimensionAutosaveInFlight = false;
      if (!destroyed && pendingDimensionAutosave && dimensionAutosaveTimer === null) {
        queueDimensionAutosaveRetry();
      }
    }
  }

  function clearCurationAutosaveTimer() {
    if (curationAutosaveTimer !== null) {
      window.clearTimeout(curationAutosaveTimer);
      curationAutosaveTimer = null;
    }
  }

  function setCurationSaveStatus(message: string, mode: "idle" | "saving" | "saved" | "error" = "idle") {
    const statusEl = root.querySelector<HTMLElement>("#ae-curation-save-status");
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.status = mode;
  }

  function collectCurationUpdatesFromPanel(): Record<string, unknown> | null {
    const tierEl = root.querySelector<HTMLSelectElement>("#ae-edit-tier");
    const eligibleEl = root.querySelector<HTMLInputElement>("#ae-edit-eligible");
    const tagsEl = root.querySelector<HTMLInputElement>("#ae-edit-tags");
    const styleTagsEl = root.querySelector<HTMLInputElement>("#ae-edit-style-tags");
    const themeTagsEl = root.querySelector<HTMLInputElement>("#ae-edit-theme-tags");
    const reasonEl = root.querySelector<HTMLTextAreaElement>("#ae-edit-exclusion-reason");
    const notesEl = root.querySelector<HTMLTextAreaElement>("#ae-edit-curation-notes");
    if (!tierEl || !eligibleEl || !tagsEl || !styleTagsEl || !themeTagsEl || !reasonEl || !notesEl) {
      return null;
    }

    const updates: Record<string, unknown> = {
      scene_eligible: eligibleEl.checked,
      tags: parseTagInput(tagsEl.value),
      style_tags: parseTagInput(styleTagsEl.value),
      theme_tags: parseTagInput(themeTagsEl.value),
      curation_notes: notesEl.value.trim(),
      scene_exclusion_reason: eligibleEl.checked ? "" : reasonEl.value.trim(),
    };
    const tierVal = tierEl.value ? parseInt(tierEl.value, 10) : undefined;
    if (tierVal !== undefined && Number.isFinite(tierVal)) {
      updates.quality_tier = tierVal;
    }
    return updates;
  }

  function applyCurationUpdatesToAsset(asset: AssetRecord, updates: Record<string, unknown>) {
    if ("quality_tier" in updates) asset.quality_tier = updates.quality_tier as number;
    asset.scene_eligible = Boolean(updates.scene_eligible);
    asset.tags = updates.tags as string[];
    asset.style_tags = updates.style_tags as string[];
    asset.theme_tags = updates.theme_tags as string[];
    asset.curation_notes = String(updates.curation_notes ?? "");
    asset.scene_exclusion_reason = String(updates.scene_exclusion_reason ?? "");
  }

  function queueCurationAutosaveRetry() {
    clearCurationAutosaveTimer();
    curationAutosaveTimer = window.setTimeout(() => {
      curationAutosaveTimer = null;
      void flushCurationAutosave();
    }, CURATION_AUTOSAVE_DELAY_MS);
  }

  function scheduleCurationAutosave() {
    if (destroyed || !state.selectedAssetId || !state.manifestName) return;
    const updates = collectCurationUpdatesFromPanel();
    if (!updates) return;

    const asset = state.assets.find((item) => item.asset_id === state.selectedAssetId);
    if (asset) applyCurationUpdatesToAsset(asset, updates);

    pendingCurationAutosave = {
      version: ++curationAutosaveVersion,
      manifestName: state.manifestName,
      assetId: state.selectedAssetId,
      updates,
    };
    setCurationSaveStatus("停止输入 800ms 后自动保存...", "saving");
    queueCurationAutosaveRetry();
  }

  async function flushCurationAutosave() {
    if (destroyed || !pendingCurationAutosave) return;
    if (curationAutosaveInFlight) {
      queueCurationAutosaveRetry();
      return;
    }

    const snapshot = pendingCurationAutosave;
    pendingCurationAutosave = null;
    curationAutosaveInFlight = true;

    try {
      await saveAssetMetadata(snapshot.manifestName, snapshot.assetId, snapshot.updates);
      const asset = state.assets.find((item) => item.asset_id === snapshot.assetId);
      if (asset) applyCurationUpdatesToAsset(asset, snapshot.updates);
      if (!destroyed && snapshot.version === curationAutosaveVersion) {
        renderGallery();
        await refreshManifestAfterWrite(snapshot.updates.scene_eligible === true);
        setCurationSaveStatus("审核信息已自动保存", "saved");
      }
    } catch (err) {
      if (!destroyed) {
        setCurationSaveStatus(`自动保存失败: ${err}`, "error");
        showToast(root, `审核信息自动保存失败: ${err}`, "error");
      }
    } finally {
      curationAutosaveInFlight = false;
      if (!destroyed && pendingCurationAutosave && curationAutosaveTimer === null) {
        queueCurationAutosaveRetry();
      }
    }
  }

  function getAssetDimensions(asset?: AssetRecord | null): DimensionRecord | null {
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

  function getDimensionValidationStatusText(validation: CategoryDimensionValidation): string {
    const rangeSource = getRangeSourceLabel(validation);
    if (!validation.feasible && validation.violations.length > 0) {
      return `当前尺寸无法同时满足全部轴向约束，已按最接近范围进行修正（${rangeSource}）。`;
    }
    if (validation.violations.length === 0) return `当前尺寸在预期范围内（${rangeSource}）。`;
    return validation.violations
      .map((violation) => {
        const unit = getViolationDirectionLabel(violation.direction);
        return `${violation.axisLabel} 轴 ${formatDimension(violation.value)}m ${unit}（目标 ${formatDimension(violation.expectedMin)}-${formatDimension(violation.expectedMax)}m）`;
      })
      .join("；");
  }

  function refreshDimensionValidationPanel(dims: DimensionRecord | null) {
    const rangeText = document.getElementById("ae-dim-range-text");
    const statusText = document.getElementById("ae-dim-range-status");
    const hintText = document.getElementById("ae-dim-range-hint");
    const autoBtn = document.getElementById("ae-auto-range-btn") as HTMLButtonElement | null;

    const asset = getActiveAsset();
    const validation = validateCategoryDimension(dims, asset?.category);
    if (rangeText) rangeText.textContent = formatCategoryRangeLine(validation.profile);

    const hasDims = Boolean(dims);
    const needsFix = validation.violations.length > 0;

    if (statusText) {
      statusText.textContent = hasDims
        ? getDimensionValidationStatusText(validation)
        : "尚未获取当前尺寸样本。";
      statusText.className = "ae-dim-range-status " + (validation.violations.length === 0 ? "ok" : "warn");
    }
    if (hintText) {
      if (!hasDims) {
        hintText.textContent = "等待模型加载完成后计算建议。";
      } else if (needsFix && validation.suggestedScale > 0) {
        hintText.textContent = `建议缩放: ${formatDimension(validation.suggestedScale)}x`;
      } else if (validation.violations.length === 0) {
        hintText.textContent = "当前已符合范围";
      } else if (!Number.isFinite(validation.suggestedScale)) {
        hintText.textContent = "无法自动计算安全缩放";
      } else {
        hintText.textContent = "-";
      }
    }
    if (autoBtn) {
      autoBtn.disabled = !dims || validation.violations.length === 0;
      autoBtn.textContent = needsFix
        ? `一键修正 (${formatDimension(Math.max(0.0001, validation.suggestedScale)).replace(/\.?0+$/, "")}x)`
        : "当前符合范围";
    }
  }

  function refreshScaleBarFromDimensions(ctx: PreviewContext, dims: DimensionRecord | null) {
    const maxDimension = dims ? Math.max(dims.width, dims.height, dims.depth) : 0;
    const config = makeScaleBarConfig(maxDimension);
    if (ctx.scaleBarGroup) {
      ctx.scaleBarGroup = replaceScaleBar(ctx.scene, ctx.scaleBarGroup, config);
    } else {
      ctx.scaleBarGroup = createScaleBar(ctx.scene, config);
    }
  }

  function refreshModelDimensionsFromScene(ctx: PreviewContext) {
    const dims = getModelDimensions(ctx);
    if (!dims) return;
    state.modelDimensions = dims;
    updateDimensionsDisplay(dims);
    syncSliderToScale(state.scaleValue);
    refreshScaleBarFromDimensions(ctx, dims);
    refreshDimensionValidationPanel(dims);
    const policy = orientationPolicyForAsset(getActiveAsset() ?? undefined);
    replaceRoadReferenceGroup(ctx, policy);
    updateFrontArrow(ctx, state.frontDirection, finalPreviewYawForPolicy(policy, state.frontDirection, state.yawValue));
    updateOriginAlignmentPanel();
  }

  /* ── Info panel ────────────────────────────────────────────────── */
  function renderInfoPanel(asset: AssetRecord) {
    const fCount = asset.face_count ?? asset.mesh_face_count ?? 0;
    const vCount = asset.vertex_count ?? asset.quality_metrics?.vertex_count ?? 0;
    const dims = getAssetDimensions(asset) ?? state.modelDimensions;
    const validation = validateCategoryDimension(dims, asset.category);
    const validationText = dims ? getDimensionValidationStatusText(validation) : "尚未获取当前尺寸样本。";
    const originOffset = previewCtx?.currentModel ? getBottomCenterOffset(previewCtx.currentModel) : null;
    const originNeedsFix = needsBottomCenterOriginFix(originOffset);
    updateEligibleToolbar(asset);
    setCurationSaveStatus("修改后会自动保存到元数据", "idle");

    infoGrid.innerHTML = `
      <div class="ae-info-row ae-info-label">Asset ID</div>
      <div class="ae-info-row ae-info-value ae-mono">${asset.asset_id}</div>

      <div class="ae-info-row ae-info-label">Category</div>
      <div class="ae-info-row ae-info-value">${asset.category ?? "-"}</div>

      <div class="ae-info-row ae-info-label">范围档位</div>
      <div class="ae-info-row ae-info-value">${validation.profile.name} · ${getRangeSourceLabel(validation)}</div>

      <div class="ae-info-row ae-info-label">Source</div>
      <div class="ae-info-row ae-info-value">${asset.source ?? "-"}</div>

      <div class="ae-info-row ae-info-label">License</div>
      <div class="ae-info-row ae-info-value">${asset.license ?? "-"}</div>

      <div class="ae-info-row ae-info-label">Faces / Vertices</div>
      <div class="ae-info-row ae-info-value ae-mono">${fCount.toLocaleString()} / ${vCount.toLocaleString()}</div>

      <div class="ae-info-row ae-info-label">Dimensions (m)</div>
      <div class="ae-info-row ae-info-value">
        <div class="ae-dims-scaler" id="ae-dims-scaler">
              <div class="ae-dims-inputs">
            <label class="ae-dims-field">
              <span class="ae-dims-field-label">W</span>
              <input type="number" id="ae-dim-w" class="ae-dims-input" step="0.01" min="0.01" value="${formatDimension(dims?.width)}" ${dims ? "" : "disabled"} />
            </label>
            <label class="ae-dims-field">
              <span class="ae-dims-field-label">H</span>
              <input type="number" id="ae-dim-h" class="ae-dims-input" step="0.01" min="0.01" value="${formatDimension(dims?.height)}" ${dims ? "" : "disabled"} />
            </label>
            <label class="ae-dims-field">
              <span class="ae-dims-field-label">D</span>
              <input type="number" id="ae-dim-d" class="ae-dims-input" step="0.01" min="0.01" value="${formatDimension(dims?.depth)}" ${dims ? "" : "disabled"} />
            </label>
          </div>
          <div class="ae-dims-slider-row">
            <span class="ae-dims-slider-label">Scale</span>
            <input type="range" id="ae-dims-slider" class="ae-dims-slider" min="0.1" max="10" step="0.01" value="1" ${dims ? "" : "disabled"} />
            <span class="ae-dims-slider-value" id="ae-dims-slider-val">1.00x</span>
          </div>
        </div>
      </div>

      <div class="ae-info-row ae-info-label">类别尺寸范围</div>
      <div class="ae-info-row ae-info-value">
        <div id="ae-dim-range-text">${formatCategoryRangeLine(validation.profile)}</div>
        <div id="ae-dim-range-status" class="ae-dim-range-status ${validation.violations.length === 0 ? "ok" : "warn"}">${validationText}</div>
        <div id="ae-dim-range-hint" class="ae-dim-range-hint">${dims ? (validation.violations.length > 0 ? `建议缩放: ${formatDimension(validation.suggestedScale)}x` : "当前已符合范围") : "等待模型加载完成后计算建议。"}</div>
        <button id="ae-auto-range-btn" class="ae-action-btn ${validation.violations.length === 0 ? "ae-btn-secondary" : "ae-btn-warning"}" type="button" ${dims ? (validation.violations.length > 0 ? "" : "disabled") : "disabled"}>${validation.violations.length > 0 ? `一键修正 (${formatDimension(validation.suggestedScale)}x)` : "当前符合范围"}</button>
      </div>

      <div class="ae-info-row ae-info-label">Origin Alignment</div>
      <div class="ae-info-row ae-info-value">
        <div id="ae-origin-status" class="ae-dim-range-status ${originNeedsFix ? "warn" : "ok"}">${getOriginStatusText(originOffset)}</div>
        <div id="ae-origin-offset" class="ae-dim-range-hint">Bottom center: ${formatOriginVector(originOffset)}</div>
        <label class="ae-dims-field" style="margin-top:8px;">
          <input id="ae-origin-auto-align" type="checkbox" ${state.originAutoAlignEnabled ? "checked" : ""} />
          <span class="ae-dims-field-label">Auto align on load</span>
        </label>
        <div class="ae-actions-bar" style="margin-top:8px;">
          <button id="ae-align-origin-btn" class="ae-action-btn ${originNeedsFix ? "ae-btn-warning" : "ae-btn-secondary"}" type="button" ${originNeedsFix ? "" : "disabled"}>Align & Save Now</button>
          <button id="ae-rotate-cw-btn" class="ae-action-btn ae-btn-secondary" type="button">顺时针旋转90°</button>
          <button id="ae-drag-move-toggle" class="ae-action-btn ae-btn-secondary ${state.dragMoveMode ? "active" : ""}" type="button">${state.dragMoveMode ? "Drag Move: On" : "Drag Move: Off"}</button>
        </div>
        <div class="ae-dim-range-hint">Drag Move 开启后，在预览区点击拖动物体；松开鼠标会保存当前坐标。</div>
      </div>

      <div class="ae-info-row ae-info-label">已加载样本</div>
      <div class="ae-info-row ae-info-value">${validation.sampleCount > 0 ? `${validation.sampleCount} 条（当前分类）` : "无匹配样本，使用通用规则"}</div>

      <div class="ae-info-row ae-info-label">Mesh Path</div>
      <div class="ae-info-row ae-info-value ae-mono ae-path">${asset.mesh_path ?? "-"}</div>

      <div class="ae-info-row ae-info-label">Description</div>
      <div class="ae-info-row ae-info-value ae-desc">${asset.text_desc ?? "-"}</div>

      <div class="ae-info-row ae-info-label">入库审核</div>
      <div class="ae-info-row ae-info-value">
        <div class="ae-curation-panel">
          <label class="ae-dims-field" style="margin-top:8px;">
            <span class="ae-dims-field-label">Quality Tier</span>
            <select id="ae-edit-tier" class="ae-edit-select">
              <option value="">--</option>
              ${[1, 2, 3, 4, 5].map((t) => `<option value="${t}" ${asset.quality_tier === t ? "selected" : ""}>Tier ${t}</option>`).join("")}
            </select>
          </label>

          <label class="ae-dims-field" style="margin-top:8px;">
            <span class="ae-dims-field-label">统一 Tags</span>
            <input id="ae-edit-tags" type="text" class="ae-edit-input" placeholder="tree, road_edge, low_poly" value="${escapeHtml(formatTagInput(asset.tags))}" />
          </label>

          <label class="ae-dims-field" style="margin-top:8px;">
            <span class="ae-dims-field-label">Style Tags</span>
            <input id="ae-edit-style-tags" type="text" class="ae-edit-input" placeholder="realistic, clean, damaged" value="${escapeHtml(formatTagInput(asset.style_tags))}" />
          </label>

          <label class="ae-dims-field" style="margin-top:8px;">
            <span class="ae-dims-field-label">Theme Tags</span>
            <input id="ae-edit-theme-tags" type="text" class="ae-edit-input" placeholder="urban, park, industrial" value="${escapeHtml(formatTagInput(asset.theme_tags))}" />
          </label>

          <label class="ae-dims-field" style="margin-top:8px;">
            <span class="ae-dims-field-label">不适合原因</span>
            <textarea id="ae-edit-exclusion-reason" class="ae-edit-input" rows="2" placeholder="例如：灰模、偏移严重、组合资产未拆分、尺度不可信">${escapeHtml(String(asset.scene_exclusion_reason ?? ""))}</textarea>
          </label>

          <label class="ae-dims-field" style="margin-top:8px;">
            <span class="ae-dims-field-label">审核备注</span>
            <textarea id="ae-edit-curation-notes" class="ae-edit-input" rows="2" placeholder="补充说明，可写后续处理建议">${escapeHtml(String(asset.curation_notes ?? ""))}</textarea>
          </label>
        </div>
      </div>
    `;
  }

  const eligibleToolbarLabel = document.createElement("label");
  eligibleToolbarLabel.id = "ae-toolbar-eligible-label";
  eligibleToolbarLabel.className = "ae-action-btn ae-btn-secondary";
  eligibleToolbarLabel.style.display = "inline-flex";
  eligibleToolbarLabel.style.alignItems = "center";
  eligibleToolbarLabel.style.gap = "6px";
  eligibleToolbarLabel.style.cursor = "pointer";
  eligibleToolbarLabel.title = "控制当前资产是否进入生成候选池";
  eligibleToolbarLabel.innerHTML = `
    <input id="ae-edit-eligible" type="checkbox" disabled style="margin:0;" />
    <span>可参与生成</span>
  `;
  const eligibleToolbarStatus = document.createElement("span");
  eligibleToolbarStatus.id = "ae-curation-save-status";
  eligibleToolbarStatus.className = "ae-dim-range-hint";
  eligibleToolbarStatus.dataset.status = "idle";
  eligibleToolbarStatus.textContent = "自动保存元数据";
  eligibleToolbarStatus.style.whiteSpace = "nowrap";
  eligibleToolbarStatus.style.alignSelf = "center";
  zoomFitBtn.insertAdjacentElement("afterend", eligibleToolbarStatus);
  zoomFitBtn.insertAdjacentElement("afterend", eligibleToolbarLabel);

  function updateEligibleToolbar(asset?: AssetRecord | null) {
    const checkbox = root.querySelector<HTMLInputElement>("#ae-edit-eligible");
    const label = root.querySelector<HTMLElement>("#ae-toolbar-eligible-label");
    if (!checkbox || !label) return;
    const enabled = Boolean(asset);
    checkbox.disabled = !enabled;
    checkbox.checked = enabled ? isSceneEligible(asset) : false;
    label.classList.toggle("active", enabled && isSceneEligible(asset));
    label.style.opacity = enabled ? "1" : "0.55";
  }

  const curationAutosaveFieldIds = new Set([
    "ae-edit-tier",
    "ae-edit-eligible",
    "ae-edit-tags",
    "ae-edit-style-tags",
    "ae-edit-theme-tags",
    "ae-edit-exclusion-reason",
    "ae-edit-curation-notes",
  ]);

  function isCurationAutosaveField(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && curationAutosaveFieldIds.has(target.id);
  }

  root.addEventListener("input", (event) => {
    if (!isCurationAutosaveField(event.target)) return;
    scheduleCurationAutosave();
  });

  root.addEventListener("change", (event) => {
    if (!isCurationAutosaveField(event.target)) return;
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === "ae-edit-eligible" && target.checked) {
      const reasonEl = root.querySelector<HTMLTextAreaElement>("#ae-edit-exclusion-reason");
      if (reasonEl) reasonEl.value = "";
    }
    if (target instanceof HTMLInputElement && target.id === "ae-edit-eligible") {
      const label = root.querySelector<HTMLElement>("#ae-toolbar-eligible-label");
      if (label) label.classList.toggle("active", target.checked);
    }
    scheduleCurationAutosave();
  });

  root.addEventListener("change", (event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLInputElement) || target.id !== "ae-origin-auto-align") return;
    state.originAutoAlignEnabled = target.checked;
    localStorage.setItem("roadgen3d.assetEditor.originAutoAlign", String(state.originAutoAlignEnabled));
    updateOriginAlignmentPanel();
    if (state.originAutoAlignEnabled && previewCtx) {
      const asset = getActiveAsset();
      if (asset) {
        void autoFixAssetOriginIfNeeded(previewCtx, asset).catch((err) => {
          showToast(root, `自动对齐失败: ${err}`, "error");
        });
      }
    }
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const alignBtn = target.closest<HTMLButtonElement>("#ae-align-origin-btn");
    if (alignBtn) {
      const asset = getActiveAsset();
      if (!previewCtx || !asset) return;
      alignBtn.disabled = true;
      alignBtn.textContent = "Aligning...";
      void autoFixAssetOriginIfNeeded(previewCtx, asset, true)
        .catch((err) => showToast(root, `对齐保存失败: ${err}`, "error"))
        .finally(() => {
          alignBtn.textContent = "Align & Save Now";
          updateOriginAlignmentPanel();
        });
      return;
    }

    const dragBtn = target.closest<HTMLButtonElement>("#ae-drag-move-toggle");
    if (dragBtn) {
      setDragMoveMode(!state.dragMoveMode);
    }

    const rotateBtn = target.closest<HTMLButtonElement>("#ae-rotate-cw-btn");
    if (rotateBtn) {
      const asset = getActiveAsset();
      if (!previewCtx || !asset) return;

      const nextYaw = normalizeYawDeg(state.yawValue + 90);
      state.yawValue = nextYaw;
      yawInput.value = String(nextYaw);
      applyYaw(previewCtx, nextYaw);
      refreshModelDimensionsFromScene(previewCtx);
      updateOrientationStatus();
      updateFrontArrow(
        previewCtx,
        state.frontDirection,
        finalPreviewYawForPolicy(orientationPolicyForAsset(asset), state.frontDirection, nextYaw),
      );

      rotateBtn.disabled = true;
      rotateBtn.textContent = "旋转中...";
      void saveCurrentModelOrigin(
        previewCtx,
        asset,
        {
          yaw_deg: nextYaw,
          canonical_front: normalizeCanonicalFront(state.frontDirection),
          origin_fix_mode: "manual-rotate",
          origin_manual_rotate_saved_at: new Date().toISOString(),
        },
        "顺时针旋转90°并自动保存",
      ).catch((err) => showToast(root, `顺时针旋转并保存失败: ${err}`, "error"))
        .finally(() => {
          rotateBtn.disabled = false;
          rotateBtn.textContent = "顺时针旋转90°";
        });
    }
  });

  /* ── Object list ───────────────────────────────────────────────── */
  function renderObjectList() {
    const children = state.sceneChildren;
    if (children.length === 0) {
      objectSection.style.display = "none";
      return;
    }
    objectSection.style.display = "";

    const dupGroups = new Set(children.filter((c) => c.isDuplicate).map((c) => c.duplicateGroup));
    if (dupGroups.size > 0) {
      dupCount.style.display = "";
      dupCount.textContent = `${dupGroups.size} duplicate group(s)`;
    } else {
      dupCount.style.display = "none";
    }

    objectList.innerHTML = "";
    for (const child of children) {
      const row = document.createElement("label");
      row.className = "ae-object-row" + (child.isDuplicate ? " ae-object-dup" : "");
      row.innerHTML = `
        <input type="checkbox" class="ae-object-check" data-uuid="${child.uuid}" />
        <span class="ae-object-name">${child.name}</span>
        <span class="ae-object-stats">${child.vertexCount}v ${child.faceCount}f</span>
        ${child.isDuplicate ? '<span class="ae-object-dup-tag">dup</span>' : ""}
      `;
      const check = row.querySelector<HTMLInputElement>(".ae-object-check")!;
      check.addEventListener("change", () => {
        if (check.checked) {
          state.selectedObjects.add(child.uuid);
        } else {
          state.selectedObjects.delete(child.uuid);
        }
        updateActionButtons();
      });
      objectList.appendChild(row);
    }
  }

  /* ── Action buttons state ──────────────────────────────────────── */
  function updateActionButtons() {
    const hasDups = state.sceneChildren.some((c) => c.isDuplicate);
    const hasSelection = state.selectedObjects.size > 0 || state.selectedMeshes.size > 0;
    removeDupsBtn.disabled = !hasDups;
    autoSplitRecordsBtn.disabled = !state.selectedAssetId || state.sceneChildren.length < 1;
    backendSplitBtn.disabled = !state.selectedAssetId || !state.manifestName;
    extractSkyBtn.disabled = !state.selectedAssetId || state.sceneChildren.length < 1;
    splitBtn.disabled = !hasSelection;
  }

  /* ── Preview toolbar ───────────────────────────────────────────── */
  modeSolid.addEventListener("click", () => {
    state.renderMode = "solid";
    modeSolid.classList.add("active");
    modeWire.classList.remove("active");
    if (previewCtx) toggleWireframe(previewCtx, false);
  });

  modeWire.addEventListener("click", () => {
    state.renderMode = "wireframe";
    modeWire.classList.add("active");
    modeSolid.classList.remove("active");
    if (previewCtx) toggleWireframe(previewCtx, true);
  });

  let bboxVisible = false;
  toggleBboxBtn.addEventListener("click", () => {
    bboxVisible = !bboxVisible;
    toggleBboxBtn.classList.toggle("active", bboxVisible);
    if (previewCtx) toggleBbox(previewCtx, bboxVisible);
  });

  zoomFitBtn.addEventListener("click", () => {
    if (previewCtx) zoomToFit(previewCtx);
  });

  /* ── Selection Box (Rectangle Selection) ───────────────────────── */
  function updateDeleteButtonState() {
    deleteSelectedBtn.disabled = state.selectedMeshes.size === 0;
    updateActionButtons();
  }

  function clearMeshSelection() {
    if (!previewCtx) return;
    for (const mesh of state.selectedMeshes) {
      highlightMesh(previewCtx, mesh, false);
    }
    state.selectedMeshes.clear();
    updateDeleteButtonState();
  }

  function setupSelectionEvents() {
    if (!previewCtx?.selectionHelper) return;

    const canvas = previewCtx.renderer.domElement;
    const helper = previewCtx.selectionHelper;
    if (helper.enabled) return;
    helper.enabled = true;

    canvas.addEventListener("pointerdown", (e) => {
      if (!state.selectionMode || e.button !== 0) return;

      // Don't start selection if clicking on controls
      if ((e.target as HTMLElement).closest(".ae-preview-toolbar")) return;

      helper.isDown = true;
      helper.startPoint.set(e.offsetX, e.offsetY);
      e.preventDefault();
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!state.selectionMode || !helper.isDown) return;

      updateSelectionBox(helper, helper.startPoint.x, helper.startPoint.y, e.offsetX, e.offsetY);
    });

    canvas.addEventListener("pointerup", (e) => {
      if (!state.selectionMode || !helper.isDown) return;

      hideSelectionBox(helper);

      // Get meshes in selection area
      if (previewCtx) {
        const selectedMeshes = getMeshesInSelectionArea(previewCtx, helper);

        // Clear previous selection if not holding Ctrl/Cmd
        if (!e.ctrlKey && !e.metaKey) {
          clearMeshSelection();
        }

        // Add new selection
        for (const mesh of selectedMeshes) {
          if (!state.selectedMeshes.has(mesh)) {
            state.selectedMeshes.add(mesh);
            highlightMesh(previewCtx, mesh, true);
          }
        }

        updateDeleteButtonState();

        if (selectedMeshes.length > 0) {
          showToast(root, `Selected ${state.selectedMeshes.size} object(s)`);
        }
      }
    });

    // Cancel selection on pointer leave
    canvas.addEventListener("pointerleave", () => {
      if (helper.isDown) {
        hideSelectionBox(helper);
      }
    });
  }

  let dragMoveEventsBound = false;
  let dragMoving = false;
  let dragMoved = false;
  const dragRaycaster = new THREE.Raycaster();
  const dragPointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const dragStartPoint = new THREE.Vector3();
  const dragStartPosition = new THREE.Vector3();

  function getDragGroundPoint(event: PointerEvent, out: THREE.Vector3): boolean {
    if (!previewCtx) return false;
    const rect = previewCtx.renderer.domElement.getBoundingClientRect();
    dragPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    dragPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    dragRaycaster.setFromCamera(dragPointer, previewCtx.camera);
    return Boolean(dragRaycaster.ray.intersectPlane(dragPlane, out));
  }

  function setupDragMoveEvents() {
    if (!previewCtx || dragMoveEventsBound) return;
    dragMoveEventsBound = true;
    const canvas = previewCtx.renderer.domElement;

    canvas.addEventListener("pointerdown", (event) => {
      if (!state.dragMoveMode || state.selectionMode || !previewCtx?.currentModel || event.button !== 0) return;
      if (!getDragGroundPoint(event, dragStartPoint)) return;
      dragMoving = true;
      dragMoved = false;
      dragStartPosition.copy(previewCtx.currentModel.position);
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      event.preventDefault();
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragMoving || !state.dragMoveMode || !previewCtx?.currentModel) return;
      const currentPoint = new THREE.Vector3();
      if (!getDragGroundPoint(event, currentPoint)) return;
      const delta = currentPoint.sub(dragStartPoint);
      previewCtx.currentModel.position.set(
        dragStartPosition.x + delta.x,
        dragStartPosition.y,
        dragStartPosition.z + delta.z,
      );
      previewCtx.currentModel.updateMatrixWorld(true);
      dragMoved = dragMoved || Math.abs(delta.x) > 0.001 || Math.abs(delta.z) > 0.001;
      updateOriginAlignmentPanel();
      event.preventDefault();
    });

    const finishDrag = (event: PointerEvent) => {
      if (!dragMoving) return;
      dragMoving = false;
      if (state.dragMoveMode) canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      if (dragMoved && previewCtx?.currentModel) {
        const asset = getActiveAsset();
        if (asset) {
          void saveCurrentModelOrigin(
            previewCtx,
            asset,
            {
              origin_fix_mode: "manual-drag",
              origin_manual_drag_saved_at: new Date().toISOString(),
            },
            "手动移动已保存",
            true,
          ).catch((err) => showToast(root, `手动移动保存失败: ${err}`, "error"));
        }
      }
    };

    canvas.addEventListener("pointerup", finishDrag);
    canvas.addEventListener("pointercancel", finishDrag);
  }

  function setDragMoveMode(enabled: boolean) {
    state.dragMoveMode = enabled;
    if (enabled) {
      state.selectionMode = false;
      toggleSelectBtn.classList.remove("active");
      if (previewCtx?.selectionHelper?.isDown) {
        hideSelectionBox(previewCtx.selectionHelper);
      }
      if (previewCtx) {
        previewCtx.controls.enabled = false;
        previewCtx.renderer.domElement.style.cursor = "grab";
        setupDragMoveEvents();
      }
      showToast(root, "Drag Move: 点击并拖动物体，松开后自动保存");
    } else if (previewCtx) {
      previewCtx.controls.enabled = !state.selectionMode;
      previewCtx.renderer.domElement.style.cursor = state.selectionMode ? "crosshair" : "";
    }
    updateOriginAlignmentPanel();
  }

  toggleSelectBtn.addEventListener("click", () => {
    if (!state.selectionMode && state.dragMoveMode) {
      setDragMoveMode(false);
    }
    state.selectionMode = !state.selectionMode;
    toggleSelectBtn.classList.toggle("active", state.selectionMode);

    if (previewCtx) {
      // Disable orbit controls when in selection mode
      previewCtx.controls.enabled = !state.selectionMode;

      if (state.selectionMode) {
        previewCtx.renderer.domElement.style.cursor = "crosshair";
        showToast(root, "Selection mode: Drag to select objects");
        setupSelectionEvents();
      } else {
        previewCtx.renderer.domElement.style.cursor = "";
        clearMeshSelection();
      }
    }
  });

  deleteSelectedBtn.addEventListener("click", () => {
    if (!previewCtx || state.selectedMeshes.size === 0) return;

    const meshesToDelete = Array.from(state.selectedMeshes);
    const deletedCount = deleteSelectedMeshes(previewCtx, meshesToDelete);

    // Update state
    state.selectedMeshes.clear();
    updateDeleteButtonState();

    // Re-analyze scene
    if (previewCtx.currentModel) {
      state.sceneChildren = analyzeChildren(previewCtx.currentModel);
      renderObjectList();
      updateActionButtons();
      refreshModelDimensionsFromScene(previewCtx);
    }

    showToast(root, `Deleted ${deletedCount} object(s)`);
  });

  /* ── Delete asset record ───────────────────────────────────────── */
  deleteRecordBtn.addEventListener("click", async () => {
    if (!state.selectedAssetId || !state.manifestName) return;
    
    const asset = state.assets.find((a) => a.asset_id === state.selectedAssetId);
    if (!asset) return;
    
    // Confirm deletion
    const confirmed = confirm(
      `Delete this asset from manifest?\n\nAsset ID: ${asset.asset_id}\nCategory: ${asset.category || "unknown"}\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;
    
    try {
      await deleteAssetRecord(state.manifestName, state.selectedAssetId);
      
      // Remove from local state
      const idx = state.assets.findIndex((a) => a.asset_id === state.selectedAssetId);
      if (idx !== -1) {
        state.assets.splice(idx, 1);
        state.totalAssets--;
      }
      
      // Clear selection
      state.selectedAssetId = null;
      showEmptyState();
      
      // Re-render gallery
      applyFilters();
      await refreshManifestAfterWrite(false);
      
      showToast(root, "Asset record deleted");
    } catch (err) {
      showToast(root, `Delete failed: ${err}`, "error");
    }
  });

  /* ── Scale input → live preview ───────────────────────────────── */
  function syncSliderToScale(scale: number) {
    const slider = document.getElementById("ae-dims-slider") as HTMLInputElement | null;
    const sliderVal = document.getElementById("ae-dims-slider-val");
    if (!slider) return;
    // Dynamic range: 0.1x to 10x around current scale
    const lo = scale * 0.1;
    const hi = scale * 10;
    const step = scale * 0.01;
    slider.min = String(lo);
    slider.max = String(hi);
    slider.step = String(step);
    slider.value = String(scale);
    if (sliderVal) sliderVal.textContent = `${scale.toFixed(4)}x`;
  }

  function clampScaleValue(scale: number): number {
    if (!Number.isFinite(scale)) return 1;
    return Math.max(0.01, Math.min(100, scale));
  }

  function applyAbsoluteScale(scale: number) {
    const targetScale = clampScaleValue(scale);
    state.scaleValue = targetScale;
    scaleInput.value = targetScale.toFixed(4);
    if (previewCtx) {
      applyScale(previewCtx, targetScale);
      refreshModelDimensionsFromScene(previewCtx);
    } else {
      syncSliderToScale(targetScale);
    }
    scheduleDimensionAutosave();
  }

  scaleInput.addEventListener("input", () => {
    const val = parseFloat(scaleInput.value);
    if (isNaN(val) || val <= 0) return;
    applyAbsoluteScale(val);
  });

  /* ── Proportional dimension scaling (live preview) ─────────────── */
  function applyProportionalScale(ratio: number) {
    if (!state.originalDimensions) return;
    applyAbsoluteScale(ratio);
  }

  function handleDimInputChange(changedAxis: "w" | "h" | "d") {
    if (!state.originalDimensions) return;
    const orig = state.originalDimensions;
    const wInput = document.getElementById("ae-dim-w") as HTMLInputElement | null;
    const hInput = document.getElementById("ae-dim-h") as HTMLInputElement | null;
    const dInput = document.getElementById("ae-dim-d") as HTMLInputElement | null;
    if (!wInput || !hInput || !dInput) return;

    let newValue: number;
    let originalValue: number;
    if (changedAxis === "w") {
      newValue = parseFloat(wInput.value);
      originalValue = orig.width;
    } else if (changedAxis === "h") {
      newValue = parseFloat(hInput.value);
      originalValue = orig.height;
    } else {
      newValue = parseFloat(dInput.value);
      originalValue = orig.depth;
    }
    if (isNaN(newValue) || newValue <= 0 || originalValue <= 0) return;
    applyProportionalScale(newValue / originalValue);
  }

  root.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "ae-dim-w") handleDimInputChange("w");
    else if (target.id === "ae-dim-h") handleDimInputChange("h");
    else if (target.id === "ae-dim-d") handleDimInputChange("d");
    else if (target.id === "ae-dims-slider") {
      const val = parseFloat((target as HTMLInputElement).value);
      if (!isNaN(val) && val > 0) applyProportionalScale(val);
    }
  });

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.id !== "ae-auto-range-btn") return;
    const activeAsset = getActiveAsset();
    if (!activeAsset) return;
    if (!previewCtx?.currentModel) {
      showToast(root, "No model loaded for auto-fix");
      return;
    }

    const dims = state.modelDimensions;
    const validation = validateCategoryDimension(dims, activeAsset.category);
    if (!dims || validation.violations.length === 0) {
      showToast(root, "当前尺寸已在规则范围内");
      return;
    }
    if (!Number.isFinite(validation.suggestedScale) || validation.suggestedScale <= 0) {
      showToast(root, "无法自动计算安全缩放值");
      return;
    }

    applyAbsoluteScale(validation.suggestedScale);
    showToast(root, validation.feasible
      ? `已按 ${formatDimension(validation.suggestedScale)}x 自动修正到范围`
      : `已按最接近范围的比例 ${formatDimension(validation.suggestedScale)}x 修正（范围冲突，将取妥协）`);
  });

  /* ── Yaw → live preview ───────────────────────────────────────── */
  yawInput.addEventListener("input", () => {
    const val = parseFloat(yawInput.value);
    if (isNaN(val)) return;
    const normalizedYaw = normalizeYawDeg(val);
    state.yawValue = normalizedYaw;
    if (previewCtx) {
      applyYaw(previewCtx, normalizedYaw);
      refreshModelDimensionsFromScene(previewCtx);
    }
    updateOrientationStatus();
  });

  /* ── Front Direction → live preview ───────────────────────────── */
  frontSelect.addEventListener("change", () => {
    state.frontDirection = normalizeCanonicalFront(frontSelect.value);
    frontSelect.value = state.frontDirection;
    if (previewCtx) {
      const policy = orientationPolicyForAsset(getActiveAsset() ?? undefined);
      updateFrontArrow(
        previewCtx,
        state.frontDirection,
        finalPreviewYawForPolicy(policy, state.frontDirection, state.yawValue),
      );
    }
    updateOrientationStatus();
  });

  /* ── Export ─────────────────────────────────────────────────────── */
  exportBtn.addEventListener("click", async () => {
    if (!previewCtx?.currentModel) return;
    try {
      const cloned = cloneObjectForGlbExport(previewCtx.currentModel, previewCtx.originalMaterials);
      const data = await exportGlb(cloned);
      const asset = state.assets.find((a) => a.asset_id === state.selectedAssetId);
      const name = asset?.asset_id ?? "exported";
      triggerDownload(data, `${name}_scaled_${state.scaleValue}.glb`);
      showToast(root, "GLB exported successfully");
    } catch (err) {
      showToast(root, `Export failed: ${err}`, "error");
    }
  });

  /* ── Unified Save ──────────────────────────────────────────────── */
  saveBtn.addEventListener("click", async () => {
    if (!state.selectedAssetId || !state.manifestName) return;

    const curationUpdates = collectCurationUpdatesFromPanel();
    if (!curationUpdates) return;

    const updates: Record<string, unknown> = { ...curationUpdates };
    updates.scale = state.scaleValue;
    updates.yaw_deg = normalizeYawDeg(state.yawValue);
    updates.canonical_front = normalizeCanonicalFront(state.frontDirection);
    if (state.modelDimensions) {
      updates.dimensions_m = {
        width: state.modelDimensions.width,
        height: state.modelDimensions.height,
        depth: state.modelDimensions.depth,
      };
    }

    try {
      await saveAssetMetadata(state.manifestName, state.selectedAssetId, updates);
      const asset = state.assets.find((a) => a.asset_id === state.selectedAssetId);
      if (asset) {
        applyCurationUpdatesToAsset(asset, curationUpdates);
        asset.scale = state.scaleValue;
        asset.yaw_deg = updates.yaw_deg as number;
        asset.canonical_front = updates.canonical_front as string;
        if (updates.dimensions_m) asset.dimensions_m = updates.dimensions_m as { width?: number; height?: number; depth?: number };
      }
      renderGallery();
      showToast(root, "Saved");
    } catch (err) {
      showToast(root, `Save failed: ${err}`, "error");
    }
  });

  /* ── Remove duplicates ─────────────────────────────────────────── */
  removeDupsBtn.addEventListener("click", () => {
    if (!previewCtx?.currentModel) return;

    const dupGroups = new Map<number, THREE.Mesh[]>();
    const meshes: THREE.Mesh[] = [];
    previewCtx.currentModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });

    // Find duplicate info for each mesh
    for (const mesh of meshes) {
      const childInfo = state.sceneChildren.find((c) => c.uuid === mesh.uuid);
      if (childInfo?.isDuplicate) {
        if (!dupGroups.has(childInfo.duplicateGroup)) dupGroups.set(childInfo.duplicateGroup, []);
        dupGroups.get(childInfo.duplicateGroup)!.push(mesh);
      }
    }

    // Keep first of each group, remove rest
    let removedCount = 0;
    for (const [, group] of dupGroups) {
      // Keep the first, remove others
      for (let i = 1; i < group.length; i++) {
        const mesh = group[i];
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material.dispose();
        }
        removedCount++;
      }
    }

    // Re-analyze
    if (previewCtx.currentModel) {
      state.sceneChildren = analyzeChildren(previewCtx.currentModel);
      renderObjectList();
      updateActionButtons();
      refreshModelDimensionsFromScene(previewCtx);
    }
    showToast(root, `Removed ${removedCount} duplicate mesh(es)`);
  });

  /* ── Backend projection split into manifest records ─────────────── */
  backendSplitBtn.addEventListener("click", async () => {
    if (!state.selectedAssetId || !state.manifestName) return;
    const parentAsset = getActiveAsset();
    if (!parentAsset) return;

    backendSplitBtn.disabled = true;
    backendSplitBtn.textContent = "Backend Splitting...";

    try {
      const result = await splitAssetWithBackendAuto(state.manifestName, parentAsset.asset_id);
      let addedCount = 0;
      for (const asset of result.assets) {
        const existingIndex = state.assets.findIndex((item) => item.asset_id === asset.asset_id);
        if (existingIndex >= 0) {
          state.assets[existingIndex] = asset;
        } else {
          state.assets.unshift(asset);
          addedCount += 1;
        }
      }
      state.totalAssets += addedCount;
      rebuildCategoryProfiles(state.assets);
      applyFilters();
      await refreshManifestAfterWrite(true);
      showToast(
        root,
        `后端自动拆分完成：新增 ${result.created_count || result.assets.length} 个子资产，cluster=${result.cluster_count}, method=${result.actual_method}${result.fallback_reason ? " fallback" : ""}`,
      );
    } catch (err) {
      showToast(root, `后端自动拆分失败: ${err}`, "error");
    } finally {
      backendSplitBtn.textContent = "Backend Auto Split";
      updateActionButtons();
    }
  });

  /* ── Auto split into manifest records ──────────────────────────── */
  autoSplitRecordsBtn.addEventListener("click", async () => {
    if (!previewCtx?.currentModel || !state.selectedAssetId || !state.manifestName) return;
    const parentAsset = getActiveAsset();
    if (!parentAsset) return;

    const splitUnits = collectAutoSplitUnits(previewCtx.currentModel, previewCtx.originalMaterials);
    const clusters = clusterMeshesByFootprint(splitUnits).filter((cluster) => cluster.length > 0);
    if (clusters.length <= 1) {
      showToast(root, "未检测到可拆分的独立子对象", "error");
      return;
    }

    const existingIds = new Set(state.assets.map((asset) => asset.asset_id));
    const payload: Array<{ asset_id: string; record: AssetRecord; glb_base64: string }> = [];
    autoSplitRecordsBtn.disabled = true;
    autoSplitRecordsBtn.textContent = "Splitting...";

    try {
      let subIndex = 1;
      for (const cluster of clusters) {
        const assetId = makeUniqueSubAssetId(parentAsset.asset_id, subIndex, existingIds);
        existingIds.add(assetId);
        const exported = buildClusterExport(cluster, previewCtx.originalMaterials);
        const glbData = await exportGlb(exported.scene);
        payload.push({
          asset_id: assetId,
          record: buildSubAssetRecord(
            parentAsset,
            assetId,
            subIndex,
            exported.dimensions,
            exported.faceCount,
            exported.vertexCount,
          ),
          glb_base64: arrayBufferToBase64(glbData),
        });
        subIndex += 1;
      }

      const createdAssets = await createAssetRecords(state.manifestName, payload);
      state.assets.unshift(...createdAssets);
      state.totalAssets += createdAssets.length;
      rebuildCategoryProfiles(state.assets);
      applyFilters();
      await refreshManifestAfterWrite(true);
      showToast(root, `已拆分并新增 ${createdAssets.length} 个子资产记录`);
    } catch (err) {
      showToast(root, `自动拆分失败: ${err}`, "error");
    } finally {
      autoSplitRecordsBtn.textContent = "Auto Split Records";
      updateActionButtons();
    }
  });

  /* ── Extract or create sky dome ────────────────────────────────── */
  extractSkyBtn.addEventListener("click", async () => {
    if (!previewCtx?.currentModel || !state.selectedAssetId || !state.manifestName) return;
    const parentAsset = getActiveAsset();
    if (!parentAsset) return;

    extractSkyBtn.disabled = true;
    extractSkyBtn.textContent = "Creating Sky...";

    try {
      const existingIds = new Set(state.assets.map((asset) => asset.asset_id));
      const assetId = makeUniqueAssetId(`${parentAsset.asset_id}-sky-dome`, existingIds);
      const splitUnits = collectAutoSplitUnits(previewCtx.currentModel, previewCtx.originalMaterials);
      const sphere = pickSkySphereCandidate(splitUnits);
      let mode: "extracted" | "procedural" = "procedural";
      let glbData: ArrayBuffer;
      let dimensions: DimensionRecord | null;
      let faceCount: number;
      let vertexCount: number;

      if (sphere) {
        const exported = buildClusterExport([sphere], previewCtx.originalMaterials);
        glbData = await exportGlb(exported.scene);
        dimensions = exported.dimensions;
        faceCount = exported.faceCount;
        vertexCount = exported.vertexCount;
        mode = "extracted";
      } else {
        const exported = createProceduralSkyDomeExport();
        glbData = await exportGlb(exported.scene);
        dimensions = exported.dimensions;
        faceCount = exported.faceCount;
        vertexCount = exported.vertexCount;
      }

      const createdAssets = await createAssetRecords(state.manifestName, [{
        asset_id: assetId,
        record: buildSkyDomeRecord(parentAsset, assetId, dimensions, faceCount, vertexCount, mode),
        glb_base64: arrayBufferToBase64(glbData),
      }]);

      state.assets.unshift(...createdAssets);
      state.totalAssets += createdAssets.length;
      rebuildCategoryProfiles(state.assets);
      applyFilters();
      await refreshManifestAfterWrite(true);
      showToast(root, mode === "extracted"
        ? "已提取天空球并创建 sky_dome 记录"
        : "未找到圆球，已生成程序化 sky_dome 记录");
    } catch (err) {
      showToast(root, `天空球创建失败: ${err}`, "error");
    } finally {
      extractSkyBtn.textContent = "Extract Sky Dome";
      updateActionButtons();
    }
  });

  /* ── Split selected ────────────────────────────────────────────── */
  splitBtn.addEventListener("click", async () => {
    if (!previewCtx?.currentModel || !state.selectedAssetId || !state.manifestName) return;
    const ctx = previewCtx;
    const currentModel = ctx.currentModel!;
    const parentAsset = getActiveAsset();
    if (!parentAsset) return;

    const allMeshes = collectModelMeshes(currentModel);
    const selectedByObjectList = allMeshes.filter((mesh) => state.selectedObjects.has(mesh.uuid));
    const selectedMeshes = Array.from(new Set([...Array.from(state.selectedMeshes), ...selectedByObjectList]));
    if (selectedMeshes.length === 0) {
      showToast(root, "No valid meshes selected", "error");
      return;
    }

    const splitUnits = selectedMeshes.flatMap((mesh) => splitMergedMeshByConnectivity(mesh, ctx.originalMaterials));
    const clusters = clusterMeshesByFootprint(splitUnits).filter((cluster) => cluster.length > 0);
    if (clusters.length === 0) {
      showToast(root, "No split clusters found", "error");
      return;
    }

    const existingIds = new Set(state.assets.map((asset) => asset.asset_id));
    const payload: Array<{ asset_id: string; record: AssetRecord; glb_base64: string }> = [];
    splitBtn.disabled = true;
    splitBtn.textContent = "Creating...";

    try {
      let subIndex = 1;
      for (const cluster of clusters) {
        const assetId = makeUniqueSubAssetId(parentAsset.asset_id, subIndex, existingIds);
        existingIds.add(assetId);
        const exported = buildClusterExport(cluster, ctx.originalMaterials);
        const glbData = await exportGlb(exported.scene);
        payload.push({
          asset_id: assetId,
          record: buildSubAssetRecord(
            parentAsset,
            assetId,
            subIndex,
            exported.dimensions,
            exported.faceCount,
            exported.vertexCount,
          ),
          glb_base64: arrayBufferToBase64(glbData),
        });
        subIndex += 1;
      }

      const createdAssets = await createAssetRecords(state.manifestName, payload);
      state.assets.unshift(...createdAssets);
      state.totalAssets += createdAssets.length;
      rebuildCategoryProfiles(state.assets);
      applyFilters();
      await refreshManifestAfterWrite(true);
      clearMeshSelection();
      state.selectedObjects.clear();
      renderObjectList();
      showToast(root, `已从选中对象新增 ${createdAssets.length} 个子资产记录`);
    } catch (err) {
      showToast(root, `拆分选中失败: ${err}`, "error");
    } finally {
      splitBtn.textContent = "Split Selected";
      updateActionButtons();
    }
  });

  function refreshAssetEditorLanguage(): void {
    currentLanguage = loadViewerLanguage();
    applyViewerTranslations(root, currentLanguage);
    if (leftPinButton) {
      leftPinButton.textContent = translateViewerKey(currentLanguage, "shell.pinned") ?? "Pinned";
      leftPinButton.title = translateViewerKey(currentLanguage, "shell.unpinLeft") ?? "Unpin left sidebar";
    }
    renderGallery();
    renderCandidateRepository();
    if (emptyState.style.display !== "none") {
      if (currentEmptyTranslation) {
        showTranslatedEmptyState(
          currentEmptyTranslation.titleKey,
          currentEmptyTranslation.messageKey,
          currentEmptyTranslation.detail,
        );
      } else {
        showEmptyState();
      }
    }
    updateOrientationStatus();
  }

  window.addEventListener(VIEWER_LANGUAGE_EVENT, refreshAssetEditorLanguage, { signal: languageController.signal });
  /* ── Init ──────────────────────────────────────────────────────── */
  shell.sidebar.activate("asset-library");
  initManifests();

  /* ── Teardown ──────────────────────────────────────────────────── */
  return () => {
    destroyed = true;
    unsubscribeCandidateWorkflow?.();
    languageController.abort();
    clearDimensionAutosaveTimer();
    clearCurationAutosaveTimer();
    pendingDimensionAutosave = null;
    pendingCurationAutosave = null;
    if (previewCtx) {
      cancelAnimationFrame(previewCtx.animId);
      if (previewCtx.scaleBarGroup) {
        disposeScaleBar(previewCtx.scaleBarGroup);
        previewCtx.scaleBarGroup = null;
      }
      previewCtx.labelRenderer.domElement.remove();
      previewCtx.renderer.domElement.remove();
      previewCtx.renderer.dispose();
      previewCtx.controls.dispose();
      previewCtx.originalMaterials.clear();
      previewCtx = null;
    }
  };
}
