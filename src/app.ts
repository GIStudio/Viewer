/**
 * Viewer composition root.
 *
 * Keep this file focused on DOM lookup, controller wiring, shared Three.js runtime
 * state, event delegation, and the animation loop. Do not add feature-specific
 * business logic, large HTML renderers, API orchestration, or panel state machines
 * here. New Viewer features should live in focused modules such as
 * viewer-*-controller.ts, viewer-*-workspace.ts, viewer-*-helpers.ts, or
 * viewer-*.ts render/data helpers, then be wired here through dependency injection.
 *
 * Before adding more than a small event binding to this file, read:
 * ../ARCHITECTURE.md
 */
import "./styles/viewer.css";
import "./style-scene-compare.css";

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

const STRUCTURE_PREVIEW_DEFAULT_STEP_KEY = "scene_preview";

type RecentLayoutsPayload = {
  results?: RecentLayout[];
  error?: string;
};

// Branch types moved to viewer-types.ts

type DesignRunSnapshot = {
  payload: SceneJobStatusPayload;
  preset: DesignPreset | null;
  variant: DesignSchemeVariant;
  prompt: string;
  graphTemplateId: string;
  structureSource?: string;
  semanticSummary?: DesignSemanticSummary;
};

const STREET_FURNITURE_OVERRIDE_PATCHES: Record<string, Record<string, unknown>> = {
  balanced_complete: {
    design_rule_profile: "balanced_complete_street_v1",
    objective_profile: "balanced",
    style_preset: "civic_clean_v1",
    density: 0.6,
    ped_demand_level: "medium",
    bike_demand_level: "medium",
    transit_demand_level: "medium",
    vehicle_demand_level: "medium",
  },
  pedestrian_friendly: {
    design_rule_profile: "pedestrian_priority_v1",
    objective_profile: "balanced",
    style_preset: "lush_walkable_v1",
    density: 0.5,
    ped_demand_level: "high",
    bike_demand_level: "medium",
    transit_demand_level: "medium",
    vehicle_demand_level: "low",
  },
  commercial_vitality: {
    design_rule_profile: "balanced_complete_street_v1",
    objective_profile: "commerce",
    style_preset: "civic_clean_v1",
    density: 0.9,
    ped_demand_level: "high",
    bike_demand_level: "medium",
    transit_demand_level: "high",
    vehicle_demand_level: "medium",
  },
  transit_priority: {
    design_rule_profile: "transit_priority_v1",
    objective_profile: "transit",
    style_preset: "transit_modern_v1",
    density: 0.85,
    ped_demand_level: "high",
    bike_demand_level: "medium",
    transit_demand_level: "high",
    vehicle_demand_level: "high",
  },
  park_landscape: {
    design_rule_profile: "pedestrian_priority_v1",
    objective_profile: "greening",
    style_preset: "lush_walkable_v1",
    density: 0.25,
    ped_demand_level: "medium",
    bike_demand_level: "medium",
    transit_demand_level: "low",
    vehicle_demand_level: "low",
  },
  quiet_residential: {
    design_rule_profile: "pedestrian_priority_v1",
    objective_profile: "greening",
    style_preset: "lush_walkable_v1",
    density: 0.35,
    ped_demand_level: "high",
    bike_demand_level: "medium",
    transit_demand_level: "low",
    vehicle_demand_level: "low",
  },
};

type RoadGen3DCaptureGalleryRequest = {
  layoutPath?: string;
  glbUrl?: string;
  targets?: GalleryCaptureTarget[];
  width?: number;
  height?: number;
};

declare global {
  interface Window {
    __roadgen3dCaptureGallery?: (request: RoadGen3DCaptureGalleryRequest) => Promise<{
      views: Array<{
        target_id: string;
        kind: string;
        label: string;
        image_data_url: string;
        width: number;
        height: number;
      }>;
    }>;
  }
}

// Design presets and runtime constants live in viewer-types.ts.

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

// Forward declaration for currentManifest (defined later in the file)
let currentManifest: ViewerManifest | null = null;

// HitDescriptor type moved to viewer-hit-info.ts

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const AVATAR_HEIGHT_M = 1.7;
const AVATAR_EYE_HEIGHT_M = 1.62;
const THIRD_PERSON_DISTANCE_M = 3.6;
const THIRD_PERSON_VERTICAL_OFFSET_M = 1.1;
const RECENT_LAYOUT_BACKGROUND_LIMIT = 20;
const RECENT_LAYOUT_BACKGROUND_BATCH = 8;

// createTextSprite moved to viewer-utils.ts

// Utility functions moved to viewer-utils.ts: requireElement, escapeHtml, clamp, finiteOrNull, asTriplet, asQuad, isFiniteTriplet

const CATEGORY_COLORS: Record<string, number> = {
  bench: 0x4ade80, lamp: 0xfbbf24, trash: 0xf87171, tree: 0x22c55e,
  mailbox: 0x60a5fa, hydrant: 0xef4444, bollard: 0xa78bfa, bus_stop: 0xfb923c,
};

function setError(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.hidden = false;
}

function clearError(element: HTMLElement): void {
  element.textContent = "";
  element.hidden = true;
}

// disposeObject moved to viewer-utils.ts

// Export colors moved to viewer-export.ts

// exportTopDownMapEnhanced, exportTopDownSvg moved to viewer-export.ts
// loadManifest, clearManifestCache, loadRecentLayouts moved to viewer-api.ts
// inferSpawnFromBbox, manifestCache, parseQueryLayoutPath moved to viewer-api.ts

async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy is unavailable in this browser.");
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

function isRoamMovementKey(code: string): boolean {
  return code === "KeyW"
    || code === "KeyA"
    || code === "KeyS"
    || code === "KeyD"
    || code === "KeyQ"
    || code === "KeyE"
    || code === "ShiftLeft"
    || code === "ShiftRight";
}

function isHeadlessCaptureRequest(): boolean {
  const search = new URLSearchParams(window.location.search);
  const value = search.get("capture") ?? "";
  return value === "1" || value.toLowerCase() === "true";
}

function createAvatarFigure(): THREE.Group {
  const avatar = new THREE.Group();
  avatar.name = "viewer_avatar";
  avatar.userData.viewerHelper = true;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#59708c",
    roughness: 0.82,
    metalness: 0.02,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: "#d9a68c",
    roughness: 0.95,
    metalness: 0.0,
  });
  const legMaterial = new THREE.MeshStandardMaterial({
    color: "#374151",
    roughness: 0.88,
    metalness: 0.02,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.58, 6, 12), bodyMaterial);
  torso.position.set(0, 1.0, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  torso.userData.viewerHelper = true;
  avatar.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), accentMaterial);
  head.position.set(0, 1.48, 0);
  head.castShadow = true;
  head.receiveShadow = true;
  head.userData.viewerHelper = true;
  avatar.add(head);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.56, 4, 10), legMaterial);
  leftLeg.position.set(-0.07, 0.42, 0);
  leftLeg.castShadow = true;
  leftLeg.receiveShadow = true;
  leftLeg.userData.viewerHelper = true;
  avatar.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.07;
  rightLeg.userData.viewerHelper = true;
  avatar.add(rightLeg);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 10), bodyMaterial);
  leftArm.position.set(-0.24, 1.03, 0);
  leftArm.rotation.z = Math.PI / 28;
  leftArm.castShadow = true;
  leftArm.receiveShadow = true;
  leftArm.userData.viewerHelper = true;
  avatar.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.24;
  rightArm.rotation.z = -Math.PI / 28;
  rightArm.userData.viewerHelper = true;
  avatar.add(rightArm);

  return avatar;
}

