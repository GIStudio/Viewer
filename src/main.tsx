import "antd/dist/reset.css";
import "./style.css";
import "./style-junction-editor.css";
import "./style-scene-compare.css";

import { createRoot } from "react-dom/client";

import { App } from "./react-app";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root element.");
}

createRoot(appRoot).render(<App />);
