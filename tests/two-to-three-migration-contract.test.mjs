import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const viewerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(viewerRoot, "../..");
const readViewer = (path) => readFileSync(resolve(viewerRoot, path), "utf8");
const readRepo = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const sceneGraph = readViewer("src/scene-graph.ts");
const sourceWorkflow = readViewer("src/sg-source-workflow-controller.ts");
const routeIsland = readViewer("src/react/RouteIsland.tsx");
const professionalPipeline = readViewer("src/professional-pipeline.ts");
const viewerRuntime = [
  readViewer("src/app.ts"),
  readViewer("src/viewer-lifecycle-controller.ts"),
  readViewer("src/viewer-workspace-view-controller.ts"),
].join("\n");
const sceneJobsApi = readRepo("web/api/routers/scene_jobs.py");
const designRuntime = readRepo("src/roadgen3d/services/design_runtime.py");
const streetLayout = readRepo("src/roadgen3d/street_layout.py");

// The former scene-graph.ts implementation now delegates to one explicit
// source-workflow controller instead of duplicating the 2D -> 3D state machine.
assert.match(sceneGraph, /createSgSourceWorkflowController/);
assert.match(sceneGraph, /generateApprovedScene/);
assert.match(sceneGraph, /openGenerationConfiguration/);

// A professional generation may only start from the current approved 2D
// revision. An existing 3D result is reusable only when its provenance revision
// matches the current source revision.
assert.match(sourceWorkflow, /approvedSourceRevision !== beforeApproval\.sourceRevision/);
assert.match(
  sourceWorkflow,
  /sceneSourceRevision === beforeApproval\.sourceRevision/,
  "the 2D -> 3D handoff must compare source provenance before reusing a scene",
);
assert.match(
  sourceWorkflow,
  /onNavigateProfessionalScene\?\.\(sceneMatchesCurrentAnnotation \? "browse" : "generate"\)/,
);
assert.match(sourceWorkflow, /snapshot\.approvedSourceRevision !== snapshot\.sourceRevision/);
assert.match(sourceWorkflow, /创建新的可追溯 3D 版本/);

// Route migration contract: persist the intended action before changing route,
// consume it once, and do not reopen the public starter during a workflow handoff.
assert.match(
  routeIsland,
  /onNavigateProfessionalScene: async \(target\) => \{\s*storeProfessionalViewerTarget\(target\);\s*navigateTo\("viewer"\);/,
);
assert.match(routeIsland, /const pendingViewerTarget = consumeProfessionalViewerTarget\(\)/);
assert.match(
  routeIsland,
  /const shouldPreferWorkflowScene = pendingViewerTarget !== null && pendingViewerTarget !== "generate"/,
);
assert.match(routeIsland, /showStarterReviewOnLoad: pendingViewerTarget === null/);
assert.match(professionalPipeline, /sessionStorage\.setItem\(PROFESSIONAL_VIEWER_TARGET_KEY, target\)/);
assert.match(professionalPipeline, /sessionStorage\.removeItem\(PROFESSIONAL_VIEWER_TARGET_KEY\)/);

// Viewer selection must use an explicit/workflow layout when requested and may
// not silently substitute an arbitrary recent or starter scene.
assert.match(
  viewerRuntime,
  /const requestedLayoutPath = explicitLayoutPath\s*\|\| \(\(hostOptions\.embedded \|\| hostOptions\.preferWorkflowScene\) \? workflowLayoutPath : null\)/,
);
assert.match(viewerRuntime, /const initialLayoutCandidates = requestedLayoutPath \? \[requestedLayoutPath\] : \[\]/);
assert.doesNotMatch(viewerRuntime, /fallbackCandidates/);

// The professional API remains wired to the asynchronous scene job service
// after the frontend extraction.
assert.match(sceneJobsApi, /@router\.post\("\/api\/scene\/jobs"\)/);
assert.match(sceneJobsApi, /service\.create_scene_job\(/);

// All supported contexts converge on the same generator and produce the layout
// plus GLB artifacts consumed by the Viewer.
assert.match(designRuntime, /def generate_scene_from_draft\(/);
assert.match(designRuntime, /result = compose_street_scene\(/);
assert.match(streetLayout, /def compose_street_scene\(/);
assert.match(streetLayout, /outputs\["scene_layout"\] = str\(layout_path\)/);
assert.match(streetLayout, /outputs\["scene_glb"\] = str\(glb_path\)/);
assert.match(streetLayout, /rendered_carriageway/);
assert.match(streetLayout, /rendered_sidewalk/);

console.log("professional 2D -> 3D migration contract: intent, revision provenance, scene jobs, generator, and outputs are connected");
