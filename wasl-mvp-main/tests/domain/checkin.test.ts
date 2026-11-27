/** Patient check-in (Phase 5): state machine, answer → evidence, phrasing, patient tab view-models. */
import { describe, expect, it } from 'vitest';
import { parseAnswer } from '../../src/domain/arabicParser';
import { buildCareGraph, taskId } from '../../src/domain/careGraph';
import {
  QUICK_CONFIDENCE,
  QUICK_OPTIONS,
  answerAuditNote,
  checkinReducer,
  evidenceForAnswer,
  gapsFromAnswers,
  initialCheckin,
  needsHuman,
  quickParse,
  withKeptMeds,
  type CheckinState,
} from '../../src/domain/checkin';
import { evaluate, VERIFY_THRESHOLD } from '../../src/domain/gapEngine';
import { fitGraphMetrics, layoutCareGraph } from '../../src/domain/graphLayout';
import { echoAr, medNameAr, newAdjective, questionTextAr } from '../../src/domain/patientPhrasing';
import { appointmentItems, medStatusFor, relativeDayAr } from '../../src/domain/patientViews';
import { planQuestions } from '../../src/domain/questionPlanner';
import type { Patient, Question, QuestionKind } from '../../src/domain/types';
import { SAMPLE_EVIDENCE, SAMPLE_PATIENTS } from '../../src/data/samplePatients';
import { seedState } from '../../src/state/demoState';
import { demoReducer } from '../../src/state/reducer';

const P1 = SAMPLE_PATIENTS[0] as Patient; // Abu Mohammed: apixaban NEW, clopidogrel STOP
const P5 = SAMPLE_PATIENTS[4] as Patient; // Abu Abdullah: never answers

function questionsFor(p: Patient, day: number): Question[] {
  const tasks = buildCareGraph(p);
  const evaluation = evaluate(p, tasks, SAMPLE_EVIDENCE, [], day);
  return planQuestions(p, tasks, SAMPLE_EVIDENCE, evaluation, day).questions;
}

const parsed = (text: string, kind: QuestionKind, drugId?: string) => parseAnswer(text, { questionKind: kind, drugId });

describe('check-in state machine', () => {
  const start = (): CheckinState => checkinReducer(initialCheckin(2), { type: 'START' });

  it('intro → question → (voice) listening → understanding → echo → saved → next → done', () => {
    let s = start();
    expect(s).toMatchObject({ phase: 'question', index: 0 });
    s = checkinReducer(s, { type: 'LISTEN_START' });
    expect(s.phase).toBe('listening');
    s = checkinReducer(s, { type: 'LISTEN_INTERIM', text: 'ايه' });
    expect(s.transcript).toBe('ايه');
    s = checkinReducer(s, { type: 'LISTEN_FINAL', text: 'ايه بديتها', asrConfidence: 0.8 });
    expect(s).toMatchObject({ phase: 'understanding', answer: { mode: 'voice', asrConfidence: 0.8 } });
    s = checkinReducer(s, { type: 'PARSED', parse: parsed('ايه بديتها', 'MED_START') });
    expect(s.phase).toBe('echo');
    s = checkinReducer(s, { type: 'SAVED', record: { questionId: 'q1', summaryAr: 'x', evidenceIds: ['e'], needsHuman: false } });
    expect(s).toMatchObject({ phase: 'saved', records: [{ questionId: 'q1' }] });
    s = checkinReducer(s, { type: 'NEXT' });
    expect(s).toMatchObject({ phase: 'question', index: 1, answer: undefined });
    s = checkinReducer(s, { type: 'SAVED', record: { questionId: 'q2', summaryAr: 'y', evidenceIds: [], needsHuman: false } }); // quick button
    s = checkinReducer(s, { type: 'NEXT' });
    expect(s.phase).toBe('done');
    expect(s.records).toHaveLength(2);
  });

  it('typed answers go straight to understanding; empty text is ignored', () => {
    let s = checkinReducer(start(), { type: 'SUBMIT_TEXT', text: '   ' });
    expect(s.phase).toBe('question');
    s = checkinReducer(s, { type: 'SUBMIT_TEXT', text: ' لا ما بديتها ' });
    expect(s).toMatchObject({ phase: 'understanding', answer: { mode: 'text', text: 'لا ما بديتها' } });
  });

  it('voice problems return to the question with an error; buttons stay usable', () => {
    let s = checkinReducer(checkinReducer(start(), { type: 'LISTEN_START' }), { type: 'LISTEN_ERROR', error: 'permission_denied' });
    expect(s).toMatchObject({ phase: 'question', error: 'permission_denied' });
    s = checkinReducer(checkinReducer(s, { type: 'LISTEN_START' }), { type: 'LISTEN_FINAL', text: '' });
    expect(s).toMatchObject({ phase: 'question', error: 'no_speech' });
    s = checkinReducer(s, { type: 'SAVED', record: { questionId: 'q1', summaryAr: '', evidenceIds: [], needsHuman: false } });
    expect(s.phase).toBe('saved');
  });

  it('RETRY from echo clears the answer; invalid events are ignored', () => {
    let s = checkinReducer(start(), { type: 'SUBMIT_TEXT', text: 'مدري' });
    s = checkinReducer(s, { type: 'PARSED', parse: parsed('مدري', 'MED_START') });
    s = checkinReducer(s, { type: 'RETRY' });
    expect(s).toMatchObject({ phase: 'question', answer: undefined });
    expect(checkinReducer(s, { type: 'NEXT' })).toBe(s);
    expect(checkinReducer(s, { type: 'PARSED', parse: parsed('ايه', 'MED_START') })).toBe(s);
    expect(checkinReducer(initialCheckin(0), { type: 'START' }).phase).toBe('done');
  });

  it('OPEN_MEDS chips can be removed before saving', () => {
    let s = checkinReducer(start(), { type: 'SUBMIT_TEXT', text: 'اخذ بنادول وحبة المعده' });
    const parse = parsed('اخذ بنادول وحبة المعده', 'OPEN_MEDS');
    s = checkinReducer(s, { type: 'PARSED', parse });
    expect(s.answer?.keptMeds).toEqual(['paracetamol']);
    expect(s.answer?.keptAmbiguous).toHaveLength(1);
    s = checkinReducer(s, { type: 'REMOVE_MED', mention: s.answer?.keptAmbiguous[0] });
    expect(s.answer?.keptAmbiguous).toEqual([]);
    const kept = withKeptMeds(parse, s.answer!.keptMeds, s.answer!.keptAmbiguous);
    expect(kept).toMatchObject({ meds: ['paracetamol'], ambiguousMeds: [] });
  });
});

