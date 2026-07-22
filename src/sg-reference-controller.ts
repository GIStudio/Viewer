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

export type SgReferenceControllerContext = {
  annotationCanvasDimensions: () => { width: number; height: number; };
  clearBranchDraft: () => void;
  clearCrossDraft: () => void;
  clearFurniturePlacement: () => void;
  clearGraphResult: (reason: string, options?: { autoConvert?: boolean; }) => void;
  courseMode: boolean;
  deriveBuildingRegions: () => Promise<void>;
  hasAnnotationCanvas: () => boolean;
  mergeReferencePlans: (items: ReferencePlan[]) => void;
  normalizeAnnotation: (value: unknown) => ReferenceAnnotation;
  originalImageEl: HTMLImageElement;
  overlayHostEl: HTMLElement;
  pendingOsmNormalization: { value: NormalizedSceneSourceResponse | null; };
  professionalOsmStage: { value: "aoi" | "progress" | "study" | "annotation"; };
  readApiErrorDetail: (response: Response) => Promise<string>;
  renderAll: () => void;
  renderReferencePlanOptions: (preferredPlanId?: string) => void;
  renderScenarioDesignOptions: (preferredScenarioId?: string) => void;
  renderSourceWorkflow: () => void;
  resetViewport: () => void;
  resolveApiUrl: (path: string) => string;
  setStatus: (element: HTMLElement, message: SceneGraphStatusText, tone: StatusTone) => void;
  signal: AbortSignal;
  state: any;
  statusEl: HTMLElement;
  updateCleanAnnotationSnapshot: () => void;
  updateOsmPickerVisibility: () => void;
  uploadedImageDataUrl: { value: string; };
  workflow: WorkflowController;
};

