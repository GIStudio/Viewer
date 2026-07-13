import { requireElement } from "../viewer-utils";

export type SceneGraphElements = {
  backButton: HTMLButtonElement;
  planSelect: HTMLSelectElement;
  scenarioSelect: HTMLSelectElement;
  scenarioSelectData: HTMLSelectElement;
  imageInput: HTMLInputElement;
  imageResetButton: HTMLButtonElement;
  showOriginalInput: HTMLInputElement;
  showOverlayInput: HTMLInputElement;
  showJunctionCoreInput: HTMLInputElement;
  showJunctionConnectorsInput: HTMLInputElement;
  showJunctionOutlinesInput: HTMLInputElement;
  showJunctionCrosswalksInput: HTMLInputElement;
  showJunctionBoundariesInput: HTMLInputElement;
  showJunctionLabelsInput: HTMLInputElement;
  showJunctionDebugInput: HTMLInputElement;
  originalOpacityInput: HTMLInputElement;
  overlayOpacityInput: HTMLInputElement;
  pixelsPerMeterInput: HTMLInputElement;
  roundaboutRadiusInput: HTMLInputElement;
  finishCenterlineButton: HTMLButtonElement;
  autoSplitRegionsButton: HTMLButtonElement;
  selectAllRoadsButton: HTMLButtonElement;
  undoPointButton: HTMLButtonElement;
  deleteSelectedButton: HTMLButtonElement;
  resetAnnotationButton: HTMLButtonElement;
  snapToRoadInput: HTMLInputElement;
  imageMetaEl: HTMLElement;
  stageEl: HTMLElement;
  stageEmptyEl: HTMLElement;
  boardEl: HTMLElement;
  originalImageEl: HTMLImageElement;
  overlayHostEl: HTMLElement;
  jsonFileInput: HTMLInputElement;
  applyJsonButton: HTMLButtonElement;
  downloadJsonButton: HTMLButtonElement;
  copyJsonButton: HTMLButtonElement;
  jsonTextarea: HTMLTextAreaElement;
  statusEl: HTMLElement;
  summaryGridEl: HTMLElement;
  inspectorEl: HTMLElement;
  segmentLengthInput: HTMLInputElement;
  sidewalkWidthInput: HTMLInputElement;
  convertGraphButton: HTMLButtonElement;
  downloadGraphButton: HTMLButtonElement;
  graphStatusEl: HTMLElement;
  graphSummaryEl: HTMLElement;
  graphTextarea: HTMLTextAreaElement;
  featureTableEl: HTMLElement;
  assetEditorButton: HTMLButtonElement;
  sourceWorkflowEl: HTMLElement;
  sourceImageImportButton: HTMLButtonElement;
  sourceGeojsonInput: HTMLInputElement;
  sourceCoordinateSpaceSelect: HTMLSelectElement;
  sourceBboxInput: HTMLInputElement;
  sourceAiPrompt: HTMLTextAreaElement;
  sourceAiExtractButton: HTMLButtonElement;
  sourceAiStatusEl: HTMLElement;
  sourceOsmImportButton: HTMLButtonElement;
  sourceNormalizeButton: HTMLButtonElement;
  sourceStatusEl: HTMLElement;
  sourceProvenanceEl: HTMLElement;
  sourceCountsEl: HTMLElement;
  sourceWarningsEl: HTMLElement;
  sourceBackButton: HTMLButtonElement;
  sourceApproveButton: HTMLButtonElement;
  sourceGenerateButton: HTMLButtonElement;
  sourceReviewStatusEl: HTMLElement;
};

