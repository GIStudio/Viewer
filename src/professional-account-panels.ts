import type { ViewerLanguage } from "./viewer-i18n";
import type { ProfessionalSessionController } from "./professional-session";
import type { PublicProject } from "./course-api";

type Panel = { element: HTMLElement; destroy: () => void };
const text = (language: ViewerLanguage, zh: string, en: string): string => language === "zh" ? zh : en;
const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character] ?? character));

function formField(label: string, name: string, type = "text", required = true): string {
  return `<label class="professional-account-field"><span>${label}</span><input name="${name}" type="${type}" ${required ? "required" : ""} /></label>`;
}

export function createProfessionalAccountPanel(
  session: ProfessionalSessionController,
  language: ViewerLanguage,
  options: { onSaveCurrent?: () => Promise<void> } = {},
): Panel {
  const element = document.createElement("div");
  element.className = "professional-account-panel";
  let mode: "login" | "register" | "bootstrap" = "login";
  let bootstrapAvailable = false;
  let busy = false;
  let message = "";
  let showAuth = false;
  const render = () => {
    const snapshot = session.getSnapshot();
    const zh = language === "zh";
    const guest = snapshot.status === "guest";
    if ((snapshot.status === "authenticated" || guest) && snapshot.user && !(guest && showAuth)) {
      const projects = snapshot.projects.map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === snapshot.currentProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("");
      element.innerHTML = `
        <section class="professional-account-summary">
          <p class="workbench-panel-kicker">${guest ? (zh ? "访客公共身份" : "GUEST PUBLIC IDENTITY") : (zh ? "个人账户" : "PERSONAL ACCOUNT")}</p>
          <h3>${escapeHtml(snapshot.user.display_name)}</h3>
          ${guest ? `<p>${zh ? "无需登录；此浏览器持有项目编辑权。" : "No sign-in required; this browser owns the edit capability."}</p>` : `<p>${escapeHtml(snapshot.user.email)}</p>`}
          <p class="professional-account-role">${guest ? (zh ? "公共空间 · 永久公开" : "Public space · permanently visible") : snapshot.user.system_role === "admin" ? (zh ? "系统管理员" : "System administrator") : (zh ? "个人专业工作区" : "Personal professional workspace")}</p>
        </section>
        <section class="professional-account-projects">
          <h4>${guest ? (zh ? "本浏览器创建的公共项目" : "Public projects from this browser") : (zh ? "我的项目" : "My projects")}</h4>
          <select data-account-project ${projects ? "" : "disabled"}><option value="">${projects ? "" : (zh ? "尚无项目" : "No projects yet")}</option>${projects}</select>
          <form data-account-create class="professional-account-inline-form">
            <input name="name" required maxlength="180" placeholder="${zh ? "新项目名称" : "New project name"}" />
            <button type="submit" ${busy ? "disabled" : ""}>${zh ? "新建项目" : "New project"}</button>
          </form>
          <p class="professional-account-note">${guest ? (zh ? "项目与产物公开可见；只有持有本浏览器访客身份的人可以继续编辑。" : "Projects and artifacts are public; only this browser guest identity can edit them.") : (zh ? "项目、场景版本、资产列表和评价结果仅对你的账户可见。" : "Projects, scene revisions, palettes, and evaluation results are private to your account.")}</p>
        </section>
        ${options.onSaveCurrent ? `<button type="button" data-account-save class="professional-account-secondary" ${busy ? "disabled" : ""}>${guest ? (zh ? "保存当前2D标注到公共项目" : "Save current 2D annotation to a public project") : (zh ? "保存当前2D标注到我的项目" : "Save current 2D annotation to my project")}</button>` : ""}
        ${guest ? `<button type="button" data-account-auth-open class="professional-account-secondary">${zh ? "登录私人空间" : "Sign in to a private workspace"}</button>` : `<button type="button" data-account-logout class="professional-account-secondary">${zh ? "退出登录" : "Sign out"}</button>`}
        ${message ? `<p role="status" class="professional-account-message">${message}</p>` : ""}`;
      element.querySelector<HTMLSelectElement>("[data-account-project]")?.addEventListener("change", (event) => {
        session.selectProject((event.currentTarget as HTMLSelectElement).value || null);
      });
      element.querySelector<HTMLFormElement>("[data-account-create]")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget as HTMLFormElement).get("name") || "").trim();
        if (!name) return;
        busy = true; message = ""; render();
        void session.createProject(name).then(() => {
          busy = false; message = zh ? "已创建并选中项目。" : "Project created and selected."; render();
        }).catch((error) => {
          busy = false; message = error instanceof Error ? error.message : String(error); render();
        });
      });
      element.querySelector<HTMLButtonElement>("[data-account-logout]")?.addEventListener("click", () => void session.logout());
      element.querySelector<HTMLButtonElement>("[data-account-auth-open]")?.addEventListener("click", () => { showAuth = true; mode = "login"; message = ""; render(); });
      element.querySelector<HTMLButtonElement>("[data-account-save]")?.addEventListener("click", () => {
        busy = true; message = ""; render();
        void options.onSaveCurrent?.().then(() => {
          message = guest
            ? (zh ? "当前2D标注已保存到所选公共项目。" : "The current 2D annotation has been saved to the selected public project.")
            : (zh ? "当前2D标注已保存到所选个人项目。" : "The current 2D annotation has been saved to the selected personal project.");
        }).catch((error) => {
          message = error instanceof Error ? error.message : String(error);
        }).finally(() => { busy = false; render(); });
      });
      return;
    }
    const registerMode = mode === "register";
    const bootstrapMode = mode === "bootstrap";
    const title = bootstrapMode
      ? (zh ? "初始化系统管理员" : "Initialize the system administrator")
      : registerMode ? (zh ? "使用邀请码创建个人账户" : "Create a personal account with an invite") : (zh ? "登录专业工作台" : "Sign in to the professional workbench");
    element.innerHTML = `
      <section class="professional-account-summary">
        <p class="workbench-panel-kicker">${zh ? "账户与项目" : "ACCOUNT & PROJECTS"}</p>
        <h3>${title}</h3>
        <p>${guest
          ? (zh ? "你可以继续使用完整专业流程；登录只用于切换到私有个人项目。" : "The full professional workflow remains available; sign in only to switch to private personal projects.")
          : (zh ? "登录后，所有工作将保存到仅自己可见的项目。" : "Sign in to save work in projects visible only to you.")}</p>
      </section>
      <form data-account-auth class="professional-account-form">
        ${(registerMode || bootstrapMode) ? formField(zh ? "姓名" : "Name", "display_name") : ""}
        ${formField(zh ? "邮箱" : "Email", "email", "email")}
        ${formField(zh ? "密码" : "Password", "password", "password")}
        ${registerMode ? formField(zh ? "管理员邀请码" : "Administrator invite", "invite_code") : ""}
        ${bootstrapMode ? formField(zh ? "部署初始化令牌" : "Deployment bootstrap token", "bootstrap_token", "password") : ""}
        <button type="submit" ${busy ? "disabled" : ""}>${bootstrapMode ? (zh ? "创建管理员" : "Create administrator") : registerMode ? (zh ? "创建账户" : "Create account") : (zh ? "登录" : "Sign in")}</button>
      </form>
      <button type="button" data-account-mode class="professional-account-secondary">${registerMode || bootstrapMode ? (zh ? "已有账户？去登录" : "Already have an account? Sign in") : (zh ? "使用邀请码注册" : "Register with an invite")}</button>
      ${guest ? `<button type="button" data-account-auth-back class="professional-account-secondary">${zh ? "返回公共空间" : "Back to public space"}</button>` : ""}
      ${bootstrapAvailable && !bootstrapMode ? `<button type="button" data-account-bootstrap class="professional-account-secondary">${zh ? "首次部署：初始化管理员" : "First deployment: initialize administrator"}</button>` : ""}
      ${message || snapshot.error ? `<p role="alert" class="professional-account-message" data-tone="error">${message || snapshot.error}</p>` : ""}`;
    element.querySelector<HTMLButtonElement>("[data-account-mode]")?.addEventListener("click", () => { mode = mode === "login" ? "register" : "login"; message = ""; render(); });
    element.querySelector<HTMLButtonElement>("[data-account-auth-back]")?.addEventListener("click", () => { showAuth = false; message = ""; render(); });
    element.querySelector<HTMLButtonElement>("[data-account-bootstrap]")?.addEventListener("click", () => { mode = "bootstrap"; message = ""; render(); });
    element.querySelector<HTMLFormElement>("[data-account-auth]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      busy = true; message = ""; render();
      const action = bootstrapMode
        ? session.bootstrap(String(data.get("display_name") || ""), String(data.get("email") || ""), String(data.get("password") || ""), String(data.get("bootstrap_token") || ""))
        : registerMode
        ? session.register(String(data.get("display_name") || ""), String(data.get("email") || ""), String(data.get("password") || ""), String(data.get("invite_code") || ""))
        : session.login(String(data.get("email") || ""), String(data.get("password") || ""));
      void action.catch((error) => { message = error instanceof Error ? error.message : String(error); }).finally(() => { busy = false; render(); });
    });
  };
  render();
  void session.bootstrapStatus().then((status) => {
    bootstrapAvailable = !status.initialized;
    render();
  }).catch(() => undefined);
  const unsubscribe = session.subscribe(render);
  return { element, destroy: unsubscribe };
}

