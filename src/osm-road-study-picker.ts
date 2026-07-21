import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";

import type {
  OsmRoadPreview,
  OsmRoadStudyResponse,
  OsmRoadStudySelection,
} from "./workflow-api";

export type OsmRoadStudyPickerOptions = {
  preview: OsmRoadPreview;
  language?: "zh" | "en";
  bufferReadonly?: boolean;
  initialSelection?: OsmRoadStudySelection | null;
  onResolve(selection: OsmRoadStudySelection): Promise<OsmRoadStudyResponse>;
  onApply(result: OsmRoadStudyResponse): void | Promise<void>;
  onBack?(): void;
};

export type OsmRoadStudyPickerController = {
  resize(): void;
  destroy(): void;
};

function featureCollection(features: Feature[] = []): FeatureCollection {
  return { type: "FeatureCollection", features };
}

function logicalRoadId(feature: maplibregl.MapGeoJSONFeature): string {
  return String(feature.properties?.logical_road_id ?? feature.id ?? "");
}

function displayNumber(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number).toLocaleString() : "0";
}

export function mountOsmRoadStudyPicker(
  host: HTMLElement,
  options: OsmRoadStudyPickerOptions,
): OsmRoadStudyPickerController {
  const zh = options.language !== "en";
  let map: MapLibreMap | null = null;
  let destroyed = false;
  let requestVersion = 0;
  let resolved: OsmRoadStudyResponse | null = null;
  let selection: OsmRoadStudySelection | null = options.initialSelection
    ? { ...options.initialSelection }
    : null;

  host.innerHTML = `
    <section class="osm-road-study-picker" data-busy="false" data-has-selection="${String(Boolean(selection))}">
      <div class="osm-road-study-map" data-road-study-map></div>
      <header class="osm-road-study-heading">
        <span>${zh ? "OSM 检索完成" : "OSM RETRIEVAL COMPLETE"}</span>
        <strong>${zh ? "选择一条道路定义最终研究区" : "Select a road to define the final study area"}</strong>
        <small>${zh ? "矩形仅是数据检索范围；珊瑚色道路、路网跳数和 buffer 才决定标注与3D生成范围。" : "The rectangle is only a retrieval envelope. The selected road, network hops and buffer define annotation and 3D generation."}</small>
      </header>
      <aside class="osm-road-study-panel">
        <div class="osm-road-study-seed">
          <span>${zh ? "种子道路" : "SEED ROAD"}</span>
          <strong data-study-seed>${zh ? "请在地图上点击道路" : "Click a road on the map"}</strong>
          <small data-study-seed-meta>${displayNumber(options.preview.feature_counts.logical_roads)} ${zh ? "条逻辑道路可选" : "logical roads available"}</small>
        </div>
        <fieldset>
          <legend>${zh ? "路网邻域" : "NETWORK NEIGHBORHOOD"}</legend>
          <label><input type="radio" name="osm-hop-count" value="1" checked /> <span>1 ${zh ? "跳（默认）" : "hop (default)"}</span></label>
          <label><input type="radio" name="osm-hop-count" value="2" /> <span>2 ${zh ? "跳" : "hops"}</span></label>
          <small class="osm-road-study-hop-hint">${zh ? "1 跳：种子道路及与它直接相连的道路；2 跳：再纳入这些道路直接相连的下一层道路，研究范围更大。" : "1 hop includes the seed road and roads directly connected to it. 2 hops adds the next directly connected layer, creating a larger study area."}</small>
        </fieldset>
        <label class="osm-road-study-buffer">
          <span>${zh ? "上下文 BUFFER" : "CONTEXT BUFFER"}</span>
          <div><input data-study-buffer type="range" min="25" max="300" step="25" value="100" ${options.bufferReadonly ? "disabled" : ""} /><output data-study-buffer-output>100 m</output></div>
          <small>${options.bufferReadonly ? (zh ? "课程模式固定为100m" : "Fixed at 100m in course mode") : (zh ? "建筑保留完整 footprint；树木和 POI 按此范围过滤。" : "Buildings keep full footprints; trees and POI are filtered by this distance.")}</small>
        </label>
        <div class="osm-road-study-counts" data-study-counts>
          <span><b>—</b>${zh ? "道路" : "roads"}</span><span><b>—</b>${zh ? "建筑" : "buildings"}</span><span><b>—</b>${zh ? "树木" : "trees"}</span><span><b>—</b>POI</span>
        </div>
        <div class="osm-road-study-status" data-study-status data-tone="neutral">${zh ? "点击道路后计算1跳邻域与100m走廊；不会再次请求 Overpass。" : "Click a road to calculate the 1-hop neighborhood and 100m corridor without another Overpass request."}</div>
        <div class="osm-road-study-actions">
          <button type="button" data-study-action="back">${zh ? "返回检索范围" : "Back to retrieval"}</button>
          <button type="button" data-study-action="apply" disabled>${zh ? "应用道路研究区并进入标注" : "Apply road study area"}</button>
        </div>
        <small>© OpenStreetMap contributors</small>
      </aside>
    </section>
  `;

  const root = host.querySelector<HTMLElement>(".osm-road-study-picker")!;
  const mapHost = host.querySelector<HTMLElement>("[data-road-study-map]")!;
  const seedLabel = host.querySelector<HTMLElement>("[data-study-seed]")!;
  const seedMeta = host.querySelector<HTMLElement>("[data-study-seed-meta]")!;
  const bufferInput = host.querySelector<HTMLInputElement>("[data-study-buffer]")!;
  const bufferOutput = host.querySelector<HTMLOutputElement>("[data-study-buffer-output]")!;
  const status = host.querySelector<HTMLElement>("[data-study-status]")!;
  const counts = host.querySelector<HTMLElement>("[data-study-counts]")!;
  const applyButton = host.querySelector<HTMLButtonElement>("[data-study-action='apply']")!;
  const backButton = host.querySelector<HTMLButtonElement>("[data-study-action='back']")!;
  const hopInputs = [...host.querySelectorAll<HTMLInputElement>("input[name='osm-hop-count']")];
  if (selection) {
    bufferInput.value = String(selection.context_buffer_m);
    hopInputs.forEach((input) => { input.checked = Number(input.value) === selection!.hop_count; });
  }

  function setStatus(message: string, tone: "neutral" | "success" | "error" = "neutral"): void {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setBusy(busy: boolean): void {
    root.dataset.busy = String(busy);
    applyButton.disabled = busy || !resolved;
    hopInputs.forEach((input) => { input.disabled = busy; });
    if (!options.bufferReadonly) bufferInput.disabled = busy;
  }

  function selectedHopCount(): 1 | 2 {
    return Number(hopInputs.find((input) => input.checked)?.value ?? 1) === 2 ? 2 : 1;
  }

  function setRoadLayers(hopLayers: Record<string, 0 | 1 | 2>): void {
    const source = map?.getSource("logical-roads") as GeoJSONSource | undefined;
    const features = options.preview.logical_roads.features.map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        hop_layer: hopLayers[String(feature.properties?.logical_road_id ?? feature.id ?? "")] ?? -1,
      },
    }));
    source?.setData(featureCollection(features));
  }

  function setStudyArea(feature: Feature | null): void {
    const source = map?.getSource("study-area") as GeoJSONSource | undefined;
    source?.setData(feature ? featureCollection([feature]) : featureCollection());
  }

  function updateResolved(result: OsmRoadStudyResponse): void {
    resolved = result;
    setRoadLayers(result.osm_study.hop_layers);
    setStudyArea(result.osm_study.study_area);
    const roadCount = Object.keys(result.osm_study.hop_layers).length;
    const included = result.osm_study.included_feature_counts;
    counts.innerHTML = `
      <span><b>${displayNumber(roadCount)}</b>${zh ? "逻辑道路" : "roads"}</span>
      <span><b>${displayNumber(included.buildings)}</b>${zh ? "建筑" : "buildings"}</span>
      <span><b>${displayNumber(included.trees)}</b>${zh ? "树木" : "trees"}</span>
      <span><b>${displayNumber(included.poi)}</b>POI</span>
    `;
    const warning = result.osm_study.warnings.find((item) => item.toLowerCase().includes("retrieval boundary"));
    setStatus(
      warning
        ? (zh ? "路网触及检索边界，邻接道路可能被截断。可返回扩大矩形后重新获取。" : warning)
        : (zh ? "最终研究区已计算；确认后进入完整2D标注工作台。" : "The final study area is ready. Apply it to open the full 2D annotation workbench."),
      warning ? "error" : "success",
    );
  }

  async function resolveSelection(): Promise<void> {
    if (!selection) return;
    const version = ++requestVersion;
    resolved = null;
    setBusy(true);
    setStatus(zh ? "正在计算道路邻域、100m走廊和上下文对象…" : "Calculating the road neighborhood, corridor and context…");
    try {
      const result = await options.onResolve({ ...selection });
      if (destroyed || version !== requestVersion) return;
      updateResolved(result);
    } catch (error) {
      if (destroyed || version !== requestVersion) return;
      setRoadLayers({});
      setStudyArea(null);
      setStatus(error instanceof Error ? error.message : (zh ? "道路研究区计算失败。" : "Failed to calculate the road study area."), "error");
    } finally {
      if (!destroyed && version === requestVersion) setBusy(false);
    }
  }

  function selectRoad(feature: maplibregl.MapGeoJSONFeature): void {
    const id = logicalRoadId(feature);
    if (!id) return;
    selection = {
      seed_logical_road_id: id,
      hop_count: selectedHopCount(),
      context_buffer_m: Number(bufferInput.value),
    };
    root.dataset.hasSelection = "true";
    seedLabel.textContent = String(feature.properties?.label ?? id);
    seedMeta.textContent = `${String(feature.properties?.highway_type ?? "road")} · ${displayNumber(feature.properties?.way_count)} ${zh ? "个 OSM ways" : "OSM ways"} · ${displayNumber(feature.properties?.length_m)} m`;
    void resolveSelection();
  }

  const [west, south, east, north] = options.preview.retrieval_bbox;
  const mapInstance = new maplibregl.Map({
    container: mapHost,
    bounds: [[west, south], [east, north]],
    fitBoundsOptions: { padding: 64, maxZoom: 18 },
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 },
      },
      layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.35, "raster-opacity": 0.78 } }],
    },
  });
  map = mapInstance;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  map.on("load", () => {
    if (!map) return;
    map.addSource("context", { type: "geojson", data: options.preview.context_geojson });
    map.addLayer({ id: "context-polygons", type: "fill", source: "context", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#f4f7f8", "fill-opacity": 0.48, "fill-outline-color": "#75868c" } });
    map.addLayer({ id: "context-points", type: "circle", source: "context", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#174b64", "circle-radius": 3, "circle-opacity": 0.45 } });
    map.addSource("study-area", { type: "geojson", data: featureCollection() });
    map.addLayer({ id: "study-area-fill", type: "fill", source: "study-area", paint: { "fill-color": "#174b64", "fill-opacity": 0.18 } });
    map.addLayer({ id: "study-area-line", type: "line", source: "study-area", paint: { "line-color": "#174b64", "line-width": 2, "line-dasharray": [2, 1] } });
    map.addSource("logical-roads", { type: "geojson", data: options.preview.logical_roads });
    map.addLayer({
      id: "logical-roads-hit",
      type: "line",
      source: "logical-roads",
      paint: { "line-color": "rgba(0,0,0,0)", "line-width": 16 },
    });
    map.addLayer({
      id: "logical-roads-visible",
      type: "line",
      source: "logical-roads",
      paint: {
        "line-color": ["match", ["get", "hop_layer"], 0, "#df654f", 1, "#f4c430", 2, "#b9d9cc", "#526c78"],
        "line-width": ["match", ["get", "hop_layer"], 0, 7, 1, 5, 2, 4, 2.2],
        "line-opacity": ["match", ["get", "hop_layer"], -1, 0.48, 0.94],
      },
    });
    map.on("mouseenter", "logical-roads-hit", () => { map?.getCanvas().style.setProperty("cursor", "pointer"); });
    map.on("mouseleave", "logical-roads-hit", () => { map?.getCanvas().style.removeProperty("cursor"); });
    map.on("click", "logical-roads-hit", (event) => {
      const feature = event.features?.[0];
      if (feature) selectRoad(feature);
    });
    map.on("mousemove", "logical-roads-hit", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const wayIds = Array.isArray(feature.properties?.way_ids)
        ? feature.properties.way_ids.join(", ")
        : String(feature.properties?.way_ids ?? "");
      mapInstance.getCanvas().title = [
        String(feature.properties?.label ?? "OSM road"),
        `OSM ${wayIds}`,
        String(feature.properties?.highway_type ?? "road"),
        `${displayNumber(feature.properties?.way_count)} ways`,
        `${displayNumber(feature.properties?.length_m)} m`,
      ].join(" · ");
    });
    map.resize();
  });

  hopInputs.forEach((input) => input.addEventListener("change", () => {
    if (!selection) return;
    selection = { ...selection, hop_count: selectedHopCount() };
    void resolveSelection();
  }));
  bufferInput.addEventListener("input", () => { bufferOutput.value = `${bufferInput.value} m`; });
  bufferInput.addEventListener("change", () => {
    if (!selection) return;
    selection = { ...selection, context_buffer_m: Number(bufferInput.value) };
    void resolveSelection();
  });
  applyButton.addEventListener("click", () => { if (resolved) void options.onApply(resolved); });
  backButton.addEventListener("click", () => options.onBack?.());

  const resizeObserver = new ResizeObserver(() => map?.resize());
  resizeObserver.observe(host);
  bufferOutput.value = `${bufferInput.value} m`;

  return {
    resize() { map?.resize(); },
    destroy() {
      destroyed = true;
      requestVersion += 1;
      resizeObserver.disconnect();
      map?.remove();
      map = null;
      host.replaceChildren();
    },
  };
}
