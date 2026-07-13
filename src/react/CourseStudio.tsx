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
  type PlatformJob,
  type SceneRevision,
  type SceneSource,
} from "../course-api";
import type { ViewerLanguage } from "../viewer-i18n";
import { AoiMap } from "./AoiMap";

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

export function CourseStudio({ language }: { language: ViewerLanguage }) {
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
    setProject((current) => projectPayload.items.find((item) => item.id === current?.id) ?? projectPayload.items[0] ?? null);
  }, [api]);

  const refreshProjectData = useCallback(async (projectId: string) => {
    const [sourcePayload, revisionPayload, evaluationPayload, profilePayload] = await Promise.all([
      api.request<{ items: SceneSource[] }>(`/api/v1/projects/${projectId}/sources`),
      api.request<{ items: SceneRevision[] }>(`/api/v1/projects/${projectId}/revisions`),
      api.request<{ items: EvaluationRun[] }>(`/api/v1/projects/${projectId}/evaluations`),
      api.request<{ items: EvaluationProfile[] }>(`/api/v1/projects/${projectId}/evaluation-profiles`),
    ]);
    setSources(sourcePayload.items);
    setRevisions(revisionPayload.items);
    setEvaluations(evaluationPayload.items);
    setProfiles(profilePayload.items);
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

  const selectStep = async (next: StepId) => {
    setStep(next);
    if (project) {
      const updated = await api.patch<CourseProject>(`/api/v1/projects/${project.id}/workflow`, { workflow_step: next }).catch(() => null);
      if (updated) setProject(updated);
    }
  };

  if (!user) {
    return <CourseAuth api={api} language={language} onAuthenticated={refreshProjects} />;
  }

  const latestRevision = revisions[0] ?? null;
  const latestSource = sources[0] ?? null;

  return (
    <div className="course-studio-shell">
      <header className="course-studio-header">
        <div className="course-wordmark"><span>RG</span><div><strong>RoadGen3D</strong><small>{zh ? "城市街道教学工作台" : "Urban street teaching studio"}</small></div></div>
        <div className="course-header-project">
          <span>{zh ? "当前项目" : "Current project"}</span>
          <Select
            value={project?.id}
            placeholder={zh ? "新建一个课程项目" : "Create a course project"}
            options={projects.map((item) => ({ value: item.id, label: `${item.name} · ${item.city}` }))}
            onChange={(id) => setProject(projects.find((item) => item.id === id) ?? null)}
          />
        </div>
        <div className="course-user-block"><div><strong>{user.display_name}</strong><small>{user.system_role}</small></div><Button onClick={() => { api.setToken(""); setUser(null); }}>{zh ? "退出" : "Sign out"}</Button></div>
      </header>

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
            {step === "annotation" ? <AnnotationStage api={api} source={latestSource} language={language} onNext={() => selectStep("design")} /> : null}
            {step === "design" ? <DesignStage api={api} project={project} source={latestSource} revisions={revisions} language={language} act={act} onRefresh={() => refreshProjectData(project.id)} /> : null}
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
  return <div className="course-auth-shell"><section className="course-auth-story"><div className="course-auth-mark">RG<br />3D</div><p>{zh ? "从真实街区开始，保留每一次判断。" : "Begin with a real street. Preserve every design decision."}</p><ol><li>OSM → GeoJSON</li><li>2D → 3D</li><li>Baseline → Edit → Compare</li></ol></section><section className="course-auth-form"><span className="course-eyebrow">ROADGEN3D / COURSE STUDIO</span><h1>{mode === "login" ? (zh ? "继续你的城市设计" : "Continue your urban studio") : mode === "register" ? (zh ? "加入课程" : "Join a course") : (zh ? "初始化课程服务器" : "Initialize server")}</h1><div className="course-auth-fields">{mode !== "login" ? <Input placeholder={zh ? "姓名" : "Display name"} value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /> : null}<Input placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Input.Password placeholder={zh ? "密码（至少8位）" : "Password (8+ characters)"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />{mode === "register" ? <><Input placeholder={zh ? "课程代码" : "Course code"} value={form.course_code} onChange={(event) => setForm({ ...form, course_code: event.target.value })} /><Input placeholder={zh ? "教师邀请码" : "Teacher invitation"} value={form.invite_code} onChange={(event) => setForm({ ...form, invite_code: event.target.value })} /></> : null}{mode === "bootstrap" ? <Input.Password placeholder="ROADGEN_BOOTSTRAP_TOKEN" value={form.bootstrap_token} onChange={(event) => setForm({ ...form, bootstrap_token: event.target.value })} /> : null}</div>{error ? <div className="course-notice" data-tone="error">{error}</div> : null}<Button type="primary" size="large" block loading={busy} onClick={() => void submit()}>{mode === "login" ? (zh ? "登录" : "Sign in") : (zh ? "创建并登录" : "Create and sign in")}</Button><div className="course-auth-switch"><button onClick={() => setMode(mode === "register" ? "login" : "register")}>{mode === "register" ? (zh ? "已有账号" : "I have an account") : (zh ? "使用邀请码注册" : "Register with invite")}</button><button onClick={() => setMode(mode === "bootstrap" ? "login" : "bootstrap")}>{mode === "bootstrap" ? (zh ? "返回登录" : "Back to login") : (zh ? "首次部署" : "First deployment")}</button></div></section></div>;
}

function NewProjectPanel({ api, courses, language, onCreated }: { api: CourseApi; courses: Course[]; language: ViewerLanguage; onCreated: (project: CourseProject) => Promise<void> }) {
  const zh = language === "zh";
  const [bbox, setBbox] = useState(GUANGZHOU_BBOX);
  const [name, setName] = useState(zh ? "广州街道设计练习" : "Guangzhou Street Studio");
  const [city, setCity] = useState(zh ? "广州" : "Guangzhou");
  const [goal, setGoal] = useState("walkable complete street");
  const [busy, setBusy] = useState(false);
  if (!courses.length) return <div className="course-empty"><h2>{zh ? "先创建或加入一门课程" : "Create or join a course first"}</h2><p>{zh ? "教师通过课程 API 创建课程并分享邀请码；学生使用邀请码注册。" : "Teachers create a course and share its invitation code."}</p></div>;
  return <div className="course-project-creator"><div className="course-project-map"><AoiMap bbox={bbox} onChange={setBbox} /><div className="course-map-caption">{zh ? "点击地图移动选区；黄色边界是本次街区范围" : "Click the map to reposition the yellow project area"}</div></div><div className="course-project-form"><span className="course-eyebrow">NEW FIELD PROJECT</span><h1>{zh ? "从一个真实街区开始" : "Start from a real street district"}</h1><label>{zh ? "项目名称" : "Project name"}<Input value={name} onChange={(event) => setName(event.target.value)} /></label><label>{zh ? "城市" : "City"}<Input value={city} onChange={(event) => setCity(event.target.value)} /></label><label>{zh ? "设计目标" : "Design goal"}<Input.TextArea rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} /></label><div className="course-coordinate-grid">{bbox.map((value, index) => <InputNumber key={index} value={value} precision={6} onChange={(next) => setBbox((current) => current.map((item, itemIndex) => itemIndex === index ? Number(next ?? item) : item) as typeof current)} />)}</div><Button type="primary" size="large" loading={busy} onClick={async () => { setBusy(true); try { const created = await api.post<CourseProject>("/api/v1/projects", { course_id: courses[0]!.id, name, city, design_goal: goal, aoi_bbox: bbox }); await onCreated(created); } finally { setBusy(false); } }}>{zh ? "建立项目" : "Create project"}</Button></div></div>;
}

function AreaStage({ project, language }: { project: CourseProject; language: ViewerLanguage }) {
  const zh = language === "zh";
  return <div className="course-stage-grid"><section className="course-map-readonly"><AoiMap bbox={(project.aoi_bbox ?? GUANGZHOU_BBOX) as [number, number, number, number]} onChange={() => undefined} /></section><section className="course-inspector"><span className="course-eyebrow">PROJECT BRIEF</span><dl><dt>{zh ? "城市" : "City"}</dt><dd>{project.city}</dd><dt>{zh ? "目标" : "Goal"}</dt><dd>{project.design_goal}</dd><dt>WGS84 AOI</dt><dd><code>{project.aoi_bbox?.map((item) => item.toFixed(6)).join(" · ")}</code></dd></dl><div className="course-notice">{zh ? "道路和 OSM 背景建筑保持地理锁定；空间修改将在2D标注阶段完成。" : "Roads and OSM context stay georeferenced; edit their geometry in the 2D review stage."}</div></section></div>;
}

function DataStage({ api, project, latestSource, language, act, onRefresh, onNext }: { api: CourseApi; project: CourseProject; latestSource: SceneSource | null; language: ViewerLanguage; act: any; onRefresh: () => Promise<void>; onNext: () => void }) {
  const zh = language === "zh";
  const upload = (file: File) => act(zh ? "正在规范化 GeoJSON…" : "Normalizing GeoJSON…", async () => { const payload = JSON.parse(await file.text()); await api.post(`/api/v1/projects/${project.id}/sources/geojson`, { geojson: payload }); await onRefresh(); });
  return <div className="course-data-layout"><section className="course-action-ledger"><div className="course-action-row"><span>01</span><div><strong>{zh ? "从 OpenStreetMap 获取" : "Fetch from OpenStreetMap"}</strong><p>{zh ? "道路、建筑、POI与土地利用；保存来源和处理日志。" : "Roads, buildings, POI and land use with provenance."}</p></div><Button type="primary" onClick={() => void act(zh ? "正在获取并标注 OSM…" : "Fetching and annotating OSM…", async () => { const job = await api.post<PlatformJob>(`/api/v1/projects/${project.id}/sources/osm`, {}); const done = await waitForJob(api, job); if (done.status !== "succeeded") throw new Error(done.error); await onRefresh(); })}>{zh ? "获取街区" : "Fetch area"}</Button></div><div className="course-action-row"><span>02</span><div><strong>{zh ? "导入普通 GeoJSON" : "Import standard GeoJSON"}</strong><p>EPSG:4326 · stable IDs · automatic roles</p></div><label className="course-file-button"><input type="file" accept=".geojson,.json,application/geo+json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />{zh ? "选择文件" : "Choose file"}</label></div></section><section className="course-quality-panel"><span className="course-eyebrow">NORMALIZATION GATE</span>{latestSource ? <><h2>{latestSource.kind.toUpperCase()}</h2><div className="course-quality-chips"><span data-ok={String(latestSource.quality_report.conversion_ok)}>conversion_ok</span><span data-ok={String(latestSource.quality_report.topology_ok)}>topology_ok</span><span>geo_delta {String(latestSource.quality_report.geo_delta)}m</span></div><Button onClick={() => void api.downloadArtifact(latestSource.normalized_artifact_id, "normalized.geojson")}>{zh ? "下载标准 GeoJSON" : "Download GeoJSON"}</Button><Button type="primary" onClick={onNext}>{zh ? "进入2D检查" : "Review in 2D"}</Button></> : <p>{zh ? "尚未导入数据。" : "No source imported yet."}</p>}</section></div>;
}

function AnnotationStage({ api, source, language, onNext }: { api: CourseApi; source: SceneSource | null; language: ViewerLanguage; onNext: () => void }) {
  const zh = language === "zh";
  if (!source) return <div className="course-empty"><h2>{zh ? "先完成数据导入" : "Import data first"}</h2></div>;
  return <div className="course-annotation-layout"><section><span className="course-eyebrow">AUTO ANNOTATION</span><h2>{zh ? "每项推断都保留来源和置信度" : "Every inferred role keeps its source and confidence"}</h2><div className="course-role-table">{Object.entries(source.role_counts ?? {}).map(([role, count]) => <div key={role}><code>{role}</code><strong>{count}</strong></div>)}</div>{source.warnings?.map((warning) => <div className="course-notice" key={warning}>{warning}</div>)}</section><section className="course-inspector"><h3>{zh ? "审阅操作" : "Review actions"}</h3><Button block onClick={() => { window.location.hash = "#scene-graph"; }}>{zh ? "打开完整2D标注器" : "Open full 2D annotator"}</Button>{source.annotation_artifact_id ? <Button block onClick={() => void api.downloadArtifact(source.annotation_artifact_id!, "reference-annotation.json")}>{zh ? "下载中间标注" : "Download annotation"}</Button> : null}<Button block type="primary" onClick={onNext}>{zh ? "批准并进入3D" : "Approve for 3D"}</Button></section></div>;
}

function DesignStage({ api, project, source, revisions, language, act, onRefresh }: { api: CourseApi; project: CourseProject; source: SceneSource | null; revisions: SceneRevision[]; language: ViewerLanguage; act: any; onRefresh: () => Promise<void> }) {
  const zh = language === "zh";
  const latest = revisions[0];
  return <div className="course-design-layout"><section className="course-design-stage"><div className="course-design-horizon"><span>{latest ? `REV ${String(latest.revision_number).padStart(3, "0")}` : "NO SCENE"}</span><h2>{latest?.label ?? (zh ? "生成一个可编辑基线场景" : "Generate an editable baseline")}</h2><p>{latest ? `${latest.branch_kind} · ${latest.evaluation_status}` : (zh ? "使用已经批准的标注生成3D街道。" : "Generate a 3D street from the approved annotation.")}</p></div><div className="course-design-actions"><Button type="primary" disabled={!source} onClick={() => void act(zh ? "正在生成并评分3D场景…" : "Generating and evaluating 3D scene…", async () => { const job = await api.post<PlatformJob>(`/api/v1/projects/${project.id}/generate`, { source_id: source?.id, prompt: project.design_goal }); const done = await waitForJob(api, job); if (done.status !== "succeeded") throw new Error(done.error); await onRefresh(); })}>{zh ? "生成基线" : "Generate baseline"}</Button>{latest?.glb_artifact_id ? <Button onClick={() => void api.downloadArtifact(latest.glb_artifact_id!, `revision-${latest.revision_number}.glb`)}>{zh ? "下载3D" : "Download 3D"}</Button> : null}<Button onClick={() => { window.location.hash = "#viewer"; }}>{zh ? "进入专家3D查看器" : "Open expert 3D viewer"}</Button></div></section><section className="course-version-timeline">{revisions.map((item) => <div key={item.id}><span>{String(item.revision_number).padStart(2, "0")}</span><div><strong>{item.label || item.branch_kind}</strong><small>{item.branch_kind} · {item.evaluation_status}</small></div></div>)}</section></div>;
}

function EvaluationStage({ api, project, revision, evaluations, profiles, language, act, onRefresh }: { api: CourseApi; project: CourseProject; revision: SceneRevision | null; evaluations: EvaluationRun[]; profiles: EvaluationProfile[]; language: ViewerLanguage; act: any; onRefresh: () => Promise<void> }) {
  const zh = language === "zh";
  const latest = evaluations.find((item) => item.revision_id === revision?.id) ?? evaluations[0];
  const [weights, setWeights] = useState({ walkability: 45, safety: 35, beauty: 20 });
  return <div className="course-metrics-layout"><section className="course-score-board">{(["walkability", "safety", "beauty", "overall"] as const).map((key) => <div key={key}><span>{key}</span><strong>{score(latest?.result?.[key])}</strong>{key !== "overall" ? <small>{Math.round((latest?.weights?.[key] ?? weights[key]) * ((latest?.weights?.[key] ?? 0) <= 1 ? 100 : 1))}%</small> : <small>{latest?.status ?? "pending"}</small>}</div>)}</section><section className="course-weight-editor"><span className="course-eyebrow">CUSTOM METRICS WEIGHTS</span>{Object.entries(weights).map(([key, value]) => <label key={key}><span>{key}</span><InputNumber min={0} max={100} value={value} onChange={(next) => setWeights({ ...weights, [key]: Number(next ?? 0) })} /><em>%</em></label>)}<p>{zh ? "服务器会把非负权重自动归一化；视觉指标不可用时显示 N/A。" : "The server normalizes non-negative weights. Missing visual metrics remain N/A."}</p><Button type="primary" disabled={!revision || !profiles.length} onClick={() => void act(zh ? "正在重新评分…" : "Re-evaluating…", async () => { const payload = await api.post<{ job: PlatformJob }>(`/api/v1/projects/${project.id}/evaluations`, { revision_id: revision?.id, profile_id: profiles[0]?.id, weights }); if (payload.job) await waitForJob(api, payload.job); await onRefresh(); })}>{zh ? "按当前权重重评分" : "Re-score revision"}</Button></section></div>;
}

function CompareStage({ api, project, revisions, comparison, setComparison, language, act }: { api: CourseApi; project: CourseProject; revisions: SceneRevision[]; comparison: Record<string, any> | null; setComparison: (value: Record<string, any> | null) => void; language: ViewerLanguage; act: any }) {
  const zh = language === "zh";
  const ordered = [...revisions].sort((a, b) => a.revision_number - b.revision_number);
  return <div className="course-compare-layout"><section className="course-compare-toolbar"><div><span className="course-eyebrow">BASELINE / HUMAN / AI</span><h2>{zh ? "比较改变，不夸大因果" : "Compare change without overstating causality"}</h2></div><Button disabled={ordered.length < 2} onClick={() => void act(zh ? "正在生成差异…" : "Building comparison…", async () => setComparison(await api.post(`/api/v1/projects/${project.id}/comparisons`, { revision_ids: [ordered[0]?.id, ordered[ordered.length - 1]?.id] })))}>{zh ? "比较首尾版本" : "Compare first / latest"}</Button><Button type="primary" onClick={() => void act(zh ? "正在打包项目…" : "Packaging project…", async () => { const job = await api.post<PlatformJob>(`/api/v1/projects/${project.id}/exports`, {}); const done = await waitForJob(api, job); if (done.status !== "succeeded") throw new Error(done.error); await api.downloadArtifact(done.result.id, `${project.name}.zip`); })}>{zh ? "导出完整项目包" : "Export project bundle"}</Button></section>{comparison ? <section className="course-compare-table">{comparison.items.map((item: any, index: number) => <div key={item.revision.id}><header><span>{index === 0 ? "BASE" : item.revision.branch_kind.toUpperCase()}</span><strong>REV {item.revision.revision_number}</strong></header>{["walkability", "safety", "beauty", "overall"].map((key) => <p key={key}><span>{key}</span><strong>{score(item.evaluation?.result?.[key])}</strong><em>{item.score_delta?.[key] == null ? "—" : `${item.score_delta[key] >= 0 ? "+" : ""}${item.score_delta[key].toFixed(1)}`}</em></p>)}</div>)}</section> : <div className="course-empty"><p>{zh ? "至少保留两个版本后即可查看指标与操作差异。" : "Keep at least two revisions to inspect score and operation deltas."}</p></div>}</div>;
}
