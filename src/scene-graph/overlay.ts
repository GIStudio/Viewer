import type { AnnotatedBuildingRegion, AnnotatedFunctionalZone, AnnotatedRegion, AnnotatedStationStripPatch, AnnotatedSurfaceAnnotation, AnnotationPoint, BuildingRegionResizeHandle, ReferenceAnnotation, RegionRole, StripKind, SurfaceRole } from "../sg-types";
import { BUILDING_REGION_HANDLE_RADIUS_PX, FURNITURE_KIND_LABELS, SURFACE_ANNOTATION_KIND_LABELS } from "../sg-constants";
import { buildingRegionPolygonPoints, buildingRegionResizeHandlePoint, buildingRegionRotateHandlePoint, functionalZoneCentroid, functionalZonePolygonPoints } from "../sg-geometry";
import { clonePoint, offsetPolyline, pointDistance, polylineLength, stationToPolylinePoint, stripCenterOffsetMeters } from "../sg-utils";
import { escapeHtml } from "../viewer-utils";

function polylinePointsBetweenStations(
  points: AnnotationPoint[],
  stationStartPx: number,
  stationEndPx: number,
): AnnotationPoint[] {
  if (points.length < 2) {
    return points.map((point) => ({ ...point }));
  }
  const startPx = Math.max(0, Math.min(stationStartPx, polylineLength(points)));
  const endPx = Math.max(startPx, Math.min(stationEndPx, polylineLength(points)));
  const result: AnnotationPoint[] = [stationToPolylinePoint(points, startPx).point];
  let accumulated = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    accumulated += pointDistance(points[index], points[index + 1]);
    if (startPx < accumulated && accumulated < endPx) {
      result.push(clonePoint(points[index + 1]));
    }
  }
  result.push(stationToPolylinePoint(points, endPx).point);
  return result.filter((point, index, list) => index === 0 || pointDistance(point, list[index - 1]) > 1e-3);
}

function surfaceAnnotationPolygonPoints(
  annotation: ReferenceAnnotation,
  surface: AnnotatedSurfaceAnnotation,
): AnnotationPoint[] {
  const centerline = annotation.centerlines.find((item) => item.id === surface.centerline_id) ?? null;
  if (!centerline || centerline.points.length < 2) {
    return [];
  }
  const ppm = Math.max(annotation.pixels_per_meter, 1e-6);
  const spine = polylinePointsBetweenStations(centerline.points, surface.station_start_m * ppm, surface.station_end_m * ppm);
  if (spine.length < 2) {
    return [];
  }
  const edgeA = offsetPolyline(spine, surface.lateral_start_m * ppm);
  const edgeB = offsetPolyline(spine, surface.lateral_end_m * ppm);
  return [...edgeA, ...edgeB.slice().reverse()];
}

function stationStripPatchPolylinePoints(annotation: ReferenceAnnotation, patch: AnnotatedStationStripPatch): AnnotationPoint[] {
  const centerline = annotation.centerlines.find((item) => item.id === patch.centerline_id) ?? null;
  if (!centerline || centerline.points.length < 2) {
    return [];
  }
  const ppm = Math.max(annotation.pixels_per_meter, 1e-6);
  const spine = polylinePointsBetweenStations(centerline.points, patch.station_start_m * ppm, patch.station_end_m * ppm);
  if (spine.length < 2) {
    return [];
  }
  const offsets = stripCenterOffsetMeters(centerline);
  const stripOffset = offsets[patch.strip_id]?.centerOffsetM ?? 0;
  return offsetPolyline(spine, stripOffset * ppm);
}

function surfaceAnnotationFillColor(role: SurfaceRole): string {
  switch (role) {
    case "bus_lane":
      return "rgba(64, 148, 92, 0.58)";
    case "bike_lane":
      return "rgba(50, 126, 86, 0.50)";
    case "parking_lane":
      return "rgba(156, 126, 84, 0.46)";
    case "median":
    case "median_green":
    case "grass_belt":
      return "rgba(98, 145, 80, 0.52)";
    case "safety_island":
      return "rgba(228, 220, 202, 0.68)";
    case "shared_street_surface":
      return "rgba(180, 160, 140, 0.48)";
    case "transit_pad":
      return "rgba(110, 134, 164, 0.52)";
    case "sidewalk":
      return "rgba(235, 224, 206, 0.52)";
    case "furnishing":
      return "rgba(126, 101, 71, 0.42)";
    case "context_ground":
      return "rgba(183, 212, 230, 0.40)";
    case "crossing":
      return "rgba(245, 245, 245, 0.62)";
    case "carriageway":
      return "rgba(66, 74, 87, 0.42)";
    case "colored_pavement":
    default:
      return "rgba(207, 156, 96, 0.52)";
  }
}

