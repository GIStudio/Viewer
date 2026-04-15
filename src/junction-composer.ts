import type {
  AnnotationPoint,
  ReferenceAnnotation,
  AnnotatedJunction,
  DerivedJunctionOverlay,
  DerivedJunctionOverlayArm,
  JunctionOverlayCornerKernel,
  JunctionComposition,
  JunctionQuadrantComposition,
  JunctionQuadrantBezierPatch,
  JunctionQuadrantSkeletonLine,
  BezierCurve3,
  StripKind,
} from "./sg-types";
import { clonePoint, pointDistance } from "./sg-utils";
import {
  arcToBezier,
  bezierPathD,
  cloneBezier,
  sampleBezierPoints,
  pointOnBezier,
  evaluateBezierTangent,
} from "./sg-geometry";

export type JunctionComposerDeps = {
  root: HTMLElement;
  annotation: ReferenceAnnotation;
  junction: AnnotatedJunction;
  overlay: DerivedJunctionOverlay;
  imageUrl: string;
  onSave: (composition: JunctionComposition) => void;
  onCancel: () => void;
};

type DragTarget =
  | { kind: "start"; quadrantIndex: number; stripKind: StripKind; curveType: "inner" | "outer" }
  | { kind: "end"; quadrantIndex: number; stripKind: StripKind; curveType: "inner" | "outer" }
  | { kind: "control1"; quadrantIndex: number; stripKind: StripKind; curveType: "inner" | "outer" }
  | { kind: "control2"; quadrantIndex: number; stripKind: StripKind; curveType: "inner" | "outer" }
  | { kind: "skeletonStart"; quadrantIndex: number; stripKind: StripKind }
  | { kind: "skeletonEnd"; quadrantIndex: number; stripKind: StripKind }
  | { kind: "skeletonControl1"; quadrantIndex: number; stripKind: StripKind }
  | { kind: "skeletonControl2"; quadrantIndex: number; stripKind: StripKind }
  | null;

const CORNER_STRIP_KINDS: StripKind[] = ["clear_sidewalk", "nearroad_furnishing", "frontage_reserve"];

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripKindLabel(kind: StripKind): string {
  switch (kind) {
    case "clear_sidewalk":
      return "Sidewalk";
    case "nearroad_furnishing":
      return "Nearroad";
    case "frontage_reserve":
      return "Frontage";
    default:
      return kind;
  }
}

function stripKindColor(kind: StripKind): string {
  switch (kind) {
    case "clear_sidewalk":
      return "#e8d5b5";
    case "nearroad_furnishing":
      return "#c4a882";
    case "frontage_reserve":
      return "#a8c4d4";
    default:
      return "#cccccc";
  }
}

function stripKindStroke(kind: StripKind): string {
  switch (kind) {
    case "clear_sidewalk":
      return "#d4b080";
    case "nearroad_furnishing":
      return "#8b6f4e";
    case "frontage_reserve":
      return "#6b8fa3";
    default:
      return "#888888";
  }
}

// ------------------------------------------------------------------
// Default composition generation from overlay
// ------------------------------------------------------------------

function findArmForCenterline(overlay: DerivedJunctionOverlay, centerlineId: string): DerivedJunctionOverlayArm | null {
  // Arms are not directly in DerivedJunctionOverlay, but we can reconstruct from connectorCenterLines or cornerStripLinks
  // However, for the composer we need the arm geometries. We'll pass them in via a hidden data attribute or compute them from the overlay.
  // Actually, overlay doesn't contain arms directly in the current type. We need to compute them from the scene-graph.
  // For now, we'll derive approximate arms from the overlay's approachBoundaries and anchor.
  return null;
}

