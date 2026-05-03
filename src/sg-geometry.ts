import type {
  AnnotationPoint,
  BezierCurve3,
  AnnotatedCenterline,
  AnnotatedCrossSectionStrip,
  AnnotatedBuildingRegion,
  AnnotatedFunctionalZone,
  AnnotatedJunction,
  BuildingRegionResizeHandle,
  BranchSnapTarget,
  DerivedJunctionOverlay,
  DerivedJunctionOverlayArm,
  DerivedJunctionOverlayBoundary,
  DerivedJunctionOverlayConnectorLine,
  DerivedJunctionOverlayFusedStrip,
  DerivedJunctionOverlayPatch,
  DerivedJunctionOverlayVehicleTurnPatch,
  JunctionOverlayControlPoint,
  JunctionOverlayCornerFocus,
  JunctionOverlayCornerKernel,
  JunctionOverlayFootPoint,
  JunctionOverlayGuideLine,
  JunctionOverlayStripLink,
  JunctionQuadrantBezierPatch,
  JunctionQuadrantComposition,
  JunctionQuadrantSkeletonLine,
  ClippedDisplaySegment,
  StripKind,
  StripZone,
  SideStripLayouts,
  ReferenceAnnotation,
} from "./sg-types";
import {
  ANNOTATION_MODEL_TOLERANCE_PX,
  BUILDING_REGION_MIN_SIZE_PX,
  BUILDING_REGION_ROTATE_HANDLE_OFFSET_PX,
  CENTER_STRIP_KINDS,
  CORNER_LINK_STRIP_KINDS,
  CROSS_SECTION_MODE_DETAILED,
  DEFAULT_CENTERLINE_MARK_WIDTH_M,
  DEFAULT_DRIVE_LANE_WIDTH_M,
  NOMINAL_STRIP_WIDTHS,
  SIDE_STRIP_KINDS,
} from "./sg-constants";
import {
  buildOffsetPolylineSegments,
  clamp,
  clonePoint,
  deriveLaneProfileFromStrips,
  formatCrossSectionSummary,
  formatLaneSummary,
  getCenterlineCarriagewayWidth,
  getCenterlineCrossSectionWidth,
  junctionAnchorPoint,
  laneProfile,
  limitedMiterJoinPoint,
  lineIntersectionTs,
  normalizeVector,
  offsetPointAlongNormal,
  offsetPolyline,
  pointDistance,
  polylineLength,
  projectPointOntoPolyline,
  resolvedCrossSectionMode,
  seedDetailedCrossSection,
  sortedCrossSectionStrips,
  stationToPolylinePoint,
  stripCenterOffsetMeters,
} from "./sg-utils";

export function crossAxisNormalAtSnap(centerline: AnnotatedCenterline, snap: BranchSnapTarget): AnnotationPoint {
  const sample = stationToPolylinePoint(centerline.points, snap.stationPx);
  const length = Math.max(Math.hypot(sample.leftNormal.x, sample.leftNormal.y), 1e-6);
  return {
    x: sample.leftNormal.x / length,
    y: sample.leftNormal.y / length,
  };
}

export function pointOnAxis(anchor: AnnotationPoint, axisNormal: AnnotationPoint, signedDistancePx: number): AnnotationPoint {
  return {
    x: anchor.x + axisNormal.x * signedDistancePx,
    y: anchor.y + axisNormal.y * signedDistancePx,
  };
}

export function normalizeAngleDegTs(value: number): number {
  let normalized = value % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

export function angleDegTs(fromPoint: AnnotationPoint, toPoint: AnnotationPoint): number {
  return normalizeAngleDegTs((Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x) * 180) / Math.PI);
}

export function angleDistanceDegTs(aDeg: number, bDeg: number): number {
  const diff = Math.abs(normalizeAngleDegTs(aDeg - bDeg));
  return Math.min(diff, Math.abs(diff - 360));
}

export function axisDistanceDegTs(angleDeg: number, axisAngleDeg: number): number {
  const diff = angleDistanceDegTs(angleDeg, axisAngleDeg);
  return Math.min(diff, Math.abs(diff - 180));
}

function shortArcSweepTs(startAngle: number, endAngle: number): { sweep: number; direction: 1 | -1 } {
  let ccwSweep = endAngle - startAngle;
  while (ccwSweep <= 0) {
    ccwSweep += Math.PI * 2;
  }
  let clockwiseSweep = startAngle - endAngle;
  while (clockwiseSweep <= 0) {
    clockwiseSweep += Math.PI * 2;
  }
  if (ccwSweep <= clockwiseSweep) {
    return { sweep: ccwSweep, direction: 1 };
  }
  return { sweep: clockwiseSweep, direction: -1 };
}

export function sampleTaperedArcPoints(
  center: AnnotationPoint,
  startPoint: AnnotationPoint,
  endPoint: AnnotationPoint,
  targetSegmentLengthPx: number,
): AnnotationPoint[] {
  const startRadius = pointDistance(center, startPoint);
  const endRadius = pointDistance(center, endPoint);
  if (startRadius <= 1e-6 && endRadius <= 1e-6) {
    return [clonePoint(center)];
  }
  const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
  const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
  const { sweep, direction } = shortArcSweepTs(startAngle, endAngle);
  const arcLength = Math.max(((startRadius + endRadius) * 0.5) * sweep, 0);
  const rawPointCount = Math.ceil(arcLength / Math.max(targetSegmentLengthPx, 1e-6)) + 1;
  const pointCount = Math.max(4, Math.min(24, rawPointCount));
  const points: AnnotationPoint[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    const ratio = index / Math.max(pointCount - 1, 1);
    const radius = startRadius + (endRadius - startRadius) * ratio;
    const angle = startAngle + direction * sweep * ratio;
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  points[0] = clonePoint(startPoint);
  points[points.length - 1] = clonePoint(endPoint);
  return points;
}

function dedupeRingPointsTs(points: AnnotationPoint[], tolerancePx = 1e-6): AnnotationPoint[] {
  const deduped: AnnotationPoint[] = [];
  for (const point of points) {
    const candidate = clonePoint(point);
    if (deduped.length > 0 && pointDistance(deduped[deduped.length - 1], candidate) <= tolerancePx) {
      continue;
    }
    deduped.push(candidate);
  }
  if (deduped.length > 1 && pointDistance(deduped[0], deduped[deduped.length - 1]) <= tolerancePx) {
    deduped.pop();
  }
  return deduped;
}

export function buildAnnularSectorBandPoints(
  center: AnnotationPoint,
  nearStart: AnnotationPoint,
  farStart: AnnotationPoint,
  nearEnd: AnnotationPoint,
  farEnd: AnnotationPoint,
  targetSegmentLengthPx = 8,
): AnnotationPoint[] {
  return buildAnnularSectorBandGeometry(
    center,
    nearStart,
    farStart,
    nearEnd,
    farEnd,
    targetSegmentLengthPx,
  ).ring;
}

export function buildAnnularSectorBandGeometry(
  center: AnnotationPoint,
  nearStart: AnnotationPoint,
  farStart: AnnotationPoint,
  nearEnd: AnnotationPoint,
  farEnd: AnnotationPoint,
  targetSegmentLengthPx = 8,
): {
  nearLine: AnnotationPoint[];
  farLine: AnnotationPoint[];
  ring: AnnotationPoint[];
} {
  const nearLine = sampleTaperedArcPoints(center, nearStart, nearEnd, targetSegmentLengthPx);
  const farLine = sampleTaperedArcPoints(center, farStart, farEnd, targetSegmentLengthPx);
  return {
    nearLine,
    farLine,
    ring: dedupeRingPointsTs([...nearLine, ...farLine.slice().reverse()]),
  };
}

type CornerFilletArmTs = {
  splitBoundaryCenter: AnnotationPoint;
  normal: AnnotationPoint;
  tangent: AnnotationPoint;
  splitDistancePx?: number;
  coreExitDistancePx?: number;
};

type CornerFilletKernelTs = {
  kernelKind: "circular_arc";
  center: AnnotationPoint;
  radiusPx: number;
  startPoint: AnnotationPoint;
  endPoint: AnnotationPoint;
  startHeadingDeg: number;
  endHeadingDeg: number;
  clockwise: boolean;
  sampledPoints: AnnotationPoint[];
};

function cornerSplitDistancePx(arm: CornerFilletArmTs, anchor?: AnnotationPoint): number {
  const explicitSplit = typeof arm.splitDistancePx === "number" && Number.isFinite(arm.splitDistancePx)
    ? arm.splitDistancePx
    : 0;
  if (explicitSplit > 0) {
    return explicitSplit;
  }
  const explicitCore = typeof arm.coreExitDistancePx === "number" && Number.isFinite(arm.coreExitDistancePx)
    ? arm.coreExitDistancePx
    : 0;
  if (explicitCore > 0) {
    return explicitCore;
  }
  return anchor ? pointDistance(anchor, arm.splitBoundaryCenter) : 0;
}

function cornerFilletTurnRadiusPx(
  arm: CornerFilletArmTs,
  nextArm: CornerFilletArmTs,
  pixelsPerMeter: number,
  targetSegmentLengthPx: number,
  stripWidthPx = 0,
  anchor?: AnnotationPoint,
): number {
  const splitA = cornerSplitDistancePx(arm, anchor);
  const splitB = cornerSplitDistancePx(nextArm, anchor);
  const preferredRadiusPx = Math.max(
    pixelsPerMeter * 2.8,
    stripWidthPx * 1.35,
    targetSegmentLengthPx * 3.0,
  );
  const maxRadiusPx = splitA > 0 && splitB > 0
    ? Math.max(Math.min(splitA, splitB) * 0.62, pixelsPerMeter)
    : preferredRadiusPx;
  return Math.max(Math.min(preferredRadiusPx, maxRadiusPx), pixelsPerMeter * 0.5);
}

function cornerQuadrantFilletTurnRadiusPx(
  arm: DerivedJunctionOverlayArm,
  nextArm: DerivedJunctionOverlayArm,
  cornerCenter: AnnotationPoint,
  pixelsPerMeter: number,
  targetSegmentLengthPx: number,
  anchor?: AnnotationPoint,
): number {
  const widths: number[] = [];
  for (const kind of ["nearroad_furnishing", "clear_sidewalk", "frontage_reserve"] as const) {
    const offsetsA = cornerStripOffsetRangeTs(arm, cornerCenter, kind, pixelsPerMeter);
    const offsetsB = cornerStripOffsetRangeTs(nextArm, cornerCenter, kind, pixelsPerMeter);
    if (!offsetsA || !offsetsB) {
      continue;
    }
    widths.push(
      Math.max(
        (
          Math.abs(offsetsA.outerOffsetPx - offsetsA.innerOffsetPx) +
          Math.abs(offsetsB.outerOffsetPx - offsetsB.innerOffsetPx)
        ) * 0.5,
        0,
      ),
    );
  }
  return cornerFilletTurnRadiusPx(
    arm,
    nextArm,
    pixelsPerMeter,
    targetSegmentLengthPx,
    Math.max(...widths, 0),
    anchor,
  );
}

function cornerEdgeJoinPointTs(
  arm: CornerFilletArmTs,
  nextArm: CornerFilletArmTs,
  offsetA: number,
  offsetB: number,
): AnnotationPoint | null {
  const pointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetA);
  const pointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetB);
  return lineIntersectionTs(pointA, arm.tangent, pointB, nextArm.tangent);
}

export function cornerFilletArcKernelTs(
  cornerPoint: AnnotationPoint,
  tangentA: AnnotationPoint,
  tangentB: AnnotationPoint,
  radiusPx: number,
  targetSegmentLengthPx: number,
): CornerFilletKernelTs | null {
  const rayA = normalizeVector(tangentA);
  const rayB = normalizeVector(tangentB);
  if (!rayA || !rayB) {
    return null;
  }
  const dot = clamp(rayA.x * rayB.x + rayA.y * rayB.y, -1, 1);
  const theta = Math.acos(dot);
  if (theta <= (5 * Math.PI) / 180 || theta >= (175 * Math.PI) / 180) {
    return null;
  }
  const bisector = normalizeVector({ x: rayA.x + rayB.x, y: rayA.y + rayB.y });
  if (!bisector) {
    return null;
  }
  const radius = Math.max(radiusPx, 0.1);
  const tangentDistance = radius / Math.max(Math.tan(theta * 0.5), 1e-6);
  const centerDistance = radius / Math.max(Math.sin(theta * 0.5), 1e-6);
  const startPoint = {
    x: cornerPoint.x + rayA.x * tangentDistance,
    y: cornerPoint.y + rayA.y * tangentDistance,
  };
  const endPoint = {
    x: cornerPoint.x + rayB.x * tangentDistance,
    y: cornerPoint.y + rayB.y * tangentDistance,
  };
  const center = {
    x: cornerPoint.x + bisector.x * centerDistance,
    y: cornerPoint.y + bisector.y * centerDistance,
  };
  const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
  const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
  const { direction } = shortArcSweepTs(startAngle, endAngle);
  return {
    kernelKind: "circular_arc",
    center,
    radiusPx: radius,
    startPoint,
    endPoint,
    startHeadingDeg: headingDegForVectorTs(tangentA),
    endHeadingDeg: headingDegForVectorTs(tangentB),
    clockwise: direction < 0,
    sampledPoints: sampleTaperedArcPoints(center, startPoint, endPoint, targetSegmentLengthPx),
  };
}

export function cornerOffsetFilletKernelTs(
  arm: CornerFilletArmTs,
  nextArm: CornerFilletArmTs,
  offsetA: number,
  offsetB: number,
  radiusPx: number,
  targetSegmentLengthPx: number,
): CornerFilletKernelTs | null {
  const cornerPoint = cornerEdgeJoinPointTs(arm, nextArm, offsetA, offsetB);
  if (!cornerPoint) {
    return null;
  }
  return cornerFilletArcKernelTs(cornerPoint, arm.tangent, nextArm.tangent, radiusPx, targetSegmentLengthPx);
}

export function buildCornerFilletRibbonGeometryTs(
  arm: CornerFilletArmTs,
  nextArm: CornerFilletArmTs,
  nearOffsetA: number,
  nearOffsetB: number,
  farOffsetA: number,
  farOffsetB: number,
  turnRadiusPx: number,
  targetSegmentLengthPx: number,
): {
  nearLine: AnnotationPoint[];
  farLine: AnnotationPoint[];
  ring: AnnotationPoint[];
} | null {
  const nearKernel = cornerOffsetFilletKernelTs(
    arm,
    nextArm,
    nearOffsetA,
    nearOffsetB,
    turnRadiusPx,
    targetSegmentLengthPx,
  );
  const farKernel = cornerOffsetFilletKernelTs(
    arm,
    nextArm,
    farOffsetA,
    farOffsetB,
    turnRadiusPx,
    targetSegmentLengthPx,
  );
  if (!nearKernel || !farKernel) {
    return null;
  }
  return {
    nearLine: nearKernel.sampledPoints.map((point) => clonePoint(point)),
    farLine: farKernel.sampledPoints.map((point) => clonePoint(point)),
    ring: dedupeRingPointsTs([...nearKernel.sampledPoints, ...farKernel.sampledPoints.slice().reverse()]),
  };
}

export function classifyDerivedJunctionKind(anglesDeg: number[]): "t_junction" | "cross_junction" | "complex_junction" {
  const ordered = [...anglesDeg].sort((a, b) => a - b);
  const diffs = ordered.map((value, index) => {
    const nextValue = ordered[(index + 1) % ordered.length];
    const raw = nextValue - value + (index === ordered.length - 1 ? 360 : 0);
    return raw;
  });
  if (ordered.length === 4 && diffs.length > 0 && diffs.every((diff) => Math.abs(diff - 90) <= 35)) {
    return "cross_junction";
  }
  if (ordered.length === 3 && diffs.some((diff) => diff >= 145)) {
    return "t_junction";
  }
  return "complex_junction";
}

export function junctionProfileWidths(centerline: AnnotatedCenterline): {
  carriagewayWidthM: number;
  nearroadBufferWidthM: number;
  nearroadFurnishingWidthM: number;
  clearSidewalkWidthM: number;
  farfromroadBufferWidthM: number;
  frontageReserveWidthM: number;
} {
  const strips =
    resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED && centerline.cross_section_strips.length > 0
      ? centerline.cross_section_strips
      : seedDetailedCrossSection(centerline);
  const sideStrips = strips.filter((strip) => strip.zone === "left" || strip.zone === "right");
  const maxWidthForKind = (kind: StripKind): number => {
    let best = 0;
    for (const strip of sideStrips) {
      if (strip.kind === kind) {
        best = Math.max(best, Math.max(0, strip.width_m));
      }
    }
    return best;
  };
  return {
    carriagewayWidthM: getCenterlineCarriagewayWidth(centerline),
    nearroadBufferWidthM: maxWidthForKind("nearroad_buffer"),
    nearroadFurnishingWidthM: maxWidthForKind("nearroad_furnishing"),
    clearSidewalkWidthM: maxWidthForKind("clear_sidewalk"),
    farfromroadBufferWidthM: maxWidthForKind("farfromroad_buffer"),
    frontageReserveWidthM: maxWidthForKind("frontage_reserve"),
  };
}