function surfaceAnnotationStrokeColor(role: SurfaceRole): string {
  switch (role) {
    case "safety_island":
      return "rgba(112, 104, 92, 0.86)";
    case "bus_lane":
      return "rgba(38, 112, 70, 0.88)";
    case "transit_pad":
      return "rgba(78, 100, 130, 0.86)";
    case "shared_street_surface":
      return "rgba(132, 111, 88, 0.82)";
    case "colored_pavement":
      return "rgba(158, 103, 54, 0.86)";
    default:
      return "rgba(80, 84, 88, 0.78)";
  }
}

function stripStrokeColor(kind: StripKind): string {
  switch (kind) {
    case "drive_lane":
      return "rgba(40, 42, 47, 0.88)";
    case "bus_lane":
      return "rgba(26, 108, 68, 0.78)";
    case "bike_lane":
      return "rgba(24, 128, 82, 0.78)";
    case "parking_lane":
      return "rgba(145, 102, 48, 0.78)";
    case "median":
    case "grass_belt":
      return "rgba(88, 132, 66, 0.78)";
    case "clear_sidewalk":
      return "rgba(218, 202, 172, 0.82)";
    default:
      return "rgba(116, 135, 160, 0.68)";
  }
}

function regionPolygonPoints(region: AnnotatedRegion): AnnotationPoint[] {
  return region.points.map((point) => clonePoint(point));
}

function regionCentroid(region: AnnotatedRegion): AnnotationPoint {
  const points = regionPolygonPoints(region);
  if (!points.length) {
    return { x: 0, y: 0 };
  }
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
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

function buildSurfaceAnnotationOverlayMarkup(
  annotation: ReferenceAnnotation,
  surface: AnnotatedSurfaceAnnotation,
  isSelected: boolean,
): string {
  const polygon = surfaceAnnotationPolygonPoints(annotation, surface);
  if (polygon.length < 3) {
    return "";
  }
  const polygonPoints = polygon.map((point) => `${point.x},${point.y}`).join(" ");
  const labelPoint = polygon.reduce(
    (sum, point) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }),
    { x: 0, y: 0 },
  );
  return `
    <g class="annotation-feature-group">
      <polygon
        class="annotation-surface-annotation${isSelected ? " annotation-feature-selected" : ""}"
        points="${polygonPoints}"
        style="fill:${surfaceAnnotationFillColor(surface.surface_role)};stroke:${surfaceAnnotationStrokeColor(surface.surface_role)}"
        data-feature-kind="surface_annotation"
        data-feature-id="${escapeHtml(surface.id)}"
      />
      <text class="annotation-label" x="${labelPoint.x + 8}" y="${labelPoint.y - 8}">
        ${escapeHtml(surface.label || SURFACE_ANNOTATION_KIND_LABELS[surface.kind])}
      </text>
    </g>
  `;
}

function buildStationStripPatchOverlayMarkup(
  annotation: ReferenceAnnotation,
  patch: AnnotatedStationStripPatch,
): string {
  const centerline = annotation.centerlines.find((item) => item.id === patch.centerline_id) ?? null;
  const polyline = stationStripPatchPolylinePoints(annotation, patch);
  if (!centerline || polyline.length < 2) {
    return "";
  }
  const targetStrip = centerline.cross_section_strips.find((strip) => strip.strip_id === patch.strip_id) ?? null;
  const kind = patch.updates.kind ?? targetStrip?.kind ?? "median";
  const widthM = patch.updates.width_m ?? targetStrip?.width_m ?? 0.5;
  return `
    <g class="annotation-feature-group">
      <polyline
        class="annotation-cross-strip annotation-station-strip-patch"
        points="${polyline.map((point) => `${point.x},${point.y}`).join(" ")}"
        style="stroke:${stripStrokeColor(kind)};stroke-width:${Math.max(2, widthM * annotation.pixels_per_meter)}px;stroke-linecap:butt;opacity:0.92"
        data-feature-kind="station_strip_patch"
        data-feature-id="${escapeHtml(patch.id)}"
        data-centerline-id="${escapeHtml(patch.centerline_id)}"
        data-strip-id="${escapeHtml(patch.strip_id)}"
      />
    </g>
  `;
}

