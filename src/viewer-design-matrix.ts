import {
  apiJson,
  clearManifestCacheWithReason,
  clearRecentLayoutsCacheWithReason,
  loadRecentLayouts,
  postApiJson,
} from "./viewer-api";
import type { LoadManifestOptions } from "./viewer-api";
import type {
  DesignMatrixCell,
  DesignMatrixGeneratePayload,
  DesignMatrixInventoryPayload,
  DesignPreset,
  RecentLayout,
  ScenarioDesign,
  SceneJobStatusPayload,
} from "./viewer-types";
import { DEFAULT_GRAPH_TEMPLATE_ID } from "./viewer-types";
import { escapeHtml, sleep } from "./viewer-utils";

type DesignTone = "neutral" | "success" | "warning" | "error";

export type ViewerDesignMatrixController = {
  refresh: (options?: { quiet?: boolean }) => Promise<void>;
  scheduleRefresh: () => void;
};

export type ViewerDesignMatrixControllerDeps = {
  matrixEl: HTMLElement;
  designPromptEl: HTMLTextAreaElement;
  designTemplateEl: HTMLInputElement;
  getSelectedDesignPreset: () => DesignPreset | null;
  getSelectedScenarioDesign: () => ScenarioDesign | null;
  getLatestDraftScenario: () => ScenarioDesign | null;
  getDesignSemanticConfigPatch: () => Record<string, unknown>;
  getCurrentLayoutPath: () => string;
  loadLayoutSelection: (layoutPath: string, options?: LoadManifestOptions) => Promise<void>;
  populateRecentLayoutOptions: (layouts: RecentLayout[], selectedPath: string) => void;
  setStatus: (message: string) => void;
  setError: (element: HTMLElement, message: string) => void;
  flashStatus: (message: string, durationMs?: number) => void;
  updateDesignStatus: (message: string, tone?: DesignTone) => void;
  errorEl: HTMLElement;
};

const MATRIX_RECENT_LIMIT = 500;
const MATRIX_INVENTORY_TIMEOUT_MS = 10000;
const MATRIX_POLL_INTERVAL_MS = 1400;
const MATRIX_MAX_POLL_ATTEMPTS = 900;

