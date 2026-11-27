import { describe, expect, it } from 'vitest';
import { buildCareGraph } from '../../src/domain/careGraph';
import { evaluate } from '../../src/domain/gapEngine';
import { MAX_TASK_QUESTIONS, OPEN_MEDS_TEXT, planQuestions } from '../../src/domain/questionPlanner';
import type { AuditEntry, CareTask, Evidence, Patient } from '../../src/domain/types';
import { SAMPLE_EVIDENCE, SAMPLE_PATIENTS } from '../../src/data/samplePatients';
import { ev, makePatient, T } from './fixtures';

function plan(evidence: Evidence[], today: number, patient: Patient = makePatient()) {
  const tasks = buildCareGraph(patient);
  const evaluation = evaluate(patient, tasks, evidence, [], today);
  return planQuestions(patient, tasks, evidence, evaluation, today);
}

const taskIds = (qs: { taskId?: string }[]) => qs.map((q) => q.taskId).filter(Boolean);

describe('planQuestions', () => {
  it('asks at most 5 task questions followed by the open question when it is eligible', () => {
    const p = makePatient();
    p.plan.meds = ['apixaban', 'furosemide', 'amlodipine', 'metformin', 'atorvastatin', 'omeprazole', 'bisoprolol'].map((drugId) => ({
      drugId,
      dose: '1',
      frequency: 'once daily',
      action: 'NEW' as const,
      prescriber: 'X',
    }));
    const { questions } = plan([], 0, p);
    expect(questions).toHaveLength(MAX_TASK_QUESTIONS + 1);
    expect(questions.at(-1)).toMatchObject({ kind: 'OPEN_MEDS', textAr: OPEN_MEDS_TEXT });
  });

  it('orders by risk, then deadline', () => {
    const { questions } = plan([], 0);
    // Window Day ≤ 1: apixaban start (high), clopidogrel stop (high), insulin dose (high), furosemide start (medium).
    expect(taskIds(questions).slice(-1)[0]).toBe(T.furosemideStart);
  });

  it('does not ask a current-use continuation question after the planned treatment end', () => {
    const p = makePatient();
    p.plan.meds[0]!.treatmentEndDay = 3;
    expect(taskIds(plan([], 3, p).questions)).toContain(T.apixabanCont3);
    expect(taskIds(plan([], 4, p).questions)).not.toContain(T.apixabanCont3);
  });

  it('defers a continuation question within its risk tier while the start still needs an answer', () => {
    const p = makePatient();
    const tasks = buildCareGraph(p);
    const other = { ...tasks.find((t) => t.id === T.wound)!, deadlineDay: 4, risk: 'high' as const };
    const selected = tasks.filter((t) => [T.apixabanStart, T.apixabanCont3].includes(t.id)).concat(other);
    const pending = planQuestions(p, selected, [], evaluate(p, selected, [], [], 3), 3).questions;
    expect(taskIds(pending)).toEqual([T.apixabanStart, other.id, T.apixabanCont3]);
    const started = ev({ taskId: T.apixabanStart, source: 'patient_app', day: 3, claim: 'DONE' });
    expect(taskIds(planQuestions(p, selected, [started], evaluate(p, selected, [started], [], 3), 3).questions)).toEqual([T.apixabanCont3, other.id]);
  });

  it('never asks about verified tasks', () => {
    const done = ev({ taskId: T.apixabanStart, source: 'patient_app', day: 0, claim: 'DONE' });
    expect(taskIds(plan([done], 0).questions)).not.toContain(T.apixabanStart);
  });

  it('does not re-ask reports that already have a linked clinician review', () => {
    const unsure = ev({ taskId: T.apixabanStart, source: 'patient_voice', day: 0, claim: 'DONE', confidence: 0.5 });
    const still = ev({ taskId: T.clopidogrelStop, source: 'family', day: 0, claim: 'STILL_TAKING', confidence: 0.9 });
    const ids = taskIds(plan([unsure, still], 0).questions);
    expect(ids).not.toContain(T.apixabanStart);
    expect(ids).not.toContain(T.clopidogrelStop); // known problem → clinician, not another question
  });

  it('does not ask about labs / appointments while feeds can still verify them', () => {
    // No medicines, so the 5-question cap never hides the feed-task behaviour.
    const p = makePatient();
    p.plan.meds = [];
    expect(taskIds(plan([], 2, p).questions)).not.toContain(T.cbc); // due Day 3
    expect(taskIds(plan([], 3, p).questions)).not.toContain(T.cbc); // due today, feed may still arrive
    expect(taskIds(plan([], 4, p).questions)).toContain(T.cbc); // lab feed silent past due → ask
    expect(taskIds(plan([], 3, p).questions)).toContain(T.booked); // booking feed silent past Day 2
    const feeds = [
      ev({ taskId: T.booked, source: 'appointment_system', day: 1, claim: 'DONE' }),
      ev({ taskId: T.cbc, source: 'lab_system', day: 3, claim: 'DONE' }),
    ];
    expect(taskIds(plan(feeds, 4, p).questions)).not.toContain(T.booked);
    expect(taskIds(plan(feeds, 4, p).questions)).not.toContain(T.cbc);
  });

  it('names medicines the way patients say them, with the written name on a helper line', () => {
    const p = SAMPLE_PATIENTS[0] as Patient; // demo-001
    const tasks = buildCareGraph(p);
    const evaluation = evaluate(p, tasks, [], [], 0);
    const [start, stop] = planQuestions(p, tasks, [], evaluation, 0).questions;
    expect(start).toMatchObject({
      kind: 'MED_START',
      textAr: 'بديت حبة السيولة الجديدة؟',
      helperAr: 'مكتوب على العلبة: إليكويس (أبيكسابان)',
      familyTextAr: 'بدأ أبو محمد حبة السيولة الجديدة؟',
      drugId: 'apixaban',
    });
    expect(stop).toMatchObject({ kind: 'STOPPED_CHECK', textAr: 'وقّفت بلافكس زي ما قال لك الدكتور؟', helperAr: 'مكتوب على العلبة: بلافكس (كلوبيدوقريل)' });
    // no doses in patient questions
    for (const q of [start, stop]) expect(q?.textAr).not.toMatch(/\d|mg/);
  });

  it('only the dose-change question carries the dose, exactly as written in the plan', () => {
    const p = SAMPLE_PATIENTS[2] as Patient; // demo-003 insulin CHANGED
    const tasks = buildCareGraph(p);
    const evaluation = evaluate(p, tasks, [], [], 0);
    const dose = planQuestions(p, tasks, [], evaluation, 0).questions.find((q) => q.kind === 'DOSE_CHECK');
    expect(dose).toMatchObject({ textAr: 'تاخذ إبرة السكر على الجرعة الجديدة اللي في ورقة الخروج؟', doseAsWritten: '14 units at bedtime' });
    expect(dose?.textAr).not.toMatch(/\d/);
  });

  it('uses feminine forms for female patients and third person for family', () => {
    const p = SAMPLE_PATIENTS[3] as Patient; // demo-004 Umm Sarah, furosemide NEW
    const tasks = buildCareGraph(p);
    const evaluation = evaluate(p, tasks, [], [], 0);
    const [first] = planQuestions(p, tasks, [], evaluation, 0).questions;
    expect(first?.textAr).toBe('بديتي حبة المويه الجديدة؟');
    expect(first?.familyTextAr).toBe('بدأت أم سارة حبة المويه الجديدة؟');
  });

  it('baseline is never shorter than the adaptive plan (all samples, all days)', () => {
    for (const p of SAMPLE_PATIENTS) {
      for (let day = 0; day <= 14; day++) {
        const tasks = buildCareGraph(p);
        const evaluation = evaluate(p, tasks, SAMPLE_EVIDENCE, [], day);
        const { questions, baseline } = planQuestions(p, tasks, SAMPLE_EVIDENCE, evaluation, day);
        expect(baseline.length, `${p.id} day ${day}`).toBeGreaterThanOrEqual(questions.length);
      }
    }
  });
});

