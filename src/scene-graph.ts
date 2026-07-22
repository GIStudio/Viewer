import "./styles/scene-graph.css";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";

import {
  DEFAULT_GUANGZHOU_OSM_VIEW,
  mountOsmAoiPicker,
  type OsmAoiPickerController,
  type OsmAoiSelection,
  type OsmMapView,
  type Wgs84Bbox as EditableWgs84Bbox,
} from "./osm-aoi-picker";
import {
  mountOsmRoadStudyPicker,
  type OsmRoadStudyPickerController,
} from "./osm-road-study-picker";
import { consumeProfessionalOsmPickerRequest } from "./professional-entry-intent";

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
  METAAURBAN_STRIP_ASSET_BADGES,
  METAAURBAN_STRIP_ZONE_LABELS,
  NOMINAL_STRIP_WIDTHS,
  SIDE_STRIP_KINDS,
  STANDALONE_CROSS_ARM_LENGTH_M,
  STRIP_DIRECTION_OPTIONS,
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
import { VIEWER_LANGUAGE_EVENT, applyViewerTranslations, formatViewerKey, loadViewerLanguage, translateViewerKey, translateViewerLiteral } from "./viewer-i18n";
import type { ScenarioDesign, ScenarioDesignCatalogPayload } from "./viewer-types";
import type { NormalizedSceneSource, WorkflowController } from "./workflow-controller";
import {
  cancelOsmAcquisitionJob,
  createOsmAcquisitionJob,
  extractSceneSource,
  loadOsmAcquisitionJob,
  loadWorkflowCapabilities,
  normalizeSceneSource,
  retryOsmAcquisitionJob,
  selectOsmRoadStudyArea,
  toNormalizedSceneSource,
} from "./workflow-api";
import type {
  NormalizedSceneSourceResponse,
  OsmAcquisitionJob,
  OsmRoadPreview,
  OsmRoadStudyResponse,
  SourceImageReference,
} from "./workflow-api";
import { createSgSourceWorkflowController } from "./sg-source-workflow-controller";
import { createSgAnnotationController } from "./sg-annotation-controller";
import { createSgRenderController } from "./sg-render-controller";
import { createSgReferenceController } from "./sg-reference-controller";
import { createSgMutationController } from "./sg-mutation-controller";
import { createSgMarkupBuilder } from "./sg-markup-builder";
import { createSgEventBinder } from "./sg-event-binder";
const { buildSelectOptions, stripDirectionMarkup, stripZoneSideLabel, normalizedConnectionPreviewPoints, buildCornerConnectionCardMarkup, buildStripCornerConnectionsMarkup, buildCrossSectionPreviewMarkup, buildSelectedStripEditorMarkup, buildFurnitureMarkup, buildInspectorMarkup, buildBuildingRegionDraftMarkup, regionPolygonPoints, regionCentroid, regionBoxPoints, regionRoleLabel, buildRegionDraftMarkup, buildFunctionalZoneDraftMarkup, buildBranchPreviewMarkup, buildCrossPreviewMarkup, previewSplitCenterlinePointsAtSnap, previewCenterlinesFromDrafts, buildOverlayMarkup } = createSgMarkupBuilder(() => ({ get NO_DIRECTION_STRIP_KINDS(): typeof NO_DIRECTION_STRIP_KINDS { return NO_DIRECTION_STRIP_KINDS; }, get buildMetaurbanAssetBadgeMarkup(): typeof buildMetaurbanAssetBadgeMarkup { return buildMetaurbanAssetBadgeMarkup; }, get crossSectionPreviewDisplayOrder(): typeof crossSectionPreviewDisplayOrder { return crossSectionPreviewDisplayOrder; }, get escapeHtml(): typeof escapeHtml { return escapeHtml; }, get getReferenceWidthMeters(): typeof getReferenceWidthMeters { return getReferenceWidthMeters; }, get inspectorFormat(): typeof inspectorFormat { return inspectorFormat; }, get inspectorText(): typeof inspectorText { return inspectorText; }, get localizedMetaurbanStripZoneLabel(): typeof localizedMetaurbanStripZoneLabel { return localizedMetaurbanStripZoneLabel; }, get localizedStripKindLabels(): typeof localizedStripKindLabels { return localizedStripKindLabels; }, get localizedStripLabel(): typeof localizedStripLabel { return localizedStripLabel; }, get localizedStripSideLabel(): typeof localizedStripSideLabel { return localizedStripSideLabel; }, get localizedStripUsage(): typeof localizedStripUsage { return localizedStripUsage; }, get nominalSeedCrossSectionWidth(): typeof nominalSeedCrossSectionWidth { return nominalSeedCrossSectionWidth; }, get previewCrossSection(): typeof previewCrossSection { return previewCrossSection; }, get stripDirectionChip(): typeof stripDirectionChip { return stripDirectionChip; }, get stripPreviewFillColor(): typeof stripPreviewFillColor { return stripPreviewFillColor; } }));


const DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE = "Loading default reference plan...";
const ANNOTATION_MIN_ZOOM = 0.25;
const ANNOTATION_MAX_ZOOM = 6;
const ANNOTATION_ZOOM_STEP = 1.25;
const PROFESSIONAL_OSM_VIEW_KEY = "roadgen3d:professional-osm-view-v1";
const PROFESSIONAL_OSM_JOB_KEY = "roadgen3d:professional-osm-job-v1";
const OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX = 1024;

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

const STRIP_KIND_I18N_KEYS: Record<StripKind, string> = {
  drive_lane: "sceneGraph.strip.driveLane",
  bus_lane: "sceneGraph.strip.busLane",
  bike_lane: "sceneGraph.strip.bikeLane",
  parking_lane: "sceneGraph.strip.parkingLane",
  median: "sceneGraph.strip.median",
  nearroad_buffer: "sceneGraph.strip.nearRoadBuffer",
  nearroad_furnishing: "sceneGraph.strip.nearRoadFurnishing",
  clear_sidewalk: "sceneGraph.strip.clearSidewalk",
  farfromroad_buffer: "sceneGraph.strip.farFromRoadBuffer",
  frontage_reserve: "sceneGraph.strip.frontageReserve",
  grass_belt: "sceneGraph.strip.centralGreenBelt",
  shared_street_surface: "sceneGraph.strip.sharedStreetSurface",
  colored_pavement: "sceneGraph.strip.coloredPavement",
};

const METAAURBAN_ZONE_I18N_KEYS: Record<StripKind, string> = {
  drive_lane: "sceneGraph.metaurbanZone.carriageway",
  bus_lane: "sceneGraph.metaurbanZone.carriageway",
  bike_lane: "sceneGraph.metaurbanZone.carriagewayEdge",
  parking_lane: "sceneGraph.metaurbanZone.carriagewayEdge",
  median: "sceneGraph.metaurbanZone.median",
  nearroad_buffer: "sceneGraph.metaurbanZone.nearRoadBuffer",
  nearroad_furnishing: "sceneGraph.metaurbanZone.nearRoadFurnishing",
  clear_sidewalk: "sceneGraph.metaurbanZone.mainSidewalk",
  farfromroad_buffer: "sceneGraph.metaurbanZone.farFromRoadBuffer",
  frontage_reserve: "sceneGraph.metaurbanZone.validRegion",
  grass_belt: "sceneGraph.metaurbanZone.median",
  shared_street_surface: "sceneGraph.metaurbanZone.mixedUse",
  colored_pavement: "sceneGraph.metaurbanZone.decorativeSurface",
};

