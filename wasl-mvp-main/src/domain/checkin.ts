/**
 * Patient check-in: a small explicit state machine plus the pure helpers that
 * turn an answer (button, typed text or speech) into evidence. No React here.
 *
 *   intro ─START→ question(i) ─LISTEN_START→ listening ─LISTEN_FINAL→ understanding ─PARSED→ echo
 *                    │  ▲                       │ LISTEN_ERROR/CANCEL → question (with error)
 *                    │  └──────── RETRY ────────┘ (from echo)
 *                    ├─SUBMIT_TEXT→ understanding
 *                    └─SAVED (quick button) ─┐   echo ─SAVED→ saved ─NEXT→ question(i+1) | done
 */
import { answerToEvidence, type AnswerIntent, type MedMention, type ParseResult } from './arabicParser';
import { SOURCE_LABEL, VERIFY_THRESHOLD } from './gapEngine';
import { CLAIM_LABEL } from './labels';
import { confirmTranscript } from './speechAnswer';
import type { Evidence, EvidenceSource, Gap, OpenMedsOutcome, Question, QuestionKind } from './types';

// ── Quick answer buttons ────────────────────────────────────────────────────

export interface QuickOption {
  id: string;
  labelAr: string;
  intent: AnswerIntent;
}

const YES_NO_UNSURE: QuickOption[] = [
  { id: 'yes', labelAr: 'إيه', intent: 'YES' },
  { id: 'no', labelAr: 'لا', intent: 'NO' },
  { id: 'unsure', labelAr: 'مو متأكد', intent: 'UNSURE' },
];

export const QUICK_OPTIONS: Record<QuestionKind, QuickOption[]> = {
  MED_START: YES_NO_UNSURE,
  MED_CONTINUE: YES_NO_UNSURE,
  YES_NO: YES_NO_UNSURE,
  STOPPED_CHECK: [
    { id: 'stopped', labelAr: 'إيه وقفته', intent: 'STOPPED' },
    { id: 'still', labelAr: 'لا، للحين آخذه', intent: 'STILL_TAKING' },
    { id: 'unsure', labelAr: 'مو متأكد', intent: 'UNSURE' },
  ],
  DOSE_CHECK: [
    { id: 'new', labelAr: 'على الجرعة الجديدة', intent: 'NEW_DOSE' },
    { id: 'old', labelAr: 'على القديمة', intent: 'OLD_DOSE' },
    { id: 'unsure', labelAr: 'مو متأكد', intent: 'UNSURE' },
  ],
  OPEN_MEDS: [{ id: 'none', labelAr: 'لا، بس أدوية الدكتور', intent: 'NONE' }],
};

/** An explicit tap is trusted almost fully (the person chose it), but not as a human-confirmed record. */
export const QUICK_CONFIDENCE = 0.95;

/** A tap expressed as a parse result, so every answer path shares toEvidenceClaim. */
export function quickParse(option: QuickOption): ParseResult {
  return { intent: option.intent, meds: [], ambiguousMeds: [], confidence: QUICK_CONFIDENCE, cues: [`button:${option.id}`] };
}

// ── Evidence ────────────────────────────────────────────────────────────────

export type AnswerMode = 'voice' | 'text' | 'button';

export function sourceFor(mode: AnswerMode, family: boolean): EvidenceSource {
  if (family) return 'family';
  return mode === 'voice' ? 'patient_voice' : 'patient_app';
}

/** Does this parse need a human to look (low confidence, unsure, not understood)? */
export function needsHuman(parse: ParseResult): boolean {
  if (parse.extractionDiscarded) return false;
  return parse.confidence < VERIFY_THRESHOLD || parse.intent === 'UNSURE' || parse.intent === 'UNKNOWN' || parse.intent === 'NEVER_STARTED' ||
    !!parse.statements?.some((statement) => statement.use === 'uncertain' || statement.use === 'mention' || statement.use === 'historical') ||
    (parse.intent === 'MENTIONS_MEDS' && (parse.ambiguousMeds.length > 0 || parse.meds.length === 0));
}

export interface AnswerEvidenceArgs {
  question: Question;
  parse: ParseResult;
  rawText: string;
  mode: AnswerMode;
  family: boolean;
  patientId: string;
  /** The patient's own day since discharge. */
  day: number;
  idPrefix: string;
  transcriptConfirmed?: boolean;
}

