import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeStageTree, renderStageTree as renderG6StageTree, StageNode } from "./g6-visualization";
import { AudioManager, type AudioProfile } from "./audio-manager";
import { createCompareMode } from "./compare-mode";
import {
  createRadarChart,
  resizeRadarCanvas,
  type SceneCompareState,
  type SceneMetrics,
} from "./scene-compare-radar";
import type {
  ViewerManifest,
  SceneOption,
  RecentLayout,
  DesignPreset,
  SceneJobStatusPayload,
  DesignSchemeVariant,
  DesignSemanticSummary,
  BranchRunStatusPayload,
  BranchRunNode,
  ScenarioDesign,
  ScenarioDesignCatalogPayload,
  ScenarioDraftVariantPayload,
} from "./viewer-types";
import {
  VIEWER_DESIGN_PRESETS,
  SKELETON_DESIGN_PROFILE_OPTIONS,
  STREET_FURNITURE_PROFILE_OPTIONS,
} from "./viewer-types";
import {
  escapeHtml,
  clamp,
  disposeObject,
  createTextSprite,
} from "./viewer-utils";
import {
  loadManifest,
  loadRecentLayouts,
  apiJson,
  postApiJson,
  clearManifestCache,
  clearRecentLayoutsCache,
  parseQueryLayoutPath,
  inferSpawnFromBbox,
  saveSceneLayoutEdits,
} from "./viewer-api";
import type {
  SceneAssetRef,
  SceneEditCommand,
  SceneLayoutEditResponse,
} from "./viewer-api";
import {
  categoryLabel,
  resolveHitDescriptor,
  buildInfoCardContent as buildHitDescriptorContent,
  resolveInstanceIdFromName,
} from "./viewer-hit-info";
import {
  createAnalysisOverlayHelpers,
  createAssetBboxHelpers,
  createFrameHelpers,
  removeAnalysisOverlayHelpers,
  removeAssetBboxHelpers,
  removeFrameAndAssetHelpers,
  updateAssetBboxHelpers,
} from "./viewer-scene-helpers";
import {
  isEnvironmentSkyDomeObject,
  prepareEnvironmentSkyDomeObject,
  prepareEnvironmentSkyDomes,
  sceneContentBounds,
} from "./viewer-scene-bounds";
import {
  createSceneObjectEditorController,
  type SceneObjectEditMode,
} from "./viewer-scene-object-editor";
import { createSceneEditAutosaveCoordinator } from "./viewer-scene-edit-autosave";
import { createSceneObjectEditStatusController } from "./viewer-object-edit-status";
import { createLocalAssetPaletteAdapter, type SceneAssetPaletteAdapter } from "./viewer-asset-palette";
import { createSceneAssetDialog } from "./viewer-scene-asset-dialog";
import { createViewerCommandRegistry } from "./viewer-command-registry";
import { createSceneClickRoamController } from "./viewer-scene-click-roam";
import {
  createScenarioWorkbench,
  type ProfessionalScenarioAdapter,
  type ProfessionalScenarioOpenTarget,
} from "./viewer-scenario-workbench";
import { requestProfessionalOsmPicker } from "./professional-entry-intent";
import { createViewerPanelController, type ViewerPanelController } from "./viewer-panel-controller";
import { organizeViewerSettingsTools } from "./viewer-settings-tool-disclosure";
import {
  minimapToWorld,
  sceneBoundsFromManifest,
  type SceneBounds,
} from "./viewer-minimap";
import {
  exportTopDownMapPng,
  exportTopDownMapSvg,
} from "./viewer-export";
import {
  exportCameraSurfaceDiagnostic,
  renderCameraSurfaceDiagnosticControls,
  type SurfaceDiagnosticColorMode,
} from "./viewer-camera-surface-diagnostic";
import { createExpandedMapController, renderPlanMapCanvas } from "./viewer-expanded-map";
import {
  buildDesignStageNodes,
  latestOperationForStage,
  renderDesignWorkspaceHtml,
  renderStageDiagnosticContent,
  stepForStage,
} from "./viewer-design-workspace";
import {
  renderBranchRunResultsHtml,
  renderBranchWorkspaceHtml,
  selectedBranchNode as resolveSelectedBranchNode,
} from "./viewer-branch-workspace";
import { mountBranchScoreScatter3d } from "./branch-score-scatter-3d";
import { createViewerDesignController } from "./viewer-design-controller";
import { createViewerDesignMatrixController } from "./viewer-design-matrix";
import { createViewerGenerationWizardController } from "./viewer-generation-wizard";
import { buildGenerationRequestSpec, type GenerationRequestSpec } from "./viewer-generation-spec";
import { createViewerGenerationRunner } from "./viewer-generation-runner";
import { createViewerParameterDesignController, type ViewerParameterDesignController } from "./viewer-parameter-design";
import {
  compactUiLabel,
  makeDirectLayoutLabel,
  turnLanePatchSvgClass,
} from "./viewer-scene-options";
import { createRecentLayoutSelectorController, type RecentLayoutSelectorController } from "./viewer-recent-layouts";
import { createViewerSceneSelectionController } from "./viewer-scene-selection-controller";
import {
  completeLightingValues,
  DEFAULT_LIGHTING_STATE,
  LIGHTING_PRESETS,
  lightingPresetLabel,
  type LightingState,
} from "./viewer-lighting";
import {
  applyViewerLightingState,
  createViewerLightingRig,
  createViewerRenderPipeline,
  fitViewerLightingRigToBounds,
} from "./viewer-render-pipeline";
import {
  DEFAULT_ENVIRONMENT_STATE,
  deriveEnvironmentLightingState,
  type EnvironmentState,
} from "./viewer-environment";
import { createViewerEnvironmentController, type ViewerEnvironmentController } from "./viewer-environment-controller";
import {
  collectViewerPanelElements,
  createViewerLeftSections,
  createViewerRightTabs,
  createViewerStageHtml,
} from "./viewer-panels";
import { applyAnalyticalDioramaFinish } from "./viewer-visual-style";
import {
  VIEWER_LANGUAGE_EVENT,
  applyViewerTranslations,
  loadViewerLanguage,
  normalizeViewerLanguage,
  translateViewerKey,
  viewerText,
  type ViewerLanguage,
} from "./viewer-i18n";
import { createFloatingLaneSystem } from "./viewer-floating-lane";
import {
  DEFAULT_EVALUATION_CONFIG,
  EVALUATION_CONFIG_STORAGE_KEY,
  cloneEvaluationConfig,
  loadEvaluationConfig,
  renderMetricsPanel,
  validateEvaluationConfig,
  type EvaluationConfig,
  type EvaluationConfigField,
  type EvaluationResult,
} from "./viewer-evaluation";
import { captureGalleryViews, type GalleryCaptureTarget } from "./viewer-evaluation-capture";
import { createViewerEvaluationRunner } from "./viewer-evaluation-runner";
import type { DesktopShell, ShellI18nText, ShellTab, WorkbenchSidebarPage } from "./desktop-shell";
import type { ProfessionalBaselineCoordinator } from "./professional-baseline-coordinator";
import { WORKFLOW_UNDO_EVENT } from "./workflow-controller";
import type { WorkflowController } from "./workflow-controller";
import { loadWorkflowCapabilities, normalizeSceneSource, toNormalizedSceneSource } from "./workflow-api";
import { createViewerWorkflowBridge } from "./viewer-workflow-bridge";
import {
  applyMaterializedStarterScene,
  loadDefaultStarterScene,
  requestStarterSceneMaterialization,
  type ActiveSceneOrigin,
  type StarterScenePackage,
} from "./starter-scene";
import { renderWorkflowCapabilities } from "./viewer-capabilities";
import {
  parseSceneCommandEnvelope,
  sceneCommandEnvelopeTemplate,
} from "./viewer-scene-command-editor";
import type { ReferenceAnnotation } from "./sg-types";
import { createViewerDesignScenarioController } from "./viewer-design-scenario-controller";
import { createViewerSceneInteractionController } from "./viewer-scene-interaction-controller";
import { createViewerWorkspaceViewController } from "./viewer-workspace-view-controller";
import { createViewerOutputPanelController } from "./viewer-output-panel-controller";
import { createViewerLifecycleController } from "./viewer-lifecycle-controller";
import { createViewerWorkflowUiController } from "./viewer-workflow-ui-controller";

