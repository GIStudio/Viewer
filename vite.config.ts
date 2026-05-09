import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import { URL, fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

const viewerRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(viewerRoot, "..", "..");
const RECENT_LAYOUT_LIMIT = 20;
const RECENT_LAYOUT_INDEX_PATH = path.resolve(
  repoRoot,
  "artifacts",
  "web_viewer_layouts",
  ".recent_layouts.ndjson",
);
const ASSET_MANIFEST_PATH = path.resolve(repoRoot, "data", "real", "real_assets_manifest.jsonl");
const ASSET_MANIFESTS_DIR = path.resolve(repoRoot, "data", "real");
const SPLIT_ASSET_MESH_DIR = path.resolve(ASSET_MANIFESTS_DIR, "split_meshes");
const NORMALIZED_ASSET_MESH_DIR = path.resolve(ASSET_MANIFESTS_DIR, "normalized_meshes");
const EXTRA_ASSET_MANIFEST_DIRS = [
  path.resolve(repoRoot, "data", "street_furniture"),
  path.resolve(repoRoot, "assets", "building"),
];
const IGNORED_DISCOVERY_DIRS = new Set([
  ".git",
  ".venv",
  ".pytest_cache",
  "__pycache__",
  "node_modules",
  "dist",
]);

type JsonRecord = Record<string, unknown>;

type StaticObjectDescription = {
  match: "exact" | "prefix";
  title: string;
  category: string;
  source: string;
  intro: string;
  design_note: string;
};

let cachedAssetDescriptionIndex: Map<string, JsonRecord> | null = null;
const RECENT_LAYOUT_DISCOVERY_CACHE_TTL_MS = 10_000;
type RecentLayoutCacheEntry = {
  layoutPath: string;
  mtimeMs: number;
};
type RecentLayoutViewState = {
  mtimeMs: number;
  isViewable: boolean;
  relativePath: string;
  label: string;
  updatedAt: string;
};
type RecentLayoutIndexRow = {
  layout_path: string;
  label: string;
  relative_path: string;
  updated_at: string;
  mtime_ms: number;
};
type RecentLayoutCacheState = {
  builtAtMs: number;
  rootsSignature: string;
  candidates: Array<RecentLayoutCacheEntry>;
  discovered: number;
  discoveryMs: number;
  viewStateByPath: Map<string, RecentLayoutViewState>;
};
let recentLayoutCache: RecentLayoutCacheState | null = null;

function allowedRoots(): string[] {
  const roots = [repoRoot];
  // Add common external asset caches so the dev server can serve them
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const knownCaches = [
    homeDir && path.join(homeDir, ".objaverse"),
    homeDir && path.join(homeDir, ".cache"),
  ].filter(Boolean) as string[];
  for (const cache of knownCaches) {
    if (fs.existsSync(cache) && !roots.includes(cache)) {
      roots.push(cache);
    }
  }
  const extra = (process.env.ROADGEN_VIEWER_ALLOWED_ROOTS ?? "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
  for (const root of extra) {
    if (!roots.includes(root)) {
      roots.push(root);
    }
  }
  return roots;
}

function resolveAllowedPath(rawPath: string | null): string | null {
  if (!rawPath) {
    return null;
  }
  const candidate = rawPath.trim();
  if (!candidate) {
    return null;
  }
  const resolved = path.resolve(candidate);
  for (const root of allowedRoots()) {
    const relative = path.relative(root, resolved);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return resolved;
    }
  }
  return null;
}

function resolveManifestAssetPath(rawPath: string | null | undefined, manifestPath: string): string {
  if (!rawPath || typeof rawPath !== "string") {
    return String(rawPath ?? "");
  }
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return "";
  }

  if (path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return path.resolve(trimmed);
  }

  const manifestDir = path.dirname(path.resolve(manifestPath));
  return path.resolve(manifestDir, trimmed);
}

function normalizeManifestRecordPaths(record: JsonRecord, manifestPath: string): JsonRecord {
  if (typeof record.mesh_path === "string" && record.mesh_path.trim()) {
    record.mesh_path = resolveManifestAssetPath(record.mesh_path, manifestPath);
  }
  return record;
}

function resolveAssetManifestPath(manifestName: string): string | null {
  if (!manifestName) {
    return null;
  }

  if (manifestName.includes("/")) {
    const [prefix, fileName] = manifestName.split("/", 2);
    const extraDir = EXTRA_ASSET_MANIFEST_DIRS.find((dir) => path.basename(dir) === prefix);
    if (!extraDir) {
      return null;
    }
    const candidate = path.join(extraDir, fileName);
    const relative = path.relative(extraDir, candidate);
    return !relative.startsWith("..") && !path.isAbsolute(relative) ? candidate : null;
  }

  const candidate = path.resolve(ASSET_MANIFESTS_DIR, manifestName);
  const relative = path.relative(ASSET_MANIFESTS_DIR, candidate);
  return !relative.startsWith("..") && !path.isAbsolute(relative) ? candidate : null;
}

function safeAssetFileStem(assetId: string): string {
  return assetId.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 160) || "asset";
}

function splitIsoRunStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function splitRecordListField(record: JsonRecord, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function splitAppendUnique(values: string[], ...extraValues: string[]): string[] {
  const seen = new Set(values);
  const result = [...values];
  for (const value of extraValues) {
    if (value && !seen.has(value)) {
      result.push(value);
      seen.add(value);
    }
  }
  return result;
}

function splitUniqueAssetId(baseId: string, existingIds: Set<string>): string {
  let candidate = baseId;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  existingIds.add(candidate);
  return candidate;
}

function writeSplitPlaceholderLatent(latentPath: string, assetId: string, parentAssetId: string, method: string): void {
  fs.writeFileSync(
    latentPath,
    JSON.stringify(
      {
        placeholder: true,
        asset_id: assetId,
        parent_asset_id: parentAssetId,
        created_by: `asset_splitter_${method}`,
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function buildBackendSplitChildRecord(
  parent: JsonRecord,
  parentMeshPath: string,
  outputDir: string,
  glbPath: string,
  cluster: JsonRecord,
  index: number,
  existingIds: Set<string>,
  method: string,
): JsonRecord {
  const parentAssetId = String(parent.asset_id ?? "asset");
  const assetId = splitUniqueAssetId(`${parentAssetId}-split-${String(index).padStart(3, "0")}`, existingIds);
  const latentPath = path.join(outputDir, `${safeAssetFileStem(assetId)}.pt`);
  const faceCount = Number.isFinite(Number(cluster.face_count)) ? Number(cluster.face_count) : 0;
  const textDesc = String(parent.text_desc ?? parent.description ?? parentAssetId);
  const tags = splitAppendUnique(
    splitRecordListField(parent, "tags"),
    "split_asset",
    `split_method:${method}`,
    `split_parent:${parentAssetId}`,
  );
  const qualityNotes = splitAppendUnique(
    splitRecordListField(parent, "quality_notes"),
    `split_from=${parentAssetId}`,
    `split_method=${method}`,
    `split_index=${String(index).padStart(3, "0")}`,
    `mesh_face_count=${faceCount}`,
  );

  writeSplitPlaceholderLatent(latentPath, assetId, parentAssetId, method);

  const record: JsonRecord = {
    asset_id: assetId,
    category: parent.category ?? "traffic_sign",
    mesh_path: glbPath,
    source: `asset_splitter_${method}`,
    license: parent.license ?? "derived_from_parent_asset",
    quality_tier: parent.quality_tier ?? 3,
    scene_eligible: parent.scene_eligible ?? true,
    tags,
    text_desc: `${textDesc} split component ${String(index).padStart(3, "0")}`,
    latent_path: latentPath,
    latent_source: "mesh_reference",
    split: parent.split ?? "train",
    mesh_face_count: faceCount,
    parent_asset_id: parentAssetId,
    parent_mesh_path: parentMeshPath,
    asset_composition_type: "split_component",
    split_method: method,
    split_index: index,
    split_output_dir: outputDir,
    quality_notes: qualityNotes,
  };

  for (const key of ["subcategory", "size_class", "scale_hint", "source_dataset"]) {
    if (key in parent) {
      record[key] = parent[key];
    }
  }
  return record;
}

function discoverSceneLayoutPaths(roots: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      continue;
    }
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop() ?? "";
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DISCOVERY_DIRS.has(entry.name)) {
            stack.push(fullPath);
          }
          continue;
        }
        if (!entry.isFile() || entry.name !== "scene_layout.json") {
          continue;
        }
        const resolved = path.resolve(fullPath);
        if (seen.has(resolved)) {
          continue;
        }
        seen.add(resolved);
        results.push(resolved);
      }
    }
  }
  return results;
}

function displayPathFor(filePath: string, roots: string[]): string {
  for (const root of roots) {
    const relative = path.relative(root, filePath);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return relative || path.basename(filePath);
    }
  }
  return path.basename(filePath);
}

