import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderDesignPanelHtml } from "./designPanel";
import type { ViewerPanelText, ViewerRightTab } from "./types";
import {
  ComparePanelShell,
  EvaluatePanelShell,
  HistoryPanelShell,
} from "./utilityPanels";

function reactContent(component: ComponentType): string {
  return `<div class="desktop-shell-react-content">${renderToStaticMarkup(createElement(component))}</div>`;
}

export function renderEvaluatePanelContent(): string {
  return reactContent(EvaluatePanelShell);
}

export function createViewerRightTabs(t: ViewerPanelText): ViewerRightTab[] {
  return [
    { id: "compare", label: t("Compare", "对比"), content: reactContent(ComparePanelShell) },
    { id: "history", label: t("History", "历史"), content: reactContent(HistoryPanelShell) },
    {
      id: "floating-lane",
      label: t("Overlay", "叠加"),
      content: `
        <div id="viewer-floating-lane-panel-host" class="viewer-slide-panel-body">
          <div class="viewer-consistency-empty" data-i18n-key="viewer.overlay.empty">Use Floating Lane in Browse to inspect semantic overlays.</div>
        </div>
      `,
    },
  ];
}

export { renderDesignPanelHtml };
