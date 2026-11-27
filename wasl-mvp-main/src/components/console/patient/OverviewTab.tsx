import { MessageCircleQuestion, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { daysOpen, latestEvidence } from '../../../domain/metrics';
import { effectiveDecisions, gapObservations } from '../../../domain/gapLifecycle';
import { GAP_TYPE_LABEL, gapSubject } from '../../../domain/labels';
import type { Gap, GapObservation, GapResolution } from '../../../domain/types';
import { useDemoStore, useQuestionPlan } from '../../../state/store';
import { clearanceEvidence } from '../../../state/lifecycle';
import { Button, Card, EmptyState, Field, InfoTip, textareaClasses } from '../../ui';
import { EvidenceItem } from '../evidence';
import { RiskBadge } from '../badges';
import { GapCard } from './GapCard';
import type { PatientView } from './types';

function DispositionRow({ gap, label, disposition, proof, pending }: {
  gap: Gap; label: string; disposition?: GapResolution; proof?: GapObservation['clearance']; pending?: boolean;
}) {
  const store = useDemoStore();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <RiskBadge risk={gap.risk} />
        <h3 className="text-sm font-semibold">{label}</h3>
      </div>
      <p className="text-sm text-muted">
        {pending ? 'Administratively closed. The underlying condition is still present.'
          : proof?.disposition === 'REPORT_CORRECTED' ? 'Condition cleared after a report correction.'
            : proof ? 'Condition cleared with eligible evidence.' : 'The underlying condition is no longer present.'}
      </p>
      {disposition?.note && <p className="text-xs text-muted">{disposition.note}</p>}
      {disposition?.seq !== undefined && (
        <Button size="sm" variant="ghost" onClick={() => store.undoResolution(gap.id, disposition.seq!)}>Undo resolution</Button>
      )}
      {!pending && proof && !disposition && !editing &&
        <Button size="sm" onClick={() => setEditing(true)}>
          {proof.disposition === 'REPORT_CORRECTED' ? 'Document resolution after correction' : 'Document evidence-supported resolution'}
        </Button>}
      {editing && proof && !disposition && (
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          if (!note.trim()) return;
          store.resolveGap(gap.id, 'RESOLVED', { disposition: proof.disposition, note });
          setEditing(false);
          setNote('');
        }}>
          <Field label="Resolution note (required)">
            <textarea className={textareaClasses} rows={2} required value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <Button size="sm" type="submit" disabled={!note.trim()}>Save resolution</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </form>
      )}
    </Card>
  );
}

export function OverviewTab({ view, highlightGapId }: { view: PatientView; highlightGapId?: string }) {
  const { patient, tasks, evidence, gaps, today } = view;
  const { state, evaluation } = useDemoStore();
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

  const current = evaluation.byPatient[patient.id];
  const closed = [...(current?.conditions.values() ?? [])].filter(({ gap }) => current?.lifecycle.get(gap.id)?.disposition);
  const cleared = [...gapObservations(state.audit, state.simulatedDay).values()].flatMap((entry) =>
    entry.action === 'GAP_CONDITION_CLEARED' && entry.observation?.gap.patientId === patient.id &&
    !current?.conditions.has(entry.target) ? [entry.observation] : []);
  const decisions = effectiveDecisions(state.resolutions, today);
  const label = (gap: Gap) => `${GAP_TYPE_LABEL[gap.type]} · ${gapSubject(gap, tasks, patient)}`;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Open gaps" className="flex min-w-0 flex-col gap-4">
        {gaps.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No open gaps"
            text="No actionable gaps are open. Check Expected vs actual for each task’s verification status."
          />
        ) : (
          gaps.map((g) => (
            <GapCard
              key={g.id + (current?.lifecycle.get(g.id)?.fingerprint ?? '') + (current?.lifecycle.get(g.id)?.episodeId ?? '')}
              ref={(el) => {
                if (el) refs.current.set(g.id, el);
                else refs.current.delete(g.id);
              }}
              gap={g}
              patient={patient}
              tasks={tasks}
              evidence={evidence}
              lifecycle={current?.lifecycle.get(g.id)}
              highlighted={flash === g.id}
              daysOpen={daysOpen(g, today)}
            />
          ))
        )}
        {(closed.length > 0 || cleared.length > 0) && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Closed and cleared conditions</h2>
            {closed.map(({ gap }) =>
              <DispositionRow key={gap.id} gap={gap} label={label(gap)} pending disposition={current?.lifecycle.get(gap.id)?.disposition} />)}
            {cleared.map(({ gap, episodeId }) =>
              <DispositionRow key={episodeId} gap={gap} label={label(gap)} proof={current && clearanceEvidence(gap, current)}
                disposition={decisions.filter((r) => r.gapId === gap.id && r.episodeId === episodeId &&
                  r.action === 'RESOLVED' && r.disposition !== 'ADMINISTRATIVE').at(-1)} />)}
          </div>
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
          <h3 className="flex items-center gap-1 text-sm font-semibold">
            Latest evidence
            <InfoTip term="source" align="end" />
            <span className="ms-auto inline-flex items-center gap-1 text-xs font-normal text-muted">
              Confidence
              <InfoTip term="confidence" align="end" />
            </span>
          </h3>
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
