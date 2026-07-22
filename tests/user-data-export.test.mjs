import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const panel = read("src/professional-account-panels.ts");
const session = read("src/professional-session.ts");
const api = read("src/course-api.ts");

assert.match(panel, /data-account-export="configuration"/);
assert.match(panel, /data-account-export="full"/);
assert.match(panel, /全部配置、2D 数据与历史/);
assert.match(panel, /全量文件（包含 3D 结果）/);
assert.match(panel, /session\.exportUserData\(scope\)/);
assert.match(session, /export type UserDataExportScope = "configuration" \| "full"/);
assert.match(session, /\/api\/v1\/workspace\/exports\/\$\{scope\}/);
assert.match(api, /downloadAuthenticatedFile/);
assert.match(api, /Authorization.*Bearer/);
assert.match(api, /Content-Disposition/);

console.log("user data export contract passed");
