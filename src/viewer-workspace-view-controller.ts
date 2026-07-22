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

export type ViewerWorkspaceViewControllerContext = {
  AVATAR_EYE_HEIGHT_M: 1.62;
  analysisOverlayToggleEl: HTMLInputElement;
  avatarFigure: THREE.Group<THREE.Object3DEventMap>;
  camera: THREE.PerspectiveCamera;
  cameraForwardHorizontal: () => THREE.Vector3;
  compareSelectAEl: HTMLSelectElement;
  compareSelectBEl: HTMLSelectElement;
  controls: PointerLockControls;
  currentAvatarPosition: { value: THREE.Vector3; };
  currentCameraMode: { value: CameraMode; };
  currentForward: { value: THREE.Vector3; };
  currentLayoutPath: { value: string; };
  currentManifest: { value: ViewerManifest | null; };
  currentRoot: { value: THREE.Object3D | null; };
  designPresetEl: HTMLSelectElement;
  designPromptEl: HTMLTextAreaElement;
  designResultEl: HTMLElement;
  designReviewRunEl: HTMLButtonElement;
  designStatusEl: HTMLElement;
  designWorkspaceEl: HTMLElement;
  flashStatus: (message: string, durationMs?: number) => void;
  flyAnimation: { value: { startAvatarPos: THREE.Vector3; targetAvatarPos: THREE.Vector3; startTime: number; duration: number; } | null; };
  lastBranchRunSnapshot: { value: BranchRunStatusPayload | null; };
  lastDesignRunSnapshot: { value: DesignRunSnapshot | null; };
  localizeTaskMessage: (message: string) => string;
  minimapEl: HTMLElement;
  recentLayoutSelector: RecentLayoutSelectorController;
  scene: THREE.Scene;
  selectedBranchNodeId: { value: string | null; };
  setToggleInput: (inputEl: HTMLInputElement, checked: boolean, options?: { emitChange?: boolean; }) => void;
  shell: DesktopShell;
};

