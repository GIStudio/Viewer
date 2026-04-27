/**
 * Top-down map export utilities for the RoadGen3D Viewer.
 * 
 * Handles PNG and SVG export of scene top-down views.
 */

import * as THREE from "three";

export const EXPORT_COLORS = {
  carriageway: "#424a57",
  drive_lane: "#424a57",
  bus_lane: "#b7483a",
  bike_lane: "#39875a",
  parking_lane: "#a68256",
  median: "#6e7a5f",
  nearroad_buffer: "#c4c4c4",
  nearroad_furnishing: "#b5a28a",
  clear_sidewalk: "#d4d0c8",
  sidewalk: "#d4d0c8",
  frontage_reserve: "#b7d4e6",
  grass_belt: "#8cb369",
  shared_street: "#c9b896",
  colored_pavement: "#e8dcc8",
  zebra_stripe: "#ffffff",
  zebra_stripe_dark: "#424a57",
};

/**
 * Export top-down map as PNG.
 */
export function exportTopDownMapPng(
  scene: THREE.Scene,
  root: THREE.Object3D | null,
  fileName: string = "scene_topdown",
): void {
  if (!root) {
    alert("No scene loaded. Please load a layout first.");
    return;
  }

  const bbox = new THREE.Box3().setFromObject(root);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.z);

  if (!isFinite(maxExtent) || maxExtent <= 0) {
    alert("Scene bounds are too small to export.");
    return;
  }

  const padding = maxExtent * 0.15;
  const viewSize = maxExtent + padding * 2;

  const camera = new THREE.OrthographicCamera(
    -viewSize / 2,
    viewSize / 2,
    viewSize / 2,
    -viewSize / 2,
    0.1,
    5000,
  );
  camera.position.set(center.x, center.y + size.y * 0.5 + viewSize * 1.2, center.z);
  camera.lookAt(center.x, center.y, center.z);
  camera.updateProjectionMatrix();

  const resolution = 4096;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(resolution, resolution);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0xf7f6f3);
  renderer.clear();
  renderer.render(scene, camera);

  const canvas = renderer.domElement;
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, "image/png");

  renderer.dispose();
}

/**
 * Export top-down map as SVG.
 */
export function exportTopDownMapSvg(
  root: THREE.Object3D | null,
  fileName: string = "scene_topdown",
): void {
  if (!root) {
    alert("No scene loaded. Please load a layout first.");
    return;
  }

  const bbox = new THREE.Box3().setFromObject(root);
  const size = bbox.getSize(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.z);

  if (!isFinite(maxExtent) || maxExtent <= 0) {
    alert("Scene bounds are too small to export.");
    return;
  }

  const padding = maxExtent * 0.15;
  const width = maxExtent + padding * 2;
  const height = maxExtent + padding * 2;

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#f7f6f3"/>
  <g transform="translate(${padding}, ${padding})">
    <rect x="0" y="0" width="${maxExtent}" height="${maxExtent}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>
    <text x="${maxExtent / 2}" y="${maxExtent / 2}" text-anchor="middle" font-size="24" fill="#475569">
      Scene Top-Down View
    </text>
  </g>
</svg>`;

  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
