import { ROUTES, navigateTo } from "./ui";
import type { AppRoute } from "./ui";

type ShellMenuId = "file" | "view" | "tools" | "help";

export type ShellMenuActionId =
  | "file-load-layout"
  | "file-export-png"
  | "file-export-svg"
  | "file-export-json"
  | "file-save-context"
  | "view-reset-view"
  | "view-language-en"
  | "view-language-zh"
  | "view-language-mixed"
  | "tools-open-settings"
  | "tools-open-evaluate"
  | "tools-open-compare"
  | "tools-open-history"
  | "tools-open-presets"
  | "tools-open-floating-lane"
  | "help-shortcuts";

export interface ShellSection {
  id: string;
  title: string;
  content: string | HTMLElement;
  subtitle?: string;
  open?: boolean;
}

export interface ShellTab {
  id: string;
  label: string;
  content: string | HTMLElement;
}

export interface DesktopShell {
  root: HTMLElement;
  route: AppRoute;
  leftRail: HTMLElement;
  centerStage: HTMLElement;
  rightRail: HTMLElement;
  rightTabButtons: HTMLElement;
  rightTabPanels: HTMLElement;
  statusSummary: HTMLElement;
  statusStatusHost: HTMLElement;
  statusActivityHost: HTMLElement;
  statusHintsHost: HTMLElement;
  setLeftSections: (sections: ShellSection[]) => void;
  setRightTabs: (tabs: ShellTab[], activeId?: string | null) => void;
  activateRightTab: (id: string | null) => void;
  setBottomOpen: (open: boolean) => void;
  setStatusSummary: (message: string) => void;
  pushActivity: (message: string, tone?: "neutral" | "success" | "warning" | "error") => void;
  setHints: (hints: string[]) => void;
  setMenuActions: (actions: Partial<Record<ShellMenuActionId, () => void>>) => void;
  destroy: () => void;
}

function createMenuButtonHtml(route: AppRoute): string {
  return (Object.entries(ROUTES) as Array<[AppRoute, (typeof ROUTES)[AppRoute]]>)
    .map(
      ([id, config]) => `
        <button
          class="desktop-shell-route-button${id === route ? " active" : ""}"
          type="button"
          data-route-switch="${id}"
          ${id === route ? 'aria-current="page"' : ""}
        >
          ${config.label}
        </button>
      `,
    )
    .join("");
}

function buildMenuActionsHtml(menuId: ShellMenuId): string {
  if (menuId === "file") {
    return `
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-load-layout">Load Layout</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-export-png">Export PNG</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-export-svg">Export SVG</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-export-json">Export JSON</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-save-context">Save Context</button>
    `;
  }
  if (menuId === "view") {
    return `
      <button class="desktop-shell-menu-action" type="button" data-shell-action="view-reset-view">Reset View</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-toggle="left">Toggle Left Sidebar</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-toggle="right">Toggle Right Sidebar</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-toggle="bottom">Toggle Status Workbench</button>
      <div class="desktop-shell-menu-divider"></div>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="view-language-en">English</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="view-language-zh">中文</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="view-language-mixed">中英混合</button>
    `;
  }
  if (menuId === "tools") {
    return `
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-settings">Settings</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-evaluate">Evaluate</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-compare">Compare</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-history">History</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-presets">Presets</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-floating-lane">Floating Lane</button>
    `;
  }
  return `
    <button class="desktop-shell-menu-action" type="button" data-shell-action="help-shortcuts">Shortcuts</button>
  `;
}

function renderSectionContent(contentHost: HTMLElement, content: string | HTMLElement): void {
  contentHost.innerHTML = "";
  if (typeof content === "string") {
    contentHost.innerHTML = content;
    return;
  }
  contentHost.appendChild(content);
}

