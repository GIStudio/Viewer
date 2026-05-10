export function renderViewerSettingsPanelHtml(): string {
  return `
    <aside id="viewer-settings-panel" class="viewer-settings-panel" data-open="false">
      <div class="viewer-settings-header">
        <div>
          <div class="viewer-settings-title" data-i18n-key="viewer.settings.title">Display Settings</div>
          <div class="viewer-settings-subtitle" data-i18n-key="viewer.settings.subtitle">Light presets, shadows, and laser pointer</div>
        </div>
        <button id="viewer-settings-close" class="viewer-settings-close" type="button" aria-label="Close settings" data-i18n-aria-label-key="viewer.settings.close">x</button>
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-settings-label" for="lighting-preset" data-i18n-key="viewer.settings.lightingPreset">Lighting Preset</label>
        <select id="lighting-preset" class="viewer-select viewer-select-compact"></select>
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-range-label" for="lighting-exposure">
          <span data-i18n-key="viewer.settings.exposure">Exposure</span>
          <span id="lighting-exposure-value"></span>
        </label>
        <input id="lighting-exposure" class="viewer-range" type="range" min="0.5" max="2.0" step="0.05" />
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-range-label" for="lighting-key">
          <span data-i18n-key="viewer.settings.keyLight">Key Light Intensity</span>
          <span id="lighting-key-value"></span>
        </label>
        <input id="lighting-key" class="viewer-range" type="range" min="0.2" max="2.0" step="0.05" />
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-range-label" for="lighting-fill">
          <span data-i18n-key="viewer.settings.fillLight">Fill Light Intensity</span>
          <span id="lighting-fill-value"></span>
        </label>
        <input id="lighting-fill" class="viewer-range" type="range" min="0.1" max="1.6" step="0.05" />
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-range-label" for="lighting-warmth">
          <span data-i18n-key="viewer.settings.warmth">Warmth</span>
          <span id="lighting-warmth-value"></span>
        </label>
        <input id="lighting-warmth" class="viewer-range" type="range" min="-1" max="1" step="0.05" />
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-range-label" for="lighting-shadow">
          <span>Shadow Strength</span>
          <span id="lighting-shadow-value"></span>
        </label>
        <input id="lighting-shadow" class="viewer-range" type="range" min="0" max="1" step="0.05" />
      </div>
      <div class="viewer-settings-section viewer-settings-section-divider viewer-environment-section">
        <div class="viewer-settings-group-title">Environment / 环境</div>
        <label class="viewer-settings-label" for="environment-weather">Weather / 天气</label>
        <select id="environment-weather" class="viewer-select viewer-select-compact"></select>
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-range-label" for="environment-intensity">
          <span>Intensity / 强度</span>
          <span id="environment-intensity-value"></span>
        </label>
        <input id="environment-intensity" class="viewer-range" type="range" min="0" max="1" step="0.05" />
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-range-label" for="environment-time">
          <span>Time of Day / 日照时间</span>
          <span id="environment-time-value"></span>
        </label>
        <input id="environment-time" class="viewer-range" type="range" min="0" max="24" step="0.25" />
      </div>
      <div class="viewer-settings-section">
        <button id="environment-sun-cycle-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="environment-sun-cycle-enabled" aria-pressed="false">Animate Sun / 日照动画</button>
        <input id="environment-sun-cycle-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <label class="viewer-settings-label" for="environment-sun-cycle-speed">Cycle Speed / 循环速度</label>
        <select id="environment-sun-cycle-speed" class="viewer-select viewer-select-compact"></select>
      </div>
      <div class="viewer-settings-section viewer-settings-section-divider">
        <button id="third-person-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="third-person-enabled" aria-pressed="false">Third Person Camera</button>
        <input id="third-person-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="frame-mode-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="frame-mode-enabled" aria-pressed="false">Frame Mode (Show Boundaries)</button>
        <input id="frame-mode-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="asset-bbox-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="asset-bbox-enabled" aria-pressed="false">Asset BBoxes</button>
        <input id="asset-bbox-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="asset-move-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="asset-move-enabled" aria-pressed="false">Asset Move Mode</button>
        <input id="asset-move-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="laser-pointer-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="laser-pointer-enabled" aria-pressed="false">Laser Pointer</button>
        <input id="laser-pointer-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="graph-overlay-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="graph-overlay-enabled" aria-pressed="false">Graph Overlay</button>
        <input id="graph-overlay-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="layout-overlay-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="layout-overlay-enabled" aria-pressed="false">Scene Overlay</button>
        <input id="layout-overlay-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="analysis-overlay-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="analysis-overlay-enabled" aria-pressed="false">Analysis Overlay</button>
        <input id="analysis-overlay-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="diorama-finish-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="diorama-finish-enabled" aria-pressed="false">Diorama Finish</button>
        <input id="diorama-finish-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
      <div class="viewer-settings-section">
        <button id="audio-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="audio-enabled" aria-pressed="false">Ambient Audio</button>
        <input id="audio-enabled" class="viewer-toggle-input" type="checkbox" />
      </div>
    </aside>
  `;
}
