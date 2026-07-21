export const SHELL_ACTION_EVENT = "roadgen3d:shell-action";
export const SHELL_TOGGLE_EVENT = "roadgen3d:shell-toggle";
export const SHELL_ACTIONS_CHANGE_EVENT = "roadgen3d:shell-actions-change";

export type ShellMenuActionId =
  | "file-load-layout"
  | "file-export-png"
  | "file-export-svg"
  | "file-export-json"
  | "file-save-context"
  | "view-reset-view"
  | "tools-open-settings"
  | "tools-open-scenes"
  | "tools-open-design"
  | "tools-open-evaluate"
  | "tools-open-compare"
  | "tools-open-presets"
  | "help-shortcuts";

export type ShellToggleTarget = "left" | "right" | "bottom";

export type ShellActionsChangeDetail = {
  enabledActions: ShellMenuActionId[];
};
