import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderDesignPanelHtml } from "./designPanel";
import type { ViewerPanelText, ViewerRightTab } from "./types";
import { EvaluatePanelShell } from "./utilityPanels";

function reactContent(component: ComponentType): string {
  return `<div class="desktop-shell-react-content">${renderToStaticMarkup(createElement(component))}</div>`;
}

export function renderEvaluatePanelContent(): string {
  return reactContent(EvaluatePanelShell);
}

export function createViewerRightTabs(t: ViewerPanelText): ViewerRightTab[] {
  void t;
  return [];
}

export { renderDesignPanelHtml };
