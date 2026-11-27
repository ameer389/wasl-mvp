/**
 * Saudi-dialect answer understanding (rule-based, explainable, no ML).
 *
 * Turns a check-in answer (speech-to-text or typed) into an intent, the
 * medicines it mentions, a confidence and the cues used. The question kind
 * matters: «ما وقفتها» means "still taking" to «وقّفت …؟» but "yes" to
 * «للحين مستمر على …؟». Wording per kind is fixed in questionPlanner.ts.
 *
 * Confidence = how far the answer can be trusted as evidence. Anything below
 * VERIFY_THRESHOLD (0.7) never verifies a task and is routed to a human.
 */
import { DRUGS } from './drugs';
import { VERIFY_THRESHOLD } from './medicationEvidence';
import type { Evidence, EvidenceClaim, EvidenceSource, QuestionKind, TaskType } from './types';

export type AnswerIntent =
  | 'YES'
  | 'NO'
  | 'UNSURE'
  | 'STOPPED'
  | 'NEVER_STARTED'
  | 'STILL_TAKING'
  | 'NEW_DOSE'
  | 'OLD_DOSE'
  | 'NONE'
  | 'MENTIONS_MEDS'
  | 'UNKNOWN';

// ═══ Lexicons (normalized forms — see normalizeArabic) ═══════════════════════

/** Reply particles. Sentence-initial «لا» is the answer "no", not a verb negator. */
const YES_WORDS: Record<string, number> = {
  ايه: 0.9, اي: 0.85, ايوه: 0.9, ايوا: 0.9, اييه: 0.9, نعم: 0.9, اكيد: 0.85, طبعا: 0.85, اجل: 0.8, بلي: 0.8,
  تمام: 0.6, صح: 0.6, اوكي: 0.6, ok: 0.6, yes: 0.8,
};
const NO_WORDS: Record<string, number> = { لا: 0.9, لاا: 0.9, كلا: 0.9, no: 0.8, ابد: 0.8, ابدا: 0.8 };

/** Uncertainty: "don't know", hedges, and "someone else handles it". */
const UNSURE_PHRASES: Record<string, number> = {
  مدري: 0.9, مادري: 0.9, 'ما ادري': 0.9, 'ما اعرف': 0.9, 'مااعرف': 0.9, 'مو متاكد': 0.9, 'مب متاكد': 0.9,
  'مش متاكد': 0.9, 'ماني متاكد': 0.9, 'مو اكيد': 0.9, 'ما اذكر': 0.9, 'مااذكر': 0.9, 'ما اتذكر': 0.9,
  'ما ني متاكد': 0.9, 'الله اعلم': 0.8, 'نسيت اذا': 0.9,
  // hedges outweigh a single yes/no: «اظن ايه» is not a confirmed yes
  اظن: 1.0, اعتقد: 1.0, يمكن: 1.0, ممكن: 0.9, احتمال: 1.0, يمكنن: 1.0,
  // delegation: someone else knows / gives the medicine
  'اللي يعطيه': 0.8, 'اللي تعطيه': 0.8, 'اللي يعطيني': 0.8, 'اللي تعرف': 0.8, 'اللي يعرف': 0.8, اساله: 0.8, اسالها: 0.8,
  'اسال': 0.7,
};

/** Partial adherence counts as "no" for start/continue questions. */
const PARTIAL_PHRASES: Record<string, number> = {
  ساعات: 0.9, احيانا: 0.9, 'بعض الايام': 0.9, 'مره ايه ومره لا': 1, 'يوم ايه ويوم لا': 1, 'مو دايم': 0.9,
};

/** Multi-word cues, checked before single tokens. category → weight. */
type Category =
  | 'START'
  | 'TAKE'
  | 'STOP'
  | 'NO_LONGER'
  | 'CONTINUE'
  | 'FORGOT'
  | 'RAN_OUT'
  | 'DONE_WITH'
  | 'NEW_ADJ'
  | 'OLD_ADJ'
  | 'CHANGE'
  | 'INSTRUCTED'
  | 'NONE'
  | 'MED_NOUN';

const PHRASES: Array<[string, Category, number]> = [
  ['ما عاد', 'NO_LONGER', 0.95], ['ماعاد', 'NO_LONGER', 0.95], ['ما عادت', 'NO_LONGER', 0.95], ['ما عدت', 'NO_LONGER', 0.95],
  ['ما عاد ياخذ', 'NO_LONGER', 0.95], ['ما زلت', 'CONTINUE', 0.8], ['مازلت', 'CONTINUE', 0.8], ['ما زال', 'CONTINUE', 0.8],
  ['مازال', 'CONTINUE', 0.8], ['لا زلت', 'CONTINUE', 0.8], ['لازلت', 'CONTINUE', 0.8], ['كل يوم', 'CONTINUE', 0.7],
  ['زي قبل', 'OLD_ADJ', 0.85], ['مثل قبل', 'OLD_ADJ', 0.85], ['مثل اول', 'OLD_ADJ', 0.85], ['زي اول', 'OLD_ADJ', 0.85],
  ['مثل ما كنت', 'OLD_ADJ', 0.85], ['زي ما كنت', 'OLD_ADJ', 0.85],
  ['باقي علي نفس الجرعه', 'OLD_ADJ', 0.85],
  ['زي ما', 'INSTRUCTED', 0.7], ['مثل ما', 'INSTRUCTED', 0.7], ['حسب ما', 'INSTRUCTED', 0.7], ['اللي قالوا', 'INSTRUCTED', 0.7],
  ['اللي قال', 'INSTRUCTED', 0.7], ['اللي كتبوا', 'INSTRUCTED', 0.7],
  ['ما فيه', 'NONE', 0.9], ['مافيه', 'NONE', 0.9], ['ما في', 'NONE', 0.9], ['ولا شي', 'NONE', 0.9], ['بس هذي', 'NONE', 0.9],
  ['بس هذا', 'NONE', 0.9], ['بس هذول', 'NONE', 0.9], ['بس اللي', 'NONE', 0.8], ['غير اللي', 'NONE', 0.8],
];

