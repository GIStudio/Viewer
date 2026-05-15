import type { DerivedJunctionOverlay, DerivedJunctionOverlayConnectorLine, DerivedJunctionOverlayPatch, JunctionOverlayStripLinkEndpoint, Selection, StripKind } from "../sg-types";
import { CENTER_STRIP_KINDS } from "../sg-constants";
import { derivedJunctionKindLabel } from "../sg-geometry";
import { escapeHtml } from "../viewer-utils";
import { findConnectorLineLink, findFusedStripLink, laneElementMatches, laneElementTouchesEndpoints, laneSelectionClassName, selectedLaneElement } from "./laneSelection";
import { cornerConnectionLabel, metaurbanStripLabel, stripStrokeColor, stripVisualSurfaceFillColor, visualUnionSurfaceMarkup } from "./overlayDisplay";

function isVehicleCenterConnectorKind(kind: StripKind): boolean {
  return CENTER_STRIP_KINDS.has(kind) && kind !== "median";
}

function buildDerivedJunctionOverlayMarkup(
  overlays: DerivedJunctionOverlay[],
  selection: Selection,
  options: {
    showJunctionCore: boolean;
    showJunctionConnectors: boolean;
    showJunctionCrosswalks: boolean;
    showJunctionBoundaries: boolean;
    showJunctionLabels: boolean;
    showJunctionDebug: boolean;
  },
  manualJunctionIds: Set<string> = new Set(),
): string {
  if (overlays.length === 0) {
    return "";
  }
  const laneSelection = selectedLaneElement(selection);
  const cornerPatchClassName = (stripKind: StripKind): string => {
    if (stripKind === "clear_sidewalk") {
      return "annotation-junction-sidewalk-corner";
    }
    if (stripKind === "nearroad_furnishing") {
      return "annotation-junction-nearroad-corner";
    }
    return "annotation-junction-frontage-corner";
  };
  return overlays
    .map((overlay) => {
      const featureKind = overlay.sourceMode === "explicit" ? "junction" : "derived_junction";
      const isSelected =
        (featureKind === "junction" && selection?.kind === "junction" && selection.id === overlay.junctionId) ||
        (featureKind === "derived_junction" && selection?.kind === "derived_junction" && selection.id === overlay.junctionId);
      const endpointAttrs = (
        start: JunctionOverlayStripLinkEndpoint | undefined,
        end: JunctionOverlayStripLinkEndpoint | undefined,
      ): string => [
        start ? `data-from-centerline-id="${escapeHtml(start.centerlineId)}"` : "",
        start ? `data-from-strip-id="${escapeHtml(start.stripId)}"` : "",
        end ? `data-to-centerline-id="${escapeHtml(end.centerlineId)}"` : "",
        end ? `data-to-strip-id="${escapeHtml(end.stripId)}"` : "",
      ].filter(Boolean).join(" ");
      const featureDataAttrs = `data-feature-kind="${featureKind}" data-feature-id="${escapeHtml(overlay.junctionId)}"`;
      const polygonMarkup = (patches: DerivedJunctionOverlayPatch[], className: string): string =>
        patches
          .map((patch) => {
            if (patch.points.length < 3) {
              return "";
            }
            if (patch.cutoutPoints && patch.cutoutPoints.length >= 3) {
              const pathData = [
                `M ${patch.points.map((point) => `${point.x},${point.y}`).join(" L ")} Z`,
                `M ${patch.cutoutPoints.map((point) => `${point.x},${point.y}`).join(" L ")} Z`,
              ].join(" ");
              return `
                <path
                  class="${className}${isSelected ? ` ${className}-selected` : ""}"
                  d="${pathData}"
                  fill-rule="evenodd"
                  style="stroke: none"
                  data-feature-kind="${featureKind}"
                  data-feature-id="${escapeHtml(overlay.junctionId)}"
                />
              `;
            }
            return `
              <polygon
                class="${className}${isSelected ? ` ${className}-selected` : ""}"
                points="${patch.points.map((point) => `${point.x},${point.y}`).join(" ")}"
                data-feature-kind="${featureKind}"
                data-feature-id="${escapeHtml(overlay.junctionId)}"
              />
            `;
          })
          .join("");
      const patchUnionMarkup = (
        patches: DerivedJunctionOverlayPatch[],
        className: string,
        style = "",
      ): string => {
        if (patches.some((patch) => patch.cutoutPoints && patch.cutoutPoints.length >= 3)) {
          return polygonMarkup(patches, className);
        }
        return visualUnionSurfaceMarkup(
          patches.map((patch) => patch.points),
          `annotation-junction-visual-surface ${className}${isSelected ? ` ${className}-selected` : ""}`,
          featureDataAttrs,
          style,
        );
      };
      const visibleFusedCornerPatchMarkup = options.showJunctionConnectors && overlay.fusedCornerStrips.length > 0
        ? (["frontage_reserve", "nearroad_furnishing", "clear_sidewalk"] as StripKind[])
            .map((stripKind) =>
              patchUnionMarkup(
                overlay.fusedCornerStrips
                  .filter((strip) => strip.stripKind === stripKind)
                  .map((strip) => strip.patch),
                cornerPatchClassName(stripKind),
              ),
            )
            .join("")
        : "";
      const fusedCornerHitMarkup = options.showJunctionConnectors && overlay.fusedCornerStrips.length > 0
        ? overlay.fusedCornerStrips
            .map((strip) => {
              const link = findFusedStripLink(overlay, strip);
              const elementId = `junction_side_patch:${overlay.junctionId}:${strip.stripId}`;
              const selected = laneElementMatches(laneSelection, "junction_side_patch", elementId);
              const related = !selected && laneElementTouchesEndpoints(laneSelection, link?.start, link?.end);
              return `
                <polygon
                  class="annotation-junction-lane-hit-area ${cornerPatchClassName(strip.stripKind)}${laneSelectionClassName(selected, related)}"
                  points="${strip.patch.points.map((point) => `${point.x},${point.y}`).join(" ")}"
                  data-feature-kind="${featureKind}"
                  data-feature-id="${escapeHtml(overlay.junctionId)}"
                  data-lane-element-kind="junction_side_patch"
                  data-lane-element-id="${escapeHtml(elementId)}"
                  data-owner-kind="${featureKind}"
                  data-owner-id="${escapeHtml(overlay.junctionId)}"
                  data-junction-id="${escapeHtml(overlay.junctionId)}"
                  data-patch-id="${escapeHtml(strip.patch.patchId)}"
                  data-patch-role="${escapeHtml(strip.patchRole ?? "connector")}"
                  data-paired-connector-id="${escapeHtml(strip.pairedConnectorId ?? "")}"
                  data-endpoint-role="${escapeHtml(strip.endpointRole ?? "")}"
                  data-strip-id="${escapeHtml(strip.stripId)}"
                  data-strip-kind="${escapeHtml(strip.stripKind)}"
                  data-width-px="${strip.widthPx.toFixed(3)}"
                  data-quadrant-id="${escapeHtml(strip.quadrantId)}"
                  data-kernel-id="${escapeHtml(strip.kernelId ?? "")}"
                  data-link-id="${escapeHtml(link?.linkId ?? "")}"
                  ${endpointAttrs(link?.start, link?.end)}
                  data-points-count="${strip.patch.points.length}"
                />
              `;
            })
            .join("")
        : "";
      const cornerConnectorMarkup = options.showJunctionConnectors
        ? (visibleFusedCornerPatchMarkup
          ? `${visibleFusedCornerPatchMarkup}${fusedCornerHitMarkup}`
          : [
            patchUnionMarkup(overlay.frontageCorners, "annotation-junction-frontage-corner"),
            patchUnionMarkup(overlay.nearroadCorners, "annotation-junction-nearroad-corner"),
            patchUnionMarkup(overlay.sidewalkCorners, "annotation-junction-sidewalk-corner"),
          ].join(""))
        : "";
      const standaloneVehicleTurnPatches = options.showJunctionCore
        ? overlay.vehicleTurnPatches.filter((patch) => patch.stripKind !== "drive_lane")
        : overlay.vehicleTurnPatches;
      const visibleVehicleTurnPatchMarkup = options.showJunctionConnectors
        ? [...new Set(standaloneVehicleTurnPatches.map((patch) => patch.stripKind))]
            .map((stripKind) =>
              patchUnionMarkup(
                standaloneVehicleTurnPatches.filter((patch) => patch.stripKind === stripKind),
                "annotation-junction-turn-lane-patch",
                `fill: ${stripVisualSurfaceFillColor(stripKind)}; stroke: ${stripStrokeColor(stripKind)}; stroke-width: 1px`,
              ),
            )
            .join("")
        : "";
      const vehicleTurnPatchHitMarkup = options.showJunctionConnectors
        ? overlay.vehicleTurnPatches
            .map((patch) => {
              const elementId = `junction_turn_patch:${overlay.junctionId}:${patch.patchId}`;
              const start = {
                centerlineId: patch.fromCenterlineId,
                stripId: patch.fromStripId,
                stripKind: patch.stripKind,
                stripZone: "center" as const,
              };
              const end = {
                centerlineId: patch.toCenterlineId,
                stripId: patch.toStripId,
                stripKind: patch.stripKind,
                stripZone: "center" as const,
              };
              const selected = laneElementMatches(laneSelection, "junction_turn_patch", elementId);
              const related = !selected && laneElementTouchesEndpoints(laneSelection, start, end);
              return `
                <polygon
                  class="annotation-junction-lane-hit-area annotation-junction-turn-lane-patch${laneSelectionClassName(selected, related)}"
                  points="${patch.points.map((point) => `${point.x},${point.y}`).join(" ")}"
                  data-feature-kind="${featureKind}"
                  data-feature-id="${escapeHtml(overlay.junctionId)}"
                  data-lane-element-kind="junction_turn_patch"
                  data-lane-element-id="${escapeHtml(elementId)}"
                  data-owner-kind="${featureKind}"
                  data-owner-id="${escapeHtml(overlay.junctionId)}"
                  data-junction-id="${escapeHtml(overlay.junctionId)}"
                  data-turn-patch-id="${escapeHtml(patch.patchId)}"
                  data-patch-id="${escapeHtml(patch.patchId)}"
                  data-strip-kind="${escapeHtml(patch.stripKind)}"
                  data-width-px="${patch.strokeWidthPx.toFixed(3)}"
                  data-quadrant-id="${escapeHtml(patch.quadrantId)}"
                  data-kernel-id="${escapeHtml(patch.kernelId ?? "")}"
                  ${endpointAttrs(start, end)}
                  data-points-count="${patch.points.length}"
                />
              `;
            })
            .join("")
        : "";
      const connectorLineElementMarkup = (line: DerivedJunctionOverlayConnectorLine, className: string): string => {
        const link = findConnectorLineLink(overlay, line);
        const start = line.start ?? link?.start;
        const end = line.end ?? link?.end;
        const elementId = `junction_connector:${overlay.junctionId}:${line.connectorId}`;
        const selected = laneElementMatches(laneSelection, "junction_connector", elementId);
        const related = !selected && laneElementTouchesEndpoints(laneSelection, start, end);
        return `
          <polyline
            class="${className}${laneSelectionClassName(selected, related)}"
            points="${line.points.map((point) => `${point.x},${point.y}`).join(" ")}"
            style="stroke: ${stripStrokeColor(line.stripKind)}; stroke-width: ${line.strokeWidthPx}px"
            data-lane-element-kind="junction_connector"
            data-lane-element-id="${escapeHtml(elementId)}"
            data-owner-kind="${featureKind}"
            data-owner-id="${escapeHtml(overlay.junctionId)}"
            data-junction-id="${escapeHtml(overlay.junctionId)}"
            data-connector-id="${escapeHtml(line.connectorId)}"
            data-link-id="${escapeHtml(line.linkId ?? link?.linkId ?? "")}"
            data-strip-kind="${escapeHtml(line.stripKind)}"
            data-width-px="${line.strokeWidthPx.toFixed(3)}"
            data-quadrant-id="${escapeHtml(line.quadrantId)}"
            data-kernel-id="${escapeHtml(line.kernelId ?? "")}"
            ${endpointAttrs(start, end)}
            data-points-count="${line.points.length}"
          />
        `;
      };
      const vehicleConnectorMarkup = isSelected && options.showJunctionDebug
        ? overlay.connectorCenterLines
            .filter((line) => isVehicleCenterConnectorKind(line.stripKind))
            .map((line) => connectorLineElementMarkup(line, "annotation-junction-vehicle-connector-line"))
            .join("")
        : "";
      const connectorLineMarkup = isSelected && options.showJunctionDebug && overlay.kind === "t_junction"
        ? overlay.connectorCenterLines
            .map((line) => connectorLineElementMarkup(line, "annotation-junction-connector-line"))
            .join("")
        : "";
      const quadrantCornerKernelMarkup = isSelected && options.showJunctionDebug && overlay.kind === "cross_junction"
        ? overlay.quadrantCornerKernels
            .map(
              (kernel) => `
                <polyline
                  class="annotation-junction-corner-kernel"
                  points="${kernel.points.map((point) => `${point.x},${point.y}`).join(" ")}"
                />
              `,
            )
            .join("")
        : "";
      const connectorDebugLabelMarkup = isSelected && options.showJunctionDebug && overlay.kind === "cross_junction"
        ? overlay.connectorCenterLines
            .map((line) => {
              const anchorPoint = line.points[Math.floor(line.points.length * 0.5)] ?? line.points[0];
              const stripLabel = metaurbanStripLabel(line.stripKind);
              return `
                <text
                  class="annotation-junction-debug-label"
                  x="${anchorPoint?.x ?? 0}"
                  y="${(anchorPoint?.y ?? 0) - 8}"
                  text-anchor="middle"
                >
                  ${escapeHtml(`${cornerConnectionLabel(line.quadrantId)} / ${line.kernelId ?? "no-kernel"} / ${stripLabel}`)}
                </text>
              `;
            })
            .join("")
        : "";
      const boundaryMarkup = options.showJunctionBoundaries
        ? overlay.approachBoundaries
            .map(
              (boundary) => `
            <line
              class="annotation-junction-boundary${isSelected ? " annotation-junction-boundary-selected" : ""}"
              x1="${boundary.start.x}"
              y1="${boundary.start.y}"
              x2="${boundary.end.x}"
              y2="${boundary.end.y}"
              data-feature-kind="${featureKind}"
              data-feature-id="${escapeHtml(overlay.junctionId)}"
            />
          `,
            )
            .join("")
        : "";
      const boundaryExtensionMarkup = isSelected && options.showJunctionDebug
        ? overlay.boundaryExtensionLines
            .map(
              (line) => `
                <line
                  class="annotation-junction-boundary-extension"
                  x1="${line.start.x}"
                  y1="${line.start.y}"
                  x2="${line.end.x}"
                  y2="${line.end.y}"
                />
              `,
            )
            .join("")
        : "";
      const focusGuideMarkup = isSelected && options.showJunctionDebug
        ? overlay.focusGuideLines
            .map(
              (line) => `
                <line
                  class="annotation-junction-focus-guide"
                  x1="${line.start.x}"
                  y1="${line.start.y}"
                  x2="${line.end.x}"
                  y2="${line.end.y}"
                />
              `,
            )
            .join("")
        : "";
      const controlPointMarkup = isSelected && options.showJunctionDebug
        ? `
          ${boundaryExtensionMarkup}
          ${focusGuideMarkup}
          ${overlay.cornerFocusPoints
            .map(
              (item) => `
                <circle
                  class="annotation-junction-corner-focus"
                  cx="${item.point.x}"
                  cy="${item.point.y}"
                  r="5"
                />
              `,
            )
            .join("")}
          ${overlay.skeletonFootPoints
            .map(
              (item) => `
                <circle
                  class="annotation-junction-control-point annotation-junction-foot-point"
                  cx="${item.point.x}"
                  cy="${item.point.y}"
                  r="4.5"
                />
              `,
            )
            .join("")}
          ${overlay.subLaneControlPoints
            .map(
              (item) => `
                <circle
                  class="annotation-junction-control-point"
                  cx="${item.point.x}"
                  cy="${item.point.y}"
                  r="3.5"
                />
              `,
            )
            .join("")}
        `
        : "";
      const carriagewayCoreRing = overlay.carriagewayCore.length > 0 ? overlay.carriagewayCore : overlay.core;
      const carriagewayCoreMarkup = options.showJunctionCore
        ? visualUnionSurfaceMarkup(
          [
            carriagewayCoreRing,
            ...overlay.vehicleTurnPatches
              .filter((patch) => patch.stripKind === "drive_lane")
              .map((patch) => patch.points),
          ],
          `annotation-junction-visual-surface annotation-junction-core${isSelected ? " annotation-junction-core-selected" : ""}`,
          featureDataAttrs,
        )
        : "";
      const crosswalkMarkup = options.showJunctionCrosswalks
        ? patchUnionMarkup(overlay.crosswalks, "annotation-junction-crosswalk")
        : "";
      const coreBounds = overlay.core.reduce(
        (acc, point) => ({
          minX: Math.min(acc.minX, point.x),
          minY: Math.min(acc.minY, point.y),
          maxX: Math.max(acc.maxX, point.x),
          maxY: Math.max(acc.maxY, point.y),
        }),
        { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
      );
      const labelX = (coreBounds.minX + coreBounds.maxX) * 0.5;
      const labelY = coreBounds.minY - 10;
      return `
        <g class="annotation-feature-group">
          ${connectorLineMarkup}
      ${quadrantCornerKernelMarkup}
          ${connectorDebugLabelMarkup}
          ${carriagewayCoreMarkup}
          ${crosswalkMarkup}
          ${cornerConnectorMarkup}
          ${visibleVehicleTurnPatchMarkup}
          ${vehicleTurnPatchHitMarkup}
          ${vehicleConnectorMarkup}
          ${boundaryMarkup}
          ${controlPointMarkup}
          ${
            options.showJunctionLabels
              ? `<text
            class="annotation-junction-label${isSelected ? " annotation-junction-label-selected" : ""}"
            x="${labelX}"
            y="${labelY}"
            text-anchor="middle"
            data-feature-kind="${featureKind}"
            data-feature-id="${escapeHtml(overlay.junctionId)}"
          >
            ${escapeHtml(derivedJunctionKindLabel(overlay.kind))}${manualJunctionIds.has(overlay.junctionId) ? " ✎" : ""}
          </text>`
              : ""
          }
        </g>
      `;
    })
    .join("");
}

export { buildDerivedJunctionOverlayMarkup };
