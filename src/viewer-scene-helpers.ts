import * as THREE from "three";
import type { BranchInfluenceRow, BranchRunNode, ViewerManifest } from "./viewer-types";
import { createTextSprite, disposeObject } from "./viewer-utils";
import { resolveInstanceIdFromName } from "./viewer-hit-info";

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

type AnalysisOverlayIntent = {
  id: string;
  label: string;
  color: number;
  terms: string[];
  categories: string[];
  bandTerms: string[];
};

const ANALYSIS_LABEL_LIMIT = 12;

const ANALYSIS_OVERLAY_INTENTS: AnalysisOverlayIntent[] = [
  {
    id: "sidewalk",
    label: "Active sidewalk / clear path",
    color: 0x38bdf8,
    terms: ["sidewalk", "clear sidewalk", "clear_path", "clear path", "footway", "pedestrian", "walkability", "sidewalk_width_m"],
    categories: ["sidewalk", "clear_path"],
    bandTerms: ["sidewalk", "clear_path", "clear path", "pedestrian"],
  },
  {
    id: "tree",
    label: "Active tree / canopy",
    color: 0x22c55e,
    terms: ["tree", "canopy", "green", "landscape", "grass", "tree_count", "shade"],
    categories: ["tree", "landscape", "grass"],
    bandTerms: ["grass", "landscape", "tree_pit", "tree pit", "planting"],
  },
  {
    id: "safety",
    label: "Active safety / crossing",
    color: 0xf97316,
    terms: ["safety", "crossing", "crosswalk", "conflict", "visibility", "curb", "refuge", "lane_mark"],
    categories: ["crossing", "marking", "bollard"],
    bandTerms: ["crossing", "crosswalk", "lane_mark", "lane mark", "refuge"],
  },
  {
    id: "bike",
    label: "Active bike lane",
    color: 0x06b6d4,
    terms: ["bike", "bicycle", "cycle", "bike_lane", "cycling"],
    categories: ["bike", "bike_lane"],
    bandTerms: ["bike_lane", "bike lane", "cycle", "cycling"],
  },
  {
    id: "transit",
    label: "Active transit",
    color: 0x8b5cf6,
    terms: ["bus", "transit", "bus_stop", "bus_lane", "transit_pad", "stop"],
    categories: ["bus_stop", "transit"],
    bandTerms: ["bus_lane", "bus lane", "transit_pad", "transit pad", "bus_stop"],
  },
  {
    id: "furnishing",
    label: "Active furnishing",
    color: 0xeab308,
    terms: ["bench", "seat", "lamp", "lighting", "bollard", "trash", "mailbox", "hydrant", "furnishing", "furniture"],
    categories: ["bench", "lamp", "bollard", "trash", "mailbox", "hydrant", "furnishing"],
    bandTerms: ["furnishing", "furniture"],
  },
  {
    id: "roadway",
    label: "Active roadway / lanes",
    color: 0xfacc15,
    terms: ["lane_count", "road_width_m", "carriageway", "roadway", "lane", "traffic"],
    categories: ["road", "roadway", "carriageway"],
    bandTerms: ["carriageway", "roadway", "road", "lane"],
  },
  {
    id: "building",
    label: "Active building edge",
    color: 0xa78bfa,
    terms: ["building", "frontage", "facade", "lot", "parcel", "setback"],
    categories: ["building"],
    bandTerms: ["building", "building_buffer", "building buffer", "frontage"],
  },
];

export function removeFrameAndAssetHelpers(scene: THREE.Scene): void {
  const helpers: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (child.userData.isFrameHelper || child.userData.isAssetBboxHelper || child.userData.isAssetLabel) {
      helpers.push(child);
    }
  });
  helpers.forEach((helper) => disposeObject(helper));
}

export function removeAnalysisOverlayHelpers(scene: THREE.Scene): void {
  const helpers: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (child.userData.isAnalysisOverlayHelper || child.userData.isAnalysisOverlayLabel) {
      helpers.push(child);
    }
  });
  helpers.forEach((helper) => disposeObject(helper));
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase();
  }
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return "";
  }
}

function includesAny(haystack: string, terms: string[]): boolean {
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function scalarRecordText(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!record) return "";
  return keys.map((key) => normalizeText(record[key])).join(" ");
}

function rowText(row: BranchInfluenceRow): string {
  return [
    row.id,
    row.group,
    row.source_type,
    row.label,
    row.detail,
    row.field,
    row.source,
    row.knowledge_source,
    normalizeText(row.value),
  ].map(normalizeText).join(" ");
}

