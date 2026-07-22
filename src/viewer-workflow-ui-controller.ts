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
import type { ViewerGenerationWizardController } from "./viewer-generation-wizard";
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

export type ViewerWorkflowUiControllerContext = {
  activeSceneOrigin: { value: ActiveSceneOrigin | null; };
  activeStarterScene: { value: StarterScenePackage | null; };
  assetPolicyInputs: HTMLInputElement[];
  currentGenerationSpecBuild: () => ReturnType<typeof buildGenerationRequestSpec>;
  currentLang: { value: ViewerLanguage; };
  currentManifest: { value: ViewerManifest | null; };
  designGenerateEl: HTMLButtonElement;
  designTemplateEl: HTMLInputElement;
  emptyStateEl: HTMLElement | null;
  evaluateGateEl: HTMLElement;
  evaluateRunEl: HTMLButtonElement;
  evaluateUsedAssetsEl: HTMLElement | null;
  generationCandidateListEl: HTMLElement | null;
  generationCandidateSummaryEl: HTMLElement | null;
  generationDialogEl: HTMLElement;
  generationReadinessEl: HTMLElement | null;
  generationRunEl: HTMLButtonElement;
  generationSourceCountsEl: HTMLElement | null;
  generationSourceKindEl: HTMLElement | null;
  generationSourceRevisionEl: HTMLElement | null;
  generationSourceSummaryEl: HTMLElement;
  generationSourceWarningsEl: HTMLElement | null;
  generationStrategyModeEl: HTMLElement | null;
  generationStrategySummaryEl: HTMLElement;
  generationWizard: ViewerGenerationWizardController | null;
  hostOptions: ViewerHostOptions;
  parameterDesignController: ViewerParameterDesignController | null;
  renderCapabilityStatus: () => void;
  renderGenerationOutputSummary: (spec: GenerationRequestSpec, issues: readonly string[]) => void;
  reviewAcceptEl: HTMLButtonElement | null;
  reviewAnnotationEl: HTMLButtonElement | null;
  reviewChangesEl: HTMLButtonElement | null;
  reviewRootEl: HTMLElement | null;
  reviewStateEl: HTMLElement | null;
  reviewUsedAssetsEl: HTMLElement | null;
  starterDemoBannerEl: HTMLElement | null;
  starterDemoBannerDismissed: { value: boolean; };
  starterLoadError: { value: string; };
  starterLoading: { value: boolean; };
  starterReviewGuideEl: HTMLElement | null;
  viewerShellEl: HTMLElement | null;
  workflow: WorkflowController;
};

