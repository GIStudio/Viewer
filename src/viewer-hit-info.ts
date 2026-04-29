import * as THREE from "three";
import type {
  AssetDescription,
  InstanceInfo,
  StaticObjectDescription,
  ViewerManifest,
} from "./viewer-types";
import { escapeHtml, finiteOrNull } from "./viewer-utils";

const CATEGORY_LABELS: Record<string, string> = {
  bench: "座椅",
  lamp: "路灯",
  tree: "树木",
  trash: "垃圾桶",
  bollard: "隔离桩",
  mailbox: "邮箱",
  hydrant: "消防栓",
  bus_stop: "公交站",
  building: "建筑",
  road: "道路",
  roadway: "道路",
  sidewalk: "人行道",
  marking: "道路标线",
  crossing: "过街区",
  transit: "公交设施",
  landscape: "景观设施",
  scene_object: "场景对象",
};

const FALLBACK_CATEGORY_INTRO: Record<string, string> = {
  bench: "用于停留休憩，通常位于步行活动带。",
  lamp: "用于夜间照明，通常沿步行界面连续布置。",
  tree: "用于遮荫与界面塑造，通常位于路缘或家具带。",
  trash: "用于保持街道整洁，通常布置在停留节点附近。",
  bollard: "用于分隔交通与人行区域，强化安全边界。",
  mailbox: "用于邮政投递，通常靠近停留节点或出入口。",
  hydrant: "用于消防取水，通常靠近机动车或消防可达界面。",
  bus_stop: "用于公交停靠与候车，通常锚定在公交站点附近。",
  building: "用于塑造沿街界面和空间围合。",
};

const SYSTEM_NODE_DESCRIPTIONS: Record<string, StaticObjectDescription> = {
  carriageway_arm_: {
    match: "prefix",
    title: "Road Carriageway Arm",
    category: "road",
    intro: "Individual road arm carriageway surface (one per road segment).",
    design_note: "Previously merged into a single unified mesh; now split for easier inspection.",
  },
  carriageway_: {
    match: "prefix",
    title: "Road Carriageway Surface",
    category: "road",
    intro: "Unified carriageway surface across connected road segments.",
    design_note: "May span multiple road arms and junction cores.",
  },
  sidewalk_: {
    match: "prefix",
    title: "Sidewalk Surface",
    category: "sidewalk",
    intro: "Pedestrian sidewalk surface.",
  },
  curb_: {
    match: "prefix",
    title: "Curb Stone",
    category: "landscape",
    intro: "Edge curb separating carriageway from sidewalk.",
  },
  junction_carriageway_core_: {
    match: "prefix",
    title: "Junction Core Surface",
    category: "road",
    intro: "Central intersection junction core surface.",
  },
  junction_crosswalk_: {
    match: "prefix",
    title: "Crosswalk",
    category: "crossing",
    intro: "Pedestrian crossing markings at junction.",
  },
  road_slab: {
    match: "exact",
    title: "Road Surface",
    category: "road",
    intro: "Template-mode road surface slab.",
  },
  context_ground: {
    match: "exact",
    title: "Ground Context",
    category: "scene_object",
    intro: "Surrounding ground plane.",
  },
};

export interface HitDescriptor {
  kind: "instance" | "static" | "generic";
  nodeName: string;
  instanceId?: string;
  instanceInfo?: InstanceInfo;
  assetDescription?: AssetDescription;
  staticDescription?: StaticObjectDescription;
  hitPoint?: THREE.Vector3;
}

export function categoryLabel(category: string): string {
  const key = String(category || "").trim().toLowerCase();
  return CATEGORY_LABELS[key] ?? (key || "场景对象");
}

function prettifySource(source: string | undefined): string {
  const value = String(source || "").trim();
  if (!value) {
    return "系统生成";
  }
  return value.replace(/_/g, " ");
}

export function formatMetric(value: number | null | undefined, unit: string = "", decimals: number = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }
  return `${value.toFixed(decimals)}${unit}`;
}

