/**
 * AntV G6-based visualization for scene generation stage tree and branch runs.
 * 
 * Provides interactive tree/graph visualization for:
 * 1. Stage Growth Tree - shows 10 generation stages with status
 * 2. Branch Run Tree - shows optimization tree with scores
 */

import G6 from '@antv/g6';

export type StageNodeStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface StageNode {
  id: string;
  label: string;
  shortLabel: string;
  status: StageNodeStatus;
  progress: number;
  stepNumber: number;
}

export interface BranchNode {
  id: string;
  label: string;
  depth: number;
  rank: number;
  status: string;
  score: number | null;
  parentId: string | null;
}

const STATUS_COLORS: Record<StageNodeStatus, string> = {
  pending: '#94a3b8',
  active: '#2563eb',
  completed: '#16a34a',
  failed: '#dc2626',
};

const STATUS_ICONS: Record<StageNodeStatus, string> = {
  pending: '○',
  active: '◉',
  completed: '✓',
  failed: '✗',
};

/**
 * Render stage generation tree using G6
 */
export function renderStageTree(
  container: HTMLElement,
  stages: StageNode[],
  onNodeClick?: (nodeId: string) => void,
): G6.TreeGraph {
  const width = container.clientWidth || 600;
  const height = Math.max(400, stages.length * 55);

  const graph = new G6.TreeGraph({
    container,
    width,
    height,
    modes: {
      default: ['drag-canvas', 'zoom-canvas'],
    },
    defaultNode: {
      size: [280, 48],
      type: 'rect',
      style: {
        radius: 8,
        fill: '#f8fafc',
        stroke: '#cbd5e1',
        lineWidth: 1,
        cursor: 'pointer',
      },
      labelCfg: {
        style: {
          fill: '#0f172a',
          fontSize: 13,
          fontWeight: 500,
        },
      },
    },
    defaultEdge: {
      type: 'cubic-vertical',
      style: {
        stroke: '#94a3b8',
        lineWidth: 2,
        endArrow: true,
      },
    },
    layout: {
      type: 'compactBox',
      direction: 'TB',
      getId: (d: any) => d.id,
      getHeight: () => 48,
      getWidth: () => 280,
      getVGap: () => 12,
      getHGap: () => 20,
    },
  });

  // Custom node rendering
  graph.node((node: any) => {
    const status = node.status as StageNodeStatus;
    const color = STATUS_COLORS[status];
    const icon = STATUS_ICONS[status];
    
    return {
      label: `${icon} ${node.label}`,
      style: {
        stroke: color,
        lineWidth: status === 'active' ? 2 : 1,
        fill: status === 'active' ? '#eff6ff' : '#f8fafc',
      },
      labelCfg: {
        style: {
          fill: status === 'active' ? '#2563eb' : '#0f172a',
          fontSize: 13,
          fontWeight: status === 'active' ? 600 : 500,
        },
        position: 'center',
      },
    };
  });

  // Prepare data
  const data = {
    id: 'root',
    label: 'Scene Generation',
    children: stages.map((stage) => ({
      id: stage.id,
      label: `[${stage.stepNumber}] ${stage.label} · ${stage.progress}%`,
      shortLabel: stage.shortLabel,
      status: stage.status,
      progress: stage.progress,
    })),
  };

  graph.data(data);
  graph.render();

  // Event handling
  graph.on('node:click', (evt: any) => {
    const nodeId = evt.item?.get('id');
    if (nodeId && nodeId !== 'root' && onNodeClick) {
      onNodeClick(nodeId);
    }
  });

  // Fit view
  graph.fitView(20);

  return graph;
}

/**
 * Render branch run tree using G6
 */
