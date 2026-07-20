/**
 * Camera-local surface diagnostics derived from the actual loaded GLB.
 *
 * This module never reconstructs road geometry from the manifest. The manifest
 * supplies classification/provenance only; every exported polygon is clipped
 * from a transformed top-face triangle in the live Three.js scene.
 */

import * as THREE from "three";
import type {
  SurfaceDiagnosticManifest,
  SurfaceDiagnosticPatch,
  SurfaceDiagnosticRole,
  ViewerManifest,
} from "./viewer-types";

export type SurfaceDiagnosticColorMode = "role" | "patch";

type PointXZ = [number, number];

export type CameraSurfaceDiagnosticTriangle = {
  node_name: string;
  surface_role: SurfaceDiagnosticRole;
  points_xz: [PointXZ, PointXZ, PointXZ];
  source_patch_id?: string;
  junction_id?: string;
  quadrant_id?: string;
  from_road_id?: number;
  to_road_id?: number;
  qa_flags: string[];
};

export type CameraSurfaceDiagnostic = {
  schema_version: "roadgen3d.camera-surface-diagnostic.v1";
  scene_fingerprint: string;
  center_xz: PointXZ;
  half_extent_m: 100;
  bounds_xz: [number, number, number, number];
  camera_y_m: number;
  forward_xz: PointXZ;
  color_mode: SurfaceDiagnosticColorMode;
  source_geometry: "final_glb_top_faces";
  role_counts: Record<string, number>;
  role_areas_m2: Record<string, number>;
  triangles: CameraSurfaceDiagnosticTriangle[];
  geometry_qa: Record<string, unknown>;
  classification_warnings: string[];
};

export type CameraSurfaceDiagnosticContext = {
  root: THREE.Object3D | null;
  camera: THREE.Camera;
  manifest: ViewerManifest | null;
  colorMode: SurfaceDiagnosticColorMode;
  text: (en: string, zh: string) => string;
};

const HALF_EXTENT_M = 100;
const PNG_SIZE = 2400;
const EPSILON = 1e-8;

export const SURFACE_ROLE_PALETTE: Record<SurfaceDiagnosticRole, string> = {
  context_ground: "#E8E4D8",
  carriageway: "#8B9196",
  curb: "#102D3A",
  sidewalk: "#F3F0E7",
  furnishing: "#E79A52",
  frontage: "#9B78C2",
  planting: "#66AD61",
  crossing: "#FFFFFF",
  lane_mark: "#FCFAF4",
  building: "#4F91C7",
};

export const SURFACE_ROLE_ORDER: Record<SurfaceDiagnosticRole, number> = {
  context_ground: 0,
  planting: 1,
  frontage: 2,
  carriageway: 3,
  furnishing: 4,
  sidewalk: 5,
  curb: 6,
  lane_mark: 7,
  crossing: 8,
  building: 9,
};

function finitePoint(value: unknown): value is PointXZ {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

function normalizeRole(value: unknown): SurfaceDiagnosticRole | null {
  const role = String(value ?? "").toLowerCase();
  if (role === "ground" || role === "context_ground_base") return "context_ground";
  if (role === "vehicle_surface" || role === "road" || role === "road_surface") return "carriageway";
  if (role === "pavement") return "sidewalk";
  if (role === "facility" || role === "furniture") return "furnishing";
  if (role === "building_massing") return "building";
  return Object.prototype.hasOwnProperty.call(SURFACE_ROLE_PALETTE, role)
    ? role as SurfaceDiagnosticRole
    : null;
}

function fallbackRoleForName(name: string): SurfaceDiagnosticRole | null {
  const key = name.toLowerCase();
  if (key.includes("context_ground")) return "context_ground";
  if (key.includes("crosswalk") || key.includes("crossing")) return "crossing";
  if (key.includes("lane_mark") || key.includes("lane_edge") || key.includes("center_mark")) return "lane_mark";
  if (key.includes("carriageway") || key.includes("vehicle_surface") || key.startsWith("road_surface")) return "carriageway";
  if (key.includes("sidewalk") || key.includes("pavement")) return "sidewalk";
  if (key.includes("curb")) return "curb";
  if (key.includes("furnish")) return "furnishing";
  if (key.includes("frontage")) return "frontage";
  if (key.includes("planting") || key.includes("green_surface")) return "planting";
  if (key.includes("building") || key.includes("massing")) return "building";
  return null;
}

function resolveNodeRole(
  object: THREE.Object3D,
  diagnostic: SurfaceDiagnosticManifest | undefined,
  warnings: Set<string>,
): { name: string; role: SurfaceDiagnosticRole } | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    const explicit = normalizeRole(diagnostic?.node_roles?.[node.name]);
    if (explicit) return { name: node.name || object.name || object.uuid, role: explicit };
    node = node.parent;
  }
  node = object;
  while (node) {
    const fallback = fallbackRoleForName(node.name);
    if (fallback) {
      warnings.add(`fallback_node_role:${node.name || object.uuid}`);
      return { name: node.name || object.name || object.uuid, role: fallback };
    }
    node = node.parent;
  }
  return null;
}

