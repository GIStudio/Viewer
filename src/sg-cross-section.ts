import type {
  AnnotationPoint,
  AnnotatedCenterline,
  AnnotatedCrossSectionStrip,
  AnnotatedJunction,
  AnnotatedStreetFurnitureInstance,
  AnnotationModelIssue,
  BranchSnapTarget,
  CrossSectionMode,
  DerivedJunctionOverlay,
  FurnitureKind,
  JunctionOverlayStripLink,
  JunctionOverlayStripLinkEndpoint,
  LaneProfile,
  ReferenceAnnotation,
  SurfaceAnnotationKind,
  SurfaceRole,
  StripDirection,
  StripKind,
  StripZone,
  SelectedStripCornerConnection,
  SelectedStripCornerFamilyTarget,
  OffsetPolylineSegment,
  Selection,
} from "./sg-types";
import {
  ANNOTATION_MODEL_TOLERANCE_PX,
  BRANCH_SNAP_TOLERANCE_PX,
  BRANCH_VERTEX_REUSE_TOLERANCE_PX,
  CROSS_SECTION_MODE_COARSE,
  CROSS_SECTION_MODE_DETAILED,
  DEFAULT_FORWARD_DRIVE_LANE_COUNT,
  DEFAULT_REVERSE_DRIVE_LANE_COUNT,
  FUNCTIONAL_ZONE_KINDS,
  FURNITURE_COMPATIBLE_STRIP_KINDS,
  FURNITURE_KINDS,
  NOMINAL_STRIP_WIDTHS,
  STRIP_DIRECTION_OPTIONS,
  STRIP_KINDS,
  SURFACE_ANNOTATION_KINDS,
  SURFACE_ROLES,
} from "./sg-constants";

export function clonePoint(point: AnnotationPoint): AnnotationPoint {
  return { x: point.x, y: point.y };
}