type RecentLayoutsPayload = {
  results?: RecentLayout[];
  error?: string;
};

type DesignRunSnapshot = {
  payload: SceneJobStatusPayload;
  preset: DesignPreset | null;
  variant: DesignSchemeVariant;
  prompt: string;
  graphTemplateId: string;
  structureSource?: string;
  semanticSummary?: DesignSemanticSummary;
};

type RoadGen3DCaptureGalleryRequest = {
  layoutPath?: string;
  glbUrl?: string;
  targets?: GalleryCaptureTarget[];
  width?: number;
  height?: number;
};

type MovementState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  lookLeft: boolean;
  lookRight: boolean;
  sprint: boolean;
};

type CameraMode = "first_person" | "third_person" | "frame" | "graph_overlay";

export type ViewerHostOptions = {
  embedded?: boolean;
  /**
   * Professional 2D → 3D handoffs must keep the current workflow context.
   * The public root entry remains an intentional, read-only starter preview.
   */
  preferWorkflowScene?: boolean;
  persistSceneCommands?: (
    commands: SceneEditCommand[],
    context: { layoutPath: string },
  ) => Promise<SceneLayoutEditResponse>;
  runProjectEvaluation?: (weights: Record<string, number>) => Promise<EvaluationResult>;
  assetPaletteAdapter?: SceneAssetPaletteAdapter;
  sidebarPages?: WorkbenchSidebarPage[];
  modalTabs?: ShellTab[];
  baselineCoordinator?: ProfessionalBaselineCoordinator;
  scenarioAdapter?: ProfessionalScenarioAdapter;
  copyStarterToProject?: (layoutPath: string) => Promise<ProfessionalScenarioOpenTarget>;
  onStarterCopied?: () => void;
  /** The one-time starter review is onboarding only, never a 2D-to-3D detour. */
  showStarterReviewOnLoad?: boolean;
};

