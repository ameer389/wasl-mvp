/**
 * npm run eval:external — runs the FROZEN parser once on answers collected from
 * people outside the team (validation/external-utterances.json) and writes
 * validation/external-results.json.
 *
 * Rules: do not change the parser after looking at these answers, and do not
 * re-run to "improve" the number. The script refuses to overwrite a finished
 * result unless called with --force (use only if new answers were added, and say so).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseAnswer, type AnswerIntent } from '../src/domain/arabicParser';
import { VERIFY_THRESHOLD } from '../src/domain/gapEngine';
import type { QuestionKind } from '../src/domain/types';

interface Item {
  id: string;
  questionKind: QuestionKind;
  context?: { drugId?: string };
  text: string;
  expectedIntent: AnswerIntent;
}

const IN = 'validation/external-utterances.json';
const OUT = 'validation/external-results.json';
const { items } = JSON.parse(readFileSync(IN, 'utf8')) as { items: Item[] };

if (items.length === 0) {
  writeFileSync(OUT, JSON.stringify({ status: 'pending', n: 0 }, null, 2) + '\n', 'utf8');
  console.log('No external answers yet — status "pending" written. Add items to validation/external-utterances.json first.');
  process.exit(0);
}

if (existsSync(OUT) && !process.argv.includes('--force')) {
  const previous = JSON.parse(readFileSync(OUT, 'utf8')) as { status: string };
  if (previous.status === 'done') {
    console.error('External results already exist. The frozen parser is meant to run ONCE. Use --force only if new answers were added.');
    process.exit(1);
  }
}

const rows = items.map((it) => {
  const r = parseAnswer(it.text, { questionKind: it.questionKind, drugId: it.context?.drugId });
  return { id: it.id, kind: it.questionKind, text: it.text, expected: it.expectedIntent, got: r.intent, confidence: r.confidence, correct: r.intent === it.expectedIntent };
});
const wrong = rows.filter((r) => !r.correct);
const safe = wrong.filter((r) => r.confidence < VERIFY_THRESHOLD);

const results = {
  status: 'done',
  note: 'Answers from people outside the team; parser frozen before they were seen. Small sample — treat as an indication, not a benchmark.',
  n: rows.length,
  correct: rows.length - wrong.length,
  accuracyPct: Math.round((1000 * (rows.length - wrong.length)) / rows.length) / 10,
  wrong: wrong.length,
  safeFailures: safe.length,
  unsafe: wrong.length - safe.length,
  wrongItems: wrong.map(({ id, kind, text, expected, got, confidence }) => ({ id, kind, text, expected, got, confidence, safe: confidence < VERIFY_THRESHOLD })),
};
writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n', 'utf8');
console.log(`External check: ${results.accuracyPct}% (${results.correct}/${results.n}); wrong ${results.wrong}, safe failures ${results.safeFailures}, unsafe ${results.unsafe}`);
console.log(`Saved ${OUT}. Now run: npm run validate`);
