/**
 * Expanded Scene Map modal for the RoadGen3D Viewer.
 *
 * The lower-right Scene Map launcher opens this controller directly, making
 * this the single canonical renderer for presentation-scale plan reading.
 */
import * as THREE from "three";
import type { RecentLayout, ViewerManifest } from "./viewer-types";
import { metadataFromManifest, formatMetadataValue } from "./viewer-comparison-metadata";
import {
  worldToMinimap,
  type SceneBounds,
} from "./viewer-minimap";

export type ExpandedMapMode = "plan" | "presentation";
export type ExpandedMapLayerKey = "roads" | "surfaces" | "buildings" | "furniture" | "viewpoint";
export type ExpandedMapMetricKey =
  | "none"
  | "bbox"
  | "feasibility"
  | "constraint_penalty"
  | "road_edge_distance"
  | "junction_distance"
  | "entrance_distance"
  | "poi_anchors"
  | "clear_path_conflict"
  | "tree_shade"
  | "lighting"
  | "amenity_coverage"
  | "curb_ramps";
type JsonRecord = Record<string, unknown>;
type WorldPoint = { x: number; z: number };
type WorldSegment = { a: WorldPoint; b: WorldPoint };
type CanvasPoint = { x: number; y: number };
type BBoxXz = { minX: number; maxX: number; minZ: number; maxZ: number };
export type PlanViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: SceneBounds;
  manifest: ViewerManifest;
  label: string;
};
type MetricLegend = {
  title: string;
  subtitle?: string;
  rows?: Array<{ label: string; color: string }>;
  status?: string;
  gradient?: { from: string; mid?: string; to: string; min: string; max: string };
};

export type ExpandedMapController = {
  open: () => void;
  close: () => void;
  render: () => void;
  resize: () => void;
  dispose: () => void;
  isOpen: () => boolean;
};

export type ExpandedMapDeps = {
  scene: THREE.Scene;
  getRoot: () => THREE.Object3D | null;
  getBounds: () => SceneBounds | null;
  getManifest: () => ViewerManifest | null;
  getLayoutPath: () => string;
  loadRecentLayouts: (limit: number, useCache?: boolean) => Promise<RecentLayout[]>;
  loadManifest: (layoutPath: string) => Promise<ViewerManifest>;
  getAvatarPosition: () => THREE.Vector3;
  cameraForwardHorizontal: () => THREE.Vector3;
  flyCameraTo: (x: number, y: number, z: number) => void;
  text: (en: string, zh: string) => string;
};

export const LAYERS: Array<{ key: ExpandedMapLayerKey; en: string; zh: string }> = [
  { key: "roads", en: "Road", zh: "道路" },
  { key: "surfaces", en: "Surface", zh: "设计面" },
  { key: "buildings", en: "Building", zh: "建筑" },
  { key: "furniture", en: "Furniture", zh: "家具" },
  { key: "viewpoint", en: "View", zh: "视角" },
];

export const METRIC_OVERLAYS: Array<{ key: ExpandedMapMetricKey; en: string; zh: string }> = [
  { key: "none", en: "None", zh: "无" },
  { key: "bbox", en: "BBox", zh: "边界框" },
  { key: "curb_ramps", en: "Curb Ramps", zh: "街角坡道" },
  { key: "feasibility", en: "Feasibility", zh: "可行性" },
  { key: "constraint_penalty", en: "Constraint Penalty", zh: "约束惩罚" },
  { key: "road_edge_distance", en: "Road Edge Distance", zh: "距路缘" },
  { key: "junction_distance", en: "Junction Distance", zh: "距路口" },
  { key: "entrance_distance", en: "Entrance Distance", zh: "距出入口" },
  { key: "poi_anchors", en: "POI Anchors", zh: "POI 锚点" },
  { key: "clear_path_conflict", en: "Clear Path Conflict", zh: "净空冲突" },
  { key: "tree_shade", en: "Tree Shade", zh: "树荫" },
  { key: "lighting", en: "Lighting", zh: "照明" },
  { key: "amenity_coverage", en: "Amenity Coverage", zh: "服务覆盖" },
];

const COVERAGE_RADII_M: Record<string, number> = {
  tree: 1.8,
  lamp: 10,
  // Amenity coverage is a pedestrian-service catchment, not the physical
  // footprint of the asset. Seats serve a nearby 100 m walk, while transit
  // stops serve the broader 500 m access catchment.
  bench: 100,
  bus_stop: 500,
  trash: 25,
  mailbox: 30,
  hydrant: 30,
};

const POI_COLORS: Record<string, string> = {
  entrance: "#00539f",
  crossing: "#0f766e",
  bus_stop: "#d56b2d",
  fire_hydrant: "#d43f3a",
  hydrant: "#d43f3a",
  restaurant: "#9333ea",
  cafe: "#a16207",
  park: "#15803d",
  default: "#334155",
};

const SURFACE_COLORS: Record<string, { fill: string; stroke: string }> = {
  carriageway: { fill: "rgba(48, 56, 68, 0.62)", stroke: "rgba(24, 31, 42, 0.74)" },
  drive_lane: { fill: "rgba(48, 56, 68, 0.54)", stroke: "rgba(24, 31, 42, 0.62)" },
  bus_lane: { fill: "rgba(191, 75, 55, 0.42)", stroke: "rgba(153, 45, 36, 0.72)" },
  bike_lane: { fill: "rgba(54, 132, 91, 0.38)", stroke: "rgba(31, 103, 68, 0.72)" },
  parking_lane: { fill: "rgba(165, 128, 75, 0.34)", stroke: "rgba(128, 91, 45, 0.64)" },
  sidewalk: { fill: "rgba(214, 210, 201, 0.52)", stroke: "rgba(142, 132, 119, 0.55)" },
  clear_path: { fill: "rgba(219, 216, 207, 0.48)", stroke: "rgba(142, 132, 119, 0.5)" },
  frontage_reserve: { fill: "rgba(162, 196, 216, 0.36)", stroke: "rgba(86, 132, 164, 0.58)" },
  furnishing: { fill: "rgba(178, 159, 130, 0.34)", stroke: "rgba(129, 105, 75, 0.58)" },
  nearroad_furnishing: { fill: "rgba(178, 159, 130, 0.34)", stroke: "rgba(129, 105, 75, 0.58)" },
  grass_belt: { fill: "rgba(119, 168, 92, 0.38)", stroke: "rgba(71, 124, 55, 0.62)" },
  grass: { fill: "rgba(119, 168, 92, 0.34)", stroke: "rgba(71, 124, 55, 0.58)" },
  transit_pad: { fill: "rgba(234, 167, 72, 0.38)", stroke: "rgba(185, 112, 39, 0.7)" },
  colored_pavement: { fill: "rgba(235, 126, 68, 0.34)", stroke: "rgba(188, 82, 38, 0.66)" },
  building_region: { fill: "rgba(99, 102, 116, 0.24)", stroke: "rgba(71, 75, 88, 0.55)" },
  functional_zone: { fill: "rgba(14, 165, 233, 0.18)", stroke: "rgba(2, 132, 199, 0.55)" },
  default: { fill: "rgba(37, 99, 235, 0.24)", stroke: "rgba(29, 78, 216, 0.58)" },
};

