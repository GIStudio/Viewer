/**
 * Junction Editor - 独立路口绘制编辑器
 *
 * 功能：
 * 1. 绘制结构化十字骨架
 * 2. 为四个道路臂分配方向与 8 个 lane flow
 * 3. 保留 corner skeleton / patch 的手工编辑能力
 * 4. 保存/导出路口模板
 */

import { API_BASE } from "./sg-constants";
import { NOMINAL_STRIP_WIDTHS } from "./sg-constants";
import {
  AnnotationPoint,
  AnnotatedJunction,
  BezierCurve3,
  DerivedJunctionOverlayFusedStrip,
  JunctionArmKey,
  JunctionComposition,
  JunctionLaneSurface,
  JunctionMergedSurface,
  JunctionQuadrantComposition,
  JunctionQuadrantSkeletonLine,
  JunctionSurfaceEdge,
  JunctionSurfaceNode,
  StripKind,
} from "./sg-types";
import {
  buildMergedSurfacePreview,
  buildDefaultLaneSurface,
  cloneLaneSurfaceDeep,
  deleteSurfaceNode,
  insertSurfaceNode,
  mergeLaneSurfaces,
  moveSurfaceNode,
  pointInSurface,
  surfaceBoundaryDistance,
  surfaceCentroid,
  surfacePathD,
  toggleSurfaceEdgeKind,
  translateSurface,
} from "./junction-surface-geometry";
import type { LaneSurfaceBindingSeed, SurfaceMergePreview } from "./junction-surface-geometry";
import {
  buildCornerFilletRibbonGeometryTs,
  buildQuadrantsFromFusedCornerStripsTs,
  cornerOffsetFilletKernelTs,
  pointOnBezier,
} from "./sg-geometry";
import type { DesktopShell } from "./desktop-shell";

type LaneFlow = "inbound" | "outbound";
type ArmKey = JunctionArmKey;

type StructuredArmConfig = {
  armKey: ArmKey;
  roadId: string;
  angleDeg: number;
  lengthM: number;
  carriagewayWidthM: number;
  nearroadFurnishingWidthM: number;
  clearSidewalkWidthM: number;
  frontageReserveWidthM: number;
  inboundLaneCount: number;
  outboundLaneCount: number;
};

type StructuredCrossSkeleton = {
  localCenter: AnnotationPoint;
  arms: StructuredArmConfig[];
};

type StructuredLaneBinding = {
  laneId: string;
  armKey: ArmKey;
  direction: ArmKey;
  roadId: string;
  flow: LaneFlow;
  laneIndex: number;
  laneWidthM: number;
  skeletonId: string;
  offsetM: number;
  startLocal: AnnotationPoint;
  endLocal: AnnotationPoint;
};

type StructuredQuadrantContext = {
  quadrantId: string;
  armA: StructuredArmConfig;
  armB: StructuredArmConfig;
  boundaryCenterA: AnnotationPoint;
  boundaryCenterB: AnnotationPoint;
  normalA: AnnotationPoint;
  normalB: AnnotationPoint;
  cornerCenter: AnnotationPoint;
  zoneA: "left" | "right";
  zoneB: "left" | "right";
};

type SurfaceSelectionKind = "lane" | "merged";

type SurfaceSelection = {
  kind: SurfaceSelectionKind;
  surfaceId: string;
} | null;

type SelectionMode = "single" | "multi";

type SurfaceDragTarget =
  | {
      kind: "node";
      surfaceKind: SurfaceSelectionKind;
      surfaceId: string;
      nodeId: string;
    }
  | {
      kind: "edge";
      surfaceKind: SurfaceSelectionKind;
      surfaceId: string;
      edgeId: string;
    }
  | {
      kind: "control";
      surfaceKind: SurfaceSelectionKind;
      surfaceId: string;
      edgeId: string;
      control: "control1" | "control2";
    }
  | null;

type EditorState = {
  junction: AnnotatedJunction;
  crossSkeleton: StructuredCrossSkeleton;
  compositions: JunctionComposition[];
  selectedTool: "select" | "draw-skeleton" | "draw-patch" | "surface-edit";
  selectedElement: SelectedElement | null;
  selectedSurface: SurfaceSelection;
  selectedSurfaceNodeId: string | null;
  selectedSurfaceEdgeId: string | null;
  selectedSurfaceNodePoint: AnnotationPoint | null;
  surfaceMergeSelection: string[];
  selectionMode: SelectionMode;
  mergeStatusMessage: string | null;
  surfaceDragTarget: SurfaceDragTarget;
  drawingSkeleton: {
    quadrantIndex: number;
    stripKind: StripKind;
    curveType: "skeleton" | "inner" | "outer";
    points: AnnotationPoint[];
  } | null;
  scale: number;
  pan: { x: number; y: number };
};

type SelectedElement =
  | { kind: "skeleton-line"; quadrantIndex: number; index: number }
  | { kind: "bezier-patch"; quadrantIndex: number; index: number }
  | { kind: "control-point"; quadrantIndex: number; elementKind: string; index: number; pointIndex: number };

type EditorActions = {
  rerender: () => void;
  redrawCanvas: () => void;
};

type StructuredTemplatePayload = {
  junction: AnnotatedJunction;
  compositions: JunctionComposition[];
  metadata: Record<string, unknown>;
};

const DEFAULT_SCALE = 10; // 1m = 10px
const GRID_SIZE = 100; // 10m grid
const DEFAULT_SKELETON_WIDTH_M = 3.0;
const MIN_SKELETON_WIDTH_M = 0.1;
const DEFAULT_ARM_LENGTH_M = 18;
const MIN_ARM_LENGTH_M = 4;
const DEFAULT_LANE_WIDTH_M = 3.5;
const DEFAULT_CARRIAGEWAY_WIDTH_M = 14;
const MIN_LANE_COUNT = 0;
const MAX_LANE_COUNT = 8;
const LANE_GROUP_GAP_M = 1.25;
const JUNCTION_CORE_RADIUS_M = 4;
const MIN_STRIP_WIDTH_M = 0;
const ARM_ORDER: ArmKey[] = ["north", "east", "south", "west"];

const ARM_LABELS: Record<ArmKey, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

const DEFAULT_ARM_ANGLES_DEG: Record<ArmKey, number> = {
  north: -90,
  east: 0,
  south: 90,
  west: 180,
};

const STRUCTURED_CORNER_STRIP_KINDS: StripKind[] = [
  "nearroad_furnishing",
  "clear_sidewalk",
  "frontage_reserve",
];

export function mountJunctionEditor(shell: DesktopShell): () => void {
  const root = shell.root;
  const state: EditorState = {
    junction: createEmptyJunction(),
    crossSkeleton: createDefaultCrossSkeleton(),
    compositions: [],
    selectedTool: "select",
    selectedElement: null,
    selectedSurface: null,
    selectedSurfaceNodeId: null,
    selectedSurfaceEdgeId: null,
    selectedSurfaceNodePoint: null,
    surfaceMergeSelection: [],
    selectionMode: "single",
    mergeStatusMessage: null,
    surfaceDragTarget: null,
    drawingSkeleton: null,
    scale: DEFAULT_SCALE,
    pan: { x: 0, y: 0 },
  };

  let renderId = 0;

  const actions: EditorActions = {
    rerender: render,
    redrawCanvas: () => renderCanvas(root, state),
  };

  syncStructuredJunctionBindings(state);
  syncStructuredLaneSurfaces(state);
  seedStructuredCornerQuadrants(state);
  render();

  function render() {
    const currentId = ++renderId;
    renderDesktopShell(shell, state);
    if (currentId !== renderId) {
      return;
    }
    bindEvents(root, state, actions);
    renderCanvas(root, state);
  }

  return () => undefined;
}

function renderDesktopShell(shell: DesktopShell, state: EditorState): void {
  shell.setHints([
    "Cross skeleton uses five points: the center plus four road-arm endpoints.",
    "Use Multi Select and Merge Selected from the right rail to build turn or corner surfaces.",
    "Draw Corner Skeleton and Draw Patch stay available for manual corner geometry overrides.",
  ]);
  shell.setLeftSections([
    {
      id: "junction-properties",
      title: "Junction Outline",
      subtitle: "Metadata and anchor",
      content: `
        <div class="je-panel">
          <h3 class="je-panel-title">Junction Properties</h3>
          <div class="je-panel-content">
            <div class="je-field">
              <label class="je-label">Junction ID</label>
              <input class="je-input" id="je-junction-id" type="text" value="${escapeHtml(state.junction.id)}" />
            </div>
            <div class="je-field">
              <label class="je-label">Junction Label</label>
              <input class="je-input" id="je-junction-label" type="text" value="${escapeHtml(state.junction.label)}" />
            </div>
            <div class="je-field">
              <label class="je-label">Junction Kind</label>
              <select class="je-input" id="je-junction-kind">
                <option value="cross_junction" ${state.junction.kind === "cross_junction" ? "selected" : ""}>Cross Junction (十字)</option>
                <option value="t_junction" ${state.junction.kind === "t_junction" ? "selected" : ""}>T Junction (T型)</option>
                <option value="complex_junction" ${state.junction.kind === "complex_junction" ? "selected" : ""}>Complex (复杂)</option>
              </select>
            </div>
          </div>
        </div>
        <div class="je-panel">
          <h3 class="je-panel-title">Junction Anchor</h3>
          <div class="je-panel-content">
            <div class="je-field">
              <label class="je-label">Position X (m)</label>
              <input class="je-input" id="je-junction-x" type="number" value="${state.junction.x}" />
            </div>
            <div class="je-field">
              <label class="je-label">Position Y (m)</label>
              <input class="je-input" id="je-junction-y" type="number" value="${state.junction.y}" />
            </div>
            <div class="je-field">
              <label class="je-label">Crosswalk Depth (m)</label>
              <input class="je-input" id="je-crosswalk-depth" type="number" step="0.1" value="${state.junction.crosswalk_depth_m}" />
            </div>
          </div>
        </div>
      `,
    },
    {
      id: "junction-cross-skeleton",
      title: "Cross Skeleton",
      subtitle: "Road arms and lane seeds",
      content: `
        <div class="je-panel">
          <h3 class="je-panel-title">Cross Skeleton</h3>
          <div class="je-panel-content">
            ${buildCrossSkeletonPanel(state)}
          </div>
        </div>
        <div class="je-panel">
          <h3 class="je-panel-title">Road Arms</h3>
          <div class="je-panel-content">
            ${buildRoadArmsPanel(state)}
          </div>
        </div>
        <div class="je-panel">
          <h3 class="je-panel-title">Lane Bindings</h3>
          <div class="je-panel-content">
            ${buildLaneBindingsPanel(state)}
          </div>
        </div>
      `,
      open: true,
    },
  ]);
  shell.setRightTabs(
    [
      {
        id: "selection",
        label: "Selection Inspector",
        content: `
          <div class="je-panel">
            <h3 class="je-panel-title">Lane Surfaces</h3>
            <div class="je-panel-content">
              ${buildLaneSurfacesPanel(state)}
            </div>
          </div>
          <div class="je-panel">
            <h3 class="je-panel-title">Corner Skeleton Lines</h3>
            <div class="je-panel-content">
              ${buildSkeletonLinesPanel(state)}
            </div>
          </div>
          <div class="je-panel">
            <h3 class="je-panel-title">Bezier Patches</h3>
            <div class="je-panel-content">
              ${buildBezierPatchesPanel(state)}
            </div>
          </div>
        `,
      },
      {
        id: "surface-tools",
        label: "Surface Tools",
        content: `
          <div class="je-panel">
            <h3 class="je-panel-title">Selection Mode</h3>
            <div class="je-panel-content je-toolbar-actions">
              <button class="je-btn ${state.selectionMode === "single" ? "active" : ""}" data-selection-mode="single" type="button">↖ Select</button>
              <button class="je-btn ${state.selectionMode === "multi" ? "active" : ""}" data-selection-mode="multi" type="button">☒ Multi Select</button>
            </div>
          </div>
          <div class="je-panel">
            <h3 class="je-panel-title">Draw & Edit</h3>
            <div class="je-panel-content je-toolbar-actions">
              <button class="je-btn ${state.selectedTool === "draw-skeleton" ? "active" : ""}" data-tool="draw-skeleton" type="button">✏️ Draw Corner Skeleton</button>
              <button class="je-btn ${state.selectedTool === "draw-patch" ? "active" : ""}" data-tool="draw-patch" type="button">◧ Draw Patch</button>
              <button class="je-btn ${state.selectedTool === "surface-edit" ? "active" : ""}" data-tool="surface-edit" type="button">⬚ Edit Surfaces</button>
            </div>
          </div>
          <div class="je-panel">
            <h3 class="je-panel-title">Surface Operations</h3>
            <div class="je-panel-content je-toolbar-actions">
              <button class="je-btn" data-action="reset-generated" type="button">Reset Generated</button>
              <button class="je-btn" data-action="insert-node" type="button">Insert Node</button>
              <button class="je-btn" data-action="toggle-edge" type="button">Toggle Edge Curve</button>
              <button class="je-btn" data-action="delete-node" type="button">Delete Node</button>
              <button class="je-btn" data-action="merge-selected" type="button" ${state.surfaceMergeSelection.length !== 2 ? "disabled" : ""}>${escapeHtml(`Merge Selected (${state.surfaceMergeSelection.length})`)}</button>
            </div>
          </div>
        `,
      },
      {
        id: "save-export",
        label: "Save & Export",
        content: `
          <div class="je-panel">
            <h3 class="je-panel-title">Output</h3>
            <div class="je-panel-content je-toolbar-actions">
              <button class="je-btn" data-action="reset-cross-skeleton" type="button">✚ Reset Cross</button>
              <button class="je-btn je-btn-primary" data-action="preview-3d" type="button">🎲 3D Preview</button>
              <button class="je-btn" data-action="export-json" type="button">💾 Export JSON</button>
              <button class="je-btn" data-action="save-template" type="button">📁 Save Template</button>
            </div>
          </div>
        `,
      },
    ],
    "selection",
  );
  shell.setMenuActions({
    "file-export-json": () => {
      shell.root.querySelector<HTMLButtonElement>('[data-action="export-json"]')?.click();
    },
    "file-save-context": () => {
      shell.root.querySelector<HTMLButtonElement>('[data-action="save-template"]')?.click();
    },
    "tools-open-settings": () => shell.activateRightTab("surface-tools"),
    "tools-open-presets": () => shell.activateRightTab("save-export"),
    "help-shortcuts": () => {
      shell.setBottomOpen(true);
      shell.root.querySelector<HTMLButtonElement>('[data-shell-status-tab="hints"]')?.click();
    },
  });
  shell.statusStatusHost.innerHTML = `
    <div class="desktop-shell-inline-status">
      ${escapeHtml(state.mergeStatusMessage ?? "Junction editor ready. Center stays fixed at the visual origin; use the left rail to edit arm lengths and lane counts.")}
    </div>
  `;
  shell.setStatusSummary(state.mergeStatusMessage ?? "Junction editor ready.");
  shell.centerStage.innerHTML = `
    <div class="je-canvas-shell">
      <div class="je-canvas-wrap">
        <canvas id="je-canvas" class="je-canvas"></canvas>
        <div class="je-canvas-info">
          <span id="je-cursor-pos">X: 0.0m, Y: 0.0m</span>
          <span id="je-zoom-level">${state.scale.toFixed(1)}x</span>
        </div>
      </div>
    </div>
  `;
}

