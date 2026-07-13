import type { SceneMoveInstanceCommand } from "./viewer-api";
import type { ViewerManifest } from "./viewer-types";

export type SceneCommandEnvelope = {
  layout_path: string;
  base: {
    revision: number;
    sha256: string;
  };
  commands: SceneMoveInstanceCommand[];
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
    throw new Error("The command envelope requires at least one move_instance command.");
  }
  const commandIds = new Set<string>();
  const commands = record.commands.map((value, index): SceneMoveInstanceCommand => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Command ${index + 1} must be an object.`);
    }
    const command = value as Record<string, unknown>;
    const commandKeys = Object.keys(command);
    const unsupportedCommandKeys = commandKeys.filter((key) => !["command_id", "op", "instance_id", "position_xyz"].includes(key));
    if (unsupportedCommandKeys.length > 0 || command.op !== "move_instance") {
      throw new Error(`Command ${index + 1} must be exactly one move_instance command.`);
    }
    const commandId = String(command.command_id ?? "").trim();
    const instanceId = String(command.instance_id ?? "").trim();
    const position = command.position_xyz;
    if (!commandId || commandIds.has(commandId)) throw new Error(`Command ${index + 1} needs a unique command_id.`);
    commandIds.add(commandId);
    if (!editableInstanceByCommandId(manifest, instanceId)) {
      throw new Error(`Instance ${instanceId || "(missing)"} is not editable placement furniture.`);
    }
    if (!Array.isArray(position) || position.length !== 3) {
      throw new Error(`Command ${index + 1} position_xyz must contain exactly three coordinates.`);
    }
    const coordinates = position.map(Number);
    if (coordinates.some((coordinate) => !Number.isFinite(coordinate))) {
      throw new Error(`Command ${index + 1} position_xyz must contain finite coordinates.`);
    }
    return {
      command_id: commandId,
      op: "move_instance",
      instance_id: instanceId,
      position_xyz: [coordinates[0]!, coordinates[1]!, coordinates[2]!],
    };
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
