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
  server: { host: "127.0.0.1", port: 0 },
});

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(`http://127.0.0.1:${address.port}/src/viewer-camera-surface-diagnostic.ts`);

  const diagnostic = await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { buildCameraSurfaceDiagnostic } = await import("/src/viewer-camera-surface-diagnostic.ts");
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -8, 0, -4,
      8, 0, -4,
      8, 0, 4,
      -8, 0, -4,
      8, 0, 4,
      -8, 0, 4,
    ], 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = "final_vehicle_surface";
    mesh.position.set(10, 0, 20);
    root.add(mesh);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 12, 20);
    camera.lookAt(10, 0, 30);
    camera.updateMatrixWorld(true);
    return buildCameraSurfaceDiagnostic({
      root,
      camera,
      colorMode: "patch",
      text: (en) => en,
      manifest: {
        final_scene: { glb_url: "fixture.glb", label: "fixture" },
        layout_revision: { lineage_id: "fixture", revision: 2, sha256: "abc123" },
        surface_diagnostic: {
          schema_version: "roadgen3d.surface-diagnostic.v1",
          coordinate_space: "local_xz_m",
          source: "final_glb_top_faces",
          node_roles: { final_vehicle_surface: "carriageway" },
          patch_provenance: [{
            patch_id: "junction_1_q1_carriageway",
            junction_id: "junction_1",
            surface_role: "carriageway",
            quadrant_id: "q1",
            from_road_id: 4,
            to_road_id: 7,
            rings_xz: [[[1, 15], [19, 15], [19, 25], [1, 25], [1, 15]]],
          }],
          geometry_qa: { ok: true },
        },
      },
    });
  });

  assert.deepEqual(diagnostic.center_xz, [10, 20], "diagnostic must use the real camera XZ position");
  assert.deepEqual(diagnostic.bounds_xz, [-90, -80, 110, 120], "window must be exactly 200m square");
  assert.equal(diagnostic.source_geometry, "final_glb_top_faces");
  assert.equal(diagnostic.color_mode, "patch");
  assert.equal(diagnostic.role_counts.carriageway, 2);
  assert.equal(diagnostic.triangles[0].source_patch_id, "junction_1_q1_carriageway");
  assert.equal(diagnostic.triangles[0].quadrant_id, "q1");
  assert.equal(diagnostic.triangles[0].from_road_id, 4);
  assert.equal(diagnostic.triangles[0].to_road_id, 7);
  assert.deepEqual(diagnostic.classification_warnings, []);

  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.evaluate(async () => {
    const THREE = await import("/node_modules/three/build/three.module.js");
    const { exportCameraSurfaceDiagnostic } = await import("/src/viewer-camera-surface-diagnostic.ts");
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-5, 0, -5, 5, 0, -5, 0, 0, 5], 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = "road_surface_fixture";
    root.add(mesh);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 1);
    camera.updateMatrixWorld(true);
    await exportCameraSurfaceDiagnostic({
      root,
      camera,
      colorMode: "role",
      text: (en) => en,
      manifest: {
        final_scene: { glb_url: "fixture.glb", label: "fixture" },
        surface_diagnostic: {
          schema_version: "roadgen3d.surface-diagnostic.v1",
          coordinate_space: "local_xz_m",
          source: "final_glb_top_faces",
          node_roles: { road_surface_fixture: "carriageway" },
          patch_provenance: [],
          geometry_qa: { ok: true },
        },
      },
    }, "camera-surface-test");
  });
  await page.waitForFunction(() => true);
  for (let attempt = 0; attempt < 20 && downloads.length < 3; attempt += 1) {
    await page.waitForTimeout(50);
  }
  assert.deepEqual(
    downloads.map((download) => download.suggestedFilename()).sort(),
    ["camera-surface-test.json", "camera-surface-test.png", "camera-surface-test.svg"],
  );
  const svgDownload = downloads.find((download) => download.suggestedFilename().endsWith(".svg"));
  const svgPath = await svgDownload.path();
  const svg = await fs.readFile(svgPath, "utf8");
  assert.match(svg, /<polygon /, "SVG must contain real vector triangles");
  assert.doesNotMatch(svg, /<image /, "SVG must not embed a raster plan");
  assert.match(svg, /data-role="carriageway"/);
} finally {
  await browser?.close();
  await server.close();
}

console.log("surface diagnostic regression passed");
