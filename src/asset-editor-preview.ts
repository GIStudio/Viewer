import "./styles/asset-editor.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { DesktopShell } from "./desktop-shell";
import { VIEWER_LANGUAGE_EVENT, applyViewerTranslations, loadViewerLanguage, translateViewerKey } from "./viewer-i18n";
import type {
  AssetCandidateManifest,
  AssetPreparationState,
  WorkflowController,
} from "./workflow-controller";
import {
  DEFAULT_SCALE_BAR_LENGTH,
  DEFAULT_SCALE_BAR_TICK_INTERVAL,
  DIMENSION_DUP_KEY_DECIMALS,
  ORIGIN_AUTO_FIX_EPSILON_M,
  clampNumber,
  createRoadReferenceGroup,
  disposeScaleBar,
  disposeObjectTree,
  formatScaleLabel,
  getDimensionsFromObject,
  getObjectBoundingBox,
  normalizeYawDeg,
  rotateLocalDirection,
  roundTo,
  type AssetRecord,
  type DimensionRecord,
  type OrientationPolicy,
  type ScaleBarConfig,
  type SceneChildInfo,
} from "./asset-editor-model";
export type PreviewContext = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  animId: number;
  currentModel: THREE.Group | null;
  bboxHelper: THREE.Box3Helper | null;
  gridHelper: THREE.GridHelper;
  wireframeMaterial: THREE.MeshBasicMaterial;
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  selectionBox: SelectionBox | null;
  selectionHelper: SelectionHelper | null;
  // Scale bar and orientation
  labelRenderer: CSS2DRenderer;
  scaleBarGroup: THREE.Group | null;
  frontArrow: THREE.ArrowHelper | null;
  roadReferenceGroup: THREE.Group | null;
};

export type SelectionBox = {
  startPoint: THREE.Vector2;
  endPoint: THREE.Vector2;
  isSelecting: boolean;
  domElement: HTMLElement;
};

export type SelectionHelper = {
  element: HTMLDivElement;
  startPoint: THREE.Vector2;
  pointTopLeft: THREE.Vector2;
  pointBottomRight: THREE.Vector2;
  isDown: boolean;
  enabled: boolean;
};

/* ── Scale Bar Helper ──────────────────────────────────────────────── */

export function createScaleBar(scene: THREE.Scene, config: ScaleBarConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = "scaleBar";

  const length = config.length;
  const tickInterval = config.tickInterval;
  const majorTickInterval = config.majorTickInterval;
  const tickHeight = 0.1;
  const majorTickHeight = 0.2;
  const majorEvery = Math.max(1, Math.round(majorTickInterval / tickInterval));
  const totalTicks = Math.max(0, Math.round(length / tickInterval));
  const yBase = 0.01;
  const baseline = new THREE.Vector3(0, yBase, 0);

  const axisDefs: Array<{
    key: "x" | "y" | "z";
    color: number;
    dir: THREE.Vector3;
    tickDir: THREE.Vector3;
    label: string;
    labelOffset: THREE.Vector3;
    tickLabelOffset: THREE.Vector3;
  }> = [
    {
      key: "x",
      color: 0xff5555,
      dir: new THREE.Vector3(1, 0, 0),
      tickDir: new THREE.Vector3(0, 0, -1),
      label: "X",
      labelOffset: new THREE.Vector3(0.25, 0, -0.18),
      tickLabelOffset: new THREE.Vector3(0, 0, -0.15),
    },
    {
      key: "y",
      color: 0x55ff55,
      dir: new THREE.Vector3(0, 1, 0),
      tickDir: new THREE.Vector3(-1, 0, 0),
      label: "Y",
      labelOffset: new THREE.Vector3(-0.22, 0.18, 0.08),
      tickLabelOffset: new THREE.Vector3(-0.15, 0, 0),
    },
    {
      key: "z",
      color: 0x55aaff,
      dir: new THREE.Vector3(0, 0, 1),
      tickDir: new THREE.Vector3(0, 1, 0),
      label: "Z",
      labelOffset: new THREE.Vector3(0, 0.28, 0.15),
      tickLabelOffset: new THREE.Vector3(0, 0.15, 0),
    },
  ];

  const addRulerLabel = (text: string, position: THREE.Vector3, color = "#ffffff") => {
    const labelDiv = document.createElement("div");
    labelDiv.className = "ae-ruler-label";
    labelDiv.textContent = text;
    labelDiv.style.cssText = `
      color: ${color};
      font-family: "SF Mono", "Roboto Mono", monospace;
      font-size: 11px;
      font-weight: 600;
      background: rgba(0, 0, 0, 0.6);
      padding: 2px 4px;
      border-radius: 3px;
      white-space: nowrap;
    `;
    const label = new CSS2DObject(labelDiv);
    label.position.copy(position);
    group.add(label);
  };

  const addAxis = (axis: (typeof axisDefs)[number]) => {
    const axisEnd = baseline.clone().add(axis.dir.clone().multiplyScalar(length));
    const axisLineGeometry = new THREE.BufferGeometry().setFromPoints([baseline, axisEnd]);
    const axisLineMaterial = new THREE.LineBasicMaterial({ color: axis.color, linewidth: 2 });
    const axisLine = new THREE.Line(axisLineGeometry, axisLineMaterial);
    group.add(axisLine);

    for (let i = 0; i <= totalTicks; i += 1) {
      const axisValue = roundTo(i * tickInterval, 2);
      const isMajor = i % majorEvery === 0;
      const height = isMajor ? majorTickHeight : tickHeight;
      const value = Math.min(length, axisValue);
      const position = baseline.clone().add(axis.dir.clone().multiplyScalar(value));

      const tickStart = position.clone();
      const tickEnd = tickStart.clone().add(axis.tickDir.clone().multiplyScalar(height));
      const tickGeometry = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd]);
      const tickMaterial = new THREE.LineBasicMaterial({ color: axis.color });
      const tick = new THREE.Line(tickGeometry, tickMaterial);
      group.add(tick);

      if (isMajor && value > 0) {
        addRulerLabel(
          formatScaleLabel(value),
          position.clone().add(axis.tickLabelOffset).add(axis.tickDir.clone().multiplyScalar(height)),
          `rgb(${(axis.color >> 16) & 255}, ${(axis.color >> 8) & 255}, ${axis.color & 255})`,
        );
      }
    }

    addRulerLabel(
      axis.label,
      axisEnd.clone().add(axis.labelOffset),
      `rgb(${(axis.color >> 16) & 255}, ${(axis.color >> 8) & 255}, ${axis.color & 255})`,
    );
  };

  axisDefs.forEach(addAxis);

  addRulerLabel("0", baseline.clone().add(new THREE.Vector3(0, 0, -majorTickHeight - 0.15)), "#ffffff");

  scene.add(group);
  return group;
}

