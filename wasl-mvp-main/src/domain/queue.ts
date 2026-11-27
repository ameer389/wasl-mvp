/** Care gaps worklist: filtering and grouping (pure). */
import { normalizeArabic } from './arabicParser';
import { ROUTE_ORDER } from './gapEngine';
import type { Gap, GapRoute, GapType, Patient, Risk } from './types';

export type QueueRow =
  | { kind: 'gap'; key: string; gap: Gap }
  | {
      kind: 'group';
      key: string;
      patientId: string;
      type: 'NO_RESPONSE';
      gaps: Gap[];
      risk: Risk;
      route: GapRoute;
      priority: number;
      detectedDay: number;
    };

const RISK_RANK: Record<Risk, number> = { high: 0, medium: 1, low: 2 };

/**
 * Turns sorted gaps into queue rows. Two or more NO_RESPONSE gaps for the same
 * patient become one group row, placed where its highest-priority gap was.
 */
export function buildQueueRows(sortedGaps: readonly Gap[]): QueueRow[] {
  const noResponse = new Map<string, Gap[]>();
  for (const g of sortedGaps) {
    if (g.type !== 'NO_RESPONSE') continue;
    noResponse.set(g.patientId, [...(noResponse.get(g.patientId) ?? []), g]);
  }

  const rows: QueueRow[] = [];
  const placed = new Set<string>();
  for (const gap of sortedGaps) {
    const group = gap.type === 'NO_RESPONSE' ? noResponse.get(gap.patientId) : undefined;
    if (!group || group.length < 2) {
      rows.push({ kind: 'gap', key: gap.id, gap });
      continue;
    }
    if (placed.has(gap.patientId)) continue;
    placed.add(gap.patientId);
    rows.push({
      kind: 'group',
      key: `${gap.patientId}:NO_RESPONSE:group`,
      patientId: gap.patientId,
      type: 'NO_RESPONSE',
      gaps: group,
      risk: group.reduce((r, g) => (RISK_RANK[g.risk] < RISK_RANK[r] ? g.risk : r), group[0]!.risk),
      route: group.reduce((r, g) => (ROUTE_ORDER[g.route] < ROUTE_ORDER[r] ? g.route : r), group[0]!.route),
      priority: group[0]!.priority,
      detectedDay: Math.min(...group.map((g) => g.detectedDay)),
    });
  }
  return rows;
}

export interface QueueFilters {
  risk: 'all' | 'high' | 'medium';
  route: 'all' | 'now' | '24h';
  type: 'all' | GapType;
  search: string;
}

export const DEFAULT_FILTERS: QueueFilters = { risk: 'all', route: 'all', type: 'all', search: '' };

export function isDefaultFilters(f: QueueFilters): boolean {
  return f.risk === 'all' && f.route === 'all' && f.type === 'all' && f.search.trim() === '';
}

/** Filter gaps before grouping. Search matches the patient's English or Arabic name. */
export function filterGaps(gaps: readonly Gap[], filters: QueueFilters, patients: readonly Patient[]): Gap[] {
  const query = filters.search.trim().toLowerCase();
  const queryAr = normalizeArabic(filters.search);
  const byId = new Map(patients.map((p) => [p.id, p]));
  return gaps.filter((g) => {
    if (filters.risk !== 'all' && g.risk !== filters.risk) return false;
    if (filters.route === 'now' && g.route !== 'CLINICIAN_NOW') return false;
    if (filters.route === '24h' && g.route !== 'CLINICIAN_24H') return false;
    if (filters.type !== 'all' && g.type !== filters.type) return false;
    if (query) {
      const p = byId.get(g.patientId);
      const hit = p && (p.nameEn.toLowerCase().includes(query) || (queryAr && normalizeArabic(p.nameAr).includes(queryAr)));
      if (!hit) return false;
    }
    return true;
  });
}