export function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && !value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asNonNegativeInt(value: unknown, fallback: number): number {
  return Math.max(0, Math.round(asNumber(value, fallback)));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function isStripZone(value: string): value is StripZone {
  return value === "left" || value === "center" || value === "right";
}

export function isStripKind(value: string): value is StripKind {
  return STRIP_KINDS.includes(value as StripKind);
}

export function isStripDirection(value: string): value is StripDirection {
  return STRIP_DIRECTION_OPTIONS.includes(value as StripDirection);
}

export function isFurnitureKind(value: string): value is FurnitureKind {
  return FURNITURE_KINDS.includes(value as FurnitureKind);
}

export function isFunctionalZoneKind(value: string): value is import("./sg-types").FunctionalZoneKind {
  return FUNCTIONAL_ZONE_KINDS.includes(value as import("./sg-types").FunctionalZoneKind);
}

export function isSurfaceAnnotationKind(value: string): value is SurfaceAnnotationKind {
  return SURFACE_ANNOTATION_KINDS.includes(value as SurfaceAnnotationKind);
}

export function isSurfaceRole(value: string): value is SurfaceRole {
  return SURFACE_ROLES.includes(value as SurfaceRole);
}

export function resolveDriveLaneDefaults(record: Record<string, unknown>): {
  forward_drive_lane_count: number;
  reverse_drive_lane_count: number;
} {
  const legacyLaneCount = Math.max(
    1,
    Math.round(asNumber(record.lane_count, DEFAULT_FORWARD_DRIVE_LANE_COUNT + DEFAULT_REVERSE_DRIVE_LANE_COUNT)),
  );
  const defaultForward = Math.max(1, Math.ceil(legacyLaneCount / 2));
  const defaultReverse = Math.max(0, legacyLaneCount - defaultForward);
  const forwardDriveLaneCount = asNonNegativeInt(record.forward_drive_lane_count, defaultForward);
  const reverseDriveLaneCount = asNonNegativeInt(record.reverse_drive_lane_count, defaultReverse);
  if (forwardDriveLaneCount <= 0 && reverseDriveLaneCount <= 0) {
    return {
      forward_drive_lane_count: DEFAULT_FORWARD_DRIVE_LANE_COUNT,
      reverse_drive_lane_count: DEFAULT_REVERSE_DRIVE_LANE_COUNT,
    };
  }
  return {
    forward_drive_lane_count: forwardDriveLaneCount,
    reverse_drive_lane_count: reverseDriveLaneCount,
  };
}

export function laneProfile(centerline: AnnotatedCenterline): LaneProfile {
  const forward = Math.max(0, centerline.forward_drive_lane_count);
  const reverse = Math.max(0, centerline.reverse_drive_lane_count);
  const bike = Math.max(0, centerline.bike_lane_count);
  const bus = Math.max(0, centerline.bus_lane_count);
  const parking = Math.max(0, centerline.parking_lane_count);
  return {
    forward_drive_lane_count: forward,
    reverse_drive_lane_count: reverse,
    bike_lane_count: bike,
    bus_lane_count: bus,
    parking_lane_count: parking,
    bidirectional_drive_lane_count: 0,
    bidirectional_lane_count: 0,
    total_drive_lane_count: forward + reverse,
    total_lane_count: forward + reverse + bike + bus + parking,
  };
}

export function resolvedCrossSectionMode(centerline: AnnotatedCenterline): CrossSectionMode {
  if (centerline.cross_section_strips.length > 0) {
    return CROSS_SECTION_MODE_DETAILED;
  }
  return centerline.cross_section_mode === CROSS_SECTION_MODE_DETAILED
    ? CROSS_SECTION_MODE_DETAILED
    : CROSS_SECTION_MODE_COARSE;
}

export function sortedCrossSectionStrips(strips: AnnotatedCrossSectionStrip[]): AnnotatedCrossSectionStrip[] {
  const zoneRank: Record<StripZone, number> = { left: 0, center: 1, right: 2 };
  return [...strips].sort((a, b) => {
    const zoneDelta = zoneRank[a.zone] - zoneRank[b.zone];
    if (zoneDelta !== 0) {
      return zoneDelta;
    }
    if (a.order_index !== b.order_index) {
      return a.order_index - b.order_index;
    }
    return a.strip_id.localeCompare(b.strip_id);
  });
}

export function getCenterlineCrossSectionWidth(centerline: AnnotatedCenterline): number {
  if (resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED && centerline.cross_section_strips.length > 0) {
    return centerline.cross_section_strips.reduce((sum, strip) => sum + Math.max(0, strip.width_m), 0);
  }
  return Math.max(1, centerline.road_width_m);
}

export function getCenterlineCarriagewayWidth(centerline: AnnotatedCenterline): number {
  if (resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED && centerline.cross_section_strips.length > 0) {
    const width = centerline.cross_section_strips.reduce((sum, strip) => {
      if (strip.zone !== "center") {
        return sum;
      }
      return sum + Math.max(0, strip.width_m);
    }, 0);
    if (width > 0) {
      return width;
    }
  }
  return Math.max(1, centerline.road_width_m);
}

export function deriveLaneProfileFromStrips(strips: AnnotatedCrossSectionStrip[]): LaneProfile {
  let forwardDriveLaneCount = 0;
  let reverseDriveLaneCount = 0;
  let bikeLaneCount = 0;
  let busLaneCount = 0;
  let parkingLaneCount = 0;
  let bidirectionalDriveLaneCount = 0;
  let bidirectionalLaneCount = 0;

  for (const strip of strips) {
    if (strip.zone !== "center") {
      continue;
    }
    if (strip.kind === "drive_lane") {
      if (strip.direction === "forward") {
        forwardDriveLaneCount += 1;
      } else if (strip.direction === "reverse") {
        reverseDriveLaneCount += 1;
      } else if (strip.direction === "bidirectional") {
        bidirectionalDriveLaneCount += 1;
        bidirectionalLaneCount += 1;
      }
    } else if (strip.kind === "bike_lane") {
      bikeLaneCount += 1;
      if (strip.direction === "bidirectional") {
        bidirectionalLaneCount += 1;
      }
    } else if (strip.kind === "bus_lane") {
      busLaneCount += 1;
      if (strip.direction === "bidirectional") {
        bidirectionalLaneCount += 1;
      }
    } else if (strip.kind === "parking_lane") {
      parkingLaneCount += 1;
    }
  }

  return {
    forward_drive_lane_count: forwardDriveLaneCount,
    reverse_drive_lane_count: reverseDriveLaneCount,
    bike_lane_count: bikeLaneCount,
    bus_lane_count: busLaneCount,
    parking_lane_count: parkingLaneCount,
    bidirectional_drive_lane_count: bidirectionalDriveLaneCount,
    bidirectional_lane_count: bidirectionalLaneCount,
    total_drive_lane_count: forwardDriveLaneCount + reverseDriveLaneCount + bidirectionalDriveLaneCount,
    total_lane_count:
      forwardDriveLaneCount +
      reverseDriveLaneCount +
      bikeLaneCount +
      busLaneCount +
      parkingLaneCount +
      bidirectionalDriveLaneCount,
  };
}

export function deriveLaneProfile(centerline: AnnotatedCenterline): LaneProfile {
  if (resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED && centerline.cross_section_strips.length > 0) {
    return deriveLaneProfileFromStrips(centerline.cross_section_strips);
  }
  return laneProfile(centerline);
}

export function reindexCenterlineStrips(centerline: AnnotatedCenterline): void {
  const nextStrips: AnnotatedCrossSectionStrip[] = [];
  for (const zone of ["left", "center", "right"] as StripZone[]) {
    const zoneStrips = sortedCrossSectionStrips(centerline.cross_section_strips).filter((strip) => strip.zone === zone);
    zoneStrips.forEach((strip, index) => {
      nextStrips.push({ ...strip, order_index: index });
    });
  }
  centerline.cross_section_strips = nextStrips;
}

export function nextStripId(centerline: AnnotatedCenterline, zone: StripZone): string {
  const used = new Set(centerline.cross_section_strips.map((strip) => strip.strip_id));
  let counter = centerline.cross_section_strips.filter((strip) => strip.zone === zone).length + 1;
  while (true) {
    const candidate = `${zone}_${String(counter).padStart(2, "0")}`;
    if (!used.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

export function splitAuxiliaryCountAcrossDirections(
  total: number,
  forwardDriveLaneCount: number,
  reverseDriveLaneCount: number,
): { reverse: number; forward: number } {
  if (forwardDriveLaneCount > 0 && reverseDriveLaneCount > 0) {
    return {
      reverse: Math.ceil(total / 2),
      forward: Math.floor(total / 2),
    };
  }
  if (reverseDriveLaneCount > 0) {
    return { reverse: total, forward: 0 };
  }
  return { reverse: 0, forward: total };
}

export function nominalSeedCrossSectionWidthForCounts(
  forwardDriveLaneCount: number,
  reverseDriveLaneCount: number,
  bikeLaneCount: number,
  busLaneCount: number,
  parkingLaneCount: number,
): number {
  const parkingSplit = splitAuxiliaryCountAcrossDirections(
    Math.max(0, parkingLaneCount),
    Math.max(0, forwardDriveLaneCount),
    Math.max(0, reverseDriveLaneCount),
  );
  const bikeSplit = splitAuxiliaryCountAcrossDirections(
    Math.max(0, bikeLaneCount),
    Math.max(0, forwardDriveLaneCount),
    Math.max(0, reverseDriveLaneCount),
  );
  const busSplit = splitAuxiliaryCountAcrossDirections(
    Math.max(0, busLaneCount),
    Math.max(0, forwardDriveLaneCount),
    Math.max(0, reverseDriveLaneCount),
  );
  const sideWidth =
    2 *
    (NOMINAL_STRIP_WIDTHS.nearroad_furnishing +
      NOMINAL_STRIP_WIDTHS.clear_sidewalk +
      NOMINAL_STRIP_WIDTHS.frontage_reserve);
  const centerWidth =
    (Math.max(0, reverseDriveLaneCount) + Math.max(0, forwardDriveLaneCount)) * NOMINAL_STRIP_WIDTHS.drive_lane +
    (parkingSplit.reverse + parkingSplit.forward) * NOMINAL_STRIP_WIDTHS.parking_lane +
    (bikeSplit.reverse + bikeSplit.forward) * NOMINAL_STRIP_WIDTHS.bike_lane +
    (busSplit.reverse + busSplit.forward) * NOMINAL_STRIP_WIDTHS.bus_lane +
    (forwardDriveLaneCount > 0 && reverseDriveLaneCount > 0 ? NOMINAL_STRIP_WIDTHS.median : 0);
  return Number((sideWidth + centerWidth).toFixed(3));
}

export function seedDetailedCrossSection(centerline: AnnotatedCenterline): AnnotatedCrossSectionStrip[] {
  const leftAux = {
    parking: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.parking_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).reverse,
    bike: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.bike_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).reverse,
    bus: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.bus_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).reverse,
  };
  const rightAux = {
    parking: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.parking_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).forward,
    bike: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.bike_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).forward,
    bus: splitAuxiliaryCountAcrossDirections(
      Math.max(0, centerline.bus_lane_count),
      centerline.forward_drive_lane_count,
      centerline.reverse_drive_lane_count,
    ).forward,
  };
  const strips: AnnotatedCrossSectionStrip[] = [];

  const pushStrip = (zone: StripZone, kind: StripKind, direction: StripDirection): void => {
    strips.push({
      strip_id: nextStripId({ ...centerline, cross_section_strips: strips }, zone),
      zone,
      kind,
      width_m: NOMINAL_STRIP_WIDTHS[kind],
      direction,
      order_index: strips.filter((strip) => strip.zone === zone).length,
    });
  };

  pushStrip("left", "nearroad_furnishing", "none");
  pushStrip("left", "clear_sidewalk", "none");
  pushStrip("left", "frontage_reserve", "none");
  pushStrip("right", "nearroad_furnishing", "none");
  pushStrip("right", "clear_sidewalk", "none");
  pushStrip("right", "frontage_reserve", "none");

  for (let index = 0; index < leftAux.parking; index += 1) {
    pushStrip("center", "parking_lane", "reverse");
  }
  for (let index = 0; index < leftAux.bike; index += 1) {
    pushStrip("center", "bike_lane", "reverse");
  }
  for (let index = 0; index < leftAux.bus; index += 1) {
    pushStrip("center", "bus_lane", "reverse");
  }
  for (let index = 0; index < Math.max(0, centerline.reverse_drive_lane_count); index += 1) {
    pushStrip("center", "drive_lane", "reverse");
  }
  if (centerline.forward_drive_lane_count > 0 && centerline.reverse_drive_lane_count > 0) {
    pushStrip("center", "median", "none");
  }
  for (let index = 0; index < Math.max(0, centerline.forward_drive_lane_count); index += 1) {
    pushStrip("center", "drive_lane", "forward");
  }
  for (let index = 0; index < rightAux.bus; index += 1) {
    pushStrip("center", "bus_lane", "forward");
  }
  for (let index = 0; index < rightAux.bike; index += 1) {
    pushStrip("center", "bike_lane", "forward");
  }
  for (let index = 0; index < rightAux.parking; index += 1) {
    pushStrip("center", "parking_lane", "forward");
  }

  const nominalTotalWidth = strips.reduce((sum, strip) => sum + strip.width_m, 0);
  const targetWidth = Math.max(1, centerline.road_width_m || nominalTotalWidth);
  const scale = nominalTotalWidth > 0 ? targetWidth / nominalTotalWidth : 1;
  return strips.map((strip) => ({
    ...strip,
    width_m: Number((strip.width_m * scale).toFixed(3)),
  }));
}

