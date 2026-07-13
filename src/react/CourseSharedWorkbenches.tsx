import { Spin } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mountViewer, type ViewerHostOptions } from "../app";
import type { CourseApi, CourseProject, PlatformJob, SceneRevision, SceneSource } from "../course-api";
import { bindDesktopShell } from "../desktop-shell";
import { mountSceneGraphPage } from "../scene-graph";
import type { ReferenceAnnotation } from "../sg-types";
import type { SceneLayoutEditResponse } from "../viewer-api";
import type { ViewerManifest } from "../viewer-types";
import type { ViewerLanguage } from "../viewer-i18n";
import type { NormalizedSceneSourceResponse } from "../workflow-api";
import { toNormalizedSceneSource } from "../workflow-api";
import type { WorkflowController } from "../workflow-controller";
import { ViewerDesktopShell } from "./ViewerDesktopShell";

type MaterializedManifest = {
  manifest: ViewerManifest;
  manifestUrl: string;
  objectUrls: string[];
};

async function materializeProjectManifest(
  api: CourseApi,
  projectId: string,
  revisionId: string,
): Promise<MaterializedManifest> {
  const manifest = await api.request<ViewerManifest>(
    `/api/v1/projects/${projectId}/revisions/${revisionId}/viewer-manifest`,
  );
  const objectUrls: string[] = [];
  const materialize = async (resource: { artifact_id?: string; glb_url: string }): Promise<void> => {
    if (!resource.artifact_id) return;
    const blob = await api.fetchArtifactBlob(resource.artifact_id);
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    resource.glb_url = url;
  };
  await materialize(manifest.final_scene);
  await Promise.all((manifest.production_steps ?? []).map((step) => materialize(step)));
  const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }));
  objectUrls.push(manifestUrl);
  return { manifest, manifestUrl, objectUrls };
}

function MountedWorkbench({
  route,
  language,
  workflow,
  sceneGraphApproval,
  viewerOptions,
}: {
  route: "scene-graph" | "viewer";
  language: ViewerLanguage;
  workflow: WorkflowController;
  sceneGraphApproval?: (annotation: ReferenceAnnotation) => Promise<void>;
  viewerOptions?: ViewerHostOptions;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let disposed = false;
    let teardown: (() => void) | undefined;
    const shell = bindDesktopShell(host, route);
    shell.setRightPinned(true);
    if (route === "scene-graph") {
      teardown = mountSceneGraphPage(shell, workflow, {
        mode: "course",
        onApproveAndGenerate: sceneGraphApproval,
      });
    } else {
      void mountViewer(shell, workflow, { embedded: true, ...viewerOptions }).then((next) => {
        if (disposed) next();
        else teardown = next;
      });
    }
    return () => {
      disposed = true;
      teardown?.();
      shell.destroy();
    };
  }, [route, workflow, sceneGraphApproval, viewerOptions]);
  return <ViewerDesktopShell route={route} language={language} hostRef={hostRef} workflow={workflow} embedded />;
}

export function CourseReferenceWorkbench({
  api,
  project,
  source,
  language,
  workflow,
  onGenerationStarted,
}: {
  api: CourseApi;
  project: CourseProject;
  source: SceneSource;
  language: ViewerLanguage;
  workflow: WorkflowController;
  onGenerationStarted: (job: PlatformJob) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    void api.request<NormalizedSceneSourceResponse>(
      `/api/v1/projects/${project.id}/sources/${source.id}/workflow-source`,
    ).then((payload) => {
      if (cancelled) return;
      workflow.setSourceDraft({
        kind: "geojson",
        fileName: `${source.kind}:${source.id}`,
        geojson: payload.geojson ?? null,
      });
      workflow.setNormalizedSource(toNormalizedSceneSource(payload));
      setStatus("ready");
    }).catch((reason) => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
    });
    return () => { cancelled = true; };
  }, [api, project.id, source.id, workflow]);

  const approveAndGenerate = useCallback(async (annotation: ReferenceAnnotation) => {
    const reviewed = await api.post<SceneSource>(
      `/api/v1/projects/${project.id}/sources/${source.id}/review`,
      {
        annotation,
        actions: [{ op: "approve_reference_annotation", feature_id: annotation.plan_id }],
        notes: "Approved in the shared Reference Plan Annotation workbench.",
      },
    );
    const job = await api.post<PlatformJob>(`/api/v1/projects/${project.id}/generate`, {
      source_id: reviewed.id,
      prompt: project.design_goal,
      generation_mode: "baseline",
    });
    onGenerationStarted(job);
  }, [api, onGenerationStarted, project.design_goal, project.id, source.id]);

  if (status === "loading") return <div className="course-empty"><Spin /><p>正在把项目 OSM 载入参考图标注工作台…</p></div>;
  if (status === "error") return <div className="course-empty"><h2>无法载入参考图标注</h2><p>{error}</p></div>;
  return <div className="course-embedded-workbench course-embedded-annotation">
    <div className="course-workbench-caption">
      <span>SHARED WORKBENCH / OSM → REFERENCE ANNOTATION</span>
      <strong>{project.city} AOI 已进入现有参考图标注能力</strong>
      <small>建筑保持锁定；道路、横断面、功能区、树木和街道设施可继续审阅。</small>
    </div>
    <MountedWorkbench
      route="scene-graph"
      language={language}
      workflow={workflow}
      sceneGraphApproval={approveAndGenerate}
    />
  </div>;
}