function buildHTML(state: EditorState): string {
  const mergeCandidateCount = state.surfaceMergeSelection.length;
  const mergeSelectedLabel = `Merge Selected (${mergeCandidateCount})`;
  const mergeDisabled = mergeCandidateCount !== 2 ? "disabled" : "";
  return `
    <div class="je-layout">
      <div class="je-toolbar">
        <div class="je-toolbar-left">
          <div class="je-kicker">${escapeHtml("Viewer / Junction")}</div>
          <h1 class="je-title">Junction Editor</h1>
          <p class="je-subtitle">Structured cross skeletons, lane flows, and corner geometry for reusable junction templates</p>
        </div>
        <div class="je-toolbar-actions">
          <button data-nav="viewer" class="je-nav-button" type="button">🏠 3D Viewer</button>
          <button data-nav="scene-graph" class="je-nav-button" type="button">📝 Annotation</button>
          <button data-nav="asset-editor" class="je-nav-button" type="button">🎨 Asset Editor</button>
          <div class="je-separator"></div>
          <button class="je-btn ${state.selectionMode === "single" ? "active" : ""}" data-selection-mode="single" type="button">
            ↖ Select
          </button>
          <button class="je-btn ${state.selectionMode === "multi" ? "active" : ""}" data-selection-mode="multi" type="button">
            ☒ Multi Select
          </button>
          <button class="je-btn" data-action="reset-generated" type="button">
            Reset Generated
          </button>
          <button class="je-btn" data-action="insert-node" type="button">
            Insert Node
          </button>
          <button class="je-btn" data-action="toggle-edge" type="button">
            Toggle Edge Curve
          </button>
          <button class="je-btn" data-action="delete-node" type="button">
            Delete Node
          </button>
          <button class="je-btn" data-action="merge-selected" type="button" ${mergeDisabled}>
            ${escapeHtml(mergeSelectedLabel)}
          </button>
          <button class="je-btn ${state.selectedTool === "draw-skeleton" ? "active" : ""}" data-tool="draw-skeleton" type="button">
            ✏️ Draw Corner Skeleton
          </button>
          <button class="je-btn ${state.selectedTool === "draw-patch" ? "active" : ""}" data-tool="draw-patch" type="button">
            ◧ Draw Patch
          </button>
          <button class="je-btn ${state.selectedTool === "surface-edit" ? "active" : ""}" data-tool="surface-edit" type="button">
            ⬚ Edit Surfaces
          </button>
          <div class="je-separator"></div>
          <button class="je-btn" data-action="reset-cross-skeleton" type="button">
            ✚ Reset Cross
          </button>
          <button class="je-btn je-btn-primary" data-action="preview-3d" type="button">
            🎲 3D Preview
          </button>
          <button class="je-btn" data-action="export-json" type="button">
            💾 Export JSON
          </button>
          <button class="je-btn" data-action="save-template" type="button">
            📁 Save Template
          </button>
        </div>
      </div>

      <div class="je-body">
        <div class="je-sidebar">
          <div class="je-panel">
            <h3 class="je-panel-title">Junction Properties</h3>
            <div class="je-panel-content">
              <div class="je-field">
                <label class="je-label">Junction ID</label>
                <input class="je-input" id="je-junction-id" type="text" value="${escapeHtml(state.junction.id)}" />
              </div>
              <div class="je-field">
                <label class="je-label">Junction Label</label>
                <input class="je-input" id="je-junction-label" type="text" value="${escapeHtml(state.junction.label)}" />
              </div>
              <div class="je-field">
                <label class="je-label">Junction Kind</label>
                <select class="je-input" id="je-junction-kind">
                  <option value="cross_junction" ${state.junction.kind === "cross_junction" ? "selected" : ""}>Cross Junction (十字)</option>
                  <option value="t_junction" ${state.junction.kind === "t_junction" ? "selected" : ""}>T Junction (T型)</option>
                  <option value="complex_junction" ${state.junction.kind === "complex_junction" ? "selected" : ""}>Complex (复杂)</option>
                </select>
              </div>
            </div>
          </div>

          <div class="je-panel">
            <h3 class="je-panel-title">Junction Anchor</h3>
            <div class="je-panel-content">
              <div class="je-field">
                <label class="je-label">Position X (m)</label>
                <input class="je-input" id="je-junction-x" type="number" value="${state.junction.x}" />
              </div>
              <div class="je-field">
                <label class="je-label">Position Y (m)</label>
                <input class="je-input" id="je-junction-y" type="number" value="${state.junction.y}" />
              </div>
              <div class="je-field">
                <label class="je-label">Crosswalk Depth (m)</label>
                <input class="je-input" id="je-crosswalk-depth" type="number" step="0.1" value="${state.junction.crosswalk_depth_m}" />
              </div>
            </div>
          </div>

          <div class="je-panel">
            <h3 class="je-panel-title">Cross Skeleton</h3>
            <div class="je-panel-content">
              ${buildCrossSkeletonPanel(state)}
            </div>
          </div>

          <div class="je-panel">
            <h3 class="je-panel-title">Road Arms</h3>
            <div class="je-panel-content">
              ${buildRoadArmsPanel(state)}
            </div>
          </div>

          <div class="je-panel">
            <h3 class="je-panel-title">Lane Bindings</h3>
            <div class="je-panel-content">
              ${buildLaneBindingsPanel(state)}
            </div>
          </div>

          <div class="je-panel">
            <h3 class="je-panel-title">Lane Surfaces</h3>
            <div class="je-panel-content">
              ${buildLaneSurfacesPanel(state)}
            </div>
          </div>

          <div class="je-panel">
            <h3 class="je-panel-title">Corner Skeleton Lines</h3>
            <div class="je-panel-content">
              ${buildSkeletonLinesPanel(state)}
            </div>
          </div>

          <div class="je-panel">
            <h3 class="je-panel-title">Bezier Patches</h3>
            <div class="je-panel-content">
              ${buildBezierPatchesPanel(state)}
            </div>
          </div>
        </div>

        <div class="je-canvas-wrap">
          <canvas id="je-canvas" class="je-canvas"></canvas>
          <div class="je-canvas-info">
            <span id="je-cursor-pos">X: 0.0m, Y: 0.0m</span>
            <span id="je-zoom-level">${state.scale.toFixed(1)}x</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildCrossSkeletonPanel(state: EditorState): string {
  const pointMap = buildCrossSkeletonPointMap(state.crossSkeleton);
  return `
    <div class="je-summary-card">
      <div class="je-summary-row">
        <span class="je-summary-label">Local Center</span>
        <span class="je-summary-value">(0.0, 0.0)</span>
      </div>
      <div class="je-summary-row">
        <span class="je-summary-label">World Anchor</span>
        <span class="je-summary-value">(${state.junction.x.toFixed(1)}, ${state.junction.y.toFixed(1)})</span>
      </div>
      <div class="je-summary-points">
        ${(["center", ...ARM_ORDER] as const)
          .map((key) => {
            const point = pointMap[key];
            const label = key === "center" ? "Center" : ARM_LABELS[key];
            return `
              <div class="je-point-chip">
                <span class="je-point-name">${label}</span>
                <span class="je-point-value">${point.x.toFixed(1)}, ${point.y.toFixed(1)}</span>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="je-helper-text">Cross skeleton uses 5 local points: 1 center + 4 road endpoints. Lane geometry is derived from this scaffold and anchored at the junction position.</div>
    </div>
  `;
}

function buildRoadArmsPanel(state: EditorState): string {
  return state.crossSkeleton.arms
    .map((arm) => `
      <div class="je-arm-card">
        <div class="je-arm-header">
          <span class="je-arm-name">${ARM_LABELS[arm.armKey]} Arm</span>
          <span class="je-arm-tag">${ARM_LABELS[arm.armKey]}</span>
        </div>
        <div class="je-arm-grid">
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Road ID</label>
            <input
              class="je-input je-input-sm je-input-fill"
              type="text"
              value="${escapeHtml(arm.roadId)}"
              data-arm-key="${arm.armKey}"
              data-arm-field="roadId"
            />
          </div>
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Angle (deg)</label>
            <input
              class="je-input je-input-sm"
              type="number"
              step="1"
              value="${arm.angleDeg}"
              data-arm-key="${arm.armKey}"
              data-arm-field="angleDeg"
            />
          </div>
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Length (m)</label>
            <input
              class="je-input je-input-sm"
              type="number"
              min="${MIN_ARM_LENGTH_M}"
              step="1"
              value="${arm.lengthM}"
              data-arm-key="${arm.armKey}"
              data-arm-field="lengthM"
            />
          </div>
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Carriageway (m)</label>
            <input
              class="je-input je-input-sm"
              type="number"
              min="1"
              step="0.1"
              value="${arm.carriagewayWidthM}"
              data-arm-key="${arm.armKey}"
              data-arm-field="carriagewayWidthM"
            />
          </div>
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Furnishing (m)</label>
            <input
              class="je-input je-input-sm"
              type="number"
              min="${MIN_STRIP_WIDTH_M}"
              step="0.1"
              value="${arm.nearroadFurnishingWidthM}"
              data-arm-key="${arm.armKey}"
              data-arm-field="nearroadFurnishingWidthM"
            />
          </div>
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Sidewalk (m)</label>
            <input
              class="je-input je-input-sm"
              type="number"
              min="${MIN_STRIP_WIDTH_M}"
              step="0.1"
              value="${arm.clearSidewalkWidthM}"
              data-arm-key="${arm.armKey}"
              data-arm-field="clearSidewalkWidthM"
            />
          </div>
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Frontage (m)</label>
            <input
              class="je-input je-input-sm"
              type="number"
              min="${MIN_STRIP_WIDTH_M}"
              step="0.1"
              value="${arm.frontageReserveWidthM}"
              data-arm-key="${arm.armKey}"
              data-arm-field="frontageReserveWidthM"
            />
          </div>
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Inbound Lanes</label>
            <input
              class="je-input je-input-sm"
              type="number"
              min="${MIN_LANE_COUNT}"
              max="${MAX_LANE_COUNT}"
              step="1"
              value="${arm.inboundLaneCount}"
              data-arm-key="${arm.armKey}"
              data-arm-field="inboundLaneCount"
            />
          </div>
          <div class="je-field je-field-compact">
            <label class="je-label-sm">Outbound Lanes</label>
            <input
              class="je-input je-input-sm"
              type="number"
              min="${MIN_LANE_COUNT}"
              max="${MAX_LANE_COUNT}"
              step="1"
              value="${arm.outboundLaneCount}"
              data-arm-key="${arm.armKey}"
              data-arm-field="outboundLaneCount"
            />
          </div>
        </div>
      </div>
    `)
    .join("");
}

function buildLaneBindingsPanel(state: EditorState): string {
  const laneBindings = buildStructuredLaneBindings(state);
  if (laneBindings.length === 0) {
    return '<div class="je-empty-hint">No generated lanes yet. Increase inbound/outbound lane counts for any road arm.</div>';
  }

  return laneBindings
    .map(
      (lane) => `
        <div class="je-lane-item" data-surface-kind="lane" data-surface-id="${escapeHtml(laneSurfaceIdForBinding(lane))}">
          <div class="je-lane-header">
            <button class="je-lane-select-btn" type="button" data-surface-kind="lane" data-surface-id="${escapeHtml(laneSurfaceIdForBinding(lane))}">
              ${escapeHtml(lane.laneId)}
            </button>
            <span class="je-badge je-badge-sm">${lane.flow}</span>
          </div>
          <div class="je-lane-meta">
            <span>${ARM_LABELS[lane.armKey]} Arm</span>
            <span>${escapeHtml(lane.roadId)}</span>
          </div>
          <div class="je-lane-meta">
            <span>Skeleton</span>
            <span>${escapeHtml(lane.skeletonId)}</span>
          </div>
        </div>
      `,
    )
    .join("");
}

function buildLaneSurfacesPanel(state: EditorState): string {
  const composition = getOrCreateComposition(state);
  const laneSurfaces = composition.laneSurfaces ?? [];
  const mergedSurfaces = composition.mergedSurfaces ?? [];
  const allSurfaces = [...laneSurfaces.map((surface) => ({ surface, kind: "lane" as const })), ...mergedSurfaces.map((surface) => ({ surface, kind: "merged" as const }))];
  const mergeCandidateCount = state.surfaceMergeSelection.length;
  const mergePreview = getActiveMergePreview(state);
  const mergeStatus = describeMergeState(state, mergePreview);

  const activeSurface = state.selectedSurface
    ? allSurfaces.find((item) => item.kind === state.selectedSurface?.kind && item.surface.surfaceId === state.selectedSurface.surfaceId)
    : null;

  return `
    <div class="je-helper-text je-surface-tip">
      Tip: click a surface to focus it. Use Multi Select to add multiple merge candidates before merging.
      Current mode: ${state.selectionMode === "multi" ? "Multi" : "Single"}.
      Current candidates: ${mergeCandidateCount}.
      ${mergeStatus}
    </div>
    ${
      activeSurface
        ? `<div class="je-summary-card je-surface-summary">
            <div class="je-summary-row">
              <span class="je-summary-label">Active Surface</span>
              <span class="je-summary-value">${escapeHtml(activeSurface.surface.surfaceId)}</span>
            </div>
            <div class="je-summary-row">
              <span class="je-summary-label">Mode</span>
              <span class="je-summary-value">${escapeHtml(activeSurface.kind)}</span>
            </div>
            <div class="je-summary-row">
              <span class="je-summary-label">Nodes</span>
              <span class="je-summary-value">${activeSurface.surface.nodes.length}</span>
            </div>
            <div class="je-summary-row">
              <span class="je-summary-label">Merge Candidates</span>
              <span class="je-summary-value">${mergeCandidateCount}</span>
            </div>
          </div>`
        : '<div class="je-empty-hint">Select a lane surface to edit nodes, edges, or merge candidates.</div>'
    }
    ${
      allSurfaces.length === 0
        ? ""
        : allSurfaces
            .map(({ surface, kind }) => {
              const isActive =
                state.selectedSurface?.kind === kind && state.selectedSurface.surfaceId === surface.surfaceId;
              const isCandidate = state.surfaceMergeSelection.includes(surface.surfaceId);
              const isMerged = kind === "merged";
              const checked = state.surfaceMergeSelection.includes(surface.surfaceId) ? "checked" : "";
              const label = isMerged ? `Merged: ${surface.surfaceId}` : surface.laneId;
              const meta = isMerged
                ? `${surface.mergedFromSurfaceIds.length} surfaces`
                : `${ARM_LABELS[surface.armKey]} · ${surface.flow} · lane ${surface.laneIndex + 1}`;
              return `
                <div class="je-surface-item${isActive ? " active" : ""}${isCandidate ? " candidate" : ""}">
                  <div class="je-surface-header">
                    <label class="je-surface-select">
                      <input
                        type="checkbox"
                        data-surface-merge="${escapeHtml(surface.surfaceId)}"
                        ${checked}
                      />
                      <span>${escapeHtml(label)}</span>
                    </label>
                    <button
                      class="je-lane-select-btn"
                      type="button"
                      data-surface-kind="${kind}"
                      data-surface-id="${escapeHtml(surface.surfaceId)}"
                    >
                      Focus
                    </button>
                  </div>
                  <div class="je-surface-meta">${escapeHtml(meta)}</div>
                  <div class="je-surface-meta">
                    <span>${surface.nodes.length} nodes</span>
                    <span>${surface.edges.length} edges</span>
                    <span>${escapeHtml(surface.provenance)}</span>
                  </div>
                </div>
              `;
            })
            .join("")
    }
  `;
}

function buildSkeletonLinesPanel(state: EditorState): string {
  if (state.compositions.length === 0) {
    return '<div class="je-empty-hint">No corner skeleton lines yet. Use "Draw Corner Skeleton" to add manual corner geometry.</div>';
  }

  return state.compositions
    .flatMap((composition) =>
      composition.quadrants.flatMap((quadrant) =>
        quadrant.skeletonLines.map(
          (skeletonLine, index) => `
            <div class="je-skeleton-item" data-quadrant="${quadrant.quadrantId}" data-index="${index}">
              <div class="je-skeleton-header">
                <span class="je-skeleton-name">${quadrant.quadrantId}: ${skeletonLine.lineId}</span>
                <span class="je-badge je-badge-sm">${skeletonLine.stripKind}</span>
              </div>
              <div class="je-skeleton-width">
                <label class="je-label-sm">Width (m)</label>
                <input
                  class="je-input je-input-sm"
                  type="number"
                  step="0.1"
                  value="${skeletonLine.widthM.toFixed(2)}"
                  data-quadrant="${quadrant.quadrantId}"
                  data-index="${index}"
                  data-field="width"
                />
              </div>
            </div>
          `,
        ),
      ),
    )
    .join("");
}

function buildBezierPatchesPanel(state: EditorState): string {
  if (state.compositions.length === 0) {
    return '<div class="je-empty-hint">No bezier patches yet. Draw manual corner skeletons first.</div>';
  }

  return state.compositions
    .flatMap((composition) =>
      composition.quadrants.flatMap((quadrant) =>
        quadrant.patches.map(
          (patch, index) => `
            <div class="je-patch-item" data-quadrant="${quadrant.quadrantId}" data-index="${index}">
              <div class="je-patch-header">
                <span class="je-patch-name">${quadrant.quadrantId}: ${patch.patchId}</span>
              </div>
              <div class="je-patch-curves">
                <div class="je-curve-info">
                  <span class="je-curve-label">Inner</span>
                  <span class="je-curve-points">${patch.innerCurve.control1.x.toFixed(1)},${patch.innerCurve.control1.y.toFixed(1)}</span>
                </div>
                <div class="je-curve-info">
                  <span class="je-curve-label">Outer</span>
                  <span class="je-curve-points">${patch.outerCurve.control1.x.toFixed(1)},${patch.outerCurve.control1.y.toFixed(1)}</span>
                </div>
              </div>
            </div>
          `,
        ),
      ),
    )
    .join("");
}

function bindEvents(root: HTMLElement, state: EditorState, actions: EditorActions) {
  root.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const nav = (event.target as HTMLElement | null)?.dataset.nav;
      if (nav) {
        window.location.hash = nav === "viewer" ? "" : `#${nav}`;
      }
    });
  });

  root.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const tool = (event.currentTarget as HTMLElement | null)?.dataset.tool;
      if (!tool) {
        return;
      }
      state.selectedTool = tool as EditorState["selectedTool"];
      state.drawingSkeleton = null;
      actions.rerender();
    });
  });

  root.querySelectorAll("[data-selection-mode]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const mode = (event.currentTarget as HTMLElement | null)?.dataset.selectionMode as SelectionMode | undefined;
      if (!mode) {
        return;
      }
      setSelectionMode(state, mode);
      actions.rerender();
    });
  });

  root.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const action = (event.currentTarget as HTMLElement | null)?.dataset.action;
      if (action === "preview-3d") {
        handlePreview3D();
        return;
      }
      if (action === "export-json") {
        handleExportJSON(state);
        return;
      }
      if (action === "save-template") {
        void handleSaveTemplate(state);
        return;
      }
      if (action === "reset-cross-skeleton") {
        state.crossSkeleton = createDefaultCrossSkeleton();
        syncStructuredJunctionBindings(state);
        syncStructuredLaneSurfaces(state);
        seedStructuredCornerQuadrants(state, true);
        actions.rerender();
        return;
      }
      if (action === "reset-generated") {
        resetGeneratedLaneSurfaces(state);
        actions.rerender();
        return;
      }
      if (action === "insert-node") {
        insertSelectedSurfaceNode(state);
        actions.rerender();
        return;
      }
      if (action === "toggle-edge") {
        toggleSelectedSurfaceEdge(state);
        actions.rerender();
        return;
      }
      if (action === "delete-node") {
        deleteSelectedSurfaceNode(state);
        actions.rerender();
        return;
      }
      if (action === "merge-selected") {
        mergeSelectedSurfaces(state);
        actions.rerender();
        return;
      }
    });
  });

  root.querySelectorAll("[data-surface-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const action = (event.currentTarget as HTMLElement | null)?.dataset.surfaceAction;
      if (!action) {
        return;
      }
      if (action === "reset-generated") {
        resetGeneratedLaneSurfaces(state);
        actions.rerender();
        return;
      }
      if (action === "insert-node") {
        insertSelectedSurfaceNode(state);
        actions.rerender();
        return;
      }
      if (action === "toggle-edge") {
        toggleSelectedSurfaceEdge(state);
        actions.rerender();
        return;
      }
      if (action === "delete-node") {
        deleteSelectedSurfaceNode(state);
        actions.rerender();
        return;
      }
      if (action === "merge-selected") {
        mergeSelectedSurfaces(state);
        actions.rerender();
      }
    });
  });

  root.querySelectorAll("button[data-surface-kind][data-surface-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const mouseEvent = event as MouseEvent;
      const target = event.currentTarget as HTMLElement | null;
      const surfaceKind = target?.dataset.surfaceKind as SurfaceSelectionKind | undefined;
      const surfaceId = target?.dataset.surfaceId;
      if (!surfaceKind || !surfaceId) {
        return;
      }
      focusSurfaceSelection(state, { kind: surfaceKind, surfaceId }, inferSelectionMode(state, mouseEvent, "toggle"));
      actions.rerender();
    });
  });

  const canvas = root.querySelector<HTMLCanvasElement>("#je-canvas");
  if (canvas) {
    canvas.addEventListener("mousedown", (event) => handleCanvasMouseDown(event, canvas, state, actions));
    canvas.addEventListener("mousemove", (event) => handleCanvasMouseMove(event, canvas, state, actions));
    canvas.addEventListener("mouseup", () => handleCanvasMouseUp(state, actions));
    canvas.addEventListener("mouseleave", () => handleCanvasMouseLeave(state, actions));
    canvas.addEventListener("wheel", (event) => handleCanvasWheel(event, root, state, actions));
  }

  root.addEventListener("input", (event) => {
    const target = event.target;

    const widthInput =
      target instanceof Element ? target.closest<HTMLInputElement>('input[data-field="width"]') : null;
    if (widthInput) {
      handleWidthInput(state, widthInput);
      actions.redrawCanvas();
      return;
    }

    const armInput =
      target instanceof Element ? target.closest<HTMLInputElement>('input[data-arm-field]') : null;
    if (armInput) {
      handleArmInput(state, armInput);
      syncStructuredJunctionBindings(state);
      syncStructuredLaneSurfaces(state);
      seedStructuredCornerQuadrants(state, true);
      actions.redrawCanvas();
      return;
    }

    const surfaceMergeCheckbox =
      target instanceof Element ? target.closest<HTMLInputElement>('input[data-surface-merge]') : null;
    if (surfaceMergeCheckbox) {
      toggleSurfaceMergeSelection(state, surfaceMergeCheckbox.dataset.surfaceMerge ?? "", surfaceMergeCheckbox.checked);
      actions.rerender();
      return;
    }

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.id === "je-junction-id") {
      state.junction.id = target.value.trim() || state.junction.id;
      syncStructuredJunctionBindings(state);
      syncStructuredLaneSurfaces(state);
      syncCompositionMetadata(state);
      actions.redrawCanvas();
      return;
    }

    if (target.id === "je-junction-label") {
      state.junction.label = target.value;
      actions.redrawCanvas();
      return;
    }

    if (target.id === "je-junction-x") {
      translateJunctionAxis(state, "x", target.value);
      actions.redrawCanvas();
      return;
    }

    if (target.id === "je-junction-y") {
      translateJunctionAxis(state, "y", target.value);
      actions.redrawCanvas();
      return;
    }

    if (target.id === "je-crosswalk-depth") {
      const parsedValue = Number.parseFloat(target.value);
      if (Number.isFinite(parsedValue)) {
        state.junction.crosswalk_depth_m = Math.max(0.5, parsedValue);
      }
    }
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('input[data-arm-field], input[data-field="width"]')) {
      actions.rerender();
      return;
    }
    if (target instanceof HTMLInputElement && target.id === "je-junction-id") {
      actions.rerender();
    }
  });

  const junctionKindSelect = root.querySelector<HTMLSelectElement>("#je-junction-kind");
  if (junctionKindSelect) {
    junctionKindSelect.addEventListener("change", (event) => {
      state.junction.kind = (event.target as HTMLSelectElement).value;
      syncCompositionMetadata(state);
      actions.rerender();
    });
  }
}

