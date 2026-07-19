import type { SceneAssetRef } from "./viewer-api";

export type SceneAssetPalette = {
  schemaVersion: "roadgen3d.asset-palette.v1";
  assets: SceneAssetRef[];
};

export type SceneAssetPaletteAdapter = {
  load(): Promise<SceneAssetPalette>;
  save(palette: SceneAssetPalette): Promise<SceneAssetPalette>;
};

const EMPTY: SceneAssetPalette = { schemaVersion: "roadgen3d.asset-palette.v1", assets: [] };

function normalize(value: unknown): SceneAssetPalette {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const assets = Array.isArray(source.assets) ? source.assets : [];
  const unique = new Map<string, SceneAssetRef>();
  for (const raw of assets) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const asset: SceneAssetRef = {
      manifestName: String(row.manifestName ?? "").trim(),
      assetId: String(row.assetId ?? "").trim(),
      fingerprint: String(row.fingerprint ?? "").trim(),
      category: String(row.category ?? "").trim(),
      label: String(row.label ?? row.assetId ?? "Asset").trim(),
    };
    if (!asset.manifestName || !asset.assetId || !asset.fingerprint || !asset.category) continue;
    unique.set(`${asset.manifestName}:${asset.assetId}`, asset);
  }
  return { schemaVersion: "roadgen3d.asset-palette.v1", assets: [...unique.values()] };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("roadgen3d-viewer", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("scene-edit-queues")) db.createObjectStore("scene-edit-queues");
      if (!db.objectStoreNames.contains("asset-palettes")) db.createObjectStore("asset-palettes");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createLocalAssetPaletteAdapter(key = "professional"): SceneAssetPaletteAdapter {
  return {
    async load(): Promise<SceneAssetPalette> {
      const db = await openDb();
      try {
        return await new Promise<SceneAssetPalette>((resolve, reject) => {
          const request = db.transaction("asset-palettes", "readonly").objectStore("asset-palettes").get(key);
          request.onsuccess = () => resolve(normalize(request.result ?? EMPTY));
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    async save(palette): Promise<SceneAssetPalette> {
      const normalized = normalize(palette);
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const request = db.transaction("asset-palettes", "readwrite").objectStore("asset-palettes").put(normalized, key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        return normalized;
      } finally {
        db.close();
      }
    },
  };
}
