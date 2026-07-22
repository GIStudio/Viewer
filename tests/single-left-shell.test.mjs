import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const types = read("src/shell-types.ts");
const shell = read("src/react/ViewerDesktopShell.tsx");
const adapter = read("src/desktop-shell-adapter.ts");
const singleLeft = read("src/styles/shell/single-left.css");
const professional = read("src/styles/professional-studio.css");
const theme = read("src/styles/studio-theme.css");
const course = read("src/react/CourseStudio.tsx");
const routeIsland = read("src/react/RouteIsland.tsx");
const brand = read("src/react/StudioBrandHeader.tsx");
const menus = read("src/react/ShellMenus.tsx");
const viewerOverlays = read("src/styles/viewer/menus-overlays.css");
const overlaySurfaces = read("src/styles/overlays/viewer-surfaces.css");
const viewerApp = [
  "src/app.ts",
  "src/viewer-output-panel-controller.ts",
  "src/viewer-scene-interaction-controller.ts",
  "src/viewer-workspace-view-controller.ts",
].map(read).join("\n");
const viewerStage = read("src/viewer-panels/stage.ts");
const schemeCompare = read("src/viewer-scheme-compare.ts");
const stageConsole = read("src/styles/viewer/stage-console.css");
const sceneToolbar = read("src/styles/scene-graph/toolbar-stage.css");
const expandedMap = [
  "src/viewer-expanded-map.ts",
  "src/viewer-plan-map-renderer.ts",
].map(read).join("\n");
const sceneShell = read("src/scene-graph/shell.ts");
const sceneGraph = [
  "src/scene-graph.ts",
  "src/sg-annotation-controller.ts",
  "src/sg-event-binder.ts",
  "src/sg-markup-builder.ts",
  "src/sg-render-controller.ts",
  "src/sg-source-workflow-controller.ts",
].map(read).join("\n");
const accountPanels = read("src/professional-account-panels.ts");
const professionalSession = read("src/professional-session.ts");

