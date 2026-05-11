import { ROUTES, navigateTo } from "./ui";
import type { AppRoute } from "./ui";
import {
  VIEWER_LANGUAGE_EVENT,
  applyViewerTranslations,
  loadViewerLanguage,
  normalizeViewerLanguage,
  setViewerLanguage,
  translateViewerKey,
  translateViewerLiteral,
  viewerText,
  type ViewerLanguage,
} from "./viewer-i18n";

type ShellMenuId = "file" | "view" | "tools" | "help";

export const SHELL_ACTION_EVENT = "roadgen3d:shell-action";
export const SHELL_TOGGLE_EVENT = "roadgen3d:shell-toggle";
export const SHELL_ACTIONS_CHANGE_EVENT = "roadgen3d:shell-actions-change";

export type ShellMenuActionId =
  | "file-load-layout"
  | "file-export-png"
  | "file-export-svg"
  | "file-export-json"
  | "file-save-context"
  | "view-reset-view"
  | "tools-open-settings"
  | "tools-open-design"
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

export type ShellI18nText = string | {
  key: string;
  fallback?: string;
};

export type ShellToggleTarget = "left" | "right" | "bottom";

export type ShellActionsChangeDetail = {
  enabledActions: ShellMenuActionId[];
};

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
  setRightPinned: (pinned: boolean) => void;
  setBottomOpen: (open: boolean) => void;
  setStatusSummary: (message: ShellI18nText) => void;
  pushActivity: (message: ShellI18nText, tone?: "neutral" | "success" | "warning" | "error") => void;
  setHints: (hints: ShellI18nText[]) => void;
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
          data-i18n-key="route.${id}.label"
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
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-load-layout" data-i18n-key="menu.file.loadLayout">Load Layout</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-export-png" data-i18n-key="menu.file.exportPng">Export PNG</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-export-svg" data-i18n-key="menu.file.exportSvg">Export SVG</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-export-json" data-i18n-key="menu.file.exportJson">Export JSON</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="file-save-context" data-i18n-key="menu.file.saveContext">Save Context</button>
    `;
  }
  if (menuId === "view") {
    return `
      <button class="desktop-shell-menu-action" type="button" data-shell-action="view-reset-view" data-i18n-key="menu.view.resetView">Reset View</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-toggle="left" data-i18n-key="menu.view.toggleLeft">Toggle Left Sidebar</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-toggle="right" data-i18n-key="menu.view.toggleRight">Toggle Right Sidebar</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-toggle="bottom" data-i18n-key="menu.view.toggleBottom">Toggle Status Workbench</button>
    `;
  }
  if (menuId === "tools") {
    return `
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-settings" data-i18n-key="menu.tools.settings">Settings</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-design" data-i18n-key="menu.tools.design">Design</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-evaluate" data-i18n-key="menu.tools.evaluate">Evaluate</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-compare" data-i18n-key="menu.tools.compare">Compare</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-history" data-i18n-key="menu.tools.history">History</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-presets" data-i18n-key="menu.tools.presets">Presets</button>
      <button class="desktop-shell-menu-action" type="button" data-shell-action="tools-open-floating-lane" data-i18n-key="menu.tools.floatingLane">Floating Lane</button>
    `;
  }
  return `
    <button class="desktop-shell-menu-action" type="button" data-shell-action="help-shortcuts" data-i18n-key="menu.help.shortcuts">Shortcuts</button>
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
    <div class="desktop-shell desktop-shell-left-auto-collapse desktop-shell-right-auto-collapse" data-route="${route}">
      <header class="desktop-shell-menu">
        <div class="desktop-shell-brand">
          <div class="desktop-shell-kicker" data-i18n-key="shell.${route}.kicker">${routeConfig.kicker}</div>
          <div class="desktop-shell-title-wrap">
            <h1 class="desktop-shell-title" data-i18n-key="shell.${route}.title">${routeConfig.title}</h1>
            ${routeConfig.subtitle ? `<p class="desktop-shell-subtitle" data-i18n-key="shell.${route}.subtitle">${routeConfig.subtitle}</p>` : ""}
          </div>
        </div>
        <nav class="desktop-shell-route-switch" aria-label="Modules">
          ${createMenuButtonHtml(route)}
        </nav>
        <div class="desktop-shell-language-switcher" role="group" aria-label="Language" data-i18n-aria-label-key="language.group">
          <button class="desktop-shell-language-button" type="button" data-viewer-lang="en" data-i18n-aria-label-key="language.en">EN</button>
          <button class="desktop-shell-language-button" type="button" data-viewer-lang="zh" data-i18n-aria-label-key="language.zh">中文</button>
          <button class="desktop-shell-language-button" type="button" data-viewer-lang="mixed" data-i18n-aria-label-key="language.mixed">中英</button>
        </div>
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
                    <span data-i18n-key="menu.${menuId}">${menuId[0].toUpperCase()}${menuId.slice(1)}</span>
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
              <div class="desktop-shell-rail-kicker" data-i18n-key="shell.navigation">Navigation</div>
              <div class="desktop-shell-rail-title" data-i18n-key="shell.leftSidebar">Left Sidebar</div>
            </div>
            <button
              class="desktop-shell-rail-pin"
              type="button"
              data-shell-left-pin
              aria-pressed="false"
              title="Pin left sidebar"
              data-i18n-key="shell.pin"
            >
              Pin
            </button>
          </div>
          <div id="desktop-shell-left-rail" class="desktop-shell-rail-body"></div>
        </aside>

        <section class="desktop-shell-center">
          <div id="desktop-shell-center-stage" class="desktop-shell-center-stage"></div>
        </section>

        <aside class="desktop-shell-rail desktop-shell-rail-right" data-shell-region="right">
          <div class="desktop-shell-rail-header">
            <div>
              <div class="desktop-shell-rail-kicker" data-i18n-key="shell.inspector">Inspector</div>
              <div class="desktop-shell-rail-title" data-i18n-key="shell.rightSidebar">Right Sidebar</div>
            </div>
            <button
              class="desktop-shell-rail-pin"
              type="button"
              data-shell-right-pin
              aria-pressed="false"
              title="Pin right sidebar"
              data-i18n-key="shell.pin"
            >
              Pin
            </button>
          </div>
          <div class="desktop-shell-tab-list" id="desktop-shell-right-tabs"></div>
          <div id="desktop-shell-right-panels" class="desktop-shell-right-panels"></div>
        </aside>
      </div>

      <section class="desktop-shell-status" data-open="false">
        <button class="desktop-shell-status-summary" type="button" id="desktop-shell-status-summary-toggle" aria-expanded="false">
          <span class="desktop-shell-status-summary-label" data-i18n-key="shell.statusWorkbench">Status Workbench</span>
          <span id="desktop-shell-status-summary-text" data-i18n-key="shell.status.ready">Ready.</span>
        </button>
        <div class="desktop-shell-status-body">
          <div class="desktop-shell-status-tabs">
            <button class="desktop-shell-status-tab active" type="button" data-shell-status-tab="status" data-i18n-key="shell.status">Status</button>
            <button class="desktop-shell-status-tab" type="button" data-shell-status-tab="activity" data-i18n-key="shell.activity">Activity</button>
            <button class="desktop-shell-status-tab" type="button" data-shell-status-tab="hints" data-i18n-key="shell.hints">Hints</button>
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

  return bindDesktopShell(root, route);
}

