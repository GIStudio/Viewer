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
const recentLayoutsCache = new Map<string, RecentLayout[]>();

export type LoadManifestOptions = {
  sceneGlbPath?: string;
  defaultSceneOptionKey?: string;
};

/**
 * Load manifest with caching.
 */
export async function loadManifest(
  manifestUrl: string,
  useCache: boolean = true,
  options: LoadManifestOptions = {},
): Promise<ViewerManifest> {
  const manifestStart = performance.now();
  const cacheKey = manifestCacheKey(manifestUrl, options);
  if (useCache && manifestCache.has(cacheKey)) {
    const cached = manifestCache.get(cacheKey)!;
    const cacheMs = (performance.now() - manifestStart).toFixed(1);
    console.info(`[viewer-timing] loadManifest cache hit: ${manifestUrl} (${cacheMs} ms)`);
    return cached;
  }

  const fetchStart = performance.now();
  let response = await fetch(resolveManifestUrl(manifestUrl, options));
  const fetchMs = (performance.now() - fetchStart).toFixed(1);
  console.info(
    `[viewer-timing] loadManifest fetch: ${manifestUrl} -> ${response.status} (${fetchMs} ms)`,
  );
  let pendingErrorDetail = "";
  if (!response.ok) {
    const errorStart = performance.now();
    let detail = await responseErrorDetail(response);
    if (shouldAttemptLayoutGlbRebuild(manifestUrl, response.status, detail)) {
      try {
        const rebuildStart = performance.now();
        await rebuildLayoutGlb(manifestUrl);
        console.info(
          `[viewer-timing] loadManifest rebuild-layout-glb: ${manifestUrl} (${(performance.now() - rebuildStart).toFixed(1)} ms)`,
        );
        const reFetchStart = performance.now();
        response = await fetch(resolveManifestUrl(manifestUrl, options));
        console.info(
          `[viewer-timing] loadManifest fetch(retry): ${manifestUrl} -> ${response.status} (${(
            performance.now() - reFetchStart
          ).toFixed(1)} ms)`,
        );
        detail = response.ok ? "" : await responseErrorDetail(response);
      } catch (error) {
        const rebuildMessage = error instanceof Error ? error.message : String(error ?? "");
        detail = [detail, `GLB rebuild failed: ${rebuildMessage}`].filter(Boolean).join("; ");
      }
    }
    console.info(`[viewer-timing] loadManifest errorHandling: ${manifestUrl} (${(performance.now() - errorStart).toFixed(1)} ms)`);
    pendingErrorDetail = detail;
  }
  if (!response.ok) {
    console.info(`[viewer-timing] loadManifest failed: ${manifestUrl} (${(performance.now() - manifestStart).toFixed(1)} ms)`);
    const detail = pendingErrorDetail || await responseErrorDetail(response);
    const suffix = detail ? ` (${detail})` : "";
    throw new Error(`Failed to load manifest: ${response.status}${suffix}`);
  }

  const parseStart = performance.now();
  const manifest = await response.json() as ViewerManifest;
  const parseMs = (performance.now() - parseStart).toFixed(1);
  console.info(`[viewer-timing] loadManifest parse: ${manifestUrl} (${parseMs} ms)`);
  if (useCache) {
    manifestCache.set(cacheKey, manifest);
  }
  console.info(`[viewer-timing] loadManifest total: ${manifestUrl} (${(performance.now() - manifestStart).toFixed(1)} ms)`);
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
export async function loadRecentLayouts(
  limit: number = 20,
  useCache: boolean = true,
  offset: number = 0,
): Promise<RecentLayout[]> {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const safeOffset = Math.max(0, Math.trunc(offset));
  const cacheKey = `${safeLimit}:${safeOffset}`;
  if (useCache) {
    const cached = recentLayoutsCache.get(cacheKey);
    if (cached) return cached;
  }
  const refreshParam = useCache ? "" : "&refresh=1";
  const offsetParam = safeOffset > 0 ? `&offset=${safeOffset}` : "";

  const candidates = [
    `/api/recent-layouts?limit=${safeLimit}${offsetParam}${refreshParam}`,
    `${API_BASE}/api/recent-layouts?limit=${safeLimit}${offsetParam}${refreshParam}`,
    `${API_BASE}/api/scenes/recent?limit=${safeLimit}`,
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
    recentLayoutsCache.set(cacheKey, result);
  }
  return result;
}

/**
 * Clear recent layouts cache.
 */
export function clearRecentLayoutsCache(): void {
  recentLayoutsCache.clear();
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

export interface RebuildLayoutGlbResponse {
  layout_path: string;
  scene_glb_path: string;
  manifest_path: string;
  rebuilt: boolean;
}

export async function rebuildLayoutGlb(layoutPath: string, force: boolean = false): Promise<RebuildLayoutGlbResponse> {
  return postApiJson<RebuildLayoutGlbResponse>("/api/design/rebuild-layout-glb", {
    layout_path: layoutPath,
    force,
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

function manifestCacheKey(manifestUrl: string, options: LoadManifestOptions): string {
  const sceneGlbPath = options.sceneGlbPath?.trim() ?? "";
  return sceneGlbPath ? `${manifestUrl}::scene_glb=${sceneGlbPath}` : manifestUrl;
}

function resolveManifestUrl(manifestUrl: string, options: LoadManifestOptions = {}): string {
  const value = manifestUrl.trim();
  if (!value) {
    return value;
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("/api/") || value.startsWith("./") || value.startsWith("../")) {
    return value;
  }
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.endsWith("scene_layout.json")) {
    const params = new URLSearchParams({ path: value });
    const sceneGlbPath = options.sceneGlbPath?.trim();
    if (sceneGlbPath) {
      params.set("scene_glb_path", sceneGlbPath);
    }
    return `/api/layout?${params.toString()}`;
  }
  return value;
}

function isLocalLayoutPath(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed)
    && !/^https?:\/\//i.test(trimmed)
    && (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.endsWith("scene_layout.json"));
}

function shouldAttemptLayoutGlbRebuild(manifestUrl: string, status: number, detail: string): boolean {
  if (status !== 400 || !isLocalLayoutPath(manifestUrl)) {
    return false;
  }
  const lower = detail.toLowerCase();
  return lower.includes("scene_glb")
    || lower.includes("final scene glb")
    || lower.includes("valid final scene glb");
}

async function responseErrorDetail(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json() as { detail?: unknown; error?: unknown };
    return String(payload.detail ?? payload.error ?? "").trim();
  } catch {
    return "";
  }
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
