import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const course = readFileSync(resolve(root, "src/react/CourseStudio.tsx"), "utf8");
const api = readFileSync(resolve(root, "src/course-api.ts"), "utf8");

assert.match(api, /type PublicJobFailure/);
assert.match(api, /platformJobFailure/);
assert.match(course, /停止于第 \$\{activeIndex \+ 1\}\/6 阶段/);
assert.match(course, /Math\.min\(99, Math\.max\(0, job\.progress\)\)/);
assert.match(course, /failure\?\.user_message/);
assert.match(course, /返回检查2D标注/);
assert.match(course, /复制诊断编号/);
assert.match(course, /failure\?\.retryable === false/);
assert.doesNotMatch(course, /\{job\.error\}/);
assert.match(course, /公共地图数据 → 2D标注/);
assert.match(course, /初始3D版本/);
assert.match(course, /<summary>\{zh \? "技术详情"/);

console.log("course generation failure recovery contract: ok");
