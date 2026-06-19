import type { RecentLayout } from "./viewer-types";
import { compactUiLabel, makeDirectLayoutLabel } from "./viewer-scene-options";

export type RecentLayoutSelectorController = {
  populate: (layouts: RecentLayout[], selectedPath: string) => void;
  hydrate: (selectedPath: string, initialLoaded: number) => void;
  currentLayouts: () => RecentLayout[];
  labelFor: (layoutPath: string) => string;
  setSelectedPath: (layoutPath: string) => void;
};

export type RecentLayoutSelectorControllerDeps = {
  selectEl: HTMLSelectElement;
  loadRecentLayouts: (limit?: number, useCache?: boolean, offset?: number) => Promise<RecentLayout[]>;
  setRecentLayouts: (layouts: RecentLayout[], selectedPath: string) => void;
  shouldStopHydration: () => boolean;
  isCompareOpen: () => boolean;
  refreshCompareSelectors: () => void;
  backgroundLimit?: number;
  backgroundBatch?: number;
};

const DEFAULT_BACKGROUND_LIMIT = 20;
const DEFAULT_BACKGROUND_BATCH = 8;
const HYDRATION_PAUSE_MS = 120;

export function createRecentLayoutSelectorController(
  deps: RecentLayoutSelectorControllerDeps,
): RecentLayoutSelectorController {
  const layoutsByPath = new Map<string, RecentLayout>();
  const backgroundLimit = deps.backgroundLimit ?? DEFAULT_BACKGROUND_LIMIT;
  const backgroundBatch = deps.backgroundBatch ?? DEFAULT_BACKGROUND_BATCH;

  function publish(selectedPath: string): void {
    deps.selectEl.disabled = deps.selectEl.options.length === 0;
    deps.setRecentLayouts(Array.from(layoutsByPath.values()), selectedPath);
  }

  function ensureDirectOption(selectedPath: string): void {
    if (!selectedPath || Array.from(deps.selectEl.options).some((option) => option.value === selectedPath)) {
      return;
    }
    const directLabel = makeDirectLayoutLabel(selectedPath);
    const optionEl = document.createElement("option");
    optionEl.value = selectedPath;
    optionEl.textContent = compactUiLabel(directLabel);
    optionEl.title = directLabel;
    deps.selectEl.appendChild(optionEl);
  }

  function setSelectedPath(layoutPath: string): void {
    if (!layoutPath) {
      return;
    }
    ensureDirectOption(layoutPath);
    deps.selectEl.value = layoutPath;
    deps.selectEl.title = labelFor(layoutPath);
    deps.selectEl.disabled = deps.selectEl.options.length === 0;
  }

  function append(layouts: RecentLayout[], selectedPath: string): void {
    for (const layout of layouts) {
      if (layoutsByPath.has(layout.layout_path)) {
        continue;
      }
      layoutsByPath.set(layout.layout_path, layout);
      const optionEl = document.createElement("option");
      optionEl.value = layout.layout_path;
      optionEl.textContent = compactUiLabel(layout.label);
      optionEl.title = layout.label;
      deps.selectEl.appendChild(optionEl);
    }
    setSelectedPath(selectedPath);
    publish(selectedPath);
  }

  function populate(layouts: RecentLayout[], selectedPath: string): void {
    layoutsByPath.clear();
    deps.selectEl.innerHTML = "";
    append(layouts, selectedPath);
  }

  function hydrate(selectedPath: string, initialLoaded: number): void {
    const startOffset = Math.max(0, Math.min(initialLoaded, backgroundLimit));
    void (async () => {
      try {
        if (startOffset >= backgroundLimit) {
          return;
        }
        let nextOffset = startOffset;
        while (!deps.shouldStopHydration() && nextOffset < backgroundLimit) {
          const batch = Math.min(backgroundBatch, backgroundLimit - nextOffset);
          const pageLayouts = await deps.loadRecentLayouts(batch, true, nextOffset);
          if (deps.shouldStopHydration() || pageLayouts.length === 0) {
            return;
          }
          append(pageLayouts, selectedPath);
          if (deps.isCompareOpen()) {
            deps.refreshCompareSelectors();
          }
          nextOffset += pageLayouts.length;
          if (pageLayouts.length < batch) {
            return;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, HYDRATION_PAUSE_MS));
        }
      } catch (error) {
        console.warn("Failed to hydrate full recent-layouts list:", error);
      }
    })();
  }

  function labelFor(layoutPath: string): string {
    return layoutsByPath.get(layoutPath)?.label ?? makeDirectLayoutLabel(layoutPath);
  }

  return {
    populate,
    hydrate,
    currentLayouts: () => Array.from(layoutsByPath.values()),
    labelFor,
    setSelectedPath,
  };
}
