import type { ShellSection, ShellTab } from "../desktop-shell";
import { loadViewerLanguage, translateViewerKey } from "../viewer-i18n";
import {
  DEFAULT_PIXELS_PER_METER,
  DEFAULT_ROUNDABOUT_RADIUS_PX,
  DEFAULT_SEGMENT_LENGTH_M,
  DEFAULT_SIDEWALK_WIDTH_M,
} from "../sg-constants";

function createSceneGraphActionToolbarHtml(): string {
  return `
    <div id="annotation-stage-action-toolbar" class="scene-stage-action-bar" aria-label="Annotation actions" data-i18n-aria-label-key="sceneGraph.tools.actions">
      <div class="scene-tool-group-label" data-i18n-key="sceneGraph.tools.actions">Actions</div>
      <div class="scene-stage-action-row">
        <button id="annotation-finish-centerline" class="scene-toolbar-button" type="button" data-i18n-key="sceneGraph.tools.finishCenterline">Finish Centerline</button>
        <button id="annotation-select-all-roads" class="scene-toolbar-button scene-toolbar-button-secondary" type="button" data-i18n-key="sceneGraph.tools.allRoads">All Roads</button>
        <button id="annotation-undo-point" class="scene-toolbar-button scene-toolbar-button-secondary" type="button" data-i18n-key="sceneGraph.tools.undoPoint">Undo Point</button>
        <button id="annotation-delete-selected" class="scene-toolbar-button scene-toolbar-button-secondary scene-toolbar-button-danger" type="button" data-i18n-key="sceneGraph.tools.deleteSelected">Delete Selected</button>
        <button id="annotation-reset" class="scene-toolbar-button scene-toolbar-button-secondary scene-toolbar-button-danger" type="button" data-i18n-key="sceneGraph.tools.reset">Reset Annotation</button>
        <label class="scene-layer-toggle scene-stage-snap-toggle">
          <input id="annotation-snap-to-road" type="checkbox" checked />
          <span data-i18n-key="sceneGraph.tools.snapToRoad">Snap to Road</span>
        </label>
      </div>
    </div>
  `;
}