function resolveLayoutReferencedPath(rawValue: unknown, layoutPath: string): string | null {
  const text = String(rawValue ?? "").trim();
  if (!text) {
    return null;
  }
  const candidate = path.isAbsolute(text)
    ? text
    : path.resolve(path.dirname(layoutPath), text);
  return resolveAllowedPath(candidate);
}

function isViewableSceneLayout(layoutPath: string): boolean {
  try {
    const layoutPayload = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as JsonRecord;
    const outputs = (layoutPayload.outputs ?? {}) as JsonRecord;
    const finalScenePath = resolveLayoutReferencedPath(outputs.scene_glb, layoutPath);
    return Boolean(finalScenePath && fs.existsSync(finalScenePath));
  } catch {
    return false;
  }
}

function buildRecentLayoutRootsSignature(roots: string[]): string {
  return roots.slice().sort().join("|");
}

function getRecentLayoutViewState(
  layoutPath: string,
  mtimeMs: number,
  roots: string[],
  cache: Map<string, RecentLayoutViewState>,
): RecentLayoutViewState {
  const cached = cache.get(layoutPath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached;
  }

  const relativePath = displayPathFor(layoutPath, roots);
  const label = `${path.basename(path.dirname(layoutPath))} · ${relativePath}`;
  const updatedAt = new Date(mtimeMs).toISOString();
  const isViewable = isViewableSceneLayout(layoutPath);

  const viewState: RecentLayoutViewState = {
    mtimeMs,
    isViewable,
    relativePath,
    label,
    updatedAt,
  };
  cache.set(layoutPath, viewState);
  return viewState;
}

function persistRecentLayoutIndex(
  cache: RecentLayoutCacheState,
  roots: string[],
): void {
  try {
    const rows: RecentLayoutIndexRow[] = [];
    for (const { layoutPath, mtimeMs } of cache.candidates) {
      const viewState = getRecentLayoutViewState(layoutPath, mtimeMs, roots, cache.viewStateByPath);
      if (!viewState.isViewable) {
        continue;
      }
      rows.push({
        layout_path: layoutPath,
        label: viewState.label,
        relative_path: viewState.relativePath,
        updated_at: viewState.updatedAt,
        mtime_ms: mtimeMs,
      });
    }
    fs.mkdirSync(path.dirname(RECENT_LAYOUT_INDEX_PATH), { recursive: true });
    const tmpPath = `${RECENT_LAYOUT_INDEX_PATH}.tmp`;
    fs.writeFileSync(
      tmpPath,
      rows.map((entry) => JSON.stringify(entry)).join("\n"),
      "utf-8",
    );
    fs.renameSync(tmpPath, RECENT_LAYOUT_INDEX_PATH);
  } catch (error) {
    console.warn("[viewer-api-timing] recent-layout index persist failed:", error);
  }
}

async function readRecentLayoutIndexRows(
  limit: number,
  offsetRows: number = 0,
): Promise<{ rows: RecentLayoutIndexRow[]; checked: number }> {
  if (!fs.existsSync(RECENT_LAYOUT_INDEX_PATH)) {
    return { rows: [], checked: 0 };
  }

  const rows: RecentLayoutIndexRow[] = [];
  let checked = 0;
  let remainingOffset = Math.max(0, Math.trunc(offsetRows));
  const stream = fs.createReadStream(RECENT_LAYOUT_INDEX_PATH, { encoding: "utf-8" });
  const lines = createInterface({ input: stream });

  try {
    for await (const rawLine of lines) {
      checked += 1;
      const trimmed = rawLine.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const row = JSON.parse(trimmed) as RecentLayoutIndexRow;
        if (!row?.layout_path || typeof row.layout_path !== "string") {
          continue;
        }
        if (!row.layout_path.endsWith("scene_layout.json")) {
          continue;
        }
        if (!fs.existsSync(row.layout_path)) {
          continue;
        }
        if (remainingOffset > 0) {
          remainingOffset -= 1;
          continue;
        }
        rows.push({
          layout_path: row.layout_path,
          label: String(row.label || ""),
          relative_path: String(row.relative_path || ""),
          updated_at: String(row.updated_at || new Date(0).toISOString()),
          mtime_ms: Number(row.mtime_ms ?? 0),
        });
      } catch {
        continue;
      }
      if (rows.length >= limit) {
        break;
      }
    }
  } finally {
    lines.close();
    stream.close();
  }

  return { rows, checked };
}

function buildRecentLayoutCandidates(roots: string[]): {
  candidates: Array<RecentLayoutCacheEntry>;
  discovered: number;
} {
  const discoveryStart = performance.now();
  const candidates = discoverSceneLayoutPaths(roots)
    .filter((layoutPath) => {
      const pathLower = layoutPath.toLowerCase();
      return !pathLower.includes("real_assets")
        && !pathLower.includes("real-assets")
        && !pathLower.includes("_v2")
        && !pathLower.includes("-v2")
        && !pathLower.includes("/v2/");
    })
    .map((layoutPath) => {
      try {
        const stats = fs.statSync(layoutPath);
        return {
          layoutPath,
          mtimeMs: Math.trunc(stats.mtimeMs),
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { layoutPath: string; mtimeMs: number } => entry !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const discovered = candidates.length;
  console.info(
    `[viewer-api-timing] recent-layouts discovery took ${(performance.now() - discoveryStart).toFixed(1)}ms ` +
      `roots=${roots.length} discovered=${discovered}`,
  );
  return { candidates, discovered };
}

function getRecentLayoutCache(roots: string[], forceRefresh: boolean): RecentLayoutCacheState {
  const now = performance.now();
  const rootsSignature = buildRecentLayoutRootsSignature(roots);
  if (!forceRefresh && !recentLayoutCache && fs.existsSync(RECENT_LAYOUT_INDEX_PATH)) {
      return {
        builtAtMs: now,
        rootsSignature,
        candidates: [],
        discovered: 0,
        discoveryMs: 0,
        viewStateByPath: new Map(),
      };
  }
  const needsRebuild =
    !recentLayoutCache
    || recentLayoutCache.rootsSignature !== rootsSignature
    || forceRefresh
    || (now - recentLayoutCache.builtAtMs) > RECENT_LAYOUT_DISCOVERY_CACHE_TTL_MS;

  if (!needsRebuild) {
    return recentLayoutCache;
  }

  const discovery = buildRecentLayoutCandidates(roots);
  const nextCache: RecentLayoutCacheState = {
    builtAtMs: now,
    rootsSignature,
    candidates: discovery.candidates,
    discovered: discovery.discovered,
    discoveryMs: Number((performance.now() - now).toFixed(1)),
    viewStateByPath: recentLayoutCache ? recentLayoutCache.viewStateByPath : new Map(),
  };

  const validPaths = new Set(nextCache.candidates.map((entry) => entry.layoutPath));
  for (const existing of Array.from(nextCache.viewStateByPath.keys())) {
    if (!validPaths.has(existing)) {
      nextCache.viewStateByPath.delete(existing);
    }
  }
  persistRecentLayoutIndex(nextCache, roots);
  recentLayoutCache = nextCache;
  return recentLayoutCache;
}

async function buildRecentLayoutsPayload(
  limit: number,
  forceRefresh: boolean,
  offsetRows: number = 0,
): Promise<{ results: Array<Record<string, unknown>> }> {
  const buildStart = performance.now();
  const roots = allowedRoots();
  const safeLimit = Math.max(1, Number.isFinite(limit) ? Math.trunc(limit) : RECENT_LAYOUT_LIMIT);
  const safeOffset = Math.max(0, Number.isFinite(offsetRows) ? Math.trunc(offsetRows) : 0);
  let cache = getRecentLayoutCache(roots, forceRefresh);
  let discoveredCount = cache.discovered;
  let checkedCount = 0;
  const results = [];

  const indexSeen = new Set<string>();
  if (!forceRefresh && fs.existsSync(RECENT_LAYOUT_INDEX_PATH)) {
    const indexPayload = await readRecentLayoutIndexRows(safeLimit, safeOffset);
    checkedCount = indexPayload.checked;
    indexPayload.rows.forEach((entry) => {
      indexSeen.add(entry.layout_path);
      results.push({
        layout_path: entry.layout_path,
        label: entry.label,
        relative_path: entry.relative_path,
        updated_at: entry.updated_at,
        mtime_ms: entry.mtime_ms,
      });
    });
    if (results.length >= safeLimit) {
      const buildMs = (performance.now() - buildStart).toFixed(1);
      console.info(
        `[viewer-api-timing] buildRecentLayoutsPayload limit=${safeLimit} roots=${roots.length} discovered=${discoveredCount} checked=${checkedCount} return=${results.length} elapsed=${buildMs}ms`,
      );
      return { results };
    }

    if (cache.candidates.length === 0 || cache.discovered <= 0) {
      cache = getRecentLayoutCache(roots, true);
      discoveredCount = cache.discovered;
    }
  }

  let candidateSkip = safeOffset;
  for (const { layoutPath, mtimeMs } of cache.candidates) {
    if (candidateSkip > 0) {
      candidateSkip -= 1;
      continue;
    }
    if (indexSeen.size > 0 && indexSeen.has(layoutPath)) {
      continue;
    }
    checkedCount += 1;
    const viewState = getRecentLayoutViewState(layoutPath, mtimeMs, roots, cache.viewStateByPath);
    if (!viewState.isViewable) {
      continue;
    }
    results.push({
      layout_path: layoutPath,
      label: viewState.label,
      relative_path: viewState.relativePath,
      updated_at: viewState.updatedAt,
      mtime_ms: mtimeMs,
    });
    if (results.length >= safeLimit) {
      break;
    }
  }
  const buildMs = (performance.now() - buildStart).toFixed(1);
  console.info(
    `[viewer-api-timing] buildRecentLayoutsPayload limit=${safeLimit} roots=${roots.length} discovered=${discoveredCount} checked=${checkedCount} return=${results.length} elapsed=${buildMs}ms`,
  );
  return { results };
}

function asNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function asFiniteNumberOrNull(value: unknown): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function asTriplet(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const items = value.map((entry) => asFiniteNumberOrNull(entry));
  if (items.some((entry) => entry === null)) {
    return null;
  }
  return [items[0] ?? 0, items[1] ?? 0, items[2] ?? 0];
}

function asQuad(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }
  const items = value.map((entry) => asFiniteNumberOrNull(entry));
  if (items.some((entry) => entry === null)) {
    return null;
  }
  return [items[0] ?? 0, items[1] ?? 0, items[2] ?? 0, items[3] ?? 0];
}

function cleanForJson(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cleanForJson(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cleanForJson(entry)]),
    );
  }
  return value;
}

