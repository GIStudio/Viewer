/**
 * Expanded Scene Map modal for the RoadGen3D Viewer.
 *
 * The small minimap stays a navigation affordance; this controller owns a
 * separate renderer and overlay canvas for presentation-scale plan reading.
 */
import * as THREE from "three";
import type { ViewerManifest } from "./viewer-types";
import {
  minimapToWorld,
  worldToMinimap,
  type SceneBounds,
} from "./viewer-minimap";

type ExpandedMapMode = "plan" | "presentation";
type ExpandedMapLayerKey = "roads" | "surfaces" | "buildings" | "furniture" | "viewpoint";
type JsonRecord = Record<string, unknown>;
type WorldPoint = { x: number; z: number };
type CanvasPoint = { x: number; y: number };

export type ExpandedMapController = {
  open: () => void;
  close: () => void;
  render: () => void;
  resize: () => void;
  dispose: () => void;
  isOpen: () => boolean;
};

type ExpandedMapDeps = {
  scene: THREE.Scene;
  getRoot: () => THREE.Object3D | null;
  getBounds: () => SceneBounds | null;
  getManifest: () => ViewerManifest | null;
  getAvatarPosition: () => THREE.Vector3;
  cameraForwardHorizontal: () => THREE.Vector3;
  flyCameraTo: (x: number, y: number, z: number) => void;
  text: (en: string, zh: string) => string;
};

const LAYERS: Array<{ key: ExpandedMapLayerKey; en: string; zh: string }> = [
  { key: "roads", en: "Road", zh: "道路" },
  { key: "surfaces", en: "Surface", zh: "设计面" },
  { key: "buildings", en: "Building", zh: "建筑" },
  { key: "furniture", en: "Furniture", zh: "家具" },
  { key: "viewpoint", en: "View", zh: "视角" },
];

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
    record.polygon,
    record.points,
    record.ring,
    record.outer,
  ];
  for (const candidate of candidates) {
    const points = readPointList(candidate);
    if (points.length >= 3) {
      return points;
    }
  }
  const bbox = asArray(record.bbox_xz).map((entry) => finiteNumber(entry));
  if (bbox.length >= 4 && bbox.every((entry) => entry !== null)) {
    const [minX, minZ, maxX, maxZ] = bbox as number[];
    return [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ },
    ];
  }
  return [];
}

function readRings(value: unknown): WorldPoint[][] {
  return asArray(value)
    .map((entry) => readPointList(entry))
    .filter((ring) => ring.length >= 3);
}

function colorForKind(kind: string): { fill: string; stroke: string } {
  return SURFACE_COLORS[kind] ?? SURFACE_COLORS.default;
}

function fitBoundsToAspect(bounds: SceneBounds, aspect: number): SceneBounds {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfX = bounds.extent * Math.max(1, safeAspect);
  const halfZ = bounds.extent * Math.max(1, 1 / safeAspect);
  return {
    minX: bounds.center.x - halfX,
    maxX: bounds.center.x + halfX,
    minZ: bounds.center.z - halfZ,
    maxZ: bounds.center.z + halfZ,
    center: bounds.center,
    extent: Math.max(halfX, halfZ),
  };
}

