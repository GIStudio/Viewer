import type { CompareSceneSetItem } from "./compare-mode";
import type {
  ComparisonItem,
  RecentLayout,
  ViewerComparisonMetadata,
  ViewerManifest,
} from "./viewer-types";
import { metadataFromManifest, formatMetadataValue } from "./viewer-comparison-metadata";

const STORAGE_KEY = "roadgen3d.manualComparisonPaths.v1";
const FINAL_STEP_KEY = "final_scene";
const MAX_SELECTION = 3;

type CommonStep = {
  key: string;
  label: string;
};

type HydratedComparisonItem = ComparisonItem & {
  manifest?: ViewerManifest;
  metadata?: ViewerComparisonMetadata;
  error?: string;
  loading?: boolean;
};

export type SchemeCompareController = {
  setRecentLayouts: (layouts: RecentLayout[], selectedLayoutPath?: string) => void;
  restoreStoredSelection: () => void;
  clearSelection: () => void;
  selectedLayoutPaths: () => string[];
};

export type SchemeCompareControllerDeps = {
  hostEl: HTMLElement;
  loadManifest: (layoutPath: string) => Promise<ViewerManifest>;
  enterCompareSceneSet: (items: CompareSceneSetItem[], stepLabel?: string) => Promise<void>;
  syncComparePair: (a: ComparisonItem, b: ComparisonItem, openDetails: boolean) => void;
  escapeHtml: (text: string) => string;
  compactUiLabel: (label: string, maxLength?: number) => string;
  makeDirectLayoutLabel: (layoutPath: string) => string;
  flashStatus: (message: string) => void;
  setStatus: (message: string) => void;
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function safeStoredPaths(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : Array.isArray((value as { layout_paths?: unknown[] } | null)?.layout_paths)
      ? (value as { layout_paths: unknown[] }).layout_paths
      : [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const item of source) {
    const path = cleanString(item);
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    paths.push(path);
    if (paths.length >= MAX_SELECTION) {
      break;
    }
  }
  return paths;
}

export function createSchemeCompareController(deps: SchemeCompareControllerDeps): SchemeCompareController {
  let recentLayouts: RecentLayout[] = [];
  let currentLayoutPath = "";
  let selectedPaths: string[] = [];
  let hydratedItems = new Map<string, HydratedComparisonItem>();
  let commonSteps: CommonStep[] = [{ key: FINAL_STEP_KEY, label: "Final Scene" }];
  let selectedStepKey = FINAL_STEP_KEY;
  let splitHasOpened = false;
  let hydrationVersion = 0;

  function persist(): void {
    if (selectedPaths.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedPaths));
  }

  function candidateLayouts(): RecentLayout[] {
    const byPath = new Map<string, RecentLayout>();
    const recentPaths = new Set(recentLayouts.map((layout) => cleanString(layout.layout_path)).filter(Boolean));
    const addDirect = (layoutPath: string) => {
      const path = cleanString(layoutPath);
      if (!path || byPath.has(path)) {
        return;
      }
      byPath.set(path, {
        id: path,
        label: deps.makeDirectLayoutLabel(path),
        layout_path: path,
        created_at: "",
        source: "direct",
      });
    };

    if (currentLayoutPath && !recentPaths.has(currentLayoutPath)) {
      addDirect(currentLayoutPath);
    }
    for (const layout of recentLayouts) {
      const path = cleanString(layout.layout_path);
      if (path && !byPath.has(path)) {
        byPath.set(path, layout);
      }
    }
    for (const path of selectedPaths) {
      addDirect(path);
    }
    return Array.from(byPath.values());
  }

  function layoutLabel(layoutPath: string): string {
    const layout = candidateLayouts().find((item) => item.layout_path === layoutPath);
    return layout?.label || deps.makeDirectLayoutLabel(layoutPath);
  }

  function selectedItems(): HydratedComparisonItem[] {
    return selectedPaths.map((path, index) => {
      const existing = hydratedItems.get(path);
      const schemeId = String.fromCharCode(65 + index);
      const variantName = existing?.metadata?.variant_name
        ? `${schemeId} · ${existing.metadata.variant_name}`
        : `Scheme ${schemeId}`;
      return {
        ...existing,
        scheme_id: schemeId,
        variant_name: variantName,
        layout_path: path,
      };
    });
  }

  function readyItems(): HydratedComparisonItem[] {
    return selectedItems().filter((item) => item.manifest && !item.error);
  }

  function recomputeCommonSteps(): void {
    commonSteps = commonStepsFor(readyItems());
    if (!commonSteps.some((step) => step.key === selectedStepKey)) {
      selectedStepKey = commonSteps[0]?.key ?? FINAL_STEP_KEY;
    }
  }

  function render(): void {
    const candidates = candidateLayouts();
    const selected = selectedItems();
    const ready = readyItems();
    const selectedStep = commonSteps.find((step) => step.key === selectedStepKey) ?? commonSteps[0]!;
    deps.hostEl.innerHTML = `
      <div class="viewer-scheme-compare-manual">
        <div class="viewer-scheme-compare-manual-header">
          <div>
            <strong>Compare Results</strong>
            <span>${selectedPaths.length ? `${selectedPaths.length}/${MAX_SELECTION} selected` : "Select 2-3 recent results"}</span>
          </div>
          ${selectedPaths.length ? '<button class="viewer-scheme-compare-clear" type="button">Clear</button>' : ""}
        </div>
        <div class="viewer-scheme-compare-results" role="list">
          ${candidates.map((layout) => renderCandidate(layout)).join("")}
        </div>
        ${selectedPaths.length < 2 ? renderManualEmpty() : `
          <label class="desktop-shell-field">
            <span>Shared Step / 同步步骤</span>
            <select class="viewer-select viewer-select-inline viewer-scheme-compare-step" ${ready.length < 2 ? "disabled" : ""}>
              ${commonSteps.map((step) => `
                <option value="${deps.escapeHtml(step.key)}" ${step.key === selectedStep.key ? "selected" : ""}>
                  ${deps.escapeHtml(step.label)}
                </option>
              `).join("")}
            </select>
          </label>
          <div class="viewer-scheme-compare-list">
            ${selected.map((item) => renderItem(item)).join("")}
          </div>
          <div class="viewer-scheme-compare-actions">
            <button class="viewer-nav-button viewer-scheme-compare-open" type="button" ${ready.length < 2 ? "disabled" : ""}>Open Split</button>
            <button class="viewer-nav-button viewer-nav-button-secondary viewer-scheme-compare-details" type="button" ${ready.length < 2 ? "disabled" : ""}>Details A/B</button>
          </div>
        `}
      </div>
    `;
  }

  function renderManualEmpty(): string {
    return `
      <div class="viewer-scheme-compare-empty">
        <strong>Select 2-3 recent results to compare</strong>
        <span>Use the checkboxes above. The current direct layout is included even when it is not in the recent list yet.</span>
      </div>
    `;
  }

  function renderCandidate(layout: RecentLayout): string {
    const path = layout.layout_path;
    const selectedIndex = selectedPaths.indexOf(path);
    const selected = selectedIndex >= 0;
    const item = hydratedItems.get(path);
    const metadata = item?.metadata;
    const label = deps.compactUiLabel(layout.label || path, 46);
    const detail = item?.loading
      ? "Loading metadata..."
      : item?.error
        ? "Manifest failed"
        : metadata
          ? [
              metadata.scenario_title || metadata.scenario_id,
              metadata.preset_label || metadata.preset_id,
              metadata.graph_template_id,
            ].filter(Boolean).join(" · ") || layout.relative_path || layout.source || "Layout"
          : layout.relative_path || layout.source || "Layout";
    return `
      <label class="viewer-scheme-compare-row" data-selected="${selected ? "true" : "false"}" data-error="${item?.error ? "true" : "false"}">
        <input
          class="viewer-scheme-compare-check"
          type="checkbox"
          value="${deps.escapeHtml(path)}"
          ${selected ? "checked" : ""}
          ${!selected && selectedPaths.length >= MAX_SELECTION ? "disabled" : ""}
        />
        <span>
          <strong>${deps.escapeHtml(label)}</strong>
          <small>${deps.escapeHtml(detail)}</small>
        </span>
        ${selected ? `<em>${deps.escapeHtml(String.fromCharCode(65 + selectedIndex))}</em>` : ""}
      </label>
    `;
  }

  function renderItem(item: HydratedComparisonItem): string {
    const metadata = item.metadata ?? {};
    const label = item.variant_name || metadata.variant_name || item.scheme_id;
    if (item.loading) {
      return `
        <article class="viewer-scheme-compare-card">
          <div class="viewer-scheme-compare-card-title">
            <strong>${deps.escapeHtml(label)}</strong>
            <span>Loading metadata for ${deps.escapeHtml(deps.compactUiLabel(layoutLabel(item.layout_path), 42))}</span>
          </div>
        </article>
      `;
    }
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
    const preset = metadata.preset_label || metadata.preset_id || "Custom";
    const scenario = metadata.scenario_title || metadata.scenario_id || "Base Template";
    return `
      <article class="viewer-scheme-compare-card">
        <div class="viewer-scheme-compare-card-title">
          <strong>${deps.escapeHtml(label)}</strong>
          <span>${deps.escapeHtml(deps.compactUiLabel(layoutLabel(item.layout_path), 42))}</span>
        </div>
        <dl class="viewer-scheme-compare-meta">
          <div><dt>Preset</dt><dd>${deps.escapeHtml(preset)}</dd></div>
          <div><dt>Scenario</dt><dd>${deps.escapeHtml(scenario)}</dd></div>
          <div><dt>Graph</dt><dd>${deps.escapeHtml(formatMetadataValue(metadata.graph_template_id))}</dd></div>
          <div><dt>Seed</dt><dd>${deps.escapeHtml(formatMetadataValue(metadata.random_seed))}</dd></div>
          <div><dt>Density</dt><dd>${deps.escapeHtml(formatMetadataValue(metadata.density))}</dd></div>
          <div><dt>Road</dt><dd>${deps.escapeHtml(formatMetadataValue(metadata.road_width_m, " m"))}</dd></div>
          <div><dt>Lanes</dt><dd>${deps.escapeHtml(formatMetadataValue(metadata.lane_count))}</dd></div>
          <div><dt>Items</dt><dd>${deps.escapeHtml(formatMetadataValue(metadata.instance_count))}</dd></div>
          <div><dt>Style</dt><dd>${deps.escapeHtml(formatMetadataValue(metadata.style_preset))}</dd></div>
        </dl>
      </article>
    `;
  }

  function hydrateSelected(): void {
    const version = ++hydrationVersion;
    for (const path of selectedPaths) {
      const existing = hydratedItems.get(path);
      if (existing?.manifest || existing?.loading) {
        continue;
      }
      const index = selectedPaths.indexOf(path);
      const schemeId = String.fromCharCode(65 + Math.max(0, index));
      hydratedItems.set(path, {
        scheme_id: schemeId,
        variant_name: `Scheme ${schemeId}`,
        layout_path: path,
        loading: true,
      });
      render();
      void deps.loadManifest(path)
        .then((manifest) => {
          if (version !== hydrationVersion && !selectedPaths.includes(path)) {
            return;
          }
          const currentIndex = selectedPaths.indexOf(path);
          const currentSchemeId = String.fromCharCode(65 + Math.max(0, currentIndex));
          hydratedItems.set(path, {
            scheme_id: currentSchemeId,
            variant_name: `Scheme ${currentSchemeId}`,
            layout_path: path,
            manifest,
            metadata: metadataFromManifest(manifest),
          });
          recomputeCommonSteps();
          render();
          syncDetailsPair(false);
          if (splitHasOpened) {
            openSplitView();
          }
        })
        .catch((error) => {
          const currentIndex = selectedPaths.indexOf(path);
          const currentSchemeId = String.fromCharCode(65 + Math.max(0, currentIndex));
          hydratedItems.set(path, {
            scheme_id: currentSchemeId,
            variant_name: `Scheme ${currentSchemeId}`,
            layout_path: path,
            error: error instanceof Error ? error.message : "Failed to load manifest.",
          });
          recomputeCommonSteps();
          render();
        });
    }
    recomputeCommonSteps();
    render();
  }

  function syncDetailsPair(openDetails: boolean): void {
    const ready = readyItems();
    if (ready.length < 2) {
      return;
    }
    deps.syncComparePair(ready[0]!, ready[1]!, openDetails);
  }

  function openSplitView(): void {
    const ready = readyItems();
    if (ready.length < 2) {
      deps.setStatus("Select at least two valid recent results to compare.");
      return;
    }
    const selectedStep = commonSteps.find((step) => step.key === selectedStepKey) ?? commonSteps[0]!;
    const items = ready
      .map((item): CompareSceneSetItem => ({
        id: item.scheme_id,
        label: item.variant_name || item.metadata?.variant_name || item.scheme_id,
        layoutPath: item.layout_path,
        glbUrl: glbForStep(item.manifest!, selectedStep.key),
        stepKey: selectedStep.key,
        metadata: item.metadata,
      }))
      .filter((item) => item.glbUrl);
    if (items.length < 2) {
      deps.setStatus("The selected results do not share a viewable step.");
      return;
    }
    splitHasOpened = true;
    void deps.enterCompareSceneSet(items, selectedStep.label);
  }

  function openDetails(): void {
    const ready = readyItems();
    if (ready.length < 2) {
      deps.setStatus("Select at least two valid recent results to compare.");
      return;
    }
    syncDetailsPair(true);
  }

  deps.hostEl.addEventListener("change", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.classList.contains("viewer-scheme-compare-check")) {
      const checkbox = target as HTMLInputElement;
      const path = checkbox.value;
      if (checkbox.checked) {
        if (!selectedPaths.includes(path)) {
          if (selectedPaths.length >= MAX_SELECTION) {
            deps.flashStatus("Choose up to 3 recent results for one comparison.");
            render();
            return;
          }
          selectedPaths.push(path);
        }
      } else {
        selectedPaths = selectedPaths.filter((item) => item !== path);
        splitHasOpened = false;
      }
      persist();
      recomputeCommonSteps();
      render();
      hydrateSelected();
      return;
    }
    if (target?.classList.contains("viewer-scheme-compare-step")) {
      selectedStepKey = (target as HTMLSelectElement).value || FINAL_STEP_KEY;
      render();
      if (splitHasOpened) {
        openSplitView();
      }
    }
  });

  deps.hostEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".viewer-scheme-compare-clear")) {
      clearSelection();
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

  function setRecentLayouts(layouts: RecentLayout[], selectedLayoutPath = ""): void {
    recentLayouts = layouts;
    currentLayoutPath = cleanString(selectedLayoutPath) || currentLayoutPath;
    recomputeCommonSteps();
    render();
    hydrateSelected();
  }

  function restoreStoredSelection(): void {
    try {
      selectedPaths = safeStoredPaths(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      selectedPaths = [];
    }
    recomputeCommonSteps();
    render();
    hydrateSelected();
  }

  function clearSelection(): void {
    selectedPaths = [];
    splitHasOpened = false;
    hydratedItems = new Map<string, HydratedComparisonItem>();
    commonSteps = [{ key: FINAL_STEP_KEY, label: "Final Scene" }];
    selectedStepKey = FINAL_STEP_KEY;
    persist();
    render();
    deps.flashStatus("Recent comparison selection cleared.");
  }

  render();
  return {
    setRecentLayouts,
    restoreStoredSelection,
    clearSelection,
    selectedLayoutPaths: () => [...selectedPaths],
  };
}