function loadAssetDescriptionIndex(): Map<string, JsonRecord> {
  if (cachedAssetDescriptionIndex) {
    return cachedAssetDescriptionIndex;
  }
  const index = new Map<string, JsonRecord>();
  if (!fs.existsSync(ASSET_MANIFEST_PATH)) {
    cachedAssetDescriptionIndex = index;
    return index;
  }
  const lines = fs.readFileSync(ASSET_MANIFEST_PATH, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as JsonRecord;
      const assetId = String(parsed.asset_id ?? "").trim();
      
      // Filter out L0 quality assets
      const source = String(parsed.source ?? "").toLowerCase();
      const generatorType = String(parsed.generator_type ?? "").toLowerCase();
      const qualityTier = Number(parsed.quality_tier ?? 999);
      
      // Skip real_assets imports (L0 quality)
      if (source.includes("real_asset") || source.includes("urbanverse_import")) {
        continue;
      }
      // Skip v2 generation assets (L0 quality)
      if (generatorType.includes("_v2") || generatorType.includes("-v2")) {
        continue;
      }
      // Skip low quality tier (0 = L0, lower is worse)
      if (qualityTier === 0) {
        continue;
      }
      
      if (assetId) {
        index.set(assetId, parsed);
      }
    } catch {
      continue;
    }
  }
  cachedAssetDescriptionIndex = index;
  return index;
}

function fallbackAssetDescription(assetId: string, category: string): JsonRecord {
  return {
    asset_id: assetId,
    category,
    text_desc: `${category || "street_object"} · ${assetId}`,
    source: "scene_generated",
  };
}

function buildAssetDescriptions(layoutPayload: JsonRecord): Record<string, JsonRecord> {
  const placements = Array.isArray(layoutPayload.placements) ? layoutPayload.placements : [];
  const assetIds = new Set<string>();
  for (const placement of placements) {
    if (!placement || typeof placement !== "object") {
      continue;
    }
    const assetId = String((placement as JsonRecord).asset_id ?? "").trim();
    if (assetId) {
      assetIds.add(assetId);
    }
  }
  const index = loadAssetDescriptionIndex();
  const descriptions: Record<string, JsonRecord> = {};
  for (const assetId of assetIds) {
    const manifestRow = index.get(assetId);
    if (manifestRow) {
      descriptions[assetId] = cleanForJson({
        asset_id: assetId,
        category: String(manifestRow.category ?? "").trim(),
        text_desc: String(manifestRow.text_desc ?? "").trim(),
        source: String(manifestRow.source ?? "").trim(),
        asset_role: String(manifestRow.asset_role ?? "").trim(),
      }) as JsonRecord;
      continue;
    }
    const placement = placements.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        String((entry as JsonRecord).asset_id ?? "").trim() === assetId,
    ) as JsonRecord | undefined;
    descriptions[assetId] = cleanForJson(
      fallbackAssetDescription(assetId, String(placement?.category ?? "").trim()),
    ) as JsonRecord;
  }
  return descriptions;
}

function buildInstancePayloads(layoutPayload: JsonRecord): Record<string, JsonRecord> {
  const placements = Array.isArray(layoutPayload.placements) ? layoutPayload.placements : [];
  const instances: Record<string, JsonRecord> = {};
  for (const placement of placements) {
    if (!placement || typeof placement !== "object") {
      continue;
    }
    const row = placement as JsonRecord;
    const instanceId = String(row.instance_id ?? "").trim();
    if (!instanceId) {
      continue;
    }
    const positionXyz = asTriplet(row.position_xyz);
    const bboxXz = asQuad(row.bbox_xz);
    instances[instanceId] = cleanForJson({
      instance_id: instanceId,
      asset_id: String(row.asset_id ?? "").trim(),
      category: String(row.category ?? "").trim(),
      placement_group: String(row.placement_group ?? "").trim(),
      theme_id: String(row.theme_id ?? "").trim(),
      selection_source: String(row.selection_source ?? "").trim(),
      position_xyz: positionXyz,
      bbox_xz: bboxXz,
      anchor_poi_type: String(row.anchor_poi_type ?? "").trim(),
      anchor_distance_m: asFiniteNumberOrNull(row.anchor_distance_m),
      feasibility_score: asFiniteNumberOrNull(row.feasibility_score),
      constraint_penalty: asFiniteNumberOrNull(row.constraint_penalty),
      dist_to_road_edge_m: asFiniteNumberOrNull(row.dist_to_road_edge_m),
      dist_to_nearest_junction_m: asFiniteNumberOrNull(row.dist_to_nearest_junction_m),
      dist_to_nearest_entrance_m: asFiniteNumberOrNull(row.dist_to_nearest_entrance_m),
    }) as JsonRecord;
  }
  return instances;
}

function buildStaticObjectDescriptions(): Record<string, StaticObjectDescription> {
  return {
    road_slab: {
      match: "exact",
      title: "机动车道",
      category: "roadway",
      source: "system",
      intro: "这是街道中的机动车道铺装面。",
      design_note: "承担机动车连续通行，并作为道路中心线与车道组织的依附基底。",
    },
    sidewalk_: {
      match: "prefix",
      title: "人行道铺装",
      category: "sidewalk",
      source: "system",
      intro: "这是街道的人行活动界面。",
      design_note: "为步行、停留和沿街活动提供连续可达的基础空间。",
    },
    curb_: {
      match: "prefix",
      title: "路缘石",
      category: "landscape",
      source: "system",
      intro: "这是车行与步行空间之间的边界构件。",
      design_note: "用于强化空间边界、组织排水，并提升行人与车辆分隔的可读性。",
    },
    centerline_mark_: {
      match: "prefix",
      title: "道路中心线",
      category: "marking",
      source: "system",
      intro: "这是机动车道的中心虚线标记。",
      design_note: "用于组织双向行驶秩序并强化道路方向识别。",
    },
    lane_mark_: {
      match: "prefix",
      title: "车道标线",
      category: "marking",
      source: "system",
      intro: "这是机动车道内的辅助标线。",
      design_note: "用于强化车道组织与行驶边界，提升整体交通可读性。",
    },
    crossing_patch_: {
      match: "prefix",
      title: "过街区",
      category: "crossing",
      source: "system",
      intro: "这是街道中的过街铺装区。",
      design_note: "用于提示行人过街位置，并在交叉口或重点界面提升可达性。",
    },
    tree_pit_: {
      match: "prefix",
      title: "树池",
      category: "landscape",
      source: "system",
      intro: "这是街树的种植基底。",
      design_note: "为树木生长提供透水与根系空间，同时构成街道绿化节奏。",
    },
    transit_pad_: {
      match: "prefix",
      title: "公交停靠面",
      category: "transit",
      source: "system",
      intro: "这是公交候车或停靠相关的铺装面。",
      design_note: "用于组织公交换乘与停靠，保障候车与上下车的空间清晰度。",
    },
    zoning_proxy_: {
      match: "prefix",
      title: "用地界面体块",
      category: "scene_object",
      source: "system",
      intro: "这是用于表达沿街用地和建筑界面的代理体块。",
      design_note: "用于在设计预览中快速表现街墙连续性和空间围合关系。",
    },
  };
}

