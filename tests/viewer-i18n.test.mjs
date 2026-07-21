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
  await page.locator(`.studio-language-toggle [role="radio"]:has-text("${language === "zh" ? "中文" : "EN"}")`).click();
}

let browser;
try {
  const i18nSource = await fs.readFile(new URL("../src/viewer-i18n.ts", import.meta.url), "utf8");
  const languageToggleSource = await fs.readFile(new URL("../src/react/StudioLanguageToggle.tsx", import.meta.url), "utf8");
  const sceneGraphShellSource = await fs.readFile(new URL("../src/scene-graph/shell.ts", import.meta.url), "utf8");
  assert.match(i18nSource, /return value === "en" \? "en" : "zh";/, "missing or stale language values must normalize to Chinese");
  assert.doesNotMatch(i18nSource, /"mixed"/, "the localization core must not retain a mixed locale");
  assert.match(languageToggleSource, /role="radiogroup"/);
  assert.match(languageToggleSource, /role="radio"/);
  assert.doesNotMatch(sceneGraphShellSource, /Approve & Continue|继续配置 3D 生成/, "01A must not expose a separate approval or duplicate generation action");
  assert.match(sceneGraphShellSource, /sceneGraph\.review\.enter3d/, "01A exposes the explicit enter-3D action");

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
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ manifests: [{ name: "fixture", label: "Fixture", count: 0, eligibleCount: 0, readyCount: 0, fingerprint: "fixture-0", categoryCounts: {}, updatedAt: "2026-07-16T00:00:00Z" }] }) });
  });
  await page.route("**/api/asset-manifest?*", async (route) => {
    assetRequests += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ assets: [], total: 0, offset: 0, limit: 100, hasMore: false }) });
  });

  await page.goto(`${origin}/#viewer`);
  await page.evaluate(() => localStorage.removeItem("viewer-lang"));
  await page.reload();
  await page.locator(".studio-language-toggle").waitFor();
  assert.equal(await page.locator('.studio-language-toggle [role="radio"][aria-checked="true"]').textContent(), "中文", "first use defaults to Chinese");
  const optionTexts = await page.locator('.studio-language-toggle [role="radio"]').allTextContents();
  assert.deepEqual(optionTexts.map((value) => value.trim()), ["中文", "EN"], "the header exposes a direct Chinese/English switch");
  await selectLanguage(page, "zh");
  await page.getByText("新建生成…", { exact: true }).first().waitFor();
  await page.getByText("控制菜单", { exact: true }).first().waitFor({ state: "attached" });
  await page.locator("#viewer-center-controls").evaluate((element) => element.setAttribute("data-open", "true"));
  await page.locator("#viewer-center-controls-title").getByText("场景浏览器", { exact: true }).waitFor();
  await page.locator("#viewer-settings-panel").evaluate((element) => element.setAttribute("data-open", "true"));
  await page.getByText("光照预设、阴影和激光指示器", { exact: true }).waitFor();
  await page.getByRole("button", { name: "激光笔", exact: true }).waitFor();
  await page.locator("#viewer-floating-lane-toggle").click();
  await page.getByText("控制", { exact: true }).waitFor();
  await page.getByText("启用叠加层", { exact: true }).waitFor();
  await page.getByText("可见车道类型", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("viewer-lang")), "zh");
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.getByText("New generation…", { exact: true }).first().waitFor();
  await page.getByText("Controls", { exact: true }).waitFor();

  await page.goto(`${origin}/#scene-graph`);
  await page.locator(".studio-language-toggle").waitFor();
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.locator(".studio-professional-context-tool strong").getByText("2D Annotation", { exact: true }).waitFor();
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "zh");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "zh" } }));
  });
  await page.locator(".studio-professional-context-tool strong").getByText("2D 标注", { exact: true }).waitFor();
  await page.getByText("浏览地图并截取研究区", { exact: true }).waitFor({ state: "attached" });
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.locator(".studio-professional-context-tool strong").getByText("2D Annotation", { exact: true }).waitFor();
  await page.goto(`${origin}/#asset-editor`);
  await page.locator("#ae-manifest-select").waitFor();
  assert.equal(await page.locator("#ae-manifest-select").inputValue(), "fixture", "asset editor must restore and synchronize the selected manifest");
  await page.getByText("Asset manifest is empty", { exact: true }).waitFor();
  const requestsBeforeLanguageEvents = { manifestRequests, assetRequests };
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "zh");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "zh" } }));
  });
  await page.getByText("资产清单为空", { exact: true }).waitFor();
  assert.deepEqual({ manifestRequests, assetRequests }, requestsBeforeLanguageEvents, "locale changes must not refetch asset manifests or assets");
  assert.equal(await page.locator("#ae-manifest-select").getAttribute("title"), "资产清单");
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.getByText("Asset manifest is empty", { exact: true }).waitFor();
  assert.deepEqual({ manifestRequests, assetRequests }, requestsBeforeLanguageEvents, "returning to English must not refetch assets");

  console.log("viewer i18n regression: EN/zh switch updates active Viewer routes without manifest refetches");
} finally {
  await browser?.close();
  await server.close();
}
