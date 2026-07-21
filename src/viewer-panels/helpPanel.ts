export function renderHelpPanelHtml(): string {
  return `
    <aside id="viewer-help-panel" class="viewer-slide-panel" data-open="false">
      <div class="viewer-slide-panel-header">
        <div>
          <div class="viewer-slide-panel-title" data-i18n-key="viewer.help.title">Help</div>
          <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.help.subtitle">Current workflow and operation guidance</div>
        </div>
        <button id="viewer-help-close" class="viewer-settings-close" type="button" aria-label="Close help">x</button>
      </div>
      <div id="viewer-help-content" class="viewer-slide-panel-body">
        <section class="viewer-help-section">
          <h3 class="viewer-help-section-title">当前工作流程</h3>
          <p class="viewer-help-intro">从已校验的 2D 标注出发，生成并查看与当前标注版本一致的 3D 场景。</p>
          <ol class="viewer-help-workflow-list">
            <li><strong>1 · 2D 数据与标注</strong><span>在左侧流程完成并校验道路、区域和标注；只有当前获准 revision 可以生成新的 3D 场景。</span></li>
            <li><strong>2 · 3D 场景生成</strong><span>点击顶部“3D 场景生成”，在生成控制中核对来源与参数，再确认启动生成。</span></li>
            <li><strong>3 · 3D 场景浏览</strong><span>在左侧“3D 场景浏览”查看生成结果和场景控制。修改 2D 标注后，已有场景会保留为旧版浏览对象。</span></li>
          </ol>
        </section>

        <section class="viewer-help-section">
          <h3 class="viewer-help-section-title">审核、评价与调试</h3>
          <div class="viewer-help-fields">
            <div class="viewer-help-field">
              <h4 class="viewer-help-field-title">结果审核与评价</h4>
              <p>顶部“结果审核”和“评价与交付”仅面向与当前 2D 标注一致的 3D 场景。若场景来自较早 revision，入口会说明原因；请重新生成当前场景后再继续。</p>
            </div>
            <div class="viewer-help-field">
              <h4 class="viewer-help-field-title">一致性调试</h4>
              <p>右上角“一致性调试”用于开发与排障，显示转换、拓扑和几何容差指标；这些技术指标不作为普通设计操作的一部分。</p>
            </div>
          </div>
        </section>

        <section class="viewer-help-section">
          <h3 class="viewer-help-section-title">常见问题</h3>
          <div class="viewer-help-faq">
            <details class="viewer-help-faq-item">
              <summary class="viewer-help-faq-question">为什么不能审核或评价？</summary>
              <div class="viewer-help-faq-answer"><p>当前没有可用 3D 场景，或已有场景基于较早的 2D 标注。请先在顶部启动“3D 场景生成”，并完成当前 revision 的生成。</p></div>
            </details>
            <details class="viewer-help-faq-item">
              <summary class="viewer-help-faq-question">修改 2D 标注后，旧 3D 场景会怎样？</summary>
              <div class="viewer-help-faq-answer"><p>旧场景会保留供浏览和对照，但会标记为旧版，不能进入审核或评价，直到新的 3D 场景按当前标注生成。</p></div>
            </details>
            <details class="viewer-help-faq-item">
              <summary class="viewer-help-faq-question">在哪里调整场景视图？</summary>
              <div class="viewer-help-faq-answer"><p>在顶部切换 3D / 2D、重置视图；从左侧“3D 场景浏览”打开当前场景与对应的浏览控制。</p></div>
            </details>
          </div>
        </section>
      </div>
    </aside>
  `;
}