export function replaceScaleBar(scene: THREE.Scene, current: THREE.Group, config?: ScaleBarConfig): THREE.Group {
  disposeScaleBar(current);
  if (current.parent) {
    current.parent.remove(current);
  }
  const targetConfig = config ?? {
    length: DEFAULT_SCALE_BAR_LENGTH,
    tickInterval: DEFAULT_SCALE_BAR_TICK_INTERVAL,
    majorTickInterval: DEFAULT_SCALE_BAR_TICK_INTERVAL,
  };
  return createScaleBar(scene, targetConfig);
}

export function createPreviewScene(container: HTMLElement): PreviewContext {
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 400;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2a2e);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 1000);
  camera.position.set(3, 2, 3);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.5, 0);
  controls.update();

  const ambient = new THREE.HemisphereLight(0xddeeff, 0x8899aa, 1.2);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  const gridHelper = new THREE.GridHelper(10, 20, 0x555555, 0x333333);
  scene.add(gridHelper);

  // CSS2D Renderer for labels
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  // Scale bar
  const scaleBarGroup = createScaleBar(scene, {
    length: DEFAULT_SCALE_BAR_LENGTH,
    tickInterval: DEFAULT_SCALE_BAR_TICK_INTERVAL,
    majorTickInterval: DEFAULT_SCALE_BAR_TICK_INTERVAL,
  });

  // Front direction arrow (initially hidden)
  const frontArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1), // +Z direction
    new THREE.Vector3(0, 0, 0),
    1, // length
    0x00ff88, // color
    0.2, // head length
    0.1, // head width
  );
  frontArrow.visible = false;
  scene.add(frontArrow);

  const roadReferenceGroup = createRoadReferenceGroup();
  scene.add(roadReferenceGroup);

  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    wireframe: true,
  });

  const selectionHelper = createSelectionHelper(container);

  const ctx: PreviewContext = {
    renderer,
    scene,
    camera,
    controls,
    animId: 0,
    currentModel: null,
    bboxHelper: null,
    gridHelper,
    wireframeMaterial,
    originalMaterials: new Map(),
    selectionBox: null,
    selectionHelper,
    labelRenderer,
    scaleBarGroup,
    frontArrow,
    roadReferenceGroup,
  };

  function animate() {
    ctx.animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();

  const onResize = () => {
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 400;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  };
  const resizeObs = new ResizeObserver(onResize);
  resizeObs.observe(container);

  return ctx;
}

