import type { AnnotatedCenterline, DerivedJunctionOverlay, LaneElementSelection } from "../sg-types";
import { CROSS_SECTION_MODE_DETAILED, FURNITURE_KIND_LABELS } from "../sg-constants";
import { resolvedCrossSectionMode, sortedCrossSectionStrips, stripCenterOffsetMeters } from "../sg-utils";
import { stripDisplayPoint } from "../sg-geometry";
import { escapeHtml } from "../viewer-utils";
import { clippedCenterlineDisplaySegments, clippedStripDisplaySegments } from "./overlayClipping";
import { laneElementMatches, laneSelectionClassName } from "./laneSelection";
import { getDisplayCenterlineWidthPx, getDisplayReferenceWidthPx, stripStrokeColor } from "./overlayDisplay";

function buildCenterlineOverlayMarkup(
  centerline: AnnotatedCenterline,
  pixelsPerMeter: number,
  isSelected: boolean,
  selectedVertexIndex: number | undefined,
  selectedStripId: string | null,
  junctionOverlays: DerivedJunctionOverlay[],
  linkedStripKeys: Set<string>,
  laneSelection: LaneElementSelection | null,
): string {
  const displaySegments = clippedCenterlineDisplaySegments(centerline, junctionOverlays, pixelsPerMeter);
  if (displaySegments.length === 0) {
    return "";
  }
  const anySegmentClipped = displaySegments.some((segment) => segment.clippedStart || segment.clippedEnd);
  const labelPoint = displaySegments[0]?.points[0] ?? centerline.points[0] ?? { x: 0, y: 0 };
  const centerlineWidthPx = getDisplayCenterlineWidthPx(pixelsPerMeter);
  const vertexMarkup = centerline.points
    .map((point, index) => {
      const vertexSelected = isSelected && selectedVertexIndex === index;
      return `
        <circle
          class="annotation-vertex${vertexSelected ? " annotation-vertex-selected" : ""}"
          cx="${point.x}"
          cy="${point.y}"
          r="6"
          data-feature-kind="centerline"
          data-feature-id="${escapeHtml(centerline.id)}"
          data-vertex-index="${index}"
        />
      `;
    })
    .join("");

  let bandMarkup = "";
  if (resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED && centerline.cross_section_strips.length > 0) {
    const offsets = stripCenterOffsetMeters(centerline);
    bandMarkup = sortedCrossSectionStrips(centerline.cross_section_strips)
      .map((strip) => {
        const stripOffset = offsets[strip.strip_id];
        const isStripSelected = selectedStripId === strip.strip_id;
        const isLinkedStrip = linkedStripKeys.has(`${centerline.id}:${strip.strip_id}`);
        const laneElementId = `road_strip:${centerline.id}:${strip.strip_id}`;
        const isLaneSelected = laneElementMatches(laneSelection, "road_strip", laneElementId);
        const laneClassName = laneSelectionClassName(isLaneSelected, !isLaneSelected && isLinkedStrip);
        return clippedStripDisplaySegments(
          centerline,
          strip.strip_id,
          stripOffset.centerOffsetM,
          pixelsPerMeter,
          junctionOverlays,
        )
          .map((segment) => {
            const offsetPolylinePoints = segment.points.map((point) => `${point.x},${point.y}`).join(" ");
            return `
              <polyline
                class="annotation-cross-strip${isStripSelected ? " annotation-cross-strip-selected" : isLinkedStrip ? " annotation-cross-strip-linked" : ""}${laneClassName}"
                points="${offsetPolylinePoints}"
                style="stroke: ${stripStrokeColor(strip.kind)}; stroke-width: ${Math.max(2, strip.width_m * pixelsPerMeter)}px; stroke-linecap: ${segment.clippedStart || segment.clippedEnd ? "butt" : "round"}"
                data-feature-kind="centerline"
                data-feature-id="${escapeHtml(centerline.id)}"
                data-lane-element-kind="road_strip"
                data-lane-element-id="${escapeHtml(laneElementId)}"
                data-owner-kind="centerline"
                data-owner-id="${escapeHtml(centerline.id)}"
                data-centerline-id="${escapeHtml(centerline.id)}"
                data-strip-id="${escapeHtml(strip.strip_id)}"
                data-strip-kind="${escapeHtml(strip.kind)}"
                data-strip-zone="${escapeHtml(strip.zone)}"
                data-strip-direction="${escapeHtml(strip.direction)}"
                data-width-m="${strip.width_m.toFixed(3)}"
                data-points-count="${segment.points.length}"
              />
            `;
          })
          .join("");
      })
      .join("");
  } else {
    const roadBandWidthPx = getDisplayReferenceWidthPx(centerline, pixelsPerMeter);
    bandMarkup = displaySegments
      .map(
        (segment) => `
      <polyline
        class="annotation-road-band${isSelected ? " annotation-feature-selected" : ""}"
        points="${segment.points.map((point) => `${point.x},${point.y}`).join(" ")}"
        style="stroke-width: ${roadBandWidthPx}px; stroke-linecap: ${segment.clippedStart || segment.clippedEnd ? "butt" : "round"}"
        data-feature-kind="centerline"
        data-feature-id="${escapeHtml(centerline.id)}"
      />
    `,
      )
      .join("");
  }

  const furnitureMarkup = centerline.street_furniture_instances
    .map((instance) => {
      const point = stripDisplayPoint(
        centerline,
        instance.strip_id,
        instance.station_m * pixelsPerMeter,
        instance.lateral_offset_m * pixelsPerMeter,
        pixelsPerMeter,
      );
      if (!point) {
        return "";
      }
      return `
        <g class="annotation-feature-group">
          <circle class="annotation-furniture-point" cx="${point.x}" cy="${point.y}" r="6" />
          <text class="annotation-furniture-label" x="${point.x + 10}" y="${point.y - 8}">
            ${escapeHtml(FURNITURE_KIND_LABELS[instance.kind])}
          </text>
        </g>
      `;
    })
    .join("");

  return `
    <g class="annotation-feature-group">
      ${bandMarkup}
      ${displaySegments
        .map(
          (segment) => `
      <polyline
        class="annotation-centerline${isSelected ? " annotation-feature-selected" : ""}"
        points="${segment.points.map((point) => `${point.x},${point.y}`).join(" ")}"
        style="stroke-width: ${centerlineWidthPx}px; stroke-linecap: ${segment.clippedStart || segment.clippedEnd || anySegmentClipped ? "butt" : "round"}"
        data-feature-kind="centerline"
        data-feature-id="${escapeHtml(centerline.id)}"
      />`,
        )
        .join("")}
      ${vertexMarkup}
      ${furnitureMarkup}
      <text class="annotation-label" x="${labelPoint.x}" y="${labelPoint.y - 12}">
        ${escapeHtml(centerline.label || centerline.id)}
      </text>
    </g>
  `;
}

export { buildCenterlineOverlayMarkup };
