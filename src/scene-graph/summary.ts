import type { AnnotationPoint, ConvertedGraphPayload, ReferenceAnnotation } from "../sg-types";
import { DEFAULT_SEGMENT_LENGTH_M, CROSS_SECTION_MODE_DETAILED, SURFACE_ANNOTATION_KIND_LABELS, SURFACE_ROLE_LABELS } from "../sg-constants";
import { deriveJunctionOverlayGeometries, derivedJunctionKindLabel } from "../sg-geometry";
import {
  deriveLaneProfile,
  formatCrossSectionSummary,
  formatLaneSummary,
  getCenterlineCrossSectionWidth,
  pointDistance,
  resolvedCrossSectionMode,
} from "../sg-utils";
import { escapeHtml } from "../viewer-utils";

function getDisplayReferenceWidthPx(annotation: ReferenceAnnotation, centerlineIndex: number): number {
  const centerline = annotation.centerlines[centerlineIndex];
  if (!centerline) return 0;
  const explicitWidth = centerline.reference_width_px;
  if (explicitWidth !== null && explicitWidth > 0) return explicitWidth;
  return Math.max(getCenterlineCrossSectionWidth(centerline) * Math.max(annotation.pixels_per_meter, 0.0001), 2);
}

function pixelPointToLocal(annotation: ReferenceAnnotation, point: AnnotationPoint): AnnotationPoint {
  const centerX = annotation.image_width_px * 0.5;
  const centerY = annotation.image_height_px * 0.5;
  const ppm = Math.max(annotation.pixels_per_meter, 1e-6);
  return {
    x: (point.x - centerX) / ppm,
    y: (centerY - point.y) / ppm,
  };
}

function collectAnchorClusters(points: AnnotationPoint[], toleranceM: number): Array<{ point: AnnotationPoint; count: number }> {
  const clusters: Array<{ point: AnnotationPoint; count: number }> = [];
  for (const point of points) {
    let matched: { point: AnnotationPoint; count: number } | null = null;
    for (const cluster of clusters) {
      if (pointDistance(cluster.point, point) <= toleranceM) {
        matched = cluster;
        break;
      }
    }
    if (!matched) {
      clusters.push({ point: { ...point }, count: 1 });
      continue;
    }
    const nextCount = matched.count + 1;
    matched.point = {
      x: (matched.point.x * matched.count + point.x) / nextCount,
      y: (matched.point.y * matched.count + point.y) / nextCount,
    };
    matched.count = nextCount;
  }
  return clusters;
}

function normalizeAngleDeg(value: number): number {
  let normalized = value % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

function angleDeg(fromPoint: AnnotationPoint, toPoint: AnnotationPoint): number {
  return normalizeAngleDeg((Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x) * 180) / Math.PI);
}

function circularAngleDiffs(anglesDeg: number[]): number[] {
  if (anglesDeg.length === 0) return [];
  const ordered = [...anglesDeg].map(normalizeAngleDeg).sort((a, b) => a - b);
  return ordered.map((value, index) => {
    const nextValue = ordered[(index + 1) % ordered.length];
    return index === ordered.length - 1 ? nextValue - value + 360 : nextValue - value;
  });
}

function classifyTopologyJunctionKind(anglesDeg: number[]): "t_junction" | "cross_junction" | "complex_junction" {
  const diffs = circularAngleDiffs(anglesDeg);
  if (anglesDeg.length === 4 && diffs.length > 0 && Math.max(...diffs.map((value) => Math.abs(value - 90))) <= 35) {
    return "cross_junction";
  }
  if (anglesDeg.length === 3 && diffs.some((value) => value >= 145)) {
    return "t_junction";
  }
  return "complex_junction";
}

