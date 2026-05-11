import assert from "node:assert/strict";
import fs from "node:fs/promises";

const appSrc = await fs.readFile(new URL("../src/app.ts", import.meta.url), "utf8");

const expectedSnippet =
  'const sceneRoamActive = isPointerLookActive() || isThirdPersonKeyboardRoamActive();';
assert.ok(
  appSrc.includes(expectedSnippet),
  "sceneRoamActive should unify pointer-look and third-person keyboard roam checks.",
);

assert.ok(
  /movementKey[\s\S]*&&[\s\S]*panelController\.isAnyOpen\(\)[\s\S]*!sceneRoamActive/.test(appSrc),
  "Panel-open key handling should be blocked only when scene roam mode is not active.",
);

assert.ok(
  !/currentCameraMode\s*!==\s*"third_person"/.test(appSrc),
  "Deprecated currentCameraMode check should no longer guard scene navigation movement.",
);

assert.ok(
  /movementKey[\s\S]*&&[\s\S]*active[\s\S]*&&[\s\S]*!sceneRoamActive[\s\S]*return;/.test(appSrc),
  "Movement keys should still be short-circuited when scene roaming is not active.",
);