export function ensureDetailedCrossSection(centerline: AnnotatedCenterline): boolean {
  if (resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED && centerline.cross_section_strips.length > 0) {
    syncCenterlineDerivedFields(centerline);
    return false;
  }
  centerline.cross_section_strips = seedDetailedCrossSection(centerline);
  centerline.street_furniture_instances = [];
  syncCenterlineDerivedFields(centerline);
  return true;
}

export function syncCenterlineDerivedFields(centerline: AnnotatedCenterline): void {
  reindexCenterlineStrips(centerline);
  const mode = centerline.cross_section_strips.length > 0 ? CROSS_SECTION_MODE_DETAILED : CROSS_SECTION_MODE_COARSE;
  centerline.cross_section_mode = mode;
  const profile = deriveLaneProfile(centerline);
  centerline.forward_drive_lane_count = profile.forward_drive_lane_count;
  centerline.reverse_drive_lane_count = profile.reverse_drive_lane_count;
  centerline.bike_lane_count = profile.bike_lane_count;
  centerline.bus_lane_count = profile.bus_lane_count;
  centerline.parking_lane_count = profile.parking_lane_count;
  centerline.road_width_m = getCenterlineCrossSectionWidth(centerline);
  const validStripIds = new Set(centerline.cross_section_strips.map((strip) => strip.strip_id));
  const validFurnitureStripIds = new Set(
    centerline.cross_section_strips
      .filter((strip) => FURNITURE_COMPATIBLE_STRIP_KINDS.has(strip.kind))
      .map((strip) => strip.strip_id),
  );
  centerline.street_furniture_instances = centerline.street_furniture_instances
    .filter((instance) => validStripIds.has(instance.strip_id) && validFurnitureStripIds.has(instance.strip_id))
    .map((instance) => ({ ...instance, centerline_id: centerline.id }));
}

