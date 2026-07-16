import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const workflow = read("src/workflow-controller.ts");
const pipeline = read("src/professional-pipeline.ts");
const routeIsland = read("src/react/RouteIsland.tsx");
const app = read("src/app.ts");
const assetEditor = read("src/asset-editor.ts");
const stage = read("src/viewer-panels/stage.ts");

assert.match(workflow, /type AssetPreparationChoice = "current_manifest" \| "default_transparent_massing" \| null/);
assert.match(workflow, /type SceneReviewStatus = "not_available" \| "pending" \| "changes_requested" \| "accepted"/);
assert.match(workflow, /setGeneratedScene[\s\S]*sceneReviewStatus: "pending"/);
assert.match(workflow, /setSceneRevision[\s\S]*sceneReviewStatus: "pending"/);
assert.match(pipeline, /if \(snapshot\.sceneReviewStatus === "changes_requested"\) return "edit"/);
assert.match(pipeline, /if \(snapshot\.sceneReviewStatus === "accepted" \|\| snapshot\.evaluation\) return "deliver"/);
assert.match(routeIsland, /01A/);
assert.match(routeIsland, /01B/);
assert.match(routeIsland, /storeProfessionalViewerTarget/);
assert.match(routeIsland, /model-input-audit/);
assert.match(stage, /viewer-generation-asset-policy/);
assert.match(app, /building_representation = "transparent_massing"/);
assert.match(app, /setSceneReviewStatus\("accepted"\)/);
assert.match(app, /setSceneReviewStatus\("changes_requested"\)/);
assert.match(assetEditor, /setAssetPreparationChoice\("current_manifest"\)/);

console.log("professional Y-pipeline contract: ok");
