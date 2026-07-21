import { describeApiRequest } from "./api-origin";

export const SESSION_TOKEN_KEY = "roadgen3d-session-token";
/** @deprecated compatibility alias for existing Course Studio imports. */
export const COURSE_TOKEN_KEY = SESSION_TOKEN_KEY;
const LEGACY_COURSE_TOKEN_KEY = "roadgen3d-course-token";

export type CourseUser = { id: string; email: string; display_name: string; system_role: "guest" | "student" | "teacher" | "admin"; is_active?: boolean };
export type Course = { id: string; name: string; code: string; role: string; invite_code?: string };
export type CourseProject = { id: string; course_id: string; name: string; city: string; design_goal: string; aoi_bbox: number[] | null; workflow_step: string; role: string };
export type PublicProject = {
  id: string;
  name: string;
  city: string;
  design_goal: string;
  workflow_step: string;
  author: string;
  updated_at: string;
  latest_revision: SceneRevision | null;
  latest_evaluation: EvaluationRun | null;
  latest_bundle: { id: string; download_url: string; media_type: string; byte_size: number } | null;
};
export type SceneSource = { id: string; kind: string; quality_report: Record<string, any>; provenance: Record<string, any>; role_counts?: Record<string, number>; warnings?: string[]; normalized_artifact_id: string; annotation_artifact_id?: string };
export type SceneRevision = { id: string; revision_number: number; branch_kind: string; label: string; parent_id?: string; layout_artifact_id?: string; glb_artifact_id?: string; evaluation_status: string; commands?: Array<Record<string, any>>; provenance?: Record<string, any>; auto_evaluation?: EvaluationRun | null; created_at?: string };
export type EvaluationRun = { id: string; revision_id: string; status: string; weights: Record<string, number>; result: Record<string, unknown>; error: string };
export type EvaluationProfile = { id: string; name: string; weights: Record<string, number>; is_default: boolean };
export type JobOperation = { timestamp: string; stage: string; progress: number; message: string; detail: Record<string, unknown> };
export type PublicJobFailure = {
  code: "scene_generation_failed" | "invalid_scene_source" | "service_unavailable";
  user_message: string;
  retryable: boolean;
  debug_reference: string;
};
export type PlatformJob = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  stage: string;
  message: string;
  detail: Record<string, unknown>;
  operations: JobOperation[];
  result: Record<string, any>;
  error: string;
  created_at: string;
  updated_at: string;
};

export function platformJobFailure(job: PlatformJob): PublicJobFailure | null {
  const candidate = job.detail?.failure;
  if (!candidate || typeof candidate !== "object") return null;
  const failure = candidate as Partial<PublicJobFailure>;
  if (
    !["scene_generation_failed", "invalid_scene_source", "service_unavailable"].includes(String(failure.code))
    || typeof failure.user_message !== "string"
    || typeof failure.retryable !== "boolean"
    || typeof failure.debug_reference !== "string"
  ) return null;
  return failure as PublicJobFailure;
}
export type PlatformCapabilities = { llm: { configured: boolean; provider?: string; text?: { configured: boolean; model?: string } }; design_generation: { baseline: string; redesign_default: "llm" | "parametric"; parametric_fallback: boolean } };

export class CourseApi {
  token: string;

  constructor(token = "") {
    const stored = window.localStorage.getItem(SESSION_TOKEN_KEY) ?? window.localStorage.getItem(LEGACY_COURSE_TOKEN_KEY) ?? "";
    this.token = token || stored;
    if (this.token && !window.localStorage.getItem(SESSION_TOKEN_KEY)) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, this.token);
      window.localStorage.removeItem(LEGACY_COURSE_TOKEN_KEY);
    }
  }

  setToken(token: string): void {
    this.token = token;
    if (token) {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
      window.localStorage.removeItem(LEGACY_COURSE_TOKEN_KEY);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      window.localStorage.removeItem(LEGACY_COURSE_TOKEN_KEY);
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await fetch(path, { ...init, headers });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`RoadGen3D API is unavailable at ${describeApiRequest(path)} (${reason}).`);
    }
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
