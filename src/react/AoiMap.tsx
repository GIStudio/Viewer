import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

type AoiMapProps = {
  bbox: [number, number, number, number];
  onChange: (bbox: [number, number, number, number]) => void;
};

function polygon(bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
  };
}

export function AoiMap({ bbox, onChange }: AoiMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return undefined;
    const center: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    const map = new maplibregl.Map({
      container: host.current,
      center,
      zoom: 14,
      attributionControl: false,
      style: {
        version: 8,
        sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.addSource("course-aoi", { type: "geojson", data: polygon(bbox) });
      map.addLayer({ id: "course-aoi-fill", type: "fill", source: "course-aoi", paint: { "fill-color": "#f2b705", "fill-opacity": 0.22 } });
      map.addLayer({ id: "course-aoi-line", type: "line", source: "course-aoi", paint: { "line-color": "#002f4f", "line-width": 3, "line-dasharray": [2, 1] } });
    });
    map.on("click", (event) => {
      const width = Math.max(0.002, bbox[2] - bbox[0]);
      const height = Math.max(0.002, bbox[3] - bbox[1]);
      onChangeRef.current([event.lngLat.lng - width / 2, event.lngLat.lat - height / 2, event.lngLat.lng + width / 2, event.lngLat.lat + height / 2]);
    });
    mapRef.current = map;
    return () => { mapRef.current = null; map.remove(); };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("course-aoi") as GeoJSONSource | undefined;
    source?.setData(polygon(bbox));
  }, [bbox]);

  return <div className="course-aoi-map" ref={host} aria-label="OpenStreetMap area selector" />;
}

