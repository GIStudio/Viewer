import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { resolveApiUrl } from "./api-origin";
import { apiJson } from "./viewer-api";
import type { SceneAssetRef } from "./viewer-api";
import type { SceneAssetPaletteAdapter } from "./viewer-asset-palette";

type CatalogAsset = SceneAssetRef & {
  manifestLabel?: string;
  dimensionsM?: number[];
  ready?: boolean;
  warnings?: string[];
};

export type SceneAssetDialogController = {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
};

type Options = {
  adapter: SceneAssetPaletteAdapter;
  language(): "en" | "zh";
  flashStatus(message: string): void;
  selectedInstanceId?(): string | null;
  selectedCategory?(): string | null;
  replaceSelected?(asset: SceneAssetRef): boolean;
  placeAsset?(asset: SceneAssetRef): boolean | Promise<boolean>;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function createSceneAssetDialog(options: Options): SceneAssetDialogController {
  const root = document.createElement("div");
  root.className = "viewer-workbench-modal viewer-scene-assets-modal";
  root.hidden = true;
  root.innerHTML = `
    <section class="viewer-workbench-dialog" role="dialog" aria-modal="true" aria-labelledby="viewer-scene-assets-title">
      <header><div><span>SCENE ASSETS / 场景资产</span><h2 id="viewer-scene-assets-title">全部可用资产 · 点击放置或原位替换</h2></div><button type="button" data-action="close" aria-label="关闭">×</button></header>
      <div class="viewer-scene-assets-selection" data-selection-state="empty"><span>当前对象</span><strong data-selected-instance>未选择</strong><small data-selected-hint>先开启编辑并选择树木或街具，即可用同类资产原位替换。</small></div>
      <div class="viewer-scene-assets-toolbar"><input type="search" data-search placeholder="搜索名称、类别或资产 ID" /><select data-category><option value="">全部类别</option><option value="tree">树木</option><option value="bench">座椅</option><option value="lamp">路灯</option><option value="sign">标志</option><option value="bollard">护柱</option><option value="trash">垃圾桶</option></select><button type="button" data-action="search">搜索</button></div>
      <main><section class="viewer-scene-assets-list" data-list></section><aside class="viewer-scene-assets-preview"><div data-preview-canvas></div><h3 data-preview-title>选择资产查看 GLB</h3><p data-preview-meta>所有用户使用同一受信任资产目录；服务器仍会校验文件指纹与承载面。</p></aside></main>
      <footer><p>点击“添加到场景”进入放置画笔；普通点击落点，Shift + 点击进入漫游，Esc 退出画笔。原位替换会保留位置、旋转与缩放。</p><button type="button" data-action="close">完成</button></footer>
    </section>`;
  document.body.appendChild(root);
  const dialog = root.querySelector<HTMLElement>(".viewer-workbench-dialog")!;
  const list = root.querySelector<HTMLElement>("[data-list]")!;
  const searchInput = root.querySelector<HTMLInputElement>("[data-search]")!;
  const categorySelect = root.querySelector<HTMLSelectElement>("[data-category]")!;
  const selectedInstanceEl = root.querySelector<HTMLElement>("[data-selected-instance]")!;
  const selectedHintEl = root.querySelector<HTMLElement>("[data-selected-hint]")!;
  const selectionStateEl = root.querySelector<HTMLElement>(".viewer-scene-assets-selection")!;
  const previewHost = root.querySelector<HTMLElement>("[data-preview-canvas]")!;
  const previewTitle = root.querySelector<HTMLElement>("[data-preview-title]")!;
  const previewMeta = root.querySelector<HTMLElement>("[data-preview-meta]")!;
  let catalog: CatalogAsset[] = [];
  let previousFocus: HTMLElement | null = null;
  let previewRenderer: THREE.WebGLRenderer | null = null;
  let previewScene: THREE.Scene | null = null;
  let previewCamera: THREE.PerspectiveCamera | null = null;
  let previewAnimation = 0;
  let previewObject: THREE.Object3D | null = null;

  function render(): void {
    const rows = catalog;
    const selectedId = options.selectedInstanceId?.() ?? null;
    const selectedCategory = options.selectedCategory?.() ?? null;
    selectedInstanceEl.textContent = selectedId ?? "未选择";
    selectedHintEl.textContent = selectedId
      ? `只显示 ${selectedCategory || "同类"} 资产；替换后保留当前变换。`
      : "先开启编辑并选择树木或街具，即可用同类资产原位替换。";
    selectionStateEl.dataset.selectionState = selectedId ? "selected" : "empty";
    if (!rows.length) {
      list.innerHTML = `<div class="viewer-scene-assets-empty">没有匹配的可用资产。</div>`;
      return;
    }
    list.innerHTML = rows.map((asset, index) => `
      <article class="viewer-scene-asset-card" data-index="${index}">
        <div><span>${escapeHtml(asset.category)}</span><strong>${escapeHtml(asset.label)}</strong><small>${escapeHtml(asset.manifestName)} · ${escapeHtml(asset.assetId)}</small></div>
        <div class="viewer-scene-asset-card-actions">
          <button type="button" data-action="preview" data-index="${index}">预览</button>
          <button type="button" data-action="place" data-index="${index}">添加到场景</button>
          ${selectedId ? `<button type="button" data-action="replace" data-index="${index}">原位替换</button>` : ""}
        </div>
      </article>`).join("");
  }

  async function search(): Promise<void> {
    list.innerHTML = `<div class="viewer-scene-assets-empty">正在搜索受信任资产目录…</div>`;
    const query = new URLSearchParams({ q: searchInput.value.trim(), category: categorySelect.value, limit: "100" });
    const payload = await apiJson<{ assets: CatalogAsset[] }>(`/api/asset-catalog/search?${query.toString()}`);
    catalog = payload.assets ?? [];
    render();
  }

  function ensurePreview(): void {
    if (previewRenderer) return;
    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    previewRenderer.setSize(320, 220);
    previewHost.appendChild(previewRenderer.domElement);
    previewScene = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(42, 320 / 220, 0.01, 200);
    previewCamera.position.set(3, 2, 4);
    previewScene.add(new THREE.HemisphereLight(0xffffff, 0x64756d, 2.4));
    const animate = (): void => {
      if (!previewRenderer || !previewScene || !previewCamera) return;
      if (previewObject) previewObject.rotation.y += 0.006;
      previewRenderer.render(previewScene, previewCamera);
      previewAnimation = requestAnimationFrame(animate);
    };
    animate();
  }

  async function preview(asset: SceneAssetRef): Promise<void> {
    ensurePreview();
    previewTitle.textContent = asset.label;
    previewMeta.textContent = `${asset.category} · ${asset.manifestName} · ${asset.assetId}`;
    if (!previewScene || !previewCamera) return;
    if (previewObject) previewScene.remove(previewObject);
    const query = new URLSearchParams({ manifest_name: asset.manifestName, asset_id: asset.assetId, fingerprint: asset.fingerprint });
    const gltf = await new GLTFLoader().loadAsync(resolveApiUrl(`/api/asset-catalog/model?${query.toString()}`));
    previewObject = gltf.scene;
    previewScene.add(previewObject);
    const box = new THREE.Box3().setFromObject(previewObject);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    previewObject.position.sub(center);
    const radius = Math.max(size.x, size.y, size.z, 0.5);
    previewCamera.position.set(radius * 1.8, radius * 1.2, radius * 2.2);
    previewCamera.lookAt(0, 0, 0);
  }

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!target) return;
    if (target.dataset.action === "close") return controller.close();
    if (target.dataset.action === "search") return void search().catch((error) => options.flashStatus(String(error)));
    const index = Number(target.dataset.index);
    const asset = catalog[index];
    if (!asset) return;
    if (target.dataset.action === "preview") void preview(asset).catch((error) => options.flashStatus(String(error)));
    if (target.dataset.action === "replace" && options.replaceSelected?.(asset)) controller.close();
    if (target.dataset.action === "place") {
      void Promise.resolve(options.placeAsset?.(asset) ?? false)
        .then((started) => { if (started) controller.close(); })
        .catch((error) => options.flashStatus(String(error)));
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      controller.close();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input, select")];
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index + 1) % focusable.length;
      event.preventDefault();
      focusable[next]?.focus();
    }
  });

  const controller: SceneAssetDialogController = {
    async open(): Promise<void> {
      previousFocus = document.activeElement as HTMLElement | null;
      await options.adapter.load();
      const selectedCategory = options.selectedCategory?.() ?? "";
      categorySelect.value = [...categorySelect.options].some((option) => option.value === selectedCategory) ? selectedCategory : "";
      root.hidden = false;
      await search();
      searchInput.focus();
    },
    close(): void {
      root.hidden = true;
      previousFocus?.focus({ preventScroll: true });
    },
    isOpen: () => !root.hidden,
    dispose(): void {
      if (previewAnimation) cancelAnimationFrame(previewAnimation);
      previewRenderer?.dispose();
      root.remove();
    },
  };
  return controller;
}