export function createProfessionalPublicSpacePanel(
  session: ProfessionalSessionController,
  language: ViewerLanguage,
  options: {
    onOpen: (project: PublicProject) => Promise<void>;
    onExportOwned: (project: PublicProject) => Promise<void>;
  },
): Panel {
  const element = document.createElement("div");
  element.className = "professional-public-space";
  let busyId = "";
  let message = "";
  const render = () => {
    const snapshot = session.getSnapshot();
    const zh = language === "zh";
    const ownedIds = new Set(snapshot.projects.map((project) => project.id));
    const cards = snapshot.publicProjects.map((project) => {
      const owned = ownedIds.has(project.id);
      const revision = project.latest_revision;
      const bundle = project.latest_bundle;
      return `<article class="professional-public-card" data-owned="${String(owned)}">
        <header><span>${owned ? (zh ? "可编辑" : "EDITABLE") : (zh ? "只读" : "READ ONLY")}</span><time>${escapeHtml(new Date(project.updated_at).toLocaleDateString())}</time></header>
        <h4>${escapeHtml(project.name)}</h4>
        <p>${escapeHtml(project.city)} · ${escapeHtml(project.author)}</p>
        <small>${escapeHtml(project.design_goal)}</small>
        <div class="professional-public-card-actions">
          <button type="button" data-public-open="${escapeHtml(project.id)}" ${revision ? "" : "disabled"}>${zh ? "打开最新3D场景" : "Open latest 3D scene"}</button>
          ${bundle ? `<a href="${escapeHtml(bundle.download_url)}" download>${zh ? "下载项目包" : "Download bundle"}</a>` : owned ? `<button type="button" data-public-export="${escapeHtml(project.id)}">${zh ? "生成项目包" : "Build bundle"}</button>` : ""}
        </div>
      </article>`;
    }).join("");
    element.innerHTML = `<section class="professional-public-intro">
      <p class="workbench-panel-kicker">${zh ? "公共空间" : "PUBLIC SPACE"}</p>
      <h3>${zh ? "公开的街道设计与可复查版本" : "Public street designs and traceable revisions"}</h3>
      <p>${zh ? "所有人都可以查看和下载；标记为“可编辑”的项目只属于当前浏览器访客身份。" : "Everyone can inspect and download. Editable projects belong only to this browser guest identity."}</p>
      <button type="button" data-public-refresh>${zh ? "刷新公共空间" : "Refresh public space"}</button>
    </section>${message ? `<p class="professional-account-message">${escapeHtml(message)}</p>` : ""}<div class="professional-public-grid">${cards || `<p>${zh ? "还没有公共项目。" : "No public projects yet."}</p>`}</div>`;
    element.querySelector<HTMLButtonElement>("[data-public-refresh]")?.addEventListener("click", () => {
      void session.refreshPublicProjects().catch((error) => { message = error instanceof Error ? error.message : String(error); render(); });
    });
    element.querySelectorAll<HTMLButtonElement>("[data-public-open]").forEach((button) => button.addEventListener("click", () => {
      const project = snapshot.publicProjects.find((item) => item.id === button.dataset.publicOpen);
      if (!project || busyId) return;
      busyId = project.id; message = zh ? "正在载入公共场景…" : "Loading public scene…"; render();
      void options.onOpen(project).catch((error) => { message = error instanceof Error ? error.message : String(error); }).finally(() => { busyId = ""; render(); });
    }));
    element.querySelectorAll<HTMLButtonElement>("[data-public-export]").forEach((button) => button.addEventListener("click", () => {
      const project = snapshot.publicProjects.find((item) => item.id === button.dataset.publicExport);
      if (!project || busyId) return;
      busyId = project.id; message = zh ? "正在生成公开项目包…" : "Building public project bundle…"; render();
      void options.onExportOwned(project).then(() => session.refreshPublicProjects()).then(() => { message = zh ? "项目包已进入公共空间。" : "The bundle is now public."; }).catch((error) => { message = error instanceof Error ? error.message : String(error); }).finally(() => { busyId = ""; render(); });
    }));
  };
  render();
  const unsubscribe = session.subscribe(render);
  return { element, destroy: unsubscribe };
}

