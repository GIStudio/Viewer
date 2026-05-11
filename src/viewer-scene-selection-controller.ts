import type { SceneOption, ViewerManifest } from "./viewer-types";
import { loadManifest, updateQueryLayout, type LoadManifestOptions } from "./viewer-api";
import { compactUiLabel, makeSceneOptions } from "./viewer-scene-options";

export type ViewerSceneSelectionController = {
  loadLayoutSelection: (layoutPath: string, options?: LoadManifestOptions) => Promise<void>;
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
  const structurePreviewFallbackKeys = ["land_use_zoning", "road_base", "final_scene"];

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

  function defaultSceneKeyForManifest(
    manifest: ViewerManifest,
    options: SceneOption[],
    manifestOptions: LoadManifestOptions,
  ): { key: string; fallbackMessage: string } {
    const requestedKey = String(manifestOptions.defaultSceneOptionKey ?? "").trim();
    if (requestedKey) {
      const candidates = [
        requestedKey,
        ...structurePreviewFallbackKeys,
        String(manifest.default_selection ?? ""),
        options[0]?.key ?? "",
      ].filter(Boolean);
      for (const candidate of candidates) {
        if (!optionsByKey.has(candidate)) {
          continue;
        }
        const fallbackMessage = candidate === requestedKey
          ? ""
          : `Preview step "${requestedKey}" is unavailable; loaded ${optionsByKey.get(candidate)?.label ?? candidate}.`;
        return { key: candidate, fallbackMessage };
      }
    }

    const defaultSelection = String(manifest.default_selection ?? "");
    const key = optionsByKey.has(defaultSelection) ? defaultSelection : options[0]?.key ?? "";
    return { key, fallbackMessage: "" };
  }

  async function loadLayoutSelection(layoutPath: string, manifestOptions: LoadManifestOptions = {}): Promise<void> {
    deps.clearError(deps.errorEl);
    deps.setStatus("Loading scene set…");
    deps.setCurrentLayoutPath(layoutPath);
    const manifest = await loadManifest(layoutPath, true, manifestOptions);
    deps.setCurrentManifest(manifest);
    const options = populateSceneOptions(manifest);
    if (options.length === 0) {
      throw new Error("No viewable GLB entries were found in this scene layout.");
    }
    const { key: defaultKey, fallbackMessage } = defaultSceneKeyForManifest(manifest, options, manifestOptions);
    deps.selectEl.value = defaultKey;
    deps.selectEl.title = optionsByKey.get(defaultKey)?.label ?? "";
    updateQueryLayout(layoutPath);
    await deps.loadScene(optionsByKey.get(defaultKey) ?? options[0]!);
    if (fallbackMessage) {
      deps.setStatus(fallbackMessage);
    }
    deps.afterLayoutLoaded();
  }

  return {
    loadLayoutSelection,
    populateSceneOptions,
    selectedSceneOption: () => optionsByKey.get(deps.selectEl.value),
    sceneOptionByKey: (key) => optionsByKey.get(key),
  };
}
