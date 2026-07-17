import type {
  ProfessionalWorkflowDraft,
  WorkflowController,
  WorkflowSnapshot,
} from "./workflow-controller";

const DATABASE_NAME = "roadgen3d-professional-workflow";
const STORE_NAME = "drafts";
const DRAFT_KEY = "latest";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the professional draft store."));
  });
}

function draftFromSnapshot(snapshot: WorkflowSnapshot): ProfessionalWorkflowDraft | null {
  if (!snapshot.annotationDraft) return null;
  return {
    version: 1,
    sourceRevision: snapshot.sourceRevision,
    sourceKind: snapshot.sourceKind,
    sourceImageDataUrl: snapshot.sourceImageDataUrl,
    sourceFileName: snapshot.sourceFileName,
    sourceGeojson: snapshot.sourceGeojson,
    annotationDraft: snapshot.annotationDraft,
    normalized: snapshot.normalized,
    approvedSourceRevision: snapshot.approvedSourceRevision,
  };
}

export async function loadProfessionalWorkflowDraft(): Promise<ProfessionalWorkflowDraft | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(DRAFT_KEY);
      request.onsuccess = () => {
        const value = request.result as ProfessionalWorkflowDraft | undefined;
        resolve(value?.version === 1 && value.annotationDraft ? value : null);
      };
      request.onerror = () => reject(request.error ?? new Error("Unable to read the professional draft."));
    });
  } finally {
    database.close();
  }
}

export async function saveProfessionalWorkflowDraft(snapshot: WorkflowSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const draft = draftFromSnapshot(snapshot);
  if (!draft) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(structuredClone(draft), DRAFT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save the professional draft."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Professional draft save was aborted."));
    });
  } finally {
    database.close();
  }
}

export function persistProfessionalWorkflowDraft(workflow: WorkflowController): () => void {
  let timer: number | null = null;
  let lastSignature = "";
  const persist = (): void => {
    const snapshot = workflow.getSnapshot();
    const signature = [
      snapshot.sourceRevision,
      snapshot.annotationDraft?.fingerprint ?? "",
      snapshot.annotationDraft?.status ?? "",
      snapshot.approvedSourceRevision ?? "",
    ].join(":");
    if (!snapshot.annotationDraft || signature === lastSignature) return;
    lastSignature = signature;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void saveProfessionalWorkflowDraft(workflow.getSnapshot());
    }, 120);
  };
  const unsubscribe = workflow.subscribe(persist);
  persist();
  return () => {
    unsubscribe();
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
      void saveProfessionalWorkflowDraft(workflow.getSnapshot());
    }
  };
}
