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

export type SgEventBinderContext = {
  ANNOTATION_ZOOM_STEP: 1.25;
  applyJsonButton: HTMLButtonElement;
  applyReferencePlan: (planId: string) => Promise<void>;
  applyScenarioDesignAnnotation: (scenarioId: string) => Promise<void>;
  autoGraphTimer: { value: number | null; };
  autoSplitRegionsButton: HTMLButtonElement;
  beginBranchFromSnap: (snap: BranchSnapTarget) => void;
  beginCrossFromSnap: (snap: BranchSnapTarget) => void;
  beginViewportPan: (event: PointerEvent) => boolean;
  buildScenePackage: () => Record<string, unknown>;
  clearAnnotationEditingState: () => void;
  clearBranchDraft: () => void;
  clearCrossDraft: () => void;
  clearFurniturePlacement: () => void;
  clearGraphResult: (reason: string, options?: { autoConvert?: boolean; }) => void;
  cloneAnnotation: (annotation: ReferenceAnnotation) => ReferenceAnnotation;
  closeGenerationConfiguration: () => void;
  commitBranchAtPoint: (point: AnnotationPoint) => void;
  commitCrossAtPoint: (point: AnnotationPoint) => void;
  commitFunctionalZoneDraft: () => void;
  commitRegionDraft: () => void;
  convertAnnotationToGraph: (options?: { automatic?: boolean; expectedFingerprint?: string; }) => Promise<boolean>;
  convertGraphButton: HTMLButtonElement;
  copyJsonButton: HTMLButtonElement;
  courseMode: boolean;
  createStandaloneCrossAtPoint: (anchorPoint: AnnotationPoint) => void;
  createSurfaceAnnotationAtPoint: (point: AnnotationPoint, hit: Selection) => void;
  deleteSelectedButton: HTMLButtonElement;
  deleteSelection: () => void;
  deriveBuildingRegions: () => Promise<void>;
  downloadGraphButton: HTMLButtonElement;
  downloadJsonButton: HTMLButtonElement;
  downloadText: (filename: string, text: string) => void;
  ensureCompatibleFurnitureStripsForCurrentAnnotation: () => void;
  extractCurrentReferenceImage: () => Promise<void>;
  finalizeDraftCenterline: () => void;
  finishCenterlineButton: HTMLButtonElement;
  generateApprovedScene: () => Promise<void>;
  generationConfirmCancelButton: HTMLButtonElement | null;
  generationConfirmDialog: HTMLElement | null;
  generationConfirmOpenButton: HTMLButtonElement | null;
  graphStatusEl: HTMLElement;
  hasAnnotationCanvas: () => boolean;
  imageInput: HTMLInputElement;
  imagePointFromPointer: (event: PointerEvent) => AnnotationPoint | null;
  imageResetButton: HTMLButtonElement;
  isAnnotationDirty: () => boolean;
  isEditableKeyboardTarget: (target: EventTarget | null) => boolean;
  jsonFileInput: HTMLInputElement;
  jsonTextarea: HTMLTextAreaElement;
  loadImageFromUrl: (imageUrl: string, options: { planId: string; preserveFeatures: boolean; preserveCurrentOnError?: boolean; }) => Promise<void>;
  markAnnotationChanged: (statusMessage?: string) => void;
  markCenterlineOverlayEdited: (centerline: AnnotatedCenterline) => void;
  mountProfessionalAoiPicker: () => void;
  normalizeAngleDeg: (value: number) => number;
  normalizeAnnotation: (value: unknown) => ReferenceAnnotation;
  normalizeCurrentSceneSource: () => Promise<void>;
  normalizedOsmBboxFromWorkflow: () => EditableWgs84Bbox | null;
  openExistingProfessionalScene: () => Promise<void>;
  openGenerationConfiguration: () => Promise<void>;
  originalImageEl: HTMLImageElement;
  originalOpacityInput: HTMLInputElement;
  overlayHostEl: HTMLElement;
  overlayOpacityInput: HTMLInputElement;
  pendingOsmNormalization: { value: NormalizedSceneSourceResponse | null; };
  pixelsPerMeterInput: HTMLInputElement;
  placeFurnitureAtPoint: (point: AnnotationPoint) => boolean;
  placeFurnitureQuick: (point: AnnotationPoint, kind: FurnitureKind) => boolean;
  planSelect: HTMLSelectElement;
  professionalOsmSelection: { value: OsmAoiSelection | null; };
  readImageFileDataUrl: (file: File) => Promise<string>;
  reconcileImportedAnnotationReferenceImage: (actionPast: "Imported" | "Applied", fallbackImagePath?: string) => Promise<void>;
  remountAnnotationOsmBackground: () => void;
  renderAll: () => void;
  renderOverlay: () => void;
  renderReferencePlanOptions: (preferredPlanId?: string) => void;
  renderScenarioDesignOptions: (preferredScenarioId?: string) => void;
  renderSourceWorkflow: () => void;
  renderViewportControls: () => void;
  resetAnnotation: () => void;
  resetAnnotationButton: HTMLButtonElement;
  resetViewport: () => void;
  restoreScenePackage: (value: unknown, annotation: ReferenceAnnotation, fileName: string) => boolean;
  revokeCurrentObjectUrl: () => void;
  root: HTMLElement;
  roundaboutRadiusInput: HTMLInputElement;
  scenarioDesignSelects: () => HTMLSelectElement[];
  segmentLengthInput: HTMLInputElement;
  selectAllRoadsButton: HTMLButtonElement;
  setStatus: (element: HTMLElement, message: SceneGraphStatusText, tone: StatusTone) => void;
  setTool: (tool: Tool) => void;
  setViewportScale: (requestedScale: number, requestedAnchorClientX?: number, requestedAnchorClientY?: number) => void;
  shell: DesktopShell;
  showAnnotationLabelsInput: HTMLInputElement;
  showJunctionBoundariesInput: HTMLInputElement;
  showJunctionConnectorsInput: HTMLInputElement;
  showJunctionCoreInput: HTMLInputElement;
  showJunctionCrosswalksInput: HTMLInputElement;
  showJunctionDebugInput: HTMLInputElement;
  showJunctionLabelsInput: HTMLInputElement;
  showJunctionOutlinesInput: HTMLInputElement;
  showOriginalInput: HTMLInputElement;
  showOsmLabelsInput: HTMLInputElement;
  showOverlayInput: HTMLInputElement;
  sidewalkWidthInput: HTMLInputElement;
  signal: AbortSignal;
  snapToRoadInput: HTMLInputElement;
  sourceAiExtractButton: HTMLButtonElement;
  sourceBackButton: HTMLButtonElement;
  sourceGenerateButton: HTMLButtonElement;
  sourceGeojsonInput: HTMLInputElement;
  sourceImageImportButton: HTMLButtonElement;
  sourceNormalizeButton: HTMLButtonElement;
  sourceOpenAnnotationToolsButton: HTMLButtonElement;
  sourceOpenExistingButton: HTMLButtonElement;
  sourceStatusEl: HTMLElement;
  stageEl: HTMLElement;
  state: any;
  statusEl: HTMLElement;
  statusTextFromImageLoadError: (error: unknown, fallbackKey: string, fallback: string) => SceneGraphStatusText;
  syncSelectionAfterMutation: () => void;
  syncViewportLayout: () => void;
  toolButtons: HTMLButtonElement[];
  undoPointButton: HTMLButtonElement;
  updateBranchPreview: (point: AnnotationPoint | null) => void;
  updateCleanAnnotationSnapshot: () => void;
  updateCrossPreview: (point: AnnotationPoint | null) => void;
  updateOsmPickerVisibility: () => void;
  updateStageVisibility: () => void;
  uploadedImageDataUrl: { value: string; };
  workflow: WorkflowController;
  zoomFitButton: HTMLButtonElement;
  zoomInButton: HTMLButtonElement;
  zoomOutButton: HTMLButtonElement;
};

