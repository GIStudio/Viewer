/**
 * API utilities for the RoadGen3D Viewer.
 *
 * Handles manifest loading, recent layouts, and API calls with caching.
 */

import * as THREE from "three";
import type { ViewerManifest, RecentLayout } from "./viewer-types";

const API_BASE = (import.meta.env.VITE_ROADGEN_API_BASE as string | undefined) || "http://127.0.0.1:8010";

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

  const response = await fetch(resolveManifestUrl(manifestUrl));
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

  const candidates = [
    `/api/recent-layouts?limit=${limit}`,
    `${API_BASE}/api/recent-layouts?limit=${limit}`,
    `${API_BASE}/api/scenes/recent?limit=${limit}`,
  ];
  let lastStatus = 0;
  let sawSuccessfulResponse = false;
  let result: RecentLayout[] = [];
  for (const url of candidates) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      continue;
    }
    lastStatus = response.status;
    if (!response.ok) {
      continue;
    }
    sawSuccessfulResponse = true;
    try {
      result = mapRecentLayoutsPayload(await response.json());
    } catch {
      continue;
    }
    if (result.length > 0 || url.includes("/api/scenes/recent")) {
      break;
    }
  }
  if (!sawSuccessfulResponse) {
    throw new Error(`Failed to load recent layouts: ${lastStatus}`);
  }

  if (useCache) {
    recentLayoutsCache = result;
  }
  return result;
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
  const response = await fetch(resolveApiUrl(url), {
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

function resolveManifestUrl(manifestUrl: string): string {
  const value = manifestUrl.trim();
  if (!value) {
    return value;
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("/api/") || value.startsWith("./") || value.startsWith("../")) {
    return value;
  }
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.endsWith("scene_layout.json")) {
    return `/api/layout?path=${encodeURIComponent(value)}`;
  }
  return value;
}

function resolveApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (url.startsWith("/api/")) {
    return `${API_BASE}${url}`;
  }
  return url;
}

function mapRecentLayoutsPayload(data: unknown): RecentLayout[] {
  const payload = data as { results?: unknown[]; items?: unknown[] } | unknown[];
  const raw = Array.isArray(payload) ? payload : (payload.results || payload.items || []);
  return raw
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      id: String(item.id ?? item.job_id ?? item.layout_path ?? item.scene_layout_path ?? ""),
      label: String(item.label ?? item.relative_path ?? item.job_id ?? "scene"),
      layout_path: String(item.layout_path ?? item.scene_layout_path ?? ""),
      created_at: String(item.created_at ?? item.updated_at ?? ""),
      source: item.source as string | undefined,
      scene_layout_path: item.scene_layout_path as string | undefined,
      metrics: item.metrics as Record<string, number> | undefined,
      preset_id: item.preset_id as string | undefined,
      relative_path: item.relative_path as string | undefined,
      updated_at: item.updated_at as string | undefined,
    }))
    .filter((item) => item.layout_path);
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
