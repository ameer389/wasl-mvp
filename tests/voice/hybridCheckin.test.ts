import { describe, expect, it, vi } from 'vitest';
import { evidenceForAnswer } from '../../src/domain/checkin';
import type { Question } from '../../src/domain/types';
import { createHybridCheckin, type HybridProposal, type HybridQuestion } from '../../src/voice/hybridCheckin';
import schema from '../../src/voice/checkin-tools.json';
import { PID, T, run } from '../domain/fixtures';

function setup(kind: Question['kind'] = 'MED_START', family = false, fields: Partial<Question> = {}) {
  const question: Question = { id: 'q:synthetic', taskId: kind === 'OPEN_MEDS' ? undefined : 'synthetic-task',
    drugId: kind === 'OPEN_MEDS' ? undefined : 'apixaban', kind, textAr: 'بديت إليكويس؟',
    familyTextAr: 'هل بدأ إليكويس؟', textEn: 'Synthetic question', expects: 'DONE', ...fields };
  let binding: HybridQuestion | undefined = { day: 2, family, presentationId: 'audit-0001', question };
  const clarify = vi.fn();
  const seen = vi.fn<(entry: HybridProposal) => void>();
  const controller = createHybridCheckin(() => binding, seen, clarify);
  const read = () => controller.tools.get_current_question({ scope: 'current_checkin' });
  const ref = read().question_ref;
  const say = (text: string, id = 'message-1', final = true, role: 'agent' | 'user' = 'user') =>
    controller.transcript({ id, text, final, role });
  const propose = (intent: string) => controller.tools.propose_patient_answer({ question_ref: ref, intent });
  const status = () => controller.tools.get_answer_status({ question_ref: ref }).status;
  const answer = () => seen.mock.calls.at(-1)![0];
  return { controller, read, ref, say, propose, seen, status, answer, clarify, set: (next?: Partial<HybridQuestion>) => {
    binding = next ? { day: 2, family, presentationId: 'audit-0001', question, ...next } : undefined;
  } };
}

