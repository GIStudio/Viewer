import type { AnnotatedCenterline, AnnotatedCrossSectionStrip, ClippedDisplaySegment, DerivedJunctionOverlay, LaneElementKind, LaneElementSelection, ReferenceAnnotation, SelectedStripCornerFamilyTarget, StripKind, StripZone } from "../sg-types";
import { CROSS_SECTION_MODE_DETAILED, METAAURBAN_STRIP_DISPLAY_LABELS, STRIP_KIND_LABELS } from "../sg-constants";
import { deriveJunctionOverlayGeometries } from "../sg-geometry";
import { deriveLaneProfile, getCenterlineCrossSectionWidth, polylineLength, resolvedCrossSectionMode, selectedStripCornerFamilyTargets } from "../sg-utils";
import { escapeHtml } from "../viewer-utils";

function metaurbanStripLabel(kind: StripKind): string {
  return METAAURBAN_STRIP_DISPLAY_LABELS[kind] || STRIP_KIND_LABELS[kind];
}

function stripZoneSideLabel(zone: StripZone): string {
  if (zone === "left") {
    return "Left side";
  }
  if (zone === "right") {
    return "Right side";
  }
  return "Center";
}

function stripDirectionChip(strip: AnnotatedCrossSectionStrip): string {
  if (strip.direction === "forward") {
    return "FWD";
  }
  if (strip.direction === "reverse") {
    return "REV";
  }
  if (strip.direction === "bidirectional") {
    return "BI";
  }
  return "STATIC";
}

function laneElementKindLabel(kind: LaneElementKind): string {
  if (kind === "road_strip") {
    return "Road Strip";
  }
  if (kind === "junction_turn_patch") {
    return "Junction Turn Patch";
  }
  if (kind === "junction_connector") {
    return "Junction Connector";
  }
  return "Junction Side Patch";
}

function laneFactMarkup(label: string, value: string | number | null | undefined): string {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return `
    <div class="scene-fact-card">
      <span class="scene-fact-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(text)}</strong>
    </div>
  `;
}

function buildLaneElementInspectorMarkup(
  annotation: ReferenceAnnotation,
  selection: LaneElementSelection,
  renderCornerConnectionCard: (target: SelectedStripCornerFamilyTarget) => string,
): string {
  const centerline = selection.centerlineId
    ? annotation.centerlines.find((item) => item.id === selection.centerlineId) ?? null
    : null;
  const strip = centerline && selection.stripId
    ? centerline.cross_section_strips.find((item) => item.strip_id === selection.stripId) ?? null
    : null;
  const junctionOverlays = deriveJunctionOverlayGeometries(annotation);
  const cornerFamilyTargets = selection.elementKind === "road_strip" && selection.centerlineId && selection.stripId
    ? selectedStripCornerFamilyTargets(junctionOverlays, selection.centerlineId, selection.stripId)
    : [];
  const fromLabel = selection.fromCenterlineId && selection.fromStripId
    ? `${selection.fromCenterlineId} · ${selection.fromStripId}`
    : "";
  const toLabel = selection.toCenterlineId && selection.toStripId
    ? `${selection.toCenterlineId} · ${selection.toStripId}`
    : "";
  const stripKind = strip?.kind ?? selection.stripKind;
  const stripZone = strip?.zone ?? selection.stripZone;
  const stripDirection = strip?.direction ?? selection.stripDirection;
  const widthM = strip?.width_m ?? selection.widthM;
  const ownerLabel = `${selection.ownerKind} · ${selection.ownerId}`;
  return `
    <section class="annotation-lane-inspect-section">
      <div class="annotation-cross-preview-header">
        <div>
          <h3>${escapeHtml(laneElementKindLabel(selection.elementKind))}</h3>
          <div class="scene-micro-note">${escapeHtml(selection.id)}</div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">read-only</span>
          ${selection.pointsCount !== undefined ? `<span class="annotation-cross-preview-stat">${selection.pointsCount} pts</span>` : ""}
        </div>
      </div>
      <div class="scene-inspector-grid">
        ${laneFactMarkup("Owner", ownerLabel)}
        ${laneFactMarkup("Element", laneElementKindLabel(selection.elementKind))}
        ${laneFactMarkup("Centerline", selection.centerlineId)}
        ${laneFactMarkup("Strip", selection.stripId)}
        ${laneFactMarkup("Strip Kind", stripKind ? metaurbanStripLabel(stripKind) : "")}
        ${laneFactMarkup("Zone", stripZone ? stripZoneSideLabel(stripZone) : "")}
        ${laneFactMarkup("Direction", stripDirection ? stripDirectionChip({ direction: stripDirection } as AnnotatedCrossSectionStrip) : "")}
        ${laneFactMarkup("Width", widthM !== undefined ? `${widthM.toFixed(2)}m` : selection.widthPx !== undefined ? `${selection.widthPx.toFixed(1)}px` : "")}
        ${laneFactMarkup("Junction", selection.junctionId)}
        ${laneFactMarkup("Patch", selection.patchId)}
        ${laneFactMarkup("Patch Role", selection.patchRole)}
        ${laneFactMarkup("Paired Connector", selection.pairedConnectorId)}
        ${laneFactMarkup("Endpoint", selection.endpointRole)}
        ${laneFactMarkup("Connector", selection.connectorId)}
        ${laneFactMarkup("Link", selection.linkId)}
        ${laneFactMarkup("Quadrant", selection.quadrantId)}
        ${laneFactMarkup("Kernel", selection.kernelId)}
        ${laneFactMarkup("From", fromLabel)}
        ${laneFactMarkup("To", toLabel)}
        ${laneFactMarkup("Points", selection.pointsCount)}
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Editing</span>
          <strong>This lane element is diagnostic geometry. Select its owning road or junction to edit source data.</strong>
        </div>
      </div>
      ${
        cornerFamilyTargets.length > 0
          ? `
            <div class="annotation-corner-link-section">
              <div class="annotation-corner-link-header">
                <div>
                  <strong>Corner Family</strong>
                  <div class="scene-micro-note">${escapeHtml(selection.centerlineId ?? "")} · ${escapeHtml(selection.stripId ?? "")}</div>
                </div>
                <span class="annotation-cross-preview-stat">${cornerFamilyTargets.length} linked</span>
              </div>
              <div class="annotation-corner-link-list">
                ${cornerFamilyTargets.map((target) => renderCornerConnectionCard(target)).join("")}
              </div>
            </div>
          `
          : ""
      }
    </section>
  `;
}

