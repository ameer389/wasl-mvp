import type { AgentMessage } from '@humain-voice/agent';
import { UNSURE_CONFIDENCE_CAP, type AnswerIntent, type ParseResult } from '../domain/arabicParser';
import { interpretSpeech } from '../domain/speechAnswer';
import type { Question, QuestionKind } from '../domain/types';

const allowed: Record<QuestionKind, readonly AnswerIntent[]> = {
  MED_START: ['YES', 'NO', 'UNSURE'],
  MED_CONTINUE: ['YES', 'NO', 'UNSURE'],
  STOPPED_CHECK: ['YES', 'NO', 'STOPPED', 'STILL_TAKING', 'NEVER_STARTED', 'UNSURE'],
  DOSE_CHECK: ['YES', 'NO', 'NEW_DOSE', 'OLD_DOSE', 'UNSURE'],
  YES_NO: ['YES', 'NO', 'UNSURE'],
  OPEN_MEDS: ['NONE', 'MENTIONS_MEDS', 'UNSURE'],
};

export interface HybridQuestion {
  question: Question;
  day: number;
  family: boolean;
  presentationId: string;
}

export interface HybridProposal {
  ref: string;
  transcript: string;
  parse: ParseResult;
  bound: HybridQuestion;
}

type Outcome = 'awaiting_confirmation' | 'saving' | 'recorded' | 'rejected' | 'not_saved';

function objectWithKeys(input: unknown, keys: readonly string[]): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input) &&
    Object.keys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
}

function comparable(kind: QuestionKind, intent: AnswerIntent) {
  if (kind === 'STOPPED_CHECK') return intent === 'YES' ? 'STOPPED' : intent === 'NO' ? 'STILL_TAKING' : intent;
  return kind === 'DOSE_CHECK' && intent === 'YES' ? 'NEW_DOSE' : intent;
}

/** One controller per provider connection. The host supplies the currently presented question. */
export function createHybridCheckin(
  current: () => HybridQuestion | undefined,
  onProposal: (proposal: HybridProposal) => void,
  onClarify: () => void,
) {
  let closed = false;
  let lease: { ref: string; binding: HybridQuestion; turns: number } | undefined;
  let heard: { text: string; at: number } | undefined;
  let pending: HybridProposal | undefined;
  const seen = new Set<string>();
  const outcomes = new Map<string, Outcome>();

  function matches(binding: HybridQuestion) {
    const view = current();
    return view?.presentationId === binding.presentationId && view.question === binding.question &&
      view.day === binding.day && view.family === binding.family;
  }

  return {
    tools: {
      get_current_question: (args: unknown) => {
        if (!objectWithKeys(args, ['scope']) || args.scope !== 'current_checkin') return { status: 'invalid_request' };
        if (closed) return { status: 'closed' };
        const binding = current();
        if (pending) return { status: outcomes.get(pending.ref) };
        if (!binding) return { status: 'no_current_question' };
        if (!lease || !matches(lease.binding)) {
          lease = { binding, ref: crypto.randomUUID(), turns: 0 };
          heard = undefined;
        }
        const { question, day, family } = binding;
        return {
          status: 'question', question_ref: lease.ref, simulated_day: day,
          category: question.kind, task_type: question.taskType,
          medication_id: question.drugId, medication_name: question.medNameAr,
          wording_ar: question.textAr, responding_as: family ? 'family' : 'patient',
          available_intents: allowed[question.kind],
        };
      },
      propose_patient_answer: (args: unknown) => {
        if (!objectWithKeys(args, ['question_ref', 'intent']) || typeof args.intent !== 'string') return { status: 'invalid_proposal' };
        if (closed || !lease || args.question_ref !== lease.ref) return { status: 'stale_question' };
        const existing = outcomes.get(lease.ref);
        if (existing && existing !== 'rejected') return { status: existing };
        if (!matches(lease.binding)) return { status: 'stale_question' };
        const { question } = lease.binding;
        const intent = args.intent as AnswerIntent;
        if (!allowed[question.kind].includes(intent)) return { status: 'invalid_proposal' };
        if (!heard || Date.now() - heard.at > 20000) return { status: 'transcript_pending' };
        const recognised = interpretSpeech([{ transcript: heard.text }], {
          questionKind: question.kind, drugId: question.drugId, taskType: question.taskType,
        });
        heard = undefined;
        if (!recognised) return { status: 'transcript_pending' };
        const { parse } = recognised;
        const agrees = comparable(question.kind, intent) === comparable(question.kind, parse.intent);
        if (!agrees && intent !== 'UNSURE' && ++lease.turns < 2) {
          onClarify();
          return { status: 'clarification_required' };
        }
        const proposal: HybridProposal = {
          ref: lease.ref, transcript: recognised.text, bound: lease.binding,
          parse: agrees ? parse : {
            intent: 'UNSURE', meds: [], ambiguousMeds: parse.ambiguousMeds,
            confidence: UNSURE_CONFIDENCE_CAP, cues: ['Interpretation requires clarification'],
            speech: { interpretationConfidence: UNSURE_CONFIDENCE_CAP, conflict: false },
          },
        };
        pending = proposal;
        outcomes.set(lease.ref, 'awaiting_confirmation');
        onProposal(proposal);
        return { status: 'awaiting_confirmation' };
      },
      get_answer_status: (args: unknown) => {
        if (!objectWithKeys(args, ['question_ref']) || typeof args.question_ref !== 'string') return { status: 'invalid_request' };
        return { status: closed ? 'closed' : outcomes.get(args.question_ref) ?? 'no_proposal' };
      },
    },
    transcript(message: AgentMessage) {
      if (closed || !lease || message.role !== 'user' || !message.final || seen.has(message.id)) return;
      seen.add(message.id);
      const text = message.text.trim();
      if (matches(lease.binding) && text && text.length <= 1000) heard = { text, at: Date.now() };
      else heard = undefined;
    },
    confirm(proposal: HybridProposal) {
      if (closed || pending !== proposal || outcomes.get(proposal.ref) !== 'awaiting_confirmation' || !matches(proposal.bound)) return false;
      outcomes.set(proposal.ref, 'saving');
      return true;
    },
    finish(proposal: HybridProposal, recorded: boolean) {
      if (outcomes.get(proposal.ref) === 'saving') outcomes.set(proposal.ref, recorded ? 'recorded' : 'not_saved');
      if (pending === proposal) pending = undefined;
    },
    reject(proposal: HybridProposal) {
      if (pending !== proposal || outcomes.get(proposal.ref) !== 'awaiting_confirmation') return;
      outcomes.set(proposal.ref, 'rejected');
      pending = undefined;
      heard = undefined;
    },
    close() {
      closed = true;
      pending = undefined;
      heard = undefined;
    },
  };
}
