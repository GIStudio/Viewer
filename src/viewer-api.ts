/**
 * API utilities for the RoadGen3D Viewer.
 *
 * Handles manifest loading, recent layouts, and API calls with caching.
 */

import * as THREE from "three";

const API_BASE = (import.meta.env.VITE_ROADGEN_API_BASE as string | undefined) || "http://127.0.0.1:8010";

export type ViewerManifest = {
  final_scene: {
    glb_url: string;
    label: string;
  };
  production_steps?: Array<{
    step_id: string;
    title: string;
    glb_url: string;
  }>;
  instances?: Array<Record<string, unknown>>;
  asset_descriptions?: Record<string, unknown>;
  audio_profile?: Record<string, unknown>;
};

export type RecentLayout = {
  id: string;
  label: string;
  layout_path: string;
  created_at: string;
  source?: string;
};

// Manifest cache
const manifestCache = new Map<string, ViewerManifest>();
let recentLayoutsCache: RecentLayout[] | null = null;

/**
 * Load manifest with caching.
 */
export async function loadManifest(manifestUrl: string, useCache: boolean = true): Promise<ViewerManifest> {
  if (useCache && manifestCache.has(manifestUrl)) {
    return manifestCache.get(manifestUrl)!;
  }

  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }

  const manifest = await response.json() as ViewerManifest;
  if (useCache) {
    manifestCache.set(manifestUrl, manifest);
  }
  return manifest;
}

/**
 * Clear manifest cache.
 */
export function clearManifestCache(): void {
  manifestCache.clear();
}

/**
 * Load recent layouts with caching.
 */
export async function loadRecentLayouts(limit: number = 20, useCache: boolean = true): Promise<RecentLayout[]> {
  if (useCache && recentLayoutsCache) return recentLayoutsCache;

  const response = await fetch(`${API_BASE}/api/recent-layouts?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to load recent layouts: ${response.status}`);
  }

  const data = await response.json();
  const result = Array.isArray(data) ? data : (data.items || []);
  if (useCache) {
    recentLayoutsCache = result;
  }
  return result as RecentLayout[];
}

/**
 * Clear recent layouts cache.
 */
export function clearRecentLayoutsCache(): void {
  recentLayoutsCache = null;
}

/**
 * Generic API JSON fetch.
 */
export async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as Promise<T>;
}

/**
 * API JSON POST.
 */
export async function postApiJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Update query string with layout parameter.
 */
export function updateQueryLayout(layoutPath: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("layout", layoutPath);
  window.history.replaceState({}, "", url.toString());
}

/**
 * Sleep for given milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse layout path from query string.
 */
export function parseQueryLayoutPath(): string | null {
  const search = new URLSearchParams(window.location.search);
  const layoutPath = search.get("layout") ?? "";
  return layoutPath.trim() || null;
}

/**
 * Infer spawn position from bounding box.
 */
export function inferSpawnFromBbox(
  bbox: { center: THREE.Vector3 },
  manifest: { spawn_point?: [number, number, number]; forward_vector?: [number, number, number] },
): { position: THREE.Vector3; forward: THREE.Vector3 } {
  if (
    manifest.spawn_point &&
    manifest.forward_vector
  ) {
    return {
      position: new THREE.Vector3(
        manifest.spawn_point[0],
        manifest.spawn_point[1],
        manifest.spawn_point[2],
      ),
      forward: new THREE.Vector3(
        manifest.forward_vector[0],
        manifest.forward_vector[1],
        manifest.forward_vector[2],
      ).normalize(),
    };
  }

  return {
    position: new THREE.Vector3(bbox.center.x, 1.65, bbox.center.z),
    forward: new THREE.Vector3(1, 0, 0),
  };
}
