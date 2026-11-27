import { describe, expect, it } from 'vitest';
import { parseAnswer, toEvidenceClaim, type ParseOptions } from '../../src/domain/arabicParser';
import { answerAuditNote, checkinReducer, evidenceForAnswer, initialCheckin, withKeptMeds } from '../../src/domain/checkin';
import { buildCareGraph } from '../../src/domain/careGraph';
import { evaluate, VERIFY_THRESHOLD } from '../../src/domain/gapEngine';
import { openMedsQuestion, questionForTask } from '../../src/domain/questionPlanner';
import { confirmTranscript, interpretSpeech, recognitionConfidence } from '../../src/domain/speechAnswer';
import type { Question } from '../../src/domain/types';
import { makePatient, T } from './fixtures';

const patient = makePatient();
const tasks = buildCareGraph(patient);
const question = (id: string) => questionForTask(tasks.find((t) => t.id === id)!, patient);
const open = openMedsQuestion(patient, 3);
const parse = (q: Question, raw: string) => parseAnswer(raw, { questionKind: q.kind, taskType: q.taskType, drugId: q.drugId });
const evidence = (q: Question, raw: string, family = false, result = parse(q, raw)) =>
  evidenceForAnswer({ question: q, rawText: raw, parse: result, patientId: patient.id, day: 3, idPrefix: 'voice-test', mode: 'text', family });
const openClaims = (raw: string) => evidence(open, raw).map((e) => [e.claim, e.drugId]);

describe('question and medication scope', () => {
  it.each([
    [T.apixabanStart, 'إيه، آخذ بنادول', false],
    [T.clopidogrelStop, 'إيه وقف أبوي بنادول', true],
    [T.apixabanStart, 'نعم بديت حبة الضغط', false],
    [T.cbc, 'إيه آخذ دواء للمعدة', false],
    [T.attended, 'إيه ياخذ أبوي بنادول', true],
    [T.wound, 'نعم آخذ بنادول', false],
  ] as const)('does not verify %s from the wrong reference', (id, raw, family) => {
    const records = evidence(question(id), raw, family);
    expect(records[0]).toMatchObject({ claim: 'UNSURE', rawText: raw, source: family ? 'family' : 'patient_app' });
    expect(evaluate(patient, tasks, records, [], 3).taskStatus[id]).not.toBe('VERIFIED');
  });

  it('preserves simple polarity and resolves a supported alias in context', () => {
    expect(evidence(question(T.apixabanStart), 'إيه')[0]?.claim).toBe('DONE');
    expect(evidence(question(T.apixabanStart), 'لا')[0]?.claim).toBe('NOT_DONE');
    expect(evidence(question(T.apixabanStart), 'إيه بديت حبة السيولة')[0]).toMatchObject({ claim: 'DONE', drugId: 'apixaban' });
    expect(evidence(question(T.apixabanStart), 'نعم بديت حبة الضغط')[0]?.candidateDrugIds).toEqual(['amlodipine', 'bisoprolol', 'losartan']);
  });

  it('uses the matching clause rather than a different medication’s polarity', () => {
    expect(evidence(question(T.apixabanStart), 'بديت أبيكسابان وما بديت بنادول')[0]?.claim).toBe('DONE');
    expect(evidence(question(T.apixabanStart), 'بديت بنادول وما بديت أبيكسابان')[0]?.claim).toBe('NOT_DONE');
  });

  it('distinguishes a missed task from a different task action', () => {
    expect(evidence(question(T.cbc), 'سويت التحليل')[0]?.claim).toBe('DONE');
    expect(evidence(question(T.cbc), 'ما سويت التحليل')[0]?.claim).toBe('NOT_DONE');
    expect(evidence(question(T.cbc), 'إيه حجزت الموعد')[0]?.claim).toBe('UNSURE');
    expect(evidence(question(T.cbc), 'إيه قابلت جارنا')[0]?.claim).toBe('UNSURE');
  });
});

