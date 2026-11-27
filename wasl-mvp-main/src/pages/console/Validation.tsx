import { AlertTriangle, CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import results from '../../../validation/results.json';
import { Badge, Card, StatCard } from '../../components/ui';
import { GAP_TYPE_LABEL } from '../../domain/labels';
import type { GapType } from '../../domain/types';

const { summary, gapDetection, focusedGapDetection, parser, questions, safety, external, notTested, disclaimer } = results;

function Section({ id, title, method, limitations, children }: { id: string; title: string; method: string; limitations: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      <p className="max-w-4xl text-sm text-muted">
        <span className="font-medium text-ink-2">Method. </span>
        {method}
      </p>
      {children}
      <p className="max-w-4xl text-sm text-muted">
        <span className="font-medium text-ink-2">Limitations. </span>
        {limitations}
      </p>
    </section>
  );
}

const th = 'px-4 py-2 text-left font-medium';
const td = 'px-4 py-2 tabular-nums';

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-line text-xs text-faint">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, k) => (
                  <td key={k} className={k === 0 ? 'px-4 py-2 text-ink-2' : td}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Validation() {
  const rules = Object.entries(gapDetection.perType).filter(([, rule]) => rule.expected > 0);
  const externalDone = external.status === 'done';

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <Card className="flex items-start gap-3 border-line-strong">
        <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-medium" />
        <p className="text-sm text-ink-2">{disclaimer}</p>
      </Card>

      <section aria-label="Summary" data-tour="validation-summary" className="grid grid-cols-2 gap-4 rounded-xl xl:grid-cols-5">
        <StatCard
          label="Gap recall"
          value={`${summary.gapRecallPct}%`}
          hint={`${gapDetection.truePositives} of ${summary.expectedGaps} injected gaps found`}
          simulated
        />
        <StatCard
          label="False alarms"
          value={summary.falsePositivesOnControls}
          hint={`False positives on ${summary.controls} clean cases, every day 0–14`}
          simulated
        />
        <StatCard
          label="Phase 04B label agreement"
          value={`${summary.parserTestAccuracyPct}%`}
          hint={`Frozen written labels · ${summary.parserSafeFailures} disagreements below 70%; ${summary.parserUnsafe} at or above`}
          simulated
        />
        <StatCard
          label="Fewer questions"
          value={`${summary.questionReductionPct}%`}
          hint={`${questions.adaptivePerPatientDay} vs ${questions.fullScriptPerPatientDay} per patient-day (vs a daily full script)`}
          simulated
        />
        <StatCard label="Safety checks" value={`${summary.safetyPassed} of ${summary.safetyTotal}`} hint="Safety invariants passed (automated tests, any input)" simulated />
      </section>

      <Section
        id="v-gaps"
        title="1 · Gap detection on synthetic scenarios"
        method={gapDetection.method}
        limitations={`${gapDetection.note} Injected gaps are the textbook form of each problem; real cases are messier.`}
      >
        <Table
          caption="Gap detection per gap type"
          head={['Gap type', 'Injected', 'Detected', 'Recall']}
          rows={[
            ...rules.map(([type, rule]) => [GAP_TYPE_LABEL[type as GapType], rule.expected, rule.detected, `${rule.recallPct}%`]),
            ['All gap types', gapDetection.expectedGaps, gapDetection.truePositives, `${gapDetection.recallPct}%`],
          ]}
        />
        <p className="text-sm text-ink-2 tabular-nums">
          Precision {gapDetection.precisionPct}% ({gapDetection.falsePositives} unexpected gaps) · {gapDetection.controlsWithFalsePositives} of {gapDetection.controls} clean
          controls raised a gap over {gapDetection.controlDaysChecked} patient-days · {gapDetection.highRiskRoutedNow} of {gapDetection.highRiskGaps} high-risk gaps routed to a
          clinician now ({gapDetection.highRiskRoutedNowPct}%).
        </p>
        <p className="text-sm text-ink-2 tabular-nums">
          Focused Phase 06 cases · {focusedGapDetection.truePositives} of {focusedGapDetection.expectedGaps} expected gaps · {focusedGapDetection.falsePositives} unexpected gaps.
        </p>
      </Section>

      <Section
        id="v-parser"
        title="2 · Understanding Saudi-dialect answers"
        method={parser.method}
        limitations="A small, team-authored text benchmark. Live transcription and independent interpretation accuracy remain unmeasured."
      >
        <Table
          caption="Phase 04B results per intent on the frozen test split"
          head={['What the speaker meant', 'Precision', 'Recall', 'F1', 'Test items']}
          rows={Object.entries(parser.perIntent).map(([k, m]) => [k.replace(/_/g, ' ').toLowerCase(), m.precision ?? '—', m.recall ?? '—', m.f1 ?? '—', m.support])}
        />
        <p className="text-sm text-ink-2 tabular-nums">
          Phase 04B · Intent {parser.testAccuracyPct}% · difficult subset {parser.hardAccuracyPct}% · exact medicine extraction {parser.medExtractionExactPct}%.
          {' '}{parser.safeFailures} of {parser.wrong} label disagreements below 70%, {parser.unsafe} at or above.
        </p>
        <Table
          caption="Historical evaluation on the same written split"
          head={['Evaluation', 'Intent agreement', 'Difficult subset', 'Exact medicine extraction']}
          rows={parser.history.map(({ phase, intent, difficult, medicine }) => [phase, intent, difficult, medicine])}
        />
        <p className="text-sm text-muted">The frozen dose labels equate a denial with use of the previous dose. The app records an unspecified mismatch when the answer only establishes that the new dose is not in use.</p>
        <ul className="flex flex-col gap-1 text-sm text-muted">
          {parser.wrongItems.map((w) => (
            <li key={w.id}>
              Label disagreement:{' '}
              <span dir="rtl" lang="ar" className="font-arabic text-ink-2">
                «{w.text}»
              </span>{' '}
              — frozen label “{w.expected.replace(/_/g, ' ').toLowerCase()}”, parser output “{w.got.toLowerCase()}” (interpretation confidence {Math.round(w.confidence * 100)}%).
            </li>
          ))}
        </ul>
      </Section>

      <Section id="v-questions" title="3 · Fewer questions for the patient" method={questions.method} limitations={questions.assumption}>
        <Table
          caption="Adaptive versus full-script question counts"
          head={['Script', 'Questions planned', 'Per patient per day']}
          rows={[
            ['WASL adaptive check-in', questions.adaptiveQuestions, questions.adaptivePerPatientDay],
            ['Hypothetical full daily script', questions.fullScriptQuestions, questions.fullScriptPerPatientDay],
            ['Difference', `−${questions.reductionPct}%`, '—'],
          ]}
        />
        <p className="text-sm text-ink-2">The scheduling replay reached {questions.replay.reachedTasks}/{questions.replay.eligibleTasks} eligible tasks, including {questions.replay.reachedHighRiskTasks}/{questions.replay.eligibleHighRiskTasks} high-risk tasks, under one assumed session per day.</p>
      </Section>

      <Section
        id="v-safety"
        title="4 · Safety invariants"
        method="Automated tests that must hold for any input, including 200 rounds of randomised low-confidence evidence. Run by npm run validate."
        limitations="Invariants check the software's own rules. They do not show that those rules are clinically right."
      >
        <ul className="flex flex-col gap-2">
          {safety.invariants.map((i) => (
            <li key={i.name} className="flex items-center gap-2 text-sm">
              {i.passed ? <CheckCircle2 size={16} aria-hidden="true" className="text-success" /> : <XCircle size={16} aria-hidden="true" className="text-high" />}
              <span className="text-ink-2">{i.name}</span>
              <Badge variant={i.passed ? 'verified' : 'high'}>{i.passed ? 'Pass' : 'Fail'}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="v-external"
        title="5 · External real-user check"
        method="People who never saw the parser answer 5 standard questions on WhatsApp, typed or as a voice note transcribed word for word. Answers are anonymised and contain no health data. The frozen parser is run on them once."
        limitations="A small convenience sample. It indicates whether the parser copes with wording the team did not write; it is not a benchmark."
      >
        {externalDone ? (
          <p className="text-sm text-ink-2 tabular-nums">
            {'accuracyPct' in external ? `${String(external.accuracyPct)}% correct on ${external.n} answers.` : `${external.n} answers scored.`}
          </p>
        ) : (
          <Card className="flex items-center gap-3">
            <Hourglass size={18} aria-hidden="true" className="text-muted" />
            <p className="text-sm text-ink-2">Pending: no external answers scored.</p>
          </Card>
        )}
      </Section>

      <Card padding="lg" className="flex flex-col gap-3 border-medium/40">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle size={16} aria-hidden="true" className="text-medium" />
          What we have NOT tested yet
        </h2>
        <ul className="list-disc space-y-1 ps-5 text-sm text-ink-2">
          {notTested.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
