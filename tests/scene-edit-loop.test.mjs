import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
const [api, editor, autosave, assets, commands, course, shortcut, styles] = await Promise.all([
  read("viewer-api.ts"),
  read("viewer-scene-object-editor.ts"),
  read("viewer-scene-edit-autosave.ts"),
  read("viewer-scene-asset-dialog.ts"),
  read("viewer-command-registry.ts"),
  read("react/CourseSharedWorkbenches.tsx"),
  read("react/ShortcutModal.tsx"),
  read("style.css"),
]);

for (const op of ["move_instance", "rotate_instance", "scale_instance", "add_instance", "delete_instance", "duplicate_instance", "replace_asset"]) {
  assert.match(api, new RegExp(`op: "${op}"`), `missing ${op} command contract`);
}
assert.match(editor, /TransformControls/);
assert.match(editor, /setTranslationSnap\(active \? 0\.25/);
assert.match(editor, /degToRad\(5\)/);
assert.match(editor, /0\.25 \/ snapshot\.scale, 4 \/ snapshot\.scale/);
assert.match(autosave, /scene-edit-queues/);
assert.match(autosave, /statusCode === 409/);
assert.match(autosave, /mergeCommand/);
assert.match(course, /auto_evaluate_mode: "structured"/);
assert.match(course, /asset-palette/);
assert.match(assets, /application\/x-roadgen3d-scene-asset/);
assert.match(assets, /asset-catalog\/search/);
assert.match(assets, /asset-catalog\/model/);
for (const shortcutKey of ["edit.move", "edit.rotate", "edit.scale", "edit.duplicate", "edit.delete", "edit.assets", "edit.undo", "edit.redo"]) {
  assert.match(commands, new RegExp(`id: "${shortcutKey.replace(".", "\\.")}"`));
}
assert.match(shortcut, /VIEWER_COMMANDS/);
assert.match(styles, /viewer-workbench-dialog/);
assert.match(styles, /background-size: 24px 24px/);

console.log("scene edit loop contract ok");
