import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  App as AntdApp,
  Button,
  ConfigProvider,
  Dropdown,
  Layout,
  Menu,
  Modal,
  Select,
  Tabs,
  theme,
  Tooltip,
  type MenuProps,
} from "antd";
import {
  DownloadOutlined,
  EyeOutlined,
  FileSearchOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  SlidersOutlined,
  ToolOutlined,
  UploadOutlined,
} from "@ant-design/icons";

import {
  bindDesktopShell,
  SHELL_ACTION_EVENT,
  SHELL_ACTIONS_CHANGE_EVENT,
  SHELL_TOGGLE_EVENT,
} from "./desktop-shell";
import type {
  ShellActionsChangeDetail,
  ShellMenuActionId,
  ShellToggleTarget,
} from "./desktop-shell";
import { navigateTo, ROUTES, type AppRoute } from "./ui";
import {
  VIEWER_LANGUAGE_EVENT,
  loadViewerLanguage,
  setViewerLanguage,
  type ViewerLanguage,
} from "./viewer-i18n";

type Teardown = () => void;
type MenuGroupId = "file" | "view" | "tools" | "help";

const antdTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: "#00539f",
    colorInfo: "#00539f",
    colorWarning: "#ffd100",
    borderRadius: 8,
    fontFamily: '"SF Pro Text", "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Button: {
      borderRadius: 8,
    },
    Menu: {
      itemBorderRadius: 8,
      horizontalItemHoverColor: "#00539f",
      horizontalItemSelectedColor: "#00539f",
    },
  },
};

const languageOptions: Array<{ value: ViewerLanguage; label: string }> = [
  { value: "en", label: "EN" },
  { value: "zh", label: "中文" },
  { value: "mixed", label: "中英" },
];

const menuGroups: Array<{
  id: MenuGroupId;
  icon: ReactNode;
  actions: Array<{
    id?: ShellMenuActionId;
    toggle?: "left" | "right" | "bottom";
    labelKey: string;
    fallback: string;
    icon?: ReactNode;
  }>;
}> = [
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

function resolveRoute(): AppRoute {
  const hash = window.location.hash;
  if (hash === "#scene-graph") return "scene-graph";
  if (hash === "#asset-editor") return "asset-editor";
  if (hash === "#junction-editor") return "junction-editor";
  return "viewer";
}

function ShortcutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal title="Viewer shortcuts" open={open} onCancel={onClose} footer={null}>
      <div className="roadgen-shortcut-modal">
        <div>Click scene to capture mouse</div>
        <div>WASD to move, Shift to sprint, Esc to unlock</div>
        <div>Use Tools or the right inspector tabs for design, evaluation, comparison, history, and presets</div>
      </div>
    </Modal>
  );
}

