import { describe, expect, it, vi } from 'vitest';
import { buildCareGraph } from '../../src/domain/careGraph';
import { evaluate } from '../../src/domain/gapEngine';
import { appointmentItems, medStatusFor } from '../../src/domain/patientViews';
import { planQuestions } from '../../src/domain/questionPlanner';
import { lastCheckIn, latestEvidence, verificationSummary } from '../../src/domain/metrics';
import type { Evidence, GapType } from '../../src/domain/types';
import { seedState, type DemoState } from '../../src/state/demoState';
import { demoReducer, type DemoAction } from '../../src/state/reducer';
import { DEMO_STORAGE_KEY, isDemoState, loadState, saveState } from '../../src/state/persistence';
import { ev, makePatient, PID, T } from '../domain/fixtures';

const AT = '2026-11-27T10:00:00Z';
const patient = makePatient();
const tasks = buildCareGraph(patient);
const id = (type: GapType, key: string) => `${PID}:${type}:${key}`;
const stop = id('STOPPED_STILL_TAKEN', T.clopidogrelStop);
const lab = id('LAB_MISSED', T.cbc);
const visit = id('FOLLOWUP_ATTENDANCE_UNCONFIRMED', T.attended);
const now = (s: DemoState) => evaluate(patient, tasks, s.evidence, s.resolutions, s.simulatedDay, s.audit);
const changeDay = (s: DemoState, day: number) => demoReducer(s, { type: 'SET_DAY', day });
const note = { by: 'Demo care team', at: AT, note: 'Existing team follow-up documented.' };
const fresh = (day = 4) => changeDay({ ...seedState(), patients: [patient], evidence: [], resolutions: [], audit: [], simulatedDay: 0 }, day);
const add = (s: DemoState, evidence: Evidence, gapId?: string, basedOnEvidenceId?: string) =>
  demoReducer(s, { type: 'ADD_EVIDENCE', evidence, actor: 'Synthetic source', at: AT, gapId, basedOnEvidenceId });
const record = (taskId: string, claim: Evidence['claim'], day = 4, more: Partial<Evidence> = {}) =>
  ev({ taskId, claim, day, source: 'patient_app', ...more });
const resolve = (s: DemoState, gapId: string, extra: Partial<Extract<DemoAction, { type: 'RESOLVE_GAP' }>> = {}) =>
  demoReducer(s, { type: 'RESOLVE_GAP', gapId, action: 'RESOLVED', disposition: 'ADMINISTRATIVE',
    reasonCode: 'FOLLOW_UP_ARRANGED', ...note, ...extra });
const review = (s: DemoState, gapId: string) => demoReducer(s, {
  type: 'RESOLVE_GAP', gapId, action: 'CALLED', contactOutcome: 'reached', ...note,
});
const intervene = (s: DemoState, gapId: string) => demoReducer(s, { type: 'RESOLVE_GAP', gapId, action: 'INTERVENED', ...note });
const undo = (s: DemoState, gapId: string, resolutionSeq: number) =>
  demoReducer(s, { type: 'UNDO_RESOLUTION', gapId, resolutionSeq, ...note });
const history = (s: DemoState, gapId: string) => s.audit.filter((a) => a.target === gapId && a.observation);
const isAsked = (s: DemoState, taskId: string) => planQuestions(patient, tasks, s.evidence, now(s), s.simulatedDay, s.audit)
  .questions.some((q) => q.taskId === taskId);

