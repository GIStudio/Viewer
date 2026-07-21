import type { ViewerLeftSection, ViewerPanelText } from "./types";

export function createViewerLeftSections(t: ViewerPanelText): ViewerLeftSection[] {
  return [
    {
      id: "viewer-control-menu",
      title: t("Control Panels", "控制面板"),
      subtitle: t("Choose one workspace", "选择一个工作区"),
      content: `
        <nav class="viewer-control-menu" aria-label="${t("Control panels", "控制面板")}">
          <div class="viewer-control-menu-group">
            <span class="viewer-control-menu-label">${t("Scene", "场景")}</span>
            <button class="viewer-control-menu-item" type="button" id="viewer-scene-graph-link">
              <span class="viewer-control-menu-code">AN</span>
              <span><strong>${t("Annotation", "标注")}</strong><small>${t("Reference geometry workspace", "参考几何工作区")}</small></span>
            </button>
            <button class="viewer-control-menu-item" type="button" id="viewer-asset-editor-link">
              <span class="viewer-control-menu-code">AS</span>
              <span><strong>${t("Asset Library", "资产库")}</strong><small>${t("Inspect and prepare 3D assets", "检查与准备 3D 资产")}</small></span>
            </button>
          </div>
          <div class="viewer-control-menu-group">
            <span class="viewer-control-menu-label">${t("Create", "生成")}</span>
            <button class="viewer-control-menu-item" type="button" id="viewer-design-toggle">
              <span class="viewer-control-menu-code">GN</span>
              <span><strong>${t("Generation", "场景生成")}</strong><small>${t("Configure and run generation", "配置并运行场景生成")}</small></span>
            </button>
          </div>
          <div class="viewer-control-menu-group">
            <span class="viewer-control-menu-label">${t("Adjust", "调整")}</span>
            <button class="viewer-control-menu-item" type="button" id="viewer-edit-toggle">
              <span class="viewer-control-menu-code">ED</span>
              <span><strong>${t("Edit", "编辑")}</strong><small>${t("Objects, transforms, and layers", "对象、变换与图层")}</small></span>
            </button>
          </div>
          <div class="viewer-control-menu-group">
            <span class="viewer-control-menu-label">${t("System", "系统")}</span>
            <button class="viewer-control-menu-item" type="button" id="viewer-settings-toggle">
              <span class="viewer-control-menu-code">ST</span>
              <span><strong>${t("Settings", "设置")}</strong><small>${t("Rendering and runtime options", "渲染与运行选项")}</small></span>
            </button>
            <button class="viewer-control-menu-item" type="button" id="viewer-help-toggle">
              <span class="viewer-control-menu-code">?</span>
              <span><strong>${t("Help", "帮助")}</strong><small>${t("Commands and interface guidance", "命令与界面说明")}</small></span>
            </button>
          </div>
        </nav>
      `,
    },
  ];
}
