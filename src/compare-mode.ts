import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ViewerManifest } from "./viewer-types";

export interface CompareModeDependencies {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  loader: GLTFLoader;
  getCurrentRoot: () => THREE.Object3D | null;
  flashStatus: (message: string) => void;
  setStatus: (message: string) => void;
  compareResultsEl: HTMLElement;
  exitCompare3dEl: HTMLButtonElement;
  escapeHtml: (text: string) => string;
  compactUiLabel: (label: string) => string;
  disposeObject: (root: THREE.Object3D) => void;
  loadManifest: (layoutPath: string) => Promise<ViewerManifest>;
  compareSelectAEl: HTMLSelectElement;
  compareSelectBEl: HTMLSelectElement;
}

export function createCompareMode(deps: CompareModeDependencies) {
  let compare3dActive = false;
  let compareRootA: THREE.Object3D | null = null;
  let compareRootB: THREE.Object3D | null = null;
  const compareCameraA = deps.camera.clone();
  const compareCameraB = deps.camera.clone();

  function isNumeric(value: unknown): boolean {
    return typeof value === "number" && Number.isFinite(value);
  }

  function comparisonDiffArrow(a: number, b: number): string {
    if (b > a) return `<span style="color:#16a34a">&#9650; ${(b - a).toFixed(3)}</span>`;
    if (b < a) return `<span style="color:#dc2626">&#9660; ${(a - b).toFixed(3)}</span>`;
    return `<span style="color:#94a3b8">-</span>`;
  }

  function computeConfigDiff(
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const diff: Record<string, unknown> = { added: {}, removed: {}, changed: {} };
    const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);
    for (const key of Array.from(allKeys).sort()) {
      const inOld = key in oldConfig;
      const inNew = key in newConfig;
      if (inOld && !inNew) {
        (diff.removed as Record<string, unknown>)[key] = oldConfig[key];
      } else if (inNew && !inOld) {
        (diff.added as Record<string, unknown>)[key] = newConfig[key];
      } else if (oldConfig[key] !== newConfig[key]) {
        (diff.changed as Record<string, unknown>)[key] = { old: oldConfig[key], new: newConfig[key] };
      }
    }
    return diff;
  }

  function computeMetricsDiff(
    oldSummary: Record<string, unknown>,
    newSummary: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const allKeys = new Set([...Object.keys(oldSummary), ...Object.keys(newSummary)]);
    const results: Array<Record<string, unknown>> = [];
    for (const key of Array.from(allKeys).sort()) {
      const oldVal = oldSummary[key];
      const newVal = newSummary[key];
      const oldNum = isNumeric(oldVal) ? Number(oldVal) : null;
      const newNum = isNumeric(newVal) ? Number(newVal) : null;
      if (oldNum === null && newNum === null) continue;
      const oldF = oldNum ?? 0;
      const newF = newNum ?? 0;
      const delta = newF - oldF;
      let deltaPct = 0;
      if (oldF !== 0) {
        deltaPct = delta / oldF;
      } else if (newF !== 0) {
        deltaPct = delta > 0 ? Infinity : -Infinity;
      }
      results.push({
        key,
        old: oldNum,
        new: newNum,
        delta: Math.round(delta * 1e6) / 1e6,
        deltaPct: Number.isFinite(deltaPct) ? Math.round(deltaPct * 1e6) / 1e6 : null,
      });
    }
    return results;
  }

  function positionXz(placement: Record<string, unknown>): [number, number] {
    const pos = Array.isArray(placement.position_xyz) ? placement.position_xyz : [];
    return [typeof pos[0] === "number" ? pos[0] : 0, typeof pos[2] === "number" ? pos[2] : 0];
  }

  function matchPlacementsGreedy(
    aPlacements: Array<Record<string, unknown>>,
    bPlacements: Array<Record<string, unknown>>,
  ): { matched: Array<[number, number]>; aUnmatched: number[]; bUnmatched: number[] } {
    if (!aPlacements.length || !bPlacements.length) {
      return {
        matched: [],
        aUnmatched: aPlacements.map((_, i) => i),
        bUnmatched: bPlacements.map((_, i) => i),
      };
    }
    const aPos = aPlacements.map(positionXz);
    const bPos = bPlacements.map(positionXz);
    const pairs: Array<[number, number, number]> = [];
    for (let i = 0; i < aPos.length; i++) {
      for (let j = 0; j < bPos.length; j++) {
        const dist = Math.hypot(aPos[i][0] - bPos[j][0], aPos[i][1] - bPos[j][1]);
        pairs.push([dist, i, j]);
      }
    }
    pairs.sort((a, b) => a[0] - b[0]);
    const matched: Array<[number, number]> = [];
    const aMatched = new Set<number>();
    const bMatched = new Set<number>();
    for (const [, i, j] of pairs) {
      if (aMatched.has(i) || bMatched.has(j)) continue;
      matched.push([i, j]);
      aMatched.add(i);
      bMatched.add(j);
    }
    const aUnmatched = aPlacements.map((_, i) => i).filter(i => !aMatched.has(i));
    const bUnmatched = bPlacements.map((_, i) => i).filter(i => !bMatched.has(i));
    return { matched, aUnmatched, bUnmatched };
  }

  function computePlacementsDiff(
    aPayload: Record<string, unknown>,
    bPayload: Record<string, unknown>,
  ): Record<string, unknown> {
    const aPlacements = Array.isArray(aPayload.placements)
      ? (aPayload.placements as Array<Record<string, unknown>>)
      : [];
    const bPlacements = Array.isArray(bPayload.placements)
      ? (bPayload.placements as Array<Record<string, unknown>>)
      : [];

    const aByCat: Record<string, Array<Record<string, unknown>>> = {};
    const bByCat: Record<string, Array<Record<string, unknown>>> = {};
    for (const p of aPlacements) {
      const cat = String(p.category ?? "unknown").trim().toLowerCase() || "unknown";
      (aByCat[cat] ||= []).push(p);
    }
    for (const p of bPlacements) {
      const cat = String(p.category ?? "unknown").trim().toLowerCase() || "unknown";
      (bByCat[cat] ||= []).push(p);
    }
    const allCats = Array.from(new Set([...Object.keys(aByCat), ...Object.keys(bByCat)])).sort();

    const categoryStats: Array<Record<string, unknown>> = [];
    const addedInstances: Array<Record<string, unknown>> = [];
    const deletedInstances: Array<Record<string, unknown>> = [];
    const movedInstances: Array<Record<string, unknown>> = [];

    for (const cat of allCats) {
      const aList = aByCat[cat] || [];
      const bList = bByCat[cat] || [];
      const { matched, aUnmatched, bUnmatched } = matchPlacementsGreedy(aList, bList);
      const shifts: number[] = [];
      for (const [ai, bi] of matched) {
        const [ax, az] = positionXz(aList[ai]);
        const [bx, bz] = positionXz(bList[bi]);
        const dist = Math.hypot(ax - bx, az - bz);
        shifts.push(dist);
        if (dist > 0.3) {
          movedInstances.push({
            category: cat,
            distance_m: Math.round(dist * 1e4) / 1e4,
            a: { position_xyz: aList[ai].position_xyz },
            b: { position_xyz: bList[bi].position_xyz },
          });
        }
      }
      for (const ai of aUnmatched) {
        deletedInstances.push({ category: cat, position_xyz: aList[ai].position_xyz });
      }
      for (const bi of bUnmatched) {
        addedInstances.push({ category: cat, position_xyz: bList[bi].position_xyz });
      }
      const meanShift = shifts.length ? shifts.reduce((sum, v) => sum + v, 0) / shifts.length : 0;
      categoryStats.push({
        category: cat,
        count_a: aList.length,
        count_b: bList.length,
        delta: bList.length - aList.length,
        matched: matched.length,
        added: bUnmatched.length,
        deleted: aUnmatched.length,
        moved: shifts.filter(s => s > 0.3).length,
        mean_position_shift_m: Math.round(meanShift * 1e4) / 1e4,
      });
    }

    const totalA = categoryStats.reduce((sum, s) => sum + (s.count_a as number), 0);
    const totalB = categoryStats.reduce((sum, s) => sum + (s.count_b as number), 0);

    return {
      total_count_a: totalA,
      total_count_b: totalB,
      total_delta: totalB - totalA,
      category_stats: categoryStats,
      added_instances: addedInstances,
      deleted_instances: deletedInstances,
      moved_instances: movedInstances,
    };
  }

  async function loadCompareScene(glbUrl: string, side: "a" | "b"): Promise<void> {
    return new Promise((resolve, reject) => {
      deps.loader.load(
        glbUrl,
        (gltf) => {
          const root = gltf.scene;
          root.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          if (side === "a") {
            if (compareRootA) {
              deps.scene.remove(compareRootA);
              deps.disposeObject(compareRootA);
            }
            compareRootA = root;
          } else {
            if (compareRootB) {
              deps.scene.remove(compareRootB);
              deps.disposeObject(compareRootB);
            }
            compareRootB = root;
          }
          root.visible = false;
          deps.scene.add(root);
          resolve();
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  function renderComparisonResults(
    a: ViewerManifest,
    b: ViewerManifest,
    layoutA: Record<string, unknown>,
    layoutB: Record<string, unknown>,
  ): void {
    const summaryA = (a.summary ?? {}) as Record<string, unknown>;
    const summaryB = (b.summary ?? {}) as Record<string, unknown>;
    const configA = (layoutA.config ?? {}) as Record<string, unknown>;
    const configB = (layoutB.config ?? {}) as Record<string, unknown>;

    const metricsDiff = computeMetricsDiff(summaryA, summaryB);
    const configDiff = computeConfigDiff(configA, configB);
    const placementsDiff = computePlacementsDiff(layoutA, layoutB);

    const toPreviewUrl = (glbUrl: string) =>
      glbUrl.replace(/%2F[^%]*\.glb$/i, "%2Fpreview.png").replace(/\/[^/]*\.glb$/i, "/preview.png");
    const imgA = a.final_scene?.glb_url ? toPreviewUrl(a.final_scene.glb_url) : "";
    const imgB = b.final_scene?.glb_url ? toPreviewUrl(b.final_scene.glb_url) : "";

    const tabIds = ["metrics", "config", "placements", "diff2d", "preview"];
    const tabLabels = ["Metrics", "Config", "Placements", "2D Diff", "Preview"];

    let html = `<div class="viewer-compare-tabs">`;
    for (let i = 0; i < tabIds.length; i++) {
      html += `<button class="viewer-compare-tab" data-tab="${tabIds[i]}" ${i === 0 ? 'data-active="true"' : ""}>${tabLabels[i]}</button>`;
    }
    html += `</div>`;
    html += `<div class="viewer-compare-actions"><button id="viewer-open-compare3d" class="viewer-nav-button" type="button">Open Split 3D View</button></div>`;

    // Metrics tab
    const metricsRows = metricsDiff
      .map(m => {
        const diffHtml = comparisonDiffArrow(Number(m.old ?? 0), Number(m.new ?? 0));
        return `<tr>
        <td class="viewer-compare-metric-label">${deps.escapeHtml(String(m.key))}</td>
        <td>${m.old !== null ? Number(m.old).toFixed(3) : "-"}</td>
        <td>${m.new !== null ? Number(m.new).toFixed(3) : "-"}</td>
        <td>${diffHtml}</td>
      </tr>`;
      })
      .join("");

    html += `<div class="viewer-compare-tab-panel" data-tab="metrics" data-active="true">
      <div class="viewer-compare-table-wrap"><table class="viewer-compare-table">
        <thead><tr><th>Metric</th><th>Layout A</th><th>Layout B</th><th>Diff</th></tr></thead><tbody>${metricsRows}</tbody>
      </table></div>
    </div>`;

    // Config tab
    let configHtml = "";
    const configAdded = Object.entries((configDiff.added ?? {}) as Record<string, unknown>);
    const configRemoved = Object.entries((configDiff.removed ?? {}) as Record<string, unknown>);
    const configChanged = Object.entries((configDiff.changed ?? {}) as Record<string, unknown>);

    if (configAdded.length || configRemoved.length || configChanged.length) {
      configHtml += `<div class="viewer-diff-list">`;
      for (const [k, v] of configAdded) {
        configHtml += `<div class="viewer-diff-item viewer-diff-added"><span class="viewer-diff-badge">+</span> <code>${deps.escapeHtml(k)}</code> = ${deps.escapeHtml(JSON.stringify(v))}</div>`;
      }
      for (const [k, v] of configRemoved) {
        configHtml += `<div class="viewer-diff-item viewer-diff-removed"><span class="viewer-diff-badge">−</span> <code>${deps.escapeHtml(k)}</code> = ${deps.escapeHtml(JSON.stringify(v))}</div>`;
      }
      for (const [k, v] of configChanged) {
        const changed = v as { old: unknown; new: unknown };
        configHtml += `<div class="viewer-diff-item viewer-diff-changed"><span class="viewer-diff-badge">~</span> <code>${deps.escapeHtml(k)}</code><div class="viewer-diff-values"><span class="viewer-diff-old">${deps.escapeHtml(JSON.stringify(changed.old))}</span> → <span class="viewer-diff-new">${deps.escapeHtml(JSON.stringify(changed.new))}</span></div></div>`;
      }
      configHtml += `</div>`;
    } else {
      configHtml = `<div class="viewer-evaluate-empty">No config differences.</div>`;
    }
    html += `<div class="viewer-compare-tab-panel" data-tab="config">${configHtml}</div>`;

    // Placements tab
    const pd = placementsDiff;
    const catStats = (pd.category_stats as Array<Record<string, unknown>>) ?? [];
    let placementsHtml = `<div class="viewer-compare-table-wrap"><table class="viewer-compare-table">
      <thead><tr><th>Category</th><th>A</th><th>B</th><th>Δ</th><th>Matched</th><th>Added</th><th>Deleted</th><th>Moved</th><th>Mean Shift (m)</th></tr></thead><tbody>`;
    for (const s of catStats) {
      placementsHtml += `<tr>
        <td class="viewer-compare-metric-label">${deps.escapeHtml(String(s.category))}</td>
        <td>${s.count_a}</td><td>${s.count_b}</td><td>${s.delta}</td>
        <td>${s.matched}</td><td>${s.added}</td><td>${s.deleted}</td><td>${s.moved}</td>
        <td>${Number(s.mean_position_shift_m).toFixed(3)}</td>
      </tr>`;
    }
    placementsHtml += `</tbody></table></div>`;
    placementsHtml += `<div class="viewer-placements-totals">Total: ${pd.total_count_a} → ${pd.total_count_b} (Δ ${pd.total_delta})</div>`;
    html += `<div class="viewer-compare-tab-panel" data-tab="placements">${placementsHtml}</div>`;

    // 2D Diff tab
    html += `<div class="viewer-compare-tab-panel" data-tab="diff2d">
      <div class="viewer-diff2d-controls">
        <label class="viewer-settings-label">Diff Mode</label>
        <select id="diff2d-mode" class="viewer-select viewer-select-compact">
          <option value="overlay">Overlay (red/green)</option>
          <option value="delta">Delta Map (arrows)</option>
        </select>
        <button id="diff2d-render" class="viewer-nav-button" type="button">Render Diff</button>
      </div>
      <div id="diff2d-image-host" class="viewer-diff2d-host">
        <div class="viewer-evaluate-empty">Select a mode and click Render Diff.</div>
      </div>
    </div>`;

    // Preview tab
    html += `<div class="viewer-compare-tab-panel" data-tab="preview">
      <div class="viewer-compare-images">
        <div class="viewer-compare-col">
          <div class="viewer-compare-thumb-label">${deps.escapeHtml(deps.compactUiLabel(a.layout_path))}</div>
          ${imgA ? `<img class="viewer-compare-thumb" src="${deps.escapeHtml(imgA)}" alt="Layout A" />` : "<div class='viewer-compare-no-img'>No preview</div>"}
        </div>
        <div class="viewer-compare-col">
          <div class="viewer-compare-thumb-label">${deps.escapeHtml(deps.compactUiLabel(b.layout_path))}</div>
          ${imgB ? `<img class="viewer-compare-thumb" src="${deps.escapeHtml(imgB)}" alt="Layout B" />` : "<div class='viewer-compare-no-img'>No preview</div>"}
        </div>
      </div>
    </div>`;

    deps.compareResultsEl.innerHTML = html;

    const tabs = deps.compareResultsEl.querySelectorAll<HTMLButtonElement>(".viewer-compare-tab");
    const panels = deps.compareResultsEl.querySelectorAll<HTMLElement>(".viewer-compare-tab-panel");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab!;
        tabs.forEach(t => (t.dataset.active = String(t.dataset.tab === target)));
        panels.forEach(p => (p.dataset.active = String(p.dataset.tab === target)));
      });
    });

    const openCompare3dEl = deps.compareResultsEl.querySelector<HTMLButtonElement>("#viewer-open-compare3d");
    openCompare3dEl?.addEventListener("click", () => void enterCompare3d(a, b));

    // Wire up 2D diff rendering
    const diff2dModeEl = deps.compareResultsEl.querySelector<HTMLSelectElement>("#diff2d-mode");
    const diff2dRenderEl = deps.compareResultsEl.querySelector<HTMLButtonElement>("#diff2d-render");
    const diff2dHostEl = deps.compareResultsEl.querySelector<HTMLElement>("#diff2d-image-host");

    async function renderDiff2d(): Promise<void> {
      if (!diff2dModeEl || !diff2dHostEl) return;
      const mode = diff2dModeEl.value;
      diff2dHostEl.innerHTML = `<div class="viewer-evaluate-loading">Rendering ${mode} diff…</div>`;
      try {
        const url = `./api/scenes/diff/image?layout_a=${encodeURIComponent(a.layout_path)}&layout_b=${encodeURIComponent(b.layout_path)}&mode=${encodeURIComponent(mode)}`;
        const response = await fetch(url);
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        diff2dHostEl.innerHTML = `<img class="viewer-diff2d-image" src="${deps.escapeHtml(objectUrl)}" alt="${deps.escapeHtml(mode)} diff" />`;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Rendering failed.";
        diff2dHostEl.innerHTML = `<div class="viewer-evaluate-error">${deps.escapeHtml(message)}</div>`;
      }
    }

    diff2dRenderEl?.addEventListener("click", () => void renderDiff2d());
    // Auto-render overlay when switching to diff2d for the first time
    const diff2dTab = Array.from(tabs).find(t => t.dataset.tab === "diff2d");
    diff2dTab?.addEventListener("click", () => {
      if (diff2dHostEl && diff2dHostEl.querySelector(".viewer-evaluate-empty")) {
        void renderDiff2d();
      }
    });
  }

  async function runComparison(): Promise<void> {
    const pathA = deps.compareSelectAEl.value;
    const pathB = deps.compareSelectBEl.value;
    if (!pathA || !pathB) {
      deps.compareResultsEl.innerHTML = `<div class="viewer-evaluate-empty">Select two layouts to compare.</div>`;
      return;
    }
    deps.compareResultsEl.innerHTML = `<div class="viewer-evaluate-loading">Loading layouts for comparison...</div>`;

    try {
      const [manifestA, manifestB, layoutJsonA, layoutJsonB] = await Promise.all([
        deps.loadManifest(pathA),
        deps.loadManifest(pathB),
        fetch(`./api/file?path=${encodeURIComponent(pathA)}`).then(r => r.json() as Promise<Record<string, unknown>>),
        fetch(`./api/file?path=${encodeURIComponent(pathB)}`).then(r => r.json() as Promise<Record<string, unknown>>),
      ]);
      renderComparisonResults(manifestA, manifestB, layoutJsonA, layoutJsonB);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load layouts for comparison.";
      deps.compareResultsEl.innerHTML = `<div class="viewer-evaluate-error">${deps.escapeHtml(message)}</div>`;
    }
  }

  async function enterCompare3d(a: ViewerManifest, b: ViewerManifest): Promise<void> {
    if (!a.final_scene?.glb_url || !b.final_scene?.glb_url) {
      deps.flashStatus("Both layouts must have a GLB scene.");
      return;
    }
    deps.setStatus("Loading split-screen comparison…");
    try {
      await Promise.all([
        loadCompareScene(a.final_scene.glb_url, "a"),
        loadCompareScene(b.final_scene.glb_url, "b"),
      ]);
      compare3dActive = true;
      const currentRoot = deps.getCurrentRoot();
      if (currentRoot) currentRoot.visible = false;
      deps.exitCompare3dEl.hidden = false;
      deps.flashStatus("Split-screen mode active. WASD moves both views.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load scenes.";
      deps.flashStatus(msg);
    }
  }

  function exitCompare3d(): void {
    compare3dActive = false;
    const currentRoot = deps.getCurrentRoot();
    if (currentRoot) currentRoot.visible = true;
    if (compareRootA) compareRootA.visible = false;
    if (compareRootB) compareRootB.visible = false;
    deps.exitCompare3dEl.hidden = true;
    deps.renderer.setScissorTest(false);
    deps.renderer.setViewport(0, 0, deps.renderer.domElement.clientWidth, deps.renderer.domElement.clientHeight);
    deps.flashStatus("Exited split-screen mode.");
  }

  deps.exitCompare3dEl.addEventListener("click", exitCompare3d);

  function renderCompare3dFrame(): boolean {
    if (compare3dActive && compareRootA && compareRootB) {
      const currentRoot = deps.getCurrentRoot();
      if (currentRoot) currentRoot.visible = false;
      compareCameraA.position.copy(deps.camera.position);
      compareCameraA.quaternion.copy(deps.camera.quaternion);
      compareCameraB.position.copy(deps.camera.position);
      compareCameraB.quaternion.copy(deps.camera.quaternion);

      const width = deps.renderer.domElement.clientWidth;
      const height = deps.renderer.domElement.clientHeight;
      deps.renderer.setScissorTest(true);

      // Left half – Scene A
      deps.renderer.setViewport(0, 0, width / 2, height);
      deps.renderer.setScissor(0, 0, width / 2, height);
      compareRootA.visible = true;
      compareRootB.visible = false;
      deps.renderer.render(deps.scene, compareCameraA);

      // Right half – Scene B
      deps.renderer.setViewport(width / 2, 0, width / 2, height);
      deps.renderer.setScissor(width / 2, 0, width / 2, height);
      compareRootA.visible = false;
      compareRootB.visible = true;
      deps.renderer.render(deps.scene, compareCameraB);

      deps.renderer.setScissorTest(false);
      deps.renderer.setViewport(0, 0, width, height);
      return true;
    }
    if (compareRootA) compareRootA.visible = false;
    if (compareRootB) compareRootB.visible = false;
    const currentRoot = deps.getCurrentRoot();
    if (currentRoot) currentRoot.visible = true;
    return false;
  }

  return {
    runComparison,
    enterCompare3d,
    exitCompare3d,
    renderCompare3dFrame,
    isCompare3dActive: () => compare3dActive,
  };
}
