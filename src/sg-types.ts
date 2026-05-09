export type AnnotationPoint = {
  x: number;
  y: number;
};

export type JunctionArmKey = "north" | "east" | "south" | "west";
export type SurfaceFlow = "inbound" | "outbound";
export type SurfaceProvenance = "generated" | "manual" | "merged";
export type SurfaceEdgeKind = "line" | "bezier";

export type CrossSectionMode = "coarse" | "detailed";
export type StripZone = "left" | "center" | "right";
export type StripDirection = "forward" | "reverse" | "bidirectional" | "none";
export type StripKind =
  | "drive_lane"
  | "bus_lane"
  | "bike_lane"
  | "parking_lane"
  | "median"
  | "nearroad_buffer"
  | "nearroad_furnishing"
  | "clear_sidewalk"
  | "farfromroad_buffer"
  | "frontage_reserve"
  | "grass_belt"
  | "shared_street_surface"
  | "colored_pavement";
export type FurnitureKind =
  | "bench"
  | "lamp"
  | "trash"
  | "mailbox"
  | "bollard"
  | "sign"
  | "hydrant"
  | "bus_stop"
  | "tree"
  | "kiosk"
  | "sculpture";

export type FunctionalZoneKind =
  | "plaza"
  | "garden"
  | "playground"
  | "amphitheater"
  | "outdoor_seating"
  | "parking"
  | "kiosk"
  | "sculpture";

export type RegionRole = "scene_region" | "building_region" | "functional_zone";

export type SurfaceAnnotationKind =
  | "bus_lane_widening"
  | "safety_island"
  | "colored_pavement"
  | "shared_surface"
  | "transit_pad"
  | "paving_zone";

export type SurfaceRole =
  | "carriageway"
  | "bus_lane"
  | "bike_lane"
  | "parking_lane"
  | "median"
  | "median_green"
  | "grass_belt"
  | "safety_island"
  | "shared_street_surface"
  | "colored_pavement"
  | "sidewalk"
  | "furnishing"
  | "context_ground"
  | "transit_pad"
  | "crossing";

export type AnnotatedCrossSectionStrip = {
  strip_id: string;
  zone: StripZone;
  kind: StripKind;
  width_m: number;
  direction: StripDirection;
  order_index: number;
};

export type AnnotatedStreetFurnitureInstance = {
  instance_id: string;
  centerline_id: string;
  strip_id: string;
  kind: FurnitureKind;
  station_m: number;
  lateral_offset_m: number;
  yaw_deg: number | null;
};

/**
 * Furniture instance placed inside a functional zone.
 * Uses pixel coordinates relative to the image.
 */
export type ZoneFurnitureInstance = {
  instance_id: string;
  kind: FurnitureKind;
  x_px: number;
  y_px: number;
  yaw_deg: number | null;
};

export type AnnotatedCenterline = {
  id: string;
  label: string;
  points: AnnotationPoint[];
  road_width_m: number;
  reference_width_px: number | null;
  forward_drive_lane_count: number;
  reverse_drive_lane_count: number;
  bike_lane_count: number;
  bus_lane_count: number;
  parking_lane_count: number;
  highway_type: string;
  cross_section_mode: CrossSectionMode;
  cross_section_strips: AnnotatedCrossSectionStrip[];
  street_furniture_instances: AnnotatedStreetFurnitureInstance[];
  start_junction_id: string;
  end_junction_id: string;
};

export type LaneProfile = {
  forward_drive_lane_count: number;
  reverse_drive_lane_count: number;
  bike_lane_count: number;
  bus_lane_count: number;
  parking_lane_count: number;
  bidirectional_drive_lane_count: number;
  bidirectional_lane_count: number;
  total_drive_lane_count: number;
  total_lane_count: number;
};

export type AnnotatedMarker = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: string;
};

export type AnnotatedJunction = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: string;
  connected_centerline_ids: string[];
  crosswalk_depth_m: number;
  source_mode: "explicit" | "legacy_marker";
};

export type AnnotatedRoundabout = {
  id: string;
  label: string;
  x: number;
  y: number;
  radius_px: number;
};

