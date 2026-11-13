import { MessageCircleQuestion, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { daysOpen, latestEvidence } from '../../../domain/metrics';
import { useDemoStore, useQuestionPlan } from '../../../state/store';
import { Card, EmptyState } from '../../ui';
import { EvidenceItem } from '../evidence';
import { GapCard } from './GapCard';
import type { PatientView } from './types';

export function OverviewTab({ view, highlightGapId }: { view: PatientView; highlightGapId?: string }) {
  const { patient, tasks, evidence, gaps, today } = view;
  const { state } = useDemoStore();
  const plan = useQuestionPlan(patient.id);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [flash, setFlash] = useState<string | undefined>(highlightGapId);

  useEffect(() => {
    if (!highlightGapId) return;
    const el = refs.current.get(highlightGapId);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    setFlash(highlightGapId);
    const t = setTimeout(() => setFlash(undefined), 2500);
    return () => clearTimeout(t);
  }, [highlightGapId]);

  const inReview = (gapId: string) => state.resolutions.some((r) => r.gapId === gapId && r.action !== 'RESOLVED');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Open gaps" className="flex min-w-0 flex-col gap-4">
        {gaps.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No open gaps"
            text={`Everything due for ${patient.nameEn} so far is verified or still within its deadline. WASL keeps checking quietly.`}
          />
        ) : (
          gaps.map((g) => (
            <GapCard
              key={g.id}
              ref={(el) => {
                if (el) refs.current.set(g.id, el);
                else refs.current.delete(g.id);
              }}
              gap={g}
              patient={patient}
              tasks={tasks}
              evidence={evidence}
              inReview={inReview(g.id)}
              highlighted={flash === g.id}
              daysOpen={daysOpen(g, today)}
            />
          ))
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion size={16} aria-hidden="true" className="text-muted" />
            <h3 className="text-sm font-semibold">Today&apos;s check-in</h3>
            {plan && (
              <span className="ms-auto text-xs text-muted tabular-nums">
                {plan.questions.length} of {plan.baseline.length} in a full script
              </span>
            )}
          </div>
          {plan ? (
            <ol className="flex flex-col gap-2">
              {plan.questions.map((q, i) => (
                <li key={q.id} className="rounded-lg border border-line bg-bg/40 px-3 py-2">
                  <p dir="rtl" lang="ar" className="font-arabic text-sm text-ink">
                    <span className="text-faint tabular-nums">{i + 1}. </span>
                    {q.textAr}
                  </p>
                  <p className="text-xs text-muted">{q.textEn}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Not discharged yet on this simulated day.</p>
          )}
          <p className="text-xs text-faint">Only what is still uncertain is asked. Simulated.</p>
        </Card>

        <Card className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Latest evidence</h3>
          {evidence.length === 0 ? (
            <p className="text-sm text-muted">Nothing received yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {latestEvidence(evidence, patient.id, today).map((e) => (
                <EvidenceItem key={e.id} evidence={e} />
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}