describe('answer → evidence', () => {
  const [startQ, stopQ] = questionsFor(P1, 0);
  const base = { patientId: P1.id, day: 2, idPrefix: 'a', family: false };

  it('quick buttons map to the right claim for every kind, at confidence 0.95', () => {
    const expected: Record<QuestionKind, string[]> = {
      MED_START: ['DONE', 'NOT_DONE', 'UNSURE'],
      MED_CONTINUE: ['DONE', 'NOT_DONE', 'UNSURE'],
      YES_NO: ['DONE', 'NOT_DONE', 'UNSURE'],
      STOPPED_CHECK: ['STOPPED', 'STILL_TAKING', 'UNSURE'],
      DOSE_CHECK: ['DONE', 'OLD_DOSE', 'UNSURE'],
      OPEN_MEDS: [],
    };
    for (const kind of Object.keys(QUICK_OPTIONS) as QuestionKind[]) {
      const q = { ...startQ!, kind, taskId: kind === 'OPEN_MEDS' ? undefined : startQ!.taskId };
      const claims = QUICK_OPTIONS[kind].flatMap((o) =>
        evidenceForAnswer({ ...base, question: q, parse: quickParse(o), rawText: o.labelAr, mode: 'button' }).map((e) => e.claim),
      );
      expect(claims, kind).toEqual(expected[kind]);
    }
    const [yes] = evidenceForAnswer({ ...base, question: startQ!, parse: quickParse(QUICK_OPTIONS.MED_START[0]!), rawText: 'إيه', mode: 'button' });
    expect(yes).toMatchObject({ source: 'patient_app', confidence: QUICK_CONFIDENCE, rawText: 'إيه', taskId: startQ!.taskId, day: 2 });
  });

  it('"not sure" on a button is never trusted (routes to a human)', () => {
    const [e] = evidenceForAnswer({ ...base, question: stopQ!, parse: quickParse(QUICK_OPTIONS.STOPPED_CHECK[2]!), rawText: 'مو متأكد', mode: 'button' });
    expect(e?.claim).toBe('UNSURE');
    expect(e!.confidence).toBeLessThan(VERIFY_THRESHOLD);
  });

  it('voice answers keep raw text and ASR-combined confidence; family mode is recorded as family', () => {
    const parse = parseAnswer('لا للحين نعطيه البلافكس', { questionKind: 'STOPPED_CHECK', drugId: 'clopidogrel', asrConfidence: 0.9 });
    const [voice] = evidenceForAnswer({ ...base, question: stopQ!, parse, rawText: 'لا للحين نعطيه البلافكس', mode: 'voice' });
    expect(voice).toMatchObject({ source: 'patient_voice', claim: 'STILL_TAKING', rawText: 'لا للحين نعطيه البلافكس' });
    expect(voice!.confidence).toBeCloseTo(parse.confidence, 5);
    const [fam] = evidenceForAnswer({ ...base, family: true, question: stopQ!, parse, rawText: 'x', mode: 'voice' });
    expect(fam?.source).toBe('family');
  });

  it('low-confidence "save anyway" keeps its low confidence and the engine flags LOW_CONFIDENCE', () => {
    const parse = parsed('امم يعني', 'MED_START', 'apixaban');
    expect(needsHuman(parse)).toBe(true);
    const evidence = evidenceForAnswer({ ...base, question: questionsFor(P5, 4)[0]!, patientId: P5.id, day: 4, parse, rawText: 'امم يعني', mode: 'text' });
    expect(evidence[0]!.confidence).toBeLessThan(VERIFY_THRESHOLD);
    const { gaps } = evaluate(P5, buildCareGraph(P5), [...SAMPLE_EVIDENCE, ...evidence], [], 4);
    expect(gaps.some((g) => g.type === 'LOW_CONFIDENCE' && g.taskId === evidence[0]!.taskId)).toBe(true);
  });

  it('OPEN_MEDS: one TAKING_UNLISTED per kept chip; unknown names stay free text; "none" saves nothing', () => {
    const open = questionsFor(P1, 4).at(-1)!;
    const parse = parsed('اخذ بنادول وحبة المعده', 'OPEN_MEDS');
    const ev = evidenceForAnswer({ ...base, question: open, parse, rawText: 'اخذ بنادول وحبة المعده', mode: 'text' });
    expect(ev.map((e) => [e.claim, e.drugId ?? null, e.taskId ?? null])).toEqual([
      ['TAKING_UNLISTED', 'paracetamol', null],
      ['UNSURE', null, null],
    ]);
    expect(ev[1]?.detail).toContain('Omeprazole');
    const none = evidenceForAnswer({ ...base, question: open, parse: quickParse(QUICK_OPTIONS.OPEN_MEDS[0]!), rawText: 'لا', mode: 'button' });
    expect(none).toEqual([]);
    expect(answerAuditNote(none, 'button', false)).toBe('Patient app: no other medicines');
  });

  it('finds the clinician-routed gaps an answer created (for the done screen)', () => {
    const q = questionsFor(P5, 4)[0]!; // amlodipine start
    const ev = evidenceForAnswer({ ...base, patientId: P5.id, day: 4, question: q, parse: parsed('لا والله ما بديتها', 'MED_START'), rawText: 'لا', mode: 'text' });
    const { gaps } = evaluate(P5, buildCareGraph(P5), [...SAMPLE_EVIDENCE, ...ev], [], 4);
    const touched = gapsFromAnswers(gaps, ev.map((e) => e.id), [q.taskId!]);
    expect(touched.map((g) => g.type)).toEqual(['NOT_STARTED']);
  });
});

