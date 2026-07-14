import "./styles/scene-graph.css";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";

import type {
  AnnotationPoint,
  BezierCurve3,
  CrossSectionMode,
  StripZone,
  StripDirection,
  StripKind,
  FurnitureKind,
  AnnotatedCrossSectionStrip,
  AnnotatedStreetFurnitureInstance,
  ZoneFurnitureInstance,
  AnnotatedCenterline,
  LaneProfile,
  AnnotatedMarker,
  AnnotatedJunction,
  AnnotatedRoundabout,
  AnnotatedBuildingRegion,
  AnnotatedFunctionalZone,
  AnnotatedRegion,
  AnnotatedSurfaceAnnotation,
  AnnotatedStationStripPatch,
  RegionRole,
  JunctionArmKey,
  JunctionComposition,
  JunctionLaneSurface,
  JunctionMergedSurface,
  JunctionQuadrantBezierPatch,
  JunctionQuadrantComposition,
  JunctionQuadrantSkeletonLine,
  JunctionSurfaceEdge,
  JunctionSurfaceNode,
  JunctionSurfaceNodeKind,
  ReferenceAnnotation,
  ReferencePlan,
  ReferencePlansPayload,
  ConvertedGraphPayload,
  PreviewCrossSection,
  BranchSnapTarget,
  BranchDraft,
  CrossDraft,
  AnnotationModelIssue,
  DerivedJunctionOverlayPatch,
  DerivedJunctionOverlayBoundary,
  JunctionOverlayFootPoint,
  JunctionOverlayControlPoint,
  JunctionOverlayCornerFocus,
  JunctionOverlayGuideLine,
  JunctionOverlayCornerKernel,
  DerivedJunctionOverlayConnectorLine,
  DerivedJunctionOverlayFusedStrip,
  JunctionOverlayStripLinkEndpoint,
  JunctionOverlayStripLink,
  DerivedJunctionOverlay,
  DerivedJunctionOverlayArm,
  ClippedDisplaySegment,
  MetaurbanAssetBadge,
  LaneElementKind,
  LaneElementSelection,
  Tool,
  Selection,
  BuildingRegionResizeHandle,
  DragState,
  StatusTone,
  SelectedStripCornerConnection,
  SelectedStripCornerFamilyTarget,
  OffsetPolylineSegment,
  SideStripLayoutEntry,
  SideStripLayouts,
  SurfaceEdgeKind,
  SurfaceFlow,
  SurfaceRole,
  SurfaceAnnotationKind,
  SurfaceProvenance,
} from "./sg-types";

import {
  ALL_ROADS_SELECTION_ID,
  API_BASE,
  ANNOTATION_SCHEMA_VERSION,
  BRANCH_MIN_LENGTH_M,
  BRANCH_SNAP_TOLERANCE_PX,
  BRANCH_VERTEX_REUSE_TOLERANCE_PX,
  BUILDING_REGION_HANDLE_RADIUS_PX,
  BUILDING_REGION_MIN_SIZE_PX,
  BUILDING_REGION_ROTATE_HANDLE_OFFSET_PX,
  CENTER_STRIP_KINDS,
  CORNER_LINK_STRIP_KINDS,
  CROSS_MIN_HALF_LENGTH_M,
  CROSS_SECTION_MODE_COARSE,
  CROSS_SECTION_MODE_DETAILED,
  DEFAULT_DRIVE_LANE_WIDTH_M,
  DEFAULT_SURFACE_MATERIAL_BY_KIND,
  DEFAULT_SURFACE_ROLE_BY_KIND,
  DEFAULT_FORWARD_DRIVE_LANE_COUNT,
  DEFAULT_PIXELS_PER_METER,
  DEFAULT_REVERSE_DRIVE_LANE_COUNT,
  DEFAULT_ROUNDABOUT_RADIUS_PX,
  DEFAULT_SEGMENT_LENGTH_M,
  DEFAULT_SIDEWALK_WIDTH_M,
  FALLBACK_REFERENCE_PLAN,
  FUNCTIONAL_ZONE_KINDS,
  FUNCTIONAL_ZONE_KIND_LABELS,
  FURNITURE_COMPATIBLE_STRIP_KINDS,
  FURNITURE_KINDS,
  FURNITURE_KIND_LABELS,
  METAAURBAN_ASSET_GUIDE_LINES,
  METAAURBAN_STRIP_ASSET_BADGES,
  METAAURBAN_STRIP_GUIDANCE,
  METAAURBAN_STRIP_ZONE_LABELS,
  NOMINAL_STRIP_WIDTHS,
  SIDE_STRIP_KINDS,
  STANDALONE_CROSS_ARM_LENGTH_M,
  STRIP_DIRECTION_OPTIONS,
  STRIP_KIND_LABELS,
  SURFACE_ANNOTATION_KINDS,
  SURFACE_ANNOTATION_KIND_LABELS,
  SURFACE_ROLE_LABELS,
  SURFACE_ROLES,
} from "./sg-constants";
import {
  asNonNegativeInt,
  asNullableNumber,
  asNumber,
  asString,
  clamp,
  cloneCenterlineForBranch,
  clonePoint,
  createDefaultAnnotatedCenterline,
  createExplicitJunction,
  deriveLaneProfile,
  ensureDetailedCrossSection,
  ensureDetailedCrossSections,
  endpointJunctionIdAtPoint,
  findNearestBranchSnapTarget,
  formatCrossSectionSummary,
  formatLaneSummary,
  getCenterlineCarriagewayWidth,
  insertSharedVertexAtSnap,
  isFurnitureKind,
  isFunctionalZoneKind,
  isStripDirection,
  isStripKind,
  isStripZone,
  isSurfaceAnnotationKind,
  isSurfaceRole,
  junctionAnchorPoint,
  laneProfile,
  linkedCrossStripKeys,
  lineIntersectionTs,
  offsetPolyline,
  pointDistance,
  polylineLength,
  projectPointOntoPolyline,
  registerCenterlineWithExplicitJunction,
  replaceCenterlineReference,
  reserveNextFeatureIds,
  resolveDriveLaneDefaults,
  resolvedCrossSectionMode,
  selectedStripCornerConnections,
  selectedStripCornerFamilyTargets,
  snapDraftCenterlineEndpointsToExplicitJunctions,
  sortedCrossSectionStrips,
  splitCenterlineAtSnap,
  stationToPolylinePoint,
  stripCenterOffsetMeters,
  stripKey,
  syncCenterlineDerivedFields,
  updateJunctionConnectedCenterlines,
  validateAnnotationForExplicitJunctionModel,
  validateDraftCenterlinePlacement,
} from "./sg-utils";
import {
  buildingRegionLocalPoint,
  buildingRegionPolygonPoints,
  buildingRegionResizeHandlePoint,
  buildingRegionRotateHandlePoint,
  buildBuildingRegionFromDraft,
  functionalZonePolygonPoints,
  functionalZoneCentroid,
  centerlineSideStripLayouts,
  crossAxisNormalAtSnap,
  deriveExplicitJunctionOverlayGeometries,
  deriveJunctionOverlayGeometries,
  derivedJunctionKindLabel,
  getJunctionOverlay,
  junctionProfileWidths,
  pointOnAxis,
  rectanglePolygonPoints,
  sampleBezierPoints,
  stripDisplayPoint,
} from "./sg-geometry";

// Unified UI components
import type { DesktopShell } from "./desktop-shell";
import {
  collectSceneGraphElements,
  createSceneGraphLeftSections,
  createSceneGraphRightTabs,
  createSceneGraphStageHtml,
  createSceneGraphStatusHtml,
  buildAnnotationSummaryMarkup,
  buildFeatureTableMarkup,
  buildGraphSummaryMarkup,
  buildBuildingRegionInspectorMarkup,
  buildFunctionalZoneInspectorMarkup,
  buildJunctionInspectorMarkup,
  buildLaneElementInspectorMarkup,
  buildRegionInspectorMarkup,
  buildRoadCollectionInspectorMarkup,
  buildSurfaceAnnotationInspectorMarkup,
  buildBuildingRegionOverlayMarkup,
  buildFunctionalZoneOverlayMarkup,
  buildRegionOverlayMarkup,
  buildStationStripPatchOverlayMarkup,
  buildSurfaceAnnotationOverlayMarkup,
  buildCenterlineOverlayMarkup,
  buildDerivedJunctionOverlayMarkup,
  buildManualJunctionCompositionOverlayMarkup,
  buildingRegionHandleFromTarget,
  clippedCenterlineDisplaySegments,
  cornerConnectionLabel,
  createEmptyAnnotation,
  featureHitFromTarget,
  getFeatureCount,
  getDisplayCenterlineWidthPx,
  getSelectedFeature,
  hitFromTarget,
  laneElementRelatedStripKeys,
  laneHitFromTarget,
  metaurbanStripLabel,
  nextFeatureId,
  selectedLaneElement,
  stripStrokeColor,
  stringifyAnnotation,
} from "./scene-graph/index";
import { sleep } from "./viewer-api";
import { VIEWER_LANGUAGE_EVENT, applyViewerTranslations, loadViewerLanguage, translateViewerKey, translateViewerLiteral } from "./viewer-i18n";
import type { ScenarioDesign, ScenarioDesignCatalogPayload } from "./viewer-types";
import type { WorkflowController } from "./workflow-controller";
import {
  extractSceneSource,
  loadOsmSceneSource,
  loadSceneJob,
  loadWorkflowCapabilities,
  normalizeSceneSource,
  submitWorkflowSceneJob,
  toNormalizedSceneSource,
} from "./workflow-api";
import type {
  NormalizedSceneSourceResponse,
  SourceImageReference,
  Wgs84Bbox,
} from "./workflow-api";

const DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE = "Loading default reference plan...";
const ANNOTATION_MIN_ZOOM = 0.25;
const ANNOTATION_MAX_ZOOM = 6;
const ANNOTATION_ZOOM_STEP = 1.25;

type SceneGraphStatusText = string | {
  key: string;
  fallback?: string;
};

type ScenarioReferenceAnnotationPayload = {
  scenario_id: string;
  graph_template_id: string;
  preview_layout_path?: string;
  scenario?: ScenarioDesign;
  annotation: ReferenceAnnotation;
  summary?: Record<string, unknown>;
};

function nextStripId(centerline: AnnotatedCenterline, zone: StripZone): string {
  const used = new Set(centerline.cross_section_strips.map((strip) => strip.strip_id));
  let counter = centerline.cross_section_strips.filter((strip) => strip.zone === zone).length + 1;
  while (true) {
    const candidate = `${zone}_${String(counter).padStart(2, "0")}`;
    if (!used.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

function splitAuxiliaryCountAcrossDirections(
  total: number,
  forwardDriveLaneCount: number,
  reverseDriveLaneCount: number,
): { reverse: number; forward: number } {
  if (forwardDriveLaneCount > 0 && reverseDriveLaneCount > 0) {
    return {
      reverse: Math.ceil(total / 2),
      forward: Math.floor(total / 2),
    };
  }
  if (reverseDriveLaneCount > 0) {
    return { reverse: total, forward: 0 };
  }
  return { reverse: 0, forward: total };
}

function nominalSeedCrossSectionWidthForCounts(
  forwardDriveLaneCount: number,
  reverseDriveLaneCount: number,
  bikeLaneCount: number,
  busLaneCount: number,
  parkingLaneCount: number,
): number {
  const parkingSplit = splitAuxiliaryCountAcrossDirections(
    Math.max(0, parkingLaneCount),
    Math.max(0, forwardDriveLaneCount),
    Math.max(0, reverseDriveLaneCount),
  );
  const bikeSplit = splitAuxiliaryCountAcrossDirections(
    Math.max(0, bikeLaneCount),
    Math.max(0, forwardDriveLaneCount),
    Math.max(0, reverseDriveLaneCount),
  );
  const busSplit = splitAuxiliaryCountAcrossDirections(
    Math.max(0, busLaneCount),
    Math.max(0, forwardDriveLaneCount),
    Math.max(0, reverseDriveLaneCount),
  );
  const sideWidth =
    2 *
    (NOMINAL_STRIP_WIDTHS.nearroad_furnishing +
      NOMINAL_STRIP_WIDTHS.clear_sidewalk +
      NOMINAL_STRIP_WIDTHS.frontage_reserve);
  const centerWidth =
    (Math.max(0, reverseDriveLaneCount) + Math.max(0, forwardDriveLaneCount)) * NOMINAL_STRIP_WIDTHS.drive_lane +
    (parkingSplit.reverse + parkingSplit.forward) * NOMINAL_STRIP_WIDTHS.parking_lane +
    (bikeSplit.reverse + bikeSplit.forward) * NOMINAL_STRIP_WIDTHS.bike_lane +
    (busSplit.reverse + busSplit.forward) * NOMINAL_STRIP_WIDTHS.bus_lane +
    (forwardDriveLaneCount > 0 && reverseDriveLaneCount > 0 ? NOMINAL_STRIP_WIDTHS.median : 0);
  return Number((sideWidth + centerWidth).toFixed(3));
}

function nominalSeedCrossSectionWidth(centerline: AnnotatedCenterline): number {
  return nominalSeedCrossSectionWidthForCounts(
    centerline.forward_drive_lane_count,
    centerline.reverse_drive_lane_count,
    centerline.bike_lane_count,
    centerline.bus_lane_count,
    centerline.parking_lane_count,
  );
}

function seedDetailedCrossSection(centerline: AnnotatedCenterline): AnnotatedCrossSectionStrip[] {
  const leftAux = {
    parking: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.parking_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).reverse,
    bike: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.bike_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).reverse,
    bus: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.bus_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).reverse,
  };
  const rightAux = {
    parking: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.parking_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).forward,
    bike: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.bike_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).forward,
    bus: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.bus_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).forward,
  };
  const strips: AnnotatedCrossSectionStrip[] = [];

  const pushStrip = (zone: StripZone, kind: StripKind, direction: StripDirection): void => {
    strips.push({
      strip_id: nextStripId({ ...centerline, cross_section_strips: strips }, zone),
      zone,
      kind,
      width_m: NOMINAL_STRIP_WIDTHS[kind],
      direction,
      order_index: strips.filter((strip) => strip.zone === zone).length,
    });
  };

  pushStrip("left", "nearroad_furnishing", "none");
  pushStrip("left", "clear_sidewalk", "none");
  pushStrip("left", "frontage_reserve", "none");
  pushStrip("right", "nearroad_furnishing", "none");
  pushStrip("right", "clear_sidewalk", "none");
  pushStrip("right", "frontage_reserve", "none");

  for (let index = 0; index < leftAux.parking; index += 1) {
    pushStrip("center", "parking_lane", "reverse");
  }
  for (let index = 0; index < leftAux.bike; index += 1) {
    pushStrip("center", "bike_lane", "reverse");
  }
  for (let index = 0; index < leftAux.bus; index += 1) {
    pushStrip("center", "bus_lane", "reverse");
  }
  for (let index = 0; index < Math.max(0, centerline.reverse_drive_lane_count); index += 1) {
    pushStrip("center", "drive_lane", "reverse");
  }
  if (centerline.forward_drive_lane_count > 0 && centerline.reverse_drive_lane_count > 0) {
    pushStrip("center", "median", "none");
  }
  for (let index = 0; index < Math.max(0, centerline.forward_drive_lane_count); index += 1) {
    pushStrip("center", "drive_lane", "forward");
  }
  for (let index = 0; index < rightAux.bus; index += 1) {
    pushStrip("center", "bus_lane", "forward");
  }
  for (let index = 0; index < rightAux.bike; index += 1) {
    pushStrip("center", "bike_lane", "forward");
  }
  for (let index = 0; index < rightAux.parking; index += 1) {
    pushStrip("center", "parking_lane", "forward");
  }

  const nominalTotalWidth = strips.reduce((sum, strip) => sum + strip.width_m, 0);
  const targetWidth = Math.max(1, centerline.road_width_m || nominalTotalWidth);
  const scale = nominalTotalWidth > 0 ? targetWidth / nominalTotalWidth : 1;
  return strips.map((strip) => ({
    ...strip,
    width_m: Number((strip.width_m * scale).toFixed(3)),
  }));
}

function normalizeCrossSectionStrip(value: unknown, index: number, prefix: string): AnnotatedCrossSectionStrip {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const zone = asString(record.zone, "center");
  const kind = asString(record.kind, "drive_lane");
  const direction = asString(record.direction, "none");
  const normalized: AnnotatedCrossSectionStrip = {
    strip_id: asString(record.strip_id, `${prefix}_strip_${String(index + 1).padStart(2, "0")}`),
    zone: isStripZone(zone) ? zone : "center",
    kind: isStripKind(kind) ? kind : "drive_lane",
    width_m: Math.max(0.1, asNumber(record.width_m, 1)),
    direction: isStripDirection(direction) ? direction : "none",
    order_index: Math.max(0, Math.round(asNumber(record.order_index, index))),
  };
  if (normalized.zone === "center" && !CENTER_STRIP_KINDS.has(normalized.kind)) {
    normalized.kind = "drive_lane";
  }
  if ((normalized.zone === "left" || normalized.zone === "right") && !SIDE_STRIP_KINDS.has(normalized.kind)) {
    normalized.kind = "nearroad_furnishing";
  }
  if (SIDE_STRIP_KINDS.has(normalized.kind) || normalized.kind === "median") {
    normalized.direction = "none";
  }
  return normalized;
}

function normalizeStreetFurnitureInstance(
  value: unknown,
  index: number,
  centerlineId: string,
): AnnotatedStreetFurnitureInstance {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const kind = asString(record.kind, "bench");
  return {
    instance_id: asString(record.instance_id ?? record.id, `${centerlineId}_furniture_${String(index + 1).padStart(2, "0")}`),
    centerline_id: asString(record.centerline_id, centerlineId),
    strip_id: asString(record.strip_id, ""),
    kind: isFurnitureKind(kind) ? kind : "bench",
    station_m: Math.max(0, asNumber(record.station_m, 0)),
    lateral_offset_m: asNumber(record.lateral_offset_m, 0),
    yaw_deg: asNullableNumber(record.yaw_deg),
  };
}

function getReferenceWidthMeters(centerline: AnnotatedCenterline, pixelsPerMeter: number): number | null {
  if (centerline.reference_width_px === null) {
    return null;
  }
  return centerline.reference_width_px / Math.max(pixelsPerMeter, 0.0001);
}

function previewCrossSection(centerline: AnnotatedCenterline): PreviewCrossSection {
  if (resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED && centerline.cross_section_strips.length > 0) {
    return {
      sourceMode: "detailed",
      strips: sortedCrossSectionStrips(centerline.cross_section_strips),
    };
  }
  return {
    sourceMode: "seed",
    strips: seedDetailedCrossSection(centerline),
  };
}

function crossSectionPreviewDisplayOrder(strips: AnnotatedCrossSectionStrip[]): AnnotatedCrossSectionStrip[] {
  const sorted = sortedCrossSectionStrips(strips);
  const left = sorted.filter((strip) => strip.zone === "left").reverse();
  const center = sorted.filter((strip) => strip.zone === "center");
  const right = sorted.filter((strip) => strip.zone === "right");
  return [...left, ...center, ...right];
}

function metaurbanStripZoneLabel(kind: StripKind): string {
  return METAAURBAN_STRIP_ZONE_LABELS[kind] || kind;
}

function metaurbanAssetBadges(kind: StripKind): MetaurbanAssetBadge[] {
  return METAAURBAN_STRIP_ASSET_BADGES[kind] || [];
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

function stripPreviewFillColor(kind: StripKind): string {
  switch (kind) {
    case "drive_lane":
      return "rgba(66, 74, 87, 0.16)";
    case "bus_lane":
      return "rgba(183, 72, 58, 0.18)";
    case "bike_lane":
      return "rgba(57, 135, 90, 0.18)";
    case "parking_lane":
      return "rgba(166, 130, 86, 0.18)";
    case "median":
      return "rgba(110, 122, 95, 0.16)";
    case "nearroad_buffer":
      return "rgba(152, 152, 152, 0.16)";
    case "nearroad_furnishing":
      return "rgba(126, 101, 71, 0.18)";
    case "clear_sidewalk":
      return "rgba(235, 224, 206, 0.94)";
    case "farfromroad_buffer":
      return "rgba(169, 188, 202, 0.18)";
    case "frontage_reserve":
      return "rgba(183, 212, 230, 0.24)";
    case "grass_belt":
      return "rgba(100, 150, 80, 0.22)";
    case "shared_street_surface":
      return "rgba(180, 160, 140, 0.20)";
    case "colored_pavement":
      return "rgba(200, 175, 150, 0.20)";
    default:
      return "rgba(102, 102, 102, 0.12)";
  }
}

function buildMetaurbanAssetBadgeMarkup(
  kind: StripKind,
  options: {
    emptyMode?: "note" | "omit";
  } = {},
): string {
  const { emptyMode = "omit" } = options;
  const badges = metaurbanAssetBadges(kind);
  if (!badges.length) {
    return emptyMode === "note"
      ? `<span class="scene-micro-note">No MetaUrban asset hints for this strip.</span>`
      : "";
  }
  return `
    <div class="annotation-metaurban-badge-row">
      ${badges
        .map(
          (badge) => `
            <span class="annotation-metaurban-badge" data-asset-key="${escapeHtml(badge.key)}" title="${escapeHtml(badge.label)}">
              ${escapeHtml(badge.shortLabel)}
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveApiUrl(path: string): string {
  if (/^(https?|blob|data):/i.test(path)) {
    return path;
  }
  if (!path) {
    return "";
  }
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readApiErrorDetail(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json() as { detail?: unknown; error?: unknown };
    const detail = payload.detail ?? payload.error;
    return detail == null ? "" : String(detail);
  } catch {
    try {
      return await response.clone().text();
    } catch {
      return "";
    }
  }
}


function normalizePoint(value: unknown): AnnotationPoint {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    x: asNumber(record.x, 0),
    y: asNumber(record.y, 0),
  };
}

function normalizeCenterline(value: unknown, index: number): AnnotatedCenterline {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawPoints = Array.isArray(record.points) ? record.points : [];
  const driveLaneDefaults = resolveDriveLaneDefaults(record);
  const bikeLaneCount = asNonNegativeInt(record.bike_lane_count, 0);
  const busLaneCount = asNonNegativeInt(record.bus_lane_count, 0);
  const parkingLaneCount = asNonNegativeInt(record.parking_lane_count, 0);
  const referenceWidthPx = asNullableNumber(record.reference_width_px);
  const id = asString(record.id, `centerline_${String(index + 1).padStart(2, "0")}`);
  const crossSectionStrips = Array.isArray(record.cross_section_strips)
    ? record.cross_section_strips.map((item, stripIndex) => normalizeCrossSectionStrip(item, stripIndex, id))
    : [];
  const streetFurnitureInstances = Array.isArray(record.street_furniture_instances)
    ? record.street_furniture_instances.map((item, furnitureIndex) => normalizeStreetFurnitureInstance(item, furnitureIndex, id))
    : [];
  const centerline: AnnotatedCenterline = {
    id,
    label: asString(record.label, asString(record.id, `Centerline ${index + 1}`)),
    points: rawPoints.map((item) => normalizePoint(item)),
    road_width_m: Math.max(
      1,
      asNumber(
        record.road_width_m,
        nominalSeedCrossSectionWidthForCounts(
          driveLaneDefaults.forward_drive_lane_count,
          driveLaneDefaults.reverse_drive_lane_count,
          bikeLaneCount,
          busLaneCount,
          parkingLaneCount,
        ),
      ),
    ),
    reference_width_px: referenceWidthPx === null ? null : Math.max(1, referenceWidthPx),
    forward_drive_lane_count: driveLaneDefaults.forward_drive_lane_count,
    reverse_drive_lane_count: driveLaneDefaults.reverse_drive_lane_count,
    bike_lane_count: bikeLaneCount,
    bus_lane_count: busLaneCount,
    parking_lane_count: parkingLaneCount,
    highway_type: asString(record.highway_type, "annotated_centerline"),
    cross_section_mode:
      asString(record.cross_section_mode, crossSectionStrips.length > 0 ? CROSS_SECTION_MODE_DETAILED : CROSS_SECTION_MODE_COARSE) ===
      CROSS_SECTION_MODE_DETAILED
        ? CROSS_SECTION_MODE_DETAILED
        : CROSS_SECTION_MODE_COARSE,
    cross_section_strips: sortedCrossSectionStrips(crossSectionStrips),
    street_furniture_instances: streetFurnitureInstances,
    start_junction_id: asString(record.start_junction_id, ""),
    end_junction_id: asString(record.end_junction_id, ""),
  };
  syncCenterlineDerivedFields(centerline);
  return centerline;
}

function normalizeMarker(
  value: unknown,
  index: number,
  kindFallback: string,
): AnnotatedMarker {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = asString(record.id, `${kindFallback}_${String(index + 1).padStart(2, "0")}`);
  return {
    id,
    label: asString(record.label, id),
    x: asNumber(record.x, 0),
    y: asNumber(record.y, 0),
    kind: asString(record.kind, kindFallback),
  };
}

function normalizeJunction(value: unknown, index: number): AnnotatedJunction {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const anchorRecord = record.anchor && typeof record.anchor === "object" ? (record.anchor as Record<string, unknown>) : null;
  const id = asString(record.id, `junction_${String(index + 1).padStart(2, "0")}`);
  const rawConnectedIds = Array.isArray(record.connected_centerline_ids) ? record.connected_centerline_ids : [];
  const connectedCenterlineIds = rawConnectedIds.map((item) => asString(item, "")).filter((item) => Boolean(item));
  const sourceMode =
    connectedCenterlineIds.length > 0 || anchorRecord
      ? "explicit"
      : asString(record.source_mode, "legacy_marker") === "explicit"
        ? "explicit"
        : "legacy_marker";
  return {
    id,
    label: asString(record.label, id),
    x: asNumber(record.x, anchorRecord ? asNumber(anchorRecord.x, 0) : 0),
    y: asNumber(record.y, anchorRecord ? asNumber(anchorRecord.y, 0) : 0),
    kind: asString(record.kind, sourceMode === "explicit" ? "t_junction" : "intersection"),
    connected_centerline_ids: [...new Set(connectedCenterlineIds)],
    crosswalk_depth_m: Math.max(0.5, asNumber(record.crosswalk_depth_m, 3)),
    source_mode: sourceMode,
  };
}

function normalizeRoundabout(value: unknown, index: number): AnnotatedRoundabout {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = asString(record.id, `roundabout_${String(index + 1).padStart(2, "0")}`);
  return {
    id,
    label: asString(record.label, id),
    x: asNumber(record.x, 0),
    y: asNumber(record.y, 0),
    radius_px: Math.max(8, asNumber(record.radius_px, DEFAULT_ROUNDABOUT_RADIUS_PX)),
  };
}

function normalizeBuildingRegion(value: unknown, index: number): AnnotatedBuildingRegion {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const centerRecord =
    record.center_px && typeof record.center_px === "object"
      ? (record.center_px as Record<string, unknown>)
      : null;
  const id = asString(record.id, `building_region_${String(index + 1).padStart(2, "0")}`);
  return {
    id,
    label: asString(record.label, id),
    center_px: {
      x: asNumber(centerRecord?.x ?? record.x, 0),
      y: asNumber(centerRecord?.y ?? record.y, 0),
    },
    width_px: Math.max(1, asNumber(record.width_px, 64)),
    height_px: Math.max(1, asNumber(record.height_px, 48)),
    yaw_deg: normalizeAngleDeg(asNumber(record.yaw_deg, 0)),
  };
}

function normalizeFunctionalZone(value: unknown, index: number): AnnotatedFunctionalZone {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = asString(record.id, `functional_zone_${String(index + 1).padStart(2, "0")}`);
  const kind = asString(record.kind, "plaza");
  const rawPoints = Array.isArray(record.points) ? record.points : [];
  const rawFurniture = Array.isArray(record.furniture_instances) ? record.furniture_instances : [];
  return {
    id,
    label: asString(record.label, id),
    kind: isFunctionalZoneKind(kind) ? kind : "plaza",
    points: rawPoints.map((item) => normalizePoint(item)),
    furniture_instances: rawFurniture.map((item, i) => normalizeZoneFurnitureInstance(item, i, id)),
  };
}

function isRegionRole(value: string): value is RegionRole {
  return value === "scene_region" || value === "building_region" || value === "functional_zone";
}

function normalizeRegion(value: unknown, index: number, fallbackRole: RegionRole = "scene_region"): AnnotatedRegion {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = asString(record.id, `region_${String(index + 1).padStart(2, "0")}`);
  const role = asString(record.region_role ?? record.role, fallbackRole);
  const rawPoints = Array.isArray(record.points) ? record.points : [];
  const rawMaterial = record.material && typeof record.material === "object"
    ? (record.material as Record<string, unknown>)
    : undefined;
  const side = record.side === undefined ? undefined : asString(record.side, "");
  return {
    id,
    label: asString(record.label, id),
    region_role: isRegionRole(role) ? role : fallbackRole,
    points: rawPoints.map((item) => normalizePoint(item)),
    kind: record.kind === undefined ? undefined : asString(record.kind, ""),
    land_use_type: record.land_use_type === undefined ? undefined : asString(record.land_use_type, ""),
    source_region_id: record.source_region_id === undefined ? undefined : asString(record.source_region_id, ""),
    derived: Boolean(record.derived),
    material: rawMaterial,
    area_m2: record.area_m2 === undefined ? undefined : asNumber(record.area_m2, 0),
    nearest_centerline_id: record.nearest_centerline_id === undefined ? undefined : asString(record.nearest_centerline_id, ""),
    nearest_centerline_distance_m: record.nearest_centerline_distance_m === undefined ? undefined : asNumber(record.nearest_centerline_distance_m, 0),
    side,
    derivation_status: record.derivation_status === undefined ? undefined : asString(record.derivation_status, ""),
    polygon_xz: Array.isArray(record.polygon_xz)
      ? record.polygon_xz
          .filter((item): item is unknown[] => Array.isArray(item))
          .map((item) => [asNumber(item[0], 0), asNumber(item[1], 0)])
      : undefined,
  };
}

function normalizeSurfaceAnnotationKind(value: unknown): SurfaceAnnotationKind {
  const kind = asString(value, "paving_zone");
  return isSurfaceAnnotationKind(kind) ? kind : "paving_zone";
}

function normalizeSurfaceRole(value: unknown, kind: SurfaceAnnotationKind): SurfaceRole {
  const role = asString(value, DEFAULT_SURFACE_ROLE_BY_KIND[kind]);
  return isSurfaceRole(role) ? role : DEFAULT_SURFACE_ROLE_BY_KIND[kind];
}

function normalizeSurfaceMaterial(value: unknown, kind: SurfaceAnnotationKind): AnnotatedSurfaceAnnotation["material"] {
  const fallbackPreset = DEFAULT_SURFACE_MATERIAL_BY_KIND[kind];
  if (typeof value === "string") {
    return { preset: asString(value, fallbackPreset) };
  }
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const colorHex = asString(record.color_hex, "");
  const textureKey = asString(record.texture_key, "");
  return {
    preset: asString(record.preset, fallbackPreset),
    ...(colorHex ? { color_hex: colorHex.startsWith("#") ? colorHex : `#${colorHex}` } : {}),
    ...(textureKey ? { texture_key: textureKey } : {}),
  };
}

function normalizeSurfaceAnnotation(value: unknown, index: number): AnnotatedSurfaceAnnotation {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const kind = normalizeSurfaceAnnotationKind(record.kind);
  const id = asString(record.id ?? record.feature_id, `surface_${String(index + 1).padStart(2, "0")}`);
  return {
    id,
    label: asString(record.label, id),
    kind,
    surface_role: normalizeSurfaceRole(record.surface_role, kind),
    centerline_id: asString(record.centerline_id, ""),
    station_start_m: Math.max(0, asNumber(record.station_start_m, 0)),
    station_end_m: Math.max(0, asNumber(record.station_end_m, 6)),
    lateral_start_m: asNumber(record.lateral_start_m, 0),
    lateral_end_m: asNumber(record.lateral_end_m, 3.5),
    material: normalizeSurfaceMaterial(record.material, kind),
  };
}

function normalizeStationStripPatch(value: unknown, index: number): AnnotatedStationStripPatch {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const updatesRecord = record.updates && typeof record.updates === "object"
    ? (record.updates as Record<string, unknown>)
    : record;
  const rawKind = asString(updatesRecord.kind, "");
  const rawDirection = asString(updatesRecord.direction, "");
  const widthValue = updatesRecord.width_m;
  const updates: AnnotatedStationStripPatch["updates"] = {
    ...(isStripKind(rawKind) ? { kind: rawKind } : {}),
    ...(typeof widthValue === "number" || typeof widthValue === "string"
      ? { width_m: Math.max(0.05, asNumber(widthValue, 0.05)) }
      : {}),
    ...(isStripDirection(rawDirection) ? { direction: rawDirection } : {}),
  };
  const id = asString(record.id ?? record.feature_id, `station_strip_patch_${String(index + 1).padStart(2, "0")}`);
  return {
    id,
    label: asString(record.label, id),
    centerline_id: asString(record.centerline_id, ""),
    strip_id: asString(record.strip_id, ""),
    station_start_m: Math.max(0, asNumber(record.station_start_m, 0)),
    station_end_m: Math.max(0, asNumber(record.station_end_m, 1)),
    updates,
  };
}

function normalizeBezierCurve(value: unknown): BezierCurve3 {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    start: normalizePoint(record.start ?? record.start_xy ?? record.startPoint),
    end: normalizePoint(record.end ?? record.end_xy ?? record.endPoint),
    control1: normalizePoint(record.control1 ?? record.control_1 ?? record.c1 ?? record.controlPoint1),
    control2: normalizePoint(record.control2 ?? record.control_2 ?? record.c2 ?? record.controlPoint2),
  };
}

