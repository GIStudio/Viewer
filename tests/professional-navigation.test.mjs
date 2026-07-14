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
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "test fixture" }) });
  });

  await page.goto(`${origin}/#viewer`);
  await page.waitForLoadState("networkidle");
  await page.locator(".studio-brand-header").waitFor();

  assert.equal((await page.locator(".studio-header-context > span").textContent())?.trim(), "Professional tool");
  await page.getByText("Free switching · workflow and scene stay unchanged", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Course Studio", exact: true }).waitFor();
  await page.locator(".desktop-shell-workbench-select").click();
  await page.locator('[role="option"]').first().waitFor();
  const toolOptions = (await page.locator('[role="option"]').allTextContents()).map((value) => value.trim());
  assert.ok(toolOptions.some((value) => value.includes("2D Annotation")), "tool switcher must name annotation as a tool, not another numbered workflow step");
  await page.keyboard.press("Escape");

  const groupLabels = (await page.locator(".workbench-sidebar-group-label").allTextContents()).map((value) => value.trim());
  assert.ok(groupLabels.includes("Research flow"), "left rail must label the 01-05 items as the research flow");
  assert.ok(groupLabels.includes("Tools"), "left rail must distinguish professional tools from workflow steps");
  assert.equal(await page.locator('[data-shell-tab="workflow-source"]').getAttribute("data-sidebar-group"), "navigation");
  assert.equal(await page.locator('[data-shell-tab="scene"]').getAttribute("data-sidebar-group"), "workspace");

  const openGeneration = page.locator("#viewer-generate-and-load");
  assert.equal((await openGeneration.textContent())?.trim(), "New generation…");
  assert.equal(await openGeneration.getAttribute("aria-haspopup"), "dialog");
  await openGeneration.click();
  const generationDialog = page.locator("#viewer-generation-dialog");
  await generationDialog.waitFor({ state: "visible" });
  assert.equal(await generationDialog.getAttribute("data-open"), "true");
  await page.getByText("Input source", { exact: true }).waitFor();
  await page.getByText("Generation strategy", { exact: true }).waitFor();
  await page.getByText("Output", { exact: true }).waitFor();
  assert.equal(generationRequestCount, 0, "opening generation setup must not submit a generation job");
  assert.equal(await page.locator(".viewer-generation-dialog-panel .viewer-settings-close:visible").count(), 1, "generation dialog must expose one unambiguous close action");

  if (process.env.ROADGEN_PRO_NAV_SCREENSHOT) {
    await page.screenshot({ path: process.env.ROADGEN_PRO_NAV_SCREENSHOT, fullPage: true });
  }

  await page.locator("[data-close-generation]").last().click();
  await page.locator(".desktop-shell-language-select").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByText("可自由切换 · 不改变流程与场景", { exact: true }).waitFor();
  await page.getByText("研究流程", { exact: true }).waitFor();
  await page.getByText("专业工具", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "课程教学", exact: true }).click();
  await page.waitForURL(/#course-studio$/);

  console.log("professional navigation: tool switching, workflow grouping, course entry, and generation confirmation verified");
} finally {
  await browser?.close();
  await server.close();
}
