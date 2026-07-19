import { apiJson } from "./viewer-api";
import {
  toNormalizedSceneSource,
  type NormalizedSceneSourceResponse,
} from "./workflow-api";
import type { SceneRevision, WorkflowController } from "./workflow-controller";
import { saveProfessionalWorkflowDraft } from "./professional-draft-store";

export type StarterScenePackage = Readonly<{
  id: string;
  version: string;
  label: string;
  source_fingerprint: string;
  scene_fingerprint: string;
  retrieval_bbox: readonly [number, number, number, number];
  focus_xz: readonly [number, number];
  focus_extent_m: number;
  category_counts: Readonly<Record<string, number>>;
  normalized_source: NormalizedSceneSourceResponse;
  viewer_manifest_url: string;
}>;

export type MaterializedStarterScene = StarterScenePackage & Readonly<{
  layout_path: string;
  scene_revision?: SceneRevision | null;
}>;

export type ActiveSceneOrigin = "starter_demo" | "workflow" | "explicit_layout";

const LEGACY_STARTER_SCENE_IDS = Object.freeze([
  "guangzhou_road_skeleton_v1",
  "guangzhou_road_skeleton_v2",
  "guangzhou_complete_intersection_v3",
  "guangzhou_complete_intersection_v4",
  "guangzhou_complete_intersection_v5",
]);

export function legacyStarterSceneIdFromPath(value: string | null | undefined): string | null {
  const path = String(value || "");
  return LEGACY_STARTER_SCENE_IDS.find((sceneId) => path.includes(sceneId)) ?? null;
}

export async function loadDefaultStarterScene(signal?: AbortSignal): Promise<StarterScenePackage> {
  return apiJson<StarterScenePackage>("/api/starter-scenes/default", { signal });
}

export async function materializeStarterScene(
  workflow: WorkflowController,
  demoId: string,
  signal?: AbortSignal,
): Promise<MaterializedStarterScene> {
  const payload = await requestStarterSceneMaterialization(demoId, signal);
  await applyMaterializedStarterScene(workflow, payload);
  return payload;
}

export async function requestStarterSceneMaterialization(
  demoId: string,
  signal?: AbortSignal,
): Promise<MaterializedStarterScene> {
  return apiJson<MaterializedStarterScene>(
    `/api/starter-scenes/${encodeURIComponent(demoId)}/materialize`,
    { method: "POST", signal },
  );
}

export async function applyMaterializedStarterScene(
  workflow: WorkflowController,
  payload: MaterializedStarterScene,
): Promise<void> {
  const accepted = workflow.materializeStarterDemo({
    source: toNormalizedSceneSource(payload.normalized_source),
    sourceFingerprint: payload.source_fingerprint,
    layoutPath: payload.layout_path,
    sceneRevision: payload.scene_revision ?? null,
    demoId: payload.id,
  });
  if (!accepted) throw new Error(workflow.getSnapshot().lastError || "Unable to materialize the starter scene.");
  await saveProfessionalWorkflowDraft(workflow.getSnapshot());
}

export async function materializeDefaultStarterScene(
  workflow: WorkflowController,
  signal?: AbortSignal,
): Promise<MaterializedStarterScene> {
  const starter = await loadDefaultStarterScene(signal);
  return materializeStarterScene(workflow, starter.id, signal);
}
