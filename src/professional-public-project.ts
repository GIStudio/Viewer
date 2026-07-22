import type { EvaluationProfile, EvaluationRun, PlatformJob, PublicProject, SceneRevision, SceneSource } from "./course-api";
import type { ProfessionalSessionController } from "./professional-session";
import type { SceneEditCommand } from "./viewer-api";
import type { SceneLayoutEditResponse } from "./viewer-api";
import type { ViewerManifest } from "./viewer-types";
import type { EvaluationResult } from "./viewer-evaluation";
import type { WorkflowController } from "./workflow-controller";
import { saveProfessionalSourceToWorkspace } from "./professional-workspace-sync";
import type {
  ProfessionalScenario,
  ProfessionalScenarioAdapter,
  ProfessionalScenarioGeneration,
  ProfessionalScenarioOpenTarget,
  ProfessionalScenarioWorkspace,
  ScenarioComparisonItem,
  ScenarioGoalWeights,
  ScenarioParameter,
} from "./viewer-scenario-workbench";

const materializedUrls = new Set<string>();
const currentRevisionByProject = new Map<string, string>();

function asNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatParameter(value: unknown, suffix = ""): string {
  if (typeof value === "number" && Number.isFinite(value)) return `${Number(value.toFixed(2))}${suffix}`;
  const text = String(value ?? "").trim();
  return text ? `${text}${suffix}` : "—";
}

function scenarioParameters(revision: SceneRevision): { skeleton: ScenarioParameter[]; furniture: ScenarioParameter[] } {
  const provenance = revision.provenance ?? {};
  const patch = provenance.compose_config_patch && typeof provenance.compose_config_patch === "object"
    ? provenance.compose_config_patch as Record<string, unknown>
    : {};
  const commands = revision.commands ?? [];
  const opCounts = new Map<string, number>();
  commands.forEach((command) => {
    const op = String(command.op ?? "edit");
    opCounts.set(op, (opCounts.get(op) ?? 0) + 1);
  });
  const skeleton: ScenarioParameter[] = [
    { label: "Sidewalk", value: formatParameter(patch.sidewalk_width_m, patch.sidewalk_width_m == null ? "" : "m") },
    { label: "Road width", value: formatParameter(patch.road_width_m, patch.road_width_m == null ? "" : "m") },
    { label: "Lanes", value: formatParameter(patch.lane_count) },
    { label: "Profile", value: formatParameter(patch.skeleton_design_profile ?? patch.design_rule_profile) },
  ];
  const furniture: ScenarioParameter[] = [
    { label: "Profile", value: formatParameter(patch.street_furniture_profile) },
    { label: "Density", value: formatParameter(patch.density) },
    { label: "Add / replace", value: String((opCounts.get("add_instance") ?? 0) + (opCounts.get("replace_asset") ?? 0)) },
    { label: "Transform", value: String((opCounts.get("move_instance") ?? 0) + (opCounts.get("rotate_instance") ?? 0) + (opCounts.get("scale_instance") ?? 0)) },
  ];
  return { skeleton, furniture };
}

