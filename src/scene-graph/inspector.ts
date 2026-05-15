import type { AnnotatedBuildingRegion, AnnotatedCenterline, AnnotatedFunctionalZone, AnnotatedJunction, AnnotatedRegion, AnnotatedSurfaceAnnotation, AnnotationPoint, DerivedJunctionOverlay, ReferenceAnnotation, RegionRole } from "../sg-types";
import { BUILDING_REGION_MIN_SIZE_PX, FUNCTIONAL_ZONE_KINDS, FUNCTIONAL_ZONE_KIND_LABELS, FURNITURE_KIND_LABELS, SURFACE_ANNOTATION_KINDS, SURFACE_ANNOTATION_KIND_LABELS, SURFACE_ROLE_LABELS, SURFACE_ROLES } from "../sg-constants";
import { functionalZoneCentroid, derivedJunctionKindLabel } from "../sg-geometry";
import { polylineLength } from "../sg-utils";
import { escapeHtml } from "../viewer-utils";

function buildSelectOptions<T extends string>(
  values: readonly T[],
  selectedValue: T,
  labels: Record<T, string>,
): string {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(labels[value])}</option>`,
    )
    .join("");
}

function centerlineLengthM(centerline: AnnotatedCenterline, pixelsPerMeter: number): number {
  return polylineLength(centerline.points) / Math.max(pixelsPerMeter, 1e-6);
}

function regionCentroid(region: AnnotatedRegion): AnnotationPoint {
  if (!region.points.length) {
    return { x: 0, y: 0 };
  }
  return {
    x: region.points.reduce((sum, point) => sum + point.x, 0) / region.points.length,
    y: region.points.reduce((sum, point) => sum + point.y, 0) / region.points.length,
  };
}

function regionRoleLabel(role: RegionRole): string {
  if (role === "scene_region") {
    return "Scene Region";
  }
  if (role === "building_region") {
    return "Building Region";
  }
  return "Functional Region";
}

function buildBuildingRegionInspectorMarkup(region: AnnotatedBuildingRegion): string {
  const widthM = region.width_px;
  const heightM = region.height_px;
  return `
    <section class="annotation-cross-preview-section">
      <div class="annotation-cross-preview-header">
        <div>
          <h3>Building Region</h3>
          <div class="scene-micro-note">Rotated rectangle for building generation and orientation override.</div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">${widthM.toFixed(0)}px × ${heightM.toFixed(0)}px</span>
          <span class="annotation-cross-preview-stat">${region.yaw_deg.toFixed(0)}°</span>
        </div>
      </div>
      <div class="scene-inspector-grid">
        <label class="scene-form-field">
          <span>ID</span>
          <input id="annotation-region-id" type="text" value="${escapeHtml(region.id)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Label</span>
          <input id="annotation-region-label" type="text" value="${escapeHtml(region.label)}" />
        </label>
        <label class="scene-form-field">
          <span>Center X</span>
          <input id="annotation-region-center-x" type="number" step="1" value="${region.center_px.x.toFixed(0)}" />
        </label>
        <label class="scene-form-field">
          <span>Center Y</span>
          <input id="annotation-region-center-y" type="number" step="1" value="${region.center_px.y.toFixed(0)}" />
        </label>
        <label class="scene-form-field">
          <span>Width (px)</span>
          <input id="annotation-region-width" type="number" min="${BUILDING_REGION_MIN_SIZE_PX}" step="1" value="${region.width_px.toFixed(0)}" />
        </label>
        <label class="scene-form-field">
          <span>Height (px)</span>
          <input id="annotation-region-height" type="number" min="${BUILDING_REGION_MIN_SIZE_PX}" step="1" value="${region.height_px.toFixed(0)}" />
        </label>
        <label class="scene-form-field">
          <span>Yaw (deg)</span>
          <input id="annotation-region-yaw" type="number" step="1" value="${region.yaw_deg.toFixed(0)}" />
        </label>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Generation Rule</span>
          <strong>Buildings intersecting this region use its orientation. Later regions override earlier ones.</strong>
        </div>
      </div>
    </section>
  `;
}

function buildFunctionalZoneInspectorMarkup(zone: AnnotatedFunctionalZone): string {
  const pointCount = zone.points.length;
  const centroid = functionalZoneCentroid(zone);
  return `
    <section class="annotation-cross-preview-section">
      <div class="annotation-cross-preview-header">
        <div>
          <h3>Functional Zone</h3>
          <div class="scene-micro-note">Polygon zone for special functional areas like plazas, gardens, and playgrounds.</div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">${pointCount} pts</span>
        </div>
      </div>
      <div class="scene-inspector-grid">
        <label class="scene-form-field">
          <span>ID</span>
          <input id="annotation-zone-id" type="text" value="${escapeHtml(zone.id)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Label</span>
          <input id="annotation-zone-label" type="text" value="${escapeHtml(zone.label)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Kind</span>
          <select id="annotation-zone-kind">
            ${buildSelectOptions(FUNCTIONAL_ZONE_KINDS, zone.kind, FUNCTIONAL_ZONE_KIND_LABELS)}
          </select>
        </label>
        <label class="scene-form-field">
          <span>Centroid X</span>
          <input id="annotation-zone-center-x" type="number" step="1" value="${centroid.x.toFixed(0)}" readonly />
        </label>
        <label class="scene-form-field">
          <span>Centroid Y</span>
          <input id="annotation-zone-center-y" type="number" step="1" value="${centroid.y.toFixed(0)}" readonly />
        </label>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Hint</span>
          <strong>Double-click the canvas to finish drawing a polygon zone. Minimum 3 points required.</strong>
        </div>
      </div>
      ${zone.furniture_instances.length > 0 ? `
        <div class="annotation-furniture-section" style="margin-top:0.75rem">
          <div class="annotation-strip-section-header">
            <h3>Zone Furniture</h3>
            <span class="scene-micro-note">${zone.furniture_instances.length} items</span>
          </div>
          <div class="annotation-furniture-list">
            ${zone.furniture_instances.map((instance) => `
              <div class="annotation-furniture-row">
                <div class="annotation-furniture-row-header">
                  <strong>${escapeHtml(instance.instance_id)}</strong>
                  <span class="scene-micro-note">${escapeHtml(FURNITURE_KIND_LABELS[instance.kind])} · (${instance.x_px.toFixed(0)}, ${instance.y_px.toFixed(0)})</span>
                  <button type="button" class="scene-icon-button" data-action="delete-zone-furniture" data-zone-id="${escapeHtml(zone.id)}" data-instance-id="${escapeHtml(instance.instance_id)}">×</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </section>
  `;
}

function buildRegionInspectorMarkup(region: AnnotatedRegion): string {
  const pointCount = region.points.length;
  const centroid = regionCentroid(region);
  const areaLabel = region.area_m2 !== undefined && Number.isFinite(region.area_m2)
    ? `${region.area_m2.toFixed(1)} m²`
    : "editable polygon";
  const hint = region.region_role === "scene_region"
    ? "Roads, junctions, and design surfaces will cut this boundary into derived building regions."
    : region.derived
      ? "Derived from Scene Region. Materialize it if you want to keep and edit it as an explicit building region."
      : "Explicit region saved in the unified regions[] model.";
  return `
    <section class="annotation-cross-preview-section">
      <div class="annotation-cross-preview-header">
        <div>
          <h3>${escapeHtml(regionRoleLabel(region.region_role))}</h3>
          <div class="scene-micro-note">${escapeHtml(hint)}</div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">${pointCount} pts</span>
          <span class="annotation-cross-preview-stat">${escapeHtml(areaLabel)}</span>
        </div>
      </div>
      <div class="scene-inspector-grid">
        <label class="scene-form-field">
          <span>ID</span>
          <input id="annotation-unified-region-id" type="text" value="${escapeHtml(region.id)}" ${region.derived ? "readonly" : ""} />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Label</span>
          <input id="annotation-unified-region-label" type="text" value="${escapeHtml(region.label)}" ${region.derived ? "readonly" : ""} />
        </label>
        <label class="scene-form-field">
          <span>Role</span>
          <select id="annotation-unified-region-role" ${region.derived ? "disabled" : ""}>
            <option value="scene_region" ${region.region_role === "scene_region" ? "selected" : ""}>Scene Region</option>
            <option value="building_region" ${region.region_role === "building_region" ? "selected" : ""}>Building Region</option>
            <option value="functional_zone" ${region.region_role === "functional_zone" ? "selected" : ""}>Functional Region</option>
          </select>
        </label>
        <label class="scene-form-field">
          <span>Centroid X</span>
          <input type="number" step="1" value="${centroid.x.toFixed(0)}" readonly />
        </label>
        <label class="scene-form-field">
          <span>Centroid Y</span>
          <input type="number" step="1" value="${centroid.y.toFixed(0)}" readonly />
        </label>
        <label class="scene-form-field">
          <span>Side</span>
          <input type="text" value="${escapeHtml(region.side || "")}" readonly />
        </label>
        ${region.derived ? `
          <div class="annotation-detail-actions scene-form-field-wide">
            <button type="button" class="scene-toolbar-button" data-action="materialize-derived-region">Materialize</button>
          </div>
        ` : ""}
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Region-first</span>
          <strong>${escapeHtml(hint)}</strong>
        </div>
      </div>
    </section>
  `;
}

function buildSurfaceAnnotationInspectorMarkup(
  annotation: ReferenceAnnotation,
  surface: AnnotatedSurfaceAnnotation,
): string {
  const centerline = annotation.centerlines.find((item) => item.id === surface.centerline_id) ?? null;
  const centerlineLength = centerline ? centerlineLengthM(centerline, annotation.pixels_per_meter) : 0;
  const widthM = surface.lateral_end_m - surface.lateral_start_m;
  const lengthM = surface.station_end_m - surface.station_start_m;
  return `
    <section class="annotation-cross-preview-section">
      <div class="annotation-cross-preview-header">
        <div>
          <h3>Design Surface</h3>
          <div class="scene-micro-note">Station-bound surface patch for lane changes, islands, pads, and paving.</div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">${lengthM.toFixed(1)}m long</span>
          <span class="annotation-cross-preview-stat">${widthM.toFixed(1)}m wide</span>
        </div>
      </div>
      <div class="annotation-detail-actions scene-form-field-wide" style="margin-bottom:0.75rem">
        ${SURFACE_ANNOTATION_KINDS.map((kind) => `
          <button type="button" class="scene-toolbar-button scene-toolbar-button-secondary" data-action="apply-surface-preset" data-surface-kind="${kind}">
            ${escapeHtml(SURFACE_ANNOTATION_KIND_LABELS[kind])}
          </button>
        `).join("")}
      </div>
      <div class="scene-inspector-grid">
        <label class="scene-form-field">
          <span>ID</span>
          <input id="annotation-surface-id" type="text" value="${escapeHtml(surface.id)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Label</span>
          <input id="annotation-surface-label" type="text" value="${escapeHtml(surface.label)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Kind</span>
          <select id="annotation-surface-kind">
            ${buildSelectOptions(SURFACE_ANNOTATION_KINDS, surface.kind, SURFACE_ANNOTATION_KIND_LABELS)}
          </select>
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Surface Role</span>
          <select id="annotation-surface-role">
            ${buildSelectOptions(SURFACE_ROLES, surface.surface_role, SURFACE_ROLE_LABELS)}
          </select>
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Centerline</span>
          <select id="annotation-surface-centerline">
            ${annotation.centerlines.map((centerlineOption) => `
              <option value="${escapeHtml(centerlineOption.id)}"${centerlineOption.id === surface.centerline_id ? " selected" : ""}>${escapeHtml(centerlineOption.label || centerlineOption.id)}</option>
            `).join("")}
          </select>
        </label>
        <label class="scene-form-field">
          <span>Start Station (m)</span>
          <input id="annotation-surface-station-start" type="number" min="0" max="${centerlineLength.toFixed(3)}" step="0.5" value="${surface.station_start_m.toFixed(2)}" />
        </label>
        <label class="scene-form-field">
          <span>End Station (m)</span>
          <input id="annotation-surface-station-end" type="number" min="0" max="${centerlineLength.toFixed(3)}" step="0.5" value="${surface.station_end_m.toFixed(2)}" />
        </label>
        <label class="scene-form-field">
          <span>Lateral Start (m)</span>
          <input id="annotation-surface-lateral-start" type="number" step="0.25" value="${surface.lateral_start_m.toFixed(2)}" />
        </label>
        <label class="scene-form-field">
          <span>Lateral End (m)</span>
          <input id="annotation-surface-lateral-end" type="number" step="0.25" value="${surface.lateral_end_m.toFixed(2)}" />
        </label>
        <label class="scene-form-field">
          <span>Material Preset</span>
          <input id="annotation-surface-material-preset" type="text" value="${escapeHtml(surface.material.preset)}" />
        </label>
        <label class="scene-form-field">
          <span>Color Hex</span>
          <input id="annotation-surface-color-hex" type="text" placeholder="#RRGGBB" value="${escapeHtml(surface.material.color_hex ?? "")}" />
        </label>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Road Length</span>
          <strong>${centerline ? `${centerlineLength.toFixed(1)}m on ${escapeHtml(centerline.id)}` : "Missing centerline"}</strong>
        </div>
      </div>
    </section>
  `;
}

function buildJunctionInspectorMarkup(
  junction: AnnotatedJunction,
  overlay: DerivedJunctionOverlay | null,
): string {
  if (!overlay) {
    return `
      <div class="scene-inspector-grid">
        <label class="scene-form-field">
          <span>ID</span>
          <input id="annotation-inspector-id" type="text" value="${escapeHtml(junction.id)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Label</span>
          <input id="annotation-inspector-label" type="text" value="${escapeHtml(junction.label)}" />
        </label>
        <label class="scene-form-field">
          <span>X</span>
          <input id="annotation-inspector-x" type="number" step="1" value="${junction.x.toFixed(0)}" />
        </label>
        <label class="scene-form-field">
          <span>Y</span>
          <input id="annotation-inspector-y" type="number" step="1" value="${junction.y.toFixed(0)}" />
        </label>
        <label class="scene-form-field scene-form-field-wide">
          <span>Kind</span>
          <input id="annotation-inspector-kind" type="text" value="${escapeHtml(junction.kind)}" />
        </label>
      </div>
    `;
  }
  const groupedControlPoints = overlay.subLaneControlPoints.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.stripKind}:${item.pointKind}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const ownershipLabel = overlay.sourceMode === "explicit" ? "explicit junction" : "derived topology overlay";
  return `
    <section class="annotation-cross-preview-section">
      <div class="annotation-cross-preview-header">
        <div>
          <h3>${escapeHtml(derivedJunctionKindLabel(overlay.kind))}</h3>
          <div class="scene-micro-note">${escapeHtml(junction.id)} · ${escapeHtml(ownershipLabel)}</div>
        </div>
        <div class="annotation-cross-preview-stats">
          <span class="annotation-cross-preview-stat">${overlay.armCount} arms</span>
          <span class="annotation-cross-preview-stat">${overlay.crosswalks.length} crossings</span>
        </div>
      </div>
      ${overlay.kind === "cross_junction" ? `
        <div style="margin:0.5rem 0 0.25rem">
          <button id="annotation-open-junction-composer" class="scene-toolbar-button" type="button">Edit Junction Corners</button>
        </div>
      ` : ""}
      <div class="scene-inspector-grid">
        <div class="scene-fact-card">
          <span class="scene-fact-label">Anchor</span>
          <strong>${junction.x.toFixed(0)}, ${junction.y.toFixed(0)}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Crosswalk Depth</span>
          <strong>${junction.crosswalk_depth_m.toFixed(1)}m</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Connected Arms</span>
          <strong>${overlay.connectedCenterlineIds.length}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Approach Splits</span>
          <strong>${overlay.approachBoundaries.length}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Zebra Boundary Feet</span>
          <strong>${overlay.skeletonFootPoints.length}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Corner Focuses</span>
          <strong>${overlay.cornerFocusPoints.length}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Sub-lane Control Points</span>
          <strong>${overlay.subLaneControlPoints.length}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Boundary Extensions</span>
          <strong>${overlay.boundaryExtensionLines.length}</strong>
        </div>
        <div class="scene-fact-card">
          <span class="scene-fact-label">Focus Guides</span>
          <strong>${overlay.focusGuideLines.length}</strong>
        </div>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Connected Centerlines</span>
          <strong>${escapeHtml(overlay.connectedCenterlineIds.join(" · "))}</strong>
        </div>
        <div class="scene-fact-card scene-form-field-wide">
          <span class="scene-fact-label">Owned Geometry</span>
          <strong>Rectangular carriageway core, zebra boundaries, sidewalk corners, near-road corners, frontage corners.</strong>
        </div>
      </div>
      <div class="annotation-junction-control-list">
        ${Object.keys(groupedControlPoints).length > 0
          ? Object.entries(groupedControlPoints)
              .map(
                ([key, count]) => `
                  <div class="scene-fact-card">
                    <span class="scene-fact-label">${escapeHtml(key)}</span>
                    <strong>${count}</strong>
                  </div>
                `,
              )
              .join("")
          : `<div class="scene-empty-note">No derived control points for this junction.</div>`}
      </div>
    </section>
  `;
}

export {
  buildBuildingRegionInspectorMarkup,
  buildFunctionalZoneInspectorMarkup,
  buildJunctionInspectorMarkup,
  buildRegionInspectorMarkup,
  buildSurfaceAnnotationInspectorMarkup,
};
