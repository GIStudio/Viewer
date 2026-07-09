import type { ShellSection, ShellTab } from "../desktop-shell";
import {
  DEFAULT_PIXELS_PER_METER,
  DEFAULT_ROUNDABOUT_RADIUS_PX,
  DEFAULT_SEGMENT_LENGTH_M,
  DEFAULT_SIDEWALK_WIDTH_M,
} from "../sg-constants";

function createSceneGraphActionToolbarHtml(): string {
  return `
    <div class="scene-stage-action-bar" aria-label="Annotation actions">
      <div class="scene-tool-group-label">操作 / Action</div>
      <div class="scene-stage-action-row">
        <button id="annotation-finish-centerline" class="scene-toolbar-button" type="button">Finish Centerline<span class="tool-label-zh">完成中心线</span></button>
        <button id="annotation-select-all-roads" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">All Roads<span class="tool-label-zh">全部道路</span></button>
        <button id="annotation-undo-point" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Undo Point<span class="tool-label-zh">撤销节点</span></button>
        <button id="annotation-delete-selected" class="scene-toolbar-button scene-toolbar-button-secondary scene-toolbar-button-danger" type="button">Delete Selected<span class="tool-label-zh">删除选中</span></button>
        <button id="annotation-reset" class="scene-toolbar-button scene-toolbar-button-secondary scene-toolbar-button-danger" type="button">Reset Annotation<span class="tool-label-zh">重置标注</span></button>
        <label class="scene-layer-toggle scene-stage-snap-toggle">
          <input id="annotation-snap-to-road" type="checkbox" checked />
          <span>Snap to Road<span class="tool-label-zh">吸附到道路</span></span>
        </label>
      </div>
    </div>
  `;
}


export function createSceneGraphLeftSections(): ShellSection[] {
  return [
    {
      id: "annotation-tools",
      title: "Annotation Tools",
      subtitle: "Select and author features",
      content: `
        <div class="scene-bottom-toolbar scene-bottom-toolbar-shell">
          <div class="scene-tool-group">
            <div class="scene-tool-group-label">选择 / Select</div>
            <div class="scene-tool-row">
              <button id="annotation-tool-select" class="scene-tool-button" data-tool="select" type="button">Select<span class="tool-label-zh">选择</span></button>
              <button id="annotation-tool-adjust" class="scene-tool-button" data-tool="adjust" type="button">Adjust<span class="tool-label-zh">调整</span></button>
              <button id="annotation-tool-control-point" class="scene-tool-button" data-tool="control_point" type="button">Control Point<span class="tool-label-zh">控制点</span></button>
            </div>
          </div>
          <div class="scene-tool-group">
            <div class="scene-tool-group-label">道路 / Road</div>
            <div class="scene-tool-row">
              <button id="annotation-tool-centerline" class="scene-tool-button" data-tool="centerline" type="button">Centerline<span class="tool-label-zh">中心线</span></button>
              <button id="annotation-tool-branch" class="scene-tool-button" data-tool="branch" type="button">Branch<span class="tool-label-zh">分支</span></button>
              <button id="annotation-tool-cross" class="scene-tool-button" data-tool="cross" type="button">Cross<span class="tool-label-zh">交叉</span></button>
              <button id="annotation-tool-roundabout" class="scene-tool-button" data-tool="roundabout" type="button">Roundabout<span class="tool-label-zh">环岛</span></button>
            </div>
          </div>
          <div class="scene-tool-group">
            <div class="scene-tool-group-label">区域 / Zone</div>
            <div class="scene-tool-row">
              <button id="annotation-tool-scene-region" class="scene-tool-button" data-tool="scene_region" type="button">Scene Region<span class="tool-label-zh">场景边界</span></button>
              <button id="annotation-auto-split-regions" class="scene-tool-button" type="button">Auto Split<span class="tool-label-zh">自动切割</span></button>
              <button id="annotation-tool-functional-zone" class="scene-tool-button" data-tool="functional_zone" type="button">Functional Region<span class="tool-label-zh">功能区域</span></button>
              <button id="annotation-tool-surface" class="scene-tool-button" data-tool="surface_annotation" type="button">Design Surface<span class="tool-label-zh">设计面</span></button>
              <button id="annotation-tool-building-region" class="scene-tool-button scene-tool-button-secondary" data-tool="building_region" type="button">Building Region<span class="tool-label-zh">高级手绘</span></button>
            </div>
          </div>
          <div class="scene-tool-group">
            <div class="scene-tool-group-label">家具 / Furniture</div>
            <div class="scene-tool-row">
              <button id="annotation-tool-tree" class="scene-tool-button" data-tool="tree" type="button">Tree<span class="tool-label-zh">树木</span></button>
              <button id="annotation-tool-lamp" class="scene-tool-button" data-tool="lamp" type="button">Lamp<span class="tool-label-zh">路灯</span></button>
              <button id="annotation-tool-bench" class="scene-tool-button" data-tool="bench" type="button">Bench<span class="tool-label-zh">长椅</span></button>
              <button id="annotation-tool-trash" class="scene-tool-button" data-tool="trash" type="button">Trash<span class="tool-label-zh">垃圾桶</span></button>
              <button id="annotation-tool-bus-stop" class="scene-tool-button" data-tool="bus_stop" type="button">Bus Stop<span class="tool-label-zh">公交站</span></button>
              <button id="annotation-tool-bollard" class="scene-tool-button" data-tool="bollard" type="button">Bollard<span class="tool-label-zh">隔离桩</span></button>
              <button id="annotation-tool-mailbox" class="scene-tool-button" data-tool="mailbox" type="button">Mailbox<span class="tool-label-zh">邮筒</span></button>
              <button id="annotation-tool-hydrant" class="scene-tool-button" data-tool="hydrant" type="button">Hydrant<span class="tool-label-zh">消防栓</span></button>
              <button id="annotation-tool-sign" class="scene-tool-button" data-tool="sign" type="button">Sign<span class="tool-label-zh">标识牌</span></button>
            </div>
          </div>
          <div id="annotation-image-meta" class="scene-image-meta" style="margin:0">
            选择参考 plan 或导入 PNG 后，就可以在图上开始标注。
          </div>
        </div>
      `,
      open: true,
    },
  ];
}

