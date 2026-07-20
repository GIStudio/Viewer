import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  stageSource,
  disclosureSource,
  lightingSource,
  sceneBoundsSource,
  appSource,
  i18nSource,
] = await Promise.all([
  readFile(new URL("../src/viewer-panels/stage.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-settings-tool-disclosure.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-lighting.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-scene-bounds.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-i18n.ts", import.meta.url), "utf8"),
]);

assert.match(
  stageSource,
  /id="viewer-mode-graph" hidden aria-hidden="true" tabindex="-1"/,
  "the incomplete Graph mode must not remain in the primary stage toolbar",
);

for (const id of ["asset-move-toggle-btn", "laser-pointer-toggle-btn"]) {
  assert.match(disclosureSource, new RegExp(`PRIMARY_TOOL_BUTTON_IDS[\\s\\S]*${id}`));
}
for (const id of ["third-person-toggle-btn", "frame-mode-toggle-btn", "asset-bbox-toggle-btn", "graph-overlay-toggle-btn"]) {
  assert.match(disclosureSource, new RegExp(`EXPERIMENTAL_TOOL_BUTTON_IDS[\\s\\S]*${id}`));
}
assert.match(disclosureSource, /document\.createElement\("details"\)/);
assert.match(i18nSource, /"viewer\.settings\.experimentalTools"/);
assert.match(i18nSource, /"viewer\.settings\.graph": \{ en: "Object graph debug", zh: "对象图调试" \}/);

for (const label of ["分析模型", "电影日景", "中性工作室", "明亮日景", "阴天", "黄金时刻", "夜景展示"]) {
  assert.match(lightingSource, new RegExp(label));
}
assert.match(appSource, /syncLightingPresetOptions\(language\)/);
assert.match(appSource, /lightingPresetLabel\(presetKey, language\)/);

assert.match(sceneBoundsSource, /object\.visible = false/);
assert.match(sceneBoundsSource, /viewerSuppressedByAtmosphericSky/);
assert.match(appSource, /prepareEnvironmentSkyDomes\(currentRoot\)/);

console.log("viewer display controls contract passed");
