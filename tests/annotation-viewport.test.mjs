import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: new URL("../", import.meta.url).pathname,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});

const referenceSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
    <rect width="1200" height="720" fill="#f3f0e7"/>
    <path d="M80 620 L1120 100" stroke="#174b64" stroke-width="52"/>
  </svg>
`;

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object", "Vite must expose its test server address.");
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.route("**/api/reference-plans/hkust_gz_gate/image", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: referenceSvg,
  }));
  await page.route("**/api/reference-plans", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [] }),
  }));
  await page.route("**/api/scenario-designs", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [] }),
  }));
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ capabilities: {} }),
  }));

  await page.goto(`${origin}/#scene-graph`);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("#scene-osm-aoi-picker").isVisible(), true, "professional 01A must open with the OSM selector");
  await page.locator("#annotation-plan-select").evaluate((element) => {
    element.value = "hkust_gz_gate";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const stage = page.locator("#annotation-stage");
  const board = page.locator("#annotation-board");
  const zoomLevel = page.locator("#annotation-zoom-level");
  await board.waitFor({ state: "visible" });
  assert.equal((await zoomLevel.textContent())?.trim(), "100%", "annotation canvas must start fitted to width");

  const baselineRect = await board.boundingBox();
  const stageRect = await stage.boundingBox();
  assert.ok(baselineRect && stageRect, "annotation stage and board must have measurable bounds");
  await page.mouse.move(stageRect.x + stageRect.width * 0.55, stageRect.y + stageRect.height * 0.55);
  await page.mouse.wheel(0, -420);
  await page.waitForTimeout(80);

  const zoomedPercent = Number.parseInt((await zoomLevel.textContent()) ?? "0", 10);
  const zoomedRect = await board.boundingBox();
  assert.ok(zoomedPercent > 100, "mouse wheel must zoom the annotation canvas in");
  assert.ok(zoomedRect && zoomedRect.width > baselineRect.width, "reference image and SVG overlay must scale together");

  await page.locator('[data-tool="control_point"]').evaluate((element) => element.click());
  const annotationClick = {
    x: stageRect.x + stageRect.width * 0.48,
    y: stageRect.y + stageRect.height * 0.5,
  };
  const expectedImagePoint = {
    x: ((annotationClick.x - zoomedRect.x) / zoomedRect.width) * 1200,
    y: ((annotationClick.y - zoomedRect.y) / zoomedRect.height) * 720,
  };
  await page.mouse.click(annotationClick.x, annotationClick.y);
  const controlPoint = page.locator(".annotation-control-point").last();
  await controlPoint.waitFor();
  const authoredPoint = {
    x: Number(await controlPoint.getAttribute("cx")),
    y: Number(await controlPoint.getAttribute("cy")),
  };
  assert.ok(Math.abs(authoredPoint.x - expectedImagePoint.x) < 1, "zoom must preserve the authored annotation x coordinate");
  assert.ok(Math.abs(authoredPoint.y - expectedImagePoint.y) < 1, "zoom must preserve the authored annotation y coordinate");
  if (process.env.ROADGEN_VIEWPORT_SCREENSHOT) {
    await page.screenshot({ path: process.env.ROADGEN_VIEWPORT_SCREENSHOT, fullPage: true });
  }

  const beforePan = await stage.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
  await stage.focus();
  await page.keyboard.down("Space");
  await page.mouse.move(stageRect.x + stageRect.width * 0.62, stageRect.y + stageRect.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(stageRect.x + stageRect.width * 0.35, stageRect.y + stageRect.height * 0.38, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const afterPan = await stage.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
  assert.ok(afterPan.left > beforePan.left || afterPan.top > beforePan.top, "Space drag must pan the zoomed annotation canvas");

  await page.locator("#annotation-zoom-fit").click();
  assert.equal((await zoomLevel.textContent())?.trim(), "100%", "fit control must restore 100 percent zoom");
  assert.equal(await board.evaluate((element) => element.style.transform), "scale(1)");
  assert.deepEqual(await stage.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop })), { left: 0, top: 0 });

  console.log("annotation viewport: wheel zoom, Space pan, and fit-width reset verified");
} finally {
  await browser?.close();
  await server.close();
}
