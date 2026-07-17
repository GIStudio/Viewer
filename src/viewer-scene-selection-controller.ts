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
  persistSelectionInUrl?: boolean;
};

export function createViewerSceneSelectionController(
  deps: ViewerSceneSelectionControllerDeps,
): ViewerSceneSelectionController {
  const optionsByKey = new Map<string, SceneOption>();
  const structurePreviewFallbackKeys = ["buildings", "poi_context", "land_use_zoning", "road_base", "final_scene"];
  const structurePreviewRequestedKeys = new Set(["scene_preview", "buildings", "land_use_zoning", "road_base", "poi_context"]);

  function manifestHasStreetFurniture(manifest: ViewerManifest): boolean {
    return Object.values(manifest.instances ?? {}).some((instance) => {
      const placementGroup = String(instance.placement_group ?? "").trim().toLowerCase();
      const category = String(instance.category ?? "").trim().toLowerCase();
      return placementGroup === "street_furniture" || [
        "bench",
        "bollard",
        "bus_stop",
        "hydrant",
        "lamp",
        "mailbox",
        "tree",
        "trash",
      ].includes(category);
    });
  }

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
      const requestedStructurePreview = structurePreviewRequestedKeys.has(requestedKey);
      const finalSceneHasFurniture = manifestHasStreetFurniture(manifest);
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
        if (candidate === "final_scene" && requestedStructurePreview && finalSceneHasFurniture) {
          continue;
        }
        const fallbackMessage = candidate === requestedKey
          ? ""
          : `Preview step "${requestedKey}" is unavailable; loaded ${optionsByKey.get(candidate)?.label ?? candidate}.`;
        return { key: candidate, fallbackMessage };
      }
      if (requestedStructurePreview && finalSceneHasFurniture) {
        throw new Error(`Preview step "${requestedKey}" is unavailable and the final scene contains street furniture.`);
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
    if (deps.persistSelectionInUrl !== false && manifestOptions.persistSelectionInUrl !== false) {
      updateQueryLayout(layoutPath);
    }
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
