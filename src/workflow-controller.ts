import type { ReferenceAnnotation } from "./sg-types";
import type { EvaluationResult } from "./viewer-evaluation";
import type { SceneJobOperation } from "./viewer-types";

export const WORKFLOW_STEPS = ["source", "review", "generate", "edit", "evaluate"] as const;
export const WORKFLOW_UNDO_EVENT = "roadgen3d:workflow-undo";
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];
export type WorkflowRequestKind = "normalize" | "extract" | "osm" | "generate" | "edit" | "evaluate" | "capabilities";

export type WorkflowSourceKind =
  | "reference_image"
  | "manual_annotation"
  | "annotation_json"
  | "geojson"
  | "ai_extraction"
  | "osm"
  /** @deprecated Legacy snapshots used a building-only OSM source kind. */
  | "osm_buildings"
  | "scenario_design";

export type WorkflowSourceDescriptor = Readonly<Record<string, unknown> & {
  kind?: string;
  provenance?: string;
  label?: string;
}>;

export type WorkflowSourceContext = Readonly<Record<string, unknown> & {
  aligned_buildings?: readonly Readonly<Record<string, unknown>>[];
  source_alignment?: Readonly<Record<string, unknown>> | null;
}>;

export type WorkflowSceneRef =
  | Readonly<{ kind: "local_layout"; layoutPath: string }>
  | Readonly<{ kind: "project_revision"; projectId: string; revisionId: string }>
  | Readonly<{ kind: "starter_demo"; demoId: string }>;

export type ProfessionalPipelineStage = "prepare" | "generate" | "review" | "edit" | "deliver";

export type AssetPreparationChoice = "current_manifest" | "default_transparent_massing" | null;

export type AssetCandidateManifest = Readonly<{
  name: string;
  label: string;
  fingerprint: string;
  eligibleCount: number;
  readyCount: number;
  categoryCounts: Readonly<Record<string, number>>;
  priority: number;
  activatedBy: "manual" | "asset_write";
  updatedAt: string;
  warnings?: readonly string[];
}>;

export type AssetPreparationState =
  | Readonly<{
      mode: "candidate_manifests";
      manifests: readonly AssetCandidateManifest[];
    }>
  | Readonly<{
      mode: "default_transparent_massing";
      manifests: readonly [];
    }>
  | null;

export type SceneReviewStatus = "not_available" | "pending" | "changes_requested" | "accepted";

export type AnnotationDraftStatus = "dirty" | "saving" | "validating" | "saved" | "validation_error";

export type ProfessionalAnnotationDraft = Readonly<{
  annotation: ReferenceAnnotation;
  fingerprint: string;
  sourceRevision: number;
  status: AnnotationDraftStatus;
  savedAt: string | null;
  validationErrors: readonly string[];
}>;

export type ProfessionalWorkflowDraft = Readonly<{
  version: 1;
  sourceRevision: number;
  sourceKind: WorkflowSourceKind | null;
  sourceImageDataUrl: string | null;
  sourceFileName: string | null;
  sourceGeojson: Readonly<Record<string, unknown>> | null;
  annotationDraft: ProfessionalAnnotationDraft;
  normalized: NormalizedSceneSource | null;
  approvedSourceRevision: number | null;
  sceneRef?: WorkflowSceneRef | null;
  sceneLayoutPath?: string | null;
  sceneRevision?: SceneRevision | null;
  sceneReviewStatus?: SceneReviewStatus;
  baselineRun?: WorkflowBaselineRun;
}>;

export type WorkflowBaselineRun = Readonly<{
  sourceRevision: number;
  jobId: string | null;
  status: "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "stale";
  stage: string;
  progress: number;
  message: string;
  operations: readonly SceneJobOperation[];
  error?: string;
}>;

export type NormalizedSceneSource = Readonly<{
  referenceAnnotation: ReferenceAnnotation;
  graph: Readonly<Record<string, unknown>> | null;
  source: WorkflowSourceDescriptor;
  geojson: Readonly<Record<string, unknown>> | null;
  warnings: readonly string[];
  sourceContext: WorkflowSourceContext;
  featureCounts: Readonly<Record<string, number>>;
  normalizedAt: string;
}>;

