/**
 * Question planner — "ask only what is uncertain".
 * Picks the few check-in questions that still matter today, versus a baseline
 * phone-call script that asks about every patient-side task.
 */
import { getDrug } from './drugs';
import { FEED_SOURCE_FOR, VERIFY_THRESHOLD } from './gapEngine';
import { boxHelperAr, doseAsWritten, medNameAr, openMedsTextAr, questionTextAr } from './patientPhrasing';
import type { CareTask, Day, Evidence, Patient, Question, Risk, TaskStatus } from './types';

export const MAX_TASK_QUESTIONS = 5;
/** Open question, patient voice (male form; see openMedsTextAr for others). */
export const OPEN_MEDS_TEXT = 'فيه أي دواء ثاني تاخذه ما ذكرناه؟';

const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
const PATIENT_OWNERS = new Set(['patient', 'family']);

export interface QuestionPlan {
  /** Adaptive: at most MAX_TASK_QUESTIONS task questions + the open medicines question. */
  questions: Question[];
  /** Baseline "full phone-call script": one question per patient-side task in the window + the open question. */
  baseline: Question[];
}

const KIND_FOR: Record<CareTask['type'], Question['kind']> = {
  MED_START: 'MED_START',
  MED_CONTINUE: 'MED_CONTINUE',
  MED_DOSE_CHANGE: 'DOSE_CHECK',
  MED_STOP: 'STOPPED_CHECK',
  LAB_DONE: 'YES_NO',
  FOLLOWUP_BOOKED: 'YES_NO',
  FOLLOWUP_ATTENDED: 'YES_NO',
  WOUND_CHECK: 'YES_NO',
};

/**
 * One check-in question for a task. Medicines are named the way patients say
 * them (informal name first) with the written name on a helper line.
 */
export function questionForTask(task: CareTask, patient: Patient): Question {
  const lab = patient.plan.labs.find((l) => l.id === task.refId);
  const fu = patient.plan.followUps.find((f) => f.id === task.refId);
  const drug = getDrug(task.refId);
  const kind = KIND_FOR[task.type];
  const isMed = task.type.startsWith('MED_') && !!drug;
  const planMed = patient.plan.meds.find((m) => m.drugId === task.refId);
  return {
    id: `q:${task.id}`,
    taskId: task.id,
    kind,
    expects: kind === 'STOPPED_CHECK' ? 'STOPPED' : 'DONE',
    textAr: questionTextAr(task, patient, 'patient'),
    familyTextAr: questionTextAr(task, patient, 'family'),
    textEn: glossEn(task, drug?.generic.toLowerCase() ?? task.refId, lab?.test, fu?.clinic),
    ...(isMed ? { drugId: task.refId, medNameAr: medNameAr(task.refId), helperAr: boxHelperAr(task.refId) } : {}),
    ...(kind === 'DOSE_CHECK' ? { doseAsWritten: doseAsWritten(planMed) } : {}),
  };
}

function glossEn(task: CareTask, drug: string, test?: string, clinic?: string): string {
  switch (task.type) {
    case 'MED_START':
      return `Started the new ${drug}?`;
    case 'MED_CONTINUE':
      return `Still on ${drug}?`;
    case 'MED_DOSE_CHANGE':
      return `On the new ${drug} dose from the discharge sheet?`;
    case 'MED_STOP':
      return `Stopped ${drug} as the doctor said?`;
    case 'LAB_DONE':
      return `Had the ${test ?? 'lab'} test done?`;
    case 'FOLLOWUP_BOOKED':
      return `Is the ${clinic ?? 'follow-up'} appointment booked?`;
    case 'FOLLOWUP_ATTENDED':
      return `Went to the ${clinic ?? 'follow-up'} appointment?`;
    case 'WOUND_CHECK':
      return 'Checked the wound today?';
  }
}

export const OPEN_MEDS_TEXT_EN = 'Any other medicine you take that we did not mention?';

export function openMedsQuestion(patient: Patient, today: Day): Question {
  return {
    id: `q:${patient.id}:open-meds@d${today}`,
    kind: 'OPEN_MEDS',
    expects: 'TAKING_UNLISTED',
    textAr: openMedsTextAr(patient, 'patient'),
    familyTextAr: openMedsTextAr(patient, 'family'),
    textEn: OPEN_MEDS_TEXT_EN,
  };
}

const byRiskThenDeadline = (a: CareTask, b: CareTask) =>
  RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.deadlineDay - b.deadlineDay || a.id.localeCompare(b.id);

export function planQuestions(
  patient: Patient,
  tasks: readonly CareTask[],
  evidence: readonly Evidence[],
  statuses: Readonly<Record<string, TaskStatus>>,
  today: Day,
): QuestionPlan {
  const known = evidence.filter((e) => e.patientId === patient.id && e.day <= today);
  const evidenceFor = (taskId: string) => known.filter((e) => e.taskId === taskId).sort((a, b) => a.day - b.day);

  const inWindow = tasks.filter((t) => PATIENT_OWNERS.has(t.owner) && t.deadlineDay <= today + 1).sort(byRiskThenDeadline);

  const isUncertain = (task: CareTask): boolean => {
    const status = statuses[task.id];
    if (status === 'VERIFIED' || status === 'CLOSED') return false;
    const ev = evidenceFor(task.id);
    // Already answered with confidence: the answer is known (verified, or a gap for a clinician).
    const latest = ev.at(-1);
    if (latest && latest.confidence >= VERIFY_THRESHOLD) return false;
    // Feed-verifiable tasks: only ask once the feed is silent past the due day.
    const feed = FEED_SOURCE_FOR[task.type];
    if (feed) return today > task.deadlineDay && !ev.some((e) => e.source === feed);
    return true;
  };

  const open = openMedsQuestion(patient, today);
  return {
    questions: [
      ...inWindow
        .filter(isUncertain)
        .slice(0, MAX_TASK_QUESTIONS)
        .map((t) => questionForTask(t, patient)),
      open,
    ],
    baseline: [...inWindow.map((t) => questionForTask(t, patient)), open],
  };
}
