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
    {
      id: "viewer-scene-layers",
      title: t("Scene Layers", "场景图层"),
      subtitle: t("Toggle object categories", "开关对象类别"),
      open: false,
      content: `
        <div class="desktop-shell-form-stack">
          <div class="viewer-layer-stack" role="group" aria-label="Scene layers">
            <button class="viewer-layer-item is-active" type="button" data-layer="road" aria-pressed="true">
              <strong>${t("Road Skeleton", "道路骨架")}</strong>
              <span>roads / edges / junctions</span>
            </button>
            <button class="viewer-layer-item" type="button" data-layer="surface" aria-pressed="false">
              <strong>${t("Design Surfaces", "设计面")}</strong>
              <span>sidewalk / furnishing / crossing</span>
            </button>
            <button class="viewer-layer-item" type="button" data-layer="assets" aria-pressed="false">
              <strong>${t("Street Furniture", "街道家具")}</strong>
              <span>tree / lamp / bench / bus_stop</span>
            </button>
            <button class="viewer-layer-item" type="button" data-layer="annotation" aria-pressed="false">
              <strong>${t("Annotation & Patches", "标注与修补")}</strong>
              <span>annotation / patch / control_point</span>
            </button>
          </div>
        </div>
      `,
    },
    {
      id: "viewer-tools",
      title: t("Tools", "辅助入口"),
      subtitle: t("Quick access to editors and helpers", "快速打开编辑器与辅助工具"),
      open: false,
      content: `
        <div class="desktop-shell-form-stack">
          <div class="desktop-shell-chip-list">
            <button class="desktop-shell-chip" type="button" id="viewer-scene-graph-link">${t("Annotation", "标注")}</button>
            <button class="desktop-shell-chip" type="button" id="viewer-asset-editor-link">${t("Asset Editor", "资产编辑器")}</button>
            <button class="desktop-shell-chip" type="button" id="viewer-settings-toggle">${t("Settings", "设置")}</button>
            <button class="desktop-shell-chip" type="button" id="viewer-presets-toggle">${t("Presets", "预设")}</button>
            <button class="desktop-shell-chip" type="button" id="viewer-floating-lane-toggle">${t("Floating Lane", "浮动车道")}</button>
            <button class="desktop-shell-chip" type="button" id="viewer-help-toggle">${t("Help", "帮助")}</button>
          </div>
        </div>
      `,
    },
  ];
}
