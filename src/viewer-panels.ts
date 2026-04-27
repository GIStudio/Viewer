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

import { DEFAULT_GRAPH_TEMPLATE_ID, VIEWER_DESIGN_PRESETS } from "./viewer-types";

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
          <div class="viewer-slide-panel-subtitle">Generate a scene and load it directly in Viewer</div>
        </div>
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
        <button id="viewer-design-generate" class="viewer-nav-button" type="button">Generate & Load</button>
        <button id="viewer-design-branch-run" class="viewer-nav-button viewer-nav-button-secondary" type="button">Branch Run</button>
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
                <span class="viewer-help-step-title">任务排队中</span>
                <button class="viewer-help-step-detail-btn" type="button" data-detail="queue">详情</button>
              </div>
              <div class="viewer-help-step-content" data-detail-content="queue" hidden>
                <p>你的生成请求被提交到后端服务后会进入排队状态。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  `;
}
