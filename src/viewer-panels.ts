/**
 * HTML panel templates for the RoadGen3D Viewer.
 * 
 * Contains all slide panel HTML templates for:
 * - Settings panel
 * - Design panel  
 * - Evaluate panel
 * - Compare panel
 * - History panel
 * - Presets panel
 * - Help panel
 */

import {
  DEFAULT_GRAPH_TEMPLATE_ID,
  SKELETON_DESIGN_PROFILE_OPTIONS,
  STREET_FURNITURE_PROFILE_OPTIONS,
} from "./viewer-types";

function profileOptionsHtml(options: ReadonlyArray<{ id: string; label: string }>, autoLabel: string): string {
  return [
    `<option value="">${autoLabel}</option>`,
    ...options.map((option) => `<option value="${option.id}">${option.label}</option>`),
  ].join("");
}

/**
 * Generate Settings panel HTML template.
 */
export function createSettingsPanelHtml(): string {
  return `
    <aside id="viewer-settings-panel" class="viewer-slide-panel" data-open="false">
      <div class="viewer-slide-panel-header">
        <div>
          <div class="viewer-slide-panel-title">Settings</div>
          <div class="viewer-slide-panel-subtitle">Configure viewer appearance and behavior</div>
        </div>
        <button id="viewer-settings-close" class="viewer-settings-close" type="button" aria-label="Close settings">x</button>
      </div>
      <div class="viewer-slide-panel-body">
        <label class="viewer-settings-label">Lighting</label>
        <select id="viewer-lighting-preset" class="viewer-select"></select>
        <label class="viewer-settings-label">Camera Mode</label>
        <select id="viewer-camera-mode" class="viewer-select">
          <option value="orbit">Orbit</option>
          <option value="first_person">First Person</option>
        </select>
      </div>
    </aside>
  `;
}

/**
 * Generate Design panel HTML template.
 */
export function createDesignPanelHtml(): string {
  return `
    <aside id="viewer-design-panel" class="viewer-slide-panel" data-open="false">
      <div class="viewer-slide-panel-header">
        <div>
          <div class="viewer-slide-panel-title">Design Assistant</div>
          <div class="viewer-slide-panel-subtitle">Choose a street structure, choose a street furniture goal, then generate a 3D scene.</div>
        </div>
        <button id="viewer-design-close" class="viewer-settings-close" type="button" aria-label="Close design assistant">x</button>
      </div>
      <div class="viewer-slide-panel-body viewer-design-body">
        <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-preset">
          <span>Street Furniture Design Goal / 街道家具设计目标</span>
          <button class="viewer-help-icon" type="button" data-help="design-preset" title="了解预设">?</button>
        </label>
        <select id="viewer-design-preset" class="viewer-select viewer-select-compact">
          <option value="__custom__">Custom / LLM-Driven（自定义）</option>
        </select>
        <div id="viewer-design-skeleton-summary" class="viewer-design-layer-summary">
          A 骨架功能：自动解析（人工标注 > LLM 标注 > OSM/POI）
        </div>
        <div id="viewer-design-furniture-summary" class="viewer-design-layer-summary">
          B 家具主题：由街道家具设计目标决定；不直接改道路骨架。
        </div>
        <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-prompt">
          <span>Extra Notes / 补充要求</span>
          <button class="viewer-help-icon" type="button" data-help="design-prompt" title="了解提示词">?</button>
        </label>
        <textarea id="viewer-design-prompt" class="viewer-design-prompt" rows="3" placeholder="例如：更像校园入口、减少车行感、加强夜间照明"></textarea>
        <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-count">
          <span>Output / 输出数量</span>
          <button class="viewer-help-icon" type="button" data-help="design-schemes" title="了解方案数量">?</button>
        </label>
        <select id="viewer-design-count" class="viewer-select viewer-select-compact">
          <option value="1">生成 1 个方案</option>
          <option value="3">生成 3 个轻微变化方案</option>
        </select>
        <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-template">
          <span>Graph Template</span>
          <button class="viewer-help-icon" type="button" data-help="design-template" title="了解图模板">?</button>
        </label>
        <input id="viewer-design-template" class="viewer-design-input" type="text" value="${DEFAULT_GRAPH_TEMPLATE_ID}" />
        <select id="viewer-design-skeleton-profile" class="viewer-select viewer-select-compact">
          ${profileOptionsHtml(SKELETON_DESIGN_PROFILE_OPTIONS, "自动解析（人工 > LLM > OSM/POI）")}
        </select>
        <select id="viewer-design-furniture-profile" class="viewer-select viewer-select-compact">
          ${profileOptionsHtml(STREET_FURNITURE_PROFILE_OPTIONS, "使用上方街道家具设计目标")}
        </select>
        <div id="viewer-design-status" class="viewer-design-status">Ready to generate.</div>
        <div id="viewer-design-result" class="viewer-design-result"></div>
      </div>
      <div class="viewer-slide-panel-footer">
        <div class="viewer-design-action-sections" aria-label="Design assistant actions">
          <section class="viewer-design-action-section viewer-design-action-section-primary" aria-labelledby="viewer-design-generate-actions-title">
            <div class="viewer-design-action-heading">
              <span id="viewer-design-generate-actions-title">Generate 新建结果</span>
              <small>提交新的场景生成任务</small>
            </div>
            <div class="viewer-design-action-row">
              <button id="viewer-design-generate" class="viewer-nav-button" type="button">Generate & Load / 生成并加载</button>
            </div>
          </section>
        </div>
      </div>
    </aside>
  `;
}

/**
 * Generate Help panel HTML template.
 */
export function createHelpPanelHtml(): string {
  return `
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
                <span class="viewer-help-step-title">任务提交</span>
                <button class="viewer-help-step-detail-btn" type="button" data-detail="queue">详情</button>
              </div>
              <div class="viewer-help-step-content" data-detail-content="queue" hidden>
                <p>你的生成请求会先提交到后端 job service，然后等待 worker 接手执行。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  `;
}