export function createSceneGraphRightTabs(): ShellTab[] {
  return [
    {
      id: "view",
      label: "View",
      content: `
        <details class="scene-collapsible-panel" open>
          <summary class="scene-collapsible-summary">View & Layer Options</summary>
          <div class="scene-collapsible-body">
            <div class="scene-import-toolbar" style="padding:0">
              <label class="scene-select-wrap" style="min-width:0;flex:1 1 auto">
                <span class="scene-select-label">Reference Plan</span>
                <select id="annotation-plan-select" class="scene-select"></select>
              </label>
              <label class="scene-file-button" for="annotation-image-input">Import PNG</label>
              <input id="annotation-image-input" class="scene-file-input" type="file" accept="image/png,image/*" />
              <button id="annotation-image-reset" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Clear Image</button>
            </div>
            <div class="scene-import-toolbar scene-import-toolbar-compact" style="padding:0;margin-top:0.5rem">
              <label class="scene-select-wrap" style="min-width:0;flex:1 1 auto">
                <span class="scene-select-label">Scenario Design</span>
                <select id="annotation-scenario-select" class="scene-select"></select>
              </label>
            </div>
            <div class="scene-layer-controls scene-layer-controls-annotation" style="padding:0">
              <label class="scene-layer-toggle" for="annotation-show-original"><input id="annotation-show-original" type="checkbox" checked /><span>Original Image</span></label>
              <label class="scene-layer-toggle" for="annotation-show-overlay"><input id="annotation-show-overlay" type="checkbox" checked /><span>Annotation Overlay</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-core"><input id="annotation-show-junction-core" type="checkbox" /><span>Junction Core</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-connectors"><input id="annotation-show-junction-connectors" type="checkbox" /><span>Junction Connectors</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-outlines"><input id="annotation-show-junction-outlines" type="checkbox" /><span>Junction Outlines</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-crosswalks"><input id="annotation-show-junction-crosswalks" type="checkbox" /><span>Crosswalks</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-boundaries"><input id="annotation-show-junction-boundaries" type="checkbox" /><span>Approach Boundaries</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-labels"><input id="annotation-show-junction-labels" type="checkbox" /><span>Junction Labels</span></label>
              <label class="scene-layer-toggle" for="annotation-show-junction-debug"><input id="annotation-show-junction-debug" type="checkbox" /><span>Junction Debug</span></label>
              <label class="scene-range-control" for="annotation-original-opacity"><span>Original Opacity</span><input id="annotation-original-opacity" type="range" min="0" max="100" value="100" /></label>
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
              <label class="scene-select-wrap" style="min-width:0;flex:1 1 100%">
                <span class="scene-select-label">Scenario Design</span>
                <select id="annotation-scenario-select-data" class="scene-select"></select>
              </label>
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
      ${createSceneGraphActionToolbarHtml()}
      <div id="annotation-stage" class="scene-layer-stage scene-canvas-stage" data-has-image="false" data-loading="true" data-empty-state="loading">
        <div id="annotation-stage-empty" class="scene-image-empty" data-i18n-key="sceneGraph.status.loadingDefaultPlan">Loading default reference plan...</div>
        <div id="annotation-board" class="scene-board" hidden>
          <img id="annotation-original-image" class="scene-original-image annotation-original-image" alt="Reference plan" />
          <div id="annotation-overlay-host" class="scene-graph-overlay"></div>
        </div>
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
