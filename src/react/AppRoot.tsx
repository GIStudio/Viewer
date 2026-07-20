import { App as AntdApp, ConfigProvider } from "antd";
import { useEffect, useState } from "react";

import type { AppRoute } from "../ui";
import { createWorkflowController } from "../workflow-controller";
import { createProfessionalBaselineCoordinator } from "../professional-baseline-coordinator";
import { createProfessionalSessionController } from "../professional-session";
import {
  VIEWER_LANGUAGE_EVENT,
  loadViewerLanguage,
  normalizeViewerLanguage,
} from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";
import {
  loadProfessionalWorkflowDraft,
  persistProfessionalWorkflowDraft,
} from "../professional-draft-store";
import { RouteIsland } from "./RouteIsland";
import { antdTheme, resolveRoute } from "./shellModel";

export function AppRoot() {
  const [route, setRoute] = useState<AppRoute>(() => resolveRoute());
  const [language, setLanguage] = useState<ViewerLanguage>(() => loadViewerLanguage());
  const [draftReady, setDraftReady] = useState(false);
  const [workflow] = useState(() => createWorkflowController());
  const [baselineCoordinator] = useState(() => createProfessionalBaselineCoordinator(workflow));
  const [professionalSession] = useState(() => createProfessionalSessionController());

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadProfessionalWorkflowDraft()
      .then((draft) => {
        if (!cancelled && draft) workflow.restoreProfessionalDraft(draft);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDraftReady(true);
      });
    return () => { cancelled = true; };
  }, [workflow]);

  useEffect(() => {
    void professionalSession.initialize();
  }, [professionalSession]);

  useEffect(() => {
    if (!draftReady || route === "course-studio") return undefined;
    return persistProfessionalWorkflowDraft(workflow);
  }, [draftReady, route, workflow]);

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

  if (!draftReady) return null;

  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <RouteIsland key={route} route={route} language={language} workflow={workflow} baselineCoordinator={baselineCoordinator} professionalSession={professionalSession} />
      </AntdApp>
    </ConfigProvider>
  );
}
