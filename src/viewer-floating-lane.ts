/**
 * Floating Lane Overlay for the RoadGen3D Viewer.
 *
 * Renders a 3D overlay showing lane semantics, road geometry, buildings,
 * features, and placement markers on top of the scene.
 */

import * as THREE from "three";
import type { FloatingLaneConfig, ViewerManifest } from "./viewer-types";
import { PER_LANE_COLORS } from "./viewer-types";
import { createTextSprite } from "./viewer-utils";
import type { DesktopShell } from "./desktop-shell";

// ── Color Constants ────────────────────────────────────────────

const FLOATING_COLORS: Record<string, number> = {
  carriageway: 0x3b82f6, drive_lane: 0x60a5fa, bike_lane: 0x22c55e, bus_lane: 0xf59e0b,
  parking_lane: 0x6b7280, clear_path: 0xfaf5e6, furnishing: 0x92400e, sidewalk: 0xd4c4a8,
  median: 0xf97316, greenzone: 0x16a34a, buffer: 0x8b5cf6, frontage: 0x06b6d4,
  shared: 0xa78bfa, default: 0x94a3b8, building: 0x9ca3af,
  building_residential: 0x60a5fa, building_commercial: 0xf59e0b, building_industrial: 0x6b7280,
};

const SAFETY_COLORS: Record<string, number> = {
  carriageway: 0xef4444, bike_lane: 0x22c55e, clear_path: 0x22c55e, sidewalk: 0x22c55e,
  furnishing: 0xeab308, default: 0x94a3b8,
};

const LANE_LABELS: Record<string, string> = {
  carriageway: "机动车道", drive_lane: "行车道", bike_lane: "自行车道", bus_lane: "公交专用",
  parking_lane: "停车带", clear_path: "人行区", furnishing: "设施带", sidewalk: "人行道",
  median: "中央分隔带", greenzone: "绿化带", buffer: "缓冲带", frontage: "退缩带",
  shared: "共享街道", default: "道路", building: "建筑",
};

const CATEGORY_COLORS: Record<string, number> = {
  bench: 0x4ade80, lamp: 0xfbbf24, trash: 0xf87171, tree: 0x22c55e,
  mailbox: 0x60a5fa, hydrant: 0xef4444, bollard: 0xa78bfa, bus_stop: 0xfb923c,
};

type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number; center: THREE.Vector3; extent: number };

// ── Dependencies ───────────────────────────────────────────────

export interface FloatingLaneDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  getManifest: () => ViewerManifest | null;
  getSceneBounds: () => MinimapBounds | null;
  cameraForwardHorizontal: () => THREE.Vector3;
  axisHudEl: HTMLCanvasElement;
  layoutOverlayToggleEl: HTMLInputElement;
  panelHost: HTMLElement;
  shell: DesktopShell;
  shouldDeactivateTab: () => boolean;
}

// ── Public API ────────────────────────────────────────────────

export interface FloatingLaneSystem {
  config: FloatingLaneConfig;
  buildOverlay: () => void;
  clearOverlay: () => void;
  updateAnimation: (deltaTime: number) => void;
  toggleOverlay: () => void;
  selectLane: (bandIndex: number) => void;
  mountControlPanel: () => void;
  getLaneLabel: (kind: string) => string;
}

// ── Factory ────────────────────────────────────────────────────

