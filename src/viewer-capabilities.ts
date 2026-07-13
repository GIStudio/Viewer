import { escapeHtml } from "./viewer-utils";
import type { WorkflowCapabilities } from "./workflow-controller";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function configuredLabel(value: unknown): string {
  return value === true ? "Configured" : "Not configured";
}

export function renderWorkflowCapabilities(capabilities: WorkflowCapabilities | null): string {
  if (!capabilities) return "Server capability status is unavailable.";
  const llm = asRecord(capabilities.llm);
  const text = asRecord(llm.text);
  const vision = asRecord(llm.vision);
  const provider = String(llm.provider ?? "none");
  const protocol = String(llm.protocol ?? "not configured");
  const textModel = String(text.model ?? "—");
  const visionModel = String(vision.model ?? "—");
  const endpointFingerprint = String(llm.endpoint_fingerprint ?? "—");
  return `
    <dl class="viewer-capability-list">
      <div><dt>LLM provider</dt><dd>${escapeHtml(provider)} · ${escapeHtml(protocol)}</dd></div>
      <div><dt>Text / Qwen-compatible</dt><dd>${configuredLabel(text.configured)} · ${escapeHtml(textModel)}</dd></div>
      <div><dt>Vision extraction</dt><dd>${configuredLabel(vision.configured)} · ${escapeHtml(visionModel)}</dd></div>
      <div><dt>Endpoint identity</dt><dd>${escapeHtml(endpointFingerprint === "—" ? endpointFingerprint : `${endpointFingerprint.slice(0, 22)}…`)}</dd></div>
    </dl>
    <p class="viewer-settings-note">Configure the server with <code>ROADGEN_LLM_PROVIDER</code>, <code>ROADGEN_LLM_BASE_URL</code>, <code>ROADGEN_LLM_MODEL</code>, and <code>ROADGEN_LLM_VISION_MODEL</code>. OpenAI is the default; Qwen uses the same OpenAI-compatible protocol. Credentials and upstream URLs remain server-side.</p>
  `;
}
