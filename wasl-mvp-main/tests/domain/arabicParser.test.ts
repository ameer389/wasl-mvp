/**
 * Unit tests for the Saudi-dialect parser. Sentences here are written for the
 * tests and are deliberately NOT copied from validation/utterances.json.
 */
import { describe, expect, it } from 'vitest';
import {
  answerToEvidence,
  findMedMentions,
  normalizeArabic,
  parseAnswer,
  toEvidenceClaim,
  UNSURE_CONFIDENCE_CAP,
  type AnswerIntent,
} from '../../src/domain/arabicParser';
import { buildCareGraph, taskId } from '../../src/domain/careGraph';
import { evaluate, VERIFY_THRESHOLD } from '../../src/domain/gapEngine';
import { planQuestions } from '../../src/domain/questionPlanner';
import type { QuestionKind } from '../../src/domain/types';
import { SAMPLE_PATIENTS } from '../../src/data/samplePatients';

const intent = (text: string, questionKind: QuestionKind, drugId?: string): AnswerIntent =>
  parseAnswer(text, { questionKind, drugId }).intent;

describe('normalizeArabic', () => {
  it('unifies letters that speech-to-text and typists mix up', () => {
    expect(normalizeArabic('أبوي إذا آخذ')).toBe('ابوي اذا اخذ');
    expect(normalizeArabic('حبة المستشفى')).toBe('حبه المستشفي');
    expect(normalizeArabic('مسؤول شيئ')).toBe('مسوول شيي');
  });

  it('strips tashkeel, tatweel and punctuation, collapses spaces, lowercases Latin', () => {
    expect(normalizeArabic('مَـــدْرِي!!  والله،  Plavix؟')).toBe('مدري والله plavix');
    expect(normalizeArabic('«لا»… ابد')).toBe('لا ابد');
  });

  it('converts Arabic-Indic digits and squeezes stretched letters', () => {
    expect(normalizeArabic('١٤ وحدة')).toBe('14 وحده');
    expect(normalizeArabic('لاااااا')).toBe('لا');
  });
});

describe('negation depends on the question kind', () => {
  it('STOPPED_CHECK («وقّفت …؟»)', () => {
    expect(intent('والله ما وقفته', 'STOPPED_CHECK')).toBe('STILL_TAKING');
    expect(intent('ما عاد استخدمه', 'STOPPED_CHECK')).toBe('STOPPED');
    expect(intent('ايوه وقفناه', 'STOPPED_CHECK')).toBe('STOPPED');
    expect(intent('لا، باقي ياخذه', 'STOPPED_CHECK')).toBe('STILL_TAKING');
    expect(intent('اكيد ما يستخدمه الحين', 'STOPPED_CHECK')).toBe('STOPPED');
  });

  it('MED_START («بديت …؟»)', () => {
    expect(intent('ما بديت فيه', 'MED_START')).toBe('NO');
    expect(intent('مابديته', 'MED_START')).toBe('NO');
    expect(intent('بدينا فيه امس', 'MED_START')).toBe('YES');
  });

  it('MED_CONTINUE («للحين مستمر على …؟»)', () => {
    expect(intent('ماوقفته ابد', 'MED_CONTINUE')).toBe('YES');
    expect(intent('مو دايم', 'MED_CONTINUE')).toBe('NO');
    expect(intent('لا تركته', 'MED_CONTINUE')).toBe('NO');
    expect(intent('ما ابي اوقفه', 'MED_CONTINUE')).toBe('YES'); // modal between negator and verb
  });

  it('DOSE_CHECK («على الجرعة الجديدة؟»)', () => {
    expect(intent('ما غيرناها', 'DOSE_CHECK')).toBe('NO');
    expect(intent('صرنا على الجرعه الجديده', 'DOSE_CHECK')).toBe('NEW_DOSE');
    expect(intent('لا باقي على القديم', 'DOSE_CHECK')).toBe('OLD_DOSE');
  });

  it('OPEN_MEDS («فيه دواء ثاني؟»)', () => {
    expect(intent('ما فيه غيرها', 'OPEN_MEDS')).toBe('NONE');
    expect(intent('ايه اخذ أدول', 'OPEN_MEDS')).toBe('MENTIONS_MEDS');
  });

  it('uncertainty wins over a hedged yes, and is capped low', () => {
    const r = parseAnswer('اعتقد ايه بس مو متأكد', { questionKind: 'MED_START' });
    expect(r.intent).toBe('UNSURE');
    expect(r.confidence).toBeLessThanOrEqual(UNSURE_CONFIDENCE_CAP);
  });

  it('no cue → UNKNOWN with low confidence and an explanation', () => {
    const r = parseAnswer('الحين وقت الغدا', { questionKind: 'MED_CONTINUE' });
    expect(r.intent).toBe('UNKNOWN');
    expect(r.confidence).toBeLessThan(VERIFY_THRESHOLD);
    expect(r.cues).toContain('no answer cue found');
  });

  it('conflicting cues lower confidence below the verification threshold', () => {
    const clear = parseAnswer('ايه بديت', { questionKind: 'MED_START' });
    const mixed = parseAnswer('ايه بس ما بديت', { questionKind: 'MED_START' });
    expect(clear.confidence).toBeGreaterThanOrEqual(VERIFY_THRESHOLD);
    expect(mixed.confidence).toBeLessThan(VERIFY_THRESHOLD);
    expect(mixed.cues.some((c) => c.startsWith('conflict'))).toBe(true);
  });
});

