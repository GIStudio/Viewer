import type { ReferenceAnnotation, Selection } from "../sg-types";
import { sampleBezierPoints } from "../sg-geometry";
import { escapeHtml } from "../viewer-utils";

function buildManualJunctionCompositionOverlayMarkup(annotation: ReferenceAnnotation, selection: Selection): string {
  return (annotation.junction_compositions ?? [])
    .flatMap((comp) =>
      comp.quadrants.flatMap((q) => {
        const isSelected =
          selection?.kind === "junction" && selection.id === comp.junctionId;
        const patchesMarkup = q.patches
          .map((patch) => {
            const innerPts = sampleBezierPoints(patch.innerCurve, 12);
            const outerPts = sampleBezierPoints(patch.outerCurve, 12);
            const d = [
              `M ${innerPts[0].x.toFixed(2)},${innerPts[0].y.toFixed(2)}`,
              ...innerPts.slice(1).map((p) => `L ${p.x.toFixed(2)},${p.y.toFixed(2)}`),
              ...outerPts
                .slice()
                .reverse()
                .map((p) => `L ${p.x.toFixed(2)},${p.y.toFixed(2)}`),
              "Z",
            ].join(" ");
            const fillColor =
              patch.stripKind === "clear_sidewalk"
                ? "rgba(232, 213, 181, 0.5)"
                : patch.stripKind === "nearroad_furnishing"
                  ? "rgba(196, 168, 130, 0.5)"
                  : "rgba(168, 196, 212, 0.5)";
            return `
              <path
                d="${d}"
                fill="${fillColor}"
                stroke="rgba(90,90,90,0.6)"
                stroke-width="1"
                data-feature-kind="junction"
                data-feature-id="${escapeHtml(comp.junctionId)}"
              />
            `;
          })
          .join("");
        const skeletonMarkup = q.skeletonLines
          .map((sl) => {
            const pts = sampleBezierPoints(sl.curve, 16);
            const d = `M ${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")}`;
            const strokeColor =
              sl.stripKind === "clear_sidewalk"
                ? "#d4b080"
                : sl.stripKind === "nearroad_furnishing"
                  ? "#8b6f4e"
                  : "#6b8fa3";
            return `
              <path
                d="${d}"
                fill="none"
                stroke="${strokeColor}"
                stroke-width="${Math.max(1, sl.widthM * annotation.pixels_per_meter).toFixed(1)}"
                stroke-opacity="0.8"
                data-feature-kind="junction"
                data-feature-id="${escapeHtml(comp.junctionId)}"
              />
            `;
          })
          .join("");
        return [`<g class="annotation-feature-group">`, patchesMarkup, skeletonMarkup, `</g>`];
      }),
    )
    .join("");
}

export { buildManualJunctionCompositionOverlayMarkup };
