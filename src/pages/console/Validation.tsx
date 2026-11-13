import { AlertTriangle, CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import results from '../../../validation/results.json';
import { Badge, Card, StatCard } from '../../components/ui';
import { GAP_TYPE_LABEL } from '../../domain/labels';
import type { GapType } from '../../domain/types';

const { summary, gapDetection, parser, questions, safety, external, notTested, disclaimer } = results;

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
  const types = Object.keys(gapDetection.perType) as GapType[];
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
          label="Parser accuracy"
          value={`${summary.parserTestAccuracyPct}%`}
          hint={`Held-out test split. ${summary.parserSafeFailures} of ${summary.parserWrong} errors were low-confidence (safe); ${summary.parserUnsafe} unsafe`}
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
            ...types.map((t) => [GAP_TYPE_LABEL[t], gapDetection.perType[t].expected, gapDetection.perType[t].detected, `${gapDetection.perType[t].recallPct}%`]),
            ['All gap types', gapDetection.expectedGaps, gapDetection.truePositives, `${gapDetection.recallPct}%`],
          ]}
        />
        <p className="text-sm text-ink-2 tabular-nums">
          Precision {gapDetection.precisionPct}% ({gapDetection.falsePositives} unexpected gaps) · {gapDetection.controlsWithFalsePositives} of {gapDetection.controls} clean
          controls raised a gap over {gapDetection.controlDaysChecked} patient-days · {gapDetection.highRiskRoutedNow} of {gapDetection.highRiskGaps} high-risk gaps routed to a
          clinician now ({gapDetection.highRiskRoutedNowPct}%).
        </p>
      </Section>

      <Section
        id="v-parser"
        title="2 · Understanding Saudi-dialect answers"
        method={`${parser.counts.total} hand-written answers (${parser.counts.dev} to tune on, ${parser.counts.test} held out). The parser was tuned on the first group only; the held-out group was scored once after the parser was frozen.`}
        limitations="The same team wrote the answers and the parser, so real-world accuracy will be lower. Answers are typed, not recorded speech, and the set is small."
      >
        <Table
          caption="Parser results per intent on the held-out test split"
          head={['What the speaker meant', 'Precision', 'Recall', 'F1', 'Test items']}
          rows={Object.entries(parser.perIntent).map(([k, m]) => [k.replace(/_/g, ' ').toLowerCase(), m.precision ?? '—', m.recall ?? '—', m.f1 ?? '—', m.support])}
        />
        <p className="text-sm text-ink-2 tabular-nums">
          Test accuracy {parser.testAccuracyPct}% ({parser.testCorrect} of {parser.testN}) · hard items {parser.hardAccuracyPct}% · {parser.wrong} wrong, {parser.safeFailures} of
          them low-confidence and therefore sent to a person, {parser.unsafe} unsafe · medicine names matched exactly in {parser.medExtractionExactPct}% of {parser.medExtractionN}{' '}
          items.
        </p>
        <ul className="flex flex-col gap-1 text-sm text-muted">
          {parser.wrongItems.map((w) => (
            <li key={w.id}>
              Missed:{' '}
              <span dir="rtl" lang="ar" className="font-arabic text-ink-2">
                «{w.text}»
              </span>{' '}
              — meant “{w.expected.replace(/_/g, ' ').toLowerCase()}”, understood as “{w.got.toLowerCase()}” (confidence {Math.round(w.confidence * 100)}%, so a person checks it).
            </li>
          ))}
        </ul>
      </Section>

      <Section id="v-questions" title="3 · Fewer questions for the patient" method={questions.method} limitations={questions.assumption}>
        <Table
          caption="Adaptive versus full-script question counts"
          head={['Script', 'Questions asked', 'Per patient per day']}
          rows={[
            ['WASL adaptive check-in', questions.adaptiveQuestions, questions.adaptivePerPatientDay],
            ['Full script, every day', questions.fullScriptQuestions, questions.fullScriptPerPatientDay],
            ['Difference', `−${questions.reductionPct}%`, `≈ ${questions.minutesSavedPerPatientDay} min (assumption)`],
          ]}
        />
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
            <p className="text-sm text-ink-2">Pending: collecting real answers. Nothing has been scored yet.</p>
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
