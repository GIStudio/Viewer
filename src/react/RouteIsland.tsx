import { useEffect, useRef } from "react";

import { mountViewer } from "../app";
import { mountAssetEditor } from "../asset-editor";
import { mountSceneGraphPage } from "../scene-graph";
import { bindDesktopShell } from "../desktop-shell";
import { SHELL_ACTION_EVENT } from "../shell-events";
import { navigateTo } from "../ui";
import type { AppRoute } from "../ui";
import {
  VIEWER_LANGUAGE_EVENT,
  formatViewerKey,
  loadViewerLanguage,
  translateViewerKey,
} from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";
import type { WorkflowController } from "../workflow-controller";
import type { ProfessionalBaselineCoordinator } from "../professional-baseline-coordinator";
import {
  annotationPreparationStatus,
  consumeProfessionalViewerTarget,
  renderProfessionalReviewPanelHtml,
  storeProfessionalViewerTarget,
} from "../professional-pipeline";
import type { ShellTab, WorkbenchShellMode } from "../shell-types";
import { renderEvaluatePanelContent } from "../viewer-panels/rightTabs";
import { ViewerDesktopShell } from "./ViewerDesktopShell";
import { CourseStudio } from "./CourseStudio";
import { materializeDefaultStarterScene } from "../starter-scene";
import type { ProfessionalSessionController } from "../professional-session";
import { createProfessionalAccountPanel, createProfessionalAdminPanel, createProfessionalPublicSpacePanel } from "../professional-account-panels";
import { createProfessionalAssetPaletteAdapter, saveProfessionalSourceToWorkspace } from "../professional-workspace-sync";
import {
  exportOwnedPublicProject,
  evaluateOwnedPublicProject,
  createProfessionalScenarioAdapter,
  copyProfessionalStarterToOwnedProject,
  openProfessionalPublicProject,
  persistProfessionalPublicCommands,
} from "../professional-public-project";

type Teardown = () => void;

type RouteIslandProps = {
  route: AppRoute;
  language: ViewerLanguage;
  workflow: WorkflowController;
  baselineCoordinator: ProfessionalBaselineCoordinator;
  professionalSession: ProfessionalSessionController;
};

