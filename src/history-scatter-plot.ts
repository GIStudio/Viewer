/**
 * History Scatter Plot - Viewer 历史散点图分析
 * 展示最近生成的 N 个场景的指标散点图，支持时间轴分析
 */

import { Chart, registerables, ChartConfiguration } from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";

Chart.register(...registerables, annotationPlugin);

export interface SceneHistoryEntry {
  layout_path: string;
  label: string;
  relative_path?: string;
  updated_at?: string;
  mtime_ms?: number;
  summary?: Record<string, any>;
}

export interface MetricOption {
  value: string;
  label: string;
}

export const VIEWER_METRICS: MetricOption[] = [
  { value: "spacing_uniformity", label: "Spacing Uniformity" },
  { value: "style_consistency", label: "Style Consistency" },
  { value: "balance_score", label: "Balance Score" },
  { value: "dropped_slot_rate", label: "Dropped Slot Rate" },
  { value: "overlap_rate", label: "Overlap Rate" },
  { value: "diversity_ratio", label: "Diversity Ratio" },
  { value: "rule_satisfaction_rate", label: "Rule Satisfaction" },
  { value: "topology_validity", label: "Topology Validity" },
  { value: "cross_section_feasibility", label: "Cross Section Feasibility" },
  { value: "latency_ms_total", label: "Latency (ms)" },
  { value: "instance_count", label: "Instance Count" },
];

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

