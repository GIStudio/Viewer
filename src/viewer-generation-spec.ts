import { apiJson } from "./viewer-api";
import { configForDesignVariant, effectiveDesignPrompt } from "./viewer-design";
import type {
  DesignPreset,
  DesignSchemeVariant,
  ScenarioDesign,
  SceneJobCreatePayload,
} from "./viewer-types";
import { DESIGN_SCHEME_VARIANTS } from "./viewer-types";
import type { NormalizedSceneSource } from "./workflow-controller";

export type GenerationPrimaryPage = "source" | "strategy" | "output";
export type GenerationStrategyPage = "assets" | "skeleton" | "furniture";

export type GenerationRequestSpec = Readonly<{
  sourceMode: "reference_annotation" | "graph_template";
  normalizedSource?: NormalizedSceneSource;
  graphTemplateId?: string;
  scenario?: ScenarioDesign | null;
  presetId: string;
  prompt: string;
  composeConfigPatch: Readonly<Record<string, unknown>>;
  generationOptions: Readonly<Record<string, unknown>>;
  variantCount: 1 | 3;
  baseSeed: number;
}>;

export type GenerationSpecBuildResult = Readonly<{
  spec: GenerationRequestSpec;
  issues: readonly string[];
}>;

export function buildGenerationRequestSpec(input: {
  normalizedSource?: NormalizedSceneSource | null;
  graphTemplateId?: string;
  scenario?: ScenarioDesign | null;
  preset?: DesignPreset | null;
  prompt?: string;
  semanticConfigPatch?: Record<string, unknown>;
  generationOptions?: Record<string, unknown>;
  variantCount?: number;
  baseSeed?: number;
}): GenerationSpecBuildResult {
  const normalizedSource = input.normalizedSource ?? undefined;
  const sourceMode = normalizedSource ? "reference_annotation" : "graph_template";
  const graphTemplateId = sourceMode === "graph_template" ? String(input.graphTemplateId ?? "").trim() : undefined;
  const scenario = input.scenario ?? null;
  const scenarioPatch = scenario?.compose_config_patch ?? {};
  const issues: string[] = [];
  if (sourceMode === "graph_template" && !graphTemplateId) {
    issues.push("Graph-template 模式必须选择明确的模板 ID。");
  }
  if (
    sourceMode === "reference_annotation"
    && scenario?.template_patch
    && Object.keys(scenarioPatch).length === 0
  ) {
    issues.push("当前结构方案只包含 graph-template 操作，不能应用到 ReferenceAnnotation。");
  }
  if (scenario?.enabled === false) {
    issues.push(scenario.excluded_reason_zh || "当前结构方案不可用于生成。");
  }
  const baseSeed = Number.isFinite(input.baseSeed) ? Math.round(Number(input.baseSeed)) : 42;
  const variantCount: 1 | 3 = input.variantCount === 3 ? 3 : 1;
  const preset = input.preset ?? null;
  const prompt = effectiveDesignPrompt(preset, input.prompt ?? "", scenario);
  return {
    spec: Object.freeze({
      sourceMode,
      ...(normalizedSource ? { normalizedSource } : {}),
      ...(graphTemplateId ? { graphTemplateId } : {}),
      scenario,
      presetId: preset?.id ?? "custom",
      prompt,
      composeConfigPatch: Object.freeze({
        ...(preset?.configPatch ?? {}),
        ...scenarioPatch,
        ...(input.semanticConfigPatch ?? {}),
      }),
      generationOptions: Object.freeze({ ...(input.generationOptions ?? {}) }),
      variantCount,
      baseSeed,
    }),
    issues: Object.freeze(issues),
  };
}

export function generationVariants(spec: GenerationRequestSpec): DesignSchemeVariant[] {
  const variants = spec.variantCount === 3 ? DESIGN_SCHEME_VARIANTS : [DESIGN_SCHEME_VARIANTS[0]!];
  const baseOffset = DESIGN_SCHEME_VARIANTS[0]?.seed ?? 42;
  return variants.map((variant) => ({
    ...variant,
    seed: spec.baseSeed + (variant.seed - baseOffset),
  }));
}

export async function submitGenerationJob(
  spec: GenerationRequestSpec,
  variant: DesignSchemeVariant,
  signal?: AbortSignal,
): Promise<SceneJobCreatePayload> {
  const scenario = spec.scenario;
  const scenarioId = scenario?.scenario_id || "";
  const composeConfigPatch = configForDesignVariant({ ...spec.composeConfigPatch }, variant);
  const usesExplicitParameters = spec.generationOptions.street_design_parameter_spec != null;
  const sceneContext = spec.sourceMode === "reference_annotation"
    ? {
        layout_mode: "reference_annotation",
        reference_annotation: spec.normalizedSource!.referenceAnnotation,
        source_context: {
          source: spec.normalizedSource!.sourceContext.source ?? spec.normalizedSource!.source,
          aligned_buildings: spec.normalizedSource!.sourceContext.aligned_buildings ?? [],
          source_alignment: spec.normalizedSource!.sourceContext.source_alignment ?? { status: "n/a" },
        },
        scenario_id: scenarioId || null,
        scenario_title: scenario?.title_zh || null,
        scenario_design_variant: scenarioId ? scenario : null,
      }
    : {
        layout_mode: "graph_template",
        aoi_bbox: null,
        city_name_en: null,
        reference_plan_id: null,
        graph_template_id: spec.graphTemplateId,
        scenario_id: scenarioId || null,
        scenario_title: scenario?.title_zh || null,
        scenario_design_variant: scenarioId ? scenario : null,
        ...(scenario?.template_patch ? { template_patch: scenario.template_patch } : {}),
      };
  return apiJson<SceneJobCreatePayload>("/api/scene/jobs", {
    method: "POST",
    body: JSON.stringify({
      draft: {
        normalized_scene_query: spec.prompt || "Generate a reviewable street scene from the approved source.",
        compose_config_patch: composeConfigPatch,
        citations_by_field: {},
        design_summary: spec.prompt || "Approved source generation",
        risk_notes: spec.normalizedSource?.warnings ?? [],
        parameter_sources_by_field: {},
      },
      scene_context: sceneContext,
      patch_overrides: {},
      generation_options: {
        ...(!usesExplicitParameters ? { preset_id: spec.presetId } : {}),
        random_seed: variant.seed,
        design_variant_id: variant.id,
        design_variant_name: variant.name,
        source_mode: spec.sourceMode,
        ...(scenarioId ? {
          scenario_id: scenarioId,
          scenario_compose_patch_applied: Object.keys(scenario?.compose_config_patch ?? {}).length > 0,
        } : {}),
        ...spec.generationOptions,
      },
    }),
    signal,
  });
}

export async function cancelGenerationJob(jobId: string): Promise<void> {
  await apiJson(`/api/scene/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}
