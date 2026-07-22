import assert from "node:assert/strict";
import fs from "node:fs";

const app = [
  "app.ts",
  "viewer-lifecycle-controller.ts",
  "viewer-scene-interaction-controller.ts",
  "viewer-workflow-ui-controller.ts",
].map((name) => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8")).join("\n");
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
assert.doesNotMatch(stage, /viewer-legacy-starter-warning/, "the stage must not explain retired starters with a geometry-warning banner");
assert.doesNotMatch(app, /legacyStarterSceneIdFromPath/, "a generated layout path must never be mistaken for a retired starter");
assert.match(app, /await loadStarterScenePreview\(\)/, "an empty professional workflow must load the starter preview");
assert.match(
  app,
  /const requestedLayoutPath = explicitLayoutPath\s*\|\| \(\(hostOptions\.embedded \|\| hostOptions\.preferWorkflowScene\) \? workflowLayoutPath : null\)/,
  "only an explicit professional handoff may restore a workflow scene; the public root remains a starter entry",
);
assert.match(app, /workflow\.setStarterPreview\(starter\.id\)/, "starter loading must publish the transient review state");
assert.match(app, /frameSceneFocus\(starter\.focus_xz, starter\.focus_extent_m\)/, "starter loading must frame the cross junction rather than the full corridor");
assert.match(app, /STARTER_REVIEW_ONBOARDING_KEY/, "starter review onboarding must be tracked separately from normal 3D navigation");
assert.match(app, /hostOptions\.showStarterReviewOnLoad !== false/, "the starter review must be suppressible for a 2D-to-3D handoff");
assert.match(routeIsland, /showStarterReviewOnLoad: pendingViewerTarget === null/, "a pending 2D-to-3D target must suppress the starter review dialog");
assert.match(routeIsland, /const shouldPreferWorkflowScene = pendingViewerTarget !== null && pendingViewerTarget !== "generate";/, "2D-to-3D handoff should keep workflow scenes for non-generation revisits");
assert.match(routeIsland, /preferWorkflowScene: shouldPreferWorkflowScene/, "2D-to-3D handoff should evaluate whether workflow scenes should be restored");
assert.match(app, /copyStarterToProject/, "copying the starter must materialize an owned project revision");
assert.match(app, /hostOptions\.onStarterCopied\?\.\(\)/, "a successful starter copy must notify the workbench shell");
assert.match(routeIsland, /onStarterCopied:[\s\S]*desktop-shell-modal-close[\s\S]*shell\.sidebar\.activate\("public-space"\)/, "a successful starter copy must close the review dialog and open the bulletin-board sidebar");
assert.match(stage, /复制为我的项目/, "the demo copy action must describe the ownership transition");
assert.match(pipeline, /id="viewer-starter-review-guide"/, "03 must explain how 01A and 02 produce a user scene");
assert.doesNotMatch(pipeline, /<b>01B<\/b>/, "the hidden asset step must not return in the starter guide");
assert.match(
  app,
  /shouldSyncGeneratedLayout:\s*\(\) => !parseQueryLayoutPath\(\)/,
  "an explicit layout URL must not be overwritten by a restored workflow scene",
);
assert.doesNotMatch(app, /fallbackCandidates/, "startup must never silently substitute an arbitrary recent scene");
assert.match(app, /The scene contains no usable road geometry or has invalid bounds/, "starter loading must reject empty or invalid scene bounds");
assert.match(selection, /persistSelectionInUrl !== false/, "preview loading must not write its manifest into the URL");
assert.match(hitInfo, /"context_ground", "context_ground_base"/, "hit inspection must support old and new background-ground node names");
assert.match(hitInfo, /场景底板；正常情况下仅在道路与铺装范围之外可见。/, "Chinese hit inspection must explain the background-ground contract");
assert.match(hitInfo, /Selecting this object inside the road area usually indicates a gap/, "English hit inspection must retain the geometry diagnostic");
assert.match(routeIsland, /materializeDefaultStarterScene\(workflow\)/, "01A and editing must materialize the preview before mutation");
assert.doesNotMatch(panelElements, /#viewer-design-close/, "the paged generation dialog must not require its removed legacy close button");

console.log("starter scene: preview priority, explicit materialization, and empty-scene protection verified");