export function formatLaneSummary(centerline: AnnotatedCenterline): string {
  const profile = deriveLaneProfile(centerline);
  const parts = [`drive ${profile.forward_drive_lane_count}/${profile.reverse_drive_lane_count}`];
  if (profile.bidirectional_drive_lane_count > 0) {
    parts.push(`bi-drive ${profile.bidirectional_drive_lane_count}`);
  }
  if (profile.bike_lane_count > 0) {
    parts.push(`bike ${profile.bike_lane_count}`);
  }
  if (profile.bus_lane_count > 0) {
    parts.push(`bus ${profile.bus_lane_count}`);
  }
  if (profile.parking_lane_count > 0) {
    parts.push(`park ${profile.parking_lane_count}`);
  }
  return parts.join(" · ");
}

export function formatCrossSectionSummary(centerline: AnnotatedCenterline): string {
  if (resolvedCrossSectionMode(centerline) !== CROSS_SECTION_MODE_DETAILED || centerline.cross_section_strips.length === 0) {
    return "coarse";
  }
  const left = centerline.cross_section_strips.filter((strip) => strip.zone === "left").length;
  const center = centerline.cross_section_strips.filter((strip) => strip.zone === "center").length;
  const right = centerline.cross_section_strips.filter((strip) => strip.zone === "right").length;
  return `L${left} · C${center} · R${right}`;
}