function clipPolygonAgainstEdge(
  polygon: PointXZ[],
  inside: (point: PointXZ) => boolean,
  intersect: (a: PointXZ, b: PointXZ) => PointXZ,
): PointXZ[] {
  if (polygon.length === 0) return [];
  const output: PointXZ[] = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = inside(previous);
  for (const current of polygon) {
    const currentInside = inside(current);
    if (currentInside !== previousInside) output.push(intersect(previous, current));
    if (currentInside) output.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return output;
}

function clipTriangleToBounds(
  triangle: [PointXZ, PointXZ, PointXZ],
  bounds: [number, number, number, number],
): Array<[PointXZ, PointXZ, PointXZ]> {
  const [minX, minZ, maxX, maxZ] = bounds;
  let polygon: PointXZ[] = triangle.map((point) => [...point] as PointXZ);
  const verticalIntersection = (x: number) => (a: PointXZ, b: PointXZ): PointXZ => {
    const t = Math.abs(b[0] - a[0]) <= EPSILON ? 0 : (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + (b[1] - a[1]) * t];
  };
  const horizontalIntersection = (z: number) => (a: PointXZ, b: PointXZ): PointXZ => {
    const t = Math.abs(b[1] - a[1]) <= EPSILON ? 0 : (z - a[1]) / (b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * t, z];
  };
  polygon = clipPolygonAgainstEdge(polygon, (p) => p[0] >= minX, verticalIntersection(minX));
  polygon = clipPolygonAgainstEdge(polygon, (p) => p[0] <= maxX, verticalIntersection(maxX));
  polygon = clipPolygonAgainstEdge(polygon, (p) => p[1] >= minZ, horizontalIntersection(minZ));
  polygon = clipPolygonAgainstEdge(polygon, (p) => p[1] <= maxZ, horizontalIntersection(maxZ));
  if (polygon.length < 3) return [];
  const result: Array<[PointXZ, PointXZ, PointXZ]> = [];
  for (let index = 1; index < polygon.length - 1; index += 1) {
    result.push([polygon[0], polygon[index], polygon[index + 1]]);
  }
  return result;
}

function triangleArea(points: [PointXZ, PointXZ, PointXZ]): number {
  const [a, b, c] = points;
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * 0.5;
}

function pointInRing(point: PointXZ, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = Number(ring[i]?.[0]);
    const zi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const zj = Number(ring[j]?.[1]);
    if (![xi, zi, xj, zj].every(Number.isFinite)) continue;
    const intersects = ((zi > point[1]) !== (zj > point[1]))
      && point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi || EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function patchAtPoint(
  point: PointXZ,
  role: SurfaceDiagnosticRole,
  patches: SurfaceDiagnosticPatch[],
): SurfaceDiagnosticPatch | undefined {
  return patches.find((patch) => {
    const patchRole = normalizeRole(patch.surface_role);
    if (patchRole && patchRole !== role) return false;
    const rings = Array.isArray(patch.rings_xz) ? patch.rings_xz : [];
    let inside = false;
    for (const ring of rings) {
      if (Array.isArray(ring) && ring.length >= 3 && pointInRing(point, ring)) inside = !inside;
    }
    return inside;
  });
}

function triangleQualityFlags(points: [PointXZ, PointXZ, PointXZ]): string[] {
  const lengths = [
    Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]),
    Math.hypot(points[2][0] - points[1][0], points[2][1] - points[1][1]),
    Math.hypot(points[0][0] - points[2][0], points[0][1] - points[2][1]),
  ];
  const area = triangleArea(points);
  const longest = Math.max(...lengths);
  const shortest = Math.min(...lengths);
  const height = longest > EPSILON ? (2 * area) / longest : 0;
  const flags: string[] = [];
  if (shortest > EPSILON && longest / Math.max(height, EPSILON) > 250) flags.push("needle_top_face");
  if (shortest < 0.002 - EPSILON) flags.push("short_edge");
  return flags;
}