export function rectanglePolygonPoints(
  center: AnnotationPoint,
  tangent: AnnotationPoint,
  normal: AnnotationPoint,
  lengthPx: number,
  widthPx: number,
): AnnotationPoint[] {
  const halfLength = Math.max(lengthPx * 0.5, 1);
  const halfWidth = Math.max(widthPx * 0.5, 1);
  return [
    { x: center.x - tangent.x * halfLength - normal.x * halfWidth, y: center.y - tangent.y * halfLength - normal.y * halfWidth },
    { x: center.x - tangent.x * halfLength + normal.x * halfWidth, y: center.y - tangent.y * halfLength + normal.y * halfWidth },
    { x: center.x + tangent.x * halfLength + normal.x * halfWidth, y: center.y + tangent.y * halfLength + normal.y * halfWidth },
    { x: center.x + tangent.x * halfLength - normal.x * halfWidth, y: center.y + tangent.y * halfLength - normal.y * halfWidth },
  ];
}

export function buildingRegionAxes(yawDeg: number): { axisX: AnnotationPoint; axisY: AnnotationPoint } {
  const yawRad = (normalizeAngleDegTs(yawDeg) * Math.PI) / 180;
  return {
    axisX: { x: Math.cos(yawRad), y: -Math.sin(yawRad) },
    axisY: { x: -Math.sin(yawRad), y: -Math.cos(yawRad) },
  };
}

export function buildingRegionPolygonPoints(region: AnnotatedBuildingRegion): AnnotationPoint[] {
  const { axisX, axisY } = buildingRegionAxes(region.yaw_deg);
  const halfWidth = Math.max(region.width_px * 0.5, 0.5);
  const halfHeight = Math.max(region.height_px * 0.5, 0.5);
  const corners: Array<[number, number]> = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];
  return corners.map(([localX, localY]) => ({
    x: region.center_px.x + axisX.x * localX + axisY.x * localY,
    y: region.center_px.y + axisX.y * localX + axisY.y * localY,
  }));
}

export function buildingRegionLocalPoint(region: AnnotatedBuildingRegion, point: AnnotationPoint): AnnotationPoint {
  const { axisX, axisY } = buildingRegionAxes(region.yaw_deg);
  const dx = point.x - region.center_px.x;
  const dy = point.y - region.center_px.y;
  return {
    x: dx * axisX.x + dy * axisX.y,
    y: dx * axisY.x + dy * axisY.y,
  };
}

export function buildingRegionResizeHandlePoint(region: AnnotatedBuildingRegion, handle: BuildingRegionResizeHandle): AnnotationPoint {
  const localX = handle === "ne" || handle === "se" ? region.width_px * 0.5 : -region.width_px * 0.5;
  const localY = handle === "se" || handle === "sw" ? -region.height_px * 0.5 : region.height_px * 0.5;
  const { axisX, axisY } = buildingRegionAxes(region.yaw_deg);
  return {
    x: region.center_px.x + axisX.x * localX + axisY.x * localY,
    y: region.center_px.y + axisX.y * localX + axisY.y * localY,
  };
}

export function buildingRegionRotateHandlePoint(region: AnnotatedBuildingRegion): AnnotationPoint {
  const { axisY } = buildingRegionAxes(region.yaw_deg);
  const distance = region.height_px * 0.5 + BUILDING_REGION_ROTATE_HANDLE_OFFSET_PX;
  return {
    x: region.center_px.x + axisY.x * distance,
    y: region.center_px.y + axisY.y * distance,
  };
}

export function buildBuildingRegionFromDraft(
  id: string,
  startPoint: AnnotationPoint,
  currentPoint: AnnotationPoint,
): AnnotatedBuildingRegion {
  const minX = Math.min(startPoint.x, currentPoint.x);
  const maxX = Math.max(startPoint.x, currentPoint.x);
  const minY = Math.min(startPoint.y, currentPoint.y);
  const maxY = Math.max(startPoint.y, currentPoint.y);
  return {
    id,
    label: id,
    center_px: {
      x: (minX + maxX) * 0.5,
      y: (minY + maxY) * 0.5,
    },
    width_px: Math.max(maxX - minX, BUILDING_REGION_MIN_SIZE_PX),
    height_px: Math.max(maxY - minY, BUILDING_REGION_MIN_SIZE_PX),
    yaw_deg: 0,
  };
}

export function functionalZonePolygonPoints(zone: AnnotatedFunctionalZone): AnnotationPoint[] {
  return zone.points.length >= 3 ? zone.points : [];
}

export function functionalZoneCentroid(zone: AnnotatedFunctionalZone): AnnotationPoint {
  const points = zone.points;
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  return { x: sumX / points.length, y: sumY / points.length };
}

export function functionalZoneAreaPx2(zone: AnnotatedFunctionalZone): number {
  const points = zone.points;
  if (points.length < 3) {
    return 0;
  }
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) * 0.5;
}

export function centerlineSideStripLayouts(centerline: AnnotatedCenterline): SideStripLayouts {
  const strips =
    resolvedCrossSectionMode(centerline) === CROSS_SECTION_MODE_DETAILED && centerline.cross_section_strips.length > 0
      ? sortedCrossSectionStrips(centerline.cross_section_strips)
      : sortedCrossSectionStrips(seedDetailedCrossSection(centerline));
  const offsets = stripCenterOffsetMeters({
    ...centerline,
    cross_section_strips: strips,
  });
  const result: SideStripLayouts = {
    left: [],
    center: [],
    right: [],
  };
  for (const strip of strips) {
    const bounds = offsets[strip.strip_id];
    if (!bounds) {
      continue;
    }
    const halfWidthM = bounds.widthM * 0.5;
    // Junction geometry follows RoadPen q-bands: left side is positive along
    // the branch left normal. Road strip drawing keeps the older SVG offset.
    const roadPenCenterOffsetM = -bounds.centerOffsetM;
    result[strip.zone].push({
      stripId: strip.strip_id,
      kind: strip.kind,
      direction: strip.direction,
      centerOffsetM: roadPenCenterOffsetM,
      innerOffsetM: roadPenCenterOffsetM - halfWidthM,
      outerOffsetM: roadPenCenterOffsetM + halfWidthM,
    });
  }
  return result;
}


export function facingZoneForCornerTs(
  boundaryCenter: AnnotationPoint,
  normal: AnnotationPoint,
  cornerCenter: AnnotationPoint,
): StripZone {
  const dotValue = (cornerCenter.x - boundaryCenter.x) * normal.x + (cornerCenter.y - boundaryCenter.y) * normal.y;
  return dotValue >= 0 ? "left" : "right";
}

function oppositeSideZoneTs(zone: StripZone): StripZone {
  return zone === "left" ? "right" : zone === "right" ? "left" : zone;
}

export function genericStripOffsetRangeTs(
  arm: {
    carriagewayWidthPx: number;
    nearroadBufferWidthPx: number;
    nearroadFurnishingWidthPx: number;
    clearSidewalkWidthPx: number;
    farfromroadBufferWidthPx: number;
    frontageReserveWidthPx: number;
  },
  kind: StripKind,
  zone: StripZone,
): { centerOffsetPx: number; innerOffsetPx: number; outerOffsetPx: number } | null {
  const sign = zone === "left" ? 1 : -1;
  const halfCarriagewayPx = Math.max(arm.carriagewayWidthPx * 0.5, 0);
  let innerAbsPx: number | null = null;
  let outerAbsPx: number | null = null;
  if (kind === "nearroad_furnishing" && arm.nearroadFurnishingWidthPx > 0) {
    innerAbsPx = halfCarriagewayPx + arm.nearroadBufferWidthPx;
    outerAbsPx = innerAbsPx + arm.nearroadFurnishingWidthPx;
  } else if (kind === "clear_sidewalk" && arm.clearSidewalkWidthPx > 0) {
    innerAbsPx = halfCarriagewayPx + arm.nearroadBufferWidthPx + arm.nearroadFurnishingWidthPx;
    outerAbsPx = innerAbsPx + arm.clearSidewalkWidthPx;
  } else if (kind === "frontage_reserve" && arm.frontageReserveWidthPx > 0) {
    innerAbsPx =
      halfCarriagewayPx +
      arm.nearroadBufferWidthPx +
      arm.nearroadFurnishingWidthPx +
      arm.clearSidewalkWidthPx +
      arm.farfromroadBufferWidthPx;
    outerAbsPx = innerAbsPx + arm.frontageReserveWidthPx;
  }
  if (innerAbsPx === null || outerAbsPx === null) {
    return null;
  }
  return {
    centerOffsetPx: ((innerAbsPx + outerAbsPx) * 0.5) * sign,
    innerOffsetPx: innerAbsPx * sign,
    outerOffsetPx: outerAbsPx * sign,
  };
}

export function orientedOffsetRangeTs(
  range: { centerOffsetPx: number; innerOffsetPx: number; outerOffsetPx: number },
  reverseOffsets: boolean,
): { centerOffsetPx: number; innerOffsetPx: number; outerOffsetPx: number } {
  if (!reverseOffsets) {
    return range;
  }
  return {
    centerOffsetPx: -range.centerOffsetPx,
    innerOffsetPx: -range.outerOffsetPx,
    outerOffsetPx: -range.innerOffsetPx,
  };
}

export function junctionControlPointOffsetsTs(
  strip: {
    centerOffsetM: number;
    innerOffsetM: number;
    outerOffsetM: number;
  },
  reverseOffsets: boolean,
  pixelsPerMeter: number,
): Array<[JunctionOverlayControlPoint["pointKind"], number]> {
  const orientedRange = orientedOffsetRangeTs(
    {
      centerOffsetPx: strip.centerOffsetM * pixelsPerMeter,
      innerOffsetPx: strip.innerOffsetM * pixelsPerMeter,
      outerOffsetPx: strip.outerOffsetM * pixelsPerMeter,
    },
    reverseOffsets,
  );
  return [
    ["center_control_point", orientedRange.centerOffsetPx],
    ["inner_edge_control_point", orientedRange.innerOffsetPx],
    ["outer_edge_control_point", orientedRange.outerOffsetPx],
  ];
}

export function cornerStripOffsetRangeTs(
  arm: {
    sideStripLayouts: SideStripLayouts;
    carriagewayWidthPx: number;
    nearroadBufferWidthPx: number;
    nearroadFurnishingWidthPx: number;
    clearSidewalkWidthPx: number;
    farfromroadBufferWidthPx: number;
    frontageReserveWidthPx: number;
    splitBoundaryCenter: AnnotationPoint;
    normal: AnnotationPoint;
    reverseOffsets: boolean;
  },
  cornerCenter: AnnotationPoint,
  kind: StripKind,
  pixelsPerMeter: number,
): { zone: StripZone; stripId: string | null; centerOffsetPx: number; innerOffsetPx: number; outerOffsetPx: number } | null {
  const branchZone = facingZoneForCornerTs(arm.splitBoundaryCenter, arm.normal, cornerCenter);
  const sourceZone = arm.reverseOffsets ? oppositeSideZoneTs(branchZone) : branchZone;
  const matching = arm.sideStripLayouts[sourceZone].find((item) => item.kind === kind) ?? null;
  if (matching) {
    return {
      zone: sourceZone,
      stripId: matching.stripId,
      ...orientedOffsetRangeTs(
        {
          centerOffsetPx: matching.centerOffsetM * pixelsPerMeter,
          innerOffsetPx: matching.innerOffsetM * pixelsPerMeter,
          outerOffsetPx: matching.outerOffsetM * pixelsPerMeter,
        },
        arm.reverseOffsets,
      ),
    };
  }
  const generic = genericStripOffsetRangeTs(arm, kind, branchZone);
  if (!generic) {
    return null;
  }
  return { zone: branchZone, stripId: null, ...generic };
}

export function pointOnBoundaryWithOffsetTs(
  boundaryCenter: AnnotationPoint,
  normal: AnnotationPoint,
  offsetPx: number,
): AnnotationPoint {
  return {
    x: boundaryCenter.x + normal.x * offsetPx,
    y: boundaryCenter.y + normal.y * offsetPx,
  };
}

const VEHICLE_CENTER_CONNECTOR_KINDS = new Set<StripKind>([
  "drive_lane",
  "bus_lane",
  "bike_lane",
  "parking_lane",
]);

type CenterLaneConnectorRecordTs = {
  arm: DerivedJunctionOverlayArm;
  armIndex: number;
  stripId: string;
  stripKind: StripKind;
  centerOffsetPx: number;
  innerOffsetPx: number;
  outerOffsetPx: number;
  widthPx: number;
  centerPoint: AnnotationPoint;
  nearDistancePx: number;
  farDistancePx: number;
};

function isVehicleCenterConnectorKindTs(kind: StripKind): boolean {
  return VEHICLE_CENTER_CONNECTOR_KINDS.has(kind);
}

function centerLaneConnectorRecordsTs(
  arm: DerivedJunctionOverlayArm,
  armIndex: number,
  pixelsPerMeter: number,
): CenterLaneConnectorRecordTs[] {
  const records: CenterLaneConnectorRecordTs[] = [];
  for (const strip of arm.sideStripLayouts.center) {
    if (!isVehicleCenterConnectorKindTs(strip.kind)) {
      continue;
    }
    const orientedRange = orientedOffsetRangeTs(
      {
        centerOffsetPx: strip.centerOffsetM * pixelsPerMeter,
        innerOffsetPx: strip.innerOffsetM * pixelsPerMeter,
        outerOffsetPx: strip.outerOffsetM * pixelsPerMeter,
      },
      arm.reverseOffsets,
    );
    const widthPx = Math.abs(orientedRange.outerOffsetPx - orientedRange.innerOffsetPx);
    if (widthPx <= 1e-6) {
      continue;
    }
    records.push({
      arm,
      armIndex,
      stripId: strip.stripId,
      stripKind: strip.kind,
      centerOffsetPx: orientedRange.centerOffsetPx,
      innerOffsetPx: orientedRange.innerOffsetPx,
      outerOffsetPx: orientedRange.outerOffsetPx,
      widthPx,
      centerPoint: pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, orientedRange.centerOffsetPx),
      nearDistancePx: 0,
      farDistancePx: widthPx,
    });
  }
  return records;
}

function centerLaneConnectorRecordsFacingCornerTs(
  arm: DerivedJunctionOverlayArm,
  armIndex: number,
  cornerCenter: AnnotationPoint,
  pixelsPerMeter: number,
): CenterLaneConnectorRecordTs[] {
  const edgeOffsetPx = (cornerCenter.x - arm.splitBoundaryCenter.x) * arm.normal.x
    + (cornerCenter.y - arm.splitBoundaryCenter.y) * arm.normal.y;
  const sideSign = edgeOffsetPx >= 0 ? 1 : -1;
  return centerLaneConnectorRecordsTs(arm, armIndex, pixelsPerMeter)
    .filter((record) => Math.abs(record.centerOffsetPx) > 1e-6 && Math.sign(record.centerOffsetPx) === sideSign)
    .map((record) => {
      const distances = [
        Math.abs(record.innerOffsetPx - edgeOffsetPx),
        Math.abs(record.outerOffsetPx - edgeOffsetPx),
      ].sort((a, b) => a - b);
      return {
        ...record,
        nearDistancePx: distances[0],
        farDistancePx: distances[1],
      };
    })
    .sort((a, b) =>
      a.stripKind.localeCompare(b.stripKind)
      || a.nearDistancePx - b.nearDistancePx
      || a.farDistancePx - b.farDistancePx
      || a.stripId.localeCompare(b.stripId),
    );
}

