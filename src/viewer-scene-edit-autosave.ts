import type { SceneEditCommand, SceneEditSaveStatus } from "./viewer-api";

type PersistedQueue = {
  schemaVersion: "roadgen3d.scene-edit-queue.v1";
  commands: SceneEditCommand[];
  updatedAt: string;
};

export type SceneEditAutosaveCoordinator = {
  enqueue(command: SceneEditCommand, options?: { debounceMs?: number }): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  restore(): Promise<number>;
  clear(): Promise<void>;
  dispose(): void;
  getStatus(): SceneEditSaveStatus;
};

type Options = {
  storageKey: string;
  submit(commands: SceneEditCommand[]): Promise<void>;
  replayConflict?(commands: SceneEditCommand[], error: unknown): Promise<void>;
  onStatus(status: SceneEditSaveStatus, message: string): void;
  onError(error: unknown): void;
};

const DB_NAME = "roadgen3d-viewer";
const STORE_NAME = "scene-edit-queues";

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains("asset-palettes")) db.createObjectStore("asset-palettes");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open edit queue storage."));
  });
}

async function writeQueue(key: string, commands: SceneEditCommand[]): Promise<void> {
  const db = await openQueueDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = commands.length
        ? store.put({ schemaVersion: "roadgen3d.scene-edit-queue.v1", commands, updatedAt: new Date().toISOString() } satisfies PersistedQueue, key)
        : store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function readQueue(key: string): Promise<SceneEditCommand[]> {
  const db = await openQueueDb();
  try {
    return await new Promise<SceneEditCommand[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const value = request.result as PersistedQueue | undefined;
        resolve(value?.schemaVersion === "roadgen3d.scene-edit-queue.v1" && Array.isArray(value.commands) ? value.commands : []);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function isMergeable(command: SceneEditCommand): boolean {
  return command.op === "move_instance" || command.op === "rotate_instance" || command.op === "scale_instance";
}

function mergeCommand(queue: SceneEditCommand[], command: SceneEditCommand): SceneEditCommand[] {
  if (!isMergeable(command)) return [...queue, command];
  const index = queue.findIndex((candidate) => (
    candidate.op === command.op && candidate.instance_id === command.instance_id
  ));
  if (index < 0) return [...queue, command];
  const next = queue.slice();
  next[index] = command;
  return next;
}

export function createSceneEditAutosaveCoordinator(options: Options): SceneEditAutosaveCoordinator {
  let pending: SceneEditCommand[] = [];
  let inFlight = false;
  let disposed = false;
  let timer: number | null = null;
  let status: SceneEditSaveStatus = "clean";

  const report = (next: SceneEditSaveStatus, message: string): void => {
    status = next;
    options.onStatus(next, message);
  };

  const persistPending = (): void => {
    void writeQueue(options.storageKey, pending).catch(() => undefined);
  };

  async function flush(): Promise<void> {
    if (disposed || inFlight || pending.length === 0) return;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    const batch = pending;
    pending = [];
    inFlight = true;
    report("saving", "正在保存不可变场景版本…");
    persistPending();
    try {
      await options.submit(batch);
      report("saved", "已保存；正在更新结构化指标。");
      persistPending();
    } catch (error) {
      const statusCode = Number((error as { status?: unknown })?.status ?? 0);
      if (statusCode === 409 && options.replayConflict) {
        report("conflict", "检测到版本冲突，正在基于最新版本重放一次…");
        try {
          await options.replayConflict(batch, error);
          report("saved", "冲突已重放并保存。");
          persistPending();
        } catch (replayError) {
          pending = [...batch, ...pending];
          report("conflict", "版本冲突无法自动重放，请检查差异。");
          persistPending();
          options.onError(replayError);
        }
      } else {
        pending = [...batch, ...pending];
        report("failed", "保存失败；命令已保留，联网后可重试。");
        persistPending();
        options.onError(error);
      }
    } finally {
      inFlight = false;
      if (pending.length > 0 && status !== "failed" && status !== "conflict") void flush();
    }
  }

  return {
    enqueue(command, enqueueOptions = {}): void {
      if (disposed) return;
      pending = mergeCommand(pending, command);
      report("dirty", "场景已修改，等待保存…");
      persistPending();
      if (timer !== null) window.clearTimeout(timer);
      const delay = Math.max(0, enqueueOptions.debounceMs ?? 0);
      timer = window.setTimeout(() => void flush(), delay);
    },
    flush,
    retry: flush,
    async restore(): Promise<number> {
      if (disposed || inFlight || pending.length > 0) return pending.length;
      pending = await readQueue(options.storageKey).catch(() => []);
      if (pending.length > 0) report("failed", `已恢复 ${pending.length} 条未提交编辑；请重试保存。`);
      return pending.length;
    },
    async clear(): Promise<void> {
      pending = [];
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      report("clean", "没有待保存修改。");
      await writeQueue(options.storageKey, []);
    },
    dispose(): void {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    },
    getStatus: () => status,
  };
}
