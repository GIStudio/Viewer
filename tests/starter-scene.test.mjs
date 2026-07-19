import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const routeIsland = fs.readFileSync(new URL("../src/react/RouteIsland.tsx", import.meta.url), "utf8");
const stage = fs.readFileSync(new URL("../src/viewer-panels/stage.ts", import.meta.url), "utf8");
const starter = fs.readFileSync(new URL("../src/starter-scene.ts", import.meta.url), "utf8");
const workflow = fs.readFileSync(new URL("../src/workflow-controller.ts", import.meta.url), "utf8");
const pipeline = fs.readFileSync(new URL("../src/professional-pipeline.ts", import.meta.url), "utf8");
const draftStore = fs.readFileSync(new URL("../src/professional-draft-store.ts", import.meta.url), "utf8");
const selection = fs.readFileSync(new URL("../src/viewer-scene-selection-controller.ts", import.meta.url), "utf8");
const panelElements = fs.readFileSync(new URL("../src/viewer-panels/elements.ts", import.meta.url), "utf8");
const hitInfo = fs.readFileSync(new URL("../src/viewer-hit-info.ts", import.meta.url), "utf8");

assert.match(workflow, /kind: "starter_demo"; demoId: string/, "workflow scene refs must distinguish immutable starter previews");
assert.match(workflow, /setStarterPreview\(demoId\)/, "the read-only demo must be represented without materializing a workflow");
assert.match(workflow, /materializeStarterDemo\(input\)/, "workflow controller must atomically materialize a starter scene");
assert.match(pipeline, /snapshot\.sceneRef\?\.kind === "starter_demo"\) return "review"/, "the read-only demo must land on 03 result review");
assert.match(draftStore, /sceneLayoutPath: snapshot\.sceneLayoutPath/, "a materialized starter layout must survive browser refresh");
assert.match(starter, /\/api\/starter-scenes\/default/, "starter discovery must use the registered server contract");
assert.match(starter, /\/materialize`/, "starter materialization must use the idempotent server endpoint");
assert.match(starter, /await saveProfessionalWorkflowDraft\(workflow\.getSnapshot\(\)\)/, "materialization must be durable before the preview is dismissed");
assert.match(stage, /id="viewer-starter-demo-banner"/, "the main stage must identify the bundled demo");
assert.match(stage, /data-starter-action="materialize"/, "the demo banner must offer an explicit copy action");
assert.match(stage, /data-starter-action="source"/, "the demo banner must link to the user's OSM workflow");
assert.match(stage, /透明建筑白模/, "the starter banner must describe its complete intersection context");
assert.doesNotMatch(stage, /无家具/, "the complete starter must not be described as furniture-free");
assert.match(stage, /id="viewer-legacy-starter-warning"/, "legacy starters must display a geometry warning in the stage");
assert.match(stage, /data-starter-action="upgrade"/, "the legacy warning must link to the repaired default starter");
assert.match(stage, /广州 v6 示例/, "the legacy warning must name the repaired v6 starter");
assert.match(starter, /guangzhou_complete_intersection_v5/, "v5 must remain classified as a legacy starter");
assert.match(app, /await loadStarterScenePreview\(\)/, "an empty professional workflow must load the starter preview");
assert.match(
  app,
  /const requestedLayoutPath = hostOptions\.embedded \? workflowLayoutPath : explicitLayoutPath/,
  "a restored local draft must not rewrite the standalone root URL to an old layout",
);
assert.doesNotMatch(
  app,
  /const requestedLayoutPath = explicitLayoutPath \|\| workflowLayoutPath/,
  "the standalone root URL must remain the stable starter entry point",
);
assert.match(app, /workflow\.setStarterPreview\(starter\.id\)/, "starter loading must publish the transient review state");
assert.match(app, /frameSceneFocus\(starter\.focus_xz, starter\.focus_extent_m\)/, "starter loading must frame the cross junction rather than the full corridor");
assert.match(app, /shell\.sidebar\.activate\("review"\)/, "first-open onboarding must activate the 03 review page");
assert.match(pipeline, /id="viewer-starter-review-guide"/, "03 must explain how 01A, 01B and 02 produce a user scene");
assert.match(
  app,
  /shouldSyncGeneratedLayout:\s*\(\) => !parseQueryLayoutPath\(\)/,
  "an explicit layout URL must not be overwritten by a restored workflow scene",
);
assert.doesNotMatch(app, /fallbackCandidates/, "startup must never silently substitute an arbitrary recent scene");
assert.match(app, /The scene contains no usable road geometry or has invalid bounds/, "starter loading must reject empty or invalid scene bounds");
assert.match(selection, /persistSelectionInUrl !== false/, "preview loading must not write its manifest into the URL");
assert.match(app, /legacyStarterSceneIdFromPath\(currentLayoutPath\)/, "layout loading must identify retired starter packages");
assert.match(app, /url\.searchParams\.delete\("layout"\)/, "upgrading a legacy starter must remove its explicit layout URL");
assert.match(hitInfo, /"context_ground", "context_ground_base"/, "hit inspection must support old and new background-ground node names");
assert.match(hitInfo, /场景底板；正常情况下仅在道路与铺装范围之外可见。/, "Chinese hit inspection must explain the background-ground contract");
assert.match(hitInfo, /Selecting this object inside the road area usually indicates a gap/, "English hit inspection must retain the geometry diagnostic");
assert.match(routeIsland, /materializeDefaultStarterScene\(workflow\)/, "01A and editing must materialize the preview before mutation");
assert.doesNotMatch(panelElements, /#viewer-design-close/, "the paged generation dialog must not require its removed legacy close button");

console.log("starter scene: preview priority, explicit materialization, and empty-scene protection verified");