function analysisTextForNode(node: BranchRunNode): string {
  const activeRows = (node.influence_rows ?? []).filter((row) => row.active);
  return [
    node.node_id,
    ...activeRows.map(rowText),
    normalizeText(node.analysis_features),
    normalizeText(node.config_patch),
    normalizeText(node.optimization_directives),
  ].join(" ");
}

function intentsForBranchNode(node: BranchRunNode): AnalysisOverlayIntent[] {
  const activeRows = (node.influence_rows ?? []).filter((row) => row.active);
  const analysisText = analysisTextForNode(node);
  const intents = ANALYSIS_OVERLAY_INTENTS.filter((intent) => includesAny(analysisText, intent.terms));
  if (intents.length > 0) return intents;
  if (activeRows.length > 0) {
    return [
      {
        id: "active_feature",
        label: "Active feature",
        color: 0x38bdf8,
        terms: activeRows.flatMap((row) => [row.field ?? "", row.label ?? ""]).filter(Boolean),
        categories: [],
        bandTerms: [],
      },
    ];
  }
  return [];
}

function objectMaterialName(object: THREE.Object3D): string {
  if (!(object instanceof THREE.Mesh)) return "";
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.map((material) => material?.name ?? "").join(" ");
}

function objectHaystack(object: THREE.Object3D): string {
  return [
    object.name,
    objectMaterialName(object),
    scalarRecordText(object.userData as Record<string, unknown>, [
      "asset_id",
      "assetId",
      "category",
      "assetCategory",
      "surface_role",
      "surfaceRole",
      "role",
      "kind",
      "semantic_role",
      "semanticRole",
    ]),
  ].map(normalizeText).join(" ");
}

function instanceHaystack(instanceId: string, info: unknown): string {
  const record = info && typeof info === "object" ? info as Record<string, unknown> : {};
  return [
    instanceId,
    scalarRecordText(record, [
      "asset_id",
      "assetId",
      "category",
      "assetCategory",
      "label",
      "name",
      "description",
      "surface_role",
      "surfaceRole",
      "role",
      "kind",
    ]),
  ].map(normalizeText).join(" ");
}

function matchesIntent(haystack: string, intent: AnalysisOverlayIntent): boolean {
  return includesAny(haystack, [...intent.terms, ...intent.categories, ...intent.bandTerms]);
}

function finiteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function addAnalysisObjectHighlight(
  scene: THREE.Scene,
  object: THREE.Object3D,
  intent: AnalysisOverlayIntent,
  labelText: string,
  labelState: { count: number },
): boolean {
  const bbox = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  if (size.length() < 0.01) return false;

  const helper = new THREE.BoxHelper(object, intent.color);
  helper.userData.isAnalysisOverlayHelper = true;
  helper.userData.analysisIntent = intent.id;
  scene.add(helper);

  if (labelState.count < ANALYSIS_LABEL_LIMIT) {
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const label = createTextSprite(labelText, intent.color);
    label.position.set(center.x, bbox.max.y + 0.65, center.z);
    label.userData.isAnalysisOverlayLabel = true;
    label.userData.analysisIntent = intent.id;
    scene.add(label);
    labelState.count += 1;
  }
  return true;
}

