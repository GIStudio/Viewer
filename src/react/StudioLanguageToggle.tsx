import { setViewerLanguage, translateViewerKey, type ViewerLanguage } from "../viewer-i18n";

export function StudioLanguageToggle({ language }: { language: ViewerLanguage }) {
  const languages: ViewerLanguage[] = ["zh", "en"];
  const select = (next: ViewerLanguage): void => {
    // Persist an explicit choice even when it matches the first-use Chinese default.
    setViewerLanguage(next);
  };
  return (
    <div
      className="studio-language-toggle"
      role="radiogroup"
      aria-label={translateViewerKey(language, "language.group") ?? "Language"}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = languages.indexOf(language);
        const next = event.key === "Home"
          ? languages[0]
          : event.key === "End"
            ? languages[languages.length - 1]
            : languages[(index + (event.key === "ArrowRight" ? 1 : -1) + languages.length) % languages.length];
        select(next!);
      }}
    >
      {languages.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={language === value}
          tabIndex={language === value ? 0 : -1}
          data-active={language === value}
          onClick={() => select(value)}
        >
          {value === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}