const patient = makePatient();
const all = buildCareGraph(patient);
const report = (taskId: string, claim: Evidence['claim'], fields: Partial<Evidence> = {}) =>
  ev({ taskId, claim, day: 3, source: 'patient_app', ...fields });
const attempt = (target: string, day: number, evidenceCount: number, answer = false): AuditEntry => ({
  id: `attempt-${target}-${day}`, action: answer ? 'CHECKIN_ANSWER' : 'CHECKIN_PRESENTED', target, day, evidenceCount, at: 't', actor: 'Patient',
});

describe('follow-up eligibility uses the evidence behind the status', () => {
  it.each([T.apixabanCont3, T.wound, T.insulinDose])('pauses confident non-completion once its linked review is open: %s', (id) => {
    const records = [report(id, 'NOT_DONE')];
    const evaluation = evaluate(patient, all, records, [], 4);
    expect(evaluation.gaps.find((g) => g.taskId === id)).toMatchObject({
      type: 'TASK_NOT_COMPLETED', triggerEvidenceIds: [records[0]!.id],
    });
    expect(taskIds(planQuestions(patient, all.filter((t) => t.id === id), records, evaluation, 4).questions)).toEqual([]);
  });

  it('uses the newest eligible occurrence, preserving a prior positive and ignoring future availability', () => {
    const id = T.apixabanCont3;
    const tasks = all.filter((t) => t.id === id);
    const positive = report(id, 'DONE', { day: 3 });
    const oldRecordedLate = report(id, 'NOT_DONE', { day: 2, recordedDay: 4 });
    const changed = report(id, 'NOT_DONE', { day: 5, recordedDay: 6 });
    const evidence = [positive, oldRecordedLate, changed];
    const get = (day: number) => planQuestions(patient, tasks, evidence, evaluate(patient, tasks, evidence, [], day), day);
    expect(taskIds(get(4).questions)).toEqual([]);
    expect(taskIds(get(5).questions)).toEqual([]);
    const review = evaluate(patient, tasks, evidence, [], 6);
    expect(review.assessments.get(id)?.effective).toBe(changed);
    expect(review.gaps[0]).toMatchObject({ type: 'TASK_NOT_COMPLETED', triggerEvidenceIds: [changed.id] });
    expect(taskIds(get(6).questions)).toEqual([]);
  });

  it('keeps earlier reliable medication evidence alongside newer uncertainty and honors its real review', () => {
    const id = T.apixabanCont3;
    const tasks = all.filter((t) => t.id === id);
    const positive = report(id, 'DONE');
    const unsure = report(id, 'UNSURE', { day: 4, confidence: 0.3, candidateDrugIds: ['amlodipine'] });
    const evidence = [positive, unsure];
    const e = evaluate(patient, tasks, evidence, [], 4);
    expect(e.followup.get(id)).toEqual({ observation: unsure, supportedCompletion: false });
    expect(e.gaps[0]).toMatchObject({ type: 'LOW_CONFIDENCE', triggerEvidenceIds: [unsure.id], evidenceIds: [unsure.id, positive.id] });
    expect(taskIds(planQuestions(patient, tasks, evidence, e, 4).questions)).toEqual([]);
    const closed = evaluate(patient, tasks, evidence, [{ gapId: e.gaps[0]!.id, day: 4, action: 'RESOLVED', by: 'Demo', note: 'Called' }], 4);
    expect(closed.taskStatus[id]).toBe('CLOSED');
    expect(taskIds(planQuestions(patient, tasks, evidence, closed, 4).questions)).toEqual([id]);
  });

  it('suppresses explicit OLD_DOSE while its linked review is open, then honors independent clinician completion', () => {
    const id = T.insulinDose;
    const tasks = all.filter((t) => t.id === id);
    const old = report(id, 'OLD_DOSE');
    const e = evaluate(patient, tasks, [old], [], 4);
    expect(e.gaps[0]).toMatchObject({ type: 'WRONG_DOSE', evidenceIds: [old.id] });
    expect(taskIds(planQuestions(patient, tasks, [old], e, 4).questions)).toEqual([]);
    const resolution = { gapId: e.gaps[0]!.id, day: 4, action: 'RESOLVED' as const, by: 'Demo', note: 'Called' };
    const closed = evaluate(patient, tasks, [old], [resolution], 4);
    expect(taskIds(planQuestions(patient, tasks, [old], closed, 4).questions)).toEqual([id]);
    const confirmed = [old, report(id, 'DONE', { source: 'clinician', confirmedByHuman: true, day: 4 })];
    expect(taskIds(planQuestions(patient, tasks, confirmed, evaluate(patient, tasks, confirmed, [resolution], 4), 4).questions)).toEqual([]);
  });

  it.each([
    [T.cbc, 4, [], true],
    [T.cbc, 4, [report(T.cbc, 'DONE', { source: 'lab_system', confidence: 0.4 })], true],
    [T.cbc, 4, [report(T.cbc, 'DONE', { source: 'lab_system' })], false],
    [T.attended, 8, [report(T.attended, 'DONE', { day: 7 })], true],
    [T.attended, 8, [report(T.attended, 'DONE', { source: 'appointment_system', day: 7 }),
      report(T.attended, 'NOT_DONE', { source: 'appointment_system', day: 8, confidence: 0.3 })], false],
    [T.attended, 8, [report(T.attended, 'DONE', { source: 'appointment_system', day: 7 }),
      report(T.attended, 'NOT_DONE', { source: 'appointment_system', day: 8 })], false],
    [T.attended, 8, [report(T.attended, 'DONE', { source: 'appointment_system', day: 7 }),
      report(T.attended, 'NOT_DONE', { day: 8 })], false],
  ] as const)('follows the applicable feed and review for %s on day %s', (id, day, evidence, eligible) => {
    const tasks = all.filter((t) => t.id === id);
    const evaluation = evaluate(patient, tasks, evidence, [], day);
    expect(taskIds(planQuestions(patient, tasks, evidence, evaluation, day).questions)).toEqual(eligible ? [id] : []);
  });
});

