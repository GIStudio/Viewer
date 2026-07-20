import "maplibre-gl/dist/maplibre-gl.css";

import { Button, Input, InputNumber, Select, Spin } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  COURSE_TOKEN_KEY,
  CourseApi,
  type Course,
  type CourseProject,
  type CourseUser,
  type EvaluationProfile,
  type EvaluationRun,
  type JobOperation,
  type PlatformJob,
  type PlatformCapabilities,
  type SceneRevision,
  type SceneSource,
  platformJobFailure,
} from "../course-api";
import type { ViewerLanguage } from "../viewer-i18n";
import type { WorkflowController } from "../workflow-controller";
import type { OsmAoiSelection } from "../osm-aoi-picker";
import type { OsmRoadPreview, OsmRoadStudyResponse, OsmRoadStudySelection } from "../workflow-api";
import { AoiMap } from "./AoiMap";
import { OsmRoadStudyMap } from "./OsmRoadStudyMap";
import { CourseReferenceWorkbench, CourseViewerWorkbench, type CourseWorkbenchNavigation } from "./CourseSharedWorkbenches";
import { StudioBrandHeader } from "./StudioBrandHeader";
import { StudioLanguageToggle } from "./StudioLanguageToggle";

type StepId = "area" | "data" | "annotation" | "design" | "evaluation" | "compare_export";
const STEPS: Array<{ id: StepId; zh: string; en: string; index: string }> = [
  { id: "area", zh: "区域", en: "Area", index: "01" },
  { id: "data", zh: "数据", en: "Data", index: "02" },
  { id: "annotation", zh: "2D 标注", en: "2D Review", index: "03" },
  { id: "design", zh: "3D 设计", en: "3D Design", index: "04" },
  { id: "evaluation", zh: "评价", en: "Metrics", index: "05" },
  { id: "compare_export", zh: "对比与导出", en: "Compare & Export", index: "06" },
];

const GUANGZHOU_BBOX: [number, number, number, number] = [113.535, 22.795, 113.545, 22.805];

function score(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}

async function waitForJob(api: CourseApi, initial: PlatformJob): Promise<PlatformJob> {
  if (["succeeded", "failed", "cancelled"].includes(initial.status)) return initial;
  for (let attempt = 0; attempt < 360; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const next = await api.request<PlatformJob>(`/api/v1/jobs/${initial.id}`);
    if (["succeeded", "failed", "cancelled"].includes(next.status)) return next;
  }
  throw new Error("Task timed out while waiting for the server worker.");
}

