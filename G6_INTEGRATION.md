# AntV G6 可视化集成说明

## 已完成的工作

### 1. G6 可视化模块创建

**文件**: `web/viewer/src/g6-visualization.ts`

包含两个核心函数：

#### `renderStageTree()` - 场景生长树
- 使用 G6 TreeGraph 展示 10 个生成阶段
- 节点颜色根据状态变化：
  - ⚪ Pending (灰色)
  - 🔵 Active (蓝色，高亮)
  - 🟢 Completed (绿色)
  - 🔴 Failed (红色)
- 支持点击节点打开算法详情
- 支持缩放、拖拽画布

#### `renderBranchTree()` - 分支运行树
- 展示 Branch Run 的优化树
- 显示节点深度、排名、分数
- 最佳节点标记 ⭐ Best
- 选中节点蓝色边框
- 失败节点红色背景

### 2. 依赖添加

**文件**: `web/viewer/package.json`

```json
{
  "dependencies": {
    "@antv/g6": "^4.8.24"
  }
}
```

## 下一步：在 app.ts 中集成

### 需要修改的位置

在 `web/viewer/src/app.ts` 中：

1. **导入 G6 模块**（在文件顶部添加）：
```typescript
import { renderStageTree, renderBranchTree, destroyGraph, StageNode } from './g6-visualization';
```

2. **替换 `renderDesignStageTree()` 函数**：
   - 当前的 HTML 版本函数保留作为 fallback
   - 新增 G6 版本调用

3. **在 `renderDesignWorkspace()` 中**：
```typescript
// 创建 G6 容器
const g6Container = document.createElement('div');
g6Container.id = 'viewer-design-g6-tree';
g6Container.style.width = '100%';
g6Container.style.height = '500px';

// 准备阶段数据
const stageNodes: StageNode[] = GENERATION_STEPS.map((step, index) => ({
  id: step.key,
  label: step.label,
  shortLabel: step.shortLabel,
  status: getStageStatus(payload, step.key), // 需要实现此函数
  progress: getStageProgress(payload, step.key),
  stepNumber: index + 1,
}));

// 渲染 G6 树
const g6Graph = renderStageTree(g6Container, stageNodes, (nodeId) => {
  openDesignStageDiagnostic(nodeId);
});

// 添加到 workspace
designWorkspaceEl.appendChild(g6Container);
```

### 示例代码片段

```typescript
function getStageStatus(payload: SceneJobStatusPayload, stageKey: string): 'pending' | 'active' | 'completed' | 'failed' {
  const currentStage = describeDesignJobProgress(payload).stage;
  const currentIndex = GENERATION_STEPS.findIndex(s => s.key === currentStage);
  const stepIndex = GENERATION_STEPS.findIndex(s => s.key === stageKey);
  
  if (payload.status === 'failed' && stepIndex === currentIndex) return 'failed';
  if (stepIndex < currentIndex) return 'completed';
  if (stepIndex === currentIndex) return 'active';
  return 'pending';
}
```

## 安装 G6 依赖

由于网络问题，npm install 可能超时。请运行：

```bash
cd web/viewer
npm install
```

如果仍然超时，可以尝试：

```bash
npm install @antv/g6@4.8.24 --registry=https://registry.npmmirror.com
```

## G6 功能特性

### 已实现
- ✅ TreeGraph 树形布局（compactBox）
- ✅ 节点自定义样式（颜色、边框、图标）
- ✅ 点击事件处理
- ✅ 缩放、拖拽画布
- ✅ 自适应视图（fitView）

### 可扩展
- 🔄 添加工具提示（tooltip）
- 🔄 添加节点悬浮效果
- 🔄 添加动画过渡
- 🔄 导出为图片
- 🔄 添加图例

## 参考文档

- G6 官方文档：https://g6.antv.antgroup.com
- TreeGraph：https://g6.antv.antgroup.com/manual/advanced/plot-tree-graph
- 自定义节点：https://g6.antv.antgroup.com/manual/advanced/custom-item