export function RouteIsland({ route, language, workflow, baselineCoordinator, professionalSession }: RouteIslandProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (route === "course-studio") return undefined;
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let cancelled = false;
    let routeTeardown: Teardown | undefined;
    let unregisterProfessionalNavigation: (() => void) | undefined;
    const shellMode: WorkbenchShellMode = "single_left_overlay";
    const shell = bindDesktopShell(host, route, shellMode);
    try {
      if (sessionStorage.getItem("roadgen:retired-model-input-notice") === "true") {
        sessionStorage.removeItem("roadgen:retired-model-input-notice");
        const message = language === "zh"
          ? "模型输入审计属于已停用的实验入口，已返回 3D 场景工作台。"
          : "The model-input audit was a retired experimental entry. You have been returned to the 3D Scene Workbench.";
        shell.setStatusSummary(message);
        shell.pushActivity(message, "warning");
      }
    } catch {
      // Session storage can be unavailable in embedded or privacy-restricted contexts.
    }

    const tr = (key: string, fallback: string): string => translateViewerKey(loadViewerLanguage(), key) ?? fallback;
    const showAdvancedSourceTools = (): boolean => professionalSession.getSnapshot().user?.system_role === "admin";
    const syncAdvancedSourceTools = (): void => {
      const visible = showAdvancedSourceTools();
      shell.root.querySelectorAll<HTMLElement>("[data-admin-source-tools]").forEach((element) => {
        element.hidden = !visible;
      });
      const sourceStatus = shell.root.querySelector<HTMLElement>("#scene-source-status");
      if (sourceStatus && !visible && sourceStatus.dataset.tone === "neutral") {
        sourceStatus.dataset.i18nKey = "sceneGraph.source.osmInitialStatus";
        sourceStatus.textContent = tr(
          "sceneGraph.source.osmInitialStatus",
          "Browse OSM and capture a study area. Lane-level details remain editable on the stage.",
        );
      }
    };
    const activateViewerTarget = (target: "generate" | "browse" | "review" | "edit" | "deliver"): void => {
      const snapshot = workflow.getSnapshot();
      if (target !== "generate" && target !== "deliver" && !snapshot.sceneLayoutPath) {
        const message = tr("professional.pipeline.sceneRequired", "Generate and load a scene first.");
        shell.setStatusSummary(message);
        shell.pushActivity(message, "warning");
        return;
      }
      if (route !== "viewer") {
        storeProfessionalViewerTarget(target);
        navigateTo("viewer");
        return;
      }
      if (target === "generate") {
        host.querySelector<HTMLButtonElement>("#viewer-generate-and-load")?.click();
        return;
      }
      if (target === "browse") {
        host.querySelector<HTMLButtonElement>("#viewer-mode-3d")?.click();
        return;
      }
      if (target === "review") {
        shell.openModalTab("review");
        return;
      }
      if (target === "edit") {
        workflow.setSceneReviewStatus("changes_requested");
        host.querySelector<HTMLButtonElement>("#viewer-edit-toggle")?.click();
        return;
      }
      shell.openModalTab("evaluate");
    };

    const initialWorkflowSnapshot = workflow.getSnapshot();
    const professionalModalTabs: ShellTab[] = route === "viewer"
      ? [
          {
            id: "review",
            label: tr("professional.pipeline.review", "Result review"),
            content: renderProfessionalReviewPanelHtml(),
            presentation: "modal",
          },
          {
            id: "evaluate",
            label: tr("professional.pipeline.deliver", "Evaluation & delivery"),
            content: renderEvaluatePanelContent(),
            presentation: "modal",
          },
        ]
      : [];
    const professionalPages = [
      {
        id: "prepare-annotation",
        label: tr("professional.pipeline.annotation", "2D data & annotation"),
        icon: "01A",
        group: "flow" as const,
        content: "",
        flow: { stage: "01" as const, branch: "annotation" as const, status: annotationPreparationStatus(workflow.getSnapshot()) },
        badge: annotationPreparationStatus(initialWorkflowSnapshot) === "ready" ? "OK" : "—",
        action: () => {
          if (workflow.getSnapshot().normalized) {
            navigateTo("scene-graph");
            return;
          }
          shell.setStatusSummary(tr("viewer.starter.materializing", "正在复制内置道路骨架…"));
          void materializeDefaultStarterScene(workflow)
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              shell.pushActivity(message, "warning");
            })
            .finally(() => navigateTo("scene-graph"));
        },
      },
      {
        id: "browse-3d",
        label: tr("professional.pipeline.browse3d", "3D Scene Browse"),
        icon: "3D",
        group: "flow" as const,
        content: "",
        flow: { stage: "03" as const, status: "pending" as const },
        badge: "—",
        action: () => activateViewerTarget("browse"),
      },
    ];

    const accountPanel = createProfessionalAccountPanel(professionalSession, language, {
      onSaveCurrent: async () => { await saveProfessionalSourceToWorkspace(professionalSession, workflow); },
    });
    const publicSpacePanel = createProfessionalPublicSpacePanel(professionalSession, language, {
      onOpen: async (project) => {
        await openProfessionalPublicProject(professionalSession, workflow, project);
        if (route !== "viewer") navigateTo("viewer");
        shell.setStatusSummary(language === "zh" ? "已载入公共项目的最新3D版本。" : "Loaded the latest public 3D revision.");
      },
      onExportOwned: (project) => exportOwnedPublicProject(professionalSession, project),
    });
    const adminPanel = createProfessionalAdminPanel(professionalSession, language);
    const registerProfessionalNavigation = (): void => {
      unregisterProfessionalNavigation?.();
      const session = professionalSession.getSnapshot();
      const currentLanguage = loadViewerLanguage();
      const accountPage = {
        id: "account",
        label: currentLanguage === "zh" ? "账户" : "Account",
        icon: "AC",
        group: "system" as const,
        content: accountPanel.element,
        badge: session.status === "authenticated" ? "ON" : session.status === "guest" ? "PUB" : "—",
      };
      const publicSpacePage = {
        id: "public-space",
        label: currentLanguage === "zh" ? "小黑板" : "Bulletin board",
        icon: "PS",
        group: "workspace" as const,
        content: publicSpacePanel.element,
        badge: String(session.publicProjects.length),
      };
      const adminPage = {
        id: "admin",
        label: currentLanguage === "zh" ? "系统管理" : "System admin",
        icon: "AD",
        group: "system" as const,
        content: adminPanel.element,
      };
      unregisterProfessionalNavigation = shell.sidebar.registerPages([...professionalPages, publicSpacePage, accountPage, adminPage]);
    };
    registerProfessionalNavigation();

    const syncProfessionalSessionNavigation = (): void => {
      const session = professionalSession.getSnapshot();
      const setBadge = (id: string, value: string): void => {
        const button = host.querySelector<HTMLButtonElement>(`[data-shell-tab="${id}"]`);
        const badge = button?.querySelector<HTMLElement>(".workbench-sidebar-badge");
        if (badge) badge.textContent = value;
      };
      setBadge("account", session.status === "authenticated" ? "ON" : session.status === "guest" ? "PUB" : "—");
      setBadge("public-space", String(session.publicProjects.length));
      const adminButton = host.querySelector<HTMLButtonElement>('[data-shell-tab="admin"]');
      if (adminButton) {
        const visible = session.user?.system_role === "admin";
        adminButton.hidden = !visible;
        adminButton.setAttribute("aria-hidden", String(!visible));
        if (!visible && adminButton.getAttribute("aria-pressed") === "true") shell.sidebar.activate("account");
      }
    };
    syncProfessionalSessionNavigation();

    const updatePage = (
      id: string,
      options: { label: string; badge: string; status: string; current: boolean },
    ): void => {
      const button = host.querySelector<HTMLButtonElement>(`[data-shell-tab="${id}"]`);
      if (!button) return;
      button.dataset.flowStatus = options.status;
      button.dataset.current = options.current ? "true" : "false";
      button.title = options.label;
      button.setAttribute("aria-label", `${options.label} · ${options.badge}`);
      if (options.current) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
      const label = button.querySelector<HTMLElement>(".workbench-sidebar-label");
      if (label) label.textContent = options.label;
      const badge = button.querySelector<HTMLElement>(".workbench-sidebar-badge");
      if (badge) badge.textContent = options.badge;
      const drawerTitle = host.querySelector<HTMLElement>(`[data-shell-tab-panel="${id}"] .workbench-sidebar-drawer-header strong`);
      if (drawerTitle) drawerTitle.textContent = options.label;
    };

    const updateToolbarAction = (
      id: "review" | "evaluate",
      options: { label: string; badge: string; status: string; disabled?: boolean; unavailableMessage?: string },
    ): void => {
      const button = host.querySelector<HTMLButtonElement>(`[data-viewer-modal-tab="${id}"]`);
      if (!button) return;
      button.dataset.workflowStatus = options.status;
      button.title = options.label;
      button.setAttribute("aria-label", `${options.label} · ${options.badge}`);
      if (options.disabled && options.unavailableMessage) {
        button.setAttribute("aria-description", options.unavailableMessage);
      } else {
        button.removeAttribute("aria-description");
      }
      button.disabled = false;
      button.setAttribute("aria-disabled", String(Boolean(options.disabled)));
      button.dataset.unavailableMessage = options.disabled ? options.unavailableMessage ?? "" : "";
      button.classList.toggle("is-unavailable", Boolean(options.disabled));
      const label = button.querySelector<HTMLElement>("[data-stage-modal-label]");
      if (label) label.textContent = options.label;
      const badge = button.querySelector<HTMLElement>("[data-stage-modal-badge]");
      if (badge) badge.textContent = options.badge;
    };

    let previousSceneStale = false;
    let staleAttentionTimer: number | null = null;
    const syncProfessionalNavigation = () => {
      const snapshot = workflow.getSnapshot();
      const currentId = route === "scene-graph"
        ? "prepare-annotation"
        : "browse-3d";
      const annotationStatus = annotationPreparationStatus(snapshot);
      const hasCurrentScene = Boolean(snapshot.sceneLayoutPath)
        && snapshot.sceneSourceRevision === snapshot.sourceRevision;
      const sceneIsStale = Boolean(snapshot.sceneLayoutPath) && !hasCurrentScene;
      const canOpenReview = hasCurrentScene || snapshot.sceneRef?.kind === "starter_demo";
      const currentSceneRequiredMessage = snapshot.sceneLayoutPath
        ? tr("professional.pipeline.currentSceneReviewRequired", "The available 3D scene is from an earlier annotation. Generate the current scene before review or evaluation.")
        : tr("professional.pipeline.currentSceneRequired", "Generate the current 3D scene from the approved annotation first.");
      updatePage("prepare-annotation", {
        label: tr("professional.pipeline.annotation", "2D data & annotation"),
        badge: annotationStatus === "ready" ? "OK" : annotationStatus === "warning" ? "!" : "—",
        status: annotationStatus,
        current: currentId === "prepare-annotation",
      });
      updateToolbarAction("review", {
        label: tr("professional.pipeline.review", "Result review"),
        badge: snapshot.sceneReviewStatus === "accepted" ? "OK" : snapshot.sceneReviewStatus === "pending" ? "!" : "—",
        status: snapshot.sceneReviewStatus === "accepted" ? "accepted" : snapshot.sceneReviewStatus === "pending" ? "warning" : "pending",
        disabled: !canOpenReview,
        unavailableMessage: currentSceneRequiredMessage,
      });
      updatePage("browse-3d", {
        label: tr("professional.pipeline.browse3d", "3D Scene Browse"),
        badge: hasCurrentScene ? "OK" : snapshot.sceneLayoutPath ? "OLD" : "—",
        status: hasCurrentScene ? "ready" : snapshot.sceneLayoutPath ? "warning" : "pending",
        current: currentId === "browse-3d",
      });
      updateToolbarAction("evaluate", {
        label: tr("professional.pipeline.deliver", "Evaluation & delivery"),
        badge: snapshot.evaluation
          ? "OK"
          : snapshot.sceneReviewStatus === "accepted"
            ? "GO"
            : hasCurrentScene
              ? "03"
              : "N/A",
        status: snapshot.evaluation
          ? "ready"
          : snapshot.sceneReviewStatus === "accepted"
            ? "active"
            : hasCurrentScene
              ? "warning"
              : "pending",
        disabled: !hasCurrentScene,
        unavailableMessage: currentSceneRequiredMessage,
      });
      const statusSummary = shell.root.querySelector<HTMLElement>("#desktop-shell-status-summary-toggle");
      statusSummary?.classList.toggle("is-stale-scene", sceneIsStale);
      if (sceneIsStale && !previousSceneStale) {
        shell.setStatusSummary(currentSceneRequiredMessage);
        statusSummary?.classList.remove("is-stale-scene-attention");
        window.requestAnimationFrame(() => statusSummary?.classList.add("is-stale-scene-attention"));
        if (staleAttentionTimer !== null) window.clearTimeout(staleAttentionTimer);
        staleAttentionTimer = window.setTimeout(() => {
          statusSummary?.classList.remove("is-stale-scene-attention");
          staleAttentionTimer = null;
        }, 1500);
      }
      previousSceneStale = sceneIsStale;
    };

    syncProfessionalNavigation();
    const unsubscribeWorkflow = workflow.subscribe(syncProfessionalNavigation);
    const unsubscribeProfessionalSession = professionalSession.subscribe(() => {
      syncProfessionalSessionNavigation();
      syncProfessionalNavigation();
      syncAdvancedSourceTools();
    });
    const syncProfessionalLanguage = (): void => {
      const currentLanguage = loadViewerLanguage();
      accountPanel.setLanguage(currentLanguage);
      publicSpacePanel.setLanguage(currentLanguage);
      adminPanel.setLanguage(currentLanguage);
      registerProfessionalNavigation();
      syncProfessionalSessionNavigation();
      syncProfessionalNavigation();
    };
    window.addEventListener(VIEWER_LANGUAGE_EVENT, syncProfessionalLanguage);

    function mountRoute() {
      switch (route) {
        case "scene-graph":
          routeTeardown = mountSceneGraphPage(shell, workflow, {
            showAdvancedSourceTools: showAdvancedSourceTools(),
            onNavigateProfessionalScene: async (target) => {
              storeProfessionalViewerTarget(target);
              navigateTo("viewer");
            },
          });
          syncAdvancedSourceTools();
          break;
        case "asset-editor":
          routeTeardown = mountAssetEditor(shell, workflow);
          break;
        default:
          const pendingViewerTarget = consumeProfessionalViewerTarget();
          const shouldPreferWorkflowScene = pendingViewerTarget !== null && pendingViewerTarget !== "generate";
          void mountViewer(shell, workflow, {
            baselineCoordinator,
            persistSceneCommands: (commands, context) => persistProfessionalPublicCommands(
              professionalSession,
              workflow,
              commands,
              context.layoutPath,
            ),
            runProjectEvaluation: (weights) => evaluateOwnedPublicProject(professionalSession, workflow, weights),
            assetPaletteAdapter: createProfessionalAssetPaletteAdapter(professionalSession),
            scenarioAdapter: createProfessionalScenarioAdapter(professionalSession, workflow),
            copyStarterToProject: (layoutPath) => copyProfessionalStarterToOwnedProject(
              professionalSession,
              workflow,
              layoutPath,
            ),
            onStarterCopied: () => {
              shell.root.querySelector<HTMLButtonElement>(".desktop-shell-modal-close")?.click();
              shell.sidebar.activate("public-space");
            },
            // 2D actions have an explicit project intent.  Preserve its OSM
            // context and generated revision instead of reopening the public
            // starter just because the viewer is mounted as a standalone app.
            preferWorkflowScene: shouldPreferWorkflowScene,
            showStarterReviewOnLoad: pendingViewerTarget === null,
            modalTabs: professionalModalTabs,
          })
            .then((teardown) => {
              routeTeardown = teardown;
              if (cancelled) routeTeardown();
              if (!cancelled) {
                if (pendingViewerTarget) activateViewerTarget(pendingViewerTarget);
                syncProfessionalNavigation();
              }
            })
            .catch((error: unknown) => {
              if (cancelled) return;
              const message = error instanceof Error ? error.message : String(error);
              const language = loadViewerLanguage();
              console.error("Viewer initialization failed.", error);
              const status = shell.root.querySelector<HTMLElement>("#viewer-status");
              if (status) {
                status.dataset.tone = "error";
                status.textContent = formatViewerKey(language, "viewer.status.initializationFailed", { reason: message })
                  ?? `Viewer initialization failed: ${message}`;
              }
              const summary = shell.root.querySelector<HTMLElement>("#desktop-shell-status-summary-text");
              if (summary) summary.textContent = formatViewerKey(language, "viewer.status.initializationFailedSummary")
                ?? "Viewer initialization failed.";
            });
          return;
      }

      if (cancelled && routeTeardown) {
        routeTeardown();
      }
    }

    mountRoute();

    return () => {
      cancelled = true;
      window.removeEventListener(VIEWER_LANGUAGE_EVENT, syncProfessionalLanguage);
      unsubscribeWorkflow();
      unsubscribeProfessionalSession();
      unregisterProfessionalNavigation?.();
      accountPanel.destroy();
      publicSpacePanel.destroy();
      adminPanel.destroy();
      routeTeardown?.();
      shell.destroy();
    };
  }, [baselineCoordinator, professionalSession, route, workflow]);

  if (route === "course-studio") {
    return <CourseStudio language={language} workflow={workflow} />;
  }
  const shellMode: WorkbenchShellMode = "single_left_overlay";
  return <ViewerDesktopShell route={route} language={language} hostRef={hostRef} workflow={workflow} mode={shellMode} />;
}