function buildScenarioWorkspace(
  projectId: string,
  revisions: SceneRevision[],
  evaluations: EvaluationRun[],
  currentRevisionId: string | null,
  canWrite: boolean,
  latestProjectSourceId: string | null,
  hasCurrent2DSource: boolean,
): ProfessionalScenarioWorkspace {
  const latestEvaluation = new Map<string, EvaluationRun>();
  evaluations.filter((item) => item.status === "succeeded").forEach((item) => {
    if (!latestEvaluation.has(item.revision_id)) latestEvaluation.set(item.revision_id, item);
  });
  let humanIndex = 0;
  let candidateIndex = 0;
  const orderedRevisions = [...revisions].sort((a, b) => a.revision_number - b.revision_number);
  const baselineRevisions = orderedRevisions.filter((revision) => revision.branch_kind === "baseline");
  const latestBaseline = baselineRevisions[baselineRevisions.length - 1];
  const scenarios = orderedRevisions
    .filter((revision) => revision.branch_kind === "human_edit"
      || revision.branch_kind === "ai_edit"
      || revision.id === latestBaseline?.id)
    .map((revision): ProfessionalScenario => {
    let shortLabel = "";
    if (revision.branch_kind === "baseline") {
      shortLabel = "A";
    } else if (revision.branch_kind === "human_edit") {
      humanIndex += 1;
      shortLabel = `B${humanIndex}`;
    } else if (revision.branch_kind === "ai_edit") {
      candidateIndex += 1;
      shortLabel = `C${candidateIndex}`;
    }
    const evaluation = latestEvaluation.get(revision.id);
    const result = evaluation?.result ?? {};
    const parameters = scenarioParameters(revision);
    const provenance = revision.provenance ?? {};
    const rawWeights = provenance.goal_weights;
    const goalWeights = rawWeights && typeof rawWeights === "object" && !Array.isArray(rawWeights)
      ? Object.fromEntries(Object.entries(rawWeights).flatMap(([key, value]) => {
          const number = Number(value);
          return Number.isFinite(number) ? [[key, number]] : [];
        }))
      : {};
    return {
      id: revision.id,
      shortLabel,
      title: revision.label || (shortLabel === "A" ? "OSM baseline" : shortLabel.startsWith("B") ? "Manual edit" : "Metric candidate"),
      branchKind: revision.branch_kind,
      revisionNumber: revision.revision_number,
      sourceId: revision.source_id ?? null,
      parentId: revision.parent_id ?? null,
      createdAt: revision.created_at ?? null,
      generationMethod: String(provenance.generation_method ?? "unknown_legacy"),
      goalWeights,
      current: revision.id === currentRevisionId,
      scores: {
        walkability: asNumber(result.walkability),
        safety: asNumber(result.safety),
        beauty: asNumber(result.beauty),
        overall: asNumber(result.overall),
      },
      ...parameters,
    };
  });
  const baselines = scenarios.filter((scenario) => scenario.branchKind === "baseline");
  const manualEdits = scenarios.filter((scenario) => scenario.branchKind === "human_edit");
  const parent = manualEdits[manualEdits.length - 1] ?? baselines[baselines.length - 1] ?? null;
  const hasSource = Boolean(parent?.sourceId || latestProjectSourceId || hasCurrent2DSource);
  return {
    projectId,
    scenarios,
    canWrite,
    candidateReadiness: {
      state: parent ? (hasSource ? "ready" : "needs_source") : "needs_baseline",
      parentLabel: parent?.shortLabel ?? null,
    },
  };
}

function openTarget(materialized: { manifest: ViewerManifest; manifestUrl: string }): ProfessionalScenarioOpenTarget {
  return {
    layoutPath: materialized.manifestUrl,
    sceneGlbPath: materialized.manifest.final_scene.glb_url,
  };
}

function workflowHasCurrent2DSource(workflow: WorkflowController): boolean {
  const snapshot = workflow.getSnapshot();
  return Boolean(snapshot.normalized?.geojson ?? snapshot.sourceGeojson);
}

async function ensureActiveOwnedProjectRevision(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
): Promise<{ projectId: string; revision: SceneRevision }> {
  const sceneRef = workflow.getSnapshot().sceneRef;
  if (sceneRef?.kind === "project_revision") {
    if (!session.getSnapshot().projects.some((project) => project.id === sceneRef.projectId)) {
      throw new Error("当前公共项目为只读；请先复制到自己的项目后再编辑或生成候选。");
    }
    const revisions = await session.api.request<{ items: SceneRevision[] }>(`/api/v1/projects/${sceneRef.projectId}/revisions`);
    const revision = revisions.items.find((item) => item.id === sceneRef.revisionId);
    if (!revision) throw new Error("当前项目场景版本不存在，请重新打开场景。");
    return { projectId: sceneRef.projectId, revision };
  }

  const layoutPath = String(workflow.getSnapshot().sceneLayoutPath || "").trim();
  if (!layoutPath || /^(?:blob:|https?:)/i.test(layoutPath)) {
    throw new Error("请先生成一个可保存的 Scene A，再编辑或创建 C 候选。");
  }
  const ready = await session.ensureReady();
  let project = ready.projects.find((item) => item.id === ready.currentProjectId) ?? ready.projects[0] ?? null;
  if (!project) project = await session.createProject("未命名街道设计");
  let sourceId: string | undefined;
  if (workflowHasCurrent2DSource(workflow)) {
    const saved = await saveProfessionalSourceToWorkspace(session, workflow);
    if (saved.project.id !== project.id) {
      throw new Error("当前 2D 标注与目标项目不一致，请重新打开项目后再保存方案 A。");
    }
    sourceId = saved.source.id;
  }
  const imported = await session.api.post<SceneRevision>(
    `/api/v1/projects/${project.id}/revisions/import-layout`,
    { layout_path: layoutPath, source_id: sourceId, label: "方案 A · 当前场景" },
  );
  await openProfessionalOwnedRevision(session, workflow, project.id, imported);
  return { projectId: project.id, revision: imported };
}

