import { apiJson } from "./viewer-api";

const STORAGE_KEY = "roadgen3d:street-design-parameters:v2";

type Level = "low" | "medium" | "high";
type SkeletonField = "laneCount" | "laneWidthM" | "sidewalkWidthM" | "furnishingWidthM";
type SkeletonLevelField = SkeletonField | "junctionCornerRadiusM" | "medianWidthM";

export type SceneAssetRef = {
  manifestName: string;
  assetId: string;
  fingerprint: string;
  category: string;
  label: string;
};

export type FurnitureCategoryParameters = {
  enabled: boolean;
  targetCountPer100M: number;
  preferredSpacingM: number;
  minimumSpacingM: number;
  roadSetbackM: number;
  allowedZones: string[];
  assetRefs?: SceneAssetRef[];
};

export type StreetDesignParameterSpec = {
  schemaVersion: "roadgen3d.street-design-parameters.v2";
  source: { sourceRevision: number; sourceFingerprint: string; geometryLocked: true };
  skeleton: {
    laneCount: number;
    laneWidthM: number;
    sidewalkWidthM: number;
    furnishingWidthM: number;
    curbWidthM: number;
    junctionCornerPolicy: "source" | "auto" | "fixed";
    junctionCornerRadiusM?: number;
    median: { enabled: boolean; kind: "raised" | "planted"; widthM: number };
    busStop: { enabled: boolean; placement: "curbside" | "bay" };
  };
  furniture: {
    globalDensity: number;
    style: "civic_clean" | "lush_natural" | "transit_modern";
    categories: Record<string, FurnitureCategoryParameters>;
  };
  buildings: { representation: "transparent_massing" | "asset"; footprintLocked: true };
  seed: number;
};

type NumericControl = {
  values: Record<Level, number>;
  minimum: number;
  maximum: number;
  unit?: string;
};

type FurnitureControl = NumericControl & {
  minimumSpacingM: number;
  roadSetbackM: number;
  allowedZones: string[];
  preferredSpacingByLevelM: Record<Level, number>;
};

type ParameterControls = {
  parameter_schema_version: StreetDesignParameterSpec["schemaVersion"];
  levels: Level[];
  skeleton: Record<SkeletonLevelField, NumericControl>;
  furniture: {
    globalDensity: NumericControl;
    styles: StreetDesignParameterSpec["furniture"]["style"][];
    categories: Record<string, FurnitureControl>;
  };
  default_seed: number;
};

type SourceValues = Partial<Pick<StreetDesignParameterSpec["skeleton"], SkeletonField | "curbWidthM">>;

type Deps = {
  skeletonHostEl: HTMLElement;
  furnitureHostEl: HTMLElement;
  summaryEl: HTMLElement;
  seedEl: HTMLInputElement;
  allowCustom: boolean;
  getSource(): { revision: number; fingerprint: string; values?: SourceValues } | null;
  onChange(): void;
};

export type ViewerParameterDesignController = {
  initialize(): Promise<void>;
  generationOptions(): Record<string, unknown>;
  currentSpec(): StreetDesignParameterSpec | null;
  validationIssues(): string[];
  refreshSource(): void;
  destroy(): void;
};

const SKELETON_LABELS: Record<SkeletonLevelField, string> = {
  laneCount: "车道数量",
  laneWidthM: "单车道宽度",
  sidewalkWidthM: "单侧人行道宽度",
  furnishingWidthM: "单侧设施带宽度",
  junctionCornerRadiusM: "路口圆角半径",
  medianWidthM: "中岛宽度",
};

const CATEGORY_LABELS: Record<string, string> = {
  bench: "座椅",
  lamp: "路灯",
  trash: "垃圾桶",
  tree: "树木",
  bus_stop: "公交站",
  mailbox: "邮箱",
  hydrant: "消防栓",
  bollard: "护柱",
};

const LEVEL_LABELS: Record<Level, string> = { low: "低", medium: "中", high: "高" };
const STYLE_LABELS: Record<StreetDesignParameterSpec["furniture"]["style"], string> = {
  civic_clean: "简洁市政",
  lush_natural: "绿荫自然",
  transit_modern: "现代公交",
};