function setTopDownCamera(camera: THREE.OrthographicCamera, bounds: SceneBounds, width: number, height: number): SceneBounds {
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
  const hasExplicitCenters = rawBands.some((band) => finiteNumber(band.z_center_m) !== null);
  if (hasExplicitCenters || rawBands.length <= 12) {
    return rawBands;
  }

  const laneCount = Math.max(1, Math.round(finiteNumber(overlay.lane_count) ?? 1));
  const roadWidth = finiteNumber(overlay.road_width_m);
  const result: JsonRecord[] = [];
  const seen = new Set<string>();
  let expandedDriveLanes = false;
  for (const band of rawBands) {
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
): void {
  const bands = normalizedBands(manifest);
  if (!bands.length) {
    return;
  }
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  const length = finiteNumber(overlay.length_m) ?? Math.max(24, (bounds.maxX - bounds.minX) * 0.72);
  const minX = bounds.center.x - length / 2;
  const maxX = bounds.center.x + length / 2;
  const explicitCenters = bands.some((band) => finiteNumber(band.z_center_m) !== null);

  let cursor = -bands.reduce((sum, band) => sum + (finiteNumber(band.width_m) ?? 0), 0) / 2;
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
}

function drawOverlayCollection(
  ctx: CanvasRenderingContext2D,
  items: unknown,
  bounds: SceneBounds,
  width: number,
  height: number,
  fallbackKind: string,
): void {
  for (const item of asArray(items)) {
    const record = asRecord(item);
    if (!record) {
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
  }
}

function drawBuildings(
  ctx: CanvasRenderingContext2D,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  width: number,
  height: number,
): void {
  const overlay = asRecord(manifest.layout_overlay) ?? {};
  let footprintCount = 0;
  for (const item of asArray(overlay.building_footprints)) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const points = readPolygon(record);
    if (points.length >= 3) {
      drawPolygon(ctx, points, bounds, width, height, "rgba(86, 92, 108, 0.34)", "rgba(58, 64, 77, 0.68)", 1.1);
      footprintCount += 1;
    }
  }
  if (footprintCount > 0) {
    return;
  }
  const buildingRegions = asArray(overlay.building_regions);
  if (buildingRegions.length > 0) {
    drawOverlayCollection(ctx, buildingRegions, bounds, width, height, "building_region");
    return;
  }
  drawOverlayCollection(ctx, overlay.derived_regions, bounds, width, height, "building_region");
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

function drawPlanOverlay(
  canvas: HTMLCanvasElement,
  mode: ExpandedMapMode,
  layerState: Record<ExpandedMapLayerKey, boolean>,
  manifest: ViewerManifest,
  bounds: SceneBounds,
  avatarPosition: THREE.Vector3,
  forward: THREE.Vector3,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const cssWidth = Math.max(1, canvas.clientWidth);
  const cssHeight = Math.max(1, canvas.clientHeight);
  const dpr = canvas.width / cssWidth;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mode !== "plan") {
    return;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  if (layerState.roads) {
    const drewRoads = drawRoadGeometry(ctx, manifest, bounds, cssWidth, cssHeight);
    drawBandFallback(ctx, manifest, bounds, cssWidth, cssHeight);
    if (!drewRoads) {
      ctx.strokeStyle = "rgba(15, 23, 42, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);
    }
  }
  if (layerState.surfaces) {
    drawDesignSurfaces(ctx, manifest, bounds, cssWidth, cssHeight);
  }
  if (layerState.buildings) {
    drawBuildings(ctx, manifest, bounds, cssWidth, cssHeight);
  }
  if (layerState.furniture) {
    drawFurniture(ctx, manifest, bounds, cssWidth, cssHeight);
  }
  if (layerState.viewpoint) {
    drawViewpoint(ctx, bounds, cssWidth, cssHeight, avatarPosition, forward);
  }
  drawScaleBar(ctx, bounds, cssWidth, cssHeight);
  ctx.restore();
}

function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): void {
  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, "image/png");
}

