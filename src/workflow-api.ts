import type { ConvertedGraphPayload, ReferenceAnnotation } from "./sg-types";
import type {
  LayoutEditCommand,
  NormalizedSceneSource,
  SceneRevision,
  WorkflowCapabilities,
  WorkflowSourceDescriptor,
} from "./workflow-controller";
import type { SceneJobCreatePayload, SceneJobStatusPayload } from "./viewer-types";
import type { Feature, FeatureCollection } from "geojson";
import { apiJson, postApiJson } from "./viewer-api";

export type Wgs84Bbox = readonly [number, number, number, number];
export type SourceProducer = "manual" | "ai" | "import" | "catalog" | "osm";

export type SourceImageReference = {
  width_px: number;
  height_px: number;
  pixels_per_meter: number;
  bbox_wgs84?: Wgs84Bbox;
};

export type NormalizeReferenceAnnotationRequest = {
  source: {
    kind: "reference_annotation";
    source_id: string;
    producer: SourceProducer;
    annotation: ReferenceAnnotation;
  };
  compose_config?: Record<string, unknown>;
};

export type NormalizeGeoJsonRequest = {
  source: {
    kind: "geojson";
    source_id: string;
    producer: SourceProducer;
    coordinate_space: "image_px" | "EPSG:4326";
    geojson: Record<string, unknown>;
    image: SourceImageReference;
  };
  compose_config?: Record<string, unknown>;
};

export type NormalizeSceneSourceRequest = NormalizeReferenceAnnotationRequest | NormalizeGeoJsonRequest;

export type AlignedBuilding = {
  osm_id: string;
  polygon_xz: Array<[number, number]>;
  tags: Record<string, unknown>;
};

export type SourceAlignment = Record<string, unknown> & {
  status: "aligned" | "n/a";
  reason?: string;
};

export type NormalizedSceneSourceResponse = ConvertedGraphPayload & {
  source: {
    schema_version: "roadgen3d_scene_source_v1";
    source_id: string;
    kind: string;
    producer: SourceProducer;
    normalized_annotation_version: string;
  };
  geojson: Record<string, unknown> | null;
  warnings: string[];
  aligned_buildings: AlignedBuilding[];
  source_alignment: SourceAlignment;
  osm_annotation_context?: Record<string, unknown>;
  llm?: {
    provider?: string;
    protocol?: string;
    model?: string;
  };
};

export type ExtractSceneSourceRequest = {
  source_id: string;
  image_data_url: string;
  prompt?: string;
  image: SourceImageReference;
};

export type OsmBuildingsRequest = {
  source_id: string;
  aoi_bbox: Wgs84Bbox;
};

export type OsmSceneSourceRequest = OsmBuildingsRequest & { force_refetch?: boolean };

export type OsmJobOperation = {
  timestamp: string;
  stage: string;
  progress: number;
  message: string;
  detail: Record<string, unknown>;
};

export type OsmRoadPreview = {
  preview_id: string;
  source_id: string;
  retrieval_bbox: [number, number, number, number];
  logical_roads: FeatureCollection;
  context_geojson: FeatureCollection;
  feature_counts: Record<string, number>;
  cache_hit: boolean;
  fingerprint: string;
  raw_artifact_id?: string;
};

export type OsmAcquisitionJob = {
  id: string;
  kind: "osm_acquisition" | "osm_preview";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  stage: string;
  progress: number;
  progress_mode?: "determinate" | "indeterminate";
  message: string;
  detail: Record<string, unknown>;
  operations: OsmJobOperation[];
  result: Partial<OsmRoadPreview>;
  error: string;
};

export type OsmRoadStudySelection = {
  seed_logical_road_id: string;
  hop_count: 1 | 2;
  context_buffer_m: number;
};

export type OsmRoadStudyResponse = NormalizedSceneSourceResponse & {
  osm_study: {
    selection: OsmRoadStudySelection;
    selected_way_ids: number[];
    hop_layers: Record<string, 0 | 1 | 2>;
    study_area: Feature;
    included_feature_counts: Record<string, number>;
    annotation_bbox: [number, number, number, number];
    retrieval_bbox: [number, number, number, number];
    warnings: string[];
  };
  osm_annotation_context: Record<string, unknown>;
};

export type OsmBuildingsResponse = {
  source: WorkflowSourceDescriptor;
  geojson: Record<string, unknown>;
  warnings: string[];
  summary: Record<string, unknown>;
};

export type HealthResponse = {
  capabilities?: WorkflowCapabilities;
};

export type SceneLayoutEditRequest = {
  layout_path: string;
  base: {
    revision: number;
    sha256: string;
  };
  commands: LayoutEditCommand[];
};

export type SceneLayoutEditResponse = {
  source: SceneRevision;
  revision: SceneRevision & {
    layout_path: string;
    scene_glb_path: string;
    lineage_id: string;
  };
  applied_commands: Array<Record<string, unknown>>;
  undo: {
    base: {
      revision: number;
      sha256: string;
    };
    commands: LayoutEditCommand[];
  };
};

function countNormalizedFeatures(payload: NormalizedSceneSourceResponse): Record<string, number> {
  const annotation = payload.annotation;
  return {
    roads: annotation.centerlines.length,
    junctions: annotation.junctions.length,
    regions: annotation.regions.length + (annotation.derived_regions?.length ?? 0),
    buildings: annotation.building_regions.length + payload.aligned_buildings.length,
    functional_zones: annotation.functional_zones.length,
    furniture: annotation.centerlines.reduce(
      (total, centerline) => total + centerline.street_furniture_instances.length,
      annotation.functional_zones.reduce((total, zone) => total + zone.furniture_instances.length, 0),
    ),
  };
}

