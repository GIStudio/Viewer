import type { DesktopShell } from "./desktop-shell";

export function mountAssetEditorShell(shell: DesktopShell): void {
shell.setHints([
  { key: "assetEditor.hints.pickManifest" },
  { key: "assetEditor.hints.centerWorkspace" },
  { key: "assetEditor.hints.rightInspector" },
]);
shell.setLeftSections([
  {
    id: "asset-library",
    title: "资产库",
    subtitle: "清单、筛选与检查",
    content: `
      <div class="desktop-shell-form-stack ae-library-controls">
        <label class="desktop-shell-field">
          <span data-i18n-key="assetEditor.manifest">Manifest</span>
          <select id="ae-manifest-select" class="ae-manifest-select" title="Manifest" data-i18n-title-key="assetEditor.manifest">
            <option value="">-- Select Manifest --</option>
          </select>
          <button id="ae-use-manifest-for-generation" class="ae-action-btn ae-btn-primary" type="button" disabled data-i18n-key="professional.assets.useManifest">Add to candidate repository</button>
          <span id="ae-generation-manifest-status" class="desktop-shell-field-note" data-i18n-key="professional.assets.useManifestHint">Select and inspect a manifest, then confirm it as the 3D preparation branch.</span>
        </label>
        <input id="ae-search" type="text" placeholder="Search assets..." class="ae-search-input" />
        <select id="ae-category-filter" class="ae-filter-select">
          <option value="">All Categories</option>
        </select>
        <select id="ae-tier-filter" class="ae-filter-select">
          <option value="">All Tiers</option>
          <option value="5">T5 — Excellent</option>
          <option value="4">T4 — Good</option>
          <option value="3">T3 — Production</option>
          <option value="2">T2 — Moderate</option>
          <option value="1">T1 — Low-poly</option>
          <option value="0">T0 — Unusable</option>
        </select>
        <select id="ae-eligibility-filter" class="ae-filter-select">
          <option value="">All Eligibility</option>
          <option value="eligible">Enabled for generation</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>
      <div class="asset-gallery-panel asset-gallery-panel-shell">
        <div class="ae-gallery-stats" id="ae-gallery-stats"></div>
        <div class="ae-bulk-toolbar" id="ae-bulk-toolbar">
          <button id="ae-select-filtered-btn" class="ae-bulk-btn" type="button">Select Filtered</button>
          <button id="ae-clear-selection-btn" class="ae-bulk-btn" type="button" disabled>Clear</button>
          <span class="ae-bulk-spacer"></span>
          <button id="ae-enable-selected-btn" class="ae-bulk-btn ae-bulk-btn-safe" type="button" disabled>Enable Selected</button>
          <button id="ae-disable-selected-btn" class="ae-bulk-btn ae-bulk-btn-danger" type="button" disabled>Disable Selected</button>
          <button id="ae-disable-filtered-btn" class="ae-bulk-btn ae-bulk-btn-danger" type="button" disabled>Disable Filtered</button>
          <button id="ae-disable-manifest-btn" class="ae-bulk-btn ae-bulk-btn-danger" type="button" disabled>Disable Manifest</button>
        </div>
        <div class="ae-asset-table-wrap">
          <table class="ae-asset-table">
            <thead>
              <tr>
                <th class="ae-select-cell"><input id="ae-select-all-filtered" type="checkbox" aria-label="Select all filtered assets" /></th>
                <th>Asset</th>
                <th>Category</th>
                <th>Status</th>
                <th>Tier</th>
                <th>Source</th>
                <th>Faces</th>
              </tr>
            </thead>
            <tbody id="ae-gallery-grid"></tbody>
          </table>
        </div>
        <div class="ae-load-more-section" id="ae-load-more-section" style="display:none;">
          <button id="ae-load-more-btn" class="ae-load-more-btn" type="button">Load More</button>
          <span id="ae-load-more-info" class="ae-load-more-info"></span>
        </div>
      </div>
    `,
    open: true,
  },
  {
    id: "asset-candidates",
    title: "候选仓库",
    subtitle: "用于 02 场景生成",
    content: `
      <section class="ae-candidate-repository" aria-labelledby="ae-candidate-repository-title">
        <header>
          <span>01B / CANDIDATE REPOSITORY</span>
          <h3 id="ae-candidate-repository-title">本次候选资产仓库</h3>
          <p>这些资产会进入检索池，但不保证出现在最终场景中。</p>
        </header>
        <div id="ae-candidate-repository-summary" class="ae-candidate-summary" role="status"></div>
        <div id="ae-candidate-repository-list" class="ae-candidate-list"></div>
      </section>
    `,
  },
]);
shell.setRightTabs(
  [
    {
      id: "metadata",
      label: "Metadata",
      content: `
        <section class="ae-info-section" id="ae-info-section">
          <h3 class="ae-section-title">Asset Information</h3>
          <div class="ae-info-grid" id="ae-info-grid"></div>
        </section>
      `,
    },
    {
      id: "objects",
      label: "Objects",
      content: `
        <section class="ae-objects-section" id="ae-objects-section" style="display:none;">
          <h3 class="ae-section-title">Scene Objects <span id="ae-dup-count" class="ae-dup-badge" style="display:none;"></span></h3>
          <div class="ae-object-list" id="ae-object-list"></div>
        </section>
      `,
    },
    {
      id: "export",
      label: "Export",
      content: `
        <div class="ae-actions-bar ae-actions-bar-shell">
          <button id="ae-save-btn" class="ae-action-btn ae-btn-primary" disabled>Save</button>
          <button id="ae-export-btn" class="ae-action-btn">Export GLB</button>
          <span class="ae-actions-sep"></span>
          <div class="ae-scale-group">
            <label class="ae-scale-label">Scale:</label>
            <input id="ae-scale-input" type="number" class="ae-scale-input" value="1" min="0.01" max="100" step="0.1" />
          </div>
          <div class="ae-orientation-group">
            <label class="ae-yaw-label">Yaw (°):</label>
            <input id="ae-yaw-input" type="number" class="ae-yaw-input" value="0" min="-180" max="360" step="1" />
          </div>
          <div class="ae-front-group">
            <label class="ae-front-label">Front:</label>
            <select id="ae-front-select" class="ae-front-select">
              <option value="+X">+X</option>
              <option value="-X">-X</option>
              <option value="+Z" selected>+Z</option>
              <option value="-Z">-Z</option>
            </select>
          </div>
          <div id="ae-orientation-status" class="ae-orientation-status">Road +T/-T: ±X · Face road: +Z</div>
          <span class="ae-actions-sep"></span>
          <button id="ae-remove-dups-btn" class="ae-action-btn ae-btn-warning" disabled>Remove Duplicates</button>
          <button id="ae-auto-split-records-btn" class="ae-action-btn ae-btn-secondary" disabled>Auto Split Records</button>
          <button id="ae-backend-split-btn" class="ae-action-btn ae-btn-primary" disabled>Backend Auto Split</button>
          <button id="ae-extract-sky-btn" class="ae-action-btn ae-btn-secondary" disabled>Extract Sky Dome</button>
          <button id="ae-split-btn" class="ae-action-btn ae-btn-secondary" disabled>Split Selected</button>
        </div>
      `,
    },
  ],
  "metadata",
);
shell.statusStatusHost.innerHTML = `<div class="desktop-shell-inline-status" data-i18n-key="assetEditor.status.ready">Asset editor ready.</div>`;
shell.setStatusSummary({ key: "assetEditor.status.ready" });
shell.centerStage.innerHTML = `
  <div class="asset-editor-shell-stage">
    <div id="ae-empty-state" class="ae-empty-state">
      <div class="ae-empty-icon">&#9881;</div>
      <strong id="ae-empty-title">正在连接真实 3D 资产检查器</strong>
      <p id="ae-empty-message">正在恢复资产清单并加载首个可检查模型。</p>
    </div>
    <div class="ae-detail-content" id="ae-detail-content" style="display:none;">
      <div class="ae-preview-section">
        <div class="ae-preview-toolbar">
          <button id="ae-mode-solid" class="ae-toolbar-btn active" title="Solid render">Solid</button>
          <button id="ae-mode-wire" class="ae-toolbar-btn" title="Wireframe">Wire</button>
          <span class="ae-toolbar-sep"></span>
          <button id="ae-toggle-bbox" class="ae-toolbar-btn" title="Bounding box">BBox</button>
          <button id="ae-zoom-fit" class="ae-toolbar-btn" title="Zoom to fit">Fit</button>
          <span class="ae-toolbar-sep"></span>
          <button id="ae-toggle-select" class="ae-toolbar-btn" title="Rectangle selection mode">Select</button>
          <button id="ae-delete-selected" class="ae-toolbar-btn ae-btn-danger" title="Delete selected objects" disabled>Delete</button>
          <span class="ae-toolbar-sep"></span>
          <button id="ae-delete-record" class="ae-toolbar-btn ae-btn-danger" title="Delete this asset from manifest" disabled>Del Record</button>
        </div>
        <div class="ae-preview-canvas" id="ae-preview-canvas"></div>
      </div>
    </div>
    <div id="ae-detail-panel" hidden></div>
    <button id="ae-back-btn" type="button" hidden>Back to Viewer</button>
  </div>
`;
}
