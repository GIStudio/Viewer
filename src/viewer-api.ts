/**
 * API utilities for the RoadGen3D Viewer.
 * 
 * Handles manifest loading, recent layouts, and API calls with caching.
 */

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
export async function loadManifest(manifestUrl: string): Promise<ViewerManifest> {
  if (manifestCache.has(manifestUrl)) {
    return manifestCache.get(manifestUrl)!;
  }
  
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }
  
  const manifest = await response.json() as ViewerManifest;
  manifestCache.set(manifestUrl, manifest);
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
export async function loadRecentLayouts(limit: number = 20): Promise<RecentLayout[]> {
  if (recentLayoutsCache) return recentLayoutsCache;
  
  const response = await fetch(`${API_BASE}/api/recent-layouts?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to load recent layouts: ${response.status}`);
  }
  
  const data = await response.json();
  recentLayoutsCache = Array.isArray(data) ? data : (data.items || []);
  return recentLayoutsCache as RecentLayout[];
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
