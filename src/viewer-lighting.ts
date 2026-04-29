export type LightingPresetValues = {
  exposure: number;
  keyLightIntensity: number;
  fillLightIntensity: number;
  warmth: number;
  shadowStrength: number;
};

export type LightingState = LightingPresetValues & {
  preset: string;
};

export const LIGHTING_PRESETS: Record<string, LightingPresetValues> = {
  neutral_studio: {
    exposure: 1.1,
    keyLightIntensity: 1.0,
    fillLightIntensity: 0.55,
    warmth: 0.0,
    shadowStrength: 0.45,
  },
  bright_day: {
    exposure: 1.3,
    keyLightIntensity: 1.2,
    fillLightIntensity: 0.8,
    warmth: -0.1,
    shadowStrength: 0.3,
  },
  overcast: {
    exposure: 1.05,
    keyLightIntensity: 0.75,
    fillLightIntensity: 0.95,
    warmth: -0.15,
    shadowStrength: 0.15,
  },
  golden_hour: {
    exposure: 1.18,
    keyLightIntensity: 1.05,
    fillLightIntensity: 0.48,
    warmth: 0.85,
    shadowStrength: 0.58,
  },
  night_presentation: {
    exposure: 0.82,
    keyLightIntensity: 0.62,
    fillLightIntensity: 0.24,
    warmth: 0.2,
    shadowStrength: 0.72,
  },
};

export const LIGHTING_PRESET_LABELS: Record<string, string> = {
  neutral_studio: "Neutral Studio",
  bright_day: "Bright Day",
  overcast: "Overcast",
  golden_hour: "Golden Hour",
  night_presentation: "Night Presentation",
  custom: "Custom",
};

export const DEFAULT_LIGHTING_STATE: LightingState = {
  preset: "custom",
  exposure: 1.8,
  keyLightIntensity: 1.7,
  fillLightIntensity: 1.2,
  warmth: 0.6,
  shadowStrength: 0.05,
};