describe('Closed Care Loop evidence and disposition', () => {
  it.each([
    [lab, T.cbc, 4],
    [visit, T.attended, 8],
  ] as const)('administratively closes %s without changing patient or clinician verification', (gapId, taskId, day) => {
    const base = fresh(day);
    const state = resolve(base, gapId);
    const result = now(state);
    expect(result.gaps.some((g) => g.id === gapId)).toBe(false);
    expect(result.conditions.has(gapId)).toBe(true);
    expect(result.taskStatus[taskId]).toBe('CLOSED');
    expect(result.followup.get(taskId)?.supportedCompletion).toBe(false);
    expect(appointmentItems(patient, tasks.filter((t) => t.id === taskId), result.taskStatus, day)[0]?.state).toBe('pending');
    expect(verificationSummary(tasks.filter((t) => t.id === taskId), result.taskStatus, day).verified).toBe(0);
    const plan = planQuestions(patient, tasks, state.evidence, result, day, state.audit);
    expect(isAsked(state, taskId) || plan.deferredTaskIds.includes(taskId)).toBe(true);
    expect(state.evidence).toEqual(base.evidence);
  });

  it('validates justification, contact outcome, intervention note and eligible clearance at the reducer boundary', () => {
    const state = add(fresh(), record(T.clopidogrelStop, 'STILL_TAKING'));
    expect(resolve(state, 'missing')).toBe(state);
    expect(resolve(state, stop, { note: ' ' })).toBe(state);
    expect(resolve(state, stop, { reasonCode: undefined })).toBe(state);
    expect(resolve(state, stop, { disposition: 'EVIDENCE_SUPPORTED' })).toBe(state);
    expect(resolve(state, stop, { action: 'CALLED', contactOutcome: undefined })).toBe(state);
    expect(resolve(state, stop, { action: 'INTERVENED', note: '' })).toBe(state);
    const called = review(state, stop);
    const documented = intervene(called, stop);
    expect(now(documented).lifecycle.get(stop)).toMatchObject({
      review: { contactOutcome: 'reached', evidenceIds: [state.evidence[0]!.id] },
      intervention: { note: note.note },
    });
    expect(now(documented).taskStatus[T.clopidogrelStop]).toBe('ESCALATED');
    expect(documented.evidence).toEqual(state.evidence);
  });

  it('retains medication uncertainty after administrative contact and handles TASK_NOT_COMPLETED independently', () => {
    const queued = add(fresh(), record(T.insulinDose, 'NOT_DONE'));
    const gapId = id('TASK_NOT_COMPLETED', T.insulinDose);
    const closed = resolve(review(queued, gapId), gapId);
    expect(now(closed).taskStatus[T.insulinDose]).toBe('CLOSED');
    expect(now(closed).followup.get(T.insulinDose)?.supportedCompletion).toBe(false);
    expect(medStatusFor('insulin-glargine', tasks, now(closed).taskStatus, 4)).toBe('waiting');
    const eligible = add(closed, record(T.insulinDose, 'DONE'));
    expect(now(eligible).taskStatus[T.insulinDose]).toBe('VERIFIED');
    expect(now(eligible).conditions.has(gapId)).toBe(false);
    expect(history(eligible, gapId).map((a) => a.action)).toEqual(['GAP_DETECTED', 'GAP_CONDITION_CLEARED']);
  });

  it('requires a matching system record even after administrative disposition', () => {
    const closed = resolve(fresh(), lab);
    const said = add(closed, record(T.cbc, 'DONE'));
    expect(now(said).taskStatus[T.cbc]).toBe('CLOSED');
    const result = add(said, record(T.cbc, 'DONE', 4, { source: 'lab_system', eventKind: 'LAB_RESULT' }));
    expect(now(result).taskStatus[T.cbc]).toBe('VERIFIED');
    const last = history(result, lab).at(-1)!;
    expect(last).toMatchObject({ action: 'GAP_CONDITION_CLEARED',
      observation: { clearance: { disposition: 'EVIDENCE_SUPPORTED', evidenceIds: [result.evidence.at(-1)!.id] } } });
  });

  it('records evidence-supported resolution separately, then reopens with same-day evidence and no inherited review', () => {
    let state = add(fresh(), record(T.clopidogrelStop, 'STILL_TAKING'));
    state = intervene(review(state, stop), stop);
    const confirmed = record(T.clopidogrelStop, 'STOPPED', 4, { source: 'clinician', confirmedByHuman: true, detail: 'Confirmed report' });
    state = add(state, confirmed, stop);
    expect(now(state).taskStatus[T.clopidogrelStop]).toBe('VERIFIED');
    expect(state.resolutions.at(-1)).toMatchObject({ action: 'CONFIRMED', outcomeEvidenceIds: [confirmed.id] });
    state = resolve(state, stop, { disposition: 'EVIDENCE_SUPPORTED', reasonCode: undefined });
    expect(state.resolutions.at(-1)).toMatchObject({ disposition: 'EVIDENCE_SUPPORTED', outcomeEvidenceIds: [confirmed.id] });
    const again = record(T.clopidogrelStop, 'STILL_TAKING');
    state = add(state, again);
    expect(history(state, stop).map((a) => a.action)).toEqual(['GAP_DETECTED', 'GAP_CONDITION_CLEARED', 'GAP_REOPENED']);
    const result = now(state);
    expect(result.gaps.find((g) => g.id === stop)?.triggerEvidenceIds).toEqual([again.id]);
    expect(result.lifecycle.get(stop)).toMatchObject({ reopened: true, review: undefined, intervention: undefined });
    expect(result.taskStatus[T.clopidogrelStop]).toBe('ESCALATED');
    expect(isAsked(state, T.clopidogrelStop)).toBe(false);
    expect(isDemoState(JSON.parse(JSON.stringify(state)))).toBe(true);
  });

  it('corrects open medication history without manufacturing completion of a task', () => {
    const original = ev({ source: 'family', day: 4, claim: 'TAKING_UNLISTED', drugId: 'paracetamol', reportId: 'report' });
    const gap = id('UNLISTED_MED', 'paracetamol');
    const state = add(fresh(), original);
    const correction = ev({ source: 'clinician', day: 4, claim: 'STOPPED', drugId: 'paracetamol', correctsEvidenceId: original.id,
      confidence: 1, confirmedByHuman: true });
    const corrected = add(state, correction, gap, original.id);
    expect(now(corrected).medication.superseded.has(original.id)).toBe(true);
    expect(now(corrected).taskStatus[T.clopidogrelStop]).not.toBe('VERIFIED');
    expect(history(corrected, gap).at(-1)?.observation?.clearance?.disposition).toBe('REPORT_CORRECTED');
    expect(resolve(corrected, gap, { disposition: 'EVIDENCE_SUPPORTED' })).toBe(corrected);
    const documented = resolve(corrected, gap, { disposition: 'REPORT_CORRECTED', reasonCode: undefined });
    expect(documented.resolutions.at(-1)).toMatchObject({ disposition: 'REPORT_CORRECTED', outcomeEvidenceIds: [correction.id] });
  });
});

