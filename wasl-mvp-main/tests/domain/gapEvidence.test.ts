import { describe, expect, it } from 'vitest';
import { buildCareGraph } from '../../src/domain/careGraph';
import { canVerify, evaluate, sortGaps } from '../../src/domain/gapEngine';
import { GAP_TYPE_LABEL } from '../../src/domain/labels';
import { planQuestions } from '../../src/domain/questionPlanner';
import { appointmentItems } from '../../src/domain/patientViews';
import type { Evidence, GapResolution } from '../../src/domain/types';
import { ev, makePatient, T } from './fixtures';

const patient = makePatient();
const tasks = buildCareGraph(patient);
const task = (id: string) => tasks.find((t) => t.id === id)!;
const report = (id: string, claim: Evidence['claim'], day: number, fields: Partial<Evidence> = {}) =>
  ev({ taskId: id, claim, day, source: 'patient_app', ...fields });
const inspect = (id: string, evidence: Evidence[], day: number, resolutions: GapResolution[] = []) => {
  const selected = [task(id)];
  const result = evaluate(patient, selected, evidence, resolutions, day);
  return {
    ...result, status: result.taskStatus[id],
    asked: planQuestions(patient, selected, evidence, result, day).questions.some((q) => q.taskId === id),
  };
};

describe('Phase 06 task evidence and deadline policy', () => {
  it('uses the latest eligible wound report in both directions, including same-day order', () => {
    const done = report(T.wound, 'DONE', 3);
    const no = report(T.wound, 'NOT_DONE', 3);
    const negative = inspect(T.wound, [done, no], 3);
    expect(negative).toMatchObject({ status: 'GAP', asked: false });
    expect(negative.assessments.get(T.wound)).toMatchObject({ effective: no, contradiction: done });
    expect(negative.gaps).toEqual([expect.objectContaining({
      type: 'TASK_NOT_COMPLETED', route: 'CLINICIAN_24H', detectedDay: 3,
      triggerEvidenceIds: [no.id], evidenceIds: [no.id, done.id],
    })]);
    expect(inspect(T.wound, [no, done], 3)).toMatchObject({ status: 'VERIFIED', asked: false, gaps: [] });
  });

  it('keeps a credible positive as the effective fact when a newer contradiction is too weak', () => {
    const done = report(T.wound, 'DONE', 3);
    const weak = report(T.wound, 'NOT_DONE', 4, { confidence: 0.69 });
    const result = inspect(T.wound, [done, weak], 4);
    expect(result.assessments.get(T.wound)).toMatchObject({ effective: done, uncertainty: weak });
    expect(result).toMatchObject({ status: 'GAP', asked: false, gaps: [{ type: 'LOW_CONFIDENCE', evidenceIds: [weak.id, done.id] }] });
  });

  it('keeps a late start independent from a subsequently missed continuation', () => {
    const started = report(T.apixabanStart, 'DONE', 2);
    const missed = report(T.apixabanCont3, 'NOT_DONE', 3);
    const selected = [task(T.apixabanStart), task(T.apixabanCont3)];
    const result = evaluate(patient, selected, [started, missed], [], 3);
    expect(result.taskStatus).toEqual({ [T.apixabanStart]: 'VERIFIED', [T.apixabanCont3]: 'ESCALATED' });
    expect(task(T.apixabanStart).deadlineDay).toBe(1);
    expect(result.assessments.get(T.apixabanStart)?.effective?.day).toBe(2);
    expect(result.gaps).toEqual([expect.objectContaining({ type: 'TASK_NOT_COMPLETED', taskId: T.apixabanCont3 })]);
  });

  it('honors occurrence before availability and rewinds without losing records', () => {
    const done = report(T.wound, 'DONE', 3);
    const old = report(T.wound, 'NOT_DONE', 2, { recordedDay: 4 });
    const recent = report(T.wound, 'NOT_DONE', 4, { recordedDay: 6 });
    const records = [done, old, recent];
    expect(inspect(T.wound, records, 4).assessments.get(T.wound)).toMatchObject({ effective: done, contradiction: old });
    expect(inspect(T.wound, records, 5).status).toBe('VERIFIED');
    expect(inspect(T.wound, records, 6).gaps[0]?.detectedDay).toBe(6);
    expect(inspect(T.wound, records, 3).assessments.get(T.wound)?.history).toEqual([done]);
  });

  it('waits for a due wound or continuation check and excludes post-treatment use', () => {
    const p = makePatient();
    p.plan.meds[0]!.treatmentEndDay = 3;
    const selected = buildCareGraph(p).filter((t) => t.id === T.apixabanCont3 || t.id === T.wound);
    const negative = report(T.apixabanCont3, 'NOT_DONE', 2);
    const wound = report(T.wound, 'NOT_DONE', 2);
    expect(evaluate(p, selected, [negative, wound], [], 2).gaps).toEqual([]);
    expect(evaluate(p, selected, [negative, wound], [], 3).gaps.map((g) => g.type)).toEqual(['TASK_NOT_COMPLETED', 'TASK_NOT_COMPLETED']);
    expect(evaluate(p, selected.filter((t) => t.id === T.apixabanCont3), [report(T.apixabanCont3, 'NOT_DONE', 4)], [], 5).gaps).toEqual([]);
  });

  it('preserves the 2-day response grace and does not count a dispensed medicine as a reply', () => {
    const dispensed = report(T.apixabanStart, 'DONE', 1, { source: 'ehr', eventKind: 'DISPENSED' });
    expect(inspect(T.apixabanStart, [dispensed], 2).gaps).toEqual([]);
    expect(inspect(T.apixabanStart, [dispensed], 3).gaps[0]).toMatchObject({ type: 'NO_RESPONSE', detectedDay: 3 });
    expect(inspect(T.apixabanStart, [{ ...dispensed, eventKind: 'USAGE' }], 3).status).toBe('VERIFIED');
  });

  it('requires explicit clinician confirmation and a matching patient and medication', () => {
    const record = report(T.apixabanStart, 'DONE', 1, { source: 'clinician' });
    const confirmed = { ...record, confirmedByHuman: true };
    expect(canVerify(task(T.apixabanStart), record)).toBe(false);
    expect(canVerify(task(T.apixabanStart), confirmed)).toBe(true);
    expect(canVerify(task(T.apixabanStart), { ...confirmed, patientId: 'other' })).toBe(false);
    expect(canVerify(task(T.apixabanStart), { ...confirmed, drugId: 'losartan' })).toBe(false);
    expect(inspect(T.apixabanStart, [{ ...confirmed, confidence: NaN }, { ...confirmed, id: 'invalid-day', day: -1 }], 3).status).toBe('ESCALATED');
  });

  it('ignores unrelated claims and events without replacing an eligible outcome', () => {
    const stopped = report(T.clopidogrelStop, 'STOPPED', 2);
    const invalid = report(T.clopidogrelStop, 'TAKING_UNLISTED', 3);
    expect(inspect(T.clopidogrelStop, [stopped, invalid], 3).status).toBe('VERIFIED');
    const labEventOnWound = report(T.wound, 'DONE', 3, { source: 'lab_system', eventKind: 'LAB_RESULT' });
    expect(canVerify(task(T.wound), labEventOnWound)).toBe(false);
    expect(inspect(T.wound, [labEventOnWound], 3)).toMatchObject({ status: 'PENDING', asked: true, gaps: [] });
  });
});