export function stripKey(centerlineId: string, stripId: string): string {
  return `${centerlineId}:${stripId}`;
}

export function stripLinkEndpointMatches(
  endpoint: JunctionOverlayStripLinkEndpoint,
  centerlineId: string,
  stripId: string,
): boolean {
  return endpoint.centerlineId === centerlineId && endpoint.stripId === stripId;
}

export function selectedStripCornerConnections(
  junctionOverlays: DerivedJunctionOverlay[],
  centerlineId: string,
  stripId: string,
): SelectedStripCornerConnection[] {
  const connections: SelectedStripCornerConnection[] = [];
  for (const overlay of junctionOverlays) {
    for (const link of overlay.cornerStripLinks) {
      if (stripLinkEndpointMatches(link.start, centerlineId, stripId)) {
        connections.push({
          linkId: link.linkId,
          junctionId: link.junctionId,
          quadrantId: link.quadrantId,
          kernelId: link.kernelId,
          stripKind: link.stripKind,
          current: link.start,
          peer: link.end,
          points: link.points.map((point) => clonePoint(point)),
        });
        continue;
      }
      if (stripLinkEndpointMatches(link.end, centerlineId, stripId)) {
        connections.push({
          linkId: link.linkId,
          junctionId: link.junctionId,
          quadrantId: link.quadrantId,
          kernelId: link.kernelId,
          stripKind: link.stripKind,
          current: link.end,
          peer: link.start,
          points: [...link.points].reverse().map((point) => clonePoint(point)),
        });
      }
    }
  }
  return connections;
}

