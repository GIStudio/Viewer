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

export type SgRenderControllerContext = {
  annotationCanvasDimensions: () => { width: number; height: number; };
  autoGraphInFlight: { value: boolean; };
  buildInspectorMarkup: (annotation: ReferenceAnnotation, selection: Selection, selectedStripId: string | null, pendingFurnitureKind: FurnitureKind, isFurniturePlacementArmed: boolean) => string;
  buildOverlayMarkup: any;
  canConvertGraph: () => boolean;
  centerlineLengthM: (centerline: AnnotatedCenterline, pixelsPerMeter: number) => number;
  clearFurniturePlacement: () => void;
  convertGraphButton: HTMLButtonElement;
  deleteSelectedButton: HTMLButtonElement;
  downloadGraphButton: HTMLButtonElement;
  featureTableEl: HTMLElement;
  finishCenterlineButton: HTMLButtonElement;
  graphSummaryEl: HTMLElement;
  graphTextarea: HTMLTextAreaElement;
  hasAnnotationCanvas: () => boolean;
  imageMetaEl: HTMLElement;
  imageResetButton: HTMLButtonElement;
  inspectorEl: HTMLElement;
  isRegionRole: (value: string) => value is RegionRole;
  markAnnotationChanged: (statusMessage?: string) => void;
  markCenterlineOverlayEdited: (centerline: AnnotatedCenterline) => void;
  nextStripId: (centerline: AnnotatedCenterline, zone: StripZone) => string;
  nominalSeedCrossSectionWidth: (centerline: AnnotatedCenterline) => number;
  normalizeAngleDeg: (value: number) => number;
  normalizePoint: (value: unknown) => AnnotationPoint;
  originalOpacityLabel: HTMLElement;
  osmReferenceNote: HTMLElement;
  overlayHostEl: HTMLElement;
  pixelsPerMeterInput: HTMLInputElement;
  referencePlanControl: HTMLElement;
  renderToolButtons: () => void;
  root: HTMLElement;
  roundaboutRadiusInput: HTMLInputElement;
  selectAllRoadsButton: HTMLButtonElement;
  selectedCenterline: () => AnnotatedCenterline | null;
  selectedStrip: (centerline?: AnnotatedCenterline | null) => AnnotatedCrossSectionStrip | null;
  setStatus: (element: HTMLElement, message: SceneGraphStatusText, tone: StatusTone) => void;
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
  signal: AbortSignal;
  state: any;
  statusEl: HTMLElement;
  summaryGridEl: HTMLElement;
  syncJsonTextarea: (force?: boolean) => void;
  undoPointButton: HTMLButtonElement;
  updateStageVisibility: () => void;
  workflow: WorkflowController;
};

