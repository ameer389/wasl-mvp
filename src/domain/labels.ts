/** Plain-English labels for the care team console. Descriptive only. */
import { getDrug } from './drugs';
import type { CareTask, EvidenceClaim, Gap, GapRoute, GapType, Patient, Risk, TaskStatus, TaskType } from './types';

export const GAP_TYPE_LABEL: Record<GapType, string> = {
  NOT_STARTED: 'New medicine not started',
  STOPPED_STILL_TAKEN: 'Stopped medicine still being taken',
  WRONG_DOSE: 'Previous dose still in use',
  DUPLICATE_THERAPY: 'Possible duplicate therapy',
  UNLISTED_MED: 'Medicine not on the discharge list',
  LAB_MISSED: 'Lab test not done',
  FOLLOWUP_NOT_BOOKED: 'Follow-up not booked',
  FOLLOWUP_MISSED: 'Follow-up visit missed',
  NO_RESPONSE: 'No response',
  LOW_CONFIDENCE: 'Low-confidence answer: needs a human',
};

export const ROUTE_LABEL: Record<GapRoute, string> = {
  CLINICIAN_NOW: 'Now',
  CLINICIAN_24H: 'Within 24h',
  PATIENT_REMINDER: 'Patient reminder',
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

/** What a gap is about: the task's short label, or the medicine for medication-level gaps. */
export function gapSubject(gap: Gap, tasks: readonly CareTask[], patient: Patient): string {
  const task = gap.taskId ? tasks.find((t) => t.id === gap.taskId) : undefined;
  if (task) return shortTaskLabel(task, patient);
  if (gap.drugId) return getDrug(gap.drugId)?.generic ?? gap.drugId;
  return 'Unidentified medicine';
}