function ShellMenus({
  enabledActions,
  hostRef,
  onOpenShortcuts,
}: {
  enabledActions: Set<ShellMenuActionId>;
  hostRef: RefObject<HTMLDivElement>;
  onOpenShortcuts: () => void;
}) {
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

function ViewerDesktopShell({
  route,
  hostRef,
}: {
  route: AppRoute;
  hostRef: RefObject<HTMLDivElement>;
}) {
  const routeConfig = ROUTES[route];
  const [language, setLanguage] = useState<ViewerLanguage>(() => loadViewerLanguage());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [enabledActions, setEnabledActions] = useState<Set<ShellMenuActionId>>(() => new Set());

  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const nextLanguage = (event as CustomEvent<{ language?: ViewerLanguage }>).detail?.language;
      if (nextLanguage) {
        setLanguage(nextLanguage);
      }
    };
    window.addEventListener(VIEWER_LANGUAGE_EVENT, handleLanguageChange);
    return () => window.removeEventListener(VIEWER_LANGUAGE_EVENT, handleLanguageChange);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const handleActionsChange = (event: Event) => {
      const detail = (event as CustomEvent<ShellActionsChangeDetail>).detail;
      setEnabledActions(new Set(detail?.enabledActions ?? []));
    };
    host.addEventListener(SHELL_ACTIONS_CHANGE_EVENT, handleActionsChange);
    return () => host.removeEventListener(SHELL_ACTIONS_CHANGE_EVENT, handleActionsChange);
  }, [hostRef, route]);

  const routeItems = useMemo<MenuProps["items"]>(
    () =>
      (Object.entries(ROUTES) as Array<[AppRoute, (typeof ROUTES)[AppRoute]]>).map(([id, config]) => ({
        key: id,
        label: <span data-i18n-key={`route.${id}.label`}>{config.label}</span>,
      })),
    [],
  );

  return (
    <div ref={hostRef} className="roadgen-react-shell-host">
      <Layout
        className="desktop-shell desktop-shell-left-auto-collapse desktop-shell-right-auto-collapse roadgen-ant-shell"
        data-route={route}
      >
        <Layout.Header className="desktop-shell-menu roadgen-ant-header">
          <div className="desktop-shell-brand">
            <div className="desktop-shell-kicker" data-i18n-key={`shell.${route}.kicker`}>
              {routeConfig.kicker}
            </div>
            <div className="desktop-shell-title-wrap">
              <h1 className="desktop-shell-title" data-i18n-key={`shell.${route}.title`}>
                {routeConfig.title}
              </h1>
              {routeConfig.subtitle ? (
                <p className="desktop-shell-subtitle" data-i18n-key={`shell.${route}.subtitle`}>
                  {routeConfig.subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <Menu
            className="desktop-shell-route-switch roadgen-ant-route-menu"
            mode="horizontal"
            selectedKeys={[route]}
            items={routeItems}
            onClick={({ key }) => navigateTo(key as AppRoute)}
          />
          <Select
            className="desktop-shell-language-select"
            aria-label="Language"
            value={language}
            options={languageOptions}
            onChange={(nextLanguage) => setViewerLanguage(nextLanguage)}
          />
          <ShellMenus
            enabledActions={enabledActions}
            hostRef={hostRef}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />
        </Layout.Header>

        <div className="desktop-shell-main">
          <aside className="desktop-shell-rail desktop-shell-rail-left" data-shell-region="left">
            <div className="desktop-shell-rail-header">
              <div>
                <div className="desktop-shell-rail-kicker" data-i18n-key="shell.navigation">
                  Navigation
                </div>
                <div className="desktop-shell-rail-title" data-i18n-key="shell.leftSidebar">
                  Left Sidebar
                </div>
              </div>
              <Button className="desktop-shell-rail-pin" type="default" data-shell-left-pin aria-pressed="false">
                Pin
              </Button>
            </div>
            <div id="desktop-shell-left-rail" className="desktop-shell-rail-body" />
          </aside>

          <section className="desktop-shell-center">
            <div id="desktop-shell-center-stage" className="desktop-shell-center-stage" />
          </section>

          <aside className="desktop-shell-rail desktop-shell-rail-right" data-shell-region="right">
            <div className="desktop-shell-rail-header">
              <div>
                <div className="desktop-shell-rail-kicker" data-i18n-key="shell.inspector">
                  Inspector
                </div>
                <div className="desktop-shell-rail-title" data-i18n-key="shell.rightSidebar">
                  Right Sidebar
                </div>
              </div>
              <Button className="desktop-shell-rail-pin" type="default" data-shell-right-pin aria-pressed="false">
                Pin
              </Button>
            </div>
            <div className="desktop-shell-tab-list" id="desktop-shell-right-tabs" />
            <div id="desktop-shell-right-panels" className="desktop-shell-right-panels" />
          </aside>
        </div>

        <section className="desktop-shell-status" data-open="false">
          <Button
            className="desktop-shell-status-summary"
            type="text"
            id="desktop-shell-status-summary-toggle"
            aria-expanded="false"
          >
            <span className="desktop-shell-status-summary-label" data-i18n-key="shell.statusWorkbench">
              Status Workbench
            </span>
            <span id="desktop-shell-status-summary-text" data-i18n-key="shell.status.ready">
              Ready.
            </span>
          </Button>
          <div className="desktop-shell-status-body roadgen-ant-status-body">
            <div className="desktop-shell-status-tab-bridge" aria-hidden="true">
              <button className="desktop-shell-status-tab active" type="button" data-shell-status-tab="status">
                Status
              </button>
              <button className="desktop-shell-status-tab" type="button" data-shell-status-tab="activity">
                Activity
              </button>
              <button className="desktop-shell-status-tab" type="button" data-shell-status-tab="hints">
                Hints
              </button>
            </div>
            <Tabs
              size="small"
              destroyOnHidden={false}
              items={[
                {
                  key: "status",
                  label: <span data-i18n-key="shell.status">Status</span>,
                  forceRender: true,
                  children: <div id="desktop-shell-status-host" className="desktop-shell-status-stack" />,
                },
                {
                  key: "activity",
                  label: <span data-i18n-key="shell.activity">Activity</span>,
                  forceRender: true,
                  children: <div id="desktop-shell-activity-host" className="desktop-shell-status-stack" />,
                },
                {
                  key: "hints",
                  label: <span data-i18n-key="shell.hints">Hints</span>,
                  forceRender: true,
                  children: <div id="desktop-shell-hints-host" className="desktop-shell-status-stack" />,
                },
              ]}
            />
          </div>
        </section>
      </Layout>
      <ShortcutModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

function ViewerRouteIsland({ route }: { route: AppRoute }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let cancelled = false;
    let routeTeardown: Teardown | undefined;
    const shell = bindDesktopShell(host, route);

    async function mountRoute() {
      switch (route) {
        case "scene-graph":
          routeTeardown = (await import("./scene-graph")).mountSceneGraphPage(shell);
          break;
        case "asset-editor":
          routeTeardown = (await import("./asset-editor")).mountAssetEditor(shell);
          break;
        case "junction-editor":
          routeTeardown = (await import("./junction-editor")).mountJunctionEditor(shell);
          break;
        default:
          routeTeardown = await (await import("./app")).mountViewer(shell);
          break;
      }

      if (cancelled && routeTeardown) {
        routeTeardown();
      }
    }

    void mountRoute();

    return () => {
      cancelled = true;
      routeTeardown?.();
      shell.destroy();
    };
  }, [route]);

  return <ViewerDesktopShell route={route} hostRef={hostRef} />;
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => resolveRoute());

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <ViewerRouteIsland key={route} route={route} />
      </AntdApp>
    </ConfigProvider>
  );
}
