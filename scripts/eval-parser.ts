/**
 * Evaluates the Saudi-dialect parser on validation/utterances.json.
 *
 *   npm run eval:parser              → dev + test report, writes validation/parser-results.json
 *   npm run eval:parser -- --dev-only → dev only (use this while tuning; test stays unseen)
 *
 * "Safe failure" = a wrong answer whose confidence < 0.7: the gap engine will not
 * trust it (LOW_CONFIDENCE → a human checks). "Unsafe" = wrong AND confidence ≥ 0.7.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseAnswer, type AnswerIntent } from '../src/domain/arabicParser';
import { VERIFY_THRESHOLD } from '../src/domain/gapEngine';
import type { QuestionKind } from '../src/domain/types';

interface Item {
  id: string;
  questionKind: QuestionKind;
  context: { drugId?: string };
  text: string;
  expectedIntent: AnswerIntent;
  expectedMeds: string[];
  speaker: string;
  dialect: string;
  tags: string[];
  split: 'dev' | 'test';
}

const DATASET = 'validation/utterances.json';
const OUT = 'validation/parser-results.json';
const devOnly = process.argv.includes('--dev-only');

const { items } = JSON.parse(readFileSync(DATASET, 'utf8')) as { items: Item[] };

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((1000 * n) / d) / 10);
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function evaluateSplit(split: 'dev' | 'test') {
  const rows = items
    .filter((it) => it.split === split)
    .map((it) => {
      const r = parseAnswer(it.text, { questionKind: it.questionKind, drugId: it.context.drugId });
      return {
        item: it,
        got: r.intent,
        meds: r.meds,
        confidence: r.confidence,
        cues: r.cues,
        correct: r.intent === it.expectedIntent,
        medsCorrect: sameSet(r.meds, it.expectedMeds),
      };
    });

  const intents = [...new Set(rows.flatMap((r) => [r.item.expectedIntent, r.got]))].sort();
  const perIntent = Object.fromEntries(
    intents.map((intent) => {
      const tp = rows.filter((r) => r.got === intent && r.item.expectedIntent === intent).length;
      const predicted = rows.filter((r) => r.got === intent).length;
      const support = rows.filter((r) => r.item.expectedIntent === intent).length;
      const precision = predicted ? tp / predicted : null;
      const recall = support ? tp / support : null;
      const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : precision === null || recall === null ? null : 0;
      const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
      return [intent, { precision: r2(precision), recall: r2(recall), f1: r2(f1), support, predicted }];
    }),
  );

  const confusion: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    confusion[r.item.expectedIntent] ??= {};
    const row = confusion[r.item.expectedIntent] as Record<string, number>;
    row[r.got] = (row[r.got] ?? 0) + 1;
  }

  const by = (key: (r: (typeof rows)[number]) => string) => {
    const groups: Record<string, { n: number; correct: number; accuracy: number | null }> = {};
    for (const r of rows) {
      const g = (groups[key(r)] ??= { n: 0, correct: 0, accuracy: null });
      g.n++;
      if (r.correct) g.correct++;
    }
    for (const g of Object.values(groups)) g.accuracy = pct(g.correct, g.n);
    return groups;
  };

  const wrong = rows.filter((r) => !r.correct);
  const safe = wrong.filter((r) => r.confidence < VERIFY_THRESHOLD);
  const withMeds = rows.filter((r) => r.item.expectedMeds.length > 0 || r.meds.length > 0);
  const hard = rows.filter((r) => r.item.tags.includes('hard'));

  return {
    n: rows.length,
    correct: rows.length - wrong.length,
    accuracy: pct(rows.length - wrong.length, rows.length),
    hardAccuracy: pct(hard.filter((r) => r.correct).length, hard.length),
    hardN: hard.length,
    medExtraction: {
      items: withMeds.length,
      exactMatch: pct(withMeds.filter((r) => r.medsCorrect).length, withMeds.length),
      mismatches: withMeds
        .filter((r) => !r.medsCorrect)
        .map((r) => ({ id: r.item.id, text: r.item.text, expected: r.item.expectedMeds, got: r.meds })),
    },
    safeFailure: {
      wrong: wrong.length,
      lowConfidence: safe.length,
      pctOfWrong: pct(safe.length, wrong.length),
      unsafe: wrong.length - safe.length,
    },
    byQuestionKind: by((r) => r.item.questionKind),
    perIntent,
    confusion,
    wrongItems: wrong.map((r) => ({
      id: r.item.id,
      kind: r.item.questionKind,
      text: r.item.text,
      expected: r.item.expectedIntent,
      got: r.got,
      confidence: r.confidence,
      safe: r.confidence < VERIFY_THRESHOLD,
      cues: r.cues,
    })),
  };
}

type Report = ReturnType<typeof evaluateSplit>;

function print(name: string, r: Report) {
  console.log(`\n══ ${name.toUpperCase()} (n=${r.n}) ══`);
  console.log(`accuracy ${r.accuracy}%  (${r.correct}/${r.n})   hard items ${r.hardAccuracy}% (n=${r.hardN})`);
  console.log(`med extraction exact match ${r.medExtraction.exactMatch}% (n=${r.medExtraction.items})`);
  console.log(
    `safe failure: ${r.safeFailure.lowConfidence}/${r.safeFailure.wrong} wrong answers had confidence < ${VERIFY_THRESHOLD} (${r.safeFailure.pctOfWrong}%) · unsafe: ${r.safeFailure.unsafe}`,
  );
  console.log('\nby question kind:');
  for (const [k, g] of Object.entries(r.byQuestionKind)) console.log(`  ${k.padEnd(14)} ${String(g.accuracy).padStart(5)}%  (${g.correct}/${g.n})`);
  console.log('\nper intent:            precision  recall   f1   support');
  for (const [k, m] of Object.entries(r.perIntent)) {
    const f = (x: number | null) => (x === null ? '  —  ' : x.toFixed(2)).padStart(8);
    console.log(`  ${k.padEnd(16)} ${f(m.precision)} ${f(m.recall)} ${f(m.f1)}   ${m.support}`);
  }
  const labels = Object.keys(r.perIntent);
  console.log('\nconfusion (rows = expected, cols = got):');
  console.log('  ' + ''.padEnd(14) + labels.map((l) => l.slice(0, 6).padStart(7)).join(''));
  for (const exp of labels) {
    const row = r.confusion[exp];
    if (!row) continue;
    console.log('  ' + exp.padEnd(14) + labels.map((g) => String(row[g] ?? '·').padStart(7)).join(''));
  }
  console.log('\nmedicine extraction mismatches:');
  for (const m of r.medExtraction.mismatches) {
    console.log(`  ${m.id} «${m.text}»  expected [${m.expected.join(', ')}], got [${m.got.join(', ')}]`);
  }
  console.log('\nwrong items:');
  for (const w of r.wrongItems) {
    console.log(`  ${w.id} [${w.kind}] «${w.text}»  expected ${w.expected}, got ${w.got} (conf ${w.confidence}${w.safe ? ', safe' : ', UNSAFE'})`);
  }
}

const dev = evaluateSplit('dev');
print('dev', dev);

if (devOnly) {
  console.log('\n(--dev-only: test split not evaluated, results file not written)');
} else {
  const test = evaluateSplit('test');
  print('test', test);
  const results = {
    dataset: DATASET,
    note: 'Synthetic dataset; dataset and parser written by the same team. Parser tuned on dev only. Not clinical validation.',
    verifyThreshold: VERIFY_THRESHOLD,
    counts: { total: items.length, dev: dev.n, test: test.n },
    dev,
    test,
  };
  writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n', 'utf8');
  console.log(`\nSaved ${OUT}`);
}
