import type { SceneAssetRef, SceneEditCommand } from "./viewer-api";
import type { ViewerManifest } from "./viewer-types";

export type SceneCommandEnvelope = {
  layout_path: string;
  base: {
    revision: number;
    sha256: string;
  };
  commands: SceneEditCommand[];
};

function editableInstanceByCommandId(
  manifest: ViewerManifest,
  commandInstanceId: string,
): Record<string, unknown> | null {
  for (const instance of Object.values(manifest.instances ?? {})) {
    if (String(instance.instance_id ?? "") !== commandInstanceId) continue;
    const category = String(instance.category ?? "").toLowerCase();
    const placementGroup = String(instance.placement_group ?? "").toLowerCase();
    const placementFurniture = placementGroup === "street_furniture" || [
      "bench",
      "bollard",
      "bus_stop",
      "hydrant",
      "lamp",
      "mailbox",
      "sign",
      "trash",
      "tree",
    ].includes(category);
    return instance.editable === false || !placementFurniture ? null : instance;
  }
  return null;
}

export function parseSceneCommandEnvelope(
  text: string,
  manifest: ViewerManifest,
  currentLayoutPath: string,
): SceneCommandEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Command editor contains invalid JSON.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Command editor requires one scene-layout edit envelope object.");
  }
  const record = raw as Record<string, unknown>;
  const unsupportedKeys = Object.keys(record).filter((key) => !["layout_path", "base", "commands"].includes(key));
  if (unsupportedKeys.length > 0) {
    throw new Error(`Unsupported envelope fields: ${unsupportedKeys.join(", ")}. Full-layout and JSON Patch edits are not allowed.`);
  }
  const layoutPath = String(record.layout_path ?? "").trim();
  if (!layoutPath || layoutPath !== currentLayoutPath) {
    throw new Error("layout_path must match the currently loaded durable layout revision.");
  }
  const base = record.base && typeof record.base === "object" && !Array.isArray(record.base)
    ? record.base as Record<string, unknown>
    : {};
  const revision = Number(base.revision);
  const sha256 = String(base.sha256 ?? "").toLowerCase();
  if (
    !manifest.layout_revision
    || revision !== manifest.layout_revision.revision
    || sha256 !== manifest.layout_revision.sha256
  ) {
    throw new Error("The command base revision/hash is stale. Reload the authoritative scene before editing.");
  }
  if (!Array.isArray(record.commands) || record.commands.length === 0) {
    throw new Error("The command envelope requires at least one scene edit command.");
  }
  const commandIds = new Set<string>();
  const commands = record.commands.map((value, index): SceneEditCommand => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Command ${index + 1} must be an object.`);
    }
    const command = value as Record<string, unknown>;
    const commandId = String(command.command_id ?? "").trim();
    const instanceId = String(command.instance_id ?? "").trim();
    if (!commandId || commandIds.has(commandId)) throw new Error(`Command ${index + 1} needs a unique command_id.`);
    commandIds.add(commandId);
    const op = String(command.op ?? "") as SceneEditCommand["op"];
    if (op !== "add_instance" && !editableInstanceByCommandId(manifest, instanceId)) {
      throw new Error(`Instance ${instanceId || "(missing)"} is not editable placement furniture.`);
    }
    const vector = (value: unknown, label: string): [number, number, number] => {
      if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain exactly three coordinates.`);
      const coordinates = value.map(Number);
      if (coordinates.some((coordinate) => !Number.isFinite(coordinate))) throw new Error(`${label} must contain finite coordinates.`);
      return [coordinates[0]!, coordinates[1]!, coordinates[2]!];
    };
    const assetRef = (value: unknown): SceneAssetRef => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Command ${index + 1} asset_ref is required.`);
      const source = value as Record<string, unknown>;
      const result = {
        manifestName: String(source.manifestName ?? "").trim(),
        assetId: String(source.assetId ?? "").trim(),
        fingerprint: String(source.fingerprint ?? "").trim(),
        category: String(source.category ?? "").trim(),
        label: String(source.label ?? source.assetId ?? "Asset").trim(),
      };
      if (!result.manifestName || !result.assetId || !result.fingerprint || !result.category) {
        throw new Error(`Command ${index + 1} asset_ref is incomplete.`);
      }
      return result;
    };
    const base = { command_id: commandId, instance_id: instanceId };
    if (op === "move_instance") {
      return { ...base, op, position_xyz: vector(command.position_xyz, `Command ${index + 1} position_xyz`), height_offset_m: Number(command.height_offset_m ?? 0) };
    }
    if (op === "rotate_instance") {
      const yaw = Number(command.yaw_deg);
      if (!Number.isFinite(yaw)) throw new Error(`Command ${index + 1} yaw_deg must be finite.`);
      return { ...base, op, yaw_deg: yaw };
    }
    if (op === "scale_instance") {
      const scale = Number(command.scale);
      if (!Number.isFinite(scale) || scale < 0.25 || scale > 4) throw new Error(`Command ${index + 1} scale must be within 0.25..4.`);
      return { ...base, op, scale };
    }
    if (op === "delete_instance") return { ...base, op };
    if (op === "duplicate_instance") {
      const newInstanceId = String(command.new_instance_id ?? "").trim();
      if (!newInstanceId) throw new Error(`Command ${index + 1} new_instance_id is required.`);
      return {
        ...base,
        op,
        new_instance_id: newInstanceId,
        ...(command.position_xyz ? { position_xyz: vector(command.position_xyz, `Command ${index + 1} position_xyz`) } : {}),
      };
    }
    if (op === "add_instance" || op === "replace_asset") {
      const ref = assetRef(command.asset_ref);
      if (ref.assetId !== String(command.asset_id ?? "")) throw new Error(`Command ${index + 1} asset_id must match asset_ref.assetId.`);
      if (op === "replace_asset") return { ...base, op, asset_id: ref.assetId, category: ref.category, asset_ref: ref };
      const scale = Number(command.scale ?? 1);
      const yaw = Number(command.yaw_deg ?? 0);
      if (!Number.isFinite(scale) || scale < 0.25 || scale > 4 || !Number.isFinite(yaw)) throw new Error(`Command ${index + 1} has invalid scale or yaw.`);
      return { ...base, op, asset_id: ref.assetId, category: ref.category, asset_ref: ref, position_xyz: vector(command.position_xyz, `Command ${index + 1} position_xyz`), yaw_deg: yaw, scale };
    }
    throw new Error(`Command ${index + 1} has unsupported op '${op}'.`);
  });
  return {
    layout_path: layoutPath,
    base: { revision, sha256 },
    commands,
  };
}

export function sceneCommandEnvelopeTemplate(
  manifest: ViewerManifest | null,
  layoutPath: string,
): string {
  const revision = manifest?.layout_revision;
  const editable = Object.values(manifest?.instances ?? {}).find((instance) => {
    const placementGroup = String(instance.placement_group ?? "").toLowerCase();
    return instance.editable !== false && placementGroup === "street_furniture";
  });
  const position = Array.isArray(editable?.position_xyz) && editable.position_xyz.length >= 3
    ? editable.position_xyz.slice(0, 3).map(Number)
    : [0, 0, 0];
  return JSON.stringify({
    layout_path: layoutPath,
    base: {
      revision: revision?.revision ?? 0,
      sha256: revision?.sha256 ?? "",
    },
    commands: [{
      command_id: globalThis.crypto?.randomUUID?.() ?? `manual-move-${Date.now()}`,
      op: "move_instance",
      instance_id: String(editable?.instance_id ?? ""),
      position_xyz: position,
    }],
  }, null, 2);
}
