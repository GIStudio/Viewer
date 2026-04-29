import type { RecentLayout, ViewerManifest } from "./viewer-types";
import { escapeHtml } from "./viewer-utils";
import { loadRecentLayouts } from "./viewer-api";

export type PresetConfig = {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
};

const BUILTIN_PRESETS: PresetConfig[] = [
  {
    id: "urban_downtown",
    name: "Urban Downtown",
    description: "Dense urban core with mixed-use streetscape, heavy pedestrian flow",
    config: { density: "high", style: "modern", road_type: "arterial", furniture_level: "full" },
  },
  {
    id: "residential_quiet",
    name: "Quiet Residential",
    description: "Low-density residential street with trees and minimal furniture",
    config: { density: "low", style: "suburban", road_type: "local", furniture_level: "minimal" },
  },
  {
    id: "waterfront_promenade",
    name: "Waterfront Promenade",
    description: "Scenic waterfront walkway with benches, lamps, and landscape",
    config: { density: "medium", style: "scenic", road_type: "promenade", furniture_level: "moderate" },
  },
  {
    id: "commercial_strip",
    name: "Commercial Strip",
    description: "Busy commercial street with bus stops, signage, and heavy furniture",
    config: { density: "high", style: "commercial", road_type: "collector", furniture_level: "full" },
  },
  {
    id: "park_pathway",
    name: "Park Pathway",
    description: "Green park pathway with scattered trees and landscape elements",
    config: { density: "low", style: "natural", road_type: "path", furniture_level: "light" },
  },
  {
    id: "transit_corridor",
    name: "Transit Corridor",
    description: "Transit-oriented corridor with bus stops, shelters, and wide sidewalks",
    config: { density: "high", style: "transit", road_type: "arterial", furniture_level: "full" },
  },
];

export type ViewerPresetsController = {
  populatePresetsGrid: () => void;
  applyPreset: (presetId: string) => Promise<void>;
  handleGridClick: (event: MouseEvent) => void;
};

export type ViewerPresetsControllerDeps = {
  presetsGridEl: HTMLElement;
  errorEl: HTMLElement;
  getCurrentManifest: () => ViewerManifest | null;
  closePresetsPanel: () => void;
  setStatus: (message: string) => void;
  setError: (element: HTMLElement, message: string) => void;
  flashStatus: (message: string) => void;
  loadLayoutSelection: (layoutPath: string) => Promise<void>;
  populateRecentLayoutOptions: (layouts: RecentLayout[], selectedPath: string) => void;
};

export function createViewerPresetsController(deps: ViewerPresetsControllerDeps): ViewerPresetsController {
  function populatePresetsGrid(): void {
    const activePresetId =
      (deps.getCurrentManifest()?.summary as Record<string, unknown> | undefined)?.preset_id as string | undefined || null;
    deps.presetsGridEl.innerHTML = BUILTIN_PRESETS.map((preset) => {
      const isActive = activePresetId && activePresetId === preset.id;
      return `
      <button class="viewer-preset-card${isActive ? " viewer-preset-card--active" : ""}" data-preset-id="${escapeHtml(preset.id)}" type="button">
        <div class="viewer-preset-name">${escapeHtml(preset.name)}</div>
        <div class="viewer-preset-desc">${escapeHtml(preset.description)}</div>
        ${isActive ? `<div class="viewer-preset-badge">Currently viewing</div>` : ""}
      </button>
    `;
    }).join("");
  }

  async function applyPreset(presetId: string): Promise<void> {
    const preset = BUILTIN_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    deps.setStatus(`Generating scene with preset: ${preset.name}...`);
    deps.closePresetsPanel();

    try {
      const response = await fetch("./api/design/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: preset.id, config: preset.config }),
      });
      const text = await response.text();
      if (!text) {
        throw new Error("Server returned empty response");
      }
      let result: { layout_path?: string; error?: string };
      try {
        result = JSON.parse(text) as { layout_path?: string; error?: string };
      } catch {
        throw new Error(`Invalid JSON: ${text.substring(0, 100)}`);
      }
      if (!response.ok) {
        throw new Error(result.error ?? "Scene generation failed.");
      }
      if (result.layout_path) {
        await deps.loadLayoutSelection(result.layout_path);
        const recent = await loadRecentLayouts();
        deps.populateRecentLayoutOptions(recent, result.layout_path);
        deps.flashStatus(`Preset "${preset.name}" applied successfully.`);
      } else {
        throw new Error("No layout_path returned from generation.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preset generation failed.";
      deps.setError(deps.errorEl, message);
      deps.flashStatus("Preset generation failed");
    }
  }

  function handleGridClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>("[data-preset-id]");
    if (card?.dataset.presetId) {
      void applyPreset(card.dataset.presetId);
    }
  }

  return {
    populatePresetsGrid,
    applyPreset,
    handleGridClick,
  };
}
