import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const viewerRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "roadgen-model-input-browser-"));
const profiles = [
  "raw_geojson_question_only_geometry_v1", "raw_geojson_question_only_native_properties_v1",
  "raw_geojson_local_context_geometry_v1", "raw_geojson_local_context_native_properties_v1",
  "raw_geojson_tile_geometry_v1", "raw_geojson_tile_native_properties_v1",
];
const collection = { type: "FeatureCollection", features: [
  { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [114.1, 22.3] } },
  { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [114.2, 22.4] } },
] };
const modelInput = `MODEL_LITERAL_DO_NOT_TRANSLATE\nUse only the following GeoJSON FeatureCollection. Return JSON only in the form {"answer": <JSON value>}. Do not explain.\n\n${JSON.stringify(collection)}\n\nWhich of the eight compass directions is the first feature from the second feature?\n`;
const modelInputSha = "fixture-model-input-sha";
await Promise.all(profiles.map(async (profileId) => {
  const dir = path.join(fixtureRoot, profileId);
  await fs.mkdir(dir, { recursive: true });
  const native = profileId.includes("native_properties");
  const record = {
    browser_row_number: 1, split: "test", semantic_question: "Which of the eight compass directions is the first feature from the second feature?",
    model_input_text: modelInput, model_input_sha256: modelInputSha,
    model_visible_feature_collection_json: JSON.stringify({ ...collection, features: collection.features.map((f, index) => ({ ...f, properties: native ? { name: `native-${index}` } : {} })) }),
    model_visible_feature_collection_sha256: "fixture-geojson-sha", evidence_profile_id: profileId,
    evidence_scope: profileId.includes("question_only") ? "question_only" : profileId.includes("local_context") ? "local_context" : "tile",
    property_mode: native ? "native_properties" : "geometry_only", feature_count: 2,
    feature_geometry_types_json: "[\"Point\",\"Point\"]", source_snapshot_id: "fixture-snapshot",
    source_checksum_bundle_json: "[\"fixture-checksum\"]", selected_source_layers_json: "[\"roads\"]",
    selected_source_feature_fingerprints_json: "[\"fixture-fingerprint\"]", raw_property_inventory_json: "{\"digest\":\"fixture-inventory\"}", raw_property_inventory_digest: "fixture-inventory",
    raw_evidence_policy_pass: true, raw_evidence_policy_failure_detail_json: "[]",
    audit: { question_type: "cardinal_direction_8", geometry_pair_type: "point-point", difficulty_tier: "medium", expected_answer_json: "{\"task\":\"cardinal_direction_8\",\"direction_8\":\"NE\"}", internal_source_ids: { question_id: "fixture-1", source_relation_id_governance_only: "" }, oracle_method: "fixture", verifier_result: "clean_catalogued" },
  };
  await fs.writeFile(path.join(dir, "model_input_browser_1000.jsonl"), `${Array.from({ length: 1000 }, (_, i) => JSON.stringify({ ...record, browser_row_number: i + 1 })).join("\n")}\n`);
  await fs.writeFile(path.join(dir, "model_input_browser_1000_manifest.json"), JSON.stringify({ profile_id: profileId, source_snapshot_id: "fixture-snapshot", source_checksum_bundle: ["fixture-checksum"], eligible_row_count: 1000, sample_row_count: 1000 }));
}));
const indexPath = path.join(fixtureRoot, "index.json");
await fs.writeFile(indexPath, JSON.stringify({ corpora: profiles.map((profileId) => ({ profileId, jsonl: `${profileId}/model_input_browser_1000.jsonl`, manifest: `${profileId}/model_input_browser_1000_manifest.json` })) }));
process.env.ROADGEN_MODEL_INPUT_BROWSER_ROOT = fixtureRoot;
process.env.ROADGEN_MODEL_INPUT_BROWSER_INDEX = indexPath;
const server = await createServer({ root: viewerRoot, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem("viewer-lang", "en"));
  const methods = [];
  page.on("request", (request) => { if (request.url().includes("/api/model-input-")) methods.push(request.method()); });
  await page.goto(`${origin}/#model-input-browser`);
  await page.getByLabel("Immutable corpus").waitFor();
  await page.getByRole("button", { name: "1", exact: true }).waitFor();
  assert.equal(await page.locator(".mib-summary").textContent().then((text) => text?.includes("Selected: 1000")), true);
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("heading", { name: "Exact model input", exact: true }).waitFor();
  assert.equal(await page.locator(".mib-code").first().textContent(), modelInput);
  assert.equal(await page.locator(".mib-code").nth(1).textContent(), JSON.stringify(collection, null, 2));
  for (const profileId of profiles) {
    await page.getByLabel("Immutable corpus").selectOption(profileId);
    await page.getByRole("button", { name: "1", exact: true }).waitFor();
  }
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("heading", { name: "Exact model input", exact: true }).waitFor();
  const corpusRequestsBeforeLanguageSwitch = methods.length;
  const rawEvidenceBeforeLanguageSwitch = await page.locator(".mib-code").allTextContents();
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "zh");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "zh" } }));
  });
  await page.getByLabel("不可变语料库").waitFor();
  await page.getByRole("heading", { name: "精确模型输入", exact: true }).waitFor();
  assert.equal(await page.locator(".mib-header h2").textContent(), "模型输入浏览器");
  assert.equal(await page.locator(".mib-table th").nth(2).textContent(), "问题类型");
  assert.deepEqual(await page.locator(".mib-code").allTextContents(), rawEvidenceBeforeLanguageSwitch, "raw model evidence must not change when chrome switches locale");
  assert.equal((await page.locator(".mib-code").first().textContent())?.includes("MODEL_LITERAL_DO_NOT_TRANSLATE"), true);
  assert.equal(methods.length, corpusRequestsBeforeLanguageSwitch, "locale changes must not request a corpus again");
  await page.evaluate(() => {
    localStorage.setItem("viewer-lang", "en");
    window.dispatchEvent(new CustomEvent("roadgen3d:viewer-language-change", { detail: { language: "en" } }));
  });
  await page.getByLabel("Immutable corpus").waitFor();
  await page.getByRole("heading", { name: "Exact model input", exact: true }).waitFor();
  assert.deepEqual(await page.locator(".mib-code").allTextContents(), rawEvidenceBeforeLanguageSwitch, "raw model evidence must remain byte-for-byte stable after EN → zh → EN");
  assert.equal(methods.length, corpusRequestsBeforeLanguageSwitch, "returning to English must not request a corpus again");
  assert.deepEqual([...new Set(methods)], ["GET"], "Browser must never issue mutation requests");
  console.log("model-input-browser integration: six fixed corpora render GET-only raw evidence");
} finally {
  await browser?.close();
  await server.close();
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}
