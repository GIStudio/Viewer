import type { AppRoute } from "./ui";
import type { ShellMenuActionId } from "./shell-events";

export type ShellI18nText = string | {
  key: string;
  fallback?: string;
};

export interface ShellSection {
  id: string;
  title: ShellI18nText;
  content: string | HTMLElement;
  subtitle?: ShellI18nText;
  open?: boolean;
}

export interface ShellTab {
  id: string;
  label: string;
  content: string | HTMLElement;
}

export type WorkbenchShellMode =
  | "single_left_overlay"
  | "course_single_left"
  | "legacy_dual";

export type WorkbenchSidebarGroup = "flow" | "navigation" | "workspace" | "analysis" | "inspection" | "system";

export type WorkbenchSidebarFlow = {
  stage: "01" | "02" | "03" | "04" | "05";
  branch?: "annotation" | "assets";
  status?: "pending" | "ready" | "active" | "warning" | "accepted";
};

export type WorkbenchSidebarPage = {
  id: string;
  label: string;
  icon?: string;
  group: WorkbenchSidebarGroup;
  content: HTMLElement | string;
  disabled?: boolean;
  badge?: string;
  flow?: WorkbenchSidebarFlow;
  /** Marks a durable navigation location without opening a drawer. */
  current?: boolean;
  /** Action-only pages reuse an existing controller instead of duplicating its panel DOM. */
  action?: () => void;
};

export interface WorkbenchSidebarController {
  registerPages: (pages: WorkbenchSidebarPage[]) => () => void;
  activate: (pageId: string) => void;
  toggle: (pageId: string) => void;
  close: () => void;
  activePage: () => string | null;
}


export interface DesktopShell {
  root: HTMLElement;
  route: AppRoute;
  mode: WorkbenchShellMode;
  sidebar: WorkbenchSidebarController;
  leftRail: HTMLElement;
  centerStage: HTMLElement;
  rightRail: HTMLElement;
  rightTabButtons: HTMLElement;
  rightTabPanels: HTMLElement;
  statusSummary: HTMLElement;
  statusStatusHost: HTMLElement;
  statusActivityHost: HTMLElement;
  statusArtifactsHost: HTMLElement;
  statusHintsHost: HTMLElement;
  setLeftSections: (sections: ShellSection[]) => void;
  setRightTabs: (tabs: ShellTab[], activeId?: string | null) => void;
  activateRightTab: (id: string | null) => void;
  setRightPinned: (pinned: boolean) => void;
  setBottomOpen: (open: boolean) => void;
  setStatusSummary: (message: ShellI18nText) => void;
  pushActivity: (message: ShellI18nText, tone?: "neutral" | "success" | "warning" | "error") => void;
  setHints: (hints: ShellI18nText[]) => void;
  setMenuActions: (actions: Partial<Record<ShellMenuActionId, () => void>>) => void;
  destroy: () => void;
}
