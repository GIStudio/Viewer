import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

import type { SceneEditCommand } from "./viewer-api";
import { resolveInstanceIdFromName } from "./viewer-hit-info";
import type { ViewerManifest } from "./viewer-types";

export type SceneObjectEditMode = "translate" | "rotate" | "scale";

export type SceneObjectEditorController = {
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  setMode(mode: SceneObjectEditMode): void;
  getMode(): SceneObjectEditMode;
  selectedInstanceId(): string | null;
  duplicateSelected(): void;
  deleteSelected(): void;
  cancel(): void;
  dispose(): void;
};

type EditorOptions = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  courseMode: boolean;
  getCurrentRoot(): THREE.Object3D | null;
  getManifest(): ViewerManifest | null;
  controlsAreLocked(): boolean;
  unlockControls(): void;
  enqueue(command: SceneEditCommand, options?: { debounceMs?: number }): void;
  flashStatus(message: string): void;
  updateHelpers(): void;
};

type TransformSnapshot = {
  objectPosition: THREE.Vector3;
  objectRotationY: number;
  objectScale: THREE.Vector3;
  manifestPosition: [number, number, number];
  yawDeg: number;
  scale: number;
};

const EDITABLE_CATEGORIES = new Set(["bench", "bollard", "bus_stop", "hydrant", "lamp", "mailbox", "sign", "trash", "tree"]);

function commandId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pointerNdc(event: PointerEvent, element: HTMLElement): THREE.Vector2 {
  const rect = element.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function recordFor(manifest: ViewerManifest | null, instanceId: string): Record<string, unknown> | null {
  if (!manifest?.instances) return null;
  const direct = manifest.instances[instanceId] as Record<string, unknown> | undefined;
  return direct ?? Object.values(manifest.instances).find((value) => {
    const record = value as Record<string, unknown>;
    return String(record.instance_id ?? record.id ?? "") === instanceId;
  }) as Record<string, unknown> | undefined ?? null;
}

function editable(record: Record<string, unknown> | null): boolean {
  if (!record || record.editable === false) return false;
  const group = String(record.placement_group ?? "").toLowerCase();
  const category = String(record.category ?? "").toLowerCase();
  return group === "street_furniture" || EDITABLE_CATEGORIES.has(category);
}

function instanceIdForObject(object: THREE.Object3D, root: THREE.Object3D, manifest: ViewerManifest): string {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    const id = resolveInstanceIdFromName(cursor.name || "", manifest);
    if (id) return id;
    if (cursor === root) break;
    cursor = cursor.parent;
  }
  return "";
}

function topInstanceObject(object: THREE.Object3D, root: THREE.Object3D, instanceId: string, manifest: ViewerManifest): THREE.Object3D {
  let cursor = object;
  while (cursor.parent && cursor.parent !== root && instanceIdForObject(cursor.parent, root, manifest) === instanceId) cursor = cursor.parent;
  return cursor;
}

function positionFrom(record: Record<string, unknown>): [number, number, number] {
  const raw = Array.isArray(record.position_xyz) ? record.position_xyz.map(Number) : [];
  return raw.length >= 3 && raw.slice(0, 3).every(Number.isFinite) ? [raw[0]!, raw[1]!, raw[2]!] : [0, 0, 0];
}