export function createSgRenderController(getContext: () => SgRenderControllerContext) {
  function renderInspector(): void {
    const { buildInspectorMarkup, centerlineLengthM, clearFurniturePlacement, inspectorEl, isRegionRole, markAnnotationChanged, markCenterlineOverlayEdited, nextStripId, nominalSeedCrossSectionWidth, normalizeAngleDeg, normalizePoint, pixelsPerMeterInput, root, selectedCenterline, selectedStrip, setStatus, signal, state, statusEl } = getContext();
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
        const derived = (state.annotation.derived_regions ?? []).find((item: AnnotatedRegion) => item.id === region.id);
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
          points: derived.points.map((point: AnnotationPoint) => ({ ...point })),
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
        const centerline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === surface.centerline_id) ?? null;
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
        if (centerlineSelect && state.annotation.centerlines.some((item: AnnotatedCenterline) => item.id === centerlineSelect.value)) {
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
        const centerline = feature as AnnotatedCenterline;
        syncCenterlineDerivedFields(centerline);
        markCenterlineOverlayEdited(centerline);
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
      const junction = state.annotation.junctions.find((j: AnnotatedJunction) => j.id === state.selection?.id);
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
            const next = existing.filter((c: JunctionComposition) => c.junctionId !== composition.junctionId);
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
            const targetCenterline = state.annotation.centerlines.find((item: AnnotatedCenterline) => item.id === targetCenterlineId) ?? null;
            if (!targetCenterline) {
              return;
            }
            state.selection = { kind: "centerline", id: targetCenterline.id };
            state.selectedStripId = targetCenterline.cross_section_strips.some((strip: AnnotatedCrossSectionStrip) => strip.strip_id === targetStripId)
              ? targetStripId
              : null;
            clearFurniturePlacement();
            renderAll();
            return;
          }
          if (action === "reset-road-width-to-nominal") {
            centerline.road_width_m = nominalSeedCrossSectionWidth(centerline);
            markCenterlineOverlayEdited(centerline);
            markAnnotationChanged(`Reset ${centerline.id} width to nominal cross-section.`);
            renderAll();
            return;
          }
          if (action === "restore-osm-geometry") {
            const originalPoints = Array.isArray(centerline.source_refs?.original_points)
              ? centerline.source_refs.original_points
              : [];
            if (originalPoints.length < 2) {
              setStatus(statusEl, "此道路没有可恢复的 OSM 原始几何。", "error");
              return;
            }
            centerline.points = originalPoints.map((value) => normalizePoint(value));
            if (centerline.source_refs) centerline.source_refs.edit_state = "base";
            markAnnotationChanged(`Restored ${centerline.id} to its OSM geometry.`);
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
            markCenterlineOverlayEdited(centerline);
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
            markCenterlineOverlayEdited(centerline);
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
            const zone = state.annotation.functional_zones.find((z: AnnotatedFunctionalZone) => z.id === zoneId);
            if (!zone) {
              return;
            }
            zone.furniture_instances = zone.furniture_instances.filter((item: ZoneFurnitureInstance) => item.instance_id !== instanceId);
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
    const { annotationCanvasDimensions, buildOverlayMarkup, hasAnnotationCanvas, overlayHostEl, state, updateStageVisibility } = getContext();
    if (!hasAnnotationCanvas()) {
      overlayHostEl.innerHTML = "";
      updateStageVisibility();
      return;
    }
    const { width: canvasWidth, height: canvasHeight } = annotationCanvasDimensions();
    const overlayAnnotation = (state.annotation.image_width_px > 0 && state.annotation.image_height_px > 0)
      ? state.annotation
      : {
          ...state.annotation,
          image_width_px: canvasWidth,
          image_height_px: canvasHeight,
        };
    overlayHostEl.innerHTML = buildOverlayMarkup(
      overlayAnnotation,
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
    overlayHostEl.dataset.showOsmLabels = String(state.showOsmLabels);
    overlayHostEl.dataset.showAnnotationLabels = String(state.showAnnotationLabels);
    overlayHostEl.querySelectorAll<SVGTextElement>("text").forEach((label) => {
      const isOsmLabel = label.textContent?.trim().startsWith("osm-") ?? false;
      label.classList.toggle("annotation-osm-label", isOsmLabel);
      label.classList.toggle("annotation-overlay-label", !isOsmLabel);
    });
    updateStageVisibility();
  }

  function renderAll(): void {
    const { annotationCanvasDimensions, autoGraphInFlight, canConvertGraph, convertGraphButton, deleteSelectedButton, downloadGraphButton, featureTableEl, finishCenterlineButton, graphSummaryEl, graphTextarea, hasAnnotationCanvas, imageMetaEl, imageResetButton, originalOpacityLabel, osmReferenceNote, pixelsPerMeterInput, referencePlanControl, renderToolButtons, root, roundaboutRadiusInput, selectAllRoadsButton, showAnnotationLabelsInput, showJunctionBoundariesInput, showJunctionConnectorsInput, showJunctionCoreInput, showJunctionCrosswalksInput, showJunctionDebugInput, showJunctionLabelsInput, showJunctionOutlinesInput, showOriginalInput, showOsmLabelsInput, showOverlayInput, state, summaryGridEl, syncJsonTextarea, undoPointButton, workflow } = getContext();
    renderToolButtons();
    summaryGridEl.innerHTML = buildAnnotationSummaryMarkup(state.annotation);
    featureTableEl.innerHTML = buildFeatureTableMarkup(state.annotation);
    graphSummaryEl.innerHTML = buildGraphSummaryMarkup(state.graphResult);
    graphTextarea.value = state.graphResult ? JSON.stringify(state.graphResult, null, 2) : "";
    showOriginalInput.checked = state.showOriginal;
    showOverlayInput.checked = state.showOverlay;
    showOsmLabelsInput.checked = state.showOsmLabels;
    showAnnotationLabelsInput.checked = state.showAnnotationLabels;
    const isDirectOsm = workflow.getSnapshot().sourceKind === "osm" || workflow.getSnapshot().sourceKind === "osm_buildings";
    referencePlanControl.hidden = isDirectOsm;
    osmReferenceNote.hidden = !isDirectOsm;
    originalOpacityLabel.dataset.i18nKey = isDirectOsm
      ? "sceneGraph.right.baseMapOpacity"
      : "sceneGraph.right.originalOpacity";
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
    const { width: canvasWidth, height: canvasHeight } = annotationCanvasDimensions();
    const showInlineLoading = state.isReferenceImageLoading && !state.currentImageUrl;
    imageMetaEl.dataset.loading = showInlineLoading ? "true" : "false";
    imageMetaEl.textContent = showInlineLoading
      ? state.referenceImageLoadingMessage
      : hasAnnotationCanvas()
        ? `${state.annotation.plan_id || "custom"} · ${canvasWidth} × ${canvasHeight}px · ${state.annotation.pixels_per_meter.toFixed(1)} px/m · ${state.annotation.centerlines.length} roads · ${state.annotation.centerlines.reduce((sum: number, item: AnnotatedCenterline) => sum + item.cross_section_strips.length, 0)} strips · ${state.annotation.centerlines.reduce((sum: number, item: AnnotatedCenterline) => sum + item.street_furniture_instances.length, 0)} furniture · ${state.annotation.regions.length} regions · ${(state.annotation.derived_regions ?? []).length} auto building regions · ${state.annotation.surface_annotations.length} design surfaces · ${state.annotation.station_strip_patches.length} strip patches`
        : "选择参考 plan 或导入 PNG 后，就可以在图上开始标注。";
    applyViewerTranslations(root, loadViewerLanguage());
    const osmBuildingFootprintButton = root.querySelector<HTMLButtonElement>("#annotation-tool-building-region");
    if (osmBuildingFootprintButton && isDirectOsm) {
      osmBuildingFootprintButton.textContent = "OSM 建筑足迹";
      osmBuildingFootprintButton.title = "逐点绘制新的 OSM 建筑足迹多边形；双击或按 Enter 完成";
    }
    finishCenterlineButton.disabled = state.draftCenterline.length < 2;
    selectAllRoadsButton.disabled = state.annotation.centerlines.length === 0;
    selectAllRoadsButton.dataset.active = state.selection?.kind === "road_collection" ? "true" : "false";
    undoPointButton.disabled = state.draftCenterline.length === 0;
    const selectedJunction =
      state.selection?.kind === "junction"
        ? state.annotation.junctions.find((item: AnnotatedJunction) => item.id === state.selection?.id) ?? null
        : null;
    deleteSelectedButton.disabled =
      !state.selection ||
      state.selection.kind === "road_collection" ||
      state.selection.kind === "derived_junction" ||
      Boolean(selectedJunction && selectedJunction.source_mode === "explicit");
    imageResetButton.disabled = !state.currentImageUrl;
    convertGraphButton.disabled = !canConvertGraph() || autoGraphInFlight.value;
    downloadGraphButton.disabled = !state.graphResult;
  }

  return { renderInspector, renderOverlay, renderAll };
}