const FEATURE_COLORS: Record<string, string> = {
  tree: "#2f8f52",
  lamp: "#d7a514",
  bench: "#6a8f48",
  trash: "#c55d54",
  bollard: "#7367b8",
  bus_stop: "#d56b2d",
  hydrant: "#d43f3a",
  mailbox: "#3267b1",
  sign: "#4b76a8",
  default: "#2563eb",
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function recordText(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeKind(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_") || "default";
}

function readPoint(value: unknown): WorldPoint | null {
  if (Array.isArray(value)) {
    const x = finiteNumber(value[0]);
    const z = finiteNumber(value.length >= 3 ? value[2] : value[1]);
    return x === null || z === null ? null : { x, z };
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const x = finiteNumber(record.x ?? record.lon ?? record.lng ?? record.east);
  const z = finiteNumber(record.z ?? record.y ?? record.lat ?? record.north);
  return x === null || z === null ? null : { x, z };
}

function readPointList(value: unknown): WorldPoint[] {
  return asArray(value)
    .map((entry) => readPoint(entry))
    .filter((entry): entry is WorldPoint => entry !== null);
}

function readPolygon(record: JsonRecord): WorldPoint[] {
  const candidates = [
    record.polygon_xz,
    record.points_xz,
    record.world_points,
    record.footprint_xz,
    record.boundary_xz,
    record.polygon,
    record.points,
    record.ring,
    record.outer,
    record.vertices,
  ];
  for (const candidate of candidates) {
    const points = readPointList(candidate);
    if (points.length >= 3) {
      return points;
    }
  }
  for (const ring of readRings(record.rings)) {
    if (ring.length >= 3) {
      return ring;
    }
  }
  const bbox = readBboxXz(record.bbox_xz);
  if (bbox) {
    return [
      { x: bbox.minX, z: bbox.minZ },
      { x: bbox.maxX, z: bbox.minZ },
      { x: bbox.maxX, z: bbox.maxZ },
      { x: bbox.minX, z: bbox.maxZ },
    ];
  }
  return [];
}

function readBboxXz(value: unknown, position?: WorldPoint | null): BBoxXz | null {
  const values = asArray(value).map((entry) => finiteNumber(entry));
  if (values.length < 4 || values.slice(0, 4).some((entry) => entry === null)) {
    return null;
  }
  const [a, b, c, d] = values.slice(0, 4) as number[];
  const typedOrder = {
    minX: Math.min(a, b),
    maxX: Math.max(a, b),
    minZ: Math.min(c, d),
    maxZ: Math.max(c, d),
  };
  const legacyOrder = {
    minX: Math.min(a, c),
    maxX: Math.max(a, c),
    minZ: Math.min(b, d),
    maxZ: Math.max(b, d),
  };
  if (!position) {
    return typedOrder;
  }
  const typedDistance = Math.abs((typedOrder.minX + typedOrder.maxX) / 2 - position.x)
    + Math.abs((typedOrder.minZ + typedOrder.maxZ) / 2 - position.z);
  const legacyDistance = Math.abs((legacyOrder.minX + legacyOrder.maxX) / 2 - position.x)
    + Math.abs((legacyOrder.minZ + legacyOrder.maxZ) / 2 - position.z);
  return legacyDistance + 0.01 < typedDistance ? legacyOrder : typedOrder;
}

function bboxToPoints(bbox: BBoxXz): WorldPoint[] {
  return [
    { x: bbox.minX, z: bbox.minZ },
    { x: bbox.maxX, z: bbox.minZ },
    { x: bbox.maxX, z: bbox.maxZ },
    { x: bbox.minX, z: bbox.maxZ },
  ];
}

function bboxArea(bbox: BBoxXz): number {
  return Math.max(0, bbox.maxX - bbox.minX) * Math.max(0, bbox.maxZ - bbox.minZ);
}

function intersectBbox(a: BBoxXz, b: BBoxXz): BBoxXz | null {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  const minZ = Math.max(a.minZ, b.minZ);
  const maxZ = Math.min(a.maxZ, b.maxZ);
  return minX < maxX && minZ < maxZ ? { minX, maxX, minZ, maxZ } : null;
}

function readRings(value: unknown): WorldPoint[][] {
  return asArray(value)
    .map((entry) => readPointList(entry))
    .filter((ring) => ring.length >= 3);
}

function segmentsFromRing(ring: WorldPoint[]): WorldSegment[] {
  if (ring.length < 2) {
    return [];
  }
  const result: WorldSegment[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (worldDistance(current, next) > 1e-6) {
      result.push({ a: current, b: next });
    }
  }
  return result;
}

function roadEdgeSegments(manifest: ViewerManifest): WorldSegment[] {
  const summary = asRecord(manifest.summary) ?? {};
  const osm = asRecord(summary.osm_geometry) ?? {};
  return readRings(osm.carriageway_rings).flatMap((ring) => segmentsFromRing(ring));
}

function distanceToSegment(point: WorldPoint, segment: WorldSegment): number {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 1e-9) {
    return worldDistance(point, segment.a);
  }
  const t = Math.max(0, Math.min(1, ((point.x - segment.a.x) * dx + (point.z - segment.a.z) * dz) / lengthSq));
  return Math.hypot(point.x - (segment.a.x + t * dx), point.z - (segment.a.z + t * dz));
}

function distanceToNearestSegment(point: WorldPoint, segments: WorldSegment[]): number {
  if (!segments.length) {
    return Number.POSITIVE_INFINITY;
  }
  return segments.reduce((best, segment) => Math.min(best, distanceToSegment(point, segment)), Number.POSITIVE_INFINITY);
}

function colorForKind(kind: string): { fill: string; stroke: string } {
  return SURFACE_COLORS[kind] ?? SURFACE_COLORS.default;
}

function fitBoundsToAspect(bounds: SceneBounds, aspect: number): SceneBounds {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
  const sourceHeight = Math.max(1, bounds.maxZ - bounds.minZ);
  let targetWidth = sourceWidth;
  let targetHeight = sourceHeight;
  if (sourceWidth / sourceHeight > safeAspect) {
    targetHeight = sourceWidth / safeAspect;
  } else {
    targetWidth = sourceHeight * safeAspect;
  }
  const halfX = targetWidth / 2;
  const halfZ = targetHeight / 2;
  return {
    minX: bounds.center.x - halfX,
    maxX: bounds.center.x + halfX,
    minZ: bounds.center.z - halfZ,
    maxZ: bounds.center.z + halfZ,
    center: bounds.center,
    extent: Math.max(halfX, halfZ),
  };
}

function manifestMapBounds(manifest: ViewerManifest, fallback: SceneBounds): SceneBounds {
  const accumulator = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
  const includePoint = (point: WorldPoint, padding = 0): void => {
    accumulator.minX = Math.min(accumulator.minX, point.x - padding);
    accumulator.maxX = Math.max(accumulator.maxX, point.x + padding);
    accumulator.minZ = Math.min(accumulator.minZ, point.z - padding);
    accumulator.maxZ = Math.max(accumulator.maxZ, point.z + padding);
  };
  const includePolygon = (points: WorldPoint[]): void => {
    for (const point of points) {
      includePoint(point);
    }
  };
  const includeCollection = (items: unknown): void => {
    for (const item of asArray(items)) {
      const record = asRecord(item);
      if (!record) {
        continue;
      }
      includePolygon(readPolygon(record));
    }
  };

  const summary = asRecord(manifest.summary) ?? {};
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  const osm = asRecord(summary.osm_geometry) ?? {};
  for (const key of ["sidewalk_rings", "carriageway_rings", "left_sidewalk_rings", "right_sidewalk_rings"]) {
    for (const ring of readRings(osm[key])) {
      includePolygon(ring);
    }
  }
  for (const junction of asArray(osm.junction_geometries)) {
    const record = asRecord(junction);
    if (!record) {
      continue;
    }
    for (const ring of readRings(record.carriageway_core_rings)) {
      includePolygon(ring);
    }
    for (const patch of asArray(record.normalized_surface_patches)) {
      const patchRecord = asRecord(patch);
      if (patchRecord) {
        for (const ring of readRings(patchRecord.rings)) {
          includePolygon(ring);
        }
      }
    }
  }

  includeCollection(overlay.building_footprints);
  includeCollection(overlay.generated_lots);
  includeCollection(overlay.building_regions);
  includeCollection(overlay.derived_regions);
  includeCollection(overlay.functional_zones);
  includeCollection(overlay.surface_annotations);
  for (const entry of getInstanceEntries(manifest)) {
    if (entry.bbox) {
      includePolygon(bboxToPoints(entry.bbox));
    } else if (entry.position) {
      includePoint(entry.position, 1.5);
    }
  }

  if (!Number.isFinite(accumulator.minX) || !Number.isFinite(accumulator.maxX)
    || !Number.isFinite(accumulator.minZ) || !Number.isFinite(accumulator.maxZ)
    || accumulator.maxX <= accumulator.minX || accumulator.maxZ <= accumulator.minZ) {
    return fallback;
  }
  const width = accumulator.maxX - accumulator.minX;
  const height = accumulator.maxZ - accumulator.minZ;
  const padding = Math.max(4, Math.min(18, Math.max(width, height) * 0.035));
  const minX = accumulator.minX - padding;
  const maxX = accumulator.maxX + padding;
  const minZ = accumulator.minZ - padding;
  const maxZ = accumulator.maxZ + padding;
  const center = new THREE.Vector3((minX + maxX) / 2, fallback.center.y, (minZ + maxZ) / 2);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    center,
    extent: Math.max(maxX - minX, maxZ - minZ) / 2,
  };
}

function unionSceneBounds(boundsList: SceneBounds[]): SceneBounds {
  const first = boundsList[0];
  if (!first) {
    return {
      minX: -1,
      maxX: 1,
      minZ: -1,
      maxZ: 1,
      center: new THREE.Vector3(0, 0, 0),
      extent: 1,
    };
  }
  const minX = Math.min(...boundsList.map((bounds) => bounds.minX));
  const maxX = Math.max(...boundsList.map((bounds) => bounds.maxX));
  const minZ = Math.min(...boundsList.map((bounds) => bounds.minZ));
  const maxZ = Math.max(...boundsList.map((bounds) => bounds.maxZ));
  const center = new THREE.Vector3((minX + maxX) / 2, first.center.y, (minZ + maxZ) / 2);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    center,
    extent: Math.max(maxX - minX, maxZ - minZ) / 2,
  };
}