function addAnalysisBandHighlight(
  scene: THREE.Scene,
  band: Record<string, unknown>,
  overlay: Record<string, unknown>,
  manifest: ViewerManifest,
  intent: AnalysisOverlayIntent,
  labelState: { count: number },
): boolean {
  const width = finiteNumber(band.width_m, band.width, band.w);
  if (!width || width <= 0) return false;
  const summary = (manifest.summary ?? {}) as Record<string, unknown>;
  const length = finiteNumber(
    band.length_m,
    band.length,
    overlay.length_m,
    overlay.length,
    summary.length_m,
    summary.street_length_m,
    72,
  ) ?? 72;
  const x = finiteNumber(band.center_x_m, band.x_center_m, band.x_m, band.x, band.center_x, 0) ?? 0;
  const z = finiteNumber(
    band.center_z_m,
    band.z_center_m,
    band.z_m,
    band.z,
    band.center_z,
    band.center_m,
    band.offset_m,
    band.offset,
    0,
  ) ?? 0;
  const y = finiteNumber(band.y_m, band.y, 0.045) ?? 0.045;
  const height = finiteNumber(band.height_m, band.height, 0.05) ?? 0.05;

  const geometry = new THREE.BoxGeometry(length, height, width);
  const material = new THREE.MeshBasicMaterial({
    color: intent.color,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.userData.isAnalysisOverlayHelper = true;
  mesh.userData.analysisIntent = intent.id;
  scene.add(mesh);

  if (labelState.count < ANALYSIS_LABEL_LIMIT) {
    const label = createTextSprite(intent.label, intent.color);
    label.position.set(x, y + 0.6, z);
    label.userData.isAnalysisOverlayLabel = true;
    label.userData.analysisIntent = intent.id;
    scene.add(label);
    labelState.count += 1;
  }
  return true;
}

export function createAnalysisOverlayHelpers(
  scene: THREE.Scene,
  root: THREE.Object3D | null,
  manifest: ViewerManifest | null,
  branchNode: BranchRunNode | null,
): number {
  removeAnalysisOverlayHelpers(scene);
  if (!root || !manifest || !branchNode) return 0;
  const intents = intentsForBranchNode(branchNode);
  if (intents.length === 0) return 0;

  let highlightCount = 0;
  const seenObjectUuids = new Set<string>();
  const labelState = { count: 0 };
  const instances = manifest.instances ?? {};
  const instanceTargets = new Map<string, THREE.Object3D>();

  root.traverse((child) => {
    if (!child.name) return;
    const instanceId = resolveInstanceIdFromName(child.name);
    if (instanceId && !instanceTargets.has(instanceId)) {
      instanceTargets.set(instanceId, child);
    }
  });

  for (const [instanceId, info] of Object.entries(instances)) {
    const haystack = instanceHaystack(instanceId, info);
    const intent = intents.find((candidate) => matchesIntent(haystack, candidate));
    if (!intent) continue;
    const target = instanceTargets.get(instanceId);
    if (!target || seenObjectUuids.has(target.uuid)) continue;
    if (addAnalysisObjectHighlight(scene, target, intent, intent.label, labelState)) {
      seenObjectUuids.add(target.uuid);
      highlightCount += 1;
    }
  }

  root.traverse((child) => {
    if (child === root || !(child instanceof THREE.Mesh) || seenObjectUuids.has(child.uuid)) return;
    const haystack = objectHaystack(child);
    const intent = intents.find((candidate) => matchesIntent(haystack, candidate));
    if (!intent) return;
    if (addAnalysisObjectHighlight(scene, child, intent, intent.label, labelState)) {
      seenObjectUuids.add(child.uuid);
      highlightCount += 1;
    }
  });

  const overlay = (manifest.layout_overlay ?? {}) as Record<string, unknown>;
  const bands = Array.isArray(overlay.bands) ? overlay.bands : [];
  for (const rawBand of bands) {
    if (!rawBand || typeof rawBand !== "object") continue;
    const band = rawBand as Record<string, unknown>;
    const bandText = normalizeText([
      band.id,
      band.name,
      band.kind,
      band.role,
      band.surface_role,
      band.surfaceRole,
      band.category,
      band.label,
    ].join(" "));
    const intent = intents.find((candidate) => includesAny(bandText, candidate.bandTerms));
    if (!intent) continue;
    if (addAnalysisBandHighlight(scene, band, overlay, manifest, intent, labelState)) {
      highlightCount += 1;
    }
  }

  return highlightCount;
}

export function createFrameHelpers(scene: THREE.Scene, root: THREE.Object3D | null): void {
  if (!root) return;
  root.children.forEach((child) => {
    const bbox = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    if (size.length() > 0.1) {
      const helper = new THREE.BoxHelper(child, 0x00ff00);
      helper.userData.isFrameHelper = true;
      helper.visible = true;
      scene.add(helper);
    }
  });
}

export function removeAssetBboxHelpers(scene: THREE.Scene): void {
  const helpers: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (child.userData.isAssetBboxHelper || child.userData.isAssetLabel) {
      helpers.push(child);
    }
  });
  helpers.forEach((helper) => disposeObject(helper));
}

export function createAssetBboxHelpers(
  scene: THREE.Scene,
  root: THREE.Object3D | null,
  manifest: ViewerManifest | null,
): void {
  if (!root || !manifest) return;

  removeAssetBboxHelpers(scene);
  const instances = manifest.instances;
  root.traverse((child) => {
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

      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const label = createTextSprite(assetId, color);
      label.position.set(center.x, bbox.max.y + 0.5, center.z);
      label.userData.isAssetLabel = true;
      scene.add(label);
    }
  });
}

export function updateAssetBboxHelpers(scene: THREE.Scene): void {
  scene.traverse((child) => {
    if (child.userData.isAssetBboxHelper && child instanceof THREE.BoxHelper) {
      child.update();
    }
  });
}