export function toNormalizedSceneSource(payload: NormalizedSceneSourceResponse): NormalizedSceneSource {
  return {
    referenceAnnotation: payload.annotation,
    graph: payload.graph,
    source: payload.source,
    geojson: payload.geojson,
    warnings: payload.warnings,
    sourceContext: {
      source: payload.source,
      aligned_buildings: payload.aligned_buildings,
      source_alignment: payload.source_alignment,
      osm_annotation_context: payload.osm_annotation_context ?? null,
    },
    featureCounts: countNormalizedFeatures(payload),
    normalizedAt: new Date().toISOString(),
  };
}

export async function normalizeSceneSource(
  request: NormalizeSceneSourceRequest,
  signal?: AbortSignal,
): Promise<NormalizedSceneSourceResponse> {
  return apiJson<NormalizedSceneSourceResponse>("/api/scene-sources/normalize", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}

export async function extractSceneSource(
  request: ExtractSceneSourceRequest,
  signal?: AbortSignal,
): Promise<NormalizedSceneSourceResponse> {
  return apiJson<NormalizedSceneSourceResponse>("/api/scene-sources/extract", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}

export async function loadOsmBuildings(
  request: OsmBuildingsRequest,
  signal?: AbortSignal,
): Promise<OsmBuildingsResponse> {
  return apiJson<OsmBuildingsResponse>("/api/scene-sources/osm-buildings", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}

export async function loadOsmSceneSource(
  request: OsmSceneSourceRequest,
  signal?: AbortSignal,
): Promise<NormalizedSceneSourceResponse> {
  return apiJson<NormalizedSceneSourceResponse>("/api/scene-sources/osm", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}

export async function createOsmAcquisitionJob(
  request: OsmSceneSourceRequest,
  signal?: AbortSignal,
): Promise<OsmAcquisitionJob> {
  return apiJson<OsmAcquisitionJob>("/api/scene-sources/osm/jobs", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}

export async function loadOsmAcquisitionJob(jobId: string, signal?: AbortSignal): Promise<OsmAcquisitionJob> {
  return apiJson<OsmAcquisitionJob>(`/api/scene-sources/osm/jobs/${encodeURIComponent(jobId)}`, { signal });
}

export async function cancelOsmAcquisitionJob(jobId: string): Promise<OsmAcquisitionJob> {
  return apiJson<OsmAcquisitionJob>(`/api/scene-sources/osm/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}

export async function retryOsmAcquisitionJob(jobId: string): Promise<OsmAcquisitionJob> {
  return apiJson<OsmAcquisitionJob>(`/api/scene-sources/osm/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
}

export async function selectOsmRoadStudyArea(
  previewId: string,
  selection: OsmRoadStudySelection & { source_id?: string },
  signal?: AbortSignal,
): Promise<OsmRoadStudyResponse> {
  return apiJson<OsmRoadStudyResponse>(`/api/scene-sources/osm/previews/${encodeURIComponent(previewId)}/selection`, {
    method: "POST",
    body: JSON.stringify(selection),
    signal,
  });
}

export async function loadWorkflowCapabilities(signal?: AbortSignal): Promise<WorkflowCapabilities> {
  const response = await apiJson<HealthResponse>("/api/health", { signal });
  return response.capabilities ?? {};
}

export async function submitWorkflowSceneJob(input: {
  normalized: NormalizedSceneSource;
  prompt: string;
  presetId: string;
  configPatch?: Record<string, unknown>;
  generationOptions?: Record<string, unknown>;
  randomSeed?: number;
  signal?: AbortSignal;
}): Promise<SceneJobCreatePayload> {
  const normalizedPrompt = input.prompt.trim() || "Generate the approved reference annotation as a reviewable street scene.";
  return apiJson<SceneJobCreatePayload>("/api/scene/jobs", {
    method: "POST",
    body: JSON.stringify({
      draft: {
        normalized_scene_query: normalizedPrompt,
        compose_config_patch: input.configPatch ?? {},
        citations_by_field: {},
        design_summary: normalizedPrompt,
        risk_notes: input.normalized.warnings,
        parameter_sources_by_field: {},
      },
      scene_context: {
        layout_mode: "reference_annotation",
        reference_annotation: input.normalized.referenceAnnotation,
        source_context: {
          source: input.normalized.sourceContext.source ?? input.normalized.source,
          aligned_buildings: input.normalized.sourceContext.aligned_buildings ?? [],
          source_alignment: input.normalized.sourceContext.source_alignment ?? { status: "n/a" },
        },
      },
      patch_overrides: {},
      generation_options: {
        preset_id: input.presetId || "custom",
        random_seed: input.randomSeed ?? 20260710,
        ...(input.generationOptions ?? {}),
      },
    }),
    signal: input.signal,
  });
}

export async function loadSceneJob(jobId: string, signal?: AbortSignal): Promise<SceneJobStatusPayload> {
  return apiJson<SceneJobStatusPayload>(`/api/scene/jobs/${encodeURIComponent(jobId)}`, { signal });
}

export async function cancelSceneJob(jobId: string, signal?: AbortSignal): Promise<SceneJobStatusPayload> {
  return apiJson<SceneJobStatusPayload>(`/api/scene/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    signal,
  });
}

export async function submitSceneLayoutEdits(
  request: SceneLayoutEditRequest,
  signal?: AbortSignal,
): Promise<SceneLayoutEditResponse> {
  return apiJson<SceneLayoutEditResponse>("/api/design/scene-layout-edits", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}
