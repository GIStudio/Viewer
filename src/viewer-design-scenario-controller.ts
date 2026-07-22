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

export type ViewerDesignScenarioControllerContext = {
  STREET_FURNITURE_OVERRIDE_PATCHES: Record<string, Record<string, unknown>>;
  STRUCTURE_PREVIEW_DEFAULT_STEP_KEY: "scene_preview";
  designFurnitureProfileEl: HTMLSelectElement;
  designFurnitureSummaryEl: HTMLElement;
  designMatrixController: { value: ReturnType<typeof createViewerDesignMatrixController> | null; };
  designPromptEl: HTMLTextAreaElement;
  designScenarioAnnotationEl: HTMLButtonElement;
  designScenarioCatalog: { value: ScenarioDesignCatalogPayload | null; };
  designScenarioDraftEl: HTMLButtonElement;
  designScenarioDraftPromptEl: HTMLTextAreaElement;
  designScenarioDraftResultEl: HTMLElement;
  designScenarioEl: HTMLSelectElement;
  designScenarioMetaEl: HTMLElement;
  designScenarioPreviewEl: HTMLButtonElement;
  designScenarioUseDraftEl: HTMLButtonElement;
  designScenarioUseLlmEl: HTMLInputElement;
  designSeedEl: HTMLInputElement;
  designSkeletonProfileEl: HTMLSelectElement;
  designSkeletonSummaryEl: HTMLElement;
  designTemplateEl: HTMLInputElement;
  errorEl: HTMLElement;
  flashStatus: (message: string, durationMs?: number) => void;
  generationOutputSummaryEl: HTMLElement | null;
  latestDraftScenario: { value: ScenarioDesign | null; };
  panelController: ViewerPanelController;
  parameterDesignController: ViewerParameterDesignController | null;
  populateRecentLayoutOptions: (layouts: RecentLayout[], selectedPath: string) => void;
  sceneSelectionController: any;
  selectedDesignPreset: () => DesignPreset | null;
  setError: (element: HTMLElement, message: string) => void;
  setStatus: (message: string) => void;
  signal: AbortSignal;
  workflow: WorkflowController;
};

