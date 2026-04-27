import type {
  AnnotationPoint,
  BezierCurve3,
  JunctionArmKey,
  JunctionLaneSurface,
  JunctionMergedSurface,
  JunctionSurfaceEdge,
  JunctionSurfaceNode,
  JunctionSurfaceNodeKind,
  SurfaceFlow,
  SurfaceEdgeKind,
} from "./sg-types";
import polygonClipping, { type MultiPolygon as PolygonClippingMultiPolygon, type Ring as PolygonClippingRing } from "polygon-clipping";
import { cloneBezier, sampleBezierPoints } from "./sg-geometry";
import { clonePoint } from "./sg-utils";

export type LaneSurfaceBindingSeed = {
  surfaceId: string;
  laneId: string;
  armKey: JunctionArmKey;
  flow: SurfaceFlow;
  laneIndex: number;
  laneWidthM: number;
  skeletonId: string;
  startLocal: AnnotationPoint;
  endLocal: AnnotationPoint;
};

type SurfaceLike = {
  nodes: JunctionSurfaceNode[];
  edges: JunctionSurfaceEdge[];
};

type RebuildMergedSurfaceMetadata = {
  mergedFromSurfaceIds: string[];
  mergedFromLaneIds: string[];
};

export type SurfaceNearestNodePair = {
  nodeAId: string;
  nodeBId: string;
  pointA: AnnotationPoint;
  pointB: AnnotationPoint;
  distance: number;
};

export type SurfaceMergePreview = {
  nearestPair: SurfaceNearestNodePair;
  connectorWidthM: number;
  connectorRing: AnnotationPoint[];
};

const MIN_MERGE_CONNECTOR_WIDTH_M = 0.25;
const MAX_MERGE_CONNECTOR_WIDTH_M = 0.85;
const DEFAULT_MERGE_CONNECTOR_WIDTH_M = 0.5;

function lerp(a: AnnotationPoint, b: AnnotationPoint, t: number): AnnotationPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function subtract(a: AnnotationPoint, b: AnnotationPoint): AnnotationPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: AnnotationPoint, b: AnnotationPoint): AnnotationPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(point: AnnotationPoint, factor: number): AnnotationPoint {
  return { x: point.x * factor, y: point.y * factor };
}

function length(point: AnnotationPoint): number {
  return Math.hypot(point.x, point.y);
}

function normalize(point: AnnotationPoint): AnnotationPoint {
  const len = length(point);
  if (len <= 1e-6) {
    return { x: 1, y: 0 };
  }
  return scale(point, 1 / len);
}

function perpendicular(point: AnnotationPoint): AnnotationPoint {
  return { x: -point.y, y: point.x };
}

function clampNumber(value: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, value));
}

function axisForArm(armKey: JunctionArmKey): AnnotationPoint {
  switch (armKey) {
    case "north":
      return { x: 0, y: -1 };
    case "east":
      return { x: 1, y: 0 };
    case "south":
      return { x: 0, y: 1 };
    case "west":
      return { x: -1, y: 0 };
  }
}

function makeLineCurve(start: AnnotationPoint, end: AnnotationPoint): BezierCurve3 {
  return {
    start: clonePoint(start),
    end: clonePoint(end),
    control1: lerp(start, end, 1 / 3),
    control2: lerp(start, end, 2 / 3),
  };
}

function edgeCurveKindFromNodePositions(_start: AnnotationPoint, _end: AnnotationPoint): SurfaceEdgeKind {
  return "line";
}

function createSurfaceNode(nodeId: string, kind: JunctionSurfaceNodeKind, point: AnnotationPoint): JunctionSurfaceNode {
  return {
    nodeId,
    kind,
    point: clonePoint(point),
  };
}

function createSurfaceEdge(edgeId: string, startNodeId: string, endNodeId: string, start: AnnotationPoint, end: AnnotationPoint): JunctionSurfaceEdge {
  return {
    edgeId,
    startNodeId,
    endNodeId,
    kind: edgeCurveKindFromNodePositions(start, end),
    curve: makeLineCurve(start, end),
  };
}

