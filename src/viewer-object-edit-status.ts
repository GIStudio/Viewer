import type { SceneEditSaveStatus } from "./viewer-api";
import type { SceneObjectEditorInteractionState } from "./viewer-scene-object-editor";
import { viewerText, type ViewerLanguage } from "./viewer-i18n";

type Options = {
  root: HTMLElement;
  getLanguage(): ViewerLanguage;
  onExit(): void;
  signal?: AbortSignal;
};

export type SceneObjectEditStatusController = {
  setInteractionState(state: SceneObjectEditorInteractionState): void;
  setSaveStatus(status: SceneEditSaveStatus): void;
  refreshLanguage(): void;
};

const INITIAL_INTERACTION_STATE: SceneObjectEditorInteractionState = {
  enabled: false,
  mode: "translate",
  selectedInstanceId: null,
  transforming: false,
};

function requireElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing scene editing status element: ${selector}`);
  return element;
}

export function createSceneObjectEditStatusController(options: Options): SceneObjectEditStatusController {
  const statusEl = requireElement<HTMLElement>(options.root, "#viewer-object-edit-status");
  const titleEl = requireElement<HTMLElement>(statusEl, "[data-object-edit-title]");
  const detailEl = requireElement<HTMLElement>(statusEl, "[data-object-edit-detail]");
  const saveEl = requireElement<HTMLElement>(statusEl, "[data-object-edit-save]");
  const exitEl = requireElement<HTMLButtonElement>(statusEl, "#viewer-object-edit-exit");
  let interaction = INITIAL_INTERACTION_STATE;
  let saveStatus: SceneEditSaveStatus = "clean";

  const render = (): void => {
    const language = options.getLanguage();
    statusEl.hidden = !interaction.enabled;
    statusEl.dataset.mode = interaction.mode;
    statusEl.dataset.saveStatus = saveStatus;
    if (!interaction.enabled) return;

    const mode = interaction.mode === "translate"
      ? viewerText(language, "Move", "移动")
      : interaction.mode === "rotate"
        ? viewerText(language, "Rotate", "旋转")
        : viewerText(language, "Scale", "缩放");
    titleEl.textContent = viewerText(language, `Editing objects · ${mode}`, `地物编辑中 · ${mode}`);

    if (interaction.transforming) {
      detailEl.textContent = viewerText(
        language,
        `Transforming ${interaction.selectedInstanceId ?? "object"} · Esc cancels this transform`,
        `正在变换 ${interaction.selectedInstanceId ?? "地物"} · Esc 取消本次变换`,
      );
    } else if (interaction.selectedInstanceId) {
      detailEl.textContent = viewerText(
        language,
        `Selected ${interaction.selectedInstanceId} · G / R / S · Esc clears selection`,
        `已选择 ${interaction.selectedInstanceId} · G / R / S · Esc 取消选择`,
      );
    } else {
      detailEl.textContent = viewerText(
        language,
        "Select a tree or street object · Esc exits editing",
        "选择树木或街具 · Esc 退出编辑",
      );
    }

    const saveText: Record<SceneEditSaveStatus, [string, string]> = {
      clean: ["No pending edits", "没有待保存修改"],
      dirty: ["Changes waiting to save", "修改等待保存"],
      saving: ["Saving immutable revision…", "正在保存不可变版本…"],
      saved: ["Saved", "已保存"],
      failed: ["Save failed · changes retained", "保存失败 · 修改已保留"],
      conflict: ["Revision conflict", "版本冲突"],
    };
    saveEl.textContent = viewerText(language, saveText[saveStatus][0], saveText[saveStatus][1]);
    exitEl.textContent = viewerText(language, "Exit editing", "退出编辑");
    exitEl.setAttribute("aria-label", viewerText(language, "Exit scene object editing", "退出场景地物编辑"));
    statusEl.setAttribute("aria-label", viewerText(language, "Scene object editing status", "场景地物编辑状态"));
  };

  exitEl.addEventListener("click", options.onExit, options.signal ? { signal: options.signal } : undefined);
  render();

  return {
    setInteractionState(state): void {
      interaction = state;
      render();
    },
    setSaveStatus(status): void {
      saveStatus = status;
      render();
    },
    refreshLanguage: render,
  };
}