export function createSgReferenceController(getContext: () => SgReferenceControllerContext) {
  function setTool(tool: Tool): void {
    const { clearBranchDraft, clearCrossDraft, clearFurniturePlacement, renderAll, setStatus, state, statusEl, workflow } = getContext();
    const isDirectOsm = workflow.getSnapshot().sourceKind === "osm" || workflow.getSnapshot().sourceKind === "osm_buildings";
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
    } else if (tool === "building_region" && isDirectOsm) {
      setStatus(statusEl, "OSM 建筑足迹工具：逐点绘制新的建筑足迹多边形；双击或按 Enter 完成。该足迹仅保存到 RoadGen3D 覆盖层，并参与 3D 生成。", "neutral");
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
    const { annotationCanvasDimensions, hasAnnotationCanvas, overlayHostEl } = getContext();
    if (!hasAnnotationCanvas()) {
      return null;
    }
    const { width, height } = annotationCanvasDimensions();
    if (width <= 0 || height <= 0) {
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
    const x = clamp(((event.clientX - rect.left) / rect.width) * width, 0, width);
    const y = clamp(((event.clientY - rect.top) / rect.height) * height, 0, height);
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
    const { clearBranchDraft, clearCrossDraft, clearFurniturePlacement, clearGraphResult, originalImageEl, renderAll, resetViewport, resolveApiUrl, setStatus, state, statusEl } = getContext();
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
    const { state } = getContext();
    if (!state.currentImageUrl) {
      return "";
    }
    if (state.currentImageUrl.startsWith(API_BASE)) {
      return state.currentImageUrl.slice(API_BASE.length) || state.currentImageUrl;
    }
    return state.currentImageUrl;
  }

  function bindAnnotationToCurrentReferenceImage(fallbackImagePath = ""): boolean {
    const { originalImageEl, state } = getContext();
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
    const { clearGraphResult, renderAll, setStatus, state, statusEl } = getContext();
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
    const { courseMode, pendingOsmNormalization, professionalOsmStage, renderAll, renderScenarioDesignOptions, renderSourceWorkflow, setStatus, state, statusEl, updateCleanAnnotationSnapshot, updateOsmPickerVisibility, uploadedImageDataUrl, workflow } = getContext();
    const plan = state.referencePlans.find((item: ReferencePlan) => item.plan_id === planId);
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
      if (!courseMode) {
        professionalOsmStage.value = "annotation";
        updateOsmPickerVisibility();
      }
      setStatus(statusEl, `Selected reference plan ${planId}, but no image URL was provided.`, "neutral");
      renderAll();
      return;
    }
    await loadImageFromUrl(plan.image_url, { planId: plan.plan_id, preserveFeatures: false });
    state.selectedScenarioId = "";
    updateCleanAnnotationSnapshot();
    renderScenarioDesignOptions();
    uploadedImageDataUrl.value = "";
    pendingOsmNormalization.value = null;
    workflow.setSourceDraft({
      kind: "reference_image",
      imageDataUrl: null,
      fileName: plan.image_url,
      geojson: null,
    });
    if (!courseMode) {
      professionalOsmStage.value = "annotation";
      updateOsmPickerVisibility();
    }
    renderSourceWorkflow();
  }

  async function loadReferencePlans(options: { silent?: boolean } = {}): Promise<void> {
    const { mergeReferencePlans, renderAll, renderReferencePlanOptions, signal, state } = getContext();
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
      renderReferencePlanOptions(state.annotation.plan_id || undefined);
      renderAll();
    } finally {
      window.clearTimeout(timeoutId);
      if (!silent) {
        state.isReferenceImageLoading = false;
      }
    }
  }

  async function loadScenarioDesigns(options: { silent?: boolean } = {}): Promise<void> {
    const { readApiErrorDetail, renderScenarioDesignOptions, setStatus, signal, state, statusEl, workflow } = getContext();
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
      state.scenarioGraphTemplateId = String(catalogPayload.graph_template_id || "").trim();
      state.scenarioDesigns = Array.isArray(catalogPayload.items) ? catalogPayload.items : [];
      state.scenarioDesignsError = "";
      renderScenarioDesignOptions(state.selectedScenarioId);
      const pendingScenario = workflow.getSnapshot();
      if (
        pendingScenario.sourceKind === "scenario_design"
        && !pendingScenario.normalized
        && pendingScenario.sourceFileName
        && state.scenarioDesigns.some((item: ScenarioDesign) => item.scenario_id === pendingScenario.sourceFileName && item.enabled !== false)
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
    const { clearBranchDraft, clearCrossDraft, clearFurniturePlacement, state } = getContext();
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
    const { clearGraphResult, deriveBuildingRegions, normalizeAnnotation, renderAll, renderReferencePlanOptions, renderScenarioDesignOptions, renderSourceWorkflow, setStatus, state, statusEl, updateCleanAnnotationSnapshot, uploadedImageDataUrl, workflow } = getContext();
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
        imageDataUrl: uploadedImageDataUrl.value || undefined,
        fileName: scenarioId,
        geojson: null,
      });
      renderSourceWorkflow();
      if (state.annotation.regions.some((region: AnnotatedRegion) => region.region_role === "scene_region")) {
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
    const { renderScenarioDesignOptions, setStatus, state, statusEl } = getContext();
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
    const { readApiErrorDetail, renderScenarioDesignOptions, setStatus, signal, state, statusEl } = getContext();
    const scenario = state.scenarioDesigns.find((item: ScenarioDesign) => item.scenario_id === scenarioId);
    const label = scenario?.title_zh || scenarioId;
    if (scenario?.enabled === false) {
      throw new Error(scenario.excluded_reason_zh || "This scenario design is excluded from the current default workflow.");
    }
    const graphTemplateId = state.scenarioGraphTemplateId.trim();
    if (!graphTemplateId) {
      throw new Error("This scenario catalog does not declare a graph_template_id. Select a reference template explicitly before loading the scenario.");
    }
    state.isScenarioDesignAnnotationLoading = true;
    renderScenarioDesignOptions(scenarioId);
    setStatus(statusEl, `Loading scenario design: ${label}...`, "neutral");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `${API_BASE}/api/scenario-designs/${encodeURIComponent(scenarioId)}/reference-annotation?graph_template_id=${encodeURIComponent(graphTemplateId)}`,
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

  return { setTool, imagePointFromPointer, loadImageFromUrl, currentReferenceImagePathForAnnotation, bindAnnotationToCurrentReferenceImage, reconcileImportedAnnotationReferenceImage, applyReferencePlan, loadReferencePlans, loadScenarioDesigns, clearAnnotationEditingState, applyScenarioAnnotationPayload, applyScenarioDraftAnnotation, applyScenarioDesignAnnotation };
}