export function cloneLaneSurface<T extends SurfaceLike>(surface: T): T {
  return JSON.parse(JSON.stringify(surface)) as T;
}

export function surfaceIdForBinding(seed: LaneSurfaceBindingSeed): string {
  return `lane_surface_${seed.armKey}_${seed.flow}_${String(seed.laneIndex + 1).padStart(2, "0")}`;
}

export function buildDefaultLaneSurface(seed: LaneSurfaceBindingSeed): JunctionLaneSurface {
  const travelStart = seed.flow === "inbound" ? seed.startLocal : seed.endLocal;
  const travelEnd = seed.flow === "inbound" ? seed.endLocal : seed.startLocal;
  const travelDelta = subtract(travelEnd, travelStart);
  const travelAxis = length(travelDelta) <= 1e-6 ? axisForArm(seed.armKey) : normalize(travelDelta);
  const normal = perpendicular(travelAxis);
  const halfWidth = Math.max(seed.laneWidthM * 0.5, 0.05);

  const startLeft = add(travelStart, scale(normal, halfWidth));
  const startRight = add(travelStart, scale(normal, -halfWidth));
  const endRight = add(travelEnd, scale(normal, -halfWidth));
  const endLeft = add(travelEnd, scale(normal, halfWidth));

  const nodeIds = [
    `${seed.surfaceId}_start_left`,
    `${seed.surfaceId}_start_right`,
    `${seed.surfaceId}_end_right`,
    `${seed.surfaceId}_end_left`,
  ];
  const nodes = [
    createSurfaceNode(nodeIds[0], "start_left", startLeft),
    createSurfaceNode(nodeIds[1], "start_right", startRight),
    createSurfaceNode(nodeIds[2], "end_right", endRight),
    createSurfaceNode(nodeIds[3], "end_left", endLeft),
  ];
  const edges = buildClosedSurfaceEdges(seed.surfaceId, nodes);

  return {
    surfaceId: seed.surfaceId,
    laneId: seed.laneId,
    armKey: seed.armKey,
    flow: seed.flow,
    laneIndex: seed.laneIndex,
    laneWidthM: seed.laneWidthM,
    skeletonId: seed.skeletonId,
    provenance: "generated",
    nodes,
    edges,
  };
}

export function buildClosedSurfaceEdges(surfaceId: string, nodes: JunctionSurfaceNode[]): JunctionSurfaceEdge[] {
  if (nodes.length < 2) {
    return [];
  }

  const edges: JunctionSurfaceEdge[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const start = nodes[index];
    const end = nodes[(index + 1) % nodes.length];
    edges.push(createSurfaceEdge(`${surfaceId}_edge_${String(index + 1).padStart(2, "0")}`, start.nodeId, end.nodeId, start.point, end.point));
  }
  return edges;
}

export function surfacePathD(surface: SurfaceLike): string {
  if (surface.nodes.length === 0) {
    return "";
  }

  let d = `M ${surface.nodes[0].point.x.toFixed(2)},${surface.nodes[0].point.y.toFixed(2)}`;
  for (const edge of surface.edges) {
    if (edge.kind === "bezier") {
      d += ` C ${edge.curve.control1.x.toFixed(2)},${edge.curve.control1.y.toFixed(2)} ${edge.curve.control2.x.toFixed(2)},${edge.curve.control2.y.toFixed(2)} ${edge.curve.end.x.toFixed(2)},${edge.curve.end.y.toFixed(2)}`;
    } else {
      d += ` L ${edge.curve.end.x.toFixed(2)},${edge.curve.end.y.toFixed(2)}`;
    }
  }
  return `${d} Z`;
}

export function surfaceBoundaryPoints(surface: SurfaceLike, bezierSegments = 6): AnnotationPoint[] {
  if (surface.nodes.length === 0) {
    return [];
  }

  const points: AnnotationPoint[] = [];
  for (const edge of surface.edges) {
    if (edge.kind === "bezier") {
      const sampled = sampleBezierPoints(edge.curve, bezierSegments);
      if (points.length === 0) {
        points.push(...sampled);
      } else {
        points.push(...sampled.slice(1));
      }
    } else {
      if (points.length === 0) {
        points.push(clonePoint(edge.curve.start));
      }
      points.push(clonePoint(edge.curve.end));
    }
  }
  return points;
}

