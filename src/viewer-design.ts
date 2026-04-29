/**
 * Design panel logic for the RoadGen3D Viewer.
 * 
 * Handles scene generation, branch runs, and progress tracking.
 * Extracted from app.ts to improve modularity.
 */

import { apiJson, postApiJson, sleep } from "./viewer-api";
import {
  DesignPreset,
  DesignSchemeVariant,
  SceneJobCreatePayload,
  SceneJobStatusPayload,
  SceneJobResult,
  SceneJobOperation,
  GenerationStep,
  GENERATION_STEPS,
  DESIGN_SCHEME_VARIANTS,
  VIEWER_DESIGN_PRESETS,
} from "./viewer-types";

// ============================================================================
// State
// ============================================================================

let designIsGenerating = false;
let lastDesignRunSnapshot: {
  payload: SceneJobStatusPayload;
  preset: DesignPreset | null;
  variant: DesignSchemeVariant;
  prompt: string;
  graphTemplateId: string;
} | null = null;

// ============================================================================
// Preset Selection
// ============================================================================

export function getSelectedPreset(presetId: string): DesignPreset | null {
  if (presetId === "__custom__") return null;
  return VIEWER_DESIGN_PRESETS.find((p) => p.id === presetId) ?? null;
}

export function configForDesignVariant(
  configPatch: Record<string, unknown>,
  variant: DesignSchemeVariant,
): Record<string, unknown> {
  const density = Number(configPatch.density ?? 0.6);
  const roadWidth = Number(configPatch.road_width_m ?? 13.5);
  return {
    ...configPatch,
    density: Math.max(0.1, Math.min(1.5, density * variant.densityMod)),
    road_width_m: Math.max(5.0, Math.min(30.0, roadWidth * variant.widthMod)),
  };
}

// ============================================================================
// Job Submission
// ============================================================================

export async function submitDesignJob(
  preset: DesignPreset | null,
  prompt: string,
  graphTemplateId: string,
  variant: DesignSchemeVariant,
): Promise<SceneJobCreatePayload> {
  const configPatch = preset ? configForDesignVariant(preset.configPatch, variant) : {};
  
  return postApiJson<SceneJobCreatePayload>("/api/scene/jobs", {
    draft: {
      normalized_scene_query: prompt,
      compose_config_patch: configPatch,
      citations_by_field: {},
      design_summary: prompt,
      risk_notes: [],
      parameter_sources_by_field: {},
    },
    scene_context: {
      layout_mode: "graph_template",
      aoi_bbox: null,
      city_name_en: null,
      reference_plan_id: null,
      graph_template_id: graphTemplateId,
    },
    patch_overrides: {},
    generation_options: {
      preset_id: preset?.id ?? "custom",
      random_seed: variant.seed,
    },
  });
}

// ============================================================================
// Job Polling
// ============================================================================

export function describeDesignJobProgress(payload: SceneJobStatusPayload): {
  progress: number;
  message: string;
  stage: string;
} {
  let progress = 10;
  let message = "Waiting for generation...";
  let stage = "queued";

  if (payload.status === "queued") {
    progress = 5;
    message = "Generation job queued...";
    stage = "queued";
  } else if (payload.status === "running" || payload.status === "processing") {
    stage = payload.stage || "processing";
    const stageProgress: Record<string, number> = {
      context_resolving: 15,
      asset_loading: 25,
      graph_parsing: 30,
      layout_generation: 40,
      constraint_solving: 50,
      asset_composition: 65,
      mesh_generation: 75,
      glb_export: 88,
      scene_rendering: 95,
      finalizing: 99,
    };
    progress = stageProgress[stage] ?? 50;
    message = `Generating: ${stage.replace(/_/g, " ")}`;
  } else if (payload.status === "succeeded") {
    progress = 100;
    message = "Generation complete. Loading scene...";
    stage = "finalizing";
  } else if (payload.status === "failed") {
    progress = 0;
    message = payload.error || "Generation failed.";
    stage = payload.stage || "processing";
  }

  if (typeof payload.progress === "number" && payload.progress > 0) {
    progress = Math.round(payload.progress);
  }

  const operations = payload.operations as SceneJobOperation[] | undefined;
  const currentOp = operations?.[operations.length - 1];
  if (typeof currentOp === "string" && currentOp.trim()) {
    message = currentOp;
  } else if (currentOp && typeof currentOp === "object") {
    message = currentOp.message || currentOp.name || currentOp.status || message;
  }

  return { progress, message, stage };
}

