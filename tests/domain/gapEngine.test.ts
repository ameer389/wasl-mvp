import { describe, expect, it } from 'vitest';
import { computePriority, routeFor, sortGaps } from '../../src/domain/gapEngine';
import type { Gap } from '../../src/domain/types';
import { ev, gapsOfType, run, T } from './fixtures';

describe('gap rules (positive + near-miss negative)', () => {
  it('NOT_STARTED: start overdue and latest confident answer is NOT_DONE', () => {
    const notDone = ev({ taskId: T.apixabanStart, source: 'patient_voice', day: 1, claim: 'NOT_DONE', rawText: 'لا ما بديتها', confidence: 0.92 });
    const gaps = gapsOfType(run([notDone], 2), 'NOT_STARTED');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ taskId: T.apixabanStart, risk: 'high', route: 'CLINICIAN_NOW', detectedDay: 2 });
    expect(gaps[0]?.reasons.join(' ')).toContain('«لا ما بديتها» → NOT_DONE (confidence 0.92)');

    // Near misses: not yet past the deadline; a later DONE answer.
    expect(gapsOfType(run([notDone], 1), 'NOT_STARTED')).toHaveLength(0);
    const done = ev({ taskId: T.apixabanStart, source: 'patient_voice', day: 2, claim: 'DONE', confidence: 0.9 });
    expect(gapsOfType(run([notDone, done], 3), 'NOT_STARTED')).toHaveLength(0);
  });

  it('STOPPED_STILL_TAKEN: STOP medicine reported as still in use (any time)', () => {
    const still = ev({ taskId: T.clopidogrelStop, source: 'family', day: 1, claim: 'STILL_TAKING', confidence: 0.9 });
    expect(gapsOfType(run([still], 1), 'STOPPED_STILL_TAKEN')).toHaveLength(1);

    const stopped = ev({ taskId: T.clopidogrelStop, source: 'family', day: 2, claim: 'STOPPED', confidence: 0.9 });
    expect(gapsOfType(run([still, stopped], 2), 'STOPPED_STILL_TAKEN')).toHaveLength(0);
  });

  it('STOPPED_STILL_TAKEN also fires when a STOP medicine comes up as "unlisted"', () => {
    const unlisted = ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'clopidogrel', confidence: 0.85 });
    const gaps = gapsOfType(run([unlisted], 2), 'STOPPED_STILL_TAKEN');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.taskId).toBe(T.clopidogrelStop);
  });

  it('WRONG_DOSE: dose-change task with OLD_DOSE evidence', () => {
    const old = ev({ taskId: T.insulinDose, source: 'patient_voice', day: 1, claim: 'OLD_DOSE', confidence: 0.86 });
    expect(gapsOfType(run([old], 1), 'WRONG_DOSE')[0]).toMatchObject({ risk: 'high', route: 'CLINICIAN_NOW' });

    const newDose = ev({ taskId: T.insulinDose, source: 'patient_voice', day: 1, claim: 'DONE', confidence: 0.86 });
    expect(gapsOfType(run([newDose], 3), 'WRONG_DOSE')).toHaveLength(0);
  });

  it('DUPLICATE_THERAPY: unlisted drug overlapping an active plan medicine', () => {
    const riva = ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'rivaroxaban', confidence: 0.8 });
    const gaps = gapsOfType(run([riva], 2), 'DUPLICATE_THERAPY');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ drugId: 'rivaroxaban', risk: 'high' });
    expect(gaps[0]?.reasons.join(' ')).toContain('anticoagulant class');

    // Near miss: a statin overlaps nothing in the plan → UNLISTED_MED, not duplicate.
    const statin = ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'atorvastatin', confidence: 0.8 });
    expect(gapsOfType(run([statin], 2), 'DUPLICATE_THERAPY')).toHaveLength(0);
  });

  it('UNLISTED_MED: not in plan and no overlap; risk medium unless high-alert', () => {
    const statin = ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'atorvastatin', confidence: 0.8 });
    expect(gapsOfType(run([statin], 2), 'UNLISTED_MED')[0]).toMatchObject({ risk: 'medium', route: 'CLINICIAN_24H' });

    const digoxin = ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'digoxin', confidence: 0.8 });
    expect(gapsOfType(run([digoxin], 2), 'UNLISTED_MED')[0]?.risk).toBe('high');

    // Near miss: the "unlisted" drug is actually an active plan medicine.
    const metformin = ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'metformin', confidence: 0.8 });
    const r = run([metformin], 2);
    expect(gapsOfType(r, 'UNLISTED_MED')).toHaveLength(0);
    expect(gapsOfType(r, 'DUPLICATE_THERAPY')).toHaveLength(0);
  });

  it('LAB_MISSED: past due with no lab-system result', () => {
    expect(gapsOfType(run([], 4), 'LAB_MISSED')[0]).toMatchObject({ taskId: T.cbc, risk: 'high' });
    expect(gapsOfType(run([], 3), 'LAB_MISSED')).toHaveLength(0); // due today, not past

    const result = ev({ taskId: T.cbc, source: 'lab_system', day: 3, claim: 'DONE' });
    expect(gapsOfType(run([result], 4), 'LAB_MISSED')).toHaveLength(0);
  });

  it('FOLLOWUP_NOT_BOOKED: past booking deadline with no appointment-system booking', () => {
    expect(gapsOfType(run([], 3), 'FOLLOWUP_NOT_BOOKED')).toHaveLength(1);
    const booked = ev({ taskId: T.booked, source: 'appointment_system', day: 1, claim: 'DONE' });
    expect(gapsOfType(run([booked], 3), 'FOLLOWUP_NOT_BOOKED')).toHaveLength(0);
    // A family "yes we booked" is not the appointment system.
    const familyYes = ev({ taskId: T.booked, source: 'family', day: 1, claim: 'DONE', confidence: 0.95 });
    expect(gapsOfType(run([familyYes], 3), 'FOLLOWUP_NOT_BOOKED')).toHaveLength(1);
  });

  it('FOLLOWUP_MISSED: past visit day and appointment system says NOT_DONE', () => {
    const missed = ev({ taskId: T.attended, source: 'appointment_system', day: 7, claim: 'NOT_DONE' });
    expect(gapsOfType(run([missed], 8), 'FOLLOWUP_MISSED')).toHaveLength(1);
    const attended = ev({ taskId: T.attended, source: 'appointment_system', day: 7, claim: 'DONE' });
    expect(gapsOfType(run([attended], 8), 'FOLLOWUP_MISSED')).toHaveLength(0);
    expect(gapsOfType(run([missed], 7), 'FOLLOWUP_MISSED')).toHaveLength(0); // not past yet
  });

  it('NO_RESPONSE: patient-side task more than one day overdue with no evidence at all', () => {
    const at3 = gapsOfType(run([], 3), 'NO_RESPONSE');
    expect(at3.map((g) => g.taskId)).toContain(T.apixabanStart);
    // Feed-verifiable tasks are covered by their own rules, not NO_RESPONSE.
    expect(at3.map((g) => g.taskId)).not.toContain(T.booked);

    expect(gapsOfType(run([], 2), 'NO_RESPONSE')).toHaveLength(0); // only 1 day overdue
    const anyAnswer = ev({ taskId: T.apixabanStart, source: 'patient_app', day: 1, claim: 'UNSURE', confidence: 1 });
    expect(gapsOfType(run([anyAnswer], 3), 'NO_RESPONSE').map((g) => g.taskId)).not.toContain(T.apixabanStart);
  });

  it('LOW_CONFIDENCE: latest patient answer below 0.7 and not confirmed', () => {
    const unsure = ev({ taskId: T.apixabanStart, source: 'patient_voice', day: 1, claim: 'DONE', confidence: 0.55 });
    expect(gapsOfType(run([unsure], 1), 'LOW_CONFIDENCE')[0]).toMatchObject({ taskId: T.apixabanStart, route: 'CLINICIAN_NOW' });

    const sure = { ...unsure, id: 'sure', confidence: 0.7 };
    expect(gapsOfType(run([sure], 1), 'LOW_CONFIDENCE')).toHaveLength(0);
    const confirmed = { ...unsure, id: 'confirmed', confirmedByHuman: true };
    expect(gapsOfType(run([confirmed], 1), 'LOW_CONFIDENCE')).toHaveLength(0);
  });

  it('low-confidence claims do not fire the claim rules (they become LOW_CONFIDENCE instead)', () => {
    const shaky = ev({ taskId: T.clopidogrelStop, source: 'family', day: 1, claim: 'STILL_TAKING', confidence: 0.5 });
    const r = run([shaky], 1);
    expect(gapsOfType(r, 'STOPPED_STILL_TAKEN')).toHaveLength(0);
    expect(gapsOfType(r, 'LOW_CONFIDENCE')[0]).toMatchObject({ risk: 'high', route: 'CLINICIAN_NOW' });
  });
});

