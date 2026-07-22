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

export type SgAnnotationControllerContext = {
  ANNOTATION_MAX_ZOOM: 6;
  ANNOTATION_MIN_ZOOM: 0.25;
  DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE: "Loading default reference plan...";
  OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX: 1024;
  annotationOsmMap: { value: MapLibreMap | null; };
  autoGraphInFlight: { value: boolean; };
  autoGraphPending: { value: boolean; };
  autoGraphTimer: { value: number | null; };
  autoSplitRegionsButton: HTMLButtonElement;
  boardEl: HTMLElement;
  cleanAnnotationSnapshot: { value: string; };
  cloneAnnotation: (annotation: ReferenceAnnotation) => ReferenceAnnotation;
  convertAnnotationToGraph: (options?: { automatic?: boolean; expectedFingerprint?: string; }) => Promise<boolean>;
  courseMode: boolean;
  escapeHtml: (text: string) => string;
  graphStatusEl: HTMLElement;
  graphSummaryEl: HTMLElement;
  graphTextarea: HTMLTextAreaElement;
  jsonTextarea: HTMLTextAreaElement;
  normalizeRegion: (value: unknown, index: number, fallbackRole?: RegionRole) => AnnotatedRegion;
  normalizedOsmBboxFromWorkflow: () => EditableWgs84Bbox | null;
  originalImageEl: HTMLImageElement;
  osmMapHostEl: HTMLElement | null;
  osmPicker: { value: OsmAoiPickerController | null; };
  osmPickerHostEl: HTMLElement | null;
  osmRoadStudyPicker: { value: OsmRoadStudyPickerController | null; };
  overlayHostEl: HTMLElement;
  pendingOsmNormalization: { value: NormalizedSceneSourceResponse | null; };
  planSelect: HTMLSelectElement;
  professionalOsmStage: { value: "aoi" | "progress" | "study" | "annotation"; };
  readApiErrorDetail: (response: Response) => Promise<string>;
  regionBoxPoints: (startPoint: AnnotationPoint, currentPoint: AnnotationPoint) => AnnotationPoint[];
  regionRoleLabel: (role: RegionRole) => string;
  renderAll: () => void;
  renderSourceWorkflow: () => void;
  setStatus: (element: HTMLElement, message: SceneGraphStatusText, tone: StatusTone) => void;
  setTool: (tool: Tool) => void;
  stageEl: HTMLElement;
  stageEmptyEl: HTMLElement;
  state: any;
  statusEl: HTMLElement;
  toolButtons: HTMLButtonElement[];
  uploadedImageDataUrl: { value: string; };
  workflow: WorkflowController;
  zoomFitButton: HTMLButtonElement;
  zoomInButton: HTMLButtonElement;
  zoomLevelEl: HTMLOutputElement;
  zoomOutButton: HTMLButtonElement;
  zoomSpaceEl: HTMLElement;
};