function pairCenterLaneRecordsTs(
  startRecords: CenterLaneConnectorRecordTs[],
  endRecords: CenterLaneConnectorRecordTs[],
  score: (start: CenterLaneConnectorRecordTs, end: CenterLaneConnectorRecordTs) => number,
): Array<[CenterLaneConnectorRecordTs, CenterLaneConnectorRecordTs]> {
  const pairs: Array<[CenterLaneConnectorRecordTs, CenterLaneConnectorRecordTs]> = [];
  const usedEnd = new Set<number>();
  const orderedStart = [...startRecords].sort((a, b) =>
    a.stripKind.localeCompare(b.stripKind)
    || Math.abs(a.centerOffsetPx) - Math.abs(b.centerOffsetPx)
    || a.stripId.localeCompare(b.stripId),
  );
  for (const start of orderedStart) {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < endRecords.length; index += 1) {
      if (usedEnd.has(index)) {
        continue;
      }
      const end = endRecords[index];
      if (end.stripKind !== start.stripKind) {
        continue;
      }
      const candidateScore = score(start, end);
      if (candidateScore < bestScore) {
        bestIndex = index;
        bestScore = candidateScore;
      }
    }
    if (bestIndex < 0) {
      continue;
    }
    usedEnd.add(bestIndex);
    pairs.push([start, endRecords[bestIndex]]);
  }
  return pairs;
}

function pointOnCenterLaneBoundaryTs(record: CenterLaneConnectorRecordTs, offsetPx: number): AnnotationPoint {
  return pointOnBoundaryWithOffsetTs(record.arm.splitBoundaryCenter, record.arm.normal, offsetPx);
}

function carriagewayEnvelopeFromBoundariesTs(
  boundaries: DerivedJunctionOverlayBoundary[],
  anchor: AnnotationPoint,
): AnnotationPoint[] | null {
  void boundaries;
  void anchor;
  // The previous convex mouth envelope made cross junction lanes look
  // diagonally cut. Let callers fall back to the rectangular junction core;
  // the road strips and connector patches provide the arm extension.
  return null;
}

function straightVehicleTurnPatchPointsTs(
  start: CenterLaneConnectorRecordTs,
  end: CenterLaneConnectorRecordTs,
): AnnotationPoint[] {
  const startInner = pointOnCenterLaneBoundaryTs(start, start.innerOffsetPx);
  const startOuter = pointOnCenterLaneBoundaryTs(start, start.outerOffsetPx);
  const endInner = pointOnCenterLaneBoundaryTs(end, end.innerOffsetPx);
  const endOuter = pointOnCenterLaneBoundaryTs(end, end.outerOffsetPx);
  const sameSideScore = pointDistance(startInner, endInner) + pointDistance(startOuter, endOuter);
  const crossedScore = pointDistance(startInner, endOuter) + pointDistance(startOuter, endInner);
  const ring = sameSideScore <= crossedScore
    ? [startInner, endInner, endOuter, startOuter]
    : [startInner, endOuter, endInner, startOuter];
  return dedupeRingPointsTs(ring, 0.05);
}

function vehicleTurnPatchIdTs(connectorId: string): string {
  return connectorId.endsWith("_centerline")
    ? connectorId.replace(/_centerline$/, "_patch")
    : `${connectorId}_patch`;
}

type RoadPenSideStripRangeTs = {
  zone: StripZone;
  stripId: string | null;
  centerOffsetPx: number;
  innerOffsetPx: number;
  outerOffsetPx: number;
};

function stripOffsetRangeForBranchZoneTs(
  arm: DerivedJunctionOverlayArm,
  zone: Extract<StripZone, "left" | "right">,
  kind: StripKind,
  pixelsPerMeter: number,
): RoadPenSideStripRangeTs | null {
  const sourceZone = arm.reverseOffsets ? oppositeSideZoneTs(zone) : zone;
  const matching = arm.sideStripLayouts[sourceZone].find((item) => item.kind === kind) ?? null;
  if (matching) {
    return {
      zone: sourceZone,
      stripId: matching.stripId,
      ...orientedOffsetRangeTs(
        {
          centerOffsetPx: matching.centerOffsetM * pixelsPerMeter,
          innerOffsetPx: matching.innerOffsetM * pixelsPerMeter,
          outerOffsetPx: matching.outerOffsetM * pixelsPerMeter,
        },
        arm.reverseOffsets,
      ),
    };
  }
  const generic = genericStripOffsetRangeTs(arm, kind, zone);
  if (!generic) {
    return null;
  }
  return { zone, stripId: null, ...generic };
}

function maxAbsOffsetTs(range: RoadPenSideStripRangeTs): number {
  return Math.max(Math.abs(range.innerOffsetPx), Math.abs(range.outerOffsetPx));
}

function outerReferenceRangeForZoneTs(
  arm: DerivedJunctionOverlayArm,
  zone: Extract<StripZone, "left" | "right">,
  pixelsPerMeter: number,
): RoadPenSideStripRangeTs | null {
  const ranges = (["frontage_reserve", "clear_sidewalk", "nearroad_furnishing"] as StripKind[])
    .map((kind) => stripOffsetRangeForBranchZoneTs(arm, zone, kind, pixelsPerMeter))
    .filter((range): range is RoadPenSideStripRangeTs => Boolean(range));
  if (ranges.length === 0) {
    return null;
  }
  return ranges.reduce((best, range) => (maxAbsOffsetTs(range) > maxAbsOffsetTs(best) ? range : best));
}

function dotTs(a: AnnotationPoint, b: AnnotationPoint): number {
  return a.x * b.x + a.y * b.y;
}

function crossVecTs(a: AnnotationPoint, b: AnnotationPoint): number {
  return a.x * b.y - a.y * b.x;
}

function addPointTs(a: AnnotationPoint, b: AnnotationPoint): AnnotationPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scalePointTs(point: AnnotationPoint, value: number): AnnotationPoint {
  return { x: point.x * value, y: point.y * value };
}

function ccwGapRadiansTs(arm: DerivedJunctionOverlayArm, nextArm: DerivedJunctionOverlayArm): number {
  const raw = Math.atan2(nextArm.tangent.y, nextArm.tangent.x) - Math.atan2(arm.tangent.y, arm.tangent.x);
  return raw >= 0 ? raw : raw + Math.PI * 2;
}

function canBuildRoadPenConnectorCornerTs(arm: DerivedJunctionOverlayArm, nextArm: DerivedJunctionOverlayArm): boolean {
  const gap = ccwGapRadiansTs(arm, nextArm);
  if (gap <= Math.PI / 12 || gap >= Math.PI * 0.93) {
    return false;
  }
  const gapDot = dotTs(arm.tangent, nextArm.tangent);
  return gapDot > -0.96 && gapDot < Math.cos(Math.PI / 12);
}

function roadPenConnectorDepthTs(rangeA: RoadPenSideStripRangeTs, rangeB: RoadPenSideStripRangeTs): number {
  return clamp(Math.max(maxAbsOffsetTs(rangeA), maxAbsOffsetTs(rangeB)) * 1.5, 18, 42);
}

function roadPenWideConnectorDepthTs(arm: DerivedJunctionOverlayArm, nextArm: DerivedJunctionOverlayArm, ppm: number): number {
  const ranges = [
    outerReferenceRangeForZoneTs(arm, "left", ppm),
    outerReferenceRangeForZoneTs(arm, "right", ppm),
    outerReferenceRangeForZoneTs(nextArm, "left", ppm),
    outerReferenceRangeForZoneTs(nextArm, "right", ppm),
  ].filter((range): range is RoadPenSideStripRangeTs => Boolean(range));
  const maxOffset = Math.max(arm.carriagewayWidthPx * 0.5, nextArm.carriagewayWidthPx * 0.5, ...ranges.map(maxAbsOffsetTs));
  return clamp(maxOffset * 1.65, 36, 92);
}

function roadPenCompactConnectorEllTs(
  arm: DerivedJunctionOverlayArm,
  nextArm: DerivedJunctionOverlayArm,
  referenceA: RoadPenSideStripRangeTs,
  referenceB: RoadPenSideStripRangeTs,
): number {
  const u = scalePointTs(arm.tangent, -1);
  const v = nextArm.tangent;
  const delta = Math.acos(clamp(dotTs(u, v), -1, 1));
  const maxOffset = Math.max(maxAbsOffsetTs(referenceA), maxAbsOffsetTs(referenceB));
  const minRadius = maxOffset + 10 * 0.5;
  const desiredRadius = Math.max(maxOffset * 2 * 2.2, 10);
  const desiredEll = desiredRadius * Math.tan(delta / 2);
  const mouthLimit = roadPenConnectorDepthTs(referenceA, referenceB);
  const minEll = minRadius * Math.tan(delta / 2);
  return clamp(desiredEll, Math.max(10 * 0.6, minEll), Math.max(mouthLimit, minEll));
}

type RoadPenVirtualTurnTs = {
  u: AnnotationPoint;
  v: AnnotationPoint;
  a: AnnotationPoint;
  b: AnnotationPoint;
  delta: number;
  sigma: 1 | -1;
  radiusPx: number;
};

function buildRoadPenVirtualLaneTurnTs(
  anchor: AnnotationPoint,
  arm: DerivedJunctionOverlayArm,
  nextArm: DerivedJunctionOverlayArm,
  referenceA: RoadPenSideStripRangeTs,
  referenceB: RoadPenSideStripRangeTs,
  ellHintPx: number,
): RoadPenVirtualTurnTs | null {
  const u = scalePointTs(arm.tangent, -1);
  const v = nextArm.tangent;
  const delta = Math.acos(clamp(dotTs(u, v), -1, 1));
  const cr = crossVecTs(u, v);
  if (delta <= Math.PI / 36 || Math.abs(cr) <= 1e-9) {
    return null;
  }
  const maxOffset = Math.max(maxAbsOffsetTs(referenceA), maxAbsOffsetTs(referenceB));
  const minRadius = maxOffset + 10 * 0.5;
  const minEll = minRadius * Math.tan(delta / 2);
  const ell = Math.max(ellHintPx, 10 * 0.6, minEll);
  return {
    u,
    v,
    a: addPointTs(anchor, scalePointTs(arm.tangent, ell)),
    b: addPointTs(anchor, scalePointTs(nextArm.tangent, ell)),
    delta,
    sigma: cr >= 0 ? 1 : -1,
    radiusPx: Math.max(ell / Math.max(Math.tan(delta / 2), 1e-9), 10),
  };
}

