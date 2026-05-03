import type {
  DesignPreset,
  DesignSchemeVariant,
  GenerationStep,
  GenerationTrace,
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

export function scenarioParameterEvidenceRows(value: unknown): Array<Record<string, unknown>> {
  return asRecords(value)
    .filter(isScenarioParameterEvidence)
    .map((item) => {
      const triple = parseScenarioParameterTriple(item.text);
      return {
        scenario_label: triple.scenario_label || item.section_title || item.chunk_id,
        parameter_name: triple.parameter_name,
        normalized_value: formatTripleValue(triple.normalized_value, triple.unit),
        raw_value: triple.raw_value,
        source_doc: triple.source_doc || item.doc_id,
        section: triple.section || item.section_title,
        confidence: triple.confidence,
        chunk_id: item.chunk_id,
      };
    });
}

function nonScenarioEvidenceRows(value: unknown): Array<Record<string, unknown>> {
  return asRecords(value).filter((item) => !isScenarioParameterEvidence(item));
}

function isScenarioParameterEvidence(item: Record<string, unknown>): boolean {
  return (
    String(item.knowledge_source || "").trim() === "scenario_parameters"
    || String(item.chunk_id || "").startsWith("scenario_parameters::")
  );
}

function parseScenarioParameterTriple(text: unknown): Record<string, unknown> {
  if (typeof text !== "string" || !text.trim()) return {};
  try {
    const payload = JSON.parse(text);
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function formatTripleValue(value: unknown, unit: unknown): string {
  if (value === null) return "null";
  if (value === undefined || value === "") return "";
  const suffix = String(unit ?? "").trim();
  return suffix ? `${formatDesignDetailValue(value)} ${suffix}` : formatDesignDetailValue(value);
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

function renderScenarioParameterEvidenceTable(rows: Array<Record<string, unknown>>): string {
  return renderDiagnosticTable(rows, [
    ["scenario_label", "情景"],
    ["parameter_name", "参数"],
    ["normalized_value", "归一化值"],
    ["raw_value", "原始值"],
    ["source_doc", "来源"],
    ["confidence", "置信度"],
    ["chunk_id", "Chunk"],
  ], "本次未返回结构化参数三元组。");
}

function groupEvidenceBySource(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const grouped = new Map<string, { knowledge_source: string; count: number; best_score: number; chunks: string[] }>();
  for (const row of rows) {
    const source = String(row.knowledge_source || "unknown");
    const existing = grouped.get(source) ?? { knowledge_source: source, count: 0, best_score: 0, chunks: [] };
    existing.count += 1;
    existing.best_score = Math.max(existing.best_score, Number(row.score ?? 0));
    existing.chunks.push(String(row.chunk_id || ""));
    grouped.set(source, existing);
  }
  return [...grouped.values()].map((item) => ({
    ...item,
    best_score: item.best_score ? item.best_score.toFixed(3) : "",
    chunks: item.chunks.filter(Boolean).slice(0, 6).join(", "),
  }));
}

function renderTraceEvidenceTable(rows: Array<Record<string, unknown>>, emptyText: string): string {
  if (rows.length === 0) return `<div class="viewer-design-workspace-muted">${escapeHtml(emptyText)}</div>`;
  return `
    <div class="viewer-design-diagnostic-table-wrap">
      <table class="viewer-design-diagnostic-table">
        <thead>
          <tr>
            <th>Chunk</th>
            <th>章节</th>
            <th>相关度</th>
            <th>来源</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr data-trace-evidence="${escapeHtml(String(row.chunk_id || ""))}">
              <td>${escapeHtml(formatDesignDetailValue(row.chunk_id))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.section_title || row.section))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.score))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.knowledge_source))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.relevance_reason || row.source_path))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTraceScenarioTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return `<div class="viewer-design-workspace-muted">本次没有结构化参数三元组。</div>`;
  return `
    <div class="viewer-design-diagnostic-table-wrap">
      <table class="viewer-design-diagnostic-table">
        <thead>
          <tr>
            <th>情景</th>
            <th>参数</th>
            <th>归一化值</th>
            <th>来源</th>
            <th>置信度</th>
            <th>Chunk</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr data-trace-evidence="${escapeHtml(String(row.chunk_id || ""))}">
              <td>${escapeHtml(formatDesignDetailValue(row.scenario_label))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.parameter_name))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.normalized_value))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.source_doc || row.section))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.confidence))}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.chunk_id))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTraceCitationButtons(value: unknown): string {
  const ids = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);
  if (ids.length === 0) return "none";
  return ids.map((chunkId) => `
    <button class="viewer-trace-citation" type="button" data-trace-citation="${escapeHtml(chunkId)}">
      ${escapeHtml(chunkId)}
    </button>
  `).join("");
}

