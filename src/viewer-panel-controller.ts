import type { DesktopShell } from "./desktop-shell";

export type ViewerPanelKey =
  | "settings"
  | "design"
  | "evaluate"
  | "compare"
  | "presets"
  | "help"
  | "history";

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
  onPresetsOpen: () => void;
  onHistoryOpen: () => void;
  onCloseAllOverlays: () => void;
};

export type ViewerPanelController = {
  setOpen: (panel: ViewerPanelKey, nextOpen: boolean, options?: { restoreRoam?: boolean }) => void;
  toggle: (panel: ViewerPanelKey, options?: { restoreRoam?: boolean }) => void;
  closeAll: () => void;
  isOpen: (panel: ViewerPanelKey) => boolean;
  isAnyOpen: () => boolean;
  snapshot: () => PanelState;
};

const SLIDE_PANELS = new Set<ViewerPanelKey>(["design", "evaluate", "compare", "presets"]);

export function createViewerPanelController(deps: ViewerPanelControllerDeps): ViewerPanelController {
  const state: PanelState = {
    settings: false,
    design: false,
    evaluate: false,
    compare: false,
    presets: false,
    help: false,
    history: false,
  };

  function updateCanvasSlideOpenState(): void {
    const anyOpen = Array.from(SLIDE_PANELS).some((panel) => state[panel]);
    deps.canvasHost.dataset.slideOpen = anyOpen ? "true" : "false";
  }

  function setDataset(panel: ViewerPanelKey, open: boolean): void {
    deps.panels[panel].dataset.open = open ? "true" : "false";
    if (panel === "settings") {
      deps.settingsToggleEl.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function activeNonSettingsPanel(): ViewerPanelKey | null {
    for (const panel of ["design", "evaluate", "compare", "presets", "help", "history"] as ViewerPanelKey[]) {
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
  }

  function closeAll(): void {
    closePanel("settings");
    closePanel("design");
    closePanel("evaluate");
    closePanel("compare");
    closePanel("presets");
    deps.onCloseAllOverlays();
    deps.shell.activateRightTab(null);
    updateCanvasSlideOpenState();
  }

  function setOpen(panel: ViewerPanelKey, nextOpen: boolean, options?: { restoreRoam?: boolean }): void {
    if (nextOpen) {
      if (panel !== "settings") {
        closeAll();
      }
      if (panel === "design") deps.onDesignOpen();
      if (panel === "compare") deps.onCompareOpen();
      if (panel === "presets") deps.onPresetsOpen();
    }

    if (!nextOpen) {
      closePanel(panel, options);
      activateCurrentTab();
      updateCanvasSlideOpenState();
      return;
    }

    state[panel] = true;
    setDataset(panel, true);
    deps.shell.activateRightTab(panel);
    if (panel === "settings") {
      deps.onSettingsOpen();
    }
    if (panel === "history") {
      deps.onHistoryOpen();
    }
    updateCanvasSlideOpenState();
  }

  function toggle(panel: ViewerPanelKey, options?: { restoreRoam?: boolean }): void {
    setOpen(panel, !state[panel], options);
  }

  return {
    setOpen,
    toggle,
    closeAll,
    isOpen: (panel) => state[panel],
    isAnyOpen: () => Object.values(state).some(Boolean),
    snapshot: () => ({ ...state }),
  };
}
