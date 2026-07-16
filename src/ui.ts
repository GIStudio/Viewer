/**
 * 统一UI组件模块
 * 为viewer的三个子页面(viewer/scene-graph/asset-editor)提供一致的UI设计
 */

// 路由类型
export type AppRoute = "course-studio" | "viewer" | "scene-graph" | "asset-editor" | "model-input-browser";

interface RouteConfig {
  id: AppRoute;
  index: string;
  group: "course" | "professional";
  label: string;
  labelZh: string;
  path: string;
  kicker: string;
  title: string;
  titleZh: string;
  subtitle?: string;
  subtitleZh?: string;
}

interface HeaderOptions {
  showControls?: boolean;
  showSettings?: boolean;
  customActions?: string;
  compact?: boolean;
}

const ROUTES: Record<AppRoute, RouteConfig> = {
  "course-studio": {
    id: "course-studio",
    index: "CS",
    group: "course",
    label: "Course Studio",
    labelZh: "课程工作台",
    path: "#course-studio",
    kicker: "RoadGen3D / Course",
    title: "Urban Street Teaching Studio",
    titleZh: "城市街道教学工作台",
  },
  viewer: {
    id: "viewer",
    index: "3D",
    group: "professional",
    label: "3D Scene Workbench",
    labelZh: "3D 场景工作台",
    path: "",
    kicker: "RoadGen3D",
    title: "3D Scene Workbench",
    titleZh: "3D 场景工作台",
  },
  "scene-graph": {
    id: "scene-graph",
    index: "2D",
    group: "professional",
    label: "2D Annotation",
    labelZh: "2D 标注",
    path: "#scene-graph",
    kicker: "Viewer / Reference",
    title: "Reference Plan Annotation",
    titleZh: "参考图标注",
    subtitle: "Calibrate the plan scale, trace road centerlines, define cross sections and street-furniture anchors, then export JSON or convert to a road graph.",
    subtitleZh: "校准比例、描绘道路中心线、定义横断面和街道设施锚点，再导出标注或转换为道路图。",
  },
  "asset-editor": {
    id: "asset-editor",
    index: "AS",
    group: "professional",
    label: "Asset Editor",
    labelZh: "资产编辑器",
    path: "#asset-editor",
    kicker: "Viewer / 3D Assets",
    title: "3D Asset Editor",
    titleZh: "3D 资产编辑器",
    subtitle: "Browse, inspect, and manage project 3D assets",
    subtitleZh: "浏览、检查并管理项目 3D 资产",
  },
  "model-input-browser": {
    id: "model-input-browser",
    index: "MI",
    group: "professional",
    label: "Model Input Browser",
    labelZh: "模型输入审计",
    path: "#model-input-browser",
    kicker: "Viewer / Raw Evidence",
    title: "Model Input Browser",
    titleZh: "模型输入审计",
    subtitle: "Read-only audit of the exact raw GeoJSON prompt supplied to the model.",
    subtitleZh: "只读核验发送给模型的原始 GeoJSON 提示词。",
  },
};

function getCurrentRoute(): AppRoute {
  const hash = window.location.hash;
  if (hash === "#course-studio") return "course-studio";
  if (hash === "#scene-graph") return "scene-graph";
  if (hash === "#asset-editor") return "asset-editor";
  if (hash === "#model-input-browser") return "model-input-browser";
  return "viewer";
}

function navigateTo(route: AppRoute): void {
  const config = ROUTES[route];
  window.location.hash = config.path;
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