export function loadModelIntoPreview(
  ctx: PreviewContext,
  glbUrl: string,
): Promise<{ model: THREE.Group; children: SceneChildInfo[] }> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        // Remove previous model
        if (ctx.currentModel) {
          ctx.scene.remove(ctx.currentModel);
          ctx.currentModel.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).geometry.dispose();
            }
          });
        }
        if (ctx.bboxHelper) {
          ctx.scene.remove(ctx.bboxHelper);
          ctx.bboxHelper = null;
        }
        ctx.originalMaterials.clear();

        const model = gltf.scene;
        ctx.currentModel = model;
        ctx.scene.add(model);

        // Center model
        const box = getObjectBoundingBox(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += size.y / 2;

        // Fit camera
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 1.8;
        ctx.camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
        ctx.controls.target.set(0, size.y / 2, 0);
        ctx.controls.update();

        // Analyze children
        const children = analyzeChildren(model);
        resolve({ model, children });
      },
      undefined,
      (err) => reject(err),
    );
  });
}

export function analyzeChildren(model: THREE.Group): SceneChildInfo[] {
  const children: SceneChildInfo[] = [];
  const meshGroups = new Map<string, number[]>();

  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry;
      const vCount = geom.attributes.position ? geom.attributes.position.count : 0;
      const fCount = geom.index ? geom.index.count / 3 : vCount / 3;

      const size = getDimensionsFromObject(mesh) ?? { width: 0, height: 0, depth: 0 };

      const info: SceneChildInfo = {
        name: mesh.name || `unnamed_${children.length}`,
        type: mesh.type,
        vertexCount: vCount,
        faceCount: Math.round(fCount),
        uuid: mesh.uuid,
        bbox: { w: size.width, h: size.height, d: size.depth },
        isDuplicate: false,
        duplicateGroup: -1,
      };
      children.push(info);

      // Duplicate key: vertex count + rounded bbox
      const key = `${vCount}|${size.width.toFixed(DIMENSION_DUP_KEY_DECIMALS)}|${size.height.toFixed(DIMENSION_DUP_KEY_DECIMALS)}|${size.depth.toFixed(DIMENSION_DUP_KEY_DECIMALS)}`;
      if (!meshGroups.has(key)) meshGroups.set(key, []);
      meshGroups.get(key)!.push(children.length - 1);
    }
  });

  // Mark duplicates
  let groupIdx = 0;
  for (const indices of meshGroups.values()) {
    if (indices.length > 1) {
      for (const idx of indices) {
        children[idx].isDuplicate = true;
        children[idx].duplicateGroup = groupIdx;
      }
      groupIdx++;
    }
  }

  return children;
}

export function toggleWireframe(ctx: PreviewContext, enabled: boolean) {
  if (!ctx.currentModel) return;
  ctx.currentModel.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (enabled) {
        ctx.originalMaterials.set(mesh, mesh.material as THREE.Material | THREE.Material[]);
        mesh.material = ctx.wireframeMaterial;
      } else {
        const orig = ctx.originalMaterials.get(mesh);
        if (orig) mesh.material = orig;
      }
    }
  });
}

export function toggleBbox(ctx: PreviewContext, show: boolean) {
  if (!ctx.currentModel) return;
  if (show) {
    if (ctx.bboxHelper) ctx.scene.remove(ctx.bboxHelper);
    const box = getObjectBoundingBox(ctx.currentModel);
    ctx.bboxHelper = new THREE.Box3Helper(box, 0x00ff88);
    ctx.scene.add(ctx.bboxHelper);
  } else {
    if (ctx.bboxHelper) {
      ctx.scene.remove(ctx.bboxHelper);
      ctx.bboxHelper = null;
    }
  }
}

export function zoomToFit(ctx: PreviewContext) {
  if (!ctx.currentModel) return;
  const box = getObjectBoundingBox(ctx.currentModel);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 1.8;
  ctx.camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
  ctx.controls.target.copy(center);
  ctx.controls.update();
}

export function applyScale(ctx: PreviewContext, factor: number) {
  if (!ctx.currentModel) return;
  ctx.currentModel.scale.setScalar(factor);
  zoomToFit(ctx);
}

export function applyYaw(ctx: PreviewContext, yawDeg: number) {
  if (!ctx.currentModel) return;
  // Normalize yaw to [0, 360)
  const normalizedYaw = normalizeYawDeg(yawDeg);
  ctx.currentModel.rotation.y = (normalizedYaw * Math.PI) / 180;
}

