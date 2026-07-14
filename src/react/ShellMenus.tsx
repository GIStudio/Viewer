import { MoreOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { Button, Dropdown, Tooltip, type MenuProps } from "antd";
import type { RefObject } from "react";

import {
  SHELL_ACTION_EVENT,
  SHELL_TOGGLE_EVENT,
  type ShellMenuActionId,
  type ShellToggleTarget,
} from "../shell-events";
import { translateViewerKey } from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";
import { menuGroups } from "./shellModel";

type ShellMenusProps = {
  language: ViewerLanguage;
  enabledActions: Set<ShellMenuActionId>;
  hostRef: RefObject<HTMLDivElement>;
  onOpenShortcuts: () => void;
};

export function ShellMenus({ language, enabledActions, hostRef, onOpenShortcuts }: ShellMenusProps) {
  function dispatchShellAction(actionId: ShellMenuActionId): void {
    hostRef.current?.dispatchEvent(new CustomEvent(SHELL_ACTION_EVENT, {
      detail: { actionId },
    }));
  }

  function dispatchShellToggle(target: ShellToggleTarget): void {
    hostRef.current?.dispatchEvent(new CustomEvent(SHELL_TOGGLE_EVENT, {
      detail: { target },
    }));
  }

  return (
    <div className="desktop-shell-menu-groups">
      <Dropdown
        trigger={["click"]}
        menu={{
          items: menuGroups.map((group) => ({
            type: "group" as const,
            key: group.id,
            label: translateViewerKey(language, `menu.${group.id}`) ?? group.id,
            children: group.actions.map((action) => ({
              key: `${group.id}:${action.id ?? `toggle-${action.toggle}`}`,
              icon: action.icon,
              disabled: action.id ? !enabledActions.has(action.id) : false,
              label: translateViewerKey(language, action.labelKey) ?? action.fallback,
            })),
          })) satisfies MenuProps["items"],
          onClick: ({ key }) => {
            const [groupId, actionKey] = key.split(":");
            const group = menuGroups.find((item) => item.id === groupId);
            const action = group?.actions.find((item) => (item.id ?? `toggle-${item.toggle}`) === actionKey);
            if (action?.link) {
              window.location.assign(action.link);
            } else if (action?.id) {
              dispatchShellAction(action.id);
            } else if (action?.toggle) {
              dispatchShellToggle(action.toggle);
            }
          },
        }}
      >
        <Button
          className="desktop-shell-menu-toggle desktop-shell-workbench-menu"
          type="default"
          icon={<MoreOutlined />}
          aria-label={translateViewerKey(language, "menu.workbench") ?? "Workbench menu"}
        >
          {translateViewerKey(language, "menu.workbench") ?? "Workbench"}
        </Button>
      </Dropdown>
      <Tooltip title={translateViewerKey(language, "shell.shortcuts.tooltip") ?? "Shortcut modal"}>
        <Button
          className="desktop-shell-help-button"
          type="default"
          icon={<QuestionCircleOutlined />}
          aria-label={translateViewerKey(language, "shell.shortcuts.open") ?? "Open shortcut modal"}
          onClick={onOpenShortcuts}
        />
      </Tooltip>
    </div>
  );
}
