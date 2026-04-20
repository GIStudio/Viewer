/**
 * History Trend Chart - 历史趋势图
 * 展示单个指标随时间变化的折线图，支持多指标对比
 */

import { Chart, registerables, ChartConfiguration, ChartData, ChartOptions } from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import type { SceneHistoryEntry } from "./history-scatter-plot";
import { VIEWER_METRICS } from "./history-scatter-plot";

Chart.register(...registerables, annotationPlugin);

const CHART_COLORS = [
  "#1890ff",
  "#52c41a",
  "#faad14",
  "#f5222d",
  "#722ed1",
  "#13c2c2",
  "#eb2f96",
  "#fa8c16",
  "#a0d911",
  "#2f54eb",
];

export class HistoryTrendChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private chart: Chart<"line"> | null = null;
  private scenes: SceneHistoryEntry[] = [];
  private selectedMetrics: string[] = ["spacing_uniformity"];
  private controlsDiv: HTMLDivElement;
  private metricSelect: HTMLSelectElement;
  private addBtn: HTMLButtonElement;
  private statsDiv: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.controlsDiv = document.createElement("div");
    this.statsDiv = document.createElement("div");
    this.metricSelect = document.createElement("select");
    this.addBtn = document.createElement("button");
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
    this.controlsDiv.className = "viewer-history-trend-controls";
    
    const label = document.createElement("label");
    label.textContent = "添加指标 · Add Metric:";
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
      this.metricSelect.appendChild(option);
    });

    this.addBtn.textContent = "+ 添加";
    this.addBtn.className = "viewer-history-trend-add-btn";
    this.addBtn.addEventListener("click", () => {
      const metric = this.metricSelect.value;
      if (!this.selectedMetrics.includes(metric)) {
        this.selectedMetrics.push(metric);
        this.drawChart();
      }
    });

    this.controlsDiv.appendChild(label);
    this.controlsDiv.appendChild(this.metricSelect);
    this.controlsDiv.appendChild(this.addBtn);
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
    this.statsDiv.className = "viewer-history-trend-stats";
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

    // Prepare labels (scene indices or timestamps)
    const labels = this.scenes.map((scene, index) => {
      if (scene.updated_at) {
        const date = new Date(scene.updated_at);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return `#${index + 1}`;
    });

    // Prepare datasets
    const datasets = this.selectedMetrics.map((metric, index) => {
      const values = this.scenes.map((scene) => {
        const summary = scene.summary || {};
        return (summary[metric] as number) || 0;
      });

      return {
        label: this.getMetricLabel(metric),
        data: values,
        borderColor: CHART_COLORS[index % CHART_COLORS.length],
        backgroundColor: CHART_COLORS[index % CHART_COLORS.length] + "20",
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: CHART_COLORS[index % CHART_COLORS.length],
        tension: 0.3,
        fill: false,
      };
    });

    // Create chart
    const data: ChartData<"line"> = {
      labels,
      datasets,
    };

    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: "场景序号 · Scene Index",
            font: { size: 12, weight: "bold" },
          },
          grid: { color: "#f0f0f0" },
        },
        y: {
          title: {
            display: true,
            text: "指标值 · Metric Value",
            font: { size: 12, weight: "bold" },
          },
          grid: { color: "#f0f0f0" },
          beginAtZero: false,
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            font: { size: 11 },
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex ?? 0;
              return `场景 #${idx + 1} · ${labels[idx]}`;
            },
            label: (context) => {
              return `${context.dataset.label}: ${context.parsed.y.toFixed(3)}`;
            },
          },
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
        },
      },
    };

    const config: ChartConfiguration<"line"> = {
      type: "line",
      data,
      options,
    };

    this.chart = new Chart(ctx, config);

    // Update statistics
    this.updateStatistics();
  }

  private updateStatistics() {
    const stats = this.selectedMetrics.map((metric) => {
      const values = this.scenes
        .map((scene) => {
          const summary = scene.summary || {};
          return (summary[metric] as number) || 0;
        })
        .filter((v) => v !== 0);

      if (values.length === 0) {
        return { metric, mean: 0, min: 0, max: 0, trend: "N/A" };
      }

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      // Calculate trend (last 3 vs first 3)
      const first3 = values.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, values.length);
      const last3 = values.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, values.length);
      const trend = last3 > first3 ? "↑" : last3 < first3 ? "↓" : "→";

      return { metric, mean, min, max, trend };
    });

    this.statsDiv.innerHTML = `
      <div class="viewer-history-trend-stats-grid">
        ${stats.map((s) => `
          <div>
            <div class="viewer-history-trend-stat-label">${this.getMetricLabel(s.metric)}</div>
            <div class="viewer-history-trend-stat-row">
              <span>均值: ${s.mean.toFixed(3)}</span>
              <span>范围: ${s.min.toFixed(2)} - ${s.max.toFixed(2)}</span>
              <span>趋势: ${s.trend}</span>
            </div>
          </div>
        `).join("")}
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
