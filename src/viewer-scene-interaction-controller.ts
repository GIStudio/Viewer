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

export type ViewerSceneInteractionControllerContext = {
  AVATAR_EYE_HEIGHT_M: 1.62;
  CATEGORY_COLORS: Record<string, number>;
  DEFAULT_WHITE_MASSING_OPACITY: 0.88;
  THIRD_PERSON_DISTANCE_M: 3.6;
  THIRD_PERSON_VERTICAL_OFFSET_M: 1.1;
  applyAudioProfile: () => void;
  assetBboxEnabledBeforeEditing: { value: boolean | null; };
  assetBboxToggleEl: HTMLInputElement;
  assetMoveToggleEl: HTMLInputElement;
  assetPlacementAsset: { value: SceneAssetRef | null; };
  assetPlacementGhost: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
  assetPlacementPointer: THREE.Vector2;
  avatarFigure: THREE.Group<THREE.Object3DEventMap>;
  buildingOpacityInput: HTMLInputElement;
  buildingOpacityOverride: { value: number | null; };
  buildingOpacityValueEl: HTMLElement;
  camera: THREE.PerspectiveCamera;
  canvasHost: HTMLElement;
  captureMode: boolean;
  clearError: (element: HTMLElement) => void;
  commandRegistry: any;
  controls: PointerLockControls;
  crosshairEl: HTMLElement;
  currentAvatarPosition: { value: THREE.Vector3; };
  currentCameraMode: { value: CameraMode; };
  currentForward: { value: THREE.Vector3; };
  currentLang: { value: ViewerLanguage; };
  currentLaserCopyText: { value: string; };
  currentLaserHitPoint: { value: THREE.Vector3 | null; };
  currentLayoutPath: { value: string; };
  currentManifest: { value: ViewerManifest | null; };
  currentRoot: { value: THREE.Object3D | null; };
  currentSceneBounds: { value: SceneBounds | null; };
  currentSpawn: { value: THREE.Vector3; };
  dioramaFinishToggleEl: HTMLInputElement;
  directEditEl: HTMLButtonElement | null;
  editAutosave: any;
  environmentController: ViewerEnvironmentController;
  environmentState: { value: EnvironmentState; };
  errorEl: HTMLElement;
  expandedMapController: any;
  exposureInput: HTMLInputElement;
  exposureValueEl: HTMLElement;
  fillInput: HTMLInputElement;
  fillValueEl: HTMLElement;
  floatingLaneSystem: any;
  frameModeToggleEl: HTMLInputElement;
  graphOverlayMarkers: THREE.Object3D<THREE.Object3DEventMap>[];
  hideDesignWorkspace: () => void;
  hostOptions: ViewerHostOptions;
  infoCardEl: HTMLElement;
  isEditableTarget: (target: EventTarget | null) => boolean;
  isRoamMovementKey: (code: string) => boolean;
  keyInput: HTMLInputElement;
  keyValueEl: HTMLElement;
  laserBeam: THREE.Line<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap>;
  laserHitDot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.Object3DEventMap>;
  laserToggleEl: HTMLInputElement;
  lastLaserTargetKey: { value: string; };
  lastSceneEditUndo: { value: (SceneLayoutEditResponse["undo"] & { layoutPath: string; }) | null; };
  lightingPresetEl: HTMLSelectElement;
  lightingRig: any;
  lightingState: LightingState;
  loader: GLTFLoader;
  minimapPlanCanvas: HTMLCanvasElement;
  moveState: MovementState;
  overlayEl: HTMLElement;
  panelController: ViewerPanelController;
  pointerOutsideViewer: boolean;
  populateRecentLayoutOptions: (layouts: RecentLayout[], selectedPath: string) => void;
  raycaster: THREE.Raycaster;
  recentLayoutSelector: RecentLayoutSelectorController;
  refreshAnalysisOverlayForSelectedBranch: (options?: { flash?: boolean; }) => number;
  renderPipeline: any;
  renderer: THREE.WebGLRenderer;
  root: HTMLElement;
  scene: THREE.Scene;
  sceneAssetDialog: any;
  sceneCommandJsonEl: HTMLTextAreaElement;
  sceneCommandStatusEl: HTMLElement;
  sceneCommandSubmitEl: HTMLButtonElement;
  sceneCommandUndoEl: HTMLButtonElement;
  sceneObjectEditor: any;
  sceneSelectionController: any;
  setError: (element: HTMLElement, message: string) => void;
  setToggleInput: (inputEl: HTMLInputElement, checked: boolean, options?: { emitChange?: boolean; }) => void;
  shadowInput: HTMLInputElement;
  shadowValueEl: HTMLElement;
  shell: DesktopShell;
  signal: AbortSignal;
  statusEl: HTMLElement;
  statusResetHandle: { value: number | null; };
  structuredEvaluationController: { value: AbortController | null; };
  t: (en: string, zh: string) => string;
  thirdPersonToggleEl: HTMLInputElement;
  warmthInput: HTMLInputElement;
  warmthValueEl: HTMLElement;
  workflow: WorkflowController;
  writeTextToClipboard: (text: string) => Promise<void>;
};

