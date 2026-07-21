import { HistoryFrequencyChart } from "./history-frequency-chart";
import { HistoryScatterPlot, type SceneHistoryEntry } from "./history-scatter-plot";
import { ThreeSystemScorePanel } from "./history-three-system-scores";
import { HistoryTrendChart } from "./history-trend-chart";
import { applyViewerTranslations, viewerText } from "./viewer-i18n";
import type { ViewerLanguage } from "./viewer-i18n";
import type { RecentLayout, ViewerManifest } from "./viewer-types";

type HistoryPanelDeps = {
  contentEl: HTMLElement;
  getLanguage: () => ViewerLanguage;
  loadRecentLayouts: (limit?: number, useCache?: boolean, offset?: number) => Promise<RecentLayout[]>;
  loadManifest: (layoutPath: string, useCache?: boolean) => Promise<ViewerManifest>;
};

export type HistoryPanelController = {
  loadAndRenderHistory: (forceRefresh?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  setActive: (active: boolean) => void;
  refreshLanguage: () => Promise<void>;
  setupTabs: () => void;
};

type HistoryLoadState = "idle" | "loading" | "ready" | "partial" | "error";
const HISTORY_CACHE_TTL_MS = 60 * 1000;
const HISTORY_PAGE_SIZE = 20;
const HISTORY_CONCURRENCY = 4;

export function createHistoryPanelController(deps: HistoryPanelDeps): HistoryPanelController {
  const { contentEl, getLanguage, loadRecentLayouts, loadManifest } = deps;
  let historyScatterPlot: HistoryScatterPlot | null = null;
  let historyFrequencyChart: HistoryFrequencyChart | null = null;
  let historyTrendChart: HistoryTrendChart | null = null;
  let historyThreeSystemScores: ThreeSystemScorePanel | null = null;
  let cachedHistoryData: SceneHistoryEntry[] = [];
  let lastHistoryLoadTime = 0;
  let loadedLayoutCount = 0;
  let hasMore = false;
  let active = false;
  let requestVersion = 0;
  let loadState: HistoryLoadState = "idle";
  let failedCount = 0;

  const text = (en: string, zh: string) => viewerText(getLanguage(), en, zh);
  const stateEl = () => contentEl.querySelector<HTMLElement>("#viewer-history-load-state");
  const moreEl = () => contentEl.querySelector<HTMLButtonElement>("#viewer-history-load-more");

  function renderLoadState(detail?: string): void {
    const host = stateEl();
    if (!host) return;
    host.dataset.state = loadState;
    const title = host.querySelector<HTMLElement>("[data-history-state-title]");
    const detailEl = host.querySelector<HTMLElement>("[data-history-state-detail]");
    const titles: Record<HistoryLoadState, string> = {
      idle: text("History is ready to load", "历史记录待加载"),
      loading: text("Loading history", "正在读取历史"),
      ready: text("History loaded", "历史记录已读取"),
      partial: text("History loaded with warnings", "历史记录已部分读取"),
      error: text("History could not be loaded", "历史记录读取失败"),
    };
    if (title) title.textContent = titles[loadState];
    if (detailEl) detailEl.textContent = detail ?? (
      loadState === "idle"
        ? text("Open this page to read the latest 20 results.", "打开本页后读取最近 20 条结果。")
        : ""
    );
    const loadMoreButton = moreEl();
    if (loadMoreButton) {
      loadMoreButton.hidden = !hasMore || loadState === "loading";
      loadMoreButton.disabled = loadState === "loading";
      loadMoreButton.textContent = text("Load more", "加载更多");
    }
  }

  function setupTabs(): void {
    const tabs = contentEl.querySelectorAll<HTMLButtonElement>(".viewer-history-tab");
    const panels = contentEl.querySelectorAll<HTMLElement>(".viewer-history-tab-panel");
    tabs.forEach((tab) => {
      if (tab.dataset.bound === "true") return;
      tab.dataset.bound = "true";
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        tabs.forEach((candidate) => (candidate.dataset.active = String(candidate.dataset.tab === target)));
        panels.forEach((panel) => (panel.dataset.active = String(panel.dataset.tab === target)));
      });
    });
    const loadMoreButton = moreEl();
    if (loadMoreButton && loadMoreButton.dataset.bound !== "true") {
      loadMoreButton.dataset.bound = "true";
      loadMoreButton.addEventListener("click", () => void loadMore());
    }
  }

  async function renderHistoryCharts(entries: SceneHistoryEntry[]): Promise<void> {
    if (!entries.length) return;
    const scatter = contentEl.querySelector<HTMLElement>("#viewer-history-scatter-plot");
    const frequency = contentEl.querySelector<HTMLElement>("#viewer-history-frequency");
    const trend = contentEl.querySelector<HTMLElement>("#viewer-history-trend");
    const scores = contentEl.querySelector<HTMLElement>("#viewer-history-scores");
    if (!scatter || !frequency || !trend || !scores) throw new Error("History chart containers are unavailable.");
    historyScatterPlot ??= new HistoryScatterPlot(scatter);
    historyFrequencyChart ??= new HistoryFrequencyChart(frequency);
    historyTrendChart ??= new HistoryTrendChart(trend);
    historyThreeSystemScores ??= new ThreeSystemScorePanel(scores);
    await historyScatterPlot.init(entries);
    await historyFrequencyChart.init(entries);
    await historyTrendChart.init(entries);
    await historyThreeSystemScores.init(entries);
    setupTabs();
  }

  async function loadManifestBatch(layouts: RecentLayout[], version: number, useCache: boolean): Promise<SceneHistoryEntry[]> {
    const results: SceneHistoryEntry[] = [];
    let cursor = 0;
    let completed = 0;
    const workers = Array.from({ length: Math.min(HISTORY_CONCURRENCY, layouts.length) }, async () => {
      while (cursor < layouts.length) {
        const layout = layouts[cursor++];
        try {
          const manifest = await loadManifest(layout.layout_path, useCache);
          if (manifest.summary) results.push({ ...layout, summary: { ...manifest.summary } });
        } catch (error) {
          failedCount += 1;
          console.warn(`Failed to load manifest for ${layout.layout_path}:`, error);
        }
        completed += 1;
        if (active && version === requestVersion) {
          renderLoadState(text(
            `Read ${completed}/${layouts.length} in this batch · ${loadedLayoutCount + completed} total`,
            `本批已读取 ${completed}/${layouts.length} · 共 ${loadedLayoutCount + completed} 条`,
          ));
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function loadPage(forceRefresh: boolean, append: boolean): Promise<void> {
    const version = ++requestVersion;
    loadState = "loading";
    failedCount = append ? failedCount : 0;
    if (!append) renderLoadState(text("Preparing the latest 20 results…", "正在准备最近 20 条结果…"));
    try {
      const offset = append ? loadedLayoutCount : 0;
      const layouts = await loadRecentLayouts(HISTORY_PAGE_SIZE, !forceRefresh, offset);
      if (!active || version !== requestVersion) return;
      const entries = await loadManifestBatch(layouts, version, !forceRefresh);
      if (!active || version !== requestVersion) return;
      cachedHistoryData = append ? [...cachedHistoryData, ...entries] : entries;
      loadedLayoutCount = offset + layouts.length;
      hasMore = layouts.length === HISTORY_PAGE_SIZE;
      lastHistoryLoadTime = Date.now();
      if (!cachedHistoryData.length) {
        loadState = "error";
        renderLoadState(text("No readable scene metrics were found.", "没有找到可读取的场景指标。"));
        return;
      }
      loadState = failedCount ? "partial" : "ready";
      renderLoadState(failedCount
        ? text(`${cachedHistoryData.length} usable results · ${failedCount} failed`, `${cachedHistoryData.length} 条可用 · ${failedCount} 条失败`)
        : text(`${cachedHistoryData.length} results are ready`, `${cachedHistoryData.length} 条结果已就绪`));
      await renderHistoryCharts(cachedHistoryData);
    } catch (error) {
      if (!active || version !== requestVersion) return;
      loadState = cachedHistoryData.length ? "partial" : "error";
      renderLoadState(error instanceof Error ? error.message : text("Unknown history error", "未知历史记录错误"));
    }
  }

  async function loadAndRenderHistory(forceRefresh = false): Promise<void> {
    setupTabs();
    const cacheValid = !forceRefresh && cachedHistoryData.length > 0
      && Date.now() - lastHistoryLoadTime < HISTORY_CACHE_TTL_MS;
    if (cacheValid) {
      loadState = failedCount ? "partial" : "ready";
      renderLoadState(text(`${cachedHistoryData.length} cached results`, `已缓存 ${cachedHistoryData.length} 条结果`));
      await renderHistoryCharts(cachedHistoryData);
      return;
    }
    await loadPage(forceRefresh, false);
  }

  async function loadMore(): Promise<void> {
    if (loadState === "loading" || !hasMore) return;
    await loadPage(false, true);
  }

  function setActive(nextActive: boolean): void {
    active = nextActive;
    if (!active) requestVersion += 1;
  }

  async function refreshLanguage(): Promise<void> {
    const activeTab = contentEl.querySelector<HTMLElement>(".viewer-history-tab[data-active=\"true\"]")?.dataset.tab;
    applyViewerTranslations(contentEl, getLanguage());
    renderLoadState();
    if (cachedHistoryData.length) await renderHistoryCharts(cachedHistoryData);
    if (activeTab) contentEl.querySelector<HTMLButtonElement>(`.viewer-history-tab[data-tab="${activeTab}"]`)?.click();
  }

  setupTabs();
  renderLoadState();
  return { loadAndRenderHistory, loadMore, setActive, refreshLanguage, setupTabs };
}