export function createSgAnnotationController(getContext: () => SgAnnotationControllerContext) {
  function comparableAnnotationSnapshot(annotation: ReferenceAnnotation): string {
    const { cloneAnnotation } = getContext();
    const snapshot = cloneAnnotation(annotation);
    for (const centerline of snapshot.centerlines) {
      syncCenterlineDerivedFields(centerline);
    }
    return stringifyAnnotation(snapshot);
  }

  function updateCleanAnnotationSnapshot(): void {
    const { cleanAnnotationSnapshot, state } = getContext();
    cleanAnnotationSnapshot.value = comparableAnnotationSnapshot(state.annotation);
  }

  function isAnnotationDirty(): boolean {
    const { cleanAnnotationSnapshot, state } = getContext();
    return comparableAnnotationSnapshot(state.annotation) !== cleanAnnotationSnapshot.value;
  }

  function canConvertGraph(): boolean {
    const { state } = getContext();
    return state.annotation.centerlines.length > 0;
  }

  function featureCountsForAnnotation(annotation: ReferenceAnnotation): Record<string, number> {
    const { workflow } = getContext();
    return {
      roads: annotation.centerlines.length,
      junctions: annotation.junctions.length,
      regions: annotation.regions.length + (annotation.derived_regions?.length ?? 0),
      buildings: annotation.building_regions.length + (workflow.getSnapshot().normalized?.sourceContext.aligned_buildings?.length ?? 0),
      functional_zones: annotation.functional_zones.length,
      furniture: annotation.centerlines.reduce(
        (total, centerline) => total + centerline.street_furniture_instances.length,
        annotation.functional_zones.reduce((total, zone) => total + zone.furniture_instances.length, 0),
      ),
    };
  }

  function normalizedSourceForAnnotation(annotation: ReferenceAnnotation, graph: ConvertedGraphPayload["graph"]): NormalizedSceneSource {
    const { cloneAnnotation, workflow } = getContext();
    const previous = workflow.getSnapshot().normalized;
    return {
      referenceAnnotation: cloneAnnotation(annotation),
      graph: structuredClone(graph),
      source: previous?.source ?? {
        schema_version: "roadgen3d_scene_source_v1",
        source_id: annotation.plan_id || "manual_reference_annotation",
        kind: workflow.getSnapshot().sourceKind ?? "manual_annotation",
        producer: "manual",
        normalized_annotation_version: annotation.version,
      },
      geojson: previous?.geojson ?? null,
      warnings: previous?.warnings ?? [],
      sourceContext: previous?.sourceContext ?? {},
      featureCounts: featureCountsForAnnotation(annotation),
      normalizedAt: new Date().toISOString(),
    };
  }

  function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function buildScenePackage(): Record<string, unknown> {
    const { cloneAnnotation, state, workflow } = getContext();
    const normalized = workflow.getSnapshot().normalized;
    return {
      schema: "roadgen3d_scene_package_v1",
      exported_at: new Date().toISOString(),
      annotation: cloneAnnotation(state.annotation),
      // Preserve the immutable OSM snapshot alongside RoadGen3D's editable
      // overlay so that an import can restore the same coordinate frame.
      osm_annotation_context: normalized?.sourceContext.osm_annotation_context ?? null,
      normalized_source: normalized
        ? {
            ...normalized,
            referenceAnnotation: cloneAnnotation(state.annotation),
          }
        : null,
    };
  }

  function restoreScenePackage(value: unknown, annotation: ReferenceAnnotation, fileName: string): boolean {
    const { cloneAnnotation, pendingOsmNormalization, professionalOsmStage, uploadedImageDataUrl, workflow } = getContext();
    if (!isPlainRecord(value) || value.schema !== "roadgen3d_scene_package_v1") return false;
    const saved = isPlainRecord(value.normalized_source) ? value.normalized_source : null;
    const savedSource = saved && isPlainRecord(saved.source) ? saved.source : null;
    const savedContext = saved && isPlainRecord(saved.sourceContext) ? saved.sourceContext : {};
    const packageOsmContext = isPlainRecord(value.osm_annotation_context) ? value.osm_annotation_context : null;
    const sourceContext = {
      ...savedContext,
      osm_annotation_context: isPlainRecord(savedContext.osm_annotation_context)
        ? savedContext.osm_annotation_context
        : packageOsmContext,
    };
    const source = savedSource ?? {
      schema_version: "roadgen3d_scene_source_v1",
      source_id: annotation.plan_id || "imported_scene_package",
      kind: packageOsmContext ? "osm" : "annotation_json",
      producer: "import",
      normalized_annotation_version: annotation.version,
    };
    const geojson = saved?.geojson && isPlainRecord(saved.geojson) ? saved.geojson : null;
    const normalized: NormalizedSceneSource = {
      referenceAnnotation: cloneAnnotation(annotation),
      graph: saved?.graph && isPlainRecord(saved.graph) ? saved.graph : null,
      source,
      geojson,
      warnings: Array.isArray(saved?.warnings) ? saved.warnings.filter((item): item is string => typeof item === "string") : [],
      sourceContext,
      featureCounts: featureCountsForAnnotation(annotation),
      normalizedAt: typeof saved?.normalizedAt === "string" ? saved.normalizedAt : new Date().toISOString(),
    };
    workflow.setSourceDraft({
      kind: sourceContext.osm_annotation_context ? "osm" : "annotation_json",
      imageDataUrl: uploadedImageDataUrl.value || undefined,
      fileName,
      geojson,
    });
    workflow.setNormalizedSource(normalized);
    pendingOsmNormalization.value = null;
    professionalOsmStage.value = sourceContext.osm_annotation_context ? "annotation" : professionalOsmStage.value;
    return true;
  }

  function markProfessionalAnnotationDirty(): string {
    const { cloneAnnotation, courseMode, renderSourceWorkflow, state, workflow } = getContext();
    const fingerprint = comparableAnnotationSnapshot(state.annotation);
    if (courseMode) return fingerprint;
    workflow.setAnnotationDraft(cloneAnnotation(state.annotation), fingerprint);
    workflow.setAnnotationDraftStatus(fingerprint, "saving");
    renderSourceWorkflow();
    return fingerprint;
  }

  function markCenterlineOverlayEdited(centerline: AnnotatedCenterline): void {
    if (centerline.source_refs?.kind === "osm_road") {
      centerline.source_refs.edit_state = "modified";
    }
  }

  function scheduleAutoGraphConversion(delayMs = 900): void {
    const { autoGraphInFlight, autoGraphPending, autoGraphTimer } = getContext();
    if (!canConvertGraph()) {
      return;
    }
    if (autoGraphInFlight.value) {
      autoGraphPending.value = true;
      return;
    }
    if (autoGraphTimer.value !== null) {
      window.clearTimeout(autoGraphTimer.value);
    }
    autoGraphTimer.value = window.setTimeout(() => {
      autoGraphTimer.value = null;
      void runAutoGraphConversion();
    }, delayMs);
  }

  async function runAutoGraphConversion(): Promise<void> {
    const { autoGraphInFlight, autoGraphPending, convertAnnotationToGraph, courseMode, graphStatusEl, renderAll, setStatus, state, workflow } = getContext();
    if (!canConvertGraph()) {
      return;
    }
    if (autoGraphInFlight.value) {
      autoGraphPending.value = true;
      return;
    }
    autoGraphInFlight.value = true;
    autoGraphPending.value = false;
    const fingerprint = markProfessionalAnnotationDirty();
    if (!courseMode) workflow.setAnnotationDraftStatus(fingerprint, "validating");
    renderAll();
    try {
      const converted = await convertAnnotationToGraph({ automatic: true, expectedFingerprint: fingerprint });
      if (!courseMode && converted && state.graphResult) {
        workflow.setValidatedAnnotation(
          normalizedSourceForAnnotation(state.graphResult.annotation, state.graphResult.graph),
          fingerprint,
          { autoApprove: true },
        );
      } else if (!courseMode && !converted && comparableAnnotationSnapshot(state.annotation) === fingerprint) {
        workflow.setAnnotationDraftStatus(
          fingerprint,
          "validation_error",
          [graphStatusEl.textContent?.trim() || "Road graph validation failed."],
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to convert annotation.";
      setStatus(graphStatusEl, message, "error");
      if (!courseMode) workflow.setAnnotationDraftStatus(fingerprint, "validation_error", [message]);
    } finally {
      autoGraphInFlight.value = false;
      renderAll();
      if (autoGraphPending.value) {
        scheduleAutoGraphConversion();
      }
    }
  }

  async function deriveBuildingRegions(): Promise<void> {
    const { autoSplitRegionsButton, normalizeRegion, readApiErrorDetail, renderAll, setStatus, setTool, state, statusEl } = getContext();
    if (state.isDerivingRegions) {
      return;
    }
    if (!state.annotation.regions.some((region: AnnotatedRegion) => region.region_role === "scene_region")) {
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
    const { courseMode, graphStatusEl, graphSummaryEl, graphTextarea, setStatus, state, workflow } = getContext();
    state.graphResult = null;
    graphTextarea.value = "";
    graphSummaryEl.innerHTML = buildGraphSummaryMarkup(null);
    const shouldAutoConvert = options.autoConvert ?? true;
    if (!courseMode) {
      const fingerprint = markProfessionalAnnotationDirty();
      if (shouldAutoConvert && !canConvertGraph()) {
        const reason = translateViewerKey(loadViewerLanguage(), "sceneGraph.review.requiresRoad")
          ?? "Add at least one road centerline before validation.";
        workflow.setAnnotationDraftStatus(fingerprint, "validation_error", [reason]);
      }
    }
    setStatus(graphStatusEl, shouldAutoConvert && canConvertGraph() ? "Road graph will update automatically after edits." : reason, "neutral");
    if (shouldAutoConvert) {
      scheduleAutoGraphConversion();
    }
  }

  function selectedCenterline(): AnnotatedCenterline | null {
    const { state } = getContext();
    const feature = getSelectedFeature(state.annotation, state.selection);
    return state.selection?.kind === "centerline" && feature ? (feature as AnnotatedCenterline) : null;
  }

  function selectedStrip(centerline: AnnotatedCenterline | null = selectedCenterline()): AnnotatedCrossSectionStrip | null {
    const { state } = getContext();
    if (!centerline || !state.selectedStripId) {
      return null;
    }
    return centerline.cross_section_strips.find((strip) => strip.strip_id === state.selectedStripId) ?? null;
  }

  function clearFurniturePlacement(): void {
    const { state } = getContext();
    state.furniturePlacement = null;
  }

  function clearBranchDraft(): void {
    const { state } = getContext();
    state.branchHoverSnap = null;
    state.branchDraft = null;
  }

  function clearCrossDraft(): void {
    const { state } = getContext();
    state.crossHoverSnap = null;
    state.crossDraft = null;
  }

  function commitFunctionalZoneDraft(): void {
    const { renderAll, setStatus, state, statusEl } = getContext();
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
      points: points.map((p: AnnotationPoint) => ({ ...p })),
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
    const { regionBoxPoints, regionRoleLabel, renderAll, setStatus, state, statusEl } = getContext();
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
    const boundsWidth = Math.max(...points.map((point: AnnotationPoint) => point.x)) - Math.min(...points.map((point: AnnotationPoint) => point.x));
    const boundsHeight = Math.max(...points.map((point: AnnotationPoint) => point.y)) - Math.min(...points.map((point: AnnotationPoint) => point.y));
    if (Math.max(boundsWidth, boundsHeight) < 6) {
      state.drag = null;
      setStatus(statusEl, "Scene region box was too small. Drag to define the full scene boundary.", "neutral");
      renderAll();
      return;
    }
    const role = state.drag.regionRole;
    const id = nextFeatureId(
      state.annotation,
      role === "scene_region" ? "scene_region" : role === "building_region" ? "osm_building_footprint" : "region",
    );
    state.annotation.regions.push({
      id,
      label: role === "scene_region" ? "Scene Region" : role === "building_region" ? "OSM Building Footprint" : id,
      region_role: role,
      points: points.map((p: AnnotationPoint) => ({ ...p })),
      derived: false,
      material: role === "scene_region"
        ? { preset: "scene_region_boundary" }
        : role === "building_region"
          ? { preset: "osm_building_footprint_overlay", source_kind: "manual_osm_overlay" }
          : {},
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
    const { cloneAnnotation, renderSourceWorkflow, setStatus, state, statusEl, uploadedImageDataUrl, workflow } = getContext();
    state.derivedRegionsStale = true;
    clearGraphResult("Annotation changed. Road graph will refresh automatically.");
    const currentSource = workflow.getSnapshot();
    if (currentSource.normalized) {
      // Editing an OSM annotation changes only RoadGen3D's overlay. Keep the
      // immutable OSM snapshot, its projection and context massing intact;
      // setAnnotationDraft advances the revision and marks old 3D as stale.
      workflow.setAnnotationDraft(cloneAnnotation(state.annotation), comparableAnnotationSnapshot(state.annotation));
    } else {
      workflow.setSourceDraft({
        kind: currentSource.sourceKind === "osm" ? "osm" : "manual_annotation",
        imageDataUrl: uploadedImageDataUrl.value || undefined,
        fileName: state.annotation.image_path || undefined,
        geojson: currentSource.sourceGeojson,
      });
    }
    renderSourceWorkflow();
    if (statusMessage) {
      setStatus(statusEl, statusMessage, "success");
    }
  }

  function revealJunctionSurfaceLayers(): void {
    const { state } = getContext();
    state.showJunctionCore = true;
    state.showJunctionConnectors = true;
  }

  function revokeCurrentObjectUrl(): void {
    const { state } = getContext();
    if (state.currentObjectUrl) {
      URL.revokeObjectURL(state.currentObjectUrl);
      state.currentObjectUrl = "";
    }
  }

  function hasAnnotationCanvas(): boolean {
    const { state, workflow } = getContext();
    if (state.currentImageUrl) {
      return true;
    }
    const snapshot = workflow.getSnapshot();
    const { width, height } = annotationCanvasDimensions();
    if (width <= 0 || height <= 0) {
      return false;
    }
    return (
      snapshot.sourceKind === "osm" ||
      snapshot.sourceKind === "osm_buildings" ||
      Boolean(snapshot.normalized)
    );
  }

  function annotationCanvasDimensions(): { width: number; height: number } {
    const { OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX, state, workflow } = getContext();
    const explicitWidth = Math.max(0, Math.round(state.annotation.image_width_px));
    const explicitHeight = Math.max(0, Math.round(state.annotation.image_height_px));
    if (explicitWidth > 0 && explicitHeight > 0) {
      return { width: explicitWidth, height: explicitHeight };
    }

    const snapshot = workflow.getSnapshot();
    const isDirectOsm = snapshot.sourceKind === "osm" || snapshot.sourceKind === "osm_buildings";
    if (!isDirectOsm) {
      return { width: 0, height: 0 };
    }

    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let hasPoint = false;
    const trackPoint = (point: AnnotationPoint | null | undefined): void => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return;
      }
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      hasPoint = true;
    };

    for (const centerline of state.annotation.centerlines) {
      for (const point of centerline.points) {
        trackPoint(point);
      }
    }
    for (const junction of state.annotation.junctions) {
      trackPoint(junction);
    }
    for (const roundabout of state.annotation.roundabouts) {
      trackPoint(roundabout);
    }
    for (const controlPoint of state.annotation.control_points) {
      trackPoint(controlPoint);
    }
    for (const region of [...state.annotation.regions, ...(state.annotation.derived_regions ?? [])]) {
      for (const point of region.points) {
        trackPoint(point);
      }
    }
    for (const functionalZone of state.annotation.functional_zones) {
      for (const point of functionalZonePolygonPoints(functionalZone)) {
        trackPoint(point);
      }
    }
    for (const buildingRegion of state.annotation.building_regions) {
      for (const point of buildingRegionPolygonPoints(buildingRegion)) {
        trackPoint(point);
      }
    }

    if (!hasPoint) {
      return {
        width: OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX,
        height: OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX,
      };
    }

    return {
      width: Math.max(OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX, Math.ceil(maxX) + 1, 1),
      height: Math.max(OSM_DIRECT_CANVAS_FALLBACK_SIZE_PX, Math.ceil(maxY) + 1, 1),
    };
  }

  function annotationOsmBbox(): EditableWgs84Bbox | null {
    const { normalizedOsmBboxFromWorkflow } = getContext();
    return normalizedOsmBboxFromWorkflow();
  }

  function osmNativeFeatureCollection(): Record<string, unknown> | null {
    const { workflow } = getContext();
    const context = workflow.getSnapshot().normalized?.sourceContext.osm_annotation_context;
    const candidate = context && typeof context === "object"
      ? (context as Record<string, unknown>).raw_feature_collection
      : null;
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate as Record<string, unknown>;
    return record.type === "FeatureCollection" && Array.isArray(record.features) ? record : null;
  }

  function mountAnnotationOsmBackground(): void {
    const { annotationOsmMap, osmMapHostEl } = getContext();
    if (!osmMapHostEl || annotationOsmMap.value) return;
    const bbox = annotationOsmBbox();
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
            tiles: ["/api/geo/osm-tiles/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.72 } }],
      },
    });
    map.on("load", () => {
      const nativeFeatures = osmNativeFeatureCollection();
      if (!nativeFeatures || map.getSource("roadgen-osm-native")) return;
      map.addSource("roadgen-osm-native", { type: "geojson", data: nativeFeatures as never });
      map.addLayer({
        id: "roadgen-osm-native-casing",
        type: "line",
        source: "roadgen-osm-native",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#f8f1df", "line-width": 5.5, "line-opacity": 0.92 },
      });
      map.addLayer({
        id: "roadgen-osm-native-roads",
        type: "line",
        source: "roadgen-osm-native",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#476d80", "line-width": 2.25, "line-opacity": 0.92 },
      });
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 0, duration: 0, maxZoom: 19 });
    annotationOsmMap.value = map;
    window.requestAnimationFrame(() => map.resize());
  }

  function remountAnnotationOsmBackground(): void {
    const { annotationOsmMap, osmMapHostEl } = getContext();
    annotationOsmMap.value?.remove();
    annotationOsmMap.value = null;
    if (osmMapHostEl) osmMapHostEl.hidden = true;
    mountAnnotationOsmBackground();
  }

  function updateOsmPickerVisibility(): void {
    const { courseMode, osmPicker, osmPickerHostEl, osmRoadStudyPicker, professionalOsmStage, stageEl, workflow } = getContext();
    if (!osmPickerHostEl || courseMode) return;
    const snapshot = workflow.getSnapshot();
    const visible = professionalOsmStage.value !== "annotation"
      && (snapshot.step === "source" || !snapshot.normalized);
    osmPickerHostEl.hidden = !visible;
    stageEl.hidden = visible;
    const viewportShellEl = stageEl.closest<HTMLElement>(".scene-canvas-viewport-shell");
    if (viewportShellEl) viewportShellEl.dataset.osmPicker = String(visible);
    if (visible) window.requestAnimationFrame(() => {
      osmPicker.value?.resize();
      osmRoadStudyPicker.value?.resize();
    });
  }

  function syncViewportLayout(): void {
    const { annotationOsmMap, boardEl, stageEl, state, zoomSpaceEl } = getContext();
    const { width: imageWidth, height: imageHeight } = annotationCanvasDimensions();
    if (!hasAnnotationCanvas() || imageWidth <= 0 || imageHeight <= 0) {
      return;
    }
    const stageStyle = window.getComputedStyle(stageEl);
    const horizontalPadding = Number.parseFloat(stageStyle.paddingLeft || "0")
      + Number.parseFloat(stageStyle.paddingRight || "0");
    const viewportWidth = Math.max(1, stageEl.clientWidth - horizontalPadding);
    const baseWidth = viewportWidth;
    const baseHeight = baseWidth * imageHeight / imageWidth;
    const scaledWidth = baseWidth * state.viewportScale;
    const scaledHeight = baseHeight * state.viewportScale;
    const spaceWidth = Math.max(viewportWidth, scaledWidth);

    zoomSpaceEl.style.width = `${spaceWidth}px`;
    zoomSpaceEl.style.height = `${scaledHeight}px`;
    boardEl.style.width = `${baseWidth}px`;
    boardEl.style.height = `${baseHeight}px`;
    boardEl.style.left = `${Math.max(0, (spaceWidth - scaledWidth) / 2)}px`;
    boardEl.style.transform = `scale(${state.viewportScale})`;
    window.requestAnimationFrame(() => annotationOsmMap.value?.resize());
  }

  function renderViewportControls(): void {
    const { ANNOTATION_MAX_ZOOM, ANNOTATION_MIN_ZOOM, stageEl, state, zoomFitButton, zoomInButton, zoomLevelEl, zoomOutButton } = getContext();
    const hasCanvas = hasAnnotationCanvas();
    syncViewportLayout();
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
    requestedAnchorClientX?: number,
    requestedAnchorClientY?: number,
  ): void {
    const { ANNOTATION_MAX_ZOOM, ANNOTATION_MIN_ZOOM, boardEl, stageEl, state } = getContext();
    const stageRect = stageEl.getBoundingClientRect();
    const anchorClientX = requestedAnchorClientX ?? stageRect.left + stageEl.clientWidth / 2;
    const anchorClientY = requestedAnchorClientY ?? stageRect.top + stageEl.clientHeight / 2;
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
    const nextBoardRect = boardEl.getBoundingClientRect();
    stageEl.scrollLeft += nextBoardRect.left + boardPointX * nextScale - anchorX;
    stageEl.scrollTop += nextBoardRect.top + boardPointY * nextScale - anchorY;
  }

  function resetViewport(): void {
    const { stageEl, state } = getContext();
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
    const { stageEl, state } = getContext();
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

  function isOsmDerivedCenterline(centerline: AnnotatedCenterline): boolean {
    const { workflow } = getContext();
    const snapshot = workflow.getSnapshot();
    const sourceRefs = centerline.source_refs ?? {};
    const osmWayIds = Array.isArray(sourceRefs.osm_way_ids) ? sourceRefs.osm_way_ids : [];
    const parentOsmWayIds = Array.isArray(sourceRefs.parent_osm_way_ids) ? sourceRefs.parent_osm_way_ids : [];
    return (
      snapshot.sourceKind === "osm" ||
      snapshot.sourceKind === "osm_buildings" ||
      centerline.source_refs?.kind === "osm_road" ||
      osmWayIds.length > 0 ||
      parentOsmWayIds.length > 0
    );
  }

  function resolveCompatibleFurnitureStripForRoad(centerline: AnnotatedCenterline): AnnotatedCrossSectionStrip | null {
    if (!isOsmDerivedCenterline(centerline)) {
      return centerline.cross_section_strips.find((strip) => FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) ?? null;
    }

    const existingCompatible = centerline.cross_section_strips.find((strip) => FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind));
    if (existingCompatible) {
      return existingCompatible;
    }
    if (centerline.street_furniture_instances.length > 0) {
      return null;
    }

    ensureDetailedCrossSection(centerline);
    return centerline.cross_section_strips.find((strip) => FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind)) ?? null;
  }

  function ensureCompatibleFurnitureStripsForCurrentAnnotation(): void {
    const { state } = getContext();
    for (const centerline of state.annotation.centerlines) {
      if (!isOsmDerivedCenterline(centerline)) {
        continue;
      }
      if (centerline.street_furniture_instances.length > 0) {
        continue;
      }
      const hasCompatibleStrip = centerline.cross_section_strips.some((strip: AnnotatedCrossSectionStrip) => FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind));
      if (!hasCompatibleStrip) {
        ensureDetailedCrossSection(centerline);
      }
    }
  }

  function updateStageVisibility(): void {
    const { DEFAULT_REFERENCE_IMAGE_LOADING_MESSAGE, boardEl, originalImageEl, overlayHostEl, stageEl, stageEmptyEl, state, zoomSpaceEl } = getContext();
    const hasImage = Boolean(state.currentImageUrl);
    const hasCanvas = hasAnnotationCanvas();
    const { width: canvasWidth, height: canvasHeight } = annotationCanvasDimensions();
    stageEl.dataset.hasImage = hasImage ? "true" : "false";
    stageEl.dataset.hasCanvas = hasCanvas ? "true" : "false";
    const viewportShellEl = stageEl.closest<HTMLElement>(".scene-canvas-viewport-shell");
    if (viewportShellEl) viewportShellEl.dataset.hasCanvas = hasCanvas ? "true" : "false";
    stageEl.dataset.loading = state.isReferenceImageLoading ? "true" : "false";
    stageEl.dataset.emptyState = hasCanvas ? "ready" : state.isReferenceImageLoading ? "loading" : "empty";
    zoomSpaceEl.hidden = !hasCanvas;
    boardEl.hidden = !hasCanvas;
    boardEl.style.aspectRatio = hasCanvas
      ? `${canvasWidth} / ${canvasHeight}`
      : "";
    stageEmptyEl.hidden = hasCanvas;
    if (hasCanvas) window.requestAnimationFrame(syncViewportLayout);
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
    updateOsmPickerVisibility();
    renderViewportControls();
  }

  function syncJsonTextarea(force = false): void {
    const { jsonTextarea, state } = getContext();
    if (!force && document.activeElement === jsonTextarea) {
      return;
    }
    jsonTextarea.value = stringifyAnnotation(state.annotation);
  }

  function renderToolButtons(): void {
    const { autoSplitRegionsButton, state, toolButtons, workflow } = getContext();
    const isDirectOsm = workflow.getSnapshot().sourceKind === "osm" || workflow.getSnapshot().sourceKind === "osm_buildings";
    for (const button of toolButtons) {
      button.dataset.active = button.dataset.tool === state.selectedTool ? "true" : "false";
      if (["functional_zone", "surface_annotation"].includes(button.dataset.tool ?? "")) {
        button.hidden = isDirectOsm;
      }
    }
    autoSplitRegionsButton.hidden = isDirectOsm;
    autoSplitRegionsButton.disabled = isDirectOsm || state.isDerivingRegions;
    autoSplitRegionsButton.dataset.active = state.isDerivingRegions ? "true" : "false";
    autoSplitRegionsButton.title = state.derivedRegionsStale
      ? "Building regions are stale. Auto Split will recompute from scene region and roads."
      : "Auto split building regions from the scene region.";
  }

  function mergeReferencePlans(items: ReferencePlan[]): void {
    const { state } = getContext();
    const byId = new Map<string, ReferencePlan>();
    for (const plan of [...state.referencePlans, ...items]) {
      byId.set(plan.plan_id, plan);
    }
    state.referencePlans = Array.from(byId.values());
  }

  function renderReferencePlanOptions(preferredPlanId?: string): void {
    const { escapeHtml, planSelect, state } = getContext();
    const options = [
      `<option value="">Choose a reference plan</option>`,
      ...state.referencePlans.map(
        (plan: ReferencePlan) => `<option value="${escapeHtml(plan.plan_id)}">${escapeHtml(plan.label || plan.plan_id)}</option>`,
      ),
    ];
    planSelect.innerHTML = options.join("");
    const resolvedPlanId =
      (preferredPlanId && state.referencePlans.some((plan: ReferencePlan) => plan.plan_id === preferredPlanId) ? preferredPlanId : "") ||
      (state.annotation.plan_id && state.referencePlans.some((plan: ReferencePlan) => plan.plan_id === state.annotation.plan_id)
        ? state.annotation.plan_id
        : "");
    planSelect.value = resolvedPlanId;
  }

  function scenarioDesignSelects(): HTMLSelectElement[] {
    return [];
  }

  function renderScenarioDesignOptions(preferredScenarioId?: string): void {
    const { escapeHtml, state } = getContext();
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
        (item: ScenarioDesign) => {
          const enabled = item.enabled !== false;
          const label = enabled
            ? (item.title_zh || item.scenario_id)
            : `${item.title_zh || item.scenario_id}（已忽略）`;
          return `<option value="${escapeHtml(item.scenario_id)}" ${enabled ? "" : "disabled"}>${escapeHtml(label)}</option>`;
        },
      ),
    ];
    const resolvedScenarioId =
      (preferredScenarioId && state.scenarioDesigns.some((item: ScenarioDesign) => item.scenario_id === preferredScenarioId && item.enabled !== false)
        ? preferredScenarioId
        : "") ||
      (state.selectedScenarioId && state.scenarioDesigns.some((item: ScenarioDesign) => item.scenario_id === state.selectedScenarioId && item.enabled !== false)
        ? state.selectedScenarioId
        : "");
    for (const selectEl of scenarioDesignSelects()) {
      selectEl.innerHTML = options.join("");
      selectEl.value = resolvedScenarioId;
      selectEl.disabled = loading || unavailable || state.isScenarioDesignAnnotationLoading || state.scenarioDesigns.length === 0;
      selectEl.title = unavailable ? state.scenarioDesignsError : "";
    }
  }

  return { comparableAnnotationSnapshot, updateCleanAnnotationSnapshot, isAnnotationDirty, canConvertGraph, featureCountsForAnnotation, normalizedSourceForAnnotation, isPlainRecord, buildScenePackage, restoreScenePackage, markProfessionalAnnotationDirty, markCenterlineOverlayEdited, scheduleAutoGraphConversion, runAutoGraphConversion, deriveBuildingRegions, clearGraphResult, selectedCenterline, selectedStrip, clearFurniturePlacement, clearBranchDraft, clearCrossDraft, commitFunctionalZoneDraft, commitRegionDraft, markAnnotationChanged, revealJunctionSurfaceLayers, revokeCurrentObjectUrl, hasAnnotationCanvas, annotationCanvasDimensions, annotationOsmBbox, osmNativeFeatureCollection, mountAnnotationOsmBackground, remountAnnotationOsmBackground, updateOsmPickerVisibility, syncViewportLayout, renderViewportControls, setViewportScale, resetViewport, isEditableKeyboardTarget, beginViewportPan, isOsmDerivedCenterline, resolveCompatibleFurnitureStripForRoad, ensureCompatibleFurnitureStripsForCurrentAnnotation, updateStageVisibility, syncJsonTextarea, renderToolButtons, mergeReferencePlans, renderReferencePlanOptions, scenarioDesignSelects, renderScenarioDesignOptions };
}