export type FinalSurfaceTriangleExtraction = {
  triangles: CameraSurfaceDiagnosticTriangle[];
  classification_warnings: string[];
};

/**
 * Extract classified, horizontal top-face triangles from the actual loaded GLB.
 * Both the export diagnostic and the always-on minimap consume this exact data,
 * so the small plan cannot drift away from the rendered scene.
 */
export function extractFinalSurfaceTriangles(
  root: THREE.Object3D,
  manifest: ViewerManifest | null,
  bounds: [number, number, number, number],
): FinalSurfaceTriangleExtraction {
  const diagnostic = manifest?.surface_diagnostic;
  const warnings = new Set<string>();
  if (!diagnostic) warnings.add("missing_surface_diagnostic_manifest");
  if (diagnostic?.source && diagnostic.source !== "final_glb_top_faces") {
    warnings.add(`unexpected_diagnostic_source:${diagnostic.source}`);
  }
  const patches = Array.isArray(diagnostic?.patch_provenance) ? diagnostic.patch_provenance : [];
  const triangles: CameraSurfaceDiagnosticTriangle[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || object.userData?.viewerHelper) return;
    const resolved = resolveNodeRole(mesh, diagnostic, warnings);
    if (!resolved) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    if (!position || position.itemSize < 3) return;
    const index = geometry.getIndex();
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const ia = index ? index.getX(triangleIndex * 3) : triangleIndex * 3;
      const ib = index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1;
      const ic = index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);
      if (normal.lengthSq() <= EPSILON || Math.abs(normal.normalize().y) < 0.72) continue;
      const clipped = clipTriangleToBounds([[a.x, a.z], [b.x, b.z], [c.x, c.z]], bounds);
      for (const points of clipped) {
        if (triangleArea(points) <= 1e-8) continue;
        const centroid: PointXZ = [
          (points[0][0] + points[1][0] + points[2][0]) / 3,
          (points[0][1] + points[1][1] + points[2][1]) / 3,
        ];
        const patch = patchAtPoint(centroid, resolved.role, patches);
        const qaFlags = triangleQualityFlags(points);
        if (resolved.role === "context_ground" && patchAtPoint(centroid, "carriageway", patches)) {
          qaFlags.push("context_ground_exposure_inside_transition");
        }
        triangles.push({
          node_name: resolved.name,
          surface_role: resolved.role,
          points_xz: points,
          ...(patch?.patch_id ? { source_patch_id: patch.patch_id } : {}),
          ...(patch?.junction_id ? { junction_id: patch.junction_id } : {}),
          ...(patch?.quadrant_id ? { quadrant_id: patch.quadrant_id } : {}),
          ...(Number.isFinite(Number(patch?.from_road_id)) ? { from_road_id: Number(patch?.from_road_id) } : {}),
          ...(Number.isFinite(Number(patch?.to_road_id)) ? { to_road_id: Number(patch?.to_road_id) } : {}),
          qa_flags: qaFlags,
        });
      }
    }
  });

  return {
    triangles,
    classification_warnings: [...warnings].sort(),
  };
}

