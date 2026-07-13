import type { DesktopShell } from "./desktop-shell";
import {
  VIEWER_LANGUAGE_EVENT,
  formatViewerKey,
  loadViewerLanguage,
  translateViewerKey,
} from "./viewer-i18n";
import type { ViewerLanguage } from "./viewer-i18n";


type Corpus = {
  profileId: string;
  evidenceScope: string;
  propertyMode: string;
  sourceSnapshotId: string;
  sourceChecksumBundle: string[];
  eligibleRowCount: number;
  selectedRowCount: number;
};

type BrowserRecord = {
  browser_row_number: number;
  split: string;
  semantic_question: string;
  model_input_text: string;
  model_input_sha256: string;
  model_visible_feature_collection_json: string;
  model_visible_feature_collection_sha256: string;
  evidence_profile_id: string;
  evidence_scope: string;
  property_mode: string;
  feature_count: number;
  feature_geometry_types_json: string;
  source_snapshot_id: string;
  source_checksum_bundle_json: string;
  selected_source_layers_json: string;
  selected_source_feature_fingerprints_json: string;
  raw_property_inventory_json: string;
  raw_property_inventory_digest: string;
  raw_evidence_policy_pass: boolean;
  raw_evidence_policy_failure_detail_json: string;
  audit: { question_type: string; geometry_pair_type: string; difficulty_tier: string; expected_answer_json: string; internal_source_ids: Record<string, string>; oracle_method: string; verifier_result: string };
};

type CorpusResponse = { records: BrowserRecord[]; total: number; manifest: Record<string, unknown> };

function element<K extends keyof HTMLElementTagNameMap>(name: K, className?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(name);
  if (className) value.className = className;
  return value;
}

