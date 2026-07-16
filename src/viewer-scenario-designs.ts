import { apiJson, postApiJson, type LoadManifestOptions } from "./viewer-api";
import type {
  ScenarioDesign,
  ScenarioDesignCatalogPayload,
  ScenarioDesignReportPayload,
  ScenarioDesignRunItem,
  ScenarioDesignRunPayload,
} from "./viewer-types";
import { escapeHtml } from "./viewer-utils";
import { describeApiRequest } from "./api-origin";

export type ViewerScenarioDesignsController = {
  loadCatalog: () => Promise<void>;
  destroy: () => void;
};

export type ViewerScenarioDesignsControllerDeps = {
  listEl: HTMLElement;
  statusEl: HTMLElement;
  reportEl: HTMLElement;
  generateButtonEl: HTMLButtonElement;
  errorEl: HTMLElement;
  setStatus: (message: string) => void;
  flashStatus: (message: string, durationMs?: number) => void;
  setError: (element: HTMLElement, message: string) => void;
  setGraphTemplateId: (graphTemplateId: string) => void;
  loadLayoutSelection: (layoutPath: string, options?: LoadManifestOptions) => Promise<void>;
  refreshRecentLayouts: (selectedPath: string) => Promise<void>;
};

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "partial", "empty"]);
const STRUCTURE_PREVIEW_DEFAULT_STEP_KEY = "scene_preview";

