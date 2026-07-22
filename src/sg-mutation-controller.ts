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

export type SgMutationControllerContext = {
  autoGraphPending: { value: boolean; };
  centerlineLengthM: (centerline: AnnotatedCenterline, pixelsPerMeter: number) => number;
  clearAnnotationEditingState: () => void;
  clearBranchDraft: () => void;
  clearCrossDraft: () => void;
  clearFurniturePlacement: () => void;
  clearGraphResult: (reason: string, options?: { autoConvert?: boolean; }) => void;
  cloneAnnotation: (annotation: ReferenceAnnotation) => ReferenceAnnotation;
  comparableAnnotationSnapshot: (annotation: ReferenceAnnotation) => string;
  graphStatusEl: HTMLElement;
  markAnnotationChanged: (statusMessage?: string) => void;
  markCenterlineOverlayEdited: (centerline: AnnotatedCenterline) => void;
  renderAll: () => void;
  renderScenarioDesignOptions: (preferredScenarioId?: string) => void;
  resolveCompatibleFurnitureStripForRoad: (centerline: AnnotatedCenterline) => AnnotatedCrossSectionStrip | null;
  revealJunctionSurfaceLayers: () => void;
  segmentLengthInput: HTMLInputElement;
  setStatus: (element: HTMLElement, message: SceneGraphStatusText, tone: StatusTone) => void;
  sidewalkWidthInput: HTMLInputElement;
  state: any;
  statusEl: HTMLElement;
};

