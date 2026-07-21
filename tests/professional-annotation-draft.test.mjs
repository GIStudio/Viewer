import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const viewerRoot = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  configFile: false,
  root: viewerRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(origin);

  const result = await page.evaluate(async () => {
    const { createWorkflowController } = await import("/src/workflow-controller.ts");
    const { createEmptyAnnotation } = await import("/src/scene-graph/index.ts");
    const { loadProfessionalWorkflowDraft, saveProfessionalWorkflowDraft } = await import("/src/professional-draft-store.ts");
    const annotation = createEmptyAnnotation("draft_fixture", "", 800, 600);
    annotation.centerlines.push({
      id: "road-1",
      role: "road_centerline",
      points: [{ x: 10, y: 10 }, { x: 200, y: 10 }],
      width_m: 7,
      lanes: 2,
      cross_section_mode: "manual",
      cross_section_strips: [],
      street_furniture_instances: [],
    });
    const source = {
      referenceAnnotation: annotation,
      graph: { nodes: [], edges: [] },
      source: { kind: "osm", source_id: "fixture" },
      geojson: null,
      warnings: [],
      sourceContext: {},
      featureCounts: { roads: 1, junctions: 0, regions: 0, buildings: 0, functional_zones: 0, furniture: 0 },
      normalizedAt: new Date().toISOString(),
    };
    const workflow = createWorkflowController();
    workflow.setValidatedAnnotation(source, "fingerprint-a", { autoApprove: true });
    const approved = workflow.getSnapshot();
    workflow.setBaselineRun({
      sourceRevision: approved.sourceRevision,
      jobId: "baseline-a",
      status: "succeeded",
      stage: "completed",
      progress: 100,
      message: "ready",
      operations: [],
    });
    workflow.setGeneratedScene({ layoutPath: "/fixtures/revision-a.json" });
    const generated = workflow.getSnapshot();

    const edited = structuredClone(annotation);
    edited.centerlines[0].points[1].x = 220;
    const dirtyRevision = workflow.setAnnotationDraft(edited, "fingerprint-b");
    const dirty = workflow.getSnapshot();
    workflow.setAnnotationDraftStatus("fingerprint-b", "validating");
    const validating = workflow.getSnapshot();
    const staleAccepted = workflow.setValidatedAnnotation(source, "fingerprint-a", { autoApprove: true });
    const afterStale = workflow.getSnapshot();
    workflow.setValidatedAnnotation({ ...source, referenceAnnotation: edited }, "fingerprint-b", { autoApprove: true });
    const saved = workflow.getSnapshot();
    const duplicateRevision = workflow.setAnnotationDraft(edited, "fingerprint-b");
    const deduplicated = workflow.getSnapshot();

    await saveProfessionalWorkflowDraft(deduplicated);
    const stored = await loadProfessionalWorkflowDraft();
    const restoredWorkflow = createWorkflowController();
    if (stored) restoredWorkflow.restoreProfessionalDraft(stored);
    const restored = restoredWorkflow.getSnapshot();
    return {
      approvedRevision: approved.sourceRevision,
      dirtyRevision,
      dirtyApproved: dirty.approvedSourceRevision,
      dirtyBaseline: dirty.baselineRun.status,
      dirtySceneLayoutPath: dirty.sceneLayoutPath,
      dirtySceneSourceRevision: dirty.sceneSourceRevision,
      dirtySceneReviewStatus: dirty.sceneReviewStatus,
      validatingStatus: validating.annotationDraft?.status,
      staleAccepted,
      fingerprintAfterStale: afterStale.annotationDraft?.fingerprint,
      savedApproved: saved.approvedSourceRevision,
      savedStatus: saved.annotationDraft?.status,
      duplicateRevision,
      deduplicatedApproved: deduplicated.approvedSourceRevision,
      restoredFingerprint: restored.annotationDraft?.fingerprint,
      restoredApproved: restored.approvedSourceRevision,
      restoredPointX: restored.annotationDraft?.annotation.centerlines[0]?.points[1]?.x,
      restoredSceneLayoutPath: restored.sceneLayoutPath,
      restoredSceneSourceRevision: restored.sceneSourceRevision,
      restoredSceneReviewStatus: restored.sceneReviewStatus,
      generatedLayoutPath: generated.sceneLayoutPath,
      generatedSourceRevision: generated.sceneSourceRevision,
    };
  });

  assert.equal(result.dirtyRevision, result.approvedRevision + 1, "an edit creates one new source revision");
  assert.equal(result.dirtyApproved, null, "editing revokes approval immediately");
  assert.equal(result.dirtyBaseline, "stale", "editing invalidates the previous baseline");
  assert.equal(result.dirtySceneLayoutPath, result.generatedLayoutPath, "editing retains the prior 3D scene for browsing");
  assert.equal(result.dirtySceneSourceRevision, result.generatedSourceRevision, "the retained scene keeps its original annotation revision");
  assert.equal(result.dirtySceneReviewStatus, "not_available", "a retained old scene cannot be reviewed");
  assert.equal(result.validatingStatus, "validating");
  assert.equal(result.staleAccepted, false, "a late validation callback cannot replace a newer draft");
  assert.equal(result.fingerprintAfterStale, "fingerprint-b");
  assert.equal(result.savedApproved, result.dirtyRevision, "successful validation auto-approves the same revision");
  assert.equal(result.savedStatus, "saved");
  assert.equal(result.duplicateRevision, result.dirtyRevision, "the same fingerprint does not create another revision");
  assert.equal(result.deduplicatedApproved, result.dirtyRevision, "deduplication does not revoke approval");
  assert.equal(result.restoredFingerprint, "fingerprint-b", "IndexedDB restores the latest draft");
  assert.equal(result.restoredApproved, result.dirtyRevision, "IndexedDB restores the approved revision");
  assert.equal(result.restoredPointX, 220, "IndexedDB restores the latest annotation geometry");
  assert.equal(result.restoredSceneLayoutPath, result.generatedLayoutPath, "IndexedDB restores the retained existing 3D scene");
  assert.equal(result.restoredSceneSourceRevision, result.generatedSourceRevision, "IndexedDB restores the 3D scene provenance");
  assert.equal(result.restoredSceneReviewStatus, "not_available", "restored stale scenes remain ineligible for review");

  await page.goto(`${origin}/#scene-graph`);
  await page.reload();
  await page.locator("#scene-source-workflow").waitFor();
  await page.getByText("已保存并校验的标注", { exact: true }).waitFor({ state: "attached" });
  assert.equal(await page.locator("#scene-source-approve").count(), 0, "manual approval control is removed");
  assert.equal(await page.locator("#scene-source-generate").textContent(), "生成当前 3D 场景");
  assert.equal(await page.locator("#scene-source-generate").isDisabled(), false, "a restored validated revision can generate the current 3D scene");
  assert.equal(await page.locator("#scene-source-open-existing").isVisible(), true, "the retained older scene remains browseable");
  await page.locator('.studio-language-toggle [role="radio"]:has-text("EN")').click();
  await page.getByText("Saved and validated annotation", { exact: true }).waitFor({ state: "attached" });
  assert.equal(await page.locator("#scene-source-generate").textContent(), "Generate current 3D scene");
  console.log("professional annotation draft: dirty, validate, auto-approve, deduplicate, and IndexedDB restore");
} finally {
  await browser?.close();
  await server.close();
}