export type ViewerHostOptions = {
  embedded?: boolean;
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

const STARTER_REVIEW_ONBOARDING_KEY = "roadgen3d:starter-review-onboarding-seen";

function mountViewer(shell: DesktopShell, workflow: WorkflowController, hostOptions: ViewerHostOptions = {}): Promise<() => void> {
  return mountViewerImpl(shell, workflow, hostOptions);
}

async function mountViewerImpl(shell: DesktopShell, workflow: WorkflowController, hostOptions: ViewerHostOptions): Promise<() => void> {
  const root = shell.root;
  root.dataset.workbenchHost = hostOptions.embedded ? "course" : "expert";
  const eventController = new AbortController();
  const { signal } = eventController;
  const captureMode = isHeadlessCaptureRequest();
  let currentLang: ViewerLanguage = loadViewerLanguage();
  const t = (en: string, zh: string): string => viewerText(currentLang, en, zh);
  document.body.classList.toggle("roadgen-capture-mode", captureMode);
  shell.setHints(captureMode
    ? [{ key: "viewer.hints.captureMode" }]
    : [
        { key: "viewer.hints.capture" },
        { key: "viewer.hints.move" },
        { key: "viewer.hints.tools" },
      ]);
  shell.setLeftSections(createViewerLeftSections(t));
  shell.setRightTabs([...createViewerRightTabs(t), ...(hostOptions.modalTabs ?? [])], null);
  const unregisterHostSidebarPages = hostOptions.sidebarPages?.length
    ? shell.sidebar.registerPages(hostOptions.sidebarPages)
    : () => undefined;
  shell.statusStatusHost.innerHTML = `<div id="viewer-status" class="desktop-shell-inline-status" data-i18n-key="viewer.status.loading">${t("Loading viewer...", "正在加载查看器...")}</div>`;
  shell.setStatusSummary({ key: "viewer.status.loading" });
  shell.statusActivityHost.innerHTML = `<div class="desktop-shell-log-entry" data-tone="neutral" data-i18n-key="viewer.status.initialized">${t("Viewer shell initialized.", "查看器框架已初始化。")}</div>`;
  shell.centerStage.innerHTML = createViewerStageHtml();
  // The generation flow is a modal, not a viewer side panel. Keep it outside
  // the canvas grid so a scene reload or a sidebar transition cannot change
  // its containing block and push it out of the viewport.
  const generationDialogPortal = root.querySelector<HTMLElement>("#viewer-generation-dialog");
  if (generationDialogPortal) {
    root.appendChild(generationDialogPortal);
  }
  root.querySelectorAll<HTMLButtonElement>("[data-viewer-modal-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const unavailableMessage = button.dataset.unavailableMessage?.trim();
      if (button.getAttribute("aria-disabled") === "true" && unavailableMessage) {
        shell.setBottomOpen(true);
        shell.setStatusSummary(unavailableMessage);
        shell.pushActivity(unavailableMessage, "warning");
        return;
      }
      const modalId = button.dataset.viewerModalTab;
      if (modalId) shell.openModalTab(modalId);
    }, { signal });
  });
  organizeViewerSettingsTools(root, signal);

  const {
    canvasHost,
    designWorkspaceEl,
    statusEl,
    overlayEl,
    errorEl,
    layoutSelectEl,
    selectEl,
    sceneGraphLinkEl,
    assetEditorLinkEl,
    settingsToggleEl,
    settingsPanelEl,
    settingsCloseEl,
    infoCardEl,
    crosshairEl,
    minimapEl,
    minimapExpandEl,
    minimapPlanCanvas,
    axisHudEl,
    lightingPresetEl,
    exposureInput,
    keyInput,
    fillInput,
    warmthInput,
    shadowInput,
    buildingOpacityInput,
    exposureValueEl,
    keyValueEl,
    fillValueEl,
    warmthValueEl,
    shadowValueEl,
    buildingOpacityValueEl,
    thirdPersonToggleEl,
    frameModeToggleEl,
    assetBboxToggleEl,
    assetMoveToggleEl,
    laserToggleEl,
    designToggleEl,
    designPanelEl,
    generationDialogEl,
    generationSourceSummaryEl,
    generationStrategySummaryEl,
    parameterSkeletonHostEl,
    parameterFurnitureHostEl,
    parameterSummaryEl,
    designReviewRunEl,
    designPresetEl,
    designPromptEl,
    designCountEl,
    designSeedEl,
    designTemplateEl,
    designScenarioEl,
    designScenarioMetaEl,
    designSkeletonSummaryEl,
    designScenarioPreviewEl,
    designScenarioAnnotationEl,
    designScenarioDraftPromptEl,
    designScenarioUseLlmEl,
    designScenarioDraftEl,
    designScenarioUseDraftEl,
    designScenarioDraftResultEl,
    designSkeletonProfileEl,
    designFurnitureProfileEl,
    designFurnitureSummaryEl,
    designMatrixEl,
    designBenchmarkEl,
    designBranchHistoryEl,
    designBranchRunEl,
    designGenerateEl,
    designStatusEl,
    designResultEl,
    evaluatePanelEl,
    evaluateCloseEl,
    evaluateRunEl,
    evaluateContentEl,
    evaluateGateEl,
    evaluationConfigInputs,
    evaluationConfigErrorEl,
    evaluationConfigResetEl,
    comparePanelEl,
    compareSelectAEl,
    compareSelectBEl,
    compareResultsEl,
    exitCompare3dEl,
    consistencyPanelEl,
    consistencyCloseEl,
    consistencyContentEl,
    exportTopdownMapEl,
    exportTopdownSvgEl,
    graphOverlayToggleEl,
    layoutOverlayToggleEl,
    analysisOverlayToggleEl,
    dioramaFinishToggleEl,
    audioToggleEl,
    capabilityStatusEl,
    sceneCommandJsonEl,
    sceneCommandSubmitEl,
    sceneCommandUndoEl,
    sceneCommandStatusEl,
    floatingLanePanelHost,
    generationRunEl,
    syncCameraEl,
    mode3dEl,
    mode2dEl,
    modeGraphEl,
  } = collectViewerPanelElements(root);
  // In the single-left workbench the shell already reserves a real drawer
  // coordinate. Mount settings in that drawer instead of translating a stage
  // child across stacking contexts, which can leave it hidden behind the rail.
  const unregisterSettingsSidebarPage = shell.mode === "legacy_dual"
    ? () => undefined
    : shell.sidebar.registerPages([{
      id: "settings",
      label: t("Settings", "设置"),
      icon: "ST",
      group: "system",
      content: settingsPanelEl,
    }]);
  const assetPolicyInputs = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[name="viewer-generation-asset-policy"]'),
  );
  const generationReadinessEl = root.querySelector<HTMLElement>("#viewer-generation-readiness");
  const generationSourceKindEl = root.querySelector<HTMLElement>("#viewer-generation-source-kind");
  const generationSourceRevisionEl = root.querySelector<HTMLElement>("#viewer-generation-source-revision");
  const generationSourceCountsEl = root.querySelector<HTMLElement>("#viewer-generation-source-counts");
  const generationSourceWarningsEl = root.querySelector<HTMLElement>("#viewer-generation-source-warnings");
  const generationStrategyModeEl = root.querySelector<HTMLElement>("#viewer-generation-strategy-mode");
  const generationOutputSummaryEl = root.querySelector<HTMLElement>("#viewer-generation-output-summary");
  const generationEditSourceEl = root.querySelector<HTMLButtonElement>("#viewer-generation-edit-source");
  const generationCancelJobEl = root.querySelector<HTMLButtonElement>("#viewer-generation-cancel-job");
  const generationRetryEl = root.querySelector<HTMLButtonElement>("#viewer-generation-retry");
  const generationReloadResultEl = root.querySelector<HTMLButtonElement>("#viewer-generation-reload-result");
  const generationCandidateSummaryEl = root.querySelector<HTMLElement>("#viewer-generation-candidate-summary");
  const generationCandidateListEl = root.querySelector<HTMLElement>("#viewer-generation-candidate-list");
  const generationEditCandidatesEl = root.querySelector<HTMLButtonElement>("#viewer-generation-edit-candidates");
  const reviewUsedAssetsEl = root.querySelector<HTMLElement>("#viewer-review-used-assets");
  const evaluateUsedAssetsEl = root.querySelector<HTMLElement>("#viewer-evaluate-used-assets");
  const reviewStateEl = root.querySelector<HTMLElement>("#viewer-result-review-state");
  const reviewRootEl = root.querySelector<HTMLElement>("#viewer-result-review");
  const starterReviewGuideEl = root.querySelector<HTMLElement>("#viewer-starter-review-guide");
  const reviewAcceptEl = root.querySelector<HTMLButtonElement>("#viewer-result-review-accept");
  const reviewChangesEl = root.querySelector<HTMLButtonElement>("#viewer-result-review-changes");
  const reviewAnnotationEl = root.querySelector<HTMLButtonElement>("#viewer-result-review-annotation");
  const emptyStateEl = root.querySelector<HTMLElement>("#viewer-empty-state");
  const viewerShellEl = root.querySelector<HTMLElement>(".viewer-shell-embedded");
  const starterDemoBannerEl = root.querySelector<HTMLElement>("#viewer-starter-demo-banner");
  let activeSceneOrigin: ActiveSceneOrigin | null = workflow.getSnapshot().sceneLayoutPath ? "workflow" : null;
  let activeStarterScene: StarterScenePackage | null = null;
  let starterLoading = false;
  let starterLoadError = "";
  let generationWizard: ReturnType<typeof createViewerGenerationWizardController> | null = null;
  let parameterDesignController: ViewerParameterDesignController | null = null;
  const renderCapabilityStatus = (): void => {
    const capabilities = workflow.getSnapshot().capabilities;
    capabilityStatusEl.innerHTML = renderWorkflowCapabilities(capabilities);
  };
  const renderCandidateRepository = (): void => {
    const preparation = workflow.getSnapshot().assetPreparation;
    const manifests = preparation?.mode === "candidate_manifests" ? preparation.manifests : [];
    const readyCount = manifests.reduce((sum, manifest) => sum + manifest.readyCount, 0);
    if (generationCandidateSummaryEl) {
      generationCandidateSummaryEl.textContent = manifests.length
        ? `${manifests.length} 个清单 · ${readyCount.toLocaleString()} 个可用候选`
        : preparation?.mode === "default_transparent_massing"
          ? "使用默认参数化素材；没有自定义候选清单"
          : "尚未从 01B 加入候选清单";
    }
    if (generationCandidateListEl) {
      generationCandidateListEl.innerHTML = manifests.map((manifest, index) => {
        const categories = Object.entries(manifest.categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([category, count]) => `${escapeHtml(category)} ${Number(count).toLocaleString()}`)
          .join(" · ");
        return `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(manifest.label)}</strong><small>${manifest.readyCount.toLocaleString()} ready${categories ? ` · ${categories}` : ""}</small></div>`;
      }).join("");
    }
  };
  const renderUsedAssetProvenance = (): void => {
    const summary = (currentManifest?.summary ?? {}) as Record<string, unknown>;
    const byManifest = summary.used_asset_ids_by_manifest;
    const groups: Array<{ label: string; ids: string[] }> = [];
    if (byManifest && typeof byManifest === "object" && !Array.isArray(byManifest)) {
      for (const [label, value] of Object.entries(byManifest as Record<string, unknown>)) {
        const ids = Array.isArray(value) ? value.map(String).filter(Boolean) : [];
        if (ids.length) groups.push({ label, ids });
      }
    }
    if (!groups.length && Array.isArray(summary.asset_usage_by_source)) {
      for (const entry of summary.asset_usage_by_source as Array<Record<string, unknown>>) {
        const ids = Array.isArray(entry.asset_ids) ? entry.asset_ids.map(String).filter(Boolean) : [];
        if (ids.length) groups.push({ label: String(entry.source ?? "asset source"), ids });
      }
    }
    const html = groups.length
      ? groups.map((group) => `<details><summary><strong>${escapeHtml(group.label)}</strong><span>${group.ids.length} used</span></summary><ol>${group.ids.map((id) => `<li><code>${escapeHtml(id)}</code></li>`).join("")}</ol></details>`).join("")
      : "当前场景没有记录实际采用的资产；参数化对象不会伪装成资产库记录。";
    if (reviewUsedAssetsEl) reviewUsedAssetsEl.innerHTML = html;
    if (evaluateUsedAssetsEl) evaluateUsedAssetsEl.innerHTML = html;
  };
  const updateGenerationDialogContract = (): void => {
    const snapshot = workflow.getSnapshot();
    const hasApprovedSource = Boolean(
      snapshot.normalized
      && snapshot.approvedSourceRevision === snapshot.sourceRevision,
    );
    generationSourceSummaryEl.textContent = hasApprovedSource
      ? translateViewerKey(currentLang, "viewer.generationDialog.sourceApproved")
      : snapshot.normalized
        ? translateViewerKey(currentLang, "viewer.generationDialog.sourceAwaitingApproval")
        : translateViewerKey(currentLang, "viewer.generationDialog.sourceMissing");
    generationStrategySummaryEl.textContent = "确定性参数化生成";
    if (generationStrategyModeEl) {
      generationStrategyModeEl.textContent = "本次只使用明确的道路骨架与家具参数，不调用 LLM 或 RAG。";
    }
    generationDialogEl.dataset.sourceMode = snapshot.normalized ? "reference_annotation" : "graph_template";
    if (generationSourceKindEl) {
      generationSourceKindEl.textContent = snapshot.normalized
        ? String(snapshot.normalized.source?.kind || snapshot.sourceKind || "ReferenceAnnotation")
        : (designTemplateEl.value.trim() ? "Graph Template" : "尚未选择来源");
    }
    if (generationSourceRevisionEl) {
      generationSourceRevisionEl.textContent = hasApprovedSource ? `source rev ${snapshot.sourceRevision}` : "—";
    }
    if (generationSourceCountsEl) {
      const counts = Object.entries(snapshot.normalized?.featureCounts ?? {}).filter(([, count]) => Number(count) > 0);
      generationSourceCountsEl.innerHTML = counts.length
        ? counts.map(([label, count]) => `<div><strong>${Number(count).toLocaleString()}</strong><span>${escapeHtml(label)}</span></div>`).join("")
        : `<p>批准标注后显示道路、建筑、区域和设施统计。</p>`;
    }
    if (generationSourceWarningsEl) {
      const warnings = snapshot.normalized?.warnings ?? [];
      generationSourceWarningsEl.innerHTML = warnings.length
        ? `<strong>${warnings.length} 个来源提醒</strong>${warnings.slice(0, 4).map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}`
        : `<strong>来源检查通过</strong><p>没有阻塞生成的来源警告。</p>`;
      generationSourceWarningsEl.dataset.tone = warnings.length ? "warning" : "ready";
    }
    assetPolicyInputs.forEach((input) => {
      input.checked = input.value === snapshot.assetPreparationChoice;
    });
    const built = currentGenerationSpecBuild();
    const spec = built.spec;
    const issues = [...built.issues, ...(parameterDesignController?.validationIssues() ?? [])];
    const sourceReady = hasApprovedSource || (spec.sourceMode === "graph_template" && Boolean(spec.graphTemplateId));
    const generationReady = sourceReady && issues.length === 0;
    designGenerateEl.disabled = !generationReady || Boolean(snapshot.busy.generate);
    const missing = [
      ...(!sourceReady ? [spec.sourceMode === "reference_annotation" ? translateViewerKey(currentLang, "viewer.generationDialog.approvalRequired") : "请选择明确的 Graph Template ID"] : []),
      ...issues,
    ].filter(Boolean).join(" · ");
    designGenerateEl.title = generationReady ? "" : missing;
    if (generationReadinessEl) {
      generationReadinessEl.dataset.tone = generationReady ? "ready" : "warning";
      generationReadinessEl.textContent = generationReady
        ? (translateViewerKey(currentLang, "professional.assets.generationReady") ?? "Ready to generate.")
        : (missing || translateViewerKey(currentLang, "professional.assets.policyRequired") || "Choose an asset strategy.");
    }
    renderCandidateRepository();
    renderGenerationOutputSummary(spec, issues);
    generationWizard?.setPrimaryStatus("source", sourceReady ? "complete" : "warning");
    generationWizard?.setPrimaryStatus("strategy", issues.length ? "error" : "complete");
    generationWizard?.setPrimaryStatus("output", generationReady ? "complete" : "pending");
    generationWizard?.setStrategyStatus("skeleton", issues.length ? "error" : "complete");
    generationWizard?.setStrategyStatus("furniture", "complete");
  };
  const renderProfessionalWorkflowState = (): void => {
    renderCapabilityStatus();
    updateGenerationDialogContract();
    renderUsedAssetProvenance();
    parameterDesignController?.refreshSource();
    const snapshot = workflow.getSnapshot();
    const hasWorkflowScene = Boolean(snapshot.sceneLayoutPath);
    const hasCurrentWorkflowScene = hasWorkflowScene
      && snapshot.sceneSourceRevision === snapshot.sourceRevision;
    const hasScene = hasWorkflowScene || activeSceneOrigin === "starter_demo";
    const baseline = snapshot.baselineRun;
    const baselineBusy = baseline.sourceRevision === snapshot.sourceRevision
      && (baseline.status === "queued" || baseline.status === "running");
    generationRunEl.disabled = baselineBusy;
    generationRunEl.title = baselineBusy
      ? (currentLang === "zh" ? "道路基线运行期间请先等待，或取消后再配置设计版本。" : "Wait for the road baseline, or cancel it before configuring a design version.")
      : "";
    if (emptyStateEl && viewerShellEl) {
      emptyStateEl.hidden = hasScene;
      viewerShellEl.dataset.empty = String(!hasScene);
      if (!hasScene) {
        const approved = Boolean(snapshot.normalized && snapshot.approvedSourceRevision === snapshot.sourceRevision);
        const recentOperations = baseline.operations.slice(-3).map((operation) => {
          const message = typeof operation === "string"
            ? operation
            : operation.message ?? operation.stage ?? operation.name ?? "operation";
          return `<li>${escapeHtml(String(message))}</li>`;
        }).join("");
        if (starterLoading) {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card" data-tone="running">
              <span class="viewer-empty-kicker">BUILT-IN DEMO · GUANGZHOU</span>
              <h2>${currentLang === "zh" ? "正在载入广州完整十字路口" : "Loading the complete Guangzhou intersection"}</h2>
              <p>${currentLang === "zh" ? "读取内置 OSM、透明建筑白模与代表性街道设施，不会请求 Overpass。" : "Reading bundled OSM, transparent building massing, and representative street assets without requesting Overpass."}</p>
            </div>`;
        } else if (starterLoadError && !approved) {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card" data-tone="error">
              <span class="viewer-empty-kicker">STARTER DEMO FAILED</span>
              <h2>${currentLang === "zh" ? "默认道路骨架载入失败" : "The starter road skeleton could not be loaded"}</h2>
              <p>${escapeHtml(starterLoadError)}</p>
              <div class="viewer-empty-actions"><button type="button" data-starter-action="retry">${currentLang === "zh" ? "重新载入示例" : "Reload demo"}</button><button type="button" data-starter-action="source">${currentLang === "zh" ? "选择自己的 OSM" : "Choose my own OSM"}</button></div>
            </div>`;
        } else if (baselineBusy) {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card" data-tone="running">
              <span class="viewer-empty-kicker">AUTO BASELINE · SOURCE REV ${baseline.sourceRevision}</span>
              <h2>${currentLang === "zh" ? "正在生成无家具道路基线" : "Generating the furniture-free road baseline"}</h2>
              <p>${escapeHtml(baseline.message || (currentLang === "zh" ? "正在建立道路、铺装与透明建筑白模。" : "Building roads, paving and transparent building massing."))}</p>
              <div class="viewer-empty-progress"><i style="width:${Math.max(0, Math.min(100, baseline.progress))}%"></i></div>
              <div class="viewer-empty-meta"><strong>${Math.round(baseline.progress)}%</strong><span>${escapeHtml(baseline.stage || baseline.status)}</span></div>
              ${recentOperations ? `<ol>${recentOperations}</ol>` : ""}
              <div class="viewer-empty-actions"><button type="button" data-baseline-action="cancel">${currentLang === "zh" ? "取消基线" : "Cancel baseline"}</button></div>
            </div>`;
        } else if (baseline.status === "failed") {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card" data-tone="error">
              <span class="viewer-empty-kicker">BASELINE FAILED · ${escapeHtml(baseline.stage || "failed")}</span>
              <h2>${currentLang === "zh" ? "道路基线生成失败" : "Road baseline generation failed"}</h2>
              <p>${escapeHtml(baseline.error || baseline.message || "Unknown generation error")}</p>
              <div class="viewer-empty-actions"><button type="button" data-baseline-action="retry">${currentLang === "zh" ? "重试生成" : "Retry"}</button><button type="button" data-baseline-action="source">${currentLang === "zh" ? "返回 01A" : "Back to 01A"}</button></div>
            </div>`;
        } else {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card">
              <span class="viewer-empty-kicker">${approved ? "BASELINE READY" : "01A · REFERENCE ANNOTATION"}</span>
              <h2>${approved ? (currentLang === "zh" ? "已批准标注，等待生成道路基线" : "Approved annotation is ready for a road baseline") : (currentLang === "zh" ? "尚无可审核的 3D 场景" : "No reviewable 3D scene yet")}</h2>
              <p>${approved ? (currentLang === "zh" ? "基线只包含道路、铺装和透明建筑白模，不添加任何街道家具。" : "The baseline contains roads, paving and transparent massing, without street furniture.") : (currentLang === "zh" ? "前往 01A 获取 OSM、选择道路并批准完整标注。" : "Open 01A, acquire OSM, select the road and approve the full annotation.")}</p>
              <div class="viewer-empty-actions">${approved ? `<button type="button" data-baseline-action="retry">${currentLang === "zh" ? "生成道路基线" : "Generate road baseline"}</button>` : ""}<button type="button" data-baseline-action="source">${currentLang === "zh" ? "前往 01A" : "Open 01A"}</button></div>
            </div>`;
        }
      }
    }
    if (starterDemoBannerEl) {
      starterDemoBannerEl.hidden = activeSceneOrigin !== "starter_demo";
      const label = starterDemoBannerEl.querySelector<HTMLElement>("[data-starter-demo-label]");
      const summary = starterDemoBannerEl.querySelector<HTMLElement>("[data-starter-demo-summary]");
      if (label && activeStarterScene) label.textContent = `${currentLang === "zh" ? "内置示例" : "Built-in demo"} · ${activeStarterScene.label}`;
      if (summary && activeStarterScene) {
        const counts = activeStarterScene.category_counts;
        summary.textContent = currentLang === "zh"
          ? `真实 OSM 十字路口 · ${counts.building ?? 0} 个透明建筑白模 · ${Object.values(counts).reduce((sum, count) => sum + count, 0) - (counts.building ?? 0)} 个代表性街道设施`
          : `Real OSM intersection · ${counts.building ?? 0} transparent buildings · ${Object.values(counts).reduce((sum, count) => sum + count, 0) - (counts.building ?? 0)} representative street assets`;
      }
    }
    const starterPreview = activeSceneOrigin === "starter_demo";
    if (reviewRootEl) reviewRootEl.dataset.mode = starterPreview ? "starter" : "workflow";
    if (starterReviewGuideEl) starterReviewGuideEl.hidden = !starterPreview;
    if (reviewStateEl) {
      const strong = reviewStateEl.querySelector<HTMLElement>("strong");
      const detail = reviewStateEl.querySelector<HTMLElement>("span");
      const revision = snapshot.sceneRevision ? ` · rev ${snapshot.sceneRevision.revision}` : "";
      if (starterPreview) {
        reviewStateEl.dataset.tone = "ready";
        if (strong) strong.textContent = currentLang === "zh" ? "正在查看内置完整十字路口" : "Viewing the complete built-in intersection";
        if (detail) detail.textContent = currentLang === "zh" ? "这是只读产品示例；下方说明如何生成你自己的 03 结果。" : "This is a read-only product example; follow the guide below to create your own 03 result.";
      } else if (hasWorkflowScene && !hasCurrentWorkflowScene) {
        reviewStateEl.dataset.tone = "warning";
        if (strong) strong.textContent = currentLang === "zh" ? "当前 3D 场景来自较早的标注版本" : "The available 3D scene is based on an earlier annotation";
        if (detail) detail.textContent = currentLang === "zh"
          ? "可继续浏览该场景；请先生成当前标注版本的 3D 场景，再审核或评价。"
          : "You can continue browsing it, but generate the current annotation revision before review or evaluation.";
      } else if (snapshot.sceneReviewStatus === "accepted") {
        reviewStateEl.dataset.tone = "ready";
        if (strong) strong.textContent = translateViewerKey(currentLang, "professional.review.accepted") ?? "Result accepted";
        if (detail) detail.textContent = `${translateViewerKey(currentLang, "professional.review.acceptedHint") ?? "Evaluation and delivery are now available."}${revision}`;
      } else if (snapshot.sceneReviewStatus === "changes_requested") {
        reviewStateEl.dataset.tone = "warning";
        if (strong) strong.textContent = translateViewerKey(currentLang, "professional.review.changesRequested") ?? "Changes requested";
        if (detail) detail.textContent = `${translateViewerKey(currentLang, "professional.review.changesRequestedHint") ?? "Save an edited revision, then review it again."}${revision}`;
      } else if (snapshot.sceneReviewStatus === "pending") {
        reviewStateEl.dataset.tone = "warning";
        if (strong) strong.textContent = translateViewerKey(currentLang, "professional.review.pending") ?? "Generated result awaiting review";
        if (detail) detail.textContent = `${translateViewerKey(currentLang, "professional.review.pendingHint") ?? "Inspect the 3D result before evaluation."}${revision}`;
      } else {
        reviewStateEl.dataset.tone = "empty";
        if (strong) strong.textContent = translateViewerKey(currentLang, "professional.review.noScene") ?? "No generated scene is available.";
        if (detail) detail.textContent = translateViewerKey(currentLang, "professional.review.noSceneHint") ?? "Complete scene generation first.";
      }
    }
    [reviewAcceptEl, reviewChangesEl].forEach((button) => {
      if (button) button.disabled = !hasCurrentWorkflowScene || starterPreview;
    });
    if (reviewAnnotationEl) reviewAnnotationEl.disabled = false;
    if (!hostOptions.embedded) {
      evaluateRunEl.disabled = snapshot.sceneReviewStatus !== "accepted" || Boolean(snapshot.busy.evaluate);
      evaluateRunEl.title = snapshot.sceneReviewStatus === "accepted"
        ? ""
        : (translateViewerKey(currentLang, "professional.pipeline.reviewRequired") ?? "Accept the generated result before evaluation.");
      const gateTitle = evaluateGateEl.querySelector<HTMLElement>("[data-evaluate-gate-title]");
      const gateDetail = evaluateGateEl.querySelector<HTMLElement>("[data-evaluate-gate-detail]");
      const gateAction = evaluateGateEl.querySelector<HTMLButtonElement>("[data-evaluate-gate-action]");
      evaluateGateEl.hidden = snapshot.sceneReviewStatus === "accepted";
      if (!evaluateGateEl.hidden && gateTitle && gateDetail && gateAction) {
        if (starterPreview) {
          evaluateGateEl.dataset.state = "starter";
          gateTitle.textContent = currentLang === "zh" ? "内置示例为只读评价摘要" : "The built-in demo has a read-only evaluation summary";
          gateDetail.textContent = currentLang === "zh" ? "复制示例后即可保存 revision、运行评价和导出。" : "Copy the demo to save revisions, evaluate, and export.";
          gateAction.textContent = currentLang === "zh" ? "复制为我的项目" : "Copy to my project";
          gateAction.dataset.evaluateGateAction = "materialize";
        } else if (!hasCurrentWorkflowScene) {
          evaluateGateEl.dataset.state = "empty";
          gateTitle.textContent = hasWorkflowScene
            ? (currentLang === "zh" ? "现有 3D 场景不是当前标注版本" : "The available 3D scene is not from the current annotation")
            : (currentLang === "zh" ? "尚无可评价的 3D 场景" : "No 3D scene is available for evaluation");
          gateDetail.textContent = currentLang === "zh"
            ? "先生成当前标注版本的 3D 场景；本页仍可查看评价说明。"
            : "Generate the current annotation revision first; this page remains available for guidance.";
          gateAction.textContent = currentLang === "zh" ? "前往生成 3D 场景" : "Go to 3D generation";
          gateAction.dataset.evaluateGateAction = "generate";
        } else {
          evaluateGateEl.dataset.state = "review";
          gateTitle.textContent = currentLang === "zh" ? "当前结果尚未通过审核" : "The current result has not been accepted";
          gateDetail.textContent = currentLang === "zh" ? "评价结果与导出会绑定已接受的 revision。" : "Evaluation and export are bound to an accepted revision.";
          gateAction.textContent = currentLang === "zh" ? "前往 03 接受结果" : "Open 03 result review";
          gateAction.dataset.evaluateGateAction = "review";
        }
      }
    }
  };
  emptyStateEl?.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-baseline-action]")?.dataset.baselineAction;
    if (action === "source") window.location.hash = "scene-graph";
    if (action === "retry") void hostOptions.baselineCoordinator?.retry();
    if (action === "cancel") void hostOptions.baselineCoordinator?.cancel();
  }, { signal });
  const unsubscribeCapabilityStatus = workflow.subscribe(renderProfessionalWorkflowState);
  assetPolicyInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked && (input.value === "current_manifest" || input.value === "default_transparent_massing")) {
        workflow.setAssetPreparationChoice(input.value);
      }
    }, { signal });
  });
  reviewAcceptEl?.addEventListener("click", () => {
    if (!workflow.setSceneReviewStatus("accepted").ok) return;
    mode3dEl.click();
    reviewAcceptEl.closest<HTMLElement>(".desktop-shell-modal")
      ?.querySelector<HTMLButtonElement>(".desktop-shell-modal-close")
      ?.click();
    flashStatus(currentLang === "zh"
      ? "结果已接受，正在自动执行评价；你可以继续浏览 3D 场景。"
      : "Result accepted. Evaluation is running automatically while you browse the 3D scene.");
    void evaluationRunner.run();
  }, { signal });
  reviewChangesEl?.addEventListener("click", () => {
    if (!workflow.setSceneReviewStatus("changes_requested").ok) return;
    root.querySelector<HTMLButtonElement>("#viewer-edit-toggle")?.click();
  }, { signal });
  reviewAnnotationEl?.addEventListener("click", () => { window.location.hash = "scene-graph"; }, { signal });
  generationEditCandidatesEl?.addEventListener("click", () => root.querySelector<HTMLButtonElement>("#viewer-top-assets")?.click(), { signal });
  generationEditSourceEl?.addEventListener("click", () => { window.location.hash = "scene-graph"; }, { signal });
  root.querySelectorAll<HTMLButtonElement>("[data-generation-return-source]").forEach((button) => {
    button.addEventListener("click", () => { window.location.hash = "scene-graph"; }, { signal });
  });
  renderProfessionalWorkflowState();
  if (!hostOptions.embedded && !workflow.getSnapshot().capabilities && !workflow.getSnapshot().busy.capabilities) {
    const capabilityToken = workflow.beginRequest("capabilities");
    void loadWorkflowCapabilities(capabilityToken.signal)
      .then((capabilities) => {
        if (!capabilityToken.isCurrent()) return;
        workflow.setCapabilities(capabilities);
        workflow.endRequest(capabilityToken);
      })
      .catch((error) => {
        workflow.endRequest(capabilityToken);
        shell.pushActivity(
          error instanceof Error ? `Optional capability check unavailable: ${error.message}` : "Optional capability check unavailable.",
          "warning",
        );
      });
  }

  const toggleButtonsByInput = new Map<HTMLInputElement, HTMLButtonElement>();
  const settingToggleButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(".viewer-toggle-button"));
  const displaySettingToggleButtons = settingToggleButtons.filter((button) => button.dataset.toggleInput);

  const syncToggleButtonState = (inputEl: HTMLInputElement): void => {
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

  for (const buttonEl of displaySettingToggleButtons) {
    const inputId = buttonEl.dataset.toggleInput;
    if (!inputId) {
      continue;
    }
    const inputEl = root.querySelector<HTMLInputElement>(`#${CSS.escape(inputId)}`);
    if (!inputEl) {
      continue;
    }
    toggleButtonsByInput.set(inputEl, buttonEl);
    buttonEl.addEventListener("click", () => {
      setToggleInput(inputEl, !inputEl.checked, { emitChange: true });
    });
  }
  for (const inputEl of toggleButtonsByInput.keys()) {
    syncToggleButtonState(inputEl);
  }

  function manifestDefaultsToDioramaFinish(manifest: ViewerManifest | null): boolean {
    if (!manifest) {
      return false;
    }
    const visualStyle = manifest.visual_style ?? null;
    if (visualStyle && Object.keys(visualStyle).length > 0) {
      return true;
    }
    const summary = manifest.summary ?? {};
    return Boolean(
      "visual_style_preset" in summary
      || "scene_texture_pack" in summary
      || "style_preset" in summary
      || "building_generation_mode" in summary
    );
  }

  function syncDesignGraphTemplateId(graphTemplateId: string): void {
    const normalized = graphTemplateId.trim();
    if (!normalized) {
      return;
    }
    if (designTemplateEl.value !== normalized) {
      designTemplateEl.value = normalized;
    }
    designTemplateEl.title = `Current graph template: ${normalized}`;
  }

  function syncDesignGraphTemplateFromManifest(manifest: ViewerManifest | null, layoutPath: string): void {
    const summary = (manifest?.summary ?? {}) as Record<string, unknown>;
    const summaryTemplateId = String(summary.graph_template_id ?? summary.graphTemplateId ?? "").trim();
    const pathTemplateId = inferGraphTemplateIdFromLayoutPath(layoutPath);
    const explicitTemplateId = summaryTemplateId || pathTemplateId;
    if (explicitTemplateId) syncDesignGraphTemplateId(explicitTemplateId);
  }

  function inferGraphTemplateIdFromLayoutPath(layoutPath: string): string {
    const match = layoutPath.match(/(?:^|\/)graph_template\/([^/]+)(?:\/|$)/);
    return match?.[1] ?? "";
  }

  let designScenarioCatalog: ScenarioDesignCatalogPayload | null = null;
  let latestDraftScenario: ScenarioDesign | null = null;
  let designMatrixController: ReturnType<typeof createViewerDesignMatrixController> | null = null;

  function scheduleDesignMatrixRefresh(options: { force?: boolean } = {}): void {
    if (!options.force && panelController && !panelController.isOpen("design")) {
      return;
    }
    designMatrixController?.scheduleRefresh();
  }

  function selectedScenarioDesign(): ScenarioDesign | null {
    const scenarioId = designScenarioEl.value.trim();
    if (!scenarioId) return null;
    if (latestDraftScenario?.scenario_id === scenarioId && latestDraftScenario.enabled !== false) {
      return latestDraftScenario;
    }
    if (!designScenarioCatalog) return null;
    return designScenarioCatalog.items.find((item) => item.scenario_id === scenarioId && item.enabled !== false) ?? null;
  }

  function profileLabel(options: ReadonlyArray<{ id: string; label: string }>, profileId: string): string {
    return options.find((option) => option.id === profileId)?.label ?? profileId;
  }

  function selectedDesignSemanticConfigPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const assetPreparation = workflow.getSnapshot().assetPreparation;
    if (assetPreparation?.mode === "default_transparent_massing") {
      patch.asset_curation_mode = "scene_ready_first";
      patch.building_representation = "transparent_massing";
    } else if (assetPreparation?.mode === "candidate_manifests") {
      patch.asset_curation_mode = "scene_ready_first";
      patch.building_representation = "asset";
    }
    const skeletonProfile = designSkeletonProfileEl.value.trim();
    if (skeletonProfile) {
      patch.skeleton_design_profile = skeletonProfile;
      patch.skeleton_design_profile_source = "manual";
      patch.skeleton_design_profile_confidence = 1;
      patch.skeleton_design_profile_reasons = ["viewer_advanced_override"];
    }
    const furnitureProfile = designFurnitureProfileEl.value.trim();
    if (furnitureProfile) {
      Object.assign(patch, STREET_FURNITURE_OVERRIDE_PATCHES[furnitureProfile] ?? {});
      patch.street_furniture_profile = furnitureProfile;
      patch.street_furniture_profile_source = "manual";
      patch.street_furniture_profile_confidence = 1;
      patch.street_furniture_profile_reasons = ["viewer_advanced_override"];
    }
    return patch;
  }

  function selectedAssetGenerationOptions(): Record<string, unknown> {
    const preparation = workflow.getSnapshot().assetPreparation;
    if (preparation?.mode !== "candidate_manifests") return {};
    return {
      candidate_asset_manifests: preparation.manifests.map((manifest) => ({
        name: manifest.name,
        expected_fingerprint: manifest.fingerprint,
      })),
    };
  }

  function currentGenerationSpecBuild(): ReturnType<typeof buildGenerationRequestSpec> {
    const snapshot = workflow.getSnapshot();
    const parameterOptions = parameterDesignController?.generationOptions() ?? {};
    return buildGenerationRequestSpec({
      normalizedSource: snapshot.normalized,
      graphTemplateId: designTemplateEl.value,
      scenario: null,
      preset: null,
      prompt: "",
      semanticConfigPatch: parameterDesignController?.composeConfigPatch() ?? {},
      generationOptions: {
        ...selectedAssetGenerationOptions(),
        ...parameterOptions,
      },
      variantCount: 1,
      baseSeed: designSeedEl.valueAsNumber,
    });
  }

  function renderGenerationOutputSummary(spec: GenerationRequestSpec, issues: readonly string[]): void {
    if (!generationOutputSummaryEl) return;
    const snapshot = workflow.getSnapshot();
    const assetLabel = "全量受信任资产目录 · 所有用户同一权限";
    const parameterSpec = parameterDesignController?.currentSpec();
    const skeleton = parameterSpec?.skeleton;
    const enabledFurniture = parameterSpec
      ? Object.values(parameterSpec.furniture.categories).filter((item) => item.enabled)
      : [];
    const scenarioLabel = spec.sourceMode === "reference_annotation" ? "保持已批准2D标注" : `Graph Template · ${spec.graphTemplateId || "未选择"}`;
    const rows = [
      ["输入", spec.sourceMode === "reference_annotation" ? "已批准 ReferenceAnnotation" : "本地 Graph Template"],
      ["素材", assetLabel],
      ["道路骨架", skeleton ? `${skeleton.laneCount} × ${skeleton.laneWidthM}m 车道 · 人行道 ${skeleton.sidewalkWidthM}m · 设施带 ${skeleton.furnishingWidthM}m` : scenarioLabel],
      ["中岛 / 公交", skeleton ? `${skeleton.median.enabled ? `${skeleton.median.kind} ${skeleton.median.widthM}m` : "无中岛"} · ${skeleton.busStop.enabled ? skeleton.busStop.placement : "无额外公交站"}` : "—"],
      ["家具", parameterSpec ? `${enabledFurniture.length} 类开启 · 密度 ${parameterSpec.furniture.globalDensity} · ${parameterSpec.furniture.style}` : "全部关闭"],
      ["输出", `1 个确定性场景版本 · seed ${spec.baseSeed}`],
    ];
    generationOutputSummaryEl.innerHTML = `
      <dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      ${issues.length ? `<div class="viewer-generation-spec-issues" role="alert">${issues.map((issue) => `<p>${escapeHtml(issue)}</p>`).join("")}</div>` : ""}
    `;
  }

  function selectedDesignSemanticSummary(preset: DesignPreset | null): DesignSemanticSummary {
    const skeletonProfile = designSkeletonProfileEl.value.trim();
    const furnitureOverride = designFurnitureProfileEl.value.trim();
    const presetProfile = String(preset?.configPatch?.street_furniture_profile ?? "").trim();
    const skeletonLabel = skeletonProfile
      ? `manual override · ${profileLabel(SKELETON_DESIGN_PROFILE_OPTIONS, skeletonProfile)}`
      : "自动解析（人工标注 > LLM 标注 > OSM/POI）";
    const streetFurnitureProfile = furnitureOverride || presetProfile;
    const streetFurnitureLabel = furnitureOverride
      ? `manual override · ${profileLabel(STREET_FURNITURE_PROFILE_OPTIONS, furnitureOverride)}`
      : (preset
        ? `${preset.nameEn} / ${preset.name}`
        : "Custom / LLM-Driven");
    return {
      skeletonLabel,
      skeletonProfile: skeletonProfile || undefined,
      streetFurnitureLabel,
      streetFurnitureProfile: streetFurnitureProfile || undefined,
    };
  }

  function updateDesignLayerSummaries(): void {
    const scenario = selectedScenarioDesign();
    const skeletonProfile = designSkeletonProfileEl.value.trim();
    if (skeletonProfile) {
      designSkeletonSummaryEl.textContent = `A 骨架功能：manual override · ${profileLabel(SKELETON_DESIGN_PROFILE_OPTIONS, skeletonProfile)}`;
      designSkeletonSummaryEl.dataset.tone = "variant";
    } else {
      const scenarioPatch = scenario?.compose_config_patch ?? {};
      const scenarioSkeleton = String(scenarioPatch.skeleton_design_profile ?? "").trim();
      if (scenarioSkeleton) {
        const source = String(scenarioPatch.skeleton_design_profile_source ?? "llm").trim() || "llm";
        designSkeletonSummaryEl.textContent = `A 骨架功能：${source} · ${profileLabel(SKELETON_DESIGN_PROFILE_OPTIONS, scenarioSkeleton)}`;
        designSkeletonSummaryEl.dataset.tone = "variant";
      } else if (scenario) {
        designSkeletonSummaryEl.textContent = "A 骨架功能：来自所选结构标注；若缺失则按 OSM/POI 或默认规则解析。";
        designSkeletonSummaryEl.dataset.tone = "base";
      } else {
        designSkeletonSummaryEl.textContent = "A 骨架功能：自动解析（人工标注 > LLM 标注 > OSM/POI）";
        designSkeletonSummaryEl.dataset.tone = "base";
      }
    }

    const preset = selectedDesignPreset();
    const furnitureOverride = designFurnitureProfileEl.value.trim();
    if (furnitureOverride) {
      designFurnitureSummaryEl.textContent = `B 家具主题：manual override · ${profileLabel(STREET_FURNITURE_PROFILE_OPTIONS, furnitureOverride)}`;
      designFurnitureSummaryEl.dataset.tone = "variant";
    } else if (preset) {
      designFurnitureSummaryEl.textContent = `B 家具主题：${preset.nameEn} / ${preset.name}；控制家具密度、设施组合和渲染风格。`;
      designFurnitureSummaryEl.dataset.tone = "base";
    } else {
      designFurnitureSummaryEl.textContent = "B 家具主题：Custom / LLM-Driven；可从 A 层语义回退推荐。";
      designFurnitureSummaryEl.dataset.tone = "base";
    }
  }

  function renderDesignScenarioOptions(preferredScenarioId: string = designScenarioEl.value): void {
    const referenceMode = Boolean(workflow.getSnapshot().normalized);
    const graphTemplateId = referenceMode ? "" : (designScenarioCatalog?.graph_template_id || designTemplateEl.value.trim());
    const items = designScenarioCatalog?.items ?? [];
    const draftOption = latestDraftScenario
      ? `<option value="${escapeHtml(latestDraftScenario.scenario_id)}">临时结构 · ${escapeHtml(latestDraftScenario.title_zh || latestDraftScenario.scenario_id)}</option>`
      : "";
    designScenarioEl.innerHTML = [
      `<option value="">${referenceMode ? "保持已批准 ReferenceAnnotation" : "基础模板（不套用结构变体）"}</option>`,
      draftOption,
      ...items.map((item) => {
        const enabled = item.enabled !== false;
        const label = enabled
          ? `${item.title_zh || item.scenario_id}`
          : `${item.title_zh || item.scenario_id} (excluded)`;
        return `<option value="${escapeHtml(item.scenario_id)}" ${enabled ? "" : "disabled"}>${escapeHtml(label)}</option>`;
      }),
    ].join("");
    const canRestore = preferredScenarioId && (
      latestDraftScenario?.scenario_id === preferredScenarioId
      || items.some((item) => item.scenario_id === preferredScenarioId && item.enabled !== false)
    );
    designScenarioEl.value = canRestore ? preferredScenarioId : "";
    if (graphTemplateId) syncDesignGraphTemplateId(graphTemplateId);
    updateDesignScenarioMeta();
  }

  function updateDesignScenarioMeta(): void {
    const referenceMode = Boolean(workflow.getSnapshot().normalized);
    const graphTemplateId = referenceMode ? "" : (designScenarioCatalog?.graph_template_id || designTemplateEl.value.trim());
    const scenario = selectedScenarioDesign();
    designScenarioPreviewEl.disabled = !scenario || scenario.preview_layout_exists === false || !scenario.preview_layout_path;
    designScenarioAnnotationEl.disabled = !scenario || (!scenario.annotation && latestDraftScenario?.scenario_id === scenario.scenario_id);
    if (scenario && designScenarioCatalog?.graph_template_id) {
      syncDesignGraphTemplateId(designScenarioCatalog.graph_template_id);
    }
    if (!scenario) {
      designScenarioMetaEl.textContent = referenceMode
        ? "保持已批准 ReferenceAnnotation 的道路中心线、路口、区域与建筑上下文；只应用下方生成参数。"
        : graphTemplateId
          ? `基础模板：${graphTemplateId}。将使用下方街道家具设计目标和补充要求生成。`
          : "尚未选择 Graph Template；请选择明确模板后再生成。";
      designScenarioMetaEl.dataset.tone = "base";
      updateDesignLayerSummaries();
      return;
    }
    if (referenceMode && scenario.template_patch && Object.keys(scenario.compose_config_patch ?? {}).length === 0) {
      designScenarioMetaEl.textContent = "该结构方案只包含 Graph Template 操作，不能应用到当前 ReferenceAnnotation。请取消选择或返回 01A 修改标注。";
      designScenarioMetaEl.dataset.tone = "warning";
      updateDesignLayerSummaries();
      return;
    }
    if (scenario.template_patch) {
      const patchCount = getTemplatePatchOperationCount(scenario.template_patch);
      const defaultCount = Array.isArray(scenario.resolved_defaults) ? scenario.resolved_defaults.length : 0;
      const warningCount = Array.isArray(scenario.warnings) ? scenario.warnings.length : 0;
      const parseMethod = scenario.llm_used ? "LLM semantic parse" : `semantic parse=${scenario.semantic_parse_method || "deterministic"}`;
      designScenarioMetaEl.textContent = `临时结构：${parseMethod} · ${patchCount} 个结构修改 · ${defaultCount} 个自动定位 · ${warningCount} 个提醒。Generate & Load 将使用这个临时结构。`;
      designScenarioMetaEl.dataset.tone = warningCount > 0 ? "warning" : "variant";
      updateDesignLayerSummaries();
      return;
    }
    const previewLabel = scenario.preview_layout_exists === false ? "preview missing" : "preview ready";
    const patchCount = Number(scenario.template_patch_operation_count ?? 0);
    const surfaceCount = Number(scenario.surface_annotation_count ?? 0);
    designScenarioMetaEl.textContent = `结构来源：${scenario.scenario_type || "variant"} · ${patchCount} 个结构修改 · ${surfaceCount} 个设计表面 · ${previewLabel}。预览会打开道路、功能区和建筑体量，不含街道家具；Generate & Load 会根据下一节家具目标生成完整场景。`;
    designScenarioMetaEl.dataset.tone = "variant";
    updateDesignLayerSummaries();
  }

  async function loadDesignScenarioCatalog(): Promise<void> {
    designScenarioMetaEl.textContent = "Loading scenario design variants...";
    designScenarioEl.disabled = true;
    try {
      designScenarioCatalog = await apiJson<ScenarioDesignCatalogPayload>("/api/scenario-designs");
      renderDesignScenarioOptions();
      designScenarioEl.disabled = false;
      scheduleDesignMatrixRefresh();
    } catch (error) {
      designScenarioCatalog = null;
      designScenarioEl.innerHTML = `<option value="">基础模板（不套用结构变体）</option>`;
      designScenarioEl.disabled = false;
      designScenarioMetaEl.textContent = error instanceof Error ? error.message : "Failed to load scenario design variants.";
      designScenarioMetaEl.dataset.tone = "error";
      scheduleDesignMatrixRefresh();
    }
  }

  function getTemplatePatchOperationCount(templatePatch: Record<string, unknown> | undefined): number {
    const operations = templatePatch?.operations;
    return Array.isArray(operations) ? operations.length : 0;
  }

  function summarizeDraftDefaults(defaults: Array<Record<string, unknown>> | undefined): string {
    if (!Array.isArray(defaults) || defaults.length === 0) {
      return "No defaults resolved.";
    }
    return defaults.map((item, index) => {
      const feature = String(item.feature ?? "feature");
      const roadId = String(item.centerline_id ?? item.road_id ?? "primary road");
      const fraction = Number(item.center_fraction ?? 0.5);
      const length = Number(item.length_m ?? 0);
      const width = Number(item.width_m ?? 0);
      const lateral = String(item.lateral_anchor ?? "right_curbside");
      return `${index + 1}. ${feature} on ${roadId}, fraction=${Number.isFinite(fraction) ? fraction.toFixed(2) : "?"}, lateral=${lateral}, ${Number.isFinite(length) && length > 0 ? length.toFixed(1) : "?"}m x ${Number.isFinite(width) && width > 0 ? width.toFixed(1) : "?"}m`;
    }).join("\n");
  }

  function renderDraftScenarioResult(scenario: ScenarioDesign | null, message = ""): void {
    if (!scenario) {
      designScenarioDraftResultEl.textContent = message || "用自然语言先生成一个可验证的临时结构，再选择 Use Draft Structure 参与 Generate & Load。";
      designScenarioDraftResultEl.dataset.tone = "empty";
      designScenarioUseDraftEl.disabled = true;
      return;
    }
    const warnings = Array.isArray(scenario.warnings) ? scenario.warnings : [];
    const citations = Array.isArray(scenario.citations) ? scenario.citations : [];
    const firstCitation = citations.length > 0
      ? String(citations[0]?.title ?? citations[0]?.source_id ?? citations[0]?.knowledge_source ?? "RAG evidence")
      : "none";
    const lines = [
      `临时结构已生成：${scenario.title_zh || scenario.scenario_id}`,
      `semantic_parse=${scenario.semantic_parse_method || "deterministic"} · llm_used=${scenario.llm_used ? "true" : "false"}`,
      ...(!scenario.llm_used && scenario.fallback_reason ? [`fallback: ${scenario.fallback_reason}`] : []),
      summarizeDraftDefaults(scenario.resolved_defaults),
      `patch_ops=${getTemplatePatchOperationCount(scenario.template_patch)} · citations=${citations.length} (${firstCitation}) · warnings=${warnings.length}`,
      ...warnings.map((item) => `warning: ${item}`),
    ];
    designScenarioDraftResultEl.textContent = lines.filter(Boolean).join("\n");
    designScenarioDraftResultEl.dataset.tone = warnings.length > 0 ? "warning" : "ready";
    designScenarioUseDraftEl.disabled = false;
  }

  function scenarioFromDraftPayload(payload: ScenarioDraftVariantPayload, prompt: string): ScenarioDesign {
    const templatePatch = payload.template_patch ?? {};
    const annotationSummary = (payload.annotation_summary ?? {}) as Record<string, unknown>;
    const surfaceCount = Number(
      annotationSummary.surface_annotation_count
      ?? annotationSummary.surface_annotations
      ?? annotationSummary.annotation_surface_count
      ?? 0,
    );
    return {
      scenario_id: payload.scenario_id,
      title_zh: payload.title_zh || `Draft · ${prompt.slice(0, 24)}`,
      scenario_type: payload.scenario_type || "semantic_prompt_variant",
      enabled: true,
      query: payload.prompt || prompt,
      intent_zh: payload.prompt || prompt,
      functional_zone_count: 0,
      surface_annotation_count: Number.isFinite(surfaceCount) ? surfaceCount : 0,
      template_patch_operation_count: getTemplatePatchOperationCount(templatePatch),
      compose_config_patch: {},
      preview_layout_path: "",
      preview_layout_exists: false,
      template_patch: templatePatch,
      semantic_edits: payload.semantic_edits ?? [],
      resolved_defaults: payload.resolved_defaults ?? [],
      warnings: payload.warnings ?? [],
      citations: payload.citations ?? [],
      annotation: payload.annotation,
      annotation_summary: annotationSummary,
      prompt: payload.prompt || prompt,
      llm_requested: payload.llm_requested,
      llm_used: payload.llm_used,
      fallback_reason: payload.fallback_reason,
      semantic_parse_method: payload.semantic_parse_method,
    };
  }

  async function draftDesignScenarioVariant(): Promise<void> {
    const prompt = (
      designScenarioDraftPromptEl.value.trim()
      || designPromptEl.value.trim()
    );
    if (!prompt) {
      renderDraftScenarioResult(null, "请输入一句结构描述，例如：道路中段右侧加公交站，绿色铺装。");
      return;
    }
    if (workflow.getSnapshot().normalized) {
      renderDraftScenarioResult(null, "ReferenceAnnotation 模式不使用 Graph Template 草案。请返回 01A 修改道路结构，或只选择可应用的参数方案。");
      return;
    }
    const graphTemplateId = designTemplateEl.value.trim() || designScenarioCatalog?.graph_template_id || "";
    if (!graphTemplateId) {
      renderDraftScenarioResult(null, "请先选择明确的 Graph Template ID。");
      return;
    }
    designScenarioDraftEl.disabled = true;
    designScenarioUseDraftEl.disabled = true;
    designScenarioDraftResultEl.textContent = "正在创建临时结构并验证结构修改...";
    designScenarioDraftResultEl.dataset.tone = "empty";
    try {
      const payload = await postApiJson<ScenarioDraftVariantPayload>("/api/scenario-designs/draft-variant", {
        prompt,
        graph_template_id: graphTemplateId,
        use_llm: designScenarioUseLlmEl.checked,
      });
      latestDraftScenario = scenarioFromDraftPayload(payload, prompt);
      renderDesignScenarioOptions(latestDraftScenario.scenario_id);
      renderDraftScenarioResult(latestDraftScenario);
      scheduleDesignMatrixRefresh();
      flashStatus(`Draft structure ready: ${latestDraftScenario.title_zh || latestDraftScenario.scenario_id}.`);
    } catch (error) {
      latestDraftScenario = null;
      renderDesignScenarioOptions("");
      renderDraftScenarioResult(null, error instanceof Error ? error.message : "Draft variant failed.");
      scheduleDesignMatrixRefresh();
      setError(errorEl, error instanceof Error ? error.message : "Draft variant failed.");
    } finally {
      designScenarioDraftEl.disabled = false;
    }
  }

  function useLatestDraftScenario(): void {
    if (!latestDraftScenario) {
      renderDraftScenarioResult(null, "No draft structure is available yet.");
      return;
    }
    renderDesignScenarioOptions(latestDraftScenario.scenario_id);
    renderDraftScenarioResult(latestDraftScenario);
    scheduleDesignMatrixRefresh();
    flashStatus(`Using draft structure: ${latestDraftScenario.title_zh || latestDraftScenario.scenario_id}.`);
  }

  async function loadSelectedDesignScenarioPreview(): Promise<void> {
    const scenario = selectedScenarioDesign();
    if (!scenario?.preview_layout_path) return;
    setStatus(`Loading structure preview: ${scenario.title_zh || scenario.scenario_id}...`);
    await sceneSelectionController.loadLayoutSelection(scenario.preview_layout_path, {
      defaultSceneOptionKey: STRUCTURE_PREVIEW_DEFAULT_STEP_KEY,
    });
    const recent = await loadRecentLayouts(50);
    populateRecentLayoutOptions(recent, scenario.preview_layout_path);
    flashStatus(`Structure preview loaded: ${scenario.title_zh || scenario.scenario_id}.`);
  }

  async function openSelectedDesignScenarioAnnotation(): Promise<void> {
    const scenario = selectedScenarioDesign();
    if (!scenario) {
      window.location.hash = "scene-graph";
      return;
    }
    flashStatus(`Opening annotation for ${scenario.title_zh || scenario.scenario_id}...`);
    workflow.setSourceDraft({
      kind: "scenario_design",
      fileName: scenario.scenario_id,
      geojson: null,
    });
    if (scenario.annotation) {
      const token = workflow.beginRequest("normalize");
      try {
        const payload = await normalizeSceneSource({
          source: {
            kind: "reference_annotation",
            source_id: scenario.scenario_id,
            producer: "catalog",
            annotation: scenario.annotation as unknown as ReferenceAnnotation,
          },
        }, token.signal);
        if (token.isCurrent()) {
          workflow.setNormalizedSource(toNormalizedSceneSource(payload));
          workflow.endRequest(token);
        }
      } catch (error) {
        workflow.endRequest(token, error);
      }
    }
    window.location.hash = "scene-graph";
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4f6f2");

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
  const audioManager = new AudioManager(camera, scene);

  function applyAudioProfile(): void {
    const profile = currentManifest?.audio_profile;
    if (profile) {
      audioManager.applyProfile(profile as AudioProfile);
      if (audioToggleEl.checked) {
        audioManager.play();
      }
    } else {
      audioManager.stop();
    }
  }

  audioToggleEl.addEventListener("change", () => {
    if (audioToggleEl.checked) {
      audioManager.play();
    } else {
      audioManager.stop();
    }
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
  renderer.domElement.tabIndex = 0;
  canvasHost.appendChild(renderer.domElement);

  const renderPipeline = createViewerRenderPipeline(
    scene,
    camera,
    renderer,
    canvasHost.clientWidth,
    canvasHost.clientHeight,
  );

  const canvasResizeObserver = new ResizeObserver(() => {
    resizeRenderer();
  });
  canvasResizeObserver.observe(canvasHost);
  const minimapResizeObserver = new ResizeObserver(() => {
    renderMinimapPlanPreview();
  });
  minimapResizeObserver.observe(minimapEl);

  const lightingRig = createViewerLightingRig(scene);

  const controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(camera);

  const avatarFigure = createAvatarFigure();
  avatarFigure.visible = false;
  scene.add(avatarFigure);

  const loader = new GLTFLoader();

  const compareMode = createCompareMode({
    scene,
    camera,
    renderer,
    loader,
    getCurrentRoot: () => currentRoot,
    flashStatus,
    setStatus,
    compareResultsEl,
    exitCompare3dEl,
    escapeHtml,
    compactUiLabel,
    disposeObject,
    loadManifest,
    compareSelectAEl,
    compareSelectBEl,
    getLang: () => currentLang,
  });

  const raycaster = new THREE.Raycaster();
  const clock = new THREE.Clock();
  let animationFrameId = 0;
  let destroyed = false;
  const moveState: MovementState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    lookLeft: false,
    lookRight: false,
    sprint: false,
  };

  const laserBeamGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const laserBeam = new THREE.Line(
    laserBeamGeometry,
    new THREE.LineBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.95 }),
  );
  laserBeam.visible = false;
  laserBeam.userData.viewerHelper = true;
  scene.add(laserBeam);

  const laserHitDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff5a4f }),
  );
  laserHitDot.visible = false;
  laserHitDot.userData.viewerHelper = true;
  scene.add(laserHitDot);

  let currentRoot: THREE.Object3D | null = null;
  let buildingOpacityOverride: number | null = null;
  let currentLayoutPath = "";
  let currentSpawn = new THREE.Vector3(0, 1.65, 0);
  let currentForward = new THREE.Vector3(1, 0, 0);
  let currentAvatarPosition = new THREE.Vector3(0, Math.max(0, 1.65 - AVATAR_EYE_HEIGHT_M), 0);
  let currentCameraMode: CameraMode = "first_person";
  let currentSceneBounds: SceneBounds | null = null;
  let currentLaserHitPoint: THREE.Vector3 | null = null;
  let currentLaserCopyText = "";
  let lastLaserTargetKey = "";
  let flyAnimation: { startAvatarPos: THREE.Vector3; targetAvatarPos: THREE.Vector3; startTime: number; duration: number } | null = null;
  let statusResetHandle: number | null = null;
  let lastBranchRunSnapshot: BranchRunStatusPayload | null = null;
  let selectedBranchNodeId: string | null = null;
  let lastDesignRunSnapshot: DesignRunSnapshot | null = null;
  let graphOverlayActive = false;
  const graphOverlayMarkers: THREE.Object3D[] = [];

  const lightingState: LightingState = {
    ...DEFAULT_LIGHTING_STATE,
  };
  let environmentState: EnvironmentState = {
    ...DEFAULT_ENVIRONMENT_STATE,
  };
  let environmentController: ViewerEnvironmentController;

  let panelController: ViewerPanelController;
  let recentLayoutSelector: RecentLayoutSelectorController;
  const floatingLaneSystem = createFloatingLaneSystem({
    scene,
    camera,
    getManifest: () => currentManifest,
    getSceneBounds: () => currentSceneBounds,
    cameraForwardHorizontal,
    axisHudEl,
    layoutOverlayToggleEl,
    panelHost: floatingLanePanelHost,
    getLanguage: () => currentLang,
  });
  floatingLaneSystem.mountControlPanel();
  const expandedMapController = createExpandedMapController({
    scene,
    getRoot: () => currentRoot,
    getBounds: () => currentSceneBounds,
    getManifest: () => currentManifest,
    getLayoutPath: () => currentLayoutPath || currentManifest?.layout_path || "",
    loadRecentLayouts,
    loadManifest: (layoutPath) => loadManifest(layoutPath),
    getAvatarPosition: () => currentAvatarPosition,
    cameraForwardHorizontal,
    flyCameraTo,
    text: t,
  });

  panelController = createViewerPanelController({
    shell,
    canvasHost,
    panels: {
      settings: settingsPanelEl,
      design: generationDialogEl,
      evaluate: evaluatePanelEl,
      compare: comparePanelEl,
      consistency: consistencyPanelEl,
    },
    settingsToggleEl,
    onSettingsOpen: () => {
      resetMoveState();
      if (controls.isLocked) {
        controls.unlock();
      }
    },
    onSettingsClose: () => {
      // Mouse look is direct left-button dragging; never force browser
      // pointer lock after a panel is closed.
      updateOverlay();
    },
    onDesignOpen: () => {
      updateGenerationDialogContract();
      generationWizard?.open();
    },
    onCompareOpen: populateCompareSelectors,
    onConsistencyOpen: () => renderConsistencyPanel(),
    onCloseAllOverlays: () => {
      if (graphOverlayActive) {
        clearGraphOverlay();
        graphOverlayActive = false;
      }
      if (layoutOverlayToggleEl.checked) {
        setToggleInput(layoutOverlayToggleEl, false);
        floatingLaneSystem.config.enabled = false;
        floatingLaneSystem.clearOverlay();
      }
    },
  });
  generationWizard = createViewerGenerationWizardController({
    dialogEl: generationDialogEl,
    triggerEl: generationRunEl,
    onClose: () => panelController.setOpen("design", false),
    onStepChange: updateGenerationDialogContract,
  });
  parameterDesignController = createViewerParameterDesignController({
    skeletonHostEl: parameterSkeletonHostEl,
    furnitureHostEl: parameterFurnitureHostEl,
    summaryEl: parameterSummaryEl,
    seedEl: designSeedEl,
    allowCustom: !hostOptions.embedded,
    getSource: () => {
      const snapshot = workflow.getSnapshot();
      if (!snapshot.normalized || snapshot.approvedSourceRevision !== snapshot.sourceRevision) return null;
      const sourceFingerprint = String(
        snapshot.annotationDraft?.fingerprint
        || snapshot.normalized.source.fingerprint
        || snapshot.normalized.normalizedAt,
      ).trim();
      if (!sourceFingerprint) return null;
      const centerline = snapshot.normalized.referenceAnnotation.centerlines?.[0] as Record<string, unknown> | undefined;
      const forward = Number(centerline?.forward_drive_lane_count ?? 0);
      const reverse = Number(centerline?.reverse_drive_lane_count ?? 0);
      const laneCount = forward + reverse;
      const roadWidth = Number(centerline?.road_width_m);
      return {
        revision: snapshot.sourceRevision,
        fingerprint: sourceFingerprint,
        values: {
          ...(laneCount > 0 ? { laneCount } : {}),
          ...(laneCount > 0 && Number.isFinite(roadWidth) ? { laneWidthM: roadWidth / laneCount } : {}),
        },
      };
    },
    onChange: updateGenerationDialogContract,
  });
  void parameterDesignController.initialize().then(updateGenerationDialogContract).catch((error) => {
    parameterSummaryEl.innerHTML = `<strong>参数注册表加载失败</strong><small>${escapeHtml(error instanceof Error ? error.message : String(error))}</small>`;
  });
  root.addEventListener("roadgen:workbench-close-active-panel", () => panelController.closeAll(), { signal });
  recentLayoutSelector = createRecentLayoutSelectorController({
    selectEl: layoutSelectEl,
    loadRecentLayouts,
    setRecentLayouts: () => {},
    shouldStopHydration: () => destroyed,
    isCompareOpen: () => false,
    refreshCompareSelectors: populateCompareSelectors,
    defaultLabel: (ordinal) => currentLang === "zh" ? `场景 ${ordinal}` : `Scene ${ordinal}`,
    backgroundLimit: RECENT_LAYOUT_BACKGROUND_LIMIT,
    backgroundBatch: RECENT_LAYOUT_BACKGROUND_BATCH,
  });
  const sceneSelectionController = createViewerSceneSelectionController({
    selectEl,
    errorEl,
    setStatus,
    clearError,
    setCurrentLayoutPath: (layoutPath) => {
      currentLayoutPath = layoutPath;
    },
    setCurrentManifest: (manifest) => {
      currentManifest = manifest;
      setToggleInput(dioramaFinishToggleEl, manifestDefaultsToDioramaFinish(manifest));
      syncDesignGraphTemplateFromManifest(manifest, currentLayoutPath);
    },
    loadScene,
    persistSelectionInUrl: !hostOptions.embedded,
    afterLayoutLoaded: () => {
      updateMetricsPanel();
      renderConsistencyPanel();
      renderUsedAssetProvenance();
      if (graphOverlayActive) {
        setToggleInput(graphOverlayToggleEl, false);
        graphOverlayActive = false;
        clearGraphOverlay();
        currentCameraMode = thirdPersonToggleEl.checked ? "third_person" : "first_person";
        syncCameraRig();
      }
      if (layoutOverlayToggleEl.checked) {
        setToggleInput(layoutOverlayToggleEl, false);
        floatingLaneSystem.config.enabled = false;
        floatingLaneSystem.clearOverlay();
      }
      applyAudioProfile();
      scheduleDesignMatrixRefresh();
      syncSceneCommandEditor();
      const workflowSnapshot = workflow.getSnapshot();
      const standaloneLayout = new URLSearchParams(window.location.search).has("layout");
      if (
        currentManifest?.layout_revision
        && (
          standaloneLayout
          || workflowSnapshot.sceneLayoutPath === currentLayoutPath
          || workflowSnapshot.step === "edit"
          || workflowSnapshot.step === "evaluate"
        )
      ) {
        workflow.setSceneRevision({
          revision: currentManifest.layout_revision.revision,
          sha256: currentManifest.layout_revision.sha256,
          layout_path: currentLayoutPath || currentManifest.layout_path,
        }, workflowSnapshot.undoCommand);
      }
      renderProfessionalWorkflowState();
    },
  });

  async function materializeActiveStarterScene(): Promise<boolean> {
    if (activeSceneOrigin !== "starter_demo" || !activeStarterScene) return true;
    setStatus(currentLang === "zh" ? "正在复制内置示例到专业工作流…" : "Copying the starter demo into the professional workflow…");
    try {
      const materialized = await requestStarterSceneMaterialization(activeStarterScene.id, signal);
      await applyMaterializedStarterScene(workflow, materialized);
      const projectTarget = hostOptions.copyStarterToProject
        ? await hostOptions.copyStarterToProject(materialized.layout_path)
        : null;
      await sceneSelectionController.loadLayoutSelection(projectTarget?.layoutPath ?? materialized.layout_path, {
        persistSelectionInUrl: true,
        defaultSceneOptionKey: "final_scene",
      });
      frameSceneOverview();
      activeSceneOrigin = "workflow";
      activeStarterScene = null;
      starterLoadError = "";
      renderProfessionalWorkflowState();
      flashStatus(currentLang === "zh" ? "示例已复制为我的项目，并创建可追溯方案 A。" : "The demo was copied into my project as traceable Scenario A.");
      hostOptions.onStarterCopied?.();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      starterLoadError = message;
      workflow.reportError(error);
      setStatus(message);
      renderProfessionalWorkflowState();
      return false;
    }
  }

  async function loadStarterScenePreview(): Promise<void> {
    starterLoading = true;
    starterLoadError = "";
    activeSceneOrigin = null;
    renderProfessionalWorkflowState();
    try {
      const starter = await loadDefaultStarterScene(signal);
      await sceneSelectionController.loadLayoutSelection(starter.viewer_manifest_url, {
        persistSelectionInUrl: false,
        defaultSceneOptionKey: "final_scene",
      });
      activeStarterScene = starter;
      activeSceneOrigin = "starter_demo";
      workflow.setStarterPreview(starter.id);
      frameSceneFocus(starter.focus_xz, starter.focus_extent_m);
      const shouldShowStarterReview = hostOptions.showStarterReviewOnLoad !== false
        && (() => {
          try {
            if (localStorage.getItem(STARTER_REVIEW_ONBOARDING_KEY) === "true") return false;
            localStorage.setItem(STARTER_REVIEW_ONBOARDING_KEY, "true");
          } catch {
            // Storage can be unavailable in embedded contexts; preserve the first-open guide.
          }
          return true;
        })();
      if (shouldShowStarterReview) shell.openModalTab("review");
      setStatus(currentLang === "zh" ? "正在预览内置广州完整十字路口。" : "Viewing the built-in complete Guangzhou intersection.");
    } catch (error) {
      activeStarterScene = null;
      activeSceneOrigin = null;
      starterLoadError = error instanceof Error ? error.message : String(error);
      setStatus(starterLoadError);
    } finally {
      starterLoading = false;
      renderProfessionalWorkflowState();
    }
  }

  root.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-starter-action]")?.dataset.starterAction;
    if (action === "materialize") void materializeActiveStarterScene();
    if (action === "source") {
      requestProfessionalOsmPicker();
      window.location.hash = "scene-graph";
    }
    if (action === "retry") void loadStarterScenePreview();
  }, { signal });
  evaluateGateEl.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-evaluate-gate-action]")?.dataset.evaluateGateAction;
    if (action === "materialize") void materializeActiveStarterScene();
    if (action === "generate") generationRunEl.click();
    if (action === "review") shell.openModalTab("review");
  }, { signal });

  const workflowBridge = createViewerWorkflowBridge({
    workflow,
    getPrompt: () => designPromptEl.value,
    getPresetId: () => selectedDesignPreset()?.id || "custom",
    getCurrentLayoutPath: () => currentLayoutPath,
    getCurrentManifest: () => currentManifest,
    shouldSyncGeneratedLayout: () => !parseQueryLayoutPath(),
    loadLayoutSelection: sceneSelectionController.loadLayoutSelection,
    setStatus,
    flashStatus,
  });

  const evaluationFields: Record<EvaluationConfigField, HTMLInputElement> = {
    "aggregation.dimension_weights.walkability": evaluationConfigInputs.walkabilityWeight,
    "aggregation.dimension_weights.safety": evaluationConfigInputs.safetyWeight,
    "aggregation.dimension_weights.beauty": evaluationConfigInputs.beautyWeight,
    "walkability.clear_width_min": evaluationConfigInputs.clearWidthMin,
    "walkability.clear_width_ideal": evaluationConfigInputs.clearWidthIdeal,
    "walkability.amenity_density_ideal": evaluationConfigInputs.furnitureArea,
    "walkability.amenity_count_density_ideal": evaluationConfigInputs.amenityCount,
    "walkability.lamp_spacing_m": evaluationConfigInputs.lampSpacing,
    "walkability.transit_stop_spacing_m": evaluationConfigInputs.transitSpacing,
    "walkability.crossing_spacing_m": evaluationConfigInputs.crossingSpacing,
    "walkability.entrance_density_ideal": evaluationConfigInputs.entranceDensity,
    "walkability.tree_shade_grid_resolution_m": evaluationConfigInputs.treeGrid,
    "walkability.tree_sun_azimuth_deg": evaluationConfigInputs.sunAzimuth,
    "walkability.tree_sun_elevation_deg": evaluationConfigInputs.sunElevation,
    "walkability.tree_canopy_center_height_ratio": evaluationConfigInputs.canopyCenter,
    "walkability.tree_canopy_vertical_ratio": evaluationConfigInputs.canopyVertical,
  };

  const applyEvaluationConfigToInputs = (config: EvaluationConfig): void => {
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

  applyEvaluationConfigToInputs(loadEvaluationConfig(window.localStorage));
  resolveEvaluationConfigInputs(false);
  for (const input of Object.values(evaluationFields)) {
    input.addEventListener("input", () => {
      resolveEvaluationConfigInputs(true);
    }, { signal });
  }
  evaluationConfigResetEl.addEventListener("click", () => {
    applyEvaluationConfigToInputs(cloneEvaluationConfig(DEFAULT_EVALUATION_CONFIG));
    resolveEvaluationConfigInputs(true);
  }, { signal });

  const evaluationRunner = createViewerEvaluationRunner({
    contentEl: evaluateContentEl,
    runButtonEl: evaluateRunEl,
    scene,
    renderer,
    cameraForwardHorizontal,
    avatarEyeHeightM: AVATAR_EYE_HEIGHT_M,
    getCurrentRoot: () => currentRoot,
    getCurrentSpawn: () => currentSpawn,
    getCurrentForward: () => currentForward,
    getCurrentLayoutPath: () => currentLayoutPath,
    getCurrentManifest: () => currentManifest,
    getSelectedPresetId: () => selectedDesignPreset()?.id || "custom",
    getEvaluationConfig: () => {
      const config = resolveEvaluationConfigInputs(true);
      if (!config) {
        root.querySelector<HTMLDetailsElement>("#viewer-evaluation-parameters")?.setAttribute("open", "");
      }
      return config;
    },
    requestEvaluation: hostOptions.runProjectEvaluation
      ? ({ evaluationConfig }) => hostOptions.runProjectEvaluation!(evaluationConfig.aggregation.dimension_weights)
      : undefined,
    workflow,
    setStatus,
    flashStatus,
  });

  const designController = createViewerDesignController({
    designPromptEl,
    designTemplateEl,
    designCountEl,
    designGenerateEl,
    designBenchmarkEl,
    designBranchHistoryEl,
    designBranchRunEl,
    designReviewRunEl,
    designResultEl,
    designWorkspaceEl,
    minimapEl,
    errorEl,
    getSelectedDesignPreset: selectedDesignPreset,
    getDesignSemanticConfigPatch: selectedDesignSemanticConfigPatch,
    getGenerationOptionsPatch: selectedAssetGenerationOptions,
    getDesignSemanticSummary: selectedDesignSemanticSummary,
    hasLastDesignRunSnapshot: () => lastDesignRunSnapshot !== null,
    setSelectedBranchNodeId: (nodeId) => {
      selectedBranchNodeId = nodeId;
    },
    setStatus,
    setError,
    flashStatus,
    updateDesignStatus,
    renderDesignWorkspace,
    hideDesignWorkspace,
    renderBranchWorkspace,
    renderBranchRunResults,
    loadLayoutSelection: sceneSelectionController.loadLayoutSelection,
    populateRecentLayoutOptions,
    getSelectedScenarioDesign: selectedScenarioDesign,
  });

  designMatrixController = createViewerDesignMatrixController({
    matrixEl: designMatrixEl,
    designPromptEl,
    designTemplateEl,
    getSelectedDesignPreset: selectedDesignPreset,
    getSelectedScenarioDesign: selectedScenarioDesign,
    getLatestDraftScenario: () => latestDraftScenario,
    getDesignSemanticConfigPatch: selectedDesignSemanticConfigPatch,
    isReferenceAnnotationMode: () => Boolean(workflow.getSnapshot().normalized),
    getCurrentLayoutPath: () => currentLayoutPath || currentManifest?.layout_path || "",
    loadLayoutSelection: sceneSelectionController.loadLayoutSelection,
    populateRecentLayoutOptions,
    setStatus,
    setError,
    flashStatus,
    updateDesignStatus,
    errorEl,
  });
  if (panelController.isOpen("design")) {
    scheduleDesignMatrixRefresh();
  }

  if (!generationCancelJobEl || !generationRetryEl || !generationReloadResultEl) {
    throw new Error("Generation run controls are incomplete.");
  }
  const generationRunner = createViewerGenerationRunner({
    resultEl: designResultEl,
    statusEl: designStatusEl,
    cancelEl: generationCancelJobEl,
    retryEl: generationRetryEl,
    reloadEl: generationReloadResultEl,
    onRunningChange: (running) => {
      generationWizard?.setBusy(running);
      if (running) {
        generationWizard?.setPrimaryStatus("output", "running");
      } else {
        updateGenerationDialogContract();
      }
    },
    onActivateOutput: () => generationWizard?.activatePrimary("output"),
    onLoadResult: async (result) => {
      const layoutPath = result.scene_layout_path || result.layout_path || "";
      if (!layoutPath) throw new Error("场景已生成，但没有可载入的 scene_layout_path。");
      await sceneSelectionController.loadLayoutSelection(layoutPath, {
        ...(result.scene_glb_path ? { sceneGlbPath: result.scene_glb_path } : {}),
        defaultSceneOptionKey: "final_scene",
      });
      // A freshly generated OSM study area can span hundreds of metres. The
      // walk-through camera is intentionally near eye level, which makes the
      // road plane appear as a thin horizon and transparent massing disappear
      // into the sky. Start result review from a fitted oblique overview; the
      // first click can still enter the road-level walk-through position.
      frameSceneOverview();
      workflow.setGeneratedScene({
        layoutPath,
        ...(currentManifest?.layout_revision ? {
          sceneRevision: {
            revision: currentManifest.layout_revision.revision,
            sha256: currentManifest.layout_revision.sha256,
            layout_path: layoutPath,
            ...(result.scene_glb_path ? { scene_glb_path: result.scene_glb_path } : {}),
          },
        } : {}),
        contextMassing: {
          aligned_building_count: workflow.getSnapshot().normalized?.sourceContext.aligned_buildings?.length ?? 0,
          source_alignment: workflow.getSnapshot().normalized?.sourceContext.source_alignment ?? null,
        },
      });
      const recent = await loadRecentLayouts(50, false);
      populateRecentLayoutOptions(recent, layoutPath);
    },
    onLoaded: () => {
      generationWizard?.close();
      panelController.setOpen("design", false);
      mode3dEl.click();
      flashStatus("Generated scene loaded. You can now preview the corresponding 3D result.");
    },
    setStatus,
  });

  function setStatus(message: string): void {
    if (statusResetHandle !== null) {
      window.clearTimeout(statusResetHandle);
      statusResetHandle = null;
    }
    const localizedMessage = localizeTaskMessage(message);
    statusEl.textContent = localizedMessage;
    shell.setStatusSummary(localizedMessage);
    shell.pushActivity(localizedMessage, "neutral");
  }

  function flashStatus(message: string, durationMs = 1800): void {
    const restoreText = statusEl.textContent || "";
    if (statusResetHandle !== null) {
      window.clearTimeout(statusResetHandle);
    }
    const localizedMessage = localizeTaskMessage(message);
    statusEl.textContent = localizedMessage;
    shell.setStatusSummary(localizedMessage);
    shell.pushActivity(localizedMessage, "success");
    statusResetHandle = window.setTimeout(() => {
      statusEl.textContent = restoreText;
      shell.setStatusSummary(restoreText);
      statusResetHandle = null;
    }, durationMs);
  }

  function localizeTaskMessage(message: string): string {
    if (currentLang !== "zh") return message;
    const normalized = message.trim();
    const fixed: Record<string, string> = {
      "Scene layout failed": "场景布局加载失败。",
      "Scene layout load failed": "场景布局加载失败。",
      "Scene load failed": "场景加载失败。",
      "Viewer unavailable": "查看器不可用。",
      "Capture API ready": "截图接口已就绪。",
      "Scenario preview failed.": "方案预览失败。",
      "Generated scene loaded. Review the 3D result against the approved source.": "已加载生成场景；请根据已批准的输入审核 3D 结果。",
      "Camera reset to scene overview.": "相机已重置为场景总览。",
      "Camera reset to road-level spawn.": "相机已重置为道路平视起点。",
      "Analysis overlay disabled.": "分析叠加层已关闭。",
      "Graph overlay enabled - top-down view": "道路图叠加层已开启（俯视）。",
      "Graph overlay disabled": "道路图叠加层已关闭。",
      "Scene overlay enabled": "场景叠加层已开启。",
      "Scene overlay disabled": "场景叠加层已关闭。",
    };
    if (fixed[normalized]) return fixed[normalized];

    const viewing = normalized.match(/^Viewing\s+(.+)$/i);
    if (viewing) {
      const scene = viewing[1]!.replace(/^Final Scene$/i, "最终场景");
      return `正在查看${scene}`;
    }
    const loading = normalized.match(/^Loading\s+(.+?)(?:…|\.\.\.)$/i);
    if (loading) {
      const scene = loading[1]!.replace(/^Final Scene$/i, "最终场景");
      return `正在加载${scene}…`;
    }
    return message;
  }

  function isMissingSceneLayoutError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
    return message.includes("failed to load manifest") && message.includes("404")
      || message.includes("not found")
      || message.includes("does not exist")
      || message.includes("不存在");
  }

  async function loadBranchLayoutSelection(
    layoutPath: string,
    successMessage: string,
    sceneGlbPath: string = "",
  ): Promise<void> {
    try {
      await sceneSelectionController.loadLayoutSelection(
        layoutPath,
        sceneGlbPath ? { sceneGlbPath } : {},
      );
      const recent = await loadRecentLayouts(50);
      populateRecentLayoutOptions(recent, layoutPath);
      flashStatus(successMessage);
      hideDesignWorkspace();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load layout.";
      setError(errorEl, message);
      setStatus("Scene layout failed");
      if (!isMissingSceneLayoutError(error)) {
        return;
      }

      const fallbackMessage = `Scene manifest missing for ${layoutPath}. It may have been deleted temporarily.`;
      setError(errorEl, `${fallbackMessage} If scene_layout.json is still present, Viewer will attempt to rebuild the GLB from that layout; otherwise generate a new run explicitly.`);
    }
  }

  function applyLightingState(): void {
    const effectiveLightingState = deriveEnvironmentLightingState(lightingState, environmentState);
    applyViewerLightingState({
      scene,
      renderer,
      rig: lightingRig,
      pipeline: renderPipeline,
      state: effectiveLightingState,
    });
  }

  function syncLightingUi(): void {
    lightingPresetEl.value = lightingState.preset;
    exposureInput.value = lightingState.exposure.toString();
    keyInput.value = lightingState.keyLightIntensity.toString();
    fillInput.value = lightingState.fillLightIntensity.toString();
    warmthInput.value = lightingState.warmth.toString();
    shadowInput.value = lightingState.shadowStrength.toString();
    exposureValueEl.textContent = lightingState.exposure.toFixed(2);
    keyValueEl.textContent = lightingState.keyLightIntensity.toFixed(2);
    fillValueEl.textContent = lightingState.fillLightIntensity.toFixed(2);
    warmthValueEl.textContent = lightingState.warmth.toFixed(2);
    shadowValueEl.textContent = lightingState.shadowStrength.toFixed(2);
    crosshairEl.hidden = !laserToggleEl.checked;
    applyLightingState();
  }

  function syncLightingPresetOptions(language: ViewerLanguage): void {
    const selectedPreset = lightingState.preset;
    lightingPresetEl.replaceChildren();
    for (const presetKey of [...Object.keys(LIGHTING_PRESETS), "custom"]) {
      const optionEl = document.createElement("option");
      optionEl.value = presetKey;
      optionEl.textContent = lightingPresetLabel(presetKey, language);
      lightingPresetEl.appendChild(optionEl);
    }
    lightingPresetEl.value = selectedPreset;
  }

  function syncEnvironmentUi(options: { applyMaterials?: boolean } = {}): void {
    environmentController.sync(options);
  }

  environmentController = createViewerEnvironmentController({
    root,
    scene,
    signal,
    getState: () => environmentState,
    setState: (state) => {
      environmentState = state;
    },
    getCurrentRoot: () => currentRoot,
    setToggleInput,
    applyLightingState,
  });

  /* ── Graph Overlay ──────────────────────────────────────────── */

  function clearGraphOverlay(): void {
    for (const marker of graphOverlayMarkers) {
      scene.remove(marker);
      if (marker instanceof THREE.Mesh) {
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
      }
      if (marker instanceof THREE.Sprite) {
        marker.material.map?.dispose();
        marker.material.dispose();
      }
    }
    graphOverlayMarkers.length = 0;
  }

  function buildGraphOverlay(): void {
    clearGraphOverlay();
    if (!currentRoot || !currentManifest) return;

    const instances = currentManifest.instances;
    if (!instances) return;

    for (const [instanceId, info] of Object.entries(instances)) {
      const category = String(info.category || "").trim().toLowerCase();
      const color = CATEGORY_COLORS[category] ?? 0x38bdf8;

      // Find the matching node in the scene
      let targetNode: THREE.Object3D | null = null;
      currentRoot.traverse((child) => {
        if (!child.name) return;
        const match = resolveInstanceIdFromName(child.name);
        if (match === instanceId) targetNode = child;
      });
      if (!targetNode) continue;

      const bbox = new THREE.Box3().setFromObject(targetNode);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      if (size.length() < 0.01) continue;

      // Colored sphere marker at instance center
      const markerGeo = new THREE.SphereGeometry(Math.max(0.25, size.length() * 0.08), 12, 12);
      const markerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(center);
      marker.position.y = bbox.max.y + 0.6;
      marker.userData.isGraphOverlayHelper = true;
      scene.add(marker);
      graphOverlayMarkers.push(marker);

      // Vertical line from object to marker
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(center.x, bbox.max.y, center.z),
        new THREE.Vector3(center.x, bbox.max.y + 0.6, center.z),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const line = new THREE.Line(lineGeo, lineMat);
      line.userData.isGraphOverlayHelper = true;
      scene.add(line);
      graphOverlayMarkers.push(line);

      // Label sprite showing instance id and category
      const labelText = `${instanceId}\n${categoryLabel(category)}`;
      const label = createTextSprite(labelText, color);
      label.position.set(center.x, bbox.max.y + 1.4, center.z);
      label.userData.isGraphOverlayHelper = true;
      scene.add(label);
      graphOverlayMarkers.push(label);
    }

    // Switch camera mode to graph_overlay
    currentCameraMode = "graph_overlay";
    // Position camera for top-down overview
    if (currentSceneBounds) {
      const overviewHeight = currentSceneBounds.extent * 2.5;
      camera.position.set(
        currentSceneBounds.center.x,
        overviewHeight,
        currentSceneBounds.center.z,
      );
      camera.lookAt(currentSceneBounds.center.x, 0, currentSceneBounds.center.z);
    }
  }

  function resizeRenderer(): void {
    const width = Math.max(1, canvasHost.clientWidth);
    const height = Math.max(1, canvasHost.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderPipeline.setSize(width, height);

    expandedMapController.resize();
  }

  /** The lower-right preview uses the canonical Plan compositor without its presentation labels. */
  function renderMinimapPlanPreview(): void {
    const cssWidth = minimapPlanCanvas.clientWidth;
    const cssHeight = minimapPlanCanvas.clientHeight;
    const context = minimapPlanCanvas.getContext("2d");
    if (!context || cssWidth <= 0 || cssHeight <= 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (minimapPlanCanvas.width !== width || minimapPlanCanvas.height !== height) {
      minimapPlanCanvas.width = width;
      minimapPlanCanvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    if (!currentManifest || !currentSceneBounds) return;
    const planCanvas = renderPlanMapCanvas({
      manifest: currentManifest,
      bounds: currentSceneBounds,
      avatarPosition: currentAvatarPosition,
      forward: cameraForwardHorizontal(),
      text: t,
      width,
      height,
      showDecorations: false,
    });
    context.drawImage(planCanvas, 0, 0, width, height);
  }

  function cameraForwardHorizontal(): THREE.Vector3 {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) {
      return currentForward.clone().setY(0).normalize();
    }
    return forward.normalize();
  }

  function updateAvatarTransform(): void {
    avatarFigure.position.copy(currentAvatarPosition);
    avatarFigure.visible = currentCameraMode === "third_person";
    const forward = cameraForwardHorizontal();
    if (forward.lengthSq() > 1e-6) {
      avatarFigure.rotation.y = Math.atan2(forward.x, forward.z);
      currentForward.copy(forward);
    }
  }

  function syncCameraRig(): void {
    updateAvatarTransform();
    const headTarget = currentAvatarPosition.clone().add(new THREE.Vector3(0, AVATAR_EYE_HEIGHT_M, 0));
    const forward = cameraForwardHorizontal();
    if (currentCameraMode === "third_person") {
      camera.position
        .copy(headTarget)
        .add(new THREE.Vector3(0, THIRD_PERSON_VERTICAL_OFFSET_M, 0))
        .add(forward.multiplyScalar(-THIRD_PERSON_DISTANCE_M));
      return;
    }
    camera.position.copy(headTarget);
  }

  function resetView(): void {
    currentAvatarPosition.set(
      currentSpawn.x,
      Math.max(0, currentSpawn.y - AVATAR_EYE_HEIGHT_M),
      currentSpawn.z,
    );
    camera.position.copy(currentSpawn);
    const target = currentSpawn.clone().add(currentForward);
    camera.lookAt(target);
    syncCameraRig();
  }

  function frameSceneOverview(): void {
    if (!currentSceneBounds) return;
    const extent = Math.max(12, currentSceneBounds.extent);
    const center = currentSceneBounds.center;
    currentCameraMode = "frame";
    avatarFigure.visible = false;
    camera.position.set(
      center.x + extent * 0.72,
      center.y + extent * 0.62,
      center.z + extent * 0.72,
    );
    camera.lookAt(center.x, center.y, center.z);
  }

  function frameSceneFocus(centerXZ: readonly [number, number], requestedExtent: number): void {
    if (centerXZ.length !== 2 || !Number.isFinite(centerXZ[0]) || !Number.isFinite(centerXZ[1])) {
      frameSceneOverview();
      return;
    }
    const extent = Math.max(24, Number.isFinite(requestedExtent) ? requestedExtent : 80);
    const centerY = currentSceneBounds?.center.y ?? 0;
    currentCameraMode = "frame";
    avatarFigure.visible = false;
    camera.position.set(
      centerXZ[0] + extent * 0.72,
      centerY + extent * 0.58,
      centerXZ[1] + extent * 0.72,
    );
    camera.lookAt(centerXZ[0], centerY, centerXZ[1]);
  }

  let pointerOutsideViewer = false;

  function updateOverlay(): void {
    const shouldShow = pointerOutsideViewer && !isRoamMovementActive() && !panelController.isAnyOpen();
    overlayEl.hidden = !shouldShow;
    overlayEl.style.display = shouldShow ? "" : "none";
    overlayEl.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  }

  function clearInfoCard(): void {
    infoCardEl.innerHTML = "";
    infoCardEl.hidden = true;
    currentLaserCopyText = "";
  }

  function setInfoCardContent(htmlContent: string): void {
    infoCardEl.innerHTML = htmlContent;
    // Append metrics dashboard after the info card content
    if (currentManifest?.summary) {
      const metricsDiv = document.createElement("div");
      metricsDiv.id = "viewer-metrics-dashboard";
      metricsDiv.className = "viewer-metrics-dashboard";
      metricsDiv.innerHTML = renderMetricsPanel(currentManifest.summary as Record<string, unknown>);
      infoCardEl.appendChild(metricsDiv);
    }
    infoCardEl.hidden = false;
  }

  let lastSceneEditUndo: SceneLayoutEditResponse["undo"] & { layoutPath: string } | null = null;
  let structuredEvaluationController: AbortController | null = null;

  type SceneViewSnapshot = {
    cameraPosition: THREE.Vector3;
    cameraQuaternion: THREE.Quaternion;
    avatarPosition: THREE.Vector3;
    cameraMode: CameraMode;
    editingEnabled: boolean;
    editMode: SceneObjectEditMode;
  };

  function captureSceneViewSnapshot(): SceneViewSnapshot {
    return {
      cameraPosition: camera.position.clone(),
      cameraQuaternion: camera.quaternion.clone(),
      avatarPosition: currentAvatarPosition.clone(),
      cameraMode: currentCameraMode,
      editingEnabled: sceneObjectEditor?.isEnabled?.() ?? false,
      editMode: sceneObjectEditor?.getMode?.() ?? "translate",
    };
  }

  function restoreSceneViewSnapshot(snapshot: SceneViewSnapshot): void {
    currentCameraMode = snapshot.cameraMode;
    currentAvatarPosition.copy(snapshot.avatarPosition);
    camera.position.copy(snapshot.cameraPosition);
    camera.quaternion.copy(snapshot.cameraQuaternion);
    camera.updateMatrixWorld(true);
    thirdPersonToggleEl.checked = snapshot.cameraMode === "third_person";
    updateAvatarTransform();
    renderMinimapPlanPreview();
    if (snapshot.editingEnabled) {
      setObjectEditingEnabled(true, { announce: false });
      sceneObjectEditor.setMode(snapshot.editMode);
    }
    updateOverlay();
  }

  function syncSceneCommandEditor(): void {
    const layoutPath = currentLayoutPath || currentManifest?.layout_path || "";
    sceneCommandJsonEl.value = sceneCommandEnvelopeTemplate(currentManifest, layoutPath);
    sceneCommandSubmitEl.disabled = !layoutPath || !currentManifest?.layout_revision || workflow.getSnapshot().editPending;
    sceneCommandUndoEl.disabled = !lastSceneEditUndo || workflow.getSnapshot().editPending;
    sceneCommandStatusEl.textContent = currentManifest?.layout_revision
      ? `Revision ${currentManifest.layout_revision.revision} · ${currentManifest.layout_revision.sha256.slice(0, 12)}…`
      : "Load a durable generated layout to edit.";
  }

  async function loadSceneEditRevision(
    result: SceneLayoutEditResponse,
    viewSnapshot: SceneViewSnapshot,
  ): Promise<void> {
    clearManifestCache();
    clearRecentLayoutsCache();
    await sceneSelectionController.loadLayoutSelection(result.revision.layout_path, {
      sceneGlbPath: result.revision.scene_glb_path,
    });
    restoreSceneViewSnapshot(viewSnapshot);
    if (!hostOptions.embedded) {
      const recent = await loadRecentLayouts(20, false).catch(() => []);
      recentLayoutSelector.populate(recent, result.revision.layout_path);
    }
    workflow.setSceneRevision({
      revision: result.revision.revision,
      sha256: result.revision.sha256,
      layout_path: result.revision.layout_path,
    }, result.undo.commands[0] ?? null);
    syncSceneCommandEditor();
  }

  async function saveFocusedSceneCommands(
    layoutPath: string,
    base: { revision: number; sha256: string },
    commands: SceneEditCommand[],
  ): Promise<void> {
    const viewSnapshot = captureSceneViewSnapshot();
    workflow.setEditPending(true);
    syncSceneCommandEditor();
    try {
      const result = hostOptions.persistSceneCommands
        ? await hostOptions.persistSceneCommands(commands, { layoutPath })
        : await saveSceneLayoutEdits(layoutPath, base, commands);
      lastSceneEditUndo = { ...result.undo, layoutPath: result.revision.layout_path };
      await loadSceneEditRevision(result, viewSnapshot);
      window.dispatchEvent(new CustomEvent("roadgen3d:scenario-revision-saved", {
        detail: { revision: result.revision.revision, layoutPath: result.revision.layout_path },
      }));
      sceneCommandStatusEl.textContent = `Saved immutable revision ${result.revision.revision}.`;
      if (!hostOptions.embedded && !hostOptions.persistSceneCommands) {
        const savedRevision = result.revision.revision;
        structuredEvaluationController?.abort();
        structuredEvaluationController = new AbortController();
        const evaluationController = structuredEvaluationController;
        window.dispatchEvent(new CustomEvent("roadgen3d:structured-evaluation", { detail: { status: "running", revision: savedRevision } }));
        void postApiJson<Record<string, unknown>>("/api/design/evaluate/unified", {
          layout_path: result.revision.layout_path,
          evaluation_mode: "structured",
        }).then((evaluation) => {
          if (evaluationController.signal.aborted || currentManifest?.layout_revision?.revision !== savedRevision) return;
          window.dispatchEvent(new CustomEvent("roadgen3d:structured-evaluation", { detail: { status: "succeeded", revision: savedRevision, evaluation } }));
          flashStatus("结构化指标已自动更新；视觉指标等待完整评价。");
        }).catch((error) => {
          if (evaluationController.signal.aborted) return;
          window.dispatchEvent(new CustomEvent("roadgen3d:structured-evaluation", { detail: { status: "failed", revision: savedRevision, error: String(error) } }));
          flashStatus("场景已保存；结构化评分暂时失败，可稍后重试。");
        });
      }
    } catch (error) {
      workflow.setEditPending(false);
      workflow.reportError(error);
      syncSceneCommandEditor();
      throw error;
    }
  }

  async function persistCurrentSceneCommands(commands: SceneEditCommand[]): Promise<void> {
    const revision = currentManifest?.layout_revision;
    const layoutPath = currentLayoutPath || currentManifest?.layout_path || "";
    if (!layoutPath || !revision) {
      throw new Error("This scene has no durable revision metadata. Reload it before editing.");
    }
    await saveFocusedSceneCommands(
      layoutPath,
      { revision: revision.revision, sha256: revision.sha256 },
      commands,
    );
  }

  async function undoLastSceneEdit(): Promise<void> {
    const pending = lastSceneEditUndo;
    if (!pending) {
      flashStatus("No persisted scene edit to undo.");
      return;
    }
    lastSceneEditUndo = null;
    try {
      await saveFocusedSceneCommands(pending.layoutPath, pending.base, pending.commands);
      flashStatus("Scene edit undone. Press Cmd/Ctrl+Z again to redo.");
    } catch (error) {
      lastSceneEditUndo = pending;
      syncSceneCommandEditor();
      flashStatus(error instanceof Error ? error.message : "Scene edit undo failed.");
    }
  }

  async function submitSceneCommandEditor(): Promise<void> {
    if (!currentManifest) {
      sceneCommandStatusEl.textContent = "Load a durable generated layout before editing.";
      return;
    }
    try {
      const envelope = parseSceneCommandEnvelope(
        sceneCommandJsonEl.value,
        currentManifest,
        currentLayoutPath || currentManifest.layout_path || "",
      );
      await saveFocusedSceneCommands(envelope.layout_path, envelope.base, envelope.commands);
      flashStatus("JSON move command persisted.");
    } catch (error) {
      sceneCommandStatusEl.textContent = error instanceof Error ? error.message : "Command failed.";
      workflow.reportError(error);
    }
  }

  const objectEditStatusController = createSceneObjectEditStatusController({
    root,
    getLanguage: () => currentLang,
    onExit: () => setObjectEditingEnabled(false),
    signal,
  });

  const editAutosave = createSceneEditAutosaveCoordinator({
    storageKey: hostOptions.embedded ? "course-current" : "expert-current",
    submit: persistCurrentSceneCommands,
    async replayConflict(commands, error): Promise<void> {
      const viewSnapshot = captureSceneViewSnapshot();
      const current = (error as { detail?: { current?: Record<string, unknown> } })?.detail?.current;
      const layoutPath = String(current?.layout_path ?? "");
      if (!layoutPath) throw error;
      await sceneSelectionController.loadLayoutSelection(layoutPath, {
        sceneGlbPath: String(current?.scene_glb_path ?? "") || undefined,
      });
      restoreSceneViewSnapshot(viewSnapshot);
      await persistCurrentSceneCommands(commands.filter((command) => {
        if (command.op === "add_instance") return true;
        const record = currentManifest?.instances?.[command.instance_id];
        return Boolean(record && record.editable !== false);
      }));
    },
    onStatus(status, message): void {
      sceneCommandStatusEl.dataset.saveStatus = status;
      sceneCommandStatusEl.textContent = message;
      objectEditStatusController.setSaveStatus(status);
      window.dispatchEvent(new CustomEvent("roadgen3d:scene-edit-status", { detail: { status, message } }));
    },
    onError(error): void {
      workflow.reportError(error);
    },
  });
  void editAutosave.restore();

  const sceneObjectEditor = createSceneObjectEditorController({
    scene,
    camera,
    renderer,
    courseMode: Boolean(hostOptions.embedded),
    getCurrentRoot: () => currentRoot,
    getManifest: () => currentManifest,
    controlsAreLocked: () => controls.isLocked,
    unlockControls: () => controls.unlock(),
    flashStatus,
    updateHelpers: () => updateAssetBboxHelpers(scene),
    enqueue: (command, options) => editAutosave.enqueue(command, options),
    onInteractionStateChange: (state) => objectEditStatusController.setInteractionState(state),
  });

  let assetBboxEnabledBeforeEditing: boolean | null = null;
  const directEditEl = root.querySelector<HTMLButtonElement>("#viewer-direct-edit");

  function setObjectEditingEnabled(enabled: boolean, options: { announce?: boolean } = {}): void {
    const announce = options.announce ?? true;
    if (enabled) {
      if (!sceneObjectEditor.isEnabled()) {
        assetBboxEnabledBeforeEditing = assetBboxToggleEl.checked;
      }
      sceneObjectEditor.setEnabled(true);
      directEditEl?.setAttribute("aria-pressed", "true");
      if (directEditEl) directEditEl.textContent = currentLang === "zh" ? "退出编辑" : "Exit edit";
      setToggleInput(assetMoveToggleEl, true);
      setToggleInput(assetBboxToggleEl, true);
      createAssetBboxHelpers(scene, currentRoot, currentManifest);
      if (laserToggleEl.checked) {
        setToggleInput(laserToggleEl, false);
        crosshairEl.hidden = true;
        laserBeam.visible = false;
        laserHitDot.visible = false;
        currentLaserHitPoint = null;
        lastLaserTargetKey = "";
      }
      resetMoveState();
      updateOverlay();
      if (announce) flashStatus(currentLang === "zh" ? "地物编辑已开启；选择树木或街具进行编辑。" : "Object editing enabled. Select a tree or street object.");
      return;
    }

    const wasEnabled = sceneObjectEditor.isEnabled();
    sceneObjectEditor.exit();
    directEditEl?.setAttribute("aria-pressed", "false");
    if (directEditEl) directEditEl.textContent = currentLang === "zh" ? "编辑地物" : "Edit objects";
    setToggleInput(assetMoveToggleEl, false);
    if (assetBboxEnabledBeforeEditing !== null) {
      setToggleInput(assetBboxToggleEl, assetBboxEnabledBeforeEditing);
      if (assetBboxEnabledBeforeEditing) createAssetBboxHelpers(scene, currentRoot, currentManifest);
      else removeAssetBboxHelpers(scene);
    }
    assetBboxEnabledBeforeEditing = null;
    resetMoveState();
    renderer.domElement.focus();
    updateOverlay();
    if (announce && wasEnabled) {
      flashStatus(currentLang === "zh" ? "已退出地物编辑；点击场景即可恢复漫游。" : "Object editing exited. Click the scene to resume roaming.");
    }
  }

  const paletteBackingAdapter = hostOptions.assetPaletteAdapter ?? createLocalAssetPaletteAdapter();
  const workflowPaletteAdapter: SceneAssetPaletteAdapter = {
    async load() {
      const palette = await paletteBackingAdapter.load();
      workflow.setAssetPalette(palette);
      return palette;
    },
    async save(palette) {
      const saved = await paletteBackingAdapter.save(palette);
      workflow.setAssetPalette(saved);
      return saved;
    },
  };
  const sceneAssetDialog = createSceneAssetDialog({
    adapter: workflowPaletteAdapter,
    language: () => currentLang,
    flashStatus,
    selectedInstanceId: () => sceneObjectEditor.selectedInstanceId(),
    selectedCategory: () => sceneObjectEditor.selectedCategory(),
    replaceSelected: (asset) => sceneObjectEditor.replaceSelected(asset),
    placeAsset: async (asset) => {
      if (!(await materializeActiveStarterScene())) return false;
      startAssetPlacement(asset);
      return true;
    },
  });
  const openSceneAssetsEl = root.querySelector<HTMLButtonElement>("#viewer-top-assets");
  const openSceneAssets = (): void => { void sceneAssetDialog.open().catch((error) => flashStatus(String(error))); };
  openSceneAssetsEl?.addEventListener("click", openSceneAssets);
  directEditEl?.addEventListener("click", async () => {
    if (!(await materializeActiveStarterScene())) return;
    setObjectEditingEnabled(!sceneObjectEditor.isEnabled());
  }, { signal });
  const scenarioToggleEl = root.querySelector<HTMLButtonElement>("#viewer-scheme-compare-toggle");
  const scenarioWorkbenchEl = root.querySelector<HTMLElement>("#viewer-scenario-workbench");
  const scenarioWorkbench = hostOptions.scenarioAdapter && scenarioToggleEl && scenarioWorkbenchEl
    ? createScenarioWorkbench({
        root: scenarioWorkbenchEl,
        toggle: scenarioToggleEl,
        adapter: hostOptions.scenarioAdapter,
        language: () => currentLang,
        flashStatus,
        loadScenario: async (target) => {
          await sceneSelectionController.loadLayoutSelection(target.layoutPath, {
            sceneGlbPath: target.sceneGlbPath,
            defaultSceneOptionKey: "final_scene",
          });
          frameSceneOverview();
          renderProfessionalWorkflowState();
        },
        openSplitComparison: async (scenarios) => {
          const targets = await Promise.all(scenarios.map(async (scenario) => ({
            scenario,
            target: await hostOptions.scenarioAdapter!.open(scenario.id),
          })));
          const opened = await compareMode.enterCompareSceneSet(targets.map(({ scenario, target }) => ({
            id: scenario.id,
            label: `${scenario.shortLabel} · ${scenario.title}`,
            layoutPath: target.layoutPath,
            glbUrl: target.sceneGlbPath,
          })), t("Scenario comparison", "方案同屏比较"));
          if (opened && buildingOpacityOverride !== null) {
            compareMode.forEachCompareRoot((rootObject) => applyBuildingOpacity(rootObject, null, buildingOpacityOverride!));
          }
          return opened;
        },
        enterManualEdit: async () => {
          if (!(await materializeActiveStarterScene())) return;
          panelController.closeAll();
          setObjectEditingEnabled(true);
        },
      })
    : null;
  if (scenarioToggleEl) scenarioToggleEl.hidden = !scenarioWorkbench;
  const assetPlacementGhost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 0.04, 28),
    new THREE.MeshBasicMaterial({ color: 0xb9d9cc, transparent: true, opacity: 0.78, depthWrite: false }),
  );
  assetPlacementGhost.name = "roadgen3d-asset-placement-ghost";
  assetPlacementGhost.visible = false;
  assetPlacementGhost.userData.viewerHelper = true;
  scene.add(assetPlacementGhost);

  function surfaceRoleForObject(object: THREE.Object3D): string {
    const roles = currentManifest?.surface_diagnostic?.node_roles ?? {};
    let cursor: THREE.Object3D | null = object;
    while (cursor) {
      const direct = String(roles[cursor.name] ?? cursor.userData?.surfaceRole ?? "");
      if (direct) return direct;
      cursor = cursor.parent;
    }
    return "";
  }

  function assetPlacementPoint(
    asset: SceneAssetRef | null,
    pointer: THREE.Vector2 | null,
  ): { point: THREE.Vector3; valid: boolean; role: string } | null {
    if (!currentRoot) return null;
    if (pointer) {
      raycaster.setFromCamera(pointer, camera);
    } else {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      raycaster.set(camera.position, direction.normalize());
    }
    raycaster.far = 220;
    const hit = raycaster.intersectObject(currentRoot, true).find((candidate) => !candidate.object.userData?.viewerHelper);
    if (!hit) return null;
    const role = surfaceRoleForObject(hit.object);
    const allowed = String(asset?.category ?? "").toLowerCase() === "tree"
      ? new Set(["planting", "furnishing", "frontage"])
      : new Set(["sidewalk", "furnishing", "frontage"]);
    return { point: hit.point.clone(), valid: allowed.has(role), role };
  }

  let assetPlacementAsset: SceneAssetRef | null = null;
  const assetPlacementPointer = new THREE.Vector2(0, 0);

  function cancelAssetPlacement(announce = true): void {
    const wasActive = Boolean(assetPlacementAsset);
    assetPlacementAsset = null;
    assetPlacementGhost.visible = false;
    delete root.dataset.assetPlacementActive;
    crosshairEl.hidden = !laserToggleEl.checked;
    if (announce && wasActive) flashStatus("已退出资产放置画笔。");
  }

  function startAssetPlacement(asset: SceneAssetRef): void {
    setObjectEditingEnabled(false, { announce: false });
    assetPlacementAsset = asset;
    root.dataset.assetPlacementActive = "true";
    crosshairEl.hidden = false;
    updateAssetPlacementPreview();
    renderer.domElement.focus();
    flashStatus(`放置 ${asset.label}：点击承载面落点；拖动视角请先按 Esc 退出放置。`);
  }

  function updateAssetPlacementPreview(): void {
    if (!assetPlacementAsset) {
      assetPlacementGhost.visible = false;
      return;
    }
    const placement = assetPlacementPoint(
      assetPlacementAsset,
      isPointerLookActive() ? null : assetPlacementPointer,
    );
    assetPlacementGhost.visible = Boolean(placement);
    if (!placement) return;
    assetPlacementGhost.position.copy(placement.point);
    (assetPlacementGhost.material as THREE.MeshBasicMaterial).color.set(placement.valid ? 0x41a86d : 0xdf654f);
  }

  function placeAssetAtCurrentTarget(): void {
    const asset = assetPlacementAsset;
    const placement = assetPlacementPoint(asset, isPointerLookActive() ? null : assetPlacementPointer);
    if (!asset || !placement?.valid) {
      flashStatus(`该地物不能放在 ${placement?.role || "未知承载面"}；请选择人行道、设施带、种植带或临街区。`);
      return;
    }
    const unique = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36);
    const instanceId = `${asset.category}-${asset.assetId}-${unique}`;
    editAutosave.enqueue({
      command_id: globalThis.crypto?.randomUUID?.() ?? `add-${Date.now()}`,
      op: "add_instance",
      instance_id: instanceId,
      asset_id: asset.assetId,
      category: asset.category,
      asset_ref: asset,
      position_xyz: [placement.point.x, 0, placement.point.z],
      yaw_deg: 0,
      scale: 1,
      height_offset_m: 0,
    }, { debounceMs: 0 });
    flashStatus(`已放置 ${asset.label}，正在保存；可继续点击放置，Esc 退出。`);
  }

  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!assetPlacementAsset || isPointerLookActive()) return;
    const rect = renderer.domElement.getBoundingClientRect();
    assetPlacementPointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    updateAssetPlacementPreview();
  }, { signal });
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (!assetPlacementAsset || event.button !== 0) return;
    if (!isPointerLookActive()) {
      const rect = renderer.domElement.getBoundingClientRect();
      assetPlacementPointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    placeAssetAtCurrentTarget();
  }, { capture: true, signal });
  renderer.domElement.addEventListener("click", (event) => {
    if (!assetPlacementAsset) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, signal });

  const DRAG_LOOK_THRESHOLD_PX = 4;
  const DRAG_LOOK_SENSITIVITY = 0.004;
  const MAX_DRAG_LOOK_PITCH = Math.PI * 0.47;
  let dragLookPointerId: number | null = null;
  let dragLookLastX = 0;
  let dragLookLastY = 0;
  let dragLookDistance = 0;

  const canDragLook = (): boolean => (
    !assetPlacementAsset
    && !sceneObjectEditor.isEnabled()
    && !panelController.isAnyOpen()
    && !compareMode.isCompare3dActive()
    && currentCameraMode !== "graph_overlay"
  );
  const cameraPitch = (): number => {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    return Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
  };
  const finishDragLook = (event: PointerEvent): void => {
    if (dragLookPointerId !== event.pointerId) return;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    dragLookPointerId = null;
    dragLookDistance = 0;
  };
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !canDragLook()) return;
    dragLookPointerId = event.pointerId;
    dragLookLastX = event.clientX;
    dragLookLastY = event.clientY;
    dragLookDistance = 0;
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.focus({ preventScroll: true });
  }, { capture: true, signal });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (dragLookPointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragLookLastX;
    const deltaY = event.clientY - dragLookLastY;
    dragLookLastX = event.clientX;
    dragLookLastY = event.clientY;
    dragLookDistance += Math.abs(deltaX) + Math.abs(deltaY);
    if (dragLookDistance < DRAG_LOOK_THRESHOLD_PX || !canDragLook()) return;

    // Match panorama viewers: horizontal drag turns around world-up, vertical
    // drag changes pitch but cannot flip the camera over at either pole.
    flyAnimation = null;
    camera.rotateOnWorldAxis(UP_AXIS, -deltaX * DRAG_LOOK_SENSITIVITY);
    const nextPitch = THREE.MathUtils.clamp(
      cameraPitch() - deltaY * DRAG_LOOK_SENSITIVITY,
      -MAX_DRAG_LOOK_PITCH,
      MAX_DRAG_LOOK_PITCH,
    );
    camera.rotateX(nextPitch - cameraPitch());
    camera.updateMatrixWorld();
    currentForward.copy(cameraForwardHorizontal());
    if (currentCameraMode === "first_person" || currentCameraMode === "third_person") {
      syncCameraRig();
    }
    event.preventDefault();
  }, { capture: true, signal });
  renderer.domElement.addEventListener("pointerup", finishDragLook, { capture: true, signal });
  renderer.domElement.addEventListener("pointercancel", finishDragLook, { capture: true, signal });

  const commandRegistry = createViewerCommandRegistry({
    "edit.move": () => sceneObjectEditor.setMode("translate"),
    "edit.rotate": () => sceneObjectEditor.setMode("rotate"),
    "edit.scale": () => sceneObjectEditor.setMode("scale"),
    "edit.duplicate": () => sceneObjectEditor.duplicateSelected(),
    "edit.delete": () => sceneObjectEditor.deleteSelected(),
    "edit.assets": () => void sceneAssetDialog.open().catch((error) => flashStatus(String(error))),
    "edit.cancel": () => sceneObjectEditor.cancelStep(),
    "edit.exit": () => setObjectEditingEnabled(false),
    "edit.undo": () => void undoLastSceneEdit(),
    "edit.redo": () => void undoLastSceneEdit(),
    "viewer.settings": () => panelController.toggle("settings", { restoreRoam: true }),
    "viewer.overlay": () => floatingLaneSystem.toggleOverlay(),
    "viewer.reset": resetView,
  });

  async function copyCurrentLaserTargetDetails(): Promise<void> {
    if (!laserToggleEl.checked && !sceneObjectEditor.isEnabled()) {
      flashStatus("Laser pointer and asset move mode are off.");
      return;
    }
    const text = currentLaserCopyText.trim();
    if (!text) {
      flashStatus("No laser target to copy.");
      return;
    }
    try {
      await writeTextToClipboard(text);
      flashStatus("Copied laser target details.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clipboard copy failed.";
      flashStatus(message);
    }
  }

  function handleKey(event: KeyboardEvent, active: boolean): void {
    if (active && event.code === "Escape" && sceneAssetDialog.isOpen()) {
      event.preventDefault();
      sceneAssetDialog.close();
      return;
    }
    if (active && event.code === "Escape" && assetPlacementAsset) {
      event.preventDefault();
      cancelAssetPlacement();
      return;
    }
    if (active && event.code === "Escape" && panelController.isAnyOpen()) {
      event.preventDefault();
      panelController.closeAll();
      return;
    }
    if (
      active
      && !event.repeat
      && event.code === "KeyM"
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && !isEditableTarget(event.target)
    ) {
      event.preventDefault();
      if (controls.isLocked) controls.unlock();
      expandedMapController.open();
      return;
    }
    if (
      active
      && !event.repeat
      && event.code === "KeyZ"
      && (event.ctrlKey || event.metaKey)
      && !event.altKey
      && (!event.shiftKey || (event.ctrlKey || event.metaKey))
      && !isEditableTarget(event.target)
      && lastSceneEditUndo
    ) {
      event.preventDefault();
      commandRegistry.execute(event.shiftKey ? "edit.redo" : "edit.undo");
      return;
    }
    const editShortcutActive = sceneObjectEditor.isEnabled()
      && !isPointerLookActive()
      && !isEditableTarget(event.target)
      && !panelController.isAnyOpen();
    if (active && !event.repeat && editShortcutActive) {
      if (event.code === "KeyG") {
        event.preventDefault();
        commandRegistry.execute("edit.move");
        return;
      }
      if (event.code === "KeyR" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        commandRegistry.execute("edit.rotate");
        return;
      }
      if (event.code === "KeyS" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        commandRegistry.execute("edit.scale");
        return;
      }
      if (event.code === "KeyD" && event.shiftKey) {
        event.preventDefault();
        commandRegistry.execute("edit.duplicate");
        return;
      }
      if (event.code === "Delete" || event.code === "Backspace") {
        event.preventDefault();
        commandRegistry.execute("edit.delete");
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        const result = sceneObjectEditor.cancelStep();
        if (result === "nothing_to_cancel") {
          commandRegistry.execute("edit.exit");
        } else if (result === "transform_cancelled") {
          flashStatus(currentLang === "zh" ? "已取消本次变换；再次按 Esc 取消选择。" : "Transform cancelled. Press Esc again to clear the selection.");
        } else {
          flashStatus(currentLang === "zh" ? "已取消选择；再次按 Esc 退出地物编辑。" : "Selection cleared. Press Esc again to exit object editing.");
        }
        return;
      }
      if (event.code === "KeyA" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        commandRegistry.execute("edit.assets");
        return;
      }
    }
    const movementKey = isRoamMovementKey(event.code);
    const sceneRoamActive = isPointerLookActive() || isKeyboardRoamActive();
    if (
      movementKey
      && active
      && isEditableTarget(event.target)
    ) {
      resetMoveState();
      return;
    }
    if (
      movementKey
      && active
      && panelController.isAnyOpen()
      && !sceneRoamActive
    ) {
      resetMoveState();
      return;
    }
    if (
      movementKey
      && active
      && !sceneRoamActive
    ) {
      return;
    }
    if (
      active
      && !event.repeat
      && event.code === "KeyC"
      && (event.ctrlKey || event.metaKey)
      && !event.altKey
      && !isEditableTarget(event.target)
      && laserToggleEl.checked
    ) {
      event.preventDefault();
      void copyCurrentLaserTargetDetails();
      return;
    }
    switch (event.code) {
      case "KeyW":
        moveState.forward = active;
        break;
      case "KeyS":
        moveState.backward = active;
        break;
      case "KeyA":
        moveState.left = active;
        break;
      case "KeyD":
        moveState.right = active;
        break;
      case "KeyQ":
        moveState.lookLeft = active;
        break;
      case "KeyE":
        moveState.lookRight = active;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        moveState.sprint = active;
        break;
      case "KeyR":
        if (active) {
          commandRegistry.execute("viewer.reset");
        }
        break;
      case "KeyP":
        if (active && !event.repeat) {
          commandRegistry.execute("viewer.settings");
        }
        break;
      case "KeyL":
        if (active && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
          commandRegistry.execute("viewer.overlay");
        }
        break;
      case "Digit1":
      case "Digit2":
      case "Digit3":
      case "Digit4":
      case "Digit5":
      case "Digit6":
      case "Digit7":
      case "Digit8":
      case "Digit9":
        if (active && !event.repeat && floatingLaneSystem.config.enabled) {
          const laneIndex = parseInt(event.code.replace("Digit", "")) - 1;
          const bands = currentManifest?.layout_overlay?.bands ?? [];
          if (laneIndex >= 0 && laneIndex < bands.length) {
            floatingLaneSystem.selectLane(laneIndex);
          }
        }
        break;
      case "Escape":
        if (active && (floatingLaneSystem.config.selectedLaneIndex ?? -1) >= 0) {
          floatingLaneSystem.config.selectedLaneIndex = -1;
          floatingLaneSystem.buildOverlay();
        }
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function resetMoveState(): void {
    moveState.forward = false;
    moveState.backward = false;
    moveState.left = false;
    moveState.right = false;
    moveState.lookLeft = false;
    moveState.lookRight = false;
    moveState.sprint = false;
  }

  function isKeyboardRoamActive(): boolean {
    return (currentCameraMode === "first_person" || currentCameraMode === "third_person")
      && !sceneObjectEditor.isEnabled()
      && !panelController.isAnyOpen()
      && document.visibilityState === "visible"
      && document.hasFocus();
  }

  function isPointerLookActive(): boolean {
    return controls.isLocked || document.pointerLockElement === renderer.domElement;
  }

  function isRoamMovementActive(): boolean {
    return isPointerLookActive() || isKeyboardRoamActive();
  }

  function configureSceneObjectShadows(rootObject: THREE.Object3D): void {
    rootObject.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      if (isEnvironmentSkyDomeObject(mesh)) {
        prepareEnvironmentSkyDomeObject(mesh);
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) {
          if (material && "depthWrite" in material && material.transparent) {
            material.depthWrite = false;
          }
        }
      } else if (mesh.material && "depthWrite" in mesh.material && mesh.material.transparent) {
        mesh.material.depthWrite = false;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const isTransparentMassing = materials.some((material) => (
        material?.name === "roadgen3d_transparent_massing"
      ));
      if (isTransparentMassing && !mesh.userData.roadgenMassingOutlineAdded) {
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, 20),
          new THREE.LineBasicMaterial({
            color: 0x6f8792,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
          }),
        );
        outline.name = `${mesh.name || "transparent_massing"}__outline`;
        outline.renderOrder = 4;
        outline.userData.isRenderHelper = true;
        outline.raycast = () => undefined;
        mesh.userData.roadgenMassingOutlineAdded = true;
        mesh.add(outline);
      }
    });
  }

  function isBuildingMesh(mesh: THREE.Mesh, manifest: ViewerManifest | null): boolean {
    const diagnosticRole = manifest?.surface_diagnostic?.node_roles?.[mesh.name] ?? "";
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const descriptor = [
      diagnosticRole,
      mesh.userData?.surfaceRole,
      mesh.userData?.surface_role,
      mesh.userData?.visual_surface_role,
      mesh.name,
      mesh.parent?.name,
      ...materials.map((material) => material?.name ?? ""),
    ].map((value) => String(value ?? "")).join(" ");
    return /(?:building|massing|facade|tower|house)/i.test(descriptor);
  }

  function buildingMaterials(rootObject: THREE.Object3D, manifest: ViewerManifest | null): THREE.Material[] {
    const materials = new Set<THREE.Material>();
    rootObject.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material || !isBuildingMesh(mesh, manifest)) return;
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      meshMaterials.forEach((material) => { if (material) materials.add(material); });
    });
    return [...materials];
  }

  function applyBuildingOpacity(rootObject: THREE.Object3D, manifest: ViewerManifest | null, opacity: number): void {
    const nextOpacity = THREE.MathUtils.clamp(opacity, 0.1, 1);
    buildingMaterials(rootObject, manifest).forEach((material) => {
      if (typeof material.userData.viewerOriginalTransparent !== "boolean") {
        material.userData.viewerOriginalTransparent = material.transparent;
      }
      material.opacity = nextOpacity;
      material.transparent = nextOpacity < 0.999 || Boolean(material.userData.viewerOriginalTransparent);
      material.depthWrite = nextOpacity >= 0.999 && !material.userData.viewerOriginalTransparent;
      material.needsUpdate = true;
    });
  }

  function authoredBuildingOpacity(rootObject: THREE.Object3D, manifest: ViewerManifest | null): number {
    const material = buildingMaterials(rootObject, manifest)[0];
    return material ? THREE.MathUtils.clamp(material.opacity, 0.1, 1) : 1;
  }

  function syncBuildingOpacityUi(): void {
    const value = buildingOpacityOverride ?? (currentRoot ? authoredBuildingOpacity(currentRoot, currentManifest) : 1);
    buildingOpacityInput.value = value.toFixed(2);
    buildingOpacityValueEl.textContent = `${Math.round(value * 100)}%`;
  }

  function updateLaserPointer(): void {
    if (!laserToggleEl.checked || !currentRoot) {
      laserBeam.visible = false;
      laserHitDot.visible = false;
      currentLaserHitPoint = null;
      lastLaserTargetKey = "";
      clearInfoCard();
      return;
    }

    const origin = camera.position.clone();
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    raycaster.set(origin, direction.normalize());
    raycaster.far = 220;

    const floatingLaneTargets = scene.children.filter((child) => child.userData?.isFloatingLane);
    const intersections = raycaster
      .intersectObjects([currentRoot, ...floatingLaneTargets], true)
      .filter((hit) => !(hit.object.userData && hit.object.userData.viewerHelper));

    const hit = intersections[0];
    const beamEnd = hit ? hit.point.clone() : origin.clone().add(direction.multiplyScalar(120));
    const positions = (laserBeam.geometry as THREE.BufferGeometry).getAttribute("position");
    positions.setXYZ(0, origin.x, origin.y, origin.z);
    positions.setXYZ(1, beamEnd.x, beamEnd.y, beamEnd.z);
    positions.needsUpdate = true;
    laserBeam.visible = true;

    if (!hit) {
      laserHitDot.visible = false;
      currentLaserHitPoint = null;
      lastLaserTargetKey = "";
      clearInfoCard();
      return;
    }

    currentLaserHitPoint = hit.point.clone();
    laserHitDot.visible = true;
    laserHitDot.position.copy(hit.point);

    // Check if clicked on a floating lane diagnostic overlay.
    if (hit.object.userData.isFloatingLane) {
      const overlayInstanceId = typeof hit.object.userData.instanceId === "string" ? hit.object.userData.instanceId : "";
      if (overlayInstanceId) {
        const targetKey = `floating-instance:${overlayInstanceId}`;
        if (lastLaserTargetKey !== targetKey) {
          floatingLaneSystem.selectInstance(overlayInstanceId);
          setInfoCardContent(`<div class="hit-descriptor"><strong>${overlayInstanceId}</strong><br>Floating Lane orientation selected</div>`);
          lastLaserTargetKey = targetKey;
        }
        return;
      }
      if (typeof hit.object.userData.bandIndex === "number") {
        const targetKey = `floating-band:${hit.object.userData.bandIndex}`;
        if (lastLaserTargetKey === targetKey) return;
        floatingLaneSystem.selectLane(hit.object.userData.bandIndex);
        const bandKind = hit.object.userData.bandKind || "unknown";
        const bandLabel = floatingLaneSystem.getLaneLabel(bandKind);
        setInfoCardContent(`<div class="hit-descriptor"><strong>${bandLabel}</strong><br>Click again to deselect</div>`);
        lastLaserTargetKey = targetKey;
        return;
      }
    }

    const targetKey = `scene:${hit.object.uuid}`;
    if (lastLaserTargetKey === targetKey) return;
    const descriptor = resolveHitDescriptor(hit.object, hit.point.clone(), currentManifest ?? undefined, currentLang);
    if (!descriptor) {
      lastLaserTargetKey = "";
      clearInfoCard();
      return;
    }
    const content = buildHitDescriptorContent(descriptor, currentManifest ?? undefined, currentLang);
    currentLaserCopyText = content.text;
    setInfoCardContent(content.html);
    lastLaserTargetKey = targetKey;
  }

  async function loadScene(option: SceneOption): Promise<void> {
    const loadStart = performance.now();
    clearError(errorEl);
    setStatus(`Loading ${option.label}…`);
    setObjectEditingEnabled(false, { announce: false });
    if (controls.isLocked) {
      controls.unlock();
    }

    if (currentRoot) {
      scene.remove(currentRoot);
      disposeObject(currentRoot);
      currentRoot = null;
    }
    currentSceneBounds = null;
    renderMinimapPlanPreview();
    removeAnalysisOverlayHelpers(scene);
    removeFrameAndAssetHelpers(scene);

    applyAudioProfile();

    clearInfoCard();
    currentLaserHitPoint = null;
    laserHitDot.visible = false;
    laserBeam.visible = false;

    const gltfLoadStart = performance.now();
    const gltf = await loader.loadAsync(option.glbUrl);
    const gltfLoadMs = (performance.now() - gltfLoadStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.glTF (${option.label}): ${gltfLoadMs} ms`);

    currentRoot = gltf.scene;
    prepareEnvironmentSkyDomes(currentRoot);
    const shadowStart = performance.now();
    configureSceneObjectShadows(currentRoot);
    if (buildingOpacityOverride !== null) {
      applyBuildingOpacity(currentRoot, currentManifest, buildingOpacityOverride);
    }
    syncBuildingOpacityUi();
    const shadowMs = (performance.now() - shadowStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.shadows (${option.label}): ${shadowMs} ms`);
    if (dioramaFinishToggleEl.checked) {
      applyAnalyticalDioramaFinish(currentRoot, currentManifest ?? undefined);
    }
    scene.add(currentRoot);

    const auxStart = performance.now();
    if (!captureMode && frameModeToggleEl.checked && currentRoot) {
      createFrameHelpers(scene, currentRoot);
    }

    if (!captureMode && assetBboxToggleEl.checked && currentRoot) {
      createAssetBboxHelpers(scene, currentRoot, currentManifest);
    }
    if (!captureMode) {
      refreshAnalysisOverlayForSelectedBranch();
    }
    const auxMs = (performance.now() - auxStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.aux (${option.label}): ${auxMs} ms`);

    const boundsStart = performance.now();
    const bbox = sceneContentBounds(currentRoot);
    const validatedSize = new THREE.Vector3();
    bbox.getSize(validatedSize);
    if (
      bbox.isEmpty()
      || ![validatedSize.x, validatedSize.y, validatedSize.z].every(Number.isFinite)
      || Math.max(validatedSize.x, validatedSize.z) < 0.5
    ) {
      scene.remove(currentRoot);
      disposeObject(currentRoot);
      currentRoot = null;
      currentSceneBounds = null;
      renderMinimapPlanPreview();
      throw new Error("The scene contains no usable road geometry or has invalid bounds.");
    }
    const spawnCenter = new THREE.Vector3();
    bbox.getCenter(spawnCenter);
    const spawn = inferSpawnFromBbox({ center: spawnCenter }, currentManifest ?? {
      layout_path: "",
      final_scene: { label: "Final Scene", glb_url: option.glbUrl },
      production_steps: [],
      default_selection: "final_scene",
    });
    currentSpawn = spawn.position;
    currentForward = spawn.forward;
    currentSceneBounds = sceneBoundsFromManifest(bbox, currentManifest);
    renderMinimapPlanPreview();
    const boundsMs = (performance.now() - boundsStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.bounds (${option.label}): ${boundsMs} ms`);
    fitViewerLightingRigToBounds(lightingRig, bbox);
    expandedMapController.render();
    resetView();
    const params = currentManifest?.lighting_params as Partial<LightingState> | undefined;
    const presetKey = currentManifest?.lighting_preset;
    const hasPostProcessParams = Boolean(
      params
      && (
        "ambientOcclusion" in params
        || "bloomStrength" in params
        || "fogDensity" in params
        || "sunElevation" in params
        || "sunAzimuth" in params
      ),
    );
    if (params && hasPostProcessParams) {
      lightingState.preset = presetKey || "custom";
      Object.assign(lightingState, completeLightingValues(params));
    } else if (presetKey && LIGHTING_PRESETS[presetKey]) {
      lightingState.preset = presetKey;
      Object.assign(lightingState, completeLightingValues(LIGHTING_PRESETS[presetKey]));
    }
    const summaryEnvironment = currentManifest?.summary?.environment_system as Record<string, unknown> | undefined;
    environmentController.resetFromManifest(
      currentManifest?.environment_state
      ?? summaryEnvironment?.environment_state,
    );
    syncLightingUi();
    setStatus(`Viewing ${option.label}`);
    console.info(`[viewer-timing] loadScene.total (${option.label}): ${(performance.now() - loadStart).toFixed(1)} ms`);
  }

  window.__roadgen3dCaptureGallery = async (request: RoadGen3DCaptureGalleryRequest) => {
    const targets = Array.isArray(request?.targets) ? request.targets : [];
    if (targets.length === 0) {
      return { views: [] };
    }
    const width = Math.max(64, Math.trunc(Number(request?.width) || 1280));
    const height = Math.max(64, Math.trunc(Number(request?.height) || 720));
    if (request?.layoutPath) {
      const manifest = await loadManifest(request.layoutPath, false);
      currentManifest = manifest;
      currentLayoutPath = manifest.layout_path || request.layoutPath;
      await loadScene({
        key: "capture_scene",
        label: "Capture Scene",
        glbUrl: manifest.final_scene.glb_url,
      });
    } else if (request?.glbUrl) {
      await loadScene({
        key: "capture_scene",
        label: "Capture Scene",
        glbUrl: request.glbUrl,
      });
    }
    const views = await captureGalleryViews(
      {
        scene,
        renderer,
        cameraForwardHorizontal,
        currentRoot,
        currentSpawn,
        currentForward,
        avatarEyeHeightM: AVATAR_EYE_HEIGHT_M,
      },
      targets,
      width,
      height,
    );
    return { views };
  };

  function populateRecentLayoutOptions(layouts: RecentLayout[], selectedPath: string): void {
    recentLayoutSelector.populate(layouts, selectedPath);
  }

  function scheduleRecentLayoutHydration(selectedPath: string, initialLoaded: number): void {
    recentLayoutSelector.hydrate(selectedPath, initialLoaded);
  }

  function populateDesignPresets(): void {
    designPresetEl.innerHTML = "";
    
    // Add custom/LLM-driven option first
    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "Custom / LLM-Driven（自定义）";
    designPresetEl.appendChild(customOption);
    
    // Add all presets
    for (const preset of VIEWER_DESIGN_PRESETS) {
      const optionEl = document.createElement("option");
      optionEl.value = preset.id;
      optionEl.textContent = `${preset.nameEn} / ${preset.name}`;
      optionEl.title = preset.description;
      designPresetEl.appendChild(optionEl);
    }
    
    // Default to custom (LLM-driven)
    designPresetEl.value = "__custom__";
  }

  function selectedDesignPreset(): DesignPreset | null {
    const selectedId = designPresetEl.value;
    if (selectedId === "__custom__") {
      return null; // No preset, let LLM drive
    }
    return VIEWER_DESIGN_PRESETS.find((preset) => preset.id === selectedId) ?? null;
  }

  function updateDesignStatus(message: string, tone: "neutral" | "success" | "warning" | "error" = "neutral"): void {
    const localizedMessage = localizeTaskMessage(message);
    designStatusEl.textContent = localizedMessage;
    designStatusEl.dataset.tone = tone;
    shell.pushActivity(localizedMessage, tone);
    shell.setStatusSummary(localizedMessage);
  }

  function openDesignStageDiagnostic(stage: string): void {
    const snapshot = lastDesignRunSnapshot;
    if (!snapshot) return;
    const step = stepForStage(stage);
    const operation = latestOperationForStage(snapshot.payload, stage);
    const detail = operation?.detail ?? {};
    const modal = document.createElement("div");
    modal.className = "viewer-design-diagnostic-modal";
    modal.innerHTML = `
      <div class="viewer-design-diagnostic-backdrop" data-design-modal-close="true"></div>
      <article class="viewer-design-diagnostic-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(step.label)} algorithm detail">
        <header class="viewer-design-diagnostic-header">
          <div>
            <span>${escapeHtml(step.shortLabel)}</span>
            <h3>${escapeHtml(step.label)} · 算法详情</h3>
            <p>${escapeHtml(operation?.message || step.detailHint)}</p>
          </div>
          <button class="viewer-settings-close" type="button" data-design-modal-close="true" aria-label="Close diagnostic">x</button>
        </header>
        <div class="viewer-design-diagnostic-body">
          ${renderStageDiagnosticContent(stage, detail)}
        </div>
      </article>
    `;
    designWorkspaceEl.appendChild(modal);
  }

  function closeDesignStageDiagnostic(): void {
    designWorkspaceEl.querySelector(".viewer-design-diagnostic-modal")?.remove();
  }

  function renderDesignStageTree(payload: SceneJobStatusPayload, currentStage: string, failed: boolean): void {
    const stageNodes: StageNode[] = buildDesignStageNodes(payload, currentStage, failed);

    // Create container for G6
    const containerId = "viewer-g6-stage-tree";
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      
      // Insert before stage cards
      const stageCards = designWorkspaceEl.querySelector(".viewer-design-stage-cards");
      if (stageCards && stageCards.parentNode) {
        stageCards.parentNode.insertBefore(container, stageCards);
      } else {
        designWorkspaceEl.appendChild(container);
      }
    }

    // Render G6 tree
    renderG6StageTree(`#${containerId}`, stageNodes, (nodeId) => {
      openDesignStageDiagnostic(nodeId);
    });
  }

  function renderDesignWorkspace(
    payload: SceneJobStatusPayload,
    preset: DesignPreset | null,
    variant: DesignSchemeVariant,
    prompt: string,
    graphTemplateId: string,
    structureSource?: string,
    semanticSummary?: DesignSemanticSummary,
  ): void {
    lastDesignRunSnapshot = { payload, preset, variant, prompt, graphTemplateId, structureSource, semanticSummary };
    designReviewRunEl.disabled = false;
    const rendered = renderDesignWorkspaceHtml(payload, preset, variant, prompt, graphTemplateId, structureSource, semanticSummary);
    designWorkspaceEl.hidden = false;
    minimapEl.hidden = true; // Hide minimap when design workspace is visible
    designWorkspaceEl.innerHTML = rendered.html;
    
    if (rendered.treeReady) {
      requestAnimationFrame(() => {
        renderDesignStageTree(payload, rendered.stage, rendered.failed);
      });
    } else {
      disposeStageTree();
    }
  }

  function hideDesignWorkspace(): void {
    designWorkspaceEl.hidden = true;
    minimapEl.hidden = false; // Show minimap when design workspace is hidden
    disposeStageTree();
    designWorkspaceEl.innerHTML = "";
  }

  function reviewLastDesignRun(): void {
    if (!lastDesignRunSnapshot) return;
    renderDesignWorkspace(
      lastDesignRunSnapshot.payload,
      lastDesignRunSnapshot.preset,
      lastDesignRunSnapshot.variant,
      lastDesignRunSnapshot.prompt,
      lastDesignRunSnapshot.graphTemplateId,
      lastDesignRunSnapshot.structureSource,
      lastDesignRunSnapshot.semanticSummary,
    );
    flashStatus("Design generation steps reopened.");
  }

  function renderBranchWorkspace(payload: BranchRunStatusPayload): void {
    lastBranchRunSnapshot = payload;
    const selected = resolveSelectedBranchNode(payload, selectedBranchNodeId);
    selectedBranchNodeId = selected?.node_id ?? selectedBranchNodeId;
    designWorkspaceEl.hidden = false;
    minimapEl.hidden = true;
    designWorkspaceEl.innerHTML = renderBranchWorkspaceHtml(payload, selected, designPromptEl.value.trim());
    revealAnalysisOverlayForSelectedBranch();
    requestAnimationFrame(() => {
      mountBranchScoreScatter3d(designWorkspaceEl, payload, selected?.node_id ?? null, (nodeId) => {
        selectedBranchNodeId = nodeId;
        renderBranchWorkspace(payload);
      });
    });
  }

  function renderBranchRunResults(payload: BranchRunStatusPayload): void {
    designResultEl.innerHTML = renderBranchRunResultsHtml(payload);
  }

  function selectedBranchNodeForAnalysisOverlay(): BranchRunNode | null {
    if (!lastBranchRunSnapshot) return null;
    return resolveSelectedBranchNode(lastBranchRunSnapshot, selectedBranchNodeId) ?? null;
  }

  function branchNodeHasAnalysisOverlayFeatures(node: BranchRunNode | null): boolean {
    if (!node) return false;
    if ((node.influence_rows ?? []).some((row) => row.active)) return true;
    const analysisFeatures = node.analysis_features as Record<string, unknown> | undefined;
    return Boolean(analysisFeatures && Object.keys(analysisFeatures).length > 0);
  }

  function refreshAnalysisOverlayForSelectedBranch(options: { flash?: boolean } = {}): number {
    removeAnalysisOverlayHelpers(scene);
    if (!analysisOverlayToggleEl.checked || !currentRoot || !currentManifest) return 0;
    const selectedNode = selectedBranchNodeForAnalysisOverlay();
    if (!branchNodeHasAnalysisOverlayFeatures(selectedNode)) return 0;
    const highlightCount = createAnalysisOverlayHelpers(scene, currentRoot, currentManifest, selectedNode);
    if (options.flash && highlightCount > 0) {
      flashStatus(`Analysis overlay highlighted ${highlightCount} active feature${highlightCount === 1 ? "" : "s"}.`);
    }
    return highlightCount;
  }

  function revealAnalysisOverlayForSelectedBranch(): void {
    const selectedNode = selectedBranchNodeForAnalysisOverlay();
    if (!branchNodeHasAnalysisOverlayFeatures(selectedNode)) {
      refreshAnalysisOverlayForSelectedBranch();
      return;
    }
    if (!analysisOverlayToggleEl.checked) {
      setToggleInput(analysisOverlayToggleEl, true);
    }
    refreshAnalysisOverlayForSelectedBranch();
  }


  function populateCompareSelectors(): void {
    const layouts = recentLayoutSelector.currentLayouts();
    const optionsHtml = layouts
      .map(l => `<option value="${escapeHtml(l.layout_path)}">${escapeHtml(compactUiLabel(l.label))}</option>`)
      .join("");
    compareSelectAEl.innerHTML = optionsHtml;
    compareSelectBEl.innerHTML = optionsHtml;
    // Default: current layout as A
    if (currentLayoutPath) {
      compareSelectAEl.value = currentLayoutPath;
      // Default B to a different layout if available
      const other = layouts.find(l => l.layout_path !== currentLayoutPath);
      if (other) compareSelectBEl.value = other.layout_path;
    }
  }

  function flyCameraTo(
    x: number,
    y: number,
    z: number,
    durationMs = 900,
  ): void {
    // Map and scene-click destinations always resume at pedestrian eye level.
    // Do not retain a tilted overview camera when the avatar arrives.
    const forward = cameraForwardHorizontal();
    currentCameraMode = "first_person";
    avatarFigure.visible = false;
    currentForward.copy(forward);
    const eye = currentAvatarPosition.clone().add(new THREE.Vector3(0, AVATAR_EYE_HEIGHT_M, 0));
    camera.position.copy(eye);
    camera.lookAt(eye.clone().add(forward));
    camera.updateMatrixWorld();
    flyAnimation = {
      startAvatarPos: currentAvatarPosition.clone(),
      targetAvatarPos: new THREE.Vector3(x, y, z),
      startTime: performance.now(),
      duration: durationMs,
    };
    if (controls.isLocked) {
      controls.unlock();
    }
  }

  const sceneClickRoamController = createSceneClickRoamController({
    camera,
    element: renderer.domElement,
    getCurrentRoot: () => currentRoot,
    isEnabled: () => (
      (currentCameraMode === "frame" || currentCameraMode === "graph_overlay")
      &&
      !controls.isLocked
      && !sceneObjectEditor.isEnabled()
      && !assetPlacementAsset
      && !panelController.isAnyOpen()
      && !compareMode.isCompare3dActive()
    ),
    onScenePoint: (point) => {
      flyCameraTo(point.x, Math.max(0, currentAvatarPosition.y), point.z, 900);
      flashStatus(currentLang === "zh"
        ? "正在漫游到点击位置；按住左键拖动可调整视角，WASD 可继续移动。"
        : "Moving to the clicked location. Drag with the left mouse button to look around; WASD continues movement.");
    },
  });

  minimapPlanCanvas.addEventListener("click", (event) => {
    if (sceneObjectEditor.isEnabled() || assetPlacementAsset || panelController.isAnyOpen()) return;
    const rect = minimapPlanCanvas.getBoundingClientRect();
    const destination = minimapToWorld(
      event.clientX - rect.left,
      event.clientY - rect.top,
      currentSceneBounds,
      minimapPlanCanvas,
    );
    if (!destination) return;
    event.preventDefault();
    event.stopPropagation();
    flyCameraTo(destination.x, Math.max(0, currentAvatarPosition.y), destination.z, 900);
    flashStatus(currentLang === "zh"
      ? "正在漫游到小地图选择的位置。"
      : "Moving to the location selected on the minimap.");
  }, { signal });

  /* ── Metrics Panel in Info Card ──────────────────────────── */

  function renderConsistencyPanel(): void {
    if (!consistencyContentEl) return;
    const summary = currentManifest?.summary as Record<string, unknown> | undefined;
    const solverMetrics = (currentManifest?.solver_metrics ?? {}) as Record<string, unknown>;
    const formatBool = (value: unknown): string => {
      if (typeof value === "boolean") return value ? "true" : "false";
      return value == null ? "—" : String(value);
    };
    const formatNum = (value: unknown, digits = 2): string => {
      const n = Number(value);
      return Number.isFinite(n) ? n.toFixed(digits) : "—";
    };
    const rows = [
      ["conversion_ok", formatBool(summary?.conversion_ok ?? solverMetrics.conversion_ok)],
      ["geo_delta", formatNum(summary?.geo_delta ?? solverMetrics.geo_delta, 2)],
      ["node_recall", formatNum(summary?.node_recall ?? solverMetrics.node_recall, 2)],
      ["edge_recall", formatNum(summary?.edge_recall ?? solverMetrics.edge_recall, 2)],
      ["topology_ok", formatBool(summary?.topology_ok ?? solverMetrics.topology_ok)],
      ["topology_validity", formatNum(summary?.topology_validity ?? solverMetrics.topology_validity, 2)],
      ["rule_satisfaction_rate", formatNum(summary?.rule_satisfaction_rate ?? solverMetrics.rule_satisfaction_rate, 2)],
      ["cross_section_feasibility", formatNum(summary?.cross_section_feasibility ?? solverMetrics.cross_section_feasibility, 2)],
    ];
    consistencyContentEl.innerHTML = `
      <div class="viewer-consistency-stack">
        ${rows.map(([label, value]) => `
          <div class="viewer-consistency-row">
            <span class="viewer-consistency-label">${label}</span>
            <strong class="viewer-consistency-value">${value}</strong>
          </div>
        `).join("")}
      </div>
      <details class="viewer-consistency-details">
        <summary>loss_digest / 容差说明</summary>
        <div class="viewer-consistency-details-body">
          ${escapeHtml(String(summary?.loss_digest ?? solverMetrics.loss_digest ?? "Geometry positions may shift within tolerance; road topology remains consistent."))}
        </div>
      </details>
      ${renderCameraSurfaceDiagnosticControls(t, Boolean(currentRoot && currentManifest))}
    `;
    const modeEl = consistencyContentEl.querySelector<HTMLSelectElement>("#viewer-surface-diagnostic-mode");
    if (modeEl) {
      modeEl.value = cameraDiagnosticColorMode;
      modeEl.addEventListener("change", () => {
        cameraDiagnosticColorMode = modeEl.value === "patch" ? "patch" : "role";
      }, { signal });
    }
    consistencyContentEl
      .querySelector<HTMLButtonElement>("#viewer-export-camera-surface-diagnostic")
      ?.addEventListener("click", () => void exportCurrentCameraSurfaceDiagnostic(), { signal });
  }

  function updateMetricsPanel(): void {
    const metricsHost = document.getElementById("viewer-metrics-dashboard");
    if (!metricsHost) return;
    const summary = currentManifest?.summary;
    if (!summary) {
      metricsHost.innerHTML = "";
      return;
    }
    metricsHost.innerHTML = renderMetricsPanel(summary as Record<string, unknown>);
  }

  canvasHost.addEventListener("pointerenter", () => {
    pointerOutsideViewer = false;
    updateOverlay();
  }, { signal });
  canvasHost.addEventListener("pointerleave", () => {
    pointerOutsideViewer = true;
    updateOverlay();
  }, { signal });
  const overlayStateObserver = new MutationObserver(() => updateOverlay());
  overlayStateObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ["data-open"] });
  signal.addEventListener("abort", () => overlayStateObserver.disconnect(), { once: true });

  sceneGraphLinkEl.addEventListener(
    "click",
    () => {
      window.location.hash = "#scene-graph";
    },
    { signal },
  );

  assetEditorLinkEl.addEventListener(
    "click",
    () => {
      window.location.hash = "#asset-editor";
    },
    { signal },
  );

  function exportCurrentPlan(format: "png" | "svg"): void {
    const context = {
      manifest: currentManifest,
      bounds: currentSceneBounds,
      avatarPosition: currentAvatarPosition,
      forward: cameraForwardHorizontal(),
      text: t,
    };
    if (format === "png") {
      exportTopDownMapPng(context);
    } else {
      exportTopDownMapSvg(context);
    }
  }

  let cameraDiagnosticColorMode: SurfaceDiagnosticColorMode = "role";

  async function exportCurrentCameraSurfaceDiagnostic(): Promise<void> {
    try {
      setStatus(t("Exporting final GLB surface diagnostic…", "正在导出最终 GLB 表面诊断…"));
      const result = await exportCameraSurfaceDiagnostic({
        root: currentRoot,
        camera,
        manifest: currentManifest,
        colorMode: cameraDiagnosticColorMode,
        text: t,
      });
      const violations = result.triangles.filter((triangle) => triangle.qa_flags.length > 0).length;
      flashStatus(t(
        `Exported ${result.triangles.length} final GLB triangles (${violations} flagged).`,
        `已导出 ${result.triangles.length} 个最终 GLB 三角面（${violations} 个异常）。`,
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      flashStatus(t(`Diagnostic export failed: ${message}`, `诊断导出失败：${message}`));
      alert(t(`Diagnostic export failed: ${message}`, `诊断导出失败：${message}`));
    }
  }


  settingsToggleEl.addEventListener("click", () => {
    if (panelController.isOpen("settings")) {
      panelController.setOpen("settings", false);
    } else {
      panelController.closeAll();
      panelController.setOpen("settings", true);
    }
  }, { signal });
  root.querySelector<HTMLButtonElement>("#viewer-edit-toggle")?.addEventListener("click", async () => {
    if (!(await materializeActiveStarterScene())) return;
    panelController.closeAll();
    setObjectEditingEnabled(true);
  }, { signal });
  settingsCloseEl.addEventListener("click", () => panelController.setOpen("settings", false), { signal });
  sceneCommandSubmitEl.addEventListener("click", () => void submitSceneCommandEditor(), { signal });
  sceneCommandUndoEl.addEventListener("click", () => void undoLastSceneEdit(), { signal });
  window.addEventListener(WORKFLOW_UNDO_EVENT, () => void undoLastSceneEdit(), { signal });

  function localizedViewerHints(): ShellI18nText[] {
    return captureMode
      ? [{ key: "viewer.hints.captureMode" }]
      : [
          { key: "viewer.hints.capture" },
          { key: "viewer.hints.move" },
          { key: "viewer.hints.tools" },
        ];
  }

  function updateShellSectionTexts(): void {
    const tabLabels: Array<[string, string]> = [
      ["settings", "viewer.tab.settings"],
      ["design", "viewer.tab.design"],
      ["evaluate", "professional.pipeline.deliver"],
      ["compare", "viewer.tab.compare"],
    ];
    for (const [tabId, key] of tabLabels) {
      const button = root.querySelector<HTMLButtonElement>(`[data-shell-tab="${tabId}"]`);
      if (button) {
        const translated = translateViewerKey(currentLang, key) ?? `[missing ${key}]`;
        const label = button.querySelector<HTMLElement>(".workbench-sidebar-label");
        if (label) {
          label.dataset.i18nKey = key;
          label.textContent = translated;
          button.title = translated;
        } else {
          button.dataset.i18nKey = key;
          button.textContent = translated;
        }
      }
    }
  }

  function applyLocalLanguage(language: ViewerLanguage): void {
    currentLang = language;
    root.dataset.viewerLanguage = language;
    applyViewerTranslations(root, language);
    syncLightingPresetOptions(language);
    if (document.getElementById("floating-lane-panel")) floatingLaneSystem.mountControlPanel();
    updateShellSectionTexts();
    updateGenerationDialogContract();
    shell.setHints(localizedViewerHints());
    compareMode.refreshLanguage();
    lastLaserTargetKey = "";
    clearInfoCard();
    objectEditStatusController.refreshLanguage();
    recentLayoutSelector.refreshLabels();
    renderProfessionalWorkflowState();
  }

  window.addEventListener(VIEWER_LANGUAGE_EVENT, (event) => {
    const detail = (event as CustomEvent<{ language?: unknown }>).detail;
    applyLocalLanguage(normalizeViewerLanguage(detail?.language));
  }, { signal });
  applyLocalLanguage(currentLang);

  shell.setMenuActions({
    "file-load-layout": () => {
      root.querySelector<HTMLElement>(".desktop-shell")?.classList.remove("desktop-shell-left-collapsed");
      layoutSelectEl.focus();
    },
    "file-export-png": () => exportCurrentPlan("png"),
    "file-export-svg": () => exportCurrentPlan("svg"),
    "view-reset-view": () => resetView(),
    "tools-open-settings": () => {
      if (panelController.isOpen("settings")) {
        panelController.setOpen("settings", false);
      } else {
        panelController.closeAll();
        panelController.setOpen("settings", true);
      }
    },
    "tools-open-design": () => panelController.setOpen("design", !panelController.isOpen("design")),
    "tools-open-evaluate": () => panelController.setOpen("evaluate", !panelController.isOpen("evaluate")),
    "tools-open-compare": () => {
      void scenarioWorkbench?.open().catch((error) => flashStatus(String(error)));
    },
    "tools-open-consistency": () => {
      panelController.closeAll();
      panelController.setOpen("consistency", true);
    },
    "help-shortcuts": () => {
      shell.setBottomOpen(true);
      root.querySelector<HTMLButtonElement>('[data-shell-status-tab="hints"]')?.click();
    },
  });

  root.addEventListener("roadgen:workbench-sidebar-change", (event) => {
    const detail = (event as CustomEvent<{ pageId?: string | null }>).detail;
    panelController.syncFromSidebar(detail?.pageId ?? null);
    updateOverlay();
  }, { signal });

  designToggleEl.addEventListener("click", () => panelController.setOpen("design", !panelController.isOpen("design")), { signal });
  generationRunEl.addEventListener("click", () => {
    updateGenerationDialogContract();
    panelController.closeAll();
    panelController.setOpen("design", true);
  }, { signal });
  root.querySelectorAll<HTMLElement>("[data-close-generation]").forEach((el) => {
    el.addEventListener("click", () => {
      if (generationRunner.isRunning()) return;
      generationWizard?.close();
      panelController.setOpen("design", false);
    }, { signal });
  });
  designReviewRunEl.addEventListener("click", reviewLastDesignRun, { signal });
  designPresetEl.addEventListener("change", () => {
    const currentPrompt = designPromptEl.value.trim();
    const presetPromptValues = new Set(VIEWER_DESIGN_PRESETS.map((item) => item.prompt.trim()).filter(Boolean));
    if (!currentPrompt || presetPromptValues.has(currentPrompt)) {
      designPromptEl.value = "";
    }
    updateDesignLayerSummaries();
    scheduleDesignMatrixRefresh();
    updateGenerationDialogContract();
  }, { signal });
  designScenarioEl.addEventListener("change", () => {
    updateDesignScenarioMeta();
    scheduleDesignMatrixRefresh();
    updateGenerationDialogContract();
  }, { signal });
  designPromptEl.addEventListener("input", () => {
    scheduleDesignMatrixRefresh();
    updateGenerationDialogContract();
  }, { signal });
  designTemplateEl.addEventListener("input", () => {
    scheduleDesignMatrixRefresh();
    updateGenerationDialogContract();
  }, { signal });
  designCountEl.addEventListener("change", updateGenerationDialogContract, { signal });
  designSeedEl.addEventListener("input", updateGenerationDialogContract, { signal });
  designSkeletonProfileEl.addEventListener("change", () => {
    updateDesignLayerSummaries();
    scheduleDesignMatrixRefresh();
    updateGenerationDialogContract();
  }, { signal });
  designFurnitureProfileEl.addEventListener("change", () => {
    updateDesignLayerSummaries();
    scheduleDesignMatrixRefresh();
    updateGenerationDialogContract();
  }, { signal });
  designScenarioDraftEl.addEventListener("click", () => {
    void draftDesignScenarioVariant();
  }, { signal });
  designScenarioUseDraftEl.addEventListener("click", useLatestDraftScenario, { signal });
  designScenarioPreviewEl.addEventListener("click", () => {
    void loadSelectedDesignScenarioPreview().catch((error) => {
      const message = error instanceof Error ? error.message : "Failed to load scenario preview.";
      setError(errorEl, message);
      setStatus("Scenario preview failed.");
    });
  }, { signal });
  designScenarioAnnotationEl.addEventListener("click", () => void openSelectedDesignScenarioAnnotation(), { signal });
  designGenerateEl.addEventListener("click", () => {
    const snapshot = workflow.getSnapshot();
    const { spec, issues } = currentGenerationSpecBuild();
    const sourceApproved = spec.sourceMode === "graph_template"
      ? Boolean(spec.graphTemplateId)
      : Boolean(snapshot.normalized && snapshot.approvedSourceRevision === snapshot.sourceRevision);
    const validationIssues = [
      ...issues,
      ...(parameterDesignController?.validationIssues() ?? []),
      ...(!sourceApproved ? ["请先批准当前 ReferenceAnnotation 或选择明确的 Graph Template。"] : []),
    ];
    if (validationIssues.length) {
      designStatusEl.textContent = validationIssues.join(" · ");
      generationWizard?.activatePrimary("output");
      updateGenerationDialogContract();
      return;
    }
    void generationRunner.run(spec);
  }, { signal });
  designBenchmarkEl.addEventListener("click", () => void designController.loadBenchmarkExplorer(), { signal });
  designBranchHistoryEl.addEventListener("click", () => void designController.loadBranchRunHistory(), { signal });
  designBranchRunEl.addEventListener("click", () => void designController.loadLatestScoreResults(), { signal });
  designWorkspaceEl.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target.closest("[data-design-workspace-close]")) {
      hideDesignWorkspace();
      return;
    }
    const loadButton = target.closest<HTMLElement>("[data-branch-load]");
    const loadPath = loadButton?.dataset.branchLoad?.trim();
    if (loadPath) {
      const sceneGlbPath = loadButton?.dataset.branchGlb?.trim() || "";
      void (async () => {
        await loadBranchLayoutSelection(loadPath, "Branch node scene loaded.", sceneGlbPath);
      })();
      return;
    }
    const branchNodeButton = target.closest<HTMLElement>("[data-branch-node]");
    const branchNodeId = branchNodeButton?.dataset.branchNode?.trim();
    if (branchNodeId && lastBranchRunSnapshot) {
      selectedBranchNodeId = branchNodeId;
      renderBranchWorkspace(lastBranchRunSnapshot);
      return;
    }
    if (target.closest("[data-design-modal-close]")) {
      closeDesignStageDiagnostic();
      return;
    }
    const traceCitationButton = target.closest<HTMLElement>("[data-trace-citation]");
    const traceChunkId = traceCitationButton?.dataset.traceCitation?.trim();
    if (traceChunkId) {
      const evidenceRow = [...designWorkspaceEl.querySelectorAll<HTMLElement>("[data-trace-evidence]")]
        .find((item) => item.dataset.traceEvidence === traceChunkId);
      if (evidenceRow) {
        evidenceRow.scrollIntoView({ behavior: "smooth", block: "center" });
        evidenceRow.classList.add("viewer-trace-evidence-highlight");
        window.setTimeout(() => evidenceRow.classList.remove("viewer-trace-evidence-highlight"), 1800);
      }
      return;
    }
    const detailButton = target.closest<HTMLButtonElement>("[data-design-stage-detail]");
    const stage = detailButton?.dataset.designStageDetail?.trim();
    if (stage) {
      openDesignStageDiagnostic(stage);
    }
    // Handle stage tree node clicks
    const stageTreeNode = target.closest<HTMLButtonElement>("[data-design-stage]");
    const treeStage = stageTreeNode?.dataset.designStage?.trim();
    if (treeStage) {
      openDesignStageDiagnostic(treeStage);
    }
  }, { signal });
  designResultEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-layout-path]");
    const layoutPath = button?.dataset.layoutPath?.trim();
    if (!layoutPath) return;
    const sceneGlbPath = button?.dataset.sceneGlb?.trim() || "";
    void (async () => {
      await loadBranchLayoutSelection(layoutPath, "Selected generated scheme loaded.", sceneGlbPath);
    })();
  }, { signal });

  evaluateCloseEl.addEventListener("click", () => panelController.setOpen("evaluate", false), { signal });
  evaluateRunEl.addEventListener("click", () => void evaluationRunner.run(), { signal });

  consistencyCloseEl.addEventListener("click", () => panelController.setOpen("consistency", false), { signal });
  root.querySelector<HTMLButtonElement>("#viewer-open-camera-surface-diagnostic")?.addEventListener("click", () => {
    panelController.closeAll();
    panelController.setOpen("consistency", true);
    window.requestAnimationFrame(() => {
      consistencyContentEl.querySelector<HTMLElement>(".viewer-surface-diagnostic-card")?.scrollIntoView({ block: "start" });
    });
  }, { signal });

  // Contextual help buttons open the same top-bar help dialog.
  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const helpIcon = target.closest<HTMLButtonElement>(".viewer-help-icon");
    if (helpIcon && helpIcon.dataset.help) {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent("roadgen3d:open-help-dialog"));
      return;
    }
  }, { signal });

  // Stage toolbar view modes and actions
  syncCameraEl.addEventListener("click", () => {
    if (currentCameraMode === "frame") {
      frameSceneOverview();
      flashStatus("Camera reset to scene overview.");
    } else {
      resetView();
      flashStatus("Camera reset to road-level spawn.");
    }
  }, { signal });

  mode3dEl.addEventListener("click", () => {
    if (graphOverlayActive) {
      setToggleInput(graphOverlayToggleEl, false);
      graphOverlayActive = false;
      clearGraphOverlay();
      currentCameraMode = thirdPersonToggleEl.checked ? "third_person" : "first_person";
      syncCameraRig();
    }
    mode3dEl.setAttribute("aria-pressed", "true");
    mode2dEl.setAttribute("aria-pressed", "false");
    modeGraphEl.setAttribute("aria-pressed", "false");
  }, { signal });

  mode2dEl.addEventListener("click", () => {
    expandedMapController.open();
    mode3dEl.setAttribute("aria-pressed", "false");
    mode2dEl.setAttribute("aria-pressed", "true");
    modeGraphEl.setAttribute("aria-pressed", "false");
  }, { signal });

  modeGraphEl.addEventListener("click", () => {
    if (!graphOverlayActive) {
      setToggleInput(graphOverlayToggleEl, true);
    }
    mode3dEl.setAttribute("aria-pressed", "false");
    mode2dEl.setAttribute("aria-pressed", "false");
    modeGraphEl.setAttribute("aria-pressed", "true");
  }, { signal });

  minimapExpandEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    expandedMapController.open();
  }, { signal });

  lightingPresetEl.addEventListener(
    "change",
    () => {
      const nextPreset = lightingPresetEl.value;
      const presetValues = LIGHTING_PRESETS[nextPreset];
      if (!presetValues) {
        return;
      }
      lightingState.preset = nextPreset;
      Object.assign(lightingState, presetValues);
      syncLightingUi();
    },
    { signal },
  );

  exposureInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.exposure = Number(exposureInput.value);
      syncLightingUi();
    },
    { signal },
  );
  keyInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.keyLightIntensity = Number(keyInput.value);
      syncLightingUi();
    },
    { signal },
  );
  fillInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.fillLightIntensity = Number(fillInput.value);
      syncLightingUi();
    },
    { signal },
  );
  warmthInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.warmth = Number(warmthInput.value);
      syncLightingUi();
    },
    { signal },
  );
  shadowInput.addEventListener(
    "input",
    () => {
      lightingState.preset = "custom";
      lightingState.shadowStrength = Number(shadowInput.value);
      syncLightingUi();
    },
    { signal },
  );
  buildingOpacityInput.addEventListener(
    "input",
    () => {
      buildingOpacityOverride = THREE.MathUtils.clamp(Number(buildingOpacityInput.value), 0.1, 1);
      if (currentRoot) applyBuildingOpacity(currentRoot, currentManifest, buildingOpacityOverride);
      compareMode.forEachCompareRoot((rootObject) => applyBuildingOpacity(rootObject, null, buildingOpacityOverride!));
      syncBuildingOpacityUi();
    },
    { signal },
  );
  thirdPersonToggleEl.addEventListener(
    "change",
    () => {
      currentCameraMode = thirdPersonToggleEl.checked ? "third_person" : "first_person";
      syncCameraRig();
      updateOverlay();
    },
    { signal },
  );
  laserToggleEl.addEventListener(
    "change",
    () => {
      crosshairEl.hidden = !laserToggleEl.checked;
      if (!laserToggleEl.checked) {
        clearInfoCard();
        laserBeam.visible = false;
        laserHitDot.visible = false;
        currentLaserHitPoint = null;
        lastLaserTargetKey = "";
      }
    },
    { signal },
  );
  assetBboxToggleEl.addEventListener(
    "change",
    () => {
      if (assetBboxToggleEl.checked) {
        createAssetBboxHelpers(scene, currentRoot, currentManifest);
      } else {
        removeAssetBboxHelpers(scene);
      }
    },
    { signal },
  );
  assetMoveToggleEl.addEventListener(
    "change",
    () => {
      setObjectEditingEnabled(assetMoveToggleEl.checked);
    },
    { signal },
  );
  dioramaFinishToggleEl.addEventListener(
    "change",
    async () => {
      const currentOption = sceneSelectionController.selectedSceneOption();
      if (currentOption && currentRoot) {
        await loadScene(currentOption);
      }
    },
    { signal },
  );
  analysisOverlayToggleEl.addEventListener(
    "change",
    () => {
      const highlighted = refreshAnalysisOverlayForSelectedBranch({ flash: analysisOverlayToggleEl.checked });
      if (!analysisOverlayToggleEl.checked) {
        flashStatus("Analysis overlay disabled.");
      } else if (highlighted === 0) {
        flashStatus("Analysis overlay ready. Select a Pareto point or branch node with active features.");
      }
    },
    { signal },
  );

  frameModeToggleEl.addEventListener(
    "change",
    async () => {
      // Reload current scene to apply/remove frame helpers
      const currentOption = sceneSelectionController.selectedSceneOption();
      if (currentOption && currentRoot) {
        await loadScene(currentOption);
      }
    },
    { signal },
  );

  graphOverlayToggleEl.addEventListener(
    "change",
    () => {
      if (graphOverlayToggleEl.checked) {
        graphOverlayActive = true;
        buildGraphOverlay();
        flashStatus("Graph overlay enabled - top-down view");
      } else {
        graphOverlayActive = false;
        clearGraphOverlay();
        currentCameraMode = thirdPersonToggleEl.checked ? "third_person" : "first_person";
        syncCameraRig();
        flashStatus("Graph overlay disabled");
      }
    },
    { signal },
  );

  layoutOverlayToggleEl.addEventListener(
    "change",
    () => {
      floatingLaneSystem.config.enabled = layoutOverlayToggleEl.checked;
      const flpEnabledEl = document.getElementById("flp-enabled") as HTMLInputElement | null;
      if (flpEnabledEl) flpEnabledEl.checked = layoutOverlayToggleEl.checked;
      if (floatingLaneSystem.config.enabled) {
        floatingLaneSystem.buildOverlay();
        flashStatus("Scene overlay enabled");
      } else {
        floatingLaneSystem.clearOverlay();
        flashStatus("Scene overlay disabled");
      }
    },
    { signal },
  );

  const handleControlsLock = () => {
    renderer.domElement.focus();
    updateOverlay();
  };
  const handleControlsUnlock = () => {
    resetMoveState();
    updateOverlay();
  };
  const handlePointerLockChange = () => updateOverlay();
  const handlePointerLockError = () => {
    updateOverlay();
    flashStatus(currentLang === "zh"
      ? "浏览器未允许鼠标锁定；可直接按住左键拖动调整视角。"
      : "Browser mouse lock was blocked. Drag with the left mouse button to adjust the view directly.");
  };
  controls.addEventListener("lock", handleControlsLock);
  controls.addEventListener("unlock", handleControlsUnlock);
  document.addEventListener("pointerlockchange", handlePointerLockChange, { signal });
  document.addEventListener("pointerlockerror", handlePointerLockError, { signal });

  window.addEventListener("resize", resizeRenderer, { signal });
  window.addEventListener("blur", resetMoveState, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "visible") {
        resetMoveState();
      }
      updateOverlay();
    },
    { signal },
  );
  document.addEventListener("keydown", (event) => handleKey(event, true), { capture: true, signal });
  document.addEventListener("keyup", (event) => handleKey(event, false), { capture: true, signal });
  layoutSelectEl.addEventListener(
    "change",
    async () => {
      const nextLayoutPath = layoutSelectEl.value.trim();
      if (!nextLayoutPath || nextLayoutPath === currentLayoutPath) {
        return;
      }
      lastSceneEditUndo = null;
      try {
        await sceneSelectionController.loadLayoutSelection(nextLayoutPath);
        recentLayoutSelector.setSelectedPath(nextLayoutPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load scene layout.";
        setError(errorEl, message);
        setStatus("Scene layout load failed");
      }
    },
    { signal },
  );
  selectEl.addEventListener(
    "change",
    async () => {
      const nextOption = sceneSelectionController.sceneOptionByKey(selectEl.value);
      if (!nextOption) {
        return;
      }
      try {
        selectEl.title = nextOption.label;
        await loadScene(nextOption);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load GLB.";
        setError(errorEl, message);
        setStatus("Scene load failed");
      }
    },
    { signal },
  );

  function animate(): void {
    if (destroyed) {
      return;
    }
    const delta = clock.getDelta();

    if (flyAnimation) {
      const elapsed = performance.now() - flyAnimation.startTime;
      const t = Math.min(elapsed / flyAnimation.duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      currentAvatarPosition.lerpVectors(flyAnimation.startAvatarPos, flyAnimation.targetAvatarPos, ease);
      syncCameraRig();
      if (t >= 1) {
        currentAvatarPosition.copy(flyAnimation.targetAvatarPos);
        syncCameraRig();
        flyAnimation = null;
      }
    } else if (isRoamMovementActive()) {
      const lookAxis = Number(moveState.lookLeft) - Number(moveState.lookRight);
      if (lookAxis !== 0) {
        // Q/E provide deterministic horizontal look adjustments even when a
        // browser temporarily refuses Pointer Lock.
        camera.rotateOnWorldAxis(UP_AXIS, lookAxis * 1.8 * delta);
        camera.updateMatrixWorld();
      }
      const moveSpeed = moveState.sprint ? 8.5 : 4.5;
      const forwardAxis = Number(moveState.forward) - Number(moveState.backward);
      const sideAxis = Number(moveState.right) - Number(moveState.left);
      const forward = cameraForwardHorizontal();
      const right = new THREE.Vector3().crossVectors(forward, UP_AXIS).normalize();
      if (forwardAxis !== 0) {
        currentAvatarPosition.addScaledVector(forward, forwardAxis * moveSpeed * delta);
      }
      if (sideAxis !== 0) {
        currentAvatarPosition.addScaledVector(right, sideAxis * moveSpeed * delta);
      }
      currentAvatarPosition.y = Math.max(0, currentSpawn.y - AVATAR_EYE_HEIGHT_M);
      syncCameraRig();
    }

    updateAssetBboxHelpers(scene);
    updateAssetPlacementPreview();
    updateLaserPointer();
    floatingLaneSystem.updateAnimation(delta);
    environmentController.update(
      delta,
      lightingRig.sceneCenter,
      lightingRig.sceneExtent,
    );

    const didRenderCompare = compareMode.renderCompare3dFrame();
    if (!didRenderCompare) {
      renderPipeline.render(delta);
    }

    expandedMapController.render();
    animationFrameId = requestAnimationFrame(animate);
  }
  try {
    syncEnvironmentUi();
    syncLightingUi();
    resizeRenderer();
    if (!hostOptions.embedded) {
      void loadDesignScenarioCatalog();
    } else {
      designScenarioEl.innerHTML = `<option value="">课程项目 revision</option>`;
      designScenarioEl.disabled = true;
      designScenarioMetaEl.textContent = "课程模式由项目 API 管理场景候选与版本。";
      designScenarioMetaEl.dataset.tone = "base";
    }
    if (captureMode) {
      setStatus("Capture API ready");
    } else {
      const explicitLayoutPath = hostOptions.embedded ? null : parseQueryLayoutPath();
      const workflowLayoutPath = workflow.getSnapshot().sceneLayoutPath;
      // The standalone root URL is the stable product entry point and must
      // always show the bundled starter. A restored local workflow remains
      // available in the scene browser, but only an explicit layout query may
      // take over the standalone stage. Embedded/project viewers still restore
      // their persisted revision because the project owns that route.
      const requestedLayoutPath = hostOptions.embedded ? workflowLayoutPath : explicitLayoutPath;
      const recentLayouts: RecentLayout[] = [];
      const initialLayoutCandidates = requestedLayoutPath ? [requestedLayoutPath] : [];

      if (initialLayoutCandidates.length === 0) {
        animate();
        updateOverlay();
        if (hostOptions.embedded) {
          setStatus(t("Ready for a road baseline.", "等待道路基线。"));
          renderProfessionalWorkflowState();
        } else {
          await loadStarterScenePreview();
        }
      } else {
        let initialLayoutPath = initialLayoutCandidates[0];
        let lastLayoutError = "";
        for (const candidate of initialLayoutCandidates) {
        try {
          populateRecentLayoutOptions(recentLayouts, candidate);
          await sceneSelectionController.loadLayoutSelection(candidate);
          frameSceneOverview();
          initialLayoutPath = candidate;
          lastLayoutError = "";
          break;
        } catch (error) {
          lastLayoutError = error instanceof Error ? error.message : "Failed to load scene layout.";
          console.warn(`Skipping unavailable scene layout ${candidate}:`, error);
        }
        }

        if (lastLayoutError) {
          if (hostOptions.embedded) {
            throw new Error(`No viewable project scene was found. Last error: ${lastLayoutError}`);
          }
          shell.pushActivity(
            t(
              "The requested scene could not be loaded. Showing the bundled Guangzhou starter instead.",
              "请求的场景无法加载，已改为展示内置广州起始示例。",
            ),
            "warning",
          );
          animate();
          updateOverlay();
          await loadStarterScenePreview();
        } else {
          animate();
          updateOverlay();
          if (initialLayoutPath && !hostOptions.embedded) {
            scheduleRecentLayoutHydration(initialLayoutPath, 0);
          }
          activeSceneOrigin = explicitLayoutPath ? "explicit_layout" : "workflow";
          renderProfessionalWorkflowState();
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize viewer.";
    setError(errorEl, message);
    setStatus("Viewer unavailable");
  }

  void workflowBridge.syncGeneratedLayout();

  return () => {
    destroyed = true;
    if (window.__roadgen3dCaptureGallery) {
      delete window.__roadgen3dCaptureGallery;
    }
    if (captureMode) {
      document.body.classList.remove("roadgen-capture-mode");
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    eventController.abort();
    minimapResizeObserver.disconnect();
    unregisterHostSidebarPages();
    unregisterSettingsSidebarPage();
    generationRunner.dispose();
    generationWizard?.destroy();
    parameterDesignController?.destroy();
    workflowBridge.dispose();
    unsubscribeCapabilityStatus();
    controls.removeEventListener("lock", handleControlsLock);
    controls.removeEventListener("unlock", handleControlsUnlock);
    if (controls.isLocked) {
      controls.unlock();
    }
    sceneClickRoamController.dispose();
    clearGraphOverlay();
    floatingLaneSystem.clearOverlay();
    structuredEvaluationController?.abort();
    setObjectEditingEnabled(false, { announce: false });
    editAutosave.dispose();
    sceneObjectEditor.dispose();
    sceneAssetDialog.dispose();
    cancelAssetPlacement(false);
    scenarioWorkbench?.dispose();
    openSceneAssetsEl?.removeEventListener("click", openSceneAssets);
    scene.remove(assetPlacementGhost);
    assetPlacementGhost.geometry.dispose();
    (assetPlacementGhost.material as THREE.Material).dispose();
    environmentController.dispose();
    expandedMapController.dispose();
    renderPipeline.dispose();
    renderer.dispose();
  };
}

export { mountViewer };
