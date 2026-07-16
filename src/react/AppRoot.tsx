import { App as AntdApp, ConfigProvider } from "antd";
import { useEffect, useState } from "react";

import type { AppRoute } from "../ui";
import { createWorkflowController } from "../workflow-controller";
import { createProfessionalBaselineCoordinator } from "../professional-baseline-coordinator";
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
  const [baselineCoordinator] = useState(() => createProfessionalBaselineCoordinator(workflow));

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

  useEffect(() => () => {
    baselineCoordinator.dispose();
    workflow.dispose();
  }, [baselineCoordinator, workflow]);

  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <RouteIsland key={route} route={route} language={language} workflow={workflow} baselineCoordinator={baselineCoordinator} />
      </AntdApp>
    </ConfigProvider>
  );
}
