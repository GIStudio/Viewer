import {
  TRANSLATIONS,
  VIEWER_LANGUAGE_EVENT,
  VIEWER_LANGUAGE_STORAGE_KEY,
  type ViewerLanguage,
} from "./viewer-translations";

export { VIEWER_LANGUAGE_EVENT, type ViewerLanguage } from "./viewer-translations";

export function normalizeViewerLanguage(value: unknown): ViewerLanguage {
  return value === "en" ? "en" : "zh";
}

export function loadViewerLanguage(): ViewerLanguage {
  return normalizeViewerLanguage(localStorage.getItem(VIEWER_LANGUAGE_STORAGE_KEY));
}

export function viewerText(language: ViewerLanguage, en: string, zh: string): string {
  return language === "zh" ? zh : en;
}

export function translateViewerKey(language: ViewerLanguage, key: string): string | null {
  const translation = TRANSLATIONS[key];
  if (!translation) {
    return null;
  }
  return viewerText(language, translation.en, translation.zh);
}

export type ViewerTranslationParams = Record<string, string | number>;

export function formatViewerKey(
  language: ViewerLanguage,
  key: string,
  params?: ViewerTranslationParams,
): string | null {
  const template = translateViewerKey(language, key);
  if (template === null || !params) {
    return template;
  }
  return template.replace(/\{([^{}]+)\}/g, (placeholder, name: string) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder
  ));
}

export function translateViewerLiteral(language: ViewerLanguage, sourceText: string): string | null {
  const normalizedSource = sourceText.trim();
  if (!normalizedSource) {
    return null;
  }
  for (const translation of Object.values(TRANSLATIONS)) {
    if (normalizedSource === translation.en || normalizedSource === translation.zh) {
      return viewerText(language, translation.en, translation.zh);
    }
  }
  return null;
}

export function setViewerLanguage(language: ViewerLanguage): void {
  localStorage.setItem(VIEWER_LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent<{ language: ViewerLanguage }>(VIEWER_LANGUAGE_EVENT, {
    detail: { language },
  }));
}

export function applyViewerTranslations(root: ParentNode, language: ViewerLanguage): void {
  root.querySelectorAll<HTMLElement>("[data-i18n-key]").forEach((element) => {
    const translated = translateViewerKey(language, element.dataset.i18nKey || "");
    if (translated !== null) {
      element.textContent = translated;
    }
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-source-text]").forEach((element) => {
    if (element.dataset.i18nKey) {
      return;
    }
    const translated = translateViewerLiteral(language, element.dataset.i18nSourceText || "");
    if (translated !== null) {
      element.textContent = translated;
    }
  });

  const literalContainers = new Set<HTMLElement>();
  if (root instanceof HTMLElement && root.dataset.i18nScope === "literal") {
    literalContainers.add(root);
  }
  root.querySelectorAll<HTMLElement>('[data-i18n-scope="literal"]').forEach((element) => {
    literalContainers.add(element);
  });
  const literalSelector = [
    "button",
    "div.scene-micro-note",
    "div.scene-empty-note",
    "h2",
    "h3",
    "label.scene-file-button",
    "option",
    "p",
    "small",
    "span",
    "strong",
    "summary",
    "th",
  ].join(",");
  literalContainers.forEach((container) => {
    container.querySelectorAll<HTMLElement>(literalSelector).forEach((element) => {
      if (element.dataset.i18nKey || element.dataset.i18nSourceText) {
        return;
      }
      const text = element.textContent?.trim() ?? "";
      if (!text || element.childElementCount > 0) {
        return;
      }
      const translated = translateViewerLiteral(language, text);
      if (translated !== null) {
        element.textContent = translated;
      }
    });
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-title-key]").forEach((element) => {
    const translated = translateViewerKey(language, element.dataset.i18nTitleKey || "");
    if (translated !== null) {
      element.setAttribute("title", translated);
    }
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-aria-label-key]").forEach((element) => {
    const translated = translateViewerKey(language, element.dataset.i18nAriaLabelKey || "");
    if (translated !== null) {
      element.setAttribute("aria-label", translated);
    }
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-placeholder-key]").forEach((element) => {
    const translated = translateViewerKey(language, element.dataset.i18nPlaceholderKey || "");
    if (translated !== null) {
      element.setAttribute("placeholder", translated);
    }
  });
}
