import type { ViewerComparisonMetadata, ViewerManifest } from "./viewer-types";

type JsonRecord = Record<string, unknown>;

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function finiteNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function semanticProfilePart(summary: JsonRecord, index: number): string {
  const pair = cleanString(summary.semantic_profile_pair);
  if (!pair.includes("+")) {
    return "";
  }
  return cleanString(pair.split("+")[index]);
}

export function metadataFromManifest(manifest: ViewerManifest): ViewerComparisonMetadata {
  const summary = asRecord(manifest.summary);
  const comparison = manifest.comparison_metadata ?? {};
  const skeletonProfile = comparison.skeleton_design_profile
    || cleanString(summary.skeleton_design_profile)
    || semanticProfilePart(summary, 0);
  const furnitureProfile = comparison.street_furniture_profile
    || cleanString(summary.street_furniture_profile)
    || semanticProfilePart(summary, 1);

  return {
    ...comparison,
    preset_id: comparison.preset_id || cleanString(summary.preset_id) || cleanString(summary.benchmark_preset_id),
    preset_label: comparison.preset_label || cleanString(summary.preset_name) || cleanString(summary.preset_label),
    scenario_id: comparison.scenario_id || cleanString(summary.scenario_id),
    scenario_title: comparison.scenario_title || cleanString(summary.scenario_title),
    graph_template_id: comparison.graph_template_id
      || cleanString(summary.graph_template_id)
      || cleanString(summary.base_graph_template_id)
      || cleanString(summary.plan_id),
    skeleton_design_profile: skeletonProfile,
    street_furniture_profile: furnitureProfile,
    curated_street_assets_profile: comparison.curated_street_assets_profile
      || cleanString(summary.curated_street_assets_profile),
    furniture_balance_policy: comparison.furniture_balance_policy
      || cleanString(summary.furniture_balance_policy),
    random_seed: comparison.random_seed ?? finiteNumber(summary.random_seed),
    density: comparison.density ?? finiteNumber(summary.density),
    road_width_m: comparison.road_width_m ?? finiteNumber(summary.road_width_m),
    lane_count: comparison.lane_count ?? finiteNumber(summary.lane_count),
    style_preset: comparison.style_preset || cleanString(summary.style_preset) || cleanString(summary.visual_style_preset),
    instance_count: comparison.instance_count ?? finiteNumber(summary.instance_count),
    production_step_ids: comparison.production_step_ids ?? manifest.production_steps?.map((step) => step.step_id),
  };
}

export function formatMetadataValue(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }
  if (typeof value === "number") {
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}${suffix}`;
  }
  return String(value);
}