export function createViewerSceneInteractionController(getContext: () => ViewerSceneInteractionControllerContext) {
  function setStatus(message: string): void {
    const { shell, statusEl, statusResetHandle } = getContext();
    if (statusResetHandle.value !== null) {
      window.clearTimeout(statusResetHandle.value);
      statusResetHandle.value = null;
    }
    const localizedMessage = localizeTaskMessage(message);
    statusEl.textContent = localizedMessage;
    shell.setStatusSummary(localizedMessage);
    shell.pushActivity(localizedMessage, "neutral");
  }

  function flashStatus(message: string, durationMs = 1800): void {
    const { shell, statusEl, statusResetHandle } = getContext();
    const restoreText = statusEl.textContent || "";
    if (statusResetHandle.value !== null) {
      window.clearTimeout(statusResetHandle.value);
    }
    const localizedMessage = localizeTaskMessage(message);
    statusEl.textContent = localizedMessage;
    shell.setStatusSummary(localizedMessage);
    shell.pushActivity(localizedMessage, "success");
    statusResetHandle.value = window.setTimeout(() => {
      statusEl.textContent = restoreText;
      shell.setStatusSummary(restoreText);
      statusResetHandle.value = null;
    }, durationMs);
  }

  function localizeTaskMessage(message: string): string {
    const { currentLang } = getContext();
    if (currentLang.value !== "zh") return message;
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
    const { errorEl, hideDesignWorkspace, populateRecentLayoutOptions, sceneSelectionController, setError } = getContext();
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
    const { environmentState, lightingRig, lightingState, renderPipeline, renderer, scene } = getContext();
    const effectiveLightingState = deriveEnvironmentLightingState(lightingState, environmentState.value);
    applyViewerLightingState({
      scene,
      renderer,
      rig: lightingRig,
      pipeline: renderPipeline,
      state: effectiveLightingState,
    });
  }

  function syncLightingUi(): void {
    const { crosshairEl, exposureInput, exposureValueEl, fillInput, fillValueEl, keyInput, keyValueEl, laserToggleEl, lightingPresetEl, lightingState, shadowInput, shadowValueEl, warmthInput, warmthValueEl } = getContext();
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
    const { lightingPresetEl, lightingState } = getContext();
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
    const { environmentController } = getContext();
    environmentController.sync(options);
  }

  function clearGraphOverlay(): void {
    const { graphOverlayMarkers, scene } = getContext();
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
    const { CATEGORY_COLORS, camera, currentCameraMode, currentManifest, currentRoot, currentSceneBounds, graphOverlayMarkers, scene } = getContext();
    clearGraphOverlay();
    if (!currentRoot.value || !currentManifest.value) return;

    const instances = currentManifest.value.instances;
    if (!instances) return;

    for (const [instanceId, info] of Object.entries(instances)) {
      const category = String(info.category || "").trim().toLowerCase();
      const color = CATEGORY_COLORS[category] ?? 0x38bdf8;

      // Find the matching node in the scene
      let targetNode: THREE.Object3D | null = null;
      currentRoot.value.traverse((child) => {
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
    currentCameraMode.value = "graph_overlay";
    // Position camera for top-down overview
    if (currentSceneBounds.value) {
      const overviewHeight = currentSceneBounds.value.extent * 2.5;
      camera.position.set(
        currentSceneBounds.value.center.x,
        overviewHeight,
        currentSceneBounds.value.center.z,
      );
      camera.lookAt(currentSceneBounds.value.center.x, 0, currentSceneBounds.value.center.z);
    }
  }

  function resizeRenderer(): void {
    const { camera, canvasHost, expandedMapController, renderPipeline, renderer } = getContext();
    const width = Math.max(1, canvasHost.clientWidth);
    const height = Math.max(1, canvasHost.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderPipeline.setSize(width, height);

    expandedMapController.resize();
  }

  function renderMinimapPlanPreview(): void {
    const { currentAvatarPosition, currentManifest, currentSceneBounds, minimapPlanCanvas, t } = getContext();
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
    if (!currentManifest.value || !currentSceneBounds.value) return;
    const planCanvas = renderPlanMapCanvas({
      manifest: currentManifest.value,
      bounds: currentSceneBounds.value,
      avatarPosition: currentAvatarPosition.value,
      forward: cameraForwardHorizontal(),
      text: t,
      width,
      height,
      showDecorations: false,
    });
    context.drawImage(planCanvas, 0, 0, width, height);
  }

  function cameraForwardHorizontal(): THREE.Vector3 {
    const { camera, currentForward } = getContext();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) {
      return currentForward.value.clone().setY(0).normalize();
    }
    return forward.normalize();
  }

  function updateAvatarTransform(): void {
    const { avatarFigure, currentAvatarPosition, currentCameraMode, currentForward } = getContext();
    avatarFigure.position.copy(currentAvatarPosition.value);
    avatarFigure.visible = currentCameraMode.value === "third_person";
    const forward = cameraForwardHorizontal();
    if (forward.lengthSq() > 1e-6) {
      avatarFigure.rotation.y = Math.atan2(forward.x, forward.z);
      currentForward.value.copy(forward);
    }
  }

  function syncCameraRig(): void {
    const { AVATAR_EYE_HEIGHT_M, THIRD_PERSON_DISTANCE_M, THIRD_PERSON_VERTICAL_OFFSET_M, camera, currentAvatarPosition, currentCameraMode } = getContext();
    updateAvatarTransform();
    const headTarget = currentAvatarPosition.value.clone().add(new THREE.Vector3(0, AVATAR_EYE_HEIGHT_M, 0));
    const forward = cameraForwardHorizontal();
    if (currentCameraMode.value === "third_person") {
      camera.position
        .copy(headTarget)
        .add(new THREE.Vector3(0, THIRD_PERSON_VERTICAL_OFFSET_M, 0))
        .add(forward.multiplyScalar(-THIRD_PERSON_DISTANCE_M));
      return;
    }
    camera.position.copy(headTarget);
  }

  function resetView(): void {
    const { AVATAR_EYE_HEIGHT_M, camera, currentAvatarPosition, currentForward, currentSpawn } = getContext();
    currentAvatarPosition.value.set(
      currentSpawn.value.x,
      Math.max(0, currentSpawn.value.y - AVATAR_EYE_HEIGHT_M),
      currentSpawn.value.z,
    );
    camera.position.copy(currentSpawn.value);
    const target = currentSpawn.value.clone().add(currentForward.value);
    camera.lookAt(target);
    syncCameraRig();
  }

  function frameSceneOverview(): void {
    const { avatarFigure, camera, currentCameraMode, currentSceneBounds } = getContext();
    if (!currentSceneBounds.value) return;
    const extent = Math.max(12, currentSceneBounds.value.extent);
    const center = currentSceneBounds.value.center;
    currentCameraMode.value = "frame";
    avatarFigure.visible = false;
    camera.position.set(
      center.x + extent * 0.72,
      center.y + extent * 0.62,
      center.z + extent * 0.72,
    );
    camera.lookAt(center.x, center.y, center.z);
  }

  function frameSceneFocus(centerXZ: readonly [number, number], requestedExtent: number): void {
    const { avatarFigure, camera, currentCameraMode, currentSceneBounds } = getContext();
    if (centerXZ.length !== 2 || !Number.isFinite(centerXZ[0]) || !Number.isFinite(centerXZ[1])) {
      frameSceneOverview();
      return;
    }
    const extent = Math.max(24, Number.isFinite(requestedExtent) ? requestedExtent : 80);
    const centerY = currentSceneBounds.value?.center.y ?? 0;
    currentCameraMode.value = "frame";
    avatarFigure.visible = false;
    camera.position.set(
      centerXZ[0] + extent * 0.72,
      centerY + extent * 0.58,
      centerXZ[1] + extent * 0.72,
    );
    camera.lookAt(centerXZ[0], centerY, centerXZ[1]);
  }

  function updateOverlay(): void {
    const { overlayEl, panelController, pointerOutsideViewer } = getContext();
    const shouldShow = pointerOutsideViewer && !isRoamMovementActive() && !panelController.isAnyOpen();
    overlayEl.hidden = !shouldShow;
    overlayEl.style.display = shouldShow ? "" : "none";
    overlayEl.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  }

  function clearInfoCard(): void {
    const { currentLaserCopyText, infoCardEl } = getContext();
    infoCardEl.innerHTML = "";
    infoCardEl.hidden = true;
    currentLaserCopyText.value = "";
  }

  function setInfoCardContent(htmlContent: string): void {
    const { currentManifest, infoCardEl } = getContext();
    infoCardEl.innerHTML = htmlContent;
    // Append metrics dashboard after the info card content
    if (currentManifest.value?.summary) {
      const metricsDiv = document.createElement("div");
      metricsDiv.id = "viewer-metrics-dashboard";
      metricsDiv.className = "viewer-metrics-dashboard";
      metricsDiv.innerHTML = renderMetricsPanel(currentManifest.value.summary as Record<string, unknown>);
      infoCardEl.appendChild(metricsDiv);
    }
    infoCardEl.hidden = false;
  }

  function captureSceneViewSnapshot(): SceneViewSnapshot {
    const { camera, currentAvatarPosition, currentCameraMode, sceneObjectEditor } = getContext();
    return {
      cameraPosition: camera.position.clone(),
      cameraQuaternion: camera.quaternion.clone(),
      avatarPosition: currentAvatarPosition.value.clone(),
      cameraMode: currentCameraMode.value,
      editingEnabled: sceneObjectEditor?.isEnabled?.() ?? false,
      editMode: sceneObjectEditor?.getMode?.() ?? "translate",
    };
  }

  function restoreSceneViewSnapshot(snapshot: SceneViewSnapshot): void {
    const { camera, currentAvatarPosition, currentCameraMode, sceneObjectEditor, thirdPersonToggleEl } = getContext();
    currentCameraMode.value = snapshot.cameraMode;
    currentAvatarPosition.value.copy(snapshot.avatarPosition);
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
    const { currentLayoutPath, currentManifest, lastSceneEditUndo, sceneCommandJsonEl, sceneCommandStatusEl, sceneCommandSubmitEl, sceneCommandUndoEl, workflow } = getContext();
    const layoutPath = currentLayoutPath.value || currentManifest.value?.layout_path || "";
    sceneCommandJsonEl.value = sceneCommandEnvelopeTemplate(currentManifest.value, layoutPath);
    sceneCommandSubmitEl.disabled = !layoutPath || !currentManifest.value?.layout_revision || workflow.getSnapshot().editPending;
    sceneCommandUndoEl.disabled = !lastSceneEditUndo.value || workflow.getSnapshot().editPending;
    sceneCommandStatusEl.textContent = currentManifest.value?.layout_revision
      ? `Revision ${currentManifest.value.layout_revision.revision} · ${currentManifest.value.layout_revision.sha256.slice(0, 12)}…`
      : "Load a durable generated layout to edit.";
  }

  async function loadSceneEditRevision(
    result: SceneLayoutEditResponse,
    viewSnapshot: SceneViewSnapshot,
  ): Promise<void> {
    const { hostOptions, recentLayoutSelector, sceneSelectionController, workflow } = getContext();
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
    const { currentManifest, hostOptions, lastSceneEditUndo, sceneCommandStatusEl, signal, structuredEvaluationController, workflow } = getContext();
    const viewSnapshot = captureSceneViewSnapshot();
    workflow.setEditPending(true);
    syncSceneCommandEditor();
    try {
      const result = hostOptions.persistSceneCommands
        ? await hostOptions.persistSceneCommands(commands, { layoutPath })
        : await saveSceneLayoutEdits(layoutPath, base, commands);
      lastSceneEditUndo.value = { ...result.undo, layoutPath: result.revision.layout_path };
      await loadSceneEditRevision(result, viewSnapshot);
      window.dispatchEvent(new CustomEvent("roadgen3d:scenario-revision-saved", {
        detail: { revision: result.revision.revision, layoutPath: result.revision.layout_path },
      }));
      sceneCommandStatusEl.textContent = `Saved immutable revision ${result.revision.revision}.`;
      if (!hostOptions.embedded && !hostOptions.persistSceneCommands) {
        const savedRevision = result.revision.revision;
        structuredEvaluationController.value?.abort();
        structuredEvaluationController.value = new AbortController();
        const evaluationController = structuredEvaluationController.value;
        window.dispatchEvent(new CustomEvent("roadgen3d:structured-evaluation", { detail: { status: "running", revision: savedRevision } }));
        void postApiJson<Record<string, unknown>>("/api/design/evaluate/unified", {
          layout_path: result.revision.layout_path,
          evaluation_mode: "structured",
        }).then((evaluation) => {
          if (evaluationController.signal.aborted || currentManifest.value?.layout_revision?.revision !== savedRevision) return;
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
    const { currentLayoutPath, currentManifest } = getContext();
    const revision = currentManifest.value?.layout_revision;
    const layoutPath = currentLayoutPath.value || currentManifest.value?.layout_path || "";
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
    const { lastSceneEditUndo } = getContext();
    const pending = lastSceneEditUndo.value;
    if (!pending) {
      flashStatus("No persisted scene edit to undo.");
      return;
    }
    lastSceneEditUndo.value = null;
    try {
      await saveFocusedSceneCommands(pending.layoutPath, pending.base, pending.commands);
      flashStatus("Scene edit undone. Press Cmd/Ctrl+Z again to redo.");
    } catch (error) {
      lastSceneEditUndo.value = pending;
      syncSceneCommandEditor();
      flashStatus(error instanceof Error ? error.message : "Scene edit undo failed.");
    }
  }

  async function submitSceneCommandEditor(): Promise<void> {
    const { currentLayoutPath, currentManifest, sceneCommandJsonEl, sceneCommandStatusEl, workflow } = getContext();
    if (!currentManifest.value) {
      sceneCommandStatusEl.textContent = "Load a durable generated layout before editing.";
      return;
    }
    try {
      const envelope = parseSceneCommandEnvelope(
        sceneCommandJsonEl.value,
        currentManifest.value,
        currentLayoutPath.value || currentManifest.value.layout_path || "",
      );
      await saveFocusedSceneCommands(envelope.layout_path, envelope.base, envelope.commands);
      flashStatus("JSON move command persisted.");
    } catch (error) {
      sceneCommandStatusEl.textContent = error instanceof Error ? error.message : "Command failed.";
      workflow.reportError(error);
    }
  }

  function setObjectEditingEnabled(enabled: boolean, options: { announce?: boolean } = {}): void {
    const { assetBboxEnabledBeforeEditing, assetBboxToggleEl, assetMoveToggleEl, crosshairEl, currentLang, currentLaserHitPoint, currentManifest, currentRoot, directEditEl, laserBeam, laserHitDot, laserToggleEl, lastLaserTargetKey, renderer, scene, sceneObjectEditor, setToggleInput } = getContext();
    const announce = options.announce ?? true;
    if (enabled) {
      if (!sceneObjectEditor.isEnabled()) {
        assetBboxEnabledBeforeEditing.value = assetBboxToggleEl.checked;
      }
      sceneObjectEditor.setEnabled(true);
      directEditEl?.setAttribute("aria-pressed", "true");
      if (directEditEl) directEditEl.textContent = currentLang.value === "zh" ? "退出编辑" : "Exit edit";
      setToggleInput(assetMoveToggleEl, true);
      setToggleInput(assetBboxToggleEl, true);
      createAssetBboxHelpers(scene, currentRoot.value, currentManifest.value, { showLabels: true });
      if (laserToggleEl.checked) {
        setToggleInput(laserToggleEl, false);
        crosshairEl.hidden = true;
        laserBeam.visible = false;
        laserHitDot.visible = false;
        currentLaserHitPoint.value = null;
        lastLaserTargetKey.value = "";
      }
      resetMoveState();
      updateOverlay();
      if (announce) flashStatus(currentLang.value === "zh" ? "地物编辑已开启；选择树木或街具进行编辑。" : "Object editing enabled. Select a tree or street object.");
      return;
    }

    const wasEnabled = sceneObjectEditor.isEnabled();
    sceneObjectEditor.exit();
    directEditEl?.setAttribute("aria-pressed", "false");
    if (directEditEl) directEditEl.textContent = currentLang.value === "zh" ? "编辑地物" : "Edit objects";
    setToggleInput(assetMoveToggleEl, false);
    if (assetBboxEnabledBeforeEditing.value !== null) {
      setToggleInput(assetBboxToggleEl, assetBboxEnabledBeforeEditing.value);
      if (assetBboxEnabledBeforeEditing.value) createAssetBboxHelpers(scene, currentRoot.value, currentManifest.value, { showLabels: false });
      else removeAssetBboxHelpers(scene);
    }
    assetBboxEnabledBeforeEditing.value = null;
    resetMoveState();
    renderer.domElement.focus();
    updateOverlay();
    if (announce && wasEnabled) {
      flashStatus(currentLang.value === "zh" ? "已退出地物编辑；点击场景即可恢复漫游。" : "Object editing exited. Click the scene to resume roaming.");
    }
  }

  function surfaceRoleForObject(object: THREE.Object3D): string {
    const { currentManifest } = getContext();
    const roles = currentManifest.value?.surface_diagnostic?.node_roles ?? {};
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
    const { camera, currentRoot, raycaster } = getContext();
    if (!currentRoot.value) return null;
    if (pointer) {
      raycaster.setFromCamera(pointer, camera);
    } else {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      raycaster.set(camera.position, direction.normalize());
    }
    raycaster.far = 220;
    const hit = raycaster.intersectObject(currentRoot.value, true).find((candidate) => !candidate.object.userData?.viewerHelper);
    if (!hit) return null;
    const role = surfaceRoleForObject(hit.object);
    const allowed = String(asset?.category ?? "").toLowerCase() === "tree"
      ? new Set(["planting", "furnishing", "frontage"])
      : new Set(["sidewalk", "furnishing", "frontage"]);
    return { point: hit.point.clone(), valid: allowed.has(role), role };
  }

  function cancelAssetPlacement(announce = true): void {
    const { assetPlacementAsset, assetPlacementGhost, crosshairEl, laserToggleEl, root } = getContext();
    const wasActive = Boolean(assetPlacementAsset.value);
    assetPlacementAsset.value = null;
    assetPlacementGhost.visible = false;
    delete root.dataset.assetPlacementActive;
    crosshairEl.hidden = !laserToggleEl.checked;
    if (announce && wasActive) flashStatus("已退出资产放置画笔。");
  }

  function startAssetPlacement(asset: SceneAssetRef): void {
    const { assetPlacementAsset, crosshairEl, renderer, root } = getContext();
    setObjectEditingEnabled(false, { announce: false });
    assetPlacementAsset.value = asset;
    root.dataset.assetPlacementActive = "true";
    crosshairEl.hidden = false;
    updateAssetPlacementPreview();
    renderer.domElement.focus();
    flashStatus(`放置 ${asset.label}：点击承载面落点；拖动视角请先按 Esc 退出放置。`);
  }

  function updateAssetPlacementPreview(): void {
    const { assetPlacementAsset, assetPlacementGhost, assetPlacementPointer } = getContext();
    if (!assetPlacementAsset.value) {
      assetPlacementGhost.visible = false;
      return;
    }
    const placement = assetPlacementPoint(
      assetPlacementAsset.value,
      isPointerLookActive() ? null : assetPlacementPointer,
    );
    assetPlacementGhost.visible = Boolean(placement);
    if (!placement) return;
    assetPlacementGhost.position.copy(placement.point);
    (assetPlacementGhost.material as THREE.MeshBasicMaterial).color.set(placement.valid ? 0x41a86d : 0xdf654f);
  }

  function placeAssetAtCurrentTarget(): void {
    const { assetPlacementAsset, assetPlacementPointer, editAutosave } = getContext();
    const asset = assetPlacementAsset.value;
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

  async function copyCurrentLaserTargetDetails(): Promise<void> {
    const { currentLaserCopyText, laserToggleEl, sceneObjectEditor, writeTextToClipboard } = getContext();
    if (!laserToggleEl.checked && !sceneObjectEditor.isEnabled()) {
      flashStatus("Laser pointer and asset move mode are off.");
      return;
    }
    const text = currentLaserCopyText.value.trim();
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
    const { assetPlacementAsset, commandRegistry, controls, currentLang, currentManifest, expandedMapController, floatingLaneSystem, isEditableTarget, isRoamMovementKey, laserToggleEl, lastSceneEditUndo, moveState, panelController, sceneAssetDialog, sceneObjectEditor } = getContext();
    if (active && event.code === "Escape" && sceneAssetDialog.isOpen()) {
      event.preventDefault();
      sceneAssetDialog.close();
      return;
    }
    if (active && event.code === "Escape" && assetPlacementAsset.value) {
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
      && lastSceneEditUndo.value
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
          flashStatus(currentLang.value === "zh" ? "已取消本次变换；再次按 Esc 取消选择。" : "Transform cancelled. Press Esc again to clear the selection.");
        } else {
          flashStatus(currentLang.value === "zh" ? "已取消选择；再次按 Esc 退出地物编辑。" : "Selection cleared. Press Esc again to exit object editing.");
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
          const bands = currentManifest.value?.layout_overlay?.bands ?? [];
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
    const { moveState } = getContext();
    moveState.forward = false;
    moveState.backward = false;
    moveState.left = false;
    moveState.right = false;
    moveState.lookLeft = false;
    moveState.lookRight = false;
    moveState.sprint = false;
  }

  function isKeyboardRoamActive(): boolean {
    const { currentCameraMode, panelController, sceneObjectEditor } = getContext();
    return (currentCameraMode.value === "first_person" || currentCameraMode.value === "third_person")
      && !sceneObjectEditor.isEnabled()
      && !panelController.isAnyOpen()
      && document.visibilityState === "visible"
      && document.hasFocus();
  }

  function isPointerLookActive(): boolean {
    const { controls, renderer } = getContext();
    return controls.isLocked || document.pointerLockElement === renderer.domElement;
  }

  function isRoamMovementActive(): boolean {
    return isPointerLookActive() || isKeyboardRoamActive();
  }

  function configureSceneObjectShadows(rootObject: THREE.Object3D): void {
    const { DEFAULT_WHITE_MASSING_OPACITY } = getContext();
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
      if (isTransparentMassing) {
        materials.forEach((material) => {
          if (!material || material.name !== "roadgen3d_transparent_massing") return;
          material.opacity = DEFAULT_WHITE_MASSING_OPACITY;
          material.transparent = true;
          material.depthWrite = false;
          material.needsUpdate = true;
        });
      }
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
        outline.userData.roadgenMassingOutline = true;
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
    rootObject.traverse((child) => {
      if (child.userData.roadgenMassingOutline) {
        child.visible = nextOpacity < 0.999;
      }
    });
  }

  function authoredBuildingOpacity(rootObject: THREE.Object3D, manifest: ViewerManifest | null): number {
    const material = buildingMaterials(rootObject, manifest)[0];
    return material ? THREE.MathUtils.clamp(material.opacity, 0.1, 1) : 1;
  }

  function syncBuildingOpacityUi(): void {
    const { buildingOpacityInput, buildingOpacityOverride, buildingOpacityValueEl, currentManifest, currentRoot } = getContext();
    const value = buildingOpacityOverride.value ?? (currentRoot.value ? authoredBuildingOpacity(currentRoot.value, currentManifest.value) : 1);
    buildingOpacityInput.value = value.toFixed(2);
    buildingOpacityValueEl.textContent = `${Math.round(value * 100)}%`;
  }

  function updateLaserPointer(): void {
    const { camera, currentLang, currentLaserCopyText, currentLaserHitPoint, currentManifest, currentRoot, floatingLaneSystem, laserBeam, laserHitDot, laserToggleEl, lastLaserTargetKey, raycaster, scene } = getContext();
    if (!laserToggleEl.checked || !currentRoot.value) {
      laserBeam.visible = false;
      laserHitDot.visible = false;
      currentLaserHitPoint.value = null;
      lastLaserTargetKey.value = "";
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
      .intersectObjects([currentRoot.value, ...floatingLaneTargets], true)
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
      currentLaserHitPoint.value = null;
      lastLaserTargetKey.value = "";
      clearInfoCard();
      return;
    }

    currentLaserHitPoint.value = hit.point.clone();
    laserHitDot.visible = true;
    laserHitDot.position.copy(hit.point);

    // Check if clicked on a floating lane diagnostic overlay.
    if (hit.object.userData.isFloatingLane) {
      const overlayInstanceId = typeof hit.object.userData.instanceId === "string" ? hit.object.userData.instanceId : "";
      if (overlayInstanceId) {
        const targetKey = `floating-instance:${overlayInstanceId}`;
        if (lastLaserTargetKey.value !== targetKey) {
          floatingLaneSystem.selectInstance(overlayInstanceId);
          setInfoCardContent(`<div class="hit-descriptor"><strong>${overlayInstanceId}</strong><br>Floating Lane orientation selected</div>`);
          lastLaserTargetKey.value = targetKey;
        }
        return;
      }
      if (typeof hit.object.userData.bandIndex === "number") {
        const targetKey = `floating-band:${hit.object.userData.bandIndex}`;
        if (lastLaserTargetKey.value === targetKey) return;
        floatingLaneSystem.selectLane(hit.object.userData.bandIndex);
        const bandKind = hit.object.userData.bandKind || "unknown";
        const bandLabel = floatingLaneSystem.getLaneLabel(bandKind);
        setInfoCardContent(`<div class="hit-descriptor"><strong>${bandLabel}</strong><br>Click again to deselect</div>`);
        lastLaserTargetKey.value = targetKey;
        return;
      }
    }

    const targetKey = `scene:${hit.object.uuid}`;
    if (lastLaserTargetKey.value === targetKey) return;
    const descriptor = resolveHitDescriptor(hit.object, hit.point.clone(), currentManifest.value ?? undefined, currentLang.value);
    if (!descriptor) {
      lastLaserTargetKey.value = "";
      clearInfoCard();
      return;
    }
    const content = buildHitDescriptorContent(descriptor, currentManifest.value ?? undefined, currentLang.value);
    currentLaserCopyText.value = content.text;
    setInfoCardContent(content.html);
    lastLaserTargetKey.value = targetKey;
  }

  async function loadScene(option: SceneOption): Promise<void> {
    const { applyAudioProfile, assetBboxToggleEl, buildingOpacityOverride, captureMode, clearError, controls, currentForward, currentLaserHitPoint, currentManifest, currentRoot, currentSceneBounds, currentSpawn, dioramaFinishToggleEl, environmentController, errorEl, expandedMapController, frameModeToggleEl, laserBeam, laserHitDot, lightingRig, lightingState, loader, refreshAnalysisOverlayForSelectedBranch, scene, sceneObjectEditor } = getContext();
    const loadStart = performance.now();
    clearError(errorEl);
    setStatus(`Loading ${option.label}…`);
    setObjectEditingEnabled(false, { announce: false });
    if (controls.isLocked) {
      controls.unlock();
    }

    if (currentRoot.value) {
      scene.remove(currentRoot.value);
      disposeObject(currentRoot.value);
      currentRoot.value = null;
    }
    currentSceneBounds.value = null;
    renderMinimapPlanPreview();
    removeAnalysisOverlayHelpers(scene);
    removeFrameAndAssetHelpers(scene);

    applyAudioProfile();

    clearInfoCard();
    currentLaserHitPoint.value = null;
    laserHitDot.visible = false;
    laserBeam.visible = false;

    const gltfLoadStart = performance.now();
    const gltf = await loader.loadAsync(option.glbUrl);
    const gltfLoadMs = (performance.now() - gltfLoadStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.glTF (${option.label}): ${gltfLoadMs} ms`);

    currentRoot.value = gltf.scene;
    prepareEnvironmentSkyDomes(currentRoot.value);
    const shadowStart = performance.now();
    configureSceneObjectShadows(currentRoot.value);
    if (buildingOpacityOverride.value !== null) {
      applyBuildingOpacity(currentRoot.value, currentManifest.value, buildingOpacityOverride.value);
    }
    syncBuildingOpacityUi();
    const shadowMs = (performance.now() - shadowStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.shadows (${option.label}): ${shadowMs} ms`);
    if (dioramaFinishToggleEl.checked) {
      applyAnalyticalDioramaFinish(currentRoot.value, currentManifest.value ?? undefined);
    }
    scene.add(currentRoot.value);

    const auxStart = performance.now();
    if (!captureMode && frameModeToggleEl.checked && currentRoot.value) {
      createFrameHelpers(scene, currentRoot.value);
    }

    if (!captureMode && assetBboxToggleEl.checked && currentRoot.value) {
      createAssetBboxHelpers(scene, currentRoot.value, currentManifest.value, { showLabels: sceneObjectEditor.isEnabled() });
    }
    if (!captureMode) {
      refreshAnalysisOverlayForSelectedBranch();
    }
    const auxMs = (performance.now() - auxStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.aux (${option.label}): ${auxMs} ms`);

    const boundsStart = performance.now();
    const bbox = sceneContentBounds(currentRoot.value);
    const validatedSize = new THREE.Vector3();
    bbox.getSize(validatedSize);
    if (
      bbox.isEmpty()
      || ![validatedSize.x, validatedSize.y, validatedSize.z].every(Number.isFinite)
      || Math.max(validatedSize.x, validatedSize.z) < 0.5
    ) {
      scene.remove(currentRoot.value);
      disposeObject(currentRoot.value);
      currentRoot.value = null;
      currentSceneBounds.value = null;
      renderMinimapPlanPreview();
      throw new Error("The scene contains no usable road geometry or has invalid bounds.");
    }
    const spawnCenter = new THREE.Vector3();
    bbox.getCenter(spawnCenter);
    const spawn = inferSpawnFromBbox({ center: spawnCenter }, currentManifest.value ?? {
      layout_path: "",
      final_scene: { label: "Final Scene", glb_url: option.glbUrl },
      production_steps: [],
      default_selection: "final_scene",
    });
    currentSpawn.value = spawn.position;
    currentForward.value = spawn.forward;
    currentSceneBounds.value = sceneBoundsFromManifest(bbox, currentManifest.value);
    renderMinimapPlanPreview();
    const boundsMs = (performance.now() - boundsStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.bounds (${option.label}): ${boundsMs} ms`);
    fitViewerLightingRigToBounds(lightingRig, bbox);
    expandedMapController.render();
    resetView();
    const params = currentManifest.value?.lighting_params as Partial<LightingState> | undefined;
    const presetKey = currentManifest.value?.lighting_preset;
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
    const summaryEnvironment = currentManifest.value?.summary?.environment_system as Record<string, unknown> | undefined;
    environmentController.resetFromManifest(
      currentManifest.value?.environment_state
      ?? summaryEnvironment?.environment_state,
    );
    syncLightingUi();
    setStatus(`Viewing ${option.label}`);
    console.info(`[viewer-timing] loadScene.total (${option.label}): ${(performance.now() - loadStart).toFixed(1)} ms`);
  }

  return { setStatus, flashStatus, localizeTaskMessage, isMissingSceneLayoutError, loadBranchLayoutSelection, applyLightingState, syncLightingUi, syncLightingPresetOptions, syncEnvironmentUi, clearGraphOverlay, buildGraphOverlay, resizeRenderer, renderMinimapPlanPreview, cameraForwardHorizontal, updateAvatarTransform, syncCameraRig, resetView, frameSceneOverview, frameSceneFocus, updateOverlay, clearInfoCard, setInfoCardContent, captureSceneViewSnapshot, restoreSceneViewSnapshot, syncSceneCommandEditor, loadSceneEditRevision, saveFocusedSceneCommands, persistCurrentSceneCommands, undoLastSceneEdit, submitSceneCommandEditor, setObjectEditingEnabled, surfaceRoleForObject, assetPlacementPoint, cancelAssetPlacement, startAssetPlacement, updateAssetPlacementPreview, placeAssetAtCurrentTarget, copyCurrentLaserTargetDetails, handleKey, resetMoveState, isKeyboardRoamActive, isPointerLookActive, isRoamMovementActive, configureSceneObjectShadows, isBuildingMesh, buildingMaterials, applyBuildingOpacity, authoredBuildingOpacity, syncBuildingOpacityUi, updateLaserPointer, loadScene };
}