const STRIP_USAGE_I18N_KEYS: Record<StripKind, string> = {
  drive_lane: "sceneGraph.guidance.driveLane",
  bus_lane: "sceneGraph.guidance.busLane",
  bike_lane: "sceneGraph.guidance.bikeLane",
  parking_lane: "sceneGraph.guidance.parkingLane",
  median: "sceneGraph.guidance.median",
  nearroad_buffer: "sceneGraph.guidance.nearroadBuffer",
  nearroad_furnishing: "sceneGraph.guidance.nearroadFurnishing",
  clear_sidewalk: "sceneGraph.guidance.clearSidewalk",
  farfromroad_buffer: "sceneGraph.guidance.farBuffer",
  frontage_reserve: "sceneGraph.guidance.frontageReserve",
  grass_belt: "sceneGraph.guidance.grassBelt",
  shared_street_surface: "sceneGraph.guidance.sharedSurface",
  colored_pavement: "sceneGraph.guidance.coloredPavement",
};

function inspectorText(key: string, fallback: string): string {
  return translateViewerKey(loadViewerLanguage(), key) ?? fallback;
}

function inspectorFormat(key: string, fallback: string, params: Record<string, string | number>): string {
  return formatViewerKey(loadViewerLanguage(), key, params) ?? fallback;
}

function localizedStripLabel(kind: StripKind): string {
  return inspectorText(STRIP_KIND_I18N_KEYS[kind], metaurbanStripLabel(kind));
}

function localizedMetaurbanStripZoneLabel(kind: StripKind): string {
  return inspectorText(METAAURBAN_ZONE_I18N_KEYS[kind], metaurbanStripZoneLabel(kind));
}

function localizedStripUsage(kind: StripKind): string {
  return inspectorText(STRIP_USAGE_I18N_KEYS[kind], localizedStripLabel(kind));
}

function localizedStripSideLabel(zone: StripZone): string {
  if (zone === "left") return inspectorText("sceneGraph.inspector.leftSide", "Left side");
  if (zone === "right") return inspectorText("sceneGraph.inspector.rightSide", "Right side");
  return inspectorText("sceneGraph.inspector.center", "Center");
}

function localizedStripKindLabels(): Record<StripKind, string> {
  return Object.fromEntries(
    (Object.keys(STRIP_KIND_I18N_KEYS) as StripKind[]).map((kind) => [kind, localizedStripLabel(kind)]),
  ) as Record<StripKind, string>;
}

function metaurbanAssetBadges(kind: StripKind): MetaurbanAssetBadge[] {
  return METAAURBAN_STRIP_ASSET_BADGES[kind] || [];
}

function stripDirectionChip(strip: AnnotatedCrossSectionStrip): string {
  if (strip.direction === "forward") {
    return inspectorText("sceneGraph.inspector.forward", "Forward");
  }
  if (strip.direction === "reverse") {
    return inspectorText("sceneGraph.inspector.reverse", "Reverse");
  }
  if (strip.direction === "bidirectional") {
    return inspectorText("sceneGraph.inspector.bidirectional", "Bidirectional");
  }
  return inspectorText("sceneGraph.inspector.static", "Static");
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
          (badge) => {
            const key = `sceneGraph.asset.${badge.key}`;
            const label = inspectorText(key, badge.label);
            const shortLabel = loadViewerLanguage() === "zh" ? label : badge.shortLabel;
            return `
            <span class="annotation-metaurban-badge" data-asset-key="${escapeHtml(badge.key)}" title="${escapeHtml(label)}">
              ${escapeHtml(shortLabel)}
            </span>
          `;
          },
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
    source_refs: record.source_refs && typeof record.source_refs === "object"
      ? structuredClone(record.source_refs as Record<string, unknown>)
      : { kind: "manual", edit_state: "manual" },
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
      const unreadBadge = document.getElementById("desktop-shell-status-unread-badge");
      if (unreadBadge) {
        const previous = Number.parseInt(unreadBadge.textContent ?? "0", 10);
        const next = Number.isFinite(previous) ? Math.min(99, previous + 1) : 1;
        unreadBadge.hidden = false;
        unreadBadge.textContent = next > 9 ? "9+" : String(next);
      }
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

const NO_DIRECTION_STRIP_KINDS = new Set<StripKind>(["median", "grass_belt", "shared_street_surface", "colored_pavement"]);

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  showAdvancedSourceTools?: boolean;
  onApproveAndGenerate?: (annotation: ReferenceAnnotation) => Promise<void>;
  onNavigateProfessionalScene?: (target: "generate" | "browse") => Promise<void>;
};