function sceneFingerprint(manifest: ViewerManifest | null): string {
  return String(
    manifest?.layout_revision?.sha256
    ?? (manifest?.summary as Record<string, unknown> | undefined)?.scene_fingerprint
    ?? manifest?.layout_path
    ?? manifest?.final_scene?.glb_url
    ?? "unknown-scene",
  );
}

export function buildCameraSurfaceDiagnostic(context: CameraSurfaceDiagnosticContext): CameraSurfaceDiagnostic {
  if (!context.root) throw new Error(context.text("No 3D scene is loaded.", "尚未加载 3D 场景。"));
  const diagnostic = context.manifest?.surface_diagnostic;

  context.root.updateWorldMatrix(true, true);
  context.camera.updateWorldMatrix(true, false);
  const cameraPosition = context.camera.getWorldPosition(new THREE.Vector3());
  const forward = context.camera.getWorldDirection(new THREE.Vector3());
  const forwardLength = Math.hypot(forward.x, forward.z) || 1;
  const center: PointXZ = [cameraPosition.x, cameraPosition.z];
  const bounds: [number, number, number, number] = [
    center[0] - HALF_EXTENT_M,
    center[1] - HALF_EXTENT_M,
    center[0] + HALF_EXTENT_M,
    center[1] + HALF_EXTENT_M,
  ];
  const extraction = extractFinalSurfaceTriangles(context.root, context.manifest, bounds);
  const triangles = extraction.triangles;

  if (triangles.length === 0) {
    throw new Error(context.text(
      "No classified final GLB top faces were found within 100 m of the camera.",
      "相机 100 米范围内没有找到可分类的最终 GLB 顶面。",
    ));
  }
  const roleCounts: Record<string, number> = {};
  const roleAreas: Record<string, number> = {};
  for (const triangle of triangles) {
    roleCounts[triangle.surface_role] = (roleCounts[triangle.surface_role] ?? 0) + 1;
    roleAreas[triangle.surface_role] = (roleAreas[triangle.surface_role] ?? 0) + triangleArea(triangle.points_xz);
  }
  Object.keys(roleAreas).forEach((role) => { roleAreas[role] = Number(roleAreas[role].toFixed(6)); });
  return {
    schema_version: "roadgen3d.camera-surface-diagnostic.v1",
    scene_fingerprint: sceneFingerprint(context.manifest),
    center_xz: [Number(center[0].toFixed(6)), Number(center[1].toFixed(6))],
    half_extent_m: HALF_EXTENT_M,
    bounds_xz: bounds.map((value) => Number(value.toFixed(6))) as [number, number, number, number],
    camera_y_m: Number(cameraPosition.y.toFixed(6)),
    forward_xz: [Number((forward.x / forwardLength).toFixed(6)), Number((forward.z / forwardLength).toFixed(6))],
    color_mode: context.colorMode,
    source_geometry: "final_glb_top_faces",
    role_counts: roleCounts,
    role_areas_m2: roleAreas,
    triangles,
    geometry_qa: { ...(diagnostic?.geometry_qa ?? {}) },
    classification_warnings: extraction.classification_warnings,
  };
}

