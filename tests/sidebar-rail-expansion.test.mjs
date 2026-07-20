import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const adapter = read("src/desktop-shell-adapter.ts");
const styles = read("src/styles/shell/single-left.css");

assert.match(adapter, /roadgen:sidebar-expanded:/, "the user preference must persist per workbench route");
assert.match(adapter, /workbench-sidebar-rail-toggle/, "the compact rail needs a permanent expand control");
assert.match(styles, /--workbench-brand-column: 238px/, "expanded rail must match the Studio brand column");
assert.match(styles, /inset-block-start: calc\(-1 \* var\(--workbench-brand-header-height\)\)/, "expanded rail must align with the top brand column");
assert.match(styles, /padding-block-start: calc\(var\(--workbench-brand-header-height\) \+ 0\.35rem\)/, "navigation must begin below the visible wordmark");

console.log("sidebar rail expansion contract: ok");