/** Evidence records for one answer (claims via toEvidenceClaim). Empty for "no other medicines". */
export function evidenceForAnswer(a: AnswerEvidenceArgs): Evidence[] {
  const parse = a.transcriptConfirmed ? confirmTranscript(a.parse) : a.parse;
  const speech = a.mode === 'voice' ? parse.speech : undefined;
  return answerToEvidence(a.rawText, parse, {
    questionKind: a.question.kind,
    patientId: a.patientId,
    ...(a.question.taskId ? { taskId: a.question.taskId } : {}),
    ...(a.question.drugId ? { expectedDrugId: a.question.drugId } : {}),
    day: a.day,
    source: sourceFor(a.mode, a.family),
    idPrefix: a.idPrefix,
    ...(speech ? { voice: {
      ...(speech.recognitionConfidence !== undefined ? { recognitionConfidence: speech.recognitionConfidence } : {}),
      interpretationConfidence: speech.interpretationConfidence,
      transcriptConfirmed: !!a.transcriptConfirmed && !speech.conflict,
      ...(speech.conflict ? { alternativesDisagreed: true as const } : {}),
    } } : {}),
  });
}

/** One-line English note for the audit entry of a saved answer. */
export function answerAuditNote(evidence: readonly Evidence[], mode: AnswerMode, family: boolean, discardedText?: string): string {
  const source = SOURCE_LABEL[sourceFor(mode, family)];
  if (evidence.length === 0) return discardedText === undefined
    ? `${source}: no other medicines` : `${source}: patient discarded extracted names · «${discardedText}»`;
  const claims = evidence.map((e) => `${CLAIM_LABEL[e.claim]} ${Math.round(e.confidence * 100)}%`).join(', ');
  return `${source} (${mode}): ${claims}`;
}

export function openMedsOutcome(parse: ParseResult, evidence: readonly Evidence[]): OpenMedsOutcome {
  if (parse.extractionDiscarded) return 'DISCARDED';
  if (!evidence.length) return 'NONE';
  if (evidence.some((e) => e.claim === 'UNSURE')) return 'UNCERTAIN';
  if (evidence.some((e) => e.claim === 'TAKING_UNLISTED' && !e.drugId)) return 'UNKNOWN_MEDICINE';
  return 'REPORTED';
}

/** OPEN_MEDS: keep only the medicine chips the person left in place. */
export function withKeptMeds(parse: ParseResult, keptMeds: readonly string[], keptAmbiguous: readonly MedMention[]): ParseResult {
  const meds = parse.meds.filter((m) => keptMeds.includes(m));
  const ambiguousMeds = parse.ambiguousMeds.filter((m) => keptAmbiguous.includes(m));
  const statements = parse.statements?.filter((s) => s.drugIds.length === 1
    ? meds.includes(s.drugIds[0]!) : ambiguousMeds.some((m) => m.text === s.text));
  const extractionDiscarded = (parse.meds.length + parse.ambiguousMeds.length > 0) && !meds.length && !ambiguousMeds.length && !parse.unknownUse;
  return { ...parse, meds, ambiguousMeds, statements, extractionDiscarded };
}

/** Gaps routed to clinicians that this check-in's answers touched (for the done screen). */
export function gapsFromAnswers(gaps: readonly Gap[], evidenceIds: readonly string[], taskIds: readonly string[]): Gap[] {
  return gaps.filter(
    (g) => g.route !== 'PATIENT_REMINDER' && (g.evidenceIds.some((id) => evidenceIds.includes(id)) || (!!g.taskId && taskIds.includes(g.taskId))),
  );
}

// ── State machine ───────────────────────────────────────────────────────────

export type CheckinPhase = 'intro' | 'question' | 'listening' | 'understanding' | 'echo' | 'saved' | 'done';
export type VoiceError = 'unsupported' | 'permission_denied' | 'no_speech' | 'network' | 'audio_capture' | 'unknown';

export interface PendingAnswer {
  text: string;
  mode: 'voice' | 'text';
  asrConfidence?: number;
  recognitionParse?: ParseResult;
  parse?: ParseResult;
  keptMeds: string[];
  keptAmbiguous: MedMention[];
}

export interface CheckinRecord {
  questionId: string;
  taskId?: string;
  summaryAr: string;
  evidenceIds: string[];
  needsHuman: boolean;
}

export interface CheckinState {
  phase: CheckinPhase;
  index: number;
  total: number;
  transcript: string;
  answer?: PendingAnswer;
  error?: VoiceError;
  textOpen: boolean;
  records: CheckinRecord[];
}

export type CheckinEvent =
  | { type: 'PROPOSE_VOICE'; text: string; parse: ParseResult }
  | { type: 'START' }
  | { type: 'LISTEN_START' }
  | { type: 'LISTEN_INTERIM'; text: string }
  | { type: 'LISTEN_FINAL'; text: string; asrConfidence?: number; parse?: ParseResult }
  | { type: 'LISTEN_ERROR'; error: VoiceError }
  | { type: 'LISTEN_CANCEL' }
  | { type: 'SUBMIT_TEXT'; text: string }
  | { type: 'PARSED'; parse: ParseResult }
  | { type: 'REMOVE_MED'; drugId?: string; mention?: MedMention }
  | { type: 'RETRY' }
  | { type: 'SAVED'; record: CheckinRecord }
  | { type: 'NEXT' }
  | { type: 'TOGGLE_TEXT' };

