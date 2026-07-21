import type {
  ProfessionalPipelineStage,
  WorkflowSnapshot,
} from "./workflow-controller";

export type ProfessionalViewerTarget = "generate" | "browse" | "review" | "edit" | "deliver";

export const PROFESSIONAL_VIEWER_TARGET_KEY = "roadgen3d:professional-viewer-target";

export function professionalPipelineStage(snapshot: WorkflowSnapshot): ProfessionalPipelineStage {
  if (snapshot.sceneRef?.kind === "starter_demo") return "review";
  if (!snapshot.sceneLayoutPath) {
    return snapshot.approvedSourceRevision === snapshot.sourceRevision && assetPreparationStatus(snapshot) === "ready"
      ? "generate"
      : "prepare";
  }
  if (snapshot.sceneReviewStatus === "changes_requested") return "edit";
  if (snapshot.sceneReviewStatus === "accepted" || snapshot.evaluation) return "deliver";
  return "review";
}

export function annotationPreparationStatus(snapshot: WorkflowSnapshot): "pending" | "ready" | "warning" {
  if (!snapshot.normalized) return "pending";
  return snapshot.approvedSourceRevision === snapshot.sourceRevision ? "ready" : "warning";
}

export function assetPreparationStatus(snapshot: WorkflowSnapshot): "pending" | "ready" {
  if (snapshot.assetPreparation?.mode === "default_transparent_massing") return "ready";
  if (
    snapshot.assetPreparation?.mode === "candidate_manifests"
    && snapshot.assetPreparation.manifests.some((manifest) => manifest.readyCount > 0)
  ) return "ready";
  return "pending";
}

export function storeProfessionalViewerTarget(target: ProfessionalViewerTarget): void {
  try {
    sessionStorage.setItem(PROFESSIONAL_VIEWER_TARGET_KEY, target);
  } catch {
    // Route navigation still succeeds when browser storage is unavailable.
  }
}

export function consumeProfessionalViewerTarget(): ProfessionalViewerTarget | null {
  try {
    const value = sessionStorage.getItem(PROFESSIONAL_VIEWER_TARGET_KEY);
    sessionStorage.removeItem(PROFESSIONAL_VIEWER_TARGET_KEY);
    if (value === "generate" || value === "browse" || value === "review" || value === "edit" || value === "deliver") return value;
  } catch {
    // Ignore privacy-mode storage failures.
  }
  return null;
}

export function renderProfessionalReviewPanelHtml(): string {
  return `
    <div class="professional-result-review" id="viewer-result-review">
      <header class="professional-result-review-intro">
        <span data-i18n-key="professional.review.kicker">03 / RESULT REVIEW</span>
        <h2 data-i18n-key="professional.review.title">Review the generated 3D result</h2>
        <p data-i18n-key="professional.review.description">Check the scene against the approved annotation before editing or evaluation.</p>
      </header>
      <div class="professional-review-state" id="viewer-result-review-state" data-tone="empty">
        <strong data-i18n-key="professional.review.noScene">No generated scene is available.</strong>
        <span data-i18n-key="professional.review.noSceneHint">Complete scene generation first.</span>
      </div>
      <section class="professional-starter-review-guide" id="viewer-starter-review-guide" hidden>
        <span>START HERE · 03</span>
        <h3>先看完整场景，再制作自己的研究区</h3>
        <p>当前是只读的广州十字路口产品示例，不代表你已经完成 01A 或 02。</p>
        <div class="professional-starter-flow" aria-label="从准备到结果审核的生成流程">
          <div><b>01A</b><strong>OSM 数据与标注</strong><small>选择道路、研究走廊与建筑上下文</small></div>
          <i aria-hidden="true">→</i>
          <div><b>02</b><strong>3D 场景生成</strong><small>确认结构、家具目标与输出配置</small></div>
          <i aria-hidden="true">→</i>
          <div><b>03</b><strong>审核自己的结果</strong><small>检查道路、白模、设施与 2D/3D 一致性</small></div>
        </div>
        <div class="professional-starter-guide-actions">
          <button type="button" data-starter-action="source">从 01A 选择自己的 OSM</button>
          <button type="button" data-starter-action="materialize">使用此示例开始</button>
        </div>
      </section>
      <ol class="professional-review-checklist">
        <li><span>01</span><div><strong data-i18n-key="professional.review.road">Road geometry</strong><small data-i18n-key="professional.review.roadHint">Alignment, junctions, cross sections and topology.</small></div></li>
        <li><span>02</span><div><strong data-i18n-key="professional.review.massing">Building massing</strong><small data-i18n-key="professional.review.massingHint">Footprint, height and transparent massing alignment.</small></div></li>
        <li><span>03</span><div><strong data-i18n-key="professional.review.assets">Trees and street assets</strong><small data-i18n-key="professional.review.assetsHint">Missing objects, collisions, scale and orientation.</small></div></li>
        <li><span>04</span><div><strong data-i18n-key="professional.review.consistency">2D / 3D consistency</strong><small data-i18n-key="professional.review.consistencyHint">Compare the generated scene with the approved source.</small></div></li>
      </ol>
      <section class="viewer-used-assets" aria-labelledby="viewer-review-used-assets-title">
        <header><strong id="viewer-review-used-assets-title">本次实际采用资产</strong><small>候选仓库中的资产不一定全部被使用</small></header>
        <div id="viewer-review-used-assets">生成场景后显示实际放置的资产。</div>
      </section>
      <div class="professional-review-actions">
        <button id="viewer-result-review-accept" class="viewer-nav-button" type="button" data-i18n-key="professional.review.accept">Accept and continue to evaluation</button>
        <button id="viewer-result-review-changes" class="viewer-nav-button viewer-nav-button-secondary" type="button" data-i18n-key="professional.review.edit3d">Edit 3D scene</button>
        <button id="viewer-result-review-annotation" class="viewer-nav-button viewer-nav-button-secondary" type="button" data-i18n-key="professional.review.edit2d">Edit 2D annotation</button>
      </div>
      <p class="professional-review-note" data-i18n-key="professional.review.note">Road and topology changes belong in 2D annotation. Objects, facilities and materials belong in 3D scene editing.</p>
    </div>
  `;
}