describe('medication use, time, and dose', () => {
  it.each([
    ['ماآخذ بلافكس', 'STOPPED'],
    ['أبوي ما عاد ياخذ بلافكس', 'STOPPED'],
    ['وقفت بلافكس أول', 'UNSURE'],
    ['ما أخذت بلافكس أمس', 'UNSURE'],
    ['كنت آخذ بلافكس قبل', 'UNSURE'],
    ['أخذت بلافكس أمس', 'UNSURE'],
    ['ما بديت بلافكس أبد', 'STOPPED'],
    ['يمكن آخذ بلافكس', 'UNSURE'],
    ['ما وقفت بلافكس', 'UNSURE'],
    ['بلافكس', 'UNSURE'],
  ])('classifies %s independently of the name mention', (raw, claim) => {
    expect(openClaims(raw)).toEqual([[claim, 'clopidogrel']]);
    const evaluation = evaluate(patient, tasks, evidence(open, raw), [], 3);
    expect(evaluation.gaps.some((g) => g.type === 'STOPPED_STILL_TAKEN')).toBe(false);
  });

  it('keeps independent affirmations and denials and does not trust a self-contradiction', () => {
    expect(openClaims('آخذ بلافكس وما آخذ بنادول')).toEqual([
      ['TAKING_UNLISTED', 'clopidogrel'], ['STOPPED', 'paracetamol'],
    ]);
    expect(openClaims('آخذ بلافكس، لكن ما آخذ بلافكس')).toEqual([['UNSURE', 'clopidogrel']]);
    expect(openClaims('ما آخذ إلا بلافكس')).toEqual([['TAKING_UNLISTED', 'clopidogrel']]);
  });

  it('distinguishes never starting from explicitly stopping a medicine', () => {
    const q = question(T.clopidogrelStop);
    expect(evidence(q, 'ما بديت بلافكس من الأساس')[0]).toMatchObject({ claim: 'UNSURE', detail: 'Reported never starting this medicine' });
    expect(evidence(q, 'وقفت بلافكس')[0]?.claim).toBe('STOPPED');
  });

  it('represents denial of the new dose without changing it into an old dose or an unclear answer', () => {
    const q = question(T.insulinDose);
    const denied = evidence(q, 'لا، مو على الجرعة الجديدة');
    expect(denied[0]).toMatchObject({ claim: 'NOT_DONE', detail: 'Reported not using the new dose; actual dose unspecified' });
    expect(evaluate(patient, tasks, denied, [], 3).gaps.filter((g) => g.taskId === T.insulinDose)).toEqual([
      expect.objectContaining({ type: 'TASK_NOT_COMPLETED', route: 'CLINICIAN_NOW', triggerEvidenceIds: [denied[0]!.id] }),
    ]);
    expect(evidence(q, 'إيه على الجرعة الجديدة')[0]?.claim).toBe('DONE');
    expect(evidence(q, 'لا، للحين على الجرعة القديمة')[0]?.claim).toBe('OLD_DOSE');
    expect(evidence(q, 'الجرعة نفسها')[0]?.claim).toBe('UNSURE');
  });
});

describe('confirmed extraction', () => {
  it('drops removed names but keeps other facts and the original answer', () => {
    const raw = 'آخذ بلافكس وبنادول';
    const result = withKeptMeds(parse(open, raw), ['clopidogrel'], []);
    const records = evidence(open, raw, true, result);
    expect(records).toEqual([expect.objectContaining({ claim: 'TAKING_UNLISTED', source: 'family', drugId: 'clopidogrel', rawText: raw, reportId: 'voice-test', confirmedByHuman: false })]);
    expect(evaluate(patient, tasks, records, [], 3).gaps.some((g) => g.type === 'STOPPED_STILL_TAKEN')).toBe(true);
  });

  it('records removal of all names without inventing an unidentified medicine', () => {
    const raw = 'آخذ بنادول';
    const discarded = withKeptMeds(parse(open, raw), [], []);
    expect(discarded.extractionDiscarded).toBe(true);
    expect(evidence(open, raw, false, discarded)).toEqual([]);
    expect(answerAuditNote([], 'text', false, raw)).toContain(raw);
    expect(openClaims('آخذ حبوب ثانية ما أعرف اسمها')).toEqual([['TAKING_UNLISTED', undefined]]);
    expect(openClaims('آخذ حبوب ثانية اسمها غير معروف')).toEqual([['TAKING_UNLISTED', undefined]]);
  });
});