function normalizeSurfaceNodeKind(value: unknown): JunctionSurfaceNodeKind {
  const kind = asString(value, "custom");
  return kind === "start_left" || kind === "start_right" || kind === "end_right" || kind === "end_left"
    ? (kind as JunctionSurfaceNodeKind)
    : "custom";
}

function normalizeSurfaceEdgeKind(value: unknown): SurfaceEdgeKind {
  return asString(value, "line") === "bezier" ? "bezier" : "line";
}

function normalizeSurfaceFlow(value: unknown): SurfaceFlow {
  return asString(value, "inbound") === "outbound" ? "outbound" : "inbound";
}

function normalizeSurfaceProvenance(value: unknown): SurfaceProvenance {
  const provenance = asString(value, "generated");
  return provenance === "manual" || provenance === "merged" ? provenance : "generated";
}

function normalizeArmKey(value: unknown): JunctionArmKey {
  const armKey = asString(value, "north");
  return armKey === "east" || armKey === "south" || armKey === "west" ? armKey : "north";
}

function normalizeStripKind(value: unknown): StripKind {
  const kind = asString(value, "clear_sidewalk");
  return isStripKind(kind) ? kind : "clear_sidewalk";
}

function normalizeJunctionCompositionKind(value: unknown): JunctionComposition["kind"] {
  const kind = asString(value, "cross_junction");
  return kind === "t_junction" || kind === "complex_junction" || kind === "cross_junction"
    ? kind
    : "cross_junction";
}

function normalizeSurfaceNode(value: unknown, index: number): JunctionSurfaceNode {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    nodeId: asString(record.nodeId ?? record.node_id, `node_${String(index + 1).padStart(2, "0")}`),
    kind: normalizeSurfaceNodeKind(record.kind),
    point: normalizePoint(record.point ?? record.xy ?? record.location),
  };
}

function normalizeSurfaceEdge(value: unknown, index: number): JunctionSurfaceEdge {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    edgeId: asString(record.edgeId ?? record.edge_id, `edge_${String(index + 1).padStart(2, "0")}`),
    startNodeId: asString(record.startNodeId ?? record.start_node_id, ""),
    endNodeId: asString(record.endNodeId ?? record.end_node_id, ""),
    kind: normalizeSurfaceEdgeKind(record.kind),
    curve: normalizeBezierCurve(record.curve),
  };
}

function normalizeLaneSurface(value: unknown, index: number): JunctionLaneSurface {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const nodes = Array.isArray(record.nodes) ? record.nodes.map((item, nodeIndex) => normalizeSurfaceNode(item, nodeIndex)) : [];
  const edges = Array.isArray(record.edges) ? record.edges.map((item, edgeIndex) => normalizeSurfaceEdge(item, edgeIndex)) : [];
  return {
    surfaceId: asString(record.surfaceId ?? record.surface_id, `lane_surface_${String(index + 1).padStart(2, "0")}`),
    laneId: asString(record.laneId ?? record.lane_id, ""),
    armKey: normalizeArmKey(record.armKey ?? record.arm_key),
    flow: normalizeSurfaceFlow(record.flow),
    laneIndex: Math.max(0, Math.floor(asNumber(record.laneIndex ?? record.lane_index, 0))),
    laneWidthM: Math.max(0.01, asNumber(record.laneWidthM ?? record.lane_width_m, 3.5)),
    skeletonId: asString(record.skeletonId ?? record.skeleton_id, ""),
    provenance: normalizeSurfaceProvenance(record.provenance),
    nodes,
    edges,
  };
}

function normalizeMergedSurface(value: unknown, index: number): JunctionMergedSurface {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const nodes = Array.isArray(record.nodes) ? record.nodes.map((item, nodeIndex) => normalizeSurfaceNode(item, nodeIndex)) : [];
  const edges = Array.isArray(record.edges) ? record.edges.map((item, edgeIndex) => normalizeSurfaceEdge(item, edgeIndex)) : [];
  const rawSurfaceIds = record.mergedFromSurfaceIds ?? record.merged_from_surface_ids;
  const rawLaneIds = record.mergedFromLaneIds ?? record.merged_from_lane_ids;
  return {
    surfaceId: asString(record.surfaceId ?? record.surface_id, `merged_surface_${String(index + 1).padStart(2, "0")}`),
    mergedFromSurfaceIds: Array.isArray(rawSurfaceIds) ? rawSurfaceIds.map((item) => asString(item, "")).filter(Boolean) : [],
    mergedFromLaneIds: Array.isArray(rawLaneIds) ? rawLaneIds.map((item) => asString(item, "")).filter(Boolean) : [],
    provenance: normalizeSurfaceProvenance(record.provenance),
    nodes,
    edges,
  };
}

function normalizeJunctionQuadrantBezierPatch(value: unknown, index: number): JunctionQuadrantBezierPatch {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    patchId: asString(record.patchId ?? record.patch_id, `patch_${String(index + 1).padStart(2, "0")}`),
    stripKind: normalizeStripKind(record.stripKind ?? record.strip_kind),
    innerCurve: normalizeBezierCurve(record.innerCurve ?? record.inner_curve),
    outerCurve: normalizeBezierCurve(record.outerCurve ?? record.outer_curve),
  };
}

function normalizeJunctionQuadrantSkeletonLine(value: unknown, index: number): JunctionQuadrantSkeletonLine {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    lineId: asString(record.lineId ?? record.line_id, `line_${String(index + 1).padStart(2, "0")}`),
    stripKind: normalizeStripKind(record.stripKind ?? record.strip_kind),
    curve: normalizeBezierCurve(record.curve),
    widthM: Math.max(0.01, asNumber(record.widthM ?? record.width_m, 1.0)),
  };
}

function normalizeJunctionQuadrantComposition(value: unknown, index: number): JunctionQuadrantComposition {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawPatches = Array.isArray(record.patches) ? record.patches : [];
  const rawSkeletonLinesValue = record.skeletonLines ?? record.skeleton_lines;
  const rawSkeletonLines = Array.isArray(rawSkeletonLinesValue) ? rawSkeletonLinesValue : [];
  return {
    quadrantId: asString(record.quadrantId ?? record.quadrant_id, `Q${index}`),
    armAId: asString(record.armAId ?? record.arm_a_id, ""),
    armBId: asString(record.armBId ?? record.arm_b_id, ""),
    patches: rawPatches.map((item, patchIndex) => normalizeJunctionQuadrantBezierPatch(item, patchIndex)),
    skeletonLines: rawSkeletonLines.map((item, lineIndex) => normalizeJunctionQuadrantSkeletonLine(item, lineIndex)),
  };
}

function normalizeJunctionComposition(value: unknown, index: number): JunctionComposition {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawQuadrantsValue = record.quadrants;
  const rawLaneSurfacesValue = record.laneSurfaces ?? record.lane_surfaces;
  const rawMergedSurfacesValue = record.mergedSurfaces ?? record.merged_surfaces;
  const rawQuadrants = Array.isArray(rawQuadrantsValue) ? rawQuadrantsValue : [];
  const rawLaneSurfaces = Array.isArray(rawLaneSurfacesValue) ? rawLaneSurfacesValue : [];
  const rawMergedSurfaces = Array.isArray(rawMergedSurfacesValue) ? rawMergedSurfacesValue : [];
  return {
    junctionId: asString(record.junctionId ?? record.junction_id, `composition_${String(index + 1).padStart(2, "0")}`),
    kind: normalizeJunctionCompositionKind(record.kind),
    quadrants: rawQuadrants.map((item, quadrantIndex) => normalizeJunctionQuadrantComposition(item, quadrantIndex)),
    laneSurfaces: rawLaneSurfaces.map((item, laneIndex) => normalizeLaneSurface(item, laneIndex)),
    mergedSurfaces: rawMergedSurfaces.map((item, mergedIndex) => normalizeMergedSurface(item, mergedIndex)),
  };
}

function normalizeJunctionCompositions(value: unknown): JunctionComposition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => normalizeJunctionComposition(item, index));
}

function normalizeZoneFurnitureInstance(value: unknown, index: number, zoneId: string): ZoneFurnitureInstance {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    instance_id: asString(record.instance_id ?? record.id, `${zoneId}_furniture_${String(index + 1).padStart(2, "0")}`),
    kind: isFurnitureKind(asString(record.kind, "bench")) ? asString(record.kind, "bench") as FurnitureKind : "bench" as FurnitureKind,
    x_px: asNumber(record.x_px ?? record.x, 0),
    y_px: asNumber(record.y_px ?? record.y, 0),
    yaw_deg: asNullableNumber(record.yaw_deg),
  };
}

function normalizeAnnotation(value: unknown): ReferenceAnnotation {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  // Handle both flat format and annotation wrapper format (e.g., from graph_templates.py export)
  const inner: Record<string, unknown> =
    record.annotation && typeof record.annotation === "object"
      ? (record.annotation as Record<string, unknown>)
      : record;

  const centerlines = Array.isArray(inner.centerlines)
    ? inner.centerlines.map((item, index) => normalizeCenterline(item, index))
    : [];
  const junctions = Array.isArray(inner.junctions)
    ? inner.junctions.map((item, index) => normalizeJunction(item, index))
    : [];
  const roundabouts = Array.isArray(inner.roundabouts)
    ? inner.roundabouts.map((item, index) => normalizeRoundabout(item, index))
    : [];
  const controlPoints = Array.isArray(inner.control_points)
    ? inner.control_points.map((item, index) => normalizeMarker(item, index, "control_point"))
    : [];
  const buildingRegions = Array.isArray(inner.building_regions)
    ? inner.building_regions.map((item, index) => normalizeBuildingRegion(item, index))
    : [];
  const functionalZones = Array.isArray(inner.functional_zones)
    ? inner.functional_zones.map((item, index) => normalizeFunctionalZone(item, index))
    : [];
  const regions = Array.isArray(inner.regions)
    ? inner.regions.map((item, index) => normalizeRegion(item, index))
    : [];
  const derivedRegions = Array.isArray(inner.derived_regions)
    ? inner.derived_regions.map((item, index) => normalizeRegion(item, index, "building_region"))
    : [];
  const surfaceAnnotations = Array.isArray(inner.surface_annotations)
    ? inner.surface_annotations.map((item, index) => normalizeSurfaceAnnotation(item, index))
    : [];
  const stationStripPatches = Array.isArray(inner.station_strip_patches)
    ? inner.station_strip_patches.map((item, index) => normalizeStationStripPatch(item, index))
    : [];
  const junctionCompositions = normalizeJunctionCompositions(inner.junction_compositions ?? inner.compositions);
  return {
    version: asString(inner.version, ANNOTATION_SCHEMA_VERSION),
    plan_id: asString(inner.plan_id, "custom_annotation"),
    image_path: asString(inner.image_path, ""),
    image_width_px: Math.max(0, Math.round(asNumber(inner.image_width_px, 0))),
    image_height_px: Math.max(0, Math.round(asNumber(inner.image_height_px, 0))),
    pixels_per_meter: Math.max(0.1, asNumber(inner.pixels_per_meter, DEFAULT_PIXELS_PER_METER)),
    centerlines,
    junctions,
    roundabouts,
    control_points: controlPoints,
    regions,
    derived_regions: derivedRegions,
    building_regions: buildingRegions,
    functional_zones: functionalZones,
    surface_annotations: surfaceAnnotations,
    station_strip_patches: stationStripPatches,
    junction_compositions: junctionCompositions,
  };
}


function cloneAnnotation(annotation: ReferenceAnnotation): ReferenceAnnotation {
  return normalizeAnnotation(JSON.parse(stringifyAnnotation(annotation)));
}

function resolveSceneGraphStatusText(message: SceneGraphStatusText): string {
  if (typeof message === "string") {
    return translateViewerLiteral(loadViewerLanguage(), message) ?? message;
  }
  return translateViewerKey(loadViewerLanguage(), message.key) ?? message.fallback ?? message.key;
}

function applySceneGraphStatusText(element: HTMLElement, message: SceneGraphStatusText): void {
  if (typeof message === "string") {
    element.removeAttribute("data-i18n-key");
    element.dataset.i18nSourceText = message;
  } else {
    element.removeAttribute("data-i18n-source-text");
    element.dataset.i18nKey = message.key;
  }
  element.textContent = resolveSceneGraphStatusText(message);
}

function statusTextFromImageLoadError(
  error: unknown,
  fallbackKey: string,
  fallback: string,
): SceneGraphStatusText {
  if (error instanceof Error) {
    if (error.message === "Failed to load the selected image.") {
      return { key: "sceneGraph.status.failedSelectedImage", fallback: error.message };
    }
    if (error.message === "Timed out while loading the selected image.") {
      return { key: "sceneGraph.status.selectedImageTimeout", fallback: error.message };
    }
    if (error.message === "Failed to fetch") {
      return { key: fallbackKey, fallback };
    }
    return error.message;
  }
  return { key: fallbackKey, fallback };
}

function setStatus(element: HTMLElement, message: SceneGraphStatusText, tone: StatusTone): void {
  applySceneGraphStatusText(element, message);
  element.dataset.tone = tone;
  const proxyId =
    element.id === "annotation-status"
      ? "annotation-status-proxy"
      : element.id === "annotation-graph-status"
        ? "annotation-graph-status-proxy"
        : null;
  if (proxyId) {
    const proxy = document.getElementById(proxyId);
    if (proxy) {
      applySceneGraphStatusText(proxy, message);
      proxy.dataset.tone = tone;
    }
    const summary = document.getElementById("desktop-shell-status-summary-text");
    if (summary) {
      applySceneGraphStatusText(summary, message);
    }
  }
}




function centerlineLengthM(centerline: AnnotatedCenterline, pixelsPerMeter: number): number {
  return polylineLength(centerline.points) / Math.max(pixelsPerMeter, 1e-6);
}