export function mountSceneGraphPage(
  shell: DesktopShell,
  workflow: WorkflowController,

 hostOptions: SceneGraphHostOptions = {},
): () => void {
  const { bindSceneGraphEvents } = createSgEventBinder(() => ({ get ANNOTATION_ZOOM_STEP(): typeof ANNOTATION_ZOOM_STEP { return ANNOTATION_ZOOM_STEP; }, get applyJsonButton(): typeof applyJsonButton { return applyJsonButton; }, get applyReferencePlan(): typeof applyReferencePlan { return applyReferencePlan; }, get applyScenarioDesignAnnotation(): typeof applyScenarioDesignAnnotation { return applyScenarioDesignAnnotation; }, get autoGraphTimer(): typeof autoGraphTimer { return autoGraphTimer; }, get autoSplitRegionsButton(): typeof autoSplitRegionsButton { return autoSplitRegionsButton; }, get beginBranchFromSnap(): typeof beginBranchFromSnap { return beginBranchFromSnap; }, get beginCrossFromSnap(): typeof beginCrossFromSnap { return beginCrossFromSnap; }, get beginViewportPan(): typeof beginViewportPan { return beginViewportPan; }, get buildScenePackage(): typeof buildScenePackage { return buildScenePackage; }, get clearAnnotationEditingState(): typeof clearAnnotationEditingState { return clearAnnotationEditingState; }, get clearBranchDraft(): typeof clearBranchDraft { return clearBranchDraft; }, get clearCrossDraft(): typeof clearCrossDraft { return clearCrossDraft; }, get clearFurniturePlacement(): typeof clearFurniturePlacement { return clearFurniturePlacement; }, get clearGraphResult(): typeof clearGraphResult { return clearGraphResult; }, get cloneAnnotation(): typeof cloneAnnotation { return cloneAnnotation; }, get closeGenerationConfiguration(): typeof closeGenerationConfiguration { return closeGenerationConfiguration; }, get commitBranchAtPoint(): typeof commitBranchAtPoint { return commitBranchAtPoint; }, get commitCrossAtPoint(): typeof commitCrossAtPoint { return commitCrossAtPoint; }, get commitFunctionalZoneDraft(): typeof commitFunctionalZoneDraft { return commitFunctionalZoneDraft; }, get commitRegionDraft(): typeof commitRegionDraft { return commitRegionDraft; }, get convertAnnotationToGraph(): typeof convertAnnotationToGraph { return convertAnnotationToGraph; }, get convertGraphButton(): typeof convertGraphButton { return convertGraphButton; }, get copyJsonButton(): typeof copyJsonButton { return copyJsonButton; }, get courseMode(): typeof courseMode { return courseMode; }, get createStandaloneCrossAtPoint(): typeof createStandaloneCrossAtPoint { return createStandaloneCrossAtPoint; }, get createSurfaceAnnotationAtPoint(): typeof createSurfaceAnnotationAtPoint { return createSurfaceAnnotationAtPoint; }, get deleteSelectedButton(): typeof deleteSelectedButton { return deleteSelectedButton; }, get deleteSelection(): typeof deleteSelection { return deleteSelection; }, get deriveBuildingRegions(): typeof deriveBuildingRegions { return deriveBuildingRegions; }, get downloadGraphButton(): typeof downloadGraphButton { return downloadGraphButton; }, get downloadJsonButton(): typeof downloadJsonButton { return downloadJsonButton; }, get downloadText(): typeof downloadText { return downloadText; }, get ensureCompatibleFurnitureStripsForCurrentAnnotation(): typeof ensureCompatibleFurnitureStripsForCurrentAnnotation { return ensureCompatibleFurnitureStripsForCurrentAnnotation; }, get extractCurrentReferenceImage(): typeof extractCurrentReferenceImage { return extractCurrentReferenceImage; }, get finalizeDraftCenterline(): typeof finalizeDraftCenterline { return finalizeDraftCenterline; }, get finishCenterlineButton(): typeof finishCenterlineButton { return finishCenterlineButton; }, get generateApprovedScene(): typeof generateApprovedScene { return generateApprovedScene; }, get generationConfirmCancelButton(): typeof generationConfirmCancelButton { return generationConfirmCancelButton; }, get generationConfirmDialog(): typeof generationConfirmDialog { return generationConfirmDialog; }, get generationConfirmOpenButton(): typeof generationConfirmOpenButton { return generationConfirmOpenButton; }, get graphStatusEl(): typeof graphStatusEl { return graphStatusEl; }, get hasAnnotationCanvas(): typeof hasAnnotationCanvas { return hasAnnotationCanvas; }, get imageInput(): typeof imageInput { return imageInput; }, get imagePointFromPointer(): typeof imagePointFromPointer { return imagePointFromPointer; }, get imageResetButton(): typeof imageResetButton { return imageResetButton; }, get isAnnotationDirty(): typeof isAnnotationDirty { return isAnnotationDirty; }, get isEditableKeyboardTarget(): typeof isEditableKeyboardTarget { return isEditableKeyboardTarget; }, get jsonFileInput(): typeof jsonFileInput { return jsonFileInput; }, get jsonTextarea(): typeof jsonTextarea { return jsonTextarea; }, get loadImageFromUrl(): typeof loadImageFromUrl { return loadImageFromUrl; }, get markAnnotationChanged(): typeof markAnnotationChanged { return markAnnotationChanged; }, get markCenterlineOverlayEdited(): typeof markCenterlineOverlayEdited { return markCenterlineOverlayEdited; }, get mountProfessionalAoiPicker(): typeof mountProfessionalAoiPicker { return mountProfessionalAoiPicker; }, get normalizeAngleDeg(): typeof normalizeAngleDeg { return normalizeAngleDeg; }, get normalizeAnnotation(): typeof normalizeAnnotation { return normalizeAnnotation; }, get normalizeCurrentSceneSource(): typeof normalizeCurrentSceneSource { return normalizeCurrentSceneSource; }, get normalizedOsmBboxFromWorkflow(): typeof normalizedOsmBboxFromWorkflow { return normalizedOsmBboxFromWorkflow; }, get openExistingProfessionalScene(): typeof openExistingProfessionalScene { return openExistingProfessionalScene; }, get openGenerationConfiguration(): typeof openGenerationConfiguration { return openGenerationConfiguration; }, get originalImageEl(): typeof originalImageEl { return originalImageEl; }, get originalOpacityInput(): typeof originalOpacityInput { return originalOpacityInput; }, get overlayHostEl(): typeof overlayHostEl { return overlayHostEl; }, get overlayOpacityInput(): typeof overlayOpacityInput { return overlayOpacityInput; }, get pendingOsmNormalization(): typeof pendingOsmNormalization { return pendingOsmNormalization; }, get pixelsPerMeterInput(): typeof pixelsPerMeterInput { return pixelsPerMeterInput; }, get placeFurnitureAtPoint(): typeof placeFurnitureAtPoint { return placeFurnitureAtPoint; }, get placeFurnitureQuick(): typeof placeFurnitureQuick { return placeFurnitureQuick; }, get planSelect(): typeof planSelect { return planSelect; }, get professionalOsmSelection(): typeof professionalOsmSelection { return professionalOsmSelection; }, get readImageFileDataUrl(): typeof readImageFileDataUrl { return readImageFileDataUrl; }, get reconcileImportedAnnotationReferenceImage(): typeof reconcileImportedAnnotationReferenceImage { return reconcileImportedAnnotationReferenceImage; }, get remountAnnotationOsmBackground(): typeof remountAnnotationOsmBackground { return remountAnnotationOsmBackground; }, get renderAll(): typeof renderAll { return renderAll; }, get renderOverlay(): typeof renderOverlay { return renderOverlay; }, get renderReferencePlanOptions(): typeof renderReferencePlanOptions { return renderReferencePlanOptions; }, get renderScenarioDesignOptions(): typeof renderScenarioDesignOptions { return renderScenarioDesignOptions; }, get renderSourceWorkflow(): typeof renderSourceWorkflow { return renderSourceWorkflow; }, get renderViewportControls(): typeof renderViewportControls { return renderViewportControls; }, get resetAnnotation(): typeof resetAnnotation { return resetAnnotation; }, get resetAnnotationButton(): typeof resetAnnotationButton { return resetAnnotationButton; }, get resetViewport(): typeof resetViewport { return resetViewport; }, get restoreScenePackage(): typeof restoreScenePackage { return restoreScenePackage; }, get revokeCurrentObjectUrl(): typeof revokeCurrentObjectUrl { return revokeCurrentObjectUrl; }, get root(): typeof root { return root; }, get roundaboutRadiusInput(): typeof roundaboutRadiusInput { return roundaboutRadiusInput; }, get scenarioDesignSelects(): typeof scenarioDesignSelects { return scenarioDesignSelects; }, get segmentLengthInput(): typeof segmentLengthInput { return segmentLengthInput; }, get selectAllRoadsButton(): typeof selectAllRoadsButton { return selectAllRoadsButton; }, get setStatus(): typeof setStatus { return setStatus; }, get setTool(): typeof setTool { return setTool; }, get setViewportScale(): typeof setViewportScale { return setViewportScale; }, get shell(): typeof shell { return shell; }, get showAnnotationLabelsInput(): typeof showAnnotationLabelsInput { return showAnnotationLabelsInput; }, get showJunctionBoundariesInput(): typeof showJunctionBoundariesInput { return showJunctionBoundariesInput; }, get showJunctionConnectorsInput(): typeof showJunctionConnectorsInput { return showJunctionConnectorsInput; }, get showJunctionCoreInput(): typeof showJunctionCoreInput { return showJunctionCoreInput; }, get showJunctionCrosswalksInput(): typeof showJunctionCrosswalksInput { return showJunctionCrosswalksInput; }, get showJunctionDebugInput(): typeof showJunctionDebugInput { return showJunctionDebugInput; }, get showJunctionLabelsInput(): typeof showJunctionLabelsInput { return showJunctionLabelsInput; }, get showJunctionOutlinesInput(): typeof showJunctionOutlinesInput { return showJunctionOutlinesInput; }, get showOriginalInput(): typeof showOriginalInput { return showOriginalInput; }, get showOsmLabelsInput(): typeof showOsmLabelsInput { return showOsmLabelsInput; }, get showOverlayInput(): typeof showOverlayInput { return showOverlayInput; }, get sidewalkWidthInput(): typeof sidewalkWidthInput { return sidewalkWidthInput; }, get signal(): typeof signal { return signal; }, get snapToRoadInput(): typeof snapToRoadInput { return snapToRoadInput; }, get sourceAiExtractButton(): typeof sourceAiExtractButton { return sourceAiExtractButton; }, get sourceBackButton(): typeof sourceBackButton { return sourceBackButton; }, get sourceGenerateButton(): typeof sourceGenerateButton { return sourceGenerateButton; }, get sourceGeojsonInput(): typeof sourceGeojsonInput { return sourceGeojsonInput; }, get sourceImageImportButton(): typeof sourceImageImportButton { return sourceImageImportButton; }, get sourceNormalizeButton(): typeof sourceNormalizeButton { return sourceNormalizeButton; }, get sourceOpenAnnotationToolsButton(): typeof sourceOpenAnnotationToolsButton { return sourceOpenAnnotationToolsButton; }, get sourceOpenExistingButton(): typeof sourceOpenExistingButton { return sourceOpenExistingButton; }, get sourceStatusEl(): typeof sourceStatusEl { return sourceStatusEl; }, get stageEl(): typeof stageEl { return stageEl; }, get state(): typeof state { return state; }, get statusEl(): typeof statusEl { return statusEl; }, get statusTextFromImageLoadError(): typeof statusTextFromImageLoadError { return statusTextFromImageLoadError; }, get syncSelectionAfterMutation(): typeof syncSelectionAfterMutation { return syncSelectionAfterMutation; }, get syncViewportLayout(): typeof syncViewportLayout { return syncViewportLayout; }, get toolButtons(): typeof toolButtons { return toolButtons; }, get undoPointButton(): typeof undoPointButton { return undoPointButton; }, get updateBranchPreview(): typeof updateBranchPreview { return updateBranchPreview; }, get updateCleanAnnotationSnapshot(): typeof updateCleanAnnotationSnapshot { return updateCleanAnnotationSnapshot; }, get updateCrossPreview(): typeof updateCrossPreview { return updateCrossPreview; }, get updateOsmPickerVisibility(): typeof updateOsmPickerVisibility { return updateOsmPickerVisibility; }, get updateStageVisibility(): typeof updateStageVisibility { return updateStageVisibility; }, get uploadedImageDataUrl(): typeof uploadedImageDataUrl { return uploadedImageDataUrl; }, get workflow(): typeof workflow { return workflow; }, get zoomFitButton(): typeof zoomFitButton { return zoomFitButton; }, get zoomInButton(): typeof zoomInButton { return zoomInButton; }, get zoomOutButton(): typeof zoomOutButton { return zoomOutButton; } }));
  const { finalizeDraftCenterline, createStandaloneCrossAtPoint, resetAnnotation, deleteSelection, convertAnnotationToGraph, syncSelectionAfterMutation, nextFurnitureInstanceId, inferSurfaceKindFromStrip, createSurfaceAnnotationAtPoint, createArmFromProfile, osmProfileForPoints, ensureExplicitJunctionAtSnap, maybeConnectArmEndpointToSnap, updateBranchPreview, updateCrossPreview, beginBranchFromSnap, beginCrossFromSnap, commitBranchAtPoint, commitCrossAtPoint, placeFurnitureAtPoint, pointInPolygon, placeFurnitureQuick } = createSgMutationController(() => ({ get autoGraphPending(): typeof autoGraphPending { return autoGraphPending; }, get centerlineLengthM(): typeof centerlineLengthM { return centerlineLengthM; }, get clearAnnotationEditingState(): typeof clearAnnotationEditingState { return clearAnnotationEditingState; }, get clearBranchDraft(): typeof clearBranchDraft { return clearBranchDraft; }, get clearCrossDraft(): typeof clearCrossDraft { return clearCrossDraft; }, get clearFurniturePlacement(): typeof clearFurniturePlacement { return clearFurniturePlacement; }, get clearGraphResult(): typeof clearGraphResult { return clearGraphResult; }, get cloneAnnotation(): typeof cloneAnnotation { return cloneAnnotation; }, get comparableAnnotationSnapshot(): typeof comparableAnnotationSnapshot { return comparableAnnotationSnapshot; }, get graphStatusEl(): typeof graphStatusEl { return graphStatusEl; }, get markAnnotationChanged(): typeof markAnnotationChanged { return markAnnotationChanged; }, get markCenterlineOverlayEdited(): typeof markCenterlineOverlayEdited { return markCenterlineOverlayEdited; }, get renderAll(): typeof renderAll { return renderAll; }, get renderScenarioDesignOptions(): typeof renderScenarioDesignOptions { return renderScenarioDesignOptions; }, get resolveCompatibleFurnitureStripForRoad(): typeof resolveCompatibleFurnitureStripForRoad { return resolveCompatibleFurnitureStripForRoad; }, get revealJunctionSurfaceLayers(): typeof revealJunctionSurfaceLayers { return revealJunctionSurfaceLayers; }, get segmentLengthInput(): typeof segmentLengthInput { return segmentLengthInput; }, get setStatus(): typeof setStatus { return setStatus; }, get sidewalkWidthInput(): typeof sidewalkWidthInput { return sidewalkWidthInput; }, get state(): typeof state { return state; }, get statusEl(): typeof statusEl { return statusEl; } }));

  const { setTool, imagePointFromPointer, loadImageFromUrl, currentReferenceImagePathForAnnotation, bindAnnotationToCurrentReferenceImage, reconcileImportedAnnotationReferenceImage, applyReferencePlan, loadReferencePlans, loadScenarioDesigns, clearAnnotationEditingState, applyScenarioAnnotationPayload, applyScenarioDraftAnnotation, applyScenarioDesignAnnotation } = createSgReferenceController(() => ({ get annotationCanvasDimensions(): typeof annotationCanvasDimensions { return annotationCanvasDimensions; }, get clearBranchDraft(): typeof clearBranchDraft { return clearBranchDraft; }, get clearCrossDraft(): typeof clearCrossDraft { return clearCrossDraft; }, get clearFurniturePlacement(): typeof clearFurniturePlacement { return clearFurniturePlacement; }, get clearGraphResult(): typeof clearGraphResult { return clearGraphResult; }, get courseMode(): typeof courseMode { return courseMode; }, get deriveBuildingRegions(): typeof deriveBuildingRegions { return deriveBuildingRegions; }, get hasAnnotationCanvas(): typeof hasAnnotationCanvas { return hasAnnotationCanvas; }, get mergeReferencePlans(): typeof mergeReferencePlans { return mergeReferencePlans; }, get normalizeAnnotation(): typeof normalizeAnnotation { return normalizeAnnotation; }, get originalImageEl(): typeof originalImageEl { return originalImageEl; }, get overlayHostEl(): typeof overlayHostEl { return overlayHostEl; }, get pendingOsmNormalization(): typeof pendingOsmNormalization { return pendingOsmNormalization; }, get professionalOsmStage(): typeof professionalOsmStage { return professionalOsmStage; }, get readApiErrorDetail(): typeof readApiErrorDetail { return readApiErrorDetail; }, get renderAll(): typeof renderAll { return renderAll; }, get renderReferencePlanOptions(): typeof renderReferencePlanOptions { return renderReferencePlanOptions; }, get renderScenarioDesignOptions(): typeof renderScenarioDesignOptions { return renderScenarioDesignOptions; }, get renderSourceWorkflow(): typeof renderSourceWorkflow { return renderSourceWorkflow; }, get resetViewport(): typeof resetViewport { return resetViewport; }, get resolveApiUrl(): typeof resolveApiUrl { return resolveApiUrl; }, get setStatus(): typeof setStatus { return setStatus; }, get signal(): typeof signal { return signal; }, get state(): typeof state { return state; }, get statusEl(): typeof statusEl { return statusEl; }, get updateCleanAnnotationSnapshot(): typeof updateCleanAnnotationSnapshot { return updateCleanAnnotationSnapshot; }, get updateOsmPickerVisibility(): typeof updateOsmPickerVisibility { return updateOsmPickerVisibility; }, get uploadedImageDataUrl(): typeof uploadedImageDataUrl { return uploadedImageDataUrl; }, get workflow(): typeof workflow { return workflow; } }));

  const { renderInspector, renderOverlay, renderAll } = createSgRenderController(() => ({ get annotationCanvasDimensions(): typeof annotationCanvasDimensions { return annotationCanvasDimensions; }, get autoGraphInFlight(): typeof autoGraphInFlight { return autoGraphInFlight; }, get buildInspectorMarkup(): typeof buildInspectorMarkup { return buildInspectorMarkup; }, get buildOverlayMarkup(): typeof buildOverlayMarkup { return buildOverlayMarkup; }, get canConvertGraph(): typeof canConvertGraph { return canConvertGraph; }, get centerlineLengthM(): typeof centerlineLengthM { return centerlineLengthM; }, get clearFurniturePlacement(): typeof clearFurniturePlacement { return clearFurniturePlacement; }, get convertGraphButton(): typeof convertGraphButton { return convertGraphButton; }, get deleteSelectedButton(): typeof deleteSelectedButton { return deleteSelectedButton; }, get downloadGraphButton(): typeof downloadGraphButton { return downloadGraphButton; }, get featureTableEl(): typeof featureTableEl { return featureTableEl; }, get finishCenterlineButton(): typeof finishCenterlineButton { return finishCenterlineButton; }, get graphSummaryEl(): typeof graphSummaryEl { return graphSummaryEl; }, get graphTextarea(): typeof graphTextarea { return graphTextarea; }, get hasAnnotationCanvas(): typeof hasAnnotationCanvas { return hasAnnotationCanvas; }, get imageMetaEl(): typeof imageMetaEl { return imageMetaEl; }, get imageResetButton(): typeof imageResetButton { return imageResetButton; }, get inspectorEl(): typeof inspectorEl { return inspectorEl; }, get isRegionRole(): typeof isRegionRole { return isRegionRole; }, get markAnnotationChanged(): typeof markAnnotationChanged { return markAnnotationChanged; }, get markCenterlineOverlayEdited(): typeof markCenterlineOverlayEdited { return markCenterlineOverlayEdited; }, get nextStripId(): typeof nextStripId { return nextStripId; }, get nominalSeedCrossSectionWidth(): typeof nominalSeedCrossSectionWidth { return nominalSeedCrossSectionWidth; }, get normalizeAngleDeg(): typeof normalizeAngleDeg { return normalizeAngleDeg; }, get normalizePoint(): typeof normalizePoint { return normalizePoint; }, get originalOpacityLabel(): typeof originalOpacityLabel { return originalOpacityLabel; }, get osmReferenceNote(): typeof osmReferenceNote { return osmReferenceNote; }, get overlayHostEl(): typeof overlayHostEl { return overlayHostEl; }, get pixelsPerMeterInput(): typeof pixelsPerMeterInput { return pixelsPerMeterInput; }, get referencePlanControl(): typeof referencePlanControl { return referencePlanControl; }, get renderToolButtons(): typeof renderToolButtons { return renderToolButtons; }, get root(): typeof root { return root; }, get roundaboutRadiusInput(): typeof roundaboutRadiusInput { return roundaboutRadiusInput; }, get selectAllRoadsButton(): typeof selectAllRoadsButton { return selectAllRoadsButton; }, get selectedCenterline(): typeof selectedCenterline { return selectedCenterline; }, get selectedStrip(): typeof selectedStrip { return selectedStrip; }, get setStatus(): typeof setStatus { return setStatus; }, get showAnnotationLabelsInput(): typeof showAnnotationLabelsInput { return showAnnotationLabelsInput; }, get showJunctionBoundariesInput(): typeof showJunctionBoundariesInput { return showJunctionBoundariesInput; }, get showJunctionConnectorsInput(): typeof showJunctionConnectorsInput { return showJunctionConnectorsInput; }, get showJunctionCoreInput(): typeof showJunctionCoreInput { return showJunctionCoreInput; }, get showJunctionCrosswalksInput(): typeof showJunctionCrosswalksInput { return showJunctionCrosswalksInput; }, get showJunctionDebugInput(): typeof showJunctionDebugInput { return showJunctionDebugInput; }, get showJunctionLabelsInput(): typeof showJunctionLabelsInput { return showJunctionLabelsInput; }, get showJunctionOutlinesInput(): typeof showJunctionOutlinesInput { return showJunctionOutlinesInput; }, get showOriginalInput(): typeof showOriginalInput { return showOriginalInput; }, get showOsmLabelsInput(): typeof showOsmLabelsInput { return showOsmLabelsInput; }, get showOverlayInput(): typeof showOverlayInput { return showOverlayInput; }, get signal(): typeof signal { return signal; }, get state(): typeof state { return state; }, get statusEl(): typeof statusEl { return statusEl; }, get summaryGridEl(): typeof summaryGridEl { return summaryGridEl; }, get syncJsonTextarea(): typeof syncJsonTextarea { return syncJsonTextarea; }, get undoPointButton(): typeof undoPointButton { return undoPointButton; }, get updateStageVisibility(): typeof updateStageVisibility { return updateStageVisibility; }, get workflow(): typeof workflow { return workflow; } }));

  const { comparableAnnotationSnapshot, updateCleanAnnotationSnapshot, isAnnotationDirty, canConvertGraph, featureCountsForAnnotation, normalizedSourceForAnnotation, isPlainRecord, buildScenePackage, restoreScenePackage, markProfessionalAnnotationDirty, markCenterlineOverlayEdited, scheduleAutoGraphConversion, runAutoGraphConversion, deriveBuildingRegions, clearGraphResult, selectedCenterline, selectedStrip, clearFurniturePlacement, clearBranchDraft, clearCrossDraft, commitFunctionalZoneDraft, commitRegionDraft, markAnnotationChanged, revealJunctionSurfaceLayers, revokeCurrentObjectUrl, hasAnnotationCanvas, annotationCanvasDimensions, annotationOsmBbox, osmNativeFeatureCollection, mountAnnotationOsmBackground, remountAnnotationOsmBackground, updateOsmPickerVisibility, syncViewportLayout, renderViewportControls, setViewportScale, resetViewport, isEditableKeyboardTarget, beginViewportPan, isOsmDerivedCenterline, resolveCompatibleFurnitureStripForRoad, ensureCompatibleFurnitureStripsForCurrentAnnotation, updateStageVisibility, syncJsonTextarea, renderToolButtons, mergeReferencePlans, renderReferencePlanOptions, scenarioDesignSelects, renderScenarioDesignOptions } = createSgAnnotationController(() => ({ get ANNOTATION_MAX_ZOOM(): typeof ANNOTATION_MAX_ZOOM { return ANNOTATION_MAX_ZOOM; }, get ANNOTATION_MIN_ZOOM(): typeof ANNOTATION_MIN_ZOOM { return ANNOTATION_MIN_ZOOM; }, get DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE(): typeof DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE { return DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE; }, get OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX(): typeof OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX { return OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX; }, get annotationOsmMap(): typeof annotationOsmMap { return annotationOsmMap; }, get autoGraphInFlight(): typeof autoGraphInFlight { return autoGraphInFlight; }, get autoGraphPending(): typeof autoGraphPending { return autoGraphPending; }, get autoGraphTimer(): typeof autoGraphTimer { return autoGraphTimer; }, get autoSplitRegionsButton(): typeof autoSplitRegionsButton { return autoSplitRegionsButton; }, get boardEl(): typeof boardEl { return boardEl; }, get cleanAnnotationSnapshot(): typeof cleanAnnotationSnapshot { return cleanAnnotationSnapshot; }, get cloneAnnotation(): typeof cloneAnnotation { return cloneAnnotation; }, get convertAnnotationToGraph(): typeof convertAnnotationToGraph { return convertAnnotationToGraph; }, get courseMode(): typeof courseMode { return courseMode; }, get escapeHtml(): typeof escapeHtml { return escapeHtml; }, get graphStatusEl(): typeof graphStatusEl { return graphStatusEl; }, get graphSummaryEl(): typeof graphSummaryEl { return graphSummaryEl; }, get graphTextarea(): typeof graphTextarea { return graphTextarea; }, get jsonTextarea(): typeof jsonTextarea { return jsonTextarea; }, get normalizeRegion(): typeof normalizeRegion { return normalizeRegion; }, get normalizedOsmBboxFromWorkflow(): typeof normalizedOsmBboxFromWorkflow { return normalizedOsmBboxFromWorkflow; }, get originalImageEl(): typeof originalImageEl { return originalImageEl; }, get osmMapHostEl(): typeof osmMapHostEl { return osmMapHostEl; }, get osmPicker(): typeof osmPicker { return osmPicker; }, get osmPickerHostEl(): typeof osmPickerHostEl { return osmPickerHostEl; }, get osmRoadStudyPicker(): typeof osmRoadStudyPicker { return osmRoadStudyPicker; }, get overlayHostEl(): typeof overlayHostEl { return overlayHostEl; }, get pendingOsmNormalization(): typeof pendingOsmNormalization { return pendingOsmNormalization; }, get planSelect(): typeof planSelect { return planSelect; }, get professionalOsmStage(): typeof professionalOsmStage { return professionalOsmStage; }, get readApiErrorDetail(): typeof readApiErrorDetail { return readApiErrorDetail; }, get regionBoxPoints(): typeof regionBoxPoints { return regionBoxPoints; }, get regionRoleLabel(): typeof regionRoleLabel { return regionRoleLabel; }, get renderAll(): typeof renderAll { return renderAll; }, get renderSourceWorkflow(): typeof renderSourceWorkflow { return renderSourceWorkflow; }, get setStatus(): typeof setStatus { return setStatus; }, get setTool(): typeof setTool { return setTool; }, get stageEl(): typeof stageEl { return stageEl; }, get stageEmptyEl(): typeof stageEmptyEl { return stageEmptyEl; }, get state(): typeof state { return state; }, get statusEl(): typeof statusEl { return statusEl; }, get toolButtons(): typeof toolButtons { return toolButtons; }, get uploadedImageDataUrl(): typeof uploadedImageDataUrl { return uploadedImageDataUrl; }, get workflow(): typeof workflow { return workflow; }, get zoomFitButton(): typeof zoomFitButton { return zoomFitButton; }, get zoomInButton(): typeof zoomInButton { return zoomInButton; }, get zoomLevelEl(): typeof zoomLevelEl { return zoomLevelEl; }, get zoomOutButton(): typeof zoomOutButton { return zoomOutButton; }, get zoomSpaceEl(): typeof zoomSpaceEl { return zoomSpaceEl; } }));

  const { normalizedOsmBboxFromWorkflow, storedProfessionalOsmView, persistProfessionalOsmView, renderProfessionalAoiSummary, sourceImageReference, combineWithOsmContext, renderSourceWorkflow, applyNormalizedSourcePayload, normalizeCurrentSceneSource, currentImageDataUrl, extractCurrentReferenceImage, storeProfessionalOsmJob, renderOsmJobProgress, mountProfessionalRoadStudy, mountProfessionalAoiPicker, pollProfessionalOsmJob, osmImportFailureMessage, importOsmContext, generateApprovedScene, openGenerationConfiguration, closeGenerationConfiguration, openExistingProfessionalScene } = createSgSourceWorkflowController(() => ({ get PROFESSIONAL_OSM_JOB_KEY(): typeof PROFESSIONAL_OSM_JOB_KEY { return PROFESSIONAL_OSM_JOB_KEY; }, get PROFESSIONAL_OSM_VIEW_KEY(): typeof PROFESSIONAL_OSM_VIEW_KEY { return PROFESSIONAL_OSM_VIEW_KEY; }, get clearAnnotationEditingState(): typeof clearAnnotationEditingState { return clearAnnotationEditingState; }, get cloneAnnotation(): typeof cloneAnnotation { return cloneAnnotation; }, get comparableAnnotationSnapshot(): typeof comparableAnnotationSnapshot { return comparableAnnotationSnapshot; }, get courseMode(): typeof courseMode { return courseMode; }, get ensureCompatibleFurnitureStripsForCurrentAnnotation(): typeof ensureCompatibleFurnitureStripsForCurrentAnnotation { return ensureCompatibleFurnitureStripsForCurrentAnnotation; }, get escapeHtml(): typeof escapeHtml { return escapeHtml; }, get featureCountsForAnnotation(): typeof featureCountsForAnnotation { return featureCountsForAnnotation; }, get generationConfirmDialog(): typeof generationConfirmDialog { return generationConfirmDialog; }, get generationConfirmOpenButton(): typeof generationConfirmOpenButton { return generationConfirmOpenButton; }, get generationConfirmSummary(): typeof generationConfirmSummary { return generationConfirmSummary; }, get graphStatusEl(): typeof graphStatusEl { return graphStatusEl; }, get hostOptions(): typeof hostOptions { return hostOptions; }, get normalizeAnnotation(): typeof normalizeAnnotation { return normalizeAnnotation; }, get originalImageEl(): typeof originalImageEl { return originalImageEl; }, get osmPicker(): typeof osmPicker { return osmPicker; }, get osmPickerHostEl(): typeof osmPickerHostEl { return osmPickerHostEl; }, get osmRoadStudyPicker(): typeof osmRoadStudyPicker { return osmRoadStudyPicker; }, get pendingOsmNormalization(): typeof pendingOsmNormalization { return pendingOsmNormalization; }, get professionalOsmPreview(): typeof professionalOsmPreview { return professionalOsmPreview; }, get professionalOsmSelection(): typeof professionalOsmSelection { return professionalOsmSelection; }, get professionalOsmStage(): typeof professionalOsmStage { return professionalOsmStage; }, get readImageFileDataUrl(): typeof readImageFileDataUrl { return readImageFileDataUrl; }, get remountAnnotationOsmBackground(): typeof remountAnnotationOsmBackground { return remountAnnotationOsmBackground; }, get renderAll(): typeof renderAll { return renderAll; }, get renderScenarioDesignOptions(): typeof renderScenarioDesignOptions { return renderScenarioDesignOptions; }, get root(): typeof root { return root; }, get segmentLengthInput(): typeof segmentLengthInput { return segmentLengthInput; }, get setStatus(): typeof setStatus { return setStatus; }, get shell(): typeof shell { return shell; }, get sidewalkWidthInput(): typeof sidewalkWidthInput { return sidewalkWidthInput; }, get signal(): typeof signal { return signal; }, get sourceAiExtractButton(): typeof sourceAiExtractButton { return sourceAiExtractButton; }, get sourceAiPrompt(): typeof sourceAiPrompt { return sourceAiPrompt; }, get sourceAiStatusEl(): typeof sourceAiStatusEl { return sourceAiStatusEl; }, get sourceAoiSummaryEl(): typeof sourceAoiSummaryEl { return sourceAoiSummaryEl; }, get sourceCoordinateSpaceSelect(): typeof sourceCoordinateSpaceSelect { return sourceCoordinateSpaceSelect; }, get sourceCountsEl(): typeof sourceCountsEl { return sourceCountsEl; }, get sourceGenerateButton(): typeof sourceGenerateButton { return sourceGenerateButton; }, get sourceNormalizeButton(): typeof sourceNormalizeButton { return sourceNormalizeButton; }, get sourceOpenAnnotationToolsButton(): typeof sourceOpenAnnotationToolsButton { return sourceOpenAnnotationToolsButton; }, get sourceOpenExistingButton(): typeof sourceOpenExistingButton { return sourceOpenExistingButton; }, get sourceProvenanceEl(): typeof sourceProvenanceEl { return sourceProvenanceEl; }, get sourceReviewStatusEl(): typeof sourceReviewStatusEl { return sourceReviewStatusEl; }, get sourceStatusEl(): typeof sourceStatusEl { return sourceStatusEl; }, get sourceWarningsEl(): typeof sourceWarningsEl { return sourceWarningsEl; }, get sourceWorkflowEl(): typeof sourceWorkflowEl { return sourceWorkflowEl; }, get state(): typeof state { return state; }, get statusEl(): typeof statusEl { return statusEl; }, get updateCleanAnnotationSnapshot(): typeof updateCleanAnnotationSnapshot { return updateCleanAnnotationSnapshot; }, get updateOsmPickerVisibility(): typeof updateOsmPickerVisibility { return updateOsmPickerVisibility; }, get uploadedImageDataUrl(): typeof uploadedImageDataUrl { return uploadedImageDataUrl; }, get workflow(): typeof workflow { return workflow; } }));

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
  shell.setRightTabs(createSceneGraphRightTabs({
    showAdvancedSourceTools: hostOptions.showAdvancedSourceTools === true,
  }), "source");
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
    referencePlanControl,
    osmReferenceNote,
    imageInput,
    imageResetButton,
    showOriginalInput,
    showOverlayInput,
    showOsmLabelsInput,
    showAnnotationLabelsInput,
    showJunctionCoreInput,
    showJunctionConnectorsInput,
    showJunctionOutlinesInput,
    showJunctionCrosswalksInput,
    showJunctionBoundariesInput,
    showJunctionLabelsInput,
    showJunctionDebugInput,
    originalOpacityLabel,
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
    zoomSpaceEl,
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
    sourceAoiSummaryEl,
    sourceAiPrompt,
    sourceAiExtractButton,
    sourceAiStatusEl,
    sourceNormalizeButton,
    sourceStatusEl,
    sourceProvenanceEl,
    sourceCountsEl,
    sourceWarningsEl,
    sourceBackButton,
    sourceOpenAnnotationToolsButton,
    sourceGenerateButton,
    sourceOpenExistingButton,
    sourceReviewStatusEl,
  } = collectSceneGraphElements(root);

  const toolButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(".scene-tool-button"));
  const generationConfirmDialog = root.querySelector<HTMLElement>("#scene-generation-confirm-dialog");
  const generationConfirmSummary = root.querySelector<HTMLElement>("#scene-generation-confirm-summary");
  const generationConfirmOpenButton = root.querySelector<HTMLButtonElement>("#scene-generation-confirm-open");
  const generationConfirmCancelButton = root.querySelector<HTMLButtonElement>("#scene-generation-confirm-cancel");
  const osmMapHostEl = root.querySelector<HTMLElement>("#annotation-osm-map");
  const osmPickerHostEl = root.querySelector<HTMLElement>("#scene-osm-aoi-picker");
  let annotationOsmMap: { value: MapLibreMap | null } = { value: null };
  let osmPicker: { value: OsmAoiPickerController | null } = { value: null };
  let osmRoadStudyPicker: { value: OsmRoadStudyPickerController | null } = { value: null };
  let professionalOsmStage: { value: "aoi" | "progress" | "study" | "annotation" } = { value: "aoi" };
  let professionalOsmPreview: { value: OsmRoadPreview | null } = { value: null };

  const state = {
    referencePlans: [FALLBACK_REFERENCE_PLAN] as ReferencePlan[],
    scenarioDesigns: [] as ScenarioDesign[],
    scenarioGraphTemplateId: "",
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
    showOsmLabels: false,
    showAnnotationLabels: true,
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
  let pendingOsmNormalization: { value: NormalizedSceneSourceResponse | null } = { value: (
    retainedNormalizedSource?.sourceContext.aligned_buildings?.length
    || retainedNormalizedSource?.sourceContext.osm_annotation_context
  )
    ? {
        annotation: retainedNormalizedSource.referenceAnnotation,
        graph: retainedNormalizedSource.graph as ConvertedGraphPayload["graph"],
        summary: { ...retainedNormalizedSource.featureCounts },
        source: retainedNormalizedSource.source as NormalizedSceneSourceResponse["source"],
        geojson: retainedNormalizedSource.geojson as Record<string, unknown> | null,
        warnings: [...retainedNormalizedSource.warnings],
        aligned_buildings: [...(retainedNormalizedSource.sourceContext.aligned_buildings ?? [])] as NormalizedSceneSourceResponse["aligned_buildings"],
        source_alignment: retainedNormalizedSource.sourceContext.source_alignment as NormalizedSceneSourceResponse["source_alignment"],
        osm_annotation_context: retainedNormalizedSource.sourceContext.osm_annotation_context as Record<string, unknown>,
      }
    : null };
  let uploadedImageDataUrl: { value: string } = { value: workflow.getSnapshot().sourceImageDataUrl ?? "" };

  const retainedOsmBbox = normalizedOsmBboxFromWorkflow();
  let professionalOsmSelection: { value: OsmAoiSelection | null } = { value: retainedOsmBbox
    ? { bbox: [...retainedOsmBbox], source: "coordinates" }
    : null };

  const unsubscribeWorkflow = workflow.subscribe(renderSourceWorkflow);

  let cleanAnnotationSnapshot: { value: string } = { value: comparableAnnotationSnapshot(state.annotation) };
  let autoGraphTimer: { value: number | null } = { value: null };
  let autoGraphInFlight: { value: boolean } = { value: false };
  let autoGraphPending: { value: boolean } = { value: false };

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

  bindSceneGraphEvents();
  const initialWorkflowSnapshot = workflow.getSnapshot();
  if (!courseMode && osmPickerHostEl) {
    const forceOsmPicker = consumeProfessionalOsmPickerRequest();
    if (forceOsmPicker) {
      workflow.transition("source");
      storeProfessionalOsmJob(null);
      mountProfessionalAoiPicker();
    } else if (initialWorkflowSnapshot.normalized) professionalOsmStage.value = "annotation";
    else mountProfessionalAoiPicker();
    let retainedJobId = "";
    try { retainedJobId = window.sessionStorage.getItem(PROFESSIONAL_OSM_JOB_KEY) ?? ""; } catch { retainedJobId = ""; }
    if (!forceOsmPicker && !initialWorkflowSnapshot.normalized && retainedJobId) {
      void loadOsmAcquisitionJob(retainedJobId)
        .then((job) => pollProfessionalOsmJob(job))
        .catch(() => {
          storeProfessionalOsmJob(null);
          mountProfessionalAoiPicker();
        });
    }
  }
  if (initialWorkflowSnapshot.normalized || initialWorkflowSnapshot.annotationDraft) {
    state.annotation = normalizeAnnotation(
      initialWorkflowSnapshot.annotationDraft?.annotation
        ?? initialWorkflowSnapshot.normalized?.referenceAnnotation
        ?? state.annotation,
    );
    ensureCompatibleFurnitureStripsForCurrentAnnotation();
    if (initialWorkflowSnapshot.normalized?.graph) {
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
    state.isReferenceImageLoading = false;
    state.referenceImageLoadingMessage = courseMode
      ? "No persisted course annotation is available."
      : "Select an OSM area or choose another source.";
  }
  renderAll();
  renderSourceWorkflow();
  if (
    !courseMode
    && initialWorkflowSnapshot.annotationDraft
    && initialWorkflowSnapshot.annotationDraft.status !== "saved"
    && canConvertGraph()
  ) {
    scheduleAutoGraphConversion(120);
  }
  mountAnnotationOsmBackground();
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
        workflow.endRequest(capabilityToken);
        renderSourceWorkflow();
        sourceAiStatusEl.textContent = error instanceof Error
          ? `Optional AI capability check unavailable: ${error.message}`
          : "Optional AI capability check unavailable.";
        sourceAiStatusEl.dataset.tone = "neutral";
      });
    void loadReferencePlans({ silent: true }).catch((error) => {
      const reason = error instanceof Error ? error.message : "Reference template library unavailable.";
      shell.pushActivity(`Reference template library unavailable: ${reason}`, "warning");
    });
  }

  function refreshSceneGraphLanguage(): void {
    const language = loadViewerLanguage();
    applyViewerTranslations(root, language);
    const sourceLabel = translateViewerKey(language, "sceneGraph.source.drawer") ?? "Source / Status";
    const sourceTab = root.querySelector<HTMLButtonElement>('[data-shell-tab="source"]');
    if (sourceTab) {
      sourceTab.title = sourceLabel;
      sourceTab.setAttribute("aria-label", sourceLabel);
      const label = sourceTab.querySelector<HTMLElement>(".workbench-sidebar-label");
      if (label) label.textContent = sourceLabel;
    }
    const sourceDrawerTitle = root.querySelector<HTMLElement>('[data-shell-tab-panel="source"] .workbench-sidebar-drawer-header strong');
    if (sourceDrawerTitle) sourceDrawerTitle.textContent = sourceLabel;
    renderAll();
    renderSourceWorkflow();
    renderInspector();
    applyViewerTranslations(root, language);
  }

  window.addEventListener(VIEWER_LANGUAGE_EVENT, refreshSceneGraphLanguage, { signal });
  return () => {
    if (autoGraphTimer.value !== null) {
      window.clearTimeout(autoGraphTimer.value);
      autoGraphTimer.value = null;
    }
    revokeCurrentObjectUrl();
    osmPicker.value?.destroy();
    osmPicker.value = null;
    annotationOsmMap.value?.remove();
    annotationOsmMap.value = null;
    unsubscribeWorkflow();
    eventController.abort();
  };
}