export function createProfessionalAdminPanel(session: ProfessionalSessionController, language: ViewerLanguage): Panel {
  const element = document.createElement("div");
  element.className = "professional-admin-panel";
  let busy = false;
  let error = "";
  let overview: Record<string, any> | null = null;
  let users: Array<Record<string, any>> = [];
  let invites: Array<Record<string, any>> = [];
  let query = "";
  let selectedUser: Record<string, any> | null = null;
  const load = async () => {
    if (session.getSnapshot().user?.system_role !== "admin") return;
    busy = true; error = ""; render();
    try {
      const [nextOverview, nextUsers, nextInvites] = await Promise.all([
        session.api.request<Record<string, any>>("/api/v1/admin/overview"),
        session.api.request<{ items: Array<Record<string, any>> }>(`/api/v1/admin/users?limit=50&query=${encodeURIComponent(query)}`),
        session.api.request<{ items: Array<Record<string, any>> }>("/api/v1/admin/registration-invites"),
      ]);
      overview = nextOverview; users = nextUsers.items; invites = nextInvites.items;
    } catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
    busy = false; render();
  };
  const render = () => {
    const zh = language === "zh";
    const summary = overview ? `
      <div class="professional-admin-metrics">
        <span><b>${overview.users?.total ?? 0}</b>${zh ? "用户" : "users"}</span>
        <span><b>${overview.projects?.personal ?? 0}</b>${zh ? "个人项目" : "personal projects"}</span>
        <span><b>${overview.jobs?.failed ?? 0}</b>${zh ? "失败任务" : "failed jobs"}</span>
      </div>` : "";
    const rows = users.map((user) => `<tr><td><button class="professional-admin-user-link" data-admin-detail="${escapeHtml(user.id)}">${escapeHtml(user.display_name)}</button><small>${escapeHtml(user.email)}</small></td><td>${escapeHtml(user.project_count)} / ${escapeHtml(user.revision_count)}</td><td>${escapeHtml(user.storage_bytes)}</td><td><button data-admin-user="${escapeHtml(user.id)}" data-active="${Boolean(user.is_active)}">${user.is_active ? (zh ? "停用" : "Suspend") : (zh ? "启用" : "Enable")}</button></td></tr>`).join("");
    const details = selectedUser ? `<section class="professional-admin-user-detail"><h4>${zh ? "用户详情（运营元数据）" : "User detail (operational metadata)"}</h4><p>${escapeHtml(selectedUser.display_name)} · ${escapeHtml(selectedUser.last_activity_at ?? "—")}</p><ul>${(selectedUser.projects ?? []).map((project: Record<string, unknown>) => `<li>${escapeHtml(project.name)} · ${escapeHtml(project.workflow_step)} · ${escapeHtml(project.revision_count)} ${zh ? "个版本" : "revisions"} · ${escapeHtml(project.latest_job_status ?? "—")}</li>`).join("") || `<li>${zh ? "没有可展示的项目元数据" : "No project metadata available"}</li>`}</ul></section>` : "";
    const inviteRows = invites.map((invite) => `<li>${escapeHtml(invite.used_count)}/${escapeHtml(invite.max_uses)} · ${invite.is_active ? (zh ? "有效" : "active") : (zh ? "已失效" : "inactive")} <button data-admin-revoke="${escapeHtml(invite.id)}" ${invite.is_active ? "" : "disabled"}>${zh ? "撤销" : "Revoke"}</button></li>`).join("");
    element.innerHTML = `
      <section class="professional-account-summary"><p class="workbench-panel-kicker">${zh ? "系统管理" : "SYSTEM ADMINISTRATION"}</p><h3>${zh ? "用户与使用情况" : "Users and usage"}</h3><p>${zh ? "这里仅显示运营元数据；不会打开用户私有场景或下载其制品。" : "This view exposes operational metadata only; it cannot open private scenes or artifacts."}</p></section>
      ${summary}
      <div class="professional-admin-actions"><button data-admin-refresh ${busy ? "disabled" : ""}>${zh ? "刷新" : "Refresh"}</button><button data-admin-invite ${busy ? "disabled" : ""}>${zh ? "创建一次性邀请码" : "Create one-time invite"}</button></div>
      ${error ? `<p role="alert" class="professional-account-message" data-tone="error">${error}</p>` : ""}
      <section><h4>${zh ? "用户" : "Users"}</h4><form data-admin-search class="professional-account-inline-form"><input name="query" value="${escapeHtml(query)}" placeholder="${zh ? "搜索姓名或邮箱" : "Search name or email"}" /><button type="submit">${zh ? "搜索" : "Search"}</button></form><table><thead><tr><th>${zh ? "账户" : "Account"}</th><th>${zh ? "项目 / 版本" : "Projects / revisions"}</th><th>${zh ? "存储" : "Storage"}</th><th>${zh ? "状态" : "Status"}</th></tr></thead><tbody>${rows || `<tr><td colspan="4">${busy ? (zh ? "正在读取…" : "Loading…") : (zh ? "暂无用户" : "No users")}</td></tr>`}</tbody></table></section>
      ${details}
      <section><h4>${zh ? "邀请码" : "Registration invites"}</h4><ul class="professional-admin-invites">${inviteRows || `<li>${zh ? "暂无邀请码" : "No invites"}</li>`}</ul></section>`;
    element.querySelector<HTMLButtonElement>("[data-admin-refresh]")?.addEventListener("click", () => void load());
    element.querySelector<HTMLFormElement>("[data-admin-search]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      query = String(new FormData(event.currentTarget as HTMLFormElement).get("query") || "").trim();
      selectedUser = null;
      void load();
    });
    element.querySelector<HTMLButtonElement>("[data-admin-invite]")?.addEventListener("click", () => {
      const note = window.prompt(zh ? "邀请码备注（可选）" : "Invite note (optional)") ?? "";
      void session.api.post<{ invite_code: string }>("/api/v1/admin/registration-invites", { max_uses: 1, expires_in_hours: 72, note }).then((invite) => {
        window.prompt(zh ? "请复制邀请码（只显示一次）" : "Copy this invitation code (shown once)", invite.invite_code);
        return load();
      }).catch((reason) => { error = reason instanceof Error ? reason.message : String(reason); render(); });
    });
    element.querySelectorAll<HTMLButtonElement>("[data-admin-user]").forEach((button) => button.addEventListener("click", () => {
      void session.api.post(`/api/v1/admin/users/${button.dataset.adminUser}/status`, { is_active: button.dataset.active !== "true" }).then(load).catch((reason) => { error = reason instanceof Error ? reason.message : String(reason); render(); });
    }));
    element.querySelectorAll<HTMLButtonElement>("[data-admin-detail]").forEach((button) => button.addEventListener("click", () => {
      void session.api.request<Record<string, any>>(`/api/v1/admin/users/${encodeURIComponent(button.dataset.adminDetail ?? "")}`).then((detail) => { selectedUser = detail; render(); }).catch((reason) => { error = reason instanceof Error ? reason.message : String(reason); render(); });
    }));
    element.querySelectorAll<HTMLButtonElement>("[data-admin-revoke]").forEach((button) => button.addEventListener("click", () => {
      void session.api.post(`/api/v1/admin/registration-invites/${button.dataset.adminRevoke}/revoke`, {}).then(load).catch((reason) => { error = reason instanceof Error ? reason.message : String(reason); render(); });
    }));
  };
  render();
  const unsubscribe = session.subscribe(() => { void load(); });
  void load();
  return { element, destroy: unsubscribe };
}