export function replaceRoadReferenceGroup(ctx: PreviewContext, policy: OrientationPolicy = "face_road") {
  if (ctx.roadReferenceGroup) {
    disposeObjectTree(ctx.roadReferenceGroup);
    if (ctx.roadReferenceGroup.parent) {
      ctx.roadReferenceGroup.parent.remove(ctx.roadReferenceGroup);
    }
  }
  const box = ctx.currentModel ? getObjectBoundingBox(ctx.currentModel) : undefined;
  ctx.roadReferenceGroup = createRoadReferenceGroup(box, policy);
  ctx.scene.add(ctx.roadReferenceGroup);
}

export function updateFrontArrow(ctx: PreviewContext, frontDirection: string, yawDeg: number = 0) {
  if (!ctx.frontArrow) return;
  const dir = rotateLocalDirection(frontDirection, yawDeg);
  if (ctx.currentModel) {
    const box = getObjectBoundingBox(ctx.currentModel);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const horizontalSpan = Math.max(size.x, size.z, 1);
      const distances: number[] = [];
      if (Math.abs(dir.x) > 1e-4) {
        distances.push((dir.x > 0 ? box.max.x - center.x : center.x - box.min.x) / Math.abs(dir.x));
      }
      if (Math.abs(dir.z) > 1e-4) {
        distances.push((dir.z > 0 ? box.max.z - center.z : center.z - box.min.z) / Math.abs(dir.z));
      }
      const positiveDistances = distances.filter((value) => Number.isFinite(value) && value > 0);
      const edgeDistance = positiveDistances.length > 0 ? Math.min(...positiveDistances) : horizontalSpan * 0.5;
      const outsidePadding = clampNumber(horizontalSpan * 0.08, 0.6, 8);
      const length = Math.max(1.2, edgeDistance + outsidePadding);
      const headLength = clampNumber(length * 0.12, 0.2, 2.5);
      const headWidth = clampNumber(headLength * 0.45, 0.1, 1.4);
      center.y = box.max.y + clampNumber(Math.max(size.y * 0.05, horizontalSpan * 0.025), 0.35, 3);
      ctx.frontArrow.position.copy(center);
      ctx.frontArrow.setLength(length, headLength, headWidth);
    }
  }
  ctx.frontArrow.setDirection(dir);
  ctx.frontArrow.visible = true;
}

export function getModelDimensions(ctx: PreviewContext): DimensionRecord | null {
  if (!ctx.currentModel) return null;
  return getDimensionsFromObject(ctx.currentModel);
}

export function getBottomCenterOffset(target: THREE.Object3D): THREE.Vector3 | null {
  const box = getObjectBoundingBox(target);
  if (box.isEmpty()) return null;
  const bottomCenter = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    box.min.y,
    (box.min.z + box.max.z) / 2,
  );
  return bottomCenter;
}

export function needsBottomCenterOriginFix(offset: THREE.Vector3 | null): offset is THREE.Vector3 {
  return Boolean(offset && offset.length() > ORIGIN_AUTO_FIX_EPSILON_M);
}

export function alignBottomCenterToOrigin(target: THREE.Object3D, offset: THREE.Vector3): void {
  target.position.sub(offset);
  target.updateMatrixWorld(true);
}

export function exportGlb(scene: THREE.Object3D): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        resolve(result as ArrayBuffer);
      },
      (error) => reject(error),
      { binary: true },
    );
  });
}

export function triggerDownload(data: ArrayBuffer, filename: string) {
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function arrayBufferToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function collectModelMeshes(model: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes.push(child as THREE.Mesh);
    }
  });
  return meshes;
}