function sampleRoadPenOffsetTurnCurveTs(turn: RoadPenVirtualTurnTs, qPx: number, samples = 18): AnnotationPoint[] {
  const sampleCount = Math.max(4, Math.floor(samples));
  const radiusQ = turn.radiusPx - turn.sigma * qPx;
  if (radiusQ <= 1e-6) {
    return [];
  }
  const nIn = { x: -turn.u.y, y: turn.u.x };
  const nOut = { x: -turn.v.y, y: turn.v.x };
  const p0 = addPointTs(turn.a, scalePointTs(nIn, qPx));
  const p3 = addPointTs(turn.b, scalePointTs(nOut, qPx));
  const handle = (4 / 3) * radiusQ * Math.tan(turn.delta / 4);
  const p1 = addPointTs(p0, scalePointTs(turn.u, handle));
  const p2 = addPointTs(p3, scalePointTs(turn.v, -handle));
  const points: AnnotationPoint[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    const mt = 1 - t;
    points.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return points;
}

function virtualLaneBoundaryQTs(leftQ: number, rightQ: number): number {
  return (-leftQ + rightQ) * 0.5;
}

function signedBoundsTs(range: RoadPenSideStripRangeTs): { qInner: number; qOuter: number } {
  return {
    qInner: Math.min(range.innerOffsetPx, range.outerOffsetPx),
    qOuter: Math.max(range.innerOffsetPx, range.outerOffsetPx),
  };
}

function buildRoadPenConnectorPatchTs(
  anchor: AnnotationPoint,
  arm: DerivedJunctionOverlayArm,
  rangeA: RoadPenSideStripRangeTs,
  nextArm: DerivedJunctionOverlayArm,
  rangeB: RoadPenSideStripRangeTs,
  referenceA: RoadPenSideStripRangeTs,
  referenceB: RoadPenSideStripRangeTs,
  ellHintPx: number,
): { ring: AnnotationPoint[]; centerLine: AnnotationPoint[]; innerLine: AnnotationPoint[]; outerLine: AnnotationPoint[]; widthPx: number } | null {
  const turn = buildRoadPenVirtualLaneTurnTs(anchor, arm, nextArm, referenceA, referenceB, ellHintPx);
  if (!turn) {
    return null;
  }
  const a = signedBoundsTs(rangeA);
  const b = signedBoundsTs(rangeB);
  const outerQ = virtualLaneBoundaryQTs(a.qOuter, b.qInner);
  const innerQ = virtualLaneBoundaryQTs(a.qInner, b.qOuter);
  const centerQ = virtualLaneBoundaryQTs(rangeA.centerOffsetPx, rangeB.centerOffsetPx);
  const outerCurve = sampleRoadPenOffsetTurnCurveTs(turn, outerQ, 18);
  const innerCurve = sampleRoadPenOffsetTurnCurveTs(turn, innerQ, 18);
  if (outerCurve.length < 4 || innerCurve.length < 4) {
    return null;
  }
  const centerLine = sampleRoadPenOffsetTurnCurveTs(turn, centerQ, 18);
  return {
    ring: dedupeRingPointsTs([...outerCurve, ...innerCurve.slice().reverse()], 0.05),
    centerLine: centerLine.length >= 2 ? centerLine : [turn.a, turn.b],
    innerLine: innerCurve.map((point) => clonePoint(point)),
    outerLine: outerCurve.map((point) => clonePoint(point)),
    widthPx: Math.max(2, (Math.abs(rangeA.outerOffsetPx - rangeA.innerOffsetPx) + Math.abs(rangeB.outerOffsetPx - rangeB.innerOffsetPx)) * 0.5),
  };
}

function buildRoadPenStyleCrossCornerOverlayTs(
  junctionId: string,
  orderedArms: DerivedJunctionOverlayArm[],
  ppm: number,
  anchor: AnnotationPoint,
): {
  fusedCornerStrips: DerivedJunctionOverlayFusedStrip[];
  quadrantCornerKernels: JunctionOverlayCornerKernel[];
  connectorCenterLines: DerivedJunctionOverlayConnectorLine[];
  cornerStripLinks: JunctionOverlayStripLink[];
  cornerFocusPoints: JunctionOverlayCornerFocus[];
  boundaryExtensionLines: JunctionOverlayGuideLine[];
  focusGuideLines: JunctionOverlayGuideLine[];
} {
  const fusedCornerStrips: DerivedJunctionOverlayFusedStrip[] = [];
  const quadrantCornerKernels: JunctionOverlayCornerKernel[] = [];
  const connectorCenterLines: DerivedJunctionOverlayConnectorLine[] = [];
  const cornerStripLinks: JunctionOverlayStripLink[] = [];
  const cornerFocusPoints: JunctionOverlayCornerFocus[] = [];
  const boundaryExtensionLines: JunctionOverlayGuideLine[] = [];
  const focusGuideLines: JunctionOverlayGuideLine[] = [];

  for (let armIndex = 0; armIndex < orderedArms.length; armIndex += 1) {
    const arm = orderedArms[armIndex];
    const nextArm = orderedArms[(armIndex + 1) % orderedArms.length];
    if (!canBuildRoadPenConnectorCornerTs(arm, nextArm)) {
      continue;
    }
    const cornerCenter = lineIntersectionTs(
      arm.splitBoundaryCenter,
      arm.normal,
      nextArm.splitBoundaryCenter,
      nextArm.normal,
    );
    if (!cornerCenter) {
      continue;
    }
    const referenceA = outerReferenceRangeForZoneTs(arm, "left", ppm);
    const referenceB = outerReferenceRangeForZoneTs(nextArm, "right", ppm);
    if (!referenceA || !referenceB) {
      continue;
    }
    const gapRadians = ccwGapRadiansTs(arm, nextArm);
    const ellHintPx = gapRadians <= Math.PI * 0.5
      ? roadPenCompactConnectorEllTs(arm, nextArm, referenceA, referenceB)
      : roadPenWideConnectorDepthTs(arm, nextArm, ppm);
    const quadrantId = `${junctionId}_quadrant_${String(armIndex + 1).padStart(2, "0")}`;
    const kernelId = `${quadrantId}_kernel`;
    let canonicalKernelPoints: AnnotationPoint[] | null = null;

    cornerFocusPoints.push({
      focusId: `${junctionId}_focus_${String(armIndex + 1).padStart(2, "0")}`,
      point: clonePoint(cornerCenter),
    });
    boundaryExtensionLines.push(
      {
        guideId: `${junctionId}_boundary_extension_${String(armIndex + 1).padStart(2, "0")}_a`,
        start: clonePoint(cornerCenter),
        end: clonePoint(arm.splitBoundaryCenter),
      },
      {
        guideId: `${junctionId}_boundary_extension_${String(armIndex + 1).padStart(2, "0")}_b`,
        start: clonePoint(cornerCenter),
        end: clonePoint(nextArm.splitBoundaryCenter),
      },
    );

    for (const spec of [
      { kind: "nearroad_furnishing" as const, patchPrefix: "nearroad" },
      { kind: "clear_sidewalk" as const, patchPrefix: "sidewalk" },
      { kind: "frontage_reserve" as const, patchPrefix: "frontage" },
    ]) {
      const rangeA = stripOffsetRangeForBranchZoneTs(arm, "left", spec.kind, ppm);
      const rangeB = stripOffsetRangeForBranchZoneTs(nextArm, "right", spec.kind, ppm);
      if (!rangeA || !rangeB) {
        continue;
      }
      const patchGeometry = buildRoadPenConnectorPatchTs(
        anchor,
        arm,
        rangeA,
        nextArm,
        rangeB,
        referenceA,
        referenceB,
        ellHintPx,
      );
      if (!patchGeometry || patchGeometry.ring.length < 3) {
        continue;
      }
      const stripId = `${junctionId}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}`;
      const centerLine = patchGeometry.centerLine.map((point) => clonePoint(point));
      if (!canonicalKernelPoints && spec.kind === "clear_sidewalk") {
        canonicalKernelPoints = centerLine.map((point) => clonePoint(point));
      }
      connectorCenterLines.push({
        connectorId: `${stripId}_centerline`,
        linkId: `${stripId}_link`,
        stripKind: spec.kind,
        quadrantId,
        kernelId,
        strokeWidthPx: patchGeometry.widthPx,
        points: centerLine,
        start: rangeA.stripId
          ? {
            centerlineId: arm.centerlineId,
            stripId: rangeA.stripId,
            stripKind: spec.kind,
            stripZone: rangeA.zone,
          }
          : undefined,
        end: rangeB.stripId
          ? {
            centerlineId: nextArm.centerlineId,
            stripId: rangeB.stripId,
            stripKind: spec.kind,
            stripZone: rangeB.zone,
          }
          : undefined,
      });
      fusedCornerStrips.push({
        stripId,
        stripKind: spec.kind,
        quadrantId,
        kernelId,
        widthPx: patchGeometry.widthPx,
        centerLine,
        innerLine: patchGeometry.innerLine.map((point) => clonePoint(point)),
        outerLine: patchGeometry.outerLine.map((point) => clonePoint(point)),
        patch: {
          patchId: stripId,
          points: patchGeometry.ring.map((point) => clonePoint(point)),
        },
      });
      if (rangeA.stripId && rangeB.stripId) {
        cornerStripLinks.push({
          linkId: `${stripId}_link`,
          junctionId,
          quadrantId,
          kernelId,
          stripKind: spec.kind,
          start: {
            centerlineId: arm.centerlineId,
            stripId: rangeA.stripId,
            stripKind: spec.kind,
            stripZone: rangeA.zone,
          },
          end: {
            centerlineId: nextArm.centerlineId,
            stripId: rangeB.stripId,
            stripKind: spec.kind,
            stripZone: rangeB.zone,
          },
          points: centerLine.map((point) => clonePoint(point)),
          strokeWidthPx: patchGeometry.widthPx,
        });
      }
      const start = centerLine[0];
      const end = centerLine[centerLine.length - 1];
      if (start && end) {
        focusGuideLines.push(
          {
            guideId: `${stripId}_center_a`,
            start: clonePoint(cornerCenter),
            end: clonePoint(start),
          },
          {
            guideId: `${stripId}_center_b`,
            start: clonePoint(cornerCenter),
            end: clonePoint(end),
          },
        );
      }
    }

    const kernelPoints = canonicalKernelPoints ?? connectorCenterLines
      .filter((line) => line.quadrantId === quadrantId)[0]?.points
      ?? [];
    if (kernelPoints.length >= 2) {
      quadrantCornerKernels.push({
        kernelId,
        quadrantId,
        junctionId,
        startCenterlineId: arm.centerlineId,
        endCenterlineId: nextArm.centerlineId,
        kernelKind: "polyline_fallback",
        center: clonePoint(cornerCenter),
        radiusPx: 0,
        startHeadingDeg: headingDegForVectorTs(arm.tangent),
        endHeadingDeg: headingDegForVectorTs(nextArm.tangent),
        clockwise: null,
        points: kernelPoints.map((point) => clonePoint(point)),
      });
    }
  }

  return {
    fusedCornerStrips,
    quadrantCornerKernels,
    connectorCenterLines,
    cornerStripLinks,
    cornerFocusPoints,
    boundaryExtensionLines,
    focusGuideLines,
  };
}

function pushVehicleConnectorTs(
  {
    junctionId,
    quadrantId,
    kernelId,
    connectorId,
    linkId,
    start,
    end,
    points,
    patchPoints,
    connectorCenterLines,
    cornerStripLinks,
    vehicleTurnPatches,
  }: {
    junctionId: string;
    quadrantId: string;
    kernelId: string | null;
    connectorId: string;
    linkId: string;
    start: CenterLaneConnectorRecordTs;
    end: CenterLaneConnectorRecordTs;
    points: AnnotationPoint[];
    patchPoints?: AnnotationPoint[];
    connectorCenterLines: DerivedJunctionOverlayConnectorLine[];
    cornerStripLinks: JunctionOverlayStripLink[];
    vehicleTurnPatches?: DerivedJunctionOverlayVehicleTurnPatch[];
  },
): void {
  const dedupedPoints = dedupePolylinePointsTs(points, 0.05);
  if (dedupedPoints.length < 2) {
    return;
  }
  const strokeWidthPx = Math.max(2, (start.widthPx + end.widthPx) * 0.5);
  connectorCenterLines.push({
    connectorId,
    stripKind: start.stripKind,
    quadrantId,
    kernelId,
    linkId,
    start: {
      centerlineId: start.arm.centerlineId,
      stripId: start.stripId,
      stripKind: start.stripKind,
      stripZone: "center",
    },
    end: {
      centerlineId: end.arm.centerlineId,
      stripId: end.stripId,
      stripKind: end.stripKind,
      stripZone: "center",
    },
    strokeWidthPx,
    points: dedupedPoints.map((point) => clonePoint(point)),
  });
  cornerStripLinks.push({
    linkId,
    junctionId,
    quadrantId,
    kernelId,
    stripKind: start.stripKind,
    start: {
      centerlineId: start.arm.centerlineId,
      stripId: start.stripId,
      stripKind: start.stripKind,
      stripZone: "center",
    },
    end: {
      centerlineId: end.arm.centerlineId,
      stripId: end.stripId,
      stripKind: end.stripKind,
      stripZone: "center",
    },
    points: dedupedPoints.map((point) => clonePoint(point)),
    strokeWidthPx,
  });
  const dedupedPatchPoints = patchPoints ? dedupeRingPointsTs(patchPoints, 0.05) : [];
  if (vehicleTurnPatches && dedupedPatchPoints.length >= 3) {
    vehicleTurnPatches.push({
      patchId: vehicleTurnPatchIdTs(connectorId),
      points: dedupedPatchPoints.map((point) => clonePoint(point)),
      stripKind: start.stripKind,
      quadrantId,
      kernelId,
      fromCenterlineId: start.arm.centerlineId,
      fromStripId: start.stripId,
      toCenterlineId: end.arm.centerlineId,
      toStripId: end.stripId,
      strokeWidthPx,
    });
  }
}

function appendStraightVehicleLaneConnectorsTs(
  junctionId: string,
  orderedArms: DerivedJunctionOverlayArm[],
  pixelsPerMeter: number,
  connectorCenterLines: DerivedJunctionOverlayConnectorLine[],
  cornerStripLinks: JunctionOverlayStripLink[],
  vehicleTurnPatches?: DerivedJunctionOverlayVehicleTurnPatch[],
): void {
  if (orderedArms.length < 4) {
    return;
  }
  for (let armIndex = 0; armIndex < Math.floor(orderedArms.length / 2); armIndex += 1) {
    const oppositeIndex = (armIndex + 2) % orderedArms.length;
    const startRecords = centerLaneConnectorRecordsTs(orderedArms[armIndex], armIndex, pixelsPerMeter);
    const endRecords = centerLaneConnectorRecordsTs(orderedArms[oppositeIndex], oppositeIndex, pixelsPerMeter);
    const pairs = pairCenterLaneRecordsTs(
      startRecords,
      endRecords,
      (start, end) => Math.abs(start.centerOffsetPx + end.centerOffsetPx) + Math.abs(start.widthPx - end.widthPx) * 0.25,
    );
    pairs.forEach(([start, end], pairIndex) => {
      const quadrantId = `${junctionId}_straight_${String(armIndex + 1).padStart(2, "0")}_${String(oppositeIndex + 1).padStart(2, "0")}`;
      pushVehicleConnectorTs({
        junctionId,
        quadrantId,
        kernelId: null,
        connectorId: `${quadrantId}_${start.stripKind}_${String(pairIndex + 1).padStart(2, "0")}_centerline`,
        linkId: `${quadrantId}_${start.stripKind}_${String(pairIndex + 1).padStart(2, "0")}_link`,
        start,
        end,
        points: [start.centerPoint, end.centerPoint],
        patchPoints: vehicleTurnPatches ? straightVehicleTurnPatchPointsTs(start, end) : undefined,
        connectorCenterLines,
        cornerStripLinks,
        vehicleTurnPatches,
      });
    });
  }
}

function orderedCornerOffsetsTs(
  boundaryCenter: AnnotationPoint,
  normal: AnnotationPoint,
  cornerCenter: AnnotationPoint,
  innerOffsetPx: number,
  outerOffsetPx: number,
): { nearOffsetPx: number; farOffsetPx: number } {
  const edgeOffsetPx = (cornerCenter.x - boundaryCenter.x) * normal.x + (cornerCenter.y - boundaryCenter.y) * normal.y;
  const offsets = [innerOffsetPx, outerOffsetPx].sort((a, b) => Math.abs(a - edgeOffsetPx) - Math.abs(b - edgeOffsetPx));
  return { nearOffsetPx: offsets[0], farOffsetPx: offsets[1] };
}

function dedupePolylinePointsTs(points: AnnotationPoint[], tolerancePx = 0.1): AnnotationPoint[] {
  const deduped: AnnotationPoint[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (previous && pointDistance(previous, point) <= tolerancePx) {
      continue;
    }
    deduped.push(clonePoint(point));
  }
  if (deduped.length > 2 && pointDistance(deduped[0], deduped[deduped.length - 1]) <= tolerancePx) {
    deduped.pop();
  }
  return deduped;
}

function polylineToBezierTs(points: AnnotationPoint[]): BezierCurve3 {
  const deduped = dedupePolylinePointsTs(points, 0.05);
  const start = deduped[0] ?? { x: 0, y: 0 };
  const end = deduped[deduped.length - 1] ?? start;
  if (deduped.length < 3) {
    return {
      start: clonePoint(start),
      end: clonePoint(end),
      control1: {
        x: start.x + (end.x - start.x) / 3,
        y: start.y + (end.y - start.y) / 3,
      },
      control2: {
        x: start.x + ((end.x - start.x) * 2) / 3,
        y: start.y + ((end.y - start.y) * 2) / 3,
      },
    };
  }
  const midpoint = deduped[Math.floor(deduped.length / 2)];
  const quadraticControl = {
    x: midpoint.x * 2 - (start.x + end.x) * 0.5,
    y: midpoint.y * 2 - (start.y + end.y) * 0.5,
  };
  return {
    start: clonePoint(start),
    end: clonePoint(end),
    control1: {
      x: start.x + ((quadraticControl.x - start.x) * 2) / 3,
      y: start.y + ((quadraticControl.y - start.y) * 2) / 3,
    },
    control2: {
      x: end.x + ((quadraticControl.x - end.x) * 2) / 3,
      y: end.y + ((quadraticControl.y - end.y) * 2) / 3,
    },
  };
}

function averageDistanceToPointTs(points: AnnotationPoint[], target: AnnotationPoint): number {
  if (points.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return points.reduce((sum, point) => sum + pointDistance(point, target), 0) / points.length;
}

function buildCornerBisectorJoinPointTs(
  startPoint: AnnotationPoint,
  endPoint: AnnotationPoint,
  cornerCenter: AnnotationPoint,
  widthPx: number,
): AnnotationPoint {
  const fromCornerToStart = normalizeVector({
    x: startPoint.x - cornerCenter.x,
    y: startPoint.y - cornerCenter.y,
  });
  const fromCornerToEnd = normalizeVector({
    x: endPoint.x - cornerCenter.x,
    y: endPoint.y - cornerCenter.y,
  });
  const bisector = fromCornerToStart && fromCornerToEnd
    ? normalizeVector({
        x: fromCornerToStart.x + fromCornerToEnd.x,
        y: fromCornerToStart.y + fromCornerToEnd.y,
      })
    : null;
  if (!bisector) {
    return midpointTs(startPoint, endPoint);
  }
  const reachPx = Math.min(
    pointDistance(startPoint, cornerCenter),
    pointDistance(endPoint, cornerCenter),
  );
  const minInsetPx = Math.max(widthPx * 0.85, 2);
  const maxInsetPx = Math.max(minInsetPx, reachPx - widthPx * 0.6);
  const insetPx = clamp(reachPx * 0.45, minInsetPx, maxInsetPx);
  return {
    x: cornerCenter.x + bisector.x * insetPx,
    y: cornerCenter.y + bisector.y * insetPx,
  };
}

export function buildFusedCornerStripGeometryTs(
  centerPointA: AnnotationPoint,
  centerPointB: AnnotationPoint,
  cornerCenter: AnnotationPoint,
  widthPxA: number,
  widthPxB: number,
): {
  centerLine: AnnotationPoint[];
  patchPoints: AnnotationPoint[];
  innerPolyline: AnnotationPoint[];
  outerPolyline: AnnotationPoint[];
  widthPx: number;
  innerCurve: BezierCurve3;
  outerCurve: BezierCurve3;
} | null {
  const minWidthPx = Math.max(Math.min(widthPxA, widthPxB), 1);
  const maxWidthPx = Math.max(widthPxA, widthPxB, minWidthPx);
  const widthPx = clamp(
    (widthPxA + widthPxB) * 0.5,
    minWidthPx,
    Math.min(maxWidthPx, minWidthPx + Math.max(minWidthPx * 0.5, 12)),
  );
  const joinPoint = buildCornerBisectorJoinPointTs(centerPointA, centerPointB, cornerCenter, widthPx);
  const centerLine = dedupePolylinePointsTs([centerPointA, joinPoint, centerPointB], 0.05);
  if (centerLine.length < 2) {
    return null;
  }
  const halfWidthPx = Math.max(widthPx * 0.5, 0.5);
  const positiveOffset = dedupePolylinePointsTs(offsetPolyline(centerLine, halfWidthPx), 0.05);
  const negativeOffset = dedupePolylinePointsTs(offsetPolyline(centerLine, -halfWidthPx), 0.05);
  if (positiveOffset.length < 2 || negativeOffset.length < 2) {
    return null;
  }
  const positiveDistance = averageDistanceToPointTs(positiveOffset, cornerCenter);
  const negativeDistance = averageDistanceToPointTs(negativeOffset, cornerCenter);
  const innerPolyline = positiveDistance <= negativeDistance ? positiveOffset : negativeOffset;
  const outerPolyline = positiveDistance <= negativeDistance ? negativeOffset : positiveOffset;
  const patchPoints = dedupePolylinePointsTs(
    [...outerPolyline, ...innerPolyline.slice().reverse()],
    0.05,
  );
  if (patchPoints.length < 3) {
    return null;
  }
  return {
    centerLine,
    patchPoints,
    innerPolyline,
    outerPolyline,
    widthPx,
    innerCurve: polylineToBezierTs(innerPolyline),
    outerCurve: polylineToBezierTs(outerPolyline),
  };
}

export function connectorJoinPointTs(
  pointA: AnnotationPoint,
  tangentA: AnnotationPoint,
  pointB: AnnotationPoint,
  tangentB: AnnotationPoint,
): AnnotationPoint {
  return lineIntersectionTs(pointA, tangentA, pointB, tangentB) ?? {
    x: (pointA.x + pointB.x) * 0.5,
    y: (pointA.y + pointB.y) * 0.5,
  };
}

export function pointAlongVectorTs(
  point: AnnotationPoint,
  vector: AnnotationPoint,
  distance: number,
): AnnotationPoint {
  return {
    x: point.x + vector.x * distance,
    y: point.y + vector.y * distance,
  };
}

export function midpointTs(pointA: AnnotationPoint, pointB: AnnotationPoint): AnnotationPoint {
  return {
    x: (pointA.x + pointB.x) * 0.5,
    y: (pointA.y + pointB.y) * 0.5,
  };
}

export function dotProductTs(a: AnnotationPoint, b: AnnotationPoint): number {
  return a.x * b.x + a.y * b.y;
}

export function subtractPointTs(a: AnnotationPoint, b: AnnotationPoint): AnnotationPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function perpendicularDirectionsTs(direction: AnnotationPoint): [AnnotationPoint, AnnotationPoint] {
  return [
    { x: -direction.y, y: direction.x },
    { x: direction.y, y: -direction.x },
  ];
}

export function headingDegForVectorTs(direction: AnnotationPoint): number {
  return angleDegTs({ x: 0, y: 0 }, direction);
}

export function arcSweepRadiansTs(startAngle: number, endAngle: number, clockwise: boolean): number {
  let sweep = clockwise ? startAngle - endAngle : endAngle - startAngle;
  while (sweep <= 0) {
    sweep += Math.PI * 2;
  }
  return sweep;
}

export function sampleCircularArcPointsTs(
  center: AnnotationPoint,
  radiusPx: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  startPoint: AnnotationPoint,
  endPoint: AnnotationPoint,
  targetSegmentLengthPx: number,
): AnnotationPoint[] {
  const sweep = arcSweepRadiansTs(startAngle, endAngle, clockwise);
  const arcLength = Math.max(radiusPx * sweep, 0);
  let pointCount = Math.ceil(arcLength / Math.max(targetSegmentLengthPx, 1e-6)) + 1;
  pointCount = clamp(pointCount, 8, 24);
  pointCount = Math.max(pointCount, 3);
  const direction = clockwise ? -1 : 1;
  const points: AnnotationPoint[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    const ratio = index / Math.max(pointCount - 1, 1);
    const angle = startAngle + direction * sweep * ratio;
    points.push({
      x: center.x + Math.cos(angle) * radiusPx,
      y: center.y + Math.sin(angle) * radiusPx,
    });
  }
  points[0] = clonePoint(startPoint);
  points[points.length - 1] = clonePoint(endPoint);
  return points;
}

export function fallbackCornerKernelGeometryTs(
  startPoint: AnnotationPoint,
  endPoint: AnnotationPoint,
  startTangent: AnnotationPoint,
  endTangent: AnnotationPoint,
): {
  kernelKind: "polyline_fallback";
  center: AnnotationPoint;
  radiusPx: number;
  startHeadingDeg: number;
  endHeadingDeg: number;
  clockwise: null;
  sampledPoints: AnnotationPoint[];
} {
  const joinPoint = connectorJoinPointTs(startPoint, startTangent, endPoint, endTangent);
  return {
    kernelKind: "polyline_fallback",
    center: clonePoint(joinPoint),
    radiusPx: 0,
    startHeadingDeg: headingDegForVectorTs(startTangent),
    endHeadingDeg: headingDegForVectorTs(endTangent),
    clockwise: null,
    sampledPoints: [clonePoint(startPoint), clonePoint(joinPoint), clonePoint(endPoint)],
  };
}

export function cornerLaneKernelGeometryTs(
  startPoint: AnnotationPoint,
  endPoint: AnnotationPoint,
  startTangent: AnnotationPoint,
  endTangent: AnnotationPoint,
  cornerCenter: AnnotationPoint | null,
  targetSegmentLengthPx: number,
  minRadiusPx: number,
): {
  kernelKind: "circular_arc" | "polyline_fallback";
  center: AnnotationPoint;
  radiusPx: number;
  startHeadingDeg: number;
  endHeadingDeg: number;
  clockwise: boolean | null;
  sampledPoints: AnnotationPoint[];
} {
  const normalizedStart = normalizeVector(startTangent);
  const normalizedEnd = normalizeVector(endTangent);
  const fallback = fallbackCornerKernelGeometryTs(startPoint, endPoint, startTangent, endTangent);
  if (!normalizedStart || !normalizedEnd) {
    return fallback;
  }

  let bestCandidate:
    | {
        score: number;
        center: AnnotationPoint;
        radiusPx: number;
        startAngle: number;
        endAngle: number;
        startHeadingDeg: number;
        endHeadingDeg: number;
        clockwise: boolean;
      }
    | null = null;

  for (const normalStart of perpendicularDirectionsTs(normalizedStart)) {
    for (const normalEnd of perpendicularDirectionsTs(normalizedEnd)) {
      const center = lineIntersectionTs(startPoint, normalStart, endPoint, normalEnd);
      if (!center) {
        continue;
      }
      const radiusStart = pointDistance(center, startPoint);
      const radiusEnd = pointDistance(center, endPoint);
      const radiusPx = (radiusStart + radiusEnd) * 0.5;
      if (radiusPx < minRadiusPx) {
        continue;
      }
      if (Math.abs(radiusStart - radiusEnd) > Math.max(0.05, radiusPx * 0.05)) {
        continue;
      }
      const radialStart = normalizeVector(subtractPointTs(startPoint, center));
      const radialEnd = normalizeVector(subtractPointTs(endPoint, center));
      if (!radialStart || !radialEnd) {
        continue;
      }
      const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
      const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
      const candidates = [
        {
          clockwise: true,
          tangentStart: { x: radialStart.y, y: -radialStart.x },
          tangentEnd: { x: radialEnd.y, y: -radialEnd.x },
        },
        {
          clockwise: false,
          tangentStart: { x: -radialStart.y, y: radialStart.x },
          tangentEnd: { x: -radialEnd.y, y: radialEnd.x },
        },
      ] as const;
      for (const candidate of candidates) {
        const alignStart = Math.abs(dotProductTs(candidate.tangentStart, normalizedStart));
        const alignEnd = Math.abs(dotProductTs(candidate.tangentEnd, normalizedEnd));
        const minAlign = Math.min(alignStart, alignEnd);
        if (minAlign < 0.5) {
          continue;
        }
        const sweep = arcSweepRadiansTs(startAngle, endAngle, candidate.clockwise);
        if (sweep <= 1e-6 || sweep > Math.PI + (5 * Math.PI) / 180) {
          continue;
        }
        const midpointAngle = startAngle + (candidate.clockwise ? -0.5 : 0.5) * sweep;
        const midpoint = {
          x: center.x + Math.cos(midpointAngle) * radiusPx,
          y: center.y + Math.sin(midpointAngle) * radiusPx,
        };
        let score = minAlign * 10 + alignStart + alignEnd - radiusPx * 0.05;
        if (cornerCenter) {
          score -= pointDistance(midpoint, cornerCenter) * 0.5;
        }
        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = {
            score,
            center: clonePoint(center),
            radiusPx,
            startAngle,
            endAngle,
            startHeadingDeg: headingDegForVectorTs(candidate.tangentStart),
            endHeadingDeg: headingDegForVectorTs(candidate.tangentEnd),
            clockwise: candidate.clockwise,
          };
        }
      }
    }
  }

  if (!bestCandidate) {
    return fallback;
  }

  return {
    kernelKind: "circular_arc",
    center: clonePoint(bestCandidate.center),
    radiusPx: bestCandidate.radiusPx,
    startHeadingDeg: bestCandidate.startHeadingDeg,
    endHeadingDeg: bestCandidate.endHeadingDeg,
    clockwise: bestCandidate.clockwise,
    sampledPoints: sampleCircularArcPointsTs(
      bestCandidate.center,
      bestCandidate.radiusPx,
      bestCandidate.startAngle,
      bestCandidate.endAngle,
      bestCandidate.clockwise,
      startPoint,
      endPoint,
      targetSegmentLengthPx,
    ),
  };
}

export function buildCrossCornerOverlayTs(
  junctionId: string,
  orderedArms: DerivedJunctionOverlayArm[],
  ppm: number,
  anchor?: AnnotationPoint,
): {
  fusedCornerStrips: DerivedJunctionOverlayFusedStrip[];
  quadrantCornerKernels: JunctionOverlayCornerKernel[];
  connectorCenterLines: DerivedJunctionOverlayConnectorLine[];
  cornerStripLinks: JunctionOverlayStripLink[];
  vehicleTurnPatches: DerivedJunctionOverlayVehicleTurnPatch[];
  cornerFocusPoints: JunctionOverlayCornerFocus[];
  boundaryExtensionLines: JunctionOverlayGuideLine[];
  focusGuideLines: JunctionOverlayGuideLine[];
} {
  const fusedCornerStrips: DerivedJunctionOverlayFusedStrip[] = [];
  const quadrantCornerKernels: JunctionOverlayCornerKernel[] = [];
  const connectorCenterLines: DerivedJunctionOverlayConnectorLine[] = [];
  const cornerStripLinks: JunctionOverlayStripLink[] = [];
  const vehicleTurnPatches: DerivedJunctionOverlayVehicleTurnPatch[] = [];
  const cornerFocusPoints: JunctionOverlayCornerFocus[] = [];
  const boundaryExtensionLines: JunctionOverlayGuideLine[] = [];
  const focusGuideLines: JunctionOverlayGuideLine[] = [];

  if (anchor) {
    const roadPenStyle = buildRoadPenStyleCrossCornerOverlayTs(junctionId, orderedArms, ppm, anchor);
    if (roadPenStyle.fusedCornerStrips.length > 0) {
      connectorCenterLines.push(...roadPenStyle.connectorCenterLines);
      cornerStripLinks.push(...roadPenStyle.cornerStripLinks);
      appendStraightVehicleLaneConnectorsTs(
        junctionId,
        orderedArms,
        ppm,
        connectorCenterLines,
        cornerStripLinks,
      );
      return {
        fusedCornerStrips: roadPenStyle.fusedCornerStrips,
        quadrantCornerKernels: roadPenStyle.quadrantCornerKernels,
        connectorCenterLines,
        cornerStripLinks,
        vehicleTurnPatches,
        cornerFocusPoints: roadPenStyle.cornerFocusPoints,
        boundaryExtensionLines: roadPenStyle.boundaryExtensionLines,
        focusGuideLines: roadPenStyle.focusGuideLines,
      };
    }
  }

  for (let armIndex = 0; armIndex < orderedArms.length; armIndex += 1) {
    const arm = orderedArms[armIndex];
    const nextArm = orderedArms[(armIndex + 1) % orderedArms.length];
    let sweep = nextArm.angleDeg - arm.angleDeg;
    if (sweep <= 0) {
      sweep += 360;
    }
    if (sweep <= 5 || sweep >= 175) {
      continue;
    }
    const cornerCenter = lineIntersectionTs(
      arm.splitBoundaryCenter,
      arm.normal,
      nextArm.splitBoundaryCenter,
      nextArm.normal,
    );
    if (!cornerCenter) {
      continue;
    }
    const quadrantId = `${junctionId}_quadrant_${String(armIndex + 1).padStart(2, "0")}`;
    const kernelId = `${quadrantId}_kernel`;

    cornerFocusPoints.push({
      focusId: `${junctionId}_focus_${String(armIndex + 1).padStart(2, "0")}`,
      point: clonePoint(cornerCenter),
    });
    boundaryExtensionLines.push(
      {
        guideId: `${junctionId}_boundary_extension_${String(armIndex + 1).padStart(2, "0")}_a`,
        start: clonePoint(cornerCenter),
        end: clonePoint(arm.splitBoundaryCenter),
      },
      {
        guideId: `${junctionId}_boundary_extension_${String(armIndex + 1).padStart(2, "0")}_b`,
        start: clonePoint(cornerCenter),
        end: clonePoint(nextArm.splitBoundaryCenter),
      },
    );

    const targetArcSegmentPx = Math.max(ppm * 0.75, 4);
    const turnRadiusPx = cornerQuadrantFilletTurnRadiusPx(
      arm,
      nextArm,
      cornerCenter,
      ppm,
      targetArcSegmentPx,
      anchor,
    );
    let canonicalKernel: CornerFilletKernelTs | null = null;
    for (const kind of ["clear_sidewalk", "nearroad_furnishing", "frontage_reserve"] as const) {
      const offsetsA = cornerStripOffsetRangeTs(arm, cornerCenter, kind, ppm);
      const offsetsB = cornerStripOffsetRangeTs(nextArm, cornerCenter, kind, ppm);
      if (!offsetsA || !offsetsB) {
        continue;
      }
      canonicalKernel = cornerOffsetFilletKernelTs(
        arm,
        nextArm,
        offsetsA.centerOffsetPx,
        offsetsB.centerOffsetPx,
        turnRadiusPx,
        targetArcSegmentPx,
      );
      if (canonicalKernel) {
        break;
      }
    }
    if (!canonicalKernel || canonicalKernel.sampledPoints.length < 2) {
      continue;
    }
    quadrantCornerKernels.push({
      kernelId,
      quadrantId,
      junctionId,
      startCenterlineId: arm.centerlineId,
      endCenterlineId: nextArm.centerlineId,
      kernelKind: canonicalKernel.kernelKind,
      center: clonePoint(canonicalKernel.center),
      radiusPx: canonicalKernel.radiusPx,
      startHeadingDeg: canonicalKernel.startHeadingDeg,
      endHeadingDeg: canonicalKernel.endHeadingDeg,
      clockwise: canonicalKernel.clockwise,
      points: canonicalKernel.sampledPoints.map((point) => clonePoint(point)),
    });

    for (const spec of [
      { kind: "nearroad_furnishing" as const, patchPrefix: "nearroad" },
      { kind: "clear_sidewalk" as const, patchPrefix: "sidewalk" },
      { kind: "frontage_reserve" as const, patchPrefix: "frontage" },
    ]) {
      const offsetsA = cornerStripOffsetRangeTs(arm, cornerCenter, spec.kind, ppm);
      const offsetsB = cornerStripOffsetRangeTs(nextArm, cornerCenter, spec.kind, ppm);
      if (!offsetsA || !offsetsB) {
        continue;
      }
      const orderedA = orderedCornerOffsetsTs(
        arm.splitBoundaryCenter,
        arm.normal,
        cornerCenter,
        offsetsA.innerOffsetPx,
        offsetsA.outerOffsetPx,
      );
      const orderedB = orderedCornerOffsetsTs(
        nextArm.splitBoundaryCenter,
        nextArm.normal,
        cornerCenter,
        offsetsB.innerOffsetPx,
        offsetsB.outerOffsetPx,
      );
      const stripGeometry = buildCornerFilletRibbonGeometryTs(
        arm,
        nextArm,
        orderedA.nearOffsetPx,
        orderedB.nearOffsetPx,
        orderedA.farOffsetPx,
        orderedB.farOffsetPx,
        turnRadiusPx,
        targetArcSegmentPx,
      );
      const centerKernel = cornerOffsetFilletKernelTs(
        arm,
        nextArm,
        offsetsA.centerOffsetPx,
        offsetsB.centerOffsetPx,
        turnRadiusPx,
        targetArcSegmentPx,
      );
      if (!stripGeometry || stripGeometry.ring.length < 3 || !centerKernel) {
        continue;
      }
      const centerLine = centerKernel.sampledPoints;
      const widthPx = (
        Math.abs(offsetsA.outerOffsetPx - offsetsA.innerOffsetPx) +
        Math.abs(offsetsB.outerOffsetPx - offsetsB.innerOffsetPx)
      ) * 0.5;
      const strokeWidthPx = Math.max(2, widthPx);
      const stripId = `${junctionId}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}`;
      connectorCenterLines.push({
        connectorId: `${stripId}_centerline`,
        stripKind: spec.kind,
        quadrantId,
        kernelId,
        strokeWidthPx,
        points: centerLine.map((point) => clonePoint(point)),
      });
      fusedCornerStrips.push({
        stripId,
        stripKind: spec.kind,
        quadrantId,
        kernelId,
        widthPx,
        centerLine: centerLine.map((point) => clonePoint(point)),
        innerLine: stripGeometry.nearLine.map((point) => clonePoint(point)),
        outerLine: stripGeometry.farLine.map((point) => clonePoint(point)),
        patch: {
          patchId: stripId,
          points: stripGeometry.ring.map((point) => clonePoint(point)),
        },
      });
      if (offsetsA.stripId && offsetsB.stripId) {
        cornerStripLinks.push({
          linkId: `${stripId}_link`,
          junctionId,
          quadrantId,
          kernelId,
          stripKind: spec.kind,
          start: {
            centerlineId: arm.centerlineId,
            stripId: offsetsA.stripId,
            stripKind: spec.kind,
            stripZone: offsetsA.zone,
          },
          end: {
            centerlineId: nextArm.centerlineId,
            stripId: offsetsB.stripId,
            stripKind: spec.kind,
            stripZone: offsetsB.zone,
          },
          points: centerLine.map((point) => clonePoint(point)),
          strokeWidthPx,
        });
      }
      const centerStart = centerLine[0];
      const centerEnd = centerLine[centerLine.length - 1];
      const nearStart = stripGeometry.nearLine[0];
      const nearEnd = stripGeometry.nearLine[stripGeometry.nearLine.length - 1];
      const farStart = stripGeometry.farLine[0];
      const farEnd = stripGeometry.farLine[stripGeometry.farLine.length - 1];
      focusGuideLines.push(
        {
          guideId: `${junctionId}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_center_a`,
          start: clonePoint(cornerCenter),
          end: clonePoint(centerStart),
        },
        {
          guideId: `${junctionId}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_center_b`,
          start: clonePoint(cornerCenter),
          end: clonePoint(centerEnd),
        },
        {
          guideId: `${junctionId}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_inner_a`,
          start: clonePoint(cornerCenter),
          end: clonePoint(nearStart),
        },
        {
          guideId: `${junctionId}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_inner_b`,
          start: clonePoint(cornerCenter),
          end: clonePoint(nearEnd),
        },
        {
          guideId: `${junctionId}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_outer_a`,
          start: clonePoint(cornerCenter),
          end: clonePoint(farStart),
        },
        {
          guideId: `${junctionId}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_outer_b`,
          start: clonePoint(cornerCenter),
          end: clonePoint(farEnd),
        },
      );
    }

    // Vehicle lanes merge through the carriageway envelope. Do not add corner
    // turn surface patches here; they create reversed fan-shaped overdraw at
    // crosses and are only useful as derived debug lines.
  }

  appendStraightVehicleLaneConnectorsTs(
    junctionId,
    orderedArms,
    ppm,
    connectorCenterLines,
    cornerStripLinks,
  );

  return {
    fusedCornerStrips,
    quadrantCornerKernels,
    connectorCenterLines,
    cornerStripLinks,
    vehicleTurnPatches,
    cornerFocusPoints,
    boundaryExtensionLines,
    focusGuideLines,
  };
}

export function buildQuadrantsFromFusedCornerStripsTs(
  fusedCornerStrips: DerivedJunctionOverlayFusedStrip[],
  pixelsPerMeter: number,
): JunctionQuadrantComposition[] {
  const quadrantsById = new Map<string, JunctionQuadrantComposition>();
  for (const strip of fusedCornerStrips) {
    const quadrant = quadrantsById.get(strip.quadrantId) ?? {
      quadrantId: strip.quadrantId,
      armAId: "",
      armBId: "",
      patches: [],
      skeletonLines: [],
    };
    const patch: JunctionQuadrantBezierPatch = {
      patchId: strip.patch.patchId,
      stripKind: strip.stripKind,
      innerCurve: polylineToBezierTs(strip.innerLine),
      outerCurve: polylineToBezierTs(strip.outerLine),
    };
    const skeletonLine: JunctionQuadrantSkeletonLine = {
      lineId: `${strip.stripId}_skeleton`,
      stripKind: strip.stripKind,
      curve: polylineToBezierTs(strip.centerLine),
      widthM: strip.widthPx / Math.max(pixelsPerMeter, 0.0001),
    };
    quadrant.patches = [
      ...quadrant.patches.filter((item) => item.stripKind !== strip.stripKind),
      patch,
    ];
    quadrant.skeletonLines = [
      ...quadrant.skeletonLines.filter((item) => item.stripKind !== strip.stripKind),
      skeletonLine,
    ];
    quadrantsById.set(strip.quadrantId, quadrant);
  }
  return [...quadrantsById.values()].sort((a, b) => a.quadrantId.localeCompare(b.quadrantId));
}

export function shouldTrimOutsideCornerTs(
  kind: "t_junction" | "cross_junction",
  sweepDeg: number,
): boolean {
  void kind;
  return Math.abs(sweepDeg - 90) <= 30;
}

export function cornerConnectorPatchGeometryTs(
  arm: {
    splitBoundaryCenter: AnnotationPoint;
    normal: AnnotationPoint;
    tangent: AnnotationPoint;
  },
  nextArm: {
    splitBoundaryCenter: AnnotationPoint;
    normal: AnnotationPoint;
    tangent: AnnotationPoint;
  },
  offsetsA: { innerOffsetPx: number; outerOffsetPx: number },
  offsetsB: { innerOffsetPx: number; outerOffsetPx: number },
  options: {
    trimOutsideCorner: boolean;
  },
): {
  points: AnnotationPoint[];
  cutoutPoints?: AnnotationPoint[];
} {
  const innerPointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetsA.innerOffsetPx);
  const innerPointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetsB.innerOffsetPx);
  const outerPointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetsA.outerOffsetPx);
  const outerPointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetsB.outerOffsetPx);
  const innerJoin = connectorJoinPointTs(innerPointA, arm.tangent, innerPointB, nextArm.tangent);
  const outerJoin = connectorJoinPointTs(outerPointA, arm.tangent, outerPointB, nextArm.tangent);
  return options.trimOutsideCorner
    ? {
        points: [outerPointA, outerJoin, outerPointB, innerPointB, innerJoin, innerPointA],
        cutoutPoints: [outerPointA, outerJoin, outerPointB],
      }
    : {
        points: [outerPointA, outerJoin, outerPointB, innerPointB, innerJoin, innerPointA],
      };
}