describe('deterministic simulated-day scheduling', () => {
  const base = all[0]!;
  const tasks: CareTask[] = Array.from({ length: 6 }, (_, i) => ({
    ...base, id: `${patient.id}/demo-${i}`, risk: i < 5 ? 'high' : 'low',
  }));
  const create = (day: number, audit: AuditEntry[] = [], evidence: Evidence[] = []) =>
    planQuestions(patient, tasks, evidence, evaluate(patient, tasks, evidence, [], day), day, audit);

  it('preserves first-pass high risk and reports the sixth task, then offers it same day or next day', () => {
    const first = create(2);
    expect(taskIds(first.questions)).toEqual(tasks.slice(0, 5).map((t) => t.id));
    expect(first.deferredTaskIds).toEqual([tasks[5]!.id]);
    const shown = taskIds(first.questions).map((id) => attempt(id!, 2, 0));
    expect(taskIds(create(2, shown).questions)).toEqual([tasks[5]!.id]);
    expect(taskIds(create(3, shown).questions)).toEqual([...tasks.slice(0, 4), tasks[5]!].map((t) => t.id));
    expect(taskIds(create(1, shown).questions)).toEqual(tasks.slice(0, 5).map((t) => t.id));
  });

  it('protects five fresh urgent tasks from promotion of a deferred routine task', () => {
    const history = tasks.slice(0, 5).map((t) => attempt(t.id, 1, 0));
    const evidence = tasks.slice(0, 5).map((t) => report(t.id, 'NOT_DONE', { day: 2 }));
    // Before the start grace ends these negatives have no active review.
    const sameDeadline = tasks.map((t) => ({ ...t, deadlineDay: 2 }));
    const evaluation = evaluate(patient, sameDeadline, evidence, [], 2);
    expect(planQuestions(patient, sameDeadline, evidence, evaluation, 2, history).deferredTaskIds).toEqual([tasks[5]!.id]);
  });

  it('uses a meaningful new observation for same-day high-risk eligibility and skips duplicate facts', () => {
    const id = tasks[0]!.id;
    const relevant = [{ ...tasks[0]!, deadlineDay: 2 }];
    const negative = report(id, 'NOT_DONE', { day: 2 });
    const shown = [attempt(id, 2, 0)];
    const get = (records: Evidence[], audit = shown) =>
      taskIds(planQuestions(patient, relevant, records, evaluate(patient, relevant, records, [], 2), 2, audit).questions);
    expect(get([])).toEqual([]);
    expect(get([negative])).toEqual([id]);
    const answered = [attempt(id, 2, 1, true)];
    expect(get([negative, { ...negative, id: 'duplicate' }], answered)).toEqual([]);
  });

  it('waits until the next day after an unrouted uncertain answer and never repeats a routed one', () => {
    const task = all.find((t) => t.id === T.wound)!;
    const evidence = [report(task.id, 'UNSURE', { day: 3, confidence: 0.2 })];
    const e = evaluate(patient, [task], evidence, [], 3);
    const gap = e.gaps[0]!;
    const resolved = [{ gapId: gap.id, day: 3, action: 'RESOLVED' as const, by: 'Demo' }];
    const audit = [attempt(task.id, 3, 1, true)];
    const get = (day: number, close: boolean) => taskIds(planQuestions(patient, [task], evidence,
      evaluate(patient, [task], evidence, close ? resolved : [], day), day, audit).questions);
    expect(get(3, true)).toEqual([]);
    expect(get(4, true)).toEqual([task.id]);
    expect(get(4, false)).toEqual([]);
  });
});
