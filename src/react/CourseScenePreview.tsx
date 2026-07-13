import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { CourseApi } from "../course-api";

export function CourseScenePreview({ api, artifactId, label }: { api: CourseApi; artifactId?: string; label: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(artifactId ? "loading" : "idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !artifactId) { setStatus("idle"); return; }
    let disposed = false;
    let frame = 0;
    setStatus("loading");
    setError("");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x102d3a);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    camera.position.set(72, 58, 72);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    host.replaceChildren(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xdceef0, 0x5d5038, 2.2));
    const sun = new THREE.DirectionalLight(0xfff3ce, 3.2);
    sun.position.set(45, 80, 35);
    sun.castShadow = true;
    scene.add(sun);
    const grid = new THREE.GridHelper(260, 26, 0xf4c430, 0x41616d);
    grid.position.y = -0.04;
    scene.add(grid);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const render = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    void api.fetchArtifactBlob(artifactId).then((blob) => blob.arrayBuffer()).then((buffer) => {
      if (disposed) return;
      new GLTFLoader().parse(buffer, "", (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        // The exported environment dome is ~2 km wide.  It is useful to the
        // production renderer, but including it in an interactive fit-to-view
        // makes the actual street a sub-pixel speck (and some fallback domes
        // render as an opaque white sphere).  The course preview supplies its
        // own background, so exclude these environment-only nodes.
        const environmentNodes: THREE.Object3D[] = [];
        root.traverse((object) => {
          const name = object.name.toLowerCase();
          if (name.includes("sky_dome") || name.includes("sky-dome") || name.includes("environment_default_sky")) {
            environmentNodes.push(object);
          }
          const mesh = object as THREE.Mesh;
          const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
          for (const material of materials) {
            if (!material.name.toLowerCase().includes("roadgen3d_transparent_massing")) continue;
            const massing = material as THREE.MeshStandardMaterial;
            massing.transparent = true;
            massing.opacity = 0.42;
            massing.depthWrite = false;
            massing.roughness = 1;
            massing.metalness = 0;
            massing.needsUpdate = true;
            mesh.renderOrder = 2;
          }
        });
        for (const object of environmentNodes) object.parent?.remove(object);
        scene.add(root);
        const bounds = new THREE.Box3().setFromObject(root);
        if (!bounds.isEmpty()) {
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          const radius = Math.max(size.x, size.y, size.z, 10);
          const gridScale = Math.max(1, radius / 100);
          grid.position.set(center.x, bounds.min.y - 0.04, center.z);
          grid.scale.setScalar(gridScale);
          controls.target.copy(center);
          camera.position.copy(center).add(new THREE.Vector3(radius * 1.8, radius * 1.35, radius * 1.8));
          camera.near = Math.max(0.05, radius / 1000);
          camera.far = Math.max(1000, radius * 30);
          camera.updateProjectionMatrix();
          controls.update();
        }
        setStatus("ready");
      }, (reason) => {
        if (!disposed) { setStatus("error"); setError(reason instanceof Error ? reason.message : String(reason)); }
      });
    }).catch((reason) => {
      if (!disposed) { setStatus("error"); setError(reason instanceof Error ? reason.message : String(reason)); }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) material.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [api, artifactId]);

  return <div className="course-scene-preview" data-status={status}>
    <div ref={hostRef} className="course-scene-preview-canvas" aria-label={label} />
    <div className="course-scene-preview-label"><span>{status === "ready" ? "3D READY" : status === "error" ? "PREVIEW ERROR" : status === "loading" ? "LOADING GLB" : "AWAITING BASELINE"}</span><strong>{label}</strong></div>
    {status === "error" ? <p>{error}</p> : null}
  </div>;
}
