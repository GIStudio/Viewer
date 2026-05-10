import type { CompareSceneSetItem } from "./compare-mode";
import type {
  ComparisonGroup,
  ComparisonItem,
  ViewerComparisonMetadata,
  ViewerManifest,
} from "./viewer-types";

const STORAGE_KEY = "roadgen3d.schemeComparisonGroup.v1";
const FINAL_STEP_KEY = "final_scene";

type CommonStep = {
  key: string;
  label: string;
};

type HydratedComparisonItem = ComparisonItem & {
  manifest?: ViewerManifest;
  metadata?: ViewerComparisonMetadata;
  error?: string;
};

export type SchemeCompareController = {
  setGroup: (group: ComparisonGroup) => void;
  restoreStoredGroup: () => void;
  clearGroup: () => void;
  currentGroup: () => ComparisonGroup | null;
};

export type SchemeCompareControllerDeps = {
  hostEl: HTMLElement;
  loadManifest: (layoutPath: string) => Promise<ViewerManifest>;
  enterCompareSceneSet: (items: CompareSceneSetItem[], stepLabel?: string) => Promise<void>;
  syncComparePair: (a: ComparisonItem, b: ComparisonItem, openDetails: boolean) => void;
  escapeHtml: (text: string) => string;
  compactUiLabel: (label: string, maxLength?: number) => string;
  flashStatus: (message: string) => void;
  setStatus: (message: string) => void;
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function metadataFromManifest(manifest: ViewerManifest): ViewerComparisonMetadata {
  const summary = manifest.summary ?? {};
  const comparison = manifest.comparison_metadata ?? {};
  return {
    ...comparison,
    preset_id: comparison.preset_id || cleanString(summary.preset_id) || cleanString(summary.benchmark_preset_id),
    preset_label: comparison.preset_label || cleanString(summary.preset_name) || cleanString(summary.preset_label),
    scenario_id: comparison.scenario_id || cleanString(summary.scenario_id),
    scenario_title: comparison.scenario_title || cleanString(summary.scenario_title),
    graph_template_id: comparison.graph_template_id || cleanString(summary.graph_template_id) || cleanString(summary.base_graph_template_id) || cleanString(summary.plan_id),
    random_seed: comparison.random_seed ?? finiteNumber(summary.random_seed),
    density: comparison.density ?? finiteNumber(summary.density),
    road_width_m: comparison.road_width_m ?? finiteNumber(summary.road_width_m),
    lane_count: comparison.lane_count ?? finiteNumber(summary.lane_count),
    style_preset: comparison.style_preset || cleanString(summary.style_preset) || cleanString(summary.visual_style_preset),
    instance_count: comparison.instance_count ?? finiteNumber(summary.instance_count),
    production_step_ids: comparison.production_step_ids ?? manifest.production_steps?.map((step) => step.step_id),
  };
}

function mergeMetadata(item: ComparisonItem, manifest: ViewerManifest): ViewerComparisonMetadata {
  return {
    ...metadataFromManifest(manifest),
    ...(item.metadata ?? {}),
  };
}

function buildStepMap(manifest: ViewerManifest): Map<string, string> {
  const steps = new Map<string, string>();
  steps.set(FINAL_STEP_KEY, manifest.final_scene?.label || "Final Scene");
  for (const step of manifest.production_steps ?? []) {
    if (step.step_id) {
      steps.set(step.step_id, step.title || step.step_id);
    }
  }
  return steps;
}

function commonStepsFor(items: HydratedComparisonItem[]): CommonStep[] {
  const manifests = items.map((item) => item.manifest).filter((manifest): manifest is ViewerManifest => Boolean(manifest));
  if (manifests.length === 0) {
    return [{ key: FINAL_STEP_KEY, label: "Final Scene" }];
  }
  const first = buildStepMap(manifests[0]!);
  const remaining = manifests.slice(1).map(buildStepMap);
  const common = Array.from(first.entries())
    .filter(([key]) => remaining.every((steps) => steps.has(key)))
    .map(([key, label]) => ({ key, label }));
  return common.length ? common : [{ key: FINAL_STEP_KEY, label: "Final Scene" }];
}

function glbForStep(manifest: ViewerManifest, stepKey: string): string {
  if (stepKey === FINAL_STEP_KEY) {
    return manifest.final_scene?.glb_url || "";
  }
  return manifest.production_steps?.find((step) => step.step_id === stepKey)?.glb_url || "";
}

function formatValue(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }
  if (typeof value === "number") {
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}${suffix}`;
  }
  return String(value);
}

function safeStoredGroup(value: unknown): ComparisonGroup | null {
  const record = value as Partial<ComparisonGroup> | null;
  if (!record || typeof record !== "object" || !Array.isArray(record.items)) {
    return null;
  }
  const items = record.items
    .map((item) => item as Partial<ComparisonItem>)
    .filter((item) => typeof item.layout_path === "string" && item.layout_path.trim())
    .map((item, index) => ({
      scheme_id: cleanString(item.scheme_id) || String.fromCharCode(65 + index),
      variant_name: cleanString(item.variant_name) || `Scheme ${String.fromCharCode(65 + index)}`,
      layout_path: cleanString(item.layout_path),
      metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined,
    }));
  if (items.length < 2) {
    return null;
  }
  return {
    id: cleanString(record.id) || `comparison-${Date.now()}`,
    title: cleanString(record.title) || "Scheme Compare",
    created_at: cleanString(record.created_at),
    source: cleanString(record.source),
    items,
  };
}

export function createSchemeCompareController(deps: SchemeCompareControllerDeps): SchemeCompareController {
  let group: ComparisonGroup | null = null;
  let hydratedItems: HydratedComparisonItem[] = [];
  let commonSteps: CommonStep[] = [{ key: FINAL_STEP_KEY, label: "Final Scene" }];
  let selectedStepKey = FINAL_STEP_KEY;
  let loading = false;

  function persist(): void {
    if (!group) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(group));
  }

  function renderEmpty(): void {
    deps.hostEl.innerHTML = `
      <div class="viewer-scheme-compare-empty">
        <strong>Scheme Compare</strong>
        <span>Generate 2-3 schemes to compare synchronized production steps here.</span>
      </div>
    `;
  }

  function render(): void {
    if (!group) {
      renderEmpty();
      return;
    }
    if (loading) {
      deps.hostEl.innerHTML = `
        <div class="viewer-scheme-compare-loading">
          <strong>${deps.escapeHtml(group.title || "Scheme Compare")}</strong>
          <span>Loading comparison metadata...</span>
        </div>
      `;
      return;
    }

    const readyItems = hydratedItems.filter((item) => item.manifest && !item.error);
    const selectedStep = commonSteps.find((step) => step.key === selectedStepKey) ?? commonSteps[0]!;
    deps.hostEl.innerHTML = `
      <div class="viewer-scheme-compare-header">
        <div>
          <strong>${deps.escapeHtml(group.title || "Scheme Compare")}</strong>
          <span>${readyItems.length}/${group.items.length} schemes ready</span>
        </div>
        <button class="viewer-scheme-compare-clear" type="button" title="Clear comparison">Clear</button>
      </div>
      <label class="desktop-shell-field">
        <span>Shared Step / 同步步骤</span>
        <select class="viewer-select viewer-select-inline viewer-scheme-compare-step">
          ${commonSteps.map((step) => `
            <option value="${deps.escapeHtml(step.key)}" ${step.key === selectedStep.key ? "selected" : ""}>
              ${deps.escapeHtml(step.label)}
            </option>
          `).join("")}
        </select>
      </label>
      <div class="viewer-scheme-compare-list">
        ${hydratedItems.map((item) => renderItem(item)).join("")}
      </div>
      <div class="viewer-scheme-compare-actions">
        <button class="viewer-nav-button viewer-scheme-compare-open" type="button" ${readyItems.length < 2 ? "disabled" : ""}>Open Split</button>
        <button class="viewer-nav-button viewer-nav-button-secondary viewer-scheme-compare-details" type="button" ${readyItems.length < 2 ? "disabled" : ""}>Details A/B</button>
      </div>
    `;
  }

  function renderItem(item: HydratedComparisonItem): string {
    const metadata = item.metadata ?? {};
    const label = item.variant_name || metadata.variant_name || item.scheme_id;
    const preset = metadata.preset_label || metadata.preset_id || "Custom";
    const scenario = metadata.scenario_title || metadata.scenario_id || "Base Template";
    const pathLabel = deps.compactUiLabel(item.layout_path, 42);
    if (item.error) {
      return `
        <article class="viewer-scheme-compare-card" data-tone="error">
          <div class="viewer-scheme-compare-card-title">
            <strong>${deps.escapeHtml(label)}</strong>
            <span>Failed</span>
          </div>
          <p>${deps.escapeHtml(item.error)}</p>
        </article>
      `;
    }
    return `
      <article class="viewer-scheme-compare-card">
        <div class="viewer-scheme-compare-card-title">
          <strong>${deps.escapeHtml(label)}</strong>
          <span>${deps.escapeHtml(pathLabel)}</span>
        </div>
        <dl class="viewer-scheme-compare-meta">
          <div><dt>Preset</dt><dd>${deps.escapeHtml(preset)}</dd></div>
          <div><dt>Scenario</dt><dd>${deps.escapeHtml(scenario)}</dd></div>
          <div><dt>Graph</dt><dd>${deps.escapeHtml(formatValue(metadata.graph_template_id))}</dd></div>
          <div><dt>Seed</dt><dd>${deps.escapeHtml(formatValue(metadata.random_seed))}</dd></div>
          <div><dt>Density</dt><dd>${deps.escapeHtml(formatValue(metadata.density))}</dd></div>
          <div><dt>Road</dt><dd>${deps.escapeHtml(formatValue(metadata.road_width_m, " m"))}</dd></div>
          <div><dt>Lanes</dt><dd>${deps.escapeHtml(formatValue(metadata.lane_count))}</dd></div>
          <div><dt>Items</dt><dd>${deps.escapeHtml(formatValue(metadata.instance_count))}</dd></div>
          <div><dt>Style</dt><dd>${deps.escapeHtml(formatValue(metadata.style_preset))}</dd></div>
        </dl>
      </article>
    `;
  }

  async function hydrateActiveGroup(): Promise<void> {
    if (!group) return;
    loading = true;
    render();
    const nextItems = await Promise.all(group.items.map(async (item): Promise<HydratedComparisonItem> => {
      try {
        const manifest = await deps.loadManifest(item.layout_path);
        return {
          ...item,
          manifest,
          metadata: mergeMetadata(item, manifest),
        };
      } catch (error) {
        return {
          ...item,
          metadata: item.metadata,
          error: error instanceof Error ? error.message : "Failed to load manifest.",
        };
      }
    }));
    hydratedItems = nextItems;
    commonSteps = commonStepsFor(hydratedItems);
    if (!commonSteps.some((step) => step.key === selectedStepKey)) {
      selectedStepKey = commonSteps[0]?.key ?? FINAL_STEP_KEY;
    }
    loading = false;
    render();
    const readyItems = hydratedItems.filter((item) => item.manifest && !item.error);
    if (readyItems.length >= 2) {
      deps.syncComparePair(readyItems[0]!, readyItems[1]!, false);
    }
  }

  function openSplitView(): void {
    const selectedStep = commonSteps.find((step) => step.key === selectedStepKey) ?? commonSteps[0]!;
    const items = hydratedItems
      .filter((item) => item.manifest && !item.error)
      .map((item): CompareSceneSetItem => ({
        id: item.scheme_id,
        label: item.variant_name || item.metadata?.variant_name || item.scheme_id,
        layoutPath: item.layout_path,
        glbUrl: glbForStep(item.manifest!, selectedStep.key),
        stepKey: selectedStep.key,
        metadata: item.metadata,
      }))
      .filter((item) => item.glbUrl);
    void deps.enterCompareSceneSet(items, selectedStep.label);
  }

  function openDetails(): void {
    const readyItems = hydratedItems.filter((item) => item.manifest && !item.error);
    if (readyItems.length < 2) return;
    deps.syncComparePair(readyItems[0]!, readyItems[1]!, true);
  }

  deps.hostEl.addEventListener("change", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.classList.contains("viewer-scheme-compare-step")) {
      selectedStepKey = (target as HTMLSelectElement).value || FINAL_STEP_KEY;
      render();
      openSplitView();
    }
  });

  deps.hostEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".viewer-scheme-compare-clear")) {
      clearGroup();
      return;
    }
    if (target?.closest(".viewer-scheme-compare-open")) {
      openSplitView();
      return;
    }
    if (target?.closest(".viewer-scheme-compare-details")) {
      openDetails();
    }
  });

  function setGroup(nextGroup: ComparisonGroup): void {
    group = safeStoredGroup(nextGroup);
    selectedStepKey = FINAL_STEP_KEY;
    hydratedItems = [];
    commonSteps = [{ key: FINAL_STEP_KEY, label: "Final Scene" }];
    persist();
    void hydrateActiveGroup();
  }

  function restoreStoredGroup(): void {
    try {
      group = safeStoredGroup(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"));
    } catch {
      group = null;
    }
    if (!group) {
      renderEmpty();
      return;
    }
    void hydrateActiveGroup();
  }

  function clearGroup(): void {
    group = null;
    hydratedItems = [];
    commonSteps = [{ key: FINAL_STEP_KEY, label: "Final Scene" }];
    selectedStepKey = FINAL_STEP_KEY;
    persist();
    renderEmpty();
    deps.flashStatus("Scheme comparison cleared.");
  }

  renderEmpty();
  return {
    setGroup,
    restoreStoredGroup,
    clearGroup,
    currentGroup: () => group,
  };
}
