import { useEffect, useRef } from "react";

import { VIEWER_COMMANDS } from "../viewer-command-registry";
import { translateViewerKey } from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";

type ShortcutModalProps = {
  language: ViewerLanguage;
  open: boolean;
  onClose: () => void;
};

export function ShortcutModal({ language, open, onClose }: ShortcutModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const t = (key: string, fallback: string): string => translateViewerKey(language, key) ?? fallback;
  useEffect(() => {
    if (!open) return undefined;
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
  }, [onClose, open]);
  if (!open) return null;
  const groups = [...new Set(VIEWER_COMMANDS.map((command) => language === "zh" ? command.group.zh : command.group.en))];
  return (
    <div className="viewer-workbench-modal viewer-shortcuts-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="viewer-workbench-dialog" role="dialog" aria-modal="true" aria-labelledby="viewer-shortcuts-title">
        <header>
          <div><span>COMMAND REGISTRY</span><h2 id="viewer-shortcuts-title">{t("viewer.shortcuts.title", language === "zh" ? "快捷键与场景命令" : "Shortcuts and scene commands")}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={language === "zh" ? "关闭" : "Close"}>×</button>
        </header>
        <main className="roadgen-shortcut-modal">
          {groups.map((group) => <section key={group}><h3>{group}</h3>{VIEWER_COMMANDS.filter((command) => (language === "zh" ? command.group.zh : command.group.en) === group).map((command) => <div key={command.id}><kbd>{command.keys.join(" + ")}</kbd><span>{language === "zh" ? command.label.zh : command.label.en}</span></div>)}</section>)}
        </main>
        <footer><p>{language === "zh" ? "编辑快捷键只在对象编辑已激活且未捕获漫游鼠标时生效。" : "Editing shortcuts apply only while object editing is active and roaming has not captured the pointer."}</p><button type="button" onClick={onClose}>{language === "zh" ? "完成" : "Done"}</button></footer>
      </section>
    </div>
  );
}