export type SceneRevision = Readonly<{
  revision: number;
  sha256: string;
  layout_path?: string;
  scene_glb_path?: string;
  lineage_id?: string;
}>;

export type MoveInstanceCommand = Readonly<{
  command_id: string;
  op: "move_instance";
  instance_id: string;
  position_xyz: readonly [number, number, number];
}>;

export type LayoutEditCommand = MoveInstanceCommand;

export type WorkflowCapabilities = Readonly<Record<string, unknown> & {
  llm?: Readonly<Record<string, unknown>>;
  vision?: Readonly<Record<string, unknown>>;
  qwen?: Readonly<Record<string, unknown>>;
}>;

export type WorkflowSnapshot = Readonly<{
  step: WorkflowStep;
  sourceRevision: number;
  sourceKind: WorkflowSourceKind | null;
  sourceImageDataUrl: string | null;
  sourceFileName: string | null;
  sourceGeojson: Readonly<Record<string, unknown>> | null;
  normalized: NormalizedSceneSource | null;
  annotationDraft: ProfessionalAnnotationDraft | null;
  approvedSourceRevision: number | null;
  sceneRef: WorkflowSceneRef | null;
  sceneLayoutPath: string | null;
  sceneRevision: SceneRevision | null;
  contextMassing: Readonly<Record<string, unknown>> | null;
  editPending: boolean;
  undoCommand: LayoutEditCommand | null;
  evaluation: EvaluationResult | null;
  assetPreparation: AssetPreparationState;
  /** @deprecated Read assetPreparation instead. */
  assetPreparationChoice: AssetPreparationChoice;
  sceneReviewStatus: SceneReviewStatus;
  baselineRun: WorkflowBaselineRun;
  capabilities: WorkflowCapabilities | null;
  busy: Readonly<Partial<Record<WorkflowRequestKind, boolean>>>;
  lastError: string | null;
}>;

export type WorkflowRequestToken = Readonly<{
  id: number;
  kind: WorkflowRequestKind;
  signal: AbortSignal;
  isCurrent: () => boolean;
}>;

export type TransitionResult = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }>;

export type WorkflowController = {
  getSnapshot(): WorkflowSnapshot;
  subscribe(listener: () => void): () => void;
  transition(step: WorkflowStep): TransitionResult;
  setSourceDraft(input: {
    kind: WorkflowSourceKind;
    imageDataUrl?: string | null;
    fileName?: string | null;
    geojson?: Record<string, unknown> | null;
  }): void;
  setNormalizedSource(source: NormalizedSceneSource): void;
  setAnnotationDraft(annotation: ReferenceAnnotation, fingerprint: string): number;
  setAnnotationDraftStatus(fingerprint: string, status: AnnotationDraftStatus, validationErrors?: readonly string[]): boolean;
  setValidatedAnnotation(source: NormalizedSceneSource, fingerprint: string, options?: { autoApprove?: boolean; expectedDraftFingerprint?: string }): boolean;
  restoreProfessionalDraft(draft: ProfessionalWorkflowDraft): void;
  approveReview(): TransitionResult;
  beginRequest(kind: WorkflowRequestKind): WorkflowRequestToken;
  endRequest(token: WorkflowRequestToken, error?: unknown): boolean;
  setGenerationStarted(): TransitionResult;
  setGeneratedScene(input: {
    layoutPath: string;
    sceneRef?: WorkflowSceneRef | null;
    sceneRevision?: SceneRevision | null;
    contextMassing?: Record<string, unknown> | null;
  }): boolean;
  setStarterPreview(demoId: string): void;
  materializeStarterDemo(input: {
    source: NormalizedSceneSource;
    sourceFingerprint: string;
    layoutPath: string;
    sceneRevision?: SceneRevision | null;
    demoId: string;
  }): boolean;
  setSceneRevision(revision: SceneRevision, undoCommand?: LayoutEditCommand | null): void;
  setEditPending(pending: boolean): void;
  setEvaluation(result: EvaluationResult): void;
  setAssetPreparation(state: AssetPreparationState): void;
  setAssetPreparationChoice(choice: Exclude<AssetPreparationChoice, null>): void;
  setSceneReviewStatus(status: Exclude<SceneReviewStatus, "not_available">): TransitionResult;
  setBaselineRun(run: WorkflowBaselineRun): void;
  updateBaselineRun(sourceRevision: number, patch: Partial<Omit<WorkflowBaselineRun, "sourceRevision">>): boolean;
  setCapabilities(capabilities: WorkflowCapabilities): void;
  reportError(error: unknown): void;
  clearError(): void;
  dispose(): void;
};

