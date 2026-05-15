import type { DerivedJunctionOverlay, DerivedJunctionOverlayConnectorLine, DerivedJunctionOverlayFusedStrip, JunctionOverlayStripLink, JunctionOverlayStripLinkEndpoint, LaneElementKind, LaneElementSelection, Selection } from "../sg-types";
import { selectedStripCornerFamilyTargets, stripKey } from "../sg-utils";

function selectedLaneElement(selection: Selection): LaneElementSelection | null {
  return selection?.kind === "lane_element" ? selection : null;
}

function laneEndpointKey(centerlineId: string | undefined, stripId: string | undefined): string | null {
  return centerlineId && stripId ? stripKey(centerlineId, stripId) : null;
}

function laneSelectionEndpointKeys(selection: LaneElementSelection | null): Set<string> {
  const keys = new Set<string>();
  if (!selection) {
    return keys;
  }
  const directKey = laneEndpointKey(selection.centerlineId, selection.stripId);
  if (directKey) {
    keys.add(directKey);
  }
  const fromKey = laneEndpointKey(selection.fromCenterlineId, selection.fromStripId);
  if (fromKey) {
    keys.add(fromKey);
  }
  const toKey = laneEndpointKey(selection.toCenterlineId, selection.toStripId);
  if (toKey) {
    keys.add(toKey);
  }
  return keys;
}

function laneElementRelatedStripKeys(
  junctionOverlays: DerivedJunctionOverlay[],
  selection: LaneElementSelection | null,
): Set<string> {
  const keys = laneSelectionEndpointKeys(selection);
  if (!selection || selection.elementKind !== "road_strip" || !selection.centerlineId || !selection.stripId) {
    return keys;
  }
  for (const target of selectedStripCornerFamilyTargets(junctionOverlays, selection.centerlineId, selection.stripId)) {
    keys.add(stripKey(target.target.centerlineId, target.target.stripId));
  }
  return keys;
}

function laneElementMatches(selection: LaneElementSelection | null, elementKind: LaneElementKind, id: string): boolean {
  return Boolean(selection && selection.elementKind === elementKind && selection.id === id);
}

function laneElementTouchesEndpoints(
  selection: LaneElementSelection | null,
  start: JunctionOverlayStripLinkEndpoint | undefined,
  end: JunctionOverlayStripLinkEndpoint | undefined,
): boolean {
  if (!selection) {
    return false;
  }
  const selectedKeys = laneSelectionEndpointKeys(selection);
  for (const endpoint of [start, end]) {
    const key = laneEndpointKey(endpoint?.centerlineId, endpoint?.stripId);
    if (key && selectedKeys.has(key)) {
      return true;
    }
  }
  return false;
}

function laneSelectionClassName(isSelected: boolean, isRelated: boolean): string {
  if (isSelected) {
    return " annotation-lane-element-selected";
  }
  if (isRelated) {
    return " annotation-lane-element-related";
  }
  return "";
}

function findConnectorLineLink(
  overlay: DerivedJunctionOverlay,
  line: DerivedJunctionOverlayConnectorLine,
): JunctionOverlayStripLink | null {
  if (line.linkId) {
    const explicitLink = overlay.cornerStripLinks.find((link) => link.linkId === line.linkId) ?? null;
    if (explicitLink) {
      return explicitLink;
    }
  }
  return overlay.cornerStripLinks.find(
    (link) =>
      link.quadrantId === line.quadrantId &&
      link.kernelId === line.kernelId &&
      link.stripKind === line.stripKind,
  ) ?? null;
}

function findFusedStripLink(
  overlay: DerivedJunctionOverlay,
  strip: DerivedJunctionOverlayFusedStrip,
): JunctionOverlayStripLink | null {
  return overlay.cornerStripLinks.find(
    (link) =>
      link.quadrantId === strip.quadrantId &&
      link.kernelId === strip.kernelId &&
      link.stripKind === strip.stripKind,
    ) ?? null;
}

export {
  findConnectorLineLink,
  findFusedStripLink,
  laneElementMatches,
  laneElementRelatedStripKeys,
  laneElementTouchesEndpoints,
  laneSelectionClassName,
  selectedLaneElement,
};