export function createDesktopShell(root: HTMLElement, route: AppRoute): DesktopShell {
  const routeConfig = ROUTES[route];
  root.innerHTML = `
    <div class="desktop-shell" data-route="${route}">
      <header class="desktop-shell-menu">
        <div class="desktop-shell-brand">
          <div class="desktop-shell-kicker">${routeConfig.kicker}</div>
          <div class="desktop-shell-title-wrap">
            <h1 class="desktop-shell-title">${routeConfig.title}</h1>
            ${routeConfig.subtitle ? `<p class="desktop-shell-subtitle">${routeConfig.subtitle}</p>` : ""}
          </div>
        </div>
        <nav class="desktop-shell-route-switch" aria-label="Modules">
          ${createMenuButtonHtml(route)}
        </nav>
        <div class="desktop-shell-menu-groups">
          ${(["file", "view", "tools", "help"] as const)
            .map(
              (menuId) => `
                <div class="desktop-shell-menu-group">
                  <button
                    class="desktop-shell-menu-toggle"
                    type="button"
                    data-shell-menu-toggle="${menuId}"
                    aria-expanded="false"
                  >
                    ${menuId[0].toUpperCase()}${menuId.slice(1)}
                  </button>
                  <div class="desktop-shell-menu-popover" data-shell-menu="${menuId}" hidden>
                    ${buildMenuActionsHtml(menuId)}
                  </div>
                </div>
              `,
            )
            .join("")}
        </div>
      </header>

      <div class="desktop-shell-main">
        <aside class="desktop-shell-rail desktop-shell-rail-left" data-shell-region="left">
          <div class="desktop-shell-rail-header">
            <div>
              <div class="desktop-shell-rail-kicker">Navigation</div>
              <div class="desktop-shell-rail-title">Left Sidebar</div>
            </div>
          </div>
          <div id="desktop-shell-left-rail" class="desktop-shell-rail-body"></div>
        </aside>

        <section class="desktop-shell-center">
          <div id="desktop-shell-center-stage" class="desktop-shell-center-stage"></div>
        </section>

        <aside class="desktop-shell-rail desktop-shell-rail-right" data-shell-region="right">
          <div class="desktop-shell-rail-header">
            <div>
              <div class="desktop-shell-rail-kicker">Inspector</div>
              <div class="desktop-shell-rail-title">Right Sidebar</div>
            </div>
          </div>
          <div class="desktop-shell-tab-list" id="desktop-shell-right-tabs"></div>
          <div id="desktop-shell-right-panels" class="desktop-shell-right-panels"></div>
        </aside>
      </div>

      <section class="desktop-shell-status" data-open="false">
        <button class="desktop-shell-status-summary" type="button" id="desktop-shell-status-summary-toggle" aria-expanded="false">
          <span class="desktop-shell-status-summary-label">Status Workbench</span>
          <span id="desktop-shell-status-summary-text">Ready.</span>
        </button>
        <div class="desktop-shell-status-body">
          <div class="desktop-shell-status-tabs">
            <button class="desktop-shell-status-tab active" type="button" data-shell-status-tab="status">Status</button>
            <button class="desktop-shell-status-tab" type="button" data-shell-status-tab="activity">Activity</button>
            <button class="desktop-shell-status-tab" type="button" data-shell-status-tab="hints">Hints</button>
          </div>
          <div class="desktop-shell-status-panels">
            <div class="desktop-shell-status-panel active" data-shell-status-panel="status">
              <div id="desktop-shell-status-host" class="desktop-shell-status-stack"></div>
            </div>
            <div class="desktop-shell-status-panel" data-shell-status-panel="activity">
              <div id="desktop-shell-activity-host" class="desktop-shell-status-stack"></div>
            </div>
            <div class="desktop-shell-status-panel" data-shell-status-panel="hints">
              <div id="desktop-shell-hints-host" class="desktop-shell-status-stack"></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  const shellRootNode = root.querySelector<HTMLElement>(".desktop-shell");
  const leftRailNode = root.querySelector<HTMLElement>("#desktop-shell-left-rail");
  const centerStageNode = root.querySelector<HTMLElement>("#desktop-shell-center-stage");
  const rightRailNode = root.querySelector<HTMLElement>('[data-shell-region="right"]');
  const rightTabButtonsNode = root.querySelector<HTMLElement>("#desktop-shell-right-tabs");
  const rightTabPanelsNode = root.querySelector<HTMLElement>("#desktop-shell-right-panels");
  const summaryToggleNode = root.querySelector<HTMLButtonElement>("#desktop-shell-status-summary-toggle");
  const summaryTextNode = root.querySelector<HTMLElement>("#desktop-shell-status-summary-text");
  const statusHostNode = root.querySelector<HTMLElement>("#desktop-shell-status-host");
  const activityHostNode = root.querySelector<HTMLElement>("#desktop-shell-activity-host");
  const hintsHostNode = root.querySelector<HTMLElement>("#desktop-shell-hints-host");
  const statusWorkbenchNode = root.querySelector<HTMLElement>(".desktop-shell-status");

  if (
    !shellRootNode ||
    !leftRailNode ||
    !centerStageNode ||
    !rightRailNode ||
    !rightTabButtonsNode ||
    !rightTabPanelsNode ||
    !summaryToggleNode ||
    !summaryTextNode ||
    !statusHostNode ||
    !activityHostNode ||
    !hintsHostNode ||
    !statusWorkbenchNode
  ) {
    throw new Error("Failed to initialize desktop shell.");
  }

  const shellRoot = shellRootNode;
  const leftRail = leftRailNode;
  const centerStage = centerStageNode;
  const rightRail = rightRailNode;
  const rightTabButtons = rightTabButtonsNode;
  const rightTabPanels = rightTabPanelsNode;
  const summaryToggle = summaryToggleNode;
  const summaryText = summaryTextNode;
  const statusHost = statusHostNode;
  const activityHost = activityHostNode;
  const hintsHost = hintsHostNode;
  const statusWorkbench = statusWorkbenchNode;

  const menuActionHandlers: Partial<Record<ShellMenuActionId, () => void>> = {};
  let activeRightTab: string | null = null;

  function refreshActionAvailability(): void {
    root.querySelectorAll<HTMLElement>("[data-shell-action]").forEach((element) => {
      const actionId = element.dataset.shellAction as ShellMenuActionId | undefined;
      if (!actionId) {
        return;
      }
      const enabled = typeof menuActionHandlers[actionId] === "function";
      element.toggleAttribute("disabled", !enabled);
    });
  }

  function closeMenus(): void {
    root.querySelectorAll<HTMLElement>("[data-shell-menu]").forEach((menu) => {
      menu.hidden = true;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-shell-menu-toggle]").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function setBottomOpen(open: boolean): void {
    statusWorkbench.dataset.open = open ? "true" : "false";
    summaryToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function activateRightTab(id: string | null): void {
    activeRightTab = id;
    rightTabButtons.querySelectorAll<HTMLButtonElement>("[data-shell-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.shellTab === id);
    });
    rightTabPanels.querySelectorAll<HTMLElement>("[data-shell-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.shellTabPanel !== id;
      panel.classList.toggle("active", panel.dataset.shellTabPanel === id);
    });
  }

  function setLeftSections(sections: ShellSection[]): void {
    leftRail.innerHTML = "";
    sections.forEach((section) => {
      const wrapper = document.createElement("details");
      wrapper.className = "desktop-shell-section";
      wrapper.dataset.sectionId = section.id;
      if (section.open ?? true) {
        wrapper.open = true;
      }

      const summary = document.createElement("summary");
      summary.className = "desktop-shell-section-summary";
      summary.innerHTML = `
        <span>${section.title}</span>
        ${section.subtitle ? `<span class="desktop-shell-section-subtitle">${section.subtitle}</span>` : ""}
      `;
      wrapper.appendChild(summary);

      const content = document.createElement("div");
      content.className = "desktop-shell-section-body";
      renderSectionContent(content, section.content);
      wrapper.appendChild(content);
      leftRail.appendChild(wrapper);
    });
  }

  function setRightTabs(tabs: ShellTab[], activeId: string | null = tabs[0]?.id ?? null): void {
    rightTabButtons.innerHTML = "";
    rightTabPanels.innerHTML = "";
    tabs.forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "desktop-shell-tab-button";
      button.dataset.shellTab = tab.id;
      button.textContent = tab.label;
      button.addEventListener("click", () => activateRightTab(tab.id));
      rightTabButtons.appendChild(button);

      const panel = document.createElement("section");
      panel.className = "desktop-shell-tab-panel";
      panel.dataset.shellTabPanel = tab.id;
      renderSectionContent(panel, tab.content);
      rightTabPanels.appendChild(panel);
    });
    activateRightTab(activeId);
  }

  function pushActivity(message: string, tone: "neutral" | "success" | "warning" | "error" = "neutral"): void {
    const entry = document.createElement("div");
    entry.className = "desktop-shell-log-entry";
    entry.dataset.tone = tone;
    entry.textContent = message;
    activityHost.prepend(entry);
  }

  function setHints(hints: string[]): void {
    hintsHost.innerHTML = hints
      .map((hint) => `<div class="desktop-shell-log-entry" data-tone="neutral">${hint}</div>`)
      .join("");
  }

  function setMenuActions(actions: Partial<Record<ShellMenuActionId, () => void>>): void {
    for (const key of Object.keys(menuActionHandlers) as ShellMenuActionId[]) {
      delete menuActionHandlers[key];
    }
    Object.assign(menuActionHandlers, actions);
    refreshActionAvailability();
  }

  root.querySelectorAll<HTMLButtonElement>("[data-route-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextRoute = button.dataset.routeSwitch as AppRoute | undefined;
      if (!nextRoute) {
        return;
      }
      navigateTo(nextRoute);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-shell-menu-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menuId = button.dataset.shellMenuToggle;
      const menu = menuId ? root.querySelector<HTMLElement>(`[data-shell-menu="${menuId}"]`) : null;
      if (!menu) {
        return;
      }
      const willOpen = menu.hidden;
      closeMenus();
      menu.hidden = !willOpen;
      button.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
  });

  root.querySelectorAll<HTMLElement>("[data-shell-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const actionId = element.dataset.shellAction as ShellMenuActionId | undefined;
      if (!actionId) {
        return;
      }
      const handler = menuActionHandlers[actionId];
      if (!handler) {
        return;
      }
      handler();
      closeMenus();
    });
  });

  root.querySelectorAll<HTMLElement>("[data-shell-toggle]").forEach((element) => {
    element.addEventListener("click", () => {
      const target = element.dataset.shellToggle;
      if (target === "left") {
        shellRoot.classList.toggle("desktop-shell-left-collapsed");
      } else if (target === "right") {
        shellRoot.classList.toggle("desktop-shell-right-collapsed");
      } else if (target === "bottom") {
        setBottomOpen(statusWorkbench.dataset.open !== "true");
      }
      closeMenus();
    });
  });

  summaryToggle.addEventListener("click", () => {
    setBottomOpen(statusWorkbench.dataset.open !== "true");
  });

  root.querySelectorAll<HTMLButtonElement>("[data-shell-status-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.shellStatusTab;
      if (!tabId) {
        return;
      }
      root.querySelectorAll<HTMLButtonElement>("[data-shell-status-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.shellStatusTab === tabId);
      });
      root.querySelectorAll<HTMLElement>("[data-shell-status-panel]").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.shellStatusPanel === tabId);
      });
    });
  });

  const handleDocumentClick = (event: MouseEvent) => {
    if (!root.contains(event.target as Node)) {
      closeMenus();
    }
  };
  document.addEventListener("click", handleDocumentClick);

  refreshActionAvailability();

  return {
    root,
    route,
    leftRail,
    centerStage,
    rightRail,
    rightTabButtons,
    rightTabPanels,
    statusSummary: summaryText,
    statusStatusHost: statusHost,
    statusActivityHost: activityHost,
    statusHintsHost: hintsHost,
    setLeftSections,
    setRightTabs,
    activateRightTab,
    setBottomOpen,
    setStatusSummary: (message: string) => {
      summaryText.textContent = message;
    },
    pushActivity,
    setHints,
    setMenuActions,
    destroy: () => {
      document.removeEventListener("click", handleDocumentClick);
    },
  };
}