function stablePatchColor(triangle: CameraSurfaceDiagnosticTriangle): string {
  const key = triangle.source_patch_id
    ?? triangle.quadrant_id
    ?? ((triangle.from_road_id != null || triangle.to_road_id != null)
      ? `${triangle.from_road_id ?? ""}:${triangle.to_road_id ?? ""}`
      : triangle.node_name);
  let hash = 2166136261;
  for (const char of key || triangle.node_name) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 58% 66%)`;
}

function triangleFill(triangle: CameraSurfaceDiagnosticTriangle, mode: SurfaceDiagnosticColorMode): string {
  if (triangle.qa_flags.length > 0) return "#DF654F";
  if (mode === "patch" && triangle.surface_role !== "context_ground") return stablePatchColor(triangle);
  return SURFACE_ROLE_PALETTE[triangle.surface_role];
}

function orderedTriangles(diagnostic: CameraSurfaceDiagnostic): CameraSurfaceDiagnosticTriangle[] {
  return [...diagnostic.triangles].sort((a, b) => SURFACE_ROLE_ORDER[a.surface_role] - SURFACE_ROLE_ORDER[b.surface_role]);
}

function projectPoint(point: PointXZ, bounds: [number, number, number, number], size = PNG_SIZE): PointXZ {
  const [minX, minZ, maxX, maxZ] = bounds;
  return [
    ((point[0] - minX) / (maxX - minX)) * size,
    ((maxZ - point[1]) / (maxZ - minZ)) * size,
  ];
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSvg(diagnostic: CameraSurfaceDiagnostic): string {
  const polygons = orderedTriangles(diagnostic).map((triangle) => {
    const points = triangle.points_xz
      .map((point) => projectPoint(point, diagnostic.bounds_xz).map((value) => value.toFixed(2)).join(","))
      .join(" ");
    const isBuilding = triangle.surface_role === "building";
    return `<polygon points="${points}" fill="${isBuilding ? "none" : triangleFill(triangle, diagnostic.color_mode)}" fill-opacity="${isBuilding ? 0 : 0.9}" stroke="${triangle.qa_flags.length ? "#B42318" : isBuilding ? SURFACE_ROLE_PALETTE.building : "#40545D"}" stroke-width="${triangle.qa_flags.length ? 3 : 0.45}" data-node="${escapeXml(triangle.node_name)}" data-role="${triangle.surface_role}" data-patch="${escapeXml(triangle.source_patch_id ?? "")}" data-quadrant="${escapeXml(triangle.quadrant_id ?? "")}"/>`;
  }).join("\n  ");
  const camera = projectPoint(diagnostic.center_xz, diagnostic.bounds_xz);
  const arrow = [camera[0] + diagnostic.forward_xz[0] * 90, camera[1] - diagnostic.forward_xz[1] * 90];
  const scaleY = PNG_SIZE - 90;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PNG_SIZE} ${PNG_SIZE}" width="${PNG_SIZE}" height="${PNG_SIZE}">
  <title>RoadGen3D camera-local final GLB surface diagnostic</title>
  <rect width="${PNG_SIZE}" height="${PNG_SIZE}" fill="#F3F0E7"/>
  ${polygons}
  <g aria-label="camera" stroke="#174B64" stroke-width="12" fill="#F4C430">
    <circle cx="${camera[0]}" cy="${camera[1]}" r="18"/>
    <line x1="${camera[0]}" y1="${camera[1]}" x2="${arrow[0]}" y2="${arrow[1]}"/>
  </g>
  <g stroke="#102D3A" stroke-width="8" fill="none"><line x1="80" y1="${scaleY}" x2="680" y2="${scaleY}"/><line x1="80" y1="${scaleY - 18}" x2="80" y2="${scaleY + 18}"/><line x1="680" y1="${scaleY - 18}" x2="680" y2="${scaleY + 18}"/></g>
  <g fill="#102D3A" font-family="Inter,Arial,sans-serif" font-size="32"><text x="80" y="${scaleY - 28}">50 m</text><text x="80" y="58">RoadGen3D · final GLB top faces · ${escapeXml(diagnostic.color_mode)}</text><text x="80" y="${PNG_SIZE - 28}">center ${diagnostic.center_xz.join(", ")} · ${escapeXml(diagnostic.scene_fingerprint.slice(0, 24))}</text><text x="${PNG_SIZE - 95}" y="58">N ↑</text></g>