describe('contextual, historical and conditional reports', () => {
  it.each([
    [T.apixabanStart, 'بديت فيه يوم رجعت البيت', 'DONE'],
    [T.apixabanStart, 'أخذت أول حبة اليوم، وإذا خلصت العلبة بكلمهم', 'DONE'],
    [T.apixabanStart, 'ما بديت فيه للحين وإذا وصلني بكرة ببدأ', 'NOT_DONE'],
    [T.apixabanStart, 'كنت آخذه قبل الخروج', 'UNSURE'],
    [T.apixabanStart, 'إذا استلمته، أخذته اليوم', 'UNSURE'],
    [T.apixabanStart, 'إيه، باخذه بكرة', 'UNSURE'],
    [T.apixabanStart, 'إذا وصلت العلبة، ببدأ فيه', 'UNSURE'],
    [T.apixabanStart, 'الدكتور قال آخذ أبيكسابان', 'UNSURE'],
    [T.apixabanStart, 'إذا جابوه ببدأ لكن اليوم ما بديت', 'NOT_DONE'],
    [T.apixabanStart, 'أخذت بنادول اليوم وإذا وصل أبيكسابان ببدأ فيه', 'UNSURE'],
    [T.apixabanCont3, 'نسيت الجرعة أمس والحين مستمر عليه', 'DONE'],
    [T.apixabanCont3, 'إيه، بس أمس نسيت الجرعة', 'DONE'],
    [T.apixabanCont3, 'ما أخذته أمس', 'UNSURE'],
    [T.apixabanCont3, 'ما أبي أوقفه', 'UNSURE'],
    [T.apixabanCont3, 'ما أقدر أوقفه', 'UNSURE'],
    [T.apixabanCont3, 'الحين آخذه لكن الحين ما آخذه', 'UNSURE'],
    [T.apixabanCont3, 'كنت آخذ أبيكسابان والحين آخذ بنادول', 'UNSURE'],
    [T.apixabanCont3, 'كنت آخذ بنادول والحين آخذ أبيكسابان', 'DONE'],
    [T.clopidogrelStop, 'وقفته أمس', 'STOPPED'],
    [T.clopidogrelStop, 'وقفته أمس والحين آخذه', 'STILL_TAKING'],
    [T.clopidogrelStop, 'ما بديت فيه أبد، وإذا احتجته بسأل', 'UNSURE'],
    [T.cbc, 'سويت التحليل وإذا طلع بكلم العيادة', 'DONE'],
    [T.cbc, 'ما سويت التحليل وبكرة بسويه', 'NOT_DONE'],
    [T.cbc, 'إذا فتح المختبر، سويت التحليل', 'UNSURE'],
    [T.cbc, 'سويت التحليل بس ما سويت التحليل', 'UNSURE'],
    [T.attended, 'إيه رحت السوق', 'UNSURE'],
    [T.wound, 'شيكت أمس', 'UNSURE'],
  ] as const)('maps %s / %s to %s', (id, raw, claim) => {
    const records = evidence(question(id), raw);
    expect(records[0]).toMatchObject({ claim, rawText: raw, confirmedByHuman: false });
    if (claim === 'UNSURE') {
      expect(records[0]!.confidence).toBeLessThan(VERIFY_THRESHOLD);
      const evaluation = evaluate(patient, tasks, records, [], 3);
      expect(evaluation.taskStatus[id]).not.toBe('VERIFIED');
      expect(evaluation.gaps.some((g) => g.taskId === id && g.type === 'LOW_CONFIDENCE')).toBe(true);
    }
  });

  it('keeps actual open reports eligible alongside hypothetical or historical mentions', () => {
    expect(openClaims('آخذ بنادول الحين وإذا ضاق نفسي آخذ البخاخ')).toEqual([
      ['TAKING_UNLISTED', 'paracetamol'], ['UNSURE', 'salbutamol'],
    ]);
    expect(openClaims('إذا تعبت، آخذ بنادول')).toEqual([['UNSURE', 'paracetamol']]);
    expect(openClaims('ما آخذ بنادول اليوم إذا ما احتجته')).toEqual([['UNSURE', 'paracetamol']]);
    expect(openClaims('كنت ما آخذ بلافكس والحين آخذه')).toEqual([['TAKING_UNLISTED', 'clopidogrel']]);
    expect(openClaims('كنت آخذ بلافكس والحين ما آخذه')).toEqual([['STOPPED', 'clopidogrel']]);
    expect(openClaims('كنت آخذ بلافكس وما آخذ بنادول')).toEqual([
      ['UNSURE', 'clopidogrel'], ['UNSURE', 'paracetamol'],
    ]);
    expect(openClaims('أخذت بلافكس بعد الفجر')).toEqual([['UNSURE', 'clopidogrel']]);
    expect(openClaims('كنت آخذ بلافكس وبنادول والحين ما آخذه')).toEqual(expect.arrayContaining([
      ['UNSURE', 'clopidogrel'], ['UNSURE', 'paracetamol'],
    ]));
    expect(openClaims('لا تاخذ بلافكس')).toEqual([['UNSURE', 'clopidogrel']]);
    expect(openClaims('قال لي الدكتور آخذ بلافكس')).toEqual([['UNSURE', 'clopidogrel']]);
  });

  it('separates old dose, unspecified mismatch and uncertainty downstream', () => {
    const q = question(T.insulinDose);
    const cases = [
      ['كنت على الجرعة القديمة والحين آخذ الجرعة الجديدة', 'DONE', undefined],
      ['الرقم لحاله ١٤ وحدة', 'UNSURE', 'LOW_CONFIDENCE'],
      ['نعم الجرعة الجديدة ١٤ وحدة', 'DONE', undefined],
      ['لا على عشرين وحدة زي أول', 'OLD_DOSE', 'WRONG_DOSE'],
      ['آخذ مثل ما كنت آخذ قبل التغيير', 'OLD_DOSE', 'WRONG_DOSE'],
      ['مو الجرعة الجديدة وبكرة أراجعهم', 'NOT_DONE', 'TASK_NOT_COMPLETED'],
      ['لا، ما غيرتها', 'NOT_DONE', 'TASK_NOT_COMPLETED'],
      ['إذا خفضوها بآخذ الجرعة القديمة', 'UNSURE', 'LOW_CONFIDENCE'],
      ['الجرعة نفسها مدري أي وحدة', 'UNSURE', 'LOW_CONFIDENCE'],
      ['الجرعة القديمة على الورقة', 'UNSURE', 'LOW_CONFIDENCE'],
      ['مو على الجرعة القديمة', 'UNSURE', 'LOW_CONFIDENCE'],
      ['مو الجرعة الجديدة والقديمة على الورقة', 'NOT_DONE', 'TASK_NOT_COMPLETED'],
      ['مو الجرعة الجديدة، القديمة على الورقة', 'NOT_DONE', 'TASK_NOT_COMPLETED'],
    ] as const;
    for (const [text, claim, gap] of cases) {
      const records = evidence(q, text);
      expect(records[0]?.claim, text).toBe(claim);
      const evaluation = evaluate(patient, tasks, records, [], 3);
      const status = claim === 'DONE' ? 'VERIFIED' : 'ESCALATED';
      expect(evaluation.taskStatus[q.taskId!], text).toBe(status);
      expect(evaluation.gaps.find((g) => g.taskId === q.taskId)?.type, text).toBe(gap);
    }
  });

  it('keeps ASR confidence multiplicative for a supported clause', () => {
    const raw = 'الحين آخذه وإذا خلص بكلمهم';
    const result = interpretSpeech([{ transcript: raw, confidence: 0.5 }], {
      questionKind: 'MED_CONTINUE', drugId: 'apixaban',
    })!;
    expect(result.parse.intent).toBe('YES');
    expect(confirmTranscript(result.parse).confidence).toBeLessThan(VERIFY_THRESHOLD);
    expect(toEvidenceClaim(confirmTranscript(result.parse), 'MED_CONTINUE')[0]?.claim).toBe('UNSURE');
  });
});

