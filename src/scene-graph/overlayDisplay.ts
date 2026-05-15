import type { AnnotatedCenterline, AnnotationPoint, StripKind, StripZone } from "../sg-types";
import { DEFAULT_CENTERLINE_MARK_WIDTH_M, METAAURBAN_STRIP_DISPLAY_LABELS, STRIP_KIND_LABELS } from "../sg-constants";
import { getCenterlineCrossSectionWidth } from "../sg-utils";
import { unionMergedSurfaceRings } from "../junction-surface-geometry";

function getDisplayReferenceWidthPx(centerline: AnnotatedCenterline, pixelsPerMeter: number): number {
  const explicitWidth = centerline.reference_width_px;
  if (explicitWidth !== null && explicitWidth > 0) {
    return explicitWidth;
  }
  return Math.max(getCenterlineCrossSectionWidth(centerline) * Math.max(pixelsPerMeter, 0.0001), 2);
}

function getDisplayCenterlineWidthPx(pixelsPerMeter: number): number {
  return Math.max(DEFAULT_CENTERLINE_MARK_WIDTH_M * Math.max(pixelsPerMeter, 0.0001), 1);
}

function metaurbanStripLabel(kind: StripKind): string {
  return METAAURBAN_STRIP_DISPLAY_LABELS[kind] || STRIP_KIND_LABELS[kind];
}

function stripVisualSurfaceFillColor(kind: StripKind): string {
  switch (kind) {
    case "drive_lane":
      return "rgb(56, 64, 75)";
    case "bus_lane":
      return "rgb(162, 70, 60)";
    case "bike_lane":
      return "rgb(60, 132, 88)";
    case "parking_lane":
      return "rgb(156, 126, 84)";
    case "median":
      return "rgb(110, 122, 95)";
    case "nearroad_buffer":
      return "rgb(152, 152, 152)";
    case "nearroad_furnishing":
      return "rgb(126, 101, 71)";
    case "clear_sidewalk":
      return "rgb(235, 224, 206)";
    case "farfromroad_buffer":
      return "rgb(169, 188, 202)";
    case "frontage_reserve":
      return "rgb(183, 212, 230)";
    case "grass_belt":
      return "rgb(100, 150, 80)";
    case "shared_street_surface":
      return "rgb(180, 160, 140)";
    case "colored_pavement":
      return "rgb(200, 175, 150)";
    default:
      return "rgb(102, 102, 102)";
  }
}

function cornerConnectionLabel(quadrantId: string): string {
  const parts = quadrantId.split("_");
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
  }
  return quadrantId.replace(/_/g, " ");
}

function stripStrokeColor(kind: StripKind): string {
  switch (kind) {
    case "drive_lane":
      return "rgba(66, 74, 87, 0.82)";
    case "bus_lane":
      return "rgba(183, 72, 58, 0.78)";
    case "bike_lane":
      return "rgba(57, 135, 90, 0.78)";
    case "parking_lane":
      return "rgba(166, 130, 86, 0.75)";
    case "median":
      return "rgba(110, 122, 95, 0.72)";
    case "nearroad_buffer":
      return "rgba(152, 152, 152, 0.4)";
    case "nearroad_furnishing":
      return "rgba(126, 101, 71, 0.56)";
    case "clear_sidewalk":
      return "rgba(235, 224, 206, 0.86)";
    case "farfromroad_buffer":
      return "rgba(169, 188, 202, 0.42)";
    case "frontage_reserve":
      return "rgba(183, 212, 230, 0.58)";
    case "grass_belt":
      return "rgba(100, 150, 80, 0.72)";
    case "shared_street_surface":
      return "rgba(180, 160, 140, 0.70)";
    case "colored_pavement":
      return "rgba(200, 175, 150, 0.70)";
    default:
      return "rgba(102, 102, 102, 0.6)";
  }
}

function ringPathData(points: AnnotationPoint[]): string {
  return `M ${points.map((point) => `${point.x},${point.y}`).join(" L ")} Z`;
}

function visualUnionPathData(rings: AnnotationPoint[][]): { d: string; fillRule: "evenodd" | "nonzero" } | null {
  const validRings = rings.filter((ring) => ring.length >= 3);
  if (validRings.length === 0) {
    return null;
  }
  if (validRings.length === 1) {
    return { d: ringPathData(validRings[0]), fillRule: "nonzero" };
  }
  try {
    const geometry = unionMergedSurfaceRings(...validRings);
    const segments: string[] = [];
    for (const polygon of geometry) {
      for (const ring of polygon) {
        if (ring.length < 3) {
          continue;
        }
        segments.push(`M ${ring.map(([x, y]) => `${x},${y}`).join(" L ")} Z`);
      }
    }
    if (segments.length > 0) {
      return { d: segments.join(" "), fillRule: "evenodd" };
    }
  } catch {
    // Fall back to one compound path. It still avoids repeated translucent
    // over-paint even if the boolean union rejects a diagnostic polygon.
  }
  return { d: validRings.map((ring) => ringPathData(ring)).join(" "), fillRule: "nonzero" };
}

function visualUnionSurfaceMarkup(
  rings: AnnotationPoint[][],
  className: string,
  dataAttributes: string,
  style = "",
): string {
  const path = visualUnionPathData(rings);
  if (!path) {
    return "";
  }
  return `
    <path
      class="${className}"
      d="${path.d}"
      fill-rule="${path.fillRule}"
      ${style ? `style="${style}"` : ""}
      ${dataAttributes}
    />
  `;
}

function stripZoneSideLabel(zone: StripZone): string {
  if (zone === "left") {
    return "Left side";
  }
  if (zone === "right") {
    return "Right side";
  }
  return "Center";
}

export {
  cornerConnectionLabel,
  getDisplayCenterlineWidthPx,
  getDisplayReferenceWidthPx,
  metaurbanStripLabel,
  stripStrokeColor,
  stripVisualSurfaceFillColor,
  stripZoneSideLabel,
  visualUnionSurfaceMarkup,
};
