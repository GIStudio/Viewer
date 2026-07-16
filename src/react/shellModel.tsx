import {
  DownloadOutlined,
  EyeOutlined,
  FileSearchOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  SaveOutlined,
  SlidersOutlined,
  ToolOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { theme } from "antd";
import type { ReactNode } from "react";

import type { ShellMenuActionId, ShellToggleTarget } from "../shell-events";
import type { AppRoute } from "../ui";

export type MenuGroupId = "file" | "view" | "tools" | "help";

export type ShellMenuAction = {
  id?: ShellMenuActionId;
  toggle?: ShellToggleTarget;
  link?: string;
  labelKey: string;
  fallback: string;
  icon?: ReactNode;
};

export type ShellMenuGroup = {
  id: MenuGroupId;
  icon: ReactNode;
  actions: ShellMenuAction[];
};

export const antdTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: "#174b64",
    colorInfo: "#174b64",
    colorWarning: "#f4c430",
    colorText: "#102d3a",
    colorTextSecondary: "#65757b",
    colorBorder: "#c8c3b5",
    colorBgContainer: "#fffef9",
    borderRadius: 4,
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Button: {
      borderRadius: 4,
      defaultShadow: "none",
      primaryShadow: "2px 2px 0 #102d3a",
    },
    Menu: {
      itemBorderRadius: 2,
      horizontalItemHoverColor: "#174b64",
      horizontalItemSelectedColor: "#174b64",
    },
    Select: {
      borderRadius: 4,
      optionSelectedBg: "#f6e7a8",
    },
    Tabs: {
      itemSelectedColor: "#174b64",
      inkBarColor: "#df654f",
    },
  },
};

export const menuGroups: ShellMenuGroup[] = [
  {
    id: "file",
    icon: <FileSearchOutlined />,
    actions: [
      { id: "file-load-layout", labelKey: "menu.file.loadLayout", fallback: "Load Layout", icon: <UploadOutlined /> },
      { id: "file-export-png", labelKey: "menu.file.exportPng", fallback: "Export PNG", icon: <DownloadOutlined /> },
      { id: "file-export-svg", labelKey: "menu.file.exportSvg", fallback: "Export SVG", icon: <DownloadOutlined /> },
      { id: "file-export-json", labelKey: "menu.file.exportJson", fallback: "Export JSON", icon: <DownloadOutlined /> },
      { id: "file-save-context", labelKey: "menu.file.saveContext", fallback: "Save Context", icon: <SaveOutlined /> },
    ],
  },
  {
    id: "view",
    icon: <EyeOutlined />,
    actions: [
      { id: "view-reset-view", labelKey: "menu.view.resetView", fallback: "Reset View", icon: <EyeOutlined /> },
      { toggle: "left", labelKey: "menu.view.toggleLeft", fallback: "Toggle Left Sidebar" },
      { toggle: "right", labelKey: "menu.view.toggleRight", fallback: "Toggle Right Sidebar" },
      { toggle: "bottom", labelKey: "menu.view.toggleBottom", fallback: "Toggle Status Workbench" },
    ],
  },
  {
    id: "tools",
    icon: <ToolOutlined />,
    actions: [
      { id: "tools-open-settings", labelKey: "menu.tools.settings", fallback: "Settings", icon: <SlidersOutlined /> },
      { id: "tools-open-design", labelKey: "menu.tools.design", fallback: "Design" },
      { id: "tools-open-evaluate", labelKey: "menu.tools.evaluate", fallback: "Evaluate" },
      { id: "tools-open-compare", labelKey: "menu.tools.compare", fallback: "Compare" },
      { id: "tools-open-history", labelKey: "menu.tools.history", fallback: "History" },
      { id: "tools-open-presets", labelKey: "menu.tools.presets", fallback: "Presets" },
      { id: "tools-open-floating-lane", labelKey: "menu.tools.floatingLane", fallback: "Floating Lane" },
      { link: "/new-ui/index.html", labelKey: "menu.tools.newUi", fallback: "New UI Prototype", icon: <RocketOutlined /> },
    ],
  },
  {
    id: "help",
    icon: <QuestionCircleOutlined />,
    actions: [
      { id: "help-shortcuts", labelKey: "menu.help.shortcuts", fallback: "Shortcuts", icon: <QuestionCircleOutlined /> },
    ],
  },
];

export function resolveRoute(): AppRoute {
  const hash = window.location.hash;
  if (hash === "#course-studio") return "course-studio";
  if (hash === "#viewer") return "viewer";
  if (hash === "#scene-graph") return "scene-graph";
  if (hash === "#asset-editor") return "asset-editor";
  if (hash === "#model-input-browser") return "model-input-browser";
  const defaultRoute = import.meta.env.VITE_ROADGEN_DEFAULT_ROUTE;
  if (!hash && defaultRoute === "course-studio") return "course-studio";
  return "viewer";
}