function renderTraceCitations(citations: Record<string, unknown>, sources: Record<string, unknown>): string {
  const fields = new Set([...Object.keys(citations), ...Object.keys(sources)]);
  const rows = [...fields].sort().map((field) => ({
    field,
    source: sources[field],
    chunk_ids: citations[field],
  }));
  if (rows.length === 0) return `<div class="viewer-design-workspace-muted">暂无字段级引用。</div>`;
  return `
    <div class="viewer-design-diagnostic-table-wrap">
      <table class="viewer-design-diagnostic-table">
        <thead>
          <tr><th>字段</th><th>来源类型</th><th>引用 Chunk</th></tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.field)}</td>
              <td>${escapeHtml(formatDesignDetailValue(row.source))}</td>
              <td>${renderTraceCitationButtons(row.chunk_ids)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTraceProcess(trace: Record<string, unknown>): string {
  const process = asRecord(trace.process);
  const stageTree = asRecords(process.stage_tree);
  const growthNode = asRecord(process.growth_tree_node);
  return [
    Object.keys(growthNode).length > 0
      ? renderDiagnosticSection("生长树节点", renderDiagnosticKeyValues(growthNode))
      : "",
    renderDiagnosticSection("过程阶段树", renderDiagnosticTable(stageTree, [
      ["stage", "阶段"],
      ["label", "事件"],
      ["status", "状态"],
      ["progress", "进度"],
      ["timestamp", "时间"],
    ], "暂无过程阶段。")),
  ].join("");
}

function renderTraceResultEvaluation(trace: Record<string, unknown>): string {
  const result = asRecord(trace.result);
  const evaluation = asRecord(trace.evaluation);
  return [
    renderDiagnosticSection("生成结果", renderDiagnosticKeyValues({
      scene_layout_path: result.scene_layout_path,
      scene_glb_path: result.scene_glb_path,
      scene_ply_path: result.scene_ply_path,
      preview_path: result.preview_path,
      viewer_url: result.viewer_url,
      artifact_dir: result.artifact_dir,
      generation_trace_path: result.generation_trace_path,
    })),
    renderDiagnosticSection("自动评价", renderDiagnosticKeyValues({
      status: evaluation.status,
      overall: evaluation.overall,
      walkability: evaluation.walkability,
      safety: evaluation.safety,
      beauty: evaluation.beauty,
      evaluation: evaluation.evaluation,
      suggestions: evaluation.suggestions,
      error: evaluation.error,
    })),
  ].join("");
}

export function renderGenerationTracePanel(traceValue: unknown, options: { embedded?: boolean } = {}): string {
  const trace = asRecord(traceValue);
  const openTag = options.embedded
    ? `<div class="viewer-generation-trace-panel">`
    : `<section class="viewer-design-workspace-panel viewer-generation-trace-panel">`;
  const closeTag = options.embedded ? `</div>` : `</section>`;
  if (Object.keys(trace).length === 0) {
    return `
      ${openTag}
        <div class="viewer-design-workspace-panel-title">Generation Trace</div>
        <div class="viewer-design-workspace-muted">等待后端返回本次生成的 trace。</div>
      ${closeTag}
    `;
  }
  const typedTrace = trace as GenerationTrace;
  const provenance = asRecord(typedTrace.provenance);
  const llm = asRecord(typedTrace.llm_recommendation);
  const evidenceRows = asRecords(provenance.rag_evidence);
  const structuredRows = scenarioParameterEvidenceRows(evidenceRows);
  const structuredIds = new Set(structuredRows.map((row) => String(row.chunk_id || "")));
  const regularRows = evidenceRows.filter((row) => (
    String(row.knowledge_source || "") !== "scenario_parameters"
    && !structuredIds.has(String(row.chunk_id || ""))
  ));
  const configPatch = asRecord(llm.config_patch);
  return `
    ${openTag}
      <div class="viewer-design-workspace-panel-title">Generation Trace</div>
      ${renderDiagnosticSection("溯源总览", `
        ${renderDiagnosticKeyValues({
          trace_status: trace.status,
          knowledge_source: provenance.knowledge_source,
          evidence_count: provenance.evidence_count || evidenceRows.length,
          rag_queries: provenance.rag_queries,
          schema_version: trace.schema_version,
        })}
        ${renderDiagnosticTable(groupEvidenceBySource(evidenceRows), [
          ["knowledge_source", "知识源"],
          ["count", "数量"],
          ["best_score", "最高相关度"],
          ["chunks", "代表 Chunk"],
        ], "暂无 RAG evidence。")}
      `)}
      ${renderDiagnosticSection("字段引用", renderTraceCitations(
        asRecord(provenance.citations_by_field),
        asRecord(provenance.parameter_sources_by_field),
      ))}
      ${renderDiagnosticSection("普通 RAG Evidence", renderTraceEvidenceTable(regularRows, "本次没有普通 PDF/GraphRAG 证据。"))}
      ${renderDiagnosticSection("结构化参数三元组", renderTraceScenarioTable(structuredRows))}
      ${renderDiagnosticSection("LLM 推荐结果", `
        ${renderDiagnosticKeyValues({
          normalized_scene_query: llm.normalized_scene_query,
          design_summary: llm.design_summary,
          derivation_status: llm.derivation_status,
          raw_fields: llm.raw_fields,
          defaulted_fields: llm.defaulted_fields,
          overridden_fields: llm.overridden_fields,
          risk_notes: llm.risk_notes,
        })}
        ${renderDiagnosticTable(Object.entries(configPatch).map(([key, value]) => ({ parameter: key, value })), [
          ["parameter", "参数"],
          ["value", "推荐值"],
        ], "暂无 LLM config patch。")}
      `)}
      ${renderTraceProcess(trace)}
      ${renderTraceResultEvaluation(trace)}
    ${closeTag}
  `;
}

function renderRagEvidenceDiagnosticSections(detail: Record<string, unknown>): string {
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
  const evidenceRows = asRecords(detail.rag_evidence || detail.ragEvidence);
  const structuredRows = scenarioParameterEvidenceRows(evidenceRows);
  const regularRows = nonScenarioEvidenceRows(evidenceRows);
  const evidenceCount = Number(detail.evidence_count || detail.evidenceCount || evidenceRows.length || totalCitations);
  const citationDetails = citationKeys.map((key) => {
    const value = citationsRecord[key];
    const count = Array.isArray(value) ? value.length : (value ? 1 : 0);
    return `${key}: ${count} 条引用`;
  }).join("\n");
  const summary = renderDiagnosticKeyValues({
    citations_count: totalCitations || undefined,
    evidence_count: evidenceCount || undefined,
    standard_rag_count: regularRows.length,
    structured_triple_count: structuredRows.length,
    knowledge_source: knowledgeSource,
    status: evidenceCount > 0 ? "✅ RAG 检索成功" : "RAG 检索未返回结果或已禁用",
    citation_details: citationDetails || undefined,
  });
  return [
    renderDiagnosticSection("RAG 引用证据", `
      ${summary}
      ${renderDiagnosticTable(regularRows, [
        ["chunk_id", "Chunk"],
        ["section_title", "章节"],
        ["score", "相关度"],
        ["knowledge_source", "来源"],
      ], "本次没有普通 PDF/GraphRAG 证据。")}
    `),
    renderDiagnosticSection("结构化参数三元组", renderScenarioParameterEvidenceTable(structuredRows)),
  ].join("");
}

function firstPresent(...values: unknown[]): unknown {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    return value;
  }
  return undefined;
}

function fallbackText(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || "no fallback";
}

function listText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => formatDesignDetailValue(item)).join(", ") : "none";
  }
  const text = String(value ?? "").trim();
  return text || "none";
}

function scaleSummaryRows(value: unknown): Array<Record<string, unknown>> {
  const summary = asRecord(value);
  return Object.entries(summary)
    .filter(([category, item]) => category !== "_diagnostics" && Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map(([category, item]) => ({
      category,
      ...asRecord(item),
    }) as Record<string, unknown>)
    .sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0));
}

function renderCourseDeliverySummary(payload: SceneJobStatusPayload): string {
  const result = asRecord(payload.result);
  const summary = asRecord(result.summary);
  const composeConfig = asRecord(result.compose_config);
  const contextDetail = asRecord(latestOperationForStage(payload, "context_resolving")?.detail);
  const configPatch = asRecord(firstPresent(
    contextDetail.config_patch,
    contextDetail.configPatch,
    contextDetail.compose_config_patch,
    contextDetail.composeConfigPatch,
  ));
  const layoutDetail = asRecord(latestOperationForStage(payload, "layout_generation")?.detail);
  const layoutAlgorithm = asRecord(layoutDetail.algorithm);
  const constraintDetail = asRecord(latestOperationForStage(payload, "constraint_solving")?.detail);
  const solver = asRecord(constraintDetail.solver_summary);
  const solverAlgorithm = asRecord(solver.algorithm);
  const solverMetrics = asRecord(solver.metrics);
  const slotPlanSummary = asRecord(solver.slot_plan_summary);
  const compositionDetail = asRecord(latestOperationForStage(payload, "asset_composition")?.detail);
  const placementProgress = asRecord(compositionDetail.placement_progress);
  const assetScaleSummary = asRecord(summary.asset_scale_summary);
  const assetScaleDiagnostics = asRecord(assetScaleSummary._diagnostics);
  const scaleRows = scaleSummaryRows(assetScaleSummary);
  const hasFinalSummary = Object.keys(summary).length > 0;

  return `
    <section class="viewer-design-workspace-panel">
      <div class="viewer-design-workspace-panel-title">布局器设置与结果</div>
      ${renderDiagnosticSection("课程主链路", renderDiagnosticKeyValues({
        pipeline: "Viewer design -> graph_template -> hybrid_milp_v1 -> GLB + scene_layout.json -> screenshots -> unified evaluation",
        final_summary: hasFinalSummary ? "ready" : "waiting",
        layout_mode: firstPresent(summary.layout_mode, contextDetail.layout_mode, composeConfig.layout_mode, "graph_template"),
        objective_profile: firstPresent(summary.objective_profile, configPatch.objective_profile, composeConfig.objective_profile),
        design_rule_profile: firstPresent(summary.design_rule_profile, configPatch.design_rule_profile, composeConfig.design_rule_profile),
        program_generator_requested: firstPresent(summary.program_generator_requested, layoutAlgorithm.program_generator_requested, configPatch.program_generator, composeConfig.program_generator),
        program_generator_used: firstPresent(summary.program_generator_used, layoutAlgorithm.program_generator_used),
        layout_solver_requested: firstPresent(summary.layout_solver_requested, summary.solver_backend_requested, solverAlgorithm.solver_backend_requested, configPatch.layout_solver, composeConfig.layout_solver),
        layout_solver_used: firstPresent(summary.layout_solver_used, summary.solver_backend_used, solverAlgorithm.solver_backend_used),
        allow_solver_fallback: firstPresent(configPatch.allow_solver_fallback, composeConfig.allow_solver_fallback, true),
        solver_fallback_reason: fallbackText(firstPresent(summary.solver_fallback_reason, solverAlgorithm.fallback_reason)),
      }))}
      ${renderDiagnosticSection("求解质量", renderDiagnosticKeyValues({
        rule_satisfaction_rate: firstPresent(summary.rule_satisfaction_rate, solverMetrics.rule_satisfaction_rate),
        topology_validity: firstPresent(summary.topology_validity, solverMetrics.topology_validity),
        cross_section_feasibility: firstPresent(summary.cross_section_feasibility, solverMetrics.cross_section_feasibility),
        editability: firstPresent(summary.editability, solverMetrics.editability),
        conflict_explainability: firstPresent(summary.conflict_explainability, solverMetrics.conflict_explainability),
        band_solution_count: firstPresent(summary.band_solution_count, countArrayItems(solver.band_solutions)),
        total_slots: firstPresent(slotPlanSummary.total_slots, placementProgress.total_slots),
        placed_count: firstPresent(placementProgress.placed_count, summary.instance_count),
        dropped_slots: firstPresent(summary.dropped_slots, placementProgress.dropped_slots),
        dropped_slot_rate: summary.dropped_slot_rate,
      }))}
      ${renderDiagnosticSection(
        "Band Solutions",
        renderDiagnosticTable(asRecords(solver.band_solutions).slice(0, 12), [
          ["band_name", "功能带"],
          ["band_kind", "类型"],
          ["side", "侧向"],
          ["width_m", "宽度"],
          ["slack_m", "余量"],
          ["active_constraint_names", "约束"],
        ], "等待 solver band_solutions。"),
      )}
      ${renderDiagnosticSection(
        "Slot Plan 样例",
        renderDiagnosticTable(asRecords(slotPlanSummary.sample_slots).slice(0, 10), [
          ["slot_id", "Slot"],
          ["category", "类别"],
          ["theme_id", "主题"],
          ["band_name", "功能带"],
          ["side", "侧向"],
          ["x_center_m", "x"],
          ["z_center_m", "z"],
          ["required", "Required"],
        ], "等待 slot plan 样例。"),
      )}
      ${renderDiagnosticSection("视觉素材设置", renderDiagnosticKeyValues({
        scene_texture_mode: firstPresent(summary.scene_texture_mode, configPatch.scene_texture_mode, composeConfig.scene_texture_mode),
        scene_texture_pack: summary.scene_texture_pack,
        scene_texture_fallback_used: summary.scene_texture_fallback_used,
        scene_texture_missing_assets: listText(summary.scene_texture_missing_assets),
        selected_ground_material_backend: summary.selected_ground_material_backend,
        selected_ground_materials: summary.selected_ground_materials,
        asset_curation_mode: firstPresent(summary.asset_curation_mode, configPatch.asset_curation_mode, composeConfig.asset_curation_mode),
        curated_street_assets_profile: firstPresent(summary.curated_street_assets_profile, configPatch.curated_street_assets_profile, composeConfig.curated_street_assets_profile),
      }))}
      ${renderDiagnosticSection("资产尺度证据", `
        ${renderDiagnosticKeyValues({
          asset_scale_mode: firstPresent(summary.asset_scale_mode, configPatch.asset_scale_mode, composeConfig.asset_scale_mode),
          building_asset_rejected_size_mismatch_count: assetScaleDiagnostics.building_asset_rejected_size_mismatch_count,
          procedural_building_fallback_count: assetScaleDiagnostics.procedural_building_fallback_count,
        })}
        ${renderDiagnosticTable(scaleRows.slice(0, 14), [
          ["category", "类别"],
          ["count", "数量"],
          ["median_scale", "中位缩放"],
          ["min_scale", "最小"],
          ["max_scale", "最大"],
          ["fallback_count", "fallback"],
          ["source_scale_rejected_count", "源尺度拒绝"],
          ["scale_gate_failed_count", "尺度门失败"],
        ], "最终 summary 写入后显示资产尺度统计。")}
      `)}
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
    renderRagEvidenceDiagnosticSections(detail),
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
  nodeType?: "stage" | "artifact";
  stageId?: string;
  children?: Array<{
    id: string;
    label: string;
    status: "pending" | "active" | "completed" | "failed";
    progress: number;
    stepNumber: number;
    nodeType: "artifact";
    stageId: string;
  }>;
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
      nodeType: "stage",
      stageId: step.key,
      children: buildStageArtifactNodes(step.key, operation?.detail, state, percent),
    };
  });
}

