import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";

import { apiJson } from "./viewer-api";

export type Wgs84Bbox = [west: number, south: number, east: number, north: number];

export type OsmAoiPickerOptions = {
  initialBbox: Wgs84Bbox;
  readonly?: boolean;
  language?: "zh" | "en";
  confirmLabel?: string;
  showConfirm?: boolean;
  showCityPicker?: boolean;
  onBboxChange(bbox: Wgs84Bbox): void;
  onConfirm(bbox: Wgs84Bbox): Promise<void>;
};

export type OsmAoiPickerController = {
  setBbox(bbox: Wgs84Bbox, options?: { fit?: boolean }): void;
  fitSelection(): void;
  setBusy(busy: boolean): void;
  destroy(): void;
};

type ChinaCity = {
  name_zh: string;
  name_en: string;
  province: string;
  bbox: Wgs84Bbox;
};

const MIN_SPAN = 0.00005;

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

function normalizedBbox(a: maplibregl.LngLat, b: maplibregl.LngLat): Wgs84Bbox {
  const west = Math.min(a.lng, b.lng);
  const east = Math.max(a.lng, b.lng);
  const south = Math.min(a.lat, b.lat);
  const north = Math.max(a.lat, b.lat);
  return [west, south, east, north];
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

export function mountOsmAoiPicker(host: HTMLElement, options: OsmAoiPickerOptions): OsmAoiPickerController {
  const zh = options.language !== "en";
  let bbox: Wgs84Bbox = [...options.initialBbox];
  let map: MapLibreMap | null = null;
  let busy = false;
  let drawing = false;
  let drawStart: maplibregl.LngLat | null = null;
  let destroyed = false;
  const markers: Marker[] = [];

  host.innerHTML = `
    <section class="osm-aoi-picker" data-readonly="${String(Boolean(options.readonly))}" data-drawing="false">
      <header class="osm-aoi-picker-header">
        <div>
          <span>OSM / WGS84</span>
          <strong>${zh ? "从真实街区建立标注" : "Build annotation from a real district"}</strong>
          <p>${zh ? "移动地图定位城市，框选一个街区；只有确认后才会获取并规范化 OSM。" : "Navigate to a city and draw one district. OSM is fetched only after confirmation."}</p>
        </div>
        <div class="osm-aoi-picker-actions">
          <button type="button" data-aoi-action="draw">${zh ? "框选街区" : "Draw area"}</button>
          <button type="button" data-aoi-action="fit">${zh ? "适应选区" : "Fit area"}</button>
        </div>
      </header>
      <div class="osm-aoi-picker-map" data-aoi-map></div>
      <aside class="osm-aoi-picker-panel">
        <label class="osm-aoi-city-field" ${options.showCityPicker === false ? "hidden" : ""}>
          <span>${zh ? "城市快速定位" : "City quick jump"}</span>
          <select data-aoi-city><option value="">${zh ? "加载城市目录…" : "Loading cities…"}</option></select>
        </label>
        <div class="osm-aoi-coordinate-grid">
          ${["West", "South", "East", "North"].map((label, index) => `
            <label><span>${label}</span><input data-aoi-coordinate="${index}" type="number" step="0.000001" value="${formatBboxValue(bbox[index] ?? 0)}" /></label>
          `).join("")}
        </div>
        <div class="osm-aoi-picker-status" data-aoi-status data-tone="neutral">
          ${zh ? "黄色边界是本次 OSM 数据范围。" : "The yellow boundary is the OSM data extent."}
        </div>
        ${options.showConfirm === false ? "" : `<button class="osm-aoi-confirm" type="button" data-aoi-action="confirm">${options.confirmLabel ?? (zh ? "获取 OSM 并进入标注" : "Fetch OSM and start annotation")}</button>`}
        <small>© OpenStreetMap contributors</small>
      </aside>
    </section>
  `;

  const root = host.querySelector<HTMLElement>(".osm-aoi-picker")!;
  const mapHost = host.querySelector<HTMLElement>("[data-aoi-map]")!;
  const drawButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='draw']")!;
  const fitButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='fit']")!;
  const confirmButton = host.querySelector<HTMLButtonElement>("[data-aoi-action='confirm']");
  const citySelect = host.querySelector<HTMLSelectElement>("[data-aoi-city]");
  const coordinateInputs = [...host.querySelectorAll<HTMLInputElement>("[data-aoi-coordinate]")];
  const status = host.querySelector<HTMLElement>("[data-aoi-status]")!;

  function setStatus(message: string, tone: "neutral" | "success" | "error" = "neutral"): void {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function syncControls(): void {
    coordinateInputs.forEach((input, index) => {
      if (document.activeElement !== input) input.value = formatBboxValue(bbox[index] ?? 0);
      input.disabled = Boolean(options.readonly) || busy;
    });
    drawButton.hidden = Boolean(options.readonly);
    drawButton.disabled = busy;
    fitButton.disabled = busy;
    confirmButton && (confirmButton.disabled = busy);
    citySelect && (citySelect.disabled = busy || Boolean(options.readonly));
  }

  function updateMapData(): void {
    const source = map?.getSource("roadgen-aoi") as GeoJSONSource | undefined;
    source?.setData(polygon(bbox));
    const corners: Array<[number, number]> = [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[1]],
      [bbox[2], bbox[3]],
      [bbox[0], bbox[3]],
    ];
    markers.forEach((marker, index) => marker.setLngLat(corners[index]!));
  }

  function commitBbox(next: Wgs84Bbox, notify = true): void {
    if (!finiteBbox(next)) return;
    bbox = [...next];
    syncControls();
    updateMapData();
    if (notify) options.onBboxChange([...bbox]);
  }

  function fitSelection(): void {
    map?.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 56, duration: 280, maxZoom: 18 });
  }

  function finishDrawing(): void {
    drawing = false;
    drawStart = null;
    root.dataset.drawing = "false";
    drawButton.dataset.active = "false";
    drawButton.textContent = zh ? "框选街区" : "Draw area";
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
    setStatus(zh ? "按住并拖拽，绘制新的街区范围。" : "Press and drag to draw a new district extent.");
  }

  const mapInstance = new maplibregl.Map({
    container: mapHost,
    center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    zoom: 14,
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
      layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.25 } }],
    },
  });
  map = mapInstance;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  map.on("load", () => {
    if (destroyed || !map) return;
    map.addSource("roadgen-aoi", { type: "geojson", data: polygon(bbox) });
    map.addLayer({ id: "roadgen-aoi-fill", type: "fill", source: "roadgen-aoi", paint: { "fill-color": "#f4c430", "fill-opacity": 0.2 } });
    map.addLayer({ id: "roadgen-aoi-line", type: "line", source: "roadgen-aoi", paint: { "line-color": "#102d3a", "line-width": 3, "line-dasharray": [2, 1] } });
    if (!options.readonly) {
      const cornerLabels = zh ? ["西南角", "东南角", "东北角", "西北角"] : ["Southwest corner", "Southeast corner", "Northeast corner", "Northwest corner"];
      const cornerPositions: Array<[number, number]> = [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[2], bbox[3]],
        [bbox[0], bbox[3]],
      ];
      cornerLabels.forEach((label, index) => {
        const marker = new maplibregl.Marker({ element: createCornerElement(label), draggable: true })
          .setLngLat(cornerPositions[index]!);
        marker.on("drag", () => {
          const point = marker.getLngLat();
          const next: Wgs84Bbox = [...bbox];
          if (index === 0 || index === 3) next[0] = Math.min(point.lng, next[2] - MIN_SPAN);
          else next[2] = Math.max(point.lng, next[0] + MIN_SPAN);
          if (index === 0 || index === 1) next[1] = Math.min(point.lat, next[3] - MIN_SPAN);
          else next[3] = Math.max(point.lat, next[1] + MIN_SPAN);
          commitBbox(next);
        });
        marker.addTo(map!);
        markers.push(marker);
      });
      updateMapData();
    }
    fitSelection();
  });
  map.on("error", (event) => {
    if (String(event?.error?.message ?? "").toLowerCase().includes("tile")) {
      setStatus(zh ? "OSM 底图瓦片暂时不可用；仍可通过坐标和选区继续操作。" : "OSM tiles are unavailable; coordinates and AOI selection still work.", "error");
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
    if (next[2] - next[0] >= MIN_SPAN && next[3] - next[1] >= MIN_SPAN) commitBbox(next);
  });
  map.on("mouseup", (event) => {
    if (!drawing || !drawStart) return;
    const next = normalizedBbox(drawStart, event.lngLat);
    if (next[2] - next[0] >= MIN_SPAN && next[3] - next[1] >= MIN_SPAN) {
      commitBbox(next);
      setStatus(zh ? "选区已更新。确认后才会获取 OSM。" : "Area updated. OSM will be fetched only after confirmation.", "success");
    }
    finishDrawing();
  });

  drawButton.addEventListener("click", () => drawing ? finishDrawing() : beginDrawing());
  fitButton.addEventListener("click", fitSelection);
  coordinateInputs.forEach((input, index) => {
    input.addEventListener("change", () => {
      const next: Wgs84Bbox = [...bbox];
      next[index] = Number(input.value);
      if (finiteBbox(next)) {
        commitBbox(next);
      } else {
        input.value = formatBboxValue(bbox[index] ?? 0);
        setStatus(zh ? "坐标无效：必须满足 west < east、south < north。" : "Invalid coordinates: west < east and south < north are required.", "error");
      }
    });
  });
  confirmButton?.addEventListener("click", async () => {
    if (busy) return;
    controller.setBusy(true);
    setStatus(zh ? "正在获取道路、建筑、土地利用、树木和 POI…" : "Fetching roads, buildings, land use, trees and POI…");
    try {
      await options.onConfirm([...bbox]);
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
        items.forEach((city) => citySelect.add(new Option(`${city.name_zh} · ${city.name_en} · ${city.province}`, city.name_en)));
        citySelect.addEventListener("change", () => {
          const city = items.find((item) => item.name_en === citySelect.value);
          if (!city || !finiteBbox(city.bbox)) return;
          commitBbox([...city.bbox]);
          fitSelection();
          setStatus(zh ? `已定位到${city.name_zh}，可继续移动地图或重新框选。` : `Located ${city.name_en}; pan or redraw the area if needed.`, "success");
        });
      })
      .catch(() => {
        if (!destroyed) citySelect.replaceChildren(new Option(zh ? "城市目录不可用，仍可自由移动地图" : "City catalog unavailable; pan the map freely", ""));
      });
  }

  const controller: OsmAoiPickerController = {
    setBbox(next, setOptions = {}) {
      if (!finiteBbox(next)) throw new Error("Invalid WGS84 bbox.");
      commitBbox([...next], false);
      if (setOptions.fit) fitSelection();
    },
    fitSelection,
    setBusy(next) {
      busy = next;
      root.dataset.busy = String(next);
      syncControls();
    },
    destroy() {
      destroyed = true;
      markers.forEach((marker) => marker.remove());
      markers.length = 0;
      map?.remove();
      map = null;
      host.replaceChildren();
    },
  };

  syncControls();
  return controller;
}
