import "./styles/asset-editor.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { DesktopShell } from "./desktop-shell";
import { VIEWER_LANGUAGE_EVENT, applyViewerTranslations, loadViewerLanguage, translateViewerKey } from "./viewer-i18n";
import type {
  AssetCandidateManifest,
  AssetPreparationState,
  WorkflowController,
} from "./workflow-controller";
import * as AssetModel from "./asset-editor-model";
import * as AssetPreview from "./asset-editor-preview";
import { mountAssetEditorShell } from "./asset-editor-shell";
import { renderAssetInfoPanel } from "./asset-editor-info-panel";
const {
  ACTIVE_ASSET_SESSION_KEY_PREFIX, ACTIVE_MANIFEST_SESSION_KEY,
  CURATION_AUTOSAVE_DELAY_MS, DEFAULT_ASSET_MANIFEST_NAME,
  DIMENSION_AUTOSAVE_DELAY_MS, DIMENSION_STORE_DECIMALS, FALLBACK_MANIFESTS,
  FRONT_AXIS_YAW_DEG, bulkSaveAssetMetadata, candidateManifestFromInfo,
  categoryBadgeClass, createAssetEditorState, createAssetRecords, deleteAssetRecord, disposeScaleBar,
  escapeHtml, fetchManifestAssets, fetchManifests, finalPreviewYawForPolicy,
  formatCategoryRangeLine, formatDimension, formatTagInput, getAssetDimensions,
  getRangeSourceLabel, getViolationDirectionLabel, isSceneEligible,
  makeScaleBarConfig, normalizeCanonicalFront, normalizeYawDeg,
  orientationPolicyForAsset, parseTagInput, qs, readSessionValue,
  rebuildCategoryProfiles, roundTo, saveAssetMetadata,
  saveNormalizedAssetMesh, shortId, signedYawDeltaDeg,
  splitAssetWithBackendAuto, targetYawForPreviewPolicy, tierColor,
  validateCategoryDimension, writeSessionValue,
} = AssetModel;
type AssetEditorState = AssetModel.AssetEditorState;
type AssetRecord = AssetModel.AssetRecord;
type CategoryDimensionValidation = AssetModel.CategoryDimensionValidation;
type DimensionRecord = AssetModel.DimensionRecord;
type ManifestInfo = AssetModel.ManifestInfo;
const {
  alignBottomCenterToOrigin, analyzeChildren, applyScale, applyYaw,
  arrayBufferToBase64, buildClusterExport, buildSkyDomeRecord,
  buildSubAssetRecord, cloneObjectForGlbExport, clusterMeshesByFootprint,
  collectAutoSplitUnits, collectModelMeshes, createPreviewScene,
  createProceduralSkyDomeExport, createScaleBar, deleteSelectedMeshes,
  exportGlb, getBottomCenterOffset, getMeshesInSelectionArea,
  getModelDimensions, hideSelectionBox, highlightMesh, loadModelIntoPreview,
  makeUniqueAssetId, makeUniqueSubAssetId, needsBottomCenterOriginFix,
  pickSkySphereCandidate, replaceRoadReferenceGroup, replaceScaleBar, showToast,
  splitMergedMeshByConnectivity, toggleBbox, toggleWireframe, triggerDownload,
  updateFrontArrow, updateSelectionBox, zoomToFit,
} = AssetPreview;
type PreviewContext = AssetPreview.PreviewContext;
export function mountAssetEditor(shell: DesktopShell, workflow?: WorkflowController): () => void {
  const root = shell.root;
  const state: AssetEditorState = createAssetEditorState();
  let previewCtx: PreviewContext | null = null;
  let destroyed = false;
  let currentLanguage = loadViewerLanguage();
  const languageController = new AbortController();
  const shellRoot = root.querySelector<HTMLElement>(".desktop-shell");
  if (shell.mode === "legacy_dual") shellRoot?.classList.add("desktop-shell-left-pinned");
  const leftPinButton = root.querySelector<HTMLButtonElement>("[data-shell-left-pin]");
  if (leftPinButton) {
    leftPinButton.setAttribute("aria-pressed", "true");
    leftPinButton.textContent = translateViewerKey(currentLanguage, "shell.pinned") ?? "Pinned";
    leftPinButton.title = translateViewerKey(currentLanguage, "shell.unpinLeft") ?? "Unpin left sidebar";
  }
  mountAssetEditorShell(shell);
  const manifestSelect = qs<HTMLSelectElement>(root, "#ae-manifest-select");
  const useManifestBtn = qs<HTMLButtonElement>(root, "#ae-use-manifest-for-generation");
  const generationManifestStatus = qs<HTMLElement>(root, "#ae-generation-manifest-status");
  const candidateRepositorySummary = qs<HTMLElement>(root, "#ae-candidate-repository-summary");
  const candidateRepositoryList = qs<HTMLElement>(root, "#ae-candidate-repository-list");
  const backBtn = qs<HTMLButtonElement>(root, "#ae-back-btn");
  const searchInput = qs<HTMLInputElement>(root, "#ae-search");
  const categoryFilter = qs<HTMLSelectElement>(root, "#ae-category-filter");
  const tierFilter = qs<HTMLSelectElement>(root, "#ae-tier-filter");
  const eligibilityFilter = qs<HTMLSelectElement>(root, "#ae-eligibility-filter");
  const galleryStats = qs<HTMLDivElement>(root, "#ae-gallery-stats");
  const galleryGrid = qs<HTMLTableSectionElement>(root, "#ae-gallery-grid");
  const selectAllFiltered = qs<HTMLInputElement>(root, "#ae-select-all-filtered");
  const selectFilteredBtn = qs<HTMLButtonElement>(root, "#ae-select-filtered-btn");
  const clearSelectionBtn = qs<HTMLButtonElement>(root, "#ae-clear-selection-btn");
  const enableSelectedBtn = qs<HTMLButtonElement>(root, "#ae-enable-selected-btn");
  const disableSelectedBtn = qs<HTMLButtonElement>(root, "#ae-disable-selected-btn");
  const disableFilteredBtn = qs<HTMLButtonElement>(root, "#ae-disable-filtered-btn");
  const disableManifestBtn = qs<HTMLButtonElement>(root, "#ae-disable-manifest-btn");
  const detailPanel = qs<HTMLDivElement>(root, "#ae-detail-panel");
  const emptyState = qs<HTMLDivElement>(root, "#ae-empty-state");
  const emptyTitle = qs<HTMLElement>(root, "#ae-empty-title");
  const emptyMessage = qs<HTMLElement>(root, "#ae-empty-message");
  const detailContent = qs<HTMLDivElement>(root, "#ae-detail-content");
  const previewCanvas = qs<HTMLDivElement>(root, "#ae-preview-canvas");
  const infoGrid = qs<HTMLDivElement>(root, "#ae-info-grid");
  const objectSection = qs<HTMLDivElement>(root, "#ae-objects-section");
  const objectList = qs<HTMLDivElement>(root, "#ae-object-list");
  const dupCount = qs<HTMLSpanElement>(root, "#ae-dup-count");
  const saveBtn = qs<HTMLButtonElement>(root, "#ae-save-btn");
  const scaleInput = qs<HTMLInputElement>(root, "#ae-scale-input");
  const exportBtn = qs<HTMLButtonElement>(root, "#ae-export-btn");
  const removeDupsBtn = qs<HTMLButtonElement>(root, "#ae-remove-dups-btn");
  const autoSplitRecordsBtn = qs<HTMLButtonElement>(root, "#ae-auto-split-records-btn");
  const backendSplitBtn = qs<HTMLButtonElement>(root, "#ae-backend-split-btn");
  const extractSkyBtn = qs<HTMLButtonElement>(root, "#ae-extract-sky-btn");
  const splitBtn = qs<HTMLButtonElement>(root, "#ae-split-btn");
  const modeSolid = qs<HTMLButtonElement>(root, "#ae-mode-solid");
  const modeWire = qs<HTMLButtonElement>(root, "#ae-mode-wire");
  const toggleBboxBtn = qs<HTMLButtonElement>(root, "#ae-toggle-bbox");
  const zoomFitBtn = qs<HTMLButtonElement>(root, "#ae-zoom-fit");
  const toggleSelectBtn = qs<HTMLButtonElement>(root, "#ae-toggle-select");
  const deleteSelectedBtn = qs<HTMLButtonElement>(root, "#ae-delete-selected");
  const deleteRecordBtn = qs<HTMLButtonElement>(root, "#ae-delete-record");
  const loadMoreSection = qs<HTMLDivElement>(root, "#ae-load-more-section");
  const loadMoreBtn = qs<HTMLButtonElement>(root, "#ae-load-more-btn");
  const loadMoreInfo = qs<HTMLSpanElement>(root, "#ae-load-more-info");
  const yawInput = qs<HTMLInputElement>(root, "#ae-yaw-input");
  const frontSelect = qs<HTMLSelectElement>(root, "#ae-front-select");
  const orientationStatus = qs<HTMLDivElement>(root, "#ae-orientation-status");
  shell.setMenuActions({
    "file-load-layout": () => manifestSelect.focus(),
    "file-save-context": () => saveBtn.click(),
    "view-reset-view": () => zoomFitBtn.click(),
    "help-shortcuts": () => {
      shell.setBottomOpen(true);
      shell.setHints([
        { key: "assetEditor.hints.orbit" },
        { key: "assetEditor.hints.selection" },
        { key: "assetEditor.hints.export" },
      ]);
    },
  });
  applyViewerTranslations(root, currentLanguage);
  function updateOrientationStatus() {
    const asset = state.assets.find((a) => a.asset_id === state.selectedAssetId);
    const policy = orientationPolicyForAsset(asset);
    const front = normalizeCanonicalFront(state.frontDirection);
    const targetYaw = targetYawForPreviewPolicy(policy, front);
    const finalYaw = finalPreviewYawForPolicy(policy, front, state.yawValue);
    const currentFrontYaw = normalizeYawDeg((FRONT_AXIS_YAW_DEG[front] ?? 0) + state.yawValue);
    const delta = signedYawDeltaDeg(currentFrontYaw, targetYaw);
    const targetLabel = policy === "face_traffic" ? "face traffic (RHT)" : policy === "free" ? "free" : "face road";
    orientationStatus.textContent = `Policy: ${policy} · Target: ${targetLabel} (${Math.round(targetYaw)}°) · Final yaw: ${Math.round(finalYaw)}° · Δ ${Math.round(delta)}°`;
  }
  backBtn.addEventListener("click", () => {
    window.location.hash = "";
  });
  function candidateManifests(): readonly AssetCandidateManifest[] {
    const preparation = workflow?.getSnapshot().assetPreparation;
    return preparation?.mode === "candidate_manifests" ? preparation.manifests : [];
  }
  function setCandidateManifests(manifests: readonly AssetCandidateManifest[]): void {
    if (!workflow) return;
    if (!manifests.length) {
      workflow.setAssetPreparation(null);
      return;
    }
    workflow.setAssetPreparation(Object.freeze({
      mode: "candidate_manifests",
      manifests: Object.freeze(manifests.map((manifest, priority) => Object.freeze({ ...manifest, priority }))),
    }));
  }
  function activateManifest(manifest: ManifestInfo, activatedBy: AssetCandidateManifest["activatedBy"]): void {
    if (!workflow) return;
    const current = [...candidateManifests()];
    const existingIndex = current.findIndex((item) => item.name === manifest.name);
    const next = candidateManifestFromInfo(
      manifest,
      existingIndex >= 0 ? existingIndex : current.length,
      existingIndex >= 0 ? current[existingIndex].activatedBy : activatedBy,
    );
    if (existingIndex >= 0) current.splice(existingIndex, 1, next);
    else current.push(next);
    setCandidateManifests(current);
  }
  function refreshCandidateSummaries(catalog: readonly ManifestInfo[]): void {
    if (!workflow) return;
    const current = candidateManifests();
    if (!current.length) return;
    const refreshed = current.map((candidate, priority) => {
      const manifest = catalog.find((item) => item.name === candidate.name);
      if (!manifest) {
        return Object.freeze({
          ...candidate,
          priority,
          readyCount: 0,
          warnings: Object.freeze([...(candidate.warnings ?? []), "Manifest is no longer available"]),
        });
      }
      return candidateManifestFromInfo(manifest, priority, candidate.activatedBy);
    });
    setCandidateManifests(refreshed);
  }
  function syncManifestCandidateStatus(): void {
    const active = candidateManifests().some((item) => item.name === state.manifestName);
    useManifestBtn.disabled = !state.manifestName || !workflow;
    useManifestBtn.textContent = active ? "已在候选仓库中" : "加入候选仓库";
    generationManifestStatus.textContent = state.currentManifest
      ? `${state.currentManifest.label} · ${state.currentManifest.readyCount ?? 0} 可用 / ${state.currentManifest.eligibleCount ?? 0} 候选`
      : "选择资产清单后可加入候选仓库";
    generationManifestStatus.dataset.tone = active ? "success" : "neutral";
  }
  function renderCandidateRepository(): void {
    const manifests = [...candidateManifests()];
    const readyCount = manifests.reduce((sum, item) => sum + item.readyCount, 0);
    const eligibleCount = manifests.reduce((sum, item) => sum + item.eligibleCount, 0);
    candidateRepositorySummary.innerHTML = manifests.length
      ? `<strong>${manifests.length} 个清单 · ${readyCount.toLocaleString()} 个可用候选</strong><span>${eligibleCount.toLocaleString()} 个已启用记录；候选资产不保证被最终使用。</span>`
      : `<strong>尚未建立候选仓库</strong><span>在资产库中加入清单，或新建、导入、拆分、启用一个资产。</span>`;
    candidateRepositoryList.innerHTML = manifests.map((manifest, index) => {
      const categories = Object.entries(manifest.categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => `<span>${escapeHtml(category)} ${Number(count).toLocaleString()}</span>`)
        .join("");
      const warnings = (manifest.warnings ?? []).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
      return `
        <details class="ae-candidate-manifest" data-manifest-name="${escapeHtml(manifest.name)}">
          <summary>
            <span class="ae-candidate-priority">${String(index + 1).padStart(2, "0")}</span>
            <span><strong>${escapeHtml(manifest.label)}</strong><small>${manifest.readyCount.toLocaleString()} 可用 / ${manifest.eligibleCount.toLocaleString()} 候选</small></span>
            <span class="ae-candidate-source">${manifest.activatedBy === "asset_write" ? "自动加入" : "手动加入"}</span>
          </summary>
          <div class="ae-candidate-manifest-body">
            <div class="ae-candidate-categories">${categories || "<span>无支持类别</span>"}</div>
            ${warnings ? `<ul class="ae-candidate-warnings">${warnings}</ul>` : ""}
            <div class="ae-candidate-assets" data-candidate-assets>展开后加载候选资产明细…</div>
            <div class="ae-candidate-actions">
              <button type="button" data-candidate-action="up" ${index === 0 ? "disabled" : ""}>提高优先级</button>
              <button type="button" data-candidate-action="down" ${index === manifests.length - 1 ? "disabled" : ""}>降低优先级</button>
              <button type="button" data-candidate-action="inspect">在检查器中打开</button>
              <button type="button" data-candidate-action="remove">移除</button>
            </div>
          </div>
        </details>
      `;
    }).join("");
    syncManifestCandidateStatus();
    candidateRepositoryList.querySelectorAll<HTMLDetailsElement>(".ae-candidate-manifest").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (!details.open || details.dataset.assetsLoaded === "true") return;
        const name = details.dataset.manifestName ?? "";
        const host = details.querySelector<HTMLElement>("[data-candidate-assets]");
        if (!name || !host) return;
        details.dataset.assetsLoaded = "true";
        host.textContent = "正在读取候选资产…";
        void fetchManifestAssets(name, 0, 500, "eligible")
          .then((response) => {
            host.innerHTML = response.assets.length
              ? `<ol>${response.assets.map((asset) => `<li><code>${escapeHtml(asset.asset_id)}</code><span>${escapeHtml(asset.category || "unknown")}</span></li>`).join("")}</ol>`
              : "此清单没有已启用资产。";
          })
          .catch((error) => {
            host.textContent = `候选明细读取失败：${String(error)}`;
          });
      });
      details.querySelectorAll<HTMLButtonElement>("[data-candidate-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const name = details.dataset.manifestName ?? "";
          const index = candidateManifests().findIndex((item) => item.name === name);
          if (index < 0) return;
          const action = button.dataset.candidateAction;
          if (action === "inspect") {
            void loadManifest(name, true);
            shell.sidebar.activate("asset-library");
            return;
          }
          const next = [...candidateManifests()];
          if (action === "remove") next.splice(index, 1);
          if (action === "up" && index > 0) [next[index - 1], next[index]] = [next[index], next[index - 1]];
          if (action === "down" && index < next.length - 1) [next[index + 1], next[index]] = [next[index], next[index + 1]];
          setCandidateManifests(next);
        });
      });
    });
  }
  async function loadManifest(name: string, autoSelectAsset: boolean): Promise<void> {
    const manifest = state.manifestCatalog.find((item) => item.name === name) ?? null;
    state.manifestName = name;
    state.currentManifest = manifest;
    manifestSelect.value = name;
    writeSessionValue(ACTIVE_MANIFEST_SESSION_KEY, name);
    state.selectedAssetId = null;
    state.selectedAssetIds.clear();
    state.selectedObjects.clear();
    state.assets = [];
    state.loadedOffset = 0;
    state.hasMoreAssets = false;
    showTranslatedEmptyState("assetEditor.empty.loading.title", "assetEditor.empty.loading.message", manifest?.label ?? name);
    syncManifestCandidateStatus();
    try {
      const response = await fetchManifestAssets(name, 0, 100);
      state.assets = response.assets;
      state.totalAssets = response.total;
      state.loadedOffset = response.offset + response.assets.length;
      state.hasMoreAssets = response.hasMore;
      state.currentManifest = response.manifest ?? manifest;
      if (response.manifest) {
        const catalogIndex = state.manifestCatalog.findIndex((item) => item.name === name);
        if (catalogIndex >= 0) state.manifestCatalog.splice(catalogIndex, 1, response.manifest);
      }
      rebuildCategoryProfiles(state.assets);
      updateCategoryFilter();
      applyFilters();
      updateLoadMoreSection();
      syncManifestCandidateStatus();
      if (!state.assets.length) {
        showTranslatedEmptyState("assetEditor.empty.manifest.title", "assetEditor.empty.manifest.message");
        return;
      }
      if (autoSelectAsset) {
        const rememberedId = readSessionValue(`${ACTIVE_ASSET_SESSION_KEY_PREFIX}${name}`);
        const preferred = state.assets.find((asset) => asset.asset_id === rememberedId)
          ?? state.assets.find((asset) => isSceneEligible(asset) && Boolean(asset.mesh_path))
          ?? state.assets[0];
        if (preferred) await selectAsset(preferred.asset_id);
      }
    } catch (err) {
      showTranslatedEmptyState("assetEditor.empty.loadFailed.title", "assetEditor.empty.manifest.message", String(err));
      showToast(root, `Failed to load manifest: ${err}`, "error");
    }
  }
  async function initManifests() {
    try {
      const manifests = await fetchManifests();
      state.manifestCatalog = manifests.length ? manifests : FALLBACK_MANIFESTS;
      refreshCandidateSummaries(state.manifestCatalog);
      for (const m of state.manifestCatalog) {
        const opt = document.createElement("option");
        opt.value = m.name;
        opt.textContent = `${m.label} (${m.readyCount ?? m.count} ready / ${m.count})`;
        manifestSelect.appendChild(opt);
      }
      const remembered = readSessionValue(ACTIVE_MANIFEST_SESSION_KEY);
      const candidateName = candidateManifests()[0]?.name ?? "";
      const preferred = [remembered, candidateName, DEFAULT_ASSET_MANIFEST_NAME]
        .find((name) => state.manifestCatalog.some((manifest) => manifest.name === name && manifest.count > 0))
        ?? state.manifestCatalog.find((manifest) => manifest.count > 0)?.name
        ?? state.manifestCatalog[0]?.name;
      renderCandidateRepository();
      if (preferred) await loadManifest(preferred, true);
      else showTranslatedEmptyState("assetEditor.empty.none.title", "assetEditor.empty.none.message");
    } catch (err) {
      showTranslatedEmptyState("assetEditor.empty.unavailable.title", "assetEditor.empty.none.message", String(err));
      showToast(root, `Failed to load manifests: ${err}`, "error");
    }
  }
  async function refreshManifestAfterWrite(autoActivate: boolean): Promise<void> {
    if (!state.manifestName) return;
    try {
      const catalog = await fetchManifests();
      if (catalog.length) state.manifestCatalog = catalog;
      const updated = state.manifestCatalog.find((item) => item.name === state.manifestName);
      if (updated) {
        state.currentManifest = updated;
        if (autoActivate) activateManifest(updated, "asset_write");
        else refreshCandidateSummaries(state.manifestCatalog);
      }
      renderCandidateRepository();
    } catch (error) {
      showToast(root, `候选仓库刷新失败: ${String(error)}`, "error");
    }
  }
  manifestSelect.addEventListener("change", () => {
    const name = manifestSelect.value;
    if (name) void loadManifest(name, true);
  });
  useManifestBtn.addEventListener("click", () => {
    if (!workflow || !state.currentManifest) return;
    activateManifest(state.currentManifest, "manual");
    shell.setStatusSummary({ key: "professional.assets.manifestReady" });
    showToast(root, "清单已加入候选仓库；生成时仍会根据场景需求选择资产。");
  });
  const unsubscribeCandidateWorkflow = workflow?.subscribe(renderCandidateRepository);
  function updateLoadMoreSection() {
    if (state.hasMoreAssets) {
      loadMoreSection.style.display = "";
      loadMoreBtn.disabled = state.isLoadingMore;
      loadMoreInfo.textContent = `Loaded ${state.assets.length} of ${state.totalAssets.toLocaleString()} assets`;
    } else {
      loadMoreSection.style.display = "none";
    }
  }
  loadMoreBtn.addEventListener("click", async () => {
    if (!state.manifestName || state.isLoadingMore || !state.hasMoreAssets) return;
    state.isLoadingMore = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading...";
    try {
      const response = await fetchManifestAssets(state.manifestName, state.loadedOffset, 100);
      state.assets = [...state.assets, ...response.assets];
      state.loadedOffset += response.assets.length;
      state.hasMoreAssets = response.hasMore;
      rebuildCategoryProfiles(state.assets);
      updateCategoryFilter();
      applyFilters();
      updateLoadMoreSection();
    } catch (err) {
      showToast(root, `Failed to load more: ${err}`, "error");
    } finally {
      state.isLoadingMore = false;
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = "Load More";
    }
  });
  function updateCategoryFilter() {
    const currentValue = state.categoryFilter || categoryFilter.value;
    const cats = new Set<string>();
    for (const a of state.assets) {
      cats.add(a.category || "unknown");
    }
    categoryFilter.innerHTML = `<option value="">All Categories (${cats.size})</option>`;
    for (const cat of Array.from(cats).sort()) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categoryFilter.appendChild(opt);
    }
    if (currentValue && Array.from(categoryFilter.options).some((option) => option.value === currentValue)) {
      categoryFilter.value = currentValue;
    }
  }
  function applyFilters() {
    const q = state.searchQuery.toLowerCase();
    const cat = state.categoryFilter;
    const tier = state.qualityTierFilter;
    const eligibility = state.eligibilityFilter;
    state.filteredAssets = state.assets.filter((a) => {
      const aCat = a.category || "unknown";
      if (q) {
        const text = [
          a.asset_id,
          a.category,
          a.text_desc ?? "",
          ...(a.tags ?? []),
          ...(a.style_tags ?? []),
          ...(a.theme_tags ?? []),
          a.curation_notes ?? "",
          a.scene_exclusion_reason ?? "",
        ].join(" ").toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (cat && aCat !== cat) return false;
      if (tier && String(a.quality_tier) !== tier) return false;
      if (eligibility === "eligible" && !isSceneEligible(a)) return false;
      if (eligibility === "disabled" && isSceneEligible(a)) return false;
      return true;
    });
    for (const assetId of Array.from(state.selectedAssetIds)) {
      if (!state.assets.some((asset) => asset.asset_id === assetId)) {
        state.selectedAssetIds.delete(assetId);
      }
    }
    renderGallery();
  }
  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value;
    applyFilters();
  });
  categoryFilter.addEventListener("change", () => {
    state.categoryFilter = categoryFilter.value;
    applyFilters();
  });
  tierFilter.addEventListener("change", () => {
    state.qualityTierFilter = tierFilter.value;
    applyFilters();
  });
  eligibilityFilter.addEventListener("change", () => {
    state.eligibilityFilter = eligibilityFilter.value;
    applyFilters();
  });
  function filteredAssetIds(): string[] {
    return state.filteredAssets.map((asset) => asset.asset_id);
  }
  function updateBulkControls() {
    const selectedCount = state.selectedAssetIds.size;
    const filteredIds = filteredAssetIds();
    const filteredCount = filteredIds.length;
    const selectedFilteredCount = filteredIds.filter((assetId) => state.selectedAssetIds.has(assetId)).length;
    const allFilteredSelected = filteredCount > 0 && selectedFilteredCount === filteredCount;
    const someFilteredSelected = selectedFilteredCount > 0 && selectedFilteredCount < filteredCount;
    selectAllFiltered.checked = allFilteredSelected;
    selectAllFiltered.indeterminate = someFilteredSelected;
    selectAllFiltered.disabled = filteredCount === 0;
    selectFilteredBtn.disabled = filteredCount === 0;
    clearSelectionBtn.disabled = selectedCount === 0;
    enableSelectedBtn.disabled = selectedCount === 0 || !state.manifestName;
    disableSelectedBtn.disabled = selectedCount === 0 || !state.manifestName;
    disableFilteredBtn.disabled = filteredCount === 0 || !state.manifestName;
    disableManifestBtn.disabled = !state.manifestName || state.totalAssets === 0;
    const selectedText = selectedCount > 0 ? ` · ${selectedCount.toLocaleString()} selected` : "";
    galleryStats.dataset.selectedText = selectedText;
  }
  function applyBulkUpdatesToLoadedAssets(assetIds: Set<string> | null, updates: Record<string, unknown>) {
    for (const asset of state.assets) {
      if (assetIds !== null && !assetIds.has(asset.asset_id)) continue;
      Object.assign(asset, updates);
    }
    const activeAsset = getActiveAsset();
    if (activeAsset) {
      updateEligibleToolbar(activeAsset);
      renderInfoPanel(activeAsset);
    }
    rebuildCategoryProfiles(state.assets);
    updateCategoryFilter();
    applyFilters();
  }
  async function updateAssetEligibilityBatch(
    assetIds: string[],
    eligible: boolean,
    reason: string,
  ) {
    if (!state.manifestName || assetIds.length === 0) return;
    const uniqueIds = Array.from(new Set(assetIds));
    const updates = {
      scene_eligible: eligible,
      scene_exclusion_reason: eligible ? "" : reason,
    };
    try {
      const result = await bulkSaveAssetMetadata(state.manifestName, updates, {
        assetIds: uniqueIds,
        scope: "selected",
      });
      applyBulkUpdatesToLoadedAssets(new Set(uniqueIds), updates);
      await refreshManifestAfterWrite(eligible);
      showToast(root, `${eligible ? "Enabled" : "Disabled"} ${result.updatedCount.toLocaleString()} assets`);
    } catch (err) {
      showToast(root, `Bulk update failed: ${err}`, "error");
    }
  }
  async function disableCurrentManifest() {
    if (!state.manifestName) return;
    const total = state.totalAssets || state.assets.length;
    const ok = window.confirm(
      `Disable every asset in this manifest?\n\nManifest: ${state.manifestName}\nAssets: ${total.toLocaleString()}\n\nThis writes scene_eligible=false to the manifest JSONL.`,
    );
    if (!ok) return;
    const updates = {
      scene_eligible: false,
      scene_exclusion_reason: "disabled_by_manifest_bulk",
    };
    try {
      const result = await bulkSaveAssetMetadata(state.manifestName, updates, { scope: "all" });
      applyBulkUpdatesToLoadedAssets(null, updates);
      state.selectedAssetIds.clear();
      await refreshManifestAfterWrite(false);
      showToast(root, `Disabled ${result.updatedCount.toLocaleString()} assets in ${state.manifestName}`);
    } catch (err) {
      showToast(root, `Manifest disable failed: ${err}`, "error");
    }
  }
  function renderGallery() {
    galleryGrid.innerHTML = "";
    const loadedText = state.totalAssets > state.assets.length
      ? `${state.assets.length.toLocaleString()} / ${state.totalAssets.toLocaleString()}（已加载）`
      : `${state.assets.length.toLocaleString()}（全部）`;
    const catCount = state.assets.reduce((acc, a) => {
      acc.add(a.category || "unknown");
      return acc;
    }, new Set<string>()).size;
    const catSuffix = state.totalAssets > state.assets.length ? "（部分加载）" : "（完整加载）";
    const selectedText = state.selectedAssetIds.size > 0 ? ` / ${state.selectedAssetIds.size.toLocaleString()} 已选择` : "";
    galleryStats.textContent = `${state.filteredAssets.length} 个展示 / ${loadedText} 资产 / ${catCount} 类别 ${catSuffix}${selectedText}`;
    for (const asset of state.filteredAssets) {
      const row = document.createElement("tr");
      row.className = [
        "ae-asset-row",
        asset.asset_id === state.selectedAssetId ? "active" : "",
        state.selectedAssetIds.has(asset.asset_id) ? "selected" : "",
        isSceneEligible(asset) ? "" : "disabled",
      ].filter(Boolean).join(" ");
      row.dataset.assetId = asset.asset_id;
      const fCount = asset.face_count ?? asset.mesh_face_count ?? 0;
      const vCount = asset.vertex_count ?? asset.quality_metrics?.vertex_count ?? 0;
      const tier = asset.quality_tier;
      const eligible = isSceneEligible(asset);
      const cat = asset.category || "unknown";
      row.innerHTML = `
        <td class="ae-select-cell">
          <input class="ae-asset-select" type="checkbox" data-asset-id="${escapeHtml(asset.asset_id)}" ${state.selectedAssetIds.has(asset.asset_id) ? "checked" : ""} aria-label="Select ${escapeHtml(asset.asset_id)}" />
        </td>
        <td>
          <button class="ae-asset-id-button" type="button" data-asset-id="${escapeHtml(asset.asset_id)}" title="${escapeHtml(asset.asset_id)}">${escapeHtml(shortId(asset.asset_id))}</button>
          <div class="ae-asset-desc">${escapeHtml(String(asset.text_desc ?? ""))}</div>
        </td>
        <td><span class="ae-card-category ${categoryBadgeClass(cat)}">${escapeHtml(cat)}</span></td>
        <td><span class="ae-eligibility-pill ${eligible ? "eligible" : "disabled"}">${eligible ? "Enabled" : "Disabled"}</span></td>
        <td><span class="ae-card-tier" style="color:${tierColor(tier)}">${tier !== undefined ? `T${tier}` : "T?"}</span></td>
        <td><span class="ae-table-muted">${escapeHtml(String(asset.source ?? ""))}</span></td>
        <td><span class="ae-table-mono" title="${vCount.toLocaleString()} vertices">${fCount.toLocaleString()}f</span></td>
      `;
      row.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".ae-asset-select")) return;
        void selectAsset(asset.asset_id);
      });
      const checkbox = row.querySelector<HTMLInputElement>(".ae-asset-select");
      checkbox?.addEventListener("change", () => {
        if (checkbox.checked) {
          state.selectedAssetIds.add(asset.asset_id);
        } else {
          state.selectedAssetIds.delete(asset.asset_id);
        }
        renderGallery();
      });
      galleryGrid.appendChild(row);
    }
    updateBulkControls();
  }
  selectAllFiltered.addEventListener("change", () => {
    const ids = filteredAssetIds();
    if (selectAllFiltered.checked) {
      ids.forEach((assetId) => state.selectedAssetIds.add(assetId));
    } else {
      ids.forEach((assetId) => state.selectedAssetIds.delete(assetId));
    }
    renderGallery();
  });
  selectFilteredBtn.addEventListener("click", () => {
    filteredAssetIds().forEach((assetId) => state.selectedAssetIds.add(assetId));
    renderGallery();
  });
  clearSelectionBtn.addEventListener("click", () => {
    state.selectedAssetIds.clear();
    renderGallery();
  });
  enableSelectedBtn.addEventListener("click", () => {
    void updateAssetEligibilityBatch(Array.from(state.selectedAssetIds), true, "");
  });
  disableSelectedBtn.addEventListener("click", () => {
    void updateAssetEligibilityBatch(Array.from(state.selectedAssetIds), false, "disabled_by_asset_editor_bulk");
  });
  disableFilteredBtn.addEventListener("click", () => {
    const ids = filteredAssetIds();
    const ok = window.confirm(`Disable ${ids.length.toLocaleString()} currently loaded filtered assets?`);
    if (!ok) return;
    void updateAssetEligibilityBatch(ids, false, "disabled_by_asset_editor_filtered");
  });
  disableManifestBtn.addEventListener("click", () => {
    void disableCurrentManifest();
  });
  async function selectAsset(assetId: string) {
    state.selectedAssetId = assetId;
    if (state.manifestName) {
      writeSessionValue(`${ACTIVE_ASSET_SESSION_KEY_PREFIX}${state.manifestName}`, assetId);
    }
    state.selectedObjects.clear();
    if (previewCtx) {
      clearMeshSelection();
    } else {
      state.selectedMeshes.clear();
    }
    updateDeleteButtonState();
    state.sceneChildren = [];
    const asset = state.assets.find((a) => a.asset_id === assetId);
    state.scaleValue = asset?.scale ?? 1;
    state.yawValue = normalizeYawDeg(asset?.yaw_deg ?? 0);
    state.frontDirection = normalizeCanonicalFront(asset?.canonical_front ?? "+Z");
    state.modelDimensions = getAssetDimensions(asset);
    scaleInput.value = String(state.scaleValue);
    yawInput.value = String(state.yawValue);
    frontSelect.value = state.frontDirection;
    updateOrientationStatus();
    galleryGrid.querySelectorAll(".ae-asset-row").forEach((el) => {
      el.classList.toggle("active", (el as HTMLElement).dataset.assetId === assetId);
    });
    if (!asset) return;
    emptyState.style.display = "none";
    detailContent.style.display = "";
    saveBtn.disabled = false;
    deleteRecordBtn.disabled = false;
    renderInfoPanel(asset);
    refreshDimensionValidationPanel(getAssetDimensions(asset));
    if (!previewCtx) {
      previewCtx = createPreviewScene(previewCanvas);
    }
    const meshPath = asset.mesh_path;
    if (meshPath) {
      const glbUrl = `/api/file?path=${encodeURIComponent(meshPath)}`;
      try {
        const { children } = await loadModelIntoPreview(previewCtx, glbUrl);
        if (state.originAutoAlignEnabled) {
          await autoFixAssetOriginIfNeeded(previewCtx, asset);
        } else {
          updateOriginAlignmentPanel();
        }
        state.sceneChildren = children;
        renderObjectList();
        updateActionButtons();
        const dims = getModelDimensions(previewCtx);
        if (dims) {
          state.originalDimensions = {
            width: dims.width,
            height: dims.height,
            depth: dims.depth,
          };
        if (state.scaleValue !== 1) {
          applyScale(previewCtx, state.scaleValue);
        }
          refreshModelDimensionsFromScene(previewCtx);
        }
        if (state.yawValue !== 0) {
          applyYaw(previewCtx, state.yawValue);
          refreshModelDimensionsFromScene(previewCtx);
        }
        updateFrontArrow(
          previewCtx,
          state.frontDirection,
          finalPreviewYawForPolicy(orientationPolicyForAsset(asset), state.frontDirection, state.yawValue),
        );
      } catch (err) {
        showTranslatedEmptyState("assetEditor.empty.modelFailed.title", "assetEditor.empty.choose.message", `${asset.asset_id} · ${String(err)}`);
        showToast(root, `Failed to load GLB: ${err}`, "error");
      }
    }
  }
  let currentEmptyTranslation: { titleKey: string; messageKey: string; detail: string } | null = null;
  function showTranslatedEmptyState(titleKey: string, messageKey: string, detail = ""): void {
    currentEmptyTranslation = { titleKey, messageKey, detail };
    const title = translateViewerKey(currentLanguage, titleKey) ?? titleKey;
    const message = [detail, translateViewerKey(currentLanguage, messageKey) ?? messageKey]
      .filter(Boolean)
      .join(" · ");
    showEmptyState(title, message, false);
  }
  function showEmptyState(
    title: string = translateViewerKey(currentLanguage, "assetEditor.empty.choose.title") ?? "Choose an inspectable asset",
    message: string = translateViewerKey(currentLanguage, "assetEditor.empty.choose.message") ?? "Select a record from the asset library.",
    clearTranslation = true,
  ) {
    if (clearTranslation) currentEmptyTranslation = null;
    emptyState.style.display = "";
    emptyTitle.textContent = title;
    emptyMessage.textContent = message;
    detailContent.style.display = "none";
    saveBtn.disabled = true;
    deleteRecordBtn.disabled = true;
    updateEligibleToolbar(null);
  }
  function updateDimensionsDisplay(dims: DimensionRecord | null) {
    const wInput = document.getElementById("ae-dim-w") as HTMLInputElement | null;
    const hInput = document.getElementById("ae-dim-h") as HTMLInputElement | null;
    const dInput = document.getElementById("ae-dim-d") as HTMLInputElement | null;
    const slider = document.getElementById("ae-dims-slider") as HTMLInputElement | null;
    if (!dims) return;
    if (wInput) { wInput.value = formatDimension(dims.width); wInput.disabled = false; }
    if (hInput) { hInput.value = formatDimension(dims.height); hInput.disabled = false; }
    if (dInput) { dInput.value = formatDimension(dims.depth); dInput.disabled = false; }
    if (slider) slider.disabled = false;
  }
  function getActiveAsset(): AssetRecord | null {
    return state.assets.find((asset) => asset.asset_id === state.selectedAssetId) ?? null;
  }
  function formatOriginVector(offset: THREE.Vector3 | null): string {
    if (!offset) return "等待模型加载后检测。";
    return `X ${formatDimension(offset.x)}m · Y ${formatDimension(offset.y)}m · Z ${formatDimension(offset.z)}m`;
  }
  function getOriginStatusText(offset: THREE.Vector3 | null): string {
    if (!offset) return "尚未检测资产底部中心。";
    if (needsBottomCenterOriginFix(offset)) {
      return "底部中心未对准场景原点，可能导致悬浮或水平偏移。";
    }
    return "底部中心已对准场景原点。";
  }
  function updateOriginAlignmentPanel() {
    const offset = previewCtx?.currentModel ? getBottomCenterOffset(previewCtx.currentModel) : null;
    const needsFix = needsBottomCenterOriginFix(offset);
    const status = document.getElementById("ae-origin-status");
    const offsetText = document.getElementById("ae-origin-offset");
    const autoToggle = document.getElementById("ae-origin-auto-align") as HTMLInputElement | null;
    const alignBtn = document.getElementById("ae-align-origin-btn") as HTMLButtonElement | null;
    const dragBtn = document.getElementById("ae-drag-move-toggle") as HTMLButtonElement | null;
    if (status) {
      status.textContent = getOriginStatusText(offset);
      status.className = `ae-dim-range-status ${needsFix ? "warn" : "ok"}`;
    }
    if (offsetText) {
      offsetText.textContent = `Bottom center: ${formatOriginVector(offset)}`;
    }
    if (autoToggle) {
      autoToggle.checked = state.originAutoAlignEnabled;
    }
    if (alignBtn) {
      alignBtn.disabled = !previewCtx?.currentModel || !state.selectedAssetId || !needsFix;
    }
    if (dragBtn) {
      dragBtn.textContent = state.dragMoveMode ? "Drag Move: On" : "Drag Move: Off";
      dragBtn.classList.toggle("active", state.dragMoveMode);
    }
  }
  async function saveCurrentModelOrigin(
    ctx: PreviewContext,
    asset: AssetRecord,
    updates: Record<string, unknown>,
    toastMessage: string,
    bakeCurrentScale: boolean = false,
  ): Promise<AssetRecord> {
    if (!ctx.currentModel || !state.manifestName) return asset;
    if (bakeCurrentScale) {
      clearDimensionAutosaveTimer();
      pendingDimensionAutosave = null;
      dimensionAutosaveVersion += 1;
      if (dimensionAutosaveInFlight) {
        await new Promise<void>((resolve) => {
          const startedAt = performance.now();
          const waitUntilIdle = () => {
            if (!dimensionAutosaveInFlight || performance.now() - startedAt > 2000) {
              resolve();
              return;
            }
            window.setTimeout(waitUntilIdle, 50);
          };
          waitUntilIdle();
        });
      }
    }
    const dims = getModelDimensions(ctx);
    const currentOffset = getBottomCenterOffset(ctx.currentModel);
    const glbData = await exportGlb(cloneObjectForGlbExport(ctx.currentModel, ctx.originalMaterials));
    const normalizedAsset = await saveNormalizedAssetMesh(
      state.manifestName,
      asset.asset_id,
      arrayBufferToBase64(glbData),
      {
        dimensions_m: dims ?? undefined,
        origin_alignment: "bottom-center",
        origin_bottom_center_current_m: currentOffset
          ? {
              x: roundTo(currentOffset.x, DIMENSION_STORE_DECIMALS),
              y: roundTo(currentOffset.y, DIMENSION_STORE_DECIMALS),
              z: roundTo(currentOffset.z, DIMENSION_STORE_DECIMALS),
            }
          : undefined,
        origin_saved_at: new Date().toISOString(),
        ...updates,
        ...(bakeCurrentScale
          ? {
              scale: 1,
              origin_baked_scale: state.scaleValue,
            }
          : {}),
      },
    );
    Object.assign(asset, normalizedAsset);
    if (bakeCurrentScale) {
      state.scaleValue = 1;
      scaleInput.value = "1.0000";
      syncSliderToScale(1);
    }
    if (dims) {
      state.modelDimensions = dims;
      state.originalDimensions = { ...dims };
    }
    renderInfoPanel(asset);
    refreshDimensionValidationPanel(dims);
    updateOriginAlignmentPanel();
    showToast(root, toastMessage);
    return asset;
  }
  async function autoFixAssetOriginIfNeeded(
    ctx: PreviewContext,
    asset: AssetRecord,
    bakeCurrentScale: boolean = false,
  ): Promise<boolean> {
    if (!ctx.currentModel || !state.manifestName) return false;
    const offset = getBottomCenterOffset(ctx.currentModel);
    if (!needsBottomCenterOriginFix(offset)) return false;
    alignBottomCenterToOrigin(ctx.currentModel, offset);
    await saveCurrentModelOrigin(
      ctx,
      asset,
      {
        origin_bottom_center_before_m: {
          x: roundTo(offset.x, DIMENSION_STORE_DECIMALS),
          y: roundTo(offset.y, DIMENSION_STORE_DECIMALS),
          z: roundTo(offset.z, DIMENSION_STORE_DECIMALS),
        },
        origin_fix_m: {
          x: roundTo(-offset.x, DIMENSION_STORE_DECIMALS),
          y: roundTo(-offset.y, DIMENSION_STORE_DECIMALS),
          z: roundTo(-offset.z, DIMENSION_STORE_DECIMALS),
        },
        origin_fixed_at: new Date().toISOString(),
        origin_fix_mode: "auto-align",
      },
      "已自动修复资产原点并保存",
      bakeCurrentScale,
    );
    return true;
  }
  type DimensionAutosaveSnapshot = {
    version: number;
    manifestName: string;
    assetId: string;
    scale: number;
    dimensions: DimensionRecord;
  };
  let dimensionAutosaveTimer: number | null = null;
  let dimensionAutosaveVersion = 0;
  let dimensionAutosaveInFlight = false;
  let pendingDimensionAutosave: DimensionAutosaveSnapshot | null = null;
  type CurationAutosaveSnapshot = {
    version: number;
    manifestName: string;
    assetId: string;
    updates: Record<string, unknown>;
  };
  let curationAutosaveTimer: number | null = null;
  let curationAutosaveVersion = 0;
  let curationAutosaveInFlight = false;
  let pendingCurationAutosave: CurationAutosaveSnapshot | null = null;
  function clearDimensionAutosaveTimer() {
    if (dimensionAutosaveTimer !== null) {
      window.clearTimeout(dimensionAutosaveTimer);
      dimensionAutosaveTimer = null;
    }
  }
  function queueDimensionAutosaveRetry() {
    clearDimensionAutosaveTimer();
    dimensionAutosaveTimer = window.setTimeout(() => {
      dimensionAutosaveTimer = null;
      void flushDimensionAutosave();
    }, DIMENSION_AUTOSAVE_DELAY_MS);
  }
  function scheduleDimensionAutosave() {
    if (destroyed || !state.selectedAssetId || !state.modelDimensions) return;
    const manifestName = manifestSelect.value;
    if (!manifestName) return;
    pendingDimensionAutosave = {
      version: ++dimensionAutosaveVersion,
      manifestName,
      assetId: state.selectedAssetId,
      scale: state.scaleValue,
      dimensions: {
        width: state.modelDimensions.width,
        height: state.modelDimensions.height,
        depth: state.modelDimensions.depth,
      },
    };
    queueDimensionAutosaveRetry();
  }
  async function flushDimensionAutosave() {
    if (destroyed || !pendingDimensionAutosave) return;
    if (dimensionAutosaveInFlight) {
      queueDimensionAutosaveRetry();
      return;
    }
    const snapshot = pendingDimensionAutosave;
    pendingDimensionAutosave = null;
    dimensionAutosaveInFlight = true;
    try {
      await saveAssetMetadata(snapshot.manifestName, snapshot.assetId, {
        scale: snapshot.scale,
        dimensions_m: snapshot.dimensions,
      });
      if (!destroyed && snapshot.version === dimensionAutosaveVersion) {
        const asset = state.assets.find((item) => item.asset_id === snapshot.assetId);
        if (asset) {
          asset.scale = snapshot.scale;
          asset.dimensions_m = { ...snapshot.dimensions };
        }
        renderGallery();
        showToast(root, "尺寸已自动保存");
      }
    } catch (err) {
      if (!destroyed) {
        showToast(root, `尺寸自动保存失败: ${err}`, "error");
      }
    } finally {
      dimensionAutosaveInFlight = false;
      if (!destroyed && pendingDimensionAutosave && dimensionAutosaveTimer === null) {
        queueDimensionAutosaveRetry();
      }
    }
  }
  function clearCurationAutosaveTimer() {
    if (curationAutosaveTimer !== null) {
      window.clearTimeout(curationAutosaveTimer);
      curationAutosaveTimer = null;
    }
  }
  function setCurationSaveStatus(message: string, mode: "idle" | "saving" | "saved" | "error" = "idle") {
    const statusEl = root.querySelector<HTMLElement>("#ae-curation-save-status");
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.status = mode;
  }
  function collectCurationUpdatesFromPanel(): Record<string, unknown> | null {
    const tierEl = root.querySelector<HTMLSelectElement>("#ae-edit-tier");
    const eligibleEl = root.querySelector<HTMLInputElement>("#ae-edit-eligible");
    const tagsEl = root.querySelector<HTMLInputElement>("#ae-edit-tags");
    const styleTagsEl = root.querySelector<HTMLInputElement>("#ae-edit-style-tags");
    const themeTagsEl = root.querySelector<HTMLInputElement>("#ae-edit-theme-tags");
    const reasonEl = root.querySelector<HTMLTextAreaElement>("#ae-edit-exclusion-reason");
    const notesEl = root.querySelector<HTMLTextAreaElement>("#ae-edit-curation-notes");
    if (!tierEl || !eligibleEl || !tagsEl || !styleTagsEl || !themeTagsEl || !reasonEl || !notesEl) {
      return null;
    }
    const updates: Record<string, unknown> = {
      scene_eligible: eligibleEl.checked,
      tags: parseTagInput(tagsEl.value),
      style_tags: parseTagInput(styleTagsEl.value),
      theme_tags: parseTagInput(themeTagsEl.value),
      curation_notes: notesEl.value.trim(),
      scene_exclusion_reason: eligibleEl.checked ? "" : reasonEl.value.trim(),
    };
    const tierVal = tierEl.value ? parseInt(tierEl.value, 10) : undefined;
    if (tierVal !== undefined && Number.isFinite(tierVal)) {
      updates.quality_tier = tierVal;
    }
    return updates;
  }
  function applyCurationUpdatesToAsset(asset: AssetRecord, updates: Record<string, unknown>) {
    if ("quality_tier" in updates) asset.quality_tier = updates.quality_tier as number;
    asset.scene_eligible = Boolean(updates.scene_eligible);
    asset.tags = updates.tags as string[];
    asset.style_tags = updates.style_tags as string[];
    asset.theme_tags = updates.theme_tags as string[];
    asset.curation_notes = String(updates.curation_notes ?? "");
    asset.scene_exclusion_reason = String(updates.scene_exclusion_reason ?? "");
  }
  function queueCurationAutosaveRetry() {
    clearCurationAutosaveTimer();
    curationAutosaveTimer = window.setTimeout(() => {
      curationAutosaveTimer = null;
      void flushCurationAutosave();
    }, CURATION_AUTOSAVE_DELAY_MS);
  }
  function scheduleCurationAutosave() {
    if (destroyed || !state.selectedAssetId || !state.manifestName) return;
    const updates = collectCurationUpdatesFromPanel();
    if (!updates) return;
    const asset = state.assets.find((item) => item.asset_id === state.selectedAssetId);
    if (asset) applyCurationUpdatesToAsset(asset, updates);
    pendingCurationAutosave = {
      version: ++curationAutosaveVersion,
      manifestName: state.manifestName,
      assetId: state.selectedAssetId,
      updates,
    };
    setCurationSaveStatus("停止输入 800ms 后自动保存...", "saving");
    queueCurationAutosaveRetry();
  }
  async function flushCurationAutosave() {
    if (destroyed || !pendingCurationAutosave) return;
    if (curationAutosaveInFlight) {
      queueCurationAutosaveRetry();
      return;
    }
    const snapshot = pendingCurationAutosave;
    pendingCurationAutosave = null;
    curationAutosaveInFlight = true;
    try {
      await saveAssetMetadata(snapshot.manifestName, snapshot.assetId, snapshot.updates);
      const asset = state.assets.find((item) => item.asset_id === snapshot.assetId);
      if (asset) applyCurationUpdatesToAsset(asset, snapshot.updates);
      if (!destroyed && snapshot.version === curationAutosaveVersion) {
        renderGallery();
        await refreshManifestAfterWrite(snapshot.updates.scene_eligible === true);
        setCurationSaveStatus("审核信息已自动保存", "saved");
      }
    } catch (err) {
      if (!destroyed) {
        setCurationSaveStatus(`自动保存失败: ${err}`, "error");
        showToast(root, `审核信息自动保存失败: ${err}`, "error");
      }
    } finally {
      curationAutosaveInFlight = false;
      if (!destroyed && pendingCurationAutosave && curationAutosaveTimer === null) {
        queueCurationAutosaveRetry();
      }
    }
  }
  function getAssetDimensions(asset?: AssetRecord | null): DimensionRecord | null {
    if (!asset?.dimensions_m) return null;
    const { width, height, depth } = asset.dimensions_m;
    if (
      typeof width !== "number" || !Number.isFinite(width)
      || typeof height !== "number" || !Number.isFinite(height)
      || typeof depth !== "number" || !Number.isFinite(depth)
    ) {
      return null;
    }
    return {
      width,
      height,
      depth,
    };
  }
  function getDimensionValidationStatusText(validation: CategoryDimensionValidation): string {
    const rangeSource = getRangeSourceLabel(validation);
    if (!validation.feasible && validation.violations.length > 0) {
      return `当前尺寸无法同时满足全部轴向约束，已按最接近范围进行修正（${rangeSource}）。`;
    }
    if (validation.violations.length === 0) return `当前尺寸在预期范围内（${rangeSource}）。`;
    return validation.violations
      .map((violation) => {
        const unit = getViolationDirectionLabel(violation.direction);
        return `${violation.axisLabel} 轴 ${formatDimension(violation.value)}m ${unit}（目标 ${formatDimension(violation.expectedMin)}-${formatDimension(violation.expectedMax)}m）`;
      })
      .join("；");
  }
  function refreshDimensionValidationPanel(dims: DimensionRecord | null) {
    const rangeText = document.getElementById("ae-dim-range-text");
    const statusText = document.getElementById("ae-dim-range-status");
    const hintText = document.getElementById("ae-dim-range-hint");
    const autoBtn = document.getElementById("ae-auto-range-btn") as HTMLButtonElement | null;
    const asset = getActiveAsset();
    const validation = validateCategoryDimension(dims, asset?.category);
    if (rangeText) rangeText.textContent = formatCategoryRangeLine(validation.profile);
    const hasDims = Boolean(dims);
    const needsFix = validation.violations.length > 0;
    if (statusText) {
      statusText.textContent = hasDims
        ? getDimensionValidationStatusText(validation)
        : "尚未获取当前尺寸样本。";
      statusText.className = "ae-dim-range-status " + (validation.violations.length === 0 ? "ok" : "warn");
    }
    if (hintText) {
      if (!hasDims) {
        hintText.textContent = "等待模型加载完成后计算建议。";
      } else if (needsFix && validation.suggestedScale > 0) {
        hintText.textContent = `建议缩放: ${formatDimension(validation.suggestedScale)}x`;
      } else if (validation.violations.length === 0) {
        hintText.textContent = "当前已符合范围";
      } else if (!Number.isFinite(validation.suggestedScale)) {
        hintText.textContent = "无法自动计算安全缩放";
      } else {
        hintText.textContent = "-";
      }
    }
    if (autoBtn) {
      autoBtn.disabled = !dims || validation.violations.length === 0;
      autoBtn.textContent = needsFix
        ? `一键修正 (${formatDimension(Math.max(0.0001, validation.suggestedScale)).replace(/\.?0+$/, "")}x)`
        : "当前符合范围";
    }
  }
  function refreshScaleBarFromDimensions(ctx: PreviewContext, dims: DimensionRecord | null) {
    const maxDimension = dims ? Math.max(dims.width, dims.height, dims.depth) : 0;
    const config = makeScaleBarConfig(maxDimension);
    if (ctx.scaleBarGroup) {
      ctx.scaleBarGroup = replaceScaleBar(ctx.scene, ctx.scaleBarGroup, config);
    } else {
      ctx.scaleBarGroup = createScaleBar(ctx.scene, config);
    }
  }
  function refreshModelDimensionsFromScene(ctx: PreviewContext) {
    const dims = getModelDimensions(ctx);
    if (!dims) return;
    state.modelDimensions = dims;
    updateDimensionsDisplay(dims);
    syncSliderToScale(state.scaleValue);
    refreshScaleBarFromDimensions(ctx, dims);
    refreshDimensionValidationPanel(dims);
    const policy = orientationPolicyForAsset(getActiveAsset() ?? undefined);
    replaceRoadReferenceGroup(ctx, policy);
    updateFrontArrow(ctx, state.frontDirection, finalPreviewYawForPolicy(policy, state.frontDirection, state.yawValue));
    updateOriginAlignmentPanel();
  }
  function renderInfoPanel(asset: AssetRecord): void {
    renderAssetInfoPanel(asset, { infoGrid, previewCtx, state, getAssetDimensions, formatOriginVector, getOriginStatusText, getDimensionValidationStatusText, setCurationSaveStatus, updateEligibleToolbar });
  }
  const eligibleToolbarLabel = document.createElement("label");
  eligibleToolbarLabel.id = "ae-toolbar-eligible-label";
  eligibleToolbarLabel.className = "ae-action-btn ae-btn-secondary";
  eligibleToolbarLabel.style.display = "inline-flex";
  eligibleToolbarLabel.style.alignItems = "center";
  eligibleToolbarLabel.style.gap = "6px";
  eligibleToolbarLabel.style.cursor = "pointer";
  eligibleToolbarLabel.title = "控制当前资产是否进入生成候选池";
  eligibleToolbarLabel.innerHTML = `
    <input id="ae-edit-eligible" type="checkbox" disabled style="margin:0;" />
    <span>可参与生成</span>
  `;
  const eligibleToolbarStatus = document.createElement("span");
  eligibleToolbarStatus.id = "ae-curation-save-status";
  eligibleToolbarStatus.className = "ae-dim-range-hint";
  eligibleToolbarStatus.dataset.status = "idle";
  eligibleToolbarStatus.textContent = "自动保存元数据";
  eligibleToolbarStatus.style.whiteSpace = "nowrap";
  eligibleToolbarStatus.style.alignSelf = "center";
  zoomFitBtn.insertAdjacentElement("afterend", eligibleToolbarStatus);
  zoomFitBtn.insertAdjacentElement("afterend", eligibleToolbarLabel);
  function updateEligibleToolbar(asset?: AssetRecord | null) {
    const checkbox = root.querySelector<HTMLInputElement>("#ae-edit-eligible");
    const label = root.querySelector<HTMLElement>("#ae-toolbar-eligible-label");
    if (!checkbox || !label) return;
    const enabled = Boolean(asset);
    checkbox.disabled = !enabled;
    checkbox.checked = enabled ? isSceneEligible(asset) : false;
    label.classList.toggle("active", enabled && isSceneEligible(asset));
    label.style.opacity = enabled ? "1" : "0.55";
  }
  const curationAutosaveFieldIds = new Set([
    "ae-edit-tier",
    "ae-edit-eligible",
    "ae-edit-tags",
    "ae-edit-style-tags",
    "ae-edit-theme-tags",
    "ae-edit-exclusion-reason",
    "ae-edit-curation-notes",
  ]);
  function isCurationAutosaveField(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && curationAutosaveFieldIds.has(target.id);
  }
  root.addEventListener("input", (event) => {
    if (!isCurationAutosaveField(event.target)) return;
    scheduleCurationAutosave();
  });
  root.addEventListener("change", (event) => {
    if (!isCurationAutosaveField(event.target)) return;
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === "ae-edit-eligible" && target.checked) {
      const reasonEl = root.querySelector<HTMLTextAreaElement>("#ae-edit-exclusion-reason");
      if (reasonEl) reasonEl.value = "";
    }
    if (target instanceof HTMLInputElement && target.id === "ae-edit-eligible") {
      const label = root.querySelector<HTMLElement>("#ae-toolbar-eligible-label");
      if (label) label.classList.toggle("active", target.checked);
    }
    scheduleCurationAutosave();
  });
  root.addEventListener("change", (event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLInputElement) || target.id !== "ae-origin-auto-align") return;
    state.originAutoAlignEnabled = target.checked;
    localStorage.setItem("roadgen3d.assetEditor.originAutoAlign", String(state.originAutoAlignEnabled));
    updateOriginAlignmentPanel();
    if (state.originAutoAlignEnabled && previewCtx) {
      const asset = getActiveAsset();
      if (asset) {
        void autoFixAssetOriginIfNeeded(previewCtx, asset).catch((err) => {
          showToast(root, `自动对齐失败: ${err}`, "error");
        });
      }
    }
  });
  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const alignBtn = target.closest<HTMLButtonElement>("#ae-align-origin-btn");
    if (alignBtn) {
      const asset = getActiveAsset();
      if (!previewCtx || !asset) return;
      alignBtn.disabled = true;
      alignBtn.textContent = "Aligning...";
      void autoFixAssetOriginIfNeeded(previewCtx, asset, true)
        .catch((err) => showToast(root, `对齐保存失败: ${err}`, "error"))
        .finally(() => {
          alignBtn.textContent = "Align & Save Now";
          updateOriginAlignmentPanel();
        });
      return;
    }
    const dragBtn = target.closest<HTMLButtonElement>("#ae-drag-move-toggle");
    if (dragBtn) {
      setDragMoveMode(!state.dragMoveMode);
    }
    const rotateBtn = target.closest<HTMLButtonElement>("#ae-rotate-cw-btn");
    if (rotateBtn) {
      const asset = getActiveAsset();
      if (!previewCtx || !asset) return;
      const nextYaw = normalizeYawDeg(state.yawValue + 90);
      state.yawValue = nextYaw;
      yawInput.value = String(nextYaw);
      applyYaw(previewCtx, nextYaw);
      refreshModelDimensionsFromScene(previewCtx);
      updateOrientationStatus();
      updateFrontArrow(
        previewCtx,
        state.frontDirection,
        finalPreviewYawForPolicy(orientationPolicyForAsset(asset), state.frontDirection, nextYaw),
      );
      rotateBtn.disabled = true;
      rotateBtn.textContent = "旋转中...";
      void saveCurrentModelOrigin(
        previewCtx,
        asset,
        {
          yaw_deg: nextYaw,
          canonical_front: normalizeCanonicalFront(state.frontDirection),
          origin_fix_mode: "manual-rotate",
          origin_manual_rotate_saved_at: new Date().toISOString(),
        },
        "顺时针旋转90°并自动保存",
      ).catch((err) => showToast(root, `顺时针旋转并保存失败: ${err}`, "error"))
        .finally(() => {
          rotateBtn.disabled = false;
          rotateBtn.textContent = "顺时针旋转90°";
        });
    }
  });
  function renderObjectList() {
    const children = state.sceneChildren;
    if (children.length === 0) {
      objectSection.style.display = "none";
      return;
    }
    objectSection.style.display = "";
    const dupGroups = new Set(children.filter((c) => c.isDuplicate).map((c) => c.duplicateGroup));
    if (dupGroups.size > 0) {
      dupCount.style.display = "";
      dupCount.textContent = `${dupGroups.size} duplicate group(s)`;
    } else {
      dupCount.style.display = "none";
    }
    objectList.innerHTML = "";
    for (const child of children) {
      const row = document.createElement("label");
      row.className = "ae-object-row" + (child.isDuplicate ? " ae-object-dup" : "");
      row.innerHTML = `
        <input type="checkbox" class="ae-object-check" data-uuid="${child.uuid}" />
        <span class="ae-object-name">${child.name}</span>
        <span class="ae-object-stats">${child.vertexCount}v ${child.faceCount}f</span>
        ${child.isDuplicate ? '<span class="ae-object-dup-tag">dup</span>' : ""}
      `;
      const check = row.querySelector<HTMLInputElement>(".ae-object-check")!;
      check.addEventListener("change", () => {
        if (check.checked) {
          state.selectedObjects.add(child.uuid);
        } else {
          state.selectedObjects.delete(child.uuid);
        }
        updateActionButtons();
      });
      objectList.appendChild(row);
    }
  }
  function updateActionButtons() {
    const hasDups = state.sceneChildren.some((c) => c.isDuplicate);
    const hasSelection = state.selectedObjects.size > 0 || state.selectedMeshes.size > 0;
    removeDupsBtn.disabled = !hasDups;
    autoSplitRecordsBtn.disabled = !state.selectedAssetId || state.sceneChildren.length < 1;
    backendSplitBtn.disabled = !state.selectedAssetId || !state.manifestName;
    extractSkyBtn.disabled = !state.selectedAssetId || state.sceneChildren.length < 1;
    splitBtn.disabled = !hasSelection;
  }
  modeSolid.addEventListener("click", () => {
    state.renderMode = "solid";
    modeSolid.classList.add("active");
    modeWire.classList.remove("active");
    if (previewCtx) toggleWireframe(previewCtx, false);
  });
  modeWire.addEventListener("click", () => {
    state.renderMode = "wireframe";
    modeWire.classList.add("active");
    modeSolid.classList.remove("active");
    if (previewCtx) toggleWireframe(previewCtx, true);
  });
  let bboxVisible = false;
  toggleBboxBtn.addEventListener("click", () => {
    bboxVisible = !bboxVisible;
    toggleBboxBtn.classList.toggle("active", bboxVisible);
    if (previewCtx) toggleBbox(previewCtx, bboxVisible);
  });
  zoomFitBtn.addEventListener("click", () => {
    if (previewCtx) zoomToFit(previewCtx);
  });
  function updateDeleteButtonState() {
    deleteSelectedBtn.disabled = state.selectedMeshes.size === 0;
    updateActionButtons();
  }
  function clearMeshSelection() {
    if (!previewCtx) return;
    for (const mesh of state.selectedMeshes) {
      highlightMesh(previewCtx, mesh, false);
    }
    state.selectedMeshes.clear();
    updateDeleteButtonState();
  }
  function setupSelectionEvents() {
    if (!previewCtx?.selectionHelper) return;
    const canvas = previewCtx.renderer.domElement;
    const helper = previewCtx.selectionHelper;
    if (helper.enabled) return;
    helper.enabled = true;
    canvas.addEventListener("pointerdown", (e) => {
      if (!state.selectionMode || e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".ae-preview-toolbar")) return;
      helper.isDown = true;
      helper.startPoint.set(e.offsetX, e.offsetY);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!state.selectionMode || !helper.isDown) return;
      updateSelectionBox(helper, helper.startPoint.x, helper.startPoint.y, e.offsetX, e.offsetY);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!state.selectionMode || !helper.isDown) return;
      hideSelectionBox(helper);
      if (previewCtx) {
        const selectedMeshes = getMeshesInSelectionArea(previewCtx, helper);
        if (!e.ctrlKey && !e.metaKey) {
          clearMeshSelection();
        }
        for (const mesh of selectedMeshes) {
          if (!state.selectedMeshes.has(mesh)) {
            state.selectedMeshes.add(mesh);
            highlightMesh(previewCtx, mesh, true);
          }
        }
        updateDeleteButtonState();
        if (selectedMeshes.length > 0) {
          showToast(root, `Selected ${state.selectedMeshes.size} object(s)`);
        }
      }
    });
    canvas.addEventListener("pointerleave", () => {
      if (helper.isDown) {
        hideSelectionBox(helper);
      }
    });
  }
  let dragMoveEventsBound = false;
  let dragMoving = false;
  let dragMoved = false;
  const dragRaycaster = new THREE.Raycaster();
  const dragPointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const dragStartPoint = new THREE.Vector3();
  const dragStartPosition = new THREE.Vector3();
  function getDragGroundPoint(event: PointerEvent, out: THREE.Vector3): boolean {
    if (!previewCtx) return false;
    const rect = previewCtx.renderer.domElement.getBoundingClientRect();
    dragPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    dragPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    dragRaycaster.setFromCamera(dragPointer, previewCtx.camera);
    return Boolean(dragRaycaster.ray.intersectPlane(dragPlane, out));
  }
  function setupDragMoveEvents() {
    if (!previewCtx || dragMoveEventsBound) return;
    dragMoveEventsBound = true;
    const canvas = previewCtx.renderer.domElement;
    canvas.addEventListener("pointerdown", (event) => {
      if (!state.dragMoveMode || state.selectionMode || !previewCtx?.currentModel || event.button !== 0) return;
      if (!getDragGroundPoint(event, dragStartPoint)) return;
      dragMoving = true;
      dragMoved = false;
      dragStartPosition.copy(previewCtx.currentModel.position);
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!dragMoving || !state.dragMoveMode || !previewCtx?.currentModel) return;
      const currentPoint = new THREE.Vector3();
      if (!getDragGroundPoint(event, currentPoint)) return;
      const delta = currentPoint.sub(dragStartPoint);
      previewCtx.currentModel.position.set(
        dragStartPosition.x + delta.x,
        dragStartPosition.y,
        dragStartPosition.z + delta.z,
      );
      previewCtx.currentModel.updateMatrixWorld(true);
      dragMoved = dragMoved || Math.abs(delta.x) > 0.001 || Math.abs(delta.z) > 0.001;
      updateOriginAlignmentPanel();
      event.preventDefault();
    });
    const finishDrag = (event: PointerEvent) => {
      if (!dragMoving) return;
      dragMoving = false;
      if (state.dragMoveMode) canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      if (dragMoved && previewCtx?.currentModel) {
        const asset = getActiveAsset();
        if (asset) {
          void saveCurrentModelOrigin(
            previewCtx,
            asset,
            {
              origin_fix_mode: "manual-drag",
              origin_manual_drag_saved_at: new Date().toISOString(),
            },
            "手动移动已保存",
            true,
          ).catch((err) => showToast(root, `手动移动保存失败: ${err}`, "error"));
        }
      }
    };
    canvas.addEventListener("pointerup", finishDrag);
    canvas.addEventListener("pointercancel", finishDrag);
  }
  function setDragMoveMode(enabled: boolean) {
    state.dragMoveMode = enabled;
    if (enabled) {
      state.selectionMode = false;
      toggleSelectBtn.classList.remove("active");
      if (previewCtx?.selectionHelper?.isDown) {
        hideSelectionBox(previewCtx.selectionHelper);
      }
      if (previewCtx) {
        previewCtx.controls.enabled = false;
        previewCtx.renderer.domElement.style.cursor = "grab";
        setupDragMoveEvents();
      }
      showToast(root, "Drag Move: 点击并拖动物体，松开后自动保存");
    } else if (previewCtx) {
      previewCtx.controls.enabled = !state.selectionMode;
      previewCtx.renderer.domElement.style.cursor = state.selectionMode ? "crosshair" : "";
    }
    updateOriginAlignmentPanel();
  }
  toggleSelectBtn.addEventListener("click", () => {
    if (!state.selectionMode && state.dragMoveMode) {
      setDragMoveMode(false);
    }
    state.selectionMode = !state.selectionMode;
    toggleSelectBtn.classList.toggle("active", state.selectionMode);
    if (previewCtx) {
      previewCtx.controls.enabled = !state.selectionMode;
      if (state.selectionMode) {
        previewCtx.renderer.domElement.style.cursor = "crosshair";
        showToast(root, "Selection mode: Drag to select objects");
        setupSelectionEvents();
      } else {
        previewCtx.renderer.domElement.style.cursor = "";
        clearMeshSelection();
      }
    }
  });
  deleteSelectedBtn.addEventListener("click", () => {
    if (!previewCtx || state.selectedMeshes.size === 0) return;
    const meshesToDelete = Array.from(state.selectedMeshes);
    const deletedCount = deleteSelectedMeshes(previewCtx, meshesToDelete);
    state.selectedMeshes.clear();
    updateDeleteButtonState();
    if (previewCtx.currentModel) {
      state.sceneChildren = analyzeChildren(previewCtx.currentModel);
      renderObjectList();
      updateActionButtons();
      refreshModelDimensionsFromScene(previewCtx);
    }
    showToast(root, `Deleted ${deletedCount} object(s)`);
  });
  deleteRecordBtn.addEventListener("click", async () => {
    if (!state.selectedAssetId || !state.manifestName) return;
    const asset = state.assets.find((a) => a.asset_id === state.selectedAssetId);
    if (!asset) return;
    const confirmed = confirm(
      `Delete this asset from manifest?\n\nAsset ID: ${asset.asset_id}\nCategory: ${asset.category || "unknown"}\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await deleteAssetRecord(state.manifestName, state.selectedAssetId);
      const idx = state.assets.findIndex((a) => a.asset_id === state.selectedAssetId);
      if (idx !== -1) {
        state.assets.splice(idx, 1);
        state.totalAssets--;
      }
      state.selectedAssetId = null;
      showEmptyState();
      applyFilters();
      await refreshManifestAfterWrite(false);
      showToast(root, "Asset record deleted");
    } catch (err) {
      showToast(root, `Delete failed: ${err}`, "error");
    }
  });
  function syncSliderToScale(scale: number) {
    const slider = document.getElementById("ae-dims-slider") as HTMLInputElement | null;
    const sliderVal = document.getElementById("ae-dims-slider-val");
    if (!slider) return;
    const lo = scale * 0.1;
    const hi = scale * 10;
    const step = scale * 0.01;
    slider.min = String(lo);
    slider.max = String(hi);
    slider.step = String(step);
    slider.value = String(scale);
    if (sliderVal) sliderVal.textContent = `${scale.toFixed(4)}x`;
  }
  function clampScaleValue(scale: number): number {
    if (!Number.isFinite(scale)) return 1;
    return Math.max(0.01, Math.min(100, scale));
  }
  function applyAbsoluteScale(scale: number) {
    const targetScale = clampScaleValue(scale);
    state.scaleValue = targetScale;
    scaleInput.value = targetScale.toFixed(4);
    if (previewCtx) {
      applyScale(previewCtx, targetScale);
      refreshModelDimensionsFromScene(previewCtx);
    } else {
      syncSliderToScale(targetScale);
    }
    scheduleDimensionAutosave();
  }
  scaleInput.addEventListener("input", () => {
    const val = parseFloat(scaleInput.value);
    if (isNaN(val) || val <= 0) return;
    applyAbsoluteScale(val);
  });
  function applyProportionalScale(ratio: number) {
    if (!state.originalDimensions) return;
    applyAbsoluteScale(ratio);
  }
  function handleDimInputChange(changedAxis: "w" | "h" | "d") {
    if (!state.originalDimensions) return;
    const orig = state.originalDimensions;
    const wInput = document.getElementById("ae-dim-w") as HTMLInputElement | null;
    const hInput = document.getElementById("ae-dim-h") as HTMLInputElement | null;
    const dInput = document.getElementById("ae-dim-d") as HTMLInputElement | null;
    if (!wInput || !hInput || !dInput) return;
    let newValue: number;
    let originalValue: number;
    if (changedAxis === "w") {
      newValue = parseFloat(wInput.value);
      originalValue = orig.width;
    } else if (changedAxis === "h") {
      newValue = parseFloat(hInput.value);
      originalValue = orig.height;
    } else {
      newValue = parseFloat(dInput.value);
      originalValue = orig.depth;
    }
    if (isNaN(newValue) || newValue <= 0 || originalValue <= 0) return;
    applyProportionalScale(newValue / originalValue);
  }
  root.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.id === "ae-dim-w") handleDimInputChange("w");
    else if (target.id === "ae-dim-h") handleDimInputChange("h");
    else if (target.id === "ae-dim-d") handleDimInputChange("d");
    else if (target.id === "ae-dims-slider") {
      const val = parseFloat((target as HTMLInputElement).value);
      if (!isNaN(val) && val > 0) applyProportionalScale(val);
    }
  });
  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.id !== "ae-auto-range-btn") return;
    const activeAsset = getActiveAsset();
    if (!activeAsset) return;
    if (!previewCtx?.currentModel) {
      showToast(root, "No model loaded for auto-fix");
      return;
    }
    const dims = state.modelDimensions;
    const validation = validateCategoryDimension(dims, activeAsset.category);
    if (!dims || validation.violations.length === 0) {
      showToast(root, "当前尺寸已在规则范围内");
      return;
    }
    if (!Number.isFinite(validation.suggestedScale) || validation.suggestedScale <= 0) {
      showToast(root, "无法自动计算安全缩放值");
      return;
    }
    applyAbsoluteScale(validation.suggestedScale);
    showToast(root, validation.feasible
      ? `已按 ${formatDimension(validation.suggestedScale)}x 自动修正到范围`
      : `已按最接近范围的比例 ${formatDimension(validation.suggestedScale)}x 修正（范围冲突，将取妥协）`);
  });
  yawInput.addEventListener("input", () => {
    const val = parseFloat(yawInput.value);
    if (isNaN(val)) return;
    const normalizedYaw = normalizeYawDeg(val);
    state.yawValue = normalizedYaw;
    if (previewCtx) {
      applyYaw(previewCtx, normalizedYaw);
      refreshModelDimensionsFromScene(previewCtx);
    }
    updateOrientationStatus();
  });
  frontSelect.addEventListener("change", () => {
    state.frontDirection = normalizeCanonicalFront(frontSelect.value);
    frontSelect.value = state.frontDirection;
    if (previewCtx) {
      const policy = orientationPolicyForAsset(getActiveAsset() ?? undefined);
      updateFrontArrow(
        previewCtx,
        state.frontDirection,
        finalPreviewYawForPolicy(policy, state.frontDirection, state.yawValue),
      );
    }
    updateOrientationStatus();
  });
  exportBtn.addEventListener("click", async () => {
    if (!previewCtx?.currentModel) return;
    try {
      const cloned = cloneObjectForGlbExport(previewCtx.currentModel, previewCtx.originalMaterials);
      const data = await exportGlb(cloned);
      const asset = state.assets.find((a) => a.asset_id === state.selectedAssetId);
      const name = asset?.asset_id ?? "exported";
      triggerDownload(data, `${name}_scaled_${state.scaleValue}.glb`);
      showToast(root, "GLB exported successfully");
    } catch (err) {
      showToast(root, `Export failed: ${err}`, "error");
    }
  });
  saveBtn.addEventListener("click", async () => {
    if (!state.selectedAssetId || !state.manifestName) return;
    const curationUpdates = collectCurationUpdatesFromPanel();
    if (!curationUpdates) return;
    const updates: Record<string, unknown> = { ...curationUpdates };
    updates.scale = state.scaleValue;
    updates.yaw_deg = normalizeYawDeg(state.yawValue);
    updates.canonical_front = normalizeCanonicalFront(state.frontDirection);
    if (state.modelDimensions) {
      updates.dimensions_m = {
        width: state.modelDimensions.width,
        height: state.modelDimensions.height,
        depth: state.modelDimensions.depth,
      };
    }
    try {
      await saveAssetMetadata(state.manifestName, state.selectedAssetId, updates);
      const asset = state.assets.find((a) => a.asset_id === state.selectedAssetId);
      if (asset) {
        applyCurationUpdatesToAsset(asset, curationUpdates);
        asset.scale = state.scaleValue;
        asset.yaw_deg = updates.yaw_deg as number;
        asset.canonical_front = updates.canonical_front as string;
        if (updates.dimensions_m) asset.dimensions_m = updates.dimensions_m as { width?: number; height?: number; depth?: number };
      }
      renderGallery();
      showToast(root, "Saved");
    } catch (err) {
      showToast(root, `Save failed: ${err}`, "error");
    }
  });
  removeDupsBtn.addEventListener("click", () => {
    if (!previewCtx?.currentModel) return;
    const dupGroups = new Map<number, THREE.Mesh[]>();
    const meshes: THREE.Mesh[] = [];
    previewCtx.currentModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });
    for (const mesh of meshes) {
      const childInfo = state.sceneChildren.find((c) => c.uuid === mesh.uuid);
      if (childInfo?.isDuplicate) {
        if (!dupGroups.has(childInfo.duplicateGroup)) dupGroups.set(childInfo.duplicateGroup, []);
        dupGroups.get(childInfo.duplicateGroup)!.push(mesh);
      }
    }
    let removedCount = 0;
    for (const [, group] of dupGroups) {
      for (let i = 1; i < group.length; i++) {
        const mesh = group[i];
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else mesh.material.dispose();
        }
        removedCount++;
      }
    }
    if (previewCtx.currentModel) {
      state.sceneChildren = analyzeChildren(previewCtx.currentModel);
      renderObjectList();
      updateActionButtons();
      refreshModelDimensionsFromScene(previewCtx);
    }
    showToast(root, `Removed ${removedCount} duplicate mesh(es)`);
  });
  backendSplitBtn.addEventListener("click", async () => {
    if (!state.selectedAssetId || !state.manifestName) return;
    const parentAsset = getActiveAsset();
    if (!parentAsset) return;
    backendSplitBtn.disabled = true;
    backendSplitBtn.textContent = "Backend Splitting...";
    try {
      const result = await splitAssetWithBackendAuto(state.manifestName, parentAsset.asset_id);
      let addedCount = 0;
      for (const asset of result.assets) {
        const existingIndex = state.assets.findIndex((item) => item.asset_id === asset.asset_id);
        if (existingIndex >= 0) {
          state.assets[existingIndex] = asset;
        } else {
          state.assets.unshift(asset);
          addedCount += 1;
        }
      }
      state.totalAssets += addedCount;
      rebuildCategoryProfiles(state.assets);
      applyFilters();
      await refreshManifestAfterWrite(true);
      showToast(
        root,
        `后端自动拆分完成：新增 ${result.created_count || result.assets.length} 个子资产，cluster=${result.cluster_count}, method=${result.actual_method}${result.fallback_reason ? " fallback" : ""}`,
      );
    } catch (err) {
      showToast(root, `后端自动拆分失败: ${err}`, "error");
    } finally {
      backendSplitBtn.textContent = "Backend Auto Split";
      updateActionButtons();
    }
  });
  autoSplitRecordsBtn.addEventListener("click", async () => {
    if (!previewCtx?.currentModel || !state.selectedAssetId || !state.manifestName) return;
    const parentAsset = getActiveAsset();
    if (!parentAsset) return;
    const splitUnits = collectAutoSplitUnits(previewCtx.currentModel, previewCtx.originalMaterials);
    const clusters = clusterMeshesByFootprint(splitUnits).filter((cluster) => cluster.length > 0);
    if (clusters.length <= 1) {
      showToast(root, "未检测到可拆分的独立子对象", "error");
      return;
    }
    const existingIds = new Set(state.assets.map((asset) => asset.asset_id));
    const payload: Array<{ asset_id: string; record: AssetRecord; glb_base64: string }> = [];
    autoSplitRecordsBtn.disabled = true;
    autoSplitRecordsBtn.textContent = "Splitting...";
    try {
      let subIndex = 1;
      for (const cluster of clusters) {
        const assetId = makeUniqueSubAssetId(parentAsset.asset_id, subIndex, existingIds);
        existingIds.add(assetId);
        const exported = buildClusterExport(cluster, previewCtx.originalMaterials);
        const glbData = await exportGlb(exported.scene);
        payload.push({
          asset_id: assetId,
          record: buildSubAssetRecord(
            parentAsset,
            assetId,
            subIndex,
            exported.dimensions,
            exported.faceCount,
            exported.vertexCount,
          ),
          glb_base64: arrayBufferToBase64(glbData),
        });
        subIndex += 1;
      }
      const createdAssets = await createAssetRecords(state.manifestName, payload);
      state.assets.unshift(...createdAssets);
      state.totalAssets += createdAssets.length;
      rebuildCategoryProfiles(state.assets);
      applyFilters();
      await refreshManifestAfterWrite(true);
      showToast(root, `已拆分并新增 ${createdAssets.length} 个子资产记录`);
    } catch (err) {
      showToast(root, `自动拆分失败: ${err}`, "error");
    } finally {
      autoSplitRecordsBtn.textContent = "Auto Split Records";
      updateActionButtons();
    }
  });
  extractSkyBtn.addEventListener("click", async () => {
    if (!previewCtx?.currentModel || !state.selectedAssetId || !state.manifestName) return;
    const parentAsset = getActiveAsset();
    if (!parentAsset) return;
    extractSkyBtn.disabled = true;
    extractSkyBtn.textContent = "Creating Sky...";
    try {
      const existingIds = new Set(state.assets.map((asset) => asset.asset_id));
      const assetId = makeUniqueAssetId(`${parentAsset.asset_id}-sky-dome`, existingIds);
      const splitUnits = collectAutoSplitUnits(previewCtx.currentModel, previewCtx.originalMaterials);
      const sphere = pickSkySphereCandidate(splitUnits);
      let mode: "extracted" | "procedural" = "procedural";
      let glbData: ArrayBuffer;
      let dimensions: DimensionRecord | null;
      let faceCount: number;
      let vertexCount: number;
      if (sphere) {
        const exported = buildClusterExport([sphere], previewCtx.originalMaterials);
        glbData = await exportGlb(exported.scene);
        dimensions = exported.dimensions;
        faceCount = exported.faceCount;
        vertexCount = exported.vertexCount;
        mode = "extracted";
      } else {
        const exported = createProceduralSkyDomeExport();
        glbData = await exportGlb(exported.scene);
        dimensions = exported.dimensions;
        faceCount = exported.faceCount;
        vertexCount = exported.vertexCount;
      }
      const createdAssets = await createAssetRecords(state.manifestName, [{
        asset_id: assetId,
        record: buildSkyDomeRecord(parentAsset, assetId, dimensions, faceCount, vertexCount, mode),
        glb_base64: arrayBufferToBase64(glbData),
      }]);
      state.assets.unshift(...createdAssets);
      state.totalAssets += createdAssets.length;
      rebuildCategoryProfiles(state.assets);
      applyFilters();
      await refreshManifestAfterWrite(true);
      showToast(root, mode === "extracted"
        ? "已提取天空球并创建 sky_dome 记录"
        : "未找到圆球，已生成程序化 sky_dome 记录");
    } catch (err) {
      showToast(root, `天空球创建失败: ${err}`, "error");
    } finally {
      extractSkyBtn.textContent = "Extract Sky Dome";
      updateActionButtons();
    }
  });
  splitBtn.addEventListener("click", async () => {
    if (!previewCtx?.currentModel || !state.selectedAssetId || !state.manifestName) return;
    const ctx = previewCtx;
    const currentModel = ctx.currentModel!;
    const parentAsset = getActiveAsset();
    if (!parentAsset) return;
    const allMeshes = collectModelMeshes(currentModel);
    const selectedByObjectList = allMeshes.filter((mesh) => state.selectedObjects.has(mesh.uuid));
    const selectedMeshes = Array.from(new Set([...Array.from(state.selectedMeshes), ...selectedByObjectList]));
    if (selectedMeshes.length === 0) {
      showToast(root, "No valid meshes selected", "error");
      return;
    }
    const splitUnits = selectedMeshes.flatMap((mesh) => splitMergedMeshByConnectivity(mesh, ctx.originalMaterials));
    const clusters = clusterMeshesByFootprint(splitUnits).filter((cluster) => cluster.length > 0);
    if (clusters.length === 0) {
      showToast(root, "No split clusters found", "error");
      return;
    }
    const existingIds = new Set(state.assets.map((asset) => asset.asset_id));
    const payload: Array<{ asset_id: string; record: AssetRecord; glb_base64: string }> = [];
    splitBtn.disabled = true;
    splitBtn.textContent = "Creating...";
    try {
      let subIndex = 1;
      for (const cluster of clusters) {
        const assetId = makeUniqueSubAssetId(parentAsset.asset_id, subIndex, existingIds);
        existingIds.add(assetId);
        const exported = buildClusterExport(cluster, ctx.originalMaterials);
        const glbData = await exportGlb(exported.scene);
        payload.push({
          asset_id: assetId,
          record: buildSubAssetRecord(
            parentAsset,
            assetId,
            subIndex,
            exported.dimensions,
            exported.faceCount,
            exported.vertexCount,
          ),
          glb_base64: arrayBufferToBase64(glbData),
        });
        subIndex += 1;
      }
      const createdAssets = await createAssetRecords(state.manifestName, payload);
      state.assets.unshift(...createdAssets);
      state.totalAssets += createdAssets.length;
      rebuildCategoryProfiles(state.assets);
      applyFilters();
      await refreshManifestAfterWrite(true);
      clearMeshSelection();
      state.selectedObjects.clear();
      renderObjectList();
      showToast(root, `已从选中对象新增 ${createdAssets.length} 个子资产记录`);
    } catch (err) {
      showToast(root, `拆分选中失败: ${err}`, "error");
    } finally {
      splitBtn.textContent = "Split Selected";
      updateActionButtons();
    }
  });
  function refreshAssetEditorLanguage(): void {
    currentLanguage = loadViewerLanguage();
    applyViewerTranslations(root, currentLanguage);
    if (leftPinButton) {
      leftPinButton.textContent = translateViewerKey(currentLanguage, "shell.pinned") ?? "Pinned";
      leftPinButton.title = translateViewerKey(currentLanguage, "shell.unpinLeft") ?? "Unpin left sidebar";
    }
    renderGallery();
    renderCandidateRepository();
    if (emptyState.style.display !== "none") {
      if (currentEmptyTranslation) {
        showTranslatedEmptyState(
          currentEmptyTranslation.titleKey,
          currentEmptyTranslation.messageKey,
          currentEmptyTranslation.detail,
        );
      } else {
        showEmptyState();
      }
    }
    updateOrientationStatus();
  }
  window.addEventListener(VIEWER_LANGUAGE_EVENT, refreshAssetEditorLanguage, { signal: languageController.signal });
  shell.sidebar.activate("asset-library");
  initManifests();
  return () => {
    destroyed = true;
    unsubscribeCandidateWorkflow?.();
    languageController.abort();
    clearDimensionAutosaveTimer();
    clearCurationAutosaveTimer();
    pendingDimensionAutosave = null;
    pendingCurationAutosave = null;
    if (previewCtx) {
      cancelAnimationFrame(previewCtx.animId);
      if (previewCtx.scaleBarGroup) {
        disposeScaleBar(previewCtx.scaleBarGroup);
        previewCtx.scaleBarGroup = null;
      }
      previewCtx.labelRenderer.domElement.remove();
      previewCtx.renderer.domElement.remove();
      previewCtx.renderer.dispose();
      previewCtx.controls.dispose();
      previewCtx.originalMaterials.clear();
      previewCtx = null;
    }
  };
}