export function splitMergedMeshByConnectivity(
  mesh: THREE.Mesh,
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): THREE.Mesh[] {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  if (!position || position.count < 6) return [mesh];

  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  if (triangleCount <= 1 || triangleCount > 250_000) return [mesh];

  const parents = Array.from({ length: triangleCount }, (_, triangleIndex) => triangleIndex);
  const firstTriangleByVertex = new Map<string, number>();
  const find = (triangleIndex: number): number => {
    while (parents[triangleIndex] !== triangleIndex) {
      parents[triangleIndex] = parents[parents[triangleIndex]];
      triangleIndex = parents[triangleIndex];
    }
    return triangleIndex;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents[rootB] = rootA;
  };
  const sourceVertexIndex = (triangleIndex: number, corner: number): number => (
    index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner
  );
  const sourceMaterialIndexByTriangle = Array.from({ length: triangleCount }, () => 0);
  for (const group of geometry.groups) {
    const firstTriangle = Math.floor(group.start / 3);
    const lastTriangle = Math.ceil((group.start + group.count) / 3);
    for (let triangleIndex = firstTriangle; triangleIndex < lastTriangle && triangleIndex < triangleCount; triangleIndex += 1) {
      sourceMaterialIndexByTriangle[triangleIndex] = group.materialIndex ?? 0;
    }
  }
  const vertexKey = (vertexIndex: number): string => (
    `${position.getX(vertexIndex).toFixed(5)},${position.getY(vertexIndex).toFixed(5)},${position.getZ(vertexIndex).toFixed(5)}`
  );

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const key = vertexKey(sourceVertexIndex(triangleIndex, corner));
      const firstTriangle = firstTriangleByVertex.get(key);
      if (firstTriangle === undefined) {
        firstTriangleByVertex.set(key, triangleIndex);
      } else {
        union(triangleIndex, firstTriangle);
      }
    }
  }

  const trianglesByComponent = new Map<number, number[]>();
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const root = find(triangleIndex);
    const triangles = trianglesByComponent.get(root) ?? [];
    triangles.push(triangleIndex);
    trianglesByComponent.set(root, triangles);
  }
  if (trianglesByComponent.size <= 1) return [mesh];

  const attributesToCopy = ["position", "normal", "uv", "uv2", "color"].filter((name) => Boolean(geometry.attributes[name]));
  const components: THREE.Mesh[] = [];
  let componentIndex = 1;

  for (const triangles of trianglesByComponent.values()) {
    if (triangles.length === 0) continue;
    const componentGeometry = new THREE.BufferGeometry();
    for (const attributeName of attributesToCopy) {
      const source = geometry.attributes[attributeName] as THREE.BufferAttribute;
      const values: number[] = [];
      for (const triangleIndex of triangles) {
        for (let corner = 0; corner < 3; corner += 1) {
          const vertexIndex = sourceVertexIndex(triangleIndex, corner);
          for (let item = 0; item < source.itemSize; item += 1) {
            values.push(source.getComponent(vertexIndex, item));
          }
        }
      }
      componentGeometry.setAttribute(
        attributeName,
        new THREE.Float32BufferAttribute(values, source.itemSize),
      );
    }
    if (!componentGeometry.attributes.normal) {
      componentGeometry.computeVertexNormals();
    }
    if (Array.isArray(mesh.material)) {
      let groupStart = 0;
      let activeMaterialIndex = sourceMaterialIndexByTriangle[triangles[0]] ?? 0;
      for (let localTriangleIndex = 1; localTriangleIndex < triangles.length; localTriangleIndex += 1) {
        const materialIndex = sourceMaterialIndexByTriangle[triangles[localTriangleIndex]] ?? 0;
        if (materialIndex !== activeMaterialIndex) {
          componentGeometry.addGroup(groupStart, localTriangleIndex * 3 - groupStart, activeMaterialIndex);
          groupStart = localTriangleIndex * 3;
          activeMaterialIndex = materialIndex;
        }
      }
      componentGeometry.addGroup(groupStart, triangles.length * 3 - groupStart, activeMaterialIndex);
    }

    const component = new THREE.Mesh(componentGeometry, originalMaterials?.get(mesh) ?? mesh.material);
    component.name = `${mesh.name || "component"}_${componentIndex}`;
    component.matrix.copy(mesh.matrixWorld);
    component.matrix.decompose(component.position, component.quaternion, component.scale);
    component.updateMatrixWorld(true);
    components.push(component);
    componentIndex += 1;
  }

  return components.length > 1 ? components : [mesh];
}

export function collectAutoSplitUnits(
  model: THREE.Object3D,
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): THREE.Mesh[] {
  const meshes = collectModelMeshes(model);
  if (meshes.length !== 1) return meshes;
  return splitMergedMeshByConnectivity(meshes[0], originalMaterials);
}

export function meshWorldBox(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(mesh);
}

export function footprintGap(a: THREE.Box3, b: THREE.Box3): number {
  const gapX = Math.max(0, Math.max(b.min.x - a.max.x, a.min.x - b.max.x));
  const gapZ = Math.max(0, Math.max(b.min.z - a.max.z, a.min.z - b.max.z));
  return Math.hypot(gapX, gapZ);
}

