import type {
  DesignPreset,
  DesignSchemeVariant,
  GenerationStep,
  SceneJobOperation,
  SceneJobStatusPayload,
} from "./viewer-types";
import { clamp, escapeHtml } from "./viewer-utils";
import { configForDesignVariant, describeDesignJobProgress } from "./viewer-design";

export const DESIGN_GENERATION_STEPS: GenerationStep[] = [
  {
    key: "queued",
    label: "任务排队中",
    shortLabel: "排队",
    progress: 5,
    purpose: "任务已经进入后端 job service。当前后端是单 worker 流程，通常不会真正长时间排队。",
    detailHint: "这里记录 job id、提交时间和即将使用的 preset/template。",
  },
  {
    key: "context_resolving",
    label: "上下文解析",
    shortLabel: "上下文",
    progress: 15,
    purpose: "把 prompt、preset、graph template 或外部道路上下文合并成可生成的 StreetComposeConfig。",
    detailHint: "重点看 layout_mode、graph_template_id/reference_plan_id，以及本次方案改动的需求等级和规则 profile。",
  },
  {
    key: "asset_loading",
    label: "资产加载",
    shortLabel: "资产",
    progress: 25,
    purpose: "加载对象 manifest、建筑资产、地面材质、天空环境和检索索引。",
    detailHint: "后端会回传 object_asset_count、building_asset_count 等数量，用来判断素材池是否足够。",
  },
  {
    key: "layout_generation",
    label: "布局生成",
    shortLabel: "布局",
    progress: 40,
    purpose: "把道路图和设计目标转成主题分段、街道断面 program 与候选布局方案。",
    detailHint: "这里能看到 theme_segment_count、道路宽度、密度、行人/自行车/公交/车流需求等参数。",
  },
  {
    key: "constraint_solving",
    label: "约束求解",
    shortLabel: "约束",
    progress: 50,
    purpose: "使用 design_rule_profile 和布局 solver 检查断面、设施带、间距、可通行空间等约束。",
    detailHint: "它不是 LLM 评价，而是规则/求解器层面对空间参数的约束计算。",
  },
  {
    key: "asset_composition",
    label: "资产组合",
    shortLabel: "组合",
    progress: 65,
    purpose: "把求解得到的 slot plan 转成具体资产摆放：树、灯、座椅、站亭、建筑等都在这里落位。",
    detailHint: "重点看 total_slots、placed_slots、placement_count；它回答“放了多少，放到哪里”。",
  },
  {
    key: "mesh_generation",
    label: "网格生成",
    shortLabel: "网格",
    progress: 75,
    purpose: "生成或组装 Three.js 可导出的几何网格，包括道路表面、建筑体块和资产实例。",
    detailHint: "这里的 mesh 不是 LLM 直接生成，而是由布局、资产和几何函数组合出来的 3D 数据。",
  },
  {
    key: "glb_export",
    label: "GLB 导出",
    shortLabel: "导出",
    progress: 88,
    purpose: "把场景几何序列化为 GLB/PLY 文件，供 Viewer 直接加载。",
    detailHint: "这是文件导出步骤；如果 export_format 是 glb，就会产出最终 3D 模型文件。",
  },
  {
    key: "scene_rendering",
    label: "场景渲染",
    shortLabel: "渲染",
    progress: 95,
    purpose: "在导出 GLB 后生成 presentation views、top-down 图和 production steps，供评估和对比页面使用。",
    detailHint: "所以导出后仍需要渲染：Viewer 加载 3D，评价/报告还需要 2D 视图和过程图。",
  },
  {
    key: "finalizing",
    label: "结果整理",
    shortLabel: "整理",
    progress: 99,
    purpose: "写入 scene_layout.json、summary、metrics、render paths 和最终加载入口。",
    detailHint: "这是必要步骤；Viewer 实际加载的是 layout manifest，而不是只加载一个裸 GLB。",
  },
];

export type DesignOperationSummary = {
  message?: string;
  progress?: number;
  detail?: Record<string, unknown>;
};

