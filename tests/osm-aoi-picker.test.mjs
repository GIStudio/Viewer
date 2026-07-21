import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: new URL("../", import.meta.url).pathname,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});

function normalizedOsmPayload(bbox) {
  return {
    annotation: {
      version: "roadgen3d_reference_annotation_v2",
      plan_id: "professional-osm",
      image_path: "",
      image_width_px: 1000,
      image_height_px: 900,
      pixels_per_meter: 2,
      centerlines: [],
      junctions: [],
      roundabouts: [],
      control_points: [],
      regions: [],
      derived_regions: [],
      building_regions: [],
      functional_zones: [],
      surface_annotations: [],
      station_strip_patches: [],
      junction_compositions: [],
    },
    graph: { nodes: [], edges: [] },
    summary: {},
    source: {
      schema_version: "roadgen3d_scene_source_v1",
      source_id: "professional-osm",
      kind: "geojson",
      producer: "osm",
      normalized_annotation_version: "roadgen3d_reference_annotation_v2",
    },
    geojson: { type: "FeatureCollection", features: [] },
    warnings: [],
    aligned_buildings: [],
    source_alignment: {
      status: "aligned",
      source_frame: { bbox_wgs84: bbox },
    },
  };
}

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  let osmRequestCount = 0;
  let hkustImageRequestCount = 0;
  let submittedBbox = null;
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/reference-plans/hkust_gz_gate/image")) {
      hkustImageRequestCount += 1;
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      return;
    }
    if (url.endsWith("/api/geo/china-cities")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ name_zh: "广州", name_en: "guangzhou", province: "广东省", bbox: [113.266, 23.128, 113.271, 23.1325] }] }),
      });
      return;
    }
    if (url.endsWith("/api/scene-sources/osm/jobs")) {
      osmRequestCount += 1;
      submittedBbox = (await route.request().postDataJSON()).aoi_bbox;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        id: "osm-fixture-job",
        kind: "osm_acquisition",
        status: "succeeded",
        stage: "preview_ready",
        progress: 100,
        message: "ready",
        detail: {},
        operations: [],
        error: "",
        result: {
          preview_id: "preview-fixture",
          source_id: "professional-osm",
          retrieval_bbox: submittedBbox,
          logical_roads: { type: "FeatureCollection", features: [] },
          context_geojson: { type: "FeatureCollection", features: [] },
          feature_counts: { logical_roads: 0, buildings: 0 },
          cache_hit: false,
          fingerprint: "fixture",
        },
      }) });
      return;
    }
    if (url.endsWith("/api/reference-plans")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
      return;
    }
    if (url.endsWith("/api/scenario-designs")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schema_version: "fixture", graph_template_id: "", items: [] }) });
      return;
    }
    if (url.endsWith("/api/health")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ capabilities: {} }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "fixture" }) });
  });

  await page.goto(`${origin}/#scene-graph`);
  await page.waitForLoadState("networkidle");
  const picker = page.locator("#scene-osm-aoi-picker .osm-aoi-picker");
  await picker.waitFor({ state: "visible" });
  assert.equal(await page.locator("#annotation-board").isVisible(), false, "annotation canvas waits for an explicit source");
  assert.equal(hkustImageRequestCount, 0, "HKUST-GZ must not be fetched as an implicit default");
  assert.equal(osmRequestCount, 0, "opening and browsing the map must not fetch Overpass data");
  assert.equal(await picker.getAttribute("data-has-selection"), "false", "Guangzhou is an initial map view, not a preselected AOI");
  assert.equal(await page.locator('[data-aoi-action="confirm"]').isVisible(), true, "the panel always exposes the next primary action");
  assert.match(await page.locator('[data-aoi-action="confirm"]').innerText(), /截取当前视野|capture current view/i);
  assert.equal(await page.locator('[data-aoi-coordinate="0"]').isVisible(), false, "coordinate inputs are advanced controls, not the default workflow");
  assert.equal(await page.locator("#scene-source-bbox").count(), 0, "the source drawer no longer duplicates the coordinate form");

  const mapBox = await page.locator("[data-aoi-map]").boundingBox();
  assert.ok(mapBox && mapBox.width > 800 && mapBox.height > 300, `OSM map must fill the stage, received ${JSON.stringify(mapBox)}`);
  const sourcePanelBox = await page.locator("#desktop-shell-tab-panel-source").boundingBox();
  assert.ok(sourcePanelBox && mapBox.x >= sourcePanelBox.x + sourcePanelBox.width - 1, `the source drawer must reserve layout space instead of covering the OSM map: ${JSON.stringify({ sourcePanelBox, mapBox })}`);
  await page.locator("[data-aoi-city]").selectOption("guangzhou");
  assert.equal(osmRequestCount, 0, "city navigation only changes the map view");

  await page.locator('[data-aoi-action="confirm"]').click();
  assert.equal(await picker.getAttribute("data-has-selection"), "true", "the current map viewport becomes a candidate AOI");
  assert.equal(await page.locator('[data-aoi-action="confirm"]').isVisible(), true);
  assert.equal(osmRequestCount, 0, "capturing the current view remains a local action");

  await page.locator('[data-aoi-action="draw"]').click();
  await page.mouse.move(mapBox.x + mapBox.width * 0.32, mapBox.y + mapBox.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + mapBox.width * 0.62, mapBox.y + mapBox.height * 0.67, { steps: 4 });
  await page.mouse.up();
  assert.match(await page.locator("[data-aoi-kicker]").innerText(), /精确框选|precise draw/i, "drawing replaces the viewport capture");
  assert.equal(osmRequestCount, 0, "dragging a rectangle must not fetch OSM automatically");

  await page.locator(".osm-aoi-coordinate-details summary").click();
  const preciseBbox = [113.267, 23.129, 113.2705, 23.132];
  for (let index = 0; index < preciseBbox.length; index += 1) {
    await page.locator(`[data-aoi-coordinate="${index}"]`).fill(String(preciseBbox[index]));
  }
  await page.locator('[data-aoi-action="coordinates"]').click();
  assert.match(await page.locator("[data-aoi-kicker]").innerText(), /坐标定位|coordinates/i);
  assert.equal(osmRequestCount, 0, "advanced coordinates only update the candidate AOI");

  await page.locator('[data-aoi-action="confirm"]').click();
  await page.locator(".osm-road-study-picker").waitFor({ state: "visible" });
  assert.equal(osmRequestCount, 1, "confirming the AOI submits exactly one OSM request");
  assert.deepEqual(submittedBbox, preciseBbox, "the confirmed coordinate AOI is submitted exactly");
  assert.equal(await page.locator("#annotation-board").isVisible(), false, "road selection precedes the shared annotation canvas");
  assert.deepEqual(browserErrors, [], `professional OSM flow must not emit page errors: ${browserErrors.join(" | ")}`);

  console.log("professional OSM AOI: explicit capture, single async fetch, road-selection handoff, and no HKUST default verified");
} finally {
  await browser?.close();
  await server.close();
}
