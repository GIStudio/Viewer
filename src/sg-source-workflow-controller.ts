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

export type SgSourceWorkflowControllerContext = {
  PROFESSIONAL_OSM_JOB_KEY: "roadgen3d:professional-osm-job-v1";
  PROFESSIONAL_OSM_VIEW_KEY: "roadgen3d:professional-osm-view-v1";
  clearAnnotationEditingState: () => void;
  cloneAnnotation: (annotation: ReferenceAnnotation) => ReferenceAnnotation;
  comparableAnnotationSnapshot: (annotation: ReferenceAnnotation) => string;
  courseMode: boolean;
  ensureCompatibleFurnitureStripsForCurrentAnnotation: () => void;
  escapeHtml: (text: string) => string;
  featureCountsForAnnotation: (annotation: ReferenceAnnotation) => Record<string, number>;
  generationConfirmDialog: HTMLElement | null;
  generationConfirmOpenButton: HTMLButtonElement | null;
  generationConfirmSummary: HTMLElement | null;
  graphStatusEl: HTMLElement;
  hostOptions: SceneGraphHostOptions;
  normalizeAnnotation: (value: unknown) => ReferenceAnnotation;
  originalImageEl: HTMLImageElement;
  osmPicker: { value: OsmAoiPickerController | null; };
  osmPickerHostEl: HTMLElement | null;
  osmRoadStudyPicker: { value: OsmRoadStudyPickerController | null; };
  pendingOsmNormalization: { value: NormalizedSceneSourceResponse | null; };
  professionalOsmPreview: { value: OsmRoadPreview | null; };
  professionalOsmSelection: { value: OsmAoiSelection | null; };
  professionalOsmStage: { value: "aoi" | "progress" | "study" | "annotation"; };
  readImageFileDataUrl: (file: File) => Promise<string>;
  remountAnnotationOsmBackground: () => void;
  renderAll: () => void;
  renderScenarioDesignOptions: (preferredScenarioId?: string) => void;
  root: HTMLElement;
  segmentLengthInput: HTMLInputElement;
  setStatus: (element: HTMLElement, message: SceneGraphStatusText, tone: StatusTone) => void;
  shell: DesktopShell;
  sidewalkWidthInput: HTMLInputElement;
  signal: AbortSignal;
  sourceAiExtractButton: HTMLButtonElement;
  sourceAiPrompt: HTMLTextAreaElement;
  sourceAiStatusEl: HTMLElement;
  sourceAoiSummaryEl: HTMLElement;
  sourceCoordinateSpaceSelect: HTMLSelectElement;
  sourceCountsEl: HTMLElement;
  sourceGenerateButton: HTMLButtonElement;
  sourceNormalizeButton: HTMLButtonElement;
  sourceOpenAnnotationToolsButton: HTMLButtonElement;
  sourceOpenExistingButton: HTMLButtonElement;
  sourceProvenanceEl: HTMLElement;
  sourceReviewStatusEl: HTMLElement;
  sourceStatusEl: HTMLElement;
  sourceWarningsEl: HTMLElement;
  sourceWorkflowEl: HTMLElement;
  state: any;
  statusEl: HTMLElement;
  updateCleanAnnotationSnapshot: () => void;
  updateOsmPickerVisibility: () => void;
  uploadedImageDataUrl: { value: string; };
  workflow: WorkflowController;
};