export async function waitForDesignJob(
  jobId: string,
  preset: DesignPreset | null,
  variant: DesignSchemeVariant,
  prompt: string,
  graphTemplateId: string,
  onProgress?: (payload: SceneJobStatusPayload) => void,
): Promise<SceneJobResult> {
  const DESIGN_POLL_INTERVAL_MS = 1500;
  const DESIGN_MAX_POLL_ATTEMPTS = 240;
  
  for (let attempt = 0; attempt < DESIGN_MAX_POLL_ATTEMPTS; attempt += 1) {
    const payload = await apiJson<SceneJobStatusPayload>(
      `/api/scene/jobs/${encodeURIComponent(jobId)}`
    );
    
    onProgress?.(payload);
    
    if (payload.status === "succeeded" && payload.result) {
      return payload.result;
    }
    if (payload.status === "failed") {
      throw new Error(payload.error || "Generation job failed.");
    }
    await sleep(DESIGN_POLL_INTERVAL_MS);
  }
  throw new Error("Generation timed out.");
}

// ============================================================================
// Generation
// ============================================================================

export async function runDesignGeneration(
  preset: DesignPreset | null,
  prompt: string,
  graphTemplateId: string,
  variantCount: number,
  onStatusUpdate: (message: string, tone?: "neutral" | "success" | "warning" | "error") => void,
  onProgress: (payload: SceneJobStatusPayload) => void,
  onComplete: (result: SceneJobResult) => void,
  onError: (error: Error) => void,
): Promise<void> {
  if (designIsGenerating) return;
  
  const variants = variantCount === 3 ? DESIGN_SCHEME_VARIANTS : [DESIGN_SCHEME_VARIANTS[0]!];
  designIsGenerating = true;
  
  try {
    onStatusUpdate("Submitting generation job...");
    
    const results: SceneJobResult[] = [];
    
    for (const variant of variants) {
      onStatusUpdate(`Submitting ${variant.name}...`);
      
      try {
        const createPayload = await submitDesignJob(preset, prompt, graphTemplateId, variant);
        onStatusUpdate(`${variant.name}: job ${createPayload.job_id} submitted.`);
        
        const result = await waitForDesignJob(
          createPayload.job_id,
          preset,
          variant,
          prompt,
          graphTemplateId,
          onProgress,
        );
        
        if (!result) {
          throw new Error("Generation finished without a result.");
        }
        
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : `${variant.name} generation failed.`;
        if (variants.length === 1) {
          throw err;
        }
        // Continue with other variants if one fails
      }
    }
    
    if (results.length === 0) {
      throw new Error("No schemes were generated successfully.");
    }
    
    const firstResult = results[0]!;
    lastDesignRunSnapshot = {
      payload: { job_id: "", status: "succeeded" } as SceneJobStatusPayload,
      preset,
      variant: variants[0]!,
      prompt,
      graphTemplateId,
    };
    
    onComplete(firstResult);
    onStatusUpdate(
      `${results.length}/${variants.length} schemes generated.`,
      "success"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Design generation failed.";
    onStatusUpdate(message, "error");
    onError(err instanceof Error ? err : new Error(message));
  } finally {
    designIsGenerating = false;
  }
}

export function getLastDesignRunSnapshot() {
  return lastDesignRunSnapshot;
}

export function isDesignGenerating(): boolean {
  return designIsGenerating;
}

// ============================================================================
// Stage Tree Data
// ============================================================================

export interface StageNodeData {
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "failed";
  progress: number;
  stepNumber: number;
}

export function getStageNodeData(
  step: GenerationStep,
  index: number,
  payload: SceneJobStatusPayload,
  currentStage: string,
  failed: boolean,
): StageNodeData {
  const currentIndex = GENERATION_STEPS.findIndex((s) => s.key === currentStage);
  const state =
    failed && index === currentIndex
      ? "failed"
      : index < currentIndex || step.key === "succeeded"
        ? "completed"
        : index === currentIndex
          ? "active"
          : "pending";
  const operation = payload.operations?.find((op) => op.stage === step.key);
  const progress = typeof operation?.progress === "number" ? operation.progress : step.progress;
  
  return {
    id: step.key,
    label: `${step.label} · ${Math.round(progress)}%`,
    status: state,
    progress,
    stepNumber: index + 1,
  };
}