describe('verification threshold', () => {
  it('0.69 does not verify; 0.70 verifies', () => {
    const at = (confidence: number) =>
      run([ev({ taskId: T.apixabanStart, source: 'patient_voice', day: 1, claim: 'DONE', confidence })], 1).taskStatus[T.apixabanStart];
    expect(at(0.69)).not.toBe('VERIFIED');
    expect(at(0.7)).toBe('VERIFIED');
  });

  it('system feeds verify; STOPPED verifies a stop task', () => {
    const r = run(
      [
        ev({ taskId: T.cbc, source: 'lab_system', day: 3, claim: 'DONE' }),
        ev({ taskId: T.clopidogrelStop, source: 'family', day: 1, claim: 'STOPPED', confidence: 0.9 }),
      ],
      3,
    );
    expect(r.taskStatus[T.cbc]).toBe('VERIFIED');
    expect(r.taskStatus[T.clopidogrelStop]).toBe('VERIFIED');
  });

  it('ignores evidence from the future (simulated day moved back)', () => {
    const later = ev({ taskId: T.apixabanStart, source: 'patient_app', day: 5, claim: 'DONE' });
    expect(run([later], 2).taskStatus[T.apixabanStart]).toBe('PENDING');
  });
});

describe('resolutions', () => {
  const still = ev({ taskId: T.clopidogrelStop, source: 'family', day: 1, claim: 'STILL_TAKING', confidence: 0.9 });
  const id = `test-001:STOPPED_STILL_TAKEN:${T.clopidogrelStop}`;

  it('RESOLVED removes the gap and closes the task; CALLED keeps it open', () => {
    const resolved = run([still], 2, [{ gapId: id, day: 2, action: 'RESOLVED', by: 'Dr Test' }]);
    expect(gapsOfType(resolved, 'STOPPED_STILL_TAKEN')).toHaveLength(0);
    expect(resolved.taskStatus[T.clopidogrelStop]).toBe('CLOSED');

    const called = run([still], 2, [{ gapId: id, day: 2, action: 'CALLED', by: 'Dr Test' }]);
    expect(gapsOfType(called, 'STOPPED_STILL_TAKEN')).toHaveLength(1);
    expect(called.taskStatus[T.clopidogrelStop]).toBe('ESCALATED');
  });

  it('new triggering evidence after a resolution re-opens the gap', () => {
    const again = ev({ taskId: T.clopidogrelStop, source: 'family', day: 4, claim: 'STILL_TAKING', confidence: 0.9 });
    const r = run([still, again], 4, [{ gapId: id, day: 2, action: 'RESOLVED', by: 'Dr Test' }]);
    expect(gapsOfType(r, 'STOPPED_STILL_TAKEN')).toHaveLength(1);
  });
});