export function createSgSourceWorkflowController(getContext: () => SgSourceWorkflowControllerContext) {
  function normalizedOsmBboxFromWorkflow(): EditableWgs84Bbox | null {
    const { workflow } = getContext();
    const alignment = workflow.getSnapshot().normalized?.sourceContext.source_alignment as Record<string, unknown> | null | undefined;
    const sourceFrame = alignment?.source_frame;
    const bbox = sourceFrame && typeof sourceFrame === "object"
      ? (sourceFrame as Record<string, unknown>).bbox_wgs84
      : null;
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(Number(value)))) return null;
    const result = bbox.map(Number) as EditableWgs84Bbox;
    return result[0] < result[2] && result[1] < result[3] ? result : null;
  }

  function storedProfessionalOsmView(): OsmMapView {
    const { PROFESSIONAL_OSM_VIEW_KEY } = getContext();
    try {
      const value = window.sessionStorage.getItem(PROFESSIONAL_OSM_VIEW_KEY);
      const parsed = value ? JSON.parse(value) : null;
      if (
        parsed
        && Array.isArray(parsed.center)
        && parsed.center.length === 2
        && parsed.center.every((item: unknown) => Number.isFinite(Number(item)))
        && Number.isFinite(Number(parsed.zoom))
      ) {
        return {
          center: [Number(parsed.center[0]), Number(parsed.center[1])],
          zoom: Number(parsed.zoom),
        };
      }
    } catch {
      // A blocked or malformed session store must not prevent the map from opening.
    }
    return { ...DEFAULT_GUANGZHOU_OSM_VIEW, center: [...DEFAULT_GUANGZHOU_OSM_VIEW.center] };
  }

  function persistProfessionalOsmView(view: OsmMapView): void {
    const { PROFESSIONAL_OSM_VIEW_KEY } = getContext();
    try {
      window.sessionStorage.setItem(PROFESSIONAL_OSM_VIEW_KEY, JSON.stringify(view));
    } catch {
      // View persistence is a convenience; the visible map remains authoritative.
    }
  }

  function renderProfessionalAoiSummary(): void {
    const { escapeHtml, professionalOsmSelection, sourceAoiSummaryEl } = getContext();
    const language = loadViewerLanguage();
    const tr = (key: string, fallback: string): string => translateViewerKey(language, key) ?? fallback;
    sourceAoiSummaryEl.dataset.ready = String(Boolean(professionalOsmSelection.value));
    if (!professionalOsmSelection.value) {
      sourceAoiSummaryEl.innerHTML = `<strong>${escapeHtml(tr("sceneGraph.source.noArea", "No study area captured"))}</strong><span>${escapeHtml(tr("sceneGraph.source.noAreaAction", "Browse OSM on the stage, then capture the viewport or draw precisely."))}</span>`;
      return;
    }
    sourceAoiSummaryEl.innerHTML = `<strong>${escapeHtml(tr("sceneGraph.source.areaReady", "Candidate study area captured"))}</strong><span>${professionalOsmSelection.value.bbox.map((value) => Number(value).toFixed(6)).join(" · ")}</span>`;
  }

  function sourceImageReference(requireBbox: boolean): SourceImageReference {
    const { originalImageEl, professionalOsmSelection, state } = getContext();
    const bbox = professionalOsmSelection.value?.bbox ?? normalizedOsmBboxFromWorkflow();
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
      osm_annotation_context: osmPayload.osm_annotation_context,
    };
  }

  function renderSourceWorkflow(): void {
    const { courseMode, escapeHtml, featureCountsForAnnotation, professionalOsmStage, root, sourceAiExtractButton, sourceAiStatusEl, sourceCountsEl, sourceGenerateButton, sourceNormalizeButton, sourceOpenAnnotationToolsButton, sourceOpenExistingButton, sourceProvenanceEl, sourceReviewStatusEl, sourceStatusEl, sourceWarningsEl, sourceWorkflowEl, state, workflow } = getContext();
    const language = loadViewerLanguage();
    const tr = (key: string, fallback: string): string => translateViewerKey(language, key) ?? fallback;
    const snapshot = workflow.getSnapshot();
    renderProfessionalAoiSummary();
    const reviewVisible = snapshot.step !== "source" && Boolean(snapshot.normalized);
    sourceWorkflowEl.dataset.step = reviewVisible ? "review" : "source";
    const sourcePanel = sourceWorkflowEl.querySelector<HTMLElement>('[data-workflow-panel="source"]');
    const reviewPanel = sourceWorkflowEl.querySelector<HTMLElement>('[data-workflow-panel="review"]');
    if (sourcePanel) sourcePanel.hidden = reviewVisible;
    if (reviewPanel) reviewPanel.hidden = !reviewVisible;

    const normalized = snapshot.normalized;
    const osmBaseAnnotation = snapshot.sourceKind === "osm" && Boolean(normalized);
    if (normalized) {
      const source = normalized.source;
      sourceProvenanceEl.innerHTML = `
        <strong>${escapeHtml(String(source.source_id ?? (state.annotation.plan_id || "source")))}</strong>
        <span>${escapeHtml(String(source.kind ?? "reference_annotation"))} · ${escapeHtml(String(source.producer ?? "manual"))}</span>
        <span>${escapeHtml(tr("sceneGraph.review.annotationVersion", "annotation"))} ${escapeHtml(String(source.normalized_annotation_version ?? state.annotation.version))} · ${escapeHtml(tr("sceneGraph.review.normalizedAt", "normalized"))} ${escapeHtml(normalized.normalizedAt)}</span>
        <span>${escapeHtml(tr("sceneGraph.review.alignment", "alignment"))} ${escapeHtml(String((normalized.sourceContext.source_alignment as Record<string, unknown> | null)?.status ?? "n/a"))}</span>
      `;
      const displayedCounts = snapshot.annotationDraft
        ? featureCountsForAnnotation(snapshot.annotationDraft.annotation)
        : normalized.featureCounts;
      sourceCountsEl.innerHTML = Object.entries(displayedCounts)
        .map(([label, count]) => {
          const key = ({
            roads: "sceneGraph.metric.roads",
            junctions: "sceneGraph.metric.junctions",
            regions: "sceneGraph.metric.regions",
            buildings: "sceneGraph.metric.buildings",
            functional_zones: "sceneGraph.metric.functionalZones",
            furniture: "sceneGraph.metric.sourceFurniture",
          } as Record<string, string>)[label];
          const translated = key ? tr(key, label.replace(/_/g, " ")) : label.replace(/_/g, " ");
          return `<div class="scene-metric-card"><span>${escapeHtml(translated)}</span><strong>${count}</strong></div>`;
        })
        .join("");
      sourceWarningsEl.innerHTML = normalized.warnings.length
        ? normalized.warnings.map((warning) => {
          const translated = warning.toLowerCase().includes("touches the osm retrieval boundary")
            ? tr("sceneGraph.review.boundaryWarning", warning)
            : translateViewerLiteral(language, warning) ?? warning;
          return `<div class="scene-source-warning">${escapeHtml(translated)}</div>`;
        }).join("")
        : `<div class="scene-source-warning" data-tone="ok">${escapeHtml(tr("sceneGraph.review.noWarnings", "No normalization warnings."))}</div>`;
      const draft = snapshot.annotationDraft;
      const status = draft?.status ?? "saved";
      if (status === "validation_error") {
        const reason = draft?.validationErrors[0] ?? snapshot.lastError ?? "Validation failed.";
        sourceReviewStatusEl.textContent = formatViewerKey(language, "sceneGraph.review.validationError", { reason }) ?? reason;
        sourceReviewStatusEl.dataset.tone = "error";
      } else if (status === "dirty" || status === "saving" || status === "validating") {
        sourceReviewStatusEl.textContent = tr(`sceneGraph.review.${status}`, status);
        sourceReviewStatusEl.dataset.tone = "neutral";
      } else if (snapshot.approvedSourceRevision === snapshot.sourceRevision) {
        const saved = formatViewerKey(language, "sceneGraph.review.saved", { revision: snapshot.sourceRevision })
          ?? `Saved and approved · revision ${snapshot.sourceRevision}`;
        const hasOlderScene = Boolean(snapshot.sceneLayoutPath)
          && snapshot.sceneSourceRevision !== snapshot.sourceRevision;
        const reviewStatus = hasOlderScene
          ? `${saved} · ${formatViewerKey(language, "sceneGraph.review.olderScene", { revision: snapshot.sceneSourceRevision ?? "?" }) ?? "Existing 3D scene is based on an earlier annotation."}`
          : saved;
        const osmGuidance = osmBaseAnnotation
          ? ` · ${tr("sceneGraph.review.osmBaseAnnotation", "OSM map data is already a base annotation. Use Professional tools · Annotation to add or refine details.")}`
          : "";
        sourceReviewStatusEl.textContent = `${reviewStatus}${osmGuidance}`;
        sourceReviewStatusEl.dataset.tone = hasOlderScene ? "warning" : "success";
      } else if (osmBaseAnnotation) {
        sourceReviewStatusEl.textContent = tr(
          "sceneGraph.review.osmBaseAnnotation",
          "OSM map data is already a base annotation. Use Professional tools · Annotation to add or refine details.",
        );
        sourceReviewStatusEl.dataset.tone = "success";
      } else {
        sourceReviewStatusEl.textContent = tr("sceneGraph.review.waiting", "Waiting for a valid annotation.");
        sourceReviewStatusEl.dataset.tone = "neutral";
      }
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
    const browsingOsm = !courseMode
      && professionalOsmStage.value !== "annotation"
      && (snapshot.step === "source" || !snapshot.normalized);
    sourceNormalizeButton.hidden = browsingOsm;
    sourceNormalizeButton.setAttribute("aria-hidden", String(browsingOsm));
    sourceOpenAnnotationToolsButton.hidden = !osmBaseAnnotation;
    sourceOpenAnnotationToolsButton.title = tr(
      "sceneGraph.review.openAnnotationToolsHint",
      "Open Professional tools · Annotation to supplement or edit the imported OSM data.",
    );
    const hasExistingScene = Boolean(snapshot.sceneLayoutPath);
    const sceneMatchesCurrentAnnotation = hasExistingScene
      && snapshot.sceneSourceRevision === snapshot.sourceRevision;
    const canGenerateCurrentScene = Boolean(normalized)
      && snapshot.approvedSourceRevision === snapshot.sourceRevision
      && snapshot.annotationDraft?.status === "saved"
      && !snapshot.busy.generate;
    sourceGenerateButton.disabled = courseMode
      ? state.annotation.centerlines.length === 0 || Boolean(snapshot.busy.generate)
      : sceneMatchesCurrentAnnotation ? false : !canGenerateCurrentScene;
    if (!courseMode) {
      sourceGenerateButton.textContent = sceneMatchesCurrentAnnotation
        ? tr("sceneGraph.review.openCurrent3d", "Open current 3D scene")
        : tr("sceneGraph.review.generateCurrent3d", "Generate current 3D scene");
      sourceGenerateButton.title = sceneMatchesCurrentAnnotation
        ? tr("sceneGraph.review.openCurrent3dHint", "Open the 3D scene generated from this annotation revision.")
        : tr("sceneGraph.review.generateCurrent3dHint", "Open the 3D generation flow for this approved annotation revision.");
      sourceOpenExistingButton.hidden = !hasExistingScene || sceneMatchesCurrentAnnotation;
      sourceOpenExistingButton.disabled = !hasExistingScene;
      sourceOpenExistingButton.textContent = tr("sceneGraph.review.openExisting3d", "Open existing 3D scene");
      sourceOpenExistingButton.title = tr("sceneGraph.review.openExisting3dHint", "Browse the last generated 3D scene without treating it as current.");
    } else {
      sourceGenerateButton.textContent = tr("sceneGraph.review.courseGenerate", "Approve annotation and generate 3D baseline");
      sourceGenerateButton.title = tr("sceneGraph.review.courseGenerateHint", "Save this ReferenceAnnotation to the project and start the course baseline job.");
      sourceOpenExistingButton.hidden = true;
    }
    if (snapshot.lastError && root.isConnected) {
      sourceStatusEl.textContent = snapshot.lastError;
      sourceStatusEl.dataset.tone = "error";
    }
  }

  function applyNormalizedSourcePayload(payload: NormalizedSceneSourceResponse, status: string): void {
    const { clearAnnotationEditingState, cloneAnnotation, comparableAnnotationSnapshot, courseMode, ensureCompatibleFurnitureStripsForCurrentAnnotation, graphStatusEl, normalizeAnnotation, remountAnnotationOsmBackground, renderAll, renderScenarioDesignOptions, setStatus, sourceStatusEl, state, statusEl, updateCleanAnnotationSnapshot, workflow } = getContext();
    const expectedDraftFingerprint = comparableAnnotationSnapshot(state.annotation);
    state.annotation = normalizeAnnotation(payload.annotation);
    ensureCompatibleFurnitureStripsForCurrentAnnotation();
    state.graphResult = {
      ...payload,
      annotation: cloneAnnotation(state.annotation),
    };
    state.selectedScenarioId = "";
    clearAnnotationEditingState();
    updateCleanAnnotationSnapshot();
    const normalized = toNormalizedSceneSource(payload);
    const fingerprint = comparableAnnotationSnapshot(state.annotation);
    if (courseMode) workflow.setNormalizedSource(normalized);
    else workflow.setValidatedAnnotation(normalized, fingerprint, { autoApprove: true, expectedDraftFingerprint });
    state.isReferenceImageLoading = false;
    setStatus(sourceStatusEl, status, "success");
    setStatus(statusEl, status, "success");
    setStatus(graphStatusEl, { key: "sceneGraph.status.graphNormalizedComplete" }, "success");
    renderScenarioDesignOptions();
    renderAll();
    renderSourceWorkflow();
    remountAnnotationOsmBackground();
  }

  async function normalizeCurrentSceneSource(): Promise<void> {
    const { cloneAnnotation, pendingOsmNormalization, segmentLengthInput, setStatus, sidewalkWidthInput, signal, sourceCoordinateSpaceSelect, sourceStatusEl, state, workflow } = getContext();
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
      applyNormalizedSourcePayload(combineWithOsmContext(payload, pendingOsmNormalization.value), "Source normalized. Review provenance and warnings.");
      workflow.endRequest(token);
    } catch (error) {
      if (workflow.endRequest(token, error)) {
        setStatus(sourceStatusEl, error instanceof Error ? error.message : "Source normalization failed.", "error");
        renderSourceWorkflow();
      }
    }
  }

  async function currentImageDataUrl(token: { signal: AbortSignal }): Promise<string> {
    const { readImageFileDataUrl, signal, state, uploadedImageDataUrl } = getContext();
    if (uploadedImageDataUrl.value.startsWith("data:image/")) return uploadedImageDataUrl.value;
    if (!state.currentImageUrl) throw new Error("Load a reference image before AI extraction.");
    const response = await fetch(state.currentImageUrl, { signal: token.signal });
    if (!response.ok) throw new Error(`Failed to read the reference image (${response.status}).`);
    return readImageFileDataUrl(new File([await response.blob()], state.annotation.image_path || "reference.png"));
  }

  async function extractCurrentReferenceImage(): Promise<void> {
    const { pendingOsmNormalization, setStatus, signal, sourceAiPrompt, sourceStatusEl, state, uploadedImageDataUrl, workflow } = getContext();
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
      uploadedImageDataUrl.value = imageDataUrl;
      applyNormalizedSourcePayload(combineWithOsmContext(payload, pendingOsmNormalization.value), "AI extraction normalized. Review before generation.");
      workflow.endRequest(token);
    } catch (error) {
      if (workflow.endRequest(token, error)) {
        setStatus(sourceStatusEl, error instanceof Error ? error.message : "AI extraction failed.", "error");
        renderSourceWorkflow();
      }
    }
  }

  function storeProfessionalOsmJob(jobId: string | null): void {
    const { PROFESSIONAL_OSM_JOB_KEY } = getContext();
    try {
      if (jobId) window.sessionStorage.setItem(PROFESSIONAL_OSM_JOB_KEY, jobId);
      else window.sessionStorage.removeItem(PROFESSIONAL_OSM_JOB_KEY);
    } catch {
      // Job recovery is a convenience; the current stage remains usable.
    }
  }

  function renderOsmJobProgress(job: OsmAcquisitionJob): void {
    const { escapeHtml, osmPicker, osmPickerHostEl, osmRoadStudyPicker, professionalOsmStage, setStatus, sourceStatusEl, statusEl, updateOsmPickerVisibility } = getContext();
    if (!osmPickerHostEl) return;
    professionalOsmStage.value = "progress";
    osmPicker.value?.destroy();
    osmPicker.value = null;
    osmRoadStudyPicker.value?.destroy();
    osmRoadStudyPicker.value = null;
    const indeterminate = job.progress_mode === "indeterminate"
      || String(job.detail?.progress_mode ?? "") === "indeterminate";
    const recent = [...(job.operations ?? [])].slice(-3).reverse();
    const language = loadViewerLanguage();
    const text = (key: string, fallback: string, params?: Record<string, string | number>) => (
      formatViewerKey(language, key, params) ?? fallback
    );
    const stage = (value: string) => text(
      `sceneGraph.osmProgress.stage.${value}`,
      value.replace(/_/g, " "),
    );
    const message = (value: string | null | undefined) => {
      const source = value?.trim() ?? "";
      if (!source) return text("sceneGraph.osmProgress.preparing", "Preparing OSM data…");
      if (language !== "zh") return source;
      const request = source.match(/^Requesting the complete OSM context \(attempt (\d+)\/(\d+)\)\.?$/i);
      if (request) return text("sceneGraph.osmProgress.requesting", `正在请求地图数据（第 ${request[1]}/${request[2]} 次）…`, { attempt: request[1], max: request[2] });
      const retry = source.match(/^Overpass attempt (\d+) failed; retrying\.?$/i);
      if (retry) return text("sceneGraph.osmProgress.retrying", `第 ${retry[1]} 次 Overpass 请求失败，正在重试。`, { attempt: retry[1] });
      if (/^Preparing OSM data…?$/i.test(source)) return text("sceneGraph.osmProgress.preparing", "正在准备 OSM 数据…");
      if (/^Waiting for the first operation…?$/i.test(source)) return text("sceneGraph.osmProgress.waiting", "正在等待首个处理步骤…");
      return text("sceneGraph.osmProgress.processing", "正在处理 OSM 数据…");
    };
    const visibleMessage = message(job.message);
    const visibleTone: StatusTone = job.status === "failed"
      ? "error"
      : job.status === "succeeded" ? "success" : "neutral";
    setStatus(sourceStatusEl, visibleMessage, visibleTone);
    setStatus(statusEl, visibleMessage, visibleTone);
    const elementCount = String(job.detail?.element_count ?? "—");
    const attempt = String(job.detail?.attempt ?? "—");
    const maxAttempts = String(job.detail?.max_attempts ?? "—");
    const elapsed = String(job.detail?.elapsed_seconds ?? "—");
    osmPickerHostEl.innerHTML = `
      <section class="osm-acquisition-progress" data-status="${escapeHtml(job.status)}">
        <div class="osm-acquisition-progress-card">
          <span class="osm-acquisition-kicker">${escapeHtml(text("sceneGraph.osmProgress.kicker", "OSM Acquisition"))} · ${escapeHtml(stage(job.stage))}</span>
          <h2>${escapeHtml(visibleMessage)}</h2>
          <div class="osm-acquisition-progress-track" data-indeterminate="${String(indeterminate)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${job.progress}">
            <i style="--osm-progress:${job.progress}%"></i>
          </div>
          <div class="osm-acquisition-progress-meta">
            <strong>${indeterminate ? "—" : `${job.progress}%`}</strong>
            <span>${escapeHtml(text("sceneGraph.osmProgress.elements", `${elementCount} elements`, { count: elementCount }))}</span>
            <span>${escapeHtml(text("sceneGraph.osmProgress.attempts", `${attempt} / ${maxAttempts} attempts`, { attempt, max: maxAttempts }))}</span>
            <span>${escapeHtml(text("sceneGraph.osmProgress.elapsed", `${elapsed} s elapsed`, { seconds: elapsed }))}</span>
          </div>
          <ol>${recent.map((operation) => `<li><b>${escapeHtml(stage(operation.stage))}</b><span>${escapeHtml(message(operation.message))}</span></li>`).join("") || `<li><span>${escapeHtml(text("sceneGraph.osmProgress.waiting", "Waiting for the first operation…"))}</span></li>`}</ol>
          ${job.error ? `<div class="osm-acquisition-error">${escapeHtml(job.error)}</div>` : ""}
          <div class="osm-acquisition-progress-actions">
            <button type="button" data-osm-job-action="back">返回修改检索范围</button>
            ${job.status === "failed" || job.status === "cancelled"
              ? '<button type="button" data-osm-job-action="retry">重试获取</button>'
              : '<button type="button" data-osm-job-action="cancel">取消任务</button>'}
          </div>
        </div>
      </section>
    `;
    osmPickerHostEl.querySelector<HTMLButtonElement>("[data-osm-job-action='back']")?.addEventListener("click", () => mountProfessionalAoiPicker());
    osmPickerHostEl.querySelector<HTMLButtonElement>("[data-osm-job-action='cancel']")?.addEventListener("click", () => {
      void cancelOsmAcquisitionJob(job.id).then(renderOsmJobProgress);
    });
    osmPickerHostEl.querySelector<HTMLButtonElement>("[data-osm-job-action='retry']")?.addEventListener("click", () => {
      void retryOsmAcquisitionJob(job.id).then((next) => {
        storeProfessionalOsmJob(next.id);
        void pollProfessionalOsmJob(next);
      });
    });
    updateOsmPickerVisibility();
  }

  function mountProfessionalRoadStudy(preview: OsmRoadPreview): void {
    const { osmPicker, osmPickerHostEl, osmRoadStudyPicker, pendingOsmNormalization, professionalOsmPreview, professionalOsmStage, setStatus, sourceStatusEl, state, statusEl, updateOsmPickerVisibility, workflow } = getContext();
    if (!osmPickerHostEl) return;
    professionalOsmStage.value = "study";
    professionalOsmPreview.value = preview;
    osmPicker.value?.destroy();
    osmPicker.value = null;
    osmRoadStudyPicker.value?.destroy();
    osmRoadStudyPicker.value = mountOsmRoadStudyPicker(osmPickerHostEl, {
      preview,
      language: loadViewerLanguage(),
      onResolve: (selection) => selectOsmRoadStudyArea(
        preview.preview_id,
        { ...selection, source_id: `${state.annotation.plan_id || "source"}_osm_road_study` },
      ),
      onApply: (result: OsmRoadStudyResponse) => {
        pendingOsmNormalization.value = result;
        workflow.setSourceDraft({
          kind: "osm",
          fileName: `${result.source.source_id}.geojson`,
          geojson: result.geojson,
        });
        professionalOsmStage.value = "annotation";
        storeProfessionalOsmJob(null);
        applyNormalizedSourcePayload(
          result,
          `Road study area loaded with ${result.annotation.centerlines.length} roads and ${result.aligned_buildings.length} buildings.`,
        );
        updateOsmPickerVisibility();
      },
      onBack: () => mountProfessionalAoiPicker(),
    });
    const roadSelectionStatus = loadViewerLanguage() === "zh"
      ? "地图数据获取完成。下一步：在地图上选择一条重点道路。"
      : "Map data is ready. Next: select a focus road on the map.";
    setStatus(sourceStatusEl, roadSelectionStatus, "success");
    setStatus(statusEl, roadSelectionStatus, "success");
    updateOsmPickerVisibility();
  }

  function mountProfessionalAoiPicker(): void {
    const { courseMode, osmPicker, osmPickerHostEl, osmRoadStudyPicker, professionalOsmPreview, professionalOsmSelection, professionalOsmStage, updateOsmPickerVisibility } = getContext();
    if (!osmPickerHostEl || courseMode) return;
    professionalOsmStage.value = "aoi";
    professionalOsmPreview.value = null;
    osmRoadStudyPicker.value?.destroy();
    osmRoadStudyPicker.value = null;
    osmPicker.value?.destroy();
    osmPicker.value = mountOsmAoiPicker(osmPickerHostEl, {
      initialView: storedProfessionalOsmView(),
      initialSelection: professionalOsmSelection.value,
      language: loadViewerLanguage(),
      showCityPicker: true,
      showConfirm: true,
      confirmLabel: "获取完整 OSM 并选择道路",
      onViewChange: persistProfessionalOsmView,
      onSelectionChange: (next) => {
        professionalOsmSelection.value = next;
        renderProfessionalAoiSummary();
      },
      onConfirm: importOsmContext,
    });
    updateOsmPickerVisibility();
  }

  async function pollProfessionalOsmJob(initial: OsmAcquisitionJob): Promise<void> {
    let job = initial;
    renderOsmJobProgress(job);
    while (job.status === "queued" || job.status === "running") {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      job = await loadOsmAcquisitionJob(job.id);
      renderOsmJobProgress(job);
    }
    if (job.status === "succeeded" && job.result.preview_id) {
      storeProfessionalOsmJob(null);
      mountProfessionalRoadStudy(job.result as OsmRoadPreview);
    }
  }

  function osmImportFailureMessage(error: unknown): string {
    const detail = error instanceof Error ? error.message : "地图数据获取失败。";
    if (/RoadGen3D API is unavailable|failed to fetch|networkerror/i.test(detail)) {
      return `地图数据服务暂时不可用。请检查 RoadGen3D 后端服务是否已启动（默认端口 8010）；若网络恢复后仍无法连接，请重启后端服务，再点击“获取完整 OSM 并选择道路”重试。技术原因：${detail}`;
    }
    return detail;
  }

  async function importOsmContext(explicitSelection?: OsmAoiSelection): Promise<void> {
    const { professionalOsmSelection, setStatus, signal, sourceStatusEl, state, statusEl, workflow } = getContext();
    const selected = explicitSelection ?? professionalOsmSelection.value;
    const bbox = selected?.bbox;
    if (!bbox) {
      setStatus(sourceStatusEl, "Browse the map and capture a study area before fetching OSM.", "error");
      return;
    }
    professionalOsmSelection.value = { source: selected?.source ?? "coordinates", bbox: [...bbox] };
    renderProfessionalAoiSummary();
    const token = workflow.beginRequest("osm");
    workflow.clearError();
    const startingStatus = loadViewerLanguage() === "zh"
      ? "正在启动地图数据获取任务…"
      : "Starting the map data acquisition job…";
    setStatus(sourceStatusEl, startingStatus, "neutral");
    setStatus(statusEl, startingStatus, "neutral");
    try {
      const job = await createOsmAcquisitionJob({
        source_id: `${state.annotation.plan_id || "source"}_osm_context`,
        aoi_bbox: bbox,
      }, token.signal);
      if (!token.isCurrent()) return;
      storeProfessionalOsmJob(job.id);
      await pollProfessionalOsmJob(job);
      workflow.endRequest(token);
    } catch (error) {
      if (workflow.endRequest(token, error)) {
        setStatus(sourceStatusEl, osmImportFailureMessage(error), "error");
        renderSourceWorkflow();
      }
      mountProfessionalAoiPicker();
    }
  }

  async function generateApprovedScene(): Promise<void> {
    const { cloneAnnotation, courseMode, hostOptions, setStatus, sourceGenerateButton, sourceReviewStatusEl, state, workflow } = getContext();
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
    const sceneMatchesCurrentAnnotation = Boolean(beforeApproval.sceneLayoutPath)
      && beforeApproval.sceneSourceRevision === beforeApproval.sourceRevision;
    setStatus(
      sourceReviewStatusEl,
      sceneMatchesCurrentAnnotation
        ? translateViewerKey(loadViewerLanguage(), "sceneGraph.review.openingCurrent3d") ?? "Opening the current 3D scene…"
        : translateViewerKey(loadViewerLanguage(), "sceneGraph.review.openingGeneration") ?? "Opening the 3D generation flow for the current annotation…",
      "neutral",
    );
    try {
      await hostOptions.onNavigateProfessionalScene?.(sceneMatchesCurrentAnnotation ? "browse" : "generate");
    } catch (error) {
      setStatus(sourceReviewStatusEl, error instanceof Error ? error.message : "Unable to enter the 3D scene.", "error");
      renderSourceWorkflow();
    }
  }

  async function openGenerationConfiguration(): Promise<void> {
    const { escapeHtml, generationConfirmDialog, generationConfirmOpenButton, generationConfirmSummary, setStatus, shell, sourceReviewStatusEl, state, workflow } = getContext();
    const snapshot = workflow.getSnapshot();
    if (!snapshot.normalized || snapshot.approvedSourceRevision !== snapshot.sourceRevision) {
      setStatus(sourceReviewStatusEl, "请先等待当前 2D 标注完成校验。", "error");
      return;
    }
    const sceneMatchesCurrentAnnotation = Boolean(snapshot.sceneLayoutPath)
      && snapshot.sceneSourceRevision === snapshot.sourceRevision;
    if (sceneMatchesCurrentAnnotation) {
      await openExistingProfessionalScene();
      return;
    }
    if (!generationConfirmDialog || !generationConfirmSummary) {
      await generateApprovedScene();
      return;
    }
    const annotation = state.annotation;
    const furnitureCount = annotation.centerlines.reduce(
      (count: number, centerline: AnnotatedCenterline) => count + centerline.street_furniture_instances.length,
      annotation.functional_zones.reduce((count: number, zone: AnnotatedFunctionalZone) => count + zone.furniture_instances.length, 0),
    );
    const isOsm = snapshot.sourceKind === "osm" || snapshot.sourceKind === "osm_buildings";
    generationConfirmSummary.innerHTML = [
      ["输入来源", isOsm ? "OSM 地图数据 + 标记覆盖层" : "当前 2D 标注版本"],
      ["标注版本", `revision ${snapshot.sourceRevision}`],
      ["道路与路口", `${annotation.centerlines.length} 条道路 · ${annotation.junctions.length} 个路口`],
      ["建筑足迹", `${annotation.regions.filter((item: AnnotatedRegion) => item.region_role === "building_region").length} 个`],
      ["必需街道家具", `${furnitureCount} 个`],
      ["输出方式", "创建新的可追溯 3D 版本"],
    ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    shell.sidebar.close();
    generationConfirmDialog.hidden = false;
    window.requestAnimationFrame(() => generationConfirmOpenButton?.focus());
  }

  function closeGenerationConfiguration(): void {
    const { generationConfirmDialog, sourceGenerateButton } = getContext();
    if (generationConfirmDialog) generationConfirmDialog.hidden = true;
    sourceGenerateButton.focus({ preventScroll: true });
  }

  async function openExistingProfessionalScene(): Promise<void> {
    const { hostOptions, setStatus, sourceReviewStatusEl, workflow } = getContext();
    const snapshot = workflow.getSnapshot();
    if (!snapshot.sceneLayoutPath) return;
    setStatus(
      sourceReviewStatusEl,
      translateViewerKey(loadViewerLanguage(), "sceneGraph.review.openingExisting3d") ?? "Opening the existing 3D scene…",
      "neutral",
    );
    try {
      await hostOptions.onNavigateProfessionalScene?.("browse");
    } catch (error) {
      setStatus(sourceReviewStatusEl, error instanceof Error ? error.message : "Unable to open the existing 3D scene.", "error");
      renderSourceWorkflow();
    }
  }

  return { normalizedOsmBboxFromWorkflow, storedProfessionalOsmView, persistProfessionalOsmView, renderProfessionalAoiSummary, sourceImageReference, combineWithOsmContext, renderSourceWorkflow, applyNormalizedSourcePayload, normalizeCurrentSceneSource, currentImageDataUrl, extractCurrentReferenceImage, storeProfessionalOsmJob, renderOsmJobProgress, mountProfessionalRoadStudy, mountProfessionalAoiPicker, pollProfessionalOsmJob, osmImportFailureMessage, importOsmContext, generateApprovedScene, openGenerationConfiguration, closeGenerationConfiguration, openExistingProfessionalScene };
}