export function getStepIndex(stage: string): number {
  return DESIGN_GENERATION_STEPS.findIndex((step) => step.key === stage);
}

export function stepForStage(stage: string): GenerationStep {
  return DESIGN_GENERATION_STEPS.find((step) => step.key === stage) ?? DESIGN_GENERATION_STEPS[0]!;
}

function isOperationObject(
  operation: SceneJobOperation,
): operation is {
  name?: string;
  status?: string;
  message?: string;
  stage?: string;
  progress?: number;
  detail?: Record<string, unknown>;
  timestamp?: string;
} {
  return typeof operation === "object" && operation !== null;
}

export function latestOperationForStage(payload: SceneJobStatusPayload, stage: string): DesignOperationSummary | null {
  const operations = payload.operations ?? [];
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const operation = operations[index];
    if (!isOperationObject(operation)) continue;
    if (operation.stage === stage) {
      return {
        message: operation.message || operation.name || operation.status,
        progress: operation.progress,
        detail: operation.detail,
      };
    }
  }
  return null;
}

export function formatDesignDetailKey(key: string): string {
  const labels: Record<string, string> = {
    graph_template_id: "图模板",
    reference_plan_id: "参考方案",
    layout_mode: "布局模式",
    object_asset_count: "对象资产",
    building_asset_count: "建筑资产",
    theme_segment_count: "主题分段",
    total_slots: "资产槽位",
    placed_slots: "已放置槽位",
    placement_count: "最终放置",
    export_format: "导出格式",
    production_step_count: "过程产物",
    layout_path: "布局文件",
    error: "错误",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

export function formatDesignDetailValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatDesignDetailValue(item)).join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  if (value === null || value === undefined || value === "") {
    return "未提供";
  }
  return String(value);
}

