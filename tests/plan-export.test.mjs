import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const viewerRoot = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  configFile: false,
  root: viewerRoot,
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 0,
  },
});

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object", "Vite must expose its test server address.");
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ acceptDownloads: true });

  // Establish a same-origin document without booting the full viewer application.
  await page.goto(`${origin}/src/viewer-export.ts`);

  const manifest = {
    final_scene: {
      glb_url: "fixture.glb",
      label: "Plan export fixture",
    },
    summary: {
      osm_geometry: {
        carriageway_rings: [
          [[-20, -2], [20, -2], [20, 2], [-20, 2]],
        ],
      },
    },
    layout_overlay: {
      building_footprints: [
        { points_xz: [[-6, -6], [6, -6], [6, 6], [-6, 6]] },
      ],
    },
    instances: {},
  };
  const bounds = {
    minX: -20,
    maxX: 20,
    minZ: -20,
    maxZ: 20,
    center: { x: 0, y: 0, z: 0 },
    extent: 20,
  };

  const canonical = await page.evaluate(async ({ fixtureManifest, fixtureBounds }) => {
    const { renderPlanMapCanvas } = await import("/src/viewer-expanded-map.ts");
    const text = (en) => en;
    const avatarPosition = { x: 18, y: 0, z: 18 };
    const forward = { x: 1, y: 0, z: 0 };
    const canvas = renderPlanMapCanvas({
      manifest: fixtureManifest,
      bounds: fixtureBounds,
      avatarPosition,
      forward,
      text,
    });
    const withoutBuilding = renderPlanMapCanvas({
      manifest: {
        ...fixtureManifest,
        layout_overlay: { building_footprints: [] },
      },
      bounds: fixtureBounds,
      avatarPosition,
      forward,
      text,
    });
    const center = [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)];
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      footprintPixel: Array.from(canvas.getContext("2d").getImageData(center[0], center[1], 1, 1).data),
      noFootprintPixel: Array.from(withoutBuilding.getContext("2d").getImageData(center[0], center[1], 1, 1).data),
    };
  }, { fixtureManifest: manifest, fixtureBounds: bounds });

  assert.notDeepEqual(
    canonical.footprintPixel,
    canonical.noFootprintPixel,
    "The canonical plan compositor must paint manifest building footprints into the rendered plan.",
  );

  await page.evaluate(async ({ fixtureManifest, fixtureBounds }) => {
    const { exportTopDownMapPng } = await import("/src/viewer-export.ts");
    window.runPlanPngExport = () => exportTopDownMapPng({
      manifest: fixtureManifest,
      bounds: fixtureBounds,
      avatarPosition: { x: 18, y: 0, z: 18 },
      forward: { x: 1, y: 0, z: 0 },
      text: (en) => en,
    }, "plan-export-regression");
  }, { fixtureManifest: manifest, fixtureBounds: bounds });
  const pngDownloadPromise = page.waitForEvent("download");
  await page.evaluate(() => window.runPlanPngExport());
  const pngDownload = await pngDownloadPromise;
  const pngPath = await pngDownload.path();
  assert.ok(pngPath, "PNG export must produce a downloadable payload.");
  const pngBytes = await fs.readFile(pngPath);

  assert.deepEqual(
    pngBytes.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "PNG export must emit a valid PNG payload.",
  );
  assert.equal(pngBytes.readUInt32BE(16), canonical.width, "PNG width must match the canonical plan canvas.");
  assert.equal(pngBytes.readUInt32BE(20), canonical.height, "PNG height must match the canonical plan canvas.");
  assert.deepEqual(
    pngBytes,
    Buffer.from(canonical.dataUrl.split(",", 2)[1], "base64"),
    "PNG export must contain the exact canonical manifest-driven plan image.",
  );

  await page.evaluate(async ({ fixtureManifest, fixtureBounds }) => {
    const { exportTopDownMapSvg } = await import("/src/viewer-export.ts");
    window.runPlanSvgExport = () => exportTopDownMapSvg({
      manifest: fixtureManifest,
      bounds: fixtureBounds,
      avatarPosition: { x: 18, y: 0, z: 18 },
      forward: { x: 1, y: 0, z: 0 },
      text: (en) => en,
    }, "plan-export-regression");
  }, { fixtureManifest: manifest, fixtureBounds: bounds });
  const svgDownloadPromise = page.waitForEvent("download");
  await page.evaluate(() => window.runPlanSvgExport());
  const svgDownload = await svgDownloadPromise;
  const svgPath = await svgDownload.path();
  assert.ok(svgPath, "SVG export must produce a downloadable payload.");
  const svg = await fs.readFile(svgPath, "utf8");

  assert.equal(
    svg.includes("Scene Top-Down View"),
    false,
    "SVG export must not contain the obsolete Scene Top-Down View placeholder.",
  );
  const embeddedPlan = svg.match(/<image\s+href="data:image\/png;base64,([^"]+)"[^>]*>/);
  assert.ok(embeddedPlan, "SVG export must embed the canonical plan as a PNG image element.");
  assert.deepEqual(
    Buffer.from(embeddedPlan[1], "base64"),
    pngBytes,
    "SVG export must embed the exact same plan image as the PNG export.",
  );

  console.log("plan-export regression: canonical manifest plan is identical in PNG and SVG payloads");
} finally {
  await browser?.close();
  await server.close();
}
