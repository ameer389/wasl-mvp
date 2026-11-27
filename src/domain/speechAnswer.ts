import { parseAnswer, toEvidenceClaim, UNSURE_CONFIDENCE_CAP, type ParseOptions, type ParseResult } from './arabicParser';
import { VERIFY_THRESHOLD } from './medicationEvidence';

export interface SpeechAlternative {
  transcript: string;
  /** Undefined means the implementation supplied no usable value. Zero is a low value. */
  confidence?: number;
}

export function recognitionConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
}

function meaning(parse: ParseResult, options: ParseOptions): string {
  const claims = toEvidenceClaim({ ...parse, confidence: 1 }, options.questionKind);
  return JSON.stringify({
    intent: parse.intent,
    medicines: parse.meds.filter((id) => id !== options.drugId || options.questionKind === 'OPEN_MEDS').sort(),
    candidates: parse.ambiguousMeds.map((m) => m.drugIds.join('|')).sort(),
    claims: claims.map((c) => [c.claim, c.drugId ?? '', c.candidateDrugIds ?? []]).map((c) => JSON.stringify(c)).sort(),
  });
}

/** Prefer recognizer evidence, and let disagreement force clarification instead of choosing a convenient parse. */
export function interpretSpeech(alternatives: readonly SpeechAlternative[], options: ParseOptions) {
  const choices = alternatives.filter((a) => a.transcript.trim()).map((a) => ({
    transcript: a.transcript,
    confidence: recognitionConfidence(a.confidence),
    parsed: parseAnswer(a.transcript, { ...options, asrConfidence: undefined }),
  })).sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
  const first = choices[0];
  if (!first) return undefined;
  const conflict = new Set(choices.map(({ parsed }) => meaning(parsed, options))).size > 1;
  const interpretationConfidence = first.parsed.confidence;
  const combined = first.confidence === undefined
    ? Math.min(interpretationConfidence, VERIFY_THRESHOLD - 0.01)
    : interpretationConfidence * first.confidence;
  const parse: ParseResult = {
    ...first.parsed,
    intent: conflict ? 'UNSURE' : first.parsed.intent,
    confidence: conflict ? Math.min(combined, UNSURE_CONFIDENCE_CAP) : combined,
    cues: [...first.parsed.cues, ...(conflict ? ['conflicting speech alternatives'] : [])],
    speech: { recognitionConfidence: first.confidence, interpretationConfidence, conflict },
  };
  return { text: first.transcript, parse };
}

/** An explicit echo can clear missing ASR confidence, but cannot lift a low score or a conflict. */
export function confirmTranscript(parse: ParseResult): ParseResult {
  const speech = parse.speech;
  return speech && !speech.conflict && speech.recognitionConfidence === undefined
    ? { ...parse, confidence: speech.interpretationConfidence }
    : parse;
}