export function deriveExplicitJunctionOverlayGeometries(annotation: ReferenceAnnotation): DerivedJunctionOverlay[] {
  const ppm = Math.max(annotation.pixels_per_meter, 0.0001);
  const overlays: DerivedJunctionOverlay[] = [];
  const tolerancePx = Math.max(ppm * 0.35, 4);
  for (const junction of annotation.junctions) {
    if (junction.source_mode !== "explicit" || junction.connected_centerline_ids.length < 3) {
      continue;
    }
    const anchor = junctionAnchorPoint(junction);
    const arms: Array<{
      centerlineId: string;
      angleDeg: number;
      tangent: AnnotationPoint;
      normal: AnnotationPoint;
      reverseOffsets: boolean;
      carriagewayWidthPx: number;
      nearroadBufferWidthPx: number;
      nearroadFurnishingWidthPx: number;
      clearSidewalkWidthPx: number;
      farfromroadBufferWidthPx: number;
      frontageReserveWidthPx: number;
      sideStripLayouts: SideStripLayouts;
      splitBoundaryCenter: AnnotationPoint;
    }> = [];
    for (const centerlineId of junction.connected_centerline_ids) {
      const centerline = annotation.centerlines.find((item) => item.id === centerlineId);
      if (!centerline || centerline.points.length < 2) {
        continue;
      }
      let neighbor: AnnotationPoint | null = null;
      let reverseOffsets = false;
      if (centerline.start_junction_id === junction.id && pointDistance(centerline.points[0], anchor) <= tolerancePx) {
        neighbor = centerline.points[1];
        reverseOffsets = false;
      } else if (
        centerline.end_junction_id === junction.id &&
        pointDistance(centerline.points[centerline.points.length - 1], anchor) <= tolerancePx
      ) {
        neighbor = centerline.points[centerline.points.length - 2];
        reverseOffsets = true;
      } else {
        const startDistance = pointDistance(centerline.points[0], anchor);
        const endDistance = pointDistance(centerline.points[centerline.points.length - 1], anchor);
        if (startDistance <= endDistance && startDistance <= tolerancePx) {
          neighbor = centerline.points[1];
          reverseOffsets = false;
        } else if (endDistance < startDistance && endDistance <= tolerancePx) {
          neighbor = centerline.points[centerline.points.length - 2];
          reverseOffsets = true;
        }
      }
      if (!neighbor) {
        continue;
      }
      const armLengthPx = pointDistance(anchor, neighbor);
      if (armLengthPx <= 1e-6) {
        continue;
      }
      const tangent = {
        x: (neighbor.x - anchor.x) / armLengthPx,
        y: (neighbor.y - anchor.y) / armLengthPx,
      };
      const widths = junctionProfileWidths(centerline);
      arms.push({
        centerlineId: centerline.id,
        angleDeg: angleDegTs(anchor, neighbor),
        tangent,
        normal: { x: -tangent.y, y: tangent.x },
        reverseOffsets,
        carriagewayWidthPx: widths.carriagewayWidthM * ppm,
        nearroadBufferWidthPx: widths.nearroadBufferWidthM * ppm,
        nearroadFurnishingWidthPx: widths.nearroadFurnishingWidthM * ppm,
        clearSidewalkWidthPx: widths.clearSidewalkWidthM * ppm,
        farfromroadBufferWidthPx: widths.farfromroadBufferWidthM * ppm,
        frontageReserveWidthPx: widths.frontageReserveWidthM * ppm,
        sideStripLayouts: centerlineSideStripLayouts(centerline),
        splitBoundaryCenter: { ...anchor },
      });
    }
    if (arms.length < 3) {
      continue;
    }
    const kind = junction.kind === "cross_junction" || junction.kind === "t_junction"
      ? junction.kind
      : classifyDerivedJunctionKind(arms.map((arm) => arm.angleDeg));
    if (kind !== "t_junction" && kind !== "cross_junction") {
      continue;
    }

    let axisSource = arms[0]?.tangent ?? { x: 1, y: 0 };
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < arms.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < arms.length; otherIndex += 1) {
        const score = Math.abs(angleDistanceDegTs(arms[index].angleDeg, arms[otherIndex].angleDeg) - 180);
        if (score < bestScore) {
          bestScore = score;
          axisSource = arms[index].tangent;
        }
      }
    }
    const axisLength = Math.max(Math.hypot(axisSource.x, axisSource.y), 1e-6);
    const axisU = { x: axisSource.x / axisLength, y: axisSource.y / axisLength };
    const axisV = { x: -axisU.y, y: axisU.x };
    const axisUAngle = angleDegTs({ x: 0, y: 0 }, axisU);
    const armsOnU: typeof arms = [];
    const armsOnV: typeof arms = [];
    for (const arm of arms) {
      const alongU = axisDistanceDegTs(arm.angleDeg, axisUAngle);
      const alongV = axisDistanceDegTs(arm.angleDeg, axisUAngle + 90);
      if (alongV + 1e-6 < alongU) {
        armsOnV.push(arm);
      } else {
        armsOnU.push(arm);
      }
    }
    const maxHalfWidth = (items: typeof arms, fallback: typeof arms): number => {
      const source = items.length > 0 ? items : fallback;
      return Math.max(...source.map((arm) => Math.max(arm.carriagewayWidthPx * 0.5, 1)));
    };
    const halfUPx = maxHalfWidth(armsOnV, arms);
    const halfVPx = maxHalfWidth(armsOnU, arms);
    const core = [
      { x: anchor.x - axisU.x * halfUPx - axisV.x * halfVPx, y: anchor.y - axisU.y * halfUPx - axisV.y * halfVPx },
      { x: anchor.x - axisU.x * halfUPx + axisV.x * halfVPx, y: anchor.y - axisU.y * halfUPx + axisV.y * halfVPx },
      { x: anchor.x + axisU.x * halfUPx + axisV.x * halfVPx, y: anchor.y + axisU.y * halfUPx + axisV.y * halfVPx },
      { x: anchor.x + axisU.x * halfUPx - axisV.x * halfVPx, y: anchor.y + axisU.y * halfUPx - axisV.y * halfVPx },
    ];

    const approachBoundaries: DerivedJunctionOverlayBoundary[] = [];
    const crosswalks: DerivedJunctionOverlayPatch[] = [];
    const skeletonFootPoints: JunctionOverlayFootPoint[] = [];
    const subLaneControlPoints: JunctionOverlayControlPoint[] = [];
    for (let armIndex = 0; armIndex < arms.length; armIndex += 1) {
      const arm = arms[armIndex];
      const dotU = Math.abs(arm.tangent.x * axisU.x + arm.tangent.y * axisU.y);
      const dotV = Math.abs(arm.tangent.x * axisV.x + arm.tangent.y * axisV.y);
      const coreExitDistancePx = Math.max(
        Math.min(
          dotU > 1e-6 ? halfUPx / dotU : Number.POSITIVE_INFINITY,
          dotV > 1e-6 ? halfVPx / dotV : Number.POSITIVE_INFINITY,
        ),
        1,
      );
      const splitDistancePx = coreExitDistancePx + junction.crosswalk_depth_m * ppm;
      const boundaryCenter = {
        x: anchor.x + arm.tangent.x * splitDistancePx,
        y: anchor.y + arm.tangent.y * splitDistancePx,
      };
      arm.splitBoundaryCenter = boundaryCenter;
      const halfWidth = Math.max(arm.carriagewayWidthPx * 0.5, 1);
      approachBoundaries.push({
        boundaryId: `${junction.id}_approach_${String(armIndex + 1).padStart(2, "0")}`,
        centerlineId: arm.centerlineId,
        start: {
          x: boundaryCenter.x - arm.normal.x * halfWidth,
          y: boundaryCenter.y - arm.normal.y * halfWidth,
        },
        end: {
          x: boundaryCenter.x + arm.normal.x * halfWidth,
          y: boundaryCenter.y + arm.normal.y * halfWidth,
        },
        center: boundaryCenter,
        exitDistancePx: splitDistancePx,
      });
      skeletonFootPoints.push({
        footId: `${junction.id}_foot_${String(armIndex + 1).padStart(2, "0")}`,
        centerlineId: arm.centerlineId,
        point: boundaryCenter,
      });
      for (const zone of ["left", "right"] as StripZone[]) {
        for (const strip of arm.sideStripLayouts[zone]) {
          const pointKinds: Array<[JunctionOverlayControlPoint["pointKind"], number]> = [
            ["station_foot_point", 0],
            ...junctionControlPointOffsetsTs(strip, arm.reverseOffsets, ppm),
          ];
          for (const [pointKind, offsetPx] of pointKinds) {
            subLaneControlPoints.push({
              controlId: `${junction.id}_${arm.centerlineId}_${strip.stripId}_${zone}_${pointKind}`,
              centerlineId: arm.centerlineId,
              stripId: strip.stripId,
              stripKind: strip.kind,
              stripZone: zone,
              pointKind,
              point: {
                x: boundaryCenter.x + arm.normal.x * offsetPx,
                y: boundaryCenter.y + arm.normal.y * offsetPx,
              },
            });
          }
        }
      }
      for (const strip of arm.sideStripLayouts.center) {
        for (const [pointKind, offsetPx] of junctionControlPointOffsetsTs(strip, arm.reverseOffsets, ppm)) {
          subLaneControlPoints.push({
            controlId: `${junction.id}_${arm.centerlineId}_${strip.stripId}_center_${pointKind}`,
            centerlineId: arm.centerlineId,
            stripId: strip.stripId,
            stripKind: strip.kind,
            stripZone: "center",
            pointKind,
            point: {
              x: boundaryCenter.x + arm.normal.x * offsetPx,
              y: boundaryCenter.y + arm.normal.y * offsetPx,
            },
          });
        }
      }
      const crosswalkCenter = {
        x: anchor.x + arm.tangent.x * (coreExitDistancePx + junction.crosswalk_depth_m * ppm * 0.5),
        y: anchor.y + arm.tangent.y * (coreExitDistancePx + junction.crosswalk_depth_m * ppm * 0.5),
      };
      crosswalks.push({
        patchId: `${junction.id}_crosswalk_${String(armIndex + 1).padStart(2, "0")}`,
        points: rectanglePolygonPoints(
          crosswalkCenter,
          arm.tangent,
          arm.normal,
          junction.crosswalk_depth_m * ppm,
          arm.carriagewayWidthPx,
        ),
      });
    }

    const carriagewayCore = carriagewayEnvelopeFromBoundariesTs(approachBoundaries, anchor)
      ?? core.map((point) => clonePoint(point));
    const orderedArms = [...arms].sort((a, b) => a.angleDeg - b.angleDeg);
    const sidewalkCorners: DerivedJunctionOverlayPatch[] = [];
    const nearroadCorners: DerivedJunctionOverlayPatch[] = [];
    const frontageCorners: DerivedJunctionOverlayPatch[] = [];
    const fusedCornerStrips: DerivedJunctionOverlayFusedStrip[] = [];
    const quadrantCornerKernels: JunctionOverlayCornerKernel[] = [];
    const connectorCenterLines: DerivedJunctionOverlayConnectorLine[] = [];
    const cornerStripLinks: JunctionOverlayStripLink[] = [];
    const vehicleTurnPatches: DerivedJunctionOverlayVehicleTurnPatch[] = [];
    const cornerFocusPoints: JunctionOverlayCornerFocus[] = [];
    const boundaryExtensionLines: JunctionOverlayGuideLine[] = [];
    const focusGuideLines: JunctionOverlayGuideLine[] = [];
    if (kind === "cross_junction") {
      const crossCornerData = buildCrossCornerOverlayTs(junction.id, orderedArms, ppm, anchor);
      fusedCornerStrips.push(...crossCornerData.fusedCornerStrips);
      quadrantCornerKernels.push(...crossCornerData.quadrantCornerKernels);
      connectorCenterLines.push(...crossCornerData.connectorCenterLines);
      cornerStripLinks.push(...crossCornerData.cornerStripLinks);
      vehicleTurnPatches.push(...crossCornerData.vehicleTurnPatches);
      cornerFocusPoints.push(...crossCornerData.cornerFocusPoints);
      boundaryExtensionLines.push(...crossCornerData.boundaryExtensionLines);
      focusGuideLines.push(...crossCornerData.focusGuideLines);
      for (const strip of crossCornerData.fusedCornerStrips) {
        if (strip.stripKind === "nearroad_furnishing") {
          nearroadCorners.push(strip.patch);
        } else if (strip.stripKind === "clear_sidewalk") {
          sidewalkCorners.push(strip.patch);
        } else if (strip.stripKind === "frontage_reserve") {
          frontageCorners.push(strip.patch);
        }
      }
    } else {
      for (let armIndex = 0; armIndex < orderedArms.length; armIndex += 1) {
        const arm = orderedArms[armIndex];
        const nextArm = orderedArms[(armIndex + 1) % orderedArms.length];
        let sweep = nextArm.angleDeg - arm.angleDeg;
        if (sweep <= 0) {
          sweep += 360;
        }
        if (sweep <= 5 || sweep >= 175) {
          continue;
        }
        const cornerCenter = lineIntersectionTs(arm.splitBoundaryCenter, arm.normal, nextArm.splitBoundaryCenter, nextArm.normal);
        if (!cornerCenter) {
          continue;
        }
        const trimOutsideCorner = shouldTrimOutsideCornerTs(kind, sweep);
        const quadrantId = `${junction.id}_corner_${String(armIndex + 1).padStart(2, "0")}`;
        cornerFocusPoints.push({
          focusId: `${junction.id}_focus_${String(armIndex + 1).padStart(2, "0")}`,
          point: cornerCenter,
        });
        boundaryExtensionLines.push(
          {
            guideId: `${junction.id}_boundary_extension_${String(armIndex + 1).padStart(2, "0")}_a`,
            start: cornerCenter,
            end: arm.splitBoundaryCenter,
          },
          {
            guideId: `${junction.id}_boundary_extension_${String(armIndex + 1).padStart(2, "0")}_b`,
            start: cornerCenter,
            end: nextArm.splitBoundaryCenter,
          },
        );
        for (const spec of [
          { kind: "nearroad_furnishing" as const, bucket: nearroadCorners, patchPrefix: "nearroad" },
          { kind: "clear_sidewalk" as const, bucket: sidewalkCorners, patchPrefix: "sidewalk" },
          { kind: "frontage_reserve" as const, bucket: frontageCorners, patchPrefix: "frontage" },
        ]) {
          const offsetsA = cornerStripOffsetRangeTs(arm, cornerCenter, spec.kind, ppm);
          const offsetsB = cornerStripOffsetRangeTs(nextArm, cornerCenter, spec.kind, ppm);
          if (!offsetsA || !offsetsB) {
            continue;
          }
          const centerPointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetsA.centerOffsetPx);
          const centerPointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetsB.centerOffsetPx);
          const innerPointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetsA.innerOffsetPx);
          const innerPointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetsB.innerOffsetPx);
          const outerPointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetsA.outerOffsetPx);
          const outerPointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetsB.outerOffsetPx);
          const strokeWidthPx = Math.max(
            2,
            (Math.abs(offsetsA.outerOffsetPx - offsetsA.innerOffsetPx) + Math.abs(offsetsB.outerOffsetPx - offsetsB.innerOffsetPx)) * 0.5,
          );
          const linePoints = [centerPointA, connectorJoinPointTs(centerPointA, arm.tangent, centerPointB, nextArm.tangent), centerPointB];
          connectorCenterLines.push({
            connectorId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_centerline`,
            stripKind: spec.kind,
            quadrantId,
            kernelId: null,
            strokeWidthPx,
            points: linePoints.map((point) => clonePoint(point)),
          });
          if (offsetsA.stripId && offsetsB.stripId) {
            cornerStripLinks.push({
              linkId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_link`,
              junctionId: junction.id,
              quadrantId,
              kernelId: null,
              stripKind: spec.kind,
              start: {
                centerlineId: arm.centerlineId,
                stripId: offsetsA.stripId,
                stripKind: spec.kind,
                stripZone: offsetsA.zone,
              },
              end: {
                centerlineId: nextArm.centerlineId,
                stripId: offsetsB.stripId,
                stripKind: spec.kind,
                stripZone: offsetsB.zone,
              },
              points: linePoints.map((point) => clonePoint(point)),
              strokeWidthPx,
            });
          }
          focusGuideLines.push(
            {
              guideId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_center_a`,
              start: cornerCenter,
              end: centerPointA,
            },
            {
              guideId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_center_b`,
              start: cornerCenter,
              end: centerPointB,
            },
            {
              guideId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_inner_a`,
              start: cornerCenter,
              end: innerPointA,
            },
            {
              guideId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_inner_b`,
              start: cornerCenter,
              end: innerPointB,
            },
            {
              guideId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_outer_a`,
              start: cornerCenter,
              end: outerPointA,
            },
            {
              guideId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}_outer_b`,
              start: cornerCenter,
              end: outerPointB,
            },
          );
          const patchGeometry = cornerConnectorPatchGeometryTs(arm, nextArm, offsetsA, offsetsB, {
            trimOutsideCorner,
          });
          if (patchGeometry && patchGeometry.points.length > 0) {
            spec.bucket.push({
              patchId: `${junction.id}_${spec.patchPrefix}_${String(armIndex + 1).padStart(2, "0")}`,
              points: patchGeometry.points,
              cutoutPoints: patchGeometry.cutoutPoints,
            });
          }
        }
      }
    }

    overlays.push({
      junctionId: junction.id,
      kind,
      sourceMode: "explicit",
      core,
      carriagewayCore,
      crosswalks,
      sidewalkCorners,
      nearroadCorners,
      frontageCorners,
      fusedCornerStrips,
      vehicleTurnPatches,
      approachBoundaries,
      anchor,
      armCount: arms.length,
      connectedCenterlineIds: [...junction.connected_centerline_ids],
      skeletonFootPoints,
      subLaneControlPoints,
      cornerFocusPoints,
      boundaryExtensionLines,
      focusGuideLines,
      quadrantCornerKernels,
      connectorCenterLines,
      cornerStripLinks,
    });
  }
  return overlays;
}

