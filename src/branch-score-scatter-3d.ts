import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BranchRunStatusPayload, BranchScatterPoint } from "./viewer-types";
import { clamp, createTextSprite, disposeObject, escapeHtml } from "./viewer-utils";

type BranchScatterInstance = {
  dispose: () => void;
};

type ScoreAxis = "walkability" | "safety" | "beauty";

type AxisDomain = {
  key: ScoreAxis;
  min: number;
  max: number;
  span: number;
};

type ScoreDomains = Record<ScoreAxis, AxisDomain>;
type FeatureColorDomain = {
  feature: string;
  min: number;
  max: number;
  span: number;
} | null;

let activeInstance: BranchScatterInstance | null = null;
const PLOT_SIZE = 100;
const AXIS_END = 106;
const GRID_TICKS = [0, 25, 50, 75, 100];

function numericScore(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pointScore(point: BranchScatterPoint, key: ScoreAxis): number | null {
  const value = point[key] ?? (key === "walkability" ? point.x : key === "safety" ? point.y : point.z);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pointColor(point: BranchScatterPoint, colorDomain: FeatureColorDomain = null): THREE.Color {
  if (point.status !== "succeeded") return new THREE.Color("#94a3b8");
  if (colorDomain) {
    const value = pointFeatureValue(point, colorDomain.feature);
    if (value !== null) {
      const t = colorDomain.span <= 0 ? 0.5 : clamp((value - colorDomain.min) / colorDomain.span, 0, 1);
      return new THREE.Color("#2563eb").lerp(new THREE.Color("#f59e0b"), t);
    }
  }
  const overall = clamp(numericScore(point.overall, 50), 0, 100) / 100;
  if (point.preset_color) {
    return new THREE.Color(point.preset_color).lerp(new THREE.Color("#ffffff"), 0.34 * (1 - overall));
  }
  return new THREE.Color("#ef4444").lerp(new THREE.Color("#16a34a"), overall);
}

function formatScore(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "N/A";
}

function formatDelta(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  if (Math.abs(value) < 0.05) return "0";
  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

function buildTooltip(point: BranchScatterPoint, colorBy = ""): string {
  const paretoLabel = point.is_pareto_front
    ? "Pareto front"
    : (typeof point.pareto_rank === "number" ? `Layer ${point.pareto_rank + 1}` : "Not ranked");
  const colorValue = colorBy ? pointFeatureValue(point, colorBy) : null;
  return `
    <strong>${escapeHtml(point.label || `${point.node_id}`)}</strong>
    <span>${escapeHtml(point.node_id)}</span>
    <dl>
      ${point.preset_name || point.preset_id ? `<div><dt>Preset</dt><dd>${escapeHtml(point.preset_name || point.preset_id || "")}</dd></div>` : ""}
      <div><dt>Walk</dt><dd>${formatScore(pointScore(point, "walkability"))} <em>${formatDelta(point.delta_walkability)}</em></dd></div>
      <div><dt>Safe</dt><dd>${formatScore(pointScore(point, "safety"))} <em>${formatDelta(point.delta_safety)}</em></dd></div>
      <div><dt>Beauty</dt><dd>${formatScore(pointScore(point, "beauty"))} <em>${formatDelta(point.delta_beauty)}</em></dd></div>
      <div><dt>Overall</dt><dd>${formatScore(point.overall)} <em>${formatDelta(point.delta_overall)}</em></dd></div>
      ${colorBy ? `<div><dt>Color</dt><dd>${escapeHtml(colorBy)} = ${colorValue === null ? "N/A" : escapeHtml(formatFeatureValue(colorValue))}</dd></div>` : ""}
      <div><dt>Pareto</dt><dd>${escapeHtml(paretoLabel)}</dd></div>
      <div><dt>Dominated</dt><dd>${escapeHtml(String(point.dominated_by_count ?? 0))}</dd></div>
    </dl>
  `;
}

function flattenPointFeatures(point: BranchScatterPoint): Record<string, unknown> {
  const features = point.analysis_features ?? {};
  const flat: Record<string, unknown> = {};
  for (const [prefix, values] of Object.entries({
    input: features.input ?? {},
    scene: features.scene ?? {},
    derived: features.derived ?? {},
  })) {
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      flat[`${prefix}.${key}`] = value;
      flat[key] = value;
    }
  }
  return flat;
}

function pointFeatureValue(point: BranchScatterPoint, feature: string): number | null {
  const value = flattenPointFeatures(point)[feature];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatFeatureValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function computeFeatureColorDomain(points: BranchScatterPoint[], feature: string): FeatureColorDomain {
  if (!feature) return null;
  const values = points
    .map((point) => pointFeatureValue(point, feature))
    .filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  return { feature, min, max, span: max - min };
}

function rawPointVector(point: BranchScatterPoint): THREE.Vector3 | null {
  const walkability = pointScore(point, "walkability");
  const safety = pointScore(point, "safety");
  const beauty = pointScore(point, "beauty");
  if (walkability === null || safety === null || beauty === null) return null;
  return new THREE.Vector3(walkability, safety, beauty);
}

function computeAxisDomain(points: BranchScatterPoint[], key: ScoreAxis): AxisDomain {
  const values = points
    .map((point) => pointScore(point, key))
    .filter((value): value is number => value !== null);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawSpan = rawMax - rawMin;
  const minimumSpan = 6;
  const paddedSpan = Math.max(rawSpan * 1.22, minimumSpan);
  const center = (rawMin + rawMax) / 2;
  return {
    key,
    min: center - paddedSpan / 2,
    max: center + paddedSpan / 2,
    span: paddedSpan,
  };
}

function computeScoreDomains(points: BranchScatterPoint[]): ScoreDomains {
  return {
    walkability: computeAxisDomain(points, "walkability"),
    safety: computeAxisDomain(points, "safety"),
    beauty: computeAxisDomain(points, "beauty"),
  };
}

function scoreToPlot(value: number, domain: AxisDomain): number {
  return clamp(((value - domain.min) / domain.span) * PLOT_SIZE, 0, PLOT_SIZE);
}

function plotToScore(value: number, domain: AxisDomain): number {
  return domain.min + (value / PLOT_SIZE) * domain.span;
}

function formatTick(value: number): string {
  return `${Math.round(value)}`;
}

function pointVector(point: BranchScatterPoint, domains: ScoreDomains): THREE.Vector3 | null {
  const raw = rawPointVector(point);
  if (!raw) return null;
  return new THREE.Vector3(
    scoreToPlot(raw.x, domains.walkability),
    scoreToPlot(raw.y, domains.safety),
    scoreToPlot(raw.z, domains.beauty),
  );
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function duplicateCoordinateKey(point: BranchScatterPoint): string {
  return [
    pointScore(point, "walkability")?.toFixed(2) ?? "",
    pointScore(point, "safety")?.toFixed(2) ?? "",
    pointScore(point, "beauty")?.toFixed(2) ?? "",
  ].join("|");
}

function jitteredPosition(
  position: THREE.Vector3,
  point: BranchScatterPoint,
  duplicateTotals: Map<string, number>,
): THREE.Vector3 {
  const total = duplicateTotals.get(duplicateCoordinateKey(point)) ?? 0;
  if (total <= 1) return position;
  const angle = (stableHash(point.node_id) / 0xffffffff) * Math.PI * 2;
  const radius = Math.min(2.2, 0.55 + total * 0.1);
  return new THREE.Vector3(
    clamp(position.x + Math.cos(angle) * radius, 0, PLOT_SIZE),
    clamp(position.y + Math.sin(angle * 1.7) * radius * 0.55, 0, PLOT_SIZE),
    clamp(position.z + Math.sin(angle) * radius, 0, PLOT_SIZE),
  );
}

function addParetoSurface(scene: THREE.Scene, points: BranchScatterPoint[], domains: ScoreDomains): void {
  const front = points
    .filter((point) => point.is_pareto_front)
    .map((point) => ({ point, position: pointVector(point, domains) }))
    .filter((item): item is { point: BranchScatterPoint; position: THREE.Vector3 } => item.position !== null);
  if (front.length < 3) return;

  const center = front.reduce((sum, item) => sum.add(item.position), new THREE.Vector3()).multiplyScalar(1 / front.length);
  const ordered = [...front].sort((a, b) => (
    Math.atan2(a.position.z - center.z, a.position.x - center.x)
    - Math.atan2(b.position.z - center.z, b.position.x - center.x)
  ));

  const vertices: number[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index].position;
    const next = ordered[(index + 1) % ordered.length].position;
    vertices.push(center.x, center.y, center.z, current.x, current.y, current.z, next.x, next.y, next.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: "#38bdf8",
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0.02,
    }),
  ));

  const linePositions: number[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index].position;
    const next = ordered[(index + 1) % ordered.length].position;
    linePositions.push(current.x, current.y, current.z, next.x, next.y, next.z);
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
  scene.add(new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: "#0284c7", transparent: true, opacity: 0.7 }),
  ));
}

