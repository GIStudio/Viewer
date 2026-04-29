import * as THREE from "three";
import type { ViewerManifest } from "./viewer-types";
import { createTextSprite, disposeObject } from "./viewer-utils";
import { resolveInstanceIdFromName } from "./viewer-hit-info";

const CATEGORY_BBOX_COLORS: Record<string, number> = {
  tree: 0x22c55e,
  lamp: 0xeab308,
  bench: 0x92400e,
  trash: 0x6b7280,
  bollard: 0xef4444,
  mailbox: 0x3b82f6,
  hydrant: 0xdc2626,
  bus_stop: 0x8b5cf6,
  building: 0xa78bfa,
  road: 0x64748b,
  roadway: 0x64748b,
  sidewalk: 0x94a3b8,
  marking: 0xfbbf24,
  crossing: 0xfde68a,
  transit: 0x7c3aed,
  landscape: 0x4ade80,
  scene_object: 0x38bdf8,
};

export function removeFrameAndAssetHelpers(scene: THREE.Scene): void {
  const helpers: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (child.userData.isFrameHelper || child.userData.isAssetBboxHelper || child.userData.isAssetLabel) {
      helpers.push(child);
    }
  });
  helpers.forEach((helper) => disposeObject(helper));
}

export function createFrameHelpers(scene: THREE.Scene, root: THREE.Object3D | null): void {
  if (!root) return;
  root.children.forEach((child) => {
    const bbox = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    if (size.length() > 0.1) {
      const helper = new THREE.BoxHelper(child, 0x00ff00);
      helper.userData.isFrameHelper = true;
      helper.visible = true;
      scene.add(helper);
    }
  });
}

export function removeAssetBboxHelpers(scene: THREE.Scene): void {
  const helpers: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (child.userData.isAssetBboxHelper || child.userData.isAssetLabel) {
      helpers.push(child);
    }
  });
  helpers.forEach((helper) => disposeObject(helper));
}

export function createAssetBboxHelpers(
  scene: THREE.Scene,
  root: THREE.Object3D | null,
  manifest: ViewerManifest | null,
): void {
  if (!root || !manifest) return;

  removeAssetBboxHelpers(scene);
  const instances = manifest.instances;
  root.traverse((child) => {
    const name = child.name || "";
    const instanceId = resolveInstanceIdFromName(name);
    if (!instanceId) return;
    const instanceInfo = instances?.[instanceId];
    if (!instanceInfo) return;
    const category = String(instanceInfo.category || "").trim().toLowerCase();
    const assetId = String(instanceInfo.asset_id || "").trim() || instanceId;
    const color = CATEGORY_BBOX_COLORS[category] ?? 0x38bdf8;

    const bbox = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    if (size.length() > 0.01) {
      const helper = new THREE.BoxHelper(child, color);
      helper.userData.isAssetBboxHelper = true;
      helper.userData.assetInstanceId = instanceId;
      helper.userData.assetCategory = category;
      helper.visible = true;
      scene.add(helper);

      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const label = createTextSprite(assetId, color);
      label.position.set(center.x, bbox.max.y + 0.5, center.z);
      label.userData.isAssetLabel = true;
      scene.add(label);
    }
  });
}

export function updateAssetBboxHelpers(scene: THREE.Scene): void {
  scene.traverse((child) => {
    if (child.userData.isAssetBboxHelper && child instanceof THREE.BoxHelper) {
      child.update();
    }
  });
}
