import { Modal } from "antd";

type ShortcutModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ShortcutModal({ open, onClose }: ShortcutModalProps) {
  return (
    <Modal title="Viewer shortcuts" open={open} onCancel={onClose} footer={null}>
      <div className="roadgen-shortcut-modal">
        <div>Click scene to capture mouse</div>
        <div>WASD to move, Shift to sprint, Esc to unlock</div>
        <div>Use Tools or the right inspector tabs for design, evaluation, comparison, history, and presets</div>
      </div>
    </Modal>
  );
}
