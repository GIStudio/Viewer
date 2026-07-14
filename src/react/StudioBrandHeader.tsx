import type { ReactNode } from "react";

import type { ViewerLanguage } from "../viewer-i18n";

export type StudioBrandHeaderProps = {
  variant: "course" | "professional";
  language: ViewerLanguage;
  contextLabel: string;
  contextValue: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function StudioBrandHeader({
  variant,
  language,
  contextLabel,
  contextValue,
  actions,
  className = "",
}: StudioBrandHeaderProps) {
  const zh = language === "zh";
  const subtitle = variant === "course"
    ? (zh ? "城市街道教学工作台" : "Urban street teaching studio")
    : (zh ? "城市街道设计与研究工作台" : "Urban Street Design & Research Workbench");

  return (
    <header className={`studio-brand-header ${className}`.trim()} data-studio-variant={variant}>
      <div className="studio-wordmark">
        <span aria-hidden="true">RG</span>
        <div>
          <strong>RoadGen3D</strong>
          <small>{subtitle}</small>
        </div>
      </div>
      <div className="studio-header-context">
        <span>{contextLabel}</span>
        <div className="studio-header-context-value">{contextValue}</div>
      </div>
      <div className="studio-header-actions">{actions}</div>
    </header>
  );
}
