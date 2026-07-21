import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [theme, overlayEntry, overlayParts, main, app, settings, panels, commands, shortcuts, assets, stage, junction, course] = await Promise.all([
  readFile(new URL("../src/styles/studio-theme.css", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/overlay-system.css", import.meta.url), "utf8"),
  Promise.all([
    "foundation.css",
    "settings.css",
    "viewer-surfaces.css",
    "route-surfaces.css",
    "responsive.css",
  ].map((file) => readFile(new URL(`../src/styles/overlays/${file}`, import.meta.url), "utf8"))),
  readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-settings-panel.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-panel-controller.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-command-registry.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/react/ShortcutModal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-scene-asset-dialog.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/viewer-panels/stage.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/junction-composer.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/react/CourseStudio.tsx", import.meta.url), "utf8"),
]);
const overlayStyles = overlayParts.join("\n");

for (const token of [
  "--rg-overlay-scrim",
  "--rg-overlay-surface",
  "--rg-overlay-shadow",
  "--rg-overlay-drawer-width",
  "--rg-overlay-z-modal",
  "--rg-overlay-duration",
]) {
  assert.match(theme, new RegExp(token), `missing shared overlay token ${token}`);
}

assert.match(main, /import "\.\/styles\/overlay-system\.css"/);
for (const file of ["foundation", "settings", "viewer-surfaces", "route-surfaces", "responsive"]) {
  assert.match(overlayEntry, new RegExp(`@import "\\./overlays/${file}\\.css"`));
}
assert.match(overlayStyles, /prefers-reduced-motion/);
for (const crossRouteSurface of [
  ".viewer-workbench-dialog",
  ".viewer-settings-panel",
  ".viewer-expanded-map-panel",
  ".junction-composer-overlay",
  ".ae-toast",
  ".course-design-external-drawer",
  ".osm-aoi-picker-panel",
  ".osm-road-study-panel",
]) {
  assert.ok(overlayStyles.includes(crossRouteSurface), `shared overlay CSS must cover ${crossRouteSurface}`);
}

for (const id of [
  "viewer-settings-panel",
  "viewer-settings-close",
  "lighting-preset",
  "lighting-exposure",
  "lighting-key",
  "lighting-fill",
  "lighting-warmth",
  "lighting-shadow",
  "environment-weather",
  "environment-intensity",
  "environment-time",
  "environment-sun-cycle-toggle-btn",
  "environment-sun-cycle-enabled",
  "environment-sun-cycle-speed",
  "third-person-toggle-btn",
  "frame-mode-toggle-btn",
  "asset-bbox-toggle-btn",
  "asset-move-toggle-btn",
  "laser-pointer-toggle-btn",
  "graph-overlay-toggle-btn",
  "layout-overlay-toggle-btn",
  "analysis-overlay-toggle-btn",
  "diorama-finish-toggle-btn",
  "audio-toggle-btn",
  "viewer-capability-status",
  "viewer-scene-command-json",
  "viewer-scene-command-submit",
  "viewer-scene-command-undo",
  "viewer-scene-command-status",
]) {
  assert.ok(settings.includes(`id="${id}"`), `settings DOM contract lost #${id}`);
}
assert.match(stage, /id="viewer-top-assets"/, "asset access must remain in the top-right stage toolbar");

assert.equal((settings.match(/class="viewer-settings-group"/g) ?? []).length, 4);
assert.match(settings, /aria-labelledby="viewer-settings-title"/);
assert.match(panels, /setAttribute\("aria-hidden", open \? "false" : "true"\)/);
assert.match(panels, /focusBeforePanelOpen/);
assert.match(app, /event\.code === "Escape" && panelController\.isAnyOpen\(\)/);

for (const commandId of ["edit.move", "edit.rotate", "edit.scale", "edit.assets", "viewer.settings", "viewer.overlay"]) {
  assert.ok(commands.includes(`id: "${commandId}"`), `keyboard command lost: ${commandId}`);
}

for (const modalSource of [shortcuts, assets, stage, junction]) {
  assert.match(modalSource, /role=["\\]dialog/);
  assert.match(modalSource, /aria-modal=["\\]true/);
}
assert.match(junction, /event\.key === "Escape"/);
assert.match(junction, /previouslyFocused\?\.focus/);
assert.match(course, /course-design-external-drawer[^>]*role="dialog"/);

console.log("overlay visual and interaction contract: ok");
