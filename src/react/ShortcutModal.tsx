import { Modal } from "antd";

import { translateViewerKey } from "../viewer-i18n";
import type { ViewerLanguage } from "../viewer-i18n";

type ShortcutModalProps = {
  language: ViewerLanguage;
  open: boolean;
  onClose: () => void;
};

export function ShortcutModal({ language, open, onClose }: ShortcutModalProps) {
  const t = (key: string, fallback: string): string => translateViewerKey(language, key) ?? fallback;
  return (
    <Modal title={t("viewer.shortcuts.title", "Viewer shortcuts")} open={open} onCancel={onClose} footer={null}>
      <div className="roadgen-shortcut-modal">
        <div>{t("viewer.shortcuts.capture", "Click scene to capture mouse")}</div>
        <div>{t("viewer.shortcuts.move", "WASD to move, Shift to sprint, Esc to unlock")}</div>
        <div>{t("viewer.shortcuts.tools", "Use Tools or the right inspector tabs for design, evaluation, comparison, history, and presets")}</div>
      </div>
    </Modal>
  );
}
