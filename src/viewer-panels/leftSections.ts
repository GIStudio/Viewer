import type { ViewerLeftSection, ViewerPanelText } from "./types";

export function createViewerLeftSections(t: ViewerPanelText): ViewerLeftSection[] {
  return [
    {
      id: "viewer-recent-layouts",
      title: t("Recent Layouts", "最近布局"),
      subtitle: t("Layout / scene entry", "布局 / 场景入口"),
      content: `
        <div class="desktop-shell-form-stack">
          <label class="desktop-shell-field">
            <span data-i18n-key="viewer.left.recentResult">Recent Result</span>
            <select id="layout-select" class="viewer-select viewer-select-inline" title="Recent Result" data-i18n-title-key="viewer.left.recentResult"></select>
          </label>
          <label class="desktop-shell-field">
            <span data-i18n-key="viewer.left.scene">Scene</span>
            <select id="scene-select" class="viewer-select viewer-select-inline" title="Scene" data-i18n-title-key="viewer.left.scene"></select>
          </label>
          <div id="viewer-scheme-compare" class="viewer-scheme-compare"></div>
        </div>
      `,
    },
  ];
}
