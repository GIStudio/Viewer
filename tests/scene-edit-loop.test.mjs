import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
const [api, editor, autosave, assets, commands, course, shortcut, styles, app, sceneInteraction, stage, editStatus, editStatusStyles, publicProject, routeIsland, sceneHelpers] = await Promise.all([
  read("viewer-api.ts"),
  read("viewer-scene-object-editor.ts"),
  read("viewer-scene-edit-autosave.ts"),
  read("viewer-scene-asset-dialog.ts"),
  read("viewer-command-registry.ts"),
  read("react/CourseSharedWorkbenches.tsx"),
  read("react/ShortcutModal.tsx"),
  read("style.css"),
  read("app.ts"),
  read("viewer-scene-interaction-controller.ts"),
  read("viewer-panels/stage.ts"),
  read("viewer-object-edit-status.ts"),
  read("styles/viewer/object-edit-status.css"),
  read("professional-public-project.ts"),
  read("react/RouteIsland.tsx"),
  read("viewer-scene-helpers.ts"),
]);
const viewerRuntime = `${app}\n${sceneInteraction}`;

for (const op of ["move_instance", "rotate_instance", "scale_instance", "add_instance", "delete_instance", "duplicate_instance", "replace_asset"]) {
  assert.match(api, new RegExp(`op: "${op}"`), `missing ${op} command contract`);
}
assert.match(editor, /TransformControls/);
assert.match(editor, /setTranslationSnap\(active \? 0\.25/);
assert.match(editor, /degToRad\(5\)/);
assert.match(editor, /0\.25 \/ snapshot\.scale, 4 \/ snapshot\.scale/);
for (const cancelResult of ["transform_cancelled", "selection_cleared", "nothing_to_cancel"]) {
  assert.match(editor, new RegExp(`"${cancelResult}"`), `missing ${cancelResult} editor result`);
}
assert.match(editor, /getInteractionState: interactionState/);
assert.match(editor, /cancelStep/);
assert.match(editor, /const exit = \(\): void =>/);
assert.match(editor, /options\.onInteractionStateChange/);
assert.match(editor, /replaceSelected\(asset/);
assert.match(editor, /op: "replace_asset"/);
assert.match(editor, /位置、旋转和缩放保持不变/);
assert.match(editor, /function instanceSelectionRoots/);
assert.match(editor, /roadgen3d-instance-selection/);
assert.match(editor, /for \(const member of members\) group\.attach\(member\)/);
assert.match(autosave, /scene-edit-queues/);
assert.match(autosave, /statusCode === 409/);
assert.match(autosave, /mergeCommand/);
assert.match(course, /auto_evaluate_mode: "structured"/);
assert.match(course, /asset-palette/);
assert.doesNotMatch(assets, /application\/x-roadgen3d-scene-asset/);
assert.doesNotMatch(assets, /draggable="true"/);
assert.doesNotMatch(assets, /dragstart/);
assert.match(assets, /asset-catalog\/search/);
assert.match(assets, /asset-catalog\/model/);
assert.match(assets, /data-action="place"/);
assert.match(assets, /添加到场景/);
assert.match(assets, /data-action="replace"/);
assert.match(assets, /全部可用资产/);
for (const shortcutKey of ["edit.move", "edit.rotate", "edit.scale", "edit.duplicate", "edit.delete", "edit.assets", "edit.undo", "edit.redo", "edit.cancel", "edit.exit"]) {
  assert.match(commands, new RegExp(`id: "${shortcutKey.replace(".", "\\.")}"`));
}
assert.match(shortcut, /VIEWER_COMMANDS/);
assert.match(styles, /viewer-workbench-dialog/);
assert.match(styles, /background-size: 24px 24px/);
assert.match(stage, /id="viewer-object-edit-status"/);
assert.match(stage, /id="viewer-object-edit-exit"/);
assert.match(stage, /id="viewer-direct-edit"/);
assert.match(stage, /id="viewer-top-assets"/);
assert.match(editStatus, /setInteractionState/);
assert.match(editStatus, /Esc exits editing/);
assert.match(editStatus, /退出编辑/);
assert.match(editStatusStyles, /position: absolute/);
assert.match(editStatusStyles, /viewer-object-edit-status\[hidden\]/);
assert.match(viewerRuntime, /function setObjectEditingEnabled\(enabled: boolean/);
assert.match(viewerRuntime, /sceneObjectEditor\.exit\(\)/);
assert.match(viewerRuntime, /assetBboxEnabledBeforeEditing/);
assert.match(viewerRuntime, /showLabels: true/);
assert.match(viewerRuntime, /showLabels: false/);
assert.match(sceneHelpers, /options\.showLabels/);
assert.match(viewerRuntime, /const result = sceneObjectEditor\.cancelStep\(\)/);
assert.match(viewerRuntime, /result === "nothing_to_cancel"/);
assert.match(viewerRuntime, /setObjectEditingEnabled\(false, \{ announce: false \}\)/);
assert.match(viewerRuntime, /roadgen3d-asset-placement-ghost/);
assert.match(viewerRuntime, /function startAssetPlacement/);
assert.match(viewerRuntime, /function placeAssetAtCurrentTarget/);
assert.match(assets, /退出放置后可按住鼠标左键拖动视角/);
assert.doesNotMatch(assets, /Shift \+ 点击进入漫游/);
assert.match(viewerRuntime, /正在漫游到点击位置；按住左键拖动可调整视角/);
assert.match(viewerRuntime, /captureSceneViewSnapshot/);
assert.match(viewerRuntime, /restoreSceneViewSnapshot\(viewSnapshot\)/);
assert.match(styles, /data-asset-placement-active="true"/);
assert.match(viewerRuntime, /persistSceneCommands\(commands, \{ layoutPath \}\)/, "scene persistence must receive the active local layout path");
assert.match(publicProject, /revisions\/import-layout/, "the first 3D edit must lazily materialize an explicit layout into the project");
assert.match(publicProject, /await openProfessionalOwnedRevision[\s\S]*sceneRef = workflow\.getSnapshot\(\)\.sceneRef/, "editing must switch to the imported project revision before applying commands");
assert.match(routeIsland, /context\.layoutPath/, "the professional host must forward the active layout path");

console.log("scene edit loop contract ok");