export function createViewerDesignMatrixController(
  deps: ViewerDesignMatrixControllerDeps,
): ViewerDesignMatrixController {
  let inventory: DesignMatrixInventoryPayload | null = null;
  let refreshTimer = 0;
  let inventoryRequestId = 0;
  let inventoryAbortController: AbortController | null = null;
  let activeGeneratingCellKey = "";

  deps.matrixEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const refreshButton = target?.closest<HTMLButtonElement>("[data-matrix-refresh]");
    if (refreshButton) {
      void generateCell(refreshButton.dataset.structureKey || "", refreshButton.dataset.furnitureKey || "", true);
      return;
    }
    const cellButton = target?.closest<HTMLButtonElement>("[data-matrix-cell]");
    if (!cellButton) {
      return;
    }
    const structureKey = cellButton.dataset.structureKey || "";
    const furnitureKey = cellButton.dataset.furnitureKey || "";
    const cell = cellForKeys(structureKey, furnitureKey);
    if (!cell) {
      return;
    }
    if (cell.status === "ready" && cell.layout_path) {
      void loadCell(cell);
      return;
    }
    if (cell.status === "missing" || cell.status === "failed") {
      void generateCell(structureKey, furnitureKey, false);
      return;
    }
    deps.flashStatus(cell.reason || "This matrix cell is not available yet.");
  });

  function scheduleRefresh(): void {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }
    refreshTimer = window.setTimeout(() => {
      void refresh({ quiet: Boolean(inventory) });
    }, 350);
  }

  async function refresh(options: { quiet?: boolean } = {}): Promise<void> {
    if (!options.quiet) {
      deps.matrixEl.dataset.state = "loading";
      deps.matrixEl.innerHTML = `<div class="viewer-design-matrix-empty">Loading matrix status...</div>`;
    }
    inventoryAbortController?.abort();
    const requestId = inventoryRequestId + 1;
    inventoryRequestId = requestId;
    const abortController = new AbortController();
    inventoryAbortController = abortController;
    let didTimeout = false;
    const timeoutHandle = window.setTimeout(() => {
      didTimeout = true;
      abortController.abort();
    }, MATRIX_INVENTORY_TIMEOUT_MS);
    try {
      const payload = await apiJson<DesignMatrixInventoryPayload>("/api/design/matrix/inventory", {
        method: "POST",
        body: JSON.stringify(buildMatrixRequest()),
        signal: abortController.signal,
      });
      if (requestId !== inventoryRequestId) {
        return;
      }
      inventory = payload;
      render();
    } catch (error) {
      if (requestId !== inventoryRequestId) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load design matrix.";
      deps.matrixEl.dataset.state = "error";
      deps.matrixEl.innerHTML = `<div class="viewer-design-matrix-error">${escapeHtml(
        didTimeout ? "Matrix inventory timed out. Reopen Design or change an option to retry." : message,
      )}</div>`;
    } finally {
      window.clearTimeout(timeoutHandle);
      if (requestId === inventoryRequestId) {
        inventoryAbortController = null;
      }
    }
  }

  async function loadCell(cell: DesignMatrixCell): Promise<void> {
    const layoutPath = cell.layout_path || "";
    if (!layoutPath) {
      return;
    }
    deps.setStatus("Loading matrix preview...");
    await deps.loadLayoutSelection(layoutPath, matrixLoadOptions(cell));
    const recent = await loadRecentLayouts(50, false);
    deps.populateRecentLayoutOptions(recent, layoutPath);
    deps.flashStatus("Matrix preview loaded.");
  }

  async function generateCell(structureKey: string, furnitureKey: string, force: boolean): Promise<void> {
    if (activeGeneratingCellKey) {
      deps.flashStatus("A matrix cell is already generating.");
      return;
    }
    const cell = cellForKeys(structureKey, furnitureKey);
    if (!cell) {
      return;
    }
    if (cell.status === "disabled") {
      deps.flashStatus(cell.reason || "This matrix cell is disabled.");
      return;
    }
    activeGeneratingCellKey = cell.cell_key;
    render();
    deps.updateDesignStatus("Generating matrix cell...", "neutral");
    try {
      const payload = await postApiJson<DesignMatrixGeneratePayload>("/api/design/matrix/cells/generate", {
        ...buildMatrixRequest(),
        structure_key: structureKey,
        furniture_key: furnitureKey,
        force,
      });
      let layoutPath = payload.layout_path || payload.scene_layout_path || payload.cell?.layout_path || "";
      let sceneGlbPath = payload.scene_glb_path || payload.cell?.scene_glb_path || "";
      if (payload.mode === "job" && payload.job_id) {
        deps.updateDesignStatus(`Matrix job ${payload.job_id} submitted.`, "neutral");
        const result = await waitForMatrixJob(payload.job_id);
        layoutPath = result.result?.scene_layout_path || layoutPath;
        sceneGlbPath = result.result?.scene_glb_path || sceneGlbPath;
      }
      if (!layoutPath) {
        throw new Error("Matrix generation finished without a scene_layout_path.");
      }
      clearRecentLayoutsCacheWithReason("design-matrix-cell-generated");
      clearManifestCacheWithReason("design-matrix-cell-generated");
      await deps.loadLayoutSelection(layoutPath, matrixLoadOptions({ scene_glb_path: sceneGlbPath }));
      const recent = await loadRecentLayouts(50, false);
      deps.populateRecentLayoutOptions(recent, layoutPath);
      deps.updateDesignStatus("Matrix cell generated and loaded.", "success");
      deps.flashStatus("Matrix cell generated and loaded.");
      await refresh({ quiet: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Matrix generation failed.";
      deps.updateDesignStatus(message, "error");
      deps.setError(deps.errorEl, message);
    } finally {
      activeGeneratingCellKey = "";
      render();
    }
  }

  async function waitForMatrixJob(jobId: string): Promise<SceneJobStatusPayload> {
    for (let attempt = 0; attempt < MATRIX_MAX_POLL_ATTEMPTS; attempt += 1) {
      const payload = await apiJson<SceneJobStatusPayload>(`/api/scene/jobs/${encodeURIComponent(jobId)}`);
      const progress = Number(payload.progress ?? 0);
      const stage = String(payload.stage || payload.status || "running");
      deps.updateDesignStatus(`Matrix generation: ${stage} (${Math.round(progress)}%)`, "neutral");
      if (payload.status === "succeeded" && payload.result) {
        return payload;
      }
      if (payload.status === "failed") {
        throw new Error(payload.error || "Matrix generation job failed.");
      }
      await sleep(MATRIX_POLL_INTERVAL_MS);
    }
    throw new Error("Matrix generation timed out.");
  }

  function render(): void {
    if (!inventory) {
      deps.matrixEl.dataset.state = "empty";
      deps.matrixEl.innerHTML = `<div class="viewer-design-matrix-empty">Matrix status will appear here.</div>`;
      return;
    }
    const rows = inventory.rows || [];
    const columns = inventory.columns || [];
    const cells = new Map(inventory.cells.map((cell) => [`${cell.structure_key}::${cell.furniture_key}`, cell]));
    deps.matrixEl.dataset.state = "ready";
    deps.matrixEl.innerHTML = `
      <div class="viewer-design-matrix-scroll">
        <div class="viewer-design-matrix-grid" style="--matrix-columns:${columns.length}">
          <div class="viewer-design-matrix-corner">Structure / Furniture</div>
          ${columns.map((column) => `
            <div class="viewer-design-matrix-col" title="${escapeHtml(column.label)}">
              ${escapeHtml(shortLabel(column.label))}
            </div>
          `).join("")}
          ${rows.map((row) => `
            <div class="viewer-design-matrix-row" title="${escapeHtml(row.label)}">
              ${escapeHtml(shortLabel(row.label))}
            </div>
            ${columns.map((column) => renderCell(cells.get(`${row.key}::${column.key}`), row.label, column.label)).join("")}
          `).join("")}
        </div>
      </div>
      <div class="viewer-design-matrix-legend">
        <span data-status="ready">Ready</span>
        <span data-status="missing">Click to generate</span>
        <span data-status="disabled">Unavailable</span>
      </div>
    `;
  }

  function renderCell(cell: DesignMatrixCell | undefined, structureLabel: string, furnitureLabel: string): string {
    if (!cell) {
      return `<div class="viewer-design-matrix-cell" data-status="disabled">N/A</div>`;
    }
    const isGenerating = activeGeneratingCellKey === cell.cell_key;
    const status = isGenerating ? "running" : cell.status || "missing";
    const layoutPath = cell.layout_path || "";
    const title = [
      `${structureLabel} x ${furnitureLabel}`,
      status === "ready" ? "Ready: click to load." : "",
      status === "missing" ? "Missing: click to generate." : "",
      status === "disabled" ? (cell.reason || "Unavailable.") : "",
      layoutPath,
    ].filter(Boolean).join("\n");
    return `
      <div class="viewer-design-matrix-cell" data-status="${escapeHtml(status)}">
        <button
          class="viewer-design-matrix-cell-main"
          type="button"
          data-matrix-cell="${escapeHtml(cell.cell_key)}"
          data-structure-key="${escapeHtml(cell.structure_key)}"
          data-furniture-key="${escapeHtml(cell.furniture_key)}"
          ${status === "disabled" || status === "running" ? "disabled" : ""}
          title="${escapeHtml(title)}"
        >
          <span>${escapeHtml(cellLabel(status))}</span>
          <small>${escapeHtml(cellSubLabel(cell, status))}</small>
        </button>
        ${status === "ready" ? `
          <button
            class="viewer-design-matrix-cell-refresh"
            type="button"
            data-matrix-refresh="${escapeHtml(cell.cell_key)}"
            data-structure-key="${escapeHtml(cell.structure_key)}"
            data-furniture-key="${escapeHtml(cell.furniture_key)}"
            title="Regenerate this matrix cell"
          >Regen</button>
        ` : ""}
      </div>
    `;
  }

  function cellForKeys(structureKey: string, furnitureKey: string): DesignMatrixCell | null {
    return inventory?.cells.find((cell) => cell.structure_key === structureKey && cell.furniture_key === furnitureKey) ?? null;
  }

  function matrixLoadOptions(cell: Pick<DesignMatrixCell, "scene_glb_path">): LoadManifestOptions {
    const sceneGlbPath = String(cell.scene_glb_path || "").trim();
    return sceneGlbPath ? { sceneGlbPath, defaultSceneOptionKey: "final_scene" } : { defaultSceneOptionKey: "final_scene" };
  }

  function buildMatrixRequest(): Record<string, unknown> {
    const graphTemplateId = deps.designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
    return {
      graph_template_id: graphTemplateId,
      custom_structure: customStructurePayload(),
      custom_furniture: customFurniturePayload(),
      source_layout_path: deps.getCurrentLayoutPath(),
      recent_limit: MATRIX_RECENT_LIMIT,
    };
  }

  function customStructurePayload(): Record<string, unknown> | null {
    const draft = deps.getLatestDraftScenario();
    if (!draft || draft.enabled === false) {
      return null;
    }
    return {
      scenario_id: draft.scenario_id,
      title_zh: draft.title_zh,
      scenario_type: draft.scenario_type,
      query: draft.query,
      intent_zh: draft.intent_zh,
      preview_layout_path: draft.preview_layout_path,
      compose_config_patch: draft.compose_config_patch ?? {},
      template_patch: draft.template_patch ?? null,
      enabled: true,
    };
  }

  function customFurniturePayload(): Record<string, unknown> | null {
    const prompt = deps.designPromptEl.value.trim();
    const semanticPatch = deps.getDesignSemanticConfigPatch();
    const preset = deps.getSelectedDesignPreset();
    const hasSemanticPatch = Object.keys(semanticPatch).length > 0;
    if (!prompt && preset && !hasSemanticPatch) {
      return null;
    }
    return {
      label: prompt ? `Custom · ${prompt.slice(0, 24)}` : "Custom / LLM-Driven",
      prompt,
      compose_config_patch: semanticPatch,
      selected_preset_id: preset?.id ?? "custom",
    };
  }

  render();

  return {
    refresh,
    scheduleRefresh,
  };
}

function shortLabel(label: string): string {
  const primary = label.split("/")[0]?.trim() || label;
  return primary.length > 18 ? `${primary.slice(0, 17)}...` : primary;
}

function cellLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "running") return "Run";
  if (status === "disabled") return "N/A";
  if (status === "failed") return "Retry";
  return "Gen";
}

function cellSubLabel(cell: DesignMatrixCell, status: string): string {
  if (status === "ready") {
    return cell.updated_at ? "latest" : "load";
  }
  if (status === "running") return "working";
  if (status === "disabled") return "disabled";
  if (status === "failed") return "failed";
  return "missing";
}