function deriveTopologyJunctions(annotation: ReferenceAnnotation): Array<{
  anchor: AnnotationPoint;
  armCount: number;
  kind: "t_junction" | "cross_junction" | "complex_junction";
}> {
  const toleranceM = Math.max(DEFAULT_SEGMENT_LENGTH_M * 0.5, 4.0);
  const localCenterlines = annotation.centerlines
    .map((centerline, roadIndex) => ({
      roadId: roadIndex + 1,
      points: centerline.points.map((point) => pixelPointToLocal(annotation, point)),
    }))
    .filter((item) => item.points.length >= 2);
  const clusters: Array<{
    point: AnnotationPoint;
    count: number;
    members: Array<{ roadId: number; vertexIndex: number; points: AnnotationPoint[] }>;
  }> = [];

  for (const road of localCenterlines) {
    road.points.forEach((point, vertexIndex) => {
      let matched = clusters.find((cluster) => pointDistance(cluster.point, point) <= toleranceM) ?? null;
      if (!matched) {
        matched = { point: { ...point }, count: 0, members: [] };
        clusters.push(matched);
      }
      const nextCount = matched.count + 1;
      matched.point = {
        x: (matched.point.x * matched.count + point.x) / nextCount,
        y: (matched.point.y * matched.count + point.y) / nextCount,
      };
      matched.count = nextCount;
      matched.members.push({ roadId: road.roadId, vertexIndex, points: road.points });
    });
  }

  return clusters.flatMap((cluster) => {
    const connectedRoadIds = new Set(cluster.members.map((member) => member.roadId));
    if (connectedRoadIds.size < 2) return [];
    const seenArmKeys = new Set<string>();
    const angles: number[] = [];
    for (const member of cluster.members) {
      for (const neighborIndex of [member.vertexIndex - 1, member.vertexIndex + 1]) {
        if (neighborIndex < 0 || neighborIndex >= member.points.length) continue;
        const neighbor = member.points[neighborIndex];
        if (pointDistance(cluster.point, neighbor) <= Math.max(toleranceM * 0.25, 0.05)) continue;
        const key = `${member.roadId}:${neighbor.x.toFixed(3)}:${neighbor.y.toFixed(3)}`;
        if (seenArmKeys.has(key)) continue;
        seenArmKeys.add(key);
        angles.push(angleDeg(cluster.point, neighbor));
      }
    }
    if (angles.length < 3) return [];
    return [{ anchor: { ...cluster.point }, armCount: angles.length, kind: classifyTopologyJunctionKind(angles) }];
  });
}

function deriveJunctionStats(annotation: ReferenceAnnotation): {
  explicitCount: number;
  legacyCount: number;
  derivedCount: number;
  topologyCount: number;
  tCount: number;
  crossCount: number;
} {
  const toleranceM = Math.max(DEFAULT_SEGMENT_LENGTH_M * 0.5, 4.0);
  const derivedTopologyJunctions = deriveTopologyJunctions(annotation);
  const derivedAnchors = derivedTopologyJunctions.map((item) => item.anchor);
  const explicitAnchors = annotation.junctions
    .filter((item) => item.source_mode === "explicit")
    .map((item) => pixelPointToLocal(annotation, item));
  const topologyAnchors = collectAnchorClusters([...explicitAnchors, ...derivedAnchors], toleranceM);
  return {
    explicitCount: annotation.junctions.filter((item) => item.source_mode === "explicit").length,
    legacyCount: annotation.junctions.filter((item) => item.source_mode !== "explicit").length,
    derivedCount: derivedTopologyJunctions.length,
    topologyCount: topologyAnchors.length,
    tCount: derivedTopologyJunctions.filter((item) => item.kind === "t_junction").length,
    crossCount: derivedTopologyJunctions.filter((item) => item.kind === "cross_junction").length,
  };
}