function normalizeAngleDeg(value: number): number {
  let normalized = value % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

function buildSelectOptions<T extends string>(
  values: readonly T[],
  selectedValue: T,
  labels: Record<T, string>,
): string {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(labels[value])}</option>`,
    )
    .join("");
}

const NO_DIRECTION_STRIP_KINDS = new Set<StripKind>(["median", "grass_belt", "shared_street_surface", "colored_pavement"]);

function stripDirectionMarkup(strip: AnnotatedCrossSectionStrip): string {
  const options =
    strip.zone === "center" && !NO_DIRECTION_STRIP_KINDS.has(strip.kind)
      ? STRIP_DIRECTION_OPTIONS
      : (["none"] as const);
  return buildSelectOptions(options, strip.direction, {
    forward: "Forward",
    reverse: "Reverse",
    bidirectional: "Bidirectional",
    none: "None",
  });
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

function normalizedConnectionPreviewPoints(
  points: AnnotationPoint[],
  width = 96,
  height = 72,
  padding = 10,
): AnnotationPoint[] {
  if (points.length === 0) {
    return [];
  }
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const originX = (width - drawnWidth) * 0.5;
  const originY = (height - drawnHeight) * 0.5;
  return points.map((point) => ({
    x: originX + (point.x - minX) * scale,
    y: originY + (point.y - minY) * scale,
  }));
}

function buildCornerConnectionCardMarkup(target: SelectedStripCornerFamilyTarget): string {
  const previewPoints = normalizedConnectionPreviewPoints(target.points);
  const polylinePoints = previewPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const startPoint = previewPoints[0] ?? { x: 12, y: 36 };
  const endPoint = previewPoints[previewPoints.length - 1] ?? { x: 84, y: 36 };
  const quadrantLabel = cornerConnectionLabel(target.quadrantId);
  return `
    <button
      type="button"
      class="annotation-corner-link-card"
      data-action="focus-linked-strip"
      data-centerline-id="${escapeHtml(target.target.centerlineId)}"
      data-strip-id="${escapeHtml(target.target.stripId)}"
    >
      <div class="annotation-corner-link-preview" aria-hidden="true">
        <svg class="annotation-corner-link-svg" viewBox="0 0 96 72" role="presentation">
          <polyline
            points="${polylinePoints}"
            fill="none"
            stroke="${stripStrokeColor(target.stripKind)}"
            stroke-width="10"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="${startPoint.x}" cy="${startPoint.y}" r="6" fill="#f6f2e8" stroke="${stripStrokeColor(target.stripKind)}" stroke-width="3" />
          <circle cx="${endPoint.x}" cy="${endPoint.y}" r="6" fill="#f6f2e8" stroke="${stripStrokeColor(target.stripKind)}" stroke-width="3" />
        </svg>
      </div>
      <div class="annotation-corner-link-copy">
        <strong>${escapeHtml(target.target.centerlineId)} · ${escapeHtml(target.target.stripId)}</strong>
        <span>${escapeHtml(metaurbanStripLabel(target.target.stripKind))} · ${escapeHtml(stripZoneSideLabel(target.target.stripZone))}</span>
        <span class="annotation-corner-link-junction">via ${escapeHtml(target.junctionId)} · ${escapeHtml(quadrantLabel)}</span>
      </div>
    </button>
  `;
}

function buildStripCornerConnectionsMarkup(
  centerline: AnnotatedCenterline,
  selectedStripId: string | null,
  junctionOverlays: DerivedJunctionOverlay[],
): string {
  const selectedStrip = selectedStripId
    ? centerline.cross_section_strips.find((strip) => strip.strip_id === selectedStripId) ?? null
    : null;
  if (!selectedStrip || !CORNER_LINK_STRIP_KINDS.has(selectedStrip.kind)) {
    return "";
  }
  const targets = selectedStripCornerFamilyTargets(junctionOverlays, centerline.id, selectedStrip.strip_id);
  return `
    <section class="annotation-corner-link-section">
      <div class="annotation-corner-link-header">
        <div>
          <strong>Corner Family</strong>
          <div class="scene-micro-note">${escapeHtml(selectedStrip.strip_id)} · ${escapeHtml(stripZoneSideLabel(selectedStrip.zone))}</div>
        </div>
        <span class="annotation-cross-preview-stat">${targets.length} strip${targets.length === 1 ? "" : "s"}</span>
      </div>
      ${
        targets.length > 0
          ? `
            <div class="annotation-corner-link-list">
              ${targets.map((target) => buildCornerConnectionCardMarkup(target)).join("")}
            </div>
          `
          : `<div class="scene-empty-note">No corner-kernel family is derived for this strip yet.</div>`
      }
    </section>
  `;
}

function buildCrossSectionPreviewMarkup(
  centerline: AnnotatedCenterline,
  selectedStripId: string | null,
  junctionOverlays: DerivedJunctionOverlay[],
): string {
  const preview = previewCrossSection(centerline);
  const isDetailedPreview = preview.sourceMode === "detailed";
  const displayStrips = crossSectionPreviewDisplayOrder(preview.strips);
  const totalWidth = displayStrips.reduce((sum, strip) => sum + Math.max(strip.width_m, 0), 0);
  const bands: string[] = [];
  displayStrips.forEach((strip, index) => {
    const nextStrip = displayStrips[index + 1];
      const selected = selectedStripId === strip.strip_id;
      bands.push(`
        <div
          class="annotation-cross-preview-strip${selected ? " annotation-cross-preview-strip-selected" : ""}"
          data-preview-strip-shell="${escapeHtml(strip.strip_id)}"
          style="flex: ${Math.max(strip.width_m, 0.8)} 0 0; background: ${stripPreviewFillColor(strip.kind)}; border-color: ${stripStrokeColor(strip.kind)};"
        >
          <button
            type="button"
            class="annotation-cross-preview-strip-hitbox"
            data-action="select-preview-strip"
            data-strip-id="${escapeHtml(strip.strip_id)}"
            data-preview-source="${escapeHtml(preview.sourceMode)}"
          >
            <span class="annotation-cross-preview-strip-label">${escapeHtml(metaurbanStripLabel(strip.kind))}</span>
            <span class="annotation-cross-preview-strip-meta">${escapeHtml(strip.width_m.toFixed(2))}m · ${escapeHtml(stripDirectionChip(strip))}</span>
            <span class="annotation-cross-preview-strip-zone">${escapeHtml(metaurbanStripZoneLabel(strip.kind))}</span>
            ${buildMetaurbanAssetBadgeMarkup(strip.kind)}
          </button>
          ${
            isDetailedPreview
              ? `
                <label class="annotation-cross-preview-control">
                  <span>Width</span>
                  <input
                    type="range"
                    min="0.1"
                    max="12"
                    step="0.1"
                    value="${strip.width_m.toFixed(2)}"
                    data-strip-field="width_m"
                    data-strip-id="${escapeHtml(strip.strip_id)}"
                  />
                </label>
              `
              : ""
          }
        </div>
      `);
      if (isDetailedPreview && nextStrip) {
        bands.push(`
          <button
            type="button"
            class="annotation-cross-preview-divider"
            data-action="start-preview-resize"
            data-left-strip-id="${escapeHtml(strip.strip_id)}"
            data-right-strip-id="${escapeHtml(nextStrip.strip_id)}"
            aria-label="Resize boundary between ${escapeHtml(metaurbanStripLabel(strip.kind))} and ${escapeHtml(metaurbanStripLabel(nextStrip.kind))}"
          >
            <span class="annotation-cross-preview-divider-line" aria-hidden="true"></span>
          </button>
        `);
      }
    });
  return `
    <section class="annotation-cross-preview-section">
      <div class="annotation-cross-preview-header">
        <div>
          <h3>Cross Section Preview</h3>
          <div class="scene-micro-note">
            ${escapeHtml(preview.sourceMode === "seed" ? "Seed preview from coarse parameters" : "Detailed cross section")}
          </div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">${escapeHtml(totalWidth.toFixed(2))}m total</span>
          <span class="annotation-cross-preview-stat">${escapeHtml(getCenterlineCarriagewayWidth(centerline).toFixed(2))}m carriageway</span>
        </div>
      </div>
      <div class="annotation-cross-preview-row">
        ${bands.join("")}
      </div>
      <div class="scene-micro-note">
        ${escapeHtml(
          preview.sourceMode === "seed"
            ? "Click a seed band to split this road into editable detailed strips."
            : "Click a band to select it, then adjust width and direction below.",
        )}
      </div>
      ${buildStripCornerConnectionsMarkup(centerline, selectedStripId, junctionOverlays)}
    </section>
  `;
}

function buildSelectedStripEditorMarkup(
  centerline: AnnotatedCenterline,
  selectedStripId: string | null,
  cornerLinkedRoadCount = 0,
): string {
  const strip = selectedStripId
    ? centerline.cross_section_strips.find((item) => item.strip_id === selectedStripId) ?? null
    : null;
  if (!strip) {
    return `
      <section class="annotation-selected-strip-section">
        <div class="annotation-strip-section-header">
          <h3>Selected Strip</h3>
          <span class="scene-micro-note">Click a band in the preview to focus one strip.</span>
        </div>
        <div class="scene-empty-note">No strip is selected yet.</div>
      </section>
    `;
  }
  return `
    <section class="annotation-selected-strip-section">
      <div class="annotation-strip-section-header">
        <h3>Selected Strip</h3>
        <span class="scene-micro-note">${escapeHtml(strip.strip_id)} · ${escapeHtml(metaurbanStripZoneLabel(strip.kind))}</span>
      </div>
      ${buildMetaurbanAssetBadgeMarkup(strip.kind, { emptyMode: "note" })}
      <div class="scene-inspector-grid">
        <label class="scene-form-field">
          <span>Strip ID</span>
          <input type="text" value="${escapeHtml(strip.strip_id)}" readonly />
        </label>
        <label class="scene-form-field">
          <span>Zone</span>
          <input type="text" value="${escapeHtml(strip.zone)}" readonly />
        </label>
        <label class="scene-form-field">
          <span>Kind</span>
          <select data-strip-field="kind" data-strip-id="${escapeHtml(strip.strip_id)}">
            ${buildSelectOptions(
              strip.zone === "center"
                ? (["drive_lane", "bus_lane", "bike_lane", "parking_lane", "median", "grass_belt", "shared_street_surface", "colored_pavement"] as StripKind[])
                : (["nearroad_buffer", "nearroad_furnishing", "clear_sidewalk", "farfromroad_buffer", "frontage_reserve", "colored_pavement"] as StripKind[]),
              strip.kind,
              STRIP_KIND_LABELS,
            )}
          </select>
        </label>
        <label class="scene-form-field">
          <span>Width (m)</span>
          <input type="number" min="0.1" step="0.1" data-strip-field="width_m" data-strip-id="${escapeHtml(strip.strip_id)}" value="${strip.width_m.toFixed(2)}" />
        </label>
        <label class="scene-form-field">
          <span>Direction</span>
          <select data-strip-field="direction" data-strip-id="${escapeHtml(strip.strip_id)}">
            ${stripDirectionMarkup(strip)}
          </select>
        </label>
        <div class="scene-fact-card">
          <span class="scene-fact-label">MetaUrban Zone</span>
          <strong>${escapeHtml(metaurbanStripZoneLabel(strip.kind))}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Corner-linked Roads</span>
          <strong>${cornerLinkedRoadCount}</strong>
        </div>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Guidance</span>
          <strong>${escapeHtml(METAAURBAN_STRIP_GUIDANCE[strip.kind])}</strong>
        </div>
      </div>
    </section>
  `;
}

function buildMetaurbanAssetGuideMarkup(): string {
  return `
    <section class="annotation-metaurban-guide">
      <div class="annotation-strip-section-header">
        <h3>MetaUrban Asset Hook</h3>
        <span class="scene-micro-note">Placeholder badges now, real assets later.</span>
      </div>
      <div class="annotation-metaurban-guide-lines">
        ${METAAURBAN_ASSET_GUIDE_LINES.map((line) => `<div class="scene-micro-note">${escapeHtml(line)}</div>`).join("")}
      </div>
    </section>
  `;
}

function buildStripSectionMarkup(
  centerline: AnnotatedCenterline,
  zone: StripZone,
  selectedStripId: string | null,
): string {
  const strips = sortedCrossSectionStrips(centerline.cross_section_strips).filter((strip) => strip.zone === zone);
  const rows = strips.length > 0
    ? strips
        .map(
          (strip) => `
            <div class="annotation-strip-row${selectedStripId === strip.strip_id ? " annotation-strip-row-selected" : ""}">
              <div class="annotation-strip-row-header">
                <button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="select-strip" data-strip-id="${escapeHtml(strip.strip_id)}">
                  ${escapeHtml(strip.strip_id)}
                </button>
                <div class="annotation-strip-row-actions">
                  <button type="button" class="scene-icon-button" data-action="move-strip-up" data-strip-id="${escapeHtml(strip.strip_id)}">↑</button>
                  <button type="button" class="scene-icon-button" data-action="move-strip-down" data-strip-id="${escapeHtml(strip.strip_id)}">↓</button>
                  <button type="button" class="scene-icon-button" data-action="delete-strip" data-strip-id="${escapeHtml(strip.strip_id)}">×</button>
                </div>
              </div>
              <div class="annotation-strip-row-summary">
                <strong>${escapeHtml(metaurbanStripLabel(strip.kind))}</strong>
                <span>${escapeHtml(strip.width_m.toFixed(2))}m</span>
                <span>${escapeHtml(stripDirectionChip(strip))}</span>
                <span>${escapeHtml(metaurbanStripZoneLabel(strip.kind))}</span>
              </div>
              ${buildMetaurbanAssetBadgeMarkup(strip.kind)}
            </div>
          `,
        )
        .join("")
    : `<div class="scene-empty-note">No ${zone} strips yet.</div>`;
  return `
    <section class="annotation-strip-section">
      <div class="annotation-strip-section-header">
        <h3>${escapeHtml(zone.charAt(0).toUpperCase() + zone.slice(1))}</h3>
        <button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="add-strip" data-zone="${escapeHtml(zone)}">
          Add Strip
        </button>
      </div>
      ${rows}
    </section>
  `;
}

function buildFurnitureMarkup(
  centerline: AnnotatedCenterline,
  selectedStripId: string | null,
  pendingFurnitureKind: FurnitureKind,
  isPlacementArmed: boolean,
): string {
  const selectedStrip = selectedStripId
    ? centerline.cross_section_strips.find((strip) => strip.strip_id === selectedStripId) ?? null
    : null;
  const canPlaceFurniture = Boolean(selectedStrip && FURNITURE_COMPATIBLE_STRIP_KINDS.has(selectedStrip.kind));
  const furnitureRows = centerline.street_furniture_instances.length > 0
    ? centerline.street_furniture_instances
        .map(
          (instance) => `
            <div class="annotation-furniture-row">
              <div class="annotation-furniture-row-header">
                <strong>${escapeHtml(instance.instance_id)}</strong>
                <button type="button" class="scene-icon-button" data-action="delete-furniture" data-instance-id="${escapeHtml(instance.instance_id)}">×</button>
              </div>
              <label class="scene-form-field">
                <span>Kind</span>
                <select data-furniture-field="kind" data-instance-id="${escapeHtml(instance.instance_id)}">
                  ${buildSelectOptions(FURNITURE_KINDS, instance.kind, FURNITURE_KIND_LABELS)}
                </select>
              </label>
              <label class="scene-form-field">
                <span>Strip</span>
                <input type="text" value="${escapeHtml(instance.strip_id)}" readonly />
              </label>
              <label class="scene-form-field">
                <span>Station (m)</span>
                <input type="number" min="0" step="0.1" data-furniture-field="station_m" data-instance-id="${escapeHtml(instance.instance_id)}" value="${instance.station_m.toFixed(2)}" />
              </label>
              <label class="scene-form-field">
                <span>Lateral Offset (m)</span>
                <input type="number" step="0.1" data-furniture-field="lateral_offset_m" data-instance-id="${escapeHtml(instance.instance_id)}" value="${instance.lateral_offset_m.toFixed(2)}" />
              </label>
              <label class="scene-form-field">
                <span>Yaw</span>
                <input type="number" step="1" data-furniture-field="yaw_deg" data-instance-id="${escapeHtml(instance.instance_id)}" value="${instance.yaw_deg === null ? "" : instance.yaw_deg.toFixed(0)}" />
              </label>
            </div>
          `,
        )
        .join("")
    : `<div class="scene-empty-note">No furniture instances yet.</div>`;
  return `
    <section class="annotation-furniture-section">
      <div class="annotation-strip-section-header">
        <h3>Street Furniture</h3>
        <span class="scene-micro-note">${canPlaceFurniture ? `Target: ${escapeHtml(selectedStrip?.strip_id ?? "")}` : "Select a furnishing or frontage strip"}</span>
      </div>
      <div class="annotation-furniture-toolbar">
        <label class="scene-form-field">
          <span>Furniture Kind</span>
          <select id="annotation-inspector-furniture-kind">
            ${buildSelectOptions(FURNITURE_KINDS, pendingFurnitureKind, FURNITURE_KIND_LABELS)}
          </select>
        </label>
        <button type="button" class="scene-toolbar-button" data-action="${isPlacementArmed ? "cancel-furniture-placement" : "arm-furniture-placement"}" ${canPlaceFurniture ? "" : "disabled"}>
          ${isPlacementArmed ? "Cancel Placement" : "Place on Canvas"}
        </button>
      </div>
      ${furnitureRows}
    </section>
  `;
}










function buildInspectorMarkup(
  annotation: ReferenceAnnotation,
  selection: Selection,
  selectedStripId: string | null,
  pendingFurnitureKind: FurnitureKind,
  isFurniturePlacementArmed: boolean,
): string {
  if (!selection) {
    return `<div class="scene-empty-note">选择一条中心线、路口、环岛、控制点或建筑区域后，可以在这里编辑属性。</div>`;
  }
  if (selection.kind === "lane_element") {
    return buildLaneElementInspectorMarkup(annotation, selection, buildCornerConnectionCardMarkup);
  }
  if (selection.kind === "road_collection") {
    return buildRoadCollectionInspectorMarkup(annotation, clippedCenterlineDisplaySegments);
  }
  const feature = getSelectedFeature(annotation, selection);
  if (!feature) {
    return `<div class="scene-empty-note">当前选择的要素已经不存在。</div>`;
  }
  if (selection.kind === "building_region") {
    return buildBuildingRegionInspectorMarkup(feature as AnnotatedBuildingRegion);
  }
  if (selection.kind === "region") {
    return buildRegionInspectorMarkup(feature as AnnotatedRegion);
  }
  if (selection.kind === "functional_zone") {
    return buildFunctionalZoneInspectorMarkup(feature as AnnotatedFunctionalZone);
  }
  if (selection.kind === "surface_annotation") {
    return buildSurfaceAnnotationInspectorMarkup(annotation, feature as AnnotatedSurfaceAnnotation);
  }
  if (selection.kind === "centerline") {
    const centerline = feature as AnnotatedCenterline;
    const junctionOverlays = deriveJunctionOverlayGeometries(annotation);
    const cornerFamilyTargets = selectedStripId
      ? selectedStripCornerFamilyTargets(junctionOverlays, centerline.id, selectedStripId)
      : [];
    const linkedRoadIds = new Set(cornerFamilyTargets.map((target) => target.target.centerlineId));
    const referenceWidthMeters = getReferenceWidthMeters(centerline, annotation.pixels_per_meter);
    const profile = deriveLaneProfile(centerline);
    const detailed = resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED;
    const nominalWidth = nominalSeedCrossSectionWidth(centerline);
    const canCalibratePixelsPerMeter = centerline.reference_width_px !== null && centerline.reference_width_px > 0;
    return `
      ${buildCrossSectionPreviewMarkup(centerline, selectedStripId, junctionOverlays)}
      <div class="scene-inspector-grid">
        <label class="scene-form-field">
          <span>ID</span>
          <input id="annotation-inspector-id" type="text" value="${escapeHtml(centerline.id)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Label</span>
          <input id="annotation-inspector-label" type="text" value="${escapeHtml(centerline.label)}" />
        </label>
        <label class="scene-form-field">
          <span>Total Width (m)</span>
          <input id="annotation-inspector-road-width" type="number" min="1" step="0.5" value="${centerline.road_width_m.toFixed(2)}" ${detailed ? "readonly" : ""} />
        </label>
        <label class="scene-form-field">
          <span>Reference Width (px)</span>
          <input id="annotation-inspector-reference-width" type="number" min="1" step="1" placeholder="auto" value="${centerline.reference_width_px === null ? "" : centerline.reference_width_px.toFixed(0)}" />
        </label>
        <label class="scene-form-field">
          <span>Forward Drive</span>
          <input id="annotation-inspector-forward-drive-lanes" type="number" min="0" step="1" value="${centerline.forward_drive_lane_count}" ${detailed ? "disabled" : ""} />
        </label>
        <label class="scene-form-field">
          <span>Reverse Drive</span>
          <input id="annotation-inspector-reverse-drive-lanes" type="number" min="0" step="1" value="${centerline.reverse_drive_lane_count}" ${detailed ? "disabled" : ""} />
        </label>
        <label class="scene-form-field">
          <span>Bike Lanes</span>
          <input id="annotation-inspector-bike-lanes" type="number" min="0" step="1" value="${centerline.bike_lane_count}" ${detailed ? "disabled" : ""} />
        </label>
        <label class="scene-form-field">
          <span>Bus Lanes</span>
          <input id="annotation-inspector-bus-lanes" type="number" min="0" step="1" value="${centerline.bus_lane_count}" ${detailed ? "disabled" : ""} />
        </label>
        <label class="scene-form-field">
          <span>Parking Lanes</span>
          <input id="annotation-inspector-parking-lanes" type="number" min="0" step="1" value="${centerline.parking_lane_count}" ${detailed ? "disabled" : ""} />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Highway Type</span>
          <input id="annotation-inspector-highway-type" type="text" value="${escapeHtml(centerline.highway_type)}" />
        </label>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Mode</span>
          <strong>${detailed ? "Detailed" : "Coarse"}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Reference Width (m)</span>
          <strong>${referenceWidthMeters === null ? "auto" : referenceWidthMeters.toFixed(2)}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Carriageway</span>
          <strong>${getCenterlineCarriagewayWidth(centerline).toFixed(2)}m</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Lane Summary</span>
          <strong>${profile.total_drive_lane_count} drive · ${profile.total_lane_count} total</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Drive Lane Width</span>
          <strong>${NOMINAL_STRIP_WIDTHS.drive_lane.toFixed(2)}m target</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Pixels / Meter</span>
          <strong>${annotation.pixels_per_meter.toFixed(2)} px/m</strong>
        </div>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Geometry</span>
          <strong>${centerline.points.length} vertices${selection.vertexIndex !== undefined ? ` · selected vertex ${selection.vertexIndex + 1}` : ""}</strong>
        </div>
        <div class="annotation-detail-actions scene-form-field-wide">
          ${
            !detailed
              ? `<button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="reset-road-width-to-nominal">
                  Reset Width to Nominal ${escapeHtml(nominalWidth.toFixed(2))}m
                </button>`
              : ""
          }
          <button
            type="button"
            class="scene-toolbar-button scene-toolbar-button-secondary"
            data-action="calibrate-pixels-per-meter"
            ${canCalibratePixelsPerMeter ? "" : "disabled"}
          >
            Calibrate Pixels / Meter from Reference Width
          </button>
          <button type="button" class="scene-toolbar-button" data-action="split-centerline">
            ${detailed ? "Reseed Cross Section" : "Split to Cross Section"}
          </button>
          ${detailed ? `<button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="collapse-centerline">Back to Coarse</button>` : ""}
        </div>
      </div>
      ${
        detailed
          ? `
            ${buildSelectedStripEditorMarkup(centerline, selectedStripId, linkedRoadIds.size)}
            <div class="annotation-detailed-layout">
              ${buildStripSectionMarkup(centerline, "left", selectedStripId)}
              ${buildStripSectionMarkup(centerline, "center", selectedStripId)}
              ${buildStripSectionMarkup(centerline, "right", selectedStripId)}
              ${buildFurnitureMarkup(centerline, selectedStripId, pendingFurnitureKind, isFurniturePlacementArmed)}
            </div>
            ${buildMetaurbanAssetGuideMarkup()}
          `
          : `
            <div class="scene-empty-note">先把总宽度和参考图调准；你现在也可以直接点击上方 seed 横截面中的任一部分，自动进入 detailed 编辑。</div>
            ${buildMetaurbanAssetGuideMarkup()}
          `
      }
    `;
  }
  if (selection.kind === "junction") {
    return buildJunctionInspectorMarkup(
      feature as AnnotatedJunction,
      getJunctionOverlay(annotation, selection.id),
    );
  }
  if (selection.kind === "derived_junction") {
    const junction = feature as DerivedJunctionOverlay;
    return buildJunctionInspectorMarkup(
      {
        id: junction.junctionId,
        label: junction.junctionId,
        x: junction.anchor.x,
        y: junction.anchor.y,
        kind: junction.kind,
        connected_centerline_ids: junction.connectedCenterlineIds,
        crosswalk_depth_m: 3,
        source_mode: "legacy_marker",
      },
      junction,
    );
  }
  if (selection.kind === "roundabout") {
    const roundabout = feature as AnnotatedRoundabout;
    return `
      <div class="scene-inspector-grid">
        <label class="scene-form-field">
          <span>ID</span>
          <input id="annotation-inspector-id" type="text" value="${escapeHtml(roundabout.id)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Label</span>
          <input id="annotation-inspector-label" type="text" value="${escapeHtml(roundabout.label)}" />
        </label>
        <label class="scene-form-field">
          <span>Center X</span>
          <input id="annotation-inspector-x" type="number" step="1" value="${roundabout.x.toFixed(0)}" />
        </label>
        <label class="scene-form-field">
          <span>Center Y</span>
          <input id="annotation-inspector-y" type="number" step="1" value="${roundabout.y.toFixed(0)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Radius (px)</span>
          <input id="annotation-inspector-radius" type="number" min="8" step="1" value="${roundabout.radius_px.toFixed(0)}" />
        </label>
      </div>
    `;
  }
  const marker = feature as AnnotatedMarker;
  return `
    <div class="scene-inspector-grid">
      <label class="scene-form-field">
        <span>ID</span>
        <input id="annotation-inspector-id" type="text" value="${escapeHtml(marker.id)}" />
      </label>
      <label class="scene-form-field scene-form-field-wide">
        <span>Label</span>
        <input id="annotation-inspector-label" type="text" value="${escapeHtml(marker.label)}" />
      </label>
      <label class="scene-form-field">
        <span>X</span>
        <input id="annotation-inspector-x" type="number" step="1" value="${marker.x.toFixed(0)}" />
      </label>
      <label class="scene-form-field">
        <span>Y</span>
        <input id="annotation-inspector-y" type="number" step="1" value="${marker.y.toFixed(0)}" />
      </label>
      <label class="scene-form-field scene-form-field-wide">
        <span>Kind</span>
        <input id="annotation-inspector-kind" type="text" value="${escapeHtml(marker.kind)}" />
      </label>
    </div>
  `;
}

function buildBuildingRegionDraftMarkup(drag: Extract<DragState, { kind: "building_region_draw" }> | null): string {
  if (!drag) {
    return "";
  }
  const preview = buildBuildingRegionFromDraft("__draft__", drag.startPoint, drag.currentPoint);
  const polygon = buildingRegionPolygonPoints(preview);
  return `
    <g class="annotation-feature-group">
      <polygon
        class="annotation-building-region annotation-building-region-draft"
        points="${polygon.map((point) => `${point.x},${point.y}`).join(" ")}"
      />
    </g>
  `;
}

function regionPolygonPoints(region: AnnotatedRegion): AnnotationPoint[] {
  return region.points.map((point) => clonePoint(point));
}

function regionCentroid(region: AnnotatedRegion): AnnotationPoint {
  const points = regionPolygonPoints(region);
  if (!points.length) {
    return { x: 0, y: 0 };
  }
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function regionBoxPoints(startPoint: AnnotationPoint, currentPoint: AnnotationPoint): AnnotationPoint[] {
  const minX = Math.min(startPoint.x, currentPoint.x);
  const maxX = Math.max(startPoint.x, currentPoint.x);
  const minY = Math.min(startPoint.y, currentPoint.y);
  const maxY = Math.max(startPoint.y, currentPoint.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function regionRoleLabel(role: RegionRole): string {
  if (role === "scene_region") {
    return "Scene Region";
  }
  if (role === "building_region") {
    return "Building Region";
  }
  return "Functional Region";
}


function buildRegionDraftMarkup(drag: Extract<DragState, { kind: "region_draw" | "region_box_draw" }> | null): string {
  if (!drag) {
    return "";
  }
  const points = drag.kind === "region_box_draw"
    ? regionBoxPoints(drag.startPoint, drag.currentPoint)
    : [...drag.points, drag.currentPoint];
  if (points.length < 2) {
    return "";
  }
  const polygonPoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const lineFragments: string[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    lineFragments.push(
      `<line class="annotation-region-draft-line" x1="${points[i].x}" y1="${points[i].y}" x2="${points[i + 1].x}" y2="${points[i + 1].y}" />`,
    );
  }
  return `
    <g class="annotation-feature-group">
      <polygon
        class="annotation-region annotation-region-${drag.regionRole.replace(/_/g, "-")} annotation-region-draft"
        points="${polygonPoints}"
      />
      ${lineFragments.join("")}
      ${points
        .map(
          (point, index) =>
            `<circle class="annotation-region-draft-vertex" cx="${point.x}" cy="${point.y}" r="4" data-index="${index}" />`,
        )
        .join("")}
    </g>
  `;
}


function buildFunctionalZoneDraftMarkup(drag: Extract<DragState, { kind: "functional_zone_draw" }> | null): string {
  if (!drag) {
    return "";
  }
  const points = [...drag.points, drag.currentPoint];
  if (points.length < 2) {
    return "";
  }
  const polygonPoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const lineFragments: string[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    lineFragments.push(
      `<line class="annotation-functional-zone-draft-line" x1="${points[i].x}" y1="${points[i].y}" x2="${points[i + 1].x}" y2="${points[i + 1].y}" />`,
    );
  }
  return `
    <g class="annotation-feature-group">
      <polygon
        class="annotation-functional-zone annotation-functional-zone-draft"
        points="${polygonPoints}"
      />
      ${lineFragments.join("")}
      ${points
        .map(
          (point, index) =>
            `<circle class="annotation-functional-zone-draft-vertex" cx="${point.x}" cy="${point.y}" r="4" data-index="${index}" />`,
        )
        .join("")}
    </g>
  `;
}

function buildBranchPreviewMarkup(
  branchHoverSnap: BranchSnapTarget | null,
  branchDraft: BranchDraft | null,
): string {
  const fragments: string[] = [];
  if (branchHoverSnap && !branchDraft) {
    fragments.push(`
      <g class="annotation-feature-group">
        <circle class="annotation-branch-anchor" cx="${branchHoverSnap.point.x}" cy="${branchHoverSnap.point.y}" r="8" />
      </g>
    `);
  }
  if (branchDraft) {
    fragments.push(`
      <g class="annotation-feature-group">
        <circle class="annotation-branch-anchor" cx="${branchDraft.anchor.point.x}" cy="${branchDraft.anchor.point.y}" r="8" />
        <polyline
          class="annotation-branch-preview"
          points="${branchDraft.anchor.point.x},${branchDraft.anchor.point.y} ${branchDraft.endpoint.x},${branchDraft.endpoint.y}"
        />
        <circle class="annotation-branch-end${branchDraft.endpointSnap ? " annotation-branch-end-snapped" : ""}" cx="${branchDraft.endpoint.x}" cy="${branchDraft.endpoint.y}" r="7" />
      </g>
    `);
  }
  return fragments.join("");
}

function buildCrossPreviewMarkup(
  crossHoverSnap: BranchSnapTarget | null,
  crossDraft: CrossDraft | null,
): string {
  const fragments: string[] = [];
  if (crossHoverSnap && !crossDraft) {
    fragments.push(`
      <g class="annotation-feature-group">
        <circle class="annotation-branch-anchor annotation-cross-anchor" cx="${crossHoverSnap.point.x}" cy="${crossHoverSnap.point.y}" r="8" />
      </g>
    `);
  }
  if (crossDraft) {
    fragments.push(`
      <g class="annotation-feature-group">
        <circle class="annotation-branch-anchor annotation-cross-anchor" cx="${crossDraft.anchor.point.x}" cy="${crossDraft.anchor.point.y}" r="8" />
        <polyline
          class="annotation-branch-preview annotation-cross-preview"
          points="${crossDraft.negativeEndpoint.x},${crossDraft.negativeEndpoint.y} ${crossDraft.anchor.point.x},${crossDraft.anchor.point.y} ${crossDraft.positiveEndpoint.x},${crossDraft.positiveEndpoint.y}"
        />
        <circle class="annotation-branch-end annotation-cross-end${crossDraft.negativeEndpointSnap ? " annotation-branch-end-snapped" : ""}" cx="${crossDraft.negativeEndpoint.x}" cy="${crossDraft.negativeEndpoint.y}" r="7" />
        <circle class="annotation-branch-end annotation-cross-end${crossDraft.positiveEndpointSnap ? " annotation-branch-end-snapped" : ""}" cx="${crossDraft.positiveEndpoint.x}" cy="${crossDraft.positiveEndpoint.y}" r="7" />
      </g>
    `);
  }
  return fragments.join("");
}

function previewSplitCenterlinePointsAtSnap(centerline: AnnotatedCenterline, snap: BranchSnapTarget): AnnotationPoint[][] {
  if (centerline.points.length < 2) {
    return [];
  }
  const points = centerline.points.map((point) => clonePoint(point));
  let splitIndex = points.findIndex((point) => pointDistance(point, snap.point) <= BRANCH_VERTEX_REUSE_TOLERANCE_PX);
  if (splitIndex < 0) {
    splitIndex = clamp(snap.segmentIndex + 1, 1, points.length - 1);
    points.splice(splitIndex, 0, clonePoint(snap.point));
  }
  if (splitIndex <= 0 || splitIndex >= points.length - 1) {
    return [points];
  }
  return [points.slice(0, splitIndex + 1), points.slice(splitIndex)];
}

function previewCenterlinesFromDrafts(
  annotation: ReferenceAnnotation,
  branchDraft: BranchDraft | null,
  crossDraft: CrossDraft | null,
): AnnotatedCenterline[] {
  const previews: AnnotatedCenterline[] = [];
  if (branchDraft) {
    const host = annotation.centerlines.find((item) => item.id === branchDraft.anchor.centerlineId);
    if (host && pointDistance(branchDraft.anchor.point, branchDraft.endpoint) > 1) {
      previews.push(
        cloneCenterlineForBranch(host, "__preview_branch__", [branchDraft.anchor.point, branchDraft.endpoint]),
      );
    }
  }
  if (crossDraft) {
    const host = annotation.centerlines.find((item) => item.id === crossDraft.anchor.centerlineId);
    if (
      host &&
      (pointDistance(crossDraft.anchor.point, crossDraft.negativeEndpoint) > 1 ||
        pointDistance(crossDraft.anchor.point, crossDraft.positiveEndpoint) > 1)
    ) {
      previewSplitCenterlinePointsAtSnap(host, crossDraft.anchor).forEach((points, index) => {
        if (points.length >= 2) {
          previews.push(cloneCenterlineForBranch(host, `__preview_cross_host_${index + 1}__`, points));
        }
      });
      if (pointDistance(crossDraft.anchor.point, crossDraft.negativeEndpoint) > 1) {
        previews.push(
          cloneCenterlineForBranch(host, "__preview_cross_negative__", [
            crossDraft.anchor.point,
            crossDraft.negativeEndpoint,
          ]),
        );
      }
      if (pointDistance(crossDraft.anchor.point, crossDraft.positiveEndpoint) > 1) {
        previews.push(
          cloneCenterlineForBranch(host, "__preview_cross_positive__", [
            crossDraft.anchor.point,
            crossDraft.positiveEndpoint,
          ]),
        );
      }
    }
  }
  return previews;
}

function buildOverlayMarkup(
  annotation: ReferenceAnnotation,
  draftCenterline: AnnotationPoint[],
  selection: Selection,
  selectedStripId: string | null,
  junctionOverlayOptions: {
    showJunctionCore: boolean;
    showJunctionConnectors: boolean;
    showJunctionCrosswalks: boolean;
    showJunctionBoundaries: boolean;
    showJunctionLabels: boolean;
    showJunctionDebug: boolean;
    showJunctionOutlines: boolean;
  },
  branchHoverSnap: BranchSnapTarget | null,
  branchDraft: BranchDraft | null,
  crossHoverSnap: BranchSnapTarget | null,
  crossDraft: CrossDraft | null,
  buildingRegionDraft: Extract<DragState, { kind: "building_region_draw" }> | null,
  functionalZoneDraft: Extract<DragState, { kind: "functional_zone_draw" }> | null,
  regionDraft: Extract<DragState, { kind: "region_draw" | "region_box_draw" }> | null,
): string {
  const width = Math.max(annotation.image_width_px, 1);
  const height = Math.max(annotation.image_height_px, 1);
  const selectedKey = selection ? `${selection.kind}:${selection.id}` : "";
  const junctionOverlays = deriveJunctionOverlayGeometries(
    annotation,
    previewCenterlinesFromDrafts(annotation, branchDraft, crossDraft),
  );
  const clipCenterlinesToJunctionSurfaces =
    junctionOverlayOptions.showJunctionCore ||
    junctionOverlayOptions.showJunctionConnectors ||
    junctionOverlayOptions.showJunctionCrosswalks;
  const centerlineJunctionOverlays = clipCenterlinesToJunctionSurfaces ? junctionOverlays : [];
  const laneSelection = selectedLaneElement(selection);
  const linkedStripKeys = linkedCrossStripKeys(junctionOverlays, selection, selectedStripId);
  for (const key of laneElementRelatedStripKeys(junctionOverlays, laneSelection)) {
    linkedStripKeys.add(key);
  }

  const centerlineMarkup = annotation.centerlines
    .map((centerline) => {
      const isSelected = selectedKey === `centerline:${centerline.id}` || selection?.kind === "road_collection";
      const selectedVertexIndex =
        selection && selection.kind === "centerline" && selection.id === centerline.id
          ? selection.vertexIndex
          : undefined;
      return buildCenterlineOverlayMarkup(
        centerline,
        annotation.pixels_per_meter,
        isSelected,
        selectedVertexIndex,
        isSelected ? selectedStripId : null,
        centerlineJunctionOverlays,
        linkedStripKeys,
        laneSelection,
      );
    })
    .join("");

  const markerMarkup = (
    [
      ...annotation.junctions.map((item) => ({ featureKind: "junction" as const, colorClass: "annotation-junction", item })),
      ...annotation.control_points.map((item) => ({
        featureKind: "control_point" as const,
        colorClass: "annotation-control-point",
        item,
      })),
    ] as const
  )
    .map(({ featureKind, colorClass, item }) => {
      if (featureKind === "junction" && item.source_mode === "explicit") {
        return "";
      }
      const isSelected = selectedKey === `${featureKind}:${item.id}`;
      return `
        <g class="annotation-feature-group">
          <circle
            class="annotation-marker ${colorClass}${isSelected ? " annotation-feature-selected" : ""}"
            cx="${item.x}"
            cy="${item.y}"
            r="9"
            data-feature-kind="${featureKind}"
            data-feature-id="${escapeHtml(item.id)}"
          />
          <text class="annotation-label" x="${item.x + 12}" y="${item.y - 12}">
            ${escapeHtml(item.label || item.id)}
          </text>
        </g>
      `;
    })
    .join("");

  const roundaboutMarkup = annotation.roundabouts
    .map((item) => {
      const isSelected = selectedKey === `roundabout:${item.id}`;
      return `
        <g class="annotation-feature-group">
          <circle
            class="annotation-roundabout${isSelected ? " annotation-feature-selected" : ""}"
            cx="${item.x}"
            cy="${item.y}"
            r="${item.radius_px}"
            data-feature-kind="roundabout"
            data-feature-id="${escapeHtml(item.id)}"
          />
          <circle
            class="annotation-roundabout-center${isSelected ? " annotation-feature-selected" : ""}"
            cx="${item.x}"
            cy="${item.y}"
            r="7"
            data-feature-kind="roundabout"
            data-feature-id="${escapeHtml(item.id)}"
          />
          <text class="annotation-label" x="${item.x + item.radius_px + 12}" y="${item.y - 12}">
            ${escapeHtml(item.label || item.id)}
          </text>
        </g>
      `;
    })
    .join("");

  const buildingRegionMarkup = annotation.building_regions
    .map((region) => buildBuildingRegionOverlayMarkup(region, selectedKey === `building_region:${region.id}`))
    .join("");

  const sceneRegionMarkup = annotation.regions
    .filter((region) => region.region_role === "scene_region")
    .map((region) => buildRegionOverlayMarkup(region, selectedKey === `region:${region.id}`))
    .join("");

  const explicitRegionMarkup = annotation.regions
    .filter((region) => region.region_role !== "scene_region")
    .map((region) => buildRegionOverlayMarkup(region, selectedKey === `region:${region.id}`))
    .join("");

  const derivedRegionMarkup = (annotation.derived_regions ?? [])
    .map((region) => buildRegionOverlayMarkup(region, selectedKey === `region:${region.id}`))
    .join("");

  const functionalZoneMarkup = annotation.functional_zones
    .map((zone) => buildFunctionalZoneOverlayMarkup(zone, selectedKey === `functional_zone:${zone.id}`))
    .join("");

  const surfaceAnnotationMarkup = annotation.surface_annotations
    .map((surface) => buildSurfaceAnnotationOverlayMarkup(annotation, surface, selectedKey === `surface_annotation:${surface.id}`))
    .join("");

  const stationStripPatchMarkup = annotation.station_strip_patches
    .map((patch) => buildStationStripPatchOverlayMarkup(annotation, patch))
    .join("");

  const draftMarkup =
    draftCenterline.length > 0
      ? `
        <g class="annotation-feature-group">
          <polyline
            class="annotation-centerline annotation-centerline-draft"
            points="${draftCenterline.map((point) => `${point.x},${point.y}`).join(" ")}"
            style="stroke-width: ${getDisplayCenterlineWidthPx(annotation.pixels_per_meter)}px"
          />
          ${draftCenterline
            .map(
              (point, index) => `
                <circle class="annotation-vertex annotation-vertex-draft" cx="${point.x}" cy="${point.y}" r="5" />
                <text class="annotation-label" x="${point.x + 10}" y="${point.y - 10}">
                  p${index + 1}
                </text>
              `,
            )
            .join("")}
        </g>
      `
      : "";

  const manualJunctionIds = new Set((annotation.junction_compositions ?? []).map((c) => c.junctionId));
  const derivedJunctionMarkup = buildDerivedJunctionOverlayMarkup(junctionOverlays, selection, junctionOverlayOptions, manualJunctionIds);

  const manualCompositionMarkup = buildManualJunctionCompositionOverlayMarkup(annotation, selection);


  return `
    <svg
      id="annotation-overlay-svg"
      class="annotation-overlay-svg"
      viewBox="0 0 ${width} ${height}"
      data-hide-junction-outlines="${junctionOverlayOptions.showJunctionOutlines ? "false" : "true"}"
      role="img"
      aria-label="Reference annotation overlay"
    >
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
      ${sceneRegionMarkup}
      ${centerlineMarkup}
      ${stationStripPatchMarkup}
      ${surfaceAnnotationMarkup}
      ${derivedJunctionMarkup}
      ${manualCompositionMarkup}
      ${derivedRegionMarkup}
      ${explicitRegionMarkup}
      ${buildingRegionMarkup}
      ${functionalZoneMarkup}
      ${markerMarkup}
      ${roundaboutMarkup}
      ${buildBranchPreviewMarkup(branchHoverSnap, branchDraft)}
      ${buildCrossPreviewMarkup(crossHoverSnap, crossDraft)}
      ${buildBuildingRegionDraftMarkup(buildingRegionDraft)}
      ${buildFunctionalZoneDraftMarkup(functionalZoneDraft)}
      ${buildRegionDraftMarkup(regionDraft)}
      ${draftMarkup}
    </svg>
  `;
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseExplicitWgs84Bbox(value: string): Wgs84Bbox | null {
  const coordinates = value.split(",").map((item) => Number(item.trim()));
  if (
    coordinates.length !== 4
    || coordinates.some((item) => !Number.isFinite(item))
    || coordinates[0]! < -180
    || coordinates[2]! > 180
    || coordinates[1]! < -90
    || coordinates[3]! > 90
    || coordinates[0]! >= coordinates[2]!
    || coordinates[1]! >= coordinates[3]!
  ) {
    return null;
  }
  return [coordinates[0]!, coordinates[1]!, coordinates[2]!, coordinates[3]!];
}

async function readImageFileDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return `data:${file.type || "application/octet-stream"};base64,${window.btoa(binary)}`;
}

export type SceneGraphHostOptions = {
  mode?: "expert" | "course";
  onApproveAndGenerate?: (annotation: ReferenceAnnotation) => Promise<void>;
};

export function mountSceneGraphPage(
  shell: DesktopShell,
  workflow: WorkflowController,
  hostOptions: SceneGraphHostOptions = {},
): () => void {
  const root = shell.root;
  const courseMode = hostOptions.mode === "course";
  root.dataset.workbenchHost = courseMode ? "course" : "expert";
  const eventController = new AbortController();
  const { signal } = eventController;
  shell.setHints([
    { key: "sceneGraph.hints.loadPlan" },
    { key: "sceneGraph.hints.centerStage" },
    { key: "sceneGraph.hints.statusFeedback" },
  ]);
  shell.setLeftSections(createSceneGraphLeftSections());
  shell.setRightTabs(createSceneGraphRightTabs(), "source");
  shell.setMenuActions({
    "file-export-json": () => root.querySelector<HTMLButtonElement>("#annotation-download-json")?.click(),
    "tools-open-settings": () => shell.activateRightTab("view"),
    "tools-open-presets": () => shell.activateRightTab("data"),
    "help-shortcuts": () => {
      shell.setBottomOpen(true);
      root.querySelector<HTMLButtonElement>('[data-shell-status-tab="hints"]')?.click();
    },
  });
  shell.centerStage.innerHTML = createSceneGraphStageHtml();
  shell.statusStatusHost.innerHTML = createSceneGraphStatusHtml();
  shell.setStatusSummary({ key: "sceneGraph.status.annotationReady" });
  shell.setBottomOpen(true);
  applyViewerTranslations(root, loadViewerLanguage());

  const {
    backButton,
    planSelect,
    scenarioSelect,
    scenarioSelectData,
    imageInput,
    imageResetButton,
    showOriginalInput,
    showOverlayInput,
    showJunctionCoreInput,
    showJunctionConnectorsInput,
    showJunctionOutlinesInput,
    showJunctionCrosswalksInput,
    showJunctionBoundariesInput,
    showJunctionLabelsInput,
    showJunctionDebugInput,
    originalOpacityInput,
    overlayOpacityInput,
    pixelsPerMeterInput,
    roundaboutRadiusInput,
    finishCenterlineButton,
    autoSplitRegionsButton,
    selectAllRoadsButton,
    undoPointButton,
    deleteSelectedButton,
    resetAnnotationButton,
    snapToRoadInput,
    imageMetaEl,
    stageEl,
    zoomOutButton,
    zoomInButton,
    zoomFitButton,
    zoomLevelEl,
    stageEmptyEl,
    boardEl,
    originalImageEl,
    overlayHostEl,
    jsonFileInput,
    applyJsonButton,
    downloadJsonButton,
    copyJsonButton,
    jsonTextarea,
    statusEl,
    summaryGridEl,
    inspectorEl,
    segmentLengthInput,
    sidewalkWidthInput,
    convertGraphButton,
    downloadGraphButton,
    graphStatusEl,
    graphSummaryEl,
    graphTextarea,
    featureTableEl,
    assetEditorButton,
    sourceWorkflowEl,
    sourceImageImportButton,
    sourceGeojsonInput,
    sourceCoordinateSpaceSelect,
    sourceBboxInput,
    sourceAiPrompt,
    sourceAiExtractButton,
    sourceAiStatusEl,
    sourceOsmImportButton,
    sourceNormalizeButton,
    sourceStatusEl,
    sourceProvenanceEl,
    sourceCountsEl,
    sourceWarningsEl,
    sourceBackButton,
    sourceApproveButton,
    sourceGenerateButton,
    sourceReviewStatusEl,
  } = collectSceneGraphElements(root);

  const toolButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(".scene-tool-button"));
  const osmMapHostEl = root.querySelector<HTMLElement>("#annotation-osm-map");
  let courseOsmMap: MapLibreMap | null = null;

  const state = {
    referencePlans: [FALLBACK_REFERENCE_PLAN] as ReferencePlan[],
    scenarioDesigns: [] as ScenarioDesign[],
    selectedScenarioId: "",
    scenarioDesignsError: "",
    isScenarioDesignCatalogLoading: true,
    isScenarioDesignAnnotationLoading: false,
    isDerivingRegions: false,
    derivedRegionsStale: false,
    annotation: createEmptyAnnotation(),
    draftCenterline: [] as AnnotationPoint[],
    selectedTool: "select" as Tool,
    selection: null as Selection,
    selectedStripId: null as string | null,
    drag: null as DragState,
    currentImageUrl: "",
    currentObjectUrl: "",
    graphResult: null as ConvertedGraphPayload | null,
    showOriginal: true,
    showOverlay: true,
    showJunctionCore: true,
    showJunctionConnectors: true,
    showJunctionOutlines: false,
    showJunctionCrosswalks: false,
    showJunctionBoundaries: false,
    showJunctionLabels: false,
    showJunctionDebug: false,
    originalOpacity: 1,
    overlayOpacity: 0.88,
    defaultRoundaboutRadiusPx: DEFAULT_ROUNDABOUT_RADIUS_PX,
    isReferenceImageLoading: true,
    referenceImageLoadingMessage: DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE,
    previewResize: null as null | {
      pointerId: number;
      centerlineId: string;
      leftStripId: string;
      rightStripId: string;
      startClientX: number;
      startLeftWidthM: number;
      startRightWidthM: number;
      pairWidthPx: number;
      didResize: boolean;
    },
    pendingFurnitureKind: "bench" as FurnitureKind,
    furniturePlacement: null as null | {
      centerlineId: string;
      stripId: string;
      kind: FurnitureKind;
    },
    branchHoverSnap: null as BranchSnapTarget | null,
    branchDraft: null as BranchDraft | null,
    crossHoverSnap: null as BranchSnapTarget | null,
    crossDraft: null as CrossDraft | null,
    snapToRoadEnabled: true,
    viewportScale: 1,
    viewportSpacePressed: false,
    viewportPan: null as null | {
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startScrollLeft: number;
      startScrollTop: number;
    },
  };

  const retainedNormalizedSource = workflow.getSnapshot().normalized;
  let pendingOsmNormalization: NormalizedSceneSourceResponse | null = retainedNormalizedSource?.sourceContext.aligned_buildings?.length
    ? {
        annotation: retainedNormalizedSource.referenceAnnotation,
        graph: retainedNormalizedSource.graph as ConvertedGraphPayload["graph"],
        summary: { ...retainedNormalizedSource.featureCounts },
        source: retainedNormalizedSource.source as NormalizedSceneSourceResponse["source"],
        geojson: retainedNormalizedSource.geojson as Record<string, unknown> | null,
        warnings: [...retainedNormalizedSource.warnings],
        aligned_buildings: [...retainedNormalizedSource.sourceContext.aligned_buildings] as NormalizedSceneSourceResponse["aligned_buildings"],
        source_alignment: retainedNormalizedSource.sourceContext.source_alignment as NormalizedSceneSourceResponse["source_alignment"],
      }
    : null;
  let uploadedImageDataUrl = workflow.getSnapshot().sourceImageDataUrl ?? "";

  function sourceImageReference(requireBbox: boolean): SourceImageReference {
    const bbox = parseExplicitWgs84Bbox(sourceBboxInput.value);
    if (requireBbox && !bbox) {
      throw new Error("Enter an explicit valid WGS84 bbox [west, south, east, north].");
    }
    const image: SourceImageReference = {
      width_px: Math.max(1, state.annotation.image_width_px || originalImageEl.naturalWidth),
      height_px: Math.max(1, state.annotation.image_height_px || originalImageEl.naturalHeight),
      pixels_per_meter: Math.max(0.1, state.annotation.pixels_per_meter),
    };
    if (bbox) image.bbox_wgs84 = bbox;
    return image;
  }

  function combineWithOsmContext(
    payload: NormalizedSceneSourceResponse,
    osmPayload: NormalizedSceneSourceResponse | null,
  ): NormalizedSceneSourceResponse {
    if (!osmPayload) return payload;
    return {
      ...payload,
      geojson: osmPayload.geojson ?? payload.geojson,
      warnings: [...new Set([...payload.warnings, ...osmPayload.warnings])],
      aligned_buildings: osmPayload.aligned_buildings,
      source_alignment: osmPayload.source_alignment,
    };
  }

  function renderSourceWorkflow(): void {
    const snapshot = workflow.getSnapshot();
    const reviewVisible = snapshot.step === "review" && Boolean(snapshot.normalized);
    sourceWorkflowEl.dataset.step = reviewVisible ? "review" : "source";
    const sourcePanel = sourceWorkflowEl.querySelector<HTMLElement>('[data-workflow-panel="source"]');
    const reviewPanel = sourceWorkflowEl.querySelector<HTMLElement>('[data-workflow-panel="review"]');
    if (sourcePanel) sourcePanel.hidden = reviewVisible;
    if (reviewPanel) reviewPanel.hidden = !reviewVisible;

    const normalized = snapshot.normalized;
    if (normalized) {
      const source = normalized.source;
      sourceProvenanceEl.innerHTML = `
        <strong>${escapeHtml(String(source.source_id ?? (state.annotation.plan_id || "source")))}</strong>
        <span>${escapeHtml(String(source.kind ?? "reference_annotation"))} · ${escapeHtml(String(source.producer ?? "manual"))}</span>
        <span>annotation ${escapeHtml(String(source.normalized_annotation_version ?? state.annotation.version))} · normalized ${escapeHtml(normalized.normalizedAt)}</span>
        <span>alignment ${escapeHtml(String((normalized.sourceContext.source_alignment as Record<string, unknown> | null)?.status ?? "n/a"))}</span>
      `;
      sourceCountsEl.innerHTML = Object.entries(normalized.featureCounts)
        .map(([label, count]) => `<div class="scene-metric-card"><span>${escapeHtml(label.replace(/_/g, " "))}</span><strong>${count}</strong></div>`)
        .join("");
      sourceWarningsEl.innerHTML = normalized.warnings.length
        ? normalized.warnings.map((warning) => `<div class="scene-source-warning">${escapeHtml(warning)}</div>`).join("")
        : '<div class="scene-source-warning" data-tone="ok">No normalization warnings.</div>';
      sourceReviewStatusEl.textContent = snapshot.approvedSourceRevision === snapshot.sourceRevision
        ? "Approved. Generate & Load will submit the inline annotation and aligned context."
        : "Review is ready for approval.";
      sourceReviewStatusEl.dataset.tone = snapshot.approvedSourceRevision === snapshot.sourceRevision ? "success" : "neutral";
    }

    const llm = snapshot.capabilities?.llm as Record<string, unknown> | undefined;
    const vision = llm?.vision as Record<string, unknown> | undefined;
    const visionConfigured = vision?.configured === true;
    sourceAiExtractButton.disabled = !visionConfigured || Boolean(snapshot.busy.extract);
    sourceAiStatusEl.textContent = visionConfigured
      ? `${String(llm?.provider ?? "configured")} · ${String(vision?.model ?? "vision model")} · credentials remain server-side`
      : "Vision extraction is not configured. Manual tracing and imports remain available.";
    sourceAiStatusEl.dataset.tone = visionConfigured ? "success" : "neutral";

    sourceNormalizeButton.disabled = Boolean(snapshot.busy.normalize);
    sourceOsmImportButton.disabled = Boolean(snapshot.busy.osm);
    sourceApproveButton.disabled = !normalized || Boolean(snapshot.busy.generate);
    sourceGenerateButton.disabled = courseMode
      ? state.annotation.centerlines.length === 0 || Boolean(snapshot.busy.generate)
      : !normalized || Boolean(snapshot.busy.generate);
    if (snapshot.lastError && root.isConnected) {
      sourceStatusEl.textContent = snapshot.lastError;
      sourceStatusEl.dataset.tone = "error";
    }
  }

  function applyNormalizedSourcePayload(payload: NormalizedSceneSourceResponse, status: string): void {
    state.annotation = normalizeAnnotation(payload.annotation);
    state.graphResult = {
      ...payload,
      annotation: cloneAnnotation(state.annotation),
    };
    state.selectedScenarioId = "";
    clearAnnotationEditingState();
    updateCleanAnnotationSnapshot();
    workflow.setNormalizedSource(toNormalizedSceneSource(payload));
    setStatus(sourceStatusEl, status, "success");
    setStatus(graphStatusEl, "Graph conversion complete through the shared source normalizer.", "success");
    renderScenarioDesignOptions();
    renderAll();
    renderSourceWorkflow();
  }

  async function normalizeCurrentSceneSource(): Promise<void> {
    const token = workflow.beginRequest("normalize");
    workflow.clearError();
    setStatus(sourceStatusEl, "Normalizing source into ReferenceAnnotation…", "neutral");
    try {
      const sourceSnapshot = workflow.getSnapshot();
      let payload: NormalizedSceneSourceResponse;
      if (sourceSnapshot.sourceGeojson) {
        const coordinateSpace = sourceCoordinateSpaceSelect.value === "EPSG:4326" ? "EPSG:4326" : "image_px";
        payload = await normalizeSceneSource({
          source: {
            kind: "geojson",
            source_id: sourceSnapshot.sourceFileName || "imported_geojson",
            producer: "import",
            coordinate_space: coordinateSpace,
            geojson: sourceSnapshot.sourceGeojson as Record<string, unknown>,
            image: sourceImageReference(coordinateSpace === "EPSG:4326"),
          },
        }, token.signal);
      } else {
        payload = await normalizeSceneSource({
          source: {
            kind: "reference_annotation",
            source_id: state.annotation.plan_id || "manual_reference_annotation",
            producer: sourceSnapshot.sourceKind === "ai_extraction" ? "ai" : sourceSnapshot.sourceKind === "scenario_design" ? "catalog" : sourceSnapshot.sourceKind === "annotation_json" ? "import" : "manual",
            annotation: cloneAnnotation(state.annotation),
          },
          compose_config: {
            sidewalk_width_m: Math.max(1, asNumber(sidewalkWidthInput.value, DEFAULT_SIDEWALK_WIDTH_M)),
            segment_length_m: Math.max(4, asNumber(segmentLengthInput.value, DEFAULT_SEGMENT_LENGTH_M)),
          },
        }, token.signal);
      }
      if (!token.isCurrent()) return;
      applyNormalizedSourcePayload(combineWithOsmContext(payload, pendingOsmNormalization), "Source normalized. Review provenance and warnings.");
      workflow.endRequest(token);
    } catch (error) {
      if (workflow.endRequest(token, error)) {
        setStatus(sourceStatusEl, error instanceof Error ? error.message : "Source normalization failed.", "error");
        renderSourceWorkflow();
      }
    }
  }

  async function currentImageDataUrl(token: { signal: AbortSignal }): Promise<string> {
    if (uploadedImageDataUrl.startsWith("data:image/")) return uploadedImageDataUrl;
    if (!state.currentImageUrl) throw new Error("Load a reference image before AI extraction.");
    const response = await fetch(state.currentImageUrl, { signal: token.signal });
    if (!response.ok) throw new Error(`Failed to read the reference image (${response.status}).`);
    return readImageFileDataUrl(new File([await response.blob()], state.annotation.image_path || "reference.png"));
  }

  async function extractCurrentReferenceImage(): Promise<void> {
    const token = workflow.beginRequest("extract");
    workflow.clearError();
    setStatus(sourceStatusEl, "Extracting annotation with the configured vision model…", "neutral");
    try {
      const imageDataUrl = await currentImageDataUrl(token);
      const payload = await extractSceneSource({
        source_id: state.annotation.plan_id || "vision_reference",
        image_data_url: imageDataUrl,
        prompt: sourceAiPrompt.value.trim() || undefined,
        image: sourceImageReference(false),
      }, token.signal);
      if (!token.isCurrent()) return;
      workflow.setSourceDraft({
        kind: "ai_extraction",
        imageDataUrl,
        fileName: state.annotation.image_path || "reference.png",
        geojson: null,
      });
      uploadedImageDataUrl = imageDataUrl;
      applyNormalizedSourcePayload(combineWithOsmContext(payload, pendingOsmNormalization), "AI extraction normalized. Review before generation.");
      workflow.endRequest(token);
    } catch (error) {
      if (workflow.endRequest(token, error)) {
        setStatus(sourceStatusEl, error instanceof Error ? error.message : "AI extraction failed.", "error");
        renderSourceWorkflow();
      }
    }
  }

  async function importOsmContext(): Promise<void> {
    const bbox = parseExplicitWgs84Bbox(sourceBboxInput.value);
    if (!bbox) {
      setStatus(sourceStatusEl, "OSM import requires an explicit valid WGS84 bbox.", "error");
      return;
    }
    const token = workflow.beginRequest("osm");
    workflow.clearError();
    setStatus(sourceStatusEl, "Loading OSM roads, buildings, land use and POI…", "neutral");
    try {
      const osmNormalized = await loadOsmSceneSource({
        source_id: `${state.annotation.plan_id || "source"}_osm_context`,
        aoi_bbox: bbox,
      }, token.signal);
      if (!token.isCurrent()) return;
      pendingOsmNormalization = osmNormalized;
      applyNormalizedSourcePayload(
        osmNormalized,
        `OSM loaded into ReferenceAnnotation with ${osmNormalized.annotation.centerlines.length} roads and ${osmNormalized.aligned_buildings.length} locked building masses.`,
      );
      workflow.endRequest(token);
    } catch (error) {
      if (workflow.endRequest(token, error)) {
        setStatus(sourceStatusEl, error instanceof Error ? error.message : "OSM building import failed.", "error");
        renderSourceWorkflow();
      }
    }
  }

  async function generateApprovedScene(): Promise<void> {
    if (courseMode && hostOptions.onApproveAndGenerate) {
      sourceGenerateButton.disabled = true;
      setStatus(sourceReviewStatusEl, "Saving the complete annotation and starting the course baseline…", "neutral");
      try {
        await hostOptions.onApproveAndGenerate(cloneAnnotation(state.annotation));
        setStatus(sourceReviewStatusEl, "Annotation approved. The course generation job is running.", "success");
      } catch (error) {
        setStatus(sourceReviewStatusEl, error instanceof Error ? error.message : "Course generation failed to start.", "error");
        renderSourceWorkflow();
      }
      return;
    }
    const beforeApproval = workflow.getSnapshot();
    if (!beforeApproval.normalized) {
      setStatus(sourceReviewStatusEl, "Normalize and review a source first.", "error");
      return;
    }
    if (beforeApproval.approvedSourceRevision !== beforeApproval.sourceRevision) {
      workflow.transition("review");
      setStatus(sourceReviewStatusEl, "Approve the reviewed source before generation.", "error");
      return;
    }
    const normalized = workflow.getSnapshot().normalized;
    if (!normalized || !workflow.setGenerationStarted().ok) return;
    const token = workflow.beginRequest("generate");
    try {
      const created = await submitWorkflowSceneJob({
        normalized,
        prompt: "Generate and load the approved student reference annotation.",
        presetId: "custom",
        signal: token.signal,
      });
      for (let attempt = 0; attempt < 360; attempt += 1) {
        if (!token.isCurrent()) return;
        const payload = await loadSceneJob(created.job_id, token.signal);
        if (payload.status === "succeeded" && payload.result?.scene_layout_path) {
          workflow.setGeneratedScene({
            layoutPath: payload.result.scene_layout_path,
            contextMassing: {
              aligned_building_count: normalized.sourceContext.aligned_buildings?.length ?? 0,
              source_alignment: normalized.sourceContext.source_alignment ?? null,
            },
          });
          workflow.endRequest(token);
          return;
        }
        if (payload.status === "failed") throw new Error(payload.error || "Scene generation failed.");
        await sleep(1000);
      }
      throw new Error("Scene generation timed out.");
    } catch (error) {
      workflow.endRequest(token, error);
    }
  }

  const unsubscribeWorkflow = workflow.subscribe(renderSourceWorkflow);

  let cleanAnnotationSnapshot = comparableAnnotationSnapshot(state.annotation);
  let autoGraphTimer: number | null = null;
  let autoGraphInFlight = false;
  let autoGraphPending = false;

  function comparableAnnotationSnapshot(annotation: ReferenceAnnotation): string {
    const snapshot = cloneAnnotation(annotation);
    for (const centerline of snapshot.centerlines) {
      syncCenterlineDerivedFields(centerline);
    }
    return stringifyAnnotation(snapshot);
  }

  function updateCleanAnnotationSnapshot(): void {
    cleanAnnotationSnapshot = comparableAnnotationSnapshot(state.annotation);
  }

  function isAnnotationDirty(): boolean {
    return comparableAnnotationSnapshot(state.annotation) !== cleanAnnotationSnapshot;
  }

  function canConvertGraph(): boolean {
    return state.annotation.centerlines.length > 0;
  }

  function scheduleAutoGraphConversion(delayMs = 900): void {
    if (!canConvertGraph()) {
      return;
    }
    if (autoGraphInFlight) {
      autoGraphPending = true;
      return;
    }
    if (autoGraphTimer !== null) {
      window.clearTimeout(autoGraphTimer);
    }
    autoGraphTimer = window.setTimeout(() => {
      autoGraphTimer = null;
      void runAutoGraphConversion();
    }, delayMs);
  }

  async function runAutoGraphConversion(): Promise<void> {
    if (!canConvertGraph()) {
      return;
    }
    if (autoGraphInFlight) {
      autoGraphPending = true;
      return;
    }
    autoGraphInFlight = true;
    autoGraphPending = false;
    renderAll();
    try {
      await convertAnnotationToGraph({ automatic: true });
    } catch (error) {
      setStatus(graphStatusEl, error instanceof Error ? error.message : "Failed to convert annotation.", "error");
    } finally {
      autoGraphInFlight = false;
      renderAll();
      if (autoGraphPending) {
        scheduleAutoGraphConversion();
      }
    }
  }

  async function deriveBuildingRegions(): Promise<void> {
    if (state.isDerivingRegions) {
      return;
    }
    if (!state.annotation.regions.some((region) => region.region_role === "scene_region")) {
      setStatus(statusEl, "Draw a Scene Region first. Roads and design surfaces will cut building regions from it.", "neutral");
      setTool("scene_region");
      return;
    }
    state.isDerivingRegions = true;
    autoSplitRegionsButton.disabled = true;
    setStatus(statusEl, "Auto splitting building regions from scene boundary...", "neutral");
    try {
      const response = await fetch(`${API_BASE}/api/reference-annotations/derive-regions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotation: state.annotation,
          options: { min_area_m2: 12 },
        }),
      });
      if (!response.ok) {
        const detail = await readApiErrorDetail(response);
        throw new Error(detail || `Auto split failed with ${response.status}.`);
      }
      const payload = await response.json() as {
        derived_regions?: unknown[];
        summary?: Record<string, unknown>;
        warnings?: unknown[];
      };
      state.annotation.derived_regions = Array.isArray(payload.derived_regions)
        ? payload.derived_regions.map((item, index) => normalizeRegion(item, index, "building_region"))
        : [];
      state.derivedRegionsStale = false;
      state.selection = state.annotation.derived_regions[0]
        ? { kind: "region", id: state.annotation.derived_regions[0].id }
        : state.selection;
      const count = state.annotation.derived_regions.length;
      const warningText = Array.isArray(payload.warnings) && payload.warnings.length
        ? ` ${payload.warnings.map((item) => String(item)).join(" ")}`
        : "";
      clearGraphResult("Derived building regions changed. Road graph will refresh automatically.");
      setStatus(statusEl, `Auto split produced ${count} building region${count === 1 ? "" : "s"}.${warningText}`, count > 0 ? "success" : "neutral");
      renderAll();
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : "Auto split regions failed.", "error");
    } finally {
      state.isDerivingRegions = false;
      autoSplitRegionsButton.disabled = false;
      renderAll();
    }
  }

  function clearGraphResult(reason: string, options: { autoConvert?: boolean } = {}): void {
    state.graphResult = null;
    graphTextarea.value = "";
    graphSummaryEl.innerHTML = buildGraphSummaryMarkup(null);
    const shouldAutoConvert = options.autoConvert ?? true;
    setStatus(graphStatusEl, shouldAutoConvert && canConvertGraph() ? "Road graph will update automatically after edits." : reason, "neutral");
    if (shouldAutoConvert) {
      scheduleAutoGraphConversion();
    }
  }

  function selectedCenterline(): AnnotatedCenterline | null {
    const feature = getSelectedFeature(state.annotation, state.selection);
    return state.selection?.kind === "centerline" && feature ? (feature as AnnotatedCenterline) : null;
  }

  function selectedStrip(centerline: AnnotatedCenterline | null = selectedCenterline()): AnnotatedCrossSectionStrip | null {
    if (!centerline || !state.selectedStripId) {
      return null;
    }
    return centerline.cross_section_strips.find((strip) => strip.strip_id === state.selectedStripId) ?? null;
  }

  function clearFurniturePlacement(): void {
    state.furniturePlacement = null;
  }

  function clearBranchDraft(): void {
    state.branchHoverSnap = null;
    state.branchDraft = null;
  }

  function clearCrossDraft(): void {
    state.crossHoverSnap = null;
    state.crossDraft = null;
  }

  function commitFunctionalZoneDraft(): void {
    if (state.drag?.kind !== "functional_zone_draw") {
      return;
    }
    const points = state.drag.points;
    if (points.length < 3) {
      setStatus(statusEl, "Functional region needs at least 3 points. Keep clicking to add vertices.", "neutral");
      return;
    }
    const id = nextFeatureId(state.annotation, "functional_region");
    state.annotation.regions.push({
      id,
      label: "Functional Region",
      region_role: "functional_zone",
      kind: "plaza",
      points: points.map((p) => ({ ...p })),
      derived: false,
      material: { preset: "functional_region" },
    });
    state.selection = { kind: "region", id };
    state.selectedStripId = null;
    clearFurniturePlacement();
    state.drag = null;
    markAnnotationChanged(`Added functional region ${id}.`);
    renderAll();
  }

  function commitRegionDraft(): void {
    if (state.drag?.kind !== "region_draw" && state.drag?.kind !== "region_box_draw") {
      return;
    }
    const points = state.drag.kind === "region_box_draw"
      ? regionBoxPoints(state.drag.startPoint, state.drag.currentPoint)
      : state.drag.points;
    if (points.length < 3) {
      setStatus(statusEl, "Scene region needs an area. Drag a box on the reference plan.", "neutral");
      return;
    }
    const boundsWidth = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const boundsHeight = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
    if (Math.max(boundsWidth, boundsHeight) < 6) {
      state.drag = null;
      setStatus(statusEl, "Scene region box was too small. Drag to define the full scene boundary.", "neutral");
      renderAll();
      return;
    }
    const role = state.drag.regionRole;
    const id = nextFeatureId(state.annotation, role === "scene_region" ? "scene_region" : "region");
    state.annotation.regions.push({
      id,
      label: role === "scene_region" ? "Scene Region" : id,
      region_role: role,
      points: points.map((p) => ({ ...p })),
      derived: false,
      material: role === "scene_region" ? { preset: "scene_region_boundary" } : {},
    });
    state.selection = { kind: "region", id };
    state.selectedStripId = null;
    clearFurniturePlacement();
    state.drag = null;
    state.derivedRegionsStale = true;
    markAnnotationChanged(role === "scene_region" ? "Added scene region. Auto Split can derive building regions from it." : `Added ${regionRoleLabel(role)} ${id}.`);
    renderAll();
  }

  function markAnnotationChanged(statusMessage?: string): void {
    state.derivedRegionsStale = true;
    clearGraphResult("Annotation changed. Road graph will refresh automatically.");
    workflow.setSourceDraft({
      kind: "manual_annotation",
      imageDataUrl: uploadedImageDataUrl || undefined,
      fileName: state.annotation.image_path || undefined,
      geojson: null,
    });
    renderSourceWorkflow();
    if (statusMessage) {
      setStatus(statusEl, statusMessage, "success");
    }
  }

  function revealJunctionSurfaceLayers(): void {
    state.showJunctionCore = true;
    state.showJunctionConnectors = true;
  }

  function revokeCurrentObjectUrl(): void {
    if (state.currentObjectUrl) {
      URL.revokeObjectURL(state.currentObjectUrl);
      state.currentObjectUrl = "";
    }
  }

  function hasAnnotationCanvas(): boolean {
    return Boolean(state.currentImageUrl) || (
      courseMode
      && state.annotation.image_width_px > 0
      && state.annotation.image_height_px > 0
    );
  }

  function courseOsmBbox(): [number, number, number, number] | null {
    const alignment = workflow.getSnapshot().normalized?.sourceContext.source_alignment as Record<string, unknown> | null | undefined;
    const sourceFrame = alignment?.source_frame;
    const bbox = sourceFrame && typeof sourceFrame === "object"
      ? (sourceFrame as Record<string, unknown>).bbox_wgs84
      : null;
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(Number(value)))) return null;
    const result = bbox.map(Number) as [number, number, number, number];
    return result[0] < result[2] && result[1] < result[3] ? result : null;
  }

  function mountCourseOsmBackground(): void {
    if (!courseMode || !osmMapHostEl || courseOsmMap) return;
    const bbox = courseOsmBbox();
    if (!bbox) return;
    osmMapHostEl.hidden = false;
    const map = new maplibregl.Map({
      container: osmMapHostEl,
      interactive: false,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.72 } }],
      },
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 0, duration: 0, maxZoom: 19 });
    courseOsmMap = map;
    window.requestAnimationFrame(() => map.resize());
  }

  function renderViewportControls(): void {
    const hasCanvas = hasAnnotationCanvas();
    boardEl.style.transform = `scale(${state.viewportScale})`;
    zoomLevelEl.value = `${Math.round(state.viewportScale * 100)}%`;
    zoomOutButton.disabled = !hasCanvas || state.viewportScale <= ANNOTATION_MIN_ZOOM;
    zoomInButton.disabled = !hasCanvas || state.viewportScale >= ANNOTATION_MAX_ZOOM;
    zoomFitButton.disabled = !hasCanvas;
    stageEl.dataset.zoomed = state.viewportScale > 1 ? "true" : "false";
    stageEl.dataset.panReady = state.viewportSpacePressed ? "true" : "false";
    stageEl.dataset.panning = state.viewportPan ? "true" : "false";
  }

  function setViewportScale(
    requestedScale: number,
    anchorClientX = stageEl.getBoundingClientRect().left + stageEl.clientWidth / 2,
    anchorClientY = stageEl.getBoundingClientRect().top + stageEl.clientHeight / 2,
  ): void {
    if (!hasAnnotationCanvas()) return;
    const nextScale = clamp(requestedScale, ANNOTATION_MIN_ZOOM, ANNOTATION_MAX_ZOOM);
    const oldScale = state.viewportScale;
    if (Math.abs(nextScale - oldScale) < 0.001) return;

    const boardRect = boardEl.getBoundingClientRect();
    const anchorX = clamp(anchorClientX, boardRect.left, boardRect.right);
    const anchorY = clamp(anchorClientY, boardRect.top, boardRect.bottom);
    const boardPointX = (anchorX - boardRect.left) / oldScale;
    const boardPointY = (anchorY - boardRect.top) / oldScale;

    state.viewportScale = nextScale;
    renderViewportControls();
    stageEl.scrollLeft += boardPointX * (nextScale - oldScale);
    stageEl.scrollTop += boardPointY * (nextScale - oldScale);
  }

  function resetViewport(): void {
    state.viewportScale = 1;
    state.viewportPan = null;
    stageEl.scrollLeft = 0;
    stageEl.scrollTop = 0;
    renderViewportControls();
  }

  function isEditableKeyboardTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
  }

  function beginViewportPan(event: PointerEvent): boolean {
    const shouldPan = event.button === 1 || (event.button === 0 && state.viewportSpacePressed);
    if (!shouldPan || !hasAnnotationCanvas()) return false;
    state.viewportPan = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: stageEl.scrollLeft,
      startScrollTop: stageEl.scrollTop,
    };
    stageEl.focus({ preventScroll: true });
    renderViewportControls();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function updateStageVisibility(): void {
    const hasImage = Boolean(state.currentImageUrl);
    const hasCanvas = hasAnnotationCanvas();
    stageEl.dataset.hasImage = hasImage ? "true" : "false";
    stageEl.dataset.hasCanvas = hasCanvas ? "true" : "false";
    const viewportShellEl = stageEl.closest<HTMLElement>(".scene-canvas-viewport-shell");
    if (viewportShellEl) viewportShellEl.dataset.hasCanvas = hasCanvas ? "true" : "false";
    stageEl.dataset.loading = state.isReferenceImageLoading ? "true" : "false";
    stageEl.dataset.emptyState = hasCanvas ? "ready" : state.isReferenceImageLoading ? "loading" : "empty";
    boardEl.hidden = !hasCanvas;
    boardEl.style.aspectRatio = hasCanvas
      ? `${state.annotation.image_width_px} / ${state.annotation.image_height_px}`
      : "";
    stageEmptyEl.hidden = hasCanvas;
    if (!hasCanvas) {
      const loadingDefaultPlan = state.referenceImageLoadingMessage === DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE;
      const i18nKey = state.isReferenceImageLoading && loadingDefaultPlan
        ? "sceneGraph.status.loadingDefaultPlan"
        : !state.isReferenceImageLoading
          ? "sceneGraph.status.loadReferenceImage"
          : null;
      if (i18nKey) {
        stageEmptyEl.dataset.i18nKey = i18nKey;
        stageEmptyEl.textContent = translateViewerKey(loadViewerLanguage(), i18nKey) ?? (
          state.isReferenceImageLoading
            ? DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE
            : "Load a reference plan image to start annotating."
        );
      } else {
        stageEmptyEl.removeAttribute("data-i18n-key");
        stageEmptyEl.textContent = state.referenceImageLoadingMessage;
      }
    }
    originalImageEl.hidden = !hasImage || !state.showOriginal;
    originalImageEl.style.opacity = String(state.originalOpacity);
    overlayHostEl.hidden = !state.showOverlay;
    overlayHostEl.style.opacity = String(state.overlayOpacity);
    renderViewportControls();
  }

  function syncJsonTextarea(force = false): void {
    if (!force && document.activeElement === jsonTextarea) {
      return;
    }
    jsonTextarea.value = stringifyAnnotation(state.annotation);
  }

  function renderToolButtons(): void {
    for (const button of toolButtons) {
      button.dataset.active = button.dataset.tool === state.selectedTool ? "true" : "false";
    }
    autoSplitRegionsButton.disabled = state.isDerivingRegions;
    autoSplitRegionsButton.dataset.active = state.isDerivingRegions ? "true" : "false";
    autoSplitRegionsButton.title = state.derivedRegionsStale
      ? "Building regions are stale. Auto Split will recompute from scene region and roads."
      : "Auto split building regions from the scene region.";
  }

  function mergeReferencePlans(items: ReferencePlan[]): void {
    const byId = new Map<string, ReferencePlan>();
    for (const plan of [...state.referencePlans, ...items]) {
      byId.set(plan.plan_id, plan);
    }
    state.referencePlans = Array.from(byId.values());
  }

  function renderReferencePlanOptions(preferredPlanId?: string): void {
    const options = [
      `<option value="">Choose a reference plan</option>`,
      ...state.referencePlans.map(
        (plan) => `<option value="${escapeHtml(plan.plan_id)}">${escapeHtml(plan.label || plan.plan_id)}</option>`,
      ),
    ];
    planSelect.innerHTML = options.join("");
    const resolvedPlanId =
      (preferredPlanId && state.referencePlans.some((plan) => plan.plan_id === preferredPlanId) ? preferredPlanId : "") ||
      (state.annotation.plan_id && state.referencePlans.some((plan) => plan.plan_id === state.annotation.plan_id)
        ? state.annotation.plan_id
        : "") ||
      state.referencePlans[0]?.plan_id ||
      "";
    planSelect.value = resolvedPlanId;
  }

  function scenarioDesignSelects(): HTMLSelectElement[] {
    return [scenarioSelect, scenarioSelectData];
  }

  function renderScenarioDesignOptions(preferredScenarioId?: string): void {
    const loading = state.isScenarioDesignCatalogLoading;
    const unavailable = Boolean(state.scenarioDesignsError);
    const placeholder = loading
      ? "Loading scenario designs..."
      : unavailable
        ? "Scenario designs unavailable"
        : "Choose scenario design / 选择方案";
    const options = [
      `<option value="">${escapeHtml(placeholder)}</option>`,
      ...state.scenarioDesigns.map(
        (item) => {
          const enabled = item.enabled !== false;
          const label = enabled
            ? (item.title_zh || item.scenario_id)
            : `${item.title_zh || item.scenario_id}（已忽略）`;
          return `<option value="${escapeHtml(item.scenario_id)}" ${enabled ? "" : "disabled"}>${escapeHtml(label)}</option>`;
        },
      ),
    ];
    const resolvedScenarioId =
      (preferredScenarioId && state.scenarioDesigns.some((item) => item.scenario_id === preferredScenarioId && item.enabled !== false)
        ? preferredScenarioId
        : "") ||
      (state.selectedScenarioId && state.scenarioDesigns.some((item) => item.scenario_id === state.selectedScenarioId && item.enabled !== false)
        ? state.selectedScenarioId
        : "");
    for (const selectEl of scenarioDesignSelects()) {
      selectEl.innerHTML = options.join("");
      selectEl.value = resolvedScenarioId;
      selectEl.disabled = loading || unavailable || state.isScenarioDesignAnnotationLoading || state.scenarioDesigns.length === 0;
      selectEl.title = unavailable ? state.scenarioDesignsError : "";
    }
  }

  function renderInspector(): void {
    inspectorEl.innerHTML = buildInspectorMarkup(
      state.annotation,
      state.selection,
      state.selectedStripId,
      state.pendingFurnitureKind,
      Boolean(state.furniturePlacement),
    );
    inspectorEl.dataset.i18nScope = "literal";
    applyViewerTranslations(inspectorEl, loadViewerLanguage());
    const selectedFeature = getSelectedFeature(state.annotation, state.selection);
    if (!selectedFeature || !state.selection) {
      return;
    }
    if (state.selection.kind === "building_region") {
      const region = selectedFeature as AnnotatedBuildingRegion;
      const regionIdInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-region-id");
      const regionLabelInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-region-label");
      const regionCenterXInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-region-center-x");
      const regionCenterYInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-region-center-y");
      const regionWidthInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-region-width");
      const regionHeightInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-region-height");
      const regionYawInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-region-yaw");
      const updateRegion = (): void => {
        if (regionIdInput) {
          const nextId = regionIdInput.value.trim();
          if (nextId) {
            region.id = nextId;
            state.selection = { kind: "building_region", id: nextId };
          }
        }
        if (regionLabelInput) {
          region.label = regionLabelInput.value.trim() || region.id;
        }
        if (regionCenterXInput) {
          region.center_px.x = asNumber(regionCenterXInput.value, region.center_px.x);
        }
        if (regionCenterYInput) {
          region.center_px.y = asNumber(regionCenterYInput.value, region.center_px.y);
        }
        if (regionWidthInput) {
          region.width_px = Math.max(BUILDING_REGION_MIN_SIZE_PX, asNumber(regionWidthInput.value, region.width_px));
        }
        if (regionHeightInput) {
          region.height_px = Math.max(BUILDING_REGION_MIN_SIZE_PX, asNumber(regionHeightInput.value, region.height_px));
        }
        if (regionYawInput) {
          region.yaw_deg = normalizeAngleDeg(asNumber(regionYawInput.value, region.yaw_deg));
        }
        markAnnotationChanged();
        renderAll();
      };
      for (const input of [
        regionIdInput,
        regionLabelInput,
        regionCenterXInput,
        regionCenterYInput,
        regionWidthInput,
        regionHeightInput,
        regionYawInput,
      ]) {
        input?.addEventListener("input", updateRegion, { signal });
      }
      return;
    }
    if (state.selection.kind === "region") {
      const region = selectedFeature as AnnotatedRegion;
      const idInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-unified-region-id");
      const labelInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-unified-region-label");
      const roleSelect = inspectorEl.querySelector<HTMLSelectElement>("#annotation-unified-region-role");
      const updateRegion = (): void => {
        if (!region.derived && idInput) {
          const nextId = idInput.value.trim();
          if (nextId) {
            region.id = nextId;
            state.selection = { kind: "region", id: nextId };
          }
        }
        if (!region.derived && labelInput) {
          region.label = labelInput.value.trim() || region.id;
        }
        if (!region.derived && roleSelect && isRegionRole(roleSelect.value)) {
          region.region_role = roleSelect.value;
        }
        markAnnotationChanged();
        renderAll();
      };
      for (const input of [idInput, labelInput, roleSelect]) {
        input?.addEventListener("input", updateRegion, { signal });
        input?.addEventListener("change", updateRegion, { signal });
      }
      const materializeButton = inspectorEl.querySelector<HTMLButtonElement>("[data-action='materialize-derived-region']");
      materializeButton?.addEventListener("click", () => {
        const derived = (state.annotation.derived_regions ?? []).find((item) => item.id === region.id);
        if (!derived) {
          return;
        }
        const id = nextFeatureId(state.annotation, "building_region");
        state.annotation.regions.push({
          ...derived,
          id,
          label: derived.label || id,
          region_role: "building_region",
          derived: false,
          points: derived.points.map((point) => ({ ...point })),
        });
        state.selection = { kind: "region", id };
        markAnnotationChanged(`Materialized ${derived.id} as editable building region ${id}.`);
        renderAll();
      }, { signal });
      return;
    }
    if (state.selection.kind === "functional_zone") {
      const zone = selectedFeature as AnnotatedFunctionalZone;
      const zoneIdInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-zone-id");
      const zoneLabelInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-zone-label");
      const zoneKindSelect = inspectorEl.querySelector<HTMLSelectElement>("#annotation-zone-kind");
      const updateZone = (): void => {
        if (zoneIdInput) {
          const nextId = zoneIdInput.value.trim();
          if (nextId) {
            zone.id = nextId;
            state.selection = { kind: "functional_zone", id: nextId };
          }
        }
        if (zoneLabelInput) {
          zone.label = zoneLabelInput.value.trim() || zone.id;
        }
        if (zoneKindSelect) {
          const nextKind = zoneKindSelect.value;
          if (isFunctionalZoneKind(nextKind)) {
            zone.kind = nextKind;
          }
        }
        markAnnotationChanged();
        renderAll();
      };
      for (const input of [zoneIdInput, zoneLabelInput, zoneKindSelect]) {
        input?.addEventListener("input", updateZone, { signal });
        input?.addEventListener("change", updateZone, { signal });
      }
      return;
    }
    if (state.selection.kind === "surface_annotation") {
      const surface = selectedFeature as AnnotatedSurfaceAnnotation;
      const idInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-surface-id");
      const labelInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-surface-label");
      const kindSelect = inspectorEl.querySelector<HTMLSelectElement>("#annotation-surface-kind");
      const roleSelect = inspectorEl.querySelector<HTMLSelectElement>("#annotation-surface-role");
      const centerlineSelect = inspectorEl.querySelector<HTMLSelectElement>("#annotation-surface-centerline");
      const stationStartInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-surface-station-start");
      const stationEndInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-surface-station-end");
      const lateralStartInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-surface-lateral-start");
      const lateralEndInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-surface-lateral-end");
      const materialPresetInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-surface-material-preset");
      const colorHexInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-surface-color-hex");

      const normalizeSurfaceRange = (): void => {
        const centerline = state.annotation.centerlines.find((item) => item.id === surface.centerline_id) ?? null;
        const maxStation = centerline ? centerlineLengthM(centerline, state.annotation.pixels_per_meter) : Math.max(surface.station_end_m, 0.5);
        surface.station_start_m = clamp(surface.station_start_m, 0, Math.max(maxStation - 0.05, 0));
        surface.station_end_m = clamp(surface.station_end_m, surface.station_start_m + 0.05, maxStation);
        if (surface.lateral_end_m <= surface.lateral_start_m + 0.05) {
          surface.lateral_end_m = surface.lateral_start_m + 0.05;
        }
      };

      const updateSurface = (): void => {
        if (idInput) {
          const nextId = idInput.value.trim();
          if (nextId) {
            surface.id = nextId;
            state.selection = { kind: "surface_annotation", id: nextId };
          }
        }
        if (labelInput) {
          surface.label = labelInput.value.trim() || surface.id;
        }
        if (kindSelect) {
          const nextKind = kindSelect.value;
          if (isSurfaceAnnotationKind(nextKind)) {
            const kindChanged = surface.kind !== nextKind;
            surface.kind = nextKind;
            if (kindChanged) {
              surface.surface_role = DEFAULT_SURFACE_ROLE_BY_KIND[nextKind];
              surface.material = { ...surface.material, preset: DEFAULT_SURFACE_MATERIAL_BY_KIND[nextKind] };
            }
          }
        }
        if (roleSelect && isSurfaceRole(roleSelect.value)) {
          surface.surface_role = roleSelect.value;
        }
        if (centerlineSelect && state.annotation.centerlines.some((item) => item.id === centerlineSelect.value)) {
          surface.centerline_id = centerlineSelect.value;
        }
        if (stationStartInput) {
          surface.station_start_m = Math.max(0, asNumber(stationStartInput.value, surface.station_start_m));
        }
        if (stationEndInput) {
          surface.station_end_m = Math.max(0, asNumber(stationEndInput.value, surface.station_end_m));
        }
        if (lateralStartInput) {
          surface.lateral_start_m = asNumber(lateralStartInput.value, surface.lateral_start_m);
        }
        if (lateralEndInput) {
          surface.lateral_end_m = asNumber(lateralEndInput.value, surface.lateral_end_m);
        }
        if (materialPresetInput) {
          surface.material = { ...surface.material, preset: materialPresetInput.value.trim() || surface.material.preset };
        }
        if (colorHexInput) {
          const nextColor = colorHexInput.value.trim();
          surface.material = nextColor
            ? { ...surface.material, color_hex: nextColor.startsWith("#") ? nextColor : `#${nextColor}` }
            : { preset: surface.material.preset, texture_key: surface.material.texture_key };
        }
        normalizeSurfaceRange();
        markAnnotationChanged();
        renderAll();
      };

      for (const input of [
        idInput,
        labelInput,
        kindSelect,
        roleSelect,
        centerlineSelect,
        stationStartInput,
        stationEndInput,
        lateralStartInput,
        lateralEndInput,
        materialPresetInput,
        colorHexInput,
      ]) {
        input?.addEventListener("input", updateSurface, { signal });
        input?.addEventListener("change", updateSurface, { signal });
      }

      for (const button of Array.from(inspectorEl.querySelectorAll<HTMLButtonElement>("[data-action='apply-surface-preset']"))) {
        button.addEventListener("click", () => {
          const nextKind = button.dataset.surfaceKind ?? "";
          if (!isSurfaceAnnotationKind(nextKind)) {
            return;
          }
          surface.kind = nextKind;
          surface.surface_role = DEFAULT_SURFACE_ROLE_BY_KIND[nextKind];
          surface.material = {
            preset: DEFAULT_SURFACE_MATERIAL_BY_KIND[nextKind],
            ...(surface.material.color_hex ? { color_hex: surface.material.color_hex } : {}),
            ...(surface.material.texture_key ? { texture_key: surface.material.texture_key } : {}),
          };
          normalizeSurfaceRange();
          markAnnotationChanged(`Applied ${SURFACE_ANNOTATION_KIND_LABELS[nextKind]} preset.`);
          renderAll();
        }, { signal });
      }
      return;
    }
    const idInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-id");
    const labelInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-label");
    const xInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-x");
    const yInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-y");
    const kindInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-kind");
    const radiusInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-radius");
    const roadWidthInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-road-width");
    const referenceWidthInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-reference-width");
    const forwardDriveLaneInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-forward-drive-lanes");
    const reverseDriveLaneInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-reverse-drive-lanes");
    const bikeLaneInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-bike-lanes");
    const busLaneInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-bus-lanes");
    const parkingLaneInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-parking-lanes");
    const highwayTypeInput = inspectorEl.querySelector<HTMLInputElement>("#annotation-inspector-highway-type");
    const furnitureKindSelect = inspectorEl.querySelector<HTMLSelectElement>("#annotation-inspector-furniture-kind");

    const updateSelection = (): void => {
      const feature = getSelectedFeature(state.annotation, state.selection);
      if (!feature || !state.selection) {
        return;
      }
      if (idInput) {
        const nextId = idInput.value.trim();
        if (nextId) {
          if ("id" in feature) {
            const previousId = feature.id;
            feature.id = nextId;
            state.selection.id = nextId;
            if (state.selection.kind === "centerline") {
              const centerline = feature as AnnotatedCenterline;
              centerline.street_furniture_instances = centerline.street_furniture_instances.map((item) => ({
                ...item,
                centerline_id: nextId,
              }));
              if (state.furniturePlacement?.centerlineId === previousId) {
                state.furniturePlacement = { ...state.furniturePlacement, centerlineId: nextId };
              }
            }
          }
        }
      }
      if (labelInput && "label" in feature) {
        feature.label = labelInput.value.trim();
      }
      if (xInput && "x" in feature) {
        feature.x = asNumber(xInput.value, feature.x);
      }
      if (yInput && "y" in feature) {
        feature.y = asNumber(yInput.value, feature.y);
      }
      if (kindInput && "kind" in feature) {
        feature.kind = kindInput.value.trim() || feature.kind;
      }
      if (radiusInput && "radius_px" in feature) {
        feature.radius_px = Math.max(8, asNumber(radiusInput.value, feature.radius_px));
      }
      if (roadWidthInput && "road_width_m" in feature) {
        feature.road_width_m = Math.max(1, asNumber(roadWidthInput.value, feature.road_width_m));
      }
      if (referenceWidthInput && "reference_width_px" in feature) {
        const parsedWidth = asNullableNumber(referenceWidthInput.value);
        feature.reference_width_px = parsedWidth === null ? null : Math.max(1, parsedWidth);
      }
      if (forwardDriveLaneInput && "forward_drive_lane_count" in feature) {
        feature.forward_drive_lane_count = asNonNegativeInt(forwardDriveLaneInput.value, feature.forward_drive_lane_count);
      }
      if (reverseDriveLaneInput && "reverse_drive_lane_count" in feature) {
        feature.reverse_drive_lane_count = asNonNegativeInt(reverseDriveLaneInput.value, feature.reverse_drive_lane_count);
      }
      if (bikeLaneInput && "bike_lane_count" in feature) {
        feature.bike_lane_count = asNonNegativeInt(bikeLaneInput.value, feature.bike_lane_count);
      }
      if (busLaneInput && "bus_lane_count" in feature) {
        feature.bus_lane_count = asNonNegativeInt(busLaneInput.value, feature.bus_lane_count);
      }
      if (parkingLaneInput && "parking_lane_count" in feature) {
        feature.parking_lane_count = asNonNegativeInt(parkingLaneInput.value, feature.parking_lane_count);
      }
      if (highwayTypeInput && "highway_type" in feature) {
        feature.highway_type = highwayTypeInput.value.trim() || feature.highway_type;
      }
      if (state.selection.kind === "centerline") {
        syncCenterlineDerivedFields(feature as AnnotatedCenterline);
      }
      markAnnotationChanged();
      renderAll();
    };

    for (const input of [
      idInput,
      labelInput,
      xInput,
      yInput,
      kindInput,
      radiusInput,
      roadWidthInput,
      referenceWidthInput,
      forwardDriveLaneInput,
      reverseDriveLaneInput,
      bikeLaneInput,
      busLaneInput,
      parkingLaneInput,
      highwayTypeInput,
    ]) {
      input?.addEventListener("input", updateSelection, { signal });
    }

    furnitureKindSelect?.addEventListener(
      "change",
      () => {
        const value = asString(furnitureKindSelect.value, state.pendingFurnitureKind);
        state.pendingFurnitureKind = isFurnitureKind(value) ? value : state.pendingFurnitureKind;
        if (state.furniturePlacement) {
          state.furniturePlacement = { ...state.furniturePlacement, kind: state.pendingFurnitureKind };
        }
      },
      { signal },
    );

    const openComposerButton = inspectorEl.querySelector<HTMLButtonElement>("#annotation-open-junction-composer");
    openComposerButton?.addEventListener("click", () => {
      const junction = state.annotation.junctions.find((j) => j.id === state.selection?.id);
      if (!junction) return;
      const overlay = getJunctionOverlay(state.annotation, junction.id);
      if (!overlay || overlay.kind !== "cross_junction") return;
      void import("./junction-composer").then((mod) => {
        mod.mountJunctionComposer({
          root,
          annotation: state.annotation,
          junction,
          overlay,
          imageUrl: state.currentImageUrl,
          onSave: (composition) => {
            const existing = state.annotation.junction_compositions ?? [];
            const next = existing.filter((c) => c.junctionId !== composition.junctionId);
            next.push(composition);
            state.annotation.junction_compositions = next;
            markAnnotationChanged(`Updated junction composition for ${composition.junctionId}.`);
            renderAll();
          },
          onCancel: () => {
            // no-op
          },
        });
      });
    }, { signal });

    const centerline = selectedCenterline();
    if (!centerline) {
      return;
    }

    const stripInputs = Array.from(inspectorEl.querySelectorAll<HTMLElement>("[data-strip-field][data-strip-id]"));
    const stripActionButtons = Array.from(inspectorEl.querySelectorAll<HTMLButtonElement>("[data-action]"));
    const furnitureInputs = Array.from(inspectorEl.querySelectorAll<HTMLElement>("[data-furniture-field][data-instance-id]"));
    const previewResizeHandles = Array.from(
      inspectorEl.querySelectorAll<HTMLButtonElement>("[data-action='start-preview-resize']"),
    );

    const findStripById = (stripId: string): AnnotatedCrossSectionStrip | null =>
      centerline.cross_section_strips.find((strip) => strip.strip_id === stripId) ?? null;

    for (const handle of previewResizeHandles) {
      handle.addEventListener(
        "pointerdown",
        (event) => {
          const leftStripId = handle.dataset.leftStripId;
          const rightStripId = handle.dataset.rightStripId;
          if (!leftStripId || !rightStripId) {
            return;
          }
          const leftStrip = findStripById(leftStripId);
          const rightStrip = findStripById(rightStripId);
          if (!leftStrip || !rightStrip) {
            return;
          }
          const leftShell = inspectorEl.querySelector<HTMLElement>(`[data-preview-strip-shell="${leftStripId}"]`);
          const rightShell = inspectorEl.querySelector<HTMLElement>(`[data-preview-strip-shell="${rightStripId}"]`);
          const pairWidthPx = Math.max(
            1,
            (leftShell?.getBoundingClientRect().width ?? 0) + (rightShell?.getBoundingClientRect().width ?? 0),
          );
          state.previewResize = {
            pointerId: event.pointerId,
            centerlineId: centerline.id,
            leftStripId,
            rightStripId,
            startClientX: event.clientX,
            startLeftWidthM: leftStrip.width_m,
            startRightWidthM: rightStrip.width_m,
            pairWidthPx,
            didResize: false,
          };
          event.preventDefault();
          event.stopPropagation();
        },
        { signal },
      );
    }

    for (const input of stripInputs) {
      const eventName = input instanceof HTMLSelectElement ? "change" : "input";
      input.addEventListener(
        eventName,
        () => {
          const stripId = input.dataset.stripId;
          const field = input.dataset.stripField;
          if (!stripId || !field) {
            return;
          }
          const strip = findStripById(stripId);
          if (!strip) {
            return;
          }
          if (field === "kind" && input instanceof HTMLSelectElement) {
            const nextKind = asString(input.value, strip.kind);
            if (isStripKind(nextKind)) {
              strip.kind = nextKind;
              if (strip.zone === "center" && !CENTER_STRIP_KINDS.has(strip.kind)) {
                strip.kind = "drive_lane";
              }
              if ((strip.zone === "left" || strip.zone === "right") && !SIDE_STRIP_KINDS.has(strip.kind)) {
                strip.kind = "nearroad_furnishing";
              }
              if (SIDE_STRIP_KINDS.has(strip.kind) || strip.kind === "median") {
                strip.direction = "none";
              }
            }
          } else if (field === "width_m" && input instanceof HTMLInputElement) {
            strip.width_m = Math.max(0.1, asNumber(input.value, strip.width_m));
          } else if (field === "direction" && input instanceof HTMLSelectElement) {
            const nextDirection = asString(input.value, strip.direction);
            strip.direction = isStripDirection(nextDirection) ? nextDirection : strip.direction;
            if (SIDE_STRIP_KINDS.has(strip.kind) || strip.kind === "median") {
              strip.direction = "none";
            }
          }
          syncCenterlineDerivedFields(centerline);
          markAnnotationChanged();
          renderAll();
        },
        { signal },
      );
    }

    for (const button of stripActionButtons) {
      button.addEventListener(
        "click",
        () => {
          const action = button.dataset.action;
          if (!action) {
            return;
          }
          if (action === "select-preview-strip") {
            const previewStripId = button.dataset.stripId ?? null;
            if (!previewStripId) {
              return;
            }
            if (resolvedCrossSectionMode(centerline) !== CROSS_SECTION_MODE_DETAILED || centerline.cross_section_strips.length === 0) {
              ensureDetailedCrossSection(centerline);
              state.selectedStripId = centerline.cross_section_strips.find((strip) => strip.strip_id === previewStripId)?.strip_id
                ?? centerline.cross_section_strips[0]?.strip_id
                ?? null;
              clearFurniturePlacement();
              markAnnotationChanged(`Split ${centerline.id} into detailed cross-section strips.`);
              renderAll();
              return;
            }
            state.selectedStripId = previewStripId;
            renderAll();
            return;
          }
          if (action === "select-strip") {
            state.selectedStripId = button.dataset.stripId ?? null;
            renderAll();
            return;
          }
          if (action === "focus-linked-strip") {
            const targetCenterlineId = button.dataset.centerlineId ?? "";
            const targetStripId = button.dataset.stripId ?? "";
            const targetCenterline = state.annotation.centerlines.find((item) => item.id === targetCenterlineId) ?? null;
            if (!targetCenterline) {
              return;
            }
            state.selection = { kind: "centerline", id: targetCenterline.id };
            state.selectedStripId = targetCenterline.cross_section_strips.some((strip) => strip.strip_id === targetStripId)
              ? targetStripId
              : null;
            clearFurniturePlacement();
            renderAll();
            return;
          }
          if (action === "reset-road-width-to-nominal") {
            centerline.road_width_m = nominalSeedCrossSectionWidth(centerline);
            markAnnotationChanged(`Reset ${centerline.id} width to nominal cross-section.`);
            renderAll();
            return;
          }
          if (action === "calibrate-pixels-per-meter") {
            if (centerline.reference_width_px && centerline.road_width_m > 0) {
              state.annotation.pixels_per_meter = Math.max(0.1, centerline.reference_width_px / centerline.road_width_m);
              pixelsPerMeterInput.value = state.annotation.pixels_per_meter.toFixed(2);
              markAnnotationChanged(`Calibrated pixels per meter from ${centerline.id} reference width.`);
              renderAll();
            }
            return;
          }
          if (action === "split-centerline") {
            ensureDetailedCrossSection(centerline);
            state.selectedStripId = centerline.cross_section_strips[0]?.strip_id ?? null;
            clearFurniturePlacement();
            markAnnotationChanged(`Split ${centerline.id} into detailed cross-section strips.`);
            renderAll();
            return;
          }
          if (action === "collapse-centerline") {
            centerline.cross_section_strips = [];
            centerline.street_furniture_instances = [];
            centerline.cross_section_mode = CROSS_SECTION_MODE_COARSE;
            state.selectedStripId = null;
            clearFurniturePlacement();
            syncCenterlineDerivedFields(centerline);
            markAnnotationChanged(`Collapsed ${centerline.id} back to coarse mode.`);
            renderAll();
            return;
          }
          if (action === "add-strip") {
            const zoneValue = asString(button.dataset.zone, "center");
            const zone: StripZone = isStripZone(zoneValue) ? zoneValue : "center";
            centerline.cross_section_strips.push({
              strip_id: nextStripId(centerline, zone),
              zone,
              kind: zone === "center" ? "drive_lane" : "nearroad_furnishing",
              width_m: zone === "center" ? NOMINAL_STRIP_WIDTHS.drive_lane : NOMINAL_STRIP_WIDTHS.nearroad_furnishing,
              direction: zone === "center" ? "forward" : "none",
              order_index: centerline.cross_section_strips.filter((strip) => strip.zone === zone).length,
            });
            syncCenterlineDerivedFields(centerline);
            state.selectedStripId = centerline.cross_section_strips[centerline.cross_section_strips.length - 1]?.strip_id ?? null;
            markAnnotationChanged("Added strip.");
            renderAll();
            return;
          }
          if (action === "move-strip-up" || action === "move-strip-down") {
            const stripId = button.dataset.stripId;
            if (!stripId) {
              return;
            }
            const strip = findStripById(stripId);
            if (!strip) {
              return;
            }
            const zoneStrips = sortedCrossSectionStrips(centerline.cross_section_strips).filter((item) => item.zone === strip.zone);
            const currentIndex = zoneStrips.findIndex((item) => item.strip_id === stripId);
            if (currentIndex < 0) {
              return;
            }
            const swapIndex = action === "move-strip-up" ? currentIndex - 1 : currentIndex + 1;
            if (swapIndex < 0 || swapIndex >= zoneStrips.length) {
              return;
            }
            const swapStrip = zoneStrips[swapIndex];
            const originalOrder = strip.order_index;
            strip.order_index = swapStrip.order_index;
            swapStrip.order_index = originalOrder;
            syncCenterlineDerivedFields(centerline);
            markAnnotationChanged("Reordered strip.");
            renderAll();
            return;
          }
          if (action === "delete-strip") {
            const stripId = button.dataset.stripId;
            if (!stripId) {
              return;
            }
            centerline.cross_section_strips = centerline.cross_section_strips.filter((strip) => strip.strip_id !== stripId);
            centerline.street_furniture_instances = centerline.street_furniture_instances.filter((item) => item.strip_id !== stripId);
            if (state.selectedStripId === stripId) {
              state.selectedStripId = null;
            }
            if (state.furniturePlacement?.stripId === stripId) {
              clearFurniturePlacement();
            }
            syncCenterlineDerivedFields(centerline);
            markAnnotationChanged("Deleted strip.");
            renderAll();
            return;
          }
          if (action === "arm-furniture-placement") {
            const strip = selectedStrip(centerline);
            if (!strip || !FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) {
              return;
            }
            state.furniturePlacement = {
              centerlineId: centerline.id,
              stripId: strip.strip_id,
              kind: state.pendingFurnitureKind,
            };
            setStatus(statusEl, `Placement armed for ${strip.strip_id}. Click on the canvas to place ${state.pendingFurnitureKind}.`, "neutral");
            renderAll();
            return;
          }
          if (action === "cancel-furniture-placement") {
            clearFurniturePlacement();
            setStatus(statusEl, "Furniture placement cancelled.", "neutral");
            renderAll();
            return;
          }
          if (action === "delete-furniture") {
            const instanceId = button.dataset.instanceId;
            if (!instanceId) {
              return;
            }
            centerline.street_furniture_instances = centerline.street_furniture_instances.filter((item) => item.instance_id !== instanceId);
            markAnnotationChanged("Deleted furniture instance.");
            renderAll();
          }
          if (action === "delete-zone-furniture") {
            const instanceId = button.dataset.instanceId;
            const zoneId = button.dataset.zoneId;
            if (!instanceId || !zoneId) {
              return;
            }
            const zone = state.annotation.functional_zones.find((z) => z.id === zoneId);
            if (!zone) {
              return;
            }
            zone.furniture_instances = zone.furniture_instances.filter((item) => item.instance_id !== instanceId);
            markAnnotationChanged("Deleted zone furniture instance.");
            renderAll();
          }
        },
        { signal },
      );
    }

    for (const input of furnitureInputs) {
      const eventName = input instanceof HTMLSelectElement ? "change" : "input";
      input.addEventListener(
        eventName,
        () => {
          const instanceId = input.dataset.instanceId;
          const field = input.dataset.furnitureField;
          if (!instanceId || !field) {
            return;
          }
          const instance = centerline.street_furniture_instances.find((item) => item.instance_id === instanceId);
          if (!instance) {
            return;
          }
          if (field === "kind" && input instanceof HTMLSelectElement) {
            const value = asString(input.value, instance.kind);
            if (isFurnitureKind(value)) {
              instance.kind = value;
            }
          } else if (field === "station_m" && input instanceof HTMLInputElement) {
            instance.station_m = Math.max(0, asNumber(input.value, instance.station_m));
          } else if (field === "lateral_offset_m" && input instanceof HTMLInputElement) {
            instance.lateral_offset_m = asNumber(input.value, instance.lateral_offset_m);
          } else if (field === "yaw_deg" && input instanceof HTMLInputElement) {
            instance.yaw_deg = asNullableNumber(input.value);
          }
          syncCenterlineDerivedFields(centerline);
          markAnnotationChanged();
          renderAll();
        },
        { signal },
      );
    }
  }

  function renderOverlay(): void {
    if (!hasAnnotationCanvas() || state.annotation.image_width_px <= 0 || state.annotation.image_height_px <= 0) {
      overlayHostEl.innerHTML = "";
      updateStageVisibility();
      return;
    }
    overlayHostEl.innerHTML = buildOverlayMarkup(
      state.annotation,
      state.draftCenterline,
      state.selection,
      state.selectedStripId,
      {
        showJunctionCore: state.showJunctionCore,
        showJunctionConnectors: state.showJunctionConnectors,
        showJunctionCrosswalks: state.showJunctionCrosswalks,
        showJunctionBoundaries: state.showJunctionBoundaries,
        showJunctionLabels: state.showJunctionLabels,
        showJunctionDebug: state.showJunctionDebug,
        showJunctionOutlines: state.showJunctionOutlines,
      },
      state.branchHoverSnap,
      state.branchDraft,
      state.crossHoverSnap,
      state.crossDraft,
      state.drag?.kind === "building_region_draw" ? state.drag : null,
      state.drag?.kind === "functional_zone_draw" ? state.drag : null,
      state.drag?.kind === "region_draw" || state.drag?.kind === "region_box_draw" ? state.drag : null,
    );
    updateStageVisibility();
  }

  function renderAll(): void {
    renderToolButtons();
    summaryGridEl.innerHTML = buildAnnotationSummaryMarkup(state.annotation);
    featureTableEl.innerHTML = buildFeatureTableMarkup(state.annotation);
    graphSummaryEl.innerHTML = buildGraphSummaryMarkup(state.graphResult);
    graphTextarea.value = state.graphResult ? JSON.stringify(state.graphResult, null, 2) : "";
    showOriginalInput.checked = state.showOriginal;
    showOverlayInput.checked = state.showOverlay;
    showJunctionCoreInput.checked = state.showJunctionCore;
    showJunctionConnectorsInput.checked = state.showJunctionConnectors;
    showJunctionOutlinesInput.checked = state.showJunctionOutlines;
    showJunctionCrosswalksInput.checked = state.showJunctionCrosswalks;
    showJunctionBoundariesInput.checked = state.showJunctionBoundaries;
    showJunctionLabelsInput.checked = state.showJunctionLabels;
    showJunctionDebugInput.checked = state.showJunctionDebug;
    pixelsPerMeterInput.value = String(state.annotation.pixels_per_meter);
    roundaboutRadiusInput.value = String(state.defaultRoundaboutRadiusPx);
    syncJsonTextarea();
    renderInspector();
    renderOverlay();
    const showInlineLoading = state.isReferenceImageLoading && !state.currentImageUrl;
    imageMetaEl.dataset.loading = showInlineLoading ? "true" : "false";
    imageMetaEl.textContent = showInlineLoading
      ? state.referenceImageLoadingMessage
      : hasAnnotationCanvas()
        ? `${state.annotation.plan_id || "custom"} · ${state.annotation.image_width_px} × ${state.annotation.image_height_px}px · ${state.annotation.pixels_per_meter.toFixed(1)} px/m · ${state.annotation.centerlines.length} roads · ${state.annotation.centerlines.reduce((sum, item) => sum + item.cross_section_strips.length, 0)} strips · ${state.annotation.centerlines.reduce((sum, item) => sum + item.street_furniture_instances.length, 0)} furniture · ${state.annotation.regions.length} regions · ${(state.annotation.derived_regions ?? []).length} auto building regions · ${state.annotation.surface_annotations.length} design surfaces · ${state.annotation.station_strip_patches.length} strip patches`
        : "选择参考 plan 或导入 PNG 后，就可以在图上开始标注。";
    applyViewerTranslations(shell.rightRail, loadViewerLanguage());
    finishCenterlineButton.disabled = state.draftCenterline.length < 2;
    selectAllRoadsButton.disabled = state.annotation.centerlines.length === 0;
    selectAllRoadsButton.dataset.active = state.selection?.kind === "road_collection" ? "true" : "false";
    undoPointButton.disabled = state.draftCenterline.length === 0;
    const selectedJunction =
      state.selection?.kind === "junction"
        ? state.annotation.junctions.find((item) => item.id === state.selection?.id) ?? null
        : null;
    deleteSelectedButton.disabled =
      !state.selection ||
      state.selection.kind === "road_collection" ||
      state.selection.kind === "derived_junction" ||
      Boolean(selectedJunction && selectedJunction.source_mode === "explicit");
    imageResetButton.disabled = !state.currentImageUrl;
    convertGraphButton.disabled = !canConvertGraph() || autoGraphInFlight;
    downloadGraphButton.disabled = !state.graphResult;
  }

  function setTool(tool: Tool): void {
    state.selectedTool = tool;
    state.drag = null;
    if (tool !== "branch") {
      clearBranchDraft();
    }
    if (tool !== "cross") {
      clearCrossDraft();
    }
    if (tool !== "select") {
      clearFurniturePlacement();
    }
    if (tool === "branch") {
      setStatus(statusEl, "Branch Tool: hover an existing road to snap, click once to lock the anchor, then click again to place the branch.", "neutral");
    } else if (tool === "cross") {
      setStatus(statusEl, `Cross Tool: hover an existing road to snap and extend a cross from it, or click empty space to place a standalone ${STANDALONE_CROSS_ARM_LENGTH_M.toFixed(0)}m cross intersection.`, "neutral");
    } else if (tool === "centerline") {
      setStatus(statusEl, "Centerline Tool: draw approach roads only. Use Branch Tool or Cross Tool to create intersections explicitly.", "neutral");
    } else if (tool === "building_region") {
      setStatus(statusEl, "Building Region Tool: advanced legacy rectangle. Prefer Scene Region + Auto Split for normal scene design.", "neutral");
    } else if (tool === "scene_region") {
      setStatus(statusEl, "Scene Region Tool: drag a box around the maximum scene boundary. Auto Split derives building regions from roads inside it.", "neutral");
    } else if (tool === "functional_zone") {
      setStatus(statusEl, "Functional Region Tool: click polygon vertices for plazas, gardens, and other semantic open spaces.", "neutral");
    } else if (tool === "surface_annotation") {
      setStatus(statusEl, "Design Surface Tool: click a road or strip to add a station-bound surface patch, then tune it in Inspector.", "neutral");
    } else if (tool === "tree") {
      setStatus(statusEl, "Tree Tool: click near a road to place a tree on the nearest furnishing strip.", "neutral");
    } else if (tool === "lamp") {
      setStatus(statusEl, "Lamp Tool: click near a road to place a lamp on the nearest furnishing strip.", "neutral");
    } else if (tool === "bench") {
      setStatus(statusEl, "Bench Tool: click near a road to place a bench on the nearest furnishing strip.", "neutral");
    } else if (tool === "trash") {
      setStatus(statusEl, "Trash Tool: click near a road to place a trash bin on the nearest furnishing strip.", "neutral");
    } else if (tool === "bus_stop") {
      setStatus(statusEl, "Bus Stop Tool: click near a road to place a bus stop on the nearest furnishing strip.", "neutral");
    } else if (tool === "bollard") {
      setStatus(statusEl, "Bollard Tool: click near a road to place a bollard on the nearest furnishing strip.", "neutral");
    } else if (tool === "mailbox") {
      setStatus(statusEl, "Mailbox Tool: click near a road to place a mailbox on the nearest furnishing strip.", "neutral");
    } else if (tool === "hydrant") {
      setStatus(statusEl, "Hydrant Tool: click near a road to place a hydrant on the nearest furnishing strip.", "neutral");
    } else if (tool === "sign") {
      setStatus(statusEl, "Sign Tool: click near a road to place a sign on the nearest furnishing strip.", "neutral");
    }
    renderAll();
  }

  function imagePointFromPointer(event: PointerEvent): AnnotationPoint | null {
    if (!hasAnnotationCanvas() || state.annotation.image_width_px <= 0 || state.annotation.image_height_px <= 0) {
      return null;
    }
    const svgEl = overlayHostEl.querySelector<SVGSVGElement>("#annotation-overlay-svg");
    if (!svgEl) {
      return null;
    }
    const rect = svgEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const x = clamp(((event.clientX - rect.left) / rect.width) * state.annotation.image_width_px, 0, state.annotation.image_width_px);
    const y = clamp(((event.clientY - rect.top) / rect.height) * state.annotation.image_height_px, 0, state.annotation.image_height_px);
    return { x, y };
  }

  async function loadImageFromUrl(
    imageUrl: string,
    options: {
      planId: string;
      preserveFeatures: boolean;
      preserveCurrentOnError?: boolean;
    },
  ): Promise<void> {
    const { planId, preserveFeatures, preserveCurrentOnError = false } = options;
    const resolvedImageUrl = resolveApiUrl(imageUrl);
    const previousImageUrl = state.currentImageUrl;
    const previousImageSrc = originalImageEl.getAttribute("src") || "";
    state.isReferenceImageLoading = true;
    state.referenceImageLoadingMessage = `Loading reference image: ${planId || "custom"}...`;
    state.currentImageUrl = resolvedImageUrl;
    renderAll();
    try {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error("Timed out while loading the selected image.")), 4000);
        originalImageEl.onload = () => {
          window.clearTimeout(timeoutId);
          resolve();
        };
        originalImageEl.onerror = () => {
          window.clearTimeout(timeoutId);
          reject(new Error("Failed to load the selected image."));
        };
        originalImageEl.src = resolvedImageUrl;
      });
      const width = originalImageEl.naturalWidth;
      const height = originalImageEl.naturalHeight;
      if (preserveFeatures) {
        state.annotation.image_width_px = width;
        state.annotation.image_height_px = height;
        state.annotation.image_path = imageUrl;
        state.annotation.plan_id = planId || state.annotation.plan_id;
      } else {
        state.annotation = createEmptyAnnotation(planId, imageUrl, width, height);
      }
      state.selection = null;
      state.selectedStripId = null;
      state.draftCenterline = [];
      clearBranchDraft();
      clearCrossDraft();
      clearFurniturePlacement();
      clearGraphResult("Reference image updated. Road graph will be generated after annotation.");
      resetViewport();
      setStatus(statusEl, `Loaded reference image: ${planId || "custom"}.`, "success");
    } catch (error) {
      if (preserveCurrentOnError) {
        state.currentImageUrl = previousImageUrl;
        const restoredSrc = previousImageSrc || previousImageUrl;
        if (restoredSrc) {
          originalImageEl.src = restoredSrc;
        } else {
          originalImageEl.removeAttribute("src");
        }
      } else {
        state.currentImageUrl = "";
        originalImageEl.removeAttribute("src");
      }
      throw error;
    } finally {
      state.isReferenceImageLoading = false;
      renderAll();
    }
  }

  function currentReferenceImagePathForAnnotation(): string {
    if (!state.currentImageUrl) {
      return "";
    }
    if (state.currentImageUrl.startsWith(API_BASE)) {
      return state.currentImageUrl.slice(API_BASE.length) || state.currentImageUrl;
    }
    return state.currentImageUrl;
  }

  function bindAnnotationToCurrentReferenceImage(fallbackImagePath = ""): boolean {
    const width = originalImageEl.naturalWidth;
    const height = originalImageEl.naturalHeight;
    if (!state.currentImageUrl || width <= 0 || height <= 0) {
      return false;
    }
    state.annotation.image_width_px = width;
    state.annotation.image_height_px = height;
    state.annotation.image_path = fallbackImagePath || currentReferenceImagePathForAnnotation();
    return true;
  }

  async function reconcileImportedAnnotationReferenceImage(
    actionPast: "Imported" | "Applied",
    fallbackImagePath = "",
  ): Promise<void> {
    const requestedImagePath = state.annotation.image_path;
    if (requestedImagePath) {
      try {
        await loadImageFromUrl(requestedImagePath, {
          planId: state.annotation.plan_id,
          preserveFeatures: true,
          preserveCurrentOnError: true,
        });
        clearGraphResult(`${actionPast} annotation JSON. Road graph will refresh automatically.`);
        setStatus(statusEl, `${actionPast} annotation JSON.`, "success");
        return;
      } catch {
        if (bindAnnotationToCurrentReferenceImage(fallbackImagePath)) {
          clearGraphResult(`${actionPast} annotation JSON. Keeping current reference image.`);
          setStatus(
            statusEl,
            `${actionPast} annotation JSON. Kept the current reference image because ${requestedImagePath} could not be loaded.`,
            "neutral",
          );
          renderAll();
          return;
        }
        clearGraphResult(`${actionPast} annotation JSON. Load an image to keep editing against the reference.`);
        setStatus(statusEl, `${actionPast} annotation JSON, but its image path could not be loaded.`, "neutral");
        renderAll();
        return;
      }
    }

    if (bindAnnotationToCurrentReferenceImage(fallbackImagePath)) {
      clearGraphResult(`${actionPast} annotation JSON. Keeping current reference image.`);
      setStatus(statusEl, `${actionPast} annotation JSON. Kept the current reference image.`, "success");
      renderAll();
      return;
    }
    clearGraphResult(`${actionPast} annotation JSON. Load an image to keep editing against the reference.`);
    setStatus(statusEl, `${actionPast} annotation JSON. Load an image to keep editing against the reference.`, "success");
    renderAll();
  }

  async function applyReferencePlan(planId: string): Promise<void> {
    const plan = state.referencePlans.find((item) => item.plan_id === planId);
    if (!plan?.image_url) {
      state.annotation.plan_id = planId;
      state.selectedScenarioId = "";
      updateCleanAnnotationSnapshot();
      renderScenarioDesignOptions();
      workflow.setSourceDraft({
        kind: "reference_image",
        imageDataUrl: null,
        fileName: planId,
        geojson: null,
      });
      renderSourceWorkflow();
      setStatus(statusEl, `Selected reference plan ${planId}, but no image URL was provided.`, "neutral");
      renderAll();
      return;
    }
    await loadImageFromUrl(plan.image_url, { planId: plan.plan_id, preserveFeatures: false });
    state.selectedScenarioId = "";
    updateCleanAnnotationSnapshot();
    renderScenarioDesignOptions();
    uploadedImageDataUrl = "";
    pendingOsmNormalization = null;
    workflow.setSourceDraft({
      kind: "reference_image",
      imageDataUrl: null,
      fileName: plan.image_url,
      geojson: null,
    });
    renderSourceWorkflow();
  }

  async function loadReferencePlans(options: { silent?: boolean } = {}): Promise<void> {
    const { silent = false } = options;
    if (!silent) {
      state.isReferenceImageLoading = true;
      state.referenceImageLoadingMessage = "Loading reference plans...";
      renderAll();
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${API_BASE}/api/reference-plans`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Failed to load reference plans (${response.status}).`);
      }
      const payload = (await response.json()) as ReferencePlansPayload;
      mergeReferencePlans(Array.isArray(payload.items) ? payload.items : []);
      const defaultPlan = state.referencePlans.find((item) => item.plan_id === "hkust_gz_gate") ?? state.referencePlans[0];
      renderReferencePlanOptions(defaultPlan?.plan_id);
      if (!state.currentImageUrl && !workflow.getSnapshot().normalized && defaultPlan) {
        await applyReferencePlan(defaultPlan.plan_id);
        return;
      }
      renderAll();
    } finally {
      window.clearTimeout(timeoutId);
      if (!silent) {
        state.isReferenceImageLoading = false;
      }
    }
  }

  async function loadScenarioDesigns(options: { silent?: boolean } = {}): Promise<void> {
    const { silent = false } = options;
    state.isScenarioDesignCatalogLoading = true;
    state.scenarioDesignsError = "";
    renderScenarioDesignOptions();
    if (!silent) {
      setStatus(statusEl, "Loading scenario designs...", "neutral");
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${API_BASE}/api/scenario-designs`, { signal: controller.signal });
      if (!response.ok) {
        const detail = await readApiErrorDetail(response);
        throw new Error(detail || `Failed to load scenario designs (${response.status}).`);
      }
      const catalogPayload = (await response.json()) as ScenarioDesignCatalogPayload;
      state.scenarioDesigns = Array.isArray(catalogPayload.items) ? catalogPayload.items : [];
      state.scenarioDesignsError = "";
      renderScenarioDesignOptions(state.selectedScenarioId);
      const pendingScenario = workflow.getSnapshot();
      if (
        pendingScenario.sourceKind === "scenario_design"
        && !pendingScenario.normalized
        && pendingScenario.sourceFileName
        && state.scenarioDesigns.some((item) => item.scenario_id === pendingScenario.sourceFileName && item.enabled !== false)
      ) {
        void applyScenarioDesignAnnotation(pendingScenario.sourceFileName);
      }
    } catch (error) {
      state.scenarioDesigns = [];
      state.scenarioDesignsError = error instanceof Error ? error.message : "Failed to load scenario designs.";
      renderScenarioDesignOptions();
      if (!silent) {
        setStatus(statusEl, state.scenarioDesignsError, "error");
      }
    } finally {
      window.clearTimeout(timeoutId);
      state.isScenarioDesignCatalogLoading = false;
      renderScenarioDesignOptions(state.selectedScenarioId);
    }
  }

  function clearAnnotationEditingState(): void {
    state.selection = null;
    state.selectedStripId = null;
    state.draftCenterline = [];
    state.drag = null;
    clearBranchDraft();
    clearCrossDraft();
    clearFurniturePlacement();
  }

  async function applyScenarioAnnotationPayload(
    scenarioId: string,
    label: string,
    payload: ScenarioReferenceAnnotationPayload,
  ): Promise<void> {
      const annotation = normalizeAnnotation(payload.annotation);
      const fallbackImagePath = state.annotation.image_path;
      state.annotation = annotation;
      state.selectedScenarioId = scenarioId;
      clearAnnotationEditingState();
      clearGraphResult("Scenario design annotation loaded. Road graph will refresh automatically.");
      if (annotation.image_path) {
        try {
          await loadImageFromUrl(annotation.image_path, {
            planId: annotation.plan_id,
            preserveFeatures: true,
            preserveCurrentOnError: true,
          });
        } catch {
          if (bindAnnotationToCurrentReferenceImage(fallbackImagePath)) {
            clearGraphResult("Scenario design annotation loaded. Keeping current reference image.");
            setStatus(statusEl, "Scenario annotation loaded. Kept the current reference image.", "neutral");
          } else {
            clearGraphResult("Scenario annotation loaded, but its reference image could not be reopened.");
            setStatus(statusEl, "Scenario annotation loaded, but its reference image could not be reopened.", "neutral");
          }
          renderAll();
        }
      } else if (bindAnnotationToCurrentReferenceImage(fallbackImagePath)) {
        clearGraphResult("Scenario design annotation loaded. Keeping current reference image.");
        setStatus(statusEl, "Scenario annotation loaded. Kept the current reference image.", "success");
        renderAll();
      } else {
        renderAll();
      }
      updateCleanAnnotationSnapshot();
      renderReferencePlanOptions(annotation.plan_id);
      renderScenarioDesignOptions(scenarioId);
      workflow.setSourceDraft({
        kind: "scenario_design",
        imageDataUrl: uploadedImageDataUrl || undefined,
        fileName: scenarioId,
        geojson: null,
      });
      renderSourceWorkflow();
      if (state.annotation.regions.some((region) => region.region_role === "scene_region")) {
        await deriveBuildingRegions();
        updateCleanAnnotationSnapshot();
      } else {
        setStatus(statusEl, `Loaded scenario design: ${label}.`, "success");
      }
  }

  async function applyScenarioDraftAnnotation(payload: {
    scenario_id?: string;
    title_zh?: string;
    annotation?: unknown;
  }): Promise<void> {
    const scenarioId = String(payload.scenario_id || "draft_semantic_variant");
    const label = String(payload.title_zh || scenarioId);
    state.isScenarioDesignAnnotationLoading = true;
    renderScenarioDesignOptions(scenarioId);
    setStatus(statusEl, `Loading draft scenario annotation: ${label}...`, "neutral");
    try {
      await applyScenarioAnnotationPayload(scenarioId, label, {
        annotation: payload.annotation as ScenarioReferenceAnnotationPayload["annotation"],
      } as ScenarioReferenceAnnotationPayload);
    } finally {
      state.isScenarioDesignAnnotationLoading = false;
      renderScenarioDesignOptions(state.selectedScenarioId);
    }
  }

  async function applyScenarioDesignAnnotation(scenarioId: string): Promise<void> {
    const scenario = state.scenarioDesigns.find((item) => item.scenario_id === scenarioId);
    const label = scenario?.title_zh || scenarioId;
    if (scenario?.enabled === false) {
      throw new Error(scenario.excluded_reason_zh || "This scenario design is excluded from the current default workflow.");
    }
    state.isScenarioDesignAnnotationLoading = true;
    renderScenarioDesignOptions(scenarioId);
    setStatus(statusEl, `Loading scenario design: ${label}...`, "neutral");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `${API_BASE}/api/scenario-designs/${encodeURIComponent(scenarioId)}/reference-annotation?graph_template_id=hkust_gz_gate`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        const detail = await readApiErrorDetail(response);
        throw new Error(detail || `Failed to load scenario design annotation (${response.status}).`);
      }
      const payload = (await response.json()) as ScenarioReferenceAnnotationPayload;
      await applyScenarioAnnotationPayload(scenarioId, label, payload);
    } finally {
      window.clearTimeout(timeoutId);
      state.isScenarioDesignAnnotationLoading = false;
      renderScenarioDesignOptions(state.selectedScenarioId);
    }
  }

  function finalizeDraftCenterline(): void {
    if (state.draftCenterline.length < 2) {
      setStatus(statusEl, "Centerline needs at least two points.", "error");
      return;
    }
    const snappedDraft = snapDraftCenterlineEndpointsToExplicitJunctions(state.annotation, state.draftCenterline);
    const draftIssues = validateDraftCenterlinePlacement(state.annotation, snappedDraft.points);
    if (draftIssues.length > 0) {
      setStatus(statusEl, draftIssues[0].message, "error");
      return;
    }
    const id = nextFeatureId(state.annotation, "centerline");
    const centerline = createDefaultAnnotatedCenterline(id, snappedDraft.points, {
      startJunctionId: snappedDraft.startJunctionId,
      endJunctionId: snappedDraft.endJunctionId,
    });
    state.annotation.centerlines.push(centerline);
    registerCenterlineWithExplicitJunction(state.annotation, centerline.start_junction_id, centerline.id);
    registerCenterlineWithExplicitJunction(state.annotation, centerline.end_junction_id, centerline.id);
    state.selection = { kind: "centerline", id };
    state.selectedStripId = centerline.cross_section_strips[0]?.strip_id ?? null;
    state.draftCenterline = [];
    clearBranchDraft();
    clearCrossDraft();
    if (centerline.start_junction_id || centerline.end_junction_id) {
      markAnnotationChanged(`Saved centerline ${id}, attached it to explicit junction endpoints, and split it into detailed cross-section strips.`);
    } else {
      markAnnotationChanged(`Saved centerline ${id} and split it into detailed cross-section strips.`);
    }
    renderAll();
  }

  function createStandaloneCrossAtPoint(anchorPoint: AnnotationPoint): void {
    const armLengthPx = STANDALONE_CROSS_ARM_LENGTH_M * Math.max(state.annotation.pixels_per_meter, 0.0001);
    const center = { ...anchorPoint };
    const candidateArms = [
      [{ x: center.x - armLengthPx, y: center.y }, center],
      [{ x: center.x + armLengthPx, y: center.y }, center],
      [{ x: center.x, y: center.y - armLengthPx }, center],
      [{ x: center.x, y: center.y + armLengthPx }, center],
    ];
    for (const points of candidateArms) {
      const issues = validateDraftCenterlinePlacement(state.annotation, points);
      if (issues.length > 0) {
        setStatus(statusEl, issues[0].message, "error");
        renderAll();
        return;
      }
    }

    const junctionId = nextFeatureId(state.annotation, "junction");
    const [westArmId, eastArmId, northArmId, southArmId] = reserveNextFeatureIds(state.annotation, "centerline", 4);
    const arms = [
      createDefaultAnnotatedCenterline(westArmId, candidateArms[0], { endJunctionId: junctionId }),
      createDefaultAnnotatedCenterline(eastArmId, candidateArms[1], { endJunctionId: junctionId }),
      createDefaultAnnotatedCenterline(northArmId, candidateArms[2], { endJunctionId: junctionId }),
      createDefaultAnnotatedCenterline(southArmId, candidateArms[3], { endJunctionId: junctionId }),
    ];
    state.annotation.centerlines.push(...arms);
    createExplicitJunction(state.annotation, {
      junctionId,
      kind: "cross_junction",
      anchor: center,
      connectedCenterlineIds: arms.map((arm) => arm.id),
    });
    state.selection = { kind: "junction", id: junctionId };
    state.selectedStripId = null;
    clearFurniturePlacement();
    clearCrossDraft();
    revealJunctionSurfaceLayers();
    markAnnotationChanged(
      `Created standalone cross junction ${junctionId} with four ${STANDALONE_CROSS_ARM_LENGTH_M.toFixed(0)}m approach roads.`,
    );
    renderAll();
  }

  function resetAnnotation(): void {
    state.annotation.centerlines = [];
    state.annotation.junctions = [];
    state.annotation.roundabouts = [];
    state.annotation.control_points = [];
    state.annotation.regions = [];
    state.annotation.derived_regions = [];
    state.annotation.building_regions = [];
    state.annotation.functional_zones = [];
    state.annotation.surface_annotations = [];
    state.annotation.station_strip_patches = [];
    state.derivedRegionsStale = false;
    state.selectedScenarioId = "";
    clearAnnotationEditingState();
    clearGraphResult("Annotation reset. Draw new features to generate a road graph.");
    renderScenarioDesignOptions();
    setStatus(statusEl, "Annotation cleared.", "neutral");
    renderAll();
  }

  function deleteSelection(): void {
    if (!state.selection) {
      return;
    }
    if (state.selection.kind === "lane_element") {
      setStatus(statusEl, "Lane elements are read-only derived/debug geometry. Select the owning road or junction to edit it.", "neutral");
      renderAll();
      return;
    }
    if (state.selection.kind === "centerline") {
      const lineIndex = state.annotation.centerlines.findIndex((item) => item.id === state.selection?.id);
      if (lineIndex >= 0) {
        const line = state.annotation.centerlines[lineIndex];
        if (state.selection.vertexIndex !== undefined && line.points.length > 2) {
          const removedVertexIndex = state.selection.vertexIndex;
          line.points.splice(state.selection.vertexIndex, 1);
          state.selection = { kind: "centerline", id: line.id };
          setStatus(statusEl, `Removed vertex ${removedVertexIndex + 1} from ${line.id}.`, "success");
        } else {
          state.annotation.centerlines.splice(lineIndex, 1);
          state.selection = null;
          state.selectedStripId = null;
          clearFurniturePlacement();
          setStatus(statusEl, `Deleted centerline ${line.id}.`, "success");
        }
      }
    } else if (state.selection.kind === "junction") {
      const junction = state.annotation.junctions.find((item) => item.id === state.selection?.id) ?? null;
      if (junction?.source_mode === "explicit") {
        setStatus(statusEl, "Explicit junctions are owned by connected road arms. Edit or delete the connected roads instead.", "neutral");
      } else {
        state.annotation.junctions = state.annotation.junctions.filter((item) => item.id !== state.selection?.id);
        state.selection = null;
        setStatus(statusEl, "Deleted junction.", "success");
      }
    } else if (state.selection.kind === "roundabout") {
      state.annotation.roundabouts = state.annotation.roundabouts.filter((item) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted roundabout.", "success");
    } else if (state.selection.kind === "control_point") {
      state.annotation.control_points = state.annotation.control_points.filter((item) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted control point.", "success");
    } else if (state.selection.kind === "building_region") {
      state.annotation.building_regions = state.annotation.building_regions.filter((item) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted building region.", "success");
    } else if (state.selection.kind === "region") {
      const selectedId = state.selection.id;
      const explicitCountBefore = state.annotation.regions.length;
      state.annotation.regions = state.annotation.regions.filter((item) => item.id !== selectedId);
      state.annotation.derived_regions = (state.annotation.derived_regions ?? []).filter((item) => item.id !== selectedId);
      state.selection = null;
      state.derivedRegionsStale = state.annotation.regions.length !== explicitCountBefore || state.derivedRegionsStale;
      setStatus(statusEl, "Deleted region.", "success");
    } else if (state.selection.kind === "functional_zone") {
      state.annotation.functional_zones = state.annotation.functional_zones.filter((item) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted functional zone.", "success");
    } else if (state.selection.kind === "surface_annotation") {
      state.annotation.surface_annotations = state.annotation.surface_annotations.filter((item) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted design surface.", "success");
    } else if (state.selection.kind === "derived_junction") {
      setStatus(statusEl, "Derived junctions come from shared road vertices. Edit the connected centerlines instead.", "neutral");
    }
    clearGraphResult("Annotation changed. Road graph will refresh automatically.");
    renderAll();
  }

  async function convertAnnotationToGraph(options: { automatic?: boolean } = {}): Promise<void> {
    if (state.annotation.centerlines.length === 0) {
      setStatus(graphStatusEl, "Add at least one centerline before converting.", "error");
      return;
    }
    const modelIssues = validateAnnotationForExplicitJunctionModel(state.annotation);
    if (modelIssues.length > 0) {
      setStatus(graphStatusEl, modelIssues[0].message, "error");
      return;
    }
    setStatus(graphStatusEl, options.automatic ? "Updating road graph automatically..." : "Converting annotation to graph...", "neutral");
    for (const centerline of state.annotation.centerlines) {
      syncCenterlineDerivedFields(centerline);
    }
    const response = await fetch(`${API_BASE}/api/reference-annotations/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        annotation: state.annotation,
        compose_config: {
          sidewalk_width_m: Math.max(1, asNumber(sidewalkWidthInput.value, DEFAULT_SIDEWALK_WIDTH_M)),
          segment_length_m: Math.max(4, asNumber(segmentLengthInput.value, DEFAULT_SEGMENT_LENGTH_M)),
        },
      }),
    });
    const payload = (await response.json()) as ConvertedGraphPayload | { detail?: string };
    if (!response.ok) {
      throw new Error(typeof payload === "object" && payload && "detail" in payload ? String(payload.detail) : "Graph conversion failed.");
    }
    const convertedPayload = payload as ConvertedGraphPayload;
    const annotationSnapshot = cloneAnnotation(state.annotation);
    state.graphResult = {
      ...convertedPayload,
      annotation: annotationSnapshot,
      summary: {
        ...convertedPayload.summary,
        region_count: annotationSnapshot.regions.length,
        derived_region_count: annotationSnapshot.derived_regions?.length ?? 0,
        building_region_count: annotationSnapshot.building_regions.length,
        surface_annotation_count: annotationSnapshot.surface_annotations.length,
        station_strip_patch_count: annotationSnapshot.station_strip_patches.length,
      },
    };
    setStatus(graphStatusEl, "Graph conversion complete.", "success");
    renderAll();
  }

  function syncSelectionAfterMutation(): void {
    if (!state.selection) {
      state.selectedStripId = null;
      clearFurniturePlacement();
      return;
    }
    if (state.selection.kind === "road_collection") {
      if (state.annotation.centerlines.length === 0) {
        state.selection = null;
      }
      state.selectedStripId = null;
      clearFurniturePlacement();
      return;
    }
    if (state.selection.kind === "lane_element") {
      const laneSelection = state.selection;
      if (laneSelection.elementKind === "road_strip") {
        const centerline = state.annotation.centerlines.find((item) => item.id === laneSelection.centerlineId) ?? null;
        const stripId = laneSelection.stripId;
        if (!centerline || !stripId || !centerline.cross_section_strips.some((strip) => strip.strip_id === stripId)) {
          state.selection = null;
          state.selectedStripId = null;
          clearFurniturePlacement();
          return;
        }
        state.selectedStripId = stripId;
      }
      clearFurniturePlacement();
      return;
    }
    const feature = getSelectedFeature(state.annotation, state.selection);
    if (!feature) {
      state.selection = null;
      state.selectedStripId = null;
      clearFurniturePlacement();
      return;
    }
    if (state.selection.kind === "centerline") {
      const centerline = feature as AnnotatedCenterline;
      if (state.selectedStripId && !centerline.cross_section_strips.some((strip) => strip.strip_id === state.selectedStripId)) {
        state.selectedStripId = null;
      }
      if (!state.selectedStripId && centerline.cross_section_strips.length > 0) {
        state.selectedStripId = centerline.cross_section_strips[0]?.strip_id ?? null;
      }
      if (
        state.furniturePlacement &&
        (state.furniturePlacement.centerlineId !== centerline.id ||
          !centerline.cross_section_strips.some((strip) => strip.strip_id === state.furniturePlacement?.stripId))
      ) {
        clearFurniturePlacement();
      }
    } else {
      state.selectedStripId = null;
      clearFurniturePlacement();
    }
  }

  function nextFurnitureInstanceId(centerline: AnnotatedCenterline): string {
    const used = new Set(centerline.street_furniture_instances.map((item) => item.instance_id));
    let counter = centerline.street_furniture_instances.length + 1;
    while (true) {
      const candidate = `${centerline.id}_furniture_${String(counter).padStart(2, "0")}`;
      if (!used.has(candidate)) {
        return candidate;
      }
      counter += 1;
    }
  }

  function inferSurfaceKindFromStrip(stripKind: StripKind | undefined): SurfaceAnnotationKind {
    if (stripKind === "bus_lane") {
      return "bus_lane_widening";
    }
    if (stripKind === "median" || stripKind === "grass_belt") {
      return "safety_island";
    }
    if (stripKind === "shared_street_surface") {
      return "shared_surface";
    }
    if (stripKind === "colored_pavement") {
      return "colored_pavement";
    }
    return "paving_zone";
  }

  function createSurfaceAnnotationAtPoint(point: AnnotationPoint, hit: Selection): void {
    const laneHit = hit?.kind === "lane_element" && hit.elementKind === "road_strip" ? hit : null;
    const centerlineHitId = hit?.kind === "centerline" ? hit.id : undefined;
    const centerlineId = laneHit?.centerlineId ?? centerlineHitId ?? findNearestBranchSnapTarget(state.annotation, point, { maxDistancePx: Math.max(BRANCH_SNAP_TOLERANCE_PX, 24) })?.centerlineId ?? "";
    const centerline = state.annotation.centerlines.find((item) => item.id === centerlineId) ?? null;
    if (!centerline) {
      setStatus(statusEl, "Design Surface Tool needs a nearby road or strip to bind the patch.", "error");
      renderAll();
      return;
    }
    const projection = projectPointOntoPolyline(centerline.points, point);
    const ppm = Math.max(state.annotation.pixels_per_meter, 1e-6);
    const centerlineLength = centerlineLengthM(centerline, ppm);
    const halfLengthM = 9.0;
    const stationM = projection.stationPx / ppm;
    const stationStartM = clamp(stationM - halfLengthM, 0, Math.max(centerlineLength - 0.1, 0));
    const stationEndM = clamp(stationM + halfLengthM, stationStartM + 0.1, centerlineLength);
    const kind = inferSurfaceKindFromStrip(laneHit?.stripKind);
    let lateralStartM = projection.lateralPx / ppm - 1.75;
    let lateralEndM = projection.lateralPx / ppm + 1.75;
    if (laneHit?.stripId) {
      const stripOffsets = stripCenterOffsetMeters(centerline);
      const stripOffset = stripOffsets[laneHit.stripId];
      if (stripOffset) {
        lateralStartM = stripOffset.centerOffsetM - stripOffset.widthM * 0.5;
        lateralEndM = stripOffset.centerOffsetM + stripOffset.widthM * 0.5;
      }
    }
    if (lateralEndM <= lateralStartM + 0.05) {
      lateralEndM = lateralStartM + 0.05;
    }
    const id = nextFeatureId(state.annotation, "surface");
    const surface: AnnotatedSurfaceAnnotation = {
      id,
      label: SURFACE_ANNOTATION_KIND_LABELS[kind],
      kind,
      surface_role: DEFAULT_SURFACE_ROLE_BY_KIND[kind],
      centerline_id: centerline.id,
      station_start_m: Number(stationStartM.toFixed(3)),
      station_end_m: Number(stationEndM.toFixed(3)),
      lateral_start_m: Number(lateralStartM.toFixed(3)),
      lateral_end_m: Number(lateralEndM.toFixed(3)),
      material: { preset: DEFAULT_SURFACE_MATERIAL_BY_KIND[kind] },
    };
    state.annotation.surface_annotations.push(surface);
    state.selection = { kind: "surface_annotation", id };
    state.selectedStripId = laneHit?.stripId ?? null;
    clearFurniturePlacement();
    markAnnotationChanged(`Added design surface ${id}.`);
    renderAll();
  }

  function createArmFromProfile(
    source: AnnotatedCenterline,
    id: string,
    points: AnnotationPoint[],
    options: {
      startJunctionId?: string;
      endJunctionId?: string;
    } = {},
  ): AnnotatedCenterline {
    const arm = cloneCenterlineForBranch(source, id, points);
    arm.start_junction_id = options.startJunctionId ?? "";
    arm.end_junction_id = options.endJunctionId ?? "";
    syncCenterlineDerivedFields(arm);
    return arm;
  }

  function ensureExplicitJunctionAtSnap(
    annotation: ReferenceAnnotation,
    centerlineId: string,
    snap: BranchSnapTarget,
    options: {
      junctionId?: string;
      kind?: string;
      additionalConnectedCenterlineIds?: string[];
      blockedCenterlineIds?: string[];
    } = {},
  ): {
    junction: AnnotatedJunction;
    anchorPoint: AnnotationPoint;
  } | null {
    const centerline = annotation.centerlines.find((item) => item.id === centerlineId);
    if (!centerline) {
      return null;
    }
    const existingJunctionId = endpointJunctionIdAtPoint(centerline, snap.point);
    if (existingJunctionId) {
      const existingJunction = annotation.junctions.find((item) => item.id === existingJunctionId) ?? null;
      if (!existingJunction) {
        return null;
      }
      updateJunctionConnectedCenterlines(annotation, existingJunction.id, [
        ...existingJunction.connected_centerline_ids,
        centerline.id,
        ...(options.additionalConnectedCenterlineIds ?? []),
      ]);
      return {
        junction: existingJunction,
        anchorPoint: junctionAnchorPoint(existingJunction),
      };
    }

    const junctionId = options.junctionId ?? nextFeatureId(annotation, "junction");
    const splitResult = splitCenterlineAtSnap(
      annotation,
      centerlineId,
      snap,
      junctionId,
      options.blockedCenterlineIds ?? [],
    );
    if (!splitResult) {
      return null;
    }
    let junction = annotation.junctions.find((item) => item.id === junctionId) ?? null;
    if (!junction) {
      junction = createExplicitJunction(annotation, {
        junctionId,
        kind: options.kind ?? "t_junction",
        anchor: splitResult.anchorPoint,
        connectedCenterlineIds: [
          ...splitResult.connectedCenterlineIds,
          ...(options.additionalConnectedCenterlineIds ?? []),
        ],
      });
    } else {
      updateJunctionConnectedCenterlines(annotation, junction.id, [
        ...junction.connected_centerline_ids,
        ...splitResult.connectedCenterlineIds,
        ...(options.additionalConnectedCenterlineIds ?? []),
      ]);
      junction.x = splitResult.anchorPoint.x;
      junction.y = splitResult.anchorPoint.y;
    }
    return {
      junction,
      anchorPoint: splitResult.anchorPoint,
    };
  }

  function maybeConnectArmEndpointToSnap(
    sourceCenterline: AnnotatedCenterline,
    arm: AnnotatedCenterline,
    endpoint: AnnotationPoint,
    endpointSnap: BranchSnapTarget | null,
    armEndpoint: "start" | "end",
  ): AnnotationPoint | null {
    if (!endpointSnap) {
      return endpoint;
    }
    const target = state.annotation.centerlines.find((item) => item.id === endpointSnap.centerlineId);
    if (!target) {
      setStatus(statusEl, "Could not resolve the snapped target road.", "error");
      return null;
    }
    if (target.id === sourceCenterline.id) {
      const targetJunctionId = endpointJunctionIdAtPoint(target, endpointSnap.point);
      if (!targetJunctionId) {
        setStatus(statusEl, "Endpoint cannot snap back onto the same source road unless it reaches an existing junction endpoint.", "error");
        return null;
      }
    }
    const targetJunctionId = nextFeatureId(state.annotation, "junction");
    const targetJunctionResult = ensureExplicitJunctionAtSnap(state.annotation, target.id, endpointSnap, {
      junctionId: targetJunctionId,
      kind: "t_junction",
      additionalConnectedCenterlineIds: [arm.id],
      blockedCenterlineIds: [arm.id],
    });
    if (!targetJunctionResult) {
      setStatus(statusEl, "Failed to create the target junction for the snapped endpoint.", "error");
      return null;
    }
    if (armEndpoint === "start") {
      arm.start_junction_id = targetJunctionResult.junction.id;
    } else {
      arm.end_junction_id = targetJunctionResult.junction.id;
    }
    updateJunctionConnectedCenterlines(state.annotation, targetJunctionResult.junction.id, [
      ...targetJunctionResult.junction.connected_centerline_ids,
      arm.id,
    ]);
    return targetJunctionResult.anchorPoint;
  }

  function updateBranchPreview(point: AnnotationPoint | null): void {
    if (state.selectedTool !== "branch") {
      clearBranchDraft();
      return;
    }
    if (!point) {
      state.branchHoverSnap = null;
      return;
    }
    if (!state.branchDraft) {
      state.branchHoverSnap = findNearestBranchSnapTarget(state.annotation, point);
      return;
    }
    const endpointSnap = findNearestBranchSnapTarget(state.annotation, point, {
      excludeCenterlineId: state.branchDraft.anchor.centerlineId,
    });
    state.branchHoverSnap = null;
    state.branchDraft = {
      ...state.branchDraft,
      endpoint: endpointSnap ? { ...endpointSnap.point } : { ...point },
      endpointSnap,
    };
  }

  function updateCrossPreview(point: AnnotationPoint | null): void {
    if (state.selectedTool !== "cross") {
      clearCrossDraft();
      return;
    }
    if (!point) {
      state.crossHoverSnap = null;
      return;
    }
    if (!state.crossDraft) {
      state.crossHoverSnap = findNearestBranchSnapTarget(state.annotation, point);
      return;
    }
    const anchorPoint = state.crossDraft.anchor.point;
    const axisNormal = state.crossDraft.axisNormal;
    const signedDistancePx =
      (point.x - anchorPoint.x) * axisNormal.x +
      (point.y - anchorPoint.y) * axisNormal.y;
    const halfLengthPx = Math.abs(signedDistancePx);
    const desiredPositive = pointOnAxis(anchorPoint, axisNormal, halfLengthPx);
    const desiredNegative = pointOnAxis(anchorPoint, axisNormal, -halfLengthPx);
    const positiveEndpointSnap = findNearestBranchSnapTarget(state.annotation, desiredPositive, {
      excludeCenterlineId: state.crossDraft.anchor.centerlineId,
    });
    const negativeEndpointSnap = findNearestBranchSnapTarget(state.annotation, desiredNegative, {
      excludeCenterlineId: state.crossDraft.anchor.centerlineId,
    });
    state.crossHoverSnap = null;
    state.crossDraft = {
      ...state.crossDraft,
      halfLengthPx,
      positiveEndpoint: positiveEndpointSnap ? { ...positiveEndpointSnap.point } : desiredPositive,
      negativeEndpoint: negativeEndpointSnap ? { ...negativeEndpointSnap.point } : desiredNegative,
      positiveEndpointSnap,
      negativeEndpointSnap,
    };
  }

  function beginBranchFromSnap(snap: BranchSnapTarget): void {
    const host = state.annotation.centerlines.find((item) => item.id === snap.centerlineId);
    if (!host) {
      setStatus(statusEl, "Could not resolve the host road for this branch anchor.", "error");
      return;
    }
    const anchorPoint = insertSharedVertexAtSnap(host, snap);
    state.branchDraft = {
      anchor: { ...snap, point: { ...anchorPoint } },
      endpoint: { ...anchorPoint },
      endpointSnap: null,
    };
    state.branchHoverSnap = null;
    state.selection = { kind: "centerline", id: host.id };
    state.selectedStripId = host.cross_section_strips[0]?.strip_id ?? null;
    clearFurniturePlacement();
    markAnnotationChanged(`Locked branch anchor on ${host.id}. Move the mouse and click again to place the branch end.`);
    renderAll();
  }

  function beginCrossFromSnap(snap: BranchSnapTarget): void {
    const host = state.annotation.centerlines.find((item) => item.id === snap.centerlineId);
    if (!host) {
      setStatus(statusEl, "Could not resolve the host road for this cross anchor.", "error");
      return;
    }
    const anchorPoint = clonePoint(snap.point);
    const axisNormal = crossAxisNormalAtSnap(host, snap);
    state.crossDraft = {
      anchor: { ...snap, point: { ...anchorPoint } },
      axisNormal,
      halfLengthPx: 0,
      negativeEndpoint: { ...anchorPoint },
      positiveEndpoint: { ...anchorPoint },
      negativeEndpointSnap: null,
      positiveEndpointSnap: null,
    };
    state.crossHoverSnap = null;
    state.selection = { kind: "centerline", id: host.id };
    state.selectedStripId = host.cross_section_strips[0]?.strip_id ?? null;
    clearFurniturePlacement();
    setStatus(statusEl, `Locked cross center on ${host.id}. Move the mouse and click again to set the cross half-length.`, "neutral");
    renderAll();
  }

  function commitBranchAtPoint(point: AnnotationPoint): void {
    const draft = state.branchDraft;
    if (!draft) {
      return;
    }
    const host = state.annotation.centerlines.find((item) => item.id === draft.anchor.centerlineId);
    if (!host) {
      clearBranchDraft();
      setStatus(statusEl, "The host road is no longer available. Start the branch again.", "error");
      renderAll();
      return;
    }
    const endpointSnap = findNearestBranchSnapTarget(state.annotation, point, {
      excludeCenterlineId: draft.anchor.centerlineId,
    });
    let endpoint = endpointSnap ? { ...endpointSnap.point } : { ...point };
    if (!endpointSnap) {
      const hostProjection = projectPointOntoPolyline(host.points, point);
      if (hostProjection.distancePx <= BRANCH_SNAP_TOLERANCE_PX) {
        setStatus(statusEl, "Branch end cannot snap back onto the host road. Click away from the host or snap to another road.", "error");
        state.branchDraft = {
          ...draft,
          endpoint: { ...hostProjection.projectedPoint },
          endpointSnap: null,
        };
        renderAll();
        return;
      }
    }
    const minLengthPx = BRANCH_MIN_LENGTH_M * Math.max(state.annotation.pixels_per_meter, 0.0001);
    if (pointDistance(draft.anchor.point, endpoint) < minLengthPx) {
      setStatus(statusEl, `Branch is too short. Minimum branch length is ${BRANCH_MIN_LENGTH_M.toFixed(1)}m.`, "error");
      state.branchDraft = {
        ...draft,
        endpoint,
        endpointSnap,
      };
      renderAll();
      return;
    }
    const branchId = nextFeatureId(state.annotation, "centerline");
    const centralJunctionId = nextFeatureId(state.annotation, "junction");
    const hostJunctionResult = ensureExplicitJunctionAtSnap(state.annotation, host.id, draft.anchor, {
      junctionId: centralJunctionId,
      kind: "t_junction",
      additionalConnectedCenterlineIds: [branchId],
      blockedCenterlineIds: [branchId],
    });
    if (!hostJunctionResult) {
      clearBranchDraft();
      setStatus(statusEl, "Could not create a branch junction on the host road.", "error");
      renderAll();
      return;
    }
    const branch = createArmFromProfile(host, branchId, [hostJunctionResult.anchorPoint, endpoint], {
      startJunctionId: hostJunctionResult.junction.id,
    });
    const resolvedEndpoint = maybeConnectArmEndpointToSnap(host, branch, endpoint, endpointSnap, "end");
    if (!resolvedEndpoint) {
      renderAll();
      return;
    }
    branch.points = [clonePoint(hostJunctionResult.anchorPoint), clonePoint(resolvedEndpoint)];
    syncCenterlineDerivedFields(branch);
    state.annotation.centerlines.push(branch);
    updateJunctionConnectedCenterlines(state.annotation, hostJunctionResult.junction.id, [
      ...hostJunctionResult.junction.connected_centerline_ids,
      branch.id,
    ]);
    state.selection = { kind: "centerline", id: branchId };
    state.selectedStripId = branch.cross_section_strips[0]?.strip_id ?? null;
    clearFurniturePlacement();
    clearBranchDraft();
    markAnnotationChanged(`Created branch ${branchId}.`);
    renderAll();
  }

  function commitCrossAtPoint(point: AnnotationPoint): void {
    const draft = state.crossDraft;
    if (!draft) {
      return;
    }
    const host = state.annotation.centerlines.find((item) => item.id === draft.anchor.centerlineId);
    if (!host) {
      clearCrossDraft();
      setStatus(statusEl, "The host road is no longer available. Start the cross again.", "error");
      renderAll();
      return;
    }
    updateCrossPreview(point);
    const refreshedDraft = state.crossDraft;
    if (!refreshedDraft) {
      return;
    }
    const minLengthPx = CROSS_MIN_HALF_LENGTH_M * Math.max(state.annotation.pixels_per_meter, 0.0001);
    if (refreshedDraft.halfLengthPx < minLengthPx) {
      setStatus(
        statusEl,
        `Cross is too short. Minimum half-length is ${CROSS_MIN_HALF_LENGTH_M.toFixed(1)}m.`,
        "error",
      );
      renderAll();
      return;
    }
    let negativeEndpoint = { ...refreshedDraft.negativeEndpoint };
    let positiveEndpoint = { ...refreshedDraft.positiveEndpoint };
    const [negativeArmId, positiveArmId] = reserveNextFeatureIds(state.annotation, "centerline", 2);
    const centralJunctionId = nextFeatureId(state.annotation, "junction");
    const hostJunctionResult = ensureExplicitJunctionAtSnap(state.annotation, host.id, refreshedDraft.anchor, {
      junctionId: centralJunctionId,
      kind: "cross_junction",
      additionalConnectedCenterlineIds: [negativeArmId, positiveArmId],
      blockedCenterlineIds: [negativeArmId, positiveArmId],
    });
    if (!hostJunctionResult) {
      clearCrossDraft();
      setStatus(statusEl, "Could not create a cross junction on the host road.", "error");
      renderAll();
      return;
    }
    const negativeArm = createArmFromProfile(host, negativeArmId, [hostJunctionResult.anchorPoint, negativeEndpoint], {
      startJunctionId: hostJunctionResult.junction.id,
    });
    const positiveArm = createArmFromProfile(host, positiveArmId, [hostJunctionResult.anchorPoint, positiveEndpoint], {
      startJunctionId: hostJunctionResult.junction.id,
    });
    const resolvedNegative = maybeConnectArmEndpointToSnap(
      host,
      negativeArm,
      negativeEndpoint,
      refreshedDraft.negativeEndpointSnap,
      "end",
    );
    if (!resolvedNegative) {
      renderAll();
      return;
    }
    const resolvedPositive = maybeConnectArmEndpointToSnap(
      host,
      positiveArm,
      positiveEndpoint,
      refreshedDraft.positiveEndpointSnap,
      "end",
    );
    if (!resolvedPositive) {
      renderAll();
      return;
    }
    negativeArm.points = [clonePoint(hostJunctionResult.anchorPoint), clonePoint(resolvedNegative)];
    positiveArm.points = [clonePoint(hostJunctionResult.anchorPoint), clonePoint(resolvedPositive)];
    syncCenterlineDerivedFields(negativeArm);
    syncCenterlineDerivedFields(positiveArm);
    state.annotation.centerlines.push(negativeArm, positiveArm);
    updateJunctionConnectedCenterlines(state.annotation, hostJunctionResult.junction.id, [
      ...hostJunctionResult.junction.connected_centerline_ids,
      negativeArm.id,
      positiveArm.id,
    ]);
    const autoDetailedRoadIds = new Set<string>([
      ...hostJunctionResult.junction.connected_centerline_ids,
      negativeArm.id,
      positiveArm.id,
    ]);
    for (const junction of state.annotation.junctions) {
      if (
        junction.source_mode === "explicit" &&
        (junction.id === hostJunctionResult.junction.id ||
          junction.connected_centerline_ids.includes(negativeArm.id) ||
          junction.connected_centerline_ids.includes(positiveArm.id))
      ) {
        for (const centerlineId of junction.connected_centerline_ids) {
          autoDetailedRoadIds.add(centerlineId);
        }
      }
    }
    ensureDetailedCrossSections(state.annotation, autoDetailedRoadIds);
    state.selection = { kind: "junction", id: hostJunctionResult.junction.id };
    state.selectedStripId = null;
    clearFurniturePlacement();
    clearCrossDraft();
    revealJunctionSurfaceLayers();
    markAnnotationChanged(`Created cross junction ${hostJunctionResult.junction.id} and auto-split the connected roads into detailed cross-sections.`);
    renderAll();
  }

  function placeFurnitureAtPoint(point: AnnotationPoint): boolean {
    if (!state.furniturePlacement) {
      return false;
    }

    // Check if click is inside a functional zone when snap is OFF
    const insideFunctionalZone = !state.snapToRoadEnabled && state.annotation.functional_zones.some(
      (zone) => zone.points.length >= 3 && pointInPolygon(point, zone.points)
    );

    // If inside functional zone with snap OFF, place furniture directly in the zone
    if (insideFunctionalZone) {
      const targetZone = state.annotation.functional_zones.find(
        (zone) => zone.points.length >= 3 && pointInPolygon(point, zone.points)
      );
      if (targetZone) {
        const instanceId = nextFeatureId(state.annotation, "zone_furniture");
        targetZone.furniture_instances.push({
          instance_id: instanceId,
          kind: state.furniturePlacement.kind,
          x_px: point.x,
          y_px: point.y,
          yaw_deg: null,
        });
        clearGraphResult("Annotation changed. Road graph will refresh automatically.");
        setStatus(
          statusEl,
          `Placed ${state.furniturePlacement.kind} in ${targetZone.label}. Click again to place another.`,
          "success",
        );
        renderAll();
        return true;
      }
    }

    // Normal road-based furniture placement
    const centerline = state.annotation.centerlines.find((item) => item.id === state.furniturePlacement?.centerlineId);
    if (!centerline) {
      setStatus(statusEl, "No road selected. Select a road first to place furniture.", "error");
      return false;
    }

    let strip = centerline.cross_section_strips.find((item) => item.strip_id === state.furniturePlacement?.stripId);
    if (!strip || !FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) {
      strip = centerline.cross_section_strips.find((item) => FURNITURE_COMPATIBLE_STRIP_KINDS.has(item.kind));
    }

    if (!strip || !FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) {
      setStatus(statusEl, "No furnishing strip on this road. Add a nearroad_furnishing or frontage_reserve strip first.", "error");
      return false;
    }

    const projection = projectPointOntoPolyline(centerline.points, point);
    const ppm = Math.max(state.annotation.pixels_per_meter, 0.0001);
    const stripBounds = stripCenterOffsetMeters(centerline)[strip.strip_id];
    const halfWidthM = stripBounds ? stripBounds.widthM * 0.5 : strip.width_m * 0.5;
    const centerOffsetM = stripBounds ? stripBounds.centerOffsetM : 0;
    const absoluteLateralOffsetM = clamp(
      projection.lateralPx / ppm,
      centerOffsetM - halfWidthM,
      centerOffsetM + halfWidthM,
    );
    const lateralOffsetM = absoluteLateralOffsetM - centerOffsetM;
    centerline.street_furniture_instances.push({
      instance_id: nextFurnitureInstanceId(centerline),
      centerline_id: centerline.id,
      strip_id: strip.strip_id,
      kind: state.furniturePlacement.kind,
      station_m: projection.stationPx / ppm,
      lateral_offset_m: lateralOffsetM,
      yaw_deg: null,
    });
    syncCenterlineDerivedFields(centerline);
    clearGraphResult("Annotation changed. Road graph will refresh automatically.");
    setStatus(
      statusEl,
      `Placed ${state.furniturePlacement.kind} on ${strip.strip_id}. Click again to place another, or cancel placement.`,
      "success",
    );
    renderAll();
    return true;
  }

  function pointInPolygon(point: AnnotationPoint, polygon: AnnotationPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function placeFurnitureQuick(point: AnnotationPoint, kind: FurnitureKind): boolean {
    const ppm = Math.max(state.annotation.pixels_per_meter, 0.0001);
    let targetCenterline: AnnotatedCenterline | null = null;
    let targetProjection: ReturnType<typeof projectPointOntoPolyline> | null = null;
    let targetStrip: AnnotatedCrossSectionStrip | null = null;

    // Check if clicked inside a functional zone to allow freer placement when snap is off
    const insideFunctionalZone = state.annotation.functional_zones.some(
      (zone) => zone.points.length >= 3 && pointInPolygon(point, zone.points)
    );

    // 0. If snap is off and clicked inside a functional zone, place directly in the zone.
    if (!state.snapToRoadEnabled && insideFunctionalZone) {
      // Prefer currently selected zone, otherwise any zone containing the point
      let targetZone = state.selection?.kind === "functional_zone"
        ? state.annotation.functional_zones.find((z) => z.id === state.selection!.id) ?? null
        : null;
      if (!targetZone || !pointInPolygon(point, targetZone.points)) {
        targetZone = state.annotation.functional_zones.find(
          (z) => z.points.length >= 3 && pointInPolygon(point, z.points)
        ) ?? null;
      }
      if (targetZone) {
        const instanceId = nextFeatureId(state.annotation, "zone_furniture");
        targetZone.furniture_instances.push({
          instance_id: instanceId,
          kind,
          x_px: point.x,
          y_px: point.y,
          yaw_deg: null,
        });
        clearGraphResult("Annotation changed. Road graph will refresh automatically.");
        setStatus(statusEl, `Placed ${FURNITURE_KIND_LABELS[kind]} in ${targetZone.label}.`, "success");
        renderAll();
        return true;
      }
    }

    // 1. If snap is off but a centerline is explicitly selected, prefer it.
    if (!state.snapToRoadEnabled && state.selection?.kind === "centerline") {
      targetCenterline = state.annotation.centerlines.find((item) => item.id === state.selection?.id) ?? null;
      if (targetCenterline) {
        targetProjection = projectPointOntoPolyline(targetCenterline.points, point);
        const selectedStrip = state.selectedStripId
          ? targetCenterline.cross_section_strips.find((item) => item.strip_id === state.selectedStripId)
          : null;
        if (selectedStrip && FURNITURE_COMPATIBLE_STRIP_KINDS.has(selectedStrip.kind)) {
          targetStrip = selectedStrip;
        } else {
          targetStrip = targetCenterline.cross_section_strips.find((strip) => FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) ?? null;
        }
      }
    }

    // 2. Otherwise fall back to nearest-road search.
    if (!targetCenterline) {
      for (const cl of state.annotation.centerlines) {
        if (cl.points.length < 2) {
          continue;
        }
        const proj = projectPointOntoPolyline(cl.points, point);
        if (!targetProjection || proj.distancePx < targetProjection.distancePx) {
          targetCenterline = cl;
          targetProjection = proj;
        }
      }
      const maxDistancePx = state.snapToRoadEnabled
        ? 200
        : (insideFunctionalZone ? Number.POSITIVE_INFINITY : 80);
      if (!targetCenterline || !targetProjection || targetProjection.distancePx > maxDistancePx) {
        const msg = state.snapToRoadEnabled
          ? "No road nearby. Click closer to a centerline."
          : "Road snap is off. Select a centerline first, or click closer to a road.";
        setStatus(statusEl, msg, "error");
        return false;
      }
      const offsets = stripCenterOffsetMeters(targetCenterline);
      const clickLateralM = targetProjection.lateralPx / ppm;
      let bestDist = Infinity;
      for (const strip of targetCenterline.cross_section_strips) {
        if (!FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) {
          continue;
        }
        const info = offsets[strip.strip_id];
        if (!info) {
          continue;
        }
        const dist = Math.abs(info.centerOffsetM - clickLateralM);
        if (dist < bestDist) {
          bestDist = dist;
          targetStrip = strip;
        }
      }
    }

    if (!targetCenterline || !targetProjection) {
      return false;
    }
    if (!targetStrip) {
      setStatus(statusEl, "No furnishing strip on this road. Add a nearroad_furnishing or frontage_reserve strip first.", "error");
      return false;
    }

    const offsets = stripCenterOffsetMeters(targetCenterline);
    const stripBounds = offsets[targetStrip.strip_id];
    const halfW = stripBounds ? stripBounds.widthM * 0.5 : targetStrip.width_m * 0.5;
    const centerOff = stripBounds ? stripBounds.centerOffsetM : 0;
    const clickLateralM = targetProjection.lateralPx / ppm;
    const absLateral = clamp(clickLateralM, centerOff - halfW, centerOff + halfW);
    const lateralOffsetM = absLateral - centerOff;
    targetCenterline.street_furniture_instances.push({
      instance_id: nextFurnitureInstanceId(targetCenterline),
      centerline_id: targetCenterline.id,
      strip_id: targetStrip.strip_id,
      kind,
      station_m: targetProjection.stationPx / ppm,
      lateral_offset_m: lateralOffsetM,
      yaw_deg: null,
    });
    syncCenterlineDerivedFields(targetCenterline);
    clearGraphResult("Annotation changed. Road graph will refresh automatically.");
    setStatus(statusEl, `Placed ${FURNITURE_KIND_LABELS[kind]} on ${targetStrip.strip_id}.`, "success");
    renderAll();
    return true;
  }

  assetEditorButton.addEventListener(
    "click",
    () => {
      window.location.hash = "#asset-editor";
    },
    { signal },
  );

  backButton.addEventListener(
    "click",
    () => {
      window.location.hash = "#viewer";
    },
    { signal },
  );

  async function handleScenarioDesignSelection(nextScenarioId: string): Promise<void> {
    const previousScenarioId = state.selectedScenarioId;
    if (!nextScenarioId) {
      state.selectedScenarioId = "";
      renderScenarioDesignOptions();
      return;
    }
    if (isAnnotationDirty()) {
      const confirmed = window.confirm("Load this scenario design and replace the current annotation?");
      if (!confirmed) {
        renderScenarioDesignOptions(previousScenarioId);
        return;
      }
    }
    try {
      await applyScenarioDesignAnnotation(nextScenarioId);
    } catch (error) {
      state.selectedScenarioId = previousScenarioId;
      renderScenarioDesignOptions(previousScenarioId);
      setStatus(
        statusEl,
        error instanceof Error ? error.message : "Failed to load scenario design annotation.",
        "error",
      );
    }
  }

  for (const selectEl of scenarioDesignSelects()) {
    selectEl.addEventListener(
      "change",
      () => {
        void handleScenarioDesignSelection(selectEl.value);
      },
      { signal },
    );
  }

  planSelect.addEventListener(
    "change",
    async () => {
      if (!planSelect.value) {
        return;
      }
      try {
        await applyReferencePlan(planSelect.value);
      } catch (error) {
        setStatus(
          statusEl,
          statusTextFromImageLoadError(error, "sceneGraph.status.failedLoadReferencePlan", "Failed to load reference plan."),
          "error",
        );
      }
    },
    { signal },
  );

  sourceImageImportButton.addEventListener("click", () => imageInput.click(), { signal });
  sourceGeojsonInput.addEventListener(
    "change",
    async () => {
      const file = sourceGeojsonInput.files?.[0];
      if (!file) return;
      try {
        const geojson = JSON.parse(await file.text()) as Record<string, unknown>;
        if (geojson.type !== "FeatureCollection" && geojson.type !== "Feature") {
          throw new Error("GeoJSON must be a FeatureCollection or Feature.");
        }
        workflow.setSourceDraft({
          kind: "geojson",
          fileName: file.name,
          geojson,
        });
        pendingOsmNormalization = null;
        setStatus(sourceStatusEl, `Loaded ${file.name}. Normalize it before review.`, "success");
        renderSourceWorkflow();
      } catch (error) {
        setStatus(sourceStatusEl, error instanceof Error ? error.message : "Failed to import GeoJSON.", "error");
      } finally {
        sourceGeojsonInput.value = "";
      }
    },
    { signal },
  );
  sourceNormalizeButton.addEventListener("click", () => void normalizeCurrentSceneSource(), { signal });
  sourceAiExtractButton.addEventListener("click", () => void extractCurrentReferenceImage(), { signal });
  sourceOsmImportButton.addEventListener("click", () => void importOsmContext(), { signal });
  sourceBackButton.addEventListener(
    "click",
    () => {
      workflow.transition("source");
      shell.activateRightTab("source");
      renderSourceWorkflow();
    },
    { signal },
  );
  sourceApproveButton.addEventListener(
    "click",
    () => {
      const result = workflow.approveReview();
      if (!result.ok) setStatus(sourceReviewStatusEl, result.reason, "error");
    },
    { signal },
  );
  sourceGenerateButton.addEventListener("click", () => void generateApprovedScene(), { signal });

  imageInput.addEventListener(
    "change",
    async () => {
      const file = imageInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        uploadedImageDataUrl = await readImageFileDataUrl(file);
        revokeCurrentObjectUrl();
        state.currentObjectUrl = URL.createObjectURL(file);
        await loadImageFromUrl(state.currentObjectUrl, { planId: "custom_upload", preserveFeatures: false });
        state.annotation.image_path = file.name;
        state.selectedScenarioId = "";
        planSelect.value = "";
        workflow.setSourceDraft({
          kind: "reference_image",
          imageDataUrl: uploadedImageDataUrl,
          fileName: file.name,
          geojson: null,
        });
        pendingOsmNormalization = null;
        updateCleanAnnotationSnapshot();
        renderScenarioDesignOptions();
        renderSourceWorkflow();
      } catch (error) {
        setStatus(
          statusEl,
          statusTextFromImageLoadError(error, "sceneGraph.status.failedLoadUploadedImage", "Failed to load uploaded image."),
          "error",
        );
      } finally {
        imageInput.value = "";
      }
    },
    { signal },
  );

  imageResetButton.addEventListener(
    "click",
    () => {
      revokeCurrentObjectUrl();
      state.currentImageUrl = "";
      state.annotation = createEmptyAnnotation(state.annotation.plan_id);
      state.selectedScenarioId = "";
      clearAnnotationEditingState();
      originalImageEl.removeAttribute("src");
      clearGraphResult("Image cleared. Load another reference plan to continue.");
      renderScenarioDesignOptions();
      setStatus(statusEl, "Reference image cleared.", "neutral");
      renderAll();
      uploadedImageDataUrl = "";
      pendingOsmNormalization = null;
      resetViewport();
      workflow.setSourceDraft({
        kind: "manual_annotation",
        imageDataUrl: null,
        fileName: null,
        geojson: null,
      });
      renderSourceWorkflow();
    },
    { signal },
  );

  showOriginalInput.addEventListener(
    "change",
    () => {
      state.showOriginal = showOriginalInput.checked;
      updateStageVisibility();
    },
    { signal },
  );
  showOverlayInput.addEventListener(
    "change",
    () => {
      state.showOverlay = showOverlayInput.checked;
      updateStageVisibility();
    },
    { signal },
  );
  showJunctionCoreInput.addEventListener(
    "change",
    () => {
      state.showJunctionCore = showJunctionCoreInput.checked;
      renderOverlay();
    },
    { signal },
  );
  showJunctionConnectorsInput.addEventListener(
    "change",
    () => {
      state.showJunctionConnectors = showJunctionConnectorsInput.checked;
      renderOverlay();
    },
    { signal },
  );
  showJunctionOutlinesInput.addEventListener(
    "change",
    () => {
      state.showJunctionOutlines = showJunctionOutlinesInput.checked;
      renderOverlay();
    },
    { signal },
  );
  showJunctionCrosswalksInput.addEventListener(
    "change",
    () => {
      state.showJunctionCrosswalks = showJunctionCrosswalksInput.checked;
      renderOverlay();
    },
    { signal },
  );
  showJunctionBoundariesInput.addEventListener(
    "change",
    () => {
      state.showJunctionBoundaries = showJunctionBoundariesInput.checked;
      renderOverlay();
    },
    { signal },
  );
  showJunctionLabelsInput.addEventListener(
    "change",
    () => {
      state.showJunctionLabels = showJunctionLabelsInput.checked;
      renderOverlay();
    },
    { signal },
  );
  showJunctionDebugInput.addEventListener(
    "change",
    () => {
      state.showJunctionDebug = showJunctionDebugInput.checked;
      renderOverlay();
    },
    { signal },
  );
  originalOpacityInput.addEventListener(
    "input",
    () => {
      state.originalOpacity = asNumber(originalOpacityInput.value, 100) / 100;
      updateStageVisibility();
    },
    { signal },
  );
  overlayOpacityInput.addEventListener(
    "input",
    () => {
      state.overlayOpacity = asNumber(overlayOpacityInput.value, 88) / 100;
      updateStageVisibility();
    },
    { signal },
  );
  pixelsPerMeterInput.addEventListener(
    "input",
    () => {
      state.annotation.pixels_per_meter = Math.max(0.1, asNumber(pixelsPerMeterInput.value, state.annotation.pixels_per_meter));
      clearGraphResult("Scale changed. Road graph will refresh automatically.");
      renderAll();
    },
    { signal },
  );
  roundaboutRadiusInput.addEventListener(
    "input",
    () => {
      state.defaultRoundaboutRadiusPx = Math.max(8, asNumber(roundaboutRadiusInput.value, state.defaultRoundaboutRadiusPx));
    },
    { signal },
  );

  for (const button of toolButtons) {
    button.addEventListener(
      "click",
      () => {
        const tool = button.dataset.tool as Tool | undefined;
        if (tool) {
          setTool(tool);
        }
      },
      { signal },
    );
  }

  finishCenterlineButton.addEventListener("click", finalizeDraftCenterline, { signal });
  autoSplitRegionsButton.addEventListener("click", () => { void deriveBuildingRegions(); }, { signal });
  selectAllRoadsButton.addEventListener(
    "click",
    () => {
      if (state.annotation.centerlines.length === 0) {
        return;
      }
      if (state.selection?.kind === "road_collection") {
        state.selection = null;
        state.selectedStripId = null;
        clearFurniturePlacement();
        setStatus(statusEl, "Cleared road collection selection.", "neutral");
        renderAll();
        return;
      }
      state.selection = { kind: "road_collection", id: ALL_ROADS_SELECTION_ID };
      state.selectedStripId = null;
      clearFurniturePlacement();
      setStatus(statusEl, `Selected all ${state.annotation.centerlines.length} roads.`, "neutral");
      renderAll();
    },
    { signal },
  );
  undoPointButton.addEventListener(
    "click",
    () => {
      if (state.drag?.kind === "functional_zone_draw") {
        state.drag.points.pop();
        if (state.drag.points.length === 0) {
          state.drag = null;
        }
      } else if (state.drag?.kind === "region_draw") {
        state.drag.points.pop();
        if (state.drag.points.length === 0) {
          state.drag = null;
        }
      } else if (state.drag?.kind === "region_box_draw") {
        state.drag = null;
      } else {
        state.draftCenterline.pop();
      }
      renderAll();
    },
    { signal },
  );
  deleteSelectedButton.addEventListener("click", deleteSelection, { signal });
  resetAnnotationButton.addEventListener(
    "click",
    () => {
      const confirmed = window.confirm("Reset Annotation will clear all reference annotations on this plan. Continue?");
      if (!confirmed) {
        setStatus(statusEl, "Reset cancelled.", "neutral");
        return;
      }
      resetAnnotation();
    },
    { signal },
  );
  snapToRoadInput.addEventListener("change", () => {
    state.snapToRoadEnabled = snapToRoadInput.checked;
    setStatus(statusEl, state.snapToRoadEnabled ? "Road snap enabled." : "Road snap disabled. Furniture will place on selected road/strip.", "neutral");
  }, { signal });

  zoomOutButton.addEventListener(
    "click",
    () => setViewportScale(state.viewportScale / ANNOTATION_ZOOM_STEP),
    { signal },
  );
  zoomInButton.addEventListener(
    "click",
    () => setViewportScale(state.viewportScale * ANNOTATION_ZOOM_STEP),
    { signal },
  );
  zoomFitButton.addEventListener("click", resetViewport, { signal });
  stageEl.addEventListener(
    "wheel",
    (event) => {
      if (!hasAnnotationCanvas() || (event.target instanceof HTMLElement && event.target.closest(".scene-canvas-viewport-controls"))) {
        return;
      }
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      setViewportScale(state.viewportScale * zoomFactor, event.clientX, event.clientY);
    },
    { signal, passive: false },
  );
  stageEl.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof HTMLElement && event.target.closest(".scene-canvas-viewport-controls")) return;
      beginViewportPan(event);
    },
    { signal, capture: true },
  );

  overlayHostEl.addEventListener(
    "dblclick",
    (event) => {
      if (!hasAnnotationCanvas()) {
        return;
      }
      if (state.drag?.kind === "functional_zone_draw") {
        event.preventDefault();
        commitFunctionalZoneDraft();
      }
      if (state.drag?.kind === "region_draw") {
        event.preventDefault();
        commitRegionDraft();
      }
    },
    { signal },
  );

  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.code === "Space"
        && !event.repeat
        && !isEditableKeyboardTarget(event.target)
        && (stageEl.matches(":hover") || document.activeElement === stageEl)
      ) {
        state.viewportSpacePressed = true;
        renderViewportControls();
        event.preventDefault();
      }
      if (state.drag?.kind === "functional_zone_draw" && event.key === "Enter") {
        event.preventDefault();
        commitFunctionalZoneDraft();
      }
      if (state.drag?.kind === "region_draw" && event.key === "Enter") {
        event.preventDefault();
        commitRegionDraft();
      }
      if (state.drag?.kind === "functional_zone_draw" && event.key === "Escape") {
        event.preventDefault();
        state.drag = null;
        renderAll();
        setStatus(statusEl, "Cancelled functional zone drawing.", "neutral");
      }
      if (state.drag?.kind === "region_draw" && event.key === "Escape") {
        event.preventDefault();
        state.drag = null;
        renderAll();
        setStatus(statusEl, "Cancelled region drawing.", "neutral");
      }
      if (state.drag?.kind === "region_box_draw" && event.key === "Escape") {
        event.preventDefault();
        state.drag = null;
        renderAll();
        setStatus(statusEl, "Cancelled scene region box.", "neutral");
      }
    },
    { signal },
  );

  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code !== "Space") return;
      state.viewportSpacePressed = false;
      renderViewportControls();
    },
    { signal },
  );

  window.addEventListener(
    "blur",
    () => {
      state.viewportSpacePressed = false;
      state.viewportPan = null;
      renderViewportControls();
    },
    { signal },
  );

  overlayHostEl.addEventListener(
    "pointerdown",
    (event) => {
      if (!hasAnnotationCanvas()) {
        return;
      }
      const hit = state.selectedTool === "adjust" ? featureHitFromTarget(event.target) : hitFromTarget(event.target);
      const point = imagePointFromPointer(event);

      if (state.selectedTool === "select") {
        if (state.furniturePlacement && point) {
          if (placeFurnitureAtPoint(point)) {
            return;
          }
        }
        state.selection = hit;
        if (hit?.kind === "lane_element") {
          state.selectedStripId = hit.stripId ?? hit.fromStripId ?? null;
        } else if (hit?.kind !== "centerline") {
          state.selectedStripId = null;
        }
        state.drag = null;
        syncSelectionAfterMutation();
        renderAll();
        return;
      }

      if (state.selectedTool === "adjust") {
        const regionHandle = buildingRegionHandleFromTarget(event.target);
        state.selection = hit;
        if (hit?.kind !== "centerline") {
          state.selectedStripId = null;
        }
        if (regionHandle) {
          state.selection = { kind: "building_region", id: regionHandle.regionId };
          state.selectedStripId = null;
          state.drag =
            regionHandle.handleKind === "resize"
              ? {
                  kind: "building_region_resize",
                  id: regionHandle.regionId,
                  pointerId: event.pointerId,
                  handle: regionHandle.resizeHandle ?? "se",
                }
              : {
                  kind: "building_region_rotate",
                  id: regionHandle.regionId,
                  pointerId: event.pointerId,
                };
          event.preventDefault();
          event.stopPropagation();
        } else if (hit?.kind === "building_region" && point) {
          state.drag = {
            kind: "building_region_translate",
            id: hit.id,
            pointerId: event.pointerId,
            lastPoint: point,
          };
        } else if (hit?.kind === "centerline" && hit.vertexIndex !== undefined) {
          state.drag = {
            kind: "centerline_vertex",
            id: hit.id,
            vertexIndex: hit.vertexIndex,
            pointerId: event.pointerId,
          };
        } else if (hit?.kind === "centerline" && point) {
          state.drag = {
            kind: "centerline_translate",
            id: hit.id,
            pointerId: event.pointerId,
            lastPoint: point,
          };
        } else if (
          hit?.kind === "junction" &&
          (state.annotation.junctions.find((item) => item.id === hit.id)?.source_mode ?? "legacy_marker") !== "explicit"
        ) {
          state.drag = {
            kind: "marker",
            markerKind: hit.kind,
            id: hit.id,
            pointerId: event.pointerId,
          };
        } else if (hit?.kind === "roundabout" || hit?.kind === "control_point") {
          state.drag = {
            kind: "marker",
            markerKind: hit.kind,
            id: hit.id,
            pointerId: event.pointerId,
          };
        } else {
          state.drag = null;
        }
        syncSelectionAfterMutation();
        renderAll();
        return;
      }

      if (!point) {
        return;
      }

      if (state.selectedTool === "centerline") {
        state.draftCenterline.push(point);
        state.selection = null;
        state.selectedStripId = null;
        clearBranchDraft();
        clearCrossDraft();
        renderAll();
        return;
      }

      if (state.selectedTool === "branch") {
        if (state.branchDraft) {
          commitBranchAtPoint(point);
          return;
        }
        if (state.branchHoverSnap) {
          beginBranchFromSnap(state.branchHoverSnap);
          return;
        }
        if (state.annotation.centerlines.length === 0) {
          setStatus(statusEl, "Draw at least one centerline before creating a branch.", "error");
        } else {
          setStatus(statusEl, "Branch Tool starts from an existing road. Hover a road until the snap anchor appears.", "error");
        }
        renderAll();
        return;
      }

      if (state.selectedTool === "cross") {
        if (state.crossDraft) {
          commitCrossAtPoint(point);
          return;
        }
        if (state.crossHoverSnap) {
          beginCrossFromSnap(state.crossHoverSnap);
          return;
        }
        createStandaloneCrossAtPoint(point);
        return;
      }

      if (state.selectedTool === "building_region") {
        state.selection = null;
        state.selectedStripId = null;
        clearFurniturePlacement();
        state.drag = {
          kind: "building_region_draw",
          pointerId: event.pointerId,
          startPoint: point,
          currentPoint: point,
        };
        renderAll();
        return;
      }

      if (state.selectedTool === "functional_zone") {
        state.selection = null;
        state.selectedStripId = null;
        clearFurniturePlacement();
        if (state.drag?.kind === "functional_zone_draw" && state.drag.pointerId === event.pointerId) {
          state.drag = {
            ...state.drag,
            points: [...state.drag.points, point],
          };
        } else {
          state.drag = {
            kind: "functional_zone_draw",
            pointerId: event.pointerId,
            points: [point],
            currentPoint: point,
          };
        }
        renderAll();
        return;
      }

      if (state.selectedTool === "scene_region") {
        state.selection = null;
        state.selectedStripId = null;
        clearFurniturePlacement();
        state.drag = {
          kind: "region_box_draw",
          pointerId: event.pointerId,
          regionRole: "scene_region",
          startPoint: point,
          currentPoint: point,
        };
        renderAll();
        return;
      }

      if (state.selectedTool === "surface_annotation") {
        createSurfaceAnnotationAtPoint(point, hit);
        return;
      }

      if (state.selectedTool === "tree") {
        placeFurnitureQuick(point, "tree");
        return;
      }
      if (state.selectedTool === "lamp") {
        placeFurnitureQuick(point, "lamp");
        return;
      }
      if (state.selectedTool === "bench") {
        placeFurnitureQuick(point, "bench");
        return;
      }
      if (state.selectedTool === "trash") {
        placeFurnitureQuick(point, "trash");
        return;
      }
      if (state.selectedTool === "bus_stop") {
        placeFurnitureQuick(point, "bus_stop");
        return;
      }
      if (state.selectedTool === "bollard") {
        placeFurnitureQuick(point, "bollard");
        return;
      }
      if (state.selectedTool === "mailbox") {
        placeFurnitureQuick(point, "mailbox");
        return;
      }
      if (state.selectedTool === "hydrant") {
        placeFurnitureQuick(point, "hydrant");
        return;
      }
      if (state.selectedTool === "sign") {
        placeFurnitureQuick(point, "sign");
        return;
      }

      if (state.selectedTool === "control_point") {
        const id = nextFeatureId(state.annotation, "control_point");
        state.annotation.control_points.push({ id, label: id, x: point.x, y: point.y, kind: "control_point" });
        state.selection = { kind: "control_point", id };
        state.selectedStripId = null;
        clearGraphResult("Annotation changed. Road graph will refresh automatically.");
        setStatus(statusEl, `Added control point ${id}.`, "success");
        renderAll();
        return;
      }

      if (state.selectedTool === "roundabout") {
        const id = nextFeatureId(state.annotation, "roundabout");
        state.annotation.roundabouts.push({
          id,
          label: id,
          x: point.x,
          y: point.y,
          radius_px: state.defaultRoundaboutRadiusPx,
        });
        state.selection = { kind: "roundabout", id };
        state.selectedStripId = null;
        clearGraphResult("Annotation changed. Road graph will refresh automatically.");
        setStatus(statusEl, `Added roundabout ${id}.`, "success");
        renderAll();
      }
    },
    { signal },
  );

  window.addEventListener(
    "pointermove",
    (event) => {
      if (state.viewportPan?.pointerId === event.pointerId) {
        stageEl.scrollLeft = state.viewportPan.startScrollLeft - (event.clientX - state.viewportPan.startClientX);
        stageEl.scrollTop = state.viewportPan.startScrollTop - (event.clientY - state.viewportPan.startClientY);
        event.preventDefault();
        return;
      }
      if (state.previewResize && state.previewResize.pointerId === event.pointerId) {
        const centerline = state.annotation.centerlines.find((item) => item.id === state.previewResize?.centerlineId);
        const leftStrip = centerline?.cross_section_strips.find((strip) => strip.strip_id === state.previewResize?.leftStripId);
        const rightStrip = centerline?.cross_section_strips.find((strip) => strip.strip_id === state.previewResize?.rightStripId);
        if (!centerline || !leftStrip || !rightStrip) {
          state.previewResize = null;
          return;
        }
        const pairWidthM = state.previewResize.startLeftWidthM + state.previewResize.startRightWidthM;
        const deltaPx = event.clientX - state.previewResize.startClientX;
        const deltaM = deltaPx * (pairWidthM / Math.max(1, state.previewResize.pairWidthPx));
        const clampedDeltaM = clamp(
          deltaM,
          -(state.previewResize.startLeftWidthM - 0.1),
          state.previewResize.startRightWidthM - 0.1,
        );
        leftStrip.width_m = Math.max(0.1, state.previewResize.startLeftWidthM + clampedDeltaM);
        rightStrip.width_m = Math.max(0.1, state.previewResize.startRightWidthM - clampedDeltaM);
        state.previewResize.didResize = true;
        syncCenterlineDerivedFields(centerline);
        clearGraphResult("Annotation changed. Road graph will refresh automatically.");
        renderAll();
        return;
      }
      if (state.selectedTool === "branch" && !state.drag) {
        updateBranchPreview(imagePointFromPointer(event));
        renderAll();
        return;
      }
      if (state.selectedTool === "cross" && !state.drag) {
        updateCrossPreview(imagePointFromPointer(event));
        renderAll();
        return;
      }
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }
      const drag = state.drag;
      const point = imagePointFromPointer(event);
      if (!point && drag.kind !== "building_region_draw" && drag.kind !== "region_draw" && drag.kind !== "region_box_draw") {
        return;
      }
      if (drag.kind === "building_region_draw") {
        if (point) {
          drag.currentPoint = point;
          renderAll();
        }
        return;
      }
      if (drag.kind === "functional_zone_draw") {
        if (point) {
          drag.currentPoint = point;
          renderAll();
        }
        return;
      }
      if (drag.kind === "region_draw") {
        if (point) {
          drag.currentPoint = point;
          renderAll();
        }
        return;
      }
      if (drag.kind === "region_box_draw") {
        if (point) {
          drag.currentPoint = point;
          renderAll();
        }
        return;
      }
      if (!point) {
        return;
      }
      if (drag.kind === "centerline_vertex") {
        const centerline = state.annotation.centerlines.find((item) => item.id === drag.id);
        if (!centerline) {
          return;
        }
        if (!centerline.points[drag.vertexIndex]) {
          return;
        }
        centerline.points[drag.vertexIndex] = point;
      } else if (drag.kind === "building_region_translate") {
        const region = state.annotation.building_regions.find((item) => item.id === drag.id);
        if (!region) {
          return;
        }
        const deltaX = point.x - drag.lastPoint.x;
        const deltaY = point.y - drag.lastPoint.y;
        region.center_px = {
          x: region.center_px.x + deltaX,
          y: region.center_px.y + deltaY,
        };
        drag.lastPoint = point;
      } else if (drag.kind === "building_region_resize") {
        const region = state.annotation.building_regions.find((item) => item.id === drag.id);
        if (!region) {
          return;
        }
        const localPoint = buildingRegionLocalPoint(region, point);
        region.width_px = Math.max(BUILDING_REGION_MIN_SIZE_PX, Math.abs(localPoint.x) * 2.0);
        region.height_px = Math.max(BUILDING_REGION_MIN_SIZE_PX, Math.abs(localPoint.y) * 2.0);
      } else if (drag.kind === "building_region_rotate") {
        const region = state.annotation.building_regions.find((item) => item.id === drag.id);
        if (!region) {
          return;
        }
        const yawRad = Math.atan2(region.center_px.x - point.x, region.center_px.y - point.y);
        region.yaw_deg = normalizeAngleDeg((yawRad * 180) / Math.PI);
      } else if (drag.kind === "centerline_translate") {
        const centerline = state.annotation.centerlines.find((item) => item.id === drag.id);
        if (!centerline) {
          return;
        }
        const deltaX = point.x - drag.lastPoint.x;
        const deltaY = point.y - drag.lastPoint.y;
        centerline.points = centerline.points.map((vertex) => ({
          x: vertex.x + deltaX,
          y: vertex.y + deltaY,
        }));
        drag.lastPoint = point;
      } else {
        if (drag.markerKind === "junction") {
          const marker = state.annotation.junctions.find((item) => item.id === drag.id);
          if (marker) {
            marker.x = point.x;
            marker.y = point.y;
          }
        } else if (drag.markerKind === "roundabout") {
          const marker = state.annotation.roundabouts.find((item) => item.id === drag.id);
          if (marker) {
            marker.x = point.x;
            marker.y = point.y;
          }
        } else {
          const marker = state.annotation.control_points.find((item) => item.id === drag.id);
          if (marker) {
            marker.x = point.x;
            marker.y = point.y;
          }
        }
      }
      syncSelectionAfterMutation();
      clearGraphResult("Annotation changed. Road graph will refresh automatically.");
      renderAll();
    },
    { signal },
  );

  window.addEventListener(
    "pointerup",
    (event) => {
      if (state.viewportPan?.pointerId === event.pointerId) {
        state.viewportPan = null;
        renderViewportControls();
        event.preventDefault();
        return;
      }
      if (state.previewResize && state.previewResize.pointerId === event.pointerId) {
        const resized = state.previewResize.didResize;
        state.previewResize = null;
        if (resized) {
          setStatus(statusEl, "Updated cross-section boundary widths.", "success");
        }
        renderAll();
        return;
      }
      if (state.drag?.kind === "building_region_draw" && state.drag.pointerId === event.pointerId) {
        const { startPoint, currentPoint } = state.drag;
        const deltaX = Math.abs(currentPoint.x - startPoint.x);
        const deltaY = Math.abs(currentPoint.y - startPoint.y);
        if (Math.max(deltaX, deltaY) >= 6) {
          const id = nextFeatureId(state.annotation, "building_region");
          const region = buildBuildingRegionFromDraft(id, startPoint, currentPoint);
          state.annotation.building_regions.push(region);
          state.selection = { kind: "building_region", id };
          state.selectedStripId = null;
          clearFurniturePlacement();
          state.drag = null;
          markAnnotationChanged(`Added building region ${id}.`);
          renderAll();
          return;
        }
        state.drag = null;
        setStatus(statusEl, "Building region drag was too small. Drag to define an area.", "neutral");
        renderAll();
        return;
      }
      if (state.drag?.kind === "region_box_draw" && state.drag.pointerId === event.pointerId) {
        commitRegionDraft();
        return;
      }
      if (state.drag && state.drag.pointerId === event.pointerId) {
        if (state.drag.kind === "functional_zone_draw") {
          return;
        }
        if (state.drag.kind === "building_region_translate") {
          setStatus(statusEl, "Moved building region.", "success");
        } else if (state.drag.kind === "building_region_resize") {
          setStatus(statusEl, "Resized building region.", "success");
        } else if (state.drag.kind === "building_region_rotate") {
          setStatus(statusEl, "Updated building region orientation.", "success");
        }
        state.drag = null;
        syncSelectionAfterMutation();
        markAnnotationChanged();
        renderAll();
      }
    },
    { signal },
  );

  jsonFileInput.addEventListener(
    "change",
    async () => {
      const file = jsonFileInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        const annotation = normalizeAnnotation(JSON.parse(text));
        const fallbackImagePath = state.annotation.image_path;
        state.annotation = annotation;
        state.selectedScenarioId = "";
        clearAnnotationEditingState();
        await reconcileImportedAnnotationReferenceImage("Imported", fallbackImagePath);
        updateCleanAnnotationSnapshot();
        renderScenarioDesignOptions();
        workflow.setSourceDraft({
          kind: "annotation_json",
          imageDataUrl: uploadedImageDataUrl || undefined,
          fileName: file.name,
          geojson: null,
        });
        renderSourceWorkflow();
      } catch (error) {
        setStatus(statusEl, error instanceof Error ? error.message : "Failed to import annotation JSON.", "error");
      } finally {
        jsonFileInput.value = "";
      }
    },
    { signal },
  );

  applyJsonButton.addEventListener(
    "click",
    async () => {
      try {
        const annotation = normalizeAnnotation(JSON.parse(jsonTextarea.value));
        const fallbackImagePath = state.annotation.image_path;
        state.annotation = annotation;
        state.selectedScenarioId = "";
        clearAnnotationEditingState();
        await reconcileImportedAnnotationReferenceImage("Applied", fallbackImagePath);
        updateCleanAnnotationSnapshot();
        renderScenarioDesignOptions();
        workflow.setSourceDraft({
          kind: "annotation_json",
          imageDataUrl: uploadedImageDataUrl || undefined,
          fileName: state.annotation.image_path || "annotation.json",
          geojson: null,
        });
        renderSourceWorkflow();
      } catch (error) {
        setStatus(statusEl, error instanceof Error ? error.message : "Failed to apply annotation JSON.", "error");
      }
    },
    { signal },
  );

  downloadJsonButton.addEventListener(
    "click",
    () => {
      downloadText(`${state.annotation.plan_id || "reference_annotation"}.json`, stringifyAnnotation(state.annotation));
    },
    { signal },
  );

  copyJsonButton.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(stringifyAnnotation(state.annotation));
        setStatus(statusEl, "Annotation JSON copied to clipboard.", "success");
      } catch {
        jsonTextarea.select();
        document.execCommand("copy");
        setStatus(statusEl, "Annotation JSON selected. Press Ctrl/Cmd+C to copy.", "neutral");
      }
    },
    { signal },
  );

  for (const graphConfigInput of [segmentLengthInput, sidewalkWidthInput]) {
    graphConfigInput.addEventListener(
      "change",
      () => {
        clearGraphResult("Road graph settings changed.");
        renderAll();
      },
      { signal },
    );
  }

  convertGraphButton.addEventListener(
    "click",
    async () => {
      try {
        if (autoGraphTimer !== null) {
          window.clearTimeout(autoGraphTimer);
          autoGraphTimer = null;
        }
        await convertAnnotationToGraph();
      } catch (error) {
        setStatus(graphStatusEl, error instanceof Error ? error.message : "Failed to convert annotation.", "error");
      }
    },
    { signal },
  );

  downloadGraphButton.addEventListener(
    "click",
    () => {
      if (!state.graphResult) {
        return;
      }
      const annotationSnapshot = cloneAnnotation(state.annotation);
      const exportPayload: ConvertedGraphPayload = {
        ...state.graphResult,
        annotation: annotationSnapshot,
        summary: {
          ...state.graphResult.summary,
          building_region_count: annotationSnapshot.building_regions.length,
        },
      };
      downloadText(`${state.annotation.plan_id || "reference_annotation"}_graph.json`, JSON.stringify(exportPayload, null, 2));
    },
    { signal },
  );

  renderReferencePlanOptions(FALLBACK_REFERENCE_PLAN.plan_id);
  renderScenarioDesignOptions();
  const initialWorkflowSnapshot = workflow.getSnapshot();
  if (courseMode) {
    sourceGenerateButton.textContent = "批准完整标注并生成 3D 基线";
    sourceGenerateButton.title = "Persist this ReferenceAnnotation and start the course generation job.";
  }
  if (initialWorkflowSnapshot.normalized) {
    state.annotation = normalizeAnnotation(initialWorkflowSnapshot.normalized.referenceAnnotation);
    if (initialWorkflowSnapshot.normalized.graph) {
      state.graphResult = {
        annotation: cloneAnnotation(state.annotation),
        graph: initialWorkflowSnapshot.normalized.graph as ConvertedGraphPayload["graph"],
        summary: { ...initialWorkflowSnapshot.normalized.featureCounts },
      };
    }
    updateCleanAnnotationSnapshot();
    const retainedImage = initialWorkflowSnapshot.sourceImageDataUrl || state.annotation.image_path;
    if (retainedImage) {
      void loadImageFromUrl(retainedImage, {
        planId: state.annotation.plan_id,
        preserveFeatures: true,
        preserveCurrentOnError: true,
      }).catch((error) => {
        state.isReferenceImageLoading = false;
        setStatus(statusEl, statusTextFromImageLoadError(error, "sceneGraph.status.failedLoadReferencePlan", "Failed to restore the workflow reference image."), "error");
        renderAll();
      });
    } else {
      state.isReferenceImageLoading = false;
    }
  } else {
    void applyReferencePlan(FALLBACK_REFERENCE_PLAN.plan_id).catch((error) => {
      state.isReferenceImageLoading = false;
      renderAll();
      setStatus(
        statusEl,
        statusTextFromImageLoadError(
          error,
          "sceneGraph.status.failedLoadReferencePlan",
          `Failed to load default reference plan ${FALLBACK_REFERENCE_PLAN.plan_id}.`,
        ),
        "error",
      );
    });
  }
  renderAll();
  renderSourceWorkflow();
  mountCourseOsmBackground();
  if (!courseMode) {
    const capabilityToken = workflow.beginRequest("capabilities");
    void loadWorkflowCapabilities(capabilityToken.signal)
      .then((capabilities) => {
        if (!capabilityToken.isCurrent()) return;
        workflow.setCapabilities(capabilities);
        workflow.endRequest(capabilityToken);
        renderSourceWorkflow();
      })
      .catch((error) => {
        workflow.endRequest(capabilityToken, error);
        renderSourceWorkflow();
      });
    void loadScenarioDesigns({ silent: true });
    void loadReferencePlans({ silent: true }).catch((error) => {
      setStatus(
        statusEl,
        error instanceof Error && error.message !== "Failed to fetch"
          ? error.message
          : { key: "sceneGraph.status.failedRefreshReferencePlans", fallback: "Failed to refresh reference plans." },
        "error",
      );
    });
  }

  function refreshSceneGraphLanguage(): void {
    const language = loadViewerLanguage();
    applyViewerTranslations(root, language);
    renderAll();
    renderSourceWorkflow();
    renderInspector();
    applyViewerTranslations(root, language);
  }

  window.addEventListener(VIEWER_LANGUAGE_EVENT, refreshSceneGraphLanguage, { signal });
  return () => {
    if (autoGraphTimer !== null) {
      window.clearTimeout(autoGraphTimer);
      autoGraphTimer = null;
    }
    revokeCurrentObjectUrl();
    courseOsmMap?.remove();
    courseOsmMap = null;
    unsubscribeWorkflow();
    eventController.abort();
  };
}
