import assert from "node:assert/strict";
import fs from "node:fs/promises";

const appSrc = await fs.readFile(new URL("../src/app.ts", import.meta.url), "utf8");
const designPanelSrc = await fs.readFile(new URL("../src/viewer-panels/designPanel.ts", import.meta.url), "utf8");
const controllerSrc = await fs.readFile(new URL("../src/viewer-design-controller.ts", import.meta.url), "utf8");

assert.ok(
  designPanelSrc.includes("<button id=\"viewer-design-branch-run\" class=\"viewer-nav-button viewer-nav-button-secondary\" type=\"button\">Load Latest Scores / 加载最近评分</button>"),
  "Advanced branch-run button should expose a read-only label for loading latest benchmark scores.",
);

assert.ok(
  appSrc.includes("designBranchRunEl.addEventListener(\"click\", () => void designController.loadLatestScoreResults(), { signal });"),
  "Advanced analysis button should invoke loadLatestScoreResults instead of branch generation.",
);
assert.ok(
  !appSrc.includes("designBranchRunEl.addEventListener(\"click\", () => void designController.runBranchGeneration(), { signal });"),
  "Advanced analysis button must not trigger runBranchGeneration.",
);

assert.ok(
  controllerSrc.includes("loadLatestScoreResults: () => Promise<void>;"),
  "ViewerDesignController contract should export loadLatestScoreResults.",
);
assert.ok(
  controllerSrc.includes("async function loadLatestScoreResults(): Promise<void>"),
  "Controller should implement loadLatestScoreResults helper.",
);

const latestScoreStart = controllerSrc.indexOf("async function loadLatestScoreResults");
assert.ok(latestScoreStart >= 0, "loadLatestScoreResults function must exist.");
const nextFuncIdx = controllerSrc.indexOf("  async function runBenchmarkBatch(): Promise<void>", latestScoreStart);
const latestScoreBody = controllerSrc.slice(latestScoreStart, nextFuncIdx >= 0 ? nextFuncIdx : undefined);

assert.ok(
  latestScoreBody.includes("await loadBenchmarkExplorer({ refresh: false });"),
  "loadLatestScoreResults should reuse the cached benchmark explorer GET path.",
);
assert.ok(
  !/postApiJson/.test(latestScoreBody),
  "loadLatestScoreResults must not issue POST requests.",
);

assert.ok(
  (
    controllerSrc.includes("function benchmarkSamplesUrl(refresh = false): string") &&
    controllerSrc.includes("`/api/design/benchmark-samples?${params.toString()}`") &&
    controllerSrc.includes('limit: "10000"')
  ),
  "Benchmark explorer should query persisted benchmark samples with limit=10000 and cached loading by default.",
);

assert.ok(
  controllerSrc.includes("void loadBenchmarkExplorer({ refresh: true });"),
  "Refresh Store should explicitly refresh the persisted benchmark sample store.",
);
assert.ok(
  controllerSrc.includes("Refreshing benchmark store..."),
  "Refresh Store should expose a distinct refresh status.",
);
assert.ok(
  controllerSrc.includes("Loading cached benchmark scores..."),
  "Load Latest Scores should expose a distinct cached-load status.",
);

assert.ok(
  controllerSrc.includes("<span>暂无评分结果</span>"),
  "Empty benchmark store should surface the expected '暂无评分结果' text.",
);