describe('Phase 06 healthcare system outcomes', () => {
  it.each([0.69, 0.7])('applies the lab confidence floor at %s and keeps supporting reports', (confidence) => {
    const lab = report(T.cbc, 'DONE', 3, { source: 'lab_system', eventKind: 'LAB_RESULT', confidence });
    const family = report(T.cbc, 'DONE', 3, { source: 'family' });
    const result = inspect(T.cbc, [family, lab], 4);
    if (confidence >= 0.7) expect(result).toMatchObject({ status: 'VERIFIED', gaps: [], asked: false });
    else {
      expect(result).toMatchObject({ status: 'ESCALATED', asked: true, gaps: [{ type: 'LAB_MISSED', evidenceIds: [family.id, lab.id] }] });
      expect(result.gaps[0]?.reasons.join(' ')).toContain('No eligible laboratory result');
      expect(GAP_TYPE_LABEL.LAB_MISSED).toBe('Lab result unavailable');
    }
  });

  it.each(['DONE', 'NOT_DONE'] as const)('uses patient attendance report %s as context only', (claim) => {
    const patientReport = report(T.attended, claim, 7);
    const before = inspect(T.attended, [patientReport], 7);
    expect(before).toMatchObject({ status: 'PENDING', asked: false, gaps: [] });
    expect(inspect(T.attended, [patientReport], 8)).toMatchObject({
      status: 'GAP', asked: true, gaps: [{ type: 'FOLLOWUP_ATTENDANCE_UNCONFIRMED', evidenceIds: [patientReport.id], triggerEvidenceIds: [] }],
    });
  });

  it('rejects mismatched booking provenance even on the visit day and a pre-visit legacy booking', () => {
    const booked = report(T.attended, 'DONE', 7, { source: 'appointment_system', eventKind: 'APPOINTMENT_BOOKING' });
    const legacyEarly = report(T.attended, 'DONE', 5, { source: 'appointment_system' });
    expect(inspect(T.attended, [booked, legacyEarly], 8).gaps[0]?.type).toBe('FOLLOWUP_ATTENDANCE_UNCONFIRMED');
    const attended = report(T.attended, 'DONE', 7, { source: 'appointment_system', eventKind: 'APPOINTMENT_ATTENDANCE' });
    const result = evaluate(patient, [task(T.attended), task(T.booked)], [attended], [], 8);
    expect(result.taskStatus[T.attended]).toBe('VERIFIED');
    expect(result.gaps.map((g) => g.type)).toEqual(['FOLLOWUP_NOT_BOOKED']);
    expect(inspect(T.attended, [attended, { ...booked, day: 8 }], 8).status).toBe('VERIFIED');
  });

  it('uses a subsequent eligible system correction, retaining original non-attendance as history', () => {
    const present = report(T.attended, 'DONE', 7, { source: 'appointment_system', eventKind: 'APPOINTMENT_ATTENDANCE' });
    const missed = report(T.attended, 'NOT_DONE', 7, { source: 'appointment_system', eventKind: 'APPOINTMENT_ATTENDANCE' });
    const negative = inspect(T.attended, [present, missed], 8);
    expect(negative).toMatchObject({ status: 'GAP', asked: false, gaps: [{ type: 'FOLLOWUP_MISSED', triggerEvidenceIds: [missed.id] }] });
    const corrected = inspect(T.attended, [present, missed, { ...present, id: 'corrected', recordedDay: 9 }], 9);
    expect(corrected).toMatchObject({ status: 'VERIFIED', gaps: [] });
    expect(corrected.assessments.get(T.attended)?.contradiction).toBe(missed);
  });

  it('retains an eligible independent outcome alongside new patient or weak system contradiction', () => {
    const attended = report(T.attended, 'DONE', 7, { source: 'appointment_system', eventKind: 'APPOINTMENT_ATTENDANCE' });
    const later = report(T.attended, 'NOT_DONE', 8);
    const result = inspect(T.attended, [attended, later], 8);
    expect(result.assessments.get(T.attended)).toMatchObject({ effective: attended, uncertainty: later });
    expect(result).toMatchObject({ status: 'GAP', gaps: [{ type: 'LOW_CONFIDENCE', triggerEvidenceIds: [later.id] }] });
    const weak = report(T.attended, 'NOT_DONE', 8, { source: 'appointment_system', confidence: 0.69 });
    expect(inspect(T.attended, [attended, weak], 8).gaps[0]?.type).toBe('LOW_CONFIDENCE');
  });

  it('exposes the current condition through administrative closure without marking the appointment attended', () => {
    const result = inspect(T.attended, [], 8);
    const gap = result.gaps[0]!;
    const closed = inspect(T.attended, [], 8, [{ gapId: gap.id, day: 8, action: 'RESOLVED', by: 'demo', note: 'Checked records' }]);
    expect(closed).toMatchObject({ status: 'CLOSED', gaps: [], asked: true });
    expect(closed.conditions.get(gap.id)?.gap).toEqual(gap);
    expect(appointmentItems(patient, [task(T.attended)], closed.taskStatus, 8)[0]?.state).toBe('pending');
  });
});