export function clusterMeshesByFootprint(meshes: THREE.Mesh[]): THREE.Mesh[][] {
  if (meshes.length <= 1) return meshes.map((mesh) => [mesh]);

  const entries = meshes.map((mesh) => {
    const box = meshWorldBox(mesh);
    const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    return { mesh, box, footprint };
  });
  const sortedFootprints = entries
    .map((entry) => entry.footprint)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianFootprint = sortedFootprints[Math.floor(sortedFootprints.length / 2)] ?? 1;
  const globalBox = new THREE.Box3();
  entries.forEach((entry) => globalBox.union(entry.box));
  const globalFootprint = Math.max(globalBox.max.x - globalBox.min.x, globalBox.max.z - globalBox.min.z);
  const mergeGap = Math.max(0.25, medianFootprint * 0.35, globalFootprint * 0.02);
  const parents = entries.map((_, index) => index);

  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents[rootB] = rootA;
  };

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (footprintGap(entries[i].box, entries[j].box) <= mergeGap) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, THREE.Mesh[]>();
  entries.forEach((entry, index) => {
    const root = find(index);
    const cluster = clusters.get(root) ?? [];
    cluster.push(entry.mesh);
    clusters.set(root, cluster);
  });

  return Array.from(clusters.values()).sort((a, b) => {
    const aCenter = new THREE.Box3().setFromObject(a[0]).getCenter(new THREE.Vector3());
    const bCenter = new THREE.Box3().setFromObject(b[0]).getCenter(new THREE.Vector3());
    return aCenter.x - bCenter.x || aCenter.z - bCenter.z;
  });
}

export function cloneTextureForGlbExport(texture: THREE.Texture): THREE.Texture {
  const image = texture.image as CanvasImageSource | { width?: number; height?: number } | undefined;
  const width = Number((image as { width?: number } | undefined)?.width ?? 0);
  const height = Number((image as { height?: number } | undefined)?.height ?? 0);
  if (!image || width <= 0 || height <= 0) {
    return texture.clone();
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return texture.clone();
    ctx.drawImage(image as CanvasImageSource, 0, 0, width, height);

    const cloned = new THREE.CanvasTexture(canvas);
    cloned.name = texture.name;
    cloned.mapping = texture.mapping;
    cloned.channel = texture.channel;
    cloned.wrapS = texture.wrapS;
    cloned.wrapT = texture.wrapT;
    cloned.magFilter = texture.magFilter;
    cloned.minFilter = texture.minFilter;
    cloned.anisotropy = texture.anisotropy;
    cloned.format = texture.format;
    cloned.type = texture.type;
    cloned.colorSpace = texture.colorSpace;
    cloned.flipY = texture.flipY;
    cloned.generateMipmaps = texture.generateMipmaps;
    cloned.premultiplyAlpha = texture.premultiplyAlpha;
    cloned.unpackAlignment = texture.unpackAlignment;
    cloned.offset.copy(texture.offset);
    cloned.repeat.copy(texture.repeat);
    cloned.center.copy(texture.center);
    cloned.rotation = texture.rotation;
    cloned.matrix.copy(texture.matrix);
    cloned.matrixAutoUpdate = texture.matrixAutoUpdate;
    cloned.userData = { ...texture.userData };
    cloned.needsUpdate = true;
    return cloned;
  } catch {
    return texture.clone();
  }
}

export function makeMaterialExportable(material: THREE.Material): THREE.Material {
  const cloned = material.clone();
  const textureSlots = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "emissiveMap",
    "aoMap",
    "alphaMap",
    "bumpMap",
    "displacementMap",
    "lightMap",
    "specularMap",
    "envMap",
  ];
  const record = cloned as unknown as Record<string, unknown>;
  for (const slot of textureSlots) {
    const value = record[slot];
    if (value instanceof THREE.Texture) {
      record[slot] = cloneTextureForGlbExport(value);
    }
  }
  cloned.needsUpdate = true;
  return cloned;
}

export function cloneExportMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  return Array.isArray(material)
    ? material.map((item) => makeMaterialExportable(item))
    : makeMaterialExportable(material);
}

export function cloneObjectForGlbExport(
  target: THREE.Object3D,
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): THREE.Object3D {
  const cloned = target.clone(true);
  const sourceMeshes = collectModelMeshes(target);
  const clonedMeshes = collectModelMeshes(cloned);
  for (let i = 0; i < clonedMeshes.length; i += 1) {
    const sourceMesh = sourceMeshes[i];
    const clonedMesh = clonedMeshes[i];
    if (!sourceMesh || !clonedMesh) continue;
    clonedMesh.material = cloneExportMaterial(originalMaterials?.get(sourceMesh) ?? sourceMesh.material);
  }
  return cloned;
}