export function bindDesktopShell(root: HTMLElement, route: AppRoute): DesktopShell {
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
  let currentLanguage: ViewerLanguage = loadViewerLanguage();

  const menuActionHandlers: Partial<Record<ShellMenuActionId, () => void>> = {};
  let activeRightTab: string | null = null;
  let currentHints: ShellI18nText[] = [];

  function resolveI18nText(message: ShellI18nText): string {
    if (typeof message === "string") {
      return translateViewerLiteral(currentLanguage, message) ?? message;
    }
    return translateViewerKey(currentLanguage, message.key) ?? message.fallback ?? message.key;
  }

  function applyI18nMetadata(element: HTMLElement, message: ShellI18nText): void {
    if (typeof message === "string") {
      element.removeAttribute("data-i18n-key");
      element.dataset.i18nSourceText = message;
      return;
    }
    element.removeAttribute("data-i18n-source-text");
    element.dataset.i18nKey = message.key;
  }

  function renderHints(): void {
    hintsHost.innerHTML = "";
    currentHints.forEach((hint) => {
      const entry = document.createElement("div");
      entry.className = "desktop-shell-log-entry";
      entry.dataset.tone = "neutral";
      applyI18nMetadata(entry, hint);
      entry.textContent = resolveI18nText(hint);
      hintsHost.appendChild(entry);
    });
  }

  function syncLanguageButtons(language: ViewerLanguage): void {
    root.querySelectorAll<HTMLButtonElement>("[data-viewer-lang]").forEach((button) => {
      const isActive = button.dataset.viewerLang === language;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function updatePinButtonText(button: HTMLButtonElement | null, pinned: boolean, side: "left" | "right"): void {
    if (!button) {
      return;
    }
    button.textContent = pinned
      ? viewerText(currentLanguage, "Pinned", "已固定")
      : viewerText(currentLanguage, "Pin", "固定");
    button.title = pinned
      ? viewerText(currentLanguage, `Unpin ${side} sidebar`, `取消固定${side === "left" ? "左" : "右"}侧栏`)
      : viewerText(currentLanguage, `Pin ${side} sidebar`, `固定${side === "left" ? "左" : "右"}侧栏`);
  }

  function applyShellLanguage(language: ViewerLanguage): void {
    currentLanguage = language;
    shellRoot.dataset.viewerLanguage = language;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    applyViewerTranslations(root, language);
    syncLanguageButtons(language);
    renderHints();
    updatePinButtonText(root.querySelector<HTMLButtonElement>("[data-shell-left-pin]"), shellRoot.classList.contains("desktop-shell-left-pinned"), "left");
    updatePinButtonText(root.querySelector<HTMLButtonElement>("[data-shell-right-pin]"), shellRoot.classList.contains("desktop-shell-right-pinned"), "right");
  }

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

  function emitActionAvailability(): void {
    root.dispatchEvent(new CustomEvent<ShellActionsChangeDetail>(SHELL_ACTIONS_CHANGE_EVENT, {
      detail: {
        enabledActions: Object.keys(menuActionHandlers) as ShellMenuActionId[],
      },
    }));
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

  function setRightPinned(pinned: boolean): void {
    shellRoot.classList.toggle("desktop-shell-right-pinned", pinned);
    const rightPinButton = root.querySelector<HTMLButtonElement>("[data-shell-right-pin]");
    rightPinButton?.setAttribute("aria-pressed", pinned ? "true" : "false");
    updatePinButtonText(rightPinButton, pinned, "right");
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
      button.dataset.i18nSourceText = tab.label;
      button.textContent = tab.label;
      button.addEventListener("click", () => activateRightTab(tab.id));
      rightTabButtons.appendChild(button);

      const panel = document.createElement("section");
      panel.className = "desktop-shell-tab-panel";
      panel.dataset.shellTabPanel = tab.id;
      panel.dataset.i18nScope = "literal";
      renderSectionContent(panel, tab.content);
      rightTabPanels.appendChild(panel);
    });
    activateRightTab(activeId);
    applyViewerTranslations(root, currentLanguage);
  }

  function pushActivity(message: ShellI18nText, tone: "neutral" | "success" | "warning" | "error" = "neutral"): void {
    const entry = document.createElement("div");
    entry.className = "desktop-shell-log-entry";
    entry.dataset.tone = tone;
    applyI18nMetadata(entry, message);
    entry.textContent = resolveI18nText(message);
    activityHost.prepend(entry);
  }

  function setHints(hints: ShellI18nText[]): void {
    currentHints = hints.slice();
    renderHints();
  }

  function setMenuActions(actions: Partial<Record<ShellMenuActionId, () => void>>): void {
    for (const key of Object.keys(menuActionHandlers) as ShellMenuActionId[]) {
      delete menuActionHandlers[key];
    }
    Object.assign(menuActionHandlers, actions);
    refreshActionAvailability();
    emitActionAvailability();
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
      const menuId = button.dataset.shellMenuToggle;
      const menu = menuId ? root.querySelector<HTMLElement>(`[data-shell-menu="${menuId}"]`) : null;
      if (!menu) {
        return;
      }
      event.stopPropagation();
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

  const triggerShellAction = (actionId: ShellMenuActionId): void => {
    const handler = menuActionHandlers[actionId];
    if (!handler) {
      return;
    }
    handler();
    closeMenus();
  };

  const toggleShellRegion = (target: ShellToggleTarget): void => {
    if (target === "left") {
      shellRoot.classList.toggle("desktop-shell-left-collapsed");
    } else if (target === "right") {
      shellRoot.classList.toggle("desktop-shell-right-collapsed");
    } else if (target === "bottom") {
      setBottomOpen(statusWorkbench.dataset.open !== "true");
    }
    closeMenus();
  };

  root.querySelectorAll<HTMLElement>("[data-shell-toggle]").forEach((element) => {
    element.addEventListener("click", () => {
      const target = element.dataset.shellToggle;
      if (target === "left" || target === "right" || target === "bottom") {
        toggleShellRegion(target);
      }
    });
  });

  const handleShellActionEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ actionId?: ShellMenuActionId }>).detail;
    if (detail?.actionId) {
      triggerShellAction(detail.actionId);
    }
  };
  root.addEventListener(SHELL_ACTION_EVENT, handleShellActionEvent);

  const handleShellToggleEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ target?: ShellToggleTarget }>).detail;
    if (detail?.target) {
      toggleShellRegion(detail.target);
    }
  };
  root.addEventListener(SHELL_TOGGLE_EVENT, handleShellToggleEvent);

  const leftPinButton = root.querySelector<HTMLButtonElement>("[data-shell-left-pin]");
  leftPinButton?.addEventListener("click", () => {
    const pinned = shellRoot.classList.toggle("desktop-shell-left-pinned");
    leftPinButton.setAttribute("aria-pressed", pinned ? "true" : "false");
    updatePinButtonText(leftPinButton, pinned, "left");
  });

  const rightPinButton = root.querySelector<HTMLButtonElement>("[data-shell-right-pin]");
  rightPinButton?.addEventListener("click", () => {
    setRightPinned(!shellRoot.classList.contains("desktop-shell-right-pinned"));
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
      const antTab = root.querySelector<HTMLElement>(
        `.roadgen-ant-status-body [data-node-key="${tabId}"], .roadgen-ant-status-body [id$="-tab-${tabId}"]`,
      );
      antTab?.click();
    });
  });

  const isMenuUiClick = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) {
      return false;
    }
    return target.closest("[data-shell-menu-toggle], [data-shell-menu], [data-shell-action], [data-shell-toggle]")
      !== null;
  };

  const handleDocumentClick = (event: MouseEvent) => {
    const target = event.target;
    if (!target) {
      return;
    }
    if (!root.contains(target as Node) || !isMenuUiClick(target)) {
      closeMenus();
    }
  };
  document.addEventListener("click", handleDocumentClick);

  root.querySelectorAll<HTMLButtonElement>("[data-viewer-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      setViewerLanguage(normalizeViewerLanguage(button.dataset.viewerLang));
    });
  });

  const handleViewerLanguageChange = (event: Event) => {
    const detail = (event as CustomEvent<{ language?: unknown }>).detail;
    applyShellLanguage(normalizeViewerLanguage(detail?.language));
  };
  window.addEventListener(VIEWER_LANGUAGE_EVENT, handleViewerLanguageChange);

  refreshActionAvailability();
  emitActionAvailability();
  applyShellLanguage(currentLanguage);

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
    setRightPinned,
    setBottomOpen,
    setStatusSummary: (message: ShellI18nText) => {
      applyI18nMetadata(summaryText, message);
      summaryText.textContent = resolveI18nText(message);
    },
    pushActivity,
    setHints,
    setMenuActions,
    destroy: () => {
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener(VIEWER_LANGUAGE_EVENT, handleViewerLanguageChange);
      root.removeEventListener(SHELL_ACTION_EVENT, handleShellActionEvent);
      root.removeEventListener(SHELL_TOGGLE_EVENT, handleShellToggleEvent);
    },
  };
}
