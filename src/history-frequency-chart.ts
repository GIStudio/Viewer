/**
 * History Frequency Chart - 历史频次图
 * 展示单个变量在不同取值范围内的频次分布（柱状图）
 */

import { Chart, registerables, ChartConfiguration, ChartData, ChartOptions } from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import type { SceneHistoryEntry } from "./history-scatter-plot";
import { VIEWER_METRICS } from "./history-scatter-plot";

Chart.register(...registerables, annotationPlugin);

export class HistoryFrequencyChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private chart: Chart<"bar"> | null = null;
  private scenes: SceneHistoryEntry[] = [];
  private selectedMetric: string = "spacing_uniformity";
  private controlsDiv: HTMLDivElement;
  private metricSelect: HTMLSelectElement;
  private statsDiv: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.controlsDiv = document.createElement("div");
    this.statsDiv = document.createElement("div");
    this.metricSelect = document.createElement("select");
  }

  async init(scenes: SceneHistoryEntry[]) {
    this.scenes = scenes;
    this.render();
    this.drawChart();
  }

  private render() {
    this.container.innerHTML = "";
    this.container.style.cssText = `
      padding: 16px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    // Controls
    this.controlsDiv.className = "viewer-history-freq-controls";
    
    const label = document.createElement("label");
    label.textContent = "选择指标 · Select Metric:";
    label.style.cssText = "font-weight: 500; font-size: 13px; margin-right: 8px;";
    
    this.metricSelect.style.cssText = `
      padding: 6px 10px;
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      font-size: 13px;
      min-width: 200px;
    `;

    VIEWER_METRICS.forEach((metric) => {
      const option = document.createElement("option");
      option.value = metric.value;
      option.textContent = metric.label;
      if (metric.value === this.selectedMetric) {
        option.selected = true;
      }
      this.metricSelect.appendChild(option);
    });

    this.metricSelect.addEventListener("change", () => {
      this.selectedMetric = this.metricSelect.value;
      this.drawChart();
    });

    this.controlsDiv.appendChild(label);
    this.controlsDiv.appendChild(this.metricSelect);
    this.container.appendChild(this.controlsDiv);

    // Chart container
    const chartContainer = document.createElement("div");
    chartContainer.style.cssText = `
      position: relative;
      height: 350px;
      margin: 16px 0;
    `;
    this.canvas = document.createElement("canvas");
    chartContainer.appendChild(this.canvas);
    this.container.appendChild(chartContainer);

    // Statistics panel
    this.statsDiv.className = "viewer-history-freq-stats";
    this.container.appendChild(this.statsDiv);
  }

  private drawChart() {
    if (!this.canvas || this.scenes.length === 0) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    // Extract metric values
    const values = this.scenes
      .map((scene) => {
        const summary = scene.summary || {};
        return (summary[this.selectedMetric] as number) || 0;
      })
      .filter((v) => v !== 0);

    if (values.length < 2) {
      this.statsDiv.innerHTML = `<p style="color: #999; text-align: center;">数据不足，至少需要 2 个非零场景</p>`;
      return;
    }

    // Calculate histogram bins
    const { labels, counts, binWidth, min, max } = this.calculateHistogram(values);

    // Create chart
    const data: ChartData<"bar"> = {
      labels: labels.map((l) => l.toFixed(2)),
      datasets: [
        {
          label: this.getMetricLabel(this.selectedMetric),
          data: counts,
          backgroundColor: "rgba(59, 130, 246, 0.6)",
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };

    const options: ChartOptions<"bar"> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: `${this.getMetricLabel(this.selectedMetric)} (bin width: ${binWidth.toFixed(3)})`,
            font: { size: 12, weight: "bold" },
          },
          grid: { color: "#f0f0f0" },
        },
        y: {
          title: {
            display: true,
            text: "频次 · Frequency",
            font: { size: 12, weight: "bold" },
          },
          grid: { color: "#f0f0f0" },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex ?? 0;
              return `区间: ${labels[idx]}`;
            },
            label: (context) => {
              const idx = context.dataIndex;
              return [
                `频次: ${counts[idx]}`,
                `占比: ${((counts[idx] / values.length) * 100).toFixed(1)}%`,
                `范围: ${min.toFixed(3)} - ${max.toFixed(3)}`,
              ];
            },
          },
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
        },
      },
    };

    const config: ChartConfiguration<"bar"> = {
      type: "bar",
      data,
      options,
    };

    this.chart = new Chart(ctx, config);

    // Update statistics
    this.updateStatistics(values, labels, counts);
  }

  private calculateHistogram(values: number[]): {
    labels: number[];
    counts: number[];
    binWidth: number;
    min: number;
    max: number;
  } {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    // Use Sturges' rule for number of bins: k = ceil(log2(n) + 1)
    const n = values.length;
    const numBins = Math.max(3, Math.ceil(Math.log2(n) + 1));
    const binWidth = range > 0 ? range / numBins : 0.1;

    const labels: number[] = [];
    const counts: number[] = new Array(numBins).fill(0);

    for (let i = 0; i < numBins; i++) {
      labels.push(min + i * binWidth);
    }

    for (const v of values) {
      let binIndex = Math.floor((v - min) / binWidth);
      if (binIndex >= numBins) binIndex = numBins - 1;
      if (binIndex < 0) binIndex = 0;
      counts[binIndex]++;
    }

    return { labels, counts, binWidth, min, max };
  }

  private updateStatistics(values: number[], labels: number[], counts: number[]) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const median = [...values].sort((a, b) => a - b)[Math.floor(n / 2)];
    const maxCount = Math.max(...counts);
    const modeIndex = counts.indexOf(maxCount);
    const mode = labels[modeIndex];

    this.statsDiv.innerHTML = `
      <div class="viewer-history-freq-stats-grid">
        <div>
          <div class="viewer-history-freq-stat-label">📊 样本数 · Samples</div>
          <div class="viewer-history-freq-stat-value">${n}</div>
        </div>
        <div>
          <div class="viewer-history-freq-stat-label">📈 均值 · Mean</div>
          <div class="viewer-history-freq-stat-value">${mean.toFixed(3)}</div>
        </div>
        <div>
          <div class="viewer-history-freq-stat-label">📉 中位数 · Median</div>
          <div class="viewer-history-freq-stat-value">${median.toFixed(3)}</div>
        </div>
        <div>
          <div class="viewer-history-freq-stat-label">📏 标准差 · Std Dev</div>
          <div class="viewer-history-freq-stat-value">${stdDev.toFixed(3)}</div>
        </div>
        <div>
          <div class="viewer-history-freq-stat-label">🎯 众数区间 · Mode</div>
          <div class="viewer-history-freq-stat-value">${mode.toFixed(3)}</div>
        </div>
        <div>
          <div class="viewer-history-freq-stat-label">📐 范围 · Range</div>
          <div class="viewer-history-freq-stat-value">${values[0]?.toFixed(3)} - ${values[n-1]?.toFixed(3)}</div>
        </div>
      </div>
    `;
  }

  private getMetricLabel(metric: string): string {
    const found = VIEWER_METRICS.find((m) => m.value === metric);
    return found?.label || metric;
  }

  updateScenes(scenes: SceneHistoryEntry[]) {
    this.scenes = scenes;
    this.drawChart();
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