export function renderBranchTree(
  container: HTMLElement,
  nodes: BranchNode[],
  selectedNodeId: string | null,
  onNodeClick?: (nodeId: string) => void,
): G6.TreeGraph {
  const width = container.clientWidth || 600;
  const height = Math.max(400, nodes.length * 60);

  const graph = new G6.TreeGraph({
    container,
    width,
    height,
    modes: {
      default: ['drag-canvas', 'zoom-canvas'],
    },
    defaultNode: {
      size: [240, 56],
      type: 'rect',
      style: {
        radius: 8,
        fill: '#f8fafc',
        stroke: '#cbd5e1',
        lineWidth: 1,
        cursor: 'pointer',
      },
      labelCfg: {
        style: {
          fill: '#0f172a',
          fontSize: 12,
        },
      },
    },
    defaultEdge: {
      type: 'cubic-vertical',
      style: {
        stroke: '#94a3b8',
        lineWidth: 2,
        endArrow: true,
      },
    },
    layout: {
      type: 'compactBox',
      direction: 'TB',
      getId: (d: any) => d.id,
      getHeight: () => 56,
      getWidth: () => 240,
      getVGap: () => 16,
      getHGap: () => 24,
    },
  });

  // Custom node rendering
  graph.node((node: any) => {
    const isBest = node.isBest;
    const isSelected = node.id === selectedNodeId;
    const status = node.status;
    
    let bgColor = '#f8fafc';
    let borderColor = '#cbd5e1';
    let textColor = '#0f172a';
    
    if (isBest) {
      bgColor = '#dcfce7';
      borderColor = '#16a34a';
      textColor = '#166534';
    } else if (isSelected) {
      bgColor = '#eff6ff';
      borderColor = '#2563eb';
      textColor = '#1e40af';
    } else if (status === 'failed') {
      bgColor = '#fef2f2';
      borderColor = '#dc2626';
      textColor = '#991b1b';
    }

    const scoreText = node.score !== null ? `· Score ${node.score}` : '';
    const bestBadge = isBest ? '⭐ Best' : '';
    const label = `[D${node.depth}] ${node.label} ${scoreText} ${bestBadge}`;

    return {
      label,
      style: {
        stroke: borderColor,
        lineWidth: isSelected || isBest ? 2 : 1,
        fill: bgColor,
      },
      labelCfg: {
        style: {
          fill: textColor,
          fontSize: 12,
          fontWeight: isBest ? 600 : 500,
        },
        position: 'center',
      },
    };
  });

  // Build tree structure from flat nodes
  const buildTree = (flatNodes: BranchNode[]): any => {
    const nodeMap = new Map<string, any>();
    const rootChildren: any[] = [];

    // Create all nodes
    flatNodes.forEach((node) => {
      nodeMap.set(node.id, {
        id: node.id,
        label: `Node #${node.rank}`,
        depth: node.depth,
        rank: node.rank,
        status: node.status,
        score: node.score,
        isBest: false,
        children: [],
      });
    });

    // Build parent-child relationships
    flatNodes.forEach((node) => {
      const treeNode = nodeMap.get(node.id);
      if (!node.parentId) {
        rootChildren.push(treeNode);
      } else {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(treeNode);
        }
      }
    });

    // Mark best node
    const bestNode = flatNodes.find((n) => n.status === 'succeeded' && n.score === Math.max(...flatNodes.filter(x => x.score !== null).map(x => x.score || 0)));
    if (bestNode) {
      const bestTreeNode = nodeMap.get(bestNode.id);
      if (bestTreeNode) {
        bestTreeNode.isBest = true;
      }
    }

    return {
      id: 'root',
      label: 'Branch Run',
      children: rootChildren,
    };
  };

  const data = buildTree(nodes);
  graph.data(data);
  graph.render();

  // Event handling
  graph.on('node:click', (evt: any) => {
    const nodeId = evt.item?.get('id');
    if (nodeId && nodeId !== 'root' && onNodeClick) {
      onNodeClick(nodeId);
    }
  });

  // Fit view
  graph.fitView(20);

  return graph;
}

/**
 * Destroy G6 graph instance
 */
export function destroyGraph(graph: G6.TreeGraph | null): void {
  if (graph) {
    graph.destroy();
  }
}