export function collectSceneGraphElements(root: HTMLElement | Document): SceneGraphElements {
  return {
    backButton: requireElement<HTMLButtonElement>(root, "#scene-page-back"),
    planSelect: requireElement<HTMLSelectElement>(root, "#annotation-plan-select"),
    scenarioSelect: requireElement<HTMLSelectElement>(root, "#annotation-scenario-select"),
    scenarioSelectData: requireElement<HTMLSelectElement>(root, "#annotation-scenario-select-data"),
    imageInput: requireElement<HTMLInputElement>(root, "#annotation-image-input"),
    imageResetButton: requireElement<HTMLButtonElement>(root, "#annotation-image-reset"),
    showOriginalInput: requireElement<HTMLInputElement>(root, "#annotation-show-original"),
    showOverlayInput: requireElement<HTMLInputElement>(root, "#annotation-show-overlay"),
    showJunctionCoreInput: requireElement<HTMLInputElement>(root, "#annotation-show-junction-core"),
    showJunctionConnectorsInput: requireElement<HTMLInputElement>(root, "#annotation-show-junction-connectors"),
    showJunctionOutlinesInput: requireElement<HTMLInputElement>(root, "#annotation-show-junction-outlines"),
    showJunctionCrosswalksInput: requireElement<HTMLInputElement>(root, "#annotation-show-junction-crosswalks"),
    showJunctionBoundariesInput: requireElement<HTMLInputElement>(root, "#annotation-show-junction-boundaries"),
    showJunctionLabelsInput: requireElement<HTMLInputElement>(root, "#annotation-show-junction-labels"),
    showJunctionDebugInput: requireElement<HTMLInputElement>(root, "#annotation-show-junction-debug"),
    originalOpacityInput: requireElement<HTMLInputElement>(root, "#annotation-original-opacity"),
    overlayOpacityInput: requireElement<HTMLInputElement>(root, "#annotation-overlay-opacity"),
    pixelsPerMeterInput: requireElement<HTMLInputElement>(root, "#annotation-pixels-per-meter"),
    roundaboutRadiusInput: requireElement<HTMLInputElement>(root, "#annotation-roundabout-radius"),
    finishCenterlineButton: requireElement<HTMLButtonElement>(root, "#annotation-finish-centerline"),
    autoSplitRegionsButton: requireElement<HTMLButtonElement>(root, "#annotation-auto-split-regions"),
    selectAllRoadsButton: requireElement<HTMLButtonElement>(root, "#annotation-select-all-roads"),
    undoPointButton: requireElement<HTMLButtonElement>(root, "#annotation-undo-point"),
    deleteSelectedButton: requireElement<HTMLButtonElement>(root, "#annotation-delete-selected"),
    resetAnnotationButton: requireElement<HTMLButtonElement>(root, "#annotation-reset"),
    snapToRoadInput: requireElement<HTMLInputElement>(root, "#annotation-snap-to-road"),
    imageMetaEl: requireElement<HTMLElement>(root, "#annotation-image-meta"),
    stageEl: requireElement<HTMLElement>(root, "#annotation-stage"),
    stageEmptyEl: requireElement<HTMLElement>(root, "#annotation-stage-empty"),
    boardEl: requireElement<HTMLElement>(root, "#annotation-board"),
    originalImageEl: requireElement<HTMLImageElement>(root, "#annotation-original-image"),
    overlayHostEl: requireElement<HTMLElement>(root, "#annotation-overlay-host"),
    jsonFileInput: requireElement<HTMLInputElement>(root, "#annotation-json-input"),
    applyJsonButton: requireElement<HTMLButtonElement>(root, "#annotation-apply-json"),
    downloadJsonButton: requireElement<HTMLButtonElement>(root, "#annotation-download-json"),
    copyJsonButton: requireElement<HTMLButtonElement>(root, "#annotation-copy-json"),
    jsonTextarea: requireElement<HTMLTextAreaElement>(root, "#annotation-json"),
    statusEl: requireElement<HTMLElement>(root, "#annotation-status"),
    summaryGridEl: requireElement<HTMLElement>(root, "#annotation-summary-grid"),
    inspectorEl: requireElement<HTMLElement>(root, "#annotation-inspector"),
    segmentLengthInput: requireElement<HTMLInputElement>(root, "#annotation-segment-length"),
    sidewalkWidthInput: requireElement<HTMLInputElement>(root, "#annotation-sidewalk-width"),
    convertGraphButton: requireElement<HTMLButtonElement>(root, "#annotation-convert-graph"),
    downloadGraphButton: requireElement<HTMLButtonElement>(root, "#annotation-download-graph"),
    graphStatusEl: requireElement<HTMLElement>(root, "#annotation-graph-status"),
    graphSummaryEl: requireElement<HTMLElement>(root, "#annotation-graph-summary"),
    graphTextarea: requireElement<HTMLTextAreaElement>(root, "#annotation-graph-json"),
    featureTableEl: requireElement<HTMLElement>(root, "#annotation-feature-table"),
    assetEditorButton: requireElement<HTMLButtonElement>(root, "#scene-page-asset-editor"),
    sourceWorkflowEl: requireElement<HTMLElement>(root, "#scene-source-workflow"),
    sourceImageImportButton: requireElement<HTMLButtonElement>(root, "#scene-source-image-import"),
    sourceGeojsonInput: requireElement<HTMLInputElement>(root, "#scene-source-geojson-input"),
    sourceCoordinateSpaceSelect: requireElement<HTMLSelectElement>(root, "#scene-source-coordinate-space"),
    sourceBboxInput: requireElement<HTMLInputElement>(root, "#scene-source-bbox"),
    sourceAiPrompt: requireElement<HTMLTextAreaElement>(root, "#scene-source-ai-prompt"),
    sourceAiExtractButton: requireElement<HTMLButtonElement>(root, "#scene-source-ai-extract"),
    sourceAiStatusEl: requireElement<HTMLElement>(root, "#scene-source-ai-status"),
    sourceOsmImportButton: requireElement<HTMLButtonElement>(root, "#scene-source-osm-import"),
    sourceNormalizeButton: requireElement<HTMLButtonElement>(root, "#scene-source-normalize"),
    sourceStatusEl: requireElement<HTMLElement>(root, "#scene-source-status"),
    sourceProvenanceEl: requireElement<HTMLElement>(root, "#scene-source-provenance"),
    sourceCountsEl: requireElement<HTMLElement>(root, "#scene-source-counts"),
    sourceWarningsEl: requireElement<HTMLElement>(root, "#scene-source-warnings"),
    sourceBackButton: requireElement<HTMLButtonElement>(root, "#scene-source-back"),
    sourceApproveButton: requireElement<HTMLButtonElement>(root, "#scene-source-approve"),
    sourceGenerateButton: requireElement<HTMLButtonElement>(root, "#scene-source-generate"),
    sourceReviewStatusEl: requireElement<HTMLElement>(root, "#scene-source-review-status"),
  };
}
