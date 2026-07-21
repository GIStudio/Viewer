import type { SceneJobOperation, SceneJobStatusPayload } from "./viewer-types";
import type { WorkflowController, WorkflowRequestToken } from "./workflow-controller";
import { cancelSceneJob, loadSceneJob, submitWorkflowSceneJob } from "./workflow-api";
import type { ProfessionalSessionController } from "./professional-session";
import { saveProfessionalSourceToWorkspace } from "./professional-workspace-sync";
import { openProfessionalOwnedRevision } from "./professional-public-project";
import type { SceneRevision } from "./course-api";

const BASELINE_POLL_MS = 650;
const BASELINE_MAX_POLLS = 720;

export type ProfessionalBaselineCoordinator = {
  start(): Promise<void>;
  retry(): Promise<void>;
  cancel(): Promise<void>;
  dispose(): void;
};

function operations(payload: SceneJobStatusPayload): SceneJobOperation[] {
  return (payload.operations ?? []).slice(-50).map((operation) => ({ ...operation }));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

export function createProfessionalBaselineCoordinator(
  workflow: WorkflowController,
  session?: ProfessionalSessionController,
): ProfessionalBaselineCoordinator {
  let disposed = false;
  let activeSourceRevision: number | null = null;
  let activeJobId: string | null = null;
  let activeToken: WorkflowRequestToken | null = null;

  const finishToken = (error?: unknown): void => {
    if (!activeToken) return;
    workflow.endRequest(activeToken, error);
    activeToken = null;
  };

  const cancelRemote = async (jobId: string | null): Promise<void> => {
    if (!jobId) return;
    await cancelSceneJob(jobId).catch(() => undefined);
  };

  const unsubscribe = workflow.subscribe(() => {
    if (activeSourceRevision === null) return;
    const snapshot = workflow.getSnapshot();
    if (snapshot.sourceRevision === activeSourceRevision) return;
    const staleJobId = activeJobId;
    finishToken();
    activeSourceRevision = null;
    activeJobId = null;
    void cancelRemote(staleJobId);
  });

  async function poll(
    sourceRevision: number,
    token: WorkflowRequestToken,
    initial: SceneJobStatusPayload,
    projectContext: { projectId: string; sourceId: string } | null,
  ): Promise<void> {
    let payload = initial;
    try {
      for (let attempt = 0; attempt < BASELINE_MAX_POLLS; attempt += 1) {
        if (disposed || !token.isCurrent() || workflow.getSnapshot().sourceRevision !== sourceRevision) return;
        const status = payload.status === "processing" ? "running" : payload.status;
        workflow.updateBaselineRun(sourceRevision, {
          jobId: payload.job_id,
          status: status === "queued" || status === "running" ? status : status === "succeeded" ? "succeeded" : status === "cancelled" ? "cancelled" : "failed",
          stage: payload.stage ?? status,
          progress: Math.max(0, Math.min(100, Number(payload.progress ?? 0))),
          message: payload.operations?.[Math.max(0, (payload.operations?.length ?? 1) - 1)]?.message
            ?? (status === "queued" ? "Road baseline is queued." : "Generating the road baseline…"),
          operations: operations(payload),
          ...(payload.error ? { error: payload.error } : {}),
        });
        if (status === "succeeded") {
          const layoutPath = payload.result?.scene_layout_path ?? payload.result?.layout_path ?? "";
          if (!layoutPath) throw new Error("Road baseline completed without a scene layout path.");
          if (workflow.getSnapshot().sourceRevision !== sourceRevision) return;
          if (session && projectContext) {
            const adopted = await session.api.post<SceneRevision>(
              `/api/v1/projects/${projectContext.projectId}/adopt-scene-job`,
              { job_id: payload.job_id, source_id: projectContext.sourceId },
            );
            await openProfessionalOwnedRevision(session, workflow, projectContext.projectId, adopted, { sourceRevision });
            await session.refreshPublicProjects().catch(() => []);
          } else {
            workflow.setGeneratedScene({
              layoutPath,
              contextMassing: {
                baseline_kind: "approved_road_skeleton",
                building_representation: "transparent_massing",
                source_revision: sourceRevision,
              },
            });
          }
          workflow.updateBaselineRun(sourceRevision, {
            status: "succeeded",
            stage: payload.stage ?? "completed",
            progress: 100,
            message: "Road baseline generated and loaded for review.",
            operations: operations(payload),
          });
          finishToken();
          activeSourceRevision = null;
          activeJobId = null;
          return;
        }
        if (status === "failed") throw new Error(payload.error || "Road baseline generation failed.");
        if (status === "cancelled") {
          finishToken();
          activeSourceRevision = null;
          activeJobId = null;
          return;
        }
        await sleep(BASELINE_POLL_MS, token.signal);
        payload = await loadSceneJob(payload.job_id, token.signal);
      }
      throw new Error("Road baseline generation timed out.");
    } catch (error) {
      if (disposed || token.signal.aborted || workflow.getSnapshot().sourceRevision !== sourceRevision) return;
      const message = error instanceof Error ? error.message : String(error);
      workflow.updateBaselineRun(sourceRevision, {
        status: "failed",
        stage: payload.stage ?? "failed",
        message,
        error: message,
        operations: operations(payload),
      });
      finishToken();
      activeSourceRevision = null;
      activeJobId = null;
    }
  }

  async function start(): Promise<void> {
    const snapshot = workflow.getSnapshot();
    const sourceRevision = snapshot.sourceRevision;
    if (!snapshot.normalized || snapshot.approvedSourceRevision !== sourceRevision) {
      throw new Error("Approve the current ReferenceAnnotation before creating the road baseline.");
    }
    if (
      snapshot.baselineRun.sourceRevision === sourceRevision
      && (snapshot.baselineRun.status === "queued" || snapshot.baselineRun.status === "running" || snapshot.baselineRun.status === "succeeded")
    ) return;

    finishToken();
    const token = workflow.beginRequest("generate");
    activeToken = token;
    activeSourceRevision = sourceRevision;
    activeJobId = null;
    workflow.setBaselineRun({
      sourceRevision,
      jobId: null,
      status: "queued",
      stage: "submitting",
      progress: 0,
      message: "Submitting the deterministic road baseline…",
      operations: [],
    });
    try {
      let projectContext: { projectId: string; sourceId: string } | null = null;
      if (session) {
        await session.ensureReady();
        const saved = await saveProfessionalSourceToWorkspace(session, workflow);
        projectContext = { projectId: saved.project.id, sourceId: saved.source.id };
      }
      const created = await submitWorkflowSceneJob({
        normalized: snapshot.normalized,
        prompt: "Generate the approved road geometry as an editable baseline with transparent building massing and no street furniture.",
        presetId: "approved_road_skeleton_baseline",
        randomSeed: 42,
        configPatch: {
          street_furniture_profile: "none",
          amenity_coverage_mode: "off",
          curated_street_assets_profile: "disabled",
          building_representation: "transparent_massing",
        },
        generationOptions: {
          skip_llm: true,
          build_production_artifacts: true,
          render_presentation_artifacts: false,
          capture_3d_views: false,
        },
        signal: token.signal,
      });
      if (!token.isCurrent() || workflow.getSnapshot().sourceRevision !== sourceRevision) {
        await cancelRemote(created.job_id);
        return;
      }
      activeJobId = created.job_id;
      workflow.updateBaselineRun(sourceRevision, {
        jobId: created.job_id,
        status: created.status === "running" ? "running" : "queued",
        stage: "queued",
        message: "Road baseline job created.",
      });
      void poll(
        sourceRevision,
        token,
        { job_id: created.job_id, status: created.status === "running" ? "running" : "queued" },
        projectContext,
      );
    } catch (error) {
      if (token.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      workflow.updateBaselineRun(sourceRevision, { status: "failed", stage: "submit_failed", message, error: message });
      finishToken();
      activeSourceRevision = null;
    }
  }

  return {
    start,
    retry: start,
    async cancel() {
      const snapshot = workflow.getSnapshot();
      if (activeToken) finishToken();
      const jobId = activeJobId ?? snapshot.baselineRun.jobId;
      activeSourceRevision = null;
      activeJobId = null;
      workflow.updateBaselineRun(snapshot.sourceRevision, {
        status: "cancelled",
        stage: "cancelled",
        message: "Road baseline generation cancelled.",
      });
      await cancelRemote(jobId);
    },
    dispose() {
      disposed = true;
      unsubscribe();
      finishToken();
    },
  };
}
