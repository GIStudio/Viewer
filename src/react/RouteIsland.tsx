import { useEffect, useRef } from "react";

import { mountViewer } from "../app";
import { mountAssetEditor } from "../asset-editor";
import { mountSceneGraphPage } from "../scene-graph";
import { mountModelInputBrowser } from "../model-input-browser";
import { bindDesktopShell } from "../desktop-shell";
import type { AppRoute } from "../ui";
import { formatViewerKey, loadViewerLanguage } from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";
import type { WorkflowController } from "../workflow-controller";
import { ViewerDesktopShell } from "./ViewerDesktopShell";

type Teardown = () => void;

type RouteIslandProps = {
  route: AppRoute;
  language: ViewerLanguage;
  workflow: WorkflowController;
};

export function RouteIsland({ route, language, workflow }: RouteIslandProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let cancelled = false;
    let routeTeardown: Teardown | undefined;
    const shell = bindDesktopShell(host, route);

    function mountRoute() {
      switch (route) {
        case "scene-graph":
          routeTeardown = mountSceneGraphPage(shell, workflow);
          break;
        case "asset-editor":
          routeTeardown = mountAssetEditor(shell);
          break;
        case "model-input-browser":
          routeTeardown = mountModelInputBrowser(shell);
          break;
        default:
          void mountViewer(shell, workflow)
            .then((teardown) => {
              routeTeardown = teardown;
              if (cancelled) routeTeardown();
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
      routeTeardown?.();
      shell.destroy();
    };
  }, [route, workflow]);

  return <ViewerDesktopShell route={route} language={language} hostRef={hostRef} workflow={workflow} />;
}