export function createViewerParameterDesignController(deps: Deps): ViewerParameterDesignController {
  const abortController = new AbortController();
  const { signal } = abortController;
  let controls: ParameterControls | null = null;
  let spec: StreetDesignParameterSpec | null = null;
  let fieldSources: Record<string, "source" | "manual" | "system_default"> = {};

  function sourceMatches(): boolean {
    const source = deps.getSource();
    return Boolean(source && spec
      && source.revision === spec.source.sourceRevision
      && source.fingerprint === spec.source.sourceFingerprint);
  }

  function buildDefaultSpec(): StreetDesignParameterSpec | null {
    const source = deps.getSource();
    if (!source || !controls) return null;
    const sourceValue = <K extends SkeletonField>(field: K): number => {
      const candidate = Number(source.values?.[field]);
      return Number.isFinite(candidate) ? candidate : controls!.skeleton[field].values.medium;
    };
    const categories = Object.fromEntries(Object.entries(controls.furniture.categories).map(([category, control]) => {
      const target = control.values.medium;
      return [category, {
        enabled: false,
        targetCountPer100M: target,
        preferredSpacingM: control.preferredSpacingByLevelM.medium,
        minimumSpacingM: control.minimumSpacingM,
        roadSetbackM: control.roadSetbackM,
        allowedZones: [...control.allowedZones],
      } satisfies FurnitureCategoryParameters];
    }));
    fieldSources = {
      "skeleton.laneCount": source.values?.laneCount != null ? "source" : "system_default",
      "skeleton.laneWidthM": source.values?.laneWidthM != null ? "source" : "system_default",
      "skeleton.sidewalkWidthM": source.values?.sidewalkWidthM != null ? "source" : "system_default",
      "skeleton.furnishingWidthM": source.values?.furnishingWidthM != null ? "source" : "system_default",
    };
    return {
      schemaVersion: "roadgen3d.street-design-parameters.v2",
      source: { sourceRevision: source.revision, sourceFingerprint: source.fingerprint, geometryLocked: true },
      skeleton: {
        laneCount: Math.round(sourceValue("laneCount")),
        laneWidthM: sourceValue("laneWidthM"),
        sidewalkWidthM: sourceValue("sidewalkWidthM"),
        furnishingWidthM: sourceValue("furnishingWidthM"),
        curbWidthM: Number.isFinite(Number(source.values?.curbWidthM)) ? Number(source.values!.curbWidthM) : 0.12,
        junctionCornerPolicy: "source",
        median: { enabled: false, kind: "raised", widthM: controls.skeleton.medianWidthM.values.medium },
        busStop: { enabled: false, placement: "curbside" },
      },
      furniture: { globalDensity: controls.furniture.globalDensity.values.medium, style: "civic_clean", categories },
      buildings: { representation: "transparent_massing", footprintLocked: true },
      seed: controls.default_seed,
    };
  }

  function persist(): void {
    if (!spec) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ spec, fieldSources }));
  }

  function restore(): boolean {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as {
        spec?: StreetDesignParameterSpec;
        fieldSources?: Record<string, "source" | "manual" | "system_default">;
      } | null;
      const source = deps.getSource();
      if (!stored?.spec || stored.spec.schemaVersion !== "roadgen3d.street-design-parameters.v2" || !source) return false;
      if (stored.spec.source.sourceRevision !== source.revision || stored.spec.source.sourceFingerprint !== source.fingerprint) return false;
      spec = stored.spec;
      fieldSources = { ...(stored.fieldSources ?? {}) };
      return true;
    } catch {
      return false;
    }
  }

  function ensureCurrentSource(): void {
    if (!controls) return;
    if (!sourceMatches()) {
      spec = buildDefaultSpec();
      if (spec) persist();
    }
    render();
  }

  function levelFor(control: NumericControl, value: number): Level | "custom" {
    for (const level of ["low", "medium", "high"] as const) {
      if (Math.abs(control.values[level] - value) < 1e-6) return level;
    }
    return "custom";
  }

  function levelSelect(field: SkeletonLevelField, value: number, sourceAvailable = false): string {
    const control = controls!.skeleton[field];
    const selectedLevel = levelFor(control, value);
    const options = [
      ...(sourceAvailable ? [`<option value="source" ${fieldSources[`skeleton.${field}`] === "source" ? "selected" : ""}>保持标注</option>`] : []),
      ...(["low", "medium", "high"] as const).map((level) => `<option value="${level}" ${selectedLevel === level && fieldSources[`skeleton.${field}`] !== "source" ? "selected" : ""}>${LEVEL_LABELS[level]} · ${formatNumber(control.values[level])}${unitLabel(control.unit)}</option>`),
      ...(deps.allowCustom ? [`<option value="custom" ${selectedLevel === "custom" && fieldSources[`skeleton.${field}`] !== "source" ? "selected" : ""}>自定义 · ${formatNumber(value)}${unitLabel(control.unit)}</option>`] : []),
    ];
    return `<select data-skeleton-level="${field}">${options.join("")}</select>`;
  }

  function renderSkeleton(): void {
    if (!spec || !controls) {
      deps.skeletonHostEl.innerHTML = `<div class="viewer-parameter-empty">等待已保存的2D标注。</div>`;
      return;
    }
    const sourceValues = deps.getSource()?.values ?? {};
    const rows = (["laneCount", "laneWidthM", "sidewalkWidthM", "furnishingWidthM"] as const).map((field) => {
      const value = spec!.skeleton[field];
      const control = controls!.skeleton[field];
      return `<div class="viewer-parameter-row"><div><strong>${SKELETON_LABELS[field]}</strong><small>${formatNumber(value)}${unitLabel(control.unit)}</small></div>${levelSelect(field, value, sourceValues[field] != null)}${deps.allowCustom ? `<input data-skeleton-custom="${field}" type="number" min="${control.minimum}" max="${control.maximum}" step="${field === "laneCount" ? 1 : 0.05}" value="${value}" />` : ""}</div>`;
    }).join("");
    const radius = spec.skeleton.junctionCornerRadiusM ?? controls.skeleton.junctionCornerRadiusM.values.medium;
    const totalWidth = calculateTotalWidth(spec);
    deps.skeletonHostEl.innerHTML = `
      <div class="viewer-parameter-ledger">${rows}
        <div class="viewer-parameter-row"><div><strong>${SKELETON_LABELS.junctionCornerRadiusM}</strong><small>${spec.skeleton.junctionCornerPolicy === "source" ? "保持标注" : `${formatNumber(radius)}m`}</small></div>
          <select data-junction-policy><option value="source" ${spec.skeleton.junctionCornerPolicy === "source" ? "selected" : ""}>保持标注</option><option value="auto" ${spec.skeleton.junctionCornerPolicy === "auto" ? "selected" : ""}>自动适配</option><option value="low" ${spec.skeleton.junctionCornerPolicy === "fixed" && levelFor(controls.skeleton.junctionCornerRadiusM, radius) === "low" ? "selected" : ""}>低 · 3.0m</option><option value="medium" ${spec.skeleton.junctionCornerPolicy === "fixed" && levelFor(controls.skeleton.junctionCornerRadiusM, radius) === "medium" ? "selected" : ""}>中 · 5.5m</option><option value="high" ${spec.skeleton.junctionCornerPolicy === "fixed" && levelFor(controls.skeleton.junctionCornerRadiusM, radius) === "high" ? "selected" : ""}>高 · 8.0m</option>${deps.allowCustom ? `<option value="custom" ${spec.skeleton.junctionCornerPolicy === "fixed" && levelFor(controls.skeleton.junctionCornerRadiusM, radius) === "custom" ? "selected" : ""}>自定义 · ${formatNumber(radius)}m</option>` : ""}</select>
          ${deps.allowCustom ? `<input data-junction-radius type="number" min="1" max="20" step="0.1" value="${radius}" />` : ""}</div>
        <div class="viewer-parameter-switch-row"><label><input data-median-enabled type="checkbox" ${spec.skeleton.median.enabled ? "checked" : ""}/><span><strong>设置道路中岛</strong><small>关闭时不占用车行宽度</small></span></label><select data-median-kind ${spec.skeleton.median.enabled ? "" : "disabled"}><option value="raised" ${spec.skeleton.median.kind === "raised" ? "selected" : ""}>硬质中岛</option><option value="planted" ${spec.skeleton.median.kind === "planted" ? "selected" : ""}>绿化中岛</option></select>${levelSelect("medianWidthM", spec.skeleton.median.widthM)}</div>
        <div class="viewer-parameter-switch-row"><label><input data-bus-enabled type="checkbox" ${spec.skeleton.busStop.enabled ? "checked" : ""}/><span><strong>设置额外公交站</strong><small>不会删除2D来源中的真实公交点</small></span></label><select data-bus-placement ${spec.skeleton.busStop.enabled ? "" : "disabled"}><option value="curbside" ${spec.skeleton.busStop.placement === "curbside" ? "selected" : ""}>路侧站</option><option value="bay" ${spec.skeleton.busStop.placement === "bay" ? "selected" : ""}>港湾站</option></select></div>
      </div>
      <section class="viewer-parameter-width-summary"><span>预计道路总宽</span><strong>${formatNumber(totalWidth)}m</strong><small>${spec.skeleton.laneCount} × ${formatNumber(spec.skeleton.laneWidthM)}m 车道 + 两侧人行道/设施带/路缘${spec.skeleton.median.enabled ? ` + ${formatNumber(spec.skeleton.median.widthM)}m 中岛` : ""}</small></section>
      <p class="viewer-parameter-locked-note"><strong>中心线、路口拓扑与建筑轮廓保持锁定。</strong><span>若要改变这些事实数据，请返回 01A 标注。</span></p>`;
  }

  function renderFurniture(): void {
    if (!spec || !controls) {
      deps.furnitureHostEl.innerHTML = `<div class="viewer-parameter-empty">等待已保存的2D标注。</div>`;
      return;
    }
    const densityLevel = levelFor(controls.furniture.globalDensity, spec.furniture.globalDensity);
    const categoryRows = Object.entries(controls.furniture.categories).map(([category, control]) => {
      const value = spec!.furniture.categories[category]!;
      const level = levelFor(control, value.targetCountPer100M);
      const options = (["low", "medium", "high"] as const).map((candidate) => `<option value="${candidate}" ${level === candidate ? "selected" : ""}>${LEVEL_LABELS[candidate]} · ${formatNumber(control.values[candidate])}/100m</option>`).join("");
      return `<article class="viewer-furniture-parameter-row" data-category="${category}">
        <label><input data-category-enabled="${category}" type="checkbox" ${value.enabled ? "checked" : ""}/><span><strong>${CATEGORY_LABELS[category] ?? category}</strong><small>${value.enabled ? `${formatNumber(value.targetCountPer100M)}/100m · 首选间距 ${formatNumber(value.preferredSpacingM)}m` : "关闭"}</small></span></label>
        <select data-category-level="${category}" ${value.enabled ? "" : "disabled"}>${options}${deps.allowCustom ? `<option value="custom" ${level === "custom" ? "selected" : ""}>自定义 · ${formatNumber(value.targetCountPer100M)}/100m</option>` : ""}</select>
        ${deps.allowCustom ? `<details><summary>精确参数</summary><div class="viewer-furniture-exact-grid"><label>目标/100m<input data-category-exact="${category}:targetCountPer100M" type="number" min="0" max="20" step="0.5" value="${value.targetCountPer100M}"/></label><label>首选间距<input data-category-exact="${category}:preferredSpacingM" type="number" min="2" max="240" step="0.5" value="${value.preferredSpacingM}"/></label><label>最小间距<input data-category-exact="${category}:minimumSpacingM" type="number" min="2" max="240" step="0.5" value="${value.minimumSpacingM}"/></label><label>道路退界<input data-category-exact="${category}:roadSetbackM" type="number" min="0" max="10" step="0.1" value="${value.roadSetbackM}"/></label><p>${value.allowedZones.join(" · ")}</p></div></details>` : ""}
      </article>`;
    }).join("");
    deps.furnitureHostEl.innerHTML = `
      <section class="viewer-furniture-global"><label><span>全局密度</span><select data-global-density>${(["low", "medium", "high"] as const).map((level) => `<option value="${level}" ${densityLevel === level ? "selected" : ""}>${LEVEL_LABELS[level]} · ${controls!.furniture.globalDensity.values[level]}</option>`).join("")}${deps.allowCustom ? `<option value="custom" ${densityLevel === "custom" ? "selected" : ""}>自定义 · ${formatNumber(spec.furniture.globalDensity)}</option>` : ""}</select></label><label><span>资产风格</span><select data-furniture-style>${controls.furniture.styles.map((style) => `<option value="${style}" ${spec!.furniture.style === style ? "selected" : ""}>${STYLE_LABELS[style]}</option>`).join("")}</select></label></section>
      <div class="viewer-furniture-parameter-list">${categoryRows}</div>`;
  }

  function renderSummary(): void {
    if (!spec) {
      deps.summaryEl.innerHTML = `<strong>等待已保存的2D标注</strong><small>参数不会修改道路中心线或建筑轮廓。</small>`;
      return;
    }
    const enabled = Object.entries(spec.furniture.categories).filter(([, value]) => value.enabled);
    deps.summaryEl.innerHTML = `<strong>确定性参数化生成</strong><dl><div><dt>道路总宽</dt><dd>${formatNumber(calculateTotalWidth(spec))}m</dd></div><div><dt>中岛</dt><dd>${spec.skeleton.median.enabled ? `${spec.skeleton.median.kind === "planted" ? "绿化" : "硬质"} ${formatNumber(spec.skeleton.median.widthM)}m` : "关闭"}</dd></div><div><dt>公交站</dt><dd>${spec.skeleton.busStop.enabled ? (spec.skeleton.busStop.placement === "bay" ? "港湾站" : "路侧站") : "关闭"}</dd></div><div><dt>家具</dt><dd>${enabled.length ? `${enabled.length} 类已开启` : "全部关闭"}</dd></div><div><dt>建筑</dt><dd>透明白模</dd></div><div><dt>Seed</dt><dd>${spec.seed}</dd></div></dl><small>不调用 LLM 或 RAG；每个字段以精确数值写入版本记录。</small>`;
  }

  function render(): void {
    renderSkeleton();
    renderFurniture();
    renderSummary();
    bindRenderedInputs();
  }

  function changed(path: string, source: "source" | "manual" | "system_default" = "manual"): void {
    fieldSources[path] = source;
    if (spec) spec.seed = Number.isFinite(deps.seedEl.valueAsNumber) ? Math.round(deps.seedEl.valueAsNumber) : 42;
    persist();
    render();
    deps.onChange();
  }

  function bindRenderedInputs(): void {
    deps.skeletonHostEl.querySelectorAll<HTMLSelectElement>("[data-skeleton-level]").forEach((select) => select.addEventListener("change", () => {
      if (!spec || !controls) return;
      const field = select.dataset.skeletonLevel as SkeletonLevelField;
      if (select.value === "source") {
        const sourceValue = Number(deps.getSource()?.values?.[field as SkeletonField]);
        if (Number.isFinite(sourceValue) && field in spec.skeleton) (spec.skeleton as unknown as Record<string, unknown>)[field] = sourceValue;
        fieldSources[`skeleton.${field}`] = "source";
      } else if (select.value !== "custom") {
        const value = controls.skeleton[field].values[select.value as Level];
        if (field === "medianWidthM") spec.skeleton.median.widthM = value;
        else (spec.skeleton as unknown as Record<string, unknown>)[field] = field === "laneCount" ? Math.round(value) : value;
      }
      changed(`skeleton.${field}`, select.value === "source" ? "source" : "manual");
    }));
    deps.skeletonHostEl.querySelectorAll<HTMLInputElement>("[data-skeleton-custom]").forEach((input) => input.addEventListener("change", () => {
      if (!spec || !Number.isFinite(input.valueAsNumber)) return;
      const field = input.dataset.skeletonCustom as SkeletonField;
      (spec.skeleton as unknown as Record<string, unknown>)[field] = field === "laneCount" ? Math.round(input.valueAsNumber) : input.valueAsNumber;
      changed(`skeleton.${field}`);
    }));
    deps.skeletonHostEl.querySelector<HTMLSelectElement>("[data-junction-policy]")?.addEventListener("change", (event) => {
      if (!spec || !controls) return;
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (value === "source" || value === "auto") {
        spec.skeleton.junctionCornerPolicy = value;
        delete spec.skeleton.junctionCornerRadiusM;
      } else {
        spec.skeleton.junctionCornerPolicy = "fixed";
        if (value !== "custom") spec.skeleton.junctionCornerRadiusM = controls.skeleton.junctionCornerRadiusM.values[value as Level];
        else spec.skeleton.junctionCornerRadiusM ??= controls.skeleton.junctionCornerRadiusM.values.medium;
      }
      changed("skeleton.junctionCornerPolicy");
    });
    deps.skeletonHostEl.querySelector<HTMLInputElement>("[data-junction-radius]")?.addEventListener("change", (event) => {
      if (!spec) return;
      spec.skeleton.junctionCornerPolicy = "fixed";
      spec.skeleton.junctionCornerRadiusM = (event.currentTarget as HTMLInputElement).valueAsNumber;
      changed("skeleton.junctionCornerRadiusM");
    });
    deps.skeletonHostEl.querySelector<HTMLInputElement>("[data-median-enabled]")?.addEventListener("change", (event) => { if (spec) { spec.skeleton.median.enabled = (event.currentTarget as HTMLInputElement).checked; changed("skeleton.median.enabled"); } });
    deps.skeletonHostEl.querySelector<HTMLSelectElement>("[data-median-kind]")?.addEventListener("change", (event) => { if (spec) { spec.skeleton.median.kind = (event.currentTarget as HTMLSelectElement).value as "raised" | "planted"; changed("skeleton.median.kind"); } });
    deps.skeletonHostEl.querySelector<HTMLInputElement>("[data-bus-enabled]")?.addEventListener("change", (event) => { if (spec) { spec.skeleton.busStop.enabled = (event.currentTarget as HTMLInputElement).checked; spec.furniture.categories.bus_stop!.enabled = spec.skeleton.busStop.enabled; changed("skeleton.busStop.enabled"); } });
    deps.skeletonHostEl.querySelector<HTMLSelectElement>("[data-bus-placement]")?.addEventListener("change", (event) => { if (spec) { spec.skeleton.busStop.placement = (event.currentTarget as HTMLSelectElement).value as "curbside" | "bay"; changed("skeleton.busStop.placement"); } });

    deps.furnitureHostEl.querySelector<HTMLSelectElement>("[data-global-density]")?.addEventListener("change", (event) => {
      if (!spec || !controls) return;
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (value !== "custom") spec.furniture.globalDensity = controls.furniture.globalDensity.values[value as Level];
      changed("furniture.globalDensity");
    });
    deps.furnitureHostEl.querySelector<HTMLSelectElement>("[data-furniture-style]")?.addEventListener("change", (event) => { if (spec) { spec.furniture.style = (event.currentTarget as HTMLSelectElement).value as StreetDesignParameterSpec["furniture"]["style"]; changed("furniture.style"); } });
    deps.furnitureHostEl.querySelectorAll<HTMLInputElement>("[data-category-enabled]").forEach((input) => input.addEventListener("change", () => { if (spec) { const category = input.dataset.categoryEnabled!; spec.furniture.categories[category]!.enabled = input.checked; if (category === "bus_stop") spec.skeleton.busStop.enabled = input.checked; changed(`furniture.categories.${category}.enabled`); } }));
    deps.furnitureHostEl.querySelectorAll<HTMLSelectElement>("[data-category-level]").forEach((select) => select.addEventListener("change", () => {
      if (!spec || !controls || select.value === "custom") return;
      const category = select.dataset.categoryLevel!;
      const control = controls.furniture.categories[category]!;
      const config = spec.furniture.categories[category]!;
      config.targetCountPer100M = control.values[select.value as Level];
      config.preferredSpacingM = control.preferredSpacingByLevelM[select.value as Level];
      changed(`furniture.categories.${category}.targetCountPer100M`);
    }));
    deps.furnitureHostEl.querySelectorAll<HTMLInputElement>("[data-category-exact]").forEach((input) => input.addEventListener("change", () => {
      if (!spec || !Number.isFinite(input.valueAsNumber)) return;
      const [category, field] = input.dataset.categoryExact!.split(":") as [string, keyof FurnitureCategoryParameters];
      (spec.furniture.categories[category]! as unknown as Record<string, unknown>)[field] = input.valueAsNumber;
      changed(`furniture.categories.${category}.${field}`);
    }));
  }

  function validationIssues(): string[] {
    if (!spec || !controls) return ["请先加载并保存2D标注。"];
    const issues: string[] = [];
    for (const field of ["laneCount", "laneWidthM", "sidewalkWidthM", "furnishingWidthM"] as const) {
      const value = spec.skeleton[field];
      const control = controls.skeleton[field];
      if (!Number.isFinite(value) || value < control.minimum || value > control.maximum) issues.push(`${SKELETON_LABELS[field]}超出允许范围。`);
    }
    if (spec.skeleton.median.enabled && spec.skeleton.laneCount < 2) issues.push("设置中岛至少需要两条车道。 ");
    if (spec.skeleton.busStop.enabled && spec.skeleton.furnishingWidthM < 0.6) issues.push("公交站至少需要0.6m设施带。 ");
    for (const [category, value] of Object.entries(spec.furniture.categories)) {
      if (value.enabled && value.preferredSpacingM < value.minimumSpacingM) issues.push(`${CATEGORY_LABELS[category] ?? category}的首选间距不能小于最小间距。`);
    }
    return issues;
  }

  deps.seedEl.addEventListener("input", () => { if (spec && Number.isFinite(deps.seedEl.valueAsNumber)) { spec.seed = Math.round(deps.seedEl.valueAsNumber); changed("seed"); } }, { signal });

  return {
    async initialize() {
      controls = await apiJson<ParameterControls>("/api/design/parameter-controls", { signal });
      if (!restore()) spec = buildDefaultSpec();
      if (spec) deps.seedEl.value = String(spec.seed);
      persist();
      render();
    },
    generationOptions() {
      ensureCurrentSource();
      if (!spec) return {};
      return {
        generation_mode: "parametric",
        skip_llm: true,
        derive_parameters_with_llm: false,
        knowledge_source: "none",
        street_design_parameter_spec: structuredClone(spec),
        street_design_parameter_field_sources: { ...fieldSources },
      };
    },
    currentSpec() { ensureCurrentSource(); return spec ? structuredClone(spec) : null; },
    validationIssues,
    refreshSource: ensureCurrentSource,
    destroy() { abortController.abort(); },
  };
}

function calculateTotalWidth(spec: StreetDesignParameterSpec): number {
  return spec.skeleton.laneCount * spec.skeleton.laneWidthM
    + (spec.skeleton.median.enabled ? spec.skeleton.median.widthM : 0)
    + 2 * (spec.skeleton.sidewalkWidthM + spec.skeleton.furnishingWidthM + spec.skeleton.curbWidthM);
}

function unitLabel(unit?: string): string { return unit === "m" ? "m" : ""; }
function formatNumber(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); }
