import {
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

function strategyTab(id: string, index: string, label: string, controls: string): string {
  return `
    <button
      id="viewer-generation-strategy-tab-${id}"
      class="viewer-generation-subtab"
      type="button"
      role="tab"
      aria-selected="${id === "assets" ? "true" : "false"}"
      aria-controls="${controls}"
      tabindex="${id === "assets" ? "0" : "-1"}"
      data-generation-strategy-tab="${id}"
      data-status="pending"
    ><span>${index}</span><strong>${label}</strong><i aria-hidden="true"></i></button>
  `;
}

export function renderDesignPanelHtml(): string {
  return `
    <section
      id="viewer-generation-page-source"
      class="viewer-generation-primary-panel"
      role="tabpanel"
      aria-labelledby="viewer-generation-tab-source"
      data-generation-primary-panel="source"
    >
      <div class="viewer-generation-page-intro">
        <span>01 / SOURCE CONTRACT</span>
        <h3>核对输入来源</h3>
        <p>生成始终基于当前已批准的 ReferenceAnnotation；道路或拓扑需要修改时返回 01A。</p>
      </div>
      <div class="viewer-generation-source-board">
        <section>
          <small>来源状态</small>
          <strong id="viewer-generation-source-summary">Current professional generation settings</strong>
        </section>
        <section>
          <small>来源类型</small>
          <strong id="viewer-generation-source-kind">尚未加载</strong>
        </section>
        <section>
          <small>批准版本</small>
          <strong id="viewer-generation-source-revision">—</strong>
        </section>
      </div>
      <section class="viewer-generation-source-detail" aria-labelledby="viewer-generation-source-counts-title">
        <header>
          <div><small>REFERENCE ANNOTATION</small><strong id="viewer-generation-source-counts-title">标注对象</strong></div>
          <button id="viewer-generation-edit-source" type="button">返回 01A 修改</button>
        </header>
        <div id="viewer-generation-source-counts" class="viewer-generation-source-counts"></div>
        <div id="viewer-generation-source-warnings" class="viewer-generation-source-warnings" role="status"></div>
      </section>
    </section>

    <section
      id="viewer-generation-page-strategy"
      class="viewer-generation-primary-panel"
      role="tabpanel"
      aria-labelledby="viewer-generation-tab-strategy"
      data-generation-primary-panel="strategy"
      hidden
    >
      <header class="viewer-generation-strategy-head">
        <div>
          <span>02 / GENERATION STRATEGY</span>
          <strong id="viewer-generation-strategy-summary">Parameterized generation</strong>
        </div>
        <p id="viewer-generation-strategy-mode">根据服务能力选择 LLM 辅助或确定性参数化生成。</p>
      </header>
      <div class="viewer-generation-subtabs" role="tablist" aria-label="生成策略子页面">
        ${strategyTab("assets", "01", "3D 素材", "viewer-generation-strategy-assets")}
        ${strategyTab("structure", "02", "场景结构", "viewer-generation-strategy-structure")}
        ${strategyTab("furniture", "03", "家具目标", "viewer-generation-strategy-furniture")}
        ${strategyTab("notes", "04", "补充要求", "viewer-generation-strategy-notes")}
        ${strategyTab("matrix", "05", "方案矩阵", "viewer-generation-strategy-matrix")}
      </div>

      <aside id="viewer-design-panel" class="viewer-generation-strategy-workspace">
        <section
          id="viewer-generation-strategy-assets"
          class="viewer-generation-strategy-panel"
          role="tabpanel"
          aria-labelledby="viewer-generation-strategy-tab-assets"
          data-generation-strategy-panel="assets"
        >
          <fieldset class="viewer-generation-asset-policy" id="viewer-generation-asset-policy">
            <legend>3D 素材准备</legend>
            <p>确认与已批准 2D 标注汇合的素材来源。候选仓库仅参与检索，不保证最终采用。</p>
            <label>
              <input type="radio" name="viewer-generation-asset-policy" value="current_manifest" />
              <span><strong>使用当前候选资产仓库</strong><small>在已启用清单中检索可参与生成的树木与街道设施。</small></span>
            </label>
            <label>
              <input type="radio" name="viewer-generation-asset-policy" value="default_transparent_massing" />
              <span><strong>使用默认素材与透明建筑白模</strong><small>跳过自定义素材准备；建筑继续作为透明上下文。</small></span>
            </label>
            <section class="viewer-generation-candidate-repository" aria-labelledby="viewer-generation-candidate-title">
              <header>
                <strong id="viewer-generation-candidate-title">本次候选资产仓库</strong>
                <button id="viewer-generation-edit-candidates" type="button">返回 01B 调整</button>
              </header>
              <div id="viewer-generation-candidate-summary"></div>
              <div id="viewer-generation-candidate-list"></div>
              <p>候选资产只进入检索池，不保证出现在最终场景中。</p>
            </section>
            <div id="viewer-generation-readiness" class="viewer-generation-readiness" data-tone="warning" role="status"></div>
          </fieldset>
        </section>

        <section
          id="viewer-generation-strategy-structure"
          class="viewer-generation-strategy-panel viewer-design-flow-section"
          role="tabpanel"
          aria-labelledby="viewer-generation-strategy-tab-structure"
          data-generation-strategy-panel="structure"
          hidden
        >
          <div class="viewer-design-flow-heading">
            <span>02</span><div><strong>场景结构</strong><small>ReferenceAnnotation 模式默认保持已批准道路与拓扑。</small></div>
          </div>
          <label class="viewer-settings-label" for="viewer-design-scenario"><span>Street Structure / 街道结构</span></label>
          <select id="viewer-design-scenario" class="viewer-select viewer-select-compact"><option value="">保持已批准标注</option></select>
          <div id="viewer-design-scenario-meta" class="viewer-design-scenario-meta">保持已批准标注；Graph Template 模式需明确选择模板。</div>
          <div id="viewer-design-skeleton-summary" class="viewer-design-layer-summary">A 骨架功能：自动解析（人工标注 &gt; LLM 标注 &gt; OSM/POI）</div>
          <div class="viewer-design-scenario-actions">
            <button id="viewer-design-scenario-preview" class="viewer-nav-button viewer-nav-button-secondary" type="button" disabled>预览结构与建筑</button>
            <button id="viewer-design-scenario-annotation" class="viewer-nav-button viewer-nav-button-secondary" type="button" disabled>打开标注</button>
          </div>
          <details class="viewer-design-advanced-details viewer-design-structure-draft">
            <summary>从一句话创建临时结构</summary>
            <div class="viewer-design-scenario-draft">
              <label class="viewer-settings-label" for="viewer-design-scenario-draft-prompt"><span>结构描述</span></label>
              <textarea id="viewer-design-scenario-draft-prompt" class="viewer-design-scenario-draft-prompt" rows="3" placeholder="例如：道路中段右侧加公交站，绿色铺装"></textarea>
              <label class="viewer-design-scenario-llm-toggle"><input id="viewer-design-scenario-use-llm" type="checkbox" checked /><span>使用 LLM 语义解析；不可用时回退确定性编译</span></label>
              <div class="viewer-design-scenario-draft-actions">
                <button id="viewer-design-scenario-draft" class="viewer-nav-button viewer-nav-button-secondary" type="button">生成结构草案</button>
                <button id="viewer-design-scenario-use-draft" class="viewer-nav-button viewer-nav-button-secondary" type="button" disabled>采用此结构草案</button>
              </div>
              <div id="viewer-design-scenario-draft-result" class="viewer-design-scenario-draft-result" data-tone="empty">先生成可验证的临时结构，再选择采用。</div>
            </div>
          </details>
          <div class="viewer-generation-return-note"><strong>需要改变道路中心线或拓扑？</strong><button type="button" data-generation-return-source>返回 01A 标注</button></div>
        </section>

        <section
          id="viewer-generation-strategy-furniture"
          class="viewer-generation-strategy-panel viewer-design-flow-section"
          role="tabpanel"
          aria-labelledby="viewer-generation-strategy-tab-furniture"
          data-generation-strategy-panel="furniture"
          hidden
        >
          <div class="viewer-design-flow-heading"><span>03</span><div><strong>街道家具设计目标</strong><small>设置密度、设施优先级和风格，不直接修改道路拓扑。</small></div></div>
          <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-preset"><span>Street Furniture Design Goal / 街道家具设计目标</span><button class="viewer-help-icon" type="button" data-help="design-preset">?</button></label>
          <select id="viewer-design-preset" class="viewer-select viewer-select-compact"><option value="__custom__">Custom / LLM-Driven（自定义）</option></select>
          <div id="viewer-design-furniture-summary" class="viewer-design-layer-summary">B 家具主题：由街道家具设计目标决定。</div>
          <details class="viewer-design-advanced-details">
            <summary>高级语义覆盖</summary>
            <label class="viewer-settings-label" for="viewer-design-skeleton-profile"><span>A Skeleton Override / 骨架功能覆盖</span></label>
            <select id="viewer-design-skeleton-profile" class="viewer-select viewer-select-compact">${profileOptionsHtml(SKELETON_DESIGN_PROFILE_OPTIONS, "自动解析（人工 > LLM > OSM/POI）")}</select>
            <label class="viewer-settings-label" for="viewer-design-furniture-profile"><span>B Furniture Override / 家具主题覆盖</span></label>
            <select id="viewer-design-furniture-profile" class="viewer-select viewer-select-compact">${profileOptionsHtml(STREET_FURNITURE_PROFILE_OPTIONS, "使用上方街道家具设计目标")}</select>
          </details>
        </section>

        <section
          id="viewer-generation-strategy-notes"
          class="viewer-generation-strategy-panel viewer-design-flow-section"
          role="tabpanel"
          aria-labelledby="viewer-generation-strategy-tab-notes"
          data-generation-strategy-panel="notes"
          hidden
        >
          <div class="viewer-design-flow-heading"><span>04</span><div><strong>补充要求（可选）</strong><small>只写额外偏好，不需要重复已经批准的结构。</small></div></div>
          <label class="viewer-settings-label viewer-settings-label-with-help" for="viewer-design-prompt"><span>Extra Notes / 补充要求</span><button class="viewer-help-icon" type="button" data-help="design-prompt">?</button></label>
          <textarea id="viewer-design-prompt" class="viewer-design-prompt" rows="6" placeholder="例如：减少车行感，加强夜间照明，并优先保留连续树荫。"></textarea>
          <div class="viewer-design-prompt-hint">可留空；LLM 不可用时，这些要求会尽可能映射到参数化规则。</div>
        </section>

        <section
          id="viewer-generation-strategy-matrix"
          class="viewer-generation-strategy-panel viewer-design-flow-section viewer-design-matrix-section"
          role="tabpanel"
          aria-labelledby="viewer-generation-strategy-tab-matrix"
          data-generation-strategy-panel="matrix"
          hidden
        >
          <div class="viewer-design-flow-heading"><span>05</span><div><strong>结构 × 家具方案矩阵</strong><small>专家实验工具；不影响普通生成的完成条件。</small></div></div>
          <div class="viewer-generation-expert-note">矩阵单元拥有独立生成任务。点击已有结果可加载预览；点击缺失单元按需生成。</div>
          <div id="viewer-design-matrix" class="viewer-design-matrix" data-state="empty"><div class="viewer-design-matrix-empty">Matrix status will appear here.</div></div>
        </section>
      </aside>
    </section>

    <section
      id="viewer-generation-page-output"
      class="viewer-generation-primary-panel"
      role="tabpanel"
      aria-labelledby="viewer-generation-tab-output"
      data-generation-primary-panel="output"
      hidden
    >
      <div class="viewer-generation-page-intro">
        <span>03 / OUTPUT &amp; RUN</span>
        <h3>确认输出并启动生成</h3>
        <p>提交时冻结来源、候选资产和参数；每个成功结果创建新的场景版本，不覆盖当前场景。</p>
      </div>
      <div class="viewer-generation-output-grid">
        <section class="viewer-generation-output-settings">
          <label class="viewer-settings-label" for="viewer-design-count"><span>Output / 输出数量</span></label>
          <select id="viewer-design-count" class="viewer-select viewer-select-compact"><option value="1">生成 1 个方案</option><option value="3">生成 3 个轻微变化方案</option></select>
          <label class="viewer-settings-label" for="viewer-design-seed"><span>Base Seed / 基础随机种子</span></label>
          <input id="viewer-design-seed" class="viewer-design-input" type="number" step="1" value="42" />
          <details class="viewer-design-advanced-details viewer-generation-template-settings">
            <summary>Graph Template / 本地模板设置</summary>
            <label class="viewer-settings-label" for="viewer-design-template"><span>Graph Template ID</span></label>
            <input id="viewer-design-template" class="viewer-design-input" type="text" value="" placeholder="选择或输入明确的模板 ID" />
          </details>
        </section>
        <section class="viewer-generation-output-contract" aria-labelledby="viewer-generation-output-summary-title">
          <header><small>FROZEN GENERATION SPEC</small><strong id="viewer-generation-output-summary-title">本次生成配置</strong></header>
          <div id="viewer-generation-output-summary"></div>
        </section>
      </div>
      <div class="viewer-design-status-row">
        <div id="viewer-design-status" class="viewer-design-status" role="status">Ready to generate.</div>
        <button id="viewer-design-review-run" class="viewer-design-review-run" type="button" disabled>查看上次生成过程</button>
      </div>
      <div id="viewer-design-result" class="viewer-design-result" aria-live="polite"></div>
      <div class="viewer-generation-run-actions">
        <button id="viewer-generation-cancel-job" class="viewer-nav-button viewer-nav-button-secondary" type="button" hidden>取消任务</button>
        <button id="viewer-generation-retry" class="viewer-nav-button viewer-nav-button-secondary" type="button" hidden>重试生成</button>
        <button id="viewer-generation-reload-result" class="viewer-nav-button viewer-nav-button-secondary" type="button" hidden>重新载入结果</button>
      </div>
      <details class="viewer-design-advanced-details viewer-design-analysis-details">
        <summary>Advanced Analysis / 高级分析</summary>
        <div class="viewer-design-trace-hint">查看最近评分样本和 Pareto 结果，不会触发新的生成任务。</div>
        <div class="viewer-design-action-row">
          <button id="viewer-design-branch-run" class="viewer-nav-button viewer-nav-button-secondary" type="button">加载最近评分</button>
          <button id="viewer-design-benchmark" class="viewer-nav-button viewer-nav-button-secondary" type="button">Benchmark Store</button>
          <button id="viewer-design-branch-history" class="viewer-nav-button viewer-nav-button-secondary" type="button">Run History</button>
        </div>
      </details>
    </section>

    <footer class="viewer-generation-dialog-footer">
      <div class="viewer-generation-footer-position"><span id="viewer-generation-step-position">01 / 07</span><small>可以直接点击任意标签切换</small></div>
      <div class="viewer-generation-footer-actions">
        <button id="viewer-generation-back" class="viewer-nav-button viewer-nav-button-secondary" type="button">上一步</button>
        <button id="viewer-generation-next" class="viewer-nav-button viewer-nav-button-secondary" type="button">下一步</button>
        <button id="viewer-design-generate" class="viewer-nav-button" type="button" hidden>确认生成并加载</button>
      </div>
    </footer>
  `;
}