export function createViewerDesignScenarioController(getContext: () => ViewerDesignScenarioControllerContext) {
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
    const { designTemplateEl } = getContext();
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

  function scheduleDesignMatrixRefresh(options: { force?: boolean } = {}): void {
    const { designMatrixController, panelController } = getContext();
    if (!options.force && panelController && !panelController.isOpen("design")) {
      return;
    }
    designMatrixController.value?.scheduleRefresh();
  }

  function selectedScenarioDesign(): ScenarioDesign | null {
    const { designScenarioCatalog, designScenarioEl, latestDraftScenario } = getContext();
    const scenarioId = designScenarioEl.value.trim();
    if (!scenarioId) return null;
    if (latestDraftScenario.value?.scenario_id === scenarioId && latestDraftScenario.value.enabled !== false) {
      return latestDraftScenario.value;
    }
    if (!designScenarioCatalog.value) return null;
    return designScenarioCatalog.value.items.find((item) => item.scenario_id === scenarioId && item.enabled !== false) ?? null;
  }

  function profileLabel(options: ReadonlyArray<{ id: string; label: string }>, profileId: string): string {
    return options.find((option) => option.id === profileId)?.label ?? profileId;
  }

  function selectedDesignSemanticConfigPatch(): Record<string, unknown> {
    const { STREET_FURNITURE_OVERRIDE_PATCHES, designFurnitureProfileEl, designSkeletonProfileEl, workflow } = getContext();
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
    const { workflow } = getContext();
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
    const { designSeedEl, designTemplateEl, parameterDesignController, workflow } = getContext();
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
    const { generationOutputSummaryEl, parameterDesignController, workflow } = getContext();
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
    const { designFurnitureProfileEl, designSkeletonProfileEl } = getContext();
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
    const { designFurnitureProfileEl, designFurnitureSummaryEl, designSkeletonProfileEl, designSkeletonSummaryEl, selectedDesignPreset } = getContext();
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

  function renderDesignScenarioOptions(preferredScenarioId?: string): void {
    const { designScenarioCatalog, designScenarioEl, designTemplateEl, latestDraftScenario, workflow } = getContext();
    preferredScenarioId ??= designScenarioEl.value;
    const referenceMode = Boolean(workflow.getSnapshot().normalized);
    const graphTemplateId = referenceMode ? "" : (designScenarioCatalog.value?.graph_template_id || designTemplateEl.value.trim());
    const items = designScenarioCatalog.value?.items ?? [];
    const draftOption = latestDraftScenario.value
      ? `<option value="${escapeHtml(latestDraftScenario.value.scenario_id)}">临时结构 · ${escapeHtml(latestDraftScenario.value.title_zh || latestDraftScenario.value.scenario_id)}</option>`
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
      latestDraftScenario.value?.scenario_id === preferredScenarioId
      || items.some((item) => item.scenario_id === preferredScenarioId && item.enabled !== false)
    );
    designScenarioEl.value = canRestore ? preferredScenarioId : "";
    if (graphTemplateId) syncDesignGraphTemplateId(graphTemplateId);
    updateDesignScenarioMeta();
  }

  function updateDesignScenarioMeta(): void {
    const { designScenarioAnnotationEl, designScenarioCatalog, designScenarioMetaEl, designScenarioPreviewEl, designTemplateEl, latestDraftScenario, workflow } = getContext();
    const referenceMode = Boolean(workflow.getSnapshot().normalized);
    const graphTemplateId = referenceMode ? "" : (designScenarioCatalog.value?.graph_template_id || designTemplateEl.value.trim());
    const scenario = selectedScenarioDesign();
    designScenarioPreviewEl.disabled = !scenario || scenario.preview_layout_exists === false || !scenario.preview_layout_path;
    designScenarioAnnotationEl.disabled = !scenario || (!scenario.annotation && latestDraftScenario.value?.scenario_id === scenario.scenario_id);
    if (scenario && designScenarioCatalog.value?.graph_template_id) {
      syncDesignGraphTemplateId(designScenarioCatalog.value.graph_template_id);
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
    const { designScenarioCatalog, designScenarioEl, designScenarioMetaEl } = getContext();
    designScenarioMetaEl.textContent = "Loading scenario design variants...";
    designScenarioEl.disabled = true;
    try {
      designScenarioCatalog.value = await apiJson<ScenarioDesignCatalogPayload>("/api/scenario-designs");
      renderDesignScenarioOptions();
      designScenarioEl.disabled = false;
      scheduleDesignMatrixRefresh();
    } catch (error) {
      designScenarioCatalog.value = null;
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
    const { designScenarioDraftResultEl, designScenarioUseDraftEl } = getContext();
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
    const { designPromptEl, designScenarioCatalog, designScenarioDraftEl, designScenarioDraftPromptEl, designScenarioDraftResultEl, designScenarioUseDraftEl, designScenarioUseLlmEl, designTemplateEl, errorEl, flashStatus, latestDraftScenario, setError, workflow } = getContext();
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
    const graphTemplateId = designTemplateEl.value.trim() || designScenarioCatalog.value?.graph_template_id || "";
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
      latestDraftScenario.value = scenarioFromDraftPayload(payload, prompt);
      renderDesignScenarioOptions(latestDraftScenario.value.scenario_id);
      renderDraftScenarioResult(latestDraftScenario.value);
      scheduleDesignMatrixRefresh();
      flashStatus(`Draft structure ready: ${latestDraftScenario.value.title_zh || latestDraftScenario.value.scenario_id}.`);
    } catch (error) {
      latestDraftScenario.value = null;
      renderDesignScenarioOptions("");
      renderDraftScenarioResult(null, error instanceof Error ? error.message : "Draft variant failed.");
      scheduleDesignMatrixRefresh();
      setError(errorEl, error instanceof Error ? error.message : "Draft variant failed.");
    } finally {
      designScenarioDraftEl.disabled = false;
    }
  }

  function useLatestDraftScenario(): void {
    const { flashStatus, latestDraftScenario } = getContext();
    if (!latestDraftScenario.value) {
      renderDraftScenarioResult(null, "No draft structure is available yet.");
      return;
    }
    renderDesignScenarioOptions(latestDraftScenario.value.scenario_id);
    renderDraftScenarioResult(latestDraftScenario.value);
    scheduleDesignMatrixRefresh();
    flashStatus(`Using draft structure: ${latestDraftScenario.value.title_zh || latestDraftScenario.value.scenario_id}.`);
  }

  async function loadSelectedDesignScenarioPreview(): Promise<void> {
    const { STRUCTURE_PREVIEW_DEFAULT_STEP_KEY, flashStatus, populateRecentLayoutOptions, sceneSelectionController, setStatus } = getContext();
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
    const { flashStatus, signal, workflow } = getContext();
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

  return { manifestDefaultsToDioramaFinish, syncDesignGraphTemplateId, syncDesignGraphTemplateFromManifest, inferGraphTemplateIdFromLayoutPath, scheduleDesignMatrixRefresh, selectedScenarioDesign, profileLabel, selectedDesignSemanticConfigPatch, selectedAssetGenerationOptions, currentGenerationSpecBuild, renderGenerationOutputSummary, selectedDesignSemanticSummary, updateDesignLayerSummaries, renderDesignScenarioOptions, updateDesignScenarioMeta, loadDesignScenarioCatalog, getTemplatePatchOperationCount, summarizeDraftDefaults, renderDraftScenarioResult, scenarioFromDraftPayload, draftDesignScenarioVariant, useLatestDraftScenario, loadSelectedDesignScenarioPreview, openSelectedDesignScenarioAnnotation };
}
