/**
 * Scene Map plan export utilities for the RoadGen3D Viewer.
 *
 * Both file formats are produced from the canonical manifest-driven Plan
 * compositor used by the expanded Scene Map. The SVG intentionally embeds
 * that exact rasterized plan so PNG and SVG cannot drift visually.
 */

import * as THREE from "three";
import { renderPlanMapCanvas } from "./viewer-expanded-map";
import type { SceneBounds } from "./viewer-minimap";
import type { ViewerManifest } from "./viewer-types";

export type TopDownMapExportContext = {
  manifest: ViewerManifest | null;
  bounds: SceneBounds | null;
  avatarPosition: THREE.Vector3;
  forward: THREE.Vector3;
  text: (en: string, zh: string) => string;
};

function renderExportCanvas(context: TopDownMapExportContext): HTMLCanvasElement | null {
  if (!context.manifest || !context.bounds) {
    alert(context.text("No scene loaded. Please load a layout first.", "未加载场景，请先加载布局。"));
    return null;
  }
  try {
    return renderPlanMapCanvas({
      manifest: context.manifest,
      bounds: context.bounds,
      avatarPosition: context.avatarPosition,
      forward: context.forward,
      text: context.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    alert(context.text(`Unable to export plan map: ${message}`, `无法导出平面图：${message}`));
    return null;
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Export the current Scene Map Plan as a high-resolution PNG. */
export function exportTopDownMapPng(
  context: TopDownMapExportContext,
  fileName: string = "scene_map_plan",
): void {
  const canvas = renderExportCanvas(context);
  if (!canvas) {
    return;
  }
  canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, `${fileName}.png`);
    }
  }, "image/png");
}

/**
 * Export the current Scene Map Plan as SVG.
 *
 * The SVG wraps the exact canonical Plan canvas in an image element. This
 * preserves the Scene Map's labels, symbols, compositing, and layer order in
 * SVG-capable tools without maintaining a second geometry renderer.
 */
export function exportTopDownMapSvg(
  context: TopDownMapExportContext,
  fileName: string = "scene_map_plan",
): void {
  const canvas = renderExportCanvas(context);
  if (!canvas) {
    return;
  }
  const dataUrl = canvas.toDataURL("image/png");
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" width="${canvas.width}" height="${canvas.height}">
  <title>RoadGen3D Scene Map Plan</title>
  <image href="${dataUrl}" x="0" y="0" width="${canvas.width}" height="${canvas.height}" preserveAspectRatio="none"/>
</svg>`;
  downloadBlob(new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" }), `${fileName}.svg`);
}
