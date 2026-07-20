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
          <strong id="viewer-generation-strategy-summary">确定性参数化生成</strong>
        </div>
        <p id="viewer-generation-strategy-mode">直接调整可解释参数；生成不调用 LLM 或 RAG。</p>
      </header>
      <div class="viewer-generation-subtabs" role="tablist" aria-label="生成策略子页面">
        ${strategyTab("assets", "01", "3D 素材", "viewer-generation-strategy-assets")}
        ${strategyTab("skeleton", "02", "道路骨架", "viewer-generation-strategy-skeleton")}
        ${strategyTab("furniture", "03", "家具参数", "viewer-generation-strategy-furniture")}
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
          id="viewer-generation-strategy-skeleton"
          class="viewer-generation-strategy-panel viewer-design-flow-section"
          role="tabpanel"
          aria-labelledby="viewer-generation-strategy-tab-skeleton"
          data-generation-strategy-panel="skeleton"
          hidden
        >
          <div class="viewer-design-flow-heading">
            <span>02</span><div><strong>道路骨架参数</strong><small>中心线与拓扑保持锁定；只改变横断面、圆角、中岛和公交承载带。</small></div>
          </div>
          <div id="viewer-parameter-skeleton-controls" class="viewer-parameter-control-host" aria-live="polite"></div>
        </section>

        <section
          id="viewer-generation-strategy-furniture"
          class="viewer-generation-strategy-panel viewer-design-flow-section"
          role="tabpanel"
          aria-labelledby="viewer-generation-strategy-tab-furniture"
          data-generation-strategy-panel="furniture"
          hidden
        >
          <div class="viewer-design-flow-heading"><span>03</span><div><strong>家具参数</strong><small>逐类开启并调整数量、间距、退界和风格。</small></div></div>
          <div id="viewer-parameter-furniture-controls" class="viewer-parameter-control-host" aria-live="polite"></div>
        </section>
      </aside>
      <section class="viewer-parameter-summary-board"><div id="viewer-parameter-summary" class="viewer-parameter-summary" aria-live="polite"></div></section>
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
          <div class="viewer-generation-fixed-output"><span>输出方式</span><strong>生成 1 个确定性场景版本</strong><small>同一来源、参数和 seed 会得到相同结果。</small></div>
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
      <div class="viewer-generation-footer-position"><span id="viewer-generation-step-position">01 / 05</span><small>可以直接点击任意标签切换</small></div>
      <div class="viewer-generation-footer-actions">
        <button id="viewer-generation-back" class="viewer-nav-button viewer-nav-button-secondary" type="button">上一步</button>
        <button id="viewer-generation-next" class="viewer-nav-button viewer-nav-button-secondary" type="button">下一步</button>
        <button id="viewer-design-generate" class="viewer-nav-button" type="button" hidden>生成参数化方案</button>
      </div>
    </footer>

    <div hidden aria-hidden="true">
      <select id="viewer-design-count"><option value="1">1</option></select>
      <select id="viewer-design-preset"><option value="__custom__">custom</option></select><textarea id="viewer-design-prompt"></textarea>
      <select id="viewer-design-scenario"><option value=""></option></select><div id="viewer-design-scenario-meta"></div><div id="viewer-design-skeleton-summary"></div>
      <button id="viewer-design-scenario-preview"></button><button id="viewer-design-scenario-annotation"></button><textarea id="viewer-design-scenario-draft-prompt"></textarea><input id="viewer-design-scenario-use-llm" type="checkbox"/><button id="viewer-design-scenario-draft"></button><button id="viewer-design-scenario-use-draft"></button><div id="viewer-design-scenario-draft-result"></div>
      <select id="viewer-design-skeleton-profile"><option value=""></option></select><select id="viewer-design-furniture-profile"><option value=""></option></select><div id="viewer-design-furniture-summary"></div><div id="viewer-design-matrix"></div>
    </div>
  `;
}
