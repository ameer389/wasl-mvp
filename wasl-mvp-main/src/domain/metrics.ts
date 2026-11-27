/** Small, pure summaries for the console (all computed from simulated data). */
import { isPatientSideSource } from './gapEngine';
import type { QuestionPlan } from './questionPlanner';
import type { CareTask, Day, Evidence, Gap, Risk, TaskStatus } from './types';

export interface VerificationSummary {
  verified: number;
  /** Tasks whose deadline is on or before today. */
  due: number;
  pct: number;
}

/** Verified tasks out of the tasks due so far (deadline ≤ today). */
export function verificationSummary(
  tasks: readonly CareTask[],
  statuses: Readonly<Record<string, TaskStatus>>,
  today: Day,
): VerificationSummary {
  const due = tasks.filter((t) => t.deadlineDay <= today);
  const verified = due.filter((t) => statuses[t.id] === 'VERIFIED').length;
  return { verified, due: due.length, pct: due.length ? Math.round((100 * verified) / due.length) : 0 };
}

export function addSummaries(a: VerificationSummary, b: VerificationSummary): VerificationSummary {
  const verified = a.verified + b.verified;
  const due = a.due + b.due;
  return { verified, due, pct: due ? Math.round((100 * verified) / due) : 0 };
}

export interface QuestionSavings {
  adaptive: number;
  baseline: number;
  /** Percentage fewer questions than the full phone script (0 when baseline is 0). */
  reductionPct: number;
}

/** Adaptive check-in questions vs the full phone-call script, summed over patients. */
export function questionSavings(plans: readonly QuestionPlan[]): QuestionSavings {
  const adaptive = plans.reduce((n, p) => n + p.questions.length, 0);
  const baseline = plans.reduce((n, p) => n + p.baseline.length, 0);
  return { adaptive, baseline, reductionPct: baseline ? Math.round((100 * (baseline - adaptive)) / baseline) : 0 };
}

/** Latest patient/family answer for a patient, up to today. */
export function lastCheckIn(evidence: readonly Evidence[], patientId: string, today: Day): Evidence | undefined {
  return evidenceKnownBy(evidence, patientId, today).filter((e) => isPatientSideSource(e.source)).at(-1);
}

const RISK_RANK: Record<Risk, number> = { high: 0, medium: 1, low: 2 };

export function highestRisk(gaps: readonly Gap[]): Risk | undefined {
  return gaps.reduce<Risk | undefined>((r, g) => (r === undefined || RISK_RANK[g.risk] < RISK_RANK[r] ? g.risk : r), undefined);
}

export function daysOpen(gap: Gap, today: Day): number {
  return Math.max(0, today - gap.detectedDay);
}

/** Latest evidence items for a patient (newest first), up to today. */
export function latestEvidence(evidence: readonly Evidence[], patientId: string, today: Day, limit = 3): Evidence[] {
  return evidenceKnownBy(evidence, patientId, today).reverse().slice(0, limit);
}
import { evidenceKnownBy } from './medicationEvidence';
