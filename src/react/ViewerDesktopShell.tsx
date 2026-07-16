import { Button, Layout, Tabs, Tooltip } from "antd";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";

import { SHELL_ACTIONS_CHANGE_EVENT } from "../shell-events";
import type { ShellActionsChangeDetail, ShellMenuActionId } from "../shell-events";
import { navigateTo, ROUTES } from "../ui";
import type { AppRoute } from "../ui";
import {
  formatViewerKey,
  translateViewerKey,
} from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";
import { professionalPipelineStage } from "../professional-pipeline";
import { WORKFLOW_STEPS, WORKFLOW_UNDO_EVENT, workflowRoute } from "../workflow-controller";
import type { WorkflowController, WorkflowStep } from "../workflow-controller";
import type { WorkbenchShellMode } from "../shell-types";
import { ShellMenus } from "./ShellMenus";
import { ShortcutModal } from "./ShortcutModal";
import { StudioBrandHeader } from "./StudioBrandHeader";
import { StudioLanguageToggle } from "./StudioLanguageToggle";

type ViewerDesktopShellProps = {
  route: AppRoute;
  language: ViewerLanguage;
  hostRef: RefObject<HTMLDivElement>;
  workflow: WorkflowController;
  embedded?: boolean;
  mode?: WorkbenchShellMode;
};

export function ViewerDesktopShell({
  route,
  language,
  hostRef,
  workflow,
  embedded = false,
  mode = "legacy_dual",
}: ViewerDesktopShellProps) {
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
  const professionalStage = professionalPipelineStage(workflowSnapshot);
  const professionalStageLabel = t(`professional.stage.${professionalStage}`, professionalStage);
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

  const openWorkflowStep = (step: WorkflowStep): void => {
    const result = workflow.transition(step);
    if (result.ok) navigateTo(workflowRoute(step));
  };

  return (
    <div ref={hostRef} className="roadgen-react-shell-host">
      <Layout
        className={`desktop-shell ${mode === "legacy_dual" ? `${route === "viewer" ? "desktop-shell-left-pinned" : "desktop-shell-left-auto-collapse"} desktop-shell-right-auto-collapse` : "desktop-shell-single-left"} roadgen-ant-shell`}
        data-route={route}
        data-shell-mode={mode}
      >
        {!embedded ? (
          <StudioBrandHeader
            variant="professional"
            language={language}
            className="desktop-shell-topbar roadgen-ant-header"
            contextLabel={t("studio.currentContext", "Current context")}
            contextValue={(
              <div className="studio-professional-context" aria-live="polite">
                <span className="studio-professional-context-tool">
                  <small>{ROUTES[route].index}</small>
                  <strong>{t(`route.${route}.label`, ROUTES[route].label)}</strong>
                </span>
                <span className="studio-professional-context-stage">{professionalStageLabel}</span>
                {workflowSnapshot.sceneRevision ? (
                  <span className="studio-professional-context-revision">
                    {formatViewerKey(language, "workflow.revision", { revision: workflowSnapshot.sceneRevision.revision })}
                  </span>
                ) : null}
              </div>
            )}
            actions={(
              <>
                <Tooltip title={t("studio.courseEntryHint", "Open the six-step student course workflow") }>
                  <Button
                    className="studio-course-entry"
                    type="default"
                    onClick={() => navigateTo("course-studio")}
                  >
                    {t("studio.openCourse", "Course Studio")}
                  </Button>
                </Tooltip>
                <StudioLanguageToggle language={language} />
                <ShellMenus
                  language={language}
                  enabledActions={enabledActions}
                  hostRef={hostRef}
                  onOpenShortcuts={() => setShortcutsOpen(true)}
                />
              </>
            )}
          />
        ) : null}
        {embedded ? <div className="workflow-shell-bar">
          <nav
            className="workflow-step-strip"
            aria-label={embedded
              ? t("workflow.navigation", "RoadGen3D student workflow")
              : t("workflow.professionalNavigation", "RoadGen3D professional workflow")}
          >
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
                <span>{String(index + 1).padStart(2, "0")}</span>
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
        </div> : null}

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

          <aside className="desktop-shell-rail desktop-shell-rail-right" data-shell-region="right" data-shell-role={mode === "legacy_dual" ? "right-rail" : "left-sidebar"} aria-label={mode === "legacy_dual" ? t(railKeys.rightTitle, `[missing ${railKeys.rightTitle}]`) : t("shell.workspace", "Workspace")}>
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