export function createViewerWorkspaceViewController(getContext: () => ViewerWorkspaceViewControllerContext) {
  function populateRecentLayoutOptions(layouts: RecentLayout[], selectedPath: string): void {
    const { recentLayoutSelector } = getContext();
    recentLayoutSelector.populate(layouts, selectedPath);
  }

  function scheduleRecentLayoutHydration(selectedPath: string, initialLoaded: number): void {
    const { recentLayoutSelector } = getContext();
    recentLayoutSelector.hydrate(selectedPath, initialLoaded);
  }

  function populateDesignPresets(): void {
    const { designPresetEl } = getContext();
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
    const { designPresetEl } = getContext();
    const selectedId = designPresetEl.value;
    if (selectedId === "__custom__") {
      return null; // No preset, let LLM drive
    }
    return VIEWER_DESIGN_PRESETS.find((preset) => preset.id === selectedId) ?? null;
  }

  function updateDesignStatus(message: string, tone: "neutral" | "success" | "warning" | "error" = "neutral"): void {
    const { designStatusEl, localizeTaskMessage, shell } = getContext();
    const localizedMessage = localizeTaskMessage(message);
    designStatusEl.textContent = localizedMessage;
    designStatusEl.dataset.tone = tone;
    shell.pushActivity(localizedMessage, tone);
    shell.setStatusSummary(localizedMessage);
  }

  function openDesignStageDiagnostic(stage: string): void {
    const { designWorkspaceEl, lastDesignRunSnapshot } = getContext();
    const snapshot = lastDesignRunSnapshot.value;
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
    const { designWorkspaceEl } = getContext();
    designWorkspaceEl.querySelector(".viewer-design-diagnostic-modal")?.remove();
  }

  function renderDesignStageTree(payload: SceneJobStatusPayload, currentStage: string, failed: boolean): void {
    const { designWorkspaceEl } = getContext();
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
    const { designReviewRunEl, designWorkspaceEl, lastDesignRunSnapshot, minimapEl } = getContext();
    lastDesignRunSnapshot.value = { payload, preset, variant, prompt, graphTemplateId, structureSource, semanticSummary };
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
    const { designWorkspaceEl, minimapEl } = getContext();
    designWorkspaceEl.hidden = true;
    minimapEl.hidden = false; // Show minimap when design workspace is hidden
    disposeStageTree();
    designWorkspaceEl.innerHTML = "";
  }

  function reviewLastDesignRun(): void {
    const { flashStatus, lastDesignRunSnapshot } = getContext();
    if (!lastDesignRunSnapshot.value) return;
    renderDesignWorkspace(
      lastDesignRunSnapshot.value.payload,
      lastDesignRunSnapshot.value.preset,
      lastDesignRunSnapshot.value.variant,
      lastDesignRunSnapshot.value.prompt,
      lastDesignRunSnapshot.value.graphTemplateId,
      lastDesignRunSnapshot.value.structureSource,
      lastDesignRunSnapshot.value.semanticSummary,
    );
    flashStatus("Design generation steps reopened.");
  }

  function renderBranchWorkspace(payload: BranchRunStatusPayload): void {
    const { designPromptEl, designWorkspaceEl, lastBranchRunSnapshot, minimapEl, selectedBranchNodeId } = getContext();
    lastBranchRunSnapshot.value = payload;
    const selected = resolveSelectedBranchNode(payload, selectedBranchNodeId.value);
    selectedBranchNodeId.value = selected?.node_id ?? selectedBranchNodeId.value;
    designWorkspaceEl.hidden = false;
    minimapEl.hidden = true;
    designWorkspaceEl.innerHTML = renderBranchWorkspaceHtml(payload, selected, designPromptEl.value.trim());
    revealAnalysisOverlayForSelectedBranch();
    requestAnimationFrame(() => {
      mountBranchScoreScatter3d(designWorkspaceEl, payload, selected?.node_id ?? null, (nodeId) => {
        selectedBranchNodeId.value = nodeId;
        renderBranchWorkspace(payload);
      });
    });
  }

  function renderBranchRunResults(payload: BranchRunStatusPayload): void {
    const { designResultEl } = getContext();
    designResultEl.innerHTML = renderBranchRunResultsHtml(payload);
  }

  function selectedBranchNodeForAnalysisOverlay(): BranchRunNode | null {
    const { lastBranchRunSnapshot, selectedBranchNodeId } = getContext();
    if (!lastBranchRunSnapshot.value) return null;
    return resolveSelectedBranchNode(lastBranchRunSnapshot.value, selectedBranchNodeId.value) ?? null;
  }

  function branchNodeHasAnalysisOverlayFeatures(node: BranchRunNode | null): boolean {
    if (!node) return false;
    if ((node.influence_rows ?? []).some((row) => row.active)) return true;
    const analysisFeatures = node.analysis_features as Record<string, unknown> | undefined;
    return Boolean(analysisFeatures && Object.keys(analysisFeatures).length > 0);
  }

  function refreshAnalysisOverlayForSelectedBranch(options: { flash?: boolean } = {}): number {
    const { analysisOverlayToggleEl, currentManifest, currentRoot, flashStatus, scene } = getContext();
    removeAnalysisOverlayHelpers(scene);
    if (!analysisOverlayToggleEl.checked || !currentRoot.value || !currentManifest.value) return 0;
    const selectedNode = selectedBranchNodeForAnalysisOverlay();
    if (!branchNodeHasAnalysisOverlayFeatures(selectedNode)) return 0;
    const highlightCount = createAnalysisOverlayHelpers(scene, currentRoot.value, currentManifest.value, selectedNode);
    if (options.flash && highlightCount > 0) {
      flashStatus(`Analysis overlay highlighted ${highlightCount} active feature${highlightCount === 1 ? "" : "s"}.`);
    }
    return highlightCount;
  }

  function revealAnalysisOverlayForSelectedBranch(): void {
    const { analysisOverlayToggleEl, setToggleInput } = getContext();
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
    const { compareSelectAEl, compareSelectBEl, currentLayoutPath, recentLayoutSelector } = getContext();
    const layouts = recentLayoutSelector.currentLayouts();
    const optionsHtml = layouts
      .map(l => `<option value="${escapeHtml(l.layout_path)}">${escapeHtml(compactUiLabel(l.label))}</option>`)
      .join("");
    compareSelectAEl.innerHTML = optionsHtml;
    compareSelectBEl.innerHTML = optionsHtml;
    // Default: current layout as A
    if (currentLayoutPath.value) {
      compareSelectAEl.value = currentLayoutPath.value;
      // Default B to a different layout if available
      const other = layouts.find(l => l.layout_path !== currentLayoutPath.value);
      if (other) compareSelectBEl.value = other.layout_path;
    }
  }

  function flyCameraTo(
    x: number,
    y: number,
    z: number,
    durationMs = 900,
  ): void {
    const { AVATAR_EYE_HEIGHT_M, avatarFigure, camera, cameraForwardHorizontal, controls, currentAvatarPosition, currentCameraMode, currentForward, flyAnimation } = getContext();
    // Map and scene-click destinations always resume at pedestrian eye level.
    // Do not retain a tilted overview camera when the avatar arrives.
    const forward = cameraForwardHorizontal();
    currentCameraMode.value = "first_person";
    avatarFigure.visible = false;
    currentForward.value.copy(forward);
    const eye = currentAvatarPosition.value.clone().add(new THREE.Vector3(0, AVATAR_EYE_HEIGHT_M, 0));
    camera.position.copy(eye);
    camera.lookAt(eye.clone().add(forward));
    camera.updateMatrixWorld();
    flyAnimation.value = {
      startAvatarPos: currentAvatarPosition.value.clone(),
      targetAvatarPos: new THREE.Vector3(x, y, z),
      startTime: performance.now(),
      duration: durationMs,
    };
    if (controls.isLocked) {
      controls.unlock();
    }
  }

  return { populateRecentLayoutOptions, scheduleRecentLayoutHydration, populateDesignPresets, selectedDesignPreset, updateDesignStatus, openDesignStageDiagnostic, closeDesignStageDiagnostic, renderDesignStageTree, renderDesignWorkspace, hideDesignWorkspace, reviewLastDesignRun, renderBranchWorkspace, renderBranchRunResults, selectedBranchNodeForAnalysisOverlay, branchNodeHasAnalysisOverlayFeatures, refreshAnalysisOverlayForSelectedBranch, revealAnalysisOverlayForSelectedBranch, populateCompareSelectors, flyCameraTo };
}
