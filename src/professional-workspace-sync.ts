import type { CourseProject, SceneSource } from "./course-api";
import type { ProfessionalSessionController } from "./professional-session";
import type { WorkflowController } from "./workflow-controller";
import type { SceneAssetPalette, SceneAssetPaletteAdapter } from "./viewer-asset-palette";

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
  const annotation = snapshot.normalized?.referenceAnnotation ?? snapshot.annotationDraft?.annotation;
  const source = annotation
    ? await session.api.post<SceneSource>(`/api/v1/projects/${project.id}/sources/reference-annotation`, { annotation })
    : await session.api.post<SceneSource>(`/api/v1/projects/${project.id}/sources/geojson`, { geojson });
  await session.api.patch<CourseProject>(`/api/v1/projects/${project.id}/workflow`, { workflow_step: "annotation" });
  return { project, source };
}

export function createProfessionalAssetPaletteAdapter(
  session: ProfessionalSessionController,
): SceneAssetPaletteAdapter {
  const currentProject = async (create: boolean): Promise<CourseProject | null> => {
    const snapshot = await session.ensureReady();
    const selected = snapshot.projects.find((project) => project.id === snapshot.currentProjectId) ?? snapshot.projects[0] ?? null;
    if (selected || !create) return selected;
    return session.createProject("未命名街道设计");
  };
  return {
    async load(): Promise<SceneAssetPalette> {
      const project = await currentProject(false);
      if (!project) return { schemaVersion: "roadgen3d.asset-palette.v1", assets: [] };
      return session.api.request<SceneAssetPalette>(`/api/v1/projects/${project.id}/asset-palette`);
    },
    async save(palette: SceneAssetPalette): Promise<SceneAssetPalette> {
      const project = await currentProject(true);
      if (!project) throw new Error("Unable to create a public project for this asset palette.");
      return session.api.request<SceneAssetPalette>(`/api/v1/projects/${project.id}/asset-palette`, {
        method: "PUT",
        body: JSON.stringify(palette),
      });
    },
  };
}