function buildSceneBounds(layoutPayload: JsonRecord): JsonRecord {
  const placements = Array.isArray(layoutPayload.placements) ? layoutPayload.placements : [];
  const summary = (layoutPayload.summary ?? {}) as JsonRecord;
  const spatialContext = (summary.spatial_context ?? {}) as JsonRecord;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let maxY = 0;

  const includeXz = (x: number, z: number, padding = 0) => {
    minX = Math.min(minX, x - padding);
    maxX = Math.max(maxX, x + padding);
    minZ = Math.min(minZ, z - padding);
    maxZ = Math.max(maxZ, z + padding);
  };

  for (const placement of placements) {
    if (!placement || typeof placement !== "object") {
      continue;
    }
    const row = placement as JsonRecord;
    const bbox = asQuad(row.bbox_xz);
    if (bbox) {
      minX = Math.min(minX, bbox[0]);
      minZ = Math.min(minZ, bbox[1]);
      maxX = Math.max(maxX, bbox[2]);
      maxZ = Math.max(maxZ, bbox[3]);
    } else {
      const position = asTriplet(row.position_xyz);
      if (position) {
        includeXz(position[0], position[2], 0.75);
        maxY = Math.max(maxY, position[1]);
      }
    }
    const scaleY = asTriplet(row.scale_xyz)?.[1];
    if (scaleY !== null && scaleY !== undefined) {
      maxY = Math.max(maxY, scaleY);
    }
  }

  const roadHalfWidth = Math.max(3, asNumber(spatialContext.road_half_width_m, 6));
  const lengthM = Math.max(24, asNumber(spatialContext.length_m, asNumber(summary.length_m, 80)));
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    minX = -lengthM * 0.5;
    maxX = lengthM * 0.5;
    minZ = -roadHalfWidth * 3.5;
    maxZ = roadHalfWidth * 3.5;
  }

  const sizeX = Math.max(1, maxX - minX);
  const sizeZ = Math.max(1, maxZ - minZ);
  const sizeY = Math.max(12, maxY + 10);
  const roadAxis: [number, number, number] = sizeX >= sizeZ ? [1, 0, 0] : [0, 0, 1];

  return cleanForJson({
    center: [(minX + maxX) * 0.5, sizeY * 0.5, (minZ + maxZ) * 0.5],
    size: [sizeX, sizeY, sizeZ],
    road_axis: roadAxis,
  }) as JsonRecord;
}

function buildSpawnPayload(layoutPayload: Record<string, any>): {
  spawn_point: [number, number, number];
  forward_vector: [number, number, number];
} {
  const summary = layoutPayload.summary ?? {};
  const lengthM = Math.max(24, asNumber(summary.length_m, 80));
  return {
    spawn_point: [-(lengthM * 0.35), 1.65, 0],
    forward_vector: [1, 0, 0],
  };
}