function handleCanvasMouseDown(
  event: MouseEvent,
  canvas: HTMLCanvasElement,
  state: EditorState,
  actions: EditorActions,
) {
  const point = readCanvasPoint(event, canvas, state);

  if (state.selectedTool === "draw-skeleton") {
    if (!state.drawingSkeleton) {
      const quadrantIndex = inferQuadrantIndexFromPoint(point, state.junction);
      state.drawingSkeleton = {
        quadrantIndex,
        stripKind: "clear_sidewalk",
        curveType: "skeleton",
        points: [point, point, point, point],
      };
    } else {
      const points = state.drawingSkeleton.points;
      points[3] = point;
      points[2] = midpoint(points[0], point);
      state.drawingSkeleton.quadrantIndex = inferQuadrantIndexFromDraft(points, state.junction);
    }
    actions.redrawCanvas();
    return;
  }

  const surfaceHit = hitTestSurfaceInteractable(point, state);
  if (surfaceHit) {
    const selectionMode =
      state.selectedTool === "surface-edit" && surfaceHit.kind !== "surface"
        ? inferSelectionMode(state, event, "ensure")
        : inferSelectionMode(state, event, "toggle");
    focusSurfaceSelection(
      state,
      { kind: surfaceHit.surfaceKind, surfaceId: surfaceHit.surfaceId },
      selectionMode,
    );
    if (state.selectedTool === "surface-edit") {
      if (surfaceHit.kind === "node") {
        state.selectedSurfaceNodeId = surfaceHit.nodeId;
        state.selectedSurfaceNodePoint = { ...surfaceHit.point };
        state.surfaceDragTarget = {
          kind: "node",
          surfaceKind: surfaceHit.surfaceKind,
          surfaceId: surfaceHit.surfaceId,
          nodeId: surfaceHit.nodeId,
        };
        actions.redrawCanvas();
        return;
      } else if (surfaceHit.kind === "control") {
        state.selectedSurfaceEdgeId = surfaceHit.edgeId;
        state.surfaceDragTarget = {
          kind: "control",
          surfaceKind: surfaceHit.surfaceKind,
          surfaceId: surfaceHit.surfaceId,
          edgeId: surfaceHit.edgeId,
          control: surfaceHit.control,
        };
        actions.redrawCanvas();
        return;
      } else if (surfaceHit.kind === "edge" && event.shiftKey) {
        insertSurfaceNodeAtHit(state, surfaceHit, point);
        actions.rerender();
        return;
      } else if (surfaceHit.kind === "edge") {
        state.selectedSurfaceEdgeId = surfaceHit.edgeId;
        state.selectedSurfaceNodePoint = null;
      }
      actions.rerender();
      return;
    }
    actions.rerender();
    return;
  }

  if (state.selectedTool === "select") {
    const hitPoint = hitTestControlPoints(point, state);
    if (hitPoint) {
      state.selectedElement = hitPoint;
    }
  }
}

