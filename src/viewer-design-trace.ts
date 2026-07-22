import type {
  DesignPreset,
  DesignSemanticSummary,
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
    label: "任务提交",
    shortLabel: "提交",
    progress: 5,
    purpose: "任务已经提交到后端 job service，等待 worker 接手执行。",
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
    purpose: "把道路图和街道家具设计目标转成主题分段、街道断面 program 与候选布局方案。",
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
    progress: 96,
    purpose: "写入 scene_layout.json、summary、metrics、render paths 和最终加载入口。",
    detailHint: "这是必要步骤；Viewer 实际加载的是 layout manifest，而不是只加载一个裸 GLB。",
  },
  {
    key: "evaluation",
    label: "自动评价",
    shortLabel: "评估",
    progress: 99,
    purpose: "读取刚写出的 scene_layout.json 并计算 walkability、safety、beauty 等统一评价。",
    detailHint: "这一步已经不在排队；场景文件已生成，后端正在补齐评价摘要和 trace。",
  },
  {
    key: "succeeded",
    label: "生成完成",
    shortLabel: "完成",
    progress: 100,
    purpose: "场景已经生成并可加载到 Viewer。",
    detailHint: "结果已准备好，Viewer 会加载首个可用方案。",
  },
];

export type DesignOperationSummary = {
  message?: string;
  progress?: number;
  detail?: Record<string, unknown>;
};

export function getStepIndex(stage: string): number {
  const normalized = String(stage || "").trim();
  const directIndex = DESIGN_GENERATION_STEPS.findIndex((step) => step.key === normalized);
  if (directIndex >= 0) return directIndex;
  if (normalized === "running" || normalized === "processing") {
    return DESIGN_GENERATION_STEPS.findIndex((step) => step.key === "context_resolving");
  }
  if (normalized === "graph_parsing") {
    return DESIGN_GENERATION_STEPS.findIndex((step) => step.key === "layout_generation");
  }
  if (normalized === "failed") {
    return DESIGN_GENERATION_STEPS.findIndex((step) => step.key === "succeeded");
  }
  return DESIGN_GENERATION_STEPS.findIndex((step) => step.key === "evaluation");
}

export function stepForStage(stage: string): GenerationStep {
  const normalized = String(stage || "").trim();
  const directStep = DESIGN_GENERATION_STEPS.find((step) => step.key === normalized);
  if (directStep) return directStep;
  const fallback = DESIGN_GENERATION_STEPS[getStepIndex(normalized)] ?? DESIGN_GENERATION_STEPS[0]!;
  const label = normalized
    ? normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    : fallback.label;
  return {
    key: normalized || fallback.key,
    label,
    shortLabel: "阶段",
    progress: fallback.progress,
    purpose: "后端上报了一个 Viewer 尚未单独建模的生成阶段。",
    detailHint: "请查看当前 operation message 和阶段详情；它不会再被显示成任务提交阶段。",
  };
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

export function isCoreDiagnosticStage(stage: string): boolean {
  return stage === "context_resolving" || stage === "layout_generation" || stage === "constraint_solving" || stage === "asset_composition";
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function asRecords(value: unknown): Array<Record<string, unknown>> {
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

export function renderDiagnosticKeyValues(record: Record<string, unknown>, limit = 24): string {
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

export function renderDiagnosticTable(
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

export function renderDiagnosticSection(title: string, body: string): string {
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

function renderTraceParameterDecisions(decisionsValue: unknown): string {
  const decisions = asRecord(decisionsValue);
  const rows = Object.entries(decisions).sort(([left], [right]) => left.localeCompare(right)).map(([field, value]) => {
    const decision = asRecord(value);
    const overridden = asRecords(decision.overridden_candidates).map((item) => `${item.source}: ${formatDesignDetailValue(item.value)}`);
    const rejected = asRecords(decision.rejected_candidates).map((item) => `${item.source}: ${formatDesignDetailValue(item.value)}`);
    return {
      field,
      value: decision.value,
      source: decision.source,
      citations: decision.citations,
      overridden: overridden.join(" / "),
      rejected: rejected.join(" / "),
    };
  });
  return renderDiagnosticTable(rows, [
    ["field", "字段"],
    ["value", "最终值"],
    ["source", "决策来源"],
    ["citations", "证据"],
    ["overridden", "被覆盖候选"],
    ["rejected", "低优先级候选"],
  ], "暂无字段级参数决策。");
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
      ${renderDiagnosticSection("最终字段决策", renderTraceParameterDecisions(
        provenance.parameter_decisions_by_field || llm.parameter_decisions_by_field,
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

export function renderRagEvidenceDiagnosticSections(detail: Record<string, unknown>): string {
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
