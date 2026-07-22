import "./styles/viewer.css";
import "./style-scene-compare.css";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeStageTree, renderStageTree as renderG6StageTree, StageNode } from "./g6-visualization";
import { AudioManager, type AudioProfile } from "./audio-manager";
import { createCompareMode } from "./compare-mode";
import { createRadarChart, resizeRadarCanvas, type SceneCompareState, type SceneMetrics, } from "./scene-compare-radar";
import type { ViewerManifest, SceneOption, RecentLayout, DesignPreset, SceneJobStatusPayload, DesignSchemeVariant, DesignSemanticSummary, BranchRunStatusPayload, BranchRunNode, ScenarioDesign, ScenarioDesignCatalogPayload, ScenarioDraftVariantPayload, } from "./viewer-types";
import { VIEWER_DESIGN_PRESETS, SKELETON_DESIGN_PROFILE_OPTIONS, STREET_FURNITURE_PROFILE_OPTIONS, } from "./viewer-types";
import { escapeHtml, clamp, disposeObject, createTextSprite, } from "./viewer-utils";
import { loadManifest, loadRecentLayouts, apiJson, postApiJson, clearManifestCache, clearRecentLayoutsCache, parseQueryLayoutPath, inferSpawnFromBbox, saveSceneLayoutEdits, } from "./viewer-api";
import type { SceneAssetRef, SceneEditCommand, SceneLayoutEditResponse, } from "./viewer-api";
import { categoryLabel, resolveHitDescriptor, buildInfoCardContent as buildHitDescriptorContent, resolveInstanceIdFromName, } from "./viewer-hit-info";
import { createAnalysisOverlayHelpers, createAssetBboxHelpers, createFrameHelpers, removeAnalysisOverlayHelpers, removeAssetBboxHelpers, removeFrameAndAssetHelpers, updateAssetBboxHelpers, } from "./viewer-scene-helpers";
import { isEnvironmentSkyDomeObject, prepareEnvironmentSkyDomeObject, prepareEnvironmentSkyDomes, sceneContentBounds, } from "./viewer-scene-bounds";
import { createSceneObjectEditorController, type SceneObjectEditMode, } from "./viewer-scene-object-editor";
import { createSceneEditAutosaveCoordinator } from "./viewer-scene-edit-autosave";
import { createSceneObjectEditStatusController } from "./viewer-object-edit-status";
import { createLocalAssetPaletteAdapter, type SceneAssetPaletteAdapter } from "./viewer-asset-palette";
import { createSceneAssetDialog } from "./viewer-scene-asset-dialog";
import { createViewerCommandRegistry } from "./viewer-command-registry";
import { createSceneClickRoamController } from "./viewer-scene-click-roam";
import { createScenarioWorkbench, type ProfessionalScenarioAdapter, type ProfessionalScenarioOpenTarget, } from "./viewer-scenario-workbench";
import { createFeatureQualityWorkbench } from "./viewer-feature-quality-workbench";
import { requestProfessionalOsmPicker } from "./professional-entry-intent";
import { createViewerPanelController, type ViewerPanelController } from "./viewer-panel-controller";
import { organizeViewerSettingsTools } from "./viewer-settings-tool-disclosure";
import { minimapToWorld, sceneBoundsFromManifest, type SceneBounds, } from "./viewer-minimap";
import { exportTopDownMapPng, exportTopDownMapSvg, } from "./viewer-export";
import { exportCameraSurfaceDiagnostic, renderCameraSurfaceDiagnosticControls, type SurfaceDiagnosticColorMode, } from "./viewer-camera-surface-diagnostic";
import { createExpandedMapController, renderPlanMapCanvas } from "./viewer-expanded-map";
import { buildDesignStageNodes, latestOperationForStage, renderDesignWorkspaceHtml, renderStageDiagnosticContent, stepForStage, } from "./viewer-design-workspace";
import { renderBranchRunResultsHtml, renderBranchWorkspaceHtml, selectedBranchNode as resolveSelectedBranchNode, } from "./viewer-branch-workspace";
import { mountBranchScoreScatter3d } from "./branch-score-scatter-3d";
import { createViewerDesignController } from "./viewer-design-controller";
import { createViewerDesignMatrixController } from "./viewer-design-matrix";
import { createViewerGenerationWizardController } from "./viewer-generation-wizard";
import { buildGenerationRequestSpec, type GenerationRequestSpec } from "./viewer-generation-spec";
import { createViewerGenerationRunner } from "./viewer-generation-runner";
import { createViewerParameterDesignController, type ViewerParameterDesignController } from "./viewer-parameter-design";
import { compactUiLabel, makeDirectLayoutLabel, turnLanePatchSvgClass, } from "./viewer-scene-options";
import { createRecentLayoutSelectorController, type RecentLayoutSelectorController } from "./viewer-recent-layouts";
import { createViewerSceneSelectionController } from "./viewer-scene-selection-controller";
import { completeLightingValues, DEFAULT_LIGHTING_STATE, LIGHTING_PRESETS, lightingPresetLabel, type LightingState, } from "./viewer-lighting";
import { applyViewerLightingState, createViewerLightingRig, createViewerRenderPipeline, fitViewerLightingRigToBounds, } from "./viewer-render-pipeline";
import { DEFAULT_ENVIRONMENT_STATE, deriveEnvironmentLightingState, type EnvironmentState, } from "./viewer-environment";
import { createViewerEnvironmentController, type ViewerEnvironmentController } from "./viewer-environment-controller";
import { collectViewerPanelElements, createViewerLeftSections, createViewerRightTabs, createViewerStageHtml, } from "./viewer-panels";
import { applyAnalyticalDioramaFinish } from "./viewer-visual-style";
import { VIEWER_LANGUAGE_EVENT, applyViewerTranslations, loadViewerLanguage, normalizeViewerLanguage, translateViewerKey, viewerText, type ViewerLanguage, } from "./viewer-i18n";
import { createFloatingLaneSystem } from "./viewer-floating-lane";
import { DEFAULT_EVALUATION_CONFIG, EVALUATION_CONFIG_STORAGE_KEY, cloneEvaluationConfig, loadEvaluationConfig, renderMetricsPanel, validateEvaluationConfig, type EvaluationConfig, type EvaluationConfigField, type EvaluationResult, } from "./viewer-evaluation";
import { captureGalleryViews, type GalleryCaptureTarget } from "./viewer-evaluation-capture";
import { createViewerEvaluationRunner } from "./viewer-evaluation-runner";
import type { DesktopShell, ShellI18nText, ShellTab, WorkbenchSidebarPage } from "./desktop-shell";
import type { ProfessionalBaselineCoordinator } from "./professional-baseline-coordinator";
import { WORKFLOW_UNDO_EVENT } from "./workflow-controller";
import type { WorkflowController } from "./workflow-controller";
import { loadWorkflowCapabilities, normalizeSceneSource, toNormalizedSceneSource } from "./workflow-api";
import { createViewerWorkflowBridge } from "./viewer-workflow-bridge";
import { applyMaterializedStarterScene, loadDefaultStarterScene, requestStarterSceneMaterialization, type ActiveSceneOrigin, type StarterScenePackage, } from "./starter-scene";
import { renderWorkflowCapabilities } from "./viewer-capabilities";
import { parseSceneCommandEnvelope, sceneCommandEnvelopeTemplate, } from "./viewer-scene-command-editor";
import type { ReferenceAnnotation } from "./sg-types";
import { createViewerDesignScenarioController } from "./viewer-design-scenario-controller";
import { createViewerSceneInteractionController } from "./viewer-scene-interaction-controller";
import { createViewerWorkspaceViewController } from "./viewer-workspace-view-controller";
import { createViewerOutputPanelController } from "./viewer-output-panel-controller";
import { createViewerLifecycleController } from "./viewer-lifecycle-controller";
import { createViewerWorkflowUiController } from "./viewer-workflow-ui-controller";
import { createViewerInputEvaluationController } from "./viewer-input-evaluation-controller";
const STRUCTURE_PREVIEW_DEFAULT_STEP_KEY = "scene_preview";
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
let currentManifest: { value: ViewerManifest | null } = { value: null };
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const AVATAR_HEIGHT_M = 1.7;
const AVATAR_EYE_HEIGHT_M = 1.62;
const THIRD_PERSON_DISTANCE_M = 3.6;
const THIRD_PERSON_VERTICAL_OFFSET_M = 1.1;
const RECENT_LAYOUT_BACKGROUND_LIMIT = 20;
const RECENT_LAYOUT_BACKGROUND_BATCH = 8;
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
  /** Experimental feature-quality tooling is visible only to system administrators. */
  isFeatureQualityAdmin?: () => boolean;
  copyStarterToProject?: (layoutPath: string) => Promise<ProfessionalScenarioOpenTarget>;
  onStarterCopied?: () => void;
  /** The one-time starter review is onboarding only, never a 2D-to-3D detour. */
  showStarterReviewOnLoad?: boolean;
};
const STARTER_REVIEW_ONBOARDING_KEY = "roadgen3d:starter-review-onboarding-seen";
const DEFAULT_WHITE_MASSING_OPACITY = 0.88;
function mountViewer(shell: DesktopShell, workflow: WorkflowController, hostOptions: ViewerHostOptions = {}): Promise<() => void> {
  return mountViewerImpl(shell, workflow, hostOptions);
}
async function mountViewerImpl(shell: DesktopShell, workflow: WorkflowController, hostOptions: ViewerHostOptions): Promise<() => void> {
  const { syncToggleButtonState, setToggleInput, applyEvaluationConfigToInputs, resolveEvaluationConfigInputs, handlePointerLockError } = createViewerInputEvaluationController(() => ({ get currentLang(): typeof currentLang { return currentLang; }, get evaluationConfigErrorEl(): typeof evaluationConfigErrorEl { return evaluationConfigErrorEl; }, get evaluationConfigInputs(): typeof evaluationConfigInputs { return evaluationConfigInputs; }, get evaluationFields(): typeof evaluationFields { return evaluationFields; }, get flashStatus(): typeof flashStatus { return flashStatus; }, get toggleButtonsByInput(): typeof toggleButtonsByInput { return toggleButtonsByInput; }, get updateOverlay(): typeof updateOverlay { return updateOverlay; } }));

  const { renderCandidateRepository, renderUsedAssetProvenance, updateGenerationDialogContract, renderProfessionalWorkflowState } = createViewerWorkflowUiController(() => ({ get activeSceneOrigin(): typeof activeSceneOrigin { return activeSceneOrigin; }, get activeStarterScene(): typeof activeStarterScene { return activeStarterScene; }, get assetPolicyInputs(): typeof assetPolicyInputs { return assetPolicyInputs; }, get currentGenerationSpecBuild(): typeof currentGenerationSpecBuild { return currentGenerationSpecBuild; }, get currentLang(): typeof currentLang { return currentLang; }, get currentManifest(): typeof currentManifest { return currentManifest; }, get designGenerateEl(): typeof designGenerateEl { return designGenerateEl; }, get designTemplateEl(): typeof designTemplateEl { return designTemplateEl; }, get emptyStateEl(): typeof emptyStateEl { return emptyStateEl; }, get evaluateGateEl(): typeof evaluateGateEl { return evaluateGateEl; }, get evaluateRunEl(): typeof evaluateRunEl { return evaluateRunEl; }, get evaluateUsedAssetsEl(): typeof evaluateUsedAssetsEl { return evaluateUsedAssetsEl; }, get generationCandidateListEl(): typeof generationCandidateListEl { return generationCandidateListEl; }, get generationCandidateSummaryEl(): typeof generationCandidateSummaryEl { return generationCandidateSummaryEl; }, get generationDialogEl(): typeof generationDialogEl { return generationDialogEl; }, get generationReadinessEl(): typeof generationReadinessEl { return generationReadinessEl; }, get generationRunEl(): typeof generationRunEl { return generationRunEl; }, get generationSourceCountsEl(): typeof generationSourceCountsEl { return generationSourceCountsEl; }, get generationSourceKindEl(): typeof generationSourceKindEl { return generationSourceKindEl; }, get generationSourceRevisionEl(): typeof generationSourceRevisionEl { return generationSourceRevisionEl; }, get generationSourceSummaryEl(): typeof generationSourceSummaryEl { return generationSourceSummaryEl; }, get generationSourceWarningsEl(): typeof generationSourceWarningsEl { return generationSourceWarningsEl; }, get generationStrategyModeEl(): typeof generationStrategyModeEl { return generationStrategyModeEl; }, get generationStrategySummaryEl(): typeof generationStrategySummaryEl { return generationStrategySummaryEl; }, get generationWizard(): typeof generationWizard { return generationWizard; }, get hostOptions(): typeof hostOptions { return hostOptions; }, get parameterDesignController(): typeof parameterDesignController { return parameterDesignController; }, get renderCapabilityStatus(): typeof renderCapabilityStatus { return renderCapabilityStatus; }, get renderGenerationOutputSummary(): typeof renderGenerationOutputSummary { return renderGenerationOutputSummary; }, get reviewAcceptEl(): typeof reviewAcceptEl { return reviewAcceptEl; }, get reviewAnnotationEl(): typeof reviewAnnotationEl { return reviewAnnotationEl; }, get reviewChangesEl(): typeof reviewChangesEl { return reviewChangesEl; }, get reviewRootEl(): typeof reviewRootEl { return reviewRootEl; }, get reviewStateEl(): typeof reviewStateEl { return reviewStateEl; }, get reviewUsedAssetsEl(): typeof reviewUsedAssetsEl { return reviewUsedAssetsEl; }, get starterDemoBannerEl(): typeof starterDemoBannerEl { return starterDemoBannerEl; }, get starterDemoBannerDismissed(): typeof starterDemoBannerDismissed { return starterDemoBannerDismissed; }, get starterLoadError(): typeof starterLoadError { return starterLoadError; }, get starterLoading(): typeof starterLoading { return starterLoading; }, get starterReviewGuideEl(): typeof starterReviewGuideEl { return starterReviewGuideEl; }, get viewerShellEl(): typeof viewerShellEl { return viewerShellEl; }, get workflow(): typeof workflow { return workflow; } }));
  const { materializeActiveStarterScene, loadStarterScenePreview, applyAudioProfile, animate } = createViewerLifecycleController(() => ({ get AVATAR_EYE_HEIGHT_M(): typeof AVATAR_EYE_HEIGHT_M { return AVATAR_EYE_HEIGHT_M; }, get STARTER_REVIEW_ONBOARDING_KEY(): typeof STARTER_REVIEW_ONBOARDING_KEY { return STARTER_REVIEW_ONBOARDING_KEY; }, get UP_AXIS(): typeof UP_AXIS { return UP_AXIS; }, get activeSceneOrigin(): typeof activeSceneOrigin { return activeSceneOrigin; }, get activeStarterScene(): typeof activeStarterScene { return activeStarterScene; }, get animationFrameId(): typeof animationFrameId { return animationFrameId; }, get audioManager(): typeof audioManager { return audioManager; }, get audioToggleEl(): typeof audioToggleEl { return audioToggleEl; }, get camera(): typeof camera { return camera; }, get cameraForwardHorizontal(): typeof cameraForwardHorizontal { return cameraForwardHorizontal; }, get clock(): typeof clock { return clock; }, get compareMode(): typeof compareMode { return compareMode; }, get currentAvatarPosition(): typeof currentAvatarPosition { return currentAvatarPosition; }, get currentLang(): typeof currentLang { return currentLang; }, get currentManifest(): typeof currentManifest { return currentManifest; }, get currentSpawn(): typeof currentSpawn { return currentSpawn; }, get destroyed(): typeof destroyed { return destroyed; }, get environmentController(): typeof environmentController { return environmentController; }, get expandedMapController(): typeof expandedMapController { return expandedMapController; }, get flashStatus(): typeof flashStatus { return flashStatus; }, get floatingLaneSystem(): typeof floatingLaneSystem { return floatingLaneSystem; }, get flyAnimation(): typeof flyAnimation { return flyAnimation; }, get frameSceneFocus(): typeof frameSceneFocus { return frameSceneFocus; }, get frameSceneOverview(): typeof frameSceneOverview { return frameSceneOverview; }, get hostOptions(): typeof hostOptions { return hostOptions; }, get isRoamMovementActive(): typeof isRoamMovementActive { return isRoamMovementActive; }, get lightingRig(): typeof lightingRig { return lightingRig; }, get moveState(): typeof moveState { return moveState; }, get renderPipeline(): typeof renderPipeline { return renderPipeline; }, get renderProfessionalWorkflowState(): typeof renderProfessionalWorkflowState { return renderProfessionalWorkflowState; }, get scene(): typeof scene { return scene; }, get sceneSelectionController(): typeof sceneSelectionController { return sceneSelectionController; }, get setStatus(): typeof setStatus { return setStatus; }, get shell(): typeof shell { return shell; }, get signal(): typeof signal { return signal; }, get starterLoadError(): typeof starterLoadError { return starterLoadError; }, get starterLoading(): typeof starterLoading { return starterLoading; }, get syncCameraRig(): typeof syncCameraRig { return syncCameraRig; }, get updateAssetPlacementPreview(): typeof updateAssetPlacementPreview { return updateAssetPlacementPreview; }, get updateLaserPointer(): typeof updateLaserPointer { return updateLaserPointer; }, get workflow(): typeof workflow { return workflow; } }));
  const { renderConsistencyPanel, updateMetricsPanel, exportCurrentPlan, exportCurrentCameraSurfaceDiagnostic, localizedViewerHints, updateShellSectionTexts, applyLocalLanguage } = createViewerOutputPanelController(() => ({ get camera(): typeof camera { return camera; }, get cameraDiagnosticColorMode(): typeof cameraDiagnosticColorMode { return cameraDiagnosticColorMode; }, get cameraForwardHorizontal(): typeof cameraForwardHorizontal { return cameraForwardHorizontal; }, get captureMode(): typeof captureMode { return captureMode; }, get clearInfoCard(): typeof clearInfoCard { return clearInfoCard; }, get compareMode(): typeof compareMode { return compareMode; }, get consistencyContentEl(): typeof consistencyContentEl { return consistencyContentEl; }, get currentAvatarPosition(): typeof currentAvatarPosition { return currentAvatarPosition; }, get currentLang(): typeof currentLang { return currentLang; }, get currentManifest(): typeof currentManifest { return currentManifest; }, get currentRoot(): typeof currentRoot { return currentRoot; }, get currentSceneBounds(): typeof currentSceneBounds { return currentSceneBounds; }, get flashStatus(): typeof flashStatus { return flashStatus; }, get floatingLaneSystem(): typeof floatingLaneSystem { return floatingLaneSystem; }, get lastLaserTargetKey(): typeof lastLaserTargetKey { return lastLaserTargetKey; }, get objectEditStatusController(): typeof objectEditStatusController { return objectEditStatusController; }, get recentLayoutSelector(): typeof recentLayoutSelector { return recentLayoutSelector; }, get renderProfessionalWorkflowState(): typeof renderProfessionalWorkflowState { return renderProfessionalWorkflowState; }, get root(): typeof root { return root; }, get setStatus(): typeof setStatus { return setStatus; }, get shell(): typeof shell { return shell; }, get signal(): typeof signal { return signal; }, get syncLightingPresetOptions(): typeof syncLightingPresetOptions { return syncLightingPresetOptions; }, get t(): typeof t { return t; }, get updateGenerationDialogContract(): typeof updateGenerationDialogContract { return updateGenerationDialogContract; } }));
  const { populateRecentLayoutOptions, scheduleRecentLayoutHydration, populateDesignPresets, selectedDesignPreset, updateDesignStatus, openDesignStageDiagnostic, closeDesignStageDiagnostic, renderDesignStageTree, renderDesignWorkspace, hideDesignWorkspace, reviewLastDesignRun, renderBranchWorkspace, renderBranchRunResults, selectedBranchNodeForAnalysisOverlay, branchNodeHasAnalysisOverlayFeatures, refreshAnalysisOverlayForSelectedBranch, revealAnalysisOverlayForSelectedBranch, populateCompareSelectors, flyCameraTo } = createViewerWorkspaceViewController(() => ({ get AVATAR_EYE_HEIGHT_M(): typeof AVATAR_EYE_HEIGHT_M { return AVATAR_EYE_HEIGHT_M; }, get analysisOverlayToggleEl(): typeof analysisOverlayToggleEl { return analysisOverlayToggleEl; }, get avatarFigure(): typeof avatarFigure { return avatarFigure; }, get camera(): typeof camera { return camera; }, get cameraForwardHorizontal(): typeof cameraForwardHorizontal { return cameraForwardHorizontal; }, get compareSelectAEl(): typeof compareSelectAEl { return compareSelectAEl; }, get compareSelectBEl(): typeof compareSelectBEl { return compareSelectBEl; }, get controls(): typeof controls { return controls; }, get currentAvatarPosition(): typeof currentAvatarPosition { return currentAvatarPosition; }, get currentCameraMode(): typeof currentCameraMode { return currentCameraMode; }, get currentForward(): typeof currentForward { return currentForward; }, get currentLayoutPath(): typeof currentLayoutPath { return currentLayoutPath; }, get currentManifest(): typeof currentManifest { return currentManifest; }, get currentRoot(): typeof currentRoot { return currentRoot; }, get designPresetEl(): typeof designPresetEl { return designPresetEl; }, get designPromptEl(): typeof designPromptEl { return designPromptEl; }, get designResultEl(): typeof designResultEl { return designResultEl; }, get designReviewRunEl(): typeof designReviewRunEl { return designReviewRunEl; }, get designStatusEl(): typeof designStatusEl { return designStatusEl; }, get designWorkspaceEl(): typeof designWorkspaceEl { return designWorkspaceEl; }, get flashStatus(): typeof flashStatus { return flashStatus; }, get flyAnimation(): typeof flyAnimation { return flyAnimation; }, get lastBranchRunSnapshot(): typeof lastBranchRunSnapshot { return lastBranchRunSnapshot; }, get lastDesignRunSnapshot(): typeof lastDesignRunSnapshot { return lastDesignRunSnapshot; }, get localizeTaskMessage(): typeof localizeTaskMessage { return localizeTaskMessage; }, get minimapEl(): typeof minimapEl { return minimapEl; }, get recentLayoutSelector(): typeof recentLayoutSelector { return recentLayoutSelector; }, get scene(): typeof scene { return scene; }, get selectedBranchNodeId(): typeof selectedBranchNodeId { return selectedBranchNodeId; }, get setToggleInput(): typeof setToggleInput { return setToggleInput; }, get shell(): typeof shell { return shell; } }));
  const { setStatus, flashStatus, localizeTaskMessage, isMissingSceneLayoutError, loadBranchLayoutSelection, applyLightingState, syncLightingUi, syncLightingPresetOptions, syncEnvironmentUi, clearGraphOverlay, buildGraphOverlay, resizeRenderer, renderMinimapPlanPreview, cameraForwardHorizontal, updateAvatarTransform, syncCameraRig, resetView, frameSceneOverview, frameSceneFocus, updateOverlay, clearInfoCard, setInfoCardContent, captureSceneViewSnapshot, restoreSceneViewSnapshot, syncSceneCommandEditor, loadSceneEditRevision, saveFocusedSceneCommands, persistCurrentSceneCommands, undoLastSceneEdit, submitSceneCommandEditor, setObjectEditingEnabled, surfaceRoleForObject, assetPlacementPoint, cancelAssetPlacement, startAssetPlacement, updateAssetPlacementPreview, placeAssetAtCurrentTarget, copyCurrentLaserTargetDetails, handleKey, resetMoveState, isKeyboardRoamActive, isPointerLookActive, isRoamMovementActive, configureSceneObjectShadows, isBuildingMesh, buildingMaterials, applyBuildingOpacity, authoredBuildingOpacity, syncBuildingOpacityUi, updateLaserPointer, loadScene } = createViewerSceneInteractionController(() => ({ get AVATAR_EYE_HEIGHT_M(): typeof AVATAR_EYE_HEIGHT_M { return AVATAR_EYE_HEIGHT_M; }, get CATEGORY_COLORS(): typeof CATEGORY_COLORS { return CATEGORY_COLORS; }, get DEFAULT_WHITE_MASSING_OPACITY(): typeof DEFAULT_WHITE_MASSING_OPACITY { return DEFAULT_WHITE_MASSING_OPACITY; }, get THIRD_PERSON_DISTANCE_M(): typeof THIRD_PERSON_DISTANCE_M { return THIRD_PERSON_DISTANCE_M; }, get THIRD_PERSON_VERTICAL_OFFSET_M(): typeof THIRD_PERSON_VERTICAL_OFFSET_M { return THIRD_PERSON_VERTICAL_OFFSET_M; }, get applyAudioProfile(): typeof applyAudioProfile { return applyAudioProfile; }, get assetBboxEnabledBeforeEditing(): typeof assetBboxEnabledBeforeEditing { return assetBboxEnabledBeforeEditing; }, get assetBboxToggleEl(): typeof assetBboxToggleEl { return assetBboxToggleEl; }, get assetMoveToggleEl(): typeof assetMoveToggleEl { return assetMoveToggleEl; }, get assetPlacementAsset(): typeof assetPlacementAsset { return assetPlacementAsset; }, get assetPlacementGhost(): typeof assetPlacementGhost { return assetPlacementGhost; }, get assetPlacementPointer(): typeof assetPlacementPointer { return assetPlacementPointer; }, get avatarFigure(): typeof avatarFigure { return avatarFigure; }, get buildingOpacityInput(): typeof buildingOpacityInput { return buildingOpacityInput; }, get buildingOpacityOverride(): typeof buildingOpacityOverride { return buildingOpacityOverride; }, get buildingOpacityValueEl(): typeof buildingOpacityValueEl { return buildingOpacityValueEl; }, get camera(): typeof camera { return camera; }, get canvasHost(): typeof canvasHost { return canvasHost; }, get captureMode(): typeof captureMode { return captureMode; }, get clearError(): typeof clearError { return clearError; }, get commandRegistry(): typeof commandRegistry { return commandRegistry; }, get controls(): typeof controls { return controls; }, get crosshairEl(): typeof crosshairEl { return crosshairEl; }, get currentAvatarPosition(): typeof currentAvatarPosition { return currentAvatarPosition; }, get currentCameraMode(): typeof currentCameraMode { return currentCameraMode; }, get currentForward(): typeof currentForward { return currentForward; }, get currentLang(): typeof currentLang { return currentLang; }, get currentLaserCopyText(): typeof currentLaserCopyText { return currentLaserCopyText; }, get currentLaserHitPoint(): typeof currentLaserHitPoint { return currentLaserHitPoint; }, get currentLayoutPath(): typeof currentLayoutPath { return currentLayoutPath; }, get currentManifest(): typeof currentManifest { return currentManifest; }, get currentRoot(): typeof currentRoot { return currentRoot; }, get currentSceneBounds(): typeof currentSceneBounds { return currentSceneBounds; }, get currentSpawn(): typeof currentSpawn { return currentSpawn; }, get dioramaFinishToggleEl(): typeof dioramaFinishToggleEl { return dioramaFinishToggleEl; }, get directEditEl(): typeof directEditEl { return directEditEl; }, get editAutosave(): typeof editAutosave { return editAutosave; }, get environmentController(): typeof environmentController { return environmentController; }, get environmentState(): typeof environmentState { return environmentState; }, get errorEl(): typeof errorEl { return errorEl; }, get expandedMapController(): typeof expandedMapController { return expandedMapController; }, get exposureInput(): typeof exposureInput { return exposureInput; }, get exposureValueEl(): typeof exposureValueEl { return exposureValueEl; }, get fillInput(): typeof fillInput { return fillInput; }, get fillValueEl(): typeof fillValueEl { return fillValueEl; }, get floatingLaneSystem(): typeof floatingLaneSystem { return floatingLaneSystem; }, get frameModeToggleEl(): typeof frameModeToggleEl { return frameModeToggleEl; }, get graphOverlayMarkers(): typeof graphOverlayMarkers { return graphOverlayMarkers; }, get hideDesignWorkspace(): typeof hideDesignWorkspace { return hideDesignWorkspace; }, get hostOptions(): typeof hostOptions { return hostOptions; }, get infoCardEl(): typeof infoCardEl { return infoCardEl; }, get isEditableTarget(): typeof isEditableTarget { return isEditableTarget; }, get isRoamMovementKey(): typeof isRoamMovementKey { return isRoamMovementKey; }, get keyInput(): typeof keyInput { return keyInput; }, get keyValueEl(): typeof keyValueEl { return keyValueEl; }, get laserBeam(): typeof laserBeam { return laserBeam; }, get laserHitDot(): typeof laserHitDot { return laserHitDot; }, get laserToggleEl(): typeof laserToggleEl { return laserToggleEl; }, get lastLaserTargetKey(): typeof lastLaserTargetKey { return lastLaserTargetKey; }, get lastSceneEditUndo(): typeof lastSceneEditUndo { return lastSceneEditUndo; }, get lightingPresetEl(): typeof lightingPresetEl { return lightingPresetEl; }, get lightingRig(): typeof lightingRig { return lightingRig; }, get lightingState(): typeof lightingState { return lightingState; }, get loader(): typeof loader { return loader; }, get minimapPlanCanvas(): typeof minimapPlanCanvas { return minimapPlanCanvas; }, get moveState(): typeof moveState { return moveState; }, get overlayEl(): typeof overlayEl { return overlayEl; }, get panelController(): typeof panelController { return panelController; }, get pointerOutsideViewer(): typeof pointerOutsideViewer { return pointerOutsideViewer; }, get populateRecentLayoutOptions(): typeof populateRecentLayoutOptions { return populateRecentLayoutOptions; }, get raycaster(): typeof raycaster { return raycaster; }, get recentLayoutSelector(): typeof recentLayoutSelector { return recentLayoutSelector; }, get refreshAnalysisOverlayForSelectedBranch(): typeof refreshAnalysisOverlayForSelectedBranch { return refreshAnalysisOverlayForSelectedBranch; }, get renderPipeline(): typeof renderPipeline { return renderPipeline; }, get renderer(): typeof renderer { return renderer; }, get root(): typeof root { return root; }, get scene(): typeof scene { return scene; }, get sceneAssetDialog(): typeof sceneAssetDialog { return sceneAssetDialog; }, get sceneCommandJsonEl(): typeof sceneCommandJsonEl { return sceneCommandJsonEl; }, get sceneCommandStatusEl(): typeof sceneCommandStatusEl { return sceneCommandStatusEl; }, get sceneCommandSubmitEl(): typeof sceneCommandSubmitEl { return sceneCommandSubmitEl; }, get sceneCommandUndoEl(): typeof sceneCommandUndoEl { return sceneCommandUndoEl; }, get sceneObjectEditor(): typeof sceneObjectEditor { return sceneObjectEditor; }, get sceneSelectionController(): typeof sceneSelectionController { return sceneSelectionController; }, get setError(): typeof setError { return setError; }, get setToggleInput(): typeof setToggleInput { return setToggleInput; }, get shadowInput(): typeof shadowInput { return shadowInput; }, get shadowValueEl(): typeof shadowValueEl { return shadowValueEl; }, get shell(): typeof shell { return shell; }, get signal(): typeof signal { return signal; }, get statusEl(): typeof statusEl { return statusEl; }, get statusResetHandle(): typeof statusResetHandle { return statusResetHandle; }, get structuredEvaluationController(): typeof structuredEvaluationController { return structuredEvaluationController; }, get t(): typeof t { return t; }, get thirdPersonToggleEl(): typeof thirdPersonToggleEl { return thirdPersonToggleEl; }, get warmthInput(): typeof warmthInput { return warmthInput; }, get warmthValueEl(): typeof warmthValueEl { return warmthValueEl; }, get workflow(): typeof workflow { return workflow; }, get writeTextToClipboard(): typeof writeTextToClipboard { return writeTextToClipboard; } }));
  const { manifestDefaultsToDioramaFinish, syncDesignGraphTemplateId, syncDesignGraphTemplateFromManifest, inferGraphTemplateIdFromLayoutPath, scheduleDesignMatrixRefresh, selectedScenarioDesign, profileLabel, selectedDesignSemanticConfigPatch, selectedAssetGenerationOptions, currentGenerationSpecBuild, renderGenerationOutputSummary, selectedDesignSemanticSummary, updateDesignLayerSummaries, renderDesignScenarioOptions, updateDesignScenarioMeta, loadDesignScenarioCatalog, getTemplatePatchOperationCount, summarizeDraftDefaults, renderDraftScenarioResult, scenarioFromDraftPayload, draftDesignScenarioVariant, useLatestDraftScenario, loadSelectedDesignScenarioPreview, openSelectedDesignScenarioAnnotation } = createViewerDesignScenarioController(() => ({ get STREET_FURNITURE_OVERRIDE_PATCHES(): typeof STREET_FURNITURE_OVERRIDE_PATCHES { return STREET_FURNITURE_OVERRIDE_PATCHES; }, get STRUCTURE_PREVIEW_DEFAULT_STEP_KEY(): typeof STRUCTURE_PREVIEW_DEFAULT_STEP_KEY { return STRUCTURE_PREVIEW_DEFAULT_STEP_KEY; }, get designFurnitureProfileEl(): typeof designFurnitureProfileEl { return designFurnitureProfileEl; }, get designFurnitureSummaryEl(): typeof designFurnitureSummaryEl { return designFurnitureSummaryEl; }, get designMatrixController(): typeof designMatrixController { return designMatrixController; }, get designPromptEl(): typeof designPromptEl { return designPromptEl; }, get designScenarioAnnotationEl(): typeof designScenarioAnnotationEl { return designScenarioAnnotationEl; }, get designScenarioCatalog(): typeof designScenarioCatalog { return designScenarioCatalog; }, get designScenarioDraftEl(): typeof designScenarioDraftEl { return designScenarioDraftEl; }, get designScenarioDraftPromptEl(): typeof designScenarioDraftPromptEl { return designScenarioDraftPromptEl; }, get designScenarioDraftResultEl(): typeof designScenarioDraftResultEl { return designScenarioDraftResultEl; }, get designScenarioEl(): typeof designScenarioEl { return designScenarioEl; }, get designScenarioMetaEl(): typeof designScenarioMetaEl { return designScenarioMetaEl; }, get designScenarioPreviewEl(): typeof designScenarioPreviewEl { return designScenarioPreviewEl; }, get designScenarioUseDraftEl(): typeof designScenarioUseDraftEl { return designScenarioUseDraftEl; }, get designScenarioUseLlmEl(): typeof designScenarioUseLlmEl { return designScenarioUseLlmEl; }, get designSeedEl(): typeof designSeedEl { return designSeedEl; }, get designSkeletonProfileEl(): typeof designSkeletonProfileEl { return designSkeletonProfileEl; }, get designSkeletonSummaryEl(): typeof designSkeletonSummaryEl { return designSkeletonSummaryEl; }, get designTemplateEl(): typeof designTemplateEl { return designTemplateEl; }, get errorEl(): typeof errorEl { return errorEl; }, get flashStatus(): typeof flashStatus { return flashStatus; }, get generationOutputSummaryEl(): typeof generationOutputSummaryEl { return generationOutputSummaryEl; }, get latestDraftScenario(): typeof latestDraftScenario { return latestDraftScenario; }, get panelController(): typeof panelController { return panelController; }, get parameterDesignController(): typeof parameterDesignController { return parameterDesignController; }, get populateRecentLayoutOptions(): typeof populateRecentLayoutOptions { return populateRecentLayoutOptions; }, get sceneSelectionController(): typeof sceneSelectionController { return sceneSelectionController; }, get selectedDesignPreset(): typeof selectedDesignPreset { return selectedDesignPreset; }, get setError(): typeof setError { return setError; }, get setStatus(): typeof setStatus { return setStatus; }, get signal(): typeof signal { return signal; }, get workflow(): typeof workflow { return workflow; } }));
  const root = shell.root;
  root.dataset.workbenchHost = hostOptions.embedded ? "course" : "expert";
  const eventController = new AbortController();
  const { signal } = eventController;
  const captureMode = isHeadlessCaptureRequest();
  let currentLang: { value: ViewerLanguage } = { value: loadViewerLanguage() };
  const t = (en: string, zh: string): string => viewerText(currentLang.value, en, zh);
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
  const { canvasHost, designWorkspaceEl, statusEl, overlayEl, errorEl, layoutSelectEl, selectEl, sceneGraphLinkEl, assetEditorLinkEl, settingsToggleEl, settingsPanelEl, settingsCloseEl, infoCardEl, crosshairEl, minimapEl, minimapExpandEl, minimapPlanCanvas, axisHudEl, lightingPresetEl, exposureInput, keyInput, fillInput, warmthInput, shadowInput, buildingOpacityInput, exposureValueEl, keyValueEl, fillValueEl, warmthValueEl, shadowValueEl, buildingOpacityValueEl, thirdPersonToggleEl, frameModeToggleEl, assetBboxToggleEl, assetMoveToggleEl, laserToggleEl, designToggleEl, designPanelEl, generationDialogEl, generationSourceSummaryEl, generationStrategySummaryEl, parameterSkeletonHostEl, parameterFurnitureHostEl, parameterSummaryEl, designReviewRunEl, designPresetEl, designPromptEl, designCountEl, designSeedEl, designTemplateEl, designScenarioEl, designScenarioMetaEl, designSkeletonSummaryEl, designScenarioPreviewEl, designScenarioAnnotationEl, designScenarioDraftPromptEl, designScenarioUseLlmEl, designScenarioDraftEl, designScenarioUseDraftEl, designScenarioDraftResultEl, designSkeletonProfileEl, designFurnitureProfileEl, designFurnitureSummaryEl, designMatrixEl, designBenchmarkEl, designBranchHistoryEl, designBranchRunEl, designGenerateEl, designStatusEl, designResultEl, evaluatePanelEl, evaluateCloseEl, evaluateRunEl, evaluateContentEl, evaluateGateEl, evaluationConfigInputs, evaluationConfigErrorEl, evaluationConfigResetEl, comparePanelEl, compareSelectAEl, compareSelectBEl, compareResultsEl, exitCompare3dEl, consistencyPanelEl, consistencyCloseEl, consistencyContentEl, exportTopdownMapEl, exportTopdownSvgEl, graphOverlayToggleEl, layoutOverlayToggleEl, analysisOverlayToggleEl, dioramaFinishToggleEl, audioToggleEl, capabilityStatusEl, sceneCommandJsonEl, sceneCommandSubmitEl, sceneCommandUndoEl, sceneCommandStatusEl, floatingLanePanelHost, generationRunEl, syncCameraEl, mode3dEl, mode2dEl, modeGraphEl, } = collectViewerPanelElements(root);
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
  let starterDemoBannerDismissed: { value: boolean } = { value: false };
  let activeSceneOrigin: { value: ActiveSceneOrigin | null } = { value: workflow.getSnapshot().sceneLayoutPath ? "workflow" : null };
  let activeStarterScene: { value: StarterScenePackage | null } = { value: null };
  let starterLoading: { value: boolean } = { value: false };
  let starterLoadError: { value: string } = { value: "" };
  let generationWizard: ReturnType<typeof createViewerGenerationWizardController> | null = null;
  let parameterDesignController: ViewerParameterDesignController | null = null;
  const renderCapabilityStatus = (): void => {
    const capabilities = workflow.getSnapshot().capabilities;
    capabilityStatusEl.innerHTML = renderWorkflowCapabilities(capabilities);
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
    flashStatus(currentLang.value === "zh"
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
  let designScenarioCatalog: { value: ScenarioDesignCatalogPayload | null } = { value: null };
  let latestDraftScenario: { value: ScenarioDesign | null } = { value: null };
  let designMatrixController: { value: ReturnType<typeof createViewerDesignMatrixController> | null } = { value: null };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4f6f2");
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
  const audioManager = new AudioManager(camera, scene);
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
    getCurrentRoot: () => currentRoot.value,
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
    getLang: () => currentLang.value,
  });
  const raycaster = new THREE.Raycaster();
  const clock = new THREE.Clock();
  let animationFrameId: { value: number } = { value: 0 };
  let destroyed: { value: boolean } = { value: false };
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
  let currentRoot: { value: THREE.Object3D | null } = { value: null };
  let buildingOpacityOverride: { value: number | null } = { value: null };
  let currentLayoutPath: { value: string } = { value: "" };
  let currentSpawn: { value: THREE.Vector3 } = { value: new THREE.Vector3(0, 1.65, 0) };
  let currentForward: { value: THREE.Vector3 } = { value: new THREE.Vector3(1, 0, 0) };
  let currentAvatarPosition: { value: THREE.Vector3 } = { value: new THREE.Vector3(0, Math.max(0, 1.65 - AVATAR_EYE_HEIGHT_M), 0) };
  let currentCameraMode: { value: CameraMode } = { value: "first_person" };
  let currentSceneBounds: { value: SceneBounds | null } = { value: null };
  let currentLaserHitPoint: { value: THREE.Vector3 | null } = { value: null };
  let currentLaserCopyText: { value: string } = { value: "" };
  let lastLaserTargetKey: { value: string } = { value: "" };
  let flyAnimation: { value: { startAvatarPos: THREE.Vector3; targetAvatarPos: THREE.Vector3; startTime: number; duration: number } | null } = { value: null };
  let statusResetHandle: { value: number | null } = { value: null };
  let lastBranchRunSnapshot: { value: BranchRunStatusPayload | null } = { value: null };
  let selectedBranchNodeId: { value: string | null } = { value: null };
  let lastDesignRunSnapshot: { value: DesignRunSnapshot | null } = { value: null };
  let graphOverlayActive: { value: boolean } = { value: false };
  const graphOverlayMarkers: THREE.Object3D[] = [];
  const lightingState: LightingState = {
    ...DEFAULT_LIGHTING_STATE,
  };
  let environmentState: { value: EnvironmentState } = { value: {
    ...DEFAULT_ENVIRONMENT_STATE,
  } };
  let environmentController: ViewerEnvironmentController;
  let panelController: ViewerPanelController;
  let recentLayoutSelector: RecentLayoutSelectorController;
  const floatingLaneSystem = createFloatingLaneSystem({
    scene,
    camera,
    getManifest: () => currentManifest.value,
    getSceneBounds: () => currentSceneBounds.value,
    cameraForwardHorizontal,
    axisHudEl,
    layoutOverlayToggleEl,
    panelHost: floatingLanePanelHost,
    getLanguage: () => currentLang.value,
  });
  floatingLaneSystem.mountControlPanel();
  const expandedMapController = createExpandedMapController({
    scene,
    getRoot: () => currentRoot.value,
    getBounds: () => currentSceneBounds.value,
    getManifest: () => currentManifest.value,
    getLayoutPath: () => currentLayoutPath.value || currentManifest.value?.layout_path || "",
    loadRecentLayouts,
    loadManifest: (layoutPath) => loadManifest(layoutPath),
    getAvatarPosition: () => currentAvatarPosition.value,
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
      updateOverlay();
    },
    onDesignOpen: () => {
      updateGenerationDialogContract();
      generationWizard?.open();
    },
    onCompareOpen: populateCompareSelectors,
    onConsistencyOpen: () => renderConsistencyPanel(),
    onCloseAllOverlays: () => {
      if (graphOverlayActive.value) {
        clearGraphOverlay();
        graphOverlayActive.value = false;
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
    shouldStopHydration: () => destroyed.value,
    isCompareOpen: () => false,
    refreshCompareSelectors: populateCompareSelectors,
    defaultLabel: (ordinal) => currentLang.value === "zh" ? `场景 ${ordinal}` : `Scene ${ordinal}`,
    backgroundLimit: RECENT_LAYOUT_BACKGROUND_LIMIT,
    backgroundBatch: RECENT_LAYOUT_BACKGROUND_BATCH,
  });
  const sceneSelectionController = createViewerSceneSelectionController({
    selectEl,
    errorEl,
    setStatus,
    clearError,
    setCurrentLayoutPath: (layoutPath) => {
      currentLayoutPath.value = layoutPath;
    },
    setCurrentManifest: (manifest) => {
      currentManifest.value = manifest;
      setToggleInput(dioramaFinishToggleEl, manifestDefaultsToDioramaFinish(manifest));
      syncDesignGraphTemplateFromManifest(manifest, currentLayoutPath.value);
    },
    loadScene,
    persistSelectionInUrl: !hostOptions.embedded,
    afterLayoutLoaded: () => {
      updateMetricsPanel();
      renderConsistencyPanel();
      renderUsedAssetProvenance();
      if (graphOverlayActive.value) {
        setToggleInput(graphOverlayToggleEl, false);
        graphOverlayActive.value = false;
        clearGraphOverlay();
        currentCameraMode.value = thirdPersonToggleEl.checked ? "third_person" : "first_person";
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
        currentManifest.value?.layout_revision
        && (
          standaloneLayout
          || workflowSnapshot.sceneLayoutPath === currentLayoutPath.value
          || workflowSnapshot.step === "edit"
          || workflowSnapshot.step === "evaluate"
        )
      ) {
        workflow.setSceneRevision({
          revision: currentManifest.value.layout_revision.revision,
          sha256: currentManifest.value.layout_revision.sha256,
          layout_path: currentLayoutPath.value || currentManifest.value.layout_path,
        }, workflowSnapshot.undoCommand);
      }
      renderProfessionalWorkflowState();
    },
  });
  root.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-starter-action]")?.dataset.starterAction;
    if (action === "materialize") void materializeActiveStarterScene();
    if (action === "dismiss") {
      starterDemoBannerDismissed.value = true;
      renderProfessionalWorkflowState();
    }
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
    getCurrentLayoutPath: () => currentLayoutPath.value,
    getCurrentManifest: () => currentManifest.value,
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
    getCurrentRoot: () => currentRoot.value,
    getCurrentSpawn: () => currentSpawn.value,
    getCurrentForward: () => currentForward.value,
    getCurrentLayoutPath: () => currentLayoutPath.value,
    getCurrentManifest: () => currentManifest.value,
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
    hasLastDesignRunSnapshot: () => lastDesignRunSnapshot.value !== null,
    setSelectedBranchNodeId: (nodeId) => {
      selectedBranchNodeId.value = nodeId;
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
  designMatrixController.value = createViewerDesignMatrixController({
    matrixEl: designMatrixEl,
    designPromptEl,
    designTemplateEl,
    getSelectedDesignPreset: selectedDesignPreset,
    getSelectedScenarioDesign: selectedScenarioDesign,
    getLatestDraftScenario: () => latestDraftScenario.value,
    getDesignSemanticConfigPatch: selectedDesignSemanticConfigPatch,
    isReferenceAnnotationMode: () => Boolean(workflow.getSnapshot().normalized),
    getCurrentLayoutPath: () => currentLayoutPath.value || currentManifest.value?.layout_path || "",
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
      frameSceneOverview();
      workflow.setGeneratedScene({
        layoutPath,
        ...(currentManifest.value?.layout_revision ? {
          sceneRevision: {
            revision: currentManifest.value.layout_revision.revision,
            sha256: currentManifest.value.layout_revision.sha256,
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
      renderProfessionalWorkflowState();
      shell.openModalTab("review");
      flashStatus("Generated scene loaded. You can now preview the corresponding 3D result.");
    },
    setStatus,
  });
  environmentController = createViewerEnvironmentController({
    root,
    scene,
    signal,
    getState: () => environmentState.value,
    setState: (state) => {
      environmentState.value = state;
    },
    getCurrentRoot: () => currentRoot.value,
    setToggleInput,
    applyLightingState,
  });
  let pointerOutsideViewer = false;
  let lastSceneEditUndo: { value: SceneLayoutEditResponse["undo"] & { layoutPath: string } | null } = { value: null };
  let structuredEvaluationController: { value: AbortController | null } = { value: null };
  type SceneViewSnapshot = {
    cameraPosition: THREE.Vector3;
    cameraQuaternion: THREE.Quaternion;
    avatarPosition: THREE.Vector3;
    cameraMode: CameraMode;
    editingEnabled: boolean;
    editMode: SceneObjectEditMode;
  };
  const objectEditStatusController = createSceneObjectEditStatusController({
    root,
    getLanguage: () => currentLang.value,
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
        const record = currentManifest.value?.instances?.[command.instance_id];
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
    getCurrentRoot: () => currentRoot.value,
    getManifest: () => currentManifest.value,
    controlsAreLocked: () => controls.isLocked,
    unlockControls: () => controls.unlock(),
    flashStatus,
    updateHelpers: () => updateAssetBboxHelpers(scene),
    enqueue: (command, options) => editAutosave.enqueue(command, options),
    onInteractionStateChange: (state) => objectEditStatusController.setInteractionState(state),
  });
  let assetBboxEnabledBeforeEditing: { value: boolean | null } = { value: null };
  const directEditEl = root.querySelector<HTMLButtonElement>("#viewer-direct-edit");
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
    language: () => currentLang.value,
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
        language: () => currentLang.value,
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
          if (opened && buildingOpacityOverride.value !== null) {
            compareMode.forEachCompareRoot((rootObject) => applyBuildingOpacity(rootObject, null, buildingOpacityOverride.value!));
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
  const featureQualityToggleEl = root.querySelector<HTMLButtonElement>("#viewer-feature-quality-toggle");
  const featureQualityWorkbenchEl = root.querySelector<HTMLElement>("#viewer-feature-quality-workbench");
  const canUseFeatureQualityWorkbench = (): boolean => hostOptions.isFeatureQualityAdmin?.() === true;
  if (featureQualityToggleEl) {
    const visible = canUseFeatureQualityWorkbench();
    featureQualityToggleEl.hidden = !visible;
    featureQualityToggleEl.setAttribute("aria-hidden", String(!visible));
  }
  const featureQualityWorkbench = featureQualityToggleEl && featureQualityWorkbenchEl
    ? createFeatureQualityWorkbench({
        root: featureQualityWorkbenchEl,
        toggle: featureQualityToggleEl,
        isAuthorized: canUseFeatureQualityWorkbench,
        getBasePatch: () => ({
          ...selectedDesignSemanticConfigPatch(),
          ...(parameterDesignController?.composeConfigPatch() ?? {}),
        }),
        getGraphTemplateId: () => designTemplateEl.value,
        getGenerationOptions: () => ({
          ...selectedAssetGenerationOptions(),
          ...(parameterDesignController?.generationOptions() ?? {}),
          capture_3d_views: true,
          capture_profile: "feature_tri_view",
          retain_glb_policy: "always",
        }),
        applyPatch: (patch) => {
          parameterDesignController?.applyComposeConfigPatch(patch);
          updateGenerationDialogContract();
        },
        loadVariant: async (layoutPath, sceneGlbPath) => {
          await sceneSelectionController.loadLayoutSelection(layoutPath, {
            sceneGlbPath,
            defaultSceneOptionKey: "final_scene",
          });
          frameSceneOverview();
        },
        flashStatus,
      })
    : null;
  const assetPlacementGhost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 0.04, 28),
    new THREE.MeshBasicMaterial({ color: 0xb9d9cc, transparent: true, opacity: 0.78, depthWrite: false }),
  );
  assetPlacementGhost.name = "roadgen3d-asset-placement-ghost";
  assetPlacementGhost.visible = false;
  assetPlacementGhost.userData.viewerHelper = true;
  scene.add(assetPlacementGhost);
  let assetPlacementAsset: { value: SceneAssetRef | null } = { value: null };
  const assetPlacementPointer = new THREE.Vector2(0, 0);
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!assetPlacementAsset.value || isPointerLookActive()) return;
    const rect = renderer.domElement.getBoundingClientRect();
    assetPlacementPointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    updateAssetPlacementPreview();
  }, { signal });
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (!assetPlacementAsset.value || event.button !== 0) return;
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
    if (!assetPlacementAsset.value) return;
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
    !assetPlacementAsset.value
    && !sceneObjectEditor.isEnabled()
    && !panelController.isAnyOpen()
    && !compareMode.isCompare3dActive()
    && currentCameraMode.value !== "graph_overlay"
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
    flyAnimation.value = null;
    camera.rotateOnWorldAxis(UP_AXIS, -deltaX * DRAG_LOOK_SENSITIVITY);
    const nextPitch = THREE.MathUtils.clamp(
      cameraPitch() - deltaY * DRAG_LOOK_SENSITIVITY,
      -MAX_DRAG_LOOK_PITCH,
      MAX_DRAG_LOOK_PITCH,
    );
    camera.rotateX(nextPitch - cameraPitch());
    camera.updateMatrixWorld();
    currentForward.value.copy(cameraForwardHorizontal());
    if (currentCameraMode.value === "first_person" || currentCameraMode.value === "third_person") {
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
  window.__roadgen3dCaptureGallery = async (request: RoadGen3DCaptureGalleryRequest) => {
    const targets = Array.isArray(request?.targets) ? request.targets : [];
    if (targets.length === 0) {
      return { views: [] };
    }
    const width = Math.max(64, Math.trunc(Number(request?.width) || 1280));
    const height = Math.max(64, Math.trunc(Number(request?.height) || 720));
    if (request?.layoutPath) {
      const manifest = await loadManifest(request.layoutPath, false);
      currentManifest.value = manifest;
      currentLayoutPath.value = manifest.layout_path || request.layoutPath;
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
        currentRoot: currentRoot.value,
        currentSpawn: currentSpawn.value,
        currentForward: currentForward.value,
        avatarEyeHeightM: AVATAR_EYE_HEIGHT_M,
      },
      targets,
      width,
      height,
    );
    return { views };
  };
  const sceneClickRoamController = createSceneClickRoamController({
    camera,
    element: renderer.domElement,
    getCurrentRoot: () => currentRoot.value,
    isEnabled: () => (
      (currentCameraMode.value === "frame" || currentCameraMode.value === "graph_overlay")
      &&
      !controls.isLocked
      && !sceneObjectEditor.isEnabled()
      && !assetPlacementAsset.value
      && !panelController.isAnyOpen()
      && !compareMode.isCompare3dActive()
    ),
    onScenePoint: (point) => {
      flyCameraTo(point.x, Math.max(0, currentAvatarPosition.value.y), point.z, 900);
      flashStatus(currentLang.value === "zh"
        ? "正在漫游到点击位置；按住左键拖动可调整视角，WASD 可继续移动。"
        : "Moving to the clicked location. Drag with the left mouse button to look around; WASD continues movement.");
    },
  });
  minimapPlanCanvas.addEventListener("click", (event) => {
    if (sceneObjectEditor.isEnabled() || assetPlacementAsset.value || panelController.isAnyOpen()) return;
    const rect = minimapPlanCanvas.getBoundingClientRect();
    const destination = minimapToWorld(
      event.clientX - rect.left,
      event.clientY - rect.top,
      currentSceneBounds.value,
      minimapPlanCanvas,
    );
    if (!destination) return;
    event.preventDefault();
    event.stopPropagation();
    flyCameraTo(destination.x, Math.max(0, currentAvatarPosition.value.y), destination.z, 900);
    flashStatus(currentLang.value === "zh"
      ? "正在漫游到小地图选择的位置。"
      : "Moving to the location selected on the minimap.");
  }, { signal });
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
  let cameraDiagnosticColorMode: { value: SurfaceDiagnosticColorMode } = { value: "role" };
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
  window.addEventListener(VIEWER_LANGUAGE_EVENT, (event) => {
    const detail = (event as CustomEvent<{ language?: unknown }>).detail;
    applyLocalLanguage(normalizeViewerLanguage(detail?.language));
  }, { signal });
  applyLocalLanguage(currentLang.value);
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
    if (branchNodeId && lastBranchRunSnapshot.value) {
      selectedBranchNodeId.value = branchNodeId;
      renderBranchWorkspace(lastBranchRunSnapshot.value);
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
  syncCameraEl.addEventListener("click", () => {
    if (currentCameraMode.value === "frame") {
      frameSceneOverview();
      flashStatus("Camera reset to scene overview.");
    } else {
      resetView();
      flashStatus("Camera reset to road-level spawn.");
    }
  }, { signal });
  mode3dEl.addEventListener("click", () => {
    if (graphOverlayActive.value) {
      setToggleInput(graphOverlayToggleEl, false);
      graphOverlayActive.value = false;
      clearGraphOverlay();
      currentCameraMode.value = thirdPersonToggleEl.checked ? "third_person" : "first_person";
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
    if (!graphOverlayActive.value) {
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
      buildingOpacityOverride.value = THREE.MathUtils.clamp(Number(buildingOpacityInput.value), 0.1, 1);
      if (currentRoot.value) applyBuildingOpacity(currentRoot.value, currentManifest.value, buildingOpacityOverride.value);
      compareMode.forEachCompareRoot((rootObject) => applyBuildingOpacity(rootObject, null, buildingOpacityOverride.value!));
      syncBuildingOpacityUi();
    },
    { signal },
  );
  thirdPersonToggleEl.addEventListener(
    "change",
    () => {
      currentCameraMode.value = thirdPersonToggleEl.checked ? "third_person" : "first_person";
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
        currentLaserHitPoint.value = null;
        lastLaserTargetKey.value = "";
      }
    },
    { signal },
  );
  assetBboxToggleEl.addEventListener(
    "change",
    () => {
      if (assetBboxToggleEl.checked) {
        createAssetBboxHelpers(scene, currentRoot.value, currentManifest.value, { showLabels: sceneObjectEditor.isEnabled() });
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
      if (currentOption && currentRoot.value) {
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
      const currentOption = sceneSelectionController.selectedSceneOption();
      if (currentOption && currentRoot.value) {
        await loadScene(currentOption);
      }
    },
    { signal },
  );
  graphOverlayToggleEl.addEventListener(
    "change",
    () => {
      if (graphOverlayToggleEl.checked) {
        graphOverlayActive.value = true;
        buildGraphOverlay();
        flashStatus("Graph overlay enabled - top-down view");
      } else {
        graphOverlayActive.value = false;
        clearGraphOverlay();
        currentCameraMode.value = thirdPersonToggleEl.checked ? "third_person" : "first_person";
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
      if (!nextLayoutPath || nextLayoutPath === currentLayoutPath.value) {
        return;
      }
      lastSceneEditUndo.value = null;
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
      const requestedLayoutPath = explicitLayoutPath
        || ((hostOptions.embedded || hostOptions.preferWorkflowScene) ? workflowLayoutPath : null);
      const recentLayouts: RecentLayout[] = [];
      const initialLayoutCandidates = requestedLayoutPath ? [requestedLayoutPath] : [];
      if (initialLayoutCandidates.length === 0) {
        animate();
        updateOverlay();
        if (hostOptions.embedded || hostOptions.preferWorkflowScene) {
          setStatus(t(
            "The current project source is ready for 3D generation.",
            "当前项目的 OSM 与标注版本已就绪，可直接生成 3D 场景。",
          ));
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
          activeSceneOrigin.value = explicitLayoutPath ? "explicit_layout" : "workflow";
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
    destroyed.value = true;
    if (window.__roadgen3dCaptureGallery) {
      delete window.__roadgen3dCaptureGallery;
    }
    if (captureMode) {
      document.body.classList.remove("roadgen-capture-mode");
    }
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value);
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
    structuredEvaluationController.value?.abort();
    setObjectEditingEnabled(false, { announce: false });
    editAutosave.dispose();
    sceneObjectEditor.dispose();
    sceneAssetDialog.dispose();
    cancelAssetPlacement(false);
    scenarioWorkbench?.dispose();
    featureQualityWorkbench?.dispose();
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
