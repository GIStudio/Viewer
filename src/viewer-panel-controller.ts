import type { DesktopShell } from "./desktop-shell";
import type { ViewerPanelKey } from "./viewer-panels/types";

type PanelState = Record<ViewerPanelKey, boolean>;

type ViewerPanelControllerDeps = {
  shell: DesktopShell;
  canvasHost: HTMLElement;
  panels: Record<ViewerPanelKey, HTMLElement>;
  settingsToggleEl: HTMLButtonElement;
  onSettingsOpen: () => void;
  onSettingsClose: (restoreRoam: boolean) => void;
  onDesignOpen: () => void;
  onCompareOpen: () => void;
  onConsistencyOpen: () => void;
  onCloseAllOverlays: () => void;
};

export type ViewerPanelController = {
  setOpen: (panel: ViewerPanelKey, nextOpen: boolean, options?: { restoreRoam?: boolean }) => void;
  toggle: (panel: ViewerPanelKey, options?: { restoreRoam?: boolean }) => void;
  closeAll: () => void;
  isOpen: (panel: ViewerPanelKey) => boolean;
  isAnyOpen: () => boolean;
  snapshot: () => PanelState;
  syncFromSidebar: (pageId: string | null) => void;
};

const SLIDE_PANELS = new Set<ViewerPanelKey>(["evaluate", "compare", "consistency"]);

export function createViewerPanelController(deps: ViewerPanelControllerDeps): ViewerPanelController {
  let focusBeforePanelOpen: HTMLElement | null = null;
  const state: PanelState = {
    settings: false,
    design: false,
    evaluate: false,
    compare: false,
    consistency: false,
  };

  function updateCanvasSlideOpenState(): void {
    const anyOpen = Array.from(SLIDE_PANELS).some((panel) => state[panel]);
    deps.canvasHost.dataset.slideOpen = anyOpen ? "true" : "false";
  }

  function setDataset(panel: ViewerPanelKey, open: boolean): void {
    deps.panels[panel].dataset.open = open ? "true" : "false";
    deps.panels[panel].setAttribute("aria-hidden", open ? "false" : "true");
    if (panel === "settings") {
      deps.settingsToggleEl.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function activeNonSettingsPanel(): ViewerPanelKey | null {
    for (const panel of ["design", "evaluate", "compare", "consistency"] as ViewerPanelKey[]) {
      if (state[panel]) return panel;
    }
    return null;
  }

  function activateCurrentTab(): void {
    if (state.settings) {
      deps.shell.activateRightTab("settings");
      return;
    }
    deps.shell.activateRightTab(activeNonSettingsPanel());
  }

  function closePanel(panel: ViewerPanelKey, options?: { restoreRoam?: boolean }): void {
    if (!state[panel]) return;
    state[panel] = false;
    setDataset(panel, false);
    if (panel === "settings") {
      deps.onSettingsClose(Boolean(options?.restoreRoam));
    }
    if (!Object.values(state).some(Boolean) && focusBeforePanelOpen?.isConnected) {
      focusBeforePanelOpen.focus({ preventScroll: true });
      focusBeforePanelOpen = null;
    }
  }

  function closeAll(): void {
    closePanel("settings");
    closePanel("design");
    closePanel("evaluate");
    closePanel("compare");
    closePanel("consistency");
    deps.onCloseAllOverlays();
    deps.shell.activateRightTab(null);
    updateCanvasSlideOpenState();
  }

  function setOpen(panel: ViewerPanelKey, nextOpen: boolean, options?: { restoreRoam?: boolean }): void {
    if (nextOpen) {
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeAll();
      focusBeforePanelOpen = opener;
      if (panel === "design") deps.onDesignOpen();
      if (panel === "compare") deps.onCompareOpen();
      if (panel === "consistency") deps.onConsistencyOpen();
    }

    if (!nextOpen) {
      closePanel(panel, options);
      activateCurrentTab();
      updateCanvasSlideOpenState();
      return;
    }

    state[panel] = true;
    setDataset(panel, true);
    deps.shell.setRightPinned(true);
    // Design and consistency are stage-owned overlays. Calling
    // activateRightTab(null) here emits a sidebar-change event that immediately
    // closes the overlay we just opened.
    if (panel !== "consistency" && panel !== "design") {
      deps.shell.activateRightTab(panel);
    }
    if (panel === "settings") {
      deps.onSettingsOpen();
    }
    queueMicrotask(() => {
      const closeButton = deps.panels[panel].querySelector<HTMLElement>(
        ".viewer-settings-close, [data-close-generation], button",
      );
      closeButton?.focus({ preventScroll: true });
    });
    updateCanvasSlideOpenState();
  }

  function toggle(panel: ViewerPanelKey, options?: { restoreRoam?: boolean }): void {
    setOpen(panel, !state[panel], options);
  }

  function syncFromSidebar(pageId: string | null): void {
    const target = pageId && pageId in state ? pageId as ViewerPanelKey : null;
    (Object.keys(state) as ViewerPanelKey[]).forEach((panel) => {
      if (panel !== target) closePanel(panel);
    });
    if (!target || state[target]) {
      updateCanvasSlideOpenState();
      return;
    }
    focusBeforePanelOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (target === "design") deps.onDesignOpen();
    if (target === "compare") deps.onCompareOpen();
    if (target === "consistency") deps.onConsistencyOpen();
    state[target] = true;
    setDataset(target, true);
    if (target === "settings") deps.onSettingsOpen();
    updateCanvasSlideOpenState();
  }

  return {
    setOpen,
    toggle,
    closeAll,
    isOpen: (panel) => state[panel],
    isAnyOpen: () => Object.values(state).some(Boolean),
    snapshot: () => ({ ...state }),
    syncFromSidebar,
  };
}