async function waitForProjectJob(
  session: ProfessionalSessionController,
  initial: PlatformJob,
  onProgress?: () => Promise<void> | void,
): Promise<PlatformJob> {
  let job = initial;
  const maxAttempts = 1800;
  for (let attempt = 0; attempt < maxAttempts && !["succeeded", "failed", "cancelled"].includes(job.status); attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    job = await session.api.request<PlatformJob>(`/api/v1/jobs/${job.id}`);
    if ((attempt + 1) % 4 === 0 || ["succeeded", "failed", "cancelled"].includes(job.status)) {
      await onProgress?.();
    }
  }
  if (job.status === "queued" || job.status === "running") {
    throw new Error(`场景生成仍在后台${job.status === "queued" ? "排队" : "运行"}，已超过 900 秒等待窗口；任务未被判定为失败，可稍后刷新方案版本。`);
  }
  if (job.status !== "succeeded") {
    throw new Error(job.error || job.message || `场景生成任务状态：${job.status}`);
  }
  return job;
}

async function publicArtifactBlob(artifactId: string): Promise<Blob> {
  const response = await fetch(`/api/v1/public/artifacts/${encodeURIComponent(artifactId)}`);
  if (!response.ok) throw new Error(`Public artifact download failed: ${response.status}`);
  return response.blob();
}

async function materializeProjectManifest(
  session: ProfessionalSessionController,
  projectId: string,
  revisionId: string,
  isPublic: boolean,
): Promise<{
  manifest: ViewerManifest;
  manifestUrl: string;
}> {
  const manifest = isPublic
    ? await fetch(`/api/v1/public/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/viewer-manifest`).then(async (response) => {
      if (!response.ok) throw new Error(`Public scene manifest failed: ${response.status}`);
      return response.json() as Promise<ViewerManifest>;
    })
    : await session.api.request<ViewerManifest>(`/api/v1/projects/${projectId}/revisions/${revisionId}/viewer-manifest`);
  const materialize = async (resource: { artifact_id?: string; glb_url: string }): Promise<void> => {
    if (!resource.artifact_id) return;
    const blob = isPublic ? await publicArtifactBlob(resource.artifact_id) : await session.api.fetchArtifactBlob(resource.artifact_id);
    const url = URL.createObjectURL(blob);
    materializedUrls.add(url);
    resource.glb_url = url;
  };
  await materialize(manifest.final_scene);
  await Promise.all((manifest.production_steps ?? []).map((step) => materialize(step)));
  const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }));
  materializedUrls.add(manifestUrl);
  return { manifest, manifestUrl };
}

export async function openProfessionalPublicProject(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
  project: PublicProject,
): Promise<void> {
  const revision = project.latest_revision;
  if (!revision) throw new Error("This public project has no 3D revision yet.");
  const materialized = await materializeProjectManifest(session, project.id, revision.id, true);
  currentRevisionByProject.set(project.id, revision.id);
  if (session.getSnapshot().projects.some((item) => item.id === project.id)) {
    session.selectProject(project.id);
  }
  workflow.setGeneratedScene({
    layoutPath: materialized.manifestUrl,
    sceneRef: { kind: "project_revision", projectId: project.id, revisionId: revision.id },
    sourceRevision: null,
    sceneRevision: materialized.manifest.layout_revision ?? null,
    contextMassing: materialized.manifest.context_massing ?? null,
  });
}

