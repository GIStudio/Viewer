/**
 * Three-System Score Panel - 三系统评分面板
 * 展示 Walkability、Safety、Beauty 三大评分系统及其子分数
 */

import { Chart, registerables, ChartConfiguration, ChartData, ChartOptions } from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import type { SceneHistoryEntry } from "./history-scatter-plot";

Chart.register(...registerables, annotationPlugin);

// 评分体系定义
interface SubScoreDef {
  key: string;
  label: string;
  labelZh: string;
  color: string;
}

interface ScoreSystemDef {
  key: string;
  label: string;
  labelZh: string;
  color: string;
  icon: string;
  weight: number;
  subScores: SubScoreDef[];
}

const SCORE_SYSTEMS: ScoreSystemDef[] = [
  {
    key: "walkability",
    label: "Walkability",
    labelZh: "步行性",
    color: "#1890ff",
    icon: "🚶",
    weight: 0.45,
    subScores: [
      { key: "protection", label: "Protection", labelZh: "保护性", color: "#1890ff" },
      { key: "comfort", label: "Comfort", labelZh: "舒适性", color: "#52c41a" },
      { key: "delight", label: "Delight", labelZh: "愉悦性", color: "#faad14" },
    ],
  },
  {
    key: "safety",
    label: "Safety",
    labelZh: "安全性",
    color: "#f5222d",
    icon: "🛡️",
    weight: 0.35,
    subScores: [
      { key: "safety_lighting", label: "Lighting", labelZh: "照明", color: "#f5222d" },
      { key: "safety_visibility", label: "Visibility", labelZh: "可见性", color: "#722ed1" },
      { key: "safety_protection", label: "Protection", labelZh: "防护", color: "#13c2c2" },
      { key: "safety_activation", label: "Activation", labelZh: "活跃度", color: "#eb2f96" },
    ],
  },
  {
    key: "beauty",
    label: "Beauty",
    labelZh: "美观性",
    color: "#13c2c2",
    icon: "🎨",
    weight: 0.20,
    subScores: [
      { key: "beauty_planting", label: "Planting", labelZh: "植物配置", color: "#52c41a" },
      { key: "beauty_furniture", label: "Furniture", labelZh: "街道家具", color: "#fa8c16" },
      { key: "beauty_space", label: "Space Richness", labelZh: "空间丰富度", color: "#a0d911" },
    ],
  },
];

const SUB_SCORE_KEYS: string[] = [
  "protection",
  "comfort",
  "delight",
  "safety_lighting",
  "safety_visibility",
  "safety_protection",
  "safety_activation",
  "beauty_planting",
  "beauty_furniture",
  "beauty_space",
];

export class ThreeSystemScorePanel {
  private container: HTMLElement;
  private scenes: SceneHistoryEntry[] = [];
  private chart: Chart<"radar"> | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private scoresDiv: HTMLDivElement | null = null;
  private fetchBtn: HTMLButtonElement | null = null;
  private isFetching = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(scenes: SceneHistoryEntry[]) {
    this.scenes = scenes;
    this.render();
    this.drawChart();
  }

  private async fetchScores() {
    if (this.isFetching) return;
    if (!this.fetchBtn || this.scenes.length === 0) return;

    this.isFetching = true;
    this.fetchBtn.disabled = true;
    this.fetchBtn.textContent = "⏳ 正在获取评分...";

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < this.scenes.length; i++) {
      const scene = this.scenes[i];
      const summary = scene.summary || {};

      // 如果已经有评分，跳过
      if (summary.walkability && summary.safety && summary.beauty) {
        successCount++;
        continue;
      }

      try {
        const evalResponse = await fetch("./api/design/evaluate/unified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout_path: scene.layout_path }),
        });

        if (evalResponse.ok) {
          const evalResult = await evalResponse.json();
          // 将评分合并到 summary 中
          Object.assign(summary, {
            walkability: evalResult.walkability ?? 0,
            safety: evalResult.safety ?? 0,
            beauty: evalResult.beauty ?? 0,
            overall: evalResult.overall ?? 0,
            // 添加子分数
            protection: evalResult.indicators?.protection ?? 0,
            comfort: evalResult.indicators?.comfort ?? 0,
            delight: evalResult.indicators?.delight ?? 0,
            safety_lighting: evalResult.indicators?.safety_lighting ?? 0,
            safety_visibility: evalResult.indicators?.safety_visibility ?? 0,
            safety_protection: evalResult.indicators?.safety_protection ?? 0,
            safety_activation: evalResult.indicators?.safety_activation ?? 0,
            beauty_planting: evalResult.indicators?.beauty_planting ?? 0,
            beauty_furniture: evalResult.indicators?.beauty_furniture ?? 0,
            beauty_space: evalResult.indicators?.beauty_space ?? 0,
          });
          successCount++;
        } else {
          failCount++;
          errors.push(`${scene.label}: API 返回 ${evalResponse.status}`);
        }
      } catch (err) {
        failCount++;
        errors.push(`${scene.label}: ${err instanceof Error ? err.message : "未知错误"}`);
      }

