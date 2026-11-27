import { ArrowRight, Database, Eye, ShieldCheck, UserCheck, type LucideIcon } from 'lucide-react';
import { Fragment } from 'react';
import { Badge, Card } from '../../components/ui';

interface Stage {
  label: string;
  title: string;
  body: string;
  examples: { text: string; lang?: 'ar' }[];
}

// Illustrative synthetic content only. No doses or clinical advice.
const STAGES: Stage[] = [
  {
    label: 'Expected',
    title: 'The discharge plan, made executable',
    body: 'Each instruction becomes a task with an owner, a deadline and a risk level.',
    examples: [
      { text: 'New medicine start check · by day 1' },
      { text: 'Stopped medicine check · by day 1' },
      { text: 'Kidney function lab · by day 5' },
      { text: 'Follow-up clinic visit · by day 7' },
    ],
  },
  {
    label: 'Home',
    title: 'Reports from home',
    body: 'Short check-ins in Saudi Arabic using voice, text or quick answers, plus simulated EHR, lab and appointment feeds.',
    examples: [{ text: '«الحبوب الجديدة بديتها، بس المختبر ما رحت له»', lang: 'ar' }, { text: 'Lab feed: no result received' }],
  },
  {
    label: 'Actual',
    title: 'Gaps and their supporting evidence',
    body: 'WASL compares the plan with eligible evidence and ranks open gaps by risk. Each gap explains the rule that fired.',
    examples: [{ text: 'Kidney lab result unavailable after day 5' }, { text: '3 tasks verified · 1 item for review' }],
  },
];

const PRINCIPLES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Eye, title: 'Adaptive check-in', text: 'Eligible unresolved tasks guide what the planner asks the patient.' },
  { icon: UserCheck, title: 'A human decides', text: 'The demo prioritises gaps for clinician review or in-app follow-up. Clinicians document decisions.' },
  { icon: ShieldCheck, title: 'Explainable', text: 'Every gap shows the expected task, the evidence and the rule that fired.' },
  { icon: Database, title: 'Simulated records', text: 'The demo uses synthetic plans, reports and feed records.' },
];

export default function About() {
  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">Close the care loop after discharge.</h2>
        <p className="max-w-3xl text-sm text-muted">
          WASL turns discharge instructions into tasks. It compares the plan with eligible reports and simulated records,
          then surfaces gaps for review or in-app follow-up.
        </p>
      </section>

      <section aria-label="Expected, home, actual">
        <ol className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STAGES.map((stage, i) => (
            <Fragment key={stage.label}>
              <li className="flex min-w-0">
                <Card padding="lg" className="flex w-full flex-col gap-3">
                  <Badge variant="neutral" className="self-start font-semibold tracking-wider uppercase">
                    {stage.label}
                  </Badge>
                  <h3 className="text-sm font-semibold">{stage.title}</h3>
                  <p className="text-sm text-muted">{stage.body}</p>
                  <ul className="mt-auto flex flex-col gap-2 pt-2">
                    {stage.examples.map((ex) => (
                      <li
                        key={ex.text}
                        lang={ex.lang}
                        dir={ex.lang === 'ar' ? 'rtl' : undefined}
                        className="rounded-lg border border-line bg-bg/60 px-3 py-2 text-sm text-ink-2"
                      >
                        {ex.text}
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
              {i < STAGES.length - 1 && (
                <li aria-hidden="true" className="flex items-center justify-center text-faint">
                  <ArrowRight size={20} className="rotate-90 lg:rotate-0" />
                </li>
              )}
            </Fragment>
          ))}
        </ol>
        <p className="mt-2 text-xs text-faint">Illustrative synthetic example.</p>
      </section>

      <section aria-label="Principles" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PRINCIPLES.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="flex flex-col gap-2">
            <Icon size={18} aria-hidden="true" className="text-muted" />
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-sm text-muted">{text}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