export function buildPlanViewports(
  currentManifest: ViewerManifest,
  comparisonManifest: ViewerManifest | null,
  fallbackBounds: SceneBounds,
  width: number,
  height: number,
  text: (en: string, zh: string) => string,
): PlanViewport[] {
  const currentBounds = manifestMapBounds(currentManifest, fallbackBounds);
  if (!comparisonManifest) {
    const fitted = fitBoundsToAspect(currentBounds, width / Math.max(height, 1));
    return [{
      x: 0,
      y: 0,
      width,
      height,
      bounds: fitted,
      manifest: currentManifest,
      label: text("Current", "当前"),
    }];
  }

  const margin = 12;
  const gap = 12;
  const viewportWidth = Math.max(1, width - margin * 2);
  const viewportHeight = Math.max(1, (height - margin * 2 - gap) / 2);
  const comparisonBounds = manifestMapBounds(comparisonManifest, fallbackBounds);
  const sharedBounds = unionSceneBounds([currentBounds, comparisonBounds]);
  const fitted = fitBoundsToAspect(sharedBounds, viewportWidth / Math.max(viewportHeight, 1));
  return [
    {
      x: margin,
      y: margin,
      width: viewportWidth,
      height: viewportHeight,
      bounds: fitted,
      manifest: currentManifest,
      label: text("Current", "当前"),
    },
    {
      x: margin,
      y: margin + viewportHeight + gap,
      width: viewportWidth,
      height: viewportHeight,
      bounds: fitted,
      manifest: comparisonManifest,
      label: text("Compare", "对比"),
    },
  ];
}

export function setTopDownCamera(camera: THREE.OrthographicCamera, bounds: SceneBounds, width: number, height: number): SceneBounds {
  const viewBounds = fitBoundsToAspect(bounds, width / Math.max(height, 1));
  camera.left = viewBounds.minX - bounds.center.x;
  camera.right = viewBounds.maxX - bounds.center.x;
  camera.top = viewBounds.maxZ - bounds.center.z;
  camera.bottom = viewBounds.minZ - bounds.center.z;
  camera.near = 0.1;
  camera.far = Math.max(1000, bounds.extent * 8 + 100);
  camera.position.set(bounds.center.x, bounds.center.y + bounds.extent * 2.4 + 18, bounds.center.z);
  camera.lookAt(bounds.center.x, 0, bounds.center.z);
  camera.updateProjectionMatrix();
  return viewBounds;
}

