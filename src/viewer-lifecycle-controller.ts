import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeStageTree, renderStageTree as renderG6StageTree, StageNode } from "./g6-visualization";
import { AudioManager, type AudioProfile } from "./audio-manager";
import { createCompareMode } from "./compare-mode";
import type { CompareSceneSetItem } from "./compare-mode";
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

type RoadGen3DCaptureGalleryRequest = {
  layoutPath?: string;
  glbUrl?: string;
  targets?: GalleryCaptureTarget[];
  width?: number;
  height?: number;
};

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

export type ViewerLifecycleControllerContext = {
  AVATAR_EYE_HEIGHT_M: 1.62;
  STARTER_REVIEW_ONBOARDING_KEY: "roadgen3d:starter-review-onboarding-seen";
  UP_AXIS: THREE.Vector3;
  activeSceneOrigin: { value: ActiveSceneOrigin | null; };
  activeStarterScene: { value: StarterScenePackage | null; };
  animationFrameId: { value: number; };
  audioManager: AudioManager;
  audioToggleEl: HTMLInputElement;
  camera: THREE.PerspectiveCamera;
  cameraForwardHorizontal: () => THREE.Vector3;
  clock: THREE.Clock;
  compareMode: { runComparison: () => Promise<void>; enterCompare3d: (a: ViewerManifest, b: ViewerManifest) => Promise<void>; enterCompareSceneSet: (items: CompareSceneSetItem[], stepLabel?: string) => Promise<boolean>; exitCompare3d: () => void; renderCompare3dFrame: () => boolean; forEachCompareRoot: (callback: (root: THREE.Object3D) => void) => void; refreshLanguage: () => void; isCompare3dActive: () => boolean; };
  currentAvatarPosition: { value: THREE.Vector3; };
  currentLang: { value: ViewerLanguage; };
  currentManifest: { value: ViewerManifest | null; };
  currentSpawn: { value: THREE.Vector3; };
  destroyed: { value: boolean; };
  environmentController: ViewerEnvironmentController;
  expandedMapController: any;
  flashStatus: (message: string, durationMs?: number) => void;
  floatingLaneSystem: any;
  flyAnimation: { value: { startAvatarPos: THREE.Vector3; targetAvatarPos: THREE.Vector3; startTime: number; duration: number; } | null; };
  frameSceneFocus: (centerXZ: readonly [number, number], requestedExtent: number) => void;
  frameSceneOverview: () => void;
  hostOptions: ViewerHostOptions;
  isRoamMovementActive: () => boolean;
  lightingRig: any;
  moveState: MovementState;
  renderPipeline: any;
  renderProfessionalWorkflowState: () => void;
  scene: THREE.Scene;
  sceneSelectionController: any;
  setStatus: (message: string) => void;
  shell: DesktopShell;
  signal: AbortSignal;
  starterLoadError: { value: string; };
  starterLoading: { value: boolean; };
  syncCameraRig: () => void;
  updateAssetPlacementPreview: () => void;
  updateLaserPointer: () => void;
  workflow: WorkflowController;
};

