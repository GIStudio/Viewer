import {
  VIEWER_LANGUAGE_EVENT,
  loadViewerLanguage,
  normalizeViewerLanguage,
  translateViewerKey,
  type ViewerLanguage,
} from "./viewer-i18n";

const PRIMARY_TOOL_BUTTON_IDS = [
  "asset-move-toggle-btn",
  "laser-pointer-toggle-btn",
] as const;

const EXPERIMENTAL_TOOL_BUTTON_IDS = [
  "third-person-toggle-btn",
  "frame-mode-toggle-btn",
  "asset-bbox-toggle-btn",
  "graph-overlay-toggle-btn",
  "layout-overlay-toggle-btn",
  "analysis-overlay-toggle-btn",
  "diorama-finish-toggle-btn",
  "audio-toggle-btn",
] as const;

function toggleSection(root: HTMLElement, buttonId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`#${buttonId}`)?.closest<HTMLElement>(".viewer-settings-toggle-section") ?? null;
}

function translated(language: ViewerLanguage, key: string, fallback: string): string {
  return translateViewerKey(language, key) ?? fallback;
}

export function organizeViewerSettingsTools(root: HTMLElement, signal?: AbortSignal): void {
  const sourceGroup = root.querySelector<HTMLElement>(".viewer-settings-toggle-group");
  if (!sourceGroup || sourceGroup.dataset.organized === "true") return;

  const primary = document.createElement("div");
  primary.className = "viewer-settings-primary-tools";
  primary.setAttribute("role", "group");

  const disclosure = document.createElement("details");
  disclosure.className = "viewer-settings-tool-disclosure";
  const summary = document.createElement("summary");
  const body = document.createElement("div");
  body.className = "viewer-settings-tool-disclosure-body";
  const note = document.createElement("p");
  note.className = "viewer-settings-tool-disclosure-note";
  const experimentalGrid = document.createElement("div");
  experimentalGrid.className = "viewer-settings-tool-disclosure-grid";
  experimentalGrid.setAttribute("role", "group");

  for (const id of PRIMARY_TOOL_BUTTON_IDS) {
    const section = toggleSection(root, id);
    if (section) primary.appendChild(section);
  }
  for (const id of EXPERIMENTAL_TOOL_BUTTON_IDS) {
    const section = toggleSection(root, id);
    if (section) experimentalGrid.appendChild(section);
  }

  body.append(note, experimentalGrid);
  disclosure.append(summary, body);
  sourceGroup.replaceChildren(primary, disclosure);
  sourceGroup.dataset.organized = "true";

  const refreshLanguage = (language: ViewerLanguage) => {
    primary.setAttribute("aria-label", translated(language, "viewer.settings.primaryTools", "Ready tools"));
    summary.textContent = translated(language, "viewer.settings.experimentalTools", "Experimental views");
    note.textContent = translated(
      language,
      "viewer.settings.experimentalToolsHint",
      "These diagnostics are still under development and are hidden from the default workflow.",
    );
    experimentalGrid.setAttribute("aria-label", summary.textContent);
  };

  refreshLanguage(loadViewerLanguage());
  window.addEventListener(VIEWER_LANGUAGE_EVENT, (event) => {
    const detail = (event as CustomEvent<{ language?: unknown }>).detail;
    refreshLanguage(normalizeViewerLanguage(detail?.language));
  }, signal ? { signal } : undefined);
}