function collectInstanceMetrics(instanceInfo: InstanceInfo): Array<[string, string]> {
  const metrics: Array<[string, string]> = [
    ["asset_id", String(instanceInfo.asset_id || "").trim()],
    ["placement_group", String(instanceInfo.placement_group || "").trim()],
    ["theme_id", String(instanceInfo.theme_id || "").trim()],
    ["距道路边缘", formatMetric(finiteOrNull(instanceInfo.dist_to_road_edge_m), "m")],
    ["距最近路口", formatMetric(finiteOrNull(instanceInfo.dist_to_nearest_junction_m), "m")],
    ["距最近出入口", formatMetric(finiteOrNull(instanceInfo.dist_to_nearest_entrance_m), "m")],
    ["可行性", formatMetric(finiteOrNull(instanceInfo.feasibility_score), "", 2)],
    ["约束惩罚", formatMetric(finiteOrNull(instanceInfo.constraint_penalty), "", 3)],
  ];
  return metrics.filter((entry) => entry[1] && entry[1] !== "未记录");
}

function buildPlacementReason(instanceInfo: InstanceInfo, category: string): string {
  const anchorPoiType = String(instanceInfo.anchor_poi_type || "").trim();
  const anchorDistance = finiteOrNull(instanceInfo.anchor_distance_m);
  if (anchorPoiType) {
    return `该对象锚定在 ${anchorPoiType} 相关位置，当前距锚点 ${formatMetric(anchorDistance, "m")}。`;
  }
  const source = String(instanceInfo.selection_source || "").trim();
  if (source) {
    return `本对象由 ${prettifySource(source)} 选中，并按当前规则集落位。`;
  }
  return FALLBACK_CATEGORY_INTRO[category] ?? "该对象按当前街道规则自动布置。";
}