function buildStageArtifactNodes(
  stage: string,
  detail: Record<string, unknown> | undefined,
  status: "pending" | "active" | "completed" | "failed",
  progress: number,
): Array<{
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "failed";
  progress: number;
  stepNumber: number;
  nodeType: "artifact";
  stageId: string;
}> {
  const items = summarizeStageArtifacts(stage, detail);
  return items.slice(0, 4).map((label, index) => ({
    id: `artifact:${stage}:${index}`,
    label,
    status,
    progress,
    stepNumber: index + 1,
    nodeType: "artifact",
    stageId: stage,
  }));
}

function summarizeStageArtifacts(stage: string, detail: Record<string, unknown> | undefined): string[] {
  const record = detail ?? {};
  if (Object.keys(record).length === 0) return [];
  const summaries: string[] = [];
  const push = (label: string, value: unknown): void => {
    if (value === undefined || value === null || value === "") return;
    summaries.push(`${label}: ${formatCompactArtifactValue(value)}`);
  };

  if (stage === "context_resolving") {
    push("上下文", record.layout_mode || record.graph_template_id || record.reference_plan_id);
    push("设计规则", record.design_rule_profile || record.objective_profile);
    push("参数补丁", countObjectKeys(record.config_patch || record.compose_config_patch));
    push("RAG 证据", record.evidence_count || countObjectKeys(record.citations_by_field));
    return summaries;
  }

  if (stage === "asset_loading") {
    push("对象资产", record.object_asset_count);
    push("建筑资产", record.building_asset_count);
    push("资产类别", countObjectKeys(record.inventory_category_counts || record.category_counts));
    return summaries;
  }

  if (stage === "layout_generation") {
    push("主题分段", record.theme_segment_count || countArrayItems(record.theme_segments));
    push("街道 program", summarizeProgram(record.street_program));
    push("道路参数", record.config_parameters);
    push("资产库存", countObjectKeys(record.inventory_category_counts));
    return summaries;
  }

  if (stage === "constraint_solving") {
    const solver = asRecord(record.solver_summary);
    push("约束规则", countArrayItems(record.active_constraint_names) || solver.rule_count);
    push("求解器", solver.backend_used || solver.solver_backend_used || asRecord(record.algorithm).solver_backend_requested);
    push("slot plan", solver.slot_count || solver.total_slots || solver.slot_plan_count);
    push("约束结果", solver.violation_count ?? solver.conflict_count ?? solver.status);
    return summaries;
  }

  if (stage === "asset_composition") {
    const progressRecord = asRecord(record.placement_progress);
    push("资产槽位", record.total_slots || progressRecord.total_slots);
    push("已落位", record.placed_slots || progressRecord.placed_count);
    push("拦截/失败", summarizeBlockers(record.blocker_summary));
    push("类别分布", countObjectKeys(record.category_slot_counts || progressRecord.placed_counts_by_category));
    return summaries;
  }

  if (stage === "mesh_generation") {
    push("网格产物", record.mesh_count || record.geometry_count || record.generated_meshes);
    push("实例", record.instance_count || record.placement_count);
    return summaries;
  }

  if (stage === "glb_export") {
    push("导出格式", record.export_format);
    push("GLB", record.scene_glb || record.glb_path || record.output_path);
    return summaries;
  }

  if (stage === "scene_rendering") {
    push("过程产物", record.production_step_count || countArrayItems(record.production_step_ids));
    push("渲染视图", record.rendered_view_count || countArrayItems(record.rendered_views));
    return summaries;
  }

  if (stage === "finalizing") {
    push("布局文件", record.layout_path);
    push("过程步骤", record.production_step_count || countArrayItems(record.production_step_ids));
    push("最终入口", record.final_production_step_id || record.default_selection);
    return summaries;
  }

  return Object.entries(record)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${formatDesignDetailKey(key)}: ${formatCompactArtifactValue(value)}`);
}

function countArrayItems(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function countObjectKeys(value: unknown): number | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>).length
    : undefined;
}

function summarizeProgram(value: unknown): string | undefined {
  const program = asRecord(value);
  if (Object.keys(program).length === 0) return undefined;
  const bandCount = countArrayItems(program.bands);
  const crossSection = program.cross_section_type || program.crossSectionType;
  if (bandCount !== undefined && crossSection) return `${crossSection}, ${bandCount} bands`;
  if (bandCount !== undefined) return `${bandCount} bands`;
  return formatCompactArtifactValue(program);
}

function summarizeBlockers(value: unknown): string | undefined {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return undefined;
  const total = record.dropped_slots || record.failure_count || record.total_blocked || record.blocked_count;
  const reasonCount = countObjectKeys(record.reason_counts || record.blocked_reason_counts);
  if (total !== undefined && reasonCount !== undefined) return `${total} blocked, ${reasonCount} reasons`;
  if (total !== undefined) return String(total);
  if (reasonCount !== undefined) return `${reasonCount} reasons`;
  return formatCompactArtifactValue(record);
}

function formatCompactArtifactValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "string") {
    return value.length > 42 ? `${value.slice(0, 39)}...` : value;
  }
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
      .slice(0, 3);
    return entries.map(([key, entry]) => `${formatDesignDetailKey(key)}=${formatCompactArtifactValue(entry)}`).join(", ");
  }
  return formatDesignDetailValue(value);
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
        const compactMessage = operation?.message || step.detailHint;
        return `
          <details class="viewer-design-stage-card" data-state="${state}">
            <summary class="viewer-design-stage-summary">
              <div class="viewer-design-stage-head">
                <span>${escapeHtml(step.shortLabel)}</span>
                <strong>${escapeHtml(step.label)}</strong>
                <em>${Math.round(percent)}%</em>
              </div>
              <div class="viewer-design-stage-compact">${escapeHtml(compactMessage)}</div>
            </summary>
            <div class="viewer-design-stage-expanded">
              <p>${escapeHtml(step.purpose)}</p>
              <div class="viewer-design-stage-hint">${escapeHtml(compactMessage)}</div>
              ${renderDesignDetailList(operation?.detail, state === "active" ? 8 : 3)}
              ${isCoreDiagnosticStage(step.key) ? `
                <button class="viewer-design-stage-detail-button" type="button" data-design-stage-detail="${escapeHtml(step.key)}">
                  查看算法详情
                </button>
              ` : ""}
            </div>
          </details>
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
          <div class="viewer-design-workspace-header-actions">
            <button class="viewer-design-workspace-close" type="button" data-design-workspace-close aria-label="Close Design Run" title="Close Design Run">×</button>
            <div class="viewer-design-workspace-progress">
              <strong>${Math.round(boundedProgress)}%</strong>
              <span>${escapeHtml(step.label)}</span>
            </div>
          </div>
        </header>
        <div class="viewer-design-workspace-progressbar" aria-label="Generation progress">
          <div style="width:${boundedProgress}%"></div>
        </div>
        <div class="viewer-design-workspace-layout">
          ${renderDesignImprovementSummary(preset, variant, prompt, graphTemplateId)}
          ${renderCourseDeliverySummary(payload)}
          ${renderGenerationTracePanel(payload.trace)}
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
