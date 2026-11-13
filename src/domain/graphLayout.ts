/** Care graph timeline layout (pure geometry; the component only draws it). */
import { FOLLOW_UP_DAYS } from './time';
import type { CareTask, TaskType } from './types';

export type Lane = 'Medications' | 'Labs' | 'Follow-up' | 'Wound';
export const LANES: Lane[] = ['Medications', 'Labs', 'Follow-up', 'Wound'];

export function laneOf(type: TaskType): Lane {
  if (type.startsWith('MED_')) return 'Medications';
  if (type === 'LAB_DONE') return 'Labs';
  if (type === 'WOUND_CHECK') return 'Wound';
  return 'Follow-up';
}

export interface GraphMetrics {
  dayWidth: number;
  laneLabelWidth: number;
  headerHeight: number;
  nodeHeight: number;
  rowGap: number;
  lanePadding: number;
}

export const DEFAULT_GRAPH_METRICS: GraphMetrics = {
  dayWidth: 136,
  laneLabelWidth: 112,
  headerHeight: 32,
  nodeHeight: 30,
  rowGap: 8,
  lanePadding: 12,
};

export interface GraphNode {
  task: CareTask;
  lane: Lane;
  /** Stack position among tasks in the same lane and day. */
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLaneBox {
  lane: Lane;
  y: number;
  height: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  lanes: GraphLaneBox[];
  edges: GraphEdge[];
  lastDay: number;
  width: number;
  height: number;
  /** Centre x of a day column. */
  dayCenter: (day: number) => number;
}

export function layoutCareGraph(tasks: readonly CareTask[], m: GraphMetrics = DEFAULT_GRAPH_METRICS): GraphLayout {
  const lastDay = Math.max(FOLLOW_UP_DAYS, ...tasks.map((t) => t.deadlineDay));
  const dayLeft = (day: number) => m.laneLabelWidth + day * m.dayWidth;
  const nodeWidth = m.dayWidth - 8;

  const nodes: GraphNode[] = [];
  const lanes: GraphLaneBox[] = [];
  let y = m.headerHeight;

  for (const lane of LANES) {
    const inLane = tasks.filter((t) => laneOf(t.type) === lane);
    const rowsPerDay = new Map<number, number>();
    const placed = inLane.map((task) => {
      const row = rowsPerDay.get(task.deadlineDay) ?? 0;
      rowsPerDay.set(task.deadlineDay, row + 1);
      return { task, row };
    });
    const rows = Math.max(1, ...rowsPerDay.values());
    const height = m.lanePadding * 2 + rows * m.nodeHeight + (rows - 1) * m.rowGap;
    for (const { task, row } of placed) {
      nodes.push({
        task,
        lane,
        row,
        x: dayLeft(task.deadlineDay) + 4,
        y: y + m.lanePadding + row * (m.nodeHeight + m.rowGap),
        width: nodeWidth,
        height: m.nodeHeight,
      });
    }
    lanes.push({ lane, y, height });
    y += height;
  }

  const byId = new Map(nodes.map((n) => [n.task.id, n]));
  const edges: GraphEdge[] = [];
  for (const n of nodes) {
    for (const dep of n.task.dependsOn) {
      const from = byId.get(dep);
      if (!from) continue;
      edges.push({
        from: dep,
        to: n.task.id,
        x1: from.x + from.width,
        y1: from.y + from.height / 2,
        x2: n.x,
        y2: n.y + n.height / 2,
      });
    }
  }

  return {
    nodes,
    lanes,
    edges,
    lastDay,
    width: dayLeft(lastDay + 1) + 8,
    height: y,
    dayCenter: (day) => dayLeft(day) + m.dayWidth / 2,
  };
}
