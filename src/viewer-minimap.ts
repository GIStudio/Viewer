/**
 * Minimap utilities for the RoadGen3D Viewer.
 * 
 * Handles a stable semantic plan view and its dynamic camera overlay.
 */

import * as THREE from "three";
import { clamp } from "./viewer-utils";
import type { ViewerManifest } from "./viewer-types";
import {
  extractFinalSurfaceTriangles,
  SURFACE_ROLE_ORDER,
  SURFACE_ROLE_PALETTE,
  type CameraSurfaceDiagnosticTriangle,
} from "./viewer-camera-surface-diagnostic";

export interface SceneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  center: THREE.Vector3;
  extent: number;
}

export type MinimapSurfacePlan = {
  triangles: CameraSurfaceDiagnosticTriangle[];
  classificationWarnings: string[];
};

/**
 * Calculate scene bounds from a Box3.
 */
export function sceneBoundsFromBox(box: THREE.Box3): SceneBounds {
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

function asTriplet(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const triplet = value.slice(0, 3).map(Number);
  return triplet.every(Number.isFinite) ? [triplet[0], triplet[1], triplet[2]] : null;
}

export function sceneBoundsFromManifest(box: THREE.Box3, manifest: ViewerManifest | null): SceneBounds {
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

export function buildMinimapSurfacePlan(
  root: THREE.Object3D,
  manifest: ViewerManifest | null,
  bounds: SceneBounds,
): MinimapSurfacePlan {
  const extraction = extractFinalSurfaceTriangles(root, manifest, [
    bounds.minX,
    bounds.minZ,
    bounds.maxX,
    bounds.maxZ,
  ]);
  return {
    triangles: extraction.triangles,
    classificationWarnings: extraction.classification_warnings,
  };
}

export function resizeMinimapCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  dpr = Math.min(window.devicePixelRatio, 2),
): boolean {
  if (cssWidth <= 0 || cssHeight <= 0) return false;
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  const changed = canvas.width !== width || canvas.height !== height;
  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  return changed;
}

/**
 * Convert world coordinates to minimap coordinates.
 */
export function worldToMinimap(
  worldX: number,
  worldZ: number,
  bounds: SceneBounds,
  minimapWidth: number,
  minimapHeight: number,
): { x: number; y: number } {
  const u = clamp((worldX - bounds.minX) / (bounds.maxX - bounds.minX), 0, 1);
  const v = clamp((worldZ - bounds.minZ) / (bounds.maxZ - bounds.minZ), 0, 1);
  return {
    x: u * minimapWidth,
    y: v * minimapHeight,
  };
}

export function minimapToWorld(
  minimapX: number,
  minimapY: number,
  bounds: SceneBounds | null,
  canvas: HTMLCanvasElement,
): { x: number; z: number } | null {
  if (!bounds) return null;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) return null;
  const u = clamp(minimapX / width, 0, 1);
  const v = clamp(minimapY / height, 0, 1);
  return {
    x: bounds.minX + u * (bounds.maxX - bounds.minX),
    z: bounds.minZ + v * (bounds.maxZ - bounds.minZ),
  };
}

/** Draw the actual loaded GLB top faces with a fixed semantic palette. */
export function drawMinimapSurfacePlan(
  canvas: HTMLCanvasElement,
  bounds: SceneBounds | null,
  plan: MinimapSurfacePlan | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  if (cssWidth <= 0 || cssHeight <= 0) return;
  const dpr = width / Math.max(cssWidth, 1);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#F3F0E7";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = "rgba(16,45,58,0.08)";
  ctx.lineWidth = 0.75;
  const grid = 24;
  for (let x = grid; x < cssWidth; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cssHeight); ctx.stroke();
  }
  for (let y = grid; y < cssHeight; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); ctx.stroke();
  }
  if (bounds && plan) {
    const triangles = [...plan.triangles].sort(
      (a, b) => SURFACE_ROLE_ORDER[a.surface_role] - SURFACE_ROLE_ORDER[b.surface_role],
    );
    for (const triangle of triangles) {
      const points = triangle.points_xz.map(([x, z]) => worldToMinimap(x, z, bounds, cssWidth, cssHeight));
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.lineTo(points[2].x, points[2].y);
      ctx.closePath();
      const building = triangle.surface_role === "building";
      if (!building) {
        ctx.fillStyle = triangle.qa_flags.length > 0 ? "#DF654F" : SURFACE_ROLE_PALETTE[triangle.surface_role];
        ctx.globalAlpha = triangle.surface_role === "context_ground" ? 0.55 : 0.96;
        ctx.fill();
      }
      if (building || triangle.qa_flags.length > 0) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = triangle.qa_flags.length > 0 ? "#B42318" : SURFACE_ROLE_PALETTE.building;
        ctx.lineWidth = triangle.qa_flags.length > 0 ? 1.5 : 0.9;
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#102D3A";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);
  ctx.restore();
}

/**
 * Draw minimap overlay with avatar position and direction.
 */
export function drawMinimapOverlay(
  canvas: HTMLCanvasElement,
  bounds: SceneBounds | null,
  avatarPosition: THREE.Vector3,
  cameraForwardHorizontal: () => THREE.Vector3,
  laserHitPoint: THREE.Vector3 | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  if (!bounds || cssWidth <= 0 || cssHeight <= 0) {
    return;
  }

  const dpr = width / Math.max(cssWidth, 1);
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.strokeStyle = "rgba(15, 23, 42, 0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);

  const camPos = worldToMinimap(
    avatarPosition.x,
    avatarPosition.z,
    bounds,
    cssWidth,
    cssHeight,
  );

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

  if (laserHitPoint) {
    const hitPoint = worldToMinimap(laserHitPoint.x, laserHitPoint.z, bounds, cssWidth, cssHeight);
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

  ctx.restore();
}

/** Draw only the frequently changing camera/laser overlay. */
export function renderMinimap(
  bounds: SceneBounds | null,
  overlayCanvas: HTMLCanvasElement,
  avatarPosition: THREE.Vector3,
  cameraForwardHorizontal: () => THREE.Vector3,
  laserHitPoint: THREE.Vector3 | null,
): void {
  drawMinimapOverlay(overlayCanvas, bounds, avatarPosition, cameraForwardHorizontal, laserHitPoint);
}
