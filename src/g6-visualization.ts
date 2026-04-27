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
}

const STATUS_CONFIG: Record<StageStatus, { color: string; bg: string; icon: string }> = {
  pending: { color: '#94a3b8', bg: '#f1f5f9', icon: '○' },
  active: { color: '#2563eb', bg: '#dbeafe', icon: '◉' },
  completed: { color: '#16a34a', bg: '#dcfce7', icon: '✓' },
  failed: { color: '#dc2626', bg: '#fee2e2', icon: '✗' },
};

let currentGraph: Graph | null = null;

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
    if (currentGraph) {
      currentGraph.destroy();
      currentGraph = null;
    }

    // Prepare tree data
    const treeData = {
      id: 'root',
      label: '场景生成',
      children: stages.map((stage) => ({
        id: stage.id,
        label: `${STATUS_CONFIG[stage.status].icon} [${stage.stepNumber}] ${stage.label.split(' · ')[0]} · ${stage.progress}%`,
        status: stage.status,
        progress: stage.progress,
      })),
    };

    // Convert to graph data
    const data = treeToGraphData(treeData);

    // Create G6 v5 Graph
    currentGraph = new Graph({
      container: typeof container === 'string' 
        ? (container.startsWith('#') ? container.substring(1) : container)
        : (container as any),
      width: 600,
      height: Math.max(450, stages.length * 50 + 80),
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
          size: [260, 40],
          type: 'rect',
          radius: 8,
          fill: (d: any) => {
            const status = d.data?.status as StageStatus | undefined;
            return (status && STATUS_CONFIG[status]?.bg) || '#f8fafc';
          },
          stroke: (d: any) => {
            const status = d.data?.status as StageStatus | undefined;
            return (status && STATUS_CONFIG[status]?.color) || '#cbd5e1';
          },
          lineWidth: (d: any) => d.data?.status === 'active' ? 2 : 1,
          labelText: (d: any) => d.data?.label || d.id,
          labelPlacement: 'center',
          labelFontSize: 12,
          labelFill: (d: any) => d.data?.status === 'active' ? '#2563eb' : '#0f172a',
          labelFontWeight: (d: any) => d.data?.status === 'active' ? 600 : 500,
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
        onNodeClick(nodeId);
      }
    });

    return currentGraph;
  } catch (error) {
    console.error('G6 stage tree render error:', error);
    return null;
  }
}
