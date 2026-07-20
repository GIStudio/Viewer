import { CourseApi, type CourseProject, type CourseUser } from "./course-api";

export type PersonalWorkspace = { id: string; name: string; scope: "personal"; role: string };
export type ProfessionalSessionStatus = "loading" | "anonymous" | "authenticated" | "error";

export type ProfessionalSessionSnapshot = {
  status: ProfessionalSessionStatus;
  user: CourseUser | null;
  workspace: PersonalWorkspace | null;
  projects: CourseProject[];
  currentProjectId: string | null;
  error: string;
};

const CURRENT_PROJECT_KEY = "roadgen3d-professional-project-id";

export class ProfessionalSessionController {
  readonly api = new CourseApi();
  private snapshot: ProfessionalSessionSnapshot = {
    status: "loading",
    user: null,
    workspace: null,
    projects: [],
    currentProjectId: null,
    error: "",
  };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ProfessionalSessionSnapshot => this.snapshot;

  private set(next: Partial<ProfessionalSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  async initialize(): Promise<void> {
    if (!this.api.token) {
      this.set({ status: "anonymous", user: null, workspace: null, projects: [], currentProjectId: null, error: "" });
      return;
    }
    this.set({ status: "loading", error: "" });
    try {
      const user = await this.api.request<CourseUser>("/api/v1/me");
      const workspace = await this.api.request<{ workspace: PersonalWorkspace; projects: CourseProject[] }>("/api/v1/workspace");
      this.applyAuthenticated(user, workspace.workspace, workspace.projects);
    } catch (error) {
      this.api.setToken("");
      this.set({ status: "anonymous", user: null, workspace: null, projects: [], currentProjectId: null, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async login(email: string, password: string): Promise<void> {
    const result = await this.api.post<{ access_token: string; user: CourseUser }>("/api/v1/auth/login", { email, password });
    this.api.setToken(result.access_token);
    const workspace = await this.api.request<{ workspace: PersonalWorkspace; projects: CourseProject[] }>("/api/v1/workspace");
    this.applyAuthenticated(result.user, workspace.workspace, workspace.projects);
  }

  async bootstrap(displayName: string, email: string, password: string, bootstrapToken: string): Promise<void> {
    await this.api.post("/api/v1/auth/bootstrap", {
      display_name: displayName,
      email,
      password,
      bootstrap_token: bootstrapToken,
    });
    await this.login(email, password);
  }

  bootstrapStatus(): Promise<{ initialized: boolean }> {
    return this.api.request<{ initialized: boolean }>("/api/v1/auth/bootstrap-status");
  }

  async register(displayName: string, email: string, password: string, inviteCode: string): Promise<void> {
    const result = await this.api.post<{ access_token: string; user: CourseUser; workspace: PersonalWorkspace }>("/api/v1/auth/register-personal", {
      display_name: displayName,
      email,
      password,
      invite_code: inviteCode,
    });
    this.api.setToken(result.access_token);
    this.applyAuthenticated(result.user, result.workspace, []);
  }

  async logout(): Promise<void> {
    try {
      await this.api.post<void>("/api/v1/auth/logout", {});
    } catch {
      // Clear a local token even when an expired server session cannot be deleted.
    }
    this.api.setToken("");
    try { window.localStorage.removeItem(CURRENT_PROJECT_KEY); } catch { /* storage can be disabled */ }
    this.set({ status: "anonymous", user: null, workspace: null, projects: [], currentProjectId: null, error: "" });
  }

  async createProject(name: string, city = "广州"): Promise<CourseProject> {
    const project = await this.api.post<CourseProject>("/api/v1/workspace/projects", { name, city, design_goal: "balanced_street" });
    const projects = [project, ...this.snapshot.projects];
    this.selectProject(project.id, projects);
    return project;
  }

  selectProject(projectId: string | null, projects = this.snapshot.projects): void {
    const currentProjectId = projectId && projects.some((project) => project.id === projectId) ? projectId : null;
    try {
      if (currentProjectId) window.localStorage.setItem(CURRENT_PROJECT_KEY, currentProjectId);
      else window.localStorage.removeItem(CURRENT_PROJECT_KEY);
    } catch { /* storage can be disabled */ }
    this.set({ projects, currentProjectId });
  }

  private applyAuthenticated(user: CourseUser, workspace: PersonalWorkspace, projects: CourseProject[]): void {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(CURRENT_PROJECT_KEY); } catch { /* ignore */ }
    const currentProjectId = projects.some((project) => project.id === saved) ? saved : projects[0]?.id ?? null;
    this.set({ status: "authenticated", user, workspace, projects, currentProjectId, error: "" });
  }
}

export function createProfessionalSessionController(): ProfessionalSessionController {
  return new ProfessionalSessionController();
}