/** Single-token stems: token starts with stem → category. Longest stem wins. */
const STEMS: Array<[string, Category, number]> = [
  ['بديت', 'START', 0.85], ['بدينا', 'START', 0.85], ['بدات', 'START', 0.85], ['بدا', 'START', 0.8], ['بدت', 'START', 0.85],
  ['يبدا', 'START', 0.8], ['نبدا', 'START', 0.8],
  ['اخذ', 'TAKE', 0.8], ['ياخذ', 'TAKE', 0.8], ['تاخذ', 'TAKE', 0.8], ['ناخذ', 'TAKE', 0.8], ['نعطي', 'TAKE', 0.8],
  ['اعطي', 'TAKE', 0.8], ['استخدم', 'TAKE', 0.8], ['يستخدم', 'TAKE', 0.8], ['تستخدم', 'TAKE', 0.8], ['اشرب', 'TAKE', 0.7],
  ['يشرب', 'TAKE', 0.7], ['تشرب', 'TAKE', 0.7],
  ['وقف', 'STOP', 0.85], ['اوقف', 'STOP', 0.85], ['نوقف', 'STOP', 0.85], ['يوقف', 'STOP', 0.85], ['توقف', 'STOP', 0.85],
  ['ترك', 'STOP', 0.85], ['بطل', 'STOP', 0.85], ['قطعت', 'STOP', 0.8], ['قطعنا', 'STOP', 0.8], ['شلنا', 'STOP', 0.7],
  ['شلت', 'STOP', 0.7],
  ['مستمر', 'CONTINUE', 0.8], ['باقي', 'CONTINUE', 0.7], ['للحين', 'CONTINUE', 0.7], ['لحين', 'CONTINUE', 0.7],
  ['لسا', 'CONTINUE', 0.7], ['لسه', 'CONTINUE', 0.7], ['دايم', 'CONTINUE', 0.7], ['يوميا', 'CONTINUE', 0.7],
  ['نسيت', 'FORGOT', 0.35], ['انسي', 'FORGOT', 0.35], ['نسينا', 'FORGOT', 0.35],
  ['خلصت', 'RAN_OUT', 0.6], ['خلصو', 'RAN_OUT', 0.6], ['خلصن', 'RAN_OUT', 0.6],
  ['خلاص', 'DONE_WITH', 0.5],
  ['الجديد', 'NEW_ADJ', 0.8], ['جديد', 'NEW_ADJ', 0.7], ['القديم', 'OLD_ADJ', 0.8], ['قديم', 'OLD_ADJ', 0.7],
  ['غير', 'CHANGE', 0.8], ['نزلت', 'CHANGE', 0.8], ['نزلنا', 'CHANGE', 0.8], ['زودت', 'CHANGE', 0.8], ['قللت', 'CHANGE', 0.8],
  ['حبوب', 'MED_NOUN', 0.6], ['حبه', 'MED_NOUN', 0.6], ['دوا', 'MED_NOUN', 0.6], ['ادويه', 'MED_NOUN', 0.6],
  ['ابره', 'MED_NOUN', 0.6], ['بخاخ', 'MED_NOUN', 0.6], ['شراب', 'MED_NOUN', 0.6], ['اعشاب', 'MED_NOUN', 0.6],
  ['عشبه', 'MED_NOUN', 0.6], ['مرهم', 'MED_NOUN', 0.6], ['فيتامين', 'MED_NOUN', 0.6], ['مسكن', 'MED_NOUN', 0.6],
];
// "غير" alone is also "other/except" — only the verb forms count as CHANGE.
const CHANGE_REQUIRES_SUFFIX = new Set(['غير']);

/** Negators that flip the next cue («ما وقفتها», «مو كل يوم»). Sentence-initial «لا» is excluded. */
const NEGATORS = new Set(['ما', 'مو', 'مب', 'مش', 'ماني', 'موب', 'لم', 'لا']);
/** Words skipped between a negator and the cue it negates (fillers and modals: «ما اقدر اوقفها»). */
const FILLERS = new Set([
  'والله', 'يعني', 'طيب', 'الصراحه', 'صراحه', 'ترا', 'تري', 'اصلا', 'عاد',
  'اقدر', 'يقدر', 'تقدر', 'نقدر', 'ابي', 'ابغي', 'ابا', 'يبي', 'يبغي', 'تبي', 'نبي',
]);

/** How each cue category reads for each question kind: [plain, negated]. null = no effect. */
type Reading = [AnswerIntent | null, AnswerIntent | null];
const START_LIKE: Partial<Record<Category, Reading>> = {
  START: ['YES', 'NO'],
  TAKE: ['YES', 'NO'],
  CONTINUE: ['YES', 'NO'],
  STOP: ['NO', 'YES'],
  NO_LONGER: ['NO', 'YES'],
  FORGOT: ['NO', null],
  RAN_OUT: ['NO', null],
};
const READINGS: Record<QuestionKind, Partial<Record<Category, Reading>>> = {
  MED_START: { ...START_LIKE, FORGOT: [null, null], RAN_OUT: [null, null] },
  MED_CONTINUE: START_LIKE,
  YES_NO: {},
  STOPPED_CHECK: {
    STOP: ['STOPPED', 'STILL_TAKING'],
    NO_LONGER: ['STOPPED', 'STILL_TAKING'],
    DONE_WITH: ['STOPPED', null],
    TAKE: ['STILL_TAKING', 'STOPPED'],
    CONTINUE: ['STILL_TAKING', 'STOPPED'],
  },
  DOSE_CHECK: {
    NEW_ADJ: ['NEW_DOSE', 'NO'],
    CHANGE: [null, 'NO'],
    INSTRUCTED: [null, 'NO'],
    OLD_ADJ: ['OLD_DOSE', 'UNSURE'],
  },
  OPEN_MEDS: {
    NONE: ['NONE', null],
    TAKE: ['MENTIONS_MEDS', 'NONE'],
    MED_NOUN: ['MENTIONS_MEDS', null],
  },
};
/** Reading of the reply particles per kind. */
const ANSWER_READING: Record<QuestionKind, { yes: AnswerIntent; no: AnswerIntent }> = {
  MED_START: { yes: 'YES', no: 'NO' },
  MED_CONTINUE: { yes: 'YES', no: 'NO' },
  YES_NO: { yes: 'YES', no: 'NO' },
  STOPPED_CHECK: { yes: 'STOPPED', no: 'STILL_TAKING' },
  DOSE_CHECK: { yes: 'NEW_DOSE', no: 'NO' },
  OPEN_MEDS: { yes: 'MENTIONS_MEDS', no: 'NONE' },
};
/** Weight multipliers for particles/categories that are weak for a kind. */
const KIND_WEIGHT: Partial<Record<QuestionKind, Partial<Record<Category | 'YES_WORD', number>>>> = {
  OPEN_MEDS: { TAKE: 0.5, YES_WORD: 0.5 },
};
/** Weight of a medicine mention in OPEN_MEDS (beats a «لا» in «لا… ايه صح، اخذ نكسيوم»). */
const MED_MENTION_WEIGHT = 1.2;