function buildRoadCollectionInspectorMarkup(
  annotation: ReferenceAnnotation,
  clippedCenterlineDisplaySegments: (
    centerline: AnnotatedCenterline,
    junctionOverlays: DerivedJunctionOverlay[],
    ppm: number,
  ) => ClippedDisplaySegment[],
): string {
  const roads = annotation.centerlines;
  const ppm = Math.max(annotation.pixels_per_meter, 1e-6);
  const junctionOverlays = deriveJunctionOverlayGeometries(annotation);
  const totalLengthM = roads.reduce((sum, centerline) => {
    return (
      sum +
      (clippedCenterlineDisplaySegments(centerline, junctionOverlays, ppm).reduce(
        (segmentSum, segment) => segmentSum + polylineLength(segment.points),
        0,
      ) /
        ppm)
    );
  }, 0);
  const detailedRoadCount = roads.filter((item) => resolvedCrossSectionMode(item) === CROSS_SECTION_MODE_DETAILED).length;
  const coarseRoadCount = roads.length - detailedRoadCount;
  const averageWidthM =
    roads.length > 0
      ? roads.reduce((sum, centerline) => sum + getCenterlineCrossSectionWidth(centerline), 0) / roads.length
      : 0;
  const averageDriveLanes =
    roads.length > 0
      ? roads.reduce((sum, centerline) => sum + deriveLaneProfile(centerline).total_drive_lane_count, 0) / roads.length
      : 0;
  const roadList = roads
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((centerline) => escapeHtml(centerline.id))
    .join(" · ");
  return `
    <section class="annotation-cross-preview-section">
      <div class="annotation-cross-preview-header">
        <div>
          <h3>All Roads</h3>
          <div class="scene-micro-note">aggregated road selection</div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">${roads.length} roads</span>
          <span class="annotation-cross-preview-stat">${detailedRoadCount} detailed</span>
        </div>
      </div>
      <div class="scene-inspector-grid">
        <div class="scene-fact-card">
          <span class="scene-fact-label">Road Count</span>
          <strong>${roads.length}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Detailed</span>
          <strong>${detailedRoadCount}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Coarse</span>
          <strong>${coarseRoadCount}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Total Length</span>
          <strong>${totalLengthM.toFixed(1)}m</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Average Width</span>
          <strong>${averageWidthM.toFixed(2)}m</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Average Drive Lanes</span>
          <strong>${averageDriveLanes.toFixed(1)}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Total Strips</span>
          <strong>${roads.reduce((sum, centerline) => sum + centerline.cross_section_strips.length, 0)}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Total Furniture</span>
          <strong>${roads.reduce((sum, centerline) => sum + centerline.street_furniture_instances.length, 0)}</strong>
        </div>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Road IDs</span>
          <strong>${roadList || "No roads yet."}</strong>
        </div>
      </div>
    </section>
  `;
}

export { buildLaneElementInspectorMarkup, buildRoadCollectionInspectorMarkup };