export function createViewerWorkflowUiController(getContext: () => ViewerWorkflowUiControllerContext) {
  const renderCandidateRepository = (): void => {
    const { generationCandidateListEl, generationCandidateSummaryEl, workflow } = getContext();
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
    const { currentManifest, evaluateUsedAssetsEl, reviewUsedAssetsEl } = getContext();
    const summary = (currentManifest.value?.summary ?? {}) as Record<string, unknown>;
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
    const { assetPolicyInputs, currentGenerationSpecBuild, currentLang, designGenerateEl, designTemplateEl, generationDialogEl, generationReadinessEl, generationSourceCountsEl, generationSourceKindEl, generationSourceRevisionEl, generationSourceSummaryEl, generationSourceWarningsEl, generationStrategyModeEl, generationStrategySummaryEl, generationWizard, parameterDesignController, renderGenerationOutputSummary, workflow } = getContext();
    const snapshot = workflow.getSnapshot();
    const hasApprovedSource = Boolean(
      snapshot.normalized
      && snapshot.approvedSourceRevision === snapshot.sourceRevision,
    );
    generationSourceSummaryEl.textContent = hasApprovedSource
      ? translateViewerKey(currentLang.value, "viewer.generationDialog.sourceApproved")
      : snapshot.normalized
        ? translateViewerKey(currentLang.value, "viewer.generationDialog.sourceAwaitingApproval")
        : translateViewerKey(currentLang.value, "viewer.generationDialog.sourceMissing");
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
      ...(!sourceReady ? [spec.sourceMode === "reference_annotation" ? translateViewerKey(currentLang.value, "viewer.generationDialog.approvalRequired") : "请选择明确的 Graph Template ID"] : []),
      ...issues,
    ].filter(Boolean).join(" · ");
    designGenerateEl.title = generationReady ? "" : missing;
    if (generationReadinessEl) {
      generationReadinessEl.dataset.tone = generationReady ? "ready" : "warning";
      generationReadinessEl.textContent = generationReady
        ? (translateViewerKey(currentLang.value, "professional.assets.generationReady") ?? "Ready to generate.")
        : (missing || translateViewerKey(currentLang.value, "professional.assets.policyRequired") || "Choose an asset strategy.");
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
    const { activeSceneOrigin, activeStarterScene, currentLang, emptyStateEl, evaluateGateEl, evaluateRunEl, generationRunEl, hostOptions, parameterDesignController, renderCapabilityStatus, reviewAcceptEl, reviewAnnotationEl, reviewChangesEl, reviewRootEl, reviewStateEl, starterDemoBannerEl, starterDemoBannerDismissed, starterLoadError, starterLoading, starterReviewGuideEl, viewerShellEl, workflow } = getContext();
    renderCapabilityStatus();
    updateGenerationDialogContract();
    renderUsedAssetProvenance();
    parameterDesignController?.refreshSource();
    const snapshot = workflow.getSnapshot();
    const hasWorkflowScene = Boolean(snapshot.sceneLayoutPath);
    const hasCurrentWorkflowScene = hasWorkflowScene
      && snapshot.sceneSourceRevision === snapshot.sourceRevision;
    const hasScene = hasWorkflowScene || activeSceneOrigin.value === "starter_demo";
    const baseline = snapshot.baselineRun;
    const baselineBusy = baseline.sourceRevision === snapshot.sourceRevision
      && (baseline.status === "queued" || baseline.status === "running");
    generationRunEl.disabled = baselineBusy;
    generationRunEl.title = baselineBusy
      ? (currentLang.value === "zh" ? "道路基线运行期间请先等待，或取消后再配置设计版本。" : "Wait for the road baseline, or cancel it before configuring a design version.")
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
        if (starterLoading.value) {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card" data-tone="running">
              <span class="viewer-empty-kicker">BUILT-IN DEMO · GUANGZHOU</span>
              <h2>${currentLang.value === "zh" ? "正在载入广州完整十字路口" : "Loading the complete Guangzhou intersection"}</h2>
              <p>${currentLang.value === "zh" ? "读取内置 OSM、透明建筑白模与代表性街道设施，不会请求 Overpass。" : "Reading bundled OSM, transparent building massing, and representative street assets without requesting Overpass."}</p>
            </div>`;
        } else if (starterLoadError.value && !approved) {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card" data-tone="error">
              <span class="viewer-empty-kicker">STARTER DEMO FAILED</span>
              <h2>${currentLang.value === "zh" ? "默认道路骨架载入失败" : "The starter road skeleton could not be loaded"}</h2>
              <p>${escapeHtml(starterLoadError.value)}</p>
              <div class="viewer-empty-actions"><button type="button" data-starter-action="retry">${currentLang.value === "zh" ? "重新载入示例" : "Reload demo"}</button><button type="button" data-starter-action="source">${currentLang.value === "zh" ? "选择自己的 OSM" : "Choose my own OSM"}</button></div>
            </div>`;
        } else if (baselineBusy) {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card" data-tone="running">
              <span class="viewer-empty-kicker">AUTO BASELINE · SOURCE REV ${baseline.sourceRevision}</span>
              <h2>${currentLang.value === "zh" ? "正在生成无家具道路基线" : "Generating the furniture-free road baseline"}</h2>
              <p>${escapeHtml(baseline.message || (currentLang.value === "zh" ? "正在建立道路、铺装与透明建筑白模。" : "Building roads, paving and transparent building massing."))}</p>
              <div class="viewer-empty-progress"><i style="width:${Math.max(0, Math.min(100, baseline.progress))}%"></i></div>
              <div class="viewer-empty-meta"><strong>${Math.round(baseline.progress)}%</strong><span>${escapeHtml(baseline.stage || baseline.status)}</span></div>
              ${recentOperations ? `<ol>${recentOperations}</ol>` : ""}
              <div class="viewer-empty-actions"><button type="button" data-baseline-action="cancel">${currentLang.value === "zh" ? "取消基线" : "Cancel baseline"}</button></div>
            </div>`;
        } else if (baseline.status === "failed") {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card" data-tone="error">
              <span class="viewer-empty-kicker">BASELINE FAILED · ${escapeHtml(baseline.stage || "failed")}</span>
              <h2>${currentLang.value === "zh" ? "道路基线生成失败" : "Road baseline generation failed"}</h2>
              <p>${escapeHtml(baseline.error || baseline.message || "Unknown generation error")}</p>
              <div class="viewer-empty-actions"><button type="button" data-baseline-action="retry">${currentLang.value === "zh" ? "重试生成" : "Retry"}</button><button type="button" data-baseline-action="source">${currentLang.value === "zh" ? "返回 01A" : "Back to 01A"}</button></div>
            </div>`;
        } else {
          emptyStateEl.innerHTML = `
            <div class="viewer-empty-card">
              <span class="viewer-empty-kicker">${approved ? "BASELINE READY" : "01A · REFERENCE ANNOTATION"}</span>
              <h2>${approved ? (currentLang.value === "zh" ? "已批准标注，等待生成道路基线" : "Approved annotation is ready for a road baseline") : (currentLang.value === "zh" ? "尚无可审核的 3D 场景" : "No reviewable 3D scene yet")}</h2>
              <p>${approved ? (currentLang.value === "zh" ? "基线只包含道路、铺装和透明建筑白模，不添加任何街道家具。" : "The baseline contains roads, paving and transparent massing, without street furniture.") : (currentLang.value === "zh" ? "前往 01A 获取 OSM、选择道路并批准完整标注。" : "Open 01A, acquire OSM, select the road and approve the full annotation.")}</p>
              <div class="viewer-empty-actions">${approved ? `<button type="button" data-baseline-action="retry">${currentLang.value === "zh" ? "生成道路基线" : "Generate road baseline"}</button>` : ""}<button type="button" data-baseline-action="source">${currentLang.value === "zh" ? "前往 01A" : "Open 01A"}</button></div>
            </div>`;
        }
      }
    }
    if (starterDemoBannerEl) {
      starterDemoBannerEl.hidden = activeSceneOrigin.value !== "starter_demo" || starterDemoBannerDismissed.value;
      const label = starterDemoBannerEl.querySelector<HTMLElement>("[data-starter-demo-label]");
      const summary = starterDemoBannerEl.querySelector<HTMLElement>("[data-starter-demo-summary]");
      const close = starterDemoBannerEl.querySelector<HTMLButtonElement>("[data-starter-action=\"dismiss\"]");
      if (close) {
        const closeLabel = currentLang.value === "zh" ? "关闭内置示例提示" : "Close built-in demo notice";
        close.setAttribute("aria-label", closeLabel);
        close.title = closeLabel;
      }
      if (label && activeStarterScene.value) label.textContent = `${currentLang.value === "zh" ? "内置示例" : "Built-in demo"} · ${activeStarterScene.value.label}`;
      if (summary && activeStarterScene.value) {
        const counts = activeStarterScene.value.category_counts;
        summary.textContent = currentLang.value === "zh"
          ? `真实 OSM 十字路口 · ${counts.building ?? 0} 个透明建筑白模 · ${Object.values(counts).reduce((sum, count) => sum + count, 0) - (counts.building ?? 0)} 个代表性街道设施`
          : `Real OSM intersection · ${counts.building ?? 0} transparent buildings · ${Object.values(counts).reduce((sum, count) => sum + count, 0) - (counts.building ?? 0)} representative street assets`;
      }
    }
    const starterPreview = activeSceneOrigin.value === "starter_demo";
    if (reviewRootEl) reviewRootEl.dataset.mode = starterPreview ? "starter" : "workflow";
    if (starterReviewGuideEl) starterReviewGuideEl.hidden = !starterPreview;
    if (reviewStateEl) {
      const strong = reviewStateEl.querySelector<HTMLElement>("strong");
      const detail = reviewStateEl.querySelector<HTMLElement>("span");
      const revision = snapshot.sceneRevision ? ` · rev ${snapshot.sceneRevision.revision}` : "";
      if (starterPreview) {
        reviewStateEl.dataset.tone = "ready";
        if (strong) strong.textContent = currentLang.value === "zh" ? "正在查看内置完整十字路口" : "Viewing the complete built-in intersection";
        if (detail) detail.textContent = currentLang.value === "zh" ? "这是只读产品示例；下方说明如何生成你自己的 03 结果。" : "This is a read-only product example; follow the guide below to create your own 03 result.";
      } else if (hasWorkflowScene && !hasCurrentWorkflowScene) {
        reviewStateEl.dataset.tone = "warning";
        if (strong) strong.textContent = currentLang.value === "zh" ? "当前 3D 场景来自较早的标注版本" : "The available 3D scene is based on an earlier annotation";
        if (detail) detail.textContent = currentLang.value === "zh"
          ? "可继续浏览该场景；请先生成当前标注版本的 3D 场景，再审核或评价。"
          : "You can continue browsing it, but generate the current annotation revision before review or evaluation.";
      } else if (snapshot.sceneReviewStatus === "accepted") {
        reviewStateEl.dataset.tone = "ready";
        if (strong) strong.textContent = translateViewerKey(currentLang.value, "professional.review.accepted") ?? "Result accepted";
        if (detail) detail.textContent = `${translateViewerKey(currentLang.value, "professional.review.acceptedHint") ?? "Evaluation and delivery are now available."}${revision}`;
      } else if (snapshot.sceneReviewStatus === "changes_requested") {
        reviewStateEl.dataset.tone = "warning";
        if (strong) strong.textContent = translateViewerKey(currentLang.value, "professional.review.changesRequested") ?? "Changes requested";
        if (detail) detail.textContent = `${translateViewerKey(currentLang.value, "professional.review.changesRequestedHint") ?? "Save an edited revision, then review it again."}${revision}`;
      } else if (snapshot.sceneReviewStatus === "pending") {
        reviewStateEl.dataset.tone = "warning";
        if (strong) strong.textContent = translateViewerKey(currentLang.value, "professional.review.pending") ?? "Generated result awaiting review";
        if (detail) detail.textContent = `${translateViewerKey(currentLang.value, "professional.review.pendingHint") ?? "Inspect the 3D result before evaluation."}${revision}`;
      } else {
        reviewStateEl.dataset.tone = "empty";
        if (strong) strong.textContent = translateViewerKey(currentLang.value, "professional.review.noScene") ?? "No generated scene is available.";
        if (detail) detail.textContent = translateViewerKey(currentLang.value, "professional.review.noSceneHint") ?? "Complete scene generation first.";
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
        : (translateViewerKey(currentLang.value, "professional.pipeline.reviewRequired") ?? "Accept the generated result before evaluation.");
      const gateTitle = evaluateGateEl.querySelector<HTMLElement>("[data-evaluate-gate-title]");
      const gateDetail = evaluateGateEl.querySelector<HTMLElement>("[data-evaluate-gate-detail]");
      const gateAction = evaluateGateEl.querySelector<HTMLButtonElement>("[data-evaluate-gate-action]");
      evaluateGateEl.hidden = snapshot.sceneReviewStatus === "accepted";
      if (!evaluateGateEl.hidden && gateTitle && gateDetail && gateAction) {
        if (starterPreview) {
          evaluateGateEl.dataset.state = "starter";
          gateTitle.textContent = currentLang.value === "zh" ? "内置示例为只读评价摘要" : "The built-in demo has a read-only evaluation summary";
          gateDetail.textContent = currentLang.value === "zh" ? "复制示例后即可保存 revision、运行评价和导出。" : "Copy the demo to save revisions, evaluate, and export.";
          gateAction.textContent = currentLang.value === "zh" ? "复制为我的项目" : "Copy to my project";
          gateAction.dataset.evaluateGateAction = "materialize";
        } else if (!hasCurrentWorkflowScene) {
          evaluateGateEl.dataset.state = "empty";
          gateTitle.textContent = hasWorkflowScene
            ? (currentLang.value === "zh" ? "现有 3D 场景不是当前标注版本" : "The available 3D scene is not from the current annotation")
            : (currentLang.value === "zh" ? "尚无可评价的 3D 场景" : "No 3D scene is available for evaluation");
          gateDetail.textContent = currentLang.value === "zh"
            ? "先生成当前标注版本的 3D 场景；本页仍可查看评价说明。"
            : "Generate the current annotation revision first; this page remains available for guidance.";
          gateAction.textContent = currentLang.value === "zh" ? "前往生成 3D 场景" : "Go to 3D generation";
          gateAction.dataset.evaluateGateAction = "generate";
        } else {
          evaluateGateEl.dataset.state = "review";
          gateTitle.textContent = currentLang.value === "zh" ? "当前结果尚未通过审核" : "The current result has not been accepted";
          gateDetail.textContent = currentLang.value === "zh" ? "评价结果与导出会绑定已接受的 revision。" : "Evaluation and export are bound to an accepted revision.";
          gateAction.textContent = currentLang.value === "zh" ? "前往 03 接受结果" : "Open 03 result review";
          gateAction.dataset.evaluateGateAction = "review";
        }
      }
    }
  };

  return { renderCandidateRepository, renderUsedAssetProvenance, updateGenerationDialogContract, renderProfessionalWorkflowState };
}
