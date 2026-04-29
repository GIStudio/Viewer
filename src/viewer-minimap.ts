/**
 * Minimap utilities for the RoadGen3D Viewer.
 * 
 * Handles minimap rendering, camera updates, and overlay drawing.
 */

import * as THREE from "three";
import { clamp } from "./viewer-utils";
import type { ViewerManifest } from "./viewer-types";

export interface SceneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  center: THREE.Vector3;
  extent: number;
}

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

/**
 * Update minimap camera to follow avatar.
 */
export function updateMinimapCamera(
  camera: THREE.OrthographicCamera,
  bounds: SceneBounds,
  box: THREE.Box3,
): void {
  camera.left = -bounds.extent;
  camera.right = bounds.extent;
  camera.top = bounds.extent;
  camera.bottom = -bounds.extent;
  camera.near = 0.1;
  camera.far = Math.max(500, box.max.y - box.min.y + bounds.extent * 8);
  camera.position.set(bounds.center.x, box.max.y + bounds.extent * 2.2 + 10, bounds.center.z);
  camera.lookAt(bounds.center.x, 0, bounds.center.z);
  camera.updateProjectionMatrix();
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

/**
 * Render minimap with scene overview.
 */
export function renderMinimap(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.OrthographicCamera,
  root: THREE.Object3D | null,
  bounds: SceneBounds | null,
  overlayCanvas: HTMLCanvasElement,
  avatarPosition: THREE.Vector3,
  cameraForwardHorizontal: () => THREE.Vector3,
  laserHitPoint: THREE.Vector3 | null,
): void {
  if (!root || !bounds) {
    return;
  }
  renderer.render(scene, camera);
  drawMinimapOverlay(overlayCanvas, bounds, avatarPosition, cameraForwardHorizontal, laserHitPoint);
}
