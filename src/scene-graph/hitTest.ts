import type { BuildingRegionResizeHandle, LaneElementKind, LaneElementSelection, Selection } from "../sg-types";
import { asNumber, isStripDirection, isStripKind, isStripZone } from "../sg-utils";

function isLaneElementKind(value: string | undefined): value is LaneElementKind {
  return value === "road_strip" || value === "junction_turn_patch" || value === "junction_connector" || value === "junction_side_patch";
}

function optionalDatasetNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function laneHitFromTarget(target: EventTarget | null): LaneElementSelection | null {
  const element = target instanceof Element ? target.closest<HTMLElement>("[data-lane-element-kind][data-lane-element-id]") : null;
  if (!element) {
    return null;
  }
  const elementKind = element.dataset.laneElementKind;
  const id = element.dataset.laneElementId;
  const ownerKind = element.dataset.ownerKind;
  const ownerId = element.dataset.ownerId;
  if (!isLaneElementKind(elementKind) || !id || !ownerId) {
    return null;
  }
  if (ownerKind !== "centerline" && ownerKind !== "junction" && ownerKind !== "derived_junction") {
    return null;
  }
  const rawStripKind = element.dataset.stripKind;
  const rawStripZone = element.dataset.stripZone;
  const rawStripDirection = element.dataset.stripDirection;
  const stripKind = rawStripKind && isStripKind(rawStripKind) ? rawStripKind : undefined;
  const stripZone = rawStripZone && isStripZone(rawStripZone) ? rawStripZone : undefined;
  const stripDirection = rawStripDirection && isStripDirection(rawStripDirection) ? rawStripDirection : undefined;
  return {
    kind: "lane_element",
    id,
    elementKind,
    ownerKind,
    ownerId,
    centerlineId: element.dataset.centerlineId,
    stripId: element.dataset.stripId,
    stripKind,
    stripZone,
    stripDirection,
    widthM: optionalDatasetNumber(element.dataset.widthM),
    widthPx: optionalDatasetNumber(element.dataset.widthPx),
    junctionId: element.dataset.junctionId,
    patchId: element.dataset.patchId ?? element.dataset.turnPatchId,
    connectorId: element.dataset.connectorId,
    linkId: element.dataset.linkId || undefined,
    patchRole: element.dataset.patchRole === "endpoint_fill" ? "endpoint_fill" : element.dataset.patchRole === "connector" ? "connector" : undefined,
    pairedConnectorId: element.dataset.pairedConnectorId || undefined,
    endpointRole: element.dataset.endpointRole === "from" ? "from" : element.dataset.endpointRole === "to" ? "to" : undefined,
    quadrantId: element.dataset.quadrantId,
    kernelId: element.dataset.kernelId || null,
    fromCenterlineId: element.dataset.fromCenterlineId,
    fromStripId: element.dataset.fromStripId,
    toCenterlineId: element.dataset.toCenterlineId,
    toStripId: element.dataset.toStripId,
    pointsCount: optionalDatasetNumber(element.dataset.pointsCount),
  };
}

export function featureHitFromTarget(target: EventTarget | null): Selection {
  const element = target instanceof Element ? target.closest<HTMLElement>("[data-feature-kind][data-feature-id]") : null;
  if (!element) {
    return null;
  }
  const featureKind = element.dataset.featureKind;
  const featureId = element.dataset.featureId;
  if (!featureKind || !featureId) {
    return null;
  }
  if (featureKind === "centerline") {
    const rawVertexIndex = element.dataset.vertexIndex;
    const selection: Extract<Selection, { kind: "centerline" }> = { kind: "centerline", id: featureId };
    if (rawVertexIndex !== undefined) {
      selection.vertexIndex = Math.max(0, Math.round(asNumber(rawVertexIndex, 0)));
    }
    return selection;
  }
  if (
    featureKind === "junction" ||
    featureKind === "roundabout" ||
    featureKind === "control_point" ||
    featureKind === "derived_junction" ||
    featureKind === "region" ||
    featureKind === "building_region" ||
    featureKind === "functional_zone" ||
    featureKind === "surface_annotation"
  ) {
    return { kind: featureKind, id: featureId };
  }
  return null;
}

export function hitFromTarget(target: EventTarget | null): Selection {
  return laneHitFromTarget(target) ?? featureHitFromTarget(target);
}

export function buildingRegionHandleFromTarget(
  target: EventTarget | null,
): { regionId: string; handleKind: "resize" | "rotate"; resizeHandle?: BuildingRegionResizeHandle } | null {
  const element = target instanceof Element ? target.closest<HTMLElement>("[data-region-handle-kind][data-feature-id]") : null;
  if (!element) {
    return null;
  }
  const regionId = element.dataset.featureId;
  const handleKind = element.dataset.regionHandleKind;
  if (!regionId || (handleKind !== "resize" && handleKind !== "rotate")) {
    return null;
  }
  if (handleKind === "resize") {
    const resizeHandle = element.dataset.regionResizeHandle;
    if (resizeHandle === "nw" || resizeHandle === "ne" || resizeHandle === "se" || resizeHandle === "sw") {
      return { regionId, handleKind, resizeHandle };
    }
    return null;
  }
  return { regionId, handleKind };
}