function jsonText(value: string): string {
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function appendLabelledPanel(parent: HTMLElement, title: string, body: HTMLElement): void {
  const panel = element("section", "mib-panel");
  const heading = element("h3", "mib-panel-title");
  heading.textContent = title;
  panel.append(heading, body);
  parent.append(panel);
}

export function mountModelInputBrowser(shell: DesktopShell): () => void {
  const host = shell.centerStage;
  const abort = new AbortController();
  let language: ViewerLanguage = loadViewerLanguage();
  const t = (key: string, fallback: string): string => translateViewerKey(language, key) ?? fallback;
  const format = (key: string, fallback: string, params: Record<string, string | number>): string =>
    formatViewerKey(language, key, params) ?? fallback;
  let corpora: Corpus[] = [];
  let selectedProfile = "";
  let records: BrowserRecord[] = [];
  let total = 0;
  let selected: BrowserRecord | undefined;
  let offset = 0;
  const limit = 100;
  host.replaceChildren();
  const root = element("main", "model-input-browser");
  const style = element("style");
  style.textContent = `.model-input-browser{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#102a43;background:#f7fafc;min-height:100%;padding:22px;box-sizing:border-box}.mib-header{border-bottom:3px solid #003366;padding-bottom:14px;margin-bottom:16px}.mib-header h2{margin:0;color:#003366;font:700 24px Georgia,serif}.mib-header p{margin:6px 0 0;color:#486581}.mib-controls{display:grid;grid-template-columns:minmax(300px,1fr) auto;gap:12px;align-items:end;margin-bottom:14px}.mib-controls label{display:grid;gap:5px;color:#334e68;font-weight:700}.mib-controls select,.mib-controls input{padding:8px;border:1px solid #9fb3c8;background:#fff;color:#102a43}.mib-summary{padding:10px 12px;background:#eaf2f8;border-left:4px solid #996600;margin-bottom:12px;white-space:pre-wrap}.mib-table{width:100%;border-collapse:collapse;background:#fff}.mib-table th,.mib-table td{padding:8px;border-bottom:1px solid #d9e2ec;text-align:left;vertical-align:top}.mib-table th{background:#003366;color:#fff}.mib-table button{font:inherit;color:#003366;text-decoration:underline;border:0;background:transparent;cursor:pointer}.mib-detail{margin-top:18px;display:grid;gap:14px}.mib-panel{background:#fff;border:1px solid #bcccdc}.mib-panel-title{margin:0;padding:9px 12px;background:#eaf2f8;border-bottom:1px solid #bcccdc;font:700 14px Georgia,serif}.mib-code{margin:0;padding:12px;max-height:420px;overflow:auto;white-space:pre-wrap;word-break:break-word}.mib-meta{padding:12px;display:grid;gap:6px}.mib-copy{margin:10px 12px;padding:6px 10px;border:1px solid #003366;background:#fff;color:#003366;cursor:pointer}.mib-error{padding:18px;border:1px solid #ba2525;background:#ffe3e3;color:#ba2525}.mib-load{margin-top:12px;padding:8px 12px;border:1px solid #003366;background:#fff;color:#003366;cursor:pointer}`;
  root.append(style);
  const header = element("header", "mib-header");
  const title = element("h2");
  const subtitle = element("p");
  const profileLabel = element("label");
  const profileSelect = element("select");
  const filterLabel = element("label");
  const filter = element("input");
  const refreshStaticText = () => {
    title.textContent = t("modelInput.title", "Model Input Browser");
    subtitle.textContent = t("modelInput.subtitle", "Read-only evidence audit. This page never renders a map or sends a mutation request.");
    if (profileLabel.firstChild?.nodeType === Node.TEXT_NODE) profileLabel.firstChild.remove();
    profileLabel.prepend(document.createTextNode(t("modelInput.immutableCorpus", "Immutable corpus")));
    profileSelect.setAttribute("aria-label", t("modelInput.immutableCorpus", "Immutable corpus"));
    if (filterLabel.firstChild?.nodeType === Node.TEXT_NODE) filterLabel.firstChild.remove();
    filterLabel.prepend(document.createTextNode(t("modelInput.auditFilter", "Audit filter")));
    filter.placeholder = t("modelInput.filterPlaceholder", "split, question type, geometry pair, tier, policy");
  };
  header.append(title, subtitle);
  const controls = element("div", "mib-controls");
  profileLabel.append(profileSelect);
  filterLabel.append(filter);
  refreshStaticText();
  controls.append(profileLabel, filterLabel);
  const summary = element("div", "mib-summary");
  const results = element("div");
  root.append(header, controls, summary, results);
  host.append(root);

  const render = () => {
    results.replaceChildren();
    const corpus = corpora.find((item) => item.profileId === selectedProfile);
    if (!corpus) return;
    summary.textContent = format(
      "modelInput.summary",
      `${corpus.evidenceScope} · ${corpus.propertyMode}\nSnapshot: ${corpus.sourceSnapshotId}\nChecksums: ${corpus.sourceChecksumBundle.join(", ")}\nEligible: ${corpus.eligibleRowCount} · Selected: ${corpus.selectedRowCount} · Loaded: ${records.length}/${total}`,
      {
        scope: corpus.evidenceScope,
        propertyMode: corpus.propertyMode,
        snapshot: corpus.sourceSnapshotId,
        checksums: corpus.sourceChecksumBundle.join(", "),
        eligible: corpus.eligibleRowCount,
        selected: corpus.selectedRowCount,
        loaded: records.length,
        total,
      },
    );
    const needle = filter.value.trim().toLowerCase();
    const displayed = records.filter((record) => {
      const audit = record.audit;
      const scope = [record.split, audit.question_type, audit.geometry_pair_type, audit.difficulty_tier, String(record.feature_count), String(record.raw_evidence_policy_pass)].join(" ").toLowerCase();
      return !needle || scope.includes(needle);
    });
    const table = element("table", "mib-table");
    const head = element("thead"); const headRow = element("tr");
    for (const [key, fallback] of [
      ["modelInput.column.row", "Row"],
      ["modelInput.column.split", "Split"],
      ["modelInput.column.questionType", "Question type"],
      ["modelInput.column.geometryPair", "Geometry pair"],
      ["modelInput.column.features", "Features"],
      ["modelInput.column.policy", "Policy"],
    ]) { const th = element("th"); th.textContent = t(key, fallback); headRow.append(th); }
    head.append(headRow); table.append(head);
    const body = element("tbody");
    for (const record of displayed) {
      const row = element("tr");
      const cells = [String(record.browser_row_number), record.split, record.audit.question_type, record.audit.geometry_pair_type, String(record.feature_count), record.raw_evidence_policy_pass ? t("modelInput.policy.pass", "pass") : t("modelInput.policy.fail", "fail")];
      cells.forEach((value, index) => { const cell = element("td"); if (index === 0) { const button = element("button"); button.textContent = value; button.addEventListener("click", () => { selected = record; render(); }); cell.append(button); } else cell.textContent = value; row.append(cell); });
      body.append(row);
    }
    table.append(body); results.append(table);
    if (records.length < total) { const more = element("button", "mib-load"); more.textContent = t("modelInput.loadMore", "Load more"); more.addEventListener("click", () => void loadPage(offset + records.length)); results.append(more); }
    if (!selected) return;
    const detail = element("div", "mib-detail");
    const promptBody = element("div"); const copy = element("button", "mib-copy"); copy.textContent = format("modelInput.copyExact", `Copy exact model input (${selected.model_input_text.length} chars · ${selected.model_input_sha256})`, { length: selected.model_input_text.length, checksum: selected.model_input_sha256 }); copy.addEventListener("click", () => void navigator.clipboard.writeText(selected!.model_input_text)); const prompt = element("pre", "mib-code"); prompt.textContent = selected.model_input_text; promptBody.append(copy, prompt); appendLabelledPanel(detail, t("modelInput.panel.exact", "Exact model input"), promptBody);
    const geo = element("pre", "mib-code"); geo.textContent = jsonText(selected.model_visible_feature_collection_json); appendLabelledPanel(detail, t("modelInput.panel.geojson", "Model-visible GeoJSON"), geo);
    const qa = element("div", "mib-meta"); qa.textContent = format("modelInput.questionAnswer", `Question: ${selected.semantic_question}\nExpected generic answer (not model-visible target): ${selected.audit.expected_answer_json}`, { question: selected.semantic_question, answer: selected.audit.expected_answer_json }); appendLabelledPanel(detail, t("modelInput.panel.questionAnswer", "Question and answer audit"), qa);
    const provenance = element("pre", "mib-code"); provenance.textContent = JSON.stringify({ scope: selected.evidence_scope, propertyMode: selected.property_mode, sourceSnapshot: selected.source_snapshot_id, checksums: jsonText(selected.source_checksum_bundle_json), propertyInventoryDigest: selected.raw_property_inventory_digest, policy: selected.raw_evidence_policy_pass, audit: selected.audit }, null, 2); appendLabelledPanel(detail, t("modelInput.panel.provenance", "Provenance audit"), provenance);
    results.append(detail);
  };

  const fail = (error: unknown) => { results.replaceChildren(); const message = element("div", "mib-error"); message.textContent = format("modelInput.unavailable", `Corpus unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`, { reason: error instanceof Error ? error.message : String(error) }); results.append(message); };
  const loadPage = async (nextOffset: number) => {
    try { const response = await fetch(`/api/model-input-corpus?profileId=${encodeURIComponent(selectedProfile)}&offset=${nextOffset}&limit=${limit}`, { signal: abort.signal }); if (!response.ok) throw new Error(await response.text()); const payload = await response.json() as CorpusResponse; if (nextOffset === 0) { records = payload.records; offset = 0; selected = undefined; } else { records = [...records, ...payload.records]; } total = payload.total; render(); } catch (error) { if (!abort.signal.aborted) fail(error); }
  };
  profileSelect.addEventListener("change", () => { selectedProfile = profileSelect.value; void loadPage(0); });
  filter.addEventListener("input", render);
  void (async () => { try { const response = await fetch("/api/model-input-corpora", { signal: abort.signal }); if (!response.ok) throw new Error(await response.text()); const payload = await response.json() as { corpora: Corpus[] }; corpora = payload.corpora; if (!corpora.length) throw new Error(t("modelInput.emptyCorpus", "No fixed raw-evidence corpora are available")); for (const corpus of corpora) { const option = element("option"); option.value = corpus.profileId; option.textContent = `${corpus.profileId} — ${corpus.evidenceScope}/${corpus.propertyMode}`; profileSelect.append(option); } selectedProfile = corpora[0].profileId; await loadPage(0); } catch (error) { if (!abort.signal.aborted) fail(error); } })();
  shell.setStatusSummary({ key: "modelInput.status" });
  shell.setHints([{ key: "modelInput.hint.selectCorpus" }, { key: "modelInput.hint.auditInput" }]);
  window.addEventListener(VIEWER_LANGUAGE_EVENT, (event) => {
    language = (event as CustomEvent<{ language?: ViewerLanguage }>).detail?.language ?? loadViewerLanguage();
    refreshStaticText();
    render();
  }, { signal: abort.signal });
  return () => abort.abort();
}