function buildBuildingRegionOverlayMarkup(
  region: AnnotatedBuildingRegion,
  isSelected: boolean,
): string {
  const polygon = buildingRegionPolygonPoints(region);
  const polygonPoints = polygon.map((point) => `${point.x},${point.y}`).join(" ");
  const labelPoint = polygon[3] ?? region.center_px;
  const resizeHandles: BuildingRegionResizeHandle[] = ["nw", "ne", "se", "sw"];
  const resizeHandleMarkup = isSelected
    ? resizeHandles
        .map((handle) => {
          const point = buildingRegionResizeHandlePoint(region, handle);
          return `
            <circle
              class="annotation-building-region-handle"
              cx="${point.x}"
              cy="${point.y}"
              r="${BUILDING_REGION_HANDLE_RADIUS_PX}"
              data-feature-kind="building_region"
              data-feature-id="${escapeHtml(region.id)}"
              data-region-handle-kind="resize"
              data-region-resize-handle="${handle}"
            />
          `;
        })
        .join("")
    : "";
  const rotateHandlePoint = buildingRegionRotateHandlePoint(region);
  const rotateGuideMarkup = isSelected
    ? `
        <line
          class="annotation-building-region-rotate-guide"
          x1="${region.center_px.x}"
          y1="${region.center_px.y}"
          x2="${rotateHandlePoint.x}"
          y2="${rotateHandlePoint.y}"
        />
        <circle
          class="annotation-building-region-rotate-handle"
          cx="${rotateHandlePoint.x}"
          cy="${rotateHandlePoint.y}"
          r="${BUILDING_REGION_HANDLE_RADIUS_PX}"
          data-feature-kind="building_region"
          data-feature-id="${escapeHtml(region.id)}"
          data-region-handle-kind="rotate"
        />
      `
    : "";
  return `
    <g class="annotation-feature-group">
      <polygon
        class="annotation-building-region${isSelected ? " annotation-building-region-selected" : ""}"
        points="${polygonPoints}"
        data-feature-kind="building_region"
        data-feature-id="${escapeHtml(region.id)}"
      />
      <text class="annotation-label" x="${labelPoint.x}" y="${labelPoint.y - 10}">
        ${escapeHtml(region.label || region.id)}
      </text>
      ${resizeHandleMarkup}
      ${rotateGuideMarkup}
    </g>
  `;
}

function buildRegionOverlayMarkup(region: AnnotatedRegion, isSelected: boolean): string {
  const polygon = regionPolygonPoints(region);
  if (polygon.length < 3) {
    return "";
  }
  const polygonPoints = polygon.map((point) => `${point.x},${point.y}`).join(" ");
  const labelPoint = polygon[0] ?? regionCentroid(region);
  const className = [
    "annotation-region",
    `annotation-region-${region.region_role.replace(/_/g, "-")}`,
    region.derived ? "annotation-region-derived" : "",
    isSelected ? "annotation-region-selected" : "",
  ].filter(Boolean).join(" ");
  return `
    <g class="annotation-feature-group">
      <polygon
        class="${className}"
        points="${polygonPoints}"
        data-feature-kind="region"
        data-feature-id="${escapeHtml(region.id)}"
      />
      <text class="annotation-label" x="${labelPoint.x}" y="${labelPoint.y - 10}">
        ${escapeHtml(region.label || regionRoleLabel(region.region_role))}
      </text>
    </g>
  `;
}

function buildFunctionalZoneOverlayMarkup(
  zone: AnnotatedFunctionalZone,
  isSelected: boolean,
): string {
  const polygon = functionalZonePolygonPoints(zone);
  const polygonPoints = polygon.map((point) => `${point.x},${point.y}`).join(" ");
  const labelPoint = polygon[0] ?? functionalZoneCentroid(zone);
  const vertexMarkup = isSelected
    ? zone.points
        .map(
          (point, index) => `
            <circle
              class="annotation-functional-zone-vertex"
              cx="${point.x}"
              cy="${point.y}"
              r="5"
              data-feature-kind="functional_zone"
              data-feature-id="${escapeHtml(zone.id)}"
              data-zone-vertex-index="${index}"
            />
          `,
        )
        .join("")
    : "";

  // Render furniture instances inside the zone
  const furnitureMarkup = zone.furniture_instances
    .map((instance) => `
      <g class="annotation-feature-group">
        <circle class="annotation-furniture-point annotation-furniture-zone-point" cx="${instance.x_px}" cy="${instance.y_px}" r="6" />
        <text class="annotation-furniture-label" x="${instance.x_px + 10}" y="${instance.y_px - 8}">
          ${escapeHtml(FURNITURE_KIND_LABELS[instance.kind])}
        </text>
      </g>
    `)
    .join("");

  return `
    <g class="annotation-feature-group">
      <polygon
        class="annotation-functional-zone${isSelected ? " annotation-functional-zone-selected" : ""}"
        points="${polygonPoints}"
        data-feature-kind="functional_zone"
        data-feature-id="${escapeHtml(zone.id)}"
      />
      <text class="annotation-label" x="${labelPoint.x}" y="${labelPoint.y - 10}">
        ${escapeHtml(zone.label || zone.id)}
      </text>
      ${vertexMarkup}
      ${furnitureMarkup}
    </g>
  `;
}

export {
  buildBuildingRegionOverlayMarkup,
  buildFunctionalZoneOverlayMarkup,
  buildRegionOverlayMarkup,
  buildStationStripPatchOverlayMarkup,
  buildSurfaceAnnotationOverlayMarkup,
};
