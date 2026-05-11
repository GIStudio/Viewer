import { Button, Layout, Menu, Select, Tabs, type MenuProps } from "antd";
import { useEffect, useMemo, useState, type RefObject } from "react";

import {
  SHELL_ACTIONS_CHANGE_EVENT,
  type ShellActionsChangeDetail,
  type ShellMenuActionId,
} from "../shell-events";
import { navigateTo, ROUTES, type AppRoute } from "../ui";
import {
  VIEWER_LANGUAGE_EVENT,
  loadViewerLanguage,
  setViewerLanguage,
  type ViewerLanguage,
} from "../viewer-i18n";
import { ShellMenus } from "./ShellMenus";
import { ShortcutModal } from "./ShortcutModal";
import { languageOptions } from "./shellModel";

type ViewerDesktopShellProps = {
  route: AppRoute;
  hostRef: RefObject<HTMLDivElement>;
};

export function ViewerDesktopShell({ route, hostRef }: ViewerDesktopShellProps) {
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
