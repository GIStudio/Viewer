/**
 * Minimap utilities for the RoadGen3D Viewer.
 * 
 * Handles minimap rendering, camera updates, and overlay drawing.
 */

import * as THREE from "three";
import { clamp } from "./viewer-utils";

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
  const min = box.min;
  const max = box.max;
  const center = new THREE.Vector3().lerpVectors(min, max, 0.5);
  const extent = Math.max(max.x - min.x, max.z - min.z, 1);
  
  return {
    minX: min.x,
    maxX: max.x,
    minZ: min.z,
    maxZ: max.z,
    center,
    extent,
  };
}

/**
 * Update minimap camera to follow avatar.
 */
export function updateMinimapCamera(
  camera: THREE.OrthographicCamera,
  bounds: SceneBounds,
  avatarPosition: THREE.Vector3,
  aspect: number = 1,
): void {
  const viewSize = bounds.extent * 0.5;
  
  camera.left = -viewSize * aspect;
  camera.right = viewSize * aspect;
  camera.top = viewSize;
  camera.bottom = -viewSize;
  camera.position.set(avatarPosition.x, 50, avatarPosition.z);
  camera.lookAt(avatarPosition.x, 0, avatarPosition.z);
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
): { x: number; z: number } {
  const x = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * minimapWidth;
  const z = ((worldZ - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * minimapHeight;
  return { x, z };
}

/**
 * Draw minimap overlay with avatar position and direction.
 */
export function drawMinimapOverlay(
  canvas: HTMLCanvasElement,
  bounds: SceneBounds,
  avatarPosition: THREE.Vector3,
  avatarDirection: THREE.Vector3,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);
  
  const { x: avatarX, z: avatarZ } = worldToMinimap(
    avatarPosition.x,
    avatarPosition.z,
    bounds,
    width,
    height,
  );

  // Draw avatar direction indicator
  ctx.save();
  ctx.translate(avatarX, height - avatarZ);
  ctx.rotate(Math.atan2(avatarDirection.x, avatarDirection.z));
  
  // Draw arrow
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(-6, 6);
  ctx.lineTo(6, 6);
  ctx.closePath();
  ctx.fillStyle = "#2563eb";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Render minimap with scene overview.
 */
export function renderMinimap(
  canvas: HTMLCanvasElement,
  bounds: SceneBounds,
  sceneObjects: Array<{ position: THREE.Vector3; color: number }>,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  
  // Clear
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);
  
  // Draw scene objects
  for (const obj of sceneObjects) {
    const { x, z } = worldToMinimap(
      obj.position.x,
      obj.position.z,
      bounds,
      width,
      height,
    );
    
    ctx.fillStyle = `#${obj.color.toString(16).padStart(6, "0")}`;
    ctx.fillRect(x - 2, height - z - 2, 4, 4);
  }
}
