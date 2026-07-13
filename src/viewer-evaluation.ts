import { clamp, escapeHtml } from "./viewer-utils";
import { API_BASE } from "./sg-constants";

export type EvaluationConfig = {
  aggregation: {
    dimension_weights: {
      walkability: number;
      safety: number;
      beauty: number;
    };
  };
  walkability: {
    clear_width_min: number;
    clear_width_ideal: number;
    amenity_density_ideal: number;
    amenity_count_density_ideal: number;
    lamp_spacing_m: number;
    transit_stop_spacing_m: number;
    crossing_spacing_m: number;
    entrance_density_ideal: number;
    tree_shade_grid_resolution_m: number;
    tree_sun_azimuth_deg: number;
    tree_sun_elevation_deg: number;
    tree_canopy_center_height_ratio: number;
    tree_canopy_vertical_ratio: number;
  };
};

export type EvaluationConfigField =
  | "aggregation.dimension_weights.walkability"
  | "aggregation.dimension_weights.safety"
  | "aggregation.dimension_weights.beauty"
  | `walkability.${keyof EvaluationConfig["walkability"]}`;

export type EvaluationConfigIssue = {
  field: EvaluationConfigField;
  message: string;
};

export const EVALUATION_CONFIG_STORAGE_KEY = "roadgen3d.evaluation.config.v1";

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  aggregation: {
    dimension_weights: {
      walkability: 1,
      safety: 1,
      beauty: 1,
    },
  },
  walkability: {
    clear_width_min: 1.8,
    clear_width_ideal: 3.2,
    amenity_density_ideal: 0.15,
    amenity_count_density_ideal: 0.15,
    lamp_spacing_m: 25,
    transit_stop_spacing_m: 400,
    crossing_spacing_m: 80,
    entrance_density_ideal: 0.04,
    tree_shade_grid_resolution_m: 0.5,
    tree_sun_azimuth_deg: 180,
    tree_sun_elevation_deg: 45,
    tree_canopy_center_height_ratio: 0.7,
    tree_canopy_vertical_ratio: 0.25,
  },
};

export function cloneEvaluationConfig(config: EvaluationConfig = DEFAULT_EVALUATION_CONFIG): EvaluationConfig {
  return {
    aggregation: {
      dimension_weights: {
        walkability: config.aggregation.dimension_weights.walkability,
        safety: config.aggregation.dimension_weights.safety,
        beauty: config.aggregation.dimension_weights.beauty,
      },
    },
    walkability: {
      clear_width_min: config.walkability.clear_width_min,
      clear_width_ideal: config.walkability.clear_width_ideal,
      amenity_density_ideal: config.walkability.amenity_density_ideal,
      amenity_count_density_ideal: config.walkability.amenity_count_density_ideal,
      lamp_spacing_m: config.walkability.lamp_spacing_m,
      transit_stop_spacing_m: config.walkability.transit_stop_spacing_m,
      crossing_spacing_m: config.walkability.crossing_spacing_m,
      entrance_density_ideal: config.walkability.entrance_density_ideal,
      tree_shade_grid_resolution_m: config.walkability.tree_shade_grid_resolution_m,
      tree_sun_azimuth_deg: config.walkability.tree_sun_azimuth_deg,
      tree_sun_elevation_deg: config.walkability.tree_sun_elevation_deg,
      tree_canopy_center_height_ratio: config.walkability.tree_canopy_center_height_ratio,
      tree_canopy_vertical_ratio: config.walkability.tree_canopy_vertical_ratio,
    },
  };
}