export class HistoryScatterPlot {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private chart: Chart<"scatter"> | null = null;
  private scenes: SceneHistoryEntry[] = [];
  private xMetric: string = "spacing_uniformity";
  private yMetric: string = "style_consistency";
  private controlsDiv: HTMLDivElement;
  private xSelect: HTMLSelectElement;
  private ySelect: HTMLSelectElement;
  private statsDiv: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.controlsDiv = document.createElement("div");
    this.statsDiv = document.createElement("div");
    this.xSelect = document.createElement("select");
    this.ySelect = document.createElement("select");
  }

  async init(scenes: SceneHistoryEntry[]) {
    this.scenes = scenes;
    this.render();
    this.setupControls();
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

    // Title
    const title = document.createElement("h3");
    title.textContent = "📊 Scene History Analysis";
    title.style.cssText = "margin: 0 0 16px 0; font-size: 18px;";
    this.container.appendChild(title);

    // Controls
    this.controlsDiv.style.cssText = `
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      align-items: center;
      flex-wrap: wrap;
    `;

    const xLabel = this.createLabel("X Axis:");
    this.populateSelect(this.xSelect, this.xMetric);
    this.xSelect.addEventListener("change", () => {
      this.xMetric = this.xSelect.value;
      this.drawChart();
    });

    const yLabel = this.createLabel("Y Axis:");
    this.populateSelect(this.ySelect, this.yMetric);
    this.ySelect.addEventListener("change", () => {
      this.yMetric = this.ySelect.value;
      this.drawChart();
    });

    this.controlsDiv.appendChild(xLabel);
    this.controlsDiv.appendChild(this.xSelect);
    this.controlsDiv.appendChild(yLabel);
    this.controlsDiv.appendChild(this.ySelect);
    this.container.appendChild(this.controlsDiv);

    // Chart container
    const chartContainer = document.createElement("div");
    chartContainer.style.cssText = `
      position: relative;
      height: 400px;
      margin-bottom: 16px;
    `;
    this.canvas = document.createElement("canvas");
    chartContainer.appendChild(this.canvas);
    this.container.appendChild(chartContainer);

    // Statistics panel
    this.statsDiv.style.cssText = `
      padding: 12px;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.6;
    `;
    this.container.appendChild(this.statsDiv);
  }

  private createLabel(text: string): HTMLLabelElement {
    const label = document.createElement("label");
    label.textContent = text;
    label.style.cssText = "font-weight: 500; font-size: 13px;";
    return label;
  }

  private populateSelect(select: HTMLSelectElement, currentValue: string) {
    select.innerHTML = "";
    select.style.cssText = `
      padding: 4px 8px;
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      font-size: 13px;
    `;

    VIEWER_METRICS.forEach((metric) => {
      const option = document.createElement("option");
      option.value = metric.value;
      option.textContent = metric.label;
      if (metric.value === currentValue) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  private setupControls() {
    // Additional controls can be added here if needed
  }

  private drawChart() {
    if (!this.canvas || this.scenes.length === 0) return;

    // Destroy old chart
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    // Prepare data points
    const points = this.scenes
      .map((scene, index) => {
        const summary = scene.summary || {};
        const xValue = (summary[this.xMetric] as number) || 0;
        const yValue = (summary[this.yMetric] as number) || 0;
        return {
          x: xValue,
          y: yValue,
          sceneIndex: index,
          label: scene.label,
          color: CHART_COLORS[index % CHART_COLORS.length],
          timestamp: scene.updated_at
            ? new Date(scene.updated_at).toLocaleTimeString()
            : `Scene ${index}`,
        };
      })
      .filter((p) => p.x !== 0 || p.y !== 0); // Filter out empty data

    if (points.length < 2) {
      this.statsDiv.innerHTML =
        "<p style='color: #999;'>Not enough data points to display scatter plot (need at least 2 scenes with metrics)</p>";
      return;
    }

    // Calculate statistics
    const stats = this.calculateStatistics(points);

    // Create chart
    const config: ChartConfiguration<"scatter"> = {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Scenes",
            data: points.map((p) => ({ x: p.x, y: p.y })),
            backgroundColor: points.map((p) => p.color),
            borderColor: points.map((p) => p.color),
            borderWidth: 2,
            pointRadius: 8,
            pointHoverRadius: 12,
            pointHoverBorderWidth: 3,
            pointHoverBackgroundColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: this.getMetricLabel(this.xMetric),
              font: { size: 13, weight: "bold" },
            },
            grid: { color: "#f0f0f0" },
          },
          y: {
            title: {
              display: true,
              text: this.getMetricLabel(this.yMetric),
              font: { size: 13, weight: "bold" },
            },
            grid: { color: "#f0f0f0" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const index = context.dataIndex;
                const point = points[index];
                if (point) {
                  return [
                    `${point.label}`,
                    `X: ${point.x.toFixed(3)}`,
                    `Y: ${point.y.toFixed(3)}`,
                    `Time: ${point.timestamp}`,
                  ];
                }
                return "";
              },
            },
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            padding: 12,
            titleFont: { size: 13, weight: "bold" },
            bodyFont: { size: 12 },
          },
          annotation: {
            annotations: {
              trendLine: stats.slope !== undefined
                ? {
                    type: "line" as const,
                    xMin: stats.xMin,
                    xMax: stats.xMax,
                    yMin: stats.slope * stats.xMin + stats.intercept,
                    yMax: stats.slope * stats.xMax + stats.intercept,
                    borderColor: "rgb(255, 99, 132)",
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                      display: true,
                      content: `R² = ${stats.r2?.toFixed(3) || "N/A"}`,
                      position: "start",
                      backgroundColor: "rgba(255, 99, 132, 0.8)",
                      font: { size: 11 },
                    },
                  }
                : undefined,
            },
          },
        },
        onClick: (_event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const point = points[index];
            console.log("Clicked scene:", point);
            // Could trigger scene loading here
          }
        },
      },
    };

    this.chart = new Chart(ctx, config);

    // Update statistics panel
    this.updateStatisticsPanel(stats, points.length);
  }

  private calculateStatistics(
    points: Array<{ x: number; y: number }>
  ): {
    correlation: number;
    slope: number;
    intercept: number;
    r2: number;
    xMin: number;
    xMax: number;
  } {
    const n = points.length;
    if (n < 2) {
      return {
        correlation: 0,
        slope: 0,
        intercept: 0,
        r2: 0,
        xMin: 0,
        xMax: 0,
      };
    }

    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0,
      sumY2 = 0;

    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
      sumY2 += p.y * p.y;
    }

    const denominator = n * sumX2 - sumX * sumX;
    const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
    const intercept = (sumY - slope * sumX) / n;

    const numerator = n * sumXY - sumX * sumY;
    const denomCorr = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );
    const correlation = denomCorr !== 0 ? numerator / denomCorr : 0;
    const r2 = correlation * correlation;

    return {
      correlation,
      slope,
      intercept,
      r2,
      xMin: Math.min(...points.map((p) => p.x)),
      xMax: Math.max(...points.map((p) => p.x)),
    };
  }

  private updateStatisticsPanel(
    stats: { correlation: number; slope: number; intercept: number; r2: number },
    count: number
  ) {
    const correlationStrength =
      Math.abs(stats.correlation) > 0.7
        ? "<span style='color: #52c41a;'>Strong</span>"
        : "<span style='color: #faad14;'>Weak</span>";

    this.statsDiv.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
        <div>
          <div style="color: #666; font-size: 12px;">📈 Correlation (r)</div>
          <div style="font-size: 18px; font-weight: 500; margin-top: 4px;">
            ${stats.correlation.toFixed(3)} (${correlationStrength})
          </div>
        </div>
        <div>
          <div style="color: #666; font-size: 12px;">📊 R-squared (R²)</div>
          <div style="font-size: 18px; font-weight: 500; margin-top: 4px;">
            ${stats.r2.toFixed(3)}
          </div>
        </div>
        <div>
          <div style="color: #666; font-size: 12px;">📉 Slope</div>
          <div style="font-size: 18px; font-weight: 500; margin-top: 4px;">
            ${stats.slope.toFixed(3)}
          </div>
        </div>
        <div>
          <div style="color: #666; font-size: 12px;">🔢 Scenes</div>
          <div style="font-size: 18px; font-weight: 500; margin-top: 4px;">
            ${count}
          </div>
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