function addAxis(scene: THREE.Scene, end: THREE.Vector3, color: string, label: string): void {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 });
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), end]);
  scene.add(new THREE.Line(geometry, material));
  const arrow = new THREE.ArrowHelper(end.clone().normalize(), end.clone().multiplyScalar(0.95), 5.2, color, 2.7, 1.5);
  scene.add(arrow);
  const sprite = createTextSprite(label, {
    fontSize: 34,
    color,
    bgColor: "rgba(255, 255, 255, 0.78)",
    padding: 8,
    borderRadius: 7,
    fontWeight: "800",
  });
  sprite.position.copy(end.clone().multiplyScalar(1.08));
  sprite.scale.multiplyScalar(5.2);
  scene.add(sprite);
}

function addLine(scene: THREE.Scene, points: THREE.Vector3[], color = "#cbd5e1", opacity = 0.32): void {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  ));
}

function addTickLabel(scene: THREE.Scene, value: string, position: THREE.Vector3): void {
  const sprite = createTextSprite(value, {
    fontSize: 24,
    color: "#64748b",
    bgColor: "rgba(255, 255, 255, 0.64)",
    padding: 5,
    borderRadius: 5,
    fontWeight: "700",
  });
  sprite.position.copy(position);
  sprite.scale.multiplyScalar(3.6);
  scene.add(sprite);
}

