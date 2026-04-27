/**
 * Scene Comparison with Radar Chart
 * 双场景对比雷达图功能
 */

import * as THREE from "three";

export type SceneMetrics = {
  [key: string]: number;
};

export type SceneCompareState = {
  mode: "single" | "dual";
  sceneA: string | null;
  sceneB: string | null;
  metricsA: SceneMetrics | null;
  metricsB: SceneMetrics | null;
};

const RADAR_METRICS = [
  "spacing_uniformity",
  "style_consistency",
  "balance_score",
  "curvature_smoothness",
  "width_compliance",
  "pedestrian_accessibility",
  "safety_score",
  "aesthetics_score",
  "connectivity",
  "overall_quality",
];

/**
 * 创建雷达图
 */
export function createRadarChart(
  canvas: HTMLCanvasElement,
  metrics: SceneMetrics,
  label: string,
  color: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;

  ctx.clearRect(0, 0, width, height);

  // 绘制背景网格
  const levels = 5;
  for (let level = 1; level <= levels; level++) {
    const r = (radius / levels) * level;
    ctx.beginPath();
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;

    for (let i = 0; i <= RADAR_METRICS.length; i++) {
      const angle = (Math.PI * 2 * i) / RADAR_METRICS.length - Math.PI / 2;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
  }

  // 绘制轴线
  RADAR_METRICS.forEach((metric, i) => {
    const angle = (Math.PI * 2 * i) / RADAR_METRICS.length - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // 绘制数据
  const values = RADAR_METRICS.map((metric) => metrics[metric] || 0);
  const maxValue = Math.max(...values, 1);

  ctx.beginPath();
  values.forEach((value, i) => {
    const normalizedValue = value / maxValue;
    const r = radius * normalizedValue;
    const angle = (Math.PI * 2 * i) / RADAR_METRICS.length - Math.PI / 2;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();

  // 填充区域
  ctx.fillStyle = color + "33"; // 20% opacity
  ctx.fill();

  // 描边
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 绘制数据点
  values.forEach((value, i) => {
    const normalizedValue = value / maxValue;
    const r = radius * normalizedValue;
    const angle = (Math.PI * 2 * i) / RADAR_METRICS.length - Math.PI / 2;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // 绘制标签
  RADAR_METRICS.forEach((metric, i) => {
    const angle = (Math.PI * 2 * i) / RADAR_METRICS.length - Math.PI / 2;
    const labelRadius = radius + 20;
    const x = centerX + labelRadius * Math.cos(angle);
    const y = centerY + labelRadius * Math.sin(angle);

    ctx.fillStyle = "#6b7280";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 根据位置调整文本对齐
    if (Math.cos(angle) > 0.1) {
      ctx.textAlign = "left";
    } else if (Math.cos(angle) < -0.1) {
      ctx.textAlign = "right";
    }
    if (Math.sin(angle) < -0.1) {
      ctx.textBaseline = "bottom";
    } else if (Math.sin(angle) > 0.1) {
      ctx.textBaseline = "top";
    }

    ctx.fillText(formatMetricName(metric), x, y);
  });

  // 绘制标题
  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, centerX, 10);
}

function formatMetricName(metric: string): string {
  return metric
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .substring(0, 12);
}

/**
 * 设置画布大小
 */
export function resizeRadarCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.parentElement?.getBoundingClientRect();
  if (!rect) return;

  const size = Math.min(rect.width, rect.height - 30);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
}
