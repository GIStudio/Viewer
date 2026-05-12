import { renderHelpPanelHtml } from "./helpPanel";

export function EvaluatePanelShell() {
  return (
    <aside id="viewer-evaluate-panel" className="viewer-slide-panel" data-open="false">
      <div className="viewer-slide-panel-header">
        <div>
          <div className="viewer-slide-panel-title" data-i18n-key="viewer.evaluate.title">
            Design Evaluation
          </div>
          <div className="viewer-slide-panel-subtitle" data-i18n-key="viewer.evaluate.subtitle">
            AI-driven layout assessment and suggestions
          </div>
        </div>
        <button id="viewer-evaluate-close" className="viewer-settings-close" type="button" aria-label="Close evaluation">
          x
        </button>
      </div>
      <div id="viewer-evaluate-content" className="viewer-slide-panel-body">
        <div className="viewer-evaluate-empty">Click "Run Evaluation" to analyze the current layout.</div>
      </div>
      <div className="viewer-slide-panel-footer">
        <button id="viewer-evaluate-run" className="viewer-nav-button" type="button">
          Run Evaluation
        </button>
      </div>
    </aside>
  );
}

export function ComparePanelShell() {
  return (
    <aside id="viewer-compare-panel" className="viewer-slide-panel" data-open="false">
      <div className="viewer-slide-panel-header">
        <div>
          <div className="viewer-slide-panel-title" data-i18n-key="viewer.compare.title">
            Layout Comparison
          </div>
          <div className="viewer-slide-panel-subtitle" data-i18n-key="viewer.compare.subtitle">
            Compare two layouts side-by-side
          </div>
        </div>
        <button id="viewer-compare-close" className="viewer-settings-close" type="button" aria-label="Close comparison">
          x
        </button>
      </div>
      <div className="viewer-slide-panel-body">
        <div className="viewer-compare-selectors">
          <div className="viewer-compare-col">
            <label className="viewer-settings-label" htmlFor="compare-layout-a">Layout A</label>
            <select id="compare-layout-a" className="viewer-select viewer-select-compact" />
          </div>
          <div className="viewer-compare-col">
            <label className="viewer-settings-label" htmlFor="compare-layout-b">Layout B</label>
            <select id="compare-layout-b" className="viewer-select viewer-select-compact" />
          </div>
        </div>
        <div id="viewer-compare-results" className="viewer-compare-results" />
      </div>
    </aside>
  );
}

export function HistoryPanelShell() {
  return (
    <aside id="viewer-history-analysis-panel" className="viewer-slide-panel" data-open="false">
      <div className="viewer-slide-panel-header">
        <div>
          <div className="viewer-slide-panel-title" data-i18n-key="viewer.history.title">
            History Analysis
          </div>
          <div className="viewer-slide-panel-subtitle" data-i18n-key="viewer.history.subtitle">
            Scatter plot analysis of scene generation history
          </div>
        </div>
        <button
          id="viewer-history-analysis-close"
          className="viewer-settings-close"
          type="button"
          aria-label="Close history"
        >
          x
        </button>
      </div>
      <div id="viewer-history-analysis-content" className="viewer-slide-panel-body">
        <div className="viewer-history-tabs">
          <button className="viewer-history-tab" type="button" data-tab="scatter" data-active="true" data-i18n-key="viewer.history.scatter">Scatter</button>
          <button className="viewer-history-tab" type="button" data-tab="frequency" data-i18n-key="viewer.history.frequency">Frequency</button>
          <button className="viewer-history-tab" type="button" data-tab="trend" data-i18n-key="viewer.history.trend">Trend</button>
          <button className="viewer-history-tab" type="button" data-tab="scores" data-i18n-key="viewer.history.scores">Three-System Scores</button>
        </div>
        <div id="viewer-history-scatter-plot" className="viewer-history-tab-panel" data-tab="scatter" data-active="true" style={{ width: "100%" }} />
        <div id="viewer-history-frequency" className="viewer-history-tab-panel" data-tab="frequency" data-active="false" style={{ width: "100%" }} />
        <div id="viewer-history-trend" className="viewer-history-tab-panel" data-tab="trend" data-active="false" style={{ width: "100%" }} />
        <div id="viewer-history-scores" className="viewer-history-tab-panel" data-tab="scores" data-active="false" style={{ width: "100%" }} />
      </div>
    </aside>
  );
}

export function PresetsPanelShell() {
  return (
    <aside id="viewer-presets-panel" className="viewer-slide-panel" data-open="false">
      <div className="viewer-slide-panel-header">
        <div>
          <div className="viewer-slide-panel-title" data-i18n-key="viewer.presets.title">Scene Presets</div>
          <div className="viewer-slide-panel-subtitle" data-i18n-key="viewer.presets.subtitle">
            Pre-configured scene styles. The highlighted card matches the currently loaded scene's generation preset.
          </div>
        </div>
        <button id="viewer-presets-close" className="viewer-settings-close" type="button" aria-label="Close presets">
          x
        </button>
      </div>
      <div id="viewer-presets-grid" className="viewer-presets-grid" />
    </aside>
  );
}

export function FloatingLanePanelShell() {
  return (
    <div id="viewer-floating-lane-panel-host" className="floating-lane-inline-host">
      <div className="desktop-shell-empty-state">Click Floating Lane button to enable overlay controls.</div>
    </div>
  );
}

export function HelpPanelShell() {
  return <div dangerouslySetInnerHTML={{ __html: renderHelpPanelHtml() }} />;
}
