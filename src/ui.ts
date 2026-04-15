/**
 * 统一UI组件模块
 * 为viewer的三个子页面(viewer/scene-graph/asset-editor)提供一致的UI设计
 */

// 路由类型
export type AppRoute = "viewer" | "scene-graph" | "asset-editor";

interface RouteConfig {
  id: AppRoute;
  label: string;
  path: string;
  kicker: string;
  title: string;
  subtitle?: string;
}

interface HeaderOptions {
  showControls?: boolean;
  showSettings?: boolean;
  customActions?: string;
  compact?: boolean;
}

const ROUTES: Record<AppRoute, RouteConfig> = {
  viewer: {
    id: "viewer",
    label: "3D Viewer",
    path: "",
    kicker: "RoadGen3D",
    title: "3D Road Viewer",
  },
  "scene-graph": {
    id: "scene-graph",
    label: "Annotation",
    path: "#scene-graph",
    kicker: "Viewer / Reference",
    title: "Reference Plan Annotator",
    subtitle: "先校准道路总宽与参考图，再把中心线拆成车道、步行带、门前预留和街道家具点位，最后导出 JSON 并转换成带详细横断面的道路 graph。",
  },
  "asset-editor": {
    id: "asset-editor",
    label: "Asset Editor",
    path: "#asset-editor",
    kicker: "Viewer / 3D Assets",
    title: "3D Asset Editor",
    subtitle: "Browse, inspect, and manage project 3D assets",
  },
};

function getCurrentRoute(): AppRoute {
  const hash = window.location.hash;
  if (hash === "#scene-graph") return "scene-graph";
  if (hash === "#asset-editor") return "asset-editor";
  return "viewer";
}

function navigateTo(route: AppRoute): void {
  const config = ROUTES[route];
  if (route === "viewer") {
    window.location.hash = "";
  } else {
    window.location.hash = config.path;
  }
}

function buildHeaderHTML(
  route: AppRoute,
  options: HeaderOptions = {}
): string {
  const config = ROUTES[route];
  const {
    showControls = false,
    showSettings = false,
    customActions = "",
    compact = false,
  } = options;

  const controlsHTML = showControls ? `
    <select id="layout-select" class="viewer-select viewer-select-inline" title="Recent Result"></select>
    <select id="scene-select" class="viewer-select viewer-select-inline" title="Scene"></select>
  ` : "";

  const settingsHTML = showSettings ? `
    <button id="viewer-settings-toggle" class="viewer-settings-toggle" type="button" aria-expanded="false">Settings</button>
  ` : "";

  // 构建导航按钮
  const navButtons = Object.entries(ROUTES)
    .filter(([key]) => key !== route)
    .map(([_, cfg]) => {
      if (cfg.id === "viewer") {
        return `<button data-nav="${cfg.id}" class="viewer-nav-button" type="button">${cfg.label}</button>`;
      }
      return `<button data-nav="${cfg.id}" class="viewer-nav-button" type="button">${cfg.label}</button>`;
    })
    .join("");

  if (compact) {
    // 紧凑模式：用于3D Viewer
    return `
      <div class="scene-page-topbar viewer-header-compact">
        <div class="viewer-header-left">
          <button id="viewer-menu-toggle" class="viewer-hamburger" type="button" aria-label="Menu" aria-expanded="false">☰</button>
          <div class="viewer-header-brand">
            <div class="scene-page-kicker viewer-header-kicker">${config.kicker}</div>
            <h1 class="scene-page-title viewer-header-title">${config.title}</h1>
          </div>
        </div>
        <div class="viewer-header-controls">
          ${controlsHTML}
        </div>
        <div class="viewer-header-actions">
          ${settingsHTML}
          ${customActions}
        </div>
        ${buildMenuDropdown(route)}
      </div>
    `;
  } else {
    // 完整模式：用于scene-graph和asset-editor
    return `
      <div class="scene-page-topbar viewer-header-full">
        <div class="viewer-header-full-left">
          <button id="viewer-menu-toggle" class="viewer-hamburger" type="button" aria-label="Menu" aria-expanded="false">☰</button>
          <div class="viewer-header-full-info">
            <div class="scene-page-kicker">${config.kicker}</div>
            <h1 class="scene-page-title">${config.title}</h1>
            ${config.subtitle ? `<p class="scene-page-subtitle">${config.subtitle}</p>` : ""}
          </div>
        </div>
        <div class="viewer-header-full-actions">
          ${customActions}
        </div>
        ${buildMenuDropdown(route)}
      </div>
    `;
  }
}

function buildMenuDropdown(currentRoute: AppRoute): string {
  const menuItems = Object.entries(ROUTES).map(([key, cfg]) => {
    const isActive = key === currentRoute;
    return `<button data-nav="${key}" class="viewer-nav-button viewer-menu-button ${isActive ? "viewer-menu-button-active" : ""}" type="button" ${isActive ? "disabled" : ""}>${cfg.label}</button>`;
  }).join("");

  const shortcuts = currentRoute === "viewer"
    ? "Click to capture mouse · WASD move · Shift sprint · Esc unlock · R reset · P panel"
    : "Click to select · Scroll to zoom · Drag to pan · Esc to deselect";

  return `
    <div id="viewer-menu-dropdown" class="viewer-menu-dropdown" hidden>
      <div class="viewer-menu-help">${shortcuts}</div>
      <div class="viewer-menu-buttons">
        ${menuItems}
      </div>
    </div>
  `;
}

function setupMenuToggle(root: HTMLElement): void {
  const menuToggle = root.querySelector<HTMLButtonElement>("#viewer-menu-toggle");
  const menuDropdown = root.querySelector<HTMLElement>("#viewer-menu-dropdown");

  if (!menuToggle || !menuDropdown) return;

  menuToggle.addEventListener("click", () => {
    const isHidden = menuDropdown.hidden;
    menuDropdown.hidden = !isHidden;
    menuToggle.setAttribute("aria-expanded", isHidden ? "true" : "false");
  });

  // 点击外部关闭
  document.addEventListener("click", (event) => {
    if (
      !menuToggle.contains(event.target as Node) &&
      !menuDropdown.contains(event.target as Node)
    ) {
      menuDropdown.hidden = true;
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });
}

function setupNavigation(root: HTMLElement): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-nav]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.nav as AppRoute;
      navigateTo(route);
    });
  });
}

function mountAppHeader(
  root: HTMLElement,
  route: AppRoute,
  options: HeaderOptions = {}
): void {
  root.insertAdjacentHTML("afterbegin", buildHeaderHTML(route, options));
  setupMenuToggle(root);
  setupNavigation(root);
}

// 导出
export { mountAppHeader, setupMenuToggle, setupNavigation, navigateTo, getCurrentRoute, ROUTES };
export type { RouteConfig, HeaderOptions };
