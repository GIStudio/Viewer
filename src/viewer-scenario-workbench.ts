export type ScenarioMetric = "walkability" | "safety" | "beauty";
export type ScenarioGoalWeights = Record<ScenarioMetric, number>;

export type ScenarioParameter = { label: string; value: string };

export type ProfessionalScenario = {
  id: string;
  shortLabel: string;
  title: string;
  branchKind: string;
  revisionNumber: number;
  sourceId: string | null;
  parentId: string | null;
  createdAt: string | null;
  generationMethod: string;
  goalWeights: Record<string, number>;
  current: boolean;
  scores: Record<string, number | null>;
  skeleton: ScenarioParameter[];
  furniture: ScenarioParameter[];
};

export type ScenarioComparisonItem = {
  scenario: ProfessionalScenario;
  scoreDelta: Record<string, number | null>;
};

export type ProfessionalScenarioOpenTarget = {
  layoutPath: string;
  sceneGlbPath: string;
};

export type ProfessionalScenarioGeneration = {
  workspace: ProfessionalScenarioWorkspace;
  target: ProfessionalScenarioOpenTarget;
  selectedScenarioId: string;
};

export type ProfessionalScenarioWorkspace = {
  projectId: string;
  scenarios: ProfessionalScenario[];
  canWrite: boolean;
  candidateReadiness: {
    state: "ready" | "needs_baseline" | "needs_source";
    parentLabel: string | null;
  };
};

