import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const outputRoot = process.env.ROADGEN_OVERLAY_SCREENSHOTS || "/tmp/roadgen3d-overlay-visual";
const viewports = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const server = await createServer({
  configFile: false,
  root: new URL("../", import.meta.url).pathname,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});

let browser;
try {
  await fs.mkdir(outputRoot, { recursive: true });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object", "Vite must expose its visual-test server address");
  const origin = `http://127.0.0.1:${address.port}`;
  console.log(`overlay visual server: ${origin}`);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: viewports[3] });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/api/health")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ capabilities: { llm: { text: { configured: false } } } }),
      });
      return;
    }
    if (url.endsWith("/api/asset-manifests")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ manifests: [] }),
      });
      return;
    }
    if (url.includes("/api/asset-manifest?")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assets: [], total: 0, offset: 0, limit: 100, hasMore: false }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "visual fixture" }) });
  });

  await page.goto(`${origin}/#viewer`, { waitUntil: "domcontentloaded" });
  console.log("overlay visual: viewer DOM loaded");
  await page.locator(".studio-brand-header").waitFor();
  await page.waitForFunction(() => document.querySelector("#viewer-settings-panel") !== null);
  console.log("overlay visual: viewer shell ready");
  assert.deepEqual(pageErrors, [], `viewer initialization errors: ${pageErrors.join(" | ")}`);

  const settings = page.locator("#viewer-settings-panel");
  const warning = page.locator("#viewer-legacy-starter-warning");
  await page.evaluate(() => {
    const element = document.querySelector("#viewer-legacy-starter-warning");
    if (element instanceof HTMLElement) element.hidden = false;
  });
  await page.locator("#viewer-settings-toggle").waitFor({ state: "attached", timeout: 10_000 });
  console.log("overlay visual: keyboard controller ready");
  await page.keyboard.press("p");
  await page.waitForFunction(
    () => document.querySelector("#viewer-settings-panel")?.getAttribute("data-open") === "true",
    null,
    { timeout: 10_000 },
  );
  console.log("overlay visual: settings opened");
  assert.equal(await settings.getAttribute("aria-hidden"), "false");
  assert.equal(await page.evaluate(() => {
    const element = document.querySelector("#viewer-legacy-starter-warning");
    return element ? getComputedStyle(element).opacity : "missing";
  }), "0", "stage warning must not cover settings");
  const panelStyle = await settings.evaluate((element) => ({
    backgroundImage: getComputedStyle(element).backgroundImage,
    borderRadius: getComputedStyle(element).borderRadius,
    display: getComputedStyle(element).display,
  }));
  assert.notEqual(panelStyle.backgroundImage, "none");
  assert.equal(panelStyle.borderRadius, "4px", "standalone settings drawer must use the shared overlay frame");
  assert.equal(panelStyle.display, "grid");

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const bounds = await settings.boundingBox();
    const viewerBounds = await page.locator(".viewer-shell-embedded").boundingBox();
    const leftRailBounds = await page.locator(".desktop-shell-rail-right").boundingBox();
    assert.ok(bounds, `settings must be measurable at ${viewport.width}x${viewport.height}`);
    assert.ok(viewerBounds, `viewer stage must be measurable at ${viewport.width}x${viewport.height}`);
    assert.ok(leftRailBounds, `left workbench rail must be measurable at ${viewport.width}x${viewport.height}`);
    assert.ok(bounds.x >= -1, `settings escapes left edge at ${viewport.width}x${viewport.height}`);
    assert.ok(bounds.x + bounds.width <= viewport.width + 1, `settings escapes right edge at ${viewport.width}x${viewport.height}`);
    assert.ok(
      Math.abs((bounds.x + bounds.width) - viewerBounds.x) <= 1,
      `settings must occupy the left drawer coordinate at ${viewport.width}x${viewport.height}`,
    );
    assert.ok(bounds.x >= leftRailBounds.x + leftRailBounds.width - 1, `settings must not cover the left rail at ${viewport.width}x${viewport.height}`);
    const overflow = await page.evaluate(() => {
      const body = document.querySelector("#viewer-settings-panel .viewer-settings-body");
      return {
        document: document.documentElement.scrollWidth - window.innerWidth,
        panel: body ? body.scrollWidth - body.clientWidth : 0,
      };
    });
    assert.ok(overflow.document <= 1, `document overflows at ${viewport.width}x${viewport.height}`);
    assert.ok((overflow.panel ?? 0) <= 1, `settings body overflows at ${viewport.width}x${viewport.height}`);
    await page.screenshot({
      path: path.join(outputRoot, `settings-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
    console.log(`overlay visual: captured settings ${viewport.width}x${viewport.height}`);
  }

  await page.setViewportSize(viewports[3]);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#viewer-settings-panel")?.getAttribute("data-open") === "false");
  assert.equal(await settings.getAttribute("aria-hidden"), "true");

  const shortcutTrigger = page.locator(".desktop-shell-help-button");
  await shortcutTrigger.focus();
  await shortcutTrigger.click();
  const shortcutModal = page.locator(".viewer-shortcuts-modal");
  await shortcutModal.waitFor({ state: "visible" });
  console.log("overlay visual: shortcut modal opened");
  await page.screenshot({ path: path.join(outputRoot, "shortcut-modal-1366x768.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await shortcutModal.waitFor({ state: "detached" });
  assert.equal(await shortcutTrigger.evaluate((element) => element === document.activeElement), true, "shortcut close must restore focus");

  await page.keyboard.press("p");
  await page.waitForFunction(() => document.querySelector("#viewer-settings-panel")?.getAttribute("data-open") === "true");
  await page.locator("#viewer-top-assets").click();
  const assetModal = page.locator(".viewer-scene-assets-modal:not([hidden])");
  await assetModal.waitFor({ state: "visible" });
  console.log("overlay visual: scene asset modal opened");
  await page.screenshot({ path: path.join(outputRoot, "scene-assets-modal-1366x768.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await assetModal.waitFor({ state: "hidden" });

  console.log(`overlay visual regression: ${viewports.length + 2} screenshots written to ${outputRoot}`);
} finally {
  await browser?.close();
  await server.close();
}