export function createFloatingLaneSystem(deps: FloatingLaneDeps): FloatingLaneSystem {
  const {
    scene,
    getManifest,
    getSceneBounds,
    cameraForwardHorizontal,
    axisHudEl,
    layoutOverlayToggleEl,
    panelHost,
    shell,
    shouldDeactivateTab,
  } = deps;

  let floatingLaneObjects: THREE.Object3D[] = [];
  let floatingLaneConfig: FloatingLaneConfig = {
    enabled: false, showSurfaces: true, height: 0.5, opacity: 0.5,
    showEdgeLines: true, showLabels: true, animated: false, colorScheme: "semantic",
    selectedLaneIndex: -1, showBuildings: true, showFeatures: true,
    showPlacementMarkers: true, buildingOpacity: 0.4, featureOpacity: 0.6,
  };
  let visibleLaneKinds: Set<string> = new Set(["carriageway", "drive_lane", "clear_path", "furnishing", "sidewalk"]);
  let floatingLaneAnimTime = 0;

  function getFloatingLaneColor(kind: string): number {
    const colors = floatingLaneConfig.colorScheme === "safety" ? SAFETY_COLORS : FLOATING_COLORS;
    return colors[kind] ?? colors["default"] ?? 0x94a3b8;
  }

  function getTurnLaneFloatingKind(patch: Record<string, unknown>): string {
    const sr = String(patch.surface_role ?? "").toLowerCase();
    const sk = String(patch.strip_kind ?? "").toLowerCase();
    if (sr === "bike_lane" || sk === "bike_lane") return "bike_lane";
    if (sr === "bus_lane" || sk === "bus_lane") return "bus_lane";
    if (sr === "parking_lane" || sk === "parking_lane") return "parking_lane";
    if (sr === "furnishing" || sk.includes("furnishing") || sk.includes("buffer")) return "furnishing";
    if (sr === "context_ground" || sk === "frontage_reserve") return "frontage";
    if (sr === "sidewalk" || sk === "clear_sidewalk") return "sidewalk";
    return "carriageway";
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function createFloatingLaneLabel(kind: string, x: number, y: number, z: number, customLabel?: string): THREE.Sprite {
    const label = customLabel ?? LANE_LABELS[kind] ?? LANE_LABELS["default"];
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    roundRect(ctx, 0, 0, 256, 64, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 32);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }),
    );
    sprite.scale.set(4, 1, 1);
    sprite.position.set(x, y, z);
    sprite.userData.isFloatingLane = true;
    sprite.userData.laneLabel = label;
    return sprite;
  }

  function buildPolygonShape(points: number[][]): THREE.Shape {
    const shape = new THREE.Shape();
    if (points.length < 3) return shape;
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    return shape;
  }

  function updateAxisHud(): void {
    const ctx = axisHudEl.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    axisHudEl.width = Math.round(200 * dpr);
    axisHudEl.height = Math.round(60 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 200, 60);
    if (!floatingLaneConfig.enabled) return;

    ctx.fillStyle = "rgba(15,23,42,0.85)";
    roundRect(ctx, 0, 0, 200, 60, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const forward = cameraForwardHorizontal();
    const headingDeg = (-Math.atan2(forward.x, forward.z) * 180 / Math.PI + 360) % 360;

    ctx.fillStyle = "rgba(30,41,59,0.9)";
    ctx.beginPath();
    ctx.arc(35, 30, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < 36; i++) {
      const a = (i * 10 - headingDeg) * Math.PI / 180 - Math.PI / 2;
      const major = i % 9 === 0;
      ctx.strokeStyle = major ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(35 + Math.cos(a) * (22 - (major ? 6 : 3)), 30 + Math.sin(a) * (22 - (major ? 6 : 3)));
      ctx.lineTo(35 + Math.cos(a) * 22, 30 + Math.sin(a) * 22);
      ctx.stroke();
    }

    const dirs = [{ a: 0, l: "N", c: "#ef4444" }, { a: 90, l: "E", c: "#fff" }, { a: 180, l: "S", c: "#fff" }, { a: 270, l: "W", c: "#fff" }];
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const d of dirs) {
      const a = (d.a - headingDeg) * Math.PI / 180 - Math.PI / 2;
      ctx.fillStyle = d.c;
      ctx.fillText(d.l, 35 + Math.cos(a) * 10, 30 + Math.sin(a) * 10);
    }

    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(35, 30, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`${headingDeg.toFixed(0)}°`, 70, 22);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "11px sans-serif";
    ctx.fillText("HEADING", 70, 42);

    const b = getSceneBounds();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`X: ${b ? b.center.x.toFixed(1) : "N/A"}`, 195, 18);
    ctx.fillText(`Z: ${b ? b.center.z.toFixed(1) : "N/A"}`, 195, 32);
  }

  function disposeObject(obj: THREE.Object3D): void {
    scene.remove(obj);
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else (obj.material as THREE.Material).dispose();
    }
    if (obj instanceof THREE.Sprite) { obj.material.map?.dispose(); obj.material.dispose(); }
    if (obj instanceof THREE.LineSegments) { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }
  }

  function clearFloatingLaneOverlay(): void {
    floatingLaneObjects.forEach(disposeObject);
    floatingLaneObjects.length = 0;
    floatingLaneConfig.selectedLaneIndex = -1;
    updateAxisHud();
  }

  function buildFloatingLaneOverlay(): void {
    clearFloatingLaneOverlay();
    const manifest = getManifest();
    if (!manifest?.layout_overlay) { updateAxisHud(); return; }
    updateAxisHud();

    const ov = manifest.layout_overlay;
    const summary = (manifest.summary ?? {}) as Record<string, unknown>;
    const osm = (summary.osm_geometry ?? {}) as Record<string, unknown>;
    const cwRings = (osm.carriageway_rings ?? []) as number[][][];
    const swRings = (osm.sidewalk_rings ?? []) as number[][][];
    const jns = (osm.junction_geometries ?? []) as Array<Record<string, unknown>>;
    const h = floatingLaneConfig.height ?? 0;
    const toXY = (p: number[]): number[] => [p[0], -p[1]];

    for (const ring of cwRings) {
      if (ring.length < 3) continue;
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
        new THREE.MeshBasicMaterial({ color: FLOATING_COLORS.carriageway, transparent: true, opacity: floatingLaneConfig.opacity! * 0.7, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h, 0);
      mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "road";
      scene.add(mesh); floatingLaneObjects.push(mesh);

      if (floatingLaneConfig.showEdgeLines) {
        const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h, p[1]));
        pts.push(pts[0].clone());
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: FLOATING_COLORS.carriageway, transparent: true, opacity: floatingLaneConfig.opacity! * 0.9 }));
        line.userData.isFloatingLane = true;
        scene.add(line); floatingLaneObjects.push(line);
      }
    }

    if (floatingLaneConfig.showEdgeLines) {
      for (const ring of swRings) {
        if (ring.length < 3) continue;
        const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h, p[1]));
        pts.push(pts[0].clone());
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: FLOATING_COLORS.sidewalk, transparent: true, opacity: floatingLaneConfig.opacity! * 0.8 }));
        line.userData.isFloatingLane = true;
        scene.add(line); floatingLaneObjects.push(line);
      }
    }

    for (const j of jns) {
      for (const ring of (j.carriageway_core_rings ?? []) as number[][][]) {
        if (ring.length < 3) continue;
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
          new THREE.MeshBasicMaterial({ color: FLOATING_COLORS.carriageway, transparent: true, opacity: floatingLaneConfig.opacity! * 0.75, depthWrite: false, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h, 0);
        mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "junction";
        scene.add(mesh); floatingLaneObjects.push(mesh);

        if (floatingLaneConfig.showEdgeLines) {
          const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h, p[1]));
          pts.push(pts[0].clone());
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: FLOATING_COLORS.carriageway, transparent: true, opacity: floatingLaneConfig.opacity! * 0.9 }));
          line.userData.isFloatingLane = true;
          scene.add(line); floatingLaneObjects.push(line);
        }
      }

      for (const [pi, patch] of ((j.turn_lane_patches ?? []) as Array<Record<string, unknown>>).entries()) {
        const color = getFloatingLaneColor(getTurnLaneFloatingKind(patch));
        for (const [ri, ring] of ((patch.rings ?? []) as number[][][]).entries()) {
          if (ring.length < 3) continue;
          const mesh = new THREE.Mesh(
            new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.42, depthWrite: false, side: THREE.DoubleSide }),
          );
          mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h + 0.012, 0);
          mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "junction-turn-lane";
          mesh.userData.surfaceId = patch.patch_id ?? `turn_${pi}_${ri}`;
          scene.add(mesh); floatingLaneObjects.push(mesh);

          if (floatingLaneConfig.showEdgeLines) {
            const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h + 0.012, p[1]));
            pts.push(pts[0].clone());
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.8 }));
            line.userData.isFloatingLane = true;
            scene.add(line); floatingLaneObjects.push(line);
          }
        }
      }

      for (const col of [
        { p: (j.lane_surface_patches ?? []) as Array<Record<string, unknown>>, k: "lane" as const },
        { p: (j.merged_surface_patches ?? []) as Array<Record<string, unknown>>, k: "merged" as const },
      ]) {
        for (const [pi, patch] of col.p.entries()) {
          for (const [ri, ring] of ((patch.rings ?? []) as number[][][]).entries()) {
            if (ring.length < 3) continue;
            const color = col.k === "merged" ? 0x8b5cf6 : patch.flow === "outbound" ? 0xdc2626 : 0x2563eb;
            const mesh = new THREE.Mesh(
              new THREE.ShapeGeometry(buildPolygonShape(ring.map(toXY))),
              new THREE.MeshBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * (col.k === "merged" ? 0.35 : 0.28), depthWrite: false, side: THREE.DoubleSide }),
            );
            mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h + 0.01, 0);
            mesh.userData.isFloatingLane = true; mesh.userData.overlayType = `junction-${col.k}`;
            mesh.userData.surfaceId = patch.surface_id ?? `${col.k}_${pi}_${ri}`;
            scene.add(mesh); floatingLaneObjects.push(mesh);

            if (floatingLaneConfig.showEdgeLines) {
              const pts: THREE.Vector3[] = ring.map(p => new THREE.Vector3(p[0], h + 0.01, p[1]));
              pts.push(pts[0].clone());
              const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: floatingLaneConfig.opacity! * 0.75 }));
              line.userData.isFloatingLane = true;
              scene.add(line); floatingLaneObjects.push(line);
            }
          }
        }
      }
    }

    {
      const bh = h + 0.02;
      let rMinX: number, rMaxX: number, rCenterZ = 0;

      if (cwRings.length > 0) {
        let rmi = Infinity, rma = -Infinity, zmi = Infinity, zma = -Infinity;
        for (const ring of cwRings) for (const p of ring) { rmi = Math.min(rmi, p[0]); rma = Math.max(rma, p[0]); zmi = Math.min(zmi, p[1]); zma = Math.max(zma, p[1]); }
        for (const j of jns) for (const ring of (j.carriageway_core_rings ?? []) as number[][][]) for (const p of ring) { rmi = Math.min(rmi, p[0]); rma = Math.max(rma, p[0]); zmi = Math.min(zmi, p[1]); zma = Math.max(zma, p[1]); }
        rMinX = rmi; rMaxX = rma; rCenterZ = (zmi + zma) / 2;
      } else if (manifest?.scene_bounds) {
        const sb = manifest.scene_bounds;
        rMinX = sb.center[0] - sb.size[0] / 2; rMaxX = sb.center[0] + sb.size[0] / 2; rCenterZ = sb.center[2];
      } else {
        const half = (ov.length_m || 100) / 2;
        rMinX = -half; rMaxX = half; rCenterZ = 0;
      }

      const lc = Math.max(1, ov.lane_count ?? 1);
      const rcX = (rMinX + rMaxX) / 2;
      const len = rMaxX - rMinX;

      const addLine = (x1: number, z1: number, x2: number, z2: number, color: number, op: number, dashed = false) => {
        const mat = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: op, dashSize: 1.5, gapSize: 1.0 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: op });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, bh, z1), new THREE.Vector3(x2, bh, z2)]), mat);
        if (dashed) line.computeLineDistances();
        line.userData.isFloatingLane = true;
        scene.add(line); floatingLaneObjects.push(line);
      };

      for (let bi = 0; bi < (ov.bands ?? []).length; bi++) {
        const band = ov.bands![bi];
        if (!band.width_m || !Number.isFinite(band.width_m)) continue;
        if (!visibleLaneKinds.has(band.kind as string) && band.kind !== "default") continue;

        const bZ = rCenterZ + ((band.z_center_m as number) ?? 0);
        const sel = (floatingLaneConfig.selectedLaneIndex ?? -1) === bi;
        const op = sel ? Math.min(floatingLaneConfig.opacity! * 1.5, 0.9) : floatingLaneConfig.opacity! * (floatingLaneConfig.animated ? 0.7 + 0.3 * Math.sin(floatingLaneAnimTime * 3) : 1);

        if ((band.kind as string) === "carriageway" && lc > 0) {
          const lw = (band.width_m as number) / lc;
          const zSt = bZ - (band.width_m as number) / 2;
          const ck = Object.keys(PER_LANE_COLORS);

          for (let i = 0; i < lc; i++) {
            const lzC = zSt + lw * (i + 0.5);
            const lCol = PER_LANE_COLORS[ck[i % ck.length]] as unknown as number;

            const mesh = new THREE.Mesh(
              new THREE.PlaneGeometry(len, lw),
              new THREE.MeshBasicMaterial({ color: lCol, transparent: true, opacity: op * 0.7, depthWrite: false, side: THREE.DoubleSide }),
            );
            mesh.rotation.x = -Math.PI / 2; mesh.position.set(rcX, bh, lzC);
            mesh.userData.isFloatingLane = true; mesh.userData.bandIndex = bi;
            mesh.userData.bandKind = "drive_lane"; mesh.userData.laneIndex = i;
            mesh.userData.overlayType = "lane";
            scene.add(mesh); floatingLaneObjects.push(mesh);

            if (floatingLaneConfig.showEdgeLines) {
              const lL = lzC - lw / 2, lR = lzC + lw / 2;
              if (i === 0) addLine(rMinX, lL, rMaxX, lL, sel ? 0xffffff : lCol, op * 0.9);
              if (i === lc - 1) addLine(rMinX, lR, rMaxX, lR, sel ? 0xffffff : lCol, op * 0.9);
              if (i > 0) addLine(rMinX, lL, rMaxX, lL, 0xffffff, op * 0.7, true);
            }

            if (floatingLaneConfig.showLabels) {
              const sp = createFloatingLaneLabel("drive_lane", rcX, bh + 1.5, lzC, `车道 ${i + 1}`);
              sp.userData.isFloatingLane = true; sp.userData.bandIndex = bi; sp.userData.laneIndex = i;
              scene.add(sp); floatingLaneObjects.push(sp);
            }
          }

          if (floatingLaneConfig.showEdgeLines) {
            addLine(rMinX, zSt, rMinX, zSt + (band.width_m as number), sel ? 0xffffff : (PER_LANE_COLORS[0] as unknown as number), op * 0.9);
            addLine(rMaxX, zSt, rMaxX, zSt + (band.width_m as number), sel ? 0xffffff : (PER_LANE_COLORS[0] as unknown as number), op * 0.9);
          }

          if (sel) {
            const glow = new THREE.Mesh(
              new THREE.PlaneGeometry(len + 0.5, (band.width_m as number) + 0.5),
              new THREE.MeshBasicMaterial({ color: PER_LANE_COLORS[0], transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
            );
            glow.rotation.x = -Math.PI / 2; glow.position.set(rcX, bh - 0.01, bZ);
            glow.userData.isFloatingLane = true;
            scene.add(glow); floatingLaneObjects.push(glow);
          }
        } else {
          const bCol = getFloatingLaneColor(band.kind as string);

          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(len, band.width_m as number),
            new THREE.MeshBasicMaterial({ color: bCol, transparent: true, opacity: op * 0.7, depthWrite: false, side: THREE.DoubleSide }),
          );
          mesh.rotation.x = -Math.PI / 2; mesh.position.set(rcX, bh, bZ);
          mesh.userData.isFloatingLane = true; mesh.userData.bandIndex = bi;
          mesh.userData.bandKind = band.kind; mesh.userData.overlayType = "band";
          scene.add(mesh); floatingLaneObjects.push(mesh);

          if (floatingLaneConfig.showEdgeLines) {
            const hw = (band.width_m as number) / 2;
            addLine(rMinX, bZ - hw, rMaxX, bZ - hw, sel ? 0xffffff : bCol, op * 0.9);
            addLine(rMinX, bZ + hw, rMaxX, bZ + hw, sel ? 0xffffff : bCol, op * 0.9);
            addLine(rMinX, bZ - hw, rMinX, bZ + hw, sel ? 0xffffff : bCol, op * 0.9);
            addLine(rMaxX, bZ - hw, rMaxX, bZ + hw, sel ? 0xffffff : bCol, op * 0.9);
          }

          if (floatingLaneConfig.showLabels) {
            const sp = createFloatingLaneLabel(band.kind as string, rcX, bh + 1.5, bZ);
            sp.userData.isFloatingLane = true; sp.userData.bandIndex = bi;
            scene.add(sp); floatingLaneObjects.push(sp);
          }

          if (sel) {
            const glow = new THREE.Mesh(
              new THREE.PlaneGeometry(len + 0.5, (band.width_m as number) + 0.5),
              new THREE.MeshBasicMaterial({ color: bCol, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
            );
            glow.rotation.x = -Math.PI / 2; glow.position.set(rcX, bh - 0.01, bZ);
            glow.userData.isFloatingLane = true;
            scene.add(glow); floatingLaneObjects.push(glow);
          }
        }
      }
    }

    if (floatingLaneConfig.showBuildings) {
      for (let i = 0; i < (ov.building_footprints ?? []).length; i++) {
        const fp = ov.building_footprints![i];
        const pts = fp.polygon_xz;
        if (!Array.isArray(pts) || pts.length < 3) continue;

        const lu = (fp.land_use_type as string)?.toLowerCase() ?? "";
        const ck = lu.includes("residential") ? "building_residential" : lu.includes("commercial") ? "building_commercial" : lu.includes("industrial") ? "building_industrial" : "building";
        const col = FLOATING_COLORS[ck] ?? FLOATING_COLORS.building;

        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(buildPolygonShape(pts.map(p => [p[0], -p[1]]))),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: floatingLaneConfig.buildingOpacity, depthWrite: false, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, h, 0);
        mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "building"; mesh.userData.buildingIndex = i;
        scene.add(mesh); floatingLaneObjects.push(mesh);

        if (floatingLaneConfig.showEdgeLines) {
          const pts3: THREE.Vector3[] = pts.map(p => new THREE.Vector3(p[0], h, p[1]));
          pts3.push(pts3[0].clone());
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: floatingLaneConfig.buildingOpacity! * 1.2 }));
          line.userData.isFloatingLane = true;
          scene.add(line); floatingLaneObjects.push(line);
        }

        if (floatingLaneConfig.showLabels && fp.centroid_xz) {
          const c = fp.centroid_xz as [number, number];
          const sp = createFloatingLaneLabel("building", c[0], h + 2, c[1]);
          sp.userData.isFloatingLane = true; sp.userData.buildingIndex = i;
          scene.add(sp); floatingLaneObjects.push(sp);
        }
      }
    }

    const insts = getManifest()?.instances;
    if (floatingLaneConfig.showFeatures && insts) {
      const fCats = ["tree", "lamp", "bench", "trash", "bollard", "bus_stop"];
      for (const [, info] of Object.entries(insts)) {
        const ii = info as { category?: string; position_xyz?: [number, number, number] };
        if (!ii.position_xyz) continue;
        const cat = String(ii.category || "").toLowerCase();
        if (!fCats.includes(cat)) continue;

        const [x, , z] = ii.position_xyz;
        const col = FLOATING_COLORS[cat] ?? FLOATING_COLORS.default;
        const r = cat === "tree" ? 1.5 : 0.5;

        const mesh = new THREE.Mesh(
          new THREE.CircleGeometry(r, 16),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: floatingLaneConfig.featureOpacity, depthWrite: false, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, h, z);
        mesh.userData.isFloatingLane = true; mesh.userData.overlayType = "feature"; mesh.userData.featureCategory = cat;
        scene.add(mesh); floatingLaneObjects.push(mesh);

        if (floatingLaneConfig.showLabels) {
          const sp = createFloatingLaneLabel(cat, x, h + 1, z);
          sp.userData.isFloatingLane = true; sp.userData.featureCategory = cat;
          scene.add(sp); floatingLaneObjects.push(sp);
        }
      }
    }

    if (floatingLaneConfig.showPlacementMarkers && insts) {
      const geo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8);
      for (const [, info] of Object.entries(insts)) {
        const ii = info as { category?: string; position_xyz?: [number, number, number] };
        const cat = String(ii.category || "").trim().toLowerCase();
        const col = CATEGORY_COLORS[cat] ?? 0x38bdf8;

        const marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
        if (ii.position_xyz) marker.position.set(ii.position_xyz[0], (ii.position_xyz[1] || 0) + 0.6, ii.position_xyz[2]);
        marker.userData.isFloatingLane = true; marker.userData.overlayType = "marker";
        scene.add(marker); floatingLaneObjects.push(marker);

        const label = createTextSprite(cat, col);
        label.position.set(marker.position.x, marker.position.y + 1.2, marker.position.z);
        label.userData.isFloatingLane = true;
        scene.add(label); floatingLaneObjects.push(label);
      }
    }
  }

  function updateFloatingLaneOverlay(deltaTime: number): void {
    if (!floatingLaneConfig.enabled || !floatingLaneConfig.animated) return;
    floatingLaneAnimTime += deltaTime;
    buildFloatingLaneOverlay();
  }

  function updateControlPanelVisibility(): void {
    const panel = document.getElementById("floating-lane-panel");
    if (panel) {
      panel.style.display = floatingLaneConfig.enabled ? "block" : "none";
    }
  }

  function mountControlPanel(): void {
    const panelId = "floating-lane-panel";
    if (document.getElementById(panelId)) {
      updateControlPanelVisibility();
      return;
    }

    panelHost.innerHTML = "";
    const panel = document.createElement("div");
    panel.id = panelId;
    panel.className = "floating-lane-panel";
    panel.innerHTML = `
      <div class="flp-section">
        <label>Controls</label>
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-enabled" ${floatingLaneConfig.enabled ? "checked" : ""}>
          Enable Overlay
        </label>
      </div>
      <div class="flp-slider-group">
        <label>Height: <span id="flp-height-val">${(floatingLaneConfig.height ?? 0.5).toFixed(1)}m</span></label>
        <input type="range" id="flp-height" min="0.1" max="3" step="0.1" value="${floatingLaneConfig.height ?? 0.5}">
      </div>
      <div class="flp-slider-group">
        <label>Road Opacity: <span id="flp-opacity-val">${(floatingLaneConfig.opacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.opacity}">
      </div>
      <div class="flp-section">
        <label>Visible Elements</label>
        <div class="flp-checkboxes-row">
          <label class="flp-checkbox">
            <input type="checkbox" id="flp-buildings" ${floatingLaneConfig.showBuildings ? "checked" : ""}>
            Buildings
          </label>
          <label class="flp-checkbox">
            <input type="checkbox" id="flp-features" ${floatingLaneConfig.showFeatures ? "checked" : ""}>
            Features (Trees)
          </label>
        </div>
      </div>
      <div class="flp-slider-group" id="flp-building-opacity-group">
        <label>Building Opacity: <span id="flp-building-opacity-val">${(floatingLaneConfig.buildingOpacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-building-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.buildingOpacity}">
      </div>
      <div class="flp-slider-group" id="flp-feature-opacity-group">
        <label>Feature Opacity: <span id="flp-feature-opacity-val">${(floatingLaneConfig.featureOpacity! * 100).toFixed(0)}%</span></label>
        <input type="range" id="flp-feature-opacity" min="0.1" max="1" step="0.05" value="${floatingLaneConfig.featureOpacity}">
      </div>
      <div class="flp-section">
        <label>Visible Lane Types</label>
        <div class="flp-checkboxes" id="flp-lane-kinds">
          ${["carriageway", "drive_lane", "bike_lane", "bus_lane", "clear_path", "furnishing", "sidewalk", "greenzone"].map(kind => `
            <label class="flp-checkbox">
              <input type="checkbox" data-kind="${kind}" ${visibleLaneKinds.has(kind) ? "checked" : ""}>
              ${LANE_LABELS[kind] || kind}
            </label>
          `).join("")}
        </div>
      </div>
      <div class="flp-section">
        <label>Color Scheme</label>
        <select id="flp-color-scheme">
          <option value="semantic" ${floatingLaneConfig.colorScheme === "semantic" ? "selected" : ""}>Semantic</option>
          <option value="functional" ${floatingLaneConfig.colorScheme === "functional" ? "selected" : ""}>Functional</option>
          <option value="safety" ${floatingLaneConfig.colorScheme === "safety" ? "selected" : ""}>Safety</option>
        </select>
      </div>
      <div class="flp-checkboxes-row">
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-edges" ${floatingLaneConfig.showEdgeLines ? "checked" : ""}>
          Edge Lines
        </label>
        <label class="flp-checkbox">
          <input type="checkbox" id="flp-labels" ${floatingLaneConfig.showLabels ? "checked" : ""}>
          Labels
        </label>
      </div>
      <label class="flp-checkbox">
        <input type="checkbox" id="flp-animated" ${floatingLaneConfig.animated ? "checked" : ""}>
        Animated Pulse
      </label>
      <div class="flp-hint">Press L to toggle | Use carriagewayRings</div>
    `;

    panelHost.appendChild(panel);

    document.getElementById("flp-enabled")?.addEventListener("change", (event) => {
      floatingLaneConfig.enabled = (event.target as HTMLInputElement).checked;
      layoutOverlayToggleEl.checked = floatingLaneConfig.enabled;
      if (floatingLaneConfig.enabled) {
        buildFloatingLaneOverlay();
      } else {
        clearFloatingLaneOverlay();
      }
      updateControlPanelVisibility();
    });

    document.getElementById("flp-height")?.addEventListener("input", (event) => {
      floatingLaneConfig.height = parseFloat((event.target as HTMLInputElement).value);
      document.getElementById("flp-height-val")!.textContent = `${floatingLaneConfig.height.toFixed(1)}m`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-opacity")?.addEventListener("input", (event) => {
      floatingLaneConfig.opacity = parseFloat((event.target as HTMLInputElement).value);
      document.getElementById("flp-opacity-val")!.textContent = `${(floatingLaneConfig.opacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-color-scheme")?.addEventListener("change", (event) => {
      floatingLaneConfig.colorScheme = (event.target as HTMLSelectElement).value as "semantic" | "functional" | "safety";
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-edges")?.addEventListener("change", (event) => {
      floatingLaneConfig.showEdgeLines = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-labels")?.addEventListener("change", (event) => {
      floatingLaneConfig.showLabels = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-animated")?.addEventListener("change", (event) => {
      floatingLaneConfig.animated = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-buildings")?.addEventListener("change", (event) => {
      floatingLaneConfig.showBuildings = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-features")?.addEventListener("change", (event) => {
      floatingLaneConfig.showFeatures = (event.target as HTMLInputElement).checked;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-building-opacity")?.addEventListener("input", (event) => {
      floatingLaneConfig.buildingOpacity = parseFloat((event.target as HTMLInputElement).value);
      document.getElementById("flp-building-opacity-val")!.textContent = `${(floatingLaneConfig.buildingOpacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-feature-opacity")?.addEventListener("input", (event) => {
      floatingLaneConfig.featureOpacity = parseFloat((event.target as HTMLInputElement).value);
      document.getElementById("flp-feature-opacity-val")!.textContent = `${(floatingLaneConfig.featureOpacity! * 100).toFixed(0)}%`;
      buildFloatingLaneOverlay();
    });

    document.getElementById("flp-lane-kinds")?.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (!target.dataset.kind) return;
      if (target.checked) {
        visibleLaneKinds.add(target.dataset.kind);
      } else {
        visibleLaneKinds.delete(target.dataset.kind);
      }
      buildFloatingLaneOverlay();
    });

    updateControlPanelVisibility();
  }

  function toggleFloatingLaneOverlay(): void {
    floatingLaneConfig.enabled = !floatingLaneConfig.enabled;
    layoutOverlayToggleEl.checked = floatingLaneConfig.enabled;
    const enabledEl = document.getElementById("flp-enabled") as HTMLInputElement | null;
    if (enabledEl) enabledEl.checked = floatingLaneConfig.enabled;
    if (floatingLaneConfig.enabled) {
      buildFloatingLaneOverlay();
      mountControlPanel();
      shell.activateRightTab("floating-lane");
    } else {
      clearFloatingLaneOverlay();
      updateControlPanelVisibility();
      if (shouldDeactivateTab()) {
        shell.activateRightTab(null);
      }
    }
  }

  function selectFloatingLane(bandIndex: number): void {
    floatingLaneConfig.selectedLaneIndex = floatingLaneConfig.selectedLaneIndex === bandIndex ? -1 : bandIndex;
    buildFloatingLaneOverlay();
  }

  return {
    get config() { return floatingLaneConfig; },
    buildOverlay: buildFloatingLaneOverlay,
    clearOverlay: clearFloatingLaneOverlay,
    updateAnimation: updateFloatingLaneOverlay,
    toggleOverlay: toggleFloatingLaneOverlay,
    selectLane: selectFloatingLane,
    mountControlPanel,
    getLaneLabel: (kind: string) => LANE_LABELS[kind] || kind,
  };
}
