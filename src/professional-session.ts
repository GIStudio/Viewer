import { CourseApi, type CourseProject, type CourseUser, type PublicProject } from "./course-api";

export type ProfessionalWorkspace = { id: string; name: string; scope: "personal" | "public"; role: string };
export type ProfessionalSessionStatus = "loading" | "guest" | "authenticated" | "error";
export type UserDataExportScope = "configuration" | "full";

export type ProfessionalSessionSnapshot = {
  status: ProfessionalSessionStatus;
  user: CourseUser | null;
  workspace: ProfessionalWorkspace | null;
  projects: CourseProject[];
  publicProjects: PublicProject[];
  currentProjectId: string | null;
  error: string;
};

const CURRENT_PROJECT_KEY = "roadgen3d-professional-project-id";
export const PUBLIC_SESSION_TOKEN_KEY = "roadgen3d-public-session-token";

export class ProfessionalSessionController {
  readonly api = new CourseApi();
  private snapshot: ProfessionalSessionSnapshot = {
    status: "loading",
    user: null,
    workspace: null,
    projects: [],
    publicProjects: [],
    currentProjectId: null,
    error: "",
  };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ProfessionalSessionSnapshot => this.snapshot;

  async ensureReady(): Promise<ProfessionalSessionSnapshot> {
    if (this.snapshot.status !== "loading") {
      if (this.snapshot.status === "error") throw new Error(this.snapshot.error || "Workspace initialization failed.");
      return this.snapshot;
    }
    return new Promise<ProfessionalSessionSnapshot>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        unsubscribe();
        reject(new Error("Workspace initialization timed out."));
      }, 15_000);
      const unsubscribe = this.subscribe(() => {
        if (this.snapshot.status === "loading") return;
        window.clearTimeout(timeout);
        unsubscribe();
        if (this.snapshot.status === "error") reject(new Error(this.snapshot.error || "Workspace initialization failed."));
        else resolve(this.snapshot);
      });
    });
  }

  private set(next: Partial<ProfessionalSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  async initialize(): Promise<void> {
    this.set({ status: "loading", error: "" });
    if (this.api.token) {
      try {
        const user = await this.api.request<CourseUser>("/api/v1/me");
        const workspace = await this.api.request<{ workspace: ProfessionalWorkspace; projects: CourseProject[] }>("/api/v1/workspace");
        await this.applyWorkspace(user, workspace.workspace, workspace.projects);
        return;
      } catch {
        this.api.setToken("");
      }
    }
    try {
      await this.initializeGuest();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.set({ status: "error", error: message, user: null, workspace: null, projects: [], currentProjectId: null });
      throw error;
    }
  }

  private async initializeGuest(): Promise<void> {
    let guestToken = "";
    try { guestToken = window.localStorage.getItem(PUBLIC_SESSION_TOKEN_KEY) ?? ""; } catch { /* storage can be disabled */ }
    if (guestToken) {
      this.api.token = guestToken;
      try {
        const user = await this.api.request<CourseUser>("/api/v1/me");
        const workspace = await this.api.request<{ workspace: ProfessionalWorkspace; projects: CourseProject[] }>("/api/v1/workspace");
        if (user.system_role === "guest" && workspace.workspace.scope === "public") {
          await this.applyWorkspace(user, workspace.workspace, workspace.projects);
          return;
        }
      } catch { /* create a replacement guest below */ }
    }
    this.api.token = "";
    const result = await this.api.post<{ access_token: string; user: CourseUser; workspace: ProfessionalWorkspace }>("/api/v1/auth/guest", {});
    this.api.token = result.access_token;
    try { window.localStorage.setItem(PUBLIC_SESSION_TOKEN_KEY, result.access_token); } catch { /* keep the in-memory identity */ }
    await this.applyWorkspace(result.user, result.workspace, []);
  }

  async login(email: string, password: string): Promise<void> {
    const result = await this.api.post<{ access_token: string; user: CourseUser }>("/api/v1/auth/login", { email, password });
    this.api.setToken(result.access_token);
    const workspace = await this.api.request<{ workspace: ProfessionalWorkspace; projects: CourseProject[] }>("/api/v1/workspace");
    await this.applyWorkspace(result.user, workspace.workspace, workspace.projects);
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
    const result = await this.api.post<{ access_token: string; user: CourseUser; workspace: ProfessionalWorkspace }>("/api/v1/auth/register-personal", {
      display_name: displayName,
      email,
      password,
      invite_code: inviteCode,
    });
    this.api.setToken(result.access_token);
    await this.applyWorkspace(result.user, result.workspace, []);
  }

  async logout(): Promise<void> {
    try {
      await this.api.post<void>("/api/v1/auth/logout", {});
    } catch {
      // Clear a local token even when an expired server session cannot be deleted.
    }
    this.api.setToken("");
    try { window.localStorage.removeItem(CURRENT_PROJECT_KEY); } catch { /* storage can be disabled */ }
    await this.initializeGuest();
  }

  async createProject(name: string, city = "广州"): Promise<CourseProject> {
    const project = await this.api.post<CourseProject>("/api/v1/workspace/projects", { name, city, design_goal: "balanced_street" });
    const projects = [project, ...this.snapshot.projects];
    this.selectProject(project.id, projects);
    await this.refreshPublicProjects().catch(() => []);
    return project;
  }

  async exportUserData(scope: UserDataExportScope): Promise<void> {
    const fallback = scope === "full" ? "roadgen3d-user-full.zip" : "roadgen3d-user-config-2d-history.zip";
    await this.api.downloadAuthenticatedFile(`/api/v1/workspace/exports/${scope}`, fallback);
  }

  selectProject(projectId: string | null, projects = this.snapshot.projects): void {
    const currentProjectId = projectId && projects.some((project) => project.id === projectId) ? projectId : null;
    try {
      if (currentProjectId) window.localStorage.setItem(CURRENT_PROJECT_KEY, currentProjectId);
      else window.localStorage.removeItem(CURRENT_PROJECT_KEY);
    } catch { /* storage can be disabled */ }
    this.set({ projects, currentProjectId });
  }

  async refreshPublicProjects(): Promise<PublicProject[]> {
    const payload = await this.api.request<{ items: PublicProject[] }>("/api/v1/public/projects");
    this.set({ publicProjects: payload.items });
    return payload.items;
  }

  private async applyWorkspace(user: CourseUser, workspace: ProfessionalWorkspace, projects: CourseProject[]): Promise<void> {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(CURRENT_PROJECT_KEY); } catch { /* ignore */ }
    const currentProjectId = projects.some((project) => project.id === saved) ? saved : projects[0]?.id ?? null;
    this.set({
      status: user.system_role === "guest" ? "guest" : "authenticated",
      user,
      workspace,
      projects,
      currentProjectId,
      error: "",
    });
    await this.refreshPublicProjects().catch(() => []);
  }
}

export function createProfessionalSessionController(): ProfessionalSessionController {
  return new ProfessionalSessionController();
}
