import * as THREE from "three";

import { escapeHtml } from "./viewer-utils";
import type { ViewerManifest } from "./viewer-types";
import type { WorkflowController } from "./workflow-controller";
import {
  enforceVisualEvaluationAvailability,
  renderEvaluationResultHtml,
  renderEvaluationViewsPreview,
  requestUnifiedEvaluation,
} from "./viewer-evaluation";
import type { EvaluationConfig, RenderedEvaluationView } from "./viewer-evaluation";
import { captureEvaluationViews } from "./viewer-evaluation-capture";

export type ViewerEvaluationRunner = {
  run: () => Promise<void>;
};

export type ViewerEvaluationRunnerDeps = {
  contentEl: HTMLElement;
  runButtonEl: HTMLButtonElement;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  cameraForwardHorizontal: () => THREE.Vector3;
  avatarEyeHeightM: number;
  getCurrentRoot: () => THREE.Object3D | null;
  getCurrentSpawn: () => THREE.Vector3;
  getCurrentForward: () => THREE.Vector3;
  getCurrentLayoutPath: () => string;
  getCurrentManifest: () => ViewerManifest | null;
  getSelectedPresetId: () => string;
  getEvaluationConfig: () => EvaluationConfig | null;
  workflow: WorkflowController;
  setStatus: (message: string) => void;
  flashStatus: (message: string) => void;
};

export function createViewerEvaluationRunner(deps: ViewerEvaluationRunnerDeps): ViewerEvaluationRunner {
  async function run(): Promise<void> {
    const evaluationConfig = deps.getEvaluationConfig();
    if (!evaluationConfig) {
      deps.setStatus("Evaluation parameters are invalid.");
      return;
    }
    const currentLayoutPath = deps.getCurrentLayoutPath();
    if (!currentLayoutPath) {
      deps.contentEl.innerHTML = `<div class="viewer-evaluate-empty">No layout loaded.</div>`;
      return;
    }
    const transition = deps.workflow.transition("evaluate");
    if (!transition.ok) {
      deps.contentEl.innerHTML = `<div class="viewer-evaluate-error">${escapeHtml(transition.reason)}</div>`;
      return;
    }
    const requestToken = deps.workflow.beginRequest("evaluate");
    const runStart = performance.now();
    deps.contentEl.innerHTML = `<div class="viewer-evaluate-loading">Capturing evaluation views...</div>`;
    deps.runButtonEl.disabled = true;

    try {
      deps.setStatus("Capturing evaluation views...");
      let renderedViews: RenderedEvaluationView[] = [];
      try {
        const captureStart = performance.now();
        renderedViews = await captureEvaluationViews({
          scene: deps.scene,
          renderer: deps.renderer,
          cameraForwardHorizontal: deps.cameraForwardHorizontal,
          currentRoot: deps.getCurrentRoot(),
          currentSpawn: deps.getCurrentSpawn(),
          currentForward: deps.getCurrentForward(),
          avatarEyeHeightM: deps.avatarEyeHeightM,
        });
        console.info(`[viewer-timing] evaluation.capture: ${renderedViews.length} views (${(performance.now() - captureStart).toFixed(1)} ms)`);
      } catch (captureError) {
        console.warn("Visual evaluation screenshots failed:", captureError);
        renderedViews = [];
      }

      const coreEvaluationViews = renderedViews.filter((view) => view.view_id !== "child_forward");
      if (coreEvaluationViews.length >= 3) {
        deps.contentEl.innerHTML = `
          <div class="viewer-evaluate-loading">Running visual evaluation from ${renderedViews.length} rendered views...</div>
          ${renderEvaluationViewsPreview(renderedViews)}
        `;
        deps.setStatus("Running visual evaluation from captured views...");
      } else {
        deps.contentEl.innerHTML = `
          <div class="viewer-evaluate-loading">Visual capture unavailable. Requesting walkability with Safety/Beauty as N/A...</div>
          ${renderEvaluationViewsPreview(renderedViews)}
        `;
        deps.setStatus("Visual evaluation unavailable; requesting walkability only.");
      }

      const requestStart = performance.now();
      const manifestSummary = (deps.getCurrentManifest()?.summary || {}) as Record<string, unknown>;
      const result = await requestUnifiedEvaluation(currentLayoutPath, renderedViews, {
        presetId: String(manifestSummary.preset_id || manifestSummary.benchmark_preset_id || deps.getSelectedPresetId() || "custom"),
        persistToBenchmark: true,
        evaluationProfile: "auto",
        evaluationConfig,
        signal: requestToken.signal,
      });
      if (!requestToken.isCurrent()) return;
      console.info(`[viewer-timing] evaluation.request: ${(performance.now() - requestStart).toFixed(1)} ms`);
      const evalResult = enforceVisualEvaluationAvailability(result);
      deps.contentEl.innerHTML = renderEvaluationResultHtml(evalResult, renderedViews);
      deps.workflow.setEvaluation(evalResult);
      deps.workflow.endRequest(requestToken);
      deps.flashStatus(
        coreEvaluationViews.length >= 3
          ? "Visual evaluation complete."
          : "Walkability complete; visual scores unavailable.",
      );
    } catch (err) {
      if (!deps.workflow.endRequest(requestToken, err)) return;
      const message = err instanceof Error ? err.message : "Evaluation request failed.";
      deps.contentEl.innerHTML = `<div class="viewer-evaluate-error">${escapeHtml(message)}</div>`;
      deps.setStatus(`Evaluation failed: ${message}`);
    } finally {
      deps.runButtonEl.disabled = Boolean(deps.workflow.getSnapshot().busy.evaluate);
      console.info(`[viewer-timing] evaluation.total: ${(performance.now() - runStart).toFixed(1)} ms`);
    }
  }

  return { run };
}
