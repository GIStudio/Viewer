export type ViewerCommandContext = "global" | "roam" | "object_edit" | "dialog";

export type ViewerCommandDefinition = {
  id: string;
  keys: string[];
  label: { zh: string; en: string };
  group: { zh: string; en: string };
  contexts: ViewerCommandContext[];
};

export const VIEWER_COMMANDS: readonly ViewerCommandDefinition[] = [
  { id: "edit.move", keys: ["G"], label: { zh: "移动选中地物", en: "Move selected object" }, group: { zh: "场景编辑", en: "Scene editing" }, contexts: ["object_edit"] },
  { id: "edit.rotate", keys: ["R"], label: { zh: "绕 Y 轴旋转", en: "Rotate around Y" }, group: { zh: "场景编辑", en: "Scene editing" }, contexts: ["object_edit"] },
  { id: "edit.scale", keys: ["S"], label: { zh: "等比缩放", en: "Uniform scale" }, group: { zh: "场景编辑", en: "Scene editing" }, contexts: ["object_edit"] },
  { id: "edit.duplicate", keys: ["Shift", "D"], label: { zh: "复制地物", en: "Duplicate object" }, group: { zh: "场景编辑", en: "Scene editing" }, contexts: ["object_edit"] },
  { id: "edit.delete", keys: ["Delete"], label: { zh: "删除地物", en: "Delete object" }, group: { zh: "场景编辑", en: "Scene editing" }, contexts: ["object_edit"] },
  { id: "edit.assets", keys: ["A"], label: { zh: "打开场景资产", en: "Open scene assets" }, group: { zh: "场景编辑", en: "Scene editing" }, contexts: ["object_edit", "global"] },
  { id: "edit.undo", keys: ["Ctrl/Cmd", "Z"], label: { zh: "撤销并保存新版本", en: "Undo into a new revision" }, group: { zh: "版本", en: "Revision" }, contexts: ["object_edit", "global"] },
  { id: "edit.redo", keys: ["Ctrl/Cmd", "Shift", "Z"], label: { zh: "重做并保存新版本", en: "Redo into a new revision" }, group: { zh: "版本", en: "Revision" }, contexts: ["object_edit", "global"] },
  { id: "edit.cancel", keys: ["Esc"], label: { zh: "取消变换或关闭顶层弹窗", en: "Cancel transform or close top dialog" }, group: { zh: "通用", en: "General" }, contexts: ["object_edit", "dialog"] },
  { id: "viewer.settings", keys: ["P"], label: { zh: "打开显示设置", en: "Open display settings" }, group: { zh: "通用", en: "General" }, contexts: ["global"] },
  { id: "viewer.overlay", keys: ["L"], label: { zh: "切换浮动车道", en: "Toggle floating lanes" }, group: { zh: "通用", en: "General" }, contexts: ["global"] },
  { id: "viewer.reset", keys: ["R"], label: { zh: "非编辑状态重置视图", en: "Reset view outside editing" }, group: { zh: "漫游", en: "Roaming" }, contexts: ["roam"] },
  { id: "viewer.roam", keys: ["W", "A", "S", "D"], label: { zh: "漫游场景", en: "Roam the scene" }, group: { zh: "漫游", en: "Roaming" }, contexts: ["roam"] },
] as const;

export type ViewerCommandRegistry = {
  execute(commandId: string): boolean;
  definition(commandId: string): ViewerCommandDefinition | undefined;
};

export function createViewerCommandRegistry(handlers: Record<string, () => void>): ViewerCommandRegistry {
  const known = new Map(VIEWER_COMMANDS.map((definition) => [definition.id, definition]));
  return {
    execute(commandId): boolean {
      if (!known.has(commandId) || !handlers[commandId]) return false;
      handlers[commandId]!();
      return true;
    },
    definition: (commandId) => known.get(commandId),
  };
}
