import { createElement, type ComponentType } from "react";

import {
  createShellReactContent,
  type RegisterShellReactCleanup,
} from "../react/ShellReactHost";
import { renderDesignPanelHtml } from "./designPanel";
import type { ViewerPanelText, ViewerRightTab } from "./types";
import {
  ComparePanelShell,
  EvaluatePanelShell,
  HistoryPanelShell,
} from "./utilityPanels";

function reactContent(component: ComponentType, registerCleanup: RegisterShellReactCleanup): HTMLElement {
  return createShellReactContent(createElement(component), registerCleanup);
}

export function createViewerRightTabs(
  t: ViewerPanelText,
  registerCleanup: RegisterShellReactCleanup = () => undefined,
): ViewerRightTab[] {
  return [
    { id: "evaluate", label: t("Evaluate", "评估"), content: reactContent(EvaluatePanelShell, registerCleanup) },
    { id: "compare", label: t("Compare", "对比"), content: reactContent(ComparePanelShell, registerCleanup) },
    { id: "history", label: t("History", "历史"), content: reactContent(HistoryPanelShell, registerCleanup) },
    {
      id: "floating-lane",
      label: t("Overlay", "叠加"),
      content: `
        <div id="viewer-floating-lane-panel-host" class="viewer-slide-panel-body">
          <div class="viewer-consistency-empty">Use Floating Lane in Browse to inspect semantic overlays.</div>
        </div>
      `,
    },
    {
      id: "consistency",
      label: t("Consistency", "一致性"),
      content: `
        <aside id="viewer-consistency-panel" class="viewer-slide-panel" data-open="false">
          <div class="viewer-slide-panel-header">
            <div>
              <div class="viewer-slide-panel-title" data-i18n-key="viewer.consistency.title">Layout Consistency</div>
              <div class="viewer-slide-panel-subtitle" data-i18n-key="viewer.consistency.subtitle">Conversion and topology checks against the source graph.</div>
            </div>
            <button id="viewer-consistency-close" class="viewer-settings-close" type="button" aria-label="Close consistency">x</button>
          </div>
          <div id="viewer-consistency-content" class="viewer-slide-panel-body">
            <div class="viewer-consistency-empty">Load a layout to see consistency metrics.</div>
          </div>
        </aside>
      `,
    },
  ];
}

export { renderDesignPanelHtml };
