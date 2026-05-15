import type {
  AnnotatedBuildingRegion,
  AnnotatedCenterline,
  AnnotatedFunctionalZone,
  AnnotatedJunction,
  AnnotatedMarker,
  AnnotatedRegion,
  AnnotatedRoundabout,
  AnnotatedSurfaceAnnotation,
  DerivedJunctionOverlay,
  LaneElementSelection,
  ReferenceAnnotation,
  Selection,
} from "../sg-types";
import { ANNOTATION_SCHEMA_VERSION, ALL_ROADS_SELECTION_ID, DEFAULT_PIXELS_PER_METER } from "../sg-constants";
import { getJunctionOverlay } from "../sg-geometry";

function createEmptyAnnotation(planId = "", imagePath = "", imageWidthPx = 0, imageHeightPx = 0): ReferenceAnnotation {
  return {
    version: ANNOTATION_SCHEMA_VERSION,
    plan_id: planId,
    image_path: imagePath,
    image_width_px: imageWidthPx,
    image_height_px: imageHeightPx,
    pixels_per_meter: DEFAULT_PIXELS_PER_METER,
    centerlines: [],
    junctions: [],
    roundabouts: [],
    control_points: [],
    regions: [],
    derived_regions: [],
    building_regions: [],
    functional_zones: [],
    surface_annotations: [],
    station_strip_patches: [],
    junction_compositions: [],
  };
}

function stringifyAnnotation(annotation: ReferenceAnnotation): string {
  return JSON.stringify(annotation, null, 2);
}

function nextFeatureId(annotation: ReferenceAnnotation, prefix: string): string {
  const ids = new Set<string>();
  for (const item of annotation.centerlines) {
    ids.add(item.id);
  }
  for (const item of annotation.junctions) {
    ids.add(item.id);
  }
  for (const item of annotation.roundabouts) {
    ids.add(item.id);
  }
  for (const item of annotation.control_points) {
    ids.add(item.id);
  }
  for (const item of annotation.building_regions) {
    ids.add(item.id);
  }
  for (const item of annotation.regions) {
    ids.add(item.id);
  }
  for (const item of annotation.derived_regions ?? []) {
    ids.add(item.id);
  }
  for (const item of annotation.functional_zones) {
    ids.add(item.id);
  }
  for (const item of annotation.surface_annotations) {
    ids.add(item.id);
  }
  for (const item of annotation.station_strip_patches) {
    ids.add(item.id);
  }
  let counter = 1;
  while (true) {
    const candidate = `${prefix}_${String(counter).padStart(2, "0")}`;
    if (!ids.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

function getFeatureCount(annotation: ReferenceAnnotation): number {
  return (
    annotation.centerlines.length +
    annotation.junctions.length +
    annotation.roundabouts.length +
    annotation.control_points.length +
    annotation.regions.length +
    (annotation.derived_regions?.length ?? 0) +
    annotation.building_regions.length +
    annotation.functional_zones.length +
    annotation.surface_annotations.length +
    annotation.station_strip_patches.length
  );
}

function getSelectedFeature(annotation: ReferenceAnnotation, selection: Selection):
  | AnnotatedCenterline
  | AnnotatedBuildingRegion
  | AnnotatedFunctionalZone
  | AnnotatedRegion
  | AnnotatedSurfaceAnnotation
  | AnnotatedJunction
  | AnnotatedMarker
  | AnnotatedRoundabout
  | DerivedJunctionOverlay
  | LaneElementSelection
  | null {
  if (!selection) {
    return null;
  }
  if (selection.kind === "lane_element") {
    return selection;
  }
  if (selection.kind === "road_collection") {
    return null;
  }
  if (selection.kind === "centerline") {
    return annotation.centerlines.find((item) => item.id === selection.id) ?? null;
  }
  if (selection.kind === "junction") {
    return annotation.junctions.find((item) => item.id === selection.id) ?? null;
  }
  if (selection.kind === "roundabout") {
    return annotation.roundabouts.find((item) => item.id === selection.id) ?? null;
  }
  if (selection.kind === "building_region") {
    return annotation.building_regions.find((item) => item.id === selection.id) ?? null;
  }
  if (selection.kind === "region") {
    return (
      annotation.regions.find((item) => item.id === selection.id) ??
      (annotation.derived_regions ?? []).find((item) => item.id === selection.id) ??
      null
    );
  }
  if (selection.kind === "functional_zone") {
    return annotation.functional_zones.find((item) => item.id === selection.id) ?? null;
  }
  if (selection.kind === "surface_annotation") {
    return annotation.surface_annotations.find((item) => item.id === selection.id) ?? null;
  }
  if (selection.kind === "derived_junction") {
    return getJunctionOverlay(annotation, selection.id);
  }
  return annotation.control_points.find((item) => item.id === selection.id) ?? null;
}

export {
  createEmptyAnnotation,
  getFeatureCount,
  getSelectedFeature,
  nextFeatureId,
  stringifyAnnotation,
};