</svg>`;
}

function buildCanvas(diagnostic: CameraSurfaceDiagnostic): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PNG_SIZE;
  canvas.height = PNG_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = "#F3F0E7";
  ctx.fillRect(0, 0, PNG_SIZE, PNG_SIZE);
  for (const triangle of orderedTriangles(diagnostic)) {
    const points = triangle.points_xz.map((point) => projectPoint(point, diagnostic.bounds_xz));
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineTo(points[2][0], points[2][1]);
    ctx.closePath();
    if (triangle.surface_role !== "building") {
      ctx.fillStyle = triangleFill(triangle, diagnostic.color_mode);
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = triangle.qa_flags.length ? "#B42318" : triangle.surface_role === "building" ? SURFACE_ROLE_PALETTE.building : "#40545D";
    ctx.lineWidth = triangle.qa_flags.length ? 3 : 0.45;
    ctx.stroke();
  }
  const camera = projectPoint(diagnostic.center_xz, diagnostic.bounds_xz);
  ctx.strokeStyle = "#174B64";
  ctx.fillStyle = "#F4C430";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(camera[0], camera[1], 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(camera[0], camera[1]);
  ctx.lineTo(camera[0] + diagnostic.forward_xz[0] * 90, camera[1] - diagnostic.forward_xz[1] * 90);
  ctx.stroke();
  ctx.fillStyle = "#102D3A";
  ctx.font = "32px Inter, Arial, sans-serif";
  ctx.fillText(`RoadGen3D · final GLB top faces · ${diagnostic.color_mode}`, 80, 58);
  ctx.fillText("N ↑", PNG_SIZE - 95, 58);
  ctx.fillText(`center ${diagnostic.center_xz.join(", ")} · ${diagnostic.scene_fingerprint.slice(0, 24)}`, 80, PNG_SIZE - 28);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(80, PNG_SIZE - 90);
  ctx.lineTo(680, PNG_SIZE - 90);
  ctx.stroke();
  ctx.fillText("50 m", 80, PNG_SIZE - 118);
  return canvas;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportCameraSurfaceDiagnostic(
  context: CameraSurfaceDiagnosticContext,
  stem = "camera_surface_diagnostic",
): Promise<CameraSurfaceDiagnostic> {
  const diagnostic = buildCameraSurfaceDiagnostic(context);
  const svg = buildSvg(diagnostic);
  const json = JSON.stringify(diagnostic, null, 2);
  const canvas = buildCanvas(diagnostic);
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoding failed.")), "image/png");
  });
  downloadBlob(png, `${stem}.png`);
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${stem}.svg`);
  downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), `${stem}.json`);
  return diagnostic;
}

export function renderCameraSurfaceDiagnosticControls(
  text: (en: string, zh: string) => string,
  hasScene: boolean,
): string {
  return `
    <section class="viewer-surface-diagnostic-card">
      <div class="viewer-surface-diagnostic-heading">
        <div>
          <strong>${text("Camera-local geometry diagnostic", "相机局部几何诊断")}</strong>
          <small>${text("Exports final GLB top faces within 100 m in every direction. The patch view changes debug colors only.", "导出相机前后左右各 100 米内的最终 GLB 顶面；patch 模式只改变调试颜色。")}</small>
        </div>
        <span>${text("200 m × 200 m · north-up", "200 米 × 200 米 · 北向固定")}</span>
      </div>
      <label class="viewer-surface-diagnostic-field">
        <span>${text("Color by", "分色方式")}</span>
        <select id="viewer-surface-diagnostic-mode">
          <option value="role">${text("Semantic surface role", "语义表面角色")}</option>
          <option value="patch">${text("Road arm / quadrant / original patch", "道路臂 / 象限 / 原始 patch")}</option>
        </select>
      </label>
      <button id="viewer-export-camera-surface-diagnostic" class="viewer-surface-diagnostic-export" type="button" ${hasScene ? "" : "disabled"}>
        ${text("Export PNG + SVG + JSON", "导出 PNG + SVG + JSON")}
      </button>
      <p>${text("The JSON preserves node, role, road-arm, quadrant, patch and QA provenance for every clipped final triangle.", "JSON 为每个裁切后的最终三角面保留节点、角色、道路臂、象限、patch 与 QA 来源。")}</p>
    </section>
  `;
}
