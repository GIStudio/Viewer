import * as THREE from "three";
import type { ViewerManifest } from "./viewer-types";
import { resolveInstanceIdFromName } from "./viewer-hit-info";

type DragState = {
  pointerId: number;
  instanceId: string;
  startPoint: THREE.Vector3;
  startPositions: Array<{ object: THREE.Object3D; position: THREE.Vector3 }>;
  startManifestPosition: [number, number, number] | null;
};

export type AssetMoveController = {
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  dispose: () => void;
};

export type AssetMoveControllerDeps = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  getCurrentRoot: () => THREE.Object3D | null;
  getManifest: () => ViewerManifest | null;
  controlsAreLocked: () => boolean;
  unlockControls: () => void;
  setInfoCardContent: (html: string) => void;
  setLaserCopyText: (text: string) => void;
  flashStatus: (message: string) => void;
  updateAssetBboxHelpers: () => void;
  persistMove: (move: {
    instanceId: string;
    before: [number, number, number];
    position: [number, number, number];
  }) => Promise<void>;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function objectInstanceId(
  object: THREE.Object3D,
  root: THREE.Object3D,
  manifest: ViewerManifest | null,
): string {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    const instanceId = resolveInstanceIdFromName(cursor.name || "", manifest ?? undefined);
    if (instanceId) return instanceId;
    if (cursor === root) break;
    cursor = cursor.parent;
  }
  return "";
}

function isAncestor(candidate: THREE.Object3D, object: THREE.Object3D): boolean {
  let cursor = object.parent;
  while (cursor) {
    if (cursor === candidate) return true;
    cursor = cursor.parent;
  }
  return false;
}

function collectInstanceObjects(
  root: THREE.Object3D,
  instanceId: string,
  manifest: ViewerManifest | null,
): THREE.Object3D[] {
  const matches: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (resolveInstanceIdFromName(child.name || "", manifest ?? undefined) === instanceId) matches.push(child);
  });
  return matches.filter((object) => !matches.some((candidate) => candidate !== object && isAncestor(candidate, object)));
}

