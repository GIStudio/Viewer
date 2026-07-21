/**
 * Floating Lane Overlay for the RoadGen3D Viewer.
 *
 * Renders a 3D overlay showing lane semantics, road geometry, buildings,
 * features, and placement markers on top of the scene.
 */

import * as THREE from "three";
import type { FloatingLaneConfig, ViewerManifest } from "./viewer-types";
import { PER_LANE_COLORS } from "./viewer-types";
import { createTextSprite } from "./viewer-utils";
import type { ViewerLanguage } from "./viewer-i18n";

// ── Color Constants ────────────────────────────────────────────

const FLOATING_COLORS: Record<string, number> = {
  carriageway: 0x3b82f6, drive_lane: 0x60a5fa, bike_lane: 0x22c55e, bus_lane: 0xf59e0b,
  parking_lane: 0x6b7280, clear_path: 0xfaf5e6, furnishing: 0x92400e, sidewalk: 0xd4c4a8,
  median: 0xf97316, greenzone: 0x16a34a, buffer: 0x8b5cf6, frontage: 0x06b6d4,
  shared: 0xa78bfa, default: 0x94a3b8, building: 0x9ca3af,
  building_residential: 0x60a5fa, building_commercial: 0xf59e0b, building_industrial: 0x6b7280,
};

const SAFETY_COLORS: Record<string, number> = {
  carriageway: 0xef4444, bike_lane: 0x22c55e, clear_path: 0x22c55e, sidewalk: 0x22c55e,
  furnishing: 0xeab308, default: 0x94a3b8,
};

const LANE_LABELS: Record<string, string> = {
  carriageway: "机动车道", drive_lane: "行车道", bike_lane: "自行车道", bus_lane: "公交专用",
  parking_lane: "停车带", clear_path: "人行区", furnishing: "设施带", sidewalk: "人行道",
  median: "中央分隔带", greenzone: "绿化带", buffer: "缓冲带", frontage: "退缩带",
  shared: "共享街道", default: "道路", building: "建筑",
};

const LANE_LABELS_EN: Record<string, string> = {
  carriageway: "Carriageway", drive_lane: "Drive lane", bike_lane: "Bike lane", bus_lane: "Bus lane",
  parking_lane: "Parking", clear_path: "Pedestrian zone", furnishing: "Furnishing zone", sidewalk: "Sidewalk",
  median: "Median", greenzone: "Green belt", buffer: "Buffer", frontage: "Setback",
  shared: "Shared street", default: "Road", building: "Building",
};

const CATEGORY_COLORS: Record<string, number> = {
  bench: 0x4ade80, lamp: 0xfbbf24, trash: 0xf87171, tree: 0x22c55e,
  mailbox: 0x60a5fa, hydrant: 0xef4444, bollard: 0xa78bfa, bus_stop: 0xfb923c,
};

type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number; center: THREE.Vector3; extent: number };

// ── Dependencies ───────────────────────────────────────────────

export interface FloatingLaneDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  getManifest: () => ViewerManifest | null;
  getSceneBounds: () => MinimapBounds | null;
  cameraForwardHorizontal: () => THREE.Vector3;
  axisHudEl: HTMLCanvasElement;
  layoutOverlayToggleEl: HTMLInputElement;
  panelHost: HTMLElement;
  getLanguage: () => ViewerLanguage;
}

// ── Public API ────────────────────────────────────────────────

export interface FloatingLaneSystem {
  config: FloatingLaneConfig;
  buildOverlay: () => void;
  clearOverlay: () => void;
  updateAnimation: (deltaTime: number) => void;
  toggleOverlay: () => void;
  selectLane: (bandIndex: number) => void;
  selectInstance: (instanceId: string) => void;
  mountControlPanel: () => void;
  getLaneLabel: (kind: string) => string;
}

type InstanceOrientationInfo = {
  instanceId: string;
  assetId: string;
  category: string;
  position: [number, number, number];
  yawDeg: number;
  previewYawDeg: number;
};

type RoadCenterlineOverlay = {
  roadId: string;
  points: Array<[number, number]>;
};

type FloatingBandOverlay = {
  sourceIndex: number;
  kind: string;
  name: string;
  side: string;
  widthM: number;
  zCenterM: number;
};

const ROAD_CENTERLINE_END_EXTENSION_M = 5.5;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pointXz(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = finiteNumber(value[0]);
  const z = finiteNumber(value[1]);
  return x === null || z === null ? null : [x, z];
}

// ── Factory ────────────────────────────────────────────────────

