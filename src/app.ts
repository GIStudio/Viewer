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
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { renderStageTree as renderG6StageTree, StageNode } from "./g6-visualization";
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
  ComparisonItem,
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
  DEFAULT_GRAPH_TEMPLATE_ID,
  SKELETON_DESIGN_PROFILE_OPTIONS,
  STREET_FURNITURE_PROFILE_OPTIONS,
} from "./viewer-types";
import {
  requireElement,
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
import { createAssetMoveController } from "./viewer-asset-move-controller";
import { createViewerPanelController, type ViewerPanelController } from "./viewer-panel-controller";
import {
  sceneBoundsFromManifest,
  updateMinimapCamera,
  minimapToWorld,
  renderMinimap,
  type SceneBounds,
} from "./viewer-minimap";
import {
  exportTopDownMapPng,
  exportTopDownMapSvg,
} from "./viewer-export";
import { createExpandedMapController } from "./viewer-expanded-map";
import { createSchemeCompareController } from "./viewer-scheme-compare";
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
import {
  compactUiLabel,
  makeDirectLayoutLabel,
  turnLanePatchSvgClass,
} from "./viewer-scene-options";
import { createViewerSceneSelectionController } from "./viewer-scene-selection-controller";
import {
  completeLightingValues,
  DEFAULT_LIGHTING_STATE,
  LIGHTING_PRESET_LABELS,
  LIGHTING_PRESETS,
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
import { renderViewerSettingsPanelHtml } from "./viewer-settings-panel";
import { applyAnalyticalDioramaFinish } from "./viewer-visual-style";
import {
  VIEWER_LANGUAGE_EVENT,
  applyViewerTranslations,
  loadViewerLanguage,
  normalizeViewerLanguage,
  viewerText,
  type ViewerLanguage,
} from "./viewer-i18n";
import { createFloatingLaneSystem } from "./viewer-floating-lane";
import { createHistoryPanelController } from "./viewer-history-panel";
import {
  enforceVisualEvaluationAvailability,
  renderMetricsPanel,
  renderEvaluationResultHtml,
  renderEvaluationViewsPreview,
  requestUnifiedEvaluation,
  type RenderedEvaluationView,
} from "./viewer-evaluation";
import { captureEvaluationViews, captureGalleryViews, type GalleryCaptureTarget } from "./viewer-evaluation-capture";
import { createViewerPresetsController } from "./viewer-presets-controller";
import type { DesktopShell, ShellI18nText } from "./desktop-shell";

const STRUCTURE_PREVIEW_DEFAULT_STEP_KEY = "buildings";

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

function profileOptionsHtml(options: ReadonlyArray<{ id: string; label: string }>, autoLabel: string): string {
  return [
    `<option value="">${escapeHtml(autoLabel)}</option>`,
    ...options.map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`),
  ].join("");
}

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

// Constants moved to viewer-types.ts: DEFAULT_GRAPH_TEMPLATE_ID, VIEWER_DESIGN_PRESETS

type MovementState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
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
const INITIAL_RECENT_LAYOUT_LIMIT = 1;
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

function mountViewer(shell: DesktopShell): Promise<() => void> {
  return mountViewerImpl(shell);
}

async function mountViewerImpl(shell: DesktopShell): Promise<() => void> {
  const root = shell.root;
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
  shell.setLeftSections([
    {
      id: "viewer-recent-layouts",
      title: t("Recent Layouts", "最近布局"),
      subtitle: t("Layout / scene entry", "布局 / 场景入口"),
      content: `
        <div class="desktop-shell-form-stack">
          <label class="desktop-shell-field">
            <span data-i18n-key="viewer.left.recentResult">Recent Result</span>
            <select id="layout-select" class="viewer-select viewer-select-inline" title="Recent Result" data-i18n-title-key="viewer.left.recentResult"></select>
          </label>
          <label class="desktop-shell-field">
            <span data-i18n-key="viewer.left.scene">Scene</span>
            <select id="scene-select" class="viewer-select viewer-select-inline" title="Scene" data-i18n-title-key="viewer.left.scene"></select>
          </label>
          <div id="viewer-scheme-compare" class="viewer-scheme-compare"></div>
        </div>
      `,
    },
  ]);
  shell.setRightTabs(
    [
      {
        id: "settings",
        label: t("Settings", "设置"),
        content: renderViewerSettingsPanelHtml(),
      },
      {
        id: "design",
        label: t("Design", "设计"),
        content: `
          <aside id="viewer-design-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title" data-i18n-key="viewer.design.title">Design Assistant</div>
                <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.design.subtitle">Choose a street structure, choose a street furniture goal, then generate a 3D scene.</div>
              </div>
              <button id="viewer-design-close" class="viewer-settings-close" type="button" aria-label="Close design assistant">x</button>
            </div>
            <div class="viewer-slide-panel-body viewer-design-body">
              <section class="viewer-design-flow-section">
                <div class="viewer-design-flow-heading">
                  <span>1</span>
                  <div>
                    <strong>场景结构</strong>
                    <small>决定道路、路口、铺装和功能区。</small>
                  </div>
                </div>
                <label class="viewer-settings-label" for="viewer-design-scenario">
                  <span>Street Structure / 街道结构</span>
                </label>
                <select id="viewer-design-scenario" class="viewer-select viewer-select-compact">
                  <option value="">基础模板（不套用结构变体）</option>
                </select>
                <div id="viewer-design-scenario-meta" class="viewer-design-scenario-meta">
                  Base template: ${DEFAULT_GRAPH_TEMPLATE_ID}
                </div>
                <div id="viewer-design-skeleton-summary" class="viewer-design-layer-summary">
                  A 骨架功能：自动解析（人工标注 > LLM 标注 > OSM/POI）
                </div>
                <div class="viewer-design-scenario-actions">
                  <button id="viewer-design-scenario-preview" class="viewer-nav-button viewer-nav-button-secondary" type="button" disabled title="Open the structure preview through the buildings step. It shows roads, functional zones, and building massing without street furniture.">Preview Structure + Buildings / 预览结构+建筑</button>
                  <button id="viewer-design-scenario-annotation" class="viewer-nav-button viewer-nav-button-secondary" type="button" disabled title="Open annotation in a new tab">Open Annotation</button>
                </div>
                <details class="viewer-design-advanced-details viewer-design-structure-draft">
                  <summary>从一句话创建临时结构</summary>
                  <div class="viewer-design-scenario-draft">
                    <label class="viewer-settings-label" for="viewer-design-scenario-draft-prompt">
                      <span>结构描述</span>
                    </label>
                    <textarea id="viewer-design-scenario-draft-prompt" class="viewer-design-scenario-draft-prompt" rows="3" placeholder="例如：道路中段右侧加公交站，绿色铺装"></textarea>
                    <label class="viewer-design-scenario-llm-toggle">
                      <input id="viewer-design-scenario-use-llm" type="checkbox" checked />
                      <span>Use LLM semantic parse, fallback to deterministic compiler</span>
                    </label>
                    <div class="viewer-design-scenario-draft-actions">
                      <button id="viewer-design-scenario-draft" class="viewer-nav-button viewer-nav-button-secondary" type="button">Draft Structure</button>
                      <button id="viewer-design-scenario-use-draft" class="viewer-nav-button viewer-nav-button-secondary" type="button" disabled>Use Draft Structure</button>
                    </div>
                    <div id="viewer-design-scenario-draft-result" class="viewer-design-scenario-draft-result" data-tone="empty">
                      用自然语言先生成一个可验证的临时结构，再选择 Use Draft Structure 参与 Generate & Load。
                    </div>
                  </div>
                </details>
              </section>
              <section class="viewer-design-flow-section">
                <div class="viewer-design-flow-heading">
                  <span>2</span>
                  <div>
                    <strong>街道家具设计目标</strong>
                    <small>设置街道家具密度、设施优先级、风格和渲染参数；不会直接改道路结构。</small>
                  </div>
                </div>
                <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-preset">
                  <span>Street Furniture Design Goal / 街道家具设计目标</span>
                  <button class="viewer-help-icon" type="button" data-help="design-preset" title="了解街道家具设计目标">?</button>
                </label>
                <select id="viewer-design-preset" class="viewer-select viewer-select-compact">
                  <option value="__custom__">Custom / LLM-Driven（自定义）</option>
                </select>
                <div id="viewer-design-furniture-summary" class="viewer-design-layer-summary">
                  B 家具主题：由街道家具设计目标决定；不直接改道路骨架。
                </div>
              </section>
              <section class="viewer-design-flow-section viewer-design-matrix-section">
                <div class="viewer-design-flow-heading">
                  <span>2x</span>
                  <div>
                    <strong>结构 × 家具预览矩阵</strong>
                    <small>点击已有结果加载；灰色缺失格点击后按需生成。</small>
                  </div>
                </div>
                <div id="viewer-design-matrix" class="viewer-design-matrix" data-state="empty">
                  <div class="viewer-design-matrix-empty">Matrix status will appear here.</div>
                </div>
              </section>
              <section class="viewer-design-flow-section">
                <div class="viewer-design-flow-heading">
                  <span>3</span>
                  <div>
                    <strong>补充要求（可选）</strong>
                    <small>只写额外偏好，不需要重复结构方案。</small>
                  </div>
                </div>
                <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-prompt">
                  <span>Extra Notes / 补充要求</span>
                  <button class="viewer-help-icon" type="button" data-help="design-prompt" title="了解补充要求">?</button>
                </label>
                <textarea id="viewer-design-prompt" class="viewer-design-prompt" rows="3" placeholder="例如：更像校园入口、减少车行感、加强夜间照明"></textarea>
                <div class="viewer-design-prompt-hint">
                  可留空；这里只补充偏好，结构请在上方选择或创建。
                </div>
              </section>
              <section class="viewer-design-flow-section">
                <div class="viewer-design-flow-heading">
                  <span>4</span>
                  <div>
                    <strong>输出设置</strong>
                    <small>选择生成一个方案，或生成三个轻微变化方案。</small>
                  </div>
                </div>
                <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-count">
                  <span>Output / 输出数量</span>
                  <button class="viewer-help-icon" type="button" data-help="design-schemes" title="了解输出数量">?</button>
                </label>
                <select id="viewer-design-count" class="viewer-select viewer-select-compact">
                  <option value="1">生成 1 个方案</option>
                  <option value="3">生成 3 个轻微变化方案</option>
                </select>
                <details class="viewer-design-advanced-details">
                  <summary>Advanced Settings / 高级设置</summary>
                  <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-template">
                    <span>Graph Template</span>
                    <button class="viewer-help-icon" type="button" data-help="design-template" title="了解图模板">?</button>
                  </label>
                  <input id="viewer-design-template" class="viewer-design-input" type="text" value="${DEFAULT_GRAPH_TEMPLATE_ID}" />
                  <label class="viewer-settings-label" for="viewer-design-skeleton-profile">
                    <span>A Skeleton Override / 骨架功能覆盖</span>
                  </label>
                  <select id="viewer-design-skeleton-profile" class="viewer-select viewer-select-compact">
                    ${profileOptionsHtml(SKELETON_DESIGN_PROFILE_OPTIONS, "自动解析（人工 > LLM > OSM/POI）")}
                  </select>
                  <label class="viewer-settings-label" for="viewer-design-furniture-profile">
                    <span>B Furniture Override / 家具主题覆盖</span>
                  </label>
                  <select id="viewer-design-furniture-profile" class="viewer-select viewer-select-compact">
                    ${profileOptionsHtml(STREET_FURNITURE_PROFILE_OPTIONS, "使用上方街道家具设计目标")}
                  </select>
                </details>
              </section>
              <div class="viewer-design-status-row">
                <div id="viewer-design-status" class="viewer-design-status">Ready to generate.</div>
                <button id="viewer-design-review-run" class="viewer-design-review-run" type="button" disabled title="重新展开最近一次场景生成步骤">查看上次生成过程</button>
              </div>
              <div id="viewer-design-result" class="viewer-design-result"></div>
            </div>
            <div class="viewer-slide-panel-footer">
              <div class="viewer-design-action-sections" aria-label="Design assistant actions">
                <section class="viewer-design-action-section viewer-design-action-section-primary" aria-labelledby="viewer-design-generate-actions-title">
                  <div class="viewer-design-action-heading">
                    <span id="viewer-design-generate-actions-title">Generate / 生成</span>
                    <small>按上方结构、街道家具设计目标和补充要求生成场景。</small>
                  </div>
                  <div class="viewer-design-action-row">
                    <button id="viewer-design-generate" class="viewer-nav-button" type="button">Generate & Load / 生成并加载</button>
                  </div>
                </section>
                <details class="viewer-design-advanced-details viewer-design-analysis-details">
                  <summary>Advanced Analysis / 高级分析</summary>
                  <div class="viewer-design-trace-hint">
                    用于研究多个参数样本、查看历史评分和 Pareto 搜索，不是普通生成入口。
                  </div>
                  <div class="viewer-design-action-row">
                    <button id="viewer-design-branch-run" class="viewer-nav-button viewer-nav-button-secondary" type="button">Run Pareto Search / 批量搜索评分</button>
                    <button id="viewer-design-benchmark" class="viewer-nav-button viewer-nav-button-secondary" type="button">Benchmark Store</button>
                    <button id="viewer-design-branch-history" class="viewer-nav-button viewer-nav-button-secondary" type="button">Run History</button>
                  </div>
                </details>
              </div>
            </div>
          </aside>
        `,
      },
      {
        id: "evaluate",
        label: t("Evaluate", "评估"),
        content: `
          <aside id="viewer-evaluate-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title" data-i18n-key="viewer.evaluate.title">Design Evaluation</div>
                <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.evaluate.subtitle">AI-driven layout assessment and suggestions</div>
              </div>
              <button id="viewer-evaluate-close" class="viewer-settings-close" type="button" aria-label="Close evaluation">x</button>
            </div>
            <div id="viewer-evaluate-content" class="viewer-slide-panel-body">
              <div class="viewer-evaluate-empty">Click "Run Evaluation" to analyze the current layout.</div>
            </div>
            <div class="viewer-slide-panel-footer">
              <button id="viewer-evaluate-run" class="viewer-nav-button" type="button">Run Evaluation</button>
            </div>
          </aside>
        `,
      },
      {
        id: "compare",
        label: t("Compare", "对比"),
        content: `
          <aside id="viewer-compare-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title" data-i18n-key="viewer.compare.title">Layout Comparison</div>
                <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.compare.subtitle">Compare two layouts side-by-side</div>
              </div>
              <button id="viewer-compare-close" class="viewer-settings-close" type="button" aria-label="Close comparison">x</button>
            </div>
            <div class="viewer-slide-panel-body">
              <div class="viewer-compare-selectors">
                <div class="viewer-compare-col">
                  <label class="viewer-settings-label" for="compare-layout-a">Layout A</label>
                  <select id="compare-layout-a" class="viewer-select viewer-select-compact"></select>
                </div>
                <div class="viewer-compare-col">
                  <label class="viewer-settings-label" for="compare-layout-b">Layout B</label>
                  <select id="compare-layout-b" class="viewer-select viewer-select-compact"></select>
                </div>
              </div>
              <div id="viewer-compare-results" class="viewer-compare-results"></div>
            </div>
          </aside>
        `,
      },
      {
        id: "history",
        label: t("History", "历史"),
        content: `
          <aside id="viewer-history-analysis-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title" data-i18n-key="viewer.history.title">History Analysis</div>
                <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.history.subtitle">Scatter plot analysis of scene generation history</div>
              </div>
              <button id="viewer-history-analysis-close" class="viewer-settings-close" type="button" aria-label="Close history">x</button>
            </div>
            <div id="viewer-history-analysis-content" class="viewer-slide-panel-body">
              <div class="viewer-history-tabs">
                <button class="viewer-history-tab" data-tab="scatter" data-active="true" data-i18n-key="viewer.history.scatter">Scatter</button>
                <button class="viewer-history-tab" data-tab="frequency" data-i18n-key="viewer.history.frequency">Frequency</button>
                <button class="viewer-history-tab" data-tab="trend" data-i18n-key="viewer.history.trend">Trend</button>
                <button class="viewer-history-tab" data-tab="scores" data-i18n-key="viewer.history.scores">Three-System Scores</button>
              </div>
              <div id="viewer-history-scatter-plot" class="viewer-history-tab-panel" data-tab="scatter" data-active="true" style="width: 100%;"></div>
              <div id="viewer-history-frequency" class="viewer-history-tab-panel" data-tab="frequency" data-active="false" style="width: 100%;"></div>
              <div id="viewer-history-trend" class="viewer-history-tab-panel" data-tab="trend" data-active="false" style="width: 100%;"></div>
              <div id="viewer-history-scores" class="viewer-history-tab-panel" data-tab="scores" data-active="false" style="width: 100%;"></div>
            </div>
          </aside>
        `,
      },
      {
        id: "presets",
        label: t("Presets", "预设"),
        content: `
          <aside id="viewer-presets-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title" data-i18n-key="viewer.presets.title">Scene Presets</div>
                <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.presets.subtitle">Pre-configured scene styles. The highlighted card matches the currently loaded scene's generation preset.</div>
              </div>
              <button id="viewer-presets-close" class="viewer-settings-close" type="button" aria-label="Close presets">x</button>
            </div>
            <div id="viewer-presets-grid" class="viewer-presets-grid"></div>
          </aside>
        `,
      },
      {
        id: "floating-lane",
        label: t("Floating Lane", "浮动车道"),
        content: `
          <div id="viewer-floating-lane-panel-host" class="floating-lane-inline-host">
            <div class="desktop-shell-empty-state">Click Floating Lane button to enable overlay controls.</div>
          </div>
        `,
      },
      {
        id: "help",
        label: t("Help", "帮助"),
        content: `
          <aside id="viewer-help-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title" data-i18n-key="viewer.help.title">Help</div>
                <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.help.subtitle">Generation flow and step-by-step details</div>
              </div>
              <button id="viewer-help-close" class="viewer-settings-close" type="button" aria-label="Close help">x</button>
            </div>
            <div id="viewer-help-content" class="viewer-slide-panel-body">
              <div class="viewer-help-section">
                <h3 class="viewer-help-section-title">🚀 场景生成流程</h3>
                <p class="viewer-help-intro">当你点击 "Generate & Load" 后，系统会按照以下步骤生成 3D 街道场景：</p>
                <div class="viewer-help-steps">
                  <div class="viewer-help-step" data-step="queue">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">1</span>
                      <span class="viewer-help-step-title">任务提交</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="queue">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="queue" hidden>
                      <p>你的生成请求会先提交到后端 job service，然后等待 worker 接手执行。</p>
                      <p><strong>为什么这里可能短暂等待？</strong> 场景生成是计算密集型任务，当前 worker 会按顺序处理请求。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="context">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">2</span>
                      <span class="viewer-help-step-title">上下文解析</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="context">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="context" hidden>
                      <p>系统会读取你选择的场景结构、街道家具设计目标和可选补充要求，合并为可执行的 <code>StreetComposeConfig</code> 配置对象。</p>
                      <p><strong>街道家具设计目标是什么？</strong> 它是预先配置好的街道家具和渲染参数组合，例如"步行友好"会增加座椅、照明和绿化，"商业活力"会提高设施密度和界面活跃度。</p>
                      <p><strong>算法过程：</strong></p>
                      <ul class="viewer-help-list">
                        <li><strong>结构读取：</strong>确定基础模板、Scenario Design 或临时结构提供的道路和功能区信息</li>
                        <li><strong>参数合并：</strong>合并街道家具设计目标的配置补丁、结构模板的拓扑约束、以及补充要求</li>
                        <li><strong>需求评估：</strong>根据街道家具设计目标或 LLM 推理得到行人/自行车/公交/车流的需求等级（high/medium/low）</li>
                        <li><strong>上下文构建：</strong>构建包含 layout_mode、graph_template_id、reference_plan_id 等的场景上下文</li>
                        <li><strong>算法证据：</strong>在详情区展示 RAG/GraphRAG 引用证据和参数来源</li>
                      </ul>
                      <p><strong>输出参数：</strong> density、road_width_m、length_m、lane_count、sidewalk_width_m、design_rule_profile、objective_profile 等。</p>
                      <p><strong>在设计面板中查看实时参数：</strong> 生成过程中点击"查看算法详情"按钮，可以看到本次生成实际使用的配置值。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="asset">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">3</span>
                      <span class="viewer-help-step-title">资产加载</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="asset">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="asset" hidden>
                      <p>根据解析出的需求，系统会从资产清单（Manifest）中加载对应的 3D 模型，包括树木、路灯、座椅、公交站等街道家具。</p>
                      <p><strong>资产从哪里来？</strong> 资产存储在 <code>data/real_assets_manifest.jsonl</code> 中，每个资产都有分类、描述和 CLIP 文本嵌入向量用于语义检索。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="layout">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">4</span>
                      <span class="viewer-help-step-title">布局生成</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="layout">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="layout" hidden>
                      <p>系统会根据场景结构生成街道骨架，包括道路宽度、车道数量、人行道宽度和功能区等基础空间结构。</p>
                      <p><strong>场景结构从哪里来？</strong> 可以来自基础图模板、已保存的 Scenario Design，也可以来自一句话创建的临时结构。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="constraint">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">5</span>
                      <span class="viewer-help-step-title">约束求解</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="constraint">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="constraint" hidden>
                      <p>系统会检查布局是否满足设计规则（Design Rules）和合规性要求，例如人行道最小宽度、车道间距、无障碍通行等。</p>
                      <p><strong>不满足约束怎么办？</strong> 系统会自动调整布局以尝试满足约束，如果无法完全满足，会在结果中标记违规项。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="composition">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">6</span>
                      <span class="viewer-help-step-title">资产组合</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="composition">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="composition" hidden>
                      <p>系统会使用 CLIP 语义检索，将加载的 3D 资产智能地放置到街道场景中，包括放置位置、旋转角度和缩放比例。</p>
                      <p><strong>放置策略是什么？</strong> 系统支持规则策略（Rule-based）和学习策略（Learned policy），会根据资产类别、道路功能区（Strip）和 POI 兴趣点进行布局。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="mesh">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">7</span>
                      <span class="viewer-help-step-title">网格生成</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="mesh">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="mesh" hidden>
                      <p>所有资产放置完成后，系统会将它们合并为完整的 3D 场景网格（Mesh），包括道路铺装、人行道、建筑体块和所有街道家具。</p>
                      <p><strong>这一步做什么？</strong> 将离散的 3D 模型整合为统一的场景几何体，为后续的光照计算和渲染做准备。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="render">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">8</span>
                      <span class="viewer-help-step-title">场景渲染</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="render">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="render" hidden>
                      <p>系统会应用光照、材质、阴影和色调映射（Tone Mapping），生成最终的可视觉化场景。</p>
                      <p><strong>光照从哪里来？</strong> 场景使用三点照明系统：主光源（Key Light）、补光（Fill Light）和环境光（Ambient），配合曝光和色温调节。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="export">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">9</span>
                      <span class="viewer-help-step-title">GLB 导出</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="export">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="export" hidden>
                      <p>渲染完成后，系统会将场景导出为 GLB 格式（Binary glTF），这是一种高效的 3D 场景文件格式。</p>
                      <p><strong>为什么用 GLB？</strong> GLB 格式将所有资源（几何体、材质、纹理）打包为单一文件，便于网络传输和 Three.js 加载。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="organize">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">10</span>
                      <span class="viewer-help-step-title">结果整理</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="organize">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="organize" hidden>
                      <p>最后，系统会生成 <code>scene_layout.json</code> 文件，包含所有资产的放置信息、场景统计数据和生产步骤（Production Steps）。</p>
                      <p><strong>生产步骤是什么？</strong> 生产步骤记录了场景构建的中间过程，你可以在 Viewer 中逐步查看道路基础 → 建筑 → 家具 → 最终预览的各个阶段。</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="viewer-help-section">
                <h3 class="viewer-help-section-title">🎯 Design 面板使用指南</h3>
                <div class="viewer-help-fields">
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">场景结构</h4>
                    <p>场景结构决定道路、路口、铺装和功能区。可以使用基础模板，也可以选择已有结构变体。</p>
                    <ul class="viewer-help-list">
                      <li>基础模板：不套用结构变体，直接从默认图模板生成</li>
                      <li>结构变体：会改变道路功能区、表面铺装或设施位置</li>
                      <li>临时结构：可以用一句话创建，验证后再参与生成</li>
                    </ul>
                  </div>
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Street Furniture Design Goal（街道家具设计目标）</h4>
                    <p>街道家具设计目标是一组设施密度、优先级、风格和渲染参数的快捷选择，不直接改变道路结构。</p>
                    <ul class="viewer-help-list">
                      <li><strong>步行友好（Pedestrian Friendly）：</strong>行人优先，全龄友好，低车流量，高绿化</li>
                      <li><strong>商业活力（Commercial Vitality）：</strong>商业活跃，人流密集，高设施密度</li>
                      <li><strong>公交优先（Transit Priority）：</strong>公交导向，换乘便利，高公交可达性</li>
                      <li><strong>公园景观（Park Landscape）：</strong>绿化为主，自然生态，休闲舒适</li>
                      <li><strong>安静居住（Quiet Residential）：</strong>住宅区安静环境，绿树成荫</li>
                      <li><strong>平衡街道（Balanced Complete）：</strong>各类使用者平衡的完整街道</li>
                    </ul>
                  </div>
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Extra Notes（补充要求）</h4>
                    <p>补充要求是可选偏好，用来微调氛围、风格或设施倾向，不需要重复结构方案。</p>
                    <ul class="viewer-help-list">
                      <li>可以描述功能定位，如"更像校园入口"、"减少车行感"</li>
                      <li>可以描述氛围感受，如"安静舒适"、"充满活力"</li>
                      <li>可以描述具体特征，如"加强夜间照明"、"有更多座椅"</li>
                    </ul>
                  </div>
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Output（输出数量）</h4>
                    <p>选择生成单个方案还是三个变体（A/B/C）：</p>
                    <ul class="viewer-help-list">
                      <li><strong>生成 1 个方案：</strong>速度更快，适合快速预览</li>
                      <li><strong>生成 3 个轻微变化方案：</strong>A/B/C 会有不同的密度和道路宽度扰动，方便对比选择</li>
                    </ul>
                  </div>
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Graph Template（图模板）</h4>
                    <p>图模板定义了街道的拓扑结构和布局骨架。</p>
                    <ul class="viewer-help-list">
                      <li>默认模板：<code>hkust_gz_gate</code>（港科大广州校门）</li>
                      <li>可以指定其他已配置的模板 ID</li>
                      <li>模板决定了道路数量、车道宽度和基本布局</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div class="viewer-help-section">
                <h3 class="viewer-help-section-title">💡 常见问题</h3>
                <div class="viewer-help-faq">
                  <details class="viewer-help-faq-item">
                    <summary class="viewer-help-faq-question">生成一个场景需要多长时间？</summary>
                    <div class="viewer-help-faq-answer">
                      <p>通常需要 1-5 分钟，具体取决于场景复杂度、资产数量和服务器负载。计算密集型任务包括布局生成、约束求解和资产组合。</p>
                    </div>
                  </details>
                  <details class="viewer-help-faq-item">
                    <summary class="viewer-help-faq-question">为什么生成失败了？</summary>
                    <div class="viewer-help-faq-answer">
                      <p>可能的原因包括：约束冲突无法解决、资产检索失败、模板配置错误等。请查看错误提示，调整预设或提示词后重试。</p>
                    </div>
                  </details>
                  <details class="viewer-help-faq-item">
                    <summary class="viewer-help-faq-question">如何选择最佳方案？</summary>
                    <div class="viewer-help-faq-answer">
                      <p>如果只是快速看效果，先生成 1 个方案；如果要比较设计方向，再生成 3 个轻微变化方案。加载后可以使用 Evaluate 面板进行评分对比。</p>
                    </div>
                  </details>
                  <details class="viewer-help-faq-item">
                    <summary class="viewer-help-faq-question">什么是 Production Steps？</summary>
                    <div class="viewer-help-faq-answer">
                      <p>Production Steps 是场景构建的中间过程记录，包括道路基础 → 建筑体块 → POI 上下文 → 家具锚点 → 必需家具 → 可选家具 → 最终预览。你可以在 Viewer 的 Settings 中切换到不同步骤查看。</p>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </aside>
        `,
      },
    ],
    null,
  );
  shell.statusStatusHost.innerHTML = `<div id="viewer-status" class="desktop-shell-inline-status" data-i18n-key="viewer.status.loading">${t("Loading viewer...", "正在加载查看器...")}</div>`;
  shell.setStatusSummary({ key: "viewer.status.loading" });
  shell.statusActivityHost.innerHTML = `<div class="desktop-shell-log-entry" data-tone="neutral" data-i18n-key="viewer.status.initialized">${t("Viewer shell initialized.", "查看器框架已初始化。")}</div>`;
  shell.centerStage.innerHTML = `
    <div class="viewer-shell viewer-shell-embedded">
      <div class="viewer-command-hub" hidden>
        <button id="viewer-menu-toggle" type="button" aria-label="Menu" aria-expanded="false">☰</button>
        <div id="viewer-menu-dropdown" hidden></div>
        <button id="viewer-scene-graph-link" type="button">Annotation</button>
        <button id="viewer-asset-editor-link" type="button">Asset Editor</button>
        <button id="viewer-junction-editor-link" type="button">Junction Editor</button>
        <button id="viewer-settings-toggle" type="button" aria-expanded="false">Settings</button>
        <button id="viewer-design-toggle" type="button">Design</button>
        <button id="viewer-compare-toggle" type="button">Compare</button>
        <button id="viewer-presets-toggle" type="button">Presets</button>
        <button id="viewer-evaluate-toggle" type="button">Evaluate</button>
        <button id="viewer-history-analysis-toggle" type="button">History</button>
        <button id="viewer-floating-lane-toggle" type="button">Floating Lane</button>
        <button id="viewer-help-toggle" type="button">Help</button>
        <button id="viewer-export-topdown-map" type="button">Export PNG</button>
        <button id="viewer-export-topdown-svg" type="button">Export SVG</button>
      </div>
      <div id="viewer-canvas" class="viewer-canvas"></div>
      <div id="viewer-design-workspace" class="viewer-design-workspace" hidden></div>
      <button id="viewer-exit-compare3d" class="viewer-exit-compare3d" type="button" hidden data-i18n-key="viewer.compare.exit">Exit Split View</button>
      <div id="viewer-crosshair" class="viewer-crosshair" hidden></div>
      <div id="viewer-info-card" class="viewer-info-card" hidden></div>
      <div id="viewer-minimap" class="viewer-minimap">
        <div class="viewer-minimap-title">
          <span data-i18n-key="viewer.minimap.title">Scene Map</span>
          <button id="viewer-minimap-expand" class="viewer-minimap-expand" type="button" aria-label="Expand Scene Map" title="Expand Scene Map">&#x26F6;</button>
        </div>
        <div id="viewer-minimap-canvas" class="viewer-minimap-canvas"></div>
        <canvas id="viewer-minimap-overlay" class="viewer-minimap-overlay"></canvas>
      </div>
      <canvas id="viewer-axis-hud" class="viewer-axis-hud"></canvas>
      <div id="viewer-overlay" class="viewer-overlay" data-i18n-key="viewer.overlay.capture">Click scene to capture mouse</div>
      <div id="viewer-error" class="viewer-error" hidden></div>
    </div>
  `;

  const canvasHost = requireElement<HTMLElement>(root, "#viewer-canvas");
  const designWorkspaceEl = requireElement<HTMLElement>(root, "#viewer-design-workspace");
  const statusEl = requireElement<HTMLElement>(root, "#viewer-status");
  const overlayEl = requireElement<HTMLElement>(root, "#viewer-overlay");
  const errorEl = requireElement<HTMLElement>(root, "#viewer-error");
  const layoutSelectEl = requireElement<HTMLSelectElement>(root, "#layout-select");
  const selectEl = requireElement<HTMLSelectElement>(root, "#scene-select");
  const schemeCompareEl = requireElement<HTMLElement>(root, "#viewer-scheme-compare");
  const sceneGraphLinkEl = requireElement<HTMLButtonElement>(root, "#viewer-scene-graph-link");
  const assetEditorLinkEl = requireElement<HTMLButtonElement>(root, "#viewer-asset-editor-link");
  
  const menuToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-menu-toggle");
  const menuDropdownEl = requireElement<HTMLElement>(root, "#viewer-menu-dropdown");
  const settingsToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-settings-toggle");
  const settingsPanelEl = requireElement<HTMLElement>(root, "#viewer-settings-panel");
  const settingsCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-settings-close");
  const infoCardEl = requireElement<HTMLElement>(root, "#viewer-info-card");
  const crosshairEl = requireElement<HTMLElement>(root, "#viewer-crosshair");
  const minimapEl = requireElement<HTMLElement>(root, "#viewer-minimap");
  const minimapExpandEl = requireElement<HTMLButtonElement>(root, "#viewer-minimap-expand");
  const minimapHost = requireElement<HTMLElement>(root, "#viewer-minimap-canvas");
  const minimapOverlayEl = requireElement<HTMLCanvasElement>(root, "#viewer-minimap-overlay");
  const axisHudEl = requireElement<HTMLCanvasElement>(root, "#viewer-axis-hud");
  const lightingPresetEl = requireElement<HTMLSelectElement>(root, "#lighting-preset");
  const exposureInput = requireElement<HTMLInputElement>(root, "#lighting-exposure");
  const keyInput = requireElement<HTMLInputElement>(root, "#lighting-key");
  const fillInput = requireElement<HTMLInputElement>(root, "#lighting-fill");
  const warmthInput = requireElement<HTMLInputElement>(root, "#lighting-warmth");
  const shadowInput = requireElement<HTMLInputElement>(root, "#lighting-shadow");
  const exposureValueEl = requireElement<HTMLElement>(root, "#lighting-exposure-value");
  const keyValueEl = requireElement<HTMLElement>(root, "#lighting-key-value");
  const fillValueEl = requireElement<HTMLElement>(root, "#lighting-fill-value");
  const warmthValueEl = requireElement<HTMLElement>(root, "#lighting-warmth-value");
  const shadowValueEl = requireElement<HTMLElement>(root, "#lighting-shadow-value");
  const thirdPersonToggleEl = requireElement<HTMLInputElement>(root, "#third-person-enabled");
  const frameModeToggleEl = requireElement<HTMLInputElement>(root, "#frame-mode-enabled");
  const assetBboxToggleEl = requireElement<HTMLInputElement>(root, "#asset-bbox-enabled");
  const assetMoveToggleEl = requireElement<HTMLInputElement>(root, "#asset-move-enabled");
  const laserToggleEl = requireElement<HTMLInputElement>(root, "#laser-pointer-enabled");

  const designToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-design-toggle");
  const designPanelEl = requireElement<HTMLElement>(root, "#viewer-design-panel");
  const designReviewRunEl = requireElement<HTMLButtonElement>(root, "#viewer-design-review-run");
  const designCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-design-close");
  const designPresetEl = requireElement<HTMLSelectElement>(root, "#viewer-design-preset");
  const designPromptEl = requireElement<HTMLTextAreaElement>(root, "#viewer-design-prompt");
  const designCountEl = requireElement<HTMLSelectElement>(root, "#viewer-design-count");
  const designTemplateEl = requireElement<HTMLInputElement>(root, "#viewer-design-template");
  const designScenarioEl = requireElement<HTMLSelectElement>(root, "#viewer-design-scenario");
  const designScenarioMetaEl = requireElement<HTMLElement>(root, "#viewer-design-scenario-meta");
  const designSkeletonSummaryEl = requireElement<HTMLElement>(root, "#viewer-design-skeleton-summary");
  const designScenarioPreviewEl = requireElement<HTMLButtonElement>(root, "#viewer-design-scenario-preview");
  const designScenarioAnnotationEl = requireElement<HTMLButtonElement>(root, "#viewer-design-scenario-annotation");
  const designScenarioDraftPromptEl = requireElement<HTMLTextAreaElement>(root, "#viewer-design-scenario-draft-prompt");
  const designScenarioUseLlmEl = requireElement<HTMLInputElement>(root, "#viewer-design-scenario-use-llm");
  const designScenarioDraftEl = requireElement<HTMLButtonElement>(root, "#viewer-design-scenario-draft");
  const designScenarioUseDraftEl = requireElement<HTMLButtonElement>(root, "#viewer-design-scenario-use-draft");
  const designScenarioDraftResultEl = requireElement<HTMLElement>(root, "#viewer-design-scenario-draft-result");
  const designSkeletonProfileEl = requireElement<HTMLSelectElement>(root, "#viewer-design-skeleton-profile");
  const designFurnitureProfileEl = requireElement<HTMLSelectElement>(root, "#viewer-design-furniture-profile");
  const designFurnitureSummaryEl = requireElement<HTMLElement>(root, "#viewer-design-furniture-summary");
  const designMatrixEl = requireElement<HTMLElement>(root, "#viewer-design-matrix");
  const designBenchmarkEl = requireElement<HTMLButtonElement>(root, "#viewer-design-benchmark");
  const designBranchHistoryEl = requireElement<HTMLButtonElement>(root, "#viewer-design-branch-history");
  const designBranchRunEl = requireElement<HTMLButtonElement>(root, "#viewer-design-branch-run");
  const designGenerateEl = requireElement<HTMLButtonElement>(root, "#viewer-design-generate");
  const designStatusEl = requireElement<HTMLElement>(root, "#viewer-design-status");
  const designResultEl = requireElement<HTMLElement>(root, "#viewer-design-result");

  const evaluateToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-evaluate-toggle");
  const evaluatePanelEl = requireElement<HTMLElement>(root, "#viewer-evaluate-panel");
  const evaluateCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-evaluate-close");
  const evaluateRunEl = requireElement<HTMLButtonElement>(root, "#viewer-evaluate-run");
  const evaluateContentEl = requireElement<HTMLElement>(root, "#viewer-evaluate-content");

  const compareToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-compare-toggle");
  const comparePanelEl = requireElement<HTMLElement>(root, "#viewer-compare-panel");
  const compareCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-compare-close");
  const compareSelectAEl = requireElement<HTMLSelectElement>(root, "#compare-layout-a");
  const compareSelectBEl = requireElement<HTMLSelectElement>(root, "#compare-layout-b");
  const compareResultsEl = requireElement<HTMLElement>(root, "#viewer-compare-results");
  const exitCompare3dEl = requireElement<HTMLButtonElement>(root, "#viewer-exit-compare3d");

  const historyAnalysisToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-history-analysis-toggle");
  const historyAnalysisPanelEl = requireElement<HTMLElement>(root, "#viewer-history-analysis-panel");
  const historyAnalysisCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-history-analysis-close");
  const historyAnalysisContentEl = requireElement<HTMLElement>(root, "#viewer-history-analysis-content");
  const historyPanelController = createHistoryPanelController({
    contentEl: historyAnalysisContentEl,
    loadRecentLayouts,
    loadManifest,
  });
  const exportTopdownMapEl = requireElement<HTMLButtonElement>(root, "#viewer-export-topdown-map");
  const exportTopdownSvgEl = requireElement<HTMLButtonElement>(root, "#viewer-export-topdown-svg");
  const presetsToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-presets-toggle");
  const presetsPanelEl = requireElement<HTMLElement>(root, "#viewer-presets-panel");
  const presetsCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-presets-close");
  const presetsGridEl = requireElement<HTMLElement>(root, "#viewer-presets-grid");

  const helpToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-help-toggle");
  const helpPanelEl = requireElement<HTMLElement>(root, "#viewer-help-panel");
  const helpCloseEl = requireElement<HTMLButtonElement>(root, "#viewer-help-close");
  const helpContentEl = requireElement<HTMLElement>(root, "#viewer-help-content");

  const graphOverlayToggleEl = requireElement<HTMLInputElement>(root, "#graph-overlay-enabled");

  const layoutOverlayToggleEl = requireElement<HTMLInputElement>(root, "#layout-overlay-enabled");
  const analysisOverlayToggleEl = requireElement<HTMLInputElement>(root, "#analysis-overlay-enabled");
  const dioramaFinishToggleEl = requireElement<HTMLInputElement>(root, "#diorama-finish-enabled");
  const audioToggleEl = requireElement<HTMLInputElement>(root, "#audio-enabled");

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
    syncDesignGraphTemplateId(summaryTemplateId || pathTemplateId || DEFAULT_GRAPH_TEMPLATE_ID);
  }

  function inferGraphTemplateIdFromLayoutPath(layoutPath: string): string {
    const match = layoutPath.match(/(?:^|\/)graph_template\/([^/]+)(?:\/|$)/);
    return match?.[1] ?? "";
  }

  let designScenarioCatalog: ScenarioDesignCatalogPayload | null = null;
  let latestDraftScenario: ScenarioDesign | null = null;
  let designMatrixController: ReturnType<typeof createViewerDesignMatrixController> | null = null;

  function scheduleDesignMatrixRefresh(): void {
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
    const graphTemplateId = designScenarioCatalog?.graph_template_id || designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
    const items = designScenarioCatalog?.items ?? [];
    const draftOption = latestDraftScenario
      ? `<option value="${escapeHtml(latestDraftScenario.scenario_id)}">临时结构 · ${escapeHtml(latestDraftScenario.title_zh || latestDraftScenario.scenario_id)}</option>`
      : "";
    designScenarioEl.innerHTML = [
      `<option value="">基础模板（不套用结构变体）</option>`,
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
    syncDesignGraphTemplateId(graphTemplateId);
    updateDesignScenarioMeta();
  }

  function updateDesignScenarioMeta(): void {
    const graphTemplateId = designScenarioCatalog?.graph_template_id || designTemplateEl.value.trim() || DEFAULT_GRAPH_TEMPLATE_ID;
    const scenario = selectedScenarioDesign();
    designScenarioPreviewEl.disabled = !scenario || scenario.preview_layout_exists === false || !scenario.preview_layout_path;
    designScenarioAnnotationEl.disabled = !scenario || (!scenario.annotation && latestDraftScenario?.scenario_id === scenario.scenario_id);
    if (scenario && designScenarioCatalog?.graph_template_id) {
      syncDesignGraphTemplateId(designScenarioCatalog.graph_template_id);
    }
    if (!scenario) {
      designScenarioMetaEl.textContent = `基础模板：${graphTemplateId}。将使用下方街道家具设计目标和补充要求生成。`;
      designScenarioMetaEl.dataset.tone = "base";
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
    const graphTemplateId = designTemplateEl.value.trim() || designScenarioCatalog?.graph_template_id || DEFAULT_GRAPH_TEMPLATE_ID;
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
    setStatus(`Loading structure + buildings preview: ${scenario.title_zh || scenario.scenario_id}...`);
    await sceneSelectionController.loadLayoutSelection(scenario.preview_layout_path, {
      defaultSceneOptionKey: STRUCTURE_PREVIEW_DEFAULT_STEP_KEY,
    });
    const recent = await loadRecentLayouts(50, false);
    populateRecentLayoutOptions(recent, scenario.preview_layout_path);
    flashStatus(`Structure + buildings preview loaded: ${scenario.title_zh || scenario.scenario_id}.`);
  }

  function openSelectedDesignScenarioAnnotation(): void {
    const scenario = selectedScenarioDesign();
    if (scenario) {
      if (scenario.annotation) {
        window.localStorage.setItem("roadgen3d.pendingScenarioDraftAnnotation", JSON.stringify({
          scenario_id: scenario.scenario_id,
          title_zh: scenario.title_zh,
          annotation: scenario.annotation,
        }));
      } else {
        window.localStorage.setItem("roadgen3d.pendingScenarioDesignId", scenario.scenario_id);
      }
      flashStatus(`Opening annotation for ${scenario.title_zh || scenario.scenario_id}...`);
    }
    const sceneGraphUrl = new URL(window.location.href);
    sceneGraphUrl.hash = "scene-graph";
    window.open(sceneGraphUrl.toString(), "_blank", "noopener");
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

  const minimapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  minimapRenderer.outputColorSpace = THREE.SRGBColorSpace;
  minimapRenderer.setPixelRatio(1);
  minimapRenderer.shadowMap.enabled = false;
  minimapHost.appendChild(minimapRenderer.domElement);
  const minimapCamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 4000);
  minimapCamera.up.set(0, 0, -1);

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

  function ensureCompareOption(selectEl: HTMLSelectElement, item: ComparisonItem): void {
    if (Array.from(selectEl.options).some((option) => option.value === item.layout_path)) {
      return;
    }
    const optionEl = document.createElement("option");
    optionEl.value = item.layout_path;
    optionEl.textContent = compactUiLabel(item.variant_name || item.metadata?.variant_name || makeDirectLayoutLabel(item.layout_path));
    optionEl.title = item.layout_path;
    selectEl.appendChild(optionEl);
  }

  function syncComparePair(a: ComparisonItem, b: ComparisonItem, openDetails: boolean): void {
    populateCompareSelectors();
    ensureCompareOption(compareSelectAEl, a);
    ensureCompareOption(compareSelectBEl, b);
    compareSelectAEl.value = a.layout_path;
    compareSelectBEl.value = b.layout_path;
    if (openDetails) {
      panelController.setOpen("compare", true);
      void compareMode.runComparison();
    }
  }

  const schemeCompareController = createSchemeCompareController({
    hostEl: schemeCompareEl,
    loadManifest: (layoutPath) => loadManifest(layoutPath),
    enterCompareSceneSet: compareMode.enterCompareSceneSet,
    syncComparePair,
    escapeHtml,
    compactUiLabel,
    makeDirectLayoutLabel,
    flashStatus,
    setStatus,
  });

  const raycaster = new THREE.Raycaster();
  const clock = new THREE.Clock();
  const eventController = new AbortController();
  const { signal } = eventController;
  let animationFrameId = 0;
  let destroyed = false;
  const moveState: MovementState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
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
  let resumeRoamAfterSettingsClose = false;
  let statusResetHandle: number | null = null;
  let minimapClickHandle: number | null = null;
  let lastBranchRunSnapshot: BranchRunStatusPayload | null = null;
  let selectedBranchNodeId: string | null = null;
  let lastDesignRunSnapshot: DesignRunSnapshot | null = null;
  let graphOverlayActive = false;
  const graphOverlayMarkers: THREE.Object3D[] = [];
  const recentLayoutsByPath = new Map<string, RecentLayout>();

  const lightingState: LightingState = {
    ...DEFAULT_LIGHTING_STATE,
  };
  let environmentState: EnvironmentState = {
    ...DEFAULT_ENVIRONMENT_STATE,
  };
  let environmentController: ViewerEnvironmentController;

  let panelController: ViewerPanelController;
  const floatingLaneSystem = createFloatingLaneSystem({
    scene,
    camera,
    getManifest: () => currentManifest,
    getSceneBounds: () => currentSceneBounds,
    cameraForwardHorizontal,
    axisHudEl,
    layoutOverlayToggleEl,
    panelHost: requireElement<HTMLElement>(root, "#viewer-floating-lane-panel-host"),
    shell,
    shouldDeactivateTab: () => !panelController?.isAnyOpen(),
  });
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
      design: designPanelEl,
      evaluate: evaluatePanelEl,
      compare: comparePanelEl,
      presets: presetsPanelEl,
      help: helpPanelEl,
      history: historyAnalysisPanelEl,
    },
    settingsToggleEl,
    onSettingsOpen: () => {
      resetMoveState();
      if (controls.isLocked) {
        resumeRoamAfterSettingsClose = true;
        controls.unlock();
      }
    },
    onSettingsClose: (restoreRoam) => {
      const shouldRestoreRoam = restoreRoam || resumeRoamAfterSettingsClose;
      resumeRoamAfterSettingsClose = false;
      if (shouldRestoreRoam) {
        controls.lock();
      }
      updateOverlay();
    },
    onDesignOpen: () => {
      populateDesignPresets();
      scheduleDesignMatrixRefresh();
    },
    onCompareOpen: populateCompareSelectors,
    onPresetsOpen: () => presetsController.populatePresetsGrid(),
    onHistoryOpen: () => void historyPanelController.loadAndRenderHistory(),
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
    afterLayoutLoaded: () => {
      updateMetricsPanel();
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
    },
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
    getCurrentLayoutPath: () => currentLayoutPath || currentManifest?.layout_path || "",
    loadLayoutSelection: sceneSelectionController.loadLayoutSelection,
    populateRecentLayoutOptions,
    setStatus,
    setError,
    flashStatus,
    updateDesignStatus,
    errorEl,
  });

  const presetsController = createViewerPresetsController({
    presetsGridEl,
    errorEl,
    getCurrentManifest: () => currentManifest,
    closePresetsPanel: () => panelController.setOpen("presets", false),
    setStatus,
    setError,
    flashStatus,
    loadLayoutSelection: sceneSelectionController.loadLayoutSelection,
    populateRecentLayoutOptions,
  });

  schemeCompareController.restoreStoredSelection();

  function setStatus(message: string): void {
    if (statusResetHandle !== null) {
      window.clearTimeout(statusResetHandle);
      statusResetHandle = null;
    }
    statusEl.textContent = message;
    shell.setStatusSummary(message);
    shell.pushActivity(message, "neutral");
  }

  function flashStatus(message: string, durationMs = 1800): void {
    const restoreText = statusEl.textContent || "";
    if (statusResetHandle !== null) {
      window.clearTimeout(statusResetHandle);
    }
    statusEl.textContent = message;
    shell.setStatusSummary(message);
    shell.pushActivity(message, "success");
    statusResetHandle = window.setTimeout(() => {
      statusEl.textContent = restoreText;
      shell.setStatusSummary(restoreText);
      statusResetHandle = null;
    }, durationMs);
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
      const recent = await loadRecentLayouts(50, false);
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

    const minimapWidth = Math.max(1, minimapHost.clientWidth);
    const minimapHeight = Math.max(1, minimapHost.clientHeight);
    minimapRenderer.setSize(minimapWidth, minimapHeight);
    const dpr = Math.min(window.devicePixelRatio, 2);
    minimapOverlayEl.width = Math.max(1, Math.round(minimapWidth * dpr));
    minimapOverlayEl.height = Math.max(1, Math.round(minimapHeight * dpr));
    minimapOverlayEl.style.width = `${minimapWidth}px`;
    minimapOverlayEl.style.height = `${minimapHeight}px`;
    expandedMapController.resize();
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

  function updateOverlay(): void {
    const shouldShow = !isRoamMovementActive();
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

  const assetMoveController = createAssetMoveController({
    scene,
    camera,
    renderer,
    getCurrentRoot: () => currentRoot,
    getManifest: () => currentManifest,
    controlsAreLocked: () => controls.isLocked,
    unlockControls: () => controls.unlock(),
    setInfoCardContent,
    setLaserCopyText: (text) => { currentLaserCopyText = text; },
    flashStatus,
    updateAssetBboxHelpers: () => updateAssetBboxHelpers(scene),
  });

  async function copyCurrentLaserTargetDetails(): Promise<void> {
    if (!laserToggleEl.checked && !assetMoveController.isEnabled()) {
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
    const movementKey = isRoamMovementKey(event.code);
    const sceneRoamActive = isPointerLookActive() || isThirdPersonKeyboardRoamActive();
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
      case "ShiftLeft":
      case "ShiftRight":
        moveState.sprint = active;
        break;
      case "KeyR":
        if (active) {
          resetView();
        }
        break;
      case "KeyP":
        if (active && !event.repeat) {
          panelController.toggle("settings", { restoreRoam: true });
        }
        break;
      case "KeyL":
        if (active && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
          floatingLaneSystem.toggleOverlay();
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
    moveState.sprint = false;
  }

  function isThirdPersonKeyboardRoamActive(): boolean {
    return currentCameraMode === "third_person"
      && !panelController.isAnyOpen()
      && document.visibilityState === "visible"
      && document.hasFocus();
  }

  function isPointerLookActive(): boolean {
    return controls.isLocked || document.pointerLockElement === renderer.domElement;
  }

  function isRoamMovementActive(): boolean {
    return isPointerLookActive() || isThirdPersonKeyboardRoamActive();
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
    });
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
    const descriptor = resolveHitDescriptor(hit.object, hit.point.clone(), currentManifest ?? undefined);
    if (!descriptor) {
      lastLaserTargetKey = "";
      clearInfoCard();
      return;
    }
    const content = buildHitDescriptorContent(descriptor, currentManifest ?? undefined);
    currentLaserCopyText = content.text;
    setInfoCardContent(content.html);
    lastLaserTargetKey = targetKey;
  }

  async function loadScene(option: SceneOption): Promise<void> {
    const loadStart = performance.now();
    clearError(errorEl);
    setStatus(`Loading ${option.label}…`);
    if (controls.isLocked) {
      controls.unlock();
    }

    if (currentRoot) {
      scene.remove(currentRoot);
      disposeObject(currentRoot);
      currentRoot = null;
    }
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
    const boundsMs = (performance.now() - boundsStart).toFixed(1);
    console.info(`[viewer-timing] loadScene.bounds (${option.label}): ${boundsMs} ms`);
    fitViewerLightingRigToBounds(lightingRig, bbox);
    updateMinimapCamera(minimapCamera, currentSceneBounds, bbox);
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

    // 清除 manifest 缓存，确保 History Analysis 重新加载最新数据
    clearManifestCache();
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
    recentLayoutsByPath.clear();
    layoutSelectEl.innerHTML = "";
    for (const layout of layouts) {
      recentLayoutsByPath.set(layout.layout_path, layout);
      const optionEl = document.createElement("option");
      optionEl.value = layout.layout_path;
      optionEl.textContent = compactUiLabel(layout.label);
      optionEl.title = layout.label;
      layoutSelectEl.appendChild(optionEl);
    }
    if (selectedPath && !recentLayoutsByPath.has(selectedPath)) {
      const optionEl = document.createElement("option");
      optionEl.value = selectedPath;
      const directLabel = makeDirectLayoutLabel(selectedPath);
      optionEl.textContent = compactUiLabel(directLabel);
      optionEl.title = directLabel;
      layoutSelectEl.appendChild(optionEl);
    }
    layoutSelectEl.disabled = layoutSelectEl.options.length === 0;
    if (selectedPath) {
      layoutSelectEl.value = selectedPath;
      const selectedLayout = recentLayoutsByPath.get(selectedPath);
      layoutSelectEl.title = selectedLayout?.label ?? makeDirectLayoutLabel(selectedPath);
    }
    schemeCompareController.setRecentLayouts(Array.from(recentLayoutsByPath.values()), selectedPath);
  }

  function recentLayoutDirectOptionExists(layoutPath: string): boolean {
    return Array.from(layoutSelectEl.options).some((option) => option.value === layoutPath);
  }

  function appendRecentLayoutOptions(layouts: RecentLayout[], selectedPath: string): void {
    for (const layout of layouts) {
      if (recentLayoutsByPath.has(layout.layout_path)) {
        continue;
      }
      recentLayoutsByPath.set(layout.layout_path, layout);
      const optionEl = document.createElement("option");
      optionEl.value = layout.layout_path;
      optionEl.textContent = compactUiLabel(layout.label);
      optionEl.title = layout.label;
      layoutSelectEl.appendChild(optionEl);
    }
    if (selectedPath) {
      const selectedLayout = recentLayoutsByPath.get(selectedPath);
      if (selectedLayout) {
        layoutSelectEl.value = selectedPath;
        layoutSelectEl.title = selectedLayout.label;
      } else if (!recentLayoutDirectOptionExists(selectedPath)) {
        const directOption = document.createElement("option");
        const directLabel = makeDirectLayoutLabel(selectedPath);
        directOption.value = selectedPath;
        directOption.textContent = compactUiLabel(directLabel);
        directOption.title = directLabel;
        layoutSelectEl.appendChild(directOption);
        layoutSelectEl.value = selectedPath;
        layoutSelectEl.title = directLabel;
      } else {
        layoutSelectEl.title = makeDirectLayoutLabel(selectedPath);
      }
    }
    layoutSelectEl.disabled = layoutSelectEl.options.length === 0;
    schemeCompareController.setRecentLayouts(Array.from(recentLayoutsByPath.values()), selectedPath);
  }

  function scheduleRecentLayoutHydration(selectedPath: string, initialLoaded: number): void {
    const startOffset = Math.max(0, Math.min(initialLoaded, RECENT_LAYOUT_BACKGROUND_LIMIT));
    void (async () => {
      try {
        if (startOffset >= RECENT_LAYOUT_BACKGROUND_LIMIT) {
          return;
        }
        let nextOffset = startOffset;
        while (!destroyed && nextOffset < RECENT_LAYOUT_BACKGROUND_LIMIT) {
          const batch = Math.min(RECENT_LAYOUT_BACKGROUND_BATCH, RECENT_LAYOUT_BACKGROUND_LIMIT - nextOffset);
          const pageLayouts = await loadRecentLayouts(batch, false, nextOffset);
          if (destroyed) {
            return;
          }
          if (pageLayouts.length === 0) {
            return;
          }
          appendRecentLayoutOptions(pageLayouts, selectedPath);
          if (panelController && panelController.isOpen("compare")) {
            populateCompareSelectors();
          }
          nextOffset += pageLayouts.length;
          if (pageLayouts.length < batch) {
            return;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 120));
        }
      } catch (error) {
        console.warn("Failed to hydrate full recent-layouts list:", error);
      }
    })();
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
    designStatusEl.textContent = message;
    designStatusEl.dataset.tone = tone;
    shell.pushActivity(message, tone);
    shell.setStatusSummary(message);
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
    
    // Render G6 stage tree after DOM is updated
    requestAnimationFrame(() => {
      renderDesignStageTree(payload, rendered.stage, rendered.failed);
    });
  }

  function hideDesignWorkspace(): void {
    designWorkspaceEl.hidden = true;
    minimapEl.hidden = false; // Show minimap when design workspace is hidden
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


  /* ── Evaluate ────────────────────────────────────────────── */

  async function runEvaluation(): Promise<void> {
    if (!currentLayoutPath) {
      evaluateContentEl.innerHTML = `<div class="viewer-evaluate-empty">No layout loaded.</div>`;
      return;
    }
    evaluateContentEl.innerHTML = `<div class="viewer-evaluate-loading">Capturing evaluation views...</div>`;
    evaluateRunEl.disabled = true;

    try {
      setStatus("Capturing evaluation views...");
      let renderedViews: RenderedEvaluationView[] = [];
      try {
        renderedViews = await captureEvaluationViews({
          scene,
          renderer,
          cameraForwardHorizontal,
          currentRoot,
          currentSpawn,
          currentForward,
          avatarEyeHeightM: AVATAR_EYE_HEIGHT_M,
        });
      } catch (captureError) {
        console.warn("Visual evaluation screenshots failed:", captureError);
        renderedViews = [];
      }
      if (renderedViews.length === 3) {
        evaluateContentEl.innerHTML = `
          <div class="viewer-evaluate-loading">Running visual evaluation from 3 rendered views...</div>
          ${renderEvaluationViewsPreview(renderedViews)}
        `;
        setStatus("Running visual evaluation from captured views...");
      } else {
        evaluateContentEl.innerHTML = `
          <div class="viewer-evaluate-loading">Visual capture unavailable. Requesting walkability with Safety/Beauty as N/A...</div>
          ${renderEvaluationViewsPreview(renderedViews)}
        `;
        setStatus("Visual evaluation unavailable; requesting walkability only.");
      }

      const manifestSummary = (currentManifest?.summary || {}) as Record<string, unknown>;
      const result = await requestUnifiedEvaluation(currentLayoutPath, renderedViews, {
        presetId: String(manifestSummary.preset_id || manifestSummary.benchmark_preset_id || selectedDesignPreset()?.id || "custom"),
        persistToBenchmark: true,
      });
      const evalResult = enforceVisualEvaluationAvailability(result);
      evaluateContentEl.innerHTML = renderEvaluationResultHtml(evalResult, renderedViews);
      flashStatus(
        renderedViews.length === 3
          ? "Visual evaluation complete."
          : "Walkability complete; visual scores unavailable.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Evaluation request failed.";
      evaluateContentEl.innerHTML = `<div class="viewer-evaluate-error">${escapeHtml(message)}</div>`;
      setStatus(`Evaluation failed: ${message}`);
    } finally {
      evaluateRunEl.disabled = false;
    }
  }

  function populateCompareSelectors(): void {
    const layouts = Array.from(recentLayoutsByPath.values());
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

  function flyCameraTo(x: number, y: number, z: number, durationMs = 900): void {
    if (flyAnimation) return;
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

  /* ── Metrics Panel in Info Card ──────────────────────────── */

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

  const requestPointerLock = (): void => {
    if (!assetMoveController.isEnabled() && !panelController.isOpen("settings") && !isPointerLookActive()) {
      renderer.domElement.focus();
      controls.lock();
    }
  };
  renderer.domElement.addEventListener("click", requestPointerLock, { signal });
  overlayEl.addEventListener("click", requestPointerLock, { signal });

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

  const junctionEditorLinkEl = requireElement<HTMLButtonElement>(root, "#viewer-junction-editor-link");
  junctionEditorLinkEl.addEventListener(
    "click",
    () => {
      window.location.hash = "#junction-editor";
    },
    { signal },
  );

  exportTopdownMapEl.addEventListener("click", () => {
    exportTopDownMapPng(scene, currentRoot);
    menuDropdownEl.hidden = true;
    menuToggleEl.setAttribute("aria-expanded", "false");
  }, { signal });

  exportTopdownSvgEl.addEventListener("click", () => {
    exportTopDownMapSvg(currentRoot);
    menuDropdownEl.hidden = true;
    menuToggleEl.setAttribute("aria-expanded", "false");
  }, { signal });

  menuToggleEl.addEventListener("click", () => {
    const willOpen = menuDropdownEl.hidden;
    menuDropdownEl.hidden = !willOpen;
    menuToggleEl.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }, { signal });

  document.addEventListener("click", (event) => {
    if (!menuDropdownEl.hidden && !menuToggleEl.contains(event.target as Node) && !menuDropdownEl.contains(event.target as Node)) {
      menuDropdownEl.hidden = true;
      menuToggleEl.setAttribute("aria-expanded", "false");
    }
  }, { signal });

  settingsToggleEl.addEventListener("click", () => {
    if (panelController.isOpen("settings")) {
      panelController.setOpen("settings", false);
    } else {
      panelController.closeAll();
      panelController.setOpen("settings", true);
    }
  }, { signal });
  settingsCloseEl.addEventListener("click", () => panelController.setOpen("settings", false), { signal });

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
    const recentSection = root.querySelector<HTMLElement>('[data-section-id="viewer-recent-layouts"]');
    const recentTitle = recentSection?.querySelector<HTMLElement>(".desktop-shell-section-summary > span:first-child");
    const recentSubtitle = recentSection?.querySelector<HTMLElement>(".desktop-shell-section-subtitle");
    if (recentTitle) {
      recentTitle.textContent = t("Recent Layouts", "最近布局");
    }
    if (recentSubtitle) {
      recentSubtitle.textContent = t("Layout / scene entry", "布局 / 场景入口");
    }

    const tabLabels: Array<[string, string, string]> = [
      ["settings", "Settings", "设置"],
      ["design", "Design", "设计"],
      ["evaluate", "Evaluate", "评估"],
      ["compare", "Compare", "对比"],
      ["history", "History", "历史"],
      ["presets", "Presets", "预设"],
      ["floating-lane", "Floating Lane", "浮动车道"],
      ["help", "Help", "帮助"],
    ];
    for (const [tabId, en, zh] of tabLabels) {
      const button = root.querySelector<HTMLButtonElement>(`[data-shell-tab="${tabId}"]`);
      if (button) {
        button.textContent = t(en, zh);
      }
    }
  }

  function applyLocalLanguage(language: ViewerLanguage): void {
    currentLang = language;
    root.dataset.viewerLanguage = language;
    applyViewerTranslations(root, language);
    updateShellSectionTexts();
    shell.setHints(localizedViewerHints());
    compareMode.refreshLanguage();
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
    "file-export-png": () => exportTopdownMapEl.click(),
    "file-export-svg": () => exportTopdownSvgEl.click(),
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
    "tools-open-compare": () => panelController.setOpen("compare", !panelController.isOpen("compare")),
    "tools-open-history": () => panelController.setOpen("history", !panelController.isOpen("history")),
    "tools-open-presets": () => panelController.setOpen("presets", !panelController.isOpen("presets")),
    "tools-open-floating-lane": () => {
      shell.activateRightTab("floating-lane");
      if (!floatingLaneSystem.config.enabled) {
        floatingLaneSystem.toggleOverlay();
      }
      floatingLaneSystem.mountControlPanel();
    },
    "help-shortcuts": () => {
      shell.setBottomOpen(true);
      root.querySelector<HTMLButtonElement>('[data-shell-status-tab="hints"]')?.click();
    },
  });

  root.querySelector<HTMLButtonElement>('[data-shell-tab="settings"]')?.addEventListener("click", () => {
    panelController.setOpen("settings", true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="design"]')?.addEventListener("click", () => {
    panelController.setOpen("design", true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="evaluate"]')?.addEventListener("click", () => {
    panelController.setOpen("evaluate", true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="compare"]')?.addEventListener("click", () => {
    panelController.setOpen("compare", true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="history"]')?.addEventListener("click", () => {
    panelController.setOpen("history", true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="presets"]')?.addEventListener("click", () => {
    panelController.setOpen("presets", true);
  }, { signal });
  root.querySelector<HTMLButtonElement>('[data-shell-tab="floating-lane"]')?.addEventListener("click", () => {
    if (!floatingLaneSystem.config.enabled) {
      floatingLaneSystem.toggleOverlay();
    }
    floatingLaneSystem.mountControlPanel();
    shell.activateRightTab("floating-lane");
  }, { signal });

  designToggleEl.addEventListener("click", () => panelController.setOpen("design", !panelController.isOpen("design")), { signal });
  designReviewRunEl.addEventListener("click", reviewLastDesignRun, { signal });
  designCloseEl.addEventListener("click", () => panelController.setOpen("design", false), { signal });
  designPresetEl.addEventListener("change", () => {
    const currentPrompt = designPromptEl.value.trim();
    const presetPromptValues = new Set(VIEWER_DESIGN_PRESETS.map((item) => item.prompt.trim()).filter(Boolean));
    if (!currentPrompt || presetPromptValues.has(currentPrompt)) {
      designPromptEl.value = "";
    }
    updateDesignLayerSummaries();
    scheduleDesignMatrixRefresh();
  }, { signal });
  designScenarioEl.addEventListener("change", () => {
    updateDesignScenarioMeta();
    scheduleDesignMatrixRefresh();
  }, { signal });
  designPromptEl.addEventListener("input", scheduleDesignMatrixRefresh, { signal });
  designTemplateEl.addEventListener("input", scheduleDesignMatrixRefresh, { signal });
  designSkeletonProfileEl.addEventListener("change", () => {
    updateDesignLayerSummaries();
    scheduleDesignMatrixRefresh();
  }, { signal });
  designFurnitureProfileEl.addEventListener("change", () => {
    updateDesignLayerSummaries();
    scheduleDesignMatrixRefresh();
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
  designScenarioAnnotationEl.addEventListener("click", openSelectedDesignScenarioAnnotation, { signal });
  designGenerateEl.addEventListener("click", () => {
    void designController.runDesignGeneration().finally(scheduleDesignMatrixRefresh);
  }, { signal });
  designBenchmarkEl.addEventListener("click", () => void designController.loadBenchmarkExplorer(), { signal });
  designBranchHistoryEl.addEventListener("click", () => void designController.loadBranchRunHistory(), { signal });
  designBranchRunEl.addEventListener("click", () => void designController.runBranchGeneration(), { signal });
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

  evaluateToggleEl.addEventListener("click", () => panelController.setOpen("evaluate", !panelController.isOpen("evaluate")), { signal });
  evaluateCloseEl.addEventListener("click", () => panelController.setOpen("evaluate", false), { signal });
  evaluateRunEl.addEventListener("click", () => void runEvaluation(), { signal });

  compareToggleEl.addEventListener("click", () => panelController.setOpen("compare", !panelController.isOpen("compare")), { signal });
  compareCloseEl.addEventListener("click", () => panelController.setOpen("compare", false), { signal });
  compareSelectAEl.addEventListener("change", () => void compareMode.runComparison(), { signal });
  compareSelectBEl.addEventListener("change", () => void compareMode.runComparison(), { signal });

  historyAnalysisToggleEl.addEventListener("click", () => panelController.setOpen("history", !panelController.isOpen("history")), { signal });
  historyAnalysisCloseEl.addEventListener("click", () => panelController.setOpen("history", false), { signal });

  presetsToggleEl.addEventListener("click", () => panelController.setOpen("presets", !panelController.isOpen("presets")), { signal });
  presetsCloseEl.addEventListener("click", () => panelController.setOpen("presets", false), { signal });
  presetsGridEl.addEventListener("click", presetsController.handleGridClick, { signal });

  // Help panel toggle and close
  helpToggleEl.addEventListener("click", () => panelController.setOpen("help", !panelController.isOpen("help")), { signal });
  helpCloseEl.addEventListener("click", () => panelController.setOpen("help", false), { signal });

  // Help icons in Design panel - click to open Help panel
  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    
    // Handle help icon clicks in Design panel
    const helpIcon = target.closest<HTMLButtonElement>(".viewer-help-icon");
    if (helpIcon && helpIcon.dataset.help) {
      event.preventDefault();
      event.stopPropagation();
      panelController.setOpen("help", true);
      // Optionally scroll to the relevant section
      return;
    }

    // Handle help step detail buttons
    const detailBtn = target.closest<HTMLButtonElement>(".viewer-help-step-detail-btn");
    if (detailBtn && detailBtn.dataset.detail) {
      event.preventDefault();
      const contentEl = helpContentEl.querySelector<HTMLElement>(`[data-detail-content="${detailBtn.dataset.detail}"]`);
      if (contentEl) {
        const isHidden = contentEl.hasAttribute("hidden");
        // Toggle this content and hide all others
        helpContentEl.querySelectorAll<HTMLElement>("[data-detail-content]").forEach((el) => {
          el.setAttribute("hidden", "");
        });
        if (isHidden) {
          contentEl.removeAttribute("hidden");
        }
      }
      return;
    }
  }, { signal });

  // Floating Lane Overlay toggle
  const floatingLaneToggleEl = requireElement<HTMLButtonElement>(root, "#viewer-floating-lane-toggle");
  floatingLaneToggleEl.addEventListener("click", () => {
    floatingLaneSystem.toggleOverlay();
  }, { signal });

  minimapExpandEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    expandedMapController.open();
  }, { signal });

  minimapOverlayEl.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (minimapClickHandle !== null) {
        window.clearTimeout(minimapClickHandle);
        minimapClickHandle = null;
      }
      if (event.detail > 1) {
        return;
      }
      if (!currentSceneBounds) {
        return;
      }
      const rect = minimapOverlayEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const world = minimapToWorld(
        event.clientX - rect.left,
        event.clientY - rect.top,
        currentSceneBounds,
        minimapOverlayEl,
      );
      if (world) {
        minimapClickHandle = window.setTimeout(() => {
          flyCameraTo(world.x, currentAvatarPosition.y, world.z);
          minimapClickHandle = null;
        }, 180);
      }
    },
    { signal },
  );
  minimapOverlayEl.addEventListener(
    "dblclick",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (minimapClickHandle !== null) {
        window.clearTimeout(minimapClickHandle);
        minimapClickHandle = null;
      }
      expandedMapController.open();
    },
    { signal },
  );

  for (const [presetKey, presetLabel] of Object.entries(LIGHTING_PRESET_LABELS)) {
    const optionEl = document.createElement("option");
    optionEl.value = presetKey;
    optionEl.textContent = presetLabel;
    lightingPresetEl.appendChild(optionEl);
  }

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
      assetMoveController.setEnabled(assetMoveToggleEl.checked);
      if (assetMoveToggleEl.checked) {
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
        flashStatus("Asset move mode enabled. Drag assets in the 3D scene.");
      } else {
        flashStatus("Asset move mode disabled.");
      }
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
  controls.addEventListener("lock", handleControlsLock);
  controls.addEventListener("unlock", handleControlsUnlock);
  document.addEventListener("pointerlockchange", handlePointerLockChange, { signal });
  document.addEventListener("pointerlockerror", handlePointerLockChange, { signal });

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
      try {
        await sceneSelectionController.loadLayoutSelection(nextLayoutPath);
        layoutSelectEl.title = recentLayoutsByPath.get(nextLayoutPath)?.label ?? makeDirectLayoutLabel(nextLayoutPath);
        schemeCompareController.setRecentLayouts(Array.from(recentLayoutsByPath.values()), nextLayoutPath);
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

    renderMinimap(
      minimapRenderer,
      scene,
      minimapCamera,
      currentRoot,
      currentSceneBounds,
      minimapOverlayEl,
      currentAvatarPosition,
      cameraForwardHorizontal,
      currentLaserHitPoint,
    );
    expandedMapController.render();
    animationFrameId = requestAnimationFrame(animate);
  }
  try {
    syncEnvironmentUi();
    syncLightingUi();
    resizeRenderer();
    void loadDesignScenarioCatalog();
    if (captureMode) {
      setStatus("Capture API ready");
    } else {
      const requestedLayoutPath = parseQueryLayoutPath();
      let recentLayouts: RecentLayout[] = [];
      let initialLayoutCandidates = requestedLayoutPath ? [requestedLayoutPath] : [];

      if (!requestedLayoutPath) {
        recentLayouts = await loadRecentLayouts(INITIAL_RECENT_LAYOUT_LIMIT);
        initialLayoutCandidates = recentLayouts.map((item) => item.layout_path);
      }

      if (initialLayoutCandidates.length === 0) {
        throw new Error(
          "No recent scene layouts were found. Generate a scene first or open the viewer with ?layout=/abs/path/to/scene_layout.json.",
        );
      }

      let initialLayoutPath = initialLayoutCandidates[0];
      let lastLayoutError = "";
      for (const candidate of initialLayoutCandidates) {
        try {
          populateRecentLayoutOptions(recentLayouts, candidate);
          await sceneSelectionController.loadLayoutSelection(candidate);
          initialLayoutPath = candidate;
          lastLayoutError = "";
          break;
        } catch (error) {
          lastLayoutError = error instanceof Error ? error.message : "Failed to load scene layout.";
          console.warn(`Skipping unavailable scene layout ${candidate}:`, error);
        }
      }

      // If user passed ?layout=... and it failed, fallback to latest recent layouts.
      if (requestedLayoutPath && lastLayoutError) {
        recentLayouts = await loadRecentLayouts(RECENT_LAYOUT_BACKGROUND_LIMIT, false);
        const fallbackCandidates = recentLayouts
          .map((item) => item.layout_path)
          .filter((item) => item !== requestedLayoutPath);
        for (const candidate of fallbackCandidates) {
          try {
            populateRecentLayoutOptions(recentLayouts, candidate);
            await sceneSelectionController.loadLayoutSelection(candidate);
            initialLayoutPath = candidate;
            lastLayoutError = "";
            break;
          } catch (error) {
            lastLayoutError = error instanceof Error ? error.message : "Failed to load scene layout.";
            console.warn(`Skipping fallback scene layout ${candidate}:`, error);
          }
        }
      }

      if (lastLayoutError) {
        throw new Error(`No viewable scene layouts were found. Last error: ${lastLayoutError}`);
      }
      animate();
      updateOverlay();
      if (initialLayoutPath) {
        const initialLoaded = recentLayouts.some((item) => item.layout_path === initialLayoutPath)
          ? recentLayouts.length
          : 0;
        scheduleRecentLayoutHydration(initialLayoutPath, initialLoaded);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize viewer.";
    setError(errorEl, message);
    setStatus("Viewer unavailable");
  }

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
    if (minimapClickHandle !== null) {
      window.clearTimeout(minimapClickHandle);
      minimapClickHandle = null;
    }
    eventController.abort();
    controls.removeEventListener("lock", handleControlsLock);
    controls.removeEventListener("unlock", handleControlsUnlock);
    if (controls.isLocked) {
      controls.unlock();
    }
    clearGraphOverlay();
    floatingLaneSystem.clearOverlay();
    assetMoveController.dispose();
    environmentController.dispose();
    expandedMapController.dispose();
    renderPipeline.dispose();
    renderer.dispose();
    minimapRenderer.dispose();
  };
}

export { mountViewer };