function project(point: WorldPoint, bounds: SceneBounds, width: number, height: number): CanvasPoint {
  return worldToMinimap(point.x, point.z, bounds, width, height);
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: WorldPoint[],
  bounds: SceneBounds,
  width: number,
  height: number,
  fillStyle: string,
  strokeStyle: string,
  lineWidth = 1,
): void {
  if (points.length < 3) {
    return;
  }
  ctx.beginPath();
  points.forEach((point, index) => {
    const mapped = project(point, bounds, width, height);
    if (index === 0) {
      ctx.moveTo(mapped.x, mapped.y);
    } else {
      ctx.lineTo(mapped.x, mapped.y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  points: WorldPoint[],
  bounds: SceneBounds,
  width: number,
  height: number,
  strokeStyle: string,
  lineWidth = 1,
): void {
  if (points.length < 2) {
    return;
  }
  ctx.beginPath();
  points.forEach((point, index) => {
    const mapped = project(point, bounds, width, height);
    if (index === 0) {
      ctx.moveTo(mapped.x, mapped.y);
    } else {
      ctx.lineTo(mapped.x, mapped.y);
    }
  });
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function worldSizeToPixels(sizeM: number, bounds: SceneBounds, width: number): number {
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  return Math.abs(sizeM) / worldWidth * width;
}

export function canvasToWorldPoint(
  x: number,
  y: number,
  bounds: SceneBounds,
  width: number,
  height: number,
): WorldPoint {
  return {
    x: bounds.minX + (x / Math.max(width, 1)) * (bounds.maxX - bounds.minX),
    z: bounds.minZ + (y / Math.max(height, 1)) * (bounds.maxZ - bounds.minZ),
  };
}

function worldDistance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function drawWorldCircle(
  ctx: CanvasRenderingContext2D,
  center: WorldPoint,
  radiusM: number,
  bounds: SceneBounds,
  width: number,
  height: number,
  fillStyle: string,
  strokeStyle: string,
  lineWidth = 1,
): void {
  const mapped = project(center, bounds, width, height);
  const radius = Math.max(1, worldSizeToPixels(radiusM, bounds, width));
  ctx.beginPath();
  ctx.arc(mapped.x, mapped.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawCrossMarker(
  ctx: CanvasRenderingContext2D,
  point: CanvasPoint,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(point.x - size, point.y - size);
  ctx.lineTo(point.x + size, point.y + size);
  ctx.moveTo(point.x + size, point.y - size);
  ctx.lineTo(point.x - size, point.y + size);
  ctx.stroke();
  ctx.restore();
}

function interpolateColor(from: [number, number, number], to: [number, number, number], t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(from[0] + (to[0] - from[0]) * clamped),
    Math.round(from[1] + (to[1] - from[1]) * clamped),
    Math.round(from[2] + (to[2] - from[2]) * clamped),
  ];
}

function rgba(parts: [number, number, number], alpha: number): string {
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function scoreColor(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped < 0.5) {
    return rgba(interpolateColor([220, 38, 38], [234, 179, 8], clamped / 0.5), 0.92);
  }
  return rgba(interpolateColor([234, 179, 8], [22, 163, 74], (clamped - 0.5) / 0.5), 0.92);
}

function distanceColor(value: number, cap: number, alpha = 0.42): string {
  const ratio = Math.max(0, Math.min(1, value / Math.max(cap, 1e-6)));
  if (ratio < 0.5) {
    return rgba(interpolateColor([37, 99, 235], [34, 197, 94], ratio / 0.5), alpha);
  }
  return rgba(interpolateColor([34, 197, 94], [234, 88, 12], (ratio - 0.5) / 0.5), alpha);
}

function getInstanceEntries(manifest: ViewerManifest): Array<{
  id: string;
  info: JsonRecord;
  category: string;
  position: WorldPoint | null;
  bbox: BBoxXz | null;
}> {
  const instances = asRecord(manifest.instances) ?? {};
  return Object.entries(instances)
    .map(([id, rawInfo]) => {
      const info = asRecord(rawInfo) ?? {};
      const position = readPoint(info.position_xyz);
      return {
        id,
        info,
        category: normalizeKind(info.category ?? info.asset_id ?? id),
        position,
        bbox: readBboxXz(info.bbox_xz, position),
      };
    })
    .filter((entry) => entry.position !== null || entry.bbox !== null);
}

function readPointMap(value: unknown): Record<string, WorldPoint[]> {
  const record = asRecord(value) ?? {};
  const result: Record<string, WorldPoint[]> = {};
  for (const [key, rawPoints] of Object.entries(record)) {
    const points = readPointList(rawPoints);
    if (points.length) {
      result[normalizeKind(key)] = points;
    }
  }
  return result;
}

function addPointList(target: Record<string, WorldPoint[]>, key: string, points: WorldPoint[]): void {
  if (!points.length) {
    return;
  }
  const normalized = normalizeKind(key);
  target[normalized] = [...(target[normalized] ?? []), ...points];
}

function spatialContext(manifest: ViewerManifest): JsonRecord {
  const summary = asRecord(manifest.summary) ?? {};
  return asRecord(summary.spatial_context) ?? {};
}

function poiPointsByType(manifest: ViewerManifest): Record<string, WorldPoint[]> {
  const ctx = spatialContext(manifest);
  const result = readPointMap(ctx.poi_points_by_type_xz);
  addPointList(result, "junction", readPointList(ctx.junction_points_xz));
  addPointList(result, "entrance", readPointList(ctx.entrance_points_xz));
  addPointList(result, "bus_stop", readPointList(ctx.bus_stop_points_xz));
  addPointList(result, "fire_hydrant", readPointList(ctx.fire_points_xz));
  return result;
}

function roadHalfWidth(manifest: ViewerManifest): number | null {
  const ctx = spatialContext(manifest);
  const summary = asRecord(manifest.summary) ?? {};
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  const explicit = finiteNumber(ctx.road_half_width_m);
  if (explicit !== null && explicit > 0) {
    return explicit;
  }
  const width = finiteNumber(summary.road_width_m) ?? finiteNumber(overlay.road_width_m);
  return width !== null && width > 0 ? width / 2 : null;
}

function sceneLength(manifest: ViewerManifest, bounds: SceneBounds): number {
  const ctx = spatialContext(manifest);
  const summary = asRecord(manifest.summary) ?? {};
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  return finiteNumber(ctx.length_m)
    ?? finiteNumber(summary.length_m)
    ?? finiteNumber(overlay.length_m)
    ?? Math.max(24, (bounds.maxX - bounds.minX) * 0.72);
}

function nearestPoiPoint(pointsByType: Record<string, WorldPoint[]>, poiType: string, position: WorldPoint): WorldPoint | null {
  const normalized = normalizeKind(poiType);
  const candidates = pointsByType[normalized] ?? [];
  if (!candidates.length) {
    return null;
  }
  return candidates.reduce((best, point) => (
    worldDistance(point, position) < worldDistance(best, position) ? point : best
  ), candidates[0]);
}

function drawRoadGeometry(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
): boolean {
  const summary = asRecord(manifest.summary) ?? {};
  const osm = asRecord(summary.osm_geometry) ?? {};
  let drew = false;

  for (const ring of readRings(osm.sidewalk_rings)) {
    drawPolygon(ctx, ring, bounds, width, height, "rgba(232, 228, 219, 0.58)", "rgba(151, 139, 124, 0.55)", 1);
    drew = true;
  }
  for (const ring of readRings(osm.carriageway_rings)) {
    drawPolygon(ctx, ring, bounds, width, height, "rgba(46, 53, 64, 0.64)", "rgba(19, 28, 40, 0.8)", 1.2);
    drew = true;
  }

  for (const junction of asArray(osm.junction_geometries)) {
    const record = asRecord(junction);
    if (!record) {
      continue;
    }
    for (const ring of readRings(record.carriageway_core_rings)) {
      drawPolygon(ctx, ring, bounds, width, height, "rgba(46, 53, 64, 0.58)", "rgba(19, 28, 40, 0.72)", 1);
      drew = true;
    }
    for (const patch of asArray(record.normalized_surface_patches)) {
      const patchRecord = asRecord(patch);
      if (!patchRecord) {
        continue;
      }
      const kind = normalizeKind(patchRecord.surface_role ?? patchRecord.kind ?? patchRecord.surface_kind);
      const color = colorForKind(kind);
      for (const ring of readRings(patchRecord.rings)) {
        drawPolygon(ctx, ring, bounds, width, height, color.fill, color.stroke, 0.8);
        drew = true;
      }
    }
  }
  return drew;
}

function normalizedBands(manifest: ViewerManifest): JsonRecord[] {
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  const rawBands = asArray(overlay.bands)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null && finiteNumber(entry.width_m) !== null);
  const dedupedBands: JsonRecord[] = [];
  const seenBands = new Set<string>();
  for (const band of rawBands) {
    const key = [
      normalizeKind(band.kind ?? band.role ?? band.surface_role),
      String(band.side ?? ""),
      String(band.name ?? ""),
      String(finiteNumber(band.width_m) ?? ""),
      String(finiteNumber(band.z_center_m) ?? ""),
      String(finiteNumber(band.station_start_m) ?? ""),
      String(finiteNumber(band.station_end_m) ?? ""),
    ].join("|");
    if (seenBands.has(key)) {
      continue;
    }
    seenBands.add(key);
    dedupedBands.push(band);
  }
  const hasExplicitCenters = dedupedBands.some((band) => finiteNumber(band.z_center_m) !== null);
  if (hasExplicitCenters || dedupedBands.length <= 12) {
    return dedupedBands;
  }

  const laneCount = Math.max(1, Math.round(finiteNumber(overlay.lane_count) ?? 1));
  const roadWidth = finiteNumber(overlay.road_width_m);
  const result: JsonRecord[] = [];
  const seen = new Set<string>();
  let expandedDriveLanes = false;
  for (const band of dedupedBands) {
    const kind = normalizeKind(band.kind ?? band.role ?? band.surface_role);
    if ((kind === "drive_lane" || kind === "carriageway") && !expandedDriveLanes) {
      const laneWidth = roadWidth && laneCount > 0 ? roadWidth / laneCount : finiteNumber(band.width_m) ?? 3.2;
      for (let index = 0; index < laneCount; index += 1) {
        result.push({ ...band, kind: "drive_lane", name: `drive_lane_${index + 1}`, width_m: laneWidth });
      }
      expandedDriveLanes = true;
      continue;
    }
    if (kind === "drive_lane" || kind === "carriageway") {
      continue;
    }
    const key = `${kind}|${String(band.side ?? "")}|${String(band.name ?? "")}|${String(band.width_m ?? "")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(band);
  }
  return result;
}

function drawBandFallback(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
): boolean {
  const bands = normalizedBands(manifest);
  if (!bands.length) {
    return false;
  }
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  const length = finiteNumber(overlay.length_m) ?? Math.max(24, (bounds.maxX - bounds.minX) * 0.72);
  const minX = bounds.center.x - length / 2;
  const maxX = bounds.center.x + length / 2;
  const explicitCenters = bands.some((band) => finiteNumber(band.z_center_m) !== null);

  let cursor = -bands.reduce((sum, band) => sum + (finiteNumber(band.width_m) ?? 0), 0) / 2;
  let drew = false;
  for (const band of bands) {
    const bandWidth = finiteNumber(band.width_m) ?? 0;
    if (!(bandWidth > 0)) {
      continue;
    }
    const relativeCenter = explicitCenters
      ? (finiteNumber(band.z_center_m) ?? 0)
      : cursor + bandWidth / 2;
    cursor += explicitCenters ? 0 : bandWidth;
    const minZ = bounds.center.z + relativeCenter - bandWidth / 2;
    const maxZ = bounds.center.z + relativeCenter + bandWidth / 2;
    const kind = normalizeKind(band.kind ?? band.role ?? band.surface_role ?? band.name);
    const color = colorForKind(kind);
    const points = [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ },
    ];
    drawPolygon(ctx, points, bounds, width, height, color.fill, color.stroke, 0.8);
    drew = true;

    const start = project(points[0], bounds, width, height);
    const end = project(points[2], bounds, width, height);
    const labelWidth = Math.abs(end.x - start.x);
    const labelHeight = Math.abs(end.y - start.y);
    if (labelWidth > 90 && labelHeight > 16) {
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
      ctx.font = "600 11px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const center = project({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, bounds, width, height);
      ctx.fillText(kind.replace(/_/g, " "), center.x, center.y);
      ctx.restore();
    }
  }
  return drew;
}

function drawOverlayCollection(
  ctx: CanvasRenderingContext2D,
  items: unknown,
  bounds: SceneBounds,
  width: number,
  height: number,
  fallbackKind: string,
  predicate?: (record: JsonRecord) => boolean,
): number {
  let count = 0;
  for (const item of asArray(items)) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    if (predicate && !predicate(record)) {
      continue;
    }
    const points = readPolygon(record);
    if (points.length < 3) {
      continue;
    }
    const kind = normalizeKind(
      record.surface_role
        ?? record.region_role
        ?? record.zone_type
        ?? record.kind
        ?? record.land_use_type
        ?? fallbackKind,
    );
    const color = colorForKind(kind);
    drawPolygon(ctx, points, bounds, width, height, color.fill, color.stroke, 1);
    count += 1;
  }
  return count;
}

function drawBuildings(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
): void {
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  drawOverlayCollection(ctx, overlay.building_regions, bounds, width, height, "building_region");
  drawOverlayCollection(ctx, overlay.derived_regions, bounds, width, height, "building_region");
  drawOverlayCollection(ctx, overlay.generated_lots, bounds, width, height, "building_region");
  drawOverlayCollection(
    ctx,
    overlay.regions,
    bounds,
    width,
    height,
    "building_region",
    (record) => Boolean(record.polygon_xz || record.points_xz || record.world_points)
      && normalizeKind(record.region_role ?? record.kind ?? record.zone_type) === "building_region",
  );
  for (const item of asArray(overlay.building_footprints)) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const points = readPolygon(record);
    if (points.length >= 3) {
      drawPolygon(ctx, points, bounds, width, height, "rgba(86, 92, 108, 0.34)", "rgba(58, 64, 77, 0.68)", 1.1);
    }
  }
}

function drawDesignSurfaces(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
): void {
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  drawOverlayCollection(ctx, overlay.surface_annotations, bounds, width, height, "colored_pavement");
  drawOverlayCollection(ctx, overlay.functional_zones, bounds, width, height, "functional_zone");
}

function drawFeatureSymbol(
  ctx: CanvasRenderingContext2D,
  category: string,
  point: CanvasPoint,
  radius: number,
): void {
  const color = FEATURE_COLORS[category] ?? FEATURE_COLORS.default;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
  ctx.lineWidth = 1.5;
  if (category === "tree") {
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(4, radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(radius * 0.3, -radius * 0.25, Math.max(2, radius * 0.36), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    ctx.fill();
  } else if (category === "bench" || category === "bus_stop") {
    ctx.rotate(category === "bus_stop" ? 0 : -0.18);
    ctx.fillRect(-radius * 1.4, -radius * 0.55, radius * 2.8, radius * 1.1);
    ctx.strokeRect(-radius * 1.4, -radius * 0.55, radius * 2.8, radius * 1.1);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2.8, radius * 0.75), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawFurniture(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
): void {
  const instances = asRecord(manifest.instances) ?? {};
  for (const [instanceId, rawInfo] of Object.entries(instances)) {
    const info = asRecord(rawInfo);
    if (!info) {
      continue;
    }
    const position = readPoint(info.position_xyz);
    if (!position) {
      continue;
    }
    const category = normalizeKind(info.category ?? info.asset_id ?? instanceId);
    const mapped = project(position, bounds, width, height);
    const radiusM = category === "tree" ? 1.35 : category === "bus_stop" ? 1.0 : 0.55;
    const radius = Math.max(2.8, Math.min(12, worldSizeToPixels(radiusM, bounds, width)));
    drawFeatureSymbol(ctx, category, mapped, radius);
  }
}

function drawMetricPoint(
  ctx: CanvasRenderingContext2D,
  point: WorldPoint,
  bounds: SceneBounds,
  width: number,
  height: number,
  fillStyle: string,
  radius = 5,
): void {
  const mapped = project(point, bounds, width, height);
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(mapped.x, mapped.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function metricLabel(key: ExpandedMapMetricKey, text: (en: string, zh: string) => string): string {
  const entry = METRIC_OVERLAYS.find((item) => item.key === key);
  return entry ? text(entry.en, entry.zh) : key;
}

function drawBboxMetric(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
  text: (en: string, zh: string) => string,
): MetricLegend {
  const entries = getInstanceEntries(manifest);
  let count = 0;
  let missing = 0;
  for (const entry of entries) {
    if (!entry.bbox) {
      missing += 1;
      continue;
    }
    const color = FEATURE_COLORS[entry.category] ?? FEATURE_COLORS.default;
    drawPolygon(
      ctx,
      bboxToPoints(entry.bbox),
      bounds,
      width,
      height,
      "rgba(255, 255, 255, 0.02)",
      color,
      1.4,
    );
    count += 1;
  }
  return {
    title: text("Furniture BBox", "家具边界框"),
    subtitle: text("Instance footprint from bbox_xz", "来自实例 bbox_xz 的占地范围"),
    status: `${count} ${text("drawn", "已绘制")}${missing ? ` · ${missing} ${text("missing bbox", "缺少 bbox")}` : ""}`,
    rows: [
      { label: text("Category color", "按类别着色"), color: FEATURE_COLORS.default },
    ],
  };
}

function drawInstanceValueMetric(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
  options: {
    field?: string;
    title: string;
    subtitle: string;
    valueColor: (value: number, maxValue: number) => string;
    gradient: MetricLegend["gradient"];
    valueForEntry?: (entry: ReturnType<typeof getInstanceEntries>[number]) => number | null;
  },
): MetricLegend {
  const entries = getInstanceEntries(manifest);
  const readValue = (entry: ReturnType<typeof getInstanceEntries>[number]): number | null => (
    options.valueForEntry
      ? options.valueForEntry(entry)
      : options.field
        ? finiteNumber(entry.info[options.field])
        : null
  );
  const values = entries
    .map((entry) => readValue(entry))
    .filter((value): value is number => value !== null);
  const maxValue = Math.max(1e-6, ...values.map((value) => Math.abs(value)));
  let count = 0;
  let missing = 0;
  for (const entry of entries) {
    if (!entry.position) {
      continue;
    }
    const value = readValue(entry);
    if (value === null) {
      drawMetricPoint(ctx, entry.position, bounds, width, height, "rgba(100, 116, 139, 0.54)", 4);
      missing += 1;
      continue;
    }
    drawMetricPoint(ctx, entry.position, bounds, width, height, options.valueColor(value, maxValue), 5.2);
    count += 1;
  }
  return {
    title: options.title,
    subtitle: options.subtitle,
    gradient: options.gradient,
    status: `${count} ${count === 1 ? "value" : "values"}${missing ? ` · ${missing} N/A` : ""}`,
  };
}

function distanceToNearest(point: WorldPoint, targets: WorldPoint[]): number {
  if (!targets.length) {
    return Number.POSITIVE_INFINITY;
  }
  return targets.reduce((best, target) => Math.min(best, worldDistance(point, target)), Number.POSITIVE_INFINITY);
}

function drawGridHeatmap(
  ctx: CanvasRenderingContext2D,
  bounds: SceneBounds,
  width: number,
  height: number,
  valueAt: (point: WorldPoint) => number | null,
  colorForValue: (value: number) => string,
  cellSize = 16,
): number {
  let cells = 0;
  ctx.save();
  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      const center = canvasToWorldPoint(x + cellSize / 2, y + cellSize / 2, bounds, width, height);
      const value = valueAt(center);
      if (value === null || !Number.isFinite(value)) {
        continue;
      }
      ctx.fillStyle = colorForValue(value);
      ctx.fillRect(x, y, Math.min(cellSize, width - x), Math.min(cellSize, height - y));
      cells += 1;
    }
  }
  ctx.restore();
  return cells;
}

function drawDistanceMetric(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
  metric: "road_edge_distance" | "junction_distance" | "entrance_distance",
  text: (en: string, zh: string) => string,
): MetricLegend {
  const pointsByType = poiPointsByType(manifest);
  const halfWidth = roadHalfWidth(manifest);
  const edgeSegments = metric === "road_edge_distance" ? roadEdgeSegments(manifest) : [];
  const targetPoints = metric === "junction_distance"
    ? (pointsByType.junction ?? [])
    : metric === "entrance_distance"
      ? (pointsByType.entrance ?? [])
      : [];
  const field = metric === "road_edge_distance"
    ? "dist_to_road_edge_m"
    : metric === "junction_distance"
      ? "dist_to_nearest_junction_m"
      : "dist_to_nearest_entrance_m";
  const cap = metric === "road_edge_distance" ? 8 : 40;
  const title = metric === "road_edge_distance"
    ? text("Road Edge Distance", "距路缘距离")
    : metric === "junction_distance"
      ? text("Junction Distance", "距路口距离")
      : text("Entrance Distance", "距出入口距离");
  const available = metric === "road_edge_distance" ? (edgeSegments.length > 0 || halfWidth !== null) : targetPoints.length > 0;
  const roadEdgeDistance = (point: WorldPoint): number | null => {
    if (edgeSegments.length > 0) {
      return distanceToNearestSegment(point, edgeSegments);
    }
    if (halfWidth !== null) {
      return Math.abs(Math.abs(point.z - bounds.center.z) - halfWidth);
    }
    return null;
  };
  if (available) {
    drawGridHeatmap(
      ctx,
      bounds,
      width,
      height,
      (point) => {
        if (metric === "road_edge_distance") {
          return roadEdgeDistance(point);
        }
        return distanceToNearest(point, targetPoints);
      },
      (value) => distanceColor(value, cap, 0.22),
      18,
    );
  }
  const legend = drawInstanceValueMetric(ctx, manifest, bounds, width, height, {
    field,
    title,
    subtitle: available
      ? metric === "road_edge_distance"
        ? text("Recomputed from carriageway edges plus instance samples", "根据机动车道边界重新计算并叠加实例样本")
        : text("Grid heatmap plus instance distance samples", "网格热力叠加实例距离样本")
      : text("Instance samples only; spatial context missing", "仅显示实例样本；缺少空间上下文"),
    valueForEntry: metric === "road_edge_distance"
      ? (entry) => (entry.position ? roadEdgeDistance(entry.position) : null)
      : (entry) => {
          const value = finiteNumber(entry.info[field]);
          return value !== null && value >= 0 ? value : null;
        },
    valueColor: (value) => distanceColor(value, cap, 0.88),
    gradient: {
      from: "rgba(37, 99, 235, 0.92)",
      mid: "rgba(34, 197, 94, 0.92)",
      to: "rgba(234, 88, 12, 0.92)",
      min: "0m",
      max: `${cap}m+`,
    },
  });
  if (!available) {
    legend.status = `${legend.status ?? ""} · ${text("context N/A", "上下文 N/A")}`;
  }
  return legend;
}

function drawPoiAnchorsMetric(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
  text: (en: string, zh: string) => string,
): MetricLegend {
  const summary = asRecord(manifest.summary) ?? {};
  const pointsByType = poiPointsByType(manifest);
  const entries = getInstanceEntries(manifest);
  let poiCount = 0;
  let anchorCount = 0;
  let violationCount = 0;

  for (const zone of asArray(summary.poi_exclusion_zones)) {
    const record = asRecord(zone);
    if (!record) {
      continue;
    }
    const center = readPoint(record.position_xz);
    const radius = finiteNumber(record.radius_m);
    if (!center || radius === null || radius <= 0) {
      continue;
    }
    drawWorldCircle(
      ctx,
      center,
      radius,
      bounds,
      width,
      height,
      "rgba(220, 38, 38, 0.06)",
      "rgba(220, 38, 38, 0.52)",
      1.1,
    );
  }

  for (const [poiType, points] of Object.entries(pointsByType)) {
    const color = POI_COLORS[poiType] ?? POI_COLORS.default;
    for (const point of points) {
      const mapped = project(point, bounds, width, height);
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.rect(mapped.x - 4.2, mapped.y - 4.2, 8.4, 8.4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      poiCount += 1;
    }
  }

  for (const entry of entries) {
    if (!entry.position) {
      continue;
    }
    const anchorType = recordText(entry.info, ["anchor_poi_type"]);
    const explicitTarget = readPoint(entry.info.anchor_target_xz);
    const inferredTarget = anchorType ? nearestPoiPoint(pointsByType, anchorType, entry.position) : null;
    const target = explicitTarget ?? inferredTarget;
    if (target) {
      drawPolyline(ctx, [entry.position, target], bounds, width, height, "rgba(0, 83, 159, 0.42)", 1.1);
      anchorCount += 1;
    }
    const violatedRules = asArray(entry.info.violated_rules).filter((item) => String(item || "").trim());
    if (violatedRules.length) {
      drawCrossMarker(ctx, project(entry.position, bounds, width, height), 6.5, "rgba(220, 38, 38, 0.96)");
      violationCount += 1;
    }
  }

  return {
    title: text("POI Anchors", "POI 锚点"),
    subtitle: text("POI markers, exclusion radii, anchor links, and violations", "POI 点、排斥半径、锚点连线与违规标记"),
    status: `${poiCount} POI · ${anchorCount} ${text("links", "连线")} · ${violationCount} ${text("violations", "违规")}`,
    rows: [
      { label: text("POI marker", "POI 点"), color: POI_COLORS.default },
      { label: text("Anchor link", "锚点连线"), color: "#00539f" },
      { label: text("Conflict", "冲突"), color: "#dc2626" },
    ],
  };
}

function buildBandBboxes(manifest: ViewerManifest, bounds: SceneBounds): Array<{ kind: string; bbox: BBoxXz }> {
  const bands = normalizedBands(manifest);
  if (!bands.length) {
    return [];
  }
  const length = sceneLength(manifest, bounds);
  const minX = bounds.center.x - length / 2;
  const maxX = bounds.center.x + length / 2;
  const explicitCenters = bands.some((band) => finiteNumber(band.z_center_m) !== null);
  let cursor = -bands.reduce((sum, band) => sum + (finiteNumber(band.width_m) ?? 0), 0) / 2;
  const result: Array<{ kind: string; bbox: BBoxXz }> = [];
  for (const band of bands) {
    const bandWidth = finiteNumber(band.width_m) ?? 0;
    if (!(bandWidth > 0)) {
      continue;
    }
    const relativeCenter = explicitCenters
      ? (finiteNumber(band.z_center_m) ?? 0)
      : cursor + bandWidth / 2;
    cursor += explicitCenters ? 0 : bandWidth;
    const minZ = bounds.center.z + relativeCenter - bandWidth / 2;
    const maxZ = bounds.center.z + relativeCenter + bandWidth / 2;
    result.push({
      kind: normalizeKind(band.kind ?? band.role ?? band.surface_role ?? band.name),
      bbox: { minX, maxX, minZ, maxZ },
    });
  }
  return result;
}

function inferClearPathZones(manifest: ViewerManifest, bounds: SceneBounds): BBoxXz[] {
  const fromBands = buildBandBboxes(manifest, bounds)
    .filter((entry) => entry.kind.includes("clear"))
    .map((entry) => entry.bbox);
  if (fromBands.length) {
    return fromBands;
  }
  const summary = asRecord(manifest.summary) ?? {};
  const halfWidth = roadHalfWidth(manifest);
  if (halfWidth === null) {
    return [];
  }
  const length = sceneLength(manifest, bounds);
  const minX = bounds.center.x - length / 2;
  const maxX = bounds.center.x + length / 2;
  const leftClear = finiteNumber(summary.left_clear_path_width_m) ?? finiteNumber(summary.sidewalk_width_m) ?? 0;
  const rightClear = finiteNumber(summary.right_clear_path_width_m) ?? finiteNumber(summary.sidewalk_width_m) ?? 0;
  const leftFurnishing = finiteNumber(summary.left_furnishing_width_m) ?? 0;
  const rightFurnishing = finiteNumber(summary.right_furnishing_width_m) ?? 0;
  const zones: BBoxXz[] = [];
  if (leftClear > 0) {
    const minZ = bounds.center.z + halfWidth + leftFurnishing;
    zones.push({ minX, maxX, minZ, maxZ: minZ + leftClear });
  }
  if (rightClear > 0) {
    const maxZ = bounds.center.z - halfWidth - rightFurnishing;
    zones.push({ minX, maxX, minZ: maxZ - rightClear, maxZ });
  }
  return zones;
}

function drawClearPathConflictMetric(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
  text: (en: string, zh: string) => string,
): MetricLegend {
  const zones = inferClearPathZones(manifest, bounds);
  const entries = getInstanceEntries(manifest);
  let blockedArea = 0;
  let conflictCount = 0;
  const clearArea = zones.reduce((sum, zone) => sum + bboxArea(zone), 0);
  for (const zone of zones) {
    drawPolygon(ctx, bboxToPoints(zone), bounds, width, height, "rgba(14, 165, 233, 0.12)", "rgba(2, 132, 199, 0.42)", 1);
  }
  for (const entry of entries) {
    if (!entry.bbox || entry.info.placement_group === "building") {
      continue;
    }
    for (const zone of zones) {
      const overlap = intersectBbox(entry.bbox, zone);
      if (!overlap) {
        continue;
      }
      const area = bboxArea(overlap);
      blockedArea += area;
      conflictCount += 1;
      drawPolygon(ctx, bboxToPoints(overlap), bounds, width, height, "rgba(220, 38, 38, 0.42)", "rgba(153, 27, 27, 0.82)", 1.2);
    }
  }
  const ratio = clearArea > 0 ? Math.min(1, blockedArea / clearArea) : 0;
  return {
    title: text("Clear Path Conflict", "净空冲突"),
    subtitle: text("Furniture bbox overlap with inferred clear path", "家具 bbox 与推断净行区的重叠"),
    status: zones.length
      ? `${conflictCount} ${text("overlaps", "处重叠")} · ${(ratio * 100).toFixed(1)}% ${text("blocked", "占用")}`
      : text("Clear path N/A", "净行区 N/A"),
    rows: [
      { label: text("Clear path", "净行区"), color: "#0ea5e9" },
      { label: text("Blocked area", "占用区域"), color: "#dc2626" },
    ],
  };
}

function drawCoverageHeatmap(
  ctx: CanvasRenderingContext2D,
  sources: Array<{ point: WorldPoint; radiusM: number }>,
  bounds: SceneBounds,
  width: number,
  height: number,
  color: [number, number, number],
  maxAlpha = 0.34,
  cellSize = 14,
): number {
  if (!sources.length) {
    return 0;
  }
  let painted = 0;
  ctx.save();
  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      const point = canvasToWorldPoint(x + cellSize / 2, y + cellSize / 2, bounds, width, height);
      let influence = 0;
      for (const source of sources) {
        const radius = Math.max(0.1, source.radiusM);
        influence = Math.max(influence, Math.max(0, 1 - worldDistance(point, source.point) / radius));
      }
      if (influence <= 0) {
        continue;
      }
      ctx.fillStyle = rgba(color, Math.min(maxAlpha, influence * maxAlpha));
      ctx.fillRect(x, y, Math.min(cellSize, width - x), Math.min(cellSize, height - y));
      painted += 1;
    }
  }
  ctx.restore();
  return painted;
}

function drawCoverageMetric(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
  metric: "tree_shade" | "lighting" | "amenity_coverage",
  text: (en: string, zh: string) => string,
): MetricLegend {
  const entries = getInstanceEntries(manifest);
  const sourceCategories = metric === "tree_shade"
    ? ["tree"]
    : metric === "lighting"
      ? ["lamp"]
      : ["bench", "bus_stop", "trash", "mailbox", "hydrant"];
  const sources = entries
    .filter((entry) => entry.position && sourceCategories.includes(entry.category))
    .map((entry) => ({
      point: entry.position as WorldPoint,
      radiusM: COVERAGE_RADII_M[entry.category] ?? 20,
      category: entry.category,
    }));
  const color: [number, number, number] = metric === "tree_shade"
    ? [34, 197, 94]
    : metric === "lighting"
      ? [234, 179, 8]
      : [37, 99, 235];
  drawCoverageHeatmap(ctx, sources, bounds, width, height, color);
  for (const source of sources) {
    drawWorldCircle(
      ctx,
      source.point,
      source.radiusM,
      bounds,
      width,
      height,
      rgba(color, 0.055),
      rgba(color, 0.34),
      0.9,
    );
  }
  const title = metric === "tree_shade"
    ? text("Tree Shade", "树荫覆盖")
    : metric === "lighting"
      ? text("Lighting", "照明覆盖")
      : text("Amenity Coverage", "服务覆盖");
  const subtitle = metric === "tree_shade"
    ? text("Tree canopy radius: 1.8m", "树冠半径：1.8m")
    : metric === "lighting"
      ? text("Lamp effective radius: 10m", "路灯有效半径：10m")
      : text("Bench 100m, bus stop 500m; trash 25m, mailbox/hydrant 30m", "座椅100m，公交500m；垃圾桶25m，邮箱/消防30m");
  return {
    title,
    subtitle,
    status: sources.length
      ? `${sources.length} ${text("sources", "个源点")}`
      : text("No source instances", "没有对应实例"),
    rows: [
      { label: text("Coverage decay", "覆盖衰减"), color: rgba(color, 0.82) },
    ],
  };
}

type CurbRampMetricEntry = {
  id: string;
  center: WorldPoint;
  footprint: WorldPoint[];
  influenceRadiusM: number;
};

function curbRampMetricEntries(manifest: ViewerManifest): CurbRampMetricEntry[] {
  const diagnostic = asRecord(manifest.surface_diagnostic) ?? {};
  return asArray(diagnostic.curb_access_ramps)
    .map((value) => asRecord(value))
    .filter((value): value is JsonRecord => value !== null)
    .map((record) => ({
      id: recordText(record, ["ramp_id", "id"]),
      center: readPoint(record.center_xz),
      footprint: readPointList(record.footprint_xz),
      influenceRadiusM: finiteNumber(record.influence_radius_m) ?? 3,
    }))
    .filter((ramp): ramp is CurbRampMetricEntry => ramp.center !== null);
}

export function focusPlanViewportForMetric(
  viewport: PlanViewport,
  metric: ExpandedMapMetricKey,
): PlanViewport {
  if (metric !== "curb_ramps") {
    return viewport;
  }
  const ramps = curbRampMetricEntries(viewport.manifest);
  if (!ramps.length) {
    return viewport;
  }
  const points = ramps.flatMap((ramp) => ramp.footprint.length ? ramp.footprint : [ramp.center]);
  const padding = Math.max(5, ...ramps.map((ramp) => ramp.influenceRadiusM + 2));
  const minX = Math.min(...points.map((point) => point.x)) - padding;
  const maxX = Math.max(...points.map((point) => point.x)) + padding;
  const minZ = Math.min(...points.map((point) => point.z)) - padding;
  const maxZ = Math.max(...points.map((point) => point.z)) + padding;
  const focusedBounds: SceneBounds = {
    minX,
    maxX,
    minZ,
    maxZ,
    center: new THREE.Vector3((minX + maxX) / 2, viewport.bounds.center.y, (minZ + maxZ) / 2),
    extent: Math.max(maxX - minX, maxZ - minZ) / 2,
  };
  return {
    ...viewport,
    bounds: fitBoundsToAspect(focusedBounds, viewport.width / Math.max(1, viewport.height)),
  };
}

function drawCurbRampMetric(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
  text: (en: string, zh: string) => string,
  animationTimeMs: number,
): MetricLegend {
  const ramps = curbRampMetricEntries(manifest);

  for (const [index, ramp] of ramps.entries()) {
    const center = ramp.center;
    drawWorldCircle(
      ctx,
      center,
      ramp.influenceRadiusM,
      bounds,
      width,
      height,
      "rgba(245, 158, 11, 0.10)",
      "rgba(217, 119, 6, 0.48)",
      1.2,
    );
    if (ramp.footprint.length >= 3) {
      drawPolygon(
        ctx,
        ramp.footprint,
        bounds,
        width,
        height,
        "rgba(251, 191, 36, 0.84)",
        "rgba(146, 64, 14, 0.96)",
        1.5,
      );
    }

    const phase = ((animationTimeMs / 1250) + index * 0.17) % 1;
    const pulseRadius = ramp.influenceRadiusM * (0.28 + phase * 0.72);
    drawWorldCircle(
      ctx,
      center,
      pulseRadius,
      bounds,
      width,
      height,
      "rgba(245, 158, 11, 0)",
      `rgba(234, 88, 12, ${(0.86 * (1 - phase)).toFixed(3)})`,
      2.2,
    );
    const mapped = project(center, bounds, width, height);
    ctx.save();
    ctx.translate(mapped.x, mapped.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#fff7ed";
    ctx.strokeStyle = "#c2410c";
    ctx.lineWidth = 1.6;
    ctx.fillRect(-3.8, -3.8, 7.6, 7.6);
    ctx.strokeRect(-3.8, -3.8, 7.6, 7.6);
    ctx.restore();
  }

  return {
    title: text("Accessible Curb Ramps", "无障碍街角坡道"),
    subtitle: text(
      "Pulse marks each ramp; amber circles show the 3m pedestrian influence area",
      "闪烁定位坡道；琥珀色圆圈表示 3m 行人影响范围",
    ),
    status: ramps.length
      ? `${ramps.length} ${text("ramps", "处坡道")} · 3m ${text("influence radius", "影响半径")}`
      : text("No curb-ramp geometry in this scene", "当前场景没有坡道位置数据"),
    rows: [
      { label: text("Ramp footprint", "坡道轮廓"), color: "#f59e0b" },
      { label: text("Pedestrian influence", "行人影响范围"), color: "#ea580c" },
    ],
  };
}

function drawMetricLegend(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  legend: MetricLegend | null,
): void {
  if (!legend) {
    return;
  }
  const cardWidth = Math.min(320, Math.max(240, width - 36));
  const rowCount = legend.rows?.length ?? 0;
  const cardHeight = 72
    + (legend.subtitle ? 18 : 0)
    + (legend.gradient ? 28 : 0)
    + rowCount * 18;
  const x = Math.max(16, width - cardWidth - 18);
  const y = Math.max(16, height - cardHeight - 18);
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = "rgba(15, 23, 42, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, cardWidth, cardHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(legend.title, x + 12, y + 10, cardWidth - 24);
  let cursorY = y + 29;
  if (legend.subtitle) {
    ctx.fillStyle = "#475569";
    ctx.font = "600 10.5px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(legend.subtitle, x + 12, cursorY, cardWidth - 24);
    cursorY += 18;
  }
  if (legend.gradient) {
    const gradient = ctx.createLinearGradient(x + 12, cursorY + 3, x + cardWidth - 12, cursorY + 3);
    gradient.addColorStop(0, legend.gradient.from);
    if (legend.gradient.mid) {
      gradient.addColorStop(0.5, legend.gradient.mid);
    }
    gradient.addColorStop(1, legend.gradient.to);
    ctx.fillStyle = gradient;
    ctx.fillRect(x + 12, cursorY + 2, cardWidth - 24, 8);
    ctx.fillStyle = "#64748b";
    ctx.font = "600 10px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(legend.gradient.min, x + 12, cursorY + 14);
    ctx.textAlign = "right";
    ctx.fillText(legend.gradient.max, x + cardWidth - 12, cursorY + 14);
    ctx.textAlign = "left";
    cursorY += 30;
  }
  for (const row of legend.rows ?? []) {
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(x + 17, cursorY + 7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#475569";
    ctx.font = "600 10.5px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(row.label, x + 28, cursorY + 1, cardWidth - 40);
    cursorY += 18;
  }
  if (legend.status) {
    ctx.fillStyle = "#334155";
    ctx.font = "700 10.5px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(legend.status, x + 12, cardHeight + y - 22, cardWidth - 24);
  }
  ctx.restore();
}

function drawMetricOverlay(
  ctx: CanvasRenderingContext2D,
  metric: ExpandedMapMetricKey,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
  text: (en: string, zh: string) => string,
  animationTimeMs = 0,
): MetricLegend | null {
  if (metric === "none") {
    return null;
  }
  if (metric === "bbox") {
    return drawBboxMetric(ctx, manifest, bounds, width, height, text);
  }
  if (metric === "feasibility") {
    return drawInstanceValueMetric(ctx, manifest, bounds, width, height, {
      field: "feasibility_score",
      title: text("Feasibility", "可行性"),
      subtitle: text("Green is high feasibility; red is low", "绿色表示可行性高，红色表示低"),
      valueColor: (value) => scoreColor(value),
      gradient: {
        from: "rgba(220, 38, 38, 0.92)",
        mid: "rgba(234, 179, 8, 0.92)",
        to: "rgba(22, 163, 74, 0.92)",
        min: "0",
        max: "1",
      },
    });
  }
  if (metric === "constraint_penalty") {
    return drawInstanceValueMetric(ctx, manifest, bounds, width, height, {
      field: "constraint_penalty",
      title: text("Constraint Penalty", "约束惩罚"),
      subtitle: text("Higher penalty means stronger placement conflict", "惩罚越高表示落位冲突越强"),
      valueColor: (value, maxValue) => rgba([220, 38, 38], 0.22 + 0.7 * Math.min(1, Math.max(0, value / maxValue))),
      gradient: {
        from: "rgba(220, 38, 38, 0.16)",
        to: "rgba(220, 38, 38, 0.92)",
        min: "low",
        max: "high",
      },
    });
  }
  if (metric === "road_edge_distance" || metric === "junction_distance" || metric === "entrance_distance") {
    return drawDistanceMetric(ctx, manifest, bounds, width, height, metric, text);
  }
  if (metric === "poi_anchors") {
    return drawPoiAnchorsMetric(ctx, manifest, bounds, width, height, text);
  }
  if (metric === "clear_path_conflict") {
    return drawClearPathConflictMetric(ctx, manifest, bounds, width, height, text);
  }
  if (metric === "tree_shade" || metric === "lighting" || metric === "amenity_coverage") {
    return drawCoverageMetric(ctx, manifest, bounds, width, height, metric, text);
  }
  if (metric === "curb_ramps") {
    return drawCurbRampMetric(ctx, manifest, bounds, width, height, text, animationTimeMs);
  }
  return {
    title: metricLabel(metric, text),
    status: text("Not available", "不可用"),
  };
}

function chooseScaleLength(worldSpan: number): number {
  const raw = worldSpan / 6;
  const exponent = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const normalized = raw / exponent;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * exponent;
}

function drawScaleBar(ctx: CanvasRenderingContext2D, bounds: SceneBounds, width: number, height: number): void {
  const worldSpan = Math.max(1, bounds.maxX - bounds.minX);
  const scaleM = chooseScaleLength(worldSpan);
  const scalePx = worldSizeToPixels(scaleM, bounds, width);
  const x = 22;
  const y = height - 24;
  ctx.save();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.82)";
  ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + scalePx, y);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.moveTo(x + scalePx, y - 5);
  ctx.lineTo(x + scalePx, y + 5);
  ctx.stroke();
  ctx.font = "600 11px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${Number(scaleM.toFixed(scaleM >= 10 ? 0 : 1))} m`, x, y - 8);
  ctx.restore();
}

function drawViewpoint(
  ctx: CanvasRenderingContext2D,
  bounds: SceneBounds,
  width: number,
  height: number,
  avatarPosition: THREE.Vector3,
  forward: THREE.Vector3,
): void {
  const origin = worldToMinimap(avatarPosition.x, avatarPosition.z, bounds, width, height);
  const direction = new THREE.Vector2(forward.x, forward.z);
  if (direction.lengthSq() < 1e-6) {
    direction.set(1, 0);
  } else {
    direction.normalize();
  }
  const length = 30;
  const tip = { x: origin.x + direction.x * length, y: origin.y + direction.y * length };
  ctx.save();
  ctx.strokeStyle = "#00539f";
  ctx.fillStyle = "#00539f";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function comparisonTagsForManifest(
  manifest: ViewerManifest,
  text: (en: string, zh: string) => string,
): Array<{ label: string; value: string }> {
  const metadata = metadataFromManifest(manifest);
  const furniture = metadata.street_furniture_profile
    || metadata.curated_street_assets_profile
    || metadata.furniture_balance_policy;
  return [
    { label: text("Template", "模板"), value: formatMetadataValue(metadata.graph_template_id) },
    { label: text("Skeleton", "骨架"), value: formatMetadataValue(metadata.skeleton_design_profile) },
    { label: text("Furniture", "家具"), value: formatMetadataValue(furniture) },
    { label: text("Style", "风格"), value: formatMetadataValue(metadata.style_preset) },
    { label: text("Scenario", "方案"), value: formatMetadataValue(metadata.scenario_title || metadata.scenario_id) },
    { label: text("Seed", "种子"), value: formatMetadataValue(metadata.random_seed) },
    { label: text("Items", "对象"), value: formatMetadataValue(metadata.instance_count) },
  ];
}

function drawViewportTags(
  ctx: CanvasRenderingContext2D,
  label: string,
  manifest: ViewerManifest,
  width: number,
  text: (en: string, zh: string) => string,
): void {
  const tags = comparisonTagsForManifest(manifest, text);
  const margin = 12;
  const chipGap = 5;
  const chipHeight = 19;
  let x = margin;
  let y = margin;
  ctx.save();
  ctx.font = "750 11px system-ui, -apple-system, Segoe UI, sans-serif";
  const labelWidth = Math.min(width - margin * 2, Math.ceil(ctx.measureText(label).width + 20));
  ctx.fillStyle = "rgba(15, 23, 42, 0.84)";
  ctx.beginPath();
  ctx.roundRect(x, y, labelWidth, 21, 7);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 10, y + 10.5, labelWidth - 20);
  x += labelWidth + chipGap;

  ctx.font = "650 10px system-ui, -apple-system, Segoe UI, sans-serif";
  for (const tag of tags) {
    const value = tag.value || "Unknown";
    const chipText = `${tag.label}: ${value}`;
    const chipWidth = Math.min(width - margin * 2, Math.ceil(ctx.measureText(chipText).width + 16));
    if (x + chipWidth > width - margin && x > margin) {
      x = margin;
      y += chipHeight + chipGap;
    }
    if (y > margin + (chipHeight + chipGap) * 2) {
      break;
    }
    ctx.fillStyle = value === "Unknown" ? "rgba(248, 250, 252, 0.78)" : "rgba(255, 255, 255, 0.88)";
    ctx.strokeStyle = value === "Unknown" ? "rgba(148, 163, 184, 0.35)" : "rgba(0, 83, 159, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y + 1, chipWidth, chipHeight, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = value === "Unknown" ? "#64748b" : "#1e293b";
    ctx.fillText(chipText, x + 8, y + 10.5, chipWidth - 16);
    x += chipWidth + chipGap;
  }
  ctx.restore();
}

export function drawPlanViewport(
  ctx: CanvasRenderingContext2D,
  viewport: PlanViewport,
  layerState: Record<ExpandedMapLayerKey, boolean>,
  metricOverlay: ExpandedMapMetricKey,
  avatarPosition: THREE.Vector3,
  forward: THREE.Vector3,
  text: (en: string, zh: string) => string,
  showDecorations = true,
  animationTimeMs = 0,
): void {
  const { x, y, width, height, manifest, bounds, label } = viewport;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.fillStyle = "#f7f6f3";
  ctx.fillRect(0, 0, width, height);
  if (layerState.roads) {
    const drewRoads = drawRoadGeometry(ctx, manifest, bounds, width, height);
    const drewFallbackBands = drewRoads
      ? false
      : drawBandFallback(ctx, manifest, bounds, width, height);
    if (!drewRoads && !drewFallbackBands) {
      ctx.strokeStyle = "rgba(15, 23, 42, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    }
  }
  if (layerState.surfaces) {
    drawDesignSurfaces(ctx, manifest, bounds, width, height);
  }
  if (layerState.buildings) {
    drawBuildings(ctx, manifest, bounds, width, height);
  }
  if (layerState.furniture) {
    drawFurniture(ctx, manifest, bounds, width, height);
  }
  const metricLegend = drawMetricOverlay(ctx, metricOverlay, manifest, bounds, width, height, text, animationTimeMs);
  if (showDecorations && layerState.viewpoint) {
    drawViewpoint(ctx, bounds, width, height, avatarPosition, forward);
  }
  if (showDecorations) {
    drawScaleBar(ctx, bounds, width, height);
    drawMetricLegend(ctx, width, height, metricLegend);
    drawViewportTags(ctx, label, manifest, width, text);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.restore();
}

export type PlanMapCanvasOptions = {
  manifest: ViewerManifest;
  bounds: SceneBounds;
  avatarPosition: THREE.Vector3;
  forward: THREE.Vector3;
  text: (en: string, zh: string) => string;
  width?: number;
  height?: number;
  showDecorations?: boolean;
};

/**
 * Render the canonical Scene Map plan view to a standalone canvas.
 *
 * Toolbar exports use this compositor so exported files contain the same
 * manifest-driven roads, surfaces, buildings, furniture, tags, and scale as
 * the interactive Plan mode instead of a separate Three.js approximation.
 */
export function renderPlanMapCanvas({
  manifest,
  bounds,
  avatarPosition,
  forward,
  text,
  width = 2400,
  height = 1500,
  showDecorations = true,
}: PlanMapCanvasOptions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D is unavailable; cannot render the plan map.");
  }
  const layerState: Record<ExpandedMapLayerKey, boolean> = {
    roads: true,
    surfaces: true,
    buildings: true,
    furniture: true,
    viewpoint: true,
  };
  const viewports = buildPlanViewports(
    manifest,
    null,
    bounds,
    canvas.width,
    canvas.height,
    text,
  );
  ctx.fillStyle = "#f7f6f3";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const viewport of viewports) {
    drawPlanViewport(ctx, viewport, layerState, "none", avatarPosition, forward, text, showDecorations);
  }
  return canvas;
}
