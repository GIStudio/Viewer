import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { LightingState } from "./viewer-lighting";

export type ViewerLightingRig = {
  sky: Sky;
  hemiLight: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  sceneCenter: THREE.Vector3;
  sceneExtent: number;
};

export type ViewerRenderPipeline = {
  composer: EffectComposer;
  gtaoPass: GTAOPass;
  bloomPass: UnrealBloomPass;
  render: (deltaSeconds: number) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
};

type ApplyLightingOptions = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  rig: ViewerLightingRig;
  pipeline: ViewerRenderPipeline;
  state: LightingState;
};

const SKY_SCALE = 450000;
const DEFAULT_SCENE_EXTENT = 80;

function finiteOrFallback(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sunDirection(state: LightingState): THREE.Vector3 {
  const elevation = THREE.MathUtils.degToRad(finiteOrFallback(state.sunElevation, 52));
  const azimuth = THREE.MathUtils.degToRad(finiteOrFallback(state.sunAzimuth, 135));
  return new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ).normalize();
}

function colorForWarmth(cool: string, warm: string, warmth: number, scale = 1): THREE.Color {
  const t = THREE.MathUtils.clamp((warmth + 1) * 0.5 * scale, 0, 1);
  return new THREE.Color().lerpColors(new THREE.Color(cool), new THREE.Color(warm), t);
}

export function createViewerLightingRig(scene: THREE.Scene): ViewerLightingRig {
  const sky = new Sky();
  sky.name = "viewer_atmospheric_sky";
  sky.scale.setScalar(SKY_SCALE);
  sky.userData.viewerHelper = true;
  scene.add(sky);

  const hemiLight = new THREE.HemisphereLight(0xf7fbff, 0xc4b8aa, 0.65);
  hemiLight.name = "viewer_hemisphere_light";
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
  keyLight.name = "viewer_sun_key_light";
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(4096, 4096);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 300;
  keyLight.shadow.camera.left = -120;
  keyLight.shadow.camera.right = 120;
  keyLight.shadow.camera.top = 120;
  keyLight.shadow.camera.bottom = -120;
  keyLight.shadow.bias = -0.00014;
  keyLight.shadow.normalBias = 0.018;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const fillLight = new THREE.DirectionalLight(0xdce8ff, 0.45);
  fillLight.name = "viewer_cool_fill_light";
  scene.add(fillLight);
  scene.add(fillLight.target);

  const rimLight = new THREE.DirectionalLight(0x9fc8ff, 0.32);
  rimLight.name = "viewer_rim_light";
  scene.add(rimLight);
  scene.add(rimLight.target);

  return {
    sky,
    hemiLight,
    keyLight,
    fillLight,
    rimLight,
    sceneCenter: new THREE.Vector3(),
    sceneExtent: DEFAULT_SCENE_EXTENT,
  };
}

export function fitViewerLightingRigToBounds(rig: ViewerLightingRig, bbox: THREE.Box3): void {
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z, DEFAULT_SCENE_EXTENT);
  rig.sceneCenter.copy(center);
  rig.sceneExtent = Number.isFinite(extent) ? extent : DEFAULT_SCENE_EXTENT;
}

export function createViewerRenderPipeline(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
): ViewerRenderPipeline {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);

  const gtaoPass = new GTAOPass(scene, camera, safeWidth, safeHeight);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.blendIntensity = 0.52;
  gtaoPass.updateGtaoMaterial({
    radius: 3.8,
    distanceExponent: 1.4,
    thickness: 1.8,
    scale: 1.1,
    samples: 12,
    screenSpaceRadius: true,
  });
  gtaoPass.updatePdMaterial({
    radius: 7,
    radiusExponent: 2,
    rings: 2,
    samples: 12,
  });

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(safeWidth, safeHeight),
    0.08,
    0.42,
    0.86,
  );
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(gtaoPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  return {
    composer,
    gtaoPass,
    bloomPass,
    render: (deltaSeconds: number) => composer.render(deltaSeconds),
    setSize: (nextWidth: number, nextHeight: number) => {
      const w = Math.max(1, nextWidth);
      const h = Math.max(1, nextHeight);
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
    },
    dispose: () => {
      gtaoPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
    },
  };
}

