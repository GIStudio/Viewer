export const COURSE_TOKEN_KEY = "roadgen3d-course-token";

export type CourseUser = { id: string; email: string; display_name: string; system_role: "student" | "teacher" | "admin" };
export type Course = { id: string; name: string; code: string; role: string; invite_code?: string };
export type CourseProject = { id: string; course_id: string; name: string; city: string; design_goal: string; aoi_bbox: number[] | null; workflow_step: string; role: string };
export type SceneSource = { id: string; kind: string; quality_report: Record<string, any>; provenance: Record<string, any>; role_counts?: Record<string, number>; warnings?: string[]; normalized_artifact_id: string; annotation_artifact_id?: string };
export type SceneRevision = { id: string; revision_number: number; branch_kind: string; label: string; parent_id?: string; layout_artifact_id?: string; glb_artifact_id?: string; evaluation_status: string; provenance?: Record<string, any>; auto_evaluation?: EvaluationRun | null };
export type EvaluationRun = { id: string; revision_id: string; status: string; weights: Record<string, number>; result: Record<string, unknown>; error: string };
export type EvaluationProfile = { id: string; name: string; weights: Record<string, number>; is_default: boolean };
export type PlatformJob = { id: string; kind: string; status: string; progress: number; result: Record<string, any>; error: string };
export type PlatformCapabilities = { llm: { configured: boolean; provider?: string; text?: { configured: boolean; model?: string } }; design_generation: { baseline: string; redesign_default: "llm" | "parametric"; parametric_fallback: boolean } };

export class CourseApi {
  token: string;

  constructor(token = window.localStorage.getItem(COURSE_TOKEN_KEY) ?? "") {
    this.token = token;
  }

  setToken(token: string): void {
    this.token = token;
    if (token) window.localStorage.setItem(COURSE_TOKEN_KEY, token);
    else window.localStorage.removeItem(COURSE_TOKEN_KEY);
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers });
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) {
      const detail = payload.detail;
      throw new Error(String(detail?.message ?? detail ?? payload.message ?? `${response.status} ${response.statusText}`));
    }
    return payload as T;
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  }

  artifactUrl(id: string): string {
    return `/api/v1/artifacts/${encodeURIComponent(id)}`;
  }

  async fetchArtifactBlob(id: string): Promise<Blob> {
    const response = await fetch(this.artifactUrl(id), { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error(`Artifact download failed: ${response.status}`);
    return response.blob();
  }

  async downloadArtifact(id: string, filename: string): Promise<void> {
    const blob = await this.fetchArtifactBlob(id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