export type AnnotatedBuildingRegion = {
  id: string;
  label: string;
  center_px: AnnotationPoint;
  width_px: number;
  height_px: number;
  yaw_deg: number;
};

export type AnnotatedFunctionalZone = {
  id: string;
  label: string;
  kind: FunctionalZoneKind;
  points: AnnotationPoint[];
  furniture_instances: ZoneFurnitureInstance[];
};

export type AnnotatedRegion = {
  id: string;
  label: string;
  region_role: RegionRole;
  points: AnnotationPoint[];
  kind?: FunctionalZoneKind | string;
  land_use_type?: string;
  source_region_id?: string;
  derived?: boolean;
  material?: Record<string, unknown>;
  area_m2?: number;
  nearest_centerline_id?: string;
  nearest_centerline_distance_m?: number;
  side?: "left" | "right" | string;
  derivation_status?: string;
  polygon_xz?: number[][];
};

export type SurfaceMaterial = {
  preset: string;
  color_hex?: string;
  texture_key?: string;
};

export type AnnotatedSurfaceAnnotation = {
  id: string;
  label: string;
  kind: SurfaceAnnotationKind;
  surface_role: SurfaceRole;
  centerline_id: string;
  station_start_m: number;
  station_end_m: number;
  lateral_start_m: number;
  lateral_end_m: number;
  material: SurfaceMaterial;
};

export type AnnotatedStationStripPatch = {
  id: string;
  label: string;
  centerline_id: string;
  strip_id: string;
  station_start_m: number;
  station_end_m: number;
  updates: {
    kind?: StripKind;
    width_m?: number;
    direction?: StripDirection;
  };
};

export type BezierCurve3 = {
  start: AnnotationPoint;
  end: AnnotationPoint;
  control1: AnnotationPoint;
  control2: AnnotationPoint;
};

export type JunctionSurfaceNodeKind =
  | "start_left"
  | "start_right"
  | "end_right"
  | "end_left"
  | "custom";

export type JunctionSurfaceNode = {
  nodeId: string;
  kind: JunctionSurfaceNodeKind;
  point: AnnotationPoint;
};

export type JunctionSurfaceEdge = {
  edgeId: string;
  startNodeId: string;
  endNodeId: string;
  kind: SurfaceEdgeKind;
  curve: BezierCurve3;
};

export type JunctionLaneSurface = {
  surfaceId: string;
  laneId: string;
  armKey: JunctionArmKey;
  flow: SurfaceFlow;
  laneIndex: number;
  laneWidthM: number;
  skeletonId: string;
  provenance: SurfaceProvenance;
  nodes: JunctionSurfaceNode[];
  edges: JunctionSurfaceEdge[];
};

export type JunctionMergedSurface = {
  surfaceId: string;
  mergedFromSurfaceIds: string[];
  mergedFromLaneIds: string[];
  provenance: SurfaceProvenance;
  nodes: JunctionSurfaceNode[];
  edges: JunctionSurfaceEdge[];
};

export type JunctionTurnLanePatch = {
  patch_id: string;
  quadrant_id: string;
  strip_kind: StripKind | string;
  strip_id_a: string;
  strip_id_b: string;
  lane_index: number;
  flow: StripDirection | "mixed";
  direction: StripDirection | "mixed";
  surface_role: string;
  stack_kind: "center" | "side" | string;
  rings: number[][][];
};

export type JunctionQuadrantBezierPatch = {
  patchId: string;
  stripKind: StripKind;
  innerCurve: BezierCurve3;
  outerCurve: BezierCurve3;
};

export type JunctionQuadrantSkeletonLine = {
  lineId: string;
  stripKind: StripKind;
  curve: BezierCurve3;
  widthM: number;
};

export type JunctionQuadrantComposition = {
  quadrantId: string;
  armAId: string;
  armBId: string;
  patches: JunctionQuadrantBezierPatch[];
  skeletonLines: JunctionQuadrantSkeletonLine[];
};

export type JunctionComposition = {
  junctionId: string;
  kind: "cross_junction" | "t_junction" | "complex_junction";
  quadrants: JunctionQuadrantComposition[];
  laneSurfaces?: JunctionLaneSurface[];
  mergedSurfaces?: JunctionMergedSurface[];
};