export function validateEvaluationConfig(config: EvaluationConfig): EvaluationConfigIssue[] {
  const issues: EvaluationConfigIssue[] = [];
  const check = (
    field: EvaluationConfigField,
    value: number,
    minExclusive: number,
    maxInclusive: number,
    label: string,
  ): void => {
    if (!Number.isFinite(value) || value <= minExclusive || value > maxInclusive) {
      issues.push({
        field,
        message: `${label} must be greater than ${minExclusive} and at most ${maxInclusive}.`,
      });
    }
  };

  const weights = config.aggregation.dimension_weights;
  const weightEntries: Array<[EvaluationConfigField, number, string]> = [
    ["aggregation.dimension_weights.walkability", weights.walkability, "Walkability weight"],
    ["aggregation.dimension_weights.safety", weights.safety, "Safety weight"],
    ["aggregation.dimension_weights.beauty", weights.beauty, "Beauty weight"],
  ];
  for (const [field, value, label] of weightEntries) {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
      issues.push({ field, message: `${label} must be between 0 and 1000000.` });
    }
  }
  if (
    weightEntries.every(([, value]) => Number.isFinite(value))
    && weightEntries.reduce((sum, [, value]) => sum + value, 0) <= 0
  ) {
    issues.push({
      field: "aggregation.dimension_weights.walkability",
      message: "At least one composite weight must be greater than zero.",
    });
  }

  const walkability = config.walkability;
  if (
    !Number.isFinite(walkability.clear_width_min)
    || walkability.clear_width_min < 0
    || walkability.clear_width_min > 100
  ) {
    issues.push({
      field: "walkability.clear_width_min",
      message: "Minimum clear width must be between 0 and 100.",
    });
  }
  check("walkability.clear_width_ideal", walkability.clear_width_ideal, 0, 100, "Ideal clear width");
  if (
    Number.isFinite(walkability.clear_width_min)
    && Number.isFinite(walkability.clear_width_ideal)
    && walkability.clear_width_ideal <= walkability.clear_width_min
  ) {
    issues.push({
      field: "walkability.clear_width_ideal",
      message: "Ideal clear width must be greater than minimum clear width.",
    });
  }
  check("walkability.amenity_density_ideal", walkability.amenity_density_ideal, 0, 10, "Furniture area threshold");
  check("walkability.amenity_count_density_ideal", walkability.amenity_count_density_ideal, 0, 10, "Amenity count density");
  check("walkability.lamp_spacing_m", walkability.lamp_spacing_m, 0, 5_000, "Lamp spacing");
  check("walkability.transit_stop_spacing_m", walkability.transit_stop_spacing_m, 0, 5_000, "Transit stop spacing");
  check("walkability.crossing_spacing_m", walkability.crossing_spacing_m, 0, 5_000, "Crossing spacing");
  check("walkability.entrance_density_ideal", walkability.entrance_density_ideal, 0, 10, "Entrance density");
  check("walkability.tree_shade_grid_resolution_m", walkability.tree_shade_grid_resolution_m, 0, 10, "Tree grid resolution");

  if (
    !Number.isFinite(walkability.tree_sun_azimuth_deg)
    || walkability.tree_sun_azimuth_deg < 0
    || walkability.tree_sun_azimuth_deg >= 360
  ) {
    issues.push({
      field: "walkability.tree_sun_azimuth_deg",
      message: "Sun azimuth must be at least 0 and less than 360 degrees.",
    });
  }
  if (
    !Number.isFinite(walkability.tree_sun_elevation_deg)
    || walkability.tree_sun_elevation_deg < 1
    || walkability.tree_sun_elevation_deg > 90
  ) {
    issues.push({
      field: "walkability.tree_sun_elevation_deg",
      message: "Sun elevation must be between 1 and 90 degrees.",
    });
  }
  check(
    "walkability.tree_canopy_center_height_ratio",
    walkability.tree_canopy_center_height_ratio,
    0,
    1,
    "Canopy center-height ratio",
  );
  check(
    "walkability.tree_canopy_vertical_ratio",
    walkability.tree_canopy_vertical_ratio,
    0,
    0.5,
    "Canopy vertical ratio",
  );
  if (
    Number.isFinite(walkability.tree_canopy_center_height_ratio)
    && Number.isFinite(walkability.tree_canopy_vertical_ratio)
    && walkability.tree_canopy_center_height_ratio > 0
    && walkability.tree_canopy_center_height_ratio <= 1
    && walkability.tree_canopy_vertical_ratio > 0
    && walkability.tree_canopy_vertical_ratio <= 0.5
    && (
      walkability.tree_canopy_center_height_ratio - walkability.tree_canopy_vertical_ratio < 0
      || walkability.tree_canopy_center_height_ratio + walkability.tree_canopy_vertical_ratio > 1
    )
  ) {
    issues.push({
      field: "walkability.tree_canopy_vertical_ratio",
      message: "Canopy center and vertical ratios must keep the canopy within the tree height.",
    });
  }
  return issues;
}

