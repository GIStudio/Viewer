import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const adapter = read("src/desktop-shell-adapter.ts");
const styles = read("src/styles/shell/single-left.css");

assert.match(adapter, /let sidebarRailExpanded = false/, "professional navigation must start collapsed");
assert.match(adapter, /workbench-sidebar-rail-toggle/, "the rail must provide an explicit expand control");
assert.match(adapter, /sidebarRailExpanded = !sidebarRailExpanded/, "the expand control must reveal and hide complete labels");
assert.doesNotMatch(adapter, /firstChineseCharacter/, "Chinese page names must not collapse to one character");
assert.match(adapter, /dataset\.sidebarIcon = iconText \? "true" : "false"/);
assert.match(adapter, /const icons: Record<string, string>/, "the compact rail must use symbols rather than text abbreviations");
assert.match(adapter, /function createWorkbenchSidebarDrawer\(/, "drawer pages must be created by one shared shell component");
assert.match(styles, /--workbench-brand-column: 238px/, "the readable rail remains aligned with the Studio brand column");
assert.match(styles, /data-sidebar-open="true"\][\s\S]*--workbench-layout-track: calc\(var\(--workbench-rail-width\) \+ var\(--workbench-drawer-width\)\)/, "an open drawer must shrink the centre stage instead of overlaying it");
assert.match(styles, /data-sidebar-icon="false"/, "full-label pages must not reserve an empty icon column");

console.log("sidebar navigation labels contract: ok");
