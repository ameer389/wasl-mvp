import { describe, expect, it } from 'vitest';
import { buildCareGraph } from '../../src/domain/careGraph';
import { evaluate } from '../../src/domain/gapEngine';
import { MAX_TASK_QUESTIONS, OPEN_MEDS_TEXT, planQuestions } from '../../src/domain/questionPlanner';
import type { Evidence, Patient } from '../../src/domain/types';
import { SAMPLE_EVIDENCE, SAMPLE_PATIENTS } from '../../src/data/samplePatients';
import { ev, makePatient, T } from './fixtures';

function plan(evidence: Evidence[], today: number, patient: Patient = makePatient()) {
  const tasks = buildCareGraph(patient);
  const { taskStatus } = evaluate(patient, tasks, evidence, [], today);
  return planQuestions(patient, tasks, evidence, taskStatus, today);
}

const taskIds = (qs: { taskId?: string }[]) => qs.map((q) => q.taskId).filter(Boolean);

describe('planQuestions', () => {
  it('asks at most 5 task questions, always followed by the open medicines question', () => {
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

  it('never asks about verified tasks', () => {
    const done = ev({ taskId: T.apixabanStart, source: 'patient_app', day: 0, claim: 'DONE' });
    expect(taskIds(plan([done], 0).questions)).not.toContain(T.apixabanStart);
  });

  it('re-asks only uncertain answers (low confidence), not confident ones', () => {
    const unsure = ev({ taskId: T.apixabanStart, source: 'patient_voice', day: 0, claim: 'DONE', confidence: 0.5 });
    const still = ev({ taskId: T.clopidogrelStop, source: 'family', day: 0, claim: 'STILL_TAKING', confidence: 0.9 });
    const ids = taskIds(plan([unsure, still], 0).questions);
    expect(ids).toContain(T.apixabanStart);
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
    const { taskStatus } = evaluate(p, tasks, [], [], 0);
    const [start, stop] = planQuestions(p, tasks, [], taskStatus, 0).questions;
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
    const { taskStatus } = evaluate(p, tasks, [], [], 0);
    const dose = planQuestions(p, tasks, [], taskStatus, 0).questions.find((q) => q.kind === 'DOSE_CHECK');
    expect(dose).toMatchObject({ textAr: 'تاخذ إبرة السكر على الجرعة الجديدة اللي في ورقة الخروج؟', doseAsWritten: '14 units at bedtime' });
    expect(dose?.textAr).not.toMatch(/\d/);
  });

  it('uses feminine forms for female patients and third person for family', () => {
    const p = SAMPLE_PATIENTS[3] as Patient; // demo-004 Umm Sarah, furosemide NEW
    const tasks = buildCareGraph(p);
    const { taskStatus } = evaluate(p, tasks, [], [], 0);
    const [first] = planQuestions(p, tasks, [], taskStatus, 0).questions;
    expect(first?.textAr).toBe('بديتي حبة المويه الجديدة؟');
    expect(first?.familyTextAr).toBe('بدأت أم سارة حبة المويه الجديدة؟');
  });

  it('baseline is never shorter than the adaptive plan (all samples, all days)', () => {
    for (const p of SAMPLE_PATIENTS) {
      for (let day = 0; day <= 14; day++) {
        const tasks = buildCareGraph(p);
        const { taskStatus } = evaluate(p, tasks, SAMPLE_EVIDENCE, [], day);
        const { questions, baseline } = planQuestions(p, tasks, SAMPLE_EVIDENCE, taskStatus, day);
        expect(baseline.length, `${p.id} day ${day}`).toBeGreaterThanOrEqual(questions.length);
      }
    }
  });
});
