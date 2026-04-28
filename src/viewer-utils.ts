/**
 * Utility functions for the RoadGen3D Viewer.
 * 
 * Extracted from app.ts to improve modularity.
 */

import * as THREE from "three";

/**
 * Create a text sprite with given text and styling.
 */
export function createTextSprite(
  text: string,
  optionsOrColor?: {
    fontSize?: number;
    color?: string;
    bgColor?: string;
    padding?: number;
    borderRadius?: number;
    fontWeight?: string;
    maxWidth?: number;
  } | number,
): THREE.Sprite {
  // Support legacy calling pattern where second arg is a color number
  let options: {
    fontSize?: number;
    color?: string;
    bgColor?: string;
    padding?: number;
    borderRadius?: number;
    fontWeight?: string;
    maxWidth?: number;
  } = {};
  
  if (typeof optionsOrColor === "number") {
    // Legacy: second arg is color number
    const colorHex = "#" + optionsOrColor.toString(16).padStart(6, "0");
    options = { color: colorHex, fontSize: 64 };
  } else if (optionsOrColor) {
    options = optionsOrColor;
  }
  
  const {
    fontSize = 48,
    color = "#000000",
    bgColor = "rgba(255, 255, 255, 0.9)",
    padding = 12,
    borderRadius = 8,
    fontWeight = "600",
    maxWidth = 600,
  } = options;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  context.font = font;

  // Measure text and wrap
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineWidths = lines.map((line) => context.measureText(line).width);
  const textWidth = Math.max(...lineWidths);
  const textHeight = fontSize * 1.3 * lines.length;
  
  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = Math.ceil(textHeight + padding * 2);

  // Redraw with correct dimensions
  context.font = font;
  context.fillStyle = bgColor;
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
  context.fill();

  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "top";
  lines.forEach((line, i) => {
    context.fillText(line, canvas.width / 2, padding + i * fontSize * 1.3);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
  return sprite;
}

export function requireElement<T extends HTMLElement>(root: HTMLElement | Document, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Required element not found: ${selector}`);
  return el;
}

/**
 * Escape HTML to prevent XSS.
 */
export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Return value if finite, otherwise return fallback.
 */
export function finiteOrNull(value: number | null | undefined, fallback: number | null = null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Assert array has exactly N elements and return as tuple.
 */
export function asTriplet<T>(arr: T[] | null | undefined): [T, T, T] | null {
  if (!Array.isArray(arr) || arr.length !== 3) return null;
  return [arr[0], arr[1], arr[2]];
}

export function asQuad<T>(arr: T[] | null | undefined): [T, T, T, T] | null {
  if (!Array.isArray(arr) || arr.length !== 4) return null;
  return [arr[0], arr[1], arr[2], arr[3]];
}

export function isFiniteTriplet(triplet: [unknown, unknown, unknown] | null): boolean {
  if (!triplet) return false;
  return triplet.every((v) => typeof v === "number" && Number.isFinite(v));
}

/**
 * Dispose Three.js object and its children recursively.
 */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
    if (child instanceof THREE.Sprite) {
      child.material?.dispose();
    }
    if (child instanceof THREE.Line) {
      child.geometry?.dispose();
      (child.material as THREE.Material)?.dispose();
    }
  });
}

/**
 * Sleep for given milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