export type ReferenceAnnotation = {
  version: string;
  plan_id: string;
  image_path: string;
  image_width_px: number;
  image_height_px: number;
  pixels_per_meter: number;
  centerlines: AnnotatedCenterline[];
  junctions: AnnotatedJunction[];
  roundabouts: AnnotatedRoundabout[];
  control_points: AnnotatedMarker[];
  regions: AnnotatedRegion[];
  derived_regions?: AnnotatedRegion[];
  building_regions: AnnotatedBuildingRegion[];
  functional_zones: AnnotatedFunctionalZone[];
  surface_annotations: AnnotatedSurfaceAnnotation[];
  station_strip_patches: AnnotatedStationStripPatch[];
  junction_compositions?: JunctionComposition[];
};

export type ReferencePlan = {
  plan_id: string;
  label: string;
  description?: string;
  image_url?: string;
};

export type ReferencePlansPayload = {
  items?: ReferencePlan[];
};

export type ConvertedGraphPayload = {
  annotation: ReferenceAnnotation;
  graph: {
    mode: string;
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
  road_profiles?: Array<Record<string, unknown>>;
  cross_section_profiles?: Array<Record<string, unknown>>;
  street_furniture_instances?: Array<Record<string, unknown>>;
  surface_annotations?: Array<Record<string, unknown>>;
  station_strip_patches?: Array<Record<string, unknown>>;
  derived_junctions?: Array<Record<string, unknown>>;
  metaurban_asset_hints?: Array<Record<string, unknown>>;
  metaurban_asset_guide?: Record<string, unknown>;
  summary: Record<string, unknown>;
};

export type PreviewCrossSection = {
  sourceMode: "seed" | "detailed";
  strips: AnnotatedCrossSectionStrip[];
};

export type BranchSnapTarget = {
  centerlineId: string;
  segmentIndex: number;
  stationPx: number;
  point: AnnotationPoint;
  distancePx: number;
};

export type BranchDraft = {
  anchor: BranchSnapTarget;
  endpoint: AnnotationPoint;
  endpointSnap: BranchSnapTarget | null;
};

export type CrossDraft = {
  anchor: BranchSnapTarget;
  axisNormal: AnnotationPoint;
  halfLengthPx: number;
  negativeEndpoint: AnnotationPoint;
  positiveEndpoint: AnnotationPoint;
  negativeEndpointSnap: BranchSnapTarget | null;
  positiveEndpointSnap: BranchSnapTarget | null;
};

export type AnnotationModelIssue = {
  code: "centerline_intersection" | "junction_pass_through" | "junction_connection";
  message: string;
};

export type DerivedJunctionOverlayPatch = {
  patchId: string;
  points: AnnotationPoint[];
  cutoutPoints?: AnnotationPoint[];
};

export type DerivedJunctionOverlayBoundary = {
  boundaryId: string;
  centerlineId: string;
  start: AnnotationPoint;
  end: AnnotationPoint;
  center: AnnotationPoint;
  exitDistancePx: number;
};

export type JunctionOverlayFootPoint = {
  footId: string;
  centerlineId: string;
  point: AnnotationPoint;
};

export type JunctionOverlayControlPoint = {
  controlId: string;
  centerlineId: string;
  stripId: string;
  stripKind: StripKind;
  stripZone: StripZone;
  pointKind: "station_foot_point" | "center_control_point" | "inner_edge_control_point" | "outer_edge_control_point";
  point: AnnotationPoint;
};

export type JunctionOverlayCornerFocus = {
  focusId: string;
  point: AnnotationPoint;
};

export type JunctionOverlayGuideLine = {
  guideId: string;
  start: AnnotationPoint;
  end: AnnotationPoint;
};

export type JunctionOverlayCornerKernel = {
  kernelId: string;
  quadrantId: string;
  junctionId: string;
  startCenterlineId: string;
  endCenterlineId: string;
  kernelKind: "circular_arc" | "polyline_fallback";
  center: AnnotationPoint;
  radiusPx: number;
  startHeadingDeg: number;
  endHeadingDeg: number;
  clockwise: boolean | null;
  points: AnnotationPoint[];
};

export type DerivedJunctionOverlayConnectorLine = {
  connectorId: string;
  stripKind: StripKind;
  quadrantId: string;
  kernelId: string | null;
  linkId?: string;
  start?: JunctionOverlayStripLinkEndpoint;
  end?: JunctionOverlayStripLinkEndpoint;
  strokeWidthPx: number;
  points: AnnotationPoint[];
};

export type JunctionOverlayStripLinkEndpoint = {
  centerlineId: string;
  stripId: string;
  stripKind: StripKind;
  stripZone: StripZone;
};

export type JunctionOverlayStripLink = {
  linkId: string;
  junctionId: string;
  quadrantId: string;
  kernelId: string | null;
  stripKind: StripKind;
  start: JunctionOverlayStripLinkEndpoint;
  end: JunctionOverlayStripLinkEndpoint;
  points: AnnotationPoint[];
  strokeWidthPx: number;
};

export type DerivedJunctionOverlayFusedStrip = {
  stripId: string;
  stripKind: StripKind;
  quadrantId: string;
  kernelId: string | null;
  patchRole?: "connector" | "endpoint_fill";
  pairedConnectorId?: string;
  endpointRole?: "from" | "to";
  widthPx: number;
  centerLine: AnnotationPoint[];
  innerLine: AnnotationPoint[];
  outerLine: AnnotationPoint[];
  patch: DerivedJunctionOverlayPatch;
};

export type DerivedJunctionOverlayVehicleTurnPatch = DerivedJunctionOverlayPatch & {
  stripKind: StripKind;
  quadrantId: string;
  kernelId: string | null;
  fromCenterlineId: string;
  fromStripId: string;
  toCenterlineId: string;
  toStripId: string;
  strokeWidthPx: number;
};

export type GenerationMode = "cross_strip_fusion_auto" | "cross_strip_fusion_manual" | "corner_connector_patch" | "viewer_local";

export type DerivedJunctionOverlay = {
  junctionId: string;
  kind: "t_junction" | "cross_junction";
  sourceMode: "explicit" | "derived";
  generationMode?: GenerationMode;
  core: AnnotationPoint[];
  carriagewayCore: AnnotationPoint[];
  crosswalks: DerivedJunctionOverlayPatch[];
  sidewalkCorners: DerivedJunctionOverlayPatch[];
  nearroadCorners: DerivedJunctionOverlayPatch[];
  frontageCorners: DerivedJunctionOverlayPatch[];
  fusedCornerStrips: DerivedJunctionOverlayFusedStrip[];
  vehicleTurnPatches: DerivedJunctionOverlayVehicleTurnPatch[];
  approachBoundaries: DerivedJunctionOverlayBoundary[];
  anchor: AnnotationPoint;
  armCount: number;
  connectedCenterlineIds: string[];
  skeletonFootPoints: JunctionOverlayFootPoint[];
  subLaneControlPoints: JunctionOverlayControlPoint[];
  cornerFocusPoints: JunctionOverlayCornerFocus[];
  boundaryExtensionLines: JunctionOverlayGuideLine[];
  focusGuideLines: JunctionOverlayGuideLine[];
  quadrantCornerKernels: JunctionOverlayCornerKernel[];
  connectorCenterLines: DerivedJunctionOverlayConnectorLine[];
  cornerStripLinks: JunctionOverlayStripLink[];
};

export type DerivedJunctionOverlayArm = {
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
};

export type ClippedDisplaySegment = {
  points: AnnotationPoint[];
  clippedStart: boolean;
  clippedEnd: boolean;
};

export type MetaurbanAssetBadge = {
  key: string;
  label: string;
  shortLabel: string;
};

export type Tool = "select" | "adjust" | "centerline" | "branch" | "cross" | "roundabout" | "control_point" | "scene_region" | "building_region" | "functional_zone" | "surface_annotation" | "tree" | "lamp" | "bench" | "trash" | "bus_stop" | "bollard" | "mailbox" | "hydrant" | "sign";

export type LaneElementKind = "road_strip" | "junction_turn_patch" | "junction_connector" | "junction_side_patch";

export type LaneElementSelection = {
  kind: "lane_element";
  id: string;
  elementKind: LaneElementKind;
  ownerKind: "centerline" | "junction" | "derived_junction";
  ownerId: string;
  centerlineId?: string;
  stripId?: string;
  stripKind?: StripKind;
  stripZone?: StripZone;
  stripDirection?: StripDirection;
  widthM?: number;
  widthPx?: number;
  junctionId?: string;
  patchId?: string;
  connectorId?: string;
  linkId?: string;
  patchRole?: "connector" | "endpoint_fill";
  pairedConnectorId?: string;
  endpointRole?: "from" | "to";
  quadrantId?: string;
  kernelId?: string | null;
  fromCenterlineId?: string;
  fromStripId?: string;
  toCenterlineId?: string;
  toStripId?: string;
  pointsCount?: number;
};

export type Selection =
  | {
      kind: "centerline";
      id: string;
      vertexIndex?: number;
    }
  | {
      kind: "road_collection";
      id: string;
    }
  | {
      kind: "junction" | "roundabout" | "control_point" | "derived_junction" | "region" | "building_region" | "functional_zone" | "surface_annotation";
      id: string;
    }
  | LaneElementSelection
  | null;

export type BuildingRegionResizeHandle = "nw" | "ne" | "se" | "sw";

export type DragState =
  | {
      kind: "centerline_vertex";
      id: string;
      vertexIndex: number;
      pointerId: number;
    }
  | {
      kind: "centerline_translate";
      id: string;
      pointerId: number;
      lastPoint: AnnotationPoint;
    }
  | {
      kind: "marker";
      markerKind: "junction" | "roundabout" | "control_point";
      id: string;
      pointerId: number;
    }
  | {
      kind: "building_region_translate";
      id: string;
      pointerId: number;
      lastPoint: AnnotationPoint;
    }
  | {
      kind: "building_region_resize";
      id: string;
      pointerId: number;
      handle: BuildingRegionResizeHandle;
    }
  | {
      kind: "building_region_rotate";
      id: string;
      pointerId: number;
    }
  | {
      kind: "building_region_draw";
      pointerId: number;
      startPoint: AnnotationPoint;
      currentPoint: AnnotationPoint;
    }
  | {
      kind: "functional_zone_draw";
      pointerId: number;
      points: AnnotationPoint[];
      currentPoint: AnnotationPoint;
    }
  | {
      kind: "region_draw";
      pointerId: number;
      regionRole: RegionRole;
      points: AnnotationPoint[];
      currentPoint: AnnotationPoint;
    }
  | {
      kind: "region_box_draw";
      pointerId: number;
      regionRole: RegionRole;
      startPoint: AnnotationPoint;
      currentPoint: AnnotationPoint;
    }
  | null;

export type SelectedStripCornerConnection = {
  linkId: string;
  junctionId: string;
  quadrantId: string;
  kernelId: string | null;
  stripKind: StripKind;
  current: JunctionOverlayStripLinkEndpoint;
  peer: JunctionOverlayStripLinkEndpoint;
  points: AnnotationPoint[];
};

export type SelectedStripCornerFamilyTarget = {
  targetId: string;
  junctionId: string;
  quadrantId: string;
  kernelId: string | null;
  stripKind: StripKind;
  target: JunctionOverlayStripLinkEndpoint;
  points: AnnotationPoint[];
};

export type OffsetPolylineSegment = {
  startIndex: number;
  endIndex: number;
  tangent: AnnotationPoint;
  normal: AnnotationPoint;
  offsetStart: AnnotationPoint;
  offsetEnd: AnnotationPoint;
};

// Replaces ReturnType<typeof centerlineSideStripLayouts>
export type SideStripLayoutEntry = {
  stripId: string;
  kind: StripKind;
  direction?: StripDirection;
  centerOffsetM: number;
  innerOffsetM: number;
  outerOffsetM: number;
};

// Replaces ReturnType<typeof centerlineSideStripLayouts>
export type SideStripLayouts = Record<StripZone, SideStripLayoutEntry[]>;

export type StatusTone = "neutral" | "success" | "error";
