import type {
  BenchmarkAnalysisPayload,
  BenchmarkAnalysisSample,
  BenchmarkBatchStatusPayload,
  BenchmarkCorrelationMode,
  BenchmarkCorrelationRow,
  BenchmarkSamplesPayload,
  BenchmarkSample,
  BranchRunStatusPayload,
  BranchRunNode,
  BranchScatterPoint,
  DesignPreset,
  DesignSemanticSummary,
  DesignSchemeVariant,
  ViewerComparisonMetadata,
  RecentLayout,
  SceneJobResult,
  SceneJobStatusPayload,
  ScenarioDesign,
} from "./viewer-types";
import {
  DEFAULT_GRAPH_TEMPLATE_ID,
  DESIGN_MAX_POLL_ATTEMPTS,
  DESIGN_POLL_INTERVAL_MS,
  DESIGN_SCHEME_VARIANTS,
  VIEWER_DESIGN_PRESETS,
} from "./viewer-types";
import {
  apiJson,
  clearManifestCacheWithReason,
  clearRecentLayoutsCacheWithReason,
  loadRecentLayouts,
  postApiJson,
} from "./viewer-api";
import { describeDesignJobProgress, effectiveDesignPrompt, submitDesignJob } from "./viewer-design";
import {
  DESIGN_GENERATION_STEPS,
  getStepIndex,
  latestOperationForStage,
  renderDesignImprovementSummary,
} from "./viewer-design-workspace";
import { branchNodes } from "./viewer-branch-workspace";
import { clamp, escapeHtml, sleep } from "./viewer-utils";

type DesignTone = "neutral" | "success" | "warning" | "error";

type GeneratedDesignScheme = {
  id: string;
  name: string;
  layoutPath: string;
  status: "ready" | "failed";
  metadata?: ViewerComparisonMetadata;
  error?: string;
};

type BranchRunCreatePayload = {
  run_id: string;
  status: string;
  created_at?: string;
};

type BranchRunListPayload = {
  items?: BranchRunStatusPayload[];
};

type BenchmarkExplorerView = "overview" | "correlation";
type BenchmarkOutcomeKey = "walkability" | "safety" | "beauty" | "overall";
type BenchmarkGenerationMethodFilter = "all" | "llm_assisted" | "pure_llm" | "parametric" | "unknown_legacy";
type BenchmarkExplorerLoadOptions = {
  refresh?: boolean;
};

export type ViewerDesignController = {
  runDesignGeneration: () => Promise<void>;
  runBranchGeneration: () => Promise<void>;
  loadBranchRunHistory: () => Promise<void>;
  loadBenchmarkExplorer: (options?: BenchmarkExplorerLoadOptions) => Promise<void>;
  loadLatestScoreResults: () => Promise<void>;
  isDesignGenerating: () => boolean;
  isBranchRunGenerating: () => boolean;
};

export type ViewerDesignControllerDeps = {
  designPromptEl: HTMLTextAreaElement;
  designTemplateEl: HTMLInputElement;
  designCountEl: HTMLSelectElement;
  designGenerateEl: HTMLButtonElement;
  designBenchmarkEl: HTMLButtonElement;
  designBranchHistoryEl: HTMLButtonElement;
  designBranchRunEl: HTMLButtonElement;
  designReviewRunEl: HTMLButtonElement;
  designResultEl: HTMLElement;
  designWorkspaceEl: HTMLElement;
  minimapEl: HTMLElement;
  errorEl: HTMLElement;
  getSelectedDesignPreset: () => DesignPreset | null;
  getSelectedScenarioDesign: () => ScenarioDesign | null;
  getDesignSemanticConfigPatch: () => Record<string, unknown>;
  getDesignSemanticSummary: (preset: DesignPreset | null) => DesignSemanticSummary;
  hasLastDesignRunSnapshot: () => boolean;
  setSelectedBranchNodeId: (nodeId: string | null) => void;
  setStatus: (message: string) => void;
  setError: (element: HTMLElement, message: string) => void;
  flashStatus: (message: string) => void;
  updateDesignStatus: (message: string, tone?: DesignTone) => void;
  renderDesignWorkspace: (
    payload: SceneJobStatusPayload,
    preset: DesignPreset | null,
    variant: DesignSchemeVariant,
    prompt: string,
    graphTemplateId: string,
    structureSource?: string,
    semanticSummary?: DesignSemanticSummary,
  ) => void;
  hideDesignWorkspace: () => void;
  renderBranchWorkspace: (payload: BranchRunStatusPayload) => void;
  renderBranchRunResults: (payload: BranchRunStatusPayload) => void;
  loadLayoutSelection: (layoutPath: string) => Promise<void>;
  populateRecentLayoutOptions: (layouts: RecentLayout[], selectedPath: string) => void;
};

