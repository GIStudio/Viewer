import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";

import { apiJson } from "./viewer-api";

export type Wgs84Bbox = [west: number, south: number, east: number, north: number];

export type OsmAoiSelection = {
  bbox: Wgs84Bbox;
  source: "viewport" | "draw" | "coordinates";
};

export type OsmMapView = {
  center: [longitude: number, latitude: number];
  zoom: number;
};

export const DEFAULT_GUANGZHOU_OSM_VIEW: OsmMapView = {
  center: [113.2685, 23.13025],
  zoom: 15,
};

export type OsmAoiPickerOptions = {
  initialView: OsmMapView;
  initialSelection?: OsmAoiSelection | null;
  readonly?: boolean;
  language?: "zh" | "en";
  confirmLabel?: string;
  showConfirm?: boolean;
  showCityPicker?: boolean;
  onViewChange?(view: OsmMapView): void;
  onSelectionChange(selection: OsmAoiSelection | null): void;
  onConfirm(selection: OsmAoiSelection): Promise<void>;
};

export type OsmAoiPickerController = {
  captureViewport(): void;
  clearSelection(): void;
  fitSelection(): void;
  resize(): void;
  setBusy(busy: boolean): void;
  setSelection(selection: OsmAoiSelection | null, options?: { fit?: boolean }): void;
  setView(view: OsmMapView): void;
  destroy(): void;
};

type ChinaCity = {
  name_zh: string;
  name_en: string;
  province: string;
  bbox: Wgs84Bbox;
};

const MIN_SPAN = 0.00005;
const MAX_AOI_EDGE_M = 3_500;
const MAX_AOI_AREA_M2 = 8_000_000;

function finiteBbox(value: readonly number[]): value is Wgs84Bbox {
  return value.length === 4
    && value.every(Number.isFinite)
    && value[0] >= -180
    && value[2] <= 180
    && value[1] >= -90
    && value[3] <= 90
    && value[0] < value[2]
    && value[1] < value[3];
}

function finiteMapView(value: OsmMapView): boolean {
  return value.center.length === 2
    && value.center.every(Number.isFinite)
    && value.center[0] >= -180
    && value.center[0] <= 180
    && value.center[1] >= -90
    && value.center[1] <= 90
    && Number.isFinite(value.zoom);
}

function normalizedBbox(a: maplibregl.LngLat, b: maplibregl.LngLat): Wgs84Bbox {
  const west = Math.min(a.lng, b.lng);
  const east = Math.max(a.lng, b.lng);
  const south = Math.min(a.lat, b.lat);
  const north = Math.max(a.lat, b.lat);
  return [west, south, east, north];
}

function mapBoundsBbox(map: MapLibreMap): Wgs84Bbox {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function polygon(bbox: Wgs84Bbox) {
  const [west, south, east, north] = bbox;
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    },
  };
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection" as const, features: [] };
}

function formatBboxValue(value: number): string {
  return Number(value).toFixed(6);
}

function createCornerElement(label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "osm-aoi-corner";
  element.setAttribute("aria-label", label);
  return element;
}

function dimensionsMetres(bbox: Wgs84Bbox): { width: number; height: number; area: number; oversized: boolean } {
  const midLatitude = (bbox[1] + bbox[3]) / 2;
  const width = Math.abs(bbox[2] - bbox[0]) * 111_320 * Math.max(0.01, Math.cos(midLatitude * Math.PI / 180));
  const height = Math.abs(bbox[3] - bbox[1]) * 110_540;
  return {
    width,
    height,
    area: width * height,
    oversized: width > MAX_AOI_EDGE_M || height > MAX_AOI_EDGE_M || width * height > MAX_AOI_AREA_M2,
  };
}

function formatDistance(value: number): string {
  return value >= 1_000 ? `${(value / 1_000).toFixed(2)} km` : `${Math.round(value)} m`;
}