export function createSgEventBinder(getContext: () => SgEventBinderContext) {
  function bindSceneGraphEvents(): void {
    const { ANNOTATION_ZOOM_STEP, applyJsonButton, applyReferencePlan, applyScenarioDesignAnnotation, autoGraphTimer, autoSplitRegionsButton, beginBranchFromSnap, beginCrossFromSnap, beginViewportPan, buildScenePackage, clearAnnotationEditingState, clearBranchDraft, clearCrossDraft, clearFurniturePlacement, clearGraphResult, cloneAnnotation, closeGenerationConfiguration, commitBranchAtPoint, commitCrossAtPoint, commitFunctionalZoneDraft, commitRegionDraft, convertAnnotationToGraph, convertGraphButton, copyJsonButton, courseMode, createStandaloneCrossAtPoint, createSurfaceAnnotationAtPoint, deleteSelectedButton, deleteSelection, deriveBuildingRegions, downloadGraphButton, downloadJsonButton, downloadText, ensureCompatibleFurnitureStripsForCurrentAnnotation, extractCurrentReferenceImage, finalizeDraftCenterline, finishCenterlineButton, generateApprovedScene, generationConfirmCancelButton, generationConfirmDialog, generationConfirmOpenButton, graphStatusEl, hasAnnotationCanvas, imageInput, imagePointFromPointer, imageResetButton, isAnnotationDirty, isEditableKeyboardTarget, jsonFileInput, jsonTextarea, loadImageFromUrl, markAnnotationChanged, markCenterlineOverlayEdited, mountProfessionalAoiPicker, normalizeAngleDeg, normalizeAnnotation, normalizeCurrentSceneSource, normalizedOsmBboxFromWorkflow, openExistingProfessionalScene, openGenerationConfiguration, originalImageEl, originalOpacityInput, overlayHostEl, overlayOpacityInput, pendingOsmNormalization, pixelsPerMeterInput, placeFurnitureAtPoint, placeFurnitureQuick, planSelect, professionalOsmSelection, readImageFileDataUrl, reconcileImportedAnnotationReferenceImage, remountAnnotationOsmBackground, renderAll, renderOverlay, renderReferencePlanOptions, renderScenarioDesignOptions, renderSourceWorkflow, renderViewportControls, resetAnnotation, resetAnnotationButton, resetViewport, restoreScenePackage, revokeCurrentObjectUrl, root, roundaboutRadiusInput, scenarioDesignSelects, segmentLengthInput, selectAllRoadsButton, setStatus, setTool, setViewportScale, shell, showAnnotationLabelsInput, showJunctionBoundariesInput, showJunctionConnectorsInput, showJunctionCoreInput, showJunctionCrosswalksInput, showJunctionDebugInput, showJunctionLabelsInput, showJunctionOutlinesInput, showOriginalInput, showOsmLabelsInput, showOverlayInput, sidewalkWidthInput, signal, snapToRoadInput, sourceAiExtractButton, sourceBackButton, sourceGenerateButton, sourceGeojsonInput, sourceImageImportButton, sourceNormalizeButton, sourceOpenAnnotationToolsButton, sourceOpenExistingButton, sourceStatusEl, stageEl, state, statusEl, statusTextFromImageLoadError, syncSelectionAfterMutation, syncViewportLayout, toolButtons, undoPointButton, updateBranchPreview, updateCleanAnnotationSnapshot, updateCrossPreview, updateOsmPickerVisibility, updateStageVisibility, uploadedImageDataUrl, workflow, zoomFitButton, zoomInButton, zoomOutButton } = getContext();


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
        pendingOsmNormalization.value = null;
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
  sourceBackButton.addEventListener(
    "click",
    () => {
      workflow.transition("source");
      const sourceBbox = normalizedOsmBboxFromWorkflow();
      if (sourceBbox) {
        professionalOsmSelection.value = { bbox: [...sourceBbox], source: "coordinates" };
      }
      mountProfessionalAoiPicker();
      shell.activateRightTab("source");
      renderSourceWorkflow();
      updateOsmPickerVisibility();
    },
    { signal },
  );
  sourceOpenAnnotationToolsButton.addEventListener(
    "click",
    () => {
      shell.setBottomOpen(true);
      setTool("select");
      const annotationTools = root.querySelector<HTMLElement>("#annotation-tools-actions-slot");
      annotationTools?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      annotationTools?.querySelector<HTMLButtonElement>("#annotation-tool-select")?.focus({ preventScroll: true });
      setStatus(statusEl, "OSM 地图数据已作为基础标注载入。请在专业工具 · 标记中继续补充或调整。", "success");
    },
    { signal },
  );
  sourceGenerateButton.addEventListener(
    "click",
    () => void (courseMode ? generateApprovedScene() : openGenerationConfiguration()),
    { signal },
  );
  sourceOpenExistingButton.addEventListener("click", () => void openExistingProfessionalScene(), { signal });
  generationConfirmOpenButton?.addEventListener(
    "click",
    () => {
      if (generationConfirmDialog) generationConfirmDialog.hidden = true;
      void generateApprovedScene();
    },
    { signal },
  );
  generationConfirmCancelButton?.addEventListener("click", closeGenerationConfiguration, { signal });
  generationConfirmDialog?.querySelector<HTMLElement>("[data-close-scene-generation]")?.addEventListener(
    "click",
    closeGenerationConfiguration,
    { signal },
  );

  imageInput.addEventListener(
    "change",
    async () => {
      const file = imageInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        uploadedImageDataUrl.value = await readImageFileDataUrl(file);
        revokeCurrentObjectUrl();
        state.currentObjectUrl = URL.createObjectURL(file);
        await loadImageFromUrl(state.currentObjectUrl, { planId: "custom_upload", preserveFeatures: false });
        state.annotation.image_path = file.name;
        state.selectedScenarioId = "";
        planSelect.value = "";
        workflow.setSourceDraft({
          kind: "reference_image",
          imageDataUrl: uploadedImageDataUrl.value,
          fileName: file.name,
          geojson: null,
        });
        pendingOsmNormalization.value = null;
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
      uploadedImageDataUrl.value = "";
      pendingOsmNormalization.value = null;
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
  showOsmLabelsInput.addEventListener(
    "change",
    () => {
      state.showOsmLabels = showOsmLabelsInput.checked;
      renderOverlay();
    },
    { signal },
  );
  showAnnotationLabelsInput.addEventListener(
    "change",
    () => {
      state.showAnnotationLabels = showAnnotationLabelsInput.checked;
      renderOverlay();
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
  const annotationResizeObserver = new ResizeObserver(() => syncViewportLayout());
  annotationResizeObserver.observe(stageEl);
  signal.addEventListener("abort", () => annotationResizeObserver.disconnect(), { once: true });
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
          (state.annotation.junctions.find((item: AnnotatedJunction) => item.id === hit.id)?.source_mode ?? "legacy_marker") !== "explicit"
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
        const isDirectOsm = workflow.getSnapshot().sourceKind === "osm" || workflow.getSnapshot().sourceKind === "osm_buildings";
        if (isDirectOsm) {
          state.selection = null;
          state.selectedStripId = null;
          clearFurniturePlacement();
          if (state.drag?.kind === "region_draw" && state.drag.regionRole === "building_region") {
            state.drag = {
              ...state.drag,
              points: [...state.drag.points, point],
            };
          } else {
            state.drag = {
              kind: "region_draw",
              pointerId: event.pointerId,
              regionRole: "building_region",
              points: [point],
              currentPoint: point,
            };
          }
          renderAll();
          return;
        }
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
        markAnnotationChanged(`Added control point ${id}.`);
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
        markAnnotationChanged(`Added roundabout ${id}.`);
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
        const centerline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === state.previewResize?.centerlineId);
        const leftStrip = centerline?.cross_section_strips.find((strip: AnnotatedCrossSectionStrip) => strip.strip_id === state.previewResize?.leftStripId);
        const rightStrip = centerline?.cross_section_strips.find((strip: AnnotatedCrossSectionStrip) => strip.strip_id === state.previewResize?.rightStripId);
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
        const centerline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === drag.id);
        if (!centerline) {
          return;
        }
        if (!centerline.points[drag.vertexIndex]) {
          return;
        }
        centerline.points[drag.vertexIndex] = point;
        markCenterlineOverlayEdited(centerline);
      } else if (drag.kind === "building_region_translate") {
        const region = state.annotation.building_regions.find((item: AnnotatedBuildingRegion) => item.id === drag.id);
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
        const region = state.annotation.building_regions.find((item: AnnotatedBuildingRegion) => item.id === drag.id);
        if (!region) {
          return;
        }
        const localPoint = buildingRegionLocalPoint(region, point);
        region.width_px = Math.max(BUILDING_REGION_MIN_SIZE_PX, Math.abs(localPoint.x) * 2.0);
        region.height_px = Math.max(BUILDING_REGION_MIN_SIZE_PX, Math.abs(localPoint.y) * 2.0);
      } else if (drag.kind === "building_region_rotate") {
        const region = state.annotation.building_regions.find((item: AnnotatedBuildingRegion) => item.id === drag.id);
        if (!region) {
          return;
        }
        const yawRad = Math.atan2(region.center_px.x - point.x, region.center_px.y - point.y);
        region.yaw_deg = normalizeAngleDeg((yawRad * 180) / Math.PI);
      } else if (drag.kind === "centerline_translate") {
        const centerline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === drag.id);
        if (!centerline) {
          return;
        }
        const deltaX = point.x - drag.lastPoint.x;
        const deltaY = point.y - drag.lastPoint.y;
        centerline.points = centerline.points.map((vertex: AnnotationPoint) => ({
          x: vertex.x + deltaX,
          y: vertex.y + deltaY,
        }));
        drag.lastPoint = point;
        markCenterlineOverlayEdited(centerline);
      } else {
        if (drag.markerKind === "junction") {
          const marker = state.annotation.junctions.find((item: AnnotatedJunction) => item.id === drag.id);
          if (marker) {
            marker.x = point.x;
            marker.y = point.y;
          }
        } else if (drag.markerKind === "roundabout") {
          const marker = state.annotation.roundabouts.find((item: AnnotatedRoundabout) => item.id === drag.id);
          if (marker) {
            marker.x = point.x;
            marker.y = point.y;
          }
        } else {
          const marker = state.annotation.control_points.find((item: AnnotatedMarker) => item.id === drag.id);
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
        if (state.drag.kind === "functional_zone_draw" || state.drag.kind === "region_draw") {
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
        const parsed = JSON.parse(text);
        const annotation = normalizeAnnotation(parsed);
        const fallbackImagePath = state.annotation.image_path;
        state.annotation = annotation;
        ensureCompatibleFurnitureStripsForCurrentAnnotation();
        state.selectedScenarioId = "";
        clearAnnotationEditingState();
        await reconcileImportedAnnotationReferenceImage("Imported", fallbackImagePath);
        updateCleanAnnotationSnapshot();
        renderScenarioDesignOptions();
        const restoredPackage = restoreScenePackage(parsed, annotation, file.name);
        if (!restoredPackage) {
          workflow.setSourceDraft({
            kind: "annotation_json",
            imageDataUrl: uploadedImageDataUrl.value || undefined,
            fileName: file.name,
            geojson: null,
          });
        }
        if (restoredPackage) {
          remountAnnotationOsmBackground();
          setStatus(statusEl, "场景包已恢复：标注与 OSM 地图数据可继续编辑。", "success");
        }
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
        ensureCompatibleFurnitureStripsForCurrentAnnotation();
        state.selectedScenarioId = "";
        clearAnnotationEditingState();
        await reconcileImportedAnnotationReferenceImage("Applied", fallbackImagePath);
        updateCleanAnnotationSnapshot();
        renderScenarioDesignOptions();
        workflow.setSourceDraft({
          kind: "annotation_json",
          imageDataUrl: uploadedImageDataUrl.value || undefined,
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
      downloadText(
        `${state.annotation.plan_id || "reference_annotation"}_scene_package.json`,
        JSON.stringify(buildScenePackage(), null, 2),
      );
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
        if (autoGraphTimer.value !== null) {
          window.clearTimeout(autoGraphTimer.value);
          autoGraphTimer.value = null;
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

  renderReferencePlanOptions();
  renderScenarioDesignOptions();
  }

  return { bindSceneGraphEvents };
}
