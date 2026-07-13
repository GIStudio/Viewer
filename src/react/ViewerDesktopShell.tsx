import { Button, Layout, Menu, Select, Tabs, type MenuProps } from "antd";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";

import { SHELL_ACTIONS_CHANGE_EVENT } from "../shell-events";
import type { ShellActionsChangeDetail, ShellMenuActionId } from "../shell-events";
import { navigateTo, ROUTES } from "../ui";
import type { AppRoute } from "../ui";
import {
  formatViewerKey,
  setViewerLanguage,
  translateViewerKey,
} from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";
import { WORKFLOW_STEPS, WORKFLOW_UNDO_EVENT, workflowRoute } from "../workflow-controller";
import type { WorkflowController, WorkflowStep } from "../workflow-controller";
import { ShellMenus } from "./ShellMenus";
import { ShortcutModal } from "./ShortcutModal";
import { languageOptions } from "./shellModel";

type ViewerDesktopShellProps = {
  route: AppRoute;
  language: ViewerLanguage;
  hostRef: RefObject<HTMLDivElement>;
  workflow: WorkflowController;
  embedded?: boolean;
};

export function ViewerDesktopShell({ route, language, hostRef, workflow, embedded = false }: ViewerDesktopShellProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [enabledActions, setEnabledActions] = useState<Set<ShellMenuActionId>>(() => new Set());
  const workflowSnapshot = useSyncExternalStore(
    workflow.subscribe,
    workflow.getSnapshot,
    workflow.getSnapshot,
  );
  const t = (key: string, fallback: string): string => translateViewerKey(language, key) ?? fallback;
  const stepLabels: Record<WorkflowStep, string> = {
    source: t("workflow.step.source", "[missing workflow.step.source]"),
    review: t("workflow.step.review", "[missing workflow.step.review]"),
    generate: t("workflow.step.generate", "[missing workflow.step.generate]"),
    edit: t("workflow.step.edit", "[missing workflow.step.edit]"),
    evaluate: t("workflow.step.evaluate", "[missing workflow.step.evaluate]"),
  };
  const stepIndex = WORKFLOW_STEPS.indexOf(workflowSnapshot.step);
  const stepContext: Record<WorkflowStep, string> = {
    source: t("workflow.context.source", "[missing workflow.context.source]"),
    review: t("workflow.context.review", "[missing workflow.context.review]"),
    generate: t("workflow.context.generate", "[missing workflow.context.generate]"),
    edit: t("workflow.context.edit", "[missing workflow.context.edit]"),
    evaluate: t("workflow.context.evaluate", "[missing workflow.context.evaluate]"),
  };
  const canOpenStep: Record<WorkflowStep, boolean> = {
    source: true,
    review: Boolean(workflowSnapshot.normalized),
    generate: workflowSnapshot.approvedSourceRevision === workflowSnapshot.sourceRevision,
    edit: Boolean(workflowSnapshot.sceneLayoutPath),
    evaluate: Boolean(workflowSnapshot.sceneLayoutPath) && !workflowSnapshot.editPending,
  };
  const railKeys = route === "scene-graph"
    ? {
      leftKicker: "shell.scene-graph.left.kicker",
      leftTitle: "shell.scene-graph.left.title",
      rightKicker: "shell.scene-graph.right.kicker",
      rightTitle: "shell.scene-graph.right.title",
    }
    : route === "viewer"
      ? {
        leftKicker: "shell.controls.kicker",
        leftTitle: "shell.controls.title",
        rightKicker: "shell.live.kicker",
        rightTitle: "shell.live.title",
      }
      : route === "asset-editor"
        ? {
          leftKicker: "shell.asset-browser.kicker",
          leftTitle: "shell.asset-browser.title",
          rightKicker: "shell.asset-inspect.kicker",
          rightTitle: "shell.asset-inspect.title",
        }
        : {
          leftKicker: "shell.model-input-browser.left.kicker",
          leftTitle: "shell.model-input-browser.left.title",
          rightKicker: "shell.model-input-browser.right.kicker",
          rightTitle: "shell.model-input-browser.right.title",
        };



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
      (Object.keys(ROUTES) as AppRoute[]).map((id) => ({
        key: id,
        label: t(`route.${id}.label`, `[missing route.${id}.label]`),
      })),
    [language],
  );

  const openWorkflowStep = (step: WorkflowStep): void => {
    const result = workflow.transition(step);
    if (result.ok) navigateTo(workflowRoute(step));
  };

  return (
    <div ref={hostRef} className="roadgen-react-shell-host">
      <Layout
        className={`desktop-shell ${route === "viewer" ? "desktop-shell-left-pinned" : "desktop-shell-left-auto-collapse"} desktop-shell-right-auto-collapse roadgen-ant-shell`}
        data-route={route}
      >
        <Layout.Header className="desktop-shell-topbar roadgen-ant-header">
          {!embedded ? <>
          <div className="desktop-shell-brand">
            <div className="desktop-shell-traffic-lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="desktop-shell-title-wrap">
              <h1 className="desktop-shell-title">
                {t(`shell.${route}.title`, `[missing shell.${route}.title]`)}
              </h1>
              {route !== "viewer" ? (
                <p className="desktop-shell-subtitle">
                  {t(`shell.${route}.subtitle`, `[missing shell.${route}.subtitle]`)}
                </p>
              ) : null}
            </div>
            <Menu
              className="desktop-shell-route-switch roadgen-ant-route-menu"
              mode="horizontal"
              selectedKeys={[route]}
              items={routeItems}
              onClick={({ key }) => navigateTo(key as AppRoute)}
            />
          </div>
          <div className="desktop-shell-topbar-actions">
            <Select
              className="desktop-shell-language-select"
              aria-label={t("language.group", "Language")}
              value={language}
              options={languageOptions}
              onChange={(nextLanguage) => setViewerLanguage(nextLanguage)}
            />
            <ShellMenus
              language={language}
              enabledActions={enabledActions}
              hostRef={hostRef}
              onOpenShortcuts={() => setShortcutsOpen(true)}
            />
            <Button
              className="desktop-shell-topbar-button"
              type="default"
              data-shell-action="tools-open-history"
            >
              {t("topbar.history", "History")}
            </Button>
            <Button
              className="desktop-shell-topbar-button"
              type="default"
              data-shell-toggle="right"
            >
              {t("topbar.analyze", "Analyze")}
            </Button>
            <Button
              className="desktop-shell-topbar-button desktop-shell-topbar-button-primary"
              type="primary"
              data-shell-action="tools-open-design"
            >
              {t("topbar.generate", "Generate & Load")}
            </Button>
          </div>
          </> : null}
        </Layout.Header>
        <div className="workflow-shell-bar">
          <nav className="workflow-step-strip" aria-label={t("workflow.navigation", "[missing workflow.navigation]")}>
            {WORKFLOW_STEPS.map((step, index) => (
              <button
                key={step}
                type="button"
                className="workflow-step"
                data-active={workflowSnapshot.step === step}
                data-complete={index < stepIndex}
                aria-current={workflowSnapshot.step === step ? "step" : undefined}
                disabled={!canOpenStep[step]}
                onClick={() => openWorkflowStep(step)}
              >
                <span>{index + 1}</span>
                <strong>{stepLabels[step]}</strong>
              </button>
            ))}
          </nav>
          <div className="workflow-step-context" data-step={workflowSnapshot.step}>
            <strong>{stepLabels[workflowSnapshot.step]}</strong>
            <span>{stepContext[workflowSnapshot.step]}</span>
            {workflowSnapshot.normalized?.warnings.length ? (
              <em>{formatViewerKey(
                language,
                workflowSnapshot.normalized.warnings.length === 1
                  ? "workflow.sourceWarning.one"
                  : "workflow.sourceWarning.other",
                { count: workflowSnapshot.normalized.warnings.length },
              )}</em>
            ) : null}
            {workflowSnapshot.lastError ? <em data-tone="error">{workflowSnapshot.lastError}</em> : null}
            {workflowSnapshot.sceneRevision ? (
              <em>{formatViewerKey(language, "workflow.revision", { revision: workflowSnapshot.sceneRevision.revision })}</em>
            ) : null}
            {workflowSnapshot.step === "edit" ? (
              <Button
                className="workflow-context-action"
                size="small"
                disabled={!workflowSnapshot.undoCommand || workflowSnapshot.editPending}
                onClick={() => window.dispatchEvent(new CustomEvent(WORKFLOW_UNDO_EVENT))}
              >
                {t("workflow.undoPlacement", "[missing workflow.undoPlacement]")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="desktop-shell-main">
          <aside className="desktop-shell-rail desktop-shell-rail-left" data-shell-region="left" aria-label={t(railKeys.leftTitle, `[missing ${railKeys.leftTitle}]`)}>
            <div className="desktop-shell-rail-header">
              <div>
                <div className="desktop-shell-rail-kicker">
                  {t(railKeys.leftKicker, `[missing ${railKeys.leftKicker}]`)}
                </div>
                <div className="desktop-shell-rail-title">
                  {t(railKeys.leftTitle, `[missing ${railKeys.leftTitle}]`)}
                </div>
              </div>
              <Button className="desktop-shell-rail-pin" type="default" data-shell-left-pin aria-pressed={route === "viewer"}>
                {route === "viewer" ? t("shell.pinned", "Pinned") : t("shell.pin", "Pin")}
              </Button>
            </div>
            <div id="desktop-shell-left-rail" className="desktop-shell-rail-body" />
          </aside>

          <section className="desktop-shell-center" aria-label={t("shell.stage", "Stage")}>
            <div id="desktop-shell-center-stage" className="desktop-shell-center-stage" />
          </section>

          <aside className="desktop-shell-rail desktop-shell-rail-right" data-shell-region="right" aria-label={t(railKeys.rightTitle, `[missing ${railKeys.rightTitle}]`)}>
            <div className="desktop-shell-rail-header">
              <div>
                <div className="desktop-shell-rail-kicker">
                  {t(railKeys.rightKicker, `[missing ${railKeys.rightKicker}]`)}
                </div>
                <div className="desktop-shell-rail-title">
                  {t(railKeys.rightTitle, `[missing ${railKeys.rightTitle}]`)}
                </div>
              </div>
              <Button className="desktop-shell-rail-pin" type="default" data-shell-right-pin aria-pressed="false">
                {t("shell.pin", "Pin")}
              </Button>
            </div>
            <div className="desktop-shell-tab-list" id="desktop-shell-right-tabs" />
            <div id="desktop-shell-right-panels" className="desktop-shell-right-panels" />
          </aside>
        </div>

        <section className="desktop-shell-status desktop-shell-task-tray" data-open="false" aria-label={t("shell.taskTray", "Task tray")}>
          <Button
            className="desktop-shell-status-summary"
            type="text"
            id="desktop-shell-status-summary-toggle"
            aria-expanded="false"
          >
            <span className="desktop-shell-status-summary-label">
              {t("shell.taskTray", "Task Tray")}
            </span>
            <span id="desktop-shell-status-summary-text">
              {t("shell.status.ready", "Ready.")}
            </span>
          </Button>
          <div className="desktop-shell-status-body roadgen-ant-status-body">
            <div className="desktop-shell-status-tab-bridge" aria-hidden="true">
              <button className="desktop-shell-status-tab active" type="button" data-shell-status-tab="status">
                {t("shell.status", "Status")}
              </button>
              <button className="desktop-shell-status-tab" type="button" data-shell-status-tab="activity">
                {t("shell.activity", "Activity")}
              </button>
              <button className="desktop-shell-status-tab" type="button" data-shell-status-tab="artifacts">
                {t("shell.artifacts", "Artifacts")}
              </button>
              <button className="desktop-shell-status-tab" type="button" data-shell-status-tab="hints">
                {t("shell.hints", "Hints")}
              </button>
            </div>
            <Tabs
              size="small"
              destroyOnHidden={false}
              items={[
                {
                  key: "status",
                  label: t("shell.status", "Status"),
                  forceRender: true,
                  children: <div id="desktop-shell-status-host" className="desktop-shell-status-stack" />,
                },
                {
                  key: "activity",
                  label: t("shell.activity", "Activity"),
                  forceRender: true,
                  children: <div id="desktop-shell-activity-host" className="desktop-shell-status-stack" />,
                },
                {
                  key: "artifacts",
                  label: t("shell.artifacts", "Artifacts"),
                  forceRender: true,
                  children: <div id="desktop-shell-artifacts-host" className="desktop-shell-status-stack" />,
                },
                {
                  key: "hints",
                  label: t("shell.hints", "Hints"),
                  forceRender: true,
                  children: <div id="desktop-shell-hints-host" className="desktop-shell-status-stack" />,
                },
              ]}
            />
          </div>
        </section>
      </Layout>
      <ShortcutModal language={language} open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
