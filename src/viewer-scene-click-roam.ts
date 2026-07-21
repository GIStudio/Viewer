import * as THREE from "three";

export type SceneClickRoamController = {
  dispose: () => void;
};

export type SceneClickRoamOptions = {
  camera: THREE.Camera;
  element: HTMLElement;
  getCurrentRoot: () => THREE.Object3D | null;
  isEnabled: () => boolean;
  onScenePoint: (point: THREE.Vector3) => void;
};

const DRAG_THRESHOLD_PX = 6;

/**
 * Converts an ordinary click on the rendered scene into a roam destination.
 * A drag is deliberately ignored here because it belongs to direct mouse-look.
 */
export function createSceneClickRoamController(options: SceneClickRoamOptions): SceneClickRoamController {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerStart: THREE.Vector2 | null = null;
  let dragged = false;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    pointerStart = new THREE.Vector2(event.clientX, event.clientY);
    dragged = false;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pointerStart) return;
    if (pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > DRAG_THRESHOLD_PX) {
      dragged = true;
    }
  };

  const onClick = (event: MouseEvent): void => {
    const root = options.getCurrentRoot();
    if (!options.isEnabled() || !root || event.button !== 0 || dragged) return;
    const rect = options.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, options.camera);
    const hit = raycaster.intersectObject(root, true).find((candidate) => (
      !candidate.object.userData?.viewerHelper && !candidate.object.userData?.isRenderHelper
    ));
    if (!hit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.onScenePoint(hit.point.clone());
  };

  const clearPointer = (): void => {
    pointerStart = null;
  };

  options.element.addEventListener("pointerdown", onPointerDown, { capture: true });
  options.element.addEventListener("pointermove", onPointerMove, { capture: true });
  options.element.addEventListener("pointerup", clearPointer, { capture: true });
  options.element.addEventListener("pointercancel", clearPointer, { capture: true });
  options.element.addEventListener("click", onClick, { capture: true });

  return {
    dispose: () => {
      options.element.removeEventListener("pointerdown", onPointerDown, { capture: true });
      options.element.removeEventListener("pointermove", onPointerMove, { capture: true });
      options.element.removeEventListener("pointerup", clearPointer, { capture: true });
      options.element.removeEventListener("pointercancel", clearPointer, { capture: true });
      options.element.removeEventListener("click", onClick, { capture: true });
    },
  };
}
