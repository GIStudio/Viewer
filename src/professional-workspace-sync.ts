import type { CourseProject, SceneSource } from "./course-api";
import type { ProfessionalSessionController } from "./professional-session";
import type { WorkflowController } from "./workflow-controller";

export type WorkspaceSaveResult = { project: CourseProject; source: SceneSource };

/**
 * Persist only the user-confirmed 2D source.  Local layouts remain local until
 * a project-backed generation creates its first immutable revision.
 */
export async function saveProfessionalSourceToWorkspace(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
): Promise<WorkspaceSaveResult> {
  const snapshot = workflow.getSnapshot();
  const geojson = snapshot.normalized?.geojson ?? snapshot.sourceGeojson;
  if (!geojson) throw new Error("没有可保存的2D标注。请先完成研究区和标注检查。");
  const projectSceneRef = snapshot.sceneRef?.kind === "project_revision" ? snapshot.sceneRef : null;
  let project = projectSceneRef
    ? session.getSnapshot().projects.find((item) => item.id === projectSceneRef.projectId) ?? null
    : session.getSnapshot().projects.find((item) => item.id === session.getSnapshot().currentProjectId) ?? null;
  if (!project) project = await session.createProject("未命名街道设计");
  const imported = await session.api.post<SceneSource>(`/api/v1/projects/${project.id}/sources/geojson`, { geojson });
  const annotation = snapshot.normalized?.referenceAnnotation ?? snapshot.annotationDraft?.annotation;
  const source = annotation
    ? await session.api.post<SceneSource>(`/api/v1/projects/${project.id}/sources/${imported.id}/review`, {
      annotation,
      actions: [{ op: "save_professional_annotation", feature_id: annotation.plan_id }],
      notes: "Saved from the professional workbench.",
    })
    : imported;
  await session.api.patch<CourseProject>(`/api/v1/projects/${project.id}/workflow`, { workflow_step: "annotation" });
  return { project, source };
}
