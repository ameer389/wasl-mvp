/**
 * Question planner — "ask only what is uncertain".
 * Picks the few check-in questions that still matter today, versus a baseline
 * phone-call script that asks about every patient-side task.
 */
import { requireDrug } from './drugs';
import { FEED_SOURCE_FOR, VERIFY_THRESHOLD } from './gapEngine';
import type { CareTask, Day, Evidence, Patient, Question, Risk, TaskStatus } from './types';

export const MAX_TASK_QUESTIONS = 5;
export const OPEN_MEDS_TEXT = 'فيه أي دواء ثاني تاخذه ما ذكرناه؟';

const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
const PATIENT_OWNERS = new Set(['patient', 'family']);

export interface QuestionPlan {
  /** Adaptive: at most MAX_TASK_QUESTIONS task questions + the open medicines question. */
  questions: Question[];
  /** Baseline "full phone-call script": one question per patient-side task in the window + the open question. */
  baseline: Question[];
}

/**
 * How the patient would name this medicine: Arabic generic name plus the first
 * informal name that no other medicine in the same plan shares (so «حبة السيولة»
 * never points at two different medicines).
 */
export function spokenDrugName(drugId: string, patient: Patient): string {
  const drug = requireDrug(drugId);
  const others = patient.plan.meds.filter((m) => m.drugId !== drugId).map((m) => requireDrug(m.drugId));
  const sameAsGeneric = (n: string) => n.replace(/^ال/, '') === drug.nameAr.replace(/^ال/, '');
  const unique = drug.informalNamesAr.find((n) => !sameAsGeneric(n) && !others.some((o) => o.informalNamesAr.includes(n)));
  return unique ? `${drug.nameAr} (${unique})` : drug.nameAr;
}

export function questionForTask(task: CareTask, patient: Patient): Question {
  const id = `q:${task.id}`;
  const base = { id, taskId: task.id };
  const lab = patient.plan.labs.find((l) => l.id === task.refId);
  const fu = patient.plan.followUps.find((f) => f.id === task.refId);
  switch (task.type) {
    case 'MED_START':
      return { ...base, kind: 'MED_START', expects: 'DONE', textAr: `بديت الدواء الجديد ${spokenDrugName(task.refId, patient)}؟` };
    case 'MED_CONTINUE':
      return { ...base, kind: 'MED_CONTINUE', expects: 'DONE', textAr: `للحين مستمر على ${spokenDrugName(task.refId, patient)}؟` };
    case 'MED_DOSE_CHANGE':
      return {
        ...base,
        kind: 'DOSE_CHECK',
        expects: 'DONE',
        textAr: `تاخذ ${spokenDrugName(task.refId, patient)} على الجرعة الجديدة اللي في ورقة الخروج؟`,
      };
    case 'MED_STOP':
      return { ...base, kind: 'STOPPED_CHECK', expects: 'STOPPED', textAr: `وقّفت ${spokenDrugName(task.refId, patient)} زي ما قال لك الدكتور؟` };
    case 'LAB_DONE':
      return { ...base, kind: 'YES_NO', expects: 'DONE', textAr: `سوّيت تحليل ${lab?.testAr ?? lab?.test ?? 'المختبر'}؟` };
    case 'FOLLOWUP_BOOKED':
      return { ...base, kind: 'YES_NO', expects: 'DONE', textAr: `انحجز موعد ${fu?.clinicAr ?? fu?.clinic ?? 'المتابعة'}؟` };
    case 'FOLLOWUP_ATTENDED':
      return { ...base, kind: 'YES_NO', expects: 'DONE', textAr: `رحت لموعد ${fu?.clinicAr ?? fu?.clinic ?? 'المتابعة'}؟` };
    case 'WOUND_CHECK':
      return { ...base, kind: 'YES_NO', expects: 'DONE', textAr: 'شيّكت على الجرح اليوم؟' };
  }
}

export function openMedsQuestion(patientId: string, today: Day): Question {
  return { id: `q:${patientId}:open-meds@d${today}`, kind: 'OPEN_MEDS', expects: 'TAKING_UNLISTED', textAr: OPEN_MEDS_TEXT };
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

  const open = openMedsQuestion(patient.id, today);
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