export async function openProfessionalOwnedRevision(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
  projectId: string,
  revision: SceneRevision,
  options: { sourceRevision?: number | null } = {},
): Promise<ProfessionalScenarioOpenTarget> {
  const isPublic = session.getSnapshot().workspace?.scope === "public";
  const materialized = await materializeProjectManifest(session, projectId, revision.id, isPublic);
  currentRevisionByProject.set(projectId, revision.id);
  workflow.setGeneratedScene({
    layoutPath: materialized.manifestUrl,
    sceneRef: { kind: "project_revision", projectId, revisionId: revision.id },
    sourceRevision: options.sourceRevision ?? null,
    sceneRevision: materialized.manifest.layout_revision ?? null,
    contextMassing: materialized.manifest.context_massing ?? null,
  });
  return openTarget(materialized);
}

export async function copyProfessionalStarterToOwnedProject(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
  layoutPath: string,
): Promise<ProfessionalScenarioOpenTarget> {
  await session.ensureReady();
  const project = await session.createProject("广州示例副本");
  const saved = await saveProfessionalSourceToWorkspace(session, workflow);
  if (saved.project.id !== project.id) throw new Error("示例 OSM 标注未保存到新建项目，请重试。");
  const revision = await session.api.post<SceneRevision>(
    `/api/v1/projects/${project.id}/revisions/import-layout`,
    {
      layout_path: layoutPath,
      source_id: saved.source.id,
      label: "方案 A · 内置示例副本",
    },
  );
  await session.refreshPublicProjects().catch(() => []);
  return openProfessionalOwnedRevision(session, workflow, project.id, revision);
}

async function openProfessionalReadOnlyRevision(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
  projectId: string,
  revision: SceneRevision,
): Promise<ProfessionalScenarioOpenTarget> {
  const materialized = await materializeProjectManifest(session, projectId, revision.id, true);
  currentRevisionByProject.set(projectId, revision.id);
  workflow.setGeneratedScene({
    layoutPath: materialized.manifestUrl,
    sceneRef: { kind: "project_revision", projectId, revisionId: revision.id },
    sourceRevision: null,
    sceneRevision: materialized.manifest.layout_revision ?? null,
    contextMassing: materialized.manifest.context_massing ?? null,
  });
  return openTarget(materialized);
}

export async function persistProfessionalPublicCommands(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
  commands: SceneEditCommand[],
  layoutPath = "",
): Promise<SceneLayoutEditResponse> {
  let sceneRef = workflow.getSnapshot().sceneRef;
  if (sceneRef?.kind !== "project_revision") {
    const importableLayoutPath = String(layoutPath || workflow.getSnapshot().sceneLayoutPath || "").trim();
    if (!importableLayoutPath || /^(?:blob:|https?:)/i.test(importableLayoutPath)) {
      throw new Error("当前场景还不能保存为项目版本，请重新打开本地 scene_layout.json 后再编辑。");
    }
    const ready = await session.ensureReady();
    let project = ready.projects.find((item) => item.id === ready.currentProjectId) ?? ready.projects[0] ?? null;
    if (!project) project = await session.createProject("未命名街道设计");
    const imported = await session.api.post<SceneRevision>(
      `/api/v1/projects/${project.id}/revisions/import-layout`,
      { layout_path: importableLayoutPath, label: "Professional imported scene" },
    );
    await openProfessionalOwnedRevision(session, workflow, project.id, imported);
    sceneRef = workflow.getSnapshot().sceneRef;
  }
  if (sceneRef?.kind !== "project_revision") throw new Error("The current scene could not be materialized as a project revision.");
  if (!session.getSnapshot().projects.some((project) => project.id === sceneRef.projectId)) {
    throw new Error("This public project is read-only in the current browser.");
  }
  const baseRevisionId = currentRevisionByProject.get(sceneRef.projectId) ?? sceneRef.revisionId;
  const created = await session.api.post<SceneRevision>(
    `/api/v1/projects/${sceneRef.projectId}/revisions/${baseRevisionId}/edits`,
    {
      commands,
      branch_kind: "human_edit",
      label: "Professional public 3D edit",
      provenance: { editor: "professional_public_workbench" },
      auto_evaluate: true,
      auto_evaluate_mode: "structured",
    },
  );
  currentRevisionByProject.set(sceneRef.projectId, created.id);
  const materialized = await materializeProjectManifest(
    session,
    sceneRef.projectId,
    created.id,
    session.getSnapshot().workspace?.scope === "public",
  );
  await session.refreshPublicProjects().catch(() => []);
  const editResult = created.provenance?.edit_result as Record<string, unknown> | undefined;
  const persistedRevision = {
    layout_path: materialized.manifestUrl,
    scene_glb_path: materialized.manifest.final_scene.glb_url,
    lineage_id: sceneRef.projectId,
    revision: materialized.manifest.layout_revision!.revision,
    sha256: materialized.manifest.layout_revision!.sha256,
  };
  return {
    source: persistedRevision,
    revision: persistedRevision,
    applied_commands: commands,
    undo: (editResult?.undo as SceneLayoutEditResponse["undo"]) ?? {
      base: { revision: persistedRevision.revision, sha256: persistedRevision.sha256 },
      commands: [],
    },
  };
}