export function createSceneGraphLeftSections(): ShellSection[] {
  return [
    {
      id: "annotation-tools",
      title: { key: "sceneGraph.tools.title" },
      subtitle: { key: "sceneGraph.tools.subtitle" },
      content: `
        <div class="scene-bottom-toolbar scene-bottom-toolbar-shell">
          <div id="annotation-tools-actions-slot" class="scene-tools-actions-slot">
            ${createSceneGraphActionToolbarHtml()}
          </div>
          <div class="scene-tool-group">
            <div class="scene-tool-group-label" data-i18n-key="sceneGraph.tools.selectGroup">Select</div>
            <div class="scene-tool-row">
              <button id="annotation-tool-select" class="scene-tool-button" data-tool="select" type="button" data-i18n-key="sceneGraph.tools.select">Select</button>
              <button id="annotation-tool-adjust" class="scene-tool-button" data-tool="adjust" type="button" data-i18n-key="sceneGraph.tools.adjust">Adjust</button>
              <button id="annotation-tool-control-point" class="scene-tool-button" data-tool="control_point" type="button" data-i18n-key="sceneGraph.tools.controlPoint">Control Point</button>
            </div>
          </div>
          <div class="scene-tool-group">
            <div class="scene-tool-group-label" data-i18n-key="sceneGraph.tools.roadGroup">Road</div>
            <div class="scene-tool-row">
              <button id="annotation-tool-centerline" class="scene-tool-button" data-tool="centerline" type="button" data-i18n-key="sceneGraph.tools.centerline">Centerline</button>
              <button id="annotation-tool-branch" class="scene-tool-button" data-tool="branch" type="button" data-i18n-key="sceneGraph.tools.branch">Branch</button>
              <button id="annotation-tool-cross" class="scene-tool-button" data-tool="cross" type="button" data-i18n-key="sceneGraph.tools.cross">Cross</button>
              <button id="annotation-tool-roundabout" class="scene-tool-button" data-tool="roundabout" type="button" data-i18n-key="sceneGraph.tools.roundabout">Roundabout</button>
            </div>
          </div>
          <div class="scene-tool-group">
            <div class="scene-tool-group-label" data-i18n-key="sceneGraph.tools.zoneGroup">Zone</div>
            <div class="scene-tool-row">
              <button id="annotation-tool-scene-region" class="scene-tool-button" data-tool="scene_region" type="button" data-i18n-key="sceneGraph.tools.sceneRegion">Scene Region</button>
              <button id="annotation-auto-split-regions" class="scene-tool-button" type="button" data-i18n-key="sceneGraph.tools.autoSplit">Auto Split</button>
              <button id="annotation-tool-functional-zone" class="scene-tool-button" data-tool="functional_zone" type="button" data-i18n-key="sceneGraph.tools.functionalRegion">Functional Region</button>
              <button id="annotation-tool-surface" class="scene-tool-button" data-tool="surface_annotation" type="button" data-i18n-key="sceneGraph.tools.designSurface">Design Surface</button>
              <button id="annotation-tool-building-region" class="scene-tool-button scene-tool-button-secondary" data-tool="building_region" type="button" data-i18n-key="sceneGraph.tools.buildingRegion">Building Region</button>
            </div>
          </div>
          <div class="scene-tool-group">
            <div class="scene-tool-group-label" data-i18n-key="sceneGraph.tools.furnitureGroup">Furniture</div>
            <div class="scene-tool-row">
              <button id="annotation-tool-tree" class="scene-tool-button" data-tool="tree" type="button" data-i18n-key="sceneGraph.tools.tree">Tree</button>
              <button id="annotation-tool-lamp" class="scene-tool-button" data-tool="lamp" type="button" data-i18n-key="sceneGraph.tools.lamp">Lamp</button>
              <button id="annotation-tool-bench" class="scene-tool-button" data-tool="bench" type="button" data-i18n-key="sceneGraph.tools.bench">Bench</button>
              <button id="annotation-tool-trash" class="scene-tool-button" data-tool="trash" type="button" data-i18n-key="sceneGraph.tools.trash">Trash</button>
              <button id="annotation-tool-bus-stop" class="scene-tool-button" data-tool="bus_stop" type="button" data-i18n-key="sceneGraph.tools.busStop">Bus Stop</button>
              <button id="annotation-tool-bollard" class="scene-tool-button" data-tool="bollard" type="button" data-i18n-key="sceneGraph.tools.bollard">Bollard</button>
              <button id="annotation-tool-mailbox" class="scene-tool-button" data-tool="mailbox" type="button" data-i18n-key="sceneGraph.tools.mailbox">Mailbox</button>
              <button id="annotation-tool-hydrant" class="scene-tool-button" data-tool="hydrant" type="button" data-i18n-key="sceneGraph.tools.hydrant">Hydrant</button>
              <button id="annotation-tool-sign" class="scene-tool-button" data-tool="sign" type="button" data-i18n-key="sceneGraph.tools.sign">Sign</button>
            </div>
            <p class="scene-tool-group-note scene-furniture-annotation-note">
              标注作用：在道路横断面或功能区落点后，会保存为必需的 3D 街道家具实例；下一次生成将应用对应种类与位置，删除标注后才会移除。
            </p>
          </div>
          <div id="annotation-image-meta" class="scene-image-meta" style="margin:0">
            <span data-i18n-key="sceneGraph.tools.referenceHint">Choose a reference plan or import PNG to start annotating.</span>
          </div>
        </div>
      `,
      open: true,
    },
  ];
}

export type SceneGraphShellOptions = {
  showAdvancedSourceTools?: boolean;
};

