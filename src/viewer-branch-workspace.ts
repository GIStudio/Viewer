import type { BranchInfluenceRow, BranchRunNode, BranchRunStatusPayload, BranchScatterPoint } from "./viewer-types";
import { DEFAULT_GRAPH_TEMPLATE_ID } from "./viewer-types";
import { clamp, escapeHtml } from "./viewer-utils";
import { renderGenerationTracePanel, scenarioParameterEvidenceRows } from "./viewer-design-workspace";

function formatDesignDetailKey(key: string): string {
  const labels: Record<string, string> = {
    layout_path: "布局文件",
    error: "错误",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function formatDesignDetailValue(value: unknown): string {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function restorableGlbPath(node: BranchRunNode): string {
  const explicit = String(node.scene_glb_path || "").trim();
  if (explicit) return explicit;
  const artifact = (node.artifact_paths || []).find((item) => String(item || "").trim().toLowerCase().endsWith(".glb"));
  return artifact ? String(artifact).trim() : "";
}

const SCATTER_COLOR_FEATURES = [
  ["", "Overall / Preset"],
  ["__generation_method", "Generation method"],
  ["scene.tree_count", "Tree count"],
  ["scene.sidewalk_width_m", "Sidewalk width"],
  ["scene.road_width_m", "Road width"],
  ["input.density", "Input density"],
  ["input.building_density", "Input building density"],
  ["scene.rule_satisfaction_rate", "Rule satisfaction"],
  ["derived.tree_count_per_100m", "Trees per 100m"],
  ["derived.sidewalk_to_road_ratio", "Sidewalk / road"],
] as const;

function branchPointFeatureValue(point: BranchScatterPoint, feature: string): number | null {
  if (feature === "__generation_method") return 1;
  const features = point.analysis_features ?? {};
  const [group, key] = feature.split(".", 2);
  const record = group === "input" ? features.input : group === "scene" ? features.scene : group === "derived" ? features.derived : undefined;
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function renderScatterColorControl(points: BranchScatterPoint[]): string {
  const options = SCATTER_COLOR_FEATURES.filter(([feature]) => (
    !feature || points.some((point) => branchPointFeatureValue(point, feature) !== null)
  ));
  if (options.length <= 1) return "";
  return `
    <label class="viewer-branch-color-control">
      <span>Color by</span>
      <select data-branch-color-by>
        ${options.map(([feature, label]) => `<option value="${escapeHtml(feature)}">${escapeHtml(label)}</option>`).join("")}
      </select>
    </label>
  `;
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

export function branchNodes(payload: BranchRunStatusPayload): BranchRunNode[] {
  return [...(payload.nodes ?? [])].sort((a, b) => (
    a.depth - b.depth
    || Number(b.score ?? -Infinity) - Number(a.score ?? -Infinity)
    || a.rank - b.rank
  ));
}

export function selectedBranchNode(
  payload: BranchRunStatusPayload,
  selectedBranchNodeId: string | null,
): BranchRunNode | null {
  const nodes = branchNodes(payload);
  if (selectedBranchNodeId) {
    const selected = nodes.find((node) => node.node_id === selectedBranchNodeId);
    if (selected) return selected;
  }
  if (payload.best_node_id) {
    const best = nodes.find((node) => node.node_id === payload.best_node_id);
    if (best) return best;
  }
  return nodes[0] ?? null;
}

export function formatBranchScore(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `${Math.round(value)}`;
}

function formatInfluenceMetric(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return `${Math.round(value * 100) / 100}`;
}

function formatInfluenceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map((item) => formatInfluenceValue(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sortedInfluenceRows(rows: BranchInfluenceRow[]): BranchInfluenceRow[] {
  return [...rows].sort((a, b) => (
    Number(Boolean(b.active)) - Number(Boolean(a.active))
    || Number(b.score ?? b.confidence ?? 0) - Number(a.score ?? a.confidence ?? 0)
    || Number(a.rank ?? 0) - Number(b.rank ?? 0)
    || String(a.label).localeCompare(String(b.label))
  ));
}

function renderInfluenceColumn(rows: BranchInfluenceRow[], title: string, emptyText: string): string {
  const sorted = sortedInfluenceRows(rows);
  return `
    <div class="viewer-branch-influence-column">
      <h4>${escapeHtml(title)}</h4>
      ${sorted.length === 0 ? `<div class="viewer-design-workspace-muted">${escapeHtml(emptyText)}</div>` : `
        <div class="viewer-branch-influence-list">
          ${sorted.slice(0, 18).map((row) => {
            const metric = formatInfluenceMetric(row.score ?? row.confidence);
            const value = formatInfluenceValue(row.value);
            const oldValue = formatInfluenceValue(row.old_value);
            const delta = oldValue && value && oldValue !== value ? `${oldValue} -> ${value}` : value;
            return `
              <article class="viewer-branch-influence-row" data-active="${row.active ? "true" : "false"}">
                <div>
                  <span>${escapeHtml(row.source_type || "source")}</span>
                  ${metric ? `<em>${escapeHtml(metric)}</em>` : ""}
                </div>
                <strong>${escapeHtml(row.label || row.field || row.id)}</strong>
                ${delta ? `<small>${escapeHtml(delta)}${row.unit ? ` ${escapeHtml(row.unit)}` : ""}</small>` : ""}
                ${row.detail ? `<p>${escapeHtml(row.detail)}</p>` : ""}
              </article>
            `;
          }).join("")}
        </div>
      `}
    </div>
  `;
}

export function renderBranchInfluenceMatrix(node: BranchRunNode | null): string {
  if (!node) return `<div class="viewer-design-workspace-muted">选择一个散点或分支节点查看激活来源。</div>`;
  const rows = node.influence_rows ?? [];
  const knowledge = rows.filter((row) => row.group === "knowledge");
  const parameters = rows.filter((row) => row.group === "parameters");
  const llm = rows.filter((row) => row.group === "llm_constraints");
  return `
    <div class="viewer-branch-influence-matrix">
      ${renderInfluenceColumn(knowledge, "Knowledge / RAG", "该节点没有普通 RAG evidence。")}
      ${renderInfluenceColumn(parameters, "Parameter Triples", "该节点没有结构化参数三元组。")}
      ${renderInfluenceColumn(llm, "Search Changes & Constraints", "该节点没有搜索修改或约束记录。")}
    </div>
  `;
}

export function renderBranchTree(payload: BranchRunStatusPayload, selectedId: string | null): string {
  const nodes = branchNodes(payload);
  if (nodes.length === 0) return `<div class="viewer-design-workspace-muted">等待分支节点生成。</div>`;
  const bestId = payload.best_node_id ?? "";
  const paretoIds = new Set(payload.pareto_front ?? []);
  return `
    <div class="viewer-branch-tree">
      ${nodes.map((node) => `
        <button
          class="viewer-branch-node"
          data-branch-node="${escapeHtml(node.node_id)}"
          data-depth="${escapeHtml(String(node.depth))}"
          data-status="${escapeHtml(node.status)}"
          data-selected="${node.node_id === selectedId ? "true" : "false"}"
          data-pareto="${paretoIds.has(node.node_id) ? "true" : "false"}"
          type="button"
        >
          <span>D${node.depth} · #${node.rank}</span>
          <strong>${escapeHtml(node.node_id)}${node.node_id === bestId ? " · Best" : ""}${paretoIds.has(node.node_id) ? " · Pareto" : ""}</strong>
          <small>${escapeHtml(node.status)} · score ${escapeHtml(formatBranchScore(node.score))}</small>
        </button>
      `).join("")}
    </div>
  `;
}

export function renderBranchScatter(payload: BranchRunStatusPayload, selectedId: string | null): string {
  const points = payload.scatter_points ?? [];
  if (points.length === 0) {
    return `<div class="viewer-design-workspace-muted">等待评价结果生成三维散点图。</div>`;
  }
  const completePoints = points.filter((point) => (
    typeof (point.walkability ?? point.x) === "number"
    && typeof (point.safety ?? point.y) === "number"
    && typeof (point.beauty ?? point.z) === "number"
  ));
  const paretoCount = payload.pareto_front_size ?? completePoints.filter((point) => point.is_pareto_front).length;
  const earlyStopText = payload.early_stop_triggered ? "early stopped" : "running frontier";
  const retainedText = payload.retain_topk_artifacts
    ? `${payload.retained_artifact_count ?? 0}/${payload.retain_topk_artifacts} assets kept`
    : "";
  return `
    <div class="viewer-branch-scatter-wrap">
      <div class="viewer-branch-scatter-meta">
        <span>${escapeHtml(payload.search_mode === "pareto" ? "Pareto surface" : "LLM branch")}</span>
        <span>auto-scaled axes</span>
        ${payload.score_with_rendered_views ? `<span>visual LLM scoring</span>` : ""}
        <span>${escapeHtml(String(completePoints.length))} 3D points</span>
        <span>${escapeHtml(String(paretoCount))} Pareto front</span>
        ${retainedText ? `<span>${escapeHtml(retainedText)}</span>` : ""}
        <span>${escapeHtml(String(payload.completed_samples ?? completePoints.length))}/${escapeHtml(String(payload.target_samples ?? points.length))} scored</span>
        ${payload.early_stop_patience ? `<span>${escapeHtml(earlyStopText)} · patience ${escapeHtml(String(payload.early_stop_patience))}</span>` : ""}
        <span>selected ${escapeHtml(selectedId || "best")}</span>
        ${renderScatterColorControl(completePoints)}
      </div>
      <div class="viewer-branch-scatter" data-branch-score-scatter></div>
      <div class="viewer-branch-score-tooltip" data-branch-score-tooltip hidden></div>
    </div>
  `;
}

export function renderBranchNodeDetail(node: BranchRunNode | null): string {
  if (!node) return `<div class="viewer-design-workspace-muted">选择一个分支节点查看细节。</div>`;
  const evaluation = asRecord(node.evaluation);
  const llmStatus = asRecord(evaluation.llm_status);
  const safetyLlm = asRecord(llmStatus.safety);
  const beautyLlm = asRecord(llmStatus.beauty);
  const fallback = asRecord(evaluation.branch_score_fallback);
  const sceneGlbPath = restorableGlbPath(node);
  const canRestoreArtifact = Boolean(
    node.scene_layout_path
    && (node.can_restore_artifact === true || (node.can_restore_artifact === undefined && sceneGlbPath) || sceneGlbPath),
  );
  const canLoadOrRebuildArtifact = Boolean(node.scene_layout_path);
  const loadableLayoutPath = canLoadOrRebuildArtifact ? node.scene_layout_path || "" : "";
  const loadButtonLabel = canRestoreArtifact ? "Load Scene" : "Rebuild + Load Scene";
  return `
    <div class="viewer-branch-detail">
      <div class="viewer-branch-detail-actions">
        ${canLoadOrRebuildArtifact ? `
          <button class="viewer-design-stage-detail-button" type="button" data-branch-load="${escapeHtml(loadableLayoutPath)}" data-branch-glb="${escapeHtml(sceneGlbPath)}">${escapeHtml(loadButtonLabel)}</button>
        ` : ""}
      </div>
      ${renderDiagnosticSection("评价结果", renderDiagnosticKeyValues({
        status: node.status,
        score: node.score,
        walkability: evaluation.walkability,
        safety: evaluation.safety,
        beauty: evaluation.beauty,
        overall: evaluation.overall,
        safety_visual_llm: safetyLlm.available === true ? "available" : "not run / unavailable",
        beauty_visual_llm: beautyLlm.available === true ? "available" : "not run / unavailable",
        branch_score_fallback: Object.keys(fallback).length ? "structural proxy used for batch axes" : "not used",
        artifacts_retained: node.artifacts_retained ? `yes · rank ${node.artifact_rank ?? ""}` : "no",
        can_restore_artifact: node.can_restore_artifact ? "yes" : "no",
        artifact_restore_mode: canRestoreArtifact ? "glb retained" : (node.scene_layout_path ? "layout rebuild" : "none"),
        retained_glb_path: sceneGlbPath,
        error: node.error,
      }))}
      ${renderGenerationTracePanel(node.trace, { embedded: true })}
      ${renderDiagnosticSection("搜索候选与实际参数", `
        <p class="viewer-design-workspace-copy">${escapeHtml(node.llm_candidate_reasoning || "无搜索候选说明。")}</p>
        ${renderDiagnosticKeyValues(asRecord(node.config_patch), 28)}
      `)}
      ${renderDiagnosticSection("Rule-Based 优化方向", renderDiagnosticTable(asRecords(node.optimization_directives), [
        ["directive_id", "Directive"],
        ["target_metric", "目标"],
        ["direction", "方向"],
        ["allowed_fields", "允许字段"],
        ["risk", "风险"],
      ], "该节点尚未生成优化方向。"))}
      ${renderDiagnosticSection("搜索修改拦截", renderDiagnosticTable(asRecords(node.rejected_edits), [
        ["field", "字段"],
        ["value", "候选值"],
        ["reason", "拦截原因"],
      ], "没有被拦截的修改。"))}
      ${(() => {
        const structuredRows = scenarioParameterEvidenceRows(node.rag_evidence);
        const structuredChunkIds = new Set(structuredRows.map((item) => String(item.chunk_id || "")));
        const regularRows = asRecords(node.rag_evidence).filter((item) => (
          String(item.knowledge_source || "") !== "scenario_parameters"
          && !structuredChunkIds.has(String(item.chunk_id || ""))
        ));
        return `
          ${renderDiagnosticSection("RAG 证据", renderDiagnosticTable(regularRows, [
            ["chunk_id", "Chunk"],
            ["section_title", "章节"],
            ["score", "相关度"],
            ["knowledge_source", "来源"],
          ], "该节点没有普通 PDF/GraphRAG 证据。"))}
          ${renderDiagnosticSection("结构化参数三元组", renderDiagnosticTable(structuredRows, [
            ["scenario_label", "情景"],
            ["parameter_name", "参数"],
            ["normalized_value", "归一化值"],
            ["raw_value", "原始值"],
            ["source_doc", "来源"],
            ["confidence", "置信度"],
            ["chunk_id", "Chunk"],
          ], "该节点没有结构化参数三元组。"))}
        `;
      })()}
    </div>
  `;
}

export function renderBranchWorkspaceHtml(
  payload: BranchRunStatusPayload,
  selected: BranchRunNode | null,
  fallbackPrompt: string,
): string {
  const progress = Math.round(clamp(Number(payload.progress ?? 0), 0, 100));
  const modeLabel = payload.search_mode === "pareto" ? "Pareto Search" : "Branch Run";
  const title = payload.search_mode === "pareto" ? "Pareto Surface Trace" : "100 Sample Trace";
  return `
    <div class="viewer-design-workspace-shell">
      <header class="viewer-design-workspace-header">
        <div>
          <span class="viewer-design-workspace-kicker">${escapeHtml(modeLabel)} · Top-${escapeHtml(String(payload.topk ?? 3))} · ${escapeHtml(payload.graph_template_id ?? DEFAULT_GRAPH_TEMPLATE_ID)}</span>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(payload.prompt ?? fallbackPrompt)}</p>
          ${payload.early_stop_triggered ? `<p class="viewer-design-workspace-muted">${escapeHtml(payload.early_stop_reason || "Early stop triggered.")}</p>` : ""}
        </div>
        <div class="viewer-design-workspace-header-actions">
          <button class="viewer-design-workspace-close" type="button" data-design-workspace-close aria-label="Close Pareto Trace" title="Close Pareto Trace">×</button>
          <div class="viewer-design-workspace-progress">
            <strong>${progress}%</strong>
            <span>${escapeHtml(payload.stage || payload.status)}</span>
          </div>
        </div>
      </header>
      <div class="viewer-design-workspace-progressbar" aria-label="Branch run progress">
        <div style="width:${progress}%"></div>
      </div>
      <div class="viewer-branch-layout">
        <section class="viewer-design-workspace-panel">
          <div class="viewer-design-workspace-panel-title">分支树</div>
          ${renderBranchTree(payload, selected?.node_id ?? null)}
        </section>
        <section class="viewer-design-workspace-panel">
          <div class="viewer-design-workspace-panel-title">激活来源 / 搜索限制</div>
          ${renderBranchInfluenceMatrix(selected)}
        </section>
        <section class="viewer-design-workspace-panel viewer-branch-score-panel">
          <div class="viewer-design-workspace-panel-title">Pareto 曲面 / 三维评分</div>
          ${renderBranchScatter(payload, selected?.node_id ?? null)}
        </section>
        <section class="viewer-design-workspace-panel viewer-branch-detail-panel">
          <div class="viewer-design-workspace-panel-title">节点详情</div>
          ${renderBranchNodeDetail(selected)}
        </section>
      </div>
    </div>
  `;
}

export function renderBranchRunResultsHtml(payload: BranchRunStatusPayload): string {
  const readyNodes = branchNodes(payload).filter((node) => node.status === "succeeded" && node.scene_layout_path);
  if (readyNodes.length === 0) {
    return `<div class="viewer-design-workspace-muted">No branch scene is ready yet.</div>`;
  }
  return `
    <div class="viewer-design-schemes">
      ${readyNodes.map((node) => `
        <button class="viewer-design-scheme" type="button" data-layout-path="${escapeHtml(node.scene_layout_path || "")}" data-scene-glb="${escapeHtml(restorableGlbPath(node))}">
          <span>
            <strong>D${node.depth} · #${node.rank} · ${escapeHtml(node.node_id)}</strong>
            <small>score ${escapeHtml(formatBranchScore(node.score))} · ${escapeHtml(node.scene_layout_path || "")}</small>
          </span>
          <em>Load</em>
        </button>
      `).join("")}
    </div>
  `;
}