const INITIAL_BUSY: WorkflowSnapshot["busy"] = Object.freeze({});
const ASSET_PREPARATION_SESSION_KEY = "roadgen3d:professional-asset-preparation-v2";

function defaultAssetPreparationState(): AssetPreparationState {
  return Object.freeze({
    mode: "default_transparent_massing" as const,
    manifests: Object.freeze([]) as readonly [],
  });
}

function assetChoiceForState(state: AssetPreparationState): AssetPreparationChoice {
  if (!state) return null;
  return state.mode === "default_transparent_massing" ? "default_transparent_massing" : "current_manifest";
}

function normalizeAssetPreparationState(value: unknown): AssetPreparationState {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.mode === "default_transparent_massing") {
    return Object.freeze({
      mode: "default_transparent_massing" as const,
      manifests: Object.freeze([]) as readonly [],
    });
  }
  if (record.mode !== "candidate_manifests" || !Array.isArray(record.manifests)) return null;
  const manifests = record.manifests
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index): AssetCandidateManifest => Object.freeze({
      name: String(item.name ?? "").trim(),
      label: String(item.label ?? item.name ?? "").trim(),
      fingerprint: String(item.fingerprint ?? "").trim(),
      eligibleCount: Math.max(0, Number(item.eligibleCount ?? 0) || 0),
      readyCount: Math.max(0, Number(item.readyCount ?? 0) || 0),
      categoryCounts: Object.freeze({
        ...((item.categoryCounts as Record<string, number> | undefined) ?? {}),
      }),
      priority: index,
      activatedBy: item.activatedBy === "asset_write" ? "asset_write" : "manual",
      updatedAt: String(item.updatedAt ?? "").trim(),
      warnings: Object.freeze(Array.isArray(item.warnings) ? item.warnings.map(String) : []),
    }))
    .filter((item) => Boolean(item.name));
  if (!manifests.length) return null;
  return Object.freeze({ mode: "candidate_manifests" as const, manifests: Object.freeze(manifests) });
}

function loadAssetPreparationState(): AssetPreparationState {
  try {
    if (typeof sessionStorage === "undefined") return defaultAssetPreparationState();
    const stored = sessionStorage.getItem(ASSET_PREPARATION_SESSION_KEY);
    if (!stored) return defaultAssetPreparationState();
    return normalizeAssetPreparationState(JSON.parse(stored)) ?? defaultAssetPreparationState();
  } catch {
    return defaultAssetPreparationState();
  }
}

function persistAssetPreparationState(state: AssetPreparationState): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (state) sessionStorage.setItem(ASSET_PREPARATION_SESSION_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(ASSET_PREPARATION_SESSION_KEY);
  } catch {
    // Session persistence is best-effort; the live controller remains authoritative.
  }
}

function immutableCopy<T>(value: T): T {
  const cloned = structuredClone(value);
  const visited = new WeakSet<object>();
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) return;
    visited.add(candidate);
    for (const child of Object.values(candidate)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(cloned);
  return cloned;
}

function initialSnapshot(): WorkflowSnapshot {
  const assetPreparation = loadAssetPreparationState();
  return Object.freeze({
    step: "source",
    sourceRevision: 0,
    sourceKind: null,
    sourceImageDataUrl: null,
    sourceFileName: null,
    sourceGeojson: null,
    normalized: null,
    annotationDraft: null,
    approvedSourceRevision: null,
    sceneRef: null,
    sceneLayoutPath: null,
    sceneRevision: null,
    contextMassing: null,
    editPending: false,
    undoCommand: null,
    evaluation: null,
    assetPreparation,
    assetPreparationChoice: assetChoiceForState(assetPreparation),
    sceneReviewStatus: "not_available",
    baselineRun: Object.freeze({
      sourceRevision: 0,
      jobId: null,
      status: "idle",
      stage: "",
      progress: 0,
      message: "",
      operations: Object.freeze([]),
    }),
    capabilities: null,
    busy: INITIAL_BUSY,
    lastError: null,
  });
}

