import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent, type Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";

export type ReviewGeometry =
  | { type: "Point"; coordinates: number[] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "Polygon"; coordinates: number[][][] };

export type ReviewFeature = {
  type: "Feature";
  id: string;
  properties: Record<string, unknown>;
  geometry: ReviewGeometry;
};

export type ReviewFeatureCollection = {
  type: "FeatureCollection";
  features: ReviewFeature[];
  roadgen3d?: Record<string, unknown>;
};

type ReviewMode = "select" | "add_tree" | "add_furniture";

type Props = {
  bbox: [number, number, number, number];
  geojson: ReviewFeatureCollection;
  selectedFeature: ReviewFeature | null;
  mode: ReviewMode;
  onSelect: (featureId: string | null) => void;
  onMapClick: (coordinates: [number, number]) => void;
  onGeometryChange: (featureId: string, geometry: ReviewGeometry) => void;
  onMapStatus: (status: "loading" | "ready" | "error", zoom?: number) => void;
};

const EMPTY_COLLECTION: ReviewFeatureCollection = { type: "FeatureCollection", features: [] };
const EDITABLE_LAYER_IDS = ["review-points", "review-lines", "review-polygons-fill"];

function mapData(geojson: ReviewFeatureCollection): ReviewFeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, __feature_id: feature.id },
    })),
  };
}

function vertexCoordinates(feature: ReviewFeature): number[][] {
  if (feature.geometry.type === "Point") return [feature.geometry.coordinates];
  if (feature.geometry.type === "LineString") return feature.geometry.coordinates;
  const ring = feature.geometry.coordinates[0] ?? [];
  return ring.length > 1 && ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
    ? ring.slice(0, -1)
    : ring;
}

function movedGeometry(feature: ReviewFeature, index: number, coordinate: [number, number]): ReviewGeometry {
  if (feature.geometry.type === "Point") return { type: "Point", coordinates: coordinate };
  if (feature.geometry.type === "LineString") {
    const coordinates = feature.geometry.coordinates.map((item) => [...item]);
    coordinates[index] = coordinate;
    return { type: "LineString", coordinates };
  }
  const coordinates = feature.geometry.coordinates.map((ring) => ring.map((item) => [...item]));
  const outer = coordinates[0] ?? [];
  const closed = outer.length > 1 && outer[0]?.[0] === outer[outer.length - 1]?.[0] && outer[0]?.[1] === outer[outer.length - 1]?.[1];
  outer[index] = coordinate;
  if (closed && index === 0) outer[outer.length - 1] = [...coordinate];
  return { type: "Polygon", coordinates };
}

export function ReferenceReviewMap({ bbox, geojson, selectedFeature, mode, onSelect, onMapClick, onGeometryChange, onMapStatus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const callbacks = useRef({ onSelect, onMapClick, onGeometryChange, onMapStatus });
  callbacks.current = { onSelect, onMapClick, onGeometryChange, onMapStatus };
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!host.current) return undefined;
    callbacks.current.onMapStatus("loading");
    const map = new maplibregl.Map({
      container: host.current,
      center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
      zoom: 15,
      maxZoom: 20,
      renderWorldCopies: false,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.82, "raster-saturation": -0.35 } }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 58, maxZoom: 18, duration: 0 });
    map.on("load", () => {
      map.addSource("review-features", { type: "geojson", data: mapData(geojson) as any });
      map.addSource("review-selected", { type: "geojson", data: EMPTY_COLLECTION as any });
      const roleColor = [
        "match", ["get", "role"],
        "centerline", "#df654f",
        "building_footprint", "#174b64",
        "functional_zone", "#b8860b",
        "tree_candidate", "#25855a",
        "street_furniture_anchor", "#7d4f9f",
        "road_intersection", "#d94b2b",
        "#52656d",
      ] as any;
      map.addLayer({ id: "review-polygons-fill", type: "fill", source: "review-features", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": roleColor, "fill-opacity": 0.2 } });
      map.addLayer({ id: "review-polygons-line", type: "line", source: "review-features", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": roleColor, "line-width": 2 } });
      map.addLayer({ id: "review-lines", type: "line", source: "review-features", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": roleColor, "line-width": 4, "line-opacity": 0.9 } });
      map.addLayer({ id: "review-points", type: "circle", source: "review-features", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": roleColor, "circle-radius": 6, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      map.addLayer({ id: "review-selected-fill", type: "fill", source: "review-selected", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#f4c430", "fill-opacity": 0.32 } });
      map.addLayer({ id: "review-selected-line", type: "line", source: "review-selected", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#102d3a", "line-width": 7, "line-opacity": 0.8, "line-dasharray": [1, 1] } });
      map.addLayer({ id: "review-selected-point", type: "circle", source: "review-selected", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#f4c430", "circle-radius": 11, "circle-stroke-color": "#102d3a", "circle-stroke-width": 3 } });
      callbacks.current.onMapStatus("ready", map.getZoom());
    });
    map.on("idle", () => callbacks.current.onMapStatus("ready", map.getZoom()));
    map.on("error", (event) => {
      if (String(event.error?.message ?? "").toLowerCase().includes("tile")) callbacks.current.onMapStatus("error", map.getZoom());
    });
    map.on("click", (event: MapMouseEvent) => {
      if (modeRef.current !== "select") {
        callbacks.current.onMapClick([event.lngLat.lng, event.lngLat.lat]);
        return;
      }
      const hits = map.queryRenderedFeatures(event.point, { layers: EDITABLE_LAYER_IDS.filter((id) => Boolean(map.getLayer(id))) });
      const featureId = hits[0]?.properties?.__feature_id;
      callbacks.current.onSelect(featureId ? String(featureId) : null);
    });
    for (const layerId of EDITABLE_LAYER_IDS) {
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = modeRef.current === "select" ? "" : "crosshair"; });
    }
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = mode === "select" ? "" : "crosshair";
  }, [mode]);

  useEffect(() => {
    const source = mapRef.current?.getSource("review-features") as GeoJSONSource | undefined;
    source?.setData(mapData(geojson) as any);
  }, [geojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const selectedSource = map.getSource("review-selected") as GeoJSONSource | undefined;
    selectedSource?.setData((selectedFeature ? { type: "FeatureCollection", features: [selectedFeature] } : EMPTY_COLLECTION) as any);
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (!selectedFeature) return;
    markersRef.current = vertexCoordinates(selectedFeature).map((coordinate, index) => {
      const element = document.createElement("div");
      element.className = "course-review-vertex";
      element.title = "Drag to edit geometry";
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat([coordinate[0]!, coordinate[1]!]).addTo(map);
      marker.on("dragend", () => {
        const position = marker.getLngLat();
        callbacks.current.onGeometryChange(selectedFeature.id, movedGeometry(selectedFeature, index, [position.lng, position.lat]));
      });
      return marker;
    });
  }, [selectedFeature]);

  return <div className="course-reference-map" ref={host} aria-label="Project OpenStreetMap annotation review" />;
}
