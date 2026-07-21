export type ScenarioMetric = "walkability" | "safety" | "beauty";

export type ScenarioParameter = { label: string; value: string };

export type ProfessionalScenario = {
  id: string;
  shortLabel: string;
  title: string;
  branchKind: string;
  revisionNumber: number;
  current: boolean;
  scores: Record<string, number | null>;
  skeleton: ScenarioParameter[];
  furniture: ScenarioParameter[];
};

export type ScenarioComparisonItem = {
  scenario: ProfessionalScenario;
  scoreDelta: Record<string, number | null>;
};

export type ProfessionalScenarioWorkspace = {
  projectId: string;
  scenarios: ProfessionalScenario[];
};

export type ProfessionalScenarioAdapter = {
  load(): Promise<ProfessionalScenarioWorkspace>;
  open(revisionId: string): Promise<void>;
  generate(metric: ScenarioMetric): Promise<ProfessionalScenarioWorkspace>;
  compare(revisionIds: string[]): Promise<ScenarioComparisonItem[]>;
};

export type ScenarioWorkbenchController = {
  open(): Promise<void>;
  close(): void;
  dispose(): void;
};

type Options = {
  root: HTMLElement;
  toggle: HTMLButtonElement;
  adapter: ProfessionalScenarioAdapter;
  language(): "en" | "zh";
  flashStatus(message: string): void;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function score(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}

function parameterRows(rows: ScenarioParameter[]): string {
  if (!rows.length) return `<p class="viewer-scenario-empty-parameter">—</p>`;
  return rows.map((row) => `<p><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></p>`).join("");
}

export function createScenarioWorkbench(options: Options): ScenarioWorkbenchController {
  const { root, toggle } = options;
  const abortController = new AbortController();
  const { signal } = abortController;
  let workspace: ProfessionalScenarioWorkspace | null = null;
  let comparison: ScenarioComparisonItem[] = [];
  let selected = new Set<string>();
  let busy = false;
  let message = "";

  const zh = () => options.language() === "zh";

  function render(): void {
    const scenarios = workspace?.scenarios ?? [];
    const metricOptions: Array<[ScenarioMetric, string, string]> = [
      ["walkability", "步行友好", "Walkability"],
      ["safety", "安全", "Safety"],
      ["beauty", "美观", "Beauty"],
    ];
    root.innerHTML = `
      <header class="viewer-scenario-head">
        <div><span>DESIGN LEDGER · A/B/C</span><h2 id="viewer-scenario-workbench-title">${zh() ? "场景方案与指标反求" : "Scenarios & metric solver"}</h2><p>${zh() ? "A 为 OSM 基线；B 为人工编辑；C 为评分导向的参数求解候选。" : "A is the OSM baseline, B is a manual edit, and C is a metric-driven candidate."}</p></div>
        <div><button type="button" data-scenario-action="refresh">↻</button><button type="button" data-scenario-action="close" aria-label="${zh() ? "关闭" : "Close"}">×</button></div>
      </header>
      <div class="viewer-scenario-body">
        <section class="viewer-scenario-ledger">
          <header><strong>${zh() ? "版本账本" : "Revision ledger"}</strong><small>${scenarios.length} ${zh() ? "个可追溯版本" : "traceable revisions"}</small></header>
          <div class="viewer-scenario-list">
            ${scenarios.length ? scenarios.map((item) => `
              <article data-current="${item.current}" data-branch="${escapeHtml(item.shortLabel.slice(0, 1))}">
                <label><input type="checkbox" data-scenario-select="${escapeHtml(item.id)}" ${selected.has(item.id) ? "checked" : ""}/><b>${escapeHtml(item.shortLabel)}</b></label>
                <div><strong>${escapeHtml(item.title)}</strong><small>REV ${String(item.revisionNumber).padStart(3, "0")} · ${escapeHtml(item.branchKind)}</small></div>
                <button type="button" data-scenario-open="${escapeHtml(item.id)}">${item.current ? (zh() ? "当前" : "Current") : (zh() ? "打开" : "Open")}</button>
              </article>`).join("") : `<div class="viewer-scenario-empty">${zh() ? "生成首个项目场景后，这里会出现 Scene A。" : "Generate the first project scene to create Scene A."}</div>`}
          </div>
          <section class="viewer-scenario-solver">
            <span>METRIC → PARAMETERS → C</span>
            <strong>${zh() ? "按最需要改善的指标求解" : "Solve for the weakest priority"}</strong>
            <p>${zh() ? "选择指标后，服务器会把目标权重转换为明确的横断面与家具参数，再运行约束求解器。" : "The server converts the priority into explicit cross-section and furniture parameters, then runs the constraint solver."}</p>
            <label><span>${zh() ? "优先指标" : "Priority"}</span><select data-scenario-metric>${metricOptions.map(([key, cn, en]) => `<option value="${key}">${zh() ? cn : en}</option>`).join("")}</select></label>
            <button type="button" data-scenario-action="generate" ${busy || !scenarios.length ? "disabled" : ""}>${busy ? (zh() ? "正在生成 C…" : "Generating C…") : (zh() ? "生成评分导向候选 C" : "Generate metric candidate C")}</button>
          </section>
          <div class="viewer-scenario-message" data-busy="${busy}">${escapeHtml(message || (zh() ? "勾选 2–3 个方案即可比较。" : "Select 2–3 scenarios to compare."))}</div>
        </section>
        <section class="viewer-scenario-comparison">
          <header><div><span>PARAMETER + SCORE MATRIX</span><strong>${zh() ? "骨架、街具与评分同屏比较" : "Skeleton, furniture, and scores"}</strong></div><button type="button" data-scenario-action="compare" ${busy || selected.size < 2 ? "disabled" : ""}>${zh() ? "比较所选" : "Compare selected"}</button></header>
          ${comparison.length ? `<div class="viewer-scenario-matrix">${comparison.map(({ scenario, scoreDelta }, index) => `
            <article data-branch="${escapeHtml(scenario.shortLabel.slice(0, 1))}">
              <header><b>${escapeHtml(scenario.shortLabel)}</b><div><strong>${escapeHtml(scenario.title)}</strong><small>${index === 0 ? (zh() ? "比较基准" : "comparison base") : (zh() ? "相对首列" : "vs first column")}</small></div></header>
              <section><h3>${zh() ? "道路骨架" : "Skeleton"}</h3>${parameterRows(scenario.skeleton)}</section>
              <section><h3>${zh() ? "街道家具" : "Furniture"}</h3>${parameterRows(scenario.furniture)}</section>
              <section class="viewer-scenario-score-grid"><h3>${zh() ? "评分" : "Scores"}</h3>${["walkability", "safety", "beauty", "overall"].map((key) => `<p><span>${escapeHtml(key)}</span><strong>${score(scenario.scores[key])}</strong><em>${index === 0 || scoreDelta[key] == null ? "—" : `${Number(scoreDelta[key]) >= 0 ? "+" : ""}${Number(scoreDelta[key]).toFixed(1)}`}</em></p>`).join("")}</section>
            </article>`).join("")}</div>` : `<div class="viewer-scenario-comparison-empty"><span>A ↔ B ↔ C</span><strong>${zh() ? "选择版本，查看设计变化是否真的改善目标" : "Select versions to inspect whether the design improved the target"}</strong><p>${zh() ? "面板只陈述可追踪差异与评分相关性，不宣称因果。" : "The panel reports traceable differences and score correlation, not causality."}</p></div>`}
        </section>
      </div>`;
  }

  async function load(preserveSelection = false): Promise<void> {
    busy = true;
    message = zh() ? "正在读取项目版本…" : "Loading project revisions…";
    render();
    try {
      workspace = await options.adapter.load();
      if (!preserveSelection) {
        const ordered = workspace.scenarios;
        selected = new Set([ordered[0]?.id, ordered[ordered.length - 1]?.id].filter(Boolean) as string[]);
      } else {
        selected = new Set([...selected].filter((id) => workspace?.scenarios.some((item) => item.id === id)));
      }
      message = "";
    } finally {
      busy = false;
      render();
    }
  }

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button, input");
    if (!target) return;
    const selectedId = target.dataset.scenarioSelect;
    if (selectedId) {
      if ((target as HTMLInputElement).checked) {
        if (selected.size >= 3) {
          (target as HTMLInputElement).checked = false;
          message = zh() ? "一次最多比较 3 个方案。" : "Compare at most three scenarios.";
        } else selected.add(selectedId);
      } else selected.delete(selectedId);
      comparison = [];
      render();
      return;
    }
    if (target.dataset.scenarioAction === "close") return controller.close();
    if (target.dataset.scenarioAction === "refresh") void load(true).catch((error) => { message = String(error); busy = false; render(); });
    if (target.dataset.scenarioOpen) {
      busy = true; message = zh() ? "正在载入所选方案…" : "Opening scenario…"; render();
      void options.adapter.open(target.dataset.scenarioOpen).then(() => load(true)).catch((error) => { message = String(error); busy = false; render(); });
    }
    if (target.dataset.scenarioAction === "compare") {
      busy = true; message = zh() ? "正在计算比较矩阵…" : "Building comparison matrix…"; render();
      void options.adapter.compare([...selected]).then((items) => { comparison = items; message = ""; busy = false; render(); }).catch((error) => { message = String(error); busy = false; render(); });
    }
    if (target.dataset.scenarioAction === "generate") {
      const metric = root.querySelector<HTMLSelectElement>("[data-scenario-metric]")?.value as ScenarioMetric;
      busy = true; message = zh() ? "正在反求参数并生成新的 C 方案…" : "Solving parameters and generating a new C candidate…"; render();
      void options.adapter.generate(metric).then((next) => {
        workspace = next;
        const newest = next.scenarios[next.scenarios.length - 1];
        if (newest) selected = new Set([next.scenarios[0]?.id, newest.id].filter(Boolean) as string[]);
        comparison = [];
        message = zh() ? `已生成并打开 ${newest?.shortLabel ?? "C"}。` : `Generated and opened ${newest?.shortLabel ?? "C"}.`;
        busy = false;
        render();
      }).catch((error) => { message = String(error); busy = false; render(); });
    }
  }, { signal });

  toggle.addEventListener("click", () => {
    if (!root.hidden) controller.close();
    else void controller.open().catch((error) => options.flashStatus(String(error)));
  }, { signal });

  const controller: ScenarioWorkbenchController = {
    async open(): Promise<void> {
      root.hidden = false;
      toggle.setAttribute("aria-pressed", "true");
      await load(false);
    },
    close(): void {
      root.hidden = true;
      toggle.setAttribute("aria-pressed", "false");
      toggle.focus({ preventScroll: true });
    },
    dispose(): void {
      abortController.abort();
      root.replaceChildren();
    },
  };
  return controller;
}
