import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const viewerRoot = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root: viewerRoot, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem("viewer-lang", "en"));
  await page.goto(`${origin}/#model-input-browser`);
  await page.waitForURL(`${origin}/#viewer`);
  await page.locator(".viewer-shell").waitFor();
  assert.equal(await page.locator(".model-input-browser").count(), 0, "retired experimental UI must not remain reachable");
  assert.equal(await page.locator('[data-shell-tab="model-input-audit"]').count(), 0, "retired experimental UI must not remain in navigation");
  console.log("model-input-browser retirement: legacy hash redirects to the professional 3D workbench");
} finally {
  await browser?.close();
  await server.close();
}
