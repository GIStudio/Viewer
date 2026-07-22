import * as THREE from "three";
import type { ViewerManifest } from "./viewer-types";
import { isEnvironmentSkyDomeObject } from "./viewer-scene-bounds";

const ROLE_TINTS: Array<{ pattern: RegExp; color: string; maxSaturation: number; minLightness: number; maxLightness: number; roughness: number; metalness: number }> = [
  { pattern: /(crossing|crosswalk|lane_mark|lane_edge_mark|marking)/i, color: "#eee8d4", maxSaturation: 0.16, minLightness: 0.68, maxLightness: 0.9, roughness: 0.82, metalness: 0.0 },
  { pattern: /(bike_lane|cycle|bikeway)/i, color: "#5b816f", maxSaturation: 0.28, minLightness: 0.36, maxLightness: 0.62, roughness: 0.92, metalness: 0.0 },
  { pattern: /(bus_lane|transit_pad|bus_stop|shelter)/i, color: "#8d99a3", maxSaturation: 0.2, minLightness: 0.42, maxLightness: 0.68, roughness: 0.88, metalness: 0.04 },
  { pattern: /(road|asphalt|carriageway|drive_lane|parking_lane|lane)/i, color: "#5c6670", maxSaturation: 0.18, minLightness: 0.28, maxLightness: 0.48, roughness: 0.92, metalness: 0.02 },
  { pattern: /(center_median(?!_green)|safety_island|(?:^|[^a-z0-9_])median(?:$|[^a-z0-9_]))/i, color: "#b9b5a8", maxSaturation: 0.18, minLightness: 0.48, maxLightness: 0.68, roughness: 0.88, metalness: 0.0 },
  { pattern: /(context_ground|sidewalk|pavement|walkway|curb|plaza)/i, color: "#cbd4d5", maxSaturation: 0.2, minLightness: 0.62, maxLightness: 0.82, roughness: 0.9, metalness: 0.0 },
  { pattern: /(building|facade|wall|house|tower|block)/i, color: "#d9dfde", maxSaturation: 0.16, minLightness: 0.58, maxLightness: 0.84, roughness: 0.88, metalness: 0.0 },
  { pattern: /(tree|leaf|plant|grass|shrub|green)/i, color: "#5f8f69", maxSaturation: 0.5, minLightness: 0.34, maxLightness: 0.68, roughness: 0.96, metalness: 0.0 },
  { pattern: /(bench|wood|seat)/i, color: "#a7835d", maxSaturation: 0.36, minLightness: 0.42, maxLightness: 0.72, roughness: 0.86, metalness: 0.02 },
  { pattern: /(lamp|bollard|pole|metal|bus_stop|shelter|rail)/i, color: "#687481", maxSaturation: 0.18, minLightness: 0.34, maxLightness: 0.72, roughness: 0.78, metalness: 0.16 },
];

const NATURAL_ASSET_PATTERN = /(?:^|[^a-z0-9])(tree|trees|canopy|leaf|leaves|foliage|plant|plants|shrub|shrubs|grass|vegetation|trunk|branch|branches)(?:$|[^a-z0-9])/i;

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function clampHslColor(color: THREE.Color, role: (typeof ROLE_TINTS)[number] | null): void {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (role) {
    const tint = new THREE.Color(role.color);
    color.lerp(tint, 0.34);
    color.getHSL(hsl);
    hsl.s = Math.min(hsl.s, role.maxSaturation);
    hsl.l = THREE.MathUtils.clamp(hsl.l, role.minLightness, role.maxLightness);
  } else {
    hsl.s = Math.min(hsl.s, 0.42);
    hsl.l = THREE.MathUtils.clamp(hsl.l, 0.26, 0.82);
  }
  color.setHSL(hsl.h, hsl.s, hsl.l);
}

