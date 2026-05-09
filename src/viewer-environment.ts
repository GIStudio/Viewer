import * as THREE from "three";
import {
  completeLightingValues,
  type LightingState,
} from "./viewer-lighting";

export type WeatherMode = "clear" | "overcast" | "rain" | "fog";
export type SunCycleSpeed = "slow" | "medium" | "fast";

export type EnvironmentState = {
  weatherMode: WeatherMode;
  weatherIntensity: number;
  timeOfDayHours: number;
  sunCycleEnabled: boolean;
  sunCycleSpeed: SunCycleSpeed;
  source: string;
};

export const WEATHER_MODE_LABELS: Record<WeatherMode, string> = {
  clear: "Clear / 晴天",
  overcast: "Overcast / 阴天",
  rain: "Rain / 雨天",
  fog: "Fog / 雾天",
};

export const SUN_CYCLE_SPEED_LABELS: Record<SunCycleSpeed, string> = {
  slow: "Slow / 慢",
  medium: "Medium / 中",
  fast: "Fast / 快",
};

export const DEFAULT_ENVIRONMENT_STATE: EnvironmentState = {
  weatherMode: "clear",
  weatherIntensity: 0,
  timeOfDayHours: 14,
  sunCycleEnabled: false,
  sunCycleSpeed: "medium",
  source: "default_runtime",
};

export type ViewerWeatherEffects = {
  rain: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  center: THREE.Vector3;
  extent: number;
};

const RAIN_DROP_COUNT = 900;

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return THREE.MathUtils.clamp(parsed, min, max);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeWeatherMode(value: unknown): WeatherMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "overcast" || normalized === "rain" || normalized === "fog") {
    return normalized;
  }
  return "clear";
}

function normalizeSunCycleSpeed(value: unknown): SunCycleSpeed {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "slow" || normalized === "fast") return normalized;
  return "medium";
}

function field(raw: Record<string, unknown>, snake: string, camel: string): unknown {
  return raw[snake] ?? raw[camel];
}

export function normalizeEnvironmentState(raw: unknown): EnvironmentState {
  const payload = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    weatherMode: normalizeWeatherMode(field(payload, "weather_mode", "weatherMode")),
    weatherIntensity: clampNumber(field(payload, "weather_intensity", "weatherIntensity"), DEFAULT_ENVIRONMENT_STATE.weatherIntensity, 0, 1),
    timeOfDayHours: clampNumber(field(payload, "time_of_day_hours", "timeOfDayHours"), DEFAULT_ENVIRONMENT_STATE.timeOfDayHours, 0, 24),
    sunCycleEnabled: asBoolean(field(payload, "sun_cycle_enabled", "sunCycleEnabled"), DEFAULT_ENVIRONMENT_STATE.sunCycleEnabled),
    sunCycleSpeed: normalizeSunCycleSpeed(field(payload, "sun_cycle_speed", "sunCycleSpeed")),
    source: String(payload.source || DEFAULT_ENVIRONMENT_STATE.source),
  };
}

function sunAnglesFromTime(hours: number): { sunElevation: number; sunAzimuth: number } {
  const hour = THREE.MathUtils.clamp(hours, 0, 24);
  const dayPhase = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1);
  const solarArc = Math.sin(dayPhase * Math.PI);
  const nightBlend = hour < 6 || hour > 18 ? 1 : 0;
  return {
    sunElevation: THREE.MathUtils.lerp(Math.max(-6, solarArc * 72), -4, nightBlend),
    sunAzimuth: THREE.MathUtils.euclideanModulo(82 + dayPhase * 166, 360),
  };
}

function dampToward(value: number, target: number, amount: number): number {
  return THREE.MathUtils.lerp(value, target, THREE.MathUtils.clamp(amount, 0, 1));
}

export function deriveEnvironmentLightingState(
  baseState: LightingState,
  environmentState: EnvironmentState,
): LightingState {
  const completeBase = completeLightingValues(baseState);
  const next: LightingState = {
    preset: baseState.preset,
    ...completeBase,
    ...sunAnglesFromTime(environmentState.timeOfDayHours),
  };
  const intensity = environmentState.weatherMode === "clear" ? 0 : environmentState.weatherIntensity;
  if (environmentState.weatherMode === "overcast") {
    next.exposure = dampToward(next.exposure, 1.04, intensity * 0.7);
    next.keyLightIntensity = dampToward(next.keyLightIntensity, 0.58, intensity);
    next.fillLightIntensity = dampToward(next.fillLightIntensity, 1.08, intensity);
    next.warmth = dampToward(next.warmth, -0.22, intensity);
    next.shadowStrength = dampToward(next.shadowStrength, 0.16, intensity);
    next.fogDensity = dampToward(next.fogDensity, 0.0065, intensity);
    next.bloomStrength = dampToward(next.bloomStrength, 0.025, intensity);
  } else if (environmentState.weatherMode === "rain") {
    next.exposure = dampToward(next.exposure, 0.94, intensity * 0.75);
    next.keyLightIntensity = dampToward(next.keyLightIntensity, 0.52, intensity);
    next.fillLightIntensity = dampToward(next.fillLightIntensity, 0.92, intensity);
    next.warmth = dampToward(next.warmth, -0.3, intensity);
    next.shadowStrength = dampToward(next.shadowStrength, 0.2, intensity);
    next.fogDensity = dampToward(next.fogDensity, 0.009, intensity);
    next.ambientOcclusion = dampToward(next.ambientOcclusion, 0.58, intensity * 0.8);
    next.bloomStrength = dampToward(next.bloomStrength, 0.055, intensity);
  } else if (environmentState.weatherMode === "fog") {
    next.exposure = dampToward(next.exposure, 1.0, intensity * 0.55);
    next.keyLightIntensity = dampToward(next.keyLightIntensity, 0.44, intensity);
    next.fillLightIntensity = dampToward(next.fillLightIntensity, 1.18, intensity);
    next.warmth = dampToward(next.warmth, -0.18, intensity * 0.75);
    next.shadowStrength = dampToward(next.shadowStrength, 0.08, intensity);
    next.fogDensity = dampToward(next.fogDensity, 0.026, intensity);
    next.bloomStrength = dampToward(next.bloomStrength, 0.018, intensity);
  }
  return next;
}