export function deriveLegacyJunctionOverlayGeometries(
  annotation: ReferenceAnnotation,
  previewCenterlines: AnnotatedCenterline[] = [],
): DerivedJunctionOverlay[] {
  const allCenterlines = [...annotation.centerlines, ...previewCenterlines];
  const tolerancePx = Math.max(annotation.pixels_per_meter * 0.35, 4);
  const clusters: Array<{
    point: AnnotationPoint;
    count: number;
    members: Array<{ centerline: AnnotatedCenterline; vertexIndex: number; points: AnnotationPoint[] }>;
  }> = [];

  for (const centerline of allCenterlines) {
    for (let vertexIndex = 0; vertexIndex < centerline.points.length; vertexIndex += 1) {
      const point = centerline.points[vertexIndex];
      let matched = clusters.find((cluster) => pointDistance(cluster.point, point) <= tolerancePx) ?? null;
      if (!matched) {
        matched = { point: { ...point }, count: 0, members: [] };
        clusters.push(matched);
      }
      const count = matched.count + 1;
      matched.point = {
        x: (matched.point.x * matched.count + point.x) / count,
        y: (matched.point.y * matched.count + point.y) / count,
      };
      matched.count = count;
      matched.members.push({
        centerline,
        vertexIndex,
        points: centerline.points.map((item) => ({ ...item })),
      });
    }
  }

  const overlays: DerivedJunctionOverlay[] = [];
  for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
    const cluster = clusters[clusterIndex];
    const uniqueCenterlineIds = new Set(cluster.members.map((member) => member.centerline.id));
    if (uniqueCenterlineIds.size < 2) {
      continue;
    }
    const anchor = cluster.point;
    const arms: Array<{
      centerlineId: string;
      angleDeg: number;
      tangent: AnnotationPoint;
      normal: AnnotationPoint;
      reverseOffsets: boolean;
      carriagewayWidthPx: number;
      nearroadBufferWidthPx: number;
      nearroadFurnishingWidthPx: number;
      clearSidewalkWidthPx: number;
      farfromroadBufferWidthPx: number;
      frontageReserveWidthPx: number;
      sideStripLayouts: SideStripLayouts;
      splitBoundaryCenter: AnnotationPoint;
    }> = [];
    const seenArmKeys = new Set<string>();
    for (const member of cluster.members) {
      const { centerline, vertexIndex, points } = member;
      const widths = junctionProfileWidths(centerline);
      for (const neighborIndex of [vertexIndex - 1, vertexIndex + 1]) {
        if (neighborIndex < 0 || neighborIndex >= points.length) {
          continue;
        }
        const neighbor = points[neighborIndex];
        const lengthPx = pointDistance(anchor, neighbor);
        if (lengthPx <= Math.max(tolerancePx * 0.25, 1)) {
          continue;
        }
        const armKey = `${centerline.id}:${Math.round(neighbor.x * 100)}:${Math.round(neighbor.y * 100)}`;
        if (seenArmKeys.has(armKey)) {
          continue;
        }
        seenArmKeys.add(armKey);
        const tangent = {
          x: (neighbor.x - anchor.x) / lengthPx,
          y: (neighbor.y - anchor.y) / lengthPx,
        };
        arms.push({
          centerlineId: centerline.id,
          angleDeg: angleDegTs(anchor, neighbor),
          tangent,
          normal: { x: -tangent.y, y: tangent.x },
          reverseOffsets: neighborIndex < vertexIndex,
          carriagewayWidthPx: widths.carriagewayWidthM * annotation.pixels_per_meter,
          nearroadBufferWidthPx: widths.nearroadBufferWidthM * annotation.pixels_per_meter,
          nearroadFurnishingWidthPx: widths.nearroadFurnishingWidthM * annotation.pixels_per_meter,
          clearSidewalkWidthPx: widths.clearSidewalkWidthM * annotation.pixels_per_meter,
          farfromroadBufferWidthPx: widths.farfromroadBufferWidthM * annotation.pixels_per_meter,
          frontageReserveWidthPx: widths.frontageReserveWidthM * annotation.pixels_per_meter,
          sideStripLayouts: centerlineSideStripLayouts(centerline),
          splitBoundaryCenter: { ...anchor },
        });
      }
    }
    const kind = classifyDerivedJunctionKind(arms.map((arm) => arm.angleDeg));
    if (kind !== "t_junction" && kind !== "cross_junction") {
      continue;
    }

    let axisSource = arms[0]?.tangent ?? { x: 1, y: 0 };
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < arms.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < arms.length; otherIndex += 1) {
        const score = Math.abs(angleDistanceDegTs(arms[index].angleDeg, arms[otherIndex].angleDeg) - 180);
        if (score < bestScore) {
          bestScore = score;
          axisSource = arms[index].tangent;
        }
      }
    }
    const axisLength = Math.max(Math.hypot(axisSource.x, axisSource.y), 1e-6);
    const axisU = { x: axisSource.x / axisLength, y: axisSource.y / axisLength };
    const axisV = { x: -axisU.y, y: axisU.x };
    const axisUAngle = angleDegTs({ x: 0, y: 0 }, axisU);
    const armsOnU: typeof arms = [];
    const armsOnV: typeof arms = [];
    for (const arm of arms) {
      const alongU = axisDistanceDegTs(arm.angleDeg, axisUAngle);
      const alongV = axisDistanceDegTs(arm.angleDeg, axisUAngle + 90);
      if (alongV + 1e-6 < alongU) {
        armsOnV.push(arm);
      } else {
        armsOnU.push(arm);
      }
    }
    const maxHalfWidth = (items: typeof arms, fallback: typeof arms): number => {
      const source = items.length > 0 ? items : fallback;
      return Math.max(...source.map((arm) => Math.max(arm.carriagewayWidthPx * 0.5, 1)));
    };
    const halfUPx = maxHalfWidth(armsOnV, arms);
    const halfVPx = maxHalfWidth(armsOnU, arms);
    const core = [
      { x: anchor.x - axisU.x * halfUPx - axisV.x * halfVPx, y: anchor.y - axisU.y * halfUPx - axisV.y * halfVPx },
      { x: anchor.x - axisU.x * halfUPx + axisV.x * halfVPx, y: anchor.y - axisU.y * halfUPx + axisV.y * halfVPx },
      { x: anchor.x + axisU.x * halfUPx + axisV.x * halfVPx, y: anchor.y + axisU.y * halfUPx + axisV.y * halfVPx },
      { x: anchor.x + axisU.x * halfUPx - axisV.x * halfVPx, y: anchor.y + axisU.y * halfUPx - axisV.y * halfVPx },
    ];

    const approachBoundaries: DerivedJunctionOverlayBoundary[] = [];
    const crosswalks: DerivedJunctionOverlayPatch[] = [];
    const skeletonFootPoints: JunctionOverlayFootPoint[] = [];
    const subLaneControlPoints: JunctionOverlayControlPoint[] = [];
    const crosswalkDepthPx = annotation.pixels_per_meter * 3;
    for (let armIndex = 0; armIndex < arms.length; armIndex += 1) {
      const arm = arms[armIndex];
      const dotU = Math.abs(arm.tangent.x * axisU.x + arm.tangent.y * axisU.y);
      const dotV = Math.abs(arm.tangent.x * axisV.x + arm.tangent.y * axisV.y);
      const coreExitDistancePx = Math.max(
        Math.min(
          dotU > 1e-6 ? halfUPx / dotU : Number.POSITIVE_INFINITY,
          dotV > 1e-6 ? halfVPx / dotV : Number.POSITIVE_INFINITY,
        ),
        1,
      );
      const splitDistancePx = coreExitDistancePx + crosswalkDepthPx;
      const boundaryCenter = {
        x: anchor.x + arm.tangent.x * splitDistancePx,
        y: anchor.y + arm.tangent.y * splitDistancePx,
      };
      arm.splitBoundaryCenter = boundaryCenter;
      const halfWidth = Math.max(arm.carriagewayWidthPx * 0.5, 1);
      approachBoundaries.push({
        boundaryId: `junction_overlay_${clusterIndex + 1}_boundary_${armIndex + 1}`,
        centerlineId: arm.centerlineId,
        start: {
          x: boundaryCenter.x - arm.normal.x * halfWidth,
          y: boundaryCenter.y - arm.normal.y * halfWidth,
        },
        end: {
          x: boundaryCenter.x + arm.normal.x * halfWidth,
          y: boundaryCenter.y + arm.normal.y * halfWidth,
        },
        center: boundaryCenter,
        exitDistancePx: splitDistancePx,
      });
      skeletonFootPoints.push({
        footId: `junction_overlay_${clusterIndex + 1}_foot_${armIndex + 1}`,
        centerlineId: arm.centerlineId,
        point: boundaryCenter,
      });
      for (const zone of ["left", "right"] as StripZone[]) {
        for (const strip of arm.sideStripLayouts[zone]) {
          const pointKinds: Array<[JunctionOverlayControlPoint["pointKind"], number]> = [
            ["station_foot_point", 0],
            ...junctionControlPointOffsetsTs(strip, arm.reverseOffsets, annotation.pixels_per_meter),
          ];
          for (const [pointKind, offsetPx] of pointKinds) {
            subLaneControlPoints.push({
              controlId: `junction_overlay_${clusterIndex + 1}_${arm.centerlineId}_${strip.stripId}_${zone}_${pointKind}`,
              centerlineId: arm.centerlineId,
              stripId: strip.stripId,
              stripKind: strip.kind,
              stripZone: zone,
              pointKind,
              point: {
                x: boundaryCenter.x + arm.normal.x * offsetPx,
                y: boundaryCenter.y + arm.normal.y * offsetPx,
              },
            });
          }
        }
      }
      for (const strip of arm.sideStripLayouts.center) {
        for (const [pointKind, offsetPx] of junctionControlPointOffsetsTs(
          strip,
          arm.reverseOffsets,
          annotation.pixels_per_meter,
        )) {
          subLaneControlPoints.push({
            controlId: `junction_overlay_${clusterIndex + 1}_${arm.centerlineId}_${strip.stripId}_center_${pointKind}`,
            centerlineId: arm.centerlineId,
            stripId: strip.stripId,
            stripKind: strip.kind,
            stripZone: "center",
            pointKind,
            point: {
              x: boundaryCenter.x + arm.normal.x * offsetPx,
              y: boundaryCenter.y + arm.normal.y * offsetPx,
            },
          });
        }
      }
      const crosswalkCenter = {
        x: anchor.x + arm.tangent.x * (coreExitDistancePx + crosswalkDepthPx * 0.5),
        y: anchor.y + arm.tangent.y * (coreExitDistancePx + crosswalkDepthPx * 0.5),
      };
      crosswalks.push({
        patchId: `junction_overlay_${clusterIndex + 1}_crosswalk_${armIndex + 1}`,
        points: rectanglePolygonPoints(
          crosswalkCenter,
          arm.tangent,
          arm.normal,
          crosswalkDepthPx,
          arm.carriagewayWidthPx,
        ),
      });
    }

    const carriagewayCore = carriagewayEnvelopeFromBoundariesTs(approachBoundaries, anchor)
      ?? core.map((point) => clonePoint(point));
    const orderedArms = [...arms].sort((a, b) => a.angleDeg - b.angleDeg);
    const sidewalkCorners: DerivedJunctionOverlayPatch[] = [];
    const nearroadCorners: DerivedJunctionOverlayPatch[] = [];
    const frontageCorners: DerivedJunctionOverlayPatch[] = [];
    const fusedCornerStrips: DerivedJunctionOverlayFusedStrip[] = [];
    const quadrantCornerKernels: JunctionOverlayCornerKernel[] = [];
    const connectorCenterLines: DerivedJunctionOverlayConnectorLine[] = [];
    const cornerStripLinks: JunctionOverlayStripLink[] = [];
    const vehicleTurnPatches: DerivedJunctionOverlayVehicleTurnPatch[] = [];
    const cornerFocusPoints: JunctionOverlayCornerFocus[] = [];
    const boundaryExtensionLines: JunctionOverlayGuideLine[] = [];
    const focusGuideLines: JunctionOverlayGuideLine[] = [];
    const overlayJunctionId = `junction_overlay_${String(clusterIndex + 1).padStart(2, "0")}`;
    if (kind === "cross_junction") {
      const crossCornerData = buildCrossCornerOverlayTs(overlayJunctionId, orderedArms, annotation.pixels_per_meter, anchor);
      fusedCornerStrips.push(...crossCornerData.fusedCornerStrips);
      quadrantCornerKernels.push(...crossCornerData.quadrantCornerKernels);
      connectorCenterLines.push(...crossCornerData.connectorCenterLines);
      cornerStripLinks.push(...crossCornerData.cornerStripLinks);
      vehicleTurnPatches.push(...crossCornerData.vehicleTurnPatches);
      cornerFocusPoints.push(...crossCornerData.cornerFocusPoints);
      boundaryExtensionLines.push(...crossCornerData.boundaryExtensionLines);
      focusGuideLines.push(...crossCornerData.focusGuideLines);
      for (const strip of crossCornerData.fusedCornerStrips) {
        if (strip.stripKind === "nearroad_furnishing") {
          nearroadCorners.push(strip.patch);
        } else if (strip.stripKind === "clear_sidewalk") {
          sidewalkCorners.push(strip.patch);
        } else if (strip.stripKind === "frontage_reserve") {
          frontageCorners.push(strip.patch);
        }
      }
    } else {
      for (let armIndex = 0; armIndex < orderedArms.length; armIndex += 1) {
        const arm = orderedArms[armIndex];
        const nextArm = orderedArms[(armIndex + 1) % orderedArms.length];
        let sweep = nextArm.angleDeg - arm.angleDeg;
        if (sweep <= 0) {
          sweep += 360;
        }
        if (sweep <= 5 || sweep >= 175) {
          continue;
        }
        const cornerCenter = lineIntersectionTs(arm.splitBoundaryCenter, arm.normal, nextArm.splitBoundaryCenter, nextArm.normal);
        if (!cornerCenter) {
          continue;
        }
        const trimOutsideCorner = shouldTrimOutsideCornerTs(kind, sweep);
        const quadrantId = `${overlayJunctionId}_corner_${String(armIndex + 1).padStart(2, "0")}`;
        cornerFocusPoints.push({
          focusId: `junction_overlay_${clusterIndex + 1}_focus_${armIndex + 1}`,
          point: cornerCenter,
        });
        boundaryExtensionLines.push(
          {
            guideId: `junction_overlay_${clusterIndex + 1}_boundary_extension_${armIndex + 1}_a`,
            start: cornerCenter,
            end: arm.splitBoundaryCenter,
          },
          {
            guideId: `junction_overlay_${clusterIndex + 1}_boundary_extension_${armIndex + 1}_b`,
            start: cornerCenter,
            end: nextArm.splitBoundaryCenter,
          },
        );
        for (const spec of [
          { kind: "nearroad_furnishing" as const, bucket: nearroadCorners, patchPrefix: "nearroad" },
          { kind: "clear_sidewalk" as const, bucket: sidewalkCorners, patchPrefix: "sidewalk" },
          { kind: "frontage_reserve" as const, bucket: frontageCorners, patchPrefix: "frontage" },
        ]) {
          const offsetsA = cornerStripOffsetRangeTs(arm, cornerCenter, spec.kind, annotation.pixels_per_meter);
          const offsetsB = cornerStripOffsetRangeTs(nextArm, cornerCenter, spec.kind, annotation.pixels_per_meter);
          if (!offsetsA || !offsetsB) {
            continue;
          }
          const centerPointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetsA.centerOffsetPx);
          const centerPointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetsB.centerOffsetPx);
          const innerPointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetsA.innerOffsetPx);
          const innerPointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetsB.innerOffsetPx);
          const outerPointA = pointOnBoundaryWithOffsetTs(arm.splitBoundaryCenter, arm.normal, offsetsA.outerOffsetPx);
          const outerPointB = pointOnBoundaryWithOffsetTs(nextArm.splitBoundaryCenter, nextArm.normal, offsetsB.outerOffsetPx);
          const strokeWidthPx = Math.max(
            2,
            (Math.abs(offsetsA.outerOffsetPx - offsetsA.innerOffsetPx) + Math.abs(offsetsB.outerOffsetPx - offsetsB.innerOffsetPx)) * 0.5,
          );
          const linePoints = [centerPointA, connectorJoinPointTs(centerPointA, arm.tangent, centerPointB, nextArm.tangent), centerPointB];
          connectorCenterLines.push({
            connectorId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}_centerline`,
            stripKind: spec.kind,
            quadrantId,
            kernelId: null,
            strokeWidthPx,
            points: linePoints.map((point) => clonePoint(point)),
          });
          if (offsetsA.stripId && offsetsB.stripId) {
            cornerStripLinks.push({
              linkId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}_link`,
              junctionId: overlayJunctionId,
              quadrantId,
              kernelId: null,
              stripKind: spec.kind,
              start: {
                centerlineId: arm.centerlineId,
                stripId: offsetsA.stripId,
                stripKind: spec.kind,
                stripZone: offsetsA.zone,
              },
              end: {
                centerlineId: nextArm.centerlineId,
                stripId: offsetsB.stripId,
                stripKind: spec.kind,
                stripZone: offsetsB.zone,
              },
              points: linePoints.map((point) => clonePoint(point)),
              strokeWidthPx,
            });
          }
          focusGuideLines.push(
            {
              guideId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}_center_a`,
              start: cornerCenter,
              end: centerPointA,
            },
            {
              guideId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}_center_b`,
              start: cornerCenter,
              end: centerPointB,
            },
            {
              guideId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}_inner_a`,
              start: cornerCenter,
              end: innerPointA,
            },
            {
              guideId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}_inner_b`,
              start: cornerCenter,
              end: innerPointB,
            },
            {
              guideId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}_outer_a`,
              start: cornerCenter,
              end: outerPointA,
            },
            {
              guideId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}_outer_b`,
              start: cornerCenter,
              end: outerPointB,
            },
          );
          const patchGeometry = cornerConnectorPatchGeometryTs(arm, nextArm, offsetsA, offsetsB, {
            trimOutsideCorner,
          });
          if (patchGeometry && patchGeometry.points.length > 0) {
            spec.bucket.push({
              patchId: `junction_overlay_${clusterIndex + 1}_${spec.patchPrefix}_${armIndex + 1}`,
              points: patchGeometry.points,
              cutoutPoints: patchGeometry.cutoutPoints,
            });
          }
        }
      }
    }

    overlays.push({
      junctionId: overlayJunctionId,
      kind,
      sourceMode: "derived",
      core,
      carriagewayCore,
      crosswalks,
      sidewalkCorners,
      nearroadCorners,
      frontageCorners,
      fusedCornerStrips,
      vehicleTurnPatches,
      approachBoundaries,
      anchor: { ...anchor },
      armCount: arms.length,
      connectedCenterlineIds: [...new Set(arms.map((arm) => arm.centerlineId))],
      skeletonFootPoints,
      subLaneControlPoints,
      cornerFocusPoints,
      boundaryExtensionLines,
      focusGuideLines,
      quadrantCornerKernels,
      connectorCenterLines,
      cornerStripLinks,
    });
  }
  return overlays;
}

