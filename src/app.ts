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
  DesignPreset,
  SceneJobStatusPayload,
  DesignSchemeVariant,
  BranchRunStatusPayload,
} from "./viewer-types";
import {
  VIEWER_DESIGN_PRESETS,
  DEFAULT_GRAPH_TEMPLATE_ID,
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
  createAssetBboxHelpers,
  createFrameHelpers,
  removeAssetBboxHelpers,
  removeFrameAndAssetHelpers,
  updateAssetBboxHelpers,
} from "./viewer-scene-helpers";
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
import { createViewerDesignController } from "./viewer-design-controller";
import {
  compactUiLabel,
  makeDirectLayoutLabel,
  turnLanePatchSvgClass,
} from "./viewer-scene-options";
import { createViewerSceneSelectionController } from "./viewer-scene-selection-controller";
import {
  DEFAULT_LIGHTING_STATE,
  LIGHTING_PRESET_LABELS,
  LIGHTING_PRESETS,
  type LightingState,
} from "./viewer-lighting";
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
import { captureEvaluationViews } from "./viewer-evaluation-capture";
import { createViewerPresetsController } from "./viewer-presets-controller";
import type { DesktopShell } from "./desktop-shell";

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
};

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
  shell.setHints([
    "Click to capture mouse, then use WASD to move.",
    "Shift accelerates movement, Esc unlocks the cursor, and R resets the roam state.",
    "Use Tools in the top menu or the right tabs for Evaluate, Compare, History, Presets, and Scene Overlay.",
  ]);
  shell.setLeftSections([
    {
      id: "viewer-recent-layouts",
      title: "Recent Layouts",
      subtitle: "Layout / scene entry",
      content: `
        <div class="desktop-shell-form-stack">
          <label class="desktop-shell-field">
            <span>Recent Result</span>
            <select id="layout-select" class="viewer-select viewer-select-inline" title="Recent Result"></select>
          </label>
          <label class="desktop-shell-field">
            <span>Scene</span>
            <select id="scene-select" class="viewer-select viewer-select-inline" title="Scene"></select>
          </label>
        </div>
      `,
    },
  ]);
  shell.setRightTabs(
    [
      {
        id: "settings",
        label: "Settings",
        content: `
          <aside id="viewer-settings-panel" class="viewer-settings-panel" data-open="false">
            <div class="viewer-settings-header">
              <div>
                <div class="viewer-settings-title">Display Settings</div>
                <div class="viewer-settings-subtitle">Light presets, shadows, and laser pointer</div>
              </div>
              <button id="viewer-settings-close" class="viewer-settings-close" type="button" aria-label="Close settings">×</button>
            </div>
            <div class="viewer-settings-section viewer-settings-section-divider">
              <label class="viewer-settings-label">Language · 语言</label>
              <div class="viewer-lang-switcher">
                <button id="viewer-lang-en" class="viewer-lang-btn" type="button">English</button>
                <button id="viewer-lang-zh" class="viewer-lang-btn" type="button">中文</button>
                <button id="viewer-lang-mixed" class="viewer-lang-btn" type="button">中英混合</button>
              </div>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-settings-label" for="lighting-preset">Lighting Preset</label>
              <select id="lighting-preset" class="viewer-select viewer-select-compact"></select>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-exposure">
                <span>Exposure</span>
                <span id="lighting-exposure-value"></span>
              </label>
              <input id="lighting-exposure" class="viewer-range" type="range" min="0.5" max="2.0" step="0.05" />
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-key">
                <span>Key Light Intensity</span>
                <span id="lighting-key-value"></span>
              </label>
              <input id="lighting-key" class="viewer-range" type="range" min="0.2" max="2.0" step="0.05" />
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-fill">
                <span>Fill Light Intensity</span>
                <span id="lighting-fill-value"></span>
              </label>
              <input id="lighting-fill" class="viewer-range" type="range" min="0.1" max="1.6" step="0.05" />
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-warmth">
                <span>Warmth</span>
                <span id="lighting-warmth-value"></span>
              </label>
              <input id="lighting-warmth" class="viewer-range" type="range" min="-1" max="1" step="0.05" />
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="lighting-shadow">
                <span>Shadow Strength</span>
                <span id="lighting-shadow-value"></span>
              </label>
              <input id="lighting-shadow" class="viewer-range" type="range" min="0" max="1" step="0.05" />
            </div>
            <div class="viewer-settings-section viewer-settings-section-divider">
              <label class="viewer-toggle-row" for="third-person-enabled">
                <span>Third Person Camera</span>
                <input id="third-person-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="frame-mode-enabled">
                <span>Frame Mode (Show Boundaries)</span>
                <input id="frame-mode-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="asset-bbox-enabled">
                <span>Asset BBoxes</span>
                <input id="asset-bbox-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="asset-move-enabled">
                <span>Asset Move Mode</span>
                <input id="asset-move-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="laser-pointer-enabled">
                <span>Laser Pointer</span>
                <input id="laser-pointer-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="graph-overlay-enabled">
                <span>Graph Overlay</span>
                <input id="graph-overlay-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="layout-overlay-enabled">
                <span>Scene Overlay</span>
                <input id="layout-overlay-enabled" type="checkbox" />
              </label>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-toggle-row" for="audio-enabled">
                <span>Ambient Audio</span>
                <input id="audio-enabled" type="checkbox" />
              </label>
            </div>
          </aside>
        `,
      },
      {
        id: "design",
        label: "Design",
        content: `
          <aside id="viewer-design-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Design Assistant</div>
                <div class="viewer-slide-panel-subtitle">Generate a scene and load it directly in Viewer</div>
              </div>
              <button id="viewer-design-review-run" class="viewer-design-review-run" type="button" disabled title="重新展开最近一次场景生成步骤">Review Run</button>
              <button id="viewer-design-close" class="viewer-settings-close" type="button" aria-label="Close design assistant">x</button>
            </div>
            <div class="viewer-slide-panel-body viewer-design-body">
              <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-preset">
                <span>Preset</span>
                <button class="viewer-help-icon" type="button" data-help="design-preset" title="了解预设">?</button>
              </label>
              <select id="viewer-design-preset" class="viewer-select viewer-select-compact">
                <option value="__custom__">Custom / LLM-Driven（自定义）</option>
              </select>
              <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-prompt">
                <span>Prompt</span>
                <button class="viewer-help-icon" type="button" data-help="design-prompt" title="了解提示词">?</button>
              </label>
              <textarea id="viewer-design-prompt" class="viewer-design-prompt" rows="5"></textarea>
              <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-count">
                <span>Schemes</span>
                <button class="viewer-help-icon" type="button" data-help="design-schemes" title="了解方案数量">?</button>
              </label>
              <select id="viewer-design-count" class="viewer-select viewer-select-compact">
                <option value="1">Single scheme</option>
                <option value="3">Three variants</option>
              </select>
              <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-template">
                <span>Graph Template</span>
                <button class="viewer-help-icon" type="button" data-help="design-template" title="了解图模板">?</button>
              </label>
              <input id="viewer-design-template" class="viewer-design-input" type="text" value="${DEFAULT_GRAPH_TEMPLATE_ID}" />
              <div id="viewer-design-status" class="viewer-design-status">Ready to generate.</div>
              <div id="viewer-design-result" class="viewer-design-result"></div>
            </div>
            <div class="viewer-slide-panel-footer">
              <button id="viewer-design-branch-run" class="viewer-nav-button viewer-nav-button-secondary" type="button">Branch Run</button>
              <button id="viewer-design-generate" class="viewer-nav-button" type="button">Generate & Load</button>
            </div>
          </aside>
        `,
      },
      {
        id: "evaluate",
        label: "Evaluate",
        content: `
          <aside id="viewer-evaluate-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Design Evaluation</div>
                <div class="viewer-slide-panel-subtitle">AI-driven layout assessment and suggestions</div>
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
        label: "Compare",
        content: `
          <aside id="viewer-compare-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Layout Comparison</div>
                <div class="viewer-slide-panel-subtitle">Compare two layouts side-by-side</div>
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
        label: "History",
        content: `
          <aside id="viewer-history-analysis-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">📊 History Analysis</div>
                <div class="viewer-slide-panel-subtitle">Scatter plot analysis of scene generation history</div>
              </div>
              <button id="viewer-history-analysis-close" class="viewer-settings-close" type="button" aria-label="Close history">x</button>
            </div>
            <div id="viewer-history-analysis-content" class="viewer-slide-panel-body">
              <div class="viewer-history-tabs">
                <button class="viewer-history-tab" data-tab="scatter" data-active="true">散点图 · Scatter</button>
                <button class="viewer-history-tab" data-tab="frequency">频次图 · Frequency</button>
                <button class="viewer-history-tab" data-tab="trend">趋势图 · Trend</button>
                <button class="viewer-history-tab" data-tab="scores">三系统评分 · Scores</button>
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
        label: "Presets",
        content: `
          <aside id="viewer-presets-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Scene Presets</div>
                <div class="viewer-slide-panel-subtitle">Pre-configured scene styles. The highlighted card matches the currently loaded scene's generation preset.</div>
              </div>
              <button id="viewer-presets-close" class="viewer-settings-close" type="button" aria-label="Close presets">x</button>
            </div>
            <div id="viewer-presets-grid" class="viewer-presets-grid"></div>
          </aside>
        `,
      },
      {
        id: "floating-lane",
        label: "Floating Lane",
        content: `
          <div id="viewer-floating-lane-panel-host" class="floating-lane-inline-host">
            <div class="desktop-shell-empty-state">Click Floating Lane button to enable overlay controls.</div>
          </div>
        `,
      },
      {
        id: "help",
        label: "Help",
        content: `
          <aside id="viewer-help-panel" class="viewer-slide-panel" data-open="false">
            <div class="viewer-slide-panel-header">
              <div>
                <div class="viewer-slide-panel-title">Help · 帮助</div>
                <div class="viewer-slide-panel-subtitle">了解生成流程和各个步骤的详细说明</div>
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
                      <span class="viewer-help-step-title">任务排队中</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="queue">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="queue" hidden>
                      <p>你的生成请求被提交到后端服务后会进入排队状态。系统会按照提交顺序处理每个任务。</p>
                      <p><strong>为什么需要排队？</strong> 场景生成是计算密集型任务，为保证服务质量，系统按序处理而非并行处理。</p>
                    </div>
                  </div>
                  <div class="viewer-help-step" data-step="context">
                    <div class="viewer-help-step-header">
                      <span class="viewer-help-step-number">2</span>
                      <span class="viewer-help-step-title">上下文解析</span>
                      <button class="viewer-help-step-detail-btn" type="button" data-detail="context">详情</button>
                    </div>
                    <div class="viewer-help-step-content" data-detail-content="context" hidden>
                      <p>系统会解析你输入的自然语言提示词（Prompt），结合选定的预设（Preset）和图模板（Graph Template），理解你的设计意图并生成可执行的 <code>StreetComposeConfig</code> 配置对象。</p>
                      <p><strong>预设是什么？</strong> 预设是预先配置好的参数组合，例如"步行友好"会降低车流量、增加绿化，"商业活力"会提高密度和商业设施。</p>
                      <p><strong>算法过程：</strong></p>
                      <ul class="viewer-help-list">
                        <li><strong>意图解析：</strong>将自然语言 Prompt 解析为结构化的设计意图，包括目标街道类型、设计规则 profile、客观目标 profile</li>
                        <li><strong>参数合并：</strong>合并 Preset 的配置补丁、Graph Template 的拓扑约束、以及用户手动覆盖的参数</li>
                        <li><strong>需求评估：</strong>根据预设或 LLM 推理得到行人/自行车/公交/车流的需求等级（high/medium/low）</li>
                        <li><strong>上下文构建：</strong>构建包含 layout_mode、graph_template_id、reference_plan_id 等的场景上下文</li>
                        <li><strong>RAG 检索：</strong>从知识库（PDF RAG 或 Graph RAG）中检索相关的设计规则和最佳实践作为引用证据</li>
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
                      <p>系统会根据图模板（Graph Template）生成街道的骨架，包括道路宽度、车道数量、人行道宽度等基础结构。</p>
                      <p><strong>图模板是什么？</strong> 图模板定义了街道的拓扑结构，例如 <code>hkust_gz_gate</code> 是港科大（广州）校门的道路布局模板。</p>
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
                    <h4 class="viewer-help-field-title">Preset（预设）</h4>
                    <p>预设是一组参数的快捷选择，每个预设对应特定的街道设计目标。</p>
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
                    <h4 class="viewer-help-field-title">Prompt（提示词）</h4>
                    <p>用自然语言描述你想要的街道场景。提示词会被系统解析为具体的设计参数。</p>
                    <ul class="viewer-help-list">
                      <li>可以描述功能定位，如"商业步行街"、"住宅区小巷"</li>
                      <li>可以描述氛围感受，如"安静舒适"、"充满活力"</li>
                      <li>可以描述具体特征，如"林荫大道"、"有很多座椅"</li>
                    </ul>
                  </div>
                  <div class="viewer-help-field">
                    <h4 class="viewer-help-field-title">Schemes（方案数量）</h4>
                    <p>选择生成单个方案还是三个变体（A/B/C）：</p>
                    <ul class="viewer-help-list">
                      <li><strong>Single scheme：</strong>只生成一个方案，速度更快</li>
                      <li><strong>Three variants：</strong>生成 A/B/C 三个变体，各有不同的密度和道路宽度扰动，方便对比选择</li>
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
                      <p>建议选择"Three variants"生成 A/B/C 三个变体，它们会在密度和道路宽度上有细微差别。加载后可以使用"Evaluate"面板进行 AI 评分对比。</p>
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
  shell.statusStatusHost.innerHTML = `<div id="viewer-status" class="desktop-shell-inline-status">Loading viewer…</div>`;
  shell.setStatusSummary("Loading viewer…");
  shell.statusActivityHost.innerHTML = `<div class="desktop-shell-log-entry" data-tone="neutral">Viewer shell initialized.</div>`;
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
      <button id="viewer-exit-compare3d" class="viewer-exit-compare3d" type="button" hidden>Exit Split View</button>
      <div id="viewer-crosshair" class="viewer-crosshair" hidden></div>
      <div id="viewer-info-card" class="viewer-info-card" hidden></div>
      <div id="viewer-minimap" class="viewer-minimap">
        <div class="viewer-minimap-title">Scene Map</div>
        <div id="viewer-minimap-canvas" class="viewer-minimap-canvas"></div>
        <canvas id="viewer-minimap-overlay" class="viewer-minimap-overlay"></canvas>
      </div>
      <canvas id="viewer-axis-hud" class="viewer-axis-hud"></canvas>
      <div id="viewer-overlay" class="viewer-overlay">Click scene to capture mouse</div>
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
  const audioToggleEl = requireElement<HTMLInputElement>(root, "#audio-enabled");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f7f6f3");

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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
  canvasHost.appendChild(renderer.domElement);

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

  const hemiLight = new THREE.HemisphereLight(0xfafcff, 0xd6d5d0, 0.75);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(18, 30, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 220;
  keyLight.shadow.camera.left = -90;
  keyLight.shadow.camera.right = 90;
  keyLight.shadow.camera.top = 90;
  keyLight.shadow.camera.bottom = -90;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xdfe8ff, 0.45);
  fillLight.position.set(-18, 18, -18);
  scene.add(fillLight);

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
  let flyAnimation: { startPos: THREE.Vector3; targetPos: THREE.Vector3; startTime: number; duration: number } | null = null;
  let resumeRoamAfterSettingsClose = false;
  let statusResetHandle: number | null = null;
  let lastBranchRunSnapshot: BranchRunStatusPayload | null = null;
  let selectedBranchNodeId: string | null = null;
  let lastDesignRunSnapshot: DesignRunSnapshot | null = null;
  let graphOverlayActive = false;
  const graphOverlayMarkers: THREE.Object3D[] = [];
  const recentLayoutsByPath = new Map<string, RecentLayout>();

  // 语言状态
  type LangMode = "en" | "zh" | "mixed";
  let currentLang: LangMode = (localStorage.getItem("viewer-lang") as LangMode) || "en";

  const lightingState: LightingState = {
    ...DEFAULT_LIGHTING_STATE,
  };

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
    },
    onDesignOpen: populateDesignPresets,
    onCompareOpen: populateCompareSelectors,
    onPresetsOpen: () => presetsController.populatePresetsGrid(),
    onHistoryOpen: () => void historyPanelController.loadAndRenderHistory(),
    onCloseAllOverlays: () => {
      if (graphOverlayActive) {
        clearGraphOverlay();
        graphOverlayActive = false;
      }
      if (layoutOverlayToggleEl.checked) {
        layoutOverlayToggleEl.checked = false;
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
    },
    loadScene,
    afterLayoutLoaded: () => {
      updateMetricsPanel();
      if (graphOverlayActive) {
        graphOverlayToggleEl.checked = false;
        graphOverlayActive = false;
        clearGraphOverlay();
        currentCameraMode = thirdPersonToggleEl.checked ? "third_person" : "first_person";
        syncCameraRig();
      }
      if (layoutOverlayToggleEl.checked) {
        layoutOverlayToggleEl.checked = false;
        floatingLaneSystem.config.enabled = false;
        floatingLaneSystem.clearOverlay();
      }
      applyAudioProfile();
    },
  });

  const designController = createViewerDesignController({
    designPromptEl,
    designTemplateEl,
    designCountEl,
    designGenerateEl,
    designBranchRunEl,
    designReviewRunEl,
    designResultEl,
    designWorkspaceEl,
    minimapEl,
    errorEl,
    getSelectedDesignPreset: selectedDesignPreset,
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

  function applyLightingState(): void {
    const warmthT = clamp((lightingState.warmth + 1) * 0.5, 0, 1);
    const coolKey = new THREE.Color("#f5fbff");
    const warmKey = new THREE.Color("#ffd8a8");
    const coolFill = new THREE.Color("#e7f0ff");
    const warmFill = new THREE.Color("#ffe9cd");
    const coolSky = new THREE.Color("#f8fbff");
    const warmSky = new THREE.Color("#fff1d9");
    const keyColor = new THREE.Color().lerpColors(coolKey, warmKey, warmthT);
    const fillColor = new THREE.Color().lerpColors(coolFill, warmFill, warmthT * 0.65);
    const skyColor = new THREE.Color().lerpColors(coolSky, warmSky, warmthT * 0.55);

    renderer.toneMappingExposure = lightingState.exposure;
    keyLight.color.copy(keyColor);
    fillLight.color.copy(fillColor);
    hemiLight.color.copy(skyColor);
    hemiLight.groundColor.set("#d5d0cb");

    keyLight.intensity = lightingState.keyLightIntensity * (0.85 + lightingState.shadowStrength * 0.45);
    fillLight.intensity = lightingState.fillLightIntensity * (1.0 - lightingState.shadowStrength * 0.25);
    hemiLight.intensity = 0.35 + lightingState.fillLightIntensity * (0.42 - lightingState.shadowStrength * 0.12);
    keyLight.shadow.radius = 2 + (1 - lightingState.shadowStrength) * 8;
    keyLight.shadow.normalBias = 0.01 + (1 - lightingState.shadowStrength) * 0.03;
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

    const minimapWidth = Math.max(1, minimapHost.clientWidth);
    const minimapHeight = Math.max(1, minimapHost.clientHeight);
    minimapRenderer.setSize(minimapWidth, minimapHeight);
    const dpr = Math.min(window.devicePixelRatio, 2);
    minimapOverlayEl.width = Math.max(1, Math.round(minimapWidth * dpr));
    minimapOverlayEl.height = Math.max(1, Math.round(minimapHeight * dpr));
    minimapOverlayEl.style.width = `${minimapWidth}px`;
    minimapOverlayEl.style.height = `${minimapHeight}px`;
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
    overlayEl.hidden = controls.isLocked;
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

  function configureSceneObjectShadows(rootObject: THREE.Object3D): void {
    rootObject.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) {
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
    removeFrameAndAssetHelpers(scene);

    applyAudioProfile();

    clearInfoCard();
    currentLaserHitPoint = null;
    laserHitDot.visible = false;
    laserBeam.visible = false;

    const gltf = await loader.loadAsync(option.glbUrl);
    currentRoot = gltf.scene;
    configureSceneObjectShadows(currentRoot);
    scene.add(currentRoot);

    if (frameModeToggleEl.checked && currentRoot) {
      createFrameHelpers(scene, currentRoot);
    }

    if (assetBboxToggleEl.checked && currentRoot) {
      createAssetBboxHelpers(scene, currentRoot, currentManifest);
    }

    const bbox = new THREE.Box3().setFromObject(currentRoot);
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
    updateMinimapCamera(minimapCamera, currentSceneBounds, bbox);
    resetView();
    const params = currentManifest?.lighting_params;
    if (params) {
      lightingState.preset = currentManifest?.lighting_preset || "custom";
      lightingState.exposure = params.exposure as number;
      lightingState.keyLightIntensity = params.keyLightIntensity as number;
      lightingState.fillLightIntensity = params.fillLightIntensity as number;
      lightingState.warmth = params.warmth as number;
      lightingState.shadowStrength = params.shadowStrength as number;
    } else {
      const presetKey = currentManifest?.lighting_preset;
      if (presetKey && LIGHTING_PRESETS[presetKey]) {
        lightingState.preset = presetKey;
        Object.assign(lightingState, LIGHTING_PRESETS[presetKey]);
      }
    }
    syncLightingUi();
    setStatus(`Viewing ${option.label}`);

    // 清除 manifest 缓存，确保 History Analysis 重新加载最新数据
    clearManifestCache();
  }

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
      container.style.width = "100%";
      container.style.height = "500px";
      container.style.background = "#fafbfc";
      container.style.borderRadius = "8px";
      container.style.border = "1px solid #e2e8f0";
      
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
  ): void {
    lastDesignRunSnapshot = { payload, preset, variant, prompt, graphTemplateId };
    designReviewRunEl.disabled = false;
    const rendered = renderDesignWorkspaceHtml(payload, preset, variant, prompt, graphTemplateId);
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
  }

  function renderBranchRunResults(payload: BranchRunStatusPayload): void {
    designResultEl.innerHTML = renderBranchRunResultsHtml(payload);
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

      const result = await requestUnifiedEvaluation(currentLayoutPath, renderedViews);
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
      startPos: camera.position.clone(),
      targetPos: new THREE.Vector3(x, y, z),
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

  renderer.domElement.addEventListener(
    "click",
    () => {
      if (!assetMoveController.isEnabled() && !panelController.isOpen("settings") && !controls.isLocked) {
        controls.lock();
      }
    },
    { signal },
  );

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

  // 语言切换
  const langEnBtn = requireElement<HTMLButtonElement>(root, "#viewer-lang-en");
  const langZhBtn = requireElement<HTMLButtonElement>(root, "#viewer-lang-zh");
  const langMixedBtn = requireElement<HTMLButtonElement>(root, "#viewer-lang-mixed");

  function updateLangButtons() {
    langEnBtn.classList.toggle("viewer-lang-btn-active", currentLang === "en");
    langZhBtn.classList.toggle("viewer-lang-btn-active", currentLang === "zh");
    langMixedBtn.classList.toggle("viewer-lang-btn-active", currentLang === "mixed");
  }

  function t(en: string, zh: string): string {
    switch (currentLang) {
      case "zh": return zh;
      case "mixed": return `${en} · ${zh}`;
      default: return en;
    }
  }

  function updatePanelTexts() {
    // History Analysis 面板
    const historyPanel = root.querySelector<HTMLElement>("#viewer-history-analysis-panel");
    if (historyPanel) {
      const titleEl = historyPanel.querySelector<HTMLElement>(".viewer-slide-panel-title");
      const subtitleEl = historyPanel.querySelector<HTMLElement>(".viewer-slide-panel-subtitle");
      if (titleEl) {
        titleEl.textContent = t("📊 History Analysis", "📊 历史分析");
      }
      if (subtitleEl) {
        subtitleEl.textContent = t("Scatter plot analysis of scene generation history", "场景生成历史的散点图分析");
      }
    }

    // Layout Comparison 面板
    const comparePanel = root.querySelector<HTMLElement>("#viewer-compare-panel");
    if (comparePanel) {
      const titleEl = comparePanel.querySelector<HTMLElement>(".viewer-slide-panel-title");
      const subtitleEl = comparePanel.querySelector<HTMLElement>(".viewer-slide-panel-subtitle");
      if (titleEl) {
        titleEl.textContent = t("Layout Comparison", "布局对比");
      }
      if (subtitleEl) {
        subtitleEl.textContent = t("Compare two layouts side-by-side", "对比两个布局的配置、指标和地物差异");
      }
    }
  }

  function setLang(lang: LangMode) {
    currentLang = lang;
    localStorage.setItem("viewer-lang", lang);
    updateLangButtons();
    updatePanelTexts();
  }

  langEnBtn.addEventListener("click", () => setLang("en"), { signal });
  langZhBtn.addEventListener("click", () => setLang("zh"), { signal });
  langMixedBtn.addEventListener("click", () => setLang("mixed"), { signal });
  updateLangButtons();
  updatePanelTexts();

  shell.setMenuActions({
    "file-load-layout": () => {
      root.querySelector<HTMLElement>(".desktop-shell")?.classList.remove("desktop-shell-left-collapsed");
      layoutSelectEl.focus();
    },
    "file-export-png": () => exportTopdownMapEl.click(),
    "file-export-svg": () => exportTopdownSvgEl.click(),
    "view-reset-view": () => resetView(),
    "view-language-en": () => langEnBtn.click(),
    "view-language-zh": () => langZhBtn.click(),
    "view-language-mixed": () => langMixedBtn.click(),
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
    const preset = selectedDesignPreset();
    if (preset) {
      designPromptEl.value = preset.prompt;
    }
  }, { signal });
  designGenerateEl.addEventListener("click", () => void designController.runDesignGeneration(), { signal });
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
      void (async () => {
        await sceneSelectionController.loadLayoutSelection(loadPath);
        const recent = await loadRecentLayouts(50, false);
        populateRecentLayoutOptions(recent, loadPath);
        flashStatus("Branch node scene loaded.");
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
    void (async () => {
      await sceneSelectionController.loadLayoutSelection(layoutPath);
      const recent = await loadRecentLayouts(50, false);
      populateRecentLayoutOptions(recent, layoutPath);
      flashStatus("Selected generated scheme loaded.");
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

  minimapOverlayEl.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
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
        flyCameraTo(world.x, Math.max(0, currentSpawn.y - AVATAR_EYE_HEIGHT_M), world.z);
      }
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
        assetBboxToggleEl.checked = true;
        createAssetBboxHelpers(scene, currentRoot, currentManifest);
        if (laserToggleEl.checked) {
          laserToggleEl.checked = false;
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
  assetBboxToggleEl.addEventListener(
    "change",
    async () => {
      // Reload current scene to apply/remove asset bbox helpers
      const currentOption = sceneSelectionController.selectedSceneOption();
      if (currentOption && currentRoot) {
        await loadScene(currentOption);
      }
    },
    { signal },
  );
  assetBboxToggleEl.addEventListener(
    "change",
    async () => {
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

  const handleControlsLock = () => updateOverlay();
  const handleControlsUnlock = () => updateOverlay();
  controls.addEventListener("lock", handleControlsLock);
  controls.addEventListener("unlock", handleControlsUnlock);

  window.addEventListener("resize", resizeRenderer, { signal });
  window.addEventListener("keydown", (event) => handleKey(event, true), { signal });
  window.addEventListener("keyup", (event) => handleKey(event, false), { signal });
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
      camera.position.lerpVectors(flyAnimation.startPos, flyAnimation.targetPos, ease);
      if (t >= 1) {
        flyAnimation = null;
      }
    } else if (controls.isLocked) {
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

    const didRenderCompare = compareMode.renderCompare3dFrame();
    if (!didRenderCompare) {
      renderer.render(scene, camera);
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
    animationFrameId = requestAnimationFrame(animate);
  }
  try {
    syncLightingUi();
    const requestedLayoutPath = parseQueryLayoutPath();
    const recentLayouts = await loadRecentLayouts();
    const initialLayoutPath = requestedLayoutPath ?? recentLayouts[0]?.layout_path ?? "";
    if (!initialLayoutPath) {
      throw new Error(
        "No recent scene layouts were found. Generate a scene first or open the viewer with ?layout=/abs/path/to/scene_layout.json.",
      );
    }
    populateRecentLayoutOptions(recentLayouts, initialLayoutPath);
    resizeRenderer();
    await sceneSelectionController.loadLayoutSelection(initialLayoutPath);
    animate();
    updateOverlay();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize viewer.";
    setError(errorEl, message);
    setStatus("Viewer unavailable");
  }

  return () => {
    destroyed = true;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
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
    renderer.dispose();
    minimapRenderer.dispose();
  };
}

export { mountViewer };
