const configuredApiBase = String(import.meta.env.VITE_ROADGEN_API_BASE ?? "").trim();

/**
 * The Viewer uses the current origin by default. In development Vite proxies
 * unhandled /api requests to the design API; production uses the HTTPS reverse
 * proxy. A full origin is only needed for an explicit cross-origin deployment.
 */
export const API_BASE = configuredApiBase.replace(/\/$/, "");

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/")) return `${API_BASE}${path}`;
  return path;
}

export function describeApiRequest(path: string): string {
  const resolved = resolveApiUrl(path);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  const origin = typeof window === "undefined" ? "current Viewer origin" : window.location.origin;
  return `${origin}${resolved.startsWith("/") ? resolved : `/${resolved}`}`;
}
