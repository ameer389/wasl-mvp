/**
 * Question planner — "ask only what is uncertain".
 * Picks the few check-in questions that still matter today, versus a baseline
 * phone-call script that asks about every patient-side task.
 */
import { getDrug } from './drugs';
import { dependencyKind } from './careGraph';
import { evaluate, FEED_SOURCE_FOR, VERIFY_THRESHOLD, type Evaluation } from './gapEngine';
import { boxHelperAr, doseAsWritten, medNameAr, openMedsTextAr, questionTextAr } from './patientPhrasing';
import type { AuditEntry, CareTask, Day, Evidence, Gap, Patient, Question, Risk } from './types';

export const MAX_TASK_QUESTIONS = 5;
/** Open question, patient voice (male form; see openMedsTextAr for others). */
export const OPEN_MEDS_TEXT = 'فيه أي دواء ثاني تاخذه ما ذكرناه؟';

const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
const PATIENT_OWNERS = new Set(['patient', 'family']);
const MAX_OPEN_PRESENTATIONS_PER_DAY = 2;

export interface QuestionPlan {
  /** Adaptive: at most MAX_TASK_QUESTIONS task questions plus OPEN_MEDS when eligible. */
  questions: Question[];
  /** Still eligible for another session, in priority order. */
  deferredTaskIds: string[];
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
    taskType: task.type,
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

function hasRelevantReview(gaps: readonly Gap[], observation: Evidence | undefined): boolean {
  return !!observation && gaps.some((gap) => gap.route !== 'PATIENT_REMINDER' &&
    (gap.triggerEvidenceIds ?? gap.evidenceIds).includes(observation.id) && (gap.type === 'LOW_CONFIDENCE' ||
      (observation.confidence >= VERIFY_THRESHOLD && !observation.candidateDrugIds?.length &&
        ['NOT_STARTED', 'STOPPED_STILL_TAKEN', 'WRONG_DOSE', 'FOLLOWUP_MISSED', 'TASK_NOT_COMPLETED'].includes(gap.type))));
}

export function planQuestions(
  patient: Patient,
  tasks: readonly CareTask[],
  evidence: readonly Evidence[],
  evaluation: Pick<Evaluation, 'gaps' | 'followup'>,
  today: Day,
  audit: readonly AuditEntry[] = [],
): QuestionPlan {
  const globalDay = (patient.dischargeDay ?? 0) + today;
  const attempts = new Map<string, AuditEntry>();
  let openPresented = 0;
  let openAnswered = false;
  for (const entry of audit) {
    if (entry.day < (patient.dischargeDay ?? 0) || entry.day > globalDay ||
        (entry.action !== 'CHECKIN_PRESENTED' && entry.action !== 'CHECKIN_ANSWER')) continue;
    if (entry.target === patient.id && entry.day === globalDay) {
      if (entry.action === 'CHECKIN_PRESENTED') openPresented++;
      else openAnswered = true;
    }
    if (entry.day >= (attempts.get(entry.target)?.day ?? -1)) attempts.set(entry.target, entry);
  }
  const evidencePosition = new Map(evidence.map((record, index) => [record.id, index]));
  const changedSince = (task: CareTask, observation: Evidence | undefined, attempt: AuditEntry | undefined) => {
    if (!observation || !attempt) return false;
    const attemptDay = attempt.day - (patient.dischargeDay ?? 0);
    const count = attempt.evidenceCount ?? evidence.length;
    if ((observation.recordedDay ?? observation.day) <= attemptDay && (evidencePosition.get(observation.id) ?? -1) < count) return false;
    const prior = evaluate(patient, [task], evidence.slice(0, count), [], attemptDay).followup.get(task.id)?.observation;
    return !prior || prior.claim !== observation.claim || prior.drugId !== observation.drugId ||
      prior.candidateDrugIds?.join() !== observation.candidateDrugIds?.join() ||
      (prior.confidence >= VERIFY_THRESHOLD) !== (observation.confidence >= VERIFY_THRESHOLD) ||
      prior.day < observation.day;
  };

  const inWindow = tasks.filter((t) => {
    if (!PATIENT_OWNERS.has(t.owner) || t.deadlineDay > today + 1) return false;
    const end = t.type === 'MED_CONTINUE' ? patient.plan.meds.find((m) => m.drugId === t.refId)?.treatmentEndDay : undefined;
    return end === undefined || today <= end;
  }).sort(byRiskThenDeadline);

  const open = openMedsQuestion(patient, today);
  const urgent = new Set<string>();
  const eligible = inWindow.filter((task) => {
    const fact = evaluation.followup.get(task.id);
    const observation = fact?.observation;
    if (fact?.supportedCompletion || hasRelevantReview(evaluation.gaps, observation)) return false;
    if (FEED_SOURCE_FOR[task.type] && today <= task.deadlineDay) return false;
    const attempt = attempts.get(task.id);
    const newObservation = changedSince(task, observation, attempt);
    if (attempt?.day === globalDay && !newObservation) return false;
    if (task.risk === 'high' && task.deadlineDay <= today && (!attempt || newObservation)) urgent.add(task.id);
    return true;
  });
  const byId = new Map(eligible.map((task) => [task.id, task]));
  // Within a risk tier, ask other eligible tasks before a continuation whose start still needs an answer.
  const startsBefore = (task: CareTask) => task.dependsOn.filter((id) => {
    const predecessor = byId.get(id);
    return predecessor && dependencyKind(predecessor, task) === 'question_priority';
  });
  const waitingForStart = (task: CareTask) => startsBefore(task).length > 0;
  const ranked = eligible.sort((a, b) =>
    RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
    Number(waitingForStart(a)) - Number(waitingForStart(b)) ||
    Number(urgent.has(b.id)) - Number(urgent.has(a.id)) ||
    byRiskThenDeadline(a, b));
  const selected = ranked.slice(0, MAX_TASK_QUESTIONS);
  // Reserve one non-urgent slot for the longest unserved task. A continuation
  // cannot use this slot to jump ahead of an eligible start.
  const lastAsked = (task: CareTask) => attempts.get(task.id)?.day ?? -1;
  const deferred = ranked.slice(MAX_TASK_QUESTIONS);
  for (const waiting of [...deferred].sort((a, b) => lastAsked(a) - lastAsked(b))) {
    const required = startsBefore(waiting);
    if (required.some((id) => !selected.some((t) => t.id === id))) continue;
    const replace = selected.map((task) => !urgent.has(task.id) && lastAsked(waiting) < lastAsked(task) &&
      !required.includes(task.id) && !selected.some((other) => startsBefore(other).includes(task.id))).lastIndexOf(true);
    if (replace < 0) continue;
    selected.splice(replace, 1);
    selected.push(waiting);
    break;
  }
  const selectedIds = new Set(selected.map((t) => t.id));
  return {
    questions: [
      ...selected.map((t) => questionForTask(t, patient)),
      ...(!openAnswered && openPresented < MAX_OPEN_PRESENTATIONS_PER_DAY ? [open] : []),
    ],
    deferredTaskIds: ranked.filter((t) => !selectedIds.has(t.id)).map((t) => t.id),
    baseline: [...inWindow.map((t) => questionForTask(t, patient)), open],
  };
}