export function createSceneObjectEditorController(options: EditorOptions): SceneObjectEditorController {
  const { scene, camera, renderer } = options;
  const raycaster = new THREE.Raycaster();
  const controls = new TransformControls(camera, renderer.domElement);
  const helper = controls.getHelper();
  helper.name = "roadgen3d-transform-controls";
  helper.userData.viewerHelper = true;
  scene.add(helper);
  let enabled = false;
  let mode: SceneObjectEditMode = "translate";
  let selectedId: string | null = null;
  let selectedObject: THREE.Object3D | null = null;
  let selectionBox: THREE.BoxHelper | null = null;
  let snapshot: TransformSnapshot | null = null;
  let normalizingScale = false;
  let altPressed = false;

  const configureAxes = (): void => {
    controls.setMode(mode);
    if (mode === "translate") {
      controls.showX = true;
      controls.showZ = true;
      controls.showY = !options.courseMode && altPressed;
    } else if (mode === "rotate") {
      controls.showX = false;
      controls.showY = true;
      controls.showZ = false;
    } else {
      controls.showX = true;
      controls.showY = true;
      controls.showZ = true;
    }
  };

  const setSnap = (active: boolean): void => {
    controls.setTranslationSnap(active ? 0.25 : null);
    controls.setRotationSnap(active ? THREE.MathUtils.degToRad(5) : null);
    controls.setScaleSnap(active ? 0.05 : null);
  };

  const clearSelection = (): void => {
    controls.detach();
    selectedId = null;
    selectedObject = null;
    snapshot = null;
    if (selectionBox) {
      scene.remove(selectionBox);
      selectionBox.geometry.dispose();
      (selectionBox.material as THREE.Material).dispose();
      selectionBox = null;
    }
  };

  const select = (instanceId: string, object: THREE.Object3D): void => {
    clearSelection();
    selectedId = instanceId;
    selectedObject = object;
    controls.attach(object);
    selectionBox = new THREE.BoxHelper(object, 0xdf654f);
    selectionBox.name = "roadgen3d-edit-selection";
    selectionBox.userData.viewerHelper = true;
    scene.add(selectionBox);
    configureAxes();
    options.flashStatus(`已选择 ${instanceId} · G移动 / R旋转 / S缩放`);
  };

  const capture = (): TransformSnapshot | null => {
    if (!selectedObject || !selectedId) return null;
    const record = recordFor(options.getManifest(), selectedId);
    if (!record) return null;
    return {
      objectPosition: selectedObject.position.clone(),
      objectRotationY: selectedObject.rotation.y,
      objectScale: selectedObject.scale.clone(),
      manifestPosition: positionFrom(record),
      yawDeg: Number(record.yaw_deg ?? 0) || 0,
      scale: Number(record.scale ?? 1) || 1,
    };
  };

  controls.addEventListener("mouseDown", () => {
    snapshot = capture();
    if (options.controlsAreLocked()) options.unlockControls();
  });
  controls.addEventListener("objectChange", () => {
    if (!selectedObject || !snapshot) return;
    if (mode === "translate") {
      if (options.courseMode || !altPressed) selectedObject.position.y = snapshot.objectPosition.y;
      if (!options.courseMode && altPressed) selectedObject.position.y = THREE.MathUtils.clamp(selectedObject.position.y, snapshot.objectPosition.y, snapshot.objectPosition.y + 10);
    } else if (mode === "rotate") {
      selectedObject.rotation.x = 0;
      selectedObject.rotation.z = 0;
    } else if (!normalizingScale) {
      normalizingScale = true;
      const ratios = [selectedObject.scale.x / snapshot.objectScale.x, selectedObject.scale.y / snapshot.objectScale.y, selectedObject.scale.z / snapshot.objectScale.z];
      const ratio = THREE.MathUtils.clamp(ratios.reduce((best, value) => Math.abs(value - 1) > Math.abs(best - 1) ? value : best, 1), 0.25 / snapshot.scale, 4 / snapshot.scale);
      selectedObject.scale.copy(snapshot.objectScale).multiplyScalar(ratio);
      normalizingScale = false;
    }
    selectionBox?.update();
    options.updateHelpers();
  });
  controls.addEventListener("mouseUp", () => {
    if (!selectedObject || !selectedId || !snapshot) return;
    const record = recordFor(options.getManifest(), selectedId);
    if (!record) return;
    let command: SceneEditCommand;
    if (mode === "translate") {
      const delta = selectedObject.position.clone().sub(snapshot.objectPosition);
      const position: [number, number, number] = [snapshot.manifestPosition[0] + delta.x, snapshot.manifestPosition[1], snapshot.manifestPosition[2] + delta.z];
      const heightOffset = options.courseMode ? 0 : THREE.MathUtils.clamp(delta.y, 0, 10);
      record.position_xyz = position;
      command = { command_id: commandId("move"), op: "move_instance", instance_id: selectedId, position_xyz: position, height_offset_m: heightOffset };
    } else if (mode === "rotate") {
      const yaw = (snapshot.yawDeg + THREE.MathUtils.radToDeg(selectedObject.rotation.y - snapshot.objectRotationY) + 360) % 360;
      record.yaw_deg = yaw;
      command = { command_id: commandId("rotate"), op: "rotate_instance", instance_id: selectedId, yaw_deg: yaw };
    } else {
      const factor = selectedObject.scale.x / snapshot.objectScale.x;
      const scale = THREE.MathUtils.clamp(snapshot.scale * factor, 0.25, 4);
      record.scale = scale;
      command = { command_id: commandId("scale"), op: "scale_instance", instance_id: selectedId, scale };
    }
    options.enqueue(command);
    snapshot = null;
  });

  const onPointerDown = (event: PointerEvent): void => {
    if (!enabled || controls.dragging || event.button !== 0) return;
    const root = options.getCurrentRoot();
    const manifest = options.getManifest();
    if (!root || !manifest) return;
    raycaster.setFromCamera(pointerNdc(event, renderer.domElement), camera);
    const hit = raycaster.intersectObject(root, true).find((candidate) => {
      const id = instanceIdForObject(candidate.object, root, manifest);
      return id && editable(recordFor(manifest, id));
    });
    if (!hit) return;
    const instanceId = instanceIdForObject(hit.object, root, manifest);
    if (!instanceId) return;
    event.preventDefault();
    event.stopPropagation();
    select(instanceId, topInstanceObject(hit.object, root, instanceId, manifest));
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Shift") setSnap(event.type === "keydown");
    if (event.key === "Alt") {
      altPressed = event.type === "keydown";
      configureAxes();
    }
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);

  return {
    setEnabled(next): void {
      enabled = next;
      helper.visible = next;
      if (!next) clearSelection();
      else if (options.controlsAreLocked()) options.unlockControls();
    },
    isEnabled: () => enabled,
    setMode(next): void {
      mode = next;
      configureAxes();
      options.flashStatus(next === "translate" ? "移动模式：XZ 平面，Shift 吸附。" : next === "rotate" ? "旋转模式：仅绕 Y 轴。" : "缩放模式：等比 0.25–4×。");
    },
    getMode: () => mode,
    selectedInstanceId: () => selectedId,
    duplicateSelected(): void {
      if (!selectedId) return;
      const record = recordFor(options.getManifest(), selectedId);
      if (!record) return;
      const position = positionFrom(record);
      options.enqueue({
        command_id: commandId("duplicate"),
        op: "duplicate_instance",
        instance_id: selectedId,
        new_instance_id: `${selectedId}-copy-${Date.now().toString(36)}`,
        position_xyz: [position[0] + 0.5, position[1], position[2] + 0.5],
      });
    },
    deleteSelected(): void {
      if (!selectedId) return;
      options.enqueue({ command_id: commandId("delete"), op: "delete_instance", instance_id: selectedId });
      clearSelection();
    },
    cancel(): void {
      if (selectedObject && snapshot) {
        selectedObject.position.copy(snapshot.objectPosition);
        selectedObject.rotation.y = snapshot.objectRotationY;
        selectedObject.scale.copy(snapshot.objectScale);
      }
      snapshot = null;
      clearSelection();
    },
    dispose(): void {
      clearSelection();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      scene.remove(helper);
      controls.dispose();
    },
  };
}