function handleCanvasMouseMove(
  event: MouseEvent,
  canvas: HTMLCanvasElement,
  state: EditorState,
  actions: EditorActions,
) {
  const point = readCanvasPoint(event, canvas, state);
  updateCursorPosition(canvas, point);

  if (state.surfaceDragTarget) {
    const surface = findSurfaceBySelection(state, state.surfaceDragTarget.surfaceKind, state.surfaceDragTarget.surfaceId);
    if (surface) {
      if (state.surfaceDragTarget.kind === "node") {
        moveSurfaceNode(surface, state.surfaceDragTarget.nodeId, point);
        markSurfaceEdited(surface);
        state.selectedSurfaceNodePoint = { ...point };
      } else if (state.surfaceDragTarget.kind === "control") {
        moveSurfaceControl(surface, state.surfaceDragTarget.edgeId, state.surfaceDragTarget.control, point);
        markSurfaceEdited(surface);
      }
      actions.redrawCanvas();
    }
    return;
  }

  if (!state.drawingSkeleton) {
    return;
  }

  const points = state.drawingSkeleton.points;
  points[3] = point;
  points[2] = midpoint(points[0], point);
  state.drawingSkeleton.quadrantIndex = inferQuadrantIndexFromDraft(points, state.junction);
  actions.redrawCanvas();
}

function handleCanvasMouseUp(state: EditorState, actions: EditorActions) {
  if (state.surfaceDragTarget) {
    state.surfaceDragTarget = null;
    actions.rerender();
    return;
  }

  if (!state.drawingSkeleton) {
    return;
  }

  const skeletonDraft = state.drawingSkeleton;
  const curve: BezierCurve3 = {
    start: skeletonDraft.points[0],
    end: skeletonDraft.points[3],
    control1: skeletonDraft.points[1],
    control2: skeletonDraft.points[2],
  };
  const quadrantIndex = inferQuadrantIndexFromCurve(curve, state.junction);
  const skeletonLine: JunctionQuadrantSkeletonLine = {
    lineId: `skel_${state.junction.id}_${Date.now()}`,
    stripKind: skeletonDraft.stripKind,
    curve,
    widthM: DEFAULT_SKELETON_WIDTH_M,
  };

  const composition = getOrCreateComposition(state);
  const quadrantId = `Q${quadrantIndex}`;
  const quadrant = getOrCreateQuadrant(composition, quadrantId);
  quadrant.skeletonLines.push(skeletonLine);
  sortQuadrants(composition);

  state.drawingSkeleton = null;
  syncStructuredLaneSurfaces(state);
  actions.rerender();
}

function handleCanvasMouseLeave(state: EditorState, actions: EditorActions) {
  if (state.surfaceDragTarget) {
    state.surfaceDragTarget = null;
    actions.rerender();
  }
}

function handleCanvasWheel(event: WheelEvent, root: HTMLElement, state: EditorState, actions: EditorActions) {
  event.preventDefault();
  const delta = event.deltaY > 0 ? 0.9 : 1.1;
  state.scale = Math.max(1, Math.min(50, state.scale * delta));

  const zoomElement = root.querySelector("#je-zoom-level");
  if (zoomElement) {
    zoomElement.textContent = `${state.scale.toFixed(1)}x`;
  }

  actions.redrawCanvas();
}

function hitTestControlPoints(_point: AnnotationPoint, _state: EditorState): SelectedElement | null {
  return null;
}

type SurfaceHit =
  | {
      kind: "surface";
      surfaceKind: SurfaceSelectionKind;
      surfaceId: string;
    }
  | {
      kind: "node";
      surfaceKind: SurfaceSelectionKind;
      surfaceId: string;
      nodeId: string;
      nodeIndex: number;
      point: AnnotationPoint;
    }
  | {
      kind: "edge";
      surfaceKind: SurfaceSelectionKind;
      surfaceId: string;
      edgeId: string;
      edgeIndex: number;
      point: AnnotationPoint;
    }
  | {
      kind: "control";
      surfaceKind: SurfaceSelectionKind;
      surfaceId: string;
      edgeId: string;
      edgeIndex: number;
      control: "control1" | "control2";
      point: AnnotationPoint;
    };

function getPrimaryComposition(state: EditorState): JunctionComposition | null {
  return state.compositions[0] ?? null;
}

function getOrCreateComposition(state: EditorState): JunctionComposition {
  syncCompositionMetadata(state);
  const existing = state.compositions[0];
  if (existing) {
    if (!existing.laneSurfaces) {
      existing.laneSurfaces = [];
    }
    if (!existing.mergedSurfaces) {
      existing.mergedSurfaces = [];
    }
    return existing;
  }

  const composition: JunctionComposition = {
    junctionId: state.junction.id,
    kind: normalizeJunctionCompositionKind(state.junction.kind),
    quadrants: [],
    laneSurfaces: [],
    mergedSurfaces: [],
  };
  state.compositions = [composition];
  return composition;
}

function buildLaneSurfaceSeed(lane: StructuredLaneBinding): LaneSurfaceBindingSeed {
  return {
    surfaceId: laneSurfaceIdForBinding(lane),
    laneId: lane.laneId,
    armKey: lane.armKey,
    flow: lane.flow,
    laneIndex: lane.laneIndex,
    laneWidthM: lane.laneWidthM,
    skeletonId: lane.skeletonId,
    startLocal: lane.startLocal,
    endLocal: lane.endLocal,
  };
}

function laneSurfaceIdForBinding(lane: StructuredLaneBinding): string {
  return `lane_surface_${lane.armKey}_${lane.flow}_${String(lane.laneIndex + 1).padStart(2, "0")}`;
}

function armAxis(arm: StructuredArmConfig): AnnotationPoint {
  return armAxisFromAngle(arm.angleDeg);
}