export function loadEvaluationConfig(storage: Pick<Storage, "getItem">): EvaluationConfig {
  try {
    const stored = storage.getItem(EVALUATION_CONFIG_STORAGE_KEY);
    if (!stored) return cloneEvaluationConfig();
    const parsed = JSON.parse(stored) as EvaluationConfig;
    if (
      !parsed
      || typeof parsed !== "object"
      || !parsed.aggregation?.dimension_weights
      || !parsed.walkability
      || validateEvaluationConfig(parsed).length > 0
    ) {
      return cloneEvaluationConfig();
    }
    return cloneEvaluationConfig(parsed);
  } catch {
    return cloneEvaluationConfig();
  }
}

export type MetricEntry = { label: string; value: number; max: number };

export type LlmStatusEntry = {
  enabled?: boolean;
  available?: boolean;
  source?: string;
  cached?: boolean;
  visual_input?: string;
  reasoning?: string;
  error?: string;
};

export type EvaluationResult = {
  walkability: number;
  safety: number | null;
  beauty: number | null;
  overall: number | null;
  score_weights?: Record<string, number>;
  score_formula?: string;
  evaluation_profile?: string;
  evaluation: string;
  suggestions: string[];
  config_patch: Record<string, unknown>;
  effective_evaluation_config?: Record<string, unknown>;
  evaluation_config?: Record<string, unknown>;
  indicators?: Record<string, unknown>;
  indicator_meta?: {
    profile?: string;
    walkability?: Record<string, {
      weight?: number;
      source?: string;
      applicability?: string;
      low_discrimination?: boolean;
      note?: string;
    }>;
    safety?: Record<string, unknown>;
    beauty?: Record<string, unknown>;
    child_friendly?: Record<string, unknown>;
  };
  child_friendly?: {
    score: number | null;
    status: string;
    indicators?: Record<string, unknown>;
    suggestions?: string[];
  };
  llm_status?: {
    safety?: LlmStatusEntry;
    beauty?: LlmStatusEntry;
  };
};

export type RenderedEvaluationView = {
  view_id: "pedestrian_forward" | "pedestrian_reverse" | "overview_topdown" | "child_forward";
  label: string;
  image_data_url: string;
  kind: "street_level" | "overview";
  camera: [number, number, number];
  target: [number, number, number];
  width: number;
  height: number;
  source: "viewer_webgl_capture";
  projection: "perspective" | "orthographic";
  horizontal_fov_deg?: number;
  vertical_fov_deg?: number;
  content_origin: "roadgen3d_synthetic_render";
};

export type PresetConfig = {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
};

export function metricColor(value: number, max: number): string {
  const ratio = clamp(value / max, 0, 1);
  if (ratio >= 0.8) return "#16a34a";
  if (ratio >= 0.5) return "#eab308";
  return "#dc2626";
}

export function renderMetricsBarHtml(entry: MetricEntry): string {
  const percent = Math.round(clamp(entry.value / entry.max, 0, 1) * 100);
  const color = metricColor(entry.value, entry.max);
  return `<div class="viewer-metric-row">
  <div class="viewer-metric-label">${escapeHtml(entry.label)}</div>
  <div class="viewer-metric-value">${entry.value.toFixed(2)}</div>
  <div class="viewer-metric-bar-track"><div class="viewer-metric-bar-fill" style="width:${percent}%;background:${color}"></div></div>
  </div>`;
}

export function llmStatusPresentation(entry?: LlmStatusEntry): { label: string; className: string } {
  const source = String(entry?.source || "unavailable").toLowerCase();
  const visualInput = String(entry?.visual_input || "missing").toLowerCase();
  if (visualInput !== "provided" && source !== "disabled") {
    return { label: "N/A · No views", className: "unavailable" };
  }
  if (source === "llm") return { label: "Live · Visual", className: "live" };
  if (source === "cache") return { label: "Cache · Visual", className: "cache" };
  if (source === "disabled") return { label: "Disabled", className: "disabled" };
  return { label: "Unavailable · Visual", className: "unavailable" };
}

