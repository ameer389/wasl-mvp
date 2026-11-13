import { describe, expect, it } from 'vitest';
import { SAMPLE_PATIENTS } from '../../src/data/samplePatients';
import { seedState } from '../../src/state/demoState';
import { demoReducer } from '../../src/state/reducer';
import { buildAllTasks, clinicianGaps, escalationsNow, evaluateAll } from '../../src/state/selectors';

const AT = '2026-11-13T00:00:00.000Z';

describe('demo store reducer', () => {
  it('clamps the simulated day to the follow-up window', () => {
    expect(demoReducer(seedState(), { type: 'SET_DAY', day: 99 }).simulatedDay).toBe(14);
    expect(demoReducer(seedState(), { type: 'SET_DAY', day: -3 }).simulatedDay).toBe(0);
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
    const extra = { ...structuredClone(SAMPLE_PATIENTS[0]!), id: 'demo-new' };
    let s = demoReducer(seedState(), { type: 'ADD_PATIENT', patient: extra, by: 'Dr Test', at: AT });
    s = demoReducer(s, { type: 'ADD_PATIENT', patient: extra, by: 'Dr Test', at: AT });
    expect(s.patients.filter((p) => p.id === 'demo-new')).toHaveLength(1);
    expect(s.audit.at(-1)).toMatchObject({ action: 'PATIENT_ADDED', target: 'demo-new' });
    expect(demoReducer(s, { type: 'RESET' })).toEqual(seedState());
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
    s = demoReducer(s, { type: 'RESOLVE_GAP', gapId: top.id, action: 'RESOLVED', by: 'Dr Test', at: AT });
    const after = evaluateAll(s.patients, tasks, s.evidence, s.resolutions, s.simulatedDay);
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