function transitionGuard(snapshot: WorkflowSnapshot, step: WorkflowStep): string | null {
  if (step === "review" && !snapshot.normalized) {
    return "Normalize a source before review.";
  }
  if (step === "generate" && snapshot.approvedSourceRevision !== snapshot.sourceRevision) {
    return "Approve the current normalized annotation before generation.";
  }
  if ((step === "edit" || step === "evaluate") && !snapshot.sceneLayoutPath) {
    return "Generate and load a scene before continuing.";
  }
  if (step === "evaluate" && snapshot.editPending) {
    return "Wait for the persistent layout edit to finish before evaluation.";
  }
  return null;
}

export function workflowRoute(step: WorkflowStep): "scene-graph" | "viewer" {
  return step === "source" || step === "review" ? "scene-graph" : "viewer";
}

export function createWorkflowController(): WorkflowController {
  let snapshot = initialSnapshot();
  let requestSequence = 0;
  const listeners = new Set<() => void>();
  const requests = new Map<WorkflowRequestKind, { id: number; controller: AbortController }>();

  const publish = (patch: Partial<WorkflowSnapshot>): void => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  };

  const setBusy = (kind: WorkflowRequestKind, value: boolean): void => {
    const busy = { ...snapshot.busy };
    if (value) busy[kind] = true;
    else delete busy[kind];
    publish({ busy: Object.freeze(busy) });
  };

  const controller: WorkflowController = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    transition(step) {
      const reason = transitionGuard(snapshot, step);
      if (reason) {
        publish({ lastError: reason });
        return Object.freeze({ ok: false, reason });
      }
      publish({ step, lastError: null });
      return Object.freeze({ ok: true });
    },
    setSourceDraft(input) {
      const nextRevision = snapshot.sourceRevision + 1;
      publish({
        step: "source",
        sourceRevision: nextRevision,
        sourceKind: input.kind,
        sourceImageDataUrl: input.imageDataUrl === undefined ? snapshot.sourceImageDataUrl : input.imageDataUrl,
        sourceFileName: input.fileName === undefined ? snapshot.sourceFileName : input.fileName,
        sourceGeojson: input.geojson === undefined ? snapshot.sourceGeojson : immutableCopy(input.geojson),
        normalized: null,
        annotationDraft: null,
        approvedSourceRevision: null,
        sceneRef: null,
        sceneLayoutPath: null,
        sceneRevision: null,
        contextMassing: null,
        editPending: false,
        undoCommand: null,
        evaluation: null,
        sceneReviewStatus: "not_available",
        baselineRun: Object.freeze({
          ...snapshot.baselineRun,
          status: snapshot.baselineRun.jobId ? "stale" : "idle",
          message: snapshot.baselineRun.jobId ? "The source changed; the previous baseline is stale." : "",
        }),
        lastError: null,
      });
    },
    setNormalizedSource(source) {
      const nextRevision = snapshot.sourceRevision + 1;
      publish({
        step: "review",
        sourceRevision: nextRevision,
        normalized: immutableCopy(source),
        annotationDraft: immutableCopy({
          annotation: source.referenceAnnotation,
          fingerprint: "",
          sourceRevision: nextRevision,
          status: "saved" as const,
          savedAt: new Date().toISOString(),
          validationErrors: [],
        }),
        approvedSourceRevision: null,
        sceneRef: null,
        sceneLayoutPath: null,
        sceneRevision: null,
        contextMassing: null,
        editPending: false,
        undoCommand: null,
        evaluation: null,
        sceneReviewStatus: "not_available",
        baselineRun: Object.freeze({
          ...snapshot.baselineRun,
          status: snapshot.baselineRun.jobId ? "stale" : "idle",
          message: snapshot.baselineRun.jobId ? "The source changed; the previous baseline is stale." : "",
        }),
        lastError: null,
      });
    },
    setAnnotationDraft(annotation, fingerprint) {
      const cleanFingerprint = fingerprint.trim();
      if (!cleanFingerprint) return snapshot.sourceRevision;
      if (snapshot.annotationDraft?.fingerprint === cleanFingerprint) {
        return snapshot.sourceRevision;
      }
      const nextRevision = snapshot.sourceRevision + 1;
      publish({
        sourceRevision: nextRevision,
        annotationDraft: immutableCopy({
          annotation,
          fingerprint: cleanFingerprint,
          sourceRevision: nextRevision,
          status: "dirty" as const,
          savedAt: null,
          validationErrors: [],
        }),
        approvedSourceRevision: null,
        sceneRef: null,
        sceneLayoutPath: null,
        sceneRevision: null,
        contextMassing: null,
        evaluation: null,
        sceneReviewStatus: "not_available",
        baselineRun: Object.freeze({
          ...snapshot.baselineRun,
          sourceRevision: nextRevision,
          status: snapshot.baselineRun.jobId ? "stale" : "idle",
          message: snapshot.baselineRun.jobId ? "The annotation changed; the previous baseline is stale." : "",
        }),
        lastError: null,
      });
      return nextRevision;
    },
    setAnnotationDraftStatus(fingerprint, status, validationErrors = []) {
      if (!snapshot.annotationDraft || snapshot.annotationDraft.fingerprint !== fingerprint) return false;
      publish({
        annotationDraft: immutableCopy({
          ...snapshot.annotationDraft,
          status,
          savedAt: status === "saved" ? new Date().toISOString() : snapshot.annotationDraft.savedAt,
          validationErrors: [...validationErrors],
        }),
        ...(status === "validation_error" ? { approvedSourceRevision: null } : {}),
      });
      return true;
    },
    setValidatedAnnotation(source, fingerprint, options = {}) {
      const cleanFingerprint = fingerprint.trim();
      if (!cleanFingerprint) return false;
      if (
        snapshot.annotationDraft?.fingerprint
        && snapshot.annotationDraft.fingerprint !== cleanFingerprint
        && snapshot.annotationDraft.fingerprint !== options.expectedDraftFingerprint
      ) return false;
      let revision = snapshot.sourceRevision;
      const revisionChanged = !snapshot.annotationDraft;
      if (revisionChanged) {
        revision += 1;
      }
      const autoApprove = options.autoApprove === true;
      publish({
        step: "review",
        sourceRevision: revision,
        normalized: immutableCopy(source),
        annotationDraft: immutableCopy({
          annotation: source.referenceAnnotation,
          fingerprint: cleanFingerprint,
          sourceRevision: revision,
          status: "saved" as const,
          savedAt: new Date().toISOString(),
          validationErrors: [],
        }),
        approvedSourceRevision: autoApprove ? revision : null,
        ...(revisionChanged ? {
          sceneRef: null,
          sceneLayoutPath: null,
          sceneRevision: null,
          contextMassing: null,
          evaluation: null,
          sceneReviewStatus: "not_available" as const,
          baselineRun: Object.freeze({
            ...snapshot.baselineRun,
            sourceRevision: revision,
            status: snapshot.baselineRun.jobId ? "stale" as const : "idle" as const,
            message: snapshot.baselineRun.jobId ? "The annotation changed; the previous baseline is stale." : "",
          }),
        } : {}),
        lastError: null,
      });
      return true;
    },
    restoreProfessionalDraft(draft) {
      const revision = Math.max(0, Number(draft.sourceRevision) || 0);
      const approvedRevision = draft.approvedSourceRevision === revision ? revision : null;
      const restoredLayoutPath = String(draft.sceneLayoutPath || "").trim() || null;
      publish({
        step: restoredLayoutPath ? "edit" : draft.normalized ? "review" : "source",
        sourceRevision: revision,
        sourceKind: draft.sourceKind,
        sourceImageDataUrl: draft.sourceImageDataUrl,
        sourceFileName: draft.sourceFileName,
        sourceGeojson: draft.sourceGeojson ? immutableCopy(draft.sourceGeojson) : null,
        annotationDraft: immutableCopy(draft.annotationDraft),
        normalized: draft.normalized ? immutableCopy(draft.normalized) : null,
        approvedSourceRevision: approvedRevision,
        sceneRef: restoredLayoutPath
          ? immutableCopy(draft.sceneRef ?? { kind: "local_layout" as const, layoutPath: restoredLayoutPath })
          : null,
        sceneLayoutPath: restoredLayoutPath,
        sceneRevision: draft.sceneRevision ? immutableCopy(draft.sceneRevision) : null,
        sceneReviewStatus: restoredLayoutPath ? draft.sceneReviewStatus ?? "pending" : "not_available",
        baselineRun: draft.baselineRun
          ? immutableCopy(draft.baselineRun)
          : Object.freeze({
              ...snapshot.baselineRun,
              sourceRevision: revision,
              status: restoredLayoutPath ? "succeeded" as const : "idle" as const,
              progress: restoredLayoutPath ? 100 : 0,
            }),
        lastError: null,
      });
    },
    approveReview() {
      if (!snapshot.normalized) {
        const reason = "Normalize a source before approval.";
        publish({ lastError: reason });
        return Object.freeze({ ok: false, reason });
      }
      publish({ approvedSourceRevision: snapshot.sourceRevision, step: "generate", lastError: null });
      return Object.freeze({ ok: true });
    },
    beginRequest(kind) {
      requests.get(kind)?.controller.abort();
      const abortController = new AbortController();
      const id = ++requestSequence;
      requests.set(kind, { id, controller: abortController });
      setBusy(kind, true);
      const token: WorkflowRequestToken = Object.freeze({
        id,
        kind,
        signal: abortController.signal,
        isCurrent: () => requests.get(kind)?.id === id && !abortController.signal.aborted,
      });
      return token;
    },
    endRequest(token, error) {
      if (!token.isCurrent()) return false;
      requests.delete(token.kind);
      setBusy(token.kind, false);
      if (error !== undefined && error !== null) {
        publish({ lastError: error instanceof Error ? error.message : String(error) });
      }
      return true;
    },
    setGenerationStarted() {
      const result = controller.transition("generate");
      if (!result.ok) return result;
      publish({ sceneRef: null, sceneLayoutPath: null, sceneRevision: null, undoCommand: null, evaluation: null, sceneReviewStatus: "not_available", lastError: null });
      return result;
    },
    setGeneratedScene(input) {
      if (!input.layoutPath.trim()) {
        publish({ lastError: "Generation completed without a scene layout path." });
        return false;
      }
      publish({
        step: "edit",
        sceneRef: input.sceneRef
          ? immutableCopy(input.sceneRef)
          : Object.freeze({ kind: "local_layout" as const, layoutPath: input.layoutPath }),
        sceneLayoutPath: input.layoutPath,
        sceneRevision: input.sceneRevision ? immutableCopy(input.sceneRevision) : null,
        contextMassing: input.contextMassing ? immutableCopy(input.contextMassing) : null,
        editPending: false,
        undoCommand: null,
        evaluation: null,
        sceneReviewStatus: "pending",
        lastError: null,
      });
      return true;
    },
    setStarterPreview(demoId) {
      const cleanId = demoId.trim();
      if (!cleanId || snapshot.sceneLayoutPath) return;
      publish({
        sceneRef: Object.freeze({ kind: "starter_demo" as const, demoId: cleanId }),
        sceneReviewStatus: "not_available",
        lastError: null,
      });
    },
    materializeStarterDemo(input) {
      const layoutPath = input.layoutPath.trim();
      const sourceFingerprint = input.sourceFingerprint.trim();
      if (!layoutPath || !sourceFingerprint || !input.demoId.trim()) {
        publish({ lastError: "The starter scene response is incomplete." });
        return false;
      }
      if (
        snapshot.annotationDraft?.fingerprint === sourceFingerprint
        && snapshot.sceneLayoutPath === layoutPath
      ) {
        return true;
      }
      const nextRevision = snapshot.sourceRevision + 1;
      publish({
        step: "edit",
        sourceRevision: nextRevision,
        sourceKind: "osm",
        sourceImageDataUrl: null,
        sourceFileName: `${input.demoId}.osm.geojson`,
        sourceGeojson: input.source.geojson ? immutableCopy(input.source.geojson) : null,
        normalized: immutableCopy(input.source),
        annotationDraft: immutableCopy({
          annotation: input.source.referenceAnnotation,
          fingerprint: sourceFingerprint,
          sourceRevision: nextRevision,
          status: "saved" as const,
          savedAt: new Date().toISOString(),
          validationErrors: [],
        }),
        approvedSourceRevision: nextRevision,
        sceneRef: Object.freeze({ kind: "local_layout" as const, layoutPath }),
        sceneLayoutPath: layoutPath,
        sceneRevision: input.sceneRevision ? immutableCopy(input.sceneRevision) : null,
        contextMassing: null,
        editPending: false,
        undoCommand: null,
        evaluation: null,
        sceneReviewStatus: "pending",
        baselineRun: Object.freeze({
          sourceRevision: nextRevision,
          jobId: null,
          status: "succeeded" as const,
          stage: "starter_demo_materialized",
          progress: 100,
          message: "The bundled Guangzhou road skeleton is ready for review.",
          operations: Object.freeze([]),
        }),
        lastError: null,
      });
      return true;
    },
    setSceneRevision(revision, undoCommand = null) {
      const sameRevision = snapshot.sceneRevision?.sha256 === revision.sha256
        && snapshot.sceneRevision?.revision === revision.revision;
      publish({
        sceneLayoutPath: revision.layout_path || snapshot.sceneLayoutPath,
        sceneRevision: immutableCopy(revision),
        undoCommand: undoCommand ? immutableCopy(undoCommand) : null,
        editPending: false,
        evaluation: sameRevision ? snapshot.evaluation : null,
        sceneReviewStatus: sameRevision ? snapshot.sceneReviewStatus : "pending",
        lastError: null,
      });
    },
    setEditPending(pending) {
      publish({ editPending: pending, ...(pending ? { lastError: null } : {}) });
    },
    setEvaluation(result) {
      publish({ step: "evaluate", evaluation: immutableCopy(result), lastError: null });
    },
    setAssetPreparation(state) {
      const normalized = normalizeAssetPreparationState(state);
      persistAssetPreparationState(normalized);
      publish({
        assetPreparation: normalized,
        assetPreparationChoice: assetChoiceForState(normalized),
        lastError: null,
      });
    },
    setAssetPreparationChoice(choice) {
      if (choice === "default_transparent_massing") {
        controller.setAssetPreparation(Object.freeze({
          mode: "default_transparent_massing",
          manifests: Object.freeze([]) as readonly [],
        }));
        return;
      }
      const current = snapshot.assetPreparation;
      if (current?.mode === "candidate_manifests" && current.manifests.length > 0) {
        controller.setAssetPreparation(current);
        return;
      }
      publish({ assetPreparationChoice: "current_manifest", lastError: null });
    },
    setSceneReviewStatus(status) {
      if (!snapshot.sceneLayoutPath) {
        const reason = "Generate and load a scene before reviewing the result.";
        publish({ lastError: reason });
        return Object.freeze({ ok: false, reason });
      }
      publish({
        step: status === "changes_requested" ? "edit" : snapshot.step,
        sceneReviewStatus: status,
        lastError: null,
      });
      return Object.freeze({ ok: true });
    },
    setBaselineRun(run) {
      publish({ baselineRun: immutableCopy(run) });
    },
    updateBaselineRun(sourceRevision, patch) {
      if (snapshot.sourceRevision !== sourceRevision || snapshot.baselineRun.sourceRevision !== sourceRevision) {
        return false;
      }
      publish({ baselineRun: immutableCopy({ ...snapshot.baselineRun, ...patch, sourceRevision }) });
      return true;
    },
    setCapabilities(capabilities) {
      publish({ capabilities: immutableCopy(capabilities) });
    },
    reportError(error) {
      publish({ lastError: error instanceof Error ? error.message : String(error) });
    },
    clearError() {
      if (snapshot.lastError) publish({ lastError: null });
    },
    dispose() {
      for (const request of requests.values()) request.controller.abort();
      requests.clear();
      listeners.clear();
    },
  };
  return controller;
}