      // 更新按钮进度
      this.fetchBtn.textContent = `⏳ 获取中... ${i + 1}/${this.scenes.length}`;
    }

    // 恢复按钮状态
    this.isFetching = false;
    this.fetchBtn.disabled = false;
    this.fetchBtn.textContent = "🔄 获取评分 · Fetch Scores";

    // 显示结果提示
    if (failCount > 0) {
      const errorMsg = `评分获取完成，但有 ${failCount} 个场景失败：\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? "\n..." : ""}`;
      alert(errorMsg);
    } else {
      alert(`✅ 评分获取完成！成功 ${successCount} 个场景。`);
    }

    // 重新绘制图表
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

    // Fetch button
    const controlsDiv = document.createElement("div");
    controlsDiv.className = "viewer-three-system-controls";
    
    this.fetchBtn = document.createElement("button");
    this.fetchBtn.className = "viewer-three-system-fetch-btn";
    this.fetchBtn.textContent = "🔄 获取评分 · Fetch Scores";
    this.fetchBtn.addEventListener("click", () => this.fetchScores());
    controlsDiv.appendChild(this.fetchBtn);

    const hintDiv = document.createElement("div");
    hintDiv.className = "viewer-three-system-hint";
    hintDiv.textContent = "点击按钮调用评估 API 计算所有场景的评分";
    controlsDiv.appendChild(hintDiv);
    
    this.container.appendChild(controlsDiv);

    // Main scores display
    this.scoresDiv = document.createElement("div");
    this.scoresDiv.className = "viewer-three-system-scores";
    this.container.appendChild(this.scoresDiv);

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

    // Sub-scores detail
    const subScoresDiv = document.createElement("div");
    subScoresDiv.className = "viewer-three-system-sub-scores";
    this.container.appendChild(subScoresDiv);
  }

  private drawChart() {
    if (!this.canvas || this.scenes.length === 0) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    // Calculate average scores
    const avgScores = this.calculateAverageScores();

    // Prepare radar chart data
    const labels = [
      "步行性\nWalkability",
      "安全性\nSafety",
      "美观性\nBeauty",
    ];

    const data: ChartData<"radar"> = {
      labels,
      datasets: [
        {
          label: "平均评分 · Average",
          data: [
            avgScores.walkability,
            avgScores.safety,
            avgScores.beauty,
          ],
          backgroundColor: "rgba(59, 130, 246, 0.2)",
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 2,
          pointBackgroundColor: ["#1890ff", "#f5222d", "#13c2c2"],
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    };

    const options: ChartOptions<"radar"> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 20,
            font: { size: 10 },
          },
          grid: { color: "#f0f0f0" },
          angleLines: { color: "#e0e0e0" },
          pointLabels: {
            font: { size: 12, weight: "bold" },
            color: "#1e293b",
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: { font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const system = SCORE_SYSTEMS[context.dataIndex];
              return `${system.labelZh} ${system.label}: ${context.parsed.r.toFixed(1)}`;
            },
          },
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          padding: 12,
        },
      },
    };

    const config: ChartConfiguration<"radar"> = {
      type: "radar",
      data,
      options,
    };

    this.chart = new Chart(ctx, config);

    // Render main scores and sub-scores
    this.renderMainScores(avgScores);
    this.renderSubScores(avgScores);
  }

  private calculateAverageScores() {
    const walkabilityScores: number[] = [];
    const safetyScores: number[] = [];
    const beautyScores: number[] = [];

    this.scenes.forEach((scene) => {
      const summary = scene.summary || {};
      if (summary.walkability !== undefined) {
        walkabilityScores.push(summary.walkability as number);
      }
      if (summary.safety !== undefined) {
        safetyScores.push(summary.safety as number);
      }
      if (summary.beauty !== undefined) {
        beautyScores.push(summary.beauty as number);
      }
    });

    return {
      walkability: walkabilityScores.length > 0
        ? walkabilityScores.reduce((a, b) => a + b, 0) / walkabilityScores.length
        : 0,
      safety: safetyScores.length > 0
        ? safetyScores.reduce((a, b) => a + b, 0) / safetyScores.length
        : 0,
      beauty: beautyScores.length > 0
        ? beautyScores.reduce((a, b) => a + b, 0) / beautyScores.length
        : 0,
    };
  }

  private calculateAverageSubScores() {
    const subScoreTotals: Record<string, number[]> = {};
    SUB_SCORE_KEYS.forEach((key) => {
      subScoreTotals[key] = [];
    });

    this.scenes.forEach((scene) => {
      const summary = scene.summary || {};
      SUB_SCORE_KEYS.forEach((key) => {
        if (summary[key] !== undefined) {
          subScoreTotals[key].push(summary[key] as number);
        }
      });
    });

    const averages: Record<string, number> = {};
    SUB_SCORE_KEYS.forEach((key) => {
      const values = subScoreTotals[key];
      averages[key] = values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;
    });

    return averages;
  }

  private renderMainScores(avgScores: { walkability: number; safety: number; beauty: number }) {
    const scoresDiv = this.container.querySelector<HTMLElement>(".viewer-three-system-scores")!;
    
    const overall = avgScores.walkability * 0.45 + avgScores.safety * 0.35 + avgScores.beauty * 0.20;

    scoresDiv.innerHTML = `
      <div class="viewer-three-system-main-scores">
        <div class="viewer-three-system-overall">
          <div class="viewer-three-system-overall-label">综合评分 · Overall Score</div>
          <div class="viewer-three-system-overall-value" style="color: ${this.getScoreColor(overall)}">${overall.toFixed(1)}</div>
        </div>
        ${SCORE_SYSTEMS.map((system) => {
          const value = avgScores[system.key as keyof typeof avgScores];
          return `
            <div class="viewer-three-system-score-card">
              <div class="viewer-three-system-score-icon">${system.icon}</div>
              <div class="viewer-three-system-score-content">
                <div class="viewer-three-system-score-label">${system.labelZh} · ${system.label}</div>
                <div class="viewer-three-system-score-value" style="color: ${system.color}">${value.toFixed(1)}</div>
                <div class="viewer-three-system-score-bar">
                  <div class="viewer-three-system-score-bar-fill" style="width: ${value}%; background: ${system.color}"></div>
                </div>
                <div class="viewer-three-system-score-weight">权重 · Weight: ${(system.weight * 100).toFixed(0)}%</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  private renderSubScores(avgScores: { walkability: number; safety: number; beauty: number }) {
    const subScoresDiv = this.container.querySelector<HTMLElement>(".viewer-three-system-sub-scores")!;
    const avgSubScores = this.calculateAverageSubScores();

    subScoresDiv.innerHTML = `
      <div class="viewer-three-system-sub-scores-header">子分数详情 · Sub-Score Details</div>
      ${SCORE_SYSTEMS.map((system) => `
        <div class="viewer-three-system-sub-group">
          <div class="viewer-three-system-sub-group-title" style="color: ${system.color}">
            ${system.icon} ${system.labelZh} · ${system.label}
          </div>
          <div class="viewer-three-system-sub-scores-grid">
            ${system.subScores.map((sub) => {
              const value = avgSubScores[sub.key] || 0;
              return `
                <div class="viewer-three-system-sub-item">
                  <div class="viewer-three-system-sub-label">${sub.labelZh} · ${sub.label}</div>
                  <div class="viewer-three-system-sub-value" style="color: ${sub.color}">${value.toFixed(1)}</div>
                  <div class="viewer-three-system-sub-bar">
                    <div class="viewer-three-system-sub-bar-fill" style="width: ${value}%; background: ${sub.color}"></div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `).join("")}
    `;
  }

  private getScoreColor(score: number): string {
    if (score >= 80) return "#52c41a";
    if (score >= 60) return "#1890ff";
    if (score >= 40) return "#faad14";
    return "#f5222d";
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
