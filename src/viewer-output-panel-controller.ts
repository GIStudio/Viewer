import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeStageTree, renderStageTree as renderG6StageTree, StageNode } from "./g6-visualization";
import { AudioManager, type AudioProfile } from "./audio-manager";
import { createCompareMode } from "./compare-mode";
import type { CompareSceneSetItem } from "./compare-mode";
import type { SceneObjectEditStatusController } from "./viewer-object-edit-status";
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

export type ViewerOutputPanelControllerContext = {
  camera: THREE.PerspectiveCamera;
  cameraDiagnosticColorMode: { value: SurfaceDiagnosticColorMode; };
  cameraForwardHorizontal: () => THREE.Vector3;
  captureMode: boolean;
  clearInfoCard: () => void;
  compareMode: { runComparison: () => Promise<void>; enterCompare3d: (a: ViewerManifest, b: ViewerManifest) => Promise<void>; enterCompareSceneSet: (items: CompareSceneSetItem[], stepLabel?: string) => Promise<boolean>; exitCompare3d: () => void; renderCompare3dFrame: () => boolean; forEachCompareRoot: (callback: (root: THREE.Object3D) => void) => void; refreshLanguage: () => void; isCompare3dActive: () => boolean; };
  consistencyContentEl: HTMLElement;
  currentAvatarPosition: { value: THREE.Vector3; };
  currentLang: { value: ViewerLanguage; };
  currentManifest: { value: ViewerManifest | null; };
  currentRoot: { value: THREE.Object3D | null; };
  currentSceneBounds: { value: SceneBounds | null; };
  flashStatus: (message: string, durationMs?: number) => void;
  floatingLaneSystem: any;
  lastLaserTargetKey: { value: string; };
  objectEditStatusController: SceneObjectEditStatusController;
  recentLayoutSelector: RecentLayoutSelectorController;
  renderProfessionalWorkflowState: () => void;
  root: HTMLElement;
  setStatus: (message: string) => void;
  shell: DesktopShell;
  signal: AbortSignal;
  syncLightingPresetOptions: (language: ViewerLanguage) => void;
  t: (en: string, zh: string) => string;
  updateGenerationDialogContract: () => void;
};

export function createViewerOutputPanelController(getContext: () => ViewerOutputPanelControllerContext) {
  function renderConsistencyPanel(): void {
    const { cameraDiagnosticColorMode, consistencyContentEl, currentManifest, currentRoot, signal, t } = getContext();
    if (!consistencyContentEl) return;
    const summary = currentManifest.value?.summary as Record<string, unknown> | undefined;
    const solverMetrics = (currentManifest.value?.solver_metrics ?? {}) as Record<string, unknown>;
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
      ${renderCameraSurfaceDiagnosticControls(t, Boolean(currentRoot.value && currentManifest.value))}
    `;
    const modeEl = consistencyContentEl.querySelector<HTMLSelectElement>("#viewer-surface-diagnostic-mode");
    if (modeEl) {
      modeEl.value = cameraDiagnosticColorMode.value;
      modeEl.addEventListener("change", () => {
        cameraDiagnosticColorMode.value = modeEl.value === "patch" ? "patch" : "role";
      }, { signal });
    }
    consistencyContentEl
      .querySelector<HTMLButtonElement>("#viewer-export-camera-surface-diagnostic")
      ?.addEventListener("click", () => void exportCurrentCameraSurfaceDiagnostic(), { signal });
  }

  function updateMetricsPanel(): void {
    const { currentManifest } = getContext();
    const metricsHost = document.getElementById("viewer-metrics-dashboard");
    if (!metricsHost) return;
    const summary = currentManifest.value?.summary;
    if (!summary) {
      metricsHost.innerHTML = "";
      return;
    }
    metricsHost.innerHTML = renderMetricsPanel(summary as Record<string, unknown>);
  }

  function exportCurrentPlan(format: "png" | "svg"): void {
    const { cameraForwardHorizontal, currentAvatarPosition, currentManifest, currentSceneBounds, t } = getContext();
    const context = {
      manifest: currentManifest.value,
      bounds: currentSceneBounds.value,
      avatarPosition: currentAvatarPosition.value,
      forward: cameraForwardHorizontal(),
      text: t,
    };
    if (format === "png") {
      exportTopDownMapPng(context);
    } else {
      exportTopDownMapSvg(context);
    }
  }

  async function exportCurrentCameraSurfaceDiagnostic(): Promise<void> {
    const { camera, cameraDiagnosticColorMode, currentManifest, currentRoot, flashStatus, root, setStatus, t } = getContext();
    try {
      setStatus(t("Exporting final GLB surface diagnostic…", "正在导出最终 GLB 表面诊断…"));
      const result = await exportCameraSurfaceDiagnostic({
        root: currentRoot.value,
        camera,
        manifest: currentManifest.value,
        colorMode: cameraDiagnosticColorMode.value,
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

  function localizedViewerHints(): ShellI18nText[] {
    const { captureMode } = getContext();
    return captureMode
      ? [{ key: "viewer.hints.captureMode" }]
      : [
          { key: "viewer.hints.capture" },
          { key: "viewer.hints.move" },
          { key: "viewer.hints.tools" },
        ];
  }

  function updateShellSectionTexts(): void {
    const { currentLang, root } = getContext();
    const tabLabels: Array<[string, string]> = [
      ["settings", "viewer.tab.settings"],
      ["design", "viewer.tab.design"],
      ["evaluate", "professional.pipeline.deliver"],
      ["compare", "viewer.tab.compare"],
    ];
    for (const [tabId, key] of tabLabels) {
      const button = root.querySelector<HTMLButtonElement>(`[data-shell-tab="${tabId}"]`);
      if (button) {
        const translated = translateViewerKey(currentLang.value, key) ?? `[missing ${key}]`;
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
    const { clearInfoCard, compareMode, currentLang, floatingLaneSystem, lastLaserTargetKey, objectEditStatusController, recentLayoutSelector, renderProfessionalWorkflowState, root, shell, syncLightingPresetOptions, updateGenerationDialogContract } = getContext();
    currentLang.value = language;
    root.dataset.viewerLanguage = language;
    applyViewerTranslations(root, language);
    syncLightingPresetOptions(language);
    if (document.getElementById("floating-lane-panel")) floatingLaneSystem.mountControlPanel();
    updateShellSectionTexts();
    updateGenerationDialogContract();
    shell.setHints(localizedViewerHints());
    compareMode.refreshLanguage();
    lastLaserTargetKey.value = "";
    clearInfoCard();
    objectEditStatusController.refreshLanguage();
    recentLayoutSelector.refreshLabels();
    renderProfessionalWorkflowState();
  }

  return { renderConsistencyPanel, updateMetricsPanel, exportCurrentPlan, exportCurrentCameraSurfaceDiagnostic, localizedViewerHints, updateShellSectionTexts, applyLocalLanguage };
}