export function createSgMutationController(getContext: () => SgMutationControllerContext) {
  function finalizeDraftCenterline(): void {
    const { clearBranchDraft, clearCrossDraft, markAnnotationChanged, renderAll, setStatus, state, statusEl } = getContext();
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
    const profileSource = osmProfileForPoints(snappedDraft.points);
    const centerline = profileSource
      ? createArmFromProfile(profileSource, id, snappedDraft.points, {
          startJunctionId: snappedDraft.startJunctionId,
          endJunctionId: snappedDraft.endJunctionId,
        })
      : createDefaultAnnotatedCenterline(id, snappedDraft.points, {
      startJunctionId: snappedDraft.startJunctionId,
      endJunctionId: snappedDraft.endJunctionId,
    });
    if (!profileSource) centerline.source_refs = { kind: "manual_overlay", edit_state: "manual" };
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
    const { clearCrossDraft, clearFurniturePlacement, markAnnotationChanged, renderAll, revealJunctionSurfaceLayers, setStatus, state, statusEl } = getContext();
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
    const profileSource = osmProfileForPoints([anchorPoint]);
    const arms = candidateArms.map((points, index) => profileSource
      ? createArmFromProfile(profileSource, [westArmId, eastArmId, northArmId, southArmId][index], points, { endJunctionId: junctionId })
      : createDefaultAnnotatedCenterline([westArmId, eastArmId, northArmId, southArmId][index], points, { endJunctionId: junctionId }));
    for (const arm of arms) {
      if (!profileSource) arm.source_refs = { kind: "manual_overlay", edit_state: "manual" };
    }
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
    const { clearAnnotationEditingState, clearGraphResult, renderAll, renderScenarioDesignOptions, setStatus, state, statusEl } = getContext();
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
    const { clearFurniturePlacement, clearGraphResult, renderAll, setStatus, state, statusEl } = getContext();
    if (!state.selection) {
      return;
    }
    if (state.selection.kind === "lane_element") {
      setStatus(statusEl, "Lane elements are read-only derived/debug geometry. Select the owning road or junction to edit it.", "neutral");
      renderAll();
      return;
    }
    if (state.selection.kind === "centerline") {
      const lineIndex = state.annotation.centerlines.findIndex((item: AnnotatedCenterline) => item.id === state.selection?.id);
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
      const junction = state.annotation.junctions.find((item: AnnotatedJunction) => item.id === state.selection?.id) ?? null;
      if (junction?.source_mode === "explicit") {
        setStatus(statusEl, "Explicit junctions are owned by connected road arms. Edit or delete the connected roads instead.", "neutral");
      } else {
        state.annotation.junctions = state.annotation.junctions.filter((item: AnnotatedJunction) => item.id !== state.selection?.id);
        state.selection = null;
        setStatus(statusEl, "Deleted junction.", "success");
      }
    } else if (state.selection.kind === "roundabout") {
      state.annotation.roundabouts = state.annotation.roundabouts.filter((item: AnnotatedRoundabout) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted roundabout.", "success");
    } else if (state.selection.kind === "control_point") {
      state.annotation.control_points = state.annotation.control_points.filter((item: AnnotatedMarker) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted control point.", "success");
    } else if (state.selection.kind === "building_region") {
      state.annotation.building_regions = state.annotation.building_regions.filter((item: AnnotatedBuildingRegion) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted building region.", "success");
    } else if (state.selection.kind === "region") {
      const selectedId = state.selection.id;
      const explicitCountBefore = state.annotation.regions.length;
      state.annotation.regions = state.annotation.regions.filter((item: AnnotatedRegion) => item.id !== selectedId);
      state.annotation.derived_regions = (state.annotation.derived_regions ?? []).filter((item: AnnotatedRegion) => item.id !== selectedId);
      state.selection = null;
      state.derivedRegionsStale = state.annotation.regions.length !== explicitCountBefore || state.derivedRegionsStale;
      setStatus(statusEl, "Deleted region.", "success");
    } else if (state.selection.kind === "functional_zone") {
      state.annotation.functional_zones = state.annotation.functional_zones.filter((item: AnnotatedFunctionalZone) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted functional zone.", "success");
    } else if (state.selection.kind === "surface_annotation") {
      state.annotation.surface_annotations = state.annotation.surface_annotations.filter((item: AnnotatedSurfaceAnnotation) => item.id !== state.selection?.id);
      state.selection = null;
      setStatus(statusEl, "Deleted design surface.", "success");
    } else if (state.selection.kind === "derived_junction") {
      setStatus(statusEl, "Derived junctions come from shared road vertices. Edit the connected centerlines instead.", "neutral");
    }
    clearGraphResult("Annotation changed. Road graph will refresh automatically.");
    renderAll();
  }

  async function convertAnnotationToGraph(options: { automatic?: boolean; expectedFingerprint?: string } = {}): Promise<boolean> {
    const { autoGraphPending, cloneAnnotation, comparableAnnotationSnapshot, graphStatusEl, renderAll, segmentLengthInput, setStatus, sidewalkWidthInput, state } = getContext();
    if (state.annotation.centerlines.length === 0) {
      setStatus(graphStatusEl, "Add at least one centerline before converting.", "error");
      return false;
    }
    const modelIssues = validateAnnotationForExplicitJunctionModel(state.annotation);
    if (modelIssues.length > 0) {
      setStatus(graphStatusEl, modelIssues[0].message, "error");
      return false;
    }
    setStatus(graphStatusEl, options.automatic ? "Updating road graph automatically..." : "Converting annotation to graph...", "neutral");
    const annotationRequest = cloneAnnotation(state.annotation);
    for (const centerline of annotationRequest.centerlines) {
      syncCenterlineDerivedFields(centerline);
    }
    const response = await fetch(`${API_BASE}/api/reference-annotations/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        annotation: annotationRequest,
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
    const requestFingerprint = options.expectedFingerprint ?? comparableAnnotationSnapshot(annotationRequest);
    if (comparableAnnotationSnapshot(state.annotation) !== requestFingerprint) {
      autoGraphPending.value = true;
      return false;
    }
    const convertedPayload = payload as ConvertedGraphPayload;
    const annotationSnapshot = cloneAnnotation(annotationRequest);
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
    setStatus(graphStatusEl, { key: "sceneGraph.status.graphComplete" }, "success");
    renderAll();
    return true;
  }

  function syncSelectionAfterMutation(): void {
    const { clearFurniturePlacement, state } = getContext();
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
        const centerline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === laneSelection.centerlineId) ?? null;
        const stripId = laneSelection.stripId;
        if (!centerline || !stripId || !centerline.cross_section_strips.some((strip: AnnotatedCrossSectionStrip) => strip.strip_id === stripId)) {
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
    const { centerlineLengthM, clearFurniturePlacement, markAnnotationChanged, renderAll, setStatus, state, statusEl } = getContext();
    const laneHit = hit?.kind === "lane_element" && hit.elementKind === "road_strip" ? hit : null;
    const centerlineHitId = hit?.kind === "centerline" ? hit.id : undefined;
    const centerlineId = laneHit?.centerlineId ?? centerlineHitId ?? findNearestBranchSnapTarget(state.annotation, point, { maxDistancePx: Math.max(BRANCH_SNAP_TOLERANCE_PX, 24) })?.centerlineId ?? "";
    const centerline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === centerlineId) ?? null;
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
    const sourceWayIds = Array.isArray(source.source_refs?.osm_way_ids)
      ? source.source_refs.osm_way_ids
      : [];
    arm.source_refs = {
      kind: "manual_overlay",
      edit_state: "manual",
      parent_centerline_id: source.id,
      ...(sourceWayIds.length > 0 ? { parent_osm_way_ids: sourceWayIds } : {}),
    };
    arm.start_junction_id = options.startJunctionId ?? "";
    arm.end_junction_id = options.endJunctionId ?? "";
    syncCenterlineDerivedFields(arm);
    return arm;
  }

  function osmProfileForPoints(points: AnnotationPoint[]): AnnotatedCenterline | null {
    const { state } = getContext();
    const osmRoads = state.annotation.centerlines.filter((item: AnnotatedCenterline) => item.source_refs?.kind === "osm_road");
    if (osmRoads.length === 0) return null;
    let closest: AnnotatedCenterline | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const point of points) {
      for (const road of osmRoads) {
        const distance = projectPointOntoPolyline(road.points, point).distancePx;
        if (distance < closestDistance) {
          closest = road;
          closestDistance = distance;
        }
      }
    }
    return closest;
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
    const { markCenterlineOverlayEdited } = getContext();
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
    // Splitting an imported OSM segment produces an editable RoadGen3D
    // overlay; the immutable raw source remains in OsmAnnotationContext.
    for (const connectedId of splitResult.connectedCenterlineIds) {
      const edited = annotation.centerlines.find((item) => item.id === connectedId);
      if (edited) markCenterlineOverlayEdited(edited);
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
    const { setStatus, state, statusEl } = getContext();
    if (!endpointSnap) {
      return endpoint;
    }
    const target = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === endpointSnap.centerlineId);
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
    const { clearBranchDraft, state } = getContext();
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
    const { clearCrossDraft, state } = getContext();
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
    const { clearFurniturePlacement, markAnnotationChanged, markCenterlineOverlayEdited, renderAll, setStatus, state, statusEl } = getContext();
    const host = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === snap.centerlineId);
    if (!host) {
      setStatus(statusEl, "Could not resolve the host road for this branch anchor.", "error");
      return;
    }
    const anchorPoint = insertSharedVertexAtSnap(host, snap);
    markCenterlineOverlayEdited(host);
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
    const { clearFurniturePlacement, renderAll, setStatus, state, statusEl } = getContext();
    const host = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === snap.centerlineId);
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
    const { clearBranchDraft, clearFurniturePlacement, markAnnotationChanged, renderAll, setStatus, state, statusEl } = getContext();
    const draft = state.branchDraft;
    if (!draft) {
      return;
    }
    const host = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === draft.anchor.centerlineId);
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
    const { clearCrossDraft, clearFurniturePlacement, markAnnotationChanged, renderAll, revealJunctionSurfaceLayers, setStatus, state, statusEl } = getContext();
    const draft = state.crossDraft;
    if (!draft) {
      return;
    }
    const host = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === draft.anchor.centerlineId);
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
    const { clearGraphResult, renderAll, resolveCompatibleFurnitureStripForRoad, setStatus, state, statusEl } = getContext();
    if (!state.furniturePlacement) {
      return false;
    }

    // Check if click is inside a functional zone when snap is OFF
    const insideFunctionalZone = !state.snapToRoadEnabled && state.annotation.functional_zones.some(
      (zone: AnnotatedFunctionalZone) => zone.points.length >= 3 && pointInPolygon(point, zone.points)
    );

    // If inside functional zone with snap OFF, place furniture directly in the zone
    if (insideFunctionalZone) {
      const targetZone = state.annotation.functional_zones.find(
        (zone: AnnotatedFunctionalZone) => zone.points.length >= 3 && pointInPolygon(point, zone.points)
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
    const centerline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === state.furniturePlacement?.centerlineId);
    if (!centerline) {
      setStatus(statusEl, "No road selected. Select a road first to place furniture.", "error");
      return false;
    }

    let strip = centerline.cross_section_strips.find((item: AnnotatedCrossSectionStrip) => item.strip_id === state.furniturePlacement?.stripId);
    if (!strip || !FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) {
      strip = centerline.cross_section_strips.find((item: AnnotatedCrossSectionStrip) => FURNITURE_COMPATIBLE_STRIP_KINDS.has(item.kind));
    }
    if (!strip || !FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) {
      strip = resolveCompatibleFurnitureStripForRoad(centerline) ?? undefined;
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
    const { clearGraphResult, renderAll, resolveCompatibleFurnitureStripForRoad, setStatus, state, statusEl } = getContext();
    const ppm = Math.max(state.annotation.pixels_per_meter, 0.0001);
    let targetCenterline: AnnotatedCenterline | null = null;
    let targetProjection: ReturnType<typeof projectPointOntoPolyline> | null = null;
    let targetStrip: AnnotatedCrossSectionStrip | null = null;

    // Check if clicked inside a functional zone to allow freer placement when snap is off
    const insideFunctionalZone = state.annotation.functional_zones.some(
      (zone: AnnotatedFunctionalZone) => zone.points.length >= 3 && pointInPolygon(point, zone.points)
    );

    // 0. If snap is off and clicked inside a functional zone, place directly in the zone.
    if (!state.snapToRoadEnabled && insideFunctionalZone) {
      // Prefer currently selected zone, otherwise any zone containing the point
      let targetZone = state.selection?.kind === "functional_zone"
        ? state.annotation.functional_zones.find((z: AnnotatedFunctionalZone) => z.id === state.selection!.id) ?? null
        : null;
      if (!targetZone || !pointInPolygon(point, targetZone.points)) {
        targetZone = state.annotation.functional_zones.find(
          (z: AnnotatedFunctionalZone) => z.points.length >= 3 && pointInPolygon(point, z.points)
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
      targetCenterline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === state.selection?.id) ?? null;
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
    if (!targetStrip && targetCenterline) {
      targetStrip = resolveCompatibleFurnitureStripForRoad(targetCenterline);
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

  return { finalizeDraftCenterline, createStandaloneCrossAtPoint, resetAnnotation, deleteSelection, convertAnnotationToGraph, syncSelectionAfterMutation, nextFurnitureInstanceId, inferSurfaceKindFromStrip, createSurfaceAnnotationAtPoint, createArmFromProfile, osmProfileForPoints, ensureExplicitJunctionAtSnap, maybeConnectArmEndpointToSnap, updateBranchPreview, updateCrossPreview, beginBranchFromSnap, beginCrossFromSnap, commitBranchAtPoint, commitCrossAtPoint, placeFurnitureAtPoint, pointInPolygon, placeFurnitureQuick };
}
