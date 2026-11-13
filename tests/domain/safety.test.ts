/**
 * Safety invariants. These must hold for ANY input, not just the examples.
 */
import { describe, expect, it } from 'vitest';
import { buildCareGraph } from '../../src/domain/careGraph';
import { evaluate } from '../../src/domain/gapEngine';
import type { EvidenceClaim, EvidenceSource, Gap, GapType } from '../../src/domain/types';
import { SAMPLE_EVIDENCE, SAMPLE_PATIENTS } from '../../src/data/samplePatients';
import { demoReducer } from '../../src/state/reducer';
import { seedState } from '../../src/state/demoState';
import { ev, makePatient, PID, run, T } from './fixtures';

const PRESCRIPTIVE = /\b(increase|decrease|take|give|stop taking|double|reduce)\b/i;

/** Every gap produced by the samples on every day of the window. */
function allSampleGaps(): Gap[] {
  const gaps: Gap[] = [];
  for (const p of SAMPLE_PATIENTS) {
    const tasks = buildCareGraph(p);
    for (let day = 0; day <= 14; day++) gaps.push(...evaluate(p, tasks, SAMPLE_EVIDENCE, [], day).gaps);
  }
  return gaps;
}

/** One scenario that triggers all ten gap types at once. */
function everyGapType(): Gap[] {
  return run(
    [
      ev({ taskId: T.apixabanStart, source: 'patient_voice', day: 1, claim: 'NOT_DONE', rawText: 'لا ما بديتها', confidence: 0.92 }),
      ev({ taskId: T.clopidogrelStop, source: 'family', day: 1, claim: 'STILL_TAKING', rawText: 'للحين نعطيه', confidence: 0.9 }),
      ev({ taskId: T.insulinDose, source: 'patient_voice', day: 1, claim: 'OLD_DOSE', confidence: 0.86 }),
      ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'rivaroxaban', confidence: 0.8 }),
      ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'atorvastatin', confidence: 0.8 }),
      ev({ taskId: T.attended, source: 'appointment_system', day: 7, claim: 'NOT_DONE' }),
      ev({ taskId: T.wound, source: 'patient_voice', day: 3, claim: 'DONE', confidence: 0.4 }),
    ],
    8,
  ).gaps;
}

describe('safety invariants', () => {
  it('the combined scenario covers all ten gap types', () => {
    const types = new Set(everyGapType().map((g) => g.type));
    const all: GapType[] = ['NOT_STARTED', 'STOPPED_STILL_TAKEN', 'WRONG_DOSE', 'DUPLICATE_THERAPY', 'UNLISTED_MED', 'LAB_MISSED', 'FOLLOWUP_NOT_BOOKED', 'FOLLOWUP_MISSED', 'NO_RESPONSE', 'LOW_CONFIDENCE'];
    expect([...types].sort()).toEqual([...all].sort());
  });

  it('every high-risk gap routes CLINICIAN_NOW', () => {
    const gaps = [...everyGapType(), ...allSampleGaps()];
    const high = gaps.filter((g) => g.risk === 'high');
    expect(high.length).toBeGreaterThan(0);
    for (const g of high) expect(g.route, g.id).toBe('CLINICIAN_NOW');
  });

  it('no reason string is prescriptive', () => {
    for (const g of [...everyGapType(), ...allSampleGaps()]) {
      expect(g.reasons.length).toBeGreaterThanOrEqual(2); // what was expected + why (rule)
      for (const r of g.reasons) expect(r, g.id).not.toMatch(PRESCRIPTIVE);
    }
  });

  it('evidence with confidence < 0.7 never makes a task VERIFIED (randomised)', () => {
    // Deterministic pseudo-random generator so failures are reproducible.
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
    const patient = makePatient();
    const tasks = buildCareGraph(patient);
    const sources: EvidenceSource[] = ['patient_voice', 'patient_app', 'family', 'ehr', 'lab_system', 'appointment_system', 'clinician'];
    const claims: EvidenceClaim[] = ['DONE', 'STOPPED', 'NOT_DONE', 'UNSURE', 'STILL_TAKING', 'OLD_DOSE'];

    for (let round = 0; round < 200; round++) {
      const evidence = Array.from({ length: 8 }, (_, i) => {
        const task = tasks[Math.floor(rand() * tasks.length)];
        return {
          id: `r${round}-${i}`,
          patientId: PID,
          taskId: task?.id,
          source: sources[Math.floor(rand() * sources.length)] as EvidenceSource,
          day: Math.floor(rand() * 10),
          claim: claims[Math.floor(rand() * claims.length)] as EvidenceClaim,
          confidence: rand() * 0.6999,
          confirmedByHuman: rand() < 0.5,
        };
      });
      const { taskStatus } = evaluate(patient, tasks, evidence, [], 10);
      for (const status of Object.values(taskStatus)) expect(status).not.toBe('VERIFIED');
    }
  });

  it('resolveGap always writes an audit entry', () => {
    let state = seedState();
    for (const action of ['CALLED', 'CONFIRMED', 'RESOLVED'] as const) {
      const before = state.audit.length;
      state = demoReducer(state, { type: 'RESOLVE_GAP', gapId: 'g1', action, by: 'Dr Test', note: 'note', at: '2026-11-13T00:00:00.000Z' });
      expect(state.audit).toHaveLength(before + 1);
      expect(state.audit.at(-1)).toMatchObject({ action: `GAP_${action}`, target: 'g1', actor: 'Dr Test', day: state.simulatedDay });
    }
    expect(state.resolutions).toHaveLength(3);
  });
});