/** On exact ties prefer the answer that keeps a human in the loop. */
const SAFETY_ORDER: AnswerIntent[] = [
  'MENTIONS_MEDS', 'UNSURE', 'STILL_TAKING', 'OLD_DOSE', 'NO', 'NONE', 'STOPPED', 'NEW_DOSE', 'YES',
];

export const UNSURE_CONFIDENCE_CAP = 0.45;
export const UNKNOWN_CONFIDENCE = 0.2;

// ═══ Normalization ══════════════════════════════════════════════════════════

const TASHKEEL = /[ً-ٰٟۖ-ۭ]/g;
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabic(text: string): string {
  return text
    .replace(TASHKEEL, '')
    .replace(/ـ/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation (incl. ، ؟ « ») → space
    .replace(/(\p{L})\1{2,}/gu, '$1') // «لاااا» → «لا»
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══ Medicine mentions ══════════════════════════════════════════════════════

export interface MedMention {
  /** Normalized words that matched. */
  text: string;
  drugIds: string[];
}

const stripAl = (t: string) => (t.startsWith('ال') && t.length > 3 ? t.slice(2) : t);
const stripConj = (t: string) => (/^[وفب]/.test(t) && t.length > 3 ? t.slice(1) : t);
/** Canonical first word of a dictionary name: no article, حبوب→حبه. (Names are never prefix-stripped.) */
const canonHead = (t: string) => {
  const core = stripAl(t);
  return core === 'حبوب' ? 'حبه' : core;
};
/** Possible readings of the first word of an answer window: as-is, or with و/ف/ب detached. */
const headCandidates = (t: string) => [...new Set([canonHead(t), canonHead(stripConj(t))])];

interface NameEntry {
  words: string[];
  drugIds: Set<string>;
}

const NAME_INDEX: NameEntry[] = (() => {
  const map = new Map<string, Set<string>>();
  for (const d of DRUGS) {
    const names = [d.generic, d.nameAr, ...d.brands, ...d.informalNamesAr];
    for (const name of names) {
      const words = normalizeArabic(name).split(' ').filter(Boolean);
      if (words.length === 0) continue;
      words[0] = canonHead(words[0] as string);
      const key = words.join(' ');
      const set = map.get(key) ?? new Set<string>();
      set.add(d.id);
      map.set(key, set);
    }
  }
  return [...map.entries()]
    .map(([key, drugIds]) => ({ words: key.split(' '), drugIds }))
    .sort((a, b) => b.words.join(' ').length - a.words.join(' ').length);
})();

/** Find medicine names (generic, brand, informal) — longest match first, non-overlapping. */
export function findMedMentions(normalized: string): MedMention[] {
  const tokens = normalized.split(' ').filter(Boolean);
  const used = new Array<boolean>(tokens.length).fill(false);
  const mentions: MedMention[] = [];
  for (const entry of NAME_INDEX) {
    const n = entry.words.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const window = tokens.slice(i, i + n);
      const rest = window.slice(1).map(stripAl);
      if (!headCandidates(window[0] as string).includes(entry.words[0] as string)) continue;
      if (rest.some((w, k) => w !== stripAl(entry.words[k + 1] as string))) continue;
      for (let k = i; k < i + n; k++) used[k] = true;
      mentions.push({ text: window.join(' '), drugIds: [...entry.drugIds].sort() });
    }
  }
  return mentions;
}

// ═══ Parsing ════════════════════════════════════════════════════════════════

export interface ParseOptions {
  questionKind: QuestionKind;
  /** The medicine the question was about (resolves shared informal names). */
  drugId?: string;
  taskType?: TaskType;
  /** Speech recogniser confidence 0..1, if the answer was spoken. */
  asrConfidence?: number;
}

export interface ParseResult {
  intent: AnswerIntent;
  /** Medicines identified unambiguously. */
  meds: string[];
  /** Mentions that could be several medicines (e.g. «حبة الضغط»). */
  ambiguousMeds: MedMention[];
  /** Trust in this answer as evidence, 0..1 (already combined with ASR confidence). */
  confidence: number;
  /** Human-readable cues used, for explainability. */
  cues: string[];
  /** Per-clause meaning, separate from names found for extraction metrics. */
  statements?: MedicationStatement[];
  unknownUse?: boolean;
  extractionDiscarded?: boolean;
  speech?: { recognitionConfidence?: number; interpretationConfidence: number; conflict: boolean };
}

interface MedicationStatement extends MedMention {
  use: 'current' | 'not_current' | 'historical' | 'mention' | 'uncertain';
}

interface Cue {
  intent: AnswerIntent;
  weight: number;
  label: string;
}

function stemCategory(token: string): { category: Category; weight: number; stem: string } | null {
  let best: { category: Category; weight: number; stem: string } | null = null;
  for (const [stem, category, weight] of STEMS) {
    if (!token.startsWith(stem)) continue;
    if (CHANGE_REQUIRES_SUFFIX.has(stem) && token === stem) continue;
    if (!best || stem.length > best.stem.length) best = { category, weight, stem };
  }
  return best;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function parseCues(text: string, options: ParseOptions, scoped?: string[]): ParseResult {
  const kind = options.questionKind;
  const normalized = normalizeArabic(text);
  const tokens = (scoped?.join(' # ') ?? normalized).split(' ').filter(Boolean);
  const consumed = new Array<boolean>(tokens.length).fill(false);
  const cues: Cue[] = [];
  const readings = READINGS[kind];
  const weightFor = (key: Category | 'YES_WORD') => KIND_WEIGHT[kind]?.[key] ?? 1;

  const addCategory = (category: Category, weight: number, negated: boolean, label: string) => {
    const reading = readings[category];
    const intent = kind === 'STOPPED_CHECK' && category === 'START' && negated
      ? 'NEVER_STARTED' : reading ? reading[negated ? 1 : 0] : null;
    if (intent) cues.push({ intent, weight: weight * weightFor(category), label: `${negated ? 'neg+' : ''}${label}→${intent}` });
  };

  const matchAt = (i: number, phrase: string) => {
    const words = phrase.split(' ');
    return words.every((w, k) => tokens[i + k] === w);
  };
  const precededByNegator = (i: number): boolean => {
    let j = i - 1;
    while (j >= 0 && FILLERS.has(tokens[j] as string)) j--;
    // Sentence-initial «لا» is the reply "no", not a negator.
    if (j < 0) return false;
    const t = tokens[j] as string;
    if (t === 'لا' && (j === 0 || tokens[j - 1] === '#')) return false;
    return (NEGATORS.has(t) || NEGATORS.has(t.slice(1)) && t.startsWith('و')) && !consumed[j];
  };

  // 1) medicines
  const mentions = findMedMentions(normalized);
  const meds: string[] = [];
  const ambiguousMeds: MedMention[] = [];
  for (const m of mentions) {
    const ids = m.drugIds.length > 1 && options.drugId && m.drugIds.includes(options.drugId) ? [options.drugId] : m.drugIds;
    if (ids.length === 1) {
      if (!meds.includes(ids[0] as string)) meds.push(ids[0] as string);
    } else {
      ambiguousMeds.push({ text: m.text, drugIds: ids });
    }
    // mark the mention's tokens as consumed so «حبه» etc. aren't re-read as cues
    const words = m.text.split(' ');
    for (let i = 0; i + words.length <= tokens.length; i++) {
      if (words.every((w, k) => tokens[i + k] === w)) words.forEach((_, k) => (consumed[i + k] = true));
    }
    if (kind === 'OPEN_MEDS') cues.push({ intent: 'MENTIONS_MEDS', weight: MED_MENTION_WEIGHT, label: `med:${m.text}→${ids.join('|')}` });
  }

  // 2) multi-word phrases (uncertainty, partial adherence, category phrases), longest first
  const phraseTable: Array<[string, (i: number) => void]> = [
    ...Object.entries(UNSURE_PHRASES).map(([p, w]) => [p, () => cues.push({ intent: 'UNSURE', weight: w, label: `unsure:${p}` })] as [string, (i: number) => void]),
    ...Object.entries(PARTIAL_PHRASES).map(
      ([p, w]) =>
        [p, () => (kind === 'MED_START' || kind === 'MED_CONTINUE' || kind === 'YES_NO') && cues.push({ intent: 'NO', weight: w, label: `partial:${p}→NO` })] as [
          string,
          (i: number) => void,
        ],
    ),
    ...PHRASES.map(([p, c, w]) => [p, (i: number) => addCategory(c, w, precededByNegator(i), p)] as [string, (i: number) => void]),
  ].sort((a, b) => b[0].length - a[0].length);

  for (const [phrase, apply] of phraseTable) {
    const n = phrase.split(' ').length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (consumed.slice(i, i + n).some(Boolean) || !matchAt(i, phrase)) continue;
      apply(i);
      for (let k = i; k < i + n; k++) consumed[k] = true;
      // «ما عاد ياخذها»: "no longer" absorbs the verb that follows it.
      const next = tokens[i + n];
      if (next && !consumed[i + n] && PHRASES.some(([p, c]) => p === phrase && c === 'NO_LONGER')) {
        const verb = stemCategory(next) ?? stemCategory(stripConj(next));
        if (verb && (verb.category === 'TAKE' || verb.category === 'START')) consumed[i + n] = true;
      }
    }
  }

  // 3) single tokens: reply particles, then verb/adjective stems (incl. attached «ما»)
  const answers = ANSWER_READING[kind];
  const isCueToken = (t: string | undefined) => !!t && (!!stemCategory(t) || !!stemCategory(stripConj(t)) || /^ما./.test(t));
  tokens.forEach((token, i) => {
    if (consumed[i]) return;
    const next = tokens[i + 1];

    if (token in YES_WORDS && !(token === 'اي' && /^(وحده|واحد|دوا|شي|حبه)$/.test(next ?? ''))) {
      cues.push({ intent: answers.yes, weight: (YES_WORDS[token] as number) * weightFor('YES_WORD'), label: `yes:${token}→${answers.yes}` });
      consumed[i] = true;
      return;
    }
    if (token in NO_WORDS) {
      // «ابد ما …» = "never" (intensifies the negation that follows); mid-sentence «لا» before a cue negates it.
      const intensifier = (token === 'ابد' || token === 'ابدا') &&
        ((!!next && NEGATORS.has(next)) || (!next && cues.some((c) => c.label.startsWith('neg+'))));
      const negator = token === 'لا' && i > 0 && tokens[i - 1] !== '#' && isCueToken(next);
      if (negator) return; // left unconsumed so the next cue sees it
      if (!intensifier) cues.push({ intent: answers.no, weight: NO_WORDS[token] as number, label: `no:${token}→${answers.no}` });
      consumed[i] = true;
      return;
    }
    if (NEGATORS.has(token)) return; // read by the cue that follows

    // attached negation: «ماوقفتها», «مابديت»
    let core = token;
    let negated = precededByNegator(i);
    if (core.startsWith('وما') && core.length > 5) core = core.slice(1);
    if (core.startsWith('ما') && core.length > 4 && stemCategory(core.slice(2))) {
      core = core.slice(2);
      negated = true;
    }
    // Try the word as-is first: «وقفتها» starts with و but it is the verb, not "and".
    const hit = stemCategory(core) ?? stemCategory(stripConj(core)) ?? stemCategory(stripAl(core));
    if (hit) {
      // A time adverb qualifies the following action. It does not assert continued use.
      if (scoped && /^(?:للحين|لحين|لسا|لسه)$/.test(core) &&
          !/^(?:عليه|عليها)$/.test(next ?? '')) return;
      if (scoped && core === 'باقي' && next && NEGATORS.has(next)) return;
      addCategory(hit.category, hit.weight, negated, token);
      consumed[i] = true;
    }
  });

  // 4) score
  const scores = new Map<AnswerIntent, number>();
  for (const c of cues) scores.set(c.intent, (scores.get(c.intent) ?? 0) + c.weight);
  if (kind === 'OPEN_MEDS' && (meds.length > 0 || ambiguousMeds.length > 0)) {
    // A named medicine always reaches a clinician, however the sentence started.
    scores.set('MENTIONS_MEDS', Math.max(scores.get('MENTIONS_MEDS') ?? 0, ...[...scores.values()].map((v) => v + 0.01)));
  }

  const asr = options.asrConfidence ?? 1;
  const cueLabels = cues.map((c) => c.label);
  if (scores.size === 0) {
    return { intent: 'UNKNOWN', meds, ambiguousMeds, confidence: round2(UNKNOWN_CONFIDENCE * asr), cues: [...cueLabels, 'no answer cue found'] };
  }

  const ranked = [...scores.entries()].sort(
    (a, b) => b[1] - a[1] || SAFETY_ORDER.indexOf(a[0]) - SAFETY_ORDER.indexOf(b[0]),
  );
  const [intent, top] = ranked[0] as [AnswerIntent, number];
  const second = ranked[1]?.[1] ?? 0;

  let confidence = Math.min(0.95, top);
  if (second > 0) confidence *= 1 - 0.6 * (second / top); // conflicting cues
  if (intent !== 'UNSURE' && scores.has('UNSURE')) confidence *= 0.6; // hedged
  const strongest = Math.max(...cues.filter((c) => c.intent === intent).map((c) => c.weight));
  if (tokens.length <= 1 && strongest < 0.8) confidence *= 0.8; // a lone weak word («تمام»)
  if (intent === 'UNSURE') confidence = Math.min(confidence, UNSURE_CONFIDENCE_CAP);
  confidence *= asr;

  const extra: string[] = [];
  if (second > 0) extra.push(`conflict: ${ranked[1]?.[0]} ${round2(second)} vs ${round2(top)}`);
  if (asr < 1) extra.push(`asr ×${asr}`);

  return { intent, meds, ambiguousMeds, confidence: round2(confidence), cues: [...cueLabels, ...extra] };
}

const USE = /(?:^| )(?:[ويتن]?اخذ|[ويتن]?استخدم|[ويتن]?اشرب|[ونت]?عطي|مستمر|ما زلت|ما زال|ياخذه)\p{L}*(?= |$)/u;
const NO_LONGER_USE = /(?:^| )(?:ما ?عاد(?:ت)?|ما عدت)(?= |$)/;
const NO_USE = /(?:^| )(?:(?:ما|مو|مب|مش|لم|ولا)\s*(?:[يتن]?اخذ|[يتن]?استخدم|[يتن]?اشرب|اعطي|نعطي|مستمر|بديت|بدا)|ما ?عاد|ما عدت|ت?وقفت|وقفنا|تركت)\p{L}*(?= |$)/u;
const HISTORICAL = /(?:^| )(?:كنت|كنا|كان|كانت|زمان|سابقا|اول|امس|قبل|(?:اخذت|اخذنا|استخدمت)(?:ه|ها|هم)?)(?= |$)/;
const OLD_COMPARISON = /(?:زي|مثل) (?:ما كنت(?: (?:اخذ|استخدم)(?:ه|ها)?(?: قبل التغيير)?)?|اول|قبل)/g;
const CURRENT = /(?:^| )(?:الحين|للحين|دحين|الان|الى الان|حاليا|اليوم|ما زلت|ما زال)(?= |$)/;
const BACKGROUND = /(?:^| )(?:كنت|كنا|كان|كانت|زمان|امس|سابقا)(?= |$)/;
const UNCERTAIN_USE = /(?:^| )(?:يمكن|ممكن|مدري|مادري|ما ادري|ما اعرف|اظن|اعتقد|مب متاكد|مو متاكد|ماني متاكد|هل)(?= |$)/;
const CONDITION = /(?:^| )(?:اذا|لو)(?= |$)/;
const FUTURE = /(?:^| )(?:ابي|ابغي|ودي|ناوي(?:ه)?|بنوي|راح|بكره|غدا|لازم|المفروض|اقدر|يقدر|تقدر|نقدر|(?:باخذ|بابدا|ببدا|باستخدم|باوقف|بيوقف|بيستخدم|بياخذ|بيسوي)(?:ه|ها|هم)?)(?= |$)/;
const REPORTED_INSTRUCTION = /^(?:(?:الدكتور|الطبيب|الممرضه) )?(?:قال|قالت|قالوا|وصاني|نصحني)(?= |$)/;
const PRIOR_START = /(?:^| )(?:كنت|كنا|كان|كانت|زمان|سابقا|قبل الخروج|قبل التنويم)(?= |$)/;
const NAME_UNCERTAINTY = /(?:^| )ما (?:اعرف|ادري) (?:وش )?اسم(?:ه|ها)(?= |$)/g;
const NEGATED_STOP = /(?:^| )(?:ما|مو|مب|لم)\s*(?:ت?وقف|ترك|بطل)\p{L}*(?= |$)/u;
const NONMED_ACTION: Partial<Record<TaskType, RegExp>> = {
  LAB_DONE: /(?:حللت|سويت التحليل|عملت التحليل|طلع التحليل|تحللت|حللنا)/,
  FOLLOWUP_BOOKED: /(?:حجزت|حجزنا|انحجز|حجزوا|تاكد الموعد)/,
  FOLLOWUP_ATTENDED: /(?:رحت|رحنا|حضر(?:ت|نا)?)(?= (?:الموعد|العياده|للعياده|المراجعه|للمراجعه)(?: |$)|$)|وصلت العياده/,
  WOUND_CHECK: /(?:فحصت|فحصنا|شيكت|شيكنا|شفت الجرح|كشفنا)/,
};

interface Clause {
  text: string;
  dependent: boolean;
  pastContext: boolean;
}

/** A comma alone cannot end a condition: «إذا توفر، آخذ …» is still hypothetical. */
function clauses(text: string): Clause[] {
  const parts = text.split(/[،,؛;.…؟!?\n]+/).flatMap((part) => normalizeArabic(part)
    .replace(/(^| )(?:بس|لكن|ولكن) /g, '|~')
    .replace(/ و(?=(?:الحين|للحين|دحين|حاليا|الان|اليوم|امس|زمان|سابقا|كنت|كنا|اذا|لو|بكره|راح|ناوي(?:ه)?|ودي) )/g, '|')
    .replace(/ (?:وما|ولا)(?=\s|اخذ|ياخذ|استخدم|بديت|وقفت|تركت|سويت|رحت|حجزت|فحصت|حللت)/g, '|ما')
    .replace(/ و(?=(?:اخذ|ياخذ|استخدم|يستخدم|نعطي|اعطي|بديت|بدينا|وقفت|وقفنا|تركت|رحت|حجزت|فحصت|حللت)\p{L}*(?: |$))/gu, '|')
    .split('|')).map((part) => part.trim()).filter(Boolean);
  let condition = false;
  let pastContext = false;
  const result: Clause[] = [];
  for (const part of parts) {
    const clause = part.replace(/^~/, '');
    if (part.startsWith('~') && CURRENT.test(clause)) condition = false;
    if (CURRENT.test(clause)) pastContext = false;
    condition ||= CONDITION.test(clause);
    result.push({ text: clause, dependent: condition || FUTURE.test(clause) || REPORTED_INSTRUCTION.test(clause), pastContext });
    pastContext ||= /^(?:ما )?(?:كنت|كنا|كان|كانت) /.test(clause);
  }
  return result;
}

function historical(part: string, kind: QuestionKind): boolean {
  if (kind === 'MED_START') return PRIOR_START.test(part);
  const temporal = kind === 'DOSE_CHECK' ? part.replace(OLD_COMPARISON, '') : part;
  return HISTORICAL.test(temporal) && (!CURRENT.test(temporal) || BACKGROUND.test(temporal));
}

function openStatements(parts: Clause[]): { statements: MedicationStatement[]; unknownUse: boolean } {
  const merged = new Map<string, MedicationStatement>();
  let unknownUse = false;
  let previousMention: MedMention | undefined;
  for (const { text: part, dependent, pastContext } of parts) {
    const mentions = findMedMentions(part);
    const except = /(?:^| )الا(?= |$)/.exec(part);
    const relevant = except && (except.index === 0 || part.slice(0, except.index) === 'لا' || NO_USE.test(part.slice(0, except.index)))
      ? part.slice(except.index).trim() : part;
    const scopedMentions = relevant === part ? mentions : findMedMentions(relevant);
    const affirmative = USE.test(relevant) || relevant.startsWith('الا ');
    const negative = NO_USE.test(relevant);
    const use = dependent ? 'mention' : UNCERTAIN_USE.test(part.replace(NAME_UNCERTAINTY, ' ')) || NEGATED_STOP.test(relevant) ||
      /(?:^| )لا (?=تاخذ|تستخدم|تعطي)/.test(relevant) ||
      (negative && affirmative && !NO_LONGER_USE.test(relevant) && USE.test(relevant.replace(NO_USE, ' ')))
      ? 'uncertain' : pastContext || historical(part, 'OPEN_MEDS') ? 'historical' : negative ? 'not_current' : affirmative ? 'current' : 'mention';
    if (!mentions.length && previousMention && CURRENT.test(part) &&
        /(?:^| )(?:[يتن]?اخذ|[يتن]?استخدم|وقفت|تركت)(?:ه|ها)(?= |$)/.test(part)) {
      scopedMentions.push(previousMention);
    }
    previousMention = !dependent && mentions.length === 1 && mentions[0]?.drugIds.length === 1 ? mentions[0] : undefined;
    if (!scopedMentions.length && use === 'current' && /(?:^| )(?:دوا|دواء|حبوب|حبه|علاج|اعشاب|بخاخ|مسكن)\p{L}*(?= |$)/u.test(relevant)) unknownUse = true;
    for (const mention of scopedMentions) {
      const key = mention.drugIds.length === 1 ? mention.drugIds[0]! : mention.text;
      const previous = merged.get(key);
      const previousCurrent = previous && (previous.use === 'current' || previous.use === 'not_current');
      const current = use === 'current' || use === 'not_current';
      if (previous?.use === 'uncertain' || (previousCurrent && current && previous?.use !== use)) {
        merged.set(key, { ...mention, use: 'uncertain' });
      } else if (!previousCurrent || current || use === 'uncertain') {
        merged.set(key, { ...mention, use });
      }
    }
  }
  return { statements: [...merged.values()], unknownUse };
}

export function parseAnswer(text: string, options: ParseOptions): ParseResult {
  const original = parseCues(text, options);
  const { questionKind: kind, drugId } = options;
  const parts = clauses(text);
  const normalized = normalizeArabic(text);
  const asr = options.asrConfidence ?? 1;
  const unresolved = (reason: string): ParseResult => ({
    ...original, intent: 'UNSURE', confidence: Math.min(original.confidence, UNSURE_CONFIDENCE_CAP), cues: [...original.cues, reason],
  });
  if (kind === 'OPEN_MEDS') {
    const { statements, unknownUse } = openStatements(parts);
    const current = statements.some((s) => s.use === 'current');
    const review = statements.some((s) => s.use === 'mention' || s.use === 'uncertain');
    const negative = statements.some((s) => s.use === 'not_current');
    const intent = current || unknownUse ? 'MENTIONS_MEDS'
      : review ? 'UNSURE' : negative ? 'NONE' : statements.length ? 'UNSURE' : original.intent;
    const assertedUse = current || negative || unknownUse;
    const confidence = intent === 'UNSURE' || (parts.some((p) => p.dependent) && !assertedUse)
      ? Math.min(original.confidence, UNSURE_CONFIDENCE_CAP)
      : assertedUse ? Math.max(original.confidence, round2(0.85 * asr)) : original.confidence;
    return { ...original, intent, confidence, statements, unknownUse };
  }
  const mentions = findMedMentions(normalized);
  const actual = parts.filter((part) => !part.dependent && !part.pastContext).map((part) => part.text);
  if (kind === 'YES_NO') {
    if (mentions.length || USE.test(normalized) || NO_USE.test(normalized) || /(?:^| )(?:الدواء|الدوا|الحبوب|حبه)(?= |$)/.test(normalized)) {
      return unresolved('medication statement does not answer this task');
    }
    if (actual.length === 0 && parts.length) return unresolved('conditional or future task report');
    const targetAction = options.taskType && NONMED_ACTION[options.taskType];
    if (targetAction) {
      const actions = actual.flatMap((part) => {
        const action = targetAction.exec(part);
        if (!action) return [];
        const negated = /(?:^| )(?:ما|مو|مب|لم|لا)\s*$/.test(part.slice(0, action.index));
        return [negated ? 'NO' : 'YES'];
      });
      if (actions.length) {
        const scoped = parseCues(text, options, actual);
        const intent = actions[0] as 'YES' | 'NO';
        if (actual.some((part) => UNCERTAIN_USE.test(part) || PRIOR_START.test(part) ||
            (options.taskType === 'WOUND_CHECK' && historical(part, 'YES_NO'))) ||
            actions.some((action) => action !== intent) ||
            scoped.cues.some((cue) => cue.endsWith(intent === 'YES' ? '→NO' : '→YES'))) {
          return unresolved('uncertain or conflicting task answer');
        }
        return { ...original, intent, confidence: round2(0.85 * asr) };
      }
    }
    if (options.taskType && Object.values(NONMED_ACTION).some((match) => match.test(normalized))) {
      return unresolved('different task action');
    }
    if (options.taskType && /^(?:ما )?تم(?: الحمدلله)?$/.test(normalized)) {
      return { ...original, intent: normalized.startsWith('ما ') ? 'NO' : 'YES', confidence: round2(0.85 * (options.asrConfidence ?? 1)) };
    }
    if (options.taskType && (original.intent === 'YES' || original.intent === 'NO') &&
        normalized.split(' ').some((word) => !(word in YES_WORDS || word in NO_WORDS || FILLERS.has(word) ||
          ['الحمدلله', 'الحمد', 'لله', 'تم', 'للحين', 'بس'].includes(word)))) {
      return unresolved('answer does not describe the requested task');
    }
    return parts.some((p) => p.dependent) ? unresolved('conditional or future task report') : original;
  }
  const resolvePolarity = (result: ParseResult, scopedParts: string[]): ParseResult => {
    const scopedText = scopedParts.join(' # ');
    if (kind !== 'DOSE_CHECK') {
      if (kind === 'MED_CONTINUE' && Object.keys(PARTIAL_PHRASES).some((phrase) => scopedText.includes(phrase)) &&
          !result.cues.some((c) => c.startsWith('unsure:'))) {
        return { ...result, intent: 'NO', confidence: round2(0.8 * (options.asrConfidence ?? 1)) };
      }
      const polarity = kind === 'STOPPED_CHECK' ? ['STOPPED', 'STILL_TAKING'] : ['YES', 'NO'];
      if (polarity.every((intent) => result.cues.some((c) => c.endsWith(`→${intent}`)))) {
        return { ...result, intent: 'UNSURE', confidence: Math.min(result.confidence, UNSURE_CONFIDENCE_CAP) };
      }
      return result;
    }
    const deniesNewDose = /(?:^| )(?:(?:ما|مو|مب|مش|ماني)\s+(?:علي |اخذ(?:ت)? )?|لا اخذ )(?:الجرعه )?الجديده?(?= |$)/;
    const deniesOldDose = /(?:^| )(?:(?:ما|مو|مب|مش|ماني)\s+(?:علي |اخذ(?:ت)? )?|لا اخذ )(?:الجرعه )?القديمه?(?= |$)/;
    const isDoseDescription = /(?:^| )(?:(?:علي|اخذ(?:ت)?|ياخذ) (?:الجرعه )?(?:القديمه?|الجديده?)|(?:اخذ|ياخذ) (?:مثل|زي)|باقي علي نفس الجرعه)(?= |$)|^(?:(?:اي|ايه|نعم) )?(?:الجرعه )?(?:القديمه?|الجديده?)(?: \S+ (?:وحده|وحدات|ملغ|حبه))?$/;
    const isPriorComparison = /(?:^| )علي (?:\S+ ){1,3}(?:وحده|وحدات|ملغ|حبه|الجرعه) (?:مثل|زي) (?:قبل|اول)(?= |$)/;
    const deniesNew = scopedParts.some((part) => deniesNewDose.test(part));
    const doseCues = scopedParts.filter((part) => !deniesNewDose.test(part))
      .map((part) => ({ part, cues: parseCues(part, options).cues.filter((c) => !c.startsWith('yes:') && /→(?:OLD_DOSE|NEW_DOSE)$/.test(c)) }))
      .filter(({ cues }) => cues.length);
    if (scopedParts.some((part) => deniesOldDose.test(part)) ||
        (!deniesNew && doseCues.some(({ part }) => !isDoseDescription.test(part) && !isPriorComparison.test(part)))) {
      return unresolved('dose mentioned without a supported usage description');
    }
    const described = doseCues.filter(({ part }) => isDoseDescription.test(part) || isPriorComparison.test(part));
    const old = described.some(({ cues }) => cues.some((c) => c.endsWith('→OLD_DOSE')));
    const newDose = described.some(({ cues }) => cues.some((c) => c.endsWith('→NEW_DOSE')));
    if ((old || deniesNew) && newDose) return unresolved('conflicting dosage descriptions');
    if (old && !result.cues.some((c) => c.endsWith('→UNSURE') || c.startsWith('unsure:'))) {
      return { ...result, intent: 'OLD_DOSE', confidence: round2(0.8 * (options.asrConfidence ?? 1)) };
    }
    if (deniesNew && !result.cues.some((c) => c.startsWith('unsure:') || c.startsWith('yes:'))) {
      return { ...result, intent: 'NO', confidence: round2(0.85 * (options.asrConfidence ?? 1)) };
    }
    if (deniesNew) return unresolved('conflicting dosage answer');
    return result;
  };
  let scoped = actual;
  if (drugId && mentions.length) {
    const refersToTarget = (part: string) => findMedMentions(part).some((m) => m.drugIds.includes(drugId));
    if (!mentions.some((m) => m.drugIds.includes(drugId))) return unresolved('explicit medication reference does not match this question');
    const matched = scoped.filter(refersToTarget);
    if (matched.some((part) => findMedMentions(part).some((m) => !m.drugIds.includes(drugId)))) {
      return unresolved('multiple medication references in one clause');
    }
    if (mentions.some((m) => !m.drugIds.includes(drugId))) scoped = matched;
  }
  let relevant = scoped.filter((part) => !historical(part, kind));
  if (!relevant.length && kind === 'STOPPED_CHECK' && scoped.length === 1 &&
      /^(?:وقفت|وقفنا|تركت)(?:ه|ها)? (?:\S+ )?امس$/.test(scoped[0]!)) {
    relevant = scoped;
  }
  if (!relevant.length && parts.length) {
    // Preserve the legacy polarity hint for unwillingness, at non-verifying confidence.
    if (kind === 'MED_CONTINUE' && /^ما (?:ابي|ابغي) اوقف/.test(normalized)) {
      return { ...original, confidence: Math.min(original.confidence, UNSURE_CONFIDENCE_CAP) };
    }
    return unresolved(scoped.length ? 'historical report does not establish current use' : 'no asserted event for this medication');
  }
  const target = parseCues(text, options, relevant);
  const historicalMiss = kind === 'MED_CONTINUE' && target.intent === 'YES' && parts.every(({ text: part, dependent }) =>
    !dependent && (relevant.includes(part) || (scoped.includes(part) &&
      /(?:^| )امس(?= |$)/.test(part) && (NO_USE.test(part) || /(?:^| )نسيت(?= |$)/.test(part)))));
  if (relevant.length < parts.length && !historicalMiss && !target.cues.some((cue) => /^(?!yes:|no:).*→/.test(cue))) {
    return unresolved('no supported assertion in the current context');
  }
  return resolvePolarity({ ...target, meds: original.meds, ambiguousMeds: original.ambiguousMeds }, relevant);
}

// ═══ Mapping to evidence ════════════════════════════════════════════════════

export interface ClaimDraft {
  claim: EvidenceClaim;
  confidence: number;
  drugId?: string;
  detail?: string;
  candidateDrugIds?: string[];
}

const lowConfidence = (c: number) => Math.min(c, UNSURE_CONFIDENCE_CAP);

/**
 * Parse → evidence claims for the gap engine.
 * UNSURE / UNKNOWN become an UNSURE claim with low confidence (→ LOW_CONFIDENCE gap).
 */
export function toEvidenceClaim(parse: ParseResult, questionKind: QuestionKind): ClaimDraft[] {
  const { intent, confidence } = parse;
  const candidates = [...new Set(parse.ambiguousMeds.flatMap((m) => m.drugIds))];
  const different = parse.cues.includes('explicit medication reference does not match this question');
  const named = parse.meds.map((id) => DRUGS.find((d) => d.id === id)?.generic).filter(Boolean);
  const unsure: ClaimDraft[] = [{
    claim: 'UNSURE',
    confidence: lowConfidence(confidence),
    ...(candidates.length ? { candidateDrugIds: candidates } : {}),
    ...(different && named.length ? { detail: `Answer mentioned a different medicine: ${named.join(', ')}` } : {}),
  }];
  if (parse.extractionDiscarded) return [];
  if (questionKind !== 'OPEN_MEDS' && confidence < VERIFY_THRESHOLD && intent !== 'NEVER_STARTED') return unsure;

  switch (questionKind) {
    case 'MED_START':
    case 'MED_CONTINUE':
    case 'YES_NO':
      if (intent === 'YES') return [{ claim: 'DONE', confidence }];
      if (intent === 'NO') return [{ claim: 'NOT_DONE', confidence }];
      return unsure;
    case 'STOPPED_CHECK':
      if (intent === 'NEVER_STARTED') return [{ ...unsure[0]!, detail: 'Reported never starting this medicine' }];
      if (intent === 'STOPPED' || intent === 'YES') return [{ claim: 'STOPPED', confidence }];
      if (intent === 'STILL_TAKING' || intent === 'NO') return [{ claim: 'STILL_TAKING', confidence }];
      return unsure;
    case 'DOSE_CHECK':
      if (intent === 'NEW_DOSE' || intent === 'YES') return [{ claim: 'DONE', confidence }];
      if (intent === 'OLD_DOSE') return [{ claim: 'OLD_DOSE', confidence }];
      if (intent === 'NO') return [{ claim: 'NOT_DONE', confidence, detail: 'Reported not using the new dose; actual dose unspecified' }];
      return unsure;
    case 'OPEN_MEDS': {
      if (parse.statements?.length || parse.unknownUse) {
        const drafts = [...(parse.statements ?? [])].sort((a, b) => a.drugIds.length - b.drugIds.length).map((s): ClaimDraft => {
          const known = s.drugIds.length === 1;
          const supported = confidence >= VERIFY_THRESHOLD && known;
          const claim = supported && s.use === 'current' ? 'TAKING_UNLISTED'
            : supported && s.use === 'not_current' ? 'STOPPED' : 'UNSURE';
          const names = s.drugIds.map((id) => DRUGS.find((d) => d.id === id)?.generic ?? id).join(', ');
          return {
            claim, confidence: claim === 'UNSURE' ? lowConfidence(confidence) : confidence,
            ...(known ? { drugId: s.drugIds[0] } : { candidateDrugIds: s.drugIds }),
            ...(!known ? { detail: `«${s.text}» (could be: ${names})` }
              : s.use === 'historical' ? { detail: 'Historical use; current use unspecified' }
                : s.use === 'mention' ? { detail: 'Medicine mentioned; use unspecified' } : {}),
          };
        });
        if (parse.unknownUse) drafts.push({
          claim: confidence >= VERIFY_THRESHOLD ? 'TAKING_UNLISTED' : 'UNSURE',
          confidence,
          detail: 'Unidentified medicine explicitly reported in use',
        });
        return drafts;
      }
      if (intent === 'NONE') return confidence >= VERIFY_THRESHOLD ? [] : unsure;
      return unsure;
    }
  }
}

/** Convenience: build Evidence records from an answer (used by the patient app). */
export function answerToEvidence(
  rawText: string,
  parse: ParseResult,
  args: {
    questionKind: QuestionKind;
    patientId: string;
    taskId?: string;
    expectedDrugId?: string;
    day: number;
    source: EvidenceSource;
    idPrefix: string;
    voice?: Evidence['voice'];
  },
): Evidence[] {
  return toEvidenceClaim(parse, args.questionKind).map((draft, i) => ({
    id: `${args.idPrefix}-${i + 1}`,
    patientId: args.patientId,
    ...(args.questionKind !== 'OPEN_MEDS' && args.taskId ? { taskId: args.taskId } : {}),
    source: args.source,
    day: args.day,
    claim: draft.claim,
    ...(draft.drugId ? { drugId: draft.drugId }
      : draft.claim !== 'UNSURE' && args.expectedDrugId ? { drugId: args.expectedDrugId } : {}),
    ...(draft.detail ? { detail: draft.detail } : {}),
    ...(args.questionKind === 'OPEN_MEDS' ? { reportId: args.idPrefix } : {}),
    ...(draft.candidateDrugIds ? { candidateDrugIds: draft.candidateDrugIds } : {}),
    rawText,
    ...(args.voice ? { voice: args.voice } : {}),
    confidence: draft.confidence,
    confirmedByHuman: false,
  }));
}