export function deriveJunctionOverlayGeometries(
  annotation: ReferenceAnnotation,
  previewCenterlines: AnnotatedCenterline[] = [],
): DerivedJunctionOverlay[] {
  const explicitOverlays = previewCenterlines.length === 0 ? deriveExplicitJunctionOverlayGeometries(annotation) : [];
  const legacyOverlays = deriveLegacyJunctionOverlayGeometries(annotation, previewCenterlines).filter((overlay) =>
    !explicitOverlays.some((item) => pointDistance(item.anchor, overlay.anchor) <= Math.max(annotation.pixels_per_meter * 0.5, 6)),
  );
  return [...explicitOverlays, ...legacyOverlays];
}

export function derivedJunctionKindLabel(kind: "t_junction" | "cross_junction"): string {
  return kind === "cross_junction" ? "Cross Junction" : "T Junction";
}

export function getJunctionOverlay(
  annotation: ReferenceAnnotation,
  junctionId: string,
): DerivedJunctionOverlay | null {
  return deriveJunctionOverlayGeometries(annotation).find((item) => item.junctionId === junctionId) ?? null;
}

export function stripDisplayPoint(
  centerline: AnnotatedCenterline,
  stripId: string,
  stationPx: number,
  lateralPx = 0,
  pixelsPerMeter: number,
): AnnotationPoint | null {
  const offsets = stripCenterOffsetMeters(centerline);
  const strip = offsets[stripId];
  if (!strip) {
    return null;
  }
  const sample = stationToPolylinePoint(centerline.points, stationPx);
  const offsetPx = (strip.centerOffsetM * pixelsPerMeter) + lateralPx;
  return {
    x: sample.point.x + sample.leftNormal.x * offsetPx,
    y: sample.point.y + sample.leftNormal.y * offsetPx,
  };
}