describe('medicine mentions', () => {
  it('finds brands, informal names and generics, with ال / و prefixes', () => {
    expect(parseAnswer('ابوي ياخذ البلافكس والبخاخ', { questionKind: 'OPEN_MEDS' }).meds.sort()).toEqual(['clopidogrel', 'salbutamol']);
    expect(parseAnswer('اخذ Plavix', { questionKind: 'OPEN_MEDS' }).meds).toEqual(['clopidogrel']);
    expect(parseAnswer('بخاخ الربو بس', { questionKind: 'OPEN_MEDS' }).meds).toEqual(['salbutamol']);
    expect(parseAnswer('ميتفورمين', { questionKind: 'OPEN_MEDS' }).meds).toEqual(['metformin']);
  });

  it('keeps shared informal names ambiguous instead of guessing', () => {
    const r = parseAnswer('اخذ حبة الضغط', { questionKind: 'OPEN_MEDS' });
    expect(r.meds).toEqual([]);
    expect(r.ambiguousMeds[0]?.drugIds).toEqual(['amlodipine', 'bisoprolol', 'losartan']);
    expect(r.intent).toBe('MENTIONS_MEDS');
  });

  it('uses the question\'s drug to resolve a shared name', () => {
    expect(parseAnswer('للحين ياخذ حبة الضغط', { questionKind: 'MED_CONTINUE', drugId: 'bisoprolol' }).meds).toEqual(['bisoprolol']);
  });

  it('prefers the longest name (no double counting)', () => {
    const mentions = findMedMentions(normalizeArabic('المسكن القوي'));
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.drugIds).toEqual(['morphine']);
  });

  it('a medicine mention wins in OPEN_MEDS even after «لا»', () => {
    expect(intent('لا… الا البروفين', 'OPEN_MEDS')).toBe('MENTIONS_MEDS');
  });
});

describe('ASR confidence', () => {
  it('multiplies into the parse confidence', () => {
    const plain = parseAnswer('ايه وقفته', { questionKind: 'STOPPED_CHECK' });
    const spoken = parseAnswer('ايه وقفته', { questionKind: 'STOPPED_CHECK', asrConfidence: 0.5 });
    expect(spoken.intent).toBe(plain.intent);
    expect(spoken.confidence).toBeCloseTo(plain.confidence * 0.5, 1);
    expect(spoken.confidence).toBeLessThan(VERIFY_THRESHOLD);
    expect(spoken.cues).toContain('asr ×0.5');
  });
});

describe('toEvidenceClaim', () => {
  const claimFor = (text: string, kind: QuestionKind) => toEvidenceClaim(parseAnswer(text, { questionKind: kind }), kind);

  it('maps each question kind to gap-engine claims', () => {
    expect(claimFor('ايه بديت', 'MED_START')[0]?.claim).toBe('DONE');
    expect(claimFor('لا ما بديت', 'MED_START')[0]?.claim).toBe('NOT_DONE');
    expect(claimFor('ايه مستمر', 'MED_CONTINUE')[0]?.claim).toBe('DONE');
    expect(claimFor('ايوه وقفته', 'STOPPED_CHECK')[0]?.claim).toBe('STOPPED');
    expect(claimFor('لا للحين اخذه', 'STOPPED_CHECK')[0]?.claim).toBe('STILL_TAKING');
    expect(claimFor('ايه على الجديده', 'DOSE_CHECK')[0]?.claim).toBe('DONE');
    expect(claimFor('على القديمه', 'DOSE_CHECK')[0]?.claim).toBe('OLD_DOSE');
    expect(claimFor('ايه رحت', 'YES_NO')[0]?.claim).toBe('DONE');
  });

  it('OPEN_MEDS: named usage and ambiguous candidates are different claims; NONE → nothing', () => {
    const drafts = claimFor('اخذ بنادول وحبة المعده', 'OPEN_MEDS');
    expect(drafts.map((d) => [d.claim, d.drugId ?? null])).toEqual([
      ['TAKING_UNLISTED', 'paracetamol'],
      ['UNSURE', null],
    ]);
    expect(drafts[1]?.detail).toContain('Omeprazole');
    expect(drafts[1]?.candidateDrugIds).toEqual(['esomeprazole', 'omeprazole']);
    expect(claimFor('لا ما فيه شي', 'OPEN_MEDS')).toEqual([]);
  });

  it('UNSURE and UNKNOWN become a low-confidence UNSURE claim', () => {
    for (const text of ['مدري والله', 'كم الساعه']) {
      const [d] = claimFor(text, 'STOPPED_CHECK');
      expect(d?.claim).toBe('UNSURE');
      expect(d?.confidence).toBeLessThan(VERIFY_THRESHOLD);
    }
  });
});