export function mountOsmAoiPicker(host: HTMLElement, options: OsmAoiPickerOptions): OsmAoiPickerController {
  const zh = options.language !== "en";
  let selection = options.initialSelection ? { ...options.initialSelection, bbox: [...options.initialSelection.bbox] as Wgs84Bbox } : null;
  let map: MapLibreMap | null = null;
  let busy = false;
  let drawing = false;
  let drawStart: maplibregl.LngLat | null = null;
  let destroyed = false;
  let mapLoaded = false;
  let tileError = false;
  const markers: Marker[] = [];

  host.innerHTML = `
    <section class="osm-aoi-picker" data-readonly="${String(Boolean(options.readonly))}" data-drawing="false" data-has-selection="${String(Boolean(selection))}">
      <div class="osm-aoi-picker-map" data-aoi-map></div>
      <header class="osm-aoi-picker-toolbar" aria-label="${zh ? "OSM 地图取景工具" : "OSM map capture tools"}">
        <label class="osm-aoi-city-field" ${options.showCityPicker === false || options.readonly ? "hidden" : ""}>
          <span>${zh ? "快速定位" : "Quick location"}</span>
          <select data-aoi-city><option value="">${zh ? "加载城市目录…" : "Loading cities…"}</option></select>
        </label>
        <div class="osm-aoi-picker-actions">
          <button type="button" data-aoi-action="viewport" ${options.readonly ? "hidden" : ""}>${selection ? (zh ? "更新为当前视野" : "Update from view") : (zh ? "截取当前视野" : "Capture current view")}</button>
          <button type="button" data-aoi-action="draw" ${options.readonly ? "hidden" : ""}>${zh ? "精确框选" : "Draw precisely"}</button>
          <button type="button" data-aoi-action="fit" ${selection ? "" : "hidden"}>${zh ? "适应选区" : "Fit area"}</button>
        </div>
        <small class="osm-aoi-picker-gesture-hint">${zh ? "滚轮缩放地图 · 拖动平移" : "Scroll to zoom · Drag to pan"}</small>
      </header>
      <aside class="osm-aoi-picker-panel">
        <div class="osm-aoi-selection-copy">
          <span data-aoi-kicker>${selection ? (zh ? "候选研究区" : "Candidate area") : (zh ? "浏览地图" : "Browse the map")}</span>
          <strong data-aoi-selection-title>${selection ? (zh ? "研究区已截取" : "Area captured") : (zh ? "先找到你想研究的街区" : "Find the district you want to study")}</strong>
          <p data-aoi-selection-summary>${zh ? "平移和缩放地图，然后使用当前视野或精确框选。" : "Pan and zoom, then use the current view or draw a precise area."}</p>
        </div>
        <div class="osm-aoi-picker-status" data-aoi-status data-tone="neutral">
          ${zh ? "浏览地图不会下载 OSM 数据。" : "Browsing the map does not download OSM data."}
        </div>
        <details class="osm-aoi-coordinate-details" ${options.readonly ? "hidden" : ""}>
          <summary>${zh ? "高级定位 · 经纬度" : "Advanced · Coordinates"}</summary>
          <div class="osm-aoi-coordinate-grid">
            ${["West", "South", "East", "North"].map((label, index) => `
              <label><span>${label}</span><input data-aoi-coordinate="${index}" type="number" step="0.000001" placeholder="—" /></label>
            `).join("")}
          </div>
          <button type="button" data-aoi-action="coordinates">${zh ? "应用坐标为研究区" : "Use coordinates as area"}</button>
        </details>
        <div class="osm-aoi-confirm-row">
          <button type="button" data-aoi-action="clear" ${options.readonly || !selection ? "hidden" : ""}>${zh ? "清除" : "Clear"}</button>
          <button class="osm-aoi-confirm" type="button" data-aoi-action="confirm">${selection && options.showConfirm !== false
            ? (options.confirmLabel ?? (zh ? "获取 OSM 并进入标注" : "Fetch OSM and start annotation"))
            : selection
              ? (zh ? "更新为当前视野" : "Update from current view")
              : (zh ? "截取当前视野作为检索范围" : "Capture current view as retrieval area")}</button>
        </div>
        <small>© OpenStreetMap contributors</small>
      </aside>
    </section>
  `;

  const root = host.querySelector<HTMLElement>(".osm-aoi-picker")!;
  const mapHost = host.querySelector<HTMLElement>("[data-aoi-map]")!;
  const viewportButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='viewport']")!;
  const drawButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='draw']")!;
  const fitButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='fit']")!;
  const clearButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='clear']");
  const coordinateButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='coordinates']");
  const confirmButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='confirm']");
  const confirmRow = host.querySelector<HTMLElement>(".osm-aoi-confirm-row")!;
  const coordinateDetails = host.querySelector<HTMLDetailsElement>(".osm-aoi-coordinate-details");
  const citySelect = host.querySelector<HTMLSelectElement>("[data-aoi-city]");
  const coordinateInputs = [...host.querySelectorAll<HTMLInputElement>("[data-aoi-coordinate]")];
  const status = host.querySelector<HTMLElement>("[data-aoi-status]")!;
  const kicker = host.querySelector<HTMLElement>("[data-aoi-kicker]")!;
  const selectionTitle = host.querySelector<HTMLElement>("[data-aoi-selection-title]")!;
  const selectionSummary = host.querySelector<HTMLElement>("[data-aoi-selection-summary]")!;

  function setStatus(message: string, tone: "neutral" | "success" | "error" = "neutral"): void {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function syncCopy(): void {
    root.dataset.hasSelection = String(Boolean(selection));
    fitButton.hidden = !selection;
    confirmRow.hidden = Boolean(options.readonly && !selection);
    viewportButton.textContent = selection
      ? (zh ? "更新为当前视野" : "Update from view")
      : (zh ? "截取当前视野" : "Capture current view");
    if (clearButton) clearButton.hidden = Boolean(options.readonly || !selection);
    if (confirmButton) {
      confirmButton.textContent = selection && options.showConfirm !== false
        ? (options.confirmLabel ?? (zh ? "获取 OSM 并进入标注" : "Fetch OSM and start annotation"))
        : selection
          ? (zh ? "更新为当前视野" : "Update from current view")
          : (zh ? "截取当前视野作为检索范围" : "Capture current view as retrieval area");
    }
    if (!selection) {
      kicker.textContent = zh ? "浏览地图" : "Browse the map";
      selectionTitle.textContent = zh ? "先找到你想研究的街区" : "Find the district you want to study";
      selectionSummary.textContent = zh ? "平移和缩放地图，然后使用当前视野或精确框选。" : "Pan and zoom, then use the current view or draw a precise area.";
      return;
    }
    const dimensions = dimensionsMetres(selection.bbox);
    const sourceLabel = selection.source === "viewport"
      ? (zh ? "当前视野" : "current view")
      : selection.source === "draw"
        ? (zh ? "精确框选" : "precise draw")
        : (zh ? "坐标定位" : "coordinates");
    kicker.textContent = `${zh ? "候选研究区" : "Candidate area"} · ${sourceLabel}`;
    selectionTitle.textContent = dimensions.oversized
      ? (zh ? "范围过大，请放大地图" : "Area is too large; zoom in")
      : (zh ? "研究区已截取" : "Area captured");
    selectionSummary.textContent = `${formatDistance(dimensions.width)} × ${formatDistance(dimensions.height)} · ${selection.bbox.map(formatBboxValue).join(" · ")}`;
    if (dimensions.oversized) {
      setStatus(zh ? "当前范围超出街区尺度。请放大地图后重新截取，避免 Overpass 请求超时。" : "This exceeds district scale. Zoom in and capture again to avoid an Overpass timeout.", "error");
    } else if (!tileError) {
      setStatus(zh ? "候选范围已就绪；确认后才会获取并规范化 OSM。" : "The area is ready. OSM is fetched only after confirmation.", "success");
    }
  }

  function syncControls(): void {
    const oversized = selection ? dimensionsMetres(selection.bbox).oversized : false;
    viewportButton.disabled = busy || !mapLoaded;
    drawButton.disabled = busy || !mapLoaded;
    fitButton.disabled = busy || !selection;
    clearButton && (clearButton.disabled = busy || !selection);
    coordinateButton && (coordinateButton.disabled = busy);
    confirmButton && (confirmButton.disabled = busy || !mapLoaded || Boolean(selection && options.showConfirm !== false && oversized));
    citySelect && (citySelect.disabled = busy || Boolean(options.readonly));
    coordinateInputs.forEach((input) => { input.disabled = Boolean(options.readonly) || busy; });
  }

  function updateCoordinateInputs(force = false): void {
    if (!selection) return;
    coordinateInputs.forEach((input, index) => {
      if (force || document.activeElement !== input) input.value = formatBboxValue(selection!.bbox[index] ?? 0);
    });
  }

  function updateMapData(): void {
    const source = map?.getSource("roadgen-aoi") as GeoJSONSource | undefined;
    source?.setData(selection ? polygon(selection.bbox) : emptyFeatureCollection());
    if (!selection) {
      markers.forEach((marker) => marker.remove());
      markers.length = 0;
      return;
    }
    const corners: Array<[number, number]> = [
      [selection.bbox[0], selection.bbox[1]],
      [selection.bbox[2], selection.bbox[1]],
      [selection.bbox[2], selection.bbox[3]],
      [selection.bbox[0], selection.bbox[3]],
    ];
    if (!options.readonly && markers.length === 0 && map) {
      const labels = zh ? ["西南角", "东南角", "东北角", "西北角"] : ["Southwest corner", "Southeast corner", "Northeast corner", "Northwest corner"];
      labels.forEach((label, index) => {
        const marker = new maplibregl.Marker({ element: createCornerElement(label), draggable: true })
          .setLngLat(corners[index]!)
          .addTo(map!);
        marker.on("drag", () => {
          if (!selection) return;
          const point = marker.getLngLat();
          const next: Wgs84Bbox = [...selection.bbox];
          if (index === 0 || index === 3) next[0] = Math.min(point.lng, next[2] - MIN_SPAN);
          else next[2] = Math.max(point.lng, next[0] + MIN_SPAN);
          if (index === 0 || index === 1) next[1] = Math.min(point.lat, next[3] - MIN_SPAN);
          else next[3] = Math.max(point.lat, next[1] + MIN_SPAN);
          commitSelection({ bbox: next, source: "draw" });
        });
        markers.push(marker);
      });
    }
    markers.forEach((marker, index) => marker.setLngLat(corners[index]!));
  }

  function commitSelection(next: OsmAoiSelection | null, notify = true): void {
    if (next && !finiteBbox(next.bbox)) return;
    selection = next ? { ...next, bbox: [...next.bbox] as Wgs84Bbox } : null;
    updateMapData();
    updateCoordinateInputs();
    syncCopy();
    syncControls();
    if (notify) options.onSelectionChange(selection ? { ...selection, bbox: [...selection.bbox] as Wgs84Bbox } : null);
  }

  function currentView(): OsmMapView | null {
    if (!map) return null;
    const center = map.getCenter();
    return { center: [center.lng, center.lat], zoom: map.getZoom() };
  }

  function fitSelection(): void {
    if (!map || !selection) return;
    map.fitBounds([[selection.bbox[0], selection.bbox[1]], [selection.bbox[2], selection.bbox[3]]], { padding: 72, duration: 280, maxZoom: 18 });
  }

  function captureViewport(): void {
    if (!map || !mapLoaded || busy) return;
    commitSelection({ bbox: mapBoundsBbox(map), source: "viewport" });
  }

  function finishDrawing(): void {
    drawing = false;
    drawStart = null;
    root.dataset.drawing = "false";
    drawButton.dataset.active = "false";
    drawButton.textContent = zh ? "精确框选" : "Draw precisely";
    map?.dragPan.enable();
  }

  function beginDrawing(): void {
    if (!map || options.readonly || busy) return;
    drawing = true;
    drawStart = null;
    root.dataset.drawing = "true";
    drawButton.dataset.active = "true";
    drawButton.textContent = zh ? "拖拽地图框选" : "Drag on map";
    map.dragPan.disable();
    setStatus(zh ? "按住并拖拽，绘制新的研究区。" : "Press and drag to draw a new study area.");
  }

  const mapInstance = new maplibregl.Map({
    container: mapHost,
    center: options.initialView.center,
    zoom: options.initialView.zoom,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["/api/geo/osm-tiles/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.18, "raster-contrast": 0.04 } }],
    },
  });
  map = mapInstance;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  map.on("style.load", () => {
    if (destroyed || !map || mapLoaded) return;
    mapLoaded = true;
    map.addSource("roadgen-aoi", { type: "geojson", data: selection ? polygon(selection.bbox) : emptyFeatureCollection() });
    map.addLayer({ id: "roadgen-aoi-fill", type: "fill", source: "roadgen-aoi", paint: { "fill-color": "#f4c430", "fill-opacity": 0.2 } });
    map.addLayer({ id: "roadgen-aoi-line", type: "line", source: "roadgen-aoi", paint: { "line-color": "#102d3a", "line-width": 3, "line-dasharray": [2, 1] } });
    updateMapData();
    if (selection) fitSelection();
    map.resize();
    syncControls();
  });
  map.on("moveend", () => {
    const next = currentView();
    if (next) options.onViewChange?.(next);
  });
  map.on("error", (event) => {
    const message = String(event?.error?.message ?? "").toLowerCase();
    if (message.includes("tile") || message.includes("raster")) {
      tileError = true;
      setStatus(zh ? "OSM 底图瓦片暂时不可用；仍可通过当前视野、框选或高级坐标继续操作。" : "OSM tiles are unavailable; current-view capture, drawing and coordinates still work.", "error");
    }
  });
  map.on("mousedown", (event) => {
    if (!drawing) return;
    drawStart = event.lngLat;
    event.preventDefault();
  });
  map.on("mousemove", (event) => {
    if (!drawing || !drawStart || !event.originalEvent.buttons) return;
    const next = normalizedBbox(drawStart, event.lngLat);
    if (next[2] - next[0] >= MIN_SPAN && next[3] - next[1] >= MIN_SPAN) commitSelection({ bbox: next, source: "draw" });
  });
  map.on("mouseup", (event) => {
    if (!drawing || !drawStart) return;
    const next = normalizedBbox(drawStart, event.lngLat);
    if (next[2] - next[0] >= MIN_SPAN && next[3] - next[1] >= MIN_SPAN) commitSelection({ bbox: next, source: "draw" });
    finishDrawing();
  });

  const resizeObserver = new ResizeObserver(() => map?.resize());
  resizeObserver.observe(host);

  viewportButton.addEventListener("click", captureViewport);
  drawButton.addEventListener("click", () => drawing ? finishDrawing() : beginDrawing());
  fitButton.addEventListener("click", fitSelection);
  clearButton?.addEventListener("click", () => {
    commitSelection(null);
    setStatus(zh ? "研究区已清除；可继续浏览地图。" : "Area cleared; continue browsing the map.");
  });
  coordinateDetails?.addEventListener("toggle", () => {
    if (!coordinateDetails.open || coordinateInputs.some((input) => input.value.trim())) return;
    const bbox = selection?.bbox ?? (map ? mapBoundsBbox(map) : null);
    bbox?.forEach((value, index) => { coordinateInputs[index]!.value = formatBboxValue(value); });
  });
  coordinateButton?.addEventListener("click", () => {
    const next = coordinateInputs.map((input) => Number(input.value));
    if (!finiteBbox(next)) {
      setStatus(zh ? "坐标无效：必须满足 west < east、south < north。" : "Invalid coordinates: west < east and south < north are required.", "error");
      return;
    }
    commitSelection({ bbox: [...next], source: "coordinates" });
    fitSelection();
  });
  confirmButton?.addEventListener("click", async () => {
    if (busy || !mapLoaded) return;
    if (!selection || options.showConfirm === false) {
      captureViewport();
      return;
    }
    if (dimensionsMetres(selection.bbox).oversized) return;
    controller.setBusy(true);
    setStatus(zh ? "正在获取道路、建筑、土地利用、树木和 POI…" : "Fetching roads, buildings, land use, trees and POI…");
    try {
      await options.onConfirm({ ...selection, bbox: [...selection.bbox] as Wgs84Bbox });
      setStatus(zh ? "OSM 已规范化，正在进入标注工作台。" : "OSM normalized. Opening the annotation workbench.", "success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : (zh ? "OSM 获取失败，请缩小选区后重试。" : "OSM fetch failed. Reduce the area and retry."), "error");
    } finally {
      controller.setBusy(false);
    }
  });

  if (citySelect) {
    void apiJson<{ items: ChinaCity[] }>("/api/geo/china-cities")
      .then(({ items }) => {
        if (destroyed) return;
        citySelect.replaceChildren(new Option(zh ? "选择城市快速定位" : "Choose a city", ""));
        items.forEach((city) => citySelect.add(new Option(`${city.name_zh} · ${city.name_en}`, city.name_en)));
        citySelect.addEventListener("change", () => {
          const city = items.find((item) => item.name_en === citySelect.value);
          if (!city || !finiteBbox(city.bbox) || !map) return;
          map.fitBounds([[city.bbox[0], city.bbox[1]], [city.bbox[2], city.bbox[3]]], { padding: 110, duration: 320, maxZoom: 15 });
          setStatus(zh ? `已定位到${city.name_zh}；继续移动地图，满意后再截取研究区。` : `Located ${city.name_en}; keep navigating, then capture the area when ready.`, "success");
        });
      })
      .catch((error) => {
        console.warn("Failed to load China city catalog", error);
        if (!destroyed) citySelect.replaceChildren(new Option(zh ? "城市目录不可用，仍可自由移动地图" : "City catalog unavailable; pan the map freely", ""));
      });
  }

  const controller: OsmAoiPickerController = {
    captureViewport,
    clearSelection() {
      commitSelection(null);
    },
    fitSelection,
    resize() {
      map?.resize();
    },
    setBusy(next) {
      busy = next;
      root.dataset.busy = String(next);
      syncControls();
    },
    setSelection(next, setOptions = {}) {
      if (next && !finiteBbox(next.bbox)) throw new Error("Invalid WGS84 bbox.");
      commitSelection(next ? { ...next, bbox: [...next.bbox] as Wgs84Bbox } : null, false);
      if (setOptions.fit) fitSelection();
    },
    setView(next) {
      if (!finiteMapView(next)) throw new Error("Invalid OSM map view.");
      map?.jumpTo({ center: next.center, zoom: next.zoom });
    },
    destroy() {
      destroyed = true;
      resizeObserver.disconnect();
      markers.forEach((marker) => marker.remove());
      markers.length = 0;
      map?.remove();
      map = null;
      host.replaceChildren();
    },
  };

  updateCoordinateInputs(true);
  syncCopy();
  syncControls();
  return controller;
}
