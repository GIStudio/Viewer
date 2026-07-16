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
    if (url.endsWith("/api/scene-sources/osm")) {
      osmRequestCount += 1;
      submittedBbox = (await route.request().postDataJSON()).aoi_bbox;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(normalizedOsmPayload(submittedBbox)) });
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
  assert.equal(osmRequestCount, 0, "opening or adjusting the AOI must not fetch Overpass data");

  const westInput = page.locator('[data-aoi-coordinate="0"]');
  await westInput.fill("113.267000");
  await westInput.press("Tab");
  assert.equal(osmRequestCount, 0, "coordinate changes remain a local preview");
  assert.match(await page.locator("#scene-source-bbox").inputValue(), /^113\.267000,/);

  await page.locator('[data-aoi-action="draw"]').click();
  const mapBox = await page.locator("[data-aoi-map]").boundingBox();
  assert.ok(mapBox);
  await page.mouse.move(mapBox.x + mapBox.width * 0.32, mapBox.y + mapBox.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + mapBox.width * 0.62, mapBox.y + mapBox.height * 0.67, { steps: 4 });
  await page.mouse.up();
  assert.equal(osmRequestCount, 0, "dragging a rectangle must not fetch OSM automatically");

  await page.locator('[data-aoi-action="confirm"]').click();
  await page.locator("#annotation-board").waitFor({ state: "visible" });
  assert.equal(osmRequestCount, 1, "confirming the AOI submits exactly one OSM request");
  assert.ok(Array.isArray(submittedBbox) && submittedBbox.length === 4);
  assert.equal(await page.locator("#scene-osm-aoi-picker").isVisible(), false, "the shared annotation canvas replaces the picker after normalization");
  assert.equal(await page.locator("#annotation-osm-map").isVisible(), true, "professional annotation retains the aligned OSM basemap");
  await page.getByText("professional-osm", { exact: true }).first().waitFor();
  assert.deepEqual(browserErrors, [], `professional OSM flow must not emit page errors: ${browserErrors.join(" | ")}`);

  console.log("professional OSM AOI: explicit selection, single fetch, shared annotation canvas, and no HKUST default verified");
} finally {
  await browser?.close();
  await server.close();
}