describe('speech alternatives and confidence', () => {
  const start = { questionKind: 'MED_START', drugId: 'apixaban' } as const;

  it('prefers available recognizer confidence for equivalent interpretations', () => {
    const result = interpretSpeech([{ transcript: 'نعم', confidence: 0.96 }, { transcript: 'إيه بديت أبيكسابان', confidence: 0.85 }], start)!;
    expect(result).toMatchObject({ text: 'نعم', parse: { intent: 'YES', speech: { conflict: false, recognitionConfidence: 0.96 } } });
  });

  it.each([
    ['إيه بديت', 'لا ما بديت', start],
    ['آخذ بنادول', 'آخذ بلافكس', { questionKind: 'OPEN_MEDS' }],
    ['آخذ بلافكس', 'ما آخذ بلافكس', { questionKind: 'OPEN_MEDS' }],
    ['على الجرعة القديمة', 'على الجرعة الجديدة', { questionKind: 'DOSE_CHECK' }],
  ] as Array<[string, string, ParseOptions]>)('leaves materially different alternatives unresolved', (first, second, options) => {
    const result = interpretSpeech([{ transcript: first, confidence: 0.95 }, { transcript: second, confidence: 0.91 }], options)!;
    expect(result.parse.speech?.conflict).toBe(true);
    expect(confirmTranscript(result.parse).confidence).toBeLessThan(VERIFY_THRESHOLD);
    expect(toEvidenceClaim(result.parse, options.questionKind).every((e) => e.claim === 'UNSURE')).toBe(true);
  });

  it('distinguishes missing, zero and low ASR confidence and persists the patient echo separately', () => {
    expect(recognitionConfidence(NaN)).toBeUndefined();
    expect(recognitionConfidence(0)).toBe(0);
    const q = question(T.apixabanStart);
    for (const confidence of [undefined, 0, 0.3]) {
      const result = interpretSpeech([{ transcript: 'إيه بديت', confidence }], start)!;
      const args = { question: q, parse: result.parse, rawText: result.text, mode: 'voice' as const, family: true, patientId: patient.id, day: 3, idPrefix: 'speech' };
      expect(evidenceForAnswer(args)[0]?.claim).toBe('UNSURE');
      const confirmed = evidenceForAnswer({ ...args, transcriptConfirmed: true })[0];
      expect(confirmed).toMatchObject({
        claim: confidence === undefined ? 'DONE' : 'UNSURE', source: 'family', confirmedByHuman: false,
        voice: { transcriptConfirmed: true },
      });
      expect(confirmed?.voice?.recognitionConfidence).toBe(confidence);
    }
    expect(interpretSpeech([{ transcript: '  ' }], start)).toBeUndefined();
  });

  it('ignores duplicate or late results and accepts typing after cancellation on the same question', () => {
    const initial = checkinReducer(initialCheckin(1), { type: 'START' });
    const voice = checkinReducer(initial, { type: 'LISTEN_START' });
    const final = { type: 'LISTEN_FINAL', text: 'إيه' } as const;
    const accepted = checkinReducer(voice, final);
    expect(checkinReducer(accepted, final)).toBe(accepted);
    const cancelled = checkinReducer(voice, { type: 'LISTEN_CANCEL' });
    expect(checkinReducer(cancelled, final)).toBe(cancelled);
    const typed = checkinReducer(cancelled, { type: 'SUBMIT_TEXT', text: 'لا' });
    expect(typed).toMatchObject({ phase: 'understanding', index: 0, answer: { mode: 'text', text: 'لا' } });
    expect(checkinReducer(typed, final)).toBe(typed);
  });
});
