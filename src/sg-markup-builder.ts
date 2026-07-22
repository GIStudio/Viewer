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

export type SceneGraphHostOptions = {
  mode?: "expert" | "course";
  showAdvancedSourceTools?: boolean;
  onApproveAndGenerate?: (annotation: ReferenceAnnotation) => Promise<void>;
  onNavigateProfessionalScene?: (target: "generate" | "browse") => Promise<void>;
};

export type SgMarkupBuilderContext = {
  NO_DIRECTION_STRIP_KINDS: Set<StripKind>;
  buildMetaurbanAssetBadgeMarkup: (kind: StripKind, options?: { emptyMode?: "note" | "omit"; }) => string;
  crossSectionPreviewDisplayOrder: (strips: AnnotatedCrossSectionStrip[]) => AnnotatedCrossSectionStrip[];
  escapeHtml: (text: string) => string;
  getReferenceWidthMeters: (centerline: AnnotatedCenterline, pixelsPerMeter: number) => number | null;
  inspectorFormat: (key: string, fallback: string, params: Record<string, string | number>) => string;
  inspectorText: (key: string, fallback: string) => string;
  localizedMetaurbanStripZoneLabel: (kind: StripKind) => string;
  localizedStripKindLabels: () => Record<StripKind, string>;
  localizedStripLabel: (kind: StripKind) => string;
  localizedStripSideLabel: (zone: StripZone) => string;
  localizedStripUsage: (kind: StripKind) => string;
  nominalSeedCrossSectionWidth: (centerline: AnnotatedCenterline) => number;
  previewCrossSection: (centerline: AnnotatedCenterline) => PreviewCrossSection;
  stripDirectionChip: (strip: AnnotatedCrossSectionStrip) => string;
  stripPreviewFillColor: (kind: StripKind) => string;
};

