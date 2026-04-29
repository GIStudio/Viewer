/**
 * AntV G6 v5-based visualization for scene generation stage progress tree.
 */

import { Graph, treeToGraphData } from '@antv/g6';

export type StageStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface StageNode {
  id: string;
  label: string;
  status: StageStatus;
  progress: number;
  stepNumber: number;
  nodeType?: 'stage' | 'artifact';
  stageId?: string;
  children?: StageNode[];
}

const STATUS_CONFIG: Record<StageStatus, { color: string; bg: string; icon: string }> = {
  pending: { color: '#94a3b8', bg: '#f1f5f9', icon: '○' },
  active: { color: '#2563eb', bg: '#dbeafe', icon: '◉' },
  completed: { color: '#16a34a', bg: '#dcfce7', icon: '✓' },
  failed: { color: '#dc2626', bg: '#fee2e2', icon: '✗' },
};

let currentGraph: Graph | null = null;

function destroyCurrentGraph(): void {
  if (!currentGraph) {
    return;
  }
  const graph = currentGraph;
  currentGraph = null;
  try {
    graph.destroy();
  } catch (error) {
    console.warn('G6 stage tree destroy warning:', error);
  }
}

/**
 * Render stage progress tree using G6 v5
 */
export function renderStageTree(
  container: string | HTMLElement,
  stages: StageNode[],
  onNodeClick?: (nodeId: string) => void,
): Graph | null {
  try {
    // Destroy previous graph
    destroyCurrentGraph();

    const toGraphNode = (node: StageNode): any => ({
      id: node.id,
      label: node.nodeType === 'artifact'
        ? `产物 · ${node.label}`
        : `${STATUS_CONFIG[node.status].icon} [${node.stepNumber}] ${node.label.split(' · ')[0]} · ${Math.round(node.progress)}%`,
      status: node.status,
      progress: node.progress,
      nodeType: node.nodeType ?? 'stage',
      stageId: node.stageId ?? node.id,
      children: node.children?.map(toGraphNode) ?? [],
    });

    const buildStageChain = (index: number): any | null => {
      const stage = stages[index];
      if (!stage) return null;
      const nextStage = buildStageChain(index + 1);
      const children = [
        ...(nextStage ? [nextStage] : []),
        ...(stage.children ?? []).map(toGraphNode),
      ];
      return {
        ...toGraphNode(stage),
        children,
      };
    };

    // Prepare a growth tree: each depth level is the next generation step,
    // while side leaves show the concrete artifacts/results produced there.
    const firstStage = buildStageChain(0);
    const treeData = {
      id: 'root',
      label: '场景生成主干',
      status: 'completed',
      nodeType: 'root',
      children: firstStage ? [firstStage] : [],
    };

    // Convert to graph data
    const data = treeToGraphData(treeData);

    // Create G6 v5 Graph
    currentGraph = new Graph({
      container: typeof container === 'string' 
        ? (container.startsWith('#') ? container.substring(1) : container)
        : (container as any),
      width: 760,
      height: Math.max(560, stages.length * 86 + 120),
      autoFit: 'view',
      data,
      layout: {
        type: 'compact-box',
        direction: 'LR',
        getHeight: () => 40,
        getWidth: () => 260,
        getVGap: () => 10,
        getHGap: () => 40,
      },
      node: {
        style: {
          size: (d: any) => d.data?.nodeType === 'artifact' ? [220, 32] : [280, 42],
          type: 'rect',
          radius: (d: any) => d.data?.nodeType === 'artifact' ? 6 : 8,
          fill: (d: any) => {
            if (d.data?.nodeType === 'artifact') return '#ffffff';
            const status = d.data?.status as StageStatus | undefined;
            return (status && STATUS_CONFIG[status]?.bg) || '#f8fafc';
          },
          stroke: (d: any) => {
            if (d.data?.nodeType === 'artifact') return '#94a3b8';
            const status = d.data?.status as StageStatus | undefined;
            return (status && STATUS_CONFIG[status]?.color) || '#cbd5e1';
          },
          lineWidth: (d: any) => d.data?.status === 'active' && d.data?.nodeType !== 'artifact' ? 2 : 1,
          lineDash: (d: any) => d.data?.nodeType === 'artifact' ? [4, 3] : undefined,
          labelText: (d: any) => d.data?.label || d.id,
          labelPlacement: 'center',
          labelFontSize: (d: any) => d.data?.nodeType === 'artifact' ? 11 : 12,
          labelFill: (d: any) => d.data?.status === 'active' && d.data?.nodeType !== 'artifact' ? '#2563eb' : '#0f172a',
          labelFontWeight: (d: any) => d.data?.status === 'active' && d.data?.nodeType !== 'artifact' ? 600 : 500,
          cursor: 'pointer',
        },
      },
      edge: {
        type: 'cubic-horizontal',
        style: {
          stroke: '#94a3b8',
          lineWidth: 2,
        },
      },
    });

    // Render
    currentGraph.render();

    // Event handling
    currentGraph.on('node:click', (evt: any) => {
      const nodeId = evt.target?.id || evt.node?.id;
      if (nodeId && nodeId !== 'root' && onNodeClick) {
        const normalized = String(nodeId).startsWith('artifact:')
          ? String(nodeId).split(':')[1]
          : String(nodeId);
        onNodeClick(normalized);
      }
    });

    return currentGraph;
  } catch (error) {
    console.error('G6 stage tree render error:', error);
    return null;
  }
}
