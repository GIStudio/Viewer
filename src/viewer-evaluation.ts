import { clamp, escapeHtml } from "./viewer-utils";
import { API_BASE } from "./sg-constants";

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
  evaluation: string;
  suggestions: string[];
  config_patch: Record<string, unknown>;
  llm_status?: {
    safety?: LlmStatusEntry;
    beauty?: LlmStatusEntry;
  };
};

export type RenderedEvaluationView = {
  view_id: "pedestrian_forward" | "pedestrian_reverse" | "overview_topdown";
  label: string;
  image_data_url: string;
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
  const complete = views.length === 3;
  if (!complete) {
    return `
        <div class="viewer-evaluate-views" data-state="missing">
          <div class="viewer-evaluate-views-header">
            <span>Rendered views</span>
            <strong>0 / 3 captured</strong>
          </div>
          <div class="viewer-evaluate-views-note">Safety and Beauty will stay N/A until Viewer captures all three visual inputs.</div>
        </div>
      `;
  }
  return `
      <div class="viewer-evaluate-views" data-state="provided">
        <div class="viewer-evaluate-views-header">
          <span>Rendered views</span>
          <strong>${views.length} / 3 captured</strong>
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

export async function requestUnifiedEvaluation(
  layoutPath: string,
  renderedViews: RenderedEvaluationView[],
): Promise<EvaluationResult> {
  const response = await fetch(`${API_BASE}/api/design/evaluate/unified`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      layout_path: layoutPath,
      rendered_views: renderedViews,
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
  const scoreFormula = result.score_formula || "overall = walkability 0.45 + safety 0.35 + beauty 0.20";
  return `
      <div class="viewer-evaluate-score">
        <div class="viewer-evaluate-score-ring" style="--score-color:${scoreColor};--score-percent:${scorePercent}">
          <span>${hasOverall ? scorePercent : "N/A"}</span>
        </div>
        <div class="viewer-evaluate-score-label">Visual Overall Score</div>
      </div>
      <div class="viewer-evaluate-section">
        <div class="viewer-metrics-group-title">Unified Evaluation Formula</div>
        <div class="viewer-evaluate-text">${escapeHtml(scoreFormula)}</div>
      </div>
      <div class="viewer-evaluate-score-grid">
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Walkability</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.walkability)}</div>
        </div>
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Visual Safety</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.safety)}</div>
        </div>
        <div class="viewer-evaluate-score-card">
          <div class="viewer-evaluate-score-card-label">Visual Beauty</div>
          <div class="viewer-evaluate-score-card-value">${formatScore(result.beauty)}</div>
        </div>
      </div>
      ${renderEvaluationViewsPreview(renderedViews)}
      <div class="viewer-evaluate-section">
        <div class="viewer-metrics-group-title">Visual LLM Status</div>
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
        <div class="viewer-metrics-group-title">Evaluation Summary</div>
        <div class="viewer-evaluate-text">${escapeHtml(result.evaluation)}</div>
      </div>
      ${result.suggestions.length > 0 ? `
        <div class="viewer-evaluate-section">
          <div class="viewer-metrics-group-title">Suggestions</div>
          <ul class="viewer-evaluate-suggestions">
            ${result.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${Object.keys(result.config_patch).length > 0 ? `
        <div class="viewer-evaluate-section">
          <div class="viewer-metrics-group-title">Suggested Config Patch</div>
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
