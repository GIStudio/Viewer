import { apiJson, postApiJson } from "./viewer-api";

type TargetId = "curb_ramp" | "bus_stop" | "building" | "surface_material";
type ViewId = "feature_top" | "feature_longitudinal" | "feature_cross_section";

type FeatureVariant = {
  variant_id: string;
  label: string;
  patch: Record<string, unknown>;
  status: string;
  progress: number;
  layout_path: string;
  scene_glb_path: string;
  views: Array<{ view_id: string; label?: string; path?: string }>;
  review: Record<string, unknown>;
  score: number | null;
  error: string;
};

type FeatureRun = {
  run_id: string;
  status: string;
  stage: string;
  progress: number;
  accepted_variant_id: string;
  error: string;
  target: { target_id: TargetId; label: string; brief: string; acceptance_checks: string[] };
  variants: FeatureVariant[];
};

export type FeatureQualityWorkbench = {
  open(): void;
  close(): void;
  dispose(): void;
};

type Options = {
  root: HTMLElement;
  toggle: HTMLButtonElement;
  isAuthorized(): boolean;
  getBasePatch(): Record<string, unknown>;
  getGraphTemplateId(): string;
  getGenerationOptions(): Record<string, unknown>;
  applyPatch(patch: Record<string, unknown>): void;
  loadVariant(layoutPath: string, sceneGlbPath: string): Promise<void>;
  flashStatus(message: string): void;
};

