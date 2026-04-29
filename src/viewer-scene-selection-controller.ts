import type { SceneOption, ViewerManifest } from "./viewer-types";
import { loadManifest, updateQueryLayout } from "./viewer-api";
import { compactUiLabel, makeSceneOptions } from "./viewer-scene-options";

export type ViewerSceneSelectionController = {
  loadLayoutSelection: (layoutPath: string) => Promise<void>;
  populateSceneOptions: (manifest: ViewerManifest) => SceneOption[];
  selectedSceneOption: () => SceneOption | undefined;
  sceneOptionByKey: (key: string) => SceneOption | undefined;
};

export type ViewerSceneSelectionControllerDeps = {
  selectEl: HTMLSelectElement;
  errorEl: HTMLElement;
  setStatus: (message: string) => void;
  clearError: (element: HTMLElement) => void;
  setCurrentLayoutPath: (layoutPath: string) => void;
  setCurrentManifest: (manifest: ViewerManifest) => void;
  loadScene: (option: SceneOption) => Promise<void>;
  afterLayoutLoaded: () => void;
};

export function createViewerSceneSelectionController(
  deps: ViewerSceneSelectionControllerDeps,
): ViewerSceneSelectionController {
  const optionsByKey = new Map<string, SceneOption>();

  function populateSceneOptions(manifest: ViewerManifest): SceneOption[] {
    optionsByKey.clear();
    deps.selectEl.innerHTML = "";
    const options = makeSceneOptions(manifest);
    for (const option of options) {
      optionsByKey.set(option.key, option);
      const optionEl = document.createElement("option");
      optionEl.value = option.key;
      optionEl.textContent = compactUiLabel(option.label, 42);
      optionEl.title = option.label;
      deps.selectEl.appendChild(optionEl);
    }
    deps.selectEl.disabled = options.length === 0;
    const selectedOption = options.find((option) => option.key === deps.selectEl.value) ?? options[0];
    deps.selectEl.title = selectedOption?.label ?? "";

    return options;
  }

  async function loadLayoutSelection(layoutPath: string): Promise<void> {
    deps.clearError(deps.errorEl);
    deps.setStatus("Loading scene set…");
    deps.setCurrentLayoutPath(layoutPath);
    const manifest = await loadManifest(layoutPath);
    deps.setCurrentManifest(manifest);
    const options = populateSceneOptions(manifest);
    if (options.length === 0) {
      throw new Error("No viewable GLB entries were found in this scene layout.");
    }
    const defaultSelection = manifest.default_selection as string;
    const defaultKey = optionsByKey.has(defaultSelection) ? defaultSelection : options[0]?.key ?? "";
    deps.selectEl.value = defaultKey;
    deps.selectEl.title = optionsByKey.get(defaultKey)?.label ?? "";
    updateQueryLayout(layoutPath);
    await deps.loadScene(optionsByKey.get(defaultKey) ?? options[0]!);
    deps.afterLayoutLoaded();
  }

  return {
    loadLayoutSelection,
    populateSceneOptions,
    selectedSceneOption: () => optionsByKey.get(deps.selectEl.value),
    sceneOptionByKey: (key) => optionsByKey.get(key),
  };
}