export function createSceneGraphRightTabs(options: SceneGraphShellOptions = {}): ShellTab[] {
  const advancedSourceToolsHidden = options.showAdvancedSourceTools ? "" : " hidden";
  const sourceStatusHtml = options.showAdvancedSourceTools
    ? `<div id="scene-source-status" class="scene-status" data-tone="neutral" data-i18n-key="sceneGraph.source.initialStatus">Trace manually, import annotation JSON/GeoJSON, or use configured AI extraction.</div>`
    : `<div id="scene-source-status" class="scene-status" data-tone="neutral" data-i18n-key="sceneGraph.source.osmInitialStatus">Browse OSM and capture a study area. Lane-level details remain editable on the stage.</div>`;
  return [
    {
      id: "source",
      label: translateViewerKey(loadViewerLanguage(), "sceneGraph.source.drawer") ?? "Source / Status",
      content: `
        <div id="scene-source-workflow" class="scene-source-workflow" data-step="source">
          <section class="scene-source-step" data-workflow-panel="source">
            <div class="scene-source-heading">
              <div>
                <span data-i18n-key="sceneGraph.source.kicker">01A / OSM FIRST</span>
                <strong data-i18n-key="sceneGraph.source.title">Browse the map and capture a study area</strong>
              </div>
              <p data-i18n-key="sceneGraph.source.description">Browse OSM freely on the stage. After capturing the viewport or drawing precisely, roads and context enter one ReferenceAnnotation.</p>
            </div>
            <div id="scene-source-aoi-summary" class="scene-source-aoi-summary" data-ready="false">
              <strong data-i18n-key="sceneGraph.source.noArea">No study area captured</strong>
              <span data-i18n-key="sceneGraph.source.noAreaHint">Browsing does not request the server; coordinates are available under Advanced location.</span>
            </div>
            <div class="scene-source-divider" data-admin-source-tools${advancedSourceToolsHidden}><span data-i18n-key="sceneGraph.source.otherSources">Other data sources</span></div>
            <details class="scene-collapsible-panel" data-admin-source-tools${advancedSourceToolsHidden}>
              <summary class="scene-collapsible-summary" data-i18n-key="sceneGraph.source.referenceSources">Reference image, GeoJSON and templates</summary>
              <div class="scene-collapsible-body">
                <div class="scene-import-toolbar scene-import-toolbar-compact">
                  <button id="scene-source-image-import" class="scene-toolbar-button scene-toolbar-button-secondary" type="button" data-i18n-key="sceneGraph.source.referenceImage">Reference Image</button>
                  <label class="scene-file-button" for="scene-source-geojson-input">GeoJSON</label>
                  <input id="scene-source-geojson-input" class="scene-file-input" type="file" accept=".geojson,.json,application/geo+json,application/json" />
                </div>
                <label class="scene-form-field">
                  <span data-i18n-key="sceneGraph.source.coordinateSpace">GeoJSON coordinate space</span>
                  <select id="scene-source-coordinate-space" class="scene-select">
                    <option value="image_px" data-i18n-key="sceneGraph.source.imagePixels">Image pixels (x right, y down)</option>
                    <option value="EPSG:4326" data-i18n-key="sceneGraph.source.wgs84">EPSG:4326 (longitude, latitude)</option>
                  </select>
                </label>
                <p class="scene-micro-note" data-i18n-key="sceneGraph.source.templateHint">HKUST-GZ and other reference plans load only when explicitly selected as templates.</p>
              </div>
            </details>
            <details class="scene-collapsible-panel" data-admin-source-tools${advancedSourceToolsHidden}>
              <summary class="scene-collapsible-summary" data-i18n-key="sceneGraph.source.aiAdvanced">AI extraction (advanced)</summary>
              <div class="scene-collapsible-body">
                <label class="scene-form-field">
                  <span data-i18n-key="sceneGraph.source.extractionGuidance">Extraction guidance</span>
                  <textarea id="scene-source-ai-prompt" class="scene-json-input" rows="3" placeholder="Trace visible road centerlines, junctions, and scene boundary." data-i18n-placeholder-key="sceneGraph.source.extractionPlaceholder"></textarea>
                </label>
                <button id="scene-source-ai-extract" class="scene-toolbar-button" type="button" disabled data-i18n-key="sceneGraph.source.extract">Extract with configured vision model</button>
                <div id="scene-source-ai-status" class="scene-status" data-tone="neutral" data-i18n-key="sceneGraph.source.checkingVision">Checking vision capability…</div>
              </div>
            </details>
            <button id="scene-source-normalize" class="scene-toolbar-button" type="button" data-admin-source-tools${advancedSourceToolsHidden} data-i18n-key="sceneGraph.source.normalize">Normalize & Review</button>
            ${sourceStatusHtml}
          </section>
          <section class="scene-source-step scene-source-review-step" data-workflow-panel="review" hidden>
            <div class="scene-source-heading">
              <div>
                <span data-i18n-key="sceneGraph.review.kicker">ANNOTATION STATUS</span>
                <strong data-i18n-key="sceneGraph.review.title">Saved and validated annotation</strong>
              </div>
              <p data-i18n-key="sceneGraph.review.description">Edits are saved automatically. A valid revision is approved for generation without an extra confirmation step.</p>
            </div>
            <div id="scene-source-provenance" class="scene-source-provenance" hidden aria-hidden="true"></div>
            <div id="scene-source-counts" class="scene-metric-grid scene-metric-grid-compact"></div>
            <div id="scene-source-warnings" class="scene-source-warnings"></div>
            <div class="scene-import-toolbar scene-import-toolbar-compact">
              <button id="scene-source-back" class="scene-toolbar-button scene-toolbar-button-secondary" type="button" data-i18n-key="sceneGraph.review.backToArea">Choose another study area</button>
              <button id="scene-source-open-annotation-tools" class="scene-toolbar-button scene-toolbar-button-secondary" type="button" hidden data-i18n-key="sceneGraph.review.openAnnotationTools">Open annotation tools</button>
              <button id="scene-source-generate" class="scene-toolbar-button" type="button" data-i18n-key="sceneGraph.review.enter3d">Enter 3D scene</button>
              <button id="scene-source-open-existing" class="scene-toolbar-button scene-toolbar-button-secondary" type="button" hidden>Open existing 3D scene</button>
            </div>
            <div id="scene-source-review-status" class="scene-status" data-tone="neutral" data-i18n-key="sceneGraph.review.waiting">Waiting for a valid annotation.</div>
          </section>
        </div>
      `,
    },
    {
      id: "view",
      label: "View",
      content: `
        <details class="scene-collapsible-panel" open>
          <summary class="scene-collapsible-summary">View & Layer Options</summary>
          <div class="scene-collapsible-body">
            <div class="scene-import-toolbar" style="padding:0">
              <label id="annotation-reference-plan-control" class="scene-select-wrap" style="min-width:0;flex:1 1 auto">
                <span class="scene-select-label" data-i18n-key="sceneGraph.right.referencePlan">Reference Plan</span>
                <select id="annotation-plan-select" class="scene-select"></select>
              </label>
              <p id="annotation-osm-reference-note" class="scene-micro-note" hidden data-i18n-key="sceneGraph.right.osmNoReference">Using OSM directly — no reference image is required.</p>
              <label class="scene-file-button" for="annotation-image-input">Import PNG</label>
              <input id="annotation-image-input" class="scene-file-input" type="file" accept="image/png,image/*" />
              <button id="annotation-image-reset" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Clear Image</button>
            </div>
            <div class="scene-layer-controls scene-layer-controls-annotation" style="padding:0">
              <label class="scene-layer-toggle" for="annotation-show-original"><input id="annotation-show-original" type="checkbox" checked /><span>Original Image</span></label>
              <label class="scene-layer-toggle" for="annotation-show-overlay"><input id="annotation-show-overlay" type="checkbox" checked /><span>Annotation Overlay</span></label>
              <label class="scene-layer-toggle" for="annotation-show-osm-labels"><input id="annotation-show-osm-labels" type="checkbox" /><span data-i18n-key="sceneGraph.right.osmLabels">OSM Labels</span></label>
              <label class="scene-layer-toggle" for="annotation-show-annotation-labels"><input id="annotation-show-annotation-labels" type="checkbox" checked /><span data-i18n-key="sceneGraph.right.annotationLabels">Annotation Labels</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-core"><input id="annotation-show-junction-core" type="checkbox" /><span>Junction Core</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-connectors"><input id="annotation-show-junction-connectors" type="checkbox" /><span>Junction Connectors</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-outlines"><input id="annotation-show-junction-outlines" type="checkbox" /><span>Junction Outlines</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-crosswalks"><input id="annotation-show-junction-crosswalks" type="checkbox" /><span>Crosswalks</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-boundaries"><input id="annotation-show-junction-boundaries" type="checkbox" /><span>Approach Boundaries</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-labels"><input id="annotation-show-junction-labels" type="checkbox" /><span>Junction Labels</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-debug"><input id="annotation-show-junction-debug" type="checkbox" /><span>Junction Debug</span></label>
              <label class="scene-range-control" for="annotation-original-opacity"><span id="annotation-original-opacity-label" data-i18n-key="sceneGraph.right.originalOpacity">Original Opacity</span><input id="annotation-original-opacity" type="range" min="0" max="100" value="100" /></label>
              <label class="scene-range-control" for="annotation-overlay-opacity"><span>Overlay Opacity</span><input id="annotation-overlay-opacity" type="range" min="0" max="100" value="88" /></label>
              <label class="scene-form-field scene-form-field-inline"><span>Pixels / Meter</span><input id="annotation-pixels-per-meter" type="number" min="0.1" step="0.1" value="${DEFAULT_PIXELS_PER_METER}" /></label>
              <label class="scene-form-field scene-form-field-inline"><span>Default Roundabout Radius</span><input id="annotation-roundabout-radius" type="number" min="8" step="1" value="${DEFAULT_ROUNDABOUT_RADIUS_PX}" /></label>
            </div>
          </div>
        </details>
      `,
    },
    {
      id: "inspector",
      label: "Inspector",
      presentation: "modal",
      content: `
        <details class="scene-collapsible-panel" open>
          <summary class="scene-collapsible-summary">Selected Feature</summary>
          <div class="scene-collapsible-body" style="padding:0">
            <div id="annotation-inspector" class="scene-inspector-wrap"></div>
          </div>
        </details>
      `,
    },
    {
      id: "data",
      label: "Data",
      content: `
        <details class="scene-collapsible-panel" open>
          <summary class="scene-collapsible-summary">Import / Export</summary>
          <div class="scene-collapsible-body">
            <div class="scene-import-toolbar scene-import-toolbar-compact" style="padding:0">
              <label class="scene-file-button" for="annotation-json-input">Import Annotation</label>
              <input id="annotation-json-input" class="scene-file-input" type="file" accept=".json,application/json" />
              <button id="annotation-download-json" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Download Annotation</button>
              <button id="annotation-copy-json" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Copy Annotation</button>
              <button id="annotation-download-graph" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Download Road Graph</button>
            </div>
          </div>
        </details>
        <details class="scene-collapsible-panel">
          <summary class="scene-collapsible-summary">Graph Conversion</summary>
          <div class="scene-collapsible-body">
            <label class="scene-form-field scene-form-field-inline" style="padding:0;background:transparent;box-shadow:none"><span>Segment Length (m)</span><input id="annotation-segment-length" type="number" min="4" step="1" value="${DEFAULT_SEGMENT_LENGTH_M}" /></label>
            <label class="scene-form-field scene-form-field-inline" style="padding:0;background:transparent;box-shadow:none"><span>Sidewalk Width (m)</span><input id="annotation-sidewalk-width" type="number" min="1" step="0.5" value="${DEFAULT_SIDEWALK_WIDTH_M}" /></label>
            <div class="scene-micro-note">Road graph is generated automatically after annotation edits. Use retry only if the automatic conversion fails.</div>
            <button id="annotation-convert-graph" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Retry Graph Conversion</button>
            <div id="annotation-graph-status" class="scene-status" data-tone="neutral" style="margin:0" data-i18n-key="sceneGraph.status.graphPlaceholder">Road graph results appear here automatically.</div>
            <div id="annotation-graph-summary" class="scene-metric-grid scene-metric-grid-compact"></div>
            <div class="scene-json-wrap scene-json-wrap-compact" style="padding:0"><textarea id="annotation-graph-json" class="scene-json-input" spellcheck="false" readonly></textarea></div>
          </div>
        </details>
        <details class="scene-collapsible-panel">
          <summary class="scene-collapsible-summary">Annotation Summary</summary>
          <div class="scene-collapsible-body"><div id="annotation-summary-grid" class="scene-metric-grid scene-metric-grid-compact"></div></div>
        </details>
        <details class="scene-collapsible-panel">
          <summary class="scene-collapsible-summary">Feature Table</summary>
          <div class="scene-collapsible-body">
            <div class="scene-table-wrap scene-table-wrap-compact" style="padding:0">
              <table class="scene-table scene-table-compact">
                <thead><tr><th>Type</th><th>ID</th><th>Label</th><th>Detail</th></tr></thead>
                <tbody id="annotation-feature-table"></tbody>
              </table>
            </div>
          </div>
        </details>
        <details class="scene-collapsible-panel">
          <summary class="scene-collapsible-summary">Annotation JSON</summary>
          <div class="scene-collapsible-body">
            <div class="scene-import-toolbar scene-import-toolbar-compact" style="padding:0 0 0.5rem">
              <button id="annotation-apply-json" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Apply JSON</button>
            </div>
            <div class="scene-json-wrap scene-json-wrap-compact" style="padding:0"><textarea id="annotation-json" class="scene-json-input" spellcheck="false"></textarea></div>
            <div id="annotation-status" class="scene-status" data-tone="neutral" style="margin:0.5rem 0 0" data-i18n-key="sceneGraph.status.waitingReferenceImage">Waiting for a reference image.</div>
          </div>
        </details>
      `,
    },
  ];
}

