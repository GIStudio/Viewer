import { useEffect, useRef, useState } from "react";

import { VIEWER_COMMANDS } from "../viewer-command-registry";
import { translateViewerKey } from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";

type ShortcutModalProps = {
  language: ViewerLanguage;
  open: boolean;
  initialTab?: HelpDialogTab;
  onClose: () => void;
};

export type HelpDialogTab = "help" | "shortcuts";
export const VIEWER_HELP_DIALOG_EVENT = "roadgen3d:open-help-dialog";

export function ShortcutModal({ language, open, initialTab = "shortcuts", onClose }: ShortcutModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<HelpDialogTab>(initialTab);
  const t = (key: string, fallback: string): string => translateViewerKey(language, key) ?? fallback;
  useEffect(() => {
    if (!open) return undefined;
    setActiveTab(initialTab);
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])") ?? [])];
        if (!focusable.length) return;
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index + 1) % focusable.length;
        event.preventDefault();
        focusable[next]?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [initialTab, onClose, open]);
  if (!open) return null;
  const groups = [...new Set(VIEWER_COMMANDS.map((command) => language === "zh" ? command.group.zh : command.group.en))];
  return (
    <div className="viewer-workbench-modal viewer-shortcuts-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="viewer-workbench-dialog" role="dialog" aria-modal="true" aria-labelledby="viewer-help-dialog-title">
        <header>
          <div><span>WORKBENCH GUIDE</span><h2 id="viewer-help-dialog-title">{language === "zh" ? "帮助与快捷键" : "Help and shortcuts"}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={language === "zh" ? "关闭" : "Close"}>×</button>
        </header>
        <div className="viewer-help-dialog-tabs" role="tablist" aria-label={language === "zh" ? "帮助内容" : "Help content"}>
          <button type="button" role="tab" aria-selected={activeTab === "help"} aria-controls="viewer-help-dialog-help" onClick={() => setActiveTab("help")}>{language === "zh" ? "帮助" : "Help"}</button>
          <button type="button" role="tab" aria-selected={activeTab === "shortcuts"} aria-controls="viewer-help-dialog-shortcuts" onClick={() => setActiveTab("shortcuts")}>{language === "zh" ? "快捷键" : "Shortcuts"}</button>
        </div>
        <main className="roadgen-shortcut-modal">
          {activeTab === "help" ? <div id="viewer-help-dialog-help" role="tabpanel" className="viewer-help-dialog-guide">
            <section><h3>{language === "zh" ? "当前工作流程" : "Current workflow"}</h3><ol><li><strong>{language === "zh" ? "2D 数据与标注" : "2D data and annotation"}</strong><span>{language === "zh" ? "完成道路、区域和标注校验；只有当前获准版本可以生成新的 3D 场景。" : "Validate roads, regions, and annotations before generating a new 3D scene."}</span></li><li><strong>{language === "zh" ? "3D 场景生成" : "3D scene generation"}</strong><span>{language === "zh" ? "从“3D 场景生成”核对来源和参数，再确认开始生成。" : "Review the source and parameters in 3D Scene Generation, then confirm."}</span></li><li><strong>{language === "zh" ? "审核与再编辑" : "Review and edit again"}</strong><span>{language === "zh" ? "2D 修改会使旧 3D 场景成为历史版本；重新生成后再审核和交付。" : "2D edits make the old 3D result historical; regenerate before review and delivery."}</span></li></ol></section>
            <section><h3>{language === "zh" ? "常见问题" : "Common questions"}</h3><p>{language === "zh" ? "无法审核或评价时，请确认已有与当前 2D 标注一致的 3D 场景。场景视角可通过顶部 3D / 2D、重置视图和鼠标左键拖动调整。" : "If review or evaluation is unavailable, confirm a 3D scene matches the current 2D annotation. Use the top 3D / 2D controls, Reset View, and left-button drag to adjust the camera."}</p></section>
          </div> : <div id="viewer-help-dialog-shortcuts" role="tabpanel">
            {groups.map((group) => <section key={group}><h3>{group}</h3>{VIEWER_COMMANDS.filter((command) => (language === "zh" ? command.group.zh : command.group.en) === group).map((command) => <div key={command.id}><kbd>{command.keys.join(" + ")}</kbd><span>{language === "zh" ? command.label.zh : command.label.en}</span></div>)}</section>)}
          </div>}
        </main>
        <footer><p>{activeTab === "shortcuts" ? (language === "zh" ? "编辑快捷键只在对象编辑已激活时生效。" : "Editing shortcuts apply only while object editing is active.") : (language === "zh" ? "需要更多操作提示时，可随时点击顶部 ? 打开此面板。" : "Open this panel from the top ? button whenever you need guidance.")}</p><button type="button" onClick={onClose}>{language === "zh" ? "完成" : "Done"}</button></footer>
      </section>
    </div>
  );
}