export function createFloatingLaneSystem(deps: FloatingLaneDeps): FloatingLaneSystem {
  const {
    scene,
    getManifest,
    getSceneBounds,
    cameraForwardHorizontal,
    axisHudEl,
    layoutOverlayToggleEl,
    panelHost,
    getLanguage,
  } = deps;

  const text = (en: string, zh: string): string => getLanguage() === "zh" ? zh : en;
  const laneLabel = (kind: string): string => getLanguage() === "zh"
    ? (LANE_LABELS[kind] || kind)
    : (LANE_LABELS_EN[kind] || kind);

  let floatingLaneObjects: THREE.Object3D[] = [];
  let floatingLaneConfig: FloatingLaneConfig = {
    enabled: false, showSurfaces: true, height: 0.5, opacity: 0.5,
    showEdgeLines: true, showLabels: true, animated: false, colorScheme: "semantic",
    selectedLaneIndex: -1, showBuildings: true, showFeatures: true,
    showPlacementMarkers: true, buildingOpacity: 0.4, featureOpacity: 0.6,
  };
  let visibleLaneKinds: Set<string> = new Set(["carriageway", "drive_lane", "clear_path", "furnishing", "sidewalk"]);
  let floatingLaneAnimTime = 0;
  let showOrientationArrows = true;
  let selectedInstanceId = "";
  let orientationCategoryFilter = "all";
  const orientationYawOverrides = new Map<string, number>();

  function escapeHtml(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeYawDeg(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const normalized = ((value % 360) + 360) % 360;
    return normalized >= 180 ? normalized - 360 : normalized;
  }

  function readNumericField(record: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  }

  function readYawDeg(record: Record<string, unknown>): number {
    const deg = readNumericField(record, ["yaw_deg", "rotation_y_deg", "heading_deg", "orientation_deg"]);
    if (deg !== null) return normalizeYawDeg(deg);
    const rad = readNumericField(record, ["yaw_rad", "rotation_y_rad"]);
    if (rad !== null) return normalizeYawDeg(rad * 180 / Math.PI);
    const ambiguous = readNumericField(record, ["yaw", "rotation_y", "heading"]);
    if (ambiguous === null) return 0;
    return normalizeYawDeg(Math.abs(ambiguous) <= Math.PI * 2 ? ambiguous * 180 / Math.PI : ambiguous);
  }

  function readPosition(record: Record<string, unknown>): [number, number, number] | null {
    const position = record.position_xyz;
    if (Array.isArray(position) && position.length >= 3) {
      const x = Number(position[0]);
      const y = Number(position[1]);
      const z = Number(position[2]);
      if ([x, y, z].every(Number.isFinite)) return [x, y, z];
    }
    const x = readNumericField(record, ["x", "position_x"]);
    const y = readNumericField(record, ["y", "position_y"]);
    const z = readNumericField(record, ["z", "position_z"]);
    if (x !== null && y !== null && z !== null) return [x, y, z];
    return null;
  }

  function collectInstanceOrientationInfos(): InstanceOrientationInfo[] {
    const instances = getManifest()?.instances ?? {};
    const infos: InstanceOrientationInfo[] = [];
    for (const [key, raw] of Object.entries(instances)) {
      const record = raw as Record<string, unknown>;
      const position = readPosition(record);
      if (!position) continue;
      const instanceId = String(record.instance_id ?? record.id ?? key);
      const category = String(record.category ?? record.kind ?? "asset").trim().toLowerCase() || "asset";
      const assetId = String(record.asset_id ?? record.assetId ?? record.model_id ?? record.glb_path ?? "");
      const yawDeg = readYawDeg(record);
      infos.push({
        instanceId,
        assetId,
        category,
        position,
        yawDeg,
        previewYawDeg: orientationYawOverrides.get(instanceId) ?? yawDeg,
      });
    }
    infos.sort((a, b) => a.category.localeCompare(b.category) || a.instanceId.localeCompare(b.instanceId));
    return infos;
  }

  function filteredOrientationInfos(): InstanceOrientationInfo[] {
    const infos = collectInstanceOrientationInfos();
    if (orientationCategoryFilter === "all") return infos;
    return infos.filter(info => info.category === orientationCategoryFilter);
  }

  function selectedOrientationInfo(): InstanceOrientationInfo | null {
    const infos = collectInstanceOrientationInfos();
    if (!infos.length) return null;
    let selected = infos.find(info => info.instanceId === selectedInstanceId) ?? null;
    if (!selected) {
      selected = filteredOrientationInfos()[0] ?? infos[0];
      selectedInstanceId = selected.instanceId;
    }
    return selected;
  }

  function orientationPayload(info: InstanceOrientationInfo): Record<string, unknown> {
    return {
      instance_id: info.instanceId,
      asset_id: info.assetId,
      category: info.category,
      position_xyz: info.position.map(value => Number(value.toFixed(3))),
      original_yaw_deg: Number(normalizeYawDeg(info.yawDeg).toFixed(2)),
      preview_yaw_deg: Number(normalizeYawDeg(info.previewYawDeg).toFixed(2)),
      delta_yaw_deg: Number(normalizeYawDeg(info.previewYawDeg - info.yawDeg).toFixed(2)),
    };
  }

  function orientationColor(category: string, selected: boolean): number {
    if (selected) return 0xffffff;
    if (category.includes("rail") || category.includes("fence") || category.includes("barrier")) return 0xf43f5e;
    return CATEGORY_COLORS[category] ?? 0x38bdf8;
  }

  function getFloatingLaneColor(kind: string): number {
    const colors = floatingLaneConfig.colorScheme === "safety" ? SAFETY_COLORS : FLOATING_COLORS;
    return colors[kind] ?? colors["default"] ?? 0x94a3b8;
  }

  function getTurnLaneFloatingKind(patch: Record<string, unknown>): string {
    const sr = String(patch.surface_role ?? "").toLowerCase();
    const sk = String(patch.strip_kind ?? "").toLowerCase();
    if (sr === "bike_lane" || sk === "bike_lane") return "bike_lane";
    if (sr === "bus_lane" || sk === "bus_lane") return "bus_lane";
    if (sr === "parking_lane" || sk === "parking_lane") return "parking_lane";
    if (sr === "furnishing" || sk.includes("furnishing") || sk.includes("buffer")) return "furnishing";
    if (sr === "context_ground" || sk === "frontage_reserve") return "frontage";
    if (sr === "sidewalk" || sk === "clear_sidewalk") return "sidewalk";
    return "carriageway";
  }

  function getNormalizedSurfaceFloatingKind(patch: Record<string, unknown>): string {
    const role = String(patch.surface_role ?? "").toLowerCase();
    if (role === "crossing" || role === "crosswalk") return "default";
    if (role === "context_ground") return "frontage";
    return role || "carriageway";
  }

  function isVehicleTurnLanePatch(patch: Record<string, unknown>): boolean {
    const sr = String(patch.surface_role ?? "").toLowerCase();
    const sk = String(patch.strip_kind ?? "").toLowerCase();
    const stack = String(patch.stack_kind ?? "").toLowerCase();
    return (
      stack === "center"
      || ["carriageway", "bike_lane", "bus_lane", "parking_lane"].includes(sr)
      || ["drive_lane", "bike_lane", "bus_lane", "parking_lane"].includes(sk)
    );
  }

  function hasCornerSurfacePatches(junction: Record<string, unknown>): boolean {
    for (const key of ["sidewalk_corner_patches", "nearroad_corner_patches", "frontage_corner_patches"]) {
      const patches = (junction[key] ?? []) as Array<Record<string, unknown>>;
      if (patches.some(patch => ((patch.rings ?? []) as number[][][]).some(ring => ring.length >= 3))) {
        return true;
      }
    }
    return false;
  }

  function shouldRenderTurnLanePatch(patch: Record<string, unknown>, hasCornerSurface: boolean): boolean {
    return isVehicleTurnLanePatch(patch) || !hasCornerSurface;
  }

  function normalizeFloatingBandKind(rawKind: unknown): string {
    const kind = String(rawKind ?? "").trim().toLowerCase();
    if (kind === "frontage_reserve" || kind === "frontage") return "frontage";
    if (kind === "nearroad_furnishing" || kind === "transit_edge") return "furnishing";
    if (kind === "clear_sidewalk" || kind === "clear_path") return "clear_path";
    if (kind === "grass_belt" || kind === "greenzone") return "greenzone";
    return kind || "default";
  }

  function collectFloatingBands(overlay: Record<string, unknown>): FloatingBandOverlay[] {
    const bands = Array.isArray(overlay.bands) ? overlay.bands : [];
    const seen = new Set<string>();
    const result: FloatingBandOverlay[] = [];
    for (const [sourceIndex, rawBand] of bands.entries()) {
      const band = rawBand as Record<string, unknown>;
      const widthM = finiteNumber(band.width_m);
      if (widthM === null || widthM <= 0) continue;
      const kind = normalizeFloatingBandKind(band.kind ?? band.role ?? band.surface_role ?? band.name);
      if (!visibleLaneKinds.has(kind) && kind !== "default") continue;
      const zCenterM = finiteNumber(band.z_center_m) ?? 0;
      const name = String(band.name ?? kind);
      const side = String(band.side ?? "");
      const key = `${kind}|${side}|${name}|${widthM.toFixed(3)}|${zCenterM.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ sourceIndex, kind, name, side, widthM, zCenterM });
    }
    return result;
  }

  function collectRoadCenterlines(overlay: Record<string, unknown>): RoadCenterlineOverlay[] {
    const rawCenterlines = Array.isArray(overlay.road_centerlines) ? overlay.road_centerlines : [];
    const result: RoadCenterlineOverlay[] = [];
    for (const [index, rawCenterline] of rawCenterlines.entries()) {
      const centerline = rawCenterline as Record<string, unknown>;
      const rawPoints = Array.isArray(centerline.points_xz) ? centerline.points_xz : [];
      const points = rawPoints.map(pointXz).filter((point): point is [number, number] => point !== null);
      if (points.length < 2) continue;
      result.push({
        roadId: String(centerline.road_id ?? centerline.centerline_id ?? `road_${index}`),
        points,
      });
    }
    return result;
  }

  function bandPolygonForCenterline(
    centerline: RoadCenterlineOverlay,
    zCenterM: number,
    widthM: number,
  ): Array<[number, number]> | null {
    const first = centerline.points[0];
    const last = centerline.points[centerline.points.length - 1];
    const dx = last[0] - first[0];
    const dz = last[1] - first[1];
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length < 0.5) return null;

    const tangentX = dx / length;
    const tangentZ = dz / length;
    const normalX = tangentZ;
    const normalZ = -tangentX;
    const extension = Math.min(ROAD_CENTERLINE_END_EXTENSION_M, Math.max(0.5, length * 0.08));
    const start: [number, number] = [first[0] - tangentX * extension, first[1] - tangentZ * extension];
    const end: [number, number] = [last[0] + tangentX * extension, last[1] + tangentZ * extension];
    const leftOffset = zCenterM - widthM / 2;
    const rightOffset = zCenterM + widthM / 2;
    return [
      [start[0] + normalX * leftOffset, start[1] + normalZ * leftOffset],
      [end[0] + normalX * leftOffset, end[1] + normalZ * leftOffset],
      [end[0] + normalX * rightOffset, end[1] + normalZ * rightOffset],
      [start[0] + normalX * rightOffset, start[1] + normalZ * rightOffset],
    ];
  }

  function addFlatPolygonOverlay(
    ring: Array<[number, number]>,
    y: number,
    color: THREE.ColorRepresentation,
    opacity: number,
    userData: Record<string, unknown>,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(buildPolygonShape(ring.map(point => [point[0], -point[1]]))),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, y, 0);
    Object.assign(mesh.userData, userData, { isFloatingLane: true });
    scene.add(mesh);
    floatingLaneObjects.push(mesh);
  }

  function addFlatPolygonEdge(
    ring: Array<[number, number]>,
    y: number,
    color: THREE.ColorRepresentation,
    opacity: number,
  ): void {
    const pts = ring.map(point => new THREE.Vector3(point[0], y, point[1]));
    pts.push(pts[0].clone());
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    line.userData.isFloatingLane = true;
    scene.add(line);
    floatingLaneObjects.push(line);
  }

  function drawRoadCenterlineBands(overlay: Record<string, unknown>, y: number): boolean {
    const centerlines = collectRoadCenterlines(overlay);
    const bands = collectFloatingBands(overlay);
    if (!centerlines.length || !bands.length) return false;

    let drew = false;
    for (const [roadIndex, centerline] of centerlines.entries()) {
      for (const [bandIndex, band] of bands.entries()) {
        const ring = bandPolygonForCenterline(centerline, band.zCenterM, band.widthM);
        if (!ring) continue;
        const selected = (floatingLaneConfig.selectedLaneIndex ?? -1) === band.sourceIndex
          || (floatingLaneConfig.selectedLaneIndex ?? -1) === bandIndex;
        const opacity = selected
          ? Math.min(floatingLaneConfig.opacity! * 1.5, 0.9)
          : floatingLaneConfig.opacity! * (floatingLaneConfig.animated ? 0.7 + 0.3 * Math.sin(floatingLaneAnimTime * 3) : 1);
        const color = band.kind === "drive_lane" ? PER_LANE_COLORS.drive_lane : getFloatingLaneColor(band.kind);

        addFlatPolygonOverlay(ring, y, color, opacity * 0.7, {
          bandIndex: band.sourceIndex,
          bandKind: band.kind,
          bandName: band.name,
          roadId: centerline.roadId,
          overlayType: band.kind === "drive_lane" ? "lane" : "band",
        });
        if (floatingLaneConfig.showEdgeLines) {
          addFlatPolygonEdge(ring, y + 0.002, selected ? 0xffffff : color, opacity * 0.85);
        }
        if (floatingLaneConfig.showLabels && bandIndex < 8 && roadIndex % 2 === 0) {
          const cx = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
          const cz = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
          const sp = createFloatingLaneLabel(band.kind, cx, y + 1.5, cz);
          sp.userData.isFloatingLane = true;
          sp.userData.bandIndex = band.sourceIndex;
          sp.userData.roadId = centerline.roadId;
          scene.add(sp);
          floatingLaneObjects.push(sp);
        }
        drew = true;
      }
    }
    return drew;
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function createFloatingLaneLabel(kind: string, x: number, y: number, z: number, customLabel?: string): THREE.Sprite {
    const label = customLabel ?? LANE_LABELS[kind] ?? LANE_LABELS["default"];
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    roundRect(ctx, 0, 0, 256, 64, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 32);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }),
    );
    sprite.scale.set(4, 1, 1);
    sprite.position.set(x, y, z);
    sprite.userData.isFloatingLane = true;
    sprite.userData.laneLabel = label;
    return sprite;
  }

  function buildPolygonShape(points: number[][]): THREE.Shape {
    const shape = new THREE.Shape();
    if (points.length < 3) return shape;
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    return shape;
  }

  function updateAxisHud(): void {
    const ctx = axisHudEl.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    axisHudEl.width = Math.round(200 * dpr);
    axisHudEl.height = Math.round(60 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 200, 60);
    if (!floatingLaneConfig.enabled) return;

    ctx.fillStyle = "rgba(15,23,42,0.85)";
    roundRect(ctx, 0, 0, 200, 60, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const forward = cameraForwardHorizontal();
    const headingDeg = (-Math.atan2(forward.x, forward.z) * 180 / Math.PI + 360) % 360;

    ctx.fillStyle = "rgba(30,41,59,0.9)";
    ctx.beginPath();
    ctx.arc(35, 30, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < 36; i++) {
      const a = (i * 10 - headingDeg) * Math.PI / 180 - Math.PI / 2;
      const major = i % 9 === 0;
      ctx.strokeStyle = major ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(35 + Math.cos(a) * (22 - (major ? 6 : 3)), 30 + Math.sin(a) * (22 - (major ? 6 : 3)));
      ctx.lineTo(35 + Math.cos(a) * 22, 30 + Math.sin(a) * 22);
      ctx.stroke();
    }

    const dirs = [{ a: 0, l: "N", c: "#ef4444" }, { a: 90, l: "E", c: "#fff" }, { a: 180, l: "S", c: "#fff" }, { a: 270, l: "W", c: "#fff" }];
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const d of dirs) {
      const a = (d.a - headingDeg) * Math.PI / 180 - Math.PI / 2;
      ctx.fillStyle = d.c;
      ctx.fillText(d.l, 35 + Math.cos(a) * 10, 30 + Math.sin(a) * 10);
    }

    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(35, 30, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`${headingDeg.toFixed(0)}°`, 70, 22);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "11px sans-serif";
    ctx.fillText("HEADING", 70, 42);

    const b = getSceneBounds();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`X: ${b ? b.center.x.toFixed(1) : "N/A"}`, 195, 18);
    ctx.fillText(`Z: ${b ? b.center.z.toFixed(1) : "N/A"}`, 195, 32);
  }

  function disposeObject(obj: THREE.Object3D): void {
    scene.remove(obj);
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else (child.material as THREE.Material).dispose();
      }
      if (child instanceof THREE.Sprite) { child.material.map?.dispose(); child.material.dispose(); }
      if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }

  function addOrientationArrow(info: InstanceOrientationInfo, h: number): void {
    const selected = info.instanceId === selectedInstanceId;
    const color = orientationColor(info.category, selected);
    const yawRad = info.previewYawDeg * Math.PI / 180;
    const dir = new THREE.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad)).normalize();
    const origin = new THREE.Vector3(info.position[0], Math.max(info.position[1], h) + (selected ? 1.45 : 1.05), info.position[2]);
    const length = selected ? 3.2 : info.category.includes("rail") || info.category.includes("fence") ? 2.4 : 1.7;
    const end = origin.clone().add(dir.clone().multiplyScalar(length));
    const group = new THREE.Group();
    group.userData.isFloatingLane = true;
    group.userData.overlayType = "orientation";
    group.userData.instanceId = info.instanceId;

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([origin, end]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: selected ? 1 : 0.82 }),
    );
    line.userData.isFloatingLane = true;
    line.userData.overlayType = "orientation";
    line.userData.instanceId = info.instanceId;
    group.add(line);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(selected ? 0.28 : 0.2, selected ? 0.8 : 0.56, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: selected ? 1 : 0.9, depthWrite: false }),
    );
    cone.position.copy(end);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.userData.isFloatingLane = true;
    cone.userData.overlayType = "orientation";
    cone.userData.instanceId = info.instanceId;
    group.add(cone);

    if (selected) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.65, 0.78, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(info.position[0], h + 0.035, info.position[2]);
      ring.userData.isFloatingLane = true;
      ring.userData.overlayType = "orientation";
      ring.userData.instanceId = info.instanceId;
      group.add(ring);

      const label = createTextSprite(`${info.category} ${normalizeYawDeg(info.previewYawDeg).toFixed(0)}°`, color);
      label.position.set(info.position[0], origin.y + 1.05, info.position[2]);
      label.userData.isFloatingLane = true;
      label.userData.overlayType = "orientation";
      label.userData.instanceId = info.instanceId;
      group.add(label);
    }

    scene.add(group);
    floatingLaneObjects.push(group);
  }

  function clearFloatingLaneOverlay(options: { resetSelection?: boolean } = {}): void {
    floatingLaneObjects.forEach(disposeObject);
    floatingLaneObjects.length = 0;
    if (options.resetSelection) {
      floatingLaneConfig.selectedLaneIndex = -1;
      selectedInstanceId = "";
    }
    updateAxisHud();
  }

  function buildFloatingLaneOverlay(): void {
    clearFloatingLaneOverlay();
    const manifest = getManifest();
    if (!manifest?.layout_overlay) { updateAxisHud(); return; }
    updateAxisHud();

    const ov = manifest.layout_overlay;
    const summary = (manifest.summary ?? {}) as Record<string, unknown>;
    const osm = (summary.osm_geometry ?? {}) as Record<string, unknown>;
    const cwRings = (osm.carriageway_rings ?? []) as number[][][];
    const swRings = (osm.sidewalk_rings ?? []) as number[][][];
    const jns = (osm.junction_geometries ?? []) as Array<Record<string, unknown>>;
    const h = floatingLaneConfig.height ?? 0;
    const toXY = (p: number[]): number[] => [p[0], -p[1]];

    for (const ring of cwRings) {
      if (ring.length < 3) continue;
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
        new THREE.MeshBasicMaterial({ color: FLOATING_COLORS.carriageway, transparent: true, opacity: floatingLaneConfig.opacity! * 0.7, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h, 0);
      mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "road";
      scene.add(mesh); floatingLaneObjects.push(mesh);

      if (floatingLaneConfig.showEdgeLines) {
        const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h, p[1]));
        pts.push(pts[0].clone());
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: FLOATING_COLORS.carriageway, transparent: true, opacity: floatingLaneConfig.opacity! * 0.9 }));
        line.userData.isFloatingLane = true;
        scene.add(line); floatingLaneObjects.push(line);
      }
    }

    if (floatingLaneConfig.showEdgeLines) {
      for (const ring of swRings) {
        if (ring.length < 3) continue;
        const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h, p[1]));
        pts.push(pts[0].clone());
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: FLOATING_COLORS.sidewalk, transparent: true, opacity: floatingLaneConfig.opacity! * 0.8 }));
        line.userData.isFloatingLane = true;
        scene.add(line); floatingLaneObjects.push(line);
      }
    }

    for (const j of jns) {
      const normalizedPatches = (j.normalized_surface_patches ?? []) as Array<Record<string, unknown>>;
      if (normalizedPatches.length > 0) {
        for (const [pi, patch] of normalizedPatches.entries()) {
          const kind = getNormalizedSurfaceFloatingKind(patch);
          const color = getFloatingLaneColor(kind);
          const yOffset = patch.is_overlay ? 0.018 : 0.006;
          const opacityFactor = patch.is_overlay ? 0.46 : kind === "carriageway" ? 0.56 : 0.34;
          for (const [ri, ring] of ((patch.rings ?? []) as number[][][]).entries()) {
            if (ring.length < 3) continue;
            const mesh = new THREE.Mesh(
              new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * opacityFactor, depthWrite: false, side: THREE.DoubleSide }),
            );
            mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h + yOffset, 0);
            mesh.userData.isFloatingLane = true; mesh.userData.overlayType = `junction-normalized-${kind}`;
            mesh.userData.surfaceId = patch.surface_id ?? `normalized_${pi}_${ri}`;
            scene.add(mesh); floatingLaneObjects.push(mesh);

            if (floatingLaneConfig.showEdgeLines) {
              const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h + yOffset, p[1]));
              pts.push(pts[0].clone());
              const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.75 }));
              line.userData.isFloatingLane = true;
              scene.add(line); floatingLaneObjects.push(line);
            }
          }
        }
        continue;
      }

      for (const ring of (j.carriageway_core_rings ?? []) as number[][][]) {
        if (ring.length < 3) continue;
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
          new THREE.MeshBasicMaterial({ color: FLOATING_COLORS.carriageway, transparent: true, opacity: floatingLaneConfig.opacity! * 0.75, depthWrite: false, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h, 0);
        mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "junction";
        scene.add(mesh); floatingLaneObjects.push(mesh);

        if (floatingLaneConfig.showEdgeLines) {
          const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h, p[1]));
          pts.push(pts[0].clone());
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: FLOATING_COLORS.carriageway, transparent: true, opacity: floatingLaneConfig.opacity! * 0.9 }));
          line.userData.isFloatingLane = true;
          scene.add(line); floatingLaneObjects.push(line);
        }
      }

      for (const group of [
        { patches: (j.frontage_corner_patches ?? []) as Array<Record<string, unknown>>, kind: "frontage", overlayType: "junction-frontage-corner" },
        { patches: (j.nearroad_corner_patches ?? []) as Array<Record<string, unknown>>, kind: "furnishing", overlayType: "junction-nearroad-corner" },
        { patches: (j.sidewalk_corner_patches ?? []) as Array<Record<string, unknown>>, kind: "sidewalk", overlayType: "junction-sidewalk-corner" },
      ]) {
        const color = getFloatingLaneColor(group.kind);
        for (const [pi, patch] of group.patches.entries()) {
          for (const [ri, ring] of ((patch.rings ?? []) as number[][][]).entries()) {
            if (ring.length < 3) continue;
            const mesh = new THREE.Mesh(
              new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.34, depthWrite: false, side: THREE.DoubleSide }),
            );
            mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h + 0.008, 0);
            mesh.userData.isFloatingLane = true; mesh.userData.overlayType = group.overlayType;
            mesh.userData.surfaceId = patch.patch_id ?? `${group.overlayType}_${pi}_${ri}`;
            scene.add(mesh); floatingLaneObjects.push(mesh);

            if (floatingLaneConfig.showEdgeLines) {
              const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h + 0.008, p[1]));
              pts.push(pts[0].clone());
              const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.7 }));
              line.userData.isFloatingLane = true;
              scene.add(line); floatingLaneObjects.push(line);
            }
          }
        }
      }

      const hasCornerSurface = hasCornerSurfacePatches(j);
      for (const [pi, patch] of ((j.turn_lane_patches ?? []) as Array<Record<string, unknown>>).entries()) {
        if (!shouldRenderTurnLanePatch(patch, hasCornerSurface)) continue;
        const color = getFloatingLaneColor(getTurnLaneFloatingKind(patch));
        for (const [ri, ring] of ((patch.rings ?? []) as number[][][]).entries()) {
          if (ring.length < 3) continue;
          const mesh = new THREE.Mesh(
            new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.42, depthWrite: false, side: THREE.DoubleSide }),
          );
          mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h + 0.012, 0);
          mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "junction-turn-lane";
          mesh.userData.surfaceId = patch.patch_id ?? `turn_${pi}_${ri}`;
          scene.add(mesh); floatingLaneObjects.push(mesh);

          if (floatingLaneConfig.showEdgeLines) {
            const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h + 0.012, p[1]));
            pts.push(pts[0].clone());
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.8 }));
            line.userData.isFloatingLane = true;
            scene.add(line); floatingLaneObjects.push(line);
          }
        }
      }

      for (const col of [
        { p: (j.lane_surface_patches ?? []) as Array<Record<string, unknown>>, k: "lane" as const },
        { p: (j.merged_surface_patches ?? []) as Array<Record<string, unknown>>, k: "merged" as const },
      ]) {
        for (const [pi, patch] of col.p.entries()) {
          for (const [ri, ring] of ((patch.rings ?? []) as number[][][]).entries()) {
            if (ring.length < 3) continue;
            const color = col.k === "merged" ? 0x8b5cf6 : patch.flow === "outbound" ? 0xdc2626 : 0x2563eb;
            const mesh = new THREE.Mesh(
              new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * (col.k === "merged" ? 0.35 : 0.28), depthWrite: false, side: THREE.DoubleSide }),
            );
            mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h + 0.01, 0);
            mesh.userData.isFloatingLane = true; mesh.userData.overlayType = `junction-${col.k}`;
            mesh.userData.surfaceId = patch.surface_id ?? `${col.k}_${pi}_${ri}`;
            scene.add(mesh); floatingLaneObjects.push(mesh);

            if (floatingLaneConfig.showEdgeLines) {
              const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h + 0.01, p[1]));
              pts.push(pts[0].clone());
              const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.75 }));
              line.userData.isFloatingLane = true;
              scene.add(line); floatingLaneObjects.push(line);
            }
          }
        }
      }
    }

    {
      const bh = h + 0.02;
      if (!drawRoadCenterlineBands(ov as Record<string, unknown>, bh)) {
        let rMinX: number, rMaxX: number, rCenterZ = 0;

        if (cwRings.length > 0) {
          let rmi = Infinity, rma = -Infinity, zmi = Infinity, zma = -Infinity;
          for (const ring of cwRings) for (const p of ring) { rmi = Math.min(rmi, p[0]); rma = Math.max(rma, p[0]); zmi = Math.min(zmi, p[1]); zma = Math.max(zma, p[1]); }
          for (const j of jns) for (const ring of (j.carriageway_core_rings ?? []) as number[][][]) for (const p of ring) { rmi = Math.min(rmi, p[0]); rma = Math.max(rma, p[0]); zmi = Math.min(zmi, p[1]); zma = Math.max(zma, p[1]); }
          rMinX = rmi; rMaxX = rma; rCenterZ = (zmi + zma) / 2;
        } else if (manifest?.scene_bounds) {
          const sb = manifest.scene_bounds;
          rMinX = sb.center[0] - sb.size[0] / 2; rMaxX = sb.center[0] + sb.size[0] / 2; rCenterZ = sb.center[2];
        } else {
          const half = (finiteNumber(ov.length_m) ?? 100) / 2;
          rMinX = -half; rMaxX = half; rCenterZ = 0;
        }

        const laneCount = Math.max(1, Math.round(finiteNumber(ov.lane_count) ?? 1));
        const fallbackBands = collectFloatingBands(ov as Record<string, unknown>);
        for (const band of fallbackBands) {
          const selected = (floatingLaneConfig.selectedLaneIndex ?? -1) === band.sourceIndex;
          const opacity = selected
            ? Math.min(floatingLaneConfig.opacity! * 1.5, 0.9)
            : floatingLaneConfig.opacity! * (floatingLaneConfig.animated ? 0.7 + 0.3 * Math.sin(floatingLaneAnimTime * 3) : 1);
          const laneSplits = band.kind === "carriageway" && laneCount > 1
            ? Array.from({ length: laneCount }, (_, index) => ({
                kind: "drive_lane",
                widthM: band.widthM / laneCount,
                zCenterM: band.zCenterM - band.widthM / 2 + (band.widthM / laneCount) * (index + 0.5),
                label: `车道 ${index + 1}`,
              }))
            : [{ kind: band.kind, widthM: band.widthM, zCenterM: band.zCenterM, label: undefined }];

          for (const split of laneSplits) {
            const bZ = rCenterZ + split.zCenterM;
            const halfWidth = split.widthM / 2;
            const ring: Array<[number, number]> = [
              [rMinX, bZ - halfWidth],
              [rMaxX, bZ - halfWidth],
              [rMaxX, bZ + halfWidth],
              [rMinX, bZ + halfWidth],
            ];
            const color = split.kind === "drive_lane" ? PER_LANE_COLORS.drive_lane : getFloatingLaneColor(split.kind);
            addFlatPolygonOverlay(ring, bh, color, opacity * 0.7, {
              bandIndex: band.sourceIndex,
              bandKind: split.kind,
              overlayType: split.kind === "drive_lane" ? "lane" : "band",
            });
            if (floatingLaneConfig.showEdgeLines) {
              addFlatPolygonEdge(ring, bh + 0.002, selected ? 0xffffff : color, opacity * 0.85);
            }
            if (floatingLaneConfig.showLabels) {
              const sp = createFloatingLaneLabel(split.kind, (rMinX + rMaxX) / 2, bh + 1.5, bZ, split.label);
              sp.userData.isFloatingLane = true;
              sp.userData.bandIndex = band.sourceIndex;
              scene.add(sp);
              floatingLaneObjects.push(sp);
            }
          }
        }
      }
    }

    if (floatingLaneConfig.showBuildings) {
      for (let i = 0; i < (ov.building_footprints ?? []).length; i++) {
        const fp = ov.building_footprints![i];
        const pts = fp.polygon_xz;
        if (!Array.isArray(pts) || pts.length < 3) continue;

        const lu = (fp.land_use_type as string)?.toLowerCase() ?? "";
        const ck = lu.includes("residential") ? "building_residential" : lu.includes("commercial") ? "building_commercial" : lu.includes("industrial") ? "building_industrial" : "building";
        const col = FLOATING_COLORS[ck] ?? FLOATING_COLORS.building;

        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(buildPolygonShape(pts.map(p => [p[0], -p[1]]))),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: floatingLaneConfig.buildingOpacity, depthWrite: false, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h, 0);
        mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "building"; mesh.userData.buildingIndex = i;
        scene.add(mesh); floatingLaneObjects.push(mesh);

        if (floatingLaneConfig.showEdgeLines) {
          const pts3: THREE.Vector3[] = pts.map(p => new THREE.Vector3(p[0], h, p[1]));
          pts3.push(pts3[0].clone());
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: floatingLaneConfig.buildingOpacity! * 1.2 }));
          line.userData.isFloatingLane = true;
          scene.add(line); floatingLaneObjects.push(line);
        }

        if (floatingLaneConfig.showLabels && fp.centroid_xz) {
          const c = fp.centroid_xz as [number, number];
          const sp = createFloatingLaneLabel("building", c[0], h + 2, c[1]);
          sp.userData.isFloatingLane = true; sp.userData.buildingIndex = i;
          scene.add(sp); floatingLaneObjects.push(sp);
        }
      }
    }

    const insts = getManifest()?.instances;
    if (floatingLaneConfig.showFeatures && insts) {
      const fCats = ["tree", "lamp", "bench", "trash", "bollard", "bus_stop"];
      for (const [instanceId, info] of Object.entries(insts)) {
        const ii = info as { category?: string; position_xyz?: [number, number, number] };
        const iid = String((info as Record<string, unknown>).instance_id ?? (info as Record<string, unknown>).id ?? instanceId);
        if (!ii.position_xyz) continue;
        const cat = String(ii.category || "").toLowerCase();
        if (!fCats.includes(cat)) continue;

        const [x, , z] = ii.position_xyz;
        const col = FLOATING_COLORS[cat] ?? FLOATING_COLORS.default;
        const r = cat === "tree" ? 1.5 : 0.5;

        const mesh = new THREE.Mesh(
          new THREE.CircleGeometry(r, 16),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: floatingLaneConfig.featureOpacity, depthWrite: false, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, h, z);
        mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "feature"; mesh.userData.featureCategory = cat;
        mesh.userData.instanceId = iid;
        scene.add(mesh); floatingLaneObjects.push(mesh);

        if (floatingLaneConfig.showLabels) {
          const sp = createFloatingLaneLabel(cat, x, h + 1, z);
          sp.userData.isFloatingLane = true; sp.userData.featureCategory = cat;
          sp.userData.instanceId = iid;
          scene.add(sp); floatingLaneObjects.push(sp);
        }
      }
    }

    if (floatingLaneConfig.showPlacementMarkers && insts) {
      const geo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8);
      for (const [instanceId, info] of Object.entries(insts)) {
        const ii = info as { category?: string; position_xyz?: [number, number, number] };
        const iid = String((info as Record<string, unknown>).instance_id ?? (info as Record<string, unknown>).id ?? instanceId);
        const cat = String(ii.category || "").trim().toLowerCase();
        const col = CATEGORY_COLORS[cat] ?? 0x38bdf8;

        const marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
        if (ii.position_xyz) marker.position.set(ii.position_xyz[0], (ii.position_xyz[1] || 0) + 0.6, ii.position_xyz[2]);
        marker.userData.isFloatingLane = true; marker.userData.overlayType = "marker";
        marker.userData.instanceId = iid;
        scene.add(marker); floatingLaneObjects.push(marker);

        const label = createTextSprite(cat, col);
        label.position.set(marker.position.x, marker.position.y + 1.2, marker.position.z);
        label.userData.isFloatingLane = true;
        label.userData.instanceId = iid;
        scene.add(label); floatingLaneObjects.push(label);
      }
    }

    if (showOrientationArrows) {
      const infos = collectInstanceOrientationInfos();
      if (!selectedInstanceId && infos.length > 0) selectedInstanceId = infos[0].instanceId;
      for (const info of infos) addOrientationArrow(info, h);
    }

    renderOrientationInspector();
  }

  function updateFloatingLaneOverlay(deltaTime: number): void {
    if (!floatingLaneConfig.enabled || !floatingLaneConfig.animated) return;
    floatingLaneAnimTime += deltaTime;
    buildFloatingLaneOverlay();
  }

  function updateControlPanelVisibility(): void {
    const panel = document.getElementById("floating-lane-panel");
    if (panel) {
      // The controls live in Settings, so the enable switch must remain
      // reachable while the overlay itself is off.
      panel.style.display = "block";
      panel.dataset.enabled = String(floatingLaneConfig.enabled);
    }
  }

  function setSelectedInstance(instanceId: string): void {
    if (selectedInstanceId === instanceId) {
      renderOrientationInspector();
      return;
    }
    selectedInstanceId = instanceId;
    const info = selectedOrientationInfo();
    if (info) orientationCategoryFilter = orientationCategoryFilter === "all" ? "all" : info.category;
    buildFloatingLaneOverlay();
    renderOrientationInspector();
  }

  function adjustSelectedYaw(deltaDeg: number): void {
    const info = selectedOrientationInfo();
    if (!info) return;
    orientationYawOverrides.set(info.instanceId, normalizeYawDeg(info.previewYawDeg + deltaDeg));
    buildFloatingLaneOverlay();
    renderOrientationInspector();
  }

  function resetSelectedYaw(): void {
    const info = selectedOrientationInfo();
    if (!info) return;
    orientationYawOverrides.delete(info.instanceId);
    buildFloatingLaneOverlay();
    renderOrientationInspector();
  }

  async function copySelectedOrientation(): Promise<void> {
    const info = selectedOrientationInfo();
    const status = document.getElementById("flp-orientation-copy-status");
    if (!info) return;
    const payload = JSON.stringify(orientationPayload(info), null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      if (status) status.textContent = text("Copied", "已复制");
    } catch {
      const textArea = document.getElementById("flp-orientation-payload") as HTMLTextAreaElement | null;
      textArea?.select();
      if (status) status.textContent = text("Select text to copy", "请选择文本后复制");
    }
  }

  function renderOrientationInspector(): void {
    const host = document.getElementById("flp-orientation-inspector");
    if (!host) return;

    const allInfos = collectInstanceOrientationInfos();
    const categories = Array.from(new Set(allInfos.map(info => info.category))).sort();
    if (orientationCategoryFilter !== "all" && !categories.includes(orientationCategoryFilter)) {
      orientationCategoryFilter = "all";
    }
    const filtered = filteredOrientationInfos();
    if (selectedInstanceId && !allInfos.some(info => info.instanceId === selectedInstanceId)) selectedInstanceId = "";
    if (!selectedInstanceId && filtered.length) selectedInstanceId = filtered[0].instanceId;
    if (filtered.length && !filtered.some(info => info.instanceId === selectedInstanceId)) {
      selectedInstanceId = filtered[0].instanceId;
    }

    const selected = selectedOrientationInfo();
    if (!allInfos.length) {
      host.innerHTML = `<div class="flp-empty">${text("No model instances with position data.", "没有包含位置数据的模型实例。")}</div>`;
      return;
    }

    const payloadText = selected ? JSON.stringify(orientationPayload(selected), null, 2) : "";
    host.innerHTML = `
      <label class="flp-checkbox">
        <input type="checkbox" id="flp-orientation-enabled" ${showOrientationArrows ? "checked" : ""}>
        ${text("Show orientation arrows", "显示朝向箭头")}
      </label>
      <div class="flp-orientation-grid">
        <label>
          ${text("Category", "类别")}
          <select id="flp-orientation-category">
            <option value="all" ${orientationCategoryFilter === "all" ? "selected" : ""}>${text("All", "全部")} (${allInfos.length})</option>
            ${categories.map(category => `
              <option value="${escapeHtml(category)}" ${orientationCategoryFilter === category ? "selected" : ""}>
                ${escapeHtml(category)} (${allInfos.filter(info => info.category === category).length})
              </option>
            `).join("")}
          </select>
        </label>
        <label>
          ${text("Model instance", "模型实例")}
          <select id="flp-orientation-instance">
            ${filtered.map(info => `
              <option value="${escapeHtml(info.instanceId)}" ${selected?.instanceId === info.instanceId ? "selected" : ""}>
                ${escapeHtml(info.category)} · ${escapeHtml(info.instanceId)}
              </option>
            `).join("")}
          </select>
        </label>
      </div>
      <div class="flp-orientation-summary">
        <div><span>ID</span><strong>${escapeHtml(selected?.instanceId ?? "-")}</strong></div>
        <div><span>${text("Asset", "资产")}</span><strong>${escapeHtml(selected?.assetId || "-")}</strong></div>
        <div><span>${text("Yaw", "偏航角")}</span><strong>${selected ? `${normalizeYawDeg(selected.previewYawDeg).toFixed(1)}°` : "-"}</strong></div>
        <div><span>${text("Delta", "变化")}</span><strong>${selected ? `${normalizeYawDeg(selected.previewYawDeg - selected.yawDeg).toFixed(1)}°` : "-"}</strong></div>
      </div>
      <div class="flp-orientation-actions">
        <button type="button" data-yaw-delta="-90">-90°</button>
        <button type="button" data-yaw-delta="90">+90°</button>
        <button type="button" data-yaw-delta="180">${text("Flip", "翻转")}</button>
        <button type="button" id="flp-orientation-reset">${text("Reset", "重置")}</button>
      </div>
      <textarea id="flp-orientation-payload" readonly>${escapeHtml(payloadText)}</textarea>
      <div class="flp-orientation-copy-row">
        <button type="button" id="flp-orientation-copy">${text("Copy parameters", "复制参数")}</button>
        <span id="flp-orientation-copy-status"></span>
      </div>
    `;

    document.getElementById("flp-orientation-enabled")?.addEventListener("change", (event) => {
      showOrientationArrows = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });
    document.getElementById("flp-orientation-category")?.addEventListener("change", (event) => {
      orientationCategoryFilter = (event.target as HTMLSelectElement).value;
      const next = filteredOrientationInfos()[0];
      selectedInstanceId = next?.instanceId ?? "";
      buildFloatingLaneOverlay();
      renderOrientationInspector();
    });
    document.getElementById("flp-orientation-instance")?.addEventListener("change", (event) => {
      selectedInstanceId = (event.target as HTMLSelectElement).value;
      buildFloatingLaneOverlay();
      renderOrientationInspector();
    });
    host.querySelectorAll<HTMLButtonElement>("[data-yaw-delta]").forEach((button) => {
      button.addEventListener("click", () => adjustSelectedYaw(Number(button.dataset.yawDelta ?? 0)));
    });
    document.getElementById("flp-orientation-reset")?.addEventListener("click", resetSelectedYaw);
    document.getElementById("flp-orientation-copy")?.addEventListener("click", () => { void copySelectedOrientation(); });
  }

  function mountControlPanel(): void {
    const panelId = "floating-lane-panel";
    let panel = document.getElementById(panelId) as HTMLDivElement | null;
    if (!panel) {
      panelHost.innerHTML = "";
      panel = document.createElement("div");
      panel.id = panelId;
      panel.className = "floating-lane-panel";
      panelHost.appendChild(panel);
    }
    panel.innerHTML = `
      <div class="flp-section">
        <label>${text("Controls", "控制")}</label>
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-enabled" ${floatingLaneConfig.enabled ? "checked" : ""}>
          ${text("Enable overlay", "启用叠加层")}
        </label>
      </div>
      <div class="flp-slider-group">
        <label>${text("Height", "高度")}: <span id="flp-height-val">${(floatingLaneConfig.height ?? 0.5).toFixed(1)}m</span></label>
        <input type="range" id="flp-height" min="0.1" max="3" step="0.1" value="${floatingLaneConfig.height ?? 0.5}">
      </div>
      <div class="flp-slider-group">
        <label>${text("Road opacity", "道路透明度")}: <span id="flp-opacity-val">${(floatingLaneConfig.opacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.opacity}">
      </div>
      <div class="flp-section">
        <label>${text("Visible elements", "可见元素")}</label>
        <div class="flp-checkboxes-row">
          <label class="flp-checkbox">
            <input type="checkbox" id="flp-buildings" ${floatingLaneConfig.showBuildings ? "checked" : ""}>
            ${text("Buildings", "建筑")}
          </label>
          <label class="flp-checkbox">
            <input type="checkbox" id="flp-features" ${floatingLaneConfig.showFeatures ? "checked" : ""}>
            ${text("Features (trees)", "要素（树木）")}
          </label>
        </div>
      </div>
      <div class="flp-slider-group" id="flp-building-opacity-group">
        <label>${text("Building opacity", "建筑透明度")}: <span id="flp-building-opacity-val">${(floatingLaneConfig.buildingOpacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-building-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.buildingOpacity}">
      </div>
      <div class="flp-slider-group" id="flp-feature-opacity-group">
        <label>${text("Feature opacity", "要素透明度")}: <span id="flp-feature-opacity-val">${(floatingLaneConfig.featureOpacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-feature-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.featureOpacity}">
      </div>
      <div class="flp-section">
        <label>${text("Visible lane types", "可见车道类型")}</label>
        <div class="flp-checkboxes" id="flp-lane-kinds">
          ${["carriageway", "drive_lane", "bike_lane", "bus_lane", "clear_path", "furnishing", "sidewalk", "greenzone"].map(kind => `
            <label class="flp-checkbox">
              <input type="checkbox" data-kind="${kind}" ${visibleLaneKinds.has(kind) ? "checked" : ""}>
              ${laneLabel(kind)}
            </label>
          `).join("")}
        </div>
      </div>
      <div class="flp-section">
        <label>${text("Color scheme", "配色方案")}</label>
        <select id="flp-color-scheme">
          <option value="semantic" ${floatingLaneConfig.colorScheme === "semantic" ? "selected" : ""}>${text("Semantic", "语义")}</option>
          <option value="functional" ${floatingLaneConfig.colorScheme === "functional" ? "selected" : ""}>${text("Functional", "功能")}</option>
          <option value="safety" ${floatingLaneConfig.colorScheme === "safety" ? "selected" : ""}>${text("Safety", "安全")}</option>
        </select>
      </div>
      <div class="flp-checkboxes-row">
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-edges" ${floatingLaneConfig.showEdgeLines ? "checked" : ""}>
          ${text("Edge lines", "边界线")}
        </label>
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-labels" ${floatingLaneConfig.showLabels ? "checked" : ""}>
          ${text("Labels", "标签")}
        </label>
      </div>
      <label class="flp-checkbox">
        <input type="checkbox" id="flp-animated" ${floatingLaneConfig.animated ? "checked" : ""}>
        ${text("Animated pulse", "动态脉冲")}
      </label>
      <div class="flp-section">
        <label>${text("Model orientation", "模型朝向")}</label>
        <div id="flp-orientation-inspector"></div>
      </div>
      <div class="flp-hint">${text("Press L to toggle the overlay.", "按 L 键切换叠加层。")}</div>
    `;

    document.getElementById("flp-enabled")?.addEventListener("change", (event) => {
      floatingLaneConfig.enabled = (event.target as HTMLInputElement).checked;
      layoutOverlayToggleEl.checked = floatingLaneConfig.enabled;
      if (floatingLaneConfig.enabled) {
        buildFloatingLaneOverlay();
      } else {
        clearFloatingLaneOverlay();
      }
      updateControlPanelVisibility();
    });

    document.getElementById("flp-height")?.addEventListener("input", (event) => {
      floatingLaneConfig.height = parseFloat((event.target as HTMLInputElement).value);
      document.getElementById("flp-height-val")!.textContent = `${floatingLaneConfig.height.toFixed(1)}m`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-opacity")?.addEventListener("input", (event) => {
      floatingLaneConfig.opacity = parseFloat((event.target as HTMLInputElement).value);
      document.getElementById("flp-opacity-val")!.textContent = `${(floatingLaneConfig.opacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-color-scheme")?.addEventListener("change", (event) => {
      floatingLaneConfig.colorScheme = (event.target as HTMLSelectElement).value as "semantic" | "functional" | "safety";
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-edges")?.addEventListener("change", (event) => {
      floatingLaneConfig.showEdgeLines = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-labels")?.addEventListener("change", (event) => {
      floatingLaneConfig.showLabels = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-animated")?.addEventListener("change", (event) => {
      floatingLaneConfig.animated = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-buildings")?.addEventListener("change", (event) => {
      floatingLaneConfig.showBuildings = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-features")?.addEventListener("change", (event) => {
      floatingLaneConfig.showFeatures = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-building-opacity")?.addEventListener("input", (event) => {
      floatingLaneConfig.buildingOpacity = parseFloat((event.target as HTMLInputElement).value);
      document.getElementById("flp-building-opacity-val")!.textContent = `${(floatingLaneConfig.buildingOpacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-feature-opacity")?.addEventListener("input", (event) => {
      floatingLaneConfig.featureOpacity = parseFloat((event.target as HTMLInputElement).value);
      document.getElementById("flp-feature-opacity-val")!.textContent = `${(floatingLaneConfig.featureOpacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-lane-kinds")?.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (!target.dataset.kind) return;
      if (target.checked) {
        visibleLaneKinds.add(target.dataset.kind);
      } else {
        visibleLaneKinds.delete(target.dataset.kind);
      }
      buildFloatingLaneOverlay();
    });

    updateControlPanelVisibility();
    renderOrientationInspector();
  }

  function toggleFloatingLaneOverlay(): void {
    floatingLaneConfig.enabled = !floatingLaneConfig.enabled;
    layoutOverlayToggleEl.checked = floatingLaneConfig.enabled;
    const enabledEl = document.getElementById("flp-enabled") as HTMLInputElement | null;
    if (enabledEl) enabledEl.checked = floatingLaneConfig.enabled;
    if (floatingLaneConfig.enabled) {
      buildFloatingLaneOverlay();
      mountControlPanel();
    } else {
      clearFloatingLaneOverlay({ resetSelection: true });
      updateControlPanelVisibility();
    }
  }

  function selectFloatingLane(bandIndex: number): void {
    if (floatingLaneConfig.selectedLaneIndex === bandIndex) return;
    floatingLaneConfig.selectedLaneIndex = bandIndex;
    buildFloatingLaneOverlay();
  }

  return {
    get config() { return floatingLaneConfig; },
    buildOverlay: buildFloatingLaneOverlay,
    clearOverlay: () => clearFloatingLaneOverlay({ resetSelection: true }),
    updateAnimation: updateFloatingLaneOverlay,
    toggleOverlay: toggleFloatingLaneOverlay,
    selectLane: selectFloatingLane,
    selectInstance: setSelectedInstance,
    mountControlPanel,
    getLaneLabel: laneLabel,
  };
}