export function buildAnnotationSummaryMarkup(annotation: ReferenceAnnotation): string {
  const roadWidths = annotation.centerlines.map((item) => getCenterlineCrossSectionWidth(item));
  const referenceWidths = annotation.centerlines.map((_, index) => getDisplayReferenceWidthPx(annotation, index));
  const driveLaneTotal = annotation.centerlines.reduce((sum, item) => sum + deriveLaneProfile(item).total_drive_lane_count, 0);
  const bikeLaneTotal = annotation.centerlines.reduce((sum, item) => sum + deriveLaneProfile(item).bike_lane_count, 0);
  const busLaneTotal = annotation.centerlines.reduce((sum, item) => sum + deriveLaneProfile(item).bus_lane_count, 0);
  const parkingLaneTotal = annotation.centerlines.reduce((sum, item) => sum + deriveLaneProfile(item).parking_lane_count, 0);
  const detailedRoadCount = annotation.centerlines.filter((item) => resolvedCrossSectionMode(item) === CROSS_SECTION_MODE_DETAILED).length;
  const stripCount = annotation.centerlines.reduce((sum, item) => sum + item.cross_section_strips.length, 0);
  const furnitureCount = annotation.centerlines.reduce((sum, item) => sum + item.street_furniture_instances.length, 0);
  const zoneFurnitureCount = annotation.functional_zones.reduce((sum, zone) => sum + zone.furniture_instances.length, 0);
  const sceneRegionCount = annotation.regions.filter((region) => region.region_role === "scene_region").length;
  const explicitRegionBuildingCount = annotation.regions.filter((region) => region.region_role === "building_region").length;
  const junctionStats = deriveJunctionStats(annotation);
  return `
    ${metric("Roads", annotation.centerlines.length)}
    ${metric("Detailed", detailedRoadCount)}
    ${metric("Explicit Jn", junctionStats.explicitCount)}
    ${metric("Legacy Jn", junctionStats.legacyCount)}
    ${metric("Derived Jn", junctionStats.derivedCount)}
    ${metric("Topology Jn", junctionStats.topologyCount)}
    ${metric("T / Cross", `${junctionStats.tCount} / ${junctionStats.crossCount}`)}
    ${metric("Avg Width", `${roadWidths.length ? (roadWidths.reduce((sum, value) => sum + value, 0) / roadWidths.length).toFixed(1) : "0.0"}m`)}
    ${metric("Max Ref Band", `${referenceWidths.length ? Math.max(...referenceWidths).toFixed(0) : "0"}px`)}
    ${metric("Drive Lanes", driveLaneTotal)}
    ${metric("Bike / Bus", `${bikeLaneTotal} / ${busLaneTotal}`)}
    ${metric("Parking", parkingLaneTotal)}
    ${metric("Strips", stripCount)}
    ${metric("Furniture", furnitureCount)}
    ${zoneFurnitureCount > 0 ? metric("Zone Furn.", zoneFurnitureCount) : ""}
    ${metric("Scene Regions", sceneRegionCount)}
    ${metric("Auto Bldg", annotation.derived_regions?.length ?? 0)}
    ${metric("Region Bldg", explicitRegionBuildingCount)}
    ${metric("Bldg Regions", annotation.building_regions.length)}
    ${metric("Func Zones", annotation.functional_zones.length)}
    ${metric("Design Surfaces", annotation.surface_annotations.length)}
    ${metric("Strip Patches", annotation.station_strip_patches.length)}
    ${metric("Scale", `${annotation.pixels_per_meter.toFixed(1)} px/m`)}
  `;
}

export function buildGraphSummaryMarkup(graphResult: ConvertedGraphPayload | null): string {
  if (!graphResult) {
    return [metric("Graph", "Pending"), metric("Segments", 0), metric("Edges", 0), metric("Roads", 0)].join("");
  }
  const summary = graphResult.summary;
  return `
    ${metric("Graph", graphResult.graph.mode || "annotation")}
    ${metric("Segments", summary.segment_count ?? 0)}
    ${metric("Roads", summary.road_profile_count ?? summary.road_count ?? 0)}
    ${metric("Cross Sections", summary.cross_section_profile_count ?? 0)}
    ${metric("Legacy Jn", summary.junction_count ?? 0)}
    ${metric("Derived Jn", summary.derived_junction_count ?? 0)}
    ${metric("Topology Jn", summary.topology_junction_count ?? 0)}
    ${metric("T / Cross", `${summary.t_junction_count ?? 0} / ${summary.cross_junction_count ?? 0}`)}
    ${metric("Junction Segments", summary.junction_segment_count ?? 0)}
    ${metric("Cross Section", `${Number(summary.avg_cross_section_width_m ?? 0).toFixed(1)}m avg`)}
    ${metric("Carriageway", `${Number(summary.avg_road_width_m ?? 0).toFixed(1)}m avg`)}
    ${metric("Furniture", summary.street_furniture_instance_count ?? 0)}
    ${metric("Regions", summary.region_count ?? 0)}
    ${metric("Auto Bldg", summary.derived_region_count ?? 0)}
    ${metric("Design Surfaces", summary.surface_annotation_count ?? 0)}
    ${metric("MetaUrban Hints", summary.metaurban_asset_hint_count ?? 0)}
  `;
}

