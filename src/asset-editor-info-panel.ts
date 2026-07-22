import type { AssetEditorState, AssetRecord, CategoryDimensionValidation, DimensionRecord } from "./asset-editor-model";
import { escapeHtml, formatCategoryRangeLine, formatDimension, formatTagInput, getRangeSourceLabel, validateCategoryDimension } from "./asset-editor-model";
import type { PreviewContext } from "./asset-editor-preview";
import { getBottomCenterOffset, needsBottomCenterOriginFix } from "./asset-editor-preview";

export type AssetInfoPanelDeps = {
  infoGrid: HTMLElement; previewCtx: PreviewContext | null; state: AssetEditorState;
  getAssetDimensions: (asset?: AssetRecord | null) => DimensionRecord | null;
  formatOriginVector: (offset: import("three").Vector3 | null) => string;
  getOriginStatusText: (offset: import("three").Vector3 | null) => string;
  getDimensionValidationStatusText: (value: CategoryDimensionValidation) => string;
  setCurationSaveStatus: (message: string, mode?: "idle" | "saving" | "saved" | "error") => void;
  updateEligibleToolbar: (asset?: AssetRecord | null) => void;
};

export function renderAssetInfoPanel(asset: AssetRecord, deps: AssetInfoPanelDeps): void {
  const { infoGrid, previewCtx, state, getAssetDimensions, formatOriginVector, getOriginStatusText, getDimensionValidationStatusText, setCurationSaveStatus, updateEligibleToolbar } = deps;
  const fCount = asset.face_count ?? asset.mesh_face_count ?? 0;
  const vCount = asset.vertex_count ?? asset.quality_metrics?.vertex_count ?? 0;
  const dims = getAssetDimensions(asset) ?? state.modelDimensions;
  const validation = validateCategoryDimension(dims, asset.category);
  const validationText = dims ? getDimensionValidationStatusText(validation) : "尚未获取当前尺寸样本。";
  const originOffset = previewCtx?.currentModel ? getBottomCenterOffset(previewCtx.currentModel) : null;
  const originNeedsFix = needsBottomCenterOriginFix(originOffset);
  updateEligibleToolbar(asset);
  setCurationSaveStatus("修改后会自动保存到元数据", "idle");

  infoGrid.innerHTML = `
    <div class="ae-info-row ae-info-label">Asset ID</div>
    <div class="ae-info-row ae-info-value ae-mono">${asset.asset_id}</div>

    <div class="ae-info-row ae-info-label">Category</div>
    <div class="ae-info-row ae-info-value">${asset.category ?? "-"}</div>

    <div class="ae-info-row ae-info-label">范围档位</div>
    <div class="ae-info-row ae-info-value">${validation.profile.name} · ${getRangeSourceLabel(validation)}</div>

    <div class="ae-info-row ae-info-label">Source</div>
    <div class="ae-info-row ae-info-value">${asset.source ?? "-"}</div>

    <div class="ae-info-row ae-info-label">License</div>
    <div class="ae-info-row ae-info-value">${asset.license ?? "-"}</div>

    <div class="ae-info-row ae-info-label">Faces / Vertices</div>
    <div class="ae-info-row ae-info-value ae-mono">${fCount.toLocaleString()} / ${vCount.toLocaleString()}</div>

    <div class="ae-info-row ae-info-label">Dimensions (m)</div>
    <div class="ae-info-row ae-info-value">
      <div class="ae-dims-scaler" id="ae-dims-scaler">
            <div class="ae-dims-inputs">
          <label class="ae-dims-field">
            <span class="ae-dims-field-label">W</span>
            <input type="number" id="ae-dim-w" class="ae-dims-input" step="0.01" min="0.01" value="${formatDimension(dims?.width)}" ${dims ? "" : "disabled"} />
          </label>
          <label class="ae-dims-field">
            <span class="ae-dims-field-label">H</span>
            <input type="number" id="ae-dim-h" class="ae-dims-input" step="0.01" min="0.01" value="${formatDimension(dims?.height)}" ${dims ? "" : "disabled"} />
          </label>
          <label class="ae-dims-field">
            <span class="ae-dims-field-label">D</span>
            <input type="number" id="ae-dim-d" class="ae-dims-input" step="0.01" min="0.01" value="${formatDimension(dims?.depth)}" ${dims ? "" : "disabled"} />
          </label>
        </div>
        <div class="ae-dims-slider-row">
          <span class="ae-dims-slider-label">Scale</span>
          <input type="range" id="ae-dims-slider" class="ae-dims-slider" min="0.1" max="10" step="0.01" value="1" ${dims ? "" : "disabled"} />
          <span class="ae-dims-slider-value" id="ae-dims-slider-val">1.00x</span>
        </div>
      </div>
    </div>

    <div class="ae-info-row ae-info-label">类别尺寸范围</div>
    <div class="ae-info-row ae-info-value">
      <div id="ae-dim-range-text">${formatCategoryRangeLine(validation.profile)}</div>
      <div id="ae-dim-range-status" class="ae-dim-range-status ${validation.violations.length === 0 ? "ok" : "warn"}">${validationText}</div>
      <div id="ae-dim-range-hint" class="ae-dim-range-hint">${dims ? (validation.violations.length > 0 ? `建议缩放: ${formatDimension(validation.suggestedScale)}x` : "当前已符合范围") : "等待模型加载完成后计算建议。"}</div>
      <button id="ae-auto-range-btn" class="ae-action-btn ${validation.violations.length === 0 ? "ae-btn-secondary" : "ae-btn-warning"}" type="button" ${dims ? (validation.violations.length > 0 ? "" : "disabled") : "disabled"}>${validation.violations.length > 0 ? `一键修正 (${formatDimension(validation.suggestedScale)}x)` : "当前符合范围"}</button>
    </div>

    <div class="ae-info-row ae-info-label">Origin Alignment</div>
    <div class="ae-info-row ae-info-value">
      <div id="ae-origin-status" class="ae-dim-range-status ${originNeedsFix ? "warn" : "ok"}">${getOriginStatusText(originOffset)}</div>
      <div id="ae-origin-offset" class="ae-dim-range-hint">Bottom center: ${formatOriginVector(originOffset)}</div>
      <label class="ae-dims-field" style="margin-top:8px;">
        <input id="ae-origin-auto-align" type="checkbox" ${state.originAutoAlignEnabled ? "checked" : ""} />
        <span class="ae-dims-field-label">Auto align on load</span>
      </label>
      <div class="ae-actions-bar" style="margin-top:8px;">
        <button id="ae-align-origin-btn" class="ae-action-btn ${originNeedsFix ? "ae-btn-warning" : "ae-btn-secondary"}" type="button" ${originNeedsFix ? "" : "disabled"}>Align & Save Now</button>
        <button id="ae-rotate-cw-btn" class="ae-action-btn ae-btn-secondary" type="button">顺时针旋转90°</button>
        <button id="ae-drag-move-toggle" class="ae-action-btn ae-btn-secondary ${state.dragMoveMode ? "active" : ""}" type="button">${state.dragMoveMode ? "Drag Move: On" : "Drag Move: Off"}</button>
      </div>
      <div class="ae-dim-range-hint">Drag Move 开启后，在预览区点击拖动物体；松开鼠标会保存当前坐标。</div>
    </div>

    <div class="ae-info-row ae-info-label">已加载样本</div>
    <div class="ae-info-row ae-info-value">${validation.sampleCount > 0 ? `${validation.sampleCount} 条（当前分类）` : "无匹配样本，使用通用规则"}</div>

    <div class="ae-info-row ae-info-label">Mesh Path</div>
    <div class="ae-info-row ae-info-value ae-mono ae-path">${asset.mesh_path ?? "-"}</div>

    <div class="ae-info-row ae-info-label">Description</div>
    <div class="ae-info-row ae-info-value ae-desc">${asset.text_desc ?? "-"}</div>

    <div class="ae-info-row ae-info-label">入库审核</div>
    <div class="ae-info-row ae-info-value">
      <div class="ae-curation-panel">
        <label class="ae-dims-field" style="margin-top:8px;">
          <span class="ae-dims-field-label">Quality Tier</span>
          <select id="ae-edit-tier" class="ae-edit-select">
            <option value="">--</option>
            ${[1, 2, 3, 4, 5].map((t) => `<option value="${t}" ${asset.quality_tier === t ? "selected" : ""}>Tier ${t}</option>`).join("")}
          </select>
        </label>

        <label class="ae-dims-field" style="margin-top:8px;">
          <span class="ae-dims-field-label">统一 Tags</span>
          <input id="ae-edit-tags" type="text" class="ae-edit-input" placeholder="tree, road_edge, low_poly" value="${escapeHtml(formatTagInput(asset.tags))}" />
        </label>

        <label class="ae-dims-field" style="margin-top:8px;">
          <span class="ae-dims-field-label">Style Tags</span>
          <input id="ae-edit-style-tags" type="text" class="ae-edit-input" placeholder="realistic, clean, damaged" value="${escapeHtml(formatTagInput(asset.style_tags))}" />
        </label>

        <label class="ae-dims-field" style="margin-top:8px;">
          <span class="ae-dims-field-label">Theme Tags</span>
          <input id="ae-edit-theme-tags" type="text" class="ae-edit-input" placeholder="urban, park, industrial" value="${escapeHtml(formatTagInput(asset.theme_tags))}" />
        </label>

        <label class="ae-dims-field" style="margin-top:8px;">
          <span class="ae-dims-field-label">不适合原因</span>
          <textarea id="ae-edit-exclusion-reason" class="ae-edit-input" rows="2" placeholder="例如：灰模、偏移严重、组合资产未拆分、尺度不可信">${escapeHtml(String(asset.scene_exclusion_reason ?? ""))}</textarea>
        </label>

        <label class="ae-dims-field" style="margin-top:8px;">
          <span class="ae-dims-field-label">审核备注</span>
          <textarea id="ae-edit-curation-notes" class="ae-edit-input" rows="2" placeholder="补充说明，可写后续处理建议">${escapeHtml(String(asset.curation_notes ?? ""))}</textarea>
        </label>
      </div>
    </div>
  `;
}
