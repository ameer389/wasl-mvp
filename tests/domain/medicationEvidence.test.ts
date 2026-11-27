import { describe, expect, it } from 'vitest';
import { answerToEvidence, parseAnswer } from '../../src/domain/arabicParser';
import { buildCareGraph } from '../../src/domain/careGraph';
import { evaluate } from '../../src/domain/gapEngine';
import { evidenceKnownBy, reconcileMedications } from '../../src/domain/medicationEvidence';
import { medStatusFor } from '../../src/domain/patientViews';
import { ev, makePatient, PID, T } from './fixtures';
import type { Evidence } from '../../src/domain/types';

const patient = makePatient();
const tasks = buildCareGraph(patient);
const open = (drugId?: string, confidence = 0.9, day = 1) =>
  ev({ source: 'patient_voice', claim: 'TAKING_UNLISTED', day, drugId, confidence });
const answer = (text: string, idPrefix = 'answer') => answerToEvidence(text, parseAnswer(text, { questionKind: 'OPEN_MEDS' }), {
  questionKind: 'OPEN_MEDS', patientId: PID, day: 1, source: 'family', idPrefix,
});
const confirmStop = (day: number) => ev({ taskId: T.clopidogrelStop, source: 'clinician', day, claim: 'STOPPED', confirmedByHuman: true });
const correct = (target: Evidence, details: Partial<Evidence> = {}) => ev({
  source: 'clinician', claim: 'STOPPED', day: target.day, recordedDay: 2, confirmedByHuman: true,
  correctsEvidenceId: target.id, drugId: target.drugId, ...details,
});
const assess = (evidence: Evidence[], day = 4) => reconcileMedications(patient, tasks, evidence, day);
const check = (evidence: Evidence[], day = 4) => evaluate(patient, tasks, evidence, [], day);
const types = (evidence: Evidence[], day = 4) => check(evidence, day).gaps.map((g) => g.type);