function kernelToDefaultBezier(kernel: JunctionOverlayCornerKernel | undefined, offsetPx: number): BezierCurve3 | null {
  if (!kernel || kernel.kernelKind !== "circular_arc" || kernel.clockwise === null) {
    return null;
  }
  const center = kernel.center;
  const radius = Math.max(kernel.radiusPx + offsetPx, 0.1);
  const startRad = (kernel.startHeadingDeg - 90) * (Math.PI / 180);
  const endRad = (kernel.endHeadingDeg + 90) * (Math.PI / 180);
  // The heading in kernel is tangent direction. Radius direction is heading + 90 (or -90 depending on clockwise).
  // Let's use the kernel.points as start/end to avoid ambiguity.
  const start = kernel.points[0] ?? center;
  const end = kernel.points[kernel.points.length - 1] ?? center;

  // Determine actual angles from center to start/end
  const startAngleRad = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngleRad = Math.atan2(end.y - center.y, end.x - center.x);

  return arcToBezier(center, radius, startAngleRad, endAngleRad, kernel.clockwise);
}

function straightLineBezier(a: AnnotationPoint, b: AnnotationPoint): BezierCurve3 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    start: clonePoint(a),
    end: clonePoint(b),
    control1: { x: a.x + dx * 0.33, y: a.y + dy * 0.33 },
    control2: { x: a.x + dx * 0.67, y: a.y + dy * 0.67 },
  };
}

function midBezier(a: BezierCurve3, b: BezierCurve3): BezierCurve3 {
  return {
    start: { x: (a.start.x + b.start.x) * 0.5, y: (a.start.y + b.start.y) * 0.5 },
    end: { x: (a.end.x + b.end.x) * 0.5, y: (a.end.y + b.end.y) * 0.5 },
    control1: { x: (a.control1.x + b.control1.x) * 0.5, y: (a.control1.y + b.control1.y) * 0.5 },
    control2: { x: (a.control2.x + b.control2.x) * 0.5, y: (a.control2.y + b.control2.y) * 0.5 },
  };
}

export function buildDefaultJunctionComposition(
  junction: AnnotatedJunction,
  overlay: DerivedJunctionOverlay,
): JunctionComposition {
  const quadrants: JunctionQuadrantComposition[] = [];
  const kind = overlay.kind === "cross_junction" ? "cross_junction" : overlay.kind === "t_junction" ? "t_junction" : "complex_junction";

  for (let i = 0; i < overlay.quadrantCornerKernels.length; i += 1) {
    const kernel = overlay.quadrantCornerKernels[i];
    const quadrantId = kernel.quadrantId;
    const armAId = kernel.startCenterlineId;
    const armBId = kernel.endCenterlineId;

    // Find connector center lines for this quadrant to get strip widths and start/end points
    const quadrantConnectors = overlay.connectorCenterLines.filter((c) => c.quadrantId === quadrantId);

    const patches: JunctionQuadrantBezierPatch[] = [];
    const skeletonLines: JunctionQuadrantSkeletonLine[] = [];

    for (const stripKind of CORNER_STRIP_KINDS) {
      const connector = quadrantConnectors.find((c) => c.stripKind === stripKind);
      const strokeWidthPx = connector?.strokeWidthPx ?? 8;
      const halfWidthPx = strokeWidthPx * 0.5;

      // Default bezier for this strip kind: offset from the canonical kernel arc
      // We approximate by using kernel radius ± half width
      const innerDefault = kernelToDefaultBezier(kernel, -halfWidthPx);
      const outerDefault = kernelToDefaultBezier(kernel, halfWidthPx);

      // If we have connector points, use the first/last points as anchors
      const connectorPoints = connector?.points ?? [];
      let innerCurve: BezierCurve3;
      let outerCurve: BezierCurve3;

      if (innerDefault && outerDefault) {
        innerCurve = innerDefault;
        outerCurve = outerDefault;
      } else if (connectorPoints.length >= 2) {
        const p0 = connectorPoints[0];
        const pLast = connectorPoints[connectorPoints.length - 1];
        const normalStart = evaluateBezierTangent(straightLineBezier(p0, pLast), 0);
        const normalEnd = evaluateBezierTangent(straightLineBezier(p0, pLast), 1);
        // perpendicular
        const n1 = { x: -normalStart.y, y: normalStart.x };
        const n2 = { x: -normalEnd.y, y: normalEnd.x };
        innerCurve = straightLineBezier(
          { x: p0.x + n1.x * halfWidthPx, y: p0.y + n1.y * halfWidthPx },
          { x: pLast.x + n2.x * halfWidthPx, y: pLast.y + n2.y * halfWidthPx },
        );
        outerCurve = straightLineBezier(
          { x: p0.x - n1.x * halfWidthPx, y: p0.y - n1.y * halfWidthPx },
          { x: pLast.x - n2.x * halfWidthPx, y: pLast.y - n2.y * halfWidthPx },
        );
      } else {
        // absolute fallback using kernel points
        const kp0 = kernel.points[0] ?? { x: 0, y: 0 };
        const kp1 = kernel.points[kernel.points.length - 1] ?? kp0;
        innerCurve = straightLineBezier(kp0, kp1);
        outerCurve = straightLineBezier(kp0, kp1);
      }

      patches.push({
        patchId: `${quadrantId}_patch_${stripKind}`,
        stripKind,
        innerCurve: cloneBezier(innerCurve),
        outerCurve: cloneBezier(outerCurve),
      });

      skeletonLines.push({
        lineId: `${quadrantId}_skeleton_${stripKind}`,
        stripKind,
        curve: cloneBezier(midBezier(innerCurve, outerCurve)),
        widthM: strokeWidthPx, // placeholder in px, will be converted to meters below
      });
    }

    quadrants.push({ quadrantId, armAId, armBId, patches, skeletonLines });
  }

  return { junctionId: junction.id, kind, quadrants };
}

