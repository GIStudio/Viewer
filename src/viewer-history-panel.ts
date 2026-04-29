import { HistoryFrequencyChart } from "./history-frequency-chart";
import { HistoryScatterPlot, type SceneHistoryEntry } from "./history-scatter-plot";
import { ThreeSystemScorePanel } from "./history-three-system-scores";
import { HistoryTrendChart } from "./history-trend-chart";
import type { RecentLayout, ViewerManifest } from "./viewer-types";

type HistoryPanelDeps = {
  contentEl: HTMLElement;
  loadRecentLayouts: (limit?: number, useCache?: boolean) => Promise<RecentLayout[]>;
  loadManifest: (layoutPath: string, useCache?: boolean) => Promise<ViewerManifest>;
};

export type HistoryPanelController = {
  loadAndRenderHistory: (forceRefresh?: boolean) => Promise<void>;
  setupTabs: () => void;
};

const HISTORY_CACHE_TTL_MS = 60 * 1000;

export function createHistoryPanelController(deps: HistoryPanelDeps): HistoryPanelController {
  const { contentEl, loadRecentLayouts, loadManifest } = deps;
  let historyScatterPlot: HistoryScatterPlot | null = null;
  let historyFrequencyChart: HistoryFrequencyChart | null = null;
  let historyTrendChart: HistoryTrendChart | null = null;
  let historyThreeSystemScores: ThreeSystemScorePanel | null = null;
  let cachedHistoryData: SceneHistoryEntry[] | null = null;
  let lastHistoryLoadTime = 0;

  function setupTabs(): void {
    const tabs = contentEl.querySelectorAll<HTMLButtonElement>(".viewer-history-tab");
    const panels = contentEl.querySelectorAll<HTMLElement>(".viewer-history-tab-panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab!;
        tabs.forEach((candidate) => (candidate.dataset.active = String(candidate.dataset.tab === target)));
        panels.forEach((panel) => (panel.dataset.active = String(panel.dataset.tab === target)));
      });
    });
  }

  async function renderHistoryCharts(scenesWithMetrics: SceneHistoryEntry[]): Promise<void> {
    if (scenesWithMetrics.length === 0) return;

    if (!historyScatterPlot) {
      historyScatterPlot = new HistoryScatterPlot(
        contentEl.querySelector<HTMLElement>("#viewer-history-scatter-plot")!,
      );
    }

    if (!historyFrequencyChart) {
      historyFrequencyChart = new HistoryFrequencyChart(
        contentEl.querySelector<HTMLElement>("#viewer-history-frequency")!,
      );
    }

    if (!historyTrendChart) {
      historyTrendChart = new HistoryTrendChart(
        contentEl.querySelector<HTMLElement>("#viewer-history-trend")!,
      );
    }

    if (!historyThreeSystemScores) {
      historyThreeSystemScores = new ThreeSystemScorePanel(
        contentEl.querySelector<HTMLElement>("#viewer-history-scores")!,
      );
    }

    await historyScatterPlot.init(scenesWithMetrics);
    await historyFrequencyChart.init(scenesWithMetrics);
    await historyTrendChart.init(scenesWithMetrics);
    await historyThreeSystemScores.init(scenesWithMetrics);

    setupTabs();
  }

  async function loadAndRenderHistory(forceRefresh = false): Promise<void> {
    try {
      const now = Date.now();
      const cacheValid = !forceRefresh && cachedHistoryData !== null && (now - lastHistoryLoadTime) < HISTORY_CACHE_TTL_MS;

      if (cacheValid && cachedHistoryData !== null && cachedHistoryData.length > 0) {
        await renderHistoryCharts(cachedHistoryData);
        return;
      }

      contentEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #64748b;">
          <div style="margin-bottom: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" style="animation: spin 1s linear infinite; vertical-align: middle;">
              <circle cx="12" cy="12" r="10" stroke="#e2e8f0" stroke-width="3" fill="none"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="#3b82f6" stroke-width="3" fill="none" stroke-linecap="round"/>
            </svg>
            <span style="margin-left: 8px;">Loading history data...</span>
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 8px;">Using cached data if available</p>
        </div>
        <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
      `;

      const recentLayouts = await loadRecentLayouts(50, !forceRefresh);
      const scenesWithMetrics: SceneHistoryEntry[] = [];
      const total = recentLayouts.length;
      let loaded = 0;

      for (const layout of recentLayouts) {
        try {
          const manifest = await loadManifest(layout.layout_path, !forceRefresh);
          if (manifest.summary) {
            scenesWithMetrics.push({
              layout_path: layout.layout_path,
              label: layout.label,
              relative_path: layout.relative_path,
              updated_at: layout.updated_at,
              mtime_ms: layout.mtime_ms,
              summary: { ...manifest.summary },
            });
          }
        } catch (error) {
          console.warn(`Failed to load manifest for ${layout.layout_path}:`, error);
        }
        loaded++;

        if (loaded % 10 === 0 || loaded === total) {
          contentEl.querySelector(".loading-progress")?.setAttribute(
            "data-progress",
            `${loaded}/${total}`,
          );
        }
      }

      if (scenesWithMetrics.length === 0) {
        contentEl.innerHTML = `
          <div style="padding: 24px; text-align: center; color: #999;">
            <p>No scene data with metrics found.</p>
            <p style="font-size: 12px; margin-top: 8px;">Generate some scenes first, then return here to analyze the history.</p>
          </div>
        `;
        return;
      }

      cachedHistoryData = scenesWithMetrics;
      lastHistoryLoadTime = Date.now();

      await renderHistoryCharts(scenesWithMetrics);
    } catch (error) {
      console.error("Failed to load history data:", error);
      contentEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #f5222d;">
          <p>Failed to load history data.</p>
          <p style="font-size: 12px; margin-top: 8px;">${error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      `;
    }
  }

  return {
    loadAndRenderHistory,
    setupTabs,
  };
}
