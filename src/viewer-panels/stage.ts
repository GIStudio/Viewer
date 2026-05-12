export function createViewerStageHtml(): string {
  return `
    <div class="viewer-shell viewer-shell-embedded">
      <div class="viewer-command-hub" hidden>
        <button id="viewer-menu-toggle" type="button" aria-label="Menu" aria-expanded="false">☰</button>
        <div id="viewer-menu-dropdown" hidden></div>
        <button id="viewer-scene-graph-link" type="button">Annotation</button>
        <button id="viewer-asset-editor-link" type="button">Asset Editor</button>
        <button id="viewer-junction-editor-link" type="button">Junction Editor</button>
        <button id="viewer-settings-toggle" type="button" aria-expanded="false">Settings</button>
        <button id="viewer-design-toggle" type="button">Design</button>
        <button id="viewer-compare-toggle" type="button">Compare</button>
        <button id="viewer-presets-toggle" type="button">Presets</button>
        <button id="viewer-evaluate-toggle" type="button">Evaluate</button>
        <button id="viewer-history-analysis-toggle" type="button">History</button>
        <button id="viewer-floating-lane-toggle" type="button">Floating Lane</button>
        <button id="viewer-help-toggle" type="button">Help</button>
        <button id="viewer-export-topdown-map" type="button">Export PNG</button>
        <button id="viewer-export-topdown-svg" type="button">Export SVG</button>
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
      <div id="viewer-error" class="viewer-error" hidden></div>
    </div>
  `;
}
