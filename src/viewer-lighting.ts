export type LightingPresetValues = {
  exposure: number;
  keyLightIntensity: number;
  fillLightIntensity: number;
  warmth: number;
  shadowStrength: number;
  ambientOcclusion: number;
  bloomStrength: number;
  fogDensity: number;
  sunElevation: number;
  sunAzimuth: number;
};

export type LightingState = LightingPresetValues & {
  preset: string;
};

export const LIGHTING_PRESETS: Record<string, LightingPresetValues> = {
  cinematic_day: {
    exposure: 1.34,
    keyLightIntensity: 1.75,
    fillLightIntensity: 0.88,
    warmth: 0.12,
    shadowStrength: 0.46,
    ambientOcclusion: 0.36,
    bloomStrength: 0.1,
    fogDensity: 0.002,
    sunElevation: 54,
    sunAzimuth: 132,
  },
  neutral_studio: {
    exposure: 1.06,
    keyLightIntensity: 1.05,
    fillLightIntensity: 0.48,
    warmth: 0.0,
    shadowStrength: 0.5,
    ambientOcclusion: 0.46,
    bloomStrength: 0.035,
    fogDensity: 0.002,
    sunElevation: 56,
    sunAzimuth: 138,
  },
  bright_day: {
    exposure: 1.42,
    keyLightIntensity: 1.95,
    fillLightIntensity: 1.05,
    warmth: -0.04,
    shadowStrength: 0.38,
    ambientOcclusion: 0.3,
    bloomStrength: 0.08,
    fogDensity: 0.0015,
    sunElevation: 62,
    sunAzimuth: 128,
  },
  overcast: {
    exposure: 1.07,
    keyLightIntensity: 0.7,
    fillLightIntensity: 0.98,
    warmth: -0.15,
    shadowStrength: 0.2,
    ambientOcclusion: 0.42,
    bloomStrength: 0.02,
    fogDensity: 0.006,
    sunElevation: 70,
    sunAzimuth: 150,
  },
  golden_hour: {
    exposure: 1.08,
    keyLightIntensity: 1.55,
    fillLightIntensity: 0.34,
    warmth: 0.85,
    shadowStrength: 0.72,
    ambientOcclusion: 0.62,
    bloomStrength: 0.14,
    fogDensity: 0.006,
    sunElevation: 16,
    sunAzimuth: 118,
  },
  night_presentation: {
    exposure: 0.76,
    keyLightIntensity: 0.58,
    fillLightIntensity: 0.18,
    warmth: 0.24,
    shadowStrength: 0.82,
    ambientOcclusion: 0.68,
    bloomStrength: 0.22,
    fogDensity: 0.01,
    sunElevation: 10,
    sunAzimuth: 210,
  },
};

export const LIGHTING_PRESET_LABELS: Record<string, string> = {
  cinematic_day: "Cinematic Day",
  neutral_studio: "Neutral Studio",
  bright_day: "Bright Day",
  overcast: "Overcast",
  golden_hour: "Golden Hour",
  night_presentation: "Night Presentation",
  custom: "Custom",
};

export const DEFAULT_LIGHTING_STATE: LightingState = {
  preset: "cinematic_day",
  ...LIGHTING_PRESETS.cinematic_day,
};

export function completeLightingValues(values: Partial<LightingPresetValues>): LightingPresetValues {
  const merged = {
    ...LIGHTING_PRESETS.cinematic_day,
    ...values,
  };
  return {
    exposure: Number.isFinite(merged.exposure) ? merged.exposure : LIGHTING_PRESETS.cinematic_day.exposure,
    keyLightIntensity: Number.isFinite(merged.keyLightIntensity) ? merged.keyLightIntensity : LIGHTING_PRESETS.cinematic_day.keyLightIntensity,
    fillLightIntensity: Number.isFinite(merged.fillLightIntensity) ? merged.fillLightIntensity : LIGHTING_PRESETS.cinematic_day.fillLightIntensity,
    warmth: Number.isFinite(merged.warmth) ? merged.warmth : LIGHTING_PRESETS.cinematic_day.warmth,
    shadowStrength: Number.isFinite(merged.shadowStrength) ? merged.shadowStrength : LIGHTING_PRESETS.cinematic_day.shadowStrength,
    ambientOcclusion: Number.isFinite(merged.ambientOcclusion) ? merged.ambientOcclusion : LIGHTING_PRESETS.cinematic_day.ambientOcclusion,
    bloomStrength: Number.isFinite(merged.bloomStrength) ? merged.bloomStrength : LIGHTING_PRESETS.cinematic_day.bloomStrength,
    fogDensity: Number.isFinite(merged.fogDensity) ? merged.fogDensity : LIGHTING_PRESETS.cinematic_day.fogDensity,
    sunElevation: Number.isFinite(merged.sunElevation) ? merged.sunElevation : LIGHTING_PRESETS.cinematic_day.sunElevation,
    sunAzimuth: Number.isFinite(merged.sunAzimuth) ? merged.sunAzimuth : LIGHTING_PRESETS.cinematic_day.sunAzimuth,
  };
}