for (const mode of ["single_left_overlay", "course_single_left", "legacy_dual"]) {
  assert.match(types, new RegExp(`\\| \\"${mode}\\"`), `missing shell mode ${mode}`);
}
assert.match(types, /interface WorkbenchSidebarController/);
assert.match(types, /current\?: boolean/);
assert.match(shell, /data-shell-mode=\{mode\}/);
assert.match(adapter, /if \(activeRightTab === page\.id\) closeSidebar\(\)/);
assert.match(adapter, /event\.key === "Escape"/);
assert.match(singleLeft, /grid-template-columns: var\(--workbench-layout-track\) minmax\(0, 1fr\)/);
assert.match(singleLeft, /position: absolute;[\s\S]*inset: 0 auto 0 0/);
assert.match(singleLeft, /margin-right: 0 !important/);
assert.equal((routeIsland.match(/const shellMode: WorkbenchShellMode = "single_left_overlay";/g) ?? []).length, 2);
assert.doesNotMatch(shell, /desktop-shell-traffic-lights/);
assert.match(shell, /StudioBrandHeader/);
assert.match(brand, /城市街道设计与研究工作台/);
assert.match(brand, /Urban Street Design & Research Workbench/);
assert.match(menus, /desktop-shell-workbench-menu/);
assert.match(theme, /--rg-ink: #102d3a/);
assert.match(theme, /--rg-paper: #f3f0e7/);
assert.match(professional, /background-image: var\(--rg-grid-paper\)/);
assert.match(professional, /\.desktop-shell-center-stage/);
assert.match(professional, /\.desktop-shell-center-stage \{[\s\S]*box-shadow: none;/, "the stage must not cast a shadow over sidebar drawers");
assert.match(singleLeft, /\.desktop-shell-right-panels \{[\s\S]*z-index: 50;/, "sidebar drawers must sit above the scene stage");
assert.doesNotMatch(singleLeft, /box-shadow: 18px 0 44px/, "single-left drawers must not cast a high-contrast shadow over the stage");
assert.match(professional, /> \.workflow-shell-bar \{[\s\S]*display: none/);
assert.match(professional, /data-current="true"/);
assert.doesNotMatch(routeIsland, /WORKFLOW_STEPS\.map/);
assert.match(routeIsland, /id: "prepare-annotation"/);
assert.doesNotMatch(routeIsland, /id: "prepare-assets"/, "3D assets must not remain a left-rail workflow step");
assert.match(routeIsland, /group: "flow"/);
assert.match(viewerStage, /id="viewer-direct-edit"/);
assert.match(viewerStage, /id="viewer-top-assets"/);
assert.match(viewerStage, /id="viewer-scheme-compare-toggle"/);
assert.match(viewerStage, /id="viewer-feature-quality-toggle"[^>]+data-admin-feature-quality[^>]+hidden[^>]+aria-hidden="true"[^>]+aria-controls="viewer-feature-quality-workbench"/, "the stage must keep the micro-feature experiment entry hidden until an administrator is identified");
assert.match(viewerStage, /id="viewer-feature-quality-workbench"[^>]+role="dialog"/, "the feature experiment must use a dedicated comparison dialog");
assert.match(viewerStage, /id="viewer-scheme-compare-toggle"[^>]+aria-controls="viewer-scenario-workbench"/, "the A\/B\/C action must open the formal revision workbench");
assert.doesNotMatch(viewerStage, /id="viewer-scheme-compare-toggle"[^>]+data-viewer-center-control="schemes"/, "the A\/B\/C action must not reopen the generic recent-layout chooser");
assert.doesNotMatch(viewerStage, /viewer-consistency-toggle/, "consistency diagnostics must not crowd the 3D toolbar");
assert.match(viewerStage, /stage-toolbar-cluster[\s\S]*编辑与方案[\s\S]*stage-toolbar-cluster[\s\S]*质量检查[\s\S]*stage-toolbar-cluster[\s\S]*导出/, "the 3D toolbar must visibly group edit, QA, and export actions");
assert.match(read("src\/react\/shellModel.tsx"), /tools-open-consistency/, "consistency diagnostics must remain available from the workbench menu");
assert.match(viewerStage, /id="viewer-compare-panel" hidden/);
assert.match(read("src/viewer-scenario-workbench.ts"), /renderLane\("A", scenarios\)[\s\S]*renderLane\("B", scenarios\)[\s\S]*renderLane\("C", scenarios\)/, "the formal workbench must render three semantic revision lanes");
assert.doesNotMatch(viewerApp, /createHistoryPanelController/);
assert.match(read("src\/viewer-settings-panel.ts"), /id="viewer-floating-lane-panel-host"/);
assert.doesNotMatch(read("src\/viewer-panels\/rightTabs.ts"), /floating-lane/);
assert.match(viewerApp, /function localizeTaskMessage\(message: string\)/);
assert.match(viewerApp, /正在查看\$\{scene\}/);
assert.doesNotMatch(routeIsland, /model-input-audit/);
assert.doesNotMatch(routeIsland, /mountModelInputBrowser/);
assert.match(adapter, /workbench-sidebar-rail-toggle/);
assert.match(adapter, /let sidebarRailExpanded = false/);
assert.match(adapter, /sidebarRailExpanded = !sidebarRailExpanded/);
assert.match(adapter, /function createWorkbenchSidebarDrawer\(/, "single-left sidebar pages must use the shared drawer component");
assert.match(adapter, /dataset\.workbenchSidebarDrawer = "true"/, "shared drawers must expose a stable component marker");
assert.match(singleLeft, /data-sidebar-rail-expanded="true"/);
assert.match(singleLeft, /--workbench-brand-column: 238px/);
assert.match(singleLeft, /--workbench-rail-width: var\(--workbench-menu-track\)/);
assert.match(singleLeft, /data-sidebar-open="true"\][\s\S]*--workbench-layout-track: calc\(var\(--workbench-rail-width\) \+ var\(--workbench-drawer-width\)\)/, "opening a drawer must reserve real map viewport width");
assert.match(singleLeft, /inset: 0 auto 0 var\(--workbench-rail-width\)/, "drawer placement must start after the navigation rail");
assert.match(singleLeft, /grid-template-columns: var\(--workbench-layout-track\) minmax\(0, 1fr\)/);
assert.match(singleLeft, /transition: grid-template-columns 180ms ease/);
assert.match(singleLeft, /data-sidebar-rail-expanded="true"\] \.desktop-shell-tab-list \{[\s\S]*inset: 0 auto 0 0/);
assert.match(
  singleLeft,
  /data-shell-mode="single_left_overlay"\]\[data-sidebar-rail-expanded="true"\] \.desktop-shell-tab-list,[\s\S]*width: var\(--workbench-menu-expanded\)/,
  "the expanded navigation list must retain the same width as the 238px rail",
);
assert.doesNotMatch(viewerStage, /viewer-presets-panel/);
assert.doesNotMatch(course, /course-design-timeline/);
assert.match(course, /course-design-external-drawer/);
assert.match(course, /sidebarPages=\{sidebarPages\}/);
assert.match(course, /useState<OsmAoiSelection \| null>\(null\)/, "new course projects must begin without a preselected AOI");
assert.match(course, /disabled=\{!selection\}/, "course project creation must wait for map capture");
assert.doesNotMatch(course, /course-coordinate-grid">\{bbox\.map/, "coordinates must not be the default course workflow");
assert.match(viewerOverlays, /\.viewer-minimap \{[\s\S]*right: 1rem;/, "scene map should stay in the lower-right corner");
assert.doesNotMatch(viewerOverlays, /\.viewer-minimap \{[\s\S]*left: 1rem;/, "scene map must not return to the lower-left corner");
assert.match(viewerStage, /id="viewer-minimap-expand"/, "scene map launcher must remain available");
assert.match(viewerStage, /id="viewer-minimap-plan"/, "scene map requires a plan preview canvas");
assert.match(stageConsole, /\.viewer-shell-embedded \{[\s\S]*position: relative;/, "viewer overlays need the stage as their positioning context");
assert.match(stageConsole, /\.stage-toolbar \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\);/, "the 3D toolbar must organize its control groups in compact rows");
assert.match(stageConsole, /\.stage-toolbar-group \{[\s\S]*width: 100%;[\s\S]*flex-wrap: wrap;/, "each 3D toolbar row must wrap safely without stretching individual controls");
assert.match(singleLeft, /\.viewer-shell > \.viewer-settings-panel,[\s\S]*left: calc\(-1 \* var\(--workbench-drawer-width\)\)/, "stage-resident fallback settings must target the reserved left drawer coordinate");
assert.match(viewerApp, /shell\.sidebar\.registerPages\(\[\{[\s\S]*id: "settings",[\s\S]*content: settingsPanelEl/, "single-left settings must mount in the shell drawer instead of the stage");
assert.match(overlaySurfaces, /\.workbench-sidebar-drawer \.viewer-settings-panel \.viewer-settings-header \{[\s\S]*display: none/, "standard drawer must replace the nested settings header");
assert.match(viewerApp, /minimapExpandEl\.addEventListener\("click"/);
assert.match(viewerApp, /expandedMapController\.open\(\)/, "scene map launcher must open the canonical plan dialog");
assert.match(viewerApp, /renderPlanMapCanvas\(/, "lower-right preview must use the canonical plan compositor");
assert.match(viewerApp, /showDecorations: false/, "lower-right preview must omit map labels and other presentation decorations");
assert.doesNotMatch(viewerApp, /drawMinimapSurfacePlan\(/, "lower-right preview must not use the legacy GLB-top-face renderer");
assert.match(expandedMap, /export function renderPlanMapCanvas/, "canonical plan compositor must stay reusable");
assert.match(expandedMap, /showDecorations = true/, "canonical renderer must keep full decorations by default");
assert.match(expandedMap, /bench: 100/, "amenity coverage must use a 100 m pedestrian catchment for benches");
assert.match(expandedMap, /bus_stop: 500/, "amenity coverage must use a 500 m access catchment for bus stops");
assert.match(expandedMap, /座椅100m，公交500m/, "the amenity coverage legend must disclose its category-specific radii");
assert.match(sceneShell, /id: "inspector",[\s\S]*presentation: "modal"/, "Inspector must open as a dialog so cross-section previews retain usable width");
assert.match(adapter, /desktop-shell-modal/, "shell must render modal tab content outside the sidebar drawer");
assert.match(adapter, /aria-haspopup", "dialog"/, "modal tab launcher must expose dialog semantics");
assert.doesNotMatch(sceneShell, /annotation-scenario-select/, "obsolete scenario-design selectors must not remain in the annotation workbench");
assert.doesNotMatch(sceneGraph, /void loadScenarioDesigns\(/, "the annotation workbench must not load the obsolete scenario catalog");
assert.match(sceneShell, /annotation-show-osm-labels/, "annotation controls must expose an OSM label toggle");
assert.match(sceneShell, /annotation-show-annotation-labels/, "annotation controls must expose an overlay-label toggle");
assert.match(sceneShell, /id="annotation-tools-actions-slot"/, "annotation actions must live in the left-side Annotation tool page");
assert.doesNotMatch(sceneShell.slice(sceneShell.indexOf("export function createSceneGraphStageHtml")), /annotation-stage-action-toolbar/, "the center canvas must not retain the annotation action toolbar");
assert.match(sceneToolbar, /:has\(#desktop-shell-tab-panel-source\.active\):has\(#scene-osm-aoi-picker:not\(\[hidden\]\)\)/, "direct OSM selection must reserve layout space for the source drawer");
assert.match(sceneShell, /annotation-original-opacity-label/, "original/base-map opacity label must be addressable at runtime");
assert.match(sceneShell, /id: "inspector",[\s\S]*<details class="scene-collapsible-panel" open>/, "Inspector selected-feature content must be expanded by default");
assert.match(professionalSession, /\/api\/v1\/auth\/guest/, "public access must create a guest identity without an invite");
assert.match(accountPanels, /默认公开访问/, "administration must explain the default no-invite public path");
assert.doesNotMatch(accountPanels, /data-admin-invite/, "the unused one-time-invite action must not remain in the admin panel");
assert.doesNotMatch(accountPanels, /admin\/registration-invites/, "admin navigation must not expose invite management");
assert.match(stageConsole, /\.viewer-generation-dialog-panel \{[\s\S]*min-width: 0;/, "generation dialog must shrink within the stage");
assert.match(stageConsole, /\.viewer-generation-operation-list strong \{[\s\S]*overflow-wrap: anywhere;/, "long generation messages must wrap instead of widening the dialog");
assert.match(sceneShell, /scene-source-review-step/, "source review status must have a compact layout hook");
assert.match(sceneGraph, /sceneGraph\.right\.baseMapOpacity/, "OSM sources must relabel original opacity as base-map opacity");
assert.doesNotMatch(adapter, /firstChineseCharacter/, "Chinese navigation must never reduce a page to one character");
assert.match(adapter, /dataset\.sidebarIcon = iconText \? "true" : "false"/);
assert.match(singleLeft, /data-sidebar-icon="false"/, "full-label pages must not reserve an abbreviation column");
assert.doesNotMatch(sceneGraph, /METAAURBAN_ASSET_GUIDE_LINES/, "the unused MetaUrban asset-install guide must not appear in Inspector");
assert.match(sceneGraph, /localizedStripLabel/, "cross-section strip labels must be localized");
assert.match(sceneGraph, /vertexCountExplained/, "road geometry must explain the meaning of vertex counts");
assert.match(sceneGraph, /annotation-road-properties-grid/, "road parameters must have a compact inspector layout hook");
assert.match(singleLeft, /grid-template-columns: var\(--workbench-layout-track\) minmax\(0, 1fr\)/);
assert.match(sceneGraph, /annotation-cross-preview-toolbar/, "detailed cross-section management must live with the preview");
assert.doesNotMatch(sceneGraph, /buildStripSectionMarkup/, "duplicate left-center-right strip management panels must be removed");

console.log("single-left shell contract: ok");
