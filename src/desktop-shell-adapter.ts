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
  WorkbenchShellMode,
  WorkbenchSidebarController,
  WorkbenchSidebarChangeDetail,
  WorkbenchSidebarPage,
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
  WorkbenchShellMode,
  WorkbenchSidebarPage,
  WorkbenchSidebarController,
  WorkbenchSidebarChangeDetail,
} from "./shell-types";

function renderSectionContent(contentHost: HTMLElement, content: string | HTMLElement): void {
  contentHost.innerHTML = "";
  if (typeof content === "string") {
    contentHost.innerHTML = content;
    return;
  }
  contentHost.appendChild(content);
}

export function bindDesktopShell(
  root: HTMLElement,
  route: AppRoute,
  mode: WorkbenchShellMode = "legacy_dual",
): DesktopShell {
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
  const isSingleLeft = mode !== "legacy_dual";
  let destroyed = false;

  const menuActionHandlers: Partial<Record<ShellMenuActionId, () => void>> = {};
  let activeRightTab: string | null = null;
  let currentHints: ShellI18nText[] = [];
  let leftSidebarPages: WorkbenchSidebarPage[] = [];
  let rightSidebarPages: WorkbenchSidebarPage[] = [];
  const registeredSidebarPages = new Map<symbol, WorkbenchSidebarPage[]>();
  const modalTabs = new Map<string, HTMLElement>();
  let rememberedSidebarPage: string | null = null;
  let sidebarRailExpanded = false;
  if (isSingleLeft) {
    try {
      rememberedSidebarPage = sessionStorage.getItem(`roadgen:sidebar:${route}`);
      sidebarRailExpanded = sessionStorage.getItem(`roadgen:sidebar-expanded:${route}`) === "true";
    } catch {
      rememberedSidebarPage = null;
    }
  }

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
    syncSidebarLanguage();
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

  function requestRailRetract(side: "left" | "right", trigger: HTMLButtonElement | null): void {
    const retractClass = side === "left" ? "desktop-shell-left-retracting" : "desktop-shell-right-retracting";
    shellRoot.classList.add(retractClass);
    trigger?.blur();
    window.setTimeout(() => shellRoot.classList.remove(retractClass), 220);
  }

  function setRightPinned(pinned: boolean): void {
    if (isSingleLeft) return;
    shellRoot.classList.toggle("desktop-shell-right-pinned", pinned);
    const rightPinButton = root.querySelector<HTMLButtonElement>("[data-shell-right-pin]");
    rightPinButton?.setAttribute("aria-pressed", pinned ? "true" : "false");
    if (!pinned) {
      requestRailRetract("right", rightPinButton ?? null);
    }
    updatePinButtonText(rightPinButton, pinned, "right");
  }

  function announceSidebarChange(pageId: string | null, previousPageId: string | null): void {
    const detail: WorkbenchSidebarChangeDetail = { pageId, previousPageId, mode };
    root.dispatchEvent(new CustomEvent("roadgen:workbench-sidebar-change", {
      bubbles: true,
      detail,
    }));
    window.dispatchEvent(new CustomEvent("roadgen:workbench-sidebar-change", { detail }));
  }

  function setActiveSidebarPage(id: string | null): void {
    const previousPageId = activeRightTab;
    activeRightTab = id;
    shellRoot.dataset.sidebarOpen = id ? "true" : "false";
    rightTabButtons.querySelectorAll<HTMLButtonElement>("[data-shell-tab]").forEach((button) => {
      const isActive = button.dataset.shellTab === id;
      button.classList.toggle("active", isActive);
      button.dataset.open = isActive ? "true" : "false";
      button.setAttribute("aria-expanded", isActive ? "true" : "false");
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    rightTabPanels.querySelectorAll<HTMLElement>("[data-shell-tab-panel]").forEach((panel) => {
      const isActive = panel.dataset.shellTabPanel === id;
      panel.hidden = !isActive;
      panel.classList.toggle("active", isActive);
      panel.dataset.open = isActive ? "true" : "false";
    });
    if (isSingleLeft) {
      try {
        if (id) {
          rememberedSidebarPage = id;
          sessionStorage.setItem(`roadgen:sidebar:${route}`, id);
        }
      } catch {
        // Session storage can be unavailable in embedded or privacy-restricted contexts.
      }
    }
    announceSidebarChange(id, previousPageId);
  }

  function activateRightTab(id: string | null): void {
    if (id === null && isSingleLeft) {
      closeSidebar();
      return;
    }
    const nextActiveTab = id ?? (isSingleLeft
      ? null
      : rightTabButtons.querySelector<HTMLButtonElement>("[data-shell-tab]")?.dataset.shellTab ?? null);
    setActiveSidebarPage(nextActiveTab);
  }

  function closeSidebar(): void {
    rememberedSidebarPage = null;
    if (isSingleLeft) {
      try {
        sessionStorage.removeItem(`roadgen:sidebar:${route}`);
      } catch {
        // Ignore storage restrictions; the in-memory state still closes.
      }
    }
    setActiveSidebarPage(null);
  }

  function allSidebarPages(): WorkbenchSidebarPage[] {
    const pages = [
      ...leftSidebarPages,
      ...rightSidebarPages,
      ...Array.from(registeredSidebarPages.values()).flat(),
    ].filter((page) => !page.disabled);
    const deduped = new Map<string, WorkbenchSidebarPage>();
    pages.forEach((page) => deduped.set(page.id, page));
    const groupOrder = { flow: 0, navigation: 1, workspace: 2, analysis: 3, inspection: 4, system: 5 };
    return Array.from(deduped.values()).sort((a, b) => groupOrder[a.group] - groupOrder[b.group]);
  }

  function sidebarLabel(page: WorkbenchSidebarPage): string {
    return translateViewerLiteral(currentLanguage, page.label) ?? page.label;
  }

  function sidebarIcon(page: WorkbenchSidebarPage): string {
    const label = sidebarLabel(page);
    const dimensionalPrefix = label.match(/^(2D|3D)\b/i)?.[1];
    if (dimensionalPrefix) return dimensionalPrefix.toUpperCase();
    if (currentLanguage === "zh") {
      const firstChineseCharacter = label.match(/[\u3400-\u9fff]/)?.[0];
      if (firstChineseCharacter) return firstChineseCharacter;
    }
    if (page.icon) return page.icon;
    const words = label.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "·";
    return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : words.map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  }

  function syncSidebarLanguage(): void {
    if (!isSingleLeft) return;
    rightTabButtons.querySelectorAll<HTMLButtonElement>("[data-shell-tab]").forEach((button) => {
      const page = allSidebarPages().find((candidate) => candidate.id === button.dataset.shellTab);
      if (!page) return;
      const label = sidebarLabel(page);
      button.title = label;
      button.setAttribute("aria-label", label);
      const icon = button.querySelector<HTMLElement>(".workbench-sidebar-icon");
      if (icon) icon.textContent = sidebarIcon(page);
      const labelElement = button.querySelector<HTMLElement>(".workbench-sidebar-label");
      if (labelElement) labelElement.textContent = label;
    });
  }

  function renderSingleLeftPages(preferredActive: string | null = activeRightTab): void {
    if (!isSingleLeft || destroyed) return;
    const pages = allSidebarPages();
    rightTabButtons.innerHTML = "";
    rightTabPanels.innerHTML = "";
    shellRoot.dataset.sidebarRailExpanded = String(sidebarRailExpanded);
    const railToggle = document.createElement("button");
    railToggle.type = "button";
    railToggle.className = "workbench-sidebar-rail-toggle";
    railToggle.setAttribute("aria-expanded", String(sidebarRailExpanded));
    railToggle.setAttribute("aria-label", viewerText(currentLanguage, sidebarRailExpanded ? "Collapse sidebar labels" : "Expand sidebar labels", sidebarRailExpanded ? "收起侧边栏文字" : "展开侧边栏文字"));
    railToggle.innerHTML = `<span aria-hidden="true">${sidebarRailExpanded ? "‹" : "›"}</span><strong>${viewerText(currentLanguage, sidebarRailExpanded ? "Collapse" : "Expand", sidebarRailExpanded ? "收起" : "展开")}</strong>`;
    railToggle.addEventListener("click", () => {
      sidebarRailExpanded = !sidebarRailExpanded;
      try { sessionStorage.setItem(`roadgen:sidebar-expanded:${route}`, String(sidebarRailExpanded)); } catch { /* ignore */ }
      shellRoot.dataset.sidebarRailExpanded = String(sidebarRailExpanded);
      railToggle.setAttribute("aria-expanded", String(sidebarRailExpanded));
      railToggle.setAttribute("aria-label", viewerText(currentLanguage, sidebarRailExpanded ? "Collapse sidebar labels" : "Expand sidebar labels", sidebarRailExpanded ? "收起侧边栏文字" : "展开侧边栏文字"));
      railToggle.innerHTML = `<span aria-hidden="true">${sidebarRailExpanded ? "‹" : "›"}</span><strong>${viewerText(currentLanguage, sidebarRailExpanded ? "Collapse" : "Expand", sidebarRailExpanded ? "收起" : "展开")}</strong>`;
    });
    rightTabButtons.appendChild(railToggle);
    let previousGroup: WorkbenchSidebarPage["group"] | null = null;
    pages.forEach((page) => {
      if (previousGroup !== page.group) {
        if (previousGroup) {
          const divider = document.createElement("span");
          divider.className = "workbench-sidebar-divider";
          divider.setAttribute("aria-hidden", "true");
          rightTabButtons.appendChild(divider);
        }
        const groupLabel = document.createElement("span");
        groupLabel.className = "workbench-sidebar-group-label";
        groupLabel.dataset.i18nKey = `sidebar.group.${page.group}`;
        groupLabel.textContent = translateViewerKey(currentLanguage, `sidebar.group.${page.group}`) ?? page.group;
        groupLabel.title = groupLabel.textContent;
        rightTabButtons.appendChild(groupLabel);
      }
      previousGroup = page.group;
      const panelId = `desktop-shell-tab-panel-${page.id}`;
      const button = document.createElement("button");
      if (page.id in viewerTabButtonIds) {
        button.id = viewerTabButtonIds[page.id];
      }
      button.type = "button";
      button.className = "desktop-shell-tab-button workbench-sidebar-button";
      button.dataset.shellTab = page.id;
      button.dataset.sidebarGroup = page.group;
      button.dataset.current = page.current ? "true" : "false";
      if (page.flow) {
        button.classList.add("workbench-sidebar-flow-button");
        button.dataset.flowStage = page.flow.stage;
        button.dataset.flowStatus = page.flow.status ?? "pending";
        if (page.flow.branch) button.dataset.flowBranch = page.flow.branch;
      }
      button.dataset.open = "false";
      const label = sidebarLabel(page);
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-controls", panelId);
      button.setAttribute("aria-expanded", "false");
      if (page.current) button.setAttribute("aria-current", "step");
      button.innerHTML = `<span class="workbench-sidebar-icon" aria-hidden="true"></span><span class="workbench-sidebar-label"></span>`;
      button.querySelector<HTMLElement>(".workbench-sidebar-icon")!.textContent = sidebarIcon(page);
      button.querySelector<HTMLElement>(".workbench-sidebar-label")!.textContent = label;
      if (page.badge) {
        const badge = document.createElement("span");
        badge.className = "workbench-sidebar-badge";
        badge.textContent = page.badge;
        button.appendChild(badge);
      }
      button.addEventListener("click", () => {
        if (page.action) {
          closeSidebar();
          page.action();
          announceSidebarChange(page.id, activeRightTab);
          return;
        }
        if (activeRightTab === page.id) closeSidebar();
        else setActiveSidebarPage(page.id);
      });
      rightTabButtons.appendChild(button);

      if (!page.action) {
        const panel = document.createElement("section");
        panel.id = panelId;
        panel.className = "desktop-shell-tab-panel workbench-sidebar-drawer";
        panel.dataset.shellTabPanel = page.id;
        panel.dataset.open = "false";
        panel.dataset.i18nScope = "literal";
        panel.setAttribute("role", "tabpanel");
        panel.hidden = true;
        const header = document.createElement("header");
        header.className = "workbench-sidebar-drawer-header";
        const heading = document.createElement("strong");
        heading.textContent = page.label;
        const close = document.createElement("button");
        close.type = "button";
        close.className = "workbench-sidebar-close";
        close.textContent = "×";
        close.setAttribute("aria-label", `Close ${page.label}`);
        close.addEventListener("click", closeSidebar);
        header.append(heading, close);
        const content = document.createElement("div");
        content.className = "workbench-sidebar-drawer-body";
        renderSectionContent(content, page.content);
        panel.append(header, content);
        rightTabPanels.appendChild(panel);
      }
    });
    const requestedPage = preferredActive ?? rememberedSidebarPage;
    const validPreferred = requestedPage && pages.some((page) => page.id === requestedPage && !page.action)
      ? requestedPage
      : null;
    setActiveSidebarPage(validPreferred);
    applyViewerTranslations(root, currentLanguage);
  }

  function viewerControlPages(content: string | HTMLElement): WorkbenchSidebarPage[] {
    const host = document.createElement("div");
    renderSectionContent(host, content);
    leftRail.innerHTML = "";
    leftRail.appendChild(host);
    const idMap: Record<string, { id: string; group: WorkbenchSidebarPage["group"] }> = {
      "viewer-scene-browser-toggle": { id: "scene", group: "workspace" },
      "viewer-scene-graph-link": { id: "annotation", group: "workspace" },
      "viewer-asset-editor-link": { id: "assets", group: "workspace" },
      "viewer-design-toggle": { id: "design", group: "workspace" },
      "viewer-edit-toggle": { id: "edit", group: "workspace" },
      "viewer-settings-toggle": { id: "settings", group: "system" },
      "viewer-help-toggle": { id: "help", group: "system" },
    };
    const pages: WorkbenchSidebarPage[] = [];
    Array.from(host.querySelectorAll<HTMLButtonElement>(".viewer-control-menu-item")).forEach((button) => {
      const implicitId = button.dataset.viewerCenterControl === "browser" ? "viewer-scene-browser-toggle" : button.id;
      const mapped = idMap[implicitId];
      if (!mapped || button.id === "viewer-floating-lane-toggle") return;
      if (mode === "single_left_overlay" && ["scene", "annotation", "assets", "design", "edit"].includes(mapped.id)) return;
      if (mode === "course_single_left" && !["scene", "edit", "settings"].includes(mapped.id)) return;
      const label = button.querySelector("strong")?.textContent?.trim() || mapped.id;
      const icon = button.querySelector(".viewer-control-menu-code")?.textContent?.trim();
      pages.push({
        ...mapped,
        label,
        icon,
        content: "",
        action: () => button.click(),
      });
    });
    return pages;
  }

  function setLeftSections(sections: ShellSection[]): void {
    if (isSingleLeft) {
      const viewerControlSection = sections.find((section) => section.id === "viewer-control-menu");
      const regularSections = sections.filter((section) => section !== viewerControlSection);
      leftSidebarPages = [
        ...(viewerControlSection ? viewerControlPages(viewerControlSection.content) : []),
        ...regularSections.map((section) => {
          const content = document.createElement("div");
          content.className = "desktop-shell-section-body";
          content.dataset.i18nScope = "literal";
          renderSectionContent(content, section.content);
          return {
            id: section.id,
            label: resolveI18nText(section.title),
            group: "workspace" as const,
            content,
          };
        }),
      ];
      renderSingleLeftPages();
      return;
    }
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
      const title = document.createElement("span");
      applyI18nMetadata(title, section.title);
      title.textContent = resolveI18nText(section.title);
      summary.appendChild(title);
      if (section.subtitle) {
        const subtitle = document.createElement("span");
        subtitle.className = "desktop-shell-section-subtitle";
        applyI18nMetadata(subtitle, section.subtitle);
        subtitle.textContent = resolveI18nText(section.subtitle);
        summary.appendChild(subtitle);
      }
      wrapper.appendChild(summary);

      const content = document.createElement("div");
      content.className = "desktop-shell-section-body";
      content.dataset.i18nScope = "literal";
      renderSectionContent(content, section.content);
      wrapper.appendChild(content);
      leftRail.appendChild(wrapper);
    });
    applyViewerTranslations(root, currentLanguage);
  }

  const viewerTabButtonIds: Record<string, string> = {
    history: "viewer-history-analysis-toggle",
  };

  const modalTabOpeners = new Map<string, () => void>();

  function clearModalTabs(): void {
    modalTabs.forEach((modal) => modal.remove());
    modalTabs.clear();
    modalTabOpeners.clear();
  }

  function createModalTab(tab: ShellTab): () => void {
    const modal = document.createElement("div");
    const titleId = `desktop-shell-modal-title-${tab.id}`;
    modal.className = "desktop-shell-modal";
    modal.dataset.shellModalTab = tab.id;
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", titleId);
    modal.tabIndex = -1;

    const backdrop = document.createElement("div");
    backdrop.className = "desktop-shell-modal-backdrop";
    const dialog = document.createElement("section");
    dialog.className = "desktop-shell-modal-dialog";
    const header = document.createElement("header");
    const heading = document.createElement("h2");
    heading.id = titleId;
    heading.dataset.i18nSourceText = tab.label;
    heading.textContent = translateViewerLiteral(currentLanguage, tab.label) ?? tab.label;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "desktop-shell-modal-close";
    close.textContent = "×";
    close.setAttribute("aria-label", viewerText(currentLanguage, `Close ${tab.label}`, `关闭${heading.textContent}`));
    const body = document.createElement("div");
    body.className = "desktop-shell-modal-body";
    body.dataset.i18nScope = "literal";
    renderSectionContent(body, tab.content);
    header.append(heading, close);
    dialog.append(header, body);
    modal.append(backdrop, dialog);
    root.appendChild(modal);
    modalTabs.set(tab.id, modal);

    const closeModal = () => {
      if (modal.hidden) return;
      modal.hidden = true;
      root.querySelector<HTMLButtonElement>(`[data-shell-tab="${tab.id}"]`)?.focus();
    };
    close.addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeModal);
    dialog.querySelectorAll<HTMLElement>("[data-shell-modal-close]").forEach((element) => {
      element.addEventListener("click", closeModal);
    });
    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
    });

    const openModal = () => {
      modal.hidden = false;
      applyViewerTranslations(modal, currentLanguage);
      window.requestAnimationFrame(() => close.focus());
    };
    modalTabOpeners.set(tab.id, openModal);
    return openModal;
  }

  function setRightTabs(tabs: ShellTab[], activeId: string | null = tabs[0]?.id ?? null): void {
    clearModalTabs();
    if (isSingleLeft) {
      tabs.filter((tab) => tab.presentation === "modal").forEach(createModalTab);
      const nonModalTabs = tabs.filter((tab) => tab.presentation !== "modal");
      const visibleTabs = mode === "course_single_left" && route === "viewer"
        ? nonModalTabs.filter((tab) => ["evaluate", "compare", "floating-lane"].includes(tab.id))
        : nonModalTabs;
      leftRail.querySelector("[data-course-hidden-tabs]")?.remove();
      if (visibleTabs.length !== nonModalTabs.length) {
        const compatibilityHost = document.createElement("div");
        compatibilityHost.hidden = true;
        compatibilityHost.dataset.courseHiddenTabs = "true";
        nonModalTabs.filter((tab) => !visibleTabs.includes(tab)).forEach((tab) => {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.shellTab = tab.id;
          if (tab.id in viewerTabButtonIds) button.id = viewerTabButtonIds[tab.id];
          compatibilityHost.appendChild(button);
          const panel = document.createElement("div");
          renderSectionContent(panel, tab.content);
          compatibilityHost.appendChild(panel);
        });
        leftRail.appendChild(compatibilityHost);
      }
      rightSidebarPages = visibleTabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        icon: ({ evaluate: "EV", compare: "CP", history: "HI", "floating-lane": "OV", consistency: "QA" } as Record<string, string>)[tab.id],
        group: "analysis",
        content: tab.content,
        ...(tab.presentation === "modal" ? { action: createModalTab(tab) } : {}),
      }));
      renderSingleLeftPages(activeId);
      return;
    }
    rightTabButtons.innerHTML = "";
    rightTabPanels.innerHTML = "";
    tabs.forEach((tab) => {
      const panelId = `desktop-shell-tab-panel-${tab.id}`;
      const button = document.createElement("button");
      if (tab.id in viewerTabButtonIds) {
        button.id = viewerTabButtonIds[tab.id];
      }
      button.type = "button";
      button.className = "desktop-shell-tab-button";
      button.dataset.shellTab = tab.id;
      button.dataset.i18nSourceText = tab.label;
      button.dataset.open = "false";
      if (tab.presentation === "modal") {
        const openModal = modalTabOpeners.get(tab.id) ?? createModalTab(tab);
        button.addEventListener("click", openModal);
        button.setAttribute("aria-haspopup", "dialog");
      } else {
        button.setAttribute("aria-controls", panelId);
        button.setAttribute("aria-expanded", "false");
        button.addEventListener("click", () => activateRightTab(tab.id));
      }
      button.textContent = tab.label;
      rightTabButtons.appendChild(button);

      if (tab.presentation === "modal") {
        return;
      }

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

  root.addEventListener("click", (event) => {
    const source = event.target;
    const element = source instanceof Element
      ? source.closest<HTMLElement>("[data-shell-action]")
      : null;
    if (!element || !root.contains(element)) {
      return;
    }
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
    if (!pinned) {
      requestRailRetract("left", leftPinButton);
    }
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

  const handleSidebarEscape = (event: KeyboardEvent) => {
    if (isSingleLeft && event.key === "Escape" && activeRightTab) {
      event.preventDefault();
      root.dispatchEvent(new CustomEvent("roadgen:workbench-close-active-panel"));
      closeSidebar();
      rightTabButtons.querySelector<HTMLButtonElement>("[data-shell-tab]")?.focus();
    }
  };
  root.addEventListener("keydown", handleSidebarEscape);

  const handleSidebarCloseRequest = () => {
    if (isSingleLeft) closeSidebar();
  };
  root.addEventListener("roadgen:workbench-sidebar-close", handleSidebarCloseRequest);

  const sidebar: WorkbenchSidebarController = {
    registerPages: (pages: WorkbenchSidebarPage[]) => {
      const token = Symbol("sidebar-pages");
      registeredSidebarPages.set(token, pages);
      renderSingleLeftPages();
      return () => {
        registeredSidebarPages.delete(token);
        renderSingleLeftPages();
      };
    },
    activate: (pageId: string) => {
      const page = allSidebarPages().find((candidate) => candidate.id === pageId);
      if (!page || page.disabled) return;
      if (page.action) {
        closeSidebar();
        page.action();
        announceSidebarChange(page.id, activeRightTab);
      } else {
        setActiveSidebarPage(pageId);
      }
    },
    toggle: (pageId: string) => {
      if (activeRightTab === pageId) closeSidebar();
      else sidebar.activate(pageId);
    },
    close: closeSidebar,
    activePage: () => activeRightTab,
  };

  refreshActionAvailability();
  emitActionAvailability();
  applyShellLanguage(currentLanguage);

  return {
    root,
    route,
    mode,
    sidebar,
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
    openModalTab: (id: string) => {
      const openModal = modalTabOpeners.get(id);
      if (!openModal) return false;
      openModal();
      return true;
    },
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
      destroyed = true;
      clearModalTabs();
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener(VIEWER_LANGUAGE_EVENT, handleViewerLanguageChange);
      root.removeEventListener("keydown", handleSidebarEscape);
      root.removeEventListener("roadgen:workbench-sidebar-close", handleSidebarCloseRequest);
      root.removeEventListener(SHELL_ACTION_EVENT, handleShellActionEvent);
      root.removeEventListener(SHELL_TOGGLE_EVENT, handleShellToggleEvent);
    },
  };
}
