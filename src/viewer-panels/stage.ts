import { renderDesignPanelHtml } from "./designPanel";
import { renderHelpPanelHtml } from "./helpPanel";
import { renderViewerSettingsPanelHtml } from "../viewer-settings-panel";

export function createViewerStageHtml(): string {
  return `
    <div class="viewer-shell viewer-shell-embedded">

      <div class="stage-toolbar" data-od-id="stage-toolbar">
        <div class="stage-toolbar-group stage-toolbar-flow" data-od-id="toolbar-left" aria-label="Generation and view controls" data-i18n-aria-label-key="viewer.stage.workflow">
          <button class="stage-toolbar-button stage-toolbar-button-primary stage-flow-step" type="button" id="viewer-generate-and-load" aria-haspopup="dialog" aria-controls="viewer-generation-dialog">
            <span data-i18n-key="viewer.stage.generateLoad">Generate &amp; Load</span>
          </button>
          <span class="stage-toolbar-divider" aria-hidden="true"></span>
          <div class="stage-view-step">
            <span class="stage-view-label" data-i18n-key="viewer.stage.viewMode">View</span>
            <div class="stage-segmented" aria-label="Canvas mode" data-i18n-aria-label-key="viewer.stage.canvasMode">
              <button type="button" aria-pressed="true" id="viewer-mode-3d">3D</button>
              <button type="button" aria-pressed="false" id="viewer-mode-2d">2D</button>
              <button type="button" aria-pressed="false" id="viewer-mode-graph" hidden aria-hidden="true" tabindex="-1">Graph</button>
            </div>
          </div>
          <span class="stage-toolbar-divider" aria-hidden="true"></span>
          <button class="stage-toolbar-button" type="button" id="viewer-sync-camera" data-i18n-key="viewer.stage.resetView">Reset View</button>
        </div>
        <div class="stage-toolbar-group stage-toolbar-output" data-od-id="toolbar-right">
          <button class="stage-toolbar-button" type="button" id="viewer-open-camera-surface-diagnostic" title="相机局部几何诊断">QA 100m</button>
          <button class="stage-toolbar-button" type="button" id="viewer-export-topdown-map" data-shell-action="file-export-png">PNG</button>
          <button class="stage-toolbar-button" type="button" id="viewer-export-topdown-svg" data-shell-action="file-export-svg">SVG</button>
          <span class="stage-pill" data-tone="ok" id="viewer-topology-pill">topology_ok</span>
          <span class="stage-pill" id="viewer-geo-pill">geo_delta —</span>
        </div>
      </div>

      <div id="viewer-canvas" class="viewer-canvas"></div>

      <section id="viewer-empty-state" class="viewer-empty-state" aria-live="polite" hidden></section>

      <aside id="viewer-starter-demo-banner" class="viewer-starter-demo-banner" aria-live="polite" hidden>
        <div>
          <span>BUILT-IN DEMO</span>
          <strong data-starter-demo-label>内置示例 · 广州完整十字路口</strong>
          <small data-starter-demo-summary>真实 OSM · 透明建筑白模 · 代表性街道设施</small>
        </div>
        <div class="viewer-starter-demo-actions">
          <button type="button" data-starter-action="materialize">使用此示例开始</button>
          <button type="button" data-starter-action="source">选择自己的 OSM 研究区</button>
        </div>
      </aside>

      <aside id="viewer-legacy-starter-warning" class="viewer-legacy-starter-warning" role="status" aria-live="polite" hidden>
        <div>
          <span>GEOMETRY NOTICE</span>
          <strong data-legacy-starter-title>旧版示例存在已知几何问题</strong>
          <small data-legacy-starter-summary>当前场景可能出现道路缺角、针状铺装或背景地面暴露。</small>
        </div>
        <button type="button" data-starter-action="upgrade">进入已修复的广州 v6 示例</button>
      </aside>

      <div id="viewer-design-workspace" class="viewer-design-workspace" hidden></div>

      <section id="viewer-center-controls" class="viewer-center-controls" data-open="false" aria-labelledby="viewer-center-controls-title">
        <header class="viewer-center-controls-header">
          <div>
            <span class="viewer-center-controls-kicker" data-i18n-key="viewer.sceneBrowser.kicker">SCENE</span>
            <h2 id="viewer-center-controls-title" data-i18n-key="viewer.sceneBrowser.title">Scene Browser</h2>
            <p data-i18n-key="viewer.sceneBrowser.description">Choose a generated result or scene. The 3D stage remains visible behind this panel.</p>
          </div>
          <button id="viewer-center-controls-close" class="viewer-center-controls-close" type="button" aria-label="Close scene browser" data-i18n-aria-label-key="viewer.sceneBrowser.close">×</button>
        </header>
        <div class="viewer-center-controls-body">
          <label class="desktop-shell-field">
            <span data-i18n-key="viewer.left.recentResult">Recent Result</span>
            <select id="layout-select" class="viewer-select viewer-select-inline" title="Recent Result" data-i18n-title-key="viewer.left.recentResult"></select>
          </label>
          <label class="desktop-shell-field">
            <span data-i18n-key="viewer.left.scene">Scene</span>
            <select id="scene-select" class="viewer-select viewer-select-inline" title="Scene" data-i18n-title-key="viewer.left.scene"></select>
          </label>
          <div id="viewer-scheme-compare" class="viewer-scheme-compare"></div>
        </div>
      </section>

      <button id="viewer-exit-compare3d" class="viewer-exit-compare3d" type="button" hidden data-i18n-key="viewer.compare.exit">Exit Split View</button>

      <div id="viewer-crosshair" class="viewer-crosshair" hidden></div>
      <div id="viewer-info-card" class="viewer-info-card" hidden></div>

      <div id="viewer-minimap" class="viewer-minimap">
        <div class="viewer-minimap-title">
          <span data-i18n-key="viewer.minimap.title">Scene Map</span>
          <button id="viewer-minimap-expand" class="viewer-minimap-expand" type="button" aria-label="Expand Scene Map" title="Expand Scene Map" data-i18n-aria-label-key="viewer.minimap.expand" data-i18n-title-key="viewer.minimap.expand">&#x26F6;</button>
        </div>
        <div id="viewer-minimap-canvas" class="viewer-minimap-canvas"></div>
        <canvas id="viewer-minimap-overlay" class="viewer-minimap-overlay"></canvas>
      </div>

      <canvas id="viewer-axis-hud" class="viewer-axis-hud"></canvas>

      <div id="viewer-overlay" class="viewer-overlay" data-i18n-key="viewer.overlay.capture">Click scene to capture mouse</div>

      <aside id="viewer-object-edit-status" class="viewer-object-edit-status" aria-live="polite" aria-label="Scene object editing status" hidden>
        <div class="viewer-object-edit-copy">
          <strong data-object-edit-title>Editing objects</strong>
          <span data-object-edit-detail>Select a tree or street object</span>
          <small data-object-edit-save>No pending edits</small>
        </div>
        <button id="viewer-object-edit-exit" class="viewer-object-edit-exit" type="button">Exit editing</button>
      </aside>


      <div id="viewer-generation-dialog" class="viewer-generation-dialog" data-open="false" role="dialog" aria-modal="true" aria-labelledby="viewer-generation-dialog-title" tabindex="-1">
        <div class="viewer-generation-dialog-backdrop" data-close-generation></div>
        <div class="viewer-generation-dialog-panel">
          <div class="viewer-generation-dialog-head">
            <div>
              <h2 id="viewer-generation-dialog-title" data-i18n-key="viewer.generationDialog.title">Generation Control</h2>
              <p data-i18n-key="viewer.generationDialog.subtitle">Full generation flow in a dialog; confirm to return to the stage view.</p>
            </div>
            <button class="viewer-settings-close" type="button" aria-label="Close generation control" data-i18n-aria-label-key="viewer.generationDialog.close" data-close-generation>x</button>
          </div>
          <div class="viewer-generation-primary-tabs" role="tablist" aria-label="3D 场景生成步骤">
            <button id="viewer-generation-tab-source" type="button" role="tab" aria-selected="true" aria-controls="viewer-generation-page-source" tabindex="0" data-generation-primary-tab="source" data-status="pending"><span>01</span><strong>输入来源</strong><i aria-hidden="true"></i></button>
            <button id="viewer-generation-tab-strategy" type="button" role="tab" aria-selected="false" aria-controls="viewer-generation-page-strategy" tabindex="-1" data-generation-primary-tab="strategy" data-status="pending"><span>02</span><strong>生成策略</strong><i aria-hidden="true"></i></button>
            <button id="viewer-generation-tab-output" type="button" role="tab" aria-selected="false" aria-controls="viewer-generation-page-output" tabindex="-1" data-generation-primary-tab="output" data-status="pending"><span>03</span><strong>输出结果</strong><i aria-hidden="true"></i></button>
          </div>
          <div class="viewer-generation-dialog-body">
            ${renderDesignPanelHtml()}
          </div>
        </div>
      </div>

      ${renderViewerSettingsPanelHtml()}

      <div id="viewer-presets-panel" class="viewer-slide-panel" data-open="false">
        <div class="viewer-slide-panel-header">
          <div>
            <div class="viewer-slide-panel-title" data-i18n-key="viewer.presets.title">Scene Presets</div>
            <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.presets.subtitle">Pre-configured scene styles.</div>
          </div>
          <button id="viewer-presets-close" class="viewer-settings-close" type="button" aria-label="Close presets" data-i18n-aria-label-key="viewer.presets.close">x</button>
        </div>
        <div id="viewer-presets-grid" class="viewer-presets-grid" />
      </div>

      ${renderHelpPanelHtml()}

      <div id="viewer-error" class="viewer-error" hidden></div>
    </div>
  `;
}
