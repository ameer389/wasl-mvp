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
import type { Evidence, EvidenceClaim, EvidenceSource, QuestionKind } from './types';

export type AnswerIntent =
  | 'YES'
  | 'NO'
  | 'UNSURE'
  | 'STOPPED'
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
  ['نفس الجرعه', 'OLD_ADJ', 0.85], ['مثل ما كنت', 'OLD_ADJ', 0.85], ['زي ما كنت', 'OLD_ADJ', 0.85],
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
  MED_START: START_LIKE,
  MED_CONTINUE: START_LIKE,
  YES_NO: { ...START_LIKE },
  STOPPED_CHECK: {
    STOP: ['STOPPED', 'STILL_TAKING'],
    NO_LONGER: ['STOPPED', 'STILL_TAKING'],
    DONE_WITH: ['STOPPED', null],
    TAKE: ['STILL_TAKING', 'STOPPED'],
    CONTINUE: ['STILL_TAKING', 'STOPPED'],
  },
  DOSE_CHECK: {
    NEW_ADJ: ['NEW_DOSE', 'OLD_DOSE'],
    CHANGE: ['NEW_DOSE', 'OLD_DOSE'],
    INSTRUCTED: ['NEW_DOSE', 'OLD_DOSE'],
    OLD_ADJ: ['OLD_DOSE', 'NEW_DOSE'],
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
  DOSE_CHECK: { yes: 'NEW_DOSE', no: 'OLD_DOSE' },
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

export function parseAnswer(text: string, options: ParseOptions): ParseResult {
  const kind = options.questionKind;
  const normalized = normalizeArabic(text);
  const tokens = normalized.split(' ').filter(Boolean);
  const consumed = new Array<boolean>(tokens.length).fill(false);
  const cues: Cue[] = [];
  const readings = READINGS[kind];
  const weightFor = (key: Category | 'YES_WORD') => KIND_WEIGHT[kind]?.[key] ?? 1;

  const addCategory = (category: Category, weight: number, negated: boolean, label: string) => {
    const reading = readings[category];
    const intent = reading ? reading[negated ? 1 : 0] : null;
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
    if (t === 'لا' && j === 0) return false;
    return NEGATORS.has(t) && !consumed[j];
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
      const intensifier = (token === 'ابد' || token === 'ابدا') && !!next && NEGATORS.has(next);
      const negator = token === 'لا' && i > 0 && isCueToken(next);
      if (negator) return; // left unconsumed so the next cue sees it
      if (!intensifier) cues.push({ intent: answers.no, weight: NO_WORDS[token] as number, label: `no:${token}→${answers.no}` });
      consumed[i] = true;
      return;
    }
    if (NEGATORS.has(token)) return; // read by the cue that follows

    // attached negation: «ماوقفتها», «مابديت»
    let core = token;
    let negated = precededByNegator(i);
    if (core.startsWith('ما') && core.length > 4 && stemCategory(core.slice(2))) {
      core = core.slice(2);
      negated = true;
    }
    // Try the word as-is first: «وقفتها» starts with و but it is the verb, not "and".
    const hit = stemCategory(core) ?? stemCategory(stripConj(core)) ?? stemCategory(stripAl(core));
    if (hit) {
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

// ═══ Mapping to evidence ════════════════════════════════════════════════════

export interface ClaimDraft {
  claim: EvidenceClaim;
  confidence: number;
  drugId?: string;
  detail?: string;
}

const lowConfidence = (c: number) => Math.min(c, UNSURE_CONFIDENCE_CAP);

/**
 * Parse → evidence claims for the gap engine.
 * UNSURE / UNKNOWN become an UNSURE claim with low confidence (→ LOW_CONFIDENCE gap).
 */
export function toEvidenceClaim(parse: ParseResult, questionKind: QuestionKind): ClaimDraft[] {
  const { intent, confidence } = parse;
  const unsure: ClaimDraft[] = [{ claim: 'UNSURE', confidence: lowConfidence(confidence) }];

  switch (questionKind) {
    case 'MED_START':
    case 'MED_CONTINUE':
    case 'YES_NO':
      if (intent === 'YES') return [{ claim: 'DONE', confidence }];
      if (intent === 'NO') return [{ claim: 'NOT_DONE', confidence }];
      return unsure;
    case 'STOPPED_CHECK':
      if (intent === 'STOPPED' || intent === 'YES') return [{ claim: 'STOPPED', confidence }];
      if (intent === 'STILL_TAKING' || intent === 'NO') return [{ claim: 'STILL_TAKING', confidence }];
      return unsure;
    case 'DOSE_CHECK':
      if (intent === 'NEW_DOSE' || intent === 'YES') return [{ claim: 'DONE', confidence }];
      if (intent === 'OLD_DOSE' || intent === 'NO') return [{ claim: 'OLD_DOSE', confidence }];
      return unsure;
    case 'OPEN_MEDS': {
      if (intent === 'NONE') return [];
      if (intent !== 'MENTIONS_MEDS') return unsure;
      const drafts: ClaimDraft[] = parse.meds.map((drugId) => ({ claim: 'TAKING_UNLISTED', confidence, drugId }));
      for (const m of parse.ambiguousMeds) {
        const names = m.drugIds.map((id) => DRUGS.find((d) => d.id === id)?.generic ?? id).join(', ');
        drafts.push({ claim: 'TAKING_UNLISTED', confidence, detail: `«${m.text}» (could be: ${names})` });
      }
      if (drafts.length === 0) drafts.push({ claim: 'TAKING_UNLISTED', confidence, detail: 'Unidentified medicine or herb mentioned' });
      return drafts;
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
    day: number;
    source: EvidenceSource;
    idPrefix: string;
  },
): Evidence[] {
  return toEvidenceClaim(parse, args.questionKind).map((draft, i) => ({
    id: `${args.idPrefix}-${i + 1}`,
    patientId: args.patientId,
    ...(args.questionKind !== 'OPEN_MEDS' && args.taskId ? { taskId: args.taskId } : {}),
    source: args.source,
    day: args.day,
    claim: draft.claim,
    ...(draft.drugId ? { drugId: draft.drugId } : {}),
    ...(draft.detail ? { detail: draft.detail } : {}),
    rawText,
    confidence: draft.confidence,
    confirmedByHuman: false,
  }));
}