export function initialCheckin(total: number): CheckinState {
  return { phase: 'intro', index: 0, total, transcript: '', textOpen: false, records: [] };
}

const toQuestion = (s: CheckinState, index: number): CheckinState => ({
  ...s,
  phase: 'question',
  index,
  transcript: '',
  answer: undefined,
  error: undefined,
  textOpen: false,
});

export function checkinReducer(s: CheckinState, e: CheckinEvent): CheckinState {
  switch (e.type) {
    case 'PROPOSE_VOICE':
      if (s.phase !== 'question') return s;
      return checkinReducer({
        ...s, phase: 'understanding',
        answer: { text: e.text, mode: 'voice', keptMeds: [], keptAmbiguous: [] },
      }, { type: 'PARSED', parse: e.parse });

    case 'START':
      if (s.phase !== 'intro') return s;
      return s.total === 0 ? { ...s, phase: 'done' } : toQuestion(s, 0);

    case 'LISTEN_START':
      if (s.phase !== 'question') return s;
      return { ...s, phase: 'listening', transcript: '', error: undefined };

    case 'LISTEN_INTERIM':
      return s.phase === 'listening' ? { ...s, transcript: e.text } : s;

    case 'LISTEN_FINAL': {
      if (s.phase !== 'listening') return s;
      const text = e.text.trim();
      if (!text) return { ...s, phase: 'question', error: 'no_speech' };
      return {
        ...s,
        phase: 'understanding',
        transcript: text,
        answer: { text, mode: 'voice', ...(e.asrConfidence !== undefined ? { asrConfidence: e.asrConfidence } : {}), ...(e.parse ? { recognitionParse: e.parse } : {}), keptMeds: [], keptAmbiguous: [] },
      };
    }

    case 'LISTEN_ERROR':
      if (s.phase !== 'listening' && s.phase !== 'question') return s;
      return { ...s, phase: 'question', error: e.error };

    case 'LISTEN_CANCEL':
      return s.phase === 'listening' ? { ...s, phase: 'question' } : s;

    case 'SUBMIT_TEXT': {
      const text = e.text.trim();
      if (s.phase !== 'question' || !text) return s;
      return { ...s, phase: 'understanding', error: undefined, answer: { text, mode: 'text', keptMeds: [], keptAmbiguous: [] } };
    }

    case 'PARSED':
      if (s.phase !== 'understanding' || !s.answer) return s;
      return {
        ...s,
        phase: 'echo',
        answer: { ...s.answer, parse: e.parse, keptMeds: [...e.parse.meds], keptAmbiguous: [...e.parse.ambiguousMeds] },
      };

    case 'REMOVE_MED':
      if (s.phase !== 'echo' || !s.answer) return s;
      return {
        ...s,
        answer: {
          ...s.answer,
          keptMeds: s.answer.keptMeds.filter((m) => m !== e.drugId),
          keptAmbiguous: s.answer.keptAmbiguous.filter((m) => m !== e.mention),
        },
      };

    case 'RETRY':
      return s.phase === 'echo' || s.phase === 'question' ? toQuestion(s, s.index) : s;

    case 'SAVED':
      if (s.phase !== 'question' && s.phase !== 'echo') return s;
      return { ...s, phase: 'saved', records: [...s.records, e.record] };

    case 'NEXT':
      if (s.phase !== 'saved') return s;
      return s.index + 1 < s.total ? toQuestion(s, s.index + 1) : { ...s, phase: 'done', answer: undefined };

    case 'TOGGLE_TEXT':
      return s.phase === 'question' ? { ...s, textOpen: !s.textOpen } : s;
  }
}

/** Friendly Arabic message per voice problem. The buttons always stay available. */
export const VOICE_ERROR_AR: Record<VoiceError, string> = {
  unsupported: 'الصوت ما يشتغل في هذا المتصفح، استخدم الأزرار',
  permission_denied: 'ما قدرنا نستخدم المايك. اسمح للمتصفح يستخدمه، أو جاوب بالأزرار',
  no_speech: 'ما سمعنا شي، جرّب مرة ثانية أو استخدم الأزرار',
  network: 'الصوت يحتاج إنترنت. تأكد من الاتصال أو استخدم الأزرار',
  audio_capture: 'ما لقينا مايك في الجهاز، استخدم الأزرار',
  unknown: 'صار خلل في الصوت، جرّب مرة ثانية أو استخدم الأزرار',
};
