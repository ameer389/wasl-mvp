import { Link } from 'react-router-dom';
import { DEMO_PATIENT_ID, ROUTES, patientCheckinPath } from '../routes';

interface StageCard {
  label: string;
  title: string;
  body: string;
  examples: { text: string; lang?: 'ar' }[];
  tone: 'accent' | 'muted' | 'success';
}

// Illustrative content only (synthetic). No doses or clinical advice.
const STAGES: StageCard[] = [
  {
    label: 'Expected',
    title: 'The discharge plan, made executable',
    body: 'Each instruction becomes a task with an owner, a deadline and a risk level.',
    examples: [
      { text: 'Start new anticoagulant · day 0' },
      { text: 'Stop old home medication · day 0' },
      { text: 'Kidney function lab · by day 5' },
      { text: 'Follow-up clinic visit · by day 7' },
    ],
    tone: 'accent',
  },
  {
    label: 'Home',
    title: 'What really happens at home',
    body: 'Short check-ins in Saudi dialect — voice or big buttons — plus simulated EHR, lab and appointment feeds.',
    examples: [{ text: '«الحبوب الجديدة بديتها، بس المختبر ما رحت له»', lang: 'ar' }, { text: 'Lab feed: no result received' }],
    tone: 'muted',
  },
  {
    label: 'Actual',
    title: 'Only the gaps that need a clinician',
    body: 'Expected vs actual is compared continuously; unresolved gaps are ranked by risk, with evidence and the rule that fired.',
    examples: [{ text: 'HIGH · Kidney lab not done by day 5' }, { text: '3 tasks verified · nothing to ask' }],
    tone: 'success',
  },
];

const TONE_STYLES: Record<StageCard['tone'], string> = {
  accent: 'text-accent border-accent/40',
  muted: 'text-muted border-line',
  success: 'text-success border-success/40',
};

export default function Landing() {
  return (
    <div className="space-y-14">
      <section className="space-y-5 pt-4 text-center sm:pt-10">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
          Close the care loop <span className="text-accent">after discharge.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted sm:text-xl">
          WASL turns discharge instructions into verified recovery actions.
        </p>
      </section>

      <section aria-label="How WASL works: expected, home, actual">
        <ol className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STAGES.map((stage, i) => (
            <li key={stage.label} className="contents">
              <article className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-6">
                <span
                  className={`self-start rounded-full border px-3 py-0.5 text-xs font-bold tracking-widest uppercase ${TONE_STYLES[stage.tone]}`}
                >
                  {stage.label}
                </span>
                <h2 className="text-lg font-semibold">{stage.title}</h2>
                <p className="text-sm text-muted">{stage.body}</p>
                <ul className="mt-auto space-y-2 pt-2">
                  {stage.examples.map((ex) => (
                    <li
                      key={ex.text}
                      lang={ex.lang}
                      dir={ex.lang === 'ar' ? 'rtl' : undefined}
                      className="rounded-lg border border-line bg-bg/60 px-3 py-2 text-sm"
                    >
                      {ex.text}
                    </li>
                  ))}
                </ul>
              </article>
              {i < STAGES.length - 1 && (
                <div aria-hidden="true" className="flex items-center justify-center text-2xl text-accent">
                  <span className="rotate-90 md:rotate-0">→</span>
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-center text-xs text-muted">Illustrative synthetic example.</p>
      </section>

      <section className="flex flex-col items-stretch justify-center gap-4 sm:flex-row">
        <Link
          to={ROUTES.clinicianQueue}
          className="rounded-2xl bg-accent px-8 py-5 text-center text-lg font-bold text-bg transition hover:brightness-110"
        >
          Clinician dashboard
        </Link>
        <Link
          to={patientCheckinPath(DEMO_PATIENT_ID)}
          lang="ar"
          dir="rtl"
          className="rounded-2xl border-2 border-accent px-8 py-5 text-center text-xl font-bold text-accent transition hover:bg-accent/10"
        >
          تطبيق المريض
        </Link>
      </section>
    </div>
  );
}
