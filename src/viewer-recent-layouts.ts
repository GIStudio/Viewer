import type { RecentLayout } from "./viewer-types";

const SCENE_NAME_STORAGE_KEY = "roadgen3d:scene-display-names:v1";

type StoredSceneName = {
  ordinal: number;
  name?: string;
};

export type RecentLayoutSelectorController = {
  populate: (layouts: RecentLayout[], selectedPath: string) => void;
  hydrate: (selectedPath: string, initialLoaded: number) => void;
  currentLayouts: () => RecentLayout[];
  labelFor: (layoutPath: string) => string;
  setSelectedPath: (layoutPath: string) => void;
  rename: (layoutPath: string, name: string) => string;
  refreshLabels: () => void;
};

export type RecentLayoutSelectorControllerDeps = {
  selectEl: HTMLSelectElement;
  loadRecentLayouts: (limit?: number, useCache?: boolean, offset?: number) => Promise<RecentLayout[]>;
  setRecentLayouts: (layouts: RecentLayout[], selectedPath: string) => void;
  shouldStopHydration: () => boolean;
  isCompareOpen: () => boolean;
  refreshCompareSelectors: () => void;
  defaultLabel: (ordinal: number) => string;
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
  const sceneNames = loadStoredSceneNames();
  const backgroundLimit = deps.backgroundLimit ?? DEFAULT_BACKGROUND_LIMIT;
  const backgroundBatch = deps.backgroundBatch ?? DEFAULT_BACKGROUND_BATCH;

  function loadStoredSceneNames(): Record<string, StoredSceneName> {
    try {
      const value = JSON.parse(window.localStorage.getItem(SCENE_NAME_STORAGE_KEY) ?? "{}") as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      const names: Record<string, StoredSceneName> = {};
      for (const [path, candidate] of Object.entries(value as Record<string, unknown>)) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
        const record = candidate as Record<string, unknown>;
        const ordinal = Number(record.ordinal);
        if (!path || !Number.isInteger(ordinal) || ordinal < 1) continue;
        const name = typeof record.name === "string" ? record.name.trim().slice(0, 48) : "";
        names[path] = name ? { ordinal, name } : { ordinal };
      }
      return names;
    } catch {
      return {};
    }
  }

  function persistSceneNames(): void {
    try {
      window.localStorage.setItem(SCENE_NAME_STORAGE_KEY, JSON.stringify(sceneNames));
    } catch {
      // Display names are a convenience. The selector remains usable without storage.
    }
  }

  function storedName(layoutPath: string): StoredSceneName {
    const existing = sceneNames[layoutPath];
    if (existing) return existing;
    const ordinal = Math.max(0, ...Object.values(sceneNames).map((item) => item.ordinal)) + 1;
    const created = { ordinal };
    sceneNames[layoutPath] = created;
    persistSceneNames();
    return created;
  }

  function displayName(layoutPath: string): string {
    const entry = storedName(layoutPath);
    return entry.name || deps.defaultLabel(entry.ordinal);
  }

  function updateOption(optionEl: HTMLOptionElement): void {
    const label = displayName(optionEl.value);
    optionEl.textContent = label;
    optionEl.title = label;
  }

  function publish(selectedPath: string): void {
    deps.selectEl.disabled = deps.selectEl.options.length === 0;
    deps.setRecentLayouts(Array.from(layoutsByPath.values()), selectedPath);
  }

  function ensureDirectOption(selectedPath: string): void {
    if (!selectedPath || Array.from(deps.selectEl.options).some((option) => option.value === selectedPath)) {
      return;
    }
    const optionEl = document.createElement("option");
    optionEl.value = selectedPath;
    updateOption(optionEl);
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
      updateOption(optionEl);
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
    return displayName(layoutPath);
  }

  function rename(layoutPath: string, name: string): string {
    const entry = storedName(layoutPath);
    const normalized = name.trim().replace(/\s+/g, " ").slice(0, 48);
    if (normalized) entry.name = normalized;
    else delete entry.name;
    persistSceneNames();
    refreshLabels();
    return displayName(layoutPath);
  }

  function refreshLabels(): void {
    Array.from(deps.selectEl.options).forEach(updateOption);
    const selectedPath = deps.selectEl.value;
    deps.selectEl.title = selectedPath ? displayName(selectedPath) : "";
  }

  return {
    populate,
    hydrate,
    currentLayouts: () => Array.from(layoutsByPath.values()),
    labelFor,
    setSelectedPath,
    rename,
    refreshLabels,
  };
}