describe('priority and routing', () => {
  it('computes priority = severity × risk × (1 + 0.25 × days overdue) (+1 for LOW_CONFIDENCE)', () => {
    expect(computePriority('NOT_STARTED', 'high', 1)).toBe(20);
    expect(computePriority('STOPPED_STILL_TAKEN', 'high', 3)).toBe(31.5);
    expect(computePriority('LAB_MISSED', 'medium', 1)).toBe(9.8);
    expect(computePriority('LOW_CONFIDENCE', 'high', 0)).toBe(7);
  });

  it('routes by risk; LOW_CONFIDENCE always reaches a clinician', () => {
    expect(routeFor('NOT_STARTED', 'high')).toBe('CLINICIAN_NOW');
    expect(routeFor('LAB_MISSED', 'medium')).toBe('CLINICIAN_24H');
    expect(routeFor('NO_RESPONSE', 'low')).toBe('PATIENT_REMINDER');
    expect(routeFor('LOW_CONFIDENCE', 'low')).toBe('CLINICIAN_24H');
  });

  it('low-risk NO_RESPONSE becomes a patient reminder', () => {
    const gap = run([], 5).gaps.find((g) => g.taskId === T.metforminCont);
    expect(gap).toMatchObject({ type: 'NO_RESPONSE', risk: 'low', route: 'PATIENT_REMINDER' });
  });

  it('sortGaps: priority desc, then detected day asc', () => {
    const g = (id: string, priority: number, detectedDay: number) => ({ id, priority, detectedDay }) as Gap;
    expect(sortGaps([g('a', 5, 2), g('b', 9, 3), g('c', 5, 1)]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('evaluate returns gaps already sorted', () => {
    const r = run(
      [
        ev({ taskId: T.clopidogrelStop, source: 'family', day: 1, claim: 'STILL_TAKING', confidence: 0.9 }),
        ev({ source: 'patient_voice', day: 2, claim: 'TAKING_UNLISTED', drugId: 'atorvastatin', confidence: 0.8 }),
      ],
      4,
    );
    expect(r.gaps).toEqual(sortGaps(r.gaps));
    expect(r.gaps[0]?.type).toBe('STOPPED_STILL_TAKEN');
  });
});
