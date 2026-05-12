import { createElement, type ComponentType } from "react";

import {
  createShellReactContent,
  type RegisterShellReactCleanup,
} from "../react/ShellReactHost";
import { renderViewerSettingsPanelHtml } from "../viewer-settings-panel";
import { renderDesignPanelHtml } from "./designPanel";
import type { ViewerPanelText, ViewerRightTab } from "./types";
import {
  ComparePanelShell,
  EvaluatePanelShell,
  FloatingLanePanelShell,
  HelpPanelShell,
  HistoryPanelShell,
  PresetsPanelShell,
} from "./utilityPanels";

function reactContent(component: ComponentType, registerCleanup: RegisterShellReactCleanup): HTMLElement {
  return createShellReactContent(createElement(component), registerCleanup);
}

export function createViewerRightTabs(
  t: ViewerPanelText,
  registerCleanup: RegisterShellReactCleanup = () => undefined,
): ViewerRightTab[] {
  return [
    { id: "settings", label: t("Settings", "设置"), content: renderViewerSettingsPanelHtml() },
    { id: "design", label: t("Design", "设计"), content: renderDesignPanelHtml() },
    { id: "evaluate", label: t("Evaluate", "评估"), content: reactContent(EvaluatePanelShell, registerCleanup) },
    { id: "compare", label: t("Compare", "对比"), content: reactContent(ComparePanelShell, registerCleanup) },
    { id: "history", label: t("History", "历史"), content: reactContent(HistoryPanelShell, registerCleanup) },
    { id: "presets", label: t("Presets", "预设"), content: reactContent(PresetsPanelShell, registerCleanup) },
    { id: "floating-lane", label: t("Floating Lane", "浮动车道"), content: reactContent(FloatingLanePanelShell, registerCleanup) },
    { id: "help", label: t("Help", "帮助"), content: reactContent(HelpPanelShell, registerCleanup) },
  ];
}
