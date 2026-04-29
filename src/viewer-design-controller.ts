import type {
  BranchRunStatusPayload,
  DesignPreset,
  DesignSchemeVariant,
  RecentLayout,
  SceneJobResult,
  SceneJobStatusPayload,
} from "./viewer-types";
import {
  DEFAULT_GRAPH_TEMPLATE_ID,
  DESIGN_MAX_POLL_ATTEMPTS,
  DESIGN_POLL_INTERVAL_MS,
  DESIGN_SCHEME_VARIANTS,
} from "./viewer-types";
import { apiJson, clearManifestCache, clearRecentLayoutsCache, loadRecentLayouts, postApiJson } from "./viewer-api";
import { describeDesignJobProgress, submitDesignJob } from "./viewer-design";
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
  error?: string;
};

type BranchRunCreatePayload = {
  run_id: string;
  status: string;
  created_at?: string;
};

export type ViewerDesignController = {
  runDesignGeneration: () => Promise<void>;
  runBranchGeneration: () => Promise<void>;
  isDesignGenerating: () => boolean;
  isBranchRunGenerating: () => boolean;
};

export type ViewerDesignControllerDeps = {
  designPromptEl: HTMLTextAreaElement;
  designTemplateEl: HTMLInputElement;
  designCountEl: HTMLSelectElement;
  designGenerateEl: HTMLButtonElement;
  designBranchRunEl: HTMLButtonElement;
  designReviewRunEl: HTMLButtonElement;
  designResultEl: HTMLElement;
  designWorkspaceEl: HTMLElement;
  minimapEl: HTMLElement;
  errorEl: HTMLElement;
  getSelectedDesignPreset: () => DesignPreset | null;
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

  async function waitForBranchRun(runId: string): Promise<BranchRunStatusPayload> {
    for (let attempt = 0; attempt < DESIGN_MAX_POLL_ATTEMPTS; attempt += 1) {
      const payload = await apiJson<BranchRunStatusPayload>(`/api/design/branch-runs/${encodeURIComponent(runId)}`);
      const progress = Math.round(clamp(Number(payload.progress ?? 0), 0, 100));
      deps.updateDesignStatus(`Branch run: ${payload.stage || payload.status} (${progress}%)`);
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
    deps.designBranchRunEl.disabled = true;
    deps.designGenerateEl.disabled = true;
    deps.setSelectedBranchNodeId(null);
    deps.updateDesignStatus("Submitting branch run...");
    deps.designResultEl.innerHTML = "";
    try {
      const created = await postApiJson<BranchRunCreatePayload>("/api/design/branch-runs", {
        prompt,
        topk: 3,
        rounds: 2,
        graph_template_id: graphTemplateId,
        knowledge_source: "graph_rag",
        scene_context: {
          layout_mode: "graph_template",
          graph_template_id: graphTemplateId,
        },
        generation_options: {},
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
        clearRecentLayoutsCache();
        clearManifestCache();
        await deps.loadLayoutSelection(best.scene_layout_path);
        const recent = await loadRecentLayouts(50, false);
        deps.populateRecentLayoutOptions(recent, best.scene_layout_path);
      }
      deps.updateDesignStatus("Branch run complete.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Branch run failed.";
      deps.updateDesignStatus(message, "error");
      deps.designResultEl.innerHTML = `<div class="viewer-design-error">${escapeHtml(message)}</div>`;
      deps.setError(deps.errorEl, message);
    } finally {
      branchRunIsGenerating = false;
      deps.designBranchRunEl.disabled = false;
      deps.designGenerateEl.disabled = false;
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
  ): Promise<SceneJobResult> {
    for (let attempt = 0; attempt < DESIGN_MAX_POLL_ATTEMPTS; attempt += 1) {
      const payload = await apiJson<SceneJobStatusPayload>(`/api/scene/jobs/${encodeURIComponent(jobId)}`);
      const { progress, message, stage } = describeDesignJobProgress(payload);
      deps.updateDesignStatus(`${message} (${progress}%)`);
      deps.renderDesignWorkspace(payload, preset, variant, prompt, graphTemplateId);

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
    const prompt = deps.designPromptEl.value.trim() || (preset?.prompt ?? "");
    const graphTemplateId = deps.designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
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
    deps.designWorkspaceEl.innerHTML = `
      <div class="viewer-design-workspace-shell">
        <header class="viewer-design-workspace-header">
          <div>
            <span class="viewer-design-workspace-kicker">${escapeHtml(presetLabel)} · ${escapeHtml(graphTemplateId)}</span>
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
        ${renderDesignImprovementSummary(preset, variants[0]!, prompt, graphTemplateId)}
      </div>
    `;
    deps.setStatus("Submitting design generation job...");

    try {
      for (const variant of variants) {
        deps.updateDesignStatus(`Submitting ${variant.name}...`);
        try {
          const createPayload = await submitDesignJob(preset, prompt, graphTemplateId, variant);
          deps.updateDesignStatus(`${variant.name}: job ${createPayload.job_id} submitted.`);
          const result = await waitForDesignJob(createPayload.job_id, preset, variant, prompt, graphTemplateId);
          if (!result.scene_layout_path) {
            throw new Error("Generation finished without a scene_layout_path.");
          }
          generatedSchemes.push({
            id: variant.id,
            name: variant.name,
            layoutPath: result.scene_layout_path,
            status: "ready",
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
      clearRecentLayoutsCache();
      clearManifestCache();
      await deps.loadLayoutSelection(firstReady.layoutPath);
      const recent = await loadRecentLayouts(50, false);
      deps.populateRecentLayoutOptions(recent, firstReady.layoutPath);
      renderGeneratedDesignSchemes(generatedSchemes);
      deps.updateDesignStatus(
        `${generatedSchemes.filter((scheme) => scheme.status === "ready").length}/${variants.length} schemes generated.`,
        "success",
      );
      deps.flashStatus(`${firstReady.name} loaded in Viewer.`);
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
    isDesignGenerating: () => designIsGenerating,
    isBranchRunGenerating: () => branchRunIsGenerating,
  };
}