type SceneViewSnapshot = {
    cameraPosition: THREE.Vector3;
    cameraQuaternion: THREE.Quaternion;
    avatarPosition: THREE.Vector3;
    cameraMode: CameraMode;
    editingEnabled: boolean;
    editMode: SceneObjectEditMode;
  };

export type ViewerInputEvaluationControllerContext = {
  currentLang: { value: ViewerLanguage; };
  evaluationConfigErrorEl: HTMLElement;
  evaluationConfigInputs: { walkabilityWeight: HTMLInputElement; safetyWeight: HTMLInputElement; beautyWeight: HTMLInputElement; clearWidthMin: HTMLInputElement; clearWidthIdeal: HTMLInputElement; furnitureArea: HTMLInputElement; amenityCount: HTMLInputElement; lampSpacing: HTMLInputElement; transitSpacing: HTMLInputElement; crossingSpacing: HTMLInputElement; entranceDensity: HTMLInputElement; treeGrid: HTMLInputElement; sunAzimuth: HTMLInputElement; sunElevation: HTMLInputElement; canopyCenter: HTMLInputElement; canopyVertical: HTMLInputElement; };
  evaluationFields: Record<EvaluationConfigField, HTMLInputElement>;
  flashStatus: (message: string, durationMs?: number) => void;
  toggleButtonsByInput: Map<HTMLInputElement, HTMLButtonElement>;
  updateOverlay: () => void;
};