describe('medication reconciliation', () => {
  it('uses the same STOP assessment for open and task reports, and accepts later credible resumed use', () => {
    const report = open('clopidogrel');
    const confirmed = confirmStop(2);
    expect(types([report], 1)).toContain('STOPPED_STILL_TAKEN');
    expect(types([report, confirmed], 2)).not.toContain('STOPPED_STILL_TAKEN');
    expect(check([report, confirmed], 2).taskStatus[T.clopidogrelStop]).toBe('VERIFIED');
    const resumed = open('clopidogrel', 0.7, 3);
    const evidence = [report, confirmed, resumed];
    const a = assess(evidence).byTask.get(T.clopidogrelStop)!;
    expect(a).toMatchObject({ effective: resumed, contradiction: confirmed, history: evidence });
    expect(assess(evidence).open.get('drug:clopidogrel')).toEqual(a);
    expect(check(evidence).gaps.find((g) => g.taskId === T.clopidogrelStop)).toMatchObject({
      triggerEvidenceIds: [resumed.id], evidenceIds: [resumed.id, confirmed.id],
    });
  });

  it('keeps a corrected duplicate report in history, with its original source, across a rewind', () => {
    const report = open('rivaroxaban');
    const correction = correct(report);
    expect(types([report, correction], 1)).toContain('DUPLICATE_THERAPY');
    expect(types([report, correction], 2)).not.toContain('DUPLICATE_THERAPY');
    expect(assess([report, correction], 2)).toMatchObject({ superseded: new Set([report.id]) });
    expect(assess([report, correction], 2).open.get('drug:rivaroxaban')).toMatchObject({ effective: correction, history: [report, correction] });
    expect(answer('لا')).toEqual([]);
    expect(types([report, ...answer('لا')], 2)).toContain('DUPLICATE_THERAPY');
  });

  it('separates a correction of the earlier event from a report about current use, including same-day ordering', () => {
    const earlier = open('atorvastatin');
    const sameDay = open('atorvastatin');
    const correction = correct(earlier);
    expect(assess([earlier, sameDay, correction]).open.get('drug:atorvastatin')?.effective).toEqual(sameDay);
    const current = ev({ claim: 'STOPPED', source: 'clinician', day: 2, drugId: 'atorvastatin', confirmedByHuman: true });
    expect(assess([earlier, sameDay, correction, current]).open.get('drug:atorvastatin')?.effective).toEqual(current);
    expect(types([earlier, sameDay, correction, current])).not.toContain('UNLISTED_MED');
  });

  it('sorts by occurrence before insertion and hides records before their recording day', () => {
    const reported = open('clopidogrel', 0.9, 4);
    const older = { ...confirmStop(2), recordedDay: 4 };
    expect(evidenceKnownBy([reported, older], PID, 3)).toEqual([]);
    expect(assess([reported, older]).byTask.get(T.clopidogrelStop)).toMatchObject({ latest: reported, effective: reported, contradiction: older });
    const sameDay = confirmStop(4);
    expect(assess([reported, older, sameDay]).byTask.get(T.clopidogrelStop)?.effective).toEqual(sameDay);
  });

  it('separates dispensing and unconfirmed clinician notes from use evidence', () => {
    const dispensed = ev({ source: 'ehr', claim: 'DONE', day: 1, taskId: T.apixabanStart, eventKind: 'DISPENSED' });
    const note = ev({ source: 'clinician', claim: 'DONE', day: 2, taskId: T.apixabanStart });
    const use = ev({ source: 'family', claim: 'DONE', day: 3, taskId: T.apixabanStart });
    expect(check([dispensed, note]).taskStatus[T.apixabanStart]).not.toBe('VERIFIED');
    expect(assess([dispensed, note, use]).byTask.get(T.apixabanStart)).toMatchObject({ effective: use, history: [dispensed, note, use] });
    expect(check([dispensed, note, use]).taskStatus[T.apixabanStart]).toBe('VERIFIED');
    expect(check([{ ...dispensed, eventKind: 'USAGE' }]).taskStatus[T.apixabanStart]).toBe('VERIFIED');
  });

  it('does not use a medication-level report to verify a start or dose-change task', () => {
    expect(check([open('apixaban'), open('insulin-glargine')]).taskStatus[T.apixabanStart]).not.toBe('VERIFIED');
    expect(check([open('insulin-glargine')]).taskStatus[T.insulinDose]).not.toBe('VERIFIED');
    const wrongSubject = ev({ source: 'family', taskId: T.insulinDose, drugId: 'apixaban', claim: 'DONE', day: 2 });
    expect(check([wrongSubject]).taskStatus[T.insulinDose]).not.toBe('VERIFIED');
  });

  it('uses the latest supported continuation and dose reports instead of a historical positive', () => {
    const continued = ev({ source: 'family', taskId: T.metforminCont, claim: 'DONE', day: 3 });
    const negative = ev({ source: 'family', taskId: T.metforminCont, claim: 'NOT_DONE', day: 4 });
    expect(check([continued, negative]).taskStatus[T.metforminCont]).not.toBe('VERIFIED');
    const newDose = ev({ source: 'family', taskId: T.insulinDose, claim: 'DONE', day: 1 });
    const oldDose = ev({ source: 'family', taskId: T.insulinDose, claim: 'OLD_DOSE', day: 4 });
    expect(check([oldDose, newDose]).gaps.find((g) => g.type === 'WRONG_DOSE')).toMatchObject({
      triggerEvidenceIds: [oldDose.id], evidenceIds: [oldDose.id, newDose.id],
    });
  });

  it('keeps a reliable stop fact when newer open evidence is weak and routes the contradiction for review', () => {
    const supported = confirmStop(1);
    const weak = open('clopidogrel', 0.69, 2);
    expect(assess([supported, weak]).byTask.get(T.clopidogrelStop)).toMatchObject({ effective: supported, uncertainty: weak });
    expect(types([supported, weak], 2)).toEqual(['LOW_CONFIDENCE']);
    expect(types([supported, { ...weak, confidence: 0.7 }], 2)).toEqual(['STOPPED_STILL_TAKEN']);
  });

  it('keeps unknown medicines distinct and groups uncertain entries by the open answer', () => {
    const first = open();
    const second = open();
    expect(check([first, second], 1).gaps.filter((g) => g.type === 'UNLISTED_MED')).toHaveLength(2);
    const reports = answer('مدري');
    expect(types(reports, 1)).toEqual(['LOW_CONFIDENCE']);
    const weak = [{ ...open('rivaroxaban', 0.69), reportId: 'same' }, { ...open('atorvastatin', 0.69), reportId: 'same' }];
    expect(check(weak, 1).gaps).toEqual([expect.objectContaining({ type: 'LOW_CONFIDENCE', evidenceIds: weak.map((e) => e.id) })]);
    expect(types([open('atorvastatin', 0.70)], 1)).toEqual(['UNLISTED_MED']);
    expect(types([open('rivaroxaban', 0.70)], 1)).toEqual(['DUPLICATE_THERAPY']);
  });

  it('preserves aliases and requires explicit clinician clarification of ambiguous candidates', () => {
    expect(answer('آخذ بلافكس')[0]).toMatchObject({ drugId: 'clopidogrel', reportId: 'answer', source: 'family' });
    const [ambiguous] = answer('آخذ حبة الضغط');
    expect(ambiguous).toMatchObject({ claim: 'UNSURE', candidateDrugIds: ['amlodipine', 'bisoprolol', 'losartan'] });
    expect(types([ambiguous!], 1)).toEqual(['LOW_CONFIDENCE']);
    const clarified = correct(ambiguous!, { claim: 'TAKING_UNLISTED', drugId: 'amlodipine' });
    expect(types([ambiguous!, clarified], 2)).toEqual(['UNLISTED_MED']);
    expect(assess([ambiguous!, clarified], 2).superseded.has(ambiguous!.id)).toBe(true);
    expect(types([ambiguous!, { ...clarified, source: 'family' }], 2)).toEqual(['LOW_CONFIDENCE']);
  });

  it('does not use completed treatment as a possible current overlap', () => {
    const p = makePatient();
    p.plan.meds[0]!.treatmentEndDay = 3;
    const report = open('rivaroxaban');
    const evaluateDay = (day: number) => evaluate(p, buildCareGraph(p), [report], [], day).gaps.map((g) => g.type);
    expect(evaluateDay(3)).toContain('DUPLICATE_THERAPY');
    expect(evaluateDay(4)).not.toContain('DUPLICATE_THERAPY');
  });

  it('keeps administrative closure out of medication assessment and confirmation', () => {
    const report = open('clopidogrel');
    const gap = check([report], 2).gaps.find((g) => g.type === 'STOPPED_STILL_TAKEN')!;
    const result = evaluate(patient, tasks, [report], [{ gapId: gap.id, day: 2, action: 'RESOLVED', by: 'demo' }], 2);
    expect(result.taskStatus[T.clopidogrelStop]).toBe('CLOSED');
    expect(medStatusFor('clopidogrel', tasks, result.taskStatus, 2)).toBe('waiting');
    expect(assess([report], 2).byTask.get(T.clopidogrelStop)?.effective).toEqual(report);
  });
});