export function createExpandedMapController(deps: ExpandedMapDeps): ExpandedMapController {
  let modalEl: HTMLElement | null = null;
  let panelEl: HTMLElement | null = null;
  let webglHostEl: HTMLElement | null = null;
  let overlayCanvasEl: HTMLCanvasElement | null = null;
  let statusEl: HTMLElement | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let mode: ExpandedMapMode = "plan";
  let activeBounds: SceneBounds | null = null;
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 5000);
  camera.up.set(0, 0, -1);
  const layerState: Record<ExpandedMapLayerKey, boolean> = {
    roads: true,
    surfaces: true,
    buildings: true,
    furniture: true,
    viewpoint: true,
  };

  function ensureRenderer(): void {
    if (!webglHostEl) {
      return;
    }
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(0xf7f6f3);
    }
    if (renderer.domElement.parentElement !== webglHostEl) {
      webglHostEl.appendChild(renderer.domElement);
    }
  }

  function syncModeButtons(): void {
    modalEl?.querySelectorAll<HTMLButtonElement>("[data-expanded-map-mode]").forEach((button) => {
      button.dataset.active = button.dataset.expandedMapMode === mode ? "true" : "false";
    });
    if (panelEl) {
      panelEl.dataset.mapMode = mode;
    }
  }

  function syncLayerButtons(): void {
    modalEl?.querySelectorAll<HTMLInputElement>("[data-expanded-map-layer]").forEach((input) => {
      const key = input.dataset.expandedMapLayer as ExpandedMapLayerKey | undefined;
      if (!key) {
        return;
      }
      input.checked = layerState[key];
      input.closest<HTMLElement>(".viewer-expanded-map-layer")?.setAttribute("data-active", layerState[key] ? "true" : "false");
    });
  }

  function resize(): void {
    if (!webglHostEl || !overlayCanvasEl || !renderer) {
      return;
    }
    const width = Math.max(1, webglHostEl.clientWidth);
    const height = Math.max(1, webglHostEl.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    overlayCanvasEl.width = Math.max(1, Math.round(width * dpr));
    overlayCanvasEl.height = Math.max(1, Math.round(height * dpr));
    overlayCanvasEl.style.width = `${width}px`;
    overlayCanvasEl.style.height = `${height}px`;
  }

  function render(): void {
    if (!modalEl || !webglHostEl || !overlayCanvasEl) {
      return;
    }
    ensureRenderer();
    resize();
    const root = deps.getRoot();
    const bounds = deps.getBounds();
    const manifest = deps.getManifest();
    if (!renderer || !root || !bounds || !manifest) {
      overlayCanvasEl.getContext("2d")?.clearRect(0, 0, overlayCanvasEl.width, overlayCanvasEl.height);
      if (statusEl) {
        statusEl.textContent = deps.text("No scene loaded", "未加载场景");
      }
      return;
    }
    const width = Math.max(1, webglHostEl.clientWidth);
    const height = Math.max(1, webglHostEl.clientHeight);
    activeBounds = setTopDownCamera(camera, bounds, width, height);
    renderer.render(deps.scene, camera);
    drawPlanOverlay(
      overlayCanvasEl,
      mode,
      layerState,
      manifest,
      activeBounds,
      deps.getAvatarPosition(),
      deps.cameraForwardHorizontal(),
    );
    if (statusEl) {
      statusEl.textContent = mode === "plan"
        ? deps.text("Plan map", "平面图")
        : deps.text("Presentation view", "展示视图");
    }
  }

  function setMode(nextMode: ExpandedMapMode): void {
    mode = nextMode;
    syncModeButtons();
    render();
  }

  function close(): void {
    modalEl?.remove();
    modalEl = null;
    panelEl = null;
    webglHostEl = null;
    overlayCanvasEl = null;
    statusEl = null;
    activeBounds = null;
  }

  function exportCurrentView(): void {
    if (!renderer || !overlayCanvasEl) {
      return;
    }
    render();
    const sourceCanvas = renderer.domElement;
    const output = document.createElement("canvas");
    output.width = sourceCanvas.width;
    output.height = sourceCanvas.height;
    const ctx = output.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(sourceCanvas, 0, 0, output.width, output.height);
    if (mode === "plan") {
      ctx.drawImage(overlayCanvasEl, 0, 0, output.width, output.height);
    }
    downloadCanvas(output, mode === "plan" ? "scene_map_plan" : "scene_map_presentation");
  }

  function handleMapClick(event: MouseEvent): void {
    if (!overlayCanvasEl || !activeBounds) {
      return;
    }
    const rect = overlayCanvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const world = minimapToWorld(
      event.clientX - rect.left,
      event.clientY - rect.top,
      activeBounds,
      overlayCanvasEl,
    );
    if (world) {
      deps.flyCameraTo(world.x, Math.max(0, deps.getAvatarPosition().y), world.z);
    }
  }

  function open(): void {
    if (modalEl) {
      render();
      return;
    }
    const layerControls = LAYERS.map((layer) => `
      <label class="viewer-expanded-map-layer" data-active="${layerState[layer.key] ? "true" : "false"}">
        <input type="checkbox" data-expanded-map-layer="${layer.key}" ${layerState[layer.key] ? "checked" : ""} />
        <span>${deps.text(layer.en, layer.zh)}</span>
      </label>
    `).join("");
    modalEl = document.createElement("div");
    modalEl.className = "viewer-expanded-map-modal";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.innerHTML = `
      <div class="viewer-expanded-map-backdrop" data-expanded-map-close="true"></div>
      <section class="viewer-expanded-map-panel" data-map-mode="${mode}" aria-labelledby="viewer-expanded-map-title">
        <header class="viewer-expanded-map-header">
          <div class="viewer-expanded-map-heading">
            <h2 id="viewer-expanded-map-title">${deps.text("Scene Map", "场景地图")}</h2>
            <span class="viewer-expanded-map-status">${deps.text("Plan map", "平面图")}</span>
          </div>
          <div class="viewer-expanded-map-actions">
            <div class="viewer-expanded-map-mode" role="group" aria-label="${deps.text("Map mode", "地图模式")}">
              <button type="button" data-expanded-map-mode="plan" data-active="true">${deps.text("Plan", "平面")}</button>
              <button type="button" data-expanded-map-mode="presentation">${deps.text("Presentation", "展示")}</button>
            </div>
            <button class="viewer-expanded-map-export" type="button" data-expanded-map-export="true">${deps.text("Export PNG", "导出 PNG")}</button>
            <button class="viewer-expanded-map-close" type="button" data-expanded-map-close="true" aria-label="${deps.text("Close", "关闭")}">&times;</button>
          </div>
        </header>
        <div class="viewer-expanded-map-layerbar">${layerControls}</div>
        <div class="viewer-expanded-map-stage">
          <div class="viewer-expanded-map-webgl"></div>
          <canvas class="viewer-expanded-map-overlay"></canvas>
        </div>
      </section>
    `;
    document.body.appendChild(modalEl);
    panelEl = modalEl.querySelector<HTMLElement>(".viewer-expanded-map-panel");
    webglHostEl = modalEl.querySelector<HTMLElement>(".viewer-expanded-map-webgl");
    overlayCanvasEl = modalEl.querySelector<HTMLCanvasElement>(".viewer-expanded-map-overlay");
    statusEl = modalEl.querySelector<HTMLElement>(".viewer-expanded-map-status");
    ensureRenderer();
    syncModeButtons();
    syncLayerButtons();

    modalEl.querySelectorAll<HTMLElement>("[data-expanded-map-close]").forEach((element) => {
      element.addEventListener("click", close);
    });
    modalEl.querySelectorAll<HTMLButtonElement>("[data-expanded-map-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextMode = button.dataset.expandedMapMode === "presentation" ? "presentation" : "plan";
        setMode(nextMode);
      });
    });
    modalEl.querySelector<HTMLButtonElement>("[data-expanded-map-export]")?.addEventListener("click", exportCurrentView);
    modalEl.querySelectorAll<HTMLInputElement>("[data-expanded-map-layer]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.expandedMapLayer as ExpandedMapLayerKey | undefined;
        if (!key) {
          return;
        }
        layerState[key] = input.checked;
        syncLayerButtons();
        render();
      });
    });
    overlayCanvasEl?.addEventListener("click", handleMapClick);
    modalEl.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
      }
    });
    modalEl.tabIndex = -1;
    modalEl.focus();
    requestAnimationFrame(() => render());
  }

  function dispose(): void {
    close();
    renderer?.dispose();
    renderer = null;
  }

  return {
    open,
    close,
    render,
    resize,
    dispose,
    isOpen: () => modalEl !== null,
  };
}
