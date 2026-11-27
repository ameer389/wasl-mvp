import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_PATIENTS } from '../../src/data/samplePatients';
import { seedState, type DemoState } from '../../src/state/demoState';
import { demoReducer } from '../../src/state/reducer';
import { DEMO_STORAGE_KEY, isDemoState, loadState, saveState } from '../../src/state/persistence';
import { buildAllTasks, clinicianGaps, escalationsNow, evaluateAll, planAll, simulationHorizon } from '../../src/state/selectors';
import { formToPatient, sampleForm } from '../../src/domain/planForm';
import { isOpenMedicationReport, reconcileMedications } from '../../src/domain/medicationEvidence';
import { parseAnswer } from '../../src/domain/arabicParser';
import { evidenceForAnswer, openMedsOutcome, withKeptMeds } from '../../src/domain/checkin';
import type { Evidence } from '../../src/domain/types';

const AT = '2026-11-13T00:00:00.000Z';

describe('demo store reducer', () => {
  it('requires an explicit event for a new feed record and preserves typed and legacy evidence across v7 migration', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    try {
      values.set('wasl.demo.v7', JSON.stringify({ ...seedState(), version: 7 }));
      const migrated = loadState();
      expect(migrated).toEqual(seedState());
      const legacy = migrated.evidence.find((e) => e.source === 'lab_system')!;
      expect(legacy.eventKind).toBeUndefined();
      const next = { ...legacy, id: 'typed-feed', day: 4 };
      const add = (evidence: Evidence) => demoReducer(migrated, { type: 'ADD_EVIDENCE', evidence, actor: 'Lab system', at: AT });
      expect(add(next)).toBe(migrated);
      const state = add({ ...next, eventKind: 'LAB_RESULT' });
      expect(state.evidence.at(-1)).toMatchObject({ id: 'typed-feed', eventKind: 'LAB_RESULT', recordedDay: 4 });
      saveState(state);
      expect(loadState()).toEqual(state);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the Day 14 demo window with one extra day for the seeded Day 14 visit', () => {
    expect(simulationHorizon(seedState().patients)).toBe(15);
    expect(demoReducer(seedState(), { type: 'SET_DAY', day: 99 }).simulatedDay).toBe(15);
    expect(demoReducer(seedState(), { type: 'SET_DAY', day: -3 }).simulatedDay).toBe(0);
    expect(demoReducer(seedState(), { type: 'SET_DAY', day: Infinity }).simulatedDay).toBe(4);
  });

  it('adds evidence with an audit entry', () => {
    const s = demoReducer(seedState(), {
      type: 'ADD_EVIDENCE',
      actor: 'Patient app',
      at: AT,
      evidence: { id: 'x', patientId: 'demo-005', source: 'patient_app', day: 4, claim: 'DONE', confidence: 1, confirmedByHuman: false },
    });
    expect(s.evidence.at(-1)?.id).toBe('x');
    expect(s.audit.at(-1)).toMatchObject({ action: 'EVIDENCE_ADDED', actor: 'Patient app' });
  });

  it('adds a patient once (with audit) and reset restores the seed', () => {
    const extra = structuredClone(SAMPLE_PATIENTS[0]!);
    extra.id = extra.plan.patientId = 'demo-new';
    let s = demoReducer(seedState(), { type: 'ADD_PATIENT', patient: extra, by: 'Dr Test', at: AT });
    s = demoReducer(s, { type: 'ADD_PATIENT', patient: extra, by: 'Dr Test', at: AT });
    expect(s.patients.filter((p) => p.id === 'demo-new')).toHaveLength(1);
    expect(s.audit.find((entry) => entry.action === 'PATIENT_ADDED' && entry.target === 'demo-new')).toBeDefined();
    expect(demoReducer(s, { type: 'RESET' })).toEqual(seedState());
  });

  it('reaches Day 30 and both grace boundaries for a patient added at the clock limit', () => {
    const seed = seedState();
    const atLimit = demoReducer(seed, { type: 'SET_DAY', day: 99 });
    const f = sampleForm();
    f.labs[0]!.dueDay = '30';
    f.followUps[0]!.visitDay = '30';
    f.woundCheckDay = '30';
    const patient = formToPatient(f, 'later', atLimit.simulatedDay);
    const state = demoReducer(atLimit, { type: 'ADD_PATIENT', patient, by: 'dr', at: AT });
    const tasks = buildAllTasks(state.patients);
    const setDay = (day: number) => demoReducer(state, { type: 'SET_DAY', day }).simulatedDay;
    const gapsAt = (day: number) => evaluateAll(state.patients, tasks, [], [], setDay(day)).gapsByPatient.later!;
    const wound = tasks.later!.find((t) => t.type === 'WOUND_CHECK')!;
    expect(setDay(99)).toBe(47);
    expect(gapsAt(14)).toEqual([]);
    expect(gapsAt(45).some((g) => g.type === 'LAB_MISSED')).toBe(false);
    expect(gapsAt(46).some((g) => g.type === 'LAB_MISSED')).toBe(true);
    expect(gapsAt(46).some((g) => g.taskId === wound.id)).toBe(false);
    expect(gapsAt(47).find((g) => g.taskId === wound.id)?.type).toBe('NO_RESPONSE');
    expect(demoReducer(state, { type: 'RESET' })).toEqual(seed);
  });

  it('rejects invalid saved plans before they can enter the active store', () => {
    const original = () => formToPatient(sampleForm(), 'new');
    const invalidPlans = [
      (p: ReturnType<typeof original>) => { p.plan.patientId = 'other'; },
      (p: ReturnType<typeof original>) => { p.plan.meds[0]!.drugId = 'unknown'; },
      (p: ReturnType<typeof original>) => { p.plan.meds.push(p.plan.meds[0]!); },
      (p: ReturnType<typeof original>) => { p.plan.labs.push(p.plan.labs[0]!); },
      (p: ReturnType<typeof original>) => { p.plan.followUps.push(p.plan.followUps[0]!); },
      (p: ReturnType<typeof original>) => { p.plan.labs[0]!.linkedDrugId = 'digoxin'; },
      (p: ReturnType<typeof original>) => { p.plan.labs[0]!.dueDay = -1; },
      (p: ReturnType<typeof original>) => { p.plan.meds[0]!.treatmentEndDay = 31; },
      (p: ReturnType<typeof original>) => { p.plan.hospital = ' '; },
      (p: ReturnType<typeof original>) => { p.dischargeDay = NaN; },
    ];
    const state = seedState();
    for (const corrupt of invalidPlans) {
      const patient = original();
      corrupt(patient);
      expect(demoReducer(state, { type: 'ADD_PATIENT', patient, by: 'dr', at: AT })).toBe(state);
    }
  });

  it('reloads valid state and falls back safely on invalid state', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    try {
      let state = demoReducer(seedState(), { type: 'SET_DAY', day: 15 });
      const patient = formToPatient(sampleForm(), 'p-late', 15);
      state = demoReducer(state, { type: 'ADD_PATIENT', patient, by: 'dr', at: AT });
      state = demoReducer(state, { type: 'SET_DAY', day: 23 });
      saveState(state);
      expect(loadState()).toEqual(state);
      const invalid = [
        { ...state, patients: [...state.patients, patient] },
        { ...state, patients: [null] },
        { ...state, simulatedDay: Number.MAX_SAFE_INTEGER },
        { ...state, evidence: [null] },
        { ...state, tour: { step: 99, active: true } },
        { ...state, patients: [{ ...patient, plan: { ...patient.plan, meds: [{ ...patient.plan.meds[0], drugId: 'invalid' }] } }] },
      ];
      for (const saved of invalid) {
        values.set(DEMO_STORAGE_KEY, JSON.stringify(saved));
        expect(loadState()).toEqual(seedState());
      }
      values.set(DEMO_STORAGE_KEY, '{');
      expect(loadState()).toEqual(seedState());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('preserves valid Phase 02 state and persists structured corrections in recording order', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    try {
      const seed = seedState();
      values.set('wasl.demo.v4', JSON.stringify({ ...seed, version: 4, simulatedDay: 5 }));
      let state = loadState();
      expect(state).toEqual({ ...seed, simulatedDay: 5 });
      const report: Evidence = {
        id: 'report-1', reportId: 'answer-1', patientId: 'demo-001', source: 'family',
        day: 3, claim: 'TAKING_UNLISTED', drugId: 'omeprazole', confidence: 0.9, confirmedByHuman: false,
      };
      const add = (evidence: Evidence) => demoReducer(state, { type: 'ADD_EVIDENCE', evidence, actor: 'Demo', at: AT });
      state = add(report);
      state = demoReducer(state, { type: 'SET_DAY', day: 6 });
      const correction: Evidence = {
        ...report, id: 'review-1', source: 'clinician', confidence: 1, confirmedByHuman: true,
        claim: 'STOPPED', correctsEvidenceId: report.id,
      };
      expect(add({ ...correction, correctsEvidenceId: 'missing' })).toBe(state);
      expect(add({ ...correction, candidateDrugIds: ['invalid'] })).toBe(state);
      state = add(correction);
      saveState(state);
      const restored = loadState();
      const p = restored.patients[0]!;
      const assessment = (day: number) => reconcileMedications(p, buildAllTasks([p])[p.id]!, restored.evidence, day).open.get('drug:omeprazole');
      expect(restored.evidence.slice(-2).map((e) => [e.id, e.day, e.recordedDay])).toEqual([
        ['report-1', 3, 5], ['review-1', 3, 6],
      ]);
      expect(restored.audit.find((entry) => entry.note?.includes('corrects report-1'))).toBeDefined();
      expect(assessment(4)).toBeUndefined();
      expect(assessment(5)?.effective?.id).toBe('report-1');
      expect(assessment(6)).toMatchObject({ effective: { id: 'review-1' }, history: [{ id: 'report-1' }, { id: 'review-1' }] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('seed is a fresh copy every time (no shared mutable references)', () => {
    const a = seedState();
    a.patients[0]!.nameEn = 'changed';
    expect(seedState().patients[0]!.nameEn).toBe('Abu Mohammed');
  });

  it('resolving a gap through the store removes it from the open list', () => {
    let s = seedState();
    const tasks = buildAllTasks(s.patients);
    const before = evaluateAll(s.patients, tasks, s.evidence, s.resolutions, s.simulatedDay);
    const top = before.gaps[0]!;
    s = demoReducer(s, { type: 'RESOLVE_GAP', gapId: top.id, action: 'RESOLVED', by: 'Dr Test', at: AT,
      disposition: 'ADMINISTRATIVE', reasonCode: 'FOLLOW_UP_ARRANGED', note: 'Follow-up documented' });
    const after = evaluateAll(s.patients, tasks, s.evidence, s.resolutions, s.simulatedDay, s.audit);
    expect(after.gaps.map((g) => g.id)).not.toContain(top.id);
    expect(after.gaps).toHaveLength(before.gaps.length - 1);
  });

  it('selectors: clinician gaps and escalations at the seed day', () => {
    const s = seedState();
    const { gaps } = evaluateAll(s.patients, buildAllTasks(s.patients), s.evidence, s.resolutions, s.simulatedDay);
    expect(clinicianGaps(gaps)).toHaveLength(7);
    expect(escalationsNow(gaps)).toHaveLength(4);
  });
});

describe('check-in attempt history and OPEN_MEDS', () => {
  const patientId = 'demo-005';
  const currentPlan = (state: DemoState, id = patientId) => {
    const tasks = buildAllTasks(state.patients);
    const evaluation = evaluateAll(state.patients, tasks, state.evidence, state.resolutions, state.simulatedDay);
    return planAll(state.patients, tasks, state.evidence, evaluation, state.simulatedDay, state.audit)[id];
  };
  const open = (state: DemoState) => currentPlan(state)?.questions.find((q) => q.kind === 'OPEN_MEDS');
  const present = (state: DemoState, target: string, id = patientId) =>
    demoReducer(state, { type: 'RECORD_PRESENTATION', patientId: id, target, actor: 'Patient', at: AT });
  const setDay = (state: DemoState, day: number) => demoReducer(state, { type: 'SET_DAY', day });
  const saveOpen = (state: DemoState, rawText: string, kept?: string[]) => {
    const question = open(state)!;
    const parsed = parseAnswer(rawText, { questionKind: 'OPEN_MEDS' });
    const parse = kept ? withKeptMeds(parsed, kept, []) : parsed;
    const evidence = evidenceForAnswer({
      question, parse, rawText, mode: 'text', family: false, patientId,
      day: state.simulatedDay, idPrefix: `open-${state.audit.length}`,
    });
    return demoReducer(state, {
      type: 'RECORD_ANSWER', patientId, target: patientId, actor: 'Patient', at: AT, evidence,
      note: '', openMedsOutcome: openMedsOutcome(parse, evidence),
    });
  };

  it('offers one same-day retry after an unanswered open question without recording NONE', () => {
    const initial = seedState();
    const shown = present(initial, patientId);
    expect(open(shown)).toBeDefined();
    expect(shown.evidence).toEqual(initial.evidence);
    expect(shown.audit.slice(initial.audit.length)).toEqual([
      expect.objectContaining({ action: 'CHECKIN_PRESENTED', target: patientId }),
    ]);
    const abandonedTwice = present(shown, patientId);
    expect(open(abandonedTwice)).toBeUndefined();
    expect(open(setDay(abandonedTwice, 5))).toBeDefined();
    expect(open(setDay(abandonedTwice, 3))).toBeDefined();
    const answered = saveOpen(shown, 'لا');
    expect(open(answered)).toBeUndefined();
    expect(answered.audit.at(-1)?.openMedsOutcome).toBe('NONE');
  });

  it('accepts an anchored voice answer only once, on the same day and presentation', () => {
    const shown = present(seedState(), patientId);
    const presentation = shown.audit.at(-1)!;
    const action = { type: 'RECORD_ANSWER' as const, patientId, target: patientId, actor: 'Patient',
      at: AT, evidence: [], note: 'Patient confirmed no other medicines', openMedsOutcome: 'NONE' as const, presentation };
    const saved = demoReducer(shown, action);
    expect(saved.audit.at(-1)?.action).toBe('CHECKIN_ANSWER');
    expect(saved.audit).toHaveLength(shown.audit.length + 1);
    expect(demoReducer(saved, action)).toBe(saved);
    for (const stale of [setDay(shown, 5), present(shown, patientId), seedState()]) {
      expect(demoReducer(stale, action)).toBe(stale);
    }
    expect(isDemoState(JSON.parse(JSON.stringify(saved)))).toBe(true);
  });

  it.each([
    ['لا', undefined, 'NONE', []],
    ['الحين آخذ بنادول', undefined, 'REPORTED', ['paracetamol']],
    ['آخذ حبة الضغط', undefined, 'UNCERTAIN', [undefined]],
    ['آخذ حبوب ثانية ما أعرف اسمها', undefined, 'UNKNOWN_MEDICINE', [undefined]],
    ['آخذ بلافكس وبنادول', ['paracetamol'], 'REPORTED', ['paracetamol']],
    ['آخذ بنادول', [], 'DISCARDED', []],
  ] as const)('preserves the open report outcome for %s', (text, keep, expected, drugs) => {
    const state = seedState();
    expect(open(state)).toBeDefined();
    const answered = saveOpen(state, text, keep ? [...keep] : undefined);
    expect(answered.audit.slice(state.audit.length).filter((entry) => entry.action === 'CHECKIN_ANSWER')).toEqual([
      expect.objectContaining({ action: 'CHECKIN_ANSWER', openMedsOutcome: expected, target: patientId }),
    ]);
    const records = answered.evidence.slice(state.evidence.length);
    expect(records.map((e) => e.drugId)).toEqual(drugs);
    expect(records.every(isOpenMedicationReport)).toBe(true);
    if (expected === 'UNCERTAIN') expect(records[0]).toMatchObject({ claim: 'UNSURE', candidateDrugIds: expect.any(Array) });
    expect(open(answered)).toBeUndefined();
    expect(open(setDay(answered, 5))).toBeDefined();
    expect(open(setDay(answered, 3))).toBeDefined();
  });

  it('preserves a report and a later correction when the patient subsequently answers NONE', () => {
    let state = saveOpen(seedState(), 'آخذ بنادول');
    const original = state.evidence.at(-1)!;
    state = setDay(state, 5);
    state = demoReducer(state, {
      type: 'ADD_EVIDENCE', actor: 'Clinician', at: AT,
      evidence: { ...original, id: 'open-correction', correctsEvidenceId: original.id, source: 'clinician', claim: 'STOPPED', confirmedByHuman: true, confidence: 1 },
    });
    const after = saveOpen(state, 'لا');
    const patient = after.patients.find((p) => p.id === patientId)!;
    const reconciled = reconcileMedications(patient, [], after.evidence, 5);
    expect(reconciled.open.get('drug:paracetamol')).toMatchObject({
      effective: { id: 'open-correction' }, history: [{ id: original.id }, { id: 'open-correction' }],
    });
    expect(after.audit.at(-1)).toMatchObject({ openMedsOutcome: 'NONE' });
  });

  it('records only actually presented questions when a late-discharge session is abandoned', () => {
    const id = 'late-demo';
    const patient = formToPatient(sampleForm(), id, 5);
    let state = demoReducer(setDay(seedState(), 5), { type: 'ADD_PATIENT', patient, by: 'Demo', at: AT });
    const first = currentPlan(state, id)!.questions[0]!.taskId!;
    const unopened = currentPlan(state, id)!.questions.slice(1).map((q) => q.taskId ?? id);
    state = present(state, first, id);
    expect(state.audit.at(-1)).toMatchObject({ action: 'CHECKIN_PRESENTED', target: first, day: 5 });
    expect(state.audit.some((a) => a.action === 'CHECKIN_ANSWER' && a.target === first)).toBe(false);
    expect(currentPlan(state, id)!.questions.map((q) => q.taskId ?? id)).toEqual(expect.arrayContaining(unopened));
    expect(currentPlan(state, id)!.questions.some((q) => q.taskId === first)).toBe(false);
    expect(currentPlan(setDay(state, 6), id)!.questions.some((q) => q.taskId === first)).toBe(true);
    expect(currentPlan(setDay(state, 4), id)).toBeUndefined();
  });

  it('rehydrates presentations and no-evidence answers, validates metadata, and resets attempts', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    try {
      const old = { ...seedState(), version: 6 };
      values.set('wasl.demo.v6', JSON.stringify(old));
      const migrated = loadState();
      expect(migrated).toEqual(seedState());
      const first = currentPlan(migrated)!.questions[0]!.taskId!;
      const state = saveOpen(present(migrated, first), 'لا');
      saveState(state);
      const reloaded = loadState();
      expect(reloaded).toEqual(state);
      expect(open(reloaded)).toBeUndefined();
      expect(currentPlan(reloaded)!.questions.some((q) => q.taskId === first)).toBe(false);
      expect(isDemoState({ ...state, audit: [...state.audit, { ...state.audit.at(-1), evidenceCount: -1 }] })).toBe(false);
      expect(isDemoState({ ...state, audit: [...state.audit, { ...state.audit.at(-1), openMedsOutcome: 'BYPASS' }] })).toBe(false);
      expect(isDemoState({ ...state, audit: [...state.audit, { ...state.audit.at(-1), target: 'unknown' }] })).toBe(false);
      expect(currentPlan(demoReducer(reloaded, { type: 'RESET' }))).toEqual(currentPlan(seedState()));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