describe('patient phrasing', () => {
  it('informal name first, gendered adjective, never a dose', () => {
    expect(medNameAr('apixaban')).toBe('حبة السيولة');
    expect(newAdjective('حبة السيولة')).toBe('الجديدة');
    expect(newAdjective('المسكن')).toBe('الجديد');
    const start = buildCareGraph(P1).find((t) => t.type === 'MED_START')!;
    expect(questionTextAr(start, P1, 'patient')).toBe('بديت حبة السيولة الجديدة؟');
    expect(questionTextAr(start, P1, 'family')).toBe('بدأ أبو محمد حبة السيولة الجديدة؟');
  });

  it('echo restates without advice, in the right person', () => {
    const p = P1;
    expect(echoAr('STOPPED_CHECK', 'STILL_TAKING', 'بلافكس', p, 'patient')).toBe('للحين تاخذ بلافكس');
    expect(echoAr('STOPPED_CHECK', 'STILL_TAKING', 'بلافكس', p, 'family')).toBe('أبو محمد للحين ياخذ بلافكس');
    expect(echoAr('MED_START', 'NO', 'حبة السيولة', p, 'patient')).toBe('ما بديت حبة السيولة للحين');
    expect(echoAr('OPEN_MEDS', 'NONE', undefined, SAMPLE_PATIENTS[1]!, 'patient')).toBe('ما تاخذين غير أدوية الدكتور');
    // Imperatives / obligations as standalone words («تاخذ» = you take, descriptive, is fine).
    const advice = /(^|\s)(لازم|خذ|خذه|خذها|اوقف|وقّف|زيد|نقّص|غيّر)(\s|$)/;
    for (const kind of Object.keys(QUICK_OPTIONS) as QuestionKind[]) {
      for (const o of QUICK_OPTIONS[kind]) expect(echoAr(kind, o.intent, 'الدواء', p, 'patient')).not.toMatch(advice);
    }
  });
});