export function isScoreValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatScore(value: number | null | undefined): string {
  return isScoreValue(value) ? String(Math.round(value)) : "N/A";
}

export function hasProvidedVisualInput(entry?: LlmStatusEntry): boolean {
  return Boolean(entry?.available) && String(entry?.visual_input || "").toLowerCase() === "provided";
}

export function renderEvaluationViewsPreview(views: RenderedEvaluationView[]): string {
  const requiredIds: RenderedEvaluationView["view_id"][] = ["pedestrian_forward", "pedestrian_reverse", "overview_topdown", "child_forward"];
  const capturedIds = new Set(views.map((view) => view.view_id));
  const complete = requiredIds.every((viewId) => capturedIds.has(viewId));
  if (!complete) {
    return `
        <div class="viewer-evaluate-views" data-state="missing">
          <div class="viewer-evaluate-views-header">
            <span>Rendered views</span>
            <strong>${views.length} / 4 captured</strong>
          </div>
          <div class="viewer-evaluate-views-note">Visual Safety/Beauty need the pedestrian and overview views; Child Friendly also needs the child-forward view.</div>
        </div>
      `;
  }
  return `
      <div class="viewer-evaluate-views" data-state="provided">
        <div class="viewer-evaluate-views-header">
          <span>Rendered views</span>
          <strong>${views.length} / 4 captured</strong>
        </div>
        <div class="viewer-evaluate-view-grid">
          ${views.map((view) => `
            <figure class="viewer-evaluate-view-card">
              <img src="${view.image_data_url}" alt="${escapeHtml(view.label)}" />
              <figcaption>${escapeHtml(view.label)}</figcaption>
            </figure>
          `).join("")}
        </div>
      </div>
    `;
}

export function enforceVisualEvaluationAvailability(result: EvaluationResult): EvaluationResult {
  const safetyHasVisual = hasProvidedVisualInput(result.llm_status?.safety);
  const beautyHasVisual = hasProvidedVisualInput(result.llm_status?.beauty);
  return {
    ...result,
    safety: safetyHasVisual ? result.safety : null,
    beauty: beautyHasVisual ? result.beauty : null,
    overall: safetyHasVisual && beautyHasVisual ? result.overall : null,
  };
}