export type ProfessionalScenarioAdapter = {
  load(): Promise<ProfessionalScenarioWorkspace>;
  open(revisionId: string): Promise<ProfessionalScenarioOpenTarget>;
  evaluate(revisionId: string): Promise<void>;
  prepareManualEdit(): Promise<ProfessionalScenarioOpenTarget>;
  generate(goalWeights: ScenarioGoalWeights): Promise<ProfessionalScenarioGeneration>;
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
  loadScenario(target: ProfessionalScenarioOpenTarget): Promise<void>;
  openSplitComparison(scenarios: ProfessionalScenario[]): Promise<boolean>;
  enterManualEdit(): Promise<void>;
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
  let focusedId = "";
  let busy = false;
  let message = "";

  const zh = () => options.language() === "zh";

  function latestScenario(scenarios: ProfessionalScenario[], branchKind: string): ProfessionalScenario | null {
    const matches = scenarios.filter((scenario) => scenario.branchKind === branchKind);
    return matches[matches.length - 1] ?? null;
  }

  function focusedScenario(scenarios: ProfessionalScenario[]): ProfessionalScenario | null {
    return scenarios.find((scenario) => scenario.id === focusedId)
      ?? scenarios.find((scenario) => scenario.current)
      ?? latestScenario(scenarios, "baseline")
      ?? scenarios[0]
      ?? null;
  }

  function branchTitle(branch: "A" | "B" | "C"): string {
    if (branch === "A") return zh() ? "OSM 直接生成" : "Direct OSM baseline";
    if (branch === "B") return zh() ? "用户人工编辑" : "User-edited scenes";
    return zh() ? "自动参数候选" : "Automated parameter candidates";
  }

  function compactId(value: string | null): string {
    if (!value) return "—";
    return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
  }

  function formatCreatedAt(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(zh() ? "zh-CN" : "en-US", { hour12: false });
  }

  function renderLane(branch: "A" | "B" | "C", scenarios: ProfessionalScenario[]): string {
    const items = scenarios.filter((scenario) => scenario.shortLabel.startsWith(branch));
    const empty = branch === "A"
      ? (zh() ? "完成 OSM 标注并生成首个 3D 场景" : "Generate the first scene from the OSM annotation")
      : branch === "B"
        ? (zh() ? "尚无人工编辑版本" : "No manual edit yet")
        : (zh() ? "尚无自动参数候选" : "No automated candidate yet");
    const emptyAction = branch === "B"
      ? `<button type="button" class="viewer-scenario-lane-action" data-scenario-action="edit-2d">${zh() ? "前往 2D 标注" : "Edit in 2D"}</button><small>${zh() ? "保留当前 OSM 研究区与已保存标注，无需重新获取地图数据。" : "Keeps the current OSM study area and saved annotation; no map download is needed."}</small>`
      : "";
    return `<section class="viewer-scenario-lane" data-branch="${branch}">
      <header><b>${branch}</b><div><strong>${branchTitle(branch)}</strong><small>${items.length} ${zh() ? "个版本" : items.length === 1 ? "version" : "versions"}</small></div></header>
      <div class="viewer-scenario-lane-items">
        ${items.length ? items.map((item) => `<article class="viewer-scenario-version" data-scenario-focus="${escapeHtml(item.id)}" data-selected="${item.id === focusedId}" data-current="${item.current}">
          <label title="${zh() ? "加入方案差异比较" : "Add to comparison"}"><input type="checkbox" data-scenario-select="${escapeHtml(item.id)}" ${selected.has(item.id) ? "checked" : ""}/></label>
          <div><strong>${escapeHtml(item.shortLabel)}</strong><small>${escapeHtml(item.title)}</small></div>
          ${item.current ? `<em>${zh() ? "当前" : "CURRENT"}</em>` : ""}
        </article>`).join("") : `<div class="viewer-scenario-lane-empty"><p>${escapeHtml(empty)}</p>${emptyAction}</div>`}
      </div>
    </section>`;
  }

  function renderScenarioDetails(scenario: ProfessionalScenario | null, scenarios: ProfessionalScenario[]): string {
    if (!scenario) return comparisonGuide(scenarios);
    const parent = scenarios.find((item) => item.id === scenario.parentId);
    const weights = Object.entries(scenario.goalWeights).filter(([, value]) => Number.isFinite(value) && value > 0);
    const branch = scenario.shortLabel.slice(0, 1);
    const hasScores = ["walkability", "safety", "beauty", "overall"].some((key) => typeof scenario.scores[key] === "number");
    const evaluationDisabled = !workspace?.canWrite || busy;
    const evaluationTitle = !workspace?.canWrite ? ` title="${escapeHtml(unavailableReason())}"` : "";
    return `<div class="viewer-scenario-detail" data-branch="${escapeHtml(branch)}">
      <header>
        <div><span>${escapeHtml(scenario.shortLabel)} · ${escapeHtml(branchTitle(branch as "A" | "B" | "C"))}</span><h3>${escapeHtml(scenario.title)}</h3><p>${scenario.current ? (zh() ? "当前正在主画布中显示" : "Currently shown on the main canvas") : (zh() ? "查看属性后，可确认切换主画布" : "Review the properties before opening it on the main canvas")}</p></div>
        <div class="viewer-scenario-detail-actions">
          <button type="button" class="viewer-scenario-split-button" data-scenario-action="split" ${busy || selected.size < 2 ? "disabled" : ""}>${zh() ? `同屏比较 (${selected.size})` : `Split view (${selected.size})`}</button>
          <button type="button" data-scenario-open="${escapeHtml(scenario.id)}" ${scenario.current || busy ? "disabled" : ""}>${scenario.current ? (zh() ? "当前场景" : "Current scene") : (zh() ? "在主画布打开" : "Open on main canvas")}</button>
        </div>
      </header>
      <section class="viewer-scenario-trace">
        <h4>${zh() ? "版本与来源" : "Revision & provenance"}</h4>
        <dl>
          <div><dt>${zh() ? "版本" : "Revision"}</dt><dd>REV ${String(scenario.revisionNumber).padStart(3, "0")}</dd></div>
          <div><dt>${zh() ? "创建时间" : "Created"}</dt><dd>${escapeHtml(formatCreatedAt(scenario.createdAt))}</dd></div>
          <div><dt>${zh() ? "父版本" : "Parent"}</dt><dd>${escapeHtml(parent?.shortLabel ?? compactId(scenario.parentId))}</dd></div>
          <div><dt>${zh() ? "OSM 来源" : "OSM source"}</dt><dd title="${escapeHtml(scenario.sourceId ?? "")}">${escapeHtml(compactId(scenario.sourceId))}</dd></div>
          <div><dt>${zh() ? "生成方式" : "Method"}</dt><dd>${escapeHtml(scenario.generationMethod || "—")}</dd></div>
          <div><dt>${zh() ? "类型" : "Type"}</dt><dd>${escapeHtml(scenario.branchKind)}</dd></div>
        </dl>
      </section>
      ${scenario.branchKind === "ai_edit" ? `<section class="viewer-scenario-goals"><h4>${zh() ? "参数候选目标" : "Candidate objectives"}</h4><div>${weights.length ? weights.map(([key, value]) => `<p><span>${escapeHtml(key)}</span><strong>${Math.round(value * 100)}%</strong></p>`).join("") : `<p><span>${zh() ? "未记录目标权重" : "No goal weights recorded"}</span><strong>—</strong></p>`}</div></section>` : ""}
      <div class="viewer-scenario-property-grid">
        <section><h4>${zh() ? "道路骨架" : "Road skeleton"}</h4>${parameterRows(scenario.skeleton)}</section>
        <section><h4>${zh() ? "街道家具" : "Street furniture"}</h4>${parameterRows(scenario.furniture)}</section>
        <section class="viewer-scenario-detail-scores"><h4>${zh() ? "场景评分" : "Scene scores"}</h4>${["walkability", "safety", "beauty", "overall"].map((key) => `<p><span>${escapeHtml(key)}</span><strong>${score(scenario.scores[key])}</strong></p>`).join("")}${hasScores ? "" : `<button type="button" class="viewer-scenario-score-fetch" data-scenario-evaluate="${escapeHtml(scenario.id)}" ${evaluationDisabled ? "disabled" : ""}${evaluationTitle}>${busy ? (zh() ? "正在获取评分…" : "Fetching scores…") : (zh() ? "获取评分" : "Fetch scores")}</button>`}</section>
      </div>
    </div>`;
  }

  function unavailableReason(): string {
    return zh()
      ? "该公共项目为只读；请打开自己创建的项目后再生成或保存方案。"
      : "This public project is read-only. Open a project you created to generate or save a scenario.";
  }

  function comparisonGuide(scenarios: ProfessionalScenario[]): string {
    const baseline = latestScenario(scenarios, "baseline");
    const manual = latestScenario(scenarios, "human_edit");
    const candidate = latestScenario(scenarios, "ai_edit");
    if (!baseline) {
      const disabled = !workspace?.canWrite ? "disabled" : "";
      return `<div class="viewer-scenario-comparison-empty"><span>A ↔ B ↔ C</span><strong>${zh() ? "请先生成首个 3D 基线 A" : "Generate the first 3D baseline A first"}</strong><p>${zh() ? "完成 2D 标注并通过校验后，从顶部“3D 场景生成”创建可追溯的 A。" : "After validating the 2D annotation, use the top 3D generation action to create a traceable A."}</p><button type="button" class="viewer-scenario-next-step" data-scenario-action="edit-2d" ${disabled}>${zh() ? "前往 2D 标注，生成 A 基线" : "Go to 2D annotation and generate A"}</button>${!workspace?.canWrite ? `<small>${escapeHtml(unavailableReason())}</small>` : ""}</div>`;
    }
    const disabled = !workspace?.canWrite;
    const disabledAttr = disabled || busy ? "disabled" : "";
    const disabledTitle = disabled ? ` title="${escapeHtml(unavailableReason())}"` : "";
    const readOnlyNote = disabled ? `<p class="viewer-scenario-guide-reason">${escapeHtml(unavailableReason())}</p>` : "";
    const guides: string[] = [];
    if (!manual) {
      guides.push(`<article class="viewer-scenario-guide" data-branch="B">
        <span>B · ${zh() ? "人工方案" : "Manual scenario"}</span>
        <strong>${zh() ? "从最新 A 创建人工方案 B" : "Create a manual B from the latest A"}</strong>
        <p>${zh() ? `${baseline.shortLabel} 是当前基线。修改 2D 后再次生成会形成新的 A；只有保存 3D 人工编辑才会形成 B。` : `${baseline.shortLabel} is the current baseline. Editing 2D and generating again creates a new A; only saving a 3D manual edit creates B.`}</p>
        <div><button type="button" data-scenario-action="edit-2d" ${disabledAttr}${disabledTitle}>${zh() ? "修改 2D，生成新的 A 基线" : "Edit 2D and generate a new A"}</button><button type="button" data-scenario-action="edit-3d" ${disabledAttr}${disabledTitle}>${zh() ? "编辑当前 3D，保存为 B" : "Edit current 3D and save as B"}</button></div>${readOnlyNote}
      </article>`);
    }
    if (!candidate) {
      const parent = manual ?? baseline;
      const sourceReady = workspace?.candidateReadiness.state === "ready";
      const sourceMissing = workspace?.candidateReadiness.state === "needs_source";
      const action = sourceReady ? "generate" : "edit-2d";
      const cta = sourceReady
        ? (zh() ? "设置多目标权重并生成 C" : "Set objective weights and generate C")
        : (zh() ? "前往 2D 标注，生成新的 A 基线" : "Go to 2D annotation and generate a new A");
      const reason = sourceMissing
        ? (zh() ? "当前 A 是导入场景，未绑定可追溯的 2D 来源。先保存 2D 标注并生成新的 A，才能安全生成 C。" : "The current A is an imported scene without a traceable 2D source. Save the 2D annotation and generate a new A before creating C.")
        : (zh() ? `系统会以最新 ${parent.shortLabel} 为父版本，生成并评价 3 个可追溯的局部参数候选。` : `The system uses the latest ${parent.shortLabel} as its parent and generates three traceable local candidates for evaluation.`);
      guides.push(`<article class="viewer-scenario-guide" data-branch="C">
        <span>C · ${zh() ? "参数候选" : "Parameter candidate"}</span>
        <strong>${sourceReady ? (zh() ? "自动搜索场景 C" : "Search Scenario C candidates") : (zh() ? "先补齐 C 所需的 2D 来源" : "Add the 2D source required for C")}</strong>
        <p>${reason}</p>
        <div><button type="button" data-scenario-action="${action}" ${disabledAttr}${disabledTitle}>${cta}</button></div>${readOnlyNote}
      </article>`);
    }
    return `<div class="viewer-scenario-comparison-empty viewer-scenario-guides"><span>A ↔ B ↔ C</span><strong>${zh() ? "选择版本比较，或按下方引导补齐下一步方案" : "Select versions to compare, or follow the next-step guidance below"}</strong><p>${zh() ? "面板只陈述可追踪差异与评分相关性，不宣称因果。" : "The panel reports traceable differences and score correlation, not causality."}</p>${guides.join("")}</div>`;
  }

  function render(): void {
    const scenarios = workspace?.scenarios ?? [];
    const baseline = latestScenario(scenarios, "baseline");
    const manual = latestScenario(scenarios, "human_edit");
    const focused = focusedScenario(scenarios);
    const candidateReady = workspace?.candidateReadiness.state === "ready";
    const canGenerate = Boolean(baseline && candidateReady && workspace?.canWrite && !busy);
    const metricOptions: Array<[ScenarioMetric, string, string, number]> = [
      ["walkability", "步行友好", "Walkability", 45],
      ["safety", "安全", "Safety", 35],
      ["beauty", "美观", "Beauty", 20],
    ];
    root.innerHTML = `
      <header class="viewer-scenario-head">
        <div><span>DESIGN LEDGER · A/B/C</span><h2 id="viewer-scenario-workbench-title">${zh() ? "方案 A/B/C" : "Scenario A/B/C"}</h2><p>${zh() ? "A 为 OSM 直接生成；B 为用户编辑；C 为系统按目标权重生成的可追溯参数候选。" : "A is rendered from OSM, B is user-edited, and C is a traceable parameter candidate generated from objective weights."}</p></div>
        <div><button type="button" data-scenario-action="refresh">↻</button><button type="button" data-scenario-action="close" aria-label="${zh() ? "关闭" : "Close"}">×</button></div>
      </header>
      <div class="viewer-scenario-body">
        <section class="viewer-scenario-ledger">
          <header><strong>${zh() ? "方案版本" : "Scenario versions"}</strong><small>${scenarios.length} ${zh() ? "个可追溯版本" : "traceable revisions"}</small></header>
          <div class="viewer-scenario-lanes">
            ${renderLane("A", scenarios)}
            ${renderLane("B", scenarios)}
            ${renderLane("C", scenarios)}
          </div>
          <section class="viewer-scenario-solver">
            <span>OBJECTIVES → PARAMETERS → C</span>
            <strong>${zh() ? "设置多目标权重，搜索可追溯的 C 参数候选" : "Set multiple objectives and search traceable C candidates"}</strong>
            <p>${zh() ? (!baseline ? "请先完成 2D 标注并生成 A 基线。" : !candidateReady ? "当前场景没有可追溯 2D 来源；请返回 2D 标注并生成新的 A。" : `将以最新 ${manual?.shortLabel ?? baseline.shortLabel} 为父版本；系统会生成 3 个局部参数候选，逐一评价后选择当前权重下的最佳可行候选。所有候选均保留，不宣称全局最优。`) : (!baseline ? "Complete the 2D annotation and generate baseline A first." : !candidateReady ? "The current scene has no traceable 2D source. Return to 2D annotation and generate a new A." : `The latest ${manual?.shortLabel ?? baseline.shortLabel} will be the parent. The system generates three local variants, evaluates each, and selects the best feasible candidate for the current weights. Every candidate is retained; this is not a global-optimum claim.`)}</p>
            <div class="viewer-scenario-goal-inputs">${metricOptions.map(([key, cn, en, initial]) => `<label><span>${zh() ? cn : en}</span><input type="number" min="0" max="100" step="5" value="${initial}" data-scenario-weight="${key}"/><em>%</em></label>`).join("")}</div>
            <small>${zh() ? "至少两个目标需大于 0；提交后会自动归一化。" : "At least two objectives must be greater than zero; values are normalized on submission."}</small>
            <button type="button" data-scenario-action="generate" ${canGenerate ? "" : "disabled"} ${!workspace?.canWrite && baseline ? `title="${escapeHtml(unavailableReason())}"` : ""}>${busy ? (zh() ? "正在搜索 C…" : "Searching C…") : (zh() ? "搜索并评价 3 个 C 候选" : "Search and evaluate 3 C candidates")}</button>
          </section>
          <div class="viewer-scenario-message" data-busy="${busy}">${escapeHtml(message || (zh() ? "单击版本查看属性；勾选 2–3 个版本可比较。" : "Click a version for details; select 2–3 versions to compare."))}</div>
        </section>
        <section class="viewer-scenario-comparison">
          <header><div><span>PROPERTIES + DIFFERENCE</span><strong>${comparison.length ? (zh() ? "方案差异" : "Scenario differences") : (zh() ? "方案属性" : "Scenario properties")}</strong></div><div><button type="button" data-scenario-action="details">${zh() ? "查看属性" : "Properties"}</button><button type="button" data-scenario-action="compare" ${busy || selected.size < 2 ? "disabled" : ""}>${zh() ? `比较属性 (${selected.size})` : `Compare properties (${selected.size})`}</button></div></header>
          ${comparison.length ? `<div class="viewer-scenario-matrix">${comparison.map(({ scenario, scoreDelta }, index) => `
            <article data-branch="${escapeHtml(scenario.shortLabel.slice(0, 1))}">
              <header><b>${escapeHtml(scenario.shortLabel)}</b><div><strong>${escapeHtml(scenario.title)}</strong><small>${index === 0 ? (zh() ? "比较基准" : "comparison base") : (zh() ? "相对首列" : "vs first column")}</small></div></header>
              <section><h3>${zh() ? "道路骨架" : "Skeleton"}</h3>${parameterRows(scenario.skeleton)}</section>
              <section><h3>${zh() ? "街道家具" : "Furniture"}</h3>${parameterRows(scenario.furniture)}</section>
              <section class="viewer-scenario-score-grid"><h3>${zh() ? "评分" : "Scores"}</h3>${["walkability", "safety", "beauty", "overall"].map((key) => `<p><span>${escapeHtml(key)}</span><strong>${score(scenario.scores[key])}</strong><em>${index === 0 || scoreDelta[key] == null ? "—" : `${Number(scoreDelta[key]) >= 0 ? "+" : ""}${Number(scoreDelta[key]).toFixed(1)}`}</em></p>`).join("")}</section>
            </article>`).join("")}</div>` : renderScenarioDetails(focused, scenarios)}
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
        const baseline = latestScenario(ordered, "baseline");
        selected = new Set([baseline?.id, ordered[ordered.length - 1]?.id].filter(Boolean) as string[]);
        focusedId = ordered.find((scenario) => scenario.current)?.id
          ?? latestScenario(ordered, "baseline")?.id
          ?? ordered[0]?.id
          ?? "";
      } else {
        selected = new Set([...selected].filter((id) => workspace?.scenarios.some((item) => item.id === id)));
        if (!workspace.scenarios.some((item) => item.id === focusedId)) {
          focusedId = workspace.scenarios.find((scenario) => scenario.current)?.id ?? workspace.scenarios[0]?.id ?? "";
        }
      }
      message = "";
    } finally {
      busy = false;
      render();
    }
  }

  root.addEventListener("click", (event) => {
    const origin = event.target as HTMLElement;
    const target = origin.closest<HTMLElement>("button, input");
    const focusTarget = origin.closest<HTMLElement>("[data-scenario-focus]");
    if (!target && focusTarget) {
      focusedId = focusTarget.dataset.scenarioFocus ?? "";
      comparison = [];
      render();
      return;
    }
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
    if (target.dataset.scenarioAction === "details") {
      comparison = [];
      render();
    }
    if (target.dataset.scenarioEvaluate) {
      busy = true;
      message = zh() ? "正在获取场景评分…" : "Fetching scene scores…";
      render();
      void options.adapter.evaluate(target.dataset.scenarioEvaluate).then(async () => {
        await load(true);
        message = zh() ? "场景评分已更新。" : "Scene scores updated.";
        render();
      }).catch((error) => { message = String(error); busy = false; render(); });
    }
    if (target.dataset.scenarioOpen) {
      busy = true; message = zh() ? "正在载入所选方案…" : "Opening scenario…"; render();
      void options.adapter.open(target.dataset.scenarioOpen).then(async (next) => {
        await options.loadScenario(next);
        controller.close();
        options.flashStatus(zh() ? "已在主画布打开所选方案。" : "The selected scenario is open on the main canvas.");
      }).catch((error) => { message = String(error); busy = false; render(); });
    }
    if (target.dataset.scenarioAction === "compare") {
      busy = true; message = zh() ? "正在计算比较矩阵…" : "Building comparison matrix…"; render();
      void options.adapter.compare([...selected]).then((items) => { comparison = items; message = ""; busy = false; render(); }).catch((error) => { message = String(error); busy = false; render(); });
    }
    if (target.dataset.scenarioAction === "split") {
      const scenarios = [...selected]
        .map((id) => workspace?.scenarios.find((scenario) => scenario.id === id))
        .filter((scenario): scenario is ProfessionalScenario => Boolean(scenario));
      busy = true; message = zh() ? "正在载入同屏比较…" : "Loading split-screen comparison…"; render();
      void options.openSplitComparison(scenarios).then((opened) => {
        busy = false;
        if (opened) {
          controller.close();
          options.flashStatus(zh() ? "已进入同屏比较；视角与漫游操作会同步到所有画面。" : "Split view is active; camera and roaming controls are synchronized.");
          return;
        }
        message = zh() ? "同屏比较未能打开，请检查所选方案的 3D 场景文件。" : "Split view could not open. Check the selected scenarios' 3D scene files.";
        render();
      }).catch((error) => { message = String(error); busy = false; render(); });
    }
    if (target.dataset.scenarioAction === "generate") {
      const metrics: ScenarioMetric[] = ["walkability", "safety", "beauty"];
      const goalWeights = Object.fromEntries(metrics.map((metric) => {
        const input = root.querySelector<HTMLInputElement>(`[data-scenario-weight="${metric}"]`);
        const value = Math.max(0, Math.min(100, Number(input?.value ?? 0)));
        return [metric, Number.isFinite(value) ? value : 0];
      })) as ScenarioGoalWeights;
      if (Object.values(goalWeights).filter((value) => value > 0).length < 2) {
        message = zh() ? "请至少为两个目标设置大于 0 的权重。" : "Set a weight greater than zero for at least two objectives.";
        render();
        return;
      }
      busy = true; message = zh() ? "正在生成、评价并筛选 3 个局部 C 候选…" : "Generating, evaluating, and selecting three local C candidates…"; render();
      void options.adapter.generate(goalWeights).then(async (generated) => {
        workspace = generated.workspace;
        const selectedCandidate = generated.workspace.scenarios.find((scenario) => scenario.id === generated.selectedScenarioId);
        await options.loadScenario(generated.target);
        const baseline = latestScenario(generated.workspace.scenarios, "baseline");
        if (selectedCandidate) {
          selected = new Set([baseline?.id, selectedCandidate.id].filter(Boolean) as string[]);
          focusedId = selectedCandidate.id;
        }
        comparison = [];
        message = zh() ? `已生成并打开 ${selectedCandidate?.shortLabel ?? "C"}。` : `Generated and opened ${selectedCandidate?.shortLabel ?? "C"}.`;
        busy = false;
        render();
      }).catch((error) => { message = String(error); busy = false; render(); });
    }
    if (target.dataset.scenarioAction === "edit-2d") {
      controller.close();
      window.location.hash = "scene-graph";
    }
    if (target.dataset.scenarioAction === "edit-3d") {
      busy = true; message = zh() ? "正在打开最新 A 并进入 3D 编辑…" : "Opening the latest A for 3D editing…"; render();
      void options.adapter.prepareManualEdit().then(async (next) => {
        await options.loadScenario(next);
        controller.close();
        await options.enterManualEdit();
        options.flashStatus(zh() ? "已打开最新 A；保存 3D 编辑后会创建 B。" : "The latest A is open. Saving a 3D edit will create B.");
      }).catch((error) => { message = String(error); busy = false; render(); });
    }
  }, { signal });

  window.addEventListener("roadgen3d:scenario-revision-saved", () => {
    if (root.hidden || busy) return;
    void load(true).catch((error) => {
      message = String(error);
      busy = false;
      render();
    });
  }, { signal });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !root.hidden && !busy) controller.close();
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
