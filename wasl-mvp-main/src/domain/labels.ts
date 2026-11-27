/** Plain-English labels for the care team console. Descriptive only. */
import { getDrug } from './drugs';
import { isOpenMedicationReport, VERIFY_THRESHOLD } from './medicationEvidence';
import type { CareTask, Evidence, EvidenceClaim, Gap, GapRoute, GapType, Patient, Risk, TaskStatus, TaskType } from './types';

export const GAP_TYPE_LABEL: Record<GapType, string> = {
  NOT_STARTED: 'New medicine reported not started',
  STOPPED_STILL_TAKEN: 'Stopped medicine reported in use',
  WRONG_DOSE: 'Previous dose reported in use',
  DUPLICATE_THERAPY: 'Possible duplicate therapy',
  UNLISTED_MED: 'Medicine identity or plan match needs review',
  LAB_MISSED: 'Lab result unavailable',
  FOLLOWUP_NOT_BOOKED: 'Follow-up booking unconfirmed',
  FOLLOWUP_MISSED: 'Follow-up reported missed',
  FOLLOWUP_ATTENDANCE_UNCONFIRMED: 'Follow-up attendance unconfirmed',
  TASK_NOT_COMPLETED: 'Task reported incomplete',
  NO_RESPONSE: 'No response',
  LOW_CONFIDENCE: 'Evidence needs clarification',
};

export const ROUTE_LABEL: Record<GapRoute, string> = {
  CLINICIAN_NOW: 'Now',
  CLINICIAN_24H: 'Within 24h',
  PATIENT_REMINDER: 'In-app follow-up',
};

export const RISK_LABEL: Record<Risk, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  GAP: 'Gap',
  ESCALATED: 'Escalated',
  CLOSED: 'Closed',
};

export const CLAIM_LABEL: Record<EvidenceClaim, string> = {
  DONE: 'Done',
  NOT_DONE: 'Not done',
  UNSURE: 'Unsure',
  STILL_TAKING: 'Still taking',
  STOPPED: 'Stopped',
  TAKING_UNLISTED: 'Taking an unlisted medicine',
  OLD_DOSE: 'Previous dose',
};

export function evidenceClaimLabel(e: Evidence): string {
  if (e.eventKind === 'DISPENSED') return 'Dispensed';
  if (e.eventKind === 'LAB_RESULT' && e.claim === 'DONE') return 'Lab result recorded';
  if (e.eventKind === 'APPOINTMENT_BOOKING' && e.claim === 'DONE') return 'Booking recorded';
  if (e.eventKind === 'APPOINTMENT_ATTENDANCE' && e.claim === 'DONE') return 'Attendance recorded';
  if (isOpenMedicationReport(e) && (e.confidence < VERIFY_THRESHOLD || e.candidateDrugIds?.length)) return 'Unresolved report';
  if (isOpenMedicationReport(e) && e.claim === 'STOPPED') return 'No current use reported';
  return CLAIM_LABEL[e.claim];
}

export const OWNER_LABEL: Record<CareTask['owner'], string> = {
  patient: 'Patient',
  family: 'Family',
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  physician: 'Physician',
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  MED_START: 'Start medicine',
  MED_CONTINUE: 'Continue medicine',
  MED_DOSE_CHANGE: 'Dose change',
  MED_STOP: 'Stop medicine',
  LAB_DONE: 'Lab test',
  FOLLOWUP_BOOKED: 'Book follow-up',
  FOLLOWUP_ATTENDED: 'Attend follow-up',
  WOUND_CHECK: 'Wound check',
};

const PLAN_WORD: Record<string, string> = { NEW: 'new', STOP: '"stop"', CHANGED: 'changed', CONTINUE: '"continue"' };

/**
 * Display form of an engine reason: claim codes become words, confidence becomes a
 * percentage, the rule's code name is dropped. The engine's own text is unchanged.
 */
export function readableReason(reason: string): string {
  return reason
    .replace(/→ ([A-Z_]+) \(confidence (\d(?:\.\d+)?)/g, (_m, claim: string, c: string) => {
      const label = claim in CLAIM_LABEL ? CLAIM_LABEL[claim as EvidenceClaim] : claim;
      return `→ understood as "${label}" (confidence ${Math.round(Number(c) * 100)}%`;
    })
    .replace(/^Rule [A-Z_]+: /, 'Rule: ')
    .replace(/\b(NEW|STOP|CHANGED|CONTINUE)\b/g, (w) => PLAN_WORD[w] ?? w)
    .replace(/confidence below (\d\.\d+)/, (_m, c: string) => `confidence below ${Math.round(Number(c) * 100)}%`);
}

/** Short label for a task (care graph pills, queue rows). */
export function shortTaskLabel(task: CareTask, patient: Patient): string {
  const drug = getDrug(task.refId)?.generic ?? task.refId;
  const lab = patient.plan.labs.find((l) => l.id === task.refId);
  const fu = patient.plan.followUps.find((f) => f.id === task.refId);
  switch (task.type) {
    case 'MED_START':
      return `Start ${drug}`;
    case 'MED_CONTINUE':
      return `Continue ${drug}`;
    case 'MED_DOSE_CHANGE':
      return `New dose ${drug}`;
    case 'MED_STOP':
      return `Stop ${drug}`;
    case 'LAB_DONE':
      return lab?.test ?? 'Lab test';
    case 'FOLLOWUP_BOOKED':
      return `Book ${fu?.clinic ?? 'follow-up'}`;
    case 'FOLLOWUP_ATTENDED':
      return `Visit ${fu?.clinic ?? 'follow-up'}`;
    case 'WOUND_CHECK':
      return 'Wound check';
  }
}

/** The thing a task is about, without the action: "Apixaban", "CBC", "Cardiology", "Wound". */
export function entityLabel(task: CareTask, patient: Patient): string {
  const lab = patient.plan.labs.find((l) => l.id === task.refId);
  const fu = patient.plan.followUps.find((f) => f.id === task.refId);
  if (task.type.startsWith('MED_')) return getDrug(task.refId)?.generic ?? task.refId;
  if (task.type === 'LAB_DONE') return lab?.test ?? 'Lab';
  if (task.type === 'WOUND_CHECK') return 'Wound';
  return (fu?.clinic ?? 'Follow-up').replace(/\s+clinic$/i, '');
}

/** What a gap is about: the task's short label, or the medicine for medication-level gaps. */
export function gapSubject(gap: Gap, tasks: readonly CareTask[], patient: Patient): string {
  const task = gap.taskId ? tasks.find((t) => t.id === gap.taskId) : undefined;
  if (task) return shortTaskLabel(task, patient);
  if (gap.drugId) return getDrug(gap.drugId)?.generic ?? gap.drugId;
  return 'Unidentified medicine';
}