export function createViewerDesignController(deps: ViewerDesignControllerDeps): ViewerDesignController {
  let designIsGenerating = false;
  let branchRunIsGenerating = false;
  let benchmarkPayload: BenchmarkSamplesPayload | null = null;
  let benchmarkAnalysisPayload: BenchmarkAnalysisPayload | null = null;
  let activeBenchmarkPresetId = "all";
  let activeBenchmarkGenerationMethod: BenchmarkGenerationMethodFilter = "all";
  let activeBenchmarkView: BenchmarkExplorerView = "overview";
  let benchmarkAnalysisTarget: BenchmarkOutcomeKey = "overall";
  let benchmarkCorrelationMode: BenchmarkCorrelationMode = "pooled";
  let benchmarkSelectedFeature = "";
  let benchmarkBatchPollHandle: number | null = null;
  let loadingLatestScores = false;

  function renderGeneratedDesignSchemes(schemes: GeneratedDesignScheme[]): void {
    if (schemes.length === 0) {
      deps.designResultEl.innerHTML = "";
      return;
    }
    deps.designResultEl.innerHTML = `
      <div class="viewer-design-schemes">
        ${schemes.map((scheme) => `
          <button
            class="viewer-design-scheme"
            type="button"
            data-layout-path="${escapeHtml(scheme.layoutPath)}"
            ${scheme.status === "failed" ? "disabled" : ""}
          >
            <span>
              <strong>${escapeHtml(scheme.name)}</strong>
              <small>${scheme.status === "ready" ? escapeHtml(scheme.layoutPath) : escapeHtml(scheme.error || "Generation failed")}</small>
            </span>
            <em>${scheme.status === "ready" ? "Load" : "Failed"}</em>
          </button>
        `).join("")}
      </div>
    `;
  }

  function generatedSchemeMetadata(
    result: SceneJobResult,
    preset: DesignPreset | null,
    variant: DesignSchemeVariant,
    prompt: string,
    graphTemplateId: string,
    scenario: ScenarioDesign | null,
    presetLabel: string,
  ): ViewerComparisonMetadata {
    const composeConfig = result.compose_config ?? {};
    const summary = result.summary ?? {};
    const numberOrUndefined = (value: unknown): number | undefined => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : undefined;
    };
    return {
      preset_id: preset?.id ?? "custom",
      preset_label: presetLabel,
      scenario_id: scenario?.scenario_id,
      scenario_title: scenario ? (scenario.title_zh || scenario.scenario_id) : "Base Template",
      graph_template_id: graphTemplateId,
      prompt,
      variant_id: variant.id,
      variant_name: variant.name,
      random_seed: variant.seed,
      density: numberOrUndefined(composeConfig.density ?? summary.density),
      road_width_m: numberOrUndefined(composeConfig.road_width_m ?? summary.road_width_m),
      lane_count: numberOrUndefined(composeConfig.lane_count ?? summary.lane_count),
      style_preset: String(composeConfig.style_preset ?? summary.style_preset ?? summary.visual_style_preset ?? ""),
      instance_count: numberOrUndefined(summary.instance_count),
      production_step_ids: Array.isArray(summary.production_step_ids)
        ? summary.production_step_ids.map((value) => String(value))
        : undefined,
    };
  }

  function benchmarkSamplesForActivePreset(payload: BenchmarkSamplesPayload): BenchmarkSample[] {
    let items = payload.items || [];
    if (activeBenchmarkPresetId !== "all") {
      items = items.filter((item) => item.preset_id === activeBenchmarkPresetId);
    }
    if (activeBenchmarkGenerationMethod !== "all") {
      items = items.filter((item) => generationMethod(item) === activeBenchmarkGenerationMethod);
    }
    return items;
  }

  function generationMethod(sample: Pick<BenchmarkSample, "generation_method">): BenchmarkGenerationMethodFilter {
    const value = String(sample.generation_method || "unknown_legacy");
    return (["llm_assisted", "pure_llm", "parametric", "unknown_legacy"].includes(value)
      ? value
      : "unknown_legacy") as BenchmarkGenerationMethodFilter;
  }

  function generationMethodLabel(method: string): string {
    return {
      all: "All methods",
      llm_assisted: "LLM assisted",
      pure_llm: "Pure LLM",
      parametric: "Parametric",
      unknown_legacy: "Legacy",
    }[method] || method;
  }

  function generationMethodCounts(payload: BenchmarkSamplesPayload): Record<string, number> {
    const counts: Record<string, number> = { all: payload.items?.length ?? 0 };
    for (const sample of payload.items || []) {
      const method = generationMethod(sample);
      counts[method] = (counts[method] || 0) + 1;
    }
    return counts;
  }

  function benchmarkSyntheticPayload(payload: BenchmarkSamplesPayload): BranchRunStatusPayload {
    const samples = benchmarkSamplesForActivePreset(payload).filter((sample) => (
      typeof sample.walkability === "number"
      && typeof sample.safety === "number"
      && typeof sample.beauty === "number"
    ));
    const best = [...samples].sort((a, b) => Number(b.overall ?? -Infinity) - Number(a.overall ?? -Infinity))[0];
    const nodes: BranchRunNode[] = samples.map((sample, index) => ({
      node_id: sample.sample_id,
      parent_id: sample.parent_id || null,
      depth: Number(sample.depth ?? 0),
      rank: Number(sample.rank ?? index + 1),
      status: sample.status || "succeeded",
      score: sample.overall,
      scene_layout_path: sample.scene_layout_path,
      scene_glb_path: sample.scene_glb_path,
      artifacts_retained: sample.artifacts_retained,
      artifact_rank: sample.artifact_rank,
      artifact_paths: sample.artifact_paths,
      can_restore_artifact: sample.can_restore_artifact,
      evaluation: {
        ...(sample.evaluation || {}),
        walkability: sample.walkability,
        safety: sample.safety,
        beauty: sample.beauty,
        overall: sample.overall,
      },
      config_patch: sample.config_patch,
      influence_rows: sample.influence_rows,
      analysis_features: sample.analysis_features,
      preset_id: sample.preset_id,
      preset_name: sample.preset_name,
      preset_color: sample.preset_color,
      generation_method: generationMethod(sample),
      llm_candidate_reasoning: `${sample.preset_name || sample.preset_id} benchmark sample from ${sample.source || "benchmark store"}.`,
      optimization_directives: [],
      rejected_edits: [],
      rag_evidence: [],
    }));
    const scatterPoints: BranchScatterPoint[] = samples.map((sample, index) => ({
      node_id: sample.sample_id,
      sample_id: sample.sample_id,
      parent_id: sample.parent_id || null,
      x: sample.walkability,
      y: sample.safety,
      z: sample.beauty ?? sample.z,
      walkability: sample.walkability,
      safety: sample.safety,
      beauty: sample.beauty,
      overall: sample.overall,
      delta_walkability: sample.delta_walkability,
      delta_safety: sample.delta_safety,
      delta_beauty: sample.delta_beauty,
      delta_overall: sample.delta_overall,
      is_pareto_front: sample.is_pareto_front,
      pareto_rank: sample.pareto_rank,
      dominated_by_count: sample.dominated_by_count,
      influence_summary: (sample.influence_rows || []).slice(0, 5).map((row) => ({
        id: row.id,
        group: row.group,
        source_type: row.source_type,
        label: row.label,
        active: row.active,
      })),
      depth: Number(sample.depth ?? 0),
      rank: Number(sample.rank ?? index + 1),
      status: sample.status || "succeeded",
      label: `${sample.preset_name || sample.preset_id} · ${sample.label || sample.sample_id.slice(0, 8)}`,
      preset_id: sample.preset_id,
      preset_name: sample.preset_name,
      preset_label: sample.preset_label,
      preset_color: sample.preset_color,
      generation_method: generationMethod(sample),
      analysis_features: sample.analysis_features,
    }));
    return {
      run_id: "benchmark-store",
      status: "succeeded",
      stage: activeBenchmarkPresetId === "all" ? "all presets" : activeBenchmarkPresetId,
      progress: 100,
      prompt: "Persistent benchmark samples from artifacts/branch_benchmarks.",
      topk: 10,
      rounds: 1,
      target_samples: payload.total || samples.length,
      search_mode: "pareto",
      completed_samples: samples.length,
      attempted_samples: samples.length,
      graph_template_id: DEFAULT_GRAPH_TEMPLATE_ID,
      best_node_id: best?.sample_id || "",
      frontier: samples.filter((sample) => sample.is_pareto_front).map((sample) => sample.sample_id),
      pareto_front: samples.filter((sample) => sample.is_pareto_front).map((sample) => sample.sample_id),
      pareto_front_size: samples.filter((sample) => sample.is_pareto_front).length,
      nodes,
      scatter_points: scatterPoints,
    };
  }

  function benchmarkAnalysisUrl(refresh = false): string {
    const params = new URLSearchParams({ limit: "10000", refresh: refresh ? "true" : "false" });
    if (activeBenchmarkPresetId !== "all") {
      params.set("preset_id", activeBenchmarkPresetId);
    }
    if (activeBenchmarkGenerationMethod !== "all") {
      params.set("generation_method", activeBenchmarkGenerationMethod);
    }
    return `/api/design/benchmark-analysis?${params.toString()}`;
  }

  function benchmarkSamplesUrl(refresh = false): string {
    const params = new URLSearchParams({ limit: "10000", refresh: refresh ? "true" : "false" });
    return `/api/design/benchmark-samples?${params.toString()}`;
  }

  function mergeAnalysisIntoBenchmarkSamples(analysis: BenchmarkAnalysisPayload): void {
    if (!benchmarkPayload?.items) return;
    const bySample = new Map((analysis.samples || []).map((sample) => [sample.sample_id, sample]));
    benchmarkPayload.items = benchmarkPayload.items.map((sample) => {
      const analysisSample = bySample.get(sample.sample_id);
      if (!analysisSample) return sample;
      return {
        ...sample,
        parent_id: analysisSample.parent_id || sample.parent_id,
        analysis_features: {
          input: analysisSample.input_features,
          scene: analysisSample.scene_features,
          derived: analysisSample.derived_features,
          layout_available: analysisSample.layout_available,
          layout_error: analysisSample.layout_error,
        },
      };
    });
  }

  async function loadBenchmarkAnalysis(): Promise<void> {
    deps.updateDesignStatus("Computing benchmark correlation analysis...");
    benchmarkAnalysisPayload = await apiJson<BenchmarkAnalysisPayload>(benchmarkAnalysisUrl(false));
    mergeAnalysisIntoBenchmarkSamples(benchmarkAnalysisPayload);
    renderBenchmarkExplorerResult();
    if (benchmarkPayload) {
      deps.renderBranchWorkspace(benchmarkSyntheticPayload(benchmarkPayload));
    }
    deps.updateDesignStatus("Benchmark correlation analysis loaded.", "success");
  }

  function formatBenchmarkNumber(value: unknown, digits = 2): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
    return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(digits);
  }

  function benchmarkFeatureValue(sample: BenchmarkAnalysisSample, feature: string): number | null {
    const [group, key] = feature.split(".", 2);
    const record = group === "input"
      ? sample.input_features
      : group === "scene"
        ? sample.scene_features
        : group === "derived"
          ? sample.derived_features
          : {};
    const value = record?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function benchmarkCorrelationColor(value: unknown): string {
    const rho = typeof value === "number" && Number.isFinite(value) ? value : 0;
    const alpha = Math.min(0.9, Math.max(0.08, Math.abs(rho) * 0.72));
    return rho >= 0 ? `rgba(37, 99, 235, ${alpha})` : `rgba(220, 38, 38, ${alpha})`;
  }

  function benchmarkFeatureLabel(feature: string): string {
    return feature
      .replace(/^input\./, "Input · ")
      .replace(/^scene\./, "Scene · ")
      .replace(/^derived\./, "Derived · ")
      .replace(/_/g, " ");
  }

  function selectedCorrelationRows(payload: BenchmarkAnalysisPayload): BenchmarkCorrelationRow[] {
    return (payload.correlations || []).filter((row) => (
      row.mode === benchmarkCorrelationMode
      && row.outcome === benchmarkAnalysisTarget
      && (benchmarkCorrelationMode !== "within_preset" || activeBenchmarkPresetId === "all" || row.preset_id === activeBenchmarkPresetId)
    ));
  }

  function analysisFeatureOptions(payload: BenchmarkAnalysisPayload): string[] {
    const rows = selectedCorrelationRows(payload)
      .filter((row) => typeof row.rho === "number")
      .sort((a, b) => Math.abs(Number(b.rho ?? 0)) - Math.abs(Number(a.rho ?? 0)));
    const features: string[] = [];
    for (const row of rows) {
      if (!features.includes(row.feature)) features.push(row.feature);
      if (features.length >= 24) break;
    }
    if (benchmarkSelectedFeature && !features.includes(benchmarkSelectedFeature)) {
      benchmarkSelectedFeature = "";
    }
    if (!benchmarkSelectedFeature && features.length > 0) {
      benchmarkSelectedFeature = features[0];
    }
    return features;
  }

  function renderCorrelationHeatmap(payload: BenchmarkAnalysisPayload, features: string[]): string {
    const outcomes: BenchmarkOutcomeKey[] = ["walkability", "safety", "beauty", "overall"];
    const rows = (payload.correlations || []).filter((row) => row.mode === benchmarkCorrelationMode);
    const byKey = new Map(rows.map((row) => [`${row.feature}|${row.outcome}|${row.preset_id || ""}`, row]));
    return `
      <div class="viewer-benchmark-heatmap">
        <div class="viewer-benchmark-heatmap-row viewer-benchmark-heatmap-head">
          <span>Feature</span>
          ${outcomes.map((outcome) => `<span>${escapeHtml(outcome)}</span>`).join("")}
        </div>
        ${features.slice(0, 18).map((feature) => `
          <div class="viewer-benchmark-heatmap-row">
            <button type="button" data-benchmark-feature="${escapeHtml(feature)}" data-active="${benchmarkSelectedFeature === feature ? "true" : "false"}">${escapeHtml(benchmarkFeatureLabel(feature))}</button>
            ${outcomes.map((outcome) => {
              const candidates = activeBenchmarkPresetId === "all"
                ? rows.filter((row) => row.feature === feature && row.outcome === outcome)
                : [byKey.get(`${feature}|${outcome}|${activeBenchmarkPresetId}`) || byKey.get(`${feature}|${outcome}|`)];
              const row = candidates.filter(Boolean).sort((a, b) => Math.abs(Number(b?.rho ?? 0)) - Math.abs(Number(a?.rho ?? 0)))[0];
              return `<span style="background:${benchmarkCorrelationColor(row?.rho)}" title="n=${escapeHtml(String(row?.n ?? 0))}">${formatBenchmarkNumber(row?.rho)}</span>`;
            }).join("")}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderAnalysisScatter(payload: BenchmarkAnalysisPayload): string {
    const samples = (payload.samples || [])
      .map((sample) => ({
        sample,
        x: benchmarkFeatureValue(sample, benchmarkSelectedFeature),
        y: sample.outcome?.[benchmarkAnalysisTarget],
      }))
      .filter((item): item is { sample: BenchmarkAnalysisSample; x: number; y: number } => (
        typeof item.x === "number"
        && typeof item.y === "number"
        && Number.isFinite(item.x)
        && Number.isFinite(item.y)
      ));
    if (!benchmarkSelectedFeature || samples.length < 2) {
      return `<div class="viewer-design-workspace-muted">选择一个有足够数值样本的参数查看散点。</div>`;
    }
    const width = 560;
    const height = 260;
    const pad = 34;
    const minX = Math.min(...samples.map((item) => item.x));
    const maxX = Math.max(...samples.map((item) => item.x));
    const minY = Math.min(...samples.map((item) => item.y));
    const maxY = Math.max(...samples.map((item) => item.y));
    const sx = (value: number) => pad + ((value - minX) / Math.max(0.0001, maxX - minX)) * (width - pad * 2);
    const sy = (value: number) => height - pad - ((value - minY) / Math.max(0.0001, maxY - minY)) * (height - pad * 2);
    return `
      <svg class="viewer-benchmark-scatter-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Feature score scatter">
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"></line>
        <text x="${pad}" y="${height - 8}">${escapeHtml(formatBenchmarkNumber(minX))}</text>
        <text x="${width - pad - 44}" y="${height - 8}">${escapeHtml(formatBenchmarkNumber(maxX))}</text>
        <text x="4" y="${pad + 4}">${escapeHtml(formatBenchmarkNumber(maxY))}</text>
        ${samples.map(({ sample, x, y }) => `
          <circle
            cx="${sx(x)}"
            cy="${sy(y)}"
            r="${sample.meta?.is_pareto_front ? 5 : 3.6}"
            fill="${escapeHtml(sample.preset_color || "#64748b")}"
            opacity="${sample.meta?.is_pareto_front ? "0.95" : "0.62"}"
          >
            <title>${escapeHtml(sample.label || sample.sample_id)} · ${escapeHtml(benchmarkFeatureLabel(benchmarkSelectedFeature))}: ${escapeHtml(formatBenchmarkNumber(x))} · ${benchmarkAnalysisTarget}: ${escapeHtml(formatBenchmarkNumber(y))}</title>
          </circle>
        `).join("")}
      </svg>
    `;
  }

  function renderFeatureImportance(payload: BenchmarkAnalysisPayload): string {
    const rows = (payload.feature_importance || [])
      .filter((row) => row.outcome === benchmarkAnalysisTarget)
      .sort((a, b) => Number(a.rank ?? 999) - Number(b.rank ?? 999))
      .slice(0, 12);
    if (rows.length === 0) {
      return `<div class="viewer-design-workspace-muted">样本不足时不运行 feature importance；需要至少 30 个有效样本。</div>`;
    }
    const maxImportance = Math.max(...rows.map((row) => Number(row.importance ?? 0)), 0.0001);
    return `
      <div class="viewer-benchmark-importance">
        ${rows.map((row) => `
          <div>
            <span>${escapeHtml(benchmarkFeatureLabel(row.feature))}</span>
            <strong style="width:${Math.max(3, Number(row.importance ?? 0) / maxImportance * 100)}%"></strong>
            <em>${escapeHtml(formatBenchmarkNumber(row.importance, 3))}</em>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderCategoricalEffects(payload: BenchmarkAnalysisPayload): string {
    const rows = (payload.categorical_effects || [])
      .filter((row) => row.outcome === benchmarkAnalysisTarget)
      .slice(0, 6);
    if (rows.length === 0) return "";
    return `
      <div class="viewer-benchmark-effects">
        ${rows.map((row) => `
          <article>
            <strong>${escapeHtml(benchmarkFeatureLabel(row.feature))}</strong>
            <span>${escapeHtml(row.test)} · p=${escapeHtml(formatBenchmarkNumber(row.p_value, 4))} · groups ${escapeHtml(String(row.category_count))}</span>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderBenchmarkAnalysisPanel(): string {
    const payload = benchmarkAnalysisPayload;
    if (!payload) {
      return `<div class="viewer-benchmark-analysis-empty">Open Correlation Analysis to compute feature statistics.</div>`;
    }
    const features = analysisFeatureOptions(payload);
    const warnings = payload.warnings || [];
    return `
      <section class="viewer-benchmark-analysis">
        <div class="viewer-benchmark-analysis-note">Correlation/provenance analysis only; this view does not claim strict causal attribution.</div>
        <div class="viewer-benchmark-analysis-controls">
          <label>Target
            <select data-benchmark-analysis-target>
              ${(["walkability", "safety", "beauty", "overall"] as BenchmarkOutcomeKey[]).map((outcome) => `<option value="${outcome}" ${benchmarkAnalysisTarget === outcome ? "selected" : ""}>${outcome}</option>`).join("")}
            </select>
          </label>
          <label>Mode
            <select data-benchmark-correlation-mode>
              ${(["pooled", "within_preset", "preset_residual", "delta"] as BenchmarkCorrelationMode[]).map((mode) => `<option value="${mode}" ${benchmarkCorrelationMode === mode ? "selected" : ""}>${mode}</option>`).join("")}
            </select>
          </label>
          <label>Feature
            <select data-benchmark-selected-feature>
              ${features.map((feature) => `<option value="${escapeHtml(feature)}" ${benchmarkSelectedFeature === feature ? "selected" : ""}>${escapeHtml(benchmarkFeatureLabel(feature))}</option>`).join("")}
            </select>
          </label>
        </div>
        ${warnings.length ? `<div class="viewer-benchmark-warnings">${warnings.slice(0, 4).map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}</div>` : ""}
        <div class="viewer-benchmark-analysis-grid">
          <article>
            <h4>Parameter-score heatmap</h4>
            ${features.length ? renderCorrelationHeatmap(payload, features) : `<div class="viewer-design-workspace-muted">暂无可计算相关性的数值特征。</div>`}
          </article>
          <article>
            <h4>${escapeHtml(benchmarkFeatureLabel(benchmarkSelectedFeature || "Feature"))} vs ${escapeHtml(benchmarkAnalysisTarget)}</h4>
            ${renderAnalysisScatter(payload)}
          </article>
          <article>
            <h4>Feature importance</h4>
            ${renderFeatureImportance(payload)}
          </article>
          <article>
            <h4>Categorical effects</h4>
            ${renderCategoricalEffects(payload) || `<div class="viewer-design-workspace-muted">暂无足够分类组。</div>`}
          </article>
        </div>
      </section>
    `;
  }

  function renderBenchmarkExplorerResult(batch?: BenchmarkBatchStatusPayload): void {
    const payload = benchmarkPayload;
    if (!payload) return;
    const summaries = payload.summaries || [];
    const activeSamples = benchmarkSamplesForActivePreset(payload);
    const methodCounts = generationMethodCounts(payload);
    const batchLine = batch ? `
      <div class="viewer-benchmark-batch-status">
        <strong>6×100 Batch · ${escapeHtml(batch.status)}</strong>
        <span>${Math.round(Number(batch.progress ?? 0))}% · ${escapeHtml(batch.current_preset_id || "idle")}</span>
      </div>
    ` : "";
    deps.designResultEl.innerHTML = `
      <div class="viewer-benchmark-explorer">
        <div class="viewer-branch-history-header">
          <strong>Persistent Benchmark Explorer</strong>
          <span>${activeSamples.length}/${payload.total ?? payload.items?.length ?? 0} samples shown · ${escapeHtml(payload.updated_at || "")}</span>
        </div>
        ${batchLine}
        <div class="viewer-benchmark-actions">
          <button class="viewer-nav-button viewer-nav-button-secondary" type="button" data-benchmark-start>Run 6×100 Presets</button>
          <button class="viewer-nav-button viewer-nav-button-secondary" type="button" data-benchmark-refresh>Refresh Store</button>
        </div>
        <div class="viewer-benchmark-tabs">
          <button type="button" data-benchmark-view="overview" data-active="${activeBenchmarkView === "overview" ? "true" : "false"}">Overview</button>
          <button type="button" data-benchmark-view="correlation" data-active="${activeBenchmarkView === "correlation" ? "true" : "false"}">Correlation Analysis</button>
        </div>
        <div class="viewer-benchmark-filters">
          <button type="button" data-benchmark-preset-filter="all" data-active="${activeBenchmarkPresetId === "all" ? "true" : "false"}">
            <span style="background:#64748b"></span>
            All · ${payload.items?.length ?? 0}
          </button>
          ${summaries.map((summary) => `
            <button type="button" data-benchmark-preset-filter="${escapeHtml(summary.preset_id)}" data-active="${activeBenchmarkPresetId === summary.preset_id ? "true" : "false"}">
              <span style="background:${escapeHtml(summary.preset_color || "#64748b")}"></span>
              ${escapeHtml(summary.preset_name || summary.preset_id)} · ${summary.sample_count}
            </button>
          `).join("")}
        </div>
        <div class="viewer-benchmark-filters viewer-benchmark-method-filters">
          ${(["all", "llm_assisted", "pure_llm", "parametric", "unknown_legacy"] as BenchmarkGenerationMethodFilter[]).map((method) => `
            <button type="button" data-benchmark-method-filter="${escapeHtml(method)}" data-active="${activeBenchmarkGenerationMethod === method ? "true" : "false"}">
              <span class="viewer-benchmark-method-dot" data-method="${escapeHtml(method)}"></span>
              ${escapeHtml(generationMethodLabel(method))} · ${methodCounts[method] || 0}
            </button>
          `).join("")}
        </div>
        ${activeBenchmarkView === "correlation" ? renderBenchmarkAnalysisPanel() : `
          <div class="viewer-benchmark-summary-grid">
            ${summaries.map((summary) => `
              <article>
                <i style="background:${escapeHtml(summary.preset_color || "#64748b")}"></i>
                <strong>${escapeHtml(summary.preset_name || summary.preset_id)}</strong>
                <span>${summary.sample_count} samples · top ${Math.round(Number(summary.top_overall ?? 0))}</span>
              </article>
            `).join("")}
          </div>
        `}
      </div>
    `;
    deps.designResultEl.querySelectorAll<HTMLButtonElement>("[data-benchmark-view]").forEach((button) => {
      button.addEventListener("click", () => {
        activeBenchmarkView = (button.dataset.benchmarkView || "overview") as BenchmarkExplorerView;
        renderBenchmarkExplorerResult(batch);
        if (activeBenchmarkView === "correlation" && !benchmarkAnalysisPayload) {
          void loadBenchmarkAnalysis().catch((err) => {
            const message = err instanceof Error ? err.message : "Failed to load benchmark analysis.";
            deps.updateDesignStatus(message, "error");
            deps.setError(deps.errorEl, message);
          });
        }
      });
    });
    deps.designResultEl.querySelectorAll<HTMLButtonElement>("[data-benchmark-preset-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        activeBenchmarkPresetId = button.dataset.benchmarkPresetFilter || "all";
        benchmarkAnalysisPayload = null;
        benchmarkSelectedFeature = "";
        deps.setSelectedBranchNodeId(null);
        renderBenchmarkExplorerResult(batch);
        deps.renderBranchWorkspace(benchmarkSyntheticPayload(payload));
        if (activeBenchmarkView === "correlation") {
          void loadBenchmarkAnalysis().catch((err) => {
            const message = err instanceof Error ? err.message : "Failed to load benchmark analysis.";
            deps.updateDesignStatus(message, "error");
            deps.setError(deps.errorEl, message);
          });
        }
      });
    });
    deps.designResultEl.querySelectorAll<HTMLButtonElement>("[data-benchmark-method-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        activeBenchmarkGenerationMethod = (button.dataset.benchmarkMethodFilter || "all") as BenchmarkGenerationMethodFilter;
        benchmarkAnalysisPayload = null;
        benchmarkSelectedFeature = "";
        deps.setSelectedBranchNodeId(null);
        renderBenchmarkExplorerResult(batch);
        deps.renderBranchWorkspace(benchmarkSyntheticPayload(payload));
        if (activeBenchmarkView === "correlation") {
          void loadBenchmarkAnalysis().catch((err) => {
            const message = err instanceof Error ? err.message : "Failed to load benchmark analysis.";
            deps.updateDesignStatus(message, "error");
            deps.setError(deps.errorEl, message);
          });
        }
      });
    });
    deps.designResultEl.querySelector<HTMLButtonElement>("[data-benchmark-refresh]")?.addEventListener("click", () => {
      void loadBenchmarkExplorer({ refresh: true });
    });
    deps.designResultEl.querySelector<HTMLButtonElement>("[data-benchmark-start]")?.addEventListener("click", () => {
      void runBenchmarkBatch();
    });
    deps.designResultEl.querySelector<HTMLSelectElement>("[data-benchmark-analysis-target]")?.addEventListener("change", (event) => {
      benchmarkAnalysisTarget = ((event.target as HTMLSelectElement).value || "overall") as BenchmarkOutcomeKey;
      benchmarkSelectedFeature = "";
      renderBenchmarkExplorerResult(batch);
    });
    deps.designResultEl.querySelector<HTMLSelectElement>("[data-benchmark-correlation-mode]")?.addEventListener("change", (event) => {
      benchmarkCorrelationMode = ((event.target as HTMLSelectElement).value || "pooled") as BenchmarkCorrelationMode;
      benchmarkSelectedFeature = "";
      renderBenchmarkExplorerResult(batch);
    });
    deps.designResultEl.querySelector<HTMLSelectElement>("[data-benchmark-selected-feature]")?.addEventListener("change", (event) => {
      benchmarkSelectedFeature = (event.target as HTMLSelectElement).value || "";
      renderBenchmarkExplorerResult(batch);
    });
    deps.designResultEl.querySelectorAll<HTMLButtonElement>("[data-benchmark-feature]").forEach((button) => {
      button.addEventListener("click", () => {
        benchmarkSelectedFeature = button.dataset.benchmarkFeature || "";
        renderBenchmarkExplorerResult(batch);
      });
    });
  }

  async function waitForBranchRun(runId: string): Promise<BranchRunStatusPayload> {
    for (let attempt = 0; attempt < DESIGN_MAX_POLL_ATTEMPTS; attempt += 1) {
      const payload = await apiJson<BranchRunStatusPayload>(`/api/design/branch-runs/${encodeURIComponent(runId)}`);
      const progress = Math.round(clamp(Number(payload.progress ?? 0), 0, 100));
      const sampleSuffix = payload.target_samples
        ? ` · ${payload.completed_samples ?? 0}/${payload.target_samples} scored`
        : "";
      const modeLabel = payload.search_mode === "pareto" ? "Pareto search" : "Branch run";
      deps.updateDesignStatus(`${modeLabel}: ${payload.stage || payload.status} (${progress}%)${sampleSuffix}`);
      deps.renderBranchWorkspace(payload);
      deps.renderBranchRunResults(payload);
      if (payload.status === "succeeded") return payload;
      if (payload.status === "failed") throw new Error(payload.error || "Branch run failed.");
      await sleep(DESIGN_POLL_INTERVAL_MS);
    }
    throw new Error("Branch run timed out.");
  }

  async function runBranchGeneration(): Promise<void> {
    if (branchRunIsGenerating || designIsGenerating) return;
    const prompt =
      deps.designPromptEl.value.trim() ||
      deps.getSelectedDesignPreset()?.prompt ||
      "Generate a walkable complete street.";
    const graphTemplateId = deps.designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
    branchRunIsGenerating = true;
    deps.designBenchmarkEl.disabled = true;
    deps.designBranchHistoryEl.disabled = true;
    deps.designBranchRunEl.disabled = true;
    deps.designGenerateEl.disabled = true;
    deps.setSelectedBranchNodeId(null);
    deps.updateDesignStatus("Submitting Pareto surface trace run...");
    deps.designResultEl.innerHTML = "";
    try {
      const created = await postApiJson<BranchRunCreatePayload>("/api/design/branch-runs", {
        prompt,
        topk: 5,
        rounds: 5,
        target_samples: 100,
        search_mode: "pareto",
        early_stop_patience: 20,
        retain_topk_artifacts: 10,
        score_with_rendered_views: true,
        graph_template_id: graphTemplateId,
        knowledge_source: "graph_rag",
        scene_context: {
          layout_mode: "graph_template",
          graph_template_id: graphTemplateId,
        },
        generation_options: {},
        preset_id: deps.getSelectedDesignPreset()?.id || "",
        preset_config_patch: deps.getSelectedDesignPreset()?.configPatch || {},
        persist_to_benchmark: true,
        evaluation_weights: {
          walkability: 0.4,
          safety: 0.3,
          beauty: 0.3,
        },
      });
      const payload = await waitForBranchRun(created.run_id);
      deps.renderBranchWorkspace(payload);
      deps.renderBranchRunResults(payload);
      const best = branchNodes(payload).find((node) => node.node_id === payload.best_node_id);
      if (best?.scene_layout_path) {
        clearRecentLayoutsCacheWithReason("branch-run-best-loaded");
        clearManifestCacheWithReason("branch-run-best-loaded");
        await deps.loadLayoutSelection(best.scene_layout_path);
        const recent = await loadRecentLayouts(50, false);
        deps.populateRecentLayoutOptions(recent, best.scene_layout_path);
      }
      deps.updateDesignStatus(
        payload.early_stop_triggered ? "Pareto trace early-stopped with stable front." : "Pareto surface trace complete.",
        "success",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Branch run failed.";
      deps.updateDesignStatus(message, "error");
      deps.designResultEl.innerHTML = `<div class="viewer-design-error">${escapeHtml(message)}</div>`;
      deps.setError(deps.errorEl, message);
    } finally {
      branchRunIsGenerating = false;
      deps.designBenchmarkEl.disabled = false;
      deps.designBranchHistoryEl.disabled = false;
      deps.designBranchRunEl.disabled = false;
      deps.designGenerateEl.disabled = false;
    }
  }

  async function loadBenchmarkExplorer(options: BenchmarkExplorerLoadOptions = {}): Promise<void> {
    if (designIsGenerating || branchRunIsGenerating) return;
    const refresh = Boolean(options.refresh);
    deps.designBenchmarkEl.disabled = true;
    deps.updateDesignStatus(refresh ? "Refreshing benchmark store..." : "Loading cached benchmark scores...");
    try {
      benchmarkPayload = await apiJson<BenchmarkSamplesPayload>(benchmarkSamplesUrl(refresh));
      benchmarkAnalysisPayload = null;
      benchmarkSelectedFeature = "";
      if ((benchmarkPayload.items || []).length === 0) {
        deps.designResultEl.innerHTML = `
          <div class="viewer-benchmark-explorer">
            <div class="viewer-branch-history-header">
              <strong>Persistent Benchmark Explorer</strong>
              <span>暂无评分结果</span>
            </div>
            <div class="viewer-benchmark-actions">
              <button class="viewer-nav-button viewer-nav-button-secondary" type="button" data-benchmark-refresh>Refresh Store</button>
              <button class="viewer-nav-button viewer-nav-button-secondary" type="button" data-benchmark-start>Run 6×100 Presets</button>
            </div>
          </div>
        `;
        deps.designResultEl.querySelector<HTMLButtonElement>("[data-benchmark-refresh]")?.addEventListener("click", () => {
          void loadBenchmarkExplorer({ refresh: true });
        });
        deps.designResultEl.querySelector<HTMLButtonElement>("[data-benchmark-start]")?.addEventListener("click", () => {
          void runBenchmarkBatch();
        });
        deps.updateDesignStatus("暂无缓存评分。可点击 Refresh Store 导入历史 branch runs，或 Run 6×100 Presets 新建样本。", "warning");
        return;
      }
      renderBenchmarkExplorerResult();
      deps.setSelectedBranchNodeId(null);
      deps.renderBranchWorkspace(benchmarkSyntheticPayload(benchmarkPayload));
      deps.updateDesignStatus(refresh ? "Benchmark store refreshed." : "Cached benchmark scores loaded.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load benchmark samples.";
      deps.designResultEl.innerHTML = `<div class="viewer-design-error">${escapeHtml(message)}</div>`;
      deps.updateDesignStatus(message, "error");
      deps.setError(deps.errorEl, message);
    } finally {
      deps.designBenchmarkEl.disabled = false;
    }
  }

  async function loadLatestScoreResults(): Promise<void> {
    if (designIsGenerating || branchRunIsGenerating || loadingLatestScores) return;
    loadingLatestScores = true;
    deps.designBranchRunEl.disabled = true;
    deps.updateDesignStatus("Loading cached benchmark scores...");
    try {
      await loadBenchmarkExplorer({ refresh: false });
    } finally {
      loadingLatestScores = false;
      deps.designBranchRunEl.disabled = false;
    }
  }

  async function runBenchmarkBatch(): Promise<void> {
    if (branchRunIsGenerating || designIsGenerating) return;
    const graphTemplateId = deps.designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
    branchRunIsGenerating = true;
    deps.designGenerateEl.disabled = true;
    deps.designBranchRunEl.disabled = true;
    deps.designBranchHistoryEl.disabled = true;
    deps.designBenchmarkEl.disabled = true;
    deps.updateDesignStatus("Submitting sequential 6×100 visual benchmark batch...");
    try {
      const batch = await postApiJson<BenchmarkBatchStatusPayload>("/api/design/benchmark-batches", {
        preset_ids: VIEWER_DESIGN_PRESETS.map((preset) => preset.id),
        target_samples: 100,
        graph_template_id: graphTemplateId,
        knowledge_source: "graph_rag",
        early_stop_patience: 20,
        retain_topk_artifacts: 10,
        score_with_rendered_views: true,
      });
      deps.updateDesignStatus(`Benchmark batch ${batch.batch_id.slice(0, 8)} submitted.`, "success");
      branchRunIsGenerating = false;
      await loadBenchmarkExplorer({ refresh: false });
      scheduleBenchmarkBatchPoll(batch.batch_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit benchmark batch.";
      deps.updateDesignStatus(message, "error");
      deps.setError(deps.errorEl, message);
    } finally {
      branchRunIsGenerating = false;
      deps.designGenerateEl.disabled = false;
      deps.designBranchRunEl.disabled = false;
      deps.designBranchHistoryEl.disabled = false;
      deps.designBenchmarkEl.disabled = false;
    }
  }

  function scheduleBenchmarkBatchPoll(batchId: string): void {
    if (benchmarkBatchPollHandle !== null) {
      window.clearTimeout(benchmarkBatchPollHandle);
    }
    const tick = async () => {
      try {
        const batch = await apiJson<BenchmarkBatchStatusPayload>(`/api/design/benchmark-batches/${encodeURIComponent(batchId)}`);
        if (benchmarkPayload) renderBenchmarkExplorerResult(batch);
        deps.updateDesignStatus(`6×100 batch: ${batch.status} (${Math.round(Number(batch.progress ?? 0))}%).`);
        if (batch.status !== "succeeded" && batch.status !== "failed") {
          benchmarkBatchPollHandle = window.setTimeout(tick, 5000);
        } else {
          benchmarkBatchPollHandle = null;
          await loadBenchmarkExplorer({ refresh: false });
        }
      } catch {
        benchmarkBatchPollHandle = window.setTimeout(tick, 10000);
      }
    };
    benchmarkBatchPollHandle = window.setTimeout(tick, 3000);
  }

  async function loadBranchRunHistory(): Promise<void> {
    if (designIsGenerating || branchRunIsGenerating) return;
    deps.designBranchHistoryEl.disabled = true;
    deps.updateDesignStatus("Loading historical Pareto/100 bench runs...");
    deps.designResultEl.innerHTML = "";
    try {
      const payload = await apiJson<BranchRunListPayload>("/api/design/branch-runs?limit=30");
      const runs = (payload.items || [])
        .filter((run) => Number(run.target_samples || 0) >= 100 || run.search_mode === "pareto")
        .slice(0, 20);
      if (runs.length === 0) {
        deps.designResultEl.innerHTML = `<div class="viewer-design-error">No historical 100 bench / Pareto runs were found.</div>`;
        deps.updateDesignStatus("No historical bench runs found.", "warning");
        return;
      }
      deps.designResultEl.innerHTML = `
        <div class="viewer-branch-history">
          <div class="viewer-branch-history-header">
            <strong>100 Bench History</strong>
            <span>${runs.length} runs from artifacts/branch_runs</span>
          </div>
          <div class="viewer-design-schemes">
            ${runs.map((run) => {
              const completed = Number(run.completed_samples ?? 0);
              const target = Number(run.target_samples ?? 0);
              const attempted = Number(run.attempted_samples ?? 0);
              const createdAt = String(run.created_at || run.started_at || "").replace("T", " ").replace("+00:00", " UTC");
              const stopLabel = run.early_stop_triggered ? "early stop" : run.status;
              return `
                <button class="viewer-design-scheme" type="button" data-branch-history-run="${escapeHtml(run.run_id)}">
                  <span>
                    <strong>${escapeHtml(run.run_id.slice(0, 8))} · ${escapeHtml(stopLabel)}</strong>
                    <small>${completed}/${target || "?"} scored · ${attempted} attempted · front ${run.pareto_front_size ?? 0} · ${escapeHtml(createdAt)}</small>
                  </span>
                  <em>Open</em>
                </button>
              `;
            }).join("")}
          </div>
        </div>
      `;
      deps.designResultEl.querySelectorAll<HTMLButtonElement>("[data-branch-history-run]").forEach((button) => {
        button.addEventListener("click", () => {
          const runId = button.dataset.branchHistoryRun || "";
          if (runId) void openHistoricalBranchRun(runId);
        });
      });
      deps.updateDesignStatus("Historical bench runs loaded.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load branch run history.";
      deps.designResultEl.innerHTML = `<div class="viewer-design-error">${escapeHtml(message)}</div>`;
      deps.updateDesignStatus(message, "error");
      deps.setError(deps.errorEl, message);
    } finally {
      deps.designBranchHistoryEl.disabled = false;
    }
  }

  async function openHistoricalBranchRun(runId: string): Promise<void> {
    deps.updateDesignStatus(`Loading bench run ${runId.slice(0, 8)}...`);
    try {
      const payload = await apiJson<BranchRunStatusPayload>(`/api/design/branch-runs/${encodeURIComponent(runId)}`);
      deps.setSelectedBranchNodeId(null);
      deps.renderBranchWorkspace(payload);
      deps.renderBranchRunResults(payload);
      deps.updateDesignStatus(
        `${payload.completed_samples ?? 0}/${payload.target_samples ?? "?"} samples restored from history.`,
        "success",
      );
      deps.flashStatus("Bench history loaded.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open historical branch run.";
      deps.updateDesignStatus(message, "error");
      deps.setError(deps.errorEl, message);
    }
  }

  function renderDesignSteps(payload: SceneJobStatusPayload, currentStage: string, failed: boolean = false): string {
    const currentIndex = getStepIndex(currentStage);
    const steps = DESIGN_GENERATION_STEPS.map((step, idx) => {
      let stateClass = "";
      let iconSvg = "";
      const operation = latestOperationForStage(payload, step.key);

      if (idx < currentIndex) {
        stateClass = "completed";
        iconSvg = `<svg viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2"><path d="M2 6l3 3 5-5"/></svg>`;
      } else if (idx === currentIndex && !failed) {
        stateClass = "active";
      } else if (idx === currentIndex && failed) {
        stateClass = "failed";
        iconSvg = `<svg viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2"><path d="M3 3l6 6M9 3l-6 6"/></svg>`;
      }

      return `<div class="viewer-design-step ${stateClass}">
        <div class="viewer-design-step-indicator">${iconSvg}</div>
        <span>
          <strong>${step.label}</strong>
          <small>${escapeHtml(operation?.message || step.detailHint)}</small>
        </span>
      </div>`;
    });

    return `<div class="viewer-design-steps">${steps.join("")}</div>`;
  }

  async function waitForDesignJob(
    jobId: string,
    preset: DesignPreset | null,
    variant: DesignSchemeVariant,
    prompt: string,
    graphTemplateId: string,
    structureSource: string,
    semanticSummary: DesignSemanticSummary,
  ): Promise<SceneJobResult> {
    for (let attempt = 0; attempt < DESIGN_MAX_POLL_ATTEMPTS; attempt += 1) {
      const payload = await apiJson<SceneJobStatusPayload>(`/api/scene/jobs/${encodeURIComponent(jobId)}`);
      const { progress, message, stage } = describeDesignJobProgress(payload);
      deps.updateDesignStatus(`${message} (${progress}%)`);
      deps.renderDesignWorkspace(payload, preset, variant, prompt, graphTemplateId, structureSource, semanticSummary);

      const isFailed = payload.status === "failed";
      deps.designResultEl.innerHTML = `
        <div class="viewer-design-progress" aria-label="Generation progress">
          <div style="width:${clamp(progress, 0, 100)}%"></div>
        </div>
        ${renderDesignSteps(payload, stage, isFailed)}
      `;

      if (payload.status === "succeeded" && payload.result) {
        return payload.result;
      }
      if (payload.status === "failed") {
        throw new Error(payload.error || "Generation job failed.");
      }
      await sleep(DESIGN_POLL_INTERVAL_MS);
    }
    throw new Error("Generation timed out.");
  }

  async function runDesignGeneration(): Promise<void> {
    if (designIsGenerating) return;
    const preset = deps.getSelectedDesignPreset();
    const scenario = deps.getSelectedScenarioDesign();
    const prompt = deps.designPromptEl.value.trim();
    const effectivePrompt = effectiveDesignPrompt(preset, prompt, scenario);
    const graphTemplateId = deps.designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
    const semanticConfigPatch = deps.getDesignSemanticConfigPatch();
    const semanticSummary = deps.getDesignSemanticSummary(preset);
    const structureSource = scenario
      ? (scenario.title_zh || scenario.scenario_id)
      : `基础模板 · ${graphTemplateId}`;
    const variants = deps.designCountEl.value === "3" ? DESIGN_SCHEME_VARIANTS : [DESIGN_SCHEME_VARIANTS[0]];
    const generatedSchemes: GeneratedDesignScheme[] = [];
    designIsGenerating = true;
    deps.designGenerateEl.disabled = true;
    deps.designReviewRunEl.disabled = !deps.hasLastDesignRunSnapshot();
    deps.updateDesignStatus("Submitting generation job...");
    deps.designResultEl.innerHTML = "";
    deps.designWorkspaceEl.hidden = false;
    deps.minimapEl.hidden = true;
    const presetLabel = preset ? `${preset.nameEn} / ${preset.name}` : "Custom / LLM-Driven";
    const scenarioLabel = scenario ? (scenario.title_zh || scenario.scenario_id) : "Base Template";
    deps.designWorkspaceEl.innerHTML = `
      <div class="viewer-design-workspace-shell">
        <header class="viewer-design-workspace-header">
          <div>
            <span class="viewer-design-workspace-kicker">${escapeHtml(presetLabel)} · ${escapeHtml(graphTemplateId)} · ${escapeHtml(scenarioLabel)}</span>
            <h2>Design Run</h2>
            <p>正在提交生成任务。</p>
          </div>
          <div class="viewer-design-workspace-header-actions">
            <button class="viewer-design-workspace-close" type="button" data-design-workspace-close aria-label="Close Design Run" title="Close Design Run">×</button>
            <div class="viewer-design-workspace-progress">
              <strong>0%</strong>
              <span>准备提交</span>
            </div>
          </div>
        </header>
        ${renderDesignImprovementSummary(preset, variants[0]!, effectivePrompt, graphTemplateId, structureSource, semanticSummary)}
      </div>
    `;
    deps.setStatus("Submitting design generation job...");

    try {
      for (const variant of variants) {
        deps.updateDesignStatus(`Submitting ${variant.name} · ${scenarioLabel}...`);
        try {
          const createPayload = await submitDesignJob(preset, prompt, graphTemplateId, variant, scenario, semanticConfigPatch);
          deps.updateDesignStatus(`${variant.name}: job ${createPayload.job_id} submitted${scenario ? ` with ${scenario.scenario_id}` : ""}.`);
          const result = await waitForDesignJob(createPayload.job_id, preset, variant, effectivePrompt, graphTemplateId, structureSource, semanticSummary);
          if (!result.scene_layout_path) {
            throw new Error("Generation finished without a scene_layout_path.");
          }
          generatedSchemes.push({
            id: variant.id,
            name: variant.name,
            layoutPath: result.scene_layout_path,
            status: "ready",
            metadata: generatedSchemeMetadata(
              result,
              preset,
              variant,
              effectivePrompt,
              graphTemplateId,
              scenario,
              presetLabel,
            ),
          });
          renderGeneratedDesignSchemes(generatedSchemes);
        } catch (err) {
          const message = err instanceof Error ? err.message : `${variant.name} generation failed.`;
          generatedSchemes.push({
            id: variant.id,
            name: variant.name,
            layoutPath: "",
            status: "failed",
            error: message,
          });
          renderGeneratedDesignSchemes(generatedSchemes);
          if (variants.length === 1) {
            throw err;
          }
        }
      }
      const firstReady = generatedSchemes.find((scheme) => scheme.status === "ready");
      if (!firstReady) {
        throw new Error("No schemes were generated successfully.");
      }
      clearRecentLayoutsCacheWithReason("design-generation-complete");
      clearManifestCacheWithReason("design-generation-complete");
      await deps.loadLayoutSelection(firstReady.layoutPath);
      const recent = await loadRecentLayouts(50, false);
      deps.populateRecentLayoutOptions(recent, firstReady.layoutPath);
      renderGeneratedDesignSchemes(generatedSchemes);
      const readyCount = generatedSchemes.filter((scheme) => scheme.status === "ready").length;
      deps.updateDesignStatus(
        `${readyCount}/${variants.length} schemes generated. Open Scene Browser from the left menu to compare.`,
        "success",
      );
      deps.flashStatus(
        `${firstReady.name} loaded in Viewer${scenario ? ` · ${scenario.scenario_id}` : ""}. Results are available in Scene Browser for manual comparison.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Design generation failed.";
      deps.updateDesignStatus(message, "error");
      deps.designResultEl.innerHTML = `<div class="viewer-design-error">${escapeHtml(message)}</div>`;
      deps.setError(deps.errorEl, message);
    } finally {
      designIsGenerating = false;
      deps.designGenerateEl.disabled = false;
      deps.designReviewRunEl.disabled = !deps.hasLastDesignRunSnapshot();
    }
  }

  return {
    runDesignGeneration,
    runBranchGeneration,
    loadBranchRunHistory,
    loadBenchmarkExplorer,
    loadLatestScoreResults,
    isDesignGenerating: () => designIsGenerating,
    isBranchRunGenerating: () => branchRunIsGenerating,
  };
}
