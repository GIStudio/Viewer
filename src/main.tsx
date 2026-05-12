import "antd/dist/reset.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/shared.css";
import "./react-shell.css";
import "./style.css";

import { createRoot } from "react-dom/client";

import { App } from "./react-app";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root element.");
}

createRoot(appRoot).render(<App />);