export function createViewerScenarioDesignsController(
  deps: ViewerScenarioDesignsControllerDeps,
): ViewerScenarioDesignsController {
  let catalog: ScenarioDesignCatalogPayload | null = null;
  let currentRun: ScenarioDesignRunPayload | null = null;
  let pollTimer = 0;
  let destroyed = false;
  let activePollRunId = "";

  deps.generateButtonEl.addEventListener("click", () => {
    void submitRun();
  });

  deps.listEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const previewButton = target?.closest<HTMLButtonElement>("[data-scenario-preview]");
    if (previewButton) {
      void loadLayout(previewButton.dataset.scenarioPreview || "", "Structure preview loaded.", {
        defaultSceneOptionKey: STRUCTURE_PREVIEW_DEFAULT_STEP_KEY,
      });
      return;
    }
    const resultButton = target?.closest<HTMLButtonElement>("[data-scenario-result]");
    if (resultButton) {
      void loadLayout(
        resultButton.dataset.scenarioResult || "",
        "Scenario result loaded.",
        { sceneGlbPath: resultButton.dataset.scenarioGlb || "" },
      );
    }
  });

  deps.reportEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const reportButton = target?.closest<HTMLButtonElement>("[data-scenario-report]");
    if (!reportButton) {
      return;
    }
    void loadReport(reportButton.dataset.scenarioReport || "");
  });

  async function loadCatalog(): Promise<void> {
    deps.statusEl.textContent = "Loading scenario designs...";
    deps.generateButtonEl.disabled = true;
    try {
      catalog = await apiJson<ScenarioDesignCatalogPayload>("/api/scenario-designs");
      deps.setGraphTemplateId(catalog.graph_template_id || "hkust_gz_gate");
      const activeCount = enabledScenarioItems().length;
      deps.statusEl.textContent = `${activeCount}/${catalog.items.length} scenario designs active.`;
      deps.generateButtonEl.disabled = activeCount === 0;
      render();
    } catch (error) {
      catalog = null;
      deps.statusEl.textContent = "Backend unavailable.";
      deps.generateButtonEl.disabled = true;
      deps.reportEl.innerHTML = "";
      deps.listEl.innerHTML = `
        <div class="viewer-scenario-empty">
          ${escapeHtml(formatBackendError(error))}
        </div>
      `;
    }
  }

  async function submitRun(): Promise<void> {
    if (!catalog || catalog.items.length === 0) {
      await loadCatalog();
    }
    const enabledItems = enabledScenarioItems();
    if (!catalog || enabledItems.length === 0) {
      return;
    }
    deps.generateButtonEl.disabled = true;
    deps.statusEl.textContent = `Submitting ${enabledItems.length} x 3 scenario jobs...`;
    deps.setStatus("Submitting scenario design batch...");
    deps.setGraphTemplateId(catalog.graph_template_id || "hkust_gz_gate");
    try {
      currentRun = await postApiJson<ScenarioDesignRunPayload>("/api/scenario-designs/runs", {
        scenario_ids: enabledItems.map((item) => item.scenario_id),
        samples_per_scenario: 3,
        base_seed: 20260506,
        graph_template_id: catalog.graph_template_id || "hkust_gz_gate",
        generation_options: {},
      });
      activePollRunId = currentRun.run_id;
      render();
      schedulePoll(currentRun.run_id, 900);
    } catch (error) {
      deps.statusEl.textContent = formatBackendError(error);
      deps.setError(deps.errorEl, formatBackendError(error));
    } finally {
      deps.generateButtonEl.disabled = false;
    }
  }

  function schedulePoll(runId: string, delayMs: number): void {
    if (pollTimer) {
      window.clearTimeout(pollTimer);
    }
    pollTimer = window.setTimeout(() => {
      void pollRun(runId);
    }, delayMs);
  }

  async function pollRun(runId: string): Promise<void> {
    if (destroyed || activePollRunId !== runId) {
      return;
    }
    try {
      currentRun = await apiJson<ScenarioDesignRunPayload>(`/api/scenario-designs/runs/${encodeURIComponent(runId)}`);
      render();
      if (!TERMINAL_RUN_STATUSES.has(currentRun.status)) {
        schedulePoll(runId, 2200);
      } else {
        deps.flashStatus(`Scenario run ${currentRun.status}.`);
      }
    } catch (error) {
      deps.statusEl.textContent = formatBackendError(error);
      deps.setError(deps.errorEl, formatBackendError(error));
      schedulePoll(runId, 4000);
    }
  }

  async function loadReport(runId: string): Promise<void> {
    if (!runId) {
      return;
    }
    try {
      const report = await apiJson<ScenarioDesignReportPayload>(`/api/scenario-designs/runs/${encodeURIComponent(runId)}/report`);
      deps.reportEl.innerHTML = `
        <div class="viewer-scenario-report-card">
          <div class="viewer-scenario-report-title">Report ready</div>
          <div class="viewer-scenario-report-path">${escapeHtml(report.report_path)}</div>
          <pre class="viewer-scenario-report-summary">${escapeHtml(report.content_summary || report.content.slice(0, 360))}</pre>
        </div>
      `;
    } catch (error) {
      deps.setError(deps.errorEl, formatBackendError(error));
    }
  }

  async function loadLayout(layoutPath: string, successMessage: string, manifestOptions: LoadManifestOptions = {}): Promise<void> {
    if (!layoutPath) {
      return;
    }
    try {
      deps.setGraphTemplateId(currentRun?.graph_template_id || catalog?.graph_template_id || "hkust_gz_gate");
      deps.setStatus("Loading scenario layout...");
      await deps.loadLayoutSelection(layoutPath, manifestOptions);
      await deps.refreshRecentLayouts(layoutPath);
      deps.flashStatus(successMessage);
    } catch (error) {
      deps.setError(deps.errorEl, error instanceof Error ? error.message : "Failed to load scenario layout.");
      deps.setStatus("Scenario layout failed.");
    }
  }

  function render(): void {
    const items = catalog?.items ?? [];
    deps.listEl.innerHTML = items.map((item) => renderScenarioCard(item)).join("");
    renderRunPanel();
  }

  function renderRunPanel(): void {
    if (!currentRun) {
      deps.reportEl.innerHTML = renderRecentRuns();
      return;
    }
    const done = currentRun.completed_jobs + currentRun.failed_jobs;
    const total = Math.max(1, currentRun.total_jobs);
    const percent = Math.round((done / total) * 100);
    deps.statusEl.textContent = `Run ${currentRun.status}: ${done}/${currentRun.total_jobs} jobs settled.`;
    deps.reportEl.innerHTML = `
      <div class="viewer-scenario-run-card" data-status="${escapeHtml(currentRun.status)}">
        <div class="viewer-scenario-run-topline">
          <span class="viewer-scenario-run-id">${escapeHtml(currentRun.run_id)}</span>
          <span class="viewer-scenario-status-pill">${escapeHtml(currentRun.status)}</span>
        </div>
        <div class="viewer-scenario-progress" aria-label="Scenario generation progress">
          <span style="width: ${percent}%"></span>
        </div>
        <div class="viewer-scenario-run-meta">
          ${currentRun.completed_jobs} ok · ${currentRun.failed_jobs} failed · ${currentRun.total_jobs} total
        </div>
        <button class="viewer-scenario-link-button" type="button" data-scenario-report="${escapeHtml(currentRun.run_id)}">
          Load Report
        </button>
      </div>
    `;
  }

  function renderRecentRuns(): string {
    const runs = catalog?.runs ?? [];
    if (runs.length === 0) {
      return `<div class="viewer-scenario-empty">No scenario batch run yet.</div>`;
    }
    const run = runs[0];
    return `
      <div class="viewer-scenario-run-card">
        <div class="viewer-scenario-run-topline">
          <span class="viewer-scenario-run-id">${escapeHtml(run.run_id)}</span>
          <span class="viewer-scenario-status-pill">${escapeHtml(run.status)}</span>
        </div>
        <div class="viewer-scenario-run-meta">
          Latest: ${run.completed_jobs}/${run.total_jobs} ok · ${run.failed_jobs} failed
        </div>
        <button class="viewer-scenario-link-button" type="button" data-scenario-report="${escapeHtml(run.run_id)}">
          Load Report
        </button>
      </div>
    `;
  }

  function renderScenarioCard(item: ScenarioDesign): string {
    const enabled = item.enabled !== false;
    const runItems = (currentRun?.items ?? []).filter((runItem) => runItem.scenario_id === item.scenario_id);
    const roles = Object.entries(item.surface_role_counts ?? {})
      .map(([role, count]) => `${role} x${count}`)
      .join(", ");
    const disabledReason = item.excluded_reason_zh || "This scenario is excluded from the current default generation set.";
    return `
      <article class="viewer-scenario-card" data-enabled="${enabled ? "true" : "false"}">
        <div class="viewer-scenario-card-header">
          <div>
            <h3>${escapeHtml(item.title_zh || item.scenario_id)}</h3>
            <p>${escapeHtml(item.scenario_type)}</p>
          </div>
          <span>${enabled ? "Active" : "Excluded"} · ${item.region_count ?? 0}R / ${item.surface_annotation_count}S</span>
        </div>
        <div class="viewer-scenario-card-body">
          ${escapeHtml(item.intent_zh || item.query || "")}
        </div>
        <div class="viewer-scenario-card-badges">
          <span>${escapeHtml(roles || "surface ready")}</span>
          ${enabled ? "" : `<span class="viewer-scenario-disabled-pill">${escapeHtml(disabledReason)}</span>`}
        </div>
        <div class="viewer-scenario-actions">
          <button
            class="viewer-scenario-link-button"
            type="button"
            data-scenario-preview="${escapeHtml(item.preview_layout_path)}"
            ${enabled && item.preview_layout_exists !== false ? "" : "disabled"}
          >
            Preview Structure + Buildings / 预览结构+建筑
          </button>
        </div>
        ${runItems.length > 0 ? `<div class="viewer-scenario-result-list">${runItems.map(renderRunItem).join("")}</div>` : ""}
      </article>
    `;
  }

  function enabledScenarioItems(): ScenarioDesign[] {
    return (catalog?.items ?? []).filter((item) => item.enabled !== false);
  }

  function renderRunItem(item: ScenarioDesignRunItem): string {
    const canLoad = Boolean(item.scene_layout_path);
    return `
      <div class="viewer-scenario-result-row" data-status="${escapeHtml(item.status)}">
        <div>
          <strong>Sample ${item.sample_index}</strong>
          <span>${escapeHtml(item.status)} · ${Math.round(Number(item.progress || 0))}%</span>
        </div>
        <button
          class="viewer-scenario-result-button"
          type="button"
          data-scenario-result="${escapeHtml(item.scene_layout_path || "")}"
          data-scenario-glb="${escapeHtml(item.scene_glb_path || "")}"
          ${canLoad ? "" : "disabled"}
        >
          Load Result
        </button>
      </div>
      ${item.error ? `<div class="viewer-scenario-error">${escapeHtml(item.error)}</div>` : ""}
    `;
  }

  function destroy(): void {
    destroyed = true;
    if (pollTimer) {
      window.clearTimeout(pollTimer);
    }
  }

  return {
    loadCatalog,
    destroy,
  };
}

function formatBackendError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Request failed.");
  if (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network")) {
    return `Scenario Designs backend is unavailable at ${describeApiRequest("/api/scenario-designs")}.`;
  }
  return message || "Scenario Designs backend request failed.";
}