function addGrid(scene: THREE.Scene, domains: ScoreDomains): void {
  for (const value of GRID_TICKS) {
    addLine(scene, [new THREE.Vector3(value, 0, 0), new THREE.Vector3(value, 0, PLOT_SIZE)]);
    addLine(scene, [new THREE.Vector3(0, 0, value), new THREE.Vector3(PLOT_SIZE, 0, value)]);
    addLine(scene, [new THREE.Vector3(0, value, 0), new THREE.Vector3(PLOT_SIZE, value, 0)]);
    addLine(scene, [new THREE.Vector3(PLOT_SIZE, value, 0), new THREE.Vector3(PLOT_SIZE, value, PLOT_SIZE)]);
  }

  const edges: Array<[THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(PLOT_SIZE, 0, 0)],
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, PLOT_SIZE, 0)],
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, PLOT_SIZE)],
    [new THREE.Vector3(PLOT_SIZE, 0, 0), new THREE.Vector3(PLOT_SIZE, PLOT_SIZE, 0)],
    [new THREE.Vector3(PLOT_SIZE, 0, 0), new THREE.Vector3(PLOT_SIZE, 0, PLOT_SIZE)],
    [new THREE.Vector3(0, PLOT_SIZE, 0), new THREE.Vector3(PLOT_SIZE, PLOT_SIZE, 0)],
    [new THREE.Vector3(0, PLOT_SIZE, 0), new THREE.Vector3(0, PLOT_SIZE, PLOT_SIZE)],
    [new THREE.Vector3(0, 0, PLOT_SIZE), new THREE.Vector3(PLOT_SIZE, 0, PLOT_SIZE)],
    [new THREE.Vector3(0, 0, PLOT_SIZE), new THREE.Vector3(0, PLOT_SIZE, PLOT_SIZE)],
    [new THREE.Vector3(PLOT_SIZE, PLOT_SIZE, 0), new THREE.Vector3(PLOT_SIZE, PLOT_SIZE, PLOT_SIZE)],
    [new THREE.Vector3(PLOT_SIZE, 0, PLOT_SIZE), new THREE.Vector3(PLOT_SIZE, PLOT_SIZE, PLOT_SIZE)],
    [new THREE.Vector3(0, PLOT_SIZE, PLOT_SIZE), new THREE.Vector3(PLOT_SIZE, PLOT_SIZE, PLOT_SIZE)],
  ];
  for (const [start, end] of edges) {
    addLine(scene, [start, end], "#94a3b8", 0.28);
  }

  for (const value of [0, 50, 100]) {
    addTickLabel(scene, formatTick(plotToScore(value, domains.walkability)), new THREE.Vector3(value, -5, -4));
    addTickLabel(scene, formatTick(plotToScore(value, domains.safety)), new THREE.Vector3(-5, value, -4));
    addTickLabel(scene, formatTick(plotToScore(value, domains.beauty)), new THREE.Vector3(-6, -5, value));
  }
}

