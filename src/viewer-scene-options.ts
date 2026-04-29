import type { SceneOption, ViewerManifest } from "./viewer-types";

export function makeSceneOptions(manifest: ViewerManifest): SceneOption[] {
  const options: SceneOption[] = [
    {
      key: "final_scene",
      label: manifest.final_scene.label,
      glbUrl: manifest.final_scene.glb_url,
    },
  ];
  for (const step of manifest.production_steps ?? []) {
    options.push({
      key: step.step_id,
      label: step.title,
      glbUrl: step.glb_url,
    });
  }
  return options;
}

export function makeDirectLayoutLabel(layoutPath: string): string {
  const normalized = layoutPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const tail = parts.slice(-2).join("/");
  return `Direct Layout · ${tail || normalized}`;
}

export function compactUiLabel(label: string, maxLength = 54): string {
  if (label.length <= maxLength) {
    return label;
  }

  const normalized = label.replace(/\\/g, "/");
  if (normalized.includes("/")) {
    const parts = normalized.split("/").filter(Boolean);
    const tail = parts.slice(-2).join("/");
    const head = parts[0] ?? "";
    const compactPath = `${head}/.../${tail}`;
    if (compactPath.length <= maxLength) {
      return compactPath;
    }
    if (tail.length + 1 >= maxLength) {
      return `...${tail.slice(-(maxLength - 3))}`;
    }
  }

  const left = Math.max(8, Math.floor((maxLength - 1) / 2));
  const right = Math.max(8, maxLength - left - 1);
  return `${label.slice(0, left)}...${label.slice(-right)}`;
}

export function turnLanePatchSvgClass(patch: Record<string, unknown>): string {
  const surfaceRole = String(patch.surface_role ?? "").toLowerCase();
  const stripKind = String(patch.strip_kind ?? "").toLowerCase();
  if (surfaceRole === "bike_lane" || stripKind === "bike_lane") return "bikelane";
  if (surfaceRole === "bus_lane" || stripKind === "bus_lane") return "buslane";
  if (surfaceRole === "parking_lane" || stripKind === "parking_lane") return "parking";
  if (surfaceRole === "furnishing" || stripKind.includes("furnishing") || stripKind.includes("buffer")) return "furnishing";
  if (surfaceRole === "context_ground" || stripKind === "frontage_reserve") return "frontage";
  if (surfaceRole === "sidewalk" || stripKind === "clear_sidewalk") return "sidewalk";
  return "road";
}