function pointerToNdc(event: PointerEvent, element: HTMLElement): THREE.Vector2 {
  const rect = element.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function formatMovePayload(instanceId: string, position: [number, number, number]): string {
  return JSON.stringify({
    instance_id: instanceId,
    position_xyz: position.map((value) => Number(value.toFixed(3))),
  }, null, 2);
}

function isEditablePlacement(info: Record<string, unknown> | null): boolean {
  if (!info) return false;
  const category = String(info.category ?? "").toLowerCase();
  const placementGroup = String(info.placement_group ?? "").toLowerCase();
  const placementFurniture = placementGroup === "street_furniture" || [
    "bench",
    "bollard",
    "bus_stop",
    "hydrant",
    "lamp",
    "mailbox",
    "sign",
    "trash",
    "tree",
  ].includes(category);
  return info.editable === false ? false : placementFurniture;
}

export function createAssetMoveController(deps: AssetMoveControllerDeps): AssetMoveController {
  const {
    camera,
    renderer,
    getCurrentRoot,
    getManifest,
    controlsAreLocked,
    unlockControls,
    setInfoCardContent,
    setLaserCopyText,
    flashStatus,
    updateAssetBboxHelpers,
    persistMove,
  } = deps;

  const raycaster = new THREE.Raycaster();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const planeHit = new THREE.Vector3();
  let enabled = false;
  let drag: DragState | null = null;
  let saving = false;

  function intersectGround(event: PointerEvent): THREE.Vector3 | null {
    raycaster.setFromCamera(pointerToNdc(event, renderer.domElement), camera);
    return raycaster.ray.intersectPlane(dragPlane, planeHit) ? planeHit.clone() : null;
  }

  function pickAsset(event: PointerEvent): { instanceId: string; objects: THREE.Object3D[]; point: THREE.Vector3 } | null {
    const root = getCurrentRoot();
    const manifest = getManifest();
    if (!root || !manifest) return null;
    raycaster.setFromCamera(pointerToNdc(event, renderer.domElement), camera);
    const hit = raycaster
      .intersectObject(root, true)
      .find((item) => objectInstanceId(item.object, root, manifest));
    if (!hit) return null;
    const instanceId = objectInstanceId(hit.object, root, manifest);
    if (!instanceId || !isEditablePlacement(findInstanceRecord(instanceId))) return null;
    const objects = collectInstanceObjects(root, instanceId, manifest);
    return { instanceId, objects: objects.length ? objects : [hit.object], point: hit.point.clone() };
  }

  function instancePosition(instanceId: string): [number, number, number] | null {
    const info = findInstanceRecord(instanceId);
    const raw = info?.position_xyz;
    if (!Array.isArray(raw) || raw.length < 3) return null;
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    const z = Number(raw[2]);
    return [x, y, z].every(Number.isFinite) ? [x, y, z] : null;
  }

  function findInstanceRecord(instanceId: string): Record<string, unknown> | null {
    const instances = getManifest()?.instances;
    if (!instances) return null;
    if (instances[instanceId]) return instances[instanceId];
    return Object.values(instances).find((info) => {
      const record = info as Record<string, unknown>;
      return String(record.instance_id ?? record.id ?? "") === instanceId;
    }) ?? null;
  }

  function updateManifestPosition(instanceId: string, position: [number, number, number]): void {
    const info = findInstanceRecord(instanceId);
    if (info) info.position_xyz = position;
  }

  function renderMoveInfo(instanceId: string, position: [number, number, number]): void {
    const text = formatMovePayload(instanceId, position);
    setLaserCopyText(text);
    setInfoCardContent(`
      <div class="hit-descriptor">
        <strong>${escapeHtml(instanceId)}</strong><br>
        Asset move preview<br>
        <code>${escapeHtml(position.map((value) => value.toFixed(2)).join(", "))}</code>
      </div>
    `);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!enabled || saving || event.button !== 0) return;
    if (controlsAreLocked()) unlockControls();
    const picked = pickAsset(event);
    const startPoint = intersectGround(event);
    if (!picked || !startPoint) return;

    event.preventDefault();
    event.stopPropagation();
    renderer.domElement.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      instanceId: picked.instanceId,
      startPoint,
      startPositions: picked.objects.map((object) => ({ object, position: object.position.clone() })),
      startManifestPosition: instancePosition(picked.instanceId),
    };
    flashStatus(`Moving asset ${picked.instanceId}`);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const nextPoint = intersectGround(event);
    if (!nextPoint) return;

    event.preventDefault();
    event.stopPropagation();
    const delta = nextPoint.sub(drag.startPoint);
    for (const item of drag.startPositions) {
      item.object.position.set(
        item.position.x + delta.x,
        item.position.y,
        item.position.z + delta.z,
      );
    }
    const nextManifestPosition: [number, number, number] = drag.startManifestPosition
      ? [
          drag.startManifestPosition[0] + delta.x,
          drag.startManifestPosition[1],
          drag.startManifestPosition[2] + delta.z,
        ]
      : [nextPoint.x, 0, nextPoint.z];
    updateManifestPosition(drag.instanceId, nextManifestPosition);
    renderMoveInfo(drag.instanceId, nextManifestPosition);
    updateAssetBboxHelpers();
  }

  async function onPointerUp(event: PointerEvent): Promise<void> {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    renderer.domElement.releasePointerCapture(event.pointerId);
    const completed = drag;
    drag = null;
    const finalPosition = instancePosition(completed.instanceId);
    if (!finalPosition || !completed.startManifestPosition) return;
    const changed = finalPosition.some(
      (value, index) => Math.abs(value - completed.startManifestPosition![index]) > 1e-6,
    );
    if (!changed) return;
    renderMoveInfo(completed.instanceId, finalPosition);
    saving = true;
    renderer.domElement.style.cursor = "wait";
    flashStatus(`Saving asset ${completed.instanceId}…`);
    try {
      const info = findInstanceRecord(completed.instanceId);
      await persistMove({
        instanceId: String(info?.instance_id ?? completed.instanceId),
        before: completed.startManifestPosition,
        position: finalPosition,
      });
      renderMoveInfo(completed.instanceId, finalPosition);
      flashStatus(`Saved asset ${completed.instanceId}. Press Cmd/Ctrl+Z to undo.`);
    } catch (error) {
      for (const item of completed.startPositions) {
        item.object.position.copy(item.position);
      }
      updateManifestPosition(completed.instanceId, completed.startManifestPosition);
      updateAssetBboxHelpers();
      flashStatus(error instanceof Error ? error.message : "Scene edit could not be saved.");
    } finally {
      saving = false;
      renderer.domElement.style.cursor = enabled ? "grab" : "";
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const cancelled = drag;
    drag = null;
    for (const item of cancelled.startPositions) {
      item.object.position.copy(item.position);
    }
    if (cancelled.startManifestPosition) {
      updateManifestPosition(cancelled.instanceId, cancelled.startManifestPosition);
    }
    updateAssetBboxHelpers();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerCancel);

  return {
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
      if (!enabled && !saving) drag = null;
      renderer.domElement.style.cursor = enabled ? "grab" : "";
      if (enabled && controlsAreLocked()) unlockControls();
    },
    isEnabled: () => enabled,
    dispose(): void {
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.style.cursor = "";
    },
  };
}
