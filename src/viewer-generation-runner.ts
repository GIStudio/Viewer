import { apiJson, sleep } from "./viewer-api";
import {
  cancelGenerationJob,
  generationVariants,
  submitGenerationJob,
  type GenerationRequestSpec,
} from "./viewer-generation-spec";
import type { SceneJobResult, SceneJobStatusPayload } from "./viewer-types";
import { escapeHtml } from "./viewer-utils";

export type ViewerGenerationRunner = {
  run(spec: GenerationRequestSpec): Promise<void>;
  cancel(): Promise<void>;
  retry(): Promise<void>;
  reloadResult(): Promise<void>;
  isRunning(): boolean;
  dispose(): void;
};

type GenerationSchemeResult = {
  id: string;
  name: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  result?: SceneJobResult;
  error?: string;
};

function explainGenerationFailure(message: string): string {
  const raw = String(message || "场景生成失败。")
    .replace(/^LLM parameter derivation failed:\s*/i, "")
    .trim();
  const junctionQa = raw.match(
    /Junction surface QA failed for ([^:]+): overlap=([0-9.e+-]+)m2, uncovered=([0-9.e+-]+)m2, invalid=(\d+), slivers=(\d+)/i,
  );
  if (junctionQa) {
    const [, junctionId, overlap, uncovered, invalid, slivers] = junctionQa;
    return `路口 ${junctionId} 的表面几何检查未通过：共面重叠 ${overlap}㎡，未覆盖 ${uncovered}㎡，无效面 ${invalid}，碎片 ${slivers}。`;
  }
  return raw || "场景生成失败。";
}

type ViewerGenerationRunnerDeps = {
  resultEl: HTMLElement;
  statusEl: HTMLElement;
  cancelEl: HTMLButtonElement;
  retryEl: HTMLButtonElement;
  reloadEl: HTMLButtonElement;
  onRunningChange(running: boolean): void;
  onActivateOutput(): void;
  onLoadResult(result: SceneJobResult, allResults: readonly GenerationSchemeResult[]): Promise<void>;
  onLoaded(): void;
  setStatus(message: string): void;
};

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 900;
const STAGE_PROGRESS: Readonly<Record<string, number>> = {
  queued: 5,
  context_resolving: 15,
  asset_loading: 25,
  graph_parsing: 30,
  layout_generation: 40,
  constraint_solving: 50,
  asset_composition: 65,
  mesh_generation: 75,
  glb_export: 88,
  scene_rendering: 95,
  finalizing: 96,
  evaluation: 99,
  succeeded: 100,
};

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function estimateProgress(payload: SceneJobStatusPayload): number {
  if (payload.status === "succeeded") return 100;
  const stage = String(payload.stage || payload.status || "running").trim();
  const stageProgress = STAGE_PROGRESS[stage] ?? 50;
  let progress = Number(payload.progress ?? stageProgress);
  if (!Number.isFinite(progress) || progress < stageProgress) {
    progress = stageProgress;
  }
  const operations = payload.operations ?? [];
  const currentOp = operations[operations.length - 1];
  if (
    currentOp
    && typeof currentOp === "object"
    && typeof currentOp.progress === "number"
    && Number.isFinite(currentOp.progress)
    && currentOp.progress > progress
  ) {
    progress = currentOp.progress;
  }
  return clampProgress(progress);
}

