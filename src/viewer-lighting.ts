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
  analytical_diorama: {
    exposure: 1.12,
    keyLightIntensity: 1.28,
    fillLightIntensity: 0.72,
    warmth: 0.04,
    shadowStrength: 0.48,
    ambientOcclusion: 0.62,
    bloomStrength: 0.018,
    fogDensity: 0.0012,
    sunElevation: 58,
    sunAzimuth: 136,
  },
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

export const LIGHTING_PRESET_LABELS: Record<string, { en: string; zh: string }> = {
  analytical_diorama: { en: "Analytical Diorama", zh: "分析模型" },
  cinematic_day: { en: "Cinematic Day", zh: "电影日景" },
  neutral_studio: { en: "Neutral Studio", zh: "中性工作室" },
  bright_day: { en: "Bright Day", zh: "明亮日景" },
  overcast: { en: "Overcast", zh: "阴天" },
  golden_hour: { en: "Golden Hour", zh: "黄金时刻" },
  night_presentation: { en: "Night Presentation", zh: "夜景展示" },
  custom: { en: "Custom", zh: "自定义" },
};

export function lightingPresetLabel(preset: string, language: "en" | "zh"): string {
  const labels = LIGHTING_PRESET_LABELS[preset];
  return labels?.[language] ?? labels?.en ?? preset;
}

export const DEFAULT_LIGHTING_STATE: LightingState = {
  preset: "analytical_diorama",
  ...LIGHTING_PRESETS.analytical_diorama,
};

export function completeLightingValues(values: Partial<LightingPresetValues>): LightingPresetValues {
  const merged = {
    ...LIGHTING_PRESETS.analytical_diorama,
    ...values,
  };
  return {
    exposure: Number.isFinite(merged.exposure) ? merged.exposure : LIGHTING_PRESETS.analytical_diorama.exposure,
    keyLightIntensity: Number.isFinite(merged.keyLightIntensity) ? merged.keyLightIntensity : LIGHTING_PRESETS.analytical_diorama.keyLightIntensity,
    fillLightIntensity: Number.isFinite(merged.fillLightIntensity) ? merged.fillLightIntensity : LIGHTING_PRESETS.analytical_diorama.fillLightIntensity,
    warmth: Number.isFinite(merged.warmth) ? merged.warmth : LIGHTING_PRESETS.analytical_diorama.warmth,
    shadowStrength: Number.isFinite(merged.shadowStrength) ? merged.shadowStrength : LIGHTING_PRESETS.analytical_diorama.shadowStrength,
    ambientOcclusion: Number.isFinite(merged.ambientOcclusion) ? merged.ambientOcclusion : LIGHTING_PRESETS.analytical_diorama.ambientOcclusion,
    bloomStrength: Number.isFinite(merged.bloomStrength) ? merged.bloomStrength : LIGHTING_PRESETS.analytical_diorama.bloomStrength,
    fogDensity: Number.isFinite(merged.fogDensity) ? merged.fogDensity : LIGHTING_PRESETS.analytical_diorama.fogDensity,
    sunElevation: Number.isFinite(merged.sunElevation) ? merged.sunElevation : LIGHTING_PRESETS.analytical_diorama.sunElevation,
    sunAzimuth: Number.isFinite(merged.sunAzimuth) ? merged.sunAzimuth : LIGHTING_PRESETS.analytical_diorama.sunAzimuth,
  };
}
