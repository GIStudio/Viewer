import "./style.css";
import "./style-junction-editor.css";
import "./style-scene-compare.css";

import { mountViewer } from "./app";
import { mountSceneGraphPage } from "./scene-graph";
import { mountAssetEditor } from "./asset-editor";
import { mountJunctionEditor } from "./junction-editor";
import { createDesktopShell } from "./desktop-shell";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root element.");
}

const root = appRoot;

type Route = "viewer" | "scene-graph" | "asset-editor" | "junction-editor";
type Teardown = () => void;

let currentTeardown: Teardown | undefined;
let currentRenderId = 0;

function resolveRoute(): Route {
  const hash = window.location.hash;
  if (hash === "#scene-graph") return "scene-graph";
  if (hash === "#asset-editor") return "asset-editor";
  if (hash === "#junction-editor") return "junction-editor";
  return "viewer";
}

async function renderRoute(): Promise<void> {
  const renderId = ++currentRenderId;
  currentTeardown?.();
  currentTeardown = undefined;
  root.innerHTML = "";

  const route = resolveRoute();
  const shell = createDesktopShell(root, route);
  let teardown: Teardown;
  switch (route) {
    case "scene-graph":
      teardown = mountSceneGraphPage(shell);
      break;
    case "asset-editor":
      teardown = mountAssetEditor(shell);
      break;
    case "junction-editor":
      teardown = mountJunctionEditor(shell);
      break;
    default:
      teardown = await mountViewer(shell);
      break;
  }

  if (renderId !== currentRenderId) {
    teardown();
    shell.destroy();
    return;
  }

  currentTeardown = () => {
    teardown();
    shell.destroy();
  };
}

window.addEventListener("hashchange", () => {
  void renderRoute();
});

void renderRoute();