const TARGETS: Array<{ id: TargetId; label: string; brief: string }> = [
  { id: "curb_ramp", label: "路缘坡道", brief: "独立、连续、无穿插的道路到人行道坡道。" },
  { id: "bus_stop", label: "公交站", brief: "站点、候车区与道路边缘关系清晰，构件无穿插。" },
  { id: "building", label: "建筑", brief: "建筑尺度、沿街关系和高度节奏自然，且不侵入道路。" },
  { id: "surface_material", label: "道路与材质", brief: "道路、路缘、人行道材质层次清楚，纹理尺度协调。" },
];
const VIEW_IDS: ViewId[] = ["feature_top", "feature_longitudinal", "feature_cross_section"];
const VIEW_LABELS: Record<ViewId, string> = {
  feature_top: "俯视",
  feature_longitudinal: "纵向立面",
  feature_cross_section: "横断面",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function createFeatureQualityWorkbench(options: Options): FeatureQualityWorkbench {
  const controller = new AbortController();
  const { signal } = controller;
  let run: FeatureRun | null = null;
  let targetId: TargetId = "curb_ramp";
  let variantCount = 4;
  let visualReview = true;
  let brief = TARGETS[0]!.brief;
  let busy = false;
  let pollHandle: number | null = null;
  let selected = new Set<string>();

  function target(): typeof TARGETS[number] {
    return TARGETS.find((item) => item.id === targetId) ?? TARGETS[0]!;
  }

  function scoreLabel(value: number | null): string {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "N/A";
  }

  function reviewStatus(variant: FeatureVariant): string {
    if (variant.status === "failed") return variant.error || "生成失败";
    if (variant.status !== "succeeded") return `生成中 ${variant.progress ?? 0}%`;
    if ((variant.review as { status?: string }).status === "unavailable") return "三视图完成 · 视觉模型不可用";
    return typeof variant.score === "number" ? "视觉审查完成" : "三视图完成 · 未评分";
  }

  function artifactUrl(variant: FeatureVariant, viewId: ViewId): string {
    if (!run) return "";
    return `/api/design/feature-quality-runs/${encodeURIComponent(run.run_id)}/artifacts/${encodeURIComponent(variant.variant_id)}/${viewId}`;
  }

  function renderVariant(variant: FeatureVariant): string {
    const hasViews = variant.views.length >= 3;
    const selectedForCompare = selected.has(variant.variant_id);
    const accepted = run?.accepted_variant_id === variant.variant_id;
    return `<article class="feature-quality-variant" data-selected="${selectedForCompare}" data-accepted="${accepted}" data-status="${escapeHtml(variant.status)}">
      <header>
        <label><input type="checkbox" data-feature-compare="${escapeHtml(variant.variant_id)}" ${selectedForCompare ? "checked" : ""} ${hasViews ? "" : "disabled"}/><span>对照</span></label>
        <div><strong>${escapeHtml(variant.label)}</strong><small>${escapeHtml(reviewStatus(variant))}</small></div>
        <b>${scoreLabel(variant.score)}</b>
      </header>
      <div class="feature-quality-views">
        ${VIEW_IDS.map((viewId) => `<figure>${hasViews ? `<img src="${artifactUrl(variant, viewId)}" alt="${escapeHtml(`${variant.label} ${VIEW_LABELS[viewId]}`)}" loading="lazy"/>` : `<div class="feature-quality-view-placeholder"><span>${variant.status === "failed" ? "!" : Math.max(1, variant.progress)}%</span></div>`}<figcaption>${VIEW_LABELS[viewId]}</figcaption></figure>`).join("")}
      </div>
      <details><summary>参数与审查证据</summary><pre>${escapeHtml(JSON.stringify({ patch: variant.patch, review: variant.review }, null, 2))}</pre></details>
      <footer>
        <button type="button" data-feature-open="${escapeHtml(variant.variant_id)}" ${hasViews ? "" : "disabled"}>在主画布打开</button>
        <button type="button" class="feature-quality-accept" data-feature-accept="${escapeHtml(variant.variant_id)}" ${variant.status === "succeeded" || accepted ? "" : "disabled"}>${accepted ? "已接受" : "接受参数"}</button>
      </footer>
    </article>`;
  }

  function render(): void {
    const best = run?.variants.filter((item) => typeof item.score === "number").sort((a, b) => Number(b.score) - Number(a.score))[0];
    const variants = run?.variants ?? [];
    const visible = selected.size === 2 ? variants.filter((item) => selected.has(item.variant_id)) : variants;
    options.root.innerHTML = `<div class="feature-quality-shell">
      <header class="feature-quality-head"><div><span>FEATURE QUALITY LAB</span><h2>微要素三视图实验</h2><p>固定场景与 seed；每轮只改变一个要素。</p></div><button type="button" data-feature-close aria-label="关闭">×</button></header>
      <section class="feature-quality-controls">
        <label><span>要素</span><select data-feature-target>${TARGETS.map((item) => `<option value="${item.id}" ${item.id === targetId ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
        <label class="feature-quality-brief"><span>验收文本</span><input data-feature-brief value="${escapeHtml(brief)}"/></label>
        <label><span>变体数</span><select data-feature-count>${[3, 4, 5, 6].map((count) => `<option value="${count}" ${count === variantCount ? "selected" : ""}>${count}</option>`).join("")}</select></label>
        <label class="feature-quality-toggle"><input type="checkbox" data-feature-vision ${visualReview ? "checked" : ""}/><span>视觉模型评分</span></label>
        <button type="button" class="feature-quality-run" data-feature-run ${busy ? "disabled" : ""}>${busy ? "生成中…" : "批量生成"}</button>
      </section>
      <section class="feature-quality-status" data-status="${escapeHtml(run?.status ?? "idle")}">
        <div><strong>${run ? `${escapeHtml(run.target.label)} · ${escapeHtml(run.stage)}` : "尚未运行"}</strong><small>${run ? `${run.progress}% · ${run.variants.filter((item) => item.status === "succeeded").length}/${run.variants.length} 完成` : "选择要素后生成 3–6 个受控变体"}</small></div>
        <div class="feature-quality-progress"><i style="width:${run?.progress ?? 0}%"></i></div>
        ${selected.size === 2 ? `<em>正在仅显示 2 个 A/B 变体</em><button type="button" data-feature-clear-compare>显示全部</button>` : `<em>勾选两个变体进入 A/B 对照</em>`}
        ${best ? `<button type="button" data-feature-accept-best>接受最高分 · ${escapeHtml(best.label)} (${scoreLabel(best.score)})</button>` : ""}
      </section>
      ${run?.error ? `<p class="feature-quality-error">${escapeHtml(run.error)}</p>` : ""}
      <main class="feature-quality-grid" data-compare="${selected.size === 2}">${visible.length ? visible.map(renderVariant).join("") : `<div class="feature-quality-empty"><strong>小批量，而不是整街盲目搜索</strong><p>每个变体会输出 GLB、固定俯视/纵向/横断面图、参数差异和视觉审查证据。</p></div>`}</main>
    </div>`;
    bind();
  }

  function bind(): void {
    options.root.querySelector<HTMLButtonElement>("[data-feature-close]")?.addEventListener("click", close, { signal });
    options.root.querySelector<HTMLSelectElement>("[data-feature-target]")?.addEventListener("change", (event) => {
      targetId = (event.currentTarget as HTMLSelectElement).value as TargetId;
      brief = target().brief;
      render();
    }, { signal });
    options.root.querySelector<HTMLInputElement>("[data-feature-brief]")?.addEventListener("input", (event) => { brief = (event.currentTarget as HTMLInputElement).value; }, { signal });
    options.root.querySelector<HTMLSelectElement>("[data-feature-count]")?.addEventListener("change", (event) => { variantCount = Number((event.currentTarget as HTMLSelectElement).value); }, { signal });
    options.root.querySelector<HTMLInputElement>("[data-feature-vision]")?.addEventListener("change", (event) => { visualReview = (event.currentTarget as HTMLInputElement).checked; }, { signal });
    options.root.querySelector<HTMLButtonElement>("[data-feature-run]")?.addEventListener("click", () => void start(), { signal });
    options.root.querySelector<HTMLButtonElement>("[data-feature-clear-compare]")?.addEventListener("click", () => { selected.clear(); render(); }, { signal });
    options.root.querySelector<HTMLButtonElement>("[data-feature-accept-best]")?.addEventListener("click", () => {
      const best = run?.variants.filter((item) => typeof item.score === "number").sort((a, b) => Number(b.score) - Number(a.score))[0];
      if (best) void accept(best.variant_id);
    }, { signal });
    options.root.querySelectorAll<HTMLInputElement>("[data-feature-compare]").forEach((input) => input.addEventListener("change", () => {
      const id = input.dataset.featureCompare!;
      if (input.checked) {
        if (selected.size >= 2) selected.delete(selected.values().next().value!);
        selected.add(id);
      } else selected.delete(id);
      render();
    }, { signal }));
    options.root.querySelectorAll<HTMLButtonElement>("[data-feature-open]").forEach((button) => button.addEventListener("click", () => {
      const variant = run?.variants.find((item) => item.variant_id === button.dataset.featureOpen);
      if (variant) void options.loadVariant(variant.layout_path, variant.scene_glb_path);
    }, { signal }));
    options.root.querySelectorAll<HTMLButtonElement>("[data-feature-accept]").forEach((button) => button.addEventListener("click", () => void accept(button.dataset.featureAccept!), { signal }));
  }

  async function start(): Promise<void> {
    if (busy || !brief.trim()) return;
    busy = true;
    selected.clear();
    render();
    try {
      run = await postApiJson<FeatureRun>("/api/design/feature-quality-runs", {
        target_id: targetId,
        brief: brief.trim(),
        variant_count: variantCount,
        base_patch: options.getBasePatch(),
        graph_template_id: options.getGraphTemplateId() || "hkust_gz_gate",
        generation_options: options.getGenerationOptions(),
        visual_review: visualReview,
      });
      render();
      schedulePoll();
    } catch (error) {
      busy = false;
      options.flashStatus(error instanceof Error ? error.message : String(error));
      render();
    }
  }

  function schedulePoll(): void {
    if (!run || ["succeeded", "failed"].includes(run.status)) {
      busy = false;
      render();
      return;
    }
    if (pollHandle !== null) window.clearTimeout(pollHandle);
    pollHandle = window.setTimeout(async () => {
      try {
        run = await apiJson<FeatureRun>(`/api/design/feature-quality-runs/${encodeURIComponent(run!.run_id)}`);
        render();
        schedulePoll();
      } catch (error) {
        busy = false;
        options.flashStatus(error instanceof Error ? error.message : String(error));
        render();
      }
    }, 2000);
  }

  async function accept(variantId: string): Promise<void> {
    if (!run) return;
    try {
      const accepted = await postApiJson<{ patch: Record<string, unknown>; layout_path: string; scene_glb_path: string }>(
        `/api/design/feature-quality-runs/${encodeURIComponent(run.run_id)}/accept/${encodeURIComponent(variantId)}`,
        {},
      );
      options.applyPatch(accepted.patch);
      run.accepted_variant_id = variantId;
      options.flashStatus("最佳参数已写回生成参数；可直接重新生成正式方案。");
      render();
    } catch (error) {
      options.flashStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function open(): void {
    if (!options.isAuthorized()) {
      close();
      return;
    }
    options.root.hidden = false;
    options.toggle.setAttribute("aria-pressed", "true");
    render();
  }

  function close(): void {
    options.root.hidden = true;
    options.toggle.setAttribute("aria-pressed", "false");
  }

  options.toggle.addEventListener("click", () => options.root.hidden ? open() : close(), { signal });
  render();
  return {
    open,
    close,
    dispose() {
      if (pollHandle !== null) window.clearTimeout(pollHandle);
      controller.abort();
    },
  };
}