export function buildClusterExport(
  meshes: THREE.Mesh[],
  originalMaterials?: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
): {
  scene: THREE.Scene;
  group: THREE.Group;
  dimensions: DimensionRecord | null;
  faceCount: number;
  vertexCount: number;
} {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const clusterBox = new THREE.Box3();
  let faceCount = 0;
  let vertexCount = 0;

  for (const mesh of meshes) {
    const box = meshWorldBox(mesh);
    clusterBox.union(box);
    const position = mesh.geometry.attributes.position;
    const vertices = position ? position.count : 0;
    vertexCount += vertices;
    faceCount += Math.round(mesh.geometry.index ? mesh.geometry.index.count / 3 : vertices / 3);
  }

  const center = clusterBox.getCenter(new THREE.Vector3());
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const clone = mesh.clone(false);
    clone.geometry = mesh.geometry.clone();
    clone.material = cloneExportMaterial(originalMaterials?.get(mesh) ?? mesh.material);
    clone.matrix.copy(mesh.matrixWorld);
    clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
    clone.position.sub(center);
    group.add(clone);
  }

  scene.add(group);
  return {
    scene,
    group,
    dimensions: getDimensionsFromObject(group),
    faceCount,
    vertexCount,
  };
}

export function makeUniqueSubAssetId(parentId: string, startIndex: number, existingIds: Set<string>): string {
  let index = startIndex;
  let assetId = `${parentId}-sub-${index}`;
  while (existingIds.has(assetId)) {
    index += 1;
    assetId = `${parentId}-sub-${index}`;
  }
  return assetId;
}

export function makeUniqueAssetId(baseId: string, existingIds: Set<string>): string {
  let assetId = baseId;
  let index = 2;
  while (existingIds.has(assetId)) {
    assetId = `${baseId}-${index}`;
    index += 1;
  }
  return assetId;
}

export function buildSubAssetRecord(
  parent: AssetRecord,
  assetId: string,
  subIndex: number,
  dimensions: DimensionRecord | null,
  faceCount: number,
  vertexCount: number,
): AssetRecord {
  return {
    ...parent,
    asset_id: assetId,
    mesh_path: "",
    latent_path: undefined,
    split: `sub-${subIndex}`,
    source: parent.source ?? "asset_editor_split",
    text_desc: `${parent.text_desc ?? parent.category ?? "asset"} (auto split sub ${subIndex})`,
    scale: 1,
    yaw_deg: 0,
    dimensions_m: dimensions ?? undefined,
    face_count: faceCount,
    mesh_face_count: faceCount,
    quality_metrics: {
      ...(parent.quality_metrics ?? {}),
      face_count: faceCount,
      vertex_count: vertexCount,
    },
    parent_asset_id: parent.asset_id,
  };
}

export function sphereCandidateScore(mesh: THREE.Mesh): number {
  const box = meshWorldBox(mesh);
  const size = box.getSize(new THREE.Vector3());
  const dims = [size.x, size.y, size.z].filter((value) => Number.isFinite(value) && value > 0);
  if (dims.length !== 3) return Number.POSITIVE_INFINITY;
  const minDim = Math.min(...dims);
  const maxDim = Math.max(...dims);
  const ratioPenalty = maxDim / minDim - 1;
  if (ratioPenalty > 0.35) return Number.POSITIVE_INFINITY;
  const position = mesh.geometry.attributes.position;
  const vertexBonus = position ? Math.min(0.2, position.count / 50000) : 0;
  return ratioPenalty - vertexBonus - maxDim * 0.001;
}

