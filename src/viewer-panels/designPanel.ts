import {
  DEFAULT_GRAPH_TEMPLATE_ID,
  SKELETON_DESIGN_PROFILE_OPTIONS,
  STREET_FURNITURE_PROFILE_OPTIONS,
} from "../viewer-types";
import { escapeHtml } from "../viewer-utils";

function profileOptionsHtml(options: ReadonlyArray<{ id: string; label: string }>, autoLabel: string): string {
  return [
    `<option value="">${escapeHtml(autoLabel)}</option>`,
    ...options.map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`),
  ].join("");
}

export function renderDesignPanelHtml(): string {
  return `
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
            <button id="viewer-design-scenario-preview" class="viewer-nav-button viewer-nav-button-secondary" type="button" disabled title="Open the full structure preview. It shows roads, functional zones, and building massing without street furniture.">Preview Structure + Buildings / 预览结构+建筑</button>
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
              用于查看最近评分样本和 Pareto 结果，不会触发新的生成任务。
            </div>
            <div class="viewer-design-action-row">
              <button id="viewer-design-branch-run" class="viewer-nav-button viewer-nav-button-secondary" type="button">Load Latest Scores / 加载最近评分</button>
              <button id="viewer-design-benchmark" class="viewer-nav-button viewer-nav-button-secondary" type="button">Benchmark Store</button>
              <button id="viewer-design-branch-history" class="viewer-nav-button viewer-nav-button-secondary" type="button">Run History</button>
            </div>
          </details>
        </div>
      </div>
    </aside>
  `;
}