function armAxisFromAngle(angleDeg: number): AnnotationPoint {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function armNormal(arm: StructuredArmConfig): AnnotationPoint {
  const axis = armAxis(arm);
  return { x: axis.y, y: -axis.x };
}

function armSplitDistanceM(state: EditorState, arm: StructuredArmConfig): number {
  const preferred = JUNCTION_CORE_RADIUS_M + Math.max(0.5, state.junction.crosswalk_depth_m);
  return Math.max(1, Math.min(preferred, Math.max(1, arm.lengthM * 0.75)));
}

function getArmSplitLocal(state: EditorState, arm: StructuredArmConfig): AnnotationPoint {
  const axis = armAxis(arm);
  const splitDistanceM = armSplitDistanceM(state, arm);
  return {
    x: axis.x * splitDistanceM,
    y: axis.y * splitDistanceM,
  };
}

function laneBindingsForArm(arm: StructuredArmConfig, state: EditorState): StructuredLaneBinding[] {
  const skeletonId = skeletonIdForArm(state, arm);
  return [
    ...buildStructuredFlowBindings(state, arm, skeletonId, "inbound"),
    ...buildStructuredFlowBindings(state, arm, skeletonId, "outbound"),
  ];
}

function zoneFacingCornerForStructuredArm(
  boundaryCenter: AnnotationPoint,
  normal: AnnotationPoint,
  cornerCenter: AnnotationPoint,
): "left" | "right" {
  const dotValue = (cornerCenter.x - boundaryCenter.x) * normal.x + (cornerCenter.y - boundaryCenter.y) * normal.y;
  return dotValue >= 0 ? "left" : "right";
}

function structuredCarriagewayHalfWidthForZoneM(
  state: EditorState,
  arm: StructuredArmConfig,
  zone: "left" | "right",
): number {
  void state;
  void zone;
  return Math.max(arm.carriagewayWidthM * 0.5, 0.5);
}

function structuredStripCenterOffsetForZoneM(
  state: EditorState,
  arm: StructuredArmConfig,
  zone: "left" | "right",
  stripKind: StripKind,
): number | null {
  const carriagewayHalfWidth = structuredCarriagewayHalfWidthForZoneM(state, arm, zone);
  if (carriagewayHalfWidth <= 0) {
    return null;
  }
  const widths: Array<[StripKind, number]> = [
    ["nearroad_furnishing", arm.nearroadFurnishingWidthM],
    ["clear_sidewalk", arm.clearSidewalkWidthM],
    ["frontage_reserve", arm.frontageReserveWidthM],
  ];
  let cursor = carriagewayHalfWidth;
  for (const [kind, width] of widths) {
    const safeWidth = Math.max(width, 0);
    if (kind === stripKind) {
      return cursor + safeWidth * 0.5;
    }
    cursor += safeWidth;
  }
  return null;
}

function structuredStripOffsetRangeForZoneM(
  state: EditorState,
  arm: StructuredArmConfig,
  zone: "left" | "right",
  stripKind: StripKind,
): { innerOffsetM: number; outerOffsetM: number; widthM: number } | null {
  const carriagewayHalfWidth = structuredCarriagewayHalfWidthForZoneM(state, arm, zone);
  const widths: Array<[StripKind, number]> = [
    ["nearroad_furnishing", arm.nearroadFurnishingWidthM],
    ["clear_sidewalk", arm.clearSidewalkWidthM],
    ["frontage_reserve", arm.frontageReserveWidthM],
  ];
  let cursor = carriagewayHalfWidth;
  for (const [kind, width] of widths) {
    const safeWidth = Math.max(width, 0);
    const innerAbs = cursor;
    const outerAbs = cursor + safeWidth;
    if (kind === stripKind) {
      if (safeWidth <= 0) {
        return null;
      }
      const sign = zone === "left" ? 1 : -1;
      return {
        innerOffsetM: sign * innerAbs,
        outerOffsetM: sign * outerAbs,
        widthM: safeWidth,
      };
    }
    cursor = outerAbs;
  }
  return null;
}

function orderedOffsetsForCorner(
  boundaryCenter: AnnotationPoint,
  normal: AnnotationPoint,
  cornerCenter: AnnotationPoint,
  innerOffsetM: number,
  outerOffsetM: number,
): { nearOffsetM: number; farOffsetM: number } {
  const edgeOffsetM = (cornerCenter.x - boundaryCenter.x) * normal.x + (cornerCenter.y - boundaryCenter.y) * normal.y;
  const offsets = [innerOffsetM, outerOffsetM].sort((a, b) => Math.abs(a - edgeOffsetM) - Math.abs(b - edgeOffsetM));
  return { nearOffsetM: offsets[0], farOffsetM: offsets[1] };
}

function structuredCornerTurnRadiusM(state: EditorState, quadrant: StructuredQuadrantContext): number {
  const widths: number[] = [];
  for (const stripKind of STRUCTURED_CORNER_STRIP_KINDS) {
    const rangeA = structuredStripOffsetRangeForZoneM(state, quadrant.armA, quadrant.zoneA, stripKind);
    const rangeB = structuredStripOffsetRangeForZoneM(state, quadrant.armB, quadrant.zoneB, stripKind);
    if (!rangeA || !rangeB) {
      continue;
    }
    widths.push(Math.max((rangeA.widthM + rangeB.widthM) * 0.5, 0));
  }
  const splitA = armSplitDistanceM(state, quadrant.armA);
  const splitB = armSplitDistanceM(state, quadrant.armB);
  const preferredRadiusM = Math.max(2.8, Math.max(...widths, 0) * 1.35, 0.75 * 3.0);
  const maxRadiusM = Math.max(Math.min(splitA, splitB) * 0.62, 1.0);
  return Math.max(Math.min(preferredRadiusM, maxRadiusM), 0.5);
}

function normalizeStructuredArmAngle(angleDeg: number): number {
  let normalized = angleDeg % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

function buildStructuredQuadrantContexts(state: EditorState): StructuredQuadrantContext[] {
  const orderedArms = [...state.crossSkeleton.arms].sort(
    (a, b) => normalizeStructuredArmAngle(a.angleDeg) - normalizeStructuredArmAngle(b.angleDeg),
  );
  const contexts: StructuredQuadrantContext[] = [];
  if (orderedArms.length < 2) {
    return contexts;
  }

  for (let index = 0; index < orderedArms.length; index += 1) {
    const armA = orderedArms[index];
    const armB = orderedArms[(index + 1) % orderedArms.length];
    let sweepDeg = normalizeStructuredArmAngle(armB.angleDeg) - normalizeStructuredArmAngle(armA.angleDeg);
    if (sweepDeg <= 0) {
      sweepDeg += 360;
    }
    if (sweepDeg <= 5 || sweepDeg >= 175) {
      continue;
    }
    const boundaryCenterA = localToWorldPoint(state, getArmSplitLocal(state, armA));
    const boundaryCenterB = localToWorldPoint(state, getArmSplitLocal(state, armB));
    const normalA = armNormal(armA);
    const normalB = armNormal(armB);
    const cornerCenter = lineIntersection(boundaryCenterA, normalA, boundaryCenterB, normalB);
    if (!cornerCenter) {
      continue;
    }
    contexts.push({
      quadrantId: `Q${contexts.length}`,
      armA,
      armB,
      boundaryCenterA,
      boundaryCenterB,
      normalA,
      normalB,
      cornerCenter,
      zoneA: zoneFacingCornerForStructuredArm(boundaryCenterA, normalA, cornerCenter),
      zoneB: zoneFacingCornerForStructuredArm(boundaryCenterB, normalB, cornerCenter),
    });
  }
  return contexts;
}

function buildStructuredFusedCornerStrips(state: EditorState): DerivedJunctionOverlayFusedStrip[] {
  const fused: DerivedJunctionOverlayFusedStrip[] = [];

  for (const quadrant of buildStructuredQuadrantContexts(state)) {
    const filletArmA = {
      splitBoundaryCenter: quadrant.boundaryCenterA,
      normal: quadrant.normalA,
      tangent: armAxis(quadrant.armA),
      splitDistancePx: armSplitDistanceM(state, quadrant.armA),
    };
    const filletArmB = {
      splitBoundaryCenter: quadrant.boundaryCenterB,
      normal: quadrant.normalB,
      tangent: armAxis(quadrant.armB),
      splitDistancePx: armSplitDistanceM(state, quadrant.armB),
    };
    const turnRadiusM = structuredCornerTurnRadiusM(state, quadrant);
    for (const stripKind of STRUCTURED_CORNER_STRIP_KINDS) {
      const rangeA = structuredStripOffsetRangeForZoneM(state, quadrant.armA, quadrant.zoneA, stripKind);
      const rangeB = structuredStripOffsetRangeForZoneM(state, quadrant.armB, quadrant.zoneB, stripKind);
      if (!rangeA || !rangeB) {
        continue;
      }

      const offsetsA = orderedOffsetsForCorner(
        quadrant.boundaryCenterA,
        quadrant.normalA,
        quadrant.cornerCenter,
        rangeA.innerOffsetM,
        rangeA.outerOffsetM,
      );
      const offsetsB = orderedOffsetsForCorner(
        quadrant.boundaryCenterB,
        quadrant.normalB,
        quadrant.cornerCenter,
        rangeB.innerOffsetM,
        rangeB.outerOffsetM,
      );
      const geometry = buildCornerFilletRibbonGeometryTs(
        filletArmA,
        filletArmB,
        offsetsA.nearOffsetM,
        offsetsB.nearOffsetM,
        offsetsA.farOffsetM,
        offsetsB.farOffsetM,
        turnRadiusM,
        0.75,
      );
      const centerKernel = cornerOffsetFilletKernelTs(
        filletArmA,
        filletArmB,
        (offsetsA.nearOffsetM + offsetsA.farOffsetM) * 0.5,
        (offsetsB.nearOffsetM + offsetsB.farOffsetM) * 0.5,
        turnRadiusM,
        0.75,
      );
      if (!geometry || geometry.ring.length < 3 || !centerKernel) {
        continue;
      }
      const centerLine = centerKernel.sampledPoints;

      const prefix = stripKind === "nearroad_furnishing" ? "nearroad" : stripKind === "clear_sidewalk" ? "sidewalk" : "frontage";
      fused.push({
        stripId: `${state.junction.id}_${prefix}_${quadrant.quadrantId}`,
        stripKind,
        quadrantId: quadrant.quadrantId,
        kernelId: `${quadrant.quadrantId}_kernel`,
        widthPx: (rangeA.widthM + rangeB.widthM) * 0.5,
        centerLine: centerLine.map((point) => ({ ...point })),
        innerLine: geometry.nearLine.map((point) => ({ ...point })),
        outerLine: geometry.farLine.map((point) => ({ ...point })),
        patch: {
          patchId: `${state.junction.id}_${prefix}_${quadrant.quadrantId}_patch`,
          points: geometry.ring.map((point) => ({ ...point })),
        },
      });
    }
  }

  return fused;
}

function seedStructuredCornerQuadrants(state: EditorState, overwrite = false) {
  const composition = getOrCreateComposition(state);
  if (!overwrite && composition.quadrants.length > 0) {
    return;
  }
  composition.quadrants = buildQuadrantsFromFusedCornerStripsTs(buildStructuredFusedCornerStrips(state), 1);
  const quadrantContexts = buildStructuredQuadrantContexts(state);
  for (const quadrant of composition.quadrants) {
    const match = quadrantContexts.find((item) => item.quadrantId === quadrant.quadrantId);
    if (!match) {
      continue;
    }
    quadrant.armAId = resolvedRoadId(match.armA);
    quadrant.armBId = resolvedRoadId(match.armB);
  }
  sortQuadrants(composition);
}

function syncStructuredLaneSurfaces(state: EditorState) {
  const composition = getOrCreateComposition(state);
  const laneBindings = buildStructuredLaneBindings(state);
  const existingLaneSurfaces = new Map((composition.laneSurfaces ?? []).map((surface) => [surface.surfaceId, surface] as const));
  const nextLaneSurfaces: JunctionLaneSurface[] = [];

  for (const binding of laneBindings) {
    const seed = buildLaneSurfaceSeed(binding);
    const existing = existingLaneSurfaces.get(seed.surfaceId);
    if (!existing || existing.provenance === "generated") {
      nextLaneSurfaces.push(buildDefaultLaneSurface(seed));
      continue;
    }
    const nextSurface = cloneLaneSurfaceDeep(existing);
    nextSurface.surfaceId = seed.surfaceId;
    nextSurface.laneId = seed.laneId;
    nextSurface.armKey = seed.armKey;
    nextSurface.flow = seed.flow;
    nextSurface.laneIndex = seed.laneIndex;
    nextSurface.laneWidthM = seed.laneWidthM;
    nextSurface.skeletonId = seed.skeletonId;
    nextLaneSurfaces.push(nextSurface);
  }

  nextLaneSurfaces.sort((left, right) => {
    const armDelta = ARM_ORDER.indexOf(left.armKey) - ARM_ORDER.indexOf(right.armKey);
    if (armDelta !== 0) {
      return armDelta;
    }
    if (left.flow !== right.flow) {
      return left.flow === "inbound" ? -1 : 1;
    }
    return left.laneIndex - right.laneIndex;
  });

  composition.laneSurfaces = nextLaneSurfaces;
  composition.mergedSurfaces = (composition.mergedSurfaces ?? []).map((surface) => cloneLaneSurfaceDeep(surface));
  pruneSurfaceSelection(state, composition);
}

function pruneSurfaceSelection(state: EditorState, composition: JunctionComposition) {
  const validIds = new Set([
    ...(composition.laneSurfaces ?? []).map((surface) => surface.surfaceId),
    ...(composition.mergedSurfaces ?? []).map((surface) => surface.surfaceId),
  ]);
  if (state.selectedSurface && !validIds.has(state.selectedSurface.surfaceId)) {
    state.selectedSurface = null;
    state.selectedSurfaceNodeId = null;
    state.selectedSurfaceEdgeId = null;
    state.selectedSurfaceNodePoint = null;
  }
  state.surfaceMergeSelection = state.surfaceMergeSelection.filter((surfaceId) => validIds.has(surfaceId));
}

function resetGeneratedLaneSurfaces(state: EditorState) {
  const composition = getOrCreateComposition(state);
  const laneBindings = buildStructuredLaneBindings(state);
  composition.laneSurfaces = laneBindings.map((lane) => buildDefaultLaneSurface(buildLaneSurfaceSeed(lane)));
  state.selectedSurfaceNodeId = null;
  state.selectedSurfaceEdgeId = null;
  state.selectedSurfaceNodePoint = null;
  pruneSurfaceSelection(state, composition);
}

function findSurfaceBySelection(
  state: EditorState,
  kind: SurfaceSelectionKind,
  surfaceId: string,
): JunctionLaneSurface | JunctionMergedSurface | null {
  const composition = getOrCreateComposition(state);
  if (kind === "lane") {
    return (composition.laneSurfaces ?? []).find((surface) => surface.surfaceId === surfaceId) ?? null;
  }
  return (composition.mergedSurfaces ?? []).find((surface) => surface.surfaceId === surfaceId) ?? null;
}

function setSelectedSurface(state: EditorState, selection: SurfaceSelection) {
  state.selectedSurface = selection;
  state.selectedSurfaceNodeId = null;
  state.selectedSurfaceEdgeId = null;
  state.selectedSurfaceNodePoint = null;
  state.mergeStatusMessage = null;
}

function setSelectionMode(state: EditorState, mode: SelectionMode) {
  state.selectionMode = mode;
  state.drawingSkeleton = null;
  state.mergeStatusMessage = null;
  if (state.selectedTool === "draw-skeleton" || state.selectedTool === "draw-patch") {
    state.selectedTool = "select";
  }
  if (mode === "single") {
    if (state.selectedSurface) {
      state.surfaceMergeSelection = [state.selectedSurface.surfaceId];
      return;
    }
    if (state.surfaceMergeSelection.length > 0) {
      state.surfaceMergeSelection = [state.surfaceMergeSelection[0]];
    }
  }
}

function focusSurfaceSelection(
  state: EditorState,
  selection: Exclude<SurfaceSelection, null>,
  options: { mode?: "single" | "toggle" | "ensure" } = {},
) {
  setSelectedSurface(state, selection);
  if (options.mode === "ensure") {
    const next = new Set(state.surfaceMergeSelection);
    next.add(selection.surfaceId);
    state.surfaceMergeSelection = [...next];
    return;
  }
  if (options.mode === "toggle") {
    const next = new Set(state.surfaceMergeSelection);
    if (next.has(selection.surfaceId)) {
      next.delete(selection.surfaceId);
    } else {
      next.add(selection.surfaceId);
    }
    state.surfaceMergeSelection = [...next];
    return;
  }
  state.surfaceMergeSelection = [selection.surfaceId];
}

function inferSelectionMode(
  state: EditorState,
  event: Pick<MouseEvent, "shiftKey" | "metaKey" | "ctrlKey">,
  multiSelectMode: "toggle" | "ensure",
): { mode: "single" | "toggle" | "ensure" } {
  const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
  if (state.selectionMode === "multi" || hasModifier) {
    return { mode: multiSelectMode };
  }
  return { mode: "single" };
}

function toggleSurfaceMergeSelection(state: EditorState, surfaceId: string, checked: boolean) {
  state.mergeStatusMessage = null;
  if (state.selectionMode === "single") {
    state.surfaceMergeSelection = checked ? [surfaceId] : [];
    return;
  }
  const next = new Set(state.surfaceMergeSelection);
  if (checked) {
    next.add(surfaceId);
  } else {
    next.delete(surfaceId);
  }
  state.surfaceMergeSelection = [...next];
}

function markSurfaceEdited(surface: JunctionLaneSurface | JunctionMergedSurface) {
  surface.provenance = surface.provenance === "merged" ? "merged" : "manual";
}

function collectMergeCandidateSurfaces(
  state: EditorState,
): Array<JunctionLaneSurface | JunctionMergedSurface> {
  const composition = getOrCreateComposition(state);
  const surfaceById = new Map<string, JunctionLaneSurface | JunctionMergedSurface>();
  for (const surface of composition.laneSurfaces ?? []) {
    surfaceById.set(surface.surfaceId, surface);
  }
  for (const surface of composition.mergedSurfaces ?? []) {
    surfaceById.set(surface.surfaceId, surface);
  }
  return state.surfaceMergeSelection
    .map((surfaceId) => surfaceById.get(surfaceId) ?? null)
    .filter((surface): surface is JunctionLaneSurface | JunctionMergedSurface => surface !== null);
}

function getActiveMergePreview(state: EditorState): SurfaceMergePreview | null {
  const selectedSurfaces = collectMergeCandidateSurfaces(state);
  if (selectedSurfaces.length !== 2) {
    return null;
  }
  return buildMergedSurfacePreview(selectedSurfaces);
}

function describeMergeState(state: EditorState, preview: SurfaceMergePreview | null): string {
  if (state.mergeStatusMessage) {
    return state.mergeStatusMessage;
  }
  if (state.surfaceMergeSelection.length === 2) {
    return preview
      ? "Nearest-node merge preview active."
      : "Merge preview unavailable; adjust nodes and try again.";
  }
  return "Merge works with exactly 2 surfaces at a time.";
}

function insertSurfaceNodeAtHit(state: EditorState, hit: Extract<SurfaceHit, { kind: "edge" }>, point: AnnotationPoint) {
  const surface = findSurfaceBySelection(state, hit.surfaceKind, hit.surfaceId);
  if (!surface) {
    return;
  }
  const inserted = insertSurfaceNode(surface, hit.edgeIndex, point);
  if (!inserted) {
    return;
  }
  markSurfaceEdited(surface);
  state.selectedSurfaceNodeId = surface.nodes[(hit.edgeIndex + 1) % surface.nodes.length]?.nodeId ?? null;
  state.selectedSurfaceNodePoint = state.selectedSurfaceNodeId
    ? { ...(surface.nodes.find((node) => node.nodeId === state.selectedSurfaceNodeId)?.point ?? point) }
    : null;
  state.selectedSurfaceEdgeId = null;
}

function toggleSelectedSurfaceEdge(state: EditorState) {
  if (!state.selectedSurface || !state.selectedSurfaceEdgeId) {
    return;
  }
  const surface = findSurfaceBySelection(state, state.selectedSurface.kind, state.selectedSurface.surfaceId);
  if (!surface) {
    return;
  }
  if (toggleSurfaceEdgeKind(surface, state.selectedSurfaceEdgeId)) {
    markSurfaceEdited(surface);
  }
}

function deleteSelectedSurfaceNode(state: EditorState) {
  if (!state.selectedSurface || !state.selectedSurfaceNodeId) {
    return;
  }
  const surface = findSurfaceBySelection(state, state.selectedSurface.kind, state.selectedSurface.surfaceId);
  if (!surface) {
    return;
  }
  if (deleteSurfaceNode(surface, state.selectedSurfaceNodeId)) {
    markSurfaceEdited(surface);
    state.selectedSurfaceNodeId = null;
    state.selectedSurfaceNodePoint = null;
  }
}

function insertSelectedSurfaceNode(state: EditorState) {
  if (!state.selectedSurface) {
    return;
  }
  const surface = findSurfaceBySelection(state, state.selectedSurface.kind, state.selectedSurface.surfaceId);
  if (!surface || surface.edges.length === 0) {
    return;
  }
  const edgeId = state.selectedSurfaceEdgeId ?? surface.edges[0]?.edgeId ?? "";
  const edgeIndex = surface.edges.findIndex((edge) => edge.edgeId === edgeId);
  if (edgeIndex < 0) {
    return;
  }
  const point = pointOnBezier(surface.edges[edgeIndex].curve, 0.5);
  if (!insertSurfaceNode(surface, edgeIndex, point)) {
    return;
  }
  markSurfaceEdited(surface);
  state.selectedSurfaceNodeId = surface.nodes[(edgeIndex + 1) % surface.nodes.length]?.nodeId ?? null;
  state.selectedSurfaceNodePoint = state.selectedSurfaceNodeId
    ? { ...(surface.nodes.find((node) => node.nodeId === state.selectedSurfaceNodeId)?.point ?? point) }
    : null;
}

function mergeSelectedSurfaces(state: EditorState) {
  const composition = getOrCreateComposition(state);
  const selectedIds = state.surfaceMergeSelection;
  if (selectedIds.length !== 2) {
    state.mergeStatusMessage = "Merge requires exactly 2 selected surfaces.";
    return;
  }

  const selectedSurfaces: Array<JunctionLaneSurface | JunctionMergedSurface> = [];
  for (const surfaceId of selectedIds) {
    const laneSurface = (composition.laneSurfaces ?? []).find((surface) => surface.surfaceId === surfaceId);
    if (laneSurface) {
      selectedSurfaces.push(laneSurface);
      continue;
    }
    const mergedSurface = (composition.mergedSurfaces ?? []).find((surface) => surface.surfaceId === surfaceId);
    if (mergedSurface) {
      selectedSurfaces.push(mergedSurface);
    }
  }

  if (selectedSurfaces.length !== 2) {
    state.mergeStatusMessage = "Merge candidates are incomplete. Re-select two surfaces and try again.";
    return;
  }

  const nextSurfaceId = `turn_surface_${String((composition.mergedSurfaces ?? []).length + 1).padStart(2, "0")}`;
  const merged = mergeLaneSurfaces(nextSurfaceId, selectedSurfaces);
  if (!merged) {
    state.mergeStatusMessage = "Merge preview did not produce a single connected surface. Move nodes closer and try again.";
    return;
  }
  composition.mergedSurfaces = [...(composition.mergedSurfaces ?? []), merged];
  setSelectedSurface(state, { kind: "merged", surfaceId: merged.surfaceId });
  state.surfaceMergeSelection = [merged.surfaceId];
  state.mergeStatusMessage = null;
}

function collectSurfaceEntriesForHitTest(
  composition: JunctionComposition,
  selectedSurface: SurfaceSelection,
): Array<{ kind: SurfaceSelectionKind; surface: JunctionLaneSurface | JunctionMergedSurface }> {
  const laneSurfaces = composition.laneSurfaces ?? [];
  const mergedSurfaces = composition.mergedSurfaces ?? [];
  const selectedKind = selectedSurface?.kind;
  const selectedId = selectedSurface?.surfaceId;
  const selectedEntries: Array<{ kind: SurfaceSelectionKind; surface: JunctionLaneSurface | JunctionMergedSurface }> = [];
  const otherEntries: Array<{ kind: SurfaceSelectionKind; surface: JunctionLaneSurface | JunctionMergedSurface }> = [];

  for (const surface of laneSurfaces) {
    const entry = { kind: "lane" as const, surface };
    if (selectedKind === "lane" && selectedId === surface.surfaceId) {
      selectedEntries.push(entry);
    } else {
      otherEntries.push(entry);
    }
  }
  for (const surface of mergedSurfaces) {
    const entry = { kind: "merged" as const, surface };
    if (selectedKind === "merged" && selectedId === surface.surfaceId) {
      selectedEntries.push(entry);
    } else {
      otherEntries.push(entry);
    }
  }

  return [...selectedEntries, ...otherEntries];
}

function hitTestSurfaceInteractable(point: AnnotationPoint, state: EditorState): SurfaceHit | null {
  const composition = getPrimaryComposition(state);
  if (!composition) {
    return null;
  }

  const surfaceOrder = collectSurfaceEntriesForHitTest(composition, state.selectedSurface);

  const nodeThreshold = screenToWorldSize(state, 8);
  const edgeThreshold = screenToWorldSize(state, 6);
  let best: SurfaceHit | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of surfaceOrder) {
    const { surface, kind } = entry;
    const boundaryDistance = surfaceBoundaryDistance(point, surface);
    for (let nodeIndex = 0; nodeIndex < surface.nodes.length; nodeIndex += 1) {
      const node = surface.nodes[nodeIndex];
      const distance = Math.hypot(point.x - node.point.x, point.y - node.point.y);
      if (distance <= nodeThreshold && distance < bestDistance) {
        best = {
          kind: "node",
          surfaceKind: kind,
          surfaceId: surface.surfaceId,
          nodeId: node.nodeId,
          nodeIndex,
          point: { ...node.point },
        };
        bestDistance = distance;
      }
    }

    for (let edgeIndex = 0; edgeIndex < surface.edges.length; edgeIndex += 1) {
      const edge = surface.edges[edgeIndex];
      const handlePoint = pointOnBezier(edge.curve, 0.5);
      const distance = Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y);
      if (boundaryDistance <= edgeThreshold && distance < bestDistance) {
        best = {
          kind: "edge",
          surfaceKind: kind,
          surfaceId: surface.surfaceId,
          edgeId: edge.edgeId,
          edgeIndex,
          point: handlePoint,
        };
        bestDistance = distance;
      }
      if (state.selectedSurface?.kind === kind && state.selectedSurface.surfaceId === surface.surfaceId && edge.kind === "bezier") {
        const controlThreshold = screenToWorldSize(state, 6);
        const controls: Array<{ key: "control1" | "control2"; point: AnnotationPoint }> = [
          { key: "control1", point: edge.curve.control1 },
          { key: "control2", point: edge.curve.control2 },
        ];
        for (const control of controls) {
          const distanceToControl = Math.hypot(point.x - control.point.x, point.y - control.point.y);
          if (distanceToControl <= controlThreshold && distanceToControl < bestDistance) {
            best = {
              kind: "control",
              surfaceKind: kind,
              surfaceId: surface.surfaceId,
              edgeId: edge.edgeId,
              edgeIndex,
              control: control.key,
              point: { ...control.point },
            };
            bestDistance = distanceToControl;
          }
        }
      }
    }

    if (pointInSurface(point, surface) && best === null) {
      best = {
        kind: "surface",
        surfaceKind: kind,
        surfaceId: surface.surfaceId,
      };
    }
  }

  return best;
}

