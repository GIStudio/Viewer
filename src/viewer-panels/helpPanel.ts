type HelpStep = {
  id: string;
  number: number;
  title: string;
  body: string;
};

const generationSteps: HelpStep[] = [
  {
    id: "queue",
    number: 1,
    title: "任务提交",
    body: `
      <p>你的生成请求会先提交到后端 job service，然后等待 worker 接手执行。</p>
      <p><strong>为什么这里可能短暂等待？</strong> 场景生成是计算密集型任务，当前 worker 会按顺序处理请求。</p>
    `,
  },
  {
    id: "context",
    number: 2,
    title: "上下文解析",
    body: `
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
    `,
  },
  {
    id: "asset",
    number: 3,
    title: "资产加载",
    body: `
      <p>根据解析出的需求，系统会从资产清单（Manifest）中加载对应的 3D 模型，包括树木、路灯、座椅、公交站等街道家具。</p>
      <p><strong>资产从哪里来？</strong> 资产存储在 <code>data/real_assets_manifest.jsonl</code> 中，每个资产都有分类、描述和 CLIP 文本嵌入向量用于语义检索。</p>
    `,
  },
  {
    id: "layout",
    number: 4,
    title: "布局生成",
    body: `
      <p>系统会根据场景结构生成街道骨架，包括道路宽度、车道数量、人行道宽度和功能区等基础空间结构。</p>
      <p><strong>场景结构从哪里来？</strong> 可以来自基础图模板、已保存的 Scenario Design，也可以来自一句话创建的临时结构。</p>
    `,
  },
  {
    id: "constraint",
    number: 5,
    title: "约束求解",
    body: `
      <p>系统会检查布局是否满足设计规则（Design Rules）和合规性要求，例如人行道最小宽度、车道间距、无障碍通行等。</p>
      <p><strong>不满足约束怎么办？</strong> 系统会自动调整布局以尝试满足约束，如果无法完全满足，会在结果中标记违规项。</p>
    `,
  },
  {
    id: "composition",
    number: 6,
    title: "资产组合",
    body: `
      <p>系统会使用 CLIP 语义检索，将加载的 3D 资产智能地放置到街道场景中，包括放置位置、旋转角度和缩放比例。</p>
      <p><strong>放置策略是什么？</strong> 系统支持规则策略（Rule-based）和学习策略（Learned policy），会根据资产类别、道路功能区（Strip）和 POI 兴趣点进行布局。</p>
    `,
  },
  {
    id: "mesh",
    number: 7,
    title: "网格生成",
    body: `
      <p>所有资产放置完成后，系统会将它们合并为完整的 3D 场景网格（Mesh），包括道路铺装、人行道、建筑体块和所有街道家具。</p>
      <p><strong>这一步做什么？</strong> 将离散的 3D 模型整合为统一的场景几何体，为后续的光照计算和渲染做准备。</p>
    `,
  },
  {
    id: "render",
    number: 8,
    title: "场景渲染",
    body: `
      <p>系统会应用光照、材质、阴影和色调映射（Tone Mapping），生成最终的可视觉化场景。</p>
      <p><strong>光照从哪里来？</strong> 场景使用三点照明系统：主光源（Key Light）、补光（Fill Light）和环境光（Ambient），配合曝光和色温调节。</p>
    `,
  },
  {
    id: "export",
    number: 9,
    title: "GLB 导出",
    body: `
      <p>渲染完成后，系统会将场景导出为 GLB 格式（Binary glTF），这是一种高效的 3D 场景文件格式。</p>
      <p><strong>为什么用 GLB？</strong> GLB 格式将所有资源（几何体、材质、纹理）打包为单一文件，便于网络传输和 Three.js 加载。</p>
    `,
  },
  {
    id: "organize",
    number: 10,
    title: "结果整理",
    body: `
      <p>最后，系统会生成 <code>scene_layout.json</code> 文件，包含所有资产的放置信息、场景统计数据和生产步骤（Production Steps）。</p>
      <p><strong>生产步骤是什么？</strong> 生产步骤记录了场景构建的中间过程，你可以在 Viewer 中逐步查看道路基础 → 建筑 → 家具 → 最终预览的各个阶段。</p>
    `,
  },
];

function renderHelpStep(step: HelpStep): string {
  return `
    <div class="viewer-help-step" data-step="${step.id}">
      <div class="viewer-help-step-header">
        <span class="viewer-help-step-number">${step.number}</span>
        <span class="viewer-help-step-title">${step.title}</span>
        <button class="viewer-help-step-detail-btn" type="button" data-detail="${step.id}">详情</button>
      </div>
      <div class="viewer-help-step-content" data-detail-content="${step.id}" hidden>
        ${step.body}
      </div>
    </div>
  `;
}

export function renderHelpPanelHtml(): string {
  return `
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
            ${generationSteps.map(renderHelpStep).join("")}
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
  `;
}