export async function exportOwnedPublicProject(
  session: ProfessionalSessionController,
  project: PublicProject,
): Promise<void> {
  if (!session.getSnapshot().projects.some((item) => item.id === project.id)) {
    throw new Error("Only the creating guest can build this public project package.");
  }
  let job = await session.api.post<PlatformJob>(`/api/v1/projects/${project.id}/exports`, {});
  for (let attempt = 0; attempt < 240 && !["succeeded", "failed", "cancelled"].includes(job.status); attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    job = await session.api.request<PlatformJob>(`/api/v1/jobs/${job.id}`);
  }
  if (job.status !== "succeeded") throw new Error(job.error || "Public project export failed.");
}

export async function evaluateOwnedPublicProject(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
  weights: Record<string, number>,
): Promise<EvaluationResult> {
  const sceneRef = workflow.getSnapshot().sceneRef;
  if (sceneRef?.kind !== "project_revision") throw new Error("The current scene is not a project-backed revision.");
  if (!session.getSnapshot().projects.some((project) => project.id === sceneRef.projectId)) {
    throw new Error("This public project is read-only in the current browser.");
  }
  const revisionId = currentRevisionByProject.get(sceneRef.projectId) ?? sceneRef.revisionId;
  const profiles = await session.api.request<{ items: EvaluationProfile[] }>(`/api/v1/projects/${sceneRef.projectId}/evaluation-profiles`);
  const profile = profiles.items.find((item) => item.is_default) ?? profiles.items[0];
  if (!profile) throw new Error("This project has no evaluation profile.");
  const created = await session.api.post<{ evaluation: EvaluationRun; job: PlatformJob | null }>(
    `/api/v1/projects/${sceneRef.projectId}/evaluations`,
    { revision_id: revisionId, profile_id: profile.id, weights, evaluation_mode: "full", auto_run: true },
  );
  let job = created.job;
  for (let attempt = 0; job && attempt < 240 && !["succeeded", "failed", "cancelled"].includes(job.status); attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    job = await session.api.request<PlatformJob>(`/api/v1/jobs/${job.id}`);
  }
  if (job && job.status !== "succeeded") throw new Error(job.error || "Project evaluation failed.");
  const evaluations = await session.api.request<{ items: EvaluationRun[] }>(`/api/v1/projects/${sceneRef.projectId}/evaluations`);
  const evaluation = evaluations.items.find((item) => item.id === created.evaluation.id) ?? created.evaluation;
  if (evaluation.status !== "succeeded") throw new Error(evaluation.error || "Project evaluation did not complete.");
  await session.refreshPublicProjects().catch(() => []);
  return evaluation.result as EvaluationResult;
}