describe('Closed Care Loop historical order and targeted Undo', () => {
  it.each([false, true])('renews an identical report after intervention only for a new check-in answer (closed %s)', (closed) => {
    const submit = (s: DemoState, e: Evidence) => demoReducer(s, {
      type: 'RECORD_ANSWER', patientId: PID, target: T.clopidogrelStop, evidence: [e], actor: 'Patient app', at: AT, note: 'Synthetic answer',
    });
    const first = record(T.clopidogrelStop, 'STILL_TAKING');
    let state = intervene(review(submit(fresh(), first), stop), stop);
    if (closed) state = resolve(state, stop);
    expect(submit(state, first)).toBe(state);
    const restated = add(state, { ...first, id: 'unlinked-restatement' });
    expect(history(restated, stop)).toHaveLength(1);
    const second = record(T.clopidogrelStop, 'STILL_TAKING');
    const renewed = submit(restated, second);
    expect(history(renewed, stop).map((row) => row.action)).toEqual(['GAP_DETECTED', closed ? 'GAP_REOPENED' : 'GAP_UPDATED']);
    expect(now(renewed).lifecycle.get(stop)).toMatchObject({ review: undefined, intervention: undefined, disposition: undefined });
    expect(now(renewed).gaps.find((g) => g.id === stop)?.triggerEvidenceIds).toEqual([second.id]);
    expect(isDemoState(JSON.parse(JSON.stringify(renewed)))).toBe(true);
    expect(submit(renewed, second)).toBe(renewed);
  });

  it('keeps a review tied to its evidence revision even when an earlier semantic fingerprint recurs', () => {
    const initial = add(fresh(), record(T.clopidogrelStop, 'STILL_TAKING'));
    const reviewed = review(initial, stop);
    const family = add(reviewed, record(T.clopidogrelStop, 'STILL_TAKING', 4, { source: 'family' }));
    const patientAgain = add(family, record(T.clopidogrelStop, 'STILL_TAKING'));
    expect(now(patientAgain).lifecycle.get(stop)?.fingerprint).toBe(now(reviewed).lifecycle.get(stop)?.fingerprint);
    expect(now(patientAgain).lifecycle.get(stop)?.review).toBeUndefined();
    expect(history(patientAgain, stop).map((a) => a.action)).toEqual(['GAP_DETECTED', 'GAP_UPDATED', 'GAP_UPDATED']);
  });

  it('associates a clinician confirmation with the evidence it produces and supersedes it on a later report', () => {
    const initial = add(fresh(), record(T.clopidogrelStop, 'STILL_TAKING'));
    const clinician = record(T.clopidogrelStop, 'STILL_TAKING', 4, { source: 'clinician', confidence: 1, confirmedByHuman: true });
    expect(add(initial, { ...clinician, confidence: 0.69 }, stop)).toBe(initial);
    const confirmed = add(initial, clinician, stop);
    expect(now(confirmed).lifecycle.get(stop)?.review).toMatchObject({ action: 'CONFIRMED', outcomeEvidenceIds: [clinician.id] });
    const duplicate = add(confirmed, { ...clinician, id: 'same-confirmed-fact' });
    expect(now(duplicate).lifecycle.get(stop)?.review?.outcomeEvidenceIds).toEqual([clinician.id]);
    const newer = add(duplicate, record(T.clopidogrelStop, 'STILL_TAKING', 4, { source: 'family' }));
    expect(now(newer).lifecycle.get(stop)?.review).toBeUndefined();
  });

  it('reopens after material same-day evidence but keeps duplicate and older observations closed', () => {
    const original = record(T.clopidogrelStop, 'STILL_TAKING', 4);
    let state = resolve(review(add(fresh(), original), stop), stop);
    state = add(state, { ...original, id: 'same-fact', source: 'patient_voice', rawText: 'إيه للحين' });
    state = add(state, record(T.clopidogrelStop, 'STOPPED', 2));
    expect(now(state).taskStatus[T.clopidogrelStop]).toBe('CLOSED');
    expect(history(state, stop)).toHaveLength(1);
    state = add(state, record(T.clopidogrelStop, 'STILL_TAKING', 4, { source: 'family' }));
    expect(now(state).lifecycle.get(stop)).toMatchObject({ reopened: true, review: undefined });
    expect(history(state, stop).map((a) => a.action)).toEqual(['GAP_DETECTED', 'GAP_REOPENED']);
    expect(changeDay(state, 4)).toBe(state);
  });

  it('opens independent uncertainty for a weak report and ignores supporting-only changes for missing feeds', () => {
    const state = resolve(resolve(add(fresh(), record(T.clopidogrelStop, 'STILL_TAKING')), stop), lab);
    const reported = add(state, record(T.cbc, 'DONE'));
    expect(now(reported).taskStatus[T.cbc]).toBe('CLOSED');
    const weak = add(reported, record(T.clopidogrelStop, 'STOPPED', 4, { confidence: 0.69 }));
    expect(now(weak).conditions.has(stop)).toBe(true);
    expect(now(weak).gaps.some((g) => g.type === 'LOW_CONFIDENCE' && g.taskId === T.clopidogrelStop)).toBe(true);
    expect(history(weak, stop)).toHaveLength(1);
  });

  it('undoes only one decision after clock, evidence and an unrelated disposition change', () => {
    let state = resolve(add(fresh(), record(T.clopidogrelStop, 'STILL_TAKING')), stop);
    const seq = state.resolutions.at(-1)!.seq!;
    state = changeDay(state, 5);
    state = demoReducer(state, { type: 'RECORD_PRESENTATION', patientId: PID, target: T.wound, actor: 'Patient', at: AT });
    state = demoReducer(state, {
      type: 'RECORD_ANSWER', patientId: PID, target: T.wound, actor: 'Patient', at: AT,
      note: 'Synthetic answer', evidence: [record(T.wound, 'DONE', 5)],
    });
    state = resolve(review(state, lab), lab);
    const before = state;
    expect(before.audit.filter((entry) => entry.target === T.wound).map((entry) => entry.action))
      .toEqual(['CHECKIN_PRESENTED', 'CHECKIN_ANSWER']);
    expect(before.evidence.some((entry) => entry.taskId === T.wound && entry.claim === 'DONE')).toBe(true);
    state = undo(state, stop, seq);
    expect(state.simulatedDay).toBe(5);
    expect(state.evidence).toEqual(before.evidence);
    expect(state.patients).toEqual(before.patients);
    expect(state.audit.slice(0, -1)).toEqual(before.audit);
    expect(state.resolutions.slice(0, -1)).toEqual(before.resolutions);
    expect(now(state).gaps.some((g) => g.id === stop)).toBe(true);
    expect(now(state).gaps.some((g) => g.id === lab)).toBe(false);
    expect(state.audit.at(-1)?.action).toBe('GAP_UNDONE');
    expect(undo(state, stop, seq)).toBe(state);
    expect(isDemoState(JSON.parse(JSON.stringify(state)))).toBe(true);
  });

  it('rejects an obsolete Undo without reversing a newer decision for the same stable gap', () => {
    let state = resolve(add(fresh(), record(T.clopidogrelStop, 'STILL_TAKING')), stop);
    const previous = state.resolutions.at(-1)!.seq!;
    state = changeDay(state, 5);
    state = resolve(add(state, record(T.clopidogrelStop, 'STILL_TAKING', 5)), stop);
    expect(history(state, stop).map((a) => a.action)).toEqual(['GAP_DETECTED', 'GAP_REOPENED']);
    expect(undo(state, stop, previous)).toBe(state);
    expect(now(state).taskStatus[T.clopidogrelStop]).toBe('CLOSED');
  });

  it('preserves eligible verification when undo occurs after the condition disappears', () => {
    let state = resolve(fresh(), lab);
    const seq = state.resolutions.at(-1)!.seq!;
    state = add(state, record(T.cbc, 'DONE', 4, { source: 'lab_system', eventKind: 'LAB_RESULT' }));
    const undone = undo(state, lab, seq);
    expect(now(undone).taskStatus[T.cbc]).toBe('VERIFIED');
    expect(now(undone).conditions.has(lab)).toBe(false);
  });

  it('hides future reviews during rewind and does not duplicate events when revisiting a day', () => {
    let state = add(fresh(), record(T.clopidogrelStop, 'STILL_TAKING'));
    state = review(changeDay(state, 5), stop);
    const previous = state.audit.length;
    const rewind = changeDay(state, 4);
    expect(now(rewind).lifecycle.get(stop)?.review).toBeUndefined();
    expect(changeDay(rewind, 5).audit).toHaveLength(previous);
    const alternate = add(rewind, record(T.clopidogrelStop, 'STOPPED'));
    expect(now(alternate).taskStatus[T.clopidogrelStop]).toBe('VERIFIED');
    expect(alternate.audit.some((a) => a.day === 5 && a.action === 'GAP_CALLED')).toBe(true);
    expect(now(changeDay(alternate, 5)).taskStatus[T.clopidogrelStop]).toBe('VERIFIED');
  });

  it('keeps an older event recorded on a future day out of historical display metrics', () => {
    const state = add(fresh(5), record(T.wound, 'DONE', 3));
    expect(now(changeDay(state, 4)).taskStatus[T.wound]).not.toBe('VERIFIED');
    expect(lastCheckIn(state.evidence, PID, 4)).toBeUndefined();
    expect(latestEvidence(state.evidence, PID, 4)).toEqual([]);
    expect(lastCheckIn(state.evidence, PID, 5)?.id).toBe(state.evidence[0]?.id);
  });

  it('keeps observations and reversals after storage, validates references, and resets deterministically', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value) } });
    try {
      const legacy = { ...fresh(), version: 8, audit: [], resolutions: [{ gapId: lab, day: 4, action: 'RESOLVED', by: 'Legacy' }] };
      values.set('wasl.demo.v8', JSON.stringify(legacy));
      const migrated = loadState();
      expect(migrated.audit).toEqual([]);
      expect(now(migrated).taskStatus[T.cbc]).toBe('CLOSED');
      let state = resolve(fresh(), lab);
      state = undo(state, lab, state.resolutions.at(-1)!.seq!);
      saveState(state);
      expect(loadState()).toEqual(state);
      const broken = { ...state, resolutions: state.resolutions.map((r) => ({ ...r, episodeId: 'unknown' })) };
      expect(isDemoState(broken)).toBe(false);
      expect(isDemoState({ ...state, audit: state.audit.map((a) =>
        a.observation ? { ...a, observation: { ...a.observation, clearance: null } } : a) })).toBe(false);
      values.delete(DEMO_STORAGE_KEY);
      expect(demoReducer(state, { type: 'RESET' })).toEqual(seedState());
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