function scoreContributionRows(result: EvaluationResult): string {
  const weights = result.score_weights || { walkability: 1 / 3, safety: 1 / 3, beauty: 1 / 3 };
  const entries: Array<{ key: "walkability" | "safety" | "beauty"; label: string; value: number | null; weight: number }> = [
    { key: "walkability", label: "Walkability proxy", value: result.walkability, weight: Number(weights.walkability ?? 0) },
    { key: "safety", label: "Visual safety model", value: result.safety, weight: Number(weights.safety ?? 0) },
    { key: "beauty", label: "Visual beauty model", value: result.beauty, weight: Number(weights.beauty ?? 0) },
  ];
  return `
    <div class="viewer-evaluate-contributions">
      ${entries.map((entry) => {
        const score = isScoreValue(entry.value) ? entry.value : 0;
        const contribution = score * entry.weight;
        const width = Math.round(clamp(contribution, 0, 100));
        return `
          <div class="viewer-evaluate-contribution-row">
            <span>${escapeHtml(entry.label)}</span>
            <strong>${formatScore(entry.value)} × ${entry.weight.toFixed(2)}</strong>
            <div><i style="width:${width}%"></i></div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function indicatorMetaRows(result: EvaluationResult): string {
  const meta = result.indicator_meta?.walkability || {};
  const rows = ["SID_CLR", "CLEAR_CONT", "BUFFER_RATIO", "LIGHT_UNI", "TREE_SHADE", "FURN_D", "CROSS_PROV", "TRANSIT_PROX", "ENTR_DENS", "POI_MIX", "MICRO_ENV"]
    .map((key) => ({ key, item: meta[key] }))
    .filter(({ item }) => item);
  if (rows.length === 0) return "";
  return `
    <div class="viewer-evaluate-indicator-meta">
      ${rows.map(({ key, item }) => `
        <div class="viewer-evaluate-indicator-row" data-low="${item?.low_discrimination ? "true" : "false"}">
          <span>${escapeHtml(key)}</span>
          <strong>${escapeHtml(String(item?.applicability || "local_segment"))}</strong>
          <em>${escapeHtml(`weight ${Number(item?.weight ?? 0).toFixed(3)}`)}</em>
          <small>
            ${escapeHtml(String(item?.source || "source_not_reported"))}
            ${item?.note ? ` · ${escapeHtml(String(item.note))}` : ""}
          </small>
        </div>
      `).join("")}
    </div>
  `;
}

export async function requestUnifiedEvaluation(
  layoutPath: string,
  renderedViews: RenderedEvaluationView[],
  options: {
    presetId?: string | null;
    persistToBenchmark?: boolean;
    evaluationProfile?: string;
    evaluationConfig: EvaluationConfig;
    signal?: AbortSignal;
  },
): Promise<EvaluationResult> {
  const response = await fetch(`${API_BASE}/api/design/evaluate/unified`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      layout_path: layoutPath,
      rendered_views: renderedViews,
      preset_id: options.presetId || undefined,
      persist_to_benchmark: Boolean(options.persistToBenchmark),
      evaluation_profile: options.evaluationProfile || "auto",
      evaluation_config: cloneEvaluationConfig(options.evaluationConfig),
    }),
  });

  const text = await response.text();
  if (!text) {
    throw new Error("Server returned empty response");
  }

  let result: EvaluationResult | { error?: string };
  try {
    result = JSON.parse(text) as EvaluationResult | { error?: string };
  } catch {
    throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
  }

  if (!response.ok) {
    throw new Error(
      (result && "error" in result ? result.error : "Evaluation failed") as string,
    );
  }
  return result as EvaluationResult;
}


