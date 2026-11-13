/** Pure selectors over DemoState (memoised by the store hooks). */
import { buildCareGraph } from '../domain/careGraph';
import { evaluate, sortGaps } from '../domain/gapEngine';
import type { CareTask, Day, Evidence, Gap, GapResolution, Patient, TaskStatus } from '../domain/types';

export function buildAllTasks(patients: readonly Patient[]): Record<string, CareTask[]> {
  return Object.fromEntries(patients.map((p) => [p.id, buildCareGraph(p)]));
}

export interface AllEvaluation {
  statuses: Record<string, TaskStatus>;
  /** All open gaps across patients, sorted by priority. */
  gaps: Gap[];
  gapsByPatient: Record<string, Gap[]>;
}

export function evaluateAll(
  patients: readonly Patient[],
  tasksByPatient: Readonly<Record<string, CareTask[]>>,
  evidence: readonly Evidence[],
  resolutions: readonly GapResolution[],
  today: Day,
): AllEvaluation {
  const statuses: Record<string, TaskStatus> = {};
  const gapsByPatient: Record<string, Gap[]> = {};
  for (const p of patients) {
    const result = evaluate(p, tasksByPatient[p.id] ?? [], evidence, resolutions, today);
    Object.assign(statuses, result.taskStatus);
    gapsByPatient[p.id] = result.gaps;
  }
  return { statuses, gaps: sortGaps(Object.values(gapsByPatient).flat()), gapsByPatient };
}

/** Gaps that need a clinician (excludes patient reminders). */
export function clinicianGaps(gaps: readonly Gap[]): Gap[] {
  return gaps.filter((g) => g.route !== 'PATIENT_REMINDER');
}

export function escalationsNow(gaps: readonly Gap[]): Gap[] {
  return gaps.filter((g) => g.route === 'CLINICIAN_NOW');
}