function composeInstanceInfoHtml(
  nodeName: string,
  instanceInfo: InstanceInfo,
  assetDescription?: AssetDescription,
): string {
  const category = String(instanceInfo.category || "").trim().toLowerCase();
  const title = categoryLabel(category);
  const subtitleParts = [
    category ? `类别：${categoryLabel(category)}` : "",
    assetDescription?.source ? `来源：${prettifySource(assetDescription.source)}` : "",
  ].filter(Boolean);
  const intro = String(assetDescription?.text_desc || "").trim()
    || FALLBACK_CATEGORY_INTRO[category]
    || "这是场景中的自动生成对象。";
  const metrics = collectInstanceMetrics(instanceInfo);

  return `
    <div class="viewer-card-title">${escapeHtml(title)}</div>
    <div class="viewer-card-subtitle">${escapeHtml(subtitleParts.join(" · ") || `节点：${nodeName}`)}</div>
    <div class="viewer-card-section">${escapeHtml(intro)}</div>
    <div class="viewer-card-section viewer-card-highlight">${escapeHtml(buildPlacementReason(instanceInfo, category))}</div>
    <dl class="viewer-card-metrics">
      ${metrics
        .map(
          ([label, value]) =>
            `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
        )
        .join("")}
    </dl>
  `;
}

function composeInstanceInfoText(
  nodeName: string,
  instanceInfo: InstanceInfo,
  assetDescription?: AssetDescription,
): string {
  const category = String(instanceInfo.category || "").trim().toLowerCase();
  const title = categoryLabel(category);
  const subtitleParts = [
    category ? `类别：${categoryLabel(category)}` : "",
    assetDescription?.source ? `来源：${prettifySource(assetDescription.source)}` : "",
  ].filter(Boolean);
  const subtitle = subtitleParts.join(" · ") || `节点：${nodeName}`;
  const intro = String(assetDescription?.text_desc || "").trim()
    || FALLBACK_CATEGORY_INTRO[category]
    || "这是场景中的自动生成对象。";
  const metrics = collectInstanceMetrics(instanceInfo);
  return [
    title,
    subtitle,
    intro,
    buildPlacementReason(instanceInfo, category),
    ...metrics.map(([label, value]) => `${label}: ${value}`),
  ].filter(Boolean).join("\n");
}

function pointInPolygonRing(x: number, z: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function findZoneForPoint(x: number, z: number, manifest: ViewerManifest): { zone: string; details: string } | null {
  const osm = (manifest.summary ?? {}) as Record<string, unknown>;
  const osmGeom = (osm.osm_geometry ?? {}) as Record<string, unknown>;
  const cwRings = (osmGeom.carriageway_rings ?? []) as number[][][];
  for (let i = 0; i < cwRings.length; i++) {
    if (pointInPolygonRing(x, z, cwRings[i])) {
      return { zone: `Carriageway ${i}`, details: "Inside carriageway surface polygon" };
    }
  }
  const swRings = (osmGeom.sidewalk_rings ?? []) as number[][][];
  for (let i = 0; i < swRings.length; i++) {
    if (pointInPolygonRing(x, z, swRings[i])) {
      return { zone: `Sidewalk ${i}`, details: "Inside sidewalk surface polygon" };
    }
  }
  const junctions = (osmGeom.junction_geometries ?? []) as Array<Record<string, unknown>>;
  for (let i = 0; i < junctions.length; i++) {
    const coreRings = (junctions[i].carriageway_core_rings ?? []) as number[][][];
    for (let r = 0; r < coreRings.length; r++) {
      if (pointInPolygonRing(x, z, coreRings[r])) {
        return { zone: `Junction Core ${i}`, details: `Kind: ${junctions[i].kind ?? "unknown"}` };
      }
    }
  }
  return null;
}

function buildRoadAnalysisHtml(hitPoint: THREE.Vector3, manifest: ViewerManifest): string {
  const summary = (manifest.summary ?? {}) as Record<string, unknown>;
  const osm = (summary.osm_geometry ?? {}) as Record<string, unknown>;
  const rows: string[] = [];

  const zone = findZoneForPoint(hitPoint.x, hitPoint.z, manifest);
  if (zone) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Zone</span><span class="viewer-analysis-value">${escapeHtml(zone.zone)}</span></div>`);
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Details</span><span class="viewer-analysis-value">${escapeHtml(zone.details)}</span></div>`);
  }

  const cwWidth = Number(summary.carriageway_width_m ?? summary.road_width_m ?? 0);
  if (cwWidth > 0) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Carriageway Width</span><span class="viewer-analysis-value">${cwWidth.toFixed(2)} m</span></div>`);
  }
  const rowWidth = Number(summary.row_width_m ?? 0);
  if (rowWidth > 0) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Total Row Width</span><span class="viewer-analysis-value">${rowWidth.toFixed(2)} m</span></div>`);
  }
  const lengthM = Number(summary.length_m ?? 0);
  if (lengthM > 0) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Segment Length</span><span class="viewer-analysis-value">${lengthM.toFixed(1)} m</span></div>`);
  }

  const jCount = (osm.junction_geometries as unknown[] | undefined)?.length ?? 0;
  if (jCount > 0) {
    rows.push(`<div class="viewer-analysis-row"><span class="viewer-analysis-label">Junctions</span><span class="viewer-analysis-value">${jCount}</span></div>`);
  }

  if (rows.length === 0) return "";
  return `<div class="viewer-card-section viewer-analysis-section"><div class="viewer-analysis-title">Road Analysis</div>${rows.join("")}</div>`;
}

function composeStaticInfoHtml(
  nodeName: string,
  description: StaticObjectDescription,
  hitPoint?: THREE.Vector3,
  manifest?: ViewerManifest,
): string {
  const subtitle = [
    `类别：${categoryLabel(description.category)}`,
    description.source ? `来源：${prettifySource(description.source)}` : "来源：系统构件",
  ].join(" · ");
  const analysis = hitPoint && manifest ? buildRoadAnalysisHtml(hitPoint, manifest) : "";
  return `
    <div class="viewer-card-title">${escapeHtml(description.title)}</div>
    <div class="viewer-card-subtitle">${escapeHtml(subtitle)}</div>
    <div class="viewer-card-section">${escapeHtml(description.intro || "这是场景中的基础构件。")}</div>
    <div class="viewer-card-section viewer-card-highlight">${escapeHtml(description.design_note || "用于支撑街道空间组织与交通可读性。")}</div>
    ${analysis}
    <dl class="viewer-card-metrics">
      <div><dt>node</dt><dd>${escapeHtml(nodeName)}</dd></div>
    </dl>
  `;
}