export function CourseViewerWorkbench({
  api,
  project,
  revision,
  language,
  workflow,
  onRevisionCreated,
}: {
  api: CourseApi;
  project: CourseProject;
  revision: SceneRevision;
  language: ViewerLanguage;
  workflow: WorkflowController;
  onRevisionCreated: () => Promise<void>;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const urlsRef = useRef<string[]>([]);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  const addMaterialized = useCallback(async (revisionId: string) => {
    const materialized = await materializeProjectManifest(api, project.id, revisionId);
    urlsRef.current.push(...materialized.objectUrls);
    return materialized;
  }, [api, project.id]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    void addMaterialized(revision.id).then((materialized) => {
      if (cancelled) return;
      workflow.setGeneratedScene({
        layoutPath: materialized.manifestUrl,
        sceneRef: { kind: "project_revision", projectId: project.id, revisionId: revision.id },
        sceneRevision: materialized.manifest.layout_revision ?? null,
        contextMassing: materialized.manifest.context_massing ?? null,
      });
      setReady(true);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; };
  }, [addMaterialized, revision.id, workflow]);

  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
  }, []);

  const persistSceneCommands: NonNullable<ViewerHostOptions["persistSceneCommands"]> = useCallback(async (commands) => {
    const created = await api.post<SceneRevision>(
      `/api/v1/projects/${project.id}/revisions/${revisionRef.current.id}/edits`,
      {
        commands,
        branch_kind: "human_edit",
        label: "Student 3D edit",
        provenance: { editor: "shared_3d_road_viewer" },
        auto_evaluate: true,
      },
    );
    revisionRef.current = created;
    const materialized = await addMaterialized(created.id);
    const editResult = created.provenance?.edit_result as Record<string, any> | undefined;
    await onRevisionCreated();
    const persistedRevision = {
        layout_path: materialized.manifestUrl,
        scene_glb_path: materialized.manifest.final_scene.glb_url,
        lineage_id: project.id,
        revision: materialized.manifest.layout_revision!.revision,
        sha256: materialized.manifest.layout_revision!.sha256,
    };
    return {
      source: persistedRevision,
      revision: persistedRevision,
      applied_commands: commands,
      undo: (editResult?.undo as SceneLayoutEditResponse["undo"]) ?? {
        base: {
          revision: materialized.manifest.layout_revision!.revision,
          sha256: materialized.manifest.layout_revision!.sha256,
        },
        commands: [],
      },
    };
  }, [addMaterialized, api, onRevisionCreated, project.id]);
  const viewerOptions = useMemo<ViewerHostOptions>(
    () => ({ embedded: true, persistSceneCommands }),
    [persistSceneCommands],
  );

  if (error) return <div className="course-empty"><h2>3D 道路查看器载入失败</h2><p>{error}</p></div>;
  if (!ready) return <div className="course-empty"><Spin /><p>正在用项目 revision 启动 3D 道路查看器…</p></div>;
  return <div className="course-embedded-workbench course-embedded-viewer">
    <MountedWorkbench
      route="viewer"
      language={language}
      workflow={workflow}
      viewerOptions={viewerOptions}
    />
  </div>;
}