function manifestRecordForMesh(mesh: THREE.Mesh, manifest?: ViewerManifest): Record<string, unknown> | null {
  const instances = manifest?.instances ?? {};
  const names = [
    mesh.name,
    mesh.parent?.name ?? "",
    mesh.userData?.instance_id,
    mesh.userData?.asset_id,
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
  for (const [instanceId, record] of Object.entries(instances)) {
    if (names.some((name) => name === instanceId || name.includes(instanceId))) {
      return record;
    }
  }
  return null;
}

function isNaturalAssetMesh(mesh: THREE.Mesh, manifestRecord: Record<string, unknown> | null): boolean {
  const data = mesh.userData ?? {};
  const haystack = [
    manifestRecord?.category,
    manifestRecord?.asset_role,
    manifestRecord?.placement_group,
    manifestRecord?.asset_id,
    manifestRecord?.instance_id,
    data.category,
    data.asset_role,
    data.placement_group,
    data.asset_id,
    data.instance_id,
    mesh.name,
    mesh.parent?.name,
  ].map((value) => String(value ?? "")).join(" ");
  return NATURAL_ASSET_PATTERN.test(haystack);
}

/**
 * Imported GLB materials can carry their authored road, pavement, facade, or
 * ground appearance in `map`.  Material color is multiplied with that map by
 * Three.js, so applying the analytical palette to those materials turns a
 * correctly exported road texture into a nearly uniform tint.  Keep mapped
 * materials untouched; the diorama finish is intended for untextured meshes.
 */
function hasAuthoredBaseColorTexture(material: THREE.Material): boolean {
  return "map" in material && Boolean((material as THREE.MeshStandardMaterial).map);
}

function roleForObject(mesh: THREE.Mesh, material: THREE.Material, manifest?: ViewerManifest): (typeof ROLE_TINTS)[number] | null {
  const manifestRecord = manifestRecordForMesh(mesh, manifest);
  const priorityPieces = [
    manifestRecord?.visual_surface_role,
    manifestRecord?.surface_role,
    manifestRecord?.category,
    manifestRecord?.asset_role,
    manifestRecord?.placement_group,
    manifestRecord?.asset_id,
    mesh.userData?.visual_surface_role,
    mesh.userData?.surface_role,
    mesh.userData?.category,
    mesh.userData?.asset_role,
    mesh.userData?.placement_group,
    mesh.userData?.asset_id,
  ];
  const priorityHaystack = priorityPieces.map((value) => String(value ?? "")).join(" ");
  const priorityRole = ROLE_TINTS.find((role) => role.pattern.test(priorityHaystack));
  if (priorityRole) {
    return priorityRole;
  }

  const haystack = [mesh.name, material.name, mesh.parent?.name].join(" ");
  return ROLE_TINTS.find((role) => role.pattern.test(haystack)) ?? null;
}

function applyMaterialFinish(mesh: THREE.Mesh, material: THREE.Material, manifest?: ViewerManifest): void {
  const manifestRecord = manifestRecordForMesh(mesh, manifest);
  const role = roleForObject(mesh, material, manifest);
  const authoredTexturePreserved = hasAuthoredBaseColorTexture(material);
  const preserveAuthoredColor = authoredTexturePreserved || isNaturalAssetMesh(mesh, manifestRecord);
  material.userData = {
    ...material.userData,
    analyticalDioramaFinish: true,
    authoredColorPreserved: preserveAuthoredColor,
    authoredTexturePreserved,
  };

  // Do not modify any PBR property of authored textured materials: the
  // top-down asphalt and pavement maps are part of the generated scene's
  // visual contract, not a neutral surface waiting for the diorama palette.
  if (authoredTexturePreserved) {
    material.needsUpdate = true;
    return;
  }

  if (!preserveAuthoredColor && "color" in material && material.color instanceof THREE.Color) {
    clampHslColor(material.color, role);
  }

  if ("roughness" in material && typeof material.roughness === "number") {
    material.roughness = Math.max(material.roughness, role?.roughness ?? 0.78);
  }
  if ("metalness" in material && typeof material.metalness === "number") {
    material.metalness = Math.min(material.metalness, role?.metalness ?? 0.08);
  }
  if ("envMapIntensity" in material && typeof material.envMapIntensity === "number") {
    material.envMapIntensity = Math.min(material.envMapIntensity, 0.42);
  }
  material.needsUpdate = true;
}

export function applyAnalyticalDioramaFinish(rootObject: THREE.Object3D, manifest?: ViewerManifest): void {
  rootObject.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }
    if (isEnvironmentSkyDomeObject(mesh)) {
      return;
    }
    for (const material of materialList(mesh.material)) {
      if (material.userData?.analyticalDioramaFinish) {
        continue;
      }
      applyMaterialFinish(mesh, material, manifest);
    }
  });
}
