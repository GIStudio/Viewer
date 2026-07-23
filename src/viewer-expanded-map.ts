/**
 * Expanded Scene Map modal for the RoadGen3D Viewer.
 *
 * The lower-right Scene Map launcher opens this controller directly, making
 * this the single canonical renderer for presentation-scale plan reading.
 */
import * as THREE from "three";
import type { RecentLayout, ViewerManifest } from "./viewer-types";
import { metadataFromManifest, formatMetadataValue } from "./viewer-comparison-metadata";
import {
  worldToMinimap,
  type SceneBounds,
} from "./viewer-minimap";
import {
  LAYERS,
  METRIC_OVERLAYS,
  buildPlanViewports,
  canvasToWorldPoint,
  comparisonTagsForManifest,
  drawPlanViewport,
  focusPlanViewportForMetric,
  setTopDownCamera,
  type ExpandedMapController,
  type ExpandedMapDeps,
  type ExpandedMapLayerKey,
  type ExpandedMapMetricKey,
  type ExpandedMapMode,
  type PlanViewport,
} from "./viewer-plan-map-renderer";

export {
  renderPlanMapCanvas,
  type PlanMapCanvasOptions,
} from "./viewer-plan-map-renderer";

function drawPlanOverlay(
  canvas: HTMLCanvasElement,
  mode: ExpandedMapMode,
  layerState: Record<ExpandedMapLayerKey, boolean>,
  metricOverlay: ExpandedMapMetricKey,
  viewports: PlanViewport[],
  avatarPosition: THREE.Vector3,
  forward: THREE.Vector3,
  text: (en: string, zh: string) => string,
  animationTimeMs = 0,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const cssWidth = Math.max(1, canvas.clientWidth);
  const cssHeight = Math.max(1, canvas.clientHeight);
  const dpr = canvas.width / cssWidth;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mode !== "plan") {
    return;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  if (!viewports.length) {
    ctx.fillStyle = "#f7f6f3";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }
  for (const viewport of viewports) {
    drawPlanViewport(ctx, viewport, layerState, metricOverlay, avatarPosition, forward, text, true, animationTimeMs);
  }
  ctx.restore();
}

function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): void {
  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, "image/png");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}

function compactLabel(value: string, maxLength = 54): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}