// ------------------------------------------------------------------
// Bezier curve utilities for Junction Composer
// ------------------------------------------------------------------

export function sampleBezierPoints(curve: BezierCurve3, segmentCount: number): AnnotationPoint[] {
  const points: AnnotationPoint[] = [];
  const n = Math.max(2, segmentCount);
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const u = 1 - t;
    const u2 = u * u;
    const u3 = u2 * u;
    const t2 = t * t;
    const t3 = t2 * t;
    const x = u3 * curve.start.x + 3 * u2 * t * curve.control1.x + 3 * u * t2 * curve.control2.x + t3 * curve.end.x;
    const y = u3 * curve.start.y + 3 * u2 * t * curve.control1.y + 3 * u * t2 * curve.control2.y + t3 * curve.end.y;
    points.push({ x, y });
  }
  return points;
}

export function bezierPathD(curve: BezierCurve3): string {
  return `M ${curve.start.x.toFixed(2)},${curve.start.y.toFixed(2)} C ${curve.control1.x.toFixed(2)},${curve.control1.y.toFixed(2)} ${curve.control2.x.toFixed(2)},${curve.control2.y.toFixed(2)} ${curve.end.x.toFixed(2)},${curve.end.y.toFixed(2)}`;
}

/**
 * Approximate a circular arc with a cubic Bezier curve.
 * center: arc center in px
 * radiusPx: arc radius in px
 * startAngleRad: start angle in radians
 * endAngleRad: end angle in radians
 * clockwise: direction
 */
export function arcToBezier(
  center: AnnotationPoint,
  radiusPx: number,
  startAngleRad: number,
  endAngleRad: number,
  clockwise: boolean,
): BezierCurve3 {
  const r = Math.max(radiusPx, 1e-6);
  let sweep = clockwise ? startAngleRad - endAngleRad : endAngleRad - startAngleRad;
  while (sweep <= 0) {
    sweep += Math.PI * 2;
  }
  // If sweep is > 90°, we only return the first 90° segment. Caller can subdivide if needed.
  // For junction corners, sweep is ~90° so this is fine.
  const theta = Math.min(sweep, Math.PI / 2);

  const start = {
    x: center.x + r * Math.cos(startAngleRad),
    y: center.y + r * Math.sin(startAngleRad),
  };
  const end = {
    x: center.x + r * Math.cos(startAngleRad + (clockwise ? -theta : theta)),
    y: center.y + r * Math.sin(startAngleRad + (clockwise ? -theta : theta)),
  };

  const k = (4 / 3) * Math.tan(theta / 4);
  const a1 = startAngleRad;
  const a2 = startAngleRad + (clockwise ? -theta : theta);

  const control1 = {
    x: center.x + r * (Math.cos(a1) - k * Math.sin(a1)),
    y: center.y + r * (Math.sin(a1) + k * Math.cos(a1)),
  };
  const control2 = {
    x: center.x + r * (Math.cos(a2) + k * Math.sin(a2)),
    y: center.y + r * (Math.sin(a2) - k * Math.cos(a2)),
  };

  if (clockwise) {
    // When clockwise, the control-point tangent signs need to be swapped
    // compared to the standard counter-clockwise formula above.
    // Recompute with correct signs for clockwise.
    const ck = (4 / 3) * Math.tan(theta / 4);
    return {
      start,
      end,
      control1: {
        x: center.x + r * (Math.cos(a1) + ck * Math.sin(a1)),
        y: center.y + r * (Math.sin(a1) - ck * Math.cos(a1)),
      },
      control2: {
        x: center.x + r * (Math.cos(a2) - ck * Math.sin(a2)),
        y: center.y + r * (Math.sin(a2) + ck * Math.cos(a2)),
      },
    };
  }

  return { start, end, control1, control2 };
}

export function cloneBezier(curve: BezierCurve3): BezierCurve3 {
  return {
    start: clonePoint(curve.start),
    end: clonePoint(curve.end),
    control1: clonePoint(curve.control1),
    control2: clonePoint(curve.control2),
  };
}

export function translateBezier(curve: BezierCurve3, dx: number, dy: number): BezierCurve3 {
  return {
    start: { x: curve.start.x + dx, y: curve.start.y + dy },
    end: { x: curve.end.x + dx, y: curve.end.y + dy },
    control1: { x: curve.control1.x + dx, y: curve.control1.y + dy },
    control2: { x: curve.control2.x + dx, y: curve.control2.y + dy },
  };
}

export function pointOnBezier(curve: BezierCurve3, t: number): AnnotationPoint {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: u3 * curve.start.x + 3 * u2 * t * curve.control1.x + 3 * u * t2 * curve.control2.x + t3 * curve.end.x,
    y: u3 * curve.start.y + 3 * u2 * t * curve.control1.y + 3 * u * t2 * curve.control2.y + t3 * curve.end.y,
  };
}

export function evaluateBezierTangent(curve: BezierCurve3, t: number): AnnotationPoint {
  const u = 1 - t;
  const dx =
    3 * u * u * (curve.control1.x - curve.start.x) +
    6 * u * t * (curve.control2.x - curve.control1.x) +
    3 * t * t * (curve.end.x - curve.control2.x);
  const dy =
    3 * u * u * (curve.control1.y - curve.start.y) +
    6 * u * t * (curve.control2.y - curve.control1.y) +
    3 * t * t * (curve.end.y - curve.control2.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}