describe('patient tab view-models', () => {
  const tasks = buildCareGraph(P1);
  const { taskStatus } = evaluate(P1, tasks, SAMPLE_EVIDENCE, [], 4);

  it('medicine status: team following up / confirmed / waiting', () => {
    expect(medStatusFor('clopidogrel', tasks, taskStatus, 4)).toBe('team'); // STOPPED_STILL_TAKEN
    expect(medStatusFor('aspirin', tasks, taskStatus, 4)).toBe('confirmed');
    const day1 = evaluate(P1, tasks, SAMPLE_EVIDENCE, [], 1).taskStatus;
    expect(medStatusFor('bisoprolol', tasks, day1, 1)).toBe('waiting'); // continue check not due, not answered yet
  });

  it('relative Arabic days', () => {
    expect(relativeDayAr(4, 4)).toBe('اليوم');
    expect(relativeDayAr(5, 4)).toBe('بكرة');
    expect(relativeDayAr(6, 4)).toBe('بعد يومين');
    expect(relativeDayAr(9, 4)).toBe('بعد ٥ أيام');
    expect(relativeDayAr(16, 4)).toBe('بعد ١٢ يوم');
    expect(relativeDayAr(2, 4)).toBe('فات موعده');
  });

  it('appointments come from the feeds, ordered by day', () => {
    const items = appointmentItems(P1, tasks, taskStatus, 4);
    expect(items.map((i) => [i.kind, i.state])).toEqual([
      ['book', 'done'],
      ['lab', 'done'],
      ['visit', 'pending'],
    ]);
    expect(items[2]?.whenAr).toBe('بعد ٣ أيام');
  });
});

describe('store: check-in answers', () => {
  it('RECORD_ANSWER adds all evidence with exactly one audit entry; COMPLETE_CHECKIN is audited', () => {
    const ev = [
      { id: 'x1', patientId: 'demo-001', source: 'patient_app' as const, day: 4, claim: 'TAKING_UNLISTED' as const, drugId: 'paracetamol', confidence: 0.9, confirmedByHuman: false },
      { id: 'x2', patientId: 'demo-001', source: 'patient_app' as const, day: 4, claim: 'TAKING_UNLISTED' as const, confidence: 0.9, confirmedByHuman: false },
    ];
    let s = seedState();
    const before = s.audit.length;
    s = demoReducer(s, { type: 'RECORD_ANSWER', patientId: 'demo-001', evidence: ev, actor: 'Patient app', target: 'demo-001', note: 'n', at: 't' });
    expect(s.evidence.slice(-2).map((e) => e.id)).toEqual(['x1', 'x2']);
    expect(s.audit.slice(before).filter((entry) => entry.action === 'CHECKIN_ANSWER'))
      .toEqual([expect.objectContaining({ target: 'demo-001' })]);
    expect(s.audit.slice(before).some((entry) => entry.action === 'GAP_DETECTED')).toBe(true);
    s = demoReducer(s, { type: 'COMPLETE_CHECKIN', patientId: 'demo-001', actor: 'Patient app', note: '3 answers', at: 't' });
    expect(s.audit.at(-1)).toMatchObject({ action: 'CHECKIN_COMPLETED', day: s.simulatedDay });
  });
});

describe('care graph fit mode', () => {
  it('compresses Day 0–14 into the container width', () => {
    const tasks = buildCareGraph(P1);
    const m = fitGraphMetrics(tasks, 992);
    expect(layoutCareGraph(tasks, m).width).toBeLessThanOrEqual(992);
    expect(fitGraphMetrics(tasks, 300).dayWidth).toBe(40); // floor
    expect(taskId('a', 'MED_START', 'b', 1)).toBe('a/MED_START/b@d1');
  });

  it('fits a Day 30 graph on desktop and keeps its last task in the scrollable layout', () => {
    const task = { ...buildCareGraph(P1)[0]!, deadlineDay: 30 };
    const layout = layoutCareGraph([task], fitGraphMetrics([task], 992));
    expect(layout.lastDay).toBe(30);
    expect(layout.width).toBeLessThanOrEqual(992);
    expect(layout.nodes[0]!.x + layout.nodes[0]!.width).toBeLessThan(layout.width);
    expect(layoutCareGraph([task]).width).toBeGreaterThan(layout.width);
  });
});