export function createProfessionalScenarioAdapter(
  session: ProfessionalSessionController,
  workflow: WorkflowController,
): ProfessionalScenarioAdapter {
  const currentProjectId = (): string => {
    const sceneRef = workflow.getSnapshot().sceneRef;
    if (sceneRef?.kind === "project_revision") return sceneRef.projectId;
    const snapshot = session.getSnapshot();
    return snapshot.currentProjectId ?? snapshot.projects[0]?.id ?? "";
  };

  const load = async (): Promise<ProfessionalScenarioWorkspace> => {
    const projectId = currentProjectId();
    if (!projectId) {
      return {
        projectId: "",
        scenarios: [],
        canWrite: false,
        candidateReadiness: { state: "needs_baseline", parentLabel: null },
      };
    }
    const owned = session.getSnapshot().projects.some((project) => project.id === projectId);
    const [revisionPayload, evaluationPayload, sourcePayload] = await Promise.all([
      session.api.request<{ items: SceneRevision[] }>(owned
        ? `/api/v1/projects/${projectId}/revisions`
        : `/api/v1/public/projects/${projectId}/revisions`),
      owned
        ? session.api.request<{ items: EvaluationRun[] }>(`/api/v1/projects/${projectId}/evaluations`)
        : Promise.resolve({ items: [] as EvaluationRun[] }),
      owned
        ? session.api.request<{ items: SceneSource[] }>(`/api/v1/projects/${projectId}/sources`)
        : Promise.resolve({ items: [] as SceneSource[] }),
    ]);
    const sceneRef = workflow.getSnapshot().sceneRef;
    const currentRevisionId = currentRevisionByProject.get(projectId)
      ?? (sceneRef?.kind === "project_revision" && sceneRef.projectId === projectId ? sceneRef.revisionId : null);
    return buildScenarioWorkspace(
      projectId,
      revisionPayload.items,
      evaluationPayload.items,
      currentRevisionId,
      owned,
      sourcePayload.items[0]?.id ?? null,
      workflowHasCurrent2DSource(workflow),
    );
  };

  return {
    load,
    async open(revisionId): Promise<ProfessionalScenarioOpenTarget> {
      const projectId = currentProjectId();
      if (!projectId) throw new Error("当前没有可打开的项目场景。");
      const owned = session.getSnapshot().projects.some((project) => project.id === projectId);
      const payload = await session.api.request<{ items: SceneRevision[] }>(owned
        ? `/api/v1/projects/${projectId}/revisions`
        : `/api/v1/public/projects/${projectId}/revisions`);
      const revision = payload.items.find((item) => item.id === revisionId);
      if (!revision) throw new Error("所选项目版本不存在。");
      if (owned) return openProfessionalOwnedRevision(session, workflow, projectId, revision);
      return openProfessionalReadOnlyRevision(session, workflow, projectId, revision);
    },
    async evaluate(revisionId): Promise<void> {
      const projectId = currentProjectId();
      if (!projectId) throw new Error("当前没有可评价的项目场景。");
      if (!session.getSnapshot().projects.some((project) => project.id === projectId)) {
        throw new Error("当前公共项目为只读，不能获取评分。");
      }
      const profiles = await session.api.request<{ items: EvaluationProfile[] }>(`/api/v1/projects/${projectId}/evaluation-profiles`);
      const profile = profiles.items.find((item) => item.is_default) ?? profiles.items[0];
      if (!profile) throw new Error("当前项目没有可用的评价配置。");
      const created = await session.api.post<{ evaluation: EvaluationRun; job: PlatformJob | null }>(
        `/api/v1/projects/${projectId}/evaluations`,
        { revision_id: revisionId, profile_id: profile.id, evaluation_mode: "full", auto_run: true },
      );
      if (created.job) await waitForProjectJob(session, created.job);
      await session.refreshPublicProjects().catch(() => []);
    },
    async saveCurrentAsBaseline(): Promise<void> {
      await ensureActiveOwnedProjectRevision(session, workflow);
      await session.refreshPublicProjects().catch(() => []);
    },
    async prepareManualEdit(): Promise<ProfessionalScenarioOpenTarget> {
      const active = await ensureActiveOwnedProjectRevision(session, workflow);
      const projectId = active.projectId;
      const branch = await session.api.post<SceneRevision>(
        `/api/v1/projects/${projectId}/revisions/${active.revision.id}/fork`,
        {
          branch_kind: "human_edit",
          label: "方案 B · 人工编辑起点",
          provenance: { editor: "professional_scenario_workbench" },
        },
      );
      currentRevisionByProject.set(projectId, branch.id);
      return openProfessionalOwnedRevision(session, workflow, projectId, branch);
    },
    async generate(
      goalWeights: ScenarioGoalWeights,
      onProgress?: (workspace: ProfessionalScenarioWorkspace) => void,
    ): Promise<ProfessionalScenarioGeneration> {
      const active = await ensureActiveOwnedProjectRevision(session, workflow);
      const projectId = active.projectId;
      const revisionPayload = await session.api.request<{ items: SceneRevision[] }>(`/api/v1/projects/${projectId}/revisions`);
      const parentRevision = revisionPayload.items.find((revision) => revision.id === active.revision.id);
      if (!parentRevision) throw new Error("当前 Scene A/B 版本不存在，请重新打开后再创建 C 候选。");
      const sourcePayload = await session.api.request<{ items: SceneSource[] }>(`/api/v1/projects/${projectId}/sources`);
      let sourceId = parentRevision.source_id ?? sourcePayload.items[0]?.id ?? null;
      if (!sourceId && workflowHasCurrent2DSource(workflow)) {
        const saved = await saveProfessionalSourceToWorkspace(session, workflow);
        if (saved.project.id !== projectId) throw new Error("2D 来源与当前项目不一致，请重新打开项目后再生成。");
        sourceId = saved.source.id;
      }
      if (!sourceId) {
        throw new Error("当前 A/B 没有可追溯的 2D 来源。请返回 2D 标注，保存后生成新的 A 基线。");
      }
      const positiveGoals = Object.entries(goalWeights).filter(([, value]) => Number.isFinite(value) && value > 0);
      if (positiveGoals.length < 2) throw new Error("请至少为两个目标设置大于 0 的权重。");
      const parentRevisionId = parentRevision.id;
      const goalSummary = positiveGoals.map(([key, value]) => `${key}=${value}`).join(", ");
      const initial = await session.api.post<PlatformJob>(`/api/v1/projects/${projectId}/generate`, {
        source_id: sourceId,
        prompt: `Run a traceable local parameter search from objective weights (${goalSummary}). Keep the approved OSM topology and retain every evaluated candidate. This search is not a claim of global optimality.`,
        generation_mode: "parametric",
        parent_revision_id: parentRevisionId,
        goal_weights: goalWeights,
        candidate_count: 3,
      });
      const completed = await waitForProjectJob(session, initial, async () => {
        onProgress?.(await load());
      });
      const revisionId = String(completed.result?.revision?.id ?? "");
      const revisions = await session.api.request<{ items: SceneRevision[] }>(`/api/v1/projects/${projectId}/revisions`);
      const revision = revisions.items.find((item) => item.id === revisionId)
        ?? revisions.items.find((item) => item.parent_id === parentRevisionId && item.branch_kind === "ai_edit")
        ?? revisions.items[0];
      if (!revision) throw new Error("候选生成完成，但没有找到新 revision。");
      const target = await openProfessionalOwnedRevision(session, workflow, projectId, revision);
      await session.refreshPublicProjects().catch(() => []);
      return { workspace: await load(), target, selectedScenarioId: revision.id };
    },
    async compare(revisionIds: string[]): Promise<ScenarioComparisonItem[]> {
      const projectId = currentProjectId();
      if (!projectId) throw new Error("当前没有可比较的项目。");
      const owned = session.getSnapshot().projects.some((project) => project.id === projectId);
      if (!owned) {
        const workspace = await load();
        return revisionIds.map((revisionId) => ({
          scenario: workspace.scenarios.find((scenario) => scenario.id === revisionId)!,
          scoreDelta: { walkability: null, safety: null, beauty: null, overall: null },
        })).filter((item) => Boolean(item.scenario));
      }
      const comparison = await session.api.post<{
        items: Array<{ revision: SceneRevision; score_delta: Record<string, number | null> }>;
      }>(`/api/v1/projects/${projectId}/comparisons`, { revision_ids: revisionIds });
      const workspace = await load();
      return comparison.items.map((item) => ({
        scenario: workspace.scenarios.find((scenario) => scenario.id === item.revision.id)!,
        scoreDelta: item.score_delta,
      })).filter((item) => Boolean(item.scenario));
    },
  };
}

export function disposeProfessionalPublicProjectUrls(): void {
  materializedUrls.forEach((url) => URL.revokeObjectURL(url));
  materializedUrls.clear();
  currentRevisionByProject.clear();
}