function jsonResponse(res: any, statusCode: number, payload: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function textResponse(res: any, statusCode: number, message: string): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

function withRequestTiming(res: any, requestLabel: string, requestStart: number) {
  const startedAt = Number.isFinite(requestStart) ? requestStart : performance.now();
  return {
    sendJson(payload: Record<string, unknown>, statusCode: number, note = ""): void {
      const elapsed = (performance.now() - startedAt).toFixed(1);
      const suffix = note ? ` ${note}` : "";
      console.info(`[viewer-api-timing] ${requestLabel} -> ${statusCode} ${elapsed}ms${suffix}`);
      jsonResponse(res, statusCode, payload);
    },
    sendText(message: string, statusCode: number, note = ""): void {
      const elapsed = (performance.now() - startedAt).toFixed(1);
      const suffix = note ? ` ${note}` : "";
      console.info(`[viewer-api-timing] ${requestLabel} -> ${statusCode} ${elapsed}ms${suffix}`);
      textResponse(res, statusCode, message);
    },
  };
}

function contentTypeFor(filePath: string): string {
  const suffix = path.extname(filePath).toLowerCase();
  switch (suffix) {
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function viewerApiPlugin(): Plugin {
  return {
    name: "roadgen3d-viewer-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const PRESETS = [
          { id: "residential_narrow", name: "住宅区窄街道", description: "2车道, 1.5m人行道，安静住宅区风格", config: { lane_count: 2, sidewalk_width_m: 1.5, road_width_m: 6, density: 0.6, length_m: 60 } },
          { id: "commercial_wide", name: "商业区宽街道", description: "4车道, 3m人行道，繁华商业区风格", config: { lane_count: 4, sidewalk_width_m: 3, road_width_m: 12, density: 1.2, length_m: 100 } },
          { id: "park_boulevard", name: "公园大道", description: "绿化为主，宽敞林荫道", config: { lane_count: 2, sidewalk_width_m: 4, road_width_m: 8, density: 0.4, length_m: 120 } },
          { id: "transit_corridor", name: "公交走廊", description: "公交优先，2车道+公交专用道", config: { lane_count: 2, sidewalk_width_m: 2.5, road_width_m: 10, density: 1.0, length_m: 80 } },
          { id: "pedestrian_mall", name: "步行街", description: "纯步行区域，无机动车", config: { lane_count: 0, sidewalk_width_m: 8, road_width_m: 2, density: 1.5, length_m: 60 } },
          { id: "waterfront_promenade", name: "滨水步道", description: "沿河景观步道，休闲为主", config: { lane_count: 1, sidewalk_width_m: 5, road_width_m: 4, density: 0.3, length_m: 150 } },
          { id: "historic_district", name: "历史街区", description: "窄街小巷，文化保护风格", config: { lane_count: 1, sidewalk_width_m: 1.2, road_width_m: 4, density: 0.8, length_m: 50 } },
          { id: "mixed_use_avenue", name: "混合用途大道", description: "功能混合，平衡交通与步行", config: { lane_count: 2, sidewalk_width_m: 3, road_width_m: 8, density: 1.0, length_m: 80 } },
          { id: "industrial_road", name: "工业区道路", description: "货运优先，宽车道少家具", config: { lane_count: 4, sidewalk_width_m: 1.5, road_width_m: 14, density: 0.2, length_m: 120 } },
          { id: "school_zone", name: "学区道路", description: "安全优先，低速限速区域", config: { lane_count: 1, sidewalk_width_m: 4, road_width_m: 4, density: 0.9, length_m: 60 } },
        ];

        if (!req.url) {
          next();
          return;
        }

        const requestUrl = new URL(req.url, "http://127.0.0.1:4173");
        const requestStart = performance.now();
        const requestTimer = withRequestTiming(
          res,
          `${requestUrl.pathname}${requestUrl.search}`,
          requestStart,
        );
        const isLayoutRoute =
          requestUrl.pathname === "/api/layout" ||
          requestUrl.pathname === "/web-viewer/api/layout";
        const isRecentLayoutsRoute =
          requestUrl.pathname === "/api/recent-layouts" ||
          requestUrl.pathname === "/web-viewer/api/recent-layouts";
        const isFileRoute =
          requestUrl.pathname === "/api/file" ||
          requestUrl.pathname === "/web-viewer/api/file";
        const apiPrefix = requestUrl.pathname.startsWith("/web-viewer/")
          ? "/web-viewer/api"
          : "/api";

        if (isLayoutRoute) {
          const layoutHandlerStart = performance.now();
          const rawLayoutPath = requestUrl.searchParams.get("path");
          const layoutPath = resolveAllowedPath(rawLayoutPath);
          if (!layoutPath) {
            requestTimer.sendJson({ error: "Layout path must stay inside an allowed root." }, 403);
            return;
          }
          if (!fs.existsSync(layoutPath)) {
            requestTimer.sendJson({ error: `Layout file not found: ${layoutPath}` }, 404);
            return;
          }
          try {
            const layoutReadStart = performance.now();
            const rawLayoutText = fs.readFileSync(layoutPath, "utf-8");
            const layoutReadMs = (performance.now() - layoutReadStart).toFixed(1);
            const parseStart = performance.now();
            const layoutPayload = JSON.parse(rawLayoutText);
            const layoutParseMs = (performance.now() - parseStart).toFixed(1);
            const outputs = layoutPayload.outputs ?? {};
            const overrideScenePath = resolveAllowedPath(requestUrl.searchParams.get("scene_glb_path"));
            const referencedScenePath = resolveLayoutReferencedPath(outputs.scene_glb, layoutPath);
            const finalScenePath = (overrideScenePath && fs.existsSync(overrideScenePath))
              ? overrideScenePath
              : referencedScenePath;
            if (!finalScenePath || !fs.existsSync(finalScenePath)) {
              requestTimer.sendJson({
                error: "scene_layout.json does not point to a valid final scene GLB.",
                layout_path: layoutPath,
                scene_glb_path: overrideScenePath ?? "",
              }, 400);
              return;
            }
            const finalSceneCheckStart = performance.now();
            const finalSceneStats = fs.statSync(finalScenePath);
            const finalSceneCheckMs = (performance.now() - finalSceneCheckStart).toFixed(1);
            const buildStepsStart = performance.now();
            const productionSteps = Array.isArray(layoutPayload.production_steps)
              ? layoutPayload.production_steps
                  .map((step: Record<string, any>) => {
                    const glbPath = resolveLayoutReferencedPath(step.glb_path, layoutPath);
                    if (!glbPath || !fs.existsSync(glbPath)) {
                      return null;
                    }
                    return {
                      step_id: String(step.step_id ?? ""),
                      title: String(step.title ?? step.step_id ?? "Production Step"),
                      glb_url: `${apiPrefix}/file?path=${encodeURIComponent(glbPath)}`,
                    };
                  })
                  .filter(Boolean)
              : [];
            const buildStepsMs = (performance.now() - buildStepsStart).toFixed(1);

            const buildPayloadStart = performance.now();
            const spawnPayload = buildSpawnPayload(layoutPayload);
            const sceneBounds = buildSceneBounds(layoutPayload);
            const instances = buildInstancePayloads(layoutPayload);
            const assetDescriptions = buildAssetDescriptions(layoutPayload);
            const staticObjectDescriptions = buildStaticObjectDescriptions();
            const summary = (layoutPayload.summary ?? null) as JsonRecord | null;

            // Build layout overlay data (bands, building footprints, road length)
            const streetProgram = (layoutPayload.street_program ?? {}) as JsonRecord;
            const layoutBands = Array.isArray(streetProgram.bands) ? streetProgram.bands : [];
            const buildingFootprints = Array.isArray(layoutPayload.building_footprints) ? layoutPayload.building_footprints : [];
            const layoutConfig = (layoutPayload.config ?? {}) as JsonRecord;
            const overlayLengthM = asNumber(layoutConfig.length_m, 0);

            const audioProfile = (summary?.audio_profile ?? null) as JsonRecord | null;
            const buildPayloadMs = (performance.now() - buildPayloadStart).toFixed(1);

            requestTimer.sendJson({
              layout_path: layoutPath,
              summary,
              visual_style: (layoutPayload.visual_style ?? null) as JsonRecord | null,
              final_scene: {
                label: "Final Scene",
                glb_url: `${apiPrefix}/file?path=${encodeURIComponent(finalScenePath)}`,
              },
              production_steps: productionSteps,
              default_selection: "final_scene",
              spawn_point: spawnPayload.spawn_point,
              forward_vector: spawnPayload.forward_vector,
              scene_bounds: sceneBounds,
              instances,
              asset_descriptions: assetDescriptions,
              static_object_descriptions: staticObjectDescriptions,
              layout_overlay: {
                bands: layoutBands,
                building_footprints: buildingFootprints,
                length_m: overlayLengthM,
                lane_count: asNumber(streetProgram.lane_count, 1),
                road_width_m: asNumber(streetProgram.road_width_m, 0),
              },
              audio_profile: audioProfile,
              lighting_preset: String(outputs.lighting_preset ?? "bright_day"),
              lighting_params: (outputs.lighting_params ?? null) as JsonRecord | null,
              environment_state: (payload.environment_state ?? outputs.environment_state ?? null) as JsonRecord | null,
            }, 200,
              `layoutRead=${layoutReadMs}ms parse=${layoutParseMs}ms buildSteps=${buildStepsMs}ms payload=${buildPayloadMs}ms finalScene=${finalSceneStats.size}bytes finalSceneLookup=${finalSceneCheckMs}ms total=${(
                performance.now() - layoutHandlerStart
              ).toFixed(1)}ms`);
            return;
          } catch (error) {
            requestTimer.sendJson({
              error: error instanceof Error ? error.message : "Failed to parse scene layout.",
            }, 500, `layout_total=${(
              performance.now() - layoutHandlerStart
            ).toFixed(1)}ms`);
            return;
          }
        }

        if (isRecentLayoutsRoute) {
          const requestedLimit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "", 10);
          const requestedOffset = Number.parseInt(requestUrl.searchParams.get("offset") ?? "0", 10);
          const forceRefresh = requestUrl.searchParams.get("refresh") === "1"
            || requestUrl.searchParams.get("refresh") === "true";
          const limit = Number.isFinite(requestedLimit) ? requestedLimit : 20;
          const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0;
          const payload = await buildRecentLayoutsPayload(limit, forceRefresh, offset);
          const count = Array.isArray(payload.results) ? payload.results.length : 0;
          requestTimer.sendJson(payload, 200, `results=${count}`);
          return;
        }

        if (isFileRoute) {
          const fileRouteStart = performance.now();
          const rawFilePath = requestUrl.searchParams.get("path");
          const filePath = resolveAllowedPath(rawFilePath);
          if (!filePath) {
            requestTimer.sendText("Requested file must stay inside an allowed root.", 403);
            return;
          }
          if (!fs.existsSync(filePath)) {
            requestTimer.sendText(`File not found: ${filePath}`, 404);
            return;
          }
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) {
            requestTimer.sendText(`Not a regular file: ${filePath}`, 400);
            return;
          }
          res.on("finish", () => {
            const transferMs = (performance.now() - fileRouteStart).toFixed(1);
            console.info(
              `[viewer-api-timing] ${requestUrl.pathname}${requestUrl.search} transfer complete size=${stats.size}bytes ${transferMs}ms`,
            );
          });
          res.statusCode = 200;
          res.setHeader("Content-Type", contentTypeFor(filePath));
          res.setHeader("Content-Length", String(stats.size));
          console.info(
            `[viewer-api-timing] ${requestUrl.pathname}${requestUrl.search} -> 200 start stream ${stats.size}bytes`,
          );
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        /* ── Asset Manifest API ─────────────────────────────────────── */

        const isAssetManifestsRoute =
          requestUrl.pathname === "/api/asset-manifests" ||
          requestUrl.pathname === "/web-viewer/api/asset-manifests";
        const isAssetManifestDataRoute =
          requestUrl.pathname === "/api/asset-manifest" ||
          requestUrl.pathname === "/web-viewer/api/asset-manifest";
        const isAssetManifestSaveRoute =
          requestUrl.pathname === "/api/asset-manifest/save" ||
          requestUrl.pathname === "/web-viewer/api/asset-manifest/save";
        const isAssetManifestBulkSaveRoute =
          requestUrl.pathname === "/api/asset-manifest/bulk-save" ||
          requestUrl.pathname === "/web-viewer/api/asset-manifest/bulk-save";
        const isAssetManifestCreateRoute =
          requestUrl.pathname === "/api/asset-manifest/create" ||
          requestUrl.pathname === "/web-viewer/api/asset-manifest/create";
        const isAssetManifestNormalizeRoute =
          requestUrl.pathname === "/api/asset-manifest/normalize-mesh" ||
          requestUrl.pathname === "/web-viewer/api/asset-manifest/normalize-mesh";
        const isAssetManifestBackendSplitRoute =
          requestUrl.pathname === "/api/asset-manifest/split-selected" ||
          requestUrl.pathname === "/web-viewer/api/asset-manifest/split-selected";

        if (isAssetManifestBackendSplitRoute) {
          if (req.method !== "POST") {
            jsonResponse(res, 405, { error: "Method not allowed. Use POST." });
            return;
          }
          const body = await readRequestBody(req);
          let parsed: {
            manifest_name?: string;
            asset_id?: string;
            method?: string;
            projection_margin?: number;
          };
          try {
            parsed = JSON.parse(body) as typeof parsed;
          } catch {
            jsonResponse(res, 400, { error: "Invalid JSON body." });
            return;
          }

          const manifestName = String(parsed.manifest_name ?? "").trim();
          const assetId = String(parsed.asset_id ?? "").trim();
          const method = String(parsed.method ?? "auto").trim() || "auto";
          const projectionMargin = Number(parsed.projection_margin ?? 0.03);
          if (!manifestName || !assetId) {
            jsonResponse(res, 400, { error: "Missing manifest_name or asset_id." });
            return;
          }
          if (!new Set(["auto", "primitive", "projection", "loose-3d"]).has(method)) {
            jsonResponse(res, 400, { error: `Unsupported split method: ${method}` });
            return;
          }
          if (!Number.isFinite(projectionMargin) || projectionMargin < 0) {
            jsonResponse(res, 400, { error: "Invalid projection_margin." });
            return;
          }

          const manifestPath = resolveAssetManifestPath(manifestName);
          if (!manifestPath) {
            jsonResponse(res, 403, { error: "Invalid manifest name." });
            return;
          }
          if (!fs.existsSync(manifestPath)) {
            jsonResponse(res, 404, { error: `Manifest not found: ${manifestName}` });
            return;
          }

          const rawLines = fs.readFileSync(manifestPath, "utf-8").split(/\r?\n/);
          const rows: JsonRecord[] = [];
          for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              rows.push(JSON.parse(trimmed) as JsonRecord);
            } catch {
              // Preserve legacy malformed rows; they are not candidates for splitting.
            }
          }

          const parent = rows.find((record) => String(record.asset_id ?? "") === assetId);
          if (!parent) {
            jsonResponse(res, 404, { error: `Asset not found: ${assetId}` });
            return;
          }

          const parentMeshPath = resolveManifestAssetPath(
            typeof parent.mesh_path === "string" ? parent.mesh_path : "",
            manifestPath,
          );
          if (!parentMeshPath || !fs.existsSync(parentMeshPath)) {
            jsonResponse(res, 404, { error: `Mesh file not found: ${parentMeshPath}` });
            return;
          }

          const scriptPath = path.resolve(repoRoot, "scripts", "split_glb_signs.py");
          if (!fs.existsSync(scriptPath)) {
            jsonResponse(res, 500, { error: `Splitter script not found: ${scriptPath}` });
            return;
          }

          const outputBase = path.join(path.dirname(manifestPath), "assets_split", safeAssetFileStem(assetId));
          const runStamp = splitIsoRunStamp();
          const outputMethod = method === "auto" ? "auto_or_primitive" : method;
          let outputDir = path.join(outputBase, `${outputMethod}_${runStamp}`);
          let suffix = 2;
          while (fs.existsSync(outputDir)) {
            outputDir = path.join(outputBase, `${outputMethod}_${runStamp}_${suffix}`);
            suffix += 1;
          }

          const pythonBin = process.env.ROADGEN_PYTHON_BIN || "python3";
          const { spawnSync } = await import("node:child_process");
          const result = spawnSync(
            pythonBin,
            [
              scriptPath,
              "--method",
              method,
              "--input",
              parentMeshPath,
              "--output-dir",
              outputDir,
              "--projection-margin",
              String(projectionMargin),
              "--write-preview",
            ],
            {
              cwd: repoRoot,
              encoding: "utf-8",
              timeout: 30 * 60 * 1000,
              maxBuffer: 64 * 1024 * 1024,
            },
          );
          const scriptOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
          if (result.error || result.status !== 0) {
            jsonResponse(res, result.error?.name === "ETIMEDOUT" ? 504 : 500, {
              error: result.error?.message || `Asset split failed with exit code ${result.status}`,
              output: scriptOutput.slice(-12000),
            });
            return;
          }

          let reportPath = path.join(outputDir, "clusters_split.json");
          if (!fs.existsSync(reportPath)) {
            reportPath = path.join(outputDir, "clusters_projection.json");
          }
          if (!fs.existsSync(reportPath)) {
            jsonResponse(res, 500, {
              error: "Split finished without clusters_split.json or clusters_projection.json.",
              output: scriptOutput.slice(-12000),
            });
            return;
          }

          let report: JsonRecord;
          try {
            report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as JsonRecord;
          } catch (error) {
            jsonResponse(res, 500, { error: `Invalid split report: ${error}` });
            return;
          }
          const clusters = Array.isArray(report.clusters) ? report.clusters as JsonRecord[] : null;
          if (!clusters) {
            jsonResponse(res, 500, { error: "Split report does not contain a clusters list." });
            return;
          }
          const actualMethod = String(report.actual_method ?? report.method ?? method);
          const fallbackReason = report.fallback_reason ?? null;

          const glbFiles = fs.readdirSync(outputDir)
            .filter((fileName) => /^sign_\d+\.glb$/i.test(fileName))
            .sort()
            .map((fileName) => path.join(outputDir, fileName));
          if (glbFiles.length !== clusters.length) {
            jsonResponse(res, 500, {
              error: `Split output mismatch: ${glbFiles.length} GLB files for ${clusters.length} clusters.`,
              output: scriptOutput.slice(-12000),
            });
            return;
          }

          const existingIds = new Set(rows.map((record) => String(record.asset_id ?? "")).filter(Boolean));
          const createdRecords = glbFiles.map((glbPath, index) =>
            buildBackendSplitChildRecord(
              parent,
              parentMeshPath,
              outputDir,
              glbPath,
              clusters[index] ?? {},
              index + 1,
              existingIds,
              actualMethod,
            )
          );

          const existingText = fs.readFileSync(manifestPath, "utf-8").trimEnd();
          const appendedText = createdRecords.map((record) => JSON.stringify(record)).join("\n");
          fs.writeFileSync(manifestPath, `${existingText ? `${existingText}\n` : ""}${appendedText}\n`, "utf-8");
          cachedAssetDescriptionIndex = null;

          jsonResponse(res, 200, {
            ok: true,
            manifest_name: manifestName,
            asset_id: assetId,
            requested_method: method,
            method: actualMethod,
            actual_method: actualMethod,
            fallback_reason: fallbackReason,
            output_dir: outputDir,
            cluster_count: clusters.length,
            created_count: createdRecords.length,
            total_face_count: clusters.reduce((sum, cluster) => sum + Number(cluster.face_count ?? 0), 0),
            report_path: reportPath,
            preview_paths: {
              top: path.join(outputDir, "projection_top.svg"),
              front: path.join(outputDir, "projection_front.svg"),
            },
            assets: createdRecords.map((record) => normalizeManifestRecordPaths({ ...record }, manifestPath)),
            script_output_tail: scriptOutput.slice(-12000),
          });
          return;
        }

        if (isAssetManifestsRoute) {
          const manifests: Array<{ name: string; label: string; count: number }> = [];
          
          // Helper function to scan a directory for manifests
          const scanManifestDir = (dirPath: string, prefix: string = "") => {
            if (!fs.existsSync(dirPath)) return;
            const entries = fs.readdirSync(dirPath);
            for (const entry of entries) {
              if (!entry.endsWith(".jsonl")) continue;
              const fullPath = path.join(dirPath, entry);
              if (!fs.statSync(fullPath).isFile()) continue;
              const lines = fs.readFileSync(fullPath, "utf-8").split(/\r?\n/);
              let count = 0;
              for (const line of lines) {
                if (line.trim()) count++;
              }
              const baseName = entry.replace(/\.jsonl$/, "").replace(/[_-]/g, " ");
              const label = baseName.charAt(0).toUpperCase() + baseName.slice(1);
              // Use prefix in name to distinguish manifests from different directories
              const name = prefix ? `${prefix}/${entry}` : entry;
              manifests.push({ name, label: prefix ? `[${prefix}] ${label}` : label, count });
            }
          };
          
          // Scan main directory
          scanManifestDir(ASSET_MANIFESTS_DIR);
          
          // Scan extra directories with prefix
          for (const extraDir of EXTRA_ASSET_MANIFEST_DIRS) {
            const dirName = path.basename(extraDir);
            scanManifestDir(extraDir, dirName);
          }
          
          jsonResponse(res, 200, { manifests });
          return;
        }

        if (isAssetManifestDataRoute) {
          const manifestName = requestUrl.searchParams.get("name") ?? "";
          if (!manifestName) {
            jsonResponse(res, 400, { error: "Missing 'name' query parameter." });
            return;
          }
          
          // Resolve manifest path - check if it has a prefix (e.g., "street_furniture/file.jsonl")
          let manifestPath: string | null = null;
          
          if (manifestName.includes("/")) {
            // Has prefix - look in extra directories
            const [prefix, fileName] = manifestName.split("/", 2);
            const extraDir = EXTRA_ASSET_MANIFEST_DIRS.find(
              (dir) => path.basename(dir) === prefix
            );
            if (extraDir) {
              const candidate = path.join(extraDir, fileName);
              // Ensure path is within the extra directory
              const relative = path.relative(extraDir, candidate);
              if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
                manifestPath = candidate;
              }
            }
          } else {
            // No prefix - look in main directory
            const candidate = path.resolve(ASSET_MANIFESTS_DIR, manifestName);
            const relative = path.relative(ASSET_MANIFESTS_DIR, candidate);
            if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
              manifestPath = candidate;
            }
          }
          
          if (!manifestPath) {
            jsonResponse(res, 403, { error: "Invalid manifest name." });
            return;
          }
          if (!fs.existsSync(manifestPath)) {
            jsonResponse(res, 404, { error: `Manifest not found: ${manifestName}` });
            return;
          }
          
          // Parse pagination parameters
          const offset = Math.max(0, parseInt(requestUrl.searchParams.get("offset") ?? "0", 10) || 0);
          const limit = Math.min(500, Math.max(1, parseInt(requestUrl.searchParams.get("limit") ?? "100", 10) || 100));
          
          const recordLines = fs.readFileSync(manifestPath, "utf-8")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          const order = requestUrl.searchParams.get("order") ?? "latest";
          const orderedLines = order === "file" ? recordLines : recordLines.slice().reverse();
          const totalCount = recordLines.length;
          const assets: JsonRecord[] = [];
          const pageLines = orderedLines.slice(offset, offset + limit);
          
          for (const line of pageLines) {
            try {
              const record = normalizeManifestRecordPaths(
                JSON.parse(line) as JsonRecord,
                manifestPath,
              );
              assets.push(record);
            } catch {
              // Skip invalid JSON
            }
          }
          
          jsonResponse(res, 200, { 
            assets, 
            total: totalCount,
            offset,
            limit,
            hasMore: offset + assets.length < totalCount
          });
          return;
        }

        if (isAssetManifestSaveRoute) {
          if (req.method !== "POST") {
            jsonResponse(res, 405, { error: "Method not allowed. Use POST." });
            return;
          }
          const body = await readRequestBody(req);
          let parsed: { manifest_name?: string; asset_id?: string; updates?: JsonRecord };
          try {
            parsed = JSON.parse(body) as typeof parsed;
          } catch {
            jsonResponse(res, 400, { error: "Invalid JSON body." });
            return;
          }
          const { manifest_name: mName, asset_id: aId, updates } = parsed;
          if (!mName || !aId) {
            jsonResponse(res, 400, { error: "Missing manifest_name or asset_id." });
            return;
          }
          
          // Resolve manifest path - check if it has a prefix
          let manifestPath: string | null = null;
          
          if (mName.includes("/")) {
            // Has prefix - look in extra directories
            const [prefix, fileName] = mName.split("/", 2);
            const extraDir = EXTRA_ASSET_MANIFEST_DIRS.find(
              (dir) => path.basename(dir) === prefix
            );
            if (extraDir) {
              const candidate = path.join(extraDir, fileName);
              const relative = path.relative(extraDir, candidate);
              if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
                manifestPath = candidate;
              }
            }
          } else {
            // No prefix - look in main directory
            const candidate = path.resolve(ASSET_MANIFESTS_DIR, mName);
            const relative = path.relative(ASSET_MANIFESTS_DIR, candidate);
            if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
              manifestPath = candidate;
            }
          }
          
          if (!manifestPath) {
            jsonResponse(res, 403, { error: "Invalid manifest name." });
            return;
          }
          if (!fs.existsSync(manifestPath)) {
            jsonResponse(res, 404, { error: `Manifest not found: ${mName}` });
            return;
          }
          const rawLines = fs.readFileSync(manifestPath, "utf-8").split(/\r?\n/);
          const newLines: string[] = [];
          let found = false;
          for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) {
              newLines.push(line);
              continue;
            }
            try {
              const record = JSON.parse(trimmed) as JsonRecord;
              if (String(record.asset_id ?? "") === aId) {
                const merged = { ...record, ...(updates ?? {}) };
                newLines.push(JSON.stringify(merged));
                found = true;
              } else {
                newLines.push(trimmed);
              }
            } catch {
              newLines.push(line);
            }
          }
          if (!found) {
            jsonResponse(res, 404, { error: `Asset not found: ${aId}` });
            return;
          }
          fs.writeFileSync(manifestPath, newLines.join("\n"), "utf-8");
          cachedAssetDescriptionIndex = null;
          jsonResponse(res, 200, { ok: true });
          return;
        }

        if (isAssetManifestBulkSaveRoute) {
          if (req.method !== "POST") {
            jsonResponse(res, 405, { error: "Method not allowed. Use POST." });
            return;
          }
          const body = await readRequestBody(req);
          let parsed: { manifest_name?: string; asset_ids?: unknown; scope?: string; updates?: JsonRecord };
          try {
            parsed = JSON.parse(body) as typeof parsed;
          } catch {
            jsonResponse(res, 400, { error: "Invalid JSON body." });
            return;
          }
          const manifestName = String(parsed.manifest_name ?? "").trim();
          const scope = String(parsed.scope ?? "selected").trim().toLowerCase();
          const updates = parsed.updates && typeof parsed.updates === "object" ? parsed.updates : null;
          const assetIds = Array.isArray(parsed.asset_ids)
            ? Array.from(new Set(parsed.asset_ids.map((item) => String(item ?? "").trim()).filter(Boolean)))
            : [];
          if (!manifestName || !updates) {
            jsonResponse(res, 400, { error: "Missing manifest_name or updates." });
            return;
          }
          if (scope !== "all" && assetIds.length === 0) {
            jsonResponse(res, 400, { error: "Missing asset_ids for selected bulk update." });
            return;
          }
          const manifestPath = resolveAssetManifestPath(manifestName);
          if (!manifestPath) {
            jsonResponse(res, 403, { error: "Invalid manifest name." });
            return;
          }
          if (!fs.existsSync(manifestPath)) {
            jsonResponse(res, 404, { error: `Manifest not found: ${manifestName}` });
            return;
          }

          const wantedIds = new Set(assetIds);
          const seenIds = new Set<string>();
          const rawLines = fs.readFileSync(manifestPath, "utf-8").split(/\r?\n/);
          const newLines: string[] = [];
          let updatedCount = 0;
          for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) {
              newLines.push(line);
              continue;
            }
            try {
              const record = JSON.parse(trimmed) as JsonRecord;
              const assetId = String(record.asset_id ?? "").trim();
              const shouldUpdate = scope === "all" || wantedIds.has(assetId);
              if (assetId && shouldUpdate) {
                const merged = { ...record, ...updates };
                newLines.push(JSON.stringify(merged));
                seenIds.add(assetId);
                updatedCount += 1;
              } else {
                newLines.push(trimmed);
              }
            } catch {
              newLines.push(line);
            }
          }
          const missingAssetIds = assetIds.filter((assetId) => !seenIds.has(assetId));
          if (scope !== "all" && updatedCount === 0) {
            jsonResponse(res, 404, { error: "No matching assets found.", missing_asset_ids: missingAssetIds });
            return;
          }
          fs.writeFileSync(manifestPath, newLines.join("\n"), "utf-8");
          cachedAssetDescriptionIndex = null;
          jsonResponse(res, 200, {
            ok: true,
            updated_count: updatedCount,
            missing_asset_ids: missingAssetIds,
          });
          return;
        }

        if (isAssetManifestCreateRoute) {
          if (req.method !== "POST") {
            jsonResponse(res, 405, { error: "Method not allowed. Use POST." });
            return;
          }
          const body = await readRequestBody(req);
          let parsed: {
            manifest_name?: string;
            assets?: Array<{ asset_id?: string; record?: JsonRecord; glb_base64?: string }>;
          };
          try {
            parsed = JSON.parse(body) as typeof parsed;
          } catch {
            jsonResponse(res, 400, { error: "Invalid JSON body." });
            return;
          }

          const manifestName = parsed.manifest_name ?? "";
          const manifestPath = resolveAssetManifestPath(manifestName);
          if (!manifestPath) {
            jsonResponse(res, 403, { error: "Invalid manifest name." });
            return;
          }
          if (!fs.existsSync(manifestPath)) {
            jsonResponse(res, 404, { error: `Manifest not found: ${manifestName}` });
            return;
          }
          if (!Array.isArray(parsed.assets) || parsed.assets.length === 0) {
            jsonResponse(res, 400, { error: "Missing assets." });
            return;
          }

          const rawLines = fs.readFileSync(manifestPath, "utf-8").split(/\r?\n/);
          const existingIds = new Set<string>();
          for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const record = JSON.parse(trimmed) as JsonRecord;
              const id = String(record.asset_id ?? "");
              if (id) existingIds.add(id);
            } catch {
              // Ignore malformed legacy rows while preserving the file below.
            }
          }

          fs.mkdirSync(SPLIT_ASSET_MESH_DIR, { recursive: true });
          const createdRecords: JsonRecord[] = [];
          for (const item of parsed.assets) {
            const assetId = String(item.asset_id ?? item.record?.asset_id ?? "").trim();
            const glbBase64 = String(item.glb_base64 ?? "");
            if (!assetId || !item.record || !glbBase64) {
              jsonResponse(res, 400, { error: "Each asset must include asset_id, record, and glb_base64." });
              return;
            }
            if (existingIds.has(assetId)) {
              jsonResponse(res, 409, { error: `Asset already exists: ${assetId}` });
              return;
            }

            const glbBuffer = Buffer.from(glbBase64, "base64");
            if (glbBuffer.length === 0) {
              jsonResponse(res, 400, { error: `Empty GLB payload for ${assetId}` });
              return;
            }

            const meshPath = path.join(SPLIT_ASSET_MESH_DIR, `${safeAssetFileStem(assetId)}.glb`);
            fs.writeFileSync(meshPath, glbBuffer);
            const record = {
              ...item.record,
              asset_id: assetId,
              mesh_path: meshPath,
            };
            createdRecords.push(record);
            existingIds.add(assetId);
          }

          const existingText = fs.readFileSync(manifestPath, "utf-8").trimEnd();
          const appendedText = createdRecords.map((record) => JSON.stringify(record)).join("\n");
          fs.writeFileSync(manifestPath, `${existingText ? `${existingText}\n` : ""}${appendedText}\n`, "utf-8");
          cachedAssetDescriptionIndex = null;
          jsonResponse(res, 200, {
            ok: true,
            assets: createdRecords.map((record) => normalizeManifestRecordPaths({ ...record }, manifestPath)),
          });
          return;
        }

        if (isAssetManifestNormalizeRoute) {
          if (req.method !== "POST") {
            jsonResponse(res, 405, { error: "Method not allowed. Use POST." });
            return;
          }
          const body = await readRequestBody(req);
          let parsed: {
            manifest_name?: string;
            asset_id?: string;
            glb_base64?: string;
            updates?: JsonRecord;
          };
          try {
            parsed = JSON.parse(body) as typeof parsed;
          } catch {
            jsonResponse(res, 400, { error: "Invalid JSON body." });
            return;
          }

          const manifestName = parsed.manifest_name ?? "";
          const assetId = String(parsed.asset_id ?? "").trim();
          const glbBase64 = String(parsed.glb_base64 ?? "");
          if (!manifestName || !assetId || !glbBase64) {
            jsonResponse(res, 400, { error: "Missing manifest_name, asset_id, or glb_base64." });
            return;
          }

          const manifestPath = resolveAssetManifestPath(manifestName);
          if (!manifestPath) {
            jsonResponse(res, 403, { error: "Invalid manifest name." });
            return;
          }
          if (!fs.existsSync(manifestPath)) {
            jsonResponse(res, 404, { error: `Manifest not found: ${manifestName}` });
            return;
          }

          fs.mkdirSync(NORMALIZED_ASSET_MESH_DIR, { recursive: true });
          const meshPath = path.join(NORMALIZED_ASSET_MESH_DIR, `${safeAssetFileStem(assetId)}.glb`);
          const glbBuffer = Buffer.from(glbBase64, "base64");
          if (glbBuffer.length === 0) {
            jsonResponse(res, 400, { error: "Empty GLB payload." });
            return;
          }
          fs.writeFileSync(meshPath, glbBuffer);

          const rawLines = fs.readFileSync(manifestPath, "utf-8").split(/\r?\n/);
          const newLines: string[] = [];
          let found = false;
          let normalizedRecord: JsonRecord | null = null;
          for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) {
              newLines.push(line);
              continue;
            }
            try {
              const record = JSON.parse(trimmed) as JsonRecord;
              if (String(record.asset_id ?? "") === assetId) {
                normalizedRecord = {
                  ...record,
                  ...(parsed.updates ?? {}),
                  asset_id: assetId,
                  mesh_path: meshPath,
                };
                newLines.push(JSON.stringify(normalizedRecord));
                found = true;
              } else {
                newLines.push(trimmed);
              }
            } catch {
              newLines.push(line);
            }
          }

          if (!found || !normalizedRecord) {
            jsonResponse(res, 404, { error: `Asset not found: ${assetId}` });
            return;
          }

          fs.writeFileSync(manifestPath, newLines.join("\n"), "utf-8");
          cachedAssetDescriptionIndex = null;
          jsonResponse(res, 200, {
            ok: true,
            asset: normalizeManifestRecordPaths({ ...normalizedRecord }, manifestPath),
          });
          return;
        }

        /* ── Asset Manifest Delete API ─────────────────────────────── */
        const isAssetManifestDeleteRoute =
          requestUrl.pathname === "/api/asset-manifest/delete" ||
          requestUrl.pathname === "/web-viewer/api/asset-manifest/delete";

        if (isAssetManifestDeleteRoute) {
          if (req.method !== "POST") {
            jsonResponse(res, 405, { error: "Method not allowed. Use POST." });
            return;
          }
          const body = await readRequestBody(req);
          let parsed: { manifest_name?: string; asset_id?: string };
          try {
            parsed = JSON.parse(body) as typeof parsed;
          } catch {
            jsonResponse(res, 400, { error: "Invalid JSON body." });
            return;
          }
          const { manifest_name: mName, asset_id: aId } = parsed;
          if (!mName || !aId) {
            jsonResponse(res, 400, { error: "Missing manifest_name or asset_id." });
            return;
          }
          
          // Resolve manifest path
          let manifestPath: string | null = null;
          
          if (mName.includes("/")) {
            const [prefix, fileName] = mName.split("/", 2);
            const extraDir = EXTRA_ASSET_MANIFEST_DIRS.find(
              (dir) => path.basename(dir) === prefix
            );
            if (extraDir) {
              const candidate = path.join(extraDir, fileName);
              const relative = path.relative(extraDir, candidate);
              if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
                manifestPath = candidate;
              }
            }
          } else {
            const candidate = path.resolve(ASSET_MANIFESTS_DIR, mName);
            const relative = path.relative(ASSET_MANIFESTS_DIR, candidate);
            if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
              manifestPath = candidate;
            }
          }
          
          if (!manifestPath) {
            jsonResponse(res, 403, { error: "Invalid manifest name." });
            return;
          }
          if (!fs.existsSync(manifestPath)) {
            jsonResponse(res, 404, { error: `Manifest not found: ${mName}` });
            return;
          }
          
          const rawLines = fs.readFileSync(manifestPath, "utf-8").split(/\r?\n/);
          const newLines: string[] = [];
          let found = false;
          for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) {
              newLines.push(line);
              continue;
            }
            try {
              const record = JSON.parse(trimmed) as JsonRecord;
              if (String(record.asset_id ?? "") === aId) {
                found = true;
                // Skip this line (delete it)
              } else {
                newLines.push(trimmed);
              }
            } catch {
              newLines.push(line);
            }
          }
          if (!found) {
            jsonResponse(res, 404, { error: `Asset not found: ${aId}` });
            return;
          }
          fs.writeFileSync(manifestPath, newLines.join("\n"), "utf-8");
          cachedAssetDescriptionIndex = null;
          jsonResponse(res, 200, { ok: true });
          return;
        }

        const isScenesDiffImageRoute =
          requestUrl.pathname === "/api/scenes/diff/image" ||
          requestUrl.pathname === "/web-viewer/api/scenes/diff/image";
        if (isScenesDiffImageRoute) {
          const layoutA = requestUrl.searchParams.get("layout_a") ?? "";
          const layoutB = requestUrl.searchParams.get("layout_b") ?? "";
          const mode = requestUrl.searchParams.get("mode") ?? "overlay";
          const layoutAPath = resolveAllowedPath(layoutA);
          const layoutBPath = resolveAllowedPath(layoutB);
          if (!layoutAPath || !layoutBPath) {
            jsonResponse(res, 403, { error: "Layout paths must stay inside allowed roots." });
            return;
          }
          if (!fs.existsSync(layoutAPath) || !fs.existsSync(layoutBPath)) {
            jsonResponse(res, 404, { error: "One or both layout files not found." });
            return;
          }
          if (mode !== "overlay" && mode !== "delta") {
            jsonResponse(res, 400, { error: "Invalid mode. Use overlay or delta." });
            return;
          }

          const statA = fs.statSync(layoutAPath);
          const statB = fs.statSync(layoutBPath);
          const crypto = await import("node:crypto");
          const hash = crypto
            .createHash("sha256")
            .update(`${layoutAPath}:${statA.mtimeMs}:${statA.size}|${layoutBPath}:${statB.mtimeMs}:${statB.size}|${mode}`)
            .digest("hex")
            .slice(0, 16);
          const cacheDir = path.resolve(repoRoot, "artifacts", "diff_images");
          fs.mkdirSync(cacheDir, { recursive: true });
          const cachePath = path.resolve(cacheDir, `${hash}_${mode}.png`);

          if (fs.existsSync(cachePath)) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "image/png");
            const stats = fs.statSync(cachePath);
            res.setHeader("Content-Length", String(stats.size));
            res.setHeader("Cache-Control", "public, max-age=3600");
            fs.createReadStream(cachePath).pipe(res);
            return;
          }

          const pythonBin = process.env.ROADGEN_PYTHON_BIN || "python3";
          const scriptPath = path.resolve(repoRoot, "scripts", "render_diff_image.py");
          const { spawnSync } = await import("node:child_process");
          const result = spawnSync(
            pythonBin,
            [scriptPath, "--mode", mode, "--layout-a", layoutAPath, "--layout-b", layoutBPath, "--out", cachePath],
            { encoding: "utf-8", timeout: 120000 },
          );

          if (result.status !== 0 || !fs.existsSync(cachePath)) {
            jsonResponse(res, 500, { error: "Diff rendering failed.", stderr: result.stderr });
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "image/png");
          const stats = fs.statSync(cachePath);
          res.setHeader("Content-Length", String(stats.size));
          res.setHeader("Cache-Control", "public, max-age=3600");
          fs.createReadStream(cachePath).pipe(res);
          return;
        }

        const isPresetsRoute =
          requestUrl.pathname === "/api/presets" ||
          requestUrl.pathname === "/web-viewer/api/presets";
        if (isPresetsRoute) {
          jsonResponse(res, 200, { presets: PRESETS });
          return;
        }

        next();
      });
    },
  };
}

function readRequestBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export default defineConfig({
  base: "/",
  plugins: [viewerApiPlugin()],
});
