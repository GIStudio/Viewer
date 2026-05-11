import { QuestionCircleOutlined } from "@ant-design/icons";
import { Button, Dropdown, Tooltip, type MenuProps } from "antd";
import type { RefObject } from "react";

import {
  SHELL_ACTION_EVENT,
  SHELL_TOGGLE_EVENT,
  type ShellMenuActionId,
  type ShellToggleTarget,
} from "../shell-events";
import { menuGroups } from "./shellModel";

type ShellMenusProps = {
  enabledActions: Set<ShellMenuActionId>;
  hostRef: RefObject<HTMLDivElement>;
  onOpenShortcuts: () => void;
};

export function ShellMenus({ enabledActions, hostRef, onOpenShortcuts }: ShellMenusProps) {
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
      {menuGroups.map((group) => {
        const items: MenuProps["items"] = group.actions.map((action) => ({
          key: action.id ?? `toggle-${action.toggle}`,
          icon: action.icon,
          disabled: action.id ? !enabledActions.has(action.id) : false,
          label: (
            <span
              data-shell-action={action.id}
              data-shell-toggle={action.toggle}
              data-i18n-key={action.labelKey}
            >
              {action.fallback}
            </span>
          ),
        }));
        return (
          <div className="desktop-shell-menu-group" key={group.id}>
            <Dropdown
              trigger={["click"]}
              menu={{
                items,
                onClick: ({ key }) => {
                  const action = group.actions.find((item) => (item.id ?? `toggle-${item.toggle}`) === key);
                  if (action?.id) {
                    dispatchShellAction(action.id);
                  } else if (action?.toggle) {
                    dispatchShellToggle(action.toggle);
                  }
                },
              }}
            >
              <Button
                className="desktop-shell-menu-toggle"
                type="default"
                icon={group.icon}
                data-shell-menu-toggle={group.id}
              >
                <span data-i18n-key={`menu.${group.id}`}>{group.id[0].toUpperCase() + group.id.slice(1)}</span>
              </Button>
            </Dropdown>
          </div>
        );
      })}
      <Tooltip title="Shortcut modal">
        <Button
          className="desktop-shell-help-button"
          type="default"
          icon={<QuestionCircleOutlined />}
          aria-label="Open shortcut modal"
          onClick={onOpenShortcuts}
        />
      </Tooltip>
    </div>
  );
}