export function createViewerLifecycleController(getContext: () => ViewerLifecycleControllerContext) {
  function applyAudioProfile(): void {
    const { audioManager, audioToggleEl, currentManifest } = getContext();
    const profile = currentManifest.value?.audio_profile;
    if (profile) {
      audioManager.applyProfile(profile as AudioProfile);
      if (audioToggleEl.checked) {
        audioManager.play();
      }
    } else {
      audioManager.stop();
    }
  }

  async function materializeActiveStarterScene(): Promise<boolean> {
    const { activeSceneOrigin, activeStarterScene, currentLang, flashStatus, frameSceneOverview, hostOptions, renderProfessionalWorkflowState, sceneSelectionController, setStatus, signal, starterLoadError, workflow } = getContext();
    if (activeSceneOrigin.value !== "starter_demo" || !activeStarterScene.value) return true;
    setStatus(currentLang.value === "zh" ? "正在复制内置示例到专业工作流…" : "Copying the starter demo into the professional workflow…");
    try {
      const materialized = await requestStarterSceneMaterialization(activeStarterScene.value.id, signal);
      await applyMaterializedStarterScene(workflow, materialized);
      const projectTarget = hostOptions.copyStarterToProject
        ? await hostOptions.copyStarterToProject(materialized.layout_path)
        : null;
      await sceneSelectionController.loadLayoutSelection(projectTarget?.layoutPath ?? materialized.layout_path, {
        persistSelectionInUrl: true,
        defaultSceneOptionKey: "final_scene",
      });
      frameSceneOverview();
      activeSceneOrigin.value = "workflow";
      activeStarterScene.value = null;
      starterLoadError.value = "";
      renderProfessionalWorkflowState();
      flashStatus(currentLang.value === "zh" ? "示例已复制为我的项目，并创建可追溯方案 A。" : "The demo was copied into my project as traceable Scenario A.");
      hostOptions.onStarterCopied?.();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      starterLoadError.value = message;
      workflow.reportError(error);
      setStatus(message);
      renderProfessionalWorkflowState();
      return false;
    }
  }

  async function loadStarterScenePreview(): Promise<void> {
    const { STARTER_REVIEW_ONBOARDING_KEY, activeSceneOrigin, activeStarterScene, currentLang, frameSceneFocus, hostOptions, renderProfessionalWorkflowState, sceneSelectionController, setStatus, shell, signal, starterLoadError, starterLoading, workflow } = getContext();
    starterLoading.value = true;
    starterLoadError.value = "";
    activeSceneOrigin.value = null;
    renderProfessionalWorkflowState();
    try {
      const starter = await loadDefaultStarterScene(signal);
      await sceneSelectionController.loadLayoutSelection(starter.viewer_manifest_url, {
        persistSelectionInUrl: false,
        defaultSceneOptionKey: "final_scene",
      });
      activeStarterScene.value = starter;
      activeSceneOrigin.value = "starter_demo";
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
      setStatus(currentLang.value === "zh" ? "正在预览内置广州完整十字路口。" : "Viewing the built-in complete Guangzhou intersection.");
    } catch (error) {
      activeStarterScene.value = null;
      activeSceneOrigin.value = null;
      starterLoadError.value = error instanceof Error ? error.message : String(error);
      setStatus(starterLoadError.value);
    } finally {
      starterLoading.value = false;
      renderProfessionalWorkflowState();
    }
  }

  function animate(): void {
    const { AVATAR_EYE_HEIGHT_M, UP_AXIS, animationFrameId, camera, cameraForwardHorizontal, clock, compareMode, currentAvatarPosition, currentSpawn, destroyed, environmentController, expandedMapController, floatingLaneSystem, flyAnimation, isRoamMovementActive, lightingRig, moveState, renderPipeline, scene, syncCameraRig, updateAssetPlacementPreview, updateLaserPointer } = getContext();
    if (destroyed.value) {
      return;
    }
    const delta = clock.getDelta();

    if (flyAnimation.value) {
      const elapsed = performance.now() - flyAnimation.value.startTime;
      const t = Math.min(elapsed / flyAnimation.value.duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      currentAvatarPosition.value.lerpVectors(flyAnimation.value.startAvatarPos, flyAnimation.value.targetAvatarPos, ease);
      syncCameraRig();
      if (t >= 1) {
        currentAvatarPosition.value.copy(flyAnimation.value.targetAvatarPos);
        syncCameraRig();
        flyAnimation.value = null;
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
        currentAvatarPosition.value.addScaledVector(forward, forwardAxis * moveSpeed * delta);
      }
      if (sideAxis !== 0) {
        currentAvatarPosition.value.addScaledVector(right, sideAxis * moveSpeed * delta);
      }
      currentAvatarPosition.value.y = Math.max(0, currentSpawn.value.y - AVATAR_EYE_HEIGHT_M);
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
    animationFrameId.value = requestAnimationFrame(animate);
  }

  return { materializeActiveStarterScene, loadStarterScenePreview, applyAudioProfile, animate };
}