export function createViewerGenerationRunner(deps: ViewerGenerationRunnerDeps): ViewerGenerationRunner {
  let abortController: AbortController | null = null;
  let activeJobId = "";
  let lastSpec: GenerationRequestSpec | null = null;
  let lastPrimaryResult: SceneJobResult | null = null;
  let lastResults: GenerationSchemeResult[] = [];
  let running = false;
  let disposed = false;

  deps.cancelEl.addEventListener("click", () => void cancel());
  deps.retryEl.addEventListener("click", () => void retry());
  deps.reloadEl.addEventListener("click", () => void reloadResult());

  async function run(spec: GenerationRequestSpec): Promise<void> {
    if (running || disposed) return;
    lastSpec = structuredClone(spec);
    lastPrimaryResult = null;
    lastResults = generationVariants(spec).map((variant) => ({
      id: variant.id,
      name: variant.name,
      status: "queued",
    }));
    abortController = new AbortController();
    running = true;
    deps.onRunningChange(true);
    deps.onActivateOutput();
    deps.cancelEl.hidden = false;
    deps.retryEl.hidden = true;
    deps.reloadEl.hidden = true;
    renderOverview(0, "正在冻结生成配置并提交任务。", null);
    deps.statusEl.textContent = "Submitting generation job…";
    deps.setStatus("Submitting generation job…");

    const variants = generationVariants(spec);
    for (let index = 0; index < variants.length; index += 1) {
      if (abortController.signal.aborted || disposed) break;
      const variant = variants[index]!;
      const row = lastResults[index]!;
      row.status = "running";
      try {
        const created = await submitGenerationJob(spec, variant, abortController.signal);
        activeJobId = created.job_id;
        const payload = await waitForJob(created.job_id, index, variants.length, abortController.signal);
        if (payload.status === "cancelled") {
          row.status = "cancelled";
          break;
        }
        const sceneLayoutPath = payload.result?.scene_layout_path || payload.result?.layout_path || "";
        if (!sceneLayoutPath) throw new Error("Generation finished without a scene layout path.");
        row.status = "succeeded";
        row.result = payload.result;
      } catch (error) {
        if (abortController.signal.aborted) {
          row.status = "cancelled";
          break;
        }
        row.status = "failed";
        row.error = explainGenerationFailure(error instanceof Error ? error.message : "场景生成失败。");
      } finally {
        activeJobId = "";
      }
    }

    running = false;
    deps.onRunningChange(false);
    deps.cancelEl.hidden = true;
    if (abortController.signal.aborted) {
      deps.retryEl.hidden = false;
      deps.statusEl.textContent = "Generation cancelled. The cancelled result will not replace the current scene.";
      renderOverview(progressForRows(), "生成已取消。", null);
      return;
    }

    const successful = lastResults.filter((row) => row.status === "succeeded" && row.result);
    if (!successful.length) {
      deps.retryEl.hidden = false;
      deps.statusEl.textContent = "场景生成失败。请查看具体诊断后重试。";
      renderOverview(
        progressForRows(),
        lastResults.length === 1
          ? "场景生成失败，请查看下方诊断。"
          : "全部方案生成失败，请查看各方案诊断。",
        null,
      );
      return;
    }

    lastPrimaryResult = successful[0]!.result!;
    renderOverview(100, successful.length === lastResults.length ? "生成完成，正在载入主方案。" : "部分方案失败，正在载入首个成功方案。", null);
    await loadPrimaryResult();
  }

  async function waitForJob(jobId: string, schemeIndex: number, schemeCount: number, signal: AbortSignal): Promise<SceneJobStatusPayload> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const payload = await apiJson<SceneJobStatusPayload>(`/api/scene/jobs/${encodeURIComponent(jobId)}`, { signal });
      const jobProgress = estimateProgress(payload);
      const overall = ((schemeIndex + jobProgress / 100) / schemeCount) * 100;
      const latestOperation = payload.operations?.[Math.max(0, (payload.operations?.length ?? 1) - 1)];
      const message = latestOperation?.message || payload.stage || payload.status;
      renderOverview(overall, `${lastResults[schemeIndex]!.name} · ${message}`, payload);
      deps.statusEl.textContent = `${lastResults[schemeIndex]!.name}: ${message}`;
      deps.setStatus(`Generation ${Math.round(overall)}% · ${message}`);
      if (payload.status === "succeeded" || payload.status === "failed" || payload.status === "cancelled") {
        if (payload.status === "failed") throw new Error(payload.error || "Generation job failed.");
        return payload;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error("Generation timed out.");
  }

  async function cancel(): Promise<void> {
    if (!running || !abortController) return;
    const jobId = activeJobId;
    abortController.abort();
    if (jobId) {
      try {
        await cancelGenerationJob(jobId);
      } catch {
        // The local abort still prevents a late response from replacing the scene.
      }
    }
  }

  async function retry(): Promise<void> {
    if (!lastSpec || running) return;
    await run(lastSpec);
  }

  async function reloadResult(): Promise<void> {
    if (!lastPrimaryResult || running) return;
    deps.reloadEl.disabled = true;
    await loadPrimaryResult();
    deps.reloadEl.disabled = false;
  }

  async function loadPrimaryResult(): Promise<void> {
    if (!lastPrimaryResult) return;
    try {
      await deps.onLoadResult(lastPrimaryResult, lastResults);
      deps.reloadEl.hidden = true;
      deps.retryEl.hidden = true;
      deps.statusEl.textContent = "Generated scene loaded. Entering result review…";
      deps.onLoaded();
    } catch (error) {
      deps.reloadEl.hidden = false;
      deps.statusEl.textContent = error instanceof Error ? error.message : "Scene generated, but loading failed.";
      renderOverview(100, "场景已经生成，但载入失败；可安全重试载入。", null);
    }
  }

  function progressForRows(): number {
    if (!lastResults.length) return 0;
    const done = lastResults.filter((row) => ["succeeded", "failed", "cancelled"].includes(row.status)).length;
    return (done / lastResults.length) * 100;
  }

  function renderOverview(progress: number, message: string, payload: SceneJobStatusPayload | null): void {
    const operations = payload?.operations?.slice(-3) ?? [];
    deps.resultEl.innerHTML = `
      <section class="viewer-generation-run-board" data-status="${escapeHtml(payload?.status || (running ? "running" : "idle"))}">
        <header><div><small>GENERATION RUN</small><strong>${escapeHtml(message)}</strong></div><b>${Math.round(progress)}%</b></header>
        <div class="viewer-generation-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div>
        <div class="viewer-generation-scheme-ledger">
          ${lastResults.map((row) => `<div data-status="${row.status}"><span>${escapeHtml(row.id)}</span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.error || row.status)}</small></div>`).join("")}
        </div>
        ${operations.length ? `<ol class="viewer-generation-operation-list">${operations.map((operation) => `<li><span>${Math.round(Number(operation.progress ?? 0))}%</span><strong>${escapeHtml(operation.message || operation.stage || "working")}</strong></li>`).join("")}</ol>` : ""}
      </section>
    `;
  }

  return {
    run,
    cancel,
    retry,
    reloadResult,
    isRunning: () => running,
    dispose(): void {
      disposed = true;
      abortController?.abort();
    },
  };
}
