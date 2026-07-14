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

for (const mode of ["single_left_overlay", "course_single_left", "legacy_dual"]) {
  assert.match(types, new RegExp(`\\| \\"${mode}\\"`), `missing shell mode ${mode}`);
}
assert.match(types, /interface WorkbenchSidebarController/);
assert.match(shell, /data-shell-mode=\{mode\}/);
assert.match(adapter, /if \(activeRightTab === page\.id\) closeSidebar\(\)/);
assert.match(adapter, /event\.key === "Escape"/);
assert.match(singleLeft, /grid-template-columns: var\(--workbench-menu-track\) minmax\(0, 1fr\)/);
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
assert.match(professional, /box-shadow: 5px 5px 0 var\(--rg-yellow\)/);
assert.doesNotMatch(course, /course-design-timeline/);
assert.match(course, /course-design-external-drawer/);
assert.match(course, /sidebarPages=\{sidebarPages\}/);

console.log("single-left shell contract: ok");