export function mountBranchScoreScatter3d(
  root: HTMLElement,
  payload: BranchRunStatusPayload,
  selectedId: string | null,
  onSelect: (nodeId: string) => void,
): void {
  activeInstance?.dispose();
  activeInstance = null;

  const container = root.querySelector<HTMLElement>("[data-branch-score-scatter]");
  if (!container) return;
  const tooltip = root.querySelector<HTMLElement>("[data-branch-score-tooltip]");
  const colorSelect = root.querySelector<HTMLSelectElement>("[data-branch-color-by]");
  const colorBy = colorSelect?.value.trim() || "";
  const points = (payload.scatter_points ?? []).filter((point) => (
    pointScore(point, "walkability") !== null
    && pointScore(point, "safety") !== null
    && pointScore(point, "beauty") !== null
  ));
  if (points.length === 0) {
    container.innerHTML = `<div class="viewer-design-workspace-muted">等待三维评分齐全的场景。</div>`;
    return;
  }

  container.innerHTML = "";
  const width = Math.max(320, container.clientWidth || 640);
  const height = Math.max(340, container.clientHeight || 420);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f8fafc");
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const domains = computeScoreDomains(points);
  const colorDomain = computeFeatureColorDomain(points, colorBy);

  addGrid(scene, domains);
  addParetoSurface(scene, points, domains);
  addAxis(scene, new THREE.Vector3(AXIS_END, 0, 0), "#2563eb", "Walkability");
  addAxis(scene, new THREE.Vector3(0, AXIS_END, 0), "#dc2626", "Safety");
  addAxis(scene, new THREE.Vector3(0, 0, AXIS_END), "#0891b2", "Beauty");

  const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 1200);
  camera.position.set(138, 122, 150);
  camera.lookAt(PLOT_SIZE / 2, PLOT_SIZE * 0.45, PLOT_SIZE / 2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(PLOT_SIZE / 2, PLOT_SIZE * 0.45, PLOT_SIZE / 2);
  controls.minDistance = 62;
  controls.maxDistance = 280;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointMeshes: THREE.Mesh[] = [];
  const duplicateTotals = new Map<string, number>();
  for (const point of points) {
    const key = duplicateCoordinateKey(point);
    duplicateTotals.set(key, (duplicateTotals.get(key) ?? 0) + 1);
  }

  for (const point of points) {
    const position = pointVector(point, domains);
    if (!position) continue;
    const selected = point.node_id === selectedId;
    const pareto = Boolean(point.is_pareto_front);
    const scoreFactor = clamp(numericScore(point.overall, 50), 0, 100) / 100;
    const radius = selected ? 1.95 : (pareto ? 1.45 : 0.82 + scoreFactor * 0.35);
	    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 14, 10),
	      new THREE.MeshStandardMaterial({
	        color: pointColor(point, colorDomain),
        emissive: selected || pareto ? new THREE.Color(selected ? "#facc15" : "#38bdf8") : new THREE.Color("#000000"),
        emissiveIntensity: selected ? 0.42 : (pareto ? 0.2 : 0),
        transparent: true,
        opacity: selected ? 1 : (pareto ? 0.92 : 0.78),
        roughness: 0.45,
        metalness: 0.08,
      }),
    );
    mesh.position.copy(jitteredPosition(position, point, duplicateTotals));
    mesh.userData.branchPoint = point;
    scene.add(mesh);
    pointMeshes.push(mesh);

    if (selected) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.85, 0.08, 8, 36),
        new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.9 }),
      );
      ring.position.copy(mesh.position);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
    }
  }

	  function setTooltip(point: BranchScatterPoint | null, event?: PointerEvent): void {
    if (!tooltip) return;
    if (!point || !event) {
      tooltip.hidden = true;
      return;
    }
	    tooltip.innerHTML = buildTooltip(point, colorDomain?.feature ?? "");
    const bounds = root.getBoundingClientRect();
    tooltip.style.left = `${Math.min(bounds.width - 220, Math.max(12, event.clientX - bounds.left + 14))}px`;
    tooltip.style.top = `${Math.min(bounds.height - 160, Math.max(12, event.clientY - bounds.top + 14))}px`;
    tooltip.hidden = false;
  }

  function hitTest(event: PointerEvent): THREE.Mesh | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pointMeshes, false)[0]?.object;
    return hit instanceof THREE.Mesh ? hit : null;
  }

  const onPointerMove = (event: PointerEvent) => {
    const hit = hitTest(event);
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    setTooltip(hit?.userData.branchPoint ?? null, event);
  };
  const onPointerLeave = () => setTooltip(null);
	  const onPointerClick = (event: PointerEvent) => {
    const hit = hitTest(event);
    const point = hit?.userData.branchPoint as BranchScatterPoint | undefined;
    if (point?.node_id) onSelect(point.node_id);
	  };
  const onColorChange = () => {
    mountBranchScoreScatter3d(root, payload, selectedId, onSelect);
  };

  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
  renderer.domElement.addEventListener("click", onPointerClick);
  colorSelect?.addEventListener("change", onColorChange);

  let disposed = false;
  const animate = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();

  activeInstance = {
    dispose: () => {
      disposed = true;
	      renderer.domElement.removeEventListener("pointermove", onPointerMove);
	      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
	      renderer.domElement.removeEventListener("click", onPointerClick);
	      colorSelect?.removeEventListener("change", onColorChange);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
