import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const viewerRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const server = await createServer({
  configFile: false,
  root: viewerRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});

async function selectLanguage(page, language) {
  await page.locator(".desktop-shell-language-select").click();
  await page.keyboard.press(language === "zh" ? "ArrowDown" : "ArrowUp");
  await page.keyboard.press("Enter");
}

let browser;
try {
  const i18nSource = await fs.readFile(new URL("../src/viewer-i18n.ts", import.meta.url), "utf8");
  const shellModelSource = await fs.readFile(new URL("../src/react/shellModel.tsx", import.meta.url), "utf8");
  assert.match(i18nSource, /return value === "zh" \? "zh" : "en";/, "stale mixed language values must normalize to English");
  assert.doesNotMatch(i18nSource, /"mixed"/, "the localization core must not retain a mixed locale");
  assert.equal((shellModelSource.match(/value: "/g) ?? []).length, 2, "language Select must expose exactly two values");

  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object", "Vite must expose its test server address.");
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let manifestRequests = 0;
  let assetRequests = 0;
  await page.route("**/api/asset-manifests", async (route) => {
    manifestRequests += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ manifests: [{ name: "fixture", label: "Fixture", count: 0 }] }) });
  });
  await page.route("**/api/asset-manifest?*", async (route) => {
    assetRequests += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ assets: [], total: 0, offset: 0, limit: 100, hasMore: false }) });
  });

  await page.goto(`${origin}/#viewer`);
  await page.evaluate(() => localStorage.removeItem("viewer-lang"));
  await page.reload();
  await page.locator(".desktop-shell-language-select").waitFor();
  await page.locator(".desktop-shell-language-select").click();
  const optionTexts = await page.locator('[role="option"]').allTextContents();
  assert.deepEqual(optionTexts.map((value) => value.trim()).sort(), ["en", "zh"], "only EN and Simplified Chinese must be selectable");
  await selectLanguage(page, "zh");
  await page.getByText("生成并加载", { exact: true }).first().waitFor();
  await page.getByText("控制菜单", { exact: true }).waitFor();
  await page.locator("#viewer-center-controls").evaluate((element) => element.setAttribute("data-open", "true"));
  await page.locator("#viewer-center-controls-title").getByText("场景浏览器", { exact: true }).waitFor();
  await page.locator("#viewer-settings-panel").evaluate((element) => element.setAttribute("data-open", "true"));
  await page.getByText("光照预设、阴影和激光指示器", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("viewer-lang")), "zh");
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.getByText("Generate & Load", { exact: true }).first().waitFor();

  await page.goto(`${origin}/#scene-graph`);
  await page.locator(".desktop-shell-language-select").waitFor();
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.getByText("Source", { exact: true }).first().waitFor();
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "zh");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "zh" } }));
  });
  await page.getByText("输入", { exact: true }).first().waitFor();
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.getByText("Source", { exact: true }).first().waitFor();
  await page.goto(`${origin}/#asset-editor`);
  await page.locator("#ae-manifest-select").waitFor();
  await page.locator("#ae-manifest-select").selectOption("fixture");
  await page.getByText("Select an asset from the gallery to inspect", { exact: true }).waitFor();
  const requestsBeforeLanguageEvents = { manifestRequests, assetRequests };
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "zh");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "zh" } }));
  });
  await page.getByText("从图库中选择资产进行检查", { exact: true }).waitFor();
  assert.deepEqual({ manifestRequests, assetRequests }, requestsBeforeLanguageEvents, "locale changes must not refetch asset manifests or assets");
  assert.equal(await page.locator("#ae-manifest-select").getAttribute("title"), "资产清单");
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.getByText("Select an asset from the gallery to inspect", { exact: true }).waitFor();
  assert.deepEqual({ manifestRequests, assetRequests }, requestsBeforeLanguageEvents, "returning to English must not refetch assets");

  console.log("viewer i18n regression: EN/zh switch updates active Viewer routes without manifest refetches");
} finally {
  await browser?.close();
  await server.close();
}
