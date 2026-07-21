export function renderViewerSettingsPanelHtml(): string {
  return `
    <aside id="viewer-settings-panel" class="viewer-settings-panel" data-open="false" aria-hidden="true" aria-labelledby="viewer-settings-title">
      <div class="viewer-settings-header">
        <div>
          <div class="viewer-settings-eyebrow">VISUAL SYSTEM · P</div>
          <div id="viewer-settings-title" class="viewer-settings-title" data-i18n-key="viewer.settings.title">Display Settings</div>
          <div class="viewer-settings-subtitle" data-i18n-key="viewer.settings.subtitle">Light presets, shadows, and laser pointer</div>
        </div>
        <button id="viewer-settings-close" class="viewer-settings-close" type="button" aria-label="Close settings" data-i18n-aria-label-key="viewer.settings.close">×</button>
      </div>

      <div class="viewer-settings-body">
        <section class="viewer-settings-group" aria-labelledby="viewer-settings-lighting-title">
          <header class="viewer-settings-group-head">
            <div>
              <span class="viewer-settings-group-index">01 / LIGHTING</span>
              <h3 id="viewer-settings-lighting-title" class="viewer-settings-group-title">光照 / Lighting</h3>
            </div>
            <small>预设决定基础照明；参数可继续精调。</small>
          </header>
          <div class="viewer-settings-grid">
            <div class="viewer-settings-section viewer-settings-section-wide">
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
            <div class="viewer-settings-section viewer-settings-section-wide">
              <label class="viewer-range-label" for="lighting-shadow">
                <span data-i18n-key="viewer.settings.shadow">Shadow Strength</span>
                <span id="lighting-shadow-value"></span>
              </label>
              <input id="lighting-shadow" class="viewer-range" type="range" min="0" max="1" step="0.05" />
            </div>
          </div>
        </section>

        <section class="viewer-settings-group" aria-labelledby="viewer-settings-environment-title">
          <header class="viewer-settings-group-head">
            <div>
              <span class="viewer-settings-group-index">02 / ENVIRONMENT</span>
              <h3 id="viewer-settings-environment-title" class="viewer-settings-group-title" data-i18n-key="viewer.settings.environment">Environment</h3>
            </div>
            <small>天气效果与模拟太阳时间。</small>
          </header>
          <div class="viewer-settings-grid">
            <div class="viewer-settings-section">
              <label class="viewer-settings-label" for="environment-weather" data-i18n-key="viewer.settings.weather">Weather</label>
              <select id="environment-weather" class="viewer-select viewer-select-compact"></select>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-settings-label" for="environment-sun-cycle-speed" data-i18n-key="viewer.settings.cycleSpeed">Cycle Speed</label>
              <select id="environment-sun-cycle-speed" class="viewer-select viewer-select-compact"></select>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="environment-intensity">
                <span data-i18n-key="viewer.settings.weatherIntensity">Weather Effect Strength</span>
                <span id="environment-intensity-value"></span>
              </label>
              <input id="environment-intensity" class="viewer-range" type="range" min="0" max="1" step="0.05" />
              <small class="viewer-setting-control-hint" data-i18n-key="viewer.settings.weatherIntensityHint">Controls how pronounced overcast, rain, or fog appears. Clear weather stays at 0.</small>
            </div>
            <div class="viewer-settings-section">
              <label class="viewer-range-label" for="environment-time">
                <span data-i18n-key="viewer.settings.simulatedTime">Simulated Time</span>
                <span id="environment-time-value"></span>
              </label>
              <input id="environment-time" class="viewer-range" type="range" min="0" max="24" step="0.25" />
              <small class="viewer-setting-control-hint" data-i18n-key="viewer.settings.simulatedTimeHint">Controls the simulated sun position and shadow direction, from 0 to 24 hours.</small>
            </div>
            <div class="viewer-settings-section viewer-settings-section-wide">
              <button id="environment-sun-cycle-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="environment-sun-cycle-enabled" aria-pressed="false" data-i18n-key="viewer.settings.animateSun">Animate Sun</button>
              <input id="environment-sun-cycle-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
          </div>
        </section>

        <section class="viewer-settings-group" aria-labelledby="viewer-settings-tools-title">
          <header class="viewer-settings-group-head">
            <div>
              <span class="viewer-settings-group-index">03 / VIEW + TOOLS</span>
              <h3 id="viewer-settings-tools-title" class="viewer-settings-group-title">视图与工具 / View &amp; Tools</h3>
            </div>
            <small>激活的模式以深墨蓝和黄色底线标记。</small>
          </header>
          <div class="viewer-settings-toggle-group" role="group" aria-label="Viewer display toggles" data-i18n-aria-label-key="viewer.settings.toggleGroup">
            <div class="viewer-settings-toggle-section">
              <button id="third-person-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="third-person-enabled" aria-pressed="false" aria-label="Third Person Camera" data-i18n-key="viewer.settings.thirdPerson" data-i18n-aria-label-key="viewer.settings.thirdPerson">Third Person</button>
              <input id="third-person-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="frame-mode-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="frame-mode-enabled" aria-pressed="false" aria-label="Frame Mode (Show Boundaries)" data-i18n-key="viewer.settings.frame" data-i18n-aria-label-key="viewer.settings.frame">Frame</button>
              <input id="frame-mode-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="asset-bbox-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="asset-bbox-enabled" aria-pressed="false" aria-label="Asset BBoxes" data-i18n-key="viewer.settings.bboxes" data-i18n-aria-label-key="viewer.settings.bboxes">BBoxes</button>
              <input id="asset-bbox-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="asset-move-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="asset-move-enabled" aria-pressed="false" aria-label="Scene Object Editor" data-i18n-key="viewer.settings.move" data-i18n-aria-label-key="viewer.settings.move">Edit Objects</button>
              <input id="asset-move-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="laser-pointer-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="laser-pointer-enabled" aria-pressed="false" aria-label="Laser Pointer" data-i18n-key="viewer.settings.laser" data-i18n-aria-label-key="viewer.settings.laser">Laser</button>
              <input id="laser-pointer-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="graph-overlay-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="graph-overlay-enabled" aria-pressed="false" aria-label="Graph Overlay" data-i18n-key="viewer.settings.graph" data-i18n-aria-label-key="viewer.settings.graph">Graph</button>
              <input id="graph-overlay-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="layout-overlay-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="layout-overlay-enabled" aria-pressed="false" aria-label="Scene Overlay" data-i18n-key="viewer.settings.scene" data-i18n-aria-label-key="viewer.settings.scene">Scene</button>
              <input id="layout-overlay-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="analysis-overlay-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="analysis-overlay-enabled" aria-pressed="false" aria-label="Analysis Overlay" data-i18n-key="viewer.settings.analysis" data-i18n-aria-label-key="viewer.settings.analysis">Analysis</button>
              <input id="analysis-overlay-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="diorama-finish-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="diorama-finish-enabled" aria-pressed="false" aria-label="Diorama Finish" data-i18n-key="viewer.settings.diorama" data-i18n-aria-label-key="viewer.settings.diorama">Diorama</button>
              <input id="diorama-finish-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
            <div class="viewer-settings-toggle-section">
              <button id="audio-toggle-btn" class="viewer-toggle-button" type="button" data-toggle-input="audio-enabled" aria-pressed="false" aria-label="Ambient Audio" data-i18n-key="viewer.settings.audio" data-i18n-aria-label-key="viewer.settings.audio">Audio</button>
              <input id="audio-enabled" class="viewer-toggle-input" type="checkbox" />
            </div>
          </div>
          <div class="viewer-settings-editing">
            <div>
              <div class="viewer-settings-group-title">Scene object editing / 场景地物编辑</div>
              <p class="viewer-settings-note">编辑与全资产库入口已固定在画布右上角。选择树木或街具后可移动、旋转、缩放或原位替换。</p>
            </div>
          </div>
        </section>

        <section class="viewer-settings-group" aria-labelledby="viewer-settings-overlay-title">
          <header class="viewer-settings-group-head">
            <div>
              <span class="viewer-settings-group-index">04 / SEMANTIC OVERLAY</span>
              <h3 id="viewer-settings-overlay-title" class="viewer-settings-group-title">语义叠加 / Floating Lane</h3>
            </div>
            <small>在场景上叠加道路、建筑与街道要素的语义结构，仅用于浏览与检查。</small>
          </header>
          <div id="viewer-floating-lane-panel-host" class="viewer-settings-floating-lane-host"></div>
        </section>

        <section class="viewer-settings-group" aria-labelledby="viewer-settings-advanced-title">
          <header class="viewer-settings-group-head">
            <div>
              <span class="viewer-settings-group-index">05 / ADVANCED</span>
              <h3 id="viewer-settings-advanced-title" class="viewer-settings-group-title">高级 / Advanced</h3>
            </div>
            <small>服务器能力与持久化场景编辑命令。</small>
          </header>
          <details class="viewer-advanced-settings">
            <summary>Advanced workflow / 高级工作流</summary>
            <div class="viewer-settings-advanced-body">
              <div class="viewer-settings-group-title">Server capabilities</div>
              <div id="viewer-capability-status" class="viewer-capability-status">Checking server capabilities…</div>
              <div class="viewer-settings-group-title">Persistent scene edit commands / 场景编辑命令</div>
              <p class="viewer-settings-note">支持移动、旋转、缩放、新增、复制、删除和替换。道路、路口、OSM 建筑白模与背景地面保持锁定。</p>
              <textarea id="viewer-scene-command-json" class="viewer-command-json" rows="12" spellcheck="false">{
  "layout_path": "",
  "base": { "revision": 0, "sha256": "" },
  "commands": [{
    "command_id": "manual-move-1",
    "op": "move_instance",
    "instance_id": "",
    "position_xyz": [0, 0, 0]
  }]
}</textarea>
              <div class="viewer-settings-command-actions">
                <button id="viewer-scene-command-submit" class="stage-toolbar-button stage-toolbar-button-primary" type="button">Submit command</button>
                <button id="viewer-scene-command-undo" class="stage-toolbar-button" type="button" disabled>Undo last edit</button>
              </div>
              <div id="viewer-scene-command-status" class="viewer-settings-note">Load a durable generated layout to edit.</div>
            </div>
          </details>
        </section>
      </div>
    </aside>
  `;
}
