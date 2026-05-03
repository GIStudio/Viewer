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
let currentContainerElement: HTMLElement | null = null;
let currentClickHandler: ((evt: any) => void) | null = null;

function destroyCurrentGraph(): void {
  if (!currentGraph) {
    return;
  }
  const graph = currentGraph;
  currentGraph = null;
  currentContainerElement = null;
  currentClickHandler = null;
  try {
    graph.destroy();
  } catch (error) {
    console.warn('G6 stage tree destroy warning:', error);
  }
}

function resolveContainerElement(container: string | HTMLElement): HTMLElement | null {
  if (typeof container !== 'string') {
    return container;
  }
  if (container.startsWith('#')) {
    return document.getElementById(container.substring(1));
  }
  return document.getElementById(container);
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

    const containerEl = resolveContainerElement(container);
    if (!containerEl) {
      destroyCurrentGraph();
      return null;
    }
    if (currentGraph && currentContainerElement !== containerEl) {
      destroyCurrentGraph();
    }

    // Convert to graph data
    const data = treeToGraphData(treeData);

    const availableWidth = containerEl?.clientWidth || Math.min(760, Math.max(320, window.innerWidth - 96));
    const graphWidth = Math.max(320, Math.floor(availableWidth));
    const graphHeight = Math.min(
      Math.max(420, stages.length * 104 + 140),
      Math.max(420, Math.floor(window.innerHeight * 0.68)),
    );

    containerEl.style.width = '100%';
    containerEl.style.maxWidth = '100%';
    containerEl.style.height = `${graphHeight}px`;
    containerEl.style.maxHeight = '68vh';
    containerEl.style.overflow = 'hidden';

    if (currentGraph) {
      currentGraph.setSize(graphWidth, graphHeight);
      currentGraph.setData(data);
      void currentGraph.render();
      return currentGraph;
    }

    // Create G6 v5 Graph
    currentContainerElement = containerEl;
    currentGraph = new Graph({
      container: typeof container === 'string' 
        ? (container.startsWith('#') ? container.substring(1) : container)
        : (container as any),
      width: graphWidth,
      height: graphHeight,
      autoFit: 'view',
      data,
      layout: {
        type: 'compact-box',
        direction: 'TB',
        getHeight: () => 42,
        getWidth: () => 230,
        getVGap: () => 42,
        getHGap: () => 18,
      },
      node: {
        style: {
          size: (d: any) => d.data?.nodeType === 'artifact' ? [190, 32] : [232, 42],
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
        type: 'cubic-vertical',
        style: {
          stroke: '#94a3b8',
          lineWidth: 2,
        },
      },
    });

    // Render
    void currentGraph.render();

    // Event handling
    currentClickHandler = (evt: any) => {
      const nodeId = evt.target?.id || evt.node?.id;
      if (nodeId && nodeId !== 'root' && onNodeClick) {
        const normalized = String(nodeId).startsWith('artifact:')
          ? String(nodeId).split(':')[1]
          : String(nodeId);
        onNodeClick(normalized);
      }
    };
    currentGraph.on('node:click', currentClickHandler);

    return currentGraph;
  } catch (error) {
    console.error('G6 stage tree render error:', error);
    return null;
  }
}