export function advanceEnvironmentSunCycle(
  state: EnvironmentState,
  deltaSeconds: number,
): EnvironmentState {
  if (!state.sunCycleEnabled) return state;
  const speedHoursPerSecond: Record<SunCycleSpeed, number> = {
    slow: 0.04,
    medium: 0.12,
    fast: 0.32,
  };
  return {
    ...state,
    timeOfDayHours: (state.timeOfDayHours + speedHoursPerSecond[state.sunCycleSpeed] * deltaSeconds) % 24,
  };
}

function seededUnit(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function resetRainPositions(effects: ViewerWeatherEffects): void {
  const spread = Math.max(40, effects.extent * 1.05);
  const top = effects.center.y + Math.max(24, effects.extent * 0.72);
  const height = Math.max(32, effects.extent * 0.58);
  for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
    const offset = i * 3;
    effects.positions[offset] = effects.center.x + (seededUnit(i, 1) - 0.5) * spread;
    effects.positions[offset + 1] = top - seededUnit(i, 2) * height;
    effects.positions[offset + 2] = effects.center.z + (seededUnit(i, 3) - 0.5) * spread;
  }
  effects.rain.geometry.getAttribute("position").needsUpdate = true;
}

export function createViewerWeatherEffects(scene: THREE.Scene): ViewerWeatherEffects {
  const positions = new Float32Array(RAIN_DROP_COUNT * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xd6e6ff,
    size: 0.16,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const rain = new THREE.Points(geometry, material);
  rain.name = "viewer_runtime_rain";
  rain.frustumCulled = false;
  rain.visible = false;
  rain.userData.viewerHelper = true;
  scene.add(rain);
  const effects: ViewerWeatherEffects = {
    rain,
    positions,
    center: new THREE.Vector3(),
    extent: 80,
  };
  resetRainPositions(effects);
  return effects;
}

export function updateViewerWeatherEffects(
  effects: ViewerWeatherEffects,
  environmentState: EnvironmentState,
  deltaSeconds: number,
  center: THREE.Vector3,
  extent: number,
): void {
  const safeExtent = Math.max(40, Number.isFinite(extent) ? extent : 80);
  if (effects.center.distanceToSquared(center) > 0.25 || Math.abs(effects.extent - safeExtent) > 1) {
    effects.center.copy(center);
    effects.extent = safeExtent;
    resetRainPositions(effects);
  }
  const intensity = environmentState.weatherMode === "rain" ? environmentState.weatherIntensity : 0;
  effects.rain.visible = intensity > 0.02;
  effects.rain.material.opacity = 0.12 + intensity * 0.32;
  if (!effects.rain.visible) return;
  const floor = effects.center.y + 0.1;
  const top = effects.center.y + Math.max(24, safeExtent * 0.72);
  const spread = Math.max(40, safeExtent * 1.05);
  const fallSpeed = 18 + intensity * 34;
  for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
    const offset = i * 3;
    effects.positions[offset + 1] -= fallSpeed * deltaSeconds * (0.75 + seededUnit(i, 4) * 0.5);
    effects.positions[offset] -= deltaSeconds * (0.8 + intensity * 1.2);
    if (effects.positions[offset + 1] < floor) {
      effects.positions[offset] = effects.center.x + (seededUnit(i + performance.now() * 0.01, 5) - 0.5) * spread;
      effects.positions[offset + 1] = top;
      effects.positions[offset + 2] = effects.center.z + (seededUnit(i + performance.now() * 0.01, 6) - 0.5) * spread;
    }
  }
  effects.rain.geometry.getAttribute("position").needsUpdate = true;
}

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

export function applyEnvironmentMaterialState(
  root: THREE.Object3D | null,
  environmentState: EnvironmentState,
): void {
  if (!root) return;
  const rainWetness = environmentState.weatherMode === "rain" ? environmentState.weatherIntensity : 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of materialList(object.material)) {
      if (!("roughness" in material) || !("color" in material)) continue;
      const standard = material as THREE.MeshStandardMaterial;
      const base = standard.userData.viewerEnvironmentBase as { roughness: number; color: string } | undefined;
      if (!base) {
        standard.userData.viewerEnvironmentBase = {
          roughness: standard.roughness,
          color: `#${standard.color.getHexString()}`,
        };
      }
      const nextBase = standard.userData.viewerEnvironmentBase as { roughness: number; color: string };
      standard.roughness = dampToward(nextBase.roughness, Math.min(nextBase.roughness, 0.28), rainWetness * 0.72);
      standard.color.copy(new THREE.Color(nextBase.color)).lerp(new THREE.Color("#5f6f7f"), rainWetness * 0.08);
      standard.needsUpdate = true;
    }
  });
}

export function disposeViewerWeatherEffects(effects: ViewerWeatherEffects): void {
  effects.rain.parent?.remove(effects.rain);
  effects.rain.geometry.dispose();
  effects.rain.material.dispose();
}