export function surfaceToRing(surface: SurfaceLike, bezierSegments = 10): AnnotationPoint[] {
  const points = surfaceBoundaryPoints(surface, bezierSegments);
  if (points.length < 2) {
    return points.map((point) => clonePoint(point));
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-6) {
    return points.slice(0, -1).map((point) => clonePoint(point));
  }
  return points.map((point) => clonePoint(point));
}

export function surfaceCentroid(surface: SurfaceLike): AnnotationPoint {
  if (surface.nodes.length === 0) {
    return { x: 0, y: 0 };
  }

  const total = surface.nodes.reduce(
    (acc, node) => ({
      x: acc.x + node.point.x,
      y: acc.y + node.point.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / surface.nodes.length,
    y: total.y / surface.nodes.length,
  };
}

export function pointInSurface(point: AnnotationPoint, surface: SurfaceLike): boolean {
  const polygon = surfaceBoundaryPoints(surface, 4);
  if (polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function surfaceBoundaryDistance(point: AnnotationPoint, surface: SurfaceLike): number {
  const polygon = surfaceBoundaryPoints(surface, 8);
  if (polygon.length < 2) {
    return Number.POSITIVE_INFINITY;
  }
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const distance = pointToSegmentDistance(point, a, b);
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}

export function connectorWidthForSurfaces(
  selectedSurfaces: Array<JunctionLaneSurface | JunctionMergedSurface>,
): number {
  const laneWidths = selectedSurfaces
    .flatMap((surface) => ("laneWidthM" in surface ? [surface.laneWidthM] : []))
    .filter((width) => Number.isFinite(width) && width > 0);
  if (laneWidths.length === 0) {
    return DEFAULT_MERGE_CONNECTOR_WIDTH_M;
  }
  const baseWidth = Math.min(...laneWidths) * 0.18;
  return clampNumber(baseWidth, MIN_MERGE_CONNECTOR_WIDTH_M, MAX_MERGE_CONNECTOR_WIDTH_M);
}

export function translateSurface(surface: SurfaceLike, dx: number, dy: number): void {
  for (const node of surface.nodes) {
    node.point = { x: node.point.x + dx, y: node.point.y + dy };
  }
  for (const edge of surface.edges) {
    edge.curve = translateCurve(edge.curve, dx, dy);
  }
}

export function moveSurfaceNode(surface: SurfaceLike, nodeId: string, nextPoint: AnnotationPoint): boolean {
  const index = surface.nodes.findIndex((node) => node.nodeId === nodeId);
  if (index < 0) {
    return false;
  }
  const current = surface.nodes[index];
  const dx = nextPoint.x - current.point.x;
  const dy = nextPoint.y - current.point.y;
  current.point = clonePoint(nextPoint);

  const previousEdge = surface.edges[(index - 1 + surface.edges.length) % surface.edges.length];
  const nextEdge = surface.edges[index % surface.edges.length];
  if (previousEdge) {
    previousEdge.curve.end = clonePoint(nextPoint);
    if (previousEdge.kind === "bezier") {
      previousEdge.curve.control2 = add(previousEdge.curve.control2, { x: dx, y: dy });
    } else {
      previousEdge.curve = makeLineCurve(previousEdge.curve.start, previousEdge.curve.end);
    }
  }
  if (nextEdge) {
    nextEdge.curve.start = clonePoint(nextPoint);
    if (nextEdge.kind === "bezier") {
      nextEdge.curve.control1 = add(nextEdge.curve.control1, { x: dx, y: dy });
    } else {
      nextEdge.curve = makeLineCurve(nextEdge.curve.start, nextEdge.curve.end);
    }
  }
  return true;
}

export function insertSurfaceNode(surface: SurfaceLike, edgeIndex: number, point: AnnotationPoint): boolean {
  if (surface.nodes.length < 2 || edgeIndex < 0 || edgeIndex >= surface.edges.length) {
    return false;
  }

  const previousEdges = surface.edges.map((edge) => cloneSurfaceEdge(edge));
  const nextIndex = (edgeIndex + 1) % surface.nodes.length;
  const insertIndex = nextIndex;
  const nodeId = `${surface.edges[edgeIndex].edgeId}_node_${String(surface.nodes.length + 1).padStart(2, "0")}`;
  const node = createSurfaceNode(nodeId, "custom", point);
  surface.nodes.splice(insertIndex, 0, node);
  rebuildSurfaceEdges(surface, previousEdges);
  return true;
}

export function deleteSurfaceNode(surface: SurfaceLike, nodeId: string): boolean {
  const index = surface.nodes.findIndex((node) => node.nodeId === nodeId);
  if (index < 0 || surface.nodes.length <= 3) {
    return false;
  }

  const prevIndex = (index - 1 + surface.nodes.length) % surface.nodes.length;
  const nextIndex = (index + 1) % surface.nodes.length;
  const prevNode = surface.nodes[prevIndex];
  const nextNode = surface.nodes[nextIndex];
  if (!prevNode || !nextNode) {
    return false;
  }

  const previousEdges = surface.edges.map((edge) => cloneSurfaceEdge(edge));
  surface.nodes.splice(index, 1);
  rebuildSurfaceEdges(surface, previousEdges);
  return true;
}

export function toggleSurfaceEdgeKind(surface: SurfaceLike, edgeId: string): boolean {
  const edge = surface.edges.find((item) => item.edgeId === edgeId);
  if (!edge) {
    return false;
  }
  if (edge.kind === "line") {
    edge.kind = "bezier";
    edge.curve = makeBezierCurveFromLine(edge.curve.start, edge.curve.end);
  } else {
    edge.kind = "line";
    edge.curve = makeLineCurve(edge.curve.start, edge.curve.end);
  }
  return true;
}

export function findNearestNodePair(
  surfaceA: JunctionLaneSurface | JunctionMergedSurface,
  surfaceB: JunctionLaneSurface | JunctionMergedSurface,
): SurfaceNearestNodePair | null {
  let bestPair: SurfaceNearestNodePair | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const nodeA of surfaceA.nodes) {
    for (const nodeB of surfaceB.nodes) {
      const distance = Math.hypot(nodeA.point.x - nodeB.point.x, nodeA.point.y - nodeB.point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPair = {
          nodeAId: nodeA.nodeId,
          nodeBId: nodeB.nodeId,
          pointA: clonePoint(nodeA.point),
          pointB: clonePoint(nodeB.point),
          distance,
        };
      }
    }
  }

  return bestPair;
}

export function buildConnectorStrip(pointA: AnnotationPoint, pointB: AnnotationPoint, widthM: number): AnnotationPoint[] {
  const safeWidth = Math.max(widthM, MIN_MERGE_CONNECTOR_WIDTH_M);
  const axisDelta = subtract(pointB, pointA);
  const distance = length(axisDelta);
  if (distance <= 1e-6) {
    const half = safeWidth * 0.5;
    return [
      { x: pointA.x - half, y: pointA.y - half },
      { x: pointA.x + half, y: pointA.y - half },
      { x: pointA.x + half, y: pointA.y + half },
      { x: pointA.x - half, y: pointA.y + half },
    ];
  }

  if (distance <= safeWidth * 0.25) {
    return [];
  }

  const axis = normalize(axisDelta);
  const normal = perpendicular(axis);
  const halfWidth = safeWidth * 0.5;
  const capExtension = Math.min(safeWidth * 0.5, distance * 0.25);
  const start = add(pointA, scale(axis, -capExtension));
  const end = add(pointB, scale(axis, capExtension));

  return [
    add(start, scale(normal, halfWidth)),
    add(start, scale(normal, -halfWidth)),
    add(end, scale(normal, -halfWidth)),
    add(end, scale(normal, halfWidth)),
  ];
}

export function buildMergedSurfacePreview(
  selectedSurfaces: Array<JunctionLaneSurface | JunctionMergedSurface>,
): SurfaceMergePreview | null {
  if (selectedSurfaces.length !== 2) {
    return null;
  }

  const [surfaceA, surfaceB] = selectedSurfaces;
  const nearestPair = findNearestNodePair(surfaceA, surfaceB);
  if (!nearestPair) {
    return null;
  }

  const connectorWidthM = connectorWidthForSurfaces(selectedSurfaces);
  return {
    nearestPair,
    connectorWidthM,
    connectorRing: buildConnectorStrip(nearestPair.pointA, nearestPair.pointB, connectorWidthM),
  };
}

function ringToPolygonClippingRing(ring: AnnotationPoint[]): PolygonClippingRing {
  return ring.map((point) => [point.x, point.y]);
}

function polygonClippingRingToPoints(ring: PolygonClippingRing): AnnotationPoint[] {
  if (ring.length === 0) {
    return [];
  }
  const points = ring.map(([x, y]) => ({ x, y }));
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-6) {
      return points.slice(0, -1);
    }
  }
  return points;
}

export function unionMergedSurfaceRings(...rings: AnnotationPoint[][]): PolygonClippingMultiPolygon {
  const validPolygons = rings
    .map((ring) => surfaceRingWithoutDuplicate(ring))
    .filter((ring) => ring.length >= 3)
    .map((ring) => [ringToPolygonClippingRing(ring)] as PolygonClippingRing[]);
  if (validPolygons.length === 0) {
    return [];
  }
  return polygonClipping.union(validPolygons[0], ...validPolygons.slice(1));
}

function surfaceRingWithoutDuplicate(ring: AnnotationPoint[]): AnnotationPoint[] {
  if (ring.length <= 1) {
    return ring.map((point) => clonePoint(point));
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-6) {
    return ring.slice(0, -1).map((point) => clonePoint(point));
  }
  return ring.map((point) => clonePoint(point));
}

function extractSingleOuterRing(geometry: PolygonClippingMultiPolygon): AnnotationPoint[] | null {
  if (geometry.length !== 1) {
    return null;
  }
  const [polygon] = geometry;
  if (polygon.length !== 1) {
    return null;
  }
  return polygonClippingRingToPoints(polygon[0]);
}

export function rebuildSurfaceFromOuterRing(
  surfaceId: string,
  ring: AnnotationPoint[],
  metadata: RebuildMergedSurfaceMetadata,
): JunctionMergedSurface | null {
  const points = surfaceRingWithoutDuplicate(ring);
  if (points.length < 3) {
    return null;
  }

  const nodes = points.map((point, index) =>
    createSurfaceNode(`${surfaceId}_node_${String(index + 1).padStart(2, "0")}`, "custom", point),
  );
  const edges = buildClosedSurfaceEdges(surfaceId, nodes);

  return {
    surfaceId,
    mergedFromSurfaceIds: [...new Set(metadata.mergedFromSurfaceIds)],
    mergedFromLaneIds: [...new Set(metadata.mergedFromLaneIds)],
    provenance: "merged",
    nodes,
    edges,
  };
}

export function mergeLaneSurfaces(
  surfaceId: string,
  selectedSurfaces: Array<JunctionLaneSurface | JunctionMergedSurface>,
): JunctionMergedSurface | null {
  if (selectedSurfaces.length !== 2) {
    return null;
  }

  const preview = buildMergedSurfacePreview(selectedSurfaces);
  if (!preview) {
    return null;
  }

  const memberSurfaceIds: string[] = [];
  const memberLaneIds: string[] = [];

  for (const surface of selectedSurfaces) {
    memberSurfaceIds.push(surface.surfaceId);
    if ("laneId" in surface) {
      memberLaneIds.push(surface.laneId);
    }
  }

  const rings = selectedSurfaces.map((surface) => surfaceToRing(surface, 12));
  if (preview.connectorRing.length >= 3) {
    rings.push(preview.connectorRing);
  }
  const mergedGeometry = unionMergedSurfaceRings(...rings);
  const outerRing = extractSingleOuterRing(mergedGeometry);
  if (!outerRing) {
    return null;
  }

  return rebuildSurfaceFromOuterRing(surfaceId, outerRing, {
    mergedFromSurfaceIds: memberSurfaceIds,
    mergedFromLaneIds: memberLaneIds,
  });
}

export function cloneSurfaceNode(node: JunctionSurfaceNode): JunctionSurfaceNode {
  return {
    nodeId: node.nodeId,
    kind: node.kind,
    point: clonePoint(node.point),
  };
}

export function cloneSurfaceEdge(edge: JunctionSurfaceEdge): JunctionSurfaceEdge {
  return {
    edgeId: edge.edgeId,
    startNodeId: edge.startNodeId,
    endNodeId: edge.endNodeId,
    kind: edge.kind,
    curve: cloneBezier(edge.curve),
  };
}

export function cloneLaneSurfaceDeep<T extends { nodes: JunctionSurfaceNode[]; edges: JunctionSurfaceEdge[] }>(surface: T): T {
  return {
    ...surface,
    nodes: surface.nodes.map((node) => cloneSurfaceNode(node)),
    edges: surface.edges.map((edge) => cloneSurfaceEdge(edge)),
  };
}

function relinkSurfaceEdges(surface: SurfaceLike): void {
  for (let index = 0; index < surface.edges.length; index += 1) {
    const edge = surface.edges[index];
    const start = surface.nodes.find((node) => node.nodeId === edge.startNodeId);
    const end = surface.nodes.find((node) => node.nodeId === edge.endNodeId);
    if (!start || !end) {
      continue;
    }
    if (edge.kind === "line") {
      edge.curve = makeLineCurve(start.point, end.point);
    } else {
      edge.curve.start = clonePoint(start.point);
      edge.curve.end = clonePoint(end.point);
    }
  }
}

function rebuildSurfaceEdges(surface: SurfaceLike, previousEdges: JunctionSurfaceEdge[]): void {
  const previousByPair = new Map(
    previousEdges.map((edge) => [`${edge.startNodeId}::${edge.endNodeId}`, edge] as const),
  );
  surface.edges = [];
  if (surface.nodes.length < 2) {
    return;
  }

  for (let index = 0; index < surface.nodes.length; index += 1) {
    const start = surface.nodes[index];
    const end = surface.nodes[(index + 1) % surface.nodes.length];
    const existing = previousByPair.get(`${start.nodeId}::${end.nodeId}`);
    if (existing) {
      const curve = cloneBezier(existing.curve);
      curve.start = clonePoint(start.point);
      curve.end = clonePoint(end.point);
      if (existing.kind === "line") {
        curve.control1 = lerp(start.point, end.point, 1 / 3);
        curve.control2 = lerp(start.point, end.point, 2 / 3);
      }
      surface.edges.push({
        edgeId: existing.edgeId,
        startNodeId: start.nodeId,
        endNodeId: end.nodeId,
        kind: existing.kind,
        curve,
      });
      continue;
    }
    surface.edges.push(createSurfaceEdge(
      `${surface.nodes[index].nodeId}_to_${surface.nodes[(index + 1) % surface.nodes.length].nodeId}`,
      start.nodeId,
      end.nodeId,
      start.point,
      end.point,
    ));
  }
}

function translateCurve(curve: BezierCurve3, dx: number, dy: number): BezierCurve3 {
  return {
    start: { x: curve.start.x + dx, y: curve.start.y + dy },
    end: { x: curve.end.x + dx, y: curve.end.y + dy },
    control1: { x: curve.control1.x + dx, y: curve.control1.y + dy },
    control2: { x: curve.control2.x + dx, y: curve.control2.y + dy },
  };
}

function makeBezierCurveFromLine(start: AnnotationPoint, end: AnnotationPoint): BezierCurve3 {
  return {
    start: clonePoint(start),
    end: clonePoint(end),
    control1: lerp(start, end, 1 / 3),
    control2: lerp(start, end, 2 / 3),
  };
}

function pointToSegmentDistance(point: AnnotationPoint, start: AnnotationPoint, end: AnnotationPoint): number {
  const ab = subtract(end, start);
  const ap = subtract(point, start);
  const denominator = Math.max(ab.x * ab.x + ab.y * ab.y, 1e-12);
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / denominator));
  const projection = add(start, scale(ab, t));
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}