function cleanLayoutPath(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function displayLayoutLabel(layout: RecentLayout): string {
  return layout.label || layout.relative_path || layout.source || layout.layout_path;
}

export function createExpandedMapController(deps: ExpandedMapDeps): ExpandedMapController {
  let modalEl: HTMLElement | null = null;
  let panelEl: HTMLElement | null = null;
  let webglHostEl: HTMLElement | null = null;
  let overlayCanvasEl: HTMLCanvasElement | null = null;
  let statusEl: HTMLElement | null = null;
  let compareToggleEl: HTMLInputElement | null = null;
  let compareSelectEl: HTMLSelectElement | null = null;
  let compareTagsEl: HTMLElement | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let mode: ExpandedMapMode = "plan";
  let metricOverlay: ExpandedMapMetricKey = "none";
  let activeClickViewports: Array<{ x: number; y: number; width: number; height: number; bounds: SceneBounds }> = [];
  let compareEnabled = false;
  let recentLayouts: RecentLayout[] = [];
  let comparisonPath = "";
  let comparisonManifest: ViewerManifest | null = null;
  let comparisonLoading = false;
  let comparisonError = "";
  let comparisonOptionsLoading = false;
  let comparisonOptionsError = "";
  let comparisonRequestId = 0;
  let metricAnimationFrame: number | null = null;
  let lastMetricAnimationMs = 0;
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 5000);
  camera.up.set(0, 0, -1);
  const layerState: Record<ExpandedMapLayerKey, boolean> = {
    roads: true,
    surfaces: true,
    buildings: true,
    furniture: true,
    viewpoint: true,
  };

  function currentLayoutPath(): string {
    return cleanLayoutPath(deps.getLayoutPath() || deps.getManifest()?.layout_path);
  }

  function comparisonCandidateLayouts(): RecentLayout[] {
    const currentPath = currentLayoutPath();
    const byPath = new Map<string, RecentLayout>();
    for (const layout of recentLayouts) {
      const path = cleanLayoutPath(layout.layout_path);
      if (!path || path === currentPath || byPath.has(path)) {
        continue;
      }
      byPath.set(path, { ...layout, layout_path: path });
    }
    if (comparisonPath && comparisonPath !== currentPath && !byPath.has(comparisonPath)) {
      byPath.set(comparisonPath, {
        id: comparisonPath,
        label: comparisonPath.split("/").slice(-2).join("/"),
        layout_path: comparisonPath,
        created_at: "",
        source: "direct",
      });
    }
    return Array.from(byPath.values());
  }

  function renderTagChips(manifest: ViewerManifest | null): string {
    if (!manifest) {
      return `<span class="viewer-expanded-map-tag" data-empty="true">${escapeHtml(deps.text("Unknown", "未知"))}</span>`;
    }
    return comparisonTagsForManifest(manifest, deps.text)
      .map((tag) => `
        <span class="viewer-expanded-map-tag" data-empty="${tag.value === "Unknown" ? "true" : "false"}">
          <em>${escapeHtml(tag.label)}</em>${escapeHtml(tag.value || "Unknown")}
        </span>
      `).join("");
  }

  function renderCompareTagsHtml(): string {
    const currentManifest = deps.getManifest();
    const compareTitle = comparisonLoading
      ? deps.text("Compare · loading", "对比 · 加载中")
      : comparisonError
        ? deps.text("Compare · failed", "对比 · 加载失败")
        : deps.text("Compare", "对比");
    return `
      <div class="viewer-expanded-map-tagset">
        <strong>${escapeHtml(deps.text("Current", "当前"))}</strong>
        <div>${renderTagChips(currentManifest)}</div>
      </div>
      <div class="viewer-expanded-map-tagset" data-state="${comparisonError ? "error" : comparisonLoading ? "loading" : "ready"}">
        <strong>${escapeHtml(compareTitle)}</strong>
        <div>${comparisonError ? `<span class="viewer-expanded-map-tag" data-empty="true">${escapeHtml(comparisonError)}</span>` : renderTagChips(comparisonManifest)}</div>
      </div>
    `;
  }

  function syncCompareControls(): void {
    if (compareToggleEl) {
      compareToggleEl.checked = compareEnabled;
      compareToggleEl.closest<HTMLElement>(".viewer-expanded-map-compare-toggle")
        ?.setAttribute("data-active", compareEnabled ? "true" : "false");
    }
    if (compareSelectEl) {
      const candidates = comparisonCandidateLayouts();
      const disabled = !compareEnabled || comparisonOptionsLoading || candidates.length === 0;
      compareSelectEl.disabled = disabled;
      const placeholder = comparisonOptionsLoading
        ? deps.text("Loading recent results...", "正在加载最近结果...")
        : comparisonOptionsError
          ? deps.text("Recent results unavailable", "最近结果不可用")
          : candidates.length
          ? deps.text("Select comparison scene", "选择对比场景")
          : deps.text("No other generated results", "没有其他生成结果");
      compareSelectEl.innerHTML = `
        <option value="">${escapeHtml(placeholder)}</option>
        ${candidates.map((layout) => `
          <option value="${escapeHtml(layout.layout_path)}" ${layout.layout_path === comparisonPath ? "selected" : ""}>
            ${escapeHtml(compactLabel(displayLayoutLabel(layout), 76))}
          </option>
        `).join("")}
      `;
      compareSelectEl.value = candidates.some((layout) => layout.layout_path === comparisonPath) ? comparisonPath : "";
    }
    if (compareTagsEl) {
      compareTagsEl.hidden = !compareEnabled;
      compareTagsEl.innerHTML = renderCompareTagsHtml();
    }
    if (panelEl) {
      panelEl.dataset.compareActive = compareEnabled && mode === "plan" && Boolean(comparisonManifest) ? "true" : "false";
    }
  }

  async function loadComparisonOptions(): Promise<void> {
    comparisonOptionsLoading = true;
    comparisonOptionsError = "";
    syncCompareControls();
    try {
      recentLayouts = await deps.loadRecentLayouts(50, false);
      if (compareEnabled && !comparisonPath) {
        comparisonPath = comparisonCandidateLayouts()[0]?.layout_path ?? "";
      }
    } catch (error) {
      comparisonOptionsError = error instanceof Error ? error.message : String(error ?? "");
      recentLayouts = [];
    } finally {
      comparisonOptionsLoading = false;
      syncCompareControls();
      if (compareEnabled && comparisonPath) {
        void loadComparisonManifest(comparisonPath);
      } else {
        render();
      }
    }
  }

  async function loadComparisonManifest(layoutPath: string): Promise<void> {
    const path = cleanLayoutPath(layoutPath);
    comparisonPath = path;
    comparisonManifest = null;
    comparisonError = "";
    if (!path) {
      comparisonLoading = false;
      syncCompareControls();
      render();
      return;
    }
    const requestId = ++comparisonRequestId;
    comparisonLoading = true;
    syncCompareControls();
    render();
    try {
      const manifest = await deps.loadManifest(path);
      if (requestId !== comparisonRequestId) {
        return;
      }
      comparisonManifest = manifest;
      comparisonError = "";
    } catch (error) {
      if (requestId !== comparisonRequestId) {
        return;
      }
      comparisonError = error instanceof Error ? error.message : String(error ?? "");
      comparisonManifest = null;
    } finally {
      if (requestId === comparisonRequestId) {
        comparisonLoading = false;
        syncCompareControls();
        render();
      }
    }
  }

  function ensureRenderer(): void {
    if (!webglHostEl) {
      return;
    }
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(0xf7f6f3);
    }
    if (renderer.domElement.parentElement !== webglHostEl) {
      webglHostEl.appendChild(renderer.domElement);
    }
  }

  function syncModeButtons(): void {
    modalEl?.querySelectorAll<HTMLButtonElement>("[data-expanded-map-mode]").forEach((button) => {
      button.dataset.active = button.dataset.expandedMapMode === mode ? "true" : "false";
    });
    if (panelEl) {
      panelEl.dataset.mapMode = mode;
    }
  }

  function syncLayerButtons(): void {
    modalEl?.querySelectorAll<HTMLInputElement>("[data-expanded-map-layer]").forEach((input) => {
      const key = input.dataset.expandedMapLayer as ExpandedMapLayerKey | undefined;
      if (!key) {
        return;
      }
      input.checked = layerState[key];
      input.closest<HTMLElement>(".viewer-expanded-map-layer")?.setAttribute("data-active", layerState[key] ? "true" : "false");
    });
  }

  function syncMetricButtons(): void {
    modalEl?.querySelectorAll<HTMLInputElement>("[data-expanded-map-metric]").forEach((input) => {
      const key = input.dataset.expandedMapMetric as ExpandedMapMetricKey | undefined;
      if (!key) {
        return;
      }
      input.checked = key === metricOverlay;
      input.closest<HTMLElement>(".viewer-expanded-map-metric")?.setAttribute("data-active", key === metricOverlay ? "true" : "false");
    });
  }

  function resize(): void {
    if (!webglHostEl || !overlayCanvasEl || !renderer) {
      return;
    }
    const width = Math.max(1, webglHostEl.clientWidth);
    const height = Math.max(1, webglHostEl.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    overlayCanvasEl.width = Math.max(1, Math.round(width * dpr));
    overlayCanvasEl.height = Math.max(1, Math.round(height * dpr));
    overlayCanvasEl.style.width = `${width}px`;
    overlayCanvasEl.style.height = `${height}px`;
  }

  function render(): void {
    if (!modalEl || !webglHostEl || !overlayCanvasEl) {
      return;
    }
    ensureRenderer();
    resize();
    const root = deps.getRoot();
    const bounds = deps.getBounds();
    const manifest = deps.getManifest();
    if (!renderer || !root || !bounds || !manifest) {
      overlayCanvasEl.getContext("2d")?.clearRect(0, 0, overlayCanvasEl.width, overlayCanvasEl.height);
      activeClickViewports = [];
      if (statusEl) {
        statusEl.textContent = deps.text("No scene loaded", "未加载场景");
      }
      return;
    }
    const width = Math.max(1, webglHostEl.clientWidth);
    const height = Math.max(1, webglHostEl.clientHeight);
    if (mode === "presentation") {
      const presentationBounds = setTopDownCamera(camera, bounds, width, height);
      activeClickViewports = [{ x: 0, y: 0, width, height, bounds: presentationBounds }];
      renderer.render(deps.scene, camera);
    } else {
      const activeComparisonManifest = compareEnabled ? comparisonManifest : null;
      const planViewports = buildPlanViewports(
        manifest,
        activeComparisonManifest,
        bounds,
        width,
        height,
        deps.text,
      ).map((viewport) => focusPlanViewportForMetric(viewport, metricOverlay));
      activeClickViewports = planViewports.map((viewport) => ({
        x: viewport.x,
        y: viewport.y,
        width: viewport.width,
        height: viewport.height,
        bounds: viewport.bounds,
      }));
      renderer.setClearColor(0xf7f6f3, 1);
      renderer.clear(true, true, true);
      drawPlanOverlay(
        overlayCanvasEl,
        mode,
        layerState,
        metricOverlay,
        planViewports,
        deps.getAvatarPosition(),
        deps.cameraForwardHorizontal(),
        deps.text,
        performance.now(),
      );
    }
    if (mode === "presentation") {
      drawPlanOverlay(
        overlayCanvasEl,
        mode,
        layerState,
        metricOverlay,
        [],
        deps.getAvatarPosition(),
        deps.cameraForwardHorizontal(),
        deps.text,
      );
    }
    syncCompareControls();
    if (statusEl) {
      statusEl.textContent = mode === "presentation"
        ? deps.text("Presentation view", "展示视图")
        : compareEnabled && comparisonLoading
          ? deps.text("Plan map · loading comparison", "平面图 · 正在加载对比")
          : compareEnabled && comparisonError
            ? deps.text("Plan map · comparison failed", "平面图 · 对比加载失败")
            : compareEnabled && comparisonManifest
              ? deps.text("Plan map · comparison", "平面图 · 对比")
              : deps.text("Plan map", "平面图");
    }
    scheduleMetricAnimation();
  }

  function scheduleMetricAnimation(): void {
    const active = modalEl !== null && mode === "plan" && metricOverlay === "curb_ramps";
    if (!active || metricAnimationFrame !== null) {
      return;
    }
    metricAnimationFrame = requestAnimationFrame((timestamp) => {
      metricAnimationFrame = null;
      if (!modalEl || mode !== "plan" || metricOverlay !== "curb_ramps") {
        return;
      }
      if (timestamp - lastMetricAnimationMs >= 250) {
        lastMetricAnimationMs = timestamp;
        drawMetricAnimationFrame(timestamp);
        scheduleMetricAnimation();
      } else {
        scheduleMetricAnimation();
      }
    });
  }

  function drawMetricAnimationFrame(timestamp: number): void {
    if (!overlayCanvasEl || !webglHostEl || mode !== "plan" || metricOverlay !== "curb_ramps") {
      return;
    }
    const bounds = deps.getBounds();
    const manifest = deps.getManifest();
    if (!bounds || !manifest) {
      return;
    }
    const width = Math.max(1, webglHostEl.clientWidth);
    const height = Math.max(1, webglHostEl.clientHeight);
    const planViewports = buildPlanViewports(
      manifest,
      compareEnabled ? comparisonManifest : null,
      bounds,
      width,
      height,
      deps.text,
    ).map((viewport) => focusPlanViewportForMetric(viewport, metricOverlay));
    drawPlanOverlay(
      overlayCanvasEl,
      mode,
      layerState,
      metricOverlay,
      planViewports,
      deps.getAvatarPosition(),
      deps.cameraForwardHorizontal(),
      deps.text,
      timestamp,
    );
  }

  function setMode(nextMode: ExpandedMapMode): void {
    mode = nextMode;
    syncModeButtons();
    render();
  }

  function close(): void {
    if (metricAnimationFrame !== null) {
      cancelAnimationFrame(metricAnimationFrame);
      metricAnimationFrame = null;
    }
    modalEl?.remove();
    modalEl = null;
    panelEl = null;
    webglHostEl = null;
    overlayCanvasEl = null;
    statusEl = null;
    compareToggleEl = null;
    compareSelectEl = null;
    compareTagsEl = null;
    activeClickViewports = [];
  }

  function exportCurrentView(): void {
    if (!renderer || !overlayCanvasEl) {
      return;
    }
    render();
    const sourceCanvas = renderer.domElement;
    const output = document.createElement("canvas");
    output.width = sourceCanvas.width;
    output.height = sourceCanvas.height;
    const ctx = output.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(sourceCanvas, 0, 0, output.width, output.height);
    if (mode === "plan") {
      ctx.drawImage(overlayCanvasEl, 0, 0, output.width, output.height);
    }
    downloadCanvas(output, mode === "plan" ? "scene_map_plan" : "scene_map_presentation");
  }

  function handleMapClick(event: MouseEvent): void {
    if (!overlayCanvasEl || !activeClickViewports.length) {
      return;
    }
    const rect = overlayCanvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const viewport = activeClickViewports.find((item) => (
      localX >= item.x
      && localX <= item.x + item.width
      && localY >= item.y
      && localY <= item.y + item.height
    ));
    if (!viewport) {
      return;
    }
    const world = canvasToWorldPoint(
      localX - viewport.x,
      localY - viewport.y,
      viewport.bounds,
      viewport.width,
      viewport.height,
    );
    deps.flyCameraTo(world.x, Math.max(0, deps.getAvatarPosition().y), world.z);
  }

  function open(): void {
    if (modalEl) {
      render();
      return;
    }
    const layerControls = LAYERS.map((layer) => `
      <label class="viewer-expanded-map-layer" data-active="${layerState[layer.key] ? "true" : "false"}">
        <input type="checkbox" data-expanded-map-layer="${layer.key}" ${layerState[layer.key] ? "checked" : ""} />
        <span>${deps.text(layer.en, layer.zh)}</span>
      </label>
    `).join("");
    const metricControls = METRIC_OVERLAYS.map((metric) => `
      <label class="viewer-expanded-map-metric" data-active="${metricOverlay === metric.key ? "true" : "false"}">
        <input type="radio" name="viewer-expanded-map-metric" data-expanded-map-metric="${metric.key}" ${metricOverlay === metric.key ? "checked" : ""} />
        <span>${deps.text(metric.en, metric.zh)}</span>
      </label>
    `).join("");
    modalEl = document.createElement("div");
    modalEl.className = "viewer-expanded-map-modal";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.innerHTML = `
      <div class="viewer-expanded-map-backdrop" data-expanded-map-close="true"></div>
      <section class="viewer-expanded-map-panel" data-map-mode="${mode}" aria-labelledby="viewer-expanded-map-title">
        <header class="viewer-expanded-map-header">
          <div class="viewer-expanded-map-heading">
            <h2 id="viewer-expanded-map-title">${deps.text("Scene Map", "场景地图")}</h2>
            <span class="viewer-expanded-map-status">${deps.text("Plan map", "平面图")}</span>
          </div>
          <div class="viewer-expanded-map-actions">
            <div class="viewer-expanded-map-mode" role="group" aria-label="${deps.text("Map mode", "地图模式")}">
              <button type="button" data-expanded-map-mode="plan" data-active="true">${deps.text("Plan", "平面")}</button>
              <button type="button" data-expanded-map-mode="presentation">${deps.text("Presentation", "展示")}</button>
            </div>
            <button class="viewer-expanded-map-export" type="button" data-expanded-map-export="true">${deps.text("Export PNG", "导出 PNG")}</button>
            <button class="viewer-expanded-map-close" type="button" data-expanded-map-close="true" aria-label="${deps.text("Close", "关闭")}">&times;</button>
          </div>
        </header>
        <div class="viewer-expanded-map-layerbar">${layerControls}</div>
        <div class="viewer-expanded-map-metricbar">
          <span class="viewer-expanded-map-metricbar-label">${deps.text("Metric overlay", "指标叠加")}</span>
          <div class="viewer-expanded-map-metricbar-options">${metricControls}</div>
        </div>
        <div class="viewer-expanded-map-comparebar">
          <label class="viewer-expanded-map-compare-toggle" data-active="${compareEnabled ? "true" : "false"}">
            <input type="checkbox" data-expanded-map-compare-toggle="true" ${compareEnabled ? "checked" : ""} />
            <span>${deps.text("Compare", "对比")}</span>
          </label>
          <label class="viewer-expanded-map-compare-select">
            <span>${deps.text("Comparison scene", "对比场景")}</span>
            <select data-expanded-map-compare-select="true"></select>
          </label>
          <div class="viewer-expanded-map-compare-tags" hidden></div>
        </div>
        <div class="viewer-expanded-map-stage">
          <div class="viewer-expanded-map-webgl"></div>
          <canvas class="viewer-expanded-map-overlay"></canvas>
        </div>
      </section>
    `;
    document.body.appendChild(modalEl);
    panelEl = modalEl.querySelector<HTMLElement>(".viewer-expanded-map-panel");
    webglHostEl = modalEl.querySelector<HTMLElement>(".viewer-expanded-map-webgl");
    overlayCanvasEl = modalEl.querySelector<HTMLCanvasElement>(".viewer-expanded-map-overlay");
    statusEl = modalEl.querySelector<HTMLElement>(".viewer-expanded-map-status");
    compareToggleEl = modalEl.querySelector<HTMLInputElement>("[data-expanded-map-compare-toggle]");
    compareSelectEl = modalEl.querySelector<HTMLSelectElement>("[data-expanded-map-compare-select]");
    compareTagsEl = modalEl.querySelector<HTMLElement>(".viewer-expanded-map-compare-tags");
    ensureRenderer();
    syncModeButtons();
    syncLayerButtons();
    syncMetricButtons();
    syncCompareControls();

    modalEl.querySelectorAll<HTMLElement>("[data-expanded-map-close]").forEach((element) => {
      element.addEventListener("click", close);
    });
    modalEl.querySelectorAll<HTMLButtonElement>("[data-expanded-map-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextMode = button.dataset.expandedMapMode === "presentation" ? "presentation" : "plan";
        setMode(nextMode);
      });
    });
    modalEl.querySelector<HTMLButtonElement>("[data-expanded-map-export]")?.addEventListener("click", exportCurrentView);
    modalEl.querySelectorAll<HTMLInputElement>("[data-expanded-map-layer]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.expandedMapLayer as ExpandedMapLayerKey | undefined;
        if (!key) {
          return;
        }
        layerState[key] = input.checked;
        syncLayerButtons();
        render();
      });
    });
    modalEl.querySelectorAll<HTMLInputElement>("[data-expanded-map-metric]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.expandedMapMetric as ExpandedMapMetricKey | undefined;
        if (!key || !input.checked) {
          return;
        }
        metricOverlay = key;
        syncMetricButtons();
        render();
      });
    });
    compareToggleEl?.addEventListener("change", () => {
      compareEnabled = Boolean(compareToggleEl?.checked);
      syncCompareControls();
      if (compareEnabled && recentLayouts.length === 0 && !comparisonOptionsLoading) {
        void loadComparisonOptions();
        return;
      }
      if (compareEnabled && !comparisonPath) {
        comparisonPath = comparisonCandidateLayouts()[0]?.layout_path ?? "";
      }
      if (compareEnabled && comparisonPath && !comparisonManifest && !comparisonLoading) {
        void loadComparisonManifest(comparisonPath);
        return;
      }
      render();
    });
    compareSelectEl?.addEventListener("change", () => {
      void loadComparisonManifest(compareSelectEl?.value ?? "");
    });
    overlayCanvasEl?.addEventListener("click", handleMapClick);
    modalEl.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
      }
    });
    modalEl.tabIndex = -1;
    modalEl.focus();
    void loadComparisonOptions();
    requestAnimationFrame(() => render());
  }

  function dispose(): void {
    close();
    renderer?.dispose();
    renderer = null;
  }

  return {
    open,
    close,
    render,
    resize,
    dispose,
    isOpen: () => modalEl !== null,
  };
}