describe('Hybrid check-in proposal boundary', () => {
  it('exposes the presented question without presenting it again or disclosing arbitrary identifiers', () => {
    const s = setup();
    expect(Object.keys(s.controller.tools)).toEqual(schema.map((tool) => tool.name));
    expect(s.read()).toMatchObject({ simulated_day: 2, category: 'MED_START', medication_id: 'apixaban' });
    expect(s.read()).not.toHaveProperty('taskId');
    expect(s.controller.tools.get_current_question({ scope: 'current_checkin', patient_id: 'other' })).toEqual({ status: 'invalid_request' });
    s.set();
    expect(s.read()).toEqual({ status: 'no_current_question' });
  });

  it.each([
    ['إيه بديت فيه', 'YES', 'DONE'],
    ['لا والله ما بديت', 'NO', 'NOT_DONE'],
    ['مدري يمكن', 'UNSURE', 'UNSURE'],
  ])('validates speech %s and gates %s behind explicit confirmation', (text, intent, claim) => {
    const s = setup();
    expect(s.propose(intent)).toEqual({ status: 'transcript_pending' });
    s.say(text, 'agent', true, 'agent');
    s.say(text, 'interim', false);
    expect(s.propose(intent)).toEqual({ status: 'transcript_pending' });
    s.say(text);
    expect(s.propose(intent)).toEqual({ status: 'awaiting_confirmation' });
    expect(s.propose(intent)).toEqual({ status: 'awaiting_confirmation' });
    expect(s.seen).toHaveBeenCalledTimes(1);
    const p = s.answer();
    expect(p.transcript).toBe(text);
    expect(s.controller.confirm(p)).toBe(true);
    expect(s.controller.confirm(p)).toBe(false);
    expect(s.status()).toBe('saving');
    expect(evidenceForAnswer({
      question: p.bound.question, parse: p.parse, rawText: p.transcript, mode: 'voice', family: false,
      patientId: 'synthetic', day: p.bound.day, transcriptConfirmed: true, idPrefix: 'receipt',
    })).toMatchObject([{ claim, day: 2, rawText: text, source: 'patient_voice', confirmedByHuman: false }]);
    s.controller.finish(p, true);
    expect(s.status()).toBe('recorded');
    expect(s.propose(intent)).toEqual({ status: 'recorded' });
  });

  it('requires clarification and bounds contradictory or wrong-medicine speech without inventing usage', () => {
    const s = setup();
    s.say('إيه آخذ بنادول');
    expect(s.propose('YES')).toEqual({ status: 'clarification_required' });
    s.say('إيه آخذ بنادول');
    expect(s.propose('YES')).toEqual({ status: 'transcript_pending' });
    s.say('إيه آخذ بنادول', 'new');
    expect(s.propose('YES')).toEqual({ status: 'awaiting_confirmation' });
    expect(s.clarify).toHaveBeenCalledTimes(1);
    expect(s.answer().parse).toMatchObject({ intent: 'UNSURE', meds: [] });
  });

  it('rejects stale context, unsupported intents, wrong task, fabricated medicines and synthetic claims', () => {
    const s = setup();
    for (const extra of [{ task_id: 'other' }, { drug_id: 'other' }, { confidence: 1 }, { source: 'clinician' }]) {
      expect(s.controller.tools.propose_patient_answer({ question_ref: s.ref, intent: 'YES', ...extra })).toEqual({ status: 'invalid_proposal' });
    }
    expect(s.propose('OLD_DOSE')).toEqual({ status: 'invalid_proposal' });
    expect(s.controller.tools.propose_patient_answer(null)).toEqual({ status: 'invalid_proposal' });
    expect(s.controller.tools.propose_patient_answer({ question_ref: 'other', intent: 'YES' })).toEqual({ status: 'stale_question' });
    s.say('إيه بديت فيه');
    s.propose('YES');
    const pending = s.answer();
    s.set({ day: 3 });
    expect(s.controller.confirm(pending)).toBe(false);
    s.controller.close();
    expect(s.propose('YES')).toEqual({ status: 'stale_question' });
  });

  it('invalidates the declined proposal, keeps family provenance and reports failed persistence truthfully', () => {
    const s = setup('STOPPED_CHECK', true);
    s.say('لا، للحين آخذه');
    s.propose('STILL_TAKING');
    const previous = s.answer();
    s.controller.reject(previous);
    expect(s.status()).toBe('rejected');
    expect(s.controller.confirm(previous)).toBe(false);
    s.say('إيه وقفته', 'new');
    s.propose('STOPPED');
    const next = s.answer();
    expect(s.controller.confirm(previous)).toBe(false);
    expect(s.controller.confirm(next)).toBe(true);
    expect(evidenceForAnswer({ question: next.bound.question, parse: next.parse, rawText: next.transcript,
      mode: 'voice', family: next.bound.family, patientId: 'synthetic', day: 2, transcriptConfirmed: true, idPrefix: 'family' }))
      .toMatchObject([{ source: 'family', claim: 'STOPPED' }]);
    s.controller.finish(next, false);
    expect(s.status()).toBe('not_saved');
  });

  it('abandons an unconfirmed proposal without saving it', () => {
    const s = setup();
    s.say('إيه بديت فيه');
    s.propose('YES');
    const pending = s.answer();
    s.controller.close();
    expect(s.status()).toBe('closed');
    expect(s.controller.confirm(pending)).toBe(false);
  });

  it.each([
    { kind: 'MED_START', fields: { taskId: T.apixabanStart }, text: 'لا والله ما بديت', intent: 'NO', gap: 'NOT_STARTED' },
    { kind: 'DOSE_CHECK', fields: { taskId: T.insulinDose, drugId: 'insulin-glargine' }, text: 'للحين على الجرعة القديمة', intent: 'OLD_DOSE', gap: 'WRONG_DOSE' },
    { kind: 'OPEN_MEDS', fields: {}, text: 'آخذ زاريلتو كل يوم', intent: 'MENTIONS_MEDS', gap: 'DUPLICATE_THERAPY' },
    { kind: 'OPEN_MEDS', fields: {}, text: 'آخذ ليبيتور كل يوم', intent: 'MENTIONS_MEDS', gap: 'UNLISTED_MED' },
  ] as const)('routes $gap through the existing evaluation only after explicit confirmation', ({ kind, fields, text, intent, gap }) => {
    const s = setup(kind, false, fields);
    expect(run([], 2).gaps.some((entry) => entry.type === gap)).toBe(false);
    s.say(text);
    expect(s.propose(intent).status).toBe('awaiting_confirmation');
    const p = s.answer();
    expect(s.controller.confirm(p)).toBe(true);
    const evidence = evidenceForAnswer({ question: p.bound.question, parse: p.parse, patientId: PID,
      rawText: p.transcript, mode: 'voice', family: false, day: 2, transcriptConfirmed: true, idPrefix: 'hybrid-gap' });
    expect(run(evidence, 2).gaps.find((entry) => entry.type === gap)?.evidenceIds).toEqual([evidence[0]!.id]);
  });
});