function moveSurfaceControl(
  surface: JunctionLaneSurface | JunctionMergedSurface,
  edgeId: string,
  control: "control1" | "control2",
  point: AnnotationPoint,
) {
  const edge = surface.edges.find((item) => item.edgeId === edgeId);
  if (!edge) {
    return;
  }
  if (edge.kind === "line") {
    toggleSurfaceEdgeKind(surface, edgeId);
  }
  const nextEdge = surface.edges.find((item) => item.edgeId === edgeId);
  if (!nextEdge) {
    return;
  }
  nextEdge.kind = "bezier";
  nextEdge.curve[control] = { ...point };
}

function renderCanvas(container: ParentNode, state: EditorState) {
  const canvas = container.querySelector<HTMLCanvasElement>("#je-canvas");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const rect = canvas.parentElement?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width * 0.5 + state.pan.x, canvas.height * 0.5 + state.pan.y);
  ctx.scale(state.scale, state.scale);

  drawGrid(ctx, canvas.width / state.scale, canvas.height / state.scale);
  drawStructuredJunctionScaffold(ctx, state);
  drawStructuredSideTurnPatches(ctx, state);
  drawLaneSurfaces(ctx, state);
  drawMergePreview(ctx, state);
  drawStructuredCrossSkeleton(ctx, state);
  drawJunctionCenter(ctx, state);

  for (const composition of state.compositions) {
    for (const quadrant of composition.quadrants) {
      drawQuadrant(ctx, state.junction, quadrant.quadrantId);
    }
  }

  for (const composition of state.compositions) {
    for (const quadrant of composition.quadrants) {
      for (const patch of quadrant.patches) {
        if (isAutoStructuredPatch(state, patch.patchId)) {
          continue;
        }
        drawBezierPatch(ctx, patch);
      }
    }
  }

  for (const composition of state.compositions) {
    for (const quadrant of composition.quadrants) {
      for (const skeletonLine of quadrant.skeletonLines) {
        drawManualSkeletonLine(ctx, skeletonLine);
      }
    }
  }

  if (state.drawingSkeleton) {
    drawDraftSkeleton(ctx, state, state.drawingSkeleton);
  }

  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 0.1;

  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;

  for (let x = -halfWidth; x <= halfWidth; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, -halfHeight);
    ctx.lineTo(x, halfHeight);
    ctx.stroke();
  }
  for (let y = -halfHeight; y <= halfHeight; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(-halfWidth, y);
    ctx.lineTo(halfWidth, y);
    ctx.stroke();
  }
}