export function renderEvaluationResultHtml(
  result: EvaluationResult,
  renderedViews: RenderedEvaluationView[] = [],
): string {
  const overallScore = result.overall;
  const hasOverall = isScoreValue(overallScore);
  const scorePercent = hasOverall ? Math.round(clamp(overallScore, 0, 100)) : 0;
  const scoreColor = hasOverall ? metricColor(overallScore, 100) : "#94a3b8";
  const safetyStatus = llmStatusPresentation(result.llm_status?.safety);
  const beautyStatus = llmStatusPresentation(result.llm_status?.beauty);
  const scoreFormula = result.score_formula || "overall = equal-weight mean of available top-level components";
  const childScore = result.child_friendly?.score ?? null;
  const childStatus = result.child_friendly?.status || "missing_child_view";
  const childStatusLabel = childStatus === "scored_structural_v1" ? "Auxiliary · Child view" : "N/A · Child view";
  const effectiveConfig = result.effective_evaluation_config || result.evaluation_config;
  return `
      <div class="viewer-evaluate-score">
        <div class="viewer-evaluate-score-ring" style="--score-color:${scoreColor};--score-percent:${scorePercent}">
          <span>${hasOverall ? scorePercent : "N/A"}</span>
        </div>
        <div class="viewer-evaluate-score-label">Composite Diagnostic</div>
      </div>
      <div class="viewer-evaluate-section">
        <div class="viewer-metrics-group-title">Composite Formula · Diagnostic Only</div>
        <div class="viewer-evaluate-text">${escapeHtml(result.evaluation_profile || "local_segment_v1")} · ${escapeHtml(scoreFormula)}</div>
        ${scoreContributionRows(result)}
      </div>
      ${effectiveConfig ? `
        <details class="viewer-evaluate-effective-parameters">
          <summary>Effective parameters</summary>
          <p>Resolved diagnostic settings used for this run.</p>
          <pre class="viewer-evaluate-config">${escapeHtml(JSON.stringify(effectiveConfig, null, 2))}</pre>
        </details>
      ` : ""}
      <div class="viewer-evaluate-score-grid">
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Walkability Proxy</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.walkability)}</div>
        </div>
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Visual Safety Model</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.safety)}</div>
        </div>
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Visual Beauty Model</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.beauty)}</div>
        </div>
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Child-Friendly Proxy</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(childScore)}</div>
          <small>${escapeHtml(childStatusLabel)}</small>
        </div>
      </div>
      ${renderEvaluationViewsPreview(renderedViews)}
      <div class="viewer-evaluate-section">
        <div class="viewer-metrics-group-title">Indicator Scope & Provenance</div>
        ${indicatorMetaRows(result) || `<div class="viewer-evaluate-text">No indicator metadata returned.</div>`}
      </div>
      <div class="viewer-evaluate-section">
        <div class="viewer-metrics-group-title">Visual Model Availability</div>
        <div class="viewer-evaluate-llm-status">
          <div class="viewer-evaluate-llm-row">
            <span class="viewer-evaluate-llm-label">Safety Visual LLM</span>
            <span class="viewer-evaluate-llm-pill ${safetyStatus.className}">${safetyStatus.label}</span>
          </div>
          <div class="viewer-evaluate-llm-row">
            <span class="viewer-evaluate-llm-label">Beauty Visual LLM</span>
            <span class="viewer-evaluate-llm-pill ${beautyStatus.className}">${beautyStatus.label}</span>
          </div>
        </div>
      </div>
      <div class="viewer-evaluate-section">
        <div class="viewer-metrics-group-title">Diagnostic Summary</div>
        <div class="viewer-evaluate-text">${escapeHtml(result.evaluation)}</div>
      </div>
      ${result.suggestions.length > 0 ? `
        <div class="viewer-evaluate-section">
          <div class="viewer-metrics-group-title">Heuristic Suggestions</div>
          <ul class="viewer-evaluate-suggestions">
            ${result.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${Object.keys(result.config_patch).length > 0 ? `
        <div class="viewer-evaluate-section">
          <div class="viewer-metrics-group-title">Heuristic Config Patch</div>
          <pre class="viewer-evaluate-config">${escapeHtml(JSON.stringify(result.config_patch, null, 2))}</pre>
        </div>
      ` : ""}
    `;
}

export function renderMetricsPanel(summary: Record<string, unknown>): string {
  const layoutMetrics: MetricEntry[] = [
    { label: "重叠率", value: Number(summary.overlap_rate ?? 0), max: 1 },
    { label: "丢弃率", value: Number(summary.dropped_slot_rate ?? 0), max: 1 },
    { label: "间距均匀性", value: Number(summary.spacing_uniformity ?? 0), max: 1 },
    { label: "风格一致性", value: Number(summary.style_consistency ?? 0), max: 1 },
    { label: "均衡度", value: Number(summary.balance_score ?? 0), max: 1 },
  ];
  const complianceMetrics: MetricEntry[] = [
    { label: "合规率", value: Number(summary.compliance_rate_total ?? 0), max: 1 },
    { label: "违规数", value: Number(summary.violations_total ?? 0), max: 100 },
    { label: "可行性", value: Number(summary.avg_feasibility_score ?? 0), max: 1 },
  ];
  const sceneMetrics: MetricEntry[] = [
    { label: "实例数", value: Number(summary.instance_count ?? 0), max: 200 },
    { label: "资产种类", value: Number(summary.unique_asset_count ?? 0), max: 200 },
    { label: "多样性", value: Number(summary.diversity_ratio ?? 0), max: 1 },
  ];
  const groups: Array<{ title: string; metrics: MetricEntry[] }> = [];
  if (layoutMetrics.some((metric) => metric.value > 0)) groups.push({ title: "布局质量", metrics: layoutMetrics });
  if (complianceMetrics.some((metric) => metric.value > 0)) groups.push({ title: "合规性", metrics: complianceMetrics });
  if (sceneMetrics.some((metric) => metric.value > 0)) groups.push({ title: "场景统计", metrics: sceneMetrics });
  return groups
    .map((group) => (
      `<div class="viewer-metrics-group"><div class="viewer-metrics-group-title">${escapeHtml(group.title)}</div>${group.metrics.map((metric) => renderMetricsBarHtml(metric)).join("")}</div>`
    ))
    .join("");
}
