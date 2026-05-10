import * as THREE from "three";
import {
  SUN_CYCLE_SPEED_LABELS,
  WEATHER_MODE_LABELS,
  advanceEnvironmentSunCycle,
  applyEnvironmentMaterialState,
  createViewerWeatherEffects,
  normalizeEnvironmentState,
  updateViewerWeatherEffects,
  disposeViewerWeatherEffects,
  type EnvironmentState,
} from "./viewer-environment";
import { requireElement } from "./viewer-utils";

type ToggleInputSetter = (
  inputEl: HTMLInputElement,
  checked: boolean,
  options?: { emitChange?: boolean },
) => void;

export type ViewerEnvironmentController = {
  resetFromManifest(raw: unknown): void;
  sync(options?: { applyMaterials?: boolean }): void;
  update(deltaSeconds: number, sceneCenter: THREE.Vector3, sceneExtent: number): void;
  dispose(): void;
};

export type ViewerEnvironmentControllerOptions = {
  root: HTMLElement | Document;
  scene: THREE.Scene;
  signal: AbortSignal;
  getState: () => EnvironmentState;
  setState: (state: EnvironmentState) => void;
  getCurrentRoot: () => THREE.Object3D | null;
  setToggleInput: ToggleInputSetter;
  applyLightingState: () => void;
};

function fillSelectOptions(selectEl: HTMLSelectElement, options: Record<string, string>): void {
  selectEl.replaceChildren();
  for (const [value, label] of Object.entries(options)) {
    const optionEl = document.createElement("option");
    optionEl.value = value;
    optionEl.textContent = label;
    selectEl.appendChild(optionEl);
  }
}

export function createViewerEnvironmentController(
  options: ViewerEnvironmentControllerOptions,
): ViewerEnvironmentController {
  const {
    root,
    scene,
    signal,
    getState,
    setState,
    getCurrentRoot,
    setToggleInput,
    applyLightingState,
  } = options;
  const weatherEffects = createViewerWeatherEffects(scene);
  const weatherEl = requireElement<HTMLSelectElement>(root, "#environment-weather");
  const intensityInput = requireElement<HTMLInputElement>(root, "#environment-intensity");
  const timeInput = requireElement<HTMLInputElement>(root, "#environment-time");
  const sunCycleToggleEl = requireElement<HTMLInputElement>(root, "#environment-sun-cycle-enabled");
  const sunCycleSpeedEl = requireElement<HTMLSelectElement>(root, "#environment-sun-cycle-speed");
  const intensityValueEl = requireElement<HTMLElement>(root, "#environment-intensity-value");
  const timeValueEl = requireElement<HTMLElement>(root, "#environment-time-value");

  const sync = (syncOptions: { applyMaterials?: boolean } = {}): void => {
    const state = getState();
    weatherEl.value = state.weatherMode;
    intensityInput.value = state.weatherIntensity.toString();
    timeInput.value = state.timeOfDayHours.toString();
    setToggleInput(sunCycleToggleEl, state.sunCycleEnabled);
    sunCycleSpeedEl.value = state.sunCycleSpeed;
    intensityValueEl.textContent = state.weatherIntensity.toFixed(2);
    timeValueEl.textContent = `${state.timeOfDayHours.toFixed(2)}h`;
    if (syncOptions.applyMaterials) {
      applyEnvironmentMaterialState(getCurrentRoot(), state);
    }
    applyLightingState();
  };

  fillSelectOptions(weatherEl, WEATHER_MODE_LABELS);
  fillSelectOptions(sunCycleSpeedEl, SUN_CYCLE_SPEED_LABELS);

  weatherEl.addEventListener(
    "change",
    () => {
      const previous = getState();
      setState({
        ...previous,
        weatherMode: weatherEl.value as EnvironmentState["weatherMode"],
        weatherIntensity: weatherEl.value === "clear" ? 0 : Math.max(previous.weatherIntensity, 0.65),
        source: "viewer_runtime",
      });
      sync({ applyMaterials: true });
    },
    { signal },
  );

  intensityInput.addEventListener(
    "input",
    () => {
      setState({
        ...getState(),
        weatherIntensity: Number(intensityInput.value),
        source: "viewer_runtime",
      });
      sync({ applyMaterials: true });
    },
    { signal },
  );

  timeInput.addEventListener(
    "input",
    () => {
      setState({
        ...getState(),
        timeOfDayHours: Number(timeInput.value),
        source: "viewer_runtime",
      });
      sync();
    },
    { signal },
  );

  sunCycleToggleEl.addEventListener(
    "change",
    () => {
      setState({
        ...getState(),
        sunCycleEnabled: sunCycleToggleEl.checked,
        source: "viewer_runtime",
      });
      sync();
    },
    { signal },
  );

  sunCycleSpeedEl.addEventListener(
    "change",
    () => {
      setState({
        ...getState(),
        sunCycleSpeed: sunCycleSpeedEl.value as EnvironmentState["sunCycleSpeed"],
        source: "viewer_runtime",
      });
      sync();
    },
    { signal },
  );

  return {
    resetFromManifest(raw: unknown): void {
      setState(normalizeEnvironmentState(raw));
      sync({ applyMaterials: true });
    },
    sync,
    update(deltaSeconds: number, sceneCenter: THREE.Vector3, sceneExtent: number): void {
      const previous = getState();
      const next = advanceEnvironmentSunCycle(previous, deltaSeconds);
      if (next !== previous) {
        setState(next);
        sync();
      }
      updateViewerWeatherEffects(weatherEffects, getState(), deltaSeconds, sceneCenter, sceneExtent);
    },
    dispose(): void {
      disposeViewerWeatherEffects(weatherEffects);
    },
  };
}
