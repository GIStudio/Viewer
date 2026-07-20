import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: new URL("../", import.meta.url).pathname,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object", "Vite must expose its test server address.");
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1576, height: 980 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let generationRequestCount = 0;
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (/scene\/jobs|design-assistant|generate/.test(url) && route.request().method() !== "GET") {
      generationRequestCount += 1;
    }
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
        body: JSON.stringify({ manifests: [{
          name: "real_assets_manifest.jsonl",
          label: "Real assets manifest",
          count: 1,
          eligibleCount: 1,
          readyCount: 1,
          categoryCounts: { tree: 1 },
          fingerprint: "fixture-fingerprint",
          updatedAt: "2026-07-16T00:00:00Z",
          warnings: [],
        }] }),
      });
      return;
    }
    if (url.endsWith("/api/design/parameter-controls")) {
      const values = (low, medium, high, minimum, maximum, unit = "m") => ({ values: { low, medium, high }, minimum, maximum, unit });
      const furniture = (low, medium, high, minimumSpacingM, roadSetbackM, allowedZones) => ({
        ...values(low, medium, high, 0, 20, "count_per_100m"), minimumSpacingM, roadSetbackM, allowedZones,
        preferredSpacingByLevelM: { low: 100 / low, medium: 100 / medium, high: 100 / high },
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        parameter_schema_version: "roadgen3d.street-design-parameters.v2", levels: ["low", "medium", "high"], default_seed: 42,
        skeleton: {
          laneCount: values(2, 4, 6, 1, 8, "count"), laneWidthM: values(2.75, 3.25, 3.75, 2.5, 4.5),
          sidewalkWidthM: values(1.8, 3, 4.5, 1, 12), furnishingWidthM: values(.6, 1.2, 1.8, 0, 5),
          junctionCornerRadiusM: values(3, 5.5, 8, 1, 20), medianWidthM: values(1.2, 2, 3, .8, 8),
        },
        furniture: { globalDensity: values(.6, 1, 1.4, 0, 2, "ratio"), styles: ["civic_clean", "lush_natural", "transit_modern"], categories: {
          bench: furniture(2, 4, 6, 8, .3, ["sidewalk", "furnishing", "frontage"]),
          lamp: furniture(4, 6, 8, 10, .3, ["furnishing", "sidewalk"]),
          trash: furniture(2, 3, 5, 10, .3, ["furnishing", "sidewalk", "frontage"]),
          tree: furniture(5, 8, 12, 6, .6, ["planting", "furnishing", "frontage"]),
          bus_stop: furniture(.5, 1, 2, 35, .5, ["transit_edge", "sidewalk"]),
          mailbox: furniture(.5, 1, 2, 30, .3, ["frontage", "sidewalk"]),
          hydrant: furniture(1, 2, 3, 20, .3, ["furnishing", "sidewalk"]),
          bollard: furniture(4, 8, 12, 2, .2, ["furnishing", "sidewalk"]),
        } },
      }) });
      return;
    }
    if (url.includes("/api/asset-manifest?")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          assets: [{ asset_id: "fixture-tree", category: "tree", mesh_path: "/fixture-tree.glb", scene_eligible: true }],
          total: 1,
          offset: 0,
          limit: 100,
          hasMore: false,
          manifest: { name: "real_assets_manifest.jsonl", readyCount: 1, eligibleCount: 1 },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "test fixture" }) });
  });

  await page.goto(`${origin}/#viewer`);
  await page.waitForLoadState("networkidle");
  await page.locator(".studio-brand-header").waitFor();
  assert.deepEqual(pageErrors, [], `viewer initialization errors: ${pageErrors.join(" | ")}`);

  assert.equal((await page.locator(".studio-header-context > span").textContent())?.trim(), "当前上下文");
  await page.getByRole("button", { name: "课程教学", exact: true }).waitFor();
  assert.equal(await page.locator(".desktop-shell-workbench-select").count(), 0, "professional tool switching must live only in the left rail");
  await page.getByText("3D 场景工作台", { exact: true }).waitFor();

  const groupLabels = (await page.locator(".workbench-sidebar-group-label").allTextContents()).map((value) => value.trim());
  assert.ok(groupLabels.includes("生产流程"), "left rail must expose the Y-shaped production flow");
  assert.ok(groupLabels.includes("检查工具"), "model input audit must be a cross-cutting inspection tool");
  assert.equal(await page.locator('[data-shell-tab^="workflow-"]').count(), 0, "legacy workflow steps must not remain in the professional rail");
  assert.equal(await page.locator('[data-shell-tab="prepare-annotation"]').getAttribute("data-flow-branch"), "annotation");
  assert.equal(await page.locator('[data-shell-tab="prepare-assets"]').getAttribute("data-flow-branch"), "assets");
  assert.equal(await page.locator('[data-shell-tab="generate"]').getAttribute("data-flow-stage"), "02");
  assert.equal(await page.locator('[data-shell-tab="model-input-audit"]').getAttribute("data-sidebar-group"), "inspection");
  assert.equal(await page.locator('[data-shell-tab="scene"]').getAttribute("data-sidebar-group"), "workspace");
  for (const duplicate of ["annotation", "assets", "design"]) {
    assert.equal(await page.locator(`[data-shell-tab="${duplicate}"]`).count(), 0, `${duplicate} must not duplicate a production-flow entry`);
  }

  const openGeneration = page.locator("#viewer-generate-and-load");
  await page.waitForFunction(() => document.querySelector("#viewer-generate-and-load")?.textContent?.trim() === "新建生成…");
  assert.deepEqual(pageErrors, [], `viewer initialization errors: ${pageErrors.join(" | ")}`);
  assert.equal((await openGeneration.textContent())?.trim(), "新建生成…");
  assert.equal(await openGeneration.getAttribute("aria-haspopup"), "dialog");
  await openGeneration.click();
  const generationDialog = page.locator("#viewer-generation-dialog");
  await generationDialog.waitFor({ state: "visible" });
  assert.equal(await generationDialog.getAttribute("data-open"), "true");
  assert.equal(await generationDialog.getByRole("tab", { name: /输入来源/ }).count(), 1);
  assert.equal(await generationDialog.getByRole("tab", { name: /生成策略/ }).count(), 1);
  assert.equal(await generationDialog.getByRole("tab", { name: /输出结果/ }).count(), 1);
  await generationDialog.getByRole("tab", { name: /生成策略/ }).click();
  for (const name of [/3D 素材/, /道路骨架/, /家具参数/]) {
    assert.equal(await generationDialog.getByRole("tab", { name }).count(), 1);
  }
  for (const name of [/场景结构/, /家具目标/, /补充要求/, /方案矩阵/, /AI 参数/]) {
    assert.equal(await generationDialog.getByRole("tab", { name }).count(), 0);
  }
  await generationDialog.getByText("3D 素材准备", { exact: true }).waitFor();
  assert.equal(await generationDialog.locator('[data-generation-primary-panel]:visible').count(), 1, "only one primary page may be visible");
  assert.equal(await generationDialog.locator('[data-generation-strategy-panel]:visible').count(), 1, "only one strategy subpage may be visible");
  const dialogDimensions = await generationDialog.locator('.viewer-generation-dialog-panel').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert.ok(dialogDimensions.scrollHeight - dialogDimensions.clientHeight <= 1, "the full dialog must not become a long vertical scroller");
  assert.equal(await page.locator('#viewer-design-generate').isDisabled(), true, "generation must wait for approved 2D input and an asset strategy");
  await page.getByText("使用默认素材与透明建筑白模", { exact: true }).click();
  assert.equal(await page.locator('[data-shell-tab="prepare-assets"] .workbench-sidebar-badge').textContent(), "DEF");
  assert.equal(await page.locator('#viewer-design-generate').isDisabled(), true, "asset defaults alone must not bypass 2D approval");
  await generationDialog.getByRole("tab", { name: /输出结果/ }).click();
  assert.equal(await page.locator('#viewer-design-generate').isVisible(), true, "final generation action belongs only to the output page");
  await generationDialog.getByRole("tab", { name: /生成策略/ }).click();
  await generationDialog.getByRole("tab", { name: /道路骨架/ }).click();
  assert.equal(await generationDialog.locator('[data-generation-strategy-panel]:visible').getAttribute('data-generation-strategy-panel'), "skeleton");
  assert.equal(generationRequestCount, 0, "opening generation setup must not submit a generation job");
  assert.equal(await page.locator(".viewer-generation-dialog-panel .viewer-settings-close:visible").count(), 1, "generation dialog must expose one unambiguous close action");

  if (process.env.ROADGEN_PRO_NAV_SCREENSHOT) {
    await page.screenshot({ path: process.env.ROADGEN_PRO_NAV_SCREENSHOT, fullPage: true });
  }

  await page.locator("[data-close-generation]").last().click();
  for (const viewport of [
    { width: 1600, height: 1050 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    const canvasBeforeReview = await page.locator("#viewer-canvas").boundingBox();
    await page.locator('[data-shell-tab="review"]').click();
    await page.locator('#viewer-result-review').waitFor({ state: "visible" });
    assert.equal(await page.locator('#viewer-result-review-accept').isDisabled(), true, "result approval must wait for a generated scene");
    const canvasDuringReview = await page.locator("#viewer-canvas").boundingBox();
    assert.ok(canvasBeforeReview && canvasDuringReview);
    assert.ok(Math.abs(canvasBeforeReview.width - canvasDuringReview.width) <= 1, `review drawer must not resize the 3D canvas at ${viewport.width}x${viewport.height}`);
    await page.keyboard.press("Escape");
  }
  await page.locator('.studio-language-toggle [role="radio"]:has-text("中文")').click();
  await page.getByText("生产流程", { exact: true }).waitFor();
  await page.getByText("检查工具", { exact: true }).waitFor();
  await page.getByText("3D 场景工作台", { exact: true }).waitFor();
  await page.locator('[data-shell-tab="prepare-assets"]').click();
  await page.waitForURL(/#asset-editor$/);
  await page.locator('#ae-use-manifest-for-generation').waitFor();
  assert.equal(await page.locator('#ae-manifest-select').inputValue(), "real_assets_manifest.jsonl", "01B must automatically restore the default manifest");
  assert.equal(await page.locator('#ae-use-manifest-for-generation').isDisabled(), false, "a restored manifest can be added to the candidate repository");
  await page.locator('#ae-use-manifest-for-generation').click();
  assert.equal(await page.locator('[data-shell-tab="prepare-assets"] .workbench-sidebar-badge').textContent(), "1");
  await page.getByRole("button", { name: "课程教学", exact: true }).click();
  await page.waitForURL(/#course-studio$/);

  console.log("professional navigation: tool switching, workflow grouping, course entry, and generation confirmation verified");
} finally {
  await browser?.close();
  await server.close();
}
