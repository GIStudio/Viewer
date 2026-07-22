import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controller = fs.readFileSync(path.join(root, "src/viewer-feature-quality-workbench.ts"), "utf8");
const parameters = fs.readFileSync(path.join(root, "src/viewer-parameter-design.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/app.ts"), "utf8");
const routeIsland = fs.readFileSync(path.join(root, "src/react/RouteIsland.tsx"), "utf8");

assert.match(controller, /variant_count:\s*variantCount/);
assert.match(controller, /feature_top/);
assert.match(controller, /feature_longitudinal/);
assert.match(controller, /feature_cross_section/);
assert.match(controller, /data-feature-compare/);
assert.match(controller, /accept\/\$\{encodeURIComponent\(variantId\)\}/);
assert.match(controller, /options\.applyPatch\(accepted\.patch\)/);
assert.match(parameters, /applyComposeConfigPatch\(patch/);
assert.match(parameters, /\.\.\.acceptedFeaturePatch/);
assert.match(controller, /if \(!options\.isAuthorized\(\)\)/, "the workbench must refuse to open outside an authorized admin session");
assert.match(app, /hostOptions\.isFeatureQualityAdmin\?\.\(\) === true/, "the viewer must default the experiment to hidden unless admin access is explicit");
assert.match(routeIsland, /isFeatureQualityAdmin: showAdvancedSourceTools/, "the professional session admin role must drive feature-quality visibility");

console.log("Feature quality workbench contract passed.");