function composeStaticInfoText(nodeName: string, description: StaticObjectDescription): string {
  const subtitle = [
    `类别：${categoryLabel(description.category)}`,
    description.source ? `来源：${prettifySource(description.source)}` : "来源：系统构件",
  ].join(" · ");
  return [
    description.title,
    subtitle,
    description.intro || "这是场景中的基础构件。",
    description.design_note || "用于支撑街道空间组织与交通可读性。",
    `node: ${nodeName}`,
  ].filter(Boolean).join("\n");
}

function composeGenericInfoHtml(nodeName: string): string {
  return `
    <div class="viewer-card-title">场景对象</div>
    <div class="viewer-card-subtitle">未命名规则对象</div>
    <div class="viewer-card-section">当前对象没有更详细的街道说明元数据。</div>
    <dl class="viewer-card-metrics">
      <div><dt>node</dt><dd>${escapeHtml(nodeName)}</dd></div>
    </dl>
  `;
}

function composeGenericInfoText(nodeName: string): string {
  return [
    "场景对象",
    "未命名规则对象",
    "当前对象没有更详细的街道说明元数据。",
    `node: ${nodeName}`,
  ].join("\n");
}

export function buildInfoCardContent(
  descriptor: HitDescriptor,
  manifest?: ViewerManifest,
): { html: string; text: string } {
  if (descriptor.kind === "instance") {
    return {
      html: composeInstanceInfoHtml(
        descriptor.nodeName,
        descriptor.instanceInfo!,
        descriptor.assetDescription,
      ),
      text: composeInstanceInfoText(
        descriptor.nodeName,
        descriptor.instanceInfo!,
        descriptor.assetDescription,
      ),
    };
  }
  if (descriptor.kind === "static") {
    return {
      html: composeStaticInfoHtml(descriptor.nodeName, descriptor.staticDescription!, descriptor.hitPoint, manifest),
      text: composeStaticInfoText(descriptor.nodeName, descriptor.staticDescription!),
    };
  }
  return {
    html: composeGenericInfoHtml(descriptor.nodeName),
    text: composeGenericInfoText(descriptor.nodeName),
  };
}

export function resolveInstanceIdFromName(name: string): string | null {
  const match = String(name || "").match(/(inst_\d{4})/i);
  return match ? match[1] : null;
}

function staticDescriptionForNode(nodeName: string, manifest?: ViewerManifest): StaticObjectDescription | null {
  const descriptions = manifest?.static_object_descriptions ?? {};
  for (const [pattern, description] of Object.entries(descriptions)) {
    if (!description) continue;
    if (description.match === "exact" && nodeName === pattern) {
      return description;
    }
    if (description.match === "prefix" && nodeName.startsWith(pattern)) {
      return description;
    }
  }
  for (const [prefix, description] of Object.entries(SYSTEM_NODE_DESCRIPTIONS)) {
    if (description.match === "exact" && nodeName === prefix) {
      return description;
    }
    if (description.match === "prefix" && nodeName.startsWith(prefix)) {
      return description;
    }
  }
  return null;
}

export function resolveHitDescriptor(
  object: THREE.Object3D,
  hitPoint?: THREE.Vector3,
  manifest?: ViewerManifest,
): HitDescriptor | null {
  let cursor: THREE.Object3D | null = object;
  const names: string[] = [];
  while (cursor) {
    if (cursor.name) {
      names.push(cursor.name);
    }
    cursor = cursor.parent;
  }

  for (const nodeName of names) {
    const instanceId = resolveInstanceIdFromName(nodeName);
    if (!instanceId) continue;
    const instances = manifest?.instances;
    const instanceInfo = instances?.[instanceId];
    if (instanceInfo) {
      return {
        kind: "instance",
        nodeName,
        instanceId,
        instanceInfo: instanceInfo as InstanceInfo,
        assetDescription: manifest?.asset_descriptions?.[(instanceInfo as InstanceInfo).asset_id] as AssetDescription | undefined,
        hitPoint,
      };
    }
    return { kind: "generic", nodeName, hitPoint };
  }

  for (const nodeName of names) {
    const description = staticDescriptionForNode(nodeName, manifest);
    if (description) {
      return {
        kind: "static",
        nodeName,
        staticDescription: description,
        hitPoint,
      };
    }
  }

  const nodeName = names[0];
  return nodeName ? { kind: "generic", nodeName } : null;
}
