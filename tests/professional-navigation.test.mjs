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
  await page.addInitScript(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 50);
    window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
  });
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(30_000);
  const rect = (selector) => page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let generationRequestCount = 0;
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/api/v1/auth/guest")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "fixture-guest-token",
          user: { id: "guest-a", email: "guest-a@public.invalid", display_name: "访客 TEST", system_role: "guest", is_active: true },
          workspace: { id: "workspace-public", name: "小黑板", scope: "public", role: "owner" },
        }),
      });
      return;
    }
    if (url.endsWith("/api/v1/public/projects")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
      return;
    }
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
    if (url.includes("/api/asset-catalog/search?")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          assets: [{
            manifestName: "real_assets_manifest.jsonl",
            assetId: "fixture-tree",
            fingerprint: "fixture-fingerprint",
            category: "tree",
            label: "Fixture tree",
            ready: true,
          }],
          total: 1,
          offset: 0,
          limit: 100,
          hasMore: false,
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "test fixture" }) });
  });

  await page.goto(`${origin}/#viewer`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator(".studio-brand-header").waitFor();
  await page.locator('[data-shell-tab="account"] .workbench-sidebar-badge').filter({ hasText: "PUB" }).waitFor({ timeout: 30_000 });
  assert.deepEqual(pageErrors, [], `viewer initialization errors: ${pageErrors.join(" | ")}`);

  assert.equal((await page.locator(".studio-header-context > span").textContent())?.trim(), "当前状态");
  assert.equal(
    await page.getByRole("button", { name: "课程教学", exact: true }).count(),
    0,
    "the retired course-teaching shortcut must not reappear in the professional header",
  );
  assert.equal(await page.locator(".desktop-shell-workbench-select").count(), 0, "professional tool switching must live only in the left rail");
  await page.getByText("3D 场景工作台", { exact: true }).waitFor();

  const groupLabels = (await page.locator(".workbench-sidebar-group-label").allTextContents()).map((value) => value.trim());
  assert.ok(groupLabels.includes("生产流程"), "left rail must expose the Y-shaped production flow");
  assert.equal(await page.locator('[data-shell-tab^="workflow-"]').count(), 0, "legacy workflow steps must not remain in the professional rail");
  assert.equal(await page.locator('[data-shell-tab="prepare-annotation"]').getAttribute("data-flow-branch"), "annotation");
  assert.equal(await page.locator('[data-shell-tab="prepare-assets"]').count(), 0, "3D assets must move out of the left production rail");
  assert.equal(await page.locator('[data-shell-tab="generate"]').count(), 0, "3D generation must leave the left rail");
  assert.equal(await page.locator('[data-shell-tab="browse-3d"]').getAttribute("data-flow-stage"), "03");
  assert.equal(await page.locator('.desktop-shell-tab-button[data-shell-tab="review"]').count(), 0, "result review must leave the left rail");
  assert.equal(await page.locator('.desktop-shell-tab-button[data-shell-tab="evaluate"]').count(), 0, "evaluation must leave the left rail");
  assert.equal(await page.locator('.desktop-shell-tab-button[data-shell-tab="consistency"]').count(), 0, "consistency diagnostics must leave the primary navigation rail");
  assert.equal(await page.getByRole("button", { name: "帮助", exact: true }).count(), 0, "help must not occupy a side-rail entry");
  const helpHitTarget = await page.locator(".desktop-shell-help-button").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit) ? "self" : `${hit?.tagName ?? "none"}.${hit?.className ?? ""}`;
  });
  assert.equal(helpHitTarget, "self", `the recommended next-action header control must not cover the help button (${helpHitTarget})`);
  await page.locator(".desktop-shell-help-button").click();
  const helpDialog = page.locator(".viewer-shortcuts-modal");
  await helpDialog.waitFor({ state: "visible" });
  assert.equal(await helpDialog.getByRole("tab", { name: "快捷键", exact: true }).getAttribute("aria-selected"), "true");
  await helpDialog.getByRole("tab", { name: "帮助", exact: true }).click();
  assert.equal(await helpDialog.getByRole("tab", { name: "帮助", exact: true }).getAttribute("aria-selected"), "true");
  await helpDialog.getByRole("button", { name: "完成", exact: true }).click();
  assert.equal(await page.locator('#viewer-result-review-toggle').getAttribute("aria-haspopup"), "dialog");
  assert.equal(await page.locator('#viewer-evaluate-modal-toggle').getAttribute("aria-haspopup"), "dialog");
  assert.equal(await page.locator('#viewer-topology-pill').isHidden(), true, "raw topology diagnostics must stay out of the user toolbar");
  assert.equal(await page.locator('#viewer-geo-pill').isHidden(), true, "raw geometry diagnostics must stay out of the user toolbar");
  assert.equal(await page.locator('[data-shell-tab="prepare-annotation"] .workbench-sidebar-icon').textContent(), "2D");
  assert.equal(await page.locator('[data-shell-tab="browse-3d"] .workbench-sidebar-icon').textContent(), "3D");
  assert.equal(await page.locator('[data-shell-tab="model-input-audit"]').count(), 0, "retired model-input audit must not remain in product navigation");
  assert.equal(await page.locator('[data-shell-tab="presets"]').count(), 0, "retired scene presets must not remain in product navigation");
  assert.equal(await page.locator('[data-shell-tab="scene"]').count(), 0, "generic scene browser must not duplicate the production-flow browser");
  await page.locator('[data-shell-tab="browse-3d"]').click();
  await page.locator("#viewer-canvas").waitFor({ state: "visible" });
  assert.equal(await page.locator("#viewer-center-controls").count(), 0, "3D browsing must stay on the canvas without the retired scene browser panel");
  await page.locator("#viewer-direct-edit").waitFor();
  await page.locator("#viewer-top-assets").waitFor();
  const schemeCompareToggle = page.locator("#viewer-scheme-compare-toggle");
  await schemeCompareToggle.waitFor();
  assert.equal(await page.locator('[data-shell-tab="compare"]').count(), 0, "legacy layout comparison must not remain in the standard drawer");
  await schemeCompareToggle.click();
  assert.equal(await page.locator("#viewer-scenario-workbench").getAttribute("hidden"), null, "the Scheme A/B/C button must open the formal workbench immediately");
  await page.locator('#viewer-scenario-workbench:not([hidden])').waitFor();
  assert.equal(await page.locator('.viewer-scenario-lane[data-branch="A"]').count(), 1, "the scenario workbench must expose one semantic A lane");
  assert.equal(await page.locator('.viewer-scenario-lane[data-branch="B"]').count(), 1, "the scenario workbench must expose one semantic B lane");
  assert.equal(await page.locator('.viewer-scenario-lane[data-branch="C"]').count(), 1, "the scenario workbench must expose one semantic C lane");
  assert.equal(await page.locator('[data-scenario-weight]').count(), 3, "C candidates must accept all three objective weights");
  await page.setViewportSize({ width: 1025, height: 863 });
  const desktopScenarioColumns = await page.locator(".viewer-scenario-body").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").map(Number.parseFloat));
  assert.equal(desktopScenarioColumns.length, 2, "the 1025px workbench must retain the A/B/C ledger and property split");
  assert.ok(desktopScenarioColumns[1] / desktopScenarioColumns[0] > 1.7, "the property area must occupy about two thirds of the desktop workbench");
  await page.setViewportSize({ width: 815, height: 863 });
  assert.equal((await page.locator(".viewer-scenario-body").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" "))).length, 1, "the narrow workbench must stack the ledger and properties");
  await page.setViewportSize({ width: 1576, height: 980 });
  assert.equal(await page.locator('#viewer-center-controls[data-open="true"][data-mode="schemes"]').count(), 0, "the A/B/C action must not open the generic recent-layout chooser");
  assert.equal(await page.locator("#viewer-compare-panel").isHidden(), true, "legacy Layout A/B panel must remain an invisible comparison engine");
  await page.locator('#viewer-scenario-workbench [data-scenario-action="close"]').click();
  await page.getByRole("button", { name: "工作台菜单", exact: true }).click();
  const consistencyMenuItem = page.locator(".ant-dropdown:visible").getByRole("menuitem", { name: "一致性诊断", exact: true });
  await consistencyMenuItem.click();
  await page.locator("#viewer-consistency-panel[data-open=\"true\"]").waitFor();
  await page.locator("#viewer-consistency-close").click();
  await page.locator("#viewer-consistency-panel[data-open=\"false\"]").waitFor();
  await page.locator(".workbench-sidebar-rail-toggle").click();
  assert.equal(await page.locator(".desktop-shell").getAttribute("data-sidebar-rail-expanded"), "true");
  await page.getByText("2D 数据与标注", { exact: true }).waitFor();
  await page.waitForTimeout(220);
  const expandedRail = await rect(".desktop-shell-rail-right");
  const expandedTabList = await rect(".desktop-shell-tab-list");
  const brandColumn = await rect(".studio-wordmark");
  assert.ok(expandedRail && brandColumn);
  assert.ok(
    Math.abs(expandedRail.width - brandColumn.width) <= 1,
    `expanded rail (${expandedRail.width}px) must align with the banner brand column (${brandColumn.width}px)`,
  );
  assert.ok(Math.abs(expandedTabList.width - expandedRail.width) <= 1, "expanded navigation list and its yellow edge must align with the rail boundary");
  for (const duplicate of ["annotation", "assets", "design"]) {
    assert.equal(await page.locator(`[data-shell-tab="${duplicate}"]`).count(), 0, `${duplicate} must not duplicate a production-flow entry`);
  }
  const settingsRailButton = page.locator('[data-shell-tab="settings"]');
  await settingsRailButton.click();
  await page.locator('#viewer-settings-panel[data-open="true"]').waitFor();
  assert.equal(await page.locator("#building-opacity").count(), 1, "display settings must include building opacity control");
  assert.equal(await page.locator("#building-opacity").getAttribute("min"), "0.1", "building opacity must retain a visible lower bound");
  assert.equal(
    await page.locator("#viewer-settings-panel").evaluate((element) => element.closest(".workbench-sidebar-drawer") !== null),
    true,
    "display settings must mount inside the reserved left workbench drawer",
  );
  assert.equal(
    await page.locator("#viewer-settings-panel .viewer-settings-header").isHidden(),
    true,
    "the standard drawer header must replace the duplicate display-settings header",
  );
  assert.equal(await page.locator('[data-shell-tab="floating-lane"]').count(), 0, "semantic overlay must not create a separate sidebar page");
  assert.equal(
    await page.locator("#viewer-floating-lane-panel-host").evaluate((element) => element.closest("#viewer-settings-panel") !== null),
    true,
    "floating-lane controls must live inside the standard Settings drawer",
  );
  await page.locator("#floating-lane-panel").waitFor({ state: "visible" });
  assert.equal(await page.locator("#flp-enabled").isChecked(), false, "overlay controls remain available while the overlay is disabled");
  await settingsRailButton.click();
  await settingsRailButton.click();

  const openGeneration = page.locator("#viewer-generate-and-load");
  await page.waitForFunction(() => document.querySelector("#viewer-generate-and-load")?.textContent?.trim() === "3D 场景生成");
  assert.deepEqual(pageErrors, [], `viewer initialization errors: ${pageErrors.join(" | ")}`);
  assert.equal((await openGeneration.textContent())?.trim(), "3D 场景生成");
  assert.equal(await openGeneration.getAttribute("aria-haspopup"), "dialog");
  await openGeneration.click({ noWaitAfter: true });
  const generationDialog = page.locator("#viewer-generation-dialog");
  await generationDialog.waitFor({ state: "visible" });
  assert.equal(await generationDialog.getAttribute("data-open"), "true");
  assert.equal(await generationDialog.locator(".viewer-generation-dialog-footer").count(), 0, "step controls must live in the stable dialog header");
  assert.equal(await generationDialog.locator(".viewer-generation-dialog-head #viewer-generation-step-position").textContent(), "01 / 04");
  assert.equal(await generationDialog.getByRole("tab", { name: /输入来源/ }).count(), 1);
  assert.equal(await generationDialog.getByRole("tab", { name: /生成策略/ }).count(), 1);
  assert.equal(await generationDialog.getByRole("tab", { name: /输出结果/ }).count(), 1);
  await generationDialog.getByRole("tab", { name: /生成策略/ }).click();
  for (const name of [/道路骨架/, /家具参数/]) {
    assert.equal(await generationDialog.getByRole("tab", { name }).count(), 1);
  }
  assert.equal(await generationDialog.getByRole("tab", { name: /3D 素材/ }).count(), 0, "asset policy must not consume generation-panel space");
  for (const name of [/场景结构/, /家具目标/, /补充要求/, /方案矩阵/, /AI 参数/]) {
    assert.equal(await generationDialog.getByRole("tab", { name }).count(), 0);
  }
  assert.equal(await generationDialog.locator('[data-generation-primary-panel]:visible').count(), 1, "only one primary page may be visible");
  assert.equal(await generationDialog.locator('[data-generation-strategy-panel]:visible').count(), 1, "only one strategy subpage may be visible");
  const dialogDimensions = await generationDialog.locator('.viewer-generation-dialog-panel').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  assert.ok(dialogDimensions.scrollHeight - dialogDimensions.clientHeight <= 1, "the full dialog must not become a long vertical scroller");
  assert.equal(await page.locator('#viewer-design-generate').isDisabled(), true, "generation must wait for approved 2D input");
  await generationDialog.getByRole("tab", { name: /输出结果/ }).click();
  assert.equal(await page.locator('#viewer-design-generate').isVisible(), true, "final generation action belongs only to the output page");
  await page.locator("#viewer-design-result").evaluate((result) => {
    const longStatus = "generation-status-".repeat(700);
    result.innerHTML = `<section class="viewer-generation-run-board"><header><div><small>GENERATION RUN</small><strong>${longStatus}</strong></div><b>100%</b></header><ol class="viewer-generation-operation-list"><li><span>100%</span><strong>${longStatus}</strong></li></ol></section>`;
  });
  const dialogHorizontalBounds = await generationDialog.locator(".viewer-generation-dialog-panel").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, viewportWidth: window.innerWidth };
  });
  assert.ok(dialogHorizontalBounds.left >= 0 && dialogHorizontalBounds.right <= dialogHorizontalBounds.viewportWidth, "long generation status must wrap instead of shifting the dialog beyond the viewport");
  await generationDialog.getByRole("tab", { name: /生成策略/ }).click();
  await generationDialog.getByRole("tab", { name: /道路骨架/ }).click();
  assert.equal(await generationDialog.locator('[data-generation-strategy-panel]:visible').getAttribute('data-generation-strategy-panel'), "skeleton");
  await page.setViewportSize({ width: 815, height: 863 });
  await generationDialog.locator("#viewer-parameter-skeleton-controls").waitFor();
  const strategyLayout = await generationDialog.evaluate((dialog) => {
    const workspace = dialog.querySelector(".viewer-generation-strategy-workspace");
    const controls = dialog.querySelector("#viewer-parameter-skeleton-controls");
    const summary = dialog.querySelector(".viewer-parameter-summary-board");
    if (!(workspace instanceof HTMLElement) || !(controls instanceof HTMLElement) || !(summary instanceof HTMLElement)) return null;
    const controlsBox = controls.getBoundingClientRect();
    const summaryBox = summary.getBoundingClientRect();
    return {
      summaryInsideWorkspace: summary.parentElement === workspace,
      overlapPx: Math.max(0, Math.min(controlsBox.bottom, summaryBox.bottom) - Math.max(controlsBox.top, summaryBox.top)),
      overflowY: getComputedStyle(workspace).overflowY,
    };
  });
  assert.deepEqual(strategyLayout, { summaryInsideWorkspace: true, overlapPx: 0, overflowY: "auto" }, "the parameter summary must follow the controls in the same scroll flow without covering them at 815x863");
  const parameterSummary = generationDialog.locator(".viewer-parameter-summary-board");
  await parameterSummary.scrollIntoViewIfNeeded();
  assert.equal(await parameterSummary.isVisible(), true, "the parameter summary must remain reachable after the controls");
  await page.setViewportSize({ width: 1576, height: 980 });
  assert.equal(generationRequestCount, 0, "opening generation setup must not submit a generation job");
  assert.equal(await page.locator(".viewer-generation-dialog-panel .viewer-settings-close:visible").count(), 1, "generation dialog must expose one unambiguous close action");

  if (process.env.ROADGEN_PRO_NAV_SCREENSHOT) {
    await page.screenshot({ path: process.env.ROADGEN_PRO_NAV_SCREENSHOT, fullPage: true });
  }

  await page.locator("[data-close-generation]").last().click();
  assert.equal(await page.locator('#viewer-evaluate-modal-toggle').getAttribute("aria-disabled"), "true", "evaluation stays unavailable until a current 3D scene is accepted");
  assert.equal(await page.locator('[data-shell-tab="history"]').count(), 0, "global history analysis must move into Scheme A/B/C comparison");
  for (const viewport of [
    { width: 1600, height: 1050 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    const responsiveRail = await rect(".desktop-shell-rail-right");
    const responsiveBrand = await rect(".studio-wordmark");
    assert.ok(
      Math.abs(responsiveRail.width - responsiveBrand.width) <= 1,
      `rail and banner must align at ${viewport.width}x${viewport.height}: ${JSON.stringify({ rail: responsiveRail.width, brand: responsiveBrand.width })}`,
    );
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `expanded layout must not overflow horizontally at ${viewport.width}x${viewport.height}`);
    const canvasBeforeReview = await rect("#viewer-canvas");
    const reviewToggle = page.locator('#viewer-result-review-toggle');
    assert.equal(await reviewToggle.getAttribute("aria-disabled"), "true", "review stays unavailable until a current 3D scene exists");
    await reviewToggle.click({ force: true });
    await page.locator("#desktop-shell-status-summary-text").getByText("请先根据当前已批准的标注生成 3D 场景。", { exact: true }).waitFor();
    assert.equal(await page.locator('[data-shell-modal-tab="review"]').isHidden(), true, "an unavailable review action must explain the requirement instead of opening a modal");
    const canvasDuringReview = await rect("#viewer-canvas");
    assert.ok(canvasBeforeReview && canvasDuringReview);
    assert.ok(Math.abs(canvasBeforeReview.width - canvasDuringReview.width) <= 1, `review availability must not resize the 3D canvas at ${viewport.width}x${viewport.height}`);
  }
  await page.locator('.studio-language-toggle [role="radio"]:has-text("中文")').click();
  await page.getByText("生产流程", { exact: true }).waitFor();
  await page.getByText("3D 场景工作台", { exact: true }).waitFor();
  assert.equal(await page.locator('[data-shell-tab="prepare-annotation"] .workbench-sidebar-icon').textContent(), "2D");
  assert.equal(await page.locator('[data-shell-tab="browse-3d"] .workbench-sidebar-icon').textContent(), "3D");
  assert.equal((await page.locator('[data-shell-tab="public-space"] .workbench-sidebar-label').textContent())?.trim(), "小黑板");
  await page.locator('[data-shell-tab="account"]').click();
  await page.getByText("作者身份如何识别？", { exact: true }).click();
  await page.getByText("首次访问时，服务器签发仅保存在当前浏览器中的访问凭证。", { exact: false }).waitFor();
  await page.locator("#viewer-top-assets").click();
  await page.locator(".viewer-scene-assets-modal:not([hidden])").waitFor();
  await page.getByRole("heading", { name: "全部可用资产 · 点击放置或原位替换" }).waitFor();
  assert.ok(await page.getByRole("button", { name: "添加到场景", exact: true }).count() > 0, "asset cards must expose click-to-place brush actions");
  assert.equal(await page.getByRole("button", { name: "预览", exact: true }).count(), 0, "asset preview must be the default card interaction, not a redundant button");
  const firstAssetCard = page.locator(".viewer-scene-asset-card").first();
  await firstAssetCard.waitFor();
  assert.equal(await firstAssetCard.getAttribute("data-preview-active"), "true", "the first available asset must preview automatically");
  await firstAssetCard.click();
  assert.equal(await firstAssetCard.getAttribute("data-preview-active"), "true", "clicking an asset card must retain its direct preview state");
  assert.ok(await page.locator(".viewer-workbench-square-close").count(), "asset dialog must use the square workbench close control");
  assert.equal(await page.locator('.viewer-scene-asset-card[draggable="true"]').count(), 0, "asset placement must not depend on drag and drop");
  await page.locator('.viewer-scene-assets-modal [data-action="close"]').last().click();
  await page.locator('[data-shell-tab="prepare-annotation"]').click();
  await page.waitForURL(/#scene-graph$/);
  await page.locator("#scene-source-workflow").waitFor();
  assert.equal(await page.getByText("其他数据来源", { exact: true }).isVisible(), false, "guest users must not see advanced source imports");
  assert.equal(await page.locator("#scene-source-normalize").isVisible(), false, "manual normalization must remain admin-only");
  await page.getByText("浏览 OSM 并截取研究区；车道级细节可继续在画布中编辑。", { exact: true }).waitFor();
  await page.goto(`${origin}/#viewer`);
  const recommendedAction = page.locator(".studio-recommended-action");
  await recommendedAction.waitFor();
  assert.equal(await recommendedAction.getAttribute("data-recommended-action"), "source", "an empty workflow must recommend the OSM source task");
  assert.match(await recommendedAction.innerText(), /推荐下一步[\s\S]*选择 OSM 研究区/);
  await recommendedAction.click();
  await page.waitForURL(/#scene-graph$/);
  await page.locator("#scene-osm-aoi-picker .osm-aoi-picker").waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("roadgen3d:professional-open-osm-picker")),
    null,
    "the choose-my-own-OSM action must be consumed after opening the direct AOI workflow",
  );
  assert.deepEqual(await page.evaluate(() => ({
    guest: localStorage.getItem("roadgen3d-public-session-token"),
    account: localStorage.getItem("roadgen3d-session-token"),
  })), { guest: "fixture-guest-token", account: null }, "professional navigation must preserve the guest token without creating an account session");

  console.log("professional navigation: tool switching, workflow grouping, scenario workbench, and generation confirmation verified");
} finally {
  await browser?.close();
  await server.close();
}
