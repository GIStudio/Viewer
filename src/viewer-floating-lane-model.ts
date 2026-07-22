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

export const FLOATING_COLORS: Record<string, number> = {
  carriageway: 0x3b82f6, drive_lane: 0x60a5fa, bike_lane: 0x22c55e, bus_lane: 0xf59e0b,
  parking_lane: 0x6b7280, clear_path: 0xfaf5e6, furnishing: 0x92400e, sidewalk: 0xd4c4a8,
  median: 0xf97316, greenzone: 0x16a34a, buffer: 0x8b5cf6, frontage: 0x06b6d4,
  shared: 0xa78bfa, default: 0x94a3b8, building: 0x9ca3af,
  building_residential: 0x60a5fa, building_commercial: 0xf59e0b, building_industrial: 0x6b7280,
};

export const SAFETY_COLORS: Record<string, number> = {
  carriageway: 0xef4444, bike_lane: 0x22c55e, clear_path: 0x22c55e, sidewalk: 0x22c55e,
  furnishing: 0xeab308, default: 0x94a3b8,
};

export const LANE_LABELS: Record<string, string> = {
  carriageway: "机动车道", drive_lane: "行车道", bike_lane: "自行车道", bus_lane: "公交专用",
  parking_lane: "停车带", clear_path: "人行区", furnishing: "设施带", sidewalk: "人行道",
  median: "中央分隔带", greenzone: "绿化带", buffer: "缓冲带", frontage: "退缩带",
  shared: "共享街道", default: "道路", building: "建筑",
};

export const LANE_LABELS_EN: Record<string, string> = {
  carriageway: "Carriageway", drive_lane: "Drive lane", bike_lane: "Bike lane", bus_lane: "Bus lane",
  parking_lane: "Parking", clear_path: "Pedestrian zone", furnishing: "Furnishing zone", sidewalk: "Sidewalk",
  median: "Median", greenzone: "Green belt", buffer: "Buffer", frontage: "Setback",
  shared: "Shared street", default: "Road", building: "Building",
};

export const CATEGORY_COLORS: Record<string, number> = {
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

export type InstanceOrientationInfo = {
  instanceId: string;
  assetId: string;
  category: string;
  position: [number, number, number];
  yawDeg: number;
  previewYawDeg: number;
};

export type RoadCenterlineOverlay = {
  roadId: string;
  points: Array<[number, number]>;
};

export type FloatingBandOverlay = {
  sourceIndex: number;
  kind: string;
  name: string;
  side: string;
  widthM: number;
  zCenterM: number;
};

export const ROAD_CENTERLINE_END_EXTENSION_M = 5.5;

export function finiteNumber(value: unknown): number | null {
  if (typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function pointXz(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = finiteNumber(value[0]);
  const z = finiteNumber(value[1]);
  return x === null || z === null ? null : [x, z];
}
