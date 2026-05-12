import type { AppRoute } from "./ui";
import type { ShellMenuActionId } from "./shell-events";

export interface ShellSection {
  id: string;
  title: string;
  content: string | HTMLElement;
  subtitle?: string;
  open?: boolean;
}

export interface ShellTab {
  id: string;
  label: string;
  content: string | HTMLElement;
}

export type ShellI18nText = string | {
  key: string;
  fallback?: string;
};

export interface DesktopShell {
  root: HTMLElement;
  route: AppRoute;
  leftRail: HTMLElement;
  centerStage: HTMLElement;
  rightRail: HTMLElement;
  rightTabButtons: HTMLElement;
  rightTabPanels: HTMLElement;
  statusSummary: HTMLElement;
  statusStatusHost: HTMLElement;
  statusActivityHost: HTMLElement;
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
