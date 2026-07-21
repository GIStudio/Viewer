import { DEFAULT_EVALUATION_CONFIG } from "../viewer-evaluation";
import { renderHelpPanelHtml } from "./helpPanel";

export function EvaluatePanelShell() {
  return (
    <aside id="viewer-evaluate-panel" className="viewer-slide-panel" data-open="false">
      <div className="viewer-slide-panel-header">
        <div>
          <div className="viewer-slide-panel-title" data-i18n-key="viewer.evaluate.title">
            Design Evaluation
          </div>
          <div className="viewer-slide-panel-subtitle" data-i18n-key="viewer.evaluate.subtitle">
            Engineering proxies, generation QA, and declared visual evidence
          </div>
        </div>
        <button id="viewer-evaluate-close" className="viewer-settings-close" type="button" aria-label="Close evaluation" data-shell-modal-close>
          x
        </button>
      </div>
      <section id="viewer-evaluate-gate" className="viewer-evaluate-gate" role="status" data-state="ready" hidden>
        <strong data-evaluate-gate-title />
        <span data-evaluate-gate-detail />
        <button type="button" data-evaluate-gate-action />
      </section>
      <div className="viewer-evaluate-scope-note" role="note">
        <strong data-i18n-key="viewer.evaluate.scopeTitle">Diagnostic scope</strong>
        <span data-i18n-key="viewer.evaluate.scopeBody">
          Scores are comparative proxies, not validated safety, beauty, accessibility, or planning outcomes. Missing evidence remains N/A.
        </span>
      </div>
      <section className="viewer-used-assets" aria-labelledby="viewer-evaluate-used-assets-title">
        <header>
          <strong id="viewer-evaluate-used-assets-title">本次实际采用资产</strong>
          <small>与生成前的候选仓库分开记录</small>
        </header>
        <div id="viewer-evaluate-used-assets">生成场景后显示实际放置的资产。</div>
      </section>
      <details id="viewer-evaluation-parameters" className="viewer-evaluation-parameters">
        <summary>
          <span>
            <strong data-i18n-key="viewer.evaluate.parameters.title">Evaluation parameters</strong>
            <small data-i18n-key="viewer.evaluate.parameters.advanced">Advanced</small>
          </span>
          <span className="viewer-evaluation-parameters-chevron" aria-hidden="true">+</span>
        </summary>
        <div className="viewer-evaluation-parameters-body">
          <p className="viewer-evaluation-parameters-note" data-i18n-key="viewer.evaluate.parameters.note">
            Raw composite weights normalize automatically. These parameters are diagnostic defaults, not validated outcomes.
          </p>
          <div id="viewer-evaluation-parameters-error" className="viewer-evaluation-parameters-error" role="alert" hidden />
          <fieldset className="viewer-evaluation-parameter-group">
            <legend data-i18n-key="viewer.evaluate.parameters.weights">Composite weights</legend>
            <div className="viewer-evaluation-parameter-grid viewer-evaluation-weight-grid">
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.walkabilityWeight">Walkability</span>
                <input id="viewer-evaluation-weight-walkability" type="number" min="0" max="1000000" step="0.1" defaultValue={DEFAULT_EVALUATION_CONFIG.aggregation.dimension_weights.walkability} />
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.safetyWeight">Safety</span>
                <input id="viewer-evaluation-weight-safety" type="number" min="0" max="1000000" step="0.1" defaultValue={DEFAULT_EVALUATION_CONFIG.aggregation.dimension_weights.safety} />
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.beautyWeight">Beauty</span>
                <input id="viewer-evaluation-weight-beauty" type="number" min="0" max="1000000" step="0.1" defaultValue={DEFAULT_EVALUATION_CONFIG.aggregation.dimension_weights.beauty} />
              </label>
            </div>
          </fieldset>
          <fieldset className="viewer-evaluation-parameter-group">
            <legend data-i18n-key="viewer.evaluate.parameters.walkability">Walkability diagnostics</legend>
            <div className="viewer-evaluation-parameter-grid">
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.clearWidthMin">Clear width min</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-clear-width-min" type="number" min="0" max="100" step="0.1" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.clear_width_min} /><small>m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.clearWidthIdeal">Clear width ideal</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-clear-width-ideal" type="number" min="0.01" max="100" step="0.1" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.clear_width_ideal} /><small>m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.furnitureArea">Furniture area threshold</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-furniture-area" type="number" min="0.001" max="10" step="0.01" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.amenity_density_ideal} /><small>m²/m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.amenityCount">Amenity count density</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-amenity-count" type="number" min="0.001" max="10" step="0.01" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.amenity_count_density_ideal} /><small>/m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.lampSpacing">Lamp spacing</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-lamp-spacing" type="number" min="0.01" max="5000" step="1" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.lamp_spacing_m} /><small>m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.transitSpacing">Transit stop spacing</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-transit-spacing" type="number" min="0.01" max="5000" step="10" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.transit_stop_spacing_m} /><small>m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.crossingSpacing">Crossing spacing</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-crossing-spacing" type="number" min="0.01" max="5000" step="5" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.crossing_spacing_m} /><small>m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.entranceDensity">Entrance density</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-entrance-density" type="number" min="0.001" max="10" step="0.01" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.entrance_density_ideal} /><small>/m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.treeGrid">Tree grid resolution</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-tree-grid" type="number" min="0.01" max="10" step="0.1" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.tree_shade_grid_resolution_m} /><small>m</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.sunAzimuth">Sun azimuth</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-sun-azimuth" type="number" min="0" max="359.999" step="1" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.tree_sun_azimuth_deg} /><small>°</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.sunElevation">Sun elevation</span>
                <span className="viewer-evaluation-number"><input id="viewer-evaluation-sun-elevation" type="number" min="1" max="90" step="1" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.tree_sun_elevation_deg} /><small>°</small></span>
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.canopyCenter">Canopy center-height ratio</span>
                <input id="viewer-evaluation-canopy-center" type="number" min="0.001" max="1" step="0.05" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.tree_canopy_center_height_ratio} />
              </label>
              <label>
                <span data-i18n-key="viewer.evaluate.parameters.canopyVertical">Canopy vertical ratio</span>
                <input id="viewer-evaluation-canopy-vertical" type="number" min="0.001" max="0.5" step="0.05" defaultValue={DEFAULT_EVALUATION_CONFIG.walkability.tree_canopy_vertical_ratio} />
              </label>
            </div>
          </fieldset>
          <button id="viewer-evaluation-reset" className="viewer-evaluation-reset" type="button" data-i18n-key="viewer.evaluate.parameters.reset">
            Reset Defaults
          </button>
        </div>
      </details>
      <div id="viewer-evaluate-content" className="viewer-slide-panel-body">
        <div className="viewer-evaluate-empty">Click "Run Evaluation" to analyze the current layout.</div>
      </div>
      <div className="viewer-slide-panel-footer">
        <button id="viewer-evaluate-run" className="viewer-nav-button" type="button">
          Run Evaluation
        </button>
      </div>
    </aside>
  );
}

export function HelpPanelShell() {
  return <div dangerouslySetInnerHTML={{ __html: renderHelpPanelHtml() }} />;
}