describe('question planner ↔ parser kinds', () => {
  it('demo-001 questions use the kinds the parser understands', () => {
    const p = SAMPLE_PATIENTS[0]!;
    const tasks = buildCareGraph(p);
    const evaluation = evaluate(p, tasks, [], [], 0);
    const kinds = planQuestions(p, tasks, [], evaluation, 0).questions.map((q) => q.kind);
    expect(kinds).toEqual(['MED_START', 'STOPPED_CHECK', 'OPEN_MEDS']);
  });
});

describe('end to end: answer → evidence → gap engine', () => {
  const patient = SAMPLE_PATIENTS[0]!; // demo-001, clopidogrel STOP
  const tasks = buildCareGraph(patient);
  const stopTask = taskId('demo-001', 'MED_STOP', 'clopidogrel', 1);
  const startTask = taskId('demo-001', 'MED_START', 'apixaban', 1);

  const toEvidence = (text: string, kind: QuestionKind, task: string | undefined, idPrefix: string, asrConfidence?: number) =>
    answerToEvidence(text, parseAnswer(text, { questionKind: kind, drugId: 'clopidogrel', asrConfidence }), {
      questionKind: kind,
      patientId: 'demo-001',
      taskId: task,
      day: 2,
      source: 'family',
      idPrefix,
    });

  it('a parsed STILL_TAKING answer on clopidogrel produces STOPPED_STILL_TAKEN', () => {
    const evidence = toEvidence('لا والله للحين نعطيه البلافكس', 'STOPPED_CHECK', stopTask, 'e2e-a');
    expect(evidence[0]).toMatchObject({ claim: 'STILL_TAKING', taskId: stopTask, rawText: 'لا والله للحين نعطيه البلافكس' });
    const { gaps, taskStatus } = evaluate(patient, tasks, evidence, [], 2);
    const gap = gaps.find((g) => g.type === 'STOPPED_STILL_TAKEN');
    expect(gap).toMatchObject({ taskId: stopTask, route: 'CLINICIAN_NOW' });
    expect(gap?.reasons.join(' ')).toContain('«لا والله للحين نعطيه البلافكس» → STILL_TAKING');
    expect(taskStatus[stopTask]).toBe('ESCALATED');
  });

  it('the same answer through a poor microphone becomes LOW_CONFIDENCE instead', () => {
    const evidence = toEvidence('لا والله للحين نعطيه البلافكس', 'STOPPED_CHECK', stopTask, 'e2e-b', 0.6);
    const { gaps } = evaluate(patient, tasks, evidence, [], 2);
    expect(gaps.map((g) => g.type)).toContain('LOW_CONFIDENCE');
    expect(gaps.map((g) => g.type)).not.toContain('STOPPED_STILL_TAKEN');
  });

  it('an unsure start answer never verifies the task', () => {
    const evidence = toEvidence('مدري الولد هو اللي يعطيه', 'MED_START', startTask, 'e2e-c');
    const { taskStatus, gaps } = evaluate(patient, tasks, evidence, [], 2);
    expect(taskStatus[startTask]).not.toBe('VERIFIED');
    expect(gaps.find((g) => g.taskId === startTask)?.type).toBe('LOW_CONFIDENCE');
  });

  it('an open-question mention becomes a medication gap', () => {
    const evidence = toEvidence('ايه اخذ بروفين للظهر', 'OPEN_MEDS', undefined, 'e2e-d');
    expect(evidence[0]).toMatchObject({ claim: 'TAKING_UNLISTED', drugId: 'ibuprofen' });
    expect(evidence[0]?.taskId).toBeUndefined();
    const { gaps } = evaluate(patient, tasks, evidence, [], 2);
    expect(gaps.some((g) => g.drugId === 'ibuprofen')).toBe(true);
  });

  it('is deterministic', () => {
    const a = parseAnswer('ايه بس امس نسيت', { questionKind: 'MED_CONTINUE' });
    expect(parseAnswer('ايه بس امس نسيت', { questionKind: 'MED_CONTINUE' })).toEqual(a);
  });
});
