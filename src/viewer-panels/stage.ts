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
              <button type="button" aria-pressed="false" id="viewer-mode-graph">Graph</button>
            </div>
          </div>
          <span class="stage-toolbar-divider" aria-hidden="true"></span>
          <button class="stage-toolbar-button" type="button" id="viewer-sync-camera" data-i18n-key="viewer.stage.resetView">Reset View</button>
        </div>
        <div class="stage-toolbar-group stage-toolbar-output" data-od-id="toolbar-right">
          <button class="stage-toolbar-button" type="button" id="viewer-export-topdown-map" data-shell-action="file-export-png">PNG</button>
          <button class="stage-toolbar-button" type="button" id="viewer-export-topdown-svg" data-shell-action="file-export-svg">SVG</button>
          <span class="stage-pill" data-tone="ok" id="viewer-topology-pill">topology_ok</span>
          <span class="stage-pill" id="viewer-geo-pill">geo_delta —</span>
        </div>
      </div>

      <div id="viewer-canvas" class="viewer-canvas"></div>

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


      <div id="viewer-generation-dialog" class="viewer-generation-dialog" data-open="false" aria-labelledby="viewer-generation-dialog-title">
        <div class="viewer-generation-dialog-backdrop" data-close-generation></div>
        <div class="viewer-generation-dialog-panel">
          <div class="viewer-generation-dialog-head">
            <div>
              <h2 id="viewer-generation-dialog-title" data-i18n-key="viewer.generationDialog.title">Generation Control</h2>
              <p data-i18n-key="viewer.generationDialog.subtitle">Full generation flow in a dialog; confirm to return to the stage view.</p>
            </div>
            <button class="viewer-settings-close" type="button" aria-label="Close generation control" data-i18n-aria-label-key="viewer.generationDialog.close" data-close-generation>x</button>
          </div>
          <div class="viewer-generation-dialog-contract" aria-label="Generation contract">
            <div>
              <span data-i18n-key="viewer.generationDialog.source">Input source</span>
              <strong id="viewer-generation-source-summary">Current professional generation settings</strong>
            </div>
            <div>
              <span data-i18n-key="viewer.generationDialog.strategy">Generation strategy</span>
              <strong id="viewer-generation-strategy-summary">Parameterized generation</strong>
            </div>
            <div>
              <span data-i18n-key="viewer.generationDialog.output">Output</span>
              <strong data-i18n-key="viewer.generationDialog.outputRevision">Create a new scene result and load it into the 3D Viewer without overwriting the current scene</strong>
            </div>
          </div>
          <fieldset class="viewer-generation-asset-policy" id="viewer-generation-asset-policy">
            <legend data-i18n-key="professional.assets.policyTitle">3D asset preparation</legend>
            <p data-i18n-key="professional.assets.policyDescription">Confirm the asset source that will join the approved 2D annotation.</p>
            <label>
              <input type="radio" name="viewer-generation-asset-policy" value="current_manifest" />
              <span><strong data-i18n-key="professional.assets.currentManifest">Use the current checked asset manifest</strong><small data-i18n-key="professional.assets.currentManifestHint">Use scene-eligible trees and street furniture from the professional asset library.</small></span>
            </label>
            <label>
              <input type="radio" name="viewer-generation-asset-policy" value="default_transparent_massing" />
              <span><strong data-i18n-key="professional.assets.defaultMassing">Use default assets and transparent massing</strong><small data-i18n-key="professional.assets.defaultMassingHint">Skip custom asset preparation; buildings remain transparent white context.</small></span>
            </label>
            <div id="viewer-generation-readiness" class="viewer-generation-readiness" data-tone="warning" role="status"></div>
          </fieldset>
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
