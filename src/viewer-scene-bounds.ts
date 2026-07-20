import * as THREE from "three";

function lowerText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isEnvironmentSkyDomeObject(object: THREE.Object3D): boolean {
  const data = object.userData ?? {};
  const name = lowerText(object.name);
  const category = lowerText(data.category);
  const placementGroup = lowerText(data.placement_group);
  const instanceId = lowerText(data.instance_id);
  const assetId = lowerText(data.asset_id);

  return (
    (placementGroup === "environment" && category === "sky_dome")
    || name.includes("environment_default_sky_dome")
    || instanceId === "environment_default_sky_dome"
    || assetId.includes("sky-dome")
  );
}

export function prepareEnvironmentSkyDomeObject(object: THREE.Object3D): void {
  // The shared Viewer always renders its own continuous atmospheric sky. Older
  // generated GLBs may also contain a low-poly sky-dome asset. Rendering both
  // makes the imported dome intersect the atmospheric sky and exposes its
  // polygon boundary at some sun angles. Keep the node for provenance and
  // inspection, but never render it in the shared Viewer.
  object.visible = false;
  object.userData.viewerSuppressedByAtmosphericSky = true;
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh) {
    return;
  }
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material) {
      continue;
    }
    material.side = THREE.BackSide;
    material.depthWrite = false;
    material.toneMapped = false;
    material.needsUpdate = true;
  }
}

export function prepareEnvironmentSkyDomes(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (isEnvironmentSkyDomeObject(child)) {
      prepareEnvironmentSkyDomeObject(child);
    }
  });
}

export function sceneContentBounds(root: THREE.Object3D): THREE.Box3 {
  const bounds = new THREE.Box3();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || isEnvironmentSkyDomeObject(mesh)) {
      return;
    }
    bounds.expandByObject(mesh);
  });
  if (bounds.isEmpty()) {
    return new THREE.Box3().setFromObject(root);
  }
  return bounds;
}