function drawStructuredJunctionScaffold(ctx: CanvasRenderingContext2D, state: EditorState) {
  const contexts = buildStructuredQuadrantContexts(state);
  if (contexts.length >= 3) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(contexts[0].cornerCenter.x, contexts[0].cornerCenter.y);
    for (let index = 1; index < contexts.length; index += 1) {
      ctx.lineTo(contexts[index].cornerCenter.x, contexts[index].cornerCenter.y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(55, 65, 81, 0.12)";
    ctx.strokeStyle = "rgba(31, 41, 55, 0.42)";
    ctx.lineWidth = screenToWorldSize(state, 1.2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  for (const arm of state.crossSkeleton.arms) {
    const splitCenter = localToWorldPoint(state, getArmSplitLocal(state, arm));
    const normal = armNormal(arm);
    const guideHalfWidth =
      arm.carriagewayWidthM * 0.5 +
      arm.nearroadFurnishingWidthM +
      arm.clearSidewalkWidthM +
      arm.frontageReserveWidthM;
    const splitStart = addPoints(splitCenter, scalePoint(normal, -guideHalfWidth));
    const splitEnd = addPoints(splitCenter, scalePoint(normal, guideHalfWidth));
    ctx.beginPath();
    ctx.moveTo(splitStart.x, splitStart.y);
    ctx.lineTo(splitEnd.x, splitEnd.y);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = screenToWorldSize(state, 1);
    ctx.setLineDash([screenToWorldSize(state, 4), screenToWorldSize(state, 4)]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(splitCenter.x, splitCenter.y, screenToWorldSize(state, 4), 0, Math.PI * 2);
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#64748b";
    ctx.fill();
    ctx.stroke();
  }

  for (const context of contexts) {
    ctx.beginPath();
    ctx.arc(context.cornerCenter.x, context.cornerCenter.y, screenToWorldSize(state, 5), 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = screenToWorldSize(state, 1.2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawStructuredSideTurnPatches(ctx: CanvasRenderingContext2D, state: EditorState) {
  const stripColor: Record<string, { fill: string; stroke: string }> = {
    nearroad_furnishing: { fill: "rgba(196, 168, 130, 0.26)", stroke: "#8b6f4e" },
    clear_sidewalk: { fill: "rgba(232, 213, 181, 0.32)", stroke: "#d4b080" },
    frontage_reserve: { fill: "rgba(168, 196, 212, 0.26)", stroke: "#6b8fa3" },
  };
  for (const strip of buildStructuredFusedCornerStrips(state)) {
    const points = strip.patch.points;
    if (points.length < 3) {
      continue;
    }
    const colors = stripColor[strip.stripKind] ?? { fill: "rgba(148, 163, 184, 0.18)", stroke: "#64748b" };
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.closePath();
    ctx.fillStyle = colors.fill;
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = screenToWorldSize(state, 1);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function isAutoStructuredPatch(state: EditorState, patchId: string): boolean {
  return patchId.startsWith(`${state.junction.id}_`) && patchId.endsWith("_patch");
}

function drawLaneSurfaces(ctx: CanvasRenderingContext2D, state: EditorState) {
  const composition = getOrCreateComposition(state);
  const laneSurfaces = composition.laneSurfaces ?? [];
  const mergedSurfaces = composition.mergedSurfaces ?? [];
  const showGeneratedLaneSurfaces =
    state.selectedTool === "surface-edit" ||
    state.selectedSurface !== null ||
    state.surfaceMergeSelection.length > 0;

  for (const surface of laneSurfaces) {
    if (!showGeneratedLaneSurfaces && surface.provenance === "generated") {
      continue;
    }
    drawLaneSurface(ctx, state, surface, "lane");
  }
  for (const surface of mergedSurfaces) {
    drawLaneSurface(ctx, state, surface, "merged");
  }
}

function drawLaneSurface(
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  surface: JunctionLaneSurface | JunctionMergedSurface,
  kind: SurfaceSelectionKind,
) {
  if (surface.nodes.length === 0 || surface.edges.length === 0) {
    return;
  }

  const isMerged = kind === "merged";
  const flow = "flow" in surface ? surface.flow : "inbound";
  const label = "laneId" in surface ? surface.laneId : surface.surfaceId;
  const isSelected = state.selectedSurface?.kind === kind && state.selectedSurface.surfaceId === surface.surfaceId;
  const isMergeCandidate = state.surfaceMergeSelection.includes(surface.surfaceId);
  const baseFill = isMerged ? "rgba(168, 85, 247, 0.18)" : flow === "inbound" ? "rgba(37, 99, 235, 0.16)" : "rgba(220, 38, 38, 0.16)";
  const candidateFill = isMerged ? "rgba(168, 85, 247, 0.24)" : flow === "inbound" ? "rgba(37, 99, 235, 0.24)" : "rgba(220, 38, 38, 0.24)";
  const baseStroke = isMerged ? "#7c3aed" : flow === "inbound" ? "#1d4ed8" : "#b91c1c";
  const candidateStroke = isMerged ? "#6d28d9" : flow === "inbound" ? "#f59e0b" : "#d97706";
  const selectedStroke = "#111827";
  const centroid = surfaceCentroid(surface);

  ctx.save();
  ctx.fillStyle = isSelected || !isMergeCandidate ? baseFill : candidateFill;
  ctx.strokeStyle = isSelected ? selectedStroke : isMergeCandidate ? candidateStroke : baseStroke;
  ctx.lineWidth = isSelected ? 0.35 : 0.18;
  ctx.setLineDash(isSelected ? [] : isMergeCandidate ? [0.15, 0.15] : [0.25, 0.25]);

  const path = new Path2D(surfacePathD(surface));
  ctx.fill(path);
  ctx.stroke(path);
  ctx.setLineDash([]);

  if (isMergeCandidate) {
    drawMergeCandidateNodeBuffers(ctx, state, surface, isSelected);
  }

  ctx.fillStyle = "#111827";
  applyAnnotationTextStyle(ctx, state, 10);
  ctx.fillText(label, centroid.x + screenToWorldSize(state, 8), centroid.y + screenToWorldSize(state, 4));

  if (isSelected && state.selectedTool === "surface-edit") {
    drawSurfaceHandles(ctx, state, surface, kind);
  }

  ctx.restore();
}

function drawMergeCandidateNodeBuffers(
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  surface: JunctionLaneSurface | JunctionMergedSurface,
  isSelected: boolean,
) {
  const bufferRadius = screenToWorldSize(state, isSelected ? 5 : 4);
  ctx.save();
  ctx.fillStyle = "rgba(245, 158, 11, 0.18)";
  ctx.strokeStyle = isSelected ? "#92400e" : "#f59e0b";
  ctx.lineWidth = screenToWorldSize(state, 1);
  for (const node of surface.nodes) {
    ctx.beginPath();
    ctx.arc(node.point.x, node.point.y, bufferRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawMergePreview(ctx: CanvasRenderingContext2D, state: EditorState) {
  const preview = getActiveMergePreview(state);
  if (!preview) {
    return;
  }

  const connectorRing = preview.connectorRing;
  if (connectorRing.length >= 3) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(connectorRing[0].x, connectorRing[0].y);
    for (let index = 1; index < connectorRing.length; index += 1) {
      ctx.lineTo(connectorRing[index].x, connectorRing[index].y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(245, 158, 11, 0.14)";
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = screenToWorldSize(state, 1.4);
    ctx.setLineDash([screenToWorldSize(state, 3), screenToWorldSize(state, 3)]);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(preview.nearestPair.pointA.x, preview.nearestPair.pointA.y);
  ctx.lineTo(preview.nearestPair.pointB.x, preview.nearestPair.pointB.y);
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = screenToWorldSize(state, 1.2);
  ctx.setLineDash([screenToWorldSize(state, 4), screenToWorldSize(state, 3)]);
  ctx.stroke();
  ctx.setLineDash([]);

  const highlightRadius = screenToWorldSize(state, 6);
  for (const point of [preview.nearestPair.pointA, preview.nearestPair.pointB]) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, highlightRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(245, 158, 11, 0.22)";
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = screenToWorldSize(state, 1.4);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawSurfaceHandles(
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  surface: JunctionLaneSurface | JunctionMergedSurface,
  _kind: SurfaceSelectionKind,
) {
  const selectedNode = state.selectedSurfaceNodeId ?? "";
  const selectedEdge = state.selectedSurfaceEdgeId ?? "";

  for (const node of surface.nodes) {
    const isSelected = node.nodeId === selectedNode;
    const radius = screenToWorldSize(state, isSelected ? 7 : 5);
    ctx.beginPath();
    ctx.fillStyle = isSelected ? "#f59e0b" : "#ffffff";
    ctx.strokeStyle = isSelected ? "#b45309" : "#111827";
    ctx.lineWidth = screenToWorldSize(state, 1.5);
    ctx.arc(node.point.x, node.point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  for (const edge of surface.edges) {
    const mid = pointOnBezier(edge.curve, 0.5);
    const isSelected = edge.edgeId === selectedEdge;
    const size = screenToWorldSize(state, isSelected ? 7 : 5);
    ctx.beginPath();
    ctx.fillStyle = isSelected ? "#10b981" : "#f8fafc";
    ctx.strokeStyle = isSelected ? "#047857" : "#334155";
    ctx.lineWidth = screenToWorldSize(state, 1.2);
    ctx.rect(mid.x - size * 0.5, mid.y - size * 0.5, size, size);
    ctx.fill();
    ctx.stroke();

    if (edge.kind === "bezier" && edge.edgeId === selectedEdge) {
      ctx.beginPath();
      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = screenToWorldSize(state, 0.8);
      ctx.moveTo(edge.curve.start.x, edge.curve.start.y);
      ctx.lineTo(edge.curve.control1.x, edge.curve.control1.y);
      ctx.moveTo(edge.curve.end.x, edge.curve.end.y);
      ctx.lineTo(edge.curve.control2.x, edge.curve.control2.y);
      ctx.stroke();

      for (const control of [edge.curve.control1, edge.curve.control2]) {
        ctx.beginPath();
        ctx.fillStyle = "#e9d5ff";
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = screenToWorldSize(state, 1);
        ctx.arc(control.x, control.y, screenToWorldSize(state, 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

function drawStructuredCrossSkeleton(ctx: CanvasRenderingContext2D, state: EditorState) {
  const laneBindings = buildStructuredLaneBindings(state);

  for (const lane of laneBindings) {
    drawLaneBinding(ctx, state, lane);
  }

  for (const arm of state.crossSkeleton.arms) {
    drawStructuredArm(ctx, state, arm);
  }
}

function drawStructuredArm(ctx: CanvasRenderingContext2D, state: EditorState, arm: StructuredArmConfig) {
  const center = localToWorldPoint(state, state.crossSkeleton.localCenter);
  const end = localToWorldPoint(state, getArmEndpointLocal(arm));
  const label = `${ARM_LABELS[arm.armKey]} · ${resolvedRoadId(arm)} · ${arm.angleDeg.toFixed(0)} deg`;
  const labelOffsetX = screenToWorldSize(state, 12);
  const labelOffsetY = screenToWorldSize(state, arm.armKey === "north" ? -10 : 16);

  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(end.x, end.y, 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111827";
  applyAnnotationTextStyle(ctx, state, 10);
  ctx.fillText(label, end.x + labelOffsetX, end.y + labelOffsetY);
}

function drawLaneBinding(ctx: CanvasRenderingContext2D, state: EditorState, lane: StructuredLaneBinding) {
  const start = localToWorldPoint(state, lane.startLocal);
  const end = localToWorldPoint(state, lane.endLocal);
  const flowVector = lane.flow === "inbound"
    ? subtractPoints(end, start)
    : subtractPoints(start, end);
  const arrowFrom = lane.flow === "inbound" ? start : end;
  const arrowTo = lane.flow === "inbound" ? end : start;

  ctx.strokeStyle = lane.flow === "inbound" ? "#2563eb" : "#dc2626";
  ctx.lineWidth = 0.22;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  drawArrowHead(ctx, arrowFrom, arrowTo, lane.flow === "inbound" ? "#2563eb" : "#dc2626");

  const labelPoint = midpoint(start, end);
  ctx.fillStyle = "#374151";
  applyAnnotationTextStyle(ctx, state, 10);
  ctx.fillText(
    `${lane.flow === "inbound" ? "IN" : "OUT"} ${lane.laneIndex + 1}`,
    labelPoint.x + screenToWorldSize(state, 6),
    labelPoint.y - screenToWorldSize(state, 4),
  );

  if (flowVector.x === 0 && flowVector.y === 0) {
    return;
  }
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: AnnotationPoint,
  to: AnnotationPoint,
  color: string,
) {
  const direction = normalizePoint(subtractPoints(to, from));
  const base = {
    x: to.x - direction.x * 1.4,
    y: to.y - direction.y * 1.4,
  };
  const perp = perpendicular(direction);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(base.x + perp.x * 0.5, base.y + perp.y * 0.5);
  ctx.lineTo(base.x - perp.x * 0.5, base.y - perp.y * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawJunctionCenter(ctx: CanvasRenderingContext2D, state: EditorState) {
  const junction = state.junction;
  ctx.fillStyle = "#3b82f6";
  ctx.beginPath();
  ctx.arc(junction.x, junction.y, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1f2937";
  applyAnnotationTextStyle(ctx, state, 10);
  ctx.fillText(
    `${junction.label || junction.id} (0,0 local)`,
    junction.x + screenToWorldSize(state, 10),
    junction.y - screenToWorldSize(state, 10),
  );
}

function drawQuadrant(ctx: CanvasRenderingContext2D, junction: AnnotatedJunction, quadrantId: string) {
  const angleRange = quadrantAngleRange(quadrantId);

  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 0.18;
  ctx.setLineDash([1, 1]);
  ctx.beginPath();
  ctx.moveTo(junction.x, junction.y);
  ctx.arc(junction.x, junction.y, 14, angleRange.start, angleRange.end);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawManualSkeletonLine(ctx: CanvasRenderingContext2D, skeleton: JunctionQuadrantSkeletonLine) {
  const curve = skeleton.curve;

  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = skeleton.widthM / 10;
  ctx.beginPath();
  ctx.moveTo(curve.start.x, curve.start.y);
  ctx.bezierCurveTo(
    curve.control1.x,
    curve.control1.y,
    curve.control2.x,
    curve.control2.y,
    curve.end.x,
    curve.end.y,
  );
  ctx.stroke();

  ctx.fillStyle = "#ef4444";
  for (const point of [curve.control1, curve.control2]) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#3b82f6";
  for (const point of [curve.start, curve.end]) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBezierPatch(
  ctx: CanvasRenderingContext2D,
  patch: JunctionQuadrantComposition["patches"][number],
) {
  const fillColor =
    patch.stripKind === "clear_sidewalk"
      ? "rgba(232, 213, 181, 0.28)"
      : patch.stripKind === "nearroad_furnishing"
        ? "rgba(196, 168, 130, 0.24)"
        : "rgba(168, 196, 212, 0.22)";
  const strokeColor =
    patch.stripKind === "clear_sidewalk"
      ? "#d4b080"
      : patch.stripKind === "nearroad_furnishing"
        ? "#8b6f4e"
        : "#6b8fa3";

  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  ctx.moveTo(patch.innerCurve.start.x, patch.innerCurve.start.y);
  ctx.bezierCurveTo(
    patch.innerCurve.control1.x,
    patch.innerCurve.control1.y,
    patch.innerCurve.control2.x,
    patch.innerCurve.control2.y,
    patch.innerCurve.end.x,
    patch.innerCurve.end.y,
  );
  ctx.lineTo(patch.outerCurve.end.x, patch.outerCurve.end.y);
  ctx.bezierCurveTo(
    patch.outerCurve.control2.x,
    patch.outerCurve.control2.y,
    patch.outerCurve.control1.x,
    patch.outerCurve.control1.y,
    patch.outerCurve.start.x,
    patch.outerCurve.start.y,
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawDraftSkeleton(
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  draft: NonNullable<EditorState["drawingSkeleton"]>,
) {
  const points = draft.points;

  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 0.3;
  ctx.setLineDash([0.5, 0.5]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#f59e0b";
  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    applyAnnotationTextStyle(ctx, state, 10);
    ctx.fillText(
      `P${index}`,
      point.x + screenToWorldSize(state, 8),
      point.y - screenToWorldSize(state, 8),
    );
    ctx.fillStyle = "#f59e0b";
  });
}

function readCanvasPoint(event: MouseEvent, canvas: HTMLCanvasElement, state: EditorState): AnnotationPoint {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left - canvas.width * 0.5 - state.pan.x) / state.scale;
  const canvasY = (event.clientY - rect.top - canvas.height * 0.5 - state.pan.y) / state.scale;
  return { x: canvasX, y: canvasY };
}

function createEmptyJunction(): AnnotatedJunction {
  return {
    id: `junction_${Date.now()}`,
    label: "New Junction",
    x: 0,
    y: 0,
    kind: "cross_junction",
    connected_centerline_ids: [],
    crosswalk_depth_m: 3.0,
    source_mode: "explicit",
  };
}

function createDefaultCrossSkeleton(): StructuredCrossSkeleton {
  return {
    localCenter: { x: 0, y: 0 },
    arms: ARM_ORDER.map((armKey) => ({
      armKey,
      roadId: `road_${armKey}`,
      angleDeg: DEFAULT_ARM_ANGLES_DEG[armKey],
      lengthM: DEFAULT_ARM_LENGTH_M,
      carriagewayWidthM: DEFAULT_CARRIAGEWAY_WIDTH_M,
      nearroadFurnishingWidthM: NOMINAL_STRIP_WIDTHS.nearroad_furnishing,
      clearSidewalkWidthM: NOMINAL_STRIP_WIDTHS.clear_sidewalk,
      frontageReserveWidthM: NOMINAL_STRIP_WIDTHS.frontage_reserve,
      inboundLaneCount: 2,
      outboundLaneCount: 2,
    })),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function handlePreview3D() {
  alert("3D Preview: Integration with Three.js viewer coming soon!");
}

function handleExportJSON(state: EditorState) {
  const payload = buildTemplatePayload(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.junction.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function handleSaveTemplate(state: EditorState) {
  const payload = buildTemplatePayload(state);

  try {
    const response = await fetch(`${API_BASE}/api/junction-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      alert(`Failed to save template: ${error}`);
      return;
    }

    alert("Template saved successfully!");
  } catch (error) {
    alert(`Failed to save template: ${String(error)}`);
  }
}

function buildTemplatePayload(state: EditorState): StructuredTemplatePayload {
  syncStructuredJunctionBindings(state);
  syncStructuredLaneSurfaces(state);
  seedStructuredCornerQuadrants(state, true);
  syncCompositionMetadata(state);

  const createdAt = new Date().toISOString();
  const pointMap = buildCrossSkeletonPointMap(state.crossSkeleton);
  const laneBindings = buildStructuredLaneBindings(state);
  const quadrantContexts = buildStructuredQuadrantContexts(state);

  return {
    junction: state.junction,
    compositions: state.compositions,
    metadata: {
      created_at: createdAt,
      version: "1.1",
      structured_cross_skeleton: {
        local_center: pointMap.center,
        anchor_world: { x: state.junction.x, y: state.junction.y },
        points_local: pointMap,
        arms: state.crossSkeleton.arms.map((arm) => ({
          arm_key: arm.armKey,
          direction: arm.armKey,
          road_id: resolvedRoadId(arm),
          skeleton_id: skeletonIdForArm(state, arm),
          angle_deg: arm.angleDeg,
          length_m: arm.lengthM,
          carriageway_width_m: arm.carriagewayWidthM,
          nearroad_furnishing_width_m: arm.nearroadFurnishingWidthM,
          clear_sidewalk_width_m: arm.clearSidewalkWidthM,
          frontage_reserve_width_m: arm.frontageReserveWidthM,
          split_local: getArmSplitLocal(state, arm),
          inbound_lane_count: arm.inboundLaneCount,
          outbound_lane_count: arm.outboundLaneCount,
          endpoint_local: pointMap[arm.armKey],
        })),
        quadrant_corners: quadrantContexts.map((context) => ({
          quadrant_id: context.quadrantId,
          arm_a_id: resolvedRoadId(context.armA),
          arm_b_id: resolvedRoadId(context.armB),
          corner_center: context.cornerCenter,
          arm_a_side: context.zoneA,
          arm_b_side: context.zoneB,
        })),
        lane_bindings: laneBindings.map((lane) => ({
          lane_id: lane.laneId,
          road_id: lane.roadId,
          arm_key: lane.armKey,
          direction: lane.direction,
          flow: lane.flow,
          lane_index: lane.laneIndex,
          lane_width_m: lane.laneWidthM,
          skeleton_id: lane.skeletonId,
          offset_m: lane.offsetM,
          start_local: lane.startLocal,
          end_local: lane.endLocal,
        })),
      },
    },
  };
}

function translateJunctionAxis(state: EditorState, axis: "x" | "y", rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return;
  }
  const nextValue = Number.parseFloat(trimmed);
  if (!Number.isFinite(nextValue)) {
    return;
  }

  const delta = nextValue - state.junction[axis];
  if (delta === 0) {
    return;
  }

  state.junction[axis] = nextValue;
  if (axis === "x") {
    translateManualGeometry(state, delta, 0);
  } else {
    translateManualGeometry(state, 0, delta);
  }
}

function translateManualGeometry(state: EditorState, dx: number, dy: number) {
  for (const composition of state.compositions) {
    for (const quadrant of composition.quadrants) {
      for (const skeletonLine of quadrant.skeletonLines) {
        translateBezier(skeletonLine.curve, dx, dy);
      }
      for (const patch of quadrant.patches) {
        translateBezier(patch.innerCurve, dx, dy);
        translateBezier(patch.outerCurve, dx, dy);
      }
    }
    for (const laneSurface of composition.laneSurfaces ?? []) {
      translateSurface(laneSurface, dx, dy);
    }
    for (const mergedSurface of composition.mergedSurfaces ?? []) {
      translateSurface(mergedSurface, dx, dy);
    }
  }

  if (state.drawingSkeleton) {
    state.drawingSkeleton.points = state.drawingSkeleton.points.map((point) => translatePoint(point, dx, dy));
  }
}

function translateBezier(curve: BezierCurve3, dx: number, dy: number) {
  curve.start = translatePoint(curve.start, dx, dy);
  curve.end = translatePoint(curve.end, dx, dy);
  curve.control1 = translatePoint(curve.control1, dx, dy);
  curve.control2 = translatePoint(curve.control2, dx, dy);
}

function translatePoint(point: AnnotationPoint, dx: number, dy: number): AnnotationPoint {
  return { x: point.x + dx, y: point.y + dy };
}

function midpoint(a: AnnotationPoint, b: AnnotationPoint): AnnotationPoint {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

function inferQuadrantIndexFromDraft(points: AnnotationPoint[], junction: AnnotatedJunction): number {
  if (points.length < 4) {
    return inferQuadrantIndexFromPoint(points[0] ?? junction, junction);
  }
  const curve: BezierCurve3 = {
    start: points[0],
    control1: points[1],
    control2: points[2],
    end: points[3],
  };
  return inferQuadrantIndexFromCurve(curve, junction);
}

function inferQuadrantIndexFromCurve(curve: BezierCurve3, junction: AnnotatedJunction): number {
  return inferQuadrantIndexFromPoint(evaluateBezierPoint(curve, 0.5), junction);
}

function inferQuadrantIndexFromPoint(point: AnnotationPoint, junction: AnnotatedJunction): number {
  const dx = point.x - junction.x;
  const dy = point.y - junction.y;

  if (dx >= 0 && dy >= 0) {
    return 0;
  }
  if (dx < 0 && dy >= 0) {
    return 1;
  }
  if (dx < 0 && dy < 0) {
    return 2;
  }
  return 3;
}

function evaluateBezierPoint(curve: BezierCurve3, t: number): AnnotationPoint {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  return {
    x:
      curve.start.x * mt2 * mt +
      3 * curve.control1.x * mt2 * t +
      3 * curve.control2.x * mt * t2 +
      curve.end.x * t2 * t,
    y:
      curve.start.y * mt2 * mt +
      3 * curve.control1.y * mt2 * t +
      3 * curve.control2.y * mt * t2 +
      curve.end.y * t2 * t,
  };
}

function getOrCreateQuadrant(composition: JunctionComposition, quadrantId: string): JunctionQuadrantComposition {
  const existing = composition.quadrants.find((quadrant) => quadrant.quadrantId === quadrantId);
  if (existing) {
    return existing;
  }

  const quadrant: JunctionQuadrantComposition = {
    quadrantId,
    armAId: "",
    armBId: "",
    patches: [],
    skeletonLines: [],
  };
  composition.quadrants.push(quadrant);
  return quadrant;
}

function sortQuadrants(composition: JunctionComposition) {
  composition.quadrants.sort((left, right) => quadrantNumber(left.quadrantId) - quadrantNumber(right.quadrantId));
}

function quadrantNumber(quadrantId: string): number {
  const parsed = Number.parseInt(quadrantId.replace(/^Q/i, ""), 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function quadrantAngleRange(quadrantId: string): { start: number; end: number } {
  switch (quadrantNumber(quadrantId)) {
    case 0:
      return { start: 0, end: Math.PI / 2 };
    case 1:
      return { start: Math.PI / 2, end: Math.PI };
    case 2:
      return { start: Math.PI, end: (Math.PI * 3) / 2 };
    case 3:
      return { start: (Math.PI * 3) / 2, end: Math.PI * 2 };
    default:
      return { start: 0, end: Math.PI / 2 };
  }
}

function updateCursorPosition(canvas: HTMLCanvasElement, point: AnnotationPoint) {
  const cursorElement = canvas.parentElement?.querySelector("#je-cursor-pos");
  if (cursorElement) {
    cursorElement.textContent = `X: ${point.x.toFixed(1)}m, Y: ${point.y.toFixed(1)}m`;
  }
}

function applyAnnotationTextStyle(ctx: CanvasRenderingContext2D, state: EditorState, sizePx = 10) {
  const safeScale = Math.max(state.scale, 0.001);
  ctx.font = `${(sizePx / safeScale).toFixed(3)}px sans-serif`;
}

function screenToWorldSize(state: EditorState, pixels: number): number {
  return pixels / Math.max(state.scale, 0.001);
}

function handleWidthInput(state: EditorState, input: HTMLInputElement) {
  const rawValue = input.value.trim();
  if (!rawValue) {
    return;
  }

  const parsedValue = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return;
  }

  const skeletonLine = findSkeletonLine(
    state,
    input.dataset.quadrant ?? "",
    Number.parseInt(input.dataset.index ?? "", 10),
  );
  if (!skeletonLine) {
    return;
  }

  skeletonLine.widthM = Math.max(MIN_SKELETON_WIDTH_M, parsedValue);
}

function handleArmInput(state: EditorState, input: HTMLInputElement) {
  const armKey = input.dataset.armKey as ArmKey | undefined;
  const field = input.dataset.armField;
  if (!armKey || !field) {
    return;
  }

  const arm = state.crossSkeleton.arms.find((entry) => entry.armKey === armKey);
  if (!arm) {
    return;
  }

  if (field === "roadId") {
    arm.roadId = input.value.trim() || `road_${arm.armKey}`;
    return;
  }

  const parsedValue = Number.parseFloat(input.value);
  if (!Number.isFinite(parsedValue)) {
    return;
  }

  if (field === "lengthM") {
    arm.lengthM = Math.max(MIN_ARM_LENGTH_M, parsedValue);
    return;
  }
  if (field === "angleDeg") {
    arm.angleDeg = parsedValue;
    return;
  }
  if (field === "carriagewayWidthM") {
    arm.carriagewayWidthM = Math.max(1, parsedValue);
    return;
  }
  if (field === "nearroadFurnishingWidthM") {
    arm.nearroadFurnishingWidthM = Math.max(MIN_STRIP_WIDTH_M, parsedValue);
    return;
  }
  if (field === "clearSidewalkWidthM") {
    arm.clearSidewalkWidthM = Math.max(MIN_STRIP_WIDTH_M, parsedValue);
    return;
  }
  if (field === "frontageReserveWidthM") {
    arm.frontageReserveWidthM = Math.max(MIN_STRIP_WIDTH_M, parsedValue);
    return;
  }

  const laneCount = clampLaneCount(parsedValue);
  if (field === "inboundLaneCount") {
    arm.inboundLaneCount = laneCount;
  } else if (field === "outboundLaneCount") {
    arm.outboundLaneCount = laneCount;
  }
}

function findSkeletonLine(
  state: EditorState,
  quadrantId: string,
  index: number,
): JunctionQuadrantSkeletonLine | null {
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }

  for (const composition of state.compositions) {
    const quadrant = composition.quadrants.find((entry) => entry.quadrantId === quadrantId);
    if (!quadrant) {
      continue;
    }
    return quadrant.skeletonLines[index] ?? null;
  }

  return null;
}

function syncStructuredJunctionBindings(state: EditorState) {
  state.junction.connected_centerline_ids = state.crossSkeleton.arms.map((arm) => resolvedRoadId(arm));
}

function syncCompositionMetadata(state: EditorState) {
  const normalizedKind = normalizeJunctionCompositionKind(state.junction.kind);
  for (const composition of state.compositions) {
    composition.junctionId = state.junction.id;
    composition.kind = normalizedKind;
    sortQuadrants(composition);
  }
}

function normalizeJunctionCompositionKind(kind: string): JunctionComposition["kind"] {
  if (kind === "cross_junction" || kind === "t_junction") {
    return kind;
  }
  return "complex_junction";
}

function clampLaneCount(value: number): number {
  return Math.max(MIN_LANE_COUNT, Math.min(MAX_LANE_COUNT, Math.round(value)));
}

function buildCrossSkeletonPointMap(
  crossSkeleton: StructuredCrossSkeleton,
): Record<"center" | ArmKey, AnnotationPoint> {
  return {
    center: { x: 0, y: 0 },
    north: getArmEndpointLocal(crossSkeleton.arms.find((arm) => arm.armKey === "north") ?? fallbackArm("north")),
    east: getArmEndpointLocal(crossSkeleton.arms.find((arm) => arm.armKey === "east") ?? fallbackArm("east")),
    south: getArmEndpointLocal(crossSkeleton.arms.find((arm) => arm.armKey === "south") ?? fallbackArm("south")),
    west: getArmEndpointLocal(crossSkeleton.arms.find((arm) => arm.armKey === "west") ?? fallbackArm("west")),
  };
}

function fallbackArm(armKey: ArmKey): StructuredArmConfig {
  return {
    armKey,
    roadId: `road_${armKey}`,
    angleDeg: DEFAULT_ARM_ANGLES_DEG[armKey],
    lengthM: DEFAULT_ARM_LENGTH_M,
    carriagewayWidthM: DEFAULT_CARRIAGEWAY_WIDTH_M,
    nearroadFurnishingWidthM: NOMINAL_STRIP_WIDTHS.nearroad_furnishing,
    clearSidewalkWidthM: NOMINAL_STRIP_WIDTHS.clear_sidewalk,
    frontageReserveWidthM: NOMINAL_STRIP_WIDTHS.frontage_reserve,
    inboundLaneCount: 0,
    outboundLaneCount: 0,
  };
}

function getArmEndpointLocal(arm: StructuredArmConfig): AnnotationPoint {
  const vector = armAxis(arm);
  return {
    x: vector.x * arm.lengthM,
    y: vector.y * arm.lengthM,
  };
}

function buildStructuredLaneBindings(state: EditorState): StructuredLaneBinding[] {
  const bindings: StructuredLaneBinding[] = [];

  for (const arm of state.crossSkeleton.arms) {
    const skeletonId = skeletonIdForArm(state, arm);
    bindings.push(...buildStructuredFlowBindings(state, arm, skeletonId, "inbound"));
    bindings.push(...buildStructuredFlowBindings(state, arm, skeletonId, "outbound"));
  }

  return bindings;
}

function buildStructuredFlowBindings(
  state: EditorState,
  arm: StructuredArmConfig,
  skeletonId: string,
  flow: LaneFlow,
): StructuredLaneBinding[] {
  const count = flow === "inbound" ? arm.inboundLaneCount : arm.outboundLaneCount;
  if (count <= 0) {
    return [];
  }

  const axis = armAxis(arm);
  const side = perpendicular(axis);
  const roadId = resolvedRoadId(arm);
  const endpointLocal = getArmEndpointLocal(arm);
  const centerStopLocal = getArmSplitLocal(state, arm);
  const flowSideSign = flow === "inbound" ? -1 : 1;

  return Array.from({ length: count }, (_, laneIndex) => {
    const offsetM = flowSideSign * (LANE_GROUP_GAP_M + (laneIndex + 0.5) * DEFAULT_LANE_WIDTH_M);
    const offsetVector = {
      x: side.x * offsetM,
      y: side.y * offsetM,
    };

    const startLocal = addPoints(endpointLocal, offsetVector);
    const endLocal = addPoints(centerStopLocal, offsetVector);

    return {
      laneId: `${roadId}_${flow}_${laneIndex + 1}`,
      armKey: arm.armKey,
      direction: arm.armKey,
      roadId,
      flow,
      laneIndex,
      laneWidthM: DEFAULT_LANE_WIDTH_M,
      skeletonId,
      offsetM,
      startLocal,
      endLocal,
    };
  });
}

function localToWorldPoint(state: EditorState, localPoint: AnnotationPoint): AnnotationPoint {
  return {
    x: state.junction.x + localPoint.x,
    y: state.junction.y + localPoint.y,
  };
}

function resolvedRoadId(arm: StructuredArmConfig): string {
  return arm.roadId.trim() || `road_${arm.armKey}`;
}

function skeletonIdForArm(state: EditorState, arm: StructuredArmConfig): string {
  return `skel_${state.junction.id}_${arm.armKey}`;
}

function addPoints(a: AnnotationPoint, b: AnnotationPoint): AnnotationPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scalePoint(point: AnnotationPoint, factor: number): AnnotationPoint {
  return { x: point.x * factor, y: point.y * factor };
}

function subtractPoints(a: AnnotationPoint, b: AnnotationPoint): AnnotationPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

function lineIntersection(
  pointA: AnnotationPoint,
  directionA: AnnotationPoint,
  pointB: AnnotationPoint,
  directionB: AnnotationPoint,
): AnnotationPoint | null {
  const determinant = directionA.x * directionB.y - directionA.y * directionB.x;
  if (Math.abs(determinant) <= 1e-6) {
    return null;
  }
  const delta = subtractPoints(pointB, pointA);
  const t = (delta.x * directionB.y - delta.y * directionB.x) / determinant;
  return {
    x: pointA.x + directionA.x * t,
    y: pointA.y + directionA.y * t,
  };
}

function normalizePoint(point: AnnotationPoint): AnnotationPoint {
  const length = Math.hypot(point.x, point.y);
  if (length <= 1e-6) {
    return { x: 1, y: 0 };
  }
  return { x: point.x / length, y: point.y / length };
}

function perpendicular(point: AnnotationPoint): AnnotationPoint {
  return { x: -point.y, y: point.x };
}
