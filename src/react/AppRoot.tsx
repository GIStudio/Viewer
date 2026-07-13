import { App as AntdApp, ConfigProvider } from "antd";
import { useEffect, useState, useSyncExternalStore } from "react";

import { navigateTo } from "../ui";
import type { AppRoute } from "../ui";
import { createWorkflowController, workflowRoute } from "../workflow-controller";
import {
  VIEWER_LANGUAGE_EVENT,
  loadViewerLanguage,
  normalizeViewerLanguage,
} from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";
import { RouteIsland } from "./RouteIsland";
import { antdTheme, resolveRoute } from "./shellModel";

export function AppRoot() {
  const [route, setRoute] = useState<AppRoute>(() => resolveRoute());
  const [language, setLanguage] = useState<ViewerLanguage>(() => loadViewerLanguage());
  const [workflow] = useState(() => createWorkflowController());
  const workflowSnapshot = useSyncExternalStore(
    workflow.subscribe,
    workflow.getSnapshot,
    workflow.getSnapshot,
  );

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const requestedLanguage = (event as CustomEvent<{ language?: unknown }>).detail?.language;
      setLanguage(normalizeViewerLanguage(requestedLanguage));
    };
    window.addEventListener(VIEWER_LANGUAGE_EVENT, handleLanguageChange);
    return () => window.removeEventListener(VIEWER_LANGUAGE_EVENT, handleLanguageChange);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const standaloneViewer = params.has("layout") || params.get("capture") === "1";
    if (standaloneViewer || route === "course-studio" || route === "asset-editor" || route === "model-input-browser") {
      return;
    }
    const targetRoute = workflowRoute(workflowSnapshot.step);
    if (targetRoute === "viewer" && route === "scene-graph") {
      navigateTo(targetRoute);
    }
  }, [route, workflowSnapshot.step]);

  useEffect(() => () => workflow.dispose(), [workflow]);

  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <RouteIsland key={route} route={route} language={language} workflow={workflow} />
      </AntdApp>
    </ConfigProvider>
  );
}
