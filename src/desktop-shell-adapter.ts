import { navigateTo } from "./ui";
import type { AppRoute } from "./ui";
import {
  SHELL_ACTION_EVENT,
  SHELL_ACTIONS_CHANGE_EVENT,
  SHELL_TOGGLE_EVENT,
  type ShellActionsChangeDetail,
  type ShellMenuActionId,
  type ShellToggleTarget,
} from "./shell-events";
import type {
  DesktopShell,
  ShellI18nText,
  ShellSection,
  ShellTab,
} from "./shell-types";
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

export {
  SHELL_ACTION_EVENT,
  SHELL_ACTIONS_CHANGE_EVENT,
  SHELL_TOGGLE_EVENT,
};
export type {
  ShellActionsChangeDetail,
  ShellMenuActionId,
  ShellToggleTarget,
} from "./shell-events";
export type {
  DesktopShell,
  ShellI18nText,
  ShellSection,
  ShellTab,
} from "./shell-types";

function renderSectionContent(contentHost: HTMLElement, content: string | HTMLElement): void {
  contentHost.innerHTML = "";
  if (typeof content === "string") {
    contentHost.innerHTML = content;
    return;
  }
  contentHost.appendChild(content);
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
  const artifactsHostNode = root.querySelector<HTMLElement>("#desktop-shell-artifacts-host");
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
    !artifactsHostNode ||
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
  const artifactsHost = artifactsHostNode;
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
    const nextActiveTab = id ?? rightTabButtons.querySelector<HTMLButtonElement>("[data-shell-tab]")?.dataset.shellTab ?? null;
    activeRightTab = nextActiveTab;
    rightTabButtons.querySelectorAll<HTMLButtonElement>("[data-shell-tab]").forEach((button) => {
      const isActive = button.dataset.shellTab === nextActiveTab;
      button.classList.toggle("active", isActive);
      button.dataset.open = isActive ? "true" : "false";
      button.setAttribute("aria-expanded", isActive ? "true" : "false");
    });
    rightTabPanels.querySelectorAll<HTMLElement>("[data-shell-tab-panel]").forEach((panel) => {
      const isActive = panel.dataset.shellTabPanel === nextActiveTab;
      panel.hidden = !isActive;
      panel.classList.toggle("active", isActive);
      panel.dataset.open = isActive ? "true" : "false";
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
      const panelId = `desktop-shell-tab-panel-${tab.id}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "desktop-shell-tab-button";
      button.dataset.shellTab = tab.id;
      button.dataset.i18nSourceText = tab.label;
      button.dataset.open = "false";
      button.setAttribute("aria-controls", panelId);
      button.setAttribute("aria-expanded", "false");
      button.textContent = tab.label;
      button.addEventListener("click", () => activateRightTab(tab.id));
      rightTabButtons.appendChild(button);

      const panel = document.createElement("section");
      panel.id = panelId;
      panel.className = "desktop-shell-tab-panel";
      panel.dataset.shellTabPanel = tab.id;
      panel.dataset.open = "false";
      panel.dataset.i18nScope = "literal";
      panel.setAttribute("role", "tabpanel");
      panel.hidden = true;
      renderSectionContent(panel, tab.content);
      rightTabPanels.appendChild(panel);
    });
    activateRightTab(activeId ?? tabs[0]?.id ?? null);
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
    statusArtifactsHost: artifactsHost,
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