export function applyViewerLightingState({
  scene,
  renderer,
  rig,
  pipeline,
  state,
}: ApplyLightingOptions): void {
  const warmth = finiteOrFallback(state.warmth, 0);
  const shadowStrength = THREE.MathUtils.clamp(finiteOrFallback(state.shadowStrength, 0.45), 0, 1);
  const sunDir = sunDirection(state);
  const extent = Math.max(rig.sceneExtent, DEFAULT_SCENE_EXTENT);
  const center = rig.sceneCenter;
  const lightDistance = extent * 2.2;

  renderer.toneMappingExposure = finiteOrFallback(state.exposure, 1.1);

  rig.keyLight.color.copy(colorForWarmth("#f5fbff", "#ffd49b", warmth));
  rig.keyLight.intensity = finiteOrFallback(state.keyLightIntensity, 1.1) * (0.9 + shadowStrength * 0.55);
  rig.keyLight.position.copy(center).addScaledVector(sunDir, lightDistance);
  rig.keyLight.target.position.copy(center);
  rig.keyLight.target.updateMatrixWorld();
  rig.keyLight.shadow.camera.left = -extent * 0.85;
  rig.keyLight.shadow.camera.right = extent * 0.85;
  rig.keyLight.shadow.camera.top = extent * 0.85;
  rig.keyLight.shadow.camera.bottom = -extent * 0.85;
  rig.keyLight.shadow.camera.far = Math.max(220, extent * 3.2);
  rig.keyLight.shadow.radius = 1.2 + (1 - shadowStrength) * 5.5;
  rig.keyLight.shadow.normalBias = 0.008 + (1 - shadowStrength) * 0.026;
  rig.keyLight.shadow.camera.updateProjectionMatrix();

  const fillDir = sunDir.clone().multiplyScalar(-1).setY(0.48).normalize();
  rig.fillLight.color.copy(colorForWarmth("#dce8ff", "#ffe5c7", warmth, 0.75));
  rig.fillLight.intensity = finiteOrFallback(state.fillLightIntensity, 0.5) * (0.76 - shadowStrength * 0.2);
  rig.fillLight.position.copy(center).addScaledVector(fillDir, extent * 1.5);
  rig.fillLight.target.position.copy(center);
  rig.fillLight.target.updateMatrixWorld();

  const rimDir = new THREE.Vector3(-sunDir.z, 0.42, sunDir.x).normalize();
  rig.rimLight.color.copy(colorForWarmth("#b6d6ff", "#ffd8a8", warmth, 0.8));
  rig.rimLight.intensity = 0.16 + shadowStrength * 0.38;
  rig.rimLight.position.copy(center).addScaledVector(rimDir, extent * 1.3);
  rig.rimLight.target.position.copy(center);
  rig.rimLight.target.updateMatrixWorld();

  rig.hemiLight.color.copy(colorForWarmth("#f6fbff", "#fff0d8", warmth, 0.58));
  rig.hemiLight.groundColor.copy(colorForWarmth("#a9b7b5", "#c1a78d", warmth, 0.55));
  rig.hemiLight.intensity = 0.26 + finiteOrFallback(state.fillLightIntensity, 0.5) * (0.38 - shadowStrength * 0.14);

  rig.sky.position.copy(center);
  rig.sky.material.uniforms.sunPosition.value.copy(sunDir);
  rig.sky.material.uniforms.turbidity.value = 2.4 + Math.max(warmth, 0) * 2.8;
  rig.sky.material.uniforms.rayleigh.value = 0.72 + (1 - shadowStrength) * 0.32;
  rig.sky.material.uniforms.mieCoefficient.value = 0.004 + finiteOrFallback(state.fogDensity, 0.02) * 0.12;
  rig.sky.material.uniforms.mieDirectionalG.value = 0.78;

  const fogDensity = Math.max(0, finiteOrFallback(state.fogDensity, 0.02));
  if (fogDensity > 0.001) {
    scene.fog = new THREE.FogExp2(colorForWarmth("#dfe8f2", "#f0d3ad", warmth, 0.65), fogDensity);
  } else {
    scene.fog = null;
  }

  pipeline.gtaoPass.enabled = finiteOrFallback(state.ambientOcclusion, 0.45) > 0.01;
  pipeline.gtaoPass.blendIntensity = THREE.MathUtils.clamp(finiteOrFallback(state.ambientOcclusion, 0.45), 0, 1.1);
  pipeline.bloomPass.enabled = finiteOrFallback(state.bloomStrength, 0.06) > 0.001;
  pipeline.bloomPass.strength = THREE.MathUtils.clamp(finiteOrFallback(state.bloomStrength, 0.06), 0, 0.8);
  pipeline.bloomPass.radius = 0.38 + Math.max(0, warmth) * 0.2;
  pipeline.bloomPass.threshold = warmth > 0.55 ? 0.78 : 0.86;
}