export function CourseStudio({ language, workflow }: { language: ViewerLanguage; workflow: WorkflowController }) {
  const [api] = useState(() => new CourseApi());
  const [user, setUser] = useState<CourseUser | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [projects, setProjects] = useState<CourseProject[]>([]);
  const [project, setProject] = useState<CourseProject | null>(null);
  const [sources, setSources] = useState<SceneSource[]>([]);
  const [revisions, setRevisions] = useState<SceneRevision[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRun[]>([]);
  const [profiles, setProfiles] = useState<EvaluationProfile[]>([]);
  const [comparison, setComparison] = useState<Record<string, any> | null>(null);
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null);
  const [generationJob, setGenerationJob] = useState<PlatformJob | null>(null);
  const [step, setStep] = useState<StepId>("area");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const zh = language === "zh";

  const refreshProjects = useCallback(async () => {
    const [me, coursePayload, projectPayload] = await Promise.all([
      api.request<CourseUser>("/api/v1/me"),
      api.request<{ items: Course[] }>("/api/v1/courses"),
      api.request<{ items: CourseProject[] }>("/api/v1/projects"),
    ]);
    setUser(me);
    setCourses(coursePayload.items);
    setProjects(projectPayload.items);
    void api.request<PlatformCapabilities>("/api/v1/capabilities")
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
    setProject((current) => projectPayload.items.find((item) => item.id === current?.id) ?? projectPayload.items[0] ?? null);
  }, [api]);

  const refreshProjectData = useCallback(async (projectId: string) => {
    const [sourcePayload, revisionPayload, evaluationPayload, profilePayload, jobPayload] = await Promise.all([
      api.request<{ items: SceneSource[] }>(`/api/v1/projects/${projectId}/sources`),
      api.request<{ items: SceneRevision[] }>(`/api/v1/projects/${projectId}/revisions`),
      api.request<{ items: EvaluationRun[] }>(`/api/v1/projects/${projectId}/evaluations`),
      api.request<{ items: EvaluationProfile[] }>(`/api/v1/projects/${projectId}/evaluation-profiles`),
      api.request<{ items: PlatformJob[] }>(`/api/v1/projects/${projectId}/jobs?kind=scene_generate&status=queued&status=running&limit=1`),
    ]);
    setSources(sourcePayload.items);
    setRevisions(revisionPayload.items);
    setEvaluations(evaluationPayload.items);
    setProfiles(profilePayload.items);
    setGenerationJob(jobPayload.items[0] ?? null);
  }, [api]);

  useEffect(() => {
    if (!api.token) return;
    refreshProjects().catch(() => api.setToken(""));
  }, [api, refreshProjects]);

  useEffect(() => {
    if (!project) return;
    setStep((project.workflow_step as StepId) || "area");
    void refreshProjectData(project.id);
  }, [project?.id, refreshProjectData]);

  const act = async (label: string, callback: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try { await callback(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(""); }
  };

  const selectStep = useCallback(async (next: StepId) => {
    setStep(next);
    if (project) {
      const updated = await api.patch<CourseProject>(`/api/v1/projects/${project.id}/workflow`, { workflow_step: next }).catch(() => null);
      if (updated) setProject(updated);
    }
  }, [api, project]);

  const courseNavigation = useMemo<CourseWorkbenchNavigation>(() => ({
    current: step,
    items: STEPS.map((item) => ({ id: item.id, index: item.index, label: zh ? item.zh : item.en })),
    onNavigate: (id) => { void selectStep(id as StepId); },
  }), [selectStep, step, zh]);

  if (!user) {
    return <CourseAuth api={api} language={language} onAuthenticated={refreshProjects} />;
  }

  const latestRevision = revisions[0] ?? null;
  const latestSource = sources[0] ?? null;

  return (
    <div className="course-studio-shell" data-step={step} data-immersive={String(step === "annotation" || (step === "design" && !generationJob && Boolean(latestRevision)))}>
      <StudioBrandHeader
        variant="course"
        language={language}
        className="course-studio-header"
        contextLabel={zh ? "当前项目" : "Current project"}
        contextValue={(
          <Select
            value={project?.id}
            placeholder={zh ? "新建一个课程项目" : "Create a course project"}
            options={projects.map((item) => ({ value: item.id, label: `${item.name} · ${item.city}` }))}
            onChange={(id) => setProject(projects.find((item) => item.id === id) ?? null)}
          />
        )}
        actions={(
          <div className="course-user-block">
            <StudioLanguageToggle language={language} />
            <div><strong>{user.display_name}</strong><small>{user.system_role}</small></div>
            <Button onClick={() => { api.setToken(""); setUser(null); }}>{zh ? "退出" : "Sign out"}</Button>
          </div>
        )}
      />

      <aside className="course-studio-sidebar">
        <div className="course-sidebar-label">{zh ? "课程" : "COURSE"}</div>
        <strong>{courses[0]?.name ?? (zh ? "尚未加入课程" : "No course")}</strong>
        <div className="course-sidebar-rule" />
        <nav>
          {STEPS.map((item) => (
            <button key={item.id} data-active={step === item.id} onClick={() => void selectStep(item.id)} disabled={!project}>
              <span>{item.index}</span><div><strong>{zh ? item.zh : item.en}</strong><small>{zh ? item.en : item.zh}</small></div>
            </button>
          ))}
        </nav>
        <div className="course-sidebar-footer">© OpenStreetMap contributors<br />RoadGen3D · schema v1</div>
      </aside>

      <main className="course-studio-main">
        {error ? <div className="course-notice" data-tone="error">{error}</div> : null}
        {busy ? <div className="course-busy"><Spin size="small" /> {busy}</div> : null}
        {!project ? (
          !courses.length && (user.system_role === "teacher" || user.system_role === "admin")
            ? <NewCoursePanel api={api} language={language} onCreated={refreshProjects} />
            : <NewProjectPanel api={api} courses={courses} language={language} onCreated={async (created) => { await refreshProjects(); setProject(created); }} />
        ) : (
          <>
            <div className="course-stage-heading"><div><span>{STEPS.find((item) => item.id === step)?.index} / 06</span><h1>{STEPS.find((item) => item.id === step)?.[zh ? "zh" : "en"]}</h1></div><p>{project.name}<br /><small>{project.city} · {project.design_goal}</small></p></div>
            {step === "area" ? <AreaStage project={project} language={language} /> : null}
            {step === "data" ? <DataStage api={api} project={project} latestSource={latestSource} language={language} act={act} onRefresh={() => refreshProjectData(project.id)} onNext={() => selectStep("annotation")} /> : null}
            {step === "annotation" ? <AnnotationStage api={api} project={project} source={latestSource} language={language} workflow={workflow} navigation={courseNavigation} onGenerationStarted={(job) => { setGenerationJob(job); setStep("design"); void api.patch(`/api/v1/projects/${project.id}/workflow`, { workflow_step: "design" }); }} /> : null}
            {step === "design" ? <DesignStage api={api} project={project} source={latestSource} revisions={revisions} evaluations={evaluations} profiles={profiles} capabilities={capabilities} generationJob={generationJob} language={language} workflow={workflow} navigation={courseNavigation} act={act} onJobChange={setGenerationJob} onRefresh={() => refreshProjectData(project.id)} onBackToAnnotation={() => void selectStep("annotation")} onNext={() => selectStep("evaluation")} /> : null}
            {step === "evaluation" ? <EvaluationStage api={api} project={project} revision={latestRevision} evaluations={evaluations} profiles={profiles} language={language} act={act} onRefresh={() => refreshProjectData(project.id)} /> : null}
            {step === "compare_export" ? <CompareStage api={api} project={project} revisions={revisions} comparison={comparison} setComparison={setComparison} language={language} act={act} /> : null}
          </>
        )}
      </main>
    </div>
  );
}

function NewCoursePanel({ api, language, onCreated }: { api: CourseApi; language: ViewerLanguage; onCreated: () => Promise<void> }) {
  const zh = language === "zh";
  const [name, setName] = useState(zh ? "城市街道设计课程" : "Urban Street Design Studio");
  const [code, setCode] = useState("URBAN-2026");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="course-create-panel"><section><span className="course-eyebrow">TEACHER SETUP</span><h1>{zh ? "创建第一门课程" : "Create the first course"}</h1><p>{zh ? "课程是项目、评价模板和学生权限的边界。" : "A course is the boundary for projects, evaluation profiles and student access."}</p><label>{zh ? "课程名称" : "Course name"}<Input value={name} disabled={Boolean(invite)} onChange={(event) => setName(event.target.value)} /></label><label>{zh ? "课程代码" : "Course code"}<Input value={code} disabled={Boolean(invite)} onChange={(event) => setCode(event.target.value.toUpperCase())} /></label><Button type="primary" size="large" loading={busy} disabled={Boolean(invite)} onClick={async () => { setBusy(true); try { const created = await api.post<Course>("/api/v1/courses", { name, code }); setInvite(created.invite_code ?? ""); } finally { setBusy(false); } }}>{zh ? "创建课程" : "Create course"}</Button></section><aside><span>INVITATION</span>{invite ? <><strong>{invite}</strong><p>{zh ? "将课程代码与此一次显示的邀请码发给学生。" : "Share the course code and this one-time displayed invitation with students."}</p><Button onClick={() => void navigator.clipboard.writeText(invite)}>{zh ? "复制邀请码" : "Copy invitation"}</Button><Button type="primary" onClick={() => void onCreated()}>{zh ? "已保存，继续" : "Saved, continue"}</Button></> : <p>{zh ? "邀请码仅在创建后显示一次。" : "The invitation is shown once after creation."}</p>}</aside></div>;
}

function CourseAuth({ api, language, onAuthenticated }: { api: CourseApi; language: ViewerLanguage; onAuthenticated: () => Promise<void> }) {
  const zh = language === "zh";
  const [mode, setMode] = useState<"login" | "register" | "bootstrap">("login");
  const [form, setForm] = useState({ email: "", password: "", display_name: "", course_code: "", invite_code: "", bootstrap_token: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      if (mode === "register") {
        await api.post("/api/v1/auth/register", form);
      } else if (mode === "bootstrap") {
        await api.post("/api/v1/auth/bootstrap", form);
      }
      const login = await api.post<{ access_token: string }>("/api/v1/auth/login", { email: form.email, password: form.password });
      api.setToken(login.access_token);
      await onAuthenticated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  };
  return <div className="course-auth-shell"><section className="course-auth-story"><div className="course-auth-mark">RG<br />3D</div><p>{zh ? "从真实街区开始，保留每一次判断。" : "Begin with a real street. Preserve every design decision."}</p><ol>{zh ? <><li>公共地图数据 → 2D标注</li><li>2D标注 → 初始3D版本</li><li>初始版本 → 修改 → 对比</li></> : <><li>OSM → GeoJSON</li><li>2D → 3D</li><li>Baseline → Edit → Compare</li></>}</ol></section><section className="course-auth-form"><span className="course-eyebrow">ROADGEN3D / COURSE STUDIO</span><h1>{mode === "login" ? (zh ? "继续你的城市设计" : "Continue your urban studio") : mode === "register" ? (zh ? "加入课程" : "Join a course") : (zh ? "初始化课程服务器" : "Initialize server")}</h1><div className="course-auth-fields">{mode !== "login" ? <Input placeholder={zh ? "姓名" : "Display name"} value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /> : null}<Input placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Input.Password placeholder={zh ? "密码（至少8位）" : "Password (8+ characters)"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />{mode === "register" ? <><Input placeholder={zh ? "课程代码" : "Course code"} value={form.course_code} onChange={(event) => setForm({ ...form, course_code: event.target.value })} /><Input placeholder={zh ? "教师邀请码" : "Teacher invitation"} value={form.invite_code} onChange={(event) => setForm({ ...form, invite_code: event.target.value })} /></> : null}{mode === "bootstrap" ? <Input.Password placeholder="ROADGEN_BOOTSTRAP_TOKEN" value={form.bootstrap_token} onChange={(event) => setForm({ ...form, bootstrap_token: event.target.value })} /> : null}</div>{error ? <div className="course-notice" data-tone="error">{error}</div> : null}<Button type="primary" size="large" block loading={busy} onClick={() => void submit()}>{mode === "login" ? (zh ? "登录" : "Sign in") : (zh ? "创建并登录" : "Create and sign in")}</Button><div className="course-auth-switch"><button onClick={() => setMode(mode === "register" ? "login" : "register")}>{mode === "register" ? (zh ? "已有账号" : "I have an account") : (zh ? "使用邀请码注册" : "Register with invite")}</button><button onClick={() => setMode(mode === "bootstrap" ? "login" : "bootstrap")}>{mode === "bootstrap" ? (zh ? "返回登录" : "Back to login") : (zh ? "首次部署" : "First deployment")}</button></div></section></div>;
}

function NewProjectPanel({ api, courses, language, onCreated }: { api: CourseApi; courses: Course[]; language: ViewerLanguage; onCreated: (project: CourseProject) => Promise<void> }) {
  const zh = language === "zh";
  const [selection, setSelection] = useState<OsmAoiSelection | null>(null);
  const [name, setName] = useState(zh ? "广州街道设计练习" : "Guangzhou Street Studio");
  const [city, setCity] = useState(zh ? "广州" : "Guangzhou");
  const [goal, setGoal] = useState("walkable complete street");
  const [busy, setBusy] = useState(false);
  if (!courses.length) return <div className="course-empty"><h2>{zh ? "先创建或加入一门课程" : "Create or join a course first"}</h2><p>{zh ? "教师通过课程 API 创建课程并分享邀请码；学生使用邀请码注册。" : "Teachers create a course and share its invitation code."}</p></div>;
  return <div className="course-project-creator"><div className="course-project-map"><AoiMap selection={selection} onSelectionChange={setSelection} language={zh ? "zh" : "en"} /><div className="course-map-caption">{zh ? "先浏览地图，再使用当前视野或精确框选研究区" : "Browse first, then use the current view or draw the study area"}</div></div><div className="course-project-form"><span className="course-eyebrow">NEW FIELD PROJECT</span><h1>{zh ? "从一个真实街区开始" : "Start from a real street district"}</h1><label>{zh ? "项目名称" : "Project name"}<Input value={name} onChange={(event) => setName(event.target.value)} /></label><label>{zh ? "城市" : "City"}<Input value={city} onChange={(event) => setCity(event.target.value)} /></label><label>{zh ? "设计目标" : "Design goal"}<Input.TextArea rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} /></label><div className="course-aoi-summary" data-ready={String(Boolean(selection))}>{selection ? <><span>{zh ? "已截取研究区" : "Study area captured"}</span><code>{selection.bbox.map((value) => value.toFixed(6)).join(" · ")}</code></> : <><span>{zh ? "尚未截取研究区" : "No study area yet"}</span><small>{zh ? "在左侧地图中完成取景后才能建立项目。" : "Capture an area on the map before creating the project."}</small></>}</div><Button type="primary" size="large" loading={busy} disabled={!selection} onClick={async () => { if (!selection) return; setBusy(true); try { const created = await api.post<CourseProject>("/api/v1/projects", { course_id: courses[0]!.id, name, city, design_goal: goal, aoi_bbox: selection.bbox }); await onCreated(created); } finally { setBusy(false); } }}>{zh ? "建立项目" : "Create project"}</Button></div></div>;
}

function AreaStage({ project, language }: { project: CourseProject; language: ViewerLanguage }) {
  const zh = language === "zh";
  const bbox = (project.aoi_bbox ?? GUANGZHOU_BBOX) as [number, number, number, number];
  return <div className="course-stage-grid"><section className="course-map-readonly"><AoiMap selection={{ bbox, source: "coordinates" }} onSelectionChange={() => undefined} readonly language={zh ? "zh" : "en"} /></section><section className="course-inspector"><span className="course-eyebrow">{zh ? "项目任务" : "PROJECT BRIEF"}</span><dl><dt>{zh ? "城市" : "City"}</dt><dd>{project.city}</dd><dt>{zh ? "设计目标" : "Goal"}</dt><dd>{project.design_goal}</dd><dt>{zh ? "已选研究区" : "Selected study area"}</dt><dd>{zh ? "地图范围已保存" : "Map area saved"}</dd></dl><div className="course-notice">{zh ? "推荐保留当前范围。道路和背景建筑的位置已锁定，下一步获取公共地图数据。" : "Keep this area unless you need another district. Roads and context buildings stay georeferenced."}</div><details className="course-technical-details"><summary>{zh ? "技术详情" : "Technical details"}</summary><p>WGS84 · bbox</p><code>{project.aoi_bbox?.map((item) => item.toFixed(6)).join(" · ")}</code></details></section></div>;
}

function DataStage({ api, project, latestSource, language, act, onRefresh, onNext }: { api: CourseApi; project: CourseProject; latestSource: SceneSource | null; language: ViewerLanguage; act: any; onRefresh: () => Promise<void>; onNext: () => void }) {
  const zh = language === "zh";
  const [osmJob, setOsmJob] = useState<PlatformJob | null>(null);
  const [preview, setPreview] = useState<OsmRoadPreview | null>(null);
  const upload = (file: File) => act(zh ? "正在检查地图文件…" : "Normalizing GeoJSON…", async () => { const payload = JSON.parse(await file.text()); await api.post(`/api/v1/projects/${project.id}/sources/geojson`, { geojson: payload }); await onRefresh(); });
  const refreshOsmJob = useCallback(async (initial: PlatformJob) => {
    let current = initial;
    setOsmJob(current);
    while (["queued", "running"].includes(current.status)) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      current = await api.request<PlatformJob>(`/api/v1/jobs/${current.id}`);
      setOsmJob(current);
    }
    if (current.status === "succeeded" && current.result.preview_id) {
      setPreview(current.result as OsmRoadPreview);
    }
  }, [api]);

  useEffect(() => {
    let active = true;
    void api.request<{ items: PlatformJob[] }>(`/api/v1/projects/${project.id}/jobs?kind=osm_preview&limit=1`)
      .then(({ items }) => {
        if (!active || !items[0]) return;
        const job = items[0];
        if (job.status === "succeeded" && job.result.preview_id) {
          setOsmJob(job);
          setPreview(job.result as OsmRoadPreview);
        } else if (["queued", "running"].includes(job.status)) {
          void refreshOsmJob(job);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [api, project.id, refreshOsmJob]);

  const startOsm = () => void act(zh ? "正在启动公共地图数据获取…" : "Starting OSM acquisition…", async () => {
    setPreview(null);
    const job = await api.post<PlatformJob>(`/api/v1/projects/${project.id}/osm-previews`, {});
    await refreshOsmJob(job);
  });
  const cancelOsm = () => void act(zh ? "正在取消地图数据获取…" : "Cancelling OSM acquisition…", async () => {
    if (!osmJob) return;
    const cancelled = await api.post<PlatformJob>(`/api/v1/jobs/${osmJob.id}/cancel`, {});
    setOsmJob(cancelled);
  });

  if (preview?.preview_id && preview.raw_artifact_id) {
    return <div className="course-osm-study-stage"><OsmRoadStudyMap
      preview={preview}
      language={zh ? "zh" : "en"}
      bufferReadonly
      onResolve={(selection: OsmRoadStudySelection) => api.post<OsmRoadStudyResponse>(`/api/v1/projects/${project.id}/osm-previews/${preview.preview_id}/selection-preview`, {
        ...selection,
        preview_id: preview.preview_id,
        raw_artifact_id: preview.raw_artifact_id,
      })}
      onApply={async (result) => {
        await act(zh ? "正在保存道路研究区…" : "Saving the road study area…", async () => {
          await api.post(`/api/v1/projects/${project.id}/osm-previews/${preview.preview_id}/selection`, {
            ...result.osm_study.selection,
            preview_id: preview.preview_id,
            raw_artifact_id: preview.raw_artifact_id,
          });
          await onRefresh();
          onNext();
        });
      }}
      onBack={() => { setPreview(null); setOsmJob(null); }}
    /></div>;
  }

  if (osmJob && ["queued", "running", "failed", "cancelled"].includes(osmJob.status)) {
    const indeterminate = String(osmJob.detail?.progress_mode ?? "") === "indeterminate";
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(osmJob.created_at).getTime()) / 1000));
    const active = ["queued", "running"].includes(osmJob.status);
    return <div className="course-osm-job-board"><section><span className="course-eyebrow">{zh ? "公共地图数据" : "OSM ACQUISITION"}</span><h2>{zh ? "正在获取道路和周边信息" : osmJob.message}</h2><div className="course-osm-job-track" data-indeterminate={String(indeterminate)}><i style={{ width: `${osmJob.progress}%` }} /></div><div className="course-osm-job-meta"><strong>{indeterminate ? "—" : `${osmJob.progress}%`}</strong><span>{zh ? "已读取对象" : "Elements"}: {String(osmJob.detail?.element_count ?? "—")}</span><span>{zh ? "服务尝试" : "Attempts"}: {String(osmJob.detail?.attempt ?? "—")} / {String(osmJob.detail?.max_attempts ?? "—")}</span><span>{elapsed}s</span></div><ol>{osmJob.operations.slice(-3).reverse().map((operation) => <li key={`${operation.timestamp}-${operation.stage}`}><b>{zh ? "处理步骤" : operation.stage.replace(/_/g, " ")}</b><span>{operation.message}</span></li>)}</ol>{osmJob.error ? <div className="course-notice" data-tone="error">{osmJob.error}</div> : null}<details className="course-technical-details"><summary>{zh ? "技术详情" : "Technical details"}</summary><code>{osmJob.stage}</code></details><div className="course-osm-job-actions">{active ? <Button danger onClick={cancelOsm}>{zh ? "取消任务" : "Cancel"}</Button> : <Button onClick={() => { setOsmJob(null); setPreview(null); }}>{zh ? "返回" : "Back"}</Button>}{["failed", "cancelled"].includes(osmJob.status) ? <Button type="primary" onClick={startOsm}>{zh ? "重试获取" : "Retry"}</Button> : null}</div></section></div>;
  }

  return <div className="course-data-layout"><section className="course-action-ledger"><div className="course-action-row"><span>01</span><div><strong>{zh ? "获取公共地图数据" : "Fetch public map data"}</strong><p>{zh ? "推荐使用默认设置：读取已选研究区的道路、建筑和周边信息，再选一条重点道路。" : "Fetch roads, buildings and context, then select the road you want to study."}</p></div><Button type="primary" onClick={startOsm}>{zh ? "获取并选择道路" : "Fetch and select road"}</Button></div><div className="course-action-row"><span>02</span><div><strong>{zh ? "导入已有地图文件" : "Import standard GeoJSON"}</strong><p>{zh ? "如果老师已经提供地图文件，也可以直接导入。" : "Use a prepared map file supplied by your teacher."}</p><details className="course-technical-details"><summary>{zh ? "技术详情" : "Technical details"}</summary><code>GeoJSON · EPSG:4326 · stable ID · role mapping</code></details></div><label className="course-file-button"><input type="file" accept=".geojson,.json,application/geo+json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />{zh ? "选择文件" : "Choose file"}</label></div></section><section className="course-quality-panel"><span className="course-eyebrow">{zh ? "数据检查" : "DATA CHECK"}</span>{latestSource ? <><h2>{zh ? "数据已就绪" : latestSource.kind.toUpperCase()}</h2><div className="course-quality-chips"><span data-ok={String(latestSource.quality_report.conversion_ok)}>{zh ? "地图格式可用" : "conversion_ok"}</span><span data-ok={String(latestSource.quality_report.topology_ok)}>{zh ? "道路连接可用" : "topology_ok"}</span></div><details className="course-technical-details"><summary>{zh ? "技术详情" : "Technical details"}</summary><p>{latestSource.kind} · GeoJSON</p><code>geo_delta {String(latestSource.quality_report.geo_delta)}m</code></details><Button onClick={() => void api.downloadArtifact(latestSource.normalized_artifact_id, "normalized.geojson")}>{zh ? "下载标准地图文件" : "Download GeoJSON"}</Button><Button type="primary" onClick={onNext}>{zh ? "进入2D标注检查" : "Review in 2D"}</Button></> : <p>{zh ? "当前任务：获取地图并选择重点道路。完成后可进入2D标注。" : "No final road study area selected yet."}</p>}</section></div>;
}

function AnnotationStage({ api, project, source, language, workflow, navigation, onGenerationStarted }: { api: CourseApi; project: CourseProject; source: SceneSource | null; language: ViewerLanguage; workflow: WorkflowController; navigation: CourseWorkbenchNavigation; onGenerationStarted: (job: PlatformJob) => void }) {
  const zh = language === "zh";
  if (!source) return <div className="course-empty"><h2>{zh ? "先完成数据导入" : "Import data first"}</h2></div>;
  return <CourseReferenceWorkbench api={api} project={project} source={source} language={language} workflow={workflow} navigation={navigation} onGenerationStarted={onGenerationStarted} />;
}

const GENERATION_STAGES = [
  { zh: "解析已批准标注", en: "Parse approved annotation", stages: ["starting", "annotation_resolving", "context_resolving"] },
  { zh: "生成街道布局", en: "Generate street layout", stages: ["asset_loading", "layout_generation"] },
  { zh: "求解空间约束", en: "Solve spatial constraints", stages: ["constraint_solving"] },
  { zh: "生成白模与街道资产", en: "Build massing and street assets", stages: ["asset_composition", "mesh_generation"] },
  { zh: "导出可编辑场景", en: "Export editable scene", stages: ["glb_export", "scene_rendering", "artifact_persisting"] },
  { zh: "保存版本并完成评分", en: "Save revision and score", stages: ["finalizing", "baseline_evaluation", "succeeded"] },
] as const;

function GenerationProgress({ job, language, onRetry, onBack }: { job: PlatformJob; language: ViewerLanguage; onRetry: () => void; onBack: () => void }) {
  const zh = language === "zh";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const failed = ["failed", "cancelled"].includes(job.status);
  const succeeded = job.status === "succeeded";
  const explicitIndex = GENERATION_STAGES.findIndex((item) => (item.stages as readonly string[]).includes(job.stage));
  const inferredIndex = job.progress < 24 ? 0 : job.progress < 46 ? 1 : job.progress < 60 ? 2 : job.progress < 76 ? 3 : job.progress < 90 ? 4 : 5;
  const activeIndex = succeeded ? GENERATION_STAGES.length - 1 : explicitIndex >= 0 ? explicitIndex : inferredIndex;
  const startedAt = Date.parse(job.created_at);
  const elapsedSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const operations = (job.operations ?? []).slice(-3).reverse();
  const numericDetail = Object.entries(job.detail ?? {}).filter(([, value]) => typeof value === "number").slice(0, 3);
  const failure = platformJobFailure(job);
  const failedProgress = Math.min(99, Math.max(0, job.progress));
  const visibleProgress = failed ? failedProgress : job.progress;
  const lastSuccessfulStage = typeof job.detail?.last_successful_stage === "string" ? job.detail.last_successful_stage : "";
  const lastSuccessfulIndex = GENERATION_STAGES.findIndex((item) => (item.stages as readonly string[]).includes(lastSuccessfulStage));
  const lastSuccessfulLabel = lastSuccessfulIndex >= 0 ? (zh ? GENERATION_STAGES[lastSuccessfulIndex]!.zh : GENERATION_STAGES[lastSuccessfulIndex]!.en) : (zh ? "2D标注已保存" : "2D annotation saved");
  const copyDiagnostic = () => {
    if (failure?.debug_reference) void navigator.clipboard.writeText(failure.debug_reference);
  };
  return <div className="course-generation-board" data-status={job.status}>
    <header>
      <div><span>{zh ? "2D标注 → 初始3D版本" : "2D → 3D / LIVE PIPELINE"}</span><h2>{failed ? (zh ? `停止于第 ${activeIndex + 1}/6 阶段` : `Stopped at stage ${activeIndex + 1}/6`) : succeeded ? (zh ? "初始3D版本已就绪" : "Initial 3D scene is ready") : (zh ? "正在建立可编辑3D街道" : "Building the editable 3D street")}</h2><p>{failed ? (failure?.user_message ?? (zh ? "3D场景生成失败。你的地图和2D标注已经保存，可以重试或返回检查标注。" : "3D scene generation failed. Your map and 2D annotation are saved.")) : (job.message || (zh ? "等待服务器更新…" : "Waiting for the server…"))}</p>{failed ? <small className="course-generation-last-success">{zh ? "最后完成：" : "Last completed: "}{lastSuccessfulLabel}</small> : null}</div>
      <div className="course-generation-percent"><strong>{failed ? `${activeIndex + 1}/6` : Math.round(job.progress)}</strong>{failed ? null : <span>%</span>}<small>{elapsed}</small></div>
    </header>
    <div className="course-generation-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(visibleProgress)}><i style={{ width: `${Math.max(2, Math.min(100, visibleProgress))}%` }} /></div>
    <ol className="course-generation-stages">
      {GENERATION_STAGES.map((item, index) => {
        const state = failed && index === activeIndex ? "failed" : succeeded || index < activeIndex ? "done" : index === activeIndex ? "running" : "waiting";
        return <li key={item.en} data-state={state}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{zh ? item.zh : item.en}</strong><small>{state === "done" ? (zh ? "完成" : "Complete") : state === "running" ? (zh ? "处理中" : "Running") : state === "failed" ? (zh ? "需要处理" : "Needs attention") : (zh ? "等待" : "Waiting")}</small></div></li>;
      })}
    </ol>
    <section className="course-generation-ledger">
      <div className="course-generation-facts">{numericDetail.length ? numericDetail.map(([key, value]) => <span key={key}><small>{key.replace(/_/g, " ")}</small><strong>{Number(value).toLocaleString()}</strong></span>) : <span><small>{zh ? "建筑表达" : "BUILDINGS"}</small><strong>{zh ? "透明建筑白模" : "Transparent massing"}</strong></span>}</div>
      <div className="course-generation-log"><span>{zh ? "最近操作" : "RECENT OPERATIONS"}</span>{operations.length ? operations.map((operation: JobOperation, index) => <p key={`${operation.timestamp}-${index}`}><time>{operation.timestamp?.slice(11, 19) || "--:--:--"}</time>{operation.message}</p>) : <p><time>--:--:--</time>{zh ? "任务已排队" : "Task queued"}</p>}</div>
    </section>
    {failed ? <><details className="course-generation-debug"><summary>{zh ? "技术详情" : "Technical details"}</summary><code>{failure?.debug_reference ?? job.id}</code><span>{failure?.code ?? "scene_generation_failed"}</span></details><footer><Button onClick={onBack}>{zh ? "返回检查2D标注" : "Back to 2D annotation"}</Button><Button disabled={!failure?.debug_reference} onClick={copyDiagnostic}>{zh ? "复制诊断编号" : "Copy diagnostic ID"}</Button><Button type="primary" disabled={failure?.retryable === false} onClick={onRetry}>{zh ? "重试生成" : "Retry generation"}</Button></footer></> : null}
  </div>;
}

function DesignStage({ api, project, source, revisions, evaluations, profiles, capabilities, generationJob, language, workflow, navigation, act, onJobChange, onRefresh, onBackToAnnotation, onNext }: { api: CourseApi; project: CourseProject; source: SceneSource | null; revisions: SceneRevision[]; evaluations: EvaluationRun[]; profiles: EvaluationProfile[]; capabilities: PlatformCapabilities | null; generationJob: PlatformJob | null; language: ViewerLanguage; workflow: WorkflowController; navigation: CourseWorkbenchNavigation; act: any; onJobChange: (job: PlatformJob | null) => void; onRefresh: () => Promise<void>; onBackToAnnotation: () => void; onNext: () => void }) {
  const zh = language === "zh";
  const latest = revisions[0];
  const latestEvaluation = evaluations.find((item) => item.revision_id === latest?.id);
  const [weights, setWeights] = useState({ walkability: 45, safety: 35, beauty: 20 });
  const [coursePanel, setCoursePanel] = useState<"goals" | "versions" | null>(null);
  const toggleCoursePanel = useCallback((panel: "goals" | "versions") => {
    document.querySelector<HTMLElement>(".course-embedded-viewer .desktop-shell")
      ?.dispatchEvent(new CustomEvent("roadgen:workbench-sidebar-close"));
    setCoursePanel((current) => current === panel ? null : panel);
  }, []);
  const sidebarPages = useMemo(() => [
    {
      id: "course-goals",
      label: zh ? "目标" : "Goals",
      icon: "TG",
      group: "analysis" as const,
      content: "",
      badge: "P",
      action: () => toggleCoursePanel("goals"),
    },
    {
      id: "course-versions",
      label: zh ? "版本" : "Versions",
      icon: "VR",
      group: "analysis" as const,
      content: "",
      badge: String(revisions.length),
      action: () => toggleCoursePanel("versions"),
    },
  ], [revisions.length, toggleCoursePanel, zh]);
  useEffect(() => {
    const closeForWorkbenchPage = (event: Event) => {
      const pageId = (event as CustomEvent<{ pageId?: string | null }>).detail?.pageId;
      if (pageId && pageId !== "course-goals" && pageId !== "course-versions") {
        queueMicrotask(() => setCoursePanel(null));
      }
    };
    window.addEventListener("roadgen:workbench-sidebar-change", closeForWorkbenchPage);
    return () => window.removeEventListener("roadgen:workbench-sidebar-change", closeForWorkbenchPage);
  }, []);
  useEffect(() => {
    if (!generationJob || ["succeeded", "failed", "cancelled"].includes(generationJob.status)) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await api.request<PlatformJob>(`/api/v1/jobs/${generationJob.id}`);
        if (cancelled) return;
        onJobChange(next);
        if (next.status === "succeeded") {
          await onRefresh();
          if (!cancelled) onJobChange(null);
          return;
        }
        if (["failed", "cancelled"].includes(next.status)) return;
      } catch {
        if (cancelled) return;
      }
      timer = window.setTimeout(poll, 900);
    };
    timer = window.setTimeout(poll, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, generationJob?.id, generationJob?.status]);
  const generate = async () => {
    const job = await api.post<PlatformJob>(`/api/v1/projects/${project.id}/generate`, {
      source_id: source?.id,
      prompt: "Generate a deterministic road baseline from the approved 2D annotation.",
      generation_mode: "baseline",
    });
    onJobChange(job);
  };
  const retry = async () => {
    if (!generationJob) return;
    const retried = await api.post<PlatformJob>(`/api/v1/jobs/${generationJob.id}/retry`, {});
    onJobChange(retried);
  };
  return <div className="course-design-workbench">
    <section className="course-design-viewport">
      {generationJob ? <GenerationProgress job={generationJob} language={language} onRetry={() => void retry()} onBack={onBackToAnnotation} /> : latest ? <CourseViewerWorkbench api={api} project={project} revision={latest} language={language} workflow={workflow} navigation={navigation} sidebarPages={sidebarPages} onRevisionCreated={onRefresh} /> : <div className="course-empty course-design-awaiting"><p>{zh ? "返回03，在共享参考图标注中批准当前标注。" : "Return to 03 and approve the annotation in the shared workbench."}</p></div>}
      <div className="course-design-viewport-bar">
        <div><span>{latest ? `REV ${String(latest.revision_number).padStart(3, "0")}` : (zh ? "2D标注 → 3D" : "2D → 3D")}</span><strong>{latest?.label ?? (zh ? "还没有初始3D版本" : "No generated scene")}</strong><small>{latest ? `${latest.branch_kind} · ${String(latest.provenance?.generation_method ?? "unknown")}` : (zh ? "返回03检查并保存2D标注，系统会直接生成" : "Approve annotations in 03 to generate directly")}</small></div>
        {!latest ? <Button type="primary" disabled={!source || Boolean(generationJob)} onClick={() => void act(zh ? "正在建立初始3D版本…" : "Starting parametric baseline…", generate)}>{zh ? "重新生成初始版本" : "Generate baseline"}</Button> : null}
      </div>
    </section>

    {coursePanel ? <aside className="course-design-external-drawer" data-panel={coursePanel}>
      <header><strong>{coursePanel === "goals" ? (zh ? "目标与优化" : "Goals & optimization") : (zh ? "版本账本" : "Revision ledger")}</strong><button type="button" aria-label={zh ? "关闭抽屉" : "Close drawer"} onClick={() => setCoursePanel(null)}>×</button></header>
      {coursePanel === "goals" ? <div className="course-design-console">
        <header><span className="course-eyebrow">PARAMETRIC DESIGN LOOP</span><h2>{zh ? "调整明确参数，生成下一版" : "Adjust explicit parameters for the next version"}</h2><p>{zh ? "道路骨架和每类家具均使用低、中、高控件；生成不调用 LLM 或 RAG。" : "Road skeleton and furniture use explicit low, medium, and high controls. LLM and RAG are not called."}</p></header>
        <div className="course-design-scores">{(["walkability", "safety", "beauty", "overall"] as const).map((key) => <div key={key}><span>{key}</span><strong>{score(latestEvaluation?.result?.[key])}</strong></div>)}</div>
        <div className="course-design-goals"><div><strong>{zh ? "选择最需要的设计目标" : "Choose your design priorities"}</strong><small>{zh ? "非负权重会在服务器归一化为100%" : "Weights are normalized to 100% on the server"}</small></div>{Object.entries(weights).map(([key, value]) => <label key={key}><span>{key}</span><input type="range" min="0" max="100" value={value} onChange={(event) => setWeights({ ...weights, [key]: Number(event.target.value) })} /><InputNumber min={0} max={100} value={value} onChange={(next) => setWeights({ ...weights, [key]: Number(next ?? 0) })} /></label>)}</div>
        <Button type="primary" size="large" block disabled={Boolean(generationJob) || !latest || !source} onClick={() => { setCoursePanel(null); document.querySelector<HTMLButtonElement>(".course-embedded-viewer #viewer-generate-and-load")?.click(); }}>{zh ? "调整道路与家具参数" : "Adjust road and furniture parameters"}</Button>
        <div className="course-design-secondary"><Button disabled={!latest || !profiles.length} onClick={() => void act(zh ? "正在评价当前版本…" : "Evaluating current revision…", async () => { const payload = await api.post<{ job: PlatformJob }>(`/api/v1/projects/${project.id}/evaluations`, { revision_id: latest?.id, profile_id: profiles[0]?.id, weights }); if (payload.job) await waitForJob(api, payload.job); await onRefresh(); })}>{zh ? "重新评价当前版本" : "Re-evaluate current"}</Button><Button onClick={onNext}>{zh ? "评价详情" : "Metrics detail"}</Button><Button onClick={() => { window.location.hash = "#viewer"; }}>{zh ? "专家编辑器" : "Expert editor"}</Button></div>
      </div> : <div className="course-version-timeline course-design-version-drawer">
        {latest?.glb_artifact_id ? <Button disabled={Boolean(generationJob)} onClick={() => void api.downloadArtifact(latest.glb_artifact_id!, `revision-${latest.revision_number}.glb`)}>{zh ? "下载当前3D场景文件" : "Download current GLB"}</Button> : null}
        {revisions.map((item) => <div key={item.id} data-current={String(item.id === latest?.id)}><span>{String(item.revision_number).padStart(2, "0")}</span><div><strong>{item.label || item.branch_kind}</strong><small>{item.branch_kind} · {String(item.provenance?.generation_method ?? item.evaluation_status)}</small></div></div>)}
      </div>}
    </aside> : null}
  </div>;
}

function EvaluationStage({ api, project, revision, evaluations, profiles, language, act, onRefresh }: { api: CourseApi; project: CourseProject; revision: SceneRevision | null; evaluations: EvaluationRun[]; profiles: EvaluationProfile[]; language: ViewerLanguage; act: any; onRefresh: () => Promise<void> }) {
  const zh = language === "zh";
  const latest = evaluations.find((item) => item.revision_id === revision?.id) ?? evaluations[0];
  const [weights, setWeights] = useState({ walkability: 45, safety: 35, beauty: 20 });
  const metricLabel = (key: string) => zh ? ({ walkability: "步行友好", safety: "安全", beauty: "美观", overall: "综合结果" }[key] ?? key) : key;
  return <div className="course-metrics-layout"><section className="course-score-board">{(["walkability", "safety", "beauty", "overall"] as const).map((key) => <div key={key}><span>{metricLabel(key)}</span><strong>{score(latest?.result?.[key])}</strong>{key !== "overall" ? <small>{Math.round((latest?.weights?.[key] ?? weights[key]) * ((latest?.weights?.[key] ?? 0) <= 1 ? 100 : 1))}%</small> : <small>{latest?.status ?? (zh ? "等待评价" : "pending")}</small>}</div>)}</section><section className="course-weight-editor"><span className="course-eyebrow">{zh ? "设计目标权重" : "CUSTOM METRICS WEIGHTS"}</span>{Object.entries(weights).map(([key, value]) => <label key={key}><span>{metricLabel(key)}</span><InputNumber min={0} max={100} value={value} onChange={(next) => setWeights({ ...weights, [key]: Number(next ?? 0) })} /><em>%</em></label>)}<p>{zh ? "系统会把权重换算为100%；暂时无法计算的结果显示 N/A。" : "The server normalizes non-negative weights. Missing visual metrics remain N/A."}</p><Button type="primary" disabled={!revision || !profiles.length} onClick={() => void act(zh ? "正在重新评分…" : "Re-evaluating…", async () => { const payload = await api.post<{ job: PlatformJob }>(`/api/v1/projects/${project.id}/evaluations`, { revision_id: revision?.id, profile_id: profiles[0]?.id, weights }); if (payload.job) await waitForJob(api, payload.job); await onRefresh(); })}>{zh ? "按当前目标重新评价" : "Re-score revision"}</Button></section></div>;
}

function CompareStage({ api, project, revisions, comparison, setComparison, language, act }: { api: CourseApi; project: CourseProject; revisions: SceneRevision[]; comparison: Record<string, any> | null; setComparison: (value: Record<string, any> | null) => void; language: ViewerLanguage; act: any }) {
  const zh = language === "zh";
  const ordered = [...revisions].sort((a, b) => a.revision_number - b.revision_number);
  return <div className="course-compare-layout"><section className="course-compare-toolbar"><div><span className="course-eyebrow">{zh ? "初始版本 / 人工修改 / AI修改" : "BASELINE / HUMAN / AI"}</span><h2>{zh ? "比较改变，不夸大因果" : "Compare change without overstating causality"}</h2></div><Button disabled={ordered.length < 2} onClick={() => void act(zh ? "正在生成差异…" : "Building comparison…", async () => setComparison(await api.post(`/api/v1/projects/${project.id}/comparisons`, { revision_ids: [ordered[0]?.id, ordered[ordered.length - 1]?.id] })))}>{zh ? "比较首尾版本" : "Compare first / latest"}</Button><Button type="primary" onClick={() => void act(zh ? "正在打包项目…" : "Packaging project…", async () => { const job = await api.post<PlatformJob>(`/api/v1/projects/${project.id}/exports`, {}); const done = await waitForJob(api, job); if (done.status !== "succeeded") throw new Error(done.error); await api.downloadArtifact(done.result.id, `${project.name}.zip`); })}>{zh ? "导出完整项目包" : "Export project bundle"}</Button></section>{comparison ? <section className="course-compare-table">{comparison.items.map((item: any, index: number) => <div key={item.revision.id}><header><span>{index === 0 ? (zh ? "初始版本" : "BASE") : item.revision.branch_kind.toUpperCase()}</span><strong>{zh ? "版本" : "REV"} {item.revision.revision_number}</strong></header>{["walkability", "safety", "beauty", "overall"].map((key) => <p key={key}><span>{key}</span><strong>{score(item.evaluation?.result?.[key])}</strong><em>{item.score_delta?.[key] == null ? "—" : `${item.score_delta[key] >= 0 ? "+" : ""}${item.score_delta[key].toFixed(1)}`}</em></p>)}</div>)}</section> : <div className="course-empty"><p>{zh ? "至少保留两个版本后即可查看指标与操作差异。" : "Keep at least two revisions to inspect score and operation deltas."}</p></div>}</div>;
}
