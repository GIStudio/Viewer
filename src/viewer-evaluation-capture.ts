import * as THREE from "three";
import type { RenderedEvaluationView } from "./viewer-evaluation";

export type EvaluationCaptureDeps = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  cameraForwardHorizontal: () => THREE.Vector3;
  currentRoot: THREE.Object3D | null;
  currentSpawn: THREE.Vector3;
  currentForward: THREE.Vector3;
  avatarEyeHeightM: number;
};

function renderEvaluationCameraToDataUrl(
  deps: EvaluationCaptureDeps,
  renderCamera: THREE.Camera,
  width = 960,
  height = 540,
): string {
  const captureRenderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  captureRenderer.setSize(width, height, false);
  captureRenderer.setPixelRatio(1);
  captureRenderer.outputColorSpace = deps.renderer.outputColorSpace;
  captureRenderer.toneMapping = deps.renderer.toneMapping;
  captureRenderer.toneMappingExposure = deps.renderer.toneMappingExposure;
  captureRenderer.shadowMap.enabled = deps.renderer.shadowMap.enabled;
  captureRenderer.shadowMap.type = deps.renderer.shadowMap.type;
  const bgColor = deps.scene.background instanceof THREE.Color ? deps.scene.background : new THREE.Color("#f7f6f3");
  captureRenderer.setClearColor(bgColor);
  captureRenderer.render(deps.scene, renderCamera);
  const dataUrl = captureRenderer.domElement.toDataURL("image/png");
  captureRenderer.dispose();
  return dataUrl;
}

function currentEvaluationForward(deps: EvaluationCaptureDeps): THREE.Vector3 {
  const forward = deps.currentForward.clone().setY(0);
  if (forward.lengthSq() > 1e-6) {
    return forward.normalize();
  }
  const cameraForward = deps.cameraForwardHorizontal();
  if (cameraForward.lengthSq() > 1e-6) {
    return cameraForward.normalize();
  }
  return new THREE.Vector3(1, 0, 0);
}

function makePedestrianEvaluationCamera(
  deps: EvaluationCaptureDeps,
  direction: 1 | -1,
): THREE.PerspectiveCamera {
  const bbox = deps.currentRoot ? new THREE.Box3().setFromObject(deps.currentRoot) : null;
  const eye = deps.currentSpawn.clone();
  if (!Number.isFinite(eye.x) || !Number.isFinite(eye.y) || !Number.isFinite(eye.z)) {
    eye.set(0, deps.avatarEyeHeightM, 0);
  }
  const groundY = bbox ? bbox.min.y : 0;
  eye.y = Math.max(eye.y, groundY + deps.avatarEyeHeightM);

  const forward = currentEvaluationForward(deps).multiplyScalar(direction);
  const target = eye.clone().add(forward.multiplyScalar(12));
  target.y = eye.y - 0.05;

  const renderCamera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 2000);
  renderCamera.position.copy(eye);
  renderCamera.lookAt(target);
  renderCamera.updateProjectionMatrix();
  return renderCamera;
}

function makeOverviewEvaluationCamera(
  deps: EvaluationCaptureDeps,
  width = 960,
  height = 540,
): THREE.OrthographicCamera {
  if (!deps.currentRoot) {
    throw new Error("No scene root available for top-down evaluation view.");
  }
  const bbox = new THREE.Box3().setFromObject(deps.currentRoot);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.z);
  if (!Number.isFinite(maxExtent) || maxExtent <= 0) {
    throw new Error("Scene bounds are too small for evaluation screenshots.");
  }
  const padding = maxExtent * 0.18;
  const viewSize = maxExtent + padding * 2;
  const aspect = width / height;
  const halfHeight = viewSize / 2;
  const halfWidth = halfHeight * aspect;
  const renderCamera = new THREE.OrthographicCamera(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    0.1,
    5000,
  );
  renderCamera.position.set(center.x, center.y + size.y * 0.5 + viewSize * 1.2, center.z);
  renderCamera.lookAt(center.x, center.y, center.z);
  renderCamera.updateProjectionMatrix();
  return renderCamera;
}

export async function captureEvaluationViews(
  deps: EvaluationCaptureDeps,
): Promise<RenderedEvaluationView[]> {
  if (!deps.currentRoot) {
    throw new Error("No scene loaded for visual evaluation.");
  }
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  const views: RenderedEvaluationView[] = [
    {
      view_id: "pedestrian_forward",
      label: "Pedestrian forward view",
      image_data_url: renderEvaluationCameraToDataUrl(deps, makePedestrianEvaluationCamera(deps, 1)),
    },
    {
      view_id: "pedestrian_reverse",
      label: "Pedestrian reverse view",
      image_data_url: renderEvaluationCameraToDataUrl(deps, makePedestrianEvaluationCamera(deps, -1)),
    },
    {
      view_id: "overview_topdown",
      label: "Overview top-down view",
      image_data_url: renderEvaluationCameraToDataUrl(deps, makeOverviewEvaluationCamera(deps)),
    },
  ];
  return views.every((view) => view.image_data_url.startsWith("data:image/")) ? views : [];
}
