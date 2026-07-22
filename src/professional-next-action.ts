import type { WorkflowSnapshot } from "./workflow-controller";

export type ProfessionalNextActionKey =
  | "source"
  | "annotation"
  | "generate"
  | "edit"
  | "evaluate"
  | "review"
  | "scenarios";

export type ProfessionalNextAction = {
  key: ProfessionalNextActionKey;
  route: "scene-graph" | "viewer";
  selector: string | null;
  label: { zh: string; en: string };
};

const ACTIONS: Record<ProfessionalNextActionKey, ProfessionalNextAction> = {
  source: { key: "source", route: "scene-graph", selector: null, label: { zh: "选择 OSM 研究区", en: "Choose OSM study area" } },
  annotation: { key: "annotation", route: "scene-graph", selector: '[data-shell-tab="annotation-tools"]', label: { zh: "检查并完善标注", en: "Review annotation" } },
  generate: { key: "generate", route: "scene-graph", selector: "#scene-source-generate", label: { zh: "配置并生成 3D", en: "Configure and generate 3D" } },
  edit: { key: "edit", route: "viewer", selector: "#viewer-direct-edit", label: { zh: "继续编辑 3D", en: "Continue 3D editing" } },
  evaluate: { key: "evaluate", route: "viewer", selector: "#viewer-evaluate-modal-toggle", label: { zh: "评价当前场景", en: "Evaluate current scene" } },
  review: { key: "review", route: "viewer", selector: "#viewer-result-review-toggle", label: { zh: "审核评价结果", en: "Review evaluation" } },
  scenarios: { key: "scenarios", route: "viewer", selector: "#viewer-scheme-compare-toggle", label: { zh: "查看方案 A/B/C", en: "View scenarios A/B/C" } },
};

export function resolveProfessionalNextAction(snapshot: WorkflowSnapshot): ProfessionalNextAction {
  if (!snapshot.normalized) return ACTIONS.source;
  if (snapshot.approvedSourceRevision !== snapshot.sourceRevision) return ACTIONS.annotation;
  if (!snapshot.sceneLayoutPath || snapshot.sceneSourceRevision !== snapshot.sourceRevision) return ACTIONS.generate;
  if (snapshot.editPending || snapshot.sceneReviewStatus === "changes_requested") return ACTIONS.edit;
  if (!snapshot.evaluation) return ACTIONS.evaluate;
  if (snapshot.sceneReviewStatus !== "accepted") return ACTIONS.review;
  return ACTIONS.scenarios;
}