export function createViewerInputEvaluationController(getContext: () => ViewerInputEvaluationControllerContext) {
  const syncToggleButtonState = (inputEl: HTMLInputElement): void => {
    const { toggleButtonsByInput } = getContext();
    const buttonEl = toggleButtonsByInput.get(inputEl);
    if (!buttonEl) {
      return;
    }
    const isChecked = inputEl.checked;
    buttonEl.classList.toggle("viewer-toggle-button-active", isChecked);
    buttonEl.setAttribute("aria-pressed", String(isChecked));
  };

  const setToggleInput = (
    inputEl: HTMLInputElement,
    checked: boolean,
    options: { emitChange?: boolean } = {},
  ): void => {
    const shouldEmitChange = options.emitChange ?? false;
    if (inputEl.checked !== checked) {
      inputEl.checked = checked;
    }
    syncToggleButtonState(inputEl);
    if (shouldEmitChange) {
      inputEl.dispatchEvent(new Event("change"));
    }
  };

  const applyEvaluationConfigToInputs = (config: EvaluationConfig): void => {
    const { evaluationConfigInputs } = getContext();
    evaluationConfigInputs.walkabilityWeight.value = String(config.aggregation.dimension_weights.walkability);
    evaluationConfigInputs.safetyWeight.value = String(config.aggregation.dimension_weights.safety);
    evaluationConfigInputs.beautyWeight.value = String(config.aggregation.dimension_weights.beauty);
    evaluationConfigInputs.clearWidthMin.value = String(config.walkability.clear_width_min);
    evaluationConfigInputs.clearWidthIdeal.value = String(config.walkability.clear_width_ideal);
    evaluationConfigInputs.furnitureArea.value = String(config.walkability.amenity_density_ideal);
    evaluationConfigInputs.amenityCount.value = String(config.walkability.amenity_count_density_ideal);
    evaluationConfigInputs.lampSpacing.value = String(config.walkability.lamp_spacing_m);
    evaluationConfigInputs.transitSpacing.value = String(config.walkability.transit_stop_spacing_m);
    evaluationConfigInputs.crossingSpacing.value = String(config.walkability.crossing_spacing_m);
    evaluationConfigInputs.entranceDensity.value = String(config.walkability.entrance_density_ideal);
    evaluationConfigInputs.treeGrid.value = String(config.walkability.tree_shade_grid_resolution_m);
    evaluationConfigInputs.sunAzimuth.value = String(config.walkability.tree_sun_azimuth_deg);
    evaluationConfigInputs.sunElevation.value = String(config.walkability.tree_sun_elevation_deg);
    evaluationConfigInputs.canopyCenter.value = String(config.walkability.tree_canopy_center_height_ratio);
    evaluationConfigInputs.canopyVertical.value = String(config.walkability.tree_canopy_vertical_ratio);
  };

  const resolveEvaluationConfigInputs = (persist: boolean): EvaluationConfig | null => {
    const { evaluationConfigErrorEl, evaluationConfigInputs, evaluationFields } = getContext();
    const candidate: EvaluationConfig = {
      aggregation: {
        dimension_weights: {
          walkability: evaluationConfigInputs.walkabilityWeight.valueAsNumber,
          safety: evaluationConfigInputs.safetyWeight.valueAsNumber,
          beauty: evaluationConfigInputs.beautyWeight.valueAsNumber,
        },
      },
      walkability: {
        clear_width_min: evaluationConfigInputs.clearWidthMin.valueAsNumber,
        clear_width_ideal: evaluationConfigInputs.clearWidthIdeal.valueAsNumber,
        amenity_density_ideal: evaluationConfigInputs.furnitureArea.valueAsNumber,
        amenity_count_density_ideal: evaluationConfigInputs.amenityCount.valueAsNumber,
        lamp_spacing_m: evaluationConfigInputs.lampSpacing.valueAsNumber,
        transit_stop_spacing_m: evaluationConfigInputs.transitSpacing.valueAsNumber,
        crossing_spacing_m: evaluationConfigInputs.crossingSpacing.valueAsNumber,
        entrance_density_ideal: evaluationConfigInputs.entranceDensity.valueAsNumber,
        tree_shade_grid_resolution_m: evaluationConfigInputs.treeGrid.valueAsNumber,
        tree_sun_azimuth_deg: evaluationConfigInputs.sunAzimuth.valueAsNumber,
        tree_sun_elevation_deg: evaluationConfigInputs.sunElevation.valueAsNumber,
        tree_canopy_center_height_ratio: evaluationConfigInputs.canopyCenter.valueAsNumber,
        tree_canopy_vertical_ratio: evaluationConfigInputs.canopyVertical.valueAsNumber,
      },
    };
    const issues = validateEvaluationConfig(candidate);
    for (const input of Object.values(evaluationFields)) {
      input.removeAttribute("aria-invalid");
    }
    for (const issue of issues) {
      evaluationFields[issue.field].setAttribute("aria-invalid", "true");
    }
    evaluationConfigErrorEl.hidden = issues.length === 0;
    evaluationConfigErrorEl.textContent = issues.map((issue) => issue.message).join(" ");
    if (issues.length > 0) return null;
    if (persist) {
      window.localStorage.setItem(EVALUATION_CONFIG_STORAGE_KEY, JSON.stringify(candidate));
    }
    return candidate;
  };

  const handlePointerLockError = () => {
    const { currentLang, flashStatus, updateOverlay } = getContext();
    updateOverlay();
    flashStatus(currentLang.value === "zh"
      ? "浏览器未允许鼠标锁定；可直接按住左键拖动调整视角。"
      : "Browser mouse lock was blocked. Drag with the left mouse button to adjust the view directly.");
  };

  return { syncToggleButtonState, setToggleInput, applyEvaluationConfigToInputs, resolveEvaluationConfigInputs, handlePointerLockError };
}
