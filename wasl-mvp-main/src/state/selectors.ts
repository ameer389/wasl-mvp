/** Pure selectors over DemoState (memoised by the store hooks). */
import { buildCareGraph } from '../domain/careGraph';
import { evaluate, FEED_SOURCE_FOR, sortGaps, type Evaluation } from '../domain/gapEngine';
import { planQuestions, type QuestionPlan } from '../domain/questionPlanner';
import { FOLLOW_UP_DAYS, NO_RESPONSE_GRACE_DAYS, patientDay } from '../domain/time';
import type { AuditEntry, CareTask, Day, Evidence, Gap, GapResolution, Patient, TaskStatus } from '../domain/types';

export function buildAllTasks(patients: readonly Patient[]): Record<string, CareTask[]> {
  return Object.fromEntries(patients.map((p) => [p.id, buildCareGraph(p)]));
}

/** The patient's own day since discharge at a global simulated day. */
export function dayFor(patient: Patient, globalDay: Day): Day {
  return patientDay(globalDay, patient.dischargeDay ?? 0);
}

/** Keep the standard follow-up window and include the first overdue evaluation for each task. */
export function patientHorizon(tasks: readonly CareTask[]): Day {
  return tasks.reduce((last, task) => Math.max(last, task.deadlineDay + (FEED_SOURCE_FOR[task.type] ? 1 : NO_RESPONSE_GRACE_DAYS)), FOLLOW_UP_DAYS);
}

export function simulationHorizon(patients: readonly Patient[], tasksByPatient = buildAllTasks(patients)): Day {
  return patients.reduce((last, p) => Math.max(last, (p.dischargeDay ?? 0) + patientHorizon(tasksByPatient[p.id] ?? [])), FOLLOW_UP_DAYS);
}

export interface AllEvaluation {
  statuses: Record<string, TaskStatus>;
  /** All open gaps across discharged patients, sorted by priority. */
  gaps: Gap[];
  gapsByPatient: Record<string, Gap[]>;
  byPatient: Record<string, Evaluation>;
}

/**
 * Evaluates every patient on their own timeline (globalDay − dischargeDay).
 * Patients not yet discharged at this global day are skipped.
 */
export function evaluateAll(
  patients: readonly Patient[],
  tasksByPatient: Readonly<Record<string, CareTask[]>>,
  evidence: readonly Evidence[],
  resolutions: readonly GapResolution[],
  globalDay: Day,
  audit: readonly AuditEntry[] = [],
): AllEvaluation {
  const statuses: Record<string, TaskStatus> = {};
  const gapsByPatient: Record<string, Gap[]> = {};
  const byPatient: Record<string, Evaluation> = {};
  for (const p of patients) {
    const today = dayFor(p, globalDay);
    if (today < 0) {
      gapsByPatient[p.id] = [];
      continue;
    }
    const result = evaluate(p, tasksByPatient[p.id] ?? [], evidence, resolutions, today, audit);
    byPatient[p.id] = result;
    Object.assign(statuses, result.taskStatus);
    gapsByPatient[p.id] = result.gaps;
  }
  return { statuses, gaps: sortGaps(Object.values(gapsByPatient).flat()), gapsByPatient, byPatient };
}

/** Today's adaptive and baseline questions per discharged patient. */
export function planAll(
  patients: readonly Patient[],
  tasksByPatient: Readonly<Record<string, CareTask[]>>,
  evidence: readonly Evidence[],
  evaluation: AllEvaluation,
  globalDay: Day,
  audit: readonly AuditEntry[] = [],
): Record<string, QuestionPlan> {
  const plans: Record<string, QuestionPlan> = {};
  for (const p of patients) {
    const today = dayFor(p, globalDay);
    const result = evaluation.byPatient[p.id];
    if (today >= 0 && result) plans[p.id] = planQuestions(p, tasksByPatient[p.id] ?? [], evidence, result, today, audit);
  }
  return plans;
}

/** Current raw conditions for audit reconstruction when no observation was recorded. */
export function detectedGaps(
  patient: Patient,
  tasks: readonly CareTask[],
  evidence: readonly Evidence[],
  globalDay: Day,
): Gap[] {
  const today = dayFor(patient, globalDay);
  return today < 0 ? [] : evaluate(patient, tasks, evidence, [], today).gaps;
}

/** Gaps that need a clinician (excludes patient reminders). */
export function clinicianGaps(gaps: readonly Gap[]): Gap[] {
  return gaps.filter((g) => g.route !== 'PATIENT_REMINDER');
}

export function escalationsNow(gaps: readonly Gap[]): Gap[] {
  return gaps.filter((g) => g.route === 'CLINICIAN_NOW');
}

export function patientReminders(gaps: readonly Gap[]): Gap[] {
  return gaps.filter((g) => g.route === 'PATIENT_REMINDER');
}