export function createSceneGraphStageHtml(): string {
  return `
    <div class="scene-shell-stage">
      <div class="scene-canvas-viewport-shell" data-has-canvas="false">
        <div id="scene-osm-aoi-picker" class="scene-osm-aoi-picker" hidden></div>
        <div class="scene-canvas-viewport-controls" role="group" aria-label="Annotation canvas zoom controls">
          <button id="annotation-zoom-out" class="scene-canvas-viewport-button" type="button" aria-label="Zoom out">−</button>
          <output id="annotation-zoom-level" class="scene-canvas-viewport-level" aria-live="polite">100%</output>
          <button id="annotation-zoom-in" class="scene-canvas-viewport-button" type="button" aria-label="Zoom in">+</button>
          <button id="annotation-zoom-fit" class="scene-canvas-viewport-fit" type="button" title="Fit canvas width">适应宽度</button>
        </div>
        <div class="scene-canvas-viewport-hint" aria-hidden="true">滚轮缩放 · Space / 中键拖动画布</div>
        <div id="annotation-stage" class="scene-layer-stage scene-canvas-stage" data-has-image="false" data-loading="true" data-empty-state="loading" tabindex="0" aria-label="Reference annotation canvas. Use the mouse wheel to zoom and hold Space or the middle mouse button to pan.">
          <div id="annotation-stage-empty" class="scene-image-empty" data-i18n-key="sceneGraph.status.loadingDefaultPlan">Loading default reference plan...</div>
          <div id="annotation-zoom-space" class="scene-annotation-zoom-space" hidden>
            <div id="annotation-board" class="scene-board" hidden>
              <div id="annotation-osm-map" class="scene-osm-map" hidden aria-label="OpenStreetMap annotation background"></div>
              <img id="annotation-original-image" class="scene-original-image annotation-original-image" alt="Reference plan" />
              <div id="annotation-overlay-host" class="scene-graph-overlay"></div>
            </div>
          </div>
        </div>
      </div>
      <div id="scene-generation-confirm-dialog" class="scene-generation-confirm-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="scene-generation-confirm-title">
        <div class="scene-generation-confirm-backdrop" data-close-scene-generation></div>
        <section class="scene-generation-confirm-panel">
          <header>
            <span>03 / 3D 场景生成</span>
            <h2 id="scene-generation-confirm-title">确认生成配置</h2>
            <p>将使用当前已保存的 2D 标注与 OSM 上下文创建新的可追溯 3D 版本。</p>
          </header>
          <div id="scene-generation-confirm-summary" class="scene-generation-confirm-summary"></div>
          <p class="scene-generation-confirm-note">道路、建筑足迹与人工街道家具会作为本次生成的固定输入；进入下一步可继续核对完整生成策略和参数。</p>
          <footer>
            <button id="scene-generation-confirm-cancel" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">返回标注</button>
            <button id="scene-generation-confirm-open" class="scene-toolbar-button" type="button">确认并进入生成配置</button>
          </footer>
        </section>
      </div>
      <button id="scene-page-asset-editor" type="button" hidden>Asset Editor</button>
      <button id="scene-page-back" type="button" hidden>Back to Viewer</button>
    </div>
  `;
}

export function createSceneGraphStatusHtml(): string {
  return `
    <div id="annotation-status-proxy" class="desktop-shell-inline-status" data-i18n-key="sceneGraph.status.waitingReferenceImage">Waiting for a reference image.</div>
    <div id="annotation-graph-status-proxy" class="desktop-shell-inline-status" data-i18n-key="sceneGraph.status.graphPlaceholder">Road graph results appear here automatically.</div>
  `;
}
