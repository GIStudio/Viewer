import { renderDesignPanelHtml } from "./designPanel";
import { renderHelpPanelHtml } from "./helpPanel";
import { renderViewerSettingsPanelHtml } from "../viewer-settings-panel";

export function createViewerStageHtml(): string {
  return `
    <div class="viewer-shell viewer-shell-embedded">
      <div class="stage-mobile-nav" aria-label="Mobile quick navigation">
        <button class="stage-mobile-button" type="button" id="viewer-mobile-settings">Settings</button>
        <button class="stage-mobile-button" type="button" id="viewer-mobile-generate">Generate</button>
        <button class="stage-mobile-button" type="button" id="viewer-mobile-analyze">Analyze</button>
      </div>

      <div class="stage-toolbar" data-od-id="stage-toolbar">
        <div class="stage-toolbar-group" data-od-id="toolbar-left">
          <div class="stage-segmented" aria-label="Canvas mode">
            <button type="button" aria-pressed="true" id="viewer-mode-3d">3D</button>
            <button type="button" aria-pressed="false" id="viewer-mode-2d">2D</button>
            <button type="button" aria-pressed="false" id="viewer-mode-graph">Graph</button>
          </div>
          <button class="stage-toolbar-button" type="button" id="viewer-compare-toggle">Split Compare</button>
          <button class="stage-toolbar-button" type="button" id="viewer-sync-camera">Sync Camera</button>
          <button class="stage-toolbar-button" type="button" id="viewer-design-toggle">Generate Settings</button>
          <button class="stage-toolbar-button" type="button" id="viewer-settings-toggle">Settings</button>
        </div>
        <div class="stage-toolbar-group" data-od-id="toolbar-right">
          <button class="stage-toolbar-button" type="button" id="viewer-export-topdown-map" data-shell-action="file-export-png">Export PNG</button>
          <button class="stage-toolbar-button" type="button" id="viewer-export-topdown-svg" data-shell-action="file-export-svg">Export SVG</button>
          <span class="stage-pill" data-tone="ok" id="viewer-topology-pill">topology_ok</span>
          <span class="stage-pill" id="viewer-geo-pill">geo_delta —</span>
        </div>
      </div>

      <div id="viewer-canvas" class="viewer-canvas"></div>

      <div id="viewer-design-workspace" class="viewer-design-workspace" hidden></div>

      <button id="viewer-exit-compare3d" class="viewer-exit-compare3d" type="button" hidden data-i18n-key="viewer.compare.exit">Exit Split View</button>

      <div id="viewer-crosshair" class="viewer-crosshair" hidden></div>
      <div id="viewer-info-card" class="viewer-info-card" hidden></div>

      <div id="viewer-minimap" class="viewer-minimap">
        <div class="viewer-minimap-title">
          <span data-i18n-key="viewer.minimap.title">Scene Map</span>
          <button id="viewer-minimap-expand" class="viewer-minimap-expand" type="button" aria-label="Expand Scene Map" title="Expand Scene Map">&#x26F6;</button>
        </div>
        <div id="viewer-minimap-canvas" class="viewer-minimap-canvas"></div>
        <canvas id="viewer-minimap-overlay" class="viewer-minimap-overlay"></canvas>
      </div>

      <canvas id="viewer-axis-hud" class="viewer-axis-hud"></canvas>

      <div id="viewer-overlay" class="viewer-overlay" data-i18n-key="viewer.overlay.capture">Click scene to capture mouse</div>

      <div class="generation-dock" aria-label="Generation dock">
        <div class="generation-dock-text">
          <span class="generation-dock-eyebrow">GENERATE</span>
          <strong>Generate + Browse First</strong>
          <span>Open generation controls, then return to the 4:3 stage view.</span>
        </div>
        <div class="generation-dock-actions">
          <button class="stage-toolbar-button" type="button" id="viewer-open-generation">Open Generation Control</button>
          <button class="stage-toolbar-button stage-toolbar-button-primary" type="button" id="viewer-generate-and-load">Generate & Load</button>
        </div>
      </div>

      <div id="viewer-generation-dialog" class="viewer-generation-dialog" data-open="false" aria-labelledby="viewer-generation-dialog-title">
        <div class="viewer-generation-dialog-backdrop" data-close-generation></div>
        <div class="viewer-generation-dialog-panel">
          <div class="viewer-generation-dialog-head">
            <div>
              <h2 id="viewer-generation-dialog-title" data-i18n-key="viewer.generationDialog.title">Generation Control</h2>
              <p data-i18n-key="viewer.generationDialog.subtitle">Full generation flow in a dialog; confirm to return to the stage view.</p>
            </div>
            <button class="viewer-settings-close" type="button" aria-label="Close generation control" data-close-generation>x</button>
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
          <button id="viewer-presets-close" class="viewer-settings-close" type="button" aria-label="Close presets">x</button>
        </div>
        <div id="viewer-presets-grid" class="viewer-presets-grid" />
      </div>

      ${renderHelpPanelHtml()}

      <div id="viewer-error" class="viewer-error" hidden></div>
    </div>
  `;
}