export function createSgMarkupBuilder(getContext: () => SgMarkupBuilderContext) {
  function buildSelectOptions<T extends string>(
  values: readonly T[],
  selectedValue: T,
  labels: Record<T, string>,
  ): string {
    const { escapeHtml } = getContext();
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(labels[value])}</option>`,
    )
    .join("");
  }

  function stripDirectionMarkup(strip: AnnotatedCrossSectionStrip): string {
    const { NO_DIRECTION_STRIP_KINDS } = getContext();
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
    const { escapeHtml } = getContext();
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
    const { escapeHtml } = getContext();
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
    const { buildMetaurbanAssetBadgeMarkup, crossSectionPreviewDisplayOrder, escapeHtml, inspectorFormat, inspectorText, localizedMetaurbanStripZoneLabel, localizedStripLabel, previewCrossSection, stripDirectionChip, stripPreviewFillColor } = getContext();
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
            <span class="annotation-cross-preview-strip-label">${escapeHtml(localizedStripLabel(strip.kind))}</span>
            <span class="annotation-cross-preview-strip-meta">${escapeHtml(strip.width_m.toFixed(2))}m · ${escapeHtml(stripDirectionChip(strip))}</span>
            <span class="annotation-cross-preview-strip-zone">${escapeHtml(localizedMetaurbanStripZoneLabel(strip.kind))}</span>
            ${buildMetaurbanAssetBadgeMarkup(strip.kind)}
          </button>
          ${
            isDetailedPreview
              ? `
                <div class="annotation-cross-preview-strip-actions" aria-label="${escapeHtml(inspectorText("sceneGraph.inspector.stripActions", "Strip actions"))}">
                  <button type="button" class="scene-icon-button" data-action="move-strip-up" data-strip-id="${escapeHtml(strip.strip_id)}" title="${escapeHtml(inspectorText("sceneGraph.inspector.moveStripUp", "Move strip earlier"))}" aria-label="${escapeHtml(inspectorText("sceneGraph.inspector.moveStripUp", "Move strip earlier"))}">↑</button>
                  <button type="button" class="scene-icon-button" data-action="move-strip-down" data-strip-id="${escapeHtml(strip.strip_id)}" title="${escapeHtml(inspectorText("sceneGraph.inspector.moveStripDown", "Move strip later"))}" aria-label="${escapeHtml(inspectorText("sceneGraph.inspector.moveStripDown", "Move strip later"))}">↓</button>
                  <button type="button" class="scene-icon-button" data-action="delete-strip" data-strip-id="${escapeHtml(strip.strip_id)}" title="${escapeHtml(inspectorText("sceneGraph.inspector.removeStrip", "Remove strip"))}" aria-label="${escapeHtml(inspectorText("sceneGraph.inspector.removeStrip", "Remove strip"))}">×</button>
                </div>
                <label class="annotation-cross-preview-control">
                  <span>${escapeHtml(inspectorText("sceneGraph.inspector.widthM", "Width (m)"))}</span>
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
            aria-label="${escapeHtml(inspectorFormat("sceneGraph.inspector.resizeBoundary", `Resize boundary between ${localizedStripLabel(strip.kind)} and ${localizedStripLabel(nextStrip.kind)}`, { left: localizedStripLabel(strip.kind), right: localizedStripLabel(nextStrip.kind) }))}"
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
          <h3>${escapeHtml(inspectorText("sceneGraph.inspector.crossSectionPreview", "Cross Section Preview"))}</h3>
          <div class="scene-micro-note">
            ${escapeHtml(preview.sourceMode === "seed" ? inspectorText("sceneGraph.inspector.seedPreview", "Seed preview from coarse parameters") : inspectorText("sceneGraph.inspector.detailedCrossSection", "Detailed cross section"))}
          </div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">${escapeHtml(inspectorFormat("sceneGraph.inspector.totalWidthValue", `${totalWidth.toFixed(2)}m total`, { value: totalWidth.toFixed(2) }))}</span>
          <span class="annotation-cross-preview-stat">${escapeHtml(inspectorFormat("sceneGraph.inspector.carriagewayValue", `${getCenterlineCarriagewayWidth(centerline).toFixed(2)}m carriageway`, { value: getCenterlineCarriagewayWidth(centerline).toFixed(2) }))}</span>
        </div>
      </div>
      <div class="annotation-cross-preview-row">
        ${bands.join("")}
      </div>
      ${
        isDetailedPreview
          ? `
            <div class="annotation-cross-preview-toolbar">
              <span>${escapeHtml(inspectorText("sceneGraph.inspector.laneComposition", "Lane composition"))}</span>
              <div>
                <button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="add-strip" data-zone="left">${escapeHtml(inspectorText("sceneGraph.inspector.addLeftStrip", "Add left strip"))}</button>
                <button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="add-strip" data-zone="center">${escapeHtml(inspectorText("sceneGraph.inspector.addCenterStrip", "Add center lane"))}</button>
                <button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="add-strip" data-zone="right">${escapeHtml(inspectorText("sceneGraph.inspector.addRightStrip", "Add right strip"))}</button>
              </div>
            </div>
          `
          : ""
      }
      <div class="scene-micro-note">
        ${escapeHtml(
          preview.sourceMode === "seed"
            ? inspectorText("sceneGraph.inspector.seedClickHint", "Click a seed band to split this road into editable detailed strips.")
            : inspectorText("sceneGraph.inspector.detailClickHint", "Click a band to select it, then adjust width and direction below."),
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
    const { buildMetaurbanAssetBadgeMarkup, escapeHtml, localizedMetaurbanStripZoneLabel, localizedStripKindLabels, localizedStripSideLabel, localizedStripUsage } = getContext();
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
        <span class="scene-micro-note">${escapeHtml(strip.strip_id)} · ${escapeHtml(localizedMetaurbanStripZoneLabel(strip.kind))}</span>
      </div>
      ${buildMetaurbanAssetBadgeMarkup(strip.kind, { emptyMode: "note" })}
      <div class="scene-inspector-grid annotation-road-properties-grid">
        <label class="scene-form-field">
          <span>Strip ID</span>
          <input type="text" value="${escapeHtml(strip.strip_id)}" readonly />
        </label>
        <label class="scene-form-field">
          <span>Zone</span>
          <input type="text" value="${escapeHtml(localizedStripSideLabel(strip.zone))}" readonly />
        </label>
        <label class="scene-form-field">
          <span>Kind</span>
          <select data-strip-field="kind" data-strip-id="${escapeHtml(strip.strip_id)}">
            ${buildSelectOptions(
              strip.zone === "center"
                ? (["drive_lane", "bus_lane", "bike_lane", "parking_lane", "median", "grass_belt", "shared_street_surface", "colored_pavement"] as StripKind[])
                : (["nearroad_buffer", "nearroad_furnishing", "clear_sidewalk", "farfromroad_buffer", "frontage_reserve", "colored_pavement"] as StripKind[]),
              strip.kind,
              localizedStripKindLabels(),
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
          <span class="scene-fact-label">Functional Zone</span>
          <strong>${escapeHtml(localizedMetaurbanStripZoneLabel(strip.kind))}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Corner-linked Roads</span>
          <strong>${cornerLinkedRoadCount}</strong>
        </div>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Function</span>
          <strong>${escapeHtml(localizedStripUsage(strip.kind))}</strong>
        </div>
      </div>
    </section>
  `;
  }

  function buildFurnitureMarkup(
  centerline: AnnotatedCenterline,
  selectedStripId: string | null,
  pendingFurnitureKind: FurnitureKind,
  isPlacementArmed: boolean,
  ): string {
    const { escapeHtml } = getContext();
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
    const { escapeHtml, getReferenceWidthMeters, inspectorFormat, inspectorText, nominalSeedCrossSectionWidth } = getContext();
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
    const sourceRefs = centerline.source_refs ?? {};
    const osmWayIds = Array.isArray(sourceRefs.osm_way_ids) ? sourceRefs.osm_way_ids.map(String).filter(Boolean) : [];
    const isOsmRoad = sourceRefs.kind === "osm_road" && osmWayIds.length > 0;
    const osmEditState = String(sourceRefs.edit_state ?? "base");
    return `
      ${buildCrossSectionPreviewMarkup(centerline, selectedStripId, junctionOverlays)}
      <div class="scene-inspector-grid annotation-road-properties-grid">
        <label class="scene-form-field">
          <span>ID</span>
          <input id="annotation-inspector-id" type="text" value="${escapeHtml(centerline.id)}" />
        </label>
        <label class="scene-form-field scene-form-field-compact-wide">
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
        <label class="scene-form-field scene-form-field-compact-wide">
          <span>Highway Type</span>
          <input id="annotation-inspector-highway-type" type="text" value="${escapeHtml(centerline.highway_type)}" />
        </label>
      </div>
      <div class="scene-inspector-grid annotation-road-summary-grid">
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
          <span class="scene-fact-label">${escapeHtml(inspectorText("sceneGraph.inspector.roadGeometry", "Road geometry"))}</span>
          <strong>${escapeHtml(inspectorFormat("sceneGraph.inspector.vertexCountExplained", `${centerline.points.length} vertices — points defining the road centerline shape`, { count: centerline.points.length }))}${selection.vertexIndex !== undefined ? ` · ${escapeHtml(inspectorFormat("sceneGraph.inspector.selectedVertex", `selected vertex ${selection.vertexIndex + 1}`, { index: selection.vertexIndex + 1 }))}` : ""}</strong>
        </div>
        ${isOsmRoad ? `
          <div class="scene-fact-card scene-form-field-wide">
            <span class="scene-fact-label">OSM 来源</span>
            <strong>way ${escapeHtml(osmWayIds.join(", "))} · ${osmEditState === "base" ? "原始几何" : "已在标记层修改"}</strong>
          </div>
        ` : ""}
        <div class="annotation-detail-actions scene-form-field-wide">
          ${
            !detailed
              ? `<button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="reset-road-width-to-nominal">
                  ${escapeHtml(inspectorFormat("sceneGraph.inspector.resetWidth", `Reset Width to Nominal ${nominalWidth.toFixed(2)}m`, { value: nominalWidth.toFixed(2) }))}
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
          ${isOsmRoad && osmEditState !== "base" ? '<button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="restore-osm-geometry">恢复 OSM 原始几何</button>' : ""}
          ${
            detailed
              ? `<button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="collapse-centerline" title="${escapeHtml(inspectorText("sceneGraph.inspector.backCoarseHint", "Replace the editable strip layout with a seed preview based on coarse parameters."))}">${escapeHtml(inspectorText("sceneGraph.inspector.backCoarse", "Return to coarse parameters"))}</button>`
              : ""
          }
        </div>
      </div>
      ${
        detailed
          ? `
            ${buildSelectedStripEditorMarkup(centerline, selectedStripId, linkedRoadIds.size)}
            ${buildFurnitureMarkup(centerline, selectedStripId, pendingFurnitureKind, isFurniturePlacementArmed)}
          `
          : `
            <div class="scene-empty-note">先把总宽度和参考图调准；你现在也可以直接点击上方 seed 横截面中的任一部分，自动进入 detailed 编辑。</div>
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
    const { escapeHtml } = getContext();
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

  return { buildSelectOptions, stripDirectionMarkup, stripZoneSideLabel, normalizedConnectionPreviewPoints, buildCornerConnectionCardMarkup, buildStripCornerConnectionsMarkup, buildCrossSectionPreviewMarkup, buildSelectedStripEditorMarkup, buildFurnitureMarkup, buildInspectorMarkup, buildBuildingRegionDraftMarkup, regionPolygonPoints, regionCentroid, regionBoxPoints, regionRoleLabel, buildRegionDraftMarkup, buildFunctionalZoneDraftMarkup, buildBranchPreviewMarkup, buildCrossPreviewMarkup, previewSplitCenterlinePointsAtSnap, previewCenterlinesFromDrafts, buildOverlayMarkup };
}