// ------------------------------------------------------------------
// Composer UI
// ------------------------------------------------------------------

export function mountJunctionComposer(deps: JunctionComposerDeps): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const ppm = Math.max(deps.annotation.pixels_per_meter, 0.0001);

  // Try load existing composition
  const existing = deps.annotation.junction_compositions?.find((c) => c.junctionId === deps.junction.id);
  const defaultComp = buildDefaultJunctionComposition(deps.junction, deps.overlay);

  // Deep clone existing or default
  const composition: JunctionComposition = existing
    ? JSON.parse(JSON.stringify(existing)) as JunctionComposition
    : defaultComp;

  // Fix skeleton width in meters if using default
  if (!existing) {
    for (const q of composition.quadrants) {
      for (const sl of q.skeletonLines) {
        sl.widthM = sl.widthM / ppm; // default build used px placeholder
        // Actually buildDefaultJunctionComposition used strokeWidthPx / 1. Fix it here.
        const connector = deps.overlay.connectorCenterLines.find(
          (c) => c.quadrantId === q.quadrantId && c.stripKind === sl.stripKind,
        );
        if (connector) {
          sl.widthM = connector.strokeWidthPx / ppm;
        }
      }
    }
  }

  let selectedQuadrantIndex = 0;
  let selectedStripKind: StripKind = "clear_sidewalk";
  let showAllQuadrants = false;
  let dragTarget: DragTarget = null;

  const overlayWidth = deps.annotation.image_width_px;
  const overlayHeight = deps.annotation.image_height_px;

  deps.root.innerHTML += `
    <div class="junction-composer-overlay" id="jc-overlay">
      <div class="junction-composer-header">
        <div>
          <h2 class="junction-composer-title">Junction Composer</h2>
          <p class="junction-composer-subtitle">${escapeHtml(deps.junction.label)} — Edit bezier curves for corner patches and skeleton lines.</p>
        </div>
        <div class="junction-composer-actions">
          <button id="jc-btn-reset" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Reset to Auto</button>
          <button id="jc-btn-apply-all" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Apply to All Quadrants</button>
          <button id="jc-btn-save" class="scene-toolbar-button" type="button">Save & Close</button>
          <button id="jc-btn-cancel" class="scene-toolbar-button scene-toolbar-button-secondary" type="button">Cancel</button>
        </div>
      </div>
      <div class="junction-composer-body">
        <div class="junction-composer-sidebar">
          <div class="jc-panel">
            <div class="jc-panel-title">Quadrants</div>
            <div id="jc-quadrant-list" class="jc-quadrant-list"></div>
            <label class="jc-toggle">
              <input id="jc-show-all" type="checkbox" />
              <span>Show all quadrants</span>
            </label>
          </div>
          <div class="jc-panel">
            <div class="jc-panel-title">Strip Kind</div>
            <div id="jc-strip-list" class="jc-strip-list"></div>
          </div>
          <div class="jc-panel">
            <div class="jc-panel-title">Visibility</div>
            <label class="jc-toggle">
              <input id="jc-show-patches" type="checkbox" checked />
              <span>Show patches</span>
            </label>
            <label class="jc-toggle">
              <input id="jc-show-skeletons" type="checkbox" checked />
              <span>Show skeleton lines</span>
            </label>
          </div>
        </div>
        <div class="junction-composer-canvas-wrap">
          <svg id="jc-svg" class="junction-composer-svg" viewBox="0 0 ${overlayWidth} ${overlayHeight}" preserveAspectRatio="xMidYMid meet">
            <image href="${escapeHtml(deps.imageUrl)}" x="0" y="0" width="${overlayWidth}" height="${overlayHeight}" opacity="0.35" />
            <g id="jc-layer-patches"></g>
            <g id="jc-layer-skeletons"></g>
            <g id="jc-layer-curves"></g>
            <g id="jc-layer-handles"></g>
          </svg>
        </div>
      </div>
    </div>
  `;

  const overlayEl = requireElement<HTMLElement>(deps.root, "#jc-overlay");
  const btnReset = requireElement<HTMLButtonElement>(deps.root, "#jc-btn-reset");
  const btnApplyAll = requireElement<HTMLButtonElement>(deps.root, "#jc-btn-apply-all");
  const btnSave = requireElement<HTMLButtonElement>(deps.root, "#jc-btn-save");
  const btnCancel = requireElement<HTMLButtonElement>(deps.root, "#jc-btn-cancel");
  const quadrantListEl = requireElement<HTMLElement>(deps.root, "#jc-quadrant-list");
  const stripListEl = requireElement<HTMLElement>(deps.root, "#jc-strip-list");
  const showAllInput = requireElement<HTMLInputElement>(deps.root, "#jc-show-all");
  const showPatchesInput = requireElement<HTMLInputElement>(deps.root, "#jc-show-patches");
  const showSkeletonsInput = requireElement<HTMLInputElement>(deps.root, "#jc-show-skeletons");
  const svgEl = requireElement<SVGSVGElement>(deps.root, "#jc-svg");
  const layerPatches = requireElement<SVGGElement>(deps.root, "#jc-layer-patches");
  const layerSkeletons = requireElement<SVGGElement>(deps.root, "#jc-layer-skeletons");
  const layerCurves = requireElement<SVGGElement>(deps.root, "#jc-layer-curves");
  const layerHandles = requireElement<SVGGElement>(deps.root, "#jc-layer-handles");

  function svgPointFromEvent(event: PointerEvent): AnnotationPoint | null {
    const rect = svgEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scaleX = overlayWidth / rect.width;
    const scaleY = overlayHeight / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function renderQuadrantList(): void {
    quadrantListEl.innerHTML = composition.quadrants
      .map((q, idx) => {
        const active = idx === selectedQuadrantIndex ? " jc-quadrant-active" : "";
        return `<button class="jc-quadrant-btn${active}" data-index="${idx}" type="button">${escapeHtml(q.quadrantId)}</button>`;
      })
      .join("");
  }

  function renderStripList(): void {
    stripListEl.innerHTML = CORNER_STRIP_KINDS.map((kind) => {
      const active = kind === selectedStripKind ? " jc-strip-active" : "";
      return `<button class="jc-strip-btn${active}" data-kind="${kind}" type="button" style="border-left:4px solid ${stripKindColor(kind)}">${escapeHtml(stripKindLabel(kind))}</button>`;
    }).join("");
  }

  function patchPathD(patch: JunctionQuadrantBezierPatch): string {
    // Build a closed polygon by sampling both curves and connecting them.
    // inner curve goes from armA inner to armB inner;
    // outer curve goes from armA outer to armB outer (reversed for closure).
    const innerPts = sampleBezierPoints(patch.innerCurve, 12);
    const outerPts = sampleBezierPoints(patch.outerCurve, 12);
    const pts = [...innerPts, ...outerPts.slice().reverse()];
    if (pts.length < 3) return "";
    return `M ${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")} Z`;
  }

  function render(): void {
    renderQuadrantList();
    renderStripList();

    // Clear layers
    layerPatches.innerHTML = "";
    layerSkeletons.innerHTML = "";
    layerCurves.innerHTML = "";
    layerHandles.innerHTML = "";

    const showPatches = showPatchesInput.checked;
    const showSkeletons = showSkeletonsInput.checked;

    for (let qi = 0; qi < composition.quadrants.length; qi += 1) {
      const q = composition.quadrants[qi];
      const isActive = showAllQuadrants || qi === selectedQuadrantIndex;
      const opacity = isActive ? "1" : "0.25";

      for (const patch of q.patches) {
        if (showPatches) {
          layerPatches.innerHTML += `
            <path
              d="${patchPathD(patch)}"
              fill="${stripKindColor(patch.stripKind)}"
              stroke="${stripKindStroke(patch.stripKind)}"
              stroke-width="1"
              fill-opacity="${isActive ? "0.55" : "0.18"}"
              style="pointer-events:none"
            />
          `;
        }
      }

      for (const sl of q.skeletonLines) {
        if (showSkeletons) {
          const pts = sampleBezierPoints(sl.curve, 16);
          const d = `M ${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")}`;
          const strokeW = Math.max(1, sl.widthM * ppm);
          layerSkeletons.innerHTML += `
            <path
              d="${d}"
              fill="none"
              stroke="${stripKindStroke(sl.stripKind)}"
              stroke-width="${strokeW.toFixed(1)}"
              stroke-opacity="${isActive ? "0.9" : "0.35"}"
              style="pointer-events:none"
            />
          `;
        }
      }

      // Render editable curves and handles only for active quadrant
      if (!isActive) continue;

      const patch = q.patches.find((p) => p.stripKind === selectedStripKind);
      const skeleton = q.skeletonLines.find((s) => s.stripKind === selectedStripKind);
      if (!patch || !skeleton) continue;

      for (const curveType of ["inner", "outer"] as const) {
        const curve = curveType === "inner" ? patch.innerCurve : patch.outerCurve;
        const color = curveType === "inner" ? "#ff6b6b" : "#4ecdc4";
        // Curve path
        layerCurves.innerHTML += `
          <path
            d="${bezierPathD(curve)}"
            fill="none"
            stroke="${color}"
            stroke-width="2"
            stroke-dasharray="4 2"
            opacity="0.9"
            style="pointer-events:none"
          />
        `;
        // Control lines
        layerCurves.innerHTML += `
          <line x1="${curve.start.x.toFixed(2)}" y1="${curve.start.y.toFixed(2)}" x2="${curve.control1.x.toFixed(2)}" y2="${curve.control1.y.toFixed(2)}" stroke="${color}" stroke-width="1" opacity="0.5" />
          <line x1="${curve.end.x.toFixed(2)}" y1="${curve.end.y.toFixed(2)}" x2="${curve.control2.x.toFixed(2)}" y2="${curve.control2.y.toFixed(2)}" stroke="${color}" stroke-width="1" opacity="0.5" />
        `;
        // Handles
        const handles: Array<{ kind: string; pt: AnnotationPoint; r: number; fill: string; stroke?: string }> = [
          { kind: "start", pt: curve.start, r: 5, fill: color },
          { kind: "end", pt: curve.end, r: 5, fill: color },
          { kind: "control1", pt: curve.control1, r: 4, fill: "#ffffff", stroke: color },
          { kind: "control2", pt: curve.control2, r: 4, fill: "#ffffff", stroke: color },
        ];
        for (const h of handles) {
          layerHandles.innerHTML += `
            <circle
              class="jc-handle"
              cx="${h.pt.x.toFixed(2)}"
              cy="${h.pt.y.toFixed(2)}"
              r="${h.r}"
              fill="${h.fill}"
              stroke="${h.stroke ?? "none"}"
              stroke-width="${h.stroke ? 2 : 0}"
              data-kind="${h.kind}"
              data-curve="${curveType}"
              data-qi="${qi}"
            />
          `;
        }
      }

      // Skeleton editable curve
      {
        const curve = skeleton.curve;
        const color = "#9b59b6";
        layerCurves.innerHTML += `
          <path
            d="${bezierPathD(curve)}"
            fill="none"
            stroke="${color}"
            stroke-width="2"
            stroke-dasharray="6 3"
            opacity="0.85"
            style="pointer-events:none"
          />
        `;
        layerCurves.innerHTML += `
          <line x1="${curve.start.x.toFixed(2)}" y1="${curve.start.y.toFixed(2)}" x2="${curve.control1.x.toFixed(2)}" y2="${curve.control1.y.toFixed(2)}" stroke="${color}" stroke-width="1" opacity="0.5" />
          <line x1="${curve.end.x.toFixed(2)}" y1="${curve.end.y.toFixed(2)}" x2="${curve.control2.x.toFixed(2)}" y2="${curve.control2.y.toFixed(2)}" stroke="${color}" stroke-width="1" opacity="0.5" />
        `;
        const skHandles: Array<{ kind: string; pt: AnnotationPoint; r: number; fill: string; stroke?: string }> = [
          { kind: "skeletonStart", pt: curve.start, r: 5, fill: color },
          { kind: "skeletonEnd", pt: curve.end, r: 5, fill: color },
          { kind: "skeletonControl1", pt: curve.control1, r: 4, fill: "#ffffff", stroke: color },
          { kind: "skeletonControl2", pt: curve.control2, r: 4, fill: "#ffffff", stroke: color },
        ];
        for (const h of skHandles) {
          layerHandles.innerHTML += `
            <circle
              class="jc-handle"
              cx="${h.pt.x.toFixed(2)}"
              cy="${h.pt.y.toFixed(2)}"
              r="${h.r}"
              fill="${h.fill}"
              stroke="${h.stroke ?? "none"}"
              stroke-width="${h.stroke ? 2 : 0}"
              data-kind="${h.kind}"
              data-qi="${qi}"
            />
          `;
        }
      }
    }
  }

  // Event listeners
  quadrantListEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".jc-quadrant-btn");
    if (!btn) return;
    const idx = parseInt(btn.dataset.index ?? "0", 10);
    selectedQuadrantIndex = idx;
    render();
  }, { signal });

  stripListEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".jc-strip-btn");
    if (!btn) return;
    const kind = btn.dataset.kind as StripKind;
    selectedStripKind = kind;
    render();
  }, { signal });

  showAllInput.addEventListener("change", () => {
    showAllQuadrants = showAllInput.checked;
    render();
  }, { signal });

  showPatchesInput.addEventListener("change", render, { signal });
  showSkeletonsInput.addEventListener("change", render, { signal });

  btnReset.addEventListener("click", () => {
    const fresh = buildDefaultJunctionComposition(deps.junction, deps.overlay);
    for (const q of fresh.quadrants) {
      for (const sl of q.skeletonLines) {
        const connector = deps.overlay.connectorCenterLines.find(
          (c) => c.quadrantId === q.quadrantId && c.stripKind === sl.stripKind,
        );
        if (connector) {
          sl.widthM = connector.strokeWidthPx / ppm;
        }
      }
    }
    composition.quadrants = fresh.quadrants;
    render();
  }, { signal });

  btnApplyAll.addEventListener("click", () => {
    const source = composition.quadrants[selectedQuadrantIndex];
    if (!source) return;
    for (let i = 0; i < composition.quadrants.length; i += 1) {
      if (i === selectedQuadrantIndex) continue;
      const target = composition.quadrants[i];
      for (const sp of source.patches) {
        const tp = target.patches.find((p) => p.stripKind === sp.stripKind);
        if (tp) {
          tp.innerCurve = cloneBezier(sp.innerCurve);
          tp.outerCurve = cloneBezier(sp.outerCurve);
        }
      }
      for (const ss of source.skeletonLines) {
        const ts = target.skeletonLines.find((s) => s.stripKind === ss.stripKind);
        if (ts) {
          ts.curve = cloneBezier(ss.curve);
          ts.widthM = ss.widthM;
        }
      }
    }
    render();
  }, { signal });

  btnSave.addEventListener("click", () => {
    deps.onSave(composition);
    overlayEl.remove();
  }, { signal });

  btnCancel.addEventListener("click", () => {
    deps.onCancel();
    overlayEl.remove();
  }, { signal });

  // Drag logic
  svgEl.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("jc-handle")) return;
    const kindRaw = target.dataset.kind ?? "";
    const qi = parseInt(target.dataset.qi ?? "0", 10);
    const curveType = (target.dataset.curve as "inner" | "outer") ?? "inner";
    if (kindRaw === "start" || kindRaw === "end" || kindRaw === "control1" || kindRaw === "control2") {
      dragTarget = { kind: kindRaw, quadrantIndex: qi, stripKind: selectedStripKind, curveType };
    } else if (kindRaw === "skeletonStart" || kindRaw === "skeletonEnd" || kindRaw === "skeletonControl1" || kindRaw === "skeletonControl2") {
      dragTarget = { kind: kindRaw, quadrantIndex: qi, stripKind: selectedStripKind };
    }
    if (dragTarget) {
      svgEl.setPointerCapture(e.pointerId);
    }
  }, { signal });

  svgEl.addEventListener("pointermove", (e) => {
    if (!dragTarget) return;
    const pt = svgPointFromEvent(e);
    if (!pt) return;
    const q = composition.quadrants[dragTarget.quadrantIndex];
    if (!q) return;

    if (
      dragTarget.kind === "start" ||
      dragTarget.kind === "end" ||
      dragTarget.kind === "control1" ||
      dragTarget.kind === "control2"
    ) {
      const patch = q.patches.find((p) => p.stripKind === dragTarget!.stripKind);
      if (!patch) return;
      const curve = dragTarget.curveType === "inner" ? patch.innerCurve : patch.outerCurve;
      switch (dragTarget.kind) {
        case "start":
          curve.start = pt;
          break;
        case "end":
          curve.end = pt;
          break;
        case "control1":
          curve.control1 = pt;
          break;
        case "control2":
          curve.control2 = pt;
          break;
      }
    } else if (
      dragTarget.kind === "skeletonStart" ||
      dragTarget.kind === "skeletonEnd" ||
      dragTarget.kind === "skeletonControl1" ||
      dragTarget.kind === "skeletonControl2"
    ) {
      const skeleton = q.skeletonLines.find((s) => s.stripKind === dragTarget!.stripKind);
      if (!skeleton) return;
      switch (dragTarget.kind) {
        case "skeletonStart":
          skeleton.curve.start = pt;
          break;
        case "skeletonEnd":
          skeleton.curve.end = pt;
          break;
        case "skeletonControl1":
          skeleton.curve.control1 = pt;
          break;
        case "skeletonControl2":
          skeleton.curve.control2 = pt;
          break;
      }
    }
    render();
  }, { signal });

  const endDrag = (e: PointerEvent) => {
    if (!dragTarget) return;
    dragTarget = null;
    svgEl.releasePointerCapture(e.pointerId);
  };
  svgEl.addEventListener("pointerup", endDrag, { signal });
  svgEl.addEventListener("pointercancel", endDrag, { signal });

  render();

  return () => {
    controller.abort();
    overlayEl.remove();
  };
}