export function cornerFamilyIdentity(link: JunctionOverlayStripLink): string | null {
  if (!link.kernelId) {
    return null;
  }
  return `${link.junctionId}::${link.quadrantId}::${link.kernelId}`;
}

export function selectedStripCornerFamilyTargets(
  junctionOverlays: DerivedJunctionOverlay[],
  centerlineId: string,
  stripId: string,
): SelectedStripCornerFamilyTarget[] {
  const familyIds = new Set<string>();
  for (const overlay of junctionOverlays) {
    if (overlay.kind !== "cross_junction") {
      continue;
    }
    for (const link of overlay.cornerStripLinks) {
      if (
        stripLinkEndpointMatches(link.start, centerlineId, stripId) ||
        stripLinkEndpointMatches(link.end, centerlineId, stripId)
      ) {
        const familyId = cornerFamilyIdentity(link);
        if (familyId) {
          familyIds.add(familyId);
        }
      }
    }
  }
  if (familyIds.size === 0) {
    return selectedStripCornerConnections(junctionOverlays, centerlineId, stripId).map((connection) => ({
      targetId: `${connection.linkId}:${connection.peer.centerlineId}:${connection.peer.stripId}`,
      junctionId: connection.junctionId,
      quadrantId: connection.quadrantId,
      kernelId: connection.kernelId,
      stripKind: connection.stripKind,
      target: connection.peer,
      points: connection.points.map((point) => clonePoint(point)),
    }));
  }
  const targets: SelectedStripCornerFamilyTarget[] = [];
  const seen = new Set<string>();
  for (const overlay of junctionOverlays) {
    if (overlay.kind !== "cross_junction") {
      continue;
    }
    for (const link of overlay.cornerStripLinks) {
      const familyId = cornerFamilyIdentity(link);
      if (!familyId || !familyIds.has(familyId)) {
        continue;
      }
      for (const [endpoint, points] of [
        [link.start, link.points],
        [link.end, [...link.points].reverse()],
      ] as const) {
        if (stripLinkEndpointMatches(endpoint, centerlineId, stripId)) {
          continue;
        }
        const targetId = `${familyId}:${endpoint.centerlineId}:${endpoint.stripId}`;
        if (seen.has(targetId)) {
          continue;
        }
        seen.add(targetId);
        targets.push({
          targetId,
          junctionId: link.junctionId,
          quadrantId: link.quadrantId,
          kernelId: link.kernelId,
          stripKind: link.stripKind,
          target: endpoint,
          points: points.map((point) => clonePoint(point)),
        });
      }
    }
  }
  return targets;
}

export function stripCenterOffsetMeters(centerline: AnnotatedCenterline): Record<string, { centerOffsetM: number; widthM: number }> {
  const strips = sortedCrossSectionStrips(centerline.cross_section_strips);
  const left = strips.filter((strip) => strip.zone === "left");
  const center = strips.filter((strip) => strip.zone === "center");
  const right = strips.filter((strip) => strip.zone === "right");
  const carriagewayWidthM = center.reduce((sum, strip) => sum + strip.width_m, 0);
  const result: Record<string, { centerOffsetM: number; widthM: number }> = {};

  let leftAccum = 0;
  for (const strip of left) {
    const centerOffsetM = -(carriagewayWidthM * 0.5 + leftAccum + strip.width_m * 0.5);
    result[strip.strip_id] = { centerOffsetM, widthM: strip.width_m };
    leftAccum += strip.width_m;
  }

  let centerAccum = -carriagewayWidthM * 0.5;
  for (const strip of center) {
    const centerOffsetM = centerAccum + strip.width_m * 0.5;
    result[strip.strip_id] = { centerOffsetM, widthM: strip.width_m };
    centerAccum += strip.width_m;
  }

  let rightAccum = 0;
  for (const strip of right) {
    const centerOffsetM = carriagewayWidthM * 0.5 + rightAccum + strip.width_m * 0.5;
    result[strip.strip_id] = { centerOffsetM, widthM: strip.width_m };
    rightAccum += strip.width_m;
  }

  return result;
}
