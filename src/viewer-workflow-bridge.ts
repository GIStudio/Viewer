import { sleep } from "./viewer-api";
import type { ViewerManifest } from "./viewer-types";
import { loadSceneJob, submitWorkflowSceneJob } from "./workflow-api";
import type { WorkflowController } from "./workflow-controller";

export type ViewerWorkflowBridge = {
  runGeneration(): Promise<void>;
  syncGeneratedLayout(): Promise<void>;
  dispose(): void;
};

export type ViewerWorkflowBridgeDeps = {
  workflow: WorkflowController;
  getPrompt: () => string;
  getPresetId: () => string;
  getCurrentLayoutPath: () => string;
  getCurrentManifest: () => ViewerManifest | null;
  shouldSyncGeneratedLayout?: () => boolean;
  loadLayoutSelection: (layoutPath: string) => Promise<void>;
  setStatus: (message: string) => void;
  flashStatus: (message: string) => void;
};

export function createViewerWorkflowBridge(deps: ViewerWorkflowBridgeDeps): ViewerWorkflowBridge {
  let disposed = false;
  let loadingLayoutPath = "";

  async function syncGeneratedLayout(): Promise<void> {
    const layoutPath = deps.workflow.getSnapshot().sceneLayoutPath;
    if (
      disposed
      || deps.shouldSyncGeneratedLayout?.() === false
      || !layoutPath
      || loadingLayoutPath === layoutPath
      || deps.getCurrentLayoutPath() === layoutPath
    ) {
      return;
    }
    loadingLayoutPath = layoutPath;
    deps.setStatus("Loading generated workflow scene…");
    try {
      await deps.loadLayoutSelection(layoutPath);
      if (disposed) return;
      const manifest = deps.getCurrentManifest();
      if (manifest?.layout_revision) {
        deps.workflow.setSceneRevision({
          revision: manifest.layout_revision.revision,
          sha256: manifest.layout_revision.sha256,
          layout_path: manifest.layout_path,
        });
      }
      deps.flashStatus("Generated workflow scene loaded. Placement furniture edits are persistent.");
    } catch (error) {
      if (!disposed) deps.workflow.reportError(error);
    } finally {
      if (loadingLayoutPath === layoutPath) loadingLayoutPath = "";
    }
  }

  async function runGeneration(): Promise<void> {
    const snapshot = deps.workflow.getSnapshot();
    if (!snapshot.normalized) {
      deps.workflow.transition("review");
      return;
    }
    if (snapshot.approvedSourceRevision !== snapshot.sourceRevision) {
      deps.workflow.transition("review");
      deps.workflow.reportError("Approve the reviewed source before generation.");
      deps.setStatus("Approve the reviewed source before generation.");
      return;
    }
    const assetPreparationReady = snapshot.assetPreparation?.mode === "default_transparent_massing"
      || (snapshot.assetPreparation?.mode === "candidate_manifests"
        && snapshot.assetPreparation.manifests.some((manifest) => manifest.readyCount > 0));
    if (!assetPreparationReady) {
      deps.workflow.reportError("Choose a 3D asset preparation strategy before generation.");
      deps.setStatus("Choose a 3D asset preparation strategy before generation.");
      return;
    }
    const normalized = deps.workflow.getSnapshot().normalized;
    if (!normalized || !deps.workflow.setGenerationStarted().ok) return;

    const token = deps.workflow.beginRequest("generate");
    deps.setStatus("Submitting approved annotation generation…");
    try {
      const created = await submitWorkflowSceneJob({
        normalized,
        prompt: deps.getPrompt(),
        presetId: deps.getPresetId(),
        configPatch: {
          asset_curation_mode: "scene_ready_first",
          building_representation: snapshot.assetPreparation?.mode === "default_transparent_massing"
            ? "transparent_massing"
            : "asset",
        },
        generationOptions: snapshot.assetPreparation?.mode === "candidate_manifests"
          ? {
              candidate_asset_manifests: snapshot.assetPreparation.manifests.map((manifest) => ({
                name: manifest.name,
                expected_fingerprint: manifest.fingerprint,
              })),
            }
          : {},
        signal: token.signal,
      });
      for (let attempt = 0; attempt < 360; attempt += 1) {
        if (!token.isCurrent() || disposed) return;
        const payload = await loadSceneJob(created.job_id, token.signal);
        deps.setStatus(`Generation ${payload.stage || payload.status}…`);
        if (payload.status === "succeeded" && payload.result?.scene_layout_path) {
          deps.workflow.setGeneratedScene({
            layoutPath: payload.result.scene_layout_path,
            contextMassing: {
              aligned_building_count: normalized.sourceContext.aligned_buildings?.length ?? 0,
              source_alignment: normalized.sourceContext.source_alignment ?? null,
            },
          });
          deps.workflow.endRequest(token);
          await syncGeneratedLayout();
          return;
        }
        if (payload.status === "failed") throw new Error(payload.error || "Scene generation failed.");
        await sleep(1000);
      }
      throw new Error("Scene generation timed out.");
    } catch (error) {
      deps.workflow.endRequest(token, error);
      deps.setStatus(error instanceof Error ? error.message : "Scene generation failed.");
    }
  }

  const unsubscribe = deps.workflow.subscribe(() => {
    if (deps.workflow.getSnapshot().sceneLayoutPath) void syncGeneratedLayout();
  });

  return {
    runGeneration,
    syncGeneratedLayout,
    dispose(): void {
      disposed = true;
      unsubscribe();
    },
  };
}