export function renderDesignDetailList(detail: Record<string, unknown> | undefined, limit = 6): string {
  const entries = Object.entries(detail ?? {}).filter(([, value]) => value !== undefined && value !== "");
  if (entries.length === 0) {
    return `<div class="viewer-design-workspace-muted">等待后端返回该阶段的具体数据。</div>`;
  }
  return `
    <dl class="viewer-design-detail-list">
      ${entries.slice(0, limit).map(([key, value]) => `
        <div>
          <dt>${escapeHtml(formatDesignDetailKey(key))}</dt>
          <dd>${escapeHtml(formatDesignDetailValue(value))}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function isCoreDiagnosticStage(stage: string): boolean {
  return stage === "context_resolving" || stage === "layout_generation" || stage === "constraint_solving" || stage === "asset_composition";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function renderDiagnosticKeyValues(record: Record<string, unknown>, limit = 24): string {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined && value !== "");
  if (entries.length === 0) return `<div class="viewer-design-workspace-muted">暂无数据。</div>`;
  return `
    <dl class="viewer-design-diagnostic-kv">
      ${entries.slice(0, limit).map(([key, value]) => `
        <div>
          <dt>${escapeHtml(formatDesignDetailKey(key))}</dt>
          <dd>${escapeHtml(formatDesignDetailValue(value))}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderDiagnosticTable(
  rows: Array<Record<string, unknown>>,
  columns: Array<[string, string]>,
  emptyText = "暂无记录。",
): string {
  if (rows.length === 0) return `<div class="viewer-design-workspace-muted">${escapeHtml(emptyText)}</div>`;
  return `
    <div class="viewer-design-diagnostic-table-wrap">
      <table class="viewer-design-diagnostic-table">
        <thead>
          <tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              ${columns.map(([key]) => `<td>${escapeHtml(formatDesignDetailValue(row[key]))}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDiagnosticSection(title: string, body: string): string {
  return `
    <section class="viewer-design-diagnostic-section">
      <h4>${escapeHtml(title)}</h4>
      ${body}
    </section>
  `;
}

function renderLayoutDiagnostic(detail: Record<string, unknown>): string {
  const streetProgram = asRecord(detail.street_program);
  return [
    renderDiagnosticSection("算法与输入", renderDiagnosticKeyValues({
      ...asRecord(detail.algorithm),
      ...asRecord(detail.config_parameters),
    })),
    renderDiagnosticSection(
      "主题分段",
      renderDiagnosticTable(asRecords(detail.theme_segments), [
        ["theme_id", "ID"],
        ["theme_name", "主题"],
        ["x_start_m", "起点 m"],
        ["x_end_m", "终点 m"],
        ["length_m", "长度 m"],
        ["dominant_poi_types", "主导 POI"],
        ["design_rule_profile", "规则"],
      ]),
    ),
    renderDiagnosticSection("生成的街道 Program", renderDiagnosticKeyValues({
      cross_section_type: streetProgram.cross_section_type,
      lane_count: streetProgram.lane_count,
      road_width_m: streetProgram.road_width_m,
      sidewalk_width_m: streetProgram.sidewalk_width_m,
      row_width_m: streetProgram.row_width_m,
      width_expanded: streetProgram.width_expanded,
      width_reallocation_reason: streetProgram.width_reallocation_reason,
      poi_fit_feasible: streetProgram.poi_fit_feasible,
      furniture_requirements: streetProgram.furniture_requirements,
      throughput_requirements: streetProgram.throughput_requirements,
      design_goals: streetProgram.design_goals,
    })),
    renderDiagnosticSection(
      "断面功能带",
      renderDiagnosticTable(asRecords(streetProgram.bands), [
        ["name", "名称"],
        ["kind", "类型"],
        ["side", "侧向"],
        ["width_m", "宽度 m"],
        ["z_center_m", "中心 z"],
        ["allowed_categories", "允许资产"],
      ]),
    ),
  ].join("");
}

function renderConstraintDiagnostic(detail: Record<string, unknown>): string {
  const solver = asRecord(detail.solver_summary);
  return [
    renderDiagnosticSection("Solver 与规则", renderDiagnosticKeyValues({
      ...asRecord(solver.algorithm),
      active_constraints: solver.active_constraints,
      rule_evaluation_counts: solver.rule_evaluation_counts,
    })),
    renderDiagnosticSection("求解结果指标", renderDiagnosticKeyValues(asRecord(solver.metrics))),
    renderDiagnosticSection(
      "功能带求解结果",
      renderDiagnosticTable(asRecords(solver.band_solutions), [
        ["band_name", "功能带"],
        ["band_kind", "类型"],
        ["side", "侧向"],
        ["width_m", "宽度"],
        ["min_width_m", "最小"],
        ["max_width_m", "最大"],
        ["slack_m", "余量"],
        ["active_constraint_names", "约束"],
      ]),
    ),
    renderDiagnosticSection(
      "被拦截/未满足的规则",
      renderDiagnosticTable(asRecords(solver.flagged_rule_evaluations), [
        ["rule_name", "规则"],
        ["status", "状态"],
        ["mode", "模式"],
        ["score", "分数"],
        ["explanation", "说明"],
      ], "没有发现失败规则。"),
    ),
    renderDiagnosticSection(
      "求解器修改与冲突",
      `${renderDiagnosticTable(asRecords(solver.edits), [
        ["action", "动作"],
        ["target", "目标"],
        ["before", "之前"],
        ["after", "之后"],
        ["reason", "原因"],
      ], "没有 solver edit。")}
      ${renderDiagnosticTable(asRecords(solver.conflicts), [
        ["rule_name", "规则"],
        ["severity", "严重性"],
        ["affected_target", "对象"],
        ["message", "说明"],
      ], "没有 unresolved conflict。")}`,
    ),
    renderDiagnosticSection("Slot Plan 汇总", renderDiagnosticKeyValues(asRecord(solver.slot_plan_summary))),
    renderDiagnosticSection(
      "分主题方案",
      renderDiagnosticTable(asRecords(solver.zone_programs), [
        ["theme_id", "主题 ID"],
        ["theme_name", "主题"],
        ["design_rule_profile", "规则"],
        ["cross_section_type", "断面"],
        ["slot_count", "slot"],
        ["backend_used", "Program"],
        ["solver_backend_used", "Solver"],
      ]),
    ),
  ].join("");
}

function renderCompositionDiagnostic(detail: Record<string, unknown>): string {
  const blockerSummary = asRecord(detail.blocker_summary);
  return [
    renderDiagnosticSection("资产落位算法", renderDiagnosticKeyValues(asRecord(detail.algorithm))),
    renderDiagnosticSection("Slot 与落位进度", renderDiagnosticKeyValues({
      ...asRecord(detail.slot_plan_summary),
      ...asRecord(detail.placement_progress),
      category_slot_counts: detail.category_slot_counts,
    })),
    renderDiagnosticSection("拦截器结果", renderDiagnosticKeyValues({
      blocked_reason_counts: blockerSummary.blocked_reason_counts,
      search_tier_counts: blockerSummary.search_tier_counts,
      category_status_counts: blockerSummary.category_status_counts,
    })),
    renderDiagnosticSection(
      "未落位样例",
      renderDiagnosticTable(asRecords(blockerSummary.unplaced_samples), [
        ["slot_id", "Slot"],
        ["category", "类别"],
        ["theme_id", "主题"],
        ["side", "侧向"],
        ["band_name", "功能带"],
        ["failure_reason", "拦截原因"],
        ["blocked_reason_counts", "过滤统计"],
      ], "当前没有未落位样例。"),
    ),
    renderDiagnosticSection("锚点与平衡修复", renderDiagnosticKeyValues({
      anchor_resolution_summary: detail.anchor_resolution_summary,
      balance_repair_summary: detail.balance_repair_summary,
      composition_pass_report: detail.composition_pass_report,
    })),
  ].join("");
}

function renderContextResolvingDiagnostic(detail: Record<string, unknown>): string {
  const layoutMode = String(detail.layout_mode || detail.layoutMode || "graph_template");
  return [
    renderDiagnosticSection("阶段说明", renderDiagnosticKeyValues({
      stage: "context_resolving",
      message: detail.message || "解析设计意图和构建场景上下文",
      layout_mode: layoutMode,
    })),
    renderDiagnosticSection("图模板 / 参考方案", renderDiagnosticKeyValues({
      graph_template_id: detail.graph_template_id || detail.graphTemplateId || "hkust_gz_gate",
      reference_plan_id: detail.reference_plan_id || detail.referencePlanId,
    })),
    renderDiagnosticSection("设计意图", renderDiagnosticKeyValues({
      normalized_scene_query: detail.normalized_scene_query || detail.sceneQuery || detail.scene_query,
      design_summary: detail.design_summary || detail.designSummary,
      target_street_type: detail.target_street_type || detail.targetStreetType,
      objective_profile: detail.objective_profile || detail.objectiveProfile,
      design_rule_profile: detail.design_rule_profile || detail.designRuleProfile,
    })),
    renderDiagnosticSection("需求参数", renderDiagnosticKeyValues({
      density: detail.density,
      ped_demand_level: detail.ped_demand_level || detail.pedDemandLevel,
      bike_demand_level: detail.bike_demand_level || detail.bikeDemandLevel,
      transit_demand_level: detail.transit_demand_level || detail.transitDemandLevel,
      vehicle_demand_level: detail.vehicle_demand_level || detail.vehicleDemandLevel,
      road_width_m: detail.road_width_m || detail.roadWidthM,
      length_m: detail.length_m || detail.lengthM,
      lane_count: detail.lane_count || detail.laneCount,
      sidewalk_width_m: detail.sidewalk_width_m || detail.sidewalkWidthM,
    })),
    renderDiagnosticSection("配置补丁", renderDiagnosticKeyValues(asRecord(detail.config_patch || detail.configPatch || detail.compose_config_patch || detail.composeConfigPatch), 20)),
    renderDiagnosticSection("RAG 引用证据", (() => {
      const citationsField = detail.citations_by_field || detail.citationsByField;
      const citationsRecord = asRecord(citationsField);
      const citationKeys = Object.keys(citationsRecord);
      const totalCitations = citationKeys.reduce((sum, key) => {
        const value = citationsRecord[key];
        if (Array.isArray(value)) return sum + value.length;
        if (typeof value === "string" && value) return sum + 1;
        return sum;
      }, 0);
      const knowledgeSource = String(detail.knowledge_source || detail.knowledgeSource || "graph_rag");
      const evidenceCount = Number(detail.evidence_count || detail.evidenceCount || totalCitations);
      if (evidenceCount === 0) {
        return renderDiagnosticKeyValues({
          citations_count: 0,
          knowledge_source: knowledgeSource,
          status: "RAG 检索未返回结果或已禁用",
        });
      }
      const citationDetails = citationKeys.map((key) => {
        const value = citationsRecord[key];
        const count = Array.isArray(value) ? value.length : (value ? 1 : 0);
        return `${key}: ${count} 条引用`;
      }).join("\n");
      return renderDiagnosticKeyValues({
        citations_count: evidenceCount,
        knowledge_source: knowledgeSource,
        status: evidenceCount > 0 ? "✅ RAG 检索成功" : "❌ 无引用",
        citation_details: citationDetails || "无详细引用",
      });
    })()),
  ].join("");
}

export function renderStageDiagnosticContent(stage: string, detail: Record<string, unknown>): string {
  if (stage === "context_resolving") return renderContextResolvingDiagnostic(detail);
  if (stage === "layout_generation") return renderLayoutDiagnostic(detail);
  if (stage === "constraint_solving") return renderConstraintDiagnostic(detail);
  if (stage === "asset_composition") return renderCompositionDiagnostic(detail);
  return renderDiagnosticSection("Detail", renderDiagnosticKeyValues(detail, 80));
}

export function renderDesignImprovementSummary(
  preset: DesignPreset | null,
  variant: DesignSchemeVariant,
  prompt: string,
  graphTemplateId: string,
): string {
  const configPatch = preset?.configPatch ?? {};
  const config = configForDesignVariant(configPatch, variant);
  const presetLabel = preset ? `${preset.nameEn} / ${preset.name}` : "Custom / LLM-Driven";
  const items = [
    ["预设", presetLabel],
    preset ? ["设计规则", config.design_rule_profile] : null,
    preset ? ["目标 profile", config.objective_profile] : null,
    preset ? ["密度", config.density] : ["密度", "LLM 自动推导"],
    preset ? ["道路宽度", config.road_width_m ? `${config.road_width_m} m` : undefined] : ["道路宽度", "LLM 自动推导"],
    preset ? ["行人需求", config.ped_demand_level] : ["行人需求", "LLM 自动推导"],
    preset ? ["自行车需求", config.bike_demand_level] : ["自行车需求", "LLM 自动推导"],
    preset ? ["公交需求", config.transit_demand_level] : ["公交需求", "LLM 自动推导"],
    preset ? ["车流需求", config.vehicle_demand_level] : ["车流需求", "LLM 自动推导"],
    ["图模板", graphTemplateId],
    ["随机种子", variant.seed],
  ].filter((item): item is [string, string | number] => item !== null && item[1] !== undefined && item[1] !== "");
  return `
    <section class="viewer-design-workspace-panel">
      <div class="viewer-design-workspace-panel-title">本次方案实际改了什么</div>
      <p class="viewer-design-workspace-copy">${escapeHtml(prompt)}</p>
      <div class="viewer-design-improvement-grid">
        ${items.map(([label, value]) => `
          <div class="viewer-design-improvement-item">
            <span>${escapeHtml(String(label))}</span>
            <strong>${escapeHtml(formatDesignDetailValue(value))}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

export function buildDesignStageNodes(payload: SceneJobStatusPayload, currentStage: string, failed: boolean): Array<{
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "failed";
  progress: number;
  stepNumber: number;
}> {
  const currentIndex = Math.max(0, getStepIndex(currentStage));
  return DESIGN_GENERATION_STEPS.map((step, index) => {
    const operation = latestOperationForStage(payload, step.key);
    const state =
      failed && index === currentIndex
        ? "failed"
        : index < currentIndex || step.key === "succeeded"
          ? "completed"
          : index === currentIndex
            ? "active"
            : "pending";
    const percent = typeof operation?.progress === "number" ? operation.progress : step.progress;
    return {
      id: step.key,
      label: `${step.label} · ${Math.round(percent)}%`,
      status: state,
      progress: percent,
      stepNumber: index + 1,
    };
  });
}

export function renderDesignStageCards(payload: SceneJobStatusPayload, currentStage: string, failed: boolean): string {
  const currentIndex = Math.max(0, getStepIndex(currentStage));
  return `
    <div class="viewer-design-stage-grid">
      ${DESIGN_GENERATION_STEPS.map((step, index) => {
        const operation = latestOperationForStage(payload, step.key);
        const state =
          failed && index === currentIndex
            ? "failed"
            : index < currentIndex || step.key === "succeeded"
              ? "completed"
              : index === currentIndex
                ? "active"
                : "pending";
        const percent = typeof operation?.progress === "number" ? operation.progress : step.progress;
        return `
          <article class="viewer-design-stage-card" data-state="${state}">
            <div class="viewer-design-stage-head">
              <span>${escapeHtml(step.shortLabel)}</span>
              <strong>${escapeHtml(step.label)}</strong>
              <em>${Math.round(percent)}%</em>
            </div>
            <p>${escapeHtml(step.purpose)}</p>
            <div class="viewer-design-stage-hint">${escapeHtml(operation?.message || step.detailHint)}</div>
            ${renderDesignDetailList(operation?.detail, state === "active" ? 8 : 3)}
            ${isCoreDiagnosticStage(step.key) ? `
              <button class="viewer-design-stage-detail-button" type="button" data-design-stage-detail="${escapeHtml(step.key)}">
                查看算法详情
              </button>
            ` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

export function renderDesignWorkspaceHtml(
  payload: SceneJobStatusPayload,
  preset: DesignPreset | null,
  variant: DesignSchemeVariant,
  prompt: string,
  graphTemplateId: string,
): { html: string; stage: string; failed: boolean } {
  const { progress, message, stage } = describeDesignJobProgress(payload);
  const failed = payload.status === "failed";
  const step = stepForStage(stage);
  const presetLabel = preset ? `${preset.nameEn}` : "Custom";
  const boundedProgress = clamp(progress, 0, 100);
  return {
    stage,
    failed,
    html: `
      <div class="viewer-design-workspace-shell">
        <header class="viewer-design-workspace-header">
          <div>
            <span class="viewer-design-workspace-kicker">${escapeHtml(variant.name)} · ${escapeHtml(presetLabel)}</span>
            <h2>Design Run</h2>
            <p>${escapeHtml(message)}</p>
          </div>
          <div class="viewer-design-workspace-progress">
            <strong>${Math.round(boundedProgress)}%</strong>
            <span>${escapeHtml(step.label)}</span>
          </div>
        </header>
        <div class="viewer-design-workspace-progressbar" aria-label="Generation progress">
          <div style="width:${boundedProgress}%"></div>
        </div>
        <div class="viewer-design-workspace-layout">
          ${renderDesignImprovementSummary(preset, variant, prompt, graphTemplateId)}
          <section class="viewer-design-workspace-panel">
            <div class="viewer-design-workspace-panel-title">场景生长树</div>
            <div id="viewer-g6-stage-tree"></div>
          </section>
          <section class="viewer-design-workspace-panel">
            <div class="viewer-design-workspace-panel-title">当前阶段在做什么</div>
            <h3>${escapeHtml(step.label)}</h3>
            <p class="viewer-design-workspace-copy">${escapeHtml(step.purpose)}</p>
            <div class="viewer-design-stage-hint">${escapeHtml(step.detailHint)}</div>
            ${renderDesignDetailList(latestOperationForStage(payload, stage)?.detail, 10)}
          </section>
        </div>
        ${renderDesignStageCards(payload, stage, failed)}
      </div>
    `,
  };
}
