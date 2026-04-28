/**
 * Hit detection and info card utilities for the RoadGen3D Viewer.
 * 
 * Handles raycasting, hit descriptor resolution, and info card display.
 */

import * as THREE from "three";
import type { StaticObjectDescription, InstanceInfo, AssetDescription } from "./viewer-types";

export interface HitDescriptor {
  kind: "instance" | "static" | "generic";
  nodeName: string;
  instanceId?: string;
  instanceInfo?: InstanceInfo;
  assetDescription?: AssetDescription;
  staticDescription?: StaticObjectDescription;
  hitPoint?: THREE.Vector3;
  point?: THREE.Vector3;
  assetInfo?: Record<string, unknown>;
  distance?: number;
  category?: string;
  object?: THREE.Object3D;
}

// InstanceInfo and AssetDescription types are imported from viewer-types.ts

/**
 * Resolve hit descriptor from raycast hit.
 */
export function resolveHitDescriptor(
  hit: THREE.Intersection,
  instances?: InstanceInfo[],
  assetDescriptions?: Record<string, AssetDescription>,
): HitDescriptor | null {
  const object = hit.object;
  const point = hit.point!;
  const distance = hit.distance!;

  // Check for instance ID in userData
  const instanceId = object.userData?.instanceId || object.userData?.instance_id;
  const category = object.userData?.category;
  
  // Find asset info
  let assetInfo: Record<string, unknown> | undefined;
  if (instanceId && instances) {
    const instance = instances.find((inst) => inst.instance_id === instanceId);
    if (instance) {
      assetInfo = instance as unknown as Record<string, unknown>;
      if (instance.asset_id && assetDescriptions) {
        const desc = assetDescriptions[instance.asset_id];
        if (desc) {
          assetInfo = { ...assetInfo, description: desc };
        }
      }
    }
  }

  return {
    kind: instanceId ? "instance" as const : (category ? "static" as const : "generic" as const),
    nodeName: object.name || "Unknown",
    object,
    point,
    distance,
    instanceId: instanceId as string | undefined,
    category: category as string | undefined,
    assetInfo,
  };
}

/**
 * Build info card HTML content from hit descriptor.
 */
export function buildInfoCardContent(hit: HitDescriptor): string {
  const parts: string[] = [];

  // Instance ID
  if (hit.instanceId) {
    parts.push(`<div class="info-row"><strong>Instance:</strong> ${escapeHtml(hit.instanceId)}</div>`);
  }

  // Category
  if (hit.category) {
    parts.push(`<div class="info-row"><strong>Category:</strong> ${escapeHtml(hit.category)}</div>`);
  }

  // Asset info
  if (hit.assetInfo) {
    const assetId = hit.assetInfo.asset_id as string;
    const description = hit.assetInfo.description as AssetDescription | undefined;
    
    if (assetId) {
      parts.push(`<div class="info-row"><strong>Asset:</strong> ${escapeHtml(assetId)}</div>`);
    }
    if (description?.text_desc) {
      parts.push(`<div class="info-row"><strong>Description:</strong> ${escapeHtml(description.text_desc)}</div>`);
    }
    if (description?.source) {
      parts.push(`<div class="info-row"><strong>Source:</strong> ${escapeHtml(description.source)}</div>`);
    }

    // Position
    const position = hit.assetInfo.position_xyz as [number, number, number] | undefined;
    if (position) {
      parts.push(
        `<div class="info-row"><strong>Position:</strong> (${position[0].toFixed(2)}, ${position[1].toFixed(2)}, ${position[2].toFixed(2)})</div>`
      );
    }

    // Bounding box
    const bbox = hit.assetInfo.bbox_xz as [number, number, number, number] | undefined;
    if (bbox) {
      parts.push(
        `<div class="info-row"><strong>BBox:</strong> (${bbox[0].toFixed(1)}, ${bbox[1].toFixed(1)}) → (${bbox[2].toFixed(1)}, ${bbox[3].toFixed(1)})</div>`
      );
    }
  }

  // Hit point
  parts.push(
    `<div class="info-row"><strong>Hit Point:</strong> (${hit.point!.x.toFixed(2)}, ${hit.point!.y.toFixed(2)}, ${hit.point!.z.toFixed(2)})</div>`
  );
  parts.push(`<div class="info-row"><strong>Distance:</strong> ${hit.distance!.toFixed(2)}m</div>`);

  return parts.join("\n");
}

/**
 * Format metric value for display.
 */
export function formatMetric(value: number | null | undefined, unit: string = "", decimals: number = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }
  return `${value.toFixed(decimals)}${unit}`;
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