export function buildFeatureTableMarkup(annotation: ReferenceAnnotation): string {
  const rows: string[] = [];
  const derivedJunctions = deriveJunctionOverlayGeometries(annotation);
  for (const centerline of annotation.centerlines) {
    rows.push(row("centerline", centerline.id, centerline.label, `${centerline.points.length} pts · ${getCenterlineCrossSectionWidth(centerline).toFixed(1)}m · ${formatCrossSectionSummary(centerline)} · ${centerline.street_furniture_instances.length} furn. · ${formatLaneSummary(centerline)}`));
  }
  for (const item of derivedJunctions.filter((overlay) => overlay.sourceMode === "derived")) {
    rows.push(row("derived junction", item.junctionId, derivedJunctionKindLabel(item.kind), `${item.armCount} arms · (${item.anchor.x.toFixed(0)}, ${item.anchor.y.toFixed(0)})`));
  }
  for (const item of annotation.junctions) {
    rows.push(row("junction", item.id, item.label, `${item.kind} · ${item.source_mode} · ${item.connected_centerline_ids.length} roads · (${item.x.toFixed(0)}, ${item.y.toFixed(0)})`));
  }
  for (const item of annotation.roundabouts) rows.push(row("roundabout", item.id, item.label, `r=${item.radius_px.toFixed(0)}px · (${item.x.toFixed(0)}, ${item.y.toFixed(0)})`));
  for (const item of annotation.control_points) rows.push(row("control", item.id, item.label, `${item.kind} · (${item.x.toFixed(0)}, ${item.y.toFixed(0)})`));
  for (const item of annotation.building_regions) rows.push(row("building region", item.id, item.label, `${item.width_px.toFixed(0)} × ${item.height_px.toFixed(0)}px · yaw ${item.yaw_deg.toFixed(0)}° · (${item.center_px.x.toFixed(0)}, ${item.center_px.y.toFixed(0)})`));
  for (const item of annotation.regions) rows.push(row(item.region_role, item.id, item.label, `${item.points.length} pts · ${item.derived ? "derived" : "explicit"}${item.land_use_type ? ` · ${item.land_use_type}` : ""}`));
  for (const item of annotation.derived_regions ?? []) rows.push(row("derived building", item.id, item.label, `${item.points.length} pts · ${(item.area_m2 ?? 0).toFixed(1)} m²${item.side ? ` · ${item.side}` : ""}`));
  for (const item of annotation.functional_zones) rows.push(row("functional zone", item.id, item.label, `${item.kind} · ${item.points.length} pts · ${item.furniture_instances.length} furn.`));
  for (const item of annotation.surface_annotations) rows.push(row("design surface", item.id, item.label, `${SURFACE_ANNOTATION_KIND_LABELS[item.kind]} · ${SURFACE_ROLE_LABELS[item.surface_role]} · ${item.centerline_id} · ${item.station_start_m.toFixed(1)}-${item.station_end_m.toFixed(1)}m`));
  for (const item of annotation.station_strip_patches) {
    const kind = item.updates.kind ?? "strip";
    const width = item.updates.width_m === undefined ? "" : ` · ${item.updates.width_m.toFixed(1)}m`;
    rows.push(row("strip patch", item.id, item.label, `${item.centerline_id} / ${item.strip_id} · ${item.station_start_m.toFixed(1)}-${item.station_end_m.toFixed(1)}m · ${kind}${width}`));
  }
  return rows.join("");
}

function metric(label: string, value: unknown): string {
  return `<div><span class="scene-metric-label">${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function row(type: string, id: string, label: string, detail: string): string {
  return `
    <tr>
      <td>${escapeHtml(type)}</td>
      <td>${escapeHtml(id)}</td>
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(detail)}</td>
    </tr>
  `;
}
