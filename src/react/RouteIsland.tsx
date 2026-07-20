import { useEffect, useRef } from "react";

import { mountViewer } from "../app";
import { mountAssetEditor } from "../asset-editor";
import { mountSceneGraphPage } from "../scene-graph";
import { mountModelInputBrowser } from "../model-input-browser";
import { bindDesktopShell } from "../desktop-shell";
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
  assetPreparationStatus,
  consumeProfessionalViewerTarget,
  professionalPipelineStage,
  renderProfessionalReviewPanelHtml,
  storeProfessionalViewerTarget,
} from "../professional-pipeline";
import type { WorkbenchShellMode } from "../shell-types";
import { renderEvaluatePanelContent } from "../viewer-panels/rightTabs";
import { ViewerDesktopShell } from "./ViewerDesktopShell";
import { CourseStudio } from "./CourseStudio";
import { materializeDefaultStarterScene } from "../starter-scene";
import type { ProfessionalSessionController } from "../professional-session";
import { createProfessionalAccountPanel, createProfessionalAdminPanel } from "../professional-account-panels";
import { saveProfessionalSourceToWorkspace } from "../professional-workspace-sync";

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

    const tr = (key: string, fallback: string): string => translateViewerKey(loadViewerLanguage(), key) ?? fallback;
    const activateViewerTarget = (target: "generate" | "review" | "edit" | "deliver"): void => {
      const snapshot = workflow.getSnapshot();
      if (target !== "review" && professionalSession.getSnapshot().status !== "authenticated") {
        const message = language === "zh"
          ? "请先登录，再创建、生成、编辑或评价个人场景。"
          : "Sign in before creating, generating, editing, or evaluating a personal scene.";
        shell.setStatusSummary(message);
        shell.pushActivity(message, "warning");
        shell.sidebar.activate("account");
        return;
      }
      if (target !== "generate" && !snapshot.sceneLayoutPath) {
        if (target === "edit" && !snapshot.normalized) {
          shell.setStatusSummary(tr("viewer.starter.materializing", "正在复制内置道路骨架…"));
          void materializeDefaultStarterScene(workflow)
            .then(() => activateViewerTarget("edit"))
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              shell.setStatusSummary(message);
              shell.pushActivity(message, "error");
            });
          return;
        }
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
      if (target === "review") {
        shell.sidebar.activate("review");
        return;
      }
      if (target === "edit") {
        workflow.setSceneReviewStatus("changes_requested");
        host.querySelector<HTMLButtonElement>("#viewer-edit-toggle")?.click();
        return;
      }
      if (snapshot.sceneReviewStatus !== "accepted") {
        const message = tr("professional.pipeline.reviewRequired", "Accept the generated result before evaluation.");
        shell.setStatusSummary(message);
        shell.pushActivity(message, "warning");
        shell.sidebar.activate("review");
        return;
      }
      host.querySelector<HTMLButtonElement>('[data-shell-tab="evaluate"]')?.click();
    };

    const professionalPages = [
      {
        id: "prepare-annotation",
        label: tr("professional.pipeline.annotation", "2D data & annotation"),
        icon: "01A",
        group: "flow" as const,
        content: "",
        flow: { stage: "01" as const, branch: "annotation" as const, status: annotationPreparationStatus(workflow.getSnapshot()) },
        badge: "—",
        action: () => {
          if (professionalSession.getSnapshot().status !== "authenticated") {
            shell.sidebar.activate("account");
            return;
          }
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
        id: "prepare-assets",
        label: tr("professional.pipeline.assets", "3D asset preparation"),
        icon: "01B",
        group: "flow" as const,
        content: "",
        flow: { stage: "01" as const, branch: "assets" as const, status: assetPreparationStatus(workflow.getSnapshot()) },
        badge: "—",
        action: () => {
          if (professionalSession.getSnapshot().status !== "authenticated") {
            shell.sidebar.activate("account");
            return;
          }
          navigateTo("asset-editor");
        },
      },
      {
        id: "generate",
        label: tr("professional.pipeline.generate", "3D scene generation"),
        icon: "02",
        group: "flow" as const,
        content: "",
        flow: { stage: "02" as const, status: "pending" as const },
        badge: "—",
        action: () => activateViewerTarget("generate"),
      },
      {
        id: "review",
        label: tr("professional.pipeline.review", "Result review"),
        icon: "03",
        group: "flow" as const,
        content: route === "viewer" ? renderProfessionalReviewPanelHtml() : "",
        flow: { stage: "03" as const, status: "pending" as const },
        badge: "—",
        ...(route === "viewer" ? {} : { action: () => activateViewerTarget("review") }),
      },
      {
        id: "edit",
        label: tr("professional.pipeline.edit", "Scene editing"),
        icon: "04",
        group: "flow" as const,
        content: "",
        flow: { stage: "04" as const, status: "pending" as const },
        badge: "—",
        action: () => activateViewerTarget("edit"),
      },
      {
        id: "evaluate",
        label: tr("professional.pipeline.deliver", "Evaluation & delivery"),
        icon: "05",
        group: "flow" as const,
        content: route === "viewer" ? renderEvaluatePanelContent() : "",
        flow: { stage: "05" as const, status: "pending" as const },
        badge: "—",
        ...(route === "viewer" ? {} : { action: () => activateViewerTarget("deliver") }),
      },
      {
        id: "model-input-audit",
        label: tr("professional.pipeline.audit", "Model input audit"),
        icon: "QA",
        group: "inspection" as const,
        content: "",
        current: route === "model-input-browser",
        action: () => navigateTo("model-input-browser"),
      },
    ];

    const accountPanel = createProfessionalAccountPanel(professionalSession, language, {
      onSaveCurrent: async () => { await saveProfessionalSourceToWorkspace(professionalSession, workflow); },
    });
    const adminPanel = createProfessionalAdminPanel(professionalSession, language);
    const registerProfessionalNavigation = (): void => {
      unregisterProfessionalNavigation?.();
      const session = professionalSession.getSnapshot();
      const accountPage = {
        id: "account",
        label: language === "zh" ? "账户" : "Account",
        icon: "AC",
        group: "system" as const,
        content: accountPanel.element,
        badge: session.status === "authenticated" ? "ON" : "—",
      };
      const adminPages = session.user?.system_role === "admin" ? [{
        id: "admin",
        label: language === "zh" ? "系统管理" : "System admin",
        icon: "AD",
        group: "system" as const,
        content: adminPanel.element,
      }] : [];
      unregisterProfessionalNavigation = shell.sidebar.registerPages([...professionalPages, accountPage, ...adminPages]);
    };
    registerProfessionalNavigation();

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

    let previousReviewStatus = workflow.getSnapshot().sceneReviewStatus;
    const syncProfessionalNavigation = () => {
      const snapshot = workflow.getSnapshot();
      const pipelineStage = professionalPipelineStage(snapshot);
      const currentId = route === "scene-graph"
        ? "prepare-annotation"
        : route === "asset-editor"
          ? "prepare-assets"
          : route === "model-input-browser"
            ? "model-input-audit"
            : pipelineStage === "review"
              ? "review"
              : pipelineStage === "edit"
                ? "edit"
                : pipelineStage === "deliver"
                  ? "evaluate"
                  : "generate";
      const annotationStatus = annotationPreparationStatus(snapshot);
      const assetsStatus = assetPreparationStatus(snapshot);
      const generationReady = annotationStatus === "ready" && assetsStatus === "ready";
      updatePage("prepare-annotation", {
        label: tr("professional.pipeline.annotation", "2D data & annotation"),
        badge: annotationStatus === "ready" ? "OK" : annotationStatus === "warning" ? "!" : "—",
        status: annotationStatus,
        current: currentId === "prepare-annotation",
      });
      updatePage("prepare-assets", {
        label: tr("professional.pipeline.assets", "3D asset preparation"),
        badge: snapshot.assetPreparation?.mode === "candidate_manifests"
          ? String(snapshot.assetPreparation.manifests.length)
          : snapshot.assetPreparation?.mode === "default_transparent_massing" ? "DEF" : "—",
        status: assetsStatus,
        current: currentId === "prepare-assets",
      });
      updatePage("generate", {
        label: tr("professional.pipeline.generate", "3D scene generation"),
        badge: snapshot.busy.generate ? "…" : generationReady ? "GO" : "—",
        status: snapshot.busy.generate ? "active" : generationReady ? "ready" : "pending",
        current: currentId === "generate",
      });
      updatePage("review", {
        label: tr("professional.pipeline.review", "Result review"),
        badge: snapshot.sceneReviewStatus === "accepted" ? "OK" : snapshot.sceneReviewStatus === "pending" ? "!" : "—",
        status: snapshot.sceneReviewStatus === "accepted" ? "accepted" : snapshot.sceneReviewStatus === "pending" ? "warning" : "pending",
        current: currentId === "review",
      });
      updatePage("edit", {
        label: tr("professional.pipeline.edit", "Scene editing"),
        badge: snapshot.editPending ? "…" : snapshot.sceneReviewStatus === "changes_requested" ? "!" : "—",
        status: snapshot.editPending ? "active" : snapshot.sceneReviewStatus === "changes_requested" ? "warning" : "pending",
        current: currentId === "edit",
      });
      updatePage("evaluate", {
        label: tr("professional.pipeline.deliver", "Evaluation & delivery"),
        badge: snapshot.evaluation ? "OK" : snapshot.sceneReviewStatus === "accepted" ? "GO" : "—",
        status: snapshot.evaluation ? "ready" : snapshot.sceneReviewStatus === "accepted" ? "active" : "pending",
        current: currentId === "evaluate",
      });
      const auditButton = host.querySelector<HTMLButtonElement>('[data-shell-tab="model-input-audit"]');
      if (auditButton) {
        const auditLabel = tr("professional.pipeline.audit", "Model input audit");
        auditButton.title = auditLabel;
        auditButton.setAttribute("aria-label", auditLabel);
        auditButton.dataset.current = route === "model-input-browser" ? "true" : "false";
        auditButton.querySelector<HTMLElement>(".workbench-sidebar-label")!.textContent = auditLabel;
      }
      if (
        route === "viewer"
        && snapshot.sceneReviewStatus === "pending"
        && previousReviewStatus !== "pending"
      ) {
        shell.sidebar.activate("review");
      }
      previousReviewStatus = snapshot.sceneReviewStatus;
    };

    syncProfessionalNavigation();
    const unsubscribeWorkflow = workflow.subscribe(syncProfessionalNavigation);
    window.addEventListener(VIEWER_LANGUAGE_EVENT, syncProfessionalNavigation);
    const unsubscribeProfessionalSession = professionalSession.subscribe(() => {
      registerProfessionalNavigation();
      syncProfessionalNavigation();
    });

    function mountRoute() {
      switch (route) {
        case "scene-graph":
          routeTeardown = mountSceneGraphPage(shell, workflow, {
            onEnterProfessionalScene: async () => {
              await baselineCoordinator.start();
              navigateTo("viewer");
            },
          });
          break;
        case "asset-editor":
          routeTeardown = mountAssetEditor(shell, workflow);
          break;
        case "model-input-browser":
          routeTeardown = mountModelInputBrowser(shell);
          break;
        default:
          void mountViewer(shell, workflow, { baselineCoordinator })
            .then((teardown) => {
              routeTeardown = teardown;
              if (cancelled) routeTeardown();
              if (!cancelled) {
                const pendingTarget = consumeProfessionalViewerTarget();
                if (pendingTarget) activateViewerTarget(pendingTarget);
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
      window.removeEventListener(VIEWER_LANGUAGE_EVENT, syncProfessionalNavigation);
      unsubscribeWorkflow();
      unregisterProfessionalNavigation?.();
      unsubscribeProfessionalSession();
      accountPanel.destroy();
      adminPanel.destroy();
      routeTeardown?.();
      shell.destroy();
    };
  }, [baselineCoordinator, language, professionalSession, route, workflow]);

  if (route === "course-studio") {
    return <CourseStudio language={language} workflow={workflow} />;
  }
  const shellMode: WorkbenchShellMode = "single_left_overlay";
  return <ViewerDesktopShell route={route} language={language} hostRef={hostRef} workflow={workflow} mode={shellMode} />;
}
