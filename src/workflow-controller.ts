import type { ReferenceAnnotation } from "./sg-types";
import type { EvaluationResult } from "./viewer-evaluation";

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
  | Readonly<{ kind: "project_revision"; projectId: string; revisionId: string }>;

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
  approvedSourceRevision: number | null;
  sceneRef: WorkflowSceneRef | null;
  sceneLayoutPath: string | null;
  sceneRevision: SceneRevision | null;
  contextMassing: Readonly<Record<string, unknown>> | null;
  editPending: boolean;
  undoCommand: LayoutEditCommand | null;
  evaluation: EvaluationResult | null;
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
  setSceneRevision(revision: SceneRevision, undoCommand?: LayoutEditCommand | null): void;
  setEditPending(pending: boolean): void;
  setEvaluation(result: EvaluationResult): void;
  setCapabilities(capabilities: WorkflowCapabilities): void;
  reportError(error: unknown): void;
  clearError(): void;
  dispose(): void;
};

const INITIAL_BUSY: WorkflowSnapshot["busy"] = Object.freeze({});

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
  return Object.freeze({
    step: "source",
    sourceRevision: 0,
    sourceKind: null,
    sourceImageDataUrl: null,
    sourceFileName: null,
    sourceGeojson: null,
    normalized: null,
    approvedSourceRevision: null,
    sceneRef: null,
    sceneLayoutPath: null,
    sceneRevision: null,
    contextMassing: null,
    editPending: false,
    undoCommand: null,
    evaluation: null,
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
        approvedSourceRevision: null,
        sceneRef: null,
        sceneLayoutPath: null,
        sceneRevision: null,
        contextMassing: null,
        editPending: false,
        undoCommand: null,
        evaluation: null,
        lastError: null,
      });
    },
    setNormalizedSource(source) {
      const nextRevision = snapshot.sourceRevision + 1;
      publish({
        step: "review",
        sourceRevision: nextRevision,
        normalized: immutableCopy(source),
        approvedSourceRevision: null,
        sceneRef: null,
        sceneLayoutPath: null,
        sceneRevision: null,
        contextMassing: null,
        editPending: false,
        undoCommand: null,
        evaluation: null,
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
      publish({ sceneRef: null, sceneLayoutPath: null, sceneRevision: null, undoCommand: null, evaluation: null, lastError: null });
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
        lastError: null,
      });
      return true;
    },
    setSceneRevision(revision, undoCommand = null) {
      publish({
        sceneLayoutPath: revision.layout_path || snapshot.sceneLayoutPath,
        sceneRevision: immutableCopy(revision),
        undoCommand: undoCommand ? immutableCopy(undoCommand) : null,
        editPending: false,
        evaluation: null,
        lastError: null,
      });
    },
    setEditPending(pending) {
      publish({ editPending: pending, ...(pending ? { lastError: null } : {}) });
    },
    setEvaluation(result) {
      publish({ step: "evaluate", evaluation: immutableCopy(result), lastError: null });
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
