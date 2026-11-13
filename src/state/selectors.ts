/** Pure selectors over DemoState (memoised by the store hooks). */
import { buildCareGraph } from '../domain/careGraph';
import { evaluate, sortGaps } from '../domain/gapEngine';
import { planQuestions, type QuestionPlan } from '../domain/questionPlanner';
import { patientDay } from '../domain/time';
import type { CareTask, Day, Evidence, Gap, GapResolution, Patient, TaskStatus } from '../domain/types';

export function buildAllTasks(patients: readonly Patient[]): Record<string, CareTask[]> {
  return Object.fromEntries(patients.map((p) => [p.id, buildCareGraph(p)]));
}

/** The patient's own day since discharge at a global simulated day. */
export function dayFor(patient: Patient, globalDay: Day): Day {
  return patientDay(globalDay, patient.dischargeDay ?? 0);
}

export interface AllEvaluation {
  statuses: Record<string, TaskStatus>;
  /** All open gaps across discharged patients, sorted by priority. */
  gaps: Gap[];
  gapsByPatient: Record<string, Gap[]>;
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
): AllEvaluation {
  const statuses: Record<string, TaskStatus> = {};
  const gapsByPatient: Record<string, Gap[]> = {};
  for (const p of patients) {
    const today = dayFor(p, globalDay);
    if (today < 0) {
      gapsByPatient[p.id] = [];
      continue;
    }
    const result = evaluate(p, tasksByPatient[p.id] ?? [], evidence, resolutions, today);
    Object.assign(statuses, result.taskStatus);
    gapsByPatient[p.id] = result.gaps;
  }
  return { statuses, gaps: sortGaps(Object.values(gapsByPatient).flat()), gapsByPatient };
}

/** Today's adaptive and baseline questions per discharged patient. */
export function planAll(
  patients: readonly Patient[],
  tasksByPatient: Readonly<Record<string, CareTask[]>>,
  evidence: readonly Evidence[],
  statuses: Readonly<Record<string, TaskStatus>>,
  globalDay: Day,
): Record<string, QuestionPlan> {
  const plans: Record<string, QuestionPlan> = {};
  for (const p of patients) {
    const today = dayFor(p, globalDay);
    if (today >= 0) plans[p.id] = planQuestions(p, tasksByPatient[p.id] ?? [], evidence, statuses, today);
  }
  return plans;
}

/** Every gap detected for a patient so far, open or resolved (for audit history). */
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
