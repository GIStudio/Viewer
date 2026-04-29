import type { BranchRunNode, BranchRunStatusPayload } from "./viewer-types";
import { DEFAULT_GRAPH_TEMPLATE_ID } from "./viewer-types";
import { clamp, escapeHtml } from "./viewer-utils";

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

export function renderBranchTree(payload: BranchRunStatusPayload, selectedId: string | null): string {
  const nodes = branchNodes(payload);
  if (nodes.length === 0) return `<div class="viewer-design-workspace-muted">等待分支节点生成。</div>`;
  const bestId = payload.best_node_id ?? "";
  return `
    <div class="viewer-branch-tree">
      ${nodes.map((node) => `
        <button
          class="viewer-branch-node"
          data-branch-node="${escapeHtml(node.node_id)}"
          data-depth="${escapeHtml(String(node.depth))}"
          data-status="${escapeHtml(node.status)}"
          data-selected="${node.node_id === selectedId ? "true" : "false"}"
          type="button"
        >
          <span>D${node.depth} · #${node.rank}</span>
          <strong>${escapeHtml(node.node_id)}${node.node_id === bestId ? " · Best" : ""}</strong>
          <small>${escapeHtml(node.status)} · score ${escapeHtml(formatBranchScore(node.score))}</small>
        </button>
      `).join("")}
    </div>
  `;
}

export function renderBranchScatter(payload: BranchRunStatusPayload, selectedId: string | null): string {
  const points = payload.scatter_points ?? [];
  if (points.length === 0) {
    return `<div class="viewer-design-workspace-muted">等待评价结果生成散点图。</div>`;
  }
  const plotWidth = 540;
  const plotHeight = 320;
  const padding = 34;
  const scaleX = (value: number | null | undefined) => padding + (clamp(Number(value ?? 0), 0, 100) / 100) * (plotWidth - padding * 2);
  const scaleY = (value: number | null | undefined) => plotHeight - padding - (clamp(Number(value ?? 0), 0, 100) / 100) * (plotHeight - padding * 2);
  return `
    <div class="viewer-branch-scatter-wrap">
      <svg class="viewer-branch-scatter" viewBox="0 0 ${plotWidth} ${plotHeight}" role="img" aria-label="Branch evaluation scatter plot">
        <line x1="${padding}" y1="${plotHeight - padding}" x2="${plotWidth - padding}" y2="${plotHeight - padding}" />
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${plotHeight - padding}" />
        <text x="${plotWidth / 2}" y="${plotHeight - 7}">Walkability</text>
        <text x="10" y="20">Overall</text>
        ${points.map((point) => {
          const radius = point.status === "succeeded" ? 7 + clamp(Number(point.overall ?? 50), 0, 100) / 28 : 6;
          return `
            <circle
              class="viewer-branch-point"
              data-branch-node="${escapeHtml(point.node_id)}"
              data-status="${escapeHtml(point.status)}"
              data-selected="${point.node_id === selectedId ? "true" : "false"}"
              cx="${scaleX(point.x)}"
              cy="${scaleY(point.y)}"
              r="${radius}"
            />
            <text class="viewer-branch-point-label" x="${scaleX(point.x) + 9}" y="${scaleY(point.y) - 8}">D${point.depth}</text>
          `;
        }).join("")}
      </svg>
    </div>
  `;
}

export function renderBranchNodeDetail(node: BranchRunNode | null): string {
  if (!node) return `<div class="viewer-design-workspace-muted">选择一个分支节点查看细节。</div>`;
  const evaluation = asRecord(node.evaluation);
  return `
    <div class="viewer-branch-detail">
      <div class="viewer-branch-detail-actions">
        ${node.scene_layout_path ? `
          <button class="viewer-design-stage-detail-button" type="button" data-branch-load="${escapeHtml(node.scene_layout_path)}">Load Scene</button>
        ` : ""}
      </div>
      ${renderDiagnosticSection("评价结果", renderDiagnosticKeyValues({
        status: node.status,
        score: node.score,
        walkability: evaluation.walkability,
        safety: evaluation.safety,
        beauty: evaluation.beauty,
        overall: evaluation.overall,
        error: node.error,
      }))}
      ${renderDiagnosticSection("LLM 候选与实际参数", `
        <p class="viewer-design-workspace-copy">${escapeHtml(node.llm_candidate_reasoning || "无 LLM reasoning。")}</p>
        ${renderDiagnosticKeyValues(asRecord(node.config_patch), 28)}
      `)}
      ${renderDiagnosticSection("Rule-Based 优化方向", renderDiagnosticTable(asRecords(node.optimization_directives), [
        ["directive_id", "Directive"],
        ["target_metric", "目标"],
        ["direction", "方向"],
        ["allowed_fields", "允许字段"],
        ["risk", "风险"],
      ], "该节点尚未生成优化方向。"))}
      ${renderDiagnosticSection("LLM 修改拦截", renderDiagnosticTable(asRecords(node.rejected_edits), [
        ["field", "字段"],
        ["value", "LLM 值"],
        ["reason", "拦截原因"],
      ], "没有被拦截的修改。"))}
      ${renderDiagnosticSection("RAG 证据", renderDiagnosticTable(asRecords(node.rag_evidence), [
        ["chunk_id", "Chunk"],
        ["section_title", "章节"],
        ["score", "相关度"],
        ["knowledge_source", "来源"],
      ], "该节点没有直接 RAG 证据。"))}
    </div>
  `;
}

export function renderBranchWorkspaceHtml(
  payload: BranchRunStatusPayload,
  selected: BranchRunNode | null,
  fallbackPrompt: string,
): string {
  const progress = Math.round(clamp(Number(payload.progress ?? 0), 0, 100));
  return `
    <div class="viewer-design-workspace-shell">
      <header class="viewer-design-workspace-header">
        <div>
          <span class="viewer-design-workspace-kicker">Branch Run · Top-${escapeHtml(String(payload.topk ?? 3))} · ${escapeHtml(payload.graph_template_id ?? DEFAULT_GRAPH_TEMPLATE_ID)}</span>
          <h2>Design Evolution</h2>
          <p>${escapeHtml(payload.prompt ?? fallbackPrompt)}</p>
        </div>
        <div class="viewer-design-workspace-progress">
          <strong>${progress}%</strong>
          <span>${escapeHtml(payload.stage || payload.status)}</span>
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
          <div class="viewer-design-workspace-panel-title">评价散点图</div>
          ${renderBranchScatter(payload, selected?.node_id ?? null)}
        </section>
        <section class="viewer-design-workspace-panel">
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
        <button class="viewer-design-scheme" type="button" data-layout-path="${escapeHtml(node.scene_layout_path || "")}">
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