describe('Phase 06 aggregation and simulated routing', () => {
  it('keeps distinct reports and concerns, deduplicates evidence IDs, and refreshes the effective reason', () => {
    const a = ev({ source: 'family', claim: 'TAKING_UNLISTED', drugId: 'rivaroxaban', day: 1, detail: 'Earlier report' });
    const b = ev({ source: 'family', claim: 'TAKING_UNLISTED', drugId: 'rivaroxaban', day: 2, detail: 'Latest report' });
    const unclear = ev({ source: 'family', claim: 'UNSURE', drugId: 'rivaroxaban', reportId: 'question', day: 3, confidence: 0.5 });
    const unidentified = ev({ source: 'family', claim: 'TAKING_UNLISTED', detail: 'Unknown medicine', day: 2 });
    const alsoUnidentified = { ...unidentified, id: 'other-report' };
    const records = [a, b, b, unclear, unidentified, alsoUnidentified];
    const result = evaluate(patient, [], records, [], 4);
    const duplicate = result.gaps.find((g) => g.type === 'DUPLICATE_THERAPY')!;
    expect(duplicate.triggerEvidenceIds).toEqual([b.id]);
    expect(duplicate.evidenceIds).toEqual([b.id, unclear.id]);
    expect(duplicate.reasons.join(' ')).toContain('Latest report');
    expect(duplicate.reasons.join(' ')).not.toContain('Earlier report');
    expect(result.gaps.filter((g) => g.type === 'UNLISTED_MED')).toHaveLength(2);
    expect(result.gaps.filter((g) => g.type === 'LOW_CONFIDENCE')).toHaveLength(1);
    expect(evaluate(patient, [], JSON.parse(JSON.stringify(records)), [], 4).gaps).toEqual(result.gaps);
  });

  it('orders urgent review ahead of a numerically higher overdue routine item', () => {
    const urgent = inspect(T.insulinDose, [report(T.insulinDose, 'NOT_DONE', 1)], 1).gaps[0]!;
    const routine = inspect(T.wound, [report(T.wound, 'NOT_DONE', 3)], 25).gaps[0]!;
    expect(routine.priority).toBeGreaterThan(urgent.priority);
    expect(sortGaps([routine, urgent])[0]).toBe(urgent);
    expect(routine.priorityFactors).toMatchObject({ daysOverdue: 22, severity: 6, riskMultiplier: 1.3 });
  });

  it('leaves a low-risk negative in the in-app question path', () => {
    const result = inspect(T.metforminCont, [report(T.metforminCont, 'NOT_DONE', 3)], 4);
    expect(result).toMatchObject({ status: 'GAP', asked: true, gaps: [{ type: 'TASK_NOT_COMPLETED', route: 'PATIENT_REMINDER' }] });
  });
});
