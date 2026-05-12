import { renderViewerSettingsPanelHtml } from "../viewer-settings-panel";
import { renderDesignPanelHtml } from "./designPanel";
import { renderHelpPanelHtml } from "./helpPanel";
import type { ViewerPanelText, ViewerRightTab } from "./types";

function renderEvaluatePanelHtml(): string {
  return `
    <aside id="viewer-evaluate-panel" class="viewer-slide-panel" data-open="false">
      <div class="viewer-slide-panel-header">
        <div>
          <div class="viewer-slide-panel-title" data-i18n-key="viewer.evaluate.title">Design Evaluation</div>
          <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.evaluate.subtitle">AI-driven layout assessment and suggestions</div>
        </div>
        <button id="viewer-evaluate-close" class="viewer-settings-close" type="button" aria-label="Close evaluation">x</button>
      </div>
      <div id="viewer-evaluate-content" class="viewer-slide-panel-body">
        <div class="viewer-evaluate-empty">Click "Run Evaluation" to analyze the current layout.</div>
      </div>
      <div class="viewer-slide-panel-footer">
        <button id="viewer-evaluate-run" class="viewer-nav-button" type="button">Run Evaluation</button>
      </div>
    </aside>
  `;
}

function renderComparePanelHtml(): string {
  return `
    <aside id="viewer-compare-panel" class="viewer-slide-panel" data-open="false">
      <div class="viewer-slide-panel-header">
        <div>
          <div class="viewer-slide-panel-title" data-i18n-key="viewer.compare.title">Layout Comparison</div>
          <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.compare.subtitle">Compare two layouts side-by-side</div>
        </div>
        <button id="viewer-compare-close" class="viewer-settings-close" type="button" aria-label="Close comparison">x</button>
      </div>
      <div class="viewer-slide-panel-body">
        <div class="viewer-compare-selectors">
          <div class="viewer-compare-col">
            <label class="viewer-settings-label" for="compare-layout-a">Layout A</label>
            <select id="compare-layout-a" class="viewer-select viewer-select-compact"></select>
          </div>
          <div class="viewer-compare-col">
            <label class="viewer-settings-label" for="compare-layout-b">Layout B</label>
            <select id="compare-layout-b" class="viewer-select viewer-select-compact"></select>
          </div>
        </div>
        <div id="viewer-compare-results" class="viewer-compare-results"></div>
      </div>
    </aside>
  `;
}

function renderHistoryPanelHtml(): string {
  return `
    <aside id="viewer-history-analysis-panel" class="viewer-slide-panel" data-open="false">
      <div class="viewer-slide-panel-header">
        <div>
          <div class="viewer-slide-panel-title" data-i18n-key="viewer.history.title">History Analysis</div>
          <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.history.subtitle">Scatter plot analysis of scene generation history</div>
        </div>
        <button id="viewer-history-analysis-close" class="viewer-settings-close" type="button" aria-label="Close history">x</button>
      </div>
      <div id="viewer-history-analysis-content" class="viewer-slide-panel-body">
        <div class="viewer-history-tabs">
          <button class="viewer-history-tab" data-tab="scatter" data-active="true" data-i18n-key="viewer.history.scatter">Scatter</button>
          <button class="viewer-history-tab" data-tab="frequency" data-i18n-key="viewer.history.frequency">Frequency</button>
          <button class="viewer-history-tab" data-tab="trend" data-i18n-key="viewer.history.trend">Trend</button>
          <button class="viewer-history-tab" data-tab="scores" data-i18n-key="viewer.history.scores">Three-System Scores</button>
        </div>
        <div id="viewer-history-scatter-plot" class="viewer-history-tab-panel" data-tab="scatter" data-active="true" style="width: 100%;"></div>
        <div id="viewer-history-frequency" class="viewer-history-tab-panel" data-tab="frequency" data-active="false" style="width: 100%;"></div>
        <div id="viewer-history-trend" class="viewer-history-tab-panel" data-tab="trend" data-active="false" style="width: 100%;"></div>
        <div id="viewer-history-scores" class="viewer-history-tab-panel" data-tab="scores" data-active="false" style="width: 100%;"></div>
      </div>
    </aside>
  `;
}

function renderPresetsPanelHtml(): string {
  return `
    <aside id="viewer-presets-panel" class="viewer-slide-panel" data-open="false">
      <div class="viewer-slide-panel-header">
        <div>
          <div class="viewer-slide-panel-title" data-i18n-key="viewer.presets.title">Scene Presets</div>
          <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.presets.subtitle">Pre-configured scene styles. The highlighted card matches the currently loaded scene's generation preset.</div>
        </div>
        <button id="viewer-presets-close" class="viewer-settings-close" type="button" aria-label="Close presets">x</button>
      </div>
      <div id="viewer-presets-grid" class="viewer-presets-grid"></div>
    </aside>
  `;
}

function renderFloatingLanePanelHtml(): string {
  return `
    <div id="viewer-floating-lane-panel-host" class="floating-lane-inline-host">
      <div class="desktop-shell-empty-state">Click Floating Lane button to enable overlay controls.</div>
    </div>
  `;
}

export function createViewerRightTabs(t: ViewerPanelText): ViewerRightTab[] {
  return [
    { id: "settings", label: t("Settings", "设置"), content: renderViewerSettingsPanelHtml() },
    { id: "design", label: t("Design", "设计"), content: renderDesignPanelHtml() },
    { id: "evaluate", label: t("Evaluate", "评估"), content: renderEvaluatePanelHtml() },
    { id: "compare", label: t("Compare", "对比"), content: renderComparePanelHtml() },
    { id: "history", label: t("History", "历史"), content: renderHistoryPanelHtml() },
    { id: "presets", label: t("Presets", "预设"), content: renderPresetsPanelHtml() },
    { id: "floating-lane", label: t("Floating Lane", "浮动车道"), content: renderFloatingLanePanelHtml() },
    { id: "help", label: t("Help", "帮助"), content: renderHelpPanelHtml() },
  ];
}
