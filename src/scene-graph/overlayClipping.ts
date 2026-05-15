import type { AnnotatedCenterline, AnnotationPoint, ClippedDisplaySegment, DerivedJunctionOverlay } from "../sg-types";
import { clonePoint, offsetPolyline, pointDistance } from "../sg-utils";

function dedupeAdjacentDisplayPoints(points: AnnotationPoint[]): AnnotationPoint[] {
  const deduped: AnnotationPoint[] = [];
  for (const point of points) {
    if (!deduped.length || pointDistance(deduped[deduped.length - 1], point) > 1e-3) {
      deduped.push(clonePoint(point));
    }
  }
  return deduped;
}

function junctionOverlayTolerancePx(pixelsPerMeter: number): number {
  return Math.max(pixelsPerMeter * 0.35, 4);
}

function selectClipPointForNeighbor(
  vertex: AnnotationPoint,
  neighbor: AnnotationPoint,
  candidates: AnnotationPoint[],
): AnnotationPoint | null {
  const directionX = neighbor.x - vertex.x;
  const directionY = neighbor.y - vertex.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength <= 1e-6) {
    return null;
  }
  let bestScore = -Infinity;
  let bestPoint: AnnotationPoint | null = null;
  for (const candidate of candidates) {
    const clipX = candidate.x - vertex.x;
    const clipY = candidate.y - vertex.y;
    const clipLength = Math.hypot(clipX, clipY);
    if (clipLength <= 1e-6) {
      continue;
    }
    const score =
      (directionX / directionLength) * (clipX / clipLength) +
      (directionY / directionLength) * (clipY / clipLength);
    if (score > 0.5 && score > bestScore) {
      bestScore = score;
      bestPoint = clonePoint(candidate);
    }
  }
  return bestPoint;
}

function skeletonClipPointForNeighbor(
  centerline: AnnotatedCenterline,
  vertex: AnnotationPoint,
  neighbor: AnnotationPoint,
  junctionOverlays: DerivedJunctionOverlay[],
  pixelsPerMeter: number,
): AnnotationPoint | null {
  const tolerancePx = junctionOverlayTolerancePx(pixelsPerMeter);
  const candidates: AnnotationPoint[] = [];
  for (const overlay of junctionOverlays) {
    if (pointDistance(overlay.anchor, vertex) > tolerancePx) {
      continue;
    }
    for (const footPoint of overlay.skeletonFootPoints) {
      if (footPoint.centerlineId === centerline.id) {
        candidates.push(footPoint.point);
      }
    }
  }
  return selectClipPointForNeighbor(vertex, neighbor, candidates);
}

function stripClipPointForNeighbor(
  centerline: AnnotatedCenterline,
  stripId: string,
  vertex: AnnotationPoint,
  neighbor: AnnotationPoint,
  junctionOverlays: DerivedJunctionOverlay[],
  pixelsPerMeter: number,
): AnnotationPoint | null {
  const tolerancePx = junctionOverlayTolerancePx(pixelsPerMeter);
  const candidates: AnnotationPoint[] = [];
  for (const overlay of junctionOverlays) {
    if (pointDistance(overlay.anchor, vertex) > tolerancePx) {
      continue;
    }
    for (const controlPoint of overlay.subLaneControlPoints) {
      if (
        controlPoint.centerlineId === centerline.id &&
        controlPoint.stripId === stripId &&
        controlPoint.pointKind === "center_control_point"
      ) {
        candidates.push(controlPoint.point);
      }
    }
  }
  return selectClipPointForNeighbor(vertex, neighbor, candidates);
}

function baseCenterlineDisplaySegments(
  centerline: AnnotatedCenterline,
  junctionOverlays: DerivedJunctionOverlay[],
  pixelsPerMeter: number,
): AnnotationPoint[][] {
  const points = centerline.points.map((point) => clonePoint(point));
  if (points.length < 2) {
    return [];
  }
  const tolerancePx = junctionOverlayTolerancePx(pixelsPerMeter);
  const segments: AnnotationPoint[][] = [];
  let currentSegment: AnnotationPoint[] = [clonePoint(points[0])];
  for (let index = 1; index < points.length; index += 1) {
    currentSegment.push(clonePoint(points[index]));
    const isInternalVertex = index > 0 && index < points.length - 1;
    const shouldSplit =
      isInternalVertex &&
      junctionOverlays.some(
        (overlay) =>
          pointDistance(overlay.anchor, points[index]) <= tolerancePx &&
          overlay.skeletonFootPoints.filter((item) => item.centerlineId === centerline.id).length >= 2,
      );
    if (!shouldSplit) {
      continue;
    }
    const dedupedSegment = dedupeAdjacentDisplayPoints(currentSegment);
    if (dedupedSegment.length >= 2) {
      segments.push(dedupedSegment);
    }
    currentSegment = [clonePoint(points[index])];
  }
  const dedupedSegment = dedupeAdjacentDisplayPoints(currentSegment);
  if (dedupedSegment.length >= 2) {
    segments.push(dedupedSegment);
  }
  return segments;
}

function clippedCenterlineDisplaySegments(
  centerline: AnnotatedCenterline,
  junctionOverlays: DerivedJunctionOverlay[],
  pixelsPerMeter: number,
): ClippedDisplaySegment[] {
  return baseCenterlineDisplaySegments(centerline, junctionOverlays, pixelsPerMeter)
    .map((segment) => {
      const clipped = segment.map((point) => clonePoint(point));
      const startClip = skeletonClipPointForNeighbor(centerline, segment[0], segment[1], junctionOverlays, pixelsPerMeter);
      const endClip = skeletonClipPointForNeighbor(
        centerline,
        segment[segment.length - 1],
        segment[segment.length - 2],
        junctionOverlays,
        pixelsPerMeter,
      );
      if (startClip) {
        clipped[0] = startClip;
      }
      if (endClip) {
        clipped[clipped.length - 1] = endClip;
      }
      const points = dedupeAdjacentDisplayPoints(clipped);
      return {
        points,
        clippedStart: startClip !== null,
        clippedEnd: endClip !== null,
      };
    })
    .filter((segment) => segment.points.length >= 2);
}

function clippedStripDisplaySegments(
  centerline: AnnotatedCenterline,
  stripId: string,
  centerOffsetM: number,
  pixelsPerMeter: number,
  junctionOverlays: DerivedJunctionOverlay[],
): ClippedDisplaySegment[] {
  return baseCenterlineDisplaySegments(centerline, junctionOverlays, pixelsPerMeter)
    .map((segment) => {
      const offsetPoints = offsetPolyline(segment, centerOffsetM * pixelsPerMeter);
      if (offsetPoints.length < 2) {
        return null;
      }
      const startClip = stripClipPointForNeighbor(
        centerline,
        stripId,
        segment[0],
        segment[1],
        junctionOverlays,
        pixelsPerMeter,
      );
      const endClip = stripClipPointForNeighbor(
        centerline,
        stripId,
        segment[segment.length - 1],
        segment[segment.length - 2],
        junctionOverlays,
        pixelsPerMeter,
      );
      if (startClip) {
        offsetPoints[0] = startClip;
      }
      if (endClip) {
        offsetPoints[offsetPoints.length - 1] = endClip;
      }
      const points = dedupeAdjacentDisplayPoints(offsetPoints);
      if (points.length < 2) {
        return null;
      }
      return {
        points,
        clippedStart: startClip !== null,
        clippedEnd: endClip !== null,
      };
    })
    .filter((segment): segment is ClippedDisplaySegment => segment !== null);
}

export { clippedCenterlineDisplaySegments, clippedStripDisplaySegments };