export function pickSkySphereCandidate(meshes: THREE.Mesh[]): THREE.Mesh | null {
  const candidates = meshes
    .map((mesh) => ({ mesh, score: sphereCandidateScore(mesh) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score);
  return candidates[0]?.mesh ?? null;
}

export function createProceduralSkyDomeExport(): {
  scene: THREE.Scene;
  dimensions: DimensionRecord;
  faceCount: number;
  vertexCount: number;
} {
  const radius = 100;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#7fb7ff");
    gradient.addColorStop(0.45, "#cfe9ff");
    gradient.addColorStop(1, "#fff1d2");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const geometry = new THREE.SphereGeometry(radius, 64, 32);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    fog: false,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = "procedural_sky_dome";

  const scene = new THREE.Scene();
  scene.add(dome);
  return {
    scene,
    dimensions: { width: radius * 2, height: radius * 2, depth: radius * 2 },
    faceCount: geometry.index ? Math.round(geometry.index.count / 3) : 0,
    vertexCount: geometry.attributes.position?.count ?? 0,
  };
}

export function buildSkyDomeRecord(
  parent: AssetRecord,
  assetId: string,
  dimensions: DimensionRecord | null,
  faceCount: number,
  vertexCount: number,
  mode: "extracted" | "procedural",
): AssetRecord {
  return {
    ...parent,
    asset_id: assetId,
    category: "sky_dome",
    mesh_path: "",
    latent_path: undefined,
    source: mode === "extracted" ? "asset_editor_sky_dome_extract" : "asset_editor_sky_dome_procedural",
    split: mode === "extracted" ? "sky-dome" : undefined,
    text_desc: mode === "extracted"
      ? `${parent.text_desc ?? parent.category ?? "asset"} (extracted sky dome)`
      : "Procedural gradient sky dome generated in Asset Editor",
    tags: Array.from(new Set([...(parent.tags ?? []), "sky", "sky_dome", mode])),
    scene_eligible: true,
    scale: 1,
    yaw_deg: 0,
    dimensions_m: dimensions ?? undefined,
    face_count: faceCount,
    mesh_face_count: faceCount,
    quality_metrics: {
      ...(parent.quality_metrics ?? {}),
      face_count: faceCount,
      vertex_count: vertexCount,
    },
    origin_alignment: "center",
    parent_asset_id: parent.asset_id,
  };
}

/* ── Selection Box (Rectangle Selection) ──────────────────────────── */

export function createSelectionHelper(container: HTMLElement): SelectionHelper {
  const element = document.createElement("div");
  element.style.cssText = `
    position: absolute;
    border: 2px dashed #00a8ff;
    background: rgba(0, 168, 255, 0.1);
    pointer-events: none;
    display: none;
    z-index: 100;
  `;
  container.style.position = "relative";
  container.appendChild(element);

  return {
    element,
    startPoint: new THREE.Vector2(),
    pointTopLeft: new THREE.Vector2(),
    pointBottomRight: new THREE.Vector2(),
    isDown: false,
    enabled: false,
  };
}

export function updateSelectionBox(
  helper: SelectionHelper,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
) {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  helper.element.style.left = `${x}px`;
  helper.element.style.top = `${y}px`;
  helper.element.style.width = `${width}px`;
  helper.element.style.height = `${height}px`;
  helper.element.style.display = "block";

  helper.pointTopLeft.set(x, y);
  helper.pointBottomRight.set(x + width, y + height);
}

export function hideSelectionBox(helper: SelectionHelper) {
  helper.element.style.display = "none";
  helper.isDown = false;
}

export function getMeshesInSelectionArea(
  ctx: PreviewContext,
  helper: SelectionHelper,
): THREE.Mesh[] {
  if (!ctx.currentModel) return [];

  const rect = ctx.renderer.domElement.getBoundingClientRect();
  const selectedMeshes: THREE.Mesh[] = [];

  ctx.currentModel.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;

    // Get mesh bounding box center in screen space
    const box = getObjectBoundingBox(mesh);
    const center = box.getCenter(new THREE.Vector3());
    center.project(ctx.camera);

    const screenX = (center.x * 0.5 + 0.5) * rect.width;
    const screenY = (-center.y * 0.5 + 0.5) * rect.height;

    // Check if center is within selection box
    if (
      screenX >= helper.pointTopLeft.x &&
      screenX <= helper.pointBottomRight.x &&
      screenY >= helper.pointTopLeft.y &&
      screenY <= helper.pointBottomRight.y
    ) {
      selectedMeshes.push(mesh);
    }
  });

  return selectedMeshes;
}

export function highlightMesh(ctx: PreviewContext, mesh: THREE.Mesh, highlighted: boolean) {
  if (highlighted) {
    if (!ctx.originalMaterials.has(mesh)) {
      ctx.originalMaterials.set(mesh, mesh.material as THREE.Material | THREE.Material[]);
    }
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.5,
    });
    mesh.material = highlightMaterial;
  } else {
    const original = ctx.originalMaterials.get(mesh);
    if (original) {
      mesh.material = original;
    }
  }
}

export function deleteSelectedMeshes(ctx: PreviewContext, meshes: THREE.Mesh[]): number {
  let deletedCount = 0;
  for (const mesh of meshes) {
    if (mesh.parent) {
      mesh.parent.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
      deletedCount++;
    }
  }
  ctx.originalMaterials.clear();
  return deletedCount;
}

/* ── Toast ─────────────────────────────────────────────────────────── */

export function showToast(root: HTMLElement, message: string, type: "success" | "error" = "success") {
  let container = root.querySelector(".ae-toast-container") as HTMLDivElement;
  if (!container) {
    container = document.createElement("div");
    container.className = "ae-toast-container";
    root.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `ae-toast ae-toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("ae-toast-show"), 10);
  setTimeout(() => {
    toast.classList.remove("ae-toast-show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
